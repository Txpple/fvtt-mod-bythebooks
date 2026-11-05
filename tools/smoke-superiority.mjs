// Battle Master maneuvers smoke suite: Parry as a damage interrupt that REDUCES by a roll, the four
// Bonus Action uses (Evasive Footwork, Bait and Switch, Lunging Attack, Feinting Attack), Ambush and
// Tactical Assessment as scoped d20 folds, Commander's Strike as a notice and a chip, and Rally as
// the platform's own heal.
// Fixtures: BTB Test Fighter (Battle Master 5), BTB Test Ranger, BTB Test Attacker; the maneuvers come
// from the 2024 PHB pack for the run. Everything it writes is restored or removed.
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from './harness.mjs';

// The coverage map (tools/coverage-map.mjs) parses this; ⚠ never import a suite (it connects on evaluation).
export const COVERS = [
  'superiority-uses.js',    // §2-§5 — the four Bonus Action uses
  'command.js',             // §9 — Commander's Strike, the notice and the chip
  'd20-folds.js',           // §7 / §8 / §11 — Ambush and Tactical Assessment as scoped folds, armed
  'hold/index.js',          // §1 — Parry as a DAMAGE hold, answered and reduced
  'hold/trigger.js',
  'hold/answer.js',
  'hold/continue.js',
  'hold/lookup.js',         // §1 / §12 — the reduction row found, its voice stamped (Stone's Endurance)
  'hold/views.js',          // §12 — the popup and the card in the row's voice
  'cast.js',                // §6 — Rally's temp HP through cast.js
  'reminders.js',           // §2 — the Feinting marker read by the attack gate
  'chip-spend.js'           // §2 / §3 / §9 — the marker and the chips spent by the roll
];

