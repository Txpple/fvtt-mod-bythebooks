/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): THE INITIATIVE GRANTS (INITIATIVE_GRANTS — Persistent Rage, Uncanny
 * Metabolism). As a combatant's Initiative lands (the swap's seam, initiative-swap.js), the GM reads its listed
 * features once per combat: a plain row simply happens (R1) — its item's expended uses back, the feature's own use
 * spent, a card; an `ask` row is OFFERED to the owner (the use is theirs to keep) and the clock answers No. The
 * sheet writes are the GM's; a player's answer relays.
 */
import { MODULE_ID, readFlag, isActiveGM, queueFlagWrite, canAnswerFor, statContext, decisionWindow, resolveUuid, log, claimLanding, claimHolds } from "./core.js";
import { activityNamed, featureNamed, lower } from "./lookup.js";
import { poolOf, spendPoolUses } from "./shared.js";
import { nearestFeet, tokenOf } from "./geometry.js";
import { INITIATIVE_GRANTS, initiativeGrantEntries, listedNames } from "./decide/registry.js";
import { ceilingRegain, grantRegain, initiativeGrantDue, initiativeGrantLine } from "./decide/initiative-grants.js";
import { riderPartFormula } from "./decide/clock.js";
import { bfCard, esc, holdBarHTML, foldedRuleHTML } from "./decide/present.js";
import { openMomentPopup, armAskTimer, disarmAskTimer, subjectOwns, registerRelay, registerResumable, pendingRow, closePopup, postCard, postAnswer } from "./ui.js";
import { applyDamagesWithReceipt } from "./auto-apply.js";
import { closeLedger, hitPointsOf, landingSteps } from "./ledger.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";

const INITIATIVE_GRANT_FLAG = "initiativeGrant";
/** The combat's own latch — which combatant has been read for which row (once per combat). */
const INITIATIVE_READ_FLAG = "initiativeGrantRead";
/** B4 — the combat's own note of a bonus DUE to combatants who had not rolled when a `to: "allies"` grant landed. */
const BONUS_DUE_FLAG = "initiativeBonusDue";
const timers = new Map();

const usesOf = item => ({ value: Number(item?.system?.uses?.value ?? 0), max: Number(item?.system?.uses?.max ?? 0),
  spent: Number(item?.system?.uses?.spent ?? 0) });

/** The heal activity's amount as a formula resolved on the owner's sheet ("1d8 + 5"), or null. */
function healFormulaOf(actor, activity) {
  const h = activity?.healing;
  const raw = h ? riderPartFormula({ number: h.number, denomination: h.denomination, custom: h.custom, bonus: h.bonus }) : null;
  try {
    const resolved = raw ? Roll.replaceFormulaData(raw, actor.getRollData()) : null;
    return (resolved && Roll.validate(resolved)) ? resolved : null;
  } catch { return null; }
}

/** The listed rows this actor's sheet holds, each with what it would do now. */
function grantsFor(actor, combatant = null) {
  const on = listedNames(initiativeGrantEntries());
  const out = [];
  for ( const [name, row] of Object.entries(INITIATIVE_GRANTS) ) {
    if ( !on.has(lower(name)) ) continue;
    const item = featureNamed(actor, name);
    if ( !item ) continue;
    // B4 — a `to: "allies"` row: the activity's roll on the owner's numbers, its consumption the pool (a use must stand).
    if ( row.to === "allies" ) {
      const activity = row.activity ? activityNamed(item, row.activity) : null;
      const pool = activity ? (poolOf(actor, activity) ?? item) : null;
      let formula = null;
      try { formula = activity?.roll?.formula ? Roll.replaceFormulaData(String(activity.roll.formula), actor.getRollData()) : null; } catch { formula = null; }
      if ( !activity || !pool || !formula || !Roll.validate(formula) || !(Number(pool.system?.uses?.value ?? 0) > 0) ) continue;
      out.push({ name, row, item, regain: null, heal: null, give: { activity, pool, formula } });
      continue;
    }
    // RAVENLOFT — `reroll` (Hypervigilance): the Initiative d20 at or under the face is offered a reroll — the face read as the
    // total less the sheet's Initiative modifier (the roll itself has no card the module may trust).
    if ( row.reroll ) {
      const total = Number(combatant?.initiative);
      const face = Number.isFinite(total) ? total - (Number(actor.system?.attributes?.init?.total) || 0) : NaN;
      if ( Number.isFinite(face) && (face <= Number(row.reroll)) ) out.push({ name, row, item, regain: null, heal: null, reroll: { face } });
      continue;
    }
    const regain = featureNamed(actor, row.regain);
    if ( !regain ) continue;
    const heal = row.heal ? activityNamed(item, row.heal) : null;
    const hp = actor.system?.attributes?.hp ?? null;
    const due = initiativeGrantDue({ own: usesOf(item), regain: usesOf(regain), heals: !!heal, upTo: row.upTo ?? null, count: row.count ?? null,
      hp: hp ? { value: Number(hp.value) || 0, max: Number(hp.effectiveMax ?? hp.max) || 0 } : null });
    if ( due.due ) out.push({ name, row, item, regain, heal });
  }
  // C1 — `unless` (Perfect Focus): with the named row's ask due too, this row rides it as the FALLBACK (landed on its No);
  // with none, it stands on its own.
  for ( const g of out.filter(x => x.row.unless) ) {
    const host = out.find(x => (lower(x.name) === lower(g.row.unless)) && x.row.ask);
    if ( !host ) continue;
    host.fallback = g;
    out.splice(out.indexOf(g), 1);
  }
  return out;
}

