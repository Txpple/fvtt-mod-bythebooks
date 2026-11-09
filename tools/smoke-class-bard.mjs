// Classes smoke suite — Bard: the PHB classes plan's rows (audits/plans/session-0-classes.md) for
// the Bard, each section keeping its number and title. The fixtures, the lends, the
// helpers and the teardown are the classes kit's (tools/class-kit.mjs); everything written is restored.
import { announcePlan, connectSuite, finish, sectionPlan } from './harness.mjs';
import { runClassSuite } from './class-kit.mjs';

// The coverage map (tools/coverage-map.mjs) parses this; ⚠ never import a suite (it connects on evaluation).
export const COVERS = [
  'hold/trigger.js',        // the bystanders stamped beside the guards on a held hit (§1, §14)
  'hold/lookup.js',         // bystandersOf: the side, the reach, the Reaction, the pool, the mute, the margin gate (§1–§6)
  'hold/answer.js',         // the bystander's answer, the mute and pass (§1, §6)
  'hold/views.js',          // the bystander's popup, the bent card (§1, §89)
  'hold/continue.js',       // the verdict retaken with the bent roll (§1, §14)
  'hold/dice.js',           // the bent roll's chips (§1)
  'bystanders.js',          // Cutting Words on a check (§11, §12), Countercharm on a save (§42)
  'chip-spend.js',          // the mute swept with the combat (§6)
  'damage-holds.js',        // Cutting Words' damage half and the down guard (§3, §127)
  'clock-riders.js',        // Combat Inspiration's offense (§15)
  'hew.js',                 // Battle Magic's reminder (§87)
  'd20-folds.js',           // Peerless Skill (§79)
  'initiative-grants.js'    // Tandem Footwork (§54), Superior Inspiration (§93)
];

const SECTIONS = {
  1: 'Cutting Words, asked: a hit a d8 can turn (margin 2) opens the Bard\'s popup; Answer rolls the d8 (5), the hit becomes a MISS, the card says "Cutting Words (BTB Test Bard) −5", a Bardic Inspiration spent',
  2: 'the margin gate on the roll half: a hit by 9 asks nobody for the roll — no attack hold, no popup; the damage half asks at the damage hold, passed, the damage lands',
  3: 'Cutting Words\' damage half at the damage hold (2026-10-14): a hit the d8 cannot turn asks the Bard "cut the damage?" once the damage is known; Cut takes the d8 (3) off, 3 less lands; "Not until the next combat" mutes it out of combat, and a muted trivial hit asks nobody',
  5: 'the reach: the Bard 65 ft from the attacker is not asked',
  6: 'the mutes in a combat: "Not until my turn" (the chip, the next hit asks nobody, the Bard\'s turn sweeps it) and "Not this combat" (the chip, the combat\'s end sweeps it)',
  11: 'Cutting Words on a hostile\'s CHECK: the Attacker\'s Athletics; the Bard\'s popup says no DC is known; Answer takes the d8 (5) off — the card states the arithmetic and "ask your DM"',
  12: 'a check everyone passes: an Advantage Athletics asks the Bard and the Sorcerer; both pass, the offer resolves as a pass, the card says nothing',
  14: 'Combat Inspiration — Defense: in a combat, the Halfling holding the Bard\'s Inspired die (the Bard lent Combat Inspiration) is hit by 2 — ITS OWN popup "−<the Bard\'s die> · a Reaction · the Inspired die", nobody else asked; Answer rolls the die: a MISS, the Inspired effect deleted, the Halfling\'s Reaction spent; an ALLY\'s hit asks the Halfling all the same, nobody else',
  15: 'Combat Inspiration — Offense: an Inspired ally (BTB Test PC Attacker, the Bard\'s die) hits — the offer\'s UNTICKED row "Combat Inspiration — <die>"; ticked, the die rides and the Inspired effect is spent; a driven roll (no pick) and an unticked offer ride nothing',
  42: 'Countercharm (lent to the Bard): the Halfling fails a demanded save against Charm Person (Charmed) within 30 ft — the bard\'s popup "Countercharm — the Halfling\'s saving throw"; Answer: the d20 is rerolled with Advantage off the Halfling, the Reaction spent, the save retaken and SAVED; a failed save against Hold Person (Paralyzed) asks nobody',
  54: 'Tandem Footwork (B4, lent to the Bard): the bard\'s Initiative asks "give 1d8 to allies within 30 ft?"; Yes rolls once (5): the bard and the Halfling +5, the foe untouched, the unrolled Sorcerer noted; it rolls later and lands +5',
  79: 'Peerless Skill (C1, the Bard): a failed Athletics check offers the Bardic die; accepted, a Bardic Inspiration spent',
  87: 'Battle Magic (C1, the Bard): a spell cast as an action posts "Battle Magic — BTB Test Bard can attack again"',
  88: 'Leading Evasion (C1, the Bard 5 ft from the Halfling): the Halfling fails a half-on-save Dexterity save and takes HALF — the bard\'s Evasion shared',
  89: 'Unbreakable Majesty (C1, the Bard in its Majestic Presence): the Attacker\'s hit rolls its Charisma save inside the hold; a failure — the attack misses instead; the second hit that turn is not asked',
  93: "Superior Inspiration (D1, the Bard with every Bardic Inspiration spent): at Initiative the uses come back up to 2, automatically",
  127: 'the down guard (2026-10-14): a Cutting Words reduction that can keep the Halfling above 0 Hit Points is asked through the Bard\'s mute, the popup says so and offers no mute; Cut leaves the Halfling at 1'
};
const DEPENDS = {};

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'class-bard', watchdogMs: 900_000 });
announcePlan('class-bard', plan, pulled);

