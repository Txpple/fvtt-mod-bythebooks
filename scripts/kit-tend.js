/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): KIT TENDING (registry KIT_TENDS) — a kit's use on ONE
 * creature in reach, by a listed feature's owner, stamps `kitTend` on the usage card; a popup picks the
 * die size (a Pass leaves the kit's use as it was); the flow elect spends the creature's die and rolls
 * the feature's OWN heal activity of that size at it, so the healing rerolls and cast applier carry the rest.
 */
import { MODULE_ID, readFlag, isActiveGM, queueFlagWrite, canAnswerFor, canApplyTo, drivesMomentFor, statContext, whisperNoGM, decisionWindow, resolveUuid, log, claimLanding, claimHolds } from "./core.js";
import { featureNamed, lower } from "./lookup.js";
import { answers, kitTendEntries, listedNames } from "./decide/registry.js";
import { KIT_TENDS } from "./decide/registry.js";
import { bfCard, esc, holdBarHTML, foldedRuleHTML, tickRowsHTML } from "./decide/present.js";
import { targetsOf } from "./decide/card.js";
import { nearestFeet, tokenOf } from "./geometry.js";
import { withTargets } from "./shared.js";
import { openMomentPopup, armAskTimer, disarmAskTimer, subjectOwns, registerRelay, registerResumable, pendingRow, closePopup, postAnswer, picked, pickInputs } from "./ui.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";
import { closeLedger, landingSteps } from "./ledger.js";

const TEND_FLAG = "kitTend";
const timers = new Map();

/** The listed row whose kit this is, held by the kit's user — `{ name, row, feature }` or null. */
function rowFor(actor, item) {
  const on = listedNames(kitTendEntries());
  for ( const [name, row] of Object.entries(KIT_TENDS) ) {
    if ( !on.has(lower(name)) || !answers(row.kit, item) ) continue;
    const feature = featureNamed(actor, name);
    if ( feature ) return { name, row, feature };
  }
  return null;
}

/** The die size a heal activity rolls — its denomination, or the first die of its custom formula. */
function healDieOf(activity) {
  const h = activity?.healing;
  if ( h?.denomination ) return Number(h.denomination);
  const m = /\d*d(\d+)/i.exec(h?.custom?.formula ?? "");
  return m ? Number(m[1]) : null;
}

/** The feature's own heal activity for a die size, or null. */
const healActivityFor = (feature, faces) =>
  [...(feature?.system?.activities ?? [])].find(a => (a.type === "heal") && (healDieOf(a) === faces)) ?? null;

/** The creature's Hit Point Dice by size — a character's per class item (`hd`), an NPC's from its
 * attributes. `{ key, faces, label, value, max }[]`. */
function hitDiceOf(actor) {
  const classes = Object.values(actor?.classes ?? {});
  if ( classes.length ) {
    return classes.map(c => ({ key: c.id, faces: Number(String(c.system?.hd?.denomination ?? "").replace(/^d/i, "")) || null,
      label: c.name, value: Number(c.system?.hd?.value) || 0, max: Number(c.system?.hd?.max) || 0 }))
      .filter(p => p.faces);
  }
  const hd = actor?.system?.attributes?.hd;
  const faces = Number(String(hd?.denomination ?? "").replace(/^d/i, "")) || null;
  if ( !faces || !Number.isFinite(Number(hd?.max)) ) return [];
  const max = Number(hd.max) || 0;
  return [{ key: "npc", faces, label: actor.name, value: Math.max(0, max - (Number(hd.spent) || 0)), max }];
}

/* --- the moment: the kit's use ------------------------------------------------------------------ */

listen("dnd5e.postUseActivity", "kit-tend", (activity, _usage, results) => {
  try {
    const actor = activity?.actor;
    const found = rowFor(actor, activity?.item);
    const message = results?.message;
    if ( !found || !(message instanceof ChatMessage) ) return;
    // The card's snapshot of the targets, else the using client's live ones.
    const snap = targetsOf(message);
    const targets = snap.length ? snap : [...(game.user?.targets ?? [])].map(t => ({ uuid: t.actor?.uuid ?? null })).filter(t => t.uuid);
    if ( targets.length !== 1 ) return;
    const target = resolveUuid(targets[0].uuid);
    const token = tokenOf(targets[0].uuid);
    const own = tokenOf(actor);
    if ( !(target instanceof Actor) || !token || !own ) return;
    const feet = (own === token) ? 0 : nearestFeet(own, token);
    if ( (feet === null) || (feet > found.row.reach) ) return;
    const pools = hitDiceOf(target).filter(p => healActivityFor(found.feature, p.faces));
    if ( !pools.length ) return;
    const window = decisionWindow();
    void message.setFlag(MODULE_ID, TEND_FLAG, {
      status: "pending", row: found.name, actorUuid: actor.uuid, actorName: actor.name, featureId: found.feature.id,
      targetUuid: target.uuid, targetName: token.name ?? target.name, pools, ...statContext(actor.uuid),
      ...(window ? { window, deadline: Date.now() + (window * 1000) } : {})
    }).catch(err => log.error(`${found.name} could not be offered — use its Heal activity by hand.`, err));
  } catch(err) {
    log.error(`The kit's tending could not be offered — use the feature's Heal activity by hand.`, err);
  }
});

/* --- the answer: the GM folds it, a player sends it ------------------------------------------------ */

const settle = (current, answer, pick, timedOut = false) => {
  if ( current.status !== "pending" ) return false;
  const pool = (current.pools ?? []).find(p => (p.key === pick) && (p.value > 0)) ?? null;
  Object.assign(current, { status: "resolved", answer: (answer === "tend" && pool) ? "tend" : "pass",
    pick: pool?.key ?? null, answeredAt: Date.now(), ...(timedOut ? { timedOut: true } : {}) });
};

async function answerTend(message, answer, pick = null, { timedOut = false } = {}) {
  const flag = readFlag(message, TEND_FLAG);
  if ( flag?.status !== "pending" ) return;
  if ( isActiveGM() || !game.users.activeGM ) {
    await queueFlagWrite(message, TEND_FLAG, current => settle(current, answer, pick, timedOut));
    return;
  }
  await postAnswer("kitTendAnswer", {
    actor: resolveUuid(flag.actorUuid),
    card: "", toElect: true,
    flags: { [MODULE_ID]: { kitTendAnswer: { messageId: message.id, answer, pick } } }
  });
}

registerRelay("kitTendAnswer", {
  flagKey: TEND_FLAG,
  targetOf: a => a.messageId,
  owns: () => isActiveGM(),
  cleanup: true,
  fold: (current, a) => settle(current, a.answer, a.pick)
});

/** The landing, on the flow elect: the target's die spent, then the feature's own heal of that size rolled at it. */
async function landTend(message) {
  if ( !(await claimLanding(message, TEND_FLAG, current => (current.status === "resolved") && (current.answer === "tend"))) ) return;
  const flag = readFlag(message, TEND_FLAG);
  // THE LEDGER (ledger.js): a re-drive over a dead claim spends the die once and rolls the heal once; the heal lands
  // off its roll's own card (cast.js `healPending`, once by its receipt), so the roll's card is the heal's witness.
  const steps = landingSteps(message, TEND_FLAG, "land");
  const record = {};
  try {
    const actor = resolveUuid(flag.actorUuid);
    const target = resolveUuid(flag.targetUuid);
    const pool = (flag.pools ?? []).find(p => p.key === flag.pick);
    const activity = healActivityFor(actor?.items?.get(flag.featureId), pool?.faces);
    const token = tokenOf(flag.targetUuid);
    if ( !(target instanceof Actor) || !pool || !activity || !token ) return;
    // The die first — the rule's order; a client that may not write the creature says so, and rolls anyway.
    if ( canApplyTo(target) ) {
      const cls = (pool.key === "npc") ? null : target.items.get(pool.key);
      const spentOf = () => ((pool.key === "npc") ? (Number(target.system.attributes.hd.spent) || 0) : cls ? (Number(cls.system.hd.spent) || 0) : null);
      // the count spent is read once, onto the plan: a re-drive writes the first drive's count, never one more
      await steps.step("die", {
        plan: () => ({ spent: (spentOf() ?? 0) + 1 }),
        witness: () => spentOf(),
        run: async p => {
          if ( pool.key === "npc" ) await target.update({ "system.attributes.hd.spent": p.spent });
          else if ( cls ) await cls.update({ "system.hd.spent": p.spent });
        }
      });
      record.spent = true;
    } else {
      // a notice on this client, not a consequence: a re-drive may say it again
      await whisperNoGM(`${flag.targetName}'s d${pool.faces} Hit Point Die`, "Spend it on the sheet by hand.");
    }
    /** @param {string} name */
    const flags = name => foundry.utils.mergeObject({ [MODULE_ID]: { kitTendFor: message.id } }, steps.stamp(name));
    await withTargets([token], async () => {
      await steps.step("use", {
        witness: () => steps.made(game.messages, "use"),
        run: async () => { await activity.use({ subsequentActions: false }, { configure: false }, { data: { flags: flags("use") } }); }
      });
      await steps.step("roll", {
        witness: () => steps.made(game.messages, "roll"),
        run: async () => { await activity.rollDamage({}, { configure: false }, { data: { flags: flags("roll") } }); }
      });
    });
    record.faces = pool.faces;
  } catch(err) {
    log.error(`${flag.row}'s tending failed — spend the die and use its Heal activity by hand.`, err);
  } finally {
    await queueFlagWrite(message, TEND_FLAG, current => { Object.assign(current, record, { applied: true, applying: false }); closeLedger(current, "land"); });
  }
}

registerResumable(TEND_FLAG, {
  pending: flag => (flag?.status === "resolved") && (flag.answer === "tend") && !flag.applied && !claimHolds(flag.applying),
  drives: flag => drivesMomentFor(flag?.actorUuid ?? null),
  drive: landTend
});

/* --- the clock: Pass, on whoever drives the owner's moments ---------------------------------------- */

function armTimer(message) {
  armAskTimer(timers, message, TEND_FLAG, live => answerTend(live, "pass", null, { timedOut: true }), { owns: subjectOwns(f => f.actorUuid) });
}

/* --- the popup and the card -------------------------------------------------------------------------- */

async function showTendPopup(message) {
  const flag = readFlag(message, TEND_FLAG);
  if ( flag?.status !== "pending" ) return;
  const actor = resolveUuid(flag.actorUuid);
  if ( !actor ) return;
  const row = KIT_TENDS[flag.row] ?? null;
  const feature = actor.items.get(flag.featureId);
  const prof = Number(actor.system?.attributes?.prof) || 0;
    // One row per size, one tick at a time; a size with no die left stays, greyed, its reason as the tag.
  const rows = (flag.pools ?? []).map(p => ({ key: p.key, name: `d${p.faces}`, dice: `${p.label} · 1d${p.faces} + ${prof}`,
    tag: `${p.value} of ${p.max} left`, off: (p.value > 0) ? null : "no Hit Dice left" }));
  const dialog = await openMomentPopup(message, TEND_FLAG, actor, {
    title: `${flag.row} — ${flag.actorName}`, icon: "fa-solid fa-kit-medical", width: 420,
    content: bfCard({ img: feature?.img ?? null, eyebrow: `Battle Medic — ${flag.row}`, tone: "pending",
      title: `Tend ${flag.targetName}?`,
      subtitle: `spend one of ${flag.targetName}'s Hit Point Dice · you roll it + ${prof}`,
      lines: [row?.rule ? foldedRuleHTML(row.rule) : ""] })
      + tickRowsHTML({ name: "bf-kit-tend", rows }) + holdBarHTML(flag, "to answer"),
    buttons: [
      { action: "tend", label: "Tend", callback: (_event, button) => {
        const pick = picked(button.form, "bf-kit-tend");
        void answerTend(message, pick ? "tend" : "pass", pick);
      } },
      { action: "pass", label: "Pass", callback: () => { void answerTend(message, "pass"); } }
    ]
  });
  // Tend is live once a size is ticked; the largest die with one left starts ticked.
  const form = dialog?.element?.querySelector?.("form") ?? dialog?.element ?? null;
  const tend = form?.querySelector?.('button[data-action="tend"]');
  const boxes = pickInputs(form, "bf-kit-tend");
  if ( !tend ) return;
  const best = [...(flag.pools ?? [])].filter(p => p.value > 0).sort((a, b) => b.faces - a.faces)[0];
  for ( const b of boxes ) b.checked = (b.value === best?.key);
  const follow = ev => {
    if ( ev?.target?.checked ) for ( const b of boxes ) if ( b !== ev.target ) b.checked = false;
    tend.disabled = !boxes.some(b => b.checked);
  };
  for ( const b of boxes ) b.addEventListener("change", follow);
  follow();
}

/** The card's line — what was done, or that it waits. */
function tendLine(flag) {
  const pool = (flag.pools ?? []).find(p => p.key === flag.pick);
  if ( flag.answer === "tend" ) return flag.applied
    ? `${flag.row} — ${flag.targetName} spends a d${pool?.faces ?? "?"} Hit Point Die${flag.spent ? "" : " (by hand)"}; ${flag.actorName} rolls it`
    : `${flag.row} — tending ${flag.targetName} with a d${pool?.faces ?? "?"}…`;
  if ( flag.answer === "pass" ) return `${flag.row} — not used${flag.timedOut ? " (the clock ran out)" : ""}`;
  return `${flag.row} — tend ${flag.targetName} with one of their Hit Point Dice?`;
}

listen("dnd5e.renderChatMessage", "kit-tend", (message, html) => {
  try {
    const flag = readFlag(message, TEND_FLAG);
    if ( !flag ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-kit-tend-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-kit-tend-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = `<i class="fa-solid fa-kit-medical"></i> ${esc(tendLine(flag))}`;
    if ( flag.status === "pending" ) {
      const may = canAnswerFor(resolveUuid(flag.actorUuid));
      pendingRow(message, div, {
        bar: holdBarHTML(flag, "to answer"),
        latch: may && { sub: TEND_FLAG, show: () => showTendPopup(message) },
        answer: may && "Answer",
        arm: armTimer
      });
    }
    content.appendChild(div);
  } catch(err) { log.warn(`The kit-tend line could not render.`, err); }
});

// An answer anywhere closes the popup everywhere (law 4); the clock stands down with it.
listen("updateChatMessage", "kit-tend", message => {
  const flag = readFlag(message, TEND_FLAG);
  if ( !flag ) return;
  if ( flag.status === "pending" ) { armTimer(message); return; }
  disarmAskTimer(timers, message.id);
  void closePopup(message, TEND_FLAG);
});

listen("deleteChatMessage", "kit-tend", message => { disarmAskTimer(timers, message.id); });
