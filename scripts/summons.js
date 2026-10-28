/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): SUMMONS (issue #1) — the player casts and places, the
 * active GM's client makes the creature. dnd5e's summon activity places only for a user who holds
 * Create Token (and Create Actor for a compendium import) in a world with Allow Summoning on, and its
 * dialog cannot ask what a spell's own text asks (the dragon's damage type). Here the system's placement
 * is switched off, and its dialog's Creation section hidden, for every summon activity with a profile;
 * the caster's client asks everything in ONE popup off the cast card (the form rows ruled C, RULINGS
 * *Summons*; the shared gallery and the spot picker are gallery.js; the creature type and size when
 * the activity offers more than one), takes the spaces (the range ring, the clicks; no permission
 * needed) and writes the record on its own card; the elect
 * fetches or imports the creature with its own permissions, applies dnd5e's own profile changes, narrows
 * the dragon's breath, creates the tokens (a creature's seeing, a familiar under the name its owner gave it), seats them right
 * after the caster, grants the caster's players ownership, lands the shared resistance on the caster, and
 * stamps `applied`. With no GM online the card holds and says so (DESIGN §4). Dismiss deletes what the
 * elect made, and the concentration effect's end asks it.
 */
import { MODULE_ID, readFlag, TITLE, activeCombatFor, isActiveGM, queueFlagWrite, answersHere, statContext, resolveUuid, log, claimLanding, claimHolds } from "./core.js";
import { activityNamed, cardActivity, featureNamed, lower } from "./lookup.js";
import { ruleHTML } from "./rule-text.js";
import { HELP_NAME, HELP_RULE, helpItemData } from "./decide/help.js";
import { COMPANIONS, SUMMON_AS, SUMMON_BOONS, SUMMON_CHOICES, SUMMON_COMMANDS, SUMMON_EMPOWERS, SUMMON_EXTRAS, SUMMON_FALLS, SUMMON_GUISES, SUMMON_LIGHTS, SUMMON_LOOKS, SUMMON_ONE_FORM, TRANSFORMS,
  summonChoiceEntries, summonEmpowerEntries, summonFallEntries, summonOwnInitiativeEntries, summonSingleEntries, listedNames } from "./decide/registry.js";
import { profileRows, choiceRowKey, formNeeds, poolPicks, summonRecord, placedAnswer, narrowedActivities, resistanceEffectData,
  ownershipGrant, seatInitiative, recallSeat, guardsHandDelete, handDeletePasses, handDeleteRecord, handDeleteQuestion, rangeFeet, replacedSummons, companionEffectName, currentCompanion, companionMenu, companionAsk,
  carriedItemIds, sizesInOrder, summonEffectName, tokenLight, formName, guisesOf, boonFormula, boonHpPlan, systemHpBonusOf, castUsage,
  fallenSummon, casterDeathSummons, lastFormRows, empowerRoute, staleCompanionEffect, summonSees, petNameOf, rememberedName, rememberName,
  PET_NAME_MAX } from "./decide/summons.js";
import { transformRecord } from "./decide/transforms.js";
import { bfCard, esc } from "./decide/present.js";
import { artChanges } from "./decide/summon-art.js";
import { concentrationIdOf } from "./decide/card.js";
import { effectRecord, joinEffectReceipt } from "./decide/receipt.js";
import { describeCreature, openPicker, pickSpots, poolFromPacks, poolRuleOf, summonArt } from "./gallery.js";
import { CONCENTRATION_ASKED } from "./shared.js";
import { momentButton, registerResumable, pendingRow, confirmPopup } from "./ui.js";
import { SURFACES } from "./surfaces.js";
import { listen, listenOnce } from "./dispatch.js";
import { tokenDocOf, tokenOnScene, tokensOf } from "./geometry.js";

const SUMMON_FLAG = "summon";
/** The transform record a SUMMON_EMPOWERS cast stamps on its card instead of a summon record (transforms.js lands it). */
const EMPOWER_RECORD_FLAG = "transform";
/** The profile last taken through a summon spell, a flag on the caster's own item: marked on its row at the next cast. */
const SUMMON_LAST_FLAG = "lastForm";
/** The names a caster gave its companions (COMPANIONS `names`), a flag on the caster's actor: `{ names: [{ spell, name }] }`,
 * one per spell, read into the menu's name field and written by the elect at the landing. */
const SUMMON_PET_NAME_FLAG = "petNames";
const listed = () => listedNames(summonChoiceEntries());

/** The SUMMON_FALLS row a spell answers to, by name, or null. */
const fallRowOf = name => {
  const key = lower(rulesName(name) ?? "");
  return (listedNames(summonFallEntries()).has(key) ? Object.entries(SUMMON_FALLS).find(([k]) => lower(k) === key)?.[1] : null) ?? null;
};

/** The SUMMON_EMPOWERS row a spell answers to, by name, or null. */
const empowerRowOf = name => {
  const key = lower(name ?? "");
  return (listedNames(summonEmpowerEntries()).has(key) ? Object.entries(SUMMON_EMPOWERS).find(([k]) => lower(k) === key)?.[1] : null) ?? null;
};

/** A SUMMON_EXTRAS row's own activity (Pact of the Chain's Expanded Options): its forms are a tab of the item's
 * summon, never a use of their own. */
const isExtraActivity = activity => Object.entries(SUMMON_EXTRAS).some(([key, row]) =>
  (lower(activity?.item?.name) === lower(key)) && (lower(activity?.name) === lower(row.activity)));

/** A summon activity the module takes off the system's hands: one with a profile the cast may use. */
const takes = activity => (activity?.type === "summon") && !!activity.availableProfiles?.length && !isExtraActivity(activity);

/** The SUMMON_LIGHTS row a spell answers to, by name, or null. */
const lightRowOf = name => Object.entries(SUMMON_LIGHTS).find(([k]) => lower(k) === lower(name ?? ""))?.[1] ?? null;

/** The SUMMON_ONE_FORM row a spell answers to, by name, or null. */
const oneFormOf = name => Object.entries(SUMMON_ONE_FORM).find(([k]) => lower(k) === lower(name ?? ""))?.[1] ?? null;

/** The SUMMON_AS row a feature answers to (Wild Companion), by name, or null. */
const asRowOf = name => Object.entries(SUMMON_AS).find(([k]) => lower(k) === lower(name ?? ""))?.[1] ?? null;

/** The name the tables know a summon by: the spell a feature casts (Wild Companion is Find Familiar), else its own. */
const rulesName = name => asRowOf(name)?.as ?? name;

/** The table's art for a creature: the item's own entry, else the spell's it casts (Wild Companion wears Find Familiar's). */
function artOf(itemName, creature) {
  const own = summonArt(itemName, creature);
  if ( own.token || own.portrait || (rulesName(itemName) === itemName) ) return own;
  return summonArt(rulesName(itemName), creature);
}

/** The SUMMON_GUISES row a spell answers to, by name, or null. */
const guiseRowOf = name => Object.entries(SUMMON_GUISES).find(([k]) => lower(k) === lower(name ?? ""))?.[1] ?? null;

/** A size key's footprint in grid squares (dnd5e's own table, where one square is the default), or null. */
const squaresOf = size => (CONFIG.DND5E?.actorSizes?.[size] ? (Number(CONFIG.DND5E.actorSizes[size].token) || 1) : null);

/** The SUMMON_LOOKS row a creature answers to, by name, or null. */
const lookOf = name => Object.entries(SUMMON_LOOKS).find(([k]) => lower(k) === lower(name ?? ""))?.[1] ?? null;

/** A creature's sense ranges by sense (the prepared `ranges`, else a stat block's flat senses), or null. */
const sensesOf = actor => actor?.system?.attributes?.senses?.ranges ?? actor?.system?.attributes?.senses ?? null;

/** Whether a summon's token sees (decide/summons.js `summonSees`): the type the record landed it with, else the creature's own, its
 * senses, and its SUMMON_LOOKS row's `sees` (a sensor the caster sees through); `thing` a light's object. */
const seesOf = (actor, flag, { thing = false, look = null } = {}) => summonSees({ type: flag?.creatureType ?? actor?.system?.details?.type?.value ?? null,
  senses: sensesOf(actor), thing, sees: !!look?.sees });

/** The name the caster last gave its companion of this spell (COMPANIONS `names`), or null. */
const petNameFor = (caster, itemName) => rememberedName(readFlag(caster, SUMMON_PET_NAME_FLAG)?.names ?? [], rulesName(itemName));

/** The activity on the actor's own item (a use's hook hands over the clone dnd5e works on). */
const liveActivity = activity => activity?.actor?.items?.get(activity.item?.id)?.system?.activities?.get(activity.id) ?? null;

/** The summon activity on an item the module takes, or null. */
const summonActivityOf = item => [...(item?.system?.activities ?? [])].find(a => takes(a)) ?? null;

/**
 * The casts this client is making from the summon menu, by activity uuid: the menu's answer, read when
 * the use posts its card. Present only while that one use runs.
 */
const planned = new Map();

/* --- the spell is cast, then the menu: the system's dialog first --------------------------------- */

// A summon spell is one button: its other activities (Flaming Sphere's ram save, Dancing Lights' Move Lights,
// Minor Illusion's Study) are hidden on the caster's spell, since the placed creature does those itself
// (RULINGS *Summons*, call 32). Hidden through `Activity#isHidden`, which every list the system draws or uses
// reads (`canUse`: the sheet, the activity picker, `Item5e#use`), so a spell with one left uses it straight.
/** A spell's activity that is not its summon, on a spell whose summon the module takes. */
const offCaster = activity => (activity?.type !== "summon") && (activity?.item?.type === "spell") && !!summonActivityOf(activity.item);

/** `Activity#isHidden` with the summon spell's other activities hidden too; `was` the system's getter. */
function hiddenGetter(was) {
  return function() {
    if ( was.call(this) ) return true;
    try { return offCaster(this); } catch { return false; }
  };
}

listenOnce("init", "summons", () => {
  let proto = CONFIG.DND5E?.activityTypes?.summon?.documentClass?.prototype ?? null;
  while ( proto && !Object.hasOwn(proto, "isHidden") ) proto = Object.getPrototypeOf(proto);
  const was = proto ? Object.getOwnPropertyDescriptor(proto, "isHidden") : null;
  if ( !was?.get ) { log.warn(`Could not hide a summon spell's other activities: dnd5e's Activity#isHidden was not found.`); return; }
  Object.defineProperty(proto, "isHidden", { ...was, get: hiddenGetter(was.get) });
});

// ⚠ dnd5e calls no hook before its activity picker (`Item5e#use`): an item (not a spell) with a summon
// activity and others skips it for the summon, the picker dismissed unseen (gear-lights.js does the same).
listen("renderActivityChoiceDialog", "summons", (app, element) => {
  try {
    const activity = summonActivityOf(app?.item);
    if ( !activity ) return;
    if ( element?.style ) element.style.display = "none";
    setTimeout(() => { void app.close({ animate: false }); }, 0);
    void activity.use();
  } catch(err) { log.error(`Could not open the summon — use the spell's summon from the sheet.`, err); }
});

// The use of a summon activity opens the system's own Cast Spell dialog (the slot, the spend ticks, the
// Concentration it ends), its Creation section hidden and switched off. A companion standing opens its own
// menu instead (COMPANIONS). The cast the menu makes runs with no dialog and the system's placement off.
listen("dnd5e.preUseActivity", "summons", (activity, usageConfig, dialogConfig) => {
  try {
    // the extra forms' own activity used from the sheet: the item's summon opens, the forms on their tab
    if ( isExtraActivity(activity) ) {
      const main = summonActivityOf(activity.item);
      if ( main ) { void main.use(); return false; }
      return;
    }
    if ( !takes(activity) ) return;
    // The usage dialog's Creation section (Place Summons, the system's own selects) is hidden as well as
    // switched off: ticked, it would start dnd5e's placement beside the module's (RULINGS *Summons*).
    usageConfig.create ??= {};
    usageConfig.create.summons = false;
    if ( dialogConfig ) {
      dialogConfig.options ??= {};
      dialogConfig.options.display ??= {};
      foundry.utils.setProperty(dialogConfig.options.display, "create.summons", false);
    }
    if ( planned.has(activity.uuid) ) {
      if ( dialogConfig ) dialogConfig.configure = false;
      return;
    }
    const row = companionOf(activity.item?.name);
    if ( row ) {
      const through = castThrough.delete(activity.uuid);
      // With no GM online the cast is refused before anything, so no slot is spent on a creature that cannot land.
      if ( needsGM(row) ) return false;
      const id = through ? null : currentCompanion(summonRecords(), activity.actor?.uuid ?? "", rulesName(activity.item.name));
      const message = id ? game.messages.get(id) : null;
      // the menu's Summon casts again with the cause this use arrived with (a forward's free cast: Familiar Friend); a use sent to
      // its card (`toCard`: a macro, an automation, the live suites) is that Summon — the new form takes the old one's place
      if ( message && !usageConfig?.[MODULE_ID]?.toCard ) { void showCompanionMenu(message, activity, usageConfig?.cause ? foundry.utils.deepClone(usageConfig.cause) : null); return false; }
    }
    // A spell that empowers a standing companion (SUMMON_EMPOWERS): the route is read before the dialog opens. A use
    // carrying the answer (`[MODULE_ID].empower`: a macro, an automation, the live suites) skips the question.
    const erow = empowerRowOf(activity.item?.name);
    if ( erow && !castThrough.delete(activity.uuid) && !usageConfig?.[MODULE_ID]?.empower ) {
      const route = empowerRoute(summonRecords(), activity.actor?.uuid ?? "", rulesName(erow.companion));
      if ( route.route === "refuse" ) {
        ui.notifications?.warn(`${TITLE}: you can't cast ${activity.item.name} while your ${lower(companionOf(erow.companion)?.noun ?? "companion")} is in its pocket dimension — call it back first.`);
        return false;
      }
      if ( route.route === "ask" ) {
        if ( needsGM(companionOf(erow.companion) ?? { noun: "familiar" }) ) return false;
        void askEmpowerQuestion(activity, erow, route, usageConfig?.cause ? foundry.utils.deepClone(usageConfig.cause) : null);
        return false;
      }
    }
  } catch(err) { log.warn(`Could not take the summon — the spell is cast as usual.`, err); }
});

