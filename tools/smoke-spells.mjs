// Live suite: THE SPELLS SLICE (HANDOFF.md, 2026-09-28) — the turn-start grant (Heroism's Temporary Hit
// Points, rolled again on the caster at each of the bearer's turn starts) and the repeating save (Hold
// Person's Paralyzed demanded at the bearer's turn end; a success removes it through the cast card's
// receipt and the card says so; a failure keeps it; damage raises Tasha's with Advantage; Otto's is offered
// as the bearer's action; Flesh to Stone counts its failures to Petrified). §11: Sleep's Sphere asks its
// caster who it affects (RULINGS *Spells that choose their targets*), the chosen meeting §10's consequences.
//
// Fixtures: BTB Test Cleric (tools/fixture-suite.mjs) is lent the PHB's spells; BTB Test Victim is the one
// they land on, its own linked token placed on the test range; §11 stands an unlinked BTB Test Dummy below
// it as the Cleric's friend. Settings, lent items, effects, hit points, tokens, areas,
// the combat and messages are put back. The demanded saves ROLL THEMSELVES here (`saveRolls` auto), the
// verdict steered by the Victim's Wisdom save bonus (±30).
//
// Sections: `--section 2`, `--list`. Fixtures and teardown ALWAYS run.
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from './harness.mjs';

// THE COVERAGE MAP (tools/coverage-map.mjs) — ⚠ NEVER import a suite; the map is parsed.
export const COVERS = [
  'turn-grants.js',         // §1 — Heroism's temp HP at the bearer's turn start, once per turn, receipted; §9 Regeneration — the feature row, the block read off the receipts
  'repeat-saves.js',        // §2–§5 — the repeat at the turn end, on damage, as the action; the count; §8 the indigo ray's named save; §10 Sleep's end on damage and the lifted Unconscious
  'saves/ask.js',           // §10 — the cast's save that cannot fail: Immunity to Exhaustion against a sleep
  'saves/demand.js',        // §11 — Sleep's chosen area: the default written when nothing is to choose, the ask raised when a friend stands in it
  'saves/areas.js',         // §11 — the area placed after a bare cast fills the waiting demand, filtered to the choice
  'saves/views.js',         // §11 — the chosen area's card line
  'damage-shares.js',       // §6 — Warding Bond's share to the caster, the reach, the end at 0 HP
  'heal-on-hit.js',         // §7 — Vampiric Touch's heal to the caster from the damage that landed
  'prismatic.js'            // §8 — Prismatic Spray's die per creature, a demand per ray, the type forced, the indigo effect landed
];

