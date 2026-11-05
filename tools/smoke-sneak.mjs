// By the Books Sneak Attack smoke test: the tick at the gate, the Cunning Strike menu on the damage
// offer, costs off the dice before the roll, the crit doubling what is left, effects through the
// saves machine on the pack's own activities, once per turn as a turn chit. Fixture: the built
// rogue (tools/fixture-suite.mjs).
// Harness discipline: settings restored; messages, added items, placed tokens and the combat
// removed; chits and conditions cleared. Sections: `--section 3`, `--section 1,7`, `--list`.
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from './harness.mjs';

// The coverage map (tools/coverage-map.mjs parses this; `npm run coverage` checks it both ways).
// ⚠ NEVER import a suite: it connects on evaluation.
export const COVERS = [
  'sneak.js',               // the box, the menu, the dice, the crit, the chit
  'reminders.js',           // §1 / §11 — the Sneak Attack box under the gate's sources
  'use-chips.js',           // §10 — Steady Aim written as a chip on use; §12 — the Poisoner's Poison Coating (COATINGS)
  'saves/index.js',         // §4 / §7 / §8 — the Cunning Strike effects through the saves machine
  'saves/demand.js',
  'saves/ask.js',
  'saves/verdict.js',
  'saves/consequences.js',
  'chip-spend.js',           // Steady Aim and the Cunning Strike chips are spent on the hit — chipSpend ×10
  'clock-riders.js'          // the Rogue fixture's clock riders fire beside the sneak dice — clockRiders ×2 (the same reading)
];

