/**
 * By the Books — token lights, senses and sizes: a use or effect whose text changes the token, carried on an effect.
 */
import { MODULE_ID, readFlag, canApplyTo, drivesMomentFor, isActiveGM, queueFlagWrite, statContext, resolveUuid, resolveUuidAsync, log } from "./core.js";
import { ruleHTML } from "./rule-text.js";
import { lower, namesAnswering, profileEffectSync } from "./lookup.js";
import { tokenLightEntries, tokenSenseEntries, tokenSizeEntries, listedNames } from "./decide/registry.js";
import { registerResumable } from "./ui.js";
import { bfCard, ruleLine } from "./decide/present.js";
import { TOKEN_LIGHTS, TOKEN_SENSES, TOKEN_SIZES } from "./decide/registry.js";
import { lightRowKey, lightOutKey, lightAdopts, lightItemNames, lightChanges, lightTargets, lightLasts, tokenOwnLight, gearLightWords, senseRowKey, senseChanges, carriesSense,
  sizeRowFor, sizeAfter, sizeChanges, carriesSize } from "./decide/token-lights.js";
import { targetsOf } from "./decide/card.js";
import { effectRecord, joinEffectReceipt } from "./decide/receipt.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";
import { tokenDocOf } from "./geometry.js";

// TOKEN LIGHTS (registry TOKEN_LIGHTS): a `token.*` change on an effect lights the bearer's tokens and
// lives the effect's life; no token document is written. `self`: the pack's Searing Radiance sits on a
// DAMAGE activity that lands nothing, so it is landed here (emanations.js and clock-riders.js read it).
// The caster's client stamps the use's card; the flow elect applies it. A row's `out` activity stamps
// its card the same way, and the elect deletes the caster's standing light: the token's own comes back.

const LIGHT_FLAG = "tokenLight";
const listed = () => listedNames(tokenLightEntries());

/** The table's name for this use's item, or null. */
const itemNameOf = activity => activity?.item ? namesAnswering([activity.item], lightItemNames(TOKEN_LIGHTS))[0] : null;

/** The row this use answers to, as `{ key, ...row }`, or null. */
function rowFor(activity) {
  const key = lightRowKey(TOKEN_LIGHTS, { itemName: itemNameOf(activity), activityName: activity?.name }, listed());
  return key ? { key, ...TOKEN_LIGHTS[key] } : null;
}

/** The row whose light this use puts out, as `{ key, ...row }`, or null. */
function outRowFor(activity) {
  const key = lightOutKey(TOKEN_LIGHTS, { itemName: itemNameOf(activity), activityName: activity?.name }, listed());
  return key ? { key, ...TOKEN_LIGHTS[key] } : null;
}

// A `targets` row cast AT someone lights them, not a summoned object: the system's summon prompt
// is switched off for that use only.
listen("dnd5e.preUseActivity", "token-lights", (activity, usageConfig) => {
  try {
    const row = rowFor(activity);
    if ( (row?.on !== "targets") || !game.user.targets.size ) return;
    usageConfig.create ??= {};
    usageConfig.create.summons = false;
  } catch(err) { log.warn(`Could not switch off the summon for a token light.`, err); }
});

listen("dnd5e.postUseActivity", "token-lights", (activity, usageConfig, results) => {
  try {
    const actor = activity?.actor;
    if ( !actor?.isOwner ) return;
    const outRow = outRowFor(activity);
    if ( outRow ) {
      stampOut(outRow, activity, results);
      return;
    }
    const row = rowFor(activity);
    if ( !row ) return;
    // The summon menu put the light on an OBJECT (SUMMON_LIGHTS): summons.js places it; no token is lit,
    // and a recast that ends the caster's earlier light ends the one on a token too.
    if ( usageConfig?.[MODULE_ID]?.lightOn === "object" ) {
      if ( row.recast === "ends" ) void putOutStanding(row.key, actor.uuid);
      return;
    }
    const message = (results?.message instanceof ChatMessage) ? results.message : null;
    const tok = tokenDocOf(actor, { activity });
    const snapshot = message ? targetsOf(message) : [];
    const live = [...game.user.targets].filter(t => t.actor).map(t => ({ uuid: t.actor.uuid, name: t.name }));
    const targets = lightTargets(row, { self: { uuid: actor.uuid, name: tok?.name ?? actor.name },
      targets: (snapshot.length ? snapshot : live).map(t => ({ uuid: t.uuid, name: t.name })) });
    if ( !targets.length ) return;
    const payload = { ...statContext(actor.uuid), key: row.key, itemUuid: activity.item.uuid, activityUuid: activity.uuid,
      targets, done: false };
    if ( message ) void message.setFlag(MODULE_ID, LIGHT_FLAG, payload).catch(err => log.error(`Could not stamp the token light.`, err));
    else void applyLight(payload);   // no card to carry it: this client lands what it may
  } catch(err) {
    log.error(`Token light failed — set the token's light by hand.`, err);
  }
});

