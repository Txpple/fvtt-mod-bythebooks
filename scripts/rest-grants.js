/**
 * By the Books — MACHINE layer (ARCHITECTURE.md §2): THE REST GRANTS — what a feature gives at a
 * rest that the platform does not (decide/registry.js REST_GRANTS; Resourceful's Heroic
 * Inspiration). The grant rides `dnd5e.preRestCompleted`'s one actor update (`result.updateData`),
 * on the resting client, and the rest card says what was gained. Nothing is asked.
 */
import { MODULE_ID, readFlag, isActiveGM, queueFlagWrite, canAnswerFor, statContext, resolveUuid, resolveUuidAsync, log, claimLanding, claimHolds } from "./core.js";
import { lower, activityNamed, asiAssigned, featureNamed } from "./lookup.js";
import { answers, listedNames, restGrantEntries } from "./decide/registry.js";
import { bfCard, esc, holdBarHTML, foldedRuleHTML, pickInputHTML, ruleLine } from "./decide/present.js";
import { CAST_RIDERS, REST_GRANTS, TURN_GRANTS } from "./decide/registry.js";
import { distribution } from "./decide/cast-riders.js";
import { coatSaveAbility } from "./decide/chips.js";
import { riderPartFormula } from "./decide/clock.js";
import { holdsTemp, mealStanding, restEnds, songCard, songFloat } from "./decide/rest-grants.js";
import { SURFACES } from "./surfaces.js";
import { nearestFeet, tokenOf, tokensOf } from "./geometry.js";
import { effectSourceOf, isPartyMember } from "./shared.js";
import { openMomentPopup, registerRelay, registerResumable, armAskTimer, disarmAskTimer, subjectOwns, pendingRow, closePopup, postCard, postAnswer, pickInputs, pickedAll, pickInputAt } from "./ui.js";
import { listen, listenOnce } from "./dispatch.js";

/** What a grant writes, by its `grant` word — the sheet facts the table knows how to set. */
const GRANT_WRITES = {
  inspiration: actor => ((actor.type === "character") && (actor.system?.attributes?.inspiration !== true))
    ? { "system.attributes.inspiration": true } : null
};

/** What a grant is called on the card. */
const GRANT_LABEL = { inspiration: "Heroic Inspiration" };

/** The listed rows this actor's sheet holds for this rest, with the write each one makes (nothing already had). */
function grantsFor(actor, restType) {
  const on = listedNames(restGrantEntries());
  const out = [];
  for ( const [name, row] of Object.entries(REST_GRANTS) ) {
    if ( row.to || row.block ) continue;   // given to others, asked after the rest (the song, below); a block is not a grant
    if ( !on.has(lower(name)) || !row.rests.includes(restType) ) continue;
    if ( !featureNamed(actor, featureOf(name, row)) ) continue;
    const write = GRANT_WRITES[row.grant]?.(actor);
    if ( write ) out.push({ name, grant: row.grant, write });
  }
  return out;
}

/** The listed `block` rows standing on this rester for this rest — the pack's effect, its origin the row's item. */
function blocksFor(actor, restType) {
  const on = listedNames(restGrantEntries());
  const out = [];
  for ( const [name, row] of Object.entries(REST_GRANTS) ) {
    if ( !row.block || !on.has(lower(name)) || !row.rests.includes(restType) ) continue;
    const worn = actor.effects.some(e => !e.disabled && (lower(e.name) === lower(row.effect)) && answers(name, effectSourceOf(e)?.item ?? null));
    if ( worn ) out.push({ name, effect: row.effect });
  }
  return out;
}

listen("dnd5e.preRestCompleted", "rest-grants", (actor, result, config) => {
  try {
    if ( !(actor instanceof Actor) || !result?.updateData ) return;
    const restType = result.type ?? config?.type ?? "long";
    // A curse on the rest (Cursed Touch): nothing is gained — the rest's writes are emptied, the card says so.
    const blocks = blocksFor(actor, restType);
    if ( blocks.length ) {
      for ( const k of Object.keys(result.updateData) ) delete result.updateData[k];
      if ( Array.isArray(result.updateItems) ) result.updateItems.length = 0;
      result.dhd = 0;
      result.dhp = 0;
      result.bfRestBlocks = blocks;
      return;
    }
    const grants = grantsFor(actor, restType);
    if ( !grants.length ) return;
    for ( const g of grants ) foundry.utils.mergeObject(result.updateData, g.write);
    result.bfRestGrants = grants.map(({ name, grant }) => ({ name, grant }));
  } catch(err) {
    log.error(`Rest grant failed — the rest goes on without it.`, err);
  }
});

// The rest card says what was gained — stamped once the card exists; a blocked rest says why nothing was.
listen("dnd5e.restCompleted", "rest-grants", (_actor, result) => {
  const grants = result?.bfRestGrants;
  const blocks = result?.bfRestBlocks;
  const message = result?.message;
  if ( !message?.isOwner ) return;
  if ( blocks?.length ) {
    void message.setFlag(MODULE_ID, "restBlock", blocks)
      .catch(err => log.error(`Rest block line failed.`, err));
    return;
  }
  if ( !grants?.length ) return;
  void message.setFlag(MODULE_ID, "restGrant", grants)
    .catch(err => log.error(`Rest grant line failed.`, err));
});

