// Classes smoke suite — Wizard: the PHB classes plan's rows (audits/plans/session-0-classes.md) for
// the Wizard, each section keeping its number and title. The fixtures, the lends, the
// helpers and the teardown are the classes kit's (tools/class-kit.mjs); everything written is restored.
import { announcePlan, connectSuite, finish, sectionPlan } from './harness.mjs';
import { runClassSuite } from './class-kit.mjs';

// The coverage map (tools/coverage-map.mjs) parses this; ⚠ never import a suite (it connects on evaluation).
export const COVERS = [
  'hold/trigger.js',        // Portent on an enemy's crit and hit (§41)
  'hold/lookup.js',         // the diviner as a bystander (§41)
  'hold/answer.js',         // the face replaced (§41)
  'hold/views.js',          // the bend banner (§41)
  'hold/continue.js',       // the verdict retaken (§41)
  'hold/dice.js',           // the bent roll's chips (§41)
  'bystanders.js',          // Portent on an ally's save and on a check with a DC (§41, §126)
  'saves/verdict.js',       // Potent Cantrip stamped on the entry at the fold (§32)
  'precision.js',           // the miss wait's synchronous half (Potent Cantrip's miss, §35)
  'ward-pools.js',          // Arcane Ward: the take, the pop, the cast's create and refill (§36)
  'receipts.js',            // the revert gives the ward its take back (§36)
  'stored-dice.js',         // Portent: the rest's dice, the chip, its own roll's tick (§41, §82)
  'reminders.js'            // Spell Resistance in the save gate (§83)
];

const SECTIONS = {
  32: 'Potent Cantrip (lent to the Attacker): the Halfling SAVES against its Sacred Flame — "saved — half damage (Potent Cantrip)", half the roll lands; taken back, a saved Sacred Flame lands nothing',
  35: 'Potent Cantrip on a MISS (BTB Test PC Attacker\'s Fire Bolt at the Victim, AC 30): the damage rolls and half lands — "missed — Potent Cantrip, half damage"; without the feature nothing rolls; with Heroic Inspiration the rescue window opens first and nothing rolls until Pass — then half lands; the Heroic reroll turning it lands the FULL roll, never a share',
  36: 'Arcane Ward (lent to the Sorcerer, 12 HP): the first Abjuration cast from a slot (Mage Armor) creates it — "Arcane Ward — created, 12 hit points (of 12)"; 5 damage applied straight to the actor (the card buttons\' road) lands on the ward, HP untouched; a hit through the module with the ward at 2: "Arcane Ward took 2 — N landed", the revert gives both back; a level-2 cast refills +4; at 0 it takes nothing',
  41: 'Portent (lent to the Sorcerer): the Long Rest keeps 17 and 3 on a chip; in its own save dialog "use the 17" ticked makes the d20 the 17; a failed save of an ally that a stored 18 turns asks the diviner and Answer SAVES it; a critical hit by an enemy asks "replace the 20 with the 2" and makes it a MISS; an ordinary hit a stored 2 turns asks too (2026-10-14) and every screen sees the bend banner; a friend\'s miss a stored 20 turns is a Critical Hit, its damage rolled critical',
  82: 'Greater Portent (C1, the Sorcerer): the Long Rest keeps three faces',
  83: 'Spell Resistance (C1, the Sorcerer): the save gate against a spell lists it, net Advantage',
  126: 'Portent widened (2026-10-14, lent to the Sorcerer): a check or a save whose roll carries a DC asks the diviner with the faces that turn it and the card says SUCCESS; a bare check asks nobody'
};
const DEPENDS = {};

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'class-wizard', watchdogMs: 900_000 });
announcePlan('class-wizard', plan, pulled);

