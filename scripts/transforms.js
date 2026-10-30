/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): TRANSFORMS (issue #2) — Wild Shape and the polymorph
 * spells. dnd5e's transform activity opens the whole compendium browser at the use, transforms from a
 * card button only for a user who holds Create Actor in a world with Allow Transformation on, models no
 * Known Forms, and ends no form. Here a listed activity (TRANSFORMS) keeps the system's own use — the
 * dialog, the consumption, the card — but its chooser is switched off; the owner's client asks the form
 * in ONE popup off the card (the shared gallery, gallery.js, the rows ruled C), filtered to the rule's
 * pool and, for Wild Shape, to the four Known Forms on the item (an open slot learned at the use); the
 * elect transforms with dnd5e's own `transformInto` and the activity's own preset, lands a clocked form
 * effect (Revert on its fold), and reverts when the rules say — the hours, Concentration's end,
 * Incapacitated, 0 Hit Points, the Temporary Hit Points gone. The Long Rest offers the one known-form
 * swap through the mastery record's road (RULINGS *Wild Shape and the polymorph spells*).
 */
import { MODULE_ID, readFlag, TITLE, isActiveGM, queueFlagWrite, canAnswerFor, answersHere, statContext, resolveUuid, resolveUuidAsync, log, claimLanding, claimHolds } from "./core.js";
import { cardActivity, lower, featureNamed } from "./lookup.js";
import { TRANSFORMS, transformEntries, listedNames, tableIndex } from "./decide/registry.js";
import { poolRuleOf, capOfTarget, knownSlotsOf, knownHolderOf, knownState, learnedList, restKnownList, transformRecord,
  pickedAnswer, formEffectData, endOfForm, formTitle, articleOf, empowerSetting, empowerTempHp, empowerUpdates, repointedLanded } from "./decide/transforms.js";
import { summonEffectName } from "./decide/summons.js";
import { galleryRows, crLabel } from "./decide/gallery.js";
import { bfCard, esc } from "./decide/present.js";
import { targetsOf } from "./decide/card.js";
import { describeCreature, formArt, openPicker, poolFromPacks } from "./gallery.js";
import { isPartyMember } from "./shared.js";
import { momentButton, registerRelay, registerResumable, acknowledgeMoment, momentAcknowledged, pendingRow, postCard, postAnswer, closePopup } from "./ui.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";
import { tokenDocOf, tokensOf } from "./geometry.js";
import { closeLedger, landingSteps } from "./ledger.js";

const TRANSFORM_FLAG = "transform";
const FORM_SWAP_FLAG = "formSwap";
const FORM_FLAG = "form";
const KNOWN_FORMS_FLAG = "knownForms";
const LAST_FORM_FLAG = "lastForm";
/** The profile id the system is handed in place of the real one, so its chooser never opens. */
const NO_PROFILE = "bythebooks";
const { rowFor } = tableIndex(TRANSFORMS);
const listed = () => listedNames(transformEntries());

/** The listed row a transform activity answers to — `cr` or `uuid` mode; a `form` activity stays the system's. */
function rowOf(activity) {
  if ( (activity?.type !== "transform") || (activity.transform?.mode === "form") ) return null;
  const row = rowFor(activity.item);
  return (row && listed().has(lower(row.key))) ? row : null;
}

/* --- the intercept: the system's chooser is switched off -------------------------------------- */

/** The real profile per use, stashed while the system is handed the sentinel. */
const stashed = new WeakMap();

listen("dnd5e.preUseActivity", "transforms", (activity, usageConfig) => {
  try {
    if ( !rowOf(activity) ) return;
    stashed.set(usageConfig, usageConfig.transform?.profile ?? activity.availableProfiles?.[0]?._id ?? null);
  } catch(err) { log.warn(`Could not read the transform's profile.`, err); }
});

// After the dialog (its profile select has spoken) and before the message: the sentinel in, the pick kept.
listen("dnd5e.preActivityConsumption", "transforms", (activity, usageConfig) => {
  try {
    if ( !rowOf(activity) ) return;
    if ( usageConfig.transform?.profile && (usageConfig.transform.profile !== NO_PROFILE) ) stashed.set(usageConfig, usageConfig.transform.profile);
    usageConfig.transform ??= {};
    usageConfig.transform.profile = NO_PROFILE;
  } catch(err) { log.warn(`Could not switch the system's form chooser off.`, err); }
});

/* --- the record on the use's card ------------------------------------------------------------ */

/** The Known Forms list on the holder item, as plain rows. */
const knownOf = item => [...(readFlag(item, KNOWN_FORMS_FLAG) ?? [])].map(k => ({ uuid: k.uuid, name: k.name ?? "", img: k.img ?? null }));

/** The item that holds a row's Known Forms on this actor (Circle Forms spends Wild Shape's), or null. */
function knownHolderItem(actor, key) {
  const holder = knownHolderOf(TRANSFORMS, key);
  return holder ? featureNamed(actor, holder) : null;
}

/** A profile's cap evaluated on the activity's own roll data (a formula on the sheet's levels). */
function capOf(activity, profile) {
  const raw = String(profile?.cr ?? "").trim();
  if ( !raw ) return null;
  try {
    const n = Number(globalThis.dnd5e?.utils?.simplifyBonus?.(raw, activity.getRollData?.({ deterministic: true }) ?? {}));
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

/** The cap a blank profile takes from a target: its CR, else its level. */
function capFromTarget(target) {
  const actor = resolveUuid(target?.uuid);
  return capOfTarget({ cr: actor?.system?.details?.cr ?? null, level: actor?.system?.details?.level ?? null });
}


async function stampRecord(activity, usageConfig, message, row) {
  const actor = activity.actor;
  const tok = tokenDocOf(actor, { activity });   // the owner's token, for the card's name and the record's scene
  const profileId = stashed.get(usageConfig) ?? null;
  const profile = activity.profiles.find(p => p._id === profileId) ?? activity.availableProfiles?.[0] ?? activity.profiles[0] ?? null;
  const self = row.self === true;
  const snapshot = targetsOf(message).map(t => ({ uuid: t.uuid, name: t.name }));
  const targets = self ? [{ uuid: actor.uuid, name: tok?.name ?? actor.name }] : snapshot;
  if ( !targets.length ) {
    ui.notifications?.warn(`${TITLE}: ${activity.item.name} transforms the creatures you target — target them, then use it again.`);
    return;
  }
  const holder = knownHolderItem(actor, row.key);
  const known = holder ? knownOf(holder) : [];
  const record = transformRecord({
    key: row.key, sourceUuid: actor.uuid, sourceName: tok?.name ?? actor.name,
    itemUuid: activity.item.uuid, itemName: activity.item.name, itemType: activity.item.type, activityUuid: activity.uuid,
    profile: profile ? { id: profile._id, cr: capOf(activity, profile), types: [...(profile.types ?? [])], sizes: [...(profile.sizes ?? [])],
      movement: [...(profile.movement ?? [])], uuid: profile.uuid || null, name: profile.name ?? "" } : null,
    self, targets, targetCap: self ? null : capFromTarget(targets[0]),
    known, slots: knownSlotsOf(TRANSFORMS, row.key), lastForm: readFlag(holder, LAST_FORM_FLAG) ?? null,
    concentrationId: message.system?.concentration || null, sceneId: tok?.parent?.id ?? canvas.scene?.id ?? null
  });
  record.askedBy = game.user.id;   // the caster's own screen answers: a GM using it for a player's character included
  await message.setFlag(MODULE_ID, TRANSFORM_FLAG, { ...record, ...statContext(actor.uuid) });
}

listen("dnd5e.postUseActivity", "transforms", (activity, usageConfig, results) => {
  try {
    const row = rowOf(activity);
    if ( !row || !activity.actor?.isOwner ) return;
    const message = (results?.message instanceof ChatMessage) ? results.message : null;
    if ( !message ) return;
    void stampRecord(activity, usageConfig, message, row).catch(err => log.error(`The transform could not be recorded — transform by hand.`, err));
  } catch(err) {
    log.error(`The transform could not be recorded — transform by hand.`, err);
  }
});

/* --- the one popup: the known forms, then the pool ------------------------------------------- */

/** A known form as a gallery row, read off the pool when the pack still ships it. */
const poolRowFor = (pool, k) => pool.find(r => r.uuid === k.uuid) ?? pool.find(r => lower(r.name) === lower(k.name)) ?? null;

/** A known form as a picker row: the pool's copy when the pack still ships it, else read off its own uuid. */
async function knownRow(pool, k, { checked = false, locked = false, tags = [] } = {}) {
  const row = poolRowFor(pool, k);
  const described = await describeCreature(row?.uuid ?? k.uuid, { label: k.name ?? row?.name ?? "", img: row?.img ?? k.img ?? null });
  // the table's own art for the form (the Wild Shape Art window), else the book's
  return { value: k.uuid, ...described, img: formArt(described.label || k.name).token ?? described.img, checked, locked, tags };
}

/** The cap as the card says it: "CR ¼ or lower" (null for an open pool). */
const capLabelOf = rule => (rule?.crMax === null || rule?.crMax === undefined) ? "" : `CR ${crLabel(rule.crMax)} or lower`;

/**
 * The gallery's sections for a record: the Known Forms alone (each described, the last one marked, one
 * above the cap locked), learned at the Long Rest, none known saying so (RULINGS *Wild Shape and the
 * polymorph spells*); with no known-forms list (the polymorph spells), or for the GM's change,
 * the pool. `none` when the list is empty.
 */
async function gallerySections(flag, pool, { field, gm = false }) {
  const rule = poolRuleOf(flag.profile ?? {}, { targetCap: flag.targetCap });
  const allowed = galleryRows(pool, rule);
  const known = flag.known ?? [];
  const slots = Number(flag.slots) || 0;
  const sections = [];
  if ( slots > 0 ) {
    const rows = [];
    for ( const k of known ) {
      const inPool = poolRowFor(pool, k);
      const overCap = inPool ? !allowed.some(a => a.uuid === inPool.uuid) : false;
      const last = k.uuid === flag.lastForm;
      rows.push(await knownRow(pool, k, { checked: last && !overCap, locked: overCap,
        tags: [last ? "last used" : null, overCap ? "above your cap" : null].filter(Boolean) }));
    }
    if ( rows.length ) sections.push({ head: `Your known forms · ${known.length} of ${slots}`, field, rows });
    else sections.push({ note: "You know no forms yet. Finish a Long Rest to study your forms." });
  }
  const rest = allowed.filter(r => !known.some(k => k.uuid === r.uuid));
  const capLabel = capLabelOf(rule);
  // a known-forms list shows only its forms: the pool is the Long Rest's (and the GM's change)
  if ( gm || !(slots > 0) ) sections.push({ head: (slots > 0) ? "The pool" : "The form", field, pool: rest });
  return { sections, rule, allowed, capLabel, none: (slots > 0) && !known.length && !gm };
}

/** The pool for a record: every visible pack's creatures of the profile's types, uncapped (the known forms are matched in it). */
const poolFor = flag => poolFromPacks({ types: flag.profile?.types?.length ? flag.profile.types : null });

async function answerPick(message, flag, pick, { learn = false } = {}) {
  const patch = pickedAnswer(flag, { pick, learn });
  if ( !patch ) { ui.notifications?.warn(`${TITLE}: that form is not one of your known forms.`); return false; }
  await queueFlagWrite(message, TRANSFORM_FLAG, current => {
    if ( current.status !== "asked" ) return false;
    Object.assign(current, patch);
  });
  return true;
}

/** The picked form by uuid: the pool's row, else the known form's own record. */
function pickOf(uuid, pool, known) {
  if ( !uuid ) return null;
  const row = pool.find(r => r.uuid === uuid) ?? (known ?? []).find(k => k.uuid === uuid) ?? null;
  return { uuid, name: row?.name ?? "", img: row?.img ?? null };
}

async function showFormPopup(message) {
  const flag = readFlag(message, TRANSFORM_FLAG);
  if ( flag?.status !== "asked" ) return;
  const user = resolveUuid(flag.sourceUuid);
  if ( !user ) return;
  const pool = await poolFor(flag);
  const { sections, capLabel, none } = await gallerySections(flag, pool, { field: "bf-form-pick" });
  const row = TRANSFORMS[flag.key];
  const who = flag.self ? "you" : flag.targets.map(t => t.name).join(", ");
  // the lists only: the rule text is the item's own, a click away on its card (a known-forms list asks none)
  if ( row?.rule && !(Number(flag.slots) > 0) ) sections.push({ rule: row.rule });
  await openPicker(message, TRANSFORM_FLAG, user, { by: flag.askedBy ?? null,
    title: `${flag.itemName} — ${flag.sourceName}`, icon: "fa-solid fa-paw", width: 500,
    card: { eyebrow: "Transform", title: flag.itemName, subtitle: [capLabel, flag.self ? null : `on ${who}`].filter(Boolean).join(" · ") },
    sections, needs: none ? [] : [{ field: "bf-form-pick", why: "pick a form first" }],
    buttons: none ? [{ action: "cancel", label: "Close", default: true }] : [
      { action: "become", label: flag.self ? "Become the form" : "Transform", default: true, checks: true, submit: picks => {
        const pick = pickOf(picks.one("bf-form-pick"), pool, flag.known);
        const learn = !(flag.known ?? []).some(k => k.uuid === pick.uuid);
        void answerPick(message, flag, pick, { learn }).then(ok => { if ( !ok ) void showFormPopup(message); });
      } },
      { action: "cancel", label: "Not now" }
    ]
  });
}

/** The GM's change of a landed form (RULINGS: the caster picks, the GM may override from the card). */
async function showChangePopup(message) {
  const flag = readFlag(message, TRANSFORM_FLAG);
  if ( !flag?.applied || flag.ended || !game.user.isGM ) return;
  const pool = await poolFor(flag);
  const { sections, capLabel } = await gallerySections(flag, pool, { field: "bf-form-change", gm: true });
  await openPicker(message, "transformChange", null, {
    title: `${flag.itemName} — change the form`, icon: "fa-solid fa-paw", width: 500, gate: false,
    card: { eyebrow: "Transform", title: `Change ${flag.pick?.name ?? "the form"}`, subtitle: [capLabel, "the GM's override · the creature reverts and takes the new form"].filter(Boolean).join(" · ") },
    sections, needs: [{ field: "bf-form-change", why: "pick a form first" }],
    buttons: [
      { action: "change", label: "Change the form", default: true, checks: true, submit: picks => {
        const pick = pickOf(picks.one("bf-form-change"), pool, flag.known);
        void queueFlagWrite(message, TRANSFORM_FLAG, current => {
          if ( !current.applied || current.ended || current.changeAsked ) return false;
          current.changeAsked = { uuid: pick.uuid, name: pick.name, img: pick.img ?? null, askedAt: Date.now() };
        });
      } },
      { action: "cancel", label: "Keep it" }
    ]
  });
}

/* --- the elect transforms --------------------------------------------------------------------- */

/** The caster's Concentration effect on the item, when the row's clock is Concentration's. */
function concentrationFor(caster, flag) {
  if ( !caster ) return null;
  if ( flag.concentrationId ) { const e = caster.effects.get(flag.concentrationId); if ( e ) return e; }
  const itemId = flag.itemUuid?.split(".").at(-1) ?? null;
  return caster.effects.find(e => (e.statuses?.has?.("concentrating") || (e.system?.type === "concentrating"))
    && ((e.flags?.dnd5e?.item?.id === itemId) || (e.origin === flag.itemUuid))) ?? null;
}

/** The activity on a creature's own sheet that the card names — by uuid, else the item by name and its transform activity. */
function activityFor(actor, flag, message) {
  const live = cardActivity(message, flag.activityUuid);
  if ( live && (live.actor === actor) ) return live;
  const item = [...(actor?.items ?? [])].find(i => lower(i.name) === lower(flag.itemName)) ?? null;
  const acts = [...(item?.system?.activities ?? [])];
  return acts.find(a => a.id === flag.activityUuid?.split(".").at(-1)) ?? acts.find(a => a.type === "transform") ?? live ?? null;
}

/** The original behind a transformed creature: itself when untransformed, else the actor its flag names. */
const originalOf = actor => (actor?.isPolymorphed && !actor.isToken) ? (game.actors.get(actor.getFlag("dnd5e", "originalActor")) ?? actor) : actor;

/** Our form effect on a creature, or null. */
const formEffectOn = actor => [...(actor?.effects ?? [])].find(e => !!readFlag(e, FORM_FLAG)) ?? null;

/**
 * The table's own art for a form (the Wild Shape Art window) on what came out of the transform: the sheet's
 * portrait, and the token's texture on every token of it (a linked character's placed tokens; an unlinked
 * token its own). The book's art stays where the table sets none.
 */
async function wearFormArt(landed, formName) {
  const art = formArt(formName);
  if ( !art.token && !art.portrait ) return;
  if ( art.portrait ) await landed.update({ img: art.portrait });
  if ( !art.token ) return;
  const tokens = landed.isToken ? [landed.token].filter(Boolean) : tokensOf(landed, { all: true, documents: true });
  for ( const t of tokens ) await t.update({ "texture.src": art.token });
  if ( !landed.isToken ) await landed.update({ "prototypeToken.texture.src": art.token });
}

/** The world actors dnd5e's transform made of `actor` (their `originalActor` names it), by id. */
const copiesOf = actor => (actor ? game.actors.filter(a => a.getFlag("dnd5e", "originalActor") === actor.id).map(a => a.id).sort() : []);

/** What a transform changes: an unlinked token's actor, in place; a world actor's copies, one more. */
const shapeOf = actor => (actor?.isToken ? { polymorphed: !!actor.isPolymorphed, name: actor.name } : copiesOf(actor));

/** What came out of a transform of `target`: the token's actor itself, else the copy its plan did not know. */
const landedOf = (target, p) => (target?.isToken ? target
  : (game.actors.find(a => !(p?.prior ?? []).includes(a.id) && (a.getFlag("dnd5e", "originalActor") === target?.id)) ?? null));

/**
 * A creature as it stands before its revert: whether a form of ours is reverted, and how to find what the revert
 * brings back (a world actor's original; an unlinked token's new token, dnd5e's revert making one where it stood).
 */
function revertPlanOf(subject) {
  const reverts = !!(formEffectOn(subject) && subject.isPolymorphed);
  const token = subject.isToken ? subject.token : null;
  return { actorUuid: subject.uuid, reverts,
    originalUuid: (reverts && !token) ? (originalOf(subject)?.uuid ?? null) : null,
    token: (reverts && token) ? { sceneId: token.parent?.id ?? null, actorId: token.actorId, x: token.x, y: token.y,
      priorIds: token.parent?.tokens.filter(t => t.actorId === token.actorId).map(t => t.id) ?? [] } : null };
}

/** The creature a revert step leaves: its result, else (the dead claimant's revert unrecorded) found off its plan. */
function backOf(p, result = null) {
  if ( result ) return resolveUuid(result);
  if ( !p?.reverts ) return resolveUuid(p?.actorUuid);
  if ( p.originalUuid ) return resolveUuid(p.originalUuid);
  const made = game.scenes.get(p.token?.sceneId)?.tokens.filter(t => (t.actorId === p.token.actorId) && !p.token.priorIds.includes(t.id)) ?? [];
  return (made.find(t => (t.x === p.token.x) && (t.y === p.token.y)) ?? made[0])?.actor ?? null;
}

/**
 * On a re-drive, what a dead claimant's revert brought back of the creature at `uuid`, or null. The run's ledger is
 * read by step name: the per-creature steps carry no dot, so a name is its own key in the record.
 */
function revertedFrom(ledger, uuid) {
  const entry = Object.entries(ledger ?? {}).find(([name, e]) => name.startsWith("revert-") && (e?.plan?.actorUuid === uuid))?.[1] ?? null;
  return entry ? backOf(entry.plan, entry.result ?? null) : null;
}

/**
 * One creature into the form, as steps (ledger.js): a standing form of ours reverted first ("until you use Wild
 * Shape again"), then dnd5e's own `transformInto` with the activity's own settings, then the form effect on what
 * came out. A re-drive finds the creature through the revert's plan, takes a transform whose shape moved as made,
 * and makes the form effect once (stamped). Returns the transformed actor's facts.
 * @param {ReturnType<typeof landingSteps>} steps @param {number} n   the creature's place on the record
 */
async function transformOne(steps, n, subject, source, { activity, settings, flag, pick, message }) {
  const revert = await steps.step(`revert-${n}`, {
    plan: () => revertPlanOf(subject),
    witness: p => (p.reverts ? !!resolveUuid(p.actorUuid)?.isPolymorphed : false),
    run: async p => {
      if ( !p.reverts ) return null;
      const standing = resolveUuid(p.actorUuid);
      const back = await standing.revertOriginalForm({ renderSheet: false });
      return ((back instanceof Actor) ? back : (back?.actor ?? originalOf(standing)))?.uuid ?? null;
    }
  });
  const before = backOf(revert.plan, revert.result);
  const shape = await steps.step(`transform-${n}`, {
    plan: () => ({ targetUuid: before?.uuid ?? null, prior: before?.isToken ? null : copiesOf(before) }),
    witness: p => shapeOf(resolveUuid(p.targetUuid)),
    run: async p => {
      if ( !before ) throw new Error(`${subject?.name ?? "the creature"} could not be found after its revert`);
      await before.transformInto(source, settings, { renderSheet: false });
      return landedOf(before, p)?.uuid ?? null;
    }
  });
  const target = resolveUuid(shape.plan.targetUuid) ?? before;
  const landed = resolveUuid(shape.result) ?? landedOf(target, shape.plan);
  if ( !landed ) throw new Error(`${target?.name ?? subject?.name ?? "the creature"} was not transformed`);
  // the art is set, never added: a re-drive sets the same
  await wearFormArt(landed, pick.name);
  const row = TRANSFORMS[flag.key];
  const caster = resolveUuid(flag.sourceUuid);
  const concentration = (row.clock === "concentration") ? concentrationFor(caster, flag) : null;
  const duration = concentration ? { ...(concentration._source?.duration ?? {}) } : (row.clock === "activity") ? (activity?.duration?.getEffectData?.() ?? {}) : {};
  if ( row.clock || (row.ends ?? []).length ) {
    const name = `effect-${n}`;
    await steps.step(name, {
      plan: () => ({ actorUuid: landed.uuid }),
      witness: p => steps.made(resolveUuid(p.actorUuid)?.effects, name),
      run: async () => {
        const data = formEffectData({ itemName: flag.itemName, formName: pick.name, img: pick.img ?? source.img ?? null, origin: flag.itemUuid,
          duration, messageId: message.id, originalId: target.id, key: flag.key, dependentOn: concentration?.uuid ?? null,
          description: `<p>${esc(flag.sourceName)}'s ${esc(flag.itemName)}: ${esc(target.name)} in the form of ${esc(articleOf(pick.name))} ${esc(pick.name)}. Removing this ends the form.</p>` });
        foundry.utils.mergeObject(data, { flags: steps.stamp(name) });
        await landed.createEmbeddedDocuments("ActiveEffect", [data]);
      }
    });
  }
  return { actorUuid: landed.uuid, originalUuid: target.uuid, name: landed.name, tokenName: landed.isToken ? landed.token?.name : null };
}

/** dnd5e's transformation setting model: the data model the system registers, else the one a transform activity carries. */
function settingClass() {
  const models = globalThis.dnd5e?.dataModels ?? {};
  return models.settings?.TransformationSetting ?? Object.values(models.settings ?? {}).find(c => c?.name === "TransformationSetting")
    ?? Object.values(models).find(c => c?.name === "TransformationSetting") ?? null;
}

/**
 * A companion empowered by a summon spell (SUMMON_EMPOWERS; the TRANSFORMS row `subject: "companion"`): dnd5e's
 * own `transformInto` on the companion's token with the row's `keep` and `effects` and the form's Hit Points at
 * the cast level as Temporary Hit Points; then the summon activity's own changes on top (the level stamped, the
 * attack and Proficiency matched, the AC bonus), the type and Hit Points the system would set aside; dnd5e's
 * transform Proficiency override removed (it carries the form's own, blank for a creature with no CR); the
 * companion's name back on the creature and its token, its art, ring and sight on the token; the caster's effect for the spell's life, and the form
 * effect dependent on it. Returns the landed facts (RULINGS *Summons*, the Battle Familiar pass).
 */
async function empowerOne(steps, subject, source, { activity, flag, message }) {
  const row = TRANSFORMS[flag.key];
  const Setting = settingClass();
  if ( !Setting ) throw new Error("dnd5e's TransformationSetting was not found");
  const caster = resolveUuid(flag.sourceUuid);
  if ( !(caster instanceof Actor) ) throw new Error("the caster could not be read off the card");
  const profile = activity.profiles?.find(p => p._id === flag.profile?.id) ?? activity.availableProfiles?.[0] ?? null;
  if ( !profile ) throw new Error(`no form ${flag.profile?.id ?? ""} on ${flag.itemName}`);
  const token = subject.token;
  // the name, the Temporary Hit Points and its own look are read before the transform and kept on the step's plan:
  // a re-drive after the transform would read the form's
  const rollData = { ...(activity.getRollData?.() ?? {}), summon: subject.getRollData?.() ?? {} };
  let hpBonus = 0;
  if ( activity.bonuses?.hp ) { const r = await new Roll(String(activity.bonuses.hp), rollData).evaluate(); hpBonus = Number(r.total) || 0; }
  const before = {
    name: flag.empower?.name || token?.name || subject.name,
    tempHp: empowerTempHp({ formHpMax: source.system?.attributes?.hp?.max ?? 0, hpBonus }),
    // its own look: dnd5e's transform wears the form's token art and portrait
    // read off the STORED token (the prepared texture can lag behind the store on this platform)
    look: { texture: flag.empower?.look?.texture ?? token?._source?.texture?.src ?? token?.texture?.src ?? null, img: flag.empower?.look?.img ?? subject.img ?? null,
      ring: flag.empower?.look?.ring ?? (token?._source?.ring ? foundry.utils.deepClone(token._source.ring) : null),
      // its sight: dnd5e's transform takes the world actor's prototype's, which the packs ship off
      sight: flag.empower?.look?.sight ?? !!token?._source?.sight?.enabled }
  };
  const shape = await steps.step("empower.transform", {
    plan: () => before,
    witness: () => shapeOf(resolveUuid(subject.uuid)),
    run: async p => { await subject.transformInto(source, new Setting(empowerSetting(row, p.tempHp)), { renderSheet: false }); }
  });
  const { name, tempHp, look } = shape.plan;
  const landed = token?.actor ?? subject;
  if ( !landed?.isPolymorphed ) throw new Error(`${name} was not transformed`);
  // the spell's own bonuses, as the summon landing applies them; the type and the Hit Points stay the familiar's.
  // dnd5e's changes add to what stands (the AC), so they are read once, onto the plan: its values are set and its
  // effects keep their ids, so a begun step runs again whole (a dotted key comes back nested: the same update)
  const changes = await activity.getChanges(landed, profile, { profile: profile._id });
  const bonuses = await steps.step("empower.bonuses", {
    plan: () => {
      const tokenUpdates = { ...(changes.tokenUpdates ?? {}) };
      delete tokenUpdates.name; delete tokenUpdates.texture; delete tokenUpdates.width; delete tokenUpdates.height; delete tokenUpdates.ring;
      return { ...empowerUpdates(changes.actorUpdates ?? {}), tokenUpdates };
    },
    witness: () => null,
    run: async p => {
      if ( Object.keys(p.updates).length ) await landed.update(p.updates);
      const items = p.items.filter(i => i?._id && landed.items.has(i._id));
      if ( items.length ) await landed.updateEmbeddedDocuments("Item", items);
      const effects = p.effects.filter(e => !(e?._id && landed.effects.has(e._id)));
      if ( effects.length ) await landed.createEmbeddedDocuments("ActiveEffect", effects, { keepId: true });
    }
  });
  // dnd5e's own transform Proficiency override: the form's PB, blank for a stat block with no CR (a delete of what is
  // found: a re-drive finds it gone)
  const profId = globalThis.dnd5e?.utils?.staticID?.("dnd5eTransformProf") ?? null;
  const profEffect = landed.effects.find(e => (e.id === profId) || ((e.name === "Proficiency") && e.changes?.some(c => c.key === "system.attributes.prof") && !e.flags?.dnd5e?.summon));
  if ( profEffect && (profEffect.id !== (globalThis.dnd5e?.utils?.staticID?.("dnd5eMatchProficiency") ?? "")) ) await profEffect.delete();
  // its own name, art and portrait back (an empowered Crab is still the Crab), Medium for the hour — the form's one
  // square at scale 1, not a Tiny beast's doubled texture (RULINGS *Summons*, the Battle Familiar pass); values set,
  // so a re-drive sets the same
  await landed.update({ name, ...(look.img ? { img: look.img } : {}) });
  // snapped to its square's origin first, so a Tiny token growing to a square fills the square it stood in
  const grid = token?.parent?.grid;
  const origin = (grid && token) ? { x: Math.floor(token.x / grid.sizeX) * grid.sizeX, y: Math.floor(token.y / grid.sizeY) * grid.sizeY } : {};
  // flat keys: a nested `texture` object left the token's prepared texture stale on Foundry 14.369 (measured)
  // its own ring back as well: the form's prototype brought its own, a ring the familiar never wore (RULINGS *Summons* call 59)
  if ( token ) await token.update({ name, lockRotation: false, width: 1, height: 1, ...origin,
    ...(look.texture ? { "texture.src": look.texture } : {}), "texture.scaleX": 1, "texture.scaleY": 1,
    ...(look.ring ? foundry.utils.flattenObject({ ring: look.ring }) : {}), ...(look.sight ? { "sight.enabled": true } : {}) });
  const tokenUpdates = bonuses.plan.tokenUpdates ?? {};
  if ( token && Object.keys(tokenUpdates).length ) await token.update(tokenUpdates);
  // the caster's effect for the spell's life — the lever (a hand, its clock, a rest); the form effect depends on it
  const duration = activity.duration?.getEffectData?.() ?? {};
  const effectName = summonEffectName({ itemName: flag.itemName, creatureName: name });
  const held = await steps.step("empower.caster", {
    witness: () => steps.made(caster.effects, "empower.caster"),
    run: async () => {
      const [made] = await caster.createEmbeddedDocuments("ActiveEffect", [{
        name: effectName, img: activity.item?.img ?? source.img ?? null,
        type: "base", transfer: false, disabled: false, origin: flag.itemUuid,
        description: `<p>${esc(name)} is empowered by ${esc(flag.itemName)} while this effect stands: remove it to end the spell.</p>`,
        duration: { ...duration }, flags: foundry.utils.mergeObject({ [MODULE_ID]: { empowerEffect: message.id } }, steps.stamp("empower.caster"))
      }]);
      return made?.id ?? null;
    }
  });
  const casterEffect = caster.effects.get(held.result ?? held.now?.[0]) ?? null;
  // the form effect wears the SPELL's icon, as the caster's does (the form's token art is a creature, not a status)
  await steps.step("empower.form", {
    witness: () => steps.made(landed.effects, "empower.form"),
    run: async () => {
      const data = formEffectData({ itemName: flag.itemName, formName: flag.pick?.name ?? source.name, img: activity.item?.img ?? source.img ?? null, origin: flag.itemUuid,
        duration, messageId: message.id, originalId: landed.id, key: flag.key, dependentOn: casterEffect?.uuid ?? null,
        description: `<p>${esc(flag.sourceName)}'s ${esc(flag.itemName)}: ${esc(name)} empowered in the form of ${esc(articleOf(flag.pick?.name ?? source.name))} ${esc(flag.pick?.name ?? source.name)}, ${tempHp} Temporary Hit Points. Removing this ends the spell.</p>` });
      foundry.utils.mergeObject(data, { flags: steps.stamp("empower.form") });
      await landed.createEmbeddedDocuments("ActiveEffect", [data]);
    }
  });
  // the companion's own record knows it is empowered (its dismissal ends the spell with no form left to revert); a
  // value set, so a re-drive sets the same
  const companionMessage = game.messages.get(flag.empower?.companionMessageId);
  if ( companionMessage ) await queueFlagWrite(companionMessage, "summon", current => {
    if ( !current.companion ) return false;
    current.companion.empower = { messageId: message.id, effectId: casterEffect?.id ?? null };
  });
  return { actorUuid: landed.uuid, originalUuid: landed.uuid, name, tokenName: name, tempHp, empowerEffectId: casterEffect?.id ?? null,
    look: { read: look.texture, worn: token?._source?.texture?.src ?? null, scale: token?._source?.texture?.scaleX ?? null } };
}

async function landTransform(message) {
  if ( !(await claimLanding(message, TRANSFORM_FLAG, current => current.status === "picked")) ) return;
  const flag = readFlag(message, TRANSFORM_FLAG);
  // THE LEDGER (ledger.js): a re-drive over a dead claim learns the form once, transforms each creature once and
  // makes one form effect on it.
  const steps = landingSteps(message, TRANSFORM_FLAG, "land");
  const landed = [];
  let outcome = "landed";
  let failure = null;
  let learned = null;
  try {
    // the caster as the card names it, else (a dead claimant's revert took that creature) what its revert brought back
    const caster = resolveUuid(flag.sourceUuid) ?? revertedFrom(flag.ledger?.land, flag.sourceUuid);
    if ( !(caster instanceof Actor) ) throw new Error("the caster could not be read off the card");
    const source = await resolveUuidAsync(flag.pick?.uuid);
    if ( !(source instanceof Actor) ) throw new Error(`no creature at ${flag.pick?.uuid}`);
    const original = originalOf(caster);
    const activity = activityFor(original, flag, message);
    if ( !activity ) throw new Error(`${flag.itemName} is not on ${original.name}'s sheet`);
    // The learned form first, on the original's own item — the copy a transform makes would lose it.
    if ( flag.learn?.uuid ) {
      const holder = knownHolderItem(original, flag.key);
      const learn = await steps.step("learn", {
        plan: () => (holder ? learnedList({ known: knownOf(holder), slots: Number(flag.slots) || 0, learn: flag.learn }) : null),
        witness: () => knownOf(holder),
        run: async list => { if ( holder && list ) await holder.setFlag(MODULE_ID, KNOWN_FORMS_FLAG, list); }
      });
      if ( learn.plan ) learned = { ...flag.learn };
    }
    // the last form is set, never added: a re-drive sets the same
    const holder = knownHolderItem(original, flag.key);
    if ( holder && (Number(flag.slots) > 0) ) await holder.setFlag(MODULE_ID, LAST_FORM_FLAG, flag.pick.uuid);
    const settings = activity.settings ?? undefined;
    if ( flag.empower ) {
      // the familiar empowered (a SUMMON_EMPOWERS cast): the companion's token actor, the spell's own bonuses on top
      const subject = resolveUuid(flag.targets?.[0]?.uuid);
      if ( !(subject instanceof Actor) || !subject.isToken ) throw new Error(`${flag.targets?.[0]?.name ?? "the companion"} is no longer on the table`);
      landed.push(await empowerOne(steps, subject, source, { activity, flag, message }));
    }
    else for ( const [n, t] of (flag.targets ?? []).entries() ) {
      const subject = resolveUuid(t.uuid);
      // a creature gone is passed over, unless a dead claimant's revert replaced it (its step's plan finds what came back)
      if ( !(subject instanceof Actor) && !flag.ledger?.land?.[`revert-${n}`] ) { failure = `${t.name} is not on any scene`; continue; }
      landed.push(await transformOne(steps, n, subject, source, { activity, settings, flag, pick: flag.pick, message }));
    }
    if ( !landed.length ) throw new Error(failure ?? "nobody to transform");
  } catch(err) {
    log.error(`The transform could not be landed — transform by hand.`, err);
    outcome = "failed";
    failure = String(err?.message ?? err);
  } finally {
    await queueFlagWrite(message, TRANSFORM_FLAG, current => {
      current.applied = true; current.applying = false; current.outcome = outcome; current.landed = landed;
      if ( failure ) current.failure = failure;
      if ( learned ) current.learned = learned;
      closeLedger(current, "land");
    });
  }
}

/** The GM's change: every landed creature reverted and transformed again into the new pick. */
async function changeTransform(message) {
  if ( !(await claimLanding(message, TRANSFORM_FLAG, current => !!current.applied && !current.ended && !!current.changeAsked, { field: "changing", done: null })) ) return;
  const flag = readFlag(message, TRANSFORM_FLAG);
  const pick = { uuid: flag.changeAsked.uuid, name: flag.changeAsked.name, img: flag.changeAsked.img ?? null };
  // THE LEDGER (ledger.js): a re-drive over a dead claim reverts and transforms each creature once, one form effect.
  const steps = landingSteps(message, TRANSFORM_FLAG, "change");
  const landed = [];
  let failure = null;
  try {
    const source = await resolveUuidAsync(pick.uuid);
    if ( !(source instanceof Actor) ) throw new Error(`no creature at ${pick.uuid}`);
    const caster = resolveUuid(flag.sourceUuid) ?? revertedFrom(flag.ledger?.change, flag.sourceUuid);
    for ( const [n, l] of (flag.landed ?? []).entries() ) {
      const current = resolveUuid(l.actorUuid) ?? revertedFrom(flag.ledger?.change, l.actorUuid) ?? resolveUuid(l.originalUuid);
      if ( !(current instanceof Actor) && !flag.ledger?.change?.[`revert-${n}`] ) continue;
      const original = current ? originalOf(current) : null;
      const activity = activityFor(originalOf(caster) ?? original, flag, message);
      landed.push(await transformOne(steps, n, current, source, { activity, settings: activity?.settings, flag, pick, message }));
    }
  } catch(err) {
    log.error(`The form could not be changed — transform by hand.`, err);
    failure = String(err?.message ?? err);
  } finally {
    await queueFlagWrite(message, TRANSFORM_FLAG, current => {
      current.changing = false;
      current.changed = [...(current.changed ?? []), { from: current.pick, to: pick, at: Date.now(), ...(failure ? { failure } : {}) }];
      if ( !failure ) { current.pick = pick; current.landed = landed; }
      delete current.changeAsked;
      closeLedger(current, "change");
    });
  }
}

/* --- the form ends --------------------------------------------------------------------------- */

/** Actors this client is reverting right now — one revert per creature, whatever fires it. */
const reverting = new Set();

/**
 * The elect ends a form: dnd5e's own revert, the record stamped `ended`, the card said. Idempotent:
 * a creature not transformed, or already reverting, is left alone. ⚠ A deleted form effect is no longer
 * on the creature (Concentration's end deletes its dependent before this runs): its listener passes the
 * effect's own record, or the card would never be stamped `ended`.
 * @param {Actor} actor   the transformed creature
 * @param {{ why: string, word: string }} ended
 * @param {object|null} [formFlag]   the form effect's record, when the effect is already gone
 */
async function revertForm(actor, ended, formFlag = null) {
  const form = formFlag ?? readFlag(formEffectOn(actor), FORM_FLAG) ?? null;
  const key = actor.isToken ? actor.token.uuid : actor.id;
  if ( !actor.isPolymorphed || reverting.has(key) ) return;
  reverting.add(key);
  const message = form?.messageId ? game.messages.get(form.messageId) : null;
  const flag = readFlag(message, TRANSFORM_FLAG) ?? null;
  const formName = flag?.pick?.name ?? actor.name;
  const who = actor.isToken ? (actor.token?.name ?? actor.name) : (originalOf(actor)?.name ?? actor.name);
  const oldToken = actor.isToken ? { id: actor.token?.id ?? null, sceneId: actor.token?.parent?.id ?? null } : null;
  try {
    const back = await actor.revertOriginalForm({ renderSheet: false });
    // an empowered companion: dnd5e's revert of an unlinked token makes a NEW token — the seat, the companion's record
    // and the caster's effect follow it
    if ( flag?.empower && oldToken?.id ) await repointEmpowered(flag, oldToken, back).catch(err => log.warn(`The reverted ${who} could not be re-seated — check the tracker.`, err));
    if ( message && flag && !flag.ended ) {
      await queueFlagWrite(message, TRANSFORM_FLAG, current => {
        if ( current.ended ) return false;
        current.ended = { why: ended.why, word: ended.word, at: Date.now() };
      });
    }
    await postCard({
      actor: originalOf(actor) ?? actor,
      card: bfCard({ eyebrow: flag?.itemName ?? "Transform", tone: "neutral", title: formTitle({ who, form: formName, ended }),
        subtitle: (ended.word === "revert") ? "reverted by choice" : "the form ends" }),
      flags: { [MODULE_ID]: { formEnd: { messageId: message?.id ?? null, actorUuid: actor.uuid, why: ended.why, word: ended.word, ...statContext(flag?.sourceUuid ?? null) } } }
    });
  } catch(err) {
    log.error(`${actor.name} could not be reverted — use the sheet's Restore Transformation.`, err);
  } finally {
    reverting.delete(key);
  }
}

/**
 * After an empowered companion reverts: the new token's sight as the companion's was, every combatant of the old
 * token re-pointed at the new one (dnd5e's `delete({ replacements })` re-points nothing, measured), the companion's
 * record naming the new token, and the caster's empower effect removed as the elect's own.
 */
async function repointEmpowered(flag, oldToken, back) {
  const token = (back instanceof TokenDocument) ? back : null;
  const caster = resolveUuid(flag.sourceUuid);
  const companionMessage = game.messages.get(flag.empower?.companionMessageId);
  if ( token ) {
    // its sight back: dnd5e's revert takes the world actor's prototype's, which the packs ship off
    if ( flag.empower?.look?.sight && !token._source?.sight?.enabled ) await token.update({ "sight.enabled": true });
    for ( const combat of game.combats ) {
      for ( const c of combat.combatants.filter(x => (x.tokenId === oldToken.id) && (x.sceneId === oldToken.sceneId)) ) {
        try { await c.update({ tokenId: token.id, actorId: token.actorId, name: token.name }); }
        catch { await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: token.parent.id, actorId: token.actorId, initiative: c.initiative }]); await c.delete(); }
      }
    }
    if ( companionMessage ) await queueFlagWrite(companionMessage, "summon", current => {
      current.landed = repointedLanded(current.landed ?? [], { oldTokenId: oldToken.id, tokenId: token.id, sceneId: token.parent.id, tokenUuid: token.uuid, actorUuid: token.actor?.uuid ?? null, name: token.name });
      if ( current.companion ) delete current.companion.empower;
    });
  } else if ( companionMessage ) await queueFlagWrite(companionMessage, "summon", current => { if ( current.companion ) delete current.companion.empower; });
  const effect = flag.landed?.[0]?.empowerEffectId ? caster?.effects?.get(flag.landed[0].empowerEffectId) : null;
  if ( effect ) await effect.delete({ [MODULE_ID]: { empowerEnd: true } });
}