listen("dnd5e.renderChatMessage", "rest-grants", (message, html) => {
  try {
    const blocks = readFlag(message, "restBlock");
    if ( !blocks?.length ) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const host = root?.querySelector(SURFACES.messageContent);
    if ( !host || host.querySelector("[data-bf-rest-block]") ) return;
    for ( const b of blocks ) {
      const line = document.createElement("div");
      line.setAttribute("data-bf-rest-block", "");
      line.innerHTML = bfCard({ eyebrow: b.name, tone: "bad", title: "no benefit from this rest", subtitle: `${b.effect} stands` });
      host.appendChild(line);
    }
  } catch(err) {
    log.error(`Rest block line failed to draw.`, err);
  }
});

/* --- what a rest ends (RULINGS *Rests end the short effects*) ------------------------------------------ */

const ENDED_FLAG = "restEnded";

// On the resting client: a rest ends every effect lasting no longer than it (a Short Rest an hour, a Long
// Rest 8), Concentration included (the system's own end, its dependents with it), and a Long Rest every
// Concentration. A summon standing on such an effect is dismissed with it (summons.js); an effect with no
// duration (a feature's mark, a companion, a lit torch) stands. The rest card names what ended.
listen("dnd5e.restCompleted", "rest-grants", (actor, result, config) => {
  try {
    const type = result?.type ?? config?.type;
    if ( !(actor instanceof Actor) || !actor.isOwner || ((type !== "short") && (type !== "long")) ) return;
    void endAtRest(actor, type, result?.message ?? null)
      .catch(err => log.error(`Could not end the rest's short effects — delete them by hand.`, err));
  } catch(err) {
    log.error(`Could not end the rest's short effects — delete them by hand.`, err);
  }
});

async function endAtRest(actor, type, message) {
  const effects = actor.effects.contents.map(e => ({ id: e.id, name: e.name,
    concentration: !!e.statuses?.has?.("concentrating"), duration: e._source?.duration ?? null }));
  const { end, concentration } = restEnds(effects, type);
  const ended = [];
  for ( const id of concentration ) {
    const effect = actor.effects.get(id);
    if ( !effect ) continue;
    const name = effect.name;
    await actor.endConcentration(effect);
    ended.push(name);
  }
  const live = end.filter(id => actor.effects.has(id));
  if ( live.length ) {
    const names = live.map(id => actor.effects.get(id)?.name).filter(Boolean);
    await actor.deleteEmbeddedDocuments("ActiveEffect", live).catch(err => {
      if ( live.some(id => actor.effects.has(id)) ) throw err;   // another client's removal won the race: no error
    });
    ended.push(...names);
  }
  if ( ended.length && message?.isOwner ) await message.setFlag(MODULE_ID, ENDED_FLAG, { actorName: actor.name, type, ended });
}

listen("dnd5e.renderChatMessage", "rest-grants", (message, html) => {
  try {
    const f = readFlag(message, ENDED_FLAG);
    if ( !f?.ended?.length ) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const host = root?.querySelector(SURFACES.messageContent);
    if ( !host || host.querySelector("[data-bf-rest-ended]") ) return;
    const line = document.createElement("div");
    line.setAttribute("data-bf-rest-ended", "");
    line.innerHTML = bfCard({ eyebrow: (f.type === "long") ? "Long Rest" : "Short Rest", tone: "neutral",
      title: `ended: ${f.ended.join(", ")}`,
      subtitle: (f.type === "long") ? "Concentration and every effect of 8 hours or less" : "every effect of 1 hour or less, Concentration included" });
    host.appendChild(line);
  } catch(err) {
    log.error(`The rest's ended line failed to draw.`, err);
  }
});

listen("dnd5e.renderChatMessage", "rest-grants", (message, html) => {
  try {
    const grants = readFlag(message, "restGrant");
    if ( !grants?.length ) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const host = root?.querySelector(SURFACES.messageContent);
    if ( !host || host.querySelector("[data-bf-rest-grant]") ) return;
    for ( const g of grants ) {
      const line = document.createElement("div");
      line.setAttribute("data-bf-rest-grant", "");
      line.innerHTML = bfCard({ eyebrow: g.name, tone: "good", title: `${GRANT_LABEL[g.grant] ?? g.grant} gained` });
      host.appendChild(line);
    }
  } catch(err) {
    log.error(`Rest grant line failed to draw.`, err);
  }
});

/*
 * THE SONG — a grant GIVEN to allies after the rest (`to: "allies"`), Careful Spell's picker shape:
 * the resting client posts the ask (no card when nobody could take it); the popup has no clock (a
 * rest is nobody's wait); the write to other actors is the elect's. Heroic Inspiration's landing posts
 * the song's own card and floats over each recipient on every client. Chef's meal heals eaters who
 * spent Hit Dice that Short Rest (RULINGS *Where the table bends the rule*) — one still resting
 * carries `mealFed` and heals as its rest ends.
 */

const SONG_FLAG = "restSong";
const SPENT_FLAG = "restSpent";   // a Short Rest card's Hit Dice spent (the meal reads it)
const FED_FLAG = "mealFed";       // an eater still resting, carrying the Chef's meal

/** The feature a row is read off — its own name, or the feat it is a benefit of (Chef's two). */
const featureOf = (name, row) => row.feature ?? name;

/** The listed `to: "allies"` rows this actor holds for this rest — `[{ name, row, item }]`. */
function songRowsFor(actor, restType) {
  const on = listedNames(restGrantEntries());
  const out = [];
  for ( const [name, row] of Object.entries(REST_GRANTS) ) {
    if ( (row.to !== "allies") || !on.has(lower(name)) || !row.rests.includes(restType) ) continue;
    const item = featureNamed(actor, featureOf(name, row));
    if ( item ) out.push({ name, row, item });
  }
  return out;
}

