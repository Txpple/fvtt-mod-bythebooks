/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): THE MASTERY RECORD (issue #3) — the
 * paperwork of Weapon Mastery, kept in dnd5e's own list (`system.traits.weaponProf.mastery.value`,
 * the set the system reads before it stamps a mastery on an attack; mastery.js resolves the stamp).
 * The allowance is the sheet's mastery-mode Trait advancements (decide/mastery-record.js). Four
 * surfaces: the FILL (the elect, on load and after a level-up on the owner's client: a list shorter
 * than the allowance is topped up from equipped weapons, the GM whispered); the LINE on an attack
 * card whose weapon kind the wielder has not chosen (a pick is RAW a Long Rest's, so no button); the
 * SWAP after a Long Rest (the rest-song's road: the owner answers, the elect lands, the owner acknowledges;
 * an over-long list is trimmed there first); the RECORD on the Weapon Mastery feature's card; the PARTY VIEW
 * in the group sheet's header controls. Nothing here decides who may use a mastery — the system does.
 */
import { MODULE_ID, readFlag, TITLE, isActiveGM, queueFlagWrite, canAnswerFor, statContext, gmIds, resolveUuid, log, claimLanding, claimHolds } from "./core.js";
import { cardItem, lower } from "./lookup.js";
import { allowanceOf, fillPicks, recordState, missingPick, swapLanding } from "./decide/mastery-record.js";
import { TONE, bfCard, esc, foldedRuleHTML, pickInputHTML } from "./decide/present.js";
import { CARD, isCard, masteryOf } from "./decide/card.js";
import { isPartyMember, masteryLabel } from "./shared.js";
import { openMomentPopup, registerRelay, registerResumable, acknowledgeMoment, momentAcknowledged, pendingRow, postCard, postAnswer, pickInputs, picked, pickedAll, closePopup } from "./ui.js";
import { messageActivity } from "./effect-riders.js";
import { closeLedger, landingSteps } from "./ledger.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";

const MASTERY_FILL_FLAG = "masteryFill";
const MASTERY_SWAP_FLAG = "masterySwap";
const LIST = "system.traits.weaponProf.mastery.value";

/* --- reading the sheet ------------------------------------------------------------------------ */

/** The sheet's mastery-mode Trait advancements as plain grants (decide/mastery-record.js). */
function grantsOf(actor) {
  const out = [];
  const charLevel = Number(actor.system?.details?.level) || 0;
  for ( const item of actor.items ?? [] ) {
    const at = (item.type === "class") ? (Number(item.system?.levels) || 0)
      : (item.type === "subclass") ? (Number(item.class?.system?.levels) || 0) : charLevel;
    for ( const a of item.advancement?.byType?.Trait ?? [] ) {
      if ( a.configuration?.mode !== "mastery" ) continue;
      out.push({
        level: Number(a.level) || 0, at, source: item.name, kind: item.type,
        grants: a.configuration.grants?.size ?? 0,
        choices: [...(a.configuration.choices ?? [])].reduce((n, c) => n + (Number(c.count) || 0), 0)
      });
    }
  }
  return out;
}

/** The chosen kinds as the sheet STORES them (what a write replaces), never the prepared set. */
const chosenOf = actor => [...(actor.system?._source?.traits?.weaponProf?.mastery?.value ?? [])];

/** The sheet's weapons as plain rows. `prof.multiplier` is the system's own proficiency read. */
function weaponRows(actor) {
  return [...(actor.items ?? [])].filter(i => i.type === "weapon").map(i => ({
    id: i.id, name: i.name, img: i.img,
    base: i.system?.type?.baseItem || null, mastery: i.system?.mastery || null,
    equipped: i.system?.equipped === true,
    proficient: !(Number(i.system?.prof?.multiplier) < 1),
    sort: i.sort ?? 0
  }));
}

/** A base weapon kind's name (the system's label, else the key). */
function kindLabel(base) {
  try {
    const label = globalThis.dnd5e?.documents?.Trait?.keyLabel?.(`weapon:${base}`);
    if ( label && !/^weapon:/.test(label) ) return label;
  } catch { /* the key */ }
  return String(base ?? "").replace(/^./, c => c.toUpperCase());
}

/** One character's record: the allowance, the list, the weapons and where it stands. */
export function recordOf(actor) {
  const allowance = allowanceOf(grantsOf(actor));
  const chosen = chosenOf(actor);
  const weapons = weaponRows(actor);
  const proficientKinds = new Set(weapons.filter(w => w.proficient && w.base).map(w => w.base));
  const knownKinds = new Set(weapons.filter(w => w.base).map(w => w.base));
  const unproficient = chosen.filter(b => knownKinds.has(b) && !proficientKinds.has(b));
  return { allowance, chosen, weapons, ...recordState({ allowance, chosen, unproficient }) };
}

/**
 * The party's characters: the primary party group's members when the world has one, else every
 * player-owned character. ⚠ The group first, on purpose: a world with a party set has sheets that are
 * player-owned and not in it (a retired PC, a test fixture), and the fill must not write those.
 */
function partyActors() {
  const party = game.actors?.party;
  if ( party ) {
    const ids = new Set((party.system?.members ?? []).map(m => m.actor?.id ?? m.actor).filter(Boolean));
    return game.actors.filter(a => (a.type === "character") && ids.has(a.id));
  }
  return game.actors.filter(a => (a.type === "character") && isPartyMember(a.uuid));
}

/* --- the fill ----------------------------------------------------------------------------------- */

/**
 * Top up every listed character whose list is shorter than its allowance, from what it has
 * equipped, and whisper the GM one card naming the picks. A list at or over the allowance is
 * never touched; an over-long one rides the card as a flag. Nothing to fill posts nothing.
 * @param {Actor[]} actors
 * @param {"load"|"level"|"suite"} cause
 */
export async function fillActors(actors, cause) {
  const filled = [];
  const over = [];
  for ( const actor of actors ) {
    try {
      const r = recordOf(actor);
      if ( r.state === "over" ) { over.push({ actorUuid: actor.uuid, name: actor.name, chosen: r.chosen, allowance: r.allowance }); continue; }
      const picks = fillPicks(r);
      if ( !picks.length ) continue;
      await actor.update({ [LIST]: [...r.chosen, ...picks.map(p => p.base)] });
      const after = recordOf(actor);
      filled.push({ actorUuid: actor.uuid, name: actor.name, picks, allowance: r.allowance, open: after.open });
    } catch(err) {
      log.error(`${actor.name}'s masteries could not be filled — set them on the sheet.`, err);
    }
  }
  if ( !filled.length ) return null;
  const lines = filled.map(f => `<b>${esc(f.name)}</b> — ${f.picks.map(p => `${esc(p.name)} (${esc(masteryLabel(p.mastery))})`).join(", ")} from what is equipped`
    + (f.open > 0 ? ` · <em>${f.open} of ${f.allowance} still open</em>` : ""));
  for ( const o of over ) lines.push(`<b>${esc(o.name)}</b> — ${o.chosen.length} chosen, ${o.allowance} allowed: the sheet's list is longer than the class allows; nothing was removed`);
  return postCard({
    alias: TITLE,
    to: gmIds(),
    card: bfCard({
      eyebrow: "Weapon Mastery", tone: "pending",
      title: "Masteries filled",
      subtitle: `${filled.length} character${filled.length === 1 ? " had" : "s had"} fewer picks than the class allows`,
      lines
    }),
    flags: { [MODULE_ID]: { [MASTERY_FILL_FLAG]: { cause, filled, over, at: Date.now(), ...statContext() } } }
  });
}

// On load, the elect fills the party; after a level-up, the client that levelled fills that one.
listen("ready", "mastery-record", () => {
  if ( !isActiveGM() ) return;
  fillActors(partyActors(), "load").catch(err => log.error(`The mastery fill failed on load.`, err));
});

listen("dnd5e.advancementManagerComplete", "mastery-record", manager => {
  const actor = manager?.actor;
  if ( !(actor instanceof Actor) || (actor.type !== "character") || !actor.isOwner ) return;
  if ( !isPartyMember(actor.uuid) ) return;
  fillActors([actor], "level").catch(err => log.error(`The mastery fill failed after the level-up.`, err));
});

/* --- the line on the attack card ---------------------------------------------------------------- */

// RAW (RULINGS *Weapon Mastery — the record*): a kind is chosen when the feature is gained and changed
// only at a Long Rest, so the line only says so — no button; an open slot is filled by the fill or at the rest.
function drawMissing(message, html) {
  const activity = messageActivity(message);
  const weapon = activity?.item;
  const actor = weapon?.actor;
  if ( !activity || !weapon || !(actor instanceof Actor) || (weapon.type !== "weapon") ) return;
  if ( (actor.type !== "character") || !isPartyMember(actor.uuid) ) return;
  const r = recordOf(actor);
  const base = weapon.system?.type?.baseItem || null;
  const mastery = weapon.system?.mastery || null;
  const missing = missingPick({ stamped: masteryOf(message), weapon: { base, mastery }, allowance: r.allowance, chosen: r.chosen });
  if ( !missing ) return;
  const standing = (missing.open > 0) ? `${missing.open} of ${r.allowance} open — pick at your next Long Rest` : `${r.chosen.length} of ${r.allowance} chosen`;
  const row = document.createElement("div");
  row.className = "bythebooks-mastery-record";
  row.innerHTML = bfCard({
    img: weapon.img, eyebrow: "Weapon Mastery", tone: "neutral",
    title: `${weapon.name}: ${masteryLabel(mastery)} — not mastered by ${actor.name}`,
    subtitle: `${kindLabel(base)} is not among ${actor.name}'s chosen kinds · ${standing}`
  });
  html.querySelector(SURFACES.messageContent)?.appendChild(row);
}

/* --- the record shown: "you have these masteries" ------------------------------------------------ */

/** A chosen kind's mastery, read off a weapon of that kind on the sheet when there is one. */
const masteryOfKind = (record, base) => record.weapons.find(w => (w.base === base) && w.mastery)?.mastery ?? null;

/** The chosen kinds as rows the cards and popups draw. */
const kindRows = record => record.chosen.map(b => ({ base: b, name: kindLabel(b), mastery: masteryOfKind(record, b) }));

/** "Longsword (Sap), Longbow (Slow)" — or none yet. */
function listLine(kinds) {
  if ( !kinds?.length ) return "<em>none yet</em>";
  return kinds.map(k => `<b>${esc(k.name)}</b>${k.mastery ? ` (${esc(masteryLabel(k.mastery))})` : ""}`).join(", ");
}

/**
 * One grid row: the kind (or an open slot), its tone's left border, a tag on the right, and an
 * optional control (a checkbox the popups wire). `tone` is a TONE key; a `dim` row is greyed.
 */
function slotRowHTML({ kind = null, tone = "neutral", tag = "", control = "", dim = false }) {
  const color = TONE[tone];
  const cell = kind
    ? `<b>${esc(kind.name)}</b>${kind.mastery ? ` <span style="opacity:0.75;">— ${esc(masteryLabel(kind.mastery))}</span>` : ""}`
    : `<em style="opacity:0.8;">open</em>`;
  return `<div data-bf-slot style="display:flex;align-items:center;gap:0.5rem;padding:0.2rem 0.45rem;border-left:3px solid ${color};background:rgba(0,0,0,0.06);border-radius:2px;${dim ? "opacity:0.45;" : ""}">
      ${control}
      <span style="flex:1;min-width:0;">${cell}</span>
      ${tag ? `<span data-bf-tag style="font-size:var(--font-size-10,10px);letter-spacing:0.06em;text-transform:uppercase;color:${color};">${tag}</span>` : ""}
    </div>`;
}

/**
 * The list as slots, one row each: a chosen kind (green), an open slot (orange), a kind past the
 * allowance (red, "over") — the shape the walk asked for over a comma line. `controlFor(kind, i)`
 * adds a control to a row (the popups' checkboxes); the plain list passes none.
 */
function slotListHTML(kinds, allowance, controlFor = null) {
  const rows = [];
  const n = Math.max(kinds?.length ?? 0, Number(allowance) || 0);
  for ( let i = 0; i < n; i++ ) {
    const kind = kinds?.[i] ?? null;
    const tone = !kind ? "pending" : (i < allowance) ? "good" : "bad";
    const tag = (kind && (i >= allowance)) ? "over" : "";   // an open row already says "open"
    rows.push(slotRowHTML({ kind, tone, tag, control: controlFor?.(kind, i) ?? "" }));
  }
  return `<div style="display:grid;gap:0.2rem;margin:0.3rem 0;">${rows.join("")}</div>`;
}

/**
 * The allowance explained: each source's rows, counted at its level — "Fighter 5 — 3 kinds at
 * level 1, +1 at 4, 10 and 16 · 4 now", "Weapon Master — +1" — with the book's own rule folded under.
 */
function allowanceHTML(actor) {
  const bySource = new Map();
  for ( const g of grantsOf(actor) ) {
    const row = bySource.get(g.source) ?? { kind: g.kind, at: g.at, steps: [] };
    row.steps.push(g);
    bySource.set(g.source, row);
  }
  const parts = [];
  for ( const [source, row] of bySource ) {
    const steps = row.steps.sort((a, b) => a.level - b.level);
    const who = (row.kind === "class") ? `${esc(source)} ${row.at}` : esc(source);
    if ( (row.kind !== "class") && (steps.length === 1) ) { parts.push(`<b>${who}</b> — +${steps[0].grants + steps[0].choices}`); continue; }
    // The book's column: the kinds known at each level the class grows, the reached ones marked.
    let total = 0;
    const cells = steps.map(g => {
      total += g.grants + g.choices;
      const reached = g.at >= g.level;
      return `<span style="display:inline-block;padding:0 0.35rem;border-radius:3px;border:1px solid ${reached ? TONE.good : "var(--color-border-dark,#0006)"};${reached ? "" : "opacity:0.55;"}">lvl ${g.level}: <b>${total}</b></span>`;
    });
    parts.push(`<b>${who}</b> — qty by level: ${cells.join(" ")}`);
  }
  const feature = [...(actor.items ?? [])].find(i => (i.type === "feat") && (lower(i.name) === "weapon mastery"));
  return `<div style="margin:0 0 0.35rem;font-size:var(--font-size-11,11px);opacity:0.85;">${parts.join("<br>") || "<em>no class on the sheet grants Weapon Mastery</em>"}</div>`
    + (feature ? foldedRuleHTML({ item: "Weapon Mastery", uuid: feature.uuid }) : "");
}

/** Where the list stands, in words. */
function standingLine({ allowance, chosen, state, open }) {
  if ( state === "over" ) return `${chosen.length} chosen, ${allowance} allowed — <b>${chosen.length - allowance} too many</b>`;
  if ( state === "open" ) return `${chosen.length} of ${allowance} chosen · ${open} open`;
  if ( state === "full" ) return `${chosen.length} of ${allowance} chosen`;
  return "your class grants no Weapon Mastery";
}

/** The record popup off the Weapon Mastery feature's card: what you have, OK. */
async function showRecordPopup(message, actor, img) {
  const r = recordOf(actor);
  await openMomentPopup(message, "masteryShow", actor, {
    title: `Weapon Mastery — ${actor.name}`, icon: "fa-solid fa-medal", width: 420,
    content: bfCard({
      img, eyebrow: "Weapon Mastery", tone: "neutral",
      title: "You have these masteries", subtitle: standingLine(r),
      lines: [allowanceHTML(actor), slotListHTML(kindRows(r), r.allowance), "<em>One swap is offered after each Long Rest; the sheet's Weapon Proficiencies dialog edits the list by hand.</em>"]
    }),
    buttons: [{ action: "ok", label: "OK", default: true }]
  });
}

// The sheet's own Weapon Mastery feature (every class ships one): its card carries the record and
// opens the popup for the owner — the one place to see the list between rests.
function drawFeature(message, html) {
  const item = cardItem(message);
  if ( !item || (item.type !== "feat") || (lower(item.name) !== "weapon mastery") ) return;
  const actor = item.actor;
  if ( !(actor instanceof Actor) || (actor.type !== "character") ) return;
  const r = recordOf(actor);
  const row = document.createElement("div");
  row.className = "bythebooks-mastery-record";
  row.innerHTML = bfCard({ img: item.img, eyebrow: "Weapon Mastery", tone: "neutral", title: `${actor.name} has these masteries`, subtitle: standingLine(r), lines: [allowanceHTML(actor), slotListHTML(kindRows(r), r.allowance)] });
  pendingRow(message, row, { latch: canAnswerFor(actor) && { sub: "masteryShow", show: () => showRecordPopup(message, actor, item.img) } });
  html.querySelector(SURFACES.messageContent)?.appendChild(row);
}

/* --- the long-rest swap -------------------------------------------------------------------------- */

// The resting owner's client posts the ask. An over-long list is put right first (drop down to the
// allowance — RULINGS *Weapon Mastery — the record*); otherwise one swap: the pool is the sheet's proficient
// kinds with a mastery that are not chosen (a kind with no weapon on the sheet is the trait dialog's).
listen("dnd5e.restCompleted", "mastery-record", (actor, result, config) => {
  try {
    if ( !(actor instanceof Actor) || !actor.isOwner || (actor.type !== "character") ) return;
    if ( ((result?.type ?? config?.type) !== "long") || !isPartyMember(actor.uuid) ) return;
    const r = recordOf(actor);
    if ( !(r.allowance > 0) ) return;
    const seen = new Set(r.chosen);
    const pool = [];
    for ( const w of r.weapons ) {
      if ( !w.proficient || !w.base || !w.mastery || seen.has(w.base) ) continue;
      seen.add(w.base);
      pool.push({ base: w.base, mastery: w.mastery, name: kindLabel(w.base) });
    }
    const over = Math.max(0, r.chosen.length - r.allowance);
    // Every Long Rest shows the list (the walk's ruling); with nothing to change the popup says so.
    const flag = { status: "pending", actorUuid: actor.uuid, actorName: actor.name, allowance: r.allowance, over, open: r.open,
      chosen: kindRows(r), pool, restAt: Date.now(), ...statContext(actor.uuid) };
    void postCard({
      actor,
      card: bfCard({ eyebrow: "Weapon Mastery", tone: "pending",
        title: over ? `${actor.name} — ${over} too many masteries` : r.open ? `${actor.name} — ${r.open} open mastery slot${r.open === 1 ? "" : "s"}` : pool.length ? `${actor.name} — swap a mastery?` : `${actor.name} — masteries`,
        subtitle: over ? "the list is put right at the Long Rest" : "chosen at the Long Rest" }),
      flags: { [MODULE_ID]: { [MASTERY_SWAP_FLAG]: flag } }
    }).catch(err => log.error(`The mastery swap could not be asked.`, err));
  } catch(err) {
    log.error(`The mastery swap failed at the rest's end.`, err);
  }
});

/** The owner's answer — a swap (`out`, `into`), a trim (`drop`) or a keep; the GM writes it, a player relays it. */
export async function answerSwap(message, { out = null, into = null, adds = null, drop = null, declined = false } = {}) {
  const flag = readFlag(message, MASTERY_SWAP_FLAG);
  if ( flag?.status !== "pending" ) return;
  const answer = declined ? { declined: true } : drop ? { drop: [...drop] } : { out, into, adds: [...(adds ?? [])] };
  if ( isActiveGM() ) {
    await queueFlagWrite(message, MASTERY_SWAP_FLAG, current => {
      if ( current.status !== "pending" ) return false;
      Object.assign(current, { status: "resolved", answeredAt: Date.now(), ...answer });
    });
    return;
  }
  await postAnswer("masterySwapAnswer", {
    noGM: "Weapon Mastery: a GM must be on to land the change — set it on the sheet by hand.",
    actor: resolveUuid(flag.actorUuid),
    card: "", toElect: true,
    flags: { [MODULE_ID]: { masterySwapAnswer: { messageId: message.id, ...answer } } }
  });
}

registerRelay("masterySwapAnswer", {
  flagKey: MASTERY_SWAP_FLAG,
  targetOf: a => a.messageId,
  owns: () => isActiveGM(),
  cleanup: true,
  fold: (current, a) => {
    if ( current.status !== "pending" ) return false;
    const answer = a.declined ? { declined: true } : a.drop ? { drop: [...a.drop] } : { out: a.out, into: a.into, adds: [...(a.adds ?? [])] };
    Object.assign(current, { status: "resolved", answeredAt: Date.now(), ...answer });
  }
});

/** The elect lands the answer on the sheet, judged against the list as it stands now. */
async function landSwap(message) {
  if ( !(await claimLanding(message, MASTERY_SWAP_FLAG, current => current.status === "resolved")) ) return;
  const flag = readFlag(message, MASTERY_SWAP_FLAG);
  let outcome = "kept";
  let after = null;
  // THE LEDGER (ledger.js): the list is judged once, so a re-drive over a dead claim neither judges the list it already
  // wrote (stale) nor writes it again.
  const steps = landingSteps(message, MASTERY_SWAP_FLAG, "land");
  try {
    const actor = resolveUuid(flag.actorUuid);
    if ( !flag.declined && (actor instanceof Actor) ) {
      const swap = await steps.step("list", {
        plan: () => {
          const r = recordOf(actor);
          return swapLanding({ chosen: r.chosen, allowance: r.allowance, drop: flag.drop ?? null, adds: flag.adds ?? null, out: flag.out ?? null, into: flag.into ?? null });
        },
        witness: () => chosenOf(actor),
        run: async p => { if ( p.list ) await actor.update({ [LIST]: p.list }); }
      });
      outcome = swap.plan.outcome;
    }
    if ( actor instanceof Actor ) after = kindRows(recordOf(actor));
  } catch(err) {
    log.error(`${flag.actorName}'s mastery change failed — set it on the sheet.`, err);
    outcome = "failed";
  } finally {
    await queueFlagWrite(message, MASTERY_SWAP_FLAG, current => {
      current.applied = true; current.applying = false; current.outcome = outcome;
      if ( after ) current.after = after;
      closeLedger(current, "land");
    });
  }
}

registerResumable(MASTERY_SWAP_FLAG, {
  pending: flag => (flag?.status === "resolved") && !flag.applied && !claimHolds(flag.applying),
  drives: () => isActiveGM(),
  drive: landSwap
});

const box = (field, value, { checked = false, disabled = false } = {}) =>
  pickInputHTML({ name: field, value, checked, disabled, style: "margin:0;flex:0 0 auto;" });

/**
 * The rest grid's rule, wired live: at most ONE "remove" box (the one swap per Long Rest); the
 * "available" rows wake up while a slot is free — an open one, or the one being removed — and
 * sleep again once the free slots are taken; the trim's OK waits for exactly `over` drops.
 */
function syncRestGrid(root, { open, over }) {
  if ( !root?.querySelectorAll ) return;
  const drops = pickInputs(root, "bf-mastery-drop");
  const removes = pickInputs(root, "bf-mastery-remove");
  const picks = pickInputs(root, "bf-mastery-pick");
  const ok = root.querySelector('button[data-action="ok"]');
  const sync = () => {
    if ( drops.length ) { if ( ok ) ok.disabled = drops.filter(d => d.checked).length !== over; return; }
    const removed = removes.filter(r => r.checked).length;
    const free = open + removed;
    const picked = picks.filter(p => p.checked).length;
    for ( const p of picks ) {
      p.disabled = !p.checked && (picked >= free);
      const row = p.closest("[data-bf-slot]");
      if ( row ) row.style.opacity = p.disabled ? "0.45" : "";
    }
  };
  for ( const r of removes ) r.addEventListener("change", () => {
    if ( r.checked ) for ( const o of removes ) if ( o !== r ) o.checked = false;
    sync();
  });
  for ( const p of picks ) p.addEventListener("change", sync);
  for ( const d of drops ) d.addEventListener("change", sync);
  sync();
}

async function showSwapPopup(message) {
  const flag = readFlag(message, MASTERY_SWAP_FLAG);
  if ( flag?.status !== "pending" ) return;
  const actor = resolveUuid(flag.actorUuid);
  if ( !actor ) return;
  const over = Number(flag.over) || 0;
  const open = Number(flag.open) || 0;
  const pool = flag.pool ?? [];

  // The trim: the same grid, a drop box on every row, OK held until exactly `over` are ticked.
  if ( over > 0 ) {
    const dialog = await openMomentPopup(message, MASTERY_SWAP_FLAG, actor, {
      title: `Weapon Mastery — ${flag.actorName}`, icon: "fa-solid fa-medal", width: 440,
      content: bfCard({
        eyebrow: "Weapon Mastery", tone: "pending",
        title: `${over} too many`,
        subtitle: `your class allows ${flag.allowance} · the list is put right at the Long Rest`,
        lines: [
          allowanceHTML(actor),
          `<div><b>You have these masteries</b> — tick ${over} to drop:</div>`,
          slotListHTML(flag.chosen, flag.allowance, k => box("bf-mastery-drop", k.base))
        ]
      }),
      buttons: [{ action: "ok", label: "OK", default: true, callback: (_event, button) => {
        const drop = pickedAll(button.form, "bf-mastery-drop");
        void answerSwap(message, { drop });
      } }]
    });
    syncRestGrid(dialog?.element ?? null, { open, over });
    return;
  }

  // The slots: a remove box on each chosen row (one swap), the open rows plain; then the pool.
  const have = `<div><b>You have these masteries</b>${flag.chosen.length && pool.length ? " — tick one to swap it out:" : ":"}</div>`
    + slotListHTML(flag.chosen, flag.allowance, k => (k && pool.length) ? box("bf-mastery-remove", k.base) : "");
  const avail = pool.length
    ? `<div style="margin-top:0.4rem;"><b>Available</b> — the kinds on your sheet you are proficient with; one per free slot:</div>
      <div style="display:grid;gap:0.2rem;margin:0.3rem 0;">${pool.map(k => slotRowHTML({ kind: k, tone: "neutral", control: box("bf-mastery-pick", k.base) })).join("")}</div>`
    : `<div style="margin-top:0.4rem;"><em>Nothing to change: every mastery weapon on your sheet is already chosen${open ? " — carry another kind and choose it at your next Long Rest" : ""}.</em></div>`;
  const dialog = await openMomentPopup(message, MASTERY_SWAP_FLAG, actor, {
    title: `Weapon Mastery — ${flag.actorName}`, icon: "fa-solid fa-medal", width: 440,
    content: bfCard({
      eyebrow: "Weapon Mastery", tone: "pending",
      title: open ? "Choose your masteries" : pool.length ? "Swap a mastery?" : "Your masteries",
      subtitle: `${flag.chosen.length} of ${flag.allowance} chosen · one swap per Long Rest · chosen at the Long Rest`,
      lines: [allowanceHTML(actor), have, avail]
    }),
    buttons: [
      { action: "ok", label: "OK", default: true, callback: (_event, button) => {
        const out = picked(button.form, "bf-mastery-remove") || null;
        const picks = pickedAll(button.form, "bf-mastery-pick");
        if ( !picks.length ) { void answerSwap(message, { declined: true }); return; }
        // A removal takes the first pick as its replacement; the rest fill open slots.
        const into = out ? (picks.shift() ?? null) : null;
        void answerSwap(message, { out: into ? out : null, into, adds: picks });
      } },
      { action: "keep", label: "Keep them", callback: () => { void answerSwap(message, { declined: true }); } }
    ]
  });
  syncRestGrid(dialog?.element ?? null, { open, over });
}

/** What the landed answer did, in words. */
function changeLine(flag) {
  const kindOf = base => esc(kindLabel(base));
  if ( flag.outcome === "changed" ) {
    const parts = [];
    if ( flag.adds?.length ) parts.push(`Chose ${flag.adds.map(kindOf).join(", ")}`);
    if ( flag.out && flag.into ) parts.push(`${parts.length ? "swapped" : "Swapped"} ${kindOf(flag.out)} → ${kindOf(flag.into)}`);
    return parts.join(" · ") || "Changed";
  }
  if ( flag.outcome === "trimmed" ) return `Dropped ${(flag.drop ?? []).map(kindOf).join(", ")}`;
  if ( flag.outcome === "stale" ) return "The change no longer fit the list — kept";
  if ( flag.outcome === "failed" ) return "The change could not be written — set it on the sheet";
  return "Kept";
}

/** The confirmation after the landing: what you have now and what changed, OK. */
async function showSwapDone(message, flag) {
  const actor = resolveUuid(flag.actorUuid);
  await openMomentPopup(message, "masteryDone", actor, {
    title: `Weapon Mastery — ${flag.actorName}`, icon: "fa-solid fa-medal", width: 420,
    content: bfCard({
      eyebrow: "Weapon Mastery", tone: ((flag.outcome === "changed") || (flag.outcome === "trimmed")) ? "good" : "neutral",
      title: changeLine(flag),
      subtitle: `${(flag.after ?? []).length} of ${flag.allowance} chosen`,
      lines: [actor ? allowanceHTML(actor) : "", `<div><b>You now have these masteries:</b></div>${slotListHTML(flag.after ?? flag.chosen, flag.allowance)}`]
    }),
    buttons: [{ action: "ok", label: "OK", default: true, callback: () => acknowledgeMoment(message, MASTERY_SWAP_FLAG) }]
  });
}

function drawSwap(message, html, flag) {
  const row = document.createElement("div");
  row.className = "bythebooks-mastery-record";
  const actor = resolveUuid(flag.actorUuid);
  if ( flag.status === "pending" ) {
    if ( !canAnswerFor(actor) ) return;
    pendingRow(message, row, { latch: { sub: MASTERY_SWAP_FLAG, show: () => showSwapPopup(message) }, answer: { style: { margin: "0.25rem 0 0" } } });
    html.querySelector(SURFACES.messageContent)?.appendChild(row);
    return;
  }
  if ( !flag.applied ) return;
  row.innerHTML = bfCard({
    eyebrow: "Weapon Mastery", tone: ((flag.outcome === "changed") || (flag.outcome === "trimmed")) ? "good" : "neutral",
    title: changeLine(flag), subtitle: esc(flag.actorName),
    lines: [`Now: ${listLine(flag.after ?? flag.chosen)}`]
  });
  html.querySelector(SURFACES.messageContent)?.appendChild(row);
  // The owner acknowledges the change once (ARCHITECTURE.md §5 law 3); the card recalls a dismissed popup.
  if ( canAnswerFor(actor) && !momentAcknowledged(message, MASTERY_SWAP_FLAG) ) {
    pendingRow(message, row, { latch: { sub: "masteryDone", show: () => showSwapDone(message, flag) }, answer: { label: "OK", style: { margin: "0.25rem 0 0" } } });
  }
}

// The answer, given on any client, withdraws the swap's popup on this one (§5 law 4): every GM screen may hold one for an unowned subject, and the latch is per client.
listen("updateChatMessage", "mastery-record", message => {
  const flag = readFlag(message, MASTERY_SWAP_FLAG);
  if ( flag && (flag.status !== "pending") ) void closePopup(message, MASTERY_SWAP_FLAG);
});

listen("dnd5e.renderChatMessage", "mastery-record", (message, html) => {
  try {
    if ( isCard(message, CARD.attack) ) drawMissing(message, html);
    else drawFeature(message, html);
    const swap = readFlag(message, MASTERY_SWAP_FLAG);
    if ( swap ) drawSwap(message, html, swap);
  } catch(err) {
    log.error(`The mastery record's row could not be drawn.`, err);
  }
});

/* --- the party view ------------------------------------------------------------------------------ */

/** The party against its allowance, one row each — the GM's table. */
export function partyViewHTML() {
  const rows = partyActors().map(actor => {
    const r = recordOf(actor);
    // The same slot list as the popups; a chosen kind the sheet shows an unproficient weapon of is named.
    const chips = r.allowance ? slotListHTML(kindRows(r).map(k => (r.unproficient.includes(k.base) ? { ...k, name: `${k.name} (not proficient)` } : k)), r.allowance) : "<em>none</em>";
    const tone = { over: "rgb(180,70,60)", open: "rgb(222,120,40)", full: "rgb(70,150,95)", none: "rgb(120,120,120)" }[r.state];
    const word = (r.state === "over") ? `over by ${r.chosen.length - r.allowance}` : (r.state === "open") ? `${r.open} open` : (r.state === "full") ? "full" : "no mastery";
    const classes = [...actor.items].filter(i => i.type === "class").map(i => `${i.name} ${i.system?.levels ?? ""}`).join(" / ");
    return `<tr style="border-left:3px solid ${tone};">
      <td style="padding:0.3rem 0.4rem;"><b>${esc(actor.name)}</b><br><span style="opacity:0.7;font-size:var(--font-size-11,11px);">${esc(classes)}</span></td>
      <td style="padding:0.3rem 0.4rem;text-align:center;">${r.allowance}</td>
      <td style="padding:0.3rem 0.4rem;">${chips}</td>
      <td style="padding:0.3rem 0.4rem;white-space:nowrap;color:${tone};">${word}</td></tr>`;
  }).join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:var(--font-size-12,12px);">
    <thead><tr style="font-size:var(--font-size-10,10px);letter-spacing:0.08em;text-transform:uppercase;opacity:0.7;"><th style="text-align:left;padding:0.2rem 0.4rem;">Character</th><th style="padding:0.2rem 0.4rem;">Allows</th><th style="text-align:left;padding:0.2rem 0.4rem;">Chosen</th><th style="text-align:left;padding:0.2rem 0.4rem;">State</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" style="padding:0.4rem;"><em>No party member found — set a primary party, or give a character a player owner.</em></td></tr>`}</tbody></table>
    <div style="margin-top:0.4rem;font-size:var(--font-size-11,11px);opacity:0.7;">The list is the sheet's own (Weapon Proficiencies → Mastery); the fill tops it up on the GM's load, the swap after a Long Rest.</div>`;
}

/** The GM's party view, one window: a second click fronts the open one (null then). */
export function openPartyView() {
  return openMomentPopup(MODULE_ID, "masteryParty", null, {
    gate: false,
    title: "Weapon Mastery — the party", icon: "fa-solid fa-medal", width: 560,
    content: bfCard({ eyebrow: "Weapon Mastery", tone: "neutral", title: "The party's chosen kinds against the allowance" }) + `<div style="margin:0.4rem 0.1rem;">${partyViewHTML()}</div>`,
    buttons: [{ action: "ok", label: "OK", default: true }]
  });
}

// The group sheet's header controls (Foundry's `getHeaderControls<Class>` hook): the GM's door.
listen("getHeaderControlsGroupActorSheet", "mastery-record", (_app, controls) => {
  if ( !game.user.isGM ) return;
  controls.push({ icon: "fa-solid fa-medal", label: "Weapon masteries", action: "bfMasteryRecord", onClick: () => { void openPartyView(); } });
});

listen("ready", "mastery-record", () => {
  const mod = game.modules.get(MODULE_ID);
  if ( mod ) mod.api = Object.assign(mod.api ?? {}, { masteryRecord: { recordOf, fillActors, answerSwap, openPartyView } });
});