/** The transform record a form effect ties to, or null. */
const recordOfForm = form => (form?.messageId ? readFlag(game.messages.get(form.messageId), TRANSFORM_FLAG) : null) ?? null;

// The hours ran out: Foundry marks the effect expired on the GM client, dnd5e deletes it there; either way the elect reverts.
listen("updateActiveEffect", "transforms", (effect, changes) => {
  try {
    if ( (changes?.duration?.expired !== true) || !readFlag(effect, FORM_FLAG) || !isActiveGM() ) return;
    const actor = effect.parent;
    if ( actor instanceof Actor ) void revertForm(actor, { word: "clock", why: "the time ran out" });
  } catch(err) { log.error(`The form's clock could not end it.`, err); }
});

// The effect removed — Revert on the bar, Concentration's end taking its dependent, a hand: the form ends with it.
listen("deleteActiveEffect", "transforms", effect => {
  try {
    if ( !readFlag(effect, FORM_FLAG) || !isActiveGM() ) return;
    const actor = effect.parent;
    if ( !(actor instanceof Actor) ) return;
    if ( !actor.isToken && !game.actors.get(actor.id) ) return;   // the copy itself is going: a revert already ran
    const form = readFlag(effect, FORM_FLAG);
    const dependent = !!effect.getFlag("dnd5e", "dependentOn");
    // an empowered companion's form depends on the caster's effect for the spell, not on Concentration
    const record = dependent ? recordOfForm(form) : null;
    const ended = (dependent && record?.empower) ? { word: "ended", why: `${record.itemName} ended` }
      : dependent ? { word: "concentration", why: "Concentration ended" } : { word: "revert", why: "the form was ended" };
    void revertForm(actor, ended, form);
  } catch(err) { log.error(`The form's end could not run.`, err); }
});