/** The empower question's answers, by activity uuid, read by the dialog's answer: the companion to dismiss, or to empower. */
const empowerAnswers = new Map();

/**
 * The one question when the companion stands on the table: summon a new one (the companion dismissed forever as
 * the new one lands) or empower it (RULINGS *Summons*, the Battle Familiar pass). Either way the system's own
 * Cast dialog follows; nothing is spent here.
 */
async function askEmpowerQuestion(activity, erow, route, cause) {
  const caster = activity.actor;
  const message = game.messages.get(route.messageId);
  const flag = readFlag(message, SUMMON_FLAG);
  const crow = companionOf(erow.companion);
  const noun = lower(crow?.noun ?? "companion");
  const name = route.name ?? noun;
  const creature = flag?.summonUuid ? await describeCreature(flag.summonUuid, { label: name }) : { label: name, img: null, summary: null };
  creature.img = liveToken(flag)?.texture?.src ?? creature.img;
  const go = answer => {
    empowerAnswers.set(activity.uuid, { ...answer, companionMessageId: route.messageId });
    castThrough.add(activity.uuid);
    void activity.use(cause ? { cause } : {}).catch(err => log.error(`${activity.item.name} could not be cast.`, err));
  };
  await openPicker({ id: `empower-${activity.uuid}` }, "empowerAsk", caster, {
    title: `${activity.item.name} — ${caster.name}`, icon: "fa-solid fa-spaghetti-monster-flying", width: 440, by: game.user.id,
    card: { eyebrow: "Summon", title: `Your ${noun} ${esc(name)} is on the table`, subtitle: "empower it, or summon a new one in its place?" },
    sections: [{ rows: [{ value: flag?.summonUuid ?? "companion", ...creature }] }, { rule: erow.rule }],
    buttons: [
      { action: "empower", label: `Empower ${name}`, default: true, submit: () => go({ empower: true }) },
      { action: "summon", label: "Summon a new one", submit: () => go({ dismiss: true }) },
      { action: "cancel", label: "Not now" }
    ]
  });
}

// The dialog's answer is taken here, after the dialog and before anything is spent (RULINGS *Summons*, call
// 33): the use is vetoed, the module's menu opens at the level the dialog picked, and Place casts again with
// that answer and no dialog. A cancelled menu or a cancelled placement spends nothing.
listen("dnd5e.preActivityConsumption", "summons", (activity, usageConfig) => {
  try {
    if ( !takes(activity) || planned.has(activity.uuid) || !activity.actor?.isOwner ) return;
    // a use sent to its card (`[MODULE_ID].toCard`: a macro, an automation, the live suites) skips the window: the card
    // posts its record asked and its own "Place the creature" answers it
    if ( usageConfig?.[MODULE_ID]?.toCard ) return;
    // another way ticked in the dialog (Wild Companion's Wild Shape use): Place casts with that activity, its own spend
    const way = paidWith.get(activity.uuid);
    paidWith.delete(activity.uuid);
    const other = way ? liveActivity({ actor: activity.actor, item: activity.item, id: way }) : null;
    // a forward ticked (the free cast): the same summon, cast again with the forward as its cause — the system spends
    // the spell's use and no slot (call 45)
    if ( other?.type === "forward" ) {
      const live = liveActivity(activity) ?? activity;
      const asked = { cause: { activity: other.relativeUUID }, consume: { spellSlot: false, resources: false },
        concentration: usageConfig.concentration ? foundry.utils.deepClone(usageConfig.concentration) : undefined };
      void openCastMenu(live, asked, Number(live.item.system?.level) || live.relevantLevel).catch(err => {
        log.error(`The summon menu failed — cast the spell again.`, err);
        ui.notifications?.error(`${TITLE}: the summon menu could not open (${err?.message ?? err}).`);
      });
      return false;
    }
    if ( other ) {
      void openCastMenu(other, {}, Number(other.item.system?.level) || other.relevantLevel).catch(err => {
        log.error(`The summon menu failed — use it again.`, err);
        ui.notifications?.error(`${TITLE}: the summon menu could not open (${err?.message ?? err}).`);
      });
      return false;
    }
    const live = liveActivity(activity) ?? activity;
    const slotKey = usageConfig.spell?.slot ?? null;
    const noSlot = usageConfig.consume?.spellSlot === false;
    const slotLevel = (!noSlot && slotKey) ? (Number(activity.actor.system?.spells?.[slotKey]?.level) || null) : null;
    const asked = {
      spell: usageConfig.spell ? foundry.utils.deepClone(usageConfig.spell) : undefined,
      consume: usageConfig.consume ? foundry.utils.deepClone(usageConfig.consume) : undefined,
      concentration: usageConfig.concentration ? foundry.utils.deepClone(usageConfig.concentration) : undefined,
      // a forward activity's cast (Familiar Friend's "(free casting)"): its item use is spent by the system only when the cause rides
      cause: usageConfig.cause ? foundry.utils.deepClone(usageConfig.cause) : undefined
    };
    const level = slotLevel ?? (Number(live.item.system?.level) || live.relevantLevel);
    // the empower question answered (SUMMON_EMPOWERS): the form menu for the companion, or the summon road with the companion to dismiss
    const empower = empowerAnswers.get(activity.uuid) ?? null;
    empowerAnswers.delete(activity.uuid);
    if ( empower?.empower ) {
      void openEmpowerMenu(live, asked, level, empower.companionMessageId).catch(err => {
        log.error(`The empower menu failed — cast the spell again.`, err);
        ui.notifications?.error(`${TITLE}: the empower menu could not open (${err?.message ?? err}).`);
      });
      return false;
    }
    void openCastMenu(live, asked, level, empower?.dismiss ? empower.companionMessageId : null).catch(err => {
      log.error(`The summon menu failed — cast the spell again.`, err);
      ui.notifications?.error(`${TITLE}: the summon menu could not open (${err?.message ?? err}).`);
    });
    return false;
  } catch(err) { log.warn(`Could not take the summon — the spell is cast as usual.`, err); }
});

/** The module's menu after the system's dialog, at the cast's level; Place casts with the dialog's answer.
 * `dismisses` a companion's message id the landing dismisses forever (the empower question's "Summon a new one"). */
async function openCastMenu(activity, asked, level, dismisses = null) {
  const item = activity.item;
  const facts = await castFacts(activity, level);
  const was = companionOf(item.name) ? currentCompanion(summonRecords(), activity.actor.uuid, rulesName(item.name)) : null;
  if ( was && game.messages.get(was) ) facts.replaces = replacesOf(game.messages.get(was));
  facts.askedBy = game.user.id;
  await askSummon(`cast-${activity.uuid}`, facts, { light: lightRowOf(item.name) }, async answer => {
    const usage = castUsage(asked, { create: { summons: false }, [MODULE_ID]: { [CONCENTRATION_ASKED]: true, lightOn: answer.lightOn ?? null } });
    planned.set(activity.uuid, dismisses ? { ...answer, dismisses } : answer);
    try { await activity.use(usage, { configure: false }, {}); } finally { planned.delete(activity.uuid); }
  });
}

/* --- the familiar empowered (SUMMON_EMPOWERS): the form menu, then a transform record on the cast card ---- */

/**
 * The form menu for the standing companion: the spell's forms at the cast's level, no creature type (the
 * companion keeps its own), no placement (it stands where it is). Empower casts with the dialog's answer;
 * the card then carries a transform record for transforms.js to land (RULINGS *Summons*, the Battle Familiar pass).
 */
async function openEmpowerMenu(activity, asked, level, companionMessageId) {
  const item = activity.item;
  const erow = empowerRowOf(item.name);
  const companionMessage = game.messages.get(companionMessageId);
  const cflag = readFlag(companionMessage, SUMMON_FLAG);
  if ( !erow || !cflag?.companion ) return;
  const facts = await castFacts(activity, level);
  const caster = activity.actor;
  const noun = lower(companionOf(erow.companion)?.noun ?? "companion");
  const name = cflag.companion.name || cflag.summonName || noun;
  const tokenArt = (formLabel, img) => artOf(facts.itemName, formLabel).token ?? img ?? null;
  const rows = lastFormRows(facts.profiles, facts.lastForm).map(p => ({ value: p.id, label: p.label || p.name, img: tokenArt(p.label || p.name, p.img), summary: p.summary, checked: p.checked, tags: p.tags }));
  await openPicker({ id: `empower-${activity.uuid}` }, EMPOWER_RECORD_FLAG, caster, {
    title: `${facts.itemName} — ${facts.sourceName}`, icon: "fa-solid fa-spaghetti-monster-flying", width: 480, by: game.user.id,
    card: { eyebrow: "Empower", title: `${esc(name)} takes a form`, subtitle: facts.level ? `level ${facts.level} · its own name, type and Hit Points kept` : "its own name, type and Hit Points kept" },
    sections: [{ head: "The form", field: "bf-empower-profile", rows }, { rule: erow.rule }],
    needs: [{ field: "bf-empower-profile", why: "pick the form first" }],
    buttons: [
      { action: "empower", label: `Empower ${name}`, default: true, checks: true, submit: picks => {
        const profile = facts.profiles.find(p => p.id === picks.one("bf-empower-profile")) ?? facts.profiles[0];
        if ( !profile?.uuid ) { ui.notifications?.warn(`${TITLE}: that form names no creature.`); return; }
        const usage = castUsage(asked, { create: { summons: false }, [MODULE_ID]: { [CONCENTRATION_ASKED]: true } });
        planned.set(activity.uuid, { empower: { companionMessageId, profileId: profile.id, level: Number(level) || 0,
          pick: { uuid: profile.uuid, name: profile.label || profile.name, img: profile.img ?? null } } });
        void (async () => { try { await activity.use(usage, { configure: false }, {}); } finally { planned.delete(activity.uuid); } })()
          .catch(err => log.error(`${item.name} could not be cast — cast it again.`, err));
      } },
      { action: "cancel", label: "Not now" }
    ]
  });
}

/**
 * The transform record on the cast card for an empower (transforms.js lands it as a `subject: "companion"`
 * row): the companion's live token actor the subject, the form the pick, `empower` naming the companion's
 * card and the summon activity's level. `picked` at birth, so the elect lands it on the next render.
 */
async function stampEmpower(activity, message, answer) {
  const actor = activity.actor;
  const erow = empowerRowOf(activity.item.name);
  const trow = erow ? TRANSFORMS[erow.transform] : null;
  const companionMessage = game.messages.get(answer.companionMessageId);
  const cflag = readFlag(companionMessage, SUMMON_FLAG);
  const doc = cflag ? liveToken(cflag) : null;
  if ( !erow || !trow || !cflag?.companion || !doc?.actor ) {
    ui.notifications?.error(`${TITLE}: the ${lower(companionOf(erow?.companion ?? "")?.noun ?? "companion")} is no longer on the table — ${activity.item.name} could not empower it.`);
    return;
  }
  const tok = tokenDocOf(actor, { activity });
  const record = transformRecord({
    key: erow.transform, sourceUuid: actor.uuid, sourceName: tok?.name ?? actor.name,
    itemUuid: activity.item.uuid, itemName: activity.item.name, itemType: activity.item.type, activityUuid: activity.uuid,
    profile: { id: answer.profileId, cr: null, types: [], sizes: [], movement: [], uuid: answer.pick.uuid, name: answer.pick.name },
    self: false, targets: [{ uuid: doc.actor.uuid, name: doc.name }], targetCap: null, known: [], slots: 0, lastForm: null,
    concentrationId: null, sceneId: doc.parent?.id ?? null
  });
  record.pick.img = answer.pick.img ?? null;
  // its look at the cast, put back after the transform (dnd5e's transform wears the form's art)
  record.empower = { companionMessageId: companionMessage.id, level: Number(answer.level) || Number(activity.relevantLevel) || 0, tokenId: doc.id, name: doc.name,
    look: { texture: doc._source?.texture?.src ?? doc.texture?.src ?? null, img: doc.actor.img ?? null,
      // its own ring too: dnd5e's transform wears the form's (`tokenPropsFromSource` carries `ring`)
      ring: doc._source?.ring ? foundry.utils.deepClone(doc._source.ring) : null,
      // and its sight: dnd5e's transform and its revert take the world actor's prototype's, which the packs ship off
      sight: !!doc._source?.sight?.enabled } };
  record.askedBy = game.user.id;
  await message.setFlag(MODULE_ID, EMPOWER_RECORD_FLAG, { ...record, ...statContext(actor.uuid) });
  const item = actor.items.get(activity.item.id);
  if ( item ) await item.setFlag(MODULE_ID, SUMMON_LAST_FLAG, answer.profileId);
}

