/**
 * By the Books — Emanations: an aura applies itself to the creatures inside it, and the platform keeps the geometry and the clock.
 * Split shape (ARCHITECTURE.md §7); bythebooks.js is the only esmodules entry.
 * Owns the lifecycle of the rings, the floor that keeps member effects true, and the triggers.
 * Only the active GM writes. Rulings: RULINGS *Emanations*.
 */
import { MODULE_ID, readFlag, TITLE, isActiveGM, activeCombatFor, statContext, whisperNoGM, drivesMomentFor, decisionWindow, queueFlagWrite, selfIds, resolveUuid, log } from "./core.js";
import { saveDemandData, saveTargetEntry } from "./decide/demand.js";
import { lower, itemNamed, activityNamed, activityOfType, namesAnswering, applicableProfiles, wearsEffectNamed } from "./lookup.js";
import { ruleHTML } from "./rule-text.js";
import { emanationEntries, listedNames } from "./decide/registry.js";
import { reactionSpent, turnChitStands, writeTurnChit, savesOf } from "./shared.js";
import { riderPartFormula } from "./decide/clock.js";
import { tokensInRegions, tokenDocOf, tokenOnScene } from "./geometry.js";
import { emanationShapeData } from "./decide/geometry.js";
import { changeCopy } from "./decide/changes.js";
import { castLevelOn } from "./decide/card.js";
import { bfCard, ruleLine, esc, pickInputHTML } from "./decide/present.js";
import { EMANATIONS, tableIndex } from "./decide/registry.js";
import { pulseFormKey, reachAdmits, resolveChanges, emanationRange, triggerDue, healTriggerDue, memberEffectData, damageTypeFor, appliesOnScene, liveScenes, viewsHeard, ringCardDue, emanationGroup, groupMembers,
  awaySide, bandShape, bandOptions, askDefaults, creatureTypeOf, typeAdmits, movePayout, alertPhrase, alertKeysOnTurn, pickCandidates } from "./decide/emanations.js";
import { feetOf } from "./geometry.js";
import { canAnswerFor } from "./core.js";
import { momentButton, registerRelay, waitForWrite, postCard, postAnswer, pickInputs } from "./ui.js";
import { rollDamageForSave } from "./auto-damage.js";
import { applyDamagesWithReceipt } from "./auto-apply.js";
import { SURFACES } from "./surfaces.js";
import { listen, listenOnce, isPassive } from "./dispatch.js";

// An attached Region does the geometry and raises enter/exit/turn events (NOTES *v14 models an emanation end to end*).
// The pack's formulas resolve against the WEARER, so a member's effect has the source's numbers read in.

const FLAG = "emanation";                       // on the region, and on every member effect
const TYPE = `${MODULE_ID}.emanation`;          // the behaviour type this module registers
const STATUS = "bfEmanation";                   // the status a member effect wears, so the token shows it
const listed = () => listedNames(emanationEntries());
const { rowNamed, rowFor } = tableIndex(EMANATIONS);
/** An item as the Emanations table's `item ?? key` names it, for `pulseFormKey`. */
const pulseItemName = item => namesAnswering([item], Object.entries(EMANATIONS).map(([k, r]) => r.item ?? k))[0];
const colorFor = reach => (reach === "harmful") ? "#b4463c" : "#46965f";   // TONE.bad / TONE.good, solid — a Region colour is a hex
/** ⚠ LAYER visibility alone still draws the ring on the Regions layer; only LOCKED + LAYER_UNLOCKED is never drawn. */
const RING_VISIBILITY = () => CONST.REGION_VISIBILITY.LAYER_UNLOCKED;
/** The visibility fields every ring wears: never drawn, unlocked by hand to see it. */
const ringHidden = () => ({ visibility: RING_VISIBILITY(), locked: true });

/** ⚠ A token's committed placement, never an animation frame: a ring raised off interim x/y drifts for good (NOTES *An attached emanation is RE-BASED*). */
const standing = tok => ({ x: tok._source?.x ?? tok.x, y: tok._source?.y ?? tok.y,
  width: tok._source?.width ?? tok.width, height: tok._source?.height ?? tok.height, shape: tok._source?.shape ?? tok.shape });

const behaviorOf = region => region?.behaviors?.find(b => b.type === TYPE) ?? null;
const flagOf = region => readFlag(region, FLAG) ?? null;

/* --- the behaviour type: registered at init, events handled on the GM ---------------------- */

listenOnce("init", "emanations", () => {
  const Base = foundry.data?.regionBehaviors?.RegionBehaviorType;
  const F = foundry.data?.fields;
  if ( !Base || !F ) { log.warn(`Region behaviours are not available on this Foundry — emanations off.`); return; }
  const EV = CONST.REGION_EVENTS;

  class EmanationBehaviorType extends Base {
    static defineSchema() {
      return {
        key: new F.StringField({ blank: false, label: "Emanation", hint: "The By the Books emanation row this area carries." }),
        source: new F.StringField({ nullable: true, initial: null, label: "Source token", hint: "The token the emanation originates from (uuid)." }),
        item: new F.StringField({ nullable: true, initial: null, label: "Source item", hint: "The feature or spell on the source's sheet (uuid)." }),
        reach: new F.StringField({ initial: "helpful", choices: { helpful: "Allies and neutrals", harmful: "Enemies", all: "Every creature", summoner: "The summoner alone" }, label: "Reach" }),
        scaling: new F.NumberField({ integer: true, min: 0, initial: 0, label: "Upcast levels" }),
        effect: new F.ObjectField({ nullable: true, initial: null, label: "Effect", hint: "The pack's effect with the source's numbers read in." })
      };
    }
    // biome-ignore-start lint/complexity/noThisInStatic: Foundry calls a region behavior's event handlers with `this` bound to the behavior instance
    /** GM-side: the region's membership changed under this token. */
    static async #onEnter(event) { if ( !gmHandles(event) ) return; await reconcileMembers(this.region); await maybeTrigger(this, event.data?.token ?? null, "enter"); }
    static async #onExit(event) { if ( !gmHandles(event) ) return; await forgetInitial(this.region, event.data?.token ?? null); await reconcileMembers(this.region); }
    static async #onTurnEnd(event) {
      if ( !gmHandles(event) ) return;
      const token = event.data?.token ?? event.data?.combatant?.token ?? null;
      await maybeTrigger(this, token, "turnEnd");
      await maybeAlert(this, token, null, "turnEnd");
    }
    static async #onTurnStart(event) {
      if ( !gmHandles(event) ) return;
      const token = event.data?.token ?? event.data?.combatant?.token ?? null;
      await maybeHeal(this, token, "turnStart");
      await maybeTrigger(this, token, "turnStart");
      await maybeAlert(this, token, null, "turnStart");
    }
    static async #onToggle(event) { if ( !gmHandles(event) ) return; await reconcileMembers(this.region); }
    static async #onMoveIn(event) {
      if ( !gmHandles(event) ) return;
      await maybeAlert(this, event.data?.token ?? null, event.data?.movement ?? null, "moveIn");
      await maybeMoveDamage(this, event.data?.token ?? null, event.data?.movement ?? null);
    }
    static async #onMoveOut(event) { if ( !gmHandles(event) ) return; await maybeAlert(this, event.data?.token ?? null, event.data?.movement ?? null, "moveOut"); }
    static async #onMoveWithin(event) { if ( !gmHandles(event) ) return; await maybeMoveDamage(this, event.data?.token ?? null, event.data?.movement ?? null); }
    // biome-ignore-end lint/complexity/noThisInStatic: Foundry calls a region behavior's event handlers with `this` bound to the behavior instance
    static events = {
      [EV.TOKEN_ENTER]: this.#onEnter,
      [EV.TOKEN_EXIT]: this.#onExit,
      [EV.TOKEN_TURN_END]: this.#onTurnEnd,
      [EV.TOKEN_TURN_START]: this.#onTurnStart,
      [EV.TOKEN_MOVE_IN]: this.#onMoveIn,
      [EV.TOKEN_MOVE_OUT]: this.#onMoveOut,
      [EV.TOKEN_MOVE_WITHIN]: this.#onMoveWithin,
      [EV.BEHAVIOR_ACTIVATED]: this.#onToggle,
      [EV.BEHAVIOR_DEACTIVATED]: this.#onToggle
    };
  }
  CONFIG.RegionBehavior.dataModels[TYPE] = EmanationBehaviorType;
  CONFIG.RegionBehavior.typeIcons[TYPE] = "fa-solid fa-circle-dot";
  if ( CONFIG.RegionBehavior.typeLabels ) CONFIG.RegionBehavior.typeLabels[TYPE] = "By the Books Emanation";
});

/** Region events reach every client; the active GM acts. With no GM, the mover's client says so once per event. */
function gmHandles(event) {
  if ( isPassive() ) return false;   // the old package still runs: its own copy handles the region (scripts/dispatch.js)
  if ( isActiveGM() ) return true;
  if ( !game.users.activeGM && event?.user?.isSelf ) void whisperNoGM("an emanation's effect", "The aura stands on the map; apply its effect by hand.");
  return false;
}

/* --- the floor: standing effects true to membership -------------------------------------------- */

/** The scenes play is on now (decide/emanations.js liveScenes). `viewedScene` has no update hook (watchLive). */
const liveNow = () => liveScenes(game.scenes.active?.id ?? null,
  game.users.filter(u => u.active).map(u => ({ sceneId: u.viewedScene ?? null, name: u.name, isGM: u.isGM })));

/** When this client's `ready` ran; until then no other user's view has reached it. */
let readyAt = null;
const VIEWS_GRACE_MS = 3000;
/**
 * Has this client heard who views what (decide/emanations.js viewsHeard)? ⚠ A client arriving as the elect reads
 * every other user's `viewedScene` as null until the activity the server sends after its `ready` lands: a sweep
 * before that takes down every ring on a scene only another user views, and the next one raises them anew.
 */
const viewsKnown = () => viewsHeard({ readyAt, now: Date.now(), graceMs: VIEWS_GRACE_MS,
  viewers: game.users.filter(u => u.active).map(u => ({ self: u.isSelf, sceneId: u.viewedScene ?? null })) }).heard;

/** Only a LIVE scene's emanations apply (decide/emanations.js appliesOnScene); a standing ring is kept until the views are heard. */
const appliesHere = (region, scenes = liveNow()) => appliesOnScene(region?.parent?.id ?? null, scenes, { heard: viewsKnown() }).applies;

/** The aura a region carries, as one thing across every scene it stands on (decide/emanations.js emanationGroup). */
const groupOf = region => {
  const f = flagOf(region);
  const sys = behaviorOf(region)?.system;
  return emanationGroup(f?.itemUuid ?? sys?.item ?? null, f?.key ?? sys?.key ?? null, region?.id ?? "");
};

/** Every region of this aura on every scene, the active scene's first. */
function regionsOfGroup(group) {
  const out = [];
  const active = game.scenes.active;
  for ( const scene of [active, ...game.scenes.filter(s => s !== active)] ) {
    for ( const region of scene?.regions ?? [] ) if ( flagOf(region) && (groupOf(region) === group) ) out.push(region);
  }
  return out;
}

/** This aura's member effects on this actor: stamped with its group, or naming one of its regions. */
const memberEffects = (actor, group, regionIds) => actor?.effects?.filter(e => {
  const f = readFlag(e, FLAG);
  return !!f && ((f.group === group) || regionIds.has(f.regionId));
}) ?? [];

/** Everyone who could wear this aura's effect: its scenes' token actors AND every world actor (a linked actor outlives its token). */
function holdersOf(regions) {
  const out = new Set();
  for ( const scene of new Set(regions.map(r => r.parent).filter(Boolean)) ) {
    for ( const tok of scene.tokens ) if ( tok.actor ) out.add(tok.actor);
  }
  for ( const actor of game.actors ) out.add(actor);
  return out;
}

/** The actor that summoned a token's creature (dnd5e's `flags.dnd5e.summon.origin`, the summoning item's uuid), or null. */
function summonerOf(token) {
  const origin = String(token?.actor?.getFlag?.("dnd5e", "summon")?.origin ?? "");
  return origin.includes(".Item.") ? origin.split(".Item.")[0] : null;
}