/**
 * The heal activity a row reads its amount from — the named one, or (Inspiring Leader) the one for
 * the ability the feat raised: its ASI record, else the higher modifier among those the sheet keeps.
 */
function grantActivityOf(actor, item, row) {
  if ( row.activity ) return activityNamed(item, row.activity);
  if ( !row.activities ) return null;
  const offered = Object.entries(row.activities).filter(([, n]) => activityNamed(item, n)).map(([a]) => a);
  const ability = coatSaveAbility({ offered, assigned: asiAssigned(item),
    mods: Object.fromEntries(offered.map(a => [a, actor.system?.abilities?.[a]?.mod ?? 0])) });
  return ability ? activityNamed(item, row.activities[ability]) : null;
}

/** A heal activity's amount as a formula, resolved on the owner's sheet — "1d8", "13" — or null (N1). */
function grantFormulaOf(actor, activity) {
  const h = activity?.healing;
  const raw = h ? riderPartFormula({ number: h.number, denomination: h.denomination, custom: h.custom, bonus: h.bonus }) : null;
  try {
    const resolved = raw ? Roll.replaceFormulaData(raw, actor.getRollData()) : null;
    return (resolved && Roll.validate(resolved)) ? resolved : null;
  } catch { return null; }
}

/** The amount a Temporary Hit Points row gives — its formula with no dice, evaluated. */
function tempAmountOf(formula) {
  try { return formula ? Math.max(0, Math.floor(Number(Roll.safeEval(formula)) || 0)) : 0; } catch { return 0; }
}

/** The facts of a creature's latest Short Rest card — its end, the Hit Dice spent, its request — or null. */
function lastShortRestOf(actor) {
  for ( const m of game.messages.contents.slice(-300).reverse() ) {
    if ( (m.type !== "rest") || (m.system?.type !== "short") ) continue;
    const spent = readFlag(m, SPENT_FLAG);
    if ( spent?.actorUuid !== actor.uuid ) continue;
    return { at: spent.at ?? m.timestamp, hitDice: spent.hitDice ?? 0, requestId: spent.requestId ?? null };
  }
  return null;
}

/** Whether an actor already holds what the grant gives — the row greyed "(has it)". */
const HAS_GRANT = {
  inspiration: actor => actor?.system?.attributes?.inspiration === true,
  temphp: (actor, flag) => holdsTemp(actor?.system?.attributes?.hp?.temp, flag.amount),
  meal: (_actor, _flag, c) => c.meal === "none"
};

/** What a candidate's row says beside its name, greyed or not. */
function candidateNote(grant, c) {
  if ( grant === "meal" ) return (c.meal === "spent") ? `spent ${c.hitDice} Hit ${c.hitDice === 1 ? "Die" : "Dice"}`
    : (c.meal === "none") ? "spent no Hit Dice" : "still resting — when they spend a Hit Die";
  if ( grant === "temphp" ) return c.has ? `has ${c.temp} temp HP` : (c.temp ? `${c.temp} temp HP now` : "");
  return c.has ? "has it" : "";
}

/** The row a song record answers — a rest's, a turn's hand-out (`table: "turn"`, Life-Giving Force), a cast's (Inspiring Smite). */
const songRowOf = flag => ((flag?.table === "turn") ? TURN_GRANTS : (flag?.table === "cast") ? CAST_RIDERS : REST_GRANTS)[flag?.row] ?? null;

/**
 * THE HAND-OUT outside a rest: the amount already rolled (its dice on the card), given to creatures on the owner's
 * side within the row's reach — the song's popup and landing. A turn's (TURN_GRANTS `to: "ally"`, Life-Giving
 * Force): one creature gets it all. A cast's `distribute` (Inspiring Smite): the total DIVIDED as the giver likes,
 * a number per creature, "No" keeps the `cost` (the pool the row spends — only when something is given); its
 * clock (`window` seconds) gives it all to the giver (a bend by choice). No card when nobody could take it.
 */
export async function askHandOut(actor, { name, row, item, amount, roll = null, table = "turn", distribute = false, cost = null, window = 0 }) {
  const grantRow = { ...row, grant: "temphp", to: "ally" };
  const base = { status: "pending", row: name, table, grant: "temphp", itemId: item.id, actorUuid: actor.uuid, actorName: actor.name,
    cap: distribute ? 99 : 1, reach: Number.isFinite(row.reach) ? row.reach : null, amount, formula: roll?.formula ?? null, restAt: Date.now(),
    ...(distribute ? { distribute: true } : {}), ...(cost ? { cost } : {}),
    ...(window ? { window, deadline: Date.now() + (window * 1000) } : {}), ...statContext(actor.uuid) };
  const candidates = songCandidates(actor, grantRow, base).map(c => distribute ? { ...c, has: false } : c);
  if ( !candidates.some(c => !c.has) ) return null;
  const flag = { ...base, candidates };
  return postCard({
    actor, rolls: roll ? [roll] : [],
    card: bfCard({ img: item.img, eyebrow: name, tone: "pending",
      title: distribute ? `${name} — ${amount} Temporary Hit Points to divide` : `${name} — ${grantText(flag)} for another creature` }),
    flags: { [MODULE_ID]: { [SONG_FLAG]: flag } }
  });
}

