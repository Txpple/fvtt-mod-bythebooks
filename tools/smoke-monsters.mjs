// SMOKE — THE MONSTER MANUAL'S WAITING ROWS BUILT (RULINGS *The Monster Manual — the waiting rows built*):
// BTB Test Monster is lent each trait by name from `dnd-monster-manual.features` and uses it at BTB Test Victim;
// the machines the rows sit on are driven from there. Sections: `--section 2`, `--list`. Fixtures and teardown
// ALWAYS run: the lent traits go back, the Victim's strays and the placed tokens go, the combat is deleted.
//
//   node tools/smoke-monsters.mjs [--section N ...] [--list]
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from './harness.mjs';

// THE COVERAGE MAP (tools/coverage-map.mjs) — ⚠ NEVER import a suite; the map is parsed.
export const COVERS = [
  'repeat-saves.js',        // §1 — a monster's own activity repeats at the target's turn end (Pacifying Spores); §2 the escalation (Petrifying Bite: Petrified instead of Restrained)
  'turn-grants.js',         // §3 — the grappled target's damage at its own turn start (Constricting Vine) and turn end (Swarm of Proboscises); §4 the grappler's own turn start (Barbed Hide)
  'emanations.js',          // §5 — the fire auras' pulse at the bearer's turn end (Flame Aura); §6 Gibbering's turn-start demand; §7 the alerts — Watery Rebuke on a move-in, Unnerving Gaze on a turn start
  'clock-riders.js',        // §8 — Chaos Blade's d4: one of the attack's four conditions lands on the hit, the card says which
  'drains.js',              // §9 — Life Drain's fall of the maximum by what landed, stacking; Draining Swipe's Strength by the text's d4
  'drop-to-one.js',         // §10 — Spiteful Escape held at 1 (outright too); Misty Escape's notice at the death's side
  'rest-grants.js',         // §11 — Cursed Touch: a Long Rest grants nothing while Cursed stands, the card says so
  'damage-shields.js',      // §12 — Corrosive Form: the Monster's own trait strikes the melee attacker
  'rebukes.js',             // §13 — Fiendish Blood offered on piercing or slashing damage, not on fire
  'reminders.js',           // §14 — Object Slam's Advantage when the target stands inside the Monster's space, none beside it
  'hold/trigger.js',        // §15 — Reflective Carapace: a ranged spell attack's hit is turned aside on the hold (absorbed), a melee hit is not
  'hold/continue.js'
];