/* --- a feature with more than one way to pay: one more line in the system's Consumption ------------ */

/** A forward activity that casts the item's own summon with its own spend (Familiar Friend's "(free casting)"): a way to pay. */
const forwardsTo = (item, a) => (a?.type === "forward") && takes(item?.system?.activities?.get?.(a.activity?.id));

/** The item's ways to pay for its summon, when there are more than one: its summon activities (Wild Companion: a slot or
 * Wild Shape) and a forward to the summon (Familiar Friend's "(free casting)": the spell's one use, no slot). */
const payWays = item => [...(item?.system?.activities ?? [])].filter(a => takes(a) || forwardsTo(item, a));

/** The way a use was switched to in its dialog, by the dialog's activity uuid: the other activity's id. */
const paidWith = new Map();

/** The pool an item-uses activity spends (Wild Companion's Wild Shape use): the item, its uses left, its name. */
function usesPoolOf(activity) {
  const target = activity?.consumption?.targets?.find?.(t => t.type === "itemUses") ?? null;
  if ( !target ) return null;
  const ref = String(target.target ?? "");
  // an empty target is the activity's own item (a forward spending the spell's uses)
  const item = (ref ? null : activity.item) ?? activity.actor?.items?.get(ref) ?? activity.actor?.items?.find(i => (i._stats?.compendiumSource === ref)
    || (i.getFlag?.("dnd5e", "sourceId") === ref)) ?? null;
  return item ? { item, left: Number(item.system?.uses?.value) || 0, name: item.name } : null;
}

// The use opens the first way's dialog (the activity picker is skipped). Its Consumption gains a line for each
// other way, built as a copy of the system's own line ("Consume Wild Shape use? (2 remaining)"); the lines are
// mutually exclusive. A ticked other way is taken at the consumption hook: the use is vetoed as every summon's
// is, and Place casts with that way instead (RULINGS *Summons*, call 39). Nothing is spent until placed.
listen("renderActivityUsageDialog", "summons", (app, element) => {
  try {
    const activity = app?.activity;
    if ( !takes(activity) || !element?.querySelector || element.querySelector("[data-bf-pay-way]") ) return;
    const others = payWays(activity.item).filter(w => w.id !== activity.id);
    if ( !others.length ) return;
    // ⚠ the system's tick is the one consume field with a `checked` (a dnd5e-checkbox, or an input on older sheets)
    const own = [...element.querySelectorAll('[name^="consume"]')].find(el => typeof el.checked === "boolean") ?? null;
    const ownRow = own?.closest(SURFACES.formGroup) ?? null;
    if ( !own || !ownRow ) return;
    // ⚠ the dialog redraws itself on every change (the line is rebuilt each time): the pick lives in `paidWith`,
    // cleared only on the dialog's first draw, and every redraw ticks the line it names
    if ( !app._bfPayDrawn ) {
      paidWith.delete(activity.uuid);
      app._bfPayDrawn = true;
      // a free cast with a use left is the default (Familiar Friend: "once without a spell slot"); a slot is the fallback
      const free = others.find(w => (w.type === "forward") && ((usesPoolOf(w)?.left ?? 0) >= 1));
      if ( free ) paidWith.set(activity.uuid, free.id);
    }
    const picked = paidWith.get(activity.uuid) ?? null;
    if ( picked ) own.checked = false;
    const boxes = [own];
    for ( const way of others ) {
      const pool = usesPoolOf(way);
      const row = ownRow.cloneNode(true);
      const box = [...row.querySelectorAll("input, dnd5e-checkbox")].find(el => typeof el.checked === "boolean") ?? null;
      if ( !box ) continue;
      box.removeAttribute("name");
      box.dataset.bfPayWay = way.id;
      box.checked = (picked === way.id);
      if ( pool && (pool.left < 1) ) box.disabled = true;
      const label = row.querySelector("label");
      const hint = row.querySelector(".hint");
      if ( way.type === "forward" ) {
        // the forward's own words ("(free casting)"): the spell's use, no slot
        if ( label ) label.textContent = `Cast for free — ${way.name || "the free cast"}?`;
        if ( hint ) hint.textContent = pool ? `Spend 1 ${pool.name} use (${pool.left} remaining), no spell slot.` : "No spell slot.";
      } else {
        if ( label ) label.textContent = `Consume ${pool ? `${pool.name} use` : (way.name || "the other way")}?`;
        if ( hint ) hint.textContent = pool ? `Spend 1 ${pool.name} use (${pool.left} remaining).` : "";
      }
      ownRow.after(row);
      boxes.push(box);
    }
    // one line ticked at a time; nothing ticked casts without a cost, as the system's own line allows (a re-tick here
    // would pin the slot once the free cast is spent — RULINGS *Summons* call 57)
    for ( const box of boxes ) box.addEventListener("change", () => {
      if ( !box.checked ) { if ( !boxes.some(b => b.checked) ) paidWith.delete(activity.uuid); return; }
      for ( const other of boxes ) if ( other !== box ) other.checked = false;
      if ( box.dataset.bfPayWay ) paidWith.set(activity.uuid, box.dataset.bfPayWay); else paidWith.delete(activity.uuid);
    });
  } catch(err) { log.warn(`Could not offer the other ways to pay.`, err); }
});

/* --- gone at the Long Rest (SUMMON_AS `longRest`) ---------------------------------------------------- */

// The resting client alone fires this hook; it asks the dismissal of every standing record of the rester's
// whose feature says it disappears when its caster finishes a Long Rest (Wild Companion).
listen("dnd5e.restCompleted", "summons", (actor, result, config) => {
  try {
    if ( !(actor instanceof Actor) || !actor.isOwner || ((result?.type ?? config?.type) !== "long") ) return;
    for ( const message of game.messages.contents ) {
      const flag = readFlag(message, SUMMON_FLAG);
      if ( !flag?.applied || flag.dismissAsked || flag.dismissed || (flag.sourceUuid !== actor.uuid) ) continue;
      if ( !asRowOf(flag.itemName)?.longRest ) continue;
      void askDismiss(message);
    }
  } catch(err) { log.warn(`Could not end the companion at the Long Rest — dismiss it by hand.`, err); }
});

/* --- the record on the cast card ------------------------------------------------------------------ */

/** A form row's label, art and lines, read off the creature it names (a compendium read, no permission). */
async function describeProfile(row, summon = null) {
  if ( !row.uuid ) return { ...row, label: row.name || `a creature of CR ${row.cr ?? "?"}${row.types.length ? ` (${row.types.join(", ")})` : ""}`, img: null, summary: null };
  return { ...row, ...(await describeCreature(row.uuid, { label: row.name || "", summon })) };
}

/** A SUMMON_ONE_FORM spell's profiles narrowed to its one form, named as the spell names it; others as they are. */
function oneForm(itemName, rows) {
  const row = oneFormOf(itemName);
  if ( !row ) return rows;
  const pick = rows.find(r => lower(r.label || r.name) === lower(row.from)) ?? rows[0];
  return pick ? [{ ...pick, label: row.name }] : rows;
}

/** The sizes the activity offers, smallest first (the system's own order). */
const sizesOf = activity => sizesInOrder([...(activity.creatureSizes ?? [])], Object.keys(CONFIG.DND5E?.actorSizes ?? {}));

/** What the record and the menu share, read off the activity at a level. */
async function castFacts(activity, level) {
  const actor = activity.actor;
  const tok = tokenDocOf(actor, { activity });
  return {
    sourceUuid: actor.uuid, sourceName: tok?.name ?? actor.name,
    itemUuid: activity.item.uuid, itemName: activity.item.name, activityUuid: activity.uuid,
    // the attack lines at the cast: dnd5e stamps the cast's level and the caster's modifier on the creature
    level, profiles: oneForm(activity.item.name, await Promise.all(profileRows(activity.profiles.map(p => p.toObject?.() ?? p), level)
      .map(r => describeProfile(r, { level: Number(level) || 0, mod: Number(activity.getRollData?.()?.mod) || 0 })))),
    choice: choiceRowKey(SUMMON_CHOICES, activity.item.name, listed()),
    sceneId: tok?.parent?.id ?? canvas.scene?.id ?? null,
    mode: activity.summon?.mode ?? null, creatureTypes: [...(activity.creatureTypes ?? [])],
    creatureSizes: sizesOf(activity), rangeFt: asRowOf(activity.item.name)?.rangeFt ?? companionOf(activity.item.name)?.rangeFt ?? rangeFeet(activity.range),
    guises: guisesOf(guiseRowOf(activity.item.name)),
    extras: await extrasOf(activity, level),
    // the form last taken through this item, marked on its row ("the familiar that disappeared or a different one")
    lastForm: readFlag(actor.items?.get(activity.item.id), SUMMON_LAST_FLAG) ?? null
  };
}

/**
 * The extra forms a cast offers (SUMMON_EXTRAS): for each row whose spell this is, the forms of the feature's
 * activity — the caster's feature for the spell, the item itself for the feature's own cast — described as rows.
 */
async function extrasOf(activity, level) {
  const actor = activity?.actor;
  const item = activity?.item;
  if ( !actor || !item ) return [];
  const out = [];
  for ( const [key, row] of Object.entries(SUMMON_EXTRAS) ) {
    if ( lower(rulesName(item.name)) !== lower(row.spell) ) continue;
    const feature = (lower(item.name) === lower(key)) ? item : featureNamed(actor, key);
    const source = feature ? activityNamed(feature, row.activity) : null;
    if ( !source ) continue;
    const rows = profileRows(source.profiles.map(p => p.toObject?.() ?? p), level).filter(r => r.uuid);
    // read at the cast, as the spell's own rows are: the cast's level and the caster's modifier in each attack line
    const summon = { level: Number(level) || 0, mod: Number(activity.getRollData?.()?.mod) || 0 };
    out.push({ key, tab: row.tab, rows: await Promise.all(rows.map(r => describeProfile(r, summon))) });
  }
  return out;
}

async function stampRecord(activity, message, answer) {
  const actor = activity.actor;
  const facts = await castFacts(activity, activity.relevantLevel);
  const record = summonRecord({ ...facts, concentrationId: concentrationIdOf(message) });
  // a companion standing: the new form takes its place (its square, or the pocket)
  const was = companionOf(activity.item.name) ? currentCompanion(summonRecords(), actor.uuid, rulesName(activity.item.name)) : null;
  if ( was && game.messages.get(was) ) record.replaces = replacesOf(game.messages.get(was));
  record.askedBy = game.user.id;   // the caster's own screen answers: a GM casting for a player's character included
  if ( lightRowOf(activity.item.name) ) record.light = activity.item.name;
  // the menu answered before the cast: the record is placed at birth (a profile gone at the cast level keeps it asked)
  const patch = answer ? placedAnswer(record, answer, SUMMON_CHOICES) : null;
  // the companion the empower question gave up (SUMMON_EMPOWERS "Summon a new one"): dismissed forever as this lands
  if ( answer?.dismisses && game.messages.get(answer.dismisses) ) record.dismisses = answer.dismisses;
  await message.setFlag(MODULE_ID, SUMMON_FLAG, { ...record, ...(patch ?? {}), ...statContext(actor.uuid) });
  const item = patch ? actor.items.get(activity.item.id) : null;
  if ( item && patch?.profileId && (record.profiles.length > 1) ) await item.setFlag(MODULE_ID, SUMMON_LAST_FLAG, patch.profileId);
}

listen("dnd5e.postUseActivity", "summons", (activity, usageConfig, results) => {
  try {
    if ( !takes(activity) || !activity.actor?.isOwner ) return;
    // the empower answer a use carries (`[MODULE_ID].empower`, the live suites' road) stands in for the menu's
    const forced = usageConfig?.[MODULE_ID]?.empower ?? null;
    const answer = planned.get(activity.uuid) ?? (forced ? { empower: foundry.utils.deepClone(forced) } : null);
    // Light or Continual Flame on a token: token-lights.js lands it; the spell's earlier object goes (one at a time).
    if ( answer?.lightOn === "token" ) { dismissSingles(activity.actor.uuid, activity.item.name, null); return; }
    const message = (results?.message instanceof ChatMessage) ? results.message : null;
    if ( !message ) return;
    // the familiar empowered (SUMMON_EMPOWERS): a transform record for transforms.js, no summon record
    if ( answer?.empower ) { void stampEmpower(activity, message, answer.empower).catch(err => log.error(`Could not stamp the empower on the card — transform the familiar by hand.`, err)); return; }
    void stampRecord(activity, message, answer).catch(err => log.error(`Could not stamp the summon on the card — place the creature by hand.`, err));
  } catch(err) {
    log.error(`The summon could not be recorded — place the creature by hand.`, err);
  }
});

/** Dismiss the caster's standing summons of a SUMMON_SINGLES spell, all but `keep` (a message id). */
function dismissSingles(sourceUuid, itemName, keep) {
  const ids = replacedSummons(summonRecords(), { id: keep ?? "", sourceUuid, itemName: rulesName(itemName) }, listedNames(summonSingleEntries()));
  for ( const id of ids ) {
    const earlier = game.messages.get(id);
    if ( earlier ) void askDismiss(earlier).catch(err => log.warn(`Could not dismiss the earlier summon — delete its token by hand.`, err));
  }
  return ids;
}

/* --- the one menu: the form, the choice, the pool, then the placement ------ ------------------- */

