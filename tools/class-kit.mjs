/**
 * THE CLASSES KIT: the page setup every smoke-class-<class>.mjs suite shares (the fixtures lent and
 * placed, the settings pinned, the helpers, the teardown), installed as `window.__btbClasses` by
 * `runClassSuite` before the suite's own sections run, and torn down after them. Each class suite
 * keeps the section numbers and titles of the PHB classes plan (audits/plans/session-0-classes.md).
 *   KIT.leaveA3()   the A3 lends (Cutting Words, Guided Strike, Restore Balance) leave; before §13 on
 *   KIT.markA2()    the Victim's effects counted from here; where the A2 band (§28 on) begins
 *   KIT.dmgBand()   the DMG weapons' Victim; before the first of §115–§125
 * ⚠ `classKit` is serialized by `f.evaluate()`: it closes over nothing.
 */
import { sectionArg } from './harness.mjs';

/** The page side: the setup, every binding on `window.__btbClasses`. `sections` is the suite's plan. */
export const classKit = async ({ sections }) => {
  const { until, tokenOn, viewScene, snapshotSettings, faces, unrig } = window.__btb;
  // Whether the suite's plan holds a section: the bands set up only what a planned section needs.
  const planned = id => !sections || sections.includes(String(id));
  const KIT = {};
  window.__btbClasses = KIT;

  const MOD = 'fvtt-mod-bythebooks';
  const log = [];
  const suiteStart = Date.now();
  const errors = [];
  const realError = console.error;
  console.error = (...a) => { errors.push(a.map(x => (x?.stack ?? String(x))).join(' ').slice(0, 400)); realError(...a); };

  const modDoc = game.modules.get(MOD);
  if (!modDoc?.active) return { fatal: `module active=${modDoc?.active}` };
  const { INTERRUPT_ROLLS } = await import('/modules/fvtt-mod-bythebooks/scripts/decide/registry.js');
  if (!INTERRUPT_ROLLS['Cutting Words']) return { fatal: 'Cutting Words is not in the loaded code — OLD code (deploy --local, reload the box)' };

  const SETTING_KEYS = ['autoDamage', 'autoApply', 'playerRollDamage', 'damageTimer', 'dramaticBeat', 'requireTarget',
    'reactionHold', 'holdTimer', 'holdReveal', 'holdSkipFutile', 'holdApplyEffect', 'riders', 'effectRiders',
    'masteryRiders', 'masteryAsk', 'castApply', 'concMode', 'saveRolls'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { prior, set } = settings;

  const scene = game.scenes.getName('By the Books Test Range');
  const attacker = game.actors.getName('BTB Test Attacker');
  const halfling = game.actors.getName('BTB Test Halfling');
  const bard = game.actors.getName('BTB Test Bard');
  const sorcerer = game.actors.getName('BTB Test Sorcerer');
  const cleric = game.actors.getName('BTB Test Cleric');
  const pcAttacker = game.actors.getName('BTB Test PC Attacker');
  const victim = game.actors.getName('BTB Test Victim');
  if (!scene || !attacker || !halfling || !bard || !sorcerer || !cleric || !pcAttacker || !victim) return { fatal: 'missing fixture: the range, BTB Test Attacker, Halfling, Bard, Sorcerer, Cleric, PC Attacker or Victim — run tools/fixture-suite.mjs' };
  const divinity = () => cleric.items.find(i => (i.name === 'Channel Divinity') && (Number(i.system?.uses?.max) > 0));
  const divinitySpentBefore = Number(divinity()?.system?.uses?.spent ?? 0);
  const lucky = () => halfling.items.find(i => (i.name === 'Lucky') && (Number(i.system?.uses?.max) > 0));
  const inspiration = () => bard.items.find(i => (i.name === 'Bardic Inspiration') && (Number(i.system?.uses?.max) > 0));

  const created = { tokens: [], items: [], combats: [] };
  // The scene that was ACTIVE when the suite began: §25 activates the range for its ring and the teardown alone
  // restores this. ⚠ Never mid-run: re-activating another scene and viewing the range again REDRAWS the canvas, and
  // every Token placeable the sections hold (pcToken, halflingToken…) is destroyed — from there every control()
  // and setTarget() is a no-op, the attack has no target and is refused, and every later section reads nothing
  // (the §25 → §28 cascade, 2026-09-30: 44 reds, no module defect).
  KIT.priorActiveScene = null;
  const lentBy = new Map();
  const priorActor = {};
  let restored = false;
  const refillLuck = async () => { const l = lucky(); if (l) await l.update({ 'system.uses.spent': 0 }); };
  const spendLuck = async () => { const l = lucky(); if (l) await l.update({ 'system.uses.spent': Number(l.system.uses.max) }); };
  const inspirationSpentBefore = Number(inspiration()?.system?.uses?.spent ?? 0);
  const refillInspiration = async () => { const b = inspiration(); if (b) await b.update({ 'system.uses.spent': 0 }); };
  // ⚠ Never the UI singletons: a text match on "every rendered app" once closed the CHAT LOG (§16), and every card after read empty.
  const popups = () => [...foundry.applications.instances.values()].filter(app => app.rendered && !Object.entries(ui).some(([k, v]) => (k !== 'activeWindow') && (v === app)));
  const bystanderPopup = () => popups().find(app => app.element?.querySelector?.('[data-bf-ticks="bf-bystander"]')) ?? null;
  const rescuePopup = () => popups().find(app => app.element?.querySelector?.('[data-bf-ticks="bf-rescue"]')) ?? null;
  // A popup's answer (2026-10-14, the radios): tick the named row (a face "Portent|18", "pass", "mute-turn", "cast" …) and Apply; with no
  // name, the first row that is not a pass or a mute (unless one is already ticked). A popup that still carries its own button gets that.
  const pickApply = (pop, value = null) => {
    const el = pop?.element;
    if (!el) return false;
    const inputs = [...el.querySelectorAll('[data-bf-ticks] input')];
    let target = value ? (inputs.find(i => i.value === value) ?? null) : null;
    if (!value && inputs.length && !inputs.some(i => i.checked && !/^(pass|mute-)/.test(i.value))) target = inputs.find(i => !i.disabled && !/^(pass|mute-)/.test(i.value)) ?? null;
    if (target) { target.checked = true; target.dispatchEvent(new Event('change', { bubbles: true })); }
    const btn = (value && !target) ? (el.querySelector(`button[data-action="${value}"]`) ?? el.querySelector('button[data-action="answer"]')) : el.querySelector('button[data-action="answer"]');
    btn?.click();
    return !!btn;
  };
  // The damage hold's bystander popup (Cutting Words' damage half, 2026-10-14) and the newest damage hold card.
  const cutPopup = () => popups().find(app => /cut the damage\?/.test(app.element?.textContent ?? '') && app.element?.querySelector?.('input[value="cast"]')) ?? null;
  const damageHoldOf = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'damageHold')).pop() ?? null;
  const dropReactionChipsOn = async actor => {
    const ids = actor.effects.filter(e => e.getFlag(MOD, 'mastery') === 'reaction').map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids).catch(() => {});
  };
  const closeDialogs = async () => {
    for (const app of popups()) {
      if (app.element?.querySelector?.('[data-bf-ticks]') || /cut the damage\?/.test(app.element?.textContent ?? '')) { try { await app.close(); } catch { /* gone */ } }
    }
  };
  const dropMutes = async () => {
    for (const actor of [bard, sorcerer]) {
      const ids = actor.effects.filter(e => e.getFlag(MOD, 'bystanderMute')).map(e => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids).catch(() => {});
    }
  };
  const teardown = async () => {
    if (restored) return;
    restored = true;
    unrig();
    console.error = realError;
    if (errors.length) log.push(`console errors: ${JSON.stringify(errors.slice(0, 6))}`);
    for (const failed of await settings.restore()) log.push(`TEARDOWN settings ERROR: ${failed}`);
    try {
      await closeDialogs();
      for (const id of created.combats) { const c = game.combats.get(id); if (c) await c.delete(); }
      if (KIT.priorActiveScene && (game.scenes.active?.id !== KIT.priorActiveScene.id)) { await KIT.priorActiveScene.activate().catch(() => {}); await until(() => game.scenes.active?.id === KIT.priorActiveScene.id, { label: 'the prior scene active again' }).catch(() => null); }
      await dropMutes();
      await refillLuck();
      const b = inspiration(); if (b) await b.update({ 'system.uses.spent': inspirationSpentBefore });
      const cd = divinity(); if (cd) await cd.update({ 'system.uses.spent': divinitySpentBefore });
      for (const [actor, ids] of lentBy) {
        const live = ids.filter(id => actor.items.get(id));
        if (live.length) await actor.deleteEmbeddedDocuments('Item', live);
      }
      for (const actor of [bard, sorcerer, cleric, halfling, pcAttacker]) {
        const chips = actor.effects.filter(e => e.getFlag(MOD, 'mastery') === 'reaction').map(e => e.id);
        if (chips.length) await actor.deleteEmbeddedDocuments('ActiveEffect', chips).catch(() => {});
      }
      const liveTokens = created.tokens.filter(id => scene.tokens.get(id));
      if (liveTokens.length) await scene.deleteEmbeddedDocuments('Token', liveTokens);
      for (const [actorId, data] of Object.entries(priorActor)) await game.actors.get(actorId)?.update(data);
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      const mine = game.messages.filter(m => (m.timestamp >= suiteStart)
        && (m.speaker?.alias?.startsWith?.('BTB Test') || m.speaker?.alias === 'By the Books'
          || Object.keys(m.flags?.[MOD] ?? {}).length));
      if (mine.length) await ChatMessage.deleteDocuments(mine.map(m => m.id));
    } catch (err) {
      log.push(`TEARDOWN ERROR: ${err?.message}`);
    }
  };
  KIT.finish = async () => { await teardown(); return log; };
  try {
    await set('autoDamage', 'all');
    await set('autoApply', true);
    await set('playerRollDamage', false);
    await set('damageTimer', 0);
    await set('dramaticBeat', 0);
    await set('requireTarget', false);
    await set('reactionHold', true);
    await set('holdTimer', 0);
    await set('holdReveal', true);
    await set('holdSkipFutile', false);
    await set('holdApplyEffect', true);
    await set('riders', false);
    await set('effectRiders', false);
    await set('masteryRiders', false);
    await set('masteryAsk', false);
    await set('castApply', false);
    await set('concMode', 'off');
    for (const c of game.combats.filter(c => c.scene?.id === scene.id)) await c.delete();

    // ---- fixtures: the pack's own features, lent by name
    const findPHB = async (name, type) => {
      for (const pack of game.packs.filter(p => (p.metadata.packageName === 'dnd-players-handbook') && (p.documentName === 'Item'))) {
        const hit = (await pack.getIndex({ fields: ['type'] })).find(e => (e.name === name) && (e.type === type));
        if (hit) return pack.getDocument(hit._id);
      }
      return null;
    };
    const lend = async (actor, name) => {
      const source = await findPHB(name, 'feat');
      if (!source) throw new Error(`the PHB ships no feat "${name}" this box can find`);
      const [item] = await actor.createEmbeddedDocuments('Item', [source.toObject()]);
      lentBy.set(actor, [...(lentBy.get(actor) ?? []), item.id]);
      return item;
    };
    await lend(bard, 'Cutting Words');
    await lend(cleric, 'Guided Strike');
    // BTB Test Cleric carries no Channel Divinity: the pack's, with two uses (the pool Guided Strike spends).
    if (!divinity()) {
      const cd = await lend(cleric, 'Channel Divinity');
      await cd.update({ 'system.uses.max': '2', 'system.uses.spent': 0 });
    }
    const balance = await lend(sorcerer, 'Restore Balance');
    await balance.update({ 'system.uses.spent': 0 });
    await refillInspiration();

    await viewScene(scene);
    const strays = scene.tokens.filter(t => t.actorLink && [attacker.id, halfling.id, bard.id, sorcerer.id, cleric.id, pcAttacker.id, victim.id].includes(t.actorId)).map(t => t.id);
    if (strays.length) await scene.deleteEmbeddedDocuments('Token', strays);
    const placeToken = async (actor, x, y, disposition) => {
      const [doc] = await scene.createEmbeddedDocuments('Token', [
        foundry.utils.mergeObject(actor.prototypeToken.toObject(), { x, y, actorId: actor.id, actorLink: true, disposition }, { inplace: false })]);
      created.tokens.push(doc.id);
      const token = await tokenOn(doc.id, { label: `${actor.name}'s token on the canvas` });
      return { doc, token };
    };
    const { token: attackerToken, doc: attackerDoc } = await placeToken(attacker, 1400, 2100, -1);
    const { token: halflingToken, doc: halflingDoc } = await placeToken(halfling, 1500, 2100, 1);
    ({ doc: KIT.bardDoc } = await placeToken(bard, 1700, 2100, 1));
    const { doc: sorcererDoc } = await placeToken(sorcerer, 1800, 2100, 1);
    // The miss side, one row north: the PC attacker, its target, the Cleric 10 ft from the attacker.
    const { token: pcToken } = await placeToken(pcAttacker, 1400, 1900, 1);
    const { token: victimToken } = await placeToken(victim, 1500, 1900, -1);
    const { token: clericToken } = await placeToken(cleric, 1600, 1900, 1);

    // ---- helpers
    const textOf = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    /** A roll dialog's gate is drawn: its section stands, or the gate has nothing to draw. */
    const gateDrawn = app => until(() => {
      const g = app?.options?.bfReminder ?? app?.options?.bfSaveGate ?? app?.options?.bfCheckGate;
      return !app || !g || !((g.sources?.length > 0) || g.sneak) || app.element?.querySelector('[data-bf-reminder]');
    }, { label: 'the gate drawn in the roll dialog' });
    const cardEl = id => document.querySelector(`.message[data-message-id="${id}"]`);
    const cardText = id => textOf(cardEl(id));
    const weapon = attacker.items.find(i => (i.type === 'weapon') && i.system.activities?.some?.(a => a.type === 'attack'));
    if (!weapon) return { fatal: 'BTB Test Attacker has no weapon attack' };
    const act = () => attacker.items.get(weapon.id).system.activities.find(a => a.type === 'attack');
    faces([[10, 20]]);
    const probe = await act().rollAttack({}, { configure: false }, { create: false });
    const atkMod = Number(probe?.[0]?.total) - Number(probe?.[0]?.d20?.total);
    if (!Number.isFinite(atkMod)) return { fatal: `could not measure the attacker's modifier (${probe?.[0]?.total})` };
    const AC = atkMod + 10;
    priorActor[halfling.id] = {
      'system.attributes.ac.override': halfling.system._source.attributes.ac.override ?? null,
      'system.attributes.hp.value': halfling.system._source.attributes.hp.value,
      'system.attributes.hp.max': halfling.system._source.attributes.hp.max
    };
    await halfling.update({ 'system.attributes.ac.override': AC, 'system.attributes.hp.max': 400, 'system.attributes.hp.value': 400 });
    const healFull = () => halfling.update({ 'system.attributes.hp.value': 400, 'system.attributes.hp.temp': 0 });
    const damageFor = id => game.messages.contents.find(m => (m.type === 'damage') && (m.getFlag(MOD, 'attackFor') === id));
    // ⚠ Each await is named: a throw here is otherwise a bare server message with no client stack (2026-10-14).
    const step = async (what, fn) => { try { return await fn(); } catch (err) { err.message = `${what}: ${err.message}`; throw err; } };
    const swing = async ({ d20 = [12], dmg = 3, advantage = false } = {}) => {
      await step('swing/heal', healFull);
      attackerToken.control({ releaseOthers: true });
      halflingToken.setTarget(true, { releaseOthers: true });
      faces([...d20.map(n => [n, 20]), [dmg, 6], [dmg, 6]]);
      const usage = await step('swing/use', () => act().use({ subsequentActions: false }, { configure: false }, {}));
      const rolls = await step('swing/rollAttack', () => act().rollAttack(advantage ? { advantage: true } : {}, { configure: false },
        usage?.message?.id ? { data: { 'system.origin': usage.message.id } } : {}));
      const msg = rolls?.[0]?.parent ?? null;
      // A miss stamps no hold and rolls no damage: the caller reads what came.
      await until(() => msg?.getFlag(MOD, 'hold') || damageFor(msg?.id), { timeout: 4000 }).catch(() => null);
      return msg;
    };
    const holdOf = msg => game.messages.get(msg?.id)?.getFlag(MOD, 'hold') ?? null;
    const resolvedTarget = async msg => {
      const h = await until(() => (holdOf(msg)?.status === 'resolved') ? holdOf(msg) : null, { timeout: 12000 }).catch(() => null);
      return h?.targets?.find(x => x.uuid === halfling.uuid) ?? null;
    };
    const hp = () => Number(halfling.system.attributes.hp.value);
    const spentBI = () => Number(inspiration()?.system?.uses?.spent ?? 0);

    // ---- the miss side: a friendly attacker, a hostile target
    const weaponOf = actor => actor.items.find(i => (i.type === 'weapon') && i.system.activities?.some?.(a => a.type === 'attack'));
    const pcWeapon = weaponOf(pcAttacker);
    let clericWeapon = weaponOf(cleric);
    if (!clericWeapon) {
      const mace = await findPHB('Mace', 'weapon');
      if (mace) { const data = mace.toObject(); data.system.equipped = true; [clericWeapon] = await cleric.createEmbeddedDocuments('Item', [data]); lentBy.set(cleric, [...(lentBy.get(cleric) ?? []), clericWeapon.id]); }
    }
    const attackOf = (actor, w) => actor.items.get(w.id).system.activities.find(a => a.type === 'attack');
    const modOf = async (actor, w) => {
      faces([[10, 20]]);
      const p = await attackOf(actor, w).rollAttack({}, { configure: false }, { create: false });
      return Number(p?.[0]?.total) - Number(p?.[0]?.d20?.total);
    };
    const missSide = (planned(7) || planned(8) || planned(9)) && pcWeapon && clericWeapon;
    if ((planned(7) || planned(8) || planned(9)) && !missSide) log.push(`miss side skipped: pcWeapon=${!!pcWeapon} clericWeapon=${!!clericWeapon}`);
    KIT.VAC = null;
    if (missSide) {
      priorActor[victim.id] = {
        'system.attributes.ac.override': victim.system._source.attributes.ac.override ?? null,
        'system.attributes.hp.value': victim.system._source.attributes.hp.value,
        'system.attributes.hp.max': victim.system._source.attributes.hp.max
      };
      await victim.update({ 'system.attributes.hp.max': 400, 'system.attributes.hp.value': 400 });
    }
    const vhp = () => Number(victim.system.attributes.hp.value);
    const swingAt = async (actor, token, w, { d20 = [3], dmg = 3, disadvantage = false } = {}) => {
      await victim.update({ 'system.attributes.hp.value': 400, 'system.attributes.hp.temp': 0 });
      token.control({ releaseOthers: true });
      victimToken.setTarget(true, { releaseOthers: true });
      faces([...d20.map(n => [n, 20]), [dmg, 6], [dmg, 6], [dmg, 6]]);
      const a = attackOf(actor, w);
      const usage = await a.use({ subsequentActions: false }, { configure: false }, {});
      const rolls = await a.rollAttack(disadvantage ? { disadvantage: true } : {}, { configure: false },
        usage?.message?.id ? { data: { 'system.origin': usage.message.id } } : {});
      const msg = rolls?.[0]?.parent ?? null;
      await until(() => msg?.getFlag(MOD, 'hold'), { timeout: 4000 }).catch(() => null);   // a miss no reaction can turn stamps none
      return msg;
    };
    const missTarget = async msg => {
      const h = await until(() => (holdOf(msg)?.status === 'resolved') ? holdOf(msg) : null, { timeout: 12000 }).catch(() => null);
      return h?.targets?.find(x => x.uuid === victim.uuid) ?? null;
    };
    const popupTitled = re => popups().find(app => app.element?.querySelector?.('[data-bf-ticks="bf-bystander"]') && re.test(textOf(app.element))) ?? null;
    const refillDivinity = async () => { const cd = divinity(); if (cd) await cd.update({ 'system.uses.spent': 0 }); };
    const rollPopup = re => popups().find(app => app.element?.querySelector?.('[data-bf-ticks="bf-bystander-roll"]') && re.test(textOf(app.element))) ?? null;
    // The rest's stored dice are the bearer's to roll (2026-10-14): the rest card's ask, its Roll pressed; the chip follows.
    const rollStoredAsk = async (re = /roll your .* dice/i) => {
      const pop = await until(() => popups().find(app => re.test(textOf(app.element)) && app.element?.querySelector?.('button[data-action="roll"]')) ?? null, { timeout: 8000 }).catch(() => null);
      pop?.element?.querySelector('button[data-action="roll"]')?.click();
      return !!pop;
    };
    const rollFlag = m => game.messages.get(m?.id)?.getFlag(MOD, 'bystanderRoll') ?? null;


    // ================================================ §A1 — the PHB classes' band-A rows (RULINGS *The PHB classes — A1*)
    // Each section lends what it needs and takes it back (`unlend`); the A3 lends leave first, so no bystander fires.
    const unlend = async (actor, item) => {
      const id = item?.id ?? item;
      if (!id) return;
      if (actor.items.get(id)) await actor.deleteEmbeddedDocuments('Item', [id]).catch(() => {});
      lentBy.set(actor, (lentBy.get(actor) ?? []).filter(x => x !== id));
    };
    // The A3 lends leave before the band-A rows (13 on): no bystander fires there.
    KIT.leaveA3 = async () => {
      await closeDialogs();
      for (const [actor, name] of [[bard, 'Cutting Words'], [cleric, 'Guided Strike'], [sorcerer, 'Restore Balance']]) {
        for (const it of actor.items.filter(i => (i.name === name) && (lentBy.get(actor) ?? []).includes(i.id))) await unlend(actor, it);
      }
    };
    // ---- A1 hold helpers (§13, §14, §16)
    const dropReactionChips = async actor => {
      const ids = actor.effects.filter(e => e.getFlag(MOD, 'mastery') === 'reaction').map(e => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids).catch(() => {});
    };
    const reactionChipOn = actor => actor.effects.find(e => e.getFlag(MOD, 'mastery') === 'reaction') ?? null;
    const titleOf = app => String(app?.title ?? app?.options?.window?.title ?? '');
    // Glorious Defense's strike popup carries no tick rows: found by its title / its question.
    const strikePopup = () => popups().find(app => /strike back/.test(titleOf(app)) || /Strike .+ with .+\?/.test(textOf(app.element))) ?? null;
    // Deflect Attacks: the Halfling's rescue popup (Lucky rides beside, greyed) or, without a roll row, the maneuver popup.
    const deflectPopup = () => rescuePopup()
      ?? popups().find(app => app.element?.querySelector?.('button[data-action="cast"]') && /Deflect Attacks/.test(textOf(app.element))) ?? null;
    const answerDeflect = async pop => {
      const box = [...(pop?.element?.querySelectorAll?.('input[name="bf-rescue"]') ?? [])].find(b => b.value === 'Deflect Attacks');
      if (box) {
        if (!box.checked) box.click();
        pickApply(pop);
      } else pop?.element?.querySelector('button[data-action="cast"]')?.click();
    };
    // ---- A1 helpers: the damage offer, the clock riders, Hew's reminders (§15, §17–§20)
    const { riderPartFormula } = await import('/modules/fvtt-mod-bythebooks/scripts/decide/clock.js');
    const reEsc = s => String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const OFFER = 'Damage — your roll';
    const offerApp = before => popups().find(app => !before.has(app) && (app.element?.innerHTML ?? '').includes(OFFER)) ?? null;
    const closeOffers = async () => {   // ⚠ closing an offer ROLLS it (its X is not a veto) — only at a section's end
      for (const app of popups()) if ((app.element?.innerHTML ?? '').includes(OFFER)) { try { await app.close(); } catch { /* gone */ } }
    };
    /** Once per section: the Victim hittable (AC 1) with 400 max HP; its originals recorded for the teardown. */
    const a1Victim = async () => {
      priorActor[victim.id] = {
        'system.attributes.ac.override': victim.system._source.attributes.ac.override ?? null,
        'system.attributes.hp.value': victim.system._source.attributes.hp.value,
        'system.attributes.hp.max': victim.system._source.attributes.hp.max,
        'system.traits.size': victim.system._source.traits?.size ?? 'med',
        ...(priorActor[victim.id] ?? {})   // an earlier record (the miss side's) holds the ORIGINALS: it wins
      };
      await victim.update({ 'system.attributes.ac.override': 1, 'system.attributes.hp.max': 400 });
    };
    /** `actor` hits the Victim (d20 19, AC 1; `d20: 20` a Critical Hit) with `activity`, the Victim set to `hpTo` first. A
     * spell skips the usage card (a volley's use() would open the aim — the rider rides the attack roll alone). Returns the
     * attack message and the NEW damage offer, or null when none opens within `offerWait`. */
    const a1Hit = async (_actor, token, activity, { hpTo = 400, offerWait = 4000, d20 = 19 } = {}) => {
      await victim.update({ 'system.attributes.hp.value': hpTo, 'system.attributes.hp.temp': 0 });
      token.control({ releaseOthers: true });
      victimToken.setTarget(true, { releaseOthers: true });
      const before = new Set(popups());
      faces([[d20, 20], [d20, 20], [3, 6]]);   // a second d20 if the gate adds Advantage (Reckless); assert flags, not faces
      const usage = (activity.item?.type === 'spell') ? null : await activity.use({ subsequentActions: false }, { configure: false }, {});
      const rolls = await activity.rollAttack({}, { configure: false }, usage?.message?.id ? { data: { 'system.origin': usage.message.id } } : {});
      const msg = rolls?.[0]?.parent ?? null;
      const offer = await until(() => offerApp(before), { timeout: offerWait }).catch(() => null);
      return { msg, offer };
    };
    const a1Damage = msg => until(() => { const d = damageFor(msg?.id); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 }).catch(() => null);
    const a1Roll = async (msg, offer) => {
      offer?.element?.querySelector('button[data-action="roll"]')?.click();
      return a1Damage(msg);
    };
    const ridersOf = d => d?.getFlag(MOD, 'clockRiders')?.riders ?? [];
    const riderRow = (offer, key) => textOf(offer?.element?.querySelector(`[data-bf-rider-row="${key}"]`));
    const riderBox = (offer, key) => offer?.element?.querySelector(`input[name="bf-rider"][value="${key}"]`) ?? null;
    /** A rider row's formula as clock-riders.js reads it: the activity's first part, resolved on the attacker. */
    const a1Formula = (item, activityName, actor) => {
      const act = item?.system?.activities?.find?.(a => a.name === activityName) ?? null;
      const p = act?.damage?.parts?.[0];
      const raw = p ? riderPartFormula({ number: p.number, denomination: p.denomination, custom: p.custom, bonus: p.bonus }) : null;
      let formula = null;
      try { const r = raw ? Roll.replaceFormulaData(raw, actor.getRollData()) : null; formula = (r && Roll.validate(r)) ? r : null; } catch { formula = null; }
      return { act, raw, formula };
    };
    const hewNotices = (since, label) => game.messages.contents.filter(m => (m.timestamp >= since) && (m.getFlag(MOD, 'hewNotice')?.label === label));
    const hewPopup = label => popups().find(app => (app.element?.innerHTML ?? '').includes(`${label} — `) && app.element?.querySelector?.('button[data-action="ok"]')) ?? null;
    const ackHew = async label => {
      for (let i = 0; i < 3; i++) {
        const p = hewPopup(label);
        if (!p) return;
        p.element.querySelector('button[data-action="ok"]')?.click();
        await until(() => hewPopup(label) !== p, { timeout: 3000 }).catch(() => null);
      }
    };
    const riderChits = actor => actor.effects.filter(e => e.getFlag(MOD, 'mastery') === 'rider').map(e => e.id);
    const dropEffects = async (actor, ids) => { const live = ids.filter(id => actor.effects.get(id)); if (live.length) await actor.deleteEmbeddedDocuments('ActiveEffect', live).catch(() => {}); };
    // ---- A1 heal-group helpers (§21–23)
    // Keep an actor's SOURCE values for teardown; an earlier section's record wins (it holds the true originals).
    const hgKeep = (actor, data) => { priorActor[actor.id] = { ...data, ...(priorActor[actor.id] ?? {}) }; };
    // Lend a PHB item of any type, its compendium source stamped (dnd5e resolves a consumption target by it); null if absent.
    const hgLend = async (actor, name, type, patch = null) => {
      const source = await findPHB(name, type);
      if (!source) { log.push(`the PHB ships no ${type} "${name}" this box can find`); return null; }
      const data = source.toObject();
      foundry.utils.setProperty(data, '_stats.compendiumSource', source.uuid);
      const [item] = await actor.createEmbeddedDocuments('Item', [data]);
      lentBy.set(actor, [...(lentBy.get(actor) ?? []), item.id]);
      if (patch) await item.update(patch);
      return actor.items.get(item.id);
    };
    // Close the moment popups by window title (they carry no [data-bf-ticks] marker, so closeDialogs misses them).
    const hgClose = async re => {
      for (const app of popups()) if (re.test(app.title ?? app.options?.window?.title ?? '')) { try { await app.close(); } catch { /* gone */ } }
    };
    // A sure hit (natural 20) by anyone at any token, the damage auto-rolled and applied; the attack message back.
    const hgStrike = async (actor, token, w, targetToken) => {
      token.control({ releaseOthers: true });
      targetToken.setTarget(true, { releaseOthers: true });
      faces([[20, 20], [20, 20], [4, 6]]);
      const a = attackOf(actor, w);
      const usage = await a.use({ subsequentActions: false }, { configure: false }, {});
      const rolls = await a.rollAttack({}, { configure: false },
        usage?.message?.id ? { data: { 'system.origin': usage.message.id } } : {});
      return rolls?.[0]?.parent ?? null;
    };
    // an effect choice is radios and Apply (DESIGN *Cards*): the option ticked, then Apply
      const hgPickButton = (label => { const input = [...document.querySelectorAll('.application.dialog input[name="bf-effect-pick"]')].find(i => textOf(i.closest('label')) === label); if (!input) return null; return { click: () => { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); input.closest('.application')?.querySelector('button[data-action="apply"]')?.click(); } }; });
    // ---- A1 §24–§27 helpers (the Rage, the gate, the dialogs)
    const clearTargets = () => game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
    const actNamed = (item, name = null) => [...(item?.system?.activities ?? [])].find(a => !name || (a.name === name)) ?? null;
    // A feature's activity used as its bearer, aimed at the bearer's own token (a self activity ignores it; a
    // targeted one gets the bearer). No consumption: the lends sit on sheets with no Barbarian levels.
    const useFeature = async (token, item, name = null) => {
      token.control({ releaseOthers: true });
      token.setTarget(true, { releaseOthers: true });
      const r = await actNamed(item, name)?.use({ consume: { resources: false, action: false, spellSlot: false }, subsequentActions: false }, { configure: false }, {});
      clearTargets();
      return r?.message ?? null;
    };
    const fxNamed = (actor, names) => actor.effects.filter(e => names.includes(e.name));
    const dropFx = async (actor, names) => {
      const ids = fxNamed(actor, names).map(e => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids).catch(() => {});
    };
    const rollDialog = () => [...foundry.applications.instances.values()]
      .find(app => /RollConfigurationDialog/.test(app.constructor?.name ?? '') && app.rendered && app.element) ?? null;
    // The roll dialogs, the pick popups and the d20 fold's rescue windows — none carry [data-bf-ticks].
    const closeA1 = async () => {
      for (const app of [...foundry.applications.instances.values()]) {
        const ours = /RollConfigurationDialog/.test(app.constructor?.name ?? '')
          || app.element?.querySelector?.('[data-bf-rescue-row], button[data-action^="pick-"], input[name="bf-effect-pick"]');
        if (ours) { try { await app.close(); } catch { /* gone */ } }
      }
      await closeDialogs();
    };
    // The attack gate as `actorToken` attacks `targetToken` with `activity` (smoke-emanations' gateAt): the text
    // and the net, the dialog closed unrolled.
    const gateFor = async (actorToken, activity, targetToken) => {
      actorToken.control({ releaseOthers: true });
      clearTargets();
      targetToken.setTarget(true, { releaseOthers: true });
      const p = activity?.rollAttack({}, {}, {});
      const app = await until(rollDialog, { timeout: 6000 }).catch(() => null);
      await gateDrawn(app);
      const text = textOf(app?.element?.querySelector('[data-bf-reminder]'));
      const net = app?.options?.bfReminder?.net ?? null;
      try { await app?.close(); } catch { /* gone */ }
      await Promise.resolve(p).catch(() => {});
      return { text, net, open: !!app };
    };
    // The Victim's HP/AC recorded once (the miss side records it when §7–9 ran).
    const victimPrior = () => {
      if (priorActor[victim.id]) return;
      priorActor[victim.id] = {
        'system.attributes.ac.override': victim.system._source.attributes.ac.override ?? null,
        'system.attributes.hp.value': victim.system._source.attributes.hp.value,
        'system.attributes.hp.max': victim.system._source.attributes.hp.max
      };
    };
    const RAGE_FX = ['Rage', 'Rage of the Wolf'];

    // ================================================ §A2 — the hit menu's Monk and Psi Warrior groups (RULINGS *The PHB classes — A2*)
    const hitBox = (offer, key) => offer?.element?.querySelector(`input[name="bf-hit"][value="${key}"]`) ?? null;
    const hitRow = (offer, key) => textOf(offer?.element?.querySelector(`[data-bf-hit-row="${key}"]`));
    const hitRows = offer => [...(offer?.element?.querySelectorAll('[data-bf-hit-row]') ?? [])].map(r => r.dataset.bfHitRow);
    const groupText = (offer, key) => textOf(offer?.element?.querySelector(`div[data-bf-hit-group="${key}"]`));
    // A tick's change handler redraws inside the click.
    const tick = async (offer, ...keys) => { for (const k of keys) hitBox(offer, k)?.click(); };
    const saveCardFor = (key, since) => game.messages.contents.find(m => (m.timestamp >= since) && (m.getFlag(MOD, 'hitManeuverCard')?.key === key)) ?? null;
    const outcomeOn = card => card?.getFlag(MOD, 'saves')?.targets?.find(t => t.uuid === victim.uuid)?.outcome ?? null;
    const settledSave = (key, since) => until(() => { const c = saveCardFor(key, since); return outcomeOn(c) ? c : null; }, { timeout: 12000 }).catch(() => null);
    const typesOf = d => (d?.rolls ?? []).flatMap(r => [...(r.options?.types ?? []), r.options?.type].filter(Boolean));
    /** The PHB's Unarmed Strike weapon on BTB Test PC Attacker (taken back at teardown). */
    const lendUnarmed = async () => {
      const src = await fromUuid('Compendium.dnd-players-handbook.equipment.Item.phbUnarmedStrike');
      if (!src) return null;
      const [us] = await pcAttacker.createEmbeddedDocuments('Item', [src.toObject()]);
      lentBy.set(pcAttacker, [...(lentBy.get(pcAttacker) ?? []), us.id]);
      return us;
    };
    /** A lent copy's damage part pinned to `formula` (the fixture has no Monk / Psi Warrior scale — §17's shape). */
    const pinPart = async (item, act, formula) => {
      const parts = act.toObject().damage.parts;
      parts[0].custom = { enabled: true, formula };
      await item.update({ [`system.activities.${act.id}.damage.parts`]: parts });
    };
    const vfx = { base: new Set(victim.effects.map(e => e.id)) };
    // The A2 rows count the Victim's effects from here: re-taken where the A2 band begins.
    KIT.markA2 = () => { vfx.base = new Set(victim.effects.map(e => e.id)); };
    const victimFx = () => victim.effects.filter(e => !vfx.base.has(e.id));
    const dropVictimFx = async () => { const ids = victimFx().map(e => e.id); if (ids.length) await victim.deleteEmbeddedDocuments('ActiveEffect', ids).catch(() => {}); };
    const a2Combat = async () => {
      const [c] = await Combat.createDocuments([{ scene: scene.id, active: true }]);
      created.combats.push(c.id);
      await c.createEmbeddedDocuments('Combatant', [
        { tokenId: pcToken.document.id, sceneId: scene.id, actorId: pcAttacker.id, initiative: 20 },
        { tokenId: victimToken.document.id, sceneId: scene.id, actorId: victim.id, initiative: 10 }]);
      await c.startCombat();
      await until(() => c.started, { label: 'the A2 combat started' });
      return c;
    };

    // ================================================ §A4 — the healing seam and the caster's rows (RULINGS *The PHB classes — A4*)
    const a4Card = (since, test) => game.messages.contents.find(m => (m.timestamp >= since) && test(m)) ?? null;

    // ================================================ §A6 — the grants on Initiative and at the turn (RULINGS *The PHB classes — A6*)
    // A healing activity's custom formula pinned on the lent copy (the fixtures carry no class scales or levels).
    const pinHeal = async (item, name, formula) => {
      const a = actNamed(item, name);
      if (a) await item.update({ [`system.activities.${a.id}.healing.custom`]: { enabled: true, formula } });
    };
    const grantCards = (actor, row) => game.messages.contents.filter(m => (m.timestamp >= suiteStart)
      && (m.getFlag(MOD, 'initiativeGrant')?.actorUuid === actor.uuid) && (m.getFlag(MOD, 'initiativeGrant')?.row === row));
    const grantLine = async m => (await until(() => cardEl(m?.id)?.querySelector('.bf-initiative-grant-line'), { timeout: 5000 }).catch(() => null))?.textContent?.trim() ?? '';
    const titled = re => popups().find(app => re.test(titleOf(app))) ?? null;

    // ================================================ §A7 — the cast riders and Portent (RULINGS *The PHB classes — A7*)
    const castSpell = async (actor, token, spell, level = 1, target = null) => {
      (target ?? token)?.setTarget(true, { releaseOthers: true });
      const a = actor.items.get(spell?.id)?.system?.activities?.contents?.[0] ?? null;
      const r = await a?.use({ spell: { slot: `spell${level}` }, subsequentActions: false }, { configure: false }, {});
      clearTargets();
      return r?.message ?? null;
    };
    const surgeLineOf = async card => (await until(() => cardEl(card?.id)?.querySelector('.bf-surge-line'), { timeout: 6000 }).catch(() => null))?.textContent?.trim() ?? '';

    // ================================================ §B4 — band B rows on tables that exist (RULINGS *The PHB classes — B4*)
    const b4Card = (since, key) => game.messages.contents.find(m => (m.timestamp >= since) && m.getFlag(MOD, key)) ?? null;
    const b4Cards = (since, key) => game.messages.contents.filter(m => (m.timestamp >= since) && m.getFlag(MOD, key));
    const styleFlag = m => m?.getFlag(MOD, 'fightingStyle') ?? null;
    const abilityMod = (actor, ab) => Number(actor.system?.abilities?.[ab]?.mod ?? 0);
    /** A spell lent to `actor` as that class's own, prepared, cast from a slot. */
    const lendClassSpell = async (actor, name, cls, patch = {}) => hgLend(actor, name, 'spell', { 'system.prepared': 1, 'system.method': 'spell', 'system.sourceItem': `class:${cls}`, ...patch });
    /** A spell's damage rolled at `targetToken` (or nobody), the dice pinned; the damage message. */
    const spellDamage = async (actor, spell, targetToken = null, pins = [[3, 8], [3, 8], [3, 10], [3, 10]]) => {
      clearTargets();
      targetToken?.setTarget(true, { releaseOthers: true });
      const a = actor.items.get(spell?.id)?.system?.activities?.find(x => x.damage?.parts?.length) ?? null;
      faces(pins);
      const rolls = await a?.rollDamage({}, { configure: false }, {});
      unrig();
      clearTargets();
      return rolls?.[0]?.parent ?? null;
    };
    // A carrier the core toggle cannot clear (a non-canonical id) leaves the status standing: the caller reads it.
    const statusOn = async (actor, status, active) => { await actor.toggleStatusEffect(status, { active }); await until(() => !!actor.statuses?.has?.(status) === !!active, { timeout: 2000 }).catch(() => null); };
    const hasStatus = (actor, status) => !!actor.statuses?.has?.(status);

    // ================================================ §C1 — the band-C rows (RULINGS *The PHB classes — C1*)
    /** Lucky spent whatever its maximum reads (a formula maximum hides it from `lucky()`): no rescue hold on the drops. */
    const spendLuckC = async () => { for (const l of halfling.items.filter(i => i.name === 'Lucky')) await l.update({ 'system.uses.spent': 9 }); };
    const refillLuckC = async () => { for (const l of halfling.items.filter(i => i.name === 'Lucky')) await l.update({ 'system.uses.spent': 0 }); };
    const c1Cards = (since, key) => game.messages.contents.filter(m => (m.timestamp >= since) && m.getFlag(MOD, key));
    const sorcTokC = () => canvas.tokens.placeables.find(t => t.actor?.id === sorcerer.id) ?? null;
    const bardTokC = () => canvas.tokens.get(KIT.bardDoc.id) ?? null;
    const dropCards = (since, row) => c1Cards(since, 'dropToOne').filter(m => m.getFlag(MOD, 'dropToOne')?.row === row);
    /** The Attacker's hit on the Halfling at `hpTo` Hit Points (its damage 12: two dice at 6), the face queue continuing with `more`. */
    const dropHalfling = async (hpTo, more = []) => {
      await halfling.update({ 'system.attributes.hp.value': hpTo, 'system.attributes.hp.temp': 0 });
      attackerToken.control({ releaseOthers: true });
      halflingToken.setTarget(true, { releaseOthers: true });
      faces([[19, 20], [6, 6], ...more]);   // one damage die: the goblin's weapon
      const usage = await act().use({ subsequentActions: false }, { configure: false }, {});
      const rolls = await act().rollAttack({}, { configure: false }, usage?.message?.id ? { data: { 'system.origin': usage.message.id } } : {});
      const m = rolls?.[0]?.parent ?? null;
      const d = await a1Damage(m);
      log.push(`dropHalfling: total=${rolls?.[0]?.total} ac=${halfling.system.attributes.ac.value} hits=${JSON.stringify(m?.getFlag(MOD, 'hold')?.targets?.map(t => [t.verdict, t.reaction]) ?? null)} damage=${!!damageFor(m?.id)} receipt=${JSON.stringify(d?.getFlag(MOD, 'receipt')?.targets?.map(t => [t.name, t.taken]) ?? null)} hp=${hp()} max=${halfling.system.attributes.hp.max}`);
      return m;
    };
    /** A hit by `actor` at `targetToken` with `activity` (d20 19), the damage offer back when it opens. */
    const hitAt = async (token, activity, targetToken, { hpTo = null, actor = null } = {}) => {
      if (hpTo !== null && actor) await actor.update({ 'system.attributes.hp.value': hpTo, 'system.attributes.hp.temp': 0 });
      token.control({ releaseOthers: true });
      targetToken.setTarget(true, { releaseOthers: true });
      const before = new Set(popups());
      faces([[19, 20], [19, 20], [3, 6]]);
      const usage = (activity.item?.type === 'spell') ? null : await activity.use({ subsequentActions: false }, { configure: false }, {});
      const rolls = await activity.rollAttack({}, { configure: false }, usage?.message?.id ? { data: { 'system.origin': usage.message.id } } : {});
      const msg = rolls?.[0]?.parent ?? null;
      const offer = await until(() => offerApp(before), { timeout: 4000 }).catch(() => null);   // opens only when a part is due
      return { msg, offer };
    };
    const rescueWindowC = text => [...document.querySelectorAll('.application')].find(el => el.querySelector('[data-bf-rescue-row]') && (el.textContent ?? '').includes(text)) ?? null;
    const clearDown = async actor => { for (const e of actor.effects.filter(e => ['Dead', 'Unconscious'].includes(e.name))) await e.delete().catch(() => {}); };
    /** An effect of `name` written on `actor`, its origin `origin` (a mark placed by another creature's item). */
    const markOn = async (actor, name, origin, statuses = []) => {
      const [e] = await actor.createEmbeddedDocuments('ActiveEffect', [{ name, img: 'icons/svg/aura.svg', origin, transfer: false, disabled: false, statuses }]);
      return e;
    };
    const dropNamed = async (actor, names) => { const ids = actor.effects.filter(e => names.includes(e.name)).map(e => e.id); if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids).catch(() => {}); };
    const activateRange = async () => {
      const priorActive = game.scenes.active ?? null;
      if (priorActive?.id !== scene.id) {
        KIT.priorActiveScene = KIT.priorActiveScene ?? priorActive;
        await scene.activate();
        await until(() => (game.scenes.active?.id === scene.id) && canvas.ready && (canvas.scene?.id === scene.id), { label: 'the range active and drawn' });
      }
    };
    const backToRange = async () => {
      await viewScene(scene);
    };
    const regionKeyed = (key, tokenId) => scene.regions.find(r => { const fl = r.getFlag(MOD, 'emanation'); return (fl?.kind === 'feature') && (fl.key === key) && (fl.tokenId === tokenId); }) ?? null;

    // ================================================ D1 — the PHB classes, band D (RULINGS *The PHB classes — D1*)
    const d1Cards = (since, key) => game.messages.contents.filter(m => (m.timestamp >= since) && m.getFlag(MOD, key));
    const d1Combat = async (rows) => {
      const [combat] = await Combat.createDocuments([{ scene: scene.id, active: true }]);
      created.combats.push(combat.id);
      await combat.createEmbeddedDocuments('Combatant', rows.map(([tok, actor, initiative]) => ({ tokenId: tok.document?.id ?? tok.id, sceneId: scene.id, actorId: actor.id, initiative })));
      return combat;
    };
    const d1Region = (key, tokenId) => scene.regions.find(r => { const fl = r.getFlag(MOD, 'emanation'); return (fl?.kind === 'feature') && (fl.key === key) && (fl.tokenId === tokenId); }) ?? null;

    // ================================================ THE DMG — the worn items (audits/plans/dmg-build.md §2)
    const dmgLend = async (actor, id, patch = {}) => {
      const src = await fromUuid(`Compendium.dnd-dungeon-masters-guide.equipment.Item.${id}`);
      if (!src) { log.push(`the DMG ships no item ${id} this box can find`); return null; }
      const data = src.toObject();
      foundry.utils.setProperty(data, '_stats.compendiumSource', src.uuid);
      const [it] = await actor.createEmbeddedDocuments('Item', [data]);
      lentBy.set(actor, [...(lentBy.get(actor) ?? []), it.id]);
      const worn = (it.type === 'feat') ? {} : { 'system.equipped': true, 'system.attuned': true };
      await it.update({ ...worn, ...patch });
      return actor.items.get(it.id);
    };
    // A save the Attacker's Sacred Flame demands of `who` (its token `tok`): the dialog's section text and net, closed unrolled.
    const dmgSaveGate = async (who, tok) => {
      let lent = null;
      let flameId = attacker.items.find(i => (i.name === 'Sacred Flame') && (i.type === 'spell'))?.id;
      if (!flameId) { lent = await hgLend(attacker, 'Sacred Flame', 'spell', { 'system.prepared': 1, 'system.method': 'atwill' }); flameId = lent?.id; }
      const flameAct = attacker.items.get(flameId)?.system?.activities?.find(a => a.type === 'save');
      attackerToken.control({ releaseOthers: true });
      tok.setTarget(true, { releaseOthers: true });
      const use = await flameAct.use({ consume: { spellSlot: false } }, { configure: false }, {});
      const card = use?.message ?? null;
      await until(() => card?.getFlag(MOD, 'saves'), { timeout: 6000 }).catch(() => null);
      const p = who.rollSavingThrow({ ability: 'dex' }, {}, {});
      let settled = false;
      Promise.resolve(p).catch(() => {}).finally(() => { settled = true; });
      const dlg = await until(rollDialog, { timeout: 6000 }).catch(() => null);
      await gateDrawn(dlg);
      const text = textOf(dlg?.element?.querySelector('[data-bf-reminder]'));
      const net = dlg?.options?.bfSaveGate?.net ?? null;
      try { await dlg?.close(); } catch { /* gone */ }
      await until(() => settled, { timeout: 3000 }).catch(() => null);   // the closed dialog's roll, when it settles
      await hgClose(/Saving Throw/);
      clearTargets();
      if (lent) await unlend(attacker, lent);
      return { open: !!dlg, text, net };
    };

    // ==== THE DMG — the crit riders and the enchanted weapons (§115–§125) ====
    // The template's enchantment dropped on a PHB weapon the way the item sheet does it (the riders come along), then attuned.
    const dmgEnchant = async (actor, templateId, baseId, { profiles = null } = {}) => {
      const template = await fromUuid(`Compendium.dnd-dungeon-masters-guide.equipment.Item.${templateId}`);
      const base = await fromUuid(`Compendium.dnd-players-handbook.equipment.Item.${baseId}`);
      if (!template || !base) { log.push(`no template ${templateId} or base ${baseId} on this box`); return null; }
      const [w] = await actor.createEmbeddedDocuments('Item', [base.toObject()]);
      lentBy.set(actor, [...(lentBy.get(actor) ?? []), w.id]);
      const enchant = template.system.activities.getByType('enchant')[0];
      const all = enchant?.effects ?? [];
      const picked = profiles ? all.filter(pr => profiles.includes(template.effects.get(pr._id)?.name)) : all.slice(0, 1);
      for (const pr of picked) {
        const effect = template.effects.get(pr._id);
        const data = effect.toObject();
        data.system.origin.item ??= template.uuid;
        if (effect.system.isOnActivity) data.transfer = true;
        await ActiveEffect.create(data, { parent: actor.items.get(w.id), keepOrigin: true, dnd5e: { enchantmentProfile: effect.id, activityId: enchant.id } });
      }
      await until(() => (actor.items.get(w.id)?.effects?.filter(e => e.isAppliedEnchantment).length ?? 0) >= picked.length, { timeout: 2000, label: 'the enchantment applied' }).catch(() => null);
      await actor.items.get(w.id).update({ 'system.equipped': true, 'system.attuned': true });
      return actor.items.get(w.id);
    };
    // One attack by the PC Attacker at the Victim with the d20 pinned to `face`; `after` pins the dice that follow (a save's).
    const dmgHit = async (weapon, face, { hpTo = 400, after = null, target = null } = {}) => {
      await victim.update({ 'system.attributes.hp.value': hpTo, 'system.attributes.hp.temp': 0 });
      pcToken.control({ releaseOthers: true });
      (target ?? victimToken).setTarget(true, { releaseOthers: true });
      const before = new Set(popups());
      faces([[face, 20], [face, 20]]);
      const act = weapon.system.activities.find(a => a.type === 'attack');
      const usage = await act.use({ subsequentActions: false }, { configure: false }, {});
      const rolls = await act.rollAttack({}, { configure: false }, usage?.message?.id ? { data: { 'system.origin': usage.message.id } } : {});
      if (after) faces(after); else unrig();
      const msg = rolls?.[0]?.parent ?? null;
      const offer = await until(() => offerApp(before), { timeout: 2500 }).catch(() => null);   // opens only when a part is due
      offer?.element?.querySelector('button[data-action="roll"]')?.click();
      // A miss rolls no damage: the caller reads what came. What lands after the receipt is the caller's to wait for.
      const dmg = await until(() => damageFor(msg?.id) ?? null, { timeout: 12000 }).catch(() => null);
      await until(() => dmg?.getFlag(MOD, 'receipt'), { timeout: 10000 }).catch(() => null);
      return { msg, dmg, offer };
    };
    const dmgKeys = d => (d?.getFlag(MOD, 'clockRiders')?.riders ?? []).map(r => r.key);
    const alwaysLine = d => textOf(cardEl(d?.id)?.querySelector?.('.bf-rider-always'));
    const dmgCard = (activityName, since) => game.messages.contents.find(m => (m.timestamp >= since) && m.getFlag(MOD, 'saves') && (m.getAssociatedActivity?.()?.name === activityName)) ?? null;
    const outcomeOfCard = c => c?.getFlag(MOD, 'saves')?.targets?.find(t => t.uuid === victim.uuid)?.outcome ?? null;
    const typeNow = () => foundry.utils.deepClone(victim.system._source.details?.type ?? {});
    // The DMG weapons' victim (115–125), set before the first of them.
    KIT.dmgBand = async () => { if ([115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125].some(n => planned(n))) {
      hgKeep(victim, { 'system.details.type': typeNow(), 'system.attributes.exhaustion': victim.system._source.attributes?.exhaustion ?? 0,
        'system.traits.dr.value': [...(victim.system._source.traits?.dr?.value ?? [])] });
      hgKeep(pcAttacker, { 'system.attributes.hp.temp': pcAttacker.system._source.attributes?.hp?.temp ?? 0 });
      await a1Victim();   // AC 1 and a 400 max: a set HP never clamps
    } };
    const victimAs = async (value, subtype = '') => victim.update({ 'system.details.type.value': value, 'system.details.type.subtype': subtype });

    KIT.finish = async () => {
      try { await refillLuckC(); } catch { /* the teardown restores the rest */ }
      await teardown();
      return log;
    };
    Object.assign(KIT, { MOD, log, suiteStart, errors, realError, modDoc, INTERRUPT_ROLLS, SETTING_KEYS, prior, set, scene, attacker, halfling, bard, sorcerer, cleric, pcAttacker, victim, divinity, divinitySpentBefore, lucky, inspiration, created, lentBy, priorActor, restored, refillLuck, spendLuck, inspirationSpentBefore, refillInspiration, popups, bystanderPopup, rescuePopup, pickApply, cutPopup, damageHoldOf, dropReactionChipsOn, closeDialogs, dropMutes, teardown, findPHB, lend, balance, strays, placeToken, attackerToken, attackerDoc, halflingToken, halflingDoc, sorcererDoc, pcToken, victimToken, clericToken, textOf, cardEl, cardText, weapon, act, probe, atkMod, AC, healFull, damageFor, step, swing, holdOf, resolvedTarget, hp, spentBI, weaponOf, pcWeapon, clericWeapon, attackOf, modOf, missSide, vhp, swingAt, missTarget, popupTitled, refillDivinity, rollPopup, rollStoredAsk, rollFlag, unlend, dropReactionChips, reactionChipOn, titleOf, strikePopup, deflectPopup, answerDeflect, riderPartFormula, reEsc, OFFER, offerApp, closeOffers, a1Victim, a1Hit, a1Damage, a1Roll, ridersOf, riderRow, riderBox, a1Formula, hewNotices, hewPopup, ackHew, riderChits, dropEffects, hgKeep, hgLend, hgClose, hgStrike, hgPickButton, clearTargets, actNamed, useFeature, fxNamed, dropFx, rollDialog, closeA1, gateFor, victimPrior, RAGE_FX, hitBox, hitRow, hitRows, groupText, tick, saveCardFor, outcomeOn, settledSave, typesOf, lendUnarmed, pinPart, victimFx, dropVictimFx, a2Combat, a4Card, pinHeal, grantCards, grantLine, titled, castSpell, surgeLineOf, b4Card, b4Cards, styleFlag, abilityMod, lendClassSpell, spellDamage, statusOn, hasStatus, spendLuckC, refillLuckC, c1Cards, sorcTokC, bardTokC, dropCards, dropHalfling, hitAt, rescueWindowC, clearDown, markOn, dropNamed, activateRange, backToRange, regionKeyed, d1Cards, d1Combat, d1Region, dmgLend, dmgSaveGate, dmgEnchant, dmgHit, dmgKeys, alwaysLine, dmgCard, outcomeOfCard, typeNow, victimAs, gateDrawn, settings });
    return { log };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, log };
  }
};

/**
 * Run one class suite's `body` (an evaluate function of `{ sections, titles }`) between the kit's
 * setup and its teardown; the teardown runs whatever happened, and its log is the run's.
 */
export async function runClassSuite(f, { plan, sections, body }) {
  let out = null;
  try {
    const setup = await f.evaluate(classKit, { sections: plan ?? Object.keys(sections) });
    if (setup?.fatal) out = { fatal: setup.fatal, results: [], log: setup.log ?? [] };
    else out = await f.evaluate(body, sectionArg(plan, sections));
  } finally {
    const log = await f.evaluate(async () => (window.__btbClasses?.finish ? window.__btbClasses.finish() : null), null)
      .catch(err => [`TEARDOWN ERROR: ${err?.message ?? err}`]);
    if (out && Array.isArray(log)) out.log = log;
  }
  return out;
}