const SECTIONS = {
  1: 'Parry: the goblin hits the fighter — a DAMAGE hold (not the Monster Manual\'s AC Parry), the answer rolls die + modifier in the open, the damage lands REDUCED with the receipt saying so, the pool and the Reaction spent',
  2: 'Feinting Attack: the pack\'s marker on the goblin with the fighter as source; the fighter\'s attack gate reads it as Advantage; the die rides the hit and the marker is spent; the Ranger\'s gate never reads it',
  3: 'Lunging Attack: a chip until the end of the turn; the next melee hit\'s offer carries the die as a TICKED checkbox; ticked it rides and the chip goes; unticked nothing rides',
  4: 'Evasive Footwork: the die rolled in the open, the number on the fighter\'s AC until the start of the next turn (a chip)',
  5: 'Bait and Switch: the die rolled; a popup asks who gains the AC; the Ranger picked wears the pack\'s own "Baited AC +N"',
  6: 'Rally: NOTHING built — the pack\'s heal activity rolls through the system\'s own dialog and the cast slice lands the temp HP on the ally',
  7: 'Ambush / Tactical Assessment: a Stealth check offers Ambush (and not Tactical Assessment); a History check the reverse; Athletics neither; accepting spends the die and patches the total',
  8: 'Ambush on Initiative: the initiative roll offers Ambush; accepting moves the combatant\'s initiative by the die',
  9: 'Commander\'s Strike (2026-09-05, no driven attack): the fighter directs the Ranger; the elect puts a chip carrying the fighter\'s die on the Ranger; the Ranger\'s owner gets an OK-only notice; the Ranger\'s OWN attack carries the die, the chip and the Reaction spent, the card records the strike',
  10: 'the registration FIRED (§11): dnd5e.rollInitiative and dnd5e.rollSkill moved',
  11: 'ARMED from the sheet (2026-09-05): Tactical Assessment used before the check rolls the die in the open, chips the number on the fighter, tells the player which check to make, and the next History/Investigation/Insight check folds it in with no ask (an Athletics check leaves it); Ambush the same on Initiative',
  12: 'Stone\'s Endurance (Slice A, 2026-09-24): the goblin hits the Goliath — Parry\'s reduction hold in the Reaction voice; the answer rolls 1d12 + CON in the open, the damage lands REDUCED, the trait\'s OWN use is spent, the Goliath is NOT healed, and no maneuver moment is published'
};
const DEPENDS = {};

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'superiority', watchdogMs: 900_000 });
announcePlan('superiority', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, watch, canvasReady, tokenOn, snapshotSettings, faces, unrig } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const suiteStart = Date.now();
  // Every moment published during the run (events.js): plain facts, uuids, never documents.
  const moments = [];
  const momentHookId = Hooks.on('bythebooks.moment', p => moments.push(p));
  const momentsOf = (event, since = 0) => moments.filter(p => (p.event === event) && (p.at >= since));
  const plain = p => { try { return JSON.stringify(p) === JSON.stringify(JSON.parse(JSON.stringify(p))); } catch { return false; } };
  const ledger = globalThis.__bfHookLedger ?? null;
  const count = name => ledger?.[name] ?? 0;
  const errors = [];
  const origError = console.error;
  console.error = (...args) => { errors.push('E ' + args.map(a => (a instanceof Error) ? a.message : String(a)).join(' ').slice(0, 300)); origError(...args); };

  const mod = game.modules.get(MOD);
  if (!mod?.active) return { fatal: `module active=${mod?.active}` };
  if (!game.settings.settings.has(`${MOD}.decisionTimer`)) return { fatal: 'decisionTimer not registered — OLD code (deploy --local, reload)' };

  // The list settings are gone (the tables are the only list): every row is live for the run.
  const SETTING_KEYS = ['autoDamage', 'autoApply', 'playerRollDamage', 'damageTimer', 'dramaticBeat', 'requireTarget',
    'reactionHold', 'holdTimer', 'holdReveal', 'holdSkipFutile', 'riders', 'effectRiders', 'masteryRiders', 'masteryAsk',
    'saves', 'castApply', 'concMode', 'd20FoldAsk', 'emanations'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { set } = settings;

  const scene = game.scenes.getName('By the Books Test Range');
  const fighter = game.actors.getName('BTB Test Fighter');
  const ranger = game.actors.getName('BTB Test Ranger');
  const goblin = game.actors.getName('BTB Test Attacker');
  if (!scene || !fighter || !ranger || !goblin) return { fatal: 'missing fixture: scene, BTB Test Fighter, BTB Test Ranger or BTB Test Attacker — run tools/fixture-suite.mjs' };
  const pool = fighter.items.find(i => i.name === 'Combat Superiority');
  const sword = fighter.items.find(i => (i.type === 'weapon') && (i.name === 'Greataxe'))
    ?? fighter.items.find(i => (i.type === 'weapon') && (i.name === 'Longsword'))
    ?? fighter.items.find(i => (i.type === 'weapon') && i.system.equipped && (i.system.attack?.type?.value !== 'ranged'));
  const goblinMelee = goblin.items.find(i => (i.type === 'weapon') && i.system.activities?.some?.(a => (a.type === 'attack') && (a.attack?.type?.value === 'melee')));
  const rangerSword = ranger.items.find(i => (i.type === 'weapon') && (i.name === 'Longsword'));
  if (!pool || !sword || !goblinMelee || !rangerSword) return { fatal: 'the fixtures lack Combat Superiority, a fighter weapon, a goblin melee weapon or the Ranger\'s Longsword' };

  const created = { items: [], tokens: [] };
  const priorActor = {};
  let combat = null;
  let restored = false;
  const priorPoolSpent = pool.system._source.uses?.spent ?? 0;
  const refill = () => pool.update({ 'system.uses.spent': 0 });
  const poolLeft = () => fighter.items.get(pool.id)?.system.uses?.value ?? -1;
  const clearChips = async () => {
    for (const a of [fighter, ranger, goblin]) {
      const fx = a.effects.filter(e => e.getFlag(MOD, 'mastery') || e.getFlag(MOD, 'applied') || /^(Feinting Attack|Lunging Attack|Evasive Footwork|Baited AC|Reaction — used)/.test(e.name));
      const live = fx.map(e => e.id).filter(id => a.effects.get(id));
      if (live.length) await a.deleteEmbeddedDocuments('ActiveEffect', live).catch(() => {});
    }
  };
  const closeDialogs = async () => {
    for (const app of foundry.applications.instances.values()) {
      const ours = app.element?.querySelector?.('[data-bf-reminder], [data-bf-save-demand], [data-bf-hit], [data-bf-riders]')
        || /RollConfigurationDialog|DialogV2/.test(app.constructor?.name ?? '');
      if (ours) { try { await app.close(); } catch { /* gone */ } }
    }
  };
  const teardown = async () => {
    if (restored) return;
    restored = true;
    console.error = origError;
    for (const e of errors) log.push('console: ' + e);
    unrig();
    for (const failed of await settings.restore()) log.push(`TEARDOWN settings ERROR: ${failed}`);
    try {
      await closeDialogs();
      try { if (combat && game.combats.get(combat.id)) await combat.delete(); } catch { /* gone */ }
      await clearChips();
      const live = created.items.filter(id => fighter.items.get(id));
      if (live.length) await fighter.deleteEmbeddedDocuments('Item', live);
      await pool.update({ 'system.uses.spent': priorPoolSpent });
      const liveTokens = created.tokens.filter(id => scene.tokens.get(id));
      if (liveTokens.length) await scene.deleteEmbeddedDocuments('Token', liveTokens);
      for (const [actorId, data] of Object.entries(priorActor)) await game.actors.get(actorId)?.update(data);
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      const mine = game.messages.filter(m => (m.timestamp >= suiteStart)
        && (m.speaker?.alias?.startsWith?.('BTB Test') || m.speaker?.alias === 'By the Books' || Object.keys(m.flags?.[MOD] ?? {}).length || m.getFlag('core', 'initiativeRoll')));
      if (mine.length) await ChatMessage.deleteDocuments(mine.map(m => m.id));
    } catch (err) {
      log.push(`TEARDOWN ERROR: ${err?.message}`);
    }
  };

  try {
    await set('autoDamage', 'all');
    await set('autoApply', true);
    await set('playerRollDamage', false);
    await set('damageTimer', 0);
    await set('dramaticBeat', 0);
    await set('requireTarget', false);
    await set('reactionHold', true);          // Parry
    await set('holdTimer', 0);
    await set('holdReveal', true);
    await set('holdSkipFutile', false);
    await set('riders', false);
    await set('effectRiders', false);
    await set('masteryRiders', true);          // the chip spend (Feinting's marker) lives in the mastery machine
    await set('masteryAsk', 'auto');
    await set('saves', false);
    await set('castApply', true);              // Rally
    await set('concMode', 'off');
    await set('d20FoldAsk', true);
    await set('emanations', false);
    // ⚠ Every table row is live: the fighter's Great Weapon Fighting floors every die at 3 (a rider
    // die reads 1d8min3), the fighter's other d20 resources ride the checks' offers beside the
    // maneuvers, and the Ranger's Dreadful Strike opens the damage offer on its hit.
    const SUP_DIE = /^1d8(min3)?$/;

    // ---- fixtures
    const MANEUVERS = ['Parry', 'Feinting Attack', 'Lunging Attack', 'Evasive Footwork', 'Bait and Switch', 'Rally', 'Ambush', 'Tactical Assessment', "Commander's Strike"];
    const pack = game.packs.get('dnd-players-handbook.classes');
    if (!pack) return { fatal: 'the 2024 PHB classes pack is not in this world' };
    const index = await pack.getIndex();
    // ⚠ Fresh copies every run: a killed run leaves spent or edited maneuvers behind. The Fighter
    // carries none of these names natively, so the sweep touches only this suite's leftovers.
    {
      const stale = fighter.items.filter(i => (i.type === 'feat') && MANEUVERS.includes(i.name)).map(i => i.id);
      if (stale.length) { await fighter.deleteEmbeddedDocuments('Item', stale); log.push(`swept ${stale.length} stale maneuver item(s) a previous run left`); }
    }
    const add = [];
    for (const name of MANEUVERS) {
      const hit = index.find(e => e.name === name);
      if (!hit) return { fatal: `${name} not in the PHB pack` };
      const data = (await pack.getDocument(hit._id)).toObject();
      delete data._id;
      add.push(data);
    }
    if (add.length) {
      const docs = await fighter.createEmbeddedDocuments('Item', add);
      created.items.push(...docs.map(d => d.id));
      log.push(`gave the fighter ${docs.map(d => d.name).join(', ')} for the run`);
    }
    await refill();
    const feat = name => fighter.items.find(i => (i.type === 'feat') && (i.name === name));
    const actOf = (item, name) => [...(item?.system?.activities ?? [])].find(a => a.name === name);
    log.push(`pool: ${poolLeft()} superiority dice; weapon: ${sword.name}`);

    if (canvas.scene?.id !== scene.id) await scene.view();
    await canvasReady();
    // LINKED strays only: never the shared unlinked tokens.
    const strays = scene.tokens.filter(t => t.actorLink && [fighter.id, ranger.id, goblin.id].includes(t.actorId)).map(t => t.id);
    if (strays.length) await scene.deleteEmbeddedDocuments('Token', strays);
    const placeToken = async (actor, x, y) => {
      const [doc] = await scene.createEmbeddedDocuments('Token', [
        foundry.utils.mergeObject(actor.prototypeToken.toObject(), { x, y, actorId: actor.id, actorLink: true, hidden: false }, { inplace: false })]);
      created.tokens.push(doc.id);
      await tokenOn(doc.id);
      const token = canvas.tokens.get(doc.id);
      if (!token) throw new Error(`${actor.name}'s token never reached the canvas`);
      return { doc, token };
    };
    const { doc: fighterDoc, token: fighterToken } = await placeToken(fighter, 1500, 1200);
    const { doc: goblinDoc, token: goblinToken } = await placeToken(goblin, 1400, 1200);   // 5 ft left of the fighter
    const { token: rangerToken } = await placeToken(ranger, 1500, 1300);   // 5 ft below the fighter

    for (const a of [fighter, ranger, goblin]) {
      priorActor[a.id] = {
        'system.attributes.hp.value': a.system._source.attributes.hp.value,
        'system.attributes.hp.max': a.system._source.attributes.hp.max,
        'system.attributes.hp.temp': a.system._source.attributes.hp.temp ?? 0
      };
      await a.update({ 'system.attributes.hp.max': 400, 'system.attributes.hp.value': 400, 'system.attributes.hp.temp': 0 });
    }
    priorActor[goblin.id]['system.attributes.ac.override'] = goblin.system._source.attributes.ac.override ?? null;
    await goblin.update({ 'system.attributes.ac.override': 1 });
    const healFull = async () => { for (const a of [fighter, ranger, goblin]) await a.update({ 'system.attributes.hp.value': 400, 'system.attributes.hp.temp': 0 }); };

    // ---- helpers
    const face = (n, of = 20) => faces([[n, of]]);
    const target = token => token.setTarget(true, { releaseOthers: true });
    const targeted = token => until(() => game.user.targets.has(token), { timeout: 2000, label: `${token.name} targeted` });
    // The gate is set at preRoll; the fieldset is drawn at render only when it has sources or a Sneak Attack.
    const gateDrawn = app => until(() => {
      const g = app?.options?.bfReminder;
      return !app || !g || !((g.sources?.length > 0) || g.sneak) || app.element?.querySelector('[data-bf-reminder]');
    }, { label: 'the gate drawn in the roll dialog' });
    const textOf = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const cardText = id => textOf(document.querySelector(`.message[data-message-id="${id}"]`));
    const attackOf = item => item.system.activities.find(a => a.type === 'attack');
    const damageFor = originId => game.messages.contents.find(m => (m.type === 'damage')
      && (m._source.system?.origin === originId));
    // ⚠ Rendered only: a closing offer stays registered, and on the page, through its close transition.
    const offerEl = () => [...foundry.applications.instances.values()].filter(a => a.rendered).map(a => a.element)
      .find(el => (el?.innerHTML ?? '').includes('Damage — your roll')) ?? null;
    const rollDialog = () => [...foundry.applications.instances.values()]
      .find(app => /RollConfigurationDialog/.test(app.constructor?.name ?? '') && app.rendered && app.element && !app.element.querySelector('[data-bf-save-demand]')) ?? null;
    // ⚠ A POPUP, never the sidebar: the chat log is an application carrying every card's text.
    const dialogWith = text => [...foundry.applications.instances.values()]
      .find(app => app.rendered && !/ChatLog|Sidebar|Tab/.test(app.constructor?.name ?? '') && (app.element?.innerHTML ?? '').includes(text)) ?? null;
    // The rescue window's rows are `[data-bf-rescue-action]` elements, not dialog buttons.
    const rescueWindow = text => [...document.querySelectorAll('.application')]
      .find(el => el.querySelector('[data-bf-rescue-row]') && (el.textContent ?? '').includes(text)) ?? null;
    const lastAttack = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && (m.type === 'attack')).pop() ?? null;
    /** A programmatic hit (no dialog) by `actor` with `weapon` at `victimToken`. */
    const swing = async (_actor, actorToken, weapon, victimToken, { d20 = 19 } = {}) => {
      actorToken.control({ releaseOthers: true });
      target(victimToken);
      await targeted(victimToken);
      face(d20);
      const act = attackOf(weapon);
      const results = await act.use({ subsequentActions: false }, { configure: false }, {});
      const rolls = await act.rollAttack({}, { configure: false }, results?.message?.id ? { data: { 'system.origin': results.message.id } } : {});
      const msg = rolls?.[0]?.parent ?? null;
      return { msg, originId: msg?._source.system?.origin ?? msg?.id };
    };
    const useAt = async (item, activityName, token, opts = {}) => {
      fighterToken.control({ releaseOthers: true });
      if (token) target(token); else game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      await until(() => (token ? game.user.targets.has(token) : (game.user.targets.size === 0)),
        { timeout: 2000, label: token ? `${token.name} targeted` : 'no target' });
      const act = actOf(item, activityName);
      if (!act) throw new Error(`${item.name} has no activity "${activityName}"`);
      const results = await act.use({ ...opts }, { configure: false }, {});
      return results?.message ?? null;
    };
    // A part reads as its dice: the module names each maneuver's ("1d8[Feinting Attack]").
    const riderPart = (dmg, re) => (dmg?.rolls ?? []).find(r => re.test(String(r.formula ?? '').replace(/\[[^\]]*\]/g, '')));

    // ---- 1. Parry
    if (want(1)) await section(1, async () => {
      await clearChips(); await refill(); await healFull();
      const hpBefore = fighter.system.attributes.hp.value;
      const { msg } = await swing(goblin, goblinToken, goblinMelee, fighterToken);
      const hold = await until(() => msg?.getFlag(MOD, 'hold') ?? null, { timeout: 6000 });
      const t = hold?.targets?.find(x => x.uuid === fighter.uuid);
      ok('1a. the goblin\'s melee hit on the fighter stamps a hold for Parry as a DAMAGE interrupt with the pack\'s reduction formula — the Monster Manual\'s AC Parry of the same name is not this',
        !!t && (t.reaction === 'Parry') && (t.kind === 'damage') && /superiority\.die/.test(t.reduce?.formula ?? ''), `target=${JSON.stringify(t)}`);
      const popup = await until(() => dialogWith('Maneuver — Parry'), { timeout: 6000 });   // the maneuver family's popup
      popup?.element?.querySelector('button[data-action="cast"]')?.click();
      const resolved = await until(() => (msg?.getFlag(MOD, 'hold')?.status === 'resolved') ? msg.getFlag(MOD, 'hold') : null, { timeout: 10000 });
      const rt = resolved?.targets?.find(x => x.uuid === fighter.uuid);
      const dieMsg = game.messages.contents.filter(m => (m.timestamp >= suiteStart) && /Parry — the die/.test(m.flavor ?? '')).at(-1);
      ok('1b. the answer rolls the die plus the modifier IN THE OPEN and rides the hold as the reduction', !!rt && (rt.answer === 'cast') && (Number(rt.reduceBy) > 0) && !!dieMsg && (dieMsg.rolls?.[0]?.total === rt.reduceBy),
        `reduceBy=${rt?.reduceBy} die=${dieMsg?.rolls?.[0]?.formula}=${dieMsg?.rolls?.[0]?.total}`);
      const dmg = await until(() => { const d = damageFor(msg?._source.system?.origin ?? msg?.id); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
      const receipt = dmg?.getFlag(MOD, 'receipt')?.targets?.find(x => x.uuid === fighter.uuid);
      const total = (dmg?.rolls ?? []).reduce((n, r) => n + (r.total ?? 0), 0);
      const expected = Math.max(0, total - (rt?.reduceBy ?? 0));
      ok('1c. the damage lands REDUCED by that number through the receipt chokepoint — the receipt row says why, the HP moved by the rest',
        !!receipt && (receipt.taken === expected) && /Parry — reduced by/.test(receipt.note ?? '') && (fighter.system.attributes.hp.value === hpBefore - expected),
        `rolled=${total} reduceBy=${rt?.reduceBy} taken=${receipt?.taken} note="${receipt?.note}" hp ${hpBefore}→${fighter.system.attributes.hp.value}`);
      // Out of combat there is no turn to bring a Reaction back, so no chip is written (the settled rule) — the pool is the spend to assert.
      ok('1d. the pool is spent (the Reaction chip is a combat-only document — out of combat none is written, by the settled rule)', poolLeft() === 3, `pool=${poolLeft()}`);
      // THE MOMENT, PUBLISHED (events.js): Parry answers a hold AND spends a Superiority Die, so it
      // publishes under both words — `hold-answered` and `maneuver` — once each, on the attack message.
      const held = momentsOf('hold-answered').filter(p => p.messageId === msg?.id);
      const man = momentsOf('maneuver').filter(p => p.messageId === msg?.id);
      const h = held[0], m = man[0];
      ok('1e. the resolve was PUBLISHED: bythebooks.moment "hold-answered" — the fighter, Parry, the attack message, the goblin as the target, answer cast, the reduction, the spend; and "maneuver" beside it (mode reduce); once each, plain and frozen',
        (held.length === 1) && (man.length === 1) && !!h && !!m && (h.actorUuid === fighter.uuid) && (h.ability === 'Parry') && (h.attackId === msg?.id)
          && (h.targets?.[0]?.actorUuid === goblin.uuid) && (h.details?.answer === 'cast') && (h.details?.kind === 'damage') && (h.details?.reduceBy === rt?.reduceBy)
          && (h.spend?.pool === 'Combat Superiority') && (h.spend?.left === 3) && (m.details?.mode === 'reduce') && (m.spend?.left === 3)
          && Object.isFrozen(h) && plain(h) && plain(m),
        `held=${held.length} man=${man.length} h=${JSON.stringify(h)}`);
      await clearChips();
    });

    // ---- 2. Feinting Attack
    if (want(2)) await section(2, async () => {
      await clearChips(); await refill(); await healFull();
      const card = await useAt(feat('Feinting Attack'), 'Damage', goblinToken);
      const marker = await until(() => goblin.effects.find(e => e.name === 'Feinting Attack') ?? null, { timeout: 6000 });
      await until(() => card?.getFlag(MOD, 'superiorityUse'), { timeout: 4000 });
      ok('2a. the use puts the pack\'s "Feinting Attack" marker on the goblin with the fighter as its source, the pool spent, the card says so',
        !!marker && (marker.getFlag(MOD, 'sourceUuid') === fighter.uuid) && (poolLeft() === 3) && !!card?.getFlag(MOD, 'superiorityUse'),
        `marker=${!!marker} source=${marker?.getFlag(MOD, 'sourceUuid')} pool=${poolLeft()} card=${JSON.stringify(card?.getFlag(MOD, 'superiorityUse'))}`);
      // The fighter's attack WITH the dialog: the gate reads the marker as Advantage.
      fighterToken.control({ releaseOthers: true });
      target(goblinToken);
      await targeted(goblinToken);
      const act = attackOf(sword);
      const results = await act.use({ subsequentActions: false }, { configure: false }, {});
      const before = lastAttack()?.id ?? null;
      face(19);
      void act.rollAttack({}, {}, results?.message?.id ? { data: { 'system.origin': results.message.id } } : {});
      const dialog = await until(rollDialog, { timeout: 6000, label: 'the fighter\'s attack roll dialog' });
      await gateDrawn(dialog);
      const gateText = textOf(dialog?.element?.querySelector('[data-bf-reminder]'));
      ok('2b. the fighter\'s attack gate lists Feinting Attack on the goblin — Net Advantage', /Feinting Attack/.test(gateText) && /Net Advantage/.test(gateText), `section="${gateText.slice(0, 200)}"`);
      dialog?.element?.querySelector('button[data-action="advantage"]')?.click();
      const attackMsg = await until(() => { const m = lastAttack(); return (m && (m.id !== before)) ? m : null; }, { timeout: 8000 });
      const originId = attackMsg?._source.system?.origin ?? attackMsg?.id;
      const dmg = await until(() => { const d = damageFor(originId); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
      const sr = dmg?.getFlag(MOD, 'superiorityRide');
      ok('2c. the die rides the hit\'s damage as its own part in the weapon\'s type, the card says so, and the marker is spent',
        !!riderPart(dmg, SUP_DIE) && (sr?.rode?.[0]?.key === 'Feinting Attack') && !goblin.effects.some(e => e.name === 'Feinting Attack'),
        `formulas=[${(dmg?.rolls ?? []).map(r => r.formula + ':' + r.options?.type).join(' | ')}] ride=${JSON.stringify(sr?.rode)} markerLeft=${goblin.effects.some(e => e.name === 'Feinting Attack')}`);
      // Another creature's attack never reads the fighter's feint: a fresh marker, the RANGER's dialog.
      await useAt(feat('Feinting Attack'), 'Damage', goblinToken);
      await until(() => goblin.effects.find(e => e.name === 'Feinting Attack') ?? null, { timeout: 6000 });
      rangerToken.control({ releaseOthers: true });
      target(goblinToken);
      await targeted(goblinToken);
      const ract = attackOf(rangerSword);
      const rres = await ract.use({ subsequentActions: false }, { configure: false }, {});
      face(19);
      void ract.rollAttack({}, {}, rres?.message?.id ? { data: { 'system.origin': rres.message.id } } : {});
      const rdialog = await until(rollDialog, { timeout: 6000, label: 'the Ranger\'s attack roll dialog' });
      await gateDrawn(rdialog);
      const rsection = textOf(rdialog?.element?.querySelector('[data-bf-reminder]'));
      ok('2d. the Ranger\'s gate does NOT read the fighter\'s feint (`only: "source"`)', !/Feinting Attack/.test(rsection), `section="${rsection.slice(0, 160)}"`);
      await closeDialogs();
      await until(() => !rollDialog(), { timeout: 4000, label: 'the Ranger\'s roll dialog closed' });
      await clearChips();
    });

    // ---- 3. Lunging Attack
    if (want(3)) await section(3, async () => {
      await clearChips(); await refill(); await healFull();
      await useAt(feat('Lunging Attack'), 'Damage', null);
      const chip = await until(() => fighter.effects.find(e => (e.getFlag(MOD, 'mastery') === 'use') && (e.getFlag(MOD, 'useKey') === 'Lunging Attack')) ?? null, { timeout: 6000 });
      ok('3a. the use writes a chip on the fighter carrying the die, the pool spent', !!chip && (chip.getFlag(MOD, 'die') === '1d8') && (poolLeft() === 3), `chip=${chip?.name} die=${chip?.getFlag(MOD, 'die')} pool=${poolLeft()}`);
      const { msg, originId } = await swing(fighter, fighterToken, sword, goblinToken);
      const offer = await until(offerEl, { timeout: 6000 });
      const box = offer?.querySelector('input[name="bf-rider"][value="lunge"]');
      ok('3b. the next melee hit\'s offer opens under auto damage with Lunging Attack as a TICKED checkbox — the 5-foot straight line is the player\'s', !!box && box.checked && /Lunging Attack — 1d8/.test(textOf(offer)), `box=${!!box} checked=${box?.checked} text="${textOf(offer).slice(0, 160)}"`);
      offer?.querySelector('button[data-action="roll"]')?.click();
      const dmg = await until(() => { const d = damageFor(originId); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
      // The ridden chip is spent after the damage lands.
      await until(() => !fighter.effects.some(e => e.getFlag(MOD, 'useKey') === 'Lunging Attack'), { timeout: 4000, label: 'the Lunging Attack chip spent' });
      ok('3c. ticked, the die rides and the chip goes', !!riderPart(dmg, SUP_DIE) && (msg?.getFlag(MOD, 'lungePick') === true) && !fighter.effects.some(e => e.getFlag(MOD, 'useKey') === 'Lunging Attack'),
        `formulas=[${(dmg?.rolls ?? []).map(r => r.formula).join(' | ')}] pick=${msg?.getFlag(MOD, 'lungePick')} chipLeft=${fighter.effects.some(e => e.getFlag(MOD, 'useKey') === 'Lunging Attack')}`);
      // Unticked: nothing rides, the chip stays for a later hit this turn.
      await refill(); await healFull();
      await useAt(feat('Lunging Attack'), 'Damage', null);
      await until(() => fighter.effects.find(e => e.getFlag(MOD, 'useKey') === 'Lunging Attack') ?? null, { timeout: 6000 });
      const { msg: m2, originId: o2 } = await swing(fighter, fighterToken, sword, goblinToken);
      const offer2 = await until(offerEl, { timeout: 6000 });
      offer2?.querySelector('input[name="bf-rider"][value="lunge"]')?.click();
      offer2?.querySelector('button[data-action="roll"]')?.click();
      const dmg2 = await until(() => { const d = damageFor(o2); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
      ok('3d. unticked, nothing rides and the chip stands', !!dmg2 && !riderPart(dmg2, SUP_DIE) && (m2?.getFlag(MOD, 'lungePick') === false) && fighter.effects.some(e => e.getFlag(MOD, 'useKey') === 'Lunging Attack'),
        `formulas=[${(dmg2?.rolls ?? []).map(r => r.formula).join(' | ')}] pick=${m2?.getFlag(MOD, 'lungePick')}`);
      await clearChips();
    });

    // ---- 4. Evasive Footwork
    if (want(4)) await section(4, async () => {
      await clearChips(); await refill();
      const acBefore = fighter.system.attributes.ac.value;
      const card = await useAt(feat('Evasive Footwork'), 'Evade', null);
      const chip = await until(() => fighter.effects.find(e => (e.getFlag(MOD, 'mastery') === 'use') && (e.getFlag(MOD, 'useKey') === 'Evasive Footwork')) ?? null, { timeout: 6000 });
      // The card's flag is a second write after the chip (NOTES §5).
      await until(() => card?.getFlag(MOD, 'superiorityUse'), { timeout: 4000, label: 'the card\'s superiorityUse flag' });
      const n = Number(chip?.changes?.[0]?.value);
      ok('4a. the die is rolled in the open and the number rides the fighter\'s AC as a chip until the start of the next turn; the pool spent; the card says the number',
        !!chip && (chip.changes?.[0]?.key === 'system.attributes.ac.bonus') && (n >= 1) && (n <= 8) && (fighter.system.attributes.ac.value === acBefore + n) && (poolLeft() === 3)
          && (card?.getFlag(MOD, 'superiorityUse')?.total === n),
        `chip=${chip?.name} change=${JSON.stringify(chip?.changes?.[0])} ac ${acBefore}→${fighter.system.attributes.ac.value} pool=${poolLeft()} card=${JSON.stringify(card?.getFlag(MOD, 'superiorityUse'))}`);
      await clearChips();
    });

    // ---- 5. Bait and Switch
    if (want(5)) await section(5, async () => {
      await clearChips(); await refill();
      const rangerAC = ranger.system.attributes.ac.value;
      const card = await useAt(feat('Bait and Switch'), 'Switch Places', rangerToken);
      const bs = await until(() => { const b = card?.getFlag(MOD, 'baitSwitch'); return b?.total ? b : null; }, { timeout: 6000 });
      const popup = await until(() => dialogWith('who gains the AC'), { timeout: 6000 });   // the maneuver popup's words
      ok('5a. the die is rolled and a popup asks who gains the AC — the fighter and the willing Ranger', !!bs && (bs.options?.length === 2) && !!popup, `flag=${JSON.stringify(bs && { total: bs.total, options: bs.options?.map(o => o.name) })} popup=${!!popup}`);
      popup?.element?.querySelector('button[data-action="pick-1"]')?.click();
      const chosen = await until(() => card?.getFlag(MOD, 'baitSwitch')?.chosen ?? null, { timeout: 6000 });
      const resolved = await until(() => card?.getFlag(MOD, 'baitSwitch')?.resolved ?? null, { timeout: 10000 });
      log.push(`5b: chosen=${chosen} flag=${JSON.stringify(card?.getFlag(MOD, 'baitSwitch'))} rangerFx=${ranger.effects.map(e => e.name).join('|')}`);
      const baited = ranger.effects.find(e => e.name === `Baited AC +${bs?.total}`);
      // A window for a second "Baited AC" effect (the cast slice's), which must not come.
      const second = await watch(() => ranger.effects.filter(e => /^Baited AC/.test(e.name)).length > 1, { ms: 300 });
      ok('5b. the Ranger picked wears the pack\'s own "Baited AC +N" — ONE effect, receipted on the card, its AC up by the roll and nothing else (the cast slice is kept off the twelve)',
        !second && !!resolved?.applied && !!baited && (ranger.effects.filter(e => /^Baited AC/.test(e.name)).length === 1) && (ranger.system.attributes.ac.value === rangerAC + (bs?.total ?? 0)) && (card?.getFlag(MOD, 'effectReceipt')?.targets?.some(t => t.uuid === ranger.uuid)),
        `resolved=${JSON.stringify(resolved)} baited=${!!baited} ac ${rangerAC}→${ranger.system.attributes.ac.value} receipt=${!!card?.getFlag(MOD, 'effectReceipt')}${second ? ' (a second Baited AC came)' : ''}`);
      await clearChips();
    });

    // ---- 6. Rally — the platform's own heal
    if (want(6)) await section(6, async () => {
      await clearChips(); await refill(); await healFull();
      fighterToken.control({ releaseOthers: true });
      target(rangerToken);
      await targeted(rangerToken);
      const rally = actOf(feat('Rally'), 'Heal');
      void rally.use({}, { configure: false }, {});
      const dialog = await until(rollDialog, { timeout: 8000 });
      const btn = dialog?.element?.querySelector('button[data-action="roll"], button[type="submit"]');
      btn?.click();
      const temp = await until(() => (ranger.system.attributes.hp.temp > 0) ? ranger.system.attributes.hp.temp : null, { timeout: 12000 });
      ok('6a. Rally needs nothing built: the pack\'s heal activity rolls through the system\'s own dialog and the cast slice lands the Temporary Hit Points on the Ranger; the pool spent',
        !!dialog && (temp > 0) && (poolLeft() === 3), `dialog=${!!dialog} temp=${ranger.system.attributes.hp.temp} pool=${poolLeft()}`);
      await closeDialogs();
      await clearChips();
    });

    // ---- 7. the scoped folds on checks
    if (want(7)) await section(7, async () => {
      await clearChips(); await refill();
      await closeDialogs();
      const foldOf = async (skill) => {
        const before = game.messages.size;
        const rolls = await fighter.rollSkill({ skill }, { configure: false }, {});
        const m = rolls?.[0]?.parent ?? null;
        // The fold is stamped once, offers and all, after the roll's message; soft, since a check
        // with no offer at all is never stamped.
        await until(() => m?.getFlag(MOD, 'd20fold'), { timeout: 4000, label: `the ${skill} check's d20 fold` }).catch(() => null);
        return { m, flag: m?.getFlag(MOD, 'd20fold') ?? null, grew: game.messages.size - before };
      };
      // Every d20 fold row is live: the fighter's other resources (Heroic Inspiration, Tactical
      // Mind, a Bardic die) ride beside the maneuvers — the scope is what these checks read.
      const labels = fl => (fl?.offers ?? []).map(o => o.label);
      const ste = await foldOf('ste');
      const ambushOffer = (ste.flag?.offers ?? []).find(o => o.label === 'Ambush');
      ok('7a. a Stealth check offers Ambush — the d20 fold\'s tactical spend with the feature\'s own scope — and not Tactical Assessment', !!ambushOffer && (ambushOffer.dieFormula === '1d8') && !labels(ste.flag).includes('Tactical Assessment') && (ste.flag?.skill === 'ste'),
        `offers=${JSON.stringify(labels(ste.flag))} skill=${ste.flag?.skill}`);
      await closeDialogs();
      const his = await foldOf('his');
      ok('7b. a History check offers Tactical Assessment and not Ambush', labels(his.flag).includes('Tactical Assessment') && !labels(his.flag).includes('Ambush'), `offers=${JSON.stringify(labels(his.flag))}`);
      await closeDialogs();
      const ath = await foldOf('ath');
      ok('7c. an Athletics check offers neither', !labels(ath.flag).includes('Ambush') && !labels(ath.flag).includes('Tactical Assessment'), `offers=${JSON.stringify(labels(ath.flag))}`);
      // Accept Ambush on a fresh Stealth check: the rescue window's row.
      const ste2 = await foldOf('ste');
      const win = await until(() => rescueWindow('Ambush'), { timeout: 6000 });
      win?.querySelector('[data-bf-rescue-action="tactical:Ambush"]')?.click();   // keyed by NAME: two tactical rows can stand
      // The other resources stay offered after the spend (a check with no DC is never "passed"), so
      // the fold may stand re-offered: the settled spend and the patched total are the witness.
      const done = await until(() => { const fl = ste2.m?.getFlag(MOD, 'd20fold'); return (fl?.spends?.some(s => (s.name === 'Ambush') && !s.pendingVerdict) && Number.isFinite(fl.foldedTotal)) ? fl : null; }, { timeout: 10000 });
      ok('7d. accepting Ambush spends a Superiority Die, rolls the die in the open and patches the check\'s total; the card names Ambush, not Tactical Mind',
        ((done?.status === 'pending') || (done?.outcome === 'used')) && (done?.spends?.length === 1) && (done?.spends?.[0]?.name === 'Ambush') && (done?.spends?.[0]?.label === 'Ambush') && (done?.foldedTotal === done?.baseTotal + done?.spends?.[0]?.die) && (poolLeft() === 3)
          && !game.messages.contents.some(m => (m.timestamp >= suiteStart) && /Second Wind isn't expended/.test(m.content ?? '')),
        `flag=${JSON.stringify(done && { status: done.status, outcome: done.outcome, spends: done.spends, base: done.baseTotal, folded: done.foldedTotal })} pool=${poolLeft()}`);
      // The rescue's spend USES the Ambush activity; it must not ARM a second die: a window for the
      // armed chip or the "which check" card.
      const armedLate = await watch(() => fighter.effects.some(e => (e.getFlag(MOD, 'useKey') === 'tactical') && e.getFlag(MOD, 'armed'))
        || game.messages.contents.some(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'tacticalArmed')), { ms: 600 });
      ok('7e. the rescue\'s spend arms nothing — no chip on the fighter, no "which check" card', !armedLate && !fighter.effects.some(e => (e.getFlag(MOD, 'useKey') === 'tactical') && e.getFlag(MOD, 'armed'))
          && !game.messages.contents.some(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'tacticalArmed')),
        `chip=${fighter.effects.some(e => e.getFlag(MOD, 'armed'))} armedCards=${game.messages.contents.filter(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'tacticalArmed')).length}`);
      await closeDialogs();
    });

    // ---- 8. Ambush on Initiative
    if (want(8)) await section(8, async () => {
      await clearChips(); await refill(); await closeDialogs();
      if (game.combat) await game.combat.delete();
      combat = await Combat.create({ scene: scene.id, active: true });
      // The combat goes in a finally: a wait that throws here must not leave §9 on inside it.
      try {
        await combat.createEmbeddedDocuments('Combatant', [{ actorId: fighter.id, tokenId: fighterDoc.id, sceneId: scene.id }, { actorId: goblin.id, tokenId: goblinDoc.id, sceneId: scene.id, initiative: 5 }]);
        await until(() => (combat.combatants.size === 2) && (game.combat?.id === combat.id), { timeout: 4000, label: 'the combat active with both combatants' });
        face(10);
        await fighter.rollInitiative({ createCombatants: false, rerollInitiative: true }, { configure: false });
        const combatant = combat.combatants.find(c => c.actorId === fighter.id);
        const initBefore = combatant?.initiative;
        const initMsg = await until(() => game.messages.contents.slice(-10).reverse().find(m => m.getFlag('core', 'initiativeRoll') && m.getFlag(MOD, 'd20fold')) ?? null, { timeout: 6000 });
        const flag = initMsg?.getFlag(MOD, 'd20fold');
        ok('8a. the initiative roll is offered Ambush (testKind initiative, the combatant named)', (flag?.testKind === 'initiative') && (flag?.offers?.[0]?.label === 'Ambush') && flag?.combatantIds?.includes(combatant?.id),
          `flag=${JSON.stringify(flag && { testKind: flag.testKind, offers: flag.offers?.map(o => o.label), combatants: flag.combatantIds, base: flag.baseTotal })} init=${initBefore}`);
        const win = await until(() => rescueWindow('Ambush'), { timeout: 6000 });
        win?.querySelector('[data-bf-rescue-action="tactical:Ambush"]')?.click();   // keyed by NAME: two tactical rows can stand
        const done = await until(() => { const fl = initMsg?.getFlag(MOD, 'd20fold'); return (fl?.status === 'resolved') ? fl : null; }, { timeout: 10000 });
        // The combatant's initiative moves by its own write beside the fold's.
        await until(() => combat.combatants.get(combatant?.id)?.initiative !== initBefore, { timeout: 4000, label: 'the fighter\'s initiative moved' });
        ok('8b. accepting moves the combatant\'s initiative by the die and says so', (done?.outcome === 'used') && (combat.combatants.get(combatant?.id)?.initiative === initBefore + (done?.spends?.[0]?.die ?? 0)) && (poolLeft() === 3),
          `init ${initBefore}→${combat.combatants.get(combatant?.id)?.initiative} die=${done?.spends?.[0]?.die} pool=${poolLeft()}`);
        // ⚠ The combat tracker's roll (Combat#rollInitiative) never fires dnd5e.rollInitiative
        // (NOTES §2); the roll's own message is the witness.
        await closeDialogs(); await refill();
        const before = game.messages.size;
        face(10);
        await combat.rollInitiative([combatant.id], { updateTurn: false });
        const trackerMsg = await until(() => game.messages.contents.slice(-10).reverse().find(m => m.getFlag('core', 'initiativeRoll') && (m.timestamp >= suiteStart) && m.getFlag(MOD, 'd20fold') && (m !== initMsg)) ?? null, { timeout: 6000 });
        const tf = trackerMsg?.getFlag(MOD, 'd20fold');
        ok('8c. the combat tracker\'s own roll is offered Ambush too — caught off the initiative message, since dnd5e\'s hook never fires on that road', (game.messages.size > before) && (tf?.testKind === 'initiative') && (tf?.offers?.[0]?.label === 'Ambush') && tf?.combatantIds?.includes(combatant?.id),
          `msg=${!!trackerMsg} flag=${JSON.stringify(tf && { testKind: tf.testKind, offers: tf.offers?.map(o => o.label), combatants: tf.combatantIds })}`);
        await closeDialogs();
      } finally {
        if (combat && game.combats.get(combat.id)) await combat.delete().catch(() => {});
        combat = null;
      }
    });

    // ---- 9. Commander's Strike
    if (want(9)) await section(9, async () => {
      await clearChips(); await refill(); await healFull(); await closeDialogs();
      // No driven attack: the ally's owner gets a notice, the ally
      // attacks from their own sheet, and the fighter's die rides that hit off a chip on the ally.
      const card = await useAt(feat("Commander's Strike"), 'Directed Attack', rangerToken);
      const cmd = await until(() => { const c = card?.getFlag(MOD, 'command'); return (c?.status === 'directed') ? c : null; }, { timeout: 6000 });
      const chip = await until(() => ranger.effects.find(e => (e.getFlag(MOD, 'useKey') === 'command') && (e.getFlag(MOD, 'cardId') === card?.id)) ?? null, { timeout: 6000 });
      ok('9a. the use stamps the direction on the card (the Ranger as the ally, the fighter\'s die resolved on the FIGHTER, the pool spent, no damage dialog of dnd5e\'s own) and the elect puts the chip on the RANGER carrying that die',
        !!cmd && (cmd.ally?.uuid === ranger.uuid) && (cmd.dieFormula === '1d8') && (poolLeft() === 3) && !rollDialog() && !!chip && (chip.getFlag(MOD, 'die') === '1d8') && (chip.getFlag(MOD, 'sourceUuid') === fighter.uuid),
        `cmd=${JSON.stringify(cmd && { ally: cmd.ally?.name, die: cmd.dieFormula, status: cmd.status })} pool=${poolLeft()} dialog=${!!rollDialog()} chip=${!!chip} chipDie=${chip?.getFlag(MOD, 'die')}`);
      const popup = await until(() => dialogWith('directs you to strike'), { timeout: 6000 });
      ok('9b. the Ranger\'s owner gets the NOTICE — OK only, no weapon choice, no Attack button', !!popup && !!popup.element?.querySelector('button[data-action="ok"]') && !popup.element?.querySelector('button[data-action="attack"]') && !popup.element?.querySelector('select'),
        `popup=${!!popup} ok=${!!popup?.element?.querySelector('button[data-action="ok"]')} attack=${!!popup?.element?.querySelector('button[data-action="attack"]')}`);
      popup?.element?.querySelector('button[data-action="ok"]')?.click();
      await until(() => !dialogWith('directs you to strike'), { timeout: 4000, label: 'the notice closed' });
      // The Ranger attacks the goblin from its own sheet: the chip's die rides the damage.
      const { msg: attackMsg, originId } = await swing(ranger, rangerToken, rangerSword, goblinToken);
      // The Gloom Stalker's Dreadful Strike (a live clock-rider row) opens the damage offer on the
      // hit, and with Decision Timer 0 it waits for a click: roll with the rider UNticked (the
      // fixture's uses untouched) — the chip's die rides the base roll either way. Soft: with no
      // offer the damage rolls by itself.
      const rangerOffer = await until(offerEl, { timeout: 4000, label: 'the Ranger\'s damage offer' }).catch(() => null);
      if (rangerOffer) {
        for (const box of rangerOffer.querySelectorAll('input[name="bf-rider"]')) if (box.checked) box.click();
        rangerOffer.querySelector('button[data-action="roll"]')?.click();
      }
      const dmg = await until(() => { const d = damageFor(originId); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
      const base = dmg?.rolls?.[0]?.formula ?? '';
      const ride = dmg?.getFlag(MOD, 'commandRide');
      const struck = await until(() => (card?.getFlag(MOD, 'command')?.status === 'struck') ? card.getFlag(MOD, 'command') : null, { timeout: 6000 });
      ok('9c. the Ranger\'s OWN attack carries the fighter\'s die in the weapon\'s roll (two dice), the chip is spent, the Reaction spent, the damage says so, and the fighter\'s card records the strike',
        !!attackMsg && (attackMsg.getAssociatedActor()?.uuid === ranger.uuid) && !!dmg && /1d8.*1d8/.test(base) && !!ride && (ride.cardId === card?.id)
          && !ranger.effects.some(e => e.getFlag(MOD, 'useKey') === 'command') && (struck?.struck?.by === ranger.name),   // the Reaction chip is combat-only (§1d's settled rule) — out of combat none is written
        `attack=${!!attackMsg} by=${attackMsg?.getAssociatedActor()?.name} dmg=${base} ride=${JSON.stringify(ride)} chipLeft=${ranger.effects.some(e => e.getFlag(MOD, 'useKey') === 'command')} reaction=${ranger.effects.some(e => /Reaction — used/.test(e.name))} card=${struck?.status}`);
      await clearChips();
    });

    // ---- 11. ARMED from the sheet
    if (want(11)) await section(11, async () => {
      await clearChips(); await refill(); await closeDialogs();
      if (game.combat) await game.combat.delete();
      const armedChip = () => fighter.effects.find(e => (e.getFlag(MOD, 'useKey') === 'tactical') && e.getFlag(MOD, 'armed')) ?? null;
      // Tactical Assessment used from the sheet, no check rolled yet.
      fighterToken.control({ releaseOthers: true });
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      const taAct = feat('Tactical Assessment').system.activities.contents[0];
      const taUse = await taAct.use({}, { configure: false }, {});
      const taCard = taUse?.message ?? null;
      const chip = await until(armedChip, { timeout: 6000 });
      const armed = await until(() => taCard?.getFlag(MOD, 'tacticalArmed') ?? null, { timeout: 4000 });
      const dieMsg = game.messages.contents.filter(m => (m.timestamp >= suiteStart) && /Tactical Assessment — the die/.test(m.flavor ?? '')).at(-1);
      ok('11a. the use rolls the die IN THE OPEN, spends the pool, puts an ARMED chip carrying the number on the fighter (History, Investigation, Insight) and the card says which check to make',
        !!chip && !!armed && !!dieMsg && (chip.getFlag(MOD, 'armed')?.total === dieMsg.rolls?.[0]?.total) && (armed.total === chip.getFlag(MOD, 'armed')?.total)
          && (JSON.stringify(chip.getFlag(MOD, 'armed')?.skills) === JSON.stringify(['his', 'inv', 'ins'])) && (poolLeft() === 3) && /History or Investigation/.test(armed.what ?? '') && !armed.spent,
        `chip=${JSON.stringify(chip?.getFlag(MOD, 'armed'))} card=${JSON.stringify(armed)} die=${dieMsg?.rolls?.[0]?.total} pool=${poolLeft()}`);
      const notice = await until(() => dialogWith('the die rolled'), { timeout: 6000 });
      // The checks ARE the buttons (History, Investigation, Insight); no OK.
      const skillButtons = [...(notice?.element?.querySelectorAll('button[data-action^="skill-"]') ?? [])].map(b => b.dataset.action);
      ok('11b. the popup offers the three checks as buttons — History, Investigation, Insight — and no OK', !!notice && (JSON.stringify(skillButtons) === JSON.stringify(['skill-his', 'skill-inv', 'skill-ins'])) && !notice.element?.querySelector('button[data-action="ok"]'),
        `notice=${!!notice} buttons=${JSON.stringify(skillButtons)}`);
      await closeDialogs();
      await until(() => !dialogWith('the die rolled'), { timeout: 4000, label: 'the notice closed' });
      // An Athletics check leaves the chip alone; a History check spends it and folds the number in.
      const athRolls = await fighter.rollSkill({ skill: 'ath' }, { configure: false }, {});
      // A window for the armed die spent on the Athletics check, which must not happen.
      const athSpent = await watch(() => !armedChip() || athRolls?.[0]?.parent?.getFlag(MOD, 'd20fold')?.armed, { ms: 500 });
      ok('11c. an Athletics check does not spend the armed die', !athSpent && !!armedChip() && !(athRolls?.[0]?.parent?.getFlag(MOD, 'd20fold')?.armed), `chip=${!!armedChip()}`);
      await closeDialogs();
      const hisRolls = await fighter.rollSkill({ skill: 'his' }, { configure: false }, {});
      const hisMsg = hisRolls?.[0]?.parent ?? null;
      const folded = await until(() => { const fl = hisMsg?.getFlag(MOD, 'd20fold'); return fl?.armed ? fl : null; }, { timeout: 8000 });
      // The armed fold's last write: the arming card marked spent (after the chip goes).
      await until(() => taCard?.getFlag(MOD, 'tacticalArmed')?.spent, { timeout: 4000, label: 'the Tactical Assessment card marked spent' });
      ok('11d. the History check folds the armed number in by itself — no rescue ask for Tactical Assessment, the total patched, the chip spent, the card marked; the pool untouched (spent at the use)',
        !!folded && (folded.spends?.[0]?.name === 'Tactical Assessment') && (folded.spends?.[0]?.die === armed?.total) && (folded.foldedTotal === folded.baseTotal + (armed?.total ?? 0))
          && !armedChip() && !(folded.offers ?? []).some(o => o.name === 'Tactical Assessment') && (poolLeft() === 3) && !!taCard?.getFlag(MOD, 'tacticalArmed')?.spent,
        `flag=${JSON.stringify(folded && { spends: folded.spends, base: folded.baseTotal, folded: folded.foldedTotal, offers: folded.offers?.map(o => o.name), status: folded.status })} chip=${!!armedChip()} pool=${poolLeft()} spent=${JSON.stringify(taCard?.getFlag(MOD, 'tacticalArmed')?.spent)}`);
      await closeDialogs();
      // Ambush armed, then Initiative: the combatant's number moves by the armed die.
      await refill();
      const amAct = feat('Ambush').system.activities.contents[0];
      const amUse = await amAct.use({}, { configure: false }, {});
      const amChip = await until(armedChip, { timeout: 6000 });
      await closeDialogs();
      combat = await Combat.create({ scene: scene.id, active: true });
      // The combat goes in a finally: a wait that throws here must not leave §12 on inside it.
      try {
        await combat.createEmbeddedDocuments('Combatant', [{ actorId: fighter.id, tokenId: fighterDoc.id, sceneId: scene.id }, { actorId: goblin.id, tokenId: goblinDoc.id, sceneId: scene.id, initiative: 5 }]);
        await until(() => (combat.combatants.size === 2) && (game.combat?.id === combat.id), { timeout: 4000, label: 'the combat active with both combatants' });
        face(10);
        await fighter.rollInitiative({ createCombatants: false, rerollInitiative: true }, { configure: false });
        const combatant = combat.combatants.find(c => c.actorId === fighter.id);
        const initMsg = await until(() => game.messages.contents.slice(-10).reverse().find(m => m.getFlag('core', 'initiativeRoll') && m.getFlag(MOD, 'd20fold')?.armed) ?? null, { timeout: 8000 });
        // After the fold's flag: the chip goes, then the combatant's initiative moves off the base.
        await until(() => !armedChip() && (combat.combatants.get(combatant?.id)?.initiative !== initMsg.getFlag(MOD, 'd20fold')?.baseTotal),
          { timeout: 4000, label: 'the armed Ambush spent and the initiative moved' });
        const initFlag = initMsg?.getFlag(MOD, 'd20fold');
        ok('11e. Ambush armed from the sheet moves the Initiative by the armed die with no ask, the chip spent',
          !!amChip && !!initFlag && (initFlag.spends?.[0]?.name === 'Ambush') && (combat.combatants.get(combatant?.id)?.initiative === initFlag.baseTotal + (amChip.getFlag(MOD, 'armed')?.total ?? 0)) && !armedChip(),
          `chip=${JSON.stringify(amChip?.getFlag(MOD, 'armed'))} flag=${JSON.stringify(initFlag && { spends: initFlag.spends, base: initFlag.baseTotal, folded: initFlag.foldedTotal })} init=${combat.combatants.get(combatant?.id)?.initiative} chipLeft=${!!armedChip()} use=${!!amUse}`);
        await closeDialogs();
      } finally {
        if (combat && game.combats.get(combat.id)) await combat.delete().catch(() => {});
        combat = null;
      }
      await clearChips();
    });

    // ---- 12. Stone's Endurance
    // INTERRUPT_REDUCTIONS' second row: the same machine as Parry, the row's own voice, the item's
    // own uses, never the heal.
    if (want(12)) await section(12, async () => {
      const goliath = game.actors.getName('BTB Test Goliath');
      const stone = goliath?.items.find(i => (i.type === 'feat') && (i.name === "Stone's Endurance"));
      if (!goliath || !stone) ok('12a. the BTB Test Goliath fixture carries Stone\'s Endurance (run tools/fixture-suite.mjs)', false, `goliath=${!!goliath} stone=${!!stone}`);
      else {
        const priorStoneSpent = stone.system._source.uses?.spent ?? 0;
        priorActor[goliath.id] = {
          'system.attributes.hp.value': goliath.system._source.attributes.hp.value,
          'system.attributes.hp.max': goliath.system._source.attributes.hp.max,
          'system.attributes.hp.temp': goliath.system._source.attributes.hp.temp ?? 0
        };
        try {
          await goliath.update({ 'system.attributes.hp.max': 400, 'system.attributes.hp.value': 390, 'system.attributes.hp.temp': 0 });
          await stone.update({ 'system.uses.spent': 0 });
          const usesMax = Number(goliath.items.get(stone.id)?.system.uses?.max ?? 0);
          const standing = canvas.tokens.placeables.find(t => t.actor?.id === goliath.id) ?? null;
          const goliathToken = standing ?? (await placeToken(goliath, 1400, 1300)).token;
          const hpBefore = goliath.system.attributes.hp.value;
          const since = Date.now();
          const { msg } = await swing(goblin, goblinToken, goblinMelee, goliathToken);
          const hold = await until(() => msg?.getFlag(MOD, 'hold') ?? null, { timeout: 6000 });
          const t = hold?.targets?.find(x => x.uuid === goliath.uuid);
          ok('12a. the goblin\'s hit on the Goliath stamps a DAMAGE hold for Stone\'s Endurance with the pack\'s formula, found by type (its activity\'s stored name is empty), in the Reaction voice',
            !!t && (t.reaction === "Stone's Endurance") && (t.kind === 'damage') && /1d12/.test(t.reduce?.formula ?? '') && /con\.mod/.test(t.reduce?.formula ?? '')
              && (t.reduce?.eyebrow === 'Reaction') && (t.reduce?.spend === 'use') && (t.reduce?.maneuver === false),
            `target=${JSON.stringify(t)}`);
          const popup = await until(() => dialogWith("Reaction — Stone"), { timeout: 6000 });
          const popupText = textOf(popup?.element);
          ok('12b. the popup asks in the trait\'s own words: "Reaction — Stone\'s Endurance", a use and the Reaction, 1d12 plus the Constitution modifier',
            !!popup && /Spend a use and your Reaction to reduce the damage by 1d12 plus your Constitution modifier/.test(popupText) && !/Superiority Die/.test(popupText),
            `text="${popupText.slice(0, 240)}"`);
          popup?.element?.querySelector('button[data-action="cast"]')?.click();
          const resolved = await until(() => (msg?.getFlag(MOD, 'hold')?.status === 'resolved') ? msg.getFlag(MOD, 'hold') : null, { timeout: 10000 });
          const rt = resolved?.targets?.find(x => x.uuid === goliath.uuid);
          const dieMsg = game.messages.contents.filter(m => (m.timestamp >= since) && /Stone's Endurance — the die/.test(m.flavor ?? '')).at(-1);
          const conMod = goliath.system.abilities.con.mod;
          const face12 = dieMsg?.rolls?.[0]?.dice?.[0]?.total ?? null;
          ok('12c. the answer rolls 1d12 + CON in the open and rides the hold as the reduction',
            !!rt && (rt.answer === 'cast') && (Number(rt.reduceBy) > 0) && !!dieMsg && (dieMsg.rolls?.[0]?.total === rt.reduceBy) && (face12 !== null) && (rt.reduceBy === face12 + conMod),
            `reduceBy=${rt?.reduceBy} die=${dieMsg?.rolls?.[0]?.formula}=${dieMsg?.rolls?.[0]?.total} con=${conMod}`);
          const dmg = await until(() => { const d = damageFor(msg?._source.system?.origin ?? msg?.id); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
          const receipt = dmg?.getFlag(MOD, 'receipt')?.targets?.find(x => x.uuid === goliath.uuid);
          const total = (dmg?.rolls ?? []).reduce((n, r) => n + (r.total ?? 0), 0);
          const expected = Math.max(0, total - (rt?.reduceBy ?? 0));
          ok('12d. the damage lands REDUCED through the receipt, the note naming Stone\'s Endurance — and the Goliath is not HEALED (the pack\'s heal activity was never used)',
            !!receipt && (receipt.taken === expected) && /Stone's Endurance — reduced by/.test(receipt.note ?? '') && (goliath.system.attributes.hp.value === hpBefore - expected),
            `rolled=${total} reduceBy=${rt?.reduceBy} taken=${receipt?.taken} note="${receipt?.note}" hp ${hpBefore}→${goliath.system.attributes.hp.value}`);
          const usesLeft = Number(goliath.items.get(stone.id)?.system.uses?.value ?? -1);
          const card = await until(() => /one use spent/.test(textOf(document.querySelector(`.message[data-message-id="${msg?.id}"]`))) ? true : null, { timeout: 6000 });
          ok('12e. the trait\'s OWN use is spent (one of its Proficiency-Bonus uses) and the card says "one use spent", never a Superiority Die',
            (usesLeft === usesMax - 1) && !!card && !/Superiority Die/.test(cardText(msg?.id)),
            `uses ${usesMax}→${usesLeft} card="${cardText(msg?.id).slice(0, 240)}"`);
          const held = momentsOf('hold-answered', since).filter(p => p.messageId === msg?.id);
          const man = momentsOf('maneuver', since).filter(p => p.messageId === msg?.id);
          ok('12f. the resolve publishes hold-answered with the spend, and NOT maneuver — a species trait is no maneuver',
            (held.length === 1) && (man.length === 0) && (held[0]?.ability === "Stone's Endurance") && (held[0]?.spend?.pool === "Stone's Endurance"),
            `held=${held.length} man=${man.length} h=${JSON.stringify(held[0]?.spend)}`);
        } finally {
          await goliath.items.get(stone.id)?.update({ 'system.uses.spent': priorStoneSpent }).catch(() => {});
          await clearChips();
        }
      }
    });

    // ---- 10. FIRED
    if (want(10)) await section(10, async () => {
      ok('10a. dnd5e.rollSkill fired (the scoped folds\' hook)', count('dnd5e.rollSkill') > 0, `count=${count('dnd5e.rollSkill')}`);
      ok('10b. dnd5e.rollInitiative fired (Ambush on Initiative)', count('dnd5e.rollInitiative') > 0, `count=${count('dnd5e.rollInitiative')}`);
    });

    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  } finally {
    Hooks.off('bythebooks.moment', momentHookId);
    await teardown();
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: 'superiority', out, plan, f });