/** The caster's token document on the record's scene, for the preview's origin and elevation. */
function casterToken(flag) {
  const actor = resolveUuid(flag.sourceUuid);
  const scene = game.scenes.get(flag.sceneId) ?? canvas.scene;
  return actor?.token ?? tokenOnScene(flag.sourceUuid, scene) ?? tokenDocOf(actor);
}

/** The count a profile's formula makes at this cast (a roll when it is dice), on the caster's roll data. */
async function countOf(flag, profile) {
  const formula = String(profile.count || "1");
  if ( Number.isNumeric?.(formula) ) return Math.max(1, parseInt(formula, 10));
  try {
    const roll = await new Roll(formula, resolveUuid(flag.sourceUuid)?.getRollData?.() ?? {}).evaluate();
    return Math.max(1, parseInt(roll.total, 10) || 1);
  } catch { return 1; }
}

/**
 * The menu, described to the shared picker. `facts` the record's facts (or the record itself, off a card);
 * `light` the SUMMON_LIGHTS row. `onAnswer` gets the answer once the spaces are
 * picked (the light on a token picks none).
 */
async function askSummon(key, facts, { light = null } = {}, onAnswer) {
  const caster = resolveUuid(facts.sourceUuid);
  if ( !caster ) return;
  const types = facts.creatureTypes ?? [];
  const sizes = facts.creatureSizes ?? [];
  // a light's object asks no size: the row's own (`light.size`), whatever the spell allows (RULINGS *Summons*)
  const needs = formNeeds({ profiles: facts.profiles, choice: facts.choice, mode: facts.mode, creatureTypes: types, creatureSizes: light ? [] : sizes });
  const poolProfile = facts.profiles.find(p => poolPicks(p, facts.mode)) ?? null;
  // the table's own token art over the compendium's (the Summon Art window), on the rows and the ghost alike
  const tokenArt = (name, img) => artOf(facts.itemName, name).token ?? img ?? null;
  const pool = ((needs.pool && poolProfile) ? await poolFromPacks(poolRuleOf(poolProfile)) : []).map(r => ({ ...r, img: tokenArt(r.name, r.img) }));
  const choiceRow = needs.choice ? SUMMON_CHOICES[facts.choice] : null;
  // a light's object reads as the thing touched (a stone), in the table's art when it sets one
  const labelOf = p => light ? light.object.name : (p.label || p.name);
  const imgOf = p => light ? (tokenArt(p.label || p.name, null) ?? light.object.img) : tokenArt(p.label || p.name, p.img);
  const profileRow = (p, checked, tags = []) => ({ value: p.id, label: labelOf(p), img: imgOf(p), summary: light ? null : p.summary, checked, tags });
  // the form last taken pre-picked and tagged (Battle Familiar's "the familiar that disappeared or a different one")
  const marked = lastFormRows(facts.profiles, facts.lastForm ?? null);
  const targets = [...(game.user.targets ?? [])].filter(t => t.actor);
  const sections = [];
  if ( light ) sections.push({ head: "Where the light goes", field: "bf-light-on", pills: [
    // no token targeted: the token way is greyed out (target one, then cast again)
    { value: "token", label: targets.length ? `On ${targets.map(t => t.name).join(", ")}` : "On a token (target one first)", checked: targets.length > 0, locked: !targets.length },
    { value: "object", label: `On an object: ${light.object.name}`, checked: !targets.length }] });
  // a guise the caster picks (SUMMON_GUISES): one row per guise, the one creature in each guise's own art
  const guises = facts.guises ?? [];
  if ( guises.length && !needs.profile && !needs.pool ) {
    const base = facts.profiles[0];
    sections.push({ head: guiseRowOf(facts.itemName)?.ask ?? "The look", field: "bf-summon-guise", rows: guises.map((g, i) => ({
      value: g.guise, label: g.name, img: tokenArt(g.name, base?.img ?? null), summary: base?.summary ?? null, checked: i === 0 })) });
  }
  else if ( needs.profile ) sections.push({ head: "The form", field: "bf-summon-profile", rows: marked.map(p => profileRow(p, p.checked, p.tags)) });
  // a light's object stands only while the light goes on an object: with a token targeted it is unpicked and greyed
  else if ( (facts.profiles.length === 1) && !needs.pool && !guises.length ) sections.push({ field: "bf-summon-profile", rows: [profileRow(facts.profiles[0], true)],
    onlyWhen: light ? { field: "bf-light-on", value: "object" } : undefined });
  // the extra forms a feature adds (SUMMON_EXTRAS: Pact of the Chain's): a tab each beside the spell's own, one pick
  // across the tabs; the spell's type question below them answers for whichever form is picked
  const extras = (needs.pool ? (facts.extras ?? []) : []).map(x => ({ ...x, rows: x.rows.map(r => ({ uuid: r.uuid, name: r.label || r.name,
    img: tokenArt(r.label || r.name, r.img), summary: r.summary ?? null, extra: x.key })) }));
  const extraRows = extras.flatMap(x => x.rows);
  const typeSection = needs.type ? { head: "Its creature type", field: "bf-summon-type", pills: types.map(t => ({ value: t, label: CONFIG.DND5E?.creatureTypes?.[t]?.label ?? t })) } : null;
  if ( extras.length ) {
    sections.push({ tabs: [
      { label: rulesName(facts.itemName), sections: [{ field: "bf-summon-pick", pool }] },
      ...extras.map(x => ({ label: x.tab, sections: [{ field: "bf-summon-pick", rows: x.rows.map(r => ({ value: r.uuid, label: r.name, img: r.img, summary: r.summary })) }] }))
    ] });
  } else if ( needs.pool ) sections.push({ field: "bf-summon-pick", pool });
  if ( typeSection ) sections.push(typeSection);
  if ( needs.size ) sections.push({ head: "Its size", field: "bf-summon-size", pills: sizes.map(s => ({ value: s, label: CONFIG.DND5E?.actorSizes?.[s]?.label ?? s })) });
  // its name (COMPANIONS `names`): asked every time, pre-filled with the one the caster last gave it; blank, the
  // picked creature's own name shows in the field and is the one it lands with
  const naming = !light && !!companionOf(facts.itemName)?.names;
  if ( naming ) sections.push({ head: "Its name", text: { field: "bf-summon-name", value: petNameFor(caster, facts.itemName) ?? "",
    placeholder: "its own name", max: PET_NAME_MAX, follows: needs.pool ? "bf-summon-pick" : "bf-summon-profile" } });
  if ( choiceRow ) {
    sections.push({ head: choiceRow.ask, field: "bf-summon-choice", pills: choiceRow.options.map(o => ({ value: o, label: CONFIG.DND5E?.damageTypes?.[o]?.label ?? o })) });
    sections.push({ rule: choiceRow.rule });
  }
  const replacing = facts.replaces ?? null;
  if ( replacing ) sections.push({ note: (replacing.state === "pocket") ? "The new form waits in the pocket dimension, as the old one did." : "The new form takes the old one's place." });
  // what must be picked, in the order the popup reads (the creature, its type and size, the spell's own question)
  const asked = [
    needs.pool ? { field: "bf-summon-pick", why: "pick the creature first" } : null,
    needs.type ? { field: "bf-summon-type", why: "pick its creature type first" } : null,
    needs.size ? { field: "bf-summon-size", why: "pick its size first" } : null,
    choiceRow ? { field: "bf-summon-choice", why: `pick ${lower(choiceRow.ask)} first` } : null
  ].filter(Boolean);
  // the light's token way needs a token targeted (the pill is greyed without one; this is the belt)
  const validate = light ? picks => ((picks.one("bf-light-on") === "token") && !game.user.targets?.size) ? "target the token first, then press Light" : null : null;
  await openPicker({ id: key }, SUMMON_FLAG, caster, {
    title: `${facts.itemName} — ${facts.sourceName}`, icon: "fa-solid fa-spaghetti-monster-flying", width: 480, by: facts.askedBy ?? game.user.id,
    card: { eyebrow: light ? "Light" : "Summon", title: facts.itemName, subtitle: facts.level ? `level ${facts.level}` : "" },
    sections, needs: asked, validate,
    buttons: [
      { action: "place", label: light ? "Light" : "Place", default: true, checks: true, submit: picks => {
        const profile = facts.profiles.find(p => p.id === picks.one("bf-summon-profile")) ?? facts.profiles[0];
        const pickRow = pool.find(r => r.uuid === picks.one("bf-summon-pick")) ?? extraRows.find(r => r.uuid === picks.one("bf-summon-pick")) ?? null;
        const creatureType = picks.one("bf-summon-type");
        const creatureSize = picks.one("bf-summon-size");
        const lightOn = light ? (picks.one("bf-light-on") ?? "object") : null;
        // the name field as typed, read while the dialog stands (blank: the creature's own name)
        const petName = naming ? (picks.text("bf-summon-name") ?? "") : undefined;
        void (async () => {
          try {
            if ( lightOn === "token" ) { await onAnswer({ lightOn }); return; }
            const count = await countOf(facts, profile);
            const usePool = poolPicks(profile, facts.mode);
            const inPlace = (replacing?.state === "present") && replacing.placement;
            const intoPocket = replacing?.state === "pocket";
            // a guise follows the pointer in its own art and its house size (SUMMON_GUISES)
            const guise = guises.find(g => g.guise === picks.one("bf-summon-guise")) ?? null;
            const placements = inPlace ? [replacing.placement] : intoPocket ? [{ x: 0, y: 0, elevation: 0, rotation: 0 }] : await pickSpots({ originToken: casterToken(facts), actorUuid: usePool ? pickRow.uuid : profile.uuid, count,
              rangeFt: facts.rangeFt ?? null, label: usePool ? pickRow.name : (guise?.name ?? labelOf(profile)),
              img: usePool ? pickRow.img : guise ? tokenArt(guise.name, imgOf(profile)) : imgOf(profile),
              squares: guise ? squaresOf(guiseRowOf(facts.itemName)?.size) : null });
            if ( !placements.length ) return;   // cancelled on the map: nothing cast
            await onAnswer({ profileId: profile.id, pick: pickRow ? { uuid: pickRow.uuid, name: pickRow.name, img: pickRow.img } : null,
              choice: picks.one("bf-summon-choice"), guise: picks.one("bf-summon-guise"), placements, count, intoPocket, lightOn,
              sceneId: (inPlace ? replacing.placement.sceneId : null) ?? canvas.scene?.id ?? facts.sceneId ?? null,
              creatureSize: light ? (sizes.includes(light.size) ? light.size : (sizes[0] ?? null)) : needs.size ? creatureSize : (sizes[0] ?? null),
              creatureType: needs.type ? creatureType : (types[0] ?? null), petName });
          } catch(err) {
            log.error(`The summon could not be placed — place the creature by hand.`, err);
            ui.notifications?.error(`${TITLE}: the summon could not be placed (${err?.message ?? err}).`);
          }
        })();
      } },
      { action: "cancel", label: "Not now" }
    ]
  });
}

/** The card's own popup, for a record still `asked` (a cast from before the menu, or a profile the cast level dropped). */
async function showSummonPopup(message) {
  const flag = readFlag(message, SUMMON_FLAG);
  if ( flag?.status !== "asked" ) return;
  await askSummon(message.id, flag, { light: flag.light ? lightRowOf(flag.light) : null }, answer => answerPlacement(message, flag, answer));
}

async function answerPlacement(message, flag, answer) {
  const patch = placedAnswer(flag, answer, SUMMON_CHOICES);
  if ( !patch ) { ui.notifications?.warn(`${TITLE}: the summon's answer was not one the spell allows.`); return; }
  await queueFlagWrite(message, SUMMON_FLAG, current => {
    if ( current.status !== "asked" ) return false;
    Object.assign(current, patch);
  });
}

/* --- the elect lands it ---------------------------------------------------------------------------- */

/** The caster's token on a scene, or null. */
const casterTokenOn = (caster, scene) => scene?.tokens?.find(t => t.actor?.uuid === caster?.uuid || t.actorId === caster?.id) ?? null;

/**
 * A summoned token shown like the rest of the table: the caster's nameplate and bar visibility (always,
 * when the caster has no token here), and its Hit Points on the first bar.
 */
function tableLook(casterTok, data) {
  const ALWAYS = CONST.TOKEN_DISPLAY_MODES.ALWAYS;
  return {
    displayName: casterTok?.displayName ?? ALWAYS,
    displayBars: casterTok?.displayBars ?? ALWAYS,
    bar1: { ...(data.bar1 ?? {}), attribute: data.bar1?.attribute || "attributes.hp" }
  };
}

/** The concentration effect the cast opened on the caster, or null. */
const concentrationOf = (caster, flag) => flag.concentrationId ? (caster?.effects?.get(flag.concentrationId) ?? null) : null;

/** The item on the summoned creature a row narrows, and its update with the parts narrowed to the type. */
function narrowingUpdate(actor, row, type) {
  const item = row?.narrow ? [...(actor.items ?? [])].find(i => lower(i.name) === lower(row.narrow)) ?? null : null;
  if ( !item ) return null;
  const parts = narrowedActivities(item.toObject().system?.activities ?? {}, type);
  return parts ? { _id: item.id, ...parts } : null;
}

/**
 * SUMMON_COMMANDS: the creature's command feature split into one at-will spell per option, each carrying
 * that one activity as it landed (the caster's DC, the cast level's dice), so the owner casts it from the
 * sheet with no activity picker. The feature goes.
 */
