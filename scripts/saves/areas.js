/**
 * By the Books — MACHINE, part of scripts/saves/ (ARCHITECTURE.md §7): a placed area is the demand's
 * authority — adoption, the toolbar area's claim, the spent-area sweep. The area is a REGION tied by
 * `flags.dnd5e.activity`; the card's render is the reliability floor.
 */
import { readFlag, queueFlagWrite, drivesMomentFor, log } from "../core.js";
import { cardActivity } from "../lookup.js";
import { saveTargetEntry } from "../decide/demand.js";
import { regionShapeTypeFor } from "../decide/geometry.js";
import { tokensInRegions } from "../geometry.js";
import { saveDemandable, emanationReach, metamagicForDemand, areaChoiceForDemand } from "./demand.js";
import { spentAreaListed } from "../decide/registry.js";
import { listen } from "../dispatch.js";

const activityOfRegion = region => region?.getFlag?.("dnd5e", "activity") ?? null;

function regionsForActivity(activityUuid) {
  const found = [];
  for ( const scene of game.scenes ) {
    for ( const r of scene.regions ) {
      if ( activityOfRegion(r) === activityUuid ) found.push(r);
    }
  }
  return found;
}

/**
 * Who an area use's DAMAGE lands on (the no-save applier, the damage cast's dice): the creatures the
 * activity's newest placed area on the scene holds, an Emanation's origin and a listed row's reach left out
 * as the demand leaves them; null when no area stands on the map.
 * @returns {{ uuid: string, name: string }[]|null}
 */
export function areaOccupants(activity, sceneId) {
  const scene = game.scenes.get(sceneId ?? "") ?? canvas?.scene ?? null;
  const regions = (scene?.regions ?? []).filter(r => activityOfRegion(r) === activity?.uuid);
  if ( !regions.length ) return null;
  const born = r => r._stats?.createdTime ?? 0;
  const newest = regions.reduce((a, b) => (born(b) > born(a) ? b : a));
  return (emanationReach(activity, tokensInRegions([newest]) ?? []) ?? []).map(c => ({ uuid: c.uuid, name: c.name }));
}

/** The Region shape a demand's area will wear, through the system's map; null = no toolbar adoption. */
function expectedShapeType(flag) {
  if ( !flag.templateType ) return null;
  return regionShapeTypeFor(CONFIG.DND5E?.areaTargetTypes?.[flag.templateType]?.template ?? null);
}

/** A TOOLBAR-drawn region: Foundry's template shim marks it, no activity owns it. */
const isBareTemplate = region => !!region.getFlag("core", "MeasuredTemplate") && !activityOfRegion(region);

/** A waiting demand CLAIMS the newest bare template of its shape on the CURRENT scene (`createdTime`
 * is not always readable; the scene walls out fossils) by stamping the activity flag. */
async function claimBareRegion(card, flag) {
  const expected = expectedShapeType(flag);
  if ( !expected ) return null;
  const here = canvas?.scene;
  if ( !here ) return null;
  const candidates = [];
  for ( const r of here.regions ) {
    if ( !isBareTemplate(r) ) continue;
    if ( r.shapes?.[0]?.type !== expected ) continue;
    const born = r._stats?.createdTime ?? r._source?._stats?.createdTime ?? null;
    if ( born && (born < card.timestamp) ) continue; // predates the cast — decoration
    candidates.push({ r, born: born ?? 0 });
  }
  if ( !candidates.length ) return null;
  candidates.sort((a, b) => a.born - b.born);
  const region = candidates.at(-1).r;
  await region.setFlag("dnd5e", "activity", flag.activityUuid);
  return region;
}

/** One refresh in flight per card, ONE re-run queued. ⚠ Render and createRegion land together at
 * the cast; a dropped request would leave the demand empty. */
const templateRefreshes = new Map();   // card id → { again: boolean }

/** Re-derive a live demand's targets from its regions (verdicts kept, leavers drop, arrivals join);
 * idempotent. ⚠ The render is the floor: createRegion fires BEFORE the stamp. Never await canvas. */
