// By the Books hit-menu smoke test: on a hit the damage offer carries a Combat Superiority group of
// the Battle Master's on-hit maneuvers read off the sheet; one pick per group, the die on the
// damage roll, the pool spent, the maneuver's save through the saves machine, the sweep.
// Fixture: BTB Test Fighter (tools/fixture-suite.mjs) with eight PHB maneuvers added for the run.
// Harness discipline: settings restored; messages, added items and placed tokens removed; the
// pool refilled; pressed conditions cleared. Sections: `--section 3`, `--section 1,6`, `--list`.
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from './harness.mjs';

// The coverage map (tools/coverage-map.mjs parses this; `npm run coverage` checks it both ways).
// ⚠ NEVER import a suite: it connects on evaluation.
export const COVERS = [
  'hit-menu.js',            // the Combat Superiority group on the damage offer, the pick, the sweep; §12-15 Giant Ancestry
  'saves/index.js',         // §3 / §4 — the maneuver's save through the saves machine
  'saves/demand.js',
  'saves/ask.js',
  'saves/verdict.js',
  'saves/consequences.js'
];

const SECTIONS = {
  1: 'the offer opens under AUTO damage: the Combat Superiority group, eight rows read off the sheet, the row the name and the cost',
  2: 'one pick per group: the sibling gives way; the summary names what rides',
  3: 'Trip Attack: the die rides as its own part, the pool is spent, the Strength save through the saves machine, Prone pressed on the failure',
  4: 'Menacing Attack: the activity\'s own Frightened lands through the saves machine',
  5: 'Distracting Strike: no save — Distracted applied on the hit, receipted',
  6: 'Sweeping Attack: nothing rides; the POPUP lists the creature within 5 feet; the pick rolls the die and applies it when the attack would hit',
  7: 'no dice left: the offer does not open for the menu; asked for, the rows stay greyed',
  8: 'the Hit Menu list is the switch: an empty list offers nothing',
  9: 'a critical hit doubles the die; Goaded lands on the target and NEVER on the fighter (the pack ships it transfer:true)',
  11: 'a copy that has lost its effect: Goaded still lands, pressed from the compendium',
  12: 'Giant Ancestry — Hill\'s Tumble (Slice A, 2026-09-24): the Goliath\'s own group, no feature required; no die, one use of the boon\'s own — Prone pressed with NO save, receipted, the card in the Giant Ancestry voice; a Huge target greys the row "too large"',
  13: 'a pick per group on one hit (2026-09-27, BACKLOG closed): a Battle Master with Hill\'s Tumble sees both groups; ticks in both STAND, the line says "one pick per group"; the damage carries both picks — Trip\'s die rides and spends a Superiority Die, Hill\'s Tumble presses Prone — one resolve per pick',
  10: 'the registration FIRED (§11): preRollDamage moved with a maneuver on it'
};
const DEPENDS = { 10: ['3'], 11: ['9'] };

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'hitmenu', watchdogMs: 720_000 });
announcePlan('hitmenu', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, watch, tokenOn, viewScene, snapshotSettings, faces, unrig } = window.__btb;
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
  if (!game.settings.settings.has(`${MOD}.decisionTimer`)) return { fatal: 'decisionTimer not registered — OLD code (bounce the sandbox)' };

  const SETTING_KEYS = ['autoDamage', 'autoApply', 'playerRollDamage', 'damageTimer', 'dramaticBeat', 'requireTarget',
    'reactionHold', 'riders', 'effectRiders', 'masteryRiders', 'masteryAsk', 'saves', 'saveTimer', 'castApply',
    'concMode', 'reminderList', 'maneuverFolds', 'hitMenuList', 'clockRiderList', 'holdTimer', 'fightingStyleList'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { set } = settings;

  const scene = game.scenes.getName('By the Books Test Range');
  const victim = game.actors.getName('BTB Test Victim');
  const second = game.actors.getName('BTB Test Attacker');
  const fighter = game.actors.getName('BTB Test Fighter');
  if (!scene || !victim || !second || !fighter) return { fatal: 'missing fixture: scene, BTB Test Victim, BTB Test Attacker or BTB Test Fighter — run tools/fixture-suite.mjs' };
  const pool = fighter.items.find(i => i.name === 'Combat Superiority');
  // The clone's own Greataxe (plain 1d12 slashing, no rider), else the d20-folds Longsword, else any plain melee weapon.
  const sword = fighter.items.find(i => (i.type === 'weapon') && (i.name === 'Greataxe'))
    ?? fighter.items.find(i => (i.type === 'weapon') && (i.name === 'Longsword'))
    ?? fighter.items.find(i => (i.type === 'weapon') && i.system.equipped && (i.system.attack?.type?.value !== 'ranged'));
  if (!pool || !sword) return { fatal: 'the fighter fixture lacks Combat Superiority or a melee weapon — run tools/fixture-suite.mjs' };
  log.push(`weapon: ${sword.name}`);

  const created = { items: [], tokens: [] };
  const priorActor = {};
  let restored = false;
  const STATUSES = ['prone', 'frightened'];
  const clearChips = async () => {
    for (const a of [victim, second, fighter]) {
      const chips = a.effects.filter(e => e.getFlag(MOD, 'mastery') || /^(Distracted|Goaded|Frightened|Prone|Chilled)/.test(e.name)
        || STATUSES.some(s => e.statuses?.has?.(s)));
      const live = chips.map(e => e.id).filter(id => a.effects.get(id));
      if (live.length) await a.deleteEmbeddedDocuments('ActiveEffect', live).catch(() => {});
    }
  };
  const closeDialogs = async () => {
    for (const app of foundry.applications.instances.values()) {
      const ours = app.element?.querySelector?.('[data-bf-reminder], [data-bf-save-demand], [data-bf-hit]')
        || /RollConfigurationDialog/.test(app.constructor?.name ?? '')
        || (app.element?.innerHTML ?? '').includes('Damage — your roll');
      if (ours) { try { await app.close(); } catch { /* gone */ } }
    }
  };
  const priorPoolSpent = pool.system._source.uses?.spent ?? 0;
  const refill = () => pool.update({ 'system.uses.spent': 0 });
  const poolLeft = () => fighter.items.get(pool.id)?.system.uses?.value ?? -1;
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
      const live = created.items.filter(id => fighter.items.get(id));
      if (live.length) await fighter.deleteEmbeddedDocuments('Item', live);
      await pool.update({ 'system.uses.spent': priorPoolSpent });
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
    await set('playerRollDamage', false);   // AUTO damage: the offer must open for an affordable maneuver anyway
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
    await set('holdTimer', 0);              // the sweep popup waits for a press (the hold family's clock)
    await set('reminderList', '');          // no gate: the swing rolls straight
    await set('maneuverFolds', '');         // no Precision offer on a miss that should not happen
    // The fighter's own Great Weapon Fighting is always on now (no list to empty): every die floors at 3,
    // so a pinned formula reads "1d8min3" — the patterns below allow the floor.
    await set('fightingStyleList', '');
    await set('clockRiderList', '');
    await set('hitMenuList', 'Trip Attack, Goading Attack, Menacing Attack, Pushing Attack, Disarming Attack, Distracting Strike, Maneuvering Attack, Sweeping Attack');

    // -------------------------------------------------- fixtures
    const MANEUVERS = ['Trip Attack', 'Goading Attack', 'Menacing Attack', 'Pushing Attack', 'Disarming Attack', 'Distracting Strike', 'Maneuvering Attack', 'Sweeping Attack'];
    const pack = game.packs.get('dnd-players-handbook.classes');
    if (!pack) return { fatal: 'the 2024 PHB classes pack is not in this world' };
    const index = await pack.getIndex();
    // ⚠ Fresh copies every run: a killed run leaves added maneuvers behind (§11 strips Goaded on
    // purpose). The reference Fighter carries none of these names natively.
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
    log.push(`pool: ${poolLeft()} superiority dice`);

    await viewScene(scene);
    // LINKED strays only: the shared fixture's unlinked tokens belong to every other suite.
    const strays = scene.tokens.filter(t => t.actorLink && [victim.id, second.id, fighter.id].includes(t.actorId)).map(t => t.id);
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
    const { token: victimToken } = await placeToken(victim, 1500, 1600);
    await placeToken(second, 1500, 1700);   // one square below the victim — 5 feet
    const { token: fighterToken } = await placeToken(fighter, 1400, 1600);
    fighterToken.control({ releaseOthers: true });

    for (const a of [victim, second]) {
      priorActor[a.id] = {
        'system.attributes.ac.override': a.system._source.attributes.ac.override ?? null,
        'system.abilities.str.save.roll.bonus': a.system._source.abilities?.str?.save?.roll?.bonus ?? '',
        'system.abilities.wis.save.roll.bonus': a.system._source.abilities?.wis?.save?.roll?.bonus ?? '',
        'system.attributes.hp.value': a.system._source.attributes.hp.value,
        'system.attributes.hp.max': a.system._source.attributes.hp.max
      };
      // AC 1 so every forced 19 hits; a deep pool so nobody dies; saves forced to fail.
      await a.update({ 'system.attributes.ac.override': 1,
        'system.attributes.hp.max': 400, 'system.attributes.hp.value': 400,
        'system.abilities.str.save.roll.bonus': '-30', 'system.abilities.wis.save.roll.bonus': '-30' });
    }
    const healFull = async () => {
      for (const a of [victim, second]) {
        await a.update({ 'system.attributes.hp.value': a.system.attributes.hp.max, 'system.attributes.hp.temp': 0 });
        const down = a.effects.filter(e => ['dead', 'unconscious'].some(s => e.statuses?.has?.(s)));
        if (down.length) await a.deleteEmbeddedDocuments('ActiveEffect', down.map(e => e.id)).catch(() => {});
      }
    };
    const attack = sword.system.activities.find(a => a.type === 'attack');

    // -------------------------------------------------- helpers
    const face = (n, of = 20) => faces([[n, of]]);
    const target = token => token.setTarget(true, { releaseOthers: true });
    const textOf = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    // The NEWEST open offer: a stale one left open (a 0 s Decision Timer waits for a press) must never stand in.
    const offerEl = () => [...foundry.applications.instances.values()].filter(a => a.rendered).map(a => a.element)
      .filter(el => (el?.innerHTML ?? '').includes('Damage — your roll')).pop() ?? null;
    const saveDialogEl = () => [...foundry.applications.instances.values()]
      .filter(app => app.rendered && app.element?.querySelector?.('[data-bf-save-demand]')).map(app => app.element)[0] ?? null;
    /** The hit menu's first pick on a damage roll (`picks`), as a one-record shape. */
    const firstPick = dmg => { const r = dmg?.getFlag(MOD, 'hitManeuver'); return r ? (Array.isArray(r.picks) ? (r.picks[0] ?? null) : r) : null; };
    const damageFor = originId => game.messages.contents.find(m => (m.type === 'damage')
      && (m._source.system?.origin === originId));
    const cardsWith = flagKey => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, flagKey));
    /** A programmatic hit at the victim, no dialog; the offer is the machine's to open. */
    const swing = async ({ d20 = 19 } = {}) => {
      await healFull();
      target(victimToken);
      await until(() => game.user.targets.has(victimToken), { label: 'the victim targeted' });
      face(d20);
      const results = await attack.use({ subsequentActions: false }, { configure: false }, {});
      const usageId = results?.message?.id ?? null;
      const rolls = await attack.rollAttack({}, { configure: false }, usageId ? { data: { 'system.origin': usageId } } : {});
      const msg = rolls?.[0]?.parent ?? null;
      return { msg, originId: msg?._source.system?.origin ?? msg?.id };
    };
    const menuOf = offer => offer?.querySelector('[data-bf-hit]') ?? null;
    const box = (offer, key) => offer?.querySelector(`input[name="bf-hit"][value="${key}"]`) ?? null;
    const rollButton = offer => offer?.querySelector('button[data-action="roll"]') ?? null;
    const answerSave = async () => {
      // the callers read the boolean: a dialog that never opened is reported, not thrown
      const el = await until(saveDialogEl, { timeout: 8000 }).catch(() => null);
      el?.querySelector('button[data-action="normal"]')?.click();
      return !!el;
    };
    /** Swing, pick one maneuver on the offer, roll; return the attack, the damage message and its stamp. */
    const swingWith = async (key, { d20 = 19 } = {}) => {
      const { msg, originId } = await swing({ d20 });
      const offer = await until(offerEl, { timeout: 6000 });
      if (key) box(offer, key)?.click();   // the tick's change handler runs inside the click
      rollButton(offer)?.click();
      const dmg = await until(() => { const d = damageFor(originId); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
      return { msg, originId, dmg, hm: firstPick(dmg) };
    };
    // Between sections: no offer or save dialog left open (the next swing's `offerEl` must find its own),
    // then the chips and the pool. A dialog that stays open is not this section's failure: the wait tolerates it.
    const settle = async () => {
      await until(() => !offerEl() && !saveDialogEl(), { timeout: 4000, label: 'the offers and save dialogs closed' }).catch(() => null);
      await clearChips();
      await healFull();
    };

    // ================================================== 1. the offer and the rows
    if (want(1)) await section(1, async () => {
      await refill();
      const { msg } = await swing();
      const offer = await until(offerEl, { timeout: 6000 });
      const menu = menuOf(offer);
      const rows = [...(menu?.querySelectorAll('[data-bf-hit-row]') ?? [])].map(r => r.dataset.bfHitRow);
      ok('1a. a hit with a Superiority Die left opens the damage offer under AUTO damage, and the offer carries the hit menu',
        !!msg && !!offer && !!menu, `attack=${!!msg} offer=${!!offer} menu=${!!menu}`);
      ok('1b. the group is Combat Superiority, tagged with the dice left and the die read off the sheet: 4 × 1d8',
        /Combat Superiority/.test(textOf(menu)) && /4 × 1d8 left/.test(textOf(menu)), textOf(menu).slice(0, 160));
      ok('1c. eight rows, read off the sheet in table order',
        rows.join() === 'trip-attack,goading-attack,menacing-attack,pushing-attack,disarming-attack,distracting-strike,maneuvering-attack,sweeping-attack',
        rows.join());
      const trip = menu?.querySelector('[data-bf-hit-row="trip-attack"]');
      const tripText = textOf(trip);
      ok('1d. the row is the name and the cost — "1d8 Superiority Die" — no caveat line, the save left to the rule under it (user, 2026-09-04)',
        /Trip Attack/.test(tripText) && /1d8 Superiority Die/i.test(tripText) && !/Strength|Large or smaller/.test(tripText.replace(/the rule.*$/, '')),
        tripText.slice(0, 200));
      ok('1e. the offer\'s line says what the menu is for',
        /Maneuvers/.test(textOf(offer)) && /one maneuver per attack/.test(textOf(offer)), textOf(offer).slice(0, 200));
      rollButton(offer)?.click();
      await until(() => damageFor(msg?._source.system?.origin ?? msg?.id)?.getFlag(MOD, 'receipt'), { timeout: 12000 });
      await settle();
    });

    // ================================================== 2. one pick per group
    if (want(2)) await section(2, async () => {
      await refill();
      const { msg } = await swing();
      const offer = await until(offerEl, { timeout: 6000 });
      const noneTicked = () => [...(offer?.querySelectorAll('input[name="bf-hit"]') ?? [])].every(b => !b.checked);
      const before = noneTicked();
      // each tick's change handler runs inside the click
      box(offer, 'trip-attack')?.click();
      const afterTrip = !!box(offer, 'trip-attack')?.checked;
      box(offer, 'goading-attack')?.click();
      ok('2a. nothing ticked to start; Trip ticks — and there is no summary line under the groups (user, 2026-09-04: "superfluous")',
        before && afterTrip && !offer?.querySelector('[data-bf-hit-summary]'), `before=${before} trip=${afterTrip} summary=${!!offer?.querySelector('[data-bf-hit-summary]')}`);
      ok('2b. a second tick in the group unticks the first — one maneuver per attack',
        !box(offer, 'trip-attack')?.checked && !!box(offer, 'goading-attack')?.checked,
        `trip=${box(offer, 'trip-attack')?.checked} goading=${box(offer, 'goading-attack')?.checked}`);
      box(offer, 'goading-attack')?.click();
      ok('2c. untick it: nothing ticked again', noneTicked(), `noneTicked=${noneTicked()}`);
      rollButton(offer)?.click();
      const dmg = await until(() => { const d = damageFor(msg?._source.system?.origin ?? msg?.id); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
      ok('2d. no pick: no maneuver on the damage message, the pool untouched, the attack message records the empty pick',
        !!dmg && !dmg.getFlag(MOD, 'hitManeuver') && (poolLeft() === 4) && (game.messages.get(msg?.id)?.getFlag(MOD, 'hitPick')?.key === null),
        `hm=${!!dmg?.getFlag(MOD, 'hitManeuver')} pool=${poolLeft()} pick=${JSON.stringify(game.messages.get(msg?.id)?.getFlag(MOD, 'hitPick'))}`);
      await settle();
    });

    // ================================================== 3. Trip Attack
    if (want(3)) await section(3, async () => {
      await refill();
      const { msg, dmg, hm } = await swingWith('trip-attack');
      // A part reads as its dice: the module names each maneuver's ("1d8[Trip Attack]").
      const formulas = (dmg?.rolls ?? []).map(r => String(r.formula ?? '').replace(/\[[^\]]*\]/g, ''));
      const part = (dmg?.rolls ?? []).find(r => /^1d8(min3)?$/.test(String(r.formula ?? '').replace(/\[[^\]]*\]/g, '')));
      ok('3a. the die rides the weapon\'s damage roll as its own part — 1d8 slashing',
        !!dmg && !!part && (part.options?.type === 'slashing'), `formulas=[${formulas.join(' | ')}] type=${part?.options?.type}`);
      ok('3b. the damage message records it: Trip Attack, 1d8, one Superiority Die spent, 3 left — and the attack message is marked rolled',
        !!hm && (hm.key === 'trip-attack') && (hm.formula === '1d8') && hm.rides && (hm.poolLeft === 3) && hm.save && (hm.onFail === 'prone')
          && (game.messages.get(msg?.id)?.getFlag(MOD, 'hitPick')?.rolled === true),
        JSON.stringify(hm));
      ok('3c. the pool is spent on the sheet: 3 of 4 left', poolLeft() === 3, `pool=${poolLeft()}`);
      const receipt = dmg?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === victim.uuid);
      const total = (dmg?.rolls ?? []).reduce((n, r) => n + (r.total ?? 0), 0);
      ok('3d. one roll, one receipt: the victim took the weapon and the die together', !!receipt && (receipt.taken === total), `taken=${receipt?.taken} total=${total}`);
      // the line comes with the card's render; 3e reads it through `?? ''` and says what it saw
      const cardText = await until(() => { const t = textOf(document.querySelector(`.message[data-message-id="${dmg?.id}"]`)); return /rode this roll/.test(t) ? t : null; }, { timeout: 4000 }).catch(() => null);
      ok('3e. the damage card says what rode: Trip Attack — 1d8 slashing rode this roll · one Superiority Die spent · Combat Superiority: 3 of 4 remaining (the one wording, 2026-09-05)',
        /Trip Attack — 1d8 slashing rode this roll/.test(cardText ?? '') && /one Superiority Die spent/.test(cardText ?? '') && /Combat Superiority: 3 of 4 remaining/.test(cardText ?? ''),
        (cardText ?? '').slice(0, 220));
      const card = await until(() => cardsWith('hitManeuverCard').find(m => m.getFlag(MOD, 'hitManeuverCard')?.key === 'trip-attack' && m.getFlag(MOD, 'saves')), { timeout: 10000 });
      const saves = card?.getFlag(MOD, 'saves');
      ok('3f. the save goes through the saves machine: the demand on Trip Attack\'s own Strength Save activity, at the victim, a DC read off the sheet',
        !!card && (saves?.abilities?.join() === 'str') && (saves?.dc > 0) && (saves?.targets?.[0]?.uuid === victim.uuid)
          && (card.getFlag(MOD, 'hitManeuverCard')?.attackId === msg?.id),
        `card=${!!card} abilities=${saves?.abilities?.join()} dc=${saves?.dc} target=${saves?.targets?.[0]?.name}`);
      log.push(`Trip Attack save DC on the demand: ${saves?.dc} (fighter prof ${fighter.system.attributes.prof}, str ${fighter.system.abilities.str.mod}, dex ${fighter.system.abilities.dex.mod})`);
      const answered = await answerSave();
      await until(() => card?.getFlag(MOD, 'saves')?.targets?.every(t => t.done), { timeout: 15000 });
      // The receipt is a QUEUED write that lands after the press: wait on it.
      const er = await until(() => game.messages.get(card?.id)?.getFlag(MOD, 'effectReceipt')?.targets?.find(t => (t.uuid === victim.uuid) && t.effects?.length), { timeout: 12000 });
      const applied = card?.getFlag(MOD, 'hitManeuverCard')?.applied?.includes?.(victim.uuid) && victim.statuses?.has?.('prone');
      const entry = card?.getFlag(MOD, 'saves')?.targets?.[0];
      ok('3g. the victim fails (-30) and Prone — the effect the pack left on the ITEM, unlinked — is pressed by the follow-up, receipted on the demand card',
        answered && (entry?.outcome === 'failed') && !!applied && !!er?.effects?.length,
        `answered=${answered} outcome=${entry?.outcome} prone=${victim.statuses?.has?.('prone')} receipt=${JSON.stringify(er?.effects?.map(e => e.name))}`);
      const demandText = textOf(document.querySelector(`.message[data-message-id="${card?.id}"]`));
      ok('3h. the demand card says whose maneuver it is', /Trip Attack — from BTB Test Fighter/.test(demandText), demandText.slice(0, 160));
      // One `maneuver` event on the damage message, plain, with the spend.
      const ev = momentsOf('maneuver').filter(p => p.messageId === dmg?.id);
      const p = ev[0];
      ok('3i. the resolve was PUBLISHED once: bythebooks.moment "maneuver" — the fighter, Trip Attack, the damage message, the attack, the victim as a hit target, the die and the Superiority Die spend (3 of 4 left); plain and frozen',
        (ev.length === 1) && !!p && (p.actorUuid === fighter.uuid) && (p.ability === 'Trip Attack') && (p.attackId === msg?.id)
          && (p.targets?.[0]?.actorUuid === victim.uuid) && (p.targets?.[0]?.hit === true) && !!p.targets?.[0]?.tokenUuid && !!p.tokenUuid
          && (p.details?.key === 'trip-attack') && (p.details?.formula === '1d8') && (p.spend?.pool === 'Combat Superiority') && (p.spend?.left === 3) && (p.spend?.max === 4)
          && Object.isFrozen(p) && plain(p),
        `events=${ev.length} payload=${JSON.stringify(p)}`);
      const fxs = game.modules.get('fvtt-mod-fxstudio')?.active ? game.modules.get('fvtt-mod-fxstudio').api : null;
      if (fxs?.ledger) { const fe = fxs.ledger.find(x => x.id === `${dmg?.id}:maneuver`); log.push(`FX Studio (observed, not asserted): ${fe ? `${fe.played ? 'PLAYED' : 'did not play'} ${fe.fx ?? '(no fx)'} on "${fe.when}" via ${fe.key ?? '-'}${fe.why ? ` — ${fe.why}` : ''}` : 'no ledger entry for the published moment'}`); }
      await settle();
    });

    // ================================================== 4. Menacing Attack
    if (want(4)) await section(4, async () => {
      await refill();
      const { hm } = await swingWith('menacing-attack');
      ok('4a. Menacing Attack rides and demands', !!hm && (hm.key === 'menacing-attack') && hm.rides && hm.save && !hm.onFail, JSON.stringify(hm));
      const card = await until(() => cardsWith('hitManeuverCard').find(m => m.getFlag(MOD, 'hitManeuverCard')?.key === 'menacing-attack' && m.getFlag(MOD, 'saves')), { timeout: 10000 });
      ok('4b. the Wisdom save through the saves machine', card?.getFlag(MOD, 'saves')?.abilities?.join() === 'wis', `abilities=${card?.getFlag(MOD, 'saves')?.abilities?.join()}`);
      await answerSave();
      await until(() => card?.getFlag(MOD, 'saves')?.targets?.every(t => t.done && t.applied), { timeout: 15000 });
      ok('4c. the failure lands Frightened — the activity\'s own effect, through the saves machine', victim.statuses?.has?.('frightened'), `frightened=${victim.statuses?.has?.('frightened')}`);
      await settle();
    });

    // ================================================== 5. Distracting Strike
    if (want(5)) await section(5, async () => {
      await refill();
      const { dmg, hm } = await swingWith('distracting-strike');
      ok('5a. Distracting Strike rides, no save, effects on the hit', !!hm && (hm.key === 'distracting-strike') && hm.rides && !hm.save && hm.effects, JSON.stringify(hm));
      // The receipt is a QUEUED write that lands after the effect: wait on it.
      const er = await until(() => game.messages.get(dmg?.id)?.getFlag(MOD, 'effectReceipt')?.targets?.find(t => (t.uuid === victim.uuid) && t.effects?.length), { timeout: 12000 });
      const applied = game.messages.get(dmg?.id)?.getFlag(MOD, 'hitManeuver')?.effectsApplied && victim.effects.some(e => e.name === 'Distracted');
      ok('5b. Distracted lands on the victim on the elect, receipted on the damage card', !!applied && !!er?.effects?.some(e => /Distracted/.test(e.name)),
        `applied=${!!applied} distracted=${victim.effects.some(e => e.name === 'Distracted')} receipt=${JSON.stringify(er?.effects?.map(e => e.name))}`);
      ok('5c. no demand card — nothing to save against', !cardsWith('hitManeuverCard').some(m => m.getFlag(MOD, 'hitManeuverCard')?.key === 'distracting-strike'), '');
      await settle();
    });

    // ================================================== 6. Sweeping Attack
    if (want(6)) await section(6, async () => {
      await refill();
      const { dmg, hm } = await swingWith('sweeping-attack');
      const formulas = (dmg?.rolls ?? []).map(r => String(r.formula ?? '').replace(/\[[^\]]*\]/g, ''));   // the dice: a sweep's die must not ride, named or not
      ok('6a. nothing rides the damage roll — the die is not on it; the pool is spent',
        !!hm && (hm.key === 'sweeping-attack') && (hm.mode === 'sweep') && !hm.rides && !formulas.some(f => /^1d8$/.test(f)) && (poolLeft() === 3),
        `formulas=[${formulas.join(' | ')}] pool=${poolLeft()} hm=${JSON.stringify(hm)}`);
      const card = await until(() => cardsWith('sweepCard')[0], { timeout: 10000 });
      const sc = card?.getFlag(MOD, 'sweepCard');
      ok('6b. the sweep card lists the creature within 5 feet of the target — the second goblin, not the fighter, not the victim',
        !!sc && (sc.candidates?.length === 1) && (sc.candidates[0].uuid === second.uuid) && !sc.chosen,
        `candidates=${JSON.stringify(sc?.candidates?.map(c => c.name))}`);
      // The pick is a popup: a button per creature and Nobody, the bar, the card's reopen button.
      // Read the DIALOG, not the chat log (which also carries the card's words).
      const popup = await until(() => [...foundry.applications.instances.values()]
        .find(app => (app instanceof foundry.applications.api.DialogV2) && app.rendered && /pick the second creature/.test(app.element?.innerHTML ?? '')), { timeout: 6000 });
      const pickButton = popup?.element?.querySelector('button[data-action="pick-0"]');
      const nobody = popup?.element?.querySelector('button[data-action="none"]');
      const cardText6 = textOf(document.querySelector(`.message[data-message-id="${card?.id}"]`));
      // holdTimer is 0 here, so no bar: the popup waits for a human.
      ok('6c. the pick is a popup: one button per creature within 5 feet, and Nobody; the card carries a reopen button; no bar at a 0 window',
        !!popup && !!pickButton && (textOf(pickButton) === 'Hobgoblin') && !!nobody && /Pick — Sweeping Attack/.test(cardText6)
          && !popup.element.querySelector('[data-bf-deadline]'),
        `popup=${!!popup} pick="${textOf(pickButton)}" nobody=${!!nobody} bar=${!!popup?.element?.querySelector('[data-bf-deadline]')} card="${cardText6.slice(-160)}"`);
      const hpBefore = second.system.attributes.hp.value;
      pickButton?.click();
      const resolved = await until(() => game.messages.get(card?.id)?.getFlag(MOD, 'sweepCard')?.resolved, { timeout: 12000 });
      const rollMsg = game.messages.contents.find(m => (m.timestamp >= suiteStart) && /Sweeping Attack — the die/.test(m.flavor ?? ''));
      const receipt = game.messages.get(card?.id)?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === second.uuid);
      ok('6d. the pick rolls the die in the open, judges the ORIGINAL attack roll against the second creature (AC 1 — a hit), and applies it with a receipt',
        !!resolved && (resolved.verdict === 'hit') && (resolved.rolled >= 1) && (resolved.rolled <= 8) && !!rollMsg
          && !!receipt && (receipt.taken === resolved.rolled) && (second.system.attributes.hp.value === hpBefore - resolved.rolled),
        `resolved=${JSON.stringify(resolved)} roll=${!!rollMsg} receipt=${JSON.stringify(receipt)} hp=${hpBefore}→${second.system.attributes.hp.value}`);
      const cardText = textOf(document.querySelector(`.message[data-message-id="${card?.id}"]`));
      ok('6e. the card says it', /the die rolled/.test(cardText) && /would hit — applied/.test(cardText), cardText.slice(0, 200));
      await settle();
    });

    // ================================================== 7. no dice left
    if (want(7)) await section(7, async () => {
      await pool.update({ 'system.uses.spent': pool.system.uses.max });
      ok('7. (setup) the pool is empty', poolLeft() === 0, `pool=${poolLeft()}`);
      const { msg, originId } = await swing();
      // a window for a WRONG offer
      const offer = await watch(offerEl, { ms: 2500 });
      const dmg = await until(() => { const d = damageFor(originId); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
      ok('7a. under AUTO damage the offer does not open for a menu nobody can afford — the damage rolls itself, no maneuver on it',
        !offer && !!dmg && !dmg.getFlag(MOD, 'hitManeuver'), `offer=${!!offer} dmg=${!!dmg} hm=${!!dmg?.getFlag(MOD, 'hitManeuver')} attack=${!!msg}`);
      await settle();
      await set('playerRollDamage', true);
      const { originId: o2 } = await swing();
      const offer2 = await until(offerEl, { timeout: 6000 });
      const menu = menuOf(offer2);
      const boxes = [...(menu?.querySelectorAll('input[name="bf-hit"]') ?? [])];
      ok('7b. asked for, the offer shows the group with "no dice left" and every row greyed',
        !!menu && /no dice left/.test(textOf(menu)) && (boxes.length === 8) && boxes.every(b => b.disabled),
        `menu=${!!menu} text="${textOf(menu).slice(0, 80)}" boxes=${boxes.length} disabled=${boxes.filter(b => b.disabled).length}`);
      rollButton(offer2)?.click();
      await until(() => damageFor(o2)?.getFlag(MOD, 'receipt'), { timeout: 12000 });
      await set('playerRollDamage', false);
      await settle();
    });

    // ================================================== 8. RETIRED
    // The Hit Menu list is gone (the table is the only list). Its swing also left an unanswered offer
    // open under a 0 s Decision Timer, which §9 onward then pressed in place of their own.

    // ================================================== 9. the crit
    if (want(9)) await section(9, async () => {
      await refill();
      const { dmg, hm } = await swingWith('goading-attack', { d20: 20 });
      // The crit rewrites the part's formula (1d8 → 2d8) rather than adding a die.
      const part = (dmg?.rolls ?? []).find(r => /^[12]d8(min3)?$/.test(String(r.formula ?? '').replace(/\[[^\]]*\]/g, '')));
      const eights = part?.dice?.filter(d => d.faces === 8).reduce((n, d) => n + d.number, 0) ?? 0;
      ok('9. a forced 20: the die is crit-doubled by the same stamp — the maneuver part rolls 2d8',
        !!hm && dmg?.rolls?.[0]?.isCritical && (eights === 2), `crit=${dmg?.rolls?.[0]?.isCritical} eights=${eights} formulas=[${(dmg?.rolls ?? []).map(r => r.formula).join(' | ')}]`);
      const card = await until(() => cardsWith('hitManeuverCard').find(m => m.getFlag(MOD, 'hitManeuverCard')?.key === 'goading-attack' && m.getFlag(MOD, 'saves')), { timeout: 10000 }).catch(() => null);
      if (card) { await answerSave(); await until(() => card.getFlag(MOD, 'saves')?.targets?.every(t => t.done && t.applied), { timeout: 15000 }); }
      // Goaded ships with transfer:true; it must still land on the failure.
      const goaded = await until(() => victim.effects.find(e => e.name === 'Goaded'), { timeout: 8000 });
      const gr = game.messages.get(card?.id)?.getFlag(MOD, 'effectReceipt')?.targets?.find(t => t.uuid === victim.uuid);
      ok('9b. the failure lands Goaded on the TARGET, receipted on the demand card',
        !!goaded && !!gr?.effects?.some(e => /Goaded/.test(e.name)),
        `goaded=${!!goaded} outcome=${card?.getFlag(MOD, 'saves')?.targets?.[0]?.outcome} applied=${card?.getFlag(MOD, 'saves')?.targets?.[0]?.applied} receipt=${JSON.stringify(gr?.effects?.map(e => e.name))} effects=${JSON.stringify(victim.effects.map(e => e.name))}`);
      // The machine corrects the transfer:true copy: the wielder never wears Goaded as a passive.
      const goadingItem = fighter.items.find(i => i.name === 'Goading Attack');
      const itemEffect = goadingItem?.effects.find(e => e.name === 'Goaded');
      const onFighter = [...fighter.allApplicableEffects()].some(e => e.name === 'Goaded');
      ok('9c. the fighter never carries Goaded: the item\'s copy is corrected to transfer:false, and no Goaded stands on him',
        !!itemEffect && (itemEffect.transfer === false) && !onFighter,
        `itemEffect=${!!itemEffect} transfer=${itemEffect?.transfer} onFighter=${onFighter}`);
      face(19);
      await settle();
    });

    // ================================================== 11. the lost effect, pressed from the compendium
    if (want(11)) await section(11, async () => {
      await clearChips();
      await refill();
      const goadingItem = fighter.items.find(i => i.name === 'Goading Attack');
      const eff = goadingItem?.effects.find(e => e.name === 'Goaded');
      if (eff) await eff.delete();   // the table's shape: the item on the sheet has lost its Goaded
      ok('11. (setup) the fighter\'s Goading Attack has no Goaded effect of its own', !!goadingItem && !goadingItem.effects.size, `effects=${goadingItem?.effects.size}`);
      const { hm } = await swingWith('goading-attack');
      const card = await until(() => cardsWith('hitManeuverCard').filter(m => m.getFlag(MOD, 'hitManeuverCard')?.key === 'goading-attack' && m.getFlag(MOD, 'saves')).pop(), { timeout: 10000 });
      const hc = card?.getFlag(MOD, 'hitManeuverCard');
      ok('11a. the demand carries the compendium copy to press', !!hm && !!hc?.pressUuids?.length && /Compendium\./.test(hc.pressUuids[0]), JSON.stringify(hc?.pressUuids));
      await answerSave();
      const goaded = await until(() => victim.effects.find(e => e.name === 'Goaded'), { timeout: 10000 });
      const gr = await until(() => game.messages.get(card?.id)?.getFlag(MOD, 'effectReceipt')?.targets?.find(t => (t.uuid === victim.uuid) && t.effects?.length), { timeout: 10000 });
      ok('11b. the failure still lands Goaded on the target — from the compendium\'s own effect, receipted',
        !!goaded && !!gr?.effects?.some(e => /Goaded/.test(e.name)) && (goaded?.transfer === false),
        `goaded=${!!goaded} transfer=${goaded?.transfer} receipt=${JSON.stringify(gr?.effects?.map(e => e.name))}`);
      await settle();
    });

    // ================================================== 12-13. Giant Ancestry
    // Hill's Tumble joins the Goliath for these sections. Fire's Burn and Frost's Chill are clock
    // riders (smoke-clock); this suite's Clock Riders list is empty.
    if (want(12) || want(13)) await section('12-13', async () => {
      const EIGHT = 'Trip Attack, Goading Attack, Menacing Attack, Pushing Attack, Disarming Attack, Distracting Strike, Maneuvering Attack, Sweeping Attack';
      const goliath = game.actors.getName('BTB Test Goliath');
      const axe = goliath?.items.find(i => (i.type === 'weapon') && (i.name === 'Greataxe'));
      const origins = game.packs.get('dnd-players-handbook.origins');
      if (!goliath || !axe || !origins) {
        ok('12. the BTB Test Goliath fixture with a Greataxe and the PHB origins pack (run tools/fixture-suite.mjs)', false, `goliath=${!!goliath} axe=${!!axe} origins=${!!origins}`);
      } else {
        const gItems = [];
        const fItems = [];
        const riderSpent = {};
        const priorSize = victim.system._source.traits?.size ?? 'med';
        const boonData = async name => {
          const idx = await origins.getIndex();
          const hit = idx.find(e => e.name === name);
          if (!hit) return null;
          const doc = await origins.getDocument(hit._id);
          const data = doc.toObject(); delete data._id;
          foundry.utils.setProperty(data, '_stats.compendiumSource', doc.uuid);
          return data;
        };
        try {
          await set('hitMenuList', `${EIGHT}, Hill's Tumble`);
          const add = [];
          for (const n of ["Hill's Tumble"]) {
            if (goliath.items.some(i => (i.type === 'feat') && (i.name === n))) continue;
            const d = await boonData(n);
            if (d) add.push(d); else log.push(`⚠ ${n} not in the origins pack`);
          }
          if (add.length) gItems.push(...(await goliath.createEmbeddedDocuments('Item', add)).map(d => d.id));
          const boon = n => goliath.items.find(i => (i.type === 'feat') && (i.name === n));
          const usesOf = n => Number(boon(n)?.system.uses?.value ?? -1);
          const refillBoons = async () => { for (const n of ["Hill's Tumble"]) await boon(n)?.update({ 'system.uses.spent': 0 }); };
          // Fire's Burn / Frost's Chill are clock riders, always on now (no Clock Riders list to empty): a due
          // one opens the offer under auto damage and rides the hit. Spent out for these sections, restored after.
          for (const n of ["Fire's Burn", "Frost's Chill"]) {
            const b = boon(n);
            if (!b?.system.uses?.max) continue;
            riderSpent[n] = b.system._source.uses?.spent ?? 0;
            await b.update({ 'system.uses.spent': Number(b.system.uses.max) });
          }
          const goliathToken = canvas.tokens.placeables.find(t => t.actor?.id === goliath.id) ?? (await placeToken(goliath, 1400, 1500)).token;
          const gAttack = axe.system.activities.find(a => a.type === 'attack');
          const swingGoliath = async () => {
            await healFull();
            goliathToken.control({ releaseOthers: true });
            target(victimToken);
            await until(() => game.user.targets.has(victimToken), { label: 'the victim targeted' });
            face(19);
            const results = await gAttack.use({ subsequentActions: false }, { configure: false }, {});
            const usageId = results?.message?.id ?? null;
            const rolls = await gAttack.rollAttack({}, { configure: false }, usageId ? { data: { 'system.origin': usageId } } : {});
            const msg = rolls?.[0]?.parent ?? null;
            return { msg, originId: msg?._source.system?.origin ?? msg?.id };
          };
          const goliathWith = async key => {
            const { msg, originId } = await swingGoliath();
            const offer = await until(offerEl, { timeout: 6000 });
            const offerText = textOf(offer);
            if (key) box(offer, key)?.click();   // the tick's change handler runs inside the click
            rollButton(offer)?.click();
            const dmg = await until(() => { const d = damageFor(originId); return d?.getFlag(MOD, 'receipt') ? d : null; }, { timeout: 12000 });
            return { msg, dmg, hm: firstPick(dmg), offerText };
          };
          const cardOf = m => textOf(document.querySelector(`.message[data-message-id="${m?.id}"]`));

          if (want(12)) await section(12, async () => {
            await refillBoons();
            const before = usesOf("Hill's Tumble");
            const { dmg, hm } = await goliathWith('hills-tumble');
            const er = await until(() => game.messages.get(dmg?.id)?.getFlag(MOD, 'effectReceipt')?.targets?.find(t => (t.uuid === victim.uuid) && t.effects?.length), { timeout: 12000 });
            ok('12a. Hill\'s Tumble: nothing rides, one use spent, Prone pressed with NO save card, receipted on the damage card',
              !!hm && (hm.key === 'hills-tumble') && !hm.rides && (hm.press === 'prone') && (usesOf("Hill's Tumble") === before - 1)
                && victim.statuses?.has?.('prone') && !!er?.effects?.some(e => /Prone/i.test(e.name)) && !cardsWith('hitManeuverCard').some(m => m.getFlag(MOD, 'hitManeuverCard')?.key === 'hills-tumble'),
              `hm=${JSON.stringify(hm && { key: hm.key, rides: hm.rides, press: hm.press })} uses ${before}→${usesOf("Hill's Tumble")} prone=${victim.statuses?.has?.('prone')} receipt=${JSON.stringify(er?.effects?.map(e => e.name))}`);
            await until(() => /has the Prone condition/.test(cardOf(dmg)), { timeout: 4000 });
            ok('12b. the card says what it pressed, in the Giant Ancestry voice', /Giant Ancestry — Hill's Tumble/.test(cardOf(dmg)) && /has the Prone condition/.test(cardOf(dmg)), cardOf(dmg).slice(0, 240));
            await settle();
            // A Huge target: nothing affordable, so AUTO damage opens no offer; ASKED, the size judge greys the row.
            await victim.update({ 'system.traits.size': 'huge' });
            const auto = await swingGoliath();
            // a window for a WRONG offer
            const autoOffer = await watch(offerEl, { ms: 1500 });
            const autoDmg = await until(() => damageFor(auto.originId)?.getFlag(MOD, 'receipt') ? damageFor(auto.originId) : null, { timeout: 12000 });
            await set('playerRollDamage', true);
            const { msg } = await swingGoliath();
            const offer = await until(offerEl, { timeout: 6000 });
            const row = offer?.querySelector('[data-bf-hit-row="hills-tumble"]');
            ok('12c. against a Huge target: under auto damage no offer opens and nothing is pressed; asked for, the row is greyed, its tag "too large"',
              !autoOffer && !!autoDmg && !autoDmg.getFlag(MOD, 'hitManeuver') && !victim.statuses?.has?.('prone')
                && !!row && !!box(offer, 'hills-tumble')?.disabled && /too large/i.test(textOf(row)),
              `autoOffer=${!!autoOffer} autoHm=${!!autoDmg?.getFlag(MOD, 'hitManeuver')} row=${textOf(row).slice(0, 120)} disabled=${box(offer, 'hills-tumble')?.disabled}`);
            rollButton(offer)?.click();
            await until(() => damageFor(msg?._source.system?.origin ?? msg?.id)?.getFlag(MOD, 'receipt'), { timeout: 12000 });
            await set('playerRollDamage', false);
            await victim.update({ 'system.traits.size': priorSize });
            await settle();
          });

          if (want(13)) await section(13, async () => {
            await refill();
            const d = await boonData("Hill's Tumble");
            if (d && !fighter.items.some(i => i.name === "Hill's Tumble")) fItems.push(...(await fighter.createEmbeddedDocuments('Item', [d])).map(x => x.id));
            const { msg } = await swing();
            const offer = await until(offerEl, { timeout: 6000 });
            const groups = [...(offer?.querySelectorAll('[data-bf-hit] > [data-bf-hit-group]') ?? [])].map(g => g.dataset.bfHitGroup);
            // each tick's change handler runs inside the click
            box(offer, 'trip-attack')?.click();
            box(offer, 'hills-tumble')?.click();
            ok('13a. both groups on one offer, and a tick in each STANDS — one pick per group, said on the line',
              (groups.join() === 'combat-superiority,giant-ancestry') && !!box(offer, 'trip-attack')?.checked && !!box(offer, 'hills-tumble')?.checked && /one pick per group/.test(textOf(offer)),
              `groups=${groups.join()} trip=${box(offer, 'trip-attack')?.checked} hill=${box(offer, 'hills-tumble')?.checked} line="${textOf(offer).slice(0, 200)}"`);
            const since13 = Date.now();
            rollButton(offer)?.click();
            const dmg = await until(() => { const x = damageFor(msg?._source.system?.origin ?? msg?.id); return x?.getFlag(MOD, 'receipt') ? x : null; }, { timeout: 12000 });
            await until(() => victim.statuses?.has?.('prone'), { timeout: 6000 });
            const picks13 = (dmg?.getFlag(MOD, 'hitManeuver')?.picks ?? []).map(p => p.key);
            const formulas13 = (dmg?.rolls ?? []).map(r => String(r.formula ?? '').replace(/\[[^\]]*\]/g, ''));
            ok('13b. both picks ride the one hit: Trip Attack\'s 1d8 on the roll and a Superiority Die spent, Hill\'s Tumble\'s Prone on the victim',
              (picks13.join() === 'trip-attack,hills-tumble') && formulas13.some(f => /^1d8(min3)?$/.test(f)) && victim.statuses?.has?.('prone') && (poolLeft() === 3),
              `picks=${picks13.join()} formulas=${formulas13.join(' | ')} prone=${victim.statuses?.has?.('prone')} pool=${poolLeft()}`);
            const pub13 = moments.filter(p => (p.at >= since13) && (p.kind === 'hitManeuver') && (p.messageId === dmg?.id)).map(p => `${p.event}:${p.marker}`).sort();
            ok('13c. one resolve per pick: maneuver for Trip Attack, rider for Hill\'s Tumble',
              pub13.join() === 'maneuver:trip-attack,rider:hills-tumble', pub13.join());
            await settle();
          });
        } finally {
          await victim.update({ 'system.traits.size': priorSize }).catch(() => {});
          for (const [n, spent] of Object.entries(riderSpent)) await goliath.items.find(i => (i.type === 'feat') && (i.name === n))?.update({ 'system.uses.spent': spent }).catch(() => {});
          const gl = gItems.filter(id => goliath.items.get(id));
          if (gl.length) await goliath.deleteEmbeddedDocuments('Item', gl).catch(() => {});
          const fl = fItems.filter(id => fighter.items.get(id));
          if (fl.length) await fighter.deleteEmbeddedDocuments('Item', fl).catch(() => {});
          await set('hitMenuList', EIGHT);
        }
      }
    });

    // ================================================== 10. the registration FIRED
    if (want(10)) await section(10, async () => {
      ok('10. dnd5e.preRollDamage fired (the rider\'s hook)', count('dnd5e.preRollDamage') > 0, `count=${count('dnd5e.preRollDamage')}`);
    });

    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  } finally {
    Hooks.off('bythebooks.moment', momentHookId);
    await teardown();
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: 'hitmenu', out, plan, f });