const SECTIONS = {
  1: 'PACIFYING SPORES: the Monster\'s save fails the Victim (Stunned lands from the trait); the Victim\'s turn END raises the repeat — Constitution at the trait\'s DC, not a spell; a failure holds, a success ends it',
  2: 'PETRIFYING BITE: the First Save lands Restrained; the turn end repeats on the SECOND Save; the failure presses Petrified INSTEAD — the Restrained gone, the card says so',
  3: 'CONSTRICTING VINE and SWARM OF PROBOSCISES: the grappled Victim takes the vine\'s "Damage: Grappled" at its own turn START, receipted; the swarm\'s at its turn END; nothing once the grapple ends',
  4: 'BARBED HIDE: the Monster\'s own turn start deals its damage to the creature it grapples (the Victim, Grappled by it), receipted; nothing when it grapples no one',
  5: 'FLAME AURA: a ring off the damage activity\'s Emanation; the Monster\'s turn END rolls the fire once and lands it on the Victim inside, receipted; the Victim outside takes nothing',
  6: 'GIBBERING: the Victim starting its turn inside the ring is demanded the Wisdom save (cause turnStart); the Monster Incapacitated, nothing',
  7: 'THE ALERTS: Watery Rebuke — the Victim moving within 5 feet raises the reminder card (hewNotice, the Reaction from the sheet); Unnerving Gaze — the Victim STARTING its turn within 30 feet raises it (cause turnStart), once per turn',
  8: 'CHAOS BLADE: the Monster\'s hit lands ONE of the attack\'s four conditions by a d4 (the rider records the face and the name); a hit with another attack lands none',
  9: 'THE DRAIN: Life Drain\'s hit lowers the Victim\'s Hit Point maximum by what landed (an effect on it, receipted on the drain\'s card); a second hit refreshes the one copy with the total; Draining Swipe\'s hit rolls the text\'s d4 and lands the pack\'s "Hit: STR Score −N"',
  10: 'THE VAMPIRE\'S DROP: Spiteful Escape holds the Monster at 1 on a drop (killed outright too), a card says so; Misty Escape at 0 posts the notice card (nothing used)',
  11: 'THE CURSE ON A REST: Cursed (from Cursed Touch) on the Victim — a Long Rest regains nothing, the rest card says why; the curse gone, the rest heals',
  12: 'CORROSIVE FORM: the Victim\'s melee hit on the Monster is answered by the Monster\'s own trait — the acid rolled, landed on the Victim, receipted',
  13: 'FIENDISH BLOOD: slashing damage to the Monster offers the Reaction (the rebuke card, pending); fire offers nothing',
  14: 'OBJECT SLAM: the Victim standing INSIDE the Monster\'s space — the attack\'s gate reads Advantage for Object Slam alone (not for a Claw); beside it, nothing',
  15: 'REFLECTIVE CARAPACE: the Victim\'s Fire Bolt hits the Monster — the hold rolls the carapace\'s d6, the hit is ABSORBED (no damage lands), the card says the spell is turned aside; a Longsword hit is not answered'
};
const DEPENDS = {};

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'monsters', watchdogMs: 600_000 });
announcePlan('monsters', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, watch, canvasReady, tokenOn, snapshotSettings, faces, unrig } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const suiteStart = Date.now();
  // The module's own errors, into the log (they say what failed and where).
  const realError = console.error;
  console.error = (...a) => { try { log.push(`ERR ${a.map(x => (x instanceof Error) ? `${x.message}\n${x.stack}` : String(x)).join(' ').slice(0, 900)}`); } catch { /* the log */ } realError(...a); };

  const mod = game.modules.get(MOD);
  if (!mod?.active) return { fatal: `module active=${mod?.active}` };
  if (!game.settings.settings.has(`${MOD}.decisionTimer`)) return { fatal: 'decisionTimer not registered — OLD code (reload the box)' };

  const SETTING_KEYS = ['decisionTimer', 'dramaticBeat', 'saveRolls', 'playerRollDamage'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { set } = settings;

  const scene = game.scenes.getName('By the Books Test Range');
  const monster = game.actors.getName('BTB Test Monster');
  const victim = game.actors.getName('BTB Test Victim');
  if (!scene || !monster || !victim) return { fatal: 'missing fixture: the test range, BTB Test Monster or BTB Test Victim — run tools/fixture-suite.mjs' };

  const lent = [];
  const placed = [];
  // ⚠ An UNLINKED token of the Victim (smoke-bythebooks's permanent one) shares the base actor's effects: a Grappled
  // put on BTB Test Victim grapples it too (§4a dealt twice). Set aside for the run, put back with its own id.
  const asideVictims = scene ? scene.tokens.filter(t => (t.actorId === victim?.id) && !t.actorLink).map(t => t.toObject()) : [];
  let combat = null;
  const priorActiveCombats = [];
  const priorHp = { value: victim.system._source.attributes.hp.value, max: victim.system._source.attributes.hp.max, temp: victim.system._source.attributes.hp.temp };
  const priorSaves = Object.fromEntries(['con', 'wis', 'dex', 'str'].map(a => [a, victim.system._source.abilities?.[a]?.save?.roll?.bonus ?? '']));
  const priorVictimEffects = new Set(victim.effects.map(e => e.id));
  const priorMonsterEffects = new Set(monster.effects.map(e => e.id));
  const priorMonsterHp = monster.system._source.attributes.hp.value;
  // ⚠ Every die a 5: a natural 20 SUCCEEDS a 2024 save whatever the bonus, and the saves here are steered by ±30.
  faces([[5, 20]]);
  let restored = false;
  const teardown = async () => {
    if (restored) return;
    restored = true;
    unrig();
    console.error = realError;
    for (const failed of await settings.restore()) log.push(`TEARDOWN settings ERROR: ${failed}`);
    try {
      try { if (combat && game.combats.get(combat.id)) await combat.delete(); } catch { /* gone */ }
      for (const id of priorActiveCombats) { try { await game.combats.get(id)?.update({ active: true }); } catch { /* gone */ } }
      const strays = victim.effects.filter(e => !priorVictimEffects.has(e.id)).map(e => e.id);
      if (strays.length) await victim.deleteEmbeddedDocuments('ActiveEffect', strays);
      const mstrays = monster.effects.filter(e => !priorMonsterEffects.has(e.id)).map(e => e.id);
      if (mstrays.length) await monster.deleteEmbeddedDocuments('ActiveEffect', mstrays);
      const live = lent.filter(id => monster.items.get(id));
      if (live.length) await monster.deleteEmbeddedDocuments('Item', live);
      const tokens = placed.filter(id => scene.tokens.get(id));
      if (tokens.length) await scene.deleteEmbeddedDocuments('Token', tokens);
      const back = asideVictims.filter(t => !scene.tokens.get(t._id));
      if (back.length) await scene.createEmbeddedDocuments('Token', back, { keepId: true });
      await victim.update({ 'system.attributes.hp.value': priorHp.value, 'system.attributes.hp.max': priorHp.max, 'system.attributes.hp.temp': priorHp.temp,
        ...Object.fromEntries(Object.entries(priorSaves).map(([a, v]) => [`system.abilities.${a}.save.roll.bonus`, v])) });
      await monster.update({ 'system.attributes.hp.value': priorMonsterHp });
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      const mine = game.messages.filter(m => (m.timestamp >= suiteStart)
        && ((m.speaker?.actor === monster.id) || (m.speaker?.actor === victim.id) || Object.keys(m.flags?.[MOD] ?? {}).length));
      if (mine.length) await ChatMessage.deleteDocuments(mine.map(m => m.id));
    } catch (err) {
      log.push(`TEARDOWN ERROR: ${err?.message}`);
    }
  };

  try {
    if (asideVictims.length) await scene.deleteEmbeddedDocuments('Token', asideVictims.map(t => t._id));
    await set('decisionTimer', 0);
    await set('dramaticBeat', 0);
    await set('saveRolls', 'auto');   // the demanded saves roll themselves; the bonus steers the verdict
    await set('playerRollDamage', false);

    /** The Monster Manual's trait by name, on the Monster; taken back at the end. */
    const lendTrait = async name => {
      const have = monster.items.find(i => i.name === name);
      if (have) return have;
      const pack = game.packs.get('dnd-monster-manual.features');
      if (!pack) throw new Error('the Monster Manual features pack is not on this box');
      const hit = (await pack.getIndex()).find(e => e.name === name);
      if (!hit) throw new Error(`the Monster Manual ships no "${name}" this box can find`);
      const src = await pack.getDocument(hit._id);
      const [item] = await monster.createEmbeddedDocuments('Item', [src.toObject()]);
      lent.push(item.id);
      return item;
    };
    const takeBack = async name => {
      const ids = monster.items.filter(i => i.name === name).map(i => i.id);
      if (ids.length) await monster.deleteEmbeddedDocuments('Item', ids);
    };
    const actOf = (item, { type = null, name = null } = {}) => [...(monster.items.get(item.id)?.system.activities ?? [])]
      .find(a => (name ? (a.name === name) : true) && (type ? (a.type === type) : true)) ?? null;

    if (canvas.scene?.id !== scene.id) await scene.view();
    await canvasReady();
    const g = scene.grid.size;
    const monsterToken = canvas.tokens.placeables.find(t => t.actor?.uuid === monster.uuid) ?? null;
    if (!monsterToken) return { fatal: 'BTB Test Monster has no token on the range — run tools/fixture-suite.mjs', results, log, skips };
    /** The Victim's own token, placed `squares` from the Monster (the fixture line moves under walks). */
    const placeVictim = async (squares = 1) => {
      const [doc] = await scene.createEmbeddedDocuments('Token', [foundry.utils.mergeObject(victim.prototypeToken.toObject(),
        { x: monsterToken.document.x + squares * g, y: monsterToken.document.y, actorId: victim.id, actorLink: true }, { inplace: false })]);
      placed.push(doc.id);
      await tokenOn(doc.id);
      return canvas.tokens.get(doc.id);
    };
    const victimToken = await placeVictim(1);
    if (!victimToken) return { fatal: 'the Victim\'s token never reached the canvas', results, log, skips };

    const target = () => { game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); }); victimToken.setTarget(true, { releaseOthers: true }); };
    const saveBonus = (ability, v) => victim.update({ [`system.abilities.${ability}.save.roll.bonus`]: v });
    const healFull = () => victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max, 'system.attributes.hp.temp': 0 });
    const hpNow = () => Number(victim.system.attributes.hp.value);
    const effectNamed = name => victim.effects.find(e => e.name === name) ?? null;
    const clearVictim = async () => {
      // ⚠ dnd5e takes its own Bloodied off as the Hit Points rise, so a sweep that races a heal deletes a document
      // already gone ("does not exist"): Bloodied is left to the system, and a loser of the race is logged, not thrown.
      const strays = victim.effects.filter(e => !priorVictimEffects.has(e.id) && !e.statuses?.has?.('bloodied')).map(e => e.id);
      const live = strays.filter(id => victim.effects.has(id));
      if (live.length) await victim.deleteEmbeddedDocuments('ActiveEffect', live).catch(err => log.push(`clearVictim: ${err?.message ?? err}`));
    };
    const cardsWith = flag => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, flag));
    const repeatCards = () => cardsWith('repeatSave');
    const grantCards = () => cardsWith('turnGrant');
    const settledRepeat = async (n, timeout = 15000) => until(() => {
      const cards = repeatCards();
      const c = cards[n - 1];
      return (cards.length >= n) && c?.getFlag(MOD, 'repeatSave')?.says ? c : null;
    }, { timeout });

    /** The Monster uses a save activity at the Victim with the save steered: the demand card, its verdict done. */
    const useAt = async (activity, bonus) => {
      const ability = [...(activity?.save?.ability ?? [])][0] ?? 'con';
      await saveBonus(ability, bonus);
      target();
      const use = await activity.use({ consume: { resources: false, uses: false } }, { configure: false }, {});
      const card = use?.message instanceof ChatMessage ? use.message : null;
      if (!card) return null;
      await until(() => card.getFlag(MOD, 'saves')?.targets?.[0]?.applied ? true : null, { timeout: 15000 });
      return card;
    };

    const startCombat = async () => {
      for (const c of game.combats.filter(c => c.active)) { priorActiveCombats.push(c.id); await c.update({ active: false }); }
      combat = await Combat.create({ scene: scene.id, active: true });
      await combat.createEmbeddedDocuments('Combatant', [{ tokenId: monsterToken.id, actorId: monster.id, initiative: 20 }, { tokenId: victimToken.id, actorId: victim.id, initiative: 10 }]);
      await combat.startCombat();   // the Monster's turn
      if (game.combat?.id !== combat.id) { try { ui.combat.viewed = combat; } catch { /* the tracker */ } }
      await until(() => combat.started && (combat.combatant?.actorId === monster.id), { label: 'the Monster\'s turn' });
    };
    /** The combat's next turn, the tracker on it before the next step. */
    const advance = async () => {
      const at = `${combat.round}.${combat.turn}`;
      await combat.nextTurn();
      await until(() => `${combat.round}.${combat.turn}` !== at, { label: 'the next turn' });
    };
    const endCombat = async () => {
      try { if (combat && game.combats.get(combat.id)) await combat.delete(); } catch { /* gone */ }
      combat = null;
    };
    /** The pack's Grappled effect from a trait's attack, landed on the Victim as the tray would (origin: the activity). */
    const grappleFrom = async (item, effectName = 'Grappled') => {
      const activity = actOf(item, { type: 'attack' });
      const src = item.effects.find(e => e.name === effectName) ?? item.effects.contents[0];
      if (!src) throw new Error(`${item.name} ships no "${effectName}" effect`);
      const data = src.toObject();
      data.origin = activity?.uuid ?? item.uuid;
      data.disabled = false;
      const [fx] = await victim.createEmbeddedDocuments('ActiveEffect', [data]);
      return fx;
    };

    // ================================================== 1. Pacifying Spores
    if (want(1)) await section(1, async () => {
      await healFull();
      const spores = await lendTrait('Pacifying Spores');
      const save = actOf(spores, { type: 'save' });
      const card = await useAt(save, '-30');
      const stunned = await until(() => effectNamed('Stunned'), { timeout: 8000 });
      ok('1a. the Monster\'s Pacifying Spores fails the Victim: Stunned stands, its origin the trait\'s activity',
        !!card && !!stunned && /Pacifying Spores/.test(String(stunned?.origin ?? '')) || (!!stunned && (stunned.origin ?? '').includes(spores.id)),
        `card=${!!card} stunned=${!!stunned} origin=${stunned?.origin}`);
      await startCombat();
      const n0 = repeatCards().length;
      await combat.nextTurn();   // → the Victim's turn
      // the window for a WRONG repeat at the turn start
      const early = await watch(() => (repeatCards().length !== n0) ? `cards=${repeatCards().length}` : null, { ms: 400 });
      ok('1b. the Victim\'s turn START raises nothing', !early && (repeatCards().length === n0), `cards=${repeatCards().length} seen=${early}`);
      await combat.nextTurn();   // the Victim's turn ENDS
      const first = await settledRepeat(n0 + 1);
      const f1 = first?.getFlag(MOD, 'saves');
      const r1 = first?.getFlag(MOD, 'repeatSave');
      ok('1c. the turn end raises a saves demand pinned to the Victim — Constitution, the trait\'s DC, effectsHandled "repeat", NOT a spell',
        !!first && (f1?.abilities?.[0] === 'con') && (f1?.dc === save?.save?.dc?.value) && (f1?.effectsHandled === 'repeat')
          && (f1?.targets?.length === 1) && (f1.targets[0].uuid === victim.uuid) && (f1?.demand?.spell === false) && (r1?.key === 'Pacifying Spores'),
        `flag=${JSON.stringify(f1 && { abilities: f1.abilities, dc: f1.dc, handled: f1.effectsHandled, spell: f1.demand?.spell })} key=${r1?.key}`);
      ok('1d. the save failed (−30): Stunned holds and the card says so',
        (f1?.targets?.[0]?.outcome === 'failed') && !!effectNamed('Stunned') && (r1?.says === 'Stunned holds — the save failed') && (r1?.ended === false),
        `outcome=${f1?.targets?.[0]?.outcome} stunned=${!!effectNamed('Stunned')} says="${r1?.says}"`);
      await saveBonus('con', '+30');
      await advance();   // the Monster
      await advance();   // the Victim
      await combat.nextTurn();   // the Victim's turn ends again
      const second = await settledRepeat(n0 + 2);
      const r2 = second?.getFlag(MOD, 'repeatSave');
      await until(() => effectNamed('Stunned') ? null : true, { timeout: 6000 });
      ok('1e. the save succeeded (+30): Stunned is gone, the card says it ended',
        (second?.getFlag(MOD, 'saves')?.targets?.[0]?.outcome === 'saved') && !effectNamed('Stunned') && (r2?.ended === true) && (r2?.says === 'Stunned ended — the save succeeded'),
        `stunned=${!!effectNamed('Stunned')} says="${r2?.says}"`);
      await endCombat();
      await clearVictim();
      await takeBack('Pacifying Spores');
    });

    // ================================================== 2. Petrifying Bite — the escalation
    if (want(2)) await section(2, async () => {
      await healFull();
      const bite = await lendTrait('Petrifying Bite');
      const first = actOf(bite, { type: 'save', name: 'First Save' });
      const second = actOf(bite, { type: 'save', name: 'Second Save' });
      ok('2-pre. the pack ships the two saves', !!first && !!second, `first=${!!first} second=${!!second}`);
      await useAt(first, '-30');
      const restrained = await until(() => effectNamed('Restrained'), { timeout: 8000 });
      ok('2a. the First Save fails the Victim: Restrained stands from the trait', !!restrained, `restrained=${!!restrained}`);
      await startCombat();
      const n0 = repeatCards().length;
      await advance();   // → the Victim
      await combat.nextTurn();   // the Victim's turn ends — the second failure
      const card = await settledRepeat(n0 + 1);
      const fs = card?.getFlag(MOD, 'saves');
      const rs = card?.getFlag(MOD, 'repeatSave');
      const petrified = await until(() => victim.statuses?.has?.('petrified') ? true : null, { timeout: 6000 });
      await until(() => effectNamed('Restrained') ? null : true, { timeout: 6000 });
      ok('2b. the repeat runs on the SECOND Save (its activity), the Victim failing it',
        !!card && (fs?.activityUuid === second?.uuid) && (fs?.targets?.[0]?.outcome === 'failed') && (rs?.key === 'Petrifying Bite'),
        `activity=${fs?.activityUuid === second?.uuid} outcome=${fs?.targets?.[0]?.outcome}`);
      ok('2c. the failure presses Petrified INSTEAD of Restrained: the status on, the Restrained gone, the card says "instead"',
        !!petrified && !effectNamed('Restrained') && (rs?.ended === true) && /first failure: Petrified instead/.test(rs?.says ?? ''),
        `petrified=${!!petrified} restrained=${!!effectNamed('Restrained')} says="${rs?.says}"`);
      // the window for a WRONG repeat across the next turn end
      const asked = () => (repeatCards().length !== n0 + 1) ? `cards=${repeatCards().length}` : null;
      await combat.nextTurn();
      const early = await watch(asked, { ms: 300 });
      await combat.nextTurn();
      const late = await watch(asked, { ms: 800 });
      ok('2d. with the Restrained gone, the next turn end asks nothing', !early && !late && (repeatCards().length === n0 + 1), `cards=${repeatCards().length} seen=${early ?? late}`);
      await endCombat();
      await clearVictim();
      await takeBack('Petrifying Bite');
    });

    // ================================================== 3. Constricting Vine / Swarm of Proboscises — the grappled target's turns
    if (want(3)) await section(3, async () => {
      await healFull();
      const vine = await lendTrait('Constricting Vine');
      const grappled = await grappleFrom(vine, 'Grappled');
      ok('3-pre. Grappled stands on the Victim, its origin the vine\'s attack', !!grappled && String(grappled.origin ?? '').includes(vine.id), `origin=${grappled?.origin}`);
      await startCombat();
      const n0 = grantCards().length;
      const hp0 = hpNow();
      await combat.nextTurn();   // → the Victim's turn START
      const card = await until(() => grantCards()[n0] ?? null, { timeout: 10000 });
      await until(() => card?.getFlag(MOD, 'receipt'), { timeout: 8000 });
      const tg = card?.getFlag(MOD, 'turnGrant');
      ok('3a. the Victim\'s turn start deals the vine\'s "Damage: Grappled" (1d8 bludgeoning) to the Victim, receipted, the card naming the grapple',
        !!card && (tg?.key === 'Constricting Vine') && (tg?.deals === true) && (tg?.type === 'bludgeoning') && (tg?.total > 0) && (hpNow() === hp0 - tg.total) && !!card?.getFlag(MOD, 'receipt') && new RegExp(`takes ${tg?.total} bludgeoning`).test(card?.content ?? ''),
        `card=${!!card} flag=${JSON.stringify(tg && { key: tg.key, deals: tg.deals, type: tg.type, total: tg.total })} hp=${hpNow()} vs ${hp0}`);
      await combat.nextTurn();   // the Victim's turn ends
      // the windows for a WRONG grant card: at the turn end, then across the next turn start
      const paid = () => (grantCards().length !== n0 + 1) ? `cards=${grantCards().length}` : null;
      const atEnd = await watch(paid, { ms: 600 });
      ok('3b. the turn END pays nothing for the vine (its clock is the turn start)', !atEnd && (grantCards().length === n0 + 1), `cards=${grantCards().length} seen=${atEnd}`);
      await grappled.delete();
      await combat.nextTurn();   // the Monster
      const early = await watch(paid, { ms: 300 });
      await combat.nextTurn();   // the Victim, no longer grappled
      const late = await watch(paid, { ms: 800 });
      ok('3c. the grapple ended: the next turn start deals nothing', !early && !late && (grantCards().length === n0 + 1), `cards=${grantCards().length} seen=${early ?? late}`);
      await endCombat();
      await takeBack('Constricting Vine');
      // The swarm: the damage at the END of the target's turn.
      const swarm = await lendTrait('Swarm of Proboscises');
      const g2 = await grappleFrom(swarm, 'Grappled');
      await startCombat();
      const n1 = grantCards().length;
      const hp1 = hpNow();
      await combat.nextTurn();   // → the Victim's turn start
      // the window for a WRONG grant card at the turn start
      const atStart = await watch(() => (grantCards().length !== n1) ? `cards=${grantCards().length}` : null, { ms: 600 });
      ok('3d. the swarm pays nothing at the Victim\'s turn START', !atStart && (grantCards().length === n1), `cards=${grantCards().length} seen=${atStart}`);
      await combat.nextTurn();   // the Victim's turn END
      const c2 = await until(() => grantCards()[n1] ?? null, { timeout: 10000 });
      await until(() => c2?.getFlag(MOD, 'receipt'), { timeout: 8000 });
      const t2 = c2?.getFlag(MOD, 'turnGrant');
      ok('3e. the Victim\'s turn end deals the swarm\'s "Damage: Grappled" (2d6 necrotic), receipted, the card an end-of-turn one',
        !!c2 && (t2?.key === 'Swarm of Proboscises') && (t2?.type === 'necrotic') && (t2?.on === 'turnEnd') && (t2?.total > 0) && (hpNow() === hp1 - t2.total) && !!c2?.getFlag(MOD, 'receipt'),
        `flag=${JSON.stringify(t2 && { key: t2.key, type: t2.type, total: t2.total })} hp=${hpNow()} vs ${hp1}`);
      await g2.delete();
      await endCombat();
      await clearVictim();
      await takeBack('Swarm of Proboscises');
    });

    // ================================================== 4. Barbed Hide — the grappler's own turn start
    if (want(4)) await section(4, async () => {
      await healFull();
      await lendTrait('Barbed Hide');
      // The Victim Grappled BY the Monster: the module's own stamp names the grappler (Unarmed Fighting's finder).
      const [fx] = await victim.createEmbeddedDocuments('ActiveEffect', [{ name: 'Grappled', statuses: ['grappled'], origin: monster.uuid, flags: { [MOD]: { sourceUuid: monster.uuid } } }]);
      const nBefore = grantCards().length;
      await startCombat();   // the Monster's turn START (round 1) — its own deal lands first; the measured one is round 2's
      // ⚠ Round 1's card and receipt arrive on their own clock: read the baseline only once they have landed, or round 2's
      // damage reads as double (the suite's own race, not the machine's).
      // the receipt is written after the damage lands: the count and the Hit Points are the baseline once it stands
      await until(() => (grantCards().length > nBefore) && grantCards().at(-1)?.getFlag(MOD, 'receipt'), { timeout: 8000 });
      const n0 = grantCards().length;
      const hp0 = hpNow();
      await advance();   // the Victim
      await combat.nextTurn();   // → the Monster's turn start, round 2
      const card = await until(() => grantCards()[n0] ?? null, { timeout: 10000 });
      await until(() => card?.getFlag(MOD, 'receipt'), { timeout: 8000 });
      const tg = card?.getFlag(MOD, 'turnGrant');
      ok('4a. the Monster\'s turn start deals Barbed Hide\'s 1d10 piercing to the Victim it grapples, receipted, the card naming it',
        !!card && (tg?.key === 'Barbed Hide') && (tg?.deals === 'grappled') && (tg?.type === 'piercing') && (tg?.total > 0) && (tg?.targets?.[0]?.uuid === victim.uuid) && (hpNow() === hp0 - tg.total) && !!card?.getFlag(MOD, 'receipt'),
        `card=${!!card} flag=${JSON.stringify(tg && { key: tg.key, deals: tg.deals, total: tg.total, targets: tg.targets?.map(t => t.name) })} hp=${hpNow()} vs ${hp0}`);
      await fx.delete();
      // the window for a WRONG grant card across the Monster's next turn start
      const paid = () => (grantCards().length !== n0 + 1) ? `cards=${grantCards().length}` : null;
      await combat.nextTurn();
      const early = await watch(paid, { ms: 300 });
      await combat.nextTurn();   // the Monster again, grappling no one
      const late = await watch(paid, { ms: 800 });
      ok('4b. grappling no one, its turn start deals nothing', !early && !late && (grantCards().length === n0 + 1), `cards=${grantCards().length} seen=${early ?? late}`);
      await endCombat();
      await clearVictim();
      await takeBack('Barbed Hide');
    });

    // ================================================== the rings — helpers
    const TYPE = `${MOD}.emanation`;
    const mv = () => ({ teleport: true, animate: false });
    const featureRegion = key => scene.regions.find(r => { const f = r.getFlag(MOD, 'emanation'); return f?.kind === 'feature' && f.tokenId === monsterToken.document.id && f.key === key; }) ?? null;
    const ringOf = async key => until(() => { const r = featureRegion(key); return r?.behaviors?.find(b => b.type === TYPE) ? r : null; }, { timeout: 12000 });
    // the move's own update carries the token's regions: the membership the rings read stands once it resolves
    const moveVictim = async squares => { await victimToken.document.update({ x: monsterToken.document.x + squares * g, y: monsterToken.document.y }, mv()); };
    const triggerCards = () => cardsWith('emanationTrigger');
    const pulseCards = () => cardsWith('emanationPulse');
    const notices = label => game.messages.filter(m => (m.timestamp >= suiteStart) && (m.getFlag(MOD, 'hewNotice')?.label === label));
    const setIncapacitated = async (actor, on) => {
      const carriers = actor.effects.filter(e => e.statuses?.has?.('incapacitated'));
      if (on && !carriers.length) { const eff = await ActiveEffect.implementation.fromStatusEffect('incapacitated'); await ActiveEffect.implementation.create(eff.toObject(), { parent: actor, keepId: true }); }
      else if (!on && carriers.length) await actor.deleteEmbeddedDocuments('ActiveEffect', carriers.map(e => e.id));
    };
    const ringWanted = [5, 6, 7].some(n => want(n));
    if (ringWanted) {
      // The Victim turned FRIENDLY for the ring sections: the Monster's enemy (a harmful reach).
      await victimToken.document.update({ disposition: 1 });
      await until(() => victimToken.document.disposition === 1, { label: 'the Victim friendly' });
    }

    // ================================================== 5. Flame Aura — the pulse
    if (want(5)) await section(5, async () => {
      await healFull();
      const t5 = Date.now();
      const aura = await lendTrait('Flame Aura');
      const ring = await ringOf('Flame Aura');
      const beh = ring?.behaviors?.find(b => b.type === TYPE);
      ok('5a. Flame Aura lent: a ring rises on the Monster\'s token off the damage activity\'s Emanation, reaching all, no member effect',
        !!ring && (ring.shapes?.[0]?.radius > 0) && (beh?.system?.reach === 'all') && (beh?.system?.effect === null), `ring=${!!ring} radius=${ring?.shapes?.[0]?.radius} reach=${beh?.system?.reach}`);
      await moveVictim(1);   // inside
      await startCombat();   // the Monster's turn
      const hp0 = hpNow();
      await combat.nextTurn();   // the Monster's turn ENDS → the pulse
      const card = await until(() => pulseCards().find(m => (m.timestamp >= t5) && (m.getFlag(MOD, 'emanationPulse')?.key === 'Flame Aura')) ?? null, { timeout: 10000 });
      await until(() => card?.getFlag(MOD, 'receipt'), { timeout: 8000 });
      const p = card?.getFlag(MOD, 'emanationPulse');
      ok('5b. the Monster\'s turn end rolls the aura\'s fire once and lands it on the Victim inside, receipted',
        !!card && (p?.type === 'fire') && (p?.total > 0) && (p?.targets?.some(t => t.uuid === victim.uuid)) && (hpNow() === hp0 - p.total) && !!card?.getFlag(MOD, 'receipt'),
        `card=${!!card} flag=${JSON.stringify(p && { type: p.type, total: p.total, targets: p.targets?.map(t => t.name) })} hp=${hpNow()} vs ${hp0}`);
      await moveVictim(-6);   // 30 ft away on the near side, outside (a stray token may still sit inside the ring — the range is shared)
      await until(() => !featureRegion('Flame Aura')?.tokens?.has?.(victimToken.document), { label: 'the Victim outside the Flame Aura ring' });
      const hp1 = hpNow();
      const n1 = pulseCards().length;
      // the windows for a WRONG pulse on the Victim outside: its card naming it, or its Hit Points moving
      const struck = () => (pulseCards().slice(n1).some(m => m.getFlag(MOD, 'emanationPulse')?.targets?.some(x => x.uuid === victim.uuid)) || (hpNow() !== hp1))
        ? `hp=${hpNow()}` : null;
      await combat.nextTurn();   // the Victim
      const early = await watch(struck, { ms: 300 });
      await combat.nextTurn();   // the Monster's turn ends again, the Victim outside
      const late = await watch(struck, { ms: 1000 });
      const later = pulseCards().slice(n1);
      ok('5c. the Victim outside: the next turn end names it in no pulse and its Hit Points stand', !early && !late && !later.some(m => m.getFlag(MOD, 'emanationPulse')?.targets?.some(x => x.uuid === victim.uuid)) && (hpNow() === hp1),
        `later=${later.length} targets=${later.map(m => m.getFlag(MOD, 'emanationPulse')?.targets?.map(x => x.name).join('+')).join(';')} hp=${hpNow()} vs ${hp1} seen=${early ?? late}`);
      await endCombat();
      await aura.delete();
      await until(() => featureRegion('Flame Aura') ? null : true, { timeout: 8000 });
      await moveVictim(1);
    });

    // ================================================== 6. Gibbering — the turn-start ring
    if (want(6)) await section(6, async () => {
      await healFull();
      await saveBonus('wis', '-30');
      const t6 = Date.now();
      const gib = await lendTrait('Gibbering');
      const ring = await ringOf('Gibbering');
      ok('6a. Gibbering lent: a ring rises off the save activity\'s Emanation', !!ring && (ring.shapes?.[0]?.radius > 0), `ring=${!!ring}`);
      await moveVictim(1);
      await startCombat();
      const n0 = triggerCards().length;
      await combat.nextTurn();   // the Victim's turn STARTS inside
      const card = await until(() => triggerCards().find(m => (m.timestamp >= t6) && (m.getFlag(MOD, 'emanationTrigger')?.cause === 'turnStart') && (m.getFlag(MOD, 'emanationTrigger')?.key === 'Gibbering')) ?? null, { timeout: 10000 });
      const sv = card?.getFlag(MOD, 'saves');
      ok('6b. the Victim starting its turn inside is demanded the Wisdom save — cause turnStart, the trait\'s DC, pinned to it',
        !!card && (sv?.abilities?.[0] === 'wis') && (sv?.targets?.length === 1) && (sv.targets[0].uuid === victim.uuid) && /started its turn inside/.test(card?.content ?? ''),
        `card=${!!card} saves=${JSON.stringify(sv && { abilities: sv.abilities, dc: sv.dc, targets: sv.targets.map(t => t.name) })}`);
      await until(() => game.messages.get(card?.id)?.getFlag(MOD, 'saves')?.targets?.[0]?.applied ? true : null, { timeout: 15000 });
      await setIncapacitated(monster, true);
      await until(() => featureRegion('Gibbering')?.behaviors?.find(b => b.type === TYPE)?.disabled ? true : null, { timeout: 8000 });
      const n1 = triggerCards().length;
      // the windows for a WRONG demand at the Victim's turn start, the ring disabled
      const asked = () => (triggerCards().length !== n1) ? `cards=${triggerCards().length}` : null;
      await combat.nextTurn();   // the Monster
      const early = await watch(asked, { ms: 300 });
      await combat.nextTurn();   // the Victim again — the ring disabled
      const late = await watch(asked, { ms: 1000 });
      ok('6c. the Monster Incapacitated: the ring stands disabled and the next turn start asks nothing', !early && !late && (triggerCards().length === n1) && !!featureRegion('Gibbering')?.behaviors?.find(b => b.type === TYPE)?.disabled, `cards=${triggerCards().length} (was ${n1}, before ${n0}) seen=${early ?? late}`);
      await setIncapacitated(monster, false);
      await endCombat();
      await gib.delete();
      await until(() => featureRegion('Gibbering') ? null : true, { timeout: 8000 });
      await clearVictim();
    });

    // ================================================== 7. the alerts — Watery Rebuke (move-in), Unnerving Gaze (turn start)
    if (want(7)) await section(7, async () => {
      await moveVictim(4);   // 20 ft away: outside a 5-ft ring
      const rebuke = await lendTrait('Watery Rebuke');
      const ring = await ringOf('Watery Rebuke');
      const beh = ring?.behaviors?.find(b => b.type === TYPE);
      ok('7a. Watery Rebuke lent: a quiet 5-foot ring rises, harmful, no effect', !!ring && (beh?.system?.reach === 'harmful') && (beh?.system?.effect === null), `ring=${!!ring} reach=${beh?.system?.reach}`);
      const t7 = Date.now();
      await victimToken.document.update({ x: monsterToken.document.x + g, y: monsterToken.document.y }, { animate: false });   // a real move, into the ring
      const card = await until(() => notices('Watery Rebuke').find(m => m.timestamp >= t7) ?? null, { timeout: 10000 });
      const n = card?.getFlag(MOD, 'hewNotice');
      ok('7b. the Victim moving within 5 feet raises the Monster\'s reminder: the trait, the swing, the Reaction from the sheet',
        !!card && (n?.attackerUuid === monster.uuid) && (n?.itemName === 'Watery Rebuke') && (n?.cause === 'moveIn') && /Watery Rebuke — .* entered/.test(card?.content ?? '') && /Trait — Watery Rebuke/.test(card?.content ?? ''),
        `card=${!!card} flag=${JSON.stringify(n && { attacker: n.attackerUuid === monster.uuid, item: n.itemName, cause: n.cause })}`);
      await rebuke.delete();
      await until(() => featureRegion('Watery Rebuke') ? null : true, { timeout: 8000 });
      // Unnerving Gaze: the turn start inside 30 feet.
      const gaze = await lendTrait('Unnerving Gaze');
      await ringOf('Unnerving Gaze');
      await moveVictim(2);   // 10 ft: inside
      await startCombat();
      const t7b = Date.now();
      await combat.nextTurn();   // the Victim's turn starts inside
      const c2 = await until(() => notices('Unnerving Gaze').find(m => m.timestamp >= t7b) ?? null, { timeout: 10000 });
      const n2 = c2?.getFlag(MOD, 'hewNotice');
      ok('7c. the Victim STARTING its turn within 30 feet raises Unnerving Gaze\'s reminder — cause turnStart, the card says so',
        !!c2 && (n2?.cause === 'turnStart') && (n2?.itemName === 'Unnerving Gaze') && /started its turn within/.test(c2?.content ?? ''),
        `card=${!!c2} flag=${JSON.stringify(n2 && { cause: n2.cause, item: n2.itemName })}`);
      const k = notices('Unnerving Gaze').length;
      await advance();   // the Monster
      await combat.nextTurn();   // the Victim again: a second turn, a second reminder
      await until(() => notices('Unnerving Gaze').length > k ? true : null, { timeout: 8000 });
      ok('7d. the next turn start raises it again — once per turn, not once ever', notices('Unnerving Gaze').length === k + 1, `notices=${notices('Unnerving Gaze').length} (was ${k})`);
      await endCombat();
      await gaze.delete();
      await until(() => featureRegion('Unnerving Gaze') ? null : true, { timeout: 8000 });
      await moveVictim(1);
    });

    // ================================================== 8. Chaos Blade — the random condition on a hit
    if (want(8)) await section(8, async () => {
      await healFull();
      await moveVictim(1);
      const priorAc = { calc: victim.system._source.attributes.ac.calc, flat: victim.system._source.attributes.ac.flat };
      await victim.update({ 'system.attributes.ac.calc': 'flat', 'system.attributes.ac.flat': 1 });   // every swing hits
      const blade = await lendTrait('Chaos Blade');
      const attack = actOf(blade, { type: 'attack' });
      ok('8-pre. the pack ships the attack with its four numbered effects', !!attack && (blade.effects.size === 4) && blade.effects.some(e => /^1\s*:/.test(e.name)), `attack=${!!attack} effects=${blade.effects.map(e => e.name).join('|')}`);
      const damageFor = originId => game.messages.contents.find(m => (m.type === 'damage') && (m._source.system?.origin === originId));
      const offerEl = () => [...foundry.applications.instances.values()].map(a => a.element).find(el => (el?.innerHTML ?? '').includes('Damage — your roll')) ?? null;
      const swing = async act => {
        monsterToken.control({ releaseOthers: true });
        target();
        const results = await act.use({ subsequentActions: false, consume: { uses: false, resources: false } }, { configure: false }, {});
        const rolls = await act.rollAttack({}, { configure: false }, results?.message?.id ? { data: { 'system.origin': results.message.id } } : {});
        const attackMsg = rolls?.[0]?.parent ?? null;
        const originId = attackMsg?._source.system?.origin ?? attackMsg?.id;
        // the offer opens only for a hit with a pick to make (playerRollDamage is off): without one the damage rolls alone
        const offer = await until(offerEl, { timeout: 2500, label: 'the damage offer' }).catch(() => null);
        offer?.querySelector('button[data-action="roll"]')?.click();
        const dmg = await until(() => { const d = damageFor(originId); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
        return { attackMsg, dmg };
      };
      const before = new Set(victim.effects.map(e => e.id));
      const { attackMsg, dmg } = await swing(attack);
      const hit = attackMsg?.rolls?.[0]?.total >= 1;
      await until(() => dmg?.getFlag(MOD, 'clockRiders')?.riders?.[0]?.random?.face ? true : null, { timeout: 10000 });
      const cr = game.messages.get(dmg?.id)?.getFlag(MOD, 'clockRiders');
      const rider = cr?.riders?.find(r => r.key === 'chaos-blade');
      log.push(`§8 attack clockPick=${JSON.stringify(attackMsg?.getFlag(MOD, 'clockPick'))} attackFlags=${Object.keys(attackMsg?.flags?.[MOD] ?? {}).join(',')} dmgFlags=${Object.keys(game.messages.get(dmg?.id)?.flags?.[MOD] ?? {}).join(',')} riders=${JSON.stringify(cr?.riders?.map(r => r.key))}`);
      const landed = victim.effects.filter(e => !before.has(e.id) && !e.statuses?.has?.('bloodied'));   // Bloodied is the platform's, on any damage
      ok('8a. the hit lands: the rider rode (self, no extra dice), its d4 rolled, the face and the landed name on the record',
        hit && !!dmg && !!rider && (rider.formula === null) && (rider.random?.face >= 1) && (rider.random?.face <= 4) && (rider.random?.landed?.length === 1) && new RegExp(`^${rider.random?.face}\\s*:`).test(rider.random?.landed?.[0] ?? ''),
        `hit=${hit} dmg=${!!dmg} rider=${JSON.stringify(rider && { formula: rider.formula, random: rider.random })}`);
      ok('8b. exactly ONE of the four conditions stands on the Victim — the one the face named — receipted on the damage card',
        (landed.length === 1) && (landed[0].name === rider?.random?.landed?.[0]) && !!game.messages.get(dmg?.id)?.getFlag(MOD, 'effectReceipt'),
        `landed=${landed.map(e => e.name).join('|')} receipt=${!!game.messages.get(dmg?.id)?.getFlag(MOD, 'effectReceipt')}`);
      await clearVictim();
      // Another attack of the Monster's: the rider is Chaos Blade's alone.
      const other = await lendTrait('Claw');
      const before2 = new Set(victim.effects.map(e => e.id));
      const { dmg: dmg2 } = await swing(actOf(other, { type: 'attack' }));
      // the window for a WRONG Chaos Blade on the Claw: its rider record, or a condition landing
      const stray = await watch(() => {
        const rode = game.messages.get(dmg2?.id)?.getFlag(MOD, 'clockRiders')?.riders?.some(r => r.key === 'chaos-blade');
        const landed = victim.effects.filter(e => !before2.has(e.id) && !e.statuses?.has?.('bloodied')).length;
        return (rode || landed) ? `rode=${!!rode} landed=${landed}` : null;
      }, { ms: 800 });
      ok('8c. a Claw hit rides no Chaos Blade: no rider record, nothing landed',
        !stray && !!dmg2 && !game.messages.get(dmg2.id)?.getFlag(MOD, 'clockRiders')?.riders?.some(r => r.key === 'chaos-blade') && (victim.effects.filter(e => !before2.has(e.id) && !e.statuses?.has?.('bloodied')).length === 0),
        `dmg=${!!dmg2} riders=${JSON.stringify(game.messages.get(dmg2?.id)?.getFlag(MOD, 'clockRiders')?.riders?.map(r => r.key))} landed=${victim.effects.filter(e => !before2.has(e.id) && !e.statuses?.has?.('bloodied')).length} seen=${stray}`);
      await victim.update({ 'system.attributes.ac.calc': priorAc.calc, 'system.attributes.ac.flat': priorAc.flat });
      await clearVictim();
      await takeBack('Chaos Blade');
      await takeBack('Claw');
    });

    // ================================================== 9. the drain — Life Drain, Draining Swipe
    if (want(9)) await section(9, async () => {
      await healFull();
      await moveVictim(1);
      const priorAc = { calc: victim.system._source.attributes.ac.calc, flat: victim.system._source.attributes.ac.flat };
      const priorStr = victim.system._source.abilities.str.value;
      await victim.update({ 'system.attributes.ac.calc': 'flat', 'system.attributes.ac.flat': 1 });
      const damageFor = originId => game.messages.contents.find(m => (m.type === 'damage') && (m._source.system?.origin === originId));
      const offerEl = () => [...foundry.applications.instances.values()].map(a => a.element).find(el => (el?.innerHTML ?? '').includes('Damage — your roll')) ?? null;
      const drainCards = () => cardsWith('drain').filter(m => m.getFlag(MOD, 'drain')?.what);
      const swing = async act => {
        monsterToken.control({ releaseOthers: true });
        target();
        const results = await act.use({ subsequentActions: false, consume: { uses: false, resources: false } }, { configure: false }, {});
        const rolls = await act.rollAttack({}, { configure: false }, results?.message?.id ? { data: { 'system.origin': results.message.id } } : {});
        const attackMsg = rolls?.[0]?.parent ?? null;
        const originId = attackMsg?._source.system?.origin ?? attackMsg?.id;
        // the offer opens only for a hit with a pick to make (playerRollDamage is off): without one the damage rolls alone
        const offer = await until(offerEl, { timeout: 2500, label: 'the damage offer' }).catch(() => null);
        offer?.querySelector('button[data-action="roll"]')?.click();
        const dmg = await until(() => { const d = damageFor(originId); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
        return { attackMsg, dmg };
      };
      const maxNow = () => Number(victim.system.attributes.hp.effectiveMax ?? victim.system.attributes.hp.max);   // dnd5e: max + tempmax
      const max0 = maxNow();
      const life = await lendTrait('Life Drain');
      const n0 = drainCards().length;
      const { dmg } = await swing(actOf(life, { type: 'attack' }));
      const taken = dmg?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === victim.uuid)?.taken ?? null;
      const card = await until(() => drainCards()[n0] ?? null, { timeout: 10000 });
      await until(() => card?.getFlag(MOD, 'effectReceipt'), { timeout: 8000 });
      const d1 = card?.getFlag(MOD, 'drain');
      const fx1 = victim.effects.find(e => e.getFlag(MOD, 'drain')?.key === 'Life Drain') ?? null;
      ok('9a. Life Drain\'s hit lowers the Victim\'s maximum by what landed: a drain card, the effect on the Victim (tempmax), receipted; the dealing card latched',
        !!card && (d1?.key === 'Life Drain') && (d1?.what === 'max') && (taken > 0) && (d1?.amount === taken) && !!fx1 && (maxNow() === max0 - taken) && !!card?.getFlag(MOD, 'effectReceipt') && (dmg?.getFlag(MOD, 'drain')?.done ?? []).includes(victim.uuid),
        `card=${!!card} taken=${taken} flag=${JSON.stringify(d1 && { key: d1.key, what: d1.what, amount: d1.amount, total: d1.total })} max=${maxNow()} vs ${max0} fx=${!!fx1}`);
      await healFull();
      const { dmg: dmg2 } = await swing(actOf(life, { type: 'attack' }));
      const taken2 = dmg2?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === victim.uuid)?.taken ?? null;
      const card2 = await until(() => drainCards()[n0 + 1] ?? null, { timeout: 10000 });
      await until(() => card2?.getFlag(MOD, 'effectReceipt'), { timeout: 8000 });
      const d2 = card2?.getFlag(MOD, 'drain');
      const copies = victim.effects.filter(e => e.getFlag(MOD, 'drain')?.key === 'Life Drain');
      ok('9b. a second hit refreshes the ONE copy with the total: the card says the fall and the total, the maximum down by both',
        !!card2 && (d2?.amount === taken2) && (d2?.total === taken + taken2) && (copies.length === 1) && (copies[0].getFlag(MOD, 'drain')?.amount === taken + taken2) && (maxNow() === max0 - taken - taken2),
        `taken2=${taken2} flag=${JSON.stringify(d2 && { amount: d2.amount, total: d2.total })} copies=${copies.length} max=${maxNow()} vs ${max0 - taken - taken2}`);
      await clearVictim();
      await takeBack('Life Drain');
      // Draining Swipe: the text's d4 on the Strength score.
      await healFull();
      const swipe = await lendTrait('Draining Swipe');
      const n1 = drainCards().length;
      const { dmg: dmg3 } = await swing(actOf(swipe, { type: 'attack' }));
      const card3 = await until(() => drainCards()[n1] ?? null, { timeout: 10000 });
      await until(() => card3?.getFlag(MOD, 'effectReceipt'), { timeout: 8000 });
      const d3 = card3?.getFlag(MOD, 'drain');
      const fx3 = victim.effects.find(e => e.getFlag(MOD, 'drain')?.key === 'Draining Swipe') ?? null;
      ok('9c. Draining Swipe\'s hit rolls the text\'s 1d4 on the Monster and lands the pack\'s "Hit: STR Score −N" on the Victim, receipted; the score down by the roll',
        !!dmg3 && !!card3 && (d3?.what === 'ability') && (d3?.die === '1d4') && (d3?.amount >= 1) && (d3?.amount <= 4) && !!fx3 && new RegExp(`STR Score -${d3?.amount}`).test(fx3?.name ?? '') && (Number(victim.system.abilities.str.value) === priorStr - d3?.amount),
        `card=${!!card3} flag=${JSON.stringify(d3 && { what: d3.what, die: d3.die, amount: d3.amount, total: d3.total })} fx=${fx3?.name} str=${victim.system.abilities.str.value} vs ${priorStr}`);
      await victim.update({ 'system.attributes.ac.calc': priorAc.calc, 'system.attributes.ac.flat': priorAc.flat });
      await clearVictim();
      await takeBack('Draining Swipe');
    });

    // ================================================== the Monster's own damage — helpers (smoke-drop's)
    const mHp = () => Number(monster.system.attributes.hp.value);
    const mSetHp = (value, max = 50) => monster.update({ 'system.attributes.hp.max': max, 'system.attributes.hp.value': value, 'system.attributes.hp.temp': 0 });
    const damageCard = async (type, speaker = monster) => {
      const roll = await new CONFIG.Dice.DamageRoll('30', {}, { type }).evaluate();
      return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: speaker }), rolls: [roll], flavor: `BTB test damage — ${type}` });
    };
    const mHit = async (n, type = 'slashing', speaker = monster) => {
      const msg = await damageCard(type, speaker);
      return monster.applyDamage([{ value: n, type }], { originatingMessage: msg });
    };

    // ================================================== 10. the vampire's drop
    if (want(10)) await section(10, async () => {
      const t10 = Date.now();
      const spite = await lendTrait('Spiteful Escape');
      await mSetHp(20);
      await mHit(30);
      // the hold's card posts after the use is spent; the 1 lands with the damage itself
      const card = await until(() => cardsWith('dropToOne').find(m => (m.timestamp >= t10) && (m.getFlag(MOD, 'dropToOne')?.row === 'Spiteful Escape')) ?? null, { timeout: 8000 });
      const f = card?.getFlag(MOD, 'dropToOne');
      ok('10a. Spiteful Escape: the Monster is held at 1 on the drop, automatically, the card saying so',
        (mHp() === 1) && !!card && (f?.answer === 'auto') && (f?.applied === true) && /drops to 1 Hit Point instead/.test(card?.content ?? ''),
        `hp=${mHp()} flag=${JSON.stringify(f && { row: f.row, answer: f.answer })}`);
      await mSetHp(5);
      await mHit(90);   // 90 − 5 ≥ the maximum of 50: killed outright
      await until(() => mHp() === 1, { label: 'the Monster held at 1' });
      ok('10b. killed outright too (outright: true): held at 1 again', mHp() === 1, `hp=${mHp()}`);
      await spite.delete();
      const misty = await lendTrait('Misty Escape');
      await mSetHp(5);
      const t10b = Date.now();
      await mHit(30);
      const notice = await until(() => cardsWith('deathThroes').find(m => (m.timestamp >= t10b) && (m.getFlag(MOD, 'deathThroes')?.key === 'Misty Escape')) ?? null, { timeout: 8000 });
      const n = notice?.getFlag(MOD, 'deathThroes');
      ok('10c. Misty Escape: the 0 lands and the notice card rises — the mist, nothing used, no demand',
        (mHp() === 0) && !!notice && (n?.notice === true) && (n?.count === 0) && !notice?.getFlag(MOD, 'saves') && /becomes mist/.test(notice?.content ?? ''),
        `hp=${mHp()} card=${!!notice} flag=${JSON.stringify(n && { key: n.key, notice: n.notice, count: n.count })}`);
      await misty.delete();
      await mSetHp(50);
    });

    // ================================================== 11. the curse on a rest
    if (want(11)) await section(11, async () => {
      const touch = await lendTrait('Cursed Touch');
      const cursed = await grappleFrom(touch, 'Cursed');   // the pack's Cursed, its origin the touch's attack
      await victim.update({ 'system.attributes.hp.value': 1 });
      const t11 = Date.now();
      await victim.longRest({ dialog: false, chat: true, newDay: false, advanceTime: false });
      const card = await until(() => game.messages.contents.find(m => (m.timestamp >= t11) && m.getFlag(MOD, 'restBlock')) ?? null, { timeout: 8000 });
      const blocks = card?.getFlag(MOD, 'restBlock');
      ok('11a. Cursed standing: the Long Rest regains nothing — the Hit Points stay at 1, the rest card carries the block line naming Cursed Touch',
        (hpNow() === 1) && !!card && (blocks?.[0]?.name === 'Cursed Touch') && (blocks?.[0]?.effect === 'Cursed'),
        `hp=${hpNow()} card=${!!card} blocks=${JSON.stringify(blocks)}`);
      await cursed.delete();
      await victim.longRest({ dialog: false, chat: true, newDay: false, advanceTime: false });
      await until(() => hpNow() === Number(victim.system.attributes.hp.max), { label: 'the Long Rest healed' });
      ok('11b. the curse gone: the next Long Rest heals', hpNow() === Number(victim.system.attributes.hp.max), `hp=${hpNow()} max=${victim.system.attributes.hp.max}`);
      await clearVictim();
      await takeBack('Cursed Touch');
    });

    // ================================================== 12. Corrosive Form — the defender's own trait
    if (want(12)) await section(12, async () => {
      await healFull();
      await moveVictim(1);
      const form = await lendTrait('Corrosive Form');
      const priorMon = { calc: monster.system._source.attributes.ac.calc, flat: monster.system._source.attributes.ac.flat };
      await monster.update({ 'system.attributes.ac.calc': 'flat', 'system.attributes.ac.flat': 1 });
      await mSetHp(50);
      const weapon = victim.items.find(i => (i.type === 'weapon') && i.system.activities?.some?.(a => (a.type === 'attack') && (a.attack?.type?.value === 'melee')))
        ?? victim.items.find(i => i.system.activities?.some?.(a => a.type === 'attack'));
      const act = weapon?.system.activities.find(a => a.type === 'attack') ?? null;
      ok('12-pre. the Victim has a melee attack', !!act && (act.attack?.type?.value === 'melee'), `weapon=${weapon?.name} melee=${act?.attack?.type?.value}`);
      const damageFor = originId => game.messages.contents.find(m => (m.type === 'damage') && (m._source.system?.origin === originId));
      const offerEl = () => [...foundry.applications.instances.values()].map(a => a.element).find(el => (el?.innerHTML ?? '').includes('Damage — your roll')) ?? null;
      const hp0 = hpNow();
      const t12 = Date.now();
      victimToken.control({ releaseOthers: true });
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      monsterToken.setTarget(true, { releaseOthers: true });
      const results = await act.use({ subsequentActions: false, consume: { uses: false, resources: false } }, { configure: false }, {});
      const rolls = await act.rollAttack({}, { configure: false }, results?.message?.id ? { data: { 'system.origin': results.message.id } } : {});
      const attackMsg = rolls?.[0]?.parent ?? null;
      const originId = attackMsg?._source.system?.origin ?? attackMsg?.id;
      // the offer opens only for a hit with a pick to make (playerRollDamage is off): without one the damage rolls alone
      const offer = await until(offerEl, { timeout: 2500, label: 'the damage offer' }).catch(() => null);
      offer?.querySelector('button[data-action="roll"]')?.click();
      const dmg = await until(() => { const d = damageFor(originId); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
      const shield = await until(() => game.messages.contents.find(m => (m.timestamp >= t12) && (m.getFlag(MOD, 'damageShield')?.key === 'Corrosive Form') && m.getFlag(MOD, 'damageShield')?.rolled) ?? null, { timeout: 12000 });
      await until(() => shield?.getFlag(MOD, 'receipt'), { timeout: 8000 });
      const s = shield?.getFlag(MOD, 'damageShield');
      ok('12a. the Victim\'s melee hit lands and the Monster\'s Corrosive Form strikes back: the acid rolled as the Monster\'s, landed on the Victim, receipted',
        !!dmg && !!shield && (s?.type === 'acid') && (s?.attackerUuid === victim.uuid) && (s?.total > 0) && !!shield?.getFlag(MOD, 'receipt') && (hpNow() === hp0 - s.total),
        `dmg=${!!dmg} shield=${!!shield} flag=${JSON.stringify(s && { key: s.key, type: s.type, total: s.total, why: s.why })} hp=${hpNow()} vs ${hp0}`);
      await monster.update({ 'system.attributes.ac.calc': priorMon.calc, 'system.attributes.ac.flat': priorMon.flat });
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      await form.delete();
      await healFull();
      await mSetHp(50);
    });

    // ================================================== 13. Fiendish Blood — offered on the types it names
    if (want(13)) await section(13, async () => {
      await moveVictim(1);
      const blood = await lendTrait('Fiendish Blood');
      await mSetHp(50);
      const t13 = Date.now();
      await mHit(10, 'slashing', victim);
      const offer = await until(() => cardsWith('rebuke').find(m => (m.timestamp >= t13) && (m.getFlag(MOD, 'rebuke')?.options ?? []).some(o => o.name === 'Fiendish Blood')) ?? null, { timeout: 8000 });
      const r = offer?.getFlag(MOD, 'rebuke');
      ok('13a. slashing damage from the Victim offers Fiendish Blood — the rebuke card pending, the Victim the damager',
        !!offer && (r?.status === 'pending') && (r?.sourceUuid === victim.uuid) && (r?.actorUuid === monster.uuid),
        `offer=${!!offer} flag=${JSON.stringify(r && { status: r.status, options: r.options?.map(o => o.name) })}`);
      const k = cardsWith('rebuke').length;
      await mHit(10, 'fire', victim);
      // the window for a WRONG Fiendish Blood offer
      const offered = () => cardsWith('rebuke').slice(k).some(m => (m.getFlag(MOD, 'rebuke')?.options ?? []).some(o => o.name === 'Fiendish Blood'));
      const stray = await watch(() => offered() || null, { ms: 1200 });
      ok('13b. fire damage offers nothing (piercing or slashing alone)', !stray && !offered(), `cards=${cardsWith('rebuke').length} (was ${k})`);
      await blood.delete();
      await mSetHp(50);
    });

    // ================================================== 14. Object Slam — the gate's judge on the map
    if (want(14)) await section(14, async () => {
      await healFull();
      const slam = await lendTrait('Object Slam');
      const claw = await lendTrait('Claw');
      // The HUMAN-style roll (smoke-reminders' shape): the system's dialog is allowed, so the gate's section stands in it.
      const rollDialog = () => [...foundry.applications.instances.values()].find(app => /RollConfigurationDialog/.test(app.constructor?.name ?? '') && app.rendered && app.element) ?? null;
      const closeGates = async () => {
        for (const app of foundry.applications.instances.values()) {
          const gate = (app instanceof foundry.applications.api.DialogV2) && /Before you roll/.test(app.title ?? '');
          if (gate || /RollConfigurationDialog/.test(app.constructor?.name ?? '')) { try { await app.close(); } catch { /* gone */ } }
        }
      };
      const popupText = dlg => ((dlg?.element?.querySelector('[data-bf-reminder]') ?? dlg?.element?.querySelector('.window-content'))?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const openRolls = () => [...foundry.applications.instances.values()].some(app => app.rendered
        && (((app instanceof foundry.applications.api.DialogV2) && /Before you roll/.test(app.title ?? '')) || /RollConfigurationDialog/.test(app.constructor?.name ?? '')));
      const gateOf = async act => {
        monsterToken.control({ releaseOthers: true });
        target();
        const results = await act.use({ subsequentActions: false, consume: { uses: false, resources: false } }, { configure: false }, {});
        const usageId = results?.message?.id ?? null;
        const li = await until(() => document.querySelector(`.message[data-message-id="${usageId}"]`), { timeout: 4000 });
        const event = { target: li?.querySelector('button[data-action="rollAttack"]') ?? li, clientY: 200, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
        act.rollAttack({ event }, {}, {}).catch(() => { /* the dialog is closed below: the roll is cancelled */ });
        const dlg = await until(rollDialog, { timeout: 6000 });
        // the gate is set before the dialog renders; its fieldset is drawn only when the gate has a source
        await until(() => {
          const gate = dlg?.options?.bfReminder;
          return !dlg || !gate || !((gate.sources?.length > 0) || gate.sneak) || dlg.element?.querySelector('[data-bf-reminder]');
        }, { label: 'the gate drawn in the roll dialog' });
        const text = popupText(dlg);
        await closeGates();
        await until(() => !openRolls(), { label: 'the roll dialogs closed' });
        return { dialog: dlg, text };
      };
      // Beside the Monster: nothing.
      await moveVictim(1);
      const beside = await gateOf(actOf(slam, { type: 'attack' }));
      ok('14a. the Victim beside the Monster: the roll dialog opens and its gate lists no Object Slam', !!beside.dialog && !/Object Slam/.test(beside.text), `dialog=${!!beside.dialog} text="${beside.text.slice(0, 200)}"`);
      // Inside its space.
      await moveVictim(0);
      const inside = await gateOf(actOf(slam, { type: 'attack' }));
      ok('14b. the Victim inside the Monster\'s space: the gate reads Object Slam — Advantage', /Object Slam/.test(inside.text) && /Advantage/.test(inside.text), `text="${inside.text.slice(0, 300)}"`);
      const other = await gateOf(actOf(claw, { type: 'attack' }));
      ok('14c. a Claw from the same space reads no Object Slam (the bend rides that attack alone)', !/Object Slam/.test(other.text), `text="${other.text.slice(0, 200)}"`);
      await moveVictim(1);
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      await takeBack('Object Slam');
      await takeBack('Claw');
    });

    // ================================================== 15. Reflective Carapace — the hold turns the spell aside
    if (want(15)) await section(15, async () => {
      await healFull();
      await moveVictim(2);
      const shell = await lendTrait('Reflective Carapace');
      const priorMon = { calc: monster.system._source.attributes.ac.calc, flat: monster.system._source.attributes.ac.flat };
      await monster.update({ 'system.attributes.ac.calc': 'flat', 'system.attributes.ac.flat': 1 });
      await mSetHp(50);
      const priorCasting = victim.system._source.attributes.spellcasting ?? '';
      await victim.update({ 'system.attributes.spellcasting': 'int' });
      const pack = game.packs.find(p => (p.metadata.packageName === 'dnd-players-handbook') && (p.documentName === 'Item') && (p.metadata.name === 'spells'));
      const hit = (await pack?.getIndex())?.find(e => e.name === 'Fire Bolt');
      const src = hit ? await pack.getDocument(hit._id) : null;
      const data = src?.toObject(); if (data) data.system.prepared = 1;
      const [bolt] = data ? await victim.createEmbeddedDocuments('Item', [data]) : [null];
      ok('15-pre. Fire Bolt lent to the Victim, the carapace to the Monster', !!bolt && !!shell, `bolt=${!!bolt}`);
      const cast = async act => {
        victimToken.control({ releaseOthers: true });
        game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
        monsterToken.setTarget(true, { releaseOthers: true });
        const results = await act.use({ subsequentActions: false, consume: { spellSlot: false, uses: false, resources: false } }, { configure: false }, {});
        const rolls = await act.rollAttack({}, { configure: false }, results?.message?.id ? { data: { 'system.origin': results.message.id } } : {});
        return rolls?.[0]?.parent ?? null;
      };
      const hp0 = mHp();
      const attackMsg = await cast(bolt.system.activities.find(a => a.type === 'attack'));
      const hold = await until(() => { const h = game.messages.get(attackMsg?.id)?.getFlag(MOD, 'hold'); return (h?.status === 'resolved') ? h : null; }, { timeout: 15000 });
      const t = hold?.targets?.find(x => x.uuid === monster.uuid);
      ok('15a. the Fire Bolt hit is held and rolled against the carapace: one d6, the hit ABSORBED, the entry a feature (no duplicate destroyed)',
        !!hold && (t?.verdict === 'absorbed') && (t?.duplicates?.feature === true) && (t?.duplicates?.faces?.length === 1) && (t?.duplicates?.took === null) && (t?.duplicates?.left === 1),
        `hold=${hold?.status} verdict=${t?.verdict} dup=${JSON.stringify(t?.duplicates && { feature: t.duplicates.feature, faces: t.duplicates.faces, left: t.duplicates.left, reflected: t.duplicates.reflected })}`);
      // the window for WRONG damage on the Monster; then the card that says the spell is turned aside
      const struck = await watch(() => (mHp() !== hp0) ? `hp=${mHp()}` : null, { ms: 1500 });
      const said = await until(() => game.messages.contents.find(m => (m.timestamp >= (attackMsg?.timestamp ?? 0)) && /turns the spell aside/.test(m.content ?? '')) ?? null,
        { label: 'the card turning the spell aside' });
      ok('15b. no damage lands on the Monster and the card says the spell is turned aside', !struck && (mHp() === hp0) && !!said, `hp=${mHp()} vs ${hp0} card=${!!said} seen=${struck}`);
      // A melee hit: not the carapace's.
      const sword = victim.items.find(i => (i.type === 'weapon') && i.system.activities?.some?.(a => (a.type === 'attack') && (a.attack?.type?.value === 'melee')));
      await moveVictim(1);
      const swing = await cast(sword.system.activities.find(a => a.type === 'attack'));
      // the window for a WRONG carapace answer on the Longsword's hold
      const answered = await watch(() => game.messages.get(swing?.id)?.getFlag(MOD, 'hold')?.targets?.some(x => x.duplicates) || null, { ms: 800 });
      const h2 = game.messages.get(swing?.id)?.getFlag(MOD, 'hold');
      ok('15c. a Longsword hit is not answered by the carapace (no duplicates entry on the hold)', !answered && !!swing && !h2?.targets?.some(x => x.duplicates), `hold=${JSON.stringify(h2 && { status: h2.status, dup: h2.targets?.map(x => !!x.duplicates) })}`);
      await monster.update({ 'system.attributes.ac.calc': priorMon.calc, 'system.attributes.ac.flat': priorMon.flat });
      await victim.update({ 'system.attributes.spellcasting': priorCasting });
      if (bolt) await bolt.delete();
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      await shell.delete();
      await mSetHp(50);
      await healFull();
    });

    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  } finally {
    await teardown();
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: 'monsters', out, plan, f });
