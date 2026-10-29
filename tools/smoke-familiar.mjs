// Live suite: FAMILIAR FRIEND (Arcana Unleashed; RULINGS *Summons*, calls 45–47) — the feat's three benefits on a
// Find Familiar shaped as the feat grants it (a forward "(free casting)" activity spending the spell's one use per
// Long Rest): the free cast's use spent through the summon's cause, the boon's Hit Points landed off the feat's own
// enchantment change, and Helpful Friend's buy box in the skill dialog — offered within 5 ft of the familiar, greyed
// with the reason beyond it or with the familiar in its pocket, absent on an unproficient skill or a raw check.
// §8 connects the PLAYER test identity and casts the free cast with dnd5e's Allow Summoning OFF (session zero's
// premise): the record stamps `asked` on the player's own card, no token is created by the system, the use is spent.
//
// Fixtures: BTB Test Sorcerer (tools/fixture-suite.mjs) is lent the feat (the Arcana Unleashed feats pack) and the
// PHB's Find Familiar reshaped for the run; BTB Test Mage (the player's) the same for §8. Arcana proficiency is set on
// the Sorcerer for the run. The cards, the imported Owl, the tokens, the companion effect and the lent items are torn
// down; the settings put back. Like smoke-summons, the record is answered through the pure fold, never the popup.
//
// Sections: `--section 3`, `--list`. Fixtures and teardown ALWAYS run.
import { announcePlan, connectSuite, disposeSafely, finish, loadEnv, sectionArg, sectionPlan } from './harness.mjs';
import { installPrelude } from './prelude.mjs';
import { playerConfig } from './target.mjs';
import { Foundry } from 'fvtt-mcp-dnd5e/client';

// THE COVERAGE MAP (tools/coverage-map.mjs) — ⚠ NEVER import a suite; the map is parsed.
export const COVERS = [
  'summons.js',         // §1 the free cast's cause and spend, §2 a cancelled menu spends nothing, §3 the boon landed, §7 the pocket, §8 the player's cast; §9 Battle Familiar's empower record, §13 dismissed while empowered
  'advantage-buys.js',  // §4 the box offered and spent, §5 greyed beyond 5 ft, §6 absent on an unproficient skill and a raw check, §7 greyed in the pocket, §10 offered while empowered
  'transforms.js',      // §9 the familiar empowered in place (its sight kept), §11 the temp HP gone reverts and re-points (the sight put back), §12 the caster's effect as the lever
  'help.js'             // §14 the Owl's Help: seeded on the landed familiar, the use refused with no target, the assist answered on the record, Assisted spent by the check, Distracted (Help) landed, the attack row greyed beyond 5 ft
];

const SECTIONS = {
  1: 'THE FREE CAST: Find Familiar used through its "(free casting)" forward, sent to its card — the record stamps `asked`, the spell\'s one use is spent and no slot; answered as an Owl (Celestial), the elect lands it, its token seeing',
  2: 'A CANCELLED MENU SPENDS NOTHING: the forward used with the menu in the way, the menu cancelled — the use stands at 0 of 1 spent, no card',
  3: 'THE BOON: the landed Owl carries the feat\'s Hit Points — its maximum and current both the Owl\'s plus twice the caster\'s level; the record names Fortified Familiar',
  4: 'HELPFUL FRIEND, OFFERED: an Arcana check (proficient) with the Owl one square away — the box "Familiar Friend — 1 use · N left" with a tick; ticked, the net and default Advantage; pressed, a use spent, the record names the feat',
  5: 'BEYOND 5 FT: the Owl three squares away — the box stays, greyed, "your familiar is 15 ft away — within 5 feet only", no tick',
  6: 'NOT A PROFICIENT SKILL: a Stealth check (unproficient) and a raw Wisdom check carry no box at all',
  7: 'IN THE POCKET: the familiar put away — the box greyed "in its pocket dimension"; Dismiss ends it',
  8: 'THE PLAYER\'S CAST: with Allow Summoning off, the player test user\'s free cast on their own Mage posts its card with the record `asked`, no token created, the use spent',
  9: 'EMPOWERED (Battle Familiar, Arcana Unleashed): cast with the Owl on the table and answered as the Brute, the elect transforms the Owl IN PLACE — the same token, the Brute\'s stat block (AC 15 at level 2, Str 16, Rend), its own Hit Points and type kept, 30 Temporary Hit Points, the caster\'s Proficiency Bonus, still named Owl and still seeing; the caster\'s "Battle Familiar: Owl" effect for an hour and the form effect depending on it; the companion record knows',
  10: 'HELPFUL FRIEND WHILE EMPOWERED: the box still offered one square from the empowered Owl',
  11: 'THE TEMP HP GONE: the Owl reverts — a new token, the Hit Points lost kept, no temp HP, its seat in the tracker and the companion record re-pointed, the new token seeing, the caster\'s effect gone, the record ended "noTemp"',
  12: 'THE LEVER: empowered again, the caster\'s "Battle Familiar: Owl" effect removed by hand — the Owl reverts, the record ended',
  13: 'DISMISSED WHILE EMPOWERED: empowered again, Dismiss — the token goes, the caster\'s effect with it, the record ended "gone"',
  14: 'THE HELP ACTION (the Owl\'s button; runs before §7): the landed Owl carries Help; with nothing targeted the use is refused and posts no card; the Sorcerer targeted one square away, the card\'s record offers both assists with Perception and Stealth to lend; answered on the record as the check lending Perception, the elect lands "Assisted — Perception" on the Sorcerer, receipted; a Perception check\'s gate names it at Advantage and the press spends it, a second check meets no gate; answered as the attack, "Distracted (Help)" lands stamped with the Owl as its source; three squares away the attack row is greyed with the distance'
};
const DEPENDS = { 3: [1], 4: [1], 5: [1], 7: [1], 9: [1], 10: [9], 11: [9], 12: [11], 13: [12], 14: [1] };

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const env = loadEnv();
const f = await connectSuite({ tag: 'familiar', watchdogMs: 300_000 });
announcePlan('familiar', plan, pulled);