/* --- the moment: a combatant's Initiative lands -------------------------------------------------------- */

listen("updateCombatant", "initiative-grants", (combatant, changes) => {
  if ( !("initiative" in (changes ?? {})) || !isActiveGM() ) return;
  const combat = combatant.parent;
  if ( !combat ) return;
  if ( changes.initiative === null ) { void rearm(combat, [combatant.id]); return; }
  void readFor(combat, combatant);
});

// A combatant added with its Initiative already rolled is read too.
listen("createCombatant", "initiative-grants", combatant => {
  if ( !isActiveGM() || (combatant.initiative === null) || (combatant.initiative === undefined) ) return;
  if ( combatant.parent ) void readFor(combatant.parent, combatant);
});

// ⚠ The tracker's "Reset Initiative" is ONE Combat update (the swap's note): re-arm the cleared.
listen("updateCombat", "initiative-grants", (combat, changes) => {
  if ( !("combatants" in (changes ?? {})) || !isActiveGM() ) return;
  const cleared = [...combat.combatants].filter(c => (c.initiative === null) || (c.initiative === undefined)).map(c => c.id);
  if ( cleared.length ) void rearm(combat, cleared);
});

async function rearm(combat, ids) {
  const read = readFlag(combat, INITIATIVE_READ_FLAG) ?? {};
  const drop = ids.filter(id => read[id]);
  if ( !drop.length ) return;
  await combat.update(Object.fromEntries(drop.map(id => [`flags.${MODULE_ID}.${INITIATIVE_READ_FLAG}.-=${id}`, null])))
    .catch(err => log.error(`The Initiative grants could not re-arm.`, err));
}

/** In flight on this client: `combat|combatant` — the updates of one Roll All land in one tick. */
const reading = new Set();

async function readFor(combat, combatant) {
  const key = `${combat.id}|${combatant.id}`;
  if ( reading.has(key) ) return;
  const actor = combatant.actor;
  if ( !(actor instanceof Actor) ) return;
  if ( readFlag(combat, INITIATIVE_READ_FLAG)?.[combatant.id] ) return;
  reading.add(key);
  try {
    // Read the sheet NOW, post, then latch: the in-memory guard covers the posting, the flag every later roll.
    for ( const g of grantsFor(actor, combatant) ) await post(combat, combatant, actor, g);
    await combat.update({ [`flags.${MODULE_ID}.${INITIATIVE_READ_FLAG}.${combatant.id}`]: true });
  } catch(err) {
    log.error(`The Initiative grants could not be read — regain them from the sheet.`, err);
  } finally {
    reading.delete(key);
  }
}