/**
 * Apply the standing effect to every member, lift it from everyone else: one copy per aura across
 * all its regions (decide/emanations.js groupMembers). `gone` is a region being deleted.
 * ⚠ Membership is the containment test (geometry.js), never `region.tokens`, which lags a create or move.
 * ⚠ Serialized per aura: one move fires three events in a tick, and parallel floors double-write.
 */
const reconciling = new Map();
function reconcileMembers(region, { gone = null } = {}) {
  if ( !region?.id ) return Promise.resolve();
  const group = groupOf(region);
  const prev = reconciling.get(group) ?? Promise.resolve();
  const run = prev.then(() => reconcileAuraNow(group, gone));
  reconciling.set(group, run);
  return run.finally(() => { if ( reconciling.get(group) === run ) reconciling.delete(group); });
}
async function reconcileAuraNow(group, gone) {
  try {
    if ( !isActiveGM() ) return;
    const regions = regionsOfGroup(group).filter(r => r.id !== gone?.id);
    const regionIds = new Set([...regions.map(r => r.id), ...(gone ? [gone.id] : [])]);
    const liveSet = liveNow();
    const actorsByKey = new Map();
    const byRegion = new Map();
    const areas = regions.map(region => {
      const beh = behaviorOf(region);
      const sys = beh?.system;
      const row = sys ? rowNamed(sys.key) : null;
      const source = sys?.source ? resolveUuid(sys.source) : null;
      const applies = !!beh && !beh.disabled && !!row && !!sys.effect && listed().has(lower(row.key)) && appliesHere(region, liveSet);
      byRegion.set(region.id, { region, sys, row, source });
      const inside = [];
      for ( const entry of (applies ? tokensInRegions([region]) : null) ?? [] ) {
        const tok = region.parent.tokens.get(entry.tokenId);
        if ( !tok?.actor ) continue;
        actorsByKey.set(tok.actor.uuid, tok.actor);
        inside.push({ tokenId: tok.id, actorKey: tok.actor.uuid, disposition: tok.disposition });
      }
      return { regionId: region.id, applies, kind: row?.kind ?? "feature", reach: sys?.reach ?? "helpful",
        sourceTokenId: source?.id ?? null, sourceDisposition: source?.disposition ?? 1, inside,
        only: (sys?.reach === "summoner") ? summonerOf(source) : null };
    });
    const members = groupMembers(areas);
    for ( const [key, regionId] of members ) {
      const actor = actorsByKey.get(key);
      const { sys, row, source } = byRegion.get(regionId);
      const have = memberEffects(actor, group, regionIds);
      // One effect per aura per creature: any duplicate is tidied.
      if ( have.length > 1 ) await actor.deleteEmbeddedDocuments("ActiveEffect", have.slice(1).map(e => e.id));
      if ( have.length ) {
        // A copy missing its group or row key learns them, so it outlives the region it names.
        await queueFlagWrite(have[0], FLAG, current => {
          if ( (current.group === group) && (current.key === row.key) ) return false;
          current.group = group;
          current.key = row.key;
        });
        continue;
      }
      await actor.createEmbeddedDocuments("ActiveEffect", [memberEffectData(row, sys.effect,
        { sourceName: source?.name ?? "the source", itemUuid: sys.item, regionId, group, moduleId: MODULE_ID, flagKey: FLAG, status: STATUS,
          ruleHtml: await ruleHTML(row.rule) })]);
    }
    for ( const actor of holdersOf(gone?.parent ? [...regions, gone] : regions) ) {
      if ( members.has(actor.uuid) ) continue;
      const stale = memberEffects(actor, group, regionIds);
      if ( stale.length ) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id)).catch(() => {});
    }
  } catch(err) {
    log.error(`Emanation floor failed — check the aura's effects by hand.`, err);
  }
}

/* --- the trigger: a row's save (or plain damage), demanded of one creature over the bus ----- */

async function maybeTrigger(behType, token, cause) {
  try {
    if ( !isActiveGM() || !token?.actor ) return;
    const beh = behType.behavior;
    const sys = behType;   // the type instance IS the system data
    const row = rowNamed(sys.key);
    // RAVENLOFT — a save pulse arrives as "sourceTurnStart" / "sourceTurnEnd": the row's `pulse` admits it, never its `trigger`.
    const pulsed = (cause === "sourceTurnStart") || (cause === "sourceTurnEnd");
    if ( pulsed ? (row?.pulse?.on !== cause) : !row?.trigger?.on.includes(cause) ) return;
    if ( !row || beh.disabled || !listed().has(lower(row.key)) ) return;
    const region = behType.region;
    if ( !appliesHere(region) ) return;   // a ring on a scene nobody is playing on demands nothing
    const source = resolveUuid(sys.source);
    if ( source && (token.id === source.id) ) return;
    if ( !reachAdmits(sys.reach, source?.disposition ?? 1, token.disposition) ) return;
    // Inside at the cast = asked by the cast's demand: the area attaching around it is not an entry.
    if ( cause === "enter" ) {
      const f = flagOf(region);
      if ( f?.initial?.includes(token.id) ) { await forgetInitial(region, token); return; }
    }
    if ( !(region.tokens?.has?.(token) ?? true) && ((cause === "turnEnd") || (cause === "turnStart") || pulsed) ) return;   // its turn began or ended OUTSIDE
    // A trigger narrowed to creature types (Vile Appearance's Beasts and Humanoids): the type is a fact the sheet holds.
    if ( row.trigger?.types?.length && !row.trigger.types.includes(lower(token.actor.system?.details?.type?.value ?? "")) ) return;
    const item = resolveUuid(sys.item);
    // The save activity judges; an `area` row whose activity is plain damage (Cloud of Daggers) rolls it instead.
    const activity = (pulsed && row.pulse?.activity) ? activityNamed(item, row.pulse.activity) : activityOfType(item, "save");
    const damage = activity ? null : activityOfType(item, "damage");
    const dc = activity?.save?.dc?.value;
    const abilities = [...(activity?.save?.ability ?? [])];
    if ( !item || (activity ? (!(dc > 0) || !abilities.length) : !damage) ) return;
    const actor = token.actor;
    const combat = activeCombatFor(actor);
    const chitKey = `emanation:${region.id}`;
    const due = triggerDue({ inCombat: !!combat, chitStands: turnChitStands(actor, "rider", chitKey) });
    if ( !due.due ) return;
    if ( row.trigger?.oncePerTurn && combat ) {
      await writeTurnChit(actor, "rider", { name: `${row.key} — saved this turn`, img: item.img ?? null,
        description: `${actor.name} has made ${row.key}'s save this turn; once per turn. This chit ends with the turn.`,
        origin: item.uuid, riderKey: chitKey }).catch(() => {});
    }
    const casterActor = item.actor ?? null;
    // An `area` names its caster (nothing is attached); a ring names its source token.
    const whose = (row.kind === "area") ? (casterActor?.name ?? source?.name ?? "the caster") : (source?.name ?? casterActor?.name ?? "the caster");
    const why = (cause === "enter") ? `entered ${whose}'s ${row.key}`
      : (cause === "turnStart") ? `started its turn inside ${whose}'s ${row.key}`
      : (cause === "sourceTurnStart") ? `stands inside ${whose}'s ${row.key} as ${whose}'s turn starts`
      : (cause === "sourceTurnEnd") ? `stands inside ${whose}'s ${row.key} as ${whose}'s turn ends` : `ended its turn inside ${whose}'s ${row.key}`;
    if ( damage ) return triggerDamage({ region, row, sys, item, damage, token, actor, casterActor, source, why, due, cause });
    const onSave = activity.damage?.onSave ?? "half";
    const hasDamage = !!activity.damage?.parts?.length && (onSave !== "full");
    // A STANDING effect is the region's (the verdict never applies it), and so is a placed area's (its cast asked
    // once); a FEATURE ring with none lets the verdict land the activity's own failure effect — a monster
    // aura's Frightened or Poisoned.
    const standing = !!row.effect || (row.kind !== "feature");
    const profiles = standing ? [] : (await applicableProfiles(activity)).map(({ profile, effect }) => ({ onSave: profile.onSave, effect }));
    const effectNames = standing ? { fail: [], always: [] }
      : { fail: profiles.filter(e => !e.onSave).map(e => e.effect.name), always: profiles.filter(e => e.onSave).map(e => e.effect.name) };
    const window = decisionWindow();
    const abilityLabel = CONFIG.DND5E.abilities[abilities[0]]?.label ?? abilities[0];
    const card = await postCard({
      actor: casterActor, token: source ?? undefined,
      card: bfCard({
        img: item.img, eyebrow: "Emanation", tone: "bad",
        title: `${row.key} — ${actor.name} ${why}`,
        subtitle: `${abilityLabel} save DC ${dc} · ${due.why}${hasDamage ? ` · ${onSave === "half" ? "half on a success" : "none on a success"}` : ""}`,
        lines: [ruleLine(row.rule)]
      }),
      flags: { [MODULE_ID]: {
        saves: saveDemandData({
          stat: statContext(casterActor?.uuid ?? null),
          abilities, dc, damageOnSave: onSave, hasDamage,
          effectNames, effectsHandled: standing ? "emanation" : null,
          ...(standing ? {} : { demand: { spell: (item.type === "spell") || !!item.system?.properties?.has?.("mgc"), cast: item.type === "spell", abilities,
            statuses: [...new Set(profiles.filter(e => !e.onSave).flatMap(e => [...(e.effect?.statuses ?? [])]))], sleep: false } }),
          // ⚠ Pinned: the area adoption keys on the activity this card shares with the cast and would rewrite the targets.
          pinnedTargets: true,
          activityUuid: activity.uuid, templateType: null, templated: false,
          durationUnits: item.system?.duration?.units ?? null,
          item: { name: item.name, img: item.img ?? null }, casterName: casterActor?.name ?? null,
          scaling: Number(sys.scaling ?? 0),
          window, deadline: window ? Date.now() + (window * 1000) : null,
          targets: [saveTargetEntry(actor.uuid, token.name)]
        }),
        emanationTrigger: { key: row.key, cause, regionId: region.id, targetUuid: actor.uuid, inCombat: !!combat, why: due.why }
      } }
    });
    if ( hasDamage && card ) await rollDamageForSave(activity, card);
  } catch(err) {
    log.error(`Emanation trigger failed — ask for the save by hand.`, err);
  }
}

/**
 * An `area` whose activity is PLAIN DAMAGE (Cloud of Daggers): no save to decide it, so the rule leaves no
 * choice (R1) — the activity's damage is rolled on the caster at the cast's level and applied, receipted.
 */
async function triggerDamage({ region, row, sys, item, damage, token, actor, casterActor, source, why, due, cause = "turnEnd" }) {
  try {
    const rolls = await damage.rollDamage({ scaling: Number(sys.scaling ?? 0) }, { configure: false }, { create: false });
    const list = (rolls ?? []).filter(r => r && Number.isFinite(r.total));
    if ( !list.length ) { log.warn(`${row.key}: its damage did not roll — apply it by hand.`); return; }
    const total = list.reduce((n, r) => n + Number(r.total), 0);
    const type = list[0]?.options?.type ?? [...(damage.damage?.parts?.[0]?.types ?? [])][0] ?? null;
    // ⚠ Read the rolls BEFORE the card: ChatMessage.create serializes the array it is handed in place.
    const damages = list.map(r => ({ value: Number(r.total), type: r.options?.type ?? type ?? "slashing", properties: new Set(["mgc"]) }));
    const card = await postCard({
      actor: casterActor, token: source ?? undefined,
      rolls: [...list],
      card: bfCard({ img: item.img ?? null, eyebrow: "Emanation", tone: "bad",
        title: `${row.key} — ${actor.name} ${why}: ${total} ${type ?? ""} damage`.replace(/\s+/g, " "),
        subtitle: `no save · ${due.why}`,
        lines: [ruleLine(row.rule)] }),
      flags: { [MODULE_ID]: { emanationTrigger: { ...statContext(casterActor?.uuid ?? null), key: row.key, cause,
        regionId: region.id, targetUuid: actor.uuid, why: due.why, total, type, damage: true } } }
    });
    if ( card ) await applyDamagesWithReceipt(card, [{ uuid: actor.uuid, name: token.name }], damages, { note: row.key });
  } catch(err) {
    log.error(`${row?.key ?? "An area"}'s damage failed — apply it by hand.`, err);
  }
}

/* --- the alert: a creature moving INTO the ring reminds its source (Polearm Master's Reactive Strike) --- */