async function splitCommands(actor, row, spell) {
  const item = actor?.items?.find(i => lower(i.name) === lower(row.item)) ?? null;
  if ( !item ) return;
  const source = item.toObject();
  const spells = Object.values(source.system?.activities ?? {}).map(a => ({
    name: a.name || item.name, type: "spell", img: a.img || spell?.img || item.img,
    system: {
      description: { value: source.system?.description?.value ?? "" },
      level: Number(spell?.system?.level) || 0, school: spell?.system?.school ?? "", method: "atwill", prepared: 0,
      activation: { ...(a.activation ?? {}) }, range: { ...(a.range ?? {}) }, target: foundry.utils.deepClone(a.target ?? {}),
      properties: [], activities: { [a._id]: { ...a, consumption: { ...(a.consumption ?? {}), spellSlot: false } } }
    },
    flags: { [MODULE_ID]: { commandOf: spell?.name ?? null } }
  }));
  if ( !spells.length ) return;
  await actor.createEmbeddedDocuments("Item", spells);
  await actor.deleteEmbeddedDocuments("Item", [item.id]);
}

async function landSummon(message) {
  const claim = await claimLanding(message, SUMMON_FLAG, current => current.status === "placed");
  if ( !claim ) return;
  const flag = readFlag(message, SUMMON_FLAG);
  // a landing whose claimant left part-way: what it made goes first, so this one lands the summon once
  if ( claim.over ) await sweepDeadLanding(message, flag);
  const landed = [];
  let outcome = "landed";
  let failure = null;
  let resistance = null;
  let boonLanded = null;
  let replaced = [];
  let companion = null;
  let standing = null;
  const events = [];
  try {
    const caster = resolveUuid(flag.sourceUuid);
    const activity = cardActivity(message, flag.activityUuid);
    if ( !(caster instanceof Actor) || !activity ) throw new Error("the cast's activity could not be read off the card");
    const profile = activity.profiles.find(p => p._id === flag.profileId);
    if ( !profile ) throw new Error(`no profile ${flag.profileId} on ${activity.item?.name}`);
    const scene = game.scenes.get(flag.sceneId) ?? canvas.scene;
    if ( !scene ) throw new Error("the scene the creature was placed on is gone");
    const fetchOptions = { folderId: caster.folder?.id ?? null, origin: { key: "flags.dnd5e.summon.origin", value: activity.item.uuid } };
    const actor = await dnd5e.documents.Actor5e.fetchExisting(flag.summonUuid, fetchOptions);
    const options = { profile: profile._id, creatureSize: flag.creatureSize ?? undefined, creatureType: flag.creatureType ?? undefined };
    const row = flag.choice ? SUMMON_CHOICES[flag.choice] : null;
    const concentration = concentrationOf(caster, flag);
    const tokensData = [];
    const creatureName = flag.summonName || actor.name;
    // the table's own art (the Summon Art window), read now: a creature landed earlier keeps what it had
    const art = artChanges(artOf(flag.itemName, creatureName));
    // a light's object (SUMMON_LIGHTS): the thing touched, named and drawn so, carrying the spell's light
    const lightRow = flag.light ? lightRowOf(flag.light) : null;
    const look = lookOf(creatureName);
    const boon = boonOf(caster, flag.itemName);
    // the name its owner gave it in the menu (COMPANIONS `names`), or null for its own
    const petName = companionOf(flag.itemName)?.names ? petNameOf(flag.petName) : null;
    // a creature sees through its token, so its owner sees what it sees; a light's object does not; a sensor its row names does
    const sees = seesOf(actor, flag, { thing: !!lightRow, look });
    for ( const placement of flag.placements ?? [] ) {
      // dnd5e's own changes for the profile, per token (a formula may be dice).
      const changes = await activity.getChanges(actor, profile, options);
      // a boon on the caster (SUMMON_BOONS, Fortified Familiar): the feature's own change, landed as the system's bonus would be —
      // unless the system already carries it (the feat's enchantment reached the spell through its grant, RULINGS *Summons*
      // call 58): then the system's own number is the record's and nothing is added on top
      if ( boon ) {
        const bySystem = systemHpBonusOf(changes, actor.system?.attributes?.hp?.max);
        boonLanded = bySystem ? { feature: boon.key, benefit: boon.row.benefit, hp: bySystem, bySystem: true } : await landBoon(changes, actor, caster, boon);
      }
      if ( lightRow ) {
        // the row's size whatever the activity's sizes (Continual Flame's offers none): half a square for a Tiny
        // object (the light's stones), else one 5-ft square
        const squares = (lightRow.size === "tiny") ? 0.5 : 1;
        foundry.utils.mergeObject(changes.tokenUpdates, { name: lightRow.object.name, light: tokenLight(lightRow), width: squares, height: squares,
          texture: { src: lightRow.object.img }, ring: { enabled: false } });
        changes.actorUpdates.name = lightRow.object.name;
        changes.actorUpdates.img = lightRow.object.img;
      }
      const single = oneFormOf(flag.itemName);
      if ( single ) {
        changes.tokenUpdates.name = single.name;
        changes.actorUpdates.name = single.name;
      }
      // a guise (SUMMON_GUISES) lands named for it ("Spiritual Mace"); its art is that name's, read above
      if ( flag.guise && flag.summonName ) {
        changes.tokenUpdates.name = flag.summonName;
        changes.actorUpdates.name = flag.summonName;
        // its house size: the creature's and the token's footprint (dnd5e syncs a token to its creature's size)
        const size = guiseRowOf(flag.itemName)?.size ?? null;
        const squares = squaresOf(size);
        if ( squares ) {
          foundry.utils.setProperty(changes.actorUpdates, "system.traits.size", size);
          Object.assign(changes.tokenUpdates, { width: squares, height: squares });
        }
      }
      // a creature turns to face where it moves (a pack ships many with the rotation locked); a thing (a light's
      // stone, the Floating Disk) keeps its facing
      if ( !lightRow && !Number.isFinite(Number(look?.scale)) ) changes.tokenUpdates.lockRotation = false;
      if ( look?.light ) foundry.utils.mergeObject(changes.tokenUpdates, { light: tokenLight(look.light) });
      if ( Number.isFinite(look?.alpha) ) changes.tokenUpdates.alpha = look.alpha;
      // `seen`: the creature's Invisible condition switched off on this token (its delta), the base actor untouched
      if ( look?.seen ) {
        changes.actorUpdates.effects ??= [];
        for ( const e of actor.effects.filter(x => x.statuses?.has?.("invisible") && !x.disabled) ) {
          const have = changes.actorUpdates.effects.find(x => x._id === e.id);
          if ( have ) have.disabled = true;
          else changes.actorUpdates.effects.push({ ...e.toObject(), disabled: true });
        }
      }
      foundry.utils.mergeObject(changes.tokenUpdates, art.tokenUpdates);
      Object.assign(changes.actorUpdates, art.actorUpdates);
      // a thing smaller than its square draws so (SUMMON_LOOKS `scale`, a light's object)
      const scale = Number(lightRow?.object?.scale ?? look?.scale);
      if ( Number.isFinite(scale) && (scale > 0) ) foundry.utils.mergeObject(changes.tokenUpdates, { texture: { scaleX: scale, scaleY: scale } });
      // a Summon spell's form is named form-then-type ("Tricksy Fey", "Putrid Undead"; the dragon by its picked type)
      const formed = formName(flag.itemName, creatureName, flag.picked ? (CONFIG.DND5E?.damageTypes?.[flag.picked]?.label ?? flag.picked) : null);
      if ( formed ) { changes.tokenUpdates.name = formed; changes.actorUpdates.name = formed; }
      // the familiar's own name on its token and its creature (an unlinked token's delta: the world actor keeps the book's)
      if ( petName ) { changes.tokenUpdates.name = petName; changes.actorUpdates.name = petName; }
      // sight on (the packs ship it off); its range, vision mode and detection modes stay dnd5e's, read off the senses
      if ( sees ) foundry.utils.setProperty(changes.tokenUpdates, "sight.enabled", true);
      // a companion lands with the Help action on its sheet (help.js; RULINGS *The Help action*): the creature's own
      // button, on the token's delta — the book's creature keeps its sheet
      if ( companionOf(flag.itemName) && !actor.items.some(i => lower(i.name) === lower(HELP_NAME)) ) {
        changes.actorUpdates.items.push(helpItemData({ description: await ruleHTML(HELP_RULE) }));
      }
      const narrowed = (row && flag.picked) ? narrowingUpdate(actor, row, flag.picked) : null;
      if ( narrowed ) {
        // ⚠ A token delta's item entry is merged as nested data; a dotted key would be stored as a literal key.
        const nested = foundry.utils.expandObject(narrowed);
        const have = changes.actorUpdates.items.find(i => i._id === narrowed._id);
        if ( have ) foundry.utils.mergeObject(have, nested); else changes.actorUpdates.items.push(nested);
      }
      const data = await activity.getTokenData({ actor, placement: { ...placement }, tokenUpdates: changes.tokenUpdates, actorUpdates: changes.actorUpdates });
      // shown like the table: the caster's nameplate and bar visibility, the HP bar
      Object.assign(data, tableLook(casterTokenOn(caster, scene), data));
      // on the caster's side (every summon's text: "an ally to you and your allies"): a pack ships SECRET, which no
      // emanation or targeting reads; a light's object keeps the pack's own
      const casterSide = casterTokenOn(caster, scene)?.disposition;
      if ( !lightRow && Number.isFinite(casterSide) && (casterSide !== CONST.TOKEN_DISPOSITIONS.SECRET) ) data.disposition = casterSide;
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.${SUMMON_CARD_FLAG}`, message.id);
      tokensData.push(data);
    }
    // a new form for a companion waiting in the pocket waits there too: the token is kept, not drawn
    const created = flag.intoPocket ? [] : await scene.createEmbeddedDocuments("Token", tokensData, { dnd5e: { autoRollNPCHP: "no" } });
    for ( const t of created ) landed.push({ tokenId: t.id, sceneId: scene.id, tokenUuid: t.uuid, actorUuid: t.actor?.uuid ?? null, name: t.name });
    const commands = Object.entries(SUMMON_COMMANDS).find(([k]) => lower(k) === lower(flag.itemName))?.[1] ?? null;
    if ( commands ) for ( const t of created ) await splitCommands(t.actor, commands, activity.item);
    Hooks.callAll("dnd5e.postSummon", activity, profile, created, options);
    // The caster's players own what they summoned.
    const grant = ownershipGrant(caster.ownership ?? {}, actor.ownership ?? {});
    if ( grant ) await actor.update({ ownership: { ...(actor._source?.ownership ?? {}), ...grant } });
    // The seat, two ways (SUMMON_OWN_INITIATIVE): right after the caster on the caster's Initiative, or,
    // for a row there (the familiar), it joins and rolls its own.
    const combat = activeCombatFor(caster);
    if ( combat ) {
      const own = listedNames(summonOwnInitiativeEntries()).has(lower(rulesName(flag.itemName)));
      const initiative = own ? null : seatInitiative(combat.getCombatantsByActor(caster)[0]?.initiative ?? null);
      const seated = await combat.createEmbeddedDocuments("Combatant", created.map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId, initiative })));
      if ( own && seated.length ) await combat.rollInitiative(seated.map(c => c.id));
    }
    // The shared resistance on the caster, for the spell's life.
    if ( row?.resist && flag.picked ) {
      const label = CONFIG.DND5E?.damageTypes?.[flag.picked]?.label ?? flag.picked;
      const data = resistanceEffectData({ type: flag.picked, name: `${row.resist} (${label})`, img: activity.item.img, origin: activity.item.uuid, description: row.says ?? "" });
      data.duration = concentration ? { ...(concentration._source?.duration ?? {}) } : (activity.duration?.getEffectData?.() ?? {});
      if ( concentration ) foundry.utils.setProperty(data, "flags.dnd5e.dependentOn", concentration.uuid);
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.${SUMMON_CARD_FLAG}`, message.id);
      const [effect] = await caster.createEmbeddedDocuments("ActiveEffect", [data]);
      if ( effect ) resistance = { uuid: caster.uuid, name: caster.name, img: caster.img ?? null, effectId: effect.id, effectName: effect.name, effectImg: effect.img ?? null, description: data.description };
    }
    // A companion: the effect on its owner for as long as it stands, and its stat block (what it carries is the rest).
    const crow = companionOf(flag.itemName);
    if ( crow ) {
      const name = petName || flag.summonName || actor.name;
      const type = flag.creatureType ? (CONFIG.DND5E?.creatureTypes?.[flag.creatureType]?.label ?? flag.creatureType) : null;
      const pocket = !!flag.intoPocket;
      const snapshot = pocket ? foundry.utils.deepClone(tokensData[0] ?? null) : null;
      if ( snapshot ) delete snapshot._id;
      await endCompanionEffects(caster, message.id);   // a landing makes exactly one
      await endStaleCompanionEffects(caster);          // and leaves no orphan beside it (a card gone, a record gone, a stray copy)
      const [effect] = await caster.createEmbeddedDocuments("ActiveEffect", [{
        name: companionEffectName({ noun: crow.noun, name, type, pocket }), img: tokensData[0]?.texture?.src ?? actor.img,
        type: "base", transfer: false, disabled: false, origin: activity.item.uuid, description: crow.says ?? "",
        flags: { [MODULE_ID]: { companion: message.id } }
      }]);
      companion = { noun: crow.noun, name, type, state: pocket ? "pocket" : "present", effectId: effect?.id ?? null,
        baseItems: actor.items.contents.map(i => i.id), snapshot, events: [] };
      // its arrival floats over its owner (the landing's own moment plays the FX, so it is not a companion beat)
      if ( !pocket && created.length ) events.push(ownerEvent("appear", created[0], caster, companionEffectName({ noun: crow.noun, name, type })));
      // the name the menu answered, kept on the caster for the next summon's field; a failure to keep it never fails the landing
      if ( crow.names && Object.hasOwn(flag, "petName") ) await rememberPetName(caster, flag.itemName, petName)
        .catch(err => log.warn(`Could not remember the ${lower(crow.noun)}'s name — it lands named all the same.`, err));
    }
    // Without Concentration, the summon stands on an effect of its caster's: removing it dismisses the summon
    // (the user). A Concentration summon needs none: Concentration's end dismisses it.
    else if ( !concentration && created.length ) {
      const name = summonEffectName({ itemName: flag.itemName, creatureName: lightRow ? lightRow.object.name : creatureName });
      const [effect] = await caster.createEmbeddedDocuments("ActiveEffect", [{
        name, img: activity.item.img ?? tokensData[0]?.texture?.src ?? actor.img,
        type: "base", transfer: false, disabled: false, origin: activity.item.uuid,
        description: `<p>${esc(flag.itemName)} stands while this effect does: remove it to dismiss ${created.length > 1 ? "them" : "it"}.</p>`,
        duration: activity.duration?.getEffectData?.() ?? {},
        flags: { [MODULE_ID]: { summonEffect: message.id } }
      }]);
      if ( effect ) {
        standing = { effectId: effect.id, name };
        // a summon that leaves its gear behind (SUMMON_FALLS `drops`): what it landed with is its stat block's
        if ( fallRowOf(flag.itemName)?.drops ) standing.baseItems = actor.items.contents.map(i => i.id);
        events.push(ownerEvent("appear", created[0], caster, name));
      }
    }
    // One at a time (SUMMON_SINGLES): the caster's earlier familiar goes as the new one lands.
    replaced = replacedSummons(summonRecords(), { id: message.id, sourceUuid: flag.sourceUuid, itemName: rulesName(flag.itemName) },
      listedNames(summonSingleEntries()));
    // the companion given up for this one (the empower question's "Summon a new one"): dismissed forever now
    if ( flag.dismisses && game.messages.get(flag.dismisses) && !replaced.includes(flag.dismisses) ) replaced = [...replaced, flag.dismisses];
  } catch(err) {
    log.error(`The summon could not be landed — place the creature by hand.`, err);
    outcome = "failed";
    failure = String(err?.message ?? err);
  } finally {
    await queueFlagWrite(message, SUMMON_FLAG, current => {
      current.applied = true; current.applying = false; current.outcome = outcome;
      current.landed = landed;
      if ( failure ) current.failure = failure;
      if ( resistance ) current.resistance = { effectId: resistance.effectId, effectName: resistance.effectName };
      if ( boonLanded ) current.boon = boonLanded;
      if ( replaced.length ) current.replaced = replaced.length;
      if ( companion ) current.companion = companion;
      if ( standing ) current.standing = standing;
      if ( events.length ) current.events = [...(current.events ?? []), ...events];
    });
    for ( const id of replaced ) {
      const earlier = game.messages.get(id);
      if ( earlier ) void askDismiss(earlier).catch(err => log.warn(`Could not dismiss the earlier summon — delete its token by hand.`, err));
    }
    if ( resistance ) await queueFlagWrite(message, "effectReceipt", current => {
      joinEffectReceipt(current, { uuid: resistance.uuid, name: resistance.name, img: resistance.img,
        effects: [effectRecord({ id: resistance.effectId, name: resistance.effectName, img: resistance.effectImg, description: resistance.description }, statContext(flag.sourceUuid ?? null))] });
    });
  }
}