/** Every effect this row's light stands on for this caster, across the world's actors and every scene's unlinked ones. */
function standingLights(key, sourceUuid) {
  const out = [];
  const actors = new Set(game.actors);
  for ( const scene of game.scenes ) for ( const t of scene.tokens ) if ( t.actor && !t.actorLink ) actors.add(t.actor);
  for ( const actor of actors ) {
    for ( const e of actor.effects ) {
      const f = readFlag(e, LIGHT_FLAG);
      if ( f && (f.key === key) && (f.sourceUuid === sourceUuid) ) out.push(e);
    }
  }
  return out;
}

/**
 * The caster's standing light of a row put out where this client may write (a recast on an object, a row's
 * `out` use). Returns how many lights that were still shining went out.
 */
async function putOutStanding(key, sourceUuid) {
  let n = 0;
  for ( const e of standingLights(key, sourceUuid) ) {
    if ( !canApplyTo(e.parent) ) continue;
    const shining = e.active;
    await e.delete().then(() => { if ( shining ) n += 1; },
      err => log.warn(`Could not put the light out — delete it by hand.`, err));
  }
  return n;
}

/**
 * A row's `out` activity was used: its card is stamped for the elect to put the caster's light out; with no
 * card, this client puts out what it may.
 */
function stampOut(row, activity, results) {
  const actor = activity.actor;
  const message = (results?.message instanceof ChatMessage) ? results.message : null;
  const tok = tokenDocOf(actor, { activity });
  const payload = { ...statContext(actor.uuid), key: row.key, itemUuid: activity.item.uuid, activityUuid: activity.uuid,
    out: true, name: tok?.name ?? actor.name, done: false };
  if ( message ) void message.setFlag(MODULE_ID, LIGHT_FLAG, payload).catch(err => log.error(`Could not stamp the light going out.`, err));
  else void putOutStanding(row.key, actor.uuid);
}

/** The use's own effect this row's light adopts (`lightAdopts`): an effect the activity applies, of the row's name. */
function adoptedEffect(row, item, activity) {
  for ( const profile of activity?.applicableEffects ?? [] ) {
    const effect = profileEffectSync(profile, item);
    const use = { itemName: itemNameOf(activity), activityName: activity?.name, activityType: activity?.type, effectName: effect?.name, effectType: effect?.type };
    if ( lightAdopts(TOKEN_LIGHTS, use, listed()) === row.key ) return effect;
  }
  return null;
}

/**
 * The effect data this row lands on one creature: the pack's own effect (the row's `effect`, else the use's own
 * effect it adopts) or the module's, the light added.
 */
function lightEffectData(row, item, activity, target, sourceUuid, ruleHtml = "") {
  const base = row.effect ? item?.effects?.find(e => lower(e.name) === lower(row.effect)) ?? null : adoptedEffect(row, item, activity);
  if ( row.effect && !base ) return null;
  // An `ends: "enchantment"` row's clock is its enchantment's (the activity carries none of its own).
  const enchantment = (row.ends === "enchantment") ? item?.effects?.find(e => (e.type === "enchantment") && (lower(e.name) === lower(row.key))) ?? null : null;
  const data = base ? base.toObject() : {
    name: item?.name ?? row.key, img: item?.img ?? "icons/magic/light/explosion-star-glow-silhouette.webp",
    type: "base", description: ruleHtml,
    duration: enchantment ? { ...(enchantment._source?.duration ?? {}) } : (activity?.duration?.getEffectData?.() ?? {})
  };
  delete data._id;
  // The pack's own clock for its effect — or, clockless, the activity's.
  if ( base ) foundry.utils.mergeObject(data, activity?.getAppliedEffectChanges?.(base, { target }) ?? {});
  data.system ??= {};
  data.system.changes = [...(data.system.changes ?? []), ...lightChanges(row)];
  data.disabled = false;
  data.transfer = false;
  data.origin = item?.uuid ?? null;
  foundry.utils.mergeObject(data, { flags: { [MODULE_ID]: { [LIGHT_FLAG]: { key: row.key, sourceUuid } } } });
  return data;
}

