// Classes smoke suite — the DMG's worn items: the PHB classes plan's rows (audits/plans/session-0-classes.md) for
// the DMG's worn items, on the classes' fixtures (audits/plans/dmg-build.md), each section keeping its number and title. The fixtures, the lends, the
// helpers and the teardown are the classes kit's (tools/class-kit.mjs); everything written is restored.
import { announcePlan, connectSuite, finish, sectionPlan } from './harness.mjs';
import { runClassSuite } from './class-kit.mjs';

// The coverage map (tools/coverage-map.mjs) parses this; ⚠ never import a suite (it connects on evaluation).
export const COVERS = [
  'reminders.js',           // the worn items in the gate (§106, §107, §109, §110, §112)
  'clock-riders.js',        // the DMG weapons' riders on a 20 (§115–§122)
  'heal-on-hit.js',         // Sword of Life Stealing's temp HP (§117)
  'saves/consequences.js',  // Sword of Wounding's repeat save (§123)
  'd20-folds.js'            // Luck Blade's reroll (§124)
];

const SECTIONS = {
  106: "Mantle of Spell Resistance (the DMG, worn by the Sorcerer): its save against a spell lists it, net Advantage; taken off, nothing; the Blessing of Magic Resistance as a feat",
  107: "Spellguard Shield (the DMG, the Sorcerer): Fire Bolt at it reads Disadvantage; a weapon attack nothing",
  108: "Ring of Evasion (the DMG, the Halfling): a failed Dexterity save offers it — succeed instead, a charge; a Wisdom save not",
  109: "Scarab of Protection (the DMG, the Halfling): Advantage against Sacred Flame; Preservation offered on a failed save from the sheet",
  110: "Cloak of Displacement (the DMG, the Sorcerer): attacks against it at Disadvantage; the pack's suppressor on, or Grappled, nothing",
  111: "Gloves of Missile Snaring (the DMG, the Halfling): a Shortbow hit is held for the gloves' 1d10 + Dex; a melee hit not",
  112: "Arrow-Catching Shield (the DMG, the Halfling): a ranged attack at it reads -2; a melee attack nothing",
  113: "Serpent Venom (the DMG, the PC Attacker): Use Poison writes the coating chip, the dose spent, no save card; a MISS keeps it; a HIT spends it - the vial's DC 11 Constitution save at the Victim, the last vial left empty",
  114: "Periapt of Wound Closure (the DMG, the Halfling): a Death Saving Throw of 4 counts as 10 - a success, the card line; unattuned, the 4 stands - a failure",
  115: "Vorpal Sword (the DMG, a Longsword enchanted on the PC Attacker): a 20 says the head line and ignores the Victim's Slashing resistance; a 15 says nothing",
  116: "Sword of Sharpness: a 20 gives the Victim 1 Exhaustion level; a 15 nothing",
  117: "Sword of Life Stealing: a 20 on a Humanoid gives the wielder 15 Temporary Hit Points; on an Undead nothing",
  118: "Nine Lives Stealer: a 20 on a creature under 100 HP demands the weapon's Life Stealing save - failed, it is slain and a charge spent; at 150 HP nothing",
  119: "Hammer of Thunderbolts with Giant's Bane: a 20 on a Giant demands the Giants' Bane save; the paired enchantment removed, nothing",
  120: "Mace of Smiting: a 20 adds 7 Bludgeoning; on a Construct 14, and a Construct left at 25 HP or fewer is destroyed",
  121: "Silvered Weapon: a Critical Hit on a shapechanger adds one weapon die (critical.bonusDice); on a Humanoid nothing",
  122: "Adamantine Weapon: a hit on a vehicle is a Critical Hit, the crit names Adamantine",
  123: "Sword of Wounding: a hit demands its save - failed, Wounded and Cannot Heal lands, a heal does nothing, and its turn end repeats the save",
  124: "Luck Blade: a failed save offers Luck Blade's reroll; pressed, the second roll stands and the Luck use is spent",
  125: "Moonblade with the Critical Range rune: a 19 is a Critical Hit (the pack's own threshold)"
};
const DEPENDS = {};

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'class-items', watchdogMs: 900_000 });
announcePlan('class-items', plan, pulled);