async function post(combat, combatant, actor, { name, row, item, regain, heal, give = null, fallback = null, reroll = null }) {
  const r = usesOf(regain);
  const formula = give ? give.formula : heal ? healFormulaOf(actor, heal) : null;
  if ( heal && !formula ) log.warn(`${name}: its heal could not be read off ${actor.name}'s sheet — roll it by hand.`);
  const window = row.ask ? decisionWindow() : 0;
  // C1 — `upTo` (Perfect Focus): what comes back is what is missing below the ceiling; `count` (Ever-Ready Shot): that many.
  const back = row.upTo ? Math.max(0, Math.min(Number(row.upTo) - r.value, r.spent))
    : row.count ? Math.max(0, Math.min(Number(row.count), r.spent)) : Math.min(r.spent, r.max);
  const flag = { status: row.ask ? "pending" : "resolved", answer: row.ask ? null : "auto", row: name, unit: row.unit ?? null,
    actorUuid: actor.uuid, actorName: combatant.name ?? actor.name, itemId: item.id, regainId: regain?.id ?? null,
    back, max: r.max, formula, combatId: combat.id, combatantId: combatant.id, ...statContext(actor.uuid),
    ...(row.upTo ? { upTo: Number(row.upTo) } : {}),
    ...(row.count ? { count: Number(row.count) } : {}),
    ...(fallback ? { fallback: { row: fallback.name, itemId: fallback.item.id, regainId: fallback.regain?.id ?? null, upTo: Number(fallback.row.upTo) || null, unit: fallback.row.unit ?? null } } : {}),
    ...(give ? { give: true, reach: row.reach ?? 30, activityId: give.activity.id, poolId: give.pool.id, poolName: give.pool.name } : {}),
    ...(reroll ? { reroll: { face: reroll.face, under: Number(row.reroll), from: Number(combatant.initiative) } } : {}),
    ...(window ? { window, deadline: Date.now() + (window * 1000) } : {}) };
  await postCard({
    actor, token: combatant.token,
    card: bfCard({ img: item.img, eyebrow: "Initiative", tone: row.ask ? "pending" : "good",
      title: reroll ? `${row.rule?.benefit ?? name} — reroll the Initiative?` : row.ask ? `${name} — use it now?` : name,
      ...(reroll ? { subtitle: `the d20 shows ${reroll.face} (${reroll.face <= 9 ? "9 or lower" : "low"}) — the new roll stands` } : {}) }),
    flags: { [MODULE_ID]: { [INITIATIVE_GRANT_FLAG]: flag } }
  });
}

/* --- the answer: the GM folds it, a player sends it ---------------------------------------------------- */

const settle = (current, answer, timedOut = false) => {
  if ( current.status !== "pending" ) return false;
  Object.assign(current, { status: "resolved", answer: (answer === "yes") ? "yes" : "no", answeredAt: Date.now(),
    ...(timedOut ? { timedOut: true } : {}) });
};

async function answerGrant(message, answer, { timedOut = false } = {}) {
  const flag = readFlag(message, INITIATIVE_GRANT_FLAG);
  if ( flag?.status !== "pending" ) return;
  if ( isActiveGM() ) {
    await queueFlagWrite(message, INITIATIVE_GRANT_FLAG, current => settle(current, answer, timedOut));
    return;
  }
  await postAnswer("initiativeGrantAnswer", {
    noGM: `${flag.row}: a GM must be on — use it from the sheet by hand.`,
    actor: resolveUuid(flag.actorUuid),
    card: "", toElect: true,
    flags: { [MODULE_ID]: { initiativeGrantAnswer: { messageId: message.id, answer } } }
  });
}

registerRelay("initiativeGrantAnswer", {
  flagKey: INITIATIVE_GRANT_FLAG,
  targetOf: a => a.messageId,
  owns: () => isActiveGM(),
  cleanup: true,
  fold: (current, a) => settle(current, a.answer)
});

/** C1 — the fallback row (Perfect Focus under Uncanny Metabolism's No): its own ceiling, landed on the host's card. */
async function landFallback(message, flag) {
  const record = {};
  // THE LEDGER (ledger.js): the ceiling judged once, so a re-drive over a dead claim says what came back.
  const steps = landingSteps(message, INITIATIVE_GRANT_FLAG, "fallback");
  try {
    const actor = resolveUuid(flag.actorUuid);
    const regain = actor?.items?.get(flag.fallback.regainId);
    if ( !(actor instanceof Actor) || !regain ) throw new Error("the feature left the sheet");
    const back = await steps.step("regain", {
      plan: () => ceilingRegain(usesOf(regain), flag.fallback.upTo),
      witness: () => usesOf(regain).spent,
      run: async p => { if ( p ) await regain.update({ "system.uses.spent": p.spent }); }
    });
    if ( back.plan ) record.fallbackRegained = back.plan.regained;
  } catch(err) {
    log.error(`${flag.fallback?.row} failed — check the sheet.`, err);
  } finally {
    await queueFlagWrite(message, INITIATIVE_GRANT_FLAG, current => {
      Object.assign(current, record, { fallbackApplied: true });
      closeLedger(current, "fallback");
    });
  }
}