/**
 * Land a payload's light: the caster's earlier light put out when the row says a recast ends it,
 * a stale copy of this row's light on a target replaced, then the effect created on every target
 * this client may write. Returns what landed and what could not.
 */
async function applyLight(payload) {
  const row = TOKEN_LIGHTS[payload.key] ? { key: payload.key, ...TOKEN_LIGHTS[payload.key] } : null;
  if ( !row ) return { landed: [], skipped: [] };
  // live only: the item the use named — a cantrip and a species feature are never used up
  const item = resolveUuid(payload.itemUuid);
  // live only: its activity, for the same reason — the effect takes the live clock
  const activity = resolveUuid(payload.activityUuid);
  const landed = [];
  const skipped = [];
  if ( row.recast === "ends" ) {
    for ( const e of standingLights(row.key, payload.sourceUuid) ) {
      if ( canApplyTo(e.parent) ) await e.delete().catch(() => {});
    }
  }
  for ( const t of payload.targets ?? [] ) {
    const actor = await resolveUuidAsync(t.uuid);
    if ( !(actor instanceof Actor) ) continue;
    if ( !canApplyTo(actor) ) { skipped.push(t.name); continue; }
    const stale = actor.effects.filter(e => readFlag(e, LIGHT_FLAG)?.key === row.key);
    if ( stale.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id)).catch(() => {});
    const data = lightEffectData(row, item, activity, actor, payload.sourceUuid, await ruleHTML(row.rule));
    if ( !data ) { skipped.push(t.name); continue; }
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    if ( effect ) landed.push({ uuid: actor.uuid, name: t.name, img: actor.img ?? null, effectId: effect.id, effectName: effect.name, effectImg: effect.img ?? null });
  }
  return { landed, skipped };
}

async function driveLight(message) {
  let claimed = false;
  await queueFlagWrite(message, LIGHT_FLAG, current => {
    if ( current.done ) return false;
    current.done = true;
    claimed = true;
  });
  if ( !claimed ) return;
  const payload = readFlag(message, LIGHT_FLAG);
  // An `out` use: the caster's light deleted, the count written back for the card. Nothing landed, so no receipt.
  if ( payload?.out ) {
    const putOut = await putOutStanding(payload.key, payload.sourceUuid);
    // A light set on the token itself outlives the spell's; the card names it, so it is not taken for the flame.
    const own = tokenOwnLight(tokenDocOf(resolveUuid(payload.sourceUuid ?? null))?._source?.light);
    await queueFlagWrite(message, LIGHT_FLAG, current => {
      current.putOut = putOut;
      if ( own ) current.ownLight = own;
    });
    return;
  }
  const { landed, skipped } = await applyLight(payload);
  await queueFlagWrite(message, LIGHT_FLAG, current => { current.landed = landed; current.skipped = skipped; });
  // The effect receipt: its revert takes the light off with the effect.
  const row = TOKEN_LIGHTS[payload.key];
  const description = await ruleHTML(row?.rule);
  if ( landed.length ) await queueFlagWrite(message, "effectReceipt", current => {
    for ( const l of landed ) joinEffectReceipt(current, { uuid: l.uuid, name: l.name, img: l.img,
      effects: [effectRecord({ id: l.effectId, name: l.effectName, img: l.effectImg, description }, statContext(payload.sourceUuid ?? null))] });
  });
}

// On the flow elect, on arrival, on the stamp's update and on reload — once, behind the claim.
registerResumable(LIGHT_FLAG, {
  pending: flag => !flag?.done && (!!flag?.out || !!flag?.targets?.length),
  drives: flag => drivesMomentFor(flag.sourceUuid ?? null),
  drive: driveLight
});

/* --- the card says it (R5) -------------------------------------------------------------------- */

