// Classes smoke suite — Cleric: the PHB classes plan's rows (audits/plans/session-0-classes.md) for
// the Cleric, each section keeping its number and title. The fixtures, the lends, the
// helpers and the teardown are the classes kit's (tools/class-kit.mjs); everything written is restored.
import { announcePlan, connectSuite, finish, sectionPlan } from './harness.mjs';
import { runClassSuite } from './class-kit.mjs';

// The coverage map (tools/coverage-map.mjs) parses this; ⚠ never import a suite (it connects on evaluation).
export const COVERS = [
  'hold/trigger.js',        // Guided Strike for an ally and for the Cleric (§7, §8)
  'hold/lookup.js',         // the Cleric as a bystander on a miss (§7)
  'hold/answer.js',         // Guided Strike's +10 (§7, §8)
  'hold/views.js',          // the Cleric's popup (§7, §8)
  'hold/continue.js',       // the miss turned into a hit, the damage rolled (§7)
  'hold/dice.js',           // the bent roll's chips (§7)
  'hew.js',                 // War Priest's reminder (§19)
  'heal-rerolls.js',        // Supreme Healing's maximum (§99)
  'token-lights.js',        // Corona of Light (§102)
  'emanations.js',          // Corona of Light's ring (§102)
  'damage-rules.js'         // the spell-damage bonuses on one roll (§50), Disciple of Life (§33)
];

const SECTIONS = {
  7: 'Guided Strike for an ally: BTB Test PC Attacker misses by 7 within 30 ft of the Cleric — the Cleric\'s popup "+10 · a Reaction"; Answer turns the miss into a HIT and the damage rolls and lands',
  8: 'Guided Strike on the Cleric\'s own miss: its own popup, "No Reaction"; the +10 turns it, the guard entry marked self',
  19: 'War Priest: a weapon attack posts Hew\'s reminder "War Priest — BTB Test Cleric can attack again … N of M uses left" (and pops, OK only); no uses left, no reminder',
  33: 'Disciple of Life (the Cleric): Cure Wounds at level 2 heals "+4[Disciple of Life]" more — the card says "Disciple of Life — +4 healing", the healing lands with it; at level 1 +3; cast innately, nothing',
  50: 'the spell-damage bonuses (B4): Potent Spellcasting +Wis on a cleric cantrip; Radiant Soul +Cha on a radiant roll once per turn; Empowered Evocation +Int and Elemental Affinity (Fire) +Cha on Fire Bolt; Ray of Frost takes Empowered alone; the faces',
  60: 'Blessed Healer (B4, the Cleric): Cure Wounds at level 2 on the Halfling posts "Blessed Healer — regains 4", the cleric 50 → 54; Improved Warding Flare (the Halfling): the Flare answered lands 2d6 + Wis Temporary Hit Points',
  86: 'Improved Blessed Strikes (C1, the Cleric): a cleric cantrip\'s damage lands — "N Temporary Hit Points for another creature"; OK gives the pick',
  99: "Supreme Healing (D1, the Cleric): Cure Wounds with ones on the dice heals the maximum",
  101: "Improved Duplicity (D1, the Cleric): an ally's attack lists Shared Distraction; an enemy's nothing",
  102: "Corona of Light (D1, the Cleric): the light and the 60-ft ring; the Victim inside saves at Disadvantage against the cleric's Sacred Flame"
};
const DEPENDS = {};

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'class-cleric', watchdogMs: 900_000 });
announcePlan('class-cleric', plan, pulled);