/** The GM lands a Yes (or a plain row): the uses back, the heal rolled and receipted, the feature's use spent. */
async function landGrant(message) {
  // a No with a fallback lands the fallback, under its own claim; a Yes (or a plain row) lands the grant
  if ( await claimLanding(message, INITIATIVE_GRANT_FLAG, current => (current.status === "resolved") && (current.answer === "no") && !!current.fallback,
    { field: "fallbackApplying", done: "fallbackApplied" }) ) return landFallback(message, readFlag(message, INITIATIVE_GRANT_FLAG));
  if ( !(await claimLanding(message, INITIATIVE_GRANT_FLAG, current => (current.status === "resolved") && (current.answer !== "no"))) ) return;
  const flag = readFlag(message, INITIATIVE_GRANT_FLAG);
  const record = {};
  // THE LEDGER (ledger.js): a re-drive over a dead claim spends no use twice, moves no Initiative twice and heals once;
  // a run already begun passed the use's gate, which its own spend would now fail.
  const steps = landingSteps(message, INITIATIVE_GRANT_FLAG, "land");
  const begun = !!flag.ledger?.land;
  try {
    const actor = resolveUuid(flag.actorUuid);
    const item = actor?.items?.get(flag.itemId);
    if ( flag.give ) { Object.assign(record, await giveToAllies(flag, actor, item, steps, begun)); return; }
    // RAVENLOFT — `reroll` (Hypervigilance): the combatant's Initiative rolled again, the new roll stands (the read is latched).
    if ( flag.reroll ) {
      const combat = game.combats.get(flag.combatId);
      const c = combat?.combatants.get(flag.combatantId);
      if ( !c ) throw new Error("the combatant is gone");
      // its roll card stamped too: a reroll that lands on the same number still moved the witness
      await steps.step("reroll", {
        witness: () => ({ initiative: combat.combatants.get(c.id)?.initiative ?? null, made: steps.made(game.messages, "reroll") }),
        run: async () => { await combat.rollInitiative([c.id], { updateTurn: false, messageOptions: { flags: steps.stamp("reroll") } }); }
      });
      record.rerolled = { from: flag.reroll.from, to: Number(combat.combatants.get(c.id)?.initiative) };
      return;
    }
    const regain = actor?.items?.get(flag.regainId);
    if ( !(actor instanceof Actor) || !item || !regain ) throw new Error("the feature left the sheet");
    const own = usesOf(item);
    if ( !begun && (own.max > 0) && !(own.value > 0) ) { record.spentAlready = true; return; }
    // C1 — `upTo` (Perfect Focus): back to the ceiling, never past it. `count` (Ever-Ready Shot): that many expended uses
    // back, never more than are spent. Either way the feature's own use is spent with it, save the ceiling's.
    const g = await steps.step("regain", {
      plan: () => grantRegain({ regain: usesOf(regain), own, upTo: flag.upTo ?? null, count: flag.count ?? null }),
      witness: () => usesOf(regain).spent,
      run: async p => { if ( p.regainSpent !== null ) await regain.update({ "system.uses.spent": p.regainSpent }); }
    });
    if ( g.plan.ownSpent !== null ) {
      await steps.step("spend", {
        witness: () => usesOf(item).spent,
        run: async () => { await item.update({ "system.uses.spent": g.plan.ownSpent }); }
      });
    }
    record.regained = g.plan.regained;
    record.max = g.plan.max;
    if ( flag.formula && !flag.upTo && !flag.count ) {
      // rolled on every drive, the first drive's total kept on the ledger
      const roll = await new Roll(flag.formula).evaluate();
      const heal = await steps.step("heal", {
        plan: () => ({ total: roll.total }),
        witness: () => hitPointsOf(actor),
        run: async p => {
          await applyDamagesWithReceipt(message, [{ uuid: actor.uuid, name: actor.name }], [{ value: p.total, type: "healing", properties: new Set() }],
            { note: flag.row });
        }
      });
      record.healed = heal.plan.total;
    }
  } catch(err) {
    log.error(`${flag.row} failed part-way — check the sheet.`, err);
  } finally {
    await queueFlagWrite(message, INITIATIVE_GRANT_FLAG, current => {
      Object.assign(current, record, { applied: true, applying: false });
      closeLedger(current, "land");
    });
  }
}

