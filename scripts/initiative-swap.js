/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): THE INITIATIVE SWAP — trade the owner's Initiative
 * with a willing ally's once all have rolled; the owner's pick stands for the ally's willingness.
 * The GM posts one card per listed, non-Incapacitated owner per roll; the clock answers No. The
 * tracker is the GM's: a player's answer relays, and the swap reads both LIVE numbers.
 */
import { MODULE_ID, readFlag, isActiveGM, queueFlagWrite, canAnswerFor, statContext, decisionWindow, resolveUuid, log, claimLanding, claimHolds } from "./core.js";
import { featureNamed, itemNamed, lower } from "./lookup.js";
import { initiativeSwapEntries, listedNames } from "./decide/registry.js";
import { INITIATIVE_SWAPS } from "./decide/registry.js";
import { bfCard, esc, holdBarHTML, foldedRuleHTML, pickInputHTML } from "./decide/present.js";
import { dispositionStyle } from "./shared.js";
import { openMomentPopup, armAskTimer, disarmAskTimer, subjectOwns, registerRelay, registerResumable, pendingRow, closePopup, postCard, postAnswer, picked, pickInputAt } from "./ui.js";
import { SURFACES } from "./surfaces.js";
import { listen, listenOnce } from "./dispatch.js";
import { tokenOf } from "./geometry.js";
import { closeLedger, landingSteps } from "./ledger.js";

const SWAP_FLAG = "initiativeSwap";
/** The combat's own latch — which combatants were already asked (once per combat). */
const ASKED_FLAG = "initiativeSwapAsked";
const timers = new Map();
/** Combats this client is posting for right now — the updates of one Roll All land in one tick. */
const posting = new Set();

/** The listed swap row this actor holds — `{ name, row, item }` or null. */
function rowFor(actor) {
  const on = listedNames(initiativeSwapEntries());
  for ( const [name, row] of Object.entries(INITIATIVE_SWAPS) ) {
    if ( !on.has(lower(name)) ) continue;
    const item = featureNamed(actor, name);
    if ( item ) return { name, row, item };
  }
  return null;
}

/** Incapacitated, or any condition that implies it (the status set includes those). */
const incapacitated = actor => !!actor?.statuses?.has?.("incapacitated");

/* --- the moment: the last Initiative lands --------------------------------------------------------- */

listen("updateCombatant", "initiative-swap", (combatant, changes) => {
  if ( !("initiative" in (changes ?? {})) || !isActiveGM() ) return;
  const combat = combatant.parent;
  if ( !combat ) return;
  // A cleared Initiative re-arms the latch: the next roll asks again. A changed number asks nothing.
  if ( changes.initiative === null ) { rearm(combat); return; }
  void askFor(combat);
});

// ⚠ The tracker's "Reset Initiative" is ONE Combat update (Combat#resetAll), not a combatant
// update: no updateCombatant fires, so the re-arm reads the combat's update too.
listen("updateCombat", "initiative-swap", (combat, changes) => {
  if ( !("combatants" in (changes ?? {})) || !isActiveGM() ) return;
  rearm(combat);
});

/** Drop the latch of every asked holder whose Initiative is cleared — its next roll asks again. */
function rearm(combat) {
  const asked = readFlag(combat, ASKED_FLAG) ?? {};
  const cleared = Object.keys(asked).filter(id => {
    const c = combat.combatants.get(id);
    return c && ((c.initiative === null) || (c.initiative === undefined));
  });
  if ( !cleared.length ) return;
  void combat.update(Object.fromEntries(cleared.map(id => [`flags.${MODULE_ID}.${ASKED_FLAG}.-=${id}`, null])))
    .catch(err => log.error(`The initiative swap could not re-arm — swap by hand.`, err));
}