/* --- the familiar as the feat grants it: lent to a caster, torn down after ------------------------- */
const LEND = `async ({ casterName }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const caster = game.actors.getName(casterName);
  if (!caster) return { fatal: 'missing fixture: ' + casterName + ' — run tools/fixture-suite.mjs' };
  const fromPack = async (packId, name) => {
    const pack = game.packs.get(packId);
    if (!pack) throw new Error(packId + ' is not on this box');
    const hit = (await pack.getIndex()).find(e => e.name === name);
    if (!hit) throw new Error(packId + ' ships no "' + name + '"');
    const doc = await pack.getDocument(hit._id);
    const data = doc.toObject();
    delete data._id;
    foundry.utils.setProperty(data, '_stats.compendiumSource', doc.uuid);
    return data;
  };
  // a killed run's copies first (a lookup by name would find the stale one): the fixtures never carry these
  const stale = caster.items.filter(i => ((i.type === 'feat') && (i.name === 'Familiar Friend')) || ((i.type === 'spell') && ((i.name === 'Find Familiar') || (i.name === 'Battle Familiar')))).map(i => i.id);
  if (stale.length) await caster.deleteEmbeddedDocuments('Item', stale);
  const feat = await fromPack('dnd-arcana-unleashed.feats', 'Familiar Friend');
  const spell = await fromPack('dnd-players-handbook.spells', 'Find Familiar');
  const battle = await fromPack('dnd-arcana-unleashed.spells', 'Battle Familiar');
  battle.system.method = 'spell'; battle.system.prepared = 1;
  // as the feat's advancement grants it: prepared, one use per Long Rest, a forward spending that use with no slot
  spell.system.method = 'spell'; spell.system.prepared = 2;
  spell.system.uses = { max: '1', recovery: [{ period: 'lr', type: 'recoverAll' }], spent: 0 };
  const summonId = Object.values(spell.system.activities).find(a => a.type === 'summon')?._id;
  spell.system.activities.bfFreeCast000000 = { _id: 'bfFreeCast000000', type: 'forward', name: '(free casting)', sort: 1,
    activity: { id: summonId }, activation: { type: 'action', override: false },
    consumption: { targets: [{ type: 'itemUses', target: '', value: '1', scaling: {} }], scaling: { allowed: false }, spellSlot: true } };
  // as the feat's grant does on a real sheet (measured on Tychon, 2026-10-14): the feat's enchantment rides onto the spell,
  // so dnd5e's own summon landing carries Fortified Familiar's Hit Points and the module must not add them again
  spell.effects = [...(spell.effects ?? []), ...(feat.effects ?? []).filter(e => e.type === 'enchantment').map(e => {
    const copy = foundry.utils.deepClone(e); delete copy._id;
    foundry.utils.setProperty(copy, 'flags.dnd5e.advancementOrigin', 'lent.enchant');
    return copy;
  })];
  const made = await caster.createEmbeddedDocuments('Item', [feat, spell, battle]);
  const featItem = made.find(i => i.type === 'feat');
  const spellItem = made.find(i => (i.type === 'spell') && (i.name === 'Find Familiar'));
  const battleItem = made.find(i => (i.type === 'spell') && (i.name === 'Battle Familiar'));
  if (!featItem || !spellItem || !battleItem) return { fatal: 'the lend made ' + made.length + ' item(s): ' + made.map(i => i.name + '/' + i.type).join(', ') };
  const battleSummon = Object.values(battleItem.system.activities.contents ?? [...battleItem.system.activities]).find(a => a.type === 'summon');
  const brute = battleSummon?.profiles?.find(p => p.name === 'Brute') ?? null;
  const forms = Object.fromEntries((battleSummon?.profiles ?? []).map(p => [p.name, { id: p._id, uuid: p.uuid }]));
  return { featId: featItem.id, spellId: spellItem.id, summonId, battleId: battleItem.id, battleSummonId: battleSummon?.id ?? null,
    bruteId: brute?._id ?? null, bruteUuid: brute?.uuid ?? null, forms, prof: Number(caster.system.attributes.prof) || 0, level: Number(caster.system.details.level) || 0 };
}`;