const SECTIONS = {
  1: 'Heroism: the cast lands Bravery and the temp HP once; each of the Victim\'s turn starts pays them again on the Cleric\'s modifier — a card, a receipt, once per turn',
  2: 'Hold Person: the Victim\'s turn END raises the repeat (a saves demand pinned to it, Wisdom, the spell\'s DC, effectsHandled "repeat"); a failure keeps Paralyzed and the card says so; a success removes it through the cast card\'s receipt (reverted), the card says it ended, the line renders',
  3: 'Tasha\'s Hideous Laughter: damage landing on the Victim raises the repeat with the demand\'s own Advantage (the auto roll rolls it); healing raises nothing; a second turn end while one is unanswered raises no second',
  4: 'Otto\'s Irresistible Dance: the Victim\'s turn START offers the save as its action (a card with a button, no demand); the button raises the demand; a success ends the dance',
  5: 'Flesh to Stone: three failures at three turn ends — the tally on the effect (1, 2), the third pressing Petrified and locking (a fourth turn end asks nothing)',
  6: 'THE HELD SPELLS — Warding Bond: the cast lands Bonded on the Victim; damage landing on it (from a card) is taken by the Cleric too — the same number (the bond\'s resistance already taken), a card, a receipt; 65 ft apart the card says the bond is out of reach and nothing is shared; the Cleric dropped to 0 by a share ends the bond (Bonded gone, the card says why)',
  7: 'Vampiric Touch: a hit (AC 1) lands its necrotic damage on the Victim; the Cleric regains HALF of what landed — a card, a receipt, the Hit Points up; the dealing card carries the once-latch',
  9: 'REGENERATION (the GM\'s side, 2026-09-28): the Victim lent the Monster Manual trait (its copy naming Acid or Fire as the block, 10 HP) regains 10 at its turn start — a card, a receipt, the Hit Points up; fire dealt to it (a receipt) since its last turn blocks the next turn start with a card saying why and no receipt; the turn after pays again; at 0 HP nothing is paid',
  10: 'Sleep (2024): the cast fails the Victim — Sleeping (Incapacitated) lands; its turn END repeats: the failure locks it and presses Unconscious, the card says so; damage landing on it ENDS Sleeping outright and lifts the Unconscious with it, a settled card says why; with Immunity to Exhaustion on the sheet the cast\'s save cannot fail and nothing lands',
  11: 'Sleep\'s Sphere is the caster\'s choice (RULINGS *Spells that choose their targets*): a bare cast waits for its area; the Sphere over the Victim and the Cleric asks nobody (the caster is never a candidate, every hostile the choice) and the card says so; with the Cleric\'s friend (an unlinked Dummy) in the Sphere it asks "Who does Sleep affect?" (no number, the spell\'s sentence) — the Victim ticked, the friend not, the demand waiting; OK → only the Victim saves and fails, Sleeping lands on it, the friend has no save and nothing lands; the card names both sides; the chosen sleeper\'s turn end repeats as §10 (Unconscious pressed)',
  8: 'Prismatic Spray: the cast\'s card is born with its demand CLOSED and the ray claim pending (no 12d6 at the cast); the cone placed over the Victim rolls a d8 (a 6: indigo) — a summary card and ONE demand against "Indigo Save (Con)", pinned; the cone region gone; the failed save lands Petrifying (Indigo) by the machine, receipted; the Victim\'s turn end repeats the INDIGO save (1 of 3 failures); a second cast with the d8 a 1 (red): the Cast\'s Dexterity demand with the 12d6 rolled as FIRE'
};
const DEPENDS = {};

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'spells', watchdogMs: 600_000 });
announcePlan('spells', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  // `stage` names the step the harness heartbeat reports: where the run is when it hangs.
  const { until, watch, canvasReady, tokenOn, stage, snapshotSettings, faces, unrig } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const suiteStart = Date.now();

  const mod = game.modules.get(MOD);
  if (!mod?.active) return { fatal: `module active=${mod?.active}` };
  if (!game.settings.settings.has(`${MOD}.decisionTimer`)) return { fatal: 'decisionTimer not registered — OLD code (reload the box)' };

  const SETTING_KEYS = ['decisionTimer', 'dramaticBeat', 'saveRolls', 'playerRollDamage'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { set } = settings;

  const scene = game.scenes.getName('By the Books Test Range');
  const cleric = game.actors.getName('BTB Test Cleric');
  const victim = game.actors.getName('BTB Test Victim');
  if (!scene || !cleric || !victim) return { fatal: 'missing fixture: the test range, BTB Test Cleric or BTB Test Victim — run tools/fixture-suite.mjs' };

  const lent = [];
  const placed = [];
  const areas = [];
  let combat = null;
  const priorActiveCombats = [];
  const priorHp = { value: victim.system._source.attributes.hp.value, max: victim.system._source.attributes.hp.max, temp: victim.system._source.attributes.hp.temp };
  const priorWis = victim.system._source.abilities?.wis?.save?.roll?.bonus ?? '';
  const priorCon = victim.system._source.abilities?.con?.save?.roll?.bonus ?? '';
  const priorVictimEffects = new Set(victim.effects.map(e => e.id));
  const priorClericEffects = new Set(cleric.effects.map(e => e.id));
  // What a section changes on the actors and puts back at its end: the teardown puts it back too, for a section that threw.
  const priorClericHp = cleric.system._source.attributes.hp.value;
  const priorVictimAc = { 'system.attributes.ac.calc': victim.system._source.attributes.ac.calc, 'system.attributes.ac.flat': victim.system._source.attributes.ac.flat };
  const priorVictimCi = foundry.utils.deepClone(victim.system._source.traits?.ci ?? { value: [], custom: '' });
  // ⚠ Every die a 5: a natural 20 SUCCEEDS a 2024 save whatever the bonus, and the saves here are steered by ±30.
  faces([[5, 20]]);
  let restored = false;
  const teardown = async () => {
    if (restored) return;
    restored = true;
    unrig();
    for (const failed of await settings.restore()) log.push(`TEARDOWN settings ERROR: ${failed}`);
    try {
      try { if (combat && game.combats.get(combat.id)) await combat.delete(); } catch { /* gone */ }
      for (const id of priorActiveCombats) { try { await game.combats.get(id)?.update({ active: true }); } catch { /* gone */ } }
      const strays = victim.effects.filter(e => !priorVictimEffects.has(e.id)).map(e => e.id);
      if (strays.length) await victim.deleteEmbeddedDocuments('ActiveEffect', strays);
      const cstrays = cleric.effects.filter(e => !priorClericEffects.has(e.id)).map(e => e.id);
      if (cstrays.length) await cleric.deleteEmbeddedDocuments('ActiveEffect', cstrays);
      const live = lent.filter(id => cleric.items.get(id));
      if (live.length) await cleric.deleteEmbeddedDocuments('Item', live);
      const tokens = placed.filter(id => scene.tokens.get(id));
      if (tokens.length) await scene.deleteEmbeddedDocuments('Token', tokens);
      const regions = areas.filter(id => scene.regions.get(id));
      if (regions.length) await scene.deleteEmbeddedDocuments('Region', regions).catch(() => {});   // a spent area the module swept meanwhile
      await victim.update({ 'system.attributes.hp.value': priorHp.value, 'system.attributes.hp.max': priorHp.max, 'system.attributes.hp.temp': priorHp.temp,
        'system.abilities.wis.save.roll.bonus': priorWis, 'system.abilities.con.save.roll.bonus': priorCon, ...priorVictimAc, 'system.traits.ci': priorVictimCi });
      await cleric.update({ 'system.attributes.hp.value': priorClericHp });
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      const mine = game.messages.filter(m => (m.timestamp >= suiteStart)
        && ((m.speaker?.actor === cleric.id) || (m.speaker?.actor === victim.id) || Object.keys(m.flags?.[MOD] ?? {}).length));
      if (mine.length) await ChatMessage.deleteDocuments(mine.map(m => m.id));
    } catch (err) {
      log.push(`TEARDOWN ERROR: ${err?.message}`);
    }
  };

  try {
    stage('settings');
    await set('decisionTimer', 0);
    await set('dramaticBeat', 0);
    await set('saveRolls', 'auto');   // the demanded saves roll themselves; the bonus steers the verdict
    await set('playerRollDamage', false);   // §7: the hit's damage rolls itself and lands

    const lend = async (name, type) => {
      if (cleric.items.some(i => (i.name === name) && (i.type === type))) return cleric.items.find(i => (i.name === name) && (i.type === type));
      for (const pack of game.packs.filter(p => (p.metadata.packageName === 'dnd-players-handbook') && (p.documentName === 'Item'))) {
        const hit = (await pack.getIndex()).find(e => (e.name === name) && (e.type === type));
        if (!hit) continue;
        const src = await pack.getDocument(hit._id);
        const data = src.toObject();
        data.system.prepared = 1;
        if (Number(data.system.level) > 2) data.system.level = 1;   // a level-5 Cleric has no 6th-level slot; the DC does not read the level
        const [item] = await cleric.createEmbeddedDocuments('Item', [data]);
        lent.push(item.id);
        return item;
      }
      return null;
    };
    const spells = {};
    stage('lend');
    for (const name of ['Heroism', 'Hold Person', "Tasha's Hideous Laughter", "Otto's Irresistible Dance", 'Flesh to Stone', 'Sleep']) {
      spells[name] = await lend(name, 'spell');
      if (!spells[name]) return { fatal: `the PHB ships no "${name}" this box can find`, results, log, skips };
    }
    const actOf = (name, type) => cleric.items.get(spells[name].id)?.system.activities.find(a => a.type === type) ?? null;

    stage('view');
    if (canvas.scene?.id !== scene.id) await scene.view();
    await canvasReady();
    const g = scene.grid.size;
    const occupied = (x, y) => scene.tokens.some(t => (t.x < (x + 1) * g) && ((t.x + t.width * g) > x * g) && (t.y < (y + 1) * g) && ((t.y + t.height * g) > y * g));
    let spot = null;
    // A free 2×2 block: the Victim and the Cleric on its top row, §11's Sphere over all four squares.
    const free = (x, y) => !occupied(x, y) && !occupied(x + 1, y) && !occupied(x, y + 1) && !occupied(x + 1, y + 1);
    for (let y = 2; (y < 18) && !spot; y++) for (let x = 2; (x < 18) && !spot; x++) if (free(x, y)) spot = { x, y };
    if (!spot) return { fatal: 'no free square on the test range for the tokens', results, log, skips };
    const place = async (actor, dx) => {
      const [doc] = await scene.createEmbeddedDocuments('Token', [foundry.utils.mergeObject(actor.prototypeToken.toObject(),
        { x: (spot.x + dx) * g, y: spot.y * g, actorId: actor.id, actorLink: true }, { inplace: false })]);
      placed.push(doc.id);
      await tokenOn(doc.id);
      return canvas.tokens.get(doc.id);
    };
    stage('place');
    const victimToken = await place(victim, 0);
    const clericToken = await place(cleric, 1);
    if (!victimToken || !clericToken) return { fatal: 'the tokens never reached the canvas', results, log, skips };

    // ⚠ `setTarget` is synchronous: the next use reads `game.user.targets` at once, nothing to wait for.
    const target = () => { game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); }); victimToken.setTarget(true, { releaseOthers: true }); };
    const wisBonus = v => victim.update({ 'system.abilities.wis.save.roll.bonus': v });
    /** The save bonus on the ability a spell's save names (Flesh to Stone is Constitution). */
    const saveBonusFor = (name, v) => victim.update({ [`system.abilities.${actOf(name, 'save')?.save?.ability?.[0] ?? 'wis'}.save.roll.bonus`]: v });
    const healFull = () => victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max, 'system.attributes.hp.temp': 0 });
    const effectNamed = name => victim.effects.find(e => e.name === name) ?? null;
    const clearVictim = async () => {
      const strays = victim.effects.filter(e => !priorVictimEffects.has(e.id)).map(e => e.id);
      if (strays.length) await victim.deleteEmbeddedDocuments('ActiveEffect', strays);
      await cleric.endConcentration?.().catch?.(() => {});
    };
    const repeatCards = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'repeatSave'));
    const offerCards = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'repeatOffer'));
    const grantCards = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'turnGrant'));
    const settledRepeat = async (n, timeout = 15000) => until(() => {
      const cards = repeatCards();
      const c = cards[n - 1];
      return (cards.length >= n) && c?.getFlag(MOD, 'repeatSave')?.says ? c : null;
    }, { timeout: timeout });

    /** Cast a save spell at the Victim with the save steered: the demand card, its verdict done.
     * ⚠ No template: the 2024 Sleep carries a sphere, and dnd5e's placement waits for a canvas click no headless client
     * makes (the run hung there for the watchdog's whole 600 s); the demand reads the targeted Victim instead. */
    const castAt = async (name, bonus) => {
      await saveBonusFor(name, bonus);
      target();
      const use = await actOf(name, 'save').use({ consume: { spellSlot: false }, create: { measuredTemplate: false } }, { configure: false }, {});
      const card = use?.message instanceof ChatMessage ? use.message : null;
      if (!card) return null;
      await until(() => card.getFlag(MOD, 'saves')?.targets?.[0]?.applied ? true : null, { timeout: 15000 });
      return card;
    };

    // ⚠ The tracker's turn hooks (the repeat, the grant, the offer) fire inside the awaited `nextTurn`, so a step
    // reads the moved turn at once; each card those hooks raise is waited for by its own `until`.
    const startCombat = async () => {
      await endCombat();   // a section that threw leaves its combat: never counted among the world's own
      for (const c of game.combats.filter(c => c.active)) { priorActiveCombats.push(c.id); await c.update({ active: false }); }
      const began = Date.now();
      combat = await Combat.create({ scene: scene.id, active: true });
      await combat.createEmbeddedDocuments('Combatant', [{ tokenId: clericToken.id, actorId: cleric.id, initiative: 20 }, { tokenId: victimToken.id, actorId: victim.id, initiative: 10 }]);
      await combat.startCombat();   // the Cleric's turn
      if (game.combat?.id !== combat.id) { try { ui.combat.viewed = combat; } catch { /* the tracker */ } }
      await until(() => combat.started && (combat.combatant?.tokenId === clericToken.id), { label: 'the combat started on the Cleric\'s turn' });
      // a window before the sections take their counts: a card the start itself raises lands inside it, never after the count
      await watch(() => game.messages.contents.some(m => (m.timestamp >= began)
        && ['turnGrant', 'repeatSave', 'repeatOffer'].some(k => m.getFlag(MOD, k))), { ms: 300 });
    };
    const endCombat = async () => {
      try { if (combat && game.combats.get(combat.id)) await combat.delete(); } catch { /* gone */ }
      combat = null;
    };

    // ================================================== 1. Heroism
    if (want(1)) await section(1, async () => {
      stage('§1');
      await healFull();
      const mod = Number(cleric.system.abilities?.wis?.mod ?? 0);
      target();
      const use = await actOf('Heroism', 'heal').use({ consume: { spellSlot: false } }, { configure: false }, {});
      const card = use?.message instanceof ChatMessage ? use.message : null;
      const bravery = await until(() => effectNamed('Bravery'), { timeout: 12000 });
      ok('1a. the cast lands Bravery on the Victim, its origin the Cleric\'s Heroism (the applier\'s stamp)',
        !!card && !!bravery && (bravery.system?.origin?.item === cleric.items.get(spells.Heroism.id)?.uuid),
        `card=${!!card} bravery=${!!bravery} origin=${bravery?.system?.origin?.item} use=${typeof use}:${JSON.stringify(use && Object.keys(use))} msgType=${use?.message?.constructor?.name}`);
      await startCombat();
      const n0 = grantCards().length;
      await combat.nextTurn();   // the Victim's turn starts
      const grant = await until(() => grantCards()[n0] ?? null, { timeout: 10000 });
      const receipt = await until(() => grant?.getFlag(MOD, 'receipt'), { timeout: 8000 });
      const tg = grant?.getFlag(MOD, 'turnGrant');
      ok('1b. the Victim\'s turn start pays the temp HP again: a card naming Heroism, the Cleric\'s modifier as temphp, receipted on it',
        !!grant && (tg?.key === 'Heroism') && (tg?.type === 'temphp') && (tg?.total === mod) && !!receipt && (Number(victim.system.attributes.hp.temp) === mod),
        `card=${!!grant} flag=${JSON.stringify(tg && { key: tg.key, type: tg.type, total: tg.total })} receipt=${!!receipt} temp=${victim.system.attributes.hp.temp} mod=${mod}`);
      await combat.nextTurn();   // the Cleric — round 2
      const stray1c = await watch(() => grantCards()[n0 + 1] ?? null, { ms: 400 });   // a window: no grant at the Cleric's turn
      ok('1c. the Cleric\'s turn pays nothing', !stray1c && (grantCards().length === n0 + 1), `cards=${grantCards().length} stray=${!!stray1c}`);
      await combat.nextTurn();   // the Victim again
      const second = await until(() => grantCards()[n0 + 1] ?? null, { timeout: 10000 });
      ok('1d. the next round pays once more — once per turn, one card each', !!second && (grantCards().length === n0 + 2), `cards=${grantCards().length}`);
      await combat.previousTurn?.();
      const stray1e = await watch(() => grantCards()[n0 + 2] ?? null, { ms: 300 });   // a window: no grant on the step back
      ok('1e. a backward step pays nothing', !stray1e && (grantCards().length === n0 + 2), `cards=${grantCards().length} stray=${!!stray1e}`);
      await endCombat();
      await clearVictim();
    });

    // ================================================== 2. Hold Person at the turn end
    if (want(2)) await section(2, async () => {
      stage('§2');
      await healFull();
      const cast = await castAt('Hold Person', '-30');
      const paralyzed = await until(() => effectNamed('Paralyzed'), { timeout: 8000 });
      ok('2a. Hold Person fails the Victim: Paralyzed stands, receipted on the cast card', !!cast && !!paralyzed && !!cast?.getFlag(MOD, 'effectReceipt')?.targets?.some(t => t.effects?.some(e => e.id === paralyzed.id)),
        `cast=${!!cast} paralyzed=${!!paralyzed} outcome=${cast?.getFlag(MOD, 'saves')?.targets?.[0]?.outcome}`);
      await startCombat();
      const n0 = repeatCards().length;
      await combat.nextTurn();   // → the Victim's turn
      const stray2b = await watch(() => repeatCards()[n0] ?? null, { ms: 400 });   // a window: no repeat at the turn START
      ok('2b. the Victim\'s turn START raises nothing (Hold Person repeats at the END)', !stray2b && (repeatCards().length === n0), `cards=${repeatCards().length} stray=${!!stray2b}`);
      await combat.nextTurn();   // the Victim's turn ENDS
      const first = await settledRepeat(n0 + 1);
      const f1 = first?.getFlag(MOD, 'saves');
      const r1 = first?.getFlag(MOD, 'repeatSave');
      ok('2c. the turn end raises a saves demand pinned to the Victim — Wisdom, the spell\'s DC, effectsHandled "repeat", the cast\'s activity',
        !!first && (f1?.abilities?.[0] === 'wis') && (f1?.dc === actOf('Hold Person', 'save')?.save?.dc?.value) && (f1?.effectsHandled === 'repeat')
          && (f1?.targets?.length === 1) && (f1.targets[0].uuid === victim.uuid) && (f1?.activityUuid === actOf('Hold Person', 'save')?.uuid) && f1?.pinnedTargets,
        `flag=${JSON.stringify(f1 && { abilities: f1.abilities, dc: f1.dc, handled: f1.effectsHandled, targets: f1.targets.map(t => t.name), pinned: f1.pinnedTargets })}`);
      ok('2d. the save failed (−30): Paralyzed holds and the card says so',
        (f1?.targets?.[0]?.outcome === 'failed') && !!effectNamed('Paralyzed') && (r1?.says === 'Paralyzed holds — the save failed') && (r1?.ended === false) && (r1?.cause === 'turnEnd'),
        `outcome=${f1?.targets?.[0]?.outcome} paralyzed=${!!effectNamed('Paralyzed')} says="${r1?.says}"`);
      await wisBonus('+30');
      await combat.nextTurn();   // the Cleric
      await combat.nextTurn();   // the Victim
      await combat.nextTurn();   // the Victim's turn ends again
      const second = await settledRepeat(n0 + 2);
      const f2 = second?.getFlag(MOD, 'saves');
      const r2 = second?.getFlag(MOD, 'repeatSave');
      await until(() => effectNamed('Paralyzed') ? null : true, { timeout: 6000 });
      const receiptEntry = cast?.getFlag(MOD, 'effectReceipt')?.targets?.find(t => t.uuid === victim.uuid)?.effects?.find(e => e.id === paralyzed?.id);
      ok('2e. the save succeeded (+30): Paralyzed is REMOVED through the cast card\'s receipt (reverted), the card says it ended',
        (f2?.targets?.[0]?.outcome === 'saved') && !effectNamed('Paralyzed') && (r2?.ended === true) && (r2?.says === 'Paralyzed ended — the save succeeded') && (receiptEntry?.reverted === true),
        `outcome=${f2?.targets?.[0]?.outcome} paralyzed=${!!effectNamed('Paralyzed')} says="${r2?.says}" reverted=${receiptEntry?.reverted}`);
      const line = await until(() => document.querySelector(`[data-message-id="${second?.id}"] .bf-repeat-line`) ?? null, { timeout: 6000 });
      ok('2f. the line renders on the card', /Paralyzed ended/.test(line?.textContent ?? ''), `line="${line?.textContent?.trim()}"`);
      await combat.nextTurn();   // the Cleric
      await combat.nextTurn();   // the Victim
      await combat.nextTurn();   // the Victim's turn ends with no effect standing
      // a window: no repeat from any of the three turn changes (their windows end to end, none shorter)
      const stray2g = await watch(() => repeatCards()[n0 + 2] ?? null, { ms: 1400 });
      ok('2g. with the effect gone, a turn end raises nothing', !stray2g && (repeatCards().length === n0 + 2), `cards=${repeatCards().length} stray=${!!stray2g}`);
      await endCombat();
      await clearVictim();
    });

    // ================================================== 10. Sleep (2024)
    if (want(10)) await section(10, async () => {
      stage('§10');
      await healFull();
      const cast = await castAt('Sleep', '-30');
      const sleeping = await until(() => effectNamed('Sleeping'), { timeout: 8000 });
      ok('10a. Sleep fails the Victim: Sleeping (Incapacitated) stands, receipted on the cast card',
        !!cast && !!sleeping && sleeping.statuses?.has?.('incapacitated') && !!cast?.getFlag(MOD, 'effectReceipt')?.targets?.some(t => t.effects?.some(e => e.id === sleeping.id)),
        `cast=${!!cast} sleeping=${!!sleeping} statuses=${[...(sleeping?.statuses ?? [])].join(',')} outcome=${cast?.getFlag(MOD, 'saves')?.targets?.[0]?.outcome}`);
      await startCombat();
      const n0 = repeatCards().length;
      await combat.nextTurn();   // the Victim's turn
      await combat.nextTurn();   // the Victim's turn ENDS
      const first = await settledRepeat(n0 + 1);
      const r1 = first?.getFlag(MOD, 'repeatSave');
      const count = await until(() => effectNamed('Sleeping')?.getFlag(MOD, 'repeatCount')?.locked ? effectNamed('Sleeping').getFlag(MOD, 'repeatCount') : null, { timeout: 8000 });
      await until(() => victim.statuses.has('unconscious') ? true : null, { timeout: 8000 });
      ok('10b. the failed repeat locks Sleeping and presses Unconscious; the count records the press; the card says so',
        (r1?.says === 'Sleeping holds — the first failure: Unconscious') && !!count?.locked && (count?.pressed === 'unconscious') && victim.statuses.has('unconscious') && !!effectNamed('Sleeping'),
        `says="${r1?.says}" count=${JSON.stringify(count)} unconscious=${victim.statuses.has('unconscious')}`);
      await combat.nextTurn();   // the Cleric
      await combat.nextTurn();   // the Victim
      await combat.nextTurn();   // the Victim's turn ends again — locked: nothing asked
      // a window: no repeat from any of the three turn changes (their windows end to end, none shorter)
      const stray10c = await watch(() => repeatCards()[n0 + 1] ?? null, { ms: 1400 });
      ok('10c. locked: the next turn end asks nothing', !stray10c && (repeatCards().length === n0 + 1), `cards=${repeatCards().length} stray=${!!stray10c}`);
      await victim.applyDamage([{ value: 3, type: 'bludgeoning' }]);
      const ended = await until(() => repeatCards().find(m => m.getFlag(MOD, 'repeatSave')?.cause === 'damaged' && m.getFlag(MOD, 'repeatSave')?.ended) ?? null, { timeout: 10000 });
      await until(() => (!effectNamed('Sleeping') && !victim.statuses.has('unconscious')) ? true : null, { timeout: 8000 });
      const sleepEntry = cast?.getFlag(MOD, 'effectReceipt')?.targets?.find(t => t.uuid === victim.uuid)?.effects?.find(e => e.id === sleeping?.id);
      ok('10d. damage ENDS Sleeping outright (through the cast card\'s receipt) and lifts the Unconscious with it; a settled card says why',
        !!ended && !effectNamed('Sleeping') && !victim.statuses.has('unconscious') && (sleepEntry?.reverted === true) && /Sleeping ends on .* it took damage \(Unconscious with it\)/.test(ended?.getFlag(MOD, 'repeatSave')?.says ?? ''),
        `card=${!!ended} says="${ended?.getFlag(MOD, 'repeatSave')?.says}" sleeping=${!!effectNamed('Sleeping')} unconscious=${victim.statuses.has('unconscious')} reverted=${sleepEntry?.reverted}`);
      await endCombat();
      await clearVictim();
      // the sentence's other half: Immunity to Exhaustion cannot be put to sleep
      const ciBefore = foundry.utils.deepClone(victim.system._source.traits?.ci ?? { value: [], custom: '' });
      await victim.update({ 'system.traits.ci.value': [...new Set([...(ciBefore.value ?? []), 'exhaustion'])] });
      const cast2 = await castAt('Sleep', '-30');
      const stray10e = await watch(() => effectNamed('Sleeping'), { ms: 600 });   // a window: Sleeping must not land
      const t2 = cast2?.getFlag(MOD, 'saves')?.targets?.[0];
      ok('10e. with Immunity to Exhaustion the cast\'s save cannot fail: recorded a success, the source named, nothing lands',
        !stray10e && (t2?.outcome === 'saved') && !effectNamed('Sleeping') && JSON.stringify(t2?.sources ?? t2 ?? {}).includes('Immunity to Exhaustion'),
        `outcome=${t2?.outcome} sleeping=${!!effectNamed('Sleeping')} stray=${!!stray10e} entry=${JSON.stringify(t2 && { outcome: t2.outcome, sources: t2.sources })}`);
      await victim.update({ 'system.traits.ci': ciBefore });
      await clearVictim();
    });

    // ================================================== 11. Sleep's Sphere is the caster's choice
    if (want(11)) await section(11, async () => {
      stage('§11');
      const dummy = game.actors.getName('BTB Test Dummy');
      if (!dummy) throw new Error('missing fixture: BTB Test Dummy — run tools/fixture-suite.mjs');
      const uiMod = await import(`/modules/${MOD}/scripts/ui.js`);
      const sleepAct = actOf('Sleep', 'save');
      const sleepAreas = () => scene.regions.filter(r => r.getFlag('dnd5e', 'activity') === sleepAct.uuid);
      /** No Sleep standing: the Victim cleared, the concentration ended, every Sleep area gone (a later cast's area would read both). */
      const freshen = async () => {
        await clearVictim();
        const old = sleepAreas().map(r => r.id);
        if (old.length) await scene.deleteEmbeddedDocuments('Region', old).catch(() => {});   // a spent area the module swept meanwhile
        await until(() => !sleepAreas().length, { timeout: 8000, label: 'no Sleep area left on the range' });
        await healFull();
      };
      /** A bare cast — nobody targeted, no template: the card's demand waits for its area. */
      const castBare = async () => {
        game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
        const use = await sleepAct.use({ consume: { spellSlot: false }, create: { measuredTemplate: false } }, { configure: false }, {});
        const card = use?.message instanceof ChatMessage ? use.message : null;
        if (!card) throw new Error('the bare Sleep made no card');
        await until(() => card.getFlag(MOD, 'saves')?.awaitingTemplate === true, { timeout: 8000, label: 'the bare Sleep\'s demand waiting for its area' });
        return card;
      };
      /** The Sphere as the placement writes it — a region carrying the cast's activity — over the four squares of the
       * spot's 2×2 block, inset from their edges so no neighbour's edge lies inside (containment samples a token's edges). */
      const placeSphere = async card => {
        const [region] = await scene.createEmbeddedDocuments('Region', [{
          name: 'Sleep [test]', color: game.user.color,
          shapes: [{ type: 'rectangle', x: (spot.x * g) + 6, y: (spot.y * g) + 6, width: (2 * g) - 12, height: (2 * g) - 12 }],
          flags: { dnd5e: { activity: sleepAct.uuid } } }], { dnd5e: { createActivityBehaviors: false } });
        areas.push(region.id);
        try { ui.chat?.updateMessage?.(card); } catch { /* the next render adopts */ }
        return region;
      };
      const askPopup = card => {
        const d = uiMod.livePopups.get(`${card.id}|metamagicAsk`);
        return (d?.rendered && d.element?.querySelector?.('[data-bf-metamagic-ask="choose"]')) ? d : null;
      };
      const askRows = el => [...(el?.querySelectorAll('input[name="bf-metamagic-ask"]') ?? [])].map(i => ({ name: i.dataset.name, uuid: i.value, checked: i.checked }));
      const cardLine = card => document.querySelector(`[data-message-id="${card.id}"] .bf-area-choice`)?.textContent?.trim() ?? null;
      let friend = null;
      try {
        await freshen();
        await saveBonusFor('Sleep', '-30');
        // The Victim's token is the suite's own (the teardown deletes it): HOSTILE to the Cleric whatever its prototype says.
        if (victimToken.document.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) await victimToken.document.update({ disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE });

        // 11a. The Sphere over the Victim and the Cleric: the caster is never a candidate, every hostile is the choice.
        const card1 = await castBare();
        await placeSphere(card1);
        const filled1 = await until(() => card1.getFlag(MOD, 'saves')?.targets?.length ? card1.getFlag(MOD, 'saves') : null, { timeout: 10000, label: 'the Sphere filled the waiting demand' });
        const record1 = card1.getFlag(MOD, 'areaChoice');
        const asked1 = !!card1.getFlag(MOD, 'metamagicAsk') || !!uiMod.livePopups.get(`${card1.id}|metamagicAsk`);
        const line1 = await until(() => cardLine(card1), { timeout: 5000, label: 'the chosen area\'s card line' });
        ok('11a. the Sphere over the Victim and its caster asks nobody: the Victim alone owes the save, the default rides the card (not asked) and the card says who',
          !asked1 && (filled1.targets.length === 1) && (filled1.targets[0].uuid === victim.uuid) && (record1?.asked === false)
            && (record1?.chosen?.length === 1) && !record1?.left?.length && (line1 === `Sleep — chosen: ${victimToken.document.name}`),
          `asked=${asked1} targets=${(filled1.targets ?? []).map(t => t.name).join(',')} record=${JSON.stringify(record1 && { asked: record1.asked, chosen: record1.chosen?.map(c => c.name), left: record1.left?.map(c => c.name) })} line="${line1}"`);
        await until(() => card1.getFlag(MOD, 'saves')?.targets?.[0]?.applied ? true : null, { timeout: 15000, label: 'the Victim\'s verdict applied' });
        await freshen();
        await saveBonusFor('Sleep', '-30');

        // The Cleric's friend below the Victim, inside the Sphere's block: an unlinked Dummy, FRIENDLY.
        const [doc] = await scene.createEmbeddedDocuments('Token', [foundry.utils.mergeObject(dummy.prototypeToken.toObject(),
          { x: spot.x * g, y: (spot.y + 1) * g, actorId: dummy.id, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY }, { inplace: false })]);
        placed.push(doc.id);
        friend = await tokenOn(doc.id);
        const friendActor = friend.actor;
        const friendWears = () => friendActor.effects.some(e => e.name === 'Sleeping') || friendActor.statuses.has('incapacitated');

        // 11b. The friend in the Sphere: the caster is asked who it affects.
        const card = await castBare();
        await placeSphere(card);
        const ask = await until(() => askPopup(card), { timeout: 10000, label: 'the ask "Who does Sleep affect?"' });
        const rows = askRows(ask.element);
        const victimRow = rows.find(r => r.uuid === victim.uuid);
        const friendRow = rows.find(r => r.uuid === friendActor.uuid);
        const heldEmpty = !(card.getFlag(MOD, 'saves')?.targets?.length);
        ok('11b. the friend in the Sphere asks the caster WHO IT AFFECTS: two rows — never the Cleric — the Victim ticked, the friend not, the demand waiting empty',
          (rows.length === 2) && !rows.some(r => r.uuid === cleric.uuid) && !!victimRow?.checked && !!friendRow && !friendRow.checked && heldEmpty,
          `rows=${rows.map(r => `${r.name}:${r.checked}`).join(',')} heldEmpty=${heldEmpty}`);
        const text = ask.element?.textContent?.replace(/\s+/g, ' ') ?? '';
        ok('11c. it asks in the spell\'s own words — "Who does Sleep affect?", no number, and the sentence that grants the choice',
          /Who does Sleep affect\?/.test(text) && !/Up to/.test(text) && /Each creature of your choice in a 5-foot-radius Sphere/.test(text), text.slice(0, 200));
        const pending = await until(() => document.querySelector(`[data-message-id="${card.id}"] .bf-metamagic-ask`)?.textContent?.trim() ?? null, { timeout: 5000, label: 'the card\'s pending line' });
        ok('11d. the card says what it waits on', /Sleep — who does it affect\?/.test(pending ?? ''), pending);

        // 11e. OK keeps the default: only the Victim saves; it fails and sleeps; the friend is untouched.
        ask.element.querySelector('button[data-action="ok"]')?.click();
        const filled = await until(() => card.getFlag(MOD, 'saves')?.targets?.length ? card.getFlag(MOD, 'saves') : null, { timeout: 10000, label: 'the answer filled the demand' });
        const record = card.getFlag(MOD, 'areaChoice');
        ok('11e. OK → the Victim alone owes the save; the choice rides the card, asked, no number, the friend left out',
          (filled.targets.length === 1) && (filled.targets[0].uuid === victim.uuid) && (record?.asked === true) && (record?.cap === null)
            && (record?.chosen?.length === 1) && (record?.left?.length === 1) && (record.left[0].uuid === friendActor.uuid),
          `targets=${filled.targets.map(t => t.name).join(',')} record=${JSON.stringify(record && { asked: record.asked, cap: record.cap, chosen: record.chosen?.map(c => c.name), left: record.left?.map(c => c.name) })}`);
        const line = await until(() => cardLine(card), { timeout: 5000, label: 'the chosen area\'s card line' });
        ok('11f. the card line names the chosen and the not chosen', line === `Sleep — chosen: ${victimToken.document.name} · not chosen: ${friend.document.name}`, line);
        const sleeping = await until(() => effectNamed('Sleeping'), { timeout: 10000, label: 'Sleeping on the Victim' });
        await until(() => card.getFlag(MOD, 'saves')?.targets?.[0]?.applied ? true : null, { timeout: 10000, label: 'the Victim\'s verdict applied' });
        const stray11g = await watch(() => friendWears(), { ms: 600 });   // a window: nothing must land on the friend
        ok('11g. the chosen Victim fails and Sleeping (Incapacitated) lands, receipted on the cast card; the friend has no save and nothing lands on it',
          !!sleeping?.statuses?.has?.('incapacitated') && !!card.getFlag(MOD, 'effectReceipt')?.targets?.some(t => t.effects?.some(e => e.id === sleeping.id))
            && !stray11g && !(card.getFlag(MOD, 'saves')?.targets ?? []).some(t => t.uuid === friendActor.uuid),
          `sleeping=${!!sleeping} outcome=${card.getFlag(MOD, 'saves')?.targets?.[0]?.outcome} friend=${stray11g ? 'touched' : 'untouched'}`);

        // 11h. The chosen sleeper keeps the spell's own course: its turn end repeats, the failure presses Unconscious.
        await startCombat();
        const n0 = repeatCards().length;
        await combat.nextTurn();   // the Victim's turn
        await combat.nextTurn();   // the Victim's turn ENDS
        const first = await settledRepeat(n0 + 1);
        await until(() => victim.statuses.has('unconscious') ? true : null, { timeout: 8000, label: 'Unconscious pressed on the Victim' });
        ok('11h. the chosen sleeper\'s turn end repeats the save as §10: the failure presses Unconscious, the card says so',
          (first?.getFlag(MOD, 'repeatSave')?.says === 'Sleeping holds — the first failure: Unconscious') && victim.statuses.has('unconscious') && !friendWears(),
          `says="${first?.getFlag(MOD, 'repeatSave')?.says}" unconscious=${victim.statuses.has('unconscious')} friend=${friendWears() ? 'touched' : 'untouched'}`);
      } finally {
        await endCombat();
        await freshen();
        if (friend && scene.tokens.get(friend.id)) await scene.deleteEmbeddedDocuments('Token', [friend.id]).catch(() => {});
      }
    });

    // ================================================== 3. Tasha's on damage
    if (want(3)) await section(3, async () => {
      stage('§3');
      await healFull();
      const cast = await castAt("Tasha's Hideous Laughter", '-30');
      const laughing = await until(() => effectNamed('Uncontrollable Laughter'), { timeout: 8000 });
      ok('3a. the laughter lands', !!cast && !!laughing, `cast=${!!cast} effect=${!!laughing}`);
      const n0 = repeatCards().length;
      await victim.applyDamage([{ value: 3, type: 'bludgeoning' }]);
      const card = await settledRepeat(n0 + 1);
      const flag = card?.getFlag(MOD, 'saves');
      const rep = card?.getFlag(MOD, 'repeatSave');
      const roll = flag?.targets?.[0]?.rollMessageId ? game.messages.get(flag.targets[0].rollMessageId) : null;
      const rollAdv = roll?.rolls?.[0]?.options?.advantage ?? roll?.rolls?.[0]?.hasAdvantage ?? null;
      ok('3b. damage raises the repeat (cause damaged) with the demand\'s own Advantage; the auto roll rolls it with Advantage',
        !!card && (rep?.cause === 'damaged') && (flag?.demand?.bend?.mode === 'advantage') && (rollAdv === true),
        `cause=${rep?.cause} bend=${JSON.stringify(flag?.demand?.bend)} rollAdv=${rollAdv} formula=${roll?.rolls?.[0]?.formula}`);
      ok('3c. the save failed: the laughter holds', (flag?.targets?.[0]?.outcome === 'failed') && !!effectNamed('Uncontrollable Laughter'), `outcome=${flag?.targets?.[0]?.outcome}`);
      await victim.applyDamage([{ value: 5, type: 'healing' }]);
      const stray3d = await watch(() => repeatCards()[n0 + 1] ?? null, { ms: 800 });   // a window: healing raises no repeat
      ok('3d. healing raises nothing', !stray3d && (repeatCards().length === n0 + 1), `cards=${repeatCards().length} stray=${!!stray3d}`);
      // An unanswered repeat blocks a second: prompt mode leaves the demand open, then a turn end asks nothing more.
      await set('saveRolls', 'prompt');
      try {
        const t0 = Date.now();
        await victim.applyDamage([{ value: 2, type: 'bludgeoning' }]);
        const open = await until(() => repeatCards().find(m => m.timestamp >= t0) ?? null, { timeout: 8000 });
        // the second blow's gate reads the open demand as unanswered
        await until(() => (open.getFlag(MOD, 'saves')?.status === 'pending') ? true : null, { label: 'the open repeat pending' });
        await victim.applyDamage([{ value: 2, type: 'bludgeoning' }]);
        // a window: no second repeat while one is open, nor a double of the first (both blows' windows end to end)
        const stray3e = await watch(() => repeatCards()[n0 + 2] ?? null, { ms: 1200 });
        ok('3e. while a repeat is unanswered, more damage raises no second one', !stray3e && !!open && (open.getFlag(MOD, 'saves')?.status === 'pending') && (repeatCards().length === n0 + 2),
          `open=${!!open} status=${open?.getFlag(MOD, 'saves')?.status} cards=${repeatCards().length} stray=${!!stray3e}`);
      } finally {
        for (const app of [...foundry.applications.instances.values()]) { if (app.rendered && app.element?.querySelector?.('[data-bf-save-demand]')) { try { await app.close(); } catch { /* gone */ } } }
        await set('saveRolls', 'auto');   // back to the suite's own baseline, never the world's prior
      }
      await clearVictim();
    });

    // ================================================== 4. Otto's: the action, offered
    if (want(4)) await section(4, async () => {
      stage('§4');
      await healFull();
      const cast = await castAt("Otto's Irresistible Dance", '-30');
      const dance = await until(() => effectNamed('Irresistible Dance'), { timeout: 8000 });
      ok('4a. the dance lands', !!cast && !!dance, `cast=${!!cast} effect=${!!dance}`);
      await startCombat();
      const n0 = repeatCards().length;
      const o0 = offerCards().length;
      await combat.nextTurn();   // the Victim's turn starts
      const offer = await until(() => offerCards()[o0] ?? null, { timeout: 8000 });
      const of = offer?.getFlag(MOD, 'repeatOffer');
      const repeatButton = () => [...(document.querySelector(`[data-message-id="${offer?.id}"]`)?.querySelectorAll('button') ?? [])].find(b => /Repeat the save/.test(b.textContent ?? ''));
      // the button is the card's rendered decoration, drawn after the document
      await until(repeatButton, { label: 'the offer\'s Repeat button drawn' });
      const stray4b = await watch(() => repeatCards()[n0] ?? null, { ms: 400 });   // a window: the offer raises no demand
      ok('4b. the Victim\'s turn start OFFERS the save (a card, no demand): the effect named, the button drawn',
        !stray4b && !!offer && (of?.key === "Otto's Irresistible Dance") && (repeatCards().length === n0)
          && !!repeatButton(),
        `offer=${!!offer} key=${of?.key} demands=${repeatCards().length - n0}`);
      await combat.nextTurn();   // the Victim's turn ENDS — an action row asks nothing by the clock
      const stray4c = await watch(() => repeatCards()[n0] ?? null, { ms: 800 });   // a window: no demand at the turn end
      ok('4c. the turn end raises no demand for an action row', !stray4c && (repeatCards().length === n0), `cards=${repeatCards().length} stray=${!!stray4c}`);
      await wisBonus('+30');
      const button = repeatButton();
      button?.click();
      const card = await settledRepeat(n0 + 1);
      const rep = card?.getFlag(MOD, 'repeatSave');
      await until(() => effectNamed('Irresistible Dance') ? null : true, { timeout: 6000 });
      ok('4d. the button raises the demand (cause action); the success ends the dance', !!card && (rep?.cause === 'action') && (rep?.ended === true) && !effectNamed('Irresistible Dance'),
        `card=${!!card} cause=${rep?.cause} ended=${rep?.ended} dance=${!!effectNamed('Irresistible Dance')}`);
      await endCombat();
      await clearVictim();
    });

    // ================================================== 5. Flesh to Stone: the count
    if (want(5)) await section(5, async () => {
      stage('§5');
      await healFull();
      const cast = await castAt('Flesh to Stone', '-30');
      const stone = await until(() => effectNamed('Turning to Stone'), { timeout: 8000 });
      ok('5a. Turning to Stone lands', !!cast && !!stone, `cast=${!!cast} effect=${!!stone}`);
      await startCombat();
      const n0 = repeatCards().length;
      const endTurn = async () => { await combat.nextTurn(); await combat.nextTurn(); };
      await combat.nextTurn();   // → the Victim
      await combat.nextTurn();   // ends — the first failure
      const c1 = await settledRepeat(n0 + 1);
      const t1 = effectNamed('Turning to Stone')?.getFlag(MOD, 'repeatCount');
      ok('5b. the first failure tallies on the effect (1 of 3) and the card counts', (t1?.fails === 1) && (c1?.getFlag(MOD, 'repeatSave')?.says === 'Turning to Stone holds — 1 of 3 failures'),
        `tally=${JSON.stringify(t1)} says="${c1?.getFlag(MOD, 'repeatSave')?.says}"`);
      await endTurn();
      const c2 = await settledRepeat(n0 + 2);
      ok('5c. the second: 2 of 3', (effectNamed('Turning to Stone')?.getFlag(MOD, 'repeatCount')?.fails === 2) && /2 of 3/.test(c2?.getFlag(MOD, 'repeatSave')?.says ?? ''),
        `tally=${JSON.stringify(effectNamed('Turning to Stone')?.getFlag(MOD, 'repeatCount'))}`);
      await endTurn();
      const c3 = await settledRepeat(n0 + 3);
      const petrified = await until(() => victim.statuses?.has?.('petrified') ? true : null, { timeout: 6000 });
      const t3 = effectNamed('Turning to Stone')?.getFlag(MOD, 'repeatCount');
      ok('5d. the third failure presses Petrified, locks the count, and the effect stands under it',
        !!petrified && (t3?.fails === 3) && (t3?.locked === true) && !!effectNamed('Turning to Stone') && /third failure: Petrified/.test(c3?.getFlag(MOD, 'repeatSave')?.says ?? ''),
        `petrified=${!!petrified} tally=${JSON.stringify(t3)} says="${c3?.getFlag(MOD, 'repeatSave')?.says}"`);
      await endTurn();
      // a window: no repeat from either turn change (their windows end to end, none shorter)
      const stray5e = await watch(() => repeatCards()[n0 + 3] ?? null, { ms: 1100 });
      ok('5e. locked: a fourth turn end asks nothing', !stray5e && (repeatCards().length === n0 + 3), `cards=${repeatCards().length} stray=${!!stray5e}`);
      await endCombat();
      await clearVictim();
    });

    // ================================================== 6. Warding Bond: the share
    const clericHp = () => cleric.system.attributes.hp.value;
    const victimHp = () => victim.system.attributes.hp.value;
    if (want(6)) await section(6, async () => {
      stage('§6');
      await healFull();
      spells['Warding Bond'] = await lend('Warding Bond', 'spell');
      if (!spells['Warding Bond']) throw new Error('the PHB ships no "Warding Bond" this box can find');
      const shareCards = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'damageShare'));
      target();
      const use = await actOf('Warding Bond', 'utility').use({ consume: { spellSlot: false } }, { configure: false }, {});
      const bonded = await until(() => effectNamed('Bonded'), { timeout: 12000 });
      ok('6a. the cast lands Bonded on the Victim (the cast path), its origin the Cleric\'s spell', !!use?.message && !!bonded && (bonded.system?.origin?.item === cleric.items.get(spells['Warding Bond'].id)?.uuid),
        `card=${!!use?.message} bonded=${!!bonded} origin=${bonded?.system?.origin?.item}`);
      // Damage from a CARD (the applier's seam needs an originating message): 10 fire lands as 5 through the bond's resistance.
      const origin = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: cleric }), content: '<p>a blow from the dark</p>' });
      const hp0 = clericHp();
      const vhp0 = victimHp();
      const n0 = shareCards().length;
      await victim.applyDamage([{ value: 10, type: 'fire' }], { originatingMessage: origin });
      const share = await until(() => shareCards()[n0] ?? null, { timeout: 10000 });
      const s1 = share?.getFlag(MOD, 'damageShare');
      const receipt = await until(() => share?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === cleric.uuid) ?? null, { timeout: 8000 });
      const landed = vhp0 - victimHp();
      await until(() => (clericHp() === hp0 - landed) ? true : null, { timeout: 6000 });
      ok('6b. the damage that LANDED on the Victim (5: the bond\'s resistance already taken) is taken by the Cleric too — a card, the same number, a receipt on it, the Hit Points down',
        !!share && (s1?.shares === true) && (s1?.amount === landed) && (landed === 5) && !!receipt && (clericHp() === hp0 - landed),
        `card=${!!share} flag=${JSON.stringify(s1 && { shares: s1.shares, amount: s1.amount, landed: s1.landed, why: s1.why, distance: s1.distanceFeet })} landed=${landed} receipt=${!!receipt} cleric=${hp0}→${clericHp()}`);
      // 65 feet apart: the bond is out of reach.
      // EVERY token of the Victim (the fixture's home token stands beside the Cleric's): the bond reads the nearest pair.
      const vicTokens = scene.tokens.filter(t => t.actorId === victim.id);
      const vHomes = vicTokens.map(t => ({ id: t.id, x: t.x, y: t.y }));
      // ⚠ The bond's distance reads the token DOCUMENTS: an awaited move has landed, nothing to wait for.
      try {
        for (const t of vicTokens) await t.update({ x: 300, y: 1900 }, { teleport: true, animate: false });   // the range's far corner: 70 ft from the Cleric's HOME token too (the bond reads the nearest pair); east of the spot runs off the scene, refused without a word
        const hp1 = clericHp();
        await victim.applyDamage([{ value: 10, type: 'fire' }], { originatingMessage: origin });
        const far = await until(() => shareCards()[n0 + 1] ?? null, { timeout: 8000 });
        const s2 = far?.getFlag(MOD, 'damageShare');
        const stray6c = await watch(() => clericHp() !== hp1, { ms: 600 });   // a window: no share lands on the Cleric
        ok('6c. 65 ft apart: the card says the bond is beyond its 60 feet and the Cleric takes nothing', !stray6c && !!far && (s2?.shares === false) && /beyond the bond/.test(s2?.why ?? '') && (clericHp() === hp1) && !!effectNamed('Bonded'),
          `card=${!!far} flag=${JSON.stringify(s2 && { shares: s2.shares, why: s2.why, distance: s2.distanceFeet })} cleric=${hp1}→${clericHp()}`);
      } finally {
        for (const h of vHomes) await scene.tokens.get(h.id)?.update({ x: h.x, y: h.y }, { teleport: true, animate: false });
      }
      // The caster's drop: 3 HP, a share of 5 → 0 → the bond ends.
      await cleric.update({ 'system.attributes.hp.value': 3 });
      await victim.applyDamage([{ value: 10, type: 'fire' }], { originatingMessage: origin });
      const drop = await until(() => shareCards()[n0 + 2] ?? null, { timeout: 8000 });
      const gone = await until(() => effectNamed('Bonded') ? null : true, { timeout: 8000 });
      const s3 = await until(() => drop?.getFlag(MOD, 'damageShare')?.ended ? drop.getFlag(MOD, 'damageShare') : null, { timeout: 8000 });
      ok('6d. the Cleric dropped to 0 by the share: Bonded gone, the card says the bond ended', !!drop && !!gone && (clericHp() === 0) && /0 Hit Points/.test(s3?.ended ?? ''),
        `card=${!!drop} bonded=${!!effectNamed('Bonded')} cleric=${clericHp()} ended="${s3?.ended}"`);
      await cleric.update({ 'system.attributes.hp.value': priorClericHp });
      await clearVictim();
      await healFull();
    });

    // ================================================== 7. Vampiric Touch: the heal on hit
    if (want(7)) await section(7, async () => {
      stage('§7');
      await healFull();
      spells['Vampiric Touch'] = await lend('Vampiric Touch', 'spell');
      if (!spells['Vampiric Touch']) throw new Error('the PHB ships no "Vampiric Touch" this box can find');
      const priorAc = { 'system.attributes.ac.calc': victim.system._source.attributes.ac.calc, 'system.attributes.ac.flat': victim.system._source.attributes.ac.flat };
      await victim.update({ 'system.attributes.ac.calc': 'flat', 'system.attributes.ac.flat': 1 });
      await cleric.update({ 'system.attributes.hp.value': 5 });
      const healCards = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'healOnHit')?.casterUuid);
      const t7 = Date.now();
      clericToken.control({ releaseOthers: true });   // synchronous, as the targeting is
      target();
      const rolls = await actOf('Vampiric Touch', 'attack').rollAttack({}, { configure: false }, {});
      const atk = rolls?.[0]?.parent ?? null;
      const dmg = await until(() => game.messages.find(m => (m.timestamp >= t7) && (m.type === 'damage') && (m._source.system?.origin === atk?.id)) ?? null, { timeout: 15000 });
      const receipt = await until(() => dmg?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === victim.uuid) ?? null, { timeout: 15000 });
      const heal = await until(() => healCards().find(m => m.getFlag(MOD, 'healOnHit')?.originId === dmg?.id) ?? null, { timeout: 10000 });
      const h = heal?.getFlag(MOD, 'healOnHit');
      const hreceipt = await until(() => heal?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === cleric.uuid) ?? null, { timeout: 8000 });
      const half = Math.floor(Number(receipt?.taken ?? 0) / 2);
      await until(() => (clericHp() === 5 + half) ? true : null, { timeout: 6000 });
      ok('7a. the hit (AC 1) lands its necrotic damage on the Victim; the Cleric regains HALF of what landed — a card, a receipt on it, the Hit Points up',
        !!atk && !!dmg && !!receipt && (Number(receipt.taken) > 0) && !!heal && (h?.amount === half) && (half > 0) && !!hreceipt && (clericHp() === 5 + half),
        `attack=${!!atk} damage=${!!dmg} taken=${receipt?.taken} heal=${!!heal} flag=${JSON.stringify(h && { amount: h.amount, why: h.why, target: h.targetName })} receipt=${!!hreceipt} cleric=5→${clericHp()}`);
      ok('7b. the dealing card carries the once-latch for the Victim', (dmg?.getFlag(MOD, 'healOnHit')?.done ?? []).includes(victim.uuid), `done=${JSON.stringify(dmg?.getFlag(MOD, 'healOnHit')?.done)}`);
      clericToken.release();
      await victim.update(priorAc);
      await cleric.update({ 'system.attributes.hp.value': priorClericHp });
      await clearVictim();
      await healFull();
    });

    // ================================================== 8. Prismatic Spray: the rays
    if (want(8)) await section(8, async () => {
      stage('§8');
      await healFull();
      spells['Prismatic Spray'] = await lend('Prismatic Spray', 'spell');
      if (!spells['Prismatic Spray']) throw new Error('the PHB ships no "Prismatic Spray" this box can find');
      const spray = cleric.items.get(spells['Prismatic Spray'].id);
      const castAct = spray.system.activities.find(a => a.name === 'Cast');
      const indigoAct = spray.system.activities.find(a => a.name === 'Indigo Save (Con)');
      const rayCards = since => game.messages.contents.filter(m => (m.timestamp >= since) && (m.getFlag(MOD, 'prismaticRay')?.targetUuid === victim.uuid));   // the Victim's rays (a fixture may share the cone)
      const summaryCards = since => game.messages.contents.filter(m => (m.timestamp >= since) && m.getFlag(MOD, 'prismaticRays'));
      const px = scene.dimensions?.distancePixels ?? (g / scene.grid.distance);
      /** The cone as the placement would write it, apex on the Cleric, pointing WEST at the Victim (10 ft, wide). */
      const placeCone = async () => (await scene.createEmbeddedDocuments('Region', [{
        name: 'Prismatic Spray [test]', color: game.user.color,
        shapes: [{ type: 'cone', x: clericToken.document.x + g / 2, y: clericToken.document.y + g / 2, radius: 10 * px, angle: 30, rotation: 180, curvature: 'round' }],
        flags: { dnd5e: { activity: castAct.uuid, item: spray.uuid, origin: clericToken.document.uuid, spellLevel: 1 } } }], { dnd5e: { createActivityBehaviors: false } }))[0];
      const castSpray = async () => {
        target();
        const use = await castAct.use({ consume: { spellSlot: false }, create: { measuredTemplate: false } }, { configure: false }, {});
        return use?.message instanceof ChatMessage ? use.message : null;
      };
      // Every d8 a 6 (indigo); the d20 a 14 (the same draw) — the saves are steered by ±30 anyway.
      faces([[6, 8]]);
      await saveBonusFor('Prismatic Spray', '-30');   // the FIRST save activity is the Cast (Dexterity)
      await victim.update({ 'system.abilities.con.save.roll.bonus': '-30' });
      const t8 = Date.now();
      const card = await castSpray();
      const sv = card?.getFlag(MOD, 'saves');
      const pf = card?.getFlag(MOD, 'prismatic');
      // a window: no 12d6 rolled off the cast's card
      const castDamage = await watch(() => game.messages.find(m => (m.timestamp >= t8) && (m.type === 'damage') && (m._source.system?.origin === card?.id)) ?? null, { ms: 600 });
      ok('8a. the cast\'s card is born with its demand CLOSED (done, no targets, effectsHandled "prismatic") and the ray claim pending; no 12d6 rolled at the cast',
        !!card && (sv?.status === 'done') && (sv?.targets?.length === 0) && (sv?.effectsHandled === 'prismatic') && (pf?.status === 'pending') && !castDamage,
        `card=${!!card} saves=${JSON.stringify(sv && { status: sv.status, targets: sv.targets.length, handled: sv.effectsHandled })} prismatic=${JSON.stringify(pf)} castDamage=${!!castDamage}`);
      const region = await placeCone();
      // soft: no ray at all reads as `rays.length === 0` in 8b
      const rays = await until(() => { const r = rayCards(t8); return r.length ? r : null; }, { timeout: 12000 }).catch(() => null) ?? [];
      const summary = summaryCards(t8)[0] ?? null;
      const r1 = rays[0]?.getFlag(MOD, 'prismaticRay');
      const rs = rays[0]?.getFlag(MOD, 'saves');
      ok('8b. the cone stands: a summary card (the d8 a 6 — indigo) and ONE ray demand for the Victim against "Indigo Save (Con)" — Constitution, pinned, effectsHandled "prismatic", no damage',
        !!summary && (rays.length === 1) && (r1?.colour === 'indigo') && (r1?.face === 6) && (rs?.activityUuid === indigoAct?.uuid) && (rs?.abilities?.[0] === 'con') && (rs?.pinnedTargets === true) && (rs?.effectsHandled === 'prismatic') && (rs?.hasDamage === false) && (rs?.targets?.[0]?.uuid === victim.uuid),
        `summary=${!!summary} rays=${rays.length} ray=${JSON.stringify(r1 && { colour: r1.colour, face: r1.face, save: r1.save, effect: r1.effect })} saves=${JSON.stringify(rs && { activity: rs.activityUuid === indigoAct?.uuid, abilities: rs.abilities, pinned: rs.pinnedTargets, handled: rs.effectsHandled, hasDamage: rs.hasDamage })} entries=${JSON.stringify(summary?.getFlag(MOD, 'prismaticRays')?.entries)}`);
      const claimed = await until(() => (card?.getFlag(MOD, 'prismatic')?.status === 'rolled') ? true : null, { timeout: 6000 });
      const swept = await until(() => scene.regions.get(region.id) ? null : true, { timeout: 8000 });
      ok('8c. the claim is spent (rolled) and the cone region is gone — instantaneous', !!claimed && !!swept, `status=${card?.getFlag(MOD, 'prismatic')?.status} region=${!!scene.regions.get(region.id)}`);
      const settled = await until(() => rays[0]?.getFlag(MOD, 'prismaticRay')?.says ? rays[0].getFlag(MOD, 'prismaticRay') : null, { timeout: 15000 });
      const restrained = await until(() => effectNamed('Petrifying (Indigo)'), { timeout: 8000 });
      const er = rays[0]?.getFlag(MOD, 'effectReceipt')?.targets?.find(t => t.uuid === victim.uuid) ?? null;
      ok('8d. the save FAILS (−30): Petrifying (Indigo) lands on the Victim by the machine, receipted on the ray card; the line says so',
        (settled?.outcome === 'failed') && !!restrained && restrained.statuses?.has?.('restrained') && !!er && /lands/.test(settled?.says ?? ''),
        `settled=${JSON.stringify(settled && { outcome: settled.outcome, says: settled.says })} effect=${!!restrained} receipt=${!!er}`);
      const el = await until(() => document.querySelector(`[data-message-id="${rays[0]?.id}"] .bf-ray-line`) ?? null, { timeout: 4000 });
      ok('8e. the ray card renders its line', /lands/.test(el?.textContent ?? ''), `line="${el?.textContent?.trim()}"`);
      // The repeat, at the Victim's turn end, against the row's NAMED save.
      await startCombat();
      const n0 = repeatCards().length;
      await combat.nextTurn();
      await combat.nextTurn();
      const rep = await settledRepeat(n0 + 1);
      const rf = rep?.getFlag(MOD, 'saves');
      const rr = rep?.getFlag(MOD, 'repeatSave');
      ok('8f. the Victim\'s turn end repeats the INDIGO save — the row\'s named activity (Constitution), keyed "Prismatic Spray (Indigo)"; the first failure tallies 1 of 3',
        !!rep && (rf?.activityUuid === indigoAct?.uuid) && (rf?.abilities?.[0] === 'con') && (rr?.key === 'Prismatic Spray (Indigo)') && /1 of 3 failures/.test(rr?.says ?? ''),
        `card=${!!rep} activity=${rf?.activityUuid === indigoAct?.uuid} abilities=${JSON.stringify(rf?.abilities)} key=${rr?.key} says="${rr?.says}"`);
      await endCombat();
      await clearVictim();
      // A DAMAGE ray: every d8 a 1 (red — fire, not the part's first type, acid).
      faces([[1, 8]]);   // the d20 a 2, each d6 a 1 (the same draw)
      const t8b = Date.now();
      const card2 = await castSpray();
      const region2 = await placeCone();
      // soft: no ray at all reads as `rays2.length === 0` in 8g
      const rays2 = await until(() => { const r = rayCards(t8b); return r.length ? r : null; }, { timeout: 12000 }).catch(() => null) ?? [];
      const r2 = rays2[0]?.getFlag(MOD, 'prismaticRay');
      const rs2 = rays2[0]?.getFlag(MOD, 'saves');
      const dmg2 = await until(() => game.messages.find(m => (m.timestamp >= t8b) && (m.type === 'damage') && (m._source.system?.origin === rays2[0]?.id)) ?? null, { timeout: 12000 });
      ok('8g. the red ray: the demand is the Cast\'s Dexterity save with damage (half on a success), and the 12d6 rolled against it wears FIRE — the ray\'s type, not the pack\'s first',
        !!card2 && (rays2.length === 1) && (r2?.colour === 'red') && (r2?.type === 'fire') && (rs2?.activityUuid === castAct.uuid) && (rs2?.abilities?.[0] === 'dex') && (rs2?.hasDamage === true) && !!dmg2 && /12d6/.test(dmg2?.rolls?.[0]?.formula ?? '') && (dmg2?.rolls?.[0]?.options?.type === 'fire'),
        `rays=${rays2.length} ray=${JSON.stringify(r2 && { colour: r2.colour, type: r2.type })} saves=${JSON.stringify(rs2 && { cast: rs2.activityUuid === castAct.uuid, abilities: rs2.abilities, hasDamage: rs2.hasDamage })} formula=${dmg2?.rolls?.[0]?.formula} type=${dmg2?.rolls?.[0]?.options?.type}`);
      // soft: a cone the machine did not sweep is deleted here
      await until(() => scene.regions.get(region2.id) ? null : true, { timeout: 8000 }).catch(() => null);
      await scene.regions.get(region2.id)?.delete().catch(() => {});
      // ⚠ The red ray's damage lands a few seconds after its verdict: wait for the application, or it lands in §9 (2026-09-28: 12 fire off the Victim's pool there).
      await until(() => game.messages.get(rays2[0]?.id)?.getFlag(MOD, 'saves')?.targets?.every(x => x.applied) ? true : null, { timeout: 15000 });
      // the damage card's own receipt on the Victim: the 12d6 landed (a damage card that arrives after the verdict lands then)
      await until(() => dmg2?.getFlag(MOD, 'receipt')?.targets?.some(t => t.uuid === victim.uuid), { timeout: 8000, label: 'the red ray\'s damage receipted on the Victim' });
      faces([[5, 20]]);
      await victim.update({ 'system.abilities.con.save.roll.bonus': priorCon });
      await clearVictim();
      await healFull();
    });

    // ================================================== 9. Regeneration — the bearer's own trait
    if (want(9)) await section(9, async () => {
      stage('§9');
      let regen = null;
      try {
        await clearVictim();
        await healFull();
        const pack = game.packs.get('dnd-monster-manual.features');
        const hit = (await pack?.getIndex())?.find(e => e.name === 'Regeneration');
        if (!hit) throw new Error('the Monster Manual ships no "Regeneration" this box can find');
        const src = await pack.getDocument(hit._id);
        [regen] = await victim.createEmbeddedDocuments('Item', [src.toObject()]);
        const heal = regen.system.activities.find(a => a.type === 'heal');
        if (!heal) throw new Error('the lent Regeneration carries no heal activity');
        // The monster's own copy: the troll's words and the troll's number (the pack's item names neither).
        await regen.update({
          'system.description.value': '<p>The troll regains 10 Hit Points at the start of each of its turns. If the troll takes Acid or Fire damage, this trait doesn\'t function on the troll\'s next turn.</p>',
          [`system.activities.${heal.id}.healing`]: { number: null, denomination: null, bonus: '', custom: { enabled: true, formula: '10' }, types: ['healing'] }
        });
        // A goblin has 11 HP: a pool of 40 so the heal shows (teardown restores the pool).
        const vMax = 40;
        await victim.update({ 'system.attributes.hp.max': vMax, 'system.attributes.hp.value': vMax - 20 });
        const hpNow = () => Number(victim.system.attributes.hp.value);
        await startCombat();
        const n0 = grantCards().length;
        await combat.nextTurn();   // the Victim's turn — round 1
        const grant = await until(() => grantCards()[n0] ?? null, { timeout: 10000 });
        const receipt = await until(() => grant?.getFlag(MOD, 'receipt'), { timeout: 8000 });
        const tg = grant?.getFlag(MOD, 'turnGrant');
        ok('9a. the Victim\'s turn start pays its own Regeneration: a card naming it, 10 healing rolled on the bearer, receipted, the Hit Points up by 10',
          !!grant && (tg?.key === 'Regeneration') && (tg?.type === 'healing') && (tg?.total === 10) && (tg?.effectUuid === null) && !!receipt && (hpNow() === vMax - 10)
            && /own Regeneration/.test(grant?.content ?? ''),
          `card=${!!grant} flag=${JSON.stringify(tg && { key: tg.key, type: tg.type, total: tg.total, effectUuid: tg.effectUuid })} receipt=${!!receipt} hp=${hpNow()}/${vMax}`);
        // Fire dealt to it during its own turn: a receipt in the module's shape, the damage landed.
        const stamp = `${combat.id}:${combat.round}:${combat.turn}`;
        const prior = { value: hpNow(), temp: 0, tempmax: 0 };
        await victim.applyDamage([{ value: 8, type: 'fire' }]);
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: cleric }), content: '<p>BTB test — 8 fire to the Victim</p>',
          flags: { [MOD]: { receipt: { targets: [{ uuid: victim.uuid, name: victim.name, img: null, note: 'BTB test fire', prior, delta: { value: -8, temp: 0 }, taken: 8,
            parts: [{ type: 'fire', amount: 8 }], traits: [], reverted: false, combat: stamp, sourceUuid: cleric.uuid }] } } } });
        const hpAfterFire = hpNow();
        await combat.nextTurn();   // the Cleric — round 2
        await combat.nextTurn();   // the Victim — round 2: blocked
        const blocked = await until(() => grantCards()[n0 + 1] ?? null, { timeout: 10000 });
        const bf = blocked?.getFlag(MOD, 'turnGrant');
        // a window: the blocked turn writes no receipt and heals nothing
        const stray9b = await watch(() => !!blocked?.getFlag(MOD, 'receipt') || (hpNow() !== hpAfterFire), { ms: 600 });
        ok('9b. fire since its last turn: the next turn start pays NOTHING — a card says it took Fire damage, no receipt, the Hit Points unchanged',
          !stray9b && !!blocked && (bf?.key === 'Regeneration') && (bf?.blocked === 'fire') && !blocked?.getFlag(MOD, 'receipt') && (hpNow() === hpAfterFire) && /regains nothing this turn/.test(blocked?.content ?? ''),
          `card=${!!blocked} flag=${JSON.stringify(bf && { key: bf.key, blocked: bf.blocked, why: bf.why })} receipt=${!!blocked?.getFlag(MOD, 'receipt')} hp=${hpNow()} stray=${!!stray9b}`);
        await combat.nextTurn();   // the Cleric — round 3
        await combat.nextTurn();   // the Victim — round 3: the fire is behind its last turn
        const again = await until(() => grantCards()[n0 + 2] ?? null, { timeout: 10000 });
        await until(() => again?.getFlag(MOD, 'receipt'), { timeout: 8000 });
        ok('9c. the turn after pays again — the fire lies before its last turn start', !!again && (again.getFlag(MOD, 'turnGrant')?.total === 10) && (hpNow() === hpAfterFire + 10),
          `cards=${grantCards().length} hp=${hpNow()}`);
        await victim.update({ 'system.attributes.hp.value': 0 });
        await combat.nextTurn();
        await combat.nextTurn();   // the Victim at 0 HP
        // a window: no grant from either turn change (their windows end to end, none shorter)
        const stray9d = await watch(() => grantCards()[n0 + 3] ?? null, { ms: 1500 });
        ok('9d. at 0 Hit Points nothing is paid and no card posts', !stray9d && (grantCards().length === n0 + 3), `cards=${grantCards().length} hp=${hpNow()} stray=${!!stray9d}`);
        await endCombat();
      } finally {
        await endCombat();
        await regen?.delete().catch(() => {});
        await clearVictim();
        await healFull();
      }
    });

    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  } finally {
    await teardown();
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: 'spells', out, plan, f });