/**
 * The allies the map puts within reach of the owner's token — characters on its side, one row per actor; a turn's
 * hand-out (`to: "ally"`) takes any creature on its side (a summon, an allied NPC).
 */
function songCandidates(actor, row, flag, ownRest = null) {
  const own = tokenOf(actor);
  if ( !own ) return [];
  const seen = new Set(row.self ? [] : [actor.uuid]);
  const out = [];
  for ( const t of canvas.tokens?.placeables ?? [] ) {
    const a = t.actor;
    if ( !a || seen.has(a.uuid) || ((row.to !== "ally") && (a.type !== "character")) ) continue;
    if ( t.document.disposition !== own.document.disposition ) continue;
    const feet = (a.uuid === actor.uuid) ? 0 : nearestFeet(own, t);
    if ( feet === null ) continue;
    if ( Number.isFinite(row.reach) && (feet > row.reach) ) continue;
    seen.add(a.uuid);
    const c = { uuid: a.uuid, name: t.document.name ?? a.name, tokenId: t.id, feet: Math.round(feet),
      party: isPartyMember(a.uuid), self: a.uuid === actor.uuid };
    if ( row.grant === "temphp" ) c.temp = Number(a.system?.attributes?.hp?.temp) || 0;
    if ( row.grant === "meal" ) {
      const rest = ((a.uuid === actor.uuid) && ownRest) ? ownRest : lastShortRestOf(a);
      c.meal = mealStanding({ rest, chef: { at: flag.restAt, requestId: flag.requestId } });
      c.hitDice = rest?.hitDice ?? 0;
    }
    c.has = !!HAS_GRANT[row.grant]?.(a, flag, c);
    c.note = candidateNote(row.grant, c);
    out.push(c);
  }
  return out.sort((x, y) => (Number(y.party) - Number(x.party)) || (x.feet - y.feet));
}

/** The cap a row names — "prof": the owner's Proficiency Bonus; a number; a formula on the owner's sheet. */
function capOf(actor, row) {
  if ( row.cap === "prof" ) return Math.max(1, Number(actor.system?.attributes?.prof) || 1);
  if ( Number.isFinite(row.cap) ) return Math.max(1, row.cap);
  try { return Math.max(1, Math.floor(Number(Roll.safeEval(Roll.replaceFormulaData(String(row.cap), actor.getRollData()))) || 1)); }
  catch { return 1; }
}

/** What the grant is called on the card and in the popup — the amount where there is one. */
function grantText(flag) {
  if ( flag.grant === "temphp" ) return `${flag.amount} Temporary Hit Points`;
  if ( flag.grant === "meal" ) return `an extra ${flag.formula} Hit Points`;
  return GRANT_LABEL[flag.grant] ?? flag.grant;
}

// Every Short Rest card records the Hit Dice its creature spent (dnd5e's card says it only in
// words), on the resting client, which authored the card.
listen("dnd5e.restCompleted", "rest-grants", (actor, result, config) => {
  try {
    const type = result?.type ?? config?.type;
    const message = result?.message;
    if ( (type !== "short") || !(actor instanceof Actor) || !message?.isOwner ) return;
    void message.setFlag(MODULE_ID, SPENT_FLAG, { actorUuid: actor.uuid, hitDice: Math.max(0, -(Number(result.dhd) || 0)),
      requestId: config?.request?.id ?? null, at: Date.now() }).catch(() => {});
  } catch(err) {
    log.warn(`Could not record the Hit Dice spent in the rest.`, err);
  }
});

listen("dnd5e.restCompleted", "rest-grants", (actor, result, config) => {
  try {
    if ( !(actor instanceof Actor) || !actor.isOwner ) return;
    const restType = result?.type ?? config?.type ?? "long";
    for ( const { name, row, item } of songRowsFor(actor, restType) ) {
      const base = { status: "pending", row: name, grant: row.grant, itemId: item.id, actorUuid: actor.uuid, actorName: actor.name,
        cap: capOf(actor, row), reach: Number.isFinite(row.reach) ? row.reach : null, restAt: Date.now(),
        requestId: config?.request?.id ?? null, ...statContext(actor.uuid) };
      if ( (row.grant === "temphp") || (row.grant === "meal") ) {
        const formula = grantFormulaOf(actor, grantActivityOf(actor, item, row));
        if ( !formula ) {
          log.warn(`${name}: its heal activity could not be read off ${actor.name}'s sheet — give it by hand.`);
          continue;
        }
        base.formula = formula;
        if ( row.grant === "temphp" ) {
          base.amount = tempAmountOf(formula);
          if ( !(base.amount > 0) ) continue;
        }
      }
      const ownRest = { at: base.restAt, hitDice: Math.max(0, -(Number(result?.dhd) || 0)), requestId: base.requestId };
      const candidates = songCandidates(actor, row, base, ownRest);
      if ( !candidates.some(c => !c.has) ) continue;   // nobody who could take it
      const flag = { ...base, candidates };
      void postCard({
        actor,
        card: bfCard({ img: item.img, eyebrow: name, tone: "pending", title: `${name} — ${grantText(flag)} for allies` }),
        flags: { [MODULE_ID]: { [SONG_FLAG]: flag } }
      }).catch(err => log.error(`${name}'s ask could not be posted.`, err));
    }
  } catch(err) {
    log.error(`The rest song failed — give it by hand.`, err);
  }
});