export async function refreshDemandFromTemplates(card) {
  if ( !drivesMomentFor(readFlag(card, "saves")?.sourceUuid ?? null) ) return;
  const inFlight = templateRefreshes.get(card.id);
  if ( inFlight ) { inFlight.again = true; return; }
  const latch = { again: false };
  templateRefreshes.set(card.id, latch);
  try {
    const flag = readFlag(card, "saves");
    if ( flag?.status !== "pending" ) return;
    // A triggered (pinned) demand shares the cast's activity; the area is not its authority.
    if ( flag.pinnedTargets ) return;
    // An adopted emanation's cast (Spirit Guardians, Moonbeam — EMANATIONS): once its demand is populated,
    // every later save is the region's trigger's (enter, turn end, the area moved) — an arrival never joins
    // the cast's, or it would be asked twice (the spells slice).
    if ( flag.templated && (flag.effectsHandled === "emanation") ) return;
    const wasWaiting = !(flag.targets ?? []).length;
    if ( !wasWaiting && !(flag.targets ?? []).some(t => !t.done) ) return;
    if ( wasWaiting ) {
      // ⚠ The NEWEST same-activity cast owns the area — ANY newer cast disarms this one, or both
      // would match the claimed region and apply.
      const newer = game.messages.contents.some(m => {
        if ( (m.id === card.id) || (m.timestamp <= card.timestamp) ) return false;
        const f = readFlag(m, "saves");
        return (f?.activityUuid === flag.activityUuid) && !f.pinnedTargets;   // a triggered demand is not a cast
      });
      if ( newer ) return;
    }
    let regions = regionsForActivity(flag.activityUuid);
    if ( !regions.length && wasWaiting ) {
      const claimed = await claimBareRegion(card, flag);
      if ( claimed ) regions = [claimed];
    }
    if ( !regions.length ) return;
    const activity = cardActivity(card, flag.activityUuid);
    // CHOSEN_AREAS: asked when the area lands, filtered to the answer on every re-read.
    const choice = await areaChoiceForDemand(card, activity, emanationReach(activity, tokensInRegions(regions)) ?? []);
    if ( choice.hold ) return;   // the caster is being asked who the area affects — waiting keeps waiting
    const contained = choice.contained ?? [];
    const metamagic = await metamagicForDemand(card, activity, contained);
    if ( metamagic.hold ) return;   // the caster is being asked who the area spares — waiting keeps waiting
    // ⚠ Derive INSIDE the serializer: `flag` is stale after the awaits (a folded answer would drop).
    await queueFlagWrite(card, "saves", current => {
      // ⚠ The buzzer may have closed it; a target added to a DONE demand owes a save forever.
      if ( current.status !== "pending" ) return false;
      const prev = current.targets ?? [];
      const done = prev.filter(t => t.done);
      const keep = prev.filter(t => !t.done && contained.some(c => c.uuid === t.uuid) && !metamagic.protectedUuids.has(t.uuid));
      const fresh = contained.filter(c => !prev.some(t => t.uuid === c.uuid)).filter(c => !metamagic.protectedUuids.has(c.uuid))
        .filter(saveDemandable)
        .map(c => saveTargetEntry(c.uuid, c.name));
      const next = [...done, ...keep, ...fresh];
      if ( metamagic.heightened && (current.demand?.heightened?.uuid !== metamagic.heightened.uuid) ) current.demand = { ...(current.demand ?? {}), heightened: metamagic.heightened };
      if ( !next.length ) return false; // waiting keeps waiting; a populated one never strands
      // ⚠ LOOP PROTECTION: from the render hook, an unconditional write re-renders forever.
      const same = current.templated && (next.length === prev.length)
        && prev.every((t, i) => next[i]?.uuid === t.uuid);
      if ( same ) return false;
      // From `current`, not `wasWaiting`: arrivals during the awaits already started the clock.
      const stillWaiting = !prev.length;
      current.templated = true;
      current.targets = next;
      // The first arrivals start the withheld clock: the full window from now.
      if ( stillWaiting ) {
        current.awaitingTemplate = false;
        if ( current.window && !current.deadline ) current.deadline = Date.now() + (current.window * 1000);
      }
    });
  } catch(err) {
    log.error(`Area containment refresh failed.`, err);
  } finally {
    templateRefreshes.delete(card.id);
    if ( latch.again ) void refreshDemandFromTemplates(card);
  }
}