const out = await runClassSuite(f, { plan, sections: SECTIONS, body: async ({ sections, titles }) => {
  const { until, watch, faces, unrig } = window.__btb;
  const { results, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const KIT = window.__btbClasses;
  const { MOD, a1Victim, a4Card, act, attacker, attackerToken, cardEl, cardText, clearTargets, closeA1, closeDialogs, damageFor, findPHB, gateDrawn, halfling, halflingToken, healFull, hgClose, hgKeep, hgLend, holdOf, hp, lentBy, log, missTarget, pcAttacker, pcToken, pcWeapon, pickApply, popupTitled, popups, resolvedTarget, rollDialog, rollPopup, rollStoredAsk, set, sorcTokC, sorcerer, spendLuck, swing, swingAt, textOf, unlend, victim, victimToken } = KIT;
  try {
    await KIT.leaveA3();
    KIT.markA2();

    // ---- 32. Potent Cantrip: the caster's mirror of Evasion
    if (want(32)) await section(32, async () => {
      await closeDialogs(); await set('saveRolls', 'auto');
      const potent = await hgLend(attacker, 'Potent Cantrip', 'feat');
      let flameId = attacker.items.find(i => (i.name === 'Sacred Flame') && (i.type === 'spell'))?.id;
      if (!flameId) {
        const flame = await hgLend(attacker, 'Sacred Flame', 'spell', { 'system.prepared': 1, 'system.method': 'atwill' });
        flameId = flame?.id;
      }
      const flameAct = () => attacker.items.get(flameId)?.system?.activities?.find(a => a.type === 'save');
      /** Sacred Flame at the Halfling, every die at its top face (the save a 20): the card, its entry, the damage and the HP lost. */
      const flameAtHalfling = async () => {
        await healFull();
        const t0 = Date.now();
        attackerToken.control({ releaseOthers: true });
        halflingToken.setTarget(true, { releaseOthers: true });
        faces([[20, 20]]);
        const use = await flameAct().use({ consume: { spellSlot: false } }, { configure: false }, {});
        const card = use?.message ?? null;
        const entry = await until(() => { const e = card?.getFlag(MOD, 'saves')?.targets?.find(x => x.uuid === halfling.uuid); return e?.done ? e : null; }, { timeout: 12000, label: 'the Halfling\'s save entry done on the Sacred Flame card' });
        // The demand rolls the damage as it stamps, whatever the save does.
        const dmg = await until(() => a4Card(t0, m => (m.type === 'damage') && (m.system?.origin === card?.id || m._source?.system?.origin === card?.id)), { timeout: 8000, label: 'Sacred Flame\'s damage roll' });
        // A success with no share writes no receipt (the multiplier is null): the wait runs out, then the HP are read.
        // A receipt is written after the Hit Points, so the HP read here are the landed ones.
        await until(() => dmg?.getFlag(MOD, 'receipt'), { timeout: 6000 }).catch(() => null);
        clearTargets();
        return { card, entry, dmg, total: Number(dmg?.rolls?.reduce((n, r) => n + (Number(r.total) || 0), 0)), lost: 400 - hp() };
      };
      try {
        if (!potent || !flameAct()) log.push(`§32 skipped: potent=${!!potent} flame=${!!flameAct()}`);
        else {
          const a = await flameAtHalfling();
          ok('32a. the Halfling saves; the entry carries the caster\'s row (casterHalf: Potent Cantrip)',
            (a.entry?.outcome === 'saved') && (a.entry?.casterHalf?.by === 'Potent Cantrip'),
            JSON.stringify({ outcome: a.entry?.outcome, casterHalf: a.entry?.casterHalf ?? null }));
          ok('32b. half the roll lands', (a.total > 1) && (a.lost === Math.floor(a.total / 2)), `total=${a.total} lost=${a.lost}`);
          ok('32c. the card says "saved — half damage (Potent Cantrip)"', /saved — half damage \(Potent Cantrip\)/.test(cardText(a.card?.id)), cardText(a.card?.id).slice(0, 240));
          await unlend(attacker, potent);
          const b = await flameAtHalfling();
          ok('32d. taken back: a saved Sacred Flame lands nothing', (b.entry?.outcome === 'saved') && !b.entry?.casterHalf && (b.lost === 0), `outcome=${b.entry?.outcome} lost=${b.lost}`);
        }
      } finally {
        if (potent) await unlend(attacker, potent);
        await healFull();
        unrig();
      }
    });

    // ---- 35. Potent Cantrip on a miss: rolled once the miss is final, half landed
    if (want(35)) await section(35, async () => {
      await closeDialogs(); await a1Victim();
      const potent = await hgLend(pcAttacker, 'Potent Cantrip', 'feat');
      const bolt = await hgLend(pcAttacker, 'Fire Bolt', 'spell', { 'system.prepared': 1, 'system.method': 'atwill' });
      const boltAct = () => pcAttacker.items.get(bolt?.id)?.system?.activities?.find(a => a.type === 'attack') ?? null;
      hgKeep(pcAttacker, { 'system.attributes.inspiration': pcAttacker.system._source.attributes?.inspiration ?? false });
      const vhp = () => Number(victim.system.attributes.hp.value);
      // ⚠ Only a window opened SINCE this attack: an earlier section's rescue window can still stand in a full run.
      const rescueWindow = prior => [...document.querySelectorAll('.application')]
        .find(el => !prior.has(el) && el.querySelector('[data-bf-rescue-action="heroic"]')) ?? null;
      const appsNow = () => new Set(document.querySelectorAll('.application'));
      const damagesFor = id => game.messages.contents.filter(m => (m.type === 'damage') && (m.getFlag(MOD, 'attackFor') === id));
      const totalOf = d => Number(d?.rolls?.reduce((n, r) => n + (Number(r.total) || 0), 0));
      /** Fire Bolt at the Victim (400 HP): the d20 a 2, later dice `after`; the attack message. */
      const boltMiss = async (after = [[8, 10]]) => {
        await victim.update({ 'system.attributes.hp.value': 400, 'system.attributes.hp.temp': 0 });
        pcToken.control({ releaseOthers: true });
        victimToken.setTarget(true, { releaseOthers: true });
        faces([[2, 20], ...after]);
        const rolls = await boltAct().rollAttack({}, { configure: false }, {});
        return rolls?.[0]?.parent ?? null;
      };
      try {
        if (!potent || !boltAct()) log.push(`§35 skipped: potent=${!!potent} bolt=${!!boltAct()}`);
        else {
          await pcAttacker.update({ 'system.attributes.inspiration': false });
          // the pinned 2 misses AC 20; a reroll's 20 still reaches it, so Heroic Inspiration is offered (RULINGS *Rescuing the hit*)
          await victim.update({ 'system.attributes.ac.override': 20 });
          // a. the clean miss, no rescue: the share rolls and lands
          const m1 = await boltMiss();
          const d1 = await until(() => { const d = damagesFor(m1?.id)[0]; return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 10000, label: 'the missed Fire Bolt\'s share receipted' });
          const note1 = JSON.stringify(d1?.getFlag(MOD, 'receipt') ?? null);
          ok('35a. a missed Fire Bolt: its damage rolls and half lands, the receipt says "missed — Potent Cantrip, half damage"',
            (totalOf(d1) > 1) && ((400 - vhp()) === Math.floor(totalOf(d1) / 2)) && /missed — Potent Cantrip, half damage/.test(note1),
            `total=${totalOf(d1)} lost=${400 - vhp()} receipt=${note1.slice(0, 160)}`);
          unrig();
          // b. without the feature: nothing rolls
          await unlend(pcAttacker, potent);
          const m2 = await boltMiss();
          // The window: a miss with no share to pay rolls nothing and lands nothing.
          const stray2 = await watch(() => (damagesFor(m2?.id).length > 0) || (vhp() !== 400), { ms: 2500 });
          ok('35b. without Potent Cantrip a miss rolls nothing', !stray2 && !damagesFor(m2?.id).length && (vhp() === 400), `damages=${damagesFor(m2?.id).length} hp=${vhp()} stray=${!!stray2}`);
          unrig();
          const potent2 = await hgLend(pcAttacker, 'Potent Cantrip', 'feat');
          // c. a rescue window first (Heroic Inspiration): nothing rolls while it stands; Pass → the share
          await pcAttacker.update({ 'system.attributes.inspiration': true });
          const prior3 = appsNow();
          const m3 = await boltMiss();
          const win3 = await until(() => rescueWindow(prior3), { timeout: 8000, label: 'the Heroic Inspiration rescue window' });
          // The window: nothing rolls while the rescue window stands.
          const early3 = await watch(() => damagesFor(m3?.id).length > 0, { ms: 1200 });
          const early = damagesFor(m3?.id).length;
          ok('35c. with Heroic Inspiration the rescue window opens and NOTHING rolls while it stands', !!win3 && !early3 && (early === 0) && (m3?.getFlag(MOD, 'd20fold')?.status === 'pending'),
            `window=${!!win3} damages=${early} fold=${m3?.getFlag(MOD, 'd20fold')?.status}`);
          faces([[8, 10]]);
          win3?.querySelector('button[data-action="pass"]')?.click();
          const d3 = await until(() => { const d = damagesFor(m3?.id)[0]; return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 10000, label: 'the share receipted after Pass' });
          // The window: the share lands once — no second damage roll, no second landing.
          const twice3 = await watch(() => (damagesFor(m3?.id).length > 1) || ((400 - vhp()) !== Math.floor(totalOf(d3) / 2)), { ms: 800 });
          ok('35d. Pass: the miss stands — the share rolls and half lands, once', !twice3 && (damagesFor(m3?.id).length === 1) && (totalOf(d3) > 1) && ((400 - vhp()) === Math.floor(totalOf(d3) / 2)),
            `damages=${damagesFor(m3?.id).length} total=${totalOf(d3)} lost=${400 - vhp()} stray=${!!twice3}`);
          unrig();
          // e. the Heroic reroll turns it: the FULL roll, one damage message, no share
          await pcAttacker.update({ 'system.attributes.inspiration': true });
          await victim.update({ 'system.attributes.ac.override': 12 });
          const prior4 = appsNow();
          const m4 = await boltMiss();
          const win4 = await until(() => rescueWindow(prior4), { timeout: 8000, label: 'the second rescue window' });
          faces([[20, 20], [8, 10]]);
          win4?.querySelector('[data-bf-rescue-action="heroic"]')?.click();
          const d4 = await until(() => { const d = damagesFor(m4?.id)[0]; return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000, label: 'the turned hit\'s damage receipted' });
          // The window: one damage roll, the full total — no share rolled or landed beside it.
          const share4 = await watch(() => (damagesFor(m4?.id).length > 1) || ((400 - vhp()) !== totalOf(d4)), { ms: 1500 });
          ok('35e. the Heroic reroll turns the miss: ONE damage roll, the full total lands (never a share beside it)',
            !share4 && (damagesFor(m4?.id).length === 1) && (totalOf(d4) > 0) && ((400 - vhp()) === totalOf(d4)),
            `damages=${damagesFor(m4?.id).length} total=${totalOf(d4)} lost=${400 - vhp()} stray=${!!share4} fold=${JSON.stringify(m4?.getFlag(MOD, 'd20fold')?.targets?.map(t => t.verdict))}`);
          await unlend(pcAttacker, potent2);
        }
      } finally {
        await closeDialogs();
        for (const it of pcAttacker.items.filter(i => ['Potent Cantrip', 'Fire Bolt'].includes(i.name) && (lentBy.get(pcAttacker) ?? []).includes(i.id))) await unlend(pcAttacker, it);
        await victim.update({ 'system.attributes.hp.value': 400 });
        unrig();
        clearTargets();
      }
    });

    // ---- 36. Arcane Ward: the ward pool
    if (want(36)) await section(36, async () => {
      await closeDialogs();
      const ward = await hgLend(sorcerer, 'Arcane Ward', 'feat', { 'system.uses.max': '12', 'system.uses.spent': 12 });
      const armor = await hgLend(sorcerer, 'Mage Armor', 'spell', { 'system.prepared': 1, 'system.method': 'spell' });
      const sorcTok = canvas.tokens.placeables.find(t => t.actor?.id === sorcerer.id) ?? null;
      hgKeep(sorcerer, {
        'system.attributes.hp.value': sorcerer.system._source.attributes.hp.value,
        'system.attributes.hp.max': sorcerer.system._source.attributes.hp.max,
        'system.attributes.hp.temp': sorcerer.system._source.attributes.hp.temp ?? 0,
        'system.attributes.ac.override': sorcerer.system._source.attributes.ac.override ?? null,
        'system.spells': foundry.utils.deepClone(sorcerer.system._source.spells)
      });
      const wardNow = () => Number(sorcerer.items.get(ward?.id)?.system?.uses?.value ?? NaN);
      const shp = () => Number(sorcerer.system.attributes.hp.value);
      const setWard = n => sorcerer.items.get(ward.id).update({ 'system.uses.spent': 12 - n });
      const armorAct = () => sorcerer.items.get(armor?.id)?.system?.activities?.contents?.[0] ?? null;
      const lineOf = async card => (await until(() => cardEl(card?.id)?.querySelector('.bf-ward-line'), { timeout: 5000, label: 'the ward line on the cast card' }))?.textContent?.trim() ?? '';
      const cast = async (level = 1) => {
        sorcTok?.setTarget(true, { releaseOthers: true });
        const r = await armorAct()?.use({ spell: { slot: `spell${level}` }, subsequentActions: false }, { configure: false }, {});
        clearTargets();
        const card = r?.message ?? null;
        // The ward's uses are written before the card's flag.
        await until(() => card?.getFlag(MOD, 'wardRefill'), { timeout: 6000, label: 'the cast\'s ward record on its card' });
        return card;
      };
      try {
        if (!ward || !armorAct() || !sorcTok) log.push(`§36 skipped: ward=${!!ward} armor=${!!armorAct()} token=${!!sorcTok}`);
        else {
          await sorcerer.update({ 'system.attributes.hp.max': 200, 'system.attributes.hp.value': 200, 'system.attributes.hp.temp': 0,
            'system.attributes.ac.override': 5, 'system.spells.spell1.value': 4, 'system.spells.spell2.value': 3 });
          // a. the first Abjuration slot cast creates it, full
          const c1 = await cast(1);
          ok('36a. Mage Armor (level 1) creates the ward: 12 of 12, the card says "created, 12 hit points (of 12)"',
            (wardNow() === 12) && /Arcane Ward — created, 12 hit points \(of 12\)/.test(await lineOf(c1)), `ward=${wardNow()} line="${await lineOf(c1)}"`);
          // b. damage applied straight to the actor (the card's own buttons' road): the ward takes it
          await sorcerer.applyDamage([{ value: 5, type: 'bludgeoning' }]);
          // The Hit Points are written with the update; the ward's take is its feature's uses, written after it.
          await until(() => (wardNow() < 12) || (shp() < 200), { label: 'the 5 taken by the ward (or landed)' });
          ok('36b. 5 damage applied to the actor lands on the ward: HP untouched, the ward 12 → 7', (shp() === 200) && (wardNow() === 7), `hp=${shp()} ward=${wardNow()}`);
          // c. a hit through the module with the ward at 2: the receipt says what it took; the revert gives both back
          await setWard(2);
          attackerToken.control({ releaseOthers: true });
          sorcTok.setTarget(true, { releaseOthers: true });
          faces([[15, 20], [6, 6], [6, 6]]);
          const usage = await act().use({ subsequentActions: false }, { configure: false }, {});
          const rolls = await act().rollAttack({}, { configure: false }, usage?.message?.id ? { data: { 'system.origin': usage.message.id } } : {});
          const atk = rolls?.[0]?.parent ?? null;
          const dmg = await until(() => { const d = damageFor(atk?.id); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000, label: 'the hit on the warded Sorcerer receipted' });
          unrig();
          clearTargets();
          const total = Number(dmg?.rolls?.reduce((n, r) => n + (Number(r.total) || 0), 0));
          const entry = dmg?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === sorcerer.uuid);
          ok('36c. a hit with the ward at 2: "Arcane Ward took 2 — N landed", the ward 0, the HP down by the rest',
            (wardNow() === 0) && (shp() === 200 - (total - 2)) && new RegExp(`Arcane Ward took 2 — ${total - 2} landed`).test(entry?.note ?? '') && (entry?.ward?.took === 2),
            `total=${total} hp=${shp()} ward=${wardNow()} note="${entry?.note}" ward=${JSON.stringify(entry?.ward)}`);
          const { revertTarget } = await import('/modules/fvtt-mod-bythebooks/scripts/receipts.js');
          // The revert awaits both writes: the Hit Points, then the ward's uses.
          await revertTarget(dmg, sorcerer.uuid);
          ok('36d. the revert gives both back: HP 200, the ward 2', (shp() === 200) && (wardNow() === 2), `hp=${shp()} ward=${wardNow()}`);
          // e. a level-2 Abjuration cast refills +4
          await setWard(0);
          const c2 = await cast(2);
          ok('36e. Mage Armor at level 2 refills +4: "Arcane Ward — +4 (4 of 12)"', (wardNow() === 4) && /Arcane Ward — \+4 \(4 of 12\)/.test(await lineOf(c2)),
            `ward=${wardNow()} line="${await lineOf(c2)}"`);
          // f. at 0 it takes nothing
          await setWard(0);
          // A ward at 0 takes nothing: the Hit Points are written with the awaited update.
          await sorcerer.applyDamage([{ value: 5, type: 'bludgeoning' }]);
          ok('36f. a ward at 0 takes nothing: the 5 lands', (shp() === 195) && (wardNow() === 0), `hp=${shp()} ward=${wardNow()}`);
        }
      } finally {
        if (armor) await unlend(sorcerer, armor);
        if (ward) await unlend(sorcerer, ward);
        unrig();
        clearTargets();
      }
    });

    // ---- 41. Portent: the rest's dice, the own roll's tick, an ally's demanded save, an enemy's critical hit
    if (want(41)) await section(41, async () => {
      await closeA1(); await spendLuck();
      hgKeep(sorcerer, { 'system.spells': foundry.utils.deepClone(sorcerer.system._source.spells),
        'system.attributes.hp.value': sorcerer.system._source.attributes.hp.value });
      const portent = await hgLend(sorcerer, 'Portent', 'feat');
      const chip = () => sorcerer.effects.find(e => e.getFlag(MOD, 'storedDice')?.key === 'Portent') ?? null;
      const facesNow = () => chip()?.getFlag(MOD, 'storedDice')?.faces ?? [];
      const setFaces = async f => chip()?.update({ name: `Portent — ${f.join(' · ')}`, [`flags.${MOD}.storedDice`]: { key: 'Portent', faces: f, turn: null } });
      try {
        if (!portent) log.push('§41 skipped: no Portent in the PHB');
        else {
          // a. the Long Rest rolls two d20s and keeps them on a chip
          const t0 = Date.now();
          faces([[17, 20], [3, 20]]);
          await sorcerer.longRest({ dialog: false, chat: true, newDay: false });
          const askedA = await rollStoredAsk();
          await until(() => chip(), { timeout: 8000, label: 'the Portent chip written at the rest' });
          unrig();
          const restCard = await until(() => game.messages.contents.find(m => (m.timestamp >= t0) && m.getFlag(MOD, 'storedRolled')) ?? null, { timeout: 6000, label: 'the rest\'s Portent roll card' });
          const restLine = (await until(() => cardEl(restCard?.id)?.querySelector('.bf-stored-line'), { timeout: 4000, label: 'the stored line on the rest\'s roll card' }))?.textContent?.trim() ?? '';
          ok('41a. the Long Rest asks the Sorcerer to roll; Roll: the chip "Portent — 17 · 3", the roll\'s card "Portent — 17 and 3 kept"',
            askedA && (chip()?.name === 'Portent — 17 · 3') && /Portent — 17 and 3 kept/.test(restLine) && !!restCard?.getFlag(MOD, 'storedFor'),
            `asked=${askedA} chip=${chip()?.name ?? null} line="${restLine}" for=${restCard?.getFlag(MOD, 'storedFor') ?? null}`);
          // b. its own save, the dialog: "use the 17" ticked — the d20 IS the 17, the face gone
          const p = sorcerer.rollSavingThrow({ ability: 'wis' }, {}, {});
          const dlg = await until(rollDialog, { timeout: 6000, label: 'the Sorcerer\'s save dialog' });
          await until(() => dlg?.element?.querySelector('[data-bf-stored]'), { timeout: 3000, label: 'the stored-dice ticks in the save dialog' });
          const tick = [...(dlg?.element?.querySelectorAll('input[name="bf-stored"]') ?? [])].find(i => /use the 17/.test(textOf(i.closest('label'))));
          const boxText = textOf(dlg?.element?.querySelector('[data-bf-stored]'));
          // The tick's change handler arms the face and redraws the box inside the dispatch.
          if (tick) { tick.checked = true; tick.dispatchEvent(new Event('change', { bubbles: true })); }
          dlg?.element?.querySelector('button[data-action="normal"]')?.click();
          const rolls = await p;
          const r0 = rolls?.[0];
          const lineB = (await until(() => cardEl(r0?.parent?.id)?.querySelector('.bf-stored-line'), { timeout: 4000, label: 'the stored line on the save\'s card' }))?.textContent?.trim() ?? '';
          // The face is struck off the chip after the roll goes out.
          await until(() => facesNow().length === 1, { timeout: 4000, label: 'the 17 struck off the chip' });
          ok('41b. its own save: the dialog offers "use the 17" / "use the 3"; ticked, the d20 is the 17, the chip "Portent — 3", the card says so',
            /use the 17/.test(boxText) && /use the 3/.test(boxText) && (Number(r0?.d20?.total) === 17) && (chip()?.name === 'Portent — 3') && /Portent — the d20 is the 17/.test(lineB),
            `box="${boxText.slice(0, 120)}" d20=${r0?.d20?.total} formula=${r0?.formula} chip=${chip()?.name ?? null} line="${lineB}"`);
          // c. an ally's demanded save the stored 18 turns: the popup to the diviner; Answer → SAVED
          await setFaces([18, 2]);
          let flameId = attacker.items.find(i => (i.name === 'Sacred Flame') && (i.type === 'spell'))?.id;
          if (!flameId) {
            const src = await findPHB('Sacred Flame', 'spell');
            const data = src?.toObject();
            if (data) { data.system.prepared = 1; data.system.method = 'atwill'; const [it] = await attacker.createEmbeddedDocuments('Item', [data]); flameId = it.id; lentBy.set(attacker, [...(lentBy.get(attacker) ?? []), it.id]); }
          }
          const flameAct = attacker.items.get(flameId)?.system?.activities?.find(a => a.type === 'save');
          if (!flameAct) log.push('§41c skipped: no Sacred Flame save activity');
          else {
            // ⚠ §28 on leave saveRolls at 'auto' (restored at teardown): the demanded save would roll ITSELF, unpinned.
            await set('saveRolls', 'prompt');
            await healFull();
            attackerToken.control({ releaseOthers: true });
            halflingToken.setTarget(true, { releaseOthers: true });
            const tFlame = Date.now();
            const use = await flameAct.use({ consume: { spellSlot: false } }, { configure: false }, {});
            const card = use?.message ?? null;
            await until(() => card?.getFlag(MOD, 'saves'), { timeout: 6000, label: 'the Sacred Flame demand stamped' });
            const dc = Number(card?.getFlag(MOD, 'saves')?.dc);
            faces([[10, 20]]);
            const probeSave = await halfling.rollSavingThrow({ ability: 'dex' }, { configure: false }, { create: false });
            const smod = Number(probeSave?.[0]?.total) - 10;
            // The demand rolls its damage after it stamps, from the same dice: it lands before they are rigged for the save.
            // Soft: the assertions read the save alone, and a demand that rolls nothing leaves nothing to wait for.
            await until(() => game.messages.contents.find(m => (m.type === 'damage') && ((m.system?.origin === card?.id) || (m._source?.system?.origin === card?.id))), { timeout: 6000 }).catch(() => null);
            faces([[1, 20]]);   // a natural 1 fails; 18 + mod passes the DC
            const rolls2 = await halfling.rollSavingThrow({ ability: 'dex' }, { configure: false }, {});
            unrig();
            const rollMsg = rolls2?.[0]?.parent ?? null;
            const pop = await until(() => rollPopup(/Portent/), { timeout: 8000, label: 'the diviner\'s Portent popup on the save' });
            const rowsText = textOf(pop?.element);
            ok('41c. an ally\'s failed save a stored 18 turns: the diviner\'s popup "Use the 18 … SUCCESS", the 2 not offered',
              !!pop && /Use the 18/.test(rowsText) && /SUCCESS/.test(rowsText) && !/Use the 2\b/.test(rowsText) && (18 + smod >= dc),
              `pop=${!!pop} dc=${dc} mod=${smod} text="${rowsText.slice(0, 220)}" rolled=${JSON.stringify(rolls2?.[0]?.d20?.results?.map(r => r.result))} saves=${JSON.stringify(game.messages.contents.filter(m => (m.timestamp >= tFlame) && m.rolls?.length).map(m => [m.speaker?.alias, m.flavor?.slice(0, 40), m.rolls[0]?.total, m.id === rollMsg?.id]))}`);
            pickApply(pop);
            const entry = await until(() => card?.getFlag(MOD, 'saves')?.targets?.find(x => (x.uuid === halfling.uuid) && x.done) ?? null, { timeout: 10000, label: 'the Halfling\'s save folded after the answer' });
            ok('41d. Answer: SAVED, the chip "Portent — 2"', !!entry && /save|success/i.test(String(entry?.outcome ?? entry?.verdict ?? '')) && (chip()?.name === 'Portent — 2'),
              `entry=${JSON.stringify(entry && { outcome: entry.outcome, verdict: entry.verdict, total: entry.total })} chip=${chip()?.name ?? null} roll=${JSON.stringify(rollMsg?.getFlag(MOD, 'bystanderRoll')?.bent ?? null)}`);
            clearTargets();
          }
          // e. an enemy's critical hit on the Halfling: the diviner asked, "replace the 20 with the 2" — a MISS, the chip gone
          const msg = await swing({ d20: [20] });
          const bpop = await until(() => popups().find(app => app.element?.querySelector?.('[data-bf-ticks="bf-bystander"]') && /Portent/.test(textOf(app.element))) ?? null, { timeout: 8000, label: 'the diviner\'s Portent popup on the critical hit' });
          ok('41e. a critical hit on an ally: the diviner\'s popup "Use the 2 … a MISS"', !!bpop && /Use the 2\b/.test(textOf(bpop?.element)) && /a MISS/.test(textOf(bpop?.element)),
            `pop=${!!bpop} guards=${JSON.stringify(holdOf(msg)?.targets?.[0]?.guards?.map(g => [g.name, g.row, g.faces, g.quiet ?? false]) ?? null)}`);
          pickApply(bpop);
          const t = await resolvedTarget(msg);
          // The window: the turned miss lands no damage. The face is struck off before the hold resolves.
          const struck = await watch(() => hp() !== 400, { ms: 600 });
          await until(() => /Portent \(BTB Test Sorcerer\) — 20 → 2/.test(cardText(msg?.id)), { timeout: 5000, label: 'the bent line on the attack card' });
          ok('41f. Answer: a MISS, the card "Portent (BTB Test Sorcerer) — 20 → 2 …", no damage, the chip gone',
            !struck && (t?.verdict === 'miss') && (t?.bent?.how === 'set') && /Portent \(BTB Test Sorcerer\) — 20 → 2/.test(cardText(msg?.id)) && (hp() === 400) && !chip(),
            `verdict=${t?.verdict} bent=${JSON.stringify(t?.bent)} hp=${hp()} chip=${chip()?.name ?? null} card=${cardText(msg?.id).slice(0, 200)}`);
          // g. an ordinary hit a face turns: the diviner's popup (RULINGS *The asks widened*), the way out; Answer: a MISS, the banner
          { const old = chip(); if (old) await old.delete(); }   // the rest writes a new chip; wait for THAT one, not the spent one
          await sorcerer.longRest({ dialog: false, chat: false, newDay: false });
          // A rest with no card rolls the dice itself, in the open: the chip follows.
          await until(() => chip(), { timeout: 6000, label: 'the new Portent chip after the chatless rest' });
          await setFaces([2]);
          const msg2 = await swing({ d20: [12] });
          const gpop = await until(() => popups().find(app => app.element?.querySelector?.('[data-bf-ticks="bf-bystander"]') && /Portent/.test(textOf(app.element))) ?? null, { timeout: 8000, label: 'the diviner\'s Portent popup on the ordinary hit' });
          const gtext = textOf(gpop?.element);
          ok('41g. an ordinary hit a stored 2 turns: the diviner\'s popup "Use the 2 … a MISS"; out of combat the one way out, "Not until the next combat"',
            !!gpop && /Use the 2\b/.test(gtext) && /a MISS/.test(gtext) && !!gpop?.element?.querySelector('input[value="mute-combat"]') && !gpop?.element?.querySelector('input[value="mute-turn"]'),
            `pop=${!!gpop} guards=${JSON.stringify(holdOf(msg2)?.targets?.[0]?.guards?.map(g => [g.name, g.row, g.faces]) ?? null)} text="${gtext.slice(0, 200)}"`);
          pickApply(gpop);
          const t2 = await resolvedTarget(msg2);
          // The crit's banner (41f) may still be fading: the newest attack banner is this hit's.
          const banner = await until(() => [...document.querySelectorAll('.bf-bend-banner')].filter(b => /the d20 12 becomes/.test(b.textContent ?? '')).pop() ?? null, { timeout: 6000, label: 'the bend banner for the hit' });
          const btext = textOf(banner);
          ok('41h. Answer: a MISS, no damage, the chip gone; every screen\'s banner "BTB Test Sorcerer\'s Portent bends reality!", the d20 12 becomes the 2, MISS',
            (t2?.verdict === 'miss') && (t2?.bent?.how === 'set') && (hp() === 400) && !chip()
              && /BTB Test Sorcerer's Portent bends reality!/.test(btext) && /the d20 12 becomes the 2/.test(btext) && /MISS/.test(btext),
            `verdict=${t2?.verdict} hp=${hp()} chip=${chip()?.name ?? null} banner="${btext.slice(0, 220)}"`);
          // i. the damage rolled by hand after the turned miss: nothing lands, and the card says who turned it
          faces([[4, 6], [4, 6]]);
          const late = await act().rollDamage({}, { configure: false }, { data: { flags: { [MOD]: { attackFor: msg2.id } } } });
          unrig();
          const lateMsg = late?.[0]?.parent ?? null;
          const notApplied = await until(() => game.messages.get(lateMsg?.id)?.getFlag(MOD, 'notApplied') ?? null, { timeout: 8000, label: 'the late damage card marked not applied' });
          // The window: the dice rolled after the miss write no receipt and land nothing.
          const landed = await watch(() => game.messages.get(lateMsg?.id)?.getFlag(MOD, 'receipt') || (hp() !== 400), { ms: 600 });
          await until(() => /Not applied — Portent \(BTB Test Sorcerer\)/.test(cardText(lateMsg?.id)), { timeout: 5000, label: 'the not-applied line on the late damage card' });
          ok('41i. the damage rolled after the miss: no receipt, the card "Not applied — Portent (BTB Test Sorcerer) turned the hit on BTB Test Halfling into a miss", the Halfling untouched',
            !landed && !!notApplied && /Portent \(BTB Test Sorcerer\) turned the hit on BTB Test Halfling into a miss/.test(notApplied?.why ?? '') && !game.messages.get(lateMsg?.id)?.getFlag(MOD, 'receipt')
              && /Not applied — Portent \(BTB Test Sorcerer\)/.test(cardText(lateMsg?.id)) && (hp() === 400),
            `flag=${JSON.stringify(notApplied)} receipt=${!!game.messages.get(lateMsg?.id)?.getFlag(MOD, 'receipt')} hp=${hp()} card="${cardText(lateMsg?.id).slice(0, 200)}"`);
          // j. a friend's miss a stored 20 turns (the user, 2026-11-02): a Critical Hit, its damage rolled critical
          if (!pcWeapon) log.push('§41j skipped: no PC Attacker weapon');
          else {
            hgKeep(victim, { 'system.attributes.hp.value': victim.system._source.attributes.hp.value, 'system.attributes.hp.max': victim.system._source.attributes.hp.max });
            await victim.update({ 'system.attributes.hp.max': 400 });
            await sorcerer.createEmbeddedDocuments('ActiveEffect', [{ name: 'Portent — 20', img: 'icons/svg/d20.svg', transfer: false,
              flags: { [MOD]: { storedDice: { key: 'Portent', faces: [20], turn: null } } } }]);
            const msg3 = await swingAt(pcAttacker, pcToken, pcWeapon, { d20: [3] });
            const jpop = await until(() => popupTitled(/Portent/), { timeout: 8000, label: 'the diviner\'s Portent popup on the friend\'s miss' });
            const jtext = textOf(jpop?.element);
            ok('41j. a friend\'s miss a stored 20 turns: the diviner\'s popup "Use the 20"', !!jpop && /Use the 20\b/.test(jtext),
              `pop=${!!jpop} hold=${JSON.stringify(holdOf(msg3)?.targets?.[0]?.guards?.map(g => [g.name, g.row, g.faces]) ?? null)} text="${jtext.slice(0, 200)}"`);
            pickApply(jpop);
            const t3 = await missTarget(msg3);
            const dmg3 = await until(() => damageFor(msg3?.id), { timeout: 8000, label: 'the damage rolled after the turned miss' });
            ok('41k. Answer: a HIT that is a Critical Hit, and the damage the hold rolls is critical',
              (t3?.verdict === 'hit') && (t3?.bent?.isCritical === true) && (dmg3?.rolls?.[0]?.isCritical === true),
              `verdict=${t3?.verdict} bent=${JSON.stringify(t3?.bent)} dmgCrit=${dmg3?.rolls?.[0]?.isCritical} formula=${dmg3?.rolls?.[0]?.formula}`);
          }
        }
      } finally {
        await closeA1();
        const chips = sorcerer.effects.filter(e => e.getFlag(MOD, 'storedDice')).map(e => e.id);
        if (chips.length) await sorcerer.deleteEmbeddedDocuments('ActiveEffect', chips).catch(() => {});
        if (portent) await unlend(sorcerer, portent);
        unrig();
        clearTargets();
      }
    });

    // ---- 126. Portent widened (2026-10-14): a check or a save whose roll CARRIES a DC asks the diviner; a bare check asks nobody
    if (want(126)) await section(126, async () => {
      await closeA1(); await spendLuck();
      const portent = await hgLend(sorcerer, 'Portent', 'feat');
      const chip = () => sorcerer.effects.find(e => e.getFlag(MOD, 'storedDice')?.key === 'Portent') ?? null;
      const setFaces = async f => {
        const c = chip();
        if (c) await c.update({ name: `Portent — ${f.join(' · ')}`, [`flags.${MOD}.storedDice`]: { key: 'Portent', faces: f, turn: null } });
        else await sorcerer.createEmbeddedDocuments('ActiveEffect', [{ name: `Portent — ${f.join(' · ')}`, img: 'icons/svg/d20.svg', transfer: false, flags: { [MOD]: { storedDice: { key: 'Portent', faces: f, turn: null } } } }]);
      };
      const resolvedFlag = msg => until(() => { const f = game.messages.get(msg?.id)?.getFlag(MOD, 'bystanderRoll'); return (f?.status === 'resolved') ? f : null; }, { timeout: 8000, label: 'the roll\'s bystander record resolved' });
      try {
        if (!portent) log.push('§126 skipped: no Portent in the PHB');
        else {
          await setFaces([18, 2]);
          // a. the Halfling's Dexterity check with DC 15 on the roll (an enricher's or a request's `target`), a natural 1: the popup, the 18 only
          faces([[10, 20]]);
          const probe = await halfling.rollAbilityCheck({ ability: 'dex' }, { configure: false }, { create: false });
          const cmod = Number(probe?.[0]?.total) - 10;
          faces([[1, 20]]);
          const rollsA = await halfling.rollAbilityCheck({ ability: 'dex', target: 15 }, { configure: false }, {});
          unrig();
          const msgA = rollsA?.[0]?.parent ?? null;
          const popA = await until(() => rollPopup(/Portent/), { timeout: 8000, label: 'the diviner\'s Portent popup on the check' });
          const textA = textOf(popA?.element);
          ok('126a. a check whose roll carries DC 15, a natural 1: the diviner\'s popup "Use the 18 … SUCCESS", the 2 not offered',
            !!popA && /Use the 18/.test(textA) && /SUCCESS/.test(textA) && !/Use the 2\b/.test(textA) && (Number(rollsA?.[0]?.options?.target) === 15),
            `pop=${!!popA} target=${rollsA?.[0]?.options?.target} mod=${cmod} text="${textA.slice(0, 200)}"`);
          pickApply(popA);
          const flagA = await resolvedFlag(msgA);
          // The face is struck off before the answer folds; the card's line redraws after it.
          await until(() => /vs DC 15 — SUCCESS/.test(cardText(msgA?.id)), { timeout: 5000, label: 'the bent line on the check\'s card' });
          ok('126b. Answer: the check\'s card "Portent (BTB Test Sorcerer) … → 18 + mod vs DC 15 — SUCCESS", the chip "Portent — 2"',
            (flagA?.bent?.how === 'set') && (flagA?.bent?.stood === 18) && /vs DC 15 — SUCCESS/.test(cardText(msgA?.id)) && (chip()?.name === 'Portent — 2'),
            `flag=${JSON.stringify(flagA && { answer: flagA.answer, bent: flagA.bent })} chip=${chip()?.name ?? null} card="${cardText(msgA?.id).slice(0, 220)}"`);
          // c. a bare check (no DC on the roll), a natural 1: nobody asked
          await setFaces([18, 2]);
          faces([[1, 20]]);
          const rollsC = await halfling.rollAbilityCheck({ ability: 'dex' }, { configure: false }, {});
          unrig();
          // The window: a bare check asks nobody.
          const strayC = await watch(() => rollPopup(/Portent/), { ms: 1500 });
          const askedC = !!strayC || !!rollPopup(/Portent/);
          const flagC = game.messages.get(rollsC?.[0]?.parent?.id)?.getFlag(MOD, 'bystanderRoll') ?? null;
          ok('126c. a bare check with no DC on the roll: no Portent popup, no Portent guard (a check asks only with a DC)',
            !askedC && !flagC?.guards?.some(g => g.row === 'Portent'), `asked=${askedC} flag=${JSON.stringify(flagC)}`);
          // d. a save that is not a demand's answer but carries DC 15 (a request's), a natural 1: the popup; Answer: SUCCESS on its card
          faces([[1, 20]]);
          const rollsD = await halfling.rollSavingThrow({ ability: 'wis', target: 15 }, { configure: false }, {});
          unrig();
          const msgD = rollsD?.[0]?.parent ?? null;
          const popD = await until(() => rollPopup(/Portent/), { timeout: 8000, label: 'the diviner\'s Portent popup on the requested save' });
          ok('126d. a requested save with DC 15 on the roll, a natural 1: the diviner\'s popup "Use the 18 … SUCCESS"',
            !!popD && /Use the 18/.test(textOf(popD?.element)) && /SUCCESS/.test(textOf(popD?.element)), `pop=${!!popD} target=${rollsD?.[0]?.options?.target} text="${textOf(popD?.element).slice(0, 160)}"`);
          pickApply(popD);
          const flagD = await resolvedFlag(msgD);
          await until(() => /vs DC 15 — SUCCESS/.test(cardText(msgD?.id)), { timeout: 5000, label: 'the bent line on the save\'s card' });
          ok('126e. Answer: "… vs DC 15 — SUCCESS" on the save\'s own card, the 18 spent — the chip "Portent — 2"',
            (flagD?.bent?.stood === 18) && /vs DC 15 — SUCCESS/.test(cardText(msgD?.id)) && (chip()?.name === 'Portent — 2'),
            `flag=${JSON.stringify(flagD?.bent ?? null)} chip=${chip()?.name ?? null} card="${cardText(msgD?.id).slice(0, 220)}"`);
        }
      } finally {
        const chips = sorcerer.effects.filter(e => e.getFlag(MOD, 'storedDice')).map(e => e.id);
        if (chips.length) await sorcerer.deleteEmbeddedDocuments('ActiveEffect', chips).catch(() => {});
        if (portent) await unlend(sorcerer, portent);
        unrig();
        clearTargets();
      }
    });

    // ---- 82. Greater Portent: three dice at the rest
    if (want(82)) await section(82, async () => {
      await closeA1();
      hgKeep(sorcerer, { 'system.spells': foundry.utils.deepClone(sorcerer.system._source.spells), 'system.attributes.hp.value': sorcerer.system._source.attributes.hp.value });
      const portent = await hgLend(sorcerer, 'Portent', 'feat');
      const greater = await hgLend(sorcerer, 'Greater Portent', 'feat');
      const chip = () => sorcerer.effects.find(e => e.getFlag(MOD, 'storedDice')?.key === 'Portent') ?? null;
      try {
        if (!portent || !greater) log.push(`§82 skipped: portent=${!!portent} greater=${!!greater}`);
        else {
          faces([[17, 20], [3, 20], [9, 20]]);
          await sorcerer.longRest({ dialog: false, chat: true, newDay: false });
          await rollStoredAsk();
          await until(chip, { timeout: 8000, label: 'the Portent chip written at the rest' });
          unrig();
          ok('82a. the Long Rest with Greater Portent keeps three faces: "Portent — 17 · 3 · 9"', chip()?.name === 'Portent — 17 · 3 · 9', `chip=${chip()?.name ?? null} faces=${JSON.stringify(chip()?.getFlag(MOD, 'storedDice')?.faces ?? null)}`);
        }
      } finally {
        await closeA1();
        const chips = sorcerer.effects.filter(e => e.getFlag(MOD, 'storedDice')).map(e => e.id);
        if (chips.length) await sorcerer.deleteEmbeddedDocuments('ActiveEffect', chips).catch(() => {});
        for (const it of [greater, portent]) if (it) await unlend(sorcerer, it);
        unrig(); clearTargets();
      }
    });

    // ---- 83. Spell Resistance: the save gate against a spell
    if (want(83)) await section(83, async () => {
      await closeA1(); await set('saveRolls', 'prompt');
      const sr = await hgLend(sorcerer, 'Spell Resistance', 'feat');
      const sTok = sorcTokC();
      let flameLent = null;
      try {
        if (!sr || !sTok) log.push(`§83 skipped: resistance=${!!sr} token=${!!sTok}`);
        else {
          let flameId = attacker.items.find(i => (i.name === 'Sacred Flame') && (i.type === 'spell'))?.id;
          if (!flameId) { flameLent = await hgLend(attacker, 'Sacred Flame', 'spell', { 'system.prepared': 1, 'system.method': 'atwill' }); flameId = flameLent?.id; }
          const flameAct = attacker.items.get(flameId)?.system?.activities?.find(a => a.type === 'save');
          attackerToken.control({ releaseOthers: true });
          sTok.setTarget(true, { releaseOthers: true });
          const use = await flameAct.use({ consume: { spellSlot: false } }, { configure: false }, {});
          const card = use?.message ?? null;
          await until(() => card?.getFlag(MOD, 'saves'), { timeout: 6000, label: 'the Sacred Flame demand stamped' });
          const p = sorcerer.rollSavingThrow({ ability: 'dex' }, {}, {});
          let settled = false;
          Promise.resolve(p).catch(() => {}).finally(() => { settled = true; });
          const dlg = await until(rollDialog, { timeout: 6000, label: 'the Sorcerer\'s save dialog' });
          await gateDrawn(dlg);
          const text = textOf(dlg?.element?.querySelector('[data-bf-reminder]'));
          const net = dlg?.options?.bfSaveGate?.net ?? null;
          ok('83a. the sorcerer\'s save against the Attacker\'s Sacred Flame: the gate lists "Spell Resistance", net Advantage', !!dlg && /Spell Resistance/.test(text) && (net === 'advantage'),
            `dlg=${!!dlg} net=${net} text="${text.slice(0, 200)}"`);
          try { await dlg?.close(); } catch { /* gone */ }
          // ⚠ A closed roll dialog under a PROMPT demand never settles the roll promise: the wait is bounded and soft, the promise never awaited bare.
          await until(() => settled, { timeout: 3000 }).catch(() => null);
          await hgClose(/Saving Throw/);
          clearTargets();
        }
      } finally {
        await closeA1();
        if (flameLent) await unlend(attacker, flameLent);
        if (sr) await unlend(sorcerer, sr);
        unrig(); clearTargets();
      }
    });
    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  }
} });

await finish({ tag: 'class-wizard', out, plan, f });