// The rest card's own activity list: the pack ships one activity per ability and the feat raised
// ONE (grantActivityOf); the card keeps that row, called by the row's `label`.
listen("dnd5e.renderChatMessage", "rest-grants", (message, html) => {
  try {
    if ( message.type !== "rest" ) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const rows = root?.querySelectorAll?.(SURFACES.cardActivityRow);
    if ( !rows?.length ) return;
    // the rest message's own actor (dnd5e lists ITS activities), never the speaker's token copy
    const actor = message.system?.actor ?? ChatMessage.getSpeakerActor(message.speaker);
    const restType = message.system?.type;
    if ( !actor || !restType ) return;
    for ( const { row, item } of songRowsFor(actor, restType) ) {
      if ( !row.activities ) continue;
      const kept = grantActivityOf(actor, item, row);
      const others = new Set(Object.values(row.activities).map(n => activityNamed(item, n)?.uuid).filter(u => u && (u !== kept?.uuid)));
      for ( const li of rows ) {
        if ( others.has(li.dataset.activityUuid) ) li.remove();
        else if ( kept && (li.dataset.activityUuid === kept.uuid) && row.label ) {
          const sub = li.querySelector(".subtitle");
          if ( sub ) sub.textContent = row.label;
        }
      }
    }
  } catch(err) {
    log.warn(`The rest card's activity list could not be trimmed.`, err);
  }
});

/* --- the answer: the GM folds it, a player sends it ---------------------------------------------- */

/** The picks a record allows — the offered allies without the grant, at most the cap; a divided hand-out's
 * `{ uuid, n }` never past its total. */
function allowedPicks(flag, picks) {
  const allowed = new Set((flag.candidates ?? []).filter(c => !c.has).map(c => c.uuid));
  if ( flag.distribute ) return distribution({ total: flag.amount, picks, allowed });
  return [...new Set(picks ?? [])].filter(u => allowed.has(u)).slice(0, flag.cap);
}

async function answerSong(message, picks, { declined = false, timedOut = false } = {}) {
  const flag = readFlag(message, SONG_FLAG);
  if ( flag?.status !== "pending" ) return;
  const chosen = declined ? [] : allowedPicks(flag, picks);
  const marks = { ...(declined ? { declined: true } : {}), ...(timedOut ? { timedOut: true } : {}) };
  if ( isActiveGM() ) {
    await queueFlagWrite(message, SONG_FLAG, current => {
      if ( current.status !== "pending" ) return false;
      Object.assign(current, { status: "resolved", picks: allowedPicks(current, chosen), answeredAt: Date.now(), ...marks });
    });
    return;
  }
  await postAnswer("restSongAnswer", {
    noGM: `${flag.row}: a GM must be on to give ${grantText(flag)} — give it on each sheet by hand.`,
    actor: resolveUuid(flag.actorUuid),
    card: "", toElect: true,
    flags: { [MODULE_ID]: { restSongAnswer: { messageId: message.id, picks: chosen, ...marks } } }
  });
}

registerRelay("restSongAnswer", {
  flagKey: SONG_FLAG,
  targetOf: a => a.messageId,
  owns: () => isActiveGM(),
  cleanup: true,
  fold: (current, a) => {
    if ( current.status !== "pending" ) return false;
    Object.assign(current, { status: "resolved", picks: a.declined ? [] : allowedPicks(current, a.picks), answeredAt: Date.now(),
      ...(a.declined ? { declined: true } : {}), ...(a.timedOut ? { timedOut: true } : {}) });
  }
});

/** The meal's dice for each eater, rolled on ONE card (the dice show), healed on each sheet. */
async function serveMeal(flag, eaters, { chefName = flag.actorName } = {}) {
  if ( !eaters.length ) return [];
  const rolls = [];
  const served = [];
  for ( const actor of eaters ) {
    const roll = await new Roll(flag.formula).evaluate();
    rolls.push(roll);
    await actor.applyDamage([{ value: roll.total, type: "healing" }]);
    served.push({ name: actor.name, total: roll.total });
  }
  await postCard({
    alias: chefName, rolls,
    card: bfCard({ eyebrow: "Replenishing Meal", tone: "good",
      title: served.map(s => `${s.name} +${s.total}`).join(", "),
      subtitle: `${chefName}'s cooking — ${flag.formula} Hit Points each, on top of the Hit Dice spent` })
  });
  return served;
}

/**
 * The song's own card as it lands (a grant the table sees nowhere else: Heroic Inspiration) — who sang, who
 * received it, the rule under its tick — spoken by the singer. Nothing when nobody was given it.
 */
async function postSongCard(flag, given) {
  const row = songRowOf(flag);
  const words = songCard({ grant: flag.grant, benefit: row?.rule?.benefit ?? null, row: flag.row,
    label: GRANT_LABEL[flag.grant] ?? flag.grant, singer: flag.actorName, given });
  if ( !words ) return;
  const singer = resolveUuid(flag.actorUuid);
  await postCard({
    ...(singer ? { actor: singer } : { alias: flag.actorName }),
    card: bfCard({ img: singer?.items?.get(flag.itemId)?.img ?? null, tone: "good", ...words, lines: [ruleLine(row?.rule)] })
  });
}