async function askFor(combat) {
  if ( posting.has(combat.id) ) return;
  const combatants = [...combat.combatants];
  if ( !combatants.length || combatants.some(c => (c.initiative === null) || (c.initiative === undefined)) ) return;
  posting.add(combat.id);
  try {
    const asked = { ...(readFlag(combat, ASKED_FLAG) ?? {}) };
    for ( const c of combatants ) {
      if ( asked[c.id] ) continue;
      const actor = c.actor;
      const found = rowFor(actor);
      if ( !found ) continue;
      asked[c.id] = true;   // once per combat, asked or not
      if ( incapacitated(actor) ) continue;
      const side = c.token?.disposition ?? null;
      const allies = combatants
        .filter(o => (o.id !== c.id) && (o.token?.disposition === side) && o.actor && !incapacitated(o.actor))
        .map(o => ({ combatantId: o.id, name: o.name, initiative: o.initiative, uuid: o.actor.uuid, tokenId: o.tokenId ?? null }))
        .sort((a, b) => b.initiative - a.initiative);
      if ( !allies.length ) continue;
      // The lineup: every combatant the tracker shows, in Initiative order, with its side; only allies are pickable.
      const pickable = new Set(allies.map(a => a.combatantId));
      const NEUTRAL = CONST.TOKEN_DISPOSITIONS?.NEUTRAL ?? 0;
      const lineup = combatants
        .filter(o => (o.id === c.id) || !o.hidden)
        .sort((a, b) => b.initiative - a.initiative)
        .map(o => ({ combatantId: o.id, name: o.name, initiative: o.initiative, tokenId: o.tokenId ?? null,
          img: o.token?.texture?.src ?? o.img ?? null,
          role: (o.id === c.id) ? "self" : pickable.has(o.id) ? "ally"
            : (o.token?.disposition === side) ? "incapacitated"
            : (o.token?.disposition === NEUTRAL) ? "neutral" : "enemy" }));
      const window = decisionWindow();
      await postCard({
        actor, token: c.token,
        card: bfCard({ img: found.item.img, eyebrow: `Feat — ${found.name}`, tone: "pending", title: `${found.name} — swap Initiative?` }),
        flags: { [MODULE_ID]: { [SWAP_FLAG]: {
          status: "pending", row: found.name, actorUuid: actor.uuid, actorName: c.name,
          combatId: combat.id, combatantId: c.id, initiative: c.initiative, allies, lineup, ...statContext(actor.uuid),
          ...(window ? { window, deadline: Date.now() + (window * 1000) } : {})
        } } }
      });
    }
    await combat.setFlag(MODULE_ID, ASKED_FLAG, asked);
  } catch(err) {
    log.error(`The initiative swap could not be asked — swap by hand.`, err);
  } finally {
    posting.delete(combat.id);
  }
}

/* --- the answer: the GM folds it, a player sends it ------------------------------------------------ */

const settle = (current, answer, pick, timedOut = false) => {
  if ( current.status !== "pending" ) return false;
  const ally = (current.allies ?? []).find(a => a.combatantId === pick) ?? null;
  Object.assign(current, { status: "resolved", answer: (answer === "swap" && ally) ? "swap" : "no",
    pick: ally?.combatantId ?? null, answeredAt: Date.now(), ...(timedOut ? { timedOut: true } : {}) });
};

async function answerSwap(message, answer, pick = null, { timedOut = false } = {}) {
  const flag = readFlag(message, SWAP_FLAG);
  if ( flag?.status !== "pending" ) return;
  if ( isActiveGM() ) {
    await queueFlagWrite(message, SWAP_FLAG, current => settle(current, answer, pick, timedOut));
    return;
  }
  await postAnswer("initiativeSwapAnswer", {
    noGM: `${flag.row}: a GM must be on to swap Initiative — swap it in the tracker by hand.`,
    actor: resolveUuid(flag.actorUuid),
    card: "", toElect: true,
    flags: { [MODULE_ID]: { initiativeSwapAnswer: { messageId: message.id, answer, pick } } }
  });
}

registerRelay("initiativeSwapAnswer", {
  flagKey: SWAP_FLAG,
  targetOf: a => a.messageId,
  owns: () => isActiveGM(),
  cleanup: true,
  fold: (current, a) => settle(current, a.answer, a.pick)
});

/** The elect lands a Swap: the two combatants' LIVE Initiatives exchanged in one tracker write. */
async function landSwap(message) {
  if ( !(await claimLanding(message, SWAP_FLAG, current => (current.status === "resolved") && (current.answer === "swap"))) ) return;
  const flag = readFlag(message, SWAP_FLAG);
  // THE LEDGER (ledger.js): the two numbers are read once, onto the plan, so a re-drive over a dead claim writes the
  // first drive's swap and never swaps them back.
  const steps = landingSteps(message, SWAP_FLAG, "land");
  const record = {};
  try {
    const combat = game.combats.get(flag.combatId);
    const own = combat?.combatants.get(flag.combatantId);
    const ally = combat?.combatants.get(flag.pick);
    if ( own && ally && (own.initiative !== null) && (ally.initiative !== null) ) {
      const swap = await steps.step("swap", {
        plan: () => ({ from: own.initiative, to: ally.initiative, allyName: ally.name }),
        witness: () => [own.initiative ?? null, ally.initiative ?? null],
        run: async p => {
          await combat.updateEmbeddedDocuments("Combatant", [{ _id: own.id, initiative: p.to }, { _id: ally.id, initiative: p.from }]);
        }
      });
      Object.assign(record, swap.plan);
    }
  } catch(err) {
    log.error(`${flag.row}'s swap failed — swap it in the tracker by hand.`, err);
  } finally {
    await queueFlagWrite(message, SWAP_FLAG, current => { Object.assign(current, record, { applied: true, applying: false }); closeLedger(current, "land"); });
  }
}