/** The card a landed token or the caster's shared resistance came from: a dead landing's leavings are found by it. */
const SUMMON_CARD_FLAG = "summonCard";

/**
 * What a landing whose claimant left part-way made before it went (core.js `claimLanding`): the tokens and the
 * caster's effects stamped with this card, its standing and companion effects, and the seats of those tokens —
 * removed, so the landing that follows makes each once.
 */
async function sweepDeadLanding(message, flag) {
  for ( const scene of game.scenes ) {
    const ids = scene.tokens.filter(t => readFlag(t, SUMMON_CARD_FLAG) === message.id).map(t => t.id);
    if ( !ids.length ) continue;
    for ( const combat of game.combats ) {
      const seats = combat.combatants.filter(c => (c.sceneId === scene.id) && ids.includes(c.tokenId)).map(c => c.id);
      if ( seats.length ) await combat.deleteEmbeddedDocuments("Combatant", seats);
    }
    await scene.deleteEmbeddedDocuments("Token", ids, { [MODULE_ID]: { companionEnd: true } });
  }
  const caster = resolveUuid(flag.sourceUuid);
  const mine = e => [readFlag(e, SUMMON_CARD_FLAG), readFlag(e, "summonEffect"), readFlag(e, "companion")].includes(message.id);
  const effects = (caster?.effects?.contents ?? []).filter(mine).map(e => e.id);
  if ( effects.length ) await caster.deleteEmbeddedDocuments("ActiveEffect", effects, { [MODULE_ID]: { summonEnd: true, companionEnd: true } });
}

/**
 * The elect keeps the name a companion landed with on its caster (decide/summons.js `rememberName`): one per spell,
 * the next summon's name field pre-filled with it; a field left blank forgets it.
 */
async function rememberPetName(caster, itemName, name) {
  await queueFlagWrite(caster, SUMMON_PET_NAME_FLAG, current => {
    const next = rememberName(current.names ?? [], rulesName(itemName), name);
    if ( !next ) return false;
    current.names = next;
  }, { initial: { names: [] } });
}

/** The SUMMON_BOONS row the caster holds for this spell, with the formula read off the feature's own enchantment change; null for none. */
function boonOf(caster, itemName) {
  for ( const [key, row] of Object.entries(SUMMON_BOONS) ) {
    if ( lower(row.spell) !== lower(rulesName(itemName)) ) continue;
    const feature = featureNamed(caster, key);
    if ( !feature ) continue;
    const formula = boonFormula([...(feature.effects ?? [])].map(e => ({ disabled: !!e.disabled, changes: (e.changes ?? []).map(c => ({ key: c.key, value: c.value })) })), row.change);
    if ( formula ) return { key, row, formula, img: feature.img ?? null };
  }
  return null;
}

/** Land a boon's Hit Points on the creature's changes, dnd5e's own three ways (decide/summons.js `boonHpPlan`); the record's line. */
async function landBoon(changes, actor, caster, boon) {
  const roll = await new Roll(boon.formula, caster.getRollData?.() ?? {}).evaluate();
  const total = Math.floor(Number(roll.total) || 0);
  const hp = actor.system?.attributes?.hp ?? {};
  // on top of what the profile's own bonus already set, for the day the pack's bonus works
  const base = { max: Number(changes.actorUpdates?.["system.attributes.hp.max"] ?? hp.max) || 0, value: Number(changes.actorUpdates?.["system.attributes.hp.value"] ?? hp.value) || 0 };
  const plan = boonHpPlan({ total, hasClasses: !foundry.utils.isEmpty(actor.classes), hardMax: !!actor._source?.system?.attributes?.hp?.max, linked: !!actor.prototypeToken?.actorLink, hp: base });
  if ( plan.effect ) {
    changes.actorUpdates.effects ??= [];
    changes.actorUpdates.effects.push((new ActiveEffect.implementation({ name: boon.row.benefit, img: boon.img ?? undefined, disabled: false,
      changes: [{ key: plan.effect.key, type: "add", value: total }] })).toObject());
  }
  Object.assign(changes.actorUpdates, plan.updates);
  return { feature: boon.key, benefit: boon.row.benefit, hp: total };
}

/** Dismiss: the elect deletes what it made; concentration's dependents go with the effect, the rest by hand here. */
async function dismissSummon(message) {
  let claimed = false;
  await queueFlagWrite(message, SUMMON_FLAG, current => {
    if ( !current.applied || !current.dismissAsked || current.dismissed || current.dismissing ) return false;
    current.dismissing = true;
    claimed = true;
  });
  if ( !claimed ) return;
  const flag = readFlag(message, SUMMON_FLAG);
  try {
    const caster = resolveUuid(flag.sourceUuid);
    const doc = flag.companion ? liveToken(flag) : null;
    if ( doc ) {
      await dropCarried(doc, flag.companion.baseItems);
      await queueFlagWrite(message, SUMMON_FLAG, current => { current.companion.events = [...(current.companion.events ?? []), companionEvent("leave", doc, flag.companion, caster)]; });
      await pause(LEAVE_MS);
    } else if ( flag.standing ) {
      const at = liveToken(flag);
      // what it carried stays where it stood (SUMMON_FALLS `drops`), however it goes
      if ( at && flag.standing.baseItems ) await dropCarried(at, flag.standing.baseItems);
      if ( at ) await queueFlagWrite(message, SUMMON_FLAG, current => { current.events = [...(current.events ?? []), ownerEvent("leave", at, caster, flag.standing.name)]; });
    }
    const byScene = new Map();
    for ( const l of flag.landed ?? [] ) byScene.set(l.sceneId, [...(byScene.get(l.sceneId) ?? []), l.tokenId]);
    for ( const [sceneId, ids] of byScene ) {
      const scene = game.scenes.get(sceneId);
      const live = ids.filter(id => scene?.tokens.get(id));
      if ( live.length ) await scene.deleteEmbeddedDocuments("Token", live, { [MODULE_ID]: { companionEnd: true } });
    }
    // a companion dismissed while empowered (SUMMON_EMPOWERS): the spell ends with it — its record stamped, the caster's
    // effect removed after the token (no form is left to revert)
    if ( flag.companion?.empower ) await endEmpower(caster, flag.companion.empower, { why: `the ${lower(flag.companion.noun ?? "companion")} disappeared`, word: "gone" });
    const effect = flag.resistance?.effectId ? caster?.effects?.get(flag.resistance.effectId) : null;
    if ( effect ) await effect.delete();
    if ( flag.companion ) await endCompanionEffects(caster, message.id);
    const held = flag.standing?.effectId ? caster?.effects?.get(flag.standing.effectId) : null;
    if ( held ) await held.delete({ [MODULE_ID]: { summonEnd: true } });
  } catch(err) {
    log.error(`The summon could not be dismissed — delete the token by hand.`, err);
  } finally {
    await queueFlagWrite(message, SUMMON_FLAG, current => {
      current.dismissed = true; current.dismissing = false; current.dismissedAt = Date.now();
      if ( current.companion ) { current.companion.state = "gone"; current.companion.snapshot = null; }
    });
  }
}

registerResumable(SUMMON_FLAG, {
  pending: flag => (flag?.status === "placed") && ((!flag.applied && !claimHolds(flag.applying)) || (flag.applied && flag.dismissAsked && !flag.dismissed && !flag.dismissing)
    || (flag.applied && !flag.dismissAsked && !!flag.companion?.ask && !flag.companion.acting)),
  drives: () => isActiveGM(),
  drive: async message => {
    const flag = readFlag(message, SUMMON_FLAG);
    if ( !flag?.applied ) await landSummon(message);
    else if ( flag.dismissAsked ) await dismissSummon(message);
    else await actCompanion(message);
  }
});

/** The caster (on their own card) or a GM asks for the dismissal; the elect executes it. */
async function askDismiss(message) {
  await queueFlagWrite(message, SUMMON_FLAG, current => {
    if ( !current.applied || current.dismissAsked ) return false;
    current.dismissAsked = true;
  });
}

// Concentration's end ends the summon. ⚠ dnd5e tracks dependents on effects, activities, items and actors,
// never on a token, and its summon activity ties nothing to the concentration effect: the elect asks the
// dismissal of every landed record that names the effect (the resistance cascades on its own).
listen("deleteActiveEffect", "summons", effect => {
  try {
    if ( !isActiveGM() || !(effect?.parent instanceof Actor) || !effect.statuses?.has?.("concentrating") ) return;
    const casterUuid = effect.parent.uuid;
    for ( const message of game.messages.contents ) {
      const f = readFlag(message, SUMMON_FLAG);
      if ( !f?.applied || f.dismissAsked || (f.concentrationId !== effect.id) || (f.sourceUuid !== casterUuid) ) continue;
      void askDismiss(message).catch(err => log.warn(`Could not dismiss the summon with its concentration — delete the token by hand.`, err));
    }
  } catch(err) { log.warn(`Could not end the summon with its concentration — delete the token by hand.`, err); }
});

// The standing effect of a summon without Concentration, removed (by its owner or a GM, or its clock),
// dismisses the summon; the elect asks it. The elect's own removal, a dismissal, carries `summonEnd`.
listen("deleteActiveEffect", "summons", (effect, options) => {
  try {
    const id = readFlag(effect, "summonEffect");
    if ( !id || !isActiveGM() || options?.[MODULE_ID]?.summonEnd ) return;
    const message = game.messages.get(id);
    const f = message ? readFlag(message, SUMMON_FLAG) : null;
    if ( !f?.applied || f.dismissAsked || (f.standing?.effectId !== effect.id) ) return;
    void askDismiss(message).catch(err => log.warn(`Could not dismiss the summon with its effect — delete the token by hand.`, err));
  } catch(err) { log.warn(`Could not end the summon with its effect — delete the token by hand.`, err); }
});