const out = await runClassSuite(f, { plan, sections: SECTIONS, body: async ({ sections, titles }) => {
  const { sleep, until, watch, faces, unrig } = window.__btb;
  const { results, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const KIT = window.__btbClasses;
  const { MOD, a1Damage, a1Hit, a1Roll, a1Victim, abilityMod, ackHew, act, activateRange, attackOf, attackerToken, b4Card, backToRange, cardEl, cardText, castSpell, clearTargets, cleric, clericToken, clericWeapon, closeA1, closeDialogs, closeOffers, created, d1Region, divinity, dropEffects, dropNamed, dropReactionChips, dropVictimFx, gateDrawn, gateFor, halfling, halflingToken, healFull, hewNotices, hewPopup, hgClose, hgKeep, hgLend, holdOf, hp, lend, lendClassSpell, log, missSide, missTarget, modOf, pcAttacker, pcToken, pcWeapon, pickApply, popupTitled, refillDivinity, rescuePopup, resolvedTarget, riderChits, rollDialog, scene, set, sorcerer, sorcererDoc, spellDamage, spendLuck, styleFlag, suiteStart, swing, swingAt, textOf, titled, unlend, useFeature, vhp, victim, victimToken } = KIT;
  try {

    // ---- 7. Guided Strike for an ally
    if (want(7) && missSide) await section(7, async () => {
      await closeDialogs(); await refillDivinity();
      const pcMod = await modOf(pcAttacker, pcWeapon);
      KIT.VAC = pcMod + 10;
      await victim.update({ 'system.attributes.ac.override': KIT.VAC });
      const msg = await swingAt(pcAttacker, pcToken, pcWeapon, { d20: [3] });
      const pop = await until(() => popupTitled(/Guided Strike/), { timeout: 6000, label: 'the Cleric\'s Guided Strike popup' });
      const guards = holdOf(msg)?.targets?.[0]?.guards ?? [];
      ok('7a. a miss by 7 is held for the Cleric: "Guided Strike … +10 · a Reaction", the hold marked miss',
        !!pop && /\+10/.test(textOf(pop?.element)) && /a Reaction/.test(textOf(pop?.element)) && (holdOf(msg)?.miss === true)
          && guards.some(g => (g.uuid === cleric.uuid) && !g.self),
        `pop=${textOf(pop?.element).slice(0, 180)} hold.miss=${holdOf(msg)?.miss} guards=${JSON.stringify(guards.map(g => [g.name, g.row, !!g.self]))}`);
      pickApply(pop);
      const t = await missTarget(msg);
      const landed = await until(() => vhp() < 400, { timeout: 8000, label: 'the turned hit\'s damage landed on the Victim' });
      ok('7b. the +10 turns it: a HIT (rescue Guided Strike, the Cleric), the damage rolled and landed, a Channel Divinity spent',
        (t?.verdict === 'hit') && (t?.rescue === 'Guided Strike') && (t?.guardedBy?.uuid === cleric.uuid) && (t?.bent?.add === 10) && landed
          && (Number(divinity()?.system?.uses?.spent ?? 0) === 1),
        JSON.stringify({ verdict: t?.verdict, rescue: t?.rescue, bent: t?.bent?.add, hp: vhp(), cd: divinity()?.system?.uses?.spent }));
      await until(() => /Guided Strike \(BTB Test Cleric\) \+10.*HIT/.test(cardText(msg?.id)), { timeout: 5000, label: 'the bent line on the attack card' });
      ok('7c. the attack card: "Guided Strike (BTB Test Cleric) +10 … HIT"', /Guided Strike \(BTB Test Cleric\) \+10.*HIT/.test(cardText(msg?.id)), cardText(msg?.id).slice(0, 240));
    });

    // ---- 8. Guided Strike on the Cleric's own miss
    if (want(8) && missSide) await section(8, async () => {
      await closeDialogs(); await refillDivinity();
      const clMod = await modOf(cleric, clericWeapon);
      await victim.update({ 'system.attributes.ac.override': clMod + 10 });
      const msg = await swingAt(cleric, clericToken, clericWeapon, { d20: [3] });
      const pop = await until(() => popupTitled(/Guided Strike/), { timeout: 6000, label: 'the Cleric\'s own Guided Strike popup' });
      const g = (holdOf(msg)?.targets?.[0]?.guards ?? []).find(x => x.uuid === cleric.uuid);
      ok('8a. its own popup: "your attack", "No Reaction", the entry marked self',
        !!pop && /your attack/.test(textOf(pop?.element)) && /No Reaction/.test(textOf(pop?.element)) && !/a Reaction ·/.test(textOf(pop?.element)) && g?.self === true,
        `pop=${textOf(pop?.element).slice(0, 180)} guard=${JSON.stringify(g)}`);
      pickApply(pop);
      const t = await missTarget(msg);
      ok('8b. the +10 turns it: a HIT', (t?.verdict === 'hit') && (t?.rescue === 'Guided Strike'), JSON.stringify({ verdict: t?.verdict, rescue: t?.rescue }));
    });
    await KIT.leaveA3();

    // ---- 19. War Priest: Hew's reminder with the uses; none left, none
    if (want(19)) await section(19, async () => {
      await closeDialogs(); await a1Victim();
      if (!clericWeapon) log.push('§19 skipped: BTB Test Cleric has no weapon');
      else {
        const wp = await lend(cleric, 'War Priest');
        const uses = () => cleric.items.get(wp.id)?.system?.uses;
        try {
          await wp.update({ 'system.uses.spent': 0 });
          if (!(Number(uses()?.max) > 0)) {
            // UNSURE: the pack's max (likely the Wisdom modifier) read 0 on the fixture — pinned so the uses show
            await wp.update({ 'system.uses.max': '3', 'system.uses.spent': 0 });
            log.push(`§19: War Priest's max read 0 on BTB Test Cleric — the lent copy set to 3`);
          }
          const act = attackOf(cleric, clericWeapon);
          const t1 = Date.now();
          const { msg, offer } = await a1Hit(cleric, clericToken, act);
          if (offer) await a1Roll(msg, offer); else await a1Damage(msg);
          const card = await until(() => hewNotices(t1, 'War Priest')[0] ?? null, { timeout: 8000, label: 'War Priest\'s reminder card' });
          const n = card?.getFlag(MOD, 'hewNotice');
          const left = `${uses()?.value} of ${uses()?.max} use`;
          ok(`19a. a weapon attack: Hew's reminder "War Priest — BTB Test Cleric can attack again", "… ${left}s left", a reminder (no drive)`,
            !!card && /War Priest — BTB Test Cleric can attack again/.test(card.content ?? '') && (n?.why ?? '').includes(left) && !n?.offer,
            `card=${!!card} notice=${JSON.stringify(n ? { label: n.label, why: n.why, offer: !!n.offer } : null)} uses=${JSON.stringify({ value: uses()?.value, max: uses()?.max })}`);
          if (Number(game.settings.get(MOD, 'decisionTimer')) > 0) {
            const pop = await until(() => hewPopup('War Priest'), { timeout: 6000, label: 'War Priest\'s reminder popup' });
            ok('19b. it pops: "War Priest — BTB Test Cleric", OK only', !!pop && !pop.element.querySelector('button[data-action="use"]'), `popup=${!!pop} text="${textOf(pop?.element).slice(0, 160)}"`);
            await ackHew('War Priest');
          } else log.push('§19b skipped: decisionTimer is 0 — Hew\'s popup never opens');
          await wp.update({ 'system.uses.spent': Number(uses()?.max) || 0 });
          const t2 = Date.now();
          const { msg: m2, offer: o2 } = await a1Hit(cleric, clericToken, act);
          if (o2) await a1Roll(m2, o2); else await a1Damage(m2);
          // The window: time for a WRONG reminder.
          const stray = await watch(() => hewNotices(t2, 'War Priest').length > 0, { ms: 2000 });
          ok('19c. no uses left: no reminder', !stray && !hewNotices(t2, 'War Priest').length && (Number(uses()?.value) === 0),
            `notices=${hewNotices(t2, 'War Priest').length} uses=${JSON.stringify({ value: uses()?.value, max: uses()?.max })} stray=${!!stray}`);
        } finally {
          await closeOffers();
          await ackHew('War Priest');
          await unlend(cleric, wp);
        }
      }
    });
    KIT.markA2();

    // ---- 33. Disciple of Life: the healing roll carries 2 + the slot level
    if (want(33)) await section(33, async () => {
      await closeDialogs();
      const own = cleric.items.find(i => (i.name === 'Disciple of Life') && (i.type === 'feat'));
      const disciple = own ?? await hgLend(cleric, 'Disciple of Life', 'feat');
      const cure = await hgLend(cleric, 'Cure Wounds', 'spell', { 'system.prepared': 1, 'system.method': 'spell' });
      const cureAct = () => cleric.items.get(cure?.id)?.system?.activities?.find(a => a.type === 'heal');
      const bonusOf = m => (m?.rolls ?? []).flatMap(r => r.terms ?? []).find(t => t?.flavor === 'Disciple of Life') ?? null;
      /** Cure Wounds from the Cleric at the Halfling (HP 1), the dice pinned low but never a 1; the settled message. */
      const cureHalfling = async (scaling = 0) => {
        await halfling.update({ 'system.attributes.hp.value': 1, 'system.attributes.hp.temp': 0 });
        halflingToken.setTarget(true, { releaseOthers: true });
        faces([[3, 8], [5, 8]]);
        const rolls = await cureAct().rollDamage(scaling ? { scaling } : {}, { configure: false }, {});
        const m = rolls?.[0]?.parent ?? null;
        // The healing lands before its receipt: the next cure's HP write never races this one.
        await until(() => m?.getFlag(MOD, 'receipt'), { timeout: 10000, label: 'the Cure Wounds healing receipted' });
        unrig();
        clearTargets();
        return m;
      };
      const healTotal = m => (m?.rolls ?? []).reduce((n, r) => n + (Number(r.total) || 0), 0);
      try {
        if (!disciple || !cureAct()) log.push(`§33 skipped: disciple=${!!disciple} cure=${!!cureAct()}`);
        else {
          const m2 = await cureHalfling(1);
          const line = (await until(() => cardEl(m2?.id)?.querySelector('.bf-heal-bonus-line'), { timeout: 5000, label: 'the Disciple of Life line on the healing card' }))?.textContent?.trim() ?? '';
          ok('33a. level 2: the healing roll carries 4[Disciple of Life]; the card says "Disciple of Life — +4 healing"',
            (Number(bonusOf(m2)?.number) === 4) && /Disciple of Life — \+4 healing/.test(line), `formula="${m2?.rolls?.[0]?.formula}" line="${line}"`);
          ok('33b. the healing lands with it, once', !!m2?.getFlag(MOD, 'receipt') && (hp() === Math.min(400, 1 + healTotal(m2))), `hp=${hp()} total=${healTotal(m2)}`);
          const m1 = await cureHalfling(0);
          ok('33c. level 1: +3', Number(bonusOf(m1)?.number) === 3, `formula="${m1?.rolls?.[0]?.formula}"`);
          await cleric.items.get(cure.id)?.update({ 'system.method': 'innate' });
          const mi = await cureHalfling(0);
          ok('33d. cast innately (no slot): no bonus', !bonusOf(mi) && !!mi, `formula="${mi?.rolls?.[0]?.formula}"`);
        }
      } finally {
        if (cure) await unlend(cleric, cure);
        if (disciple && !own) await unlend(cleric, disciple);
        await healFull();
        unrig();
      }
    });

    // ---- 50. the spell-damage bonuses: Potent Spellcasting, Radiant Soul (once per turn), Empowered Evocation, Elemental Affinity (once per cast)
    if (want(50)) await section(50, async () => {
      await closeA1();
      hgKeep(cleric, { 'system.abilities.wis.value': Number(cleric.system.abilities?.wis?.value ?? 10) });
      hgKeep(sorcerer, { 'system.abilities.int.value': Number(sorcerer.system.abilities?.int?.value ?? 10), 'system.abilities.cha.value': Number(sorcerer.system.abilities?.cha?.value ?? 10),
        'system.spells': foundry.utils.deepClone(sorcerer.system._source.spells) });
      const potent = await hgLend(cleric, 'Blessed Strikes: Potent Spellcasting', 'feat');
      const flame = await lendClassSpell(cleric, 'Sacred Flame', 'cleric', { 'system.method': 'atwill' });
      const soul = await hgLend(sorcerer, 'Radiant Soul', 'feat');
      const evocation = await hgLend(sorcerer, 'Empowered Evocation', 'feat');
      const affinity = await hgLend(sorcerer, 'Elemental Affinity', 'feat', { name: 'Elemental Affinity (Fire)' });
      const bolt = await lendClassSpell(sorcerer, 'Fire Bolt', 'wizard', { 'system.method': 'atwill' });
      const frost = await lendClassSpell(sorcerer, 'Ray of Frost', 'wizard', { 'system.method': 'atwill' });
      const sorcFlame = await lendClassSpell(sorcerer, 'Sacred Flame', 'cleric', { 'system.method': 'atwill' });
      let combat50 = null;
      try {
        if (!potent || !flame || !soul || !evocation || !affinity || !bolt || !frost || !sorcFlame) log.push(`§50 skipped: potent=${!!potent} flame=${!!flame} soul=${!!soul} evo=${!!evocation} affinity=${!!affinity} bolt=${!!bolt} frost=${!!frost} sorcFlame=${!!sorcFlame}`);
        else {
          await cleric.update({ 'system.abilities.wis.value': 16 });
          await sorcerer.update({ 'system.abilities.int.value': 14, 'system.abilities.cha.value': 18 });
          // a. Potent Spellcasting: a cleric cantrip's damage roll carries +Wis; the card's chip line
          const m1 = await spellDamage(cleric, flame, halflingToken);
          const f1 = styleFlag(m1);
          ok('50a. Potent Spellcasting: Sacred Flame\'s damage roll carries "@abilities.wis.mod" (+3), the record names the row',
            /abilities\.wis\.mod/.test(m1?.rolls?.[0]?.formula ?? '') || (f1?.styles?.[0]?.key === 'potent-spellcasting-cleric' && f1?.gain === 3),
            `formula="${m1?.rolls?.[0]?.formula}" flag=${JSON.stringify(f1 && { styles: f1.styles.map(s => [s.key, s.gain]), gain: f1.gain })}`);
          ok('50a-line. the damage card: "Blessed Strikes: Potent Spellcasting" with a +3 chip',
            /Potent Spellcasting/.test(cardText(m1?.id)) && /\+3/.test(cardText(m1?.id)), `card="${cardText(m1?.id).slice(0, 200)}"`);
          // b. Radiant Soul: +Cha to a radiant roll; once per turn in a combat
          combat50 = await (async () => {
            const [c] = await Combat.createDocuments([{ scene: scene.id, active: true }]);
            created.combats.push(c.id);
            await c.createEmbeddedDocuments('Combatant', [{ tokenId: sorcererDoc.id, sceneId: scene.id, actorId: sorcerer.id, initiative: 20 },
              { tokenId: victimToken.document.id, sceneId: scene.id, actorId: victim.id, initiative: 10 }]);
            await c.startCombat(); await until(() => c.started, { label: 'the §50 combat started' }); return c;
          })();
          const m2 = await spellDamage(sorcerer, sorcFlame, victimToken);
          const f2 = styleFlag(m2);
          // The turn chit is written after the damage card lands; the second roll reads it.
          await until(() => sorcerer.effects.find(e => e.getFlag(MOD, 'riderKey') === 'damage-rule:radiant-soul'), { timeout: 5000, label: 'Radiant Soul\'s turn chit on the Sorcerer' });
          const m3 = await spellDamage(sorcerer, sorcFlame, victimToken);
          ok('50b. Radiant Soul: the first radiant roll this turn carries +Cha (+4), the record "radiant-soul"; the second roll the same turn nothing (the turn chit)',
            (f2?.styles?.some(s => (s.key === 'radiant-soul') && (s.gain === 4))) && !styleFlag(m3)?.styles?.some(s => s.key === 'radiant-soul')
              && !!sorcerer.effects.find(e => e.getFlag(MOD, 'riderKey') === 'damage-rule:radiant-soul'),
            `first=${JSON.stringify(f2?.styles?.map(s => [s.key, s.gain]))} second=${JSON.stringify(styleFlag(m3)?.styles?.map(s => [s.key, s.gain]) ?? null)} chit=${!!sorcerer.effects.find(e => e.getFlag(MOD, 'riderKey') === 'damage-rule:radiant-soul')}`);
          // c. Empowered Evocation (+Int on a Wizard Evocation) and Elemental Affinity (Fire, +Cha) on Fire Bolt — one roll, both
          const m4 = await spellDamage(sorcerer, bolt, victimToken);
          const keys4 = (styleFlag(m4)?.styles ?? []).map(s => [s.key, s.gain]);
          ok('50c. Fire Bolt (a Wizard Evocation, fire): Empowered Evocation +2 and Elemental Affinity (Fire) +4 both ride; Radiant Soul does not (no radiant, no fire… fire yes but the chit stands)',
            keys4.some(([k, g]) => (k === 'empowered-evocation') && (g === 2)) && keys4.some(([k, g]) => (k === 'elemental-affinity') && (g === 4)),
            `styles=${JSON.stringify(keys4)} formula="${m4?.rolls?.[0]?.formula}"`);
          // d. Ray of Frost (cold): Empowered Evocation yes, Elemental Affinity (Fire) no
          const m5 = await spellDamage(sorcerer, frost, victimToken);
          const keys5 = (styleFlag(m5)?.styles ?? []).map(s => s.key);
          ok('50d. Ray of Frost (cold): Empowered Evocation rides, Elemental Affinity (Fire) does not', keys5.includes('empowered-evocation') && !keys5.includes('elemental-affinity'),
            `styles=${JSON.stringify(keys5)}`);
          // e. the faces: the sorcerer wears "Elemental Affinity (Fire)" live, the cleric "Blessed Strikes: Potent Spellcasting".
          // The faces are synced 150 ms after the sheet's LAST item change (damage-rules.js `scheduleSync`), and every damage
          // roll above writes its spell's `flags.dnd5e.last`, so the sync runs only once the rolls stop: the face is waited for,
          // as smoke-damage-rules waits for its own.
          const affinityFace = () => sorcerer.effects.find(e => e.getFlag(MOD, 'fightingStyle')?.key === 'elemental-affinity') ?? null;
          const face = await until(affinityFace, { timeout: 5000, label: 'the "Elemental Affinity (Fire)" face on the sorcerer' }).catch(() => null);
          ok('50e. the face: "Elemental Affinity (Fire)" live on the sorcerer, its word "fire"', !!face && !face.disabled && (face.getFlag(MOD, 'fightingStyle')?.word === 'fire'),
            `face=${face?.name ?? null} disabled=${face?.disabled} flag=${JSON.stringify(face?.getFlag(MOD, 'fightingStyle') ?? null)} all=${JSON.stringify(sorcerer.effects.map(e => [e.name, e.disabled, e.getFlag(MOD, 'fightingStyle')?.key ?? null]))} items=${JSON.stringify(sorcerer.items.filter(i => i.type === 'feat').map(i => i.name))} actor=${sorcerer.uuid}`);
        }
      } finally {
        await closeA1();
        if (combat50 && game.combats.get(combat50.id)) await combat50.delete();
        for (const it of [potent, flame]) if (it) await unlend(cleric, it);
        for (const it of [soul, evocation, affinity, bolt, frost, sorcFlame]) if (it) await unlend(sorcerer, it);
        await dropEffects(sorcerer, riderChits(sorcerer));
        await sleep(400);   // clock: the fighting styles' face sync, a 150 ms debounce after each unlend — its own deletes land before these
        for (const a of [cleric, sorcerer]) await dropEffects(a, a.effects.filter(e => e.getFlag(MOD, 'fightingStyle')).map(e => e.id));
        unrig(); clearTargets(); await healFull();
      }
    });

    // ---- 60. Blessed Healer (the cleric's own heal after its slot-cast heal on another) and Improved Warding Flare (temp HP with the Flare)
    if (want(60)) await section(60, async () => {
      await closeDialogs(); await spendLuck();
      const blessed = await hgLend(cleric, 'Blessed Healer', 'feat');
      const cure = await lendClassSpell(cleric, 'Cure Wounds', 'cleric');
      hgKeep(cleric, { 'system.attributes.hp.value': cleric.system._source.attributes.hp.value, 'system.attributes.hp.max': cleric.system._source.attributes.hp.max,
        'system.spells': foundry.utils.deepClone(cleric.system._source.spells) });
      const flare = await hgLend(halfling, 'Warding Flare', 'feat', { 'system.uses.max': '2', 'system.uses.spent': 0 });
      const improved = await hgLend(halfling, 'Improved Warding Flare', 'feat');
      try {
        if (!blessed || !cure || !flare || !improved) log.push(`§60 skipped: blessed=${!!blessed} cure=${!!cure} flare=${!!flare} improved=${!!improved}`);
        else {
          await cleric.update({ 'system.attributes.hp.max': 100, 'system.attributes.hp.value': 50, 'system.spells.spell1.value': 3, 'system.spells.spell2.value': 3 });
          await halfling.update({ 'system.attributes.hp.value': 1 });
          const clericTok = canvas.tokens.get(clericToken.id);
          clericTok?.control({ releaseOthers: true });
          const t0 = Date.now();
          faces([[3, 8], [5, 8]]);
          const card = await castSpell(cleric, clericTok, cure, 2, halflingToken);
          const cureAct = cleric.items.get(cure.id)?.system?.activities?.find(a => a.type === 'heal');
          halflingToken.setTarget(true, { releaseOthers: true });
          const rolls = await cureAct.rollDamage({ scaling: 1 }, { configure: false }, card?.id ? { data: { 'system.origin': card.id } } : {});
          const self = await until(() => b4Card(t0, 'healSelf'), { timeout: 10000, label: 'Blessed Healer\'s own card' });
          // The card is posted, the cleric healed, then the receipt written on the card: the last of the three.
          await until(() => self.getFlag(MOD, 'receipt'), { timeout: 8000, label: 'Blessed Healer\'s healing receipted' });
          unrig(); clearTargets();
          ok('60a. Cure Wounds (level 2) at the Halfling: the card "Blessed Healer — BTB Test Cleric regains 4 Hit Points", the cleric 50 → 54, receipted',
            !!self && (self.getFlag(MOD, 'healSelf')?.amount === 4) && (Number(cleric.system.attributes.hp.value) === 54) && !!self.getFlag(MOD, 'receipt'),
            `card=${!!self} flag=${JSON.stringify(self?.getFlag(MOD, 'healSelf') ?? null)} hp=${cleric.system.attributes.hp.value} rolls=${!!rolls}`);
          // b. Improved Warding Flare: the Halfling flares the Attacker's hit — the temp HP land with the answer
          await healFull(); await dropReactionChips(halfling);
          const msg = await swing({ d20: [12] });
          const pop = await until(rescuePopup, { timeout: 8000, label: 'the Halfling\'s rescue popup' });
          const box = [...(pop?.element?.querySelectorAll?.('input[name="bf-rescue"]') ?? [])].find(b => b.value === 'Warding Flare');
          ok('60b. the Halfling hit: its rescue popup offers Warding Flare', !!pop && !!box, `pop=${!!pop} rows=${JSON.stringify([...(pop?.element?.querySelectorAll?.('input[name="bf-rescue"]') ?? [])].map(b => b.value))}`);
          faces([[2, 20], [4, 6], [3, 6]]);
          // The row's click is handled inside it (the kit's answerDeflect answers the same way).
          if (box) { if (!box.checked) box.click(); pop.element.querySelector('button[data-action="answer"]')?.click(); }
          const t = await resolvedTarget(msg);
          const temp = await until(() => (Number(halfling.system.attributes.hp.temp) > 0) ? Number(halfling.system.attributes.hp.temp) : null, { timeout: 10000, label: 'Improved Warding Flare\'s Temporary Hit Points on the Halfling' });
          unrig();
          ok('60c. Warding Flare answered: the roll bent, and Improved Warding Flare\'s Temporary Hit Points (2d6 + Wis) land on the Halfling',
            (t?.rescue === 'Warding Flare') && (temp >= 2 + abilityMod(halfling, 'wis')) && (temp <= 12 + abilityMod(halfling, 'wis')),
            `rescue=${t?.rescue} temp=${temp} wis=${abilityMod(halfling, 'wis')} receipt=${JSON.stringify(msg?.getFlag(MOD, 'receipt')?.targets?.map(x => [x.name, x.taken, x.note]) ?? null)}`);
        }
      } finally {
        await closeA1(); await closeOffers();
        for (const it of [blessed, cure]) if (it) await unlend(cleric, it);
        for (const it of [flare, improved]) if (it) await unlend(halfling, it);
        await dropReactionChips(halfling);
        unrig(); clearTargets(); await healFull();
      }
    });

    // ---- 86. Improved Blessed Strikes: the temp HP offered when a cleric cantrip lands damage
    if (want(86)) await section(86, async () => {
      await closeA1(); await a1Victim(); await dropVictimFx(); await set('saveRolls', 'auto');
      hgKeep(cleric, { 'system.attributes.hp.temp': cleric.system._source.attributes.hp.temp ?? 0 });
      hgKeep(halfling, { 'system.attributes.hp.temp': halfling.system._source.attributes.hp.temp ?? 0 });
      const ibs = await hgLend(cleric, 'Improved Blessed Strikes', 'feat');
      const flame = await lendClassSpell(cleric, 'Sacred Flame', 'cleric');
      const temp = actor => Number(actor.system.attributes.hp.temp ?? 0);
      try {
        if (!ibs || !flame) log.push(`§86 skipped: strikes=${!!ibs} flame=${!!flame}`);
        else {
          for (const a of [cleric, halfling]) await a.update({ 'system.attributes.hp.temp': 0 });
          const wis = Number(cleric.getRollData()?.abilities?.wis?.mod ?? 0);
          const flameAct = flame.system.activities.find(a => a.type === 'save');
          clericToken.control({ releaseOthers: true });
          victimToken.setTarget(true, { releaseOthers: true });
          faces([[1, 20], [4, 8]]);
          await flameAct.use({}, { configure: false }, {});
          const ask = await until(() => game.messages.contents.find(m => (m.timestamp >= suiteStart) && (m.getFlag(MOD, 'restSong')?.row === 'Improved Blessed Strikes')) ?? null, { timeout: 12000, label: 'the Improved Blessed Strikes ask card' });
          const pop = await until(() => titled(/^Improved Blessed Strikes — /), { timeout: 6000, label: 'the Improved Blessed Strikes popup' });
          unrig();
          const flag = ask?.getFlag(MOD, 'restSong');
          ok(`86a. the cantrip's damage landed: "Improved Blessed Strikes — ${2 * wis} Temporary Hit Points for another creature", the cleric and the Halfling among the candidates`,
            !!ask && !!pop && (flag?.amount === 2 * wis) && (flag?.cap === 1) && (flag?.candidates ?? []).some(c => c.uuid === cleric.uuid) && (flag?.candidates ?? []).some(c => c.uuid === halfling.uuid),
            `ask=${!!ask} pop=${!!pop} amount=${flag?.amount} candidates=${JSON.stringify((flag?.candidates ?? []).map(c => c.name))}`);
          // The rows are checkboxes under a cap of 1: the default tick comes off by a click, the Halfling's goes on by a click.
          // The cap is kept by a change listener that greys or frees the other rows inside each click.
          const boxes = [...(pop?.element?.querySelectorAll('input[name="bf-rest-song"]') ?? [])];
          for (const b of boxes) if (b.checked && (b.value !== halfling.uuid)) b.click();
          const mine = boxes.find(i => i.value === halfling.uuid);
          if (mine && !mine.checked) mine.click();
          pop?.element?.querySelector('button[data-action="ok"]')?.click();
          // The sheets are written before the card is marked applied.
          await until(() => ask?.getFlag(MOD, 'restSong')?.applied, { timeout: 8000, label: 'the Improved Blessed Strikes pick applied' });
          ok('86b. OK: the Halfling gains the Temporary Hit Points', temp(halfling) === 2 * wis, `temp=${temp(halfling)} given=${JSON.stringify(ask?.getFlag(MOD, 'restSong')?.given ?? null)}`);
          clearTargets();
        }
      } finally {
        await closeA1(); await hgClose(/^Improved Blessed Strikes — /);
        for (const it of [flame, ibs]) if (it) await unlend(cleric, it);
        await dropVictimFx();
        unrig(); clearTargets();
      }
    });

    // ---- 99. Supreme Healing: the cleric's healing dice count their maximum
    if (want(99)) await section(99, async () => {
      await closeDialogs(); await spendLuck();
      const supreme = await hgLend(cleric, 'Supreme Healing', 'feat');
      const cure = await lendClassSpell(cleric, 'Cure Wounds', 'cleric');
      hgKeep(cleric, { 'system.spells': foundry.utils.deepClone(cleric.system._source.spells) });
      try {
        if (!supreme || !cure) log.push(`§99 skipped: supreme=${!!supreme} cure=${!!cure}`);
        else {
          await cleric.update({ 'system.spells.spell1.value': 3 });
          await halfling.update({ 'system.attributes.hp.value': 100, 'system.attributes.hp.temp': 0 });
          const wis = Number(cleric.getRollData()?.abilities?.wis?.mod ?? 0);
          const clericTok = canvas.tokens.get(clericToken.id);
          clericTok?.control({ releaseOthers: true });
          faces([[1, 8], [1, 8]]);
          const card = await castSpell(cleric, clericTok, cure, 1, halflingToken);
          const cureAct = cleric.items.get(cure.id)?.system?.activities?.find(a => a.type === 'heal');
          halflingToken.setTarget(true, { releaseOthers: true });
          await cureAct.rollDamage({}, { configure: false }, card?.id ? { data: { 'system.origin': card.id } } : {});
          unrig(); clearTargets();
          // The maximum is computed before the healing lands: one write.
          await until(() => hp() > 100, { timeout: 10000, label: 'the Cure Wounds healing landed on the Halfling' });
          const healed = hp() - 100;
          ok('99a. Cure Wounds with ones on the dice heals the MAXIMUM (2d8 → 16, + Wis) — the receipt names Supreme Healing',
            healed === 16 + wis, `healed=${healed} wis=${wis}`);
        }
      } finally {
        await closeDialogs();
        if (cure) await unlend(cleric, cure);
        if (supreme) await unlend(cleric, supreme);
        await healFull();
        unrig(); clearTargets();
      }
    });

    // ---- 101. Improved Duplicity: the ally's attack lists Shared Distraction
    if (want(101)) await section(101, async () => {
      await closeA1();
      const dup = await hgLend(cleric, 'Improved Duplicity', 'feat');
      try {
        const wAct = pcWeapon ? attackOf(pcAttacker, pcWeapon) : null;
        if (!dup || !wAct) log.push(`§101 skipped: duplicity=${!!dup} weapon=${!!wAct}`);
        else {
          const gate = await gateFor(pcToken, wAct, victimToken);
          ok('101a. the cleric\'s ally attacks: the gate lists "Improved Duplicity (listed — Advantage only against a creature within 5 feet of the cleric\'s illusion)", not counted',
            gate.open && /Improved Duplicity/.test(gate.text) && /illusion/.test(gate.text), `net=${gate.net} text="${gate.text.slice(0, 260)}"`);
          const gate2 = await gateFor(attackerToken, act(), halflingToken);
          ok('101b. an enemy\'s attack lists nothing of it', gate2.open && !/Improved Duplicity/.test(gate2.text), `text="${gate2.text.slice(0, 200)}"`);
        }
      } finally {
        await closeA1();
        if (dup) await unlend(cleric, dup);
        unrig(); clearTargets();
      }
    });

    // ---- 102. Corona of Light: the light on the cleric, the ring's enemies at Disadvantage against its radiant spell
    if (want(102)) await section(102, async () => {
      await closeA1(); await activateRange(); await set('saveRolls', 'prompt');
      const corona = await hgLend(cleric, 'Corona of Light', 'feat', { 'system.uses.max': '3', 'system.uses.spent': 0 });
      let flameLent = null;
      try {
        if (!corona) log.push('§102 skipped: no Corona of Light');
        else {
          await useFeature(clericToken, corona, 'Emit Aura of Sunlight');
          const lit = await until(() => cleric.effects.find(e => (e.name === 'Corona of Light') && e.getFlag(MOD, 'tokenLight')) ?? null, { timeout: 8000, label: 'Corona of Light with its light on the Cleric' });
          const region = await until(() => { const r = d1Region('Corona of Light', clericToken.document.id); return (r?.behaviors?.size) ? r : null; }, { timeout: 12000, label: 'the Corona of Light ring with its behaviors' });
          const member = await until(() => victim.effects.find(e => e.name.startsWith('Corona of Light') && e.getFlag(MOD, 'emanation')) ?? null, { timeout: 10000, label: 'the ring\'s member copy on the Victim' });
          ok('102a. the use lands "Corona of Light" on the cleric with its light (60 / 90), the 60-ft ring stands, the Victim inside wears the member copy',
            !!lit && !!region && !!member, `lit=${!!lit} region=${!!region} member=${member?.name ?? null}`);
          let flameId = cleric.items.find(i => (i.name === 'Sacred Flame') && (i.type === 'spell'))?.id;
          if (!flameId) { flameLent = await hgLend(cleric, 'Sacred Flame', 'spell', { 'system.prepared': 1, 'system.method': 'atwill' }); flameId = flameLent?.id; }
          const flameAct = cleric.items.get(flameId)?.system?.activities?.find(a => a.type === 'save');
          clericToken.control({ releaseOthers: true });
          victimToken.setTarget(true, { releaseOthers: true });
          const use = await flameAct.use({ consume: { spellSlot: false } }, { configure: false }, {});
          const card = use?.message ?? null;
          await until(() => card?.getFlag(MOD, 'saves'), { timeout: 6000, label: 'the Sacred Flame demand stamped' });
          const p = victim.rollSavingThrow({ ability: 'dex' }, {}, {});
          let settled = false;
          Promise.resolve(p).catch(() => {}).finally(() => { settled = true; });
          const dlg = await until(rollDialog, { timeout: 6000, label: 'the Victim\'s save dialog' });
          await gateDrawn(dlg);
          const text = textOf(dlg?.element?.querySelector('[data-bf-reminder]'));
          const net = dlg?.options?.bfSaveGate?.net ?? null;
          ok('102b. the Victim\'s save against the cleric\'s Sacred Flame (radiant): the gate lists "Corona of Light — against BTB Test Cleric\'s spell", net Disadvantage',
            !!dlg && /Corona of Light/.test(text) && (net === 'disadvantage'), `dlg=${!!dlg} net=${net} text="${text.slice(0, 220)}"`);
          try { await dlg?.close(); } catch { /* gone */ }
          // ⚠ A closed roll dialog under a PROMPT demand never settles the roll promise: the wait is bounded and soft.
          await until(() => settled, { timeout: 3000 }).catch(() => null);
          await hgClose(/Saving Throw/);
        }
      } finally {
        await closeA1();
        await dropNamed(cleric, ['Corona of Light']); await dropEffects(victim, victim.effects.filter(e => e.name.startsWith('Corona of Light')).map(e => e.id));
        if (flameLent) await unlend(cleric, flameLent);
        if (corona) await unlend(cleric, corona);
        const gone = await until(() => !d1Region('Corona of Light', clericToken.document.id), { timeout: 8000 }).catch(() => null);
        if (!gone) { const r = d1Region('Corona of Light', clericToken.document.id); if (r) await r.delete().catch(() => {}); }
        unrig(); clearTargets();
        await backToRange();
      }
    });
    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  }
} });

await finish({ tag: 'class-cleric', out, plan, f });