// 0 Hit Points, or the Temporary Hit Points gone: read off the creature's own update.
listen("updateActor", "transforms", (actor, changes) => {
  try {
    if ( !isActiveGM() || !(actor instanceof Actor) ) return;
    const form = readFlag(formEffectOn(actor), FORM_FLAG);
    if ( !form ) return;
    const hp = changes?.system?.attributes?.hp;
    if ( !hp || !(("value" in hp) || ("temp" in hp)) ) return;
    // an empowered companion at 0 Hit Points disappears instead (summons.js takes it off the table): no revert here
    if ( ("value" in hp) && (Number(hp.value) <= 0) && recordOfForm(form)?.empower ) return;
    const ended = endOfForm(TRANSFORMS[form.key]?.ends ?? [], { hpValue: ("value" in hp) ? hp.value : null, tempValue: ("temp" in hp) ? hp.temp : null });
    if ( ended ) void revertForm(actor, ended);
  } catch(err) { log.error(`The form's end could not be read off the update.`, err); }
});

// The Incapacitated condition lands on the creature in its form.
listen("createActiveEffect", "transforms", effect => {
  try {
    if ( !isActiveGM() ) return;
    const actor = effect.parent;
    if ( !(actor instanceof Actor) || readFlag(effect, FORM_FLAG) ) return;
    const form = readFlag(formEffectOn(actor), FORM_FLAG);
    if ( !form ) return;
    const ended = endOfForm(TRANSFORMS[form.key]?.ends ?? [], { statuses: [...(effect.statuses ?? [])] });
    if ( ended ) void revertForm(actor, ended);
  } catch(err) { log.error(`The form's end could not be read off the condition.`, err); }
});