/* --- companions: a summon that stays (COMPANIONS, RULINGS *Summons*) ---------------------------- */

/** The COMPANIONS row a spell answers to, by name, or null. */
const companionOf = name => Object.entries(COMPANIONS).find(([k]) => lower(k) === lower(rulesName(name) ?? ""))?.[1] ?? null;

/** Every card's summon record, by message id, each under the name the tables know it by (a Wild Companion's is Find Familiar's). */
const summonRecords = () => game.messages.contents.map(m => {
  const flag = readFlag(m, SUMMON_FLAG);
  return { id: m.id, flag: flag ? { ...flag, itemName: rulesName(flag.itemName) } : flag };
});

/** The live token a record landed, or null (in the pocket, dismissed, deleted by hand). */
function liveToken(flag) {
  for ( const l of flag?.landed ?? [] ) {
    const doc = game.scenes.get(l.sceneId)?.tokens?.get(l.tokenId);
    if ( doc ) return doc;
  }
  return null;
}

/** A token document's centre on its scene. */
const centreOfDoc = doc => doc.getCenterPoint?.() ?? { x: doc.x + (doc.width * doc.parent.grid.sizeX / 2), y: doc.y + (doc.height * doc.parent.grid.sizeY / 2) };

/** What a new cast replaces: the standing companion's message, where it is, and its square on the table. */
function replacesOf(message) {
  const flag = readFlag(message, SUMMON_FLAG);
  const doc = liveToken(flag);
  return { id: message.id, state: flag?.companion?.state ?? "present",
    placement: doc ? { x: doc.x, y: doc.y, elevation: doc.elevation ?? 0, rotation: doc.rotation ?? 0, level: doc.level ?? null, sceneId: doc.parent.id } : null };
}

/** The activity uuids whose next use is the cast menu's "Summon": the cast goes on, once. */
const castThrough = new Set();

/** The no-GM refusal: a companion is made and unmade by the GM's client. */
const needsGM = row => {
  if ( game.users.activeGM ) return false;
  ui.notifications?.error(`${TITLE}: you can't summon or dismiss a ${lower(row.noun)} without a GM online.`);
  return true;
};

/** A player's ask of the standing companion, written on its card for the elect. */
async function askCompanion(message, ask) {
  await queueFlagWrite(message, SUMMON_FLAG, current => {
    const patch = companionAsk(current.companion, ask);
    if ( !patch ) return false;
    Object.assign(current.companion, patch);
  });
}

/** The menu's buttons, long and stacked, each named for what it does and where; the hint its tooltip (#16). */
const MENU = {
  away: { label: "Dismiss: Pocket Dimension", hint: "a Magic action puts it away; it comes back as it left" },
  recall: { label: "Summon: Pocket Dimension", hint: "a Magic action calls it back to an unoccupied space within reach" },
  dismiss: { label: "Dismiss: Forever", hint: "it leaves for good; the spell cast again summons a new one" },
  summon: { label: "Summon: New Form", hint: "cast the spell again: a new form takes its place" }
};

/** The cast menu: the companion as it stands, and what can be done with it (the choices by its state).
 * `cause` the use's cause (a forward's free cast), which Summon's new cast carries again. */
async function showCompanionMenu(message, activity, cause = null) {
  const flag = readFlag(message, SUMMON_FLAG);
  const row = companionOf(flag?.itemName);
  const caster = resolveUuid(flag?.sourceUuid);
  if ( !flag?.companion || !row || !caster ) return;
  const state = flag.companion.state;
  const creature = await describeCreature(flag.summonUuid, { label: flag.companion.name || flag.summonName });
  // the art it wears, on the table or in the pocket, over the compendium's
  creature.img = liveToken(flag)?.texture?.src ?? flag.companion.snapshot?.texture?.src ?? creature.img;
  const where = (state === "pocket") ? "in its pocket dimension" : "on the table";
  const act = {
    away: () => askCompanion(message, { kind: "away" }),
    recall: async () => {
      const origin = tokensOf(caster, { all: true, documents: true })[0] ?? null;
      const [placement] = await pickSpots({ originToken: origin, actorUuid: flag.summonUuid, count: 1, rangeFt: row.recallFt ?? null,
        label: flag.companion.name || flag.summonName, seen: false, img: flag.companion.snapshot?.texture?.src ?? null });
      // the caster's floor when it stands here, else the floor being viewed
      if ( placement ) await askCompanion(message, { kind: "recall", placement: { ...placement, level: placement.level ?? canvas.level?.id ?? null, sceneId: canvas.scene?.id ?? null } });
    },
    dismiss: () => askDismiss(message),
    summon: () => { castThrough.add(activity.uuid); return activity.use(cause ? { cause } : {}); }
  };
  await openPicker(message, "companionMenu", caster, {
    title: `${flag.itemName} — ${flag.sourceName}`, icon: "fa-solid fa-spaghetti-monster-flying", width: 440, by: game.user.id,
    card: { eyebrow: row.noun, title: creature.label, subtitle: [flag.companion.type, where].filter(Boolean).join(" · ") },
    sections: [{ rows: [{ value: flag.summonUuid, ...creature }] }, { note: flag.companion.empower ? `${row.brief ?? ""} Empowered, it stays on the table until the spell ends.`.trim() : (row.brief ?? "") }],
    stack: true,
    buttons: [
      // every choice shown, the one its state refuses greyed; the first live one is the default
      ...companionMenu(state, row, { empowered: !!flag.companion.empower }).map(({ kind, on }, i, all) => ({
        action: kind, label: MENU[kind].label, disabled: !on, tooltip: MENU[kind].hint, default: all.findIndex(b => b.on) === i,
        submit: () => { if ( !needsGM(row) ) void Promise.resolve(act[kind]()).catch(err => log.error(`The ${lower(row.noun)} could not ${kind}.`, err)); } })),
      { action: "cancel", label: "Do nothing." }
    ]
  });
}

/**
 * What it carried goes as it leaves the table (into the pocket, dismissed, at 0 HP): a Loot Shelf chest
 * where it stood when Loot Shelf is active (`createLootContainer`, ephemeral: gone once emptied), else
 * lost (RULINGS *Summons*). Loot Shelf is detected, never required.
 */
async function dropCarried(doc, baseItems) {
  const actor = doc?.actor;
  if ( !actor ) return [];
  const ids = carriedItemIds(actor.items.contents.map(i => ({ id: i.id, type: i.type })), baseItems ?? []);
  if ( !ids.length ) return [];
  const shelf = game.modules.get("fvtt-mod-lootshelf");
  if ( shelf?.active && shelf.api?.createLootContainer ) {
    try {
      const items = ids.map(id => actor.items.get(id)?.toObject()).filter(Boolean);
      const chest = await shelf.api.createLootContainer({ name: `${doc.name}'s gear`, img: items[0]?.img ?? undefined, items, ephemeral: true });
      const token = await chest.getTokenDocument({ x: doc.x, y: doc.y, elevation: doc.elevation ?? 0 });
      await doc.parent.createEmbeddedDocuments("Token", [token.toObject()]);
    } catch(err) { log.warn(`Loot Shelf could not take what it carried — the items are lost.`, err); }
  }
  await actor.deleteEmbeddedDocuments("Item", ids);
  return ids;
}

/**
 * A summon's arrive or leave beat, floated over its OWNER under the effect's name ("+(Familiar: Raven
 * (Fey))" over the caster, never "+(Raven)" over the familiar; RULINGS *Summons*). `x`/`y` and `tokenUuid`
 * stay the creature's, where the FX plays.
 */
const ownerEvent = (kind, doc, owner, label) => {
  const c = centreOfDoc(doc);
  return { id: foundry.utils.randomID(8), kind, label, ownerUuid: owner?.uuid ?? null, x: c.x, y: c.y, sceneId: doc.parent.id, tokenUuid: doc.uuid };
};

/** A companion's beat, on its record (each client floats it; the moment gate publishes it): `name` the creature. */
const companionEvent = (kind, doc, companion, owner) => ({
  ...ownerEvent(kind, doc, owner, companionEffectName({ noun: companion.noun, name: companion.name, type: companion.type })), name: companion.name
});

/** Long enough for the leave picture to play over the token before it goes. */
const LEAVE_MS = 900;
const pause = ms => new Promise(resolve => { setTimeout(resolve, ms); });

/** Every effect on the owner that names this card's companion (the recorded one, and any stray copy). */
const companionEffectsOf = (caster, messageId) => (caster?.effects?.contents ?? []).filter(e => readFlag(e, "companion") === messageId);

/** Remove them, as the elect: the owner's removal prompt lets this pass. */
async function endCompanionEffects(caster, messageId) {
  const ids = companionEffectsOf(caster, messageId).map(e => e.id);
  if ( ids.length ) await caster.deleteEmbeddedDocuments("ActiveEffect", ids, { [MODULE_ID]: { companionEnd: true } });
}

/** The elect removes every stale companion effect on an owner (as its own removal, so the prompt passes; `staleCompanionEffect`). */
async function endStaleCompanionEffects(caster) {
  const stale = (caster?.effects?.contents ?? []).filter(e => {
    const id = readFlag(e, "companion");
    return !!id && staleCompanionEffect(e.id, readFlag(game.messages.get(id), SUMMON_FLAG));
  }).map(e => e.id);
  if ( stale.length ) await caster.deleteEmbeddedDocuments("ActiveEffect", stale, { [MODULE_ID]: { companionEnd: true } });
  return stale.length;
}

/** The owner's effect for a companion, renamed to where it is. */
async function renameCompanionEffect(caster, companion, pocket) {
  const effect = companion?.effectId ? caster?.effects?.get(companion.effectId) : null;
  if ( effect ) await effect.update({ name: companionEffectName({ noun: companion.noun, name: companion.name, type: companion.type, pocket }) });
}

/** The elect answers a companion ask: into the pocket (the token kept as a snapshot) or back from it. */
async function actCompanion(message) {
  let claimed = false;
  await queueFlagWrite(message, SUMMON_FLAG, current => {
    if ( !current.companion?.ask || current.companion.acting ) return false;
    current.companion.acting = true;
    claimed = true;
  });
  if ( !claimed ) return;
  const flag = readFlag(message, SUMMON_FLAG);
  const companion = flag.companion;
  const caster = resolveUuid(flag.sourceUuid);
  const patch = { ask: null, acting: false };
  try {
    if ( companion.ask.kind === "away" ) {
      const doc = liveToken(flag);
      if ( doc ) {
        await dropCarried(doc, companion.baseItems);
        const snapshot = doc.toObject();
        delete snapshot._id;
        await queueFlagWrite(message, SUMMON_FLAG, current => { current.companion.events = [...(current.companion.events ?? []), companionEvent("leave", doc, companion, caster)]; });
        await pause(LEAVE_MS);
        // its seat goes with it (a deleted token keeps its combatant), the Initiative kept for the way back
        const seat = game.combat?.combatants.find(c => (c.tokenId === doc.id) && (c.sceneId === doc.parent.id)) ?? null;
        patch.seat = seat ? { combatId: game.combat.id, initiative: seat.initiative ?? null } : null;
        for ( const combat of game.combats ) {
          const seats = combat.combatants.filter(c => (c.tokenId === doc.id) && (c.sceneId === doc.parent.id)).map(c => c.id);
          if ( seats.length ) await combat.deleteEmbeddedDocuments("Combatant", seats);
        }
        await doc.delete({ [MODULE_ID]: { companionEnd: true } });
        patch.snapshot = snapshot;
      }
      patch.state = "pocket";
      await renameCompanionEffect(caster, companion, true);
    } else if ( companion.ask.kind === "recall" ) {
      const at = companion.ask.placement;
      const scene = game.scenes.get(at.sceneId);
      if ( !scene || !companion.snapshot ) throw new Error("nothing to call back, or the scene is gone");
      const data = { ...companion.snapshot, x: at.x, y: at.y, elevation: at.elevation ?? 0 };
      // the floor it was called to, not the one it went away from (v14 scene levels)
      if ( at.level ) data.level = at.level;
      // it comes back seeing, whatever the snapshot kept (one put away with its sight off)
      if ( seesOf(game.actors.get(companion.snapshot.actorId), flag) ) foundry.utils.setProperty(data, "sight.enabled", true);
      const [doc] = await scene.createEmbeddedDocuments("Token", [data]);
      patch.state = "present";
      patch.snapshot = null;
      patch.events = [...(companion.events ?? []), companionEvent("appear", doc, companion, caster)];
      await queueFlagWrite(message, SUMMON_FLAG, current => {
        current.landed = [{ tokenId: doc.id, sceneId: scene.id, tokenUuid: doc.uuid, actorUuid: doc.actor?.uuid ?? null, name: doc.name }];
      });
      await renameCompanionEffect(caster, companion, false);
      const combat = activeCombatFor(caster);
      if ( combat ) {
        const own = listedNames(summonOwnInitiativeEntries()).has(lower(rulesName(flag.itemName)));
        const { initiative, roll } = recallSeat(companion.seat, { combatId: combat.id, own,
          casterInitiative: combat.getCombatantsByActor(caster)[0]?.initiative ?? null });
        const seated = await combat.createEmbeddedDocuments("Combatant", [{ tokenId: doc.id, sceneId: scene.id, actorId: doc.actorId, initiative }]);
        if ( roll && seated.length ) await combat.rollInitiative(seated.map(c => c.id));
      }
      patch.seat = null;
    }
  } catch(err) {
    log.error(`The ${lower(companion.noun)} could not ${companion.ask.kind === "away" ? "go to its pocket" : "come back"}.`, err);
    ui.notifications?.error(`${TITLE}: the ${lower(companion.noun)} could not ${companion.ask.kind === "away" ? "go to its pocket" : "come back"} (${err?.message ?? err}).`);
  } finally {
    await queueFlagWrite(message, SUMMON_FLAG, current => { Object.assign(current.companion, patch); });
  }
}