/** The elect lands the picks: each sheet written (or, for a meal still waiting, marked), the names written back for the card. */
async function landSong(message) {
  if ( !(await claimLanding(message, SONG_FLAG, current => current.status === "resolved")) ) return;
  const flag = readFlag(message, SONG_FLAG);
  const given = [];
  const waiting = [];
  try {
    const picked = [];
    for ( const uuid of flag.picks ?? [] ) {
      const target = await resolveUuidAsync(uuid);
      if ( target instanceof Actor ) picked.push(target);
    }
    if ( flag.distribute ) {
      // A divided hand-out: each its own number (Temporary Hit Points never stack — only a larger pool is written);
      // the cost paid once, only when something was given.
      for ( const p of (flag.picks ?? []) ) {
        const target = await resolveUuidAsync(p.uuid);
        if ( !(target instanceof Actor) ) continue;
        const name = flag.candidates.find(c => c.uuid === p.uuid)?.name ?? target.name;
        if ( holdsTemp(target.system?.attributes?.hp?.temp, p.n) ) { given.push(`${name} (keeps more)`); continue; }
        await target.update({ "system.attributes.hp.temp": p.n });
        given.push(`${name} ${p.n}`);
      }
      const owner = (flag.picks ?? []).length ? resolveUuid(flag.actorUuid) : null;
      const pool = owner && flag.cost?.itemId ? owner.items?.get(flag.cost.itemId) : null;
      if ( pool ) await pool.update({ "system.uses.spent": Number(pool.system?.uses?.spent ?? 0) + 1 });
    } else if ( flag.grant === "meal" ) {
      // Judged afresh at the landing — an eater may have finished its rest since the ask.
      const now = [];
      for ( const target of picked ) {
        const standing = mealStanding({ rest: lastShortRestOf(target), chef: { at: flag.restAt, requestId: flag.requestId } });
        if ( standing === "spent" ) now.push(target);
        else if ( standing === "resting" ) {
          await target.setFlag(MODULE_ID, FED_FLAG, { chef: flag.actorName, formula: flag.formula, at: flag.restAt,
            requestId: flag.requestId ?? null, cardId: message.id });
          waiting.push(target.name);
        }
      }
      given.push(...(await serveMeal(flag, now)).map(s => `${s.name} +${s.total}`));
    } else {
      for ( const target of picked ) {
        const write = (flag.grant === "temphp")
          ? (holdsTemp(target.system?.attributes?.hp?.temp, flag.amount) ? null : { "system.attributes.hp.temp": flag.amount })
          : GRANT_WRITES[flag.grant]?.(target);
        if ( write ) await target.update(write);
        // Temp HP names only those who gained them (a pool that grew since the ask keeps its own).
        if ( write || (flag.grant !== "temphp") ) given.push(flag.candidates.find(c => c.uuid === target.uuid)?.name ?? target.name);
      }
      await postSongCard(flag, given)
        .catch(err => log.warn(`${flag.row}'s card could not be posted — the sheets are written.`, err));
    }
  } catch(err) {
    log.error(`${flag.row}'s grant failed part-way — check the sheets.`, err);
  } finally {
    await queueFlagWrite(message, SONG_FLAG, current => {
      current.applied = true; current.applying = false; current.given = given;
      if ( waiting.length ) current.waiting = waiting;
    });
  }
}

registerResumable(SONG_FLAG, {
  pending: flag => (flag?.status === "resolved") && !flag.applied && !claimHolds(flag.applying),
  drives: () => isActiveGM(),
  drive: landSong
});

// An eater still resting when the meal was served is healed at its own rest's end, on its own
// client, if it spent Hit Dice in that rest; a meal from another sitting is dropped.
listen("dnd5e.restCompleted", "rest-grants", (actor, result, config) => {
  try {
    if ( !(actor instanceof Actor) || !actor.isOwner ) return;
    const fed = readFlag(actor, FED_FLAG);
    if ( !fed ) return;
    const type = result?.type ?? config?.type;
    const rest = { at: Date.now(), hitDice: Math.max(0, -(Number(result?.dhd) || 0)), requestId: config?.request?.id ?? null };
    const standing = (type === "short") ? mealStanding({ rest, chef: { at: fed.at, requestId: fed.requestId } }) : "none";
    void (async () => {
      await actor.unsetFlag(MODULE_ID, FED_FLAG);
      if ( standing === "spent" ) await serveMeal({ formula: fed.formula, actorName: fed.chef }, [actor]);
    })().catch(err => log.error(`${fed.chef}'s meal could not be served — heal ${fed.formula} by hand.`, err));
  } catch(err) {
    log.error(`The meal at the rest's end failed.`, err);
  }
});

/* --- the popup (Careful Spell's picker) and the card ---------------------------------------------- */