/** The owner (on their own card) or a GM asks to revert; the elect executes it. */
async function askRevert(message) {
  await queueFlagWrite(message, TRANSFORM_FLAG, current => {
    if ( !current.applied || current.ended || current.revertAsked ) return false;
    current.revertAsked = true;
  });
}

async function driveRevert(message) {
  const flag = readFlag(message, TRANSFORM_FLAG);
  // an empowered companion whose spell effect went (summons.js asks the revert): the spell ended, not a choice
  const ended = (flag.empower && (flag.revertWhy === "ended")) ? { word: "ended", why: `${flag.itemName} ended` } : { word: "revert", why: "reverted by choice" };
  let any = false;
  for ( const l of flag.landed ?? [] ) {
    const actor = resolveUuid(l.actorUuid);
    if ( (actor instanceof Actor) && actor.isPolymorphed ) { any = true; await revertForm(actor, ended); }
  }
  await queueFlagWrite(message, TRANSFORM_FLAG, current => {
    if ( !current.ended ) current.ended = { why: any ? ended.why : "nothing was still transformed", word: ended.word, at: Date.now() };
  });
}

registerResumable(TRANSFORM_FLAG, {
  pending: flag => !!flag && (((flag.status === "picked") && !flag.applied && !claimHolds(flag.applying))
    || (flag.applied && !flag.ended && ((flag.revertAsked === true) || (!!flag.changeAsked && !claimHolds(flag.changing))))),
  drives: () => isActiveGM(),
  drive: async message => {
    const flag = readFlag(message, TRANSFORM_FLAG);
    if ( !flag.applied ) await landTransform(message);
    else if ( flag.revertAsked ) await driveRevert(message);
    else if ( flag.changeAsked ) await changeTransform(message);
  }
});