/**
 * An `alert` row: a creature that MOVED into the reach raises Hew's reminder (`hewNotice`), once per
 * movement — or, `on: "turnStart"`, one that STARTS ITS TURN inside it, once per turn (Unnerving Gaze),
 * or `on: "turnEnd"`, one that ENDS its turn inside it (Inspiring Movement, B5);
 * a `kind: "notice"` row (an area's ban on entering or leaving) posts a plain card instead.
 * tokenMoveIn fires only for a mover, and a walked move is split at each region edge, so passing
 * through is caught.
 */
const alerted = new Set();
async function maybeAlert(behType, token, movement, cause) {
  try {
    if ( !isActiveGM() || !token?.actor ) return;
    const sys = behType;
    const row = rowNamed(sys.key);
    if ( !row?.alert || (row.alert.on !== cause) || behType.behavior?.disabled || !listed().has(lower(row.key)) ) return;
    const region = behType.region;
    if ( !appliesHere(region) ) return;
    const turn = game.combat ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null;
    const key = `${region.id}|${token.id}|${cause}|${movement?.id ?? (alertKeysOnTurn(cause) && turn) ?? Date.now()}`;
    if ( row.alert.kind === "notice" ) {
      if ( alerted.has(key) ) return;
      if ( !typeAdmits(row.alert, flagOf(region)?.picked ?? askDefaults(row.ask), creatureTypeOf(token.actor.system?.details?.type ?? null)) ) return;
      alerted.add(key);
      return notice(region, row, sys, token, cause);
    }
    const source = resolveUuid(sys.source);
    const bearer = source?.actor ?? null;
    if ( !bearer || (token.id === source.id) ) return;
    if ( !reachAdmits(sys.reach, source.disposition ?? 1, token.disposition) ) return;
    if ( reactionSpent(bearer) || bearer.statuses?.has?.("incapacitated") ) return;
    if ( alerted.has(key) ) return;
    alerted.add(key);
    const item = resolveUuid(sys.item);
    const weapon = row.holding ? heldWeaponFor(bearer, row.holding) : null;
    const window = decisionWindow();
    const what = alertPhrase(cause);
    const trait = item?.system?.type?.value === "monster";
    await postCard({
      actor: bearer, token: source,
      card: bfCard({ img: item?.img ?? null, eyebrow: `${trait ? "Trait" : "Feat"} — ${item?.name ?? row.key}`, tone: "good",
        title: `${row.alert.label} — ${token.name} ${what} ${bearer.name}'s reach`,
        subtitle: weapon ? `${weapon.name} · ${weaponReachOf(weapon)} ft` : (row.range ? `${row.range} ft` : ""),
        lines: [ruleLine(row.rule), row.alert.swing, row.caveat ? `<span style="opacity:0.8;">${esc(row.caveat)}</span>` : null] }),
      flags: { [MODULE_ID]: { hewNotice: {
        attackerUuid: bearer.uuid, itemName: item?.name ?? row.key, itemImg: item?.img ?? null,
        weaponName: weapon?.name ?? null, why: `${token.name} ${what} your reach`, cause,
        label: row.alert.label, rule: row.rule, swing: row.alert.swing, targetName: token.name,
        ...(window ? { window, deadline: Date.now() + (window * 1000) } : {})
      } } }
    });
  } catch(err) {
    log.error(`${behType?.key ?? "An emanation"}'s reminder failed — the reaction is yours by hand.`, err);
  }
}

/** A `notice` alert: the area's ban said on a card as a creature moves in or out; the move is never paused (DESIGN §8). */
async function notice(region, row, sys, token, cause) {
  const item = resolveUuid(sys.item);
  const caster = item?.actor ?? null;
  await postCard({
    actor: caster ?? token.actor,
    card: bfCard({ img: item?.img ?? null, eyebrow: `${row.key} — the ban`, tone: "bad",
      title: `${row.alert.label} — ${token.name} ${cause === "moveOut" ? "leaves" : "enters"} ${caster ? `${caster.name}'s ` : "the "}${row.key}`,
      subtitle: `${token.name} ${row.alert.says}`,
      lines: [ruleLine(row.rule), row.caveat ? `<span style="opacity:0.8;">${esc(row.caveat)}</span>` : null] }),
    flags: { [MODULE_ID]: { areaNotice: { ...statContext(caster?.uuid ?? null), key: row.key, cause, regionId: region.id, tokenId: token.id, targetUuid: token.actor.uuid, label: row.alert.label } } }
  });
}

/* --- the move: an area pays per feet MOVED inside it (Spike Growth) --------------------------- */

/**
 * A `trigger on "move"` row: the feet the mover travelled INSIDE the area, from the platform's own split
 * of the move through the region, per the row's `per`, times the activity's dice — rolled on the caster
 * and applied with a receipt once the move has landed; once per movement, never a pause (DESIGN §8).
 */
const moved = new Set();
async function maybeMoveDamage(behType, token, movement) {
  try {
    if ( !isActiveGM() || !token?.actor || !movement ) return;
    const sys = behType;
    const row = rowNamed(sys.key);
    if ( !row?.trigger?.on.includes("move") || behType.behavior?.disabled || !listed().has(lower(row.key)) ) return;
    const region = behType.region;
    if ( !appliesHere(region) ) return;
    const source = resolveUuid(sys.source);
    if ( !reachAdmits(sys.reach, source?.disposition ?? 1, token.disposition) ) return;
    const key = `${region.id}|${token.id}|${movement.id ?? Date.now()}`;
    if ( moved.has(key) ) return;
    moved.add(key);
    // A teleport (Misty Step, the GM's displace) travels no feet through the spikes.
    if ( (movement.passed?.waypoints ?? []).some(w => CONFIG.Token?.movement?.actions?.[w.action]?.teleport) ) return;
    const item = resolveUuid(sys.item);
    const damage = activityOfType(item, "damage");
    if ( !item || !damage ) return;
    const segments = token.segmentizeRegionMovementPath(region, [movement.origin, ...(movement.passed?.waypoints ?? [])]);
    let units = 0;
    for ( const s of segments ) {
      const d = canvas.grid.measurePath([{ x: s.from.x, y: s.from.y }, { x: s.to.x, y: s.to.y }]).distance;
      if ( Number.isFinite(d) ) units += d;
    }
    const feet = feetOf(units, region.parent?.grid?.units ?? canvas.scene?.grid?.units) ?? 0;
    const parts = (damage.damage?.parts ?? []).map(p => ({ number: p.number, denomination: p.denomination, bonus: p.bonus, type: [...(p.types ?? [])][0] ?? null }));
    const payout = movePayout(row.trigger, { feet: Math.round(feet), parts });
    if ( !payout.formula ) return;
    const casterActor = item.actor ?? null;
    const roll = await new Roll(payout.formula, casterActor?.getRollData?.() ?? {}).evaluate();
    const type = payout.type ?? "piercing";
    const actor = token.actor;
    const card = await postCard({
      actor: casterActor, token: source ?? undefined,
      rolls: [roll],
      card: bfCard({ img: item.img ?? null, eyebrow: "Emanation", tone: "bad",
        title: `${row.key} — ${actor.name} moved ${Math.round(feet)} feet through it: ${roll.total} ${type} damage`,
        subtitle: `${payout.why} · ${payout.formula}`,
        lines: [ruleLine(row.rule), row.caveat ? `<span style="opacity:0.8;">${esc(row.caveat)}</span>` : null] }),
      flags: { [MODULE_ID]: { areaMove: { ...statContext(casterActor?.uuid ?? null), key: row.key, regionId: region.id, targetUuid: actor.uuid,
        movementId: movement.id ?? null, feet: Math.round(feet), steps: payout.steps, formula: payout.formula, total: roll.total, type } } }
    });
    if ( card ) await applyDamagesWithReceipt(card, [{ uuid: actor.uuid, name: token.name }], [{ value: roll.total, type, properties: new Set(["mgc"]) }], { note: row.key });
  } catch(err) {
    log.error(`${behType?.key ?? "An area"}'s move damage failed — apply it by hand.`, err);
  }
}

/* --- the heal: an area pays a member at a moment (Aura of Life) ------------------------------- */

/** The row's heal at the member's turn start: the activity's healing part, rolled on the caster, receipted (N1). */
async function maybeHeal(behType, token, cause) {
  try {
    if ( !isActiveGM() || !token?.actor ) return;
    const beh = behType.behavior;
    const sys = behType;
    const row = rowNamed(sys.key);
    if ( !row?.heal || beh.disabled || !listed().has(lower(row.key)) ) return;
    const region = behType.region;
    if ( !appliesHere(region) ) return;
    const source = resolveUuid(sys.source);
    if ( source && (token.id === source.id) ) return;
    if ( !reachAdmits(sys.reach, source?.disposition ?? 1, token.disposition) ) return;
    if ( !(region.tokens?.has?.(token) ?? true) ) return;
    const actor = token.actor;
    // ⚠ dnd5e marks a 0-HP creature `dead` itself: read the Hit Points, never the status.
    const due = healTriggerDue(row, { cause, hp: Number(actor.system?.attributes?.hp?.value ?? 0) });
    if ( !due.due ) return;
    const item = resolveUuid(sys.item);
    const activity = activityNamed(item, row.heal.activity);
    const part = activity?.healing;
    const raw = part ? riderPartFormula({ number: part.number, denomination: part.denomination, custom: part.custom, bonus: part.bonus }) : null;
    if ( !raw ) { log.warn(`${row.key}: no healing part on "${row.heal.activity}" — heal by hand.`); return; }
    const casterActor = item?.actor ?? null;
    const roll = await new Roll(raw, casterActor?.getRollData?.() ?? {}).evaluate();
    const type = [...(part.types ?? [])][0] ?? "healing";
    const card = await postCard({
      actor: casterActor, token: source ?? undefined,
      card: bfCard({ img: item?.img ?? null, eyebrow: "Emanation", tone: "good",
        title: `${row.key} — ${actor.name} regains ${roll.total} Hit Point${roll.total === 1 ? "" : "s"}`,
        subtitle: `${due.why} inside ${source?.name ?? "the caster"}'s ${row.key}`,
        lines: [ruleLine(row.rule)] }),
      flags: { [MODULE_ID]: { emanationHeal: { ...statContext(casterActor?.uuid ?? null), key: row.key, regionId: region.id, targetUuid: actor.uuid, formula: raw, total: roll.total, why: due.why } } }
    });
    if ( card ) await applyDamagesWithReceipt(card, [{ uuid: actor.uuid, name: token.name }], [{ value: roll.total, type, properties: new Set() }], { note: row.key });
  } catch(err) {
    log.error(`Emanation heal failed — heal by hand.`, err);
  }
}

/* --- the notice: a heal the caster AIMS is offered at their turn start, never played (Aura of Vitality) --- */

/** The turn moved: the current combatant's own spell emanations with a `remind` row say so on a card. */
listen("updateCombat", "emanations", (combat, changes) => {
  try {
    if ( !isActiveGM() ) return;
    if ( !("turn" in changes) && !("round" in changes) ) return;
    if ( !combat.started ) return;
    const token = combat.combatant?.token ?? null;
    const scene = combat.scene ?? token?.parent ?? null;
    if ( !token || !scene ) return;
    const names = listed();
    // C1 — a `bearer` ring's source turn is its SOURCE token's (the druid's), not the bearer's it stands on.
    for ( const region of scene.regions.filter(r => ["spell", "feature"].includes(flagOf(r)?.kind) && ((flagOf(r)?.sourceTokenId ?? flagOf(r)?.tokenId) === token.id)) ) {
      const row = rowNamed(flagOf(region).key);
      if ( !row || !names.has(lower(row.key)) || !appliesHere(region) ) continue;
      if ( row.remind?.on === "sourceTurnStart" ) void remind(region, row, token);
      if ( row.pick?.on === "sourceTurnStart" ) void pickCard(region, row, token, combat);
      // A pulse at the bearer's turn START (Frozen Haunt's Frozen Soul): the turn-end pulse's twin, keyed by this turn.
      if ( row.pulse?.on === "sourceTurnStart" ) {
        const beh = behaviorOf(region);
        const key = `${region.id}|${combat.round}|${combat.turn}|start`;
        if ( beh && !beh.disabled && !pulsed.has(key) ) { pulsed.add(key); void pulse(region, row, token, beh.system); }
      }
    }
  } catch(err) {
    log.error(`Emanation notice failed.`, err);
  }
});