listen("dnd5e.renderChatMessage", "token-lights", (message, html) => {
  const f = readFlag(message, LIGHT_FLAG);
  const row = TOKEN_LIGHTS[f?.key];
  if ( !f?.done || !row ) return;
  const line = document.createElement("div");
  if ( f.out ) {
    // An `out` use says so only when a light was still shining.
    if ( !f.putOut ) return;
    line.innerHTML = bfCard({
      eyebrow: "Token light", tone: "neutral",
      title: `${f.key} — ${f.name}'s light goes out`,
      subtitle: `${row.out} puts it out · ${f.ownLight
        ? `the token keeps the light set on it: ${gearLightWords(f.ownLight)}` : "the token's own light is back"}`,
      lines: [ruleLine(row.rule)]
    });
    html.querySelector(SURFACES.messageContent)?.appendChild(line);
    return;
  }
  if ( !(f.landed || f.skipped) ) return;
  const names = (f.landed ?? []).map(l => l.name);
  line.innerHTML = bfCard({
    eyebrow: "Token light", tone: names.length ? "good" : "neutral",
    title: names.length ? `${f.key} — ${names.join(", ")} shed${names.length === 1 ? "s" : ""} light: ${row.bright} ft Bright, ${row.dim - row.bright} ft more Dim`
      : `${f.key} — no light landed`,
    subtitle: [
      lightLasts(row),
      (f.skipped ?? []).length ? `not landed (no permission here): ${f.skipped.join(", ")}` : null,
      row.caveat ?? null
    ].filter(Boolean).join(" · "),
    lines: [ruleLine(row.rule)]
  });
  html.querySelector(SURFACES.messageContent)?.appendChild(line);
});

// An `ends: "enchantment"` light goes out with its enchantment: the weapon's copy deleted (or the use's
// enchantment ended early), the bearer's light is deleted on the elect.
listen("deleteActiveEffect", "token-lights", effect => {
  try {
    if ( !isActiveGM() || (effect.type !== "enchantment") || !(effect.parent instanceof Item) ) return;
    const actor = effect.parent.actor;
    if ( !actor ) return;
    const keys = Object.entries(TOKEN_LIGHTS).filter(([k, r]) => (r.ends === "enchantment") && (lower(k) === lower(effect.name))).map(([k]) => k);
    if ( !keys.length ) return;
    // Only when no other copy of it stands on the bearer's items (a re-use moved it to another weapon).
    const still = actor.items.some(i => !answersItem(i, effect.name)
      && i.effects.some(e => (e.id !== effect.id) && (e.type === "enchantment") && (lower(e.name) === lower(effect.name))));
    if ( still ) return;
    const lit = actor.effects.filter(e => keys.includes(readFlag(e, LIGHT_FLAG)?.key));
    if ( lit.length ) void actor.deleteEmbeddedDocuments("ActiveEffect", lit.map(e => e.id))
      .catch(err => log.warn(`Could not put the light out — delete it by hand.`, err));
  } catch(err) {
    log.warn(`Could not put an enchantment's light out — delete it by hand.`, err);
  }
});

/** The feature item itself carries the enchantment as its SOURCE; it never counts as a standing copy. */
const answersItem = (item, name) => lower(item.name) === lower(name);

// TOKEN SENSES (registry TOKEN_SENSES): the pack's own effect gains the changes as it is created, on
// whichever client creates it.

listen("preCreateActiveEffect", "token-lights", (effect, data) => {
  try {
    if ( !(effect.parent instanceof Actor) ) return;   // the item's own copy stays as the pack ships it
    const key = senseRowKey(TOKEN_SENSES, effect.name, listedNames(tokenSenseEntries()));
    if ( !key ) return;
    const changes = [...(effect._source.system?.changes ?? data?.system?.changes ?? [])];
    if ( carriesSense(changes) ) return;
    effect.updateSource({ "system.changes": [...changes, ...senseChanges(TOKEN_SENSES[key])] });
  } catch(err) { log.warn(`Could not add the token sense — set the token's vision by hand.`, err); }
});

// TOKEN SIZES: the senses' shape — size, width and height added as the pack's effect is created; a step
// counts from the bearer's size at that moment.

listen("preCreateActiveEffect", "token-lights", (effect, data) => {
  try {
    const actor = effect.parent;
    if ( !(actor instanceof Actor) ) return;
    const found = sizeRowFor(TOKEN_SIZES, effect.name, listedNames(tokenSizeEntries()));
    if ( !found ) return;
    const changes = [...(effect._source.system?.changes ?? data?.system?.changes ?? [])];
    if ( carriesSize(changes) ) return;
    const sizes = CONFIG.DND5E?.actorSizes ?? {};
    const size = sizeAfter(found.entry, actor.system?.traits?.size ?? "med", sizes);
    if ( !size ) return;
    effect.updateSource({ "system.changes": [...changes, ...sizeChanges(size, sizes)] });
  } catch(err) { log.warn(`Could not add the size — resize the token by hand.`, err); }
});