const SECTIONS = {
  1: 'the gate: the Sneak Attack box under the sources, ticked on Advantage, the record on the card',
  2: 'the weapon and the list are the switch: a longsword offers nothing, and so does a list without sneak',
  3: 'the damage offer opens under AUTO damage, the menu is read off the sheet, the pick stays legal',
  4: 'the dice ride the roll minus the costs, the Trip effect lands through the saves machine',
  5: 'a critical hit doubles what is left',
  6: 'once per turn: the chit, the greyed box, and the next turn',
  7: 'Envenom Weapons: the upgraded Poison — its damage, and Poisoned on top',
  8: 'Death Strike: round one, the Con save, the damage again',
  9: 'the registration FIRED (§11): preRollDamage moved',
  10: 'Steady Aim (a use chip): the use writes the chip, the gate reads it as Advantage, the roll spends it',
  11: 'the ally clause off the map (2026-09-22): an ally beside the target ticks the box at Normal; none, or Disadvantage, does not',
  12: 'the Poison Coating (the PHB feats walk, 2026-09-26 — a rule of cool): Apply Poison writes the chip on the rogue (60 s, the dagger icon), a dose spent, the card, no enchantment card; no dose left writes nothing; a MISS leaves the chip; a HIT spends it — the feat\'s own save at the victim, a failure deals 2d8 poison NOT halved by Poison Resistance (Potent Poison) and presses Poisoned until the end of the rogue\'s next turn (sourceEnd)'
};
const DEPENDS = { 4: ['3'], 9: ['4'] };

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'sneak', watchdogMs: 720_000 });
announcePlan('sneak', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, watch, canvasReady, tokenOn, snapshotSettings, faces, unrig } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const suiteStart = Date.now();
  // Every moment payload published during the run (plain facts: uuids, never documents).
  const moments = [];
  const momentHookId = Hooks.on('bythebooks.moment', p => moments.push(p));
  const momentsOf = (event, since = 0) => moments.filter(p => (p.event === event) && (p.at >= since));
  const plain = p => { try { return JSON.stringify(p) === JSON.stringify(JSON.parse(JSON.stringify(p))); } catch { return false; } };
  const errors = [];
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...args) => { errors.push('E ' + args.map(a => (a instanceof Error) ? a.message : String(a)).join(' ').slice(0, 300)); origError(...args); };
  console.warn = (...args) => { errors.push('W ' + args.map(a => (a instanceof Error) ? a.message : String(a)).join(' ').slice(0, 300)); origWarn(...args); };
  const ledger = globalThis.__bfHookLedger ?? null;
  const count = name => ledger?.[name] ?? 0;

  const mod = game.modules.get(MOD);
  if (!mod?.active) return { fatal: `module active=${mod?.active}` };
  if (!game.settings.settings.has(`${MOD}.decisionTimer`)) return { fatal: 'decisionTimer not registered — OLD code (F5)' };

  const SETTING_KEYS = ['autoDamage', 'autoApply', 'playerRollDamage', 'damageTimer', 'dramaticBeat', 'requireTarget',
    'reactionHold', 'riders', 'effectRiders', 'masteryRiders', 'masteryAsk', 'saves', 'saveTimer', 'castApply',
    'concMode', 'reminderList', 'conditionList', 'effectList', 'fightingStyleList'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { prior, set } = settings;

  const scene = game.scenes.getName('By the Books Test Range');
  const victim = game.actors.getName('BTB Test Victim');
  const rogue = game.actors.getName('BTB Test Rogue');
  if (!scene || !victim || !rogue) return { fatal: 'missing fixture: scene, BTB Test Victim or BTB Test Rogue — run tools/fixture-suite.mjs' };

  const created = { items: [], tokens: [] };
  const priorActor = {};
  let combat = null;
  let restored = false;
  const STATUSES = ['prone', 'poisoned', 'unconscious', 'blinded'];
  const clearChips = async () => {
    for (const a of [victim, rogue]) {
      const chips = a.effects.filter(e => e.getFlag(MOD, 'mastery') || /^(Cunning Strike|Devious Strikes|Sneak Attack|Vexed|Sapped|Steady Aim)/.test(e.name)
        || STATUSES.some(s => e.statuses?.has?.(s)));
      // Tolerant: a deleted combat tidies its chits at the same moment, and deleting a gone id throws.
      const live = chips.map(e => e.id).filter(id => a.effects.get(id));
      if (live.length) await a.deleteEmbeddedDocuments('ActiveEffect', live).catch(() => {});
    }
  };
  const closeDialogs = async () => {
    for (const app of foundry.applications.instances.values()) {
      const ours = app.element?.querySelector?.('[data-bf-reminder], [data-bf-save-demand], [data-bf-cunning]')
        || /RollConfigurationDialog/.test(app.constructor?.name ?? '')
        || (app.element?.innerHTML ?? '').includes('Damage — your roll');
      if (ours) { try { await app.close(); } catch { /* gone */ } }
    }
  };
  const teardown = async () => {
    if (restored) return;
    restored = true;
    console.error = origError;
    console.warn = origWarn;
    for (const e of errors) log.push('console: ' + e);
    unrig();
    for (const failed of await settings.restore()) log.push(`TEARDOWN settings ERROR: ${failed}`);
    try {
      await closeDialogs();
      await clearChips();
      for (const [actorId, ids] of Object.entries(created.items.reduce((m, i) => { (m[i.actorId] ??= []).push(i.id); return m; }, {}))) {
        const a = game.actors.get(actorId);
        const live = ids.filter(id => a?.items.get(id));
        if (live.length) await a.deleteEmbeddedDocuments('Item', live);
      }
      try { if (combat && game.combats.get(combat.id)) await combat.delete(); } catch { /* gone */ }
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

  try {
    await set('autoDamage', 'all');
    await set('autoApply', true);
    await set('playerRollDamage', false);   // AUTO damage: the offer must open for an armed sneak anyway
    await set('damageTimer', 0);            // the offer waits for a press — this suite presses
    await set('dramaticBeat', 0);
    await set('requireTarget', false);
    await set('reactionHold', false);
    await set('riders', false);
    await set('effectRiders', false);
    await set('masteryRiders', false);
    await set('masteryAsk', false);
    await set('saves', true);
    await set('saveTimer', 0);
    await set('castApply', false);
    await set('concMode', 'off');
    await set('reminderList', 'vex, sap, prone, condition, range, effect, sneak');
    await set('conditionList', prior.conditionList || 'blinded, invisible, hiding, paralyzed, petrified, poisoned, restrained, stunned, unconscious, frightened, grappled, incapacitated, dodging, charmed');

    // -------------------------------------------------- fixtures
    if (canvas.scene?.id !== scene.id) await scene.view();
    await canvasReady();
    const strays = scene.tokens.filter(t => [victim.id, rogue.id].includes(t.actorId)).map(t => t.id);
    if (strays.length) await scene.deleteEmbeddedDocuments('Token', strays);
    const placeToken = async (actor, x, y) => {
      const [doc] = await scene.createEmbeddedDocuments('Token', [
        foundry.utils.mergeObject(actor.prototypeToken.toObject(), { x, y, actorId: actor.id, actorLink: true }, { inplace: false })]);
      created.tokens.push(doc.id);
      await tokenOn(doc.id);
      const token = canvas.tokens.get(doc.id);
      if (!token) throw new Error(`${actor.name}'s token never reached the canvas`);
      return { doc, token };
    };
    const { doc: victimDoc, token: victimToken } = await placeToken(victim, 1400, 1600);
    const { doc: rogueDoc, token: rogueToken } = await placeToken(rogue, 1500, 1600);
    rogueToken.control({ releaseOthers: true });

    priorActor[victim.id] = {
      'system.attributes.ac.override': victim.system._source.attributes.ac.override ?? null,
      'system.abilities.dex.save.roll.bonus': victim.system._source.abilities?.dex?.save?.roll?.bonus ?? '',
      'system.abilities.con.save.roll.bonus': victim.system._source.abilities?.con?.save?.roll?.bonus ?? '',
      'system.attributes.hp.value': victim.system._source.attributes.hp.value,
      'system.attributes.hp.max': victim.system._source.attributes.hp.max
    };
    // ⚠ A deep pool: 7d6 kills an 11-HP goblin, and the saves machine refuses a demand on the dead.
    await victim.update({ 'system.attributes.ac.override': 1,
      'system.attributes.hp.max': 400, 'system.attributes.hp.value': 400,
      'system.abilities.dex.save.roll.bonus': '-30', 'system.abilities.con.save.roll.bonus': '-30' });
    const healFull = async () => {
      await victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max, 'system.attributes.hp.temp': 0 });
      const down = victim.effects.filter(e => ['dead', 'unconscious'].some(s => e.statuses?.has?.(s)));
      if (down.length) await victim.deleteEmbeddedDocuments('ActiveEffect', down.map(e => e.id)).catch(() => {});
    };
    const weapon = name => rogue.items.find(i => (i.type === 'weapon') && (i.name === name));
    const rapier = weapon('Rapier');
    const longsword = weapon('Longsword');
    if (!rapier || !longsword) return { fatal: 'the rogue fixture lacks its Rapier or Longsword — re-run fixture-suite' };
    const attackOf = item => item.system.activities.find(a => a.type === 'attack');

    // -------------------------------------------------- helpers
    const face = (n, of = 20) => faces([[n, of]]);
    const target = token => token.setTarget(true, { releaseOthers: true });
    const targeted = token => until(() => game.user.targets.has(token), { timeout: 2000, label: `${token.name} targeted` });
    const lastAttack = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && (m.type === 'attack')).pop() ?? null;
    const waitAttackAfter = async id => until(() => { const m = lastAttack(); return (m && (m.id !== id)) ? m : null; }, { timeout: 8000 });
    const rollDialog = () => [...foundry.applications.instances.values()]
      .find(app => /RollConfigurationDialog/.test(app.constructor?.name ?? '') && app.rendered && app.element) ?? null;
    // The NEWEST open offer: a stale one left open (a 0 s Decision Timer waits for a press) must never stand in.
    const offerEl = () => [...foundry.applications.instances.values()].filter(a => a.rendered).map(a => a.element)
      .filter(el => (el?.innerHTML ?? '').includes('Damage — your roll')).pop() ?? null;
    const saveDialogEl = () => [...foundry.applications.instances.values()]
      .filter(app => app.rendered && app.element?.querySelector?.('[data-bf-save-demand]')).map(app => app.element)[0] ?? null;
    const damageFor = originId => game.messages.contents.find(m => (m.type === 'damage')
      && (m._source.system?.origin === originId));
    /** Open the gate for a swing with `item`, the sheet/use shape (dialog allowed). */
    const openGate = async (item, { d20 = 19 } = {}) => {
      await healFull();
      target(victimToken);
      await targeted(victimToken);
      const act = attackOf(item);
      const results = await act.use({ subsequentActions: false }, { configure: false }, {});
      const usageId = results?.message?.id ?? null;
      const before = lastAttack()?.id ?? null;
      face(d20);
      void act.rollAttack({}, {}, usageId ? { data: { 'system.origin': usageId } } : {});
      // Soft: a caller reads a missing dialog as its own finding (§2's `dialog=`, §6's `if (d3)`).
      const dialog = await until(rollDialog, { timeout: 6000, label: 'the attack roll dialog' }).catch(() => null);
      // The section rides the render hook: the gate is set at preRoll, and the fieldset is drawn at
      // render only when it has sources or a Sneak Attack (a bare dialog, §2's shape, has none).
      await until(() => {
        const g = dialog?.options?.bfReminder;
        return !dialog || !g || !((g.sources?.length > 0) || g.sneak) || dialog.element?.querySelector('[data-bf-reminder]');
      }, { label: 'the gate drawn in the roll dialog' });
      return { dialog, usageId, before };
    };
    const press = (dlg, mode) => { const b = dlg?.element?.querySelector(`button[data-action="${mode}"]`); b?.click(); return !!b; };
    const boxOf = dlg => dlg?.element?.querySelector('[data-bf-sneak]') ?? null;
    const tickOf = dlg => dlg?.element?.querySelector('input[name="bf-sneak"]') ?? null;
    const textOf = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    /** Swing, arm as the box stands (or force the tick), press the mode, return the attack message. */
    const armedSwing = async (item, { mode = 'advantage', tick = null, d20 = 19 } = {}) => {
      const { dialog, usageId, before } = await openGate(item, { d20 });
      const box = tickOf(dialog);
      if (box && (tick !== null) && (box.checked !== tick)) box.click();
      // Read everything off the dialog here: its element is gone once it closes.
      const seen = { boxText: textOf(boxOf(dialog)), boxInDetails: !!boxOf(dialog)?.closest('details'), hasTick: !!box,
        ticked: !!box?.checked, sectionText: textOf(dialog?.element?.querySelector('[data-bf-reminder]')) };
      press(dialog, mode);
      const msg = await waitAttackAfter(before);
      return { dialog, usageId, msg, seen, originId: msg?._source.system?.origin ?? msg?.id };
    };
    const ensureVexed = async () => {
      // Vex the victim with the rapier (its mastery): a programmatic hit, no dialog.
      const act = attackOf(rapier);
      await rapier.update({ 'system.mastery': 'vex' });
      await healFull();
      target(victimToken);
      face(19);
      const results = await act.use({ subsequentActions: false }, { configure: false }, {});
      const rolls = await act.rollAttack({}, { configure: false }, results?.message?.id ? { data: { 'system.origin': results.message.id } } : {});
      const attackMsg = rolls?.[0]?.parent ?? null;
      const originId = attackMsg?._source.system?.origin ?? attackMsg?.id;
      await until(() => damageFor(originId)?.getFlag(MOD, 'receipt'), { timeout: 10000 });
      // ⚠ masteryRiders is OFF: press Vexed by hand (the gate reads the chip, not who wrote it).
      const [vexed] = await victim.createEmbeddedDocuments('ActiveEffect', [{
        name: 'Vexed', img: 'icons/svg/eye.svg', origin: rapier.uuid, transfer: false,
        // ⚠ No clock: out of combat a one-round window reads DEAD (decide/chips.js chipIsDead).
        flags: { [MOD]: { mastery: 'vex' } }
      }]);
      return vexed;
    };
    const answerSave = async () => {
      const el = await until(saveDialogEl, { timeout: 8000, label: 'the save dialog' });
      el?.querySelector('button[data-action="normal"]')?.click();
      return !!el;
    };
    const cardsWith = flagKey => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, flagKey));

    // ================================================== 1. the gate
    if (want(1)) await section(1, async () => {
      await clearChips();
      const vexed = await ensureVexed();
      ok('1. (setup) the victim is Vexed by the rogue', !!vexed, `vexed=${!!vexed}`);
      const { msg, seen } = await armedSwing(rapier, { mode: 'advantage' });
      const text = seen.boxText;
      ok('1a. the gate carries the Sneak Attack box under the sources: the name and the dice, the rule under its fold — no read-for-you line (user, 2026-09-02)',
        !!text && /Sneak Attack — 7d6/.test(text) && /Once per turn, you can deal an extra/.test(text)
          && !/Read for you/.test(text) && !/on a hit, once per turn/.test(text),
        text.slice(0, 260));
      ok("1b. the box is OUTSIDE the fold — visible without a click, and ticked by the roll's Advantage", !!text && !seen.boxInDetails && seen.ticked,
        `inDetails=${seen.boxInDetails} ticked=${seen.ticked} section="${seen.sectionText.slice(0, 120)}"`);
      const s = msg?.getFlag(MOD, 'sneak');
      ok('1c. Advantage ticks it by default; the press records the arm on the attack message — dice, type, weapon',
        !!s && (s.armed === true) && (s.dice === '7d6') && (s.number === 7) && (s.faces === 6) && (s.type === 'piercing')
          && (s.weaponName === 'Rapier') && (s.mode === 'advantage') && ('combat' in s) && (s.sourceUuid === rogue.uuid),
        JSON.stringify(s));
      const cardText = await until(() => { const t = textOf(document.querySelector(`.message[data-message-id="${msg?.id}"]`)); return /Sneak Attack armed/.test(t) ? t : null; }, { timeout: 4000 });
      ok('1d. the attack card says it: Sneak Attack armed — 7d6 on the hit', /Sneak Attack armed — 7d6 on the hit, once per turn/.test(cardText ?? ''), (cardText ?? '').slice(0, 200));
      // the offer opened (auto damage): dismiss it to roll and let the chain land before §2
      const offer = await until(offerEl, { timeout: 6000 });
      offer?.querySelector('button[data-action="roll"]')?.click();
      await until(() => damageFor(msg?._source.system?.origin ?? msg?.id)?.getFlag(MOD, 'receipt'), { timeout: 10000 });
      // The pressed offer closes before §2 opens its gate.
      await until(() => !offerEl(), { timeout: 4000, label: '§1\'s damage offer closed' });
    });

    // ================================================== 2. the switches
    if (want(2)) await section(2, async () => {
      await clearChips();
      // 2a: a longsword (neither Finesse nor ranged) offers no box; with no other source the dialog is not forced.
      const { dialog: d2a, before: b2a } = await openGate(longsword);
      const noBox = !boxOf(d2a);
      ok('2a. a longsword offers no Sneak Attack — no box', !!d2a && noBox, `dialog=${!!d2a} box=${!noBox}`);
      let a2a = null;
      if (d2a) { press(d2a, 'normal'); a2a = await waitAttackAfter(b2a); }
      // The longsword's chain lands (its damage receipt) before §3 swings.
      const o2a = a2a?._source.system?.origin ?? a2a?.id ?? null;
      await until(() => (o2a ? damageFor(o2a)?.getFlag(MOD, 'receipt') : cardsWith('receipt').length),
        { timeout: 8000, label: 'the longsword\'s damage receipt' });
      // (2b retired: the Reminder Sources list is gone — the table is the only list, Sneak Attack always offered.
      //  Its armed rapier swing left an unanswered offer open under a 0 s Decision Timer, which every later
      //  section then read and pressed in place of its own.)
    });

    // ================================================== 3. the offer and the menu
    let msg3 = null;
    let originId3 = null;
    if (want(3)) await section(3, async () => {
      await clearChips();
      await ensureVexed();
      const { msg } = await armedSwing(rapier, { mode: 'advantage', tick: true });
      msg3 = msg;
      originId3 = msg?._source.system?.origin ?? msg?.id;
      const offer = await until(offerEl, { timeout: 6000 });
      const menu = offer?.querySelector('[data-bf-cunning]');
      const rows = [...(menu?.querySelectorAll('[data-bf-cunning-row]') ?? [])].map(r => r.dataset.bfCunningRow);
      ok('3a. an armed Sneak Attack opens the damage offer under AUTO damage, and the offer carries the Cunning Strike menu',
        !!offer && !!menu, `offer=${!!offer} menu=${!!menu}`);
      ok('3b. the menu is READ OFF THE SHEET: Cunning Strike, Devious Strikes, and the Thief\'s Stealth Attack; up to two; DC 17',
        (rows.join() === 'poison,trip,withdraw,daze,knockOut,obscure,stealthAttack') && /up to 2/.test(textOf(menu)) && /DC 17/.test(textOf(menu)),   // "dice · DC · up to N"
        `rows=[${rows.join()}] text="${textOf(menu).slice(0, 160)}"`);
      const box = key => offer?.querySelector(`input[name="bf-cunning"][value="${key}"]`);
      const button = () => offer?.querySelector('button[data-action="roll"]');
      box('knockOut')?.click();
      const afterKnockOut = textOf(button());
      box('poison')?.click();
      const afterBoth = textOf(button());
      box('trip')?.click();   // a third pick: the OLDEST (Knock Out) gives way
      ok('3c. the button names the formula the pick leaves: Knock Out → 1d6; Knock Out + Poison → every die forgone',
        /Sneak Attack 1d6/.test(afterKnockOut) && /every Sneak Attack die forgone/.test(afterBoth),
        `knockOut="${afterKnockOut}" both="${afterBoth}"`);
      ok('3d. the pick stays legal: a third tick drops the oldest (Knock Out), leaving Poison + Trip',
        !box('knockOut')?.checked && !!box('poison')?.checked && !!box('trip')?.checked && /Sneak Attack 5d6/.test(textOf(button())),
        `knockOut=${box('knockOut')?.checked} poison=${box('poison')?.checked} trip=${box('trip')?.checked} button="${textOf(button())}"`);
      // settle on Trip alone for §4
      box('poison')?.click();
      ok('3e. …and untick Poison: Trip alone, 6d6 left', !box('poison')?.checked && /Sneak Attack 6d6/.test(textOf(button())), textOf(button()));
      button()?.click();
    });

    // ================================================== 4. the dice and the Trip
    if (want(4)) await section(4, async () => {
      const dmg = await until(() => { const d = damageFor(originId3); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
      const sd = dmg?.getFlag(MOD, 'sneakDamage');
      const formulas = (dmg?.rolls ?? []).map(r => String(r.formula ?? '').replace(/\[[^\]]*\]/g, ''));   // the dice; the part is named "6d6[Sneak Attack]"
      ok('4a. the sneak dice ride the weapon\'s damage roll as their own part — 6d6 piercing after Trip\'s 1d6',
        !!dmg && formulas.some(f => /^6d6$/.test(f)) && (dmg.rolls.find(r => /^6d6$/.test(String(r.formula ?? '').replace(/\[[^\]]*\]/g, '')))?.options?.type === 'piercing') && dmg.rolls.some(r => r.formula === '6d6[Sneak Attack]'),
        `formulas=[${formulas.join(' | ')}] types=[${(dmg?.rolls ?? []).map(r => r.options?.type).join()}]`);
      ok('4b. the damage message records it: formula 6d6, cost 1, Trip, DC 17 — and the attack message is marked rolled',
        !!sd && (sd.formula === '6d6') && (sd.cost === 1) && (sd.cunning?.[0]?.key === 'trip') && (sd.dc === 17)
          && (game.messages.get(msg3?.id)?.getFlag(MOD, 'sneak')?.rolled === true),
        JSON.stringify(sd));
      const receipt = dmg?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === victim.uuid);
      const total = (dmg?.rolls ?? []).reduce((n, r) => n + (r.total ?? 0), 0);
      ok('4c. one roll, one receipt: the victim took the weapon and the sneak dice together',
        !!receipt && (receipt.taken === total) && (total > 6), `taken=${receipt?.taken} total=${total}`);
      const cardText = await until(() => { const t = textOf(document.querySelector(`.message[data-message-id="${dmg?.id}"]`)); return /rode this roll/.test(t) ? t : null; }, { timeout: 4000 });
      ok('4d. the damage card says what rode and what was forgone', /6d6 rode this roll/.test(cardText ?? '') && /1d forgone for Trip/.test(cardText ?? ''), (cardText ?? '').slice(0, 200));
      // the Trip: a save demand on the Cunning Strike item's own activity
      const tripCard = await until(() => cardsWith('cunning').find(m => m.getFlag(MOD, 'cunning')?.key === 'trip' && m.getFlag(MOD, 'saves')), { timeout: 10000 });
      const saves = tripCard?.getFlag(MOD, 'saves');
      ok('4e. the Trip effect goes through the saves machine: the demand on Cunning Strike\'s own Trip activity, Dex save DC 17, at the victim',
        !!tripCard && (saves?.abilities?.join() === 'dex') && (saves?.dc === 17) && (saves?.targets?.[0]?.uuid === victim.uuid)
          && (tripCard.getFlag(MOD, 'cunning')?.attackId === msg3?.id),
        `card=${!!tripCard} abilities=${saves?.abilities?.join()} dc=${saves?.dc} target=${saves?.targets?.[0]?.name}`);
      const answered = await answerSave();
      await until(() => tripCard?.getFlag(MOD, 'saves')?.targets?.every(t => t.done && t.applied), { timeout: 15000 });
      const entry = tripCard?.getFlag(MOD, 'saves')?.targets?.[0];
      const er = tripCard?.getFlag(MOD, 'effectReceipt')?.targets?.find(t => t.uuid === victim.uuid);
      ok('4f. the victim fails (-30) and lands Prone through the pack\'s own effect, receipted on the demand card',
        answered && (entry?.outcome === 'failed') && victim.statuses?.has?.('prone') && !!er?.effects?.some(e => /Tripped/.test(e.name)),
        `answered=${answered} outcome=${entry?.outcome} prone=${victim.statuses?.has?.('prone')} receipt=${JSON.stringify(er?.effects?.map(e => e.name))}`);
      // One `sneak` event on the damage message, plain, with the picks.
      const ev = momentsOf('sneak').filter(p => p.messageId === dmg?.id);
      const p = ev[0];
      ok('4g. the resolve was PUBLISHED once: bythebooks.moment "sneak" — the rogue, Sneak Attack, the damage message, the attack, the victim as a hit target, the formula and the Trip pick; plain and frozen',
        (ev.length === 1) && !!p && (p.actorUuid === rogue.uuid) && (p.itemName === 'Sneak Attack') && (p.attackId === msg3?.id)
          && (p.targets?.[0]?.actorUuid === victim.uuid) && (p.targets?.[0]?.hit === true) && !!p.targets?.[0]?.tokenUuid
          && (p.details?.formula === '6d6') && (p.details?.picks?.join() === 'trip') && (p.spend === null) && Object.isFrozen(p) && plain(p),
        `events=${ev.length} payload=${JSON.stringify(p)}`);
      const fxs = game.modules.get('fvtt-mod-fxstudio')?.active ? game.modules.get('fvtt-mod-fxstudio').api : null;
      if (fxs?.ledger) { const fe = fxs.ledger.find(x => x.id === `${dmg?.id}:sneak`); log.push(`FX Studio (observed, not asserted): ${fe ? `${fe.played ? 'PLAYED' : 'did not play'} ${fe.fx ?? '(no fx)'} on "${fe.when}" via ${fe.key ?? '-'}${fe.why ? ` — ${fe.why}` : ''}` : 'no ledger entry for the published moment'}`); }
      await clearChips();
    });

    // ================================================== 5. the crit
    if (want(5)) await section(5, async () => {
      await clearChips();
      await ensureVexed();
      const { msg } = await armedSwing(rapier, { mode: 'advantage', tick: true, d20: 20 });
      const originId = msg?._source.system?.origin ?? msg?.id;
      ok('5. (setup) the forced 20 crit', msg?.rolls?.[0]?.isCritical === true, `crit=${msg?.rolls?.[0]?.isCritical}`);
      const offer = await until(offerEl, { timeout: 6000 });
      offer?.querySelector('input[name="bf-cunning"][value="knockOut"]')?.click();
      offer?.querySelector('button[data-action="roll"]')?.click();
      const dmg = await until(() => { const d = damageFor(originId); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
      const sneakRoll = (dmg?.rolls ?? []).find(r => r.dice.some(d => d.faces === 6));
      const sixes = sneakRoll?.dice?.filter(d => d.faces === 6).reduce((n, d) => n + d.number, 0) ?? 0;
      ok('5a. Knock Out forgoes six dice; the crit doubles the ONE that is left — two d6 rolled, not fourteen',
        !!sneakRoll && (sixes === 2) && (dmg?.getFlag(MOD, 'sneakDamage')?.formula === '1d6') && dmg?.rolls?.[0]?.isCritical,
        `sixes=${sixes} formula=${dmg?.getFlag(MOD, 'sneakDamage')?.formula} crit=${dmg?.rolls?.[0]?.isCritical} rolls=[${(dmg?.rolls ?? []).map(r => r.formula).join(' | ')}]`);
      const koCard = await until(() => cardsWith('cunning').find(m => m.getFlag(MOD, 'cunning')?.key === 'knockOut' && m.getFlag(MOD, 'saves')), { timeout: 10000 });
      ok('5b. Knock Out demands its Con save through the saves machine', (koCard?.getFlag(MOD, 'saves')?.abilities?.join() === 'con'), `abilities=${koCard?.getFlag(MOD, 'saves')?.abilities?.join()}`);
      await answerSave();
      await until(() => koCard?.getFlag(MOD, 'saves')?.targets?.every(t => t.done && t.applied), { timeout: 15000 });
      ok('5c. …and the failure lands Unconscious', victim.statuses?.has?.('unconscious'), `unconscious=${victim.statuses?.has?.('unconscious')}`);
      await clearChips();
      face(19);
    });

    // ================================================== 6. once per turn
    if (want(6)) await section(6, async () => {
      await clearChips();
      if (game.combat) await game.combat.delete();
      combat = await Combat.create({ scene: scene.id });
      await combat.createEmbeddedDocuments('Combatant', [
        { actorId: rogue.id, tokenId: rogueDoc.id, sceneId: scene.id, initiative: 30 },
        { actorId: victim.id, tokenId: victimDoc.id, sceneId: scene.id, initiative: 20 }
      ]);
      // The combat goes in a finally: a wait that throws here must not leave §7 on swinging inside it.
      try {
        await combat.startCombat();
        await until(() => combat.started && (combat.round === 1) && (combat.turn === 0),
          { timeout: 4000, label: 'the combat started on the rogue\'s turn' });
        await ensureVexed();
        const { msg: m1 } = await armedSwing(rapier, { mode: 'advantage', tick: true });
        const o1 = m1?._source.system?.origin ?? m1?.id;
        (await until(offerEl, { timeout: 6000 }))?.querySelector('button[data-action="roll"]')?.click();
        await until(() => damageFor(o1)?.getFlag(MOD, 'receipt'), { timeout: 12000 });
        const chit = await until(() => rogue.effects.find(e => e.getFlag(MOD, 'mastery') === 'sneak'), { timeout: 6000 });
        ok('6a. dealing the damage in combat writes the once-per-turn chit on the rogue, stamped with the turn in progress',
          !!chit && (chit.name === 'Sneak Attack — used this turn') && (chit.start?.round === combat.round) && (chit.start?.turn === combat.turn),
          `chit=${chit?.name} start=${JSON.stringify(chit?.start ? { round: chit.start.round, turn: chit.start.turn } : null)} combat=r${combat.round}t${combat.turn}`);
        await ensureVexed();
        const { msg: m2, seen: seen2 } = await armedSwing(rapier, { mode: 'advantage' });
        ok('6b. the second swing this turn shows the box greyed with the reason, and no tick',
          !!seen2.boxText && /used this turn/.test(seen2.boxText) && !seen2.hasTick, `text="${seen2.boxText.slice(0, 120)}" tick=${seen2.hasTick}`);
        const o2 = m2?._source.system?.origin ?? m2?.id;
        const dmg2 = await until(() => { const d = damageFor(o2); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
        ok('6c. …not armed: auto damage rolls straight (no offer), and no sneak dice ride',
          (m2?.getFlag(MOD, 'sneak')?.armed === false) && !!dmg2 && !dmg2.getFlag(MOD, 'sneakDamage') && !offerEl(),
          `armed=${m2?.getFlag(MOD, 'sneak')?.armed} sneakDamage=${!!dmg2?.getFlag(MOD, 'sneakDamage')} offer=${!!offerEl()}`);
        await combat.nextTurn();   // the victim's turn
        await until(() => (combat.round === 1) && (combat.turn === 1), { timeout: 4000, label: 'the victim\'s turn' });
        await combat.nextTurn();   // the rogue's next turn — round 2
        await until(() => (combat.round === 2) && (combat.turn === 0), { timeout: 4000, label: 'the rogue\'s turn in round 2' });
        await ensureVexed();
        const { dialog: d3, before: b3 } = await openGate(rapier);
        ok('6d. the next turn offers the tick again — the chit died with the turn it was written in',
          !!tickOf(d3) && (combat.round === 2), `tick=${!!tickOf(d3)} round=${combat.round}`);
        let m3 = null;
        if (d3) { const t = tickOf(d3); if (t?.checked) t.click(); press(d3, 'advantage'); m3 = await waitAttackAfter(b3); }
        // The round-2 swing's damage lands before the combat goes.
        const o3 = m3?._source.system?.origin ?? m3?.id ?? null;
        if (o3) await until(() => damageFor(o3)?.getFlag(MOD, 'receipt'), { timeout: 12000, label: 'the round-2 swing\'s damage receipt' });
      } finally {
        if (combat && game.combats.get(combat.id)) await combat.delete().catch(() => {});
        combat = null;
      }
      await clearChips();
    });

    // ================================================== 7. Envenom Weapons
    if (want(7)) await section(7, async () => {
      await clearChips();
      const pack = game.packs.get('dnd-players-handbook.classes');
      const idx = await pack.getIndex();
      const src = idx.find(e => e.name === 'Envenom Weapons');
      const data = src ? (await pack.getDocument(src._id)).toObject() : null;
      if (!data) { skips.push('§7: Envenom Weapons not in the PHB pack'); }
      else {
        delete data._id;
        const [envenom] = await rogue.createEmbeddedDocuments('Item', [data]);
        created.items.push({ actorId: rogue.id, id: envenom.id });
        await ensureVexed();
        const { msg } = await armedSwing(rapier, { mode: 'advantage', tick: true });
        const originId = msg?._source.system?.origin ?? msg?.id;
        const offer = await until(offerEl, { timeout: 6000 });
        const label = textOf(offer?.querySelector('[data-bf-cunning-row="poison"]'));
        ok('7a. the menu shows Poison upgraded by Envenom Weapons', /Poison \(Envenom Weapons\)/.test(label), label.slice(0, 120));
        offer?.querySelector('input[name="bf-cunning"][value="poison"]')?.click();
        offer?.querySelector('button[data-action="roll"]')?.click();
        await until(() => damageFor(originId)?.getFlag(MOD, 'receipt'), { timeout: 12000 });
        const card = await until(() => cardsWith('cunning').find(m => m.getFlag(MOD, 'cunning')?.key === 'poison' && m.getFlag(MOD, 'saves')), { timeout: 10000 });
        const c = card?.getFlag(MOD, 'cunning');
        const s = card?.getFlag(MOD, 'saves');
        ok('7b. the demand is Envenom Weapons\' own Poison activity — Con save, its 2d8 on a failure — and the follow-up is armed: Poisoned on top',
          !!card && (s?.abilities?.join() === 'con') && (s?.hasDamage === true) && (s?.damageOnSave === 'none')
            && (c?.onFail === 'poisoned') && !!c?.effectUuid && (card.getAssociatedItem?.()?.name === 'Envenom Weapons'),
          `abilities=${s?.abilities?.join()} hasDamage=${s?.hasDamage} onSave=${s?.damageOnSave} onFail=${c?.onFail} item=${card?.getAssociatedItem?.()?.name}`);
        const hpBefore = victim.system.attributes.hp.value;
        await answerSave();
        await until(() => card?.getFlag(MOD, 'saves')?.targets?.every(t => t.done && t.applied), { timeout: 15000 });
        await until(() => card?.getFlag(MOD, 'cunning')?.applied?.includes?.(victim.uuid) && victim.statuses?.has?.('poisoned'), { timeout: 10000 });
        const er = card?.getFlag(MOD, 'effectReceipt')?.targets?.find(t => t.uuid === victim.uuid);
        const poisonDmg = await until(() => damageFor(card?.id)?.getFlag(MOD, 'receipt'), { timeout: 8000 });
        ok('7c. the failure takes the 2d8 (the saves machine) AND Poisoned (the follow-up), both receipted on the demand card',
          victim.statuses?.has?.('poisoned') && !!er?.effects?.some(e => /Poisoned/.test(e.name)) && !!poisonDmg
            && (victim.system.attributes.hp.value < hpBefore),
          `poisoned=${victim.statuses?.has?.('poisoned')} effects=${JSON.stringify(er?.effects?.map(e => e.name))} dmgReceipt=${!!poisonDmg} hp=${hpBefore}→${victim.system.attributes.hp.value}`);
        await rogue.deleteEmbeddedDocuments('Item', [envenom.id]);
        await clearChips();
      }
    });

    // ================================================== 8. Death Strike
    if (want(8)) await section(8, async () => {
      await clearChips();
      const pack = game.packs.get('dnd-players-handbook.classes');
      const idx = await pack.getIndex();
      const src = idx.find(e => e.name === 'Death Strike');
      const data = src ? (await pack.getDocument(src._id)).toObject() : null;
      if (!data) { skips.push('§8: Death Strike not in the PHB pack'); }
      else {
        delete data._id;
        const [ds] = await rogue.createEmbeddedDocuments('Item', [data]);
        created.items.push({ actorId: rogue.id, id: ds.id });
        if (game.combat) await game.combat.delete();
        combat = await Combat.create({ scene: scene.id });
        await combat.createEmbeddedDocuments('Combatant', [
          { actorId: rogue.id, tokenId: rogueDoc.id, sceneId: scene.id, initiative: 30 },
          { actorId: victim.id, tokenId: victimDoc.id, sceneId: scene.id, initiative: 20 }
        ]);
        // The combat goes in a finally: a wait that throws here must not leave §10 on swinging inside it.
        try {
          await combat.startCombat();
          await until(() => combat.started && (combat.round === 1) && (combat.turn === 0),
            { timeout: 4000, label: 'the combat started on the rogue\'s turn' });
          await ensureVexed();
          const { msg } = await armedSwing(rapier, { mode: 'advantage', tick: true });
          const originId = msg?._source.system?.origin ?? msg?.id;
          (await until(offerEl, { timeout: 6000 }))?.querySelector('button[data-action="roll"]')?.click();
          const dmg = await until(() => { const d = damageFor(originId); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
          const taken = dmg?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === victim.uuid)?.taken ?? 0;
          const card = await until(() => cardsWith('cunning').find(m => m.getFlag(MOD, 'cunning')?.key === 'deathStrike' && m.getFlag(MOD, 'saves')), { timeout: 10000 });
          ok('8a. a Sneak Attack hit on round one demands Death Strike\'s Con save — from the feature\'s own activity',
            !!card && (card.getFlag(MOD, 'saves')?.abilities?.join() === 'con') && (card.getFlag(MOD, 'cunning')?.onFail === 'double') && (combat.round === 1),
            `card=${!!card} abilities=${card?.getFlag(MOD, 'saves')?.abilities?.join()} round=${combat.round}`);
          const hpBefore = victim.system.attributes.hp.value;
          await answerSave();
          await until(() => card?.getFlag(MOD, 'saves')?.targets?.every(t => t.done && t.applied), { timeout: 15000 });
          const again = await until(() => card?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === victim.uuid), { timeout: 10000 });
          ok('8b. the failure lands the attack\'s damage AGAIN — the same amount, receipted on the demand card and said',
            !!again && (again.taken === taken) && /Death Strike/.test(again.note ?? '') && (victim.system.attributes.hp.value === hpBefore - taken),
            `first=${taken} again=${again?.taken} note="${again?.note}" hp=${hpBefore}→${victim.system.attributes.hp.value}`);
        } finally {
          if (combat && game.combats.get(combat.id)) await combat.delete().catch(() => {});
          combat = null;
        }
        await rogue.deleteEmbeddedDocuments('Item', [ds.id]);
        await clearChips();
      }
    });

    // ================================================== 10. Steady Aim, a use chip
    if (want(10)) await section(10, async () => {
      await clearChips();
      const steady = rogue.items.find(i => i.name === 'Steady Aim');
      const steadyAct = steady ? [...steady.system.activities][0] : null;
      if (!steady || !steadyAct) { skips.push('§10: the rogue lacks Steady Aim — re-run fixture-suite'); }
      else {
        await set('effectList', game.settings.settings.get(`${MOD}.effectList`)?.default ?? prior.effectList);
        rogueToken.control({ releaseOthers: true });
        const walkBefore = rogue.system.attributes.movement.walk;
        const useResults = await steadyAct.use({}, { configure: false }, {});
        const chip = await until(() => rogue.effects.find(e => (e.name === 'Steady Aim') && (e.getFlag(MOD, 'mastery') === 'use')), { timeout: 6000 });
        // The card's flag is a SECOND write after the chip (NOTES §5): wait for it.
        await until(() => useResults?.message?.getFlag(MOD, 'useChip') ? true : null, { timeout: 4000 });
        ok('10a. using Steady Aim (text-only in the pack) writes the chip on the rogue: named as the feature, Speed 0, the card says so',
          !!chip && (rogue.system.attributes.movement.walk === 0) && !!useResults?.message?.getFlag(MOD, 'useChip'),
          `chip=${!!chip} walk=${walkBefore}→${rogue.system.attributes.movement.walk} card=${!!useResults?.message?.getFlag(MOD, 'useChip')}`);
        const { msg, seen } = await armedSwing(rapier, { mode: 'advantage' });
        ok('10b. the gate reads the chip: Steady Aim as Advantage, net Advantage, the Sneak Attack tick armed by it',
          /Steady Aim/.test(seen.sectionText) && /Net Advantage/.test(seen.sectionText) && seen.ticked,
          `section="${seen.sectionText.slice(0, 160)}" ticked=${seen.ticked}`);
        const spend = await until(() => game.messages.get(msg?.id ?? '')?.getFlag(MOD, 'chipSpend'), { timeout: 8000 });
        const gone = await until(() => !rogue.effects.get(chip?.id), { timeout: 6000 });
        ok('10c. the roll SPENDS it — the receipt on the attack card, the chip gone, the Speed back',
          !!spend?.spent?.some(s => (s.id === chip?.id) && (s.key === 'effect')) && gone && (rogue.system.attributes.movement.walk === walkBefore),
          `spend=${JSON.stringify(spend?.spent?.map(x => x.name))} gone=${gone} walk=${rogue.system.attributes.movement.walk}`);
        (await until(offerEl, { timeout: 6000 }))?.querySelector('button[data-action="roll"]')?.click();
        await until(() => damageFor(msg?._source.system?.origin ?? msg?.id)?.getFlag(MOD, 'receipt'), { timeout: 12000 });
        await clearChips();
      }
    });

    // ================================================== 12. the Poison Coating
    if (want(12)) await section(12, async () => {
      await clearChips();
      const featPack = game.packs.get('dnd-players-handbook.feats');
      const fsrc = featPack ? (await featPack.getIndex()).find(e => e.name === 'Poisoner') : null;
      const fdata = fsrc ? (await featPack.getDocument(fsrc._id)).toObject() : null;
      if (!fdata) { skips.push('§12: Poisoner not in the PHB feats pack'); }
      else {
        delete fdata._id;
        const [poisoner] = await rogue.createEmbeddedDocuments('Item', [fdata]);
        created.items.push({ actorId: rogue.id, id: poisoner.id });
        await set('fightingStyleList', game.settings.settings.get(`${MOD}.fightingStyleList`)?.default ?? prior.fightingStyleList);
        const drBefore = [...(victim.system._source.traits?.dr?.value ?? [])];
        const coat = () => rogue.effects.find(e => e.getFlag(MOD, 'coat')) ?? null;
        const apply = () => poisoner.system.activities.find(a => a.name === 'Apply Poison');
        const useCards = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'coatUse'));
        const enchantCards = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && (m.getAssociatedActivity?.()?.type === 'enchant'));
        try {
          const max = Number(poisoner.system.uses.max) || 0;
          // no dose left: nothing is written
          await poisoner.update({ 'system.uses.spent': max });
          await apply()?.use({}, { configure: false }, {});
          // A window for a chip, a card or a spent dose that must not come.
          const wrote = await watch(() => (coat() ? 'chip' : null) ?? (useCards().length ? 'card' : null)
            ?? ((Number(poisoner.system.uses.spent) !== max) ? 'dose' : null), { ms: 1200 });
          ok('12a. no dose left: no chip, no card, the doses untouched', !wrote && !coat() && !useCards().length && (Number(poisoner.system.uses.spent) === max),
            `chip=${!!coat()} cards=${useCards().length} spent=${poisoner.system.uses.spent}/${max}${wrote ? ` (a ${wrote} came in the window)` : ''}`);
          await poisoner.update({ 'system.uses.spent': 0 });
          await apply()?.use({}, { configure: false }, {});
          const chip = await until(coat, { timeout: 6000 });
          const card = await until(() => useCards().at(-1) ?? null, { timeout: 6000 });
          ok('12b. Apply Poison: the Poison Coating on the ROGUE (60 s, the poisoned dagger), a dose spent, the card says Bonus Action — no enchantment card',
            !!chip && (chip.name === 'Poison Coating') && (chip.img === 'icons/weapons/daggers/dagger-poisoned.webp')
              && (Number(chip.duration?.seconds ?? chip._source.duration?.value) === 60) && (Number(poisoner.system.uses.spent) === 1)
              && !!card && (card.getFlag(MOD, 'coatUse')?.left === max - 1) && !enchantCards().length,
            `chip=${chip?.name} img=${chip?.img} duration=${JSON.stringify(chip?._source?.duration)} spent=${poisoner.system.uses.spent} card=${!!card} enchant=${enchantCards().length}`);
          // a MISS: the natural 1 misses, and the coating stands
          await healFull();
          target(victimToken);
          await targeted(victimToken);
          face(1);
          const act = attackOf(rapier);
          const u1 = await act.use({ subsequentActions: false }, { configure: false }, {});
          await act.rollAttack({}, { configure: false }, u1?.message?.id ? { data: { 'system.origin': u1.message.id } } : {});
          // A window for the coating to be spent on the miss, which must not happen.
          const spentOnMiss = await watch(() => !coat(), { ms: 2500 });
          ok('12c. a MISS spends nothing: the coating stands', !spentOnMiss && !!coat(), `chip=${!!coat()}`);
          // a HIT: the coating is spent through the feat's own save
          await victim.update({ 'system.traits.dr.value': ['poison'] });
          await healFull();
          face(19);
          const u2 = await act.use({ subsequentActions: false }, { configure: false }, {});
          const rolls = await act.rollAttack({}, { configure: false }, u2?.message?.id ? { data: { 'system.origin': u2.message.id } } : {});
          const attackMsg = rolls?.[0]?.parent ?? null;
          const originId = attackMsg?._source.system?.origin ?? attackMsg?.id;
          const dmg = await until(() => damageFor(originId), { timeout: 10000 });
          const spentFlag = await until(() => (dmg?.getFlag(MOD, 'coatHit')?.status === 'spent') ? dmg.getFlag(MOD, 'coatHit') : null, { timeout: 10000 });
          const saveCard = await until(() => game.messages.contents.find(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'saves')
            && (m.getAssociatedItem?.()?.name === 'Poisoner')) ?? null, { timeout: 10000 });
          const gone = await until(() => !coat(), { timeout: 6000 });
          ok('12d. a HIT spends it: the chip gone, the damage card says so, the feat\'s own Constitution save demanded of the victim',
            gone && !!spentFlag && spentFlag.targets?.some(t => t.uuid === victim.uuid) && !!saveCard
              && (saveCard.getFlag(MOD, 'saves')?.abilities?.join() === 'con'),
            `gone=${gone} flag=${JSON.stringify(spentFlag ? { status: spentFlag.status, ability: spentFlag.ability } : null)} save=${!!saveCard} abilities=${saveCard?.getFlag(MOD, 'saves')?.abilities?.join()}`);
          await until(() => dmg?.getFlag(MOD, 'receipt'), { timeout: 10000 });
          const hpBefore = Number(victim.system.attributes.hp.value);
          face(1);   // the save a natural 1 (its 2d8 was rolled with the demand)
          await answerSave();
          await until(() => saveCard?.getFlag(MOD, 'saves')?.targets?.every(t => t.done && t.applied), { timeout: 15000 });
          const poisonDmg = await until(() => damageFor(saveCard?.id)?.getFlag(MOD, 'receipt') ? damageFor(saveCard.id) : null, { timeout: 10000 });
          const poisoned = await until(() => victim.effects.find(e => e.statuses?.has?.('poisoned')) ?? null, { timeout: 8000 });
          unrig();
          const dealt = hpBefore - Number(victim.system.attributes.hp.value);
          const rolled = Number(poisonDmg?.rolls?.[0]?.total);
          ok('12e. the failure: the 2d8 poison lands WHOLE through Poison Resistance (Potent Poison — dealt equals rolled, not half)',
            !!poisonDmg && (rolled > 1) && (dealt === rolled),
            `rolled=${rolled} dealt=${dealt} dr=${JSON.stringify([...(victim.system.traits.dr.value ?? [])])}`);
          ok('12f. …and Poisoned, until the end of the rogue\'s next turn (the platform\'s sourceEnd)',
            !!poisoned && (poisoned._source.duration?.expiry === 'sourceEnd'),
            `poisoned=${!!poisoned} duration=${JSON.stringify(poisoned?._source?.duration)}`);
        } finally {
          unrig();
          await victim.update({ 'system.traits.dr.value': drBefore }).catch(() => {});
          const c = coat();
          if (c) await c.delete().catch(() => {});
          await rogue.deleteEmbeddedDocuments('Item', [poisoner.id]).catch(() => {});
          await clearChips();
        }
      }
    });

    // ================================================== 11. the ally clause, off the map
    // At a Normal roll the box ticks itself when an ally of the rogue (an unlinked token, not the
    // target) stands within 5 feet of the target; not when none does, nor under Disadvantage.
    if (want(11)) await section(11, async () => {
      await clearChips();
      const priorSides = { victim: victimDoc.disposition, rogue: rogueDoc.disposition };
      const squarePx = scene.grid.size;
      let allyDoc = null;
      const tickAt = async () => {
        const { dialog } = await openGate(rapier);
        const seen = { hasTick: !!tickOf(dialog), ticked: !!tickOf(dialog)?.checked,
          section: textOf(dialog?.element?.querySelector('[data-bf-reminder]')) };
        await closeDialogs();
        await until(() => !rollDialog(), { timeout: 4000, label: 'the roll dialog closed' });
        return seen;
      };
      try {
        await rogueDoc.update({ disposition: 1 });
        await victimDoc.update({ disposition: -1 });
        await until(() => (rogueDoc.disposition === 1) && (victimDoc.disposition === -1), { timeout: 4000, label: 'the sides set' });
        const alone = await tickAt();
        ok('11a. a Normal roll with no ally of the rogue beside the target: the box is offered, unticked',
          alone.hasTick && !alone.ticked, JSON.stringify(alone).slice(0, 240));
        [allyDoc] = await scene.createEmbeddedDocuments('Token', [
          foundry.utils.mergeObject(victim.prototypeToken.toObject(),
            { x: 1400, y: 1600 + squarePx, actorId: victim.id, actorLink: false, disposition: 1, name: 'BTB Test Ally' }, { inplace: false })]);
        created.tokens.push(allyDoc.id);
        await tokenOn(allyDoc.id);
        rogueToken.control({ releaseOthers: true });
        const flanked = await tickAt();
        ok('11b. …an ally of the rogue within 5 feet of the target: the box ticks itself at a Normal roll',
          flanked.hasTick && flanked.ticked && !/Net (Advantage|Disadvantage)/.test(flanked.section),
          JSON.stringify(flanked).slice(0, 240));
        await rogue.toggleStatusEffect('poisoned', { active: true });
        await until(() => rogue.statuses?.has?.('poisoned'), { timeout: 4000, label: 'the rogue Poisoned' });
        const poisoned = await tickAt();
        ok("11c. …and the rogue Poisoned — Disadvantage: unticked (\"you don't have Disadvantage on the attack roll\")",
          poisoned.hasTick && !poisoned.ticked && /Net Disadvantage/.test(poisoned.section), JSON.stringify(poisoned).slice(0, 240));
      } finally {
        await rogue.toggleStatusEffect('poisoned', { active: false }).catch(() => {});
        if (allyDoc && scene.tokens.get(allyDoc.id)) await scene.deleteEmbeddedDocuments('Token', [allyDoc.id]).catch(() => {});
        if (allyDoc) { const i = created.tokens.indexOf(allyDoc.id); if (i >= 0) created.tokens.splice(i, 1); }
        await victimDoc.update({ disposition: priorSides.victim }).catch(() => {});
        await rogueDoc.update({ disposition: priorSides.rogue }).catch(() => {});
      }
    });

    // ================================================== 9. the registrations FIRED
    if (want(9)) await section(9, async () => {
      ok('9a. dnd5e.preRollDamage fired (the rider\'s hook)', count('dnd5e.preRollDamage') > 0, `count=${count('dnd5e.preRollDamage')}`);
      ok('9b. dnd5e.rollDamage fired (the effects\' hook)', count('dnd5e.rollDamage') > 0, `count=${count('dnd5e.rollDamage')}`);
    });

    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  } finally {
    Hooks.off('bythebooks.moment', momentHookId);
    await teardown();
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: 'sneak', out, plan, f });