// Removing the companion's effect asks first: yes dismisses it forever; the pocket is the spell's menu.
// The elect's own removal (a dismissal) carries `companionEnd` and passes.
listen("preDeleteActiveEffect", "summons", (effect, options, userId) => {
  try {
    const id = readFlag(effect, "companion");
    if ( !id || options?.[MODULE_ID]?.companionEnd ) return;
    const message = game.messages.get(id) ?? null;
    const flag = message ? readFlag(message, SUMMON_FLAG) : null;
    const standing = !!flag?.applied && !flag.dismissAsked && !flag.dismissed && (flag.companion?.state !== "gone") && (flag.companion?.effectId === effect.id);
    if ( !standing ) return;   // an orphan, or a companion already gone: removed as usual
    if ( userId === game.user.id ) void confirmCompanionEnd(effect, message);
    return false;
  } catch(err) { log.warn(`Could not read the companion's effect — it is removed as usual.`, err); }
});

async function confirmCompanionEnd(effect, message) {
  const flag = message ? readFlag(message, SUMMON_FLAG) : null;
  const row = companionOf(flag?.itemName);
  const noun = lower(row?.noun ?? "companion");
  const yes = await confirmPopup(effect.uuid, "companionEnd", {
    title: `Dismiss ${noun}?`,
    content: `<p>Dismiss ${noun}? This will remove them forever.</p><p>More options available by pressing ${flag?.itemName ? `${esc(flag.itemName)} spell` : "the spell"}.</p>`
  });
  if ( !yes ) return;
  if ( !message || !flag?.applied ) { await effect.delete({ [MODULE_ID]: { companionEnd: true } }); return; }
  if ( row && needsGM(row) ) return;
  await askDismiss(message);
}

// A companion's token, or the world creature it stands on, deleted by hand asks first: the spell's menu dismisses it
// or puts it away, and a native delete leaves its record, seat and effect behind. The module's own deletes carry
// `companionEnd`, a confirmed one `handDelete`; dnd5e's transform revert (`replacements`) swaps the token and passes.
listen("preDeleteToken", "summons", (token, options, userId) => {
  try {
    if ( handDeletePasses(options, MODULE_ID) ) return;
    const message = game.messages.get(readFlag(token, SUMMON_CARD_FLAG) ?? "") ?? null;
    const flag = message ? readFlag(message, SUMMON_FLAG) : null;
    if ( !guardsHandDelete(flag) ) return;
    if ( userId === game.user.id ) void confirmHandDelete(token, flag);
    return false;
  } catch(err) { log.warn(`Could not read the token's companion record — it is deleted as usual.`, err); }
});

listen("preDeleteActor", "summons", (actor, options, userId) => {
  try {
    if ( handDeletePasses(options, MODULE_ID) || actor.isToken ) return;
    const flag = handDeleteRecord(summonRecords().map(({ flag }) => ({ flag, liveActorId: liveToken(flag)?.actorId ?? null })), actor.id);
    if ( !flag ) return;
    if ( userId === game.user.id ) void confirmHandDelete(actor, flag);
    return false;
  } catch(err) { log.warn(`Could not read the creature's companion record — it is deleted as usual.`, err); }
});

async function confirmHandDelete(doc, flag) {
  const yes = await confirmPopup(doc.uuid, "handDelete", handDeleteQuestion({ noun: companionOf(flag.itemName)?.noun ?? null,
    name: esc(doc.name), spell: flag.itemName ? esc(flag.itemName) : null, creature: doc instanceof Actor }));
  if ( yes ) await doc.delete({ [MODULE_ID]: { handDelete: true } });
}

// At 0 HP the familiar disappears (the spell's own text), leaving behind what it carried: the elect
// dismisses it, which drops the gear, plays the leave and ends the owner's effect. A summon standing on
// its caster's effect falls the same way when its row says so (SUMMON_FALLS `atZero`).
listen("updateActor", "summons", (actor, changes) => {
  try {
    if ( !isActiveGM() || !actor?.isToken || !foundry.utils.hasProperty(changes, "system.attributes.hp.value") ) return;
    if ( Number(actor.system?.attributes?.hp?.value) > 0 ) return;
    const id = fallenSummon(summonRecords(), actor.token?.uuid, SUMMON_FALLS, listedNames(summonFallEntries()));
    const message = id ? game.messages.get(id) : null;
    if ( !message ) return;
    void (async () => {
      await queueFlagWrite(message, SUMMON_FLAG, current => { if ( current.companion ) current.companion.fell = true; else current.fell = true; });
      await askDismiss(message);
    })().catch(err => log.warn(`Could not take the summon off the table at 0 HP.`, err));
  } catch(err) { log.warn(`Could not read the summon's Hit Points.`, err); }
});

// The caster dies (the `dead` status lands on it; 0 Hit Points alone is Dying): a summon whose text says so
// disappears (SUMMON_FALLS `casterDeath`), and a companion it empowered reverts (the caster's empower effect goes).
listen("createActiveEffect", "summons", effect => {
  try {
    if ( !isActiveGM() || !(effect?.parent instanceof Actor) || !effect.statuses?.has?.("dead") ) return;
    const caster = effect.parent;
    for ( const id of casterDeathSummons(summonRecords(), caster.uuid, SUMMON_FALLS, listedNames(summonFallEntries())) ) {
      const message = game.messages.get(id);
      if ( message ) void askDismiss(message).catch(err => log.warn(`Could not dismiss the summon at its caster's death — delete its token by hand.`, err));
    }
    for ( const e of caster.effects.filter(x => !!readFlag(x, "empowerEffect")) ) void e.delete().catch(err => log.warn(`Could not end the empowerment at the caster's death.`, err));
  } catch(err) { log.warn(`Could not read the caster's death.`, err); }
});

// The caster's empower effect removed (a hand, its clock, a rest; never the elect's own `empowerEnd`): the
// form on the companion ends — the elect is asked to revert through the transform record. dnd5e's own
// dependency takes the form effect with it too; the revert runs once either way.
listen("deleteActiveEffect", "summons", (effect, options) => {
  try {
    const id = readFlag(effect, "empowerEffect");
    if ( !id || !isActiveGM() || options?.[MODULE_ID]?.empowerEnd ) return;
    const message = game.messages.get(id);
    if ( !message ) return;
    void queueFlagWrite(message, EMPOWER_RECORD_FLAG, current => {
      if ( !current.applied || current.ended || current.revertAsked ) return false;
      current.revertAsked = true;
      current.revertWhy = "ended";   // the spell's effect went: the end card says the spell ended, not a choice
    }).catch(err => log.warn(`Could not end the empowerment with its effect — revert the familiar from its sheet.`, err));
  } catch(err) { log.warn(`Could not end the empowerment with its effect.`, err); }
});

/**
 * The empowerment ended by the companion's own going (dismissed, fallen): the transform record stamped `ended`
 * and the caster's effect removed as the elect's own (`empowerEnd`), with no form left to revert.
 */
async function endEmpower(caster, empower, ended) {
  const message = game.messages.get(empower?.messageId);
  if ( message ) await queueFlagWrite(message, EMPOWER_RECORD_FLAG, current => {
    if ( !current.applied || current.ended ) return false;
    current.ended = { why: ended.why, word: ended.word, at: Date.now() };
  });
  const effect = empower?.effectId ? caster?.effects?.get(empower.effectId) : null;
  if ( effect ) await effect.delete({ [MODULE_ID]: { empowerEnd: true } });
}

/** Every beat a record carries: the landing's and the standing effect's, then a companion's own. */
const beatsOf = flag => [...(flag?.events ?? []), ...(flag?.companion?.events ?? [])];

// The beats float on every client, the effect's own way and over the effect's bearer: "+(Familiar: Owl (Fey))"
// rising over the caster as it appears, "−(…)" falling as it leaves (Foundry's own float for an effect, which
// a marker effect with no change never draws). An owner with no token here floats it where the creature is.
const floated = new Set();
listen("updateChatMessage", "summons", message => {
  try {
    for ( const e of beatsOf(readFlag(message, SUMMON_FLAG)) ) {
      if ( floated.has(e.id) ) continue;
      floated.add(e.id);
      if ( (e.sceneId !== canvas.scene?.id) || !canvas?.interface?.createScrollingText ) continue;
      const on = e.kind === "appear";
      const text = `${on ? "+" : "−"}(${e.label ?? e.name})`;
      const owner = e.ownerUuid ? resolveUuid(e.ownerUuid) : null;
      const tokens = tokensOf(owner).filter(t => t.visible && !t.document?.isSecret);
      const at = tokens.length ? tokens.map(t => ({ point: t.center, h: t.h })) : [{ point: { x: e.x, y: e.y }, h: canvas.grid.size }];
      for ( const { point, h } of at ) canvas.interface.createScrollingText(point, text, {
        anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
        direction: on ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
        distance: 2 * h, fontSize: 28, stroke: 0x000000, strokeThickness: 4, jitter: 0.25
      });
    }
  } catch(err) { log.warn(`The summon's float could not draw.`, err); }
});
listen("ready", "summons", () => {
  // what stood before this client loaded has already floated
  for ( const { flag } of summonRecords() ) for ( const e of beatsOf(flag) ) floated.add(e.id);
});

/* --- the card says it (R5) --------------------------------------------------------------------------- */

function drawSummon(message, html, flag) {
  const row = document.createElement("div");
  row.className = "bythebooks-summon";
  const caster = resolveUuid(flag.sourceUuid);
  const mine = answersHere(flag.askedBy, caster);
  if ( flag.status === "asked" ) {
    if ( !mine ) return;
    pendingRow(message, row, { latch: { sub: SUMMON_FLAG, show: () => showSummonPopup(message) }, answer: { label: "Place the creature", style: { margin: "0.25rem 0 0" } } });
    html.querySelector(SURFACES.messageContent)?.appendChild(row);
    return;
  }
  const names = (flag.landed ?? []).map(l => l.name);
  const what = `${flag.count > 1 ? `${flag.count} × ` : ""}${flag.petName || flag.summonName || flag.profileName || "the creature"}`;
  // a named familiar's form beside its name ("Pip — summoned", "Owl · Fey")
  const form = (flag.petName && flag.summonName && (flag.petName !== flag.summonName)) ? flag.summonName : null;
  if ( !flag.applied ) {
    const gm = !!game.users.activeGM;
    row.innerHTML = bfCard({ eyebrow: "Summon", tone: "pending", title: `${what} — placed`,
      subtitle: gm ? "appearing…" : "no GM online — it appears when a GM connects" });
  } else if ( flag.dismissed ) {
    row.innerHTML = bfCard({ eyebrow: "Summon", tone: "neutral", title: `${what} — ${(flag.companion?.fell || flag.fell) ? "dropped to 0 HP and disappeared" : "dismissed"}`, subtitle: flag.resistance ? `${flag.resistance.effectName} ended` : "" });
  } else if ( flag.outcome === "failed" ) {
    row.innerHTML = bfCard({ eyebrow: "Summon", tone: "bad", title: `${what} — could not be landed`, subtitle: `${flag.failure ?? "see the console"} · place it by hand` });
  } else {
    const kind = flag.creatureType ? (CONFIG.DND5E?.creatureTypes?.[flag.creatureType]?.label ?? flag.creatureType) : null;
    row.innerHTML = bfCard({ eyebrow: "Summon", tone: "good", title: `${names.join(", ") || what} — summoned`,
      subtitle: [form, kind, flag.picked, flag.boon ? `+${flag.boon.hp} HP (${flag.boon.benefit}${flag.boon.bySystem ? ", the sheet's own" : ""})` : null, flag.resistance ? `${flag.resistance.effectName} on ${flag.sourceName}` : null,
        (flag.companion?.state === "pocket") ? "in its pocket dimension" : null,
        flag.replaced ? "the earlier one is dismissed" : null].filter(Boolean).join(" · ") });
    if ( (mine || game.user.isGM) && !flag.dismissAsked ) row.appendChild(momentButton("Dismiss", () => { void askDismiss(message); }, { margin: "0.25rem 0 0" }));
    else if ( flag.dismissAsked ) row.appendChild(Object.assign(document.createElement("em"), { textContent: "dismissing…" }));
  }
  html.querySelector(SURFACES.messageContent)?.appendChild(row);
}

listen("dnd5e.renderChatMessage", "summons", (message, html) => {
  try {
    const flag = readFlag(message, SUMMON_FLAG);
    if ( flag ) drawSummon(message, html, flag);
  } catch(err) {
    log.error(`The summon's row could not be drawn.`, err);
  }
});

listen("ready", "summons", () => {
  const mod = game.modules.get(MODULE_ID);
  if ( mod ) mod.api = Object.assign(mod.api ?? {}, { summons: { showSummonPopup, askDismiss } });
});