registerResumable(INITIATIVE_GRANT_FLAG, {
  pending: flag => (flag?.status === "resolved") && ((flag.answer !== "no") ? (!flag.applied && !claimHolds(flag.applying))
    : (!!flag.fallback && !flag.fallbackApplied && !claimHolds(flag.fallbackApplying))),
  drives: () => isActiveGM(),
  drive: landGrant
});

/* --- B4 — the gift to allies (Tandem Footwork): one roll, every ally's Initiative within reach ------------ */

/**
 * The GM lands a `to: "allies"` Yes: the die rolled once, the pool's use spent, the rolled allies moved, the rest noted.
 * Each a ledgered step (`begun`: a re-drive, past the pool's gate already).
 * @param {any} flag @param {any} actor @param {any} item @param {ReturnType<typeof landingSteps>} steps @param {boolean} begun
 */
async function giveToAllies(flag, actor, item, steps, begun) {
  if ( !(actor instanceof Actor) || !item ) throw new Error("the feature left the sheet");
  const pool = actor.items.get(flag.poolId) ?? item;
  if ( !begun && !(Number(pool.system?.uses?.value ?? 0) > 0) ) return { spentAlready: true };
  const combat = game.combats.get(flag.combatId);
  if ( !combat ) throw new Error("the combat is gone");
  // rolled on every drive, the first drive's roll kept on the ledger and shown once
  const fresh = await new Roll(String(flag.formula)).evaluate();
  const die = await steps.step("die", {
    plan: () => ({ roll: fresh.toJSON() }),
    witness: () => steps.made(game.messages, "die"),
    run: async p => {
      await Roll.fromData(p.roll).toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${flag.row} — the die for allies within ${flag.reach ?? 30} ft`,
        flags: steps.stamp("die") });
    }
  });
  const n = Math.max(0, Number(die.plan.roll.total) || 0);
  await steps.step("pool", {
    witness: () => usesOf(pool).spent,
    run: async () => { await spendPoolUses(actor, pool, flag.row, 1, (pool === item) ? null : pool.name); }
  });
  const own = combat.combatants.get(flag.combatantId)?.token?.object ?? tokenOf(actor.uuid);
  const side = own?.document?.disposition;
  const given = [], due = [];
  for ( const c of combat.combatants ) {
    const token = c.token?.object ?? (c.actor ? tokenOf(c.actor.uuid) : null);
    if ( !token || !c.actor || (token.document?.disposition !== side) ) continue;
    const feet = (c.actor.uuid === actor.uuid) ? 0 : nearestFeet(own, token);
    if ( (feet === null) || (feet > (flag.reach ?? 30)) ) continue;
    const { plan } = await steps.step(`ally.${c.id}`, {
      plan: () => (((c.initiative === null) || (c.initiative === undefined)) ? { due: true } : { from: Number(c.initiative), to: Number(c.initiative) + n }),
      witness: () => c.initiative ?? null,
      run: async p => {
        if ( !p.due ) await c.update({ initiative: p.to }).catch(err => log.warn(`${flag.row}: could not move ${c.name}'s Initiative.`, err));
      }
    });
    if ( plan.due ) due.push(c.id);
    else given.push({ id: c.id, name: c.name, from: plan.from, to: plan.to });
  }
  if ( due.length ) {
    await steps.step("due", {
      witness: () => due.map(id => readFlag(combat, BONUS_DUE_FLAG)?.[id] ?? null),
      run: async () => {
        await combat.update(Object.fromEntries(due.map(id => [`flags.${MODULE_ID}.${BONUS_DUE_FLAG}.${id}`, { n, row: flag.row, from: actor.name }])))
          .catch(err => log.warn(`${flag.row}: the bonus due to late rollers could not be noted.`, err));
      }
    });
  }
  return { rolled: n, given, due };
}