const out = await f.evaluate(async ({ sections, titles, extra }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, watch, tokenOn, viewScene, snapshotSettings } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const suiteStart = Date.now();

  const modDoc = game.modules.get(MOD);
  if (!modDoc?.active) return { fatal: `module active=${modDoc?.active}` };
  const api = modDoc.api?.summons;
  if (!api?.askDismiss) return { fatal: 'no summons api — OLD code (reload the box)' };
  const { SUMMON_BOONS, ADVANTAGE_BUYS } = await import(`/modules/${MOD}/scripts/decide/registry.js`);
  if (!SUMMON_BOONS?.['Familiar Friend'] || !ADVANTAGE_BUYS?.['Familiar Friend']) return { fatal: 'the Familiar Friend rows are not in the loaded code — OLD code (reload the box)' };
  const { placedAnswer, companionAsk } = await import(`/modules/${MOD}/scripts/decide/summons.js`);
  const { SUMMON_CHOICES } = await import(`/modules/${MOD}/scripts/decide/registry.js`);
  const { poolFromPacks } = await import(`/modules/${MOD}/scripts/gallery.js`);

  const caster = game.actors.getName('BTB Test Sorcerer');
  if (!caster) return { fatal: 'missing fixture: BTB Test Sorcerer — run tools/fixture-suite.mjs' };
  const range = game.scenes.getName('By the Books Test Range');
  if (!range) return { fatal: 'missing fixture: scene By the Books Test Range — run tools/fixture-suite.mjs' };
  // Soft: the fatal below names a range that never readied (a throw out here would end the run with no report).
  await viewScene(range).catch(() => null);
  if (canvas.scene?.id !== range.id) return { fatal: 'the canvas never readied on the test range' };
  const casterToken = canvas.scene.tokens.find(t => t.actor?.id === caster.id) ?? null;
  if (!casterToken) return { fatal: 'the Sorcerer has no token on the scene — run tools/fixture-suite.mjs' };
  const grid = canvas.scene.grid.size;
  // a token's sight as stored: the landing's, the empower's and the revert's (RULINGS *Summons*, call 60)
  const sees = tok => !!tok?._source?.sight?.enabled;

  const SETTING_KEYS = ['autoDamage', 'autoApply', 'playerRollDamage', 'damageTimer', 'dramaticBeat', 'requireTarget',
    'reactionHold', 'holdTimer', 'riders', 'effectRiders', 'masteryRiders', 'masteryAsk', 'saves', 'castApply', 'concMode',
    'reminderList', 'conditionList', 'damageEitherList', 'clockRiderList', 'hitMenuList', 'd20Folds', 'd20FoldAsk'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { set } = settings;
  const def = k => game.settings.settings.get(`${MOD}.${k}`)?.default;
  const skillsBefore = { arc: foundry.utils.deepClone(caster.system._source.skills?.arc ?? {}), ste: foundry.utils.deepClone(caster.system._source.skills?.ste ?? {}) };

  const lent = [];
  const madeTokens = [];
  const madeActors = [];
  const madeMessages = [];
  let restored = false;
  const closeDialogs = async () => {
    for (const app of foundry.applications.instances.values()) {
      const ours = /RollConfigurationDialog/.test(app.constructor?.name ?? '') || app.element?.querySelector?.('[data-bf-buy]')
        || app.element?.querySelector?.('[data-bf-ticks="bf-help"]')
        || (/Find Familiar/.test(app.element?.textContent ?? '') && (app instanceof foundry.applications.api.DialogV2));
      if (ours) { try { await app.close(); } catch { /* gone */ } }
    }
  };
  const teardown = async () => {
    if (restored) return;
    restored = true;
    for (const failed of await settings.restore()) log.push(`TEARDOWN settings ERROR: ${failed}`);
    try {
      await closeDialogs();
      await caster.update({ 'system.skills.arc': skillsBefore.arc, 'system.skills.ste': skillsBefore.ste });
      for (const l of landedMessage?.getFlag(MOD, 'summon')?.landed ?? []) if (!madeTokens.includes(l.tokenId)) madeTokens.push(l.tokenId);
      if (game.combat?.getFlag(MOD, 'suiteFamiliar')) await game.combat.delete();
      const tokens = madeTokens.filter(id => canvas.scene.tokens.get(id));
      if (tokens.length) await canvas.scene.deleteEmbeddedDocuments('Token', tokens, { 'fvtt-mod-bythebooks': { companionEnd: true } });
      for (const e of caster.effects.filter(e => /^Battle Familiar/.test(e.name))) { try { await e.delete({ [MOD]: { empowerEnd: true } }); } catch { /* gone */ } }
      for (const e of caster.effects.filter(e => /^Familiar:/.test(e.name))) { try { await e.delete({ [MOD]: { companionEnd: true } }); } catch { try { await e.delete(); } catch { /* gone */ } } }
      const live = caster.items.filter(i => lent.includes(i.id) || ((i.type === 'feat') && (i.name === 'Familiar Friend')) || ((i.type === 'spell') && ((i.name === 'Find Familiar') || (i.name === 'Battle Familiar')))).map(i => i.id);
      if (live.length) await caster.deleteEmbeddedDocuments('Item', live);
      for (const a of madeActors) { if (game.actors.get(a.id)) await a.delete({ 'fvtt-mod-bythebooks': { companionEnd: true } }); }
      const mine = game.messages.filter(m => (m.timestamp >= suiteStart)
        && (m.speaker?.alias?.startsWith?.('BTB Test') || Object.keys(m.flags?.[MOD] ?? {}).length));
      if (mine.length) await ChatMessage.deleteDocuments(mine.map(m => m.id));
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
    } catch (err) {
      log.push(`TEARDOWN ERROR: ${err?.message}`);
    }
  };

  // ---- the dialog drivers (smoke-lucky's)
  const textOf = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rollDialog = () => [...foundry.applications.instances.values()]
    .find(app => /RollConfigurationDialog/.test(app.constructor?.name ?? '') && app.rendered && app.element) ?? null;
  // ⚠ The buy rides on the dialog's options from preRoll and is drawn, box and tick at once, in the render hook
  // (advantage-buys.js drawBuy): the wait is the box drawn, or no buy to draw.
  const openDialog = async () => {
    const dlg = await until(rollDialog, { timeout: 6000, label: 'a roll dialog' });
    await until(() => !dlg.options?.bfBuy || dlg.element?.querySelector('[data-bf-buy]'), { timeout: 3000, label: 'the buy box drawn in the roll dialog' });
    return dlg;
  };
  const boxOf = dlg => dlg?.element?.querySelector('[data-bf-buy]') ?? null;
  const tickOf = dlg => dlg?.element?.querySelector('input[name="bf-buy"]') ?? null;
  const defaultOf = dlg => dlg?.element?.querySelector('button[data-bf-default]')?.dataset?.action ?? null;
  const netOf = dlg => dlg?.element?.querySelector('[data-bf-reminder-head] [data-bf-mode]')?.dataset?.bfMode ?? null;
  // The change handler redraws the box and re-nets the header synchronously (advantage-buys.js drawBuy).
  const tick = dlg => { const t = tickOf(dlg); if (t) { t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); } };
  const press = (dlg, mode) => { const b = dlg?.element?.querySelector(`button[data-action="${mode}"]`); b?.click(); return !!b; };
  const lastOf = type => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && (m.type === type)).pop() ?? null;

  let featItem = null;
  let spellItem = null;
  let summon = null;
  let forward = null;
  const usesSpent = () => Number(caster.items.get(spellItem?.id)?.system?.uses?.spent ?? -1);
  const featLeft = () => Number(caster.items.get(featItem?.id)?.system?.uses?.value ?? -1);
  const slotsLeft = () => Number(caster.system.spells?.spell1?.value ?? -1);
  let landedMessage = null;
  let owlToken = null;
  let owlDoc = null;
  const owlBaseHp = async () => {
    const owl = (await poolFromPacks({ crMax: 0, types: ['beast'] })).find(r => r.name === 'Owl');
    const doc = owl ? await fromUuid(owl.uuid) : null;
    return { owl, max: Number(doc?.system?.attributes?.hp?.max) || 0 };
  };
  const moveOwl = async squaresRight => {
    await owlDoc.update({ x: casterToken.x + grid * squaresRight, y: casterToken.y });
    // the buy measures the two documents' squares (geometry.js nearestFeet), not the animated placeable
    await until(() => (canvas.tokens.get(owlDoc.id)?.document?.x === owlDoc.x) ? true : null, { timeout: 4000 });
  };

  try {
    await set('autoDamage', 'all');
    await set('autoApply', false);
    await set('playerRollDamage', true);
    await set('damageTimer', 0);
    await set('dramaticBeat', 0);
    await set('requireTarget', false);
    await set('reactionHold', false);
    await set('holdTimer', 0);
    await set('riders', false);
    await set('effectRiders', false);
    await set('masteryRiders', false);
    await set('masteryAsk', false);
    await set('saves', false);
    await set('castApply', false);
    await set('concMode', 'off');
    await set('reminderList', 'buy');
    await set('conditionList', def('conditionList'));
    await set('damageEitherList', '');
    await set('clockRiderList', '');
    await set('hitMenuList', '');
    await set('d20Folds', '');
    await set('d20FoldAsk', false);
    if (game.combat) await game.combat.delete();
    // the Sorcerer proficient in Arcana, not in Stealth, for the run
    await caster.update({ 'system.skills.arc.value': 1, 'system.skills.ste.value': 0 });
    // a slot in hand, so "no slot spent" means something
    if ((caster.system.spells?.spell1?.max ?? 0) > 0) await caster.update({ 'system.spells.spell1.value': caster.system.spells.spell1.max });

    // ---- fixtures: the feat and the shaped spell
    const lendFn = new Function('return ' + extra.lend)();
    const lentOut = await lendFn({ casterName: caster.name });
    if (lentOut.fatal) return { fatal: lentOut.fatal };
    lent.push(lentOut.featId, lentOut.spellId, lentOut.battleId);
    featItem = caster.items.get(lentOut.featId);
    spellItem = caster.items.get(lentOut.spellId);
    const battleItem = caster.items.get(lentOut.battleId);
    const battleSummon = battleItem?.system?.activities?.get(lentOut.battleSummonId) ?? null;
    if (!battleSummon || !lentOut.bruteId) return { fatal: `the lent Battle Familiar lacks its summon or its Brute (summon=${!!battleSummon} brute=${lentOut.bruteId})` };
    // the empower cast, as a macro would send it: the question's answer on the use, the dialog skipped, no slot
    const empower = async (form = 'Brute') => {
      const f = lentOut.forms?.[form] ?? { id: lentOut.bruteId, uuid: lentOut.bruteUuid };
      const result = await battleSummon.use({ [MOD]: { toCard: true, empower: { companionMessageId: landedMessage.id, profileId: f.id, level: 2, pick: { uuid: f.uuid, name: form } } },
        create: { summons: false, measuredTemplate: false }, consume: { spellSlot: false } }, { configure: false }, { create: true });
      const message = result?.message instanceof ChatMessage ? result.message : null;
      if (message) madeMessages.push(message);
      const rec = await until(() => message?.getFlag(MOD, 'transform')?.applied ? message.getFlag(MOD, 'transform') : null, { timeout: 20000 });
      return { message, rec };
    };
    const casterEffect = () => caster.effects.find(e => /^Battle Familiar/.test(e.name)) ?? null;
    const companionRecord = () => landedMessage?.getFlag(MOD, 'summon') ?? null;
    const liveOwl = () => { const l = companionRecord()?.landed?.[0]; return l ? canvas.scene.tokens.get(l.tokenId) ?? null : null; };
    summon = spellItem.system.activities.get(lentOut.summonId);
    forward = spellItem.system.activities.get('bfFreeCast000000');
    if (!summon || !forward) return { fatal: `the lent Find Familiar lacks its activities (summon=${!!summon} forward=${!!forward})` };
    const level = lentOut.level;
    const PROF = lentOut.prof;
    log.push(`fixture: ${caster.name} level ${level}, proficiency ${PROF}; Find Familiar with "(free casting)" (${forward.relativeUUID})`);
    // a familiar standing from an earlier run would open the menu instead of a cast
    for (const e of caster.effects.filter(e => /^Familiar:/.test(e.name))) { try { await e.delete({ [MOD]: { companionEnd: true } }); } catch { /* gone */ } }

    // ---- 1. the free cast through the forward, to its card
    if (want(1)) await section(1, async () => {
      const slotsBefore = slotsLeft();
      const tokensBefore = new Set(canvas.scene.tokens.map(t => t.id));
      const result = await forward.use({ [MOD]: { toCard: true }, create: { measuredTemplate: false } }, { configure: false }, { create: true });
      const message = result?.message instanceof ChatMessage ? result.message : null;
      if (message) madeMessages.push(message);
      const flag = await until(() => message?.getFlag(MOD, 'summon')?.status === 'asked' ? message.getFlag(MOD, 'summon') : null, { timeout: 6000 });
      ok('§1a the forward\'s cast posts its card with the record asked — the system placed nothing',
        !!flag && (canvas.scene.tokens.filter(t => !tokensBefore.has(t.id)).length === 0),
        `message=${!!message} status=${flag?.status} newTokens=${canvas.scene.tokens.filter(t => !tokensBefore.has(t.id)).length}`);
      ok('§1b the spell\'s one use is spent through the cause, no slot', (usesSpent() === 1) && (slotsLeft() === slotsBefore),
        `spent=${usesSpent()} slots ${slotsBefore}→${slotsLeft()}`);
      // answered as an Owl (Celestial), one square to the right
      const { owl } = await owlBaseHp();
      const patch = (flag && owl) ? placedAnswer(flag, { profileId: flag.profiles[0]?.id ?? null, pick: { uuid: owl.uuid, name: owl.name }, count: 1, sceneId: canvas.scene.id,
        creatureType: (flag.creatureTypes ?? []).includes('celestial') ? 'celestial' : (flag.creatureTypes?.[0] ?? null),
        placements: [{ x: casterToken.x + grid, y: casterToken.y, elevation: casterToken.elevation ?? 0, rotation: 0 }] }, SUMMON_CHOICES) : null;
      if (patch) await message.setFlag(MOD, 'summon', { ...flag, ...patch });
      const landed = patch ? await until(() => message.getFlag(MOD, 'summon')?.applied ? message.getFlag(MOD, 'summon') : null, { timeout: 20000 }) : null;
      owlDoc = canvas.scene.tokens.get(landed?.landed?.[0]?.tokenId) ?? null;
      if (owlDoc) madeTokens.push(owlDoc.id);
      for (const a of game.actors.filter(a => a.getFlag('dnd5e', 'isAutoImported') && a.name === 'Owl')) if (!madeActors.includes(a)) madeActors.push(a);
      owlToken = owlDoc ? await tokenOn(owlDoc.id, { timeout: 6000 }) : null;
      landedMessage = landed ? message : null;
      ok('§1c answered as an Owl, the elect lands it beside the caster with the companion effect on the caster',
        landed?.outcome === 'landed' && !!owlToken && caster.effects.some(e => e.getFlag(MOD, 'companion') === message.id),
        JSON.stringify({ patch: !!patch, owl: !!owl, outcome: landed?.outcome, failure: landed?.failure, token: !!owlToken }));
      ok('§1d the Owl\'s token sees', sees(owlDoc), JSON.stringify(owlDoc?._source?.sight ?? null));
    });

    // ---- 2. a cancelled menu spends nothing
    if (want(2)) await section(2, async () => {
      await spellItem.update({ 'system.uses.spent': 0 });
      const before = game.messages.size;
      // the menu in the way: the standing companion's (after §1) or the cast's own picker
      const p = forward.use({}, { configure: false }, { create: true }).catch(() => null);
      // soft: a menu that never opens is §2a's failure, and the cancel below still runs
      const menu = await until(() => [...foundry.applications.instances.values()].find(a => (a instanceof foundry.applications.api.DialogV2) && /Find Familiar/.test(a.element?.textContent ?? '')) ?? null, { timeout: 8000 }).catch(() => null);
      ok('§2a the forward\'s cast opens the module\'s menu, not the system\'s', !!menu, `menu=${!!menu}`);
      if (menu) { try { await menu.close(); } catch { /* gone */ } }
      await p;
      // ⚠ A window: a spend or a card the cancel failed to stop lands within it.
      const stray = await watch(() => (usesSpent() !== 0) || (game.messages.size !== before), { ms: 600 });
      ok('§2b cancelled: the use stands unspent and no card posted', !stray && (usesSpent() === 0) && (game.messages.size === before),
        `stray=${stray} spent=${usesSpent()} messages ${before}→${game.messages.size}`);
      await closeDialogs();
    });

    // ---- 3. the boon
    if (want(3)) await section(3, async () => {
      const { max: base } = await owlBaseHp();
      const hp = owlDoc?.actor?.system?.attributes?.hp ?? {};
      const boon = landedMessage?.getFlag(MOD, 'summon')?.boon ?? null;
      ok(`§3a the Owl's Hit Points are its own plus twice the caster's level (${base} + ${2 * level})`,
        (Number(hp.max) === base + 2 * level) && (Number(hp.value) === base + 2 * level),
        `hp=${hp.value}/${hp.max} base=${base} level=${level}`);
      ok('§3b the record names Fortified Familiar and the amount — the sheet\'s own (the enchantment on the spell), nothing added on top', boon?.feature === 'Familiar Friend' && boon?.benefit === 'Fortified Familiar' && (Number(boon?.hp) === 2 * level) && (boon?.bySystem === true),
        JSON.stringify(boon));
    });

    // ---- 4. Helpful Friend, offered
    if (want(4)) await section(4, async () => {
      await closeDialogs();
      await featItem.update({ 'system.uses.spent': 0 });
      const FULL = featLeft();
      await moveOwl(1);
      const before = lastOf('check')?.id ?? null;
      void caster.rollSkill({ skill: 'arc' });
      const dlg = await openDialog();
      const box = boxOf(dlg);
      ok(`§4a the box: "Familiar Friend — 1 use · ${FULL} left" with a tick, the default Normal`,
        new RegExp(`Familiar Friend — 1 use · ${FULL} left`).test(textOf(box)) && !!tickOf(dlg) && (defaultOf(dlg) === 'normal'),
        `box="${textOf(box).slice(0, 100)}" tick=${!!tickOf(dlg)} default=${defaultOf(dlg)}`);
      tick(dlg);
      ok('§4b ticked: the net and the default move to Advantage', (netOf(dlg) === 'advantage') && (defaultOf(dlg) === 'advantage'), `net=${netOf(dlg)} default=${defaultOf(dlg)}`);
      press(dlg, 'advantage');
      const msg = await until(() => { const m = lastOf('check'); return (m && (m.id !== before)) ? m : null; }, { timeout: 8000 });
      // the spend is the item's own write, after the roll: waited for, never a sleep (tools/README *A faster platform turns a poll into a lie*)
      await until(() => (featLeft() === FULL - 1) ? true : null, { timeout: 6000 });
      // the reminder record and the pool spend ride on the check's creation data (advantage-buys.js postRollConfiguration)
      const rec = msg?.getFlag(MOD, 'reminder');
      ok('§4c pressed: the check went out at Advantage, a use spent, the record names Familiar Friend',
        (Number(msg?.rolls?.[0]?.options?.advantageMode) === 1) && (featLeft() === FULL - 1)
          && (rec?.sources ?? []).some(s => (s.kind === 'buy') && /Familiar Friend/.test(s.label)) && (msg?.getFlag(MOD, 'poolSpend')?.left === FULL - 1),
        `mode=${msg?.rolls?.[0]?.options?.advantageMode} left=${featLeft()} rec=${JSON.stringify(rec?.sources)} spend=${JSON.stringify(msg?.getFlag(MOD, 'poolSpend'))}`);
      await closeDialogs();
    });

    // ---- 5. beyond 5 ft
    if (want(5)) await section(5, async () => {
      await closeDialogs();
      await moveOwl(3);
      void caster.rollSkill({ skill: 'arc' });
      const dlg = await openDialog();
      const box = boxOf(dlg);
      ok('§5a three squares away: the box greyed "your familiar is 15 ft away — within 5 feet only", no tick',
        !!box && /your familiar is 15 ft away — within 5 feet only/.test(textOf(box)) && !tickOf(dlg),
        `box="${textOf(box).slice(0, 120)}" tick=${!!tickOf(dlg)}`);
      await closeDialogs();
      await moveOwl(1);
    });

    // ---- 6. not a proficient skill, not a skill
    if (want(6)) await section(6, async () => {
      await closeDialogs();
      void caster.rollSkill({ skill: 'ste' });
      let dlg = await openDialog();
      ok('§6a Stealth (unproficient): no box at all', !!dlg && !boxOf(dlg), `dialog=${!!dlg} box=${!!boxOf(dlg)}`);
      await closeDialogs();
      void caster.rollAbilityCheck({ ability: 'wis' });
      dlg = await openDialog();
      ok('§6b a raw Wisdom check: no box at all', !!dlg && !boxOf(dlg), `dialog=${!!dlg} box=${!!boxOf(dlg)}`);
      await closeDialogs();
    });

    // ---- 9. empowered in place
    if (want(9) && landedMessage && owlDoc) await section(9, async () => {
      await closeDialogs();
      const { max: base } = await owlBaseHp();
      const oldId = owlDoc.id;
      // its own look, given by the table so the check means something: the Owl wears a token and a portrait of its own
      const LOOK = { token: 'icons/svg/mystery-man.svg', portrait: 'icons/svg/cowled.svg' };
      // the portrait first: Foundry follows a token actor's img onto its token's texture when the two matched
      await owlDoc.actor.update({ img: LOOK.portrait });
      await owlDoc.update({ 'texture.src': LOOK.token, 'texture.scaleX': 2, 'texture.scaleY': 2 });
      await until(() => { const t = canvas.scene.tokens.get(oldId); return (t?._source?.texture?.src === LOOK.token) && (t?.actor?.img === LOOK.portrait); },
        { label: "§9 the Owl's own look stored" });
      log.push(`§9 the Owl's look set: stored=${canvas.scene.tokens.get(oldId)?._source?.texture?.src} prepared=${canvas.scene.tokens.get(oldId)?.texture?.src} scale=${canvas.scene.tokens.get(oldId)?._source?.texture?.scaleX} img=${canvas.scene.tokens.get(oldId)?.actor?.img}`);
      const ringBefore = !!canvas.scene.tokens.get(oldId)?._source?.ring?.enabled;
      const { message, rec } = await empower();
      const tok = canvas.scene.tokens.get(oldId) ?? null;
      const a = tok?.actor ?? null;
      const hp = a?.system?.attributes?.hp ?? {};
      const eff = casterEffect();
      const form = a?.effects?.find(e => !!e.getFlag(MOD, 'form')) ?? null;
      ok('§9a the elect transformed the Owl in place: the same token, polymorphed, still named Owl, in its own token art, portrait and ring, one square, its Tiny doubling gone',
        rec?.outcome === 'landed' && !!tok && !!a?.isPolymorphed && (a?.name === 'Owl') && (tok?.name === 'Owl') && (tok?._source?.texture?.src === LOOK.token) && (a?.img === LOOK.portrait)
          && (tok?.width === 1) && (tok?.height === 1) && (Number(tok?._source?.texture?.scaleX) === 1) && (!!tok?._source?.ring?.enabled === ringBefore),
        JSON.stringify({ outcome: rec?.outcome, failure: rec?.failure, token: !!tok, poly: a?.isPolymorphed, name: a?.name, tokenName: tok?.name, stored: tok?._source?.texture?.src, prepared: tok?.texture?.src, img: a?.img, width: tok?.width, scale: tok?._source?.texture?.scaleX, ring: tok?._source?.ring?.enabled, ringBefore, landedLook: rec?.landed?.[0]?.look ?? null, recordLook: message?.getFlag(MOD, 'transform')?.empower?.look ?? null }));
      ok('§9d empowered, it still sees (dnd5e\'s transform takes the world Owl\'s sight, which the pack ships off)', sees(tok), JSON.stringify(tok?._source?.sight ?? null));
      ok(`§9b the Brute's stat block at level 2 on its own Hit Points and type: AC 15, Str 16, Rend, HP ${base + 2 * level}, 30 temp, Celestial, PB ${PROF}, level 2 stamped`,
        (Number(a?.system?.attributes?.ac?.value) === 15) && (Number(a?.system?.abilities?.str?.value) === 16) && !!a?.items?.find(i => i.name === 'Rend')
          && (Number(hp.max) === base + 2 * level) && (Number(hp.value) === base + 2 * level) && (Number(hp.temp) === 30)
          && (a?.system?.details?.type?.value === 'celestial') && (Number(a?.system?.attributes?.prof) === PROF) && (a?.getFlag('dnd5e', 'summon')?.level === 2),
        JSON.stringify({ ac: a?.system?.attributes?.ac?.value, str: a?.system?.abilities?.str?.value, rend: !!a?.items?.find(i => i.name === 'Rend'), hp, type: a?.system?.details?.type?.value, prof: a?.system?.attributes?.prof, level: a?.getFlag('dnd5e', 'summon')?.level }));
      ok('§9c the caster\'s "Battle Familiar: Owl" effect for an hour, the form effect on the Owl depending on it, the companion record knows',
        !!eff && (eff.name === 'Battle Familiar: Owl') && (Number(eff.duration?.seconds) === 3600) && !!form && (form.getFlag('dnd5e', 'dependentOn') === eff.uuid)
          && (companionRecord()?.companion?.empower?.messageId === message?.id),
        JSON.stringify({ effect: eff?.name, seconds: eff?.duration?.seconds, form: form?.name, dep: form?.getFlag('dnd5e', 'dependentOn'), empower: companionRecord()?.companion?.empower }));
    });

    // ---- 10. Helpful Friend while empowered
    if (want(10) && liveOwl()) await section(10, async () => {
      await closeDialogs();
      await featItem.update({ 'system.uses.spent': 0 });
      owlDoc = liveOwl();
      await moveOwl(1);
      void caster.rollSkill({ skill: 'arc' });
      const dlg = await openDialog();
      const box = boxOf(dlg);
      ok('§10 the box offered with a tick while the Owl is empowered one square away', !!box && /Familiar Friend — 1 use/.test(textOf(box)) && !!tickOf(dlg), `box="${textOf(box).slice(0, 100)}" tick=${!!tickOf(dlg)}`);
      await closeDialogs();
    });

    // ---- 11. the temp HP gone: the revert, the re-point
    if (want(11) && liveOwl()) await section(11, async () => {
      await closeDialogs();
      const old = liveOwl();
      const { max: base } = await owlBaseHp();
      const combat = await Combat.create({ scene: canvas.scene.id, active: true, [`flags.${MOD}.suiteFamiliar`]: true });
      await combat.createEmbeddedDocuments('Combatant', [{ tokenId: old.id, actorId: old.actorId, sceneId: canvas.scene.id, initiative: 14 }]);
      await combat.startCombat();
      const transformMessage = game.messages.get(companionRecord()?.companion?.empower?.messageId) ?? null;
      await old.actor.update({ 'system.attributes.hp.temp': 0, 'system.attributes.hp.value': base + 2 * level - 1 });
      const ended = await until(() => transformMessage?.getFlag(MOD, 'transform')?.ended ? transformMessage.getFlag(MOD, 'transform').ended : null, { timeout: 20000 });
      await until(() => (liveOwl() && (liveOwl().id !== old.id)) ? true : null, { timeout: 10000 });
      // the revert's re-points (transforms.js repointEmpowered): the seat on the new token, the caster's effect and the empower mark gone
      await until(() => !!game.combat?.combatants?.find(c => c.tokenId === liveOwl()?.id) && !casterEffect() && !companionRecord()?.companion?.empower,
        { label: "§11 the seat re-pointed, the caster's effect and the empower mark gone" });
      const now = liveOwl();
      const hp = now?.actor?.system?.attributes?.hp ?? {};
      const seat = game.combat?.combatants?.find(c => c.tokenId === now?.id) ?? null;
      ok('§11a no temp HP left: the Owl reverts — a new token, not polymorphed, the Hit Points lost kept, no temp HP', (ended?.word === 'noTemp') && !!now && (now.id !== old.id) && !now.actor?.isPolymorphed
          && (Number(hp.value) === base + 2 * level - 1) && !(Number(hp.temp) > 0),
        JSON.stringify({ ended, newToken: now?.id, oldToken: old.id, poly: now?.actor?.isPolymorphed, hp }));
      ok('§11b its seat and the companion record follow the new token; the caster\'s effect is gone; the companion is no longer empowered',
        !!seat && (seat.tokenId === now?.id) && (companionRecord()?.landed?.[0]?.tokenId === now?.id) && !casterEffect() && !companionRecord()?.companion?.empower,
        JSON.stringify({ seat: seat?.tokenId, record: companionRecord()?.landed?.[0]?.tokenId, effect: !!casterEffect(), empower: companionRecord()?.companion?.empower }));
      // the revert's new token takes the world Owl's sight (off): the re-point puts the familiar's back
      const sight = await until(() => sees(liveOwl()) ? true : null, { timeout: 8000, label: '§11 the reverted Owl sees' }).catch(() => null);
      ok('§11c the reverted Owl\'s new token sees', !!sight, JSON.stringify(liveOwl()?._source?.sight ?? null));
      owlDoc = now;
      if (now && !madeTokens.includes(now.id)) madeTokens.push(now.id);
      await combat.delete();
    });

    // ---- 12. the lever: the caster's effect removed by hand
    if (want(12) && liveOwl()) await section(12, async () => {
      const old = liveOwl();
      const { message } = await empower('Stalker');
      const eff = casterEffect();
      ok('§12a empowered again: the caster\'s effect stands, the Owl polymorphed', !!eff && !!liveOwl()?.actor?.isPolymorphed, `effect=${eff?.name} poly=${liveOwl()?.actor?.isPolymorphed}`);
      await eff?.delete();
      const ended = await until(() => message?.getFlag(MOD, 'transform')?.ended ? message.getFlag(MOD, 'transform').ended : null, { timeout: 20000 });
      await until(() => (liveOwl() && (liveOwl().id !== old.id)) ? true : null, { timeout: 10000 });
      await until(() => !liveOwl()?.actor?.isPolymorphed && !casterEffect(), { label: "§12 the Owl reverted and the caster's effect gone" });
      const now = liveOwl();
      const { max: base2 } = await owlBaseHp();
      const hp2 = now?.actor?.system?.attributes?.hp ?? {};
      ok('§12b the effect removed by hand: the Owl reverts, the record ended', !!ended && !!now && !now.actor?.isPolymorphed && !casterEffect(), JSON.stringify({ ended, poly: now?.actor?.isPolymorphed, effect: !!casterEffect() }));
      ok(`§12c after the second cycle its Hit Points are still its own: ${base2 + 2 * level - 1} of ${base2 + 2 * level}, no temp folded in`,
        (Number(hp2.max) === base2 + 2 * level) && (Number(hp2.value) === base2 + 2 * level - 1) && !(Number(hp2.temp) > 0),
        JSON.stringify({ hp: hp2, deltaHp: now?.delta?.toObject?.()?.system?.attributes?.hp ?? null, tokenFlags: now?.flags?.dnd5e ?? null }));
      owlDoc = now;
      if (now && !madeTokens.includes(now.id)) madeTokens.push(now.id);
    });

    // ---- 14. the Help action: the Owl's button (before §7 puts the Owl away)
    if (want(14) && owlDoc) await section(14, async () => {
      await closeDialogs();
      await set('reminderList', 'buy, effect');
      const owl = owlDoc.actor ?? null;
      const help = owl?.items?.find(i => i.name === 'Help - Assist an Attack Roll') ?? null;
      const activity = help ? [...help.system.activities][0] : null;
      ok('§14a the landed Owl carries Help - Assist an Attack Roll — a feature with one Utility activity, an Action',
        !!help && (help.type === 'feat') && (activity?.type === 'utility') && (activity?.activation?.type === 'action'),
        `help=${!!help} type=${help?.type} activity=${activity?.type}/${activity?.activation?.type}`);
      if (!activity) return;
      // nothing targeted: refused before the dialog, no card
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      const before = game.messages.size;
      const refused = await activity.use({}, { configure: false }, { create: true }).catch(() => null);
      // ⚠ A window: a card the veto failed to stop lands within it.
      const stray = await watch(() => game.messages.size !== before, { ms: 600 });
      ok('§14b with nothing targeted the use is refused — no card', !stray && (game.messages.size === before) && !(refused?.message instanceof ChatMessage),
        `stray=${stray} messages ${before}→${game.messages.size}`);
      // the Sorcerer targeted, one square away: the use posts its card with the question
      await moveOwl(1);
      const casterPlaceable = canvas.tokens.get(casterToken.id);
      casterPlaceable.setTarget(true, { releaseOthers: true });
      const useHelp = async label => {
        const result = await activity.use({}, { configure: false }, { create: true });
        const message = result?.message instanceof ChatMessage ? result.message : null;
        if (message) madeMessages.push(message);
        const flag = await until(() => message?.getFlag(MOD, 'help')?.status === 'pending' ? message.getFlag(MOD, 'help') : null, { timeout: 6000, label });
        // the popup the latch opened on this client (the Owl's owner): the record is answered, never the popup
        await closeDialogs();
        return { message, flag };
      };
      const first = await useHelp('the Help card\'s record');
      ok('§14c the card carries the question: the Sorcerer at 5 ft, both assists open, Perception and Stealth to lend',
        (first.flag?.target?.uuid === caster.uuid) && (first.flag?.feet === 5) && (first.flag?.rows ?? []).every(r => !r.off)
          && (first.flag?.lends ?? []).some(l => l.key === 'prc') && (first.flag?.lends ?? []).some(l => l.key === 'ste'),
        JSON.stringify({ target: first.flag?.target, feet: first.flag?.feet, rows: first.flag?.rows, lends: (first.flag?.lends ?? []).map(l => l.key) }));
      // answered on the record: the check, lending Perception — the elect lands Assisted on the Sorcerer
      await first.message.setFlag(MOD, 'help', { ...first.flag, chosen: { facet: 'check', lend: { kind: 'skill', key: 'prc', label: 'Perception' } }, answeredAt: Date.now() });
      const landed = await until(() => first.message.getFlag(MOD, 'help')?.resolved ? first.message.getFlag(MOD, 'help') : null, { timeout: 10000, label: 'the Help record resolved' });
      const assisted = caster.effects.find(e => e.name === 'Assisted — Perception') ?? null;
      const receipt = first.message.getFlag(MOD, 'effectReceipt');
      ok('§14d "Assisted — Perception" lands on the Sorcerer, lending prc, stamped with the Owl as its source, receipted on the card',
        (landed?.resolved?.facet === 'check') && !!assisted && (assisted.getFlag(MOD, 'lends') === 'skill:prc') && (assisted.getFlag(MOD, 'sourceUuid') === owl.uuid)
          && (receipt?.targets ?? []).some(t => (t.uuid === caster.uuid) && (t.effects ?? []).some(e => e.id === assisted.id)),
        JSON.stringify({ resolved: landed?.resolved, assisted: assisted?.name, lends: assisted?.getFlag(MOD, 'lends'), source: assisted?.getFlag(MOD, 'sourceUuid'),
          receipt: (receipt?.targets ?? []).map(t => ({ uuid: t.uuid, effects: (t.effects ?? []).map(e => e.id) })) }));
      // the Perception check: the gate names it at Advantage, the default moves there; pressed, the effect is spent
      const beforeCheck = lastOf('check')?.id ?? null;
      void caster.rollSkill({ skill: 'prc' });
      const dlg = await until(rollDialog, { timeout: 6000, label: 'the Perception dialog' });
      await until(() => dlg.element?.querySelector('[data-bf-reminder]') ? true : null, { timeout: 3000, label: 'the check gate drawn' });
      const gateText = textOf(dlg.element?.querySelector('[data-bf-reminder]'));
      ok('§14e the Perception check\'s gate names Assisted — Perception, net Advantage, the default moved there',
        /Assisted — Perception/.test(gateText) && (netOf(dlg) === 'advantage') && (defaultOf(dlg) === 'advantage'),
        `gate="${gateText.slice(0, 140)}" net=${netOf(dlg)} default=${defaultOf(dlg)}`);
      press(dlg, 'advantage');
      const msg = await until(() => { const m = lastOf('check'); return (m && (m.id !== beforeCheck)) ? m : null; }, { timeout: 8000, label: 'the Perception check posted' });
      await until(() => assisted && caster.effects.get(assisted.id) ? null : true, { timeout: 6000, label: 'the Assisted effect spent' });
      const rec = msg?.getFlag(MOD, 'reminder');
      ok('§14f pressed: the check at Advantage, the record names the lend, the effect spent',
        (Number(msg?.rolls?.[0]?.options?.advantageMode) === 1) && (rec?.sources ?? []).some(s => /Assisted — Perception/.test(s.label) && (s.bend === 'advantage')) && !(assisted && caster.effects.get(assisted.id)),
        `mode=${msg?.rolls?.[0]?.options?.advantageMode} rec=${JSON.stringify(rec?.sources)} live=${!!(assisted && caster.effects.get(assisted.id))}`);
      void caster.rollSkill({ skill: 'prc' });
      const dlg2 = await until(rollDialog, { timeout: 6000, label: 'the second Perception dialog' });
      // ⚠ A window: a gate drawn for a spent effect lands within it.
      const gateAgain = await watch(() => !!dlg2.element?.querySelector('[data-bf-reminder]'), { ms: 600 });
      ok('§14g spent, a second Perception check meets no gate', !gateAgain, `gate=${gateAgain}`);
      await closeDialogs();
      // the attack facet, the Sorcerer standing in for the enemy: Distracted (Help) lands with the Owl as its source
      casterPlaceable.setTarget(true, { releaseOthers: true });
      const second = await useHelp('the second Help card\'s record');
      await second.message.setFlag(MOD, 'help', { ...second.flag, chosen: { facet: 'attack', lend: null }, answeredAt: Date.now() });
      const landed2 = await until(() => second.message.getFlag(MOD, 'help')?.resolved ? second.message.getFlag(MOD, 'help') : null, { timeout: 10000, label: 'the second Help record resolved' });
      const helped = caster.effects.find(e => e.name === 'Distracted (Help)') ?? null;
      ok('§14h Assist an Attack Roll: "Distracted (Help)" lands on the creature, stamped with the Owl as its source, no changes',
        (landed2?.resolved?.facet === 'attack') && !!helped && (helped.getFlag(MOD, 'sourceUuid') === owl.uuid) && !(helped.changes?.length),
        JSON.stringify({ resolved: landed2?.resolved, helped: helped?.name, source: helped?.getFlag(MOD, 'sourceUuid'), changes: helped?.changes?.length }));
      // three squares away: the attack row greyed with the distance, the check row open
      await moveOwl(3);
      casterPlaceable.setTarget(true, { releaseOthers: true });
      const third = await useHelp('the third Help card\'s record');
      const attackRow = third.flag?.rows?.find(r => r.key === 'attack') ?? null;
      ok('§14i three squares away: the attack row greyed "15 ft away — an enemy within 5 feet only", the check row open',
        (third.flag?.feet === 15) && /15 ft away — an enemy within 5 feet only/.test(attackRow?.off ?? '') && (third.flag?.rows ?? []).filter(r => r.key.startsWith('check')).every(r => !r.off),
        JSON.stringify({ feet: third.flag?.feet, rows: third.flag?.rows }));
      if (helped) await helped.delete();
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      await set('reminderList', 'buy');
      await moveOwl(1);
    });

    // ---- 7. in the pocket, then called back
    if (want(7) && landedMessage) await section(7, async () => {
      await closeDialogs();
      const flag = landedMessage.getFlag(MOD, 'summon');
      const patch = companionAsk(flag.companion, { kind: 'away' });
      if (patch) await landedMessage.setFlag(MOD, 'summon', { ...flag, companion: { ...flag.companion, ...patch } });
      const pocket = await until(() => landedMessage.getFlag(MOD, 'summon')?.companion?.state === 'pocket' ? true : null, { timeout: 15000 });
      ok('§7a put away: the companion waits in its pocket, its token gone', !!pocket && !canvas.scene.tokens.get(owlDoc?.id), `state=${landedMessage.getFlag(MOD, 'summon')?.companion?.state} token=${!!canvas.scene.tokens.get(owlDoc?.id)}`);
      void caster.rollSkill({ skill: 'arc' });
      const dlg = await openDialog();
      const box = boxOf(dlg);
      ok('§7b the box greyed "your familiar is in its pocket dimension", no tick', !!box && /your familiar is in its pocket dimension/.test(textOf(box)) && !tickOf(dlg),
        `box="${textOf(box).slice(0, 120)}" tick=${!!tickOf(dlg)}`);
      await closeDialogs();
      const inPocket = landedMessage.getFlag(MOD, 'summon');
      const recall = companionAsk(inPocket.companion, { kind: 'recall', placement: { x: casterToken.x + grid, y: casterToken.y, elevation: casterToken.elevation ?? 0, sceneId: canvas.scene.id } });
      if (recall) await landedMessage.setFlag(MOD, 'summon', { ...inPocket, companion: { ...inPocket.companion, ...recall } });
      const back = await until(() => (landedMessage.getFlag(MOD, 'summon')?.companion?.state === 'present') ? true : null, { timeout: 15000 });
      owlDoc = liveOwl();
      if (owlDoc && !madeTokens.includes(owlDoc.id)) madeTokens.push(owlDoc.id);
      ok('§7c called back: the companion stands again beside the caster', !!back && !!owlDoc, `state=${landedMessage.getFlag(MOD, 'summon')?.companion?.state} token=${!!owlDoc}`);
    });
    else if (want(7)) {
      results.push({ name: '§7 skipped — §1 landed nothing', pass: false, detail: '' });
    }

    // ---- 13. dismissed while empowered
    if (want(13) && liveOwl()) await section(13, async () => {
      await closeDialogs();
      const old = liveOwl();
      const { message } = await empower();
      const poly = !!liveOwl()?.actor?.isPolymorphed;
      await api.askDismiss(landedMessage);
      const dismissed = await until(() => landedMessage.getFlag(MOD, 'summon')?.dismissed ? true : null, { timeout: 15000 });
      // the dismissal stamps its record last (summons.js dismissSummon): the token, the effects and the ended record before it
      await until(() => !canvas.scene.tokens.get(old.id) && !casterEffect() && !caster.effects.some(e => e.getFlag(MOD, 'companion') === landedMessage.id)
        && message?.getFlag(MOD, 'transform')?.ended, { label: '§13 the token, the effects and the transform record ended' });
      const ended = message?.getFlag(MOD, 'transform')?.ended ?? null;
      ok('§13 Dismiss while empowered: the token goes, the caster\'s effect with it, the companion effect too, the record ended "gone"',
        poly && !!dismissed && !canvas.scene.tokens.get(old.id) && !casterEffect() && !caster.effects.some(e => e.getFlag(MOD, 'companion') === landedMessage.id) && (ended?.word === 'gone'),
        JSON.stringify({ poly, dismissed: !!dismissed, token: !!canvas.scene.tokens.get(old.id), effect: !!casterEffect(), ended }));
    });
  } catch (err) {
    results.push({ name: 'suite threw', pass: false, detail: `${err?.message}\n${err?.stack}` });
  } finally {
    await teardown();
  }
  return { results, log, skips };
}, sectionArg(plan, SECTIONS, { lend: LEND }));