/* --- the pick: once on each of the bearer's turns, ONE creature inside is chosen (Wrath of the Sea, B5) --- */

/**
 * A `pick` row's card at the bearer's turn start: who stands inside now, a button each. The pick demands the
 * row's save activity at that one creature (the trigger's shape); the card records it, once per turn. Nobody
 * inside — no card: the text needs a creature in the Emanation.
 */
async function pickCard(region, row, token, combat) {
  try {
    const beh = behaviorOf(region);
    if ( !beh || beh.disabled ) return;
    const sys = beh.system;
    const item = resolveUuid(sys.item);
    const activity = activityNamed(item, row.pick.activity);
    const bearer = item?.actor ?? token.actor ?? null;
    if ( !item || !activity || !bearer ) return;
    const inside = (tokensInRegions([region]) ?? []).map(e => region.parent.tokens.get(e.tokenId)).filter(t => t?.actor)
      .map(t => ({ tokenId: t.id, actorUuid: t.actor.uuid, name: t.name, disposition: t.disposition }));
    const candidates = pickCandidates(inside, { sourceTokenId: token.id, sourceDisposition: token.disposition, reach: sys.reach });
    if ( !candidates.length ) return;
    const turn = combat ? `${combat.id}|${combat.round}|${combat.turn}` : null;
    await postCard({
      actor: bearer, token,
      card: bfCard({ img: item.img ?? null, eyebrow: "Emanation", tone: "pending",
        title: `${row.key} — ${bearer.name}'s turn: choose one creature inside`,
        subtitle: `inside: ${candidates.map(c => c.name).join(", ")} · once on each of your turns`,
        lines: [ruleLine(row.rule), row.caveat ? `<span style="opacity:0.8;">${esc(row.caveat)}</span>` : null] }),
      flags: { [MODULE_ID]: { emanationPick: { ...statContext(bearer.uuid), key: row.key, regionId: region.id, tokenId: token.id,
        activityUuid: activity.uuid, activityName: activity.name, turn, candidates, picked: null, demanded: false } } }
    });
  } catch(err) {
    log.error(`${row?.key ?? "An emanation"}'s pick card failed — choose and roll the save from the sheet.`, err);
  }
}

// The pick's buttons on the bearer's card: the driver answers; the answer is a fold onto the card (R2).
listen("dnd5e.renderChatMessage", "emanations", (message, html) => {
  const p = readFlag(message, "emanationPick");
  if ( !p?.candidates?.length ) return;
  const holder = html.querySelector(SURFACES.messageContent);
  if ( !holder ) return;
  if ( p.picked ) {
    const line = document.createElement("div");
    line.style.cssText = "font-size:var(--font-size-11,11px);opacity:0.8;margin-top:0.35rem;";
    line.textContent = `Chosen: ${p.picked.name}`;
    holder.appendChild(line);
    return;
  }
  if ( !canAnswerFor(resolveUuid(p.sourceUuid)) ) return;
  const rowEl = document.createElement("div");
  rowEl.style.cssText = "display:flex;gap:0.35rem;align-items:center;margin-top:0.35rem;flex-wrap:wrap;";
  for ( const c of p.candidates ) {
    const b = momentButton(c.name, () => void choosePick(message, c));
    b.dataset.bfEmanationPick = c.tokenId;
    rowEl.appendChild(b);
  }
  holder.appendChild(rowEl);
});

async function choosePick(card, choice) {
  const flag = readFlag(card, "emanationPick");
  if ( !flag || flag.picked || !flag.candidates?.some(c => c.tokenId === choice.tokenId) ) return;
  if ( card.canUserModify?.(game.user, "update") ) {
    await queueFlagWrite(card, "emanationPick", current => {
      if ( current.picked || !current.candidates?.some(c => c.tokenId === choice.tokenId) ) return false;
      current.picked = choice;
    });
    return;
  }
  await postAnswer("emanationPickChoice", { to: selfIds(), alias: TITLE, card: `<p>${esc(choice.name)}</p>`,
    flags: { [MODULE_ID]: { emanationPickChoice: { cardId: card.id, choice } } } });
}

registerRelay("emanationPickChoice", {
  flagKey: "emanationPick",
  targetOf: a => a.cardId,
  owns: flag => drivesMomentFor(flag?.sourceUuid ?? null),
  fold: (current, a) => {
    if ( current.picked || !current.candidates?.some(c => c.tokenId === a.choice?.tokenId) ) return false;
    current.picked = a.choice;
  },
  cleanup: true
});