async function showSongPopup(message) {
  const flag = readFlag(message, SONG_FLAG);
  if ( flag?.status !== "pending" ) return;
  const actor = resolveUuid(flag.actorUuid);
  if ( !actor ) return;
  const row = songRowOf(flag);
  const what = grantText(flag);
  // Sorted Party first, nearest first (songCandidates): the first `cap` who lack it start ticked.
  const ticked = new Set(flag.candidates.filter(c => !c.has).slice(0, flag.cap).map(c => c.uuid));
  const note = c => c.note ?? (c.has ? "has it" : "");
  const rowOf = c => `<label style="display:flex;align-items:center;gap:0.4rem;margin:0.2rem 0;${c.has ? "opacity:0.5;" : "cursor:pointer;"}">
      ${pickInputHTML({ name: "bf-rest-song", value: c.uuid, data: { token: c.tokenId ?? "", ...(c.has ? { has: "1" } : {}) }, disabled: !!c.has, checked: ticked.has(c.uuid), style: "margin:0;" })}
      <span>${esc(c.name)}${note(c) ? ` <span style="opacity:0.8">(${esc(note(c))})</span>` : ""}</span>
      <span style="margin-left:auto;font-size:var(--font-size-11,11px);opacity:0.7;">${c.self ? "you" : `${c.feet} ft`}</span></label>`;
  const group = (title, list) => list.length ? `<div style="margin:0.3rem 0;"><div style="font-size:var(--font-size-11,11px);letter-spacing:0.08em;text-transform:uppercase;opacity:0.7;margin:0.2rem 0;">${title}</div>${list.map(rowOf).join("")}</div>` : "";
  if ( flag.distribute ) return showDividePopup(message, flag, actor, row);
  const party = flag.candidates.filter(c => c.party), others = flag.candidates.filter(c => !c.party);
  const reach = Number.isFinite(flag.reach) ? `within ${flag.reach} ft` : "on the scene";
  const cap = (row?.cap === "prof") ? `up to ${flag.cap} (your Proficiency Bonus)` : (flag.cap === 1) ? "one creature" : `up to ${flag.cap}`;
  const dialog = await openMomentPopup(message, SONG_FLAG, actor, {
    title: `${flag.row} — ${flag.actorName}`, icon: (flag.grant === "inspiration") ? "fa-solid fa-music" : "fa-solid fa-heart", width: 420,
    content: bfCard({ img: actor.items.get(flag.itemId)?.img ?? null, eyebrow: flag.row, tone: "pending",
      title: `Who gets ${what}?`,
      subtitle: `allies ${reach} · ${cap}`,
      lines: [row?.rule ? foldedRuleHTML(row.rule) : ""] })
      + `<div data-bf-rest-song data-cap="${flag.cap}" style="margin:0.4rem 0;">${group("Party", party)}${group("Non-Party", others)}</div>`,
    buttons: [
      { action: "ok", label: "OK", default: true, callback: (_event, button) => {
        const picks = pickedAll(button.form, "bf-rest-song");
        void answerSong(message, picks);
      } }
    ]
  });
  syncSongCap(dialog?.element?.querySelector?.("[data-bf-rest-song]") ?? null);
}

/** A DIVIDED hand-out's popup (Inspiring Smite): a number per creature, what is left counted live; OK gives, No keeps. */
async function showDividePopup(message, flag, actor, row) {
  const rowOf = c => `<label style="display:flex;align-items:center;gap:0.4rem;margin:0.2rem 0;">
      <input type="number" name="bf-rest-song-n" min="0" max="${flag.amount}" step="1" value="0" data-uuid="${esc(c.uuid)}" data-name="${esc(c.name)}" data-token="${esc(c.tokenId ?? "")}" style="width:3.5rem;flex:0 0 auto;">
      <span>${esc(c.name)}${c.temp ? ` <span style="opacity:0.8">(${c.temp} temp HP now)</span>` : ""}</span>
      <span style="margin-left:auto;font-size:var(--font-size-11,11px);opacity:0.7;">${c.self ? "you" : `${c.feet} ft`}</span></label>`;
  const reach = Number.isFinite(flag.reach) ? `within ${flag.reach} ft` : "on the scene";
  await openMomentPopup(message, SONG_FLAG, actor, {
    title: `${flag.row} — ${flag.actorName}`, icon: "fa-solid fa-heart", width: 420,
    content: bfCard({ img: actor.items.get(flag.itemId)?.img ?? null, eyebrow: flag.row, tone: "pending",
      title: `Divide ${flag.amount} Temporary Hit Points`, subtitle: `creatures ${reach}, you among them${flag.cost ? ` · 1 ${flag.cost.name}` : ""}`,
      lines: [row?.rule ? foldedRuleHTML(row.rule) : ""] })
      + `<div data-bf-divide data-total="${flag.amount}" style="margin:0.4rem 0;">${flag.candidates.map(rowOf).join("")}`
      + `<div data-bf-divide-left style="text-align:right;font-size:var(--font-size-11,11px);opacity:0.8;">${flag.amount} to give · ${flag.amount} left</div></div>`
      + holdBarHTML(flag, "to answer"),
    buttons: [
      { action: "ok", label: "OK", default: true, callback: (_event, button) => {
        const picks = pickInputs(button.form, "bf-rest-song-n").map(i => ({ uuid: i.dataset.uuid, n: Number(i.value) || 0 }));
        void answerSong(message, picks);
      } },
      { action: "no", label: "No", callback: () => { void answerSong(message, [], { declined: true }); } }
    ]
  });
}

// A number typed: what is left counted, the over-giving box trimmed.
listenOnce("ready", "rest-grants", () => document.addEventListener("input", ev => {
  const input = pickInputAt(ev.target, "bf-rest-song-n");
  const box = input?.closest?.("[data-bf-divide]");
  if ( !box ) return;
  const total = Number(box.dataset.total) || 0;
  const inputs = pickInputs(box, "bf-rest-song-n");
  const others = inputs.filter(i => i !== input).reduce((n, i) => n + Math.max(0, Number(i.value) || 0), 0);
  if ( (Number(input.value) || 0) > (total - others) ) input.value = String(Math.max(0, total - others));
  const given = others + Math.max(0, Number(input.value) || 0);
  const left = box.querySelector("[data-bf-divide-left]");
  if ( left ) left.textContent = `${total} to give · ${total - given} left`;
}));