/* --- the card says it (R5) ------------------------------------------------------------------- */

function drawTransform(message, html, flag) {
  const row = document.createElement("div");
  row.className = "bythebooks-transform";
  const user = resolveUuid(flag.sourceUuid);
  const mine = answersHere(flag.askedBy, user);
  const who = flag.self ? flag.sourceName : (flag.targets ?? []).map(t => t.name).join(", ");
  const form = flag.pick?.name ?? "the form";
  if ( flag.status === "asked" ) {
    if ( !mine ) return;
    pendingRow(message, row, { latch: { sub: TRANSFORM_FLAG, show: () => showFormPopup(message) }, answer: { label: "Pick the form", style: { margin: "0.25rem 0 0" } } });
    html.querySelector(SURFACES.messageContent)?.appendChild(row);
    return;
  }
  if ( !flag.applied ) {
    const gm = !!game.users.activeGM;
    row.innerHTML = bfCard({ eyebrow: "Transform", tone: "pending", title: `${who} — ${articleOf(form)} ${form}, picked`,
      subtitle: gm ? "waiting for the GM's client to transform" : "no GM online — the form lands when a GM connects" });
  } else if ( flag.outcome === "failed" ) {
    row.innerHTML = bfCard({ eyebrow: "Transform", tone: "bad", title: formTitle({ who, form, failed: true }), subtitle: `${flag.failure ?? "see the console"} · transform by hand` });
  } else if ( flag.ended ) {
    row.innerHTML = bfCard({ eyebrow: "Transform", tone: "neutral", title: formTitle({ who, form, ended: flag.ended }) });
  } else {
    const learned = flag.learned ? `${flag.learned.name} learned as a known form` : null;
    // an empowered companion: its own name kept, the Temporary Hit Points it gained (the words are the player's)
    const empowered = flag.empower ? `empowered${Number.isFinite(Number(flag.landed?.[0]?.tempHp)) ? ` · ${flag.landed[0].tempHp} Temporary Hit Points` : ""}` : null;
    row.innerHTML = bfCard({ eyebrow: flag.empower ? "Empower" : "Transform", tone: "good", title: formTitle({ who, form }),
      subtitle: [learned, empowered ?? "transformed by the GM's client", (flag.changed?.length ? `changed by the GM from ${flag.changed.at(-1).from?.name ?? "the first form"}` : null)].filter(Boolean).join(" · ") });
    if ( (mine || game.user.isGM) && !flag.revertAsked ) row.appendChild(momentButton(flag.empower ? `End ${flag.itemName}` : "Revert", () => { void askRevert(message); }, { margin: "0.25rem 0 0" }));
    if ( game.user.isGM && !flag.changeAsked && !flag.revertAsked && !flag.empower ) row.appendChild(momentButton("Change the form", () => { void showChangePopup(message); }, { margin: "0.25rem 0 0" }));
    if ( flag.revertAsked ) row.appendChild(Object.assign(document.createElement("em"), { textContent: "reverting…" }));
    else if ( flag.changeAsked ) row.appendChild(Object.assign(document.createElement("em"), { textContent: `changing to ${flag.changeAsked.name}…` }));
  }
  html.querySelector(SURFACES.messageContent)?.appendChild(row);
}