// The pick landed: the active GM demands the save at the chosen creature, once (the demand is the resolve).
listen("updateChatMessage", "emanations", (message, changes) => {
  try {
    if ( !isActiveGM() ) return;
    if ( !foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.emanationPick`) ) return;
    const p = readFlag(message, "emanationPick");
    if ( !p?.picked || p.demanded ) return;
    void queueFlagWrite(message, "emanationPick", current => {
      if ( current.demanded ) return false;
      current.demanded = true;
    }).then(() => demandPick(message, p));
  } catch(err) {
    log.error(`The emanation's pick failed — ask for the save by hand.`, err);
  }
});

/** The chosen creature is demanded the row's save (maybeTrigger's card, cause "pick"); the cold rolled with it. */
async function demandPick(card, p) {
  try {
    // live only: the ring's feature stands on the sheet while its effect does — the pick uses up nothing
    const activity = resolveUuid(p.activityUuid);
    const item = activity?.item ?? null;
    const region = game.scenes.get(card.speaker?.scene ?? "")?.regions?.get(p.regionId)
      ?? game.scenes.find(s => s.regions.get(p.regionId))?.regions.get(p.regionId) ?? null;
    const source = region?.parent?.tokens?.get(p.tokenId) ?? null;
    const row = rowNamed(p.key);
    const target = resolveUuid(p.picked.uuid);
    const dc = activity?.save?.dc?.value;
    const abilities = [...(activity?.save?.ability ?? [])];
    if ( !item || !row || !target || !(dc > 0) || !abilities.length ) return;
    const casterActor = item.actor ?? null;
    const onSave = activity.damage?.onSave ?? "none";
    const hasDamage = !!activity.damage?.parts?.length && (onSave !== "full");
    // A feature ring with no standing effect: the verdict lands the activity's own failure effect, if it has one.
    const profiles = (await applicableProfiles(activity)).map(({ profile, effect }) => ({ onSave: profile.onSave, effect }));
    const effectNames = { fail: profiles.filter(e => !e.onSave).map(e => e.effect.name), always: profiles.filter(e => e.onSave).map(e => e.effect.name) };
    const window = decisionWindow();
    const abilityLabel = CONFIG.DND5E.abilities[abilities[0]]?.label ?? abilities[0];
    const demand = await postCard({
      actor: casterActor, token: source ?? undefined,
      card: bfCard({
        img: item.img, eyebrow: "Emanation", tone: "bad",
        title: `${row.key} — ${p.picked.name} is chosen inside ${casterActor?.name ?? source?.name ?? "the bearer"}'s ${row.key}`,
        subtitle: `${abilityLabel} save DC ${dc} · once on each of your turns${hasDamage ? ` · ${onSave === "half" ? "half on a success" : "none on a success"}` : ""}`,
        lines: [ruleLine(row.rule), row.pick.says ? `<span style="opacity:0.8;">On a failure: ${esc(row.pick.says)}.</span>` : null]
      }),
      flags: { [MODULE_ID]: {
        saves: saveDemandData({
          stat: statContext(casterActor?.uuid ?? null),
          abilities, dc, damageOnSave: onSave, hasDamage,
          effectNames, effectsHandled: null,
          demand: { spell: !!item.system?.properties?.has?.("mgc"), cast: item.type === "spell", abilities,
            statuses: [...new Set(profiles.filter(e => !e.onSave).flatMap(e => [...(e.effect?.statuses ?? [])]))], sleep: false },
          pinnedTargets: true,
          activityUuid: activity.uuid, templateType: null, templated: false,
          durationUnits: item.system?.duration?.units ?? null,
          item: { name: item.name, img: item.img ?? null }, casterName: casterActor?.name ?? null,
          scaling: 0,
          window, deadline: window ? Date.now() + (window * 1000) : null,
          targets: [saveTargetEntry(target.uuid, p.picked.name)]
        }),
        emanationTrigger: { key: row.key, cause: "pick", regionId: p.regionId, targetUuid: target.uuid, inCombat: !!p.turn, why: "chosen this turn", pickCardId: card.id }
      } }
    });
    if ( hasDamage && demand ) await rollDamageForSave(activity, demand);
  } catch(err) {
    log.error(`${p?.key ?? "An emanation"}'s pick failed — ask for the save by hand.`, err);
  }
}

async function remind(region, row, token) {
  const sys = behaviorOf(region)?.system;
  const item = sys?.item ? resolveUuid(sys.item) : null;
  const activity = activityNamed(item, row.remind.activity);
  const caster = item?.actor ?? token.actor ?? null;
  const inside = [...(region.tokens ?? [])].filter(t => t.id !== token.id).map(t => t.name);
  await postCard({
    actor: caster, token,
    card: bfCard({ img: item?.img ?? null, eyebrow: "Emanation", tone: "pending",
      title: `${row.key} — ${caster?.name ?? token.name}'s turn: ${activity?.name ?? row.remind.activity} is yours to use`,
      subtitle: inside.length ? `inside the aura: ${inside.join(", ")}` : "nobody else stands inside the aura",
      lines: [ruleLine(row.rule), row.caveat ? `<span style="opacity:0.8;">${row.caveat}</span>` : null] }),
    flags: { [MODULE_ID]: { emanationRemind: { ...statContext(caster?.uuid ?? null), key: row.key, regionId: region.id, activityUuid: activity?.uuid ?? null, activityName: activity?.name ?? row.remind.activity } } }
  });
}

// The notice's button: the caster's client uses the activity on whatever they have targeted.
listen("dnd5e.renderChatMessage", "emanations", (message, html) => {
  const r = readFlag(message, "emanationRemind");
  if ( !r?.activityUuid ) return;
  const caster = resolveUuid(r.sourceUuid);
  if ( !canAnswerFor(caster) ) return;
  const holder = html.querySelector(SURFACES.messageContent);
  if ( !holder ) return;
  holder.appendChild(momentButton(`Use ${r.activityName}`, () => {
    // live only: the button USES the ability, and a used-up item cannot be used — the warning below is the answer
    const activity = resolveUuid(r.activityUuid);
    if ( !activity ) { ui.notifications.warn(`${TITLE}: ${r.activityName} is no longer on the sheet.`); return; }
    if ( !game.user.targets.size ) { ui.notifications.warn(`${TITLE}: target the creature to heal first, then press again.`); return; }
    void activity.use({}, {}, {});
  }));
});

/* --- the pulse: the bearer's turn ends, everyone inside takes the form's damage (Inner Radiance) --- */

/**
 * The pulse fires on the BEARER's turn end, which no region event carries (the bearer is not inside
 * its own ring). Rolled once on the bearer, applied to everyone inside. Forward moves only, once per turn.
 */
const pulsed = new Set();   // `${regionId}|${round}|${turn}` — the ended turns already paid
listen("updateCombat", "emanations", (combat, changes, options) => {
  try {
    if ( !isActiveGM() ) return;
    if ( !("turn" in changes) && !("round" in changes) ) return;
    if ( !combat.started || (options?.direction === -1) ) return;
    const prev = combat.previous ?? null;
    const ended = prev?.combatantId ? combat.combatants.get(prev.combatantId) : null;
    const token = ended?.token ?? null;
    const scene = token?.parent ?? null;
    if ( !token || !scene ) return;
    const names = listed();
    for ( const region of scene.regions.filter(r => (flagOf(r)?.kind === "feature") && (flagOf(r).tokenId === token.id)) ) {
      const row = rowNamed(flagOf(region).key);
      if ( !row?.pulse || (row.pulse.on !== "sourceTurnEnd") || !names.has(lower(row.key)) || !appliesHere(region) ) continue;
      const beh = behaviorOf(region);
      if ( !beh || beh.disabled ) continue;
      const key = `${region.id}|${prev.round}|${prev.turn}`;
      if ( pulsed.has(key) ) continue;
      pulsed.add(key);
      void pulse(region, row, token, beh.system);
    }
  } catch(err) {
    log.error(`Emanation pulse failed — apply its damage by hand.`, err);
  }
});

/** The pulse's damage off the row's activity: its formula as the pack wrote it, and its type. */
function pulseDamageOf(item, row) {
  const name = row.pulse?.activity ?? row.activity ?? null;
  const activity = name ? activityNamed(item, name) : activityOfType(item, "damage");
  const part = activity?.damage?.parts?.[0] ?? null;
  const raw = part ? riderPartFormula({ number: part.number, denomination: part.denomination, custom: part.custom, bonus: part.bonus }) : null;
  return { activity, raw, type: [...(part?.types ?? [])][0] ?? null };
}

async function pulse(region, row, token, sys) {
  try {
    const item = resolveUuid(sys?.item);
    const bearer = item?.actor ?? token.actor ?? null;
    if ( !item || !bearer ) return;
    const { activity: pulseActivity, raw, type } = pulseDamageOf(item, row);
    // RAVENLOFT — a pulse whose activity is a SAVE (Unnerving Aura): demanded of everyone inside on the trigger's path, the
    // source's turn the cause.
    if ( pulseActivity?.type === "save" ) {
      const beh = behaviorOf(region);
      const cause = (row.pulse?.on === "sourceTurnStart") ? "sourceTurnStart" : "sourceTurnEnd";
      for ( const t of (tokensInRegions([region]) ?? []).map(e => region.parent.tokens.get(e.tokenId)).filter(t => t?.actor && (t.id !== token.id)) ) {
        await maybeTrigger(beh?.system ?? sys, t, cause);
      }
      return;
    }
    if ( !raw ) { log.warn(`${row.key}: no damage part on "${row.pulse.activity}" — apply the pulse by hand.`); return; }
    const inside = (tokensInRegions([region]) ?? [])
      .map(e => region.parent.tokens.get(e.tokenId))
      .filter(t => t?.actor && (t.id !== token.id) && reachAdmits(sys.reach, token.disposition, t.disposition));
    if ( !inside.length ) return;
    const roll = await new Roll(raw, bearer.getRollData()).evaluate();
    const names = inside.map(t => t.name).join(", ");
    const card = await postCard({
      actor: bearer, token,
      rolls: [roll],
      card: bfCard({ img: item.img ?? null, eyebrow: "Emanation", tone: "bad",
        title: `${row.key} — ${roll.total} ${type ?? ""} damage at the end of ${token.name}'s turn`.replace(/\s+/g, " "),
        subtitle: `every creature within the aura: ${names}`,
        lines: [ruleLine(row.rule)] }),
      flags: { [MODULE_ID]: { emanationPulse: { ...statContext(bearer.uuid), key: row.key, regionId: region.id,
        formula: raw, total: roll.total, type, targets: inside.map(t => ({ uuid: t.actor.uuid, name: t.name })) } } }
    });
    if ( card ) await applyDamagesWithReceipt(card, inside.map(t => ({ uuid: t.actor.uuid, name: t.name })),
      [{ value: roll.total, type: type ?? "radiant", properties: new Set(["mgc"]) }], { note: row.key });
  } catch(err) {
    log.error(`${row?.key ?? "An emanation"}'s pulse failed — apply its damage by hand.`, err);
  }
}

/** Drop a token from the region's "asked at the cast" record. */
async function forgetInitial(region, token) {
  if ( !token || !flagOf(region)?.initial?.includes(token.id) ) return;
  await queueFlagWrite(region, FLAG, current => {
    if ( !current.initial?.includes(token.id) ) return false;
    current.initial = current.initial.filter(id => id !== token.id);
  }).catch(() => {});
}

/** Make a Region this module's emanation: flagged (with who stood inside), given the behaviour, attached. */
async function adoptRegion(region, { kind, key, tok, itemUuid, reach, scaling = 0, effect = null, disabled = false, source = null }) {
  // ⚠ ORDER: the "asked at the cast" record goes down FIRST, before the behaviour and attachment
  // raise tokenEnter. Geometry, not `region.tokens`, which is still empty on a new region.
  const inside = (tokensInRegions([region]) ?? []).map(e => e.tokenId);
  const initial = inside.filter(id => id && (id !== tok?.id));
  await region.update({
    color: colorFor(reach), ...ringHidden(), highlightMode: "shapes",
    flags: { [MODULE_ID]: { [FLAG]: { kind, key, tokenId: tok?.id ?? null, itemUuid, initial } } }
  });
  // C1 — a `bearer` ring's SOURCE is another token (the druid's), the attachment the bearer's.
  const sourceDoc = tokenDocOf(source ?? tok);   // a placeable has no uuid; its document does
  await region.createEmbeddedDocuments("RegionBehavior", [{ type: TYPE, name: key, disabled,
    system: { key, source: sourceDoc?.uuid ?? null, item: itemUuid, reach, scaling, effect } }]);
  if ( tok && (region.attachment?.token?.id !== tok.id) ) await region.update({ attachment: { token: tok.id } });
}

/** The scene's pixels per unit of distance — a range in the scene's units, as a region radius. */
const pxPerUnit = scene => scene.grid.size / scene.grid.distance;

/**
 * Refuse the platform's own `dnd5e.*` behaviours on an adopted ring or a listed emanation spell's
 * region, so a ring never carries two standing effects (they admit no neutrals, fire no turn events).
 */
listen("preCreateRegionBehavior", "emanations", (behavior, data) => {
  try {
    if ( !String(data?.type ?? "").startsWith("dnd5e.") ) return;
    const region = behavior?.parent;
    if ( !region ) return;
    if ( flagOf(region) ) return false;
    const item = resolveUuid(region.getFlag("dnd5e", "item"));
    const row = item ? rowFor(item) : null;
    if ( row && ((row.kind === "spell") || (row.kind === "area")) && listed().has(lower(row.key)) ) return false;
  } catch(err) {
    log.warn(`Could not judge a region behaviour — the platform's stands.`, err);
  }
});

/* --- the lifecycle: a feature's emanation stands with its token ------------------------------- */

/** The activity's size resolved on the source (it may be a formula): the given activity's, else the item's first. */
function activitySizeOf(item, rollData, activity = null) {
  const act = activity ?? item?.system?.activities?.contents?.[0];
  const raw = act?._source?.target?.template?.size ?? act?.target?.template?.size ?? null;
  if ( (raw === null) || (raw === "") ) return null;
  const n = Number(raw);
  if ( Number.isFinite(n) ) return n;
  try { const r = Roll.replaceFormulaData(String(raw), rollData); return Roll.validate(r) ? Roll.safeEval(r) : null; } catch { return null; }
}

/** The equipped weapon a `holding` row asks for — a named base item, or every named property — or null. */
function heldWeaponFor(actor, holding) {
  return actor.items.find(i => (i.type === "weapon") && (i.system?.equipped === true) && (
    (holding.base ?? []).includes(i.system?.type?.baseItem ?? "")
    || (!!holding.properties?.length && holding.properties.every(p => i.system?.properties?.has?.(p))))) ?? null;
}

/** A weapon's reach in feet: its own, else 10 with the Reach property, else 5 (the 2024 rule). */
function weaponReachOf(weapon) {
  const own = Number(weapon?.system?.range?.reach);
  if ( Number.isFinite(own) && (own > 0) ) return own;
  return weapon?.system?.properties?.has?.("rch") ? 10 : 5;
}

/** C1 — a `bearer` row (Oceanic Gift): the ring stands on the token wearing the manifest's effect, whose origin is the SOURCE's
 * feature (`bearer.of`); the source's token on the scene is where the pick and the scale come from. `{ actor, sourceTok }` or null. */
function bearerSourceOf(tok, row) {
  const worn = tok.actor.effects.find(e => e.active && (lower(e.name) === lower(row.bearer.effect)));
  const origin = worn?.origin ? resolveUuid(worn.origin) : null;
  const item = (origin instanceof Item) ? origin : (origin?.item instanceof Item) ? origin.item : null;
  const source = item?.actor ?? null;
  if ( !(source instanceof Actor) || (lower(item.name) !== lower(row.bearer.of)) || (source.uuid === tok.actor.uuid) ) return null;
  const sourceTok = tokenOnScene(source, tok.parent);
  return sourceTok ? { actor: source, sourceTok } : null;
}

/** What a feature's emanation on this token should look like now, or null when it should not stand. */
function featureSpec(tok, row) {
  // C1 — a `bearer` row reads the SOURCE's sheet for the item, the scale and the effect; the ring stands on `tok`.
  const bearer = row.bearer ? bearerSourceOf(tok, row) : null;
  if ( row.bearer && !bearer ) return null;
  const actor = bearer ? bearer.actor : tok.actor;
  const item = itemNamed(actor, row.item ?? row.key);
  if ( !item ) return null;
  for ( const name of [].concat(row.while ?? []) ) {
    if ( !wearsEffectNamed(actor, name) ) return null;   // an item's transferred effect too (Ghastly Form, Frozen Soul)
  }
  const held = row.holding ? heldWeaponFor(actor, row.holding) : null;
  if ( row.holding && !held ) return null;
  const rollData = actor.getRollData();
  const act = row.activity ? activityNamed(item, row.activity) : null;
  if ( row.activity && !act ) return null;
  const range = (row.range === "weaponReach") ? weaponReachOf(held) : emanationRange(row, rollData, activitySizeOf(item, rollData, act));
  if ( !range ) return null;
  const sourceTok = bearer?.sourceTok ?? null;
  const disabled = !!row.incapacitated && actor.statuses?.has?.("incapacitated");
  // A ring with no effect (a `pulse` row) is only the geometry the pulse reads; nobody wears it.
  if ( row.effect === null ) return { tok, actor, item, row, range, effect: null, sourceTok, disabled };
  // C1 — a `made` row (Power of the Wilds' Lion): the pack ships no member effect, so the module makes a bare one of that name.
  if ( row.made ) return { tok, actor, item, row, range, sourceTok, disabled,
    effect: { name: row.effect, img: item.img ?? null, description: null, changes: [] } };
  const effect = item.effects.find(e => lower(e.name) === lower(row.effect)) ?? null;
  if ( !effect ) return null;
  const { changes, unresolved } = resolveChanges(effect.changes.map(changeCopy), rollData);
  if ( unresolved.length ) { log.warn(`${row.key} on ${actor.name}: could not resolve ${unresolved.join(", ")} — the aura does not stand.`); return null; }
  return { tok, actor, item, row, range, sourceTok, disabled,
    effect: { name: effect.name, img: effect.img ?? item.img ?? null, description: null, changes } };
}

/** Debounced AND serialized per scene: ⚠ two overlapping sweeps each raise the same ring. */
const sweepTimers = new Map();
const sweepChains = new Map();
function scheduleScene(scene) {
  if ( !scene?.id || !isActiveGM() || sweepTimers.has(scene.id) ) return;
  sweepTimers.set(scene.id, setTimeout(() => {
    sweepTimers.delete(scene.id);
    const prev = sweepChains.get(scene.id) ?? Promise.resolve();
    const run = prev.then(() => reconcileScene(scene)).catch(err => log.error(`Emanation sweep failed.`, err));
    sweepChains.set(scene.id, run);
    void run.finally(() => { if ( sweepChains.get(scene.id) === run ) sweepChains.delete(scene.id); });
  }, 200));
}

/** Every scene that has a token of this actor on it. */
const scenesWith = actor => (actor instanceof Actor) ? game.scenes.filter(s => s.tokens.some(t => (t.actorId === actor.id) || (t.actor === actor))) : [];

/** A feature ring's identity on its card and in `ringFell`: the scene, the token, the row. */
const ringOf = (sceneId, tokenId, key) => `${sceneId}|${tokenId}|${key}`;
/** When each feature ring last fell, heard on every client (deleteRegion): a raise moments later is no news. */
const ringFell = new Map();
const RING_QUIET_MS = 10_000;
/** The newest card for a ring, as `{ verb, range }`, or null. */
function lastRingCard(ring) {
  const all = game.messages.contents;
  for ( let i = all.length - 1; i >= 0; i-- ) {
    const c = readFlag(all[i], "emanationCard");
    if ( c?.ring === ring ) return { verb: c.verb, range: c.range ?? null };
  }
  return null;
}

/** Make this scene's feature emanations true: one region per standing (token, row); spell regions only re-floored. */
async function reconcileScene(scene) {
  // Not before the views are heard: the sweep that hears them (watchLive) runs this again.
  if ( !isActiveGM() || !scene || !viewsKnown() ) return;
  const names = listed();
  const wanted = new Map();
  // ⚠ Only a LIVE scene raises a ring: a party leaves tokens on every scene it has visited.
  if ( liveNow().has(scene.id) ) {
    for ( const tok of scene.tokens ) {
      if ( !tok.actor ) continue;
      for ( const [key, row] of Object.entries(EMANATIONS) ) {
        if ( (row.kind !== "feature") || !names.has(lower(key)) ) continue;
        const spec = featureSpec(tok, { key, ...row });
        if ( spec ) wanted.set(`${tok.id}|${key}`, spec);
      }
    }
  }
  const seen = new Set();
  const removeArea = async region => { await reconcileMembers(region, { gone: region }); if ( scene.regions.get(region.id) ) await region.delete().catch(() => {}); };
  for ( const region of scene.regions.filter(r => flagOf(r)?.kind === "feature") ) {
    const f = flagOf(region);
    const id = `${f.tokenId}|${f.key}`;
    const w = wanted.get(id);
    // Not wanted, or a second area for the same aura: lifted and deleted.
    if ( !w || seen.has(id) ) { await removeArea(region); continue; }
    seen.add(id);
    wanted.delete(id);
    const beh = behaviorOf(region);
    // The radius follows the range; a ring that DRIFTED off its token (see `standing`) is put back.
    const radius = w.range * pxPerUnit(scene);
    const shape = emanationShapeData(standing(w.tok), radius);
    const base = region.shapes?.[0]?.base;
    const drifted = !base || ["x", "y", "width", "height"].some(k => base[k] !== shape.base[k]);
    if ( (region.shapes?.[0]?.radius !== radius) || drifted ) await region.update({ shapes: [shape] });
    if ( (region.visibility !== RING_VISIBILITY()) || !region.locked ) await region.update(ringHidden());
    if ( beh ) {
      const upd = {};
      if ( beh.disabled !== w.disabled ) upd.disabled = w.disabled;
      if ( !foundry.utils.objectsEqual(beh.system.effect?.changes ?? null, w.effect?.changes ?? null) ) upd["system.effect"] = w.effect;
      if ( !foundry.utils.isEmpty(upd) ) await beh.update(upd);
    }
    await reconcileMembers(region);
  }
  for ( const w of wanted.values() ) {
    try {
      // Another client's ring for it landed during this sweep: it stands; the next sweep reconciles it.
      if ( scene.regions.some(r => (flagOf(r)?.kind === "feature") && (flagOf(r).tokenId === w.tok.id) && (flagOf(r).key === w.row.key)) ) continue;
      // ⚠ No dnd5e flags: the saves machine's area adoption must never see a feature's aura as an area.
      const [region] = await scene.createEmbeddedDocuments("Region", [{
        name: `${w.row.key} [${w.actor.name}]`, color: colorFor(w.row.reach),
        shapes: [emanationShapeData(standing(w.tok), w.range * pxPerUnit(scene))],
        attachment: { token: w.tok.id },
        ...ringHidden(), highlightMode: "shapes",
        flags: { [MODULE_ID]: { [FLAG]: { kind: "feature", key: w.row.key, tokenId: w.tok.id, itemUuid: w.item.uuid,
          ...(w.sourceTok ? { sourceTokenId: w.sourceTok.id } : {}) } } }
      }], { dnd5e: { createActivityBehaviors: false } });
      if ( !region ) { log.error(`${w.row.key} around ${w.actor.name}: the region was not created.`); continue; }
      await adoptRegion(region, { kind: "feature", key: w.row.key, tok: w.tok, itemUuid: w.item.uuid, reach: w.row.reach, effect: w.effect, disabled: w.disabled,
        source: w.sourceTok ?? null });
      const ring = ringOf(scene.id, w.tok.id, w.row.key);
      if ( ringCardDue({ last: lastRingCard(ring), range: w.range, fellAt: ringFell.get(ring) ?? null, now: Date.now(), quietMs: RING_QUIET_MS }).due ) {
        await announce(w.row, w.actor, w.item, w.range, w.effect, "stands", { ring });
      }
      await reconcileMembers(scene.regions.get(region.id) ?? region);
    } catch(err) {
      log.error(`Could not raise ${w.row.key} around ${w.actor.name}.`, err);
    }
  }
  // Spell and area regions too: a scene going live or dead changes what they apply, and no event of theirs says so.
  for ( const region of scene.regions.filter(r => ["spell", "area"].includes(flagOf(r)?.kind)) ) await reconcileMembers(region);
}

/* --- the lifecycle: a spell's emanation is the region placed at the cast --------------------- */

async function adoptSpellRegion(region) {
  try {
    if ( !isActiveGM() || flagOf(region) ) return;
    const itemUuid = region.getFlag("dnd5e", "item");
    // live only: a region names its item by uuid with no card behind it — dnd5e's own region reads resolve the same way
    const item = resolveUuid(itemUuid);
    if ( !item ) return;
    const row = rowFor(item);
    if ( !row || !["spell", "area"].includes(row.kind) || !listed().has(lower(row.key)) ) return;
    const actor = item.actor ?? null;
    // The placement stamps the usage token as `flags.dnd5e.origin`. ⚠ An AREA is attached to nothing: it stays
    // where it was placed and the caster drags it (the platform raises enter for whoever it then covers).
    const originTok = resolveUuid(region.getFlag("dnd5e", "origin"));
    const tok = (row.kind === "area") ? null : (originTok?.documentName === "Token") ? originTok
      : actor?.token ?? tokenOnScene(actor, region.parent);
    const rollData = actor?.getRollData?.() ?? {};
    const effect = row.effect ? (item.effects.find(e => lower(e.name) === lower(row.effect)) ?? null) : null;
    const resolved = effect ? resolveChanges(effect.changes.map(changeCopy), rollData) : { changes: [], unresolved: [] };
    const spellLevel = Number(region.getFlag("dnd5e", "spellLevel") ?? item.system?.level ?? 0);
    const scaling = Math.max(0, spellLevel - Number(item.system?.level ?? 0));
    await adoptRegion(region, { kind: row.kind, key: row.key, tok, itemUuid, reach: row.reach, scaling,
      effect: (effect && !resolved.unresolved.length) ? { name: effect.name, img: effect.img ?? item.img ?? null, description: null, changes: resolved.changes } : null });
    const size = activitySizeOf(item, rollData);
    const drawn = region.shapes?.[0]?.radius;
    // The held spells' facets: the wall's burning band (away from the caster by default) and the ask's picks.
    const choices = await adoptChoices(region, row, (originTok?.documentName === "Token") ? originTok : tokenDocOf(actor));
    await announce(row, actor, item, size ?? (Number.isFinite(drawn) ? drawn / pxPerUnit(region.parent) : null), effect ? { name: effect.name, changes: resolved.changes } : null, "is cast",
      { activity: activityOfType(item, "save"), regionId: region.id, sceneId: region.parent?.id ?? null, ...choices });
    await reconcileMembers(region);
  } catch(err) {
    log.error(`Could not adopt a spell's emanation — its effects apply by hand.`, err);
  }
}

/* --- the held spells' facets: the band and the ask, on the region and offered on the card ------- */

/**
 * At adoption: a `band` row's region is widened on the side away from the caster (the base shape kept on
 * the flag, to re-band on a flip); an `ask` row's picks start as every option. Returns the card's facets.
 */
async function adoptChoices(region, row, casterTok) {
  const out = {};
  try {
    const f = flagOf(region) ?? {};
    const next = { ...f };
    if ( row.band ) {
      const base = region.shapes?.[0]?.toObject?.() ?? (region.shapes?.[0] ? { ...region.shapes[0] } : null);
      if ( base ) {
        const grid = region.parent?.grid?.size ?? 100;
        const centre = casterTok ? { x: (casterTok._source?.x ?? casterTok.x) + (casterTok.width ?? 1) * grid / 2, y: (casterTok._source?.y ?? casterTok.y) + (casterTok.height ?? 1) * grid / 2 } : null;
        const side = awaySide(base, centre);
        next.band = { side, base };
        out.band = { side, options: bandOptions(base), ask: row.band.ask };
      }
    }
    if ( row.ask ) {
      next.picked = askDefaults(row.ask);
      out.picks = { what: row.ask.what, label: row.ask.label, options: [...row.ask.options], picked: [...next.picked] };
    }
    // One update: the flag and the widened shape land together, so no reader sees the band without its width.
    if ( row.band || row.ask ) await region.update({
      [`flags.${MODULE_ID}.${FLAG}`]: next,
      ...(next.band ? { shapes: [bandShape(next.band.base, next.band.side, row.band.feet * pxPerUnit(region.parent))] } : {})
    });
  } catch(err) { log.warn(`${row?.key ?? "An area"}'s band or picks could not be set — edit the region by hand.`, err); }
  return out;
}

/** The card's choice folded onto the region: the band's side re-shapes it, the picks are written to its flag. Active GM only. */
async function applyCardChoices(card) {
  try {
    if ( !isActiveGM() ) return;
    const c = readFlag(card, "emanationCard");
    if ( !c?.regionId || (!c.band && !c.picks) ) return;
    const scene = c.sceneId ? game.scenes.get(c.sceneId) : null;
    const region = (scene ?? game.scenes.active)?.regions?.get(c.regionId) ?? null;
    if ( !region ) return;
    const f = flagOf(region);
    const row = f ? rowNamed(f.key) : null;
    if ( !f || !row ) return;
    const next = { ...f };
    let changed = false;
    if ( c.band && f.band && (c.band.side !== f.band.side) ) {
      next.band = { ...f.band, side: c.band.side };
      changed = true;
      await region.update({ shapes: [bandShape(f.band.base, c.band.side, (row.band?.feet ?? 10) * pxPerUnit(region.parent))] });
    }
    if ( c.picks && !foundry.utils.objectsEqual([...(c.picks.picked ?? [])].sort(), [...(f.picked ?? [])].sort()) ) {
      next.picked = [...(c.picks.picked ?? [])];
      changed = true;
    }
    if ( changed ) await region.setFlag(MODULE_ID, FLAG, next);
  } catch(err) { log.warn(`The card's choice could not reach the region — edit it by hand.`, err); }
}

listen("updateChatMessage", "emanations", message => { if ( readFlag(message, "emanationCard") ) void applyCardChoices(message); });

// The pick is a fold onto the card (R2): the GM writes it straight, a player's travels by relay; the region follows the card.
registerRelay("emanationPickAnswer", {
  flagKey: "emanationCard",
  targetOf: a => a.cardId,
  owns: flag => drivesMomentFor(flag?.sourceUuid ?? null),
  fold: (current, a) => {
    if ( a.side !== undefined ) {
      if ( !current.band || ![1, -1].includes(Number(a.side)) ) return false;
      current.band = { ...current.band, side: Number(a.side) };
      return;
    }
    if ( !current.picks?.options?.includes(a.type) ) return false;
    const picked = new Set(current.picks.picked ?? []);
    if ( picked.has(a.type) ) picked.delete(a.type); else picked.add(a.type);
    current.picks = { ...current.picks, picked: [...picked] };
  },
  cleanup: true
});

async function answerPick(card, answer) {
  const flag = readFlag(card, "emanationCard");
  if ( !flag ) return;
  if ( card.canUserModify?.(game.user, "update") ) {
    const next = { ...flag };
    if ( answer.side !== undefined ) { if ( !next.band ) return; next.band = { ...next.band, side: Number(answer.side) }; }
    else {
      if ( !next.picks?.options?.includes(answer.type) ) return;
      const picked = new Set(next.picks.picked ?? []);
      if ( picked.has(answer.type) ) picked.delete(answer.type); else picked.add(answer.type);
      next.picks = { ...next.picks, picked: [...picked] };
    }
    await card.setFlag(MODULE_ID, "emanationCard", next);
    return;
  }
  await postAnswer("emanationPickAnswer", { to: selfIds(), alias: TITLE, card: `<p>${esc(answer.type ?? String(answer.side))}</p>`,
    flags: { [MODULE_ID]: { emanationPickAnswer: { cardId: card.id, ...answer } } } });
}

const capWord = s => `${String(s).charAt(0).toUpperCase()}${String(s).slice(1)}`;

listen("dnd5e.renderChatMessage", "emanations", (message, html) => {
  const c = readFlag(message, "emanationCard");
  if ( !c?.band && !c?.picks ) return;
  const holder = html.querySelector(SURFACES.messageContent);
  if ( !holder ) return;
  const mayAnswer = canAnswerFor(resolveUuid(c.sourceUuid)) || game.user.isGM;
  // Each choice as `{ label, on, answer }`; the click is bound here, where a human fires it.
  const rows = [];
  if ( c.band ) rows.push({ text: c.band.ask ?? "Which side burns?", choices: (c.band.options ?? []).map(o => ({ label: o.label, on: o.side === c.band.side, answer: { side: o.side } })) });
  if ( c.picks ) rows.push({ text: c.picks.label ?? "Which?", choices: (c.picks.options ?? []).map(t => ({ label: capWord(t), on: (c.picks.picked ?? []).includes(t), answer: { type: t } })) });
  for ( const r of rows ) {
    const div = document.createElement("div");
    div.style.cssText = "display:flex;gap:0.35rem;align-items:center;margin-top:0.35rem;flex-wrap:wrap;";
    const label = document.createElement("span");
    label.style.cssText = "font-size:var(--font-size-11,11px);opacity:0.75;";
    label.textContent = r.text;
    div.appendChild(label);
    for ( const choice of r.choices ) {
      const b = document.createElement("button");
      b.type = "button";
      b.style.cssText = `font-size:var(--font-size-11,11px);padding:0.15rem 0.6rem;border-radius:3px;line-height:1.4;`
        + (choice.on ? "font-weight:bold;border:2px solid rgba(70,150,95,0.95);" : "opacity:0.75;");
      b.textContent = `${choice.label}${choice.on ? " ✓" : ""}`;
      b.disabled = !mayAnswer;
      b.addEventListener("click", ev => { ev.preventDefault(); void answerPick(message, choice.answer); });
      div.appendChild(b);
    }
    holder.appendChild(div);
  }
});

/* --- the cast: an area from the caster places itself on the caster ------------------------------ */

/** A listed spell row whose activity is an emanation from the caster (a `radius` template, range self). */
function castEmanationRow(activity) {
  if ( activity?.item?.type !== "spell" ) return null;
  const row = rowFor(activity.item);
  if ( !row || (row.kind !== "spell") || !listed().has(lower(row.key)) ) return null;
  return selfAreaOf(activity) ? row : null;
}

/** An area that starts on its user: a `radius` or `emanation` template with range self, on any item. */
function selfAreaOf(activity) {
  const tpl = activity?.target?.template;
  if ( !["radius", "emanation"].includes(tpl?.type) || !(Number(tpl?.size) > 0) ) return false;
  return (activity.range?.units ?? "self") === "self";
}

/** The listed `pulse` row whose FORM this activity is, or null: its use places no area and rolls no damage. */
function transformRowOf(activity) {
  if ( !activity?.item ) return null;
  const key = pulseFormKey(EMANATIONS, { itemName: pulseItemName(activity.item), activityName: activity.name }, listed());
  return key ? { key, ...EMANATIONS[key] } : null;
}

// A self-centred area is never clicked down: the placement prompt is off and the casting client
// places the Region with the data `TemplatePlacement.fromActivity` would write.
listen("dnd5e.preUseActivity", "emanations", (activity, usageConfig) => {
  try {
    if ( transformRowOf(activity) ) {
      usageConfig.create ??= {};
      usageConfig.create.measuredTemplate = false;
      usageConfig.subsequentActions = false;   // the pack's damage on use: the pulse is the damage
      return;
    }
    if ( !selfAreaOf(activity) ) return;
    usageConfig.create ??= {};
    usageConfig.create.measuredTemplate = false;
  } catch(err) { log.warn(`Could not switch off the template prompt.`, err); }
});

listen("dnd5e.postUseActivity", "emanations", (activity, _usageConfig, results) => {
  try {
    if ( transformRowOf(activity) || !selfAreaOf(activity) ) return;
    if ( (results?.templates ?? []).flat().length ) return;   // the system placed one after all
    const actor = activity.actor;
    if ( !actor?.isOwner ) return;
    void placeSelfArea(activity, castEmanationRow(activity), results?.message instanceof ChatMessage ? results.message : null);
  } catch(err) { log.error(`Could not place the area — place the template by hand.`, err); }
});

async function placeSelfArea(activity, row, message) {
  const actor = activity.actor;
  const tok = tokenDocOf(actor, { activity });
  const scene = tok?.parent;
  if ( !tok || !scene ) return;
  const tpl = activity.target.template;
  const units = scene.grid.units;
  // The size in the SCENE's units, as the placement converts it.
  const inScene = n => (n === "" || n === null || n === undefined) ? undefined
    : (Number(dnd5e.utils.convertLength(Number(n), tpl.units || "ft", units, { strict: false })) || Number(n));
  const size = inScene(tpl.size);
  const spellLevel = castLevelOn(message) ?? activity.getRollData?.()?.item?.level ?? activity.item.system?.level ?? null;
  await scene.createEmbeddedDocuments("Region", [{
    name: `${activity.item.name} [${game.user.name}]`, color: game.user.color,
    shapes: [emanationShapeData(standing(tok), size * pxPerUnit(scene))],
    ...(canvas?.level?.id ? { levels: [canvas.level.id] } : {}),
    restriction: { enabled: true, type: "move" },
    attachment: { token: tok.id },
    ...ringHidden(), highlightMode: "coverage",
    flags: { dnd5e: {
      activity: activity.uuid, item: activity.item.uuid, origin: tok.uuid, spellLevel,
      dimensions: { size, width: inScene(tpl.width), height: inScene(tpl.height), units }
    } }
  }], row ? { dnd5e: { createActivityBehaviors: false } } : {});
  // The type picked in the casting window goes onto the emanation card once the GM posts it.
  if ( row ) void carryDamageTypeChoice(activity);
}

/* --- the casting window: a damage type the part leaves open is picked THERE ------------------- */

// A radio per damage type on the usage dialog, the alignment's default checked; held until the cast lands.
const pendingTypes = new Map();   // activity uuid → type picked in the dialog
listen("renderActivityUsageDialog", "emanations", (app, element) => {
  try {
    const activity = app?.activity ?? app?.options?.activity ?? null;
    if ( !castEmanationRow(activity) ) return;
    const types = partTypesOf(activity);
    if ( (types.length < 2) || element.querySelector("[data-bf-emanation-type-field]") ) return;
    const alignment = activity.actor?.system?.details?.alignment ?? null;
    const current = pendingTypes.get(activity.uuid) ?? damageTypeFor(types, alignment).type;
    const why = damageTypeFor(types, alignment).why;
    const cap = s => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
    const fs = document.createElement("fieldset");
    fs.dataset.bfEmanationTypeField = "";
    fs.innerHTML = `<legend>By the Books — damage type</legend>
      <div class="form-group"><label>${esc(activity.item.name)} deals</label>
        <div class="form-fields" style="gap:0.75rem;">${types.map(t => `<label style="display:flex;align-items:center;gap:0.3rem;">${pickInputHTML({ kind: "radio", name: "bf-emanation-type", value: t, checked: t === current })} ${cap(t)}</label>`).join("")}</div>
        <p class="hint">${cap(current)} is the default — ${why}. The pick applies to every roll of this cast; the spell's card can change it later.</p></div>`;
    for ( const r of pickInputs(fs, "bf-emanation-type") ) r.addEventListener("change", () => { if ( r.checked ) pendingTypes.set(activity.uuid, r.value); });
    const footer = element.querySelector(SURFACES.dialogFooter);
    if ( footer ) footer.before(fs); else (element.querySelector("form") ?? element).appendChild(fs);
  } catch(err) { log.warn(`Could not add the damage-type fieldset.`, err); }
});

async function carryDamageTypeChoice(activity) {
  try {
    const type = pendingTypes.get(activity.uuid) ?? null;
    pendingTypes.delete(activity.uuid);
    if ( !type ) return;
    // The card is the elect's to post, from the area it adopts.
    const card = await waitForWrite(() => emanationCardFor(activity.uuid), { ms: 10_000 });
    if ( !card ) return;   // no GM adopted the area — no card to carry it
    if ( readFlag(card, "emanationCard")?.damageType !== type ) await chooseDamageType(card, type);
  } catch(err) {
    log.warn(`The damage-type pick could not be carried to the card — its buttons still can.`, err);
  }
}

// ⚠ dnd5e does NOT make a placed region a concentration dependent: the area ends here.
listen("deleteActiveEffect", "emanations", effect => {
  if ( !isActiveGM() || !effect?.statuses?.has?.("concentrating") ) return;
  void endConcentrationAreas(effect);
});
/**
 * Every region stamped with the cast's activity comes down with its concentration; a cast with a
 * demand card is the saves machine's (saves/areas.js) except for this module's own rings.
 * ⚠ A re-cast's area wears the same activity uuid: the tie (`areas`) names this cast's regions, and
 * an untied area matches only while no other concentration of that activity stands.
 */
async function endConcentrationAreas(effect) {
  try {
    const activityUuid = effect.flags?.dnd5e?.activity?.uuid ?? null;
    if ( !activityUuid ) return;
    const actor = (effect.parent instanceof Actor) ? effect.parent : null;
    const tied = readFlag(effect, AREAS_FLAG);
    const another = !!actor?.effects?.some(e => (e.id !== effect.id) && e.statuses?.has?.("concentrating")
      && (e.flags?.dnd5e?.activity?.uuid === activityUuid));
    const untiedIsOurs = !Array.isArray(tied) && !another;
    const demanded = game.messages.contents.some(m => (m.system?.concentration === effect.id) && savesOf(m)?.templated);
    for ( const scene of game.scenes ) {
      for ( const region of scene.regions.filter(r => r.getFlag("dnd5e", "activity") === activityUuid) ) {
        const own = !!flagOf(region);                                   // this module's own emanation placement
        if ( demanded && !own ) continue;                               // the saves machine's cast, its sweep
        if ( !own && !untiedIsOurs && !(tied ?? []).includes(region.uuid) ) continue;
        if ( scene.regions.get(region.id) ) await region.delete().catch(() => {});
      }
    }
  } catch(err) {
    log.error(`Could not end an area with its concentration — delete the area by hand.`, err);
  }
}

/** The flag on a concentration effect: the uuids of the regions its cast placed (the sweep's tie). */
const AREAS_FLAG = "areas";

// The tie, written on the casting client, which owns the concentration effect.
listen("dnd5e.postUseActivity", "emanations", async (activity, _usageConfig, results) => {
  try {
    const regions = (results?.templates ?? []).flat().filter(r => r?.parent && r.uuid);
    if ( !regions.length ) return;
    const actor = activity?.actor;
    if ( !(actor instanceof Actor) || !actor.isOwner ) return;
    const concId = results?.message?.system?.concentration ?? null;
    const effect = (concId ? actor.effects.get(concId) : null)
      ?? actor.effects.filter(e => e.statuses?.has?.("concentrating") && (e.flags?.dnd5e?.activity?.uuid === activity.uuid)).at(-1)
      ?? null;
    if ( !effect ) return;
    await queueFlagWrite(effect, AREAS_FLAG, areas => {
      const added = regions.map(r => r.uuid).filter(uuid => !areas.includes(uuid));
      if ( !added.length ) return false;
      areas.push(...added);
    }, { initial: [] });
  } catch(err) {
    log.warn(`Could not tie a cast's area to its concentration — the area may outlive the spell.`, err);
  }
});

/* --- the card (R5 / N3): an emanation says what it is when it appears ------------------------- */

const KEY_LABELS = {
  // dnd5e 6.0 moved the roll bonuses under `system.rolls.*` and shims the old keys: label both.
  "system.rolls.ability.save.bonus": v => `${Number(v) >= 0 ? "+" : ""}${v} to saving throws`,
  "system.rolls.damage.mwak.bonus": v => `+${v} to melee weapon damage`,
  "system.rolls.damage.rwak.bonus": v => `+${v} to ranged weapon damage`,
  "system.bonuses.abilities.save": v => `${Number(v) >= 0 ? "+" : ""}${v} to saving throws`,
  "system.bonuses.mwak.damage": v => `+${v} to melee weapon damage`,
  "system.bonuses.rwak.damage": v => `+${v} to ranged weapon damage`,
  "system.traits.dr.value": v => `Resistance to ${v}`,
  "system.traits.di.value": v => `Immunity to ${v}`,
  "system.traits.ci.value": v => `Immunity to the ${String(v).replace(/^\w/, c => c.toUpperCase())} condition`,
  "system.attributes.movement.speed": v => `Speed ×${v}`
};
function describeChanges(changes) {
  const parts = (changes ?? []).map(c => (KEY_LABELS[c.key] ?? (v => `${c.key} ${v}`))(c.value));
  return parts.length ? parts.join(", ") : "the effect as the pack ships it";
}

/** The types a save activity's first damage part offers, in the pack's order. */
const partTypesOf = activity => [...(activity?.damage?.parts?.[0]?.types ?? [])].map(t => String(t).toLowerCase());

async function announce(row, actor, item, range, effect, verb, { activity = null, regionId = null, sceneId = null, band = null, picks = null, ring = null } = {}) {
  if ( row.quiet ) return;   // a ring that follows what is held says nothing as it rises and falls
  try {
    const reach = (row.reach === "helpful") ? "allies and neutrals inside" : (row.reach === "all") ? "every creature inside" : "enemies inside";
    const pulseLine = row.pulse ? (() => {
      const { raw, type } = pulseDamageOf(item, row);
      return raw ? `every creature inside takes ${raw} (${Roll.replaceFormulaData(raw, actor?.getRollData?.() ?? {})}) ${type ?? ""} damage at the end of your turns — while ${row.while ?? "it"} stands`.replace(/\s+/g, " ") : null;
    })() : null;
    const nothing = row.remind ? "a notice at the start of your turn — the heal is yours to aim"
      : row.pick ? "once on each of your turns, one creature inside is yours to choose — the card at your turn start asks"
      : pulseLine ? pulseLine
      : row.trigger?.on?.includes("move") ? `${row.trigger.per ?? 5} feet moved inside pays the dice — when the move lands`
      : row.alert?.kind === "notice" ? `a card when a creature ${row.alert.on === "moveOut" ? "leaves" : "enters"} — the move is never stopped`
      : (row.effect === null) ? `no effect to apply — ${row.caveat ?? "the ring is the table's"}` : reach;
    const rangeText = (row.kind === "area") ? (range ? `a ${range}-foot area` : "an area") : range ? `${range}-foot Emanation` : "Emanation";
    // A part with several types is a choice the card carries: the alignment's default, or the caster's pick.
    const types = partTypesOf(activity);
    const alignment = actor?.system?.details?.alignment ?? null;
    const choice = (types.length > 1) ? { types, activityUuid: activity.uuid, alignment, ...damageTypeFor(types, alignment) } : null;
    await postCard({
      actor,
      card: bfCard({
        img: item?.img ?? null, eyebrow: "Emanation", tone: (row.reach === "helpful") ? "good" : "bad",
        title: `${row.key} — ${actor?.name ?? ""} — ${rangeText}`,
        subtitle: effect ? `${reach}: ${effect.name} — ${describeChanges(effect.changes)}${row.trigger ? " · a save on entering and on ending a turn inside" : ""}${row.heal ? " · an ally at 0 HP regains Hit Points at the start of its turn" : ""}` : (row.trigger ? "a save on entering and on ending a turn inside" : nothing),
        lines: [ruleLine(row.rule), (row.caveat && (row.effect !== null)) ? `<span style="opacity:0.8;">${row.caveat}</span>` : null]
      }),
      flags: { [MODULE_ID]: { emanationCard: { ...statContext(actor?.uuid ?? null), key: row.key, verb, range: range ?? null, regionId, ...(sceneId ? { sceneId } : {}),
        ...(choice ? { types: choice.types, activityUuid: choice.activityUuid, damageType: choice.type, damageWhy: choice.why, chosen: false } : {}),
        ...(band ? { band } : {}), ...(picks ? { picks } : {}), ...(ring ? { ring } : {}) } } }
    });
  } catch(err) {
    log.warn(`Could not post the emanation card.`, err);
  }
}

/* --- the damage type: the alignment's by default, the caster's by choice ----------------------- */

/** The cast's emanation card for this activity — the newest one, where the pick lives. */
function emanationCardFor(activityUuid) {
  return game.messages.contents.filter(m => readFlag(m, "emanationCard")?.activityUuid === activityUuid).at(-1) ?? null;
}

// The pick is a fold onto the card (R2): the GM writes it straight, a player's travels by relay.
registerRelay("emanationTypeAnswer", {
  flagKey: "emanationCard",
  targetOf: a => a.cardId,
  owns: flag => drivesMomentFor(flag?.sourceUuid ?? null),
  fold: (current, a) => {
    if ( !current.types?.includes(a.type) ) return false;
    current.damageType = a.type; current.damageWhy = "chosen"; current.chosen = true;
  },
  cleanup: true
});

async function chooseDamageType(card, type) {
  const flag = readFlag(card, "emanationCard");
  if ( !flag?.types?.includes(type) ) return;
  if ( card.canUserModify?.(game.user, "update") ) {
    await card.setFlag(MODULE_ID, "emanationCard", { ...flag, damageType: type, damageWhy: "chosen", chosen: true });
    return;
  }
  await postAnswer("emanationTypeAnswer", { to: selfIds(), alias: TITLE, card: `<p>${type}</p>`,
    flags: { [MODULE_ID]: { emanationTypeAnswer: { cardId: card.id, type } } } });
}

listen("dnd5e.renderChatMessage", "emanations", (message, html) => {
  const f = readFlag(message, "emanationCard");
  if ( !f?.types?.length ) return;
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:0.35rem;align-items:center;margin-top:0.35rem;flex-wrap:wrap;";
  const label = document.createElement("span");
  label.style.cssText = "font-size:var(--font-size-11,11px);opacity:0.75;";
  label.textContent = f.chosen ? "Damage type — chosen:" : `Damage type — ${f.damageWhy}:`;
  row.appendChild(label);
  for ( const type of f.types ) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.bfEmanationType = type;
    const on = type === f.damageType;
    b.style.cssText = `font-size:var(--font-size-11,11px);padding:0.15rem 0.6rem;border-radius:3px;line-height:1.4;`
      + (on ? "font-weight:bold;border:2px solid rgba(70,150,95,0.95);" : "opacity:0.75;");
    b.textContent = `${type.charAt(0).toUpperCase()}${type.slice(1)}${on ? " ✓" : ""}`;
    b.addEventListener("click", ev => { ev.preventDefault(); void chooseDamageType(message, type); });
    row.appendChild(b);
  }
  html.querySelector(SURFACES.messageContent)?.appendChild(row);
});