/* --- the clock (a divided hand-out): all to the giver, on whoever drives the giver's moments ---------- */

const songTimers = new Map();
function armSongTimer(message) {
  armAskTimer(songTimers, message, SONG_FLAG, live => {
    const f = readFlag(live, SONG_FLAG);
    return answerSong(live, [{ uuid: f.actorUuid, n: f.amount }], { timedOut: true });
  }, { owns: subjectOwns(f => f.actorUuid) });
}

/** With the cap reached the unticked rows grey; one below it they come back. An ally who has it stays greyed. */
function syncSongCap(box) {
  if ( !box ) return;
  const cap = Number(box.dataset.cap) || 99;
  const boxes = pickInputs(box, "bf-rest-song").filter(b => !b.dataset.has);
  const on = boxes.filter(b => b.checked).length;
  for ( const b of boxes ) if ( !b.checked ) b.disabled = on >= cap;
}

// A tick pings its creature's token and keeps the cap (Careful's picker, one listener for every popup).
listenOnce("ready", "rest-grants", () => document.addEventListener("change", ev => {
  const input = pickInputAt(ev.target, "bf-rest-song");
  if ( !input ) return;
  const tok = tokenOf(input.dataset.token);
  if ( input.checked && tok ) { try { canvas.ping(tok.center); } catch { /* no canvas to ping */ } }
  syncSongCap(input.closest("[data-bf-rest-song]"));
}));

/** The card's line — who was given it, or that it waits. */
function songLine(flag) {
  if ( flag.distribute ) {
    if ( flag.declined ) return `${flag.row} — kept, nothing given`;
    if ( flag.applied ) return (flag.given ?? []).length
      ? `${flag.row} — ${flag.given.join(", ")}${flag.timedOut ? " (timer: all to the giver)" : ""}${flag.cost ? ` · 1 ${flag.cost.name} spent` : ""}` : `${flag.row} — no one was given any`;
    if ( flag.status === "resolved" ) return `${flag.row} — giving…`;
    return `asking ${flag.actorName} how to divide ${flag.amount} Temporary Hit Points`;
  }
  const label = grantText(flag);
  if ( flag.applied ) {
    const given = (flag.given ?? []).length ? `${label} — ${flag.given.join(", ")}` : "";
    const waiting = (flag.waiting ?? []).length ? `still resting: ${flag.waiting.join(", ")} (when they spend a Hit Die)` : "";
    return [given, waiting].filter(Boolean).join(" · ") || "no one was picked";
  }
  if ( flag.status === "resolved" ) return `giving ${label}…`;
  return `asking ${flag.actorName} who gets ${label}`;
}

listen("dnd5e.renderChatMessage", "rest-grants", (message, html) => {
  try {
    const flag = readFlag(message, SONG_FLAG);
    if ( !flag ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-rest-song-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-rest-song-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = `<i class="${(flag.grant === "inspiration") ? "fa-solid fa-music" : "fa-solid fa-heart"}" data-tooltip="${esc(flag.row)}"></i> ${esc(songLine(flag))}`;
    if ( flag.status === "pending" ) {
      const may = canAnswerFor(resolveUuid(flag.actorUuid));
      pendingRow(message, div, {
        bar: !!flag.deadline && holdBarHTML(flag, "to answer"),
        latch: may && { sub: SONG_FLAG, show: () => showSongPopup(message) },
        answer: may && "Answer",
        arm: !!flag.deadline && armSongTimer
      });
    }
    content.appendChild(div);
  } catch(err) { log.warn(`The rest song line could not render.`, err); }
});

// An answer anywhere closes the popup everywhere (law 4); a landed grant floats over its recipients.
listen("updateChatMessage", "rest-grants", message => {
  const flag = readFlag(message, SONG_FLAG);
  if ( !flag ) return;
  if ( flag.status === "pending" ) { armSongTimer(message); return; }
  disarmAskTimer(songTimers, message.id);
  void closePopup(message, SONG_FLAG);
  floatSong(message, flag);
});

/* --- the float: "+Heroic Inspiration" over each recipient, every client, once --------------------------- */

const floated = new Set();

/** Display only: each client raises the text over the recipients' tokens it can see. Live updates only. */
function floatSong(message, flag) {
  try {
    const float = songFloat(flag, GRANT_LABEL[flag.grant] ?? flag.grant);
    if ( !float || floated.has(message.id) ) return;
    floated.add(message.id);
    if ( !canvas?.interface?.createScrollingText ) return;
    for ( const uuid of float.uuids ) {
      for ( const token of tokensOf(resolveUuid(uuid)) ) {
        if ( !token.visible || token.document.isSecret ) continue;
        canvas.interface.createScrollingText(token.center, float.text, {
          anchor: CONST.TEXT_ANCHOR_POINTS.CENTER, direction: CONST.TEXT_ANCHOR_POINTS.TOP,
          distance: 2 * token.h, fontSize: 28, fill: "#ffffff", stroke: 0x000000, strokeThickness: 4, jitter: 0.25
        });
      }
    }
  } catch(err) { log.warn(`The song's float could not draw.`, err); }
}

// What landed before this client loaded has already floated.
listenOnce("ready", "rest-grants", () => {
  for ( const m of game.messages ?? [] ) if ( readFlag(m, SONG_FLAG)?.applied ) floated.add(m.id);
});