/* --- the Long Rest: the one known-form swap ---------------------------------------------------- */

/** The resting character's Wild Shape holders: every listed row with slots whose item is on the sheet, one card each. */
function holdersOf(actor) {
  const out = [];
  const seen = new Set();
  for ( const [key, row] of Object.entries(TRANSFORMS) ) {
    if ( (typeof row.known !== "number") || !listed().has(lower(key)) ) continue;
    const item = featureNamed(actor, key);
    if ( !item || seen.has(item.id) ) continue;
    seen.add(item.id);
    out.push({ key, item, slots: row.known });
  }
  return out;
}

// The resting owner's client posts the ask (the mastery swap's road): every Long Rest shows the list.
listen("dnd5e.restCompleted", "transforms", (actor, result, config) => {
  try {
    if ( !(actor instanceof Actor) || !actor.isOwner || (actor.type !== "character") ) return;
    if ( ((result?.type ?? config?.type) !== "long") || !isPartyMember(actor.uuid) ) return;
    for ( const h of holdersOf(actor) ) {
      const known = knownOf(h.item);
      const state = knownState({ known, slots: h.slots });
      const activity = [...(h.item.system?.activities ?? [])].find(a => a.type === "transform") ?? null;
      const profile = activity?.availableProfiles?.[0] ?? null;
      const flag = { status: "pending", key: h.key, actorUuid: actor.uuid, actorName: actor.name, itemUuid: h.item.uuid, itemName: h.item.name,
        slots: h.slots, open: state.open, known,
        profile: profile ? { id: profile._id, cr: capOf(activity, profile), types: [...(profile.types ?? [])], sizes: [...(profile.sizes ?? [])], movement: [...(profile.movement ?? [])] } : null,
        restAt: Date.now(), ...statContext(actor.uuid) };
      void postCard({
        actor,
        card: bfCard({ eyebrow: h.item.name, tone: "pending",
          title: state.open ? `${actor.name} — ${state.open} open known form${state.open === 1 ? "" : "s"}` : `${actor.name} — swap a known form?`,
          subtitle: "chosen at the Long Rest · one swap" }),
        flags: { [MODULE_ID]: { [FORM_SWAP_FLAG]: flag } }
      }).catch(err => log.error(`The known-form swap could not be asked.`, err));
    }
  } catch(err) {
    log.error(`The known-form swap failed at the rest's end.`, err);
  }
});