registerResumable(SWAP_FLAG, {
  pending: flag => (flag?.status === "resolved") && (flag.answer === "swap") && !flag.applied && !claimHolds(flag.applying),
  drives: () => isActiveGM(),
  drive: landSwap
});

/* --- the clock: No, on whoever drives the owner's moments ------------------------------------------ */

function armTimer(message) {
  armAskTimer(timers, message, SWAP_FLAG, live => answerSwap(live, "no", null, { timedOut: true }), { owns: subjectOwns(f => f.actorUuid) });
}

/* --- the popup and the card -------------------------------------------------------------------------- */

async function showSwapPopup(message) {
  const flag = readFlag(message, SWAP_FLAG);
  if ( flag?.status !== "pending" ) return;
  const actor = resolveUuid(flag.actorUuid);
  if ( !actor ) return;
  const row = INITIATIVE_SWAPS[flag.row] ?? null;
  // The lineup, in the target list's shape (shared.js `dispositionStyle`): allies are the radios,
  // the rest shown for context; a pick previews the two traded numbers.
  const lineup = flag.lineup ?? (flag.allies ?? []).map(a => ({ ...a, role: "ally" }));
  const rows = lineup.map((a, i) => {
    const pick = a.role === "ally";
    const cue = dispositionStyle(tokenOf(a.tokenId));
    const word = (a.role === "self") ? "(you)" : (a.role === "incapacitated") ? "Incapacitated" : cue.label;
    // One grid for every row (an empty radio slot where none), so portraits and numbers line up.
    const style = "display:grid;grid-template-columns:1.2rem 1.4rem 32px minmax(0,1fr) auto 2rem 2.8rem;gap:0.5rem;align-items:center;"
      + "margin:2px 0;padding:0.2rem 0.4rem;border-radius:4px;"
      + (pick ? "cursor:pointer;background:rgba(0,0,0,0.06);" : "") + ((a.role === "incapacitated") ? "opacity:0.55;" : "");
    const radio = pick
      ? pickInputHTML({ kind: "radio", name: "bf-initiative-swap", value: a.combatantId, data: { token: a.tokenId ?? "" }, style: "margin:0;justify-self:center;" })
      : "<span></span>";
    const portrait = a.img
      ? `<img src="${esc(a.img)}" alt="${esc(cue.label)}" class="gold-icon" style="width:32px;height:32px;object-fit:cover;border-radius:4px;border:2px solid ${cue.color};box-sizing:border-box;">`
      : `<i class="${cue.icon}" style="width:32px;text-align:center;color:${cue.color};"></i>`;
    const tag = pick ? "label" : "div";
    return `<${tag} data-bf-initiative-row="${esc(a.role)}" data-combatant="${esc(a.combatantId)}" data-initiative="${esc(a.initiative)}" style="${style}">
      <span style="text-align:right;opacity:0.6;font-size:var(--font-size-11,11px);">${i + 1}</span>${radio}${portrait}
      <span style="font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.name)}</span>
      <span style="opacity:0.7;font-size:0.9em;color:${(a.role === "self" || a.role === "incapacitated") ? "inherit" : cue.color};">${esc(word)}</span>
      <strong style="font-size:1.15em;text-align:right;">${esc(a.initiative)}</strong><span data-bf-initiative-after style="font-weight:bold;white-space:nowrap;"></span></${tag}>`;
  }).join("");
  const dialog = await openMomentPopup(message, SWAP_FLAG, actor, {
    title: `${flag.row} — ${flag.actorName}`, icon: "fa-solid fa-right-left", width: 400,
    content: bfCard({ img: itemNamed(actor, flag.row)?.img ?? null,
      eyebrow: `Feat — ${flag.row}`, tone: "pending",
      title: `${flag.row} — swap your Initiative (${flag.initiative})?`,
      subtitle: "pick one ally",
      lines: [row?.rule ? foldedRuleHTML(row.rule) : ""] })
      + `<div data-bf-initiative-swap style="margin:0.4rem 0;">${rows}</div>` + holdBarHTML(flag, "to answer"),
    buttons: [
      { action: "swap", label: "Swap", default: true, callback: (_event, button) => {
        const pick = picked(button.form, "bf-initiative-swap");
        void answerSwap(message, pick ? "swap" : "no", pick);
      } },
      { action: "no", label: "No", callback: () => { void answerSwap(message, "no"); } }
    ]
  });
  const form = dialog?.element?.querySelector?.("form") ?? dialog?.element ?? null;
  const swap = form?.querySelector?.('button[data-action="swap"]');
  if ( swap ) swap.disabled = true;
}