// Every damage roll of the cast wears the card's type, or the default when it lands before the card.
listen("dnd5e.preRollDamage", "emanations", (config, _dialog, message) => {
  try {
    const activity = config.subject;
    if ( activity?.type !== "save" ) return;
    const row = rowFor(activity.item);
    if ( !row || (row.kind !== "spell") || !listed().has(lower(row.key)) ) return;
    const types = partTypesOf(activity);
    if ( types.length < 2 ) return;
    const card = emanationCardFor(activity.uuid);
    const chosen = readFlag(card, "emanationCard")?.damageType ?? null;
    const { type } = damageTypeFor(types, activity.actor?.system?.details?.alignment ?? null, chosen);
    if ( !type ) return;
    for ( const roll of config.rolls ?? [] ) {
      const offered = [...(roll.options?.types ?? [])].map(t => String(t).toLowerCase());
      if ( offered.includes(type) ) { roll.options ??= {}; roll.options.type = type; }
    }
    foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.emanationType`, { type, chosen: !!chosen });
  } catch(err) {
    log.warn(`Could not set the emanation's damage type — the roll wears the pack's first.`, err);
  }
});

/* --- the hooks: when to look ---------------------------------------------------------------- */

/** Sweep the live scenes and every scene that carries an emanation: raised on the one, brought down on the others. */
const sweepEverywhere = () => {
  const scenes = liveNow();
  for ( const s of game.scenes ) if ( scenes.has(s.id) || s.regions.some(r => flagOf(r)) ) scheduleScene(s);
};
listen(`${MODULE_ID}.emanationsChanged`, "emanations", sweepEverywhere);

/**
 * ⚠ No document hook carries a user's view; the signal is the scene navigation rendering (NOTES
 * *A user's VIEWED scene has no document hook*). It renders often: sweep only when the set changed.
 */
let liveKey = null;
const watchLive = () => {
  if ( !isActiveGM() || !viewsKnown() ) { liveKey = null; return; }
  const key = [...liveNow().keys()].sort().join("|");
  if ( key === liveKey ) return;
  liveKey = key;
  sweepEverywhere();
};
// The first sweep waits for the views (viewsKnown): heard on the navigation's render, else at the grace's end.
listenOnce("ready", "emanations", () => {
  readyAt = Date.now();
  watchLive();
  setTimeout(watchLive, VIEWS_GRACE_MS + 100);
});
listen("updateScene", "emanations", (_scene, changes) => { if ( "active" in changes ) watchLive(); });
listen("renderSceneNavigation", "emanations", watchLive);
listen("canvasReady", "emanations", canvasObj => { scheduleScene(canvasObj?.scene ?? game.scenes.viewed); watchLive(); });
listen("createToken", "emanations", tok => scheduleScene(tok.parent));
listen("deleteToken", "emanations", tok => scheduleScene(tok.parent));
listen("updateToken", "emanations", (tok, changes) => {
  if ( !isActiveGM() || !tok.parent ) return;
  // A move re-floors every emanation on the scene; a change of actor or disposition re-sweeps.
  if ( ("x" in changes) || ("y" in changes) || ("elevation" in changes) || ("_regions" in changes) ) {
    for ( const region of tok.parent.regions.filter(r => flagOf(r)) ) void reconcileMembers(region);
    // A ring's source moved: once the platform has moved the attached ring, re-base one that drifted.
    if ( (("x" in changes) || ("y" in changes)) && tok.parent.regions.some(r => (flagOf(r)?.kind === "feature") && (flagOf(r).tokenId === tok.id)) ) {
      setTimeout(() => scheduleScene(tok.parent), 1000);
    }
  }
  if ( ("actorId" in changes) || ("disposition" in changes) || ("actorLink" in changes) ) scheduleScene(tok.parent);
});
listen("updateRegion", "emanations", (region, changes) => {
  if ( !isActiveGM() || !flagOf(region) ) return;
  if ( ("shapes" in changes) || ("attachment" in changes) || ("behaviors" in changes) ) void reconcileMembers(region);
});
listen("createRegion", "emanations", region => { if ( isActiveGM() ) void adoptSpellRegion(region); });
listen("deleteRegion", "emanations", region => {
  const f = flagOf(region);
  if ( f?.kind === "feature" ) ringFell.set(ringOf(region.parent?.id ?? null, f.tokenId, f.key), Date.now());
  if ( !isActiveGM() || !f ) return;
  void reconcileMembers(region, { gone: region });
  // A feature's aura deleted by hand stands again: its switch is the setting or the list, not the region.
  if ( f.kind === "feature" ) scheduleScene(region.parent);
});
for ( const hook of ["createItem", "deleteItem", "updateItem"] ) {
  listen(hook, "emanations", item => { if ( item?.parent instanceof Actor ) for ( const s of scenesWith(item.parent) ) scheduleScene(s); });
}
listen("updateActor", "emanations", (actor, changes) => {
  if ( ("system" in changes) || ("items" in changes) ) for ( const s of scenesWith(actor) ) scheduleScene(s);
});
// A trait lent or taken mid-session (a monster's aura): its ring rises or falls with the item.
for ( const hook of ["createItem", "deleteItem"] ) {
  listen(hook, "emanations", item => {
    const actor = item?.parent;
    if ( !(actor instanceof Actor) ) return;
    for ( const s of scenesWith(actor) ) scheduleScene(s);
  });
}
for ( const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"] ) {
  listen(hook, "emanations", effect => {
    const actor = (effect?.parent instanceof Actor) ? effect.parent : effect?.parent?.parent;
    if ( !(actor instanceof Actor) || readFlag(effect, FLAG) ) return;   // never re-sweep on our own member effects
    for ( const s of scenesWith(actor) ) scheduleScene(s);
  });
}