/** The owner's answer — a swap (`out`, `into`), the open slots filled (`adds`), or a keep; the card's owner writes it, anyone else relays. */
export async function answerFormSwap(message, { out = null, into = null, adds = null, declined = false } = {}) {
  const flag = readFlag(message, FORM_SWAP_FLAG);
  if ( flag?.status !== "pending" ) return;
  const answer = declined ? { declined: true } : { out, into, adds: [...(adds ?? [])] };
  if ( message.isOwner || isActiveGM() ) {
    await queueFlagWrite(message, FORM_SWAP_FLAG, current => {
      if ( current.status !== "pending" ) return false;
      Object.assign(current, { status: "resolved", answeredAt: Date.now(), ...answer });
    });
    return;
  }
  await postAnswer("formSwapAnswer", {
    noGM: `${TITLE}: a GM must be on to land the change.`,
    actor: resolveUuid(flag.actorUuid),
    card: "", toElect: true,
    flags: { [MODULE_ID]: { formSwapAnswer: { messageId: message.id, ...answer } } }
  });
}

registerRelay("formSwapAnswer", {
  flagKey: FORM_SWAP_FLAG,
  targetOf: a => a.messageId,
  owns: () => isActiveGM(),
  cleanup: true,
  fold: (current, a) => {
    if ( current.status !== "pending" ) return false;
    const answer = a.declined ? { declined: true } : { out: a.out ?? null, into: a.into ?? null, adds: [...(a.adds ?? [])] };
    Object.assign(current, { status: "resolved", answeredAt: Date.now(), ...answer });
  }
});