// A pick pings its creature's token and lights Swap (one listener for every popup).
listenOnce("ready", "initiative-swap", () => document.addEventListener("change", ev => {
  const input = pickInputAt(ev.target, "bf-initiative-swap");
  if ( !input ) return;
  const tok = tokenOf(input.dataset.token);
  if ( tok ) { try { canvas.ping(tok.center); } catch { /* no canvas to ping */ } }
  const list = input.closest("[data-bf-initiative-swap]");
  const self = list?.querySelector('[data-bf-initiative-row="self"]');
  const picked = input.closest("[data-bf-initiative-row]");
  for ( const after of list?.querySelectorAll("[data-bf-initiative-after]") ?? [] ) after.textContent = "";
  if ( self && picked ) {
    self.querySelector("[data-bf-initiative-after]").textContent = `→ ${picked.dataset.initiative}`;
    picked.querySelector("[data-bf-initiative-after]").textContent = `→ ${self.dataset.initiative}`;
  }
  const swap = input.closest("form")?.querySelector?.('button[data-action="swap"]');
  if ( swap ) swap.disabled = false;
}));

/** The card's line — what was done, or that it waits. */
function swapLine(flag) {
  const ally = (flag.allies ?? []).find(a => a.combatantId === flag.pick);
  if ( flag.answer === "swap" ) return flag.applied
    ? `${flag.actorName} swaps Initiative with ${flag.allyName ?? ally?.name ?? "an ally"}: ${flag.from ?? flag.initiative} ↔ ${flag.to ?? ally?.initiative ?? "?"}`
    : `swapping with ${ally?.name ?? "an ally"}…`;
  if ( flag.answer === "no" ) return `${flag.row} — no swap${flag.timedOut ? " (timer)" : ""}`;
  return `asking ${flag.actorName} about a swap (Initiative ${flag.initiative})`;
}

listen("dnd5e.renderChatMessage", "initiative-swap", (message, html) => {
  try {
    const flag = readFlag(message, SWAP_FLAG);
    if ( !flag ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-initiative-swap-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-initiative-swap-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = `<i class="fa-solid fa-right-left" data-tooltip="${esc(flag.row)}"></i> ${esc(swapLine(flag))}`;
    if ( flag.status === "pending" ) {
      const may = canAnswerFor(resolveUuid(flag.actorUuid));
      pendingRow(message, div, {
        bar: holdBarHTML(flag, "to answer"),
        latch: may && { sub: SWAP_FLAG, show: () => showSwapPopup(message) },
        answer: may && "Answer",
        arm: armTimer
      });
    }
    content.appendChild(div);
  } catch(err) { log.warn(`The initiative-swap line could not render.`, err); }
});

// An answer anywhere closes the popup everywhere (law 4); the clock stands down with it.
listen("updateChatMessage", "initiative-swap", message => {
  const flag = readFlag(message, SWAP_FLAG);
  if ( !flag ) return;
  if ( flag.status === "pending" ) { armTimer(message); return; }
  disarmAskTimer(timers, message.id);
  void closePopup(message, SWAP_FLAG);
  floatSwap(message, flag);
});

/** Once the swap lands, every client floats "Initiative 11 → 17" over both tokens. Live updates only. */
const floated = new Set();
function floatSwap(message, flag) {
  if ( (flag.answer !== "swap") || !flag.applied || !Number.isFinite(flag.from) || !Number.isFinite(flag.to) ) return;
  if ( floated.has(message.id) ) return;
  floated.add(message.id);
  try {
    const combat = game.combats.get(flag.combatId);
    const float = (combatantId, from, to) => {
      const token = combat?.combatants.get(combatantId)?.token?.object;
      if ( !token?.visible || !canvas?.interface?.createScrollingText ) return;
      canvas.interface.createScrollingText(token.center, `Initiative ${from} → ${to}`, {
        anchor: CONST.TEXT_ANCHOR_POINTS.TOP, fill: "#ffffff", stroke: 0x000000, strokeThickness: 4,
        fontSize: 28, jitter: 0.25, duration: 3000
      });
    };
    float(flag.combatantId, flag.from, flag.to);
    float(flag.pick, flag.to, flag.from);
  } catch(err) { log.warn(`The initiative swap's floating text could not draw.`, err); }
}

listen("deleteChatMessage", "initiative-swap", message => { disarmAskTimer(timers, message.id); });