/** The CRUD fast path: refresh the newest live demand; a bare template goes to the newest WAITING one. */
function refreshTemplatedDemands(region) {
  const origin = activityOfRegion(region);
  const bare = isBareTemplate(region);
  if ( !origin && !bare ) return;   // somebody's region, nobody's area — a feature aura, a hazard, a door
  const live = game.messages.contents.filter(m => {
    const f = readFlag(m, "saves");
    if ( (f?.status !== "pending") || f.pinnedTargets ) return false;
    if ( origin ) return (f.activityUuid === origin)
      && (!(f.targets ?? []).length || (f.targets ?? []).some(t => !t.done));
    return !(f.targets ?? []).length && (expectedShapeType(f) === region.shapes?.[0]?.type);
  }).sort((a, b) => a.timestamp - b.timestamp);
  const card = live.at(-1);
  if ( card ) void refreshDemandFromTemplates(card);
}
listen("createRegion", "saves/areas", region => { refreshTemplatedDemands(region); });
listen("updateRegion", "saves/areas", (region, changes) => {
  // The area moved (Moonbeam walks; an attached ring follows its token), or was just claimed.
  if ( ("shapes" in changes) || ("attachment" in changes) || (changes.flags?.dnd5e && ("activity" in changes.flags.dnd5e)) ) refreshTemplatedDemands(region);
});

const templateSweepsInFlight = new Set();

/**
 * Remove a spent area once every consequence landed: instantaneous or Spent Areas-listed at once;
 * concentration when the caster drops it (a region is not a concentration dependent). A convergent
 * floor. ⚠ A re-cast reuses the activity uuid: a newer same-activity card disarms this sweep.
 */
export async function cleanupSpentTemplates(card, { endedConcentrationId = null } = {}) {
  const flag = readFlag(card, "saves");
  if ( !flag?.templated ) return;
  // On a CLOSED demand a verdict-less entry is an orphan; it does not hold the area up.
  const closed = flag.status === "done";
  if ( !(flag.targets ?? []).every(t => (t.done && (t.applied || (t.outcome === "gone"))) || (closed && !t.done)) ) return;
  if ( (flag.durationUnits !== "inst") && !spentAreaListed(flag.item?.name) ) {
    const concId = card.system?.concentration;
    if ( !concId ) return;
    // ⚠ Trust the hint: `deleteActiveEffect` can fire while the effect is still in the collection.
    if ( endedConcentrationId !== concId ) {
      const caster = card.getAssociatedActor?.();
      if ( !(caster instanceof Actor) ) return;
      if ( caster.effects.get(concId) ) return; // still concentrating — the area is alive
    }
  }
  const superseded = game.messages.contents.some(m => {
    if ( (m.id === card.id) || (m.timestamp <= card.timestamp) ) return false;
    const f = readFlag(m, "saves");
    return (f?.activityUuid === flag.activityUuid) && !f.pinnedTargets;   // a triggered demand is not a re-cast
  });
  if ( superseded ) return;
  // ⚠ ONE SWEEP IN FLIGHT PER CARD: a concurrent second delete raises "Region does not exist"
  // as a UI notification the catch below never sees.
  if ( templateSweepsInFlight.has(card.id) ) return;
  templateSweepsInFlight.add(card.id);
  try {
    for ( const scene of game.scenes ) {
      const spent = scene.regions.filter(r => activityOfRegion(r) === flag.activityUuid);
      try {
        if ( spent.length ) await scene.deleteEmbeddedDocuments("Region", spent.map(r => r.id));
      } catch { /* already gone — the other elect twin got there */ }
    }
  } finally {
    templateSweepsInFlight.delete(card.id);
  }
}

// A deleted concentration effect re-offers the sweep at once; the render floor is the backstop.
listen("deleteActiveEffect", "saves/areas", effect => {
  if ( !(effect.parent instanceof Actor) ) return;
  for ( const m of game.messages.contents ) {
    if ( m.system?.concentration !== effect.id ) continue;
    if ( !drivesMomentFor(readFlag(m, "saves")?.sourceUuid ?? null) ) continue;
    if ( readFlag(m, "saves")?.templated ) {
      void cleanupSpentTemplates(m, { endedConcentrationId: effect.id });
    }
  }
});