/* --- §8: the player's own cast, Allow Summoning off ------------------------------------------------ */
if (!out.fatal && (!plan || plan.includes('8'))) {
  const gmSide = await f.evaluate(async () => {
    const was = game.settings.get('dnd5e', 'allowSummoning');
    if (was) await game.settings.set('dnd5e', 'allowSummoning', false);
    return { was };
  });
  let player = null;
  try {
    console.log('[familiar] player connecting…');
    player = new Foundry(playerConfig(env));
    await player.connect();
    await installPrelude(player);
    const cast = await player.evaluate(async ({ lend }) => {
      const MOD = 'fvtt-mod-bythebooks';
      const { until } = window.__btb;
      const mage = game.actors.getName('BTB Test Mage');
      if (!mage?.isOwner) return { fatal: `the player does not own BTB Test Mage (owner=${mage?.isOwner})` };
      for (const e of mage.effects.filter(e => /^Familiar:/.test(e.name))) { try { await e.delete({ [MOD]: { companionEnd: true } }); } catch { /* gone */ } }
      const lendFn = new Function('return ' + lend)();
      const lentOut = await lendFn({ casterName: mage.name });
      if (lentOut.fatal) return { fatal: lentOut.fatal };
      const spell = mage.items.get(lentOut.spellId);
      const forward = spell.system.activities.get('bfFreeCast000000');
      const tokensBefore = canvas.scene?.tokens?.size ?? 0;
      const result = await forward.use({ [MOD]: { toCard: true }, create: { measuredTemplate: false } }, { configure: false }, { create: true });
      const message = result?.message instanceof ChatMessage ? result.message : null;
      // soft: §8a reads the status, and the GM's teardown below needs this return's ids
      const flag = await until(() => message?.getFlag(MOD, 'summon')?.status === 'asked' ? message.getFlag(MOD, 'summon') : null, { timeout: 6000 }).catch(() => null);
      return { user: game.user.name, allowSummoning: game.settings.get('dnd5e', 'allowSummoning'), messageId: message?.id ?? null, status: flag?.status ?? null,
        spent: Number(mage.items.get(spell.id)?.system?.uses?.spent ?? -1), newTokens: (canvas.scene?.tokens?.size ?? 0) - tokensBefore,
        lent: [lentOut.featId, lentOut.spellId] };
    }, { lend: LEND });
    if (cast.fatal) out.results.push({ name: '§8 the player\'s cast', pass: false, detail: cast.fatal });
    else {
      out.results.push({ name: '§8a with Allow Summoning off, the player\'s free cast posts its card with the record asked and no token',
        pass: (cast.allowSummoning === false) && (cast.status === 'asked') && (cast.newTokens === 0),
        detail: `user=${cast.user} allowSummoning=${cast.allowSummoning} status=${cast.status} newTokens=${cast.newTokens}` });
      out.results.push({ name: '§8b the use is spent on the player\'s own sheet', pass: cast.spent === 1, detail: `spent=${cast.spent}` });
      // the GM tears the player's card and lent items down
      await f.evaluate(async ({ messageId, lent }) => {
        const mage = game.actors.getName('BTB Test Mage');
        const live = (mage?.items ?? []).filter(i => (lent ?? []).includes(i.id) || ((i.type === 'feat') && (i.name === 'Familiar Friend')) || ((i.type === 'spell') && (i.name === 'Find Familiar'))).map(i => i.id);
        if (live.length) await mage.deleteEmbeddedDocuments('Item', live);
        const m = game.messages.get(messageId);
        if (m) await m.delete();
      }, { messageId: cast.messageId, lent: cast.lent });
    }
  } catch (err) {
    out.results.push({ name: '§8 the player\'s cast', pass: false, detail: `${err?.message}` });
  } finally {
    if (player) await disposeSafely(player, 'familiar');
    await f.evaluate(async ({ was }) => { if (was) await game.settings.set('dnd5e', 'allowSummoning', was); }, { was: gmSide.was });
  }
}

await finish({ tag: 'familiar', out, plan, f });