/** The elect lands the answer on the item, judged against the list as it stands at the first drive. */
async function landFormSwap(message) {
  if ( !(await claimLanding(message, FORM_SWAP_FLAG, current => current.status === "resolved")) ) return;
  const flag = readFlag(message, FORM_SWAP_FLAG);
  // THE LEDGER (ledger.js): the list is judged once, so a re-drive over a dead claim neither changes it twice nor
  // calls a change it already made stale.
  const steps = landingSteps(message, FORM_SWAP_FLAG, "land");
  let outcome = "kept";
  let after = null;
  try {
    const actor = resolveUuid(flag.actorUuid);
    // live only: the Known Forms are a flag on the sheet's own Wild Shape item, which a Long Rest never uses up
    const item = resolveUuid(flag.itemUuid) ?? ((actor instanceof Actor) ? featureNamed(actor, flag.key) : null);
    if ( !flag.declined && item ) {
      const swap = await steps.step("list", {
        plan: () => {
          const known = knownOf(item);
          const list = restKnownList({ known, slots: Number(flag.slots) || 0, out: flag.out, into: flag.into, adds: flag.adds ?? [] });
          return { list, changed: !!list && (JSON.stringify(list) !== JSON.stringify(known)) };
        },
        witness: () => knownOf(item),
        run: async p => { if ( p.changed ) await item.setFlag(MODULE_ID, KNOWN_FORMS_FLAG, p.list); }
      });
      outcome = swap.plan.changed ? "changed" : swap.plan.list ? "kept" : "stale";
    }
    if ( item ) after = knownOf(item);
  } catch(err) {
    log.error(`${flag.actorName}'s known forms could not be changed.`, err);
    outcome = "failed";
  } finally {
    await queueFlagWrite(message, FORM_SWAP_FLAG, current => {
      current.applied = true; current.applying = false; current.outcome = outcome;
      if ( after ) current.after = after;
      closeLedger(current, "land");
    });
  }
}

registerResumable(FORM_SWAP_FLAG, {
  pending: flag => (flag?.status === "resolved") && !flag.applied && !claimHolds(flag.applying),
  drives: () => isActiveGM(),
  drive: landFormSwap
});

/** The known forms as picker rows, each described off its creature. */
async function knownRows(known, pool, { lastForm = null } = {}) {
  const rows = [];
  for ( const k of known ) rows.push(await knownRow(pool, k, { tags: (k.uuid === lastForm) ? ["last used"] : [] }));
  return rows;
}

async function showSwapPopup(message) {
  const flag = readFlag(message, FORM_SWAP_FLAG);
  if ( flag?.status !== "pending" ) return;
  const actor = resolveUuid(flag.actorUuid);
  if ( !actor ) return;
  const pool = await poolFromPacks({ types: flag.profile?.types?.length ? flag.profile.types : ["beast"] });
  const rule = poolRuleOf(flag.profile ?? {}, {});
  const allowed = galleryRows(pool, rule).filter(r => !(flag.known ?? []).some(k => k.uuid === r.uuid));
  const open = Number(flag.open) || 0;
  // one swap: a known form ticked out frees one pick; else as many picks as slots are open
  const sections = [{ head: `You know these forms${flag.known?.length ? " — tick one to swap it out, or keep them" : ""}`, field: "bf-form-out", multi: true, max: 1,
    rows: await knownRows(flag.known ?? [], pool) }];
  if ( open ) sections.push({ note: `${open} slot${open === 1 ? "" : "s"} open — pick that many below to fill them.` });
  sections.push({ head: open ? "Fill the open slots" : "Available", field: "bf-form-in", multi: true, pool: allowed, max: picks => open + picks.all("bf-form-out").length });
  await openPicker(message, FORM_SWAP_FLAG, actor, {
    title: `${flag.itemName} — ${flag.actorName}`, icon: "fa-solid fa-paw", width: 500,
    card: { eyebrow: flag.itemName, title: open ? "Choose your known forms" : "Swap a known form?",
      subtitle: `${flag.known?.length ?? 0} of ${flag.slots} known · one swap per Long Rest · ${capLabelOf(rule) || "any form the rule allows"}` },
    sections,
    buttons: [
      { action: "ok", label: "OK", default: true, submit: picks => {
        const out = picks.one("bf-form-out");
        const ins = picks.all("bf-form-in").map(uuid => pool.find(r => r.uuid === uuid)).filter(Boolean).map(r => ({ uuid: r.uuid, name: r.name, img: r.img ?? null }));
        if ( !ins.length ) { void answerFormSwap(message, { declined: true }); return; }
        const into = out ? (ins.shift() ?? null) : null;
        void answerFormSwap(message, { out: into ? out : null, into, adds: ins });
      } },
      { action: "keep", label: "Keep them", submit: () => { void answerFormSwap(message, { declined: true }); } }
    ]
  });
}

/** What the landed answer did, in words (plain text: the card escapes its title). */
function swapLine(flag) {
  if ( flag.outcome === "changed" ) {
    const parts = [];
    if ( flag.adds?.length ) parts.push(`Learned ${flag.adds.map(a => a.name).join(", ")}`);
    if ( flag.out && flag.into ) parts.push(`${parts.length ? "swapped" : "Swapped"} ${(flag.known ?? []).find(k => k.uuid === flag.out)?.name ?? "a form"} → ${flag.into.name}`);
    return parts.join(" · ") || "Changed";
  }
  if ( flag.outcome === "stale" ) return "The change no longer fit the list — kept";
  if ( flag.outcome === "failed" ) return "The change could not be written";
  return "Kept";
}

/** The confirmation after the landing: what you know now and what changed, OK. */
async function showSwapDone(message, flag) {
  const actor = resolveUuid(flag.actorUuid);
  const pool = await poolFromPacks({ types: flag.profile?.types?.length ? flag.profile.types : ["beast"] });
  await openPicker(message, "formSwapDone", actor, {
    title: `${flag.itemName} — ${flag.actorName}`, icon: "fa-solid fa-paw", width: 500,
    card: { eyebrow: flag.itemName, tone: (flag.outcome === "changed") ? "good" : "neutral",
      title: swapLine(flag), subtitle: `${(flag.after ?? flag.known ?? []).length} of ${flag.slots} known` },
    sections: [{ head: "You now know these forms", rows: await knownRows(flag.after ?? flag.known ?? [], pool) }],
    buttons: [{ action: "ok", label: "OK", default: true, submit: () => acknowledgeMoment(message, FORM_SWAP_FLAG) }]
  });
}

function drawSwap(message, html, flag) {
  const row = document.createElement("div");
  row.className = "bythebooks-transform";
  const actor = resolveUuid(flag.actorUuid);
  if ( flag.status === "pending" ) {
    if ( !canAnswerFor(actor) ) return;
    pendingRow(message, row, { latch: { sub: FORM_SWAP_FLAG, show: () => showSwapPopup(message) }, answer: { style: { margin: "0.25rem 0 0" } } });
    html.querySelector(SURFACES.messageContent)?.appendChild(row);
    return;
  }
  if ( !flag.applied ) return;
  const names = (flag.after ?? flag.known ?? []).map(k => `<b>${esc(k.name)}</b>`).join(", ") || "<em>none yet</em>";
  row.innerHTML = bfCard({ eyebrow: flag.itemName, tone: (flag.outcome === "changed") ? "good" : "neutral",
    title: swapLine(flag), subtitle: flag.actorName, lines: [`Known forms: ${names}`] });
  html.querySelector(SURFACES.messageContent)?.appendChild(row);
  if ( canAnswerFor(actor) && !momentAcknowledged(message, FORM_SWAP_FLAG) ) {
    pendingRow(message, row, { latch: { sub: "formSwapDone", show: () => showSwapDone(message, flag) }, answer: { label: "OK", style: { margin: "0.25rem 0 0" } } });
  }
}

listen("dnd5e.renderChatMessage", "transforms", (message, html) => {
  try {
    const flag = readFlag(message, TRANSFORM_FLAG);
    if ( flag ) drawTransform(message, html, flag);
    const swap = readFlag(message, FORM_SWAP_FLAG);
    if ( swap ) drawSwap(message, html, swap);
  } catch(err) {
    log.error(`The transform's row could not be drawn.`, err);
  }
});

// A change asked, a revert asked or the form ended withdraws the GM's change popup on every GM screen (§5 law 4):
// each GM client opens its own.
listen("updateChatMessage", "transforms", message => {
  const flag = readFlag(message, TRANSFORM_FLAG);
  if ( flag?.changeAsked || flag?.revertAsked || flag?.ended ) void closePopup(message, "transformChange");
});

listen("ready", "transforms", () => {
  const mod = game.modules.get(MODULE_ID);
  if ( mod ) mod.api = Object.assign(mod.api ?? {}, { transforms: { showFormPopup, askRevert, answerFormSwap, knownOf } });
});