// A combatant rolling AFTER the gift landed gets its bonus as its Initiative lands (the GM; the note is cleared).
listen("updateCombatant", "initiative-grants", (combatant, changes) => {
  try {
    if ( !("initiative" in (changes ?? {})) || !isActiveGM() ) return;
    const combat = combatant.parent;
    const note = readFlag(combat, BONUS_DUE_FLAG)?.[combatant.id];
    if ( !note || (changes.initiative === null) || (changes.initiative === undefined) ) return;
    const from = Number(changes.initiative);
    void (async () => {
      await combat.update({ [`flags.${MODULE_ID}.${BONUS_DUE_FLAG}.-=${combatant.id}`]: null });
      await combatant.update({ initiative: from + Number(note.n) });
      await postCard({ actor: combatant.actor, token: combatant.token,
        card: bfCard({ eyebrow: "Initiative", tone: "good", title: `${note.row} — +${note.n} Initiative for ${combatant.name} (${from} → ${from + Number(note.n)})`,
          subtitle: `${note.from}'s gift, rolled before ${combatant.name}'s Initiative` }) });
    })().catch(err => log.error(`${note.row}'s late bonus could not land — add it by hand.`, err));
  } catch(err) { log.error(`The Initiative bonus due could not be read.`, err); }
});

/* --- the clock: No, on whoever drives the owner's moments --------------------------------------------- */

function armTimer(message) {
  armAskTimer(timers, message, INITIATIVE_GRANT_FLAG, live => answerGrant(live, "no", { timedOut: true }), { owns: subjectOwns(f => f.actorUuid) });
}

/* --- the popup and the card ------------------------------------------------------------------------- */

async function showGrantPopup(message) {
  const flag = readFlag(message, INITIATIVE_GRANT_FLAG);
  if ( flag?.status !== "pending" ) return;
  const actor = resolveUuid(flag.actorUuid);
  if ( !actor ) return;
  const row = INITIATIVE_GRANTS[flag.row] ?? null;
  await openMomentPopup(message, INITIATIVE_GRANT_FLAG, actor, {
    title: `${flag.row} — ${flag.actorName}`, icon: "fa-solid fa-bolt", width: 400,
    content: bfCard({ img: actor.items.get(flag.itemId)?.img ?? null, eyebrow: "Initiative", tone: "pending",
      title: initiativeGrantLine(flag), lines: [row?.rule ? foldedRuleHTML(row.rule) : ""] }) + holdBarHTML(flag, "to answer"),
    buttons: [
      { action: "yes", label: "Yes", default: true, callback: () => { void answerGrant(message, "yes"); } },
      { action: "no", label: "No", callback: () => { void answerGrant(message, "no"); } }
    ]
  });
}

listen("dnd5e.renderChatMessage", "initiative-grants", (message, html) => {
  try {
    const flag = readFlag(message, INITIATIVE_GRANT_FLAG);
    if ( !flag ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-initiative-grant-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-initiative-grant-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = `<i class="fa-solid fa-bolt" data-tooltip="${esc(flag.row)}"></i> ${esc(initiativeGrantLine(flag))}`;
    if ( flag.status === "pending" ) {
      const may = canAnswerFor(resolveUuid(flag.actorUuid));
      pendingRow(message, div, {
        bar: holdBarHTML(flag, "to answer"),
        latch: may && { sub: INITIATIVE_GRANT_FLAG, show: () => showGrantPopup(message) },
        answer: may && "Answer",
        arm: armTimer
      });
    }
    content.appendChild(div);
  } catch(err) { log.warn(`The Initiative grant's line could not render.`, err); }
});

// An answer anywhere closes the popup everywhere (law 4); the clock stands down with it.
listen("updateChatMessage", "initiative-grants", message => {
  const flag = readFlag(message, INITIATIVE_GRANT_FLAG);
  if ( !flag ) return;
  if ( flag.status === "pending" ) { armTimer(message); return; }
  disarmAskTimer(timers, message.id);
  void closePopup(message, INITIATIVE_GRANT_FLAG);
});

listen("deleteChatMessage", "initiative-grants", message => { disarmAskTimer(timers, message.id); });