const out = await runClassSuite(f, { plan, sections: SECTIONS, body: async ({ sections, titles }) => {
  const { until, watch, faces, unrig } = window.__btb;
  const { results, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const KIT = window.__btbClasses;
  const { AC, MOD, a1Hit, a1Roll, a1Victim, ackHew, act, attackOf, attacker, attackerDoc, attackerToken, b4Cards, balance, bard, bardTokC, bystanderPopup, cardText, castSpell, clearTargets, closeA1, closeDialogs, closeOffers, created, cutPopup, d1Combat, damageFor, damageHoldOf, dropEffects, dropFx, dropMutes, dropReactionChips, dropReactionChipsOn, findPHB, fxNamed, grantCards, grantLine, halfling, halflingDoc, halflingToken, healFull, hewNotices, hgClose, hgKeep, hgLend, holdOf, hp, inspiration, lend, lendClassSpell, log, pcAttacker, pcToken, pcWeapon, pickApply, placeToken, popupTitled, popups, reEsc, reactionChipOn, refillInspiration, rescueWindowC, resolvedTarget, riderBox, riderRow, ridersOf, rollFlag, rollPopup, scene, set, sorcTokC, sorcerer, sorcererDoc, spendLuck, spendLuckC, spentBI, suiteStart, swing, textOf, titled, unlend, useFeature } = KIT;
  try {

    // ---- 1. Cutting Words, asked, turns the hit
    if (want(1)) await section(1, async () => {
      await closeDialogs(); await spendLuck(); await refillInspiration();
      const msg = await swing({ d20: [12] });
      const pop = await until(bystanderPopup, { timeout: 6000, label: 'the Bard\'s Cutting Words popup' });
      const guards = holdOf(msg)?.targets?.[0]?.guards ?? [];
      ok('1a. the hit is held for the Bard: a bystander popup "Cutting Words … −d8 · a Reaction"; the Sorcerer is not listed (a plain roll)',
        !!pop && /Cutting Words/.test(textOf(pop?.element)) && /−d8/.test(textOf(pop?.element))
          && guards.some(g => (g.uuid === bard.uuid) && g.bystander && !g.quiet) && !guards.some(g => g.uuid === sorcerer.uuid),
        `pop=${!!pop} guards=${JSON.stringify(guards.map(g => [g.name, g.row, g.quiet ?? false]))}`);
      ok('1b. the popup states the margin, "a d8 can turn it", and the face it needs: a hit by 2, "You need a 3 or higher on the d8"',
        /can turn it/.test(textOf(pop?.element)) && /You need a 3 or higher on the d8/.test(textOf(pop?.element))
          && /<strong>3<\/strong>/.test(pop?.element?.innerHTML ?? ''), textOf(pop?.element).slice(0, 240));
      faces([[5, 8]]);
      pickApply(pop);
      const t = await resolvedTarget(msg);
      ok('1c. the d8 (5) off the attack: a MISS, answered by the Bard (rescue Cutting Words)',
        (t?.answer === 'roll') && (t?.verdict === 'miss') && (t?.rescue === 'Cutting Words') && (t?.guardedBy?.uuid === bard.uuid)
          && (t?.bent?.how === 'die') && (t?.bent?.add === -5),
        JSON.stringify({ answer: t?.answer, verdict: t?.verdict, rescue: t?.rescue, by: t?.guardedBy?.name, bent: t?.bent }));
      // A window: the held damage is released with the verdict, and a turned miss lands none.
      const stray = await watch(() => hp() !== 400, { ms: 800 });
      // The resolved bend's block on the attack card (hold/views.js), drawn on the re-render after the verdict.
      await until(() => /Attack — Cutting Words/.test(cardText(msg?.id)), { label: 'the attack card\'s Cutting Words block' });
      ok('1d. the attack card: "Cutting Words (BTB Test Bard) −5 … MISS"', /Cutting Words \(BTB Test Bard\) −5.*MISS/.test(cardText(msg?.id)), cardText(msg?.id).slice(0, 240));
      ok('1e. one Bardic Inspiration spent; no damage landed; the popup closed', (spentBI() === 1) && (hp() === 400) && !stray && !bystanderPopup(),
        `spent=${spentBI()} hp=${hp()} stray=${!!stray} pop=${!!bystanderPopup()}`);
    });

    // ---- 2. the margin gate on the ROLL half: a hit by 9 asks nobody for the roll; the damage half asks at the damage hold
    if (want(2)) await section(2, async () => {
      await closeDialogs(); await spendLuck(); await refillInspiration(); await dropMutes();
      const msg = await swing({ d20: [19] });
      const cut = await until(cutPopup, { timeout: 8000, label: 'the Bard\'s "cut the damage?" popup' });
      ok('2a. no attack hold and no roll popup: a d8 cannot turn a hit by 9; the damage waits on the damage hold — the Bard\'s "cut the damage?" popup',
        !holdOf(msg) && !bystanderPopup() && !!cut && (hp() === 400), `hold=${JSON.stringify(holdOf(msg))} pop=${!!bystanderPopup()} cut=${!!cut} hp=${hp()}`);
      pickApply(cut, 'pass');
      await until(() => hp() < 400, { timeout: 8000, label: 'the passed damage on the Halfling' });
      ok('2b. Pass: the damage landed whole', hp() < 400, `hp=${hp()}`);
    });

    // ---- 3. Cutting Words' damage half at the damage hold (RULINGS *The asks widened*); the out-of-combat mute
    if (want(3)) await section(3, async () => {
      await closeDialogs(); await spendLuck(); await refillInspiration(); await dropMutes();
      // the mute goes whatever happened (a wait that times out throws): one left standing would hide a wrong ask in §5
      try {
        const msg = await swing({ d20: [19], dmg: 5 });
        const cut = await until(cutPopup, { timeout: 8000, label: 'the Bard\'s "cut the damage?" popup' });
        const card = damageHoldOf();
        const guard = card?.getFlag(MOD, 'damageHold')?.guards?.find(g => g.actorUuid === bard.uuid);
        const text = textOf(cut?.element);
        ok('3a. the Bard\'s popup "… hits BTB Test Halfling for N — cut the damage?", −1d8 off the damage, Bardic Inspiration N left; out of combat the one way out is "Not until the next combat"; no "keep from hitting 0" line at 400 HP',
          !!cut && /cut the damage\?/.test(text) && /Cut the damage −1?d8/.test(text) && /Bardic Inspiration \d+ left/.test(text)
            && !!cut?.element?.querySelector('input[value="mute-combat"]') && !cut?.element?.querySelector('input[value="mute-turn"]')
            && !/hitting 0 Hit Points/.test(text) && (guard?.bystander === true) && (guard?.reaction === 'Cutting Words') && !guard?.keepsUp,
          `cut=${!!cut} guard=${JSON.stringify(guard)} text="${text.slice(0, 260)}"`);
        faces([[3, 8]]);
        pickApply(cut, 'cast');
        // `applied` is written once the share has landed (damage-holds.js landHeld), the use and the Reaction spent before it.
        const landed = await until(() => { const f = game.messages.get(card?.id)?.getFlag(MOD, 'damageHold'); return f?.applied ? f : null; }, { timeout: 12000, label: 'the cut share landed' });
        unrig();
        const dmg = damageFor(msg?.id);
        const full = (dmg?.rolls ?? []).reduce((n, r) => n + Number(r.total ?? 0), 0);
        ok('3b. Cut: the d8 (3) off the DAMAGE — the Bard the reactor, reduceBy 3, 3 less landed, a Bardic Inspiration spent',
          (landed?.answer === 'cast') && (landed?.actorUuid === bard.uuid) && (landed?.reaction === 'Cutting Words') && (Number(landed?.reduceBy) === 3)
            && ((400 - hp()) === Math.max(0, full - 3)) && (spentBI() === 1),
          JSON.stringify({ answer: landed?.answer, by: landed?.actorName, reaction: landed?.reaction, reduceBy: landed?.reduceBy, full, taken: 400 - hp(), spent: spentBI() }));
        // c. the next hit: "Not until the next combat" — the chip, the hit lands whole
        await refillInspiration(); await dropReactionChipsOn(bard);
        const msg2 = await swing({ d20: [19], dmg: 5 });
        const cut2 = await until(cutPopup, { timeout: 8000, label: 'the second "cut the damage?" popup' });
        pickApply(cut2, 'mute-combat');
        const eff = await until(() => bard.effects.find(e => e.getFlag(MOD, 'bystanderMute')?.key === 'Cutting Words'), { timeout: 6000, label: 'the Bard\'s mute chip' });
        // the passed share lands in one update
        await until(() => hp() < 400, { timeout: 8000, label: 'the passed hit\'s damage on the Halfling' });
        ok('3c. "Not until the next combat": the chip "Cutting Words — muted until the next combat" (combat null, until "combat"); the hit lands whole',
          /muted until the next combat/.test(eff?.name ?? '') && (eff?.getFlag(MOD, 'bystanderMute')?.combat === null) && (eff?.getFlag(MOD, 'bystanderMute')?.until === 'combat') && ((400 - hp()) === full),
          `effect=${eff?.name ?? null} flag=${JSON.stringify(eff?.getFlag(MOD, 'bystanderMute') ?? null)} taken=${400 - hp()} full=${full}`);
        // d. muted: a trivial reduction asks nobody — no damage hold, the damage lands at once
        const holds = () => game.messages.contents.filter(m => m.getFlag(MOD, 'damageHold')).length;
        const before = holds();
        const msg3 = await swing({ d20: [19], dmg: 5 });
        // soft: a wrong ask holds the damage back, and the ok below names it (the hold, the popup)
        await until(() => hp() < 400, { timeout: 8000, label: 'the muted hit\'s damage on the Halfling' }).catch(() => null);
        // A window: no damage hold and no popup for the muted Bard.
        const stray = await watch(() => (holds() !== before) || cutPopup(), { ms: 800 });
        const after = holds();
        ok('3d. muted, a trivial reduction asks nobody: no damage hold, no popup, the damage landed whole', (after === before) && !stray && !cutPopup() && ((400 - hp()) === full),
          `holds=${before}->${after} stray=${!!stray} pop=${!!cutPopup()} taken=${400 - hp()}`);
        void msg2; void msg3;
      } finally {
        await dropMutes();
      }
    });

    // ---- 127. the down guard (RULINGS *The asks widened*): a reduction that keeps the Halfling above 0 is asked through the mute
    if (want(127)) await section(127, async () => {
      await closeDialogs(); await spendLuck(); await refillInspiration(); await dropMutes(); await dropReactionChipsOn(bard);
      // the mute goes whatever happened (a wait that times out throws): one left standing would hide a wrong ask in §5
      try {
        await bard.createEmbeddedDocuments('ActiveEffect', [{ name: 'Cutting Words — muted until the next combat', img: 'icons/svg/sound-off.svg', transfer: false,
          flags: { [MOD]: { bystanderMute: { key: 'Cutting Words', combat: null, until: 'combat' } } } }]);
        // the hit's damage, measured: muted, a trivial hit at 400 HP lands at once
        const probeMsg = await swing({ d20: [19], dmg: 5 });
        await until(() => hp() < 400, { timeout: 8000, label: 'the probe hit\'s damage on the Halfling' });
        const full = 400 - hp();
        // the Halfling two short of the damage: it would drop to 0, and a d8 can keep it up
        await halfling.update({ 'system.attributes.hp.value': Math.max(1, full - 2), 'system.attributes.hp.temp': 0 });
        attackerToken.control({ releaseOthers: true });
        halflingToken.setTarget(true, { releaseOthers: true });
        faces([[19, 20], [5, 6], [5, 6]]);
        const usage = await act().use({ subsequentActions: false }, { configure: false }, {});
        const rolls = await act().rollAttack({}, { configure: false }, usage?.message?.id ? { data: { 'system.origin': usage.message.id } } : {});
        const msg = rolls?.[0]?.parent ?? null;
        const cut = await until(cutPopup, { timeout: 8000, label: 'the down guard\'s "cut the damage?" popup' });
        const card = damageHoldOf();
        const guard = card?.getFlag(MOD, 'damageHold')?.guards?.find(g => g.actorUuid === bard.uuid);
        const text = textOf(cut?.element);
        ok('127a. muted, yet asked: the popup "You can keep BTB Test Halfling from hitting 0 Hit Points." with no mute button; the hold card says a Reaction can',
          !!cut && /You can keep BTB Test Halfling from hitting 0 Hit Points/.test(text) && !cut?.element?.querySelector('input[value^="mute"]')
            && (guard?.keepsUp === true) && /can keep BTB Test Halfling from hitting 0 Hit Points/.test(cardText(card?.id)),
          `cut=${!!cut} guard=${JSON.stringify(guard)} full=${full} hp=${hp()} text="${text.slice(0, 260)}" card="${cardText(card?.id).slice(0, 200)}"`);
        faces([[3, 8]]);
        pickApply(cut, 'cast');
        // `applied` is written once the share has landed (damage-holds.js landHeld)
        const landed = await until(() => { const f = game.messages.get(card?.id)?.getFlag(MOD, 'damageHold'); return f?.applied ? f : null; }, { timeout: 12000, label: 'the cut share landed' });
        unrig();
        ok('127b. Cut (3): the Halfling stands at 1 Hit Point', (landed?.answer === 'cast') && (Number(landed?.reduceBy) === 3) && (hp() === 1),
          `answer=${landed?.answer} reduceBy=${landed?.reduceBy} hp=${hp()} full=${full}`);
        void probeMsg; void msg;
      } finally {
        await dropMutes(); await healFull();
      }
    });

    // ---- 5. the reach
    if (want(5)) await section(5, async () => {
      await closeDialogs(); await spendLuck(); await refillInspiration();
      // ⚠ The range's tokens sit below its 2000 px edge, where Foundry refuses a move: the Bard is re-placed 65 ft west.
      // The reach is read off the canvas's placeables (geometry.js): the new token on it, the old one gone.
      const replaceBard = async (x, label) => {
        const old = KIT.bardDoc.id;
        await scene.deleteEmbeddedDocuments('Token', [old]);
        ({ doc: KIT.bardDoc } = await placeToken(bard, x, 2100, 1));
        await until(() => !canvas.tokens.get(old) && canvas.tokens.get(KIT.bardDoc.id), { label });
      };
      await replaceBard(100, 'the Bard re-placed 65 ft west, its old token off the canvas');
      const msg = await swing({ d20: [12] });
      // A window: no hold and no popup for a Bard out of reach.
      const stray = await watch(() => holdOf(msg) || bystanderPopup(), { ms: 1200 });
      ok('5a. the Bard 65 ft from the attacker: nobody asked, no hold', !stray && !holdOf(msg) && !bystanderPopup(), `stray=${!!stray} hold=${JSON.stringify(holdOf(msg)?.targets?.[0]?.guards ?? null)}`);
      await replaceBard(1700, 'the Bard back home, its far token off the canvas');
    });

    // ---- 6. the mutes in a combat (RULINGS *The asks widened*): "Not until my turn" and the turn's sweep; "Not this combat" and the combat's
    if (want(6)) await section(6, async () => {
      await closeDialogs(); await spendLuck(); await refillInspiration(); await dropMutes();
      const [combat] = await Combat.createDocuments([{ scene: scene.id, active: true }]);
      created.combats.push(combat.id);
      await combat.createEmbeddedDocuments('Combatant', [attackerDoc, halflingDoc, KIT.bardDoc, sorcererDoc].map((d, i) =>
        ({ tokenId: d.id, sceneId: scene.id, actorId: d.actorId, initiative: 20 - i })));
      // the combat and the mutes go whatever happened (a wait that times out throws): the next sections run out of combat
      try {
        await combat.startCombat();
        // the mutes' scopes read the running combat (shared.js muteScopesFor)
        await until(() => combat.started && (game.combat?.id === combat.id), { label: 'the combat started and running' });
        const msg = await swing({ d20: [12] });
        const pop = await until(bystanderPopup, { timeout: 6000, label: 'the Bard\'s Cutting Words popup in the combat' });
        const turnBtn = pop?.element?.querySelector('input[value="mute-turn"]')?.closest('label');
        const combatBtn = pop?.element?.querySelector('input[value="mute-combat"]')?.closest('label');
        ok('6a. the popup carries both ways out: "Don\x27t ask again till next turn" and "Don\x27t ask again this combat"',
          !!turnBtn && /ask again till next turn/.test(textOf(turnBtn)) && !!combatBtn && /ask again this combat/.test(textOf(combatBtn)), textOf(pop?.element).slice(-160));
        pickApply(pop, 'mute-turn');
        const eff = await until(() => bard.effects.find(e => e.getFlag(MOD, 'bystanderMute')?.key === 'Cutting Words'), { timeout: 6000, label: 'the Bard\'s turn mute chip' });
        const t = await resolvedTarget(msg);
        const muteFlag = eff?.getFlag(MOD, 'bystanderMute');
        ok('6b. "Not until my turn": the chip "Cutting Words — muted until your next turn" (this combat, until "turn"); the hit lands (passed)',
          /Cutting Words — muted until your next turn/.test(eff?.name ?? '') && (muteFlag?.combat === combat.id) && (muteFlag?.until === 'turn') && (t?.verdict === 'hit'),
          `effect=${eff?.name ?? null} flag=${JSON.stringify(muteFlag ?? null)} verdict=${t?.verdict}`);
        // the passed hit's damage lands before the next swing heals the Halfling
        await until(() => hp() < 400, { timeout: 8000, label: 'the passed hit\'s damage on the Halfling' });
        const msg2 = await swing({ d20: [12] });
        // soft: a wrong ask holds the damage back, and the ok below names it (the hold, the popups)
        await until(() => hp() < 400, { timeout: 8000, label: 'the muted hit\'s damage on the Halfling' }).catch(() => null);
        // A window: no attack hold, no popup, no damage hold for the muted Bard.
        const stray = await watch(() => holdOf(msg2) || bystanderPopup() || cutPopup(), { ms: 800 });
        ok('6c. muted: the next hit asks nobody — no attack hold, no popup, no damage hold; the damage landed',
          !stray && !holdOf(msg2) && !bystanderPopup() && !cutPopup() && (hp() < 400), `stray=${!!stray} hold=${JSON.stringify(holdOf(msg2)?.targets?.[0]?.guards ?? null)} cut=${!!cutPopup()}`);
        // the Bard's turn begins: the mute goes
        for (let i = 0; (i < 6) && (combat.combatant?.actorId !== bard.id); i++) await combat.nextTurn();
        const gone = await until(() => !bard.effects.some(e => e.getFlag(MOD, 'bystanderMute')), { timeout: 8000, label: 'the turn mute swept at the Bard\'s turn' });
        ok('6d. the Bard\'s turn begins: the turn\'s mute is swept', gone && (combat.combatant?.actorId === bard.id),
          `turn=${combat.combatant?.name} left=${bard.effects.filter(e => e.getFlag(MOD, 'bystanderMute')).map(e => e.name)}`);
        // asked again; "Not this combat"
        const msg3 = await swing({ d20: [12] });
        const pop3 = await until(bystanderPopup, { timeout: 6000, label: 'the Bard asked again on its turn' });
        pickApply(pop3, 'mute-combat');
        const eff3 = await until(() => bard.effects.find(e => e.getFlag(MOD, 'bystanderMute')?.key === 'Cutting Words'), { timeout: 6000, label: 'the Bard\'s combat mute chip' });
        await resolvedTarget(msg3);
        ok('6e. asked again on the Bard\'s turn; "Not this combat": the chip "Cutting Words — muted this combat" (until "combat")',
          !!pop3 && /Cutting Words — muted this combat/.test(eff3?.name ?? '') && (eff3?.getFlag(MOD, 'bystanderMute')?.until === 'combat') && (eff3?.getFlag(MOD, 'bystanderMute')?.combat === combat.id),
          `pop=${!!pop3} effect=${eff3?.name ?? null}`);
        // soft: a settle before the next swing heals the Halfling; no ok reads this hit's damage
        await until(() => hp() < 400, { timeout: 8000, label: 'the passed hit\'s damage on the Halfling' }).catch(() => null);
        const msg4 = await swing({ d20: [12] });
        // A window: no attack hold, no popup, no damage hold for the muted Bard.
        const stray4 = await watch(() => holdOf(msg4) || bystanderPopup() || cutPopup(), { ms: 1200 });
        ok('6f. the next hit asks nobody', !stray4 && !holdOf(msg4) && !bystanderPopup() && !cutPopup(), `stray=${!!stray4} hold=${JSON.stringify(holdOf(msg4)?.targets?.[0]?.guards ?? null)}`);
        await combat.delete();
        const swept = await until(() => !bard.effects.some(e => e.getFlag(MOD, 'bystanderMute')), { timeout: 8000, label: 'the combat mute swept with the combat' });
        ok('6g. the combat\'s end sweeps the mute', swept, `left=${bard.effects.filter(e => e.getFlag(MOD, 'bystanderMute')).map(e => e.name)}`);
      } finally {
        if (game.combats.get(combat.id)) await combat.delete().catch(() => {});
        await dropMutes();
      }
    });

    // ---- 11. Cutting Words on a hostile's check
    if (want(11)) await section(11, async () => {
      await closeDialogs(); await refillInspiration();
      faces([[14, 20]]);
      const rolls = await attacker.rollSkill({ skill: 'ath' }, { configure: false }, {});
      const msg = rolls?.[0]?.parent ?? null;
      const pop = await until(() => rollPopup(/Cutting Words/), { timeout: 8000, label: 'the Bard\'s Cutting Words popup on the check' });
      ok('11a. the Bard\'s popup: "Cutting Words — BTB Test Attacker\'s check", no DC known', !!pop && /No DC is known/.test(textOf(pop?.element)),
        textOf(pop?.element).slice(0, 220));
      faces([[5, 8]]);
      pickApply(pop);
      const flag = await until(() => (rollFlag(msg)?.status === 'resolved') ? rollFlag(msg) : null, { timeout: 8000, label: 'the check\'s bystander ask resolved' });
      // The bent line (bystanders.js bentLine), drawn on the re-render after the answer: its eyebrow names the rescue.
      await until(() => /Reaction — Cutting Words/.test(cardText(msg?.id)), { label: 'the check card\'s Cutting Words line' });
      ok('11b. the d8 (5) off: the card states the arithmetic and "ask your DM"', (flag?.answer === 'roll') && (flag?.bent?.add === -5)
        && /Cutting Words \(BTB Test Bard\) −5/.test(cardText(msg?.id)) && /ask your DM/.test(cardText(msg?.id)),
        `flag=${JSON.stringify({ answer: flag?.answer, bent: flag?.bent?.add })} card=${cardText(msg?.id).slice(-200)}`);
    });

    // ---- 12. everyone passes
    if (want(12)) await section(12, async () => {
      await closeDialogs(); await refillInspiration(); await balance.update({ 'system.uses.spent': 0 });
      faces([[6, 20], [14, 20]]);   // the FIRST die the lower: cancelling the Advantage changes the roll
      const rolls = await attacker.rollSkill({ skill: 'ath', advantage: true }, { configure: false }, {});
      const msg = rolls?.[0]?.parent ?? null;
      const a = await until(() => rollPopup(/Cutting Words/), { timeout: 8000, label: 'the Bard\'s Cutting Words popup' });
      const b = await until(() => rollPopup(/Restore Balance/), { timeout: 4000, label: 'the Sorcerer\'s Restore Balance popup' });
      ok('12a. both asked on an Advantage check', !!a && !!b, `cw=${!!a} rb=${!!b} guards=${JSON.stringify((rollFlag(msg)?.guards ?? []).map(g => g.row))}`);
      pickApply(a, 'pass');
      await until(() => rollFlag(msg)?.guards?.find(g => g.row === 'Cutting Words')?.passed, { label: 'the Bard\'s pass recorded' });
      pickApply(b, 'pass');
      const flag = await until(() => (rollFlag(msg)?.status === 'resolved') ? rollFlag(msg) : null, { timeout: 8000, label: 'the check\'s bystander ask resolved' });
      // the card re-rendered from the resolved flag: the pending "Reaction — held" line gone
      await until(() => !/Reaction — held/.test(cardText(msg?.id)), { label: 'the check card redrawn after the passes' });
      ok('12b. resolved as a pass; nothing on the card', (flag?.answer === 'pass') && !/Reaction — /.test(cardText(msg?.id)),
        `answer=${flag?.answer} card=${cardText(msg?.id).slice(-160)}`);
    });
    await KIT.leaveA3();

    // ---- 14. Combat Inspiration — Defense: the hit creature's own Inspired die, its Reaction
    if (want(14)) await section(14, async () => {
      await closeDialogs(); await spendLuck(); await dropReactionChips(halfling);
      const ci = await lend(bard, 'Combat Inspiration');
      // The die the code reads (lookup.js inspiredDieOf): the BARD's scale.bard.inspiration formula.
      const scale = foundry.utils.getProperty(bard.getRollData(), 'scale.bard.inspiration');
      const die = String(scale?.formula ?? scale?.die ?? '').trim();
      const denom = Number(/d(\d+)/.exec(die)?.[1] ?? 0);
      // The shape the Bard's Inspire activity lands (fixture-d20-folds.mjs): the origin is the way back to the Bard.
      const [inspired] = await halfling.createEmbeddedDocuments('ActiveEffect', [{
        name: 'Inspired', img: 'icons/magic/light/hand-sparks-smoke-green.webp',
        origin: (inspiration() ?? ci).uuid, duration: { seconds: 3600 }, transfer: false, disabled: false, changes: []
      }]);
      const [combat] = await Combat.createDocuments([{ scene: scene.id, active: true }]);
      created.combats.push(combat.id);
      await combat.createEmbeddedDocuments('Combatant', [attackerDoc, halflingDoc, KIT.bardDoc].map((d, i) =>
        ({ tokenId: d.id, sceneId: scene.id, actorId: d.actorId, initiative: 20 - i })));
      await combat.startCombat();
      let inspired2 = null;
      try {
        // out of a running combat no Reaction chip is written (14d reads it)
        await until(() => combat.started && (game.combat?.id === combat.id), { label: 'the combat started and running' });
        const msg = await swing({ d20: [12] });   // a hit by 2: any Bardic die can turn it
        const pop = await until(() => popupTitled(/Combat Inspiration/), { timeout: 6000, label: 'the Halfling\'s Combat Inspiration popup' });
        const guards = holdOf(msg)?.targets?.[0]?.guards ?? [];
        const g = guards.find(x => x.uuid === halfling.uuid);
        ok(`14a. the Halfling's OWN popup: "Combat Inspiration … −${die} · a Reaction · the Inspired die", "BTB Test Bard's Inspired die"`,
          !!pop && denom > 0 && textOf(pop?.element).includes(`−${die}`) && /a Reaction/.test(textOf(pop?.element))
            && /the Inspired die/.test(textOf(pop?.element)) && /BTB Test Bard's Inspired die/.test(textOf(pop?.element))
            && g?.hitSelf === true && (g?.inspired?.effectId === inspired.id),
          `die=${die} pop="${textOf(pop?.element).slice(0, 240)}" guard=${JSON.stringify(g ?? null)}`);
        ok('14b. nobody else is asked (only: "self"): the hold\'s guards are the Halfling alone',
          guards.length > 0 && guards.every(x => x.uuid === halfling.uuid) && popups().filter(app => app.element?.querySelector?.('[data-bf-ticks="bf-bystander"]')).length === 1,
          `guards=${JSON.stringify(guards.map(x => [x.name, x.row]))}`);
        faces([[5, denom || 6]]);
        pickApply(pop);
        // the Inspired die and the Reaction are spent before the answer resolves the hold (hold/answer.js bystanderReaction)
        const t = await resolvedTarget(msg);
        // A window: the held damage is released with the verdict, and a turned miss lands none.
        const stray = await watch(() => hp() !== 400, { ms: 600 });
        ok('14c. the die (5) off the attack: a MISS, the Halfling answered for itself (rescue Combat Inspiration)',
          (t?.answer === 'roll') && (t?.verdict === 'miss') && (t?.rescue === 'Combat Inspiration') && (t?.guardedBy?.uuid === halfling.uuid)
            && (t?.bent?.add === -5) && (hp() === 400) && !stray,
          JSON.stringify({ answer: t?.answer, verdict: t?.verdict, rescue: t?.rescue, by: t?.guardedBy?.name, bent: t?.bent, hp: hp(), stray: !!stray }));
        ok('14d. the Inspired effect is spent (deleted) and the Halfling\'s Reaction is spent (the chip)',
          !halfling.effects.get(inspired.id) && !!reactionChipOn(halfling),
          `inspired=${!!halfling.effects.get(inspired.id)} chip=${reactionChipOn(halfling)?.name ?? null}`);
        // The resolved bend's block on the attack card (hold/views.js), drawn on the re-render after the verdict.
        await until(() => /Attack — Combat Inspiration/.test(cardText(msg?.id)), { label: 'the attack card\'s Combat Inspiration block' });
        ok('14e. the attack card: "Combat Inspiration (BTB Test Halfling) −5 … MISS"',
          /Combat Inspiration \(BTB Test Halfling\) −5.*MISS/.test(cardText(msg?.id)), cardText(msg?.id).slice(0, 240));
        // f. an attack inside one side (the Attacker made friendly): the hit creature's own Defense is still asked, nobody else
        await closeDialogs(); await dropReactionChips(halfling);
        [inspired2] = await halfling.createEmbeddedDocuments('ActiveEffect', [{
          name: 'Inspired', img: 'icons/magic/light/hand-sparks-smoke-green.webp',
          origin: (inspiration() ?? ci).uuid, duration: { seconds: 3600 }, transfer: false, disabled: false, changes: []
        }]);
        await attackerDoc.update({ disposition: 1 });
        await until(() => attackerToken.document.disposition === 1, { label: 'the Attacker friendly' });
        const msg2 = await swing({ d20: [12] });
        const pop2 = await until(() => popupTitled(/Combat Inspiration/), { timeout: 6000, label: 'the same-side Combat Inspiration popup' }).catch(() => null);
        const guards2 = holdOf(msg2)?.targets?.[0]?.guards ?? [];
        ok('14f. an ALLY\'s hit by 2 (the Attacker friendly): the Halfling\'s own Combat Inspiration popup all the same; the hold\'s guards are the Halfling alone',
          !!pop2 && guards2.length > 0 && guards2.every(x => x.uuid === halfling.uuid) && guards2.some(x => x.hitSelf && (x.inspired?.effectId === inspired2.id)),
          `pop=${!!pop2} guards=${JSON.stringify(guards2.map(x => [x.name, x.row, x.hitSelf ?? false]))}`);
        faces([[5, denom || 6]]);
        if (pop2) pickApply(pop2);
        const t2 = await resolvedTarget(msg2);
        ok('14g. answered: the die off the ally\'s attack, a MISS; the Inspired effect spent',
          (t2?.verdict === 'miss') && (t2?.rescue === 'Combat Inspiration') && !halfling.effects.get(inspired2.id),
          JSON.stringify({ answer: t2?.answer, verdict: t2?.verdict, rescue: t2?.rescue, inspired: !!halfling.effects.get(inspired2.id) }));
      } finally {
        await closeDialogs();
        if (attackerToken.document.disposition !== -1) await attackerDoc.update({ disposition: -1 });
        if (inspired2 && halfling.effects.get(inspired2.id)) await halfling.deleteEmbeddedDocuments('ActiveEffect', [inspired2.id]).catch(() => {});
        if (game.combats.get(combat.id)) await combat.delete();
        await dropReactionChips(halfling);
        if (halfling.effects.get(inspired.id)) await halfling.deleteEmbeddedDocuments('ActiveEffect', [inspired.id]).catch(() => {});
        await unlend(bard, ci);
      }
    });

    // ---- 15. Combat Inspiration — Offense: the Inspired ally's die, UNTICKED on the offer
    if (want(15)) await section(15, async () => {
      await closeDialogs(); await a1Victim();
      const bardic = inspiration();
      if (!pcWeapon || !bardic) log.push(`§15 skipped: pcWeapon=${!!pcWeapon} bardic=${!!bardic}`);
      else {
        const ci = await lend(bard, 'Combat Inspiration');
        const scale = foundry.utils.getProperty(bard.getRollData(), 'scale.bard.inspiration');
        const die = String(scale?.formula ?? scale?.die ?? '').trim();          // clock-riders.js inspiredFrom's read
        const norm = s => String(s ?? '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, '').replace(/^1d/, 'd');   // the dice, not the part's name
        // The d20-folds suite's seed: the effect's origin is the Bard's Bardic Inspiration (grantingActor → the Bard).
        const seed = async () => (await pcAttacker.createEmbeddedDocuments('ActiveEffect', [{ name: 'Inspired',
          img: 'icons/magic/light/hand-sparks-smoke-green.webp', origin: bardic.uuid, duration: { seconds: 3600 },
          transfer: false, disabled: false, changes: [] }]))[0];
        try {
          const act = attackOf(pcAttacker, pcWeapon);
          const eff = await seed();
          const { msg, offer } = await a1Hit(pcAttacker, pcToken, act);
          const box = riderBox(offer, 'combat-inspiration');
          ok(`15a. an Inspired ally hits: the offer's UNTICKED row "Combat Inspiration — ${die}"`,
            !!die && !!box && !box.checked && new RegExp(`Combat Inspiration — ${reEsc(die)}`).test(riderRow(offer, 'combat-inspiration')),
            `die=${die} offer=${!!offer} box=${!!box} checked=${box?.checked} row="${riderRow(offer, 'combat-inspiration')}"`);
          box?.click();   // the box's change handler records the tick inside the click (clock-riders.js)
          const dmg = await a1Roll(msg, offer);
          const r = ridersOf(dmg).find(x => x.key === 'combat-inspiration');
          const gone = await until(() => !pcAttacker.effects.get(eff.id), { timeout: 6000, label: 'the Inspired effect spent as the die rode' });
          ok('15b. ticked, the die rides as its own part (the attack\'s own damage type), the pick recorded, the Inspired effect spent',
            !!r && (norm(r.formula) === norm(die)) && !!r.type && (dmg?.rolls ?? []).some(x => norm(x.formula) === norm(die))
              && (msg?.getFlag(MOD, 'clockPick') ?? []).includes('combat-inspiration') && gone,
            `rider=${JSON.stringify(r)} formulas=[${(dmg?.rolls ?? []).map(x => `${x.formula}:${x.options?.type}`).join(' | ')}] pick=${JSON.stringify(msg?.getFlag(MOD, 'clockPick'))} effectGone=${gone}`);
          // the rider's line on the damage card (clock-riders.js), drawn from its clockRiders flag
          await until(() => /rode this roll/.test(cardText(dmg?.id)), { label: 'the damage card\'s Combat Inspiration line' });
          ok('15c. the damage card: "Combat Inspiration — … rode this roll · BTB Test Bard\'s Inspired die spent"',
            /Combat Inspiration — .*rode this roll/.test(cardText(dmg?.id)) && /BTB Test Bard's Inspired die spent/.test(cardText(dmg?.id)),
            cardText(dmg?.id).slice(0, 260));

          // A DRIVEN roll: the damage rolled with no offer committed (no clockPick) — rollDamageForAttack's own call.
          const eff2 = await seed();
          const { msg: m2, offer: o2 } = await a1Hit(pcAttacker, pcToken, act);
          const dr = await act.rollDamage({ ability: m2?.system?.ability, attackMode: m2?.system?.mode, isCritical: false },
            { configure: false }, { data: { flags: { [MOD]: { attackFor: m2?.id } } } });
          // UNSURE: a damage roll's `.parent` as rollAttack's is — the fallback finds the first damage for the attack
          const driven = dr?.[0]?.parent ?? game.messages.contents.find(m => (m.type === 'damage') && (m.getFlag(MOD, 'attackFor') === m2?.id)) ?? null;
          // A window: a rider spends the Inspired die as it rides; the driven roll must leave it standing.
          const strayD = await watch(() => !pcAttacker.effects.get(eff2.id), { ms: 600 });
          ok('15d. a driven roll (no pick on the attack) never rides it: no Combat Inspiration part or record, the Inspired effect stands',
            !!driven && !m2?.getFlag(MOD, 'clockPick') && !ridersOf(driven).some(x => x.key === 'combat-inspiration')
              && !(driven.rolls ?? []).some(x => norm(x.formula) === norm(die)) && !strayD && !!pcAttacker.effects.get(eff2.id),
            `driven=${!!driven} pick=${JSON.stringify(m2?.getFlag(MOD, 'clockPick'))} riders=${JSON.stringify(ridersOf(driven).map(x => x.key))} formulas=[${(driven?.rolls ?? []).map(x => x.formula).join(' | ')}] spent=${!!strayD} inspired=${!!pcAttacker.effects.get(eff2.id)}`);
          // …and the offer still open for that attack, rolled as it stands (unticked): the pick is empty, nothing rides.
          const n0 = game.messages.contents.filter(m => (m.type === 'damage') && (m.getFlag(MOD, 'attackFor') === m2?.id)).length;
          o2?.element?.querySelector('button[data-action="roll"]')?.click();
          // soft: the ok reads the offer's absence itself (!!o2) and this roll only through what must not ride on it
          const d2 = await until(() => game.messages.contents.filter(m => (m.type === 'damage') && (m.getFlag(MOD, 'attackFor') === m2?.id))[n0] ?? null, { timeout: 12000, label: 'the unticked offer\'s damage' }).catch(() => null);
          // A window: the unticked roll must leave the Inspired die standing.
          const strayE = await watch(() => !pcAttacker.effects.get(eff2.id), { ms: 400 });
          ok('15e. left unticked on the offer: the pick records nothing, nothing rides, the Inspired effect stands',
            !!o2 && Array.isArray(m2?.getFlag(MOD, 'clockPick')) && (m2.getFlag(MOD, 'clockPick').length === 0)
              && !ridersOf(d2).some(x => x.key === 'combat-inspiration') && !strayE && !!pcAttacker.effects.get(eff2.id),
            `offer=${!!o2} pick=${JSON.stringify(m2?.getFlag(MOD, 'clockPick'))} d2=${!!d2} riders=${JSON.stringify(ridersOf(d2).map(x => x.key))} spent=${!!strayE} inspired=${!!pcAttacker.effects.get(eff2.id)}`);
        } finally {
          await closeOffers();
          await dropEffects(pcAttacker, pcAttacker.effects.filter(e => e.name === 'Inspired').map(e => e.id));
          await unlend(bard, ci);
        }
      }
    });
    KIT.markA2();

    // ---- 42. Countercharm: a friend's failed demanded save against Charmed, the bard's Reaction rerolls it with Advantage
    if (want(42)) await section(42, async () => {
      await closeA1(); await spendLuck();
      const countercharm = await hgLend(bard, 'Countercharm', 'feat');
      const lentSpells = [];
      const castAt = async (name, targetToken) => {
        let id = attacker.items.find(i => (i.name === name) && (i.type === 'spell'))?.id;
        if (!id) {
          const src = await findPHB(name, 'spell');
          const data = src?.toObject();
          if (!data) return null;
          data.system.prepared = 1; data.system.method = 'atwill';
          const [it] = await attacker.createEmbeddedDocuments('Item', [data]); id = it.id; lentSpells.push(id);
        }
        const a = attacker.items.get(id)?.system?.activities?.find(x => x.type === 'save');
        if (!a) return null;
        attackerToken.control({ releaseOthers: true });
        targetToken.setTarget(true, { releaseOthers: true });
        const use = await a.use({ consume: { spellSlot: false } }, { configure: false }, {});
        const card = use?.message ?? null;
        // no card is the caller's skip; a card is the demand, stamped after the use (saves/demand.js)
        if (card) await until(() => card.getFlag(MOD, 'saves'), { timeout: 6000, label: `the ${name} demand stamped` });
        return card;
      };
      const reactionChip = () => bard.effects.find(e => e.getFlag(MOD, 'mastery') === 'reaction') ?? null;
      let combat42 = null;
      try {
        if (!countercharm) log.push('§42 skipped: no Countercharm in the PHB');
        else {
          await set('saveRolls', 'prompt');
          await healFull();
          // A combat: out of one no Reaction chip is written (the suite lesson); the attacker's turn.
          [combat42] = await Combat.createDocuments([{ scene: scene.id, active: true }]);
          created.combats.push(combat42.id);
          await combat42.createEmbeddedDocuments('Combatant', [
            { tokenId: attackerToken.document.id, sceneId: scene.id, actorId: attacker.id, initiative: 20 },
            { tokenId: halflingToken.document.id, sceneId: scene.id, actorId: halfling.id, initiative: 15 },
            { tokenId: KIT.bardDoc.id, sceneId: scene.id, actorId: bard.id, initiative: 10 }]);
          await combat42.startCombat();
          await until(() => combat42.started && (game.combat?.id === combat42.id), { label: 'the combat started and running' });
          // a. Charm Person at the Halfling (10 ft from the bard): a natural 1 fails; the popup to the bard
          const t0 = Date.now();
          const card = await castAt('Charm Person', halflingToken);
          if (!card) log.push('§42a skipped: no Charm Person save activity');
          else {
            const dc = Number(card.getFlag(MOD, 'saves')?.dc);
            const demandStatuses = card.getFlag(MOD, 'saves')?.demand?.statuses ?? [];
            faces([[10, 20]]);
            // the probe posts no message: nothing answers it (bystanders.js reads a roll's message)
            const probeSave = await halfling.rollSavingThrow({ ability: 'wis' }, { configure: false }, { create: false });
            const smod = Number(probeSave?.[0]?.total) - 10;
            faces([[1, 20]]);
            const rolls = await halfling.rollSavingThrow({ ability: 'wis' }, { configure: false }, {});
            const rollMsg = rolls?.[0]?.parent ?? null;
            const pop = await until(() => rollPopup(/Countercharm/), { timeout: 8000, label: 'the bard\'s Countercharm popup' });
            const popText = textOf(pop?.element);
            ok('42a. the Halfling fails a demanded save against Charmed: the bard\'s popup "Countercharm — BTB Test Halfling\'s saving throw", the reroll at Advantage named, the demand carrying "charmed"',
              !!pop && /Countercharm/.test(popText) && /saving throw/.test(popText) && /rolled again with Advantage/.test(popText) && demandStatuses.includes('charmed'),
              `pop=${!!pop} dc=${dc} mod=${smod} statuses=${JSON.stringify(demandStatuses)} text="${popText.slice(0, 240)}"`);
            // b. Answer: two d20s (17 and 3) rerolled off the Halfling, the 17 standing; the Reaction spent; the entry SAVED
            faces([[17, 20], [3, 20]]);
            pickApply(pop);
            const entry = await until(() => card.getFlag(MOD, 'saves')?.targets?.find(x => (x.uuid === halfling.uuid) && x.done) ?? null, { timeout: 12000, label: 'the Halfling\'s rerolled save folded into the demand' });
            unrig();
            const bent = rollMsg?.getFlag(MOD, 'bystanderRoll')?.bent ?? null;
            const rerollMsg = game.messages.contents.find(m => (m.timestamp >= t0) && (m.getFlag(MOD, 'respondsTo') === rollMsg?.id));
            const rise = rerollMsg?.getFlag(MOD, 'diceRise') ?? null;
            ok('42b. Answer: the d20 rerolled with Advantage (17 and 3, the 17 standing), the total 17 + mod, the entry SAVED, the Reaction spent, the dice rising off the Halfling',
              !!entry && (entry.outcome === 'saved') && (bent?.how === 'reroll') && (bent?.stood === 17) && (bent?.total === 17 + smod) && (entry.total === 17 + smod) && (17 + smod >= dc)
                && !!reactionChip() && (rise?.on === halfling.uuid) && /Advantage/.test(rerollMsg?.flavor ?? ''),
              `entry=${JSON.stringify(entry && { outcome: entry.outcome, total: entry.total })} bent=${JSON.stringify(bent)} reaction=${!!reactionChip()} rise=${JSON.stringify(rise)} flavor="${rerollMsg?.flavor ?? ''}"`);
            // soft: the ok's detail falls back to the card's own text when the line never draws
            const line = await until(() => { const t = cardText(rollMsg?.id); return /rerolled with Advantage/.test(t) ? t : null; }, { timeout: 6000, label: 'the save card\'s Countercharm line' }).catch(() => null);
            ok('42c. the roll\'s card: "Countercharm (BTB Test Bard) the d20 (1) rerolled with Advantage (17, 3) — the 17 stands: … vs DC"',
              /Countercharm \(BTB Test Bard\)/.test(line ?? '') && /the d20 \(1\) rerolled with Advantage \(17, 3\) — the 17 stands/.test(line ?? '') && new RegExp(`vs DC ${dc}`).test(line ?? ''),
              `card="${(line ?? cardText(rollMsg?.id)).slice(0, 260)}"`);
            clearTargets();
          }
          // d. Hold Person (Paralyzed) — not Countercharm's: nobody asked, the save folds as rolled
          await bard.deleteEmbeddedDocuments('ActiveEffect', bard.effects.filter(e => e.getFlag(MOD, 'mastery') === 'reaction').map(e => e.id)).catch(() => {});
          const card2 = await castAt('Hold Person', halflingToken);
          if (!card2) log.push('§42d skipped: no Hold Person save activity');
          else {
            faces([[1, 20]]);
            await halfling.rollSavingThrow({ ability: 'wis' }, { configure: false }, {});
            unrig();
            // soft: a wrong Countercharm ask withholds the fold, and the ok below names it (the popup)
            const entry2 = await until(() => card2.getFlag(MOD, 'saves')?.targets?.find(x => (x.uuid === halfling.uuid) && x.done) ?? null, { timeout: 10000, label: 'the Hold Person save folded as rolled' }).catch(() => null);
            const asked = popups().some(app => /Countercharm/.test(textOf(app.element)));
            ok('42d. a failed save against Paralyzed (Hold Person): no Countercharm popup, the failure folds as rolled',
              !asked && !!entry2 && (entry2.outcome === 'failed'), `asked=${asked} entry=${JSON.stringify(entry2 && { outcome: entry2.outcome, total: entry2.total })}`);
            clearTargets();
          }
        }
      } finally {
        await closeA1();
        await hgClose(/Countercharm/);
        if (countercharm) await unlend(bard, countercharm);
        if (lentSpells.length) await attacker.deleteEmbeddedDocuments('Item', lentSpells).catch(() => {});
        await bard.deleteEmbeddedDocuments('ActiveEffect', bard.effects.filter(e => e.getFlag(MOD, 'mastery') === 'reaction').map(e => e.id)).catch(() => {});
        for (const e of halfling.effects.filter(e => ['Charmed', 'Paralyzed'].includes(e.name))) await e.delete().catch(() => {});
        if (combat42) { await combat42.delete().catch(() => {}); created.combats = created.combats.filter(id => id !== combat42.id); }
        unrig();
        clearTargets();
      }
    });

    // ---- 54. Tandem Footwork: at the bard's Initiative, one d8 to every ally within 30 ft; the late roller gets it as its lands
    if (want(54)) await section(54, async () => {
      await closeA1();
      const tandem = await hgLend(bard, 'Tandem Footwork', 'feat');
      await refillInspiration();
      const [combat] = await Combat.createDocuments([{ scene: scene.id, active: true }]);
      created.combats.push(combat.id);
      const grants = () => b4Cards(suiteStart, 'initiativeGrant').filter(m => m.getFlag(MOD, 'initiativeGrant')?.row === 'Tandem Footwork');
      try {
        if (!tandem || !inspiration()) log.push(`§54 skipped: tandem=${!!tandem} inspiration=${!!inspiration()}`);
        else {
          await combat.createEmbeddedDocuments('Combatant', [
            { tokenId: KIT.bardDoc.id, sceneId: scene.id, actorId: bard.id },
            { tokenId: halflingToken.document.id, sceneId: scene.id, actorId: halfling.id },
            { tokenId: sorcererDoc.id, sceneId: scene.id, actorId: sorcerer.id },
            { tokenId: attackerToken.document.id, sceneId: scene.id, actorId: attacker.id }]);
          const cOf = actor => combat.combatants.find(c => c.actorId === actor.id);
          await combat.setInitiative(cOf(halfling).id, 12);
          await combat.setInitiative(cOf(attacker).id, 9);
          await combat.setInitiative(cOf(bard).id, 18);
          const card = await until(() => grants()[0] ?? null, { timeout: 8000, label: 'the Tandem Footwork card' });
          const pop = await until(() => titled(/^Tandem Footwork — /), { timeout: 6000, label: 'the Tandem Footwork popup' });
          ok('54a. the bard\'s Initiative lands: the popup "Tandem Footwork — give 1d8 to allies within 30 ft? · a use of Bardic Inspiration"',
            !!card && !!pop && /give .*d8 to allies within 30 ft\?/.test(textOf(pop?.element)), `card=${!!card} pop=${!!pop} text="${textOf(pop?.element).slice(0, 200)}"`);
          const biBefore = Number(inspiration()?.system?.uses?.spent ?? 0);
          faces([[5, 8]]);
          pop?.element?.querySelector('button[data-action="yes"]')?.click();
          // `applied` is written once the use is spent, the Initiatives moved and the late roller noted (initiative-grants.js giveToAllies)
          const done = await until(() => card?.getFlag(MOD, 'initiativeGrant')?.applied ? card.getFlag(MOD, 'initiativeGrant') : null, { timeout: 10000, label: 'the gift applied' });
          unrig();
          ok('54b. Yes: a 5 rolled once — the bard 18 → 23, the Halfling 12 → 17, the Attacker (a foe) untouched, the Sorcerer (unrolled) noted as due; a Bardic Inspiration use spent',
            (done?.rolled === 5) && (cOf(bard).initiative === 23) && (cOf(halfling).initiative === 17) && (cOf(attacker).initiative === 9)
              && (done?.due ?? []).includes(cOf(sorcerer).id) && (Number(inspiration()?.system?.uses?.spent) === biBefore + 1)
              && !!combat.getFlag(MOD, 'initiativeBonusDue')?.[cOf(sorcerer).id],
            `flag=${JSON.stringify(done && { rolled: done.rolled, given: done.given, due: done.due })} inits=${JSON.stringify(combat.combatants.map(c => [c.name, c.initiative]))} bi=${inspiration()?.system?.uses?.spent} noted=${JSON.stringify(combat.getFlag(MOD, 'initiativeBonusDue') ?? null)}`);
          // the card's line redrawn from the applied flag: "+N Initiative" (the pending line asks "give …?")
          await until(() => /\+\d+ Initiative/.test(cardText(card?.id)), { label: 'the Tandem Footwork card redrawn with the gift' });
          ok('54c. the card: "Tandem Footwork — +5 Initiative: … (1 still to roll)"', /\+5 Initiative/.test(await grantLine(card)) && /1 still to roll/.test(await grantLine(card)), `line="${await grantLine(card)}"`);
          // d. the late roller
          await combat.setInitiative(cOf(sorcerer).id, 10);
          await until(() => cOf(sorcerer).initiative === 15, { timeout: 8000, label: 'the Sorcerer\'s late Initiative with the gift' });
          ok('54d. the Sorcerer rolls later: 10 → 15 as its Initiative lands, the note cleared',
            (cOf(sorcerer).initiative === 15) && !combat.getFlag(MOD, 'initiativeBonusDue')?.[cOf(sorcerer).id],
            `init=${cOf(sorcerer).initiative} noted=${JSON.stringify(combat.getFlag(MOD, 'initiativeBonusDue') ?? null)}`);
        }
      } finally {
        await closeA1(); await hgClose(/^Tandem Footwork — /);
        if (game.combats.get(combat.id)) await combat.delete();
        if (tandem) await unlend(bard, tandem);
        await refillInspiration();
        unrig();
      }
    });

    // ---- 79. Peerless Skill: the Bardic die on the bard's own failed check
    if (want(79)) await section(79, async () => {
      await closeA1(); await refillInspiration();
      const peerless = await hgLend(bard, 'Peerless Skill', 'feat');
      try {
        if (!peerless || !inspiration()) log.push(`§79 skipped: peerless=${!!peerless} inspiration=${!!inspiration()}`);
        else {
          const before = spentBI();
          faces([[3, 20]]);
          const rolls = await bard.rollSkill({ skill: 'ath' }, { configure: false }, {});
          const m = rolls?.[0]?.parent ?? null;
          const flag = await until(() => m?.getFlag(MOD, 'd20fold') ?? null, { timeout: 4000, label: 'the failed check\'s fold offer' });
          const offer = (flag?.offers ?? []).find(o => o.label === 'Peerless Skill') ?? null;
          ok('79a. a failed Athletics check offers "Peerless Skill" — the Bardic die (the tactical fold on the feature\'s own activity)', !!offer && /d\d/.test(String(offer?.dieFormula ?? '')),
            `offers=${JSON.stringify((flag?.offers ?? []).map(o => o.label))} die=${offer?.dieFormula}`);
          const win = await until(() => rescueWindowC('Peerless Skill'), { timeout: 6000, label: 'the Peerless Skill rescue window' });
          faces([[6, 8], [6, 10], [6, 12]]);
          win?.querySelector('[data-bf-rescue-action="tactical:Peerless Skill"]')?.click();
          const done = await until(() => { const fl = m?.getFlag(MOD, 'd20fold'); return (fl?.spends?.some(s => (s.name === 'Peerless Skill') && !s.pendingVerdict) && Number.isFinite(fl.foldedTotal)) ? fl : null; }, { timeout: 10000, label: 'the Peerless Skill die folded' });
          unrig();
          ok('79b. accepted: the die added to the total, a Bardic Inspiration use spent', (done?.spends?.[0]?.name === 'Peerless Skill') && (done?.foldedTotal > done?.baseTotal) && (spentBI() === before + 1),
            `flag=${JSON.stringify(done && { spends: done.spends?.map(s => [s.name, s.die]), base: done.baseTotal, folded: done.foldedTotal })} spent ${before}→${spentBI()}`);
        }
      } finally {
        await closeA1();
        if (peerless) await unlend(bard, peerless);
        await refillInspiration();
        unrig(); clearTargets();
      }
    });

    // ---- 87. Battle Magic: Hew's reminder after an action-cast spell
    if (want(87)) await section(87, async () => {
      await closeA1();
      hgKeep(bard, { 'system.spells': foundry.utils.deepClone(bard.system._source.spells) });
      const bm = await hgLend(bard, 'Battle Magic', 'feat');
      const cure = await lendClassSpell(bard, 'Cure Wounds', 'bard');
      const bTok = bardTokC();
      try {
        if (!bm || !cure || !bTok) log.push(`§87 skipped: battleMagic=${!!bm} cure=${!!cure} token=${!!bTok}`);
        else {
          await bard.update({ 'system.spells.spell1.value': 4 });
          const since = Date.now();
          await castSpell(bard, bTok, cure, 1, halflingToken);
          const notice = await until(() => hewNotices(since, 'Battle Magic')[0] ?? null, { timeout: 8000, label: 'the Battle Magic notice' });
          ok('87a. Cure Wounds cast as an action: "Battle Magic — BTB Test Bard can attack again", the swing from the sheet', !!notice && /Battle Magic — BTB Test Bard can attack again/.test(cardText(notice?.id)),
            `notice=${!!notice} card="${cardText(notice?.id).slice(0, 160)}"`);
          await ackHew('Battle Magic');
        }
      } finally {
        await closeA1(); await ackHew('Battle Magic');
        for (const it of [cure, bm]) if (it) await unlend(bard, it);
        unrig(); clearTargets();
      }
    });

    // ---- 88. Leading Evasion: the bard's Evasion shared with the demand's other targets within 5 ft
    if (want(88)) await section(88, async () => {
      await closeA1(); await set('saveRolls', 'prompt');
      const le = await hgLend(bard, 'Leading Evasion', 'feat');
      const sorcHP = () => Number(sorcerer.system.attributes.hp.value);
      const sorcBefore = { value: sorcerer.system._source.attributes.hp.value, temp: sorcerer.system._source.attributes.hp.temp ?? 0 };
      let flameLent = null;
      let priorOnSave = null;
      let flameAct = null;
      try {
        if (!le) log.push('§88 skipped: no Leading Evasion in the PHB');
        else {
          // ⚠ The main row (y 2100) is OFF the 2000 x 2000 range: nobody moves there. The sorcerer (1800, 2100) already
          // stands 5 ft from the bard (1700, 2100): the demand on both, the sorcerer the one who fails.
          await sorcerer.update({ 'system.attributes.hp.value': sorcerer.system.attributes.hp.max, 'system.attributes.hp.temp': 0 });
          const sorcMax = sorcHP();
          let flameId = attacker.items.find(i => (i.name === 'Sacred Flame') && (i.type === 'spell'))?.id;
          if (!flameId) { flameLent = await hgLend(attacker, 'Sacred Flame', 'spell', { 'system.prepared': 1, 'system.method': 'atwill' }); flameId = flameLent?.id; }
          flameAct = attacker.items.get(flameId)?.system?.activities?.find(a => a.type === 'save');
          priorOnSave = flameAct?.damage?.onSave ?? null;
          await attacker.items.get(flameId).update({ [`system.activities.${flameAct.id}.damage.onSave`]: 'half' });   // a half-on-save demand, for the section
          flameAct = attacker.items.get(flameId)?.system?.activities?.get(flameAct.id);
          attackerToken.control({ releaseOthers: true });
          sorcTokC()?.setTarget(true, { releaseOthers: true });
          bardTokC()?.setTarget(true, { releaseOthers: false });
          faces([[4, 8]]);
          const use = await flameAct.use({ consume: { spellSlot: false } }, { configure: false }, {});
          const card = use?.message ?? null;
          await until(() => (card?.getFlag(MOD, 'saves')?.targets?.length ?? 0) >= 2, { timeout: 8000, label: 'the demand on the sorcerer and the bard' });
          // PROMPT mode: the demand opens each target's own roll dialog; a bare rollSavingThrow is a second, unlinked roll
          // (its card carries no respondsTo, the entry never folds). The sorcerer's dialog is the one rolled.
          const sorcDlg = () => [...foundry.applications.instances.values()].find(app => /RollConfigurationDialog/.test(app.constructor?.name ?? '') && app.rendered && app.element && /BTB Test Sorcerer/.test(textOf(app.element))) ?? null;
          const dlg = await until(sorcDlg, { timeout: 8000, label: 'the sorcerer\'s save dialog' });
          faces([[1, 20]]);
          (dlg?.element?.querySelector('button[data-action="normal"]') ?? dlg?.element?.querySelector('button[autofocus]') ?? dlg?.element?.querySelector('button[type="submit"]'))?.click();
          const entry = await until(() => card?.getFlag(MOD, 'saves')?.targets?.find(x => (x.uuid === sorcerer.uuid) && x.done) ?? null, { timeout: 12000, label: 'the sorcerer\'s save folded into the demand' });
          // the halved damage lands in one update
          await until(() => sorcHP() < sorcMax, { timeout: 8000, label: 'the halved damage on the sorcerer' });
          unrig();
          ok('88a. the sorcerer (5 ft from the bard, both targets of the same Dexterity demand) FAILS and takes HALF (4 → 2): the entry "Evasion — Leading Evasion (BTB Test Bard)"',
            (entry?.outcome === 'failed') && (entry?.evasion === true) && /Leading Evasion \(BTB Test Bard\)/.test(String(entry?.evasionBy ?? '')) && (sorcHP() === sorcMax - 2),
            `dlg=${!!dlg} entry=${JSON.stringify(entry && { outcome: entry.outcome, evasion: entry.evasion, by: entry.evasionBy })} hp=${sorcHP()} of ${sorcMax} targets=${JSON.stringify((card?.getFlag(MOD, 'saves')?.targets ?? []).map(t => [t.name, t.done, t.outcome]))}`);
          clearTargets();
        }
      } finally {
        await closeA1();
        if (flameAct && priorOnSave !== null) await flameAct.item?.update({ [`system.activities.${flameAct.id}.damage.onSave`]: priorOnSave }).catch(() => {});
        await sorcerer.update({ 'system.attributes.hp.value': sorcBefore.value, 'system.attributes.hp.temp': sorcBefore.temp });
        if (flameLent) await unlend(attacker, flameLent);
        if (le) await unlend(bard, le);
        await healFull();
        unrig(); clearTargets();
      }
    });

    // ---- 89. Unbreakable Majesty: the attacker's Charisma save inside the hold
    if (want(89)) await section(89, async () => {
      await closeA1(); await spendLuckC();
      const um = await hgLend(bard, 'Unbreakable Majesty', 'feat', { 'system.uses.max': '1', 'system.uses.spent': 0 });
      const bTok = bardTokC();
      hgKeep(bard, { 'system.attributes.ac.override': bard.system._source.attributes.ac.override ?? null, 'system.attributes.hp.value': bard.system._source.attributes.hp.value, 'system.attributes.hp.max': bard.system._source.attributes.hp.max });
      const bhp = () => Number(bard.system.attributes.hp.value);
      let combat89 = null;
      try {
        if (!um || !bTok) log.push(`§89 skipped: majesty=${!!um} token=${!!bTok}`);
        else {
          await bard.update({ 'system.attributes.ac.override': AC, 'system.attributes.hp.max': 400, 'system.attributes.hp.value': 400 });
          await useFeature(bTok, um, 'Assume Majestic Presence');
          const presence = await until(() => fxNamed(bard, ['Majestic Presence'])[0] ?? null, { timeout: 6000, label: 'the Majestic Presence on the bard' });
          [combat89] = await Combat.createDocuments([{ scene: scene.id, active: true }]);
          created.combats.push(combat89.id);
          await combat89.createEmbeddedDocuments('Combatant', [
            { tokenId: attackerToken.document.id, sceneId: scene.id, actorId: attacker.id, initiative: 20 },
            { tokenId: KIT.bardDoc.id, sceneId: scene.id, actorId: bard.id, initiative: 10 }]);
          await combat89.startCombat();
          // the once-per-turn stamp is keyed to the running combat's turn
          await until(() => combat89.started && (game.combat?.id === combat89.id), { label: 'the combat started and running' });
          // the attack (d20 12 hits AC), the damage dice, then the attacker's Charisma save: a 1 — it fails
          attackerToken.control({ releaseOthers: true });
          bTok.setTarget(true, { releaseOthers: true });
          faces([[12, 20], [3, 6], [3, 6], [1, 20]]);
          const usage = await act().use({ subsequentActions: false }, { configure: false }, {});
          const rolls = await act().rollAttack({}, { configure: false }, usage?.message?.id ? { data: { 'system.origin': usage.message.id } } : {});
          const msg = rolls?.[0]?.parent ?? null;
          // soft: the ok's detail reads the hold's live state (status, targets) for the hold that never resolves
          // the save, its message and the recoil stamp are all written before the resolved hold (hold/continue.js rollDuplicates)
          const h = await until(() => (holdOf(msg)?.status === 'resolved') ? holdOf(msg) : null, { timeout: 15000, label: 'the Majestic hit\'s hold resolved' }).catch(() => null);
          // A window: the held damage is released with the verdict, and an absorbed hit lands none.
          const stray = await watch(() => bhp() !== 400, { ms: 800 });
          unrig();
          const t = h?.targets?.find(x => x.uuid === bard.uuid);
          const saveMsg = game.messages.contents.find(m => m.getFlag(MOD, 'duplicatesSave')?.defenderUuid === bard.uuid) ?? null;
          ok('89a. the hit inside the Majestic Presence: the attacker\'s Charisma save rolled by the machine (a 1 — failed), the verdict ABSORBED, no damage to the bard, the effect stamped for this attacker\'s turn',
            !!presence && (t?.verdict === 'absorbed') && (t?.duplicates?.save?.total !== null) && (t?.duplicates?.absorbed === true) && (bhp() === 400) && !stray && !!saveMsg
              && !!bard.effects.get(presence.id)?.getFlag(MOD, 'recoiled')?.[attacker.uuid.replaceAll('.', '|')],   // the key: the uuid with its dots folded
            `verdict=${t?.verdict} dup=${JSON.stringify(t?.duplicates ?? null)} hp=${bhp()} stray=${!!stray} save=${!!saveMsg} recoiled=${JSON.stringify(bard.effects.get(presence.id)?.getFlag(MOD, 'recoiled') ?? null)} presence=${JSON.stringify(presence && { name: presence.name, origin: presence.origin, active: presence.active })} umActs=${JSON.stringify([...(um.system.activities ?? [])].map(a => [a.name, a.type, a.save?.dc?.value ?? null, a.save?.dc?.calculation ?? null, [...(a.save?.ability ?? [])]]))} hold=${JSON.stringify(holdOf(msg) && { status: holdOf(msg).status, targets: holdOf(msg).targets?.map(x => [x.name, x.verdict, x.reaction ?? null, !!x.duplicates]) })} combat=${game.combat?.started} msg=${msg?.id ?? null}`);
          // the second hit this turn: no save, the hit stands
          faces([[12, 20], [3, 6], [3, 6]]);
          const usage2 = await act().use({ subsequentActions: false }, { configure: false }, {});
          const rolls2 = await act().rollAttack({}, { configure: false }, usage2?.message?.id ? { data: { 'system.origin': usage2.message.id } } : {});
          const msg2 = rolls2?.[0]?.parent ?? null;
          // the receipt is written after the damage is applied (auto-apply.js applyDamagesWithReceipt)
          await until(() => damageFor(msg2?.id)?.getFlag(MOD, 'receipt'), { timeout: 12000, label: 'the second hit\'s damage receipt' });
          unrig();
          const t2 = holdOf(msg2)?.targets?.find(x => x.uuid === bard.uuid) ?? null;
          ok('89b. the second hit that turn: once per turn per attacker — no save, the hit lands', !t2?.duplicates?.save && (bhp() < 400), `hold=${JSON.stringify(t2 && { verdict: t2.verdict, dup: t2.duplicates })} hp=${bhp()}`);
        }
      } finally {
        await closeA1();
        if (combat89 && game.combats.get(combat89.id)) await combat89.delete();
        await dropFx(bard, ['Majestic Presence']);
        if (um) await unlend(bard, um);
        unrig(); clearTargets();
      }
    });

    // ---- 93. Superior Inspiration: Bardic Inspiration back up to two at Initiative
    if (want(93)) await section(93, async () => {
      await closeA1();
      const sup = await hgLend(bard, 'Superior Inspiration', 'feat');
      const bi = inspiration();
      let combat = null;
      try {
        if (!sup || !bi) log.push(`§93 skipped: superior=${!!sup} inspiration=${!!bi}`);
        else {
          await bi.update({ 'system.uses.spent': Number(bi.system.uses.max) });   // every use spent
          const t0 = Date.now();
          combat = await d1Combat([[KIT.bardDoc, bard, null]]);
          const bC = combat.combatants.find(c => c.actorId === bard.id);
          await combat.setInitiative(bC.id, 14);
          // `applied` is written once the uses are back (initiative-grants.js landGrant)
          const card = await until(() => grantCards(bard, 'Superior Inspiration').find(m => (m.timestamp >= t0) && m.getFlag(MOD, 'initiativeGrant')?.applied) ?? null, { timeout: 8000, label: 'the Superior Inspiration grant applied' });
          const value = Number(inspiration()?.system?.uses?.value ?? NaN);
          ok('93a. at Initiative with no Bardic Inspiration left: "Superior Inspiration — Bardic Inspiration uses back up to 2", the uses at 2, nothing asked',
            !!card && (value === 2) && /Superior Inspiration/.test(await grantLine(card)), `card=${!!card} value=${value} line="${await grantLine(card)}"`);
        }
      } finally {
        await closeA1();
        if (combat && game.combats.get(combat.id)) await combat.delete();
        if (sup) await unlend(bard, sup);
        await refillInspiration();
        unrig(); clearTargets();
      }
    });
    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  }
} });

await finish({ tag: 'class-bard', out, plan, f });