const out = await runClassSuite(f, { plan, sections: SECTIONS, body: async ({ sections, titles }) => {
  const { until, watch, tokenOn, faces, unrig } = window.__btb;
  const { results, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const KIT = window.__btbClasses;
  const { MOD, a2Combat, act, alwaysLine, attackOf, attacker, attackerToken, cardEl, clearDown, clearTargets, closeA1, closeDialogs, closeOffers, damageFor, dmgCard, dmgEnchant, dmgHit, dmgKeys, dmgLend, dmgSaveGate, dropEffects, dropReactionChips, findPHB, gateFor, halfling, halflingToken, healFull, hgClose, hgLend, holdOf, hp, lentBy, log, markOn, offerApp, outcomeOfCard, pcAttacker, pcToken, pcWeapon, popups, riderChits, scene, set, sorcTokC, sorcerer, spendLuck, spendLuckC, swing, unlend, victim, victimAs, victimPrior, victimToken } = KIT;
  try {
    await KIT.leaveA3();
    KIT.markA2();

    // ---- 106. the save bends against spells on a WORN item: Mantle of Spell Resistance (and the Blessing as a feat)
    if (want(106)) await section(106, async () => {
      await closeA1(); await set('saveRolls', 'prompt');
      const sTok = sorcTokC();
      const mantle = await dmgLend(sorcerer, 'dmgMantleOfSpell');
      let blessing = null;
      try {
        if (!mantle || !sTok) log.push(`§106 skipped: mantle=${!!mantle} token=${!!sTok}`);
        else {
          const g1 = await dmgSaveGate(sorcerer, sTok);
          ok('106a. the sorcerer wearing (and attuned to) the Mantle of Spell Resistance: its save against Sacred Flame lists it, net Advantage',
            g1.open && /Mantle of Spell Resistance/.test(g1.text) && (g1.net === 'advantage'), `net=${g1.net} text="${g1.text.slice(0, 200)}"`);
          await mantle.update({ 'system.equipped': false });
          const g2 = await dmgSaveGate(sorcerer, sTok);
          ok('106b. the Mantle taken off: nothing listed', g2.open && !/Mantle of Spell Resistance/.test(g2.text), `net=${g2.net} text="${g2.text.slice(0, 160)}"`);
          blessing = await dmgLend(sorcerer, 'dmgBlessingOfMag');
          const g3 = await dmgSaveGate(sorcerer, sTok);
          ok('106c. the Blessing of Magic Resistance (a supernatural gift — a feat on the sheet): listed, net Advantage',
            g3.open && /Blessing of Magic Resistance/.test(g3.text) && (g3.net === 'advantage'), `net=${g3.net} text="${g3.text.slice(0, 200)}"`);
        }
      } finally {
        await closeA1();
        for (const it of [blessing, mantle]) if (it) await unlend(sorcerer, it);
        unrig(); clearTargets();
      }
    });

    // ---- 107. Spellguard Shield: spell attack rolls against the bearer at Disadvantage
    if (want(107)) await section(107, async () => {
      await closeA1();
      const sTok = sorcTokC();
      const shield = await dmgLend(sorcerer, 'dmgSpellguardShi');
      const bolt = await hgLend(pcAttacker, 'Fire Bolt', 'spell', { 'system.prepared': 1, 'system.method': 'atwill' });
      try {
        const boltAct = bolt?.system?.activities?.find(a => a.type === 'attack') ?? null;
        if (!shield || !boltAct || !sTok) log.push(`§107 skipped: shield=${!!shield} bolt=${!!boltAct} token=${!!sTok}`);
        else {
          const gate = await gateFor(pcToken, boltAct, sTok);
          ok('107a. Fire Bolt at the sorcerer holding the Spellguard Shield: the gate lists it, net Disadvantage', gate.open && /Spellguard Shield/.test(gate.text) && (gate.net === 'disadvantage'),
            `net=${gate.net} text="${gate.text.slice(0, 200)}"`);
          const wAct = pcWeapon ? attackOf(pcAttacker, pcWeapon) : null;
          const gate2 = wAct ? await gateFor(pcToken, wAct, sTok) : { open: false, text: '' };
          ok('107b. a weapon attack at it: the shield lists nothing', gate2.open && !/Spellguard Shield/.test(gate2.text), `net=${gate2.net} text="${gate2.text.slice(0, 160)}"`);
        }
      } finally {
        await closeA1();
        if (bolt) await unlend(pcAttacker, bolt);
        if (shield) await unlend(sorcerer, shield);
        unrig(); clearTargets();
      }
    });

    // ---- 108. Ring of Evasion: a failed Dexterity save made a success for a charge
    if (want(108)) await section(108, async () => {
      await closeA1(); await spendLuckC();
      const ring = await dmgLend(halfling, 'dmgRingOfEvasion', { 'system.uses.spent': 0 });
      const passAll = () => [...document.querySelectorAll('.application')].filter(el => (el.tagName === 'DIALOG') && (!!el.querySelector('button[data-action="pass"]') || !!el.querySelector('input[value="pass"]'))).forEach(el => { const r = el.querySelector('input[value="pass"]'); if (r) { r.checked = true; el.querySelector('button[data-action="answer"]')?.click(); } else el.querySelector('button[data-action="pass"]')?.click(); });
      try {
        if (!ring) log.push('§108 skipped: no Ring of Evasion');
        else {
          const prior = new Set([...document.querySelectorAll('.application')].map(el => el.id));
          faces([[3, 20]]);
          const rolls = await halfling.rollSavingThrow({ ability: 'dex' }, { configure: false }, {});
          unrig();
          const m = rolls?.[0]?.parent ?? null;
          const flag = await until(() => m?.getFlag(MOD, 'd20fold') ?? null, { timeout: 5000, label: 'the d20 fold on the failed Dexterity save' });
          const offer = (flag?.offers ?? []).find(o => o.label === 'Ring of Evasion') ?? null;
          ok('108a. a failed Dexterity save offers "Ring of Evasion — succeed instead" (a charge)', !!offer && (offer.kind === 'succeed'),
            `offers=${JSON.stringify((flag?.offers ?? []).map(o => [o.kind, o.label, o.cost]))}`);
          const win = await until(() => [...document.querySelectorAll('.application')].find(el => (el.tagName === 'DIALOG') && !prior.has(el.id) && !!el.querySelector('[data-bf-rescue-action="succeed"]')) ?? null, { timeout: 8000, label: 'the rescue window with the succeed row' });
          win?.querySelector('[data-bf-rescue-action="succeed"]')?.click();
          // The ring's charge is spent before the spend is recorded.
          const done = await until(() => { const cur = m?.getFlag(MOD, 'd20fold'); return (cur?.spends?.length && !cur.spends.some(sp => sp.pendingVerdict)) ? cur : null; }, { timeout: 15000, label: 'the Ring of Evasion spend settled' });
          ok('108b. pressed: the save succeeds instead, a charge spent', (done?.spends?.[0]?.verdict === 'saved') && (Number(halfling.items.get(ring.id)?.system?.uses?.spent) === 1),
            `spends=${JSON.stringify(done?.spends ?? null)} spent=${halfling.items.get(ring.id)?.system?.uses?.spent}`);
          passAll(); await closeA1();
          faces([[3, 20]]);
          const r2 = await halfling.rollSavingThrow({ ability: 'wis' }, { configure: false }, {});
          unrig();
          const ringOffered = () => (r2?.[0]?.parent?.getFlag(MOD, 'd20fold')?.offers ?? []).some(o => o.label === 'Ring of Evasion');
          const stray = await watch(ringOffered, { ms: 1200 });   // a window: the ring is never offered on a Wisdom save
          const f2 = r2?.[0]?.parent?.getFlag(MOD, 'd20fold');
          ok('108c. a failed WISDOM save: the ring is not offered', !stray && !(f2?.offers ?? []).some(o => o.label === 'Ring of Evasion'), `stray=${!!stray} offers=${JSON.stringify((f2?.offers ?? []).map(o => o.label))}`);
        }
      } finally {
        passAll(); await closeA1();
        if (ring) await unlend(halfling, ring);
        unrig(); clearTargets();
      }
    });

    // ---- 109. Scarab of Protection: Advantage against spells; Preservation offered on a failed save from the sheet
    if (want(109)) await section(109, async () => {
      await closeA1(); await spendLuckC(); await set('saveRolls', 'prompt');
      const scarab = await dmgLend(halfling, 'dmgScarabOfProte', { 'system.uses.spent': 0 });
      const passAll = () => [...document.querySelectorAll('.application')].filter(el => (el.tagName === 'DIALOG') && (!!el.querySelector('button[data-action="pass"]') || !!el.querySelector('input[value="pass"]'))).forEach(el => { const r = el.querySelector('input[value="pass"]'); if (r) { r.checked = true; el.querySelector('button[data-action="answer"]')?.click(); } else el.querySelector('button[data-action="pass"]')?.click(); });
      try {
        if (!scarab) log.push('§109 skipped: no Scarab of Protection');
        else {
          faces([[3, 20]]);
          const rolls = await halfling.rollSavingThrow({ ability: 'con' }, { configure: false }, {});
          unrig();
          const m = rolls?.[0]?.parent ?? null;
          const flag = await until(() => m?.getFlag(MOD, 'd20fold') ?? null, { timeout: 5000, label: 'the d20 fold on the failed save' });
          ok('109b. a failed save from the sheet (no demand to read) offers "Preservation" — the roller judges', (flag?.offers ?? []).some(o => o.label === 'Preservation'),
            `offers=${JSON.stringify((flag?.offers ?? []).map(o => [o.kind, o.label]))}`);
          const g = await dmgSaveGate(halfling, halflingToken);
          ok('109a. the Halfling\'s save against Sacred Flame lists the Scarab of Protection, net Advantage', g.open && /Scarab of Protection/.test(g.text) && (g.net === 'advantage'),
            `net=${g.net} text="${g.text.slice(0, 200)}"`);
        }
      } finally {
        passAll(); await closeA1();
        if (scarab) await unlend(halfling, scarab);
        unrig(); clearTargets();
      }
    });

    // ---- 110. Cloak of Displacement: attacks against the wearer at Disadvantage; off while suppressed or its Speed is 0
    if (want(110)) await section(110, async () => {
      await closeA1();
      const sTok = sorcTokC();
      const cloak = await dmgLend(sorcerer, 'dmgCloakOfDispla');
      let held = null;
      try {
        if (!cloak || !sTok) log.push(`§110 skipped: cloak=${!!cloak} token=${!!sTok}`);
        else {
          const g1 = await gateFor(attackerToken, act(), sTok);
          ok('110a. the Attacker at the sorcerer in the cloak: "Cloak of Displacement", net Disadvantage', g1.open && /Cloak of Displacement/.test(g1.text) && (g1.net === 'disadvantage'),
            `net=${g1.net} text="${g1.text.slice(0, 200)}"`);
          const sup = cloak.effects.find(e => e.name === 'Displacement Suppressed');
          if (sup) await sup.update({ disabled: false });
          const g2 = await gateFor(attackerToken, act(), sTok);
          ok('110b. the pack\'s "Displacement Suppressed" switched on: nothing listed', g2.open && !/Cloak of Displacement/.test(g2.text), `suppressor=${!!sup} net=${g2.net} text="${g2.text.slice(0, 160)}"`);
          if (sup) await sup.update({ disabled: true });
          held = await markOn(sorcerer, 'Grappled (test)', null, ['grappled']);
          const g3 = await gateFor(attackerToken, act(), sTok);
          ok('110c. Grappled (its Speed 0): the cloak is suppressed — nothing listed', g3.open && !/Cloak of Displacement/.test(g3.text), `net=${g3.net} text="${g3.text.slice(0, 160)}"`);
        }
      } finally {
        await closeA1();
        if (held) await held.delete().catch(() => {});
        if (cloak) await unlend(sorcerer, cloak);
        unrig(); clearTargets();
      }
    });

    // ---- 111. Gloves of Missile Snaring: a ranged hit held for the worn gloves' reduction; a melee hit not
    if (want(111)) await section(111, async () => {
      await closeDialogs(); await spendLuck(); await dropReactionChips(halfling);
      const gloves = await dmgLend(halfling, 'dmgGlovesOfMissi');
      const bow = await (async () => { const src = await findPHB('Shortbow', 'weapon'); if (!src) return null; const [it] = await attacker.createEmbeddedDocuments('Item', [src.toObject()]); lentBy.set(attacker, [...(lentBy.get(attacker) ?? []), it.id]); return attacker.items.get(it.id); })();
      try {
        const bowAct = bow?.system?.activities?.find(a => a.type === 'attack') ?? null;
        if (!gloves || !bowAct) log.push(`§111 skipped: gloves=${!!gloves} bow=${!!bowAct}`);
        else {
          await healFull();
          attackerToken.control({ releaseOthers: true });
          halflingToken.setTarget(true, { releaseOthers: true });
          faces([[15, 20], [3, 6], [3, 6]]);
          const rolls = await bowAct.rollAttack({}, { configure: false }, {});
          const msg = rolls?.[0]?.parent ?? null;
          await until(() => holdOf(msg), { timeout: 6000, label: "the Shortbow hit's hold" });
          const t = holdOf(msg)?.targets?.find(x => x.uuid === halfling.uuid);
          unrig();
          ok('111a. the Shortbow\'s hit on the Halfling wearing the gloves is held for "Gloves of Missile Snaring" — a damage reduction, 1d10 + Dex',
            (t?.reaction === 'Gloves of Missile Snaring') && (t?.kind === 'damage') && /1d10/.test(String(t?.reduce?.formula ?? '')),
            `hold=${JSON.stringify(t && { reaction: t.reaction, kind: t.kind, formula: t.reduce?.formula })}`);
          await closeDialogs(); await closeA1();
          // The bow's damage rolled before the melee swing; nothing below reads it.
          await until(() => damageFor(msg?.id), { timeout: 8000 }).catch(() => null);
          await dropReactionChips(halfling);
          const m2 = await swing({ d20: [15], dmg: 1 });
          const t2 = holdOf(m2)?.targets?.find(x => x.uuid === halfling.uuid);
          ok('111b. a MELEE hit is not held for the gloves', t2?.reaction !== 'Gloves of Missile Snaring', `reaction=${t2?.reaction ?? null}`);
        }
      } finally {
        await closeDialogs(); await closeA1();
        if (bow) await unlend(attacker, bow);
        if (gloves) await unlend(halfling, gloves);
        await dropReactionChips(halfling);
        await healFull();
        unrig(); clearTargets();
      }
    });

    // ---- 112. Arrow-Catching Shield: a ranged attack at the bearer reads −2 (its +2 AC); a melee attack nothing
    if (want(112)) await section(112, async () => {
      await closeA1();
      const shield = await dmgLend(halfling, 'dmgArrowcatching');
      const bow = await (async () => { const src = await findPHB('Shortbow', 'weapon'); if (!src) return null; const [it] = await attacker.createEmbeddedDocuments('Item', [src.toObject()]); lentBy.set(attacker, [...(lentBy.get(attacker) ?? []), it.id]); return attacker.items.get(it.id); })();
      try {
        const bowAct = bow?.system?.activities?.find(a => a.type === 'attack') ?? null;
        if (!shield || !bowAct) log.push(`§112 skipped: shield=${!!shield} bow=${!!bowAct}`);
        else {
          const g1 = await gateFor(attackerToken, bowAct, halflingToken);
          ok('112a. the Shortbow at the Halfling with the Arrow-Catching Shield: "… is Arrow-Catching Shield — −2 to this attack roll"', g1.open && /Arrow-Catching Shield — −2 to this attack roll/.test(g1.text),
            `text="${g1.text.slice(0, 220)}"`);
          const g2 = await gateFor(attackerToken, act(), halflingToken);
          ok('112b. a melee attack at it: nothing of the shield', g2.open && !/Arrow-Catching Shield/.test(g2.text), `text="${g2.text.slice(0, 160)}"`);
        }
      } finally {
        await closeA1();
        if (bow) await unlend(attacker, bow);
        if (shield) await unlend(halfling, shield);
        unrig(); clearTargets();
      }
    });

    // ---- 113. an injury poison: the vial is the coating's carrier (COATINGS `item`), its Use Poison the save at the struck
    if (want(113)) await section(113, async () => {
      await closeA1(); await spendLuckC();
      const vial = await dmgLend(pcAttacker, 'dmgSerpentVenom0', { 'system.equipped': false, 'system.attuned': false });
      const vialId = vial?.id ?? null;
      const wAct = pcWeapon ? attackOf(pcAttacker, pcWeapon) : null;
      const coat = () => pcAttacker.effects.find(e => e.getFlag(MOD, 'coat')) ?? null;
      const t113 = Date.now();
      try {
        if (!vial || !wAct) log.push(`§113 skipped: vial=${!!vial} weapon=${!!wAct}`);
        else {
          const usePoison = vial.system.activities.find(a => a.type === 'save');
          await usePoison?.use({}, { configure: false }, {});
          const chip = await until(coat, { timeout: 6000, label: 'the Serpent Venom Coating chip' });
          const useCard = await until(() => game.messages.contents.find(m => (m.timestamp >= t113) && m.getFlag(MOD, 'coatUse')) ?? null, { timeout: 6000, label: 'the Use Poison card' });
          const saveCards = () => game.messages.contents.filter(m => (m.timestamp >= t113) && m.getFlag(MOD, 'saves') && (m.getAssociatedItem?.()?.name === 'Serpent Venom'));
          ok('113a. Use Poison on the vial: the "Serpent Venom Coating" chip on the PC Attacker (60 s, the vial\'s icon), the dose spent, the use card, no save demanded',
            !!chip && (chip.name === 'Serpent Venom Coating') && (chip.img === vial.img) && (Number(chip._source.duration?.seconds) === 60)
              && (Number(pcAttacker.items.get(vialId)?.system?.uses?.spent) === 1) && !!useCard && !saveCards().length,
            `chip=${chip?.name} img=${chip?.img} duration=${JSON.stringify(chip?._source?.duration)} spent=${pcAttacker.items.get(vialId)?.system?.uses?.spent} card=${!!useCard} saves=${saveCards().length}`);
          victimPrior();
          await victim.update({ 'system.attributes.ac.override': 30, 'system.attributes.hp.value': 400 });
          pcToken.control({ releaseOthers: true }); clearTargets(); victimToken.setTarget(true, { releaseOthers: true });
          faces([[3, 20], [3, 20]]);
          const miss = await wAct.rollAttack({}, { configure: false }, {});
          unrig();
          const stray = await watch(() => !coat() || !pcAttacker.items.get(vialId), { ms: 2500 });   // a window: a miss spends nothing
          await closeOffers();
          ok('113b. a MISS at AC 30 spends nothing: the coating stands, the vial still there', !stray && !!coat() && !!pcAttacker.items.get(vialId), `stray=${!!stray} chip=${!!coat()} vial=${!!pcAttacker.items.get(vialId)} miss=${miss?.[0]?.total}`);
          await victim.update({ 'system.attributes.ac.override': 1 });
          const before = new Set(popups());
          faces([[15, 20], [15, 20]]);
          const hit = await wAct.rollAttack({}, { configure: false }, {});
          unrig();
          const hm = hit?.[0]?.parent ?? null;
          // The damage offer opens when a part is due (closing it rolls the damage); without one the damage rolls itself.
          await until(() => offerApp(before) || damageFor(hm?.id), { timeout: 4000 }).catch(() => null);
          await closeOffers();   // the offer rolls the damage
          const dmg = await until(() => damageFor(hm?.id) ?? null, { timeout: 10000, label: "the coated hit's damage" });
          const spentFlag = await until(() => (dmg?.getFlag(MOD, 'coatHit')?.status === 'spent') ? dmg.getFlag(MOD, 'coatHit') : null, { timeout: 10000, label: 'the coating spent on the damage' });
          const saveCard = await until(() => saveCards()[0] ?? null, { timeout: 10000, label: "the vial's save demanded of the Victim" });
          const gone = await until(() => !coat(), { timeout: 8000, label: 'the coating chip gone' });
          const empty = Number(pcAttacker.items.get(vialId)?.system?.uses?.spent) === 1;
          ok('113c. a HIT spends it: the chip gone, the vial\'s own DC 11 Constitution save demanded of the Victim, the last vial left on the sheet empty',
            gone && empty && !!spentFlag && (spentFlag.ability === 'con') && spentFlag.targets?.some(t => t.uuid === victim.uuid) && !!saveCard
              && (saveCard.getFlag(MOD, 'saves')?.abilities?.join() === 'con') && (Number(saveCard.getFlag(MOD, 'saves')?.dc) === 11),
            `gone=${gone} chip=${!!coat()} vial=${!!pcAttacker.items.get(vialId)} flag=${JSON.stringify(spentFlag ? { status: spentFlag.status, ability: spentFlag.ability, note: spentFlag.note ?? null } : null)} save=${!!saveCard} dc=${saveCard?.getFlag(MOD, 'saves')?.dc}`);
        }
      } finally {
        await closeA1(); await closeOffers();
        await hgClose(/Saving Throw|Serpent Venom/);
        const c = coat();
        if (c) await c.delete().catch(() => {});
        if (vialId && pcAttacker.items.get(vialId)) await unlend(pcAttacker, pcAttacker.items.get(vialId));
        await victim.update({ 'system.attributes.ac.override': 1 }).catch(() => {});
        await dropEffects(pcAttacker, riderChits(pcAttacker));
        unrig(); clearTargets();
      }
    });

    // ---- 114. Periapt of Wound Closure: a Death Saving Throw of 9 or lower counts as 10 while the pendant is worn
    if (want(114)) await section(114, async () => {
      await closeA1(); await spendLuckC();
      const periapt = await dmgLend(halfling, 'dmgPeriaptOfWoun');
      const hp0 = hp();
      const death = () => halfling.system.attributes.death ?? {};
      try {
        if (!periapt) log.push('§114 skipped: no Periapt');
        else {
          await halfling.update({ 'system.attributes.hp.value': 0, 'system.attributes.hp.temp': 0, 'system.attributes.death.success': 0, 'system.attributes.death.failure': 0 });
          faces([[4, 20]]);
          const rolls = await halfling.rollDeathSave({}, { configure: false }, {});
          unrig();
          const r0 = rolls?.[0];
          await until(() => Number(death().success) === 1, { timeout: 6000, label: 'the death save counted a success' });
          // Soft: the line reads as empty when it never draws, and the ok says so.
          const line = (await until(() => [...(cardEl(r0?.parent?.id)?.querySelectorAll?.('div') ?? [])].find(el => /counts as 10/.test(el.textContent ?? '')), { timeout: 5000 }).catch(() => null))?.textContent?.trim() ?? '';
          ok('114a. worn and attuned: the Death Saving Throw\'s 4 counts as 10 — a success, the card "Periapt of Wound Closure — the d20\'s 4 counts as 10"',
            (Number(r0?.total) >= 10) && (Number(death().success) === 1) && (Number(death().failure) === 0) && /Periapt of Wound Closure — the d20's 4 counts as 10/.test(line),
            `total=${r0?.total} minimum=${r0?.options?.minimum} death=${JSON.stringify(death())} line="${line}"`);
          await periapt.update({ 'system.attuned': false });
          await halfling.update({ 'system.attributes.death.success': 0, 'system.attributes.death.failure': 0 });
          faces([[4, 20]]);
          const rolls2 = await halfling.rollDeathSave({}, { configure: false }, {});
          unrig();
          const r1 = rolls2?.[0];
          await until(() => Number(death().failure) === 1, { timeout: 6000, label: 'the death save counted a failure' });
          ok('114b. unattuned: the 4 stands — a failure', (Number(r1?.total) < 10) && (Number(death().failure) === 1) && !r1?.options?.bfFloor?.length,
            `total=${r1?.total} minimum=${r1?.options?.minimum} death=${JSON.stringify(death())}`);
        }
      } finally {
        await closeA1();
        unrig();
        await clearDown(halfling);
        await halfling.update({ 'system.attributes.hp.value': hp0, 'system.attributes.death.success': 0, 'system.attributes.death.failure': 0 }).catch(() => {});
        if (periapt) await unlend(halfling, periapt);
      }
    });
    await KIT.dmgBand();

    // ---- 115. Vorpal Sword
    if (want(115)) await section(115, async () => {
      await closeA1(); await closeOffers();
      const w = await dmgEnchant(pcAttacker, 'dmgVorpalSword00', 'phbwepLongsword0');
      try {
        if (!w) log.push('§115 skipped');
        else {
          await victimAs('humanoid');
          await victim.update({ 'system.traits.dr.value': ['slashing'] });
          const r1 = await dmgHit(w, 15);
          ok('115a. "Vorpal Longsword", a 15: no Vorpal Sword rider', (w.name === 'Vorpal Longsword') && !dmgKeys(r1.dmg).includes('vorpal-sword'), `name=${w.name} keys=${dmgKeys(r1.dmg)}`);
          const r2 = await dmgHit(w, 20);
          // The rider's line draws on the damage card's render.
          await until(() => /Vorpal Sword/.test(alwaysLine(r2.dmg)), { timeout: 5000, label: "Vorpal Sword's line on the damage card" });
          const rolled = (r2.dmg?.rolls ?? []).reduce((n, r) => n + Number(r.total || 0), 0);
          const dealt = 400 - Number(victim.system.attributes.hp.value);
          ok('115b. a 20: the rider rides with no offer row, the card says the head line, and the Slashing resistance is ignored (dealt = rolled)',
            dmgKeys(r2.dmg).includes('vorpal-sword') && /Vorpal Sword/.test(alwaysLine(r2.dmg)) && /head/.test(alwaysLine(r2.dmg)) && (dealt === rolled) && (rolled > 0),
            `keys=${dmgKeys(r2.dmg)} line="${alwaysLine(r2.dmg).slice(0, 160)}" rolled=${rolled} dealt=${dealt}`);
        }
      } finally {
        await closeOffers();
        await victim.update({ 'system.traits.dr.value': [] }).catch(() => {});
        if (w) await unlend(pcAttacker, w);
        unrig(); clearTargets();
      }
    });

    // ---- 116. Sword of Sharpness
    if (want(116)) await section(116, async () => {
      await closeA1(); await closeOffers();
      const w = await dmgEnchant(pcAttacker, 'dmgSwordOfSharpn', 'phbwepLongsword0');
      try {
        if (!w) log.push('§116 skipped');
        else {
          await victimAs('humanoid');
          await victim.update({ 'system.attributes.exhaustion': 0 });
          const r1 = await dmgHit(w, 20);
          // The Exhaustion level lands after the damage receipt.
          const ex = await until(() => (Number(victim.system.attributes.exhaustion) === 1) ? 1 : null, { timeout: 6000, label: 'the Exhaustion level on the Victim' });
          ok('116a. a 20: the Victim gains 1 Exhaustion level', ex === 1 && dmgKeys(r1.dmg).includes('sword-of-sharpness'), `exhaustion=${victim.system.attributes.exhaustion} keys=${dmgKeys(r1.dmg)}`);
          await dmgHit(w, 15);
          // a window from the damage receipt: a 15 lands no Exhaustion
          const stray = await watch(() => Number(victim.system.attributes.exhaustion) !== 1, { ms: 1500 });
          ok('116b. a 15: no more Exhaustion', !stray && (Number(victim.system.attributes.exhaustion) === 1), `stray=${!!stray} exhaustion=${victim.system.attributes.exhaustion}`);
        }
      } finally {
        await closeOffers();
        await victim.update({ 'system.attributes.exhaustion': 0 }).catch(() => {});
        if (w) await unlend(pcAttacker, w);
        unrig(); clearTargets();
      }
    });

    // ---- 117. Sword of Life Stealing
    if (want(117)) await section(117, async () => {
      await closeA1(); await closeOffers();
      const w = await dmgEnchant(pcAttacker, 'dmgSwordOfLifeSt', 'phbwepLongsword0');
      const temp = () => Number(pcAttacker.system.attributes.hp.temp ?? 0);
      try {
        if (!w) log.push('§117 skipped');
        else {
          await victimAs('humanoid');
          await pcAttacker.update({ 'system.attributes.hp.temp': 0 });
          await dmgHit(w, 20);
          // The Temporary Hit Points land after the damage receipt.
          const got = await until(() => (temp() === 15) ? 15 : null, { timeout: 6000, label: "the wielder's 15 Temporary Hit Points" });
          ok('117a. a 20 on a Humanoid: the wielder gains 15 Temporary Hit Points', got === 15, `temp=${temp()}`);
          await pcAttacker.update({ 'system.attributes.hp.temp': 0 });
          await victimAs('undead');
          const r2 = await dmgHit(w, 20);
          // a window from the damage receipt: no Temporary Hit Points off an Undead
          const stray = await watch(() => temp() !== 0, { ms: 1500 });
          ok('117b. a 20 on an Undead: no rider, no Temporary Hit Points', !stray && !dmgKeys(r2.dmg).includes('sword-of-life-stealing') && (temp() === 0), `stray=${!!stray} keys=${dmgKeys(r2.dmg)} temp=${temp()}`);
        }
      } finally {
        await closeOffers();
        await pcAttacker.update({ 'system.attributes.hp.temp': 0 }).catch(() => {});
        if (w) await unlend(pcAttacker, w);
        unrig(); clearTargets();
      }
    });

    // ---- 118. Nine Lives Stealer
    if (want(118)) await section(118, async () => {
      await closeA1(); await closeOffers(); await set('saveRolls', 'auto');
      const w = await dmgEnchant(pcAttacker, 'dmgNineLivesStea', 'phbwepLongsword0');
      try {
        const ls = w?.system?.activities?.find?.(a => a.name === 'Life Stealing') ?? null;
        if (!w || !ls) log.push(`§118 skipped: weapon=${!!w} lifeStealing=${!!ls}`);
        else {
          await w.update({ [`system.activities.${ls.id}.uses.max`]: '3', [`system.activities.${ls.id}.uses.spent`]: 0 });
          await victimAs('humanoid');
          const t1 = Date.now();
          await dmgHit(pcAttacker.items.get(w.id), 20, { hpTo: 50, after: [[1, 20]] });
          // The save card is demanded after the damage receipt.
          const card = await until(() => { const c = dmgCard('Life Stealing', t1); return outcomeOfCard(c) ? c : null; }, { timeout: 12000, label: 'the Life Stealing save card, settled' });
          const dead = await until(() => victim.statuses?.has?.('dead') ? true : null, { timeout: 8000, label: 'the Victim slain (Dead)' });
          const spentNow = () => Number(pcAttacker.items.get(w.id)?.system?.activities?.get?.(ls.id)?.uses?.spent ?? -1);
          await until(() => (spentNow() === 1) ? true : null, { timeout: 6000, label: 'a Life Stealing charge spent' });   // the charge goes after the 0 Hit Points
          const spent = spentNow();
          ok('118a. a 20 on a Humanoid at 50 HP: the Life Stealing save demanded, failed — slain (0 HP, Dead) and a charge spent',
            (outcomeOfCard(card) === 'failed') && !!dead && (Number(victim.system.attributes.hp.value) === 0) && (spent === 1),
            `outcome=${outcomeOfCard(card)} dead=${!!dead} hp=${victim.system.attributes.hp.value} spent=${spent}`);
          await clearDown(victim);
          unrig();
          const r2 = await dmgHit(pcAttacker.items.get(w.id), 20, { hpTo: 150 });
          ok('118b. at 150 HP: no Life Stealing', !dmgKeys(r2.dmg).includes('nine-lives-stealer'), `keys=${dmgKeys(r2.dmg)}`);
        }
      } finally {
        await closeOffers(); await clearDown(victim);
        if (w) await unlend(pcAttacker, w);
        unrig(); clearTargets();
      }
    });

    // ---- 119. Hammer of Thunderbolts — Giants' Bane
    if (want(119)) await section(119, async () => {
      await closeA1(); await closeOffers(); await set('saveRolls', 'auto');
      const w = await dmgEnchant(pcAttacker, 'dmgHammerOfThund', 'phbwepWarhammer0', { profiles: ['Hammer of Thunderbolts', "Giant's Bane: Paired Attunement Bonuses"] });
      try {
        if (!w) log.push('§119 skipped');
        else {
          await victimAs('giant');
          const t1 = Date.now();
          await dmgHit(w, 20, { after: [[1, 20]] });
          // The save card is demanded after the damage receipt.
          const card = await until(() => { const c = dmgCard("Giants' Bane (On Crit)", t1); return outcomeOfCard(c) ? c : null; }, { timeout: 12000, label: "the Giants' Bane save card, settled" });
          ok("119a. a 20 on a Giant: the Giants' Bane save demanded (DC 17 Con), failed", outcomeOfCard(card) === 'failed', `outcome=${outcomeOfCard(card)}`);
          await clearDown(victim);
          unrig();
          const bane = pcAttacker.items.get(w.id)?.effects?.find(e => e.name === "Giant's Bane: Paired Attunement Bonuses");
          if (bane) await bane.delete();
          const r2 = await dmgHit(pcAttacker.items.get(w.id), 20);
          ok("119b. the paired enchantment removed: no Giants' Bane", !dmgKeys(r2.dmg).includes('hammer-of-thunderbolts'), `keys=${dmgKeys(r2.dmg)} bane=${!!bane}`);
        }
      } finally {
        await closeOffers(); await clearDown(victim);
        if (w) await unlend(pcAttacker, w);
        unrig(); clearTargets();
      }
    });

    // ---- 120. Mace of Smiting
    if (want(120)) await section(120, async () => {
      await closeA1(); await closeOffers();
      const w = await dmgLend(pcAttacker, 'dmgMaceOfSmiting');
      try {
        if (!w) log.push('§120 skipped');
        else {
          await victimAs('humanoid');
          const r1 = await dmgHit(w, 20);
          const parts = d => (d?.rolls ?? []).map(r => String(r.formula ?? '').replace(/\[[^\]]*\]/g, '').trim());   // the dice and numbers, not the parts' names
          ok('120a. a 20 on a Humanoid: a 7 Bludgeoning part rides', parts(r1.dmg).includes('7') && dmgKeys(r1.dmg).includes('mace-of-smiting'), `parts=${JSON.stringify(parts(r1.dmg))} keys=${dmgKeys(r1.dmg)}`);
          await victimAs('construct');
          const r2 = await dmgHit(w, 20, { hpTo: 30 });
          // The destroy lands after the damage receipt.
          const dead = await until(() => victim.statuses?.has?.('dead') ? true : null, { timeout: 8000, label: 'the Construct destroyed (Dead)' });
          ok('120b. a 20 on a Construct at 30 HP: 14 Bludgeoning, and left at 25 or fewer it is destroyed (0 HP, Dead)',
            parts(r2.dmg).includes('14') && !!dead && (Number(victim.system.attributes.hp.value) === 0),
            `parts=${JSON.stringify(parts(r2.dmg))} hp=${victim.system.attributes.hp.value} dead=${!!dead}`);
        }
      } finally {
        await closeOffers(); await clearDown(victim);
        if (w) await unlend(pcAttacker, w);
        unrig(); clearTargets();
      }
    });

    // ---- 121. Silvered Weapon
    if (want(121)) await section(121, async () => {
      await closeA1(); await closeOffers();
      const w = await dmgEnchant(pcAttacker, 'dmgSilveredWeapo', 'phbwepLongsword0');
      try {
        if (!w) log.push('§121 skipped');
        else {
          await victimAs('monstrosity', 'shapechanger');
          const r1 = await dmgHit(w, 20);
          const bonus = d => Number(d?.rolls?.[0]?.options?.critical?.bonusDice ?? 0);
          ok('121a. a Critical Hit on a shapechanger: one more weapon die (critical.bonusDice 1)', dmgKeys(r1.dmg).includes('silvered-weapon') && (bonus(r1.dmg) >= 1), `keys=${dmgKeys(r1.dmg)} bonusDice=${bonus(r1.dmg)}`);
          await victimAs('humanoid');
          const r2 = await dmgHit(w, 20);
          ok('121b. on a Humanoid: nothing', !dmgKeys(r2.dmg).includes('silvered-weapon'), `keys=${dmgKeys(r2.dmg)}`);
        }
      } finally {
        await closeOffers();
        if (w) await unlend(pcAttacker, w);
        unrig(); clearTargets();
      }
    });

    // ---- 122. Adamantine Weapon — a hit on an object (a vehicle actor)
    if (want(122)) await section(122, async () => {
      await closeA1(); await closeOffers();
      const w = await dmgEnchant(pcAttacker, 'dmgAdamantineWea', 'phbwepLongsword0');
      let cart = null, cartToken = null;
      try {
        if (!w) log.push('§122 skipped');
        else {
          [cart] = await Actor.createDocuments([{ name: 'BTB Test Cart', type: 'vehicle', system: { attributes: { ac: { flat: 5, calc: 'flat' }, hp: { value: 100, max: 100 } } } }]);
          const td = await cart.getTokenDocument({ x: pcToken.document.x + scene.grid.size, y: pcToken.document.y });
          [cartToken] = await scene.createEmbeddedDocuments('Token', [td.toObject()]);
          const placed = await tokenOn(cartToken.id, { label: "the cart's token on the canvas" });
          const r1 = await dmgHit(w, 15, { target: placed });
          ok('122a. a 15 on a vehicle: a Critical Hit, the crit naming Adamantine',
            (r1.dmg?.rolls?.[0]?.isCritical === true) && (r1.dmg?.getFlag(MOD, 'autoCrit')?.sources ?? []).some(x => x.status === 'adamantine'),
            `crit=${r1.dmg?.rolls?.[0]?.isCritical} auto=${JSON.stringify(r1.dmg?.getFlag(MOD, 'autoCrit') ?? null)}`);
        }
      } finally {
        await closeOffers();
        if (cartToken) await scene.deleteEmbeddedDocuments('Token', [cartToken.id]).catch(() => {});
        if (cart) await cart.delete().catch(() => {});
        if (w) await unlend(pcAttacker, w);
        unrig(); clearTargets();
      }
    });

    // ---- 123. Sword of Wounding
    if (want(123)) await section(123, async () => {
      await closeA1(); await closeOffers(); await set('saveRolls', 'auto');
      const w = await dmgEnchant(pcAttacker, 'dmgSwordOfWoundi', 'phbwepLongsword0');
      let combat = null;
      const wounded = () => victim.effects.find(e => e.name === 'Wounded and Cannot Heal') ?? null;
      try {
        if (!w) log.push('§123 skipped');
        else {
          await victimAs('humanoid');
          const t1 = Date.now();
          await dmgHit(w, 15, { hpTo: 300, after: [[1, 20]] });
          // The save card is demanded after the damage receipt; its failure lands the effect.
          const card = await until(() => { const c = dmgCard('Sword of Wounding Save', t1); return outcomeOfCard(c) ? c : null; }, { timeout: 12000, label: 'the Sword of Wounding save card, settled' });
          const fx = await until(wounded, { timeout: 8000, label: 'Wounded and Cannot Heal on the Victim' });
          unrig();
          ok('123a. a hit: the Sword of Wounding save demanded, failed — Wounded and Cannot Heal lands', (outcomeOfCard(card) === 'failed') && !!fx, `outcome=${outcomeOfCard(card)} fx=${!!fx}`);
          const hp0 = Number(victim.system.attributes.hp.value);
          await victim.applyDamage([{ value: 10, type: 'healing' }]);
          const stray = await watch(() => Number(victim.system.attributes.hp.value) !== hp0, { ms: 300 });   // a window: the heal does nothing
          ok('123b. a heal does nothing while it stands', !stray && (Number(victim.system.attributes.hp.value) === hp0), `stray=${!!stray} hp ${hp0} → ${victim.system.attributes.hp.value}`);
          const t2 = Date.now();
          combat = await a2Combat();          // the PC Attacker's turn, then the Victim's
          await combat.nextTurn();
          await until(() => combat.combatant?.actorId === victim.id, { label: "the Victim's turn" });
          await combat.nextTurn();            // the Victim's turn ENDS: its listed effect repeats
          const rep = await until(() => game.messages.contents.find(m => (m.timestamp >= t2) && (m.getFlag(MOD, 'repeatSave')?.effectUuid === wounded()?.uuid)) ?? null, { timeout: 10000, label: 'the repeat save at the Victim\'s turn end' });
          ok('123c. the Victim\'s turn end repeats the save (the enchanted weapon read as Sword of Wounding)', !!rep, `repeat=${!!rep}`);
        }
      } finally {
        await closeOffers(); await closeA1();
        if (combat && game.combats.get(combat.id)) await combat.delete().catch(() => {});
        const fx = wounded(); if (fx) await fx.delete().catch(() => {});
        if (w) await unlend(pcAttacker, w);
        unrig(); clearTargets();
      }
    });

    // ---- 124. Luck Blade — the reroll
    if (want(124)) await section(124, async () => {
      await closeA1(); await closeOffers();
      const w = await dmgEnchant(pcAttacker, 'dmgLuckBlade0000', 'phbwepLongsword0');
      const passAll = () => [...document.querySelectorAll('.application')].filter(el => (el.tagName === 'DIALOG') && (!!el.querySelector('button[data-action="pass"]') || !!el.querySelector('input[value="pass"]'))).forEach(el => { const r = el.querySelector('input[value="pass"]'); if (r) { r.checked = true; el.querySelector('button[data-action="answer"]')?.click(); } else el.querySelector('button[data-action="pass"]')?.click(); });
      try {
        const luck = w?.system?.activities?.find?.(a => a.name === 'Luck') ?? null;
        if (!w || !luck) log.push(`§124 skipped: weapon=${!!w} luck=${!!luck}`);
        else {
          await w.update({ [`system.activities.${luck.id}.uses.max`]: '1', [`system.activities.${luck.id}.uses.spent`]: 0 });
          const prior = new Set([...document.querySelectorAll('.application')].map(el => el.id));
          faces([[3, 20]]);
          const rolls = await pcAttacker.rollSavingThrow({ ability: 'wis' }, { configure: false }, {});
          const m = rolls?.[0]?.parent ?? null;
          const flag = await until(() => m?.getFlag(MOD, 'd20fold') ?? null, { timeout: 5000, label: 'the d20 fold on the failed save' });
          const re = (flag?.offers ?? []).find(o => (o.kind === 'reroll') && (o.label === 'Luck Blade')) ?? null;
          ok('124a. a failed save offers Luck Blade\'s reroll', !!re, `offers=${JSON.stringify((flag?.offers ?? []).map(o => [o.kind, o.label]))}`);
          const pop = await until(() => [...document.querySelectorAll('.application')].find(el => (el.tagName === 'DIALOG') && !prior.has(el.id) && !!el.querySelector('[data-bf-rescue-action="reroll"]')) ?? null, { timeout: 8000, label: 'the rescue window with the reroll row' });
          faces([[15, 20]]);
          pop?.querySelector('[data-bf-rescue-action="reroll"]')?.click();
          // The Luck use is spent before the spend is recorded.
          const done = await until(() => { const cur = m?.getFlag(MOD, 'd20fold'); return (cur?.spends?.length && !cur.spends.some(sp => sp.pendingVerdict)) ? cur : null; }, { timeout: 15000, label: 'the Luck Blade reroll settled' });
          unrig();
          const spent = Number(pcAttacker.items.get(w.id)?.system?.activities?.get?.(luck.id)?.uses?.spent ?? -1);
          ok('124b. pressed: the reroll stands (15) and the Luck use is spent', (done?.spends?.[0]?.kind === 'reroll') && (spent === 1),
            `spends=${JSON.stringify(done?.spends ?? null)} spent=${spent}`);
        }
      } finally {
        passAll(); await closeA1();
        if (w) await unlend(pcAttacker, w);
        unrig(); clearTargets();
      }
    });

    // ---- 125. Moonblade — the pack's Critical Range rune
    if (want(125)) await section(125, async () => {
      await closeA1(); await closeOffers();
      const w = await dmgEnchant(pcAttacker, 'dmgMoonblade0000', 'phbwepLongsword0', { profiles: ['Moonblade', 'Rune: Critical Range'] });
      try {
        if (!w) log.push('§125 skipped');
        else {
          await victimAs('humanoid');
          const r1 = await dmgHit(w, 19);
          ok('125a. a 19 is a Critical Hit (the pack\'s threshold)', r1.msg?.rolls?.[0]?.isCritical === true, `crit=${r1.msg?.rolls?.[0]?.isCritical} threshold=${r1.msg?.rolls?.[0]?.options?.criticalSuccess}`);
        }
      } finally {
        await closeOffers();
        if (w) await unlend(pcAttacker, w);
        unrig(); clearTargets();
      }
    });
    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  }
} });

await finish({ tag: 'class-items', out, plan, f });
