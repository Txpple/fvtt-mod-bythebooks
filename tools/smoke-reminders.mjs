// Live suite: THE GATE BEFORE THE ROLL — when something the module can read bends an attack roll,
// By the Books' section stands in the system's roll dialog with every source, the net and the
// three modes; a human presses; the roll is re-issued with the press.
//
// Every setting touched is restored; every message this run creates is deleted; pressed statuses
// and chips are cleared; placed tokens are removed. No combat (smoke-expiry owns the clock).
//
// Sections: `--section 3`, `--section 1,7`, `--list`. Fixtures and teardown ALWAYS run.
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from './harness.mjs';

// The machines this suite drives (tools/coverage-map.mjs parses this). ⚠ NEVER import a suite:
// it connects on evaluation.
export const COVERS = [
  'reminders.js',           // the gate — every source, the net, the press, the check gate
  'chip-spend.js',          // §2 / §11 — the roll spends the chip
  'effect-view.js'          // §14 — the hover card's Cover section
];

const SECTIONS = {
  1: 'Vex: the gate stands in for the dialog, the press re-issues the roll, the card says so',
  2: 'programmatic rolls (configure: false) are never gated — and still spend the chip',
  3: 'multiple sources: Sapped attacker vs Vexed target lists both and nets to NORMAL',
  4: 'Prone, both roles, with the 5-foot geometry',
  5: 'the condition table: poisoned, blinded, incapacitated, frightened',
  7: 'closing the popup rolls nothing',
  8: 'the registration FIRED (§11): dnd5e.preRollAttack moved',
  9: 'a metric grid: the 5-foot rule is judged in FEET, never in scene units',
  10: 'range: point-blank, beyond normal, beyond long — and the section follows the attack-mode dropdown',
  11: 'effect sources: an effect or a feature by name, in scope, listed or counted, judged, and spent by the roll',
  12: 'the check gate: Poisoned and Frightened on a raw check and a skill, the record, never on a programmatic roll (2026-09-03)',
  13: 'the range cancellers (the PHB feats, group 2, 2026-09-26): Crossbow Expert answers the point-blank row (listed, net Normal) and not a dart\'s; Sharpshooter answers long range; Half Cover — the attack records the AC without it and the card says so, and the gate lists it; Spell Sniper answers a cantrip\'s point-blank row',
  14: 'measured cover (2026-09-27, the 2024 DMG\'s corner lines): the hover card\'s Cover section and the attack\'s recorded AC — a creature in the way is Half, an open line None, a wall across is Total (Sharpshooter or not), a wall\'s corner is Half and Sharpshooter takes it off, a hand-set Three-Quarters stands over a measured Half, a wall with Sight None is no cover and one with Sight Limited is Half'
};
const DEPENDS = { 8: ['1'] };

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'reminders', watchdogMs: 600_000 });
announcePlan('reminders', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, watch, tokenOn, snapshotSettings } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const suiteStart = Date.now();
  const ledger = globalThis.__bfHookLedger ?? null;
  const count = name => ledger?.[name] ?? 0;

  const mod = game.modules.get(MOD);
  if (!mod?.active) return { fatal: `module active=${mod?.active}` };
  for (const key of ['masteryAsk', 'decisionTimer']) {
    if (!game.settings.settings.has(`${MOD}.${key}`)) {
      return { fatal: `setting ${key} not registered — this client is running OLD code (F5)` };
    }
  }

  const SETTING_KEYS = ['autoDamage', 'autoApply', 'dramaticBeat', 'requireTarget', 'reactionHold',
    'riders', 'effectRiders', 'masteryRiders', 'masteryAsk', 'holdTimer', 'saveTimer', 'castApply',
    'noticeTimer'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { set } = settings;

  const scene = game.scenes.getName('By the Books Test Range');
  const victim = game.actors.getName('BTB Test Victim');
  const pc = game.actors.getName('BTB Test PC Attacker');
  if (!scene || !victim || !pc) return { fatal: 'missing fixture: scene or BTB Test actors' };

  const created = { items: [], tokens: [] };
  const priorActor = {};
  let priorBlade = null;
  let restored = false;
  const CHIP_NAMES = ['Vexed', 'Sapped', 'Slowed', 'Reduced Movement', 'Cleave — this turn'];
  const STATUSES = ['prone', 'poisoned', 'blinded', 'incapacitated', 'frightened', 'restrained', 'hiding'];
  const clearChips = async () => {
    for (const a of [victim, pc]) {
      const chips = a.effects.filter(e => e.getFlag(MOD, 'mastery') || CHIP_NAMES.includes(e.name));
      if (chips.length) await a.deleteEmbeddedDocuments('ActiveEffect', chips.map(e => e.id));
    }
  };
  const clearStatuses = async () => {
    for (const a of [victim, pc]) {
      const carriers = a.effects.filter(e => STATUSES.some(s => e.statuses?.has?.(s)));
      if (carriers.length) await a.deleteEmbeddedDocuments('ActiveEffect', carriers.map(e => e.id));
    }
  };
  const closeGates = async () => {
    for (const app of foundry.applications.instances.values()) {
      const gate = (app instanceof foundry.applications.api.DialogV2) && /Before you roll/.test(app.title ?? '');
      const system = /RollConfigurationDialog/.test(app.constructor?.name ?? '');
      if (gate || system) { try { await app.close(); } catch { /* gone */ } }
    }
  };
  const teardown = async () => {
    if (restored) return;
    restored = true;
    for (const failed of await settings.restore()) log.push(`TEARDOWN settings ERROR: ${failed}`);
    try {
      await closeGates();
      if (priorBlade && pc) await pc.items.get(priorBlade.id)?.update({ 'system.mastery': priorBlade.mastery });
      await clearChips();
      await clearStatuses();
      for (const [actorId, ids] of Object.entries(created.items.reduce((m, i) => {
        (m[i.actorId] ??= []).push(i.id); return m;
      }, {}))) {
        const a = game.actors.get(actorId);
        const live = ids.filter(id => a?.items.get(id));
        if (live.length) await a.deleteEmbeddedDocuments('Item', live);
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

  try {
    await set('autoDamage', 'all');
    await set('autoApply', true);
    await set('dramaticBeat', 0);
    await set('requireTarget', false);
    await set('reactionHold', false);
    await set('riders', false);
    await set('effectRiders', true);
    await set('masteryRiders', true);
    await set('masteryAsk', 'auto');
    await set('holdTimer', 0);
    await set('saveTimer', 0);
    await set('castApply', false);
    await set('noticeTimer', 2);

    // -------------------------------------------------- fixtures
    const findWeapon = async () => {
      const owned = pc.items.find(i => (i.type === 'weapon') && i.system.mastery
        && i.system.type?.baseItem && i.system.activities?.some?.(a => a.type === 'attack'));
      if (owned) return owned;
      for (const pack of game.packs) {
        if (pack.documentName !== 'Item') continue;
        if (pack.metadata.id.startsWith('JB2A')) continue;
        let index;
        try { index = await pack.getIndex({ fields: ['type', 'system.mastery', 'system.type.baseItem'] }); } catch { continue; }
        for (const entry of index) {
          if ((entry.type !== 'weapon') || !entry.system?.mastery || !entry.system?.type?.baseItem) continue;
          const doc = await pack.getDocument(entry._id);
          if (doc.system.activities?.some?.(a => a.type === 'attack')) {
            const [made] = await pc.createEmbeddedDocuments('Item', [doc.toObject()]);
            created.items.push({ actorId: pc.id, id: made.id });
            return made;
          }
        }
      }
      return null;
    };
    const blade = await findWeapon();
    if (!blade) return { fatal: 'no mastery-bearing weapon found on the PC or in any pack' };
    priorBlade = { id: blade.id, mastery: blade.system._source.mastery };
    log.push(`weapon: ${blade.name} (base ${blade.system.type.baseItem}, ships ${blade.system.mastery})`);
    priorActor[pc.id] = {
      'system.traits.weaponProf.mastery.value':
        Array.from(pc.system._source.traits?.weaponProf?.mastery?.value ?? []),
      'system.abilities.str.value': pc.system._source.abilities?.str?.value ?? 10,
      'system.abilities.dex.value': pc.system._source.abilities?.dex?.value ?? 10,
      'system.attributes.hp.value': pc.system._source.attributes?.hp?.value ?? 10
    };
    await pc.update({
      'system.traits.weaponProf.mastery.value': [blade.system.type.baseItem],
      'system.abilities.str.value': 16, 'system.abilities.dex.value': 16
    });
    const setMastery = async key => pc.items.get(blade.id).update({ 'system.mastery': key });

    if (canvas.scene?.id !== scene.id) await scene.view();
    // ⚠ Sweep LINKED strays of the two actors first: a crashed run's adjacent token is what the gate
    // would measure prone distance from. The fixture's own UNLINKED tokens stay.
    {
      const strays = scene.tokens.filter(t => t.actorLink && [pc.id, victim.id].includes(t.actorId)).map(t => t.id);
      if (strays.length) { await scene.deleteEmbeddedDocuments('Token', strays); log.push(`swept ${strays.length} linked stray token(s)`); }
    }
    const placeToken = async (actor, x, y) => {
      const [doc] = await scene.createEmbeddedDocuments('Token', [
        foundry.utils.mergeObject(actor.prototypeToken.toObject(),
          { x, y, actorId: actor.id, actorLink: true }, { inplace: false })]);
      created.tokens.push(doc.id);
      await tokenOn(doc.id);
      const token = canvas.tokens.get(doc.id);
      if (!token) throw new Error(`${actor.name}'s token never reached the canvas`);
      return { doc, token };
    };
    // Adjacent: one grid square apart (the range's grid is 5 feet a square).
    const { doc: victimTokenDoc, token: victimToken } = await placeToken(victim, 1400, 1400);
    const { doc: pcTokenDoc, token: pcToken } = await placeToken(pc, 1500, 1400);
    // The roller's token, controlled, so the gate measures from THIS one.
    pcToken.control({ releaseOthers: true });
    const gridFeet = scene.grid.distance;
    const squarePx = scene.grid.size;
    log.push(`grid: ${gridFeet} ${scene.grid.units} per ${squarePx}px square`);

    priorActor[victim.id] = {
      'system.attributes.ac.override': victim.system._source.attributes.ac.override ?? null
    };
    await victim.update({ 'system.attributes.ac.override': 1 });
    const healFull = async () => {
      await victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max, 'system.attributes.hp.temp': 0 });
      await pc.update({ 'system.attributes.hp.value': pc.system.attributes.hp.max });
    };

    // -------------------------------------------------- helpers
    const pcAttack = () => pc.items.get(blade.id).system.activities.find(a => a.type === 'attack');
    const waitDamage = async (originId, { flag = 'receipt', timeout = 10_000 } = {}) => until(() =>
      game.messages.contents.find(x => (x.type === 'damage')
        && (x._source.system?.origin === originId)
        && (!flag || x.getFlag(MOD, flag))), { timeout: timeout });
    // ⚠ `setTarget` and `control` are synchronous: the roll reads the targets at once, nothing to wait for.
    const target = token => { token.setTarget(true, { releaseOthers: true }); };
    /** A programmatic swing (no dialog): use + rollAttack with configure:false — never gated. */
    const swing = async (key, { advantage = false } = {}) => {
      await healFull();
      await setMastery(key);
      target(victimToken);
      const before = new Set([victim, pc].flatMap(a => a.effects.map(e => e.id)));
      const results = await pcAttack().use({ subsequentActions: false }, { configure: false }, {});
      const usageId = results?.message?.id ?? null;
      const rolls = await pcAttack().rollAttack({ advantage, disadvantage: false }, { configure: false },
        usageId ? { data: { 'system.origin': usageId } } : {});
      const attackMsg = rolls?.[0]?.parent ?? null;
      const originId = attackMsg?._source.system?.origin ?? attackMsg?.id;
      // soft: a fumble rolls no damage, and a swing that pays no chip is the caller's to retry (`chip: null`)
      await waitDamage(originId).catch(() => null);
      const bearer = (key === 'cleave') ? pc : victim;
      const chip = rolls?.[0]?.isFumble ? null
        : await until(() => bearer.effects.find(e => (e.getFlag(MOD, 'mastery') === key) && !before.has(e.id)), { timeout: 12_000 }).catch(() => null);
      return { attackMsg, roll: rolls?.[0] ?? null, chip: chip ?? null, fumble: !!rolls?.[0]?.isFumble };
    };
    // ⚠ Vex lands on a HIT: two plain swings both missed one run in five (2026-10-07). Up to six, with Advantage.
    const ensureVexed = async () => {
      for (let i = 0; i < 6; i++) {
        const r = await swing('vex', { advantage: true });
        if (r.chip) return r.chip;
      }
      return null;
    };
    /**
     * The click the card's Attack BUTTON makes: an event inside the usage card's element and nothing
     * else — dnd5e derives originatingMessage from that element in buildPost, AFTER the pre-roll hook.
     * ⚠ The table's shape: a gated attack must still link to its card.
     */
    const buttonEvent = async usageId => {
      const li = await until(() => document.querySelector(`.message[data-message-id="${usageId}"]`), { timeout: 4000 });
      if (!li) throw new Error(`usage card ${usageId} never reached the chat DOM`);
      return { target: li.querySelector('button[data-action="rollAttack"]') ?? li, clientY: 200,
        altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
    };
    /** The SYSTEM's own roll dialog, rendered — the gate lives inside it. */
    const rollDialog = () => [...foundry.applications.instances.values()]
      .find(app => /RollConfigurationDialog/.test(app.constructor?.name ?? '') && app.rendered && app.element) ?? null;
    /** …and the gate is that dialog carrying By the Books' section. */
    const gateOf = app => (app?.element?.querySelector('[data-bf-reminder]') ? app : null);
    const findGate = async () => {
      // soft: no system dialog at all is `system: false`
      const app = await until(rollDialog, { timeout: 6000 }).catch(() => null);
      if (!app) return { dialog: null, system: false };
      // the section rides the render hook: the gate is carried from the pre-roll, and drawn only when it has a box to show
      await until(() => {
        const g = app?.options?.bfReminder;
        return !app || !g || !((g.sources?.length > 0) || g.sneak) || app.element?.querySelector('[data-bf-reminder]');
      }, { label: 'the gate drawn in the roll dialog' });
      return { dialog: gateOf(app), system: true };
    };
    /** The HUMAN-style roll: the dialog is allowed, so the gate stands in. Returns the dialog
     * when it carries the gate's section, and whether the system dialog opened at all.
     * `flat: true` drives the sheet/use() shape instead — the flat originatingMessage key. */
    const gatedSwing = async ({ activity = null, token = null, flat = false, heal = true } = {}) => {
      if (heal) await healFull();
      target(token ?? victimToken);
      const act = activity ?? pcAttack();
      const results = await act.use({ subsequentActions: false }, { configure: false }, {});
      const usageId = results?.message?.id ?? null;
      const before = game.messages.size;
      if (flat) void act.rollAttack({}, {}, usageId ? { data: { 'system.origin': usageId } } : {});
      else void act.rollAttack({ event: await buttonEvent(usageId) }, {}, {});
      const { dialog, system } = await findGate();
      return { dialog, system, usageId, messagesBefore: before };
    };
    const defaultButton = dlg => dlg?.element?.querySelector('button[autofocus]')?.dataset?.action ?? null;
    /** Is the re-issued attack LINKED to its usage card — by flag, and in the system's own registry? */
    const linked = (msg, usageId) => (msg?._source.system?.origin === usageId)
      && (game.messages.get(usageId)?.getAssociatedRolls?.('attack') ?? []).some(m => m.id === msg?.id);
    /** The gate's section, as the table reads it (the dialog's whole text where the section is absent). */
    const popupText = dlg => ((dlg?.element?.querySelector('[data-bf-reminder]') ?? dlg?.element?.querySelector('.window-content'))?.textContent ?? '')
      .replace(/\s+/g, ' ').trim();
    /** Press one of the SYSTEM dialog's own three buttons — a submit, exactly as a click. */
    const press = async (dlg, mode) => {
      const btn = dlg?.element?.querySelector(`button[data-action="${mode}"]`);
      btn?.click();
      return !!btn;
    };
    const lastAttack = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && (m.type === 'attack')).pop() ?? null;
    const waitAttackAfter = async id => until(() => { const m = lastAttack(); return (m && (m.id !== id)) ? m : null; }, { timeout: 8000 });
    /** The attacks whose chains `settle` has waited out: each is waited for once. */
    const settledChains = new Set();
    /** Let a re-issued roll's whole chain land (damage, receipt, the mastery payout after it) before
     * the next section clears chips. The payout's effect receipt is the chain's last write. */
    const settle = async msg => {
      if (!msg || settledChains.has(msg.id)) return;
      settledChains.add(msg.id);
      const originId = msg?._source.system?.origin ?? msg?.id;
      // soft: a miss rolls no damage, and a weapon whose mastery pays nothing writes no effect receipt
      const dmg = await waitDamage(originId, { flag: 'receipt', timeout: 8000 }).catch(() => null);
      if (dmg) await until(() => game.messages.get(dmg.id)?.getFlag(MOD, 'effectReceipt'), { timeout: 5000 }).catch(() => null);
    };
    /** A section's start: any payout from the section before (the last attack's chain) lands before the clear. */
    const settleLast = () => settle(lastAttack());
    const gone = async (actor, id) => until(() => !actor.effects.get(id), { timeout: 6000 });
    const setStatus = async (actor, id, on) => {
      const carriers = actor.effects.filter(e => e.statuses?.has?.(id));
      if (on && !carriers.length) {
        const eff = await ActiveEffect.implementation.fromStatusEffect(id);
        await ActiveEffect.implementation.create(eff.toObject(), { parent: actor, keepId: true });
      } else if (!on && carriers.length) {
        await actor.deleteEmbeddedDocuments('ActiveEffect', carriers.map(e => e.id));
      }
      await until(() => actor.effects.some(e => e.statuses?.has?.(id)) === on, { label: `${actor.name} ${on ? 'carrying' : 'clear of'} ${id}` });
    };
    const cardText = id => (document.querySelector(`.message[data-message-id="${id}"]`)?.textContent ?? '').replace(/\s+/g, ' ');

    // ================================================== 1. Vex: the gate stands in
    if (want(1)) await section(1, async () => {
      await clearChips();
      const vexed = await ensureVexed();
      ok('1. (setup) the victim is Vexed by the PC', !!vexed, `vexed=${!!vexed}`);
      const before = lastAttack()?.id ?? null;
      const { dialog, usageId } = await gatedSwing();
      ok('1a. the card\'s Attack BUTTON (a click, no originatingMessage anywhere) opens the SYSTEM dialog carrying the gate\'s section',
        !!dialog, `dialog=${!!dialog} class=${rollDialog()?.constructor?.name ?? '-'}`);
      const text = popupText(dialog);
      ok('1b. the section names the source, the bend as a badge, and the net — and the dialog keeps its own situational bonus',
        /Vexed/.test(text) && /Advantage/.test(text) && /1 Modifier — Net Advantage/.test(text)
          && !!dialog?.element?.querySelector('input[name="roll.0.situational"]'),
        text.slice(0, 300));
      ok('1b2. the NET is the highlighted default — Enter presses the outcome the solver worked out (user ruling)',
        defaultButton(dialog) === 'advantage', `default=${defaultButton(dialog)}`);
      ok('1b3. the dialog\'s own choices are the dialog\'s own — the roll-mode select at least, untouched',
        !!dialog?.element?.querySelector('select[name="rollMode"]'),
        [...(dialog?.element?.querySelectorAll('select') ?? [])].map(s => s.name).join(','));
      ok('1b4. the section sits AFTER the dialog\'s CONFIGURATION fieldset and before its buttons',
        (() => {
          const s = dialog?.element?.querySelector('[data-bf-reminder]');
          const c = dialog?.element?.querySelector('[data-application-part="configuration"]');
          const b = dialog?.element?.querySelector('[data-application-part="buttons"]');
          return !!s && !!c && !!b && (c.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
            && (s.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        })(), '');
      const pressed = await press(dialog, 'advantage');
      const msg = await waitAttackAfter(before);
      const roll = msg?.rolls?.[0];
      ok('1c. pressing Advantage re-issues the roll WITH advantage — the dice went out that way',
        pressed && !!roll && (roll.options?.advantageMode === 1) && /2d20kh|2d20adv/i.test(roll.formula ?? ''),
        `pressed=${pressed} mode=${roll?.options?.advantageMode} formula=${roll?.formula}`);
      ok('1c2. the re-issued attack is LINKED to its usage card — the flag, and the system\'s own registry (the orphan finding)',
        linked(msg, usageId), `originating=${msg?._source.system?.origin} usage=${usageId}`);
      const rem = msg?.getFlag(MOD, 'reminder');
      ok('1d. the attack message carries the reminder record: the source, net advantage, mode advantage, honoured, stamped',
        !!rem && (rem.sources?.[0]?.kind === 'vex') && (rem.net === 'advantage') && (rem.mode === 'advantage')
          && (rem.honoured === true) && ('combat' in rem) && (rem.sourceUuid === pc.uuid),
        JSON.stringify(rem));
      const spend = await until(() => game.messages.get(msg?.id ?? '')?.getFlag(MOD, 'chipSpend'));
      const vexGone = await gone(victim, vexed?.id);
      ok('1e. …and the spend: the Vexed chip spent by this roll, honoured against the net',
        !!spend?.spent?.some(s => (s.id === vexed?.id) && (s.honoured === true)) && vexGone,
        `${JSON.stringify(spend?.spent)} gone=${vexGone}`);
      await until(() => /Reminded/.test(cardText(msg?.id)), { timeout: 4000 });
      ok('1f. the card SAYS it was reminded (R5): net Advantage, rolled with Advantage',
        /Reminded — net Advantage, rolled with Advantage/.test(cardText(msg?.id)), cardText(msg?.id).slice(0, 240));
      await settle(msg);
      // The other shape the hook meets: the sheet / use() auto-roll carries the id as a FLAT key.
      {
        await clearChips();
        const vexed2 = await ensureVexed();
        const before2 = lastAttack()?.id ?? null;
        const { dialog: d2, usageId: u2 } = await gatedSwing({ flat: true });
        ok('1g. the flat-key shape (a sheet roll) opens the gate too', !!d2 && !!vexed2, `dialog=${!!d2}`);
        await press(d2, 'advantage');
        const m2 = await waitAttackAfter(before2);
        ok('1h. …and its re-issue is linked to the card as well', linked(m2, u2),
          `originating=${m2?._source.system?.origin} usage=${u2}`);
        await settle(m2);
      }
    });

    // ================================================== 2. programmatic rolls never gate
    if (want(2)) await section(2, async () => {
      await clearChips();
      const vexed = await ensureVexed();
      const second = await swing('sap');
      // a window: no gate pops for the programmatic roll
      const strayGate = await watch(() => [...foundry.applications.instances.values()].some(app => /Before you roll/.test(app.title ?? '')), { ms: 300 });
      ok('2. a configure:false roll at a Vexed target is NOT gated — it rolled, no popup',
        !strayGate && !!second.roll && !second.fumble !== undefined
          && ![...foundry.applications.instances.values()].some(app => /Before you roll/.test(app.title ?? '')),
        `rolled=${!!second.roll}`);
      const spend = await until(() => game.messages.get(second.attackMsg?.id ?? '')?.getFlag(MOD, 'chipSpend'));
      ok('2a. …and the chip is still spent, honoured by its own bend (no net was shown)',
        !!spend?.spent?.some(s => (s.id === vexed?.id) && (s.honoured === false)) && !second.attackMsg?.getFlag(MOD, 'reminder'),
        JSON.stringify(spend?.spent));
    });

    // ================================================== 3. multiple sources net to NORMAL
    if (want(3)) await section(3, async () => {
      await clearChips();
      const vexed = await ensureVexed();
      // A Sapped chip on the PC — as the victim's Sap would have written it.
      const [sapped] = await ActiveEffect.implementation.create({
        name: 'Sapped', img: 'icons/svg/downgrade.svg', origin: victim.uuid,
        duration: { value: 1, units: 'rounds', expiry: 'turnStart' }, transfer: false,
        flags: { [MOD]: { mastery: 'sap' } }
      }, { parent: pc }).then(e => [e]);
      await until(() => pc.effects.get(sapped.id), { label: 'the Sapped chip on the PC' });
      const before = lastAttack()?.id ?? null;
      const { dialog } = await gatedSwing();
      const text = popupText(dialog);
      ok('3. Sapped attacker vs Vexed target: the popup lists BOTH sources',
        /Sapped/.test(text) && /Vexed/.test(text), text.slice(0, 400));
      ok('3a. …and nets to a NORMAL roll — the header line, no net block',
        /2 Modifiers — Net Normal/.test(text) && !/Net:/.test(text),
        text.slice(0, 400));
      ok('3a2. the highlighted default is the net — Normal', defaultButton(dialog) === 'normal', `default=${defaultButton(dialog)}`);
      // A GM-only roll mode chosen before the press (v14 keys `public`/`gm`/`blind`/`self`, v13
      // `publicroll`/`gmroll`/…; found by either).
      const rollModeSelect = dialog?.element?.querySelector('select[name="rollMode"]');
      const gmOption = [...(rollModeSelect?.options ?? [])].find(o => /^(gm|gmroll)$/.test(o.value));
      if (rollModeSelect && gmOption) {
        rollModeSelect.value = gmOption.value;
        rollModeSelect.dispatchEvent(new Event('change', { bubbles: true })); // the dialog reads its form on change
        await until(() => dialog.message?.rollMode === gmOption.value, { label: 'the dialog took the GM roll mode' });
      }
      await press(dialog, 'normal');
      const msg = await waitAttackAfter(before);
      const rem = msg?.getFlag(MOD, 'reminder');
      ok('3b. pressing Normal: the roll went out flat, the record says net normal / mode normal / honoured',
        (msg?.rolls?.[0]?.options?.advantageMode === 0) && (rem?.net === 'normal') && (rem?.mode === 'normal') && (rem?.honoured === true)
          && (rem?.sources?.length === 2),
        JSON.stringify({ mode: msg?.rolls?.[0]?.options?.advantageMode, rem }));
      ok('3b2. the roll-mode pick travelled with the re-issue — a GM roll is whispered',
        !!rollModeSelect && (msg?.whisper?.length ?? 0) > 0, `select=${!!rollModeSelect} whisper=${JSON.stringify(msg?.whisper)}`);
      const spend = await until(() => game.messages.get(msg?.id ?? '')?.getFlag(MOD, 'chipSpend'));
      const sapRec = spend?.spent?.find(s => s.id === sapped.id);
      const vexRec = spend?.spent?.find(s => s.id === vexed?.id);
      const bothGone = (await gone(pc, sapped.id)) && (await gone(victim, vexed?.id));
      ok('3c. BOTH chips are spent by this one roll, and both are honoured against the NET (normal)',
        !!sapRec && !!vexRec && (sapRec.honoured === true) && (vexRec.honoured === true) && bothGone,
        `${JSON.stringify(spend?.spent)} gone=${bothGone}`);
      await settle(msg);
    });

    // ================================================== 4. Prone, both roles, geometry
    if (want(4)) await section(4, async () => {
      await settleLast(); // any payout from the section before lands before the clear
      await clearChips();
      await clearStatuses();
      await setStatus(victim, 'prone', true);
      {
        const { dialog } = await gatedSwing();
        const text = popupText(dialog);
        ok('4. a prone target within 5 feet: Advantage, and the popup says the distance',
          /is Prone — within 5 feet/.test(text) && /1 Modifier — Net Advantage/.test(text), text.slice(0, 300));
        await closeGates();
      }
      // ⚠ A second, FAR token of the prone victim six squares out: moving a token runs the platform's
      // movement pipeline, and the geometry under test is the gate's.
      const { doc: farDoc, token: farToken } = await placeToken(victim, 1500 - (squarePx * 6), 1400);
      {
        const { dialog } = await gatedSwing({ token: farToken });
        const text = popupText(dialog);
        ok(`4a. the same prone target from ${gridFeet * 6} feet: Disadvantage`,
          new RegExp(`is Prone — ${gridFeet * 6} feet away`).test(text) && /1 Modifier — Net Disadvantage/.test(text), text.slice(0, 300));
        ok('4a2. …and Disadvantage is the highlighted default', defaultButton(dialog) === 'disadvantage', `default=${defaultButton(dialog)}`);
        await closeGates();
      }
      await scene.deleteEmbeddedDocuments('Token', [farDoc.id]);
      created.tokens.splice(created.tokens.indexOf(farDoc.id), 1);
      await until(() => !scene.tokens.get(farDoc.id) && !canvas.tokens.get(farDoc.id), { label: 'the far token gone from the scene and the canvas' });
      await setStatus(victim, 'prone', false);
      await setStatus(pc, 'prone', true);
      {
        const { dialog } = await gatedSwing();
        const text = popupText(dialog);
        ok('4b. a prone ATTACKER: Disadvantage', /BTB Test PC Attacker — Prone/.test(text) && /1 Modifier — Net Disadvantage/.test(text), text.slice(0, 300));
        await closeGates();
      }
      await setStatus(victim, 'prone', true);
      {
        const { dialog } = await gatedSwing();
        const text = popupText(dialog);
        ok('4c. both prone, adjacent: Advantage and Disadvantage cancel — NORMAL',
          /2 Modifiers — Net Normal/.test(text) && !/Net:/.test(text), text.slice(0, 300));
        await closeGates();
      }
      await clearStatuses();
    });

    // ================================================== 5. the condition table
    if (want(5)) await section(5, async () => {
      await settleLast(); // any payout from the section before lands before the clear
      await clearChips();
      await clearStatuses();
      await setStatus(pc, 'poisoned', true);
      {
        const { dialog } = await gatedSwing();
        const text = popupText(dialog);
        ok('5. a poisoned attacker: Disadvantage, with the glossary clause',
          /Poisoned/.test(text) && /1 Modifier — Net Disadvantage/.test(text) && /Disadvantage on attack rolls and ability checks/.test(text),
          text.slice(0, 300));
        await closeGates();
      }
      await setStatus(pc, 'poisoned', false);
      await setStatus(victim, 'blinded', true);
      {
        const { dialog } = await gatedSwing();
        const text = popupText(dialog);
        ok('5a. a blinded target: Advantage', /is Blinded/.test(text) && /1 Modifier — Net Advantage/.test(text), text.slice(0, 300));
        await closeGates();
      }
      await setStatus(victim, 'blinded', false);
      await setStatus(pc, 'incapacitated', true);
      {
        const { dialog } = await gatedSwing();
        const text = popupText(dialog);
        ok('5b. an incapacitated attacker is LISTED, not counted: the roll should not be happening, net normal',
          /Incapacitated/.test(text) && /should not be happening/.test(text) && /1 Modifier — Net Normal/.test(text), text.slice(0, 300));
        await closeGates();
      }
      await setStatus(pc, 'incapacitated', false);
      await setStatus(pc, 'frightened', true);
      {
        const { dialog } = await gatedSwing();
        const text = popupText(dialog);
        // The label is the fact alone; the quoted rule carries the condition.
        ok('5c. a frightened attacker: Disadvantage, counted, the rule quoted',
          /— Frightened/.test(text) && /while the source of fear is within line of sight/.test(text) && /1 Modifier — Net Disadvantage/.test(text),
          text.slice(0, 300));
        await closeGates();
      }
      await clearStatuses();
      // Hiding: the glossary's Unseen Attackers clause — Advantage for a hidden attacker, Disadvantage
      // against a hidden target.
      await setStatus(pc, 'hiding', true);
      {
        const { dialog } = await gatedSwing();
        const text = popupText(dialog);
        ok('5d. a HIDING attacker: Advantage, counted, the Unseen Attackers clause quoted',
          /— Hiding/.test(text) && /When a creature can’t see you, you have Advantage/.test(text) && /1 Modifier — Net Advantage/.test(text),
          text.slice(0, 300));
        await closeGates();
      }
      await clearStatuses();
      await setStatus(victim, 'hiding', true);
      {
        const { dialog } = await gatedSwing();
        const text = popupText(dialog);
        ok('5e. a HIDING target: Disadvantage',
          /is Hiding/.test(text) && /1 Modifier — Net Disadvantage/.test(text), text.slice(0, 300));
        await closeGates();
      }
      await clearStatuses();
    });

    // ================================================== 7. closing the popup rolls nothing
    if (want(7)) await section(7, async () => {
      await clearChips();
      const vexed = await ensureVexed();
      const before = lastAttack()?.id ?? null;
      const { dialog } = await gatedSwing();
      ok('7. (setup) the gate is up', !!dialog && !!vexed, `dialog=${!!dialog}`);
      await dialog?.close();
      // a window: no attack rolls off the closed popup, and the chip is not spent
      const stray = await watch(() => ((lastAttack()?.id ?? null) !== before) || !victim.effects.get(vexed?.id), { ms: 2500 });
      ok('7a. closed with the X: no attack roll was made, the Vexed chip still stands',
        !stray && ((lastAttack()?.id ?? null) === before) && !!victim.effects.get(vexed?.id),
        `newAttack=${(lastAttack()?.id ?? null) !== before} vexed=${!!victim.effects.get(vexed?.id)} stray=${!!stray}`);
    });

    // ================================================== 8. the registration FIRED
    if (want(8)) await section(8, async () => {
      ok('8. dnd5e.preRollAttack fired during this suite (the gate\'s pre-roll hook)',
        count('dnd5e.preRollAttack') > 0, `count=${count('dnd5e.preRollAttack')}`);
      ok('8a. dnd5e.postRollConfiguration fired (the record\'s hook, after the dialog closed with rolls)',
        count('dnd5e.postRollConfiguration') > 0, `count=${count('dnd5e.postRollConfiguration')}`);
      ok('8b. renderRollConfigurationDialog fired (the section\'s hook)',
        count('renderRollConfigurationDialog') > 0, `count=${count('renderRollConfigurationDialog')}`);
    });

    // ================================================== 9. a metric grid
    if (want(9)) await section(9, async () => {
      // ⚠ `measurePath` answers in the SCENE's units: on a 1.5 m grid two squares must not read "within
      // 5 feet". `canvas.grid` rebuilds from the scene document on update; restored whatever happens.
      await settleLast(); // any payout from the section before lands before the clear
      await clearChips();
      await clearStatuses();
      const priorGrid = { distance: scene.grid.distance, units: scene.grid.units };
      let farDoc = null;
      try {
        await scene.update({ 'grid.distance': 1.5, 'grid.units': 'm' });
        // soft: the log line says "NOT live" when the canvas grid never rebuilt
        const metric = await until(() => (canvas.grid?.distance === 1.5) && (canvas.grid?.units === 'm'), { timeout: 6000 }).catch(() => null);
        log.push(`metric grid: ${canvas.grid?.distance} ${canvas.grid?.units} per square (${metric ? 'live' : 'NOT live'})`);
        await setStatus(victim, 'prone', true);
        ({ doc: farDoc } = await placeToken(victim, 1500 - (squarePx * 2), 1400));
        const farToken = canvas.tokens.get(farDoc.id);
        {
          const { dialog } = await gatedSwing({ token: farToken });
          const text = popupText(dialog);
          // 3 m is 10 feet by the system's table (CONFIG.DND5E.movementUnits.m.conversion = 10/3), as the ruler reads.
          ok('9. two squares on a 1.5 m grid is 3 m = 10 feet by the system\'s own conversion — Disadvantage, judged in FEET',
            /is Prone — 10 feet away/.test(text) && /1 Modifier — Net Disadvantage/.test(text), text.slice(0, 300));
          await closeGates();
        }
        {
          const { dialog } = await gatedSwing();
          const text = popupText(dialog);
          ok('9a. one square — 1.5 m, 4.9 feet — is within 5 feet: Advantage',
            /is Prone — within 5 feet/.test(text) && /1 Modifier — Net Advantage/.test(text), text.slice(0, 300));
          await closeGates();
        }
      } finally {
        if (farDoc) {
          await scene.deleteEmbeddedDocuments('Token', [farDoc.id]).catch(() => {});
          created.tokens.splice(created.tokens.indexOf(farDoc.id), 1);
        }
        await scene.update({ 'grid.distance': priorGrid.distance, 'grid.units': priorGrid.units });
        await clearStatuses();
      }
    });

    // ================================================== 10. range, and the dropdown
    // Any RANGED attack roll — a dart (20/60) — against both glossary rules: an enemy within 5 feet,
    // beyond normal range, beyond long range. Then the dagger: melee or thrown by the dialog's dropdown.
    if (want(10)) await section(10, async () => {
      await settleLast(); // any payout from the section before lands before the clear
      await clearChips();
      await clearStatuses();
      const findRanged = async () => {
        const owned = pc.items.find(i => (i.type === 'weapon') && (i.system.range?.long > 0)
          && i.system.activities?.some?.(a => (a.type === 'attack') && (a.attack?.type?.value === 'ranged')));
        if (owned) return owned;
        const want = [];
        for (const pack of game.packs) {
          if (pack.documentName !== 'Item') continue;
          if (pack.metadata.id.startsWith('JB2A')) continue;
          let index;
          try { index = await pack.getIndex({ fields: ['type', 'name', 'system.range', 'system.properties'] }); } catch { continue; }
          for (const entry of index) {
            if ((entry.type !== 'weapon') || !(entry.system?.range?.long > 0) || (entry.system.range.long > 60)) continue;
            want.push({ pack, entry, dart: /^dart$/i.test(entry.name) });
          }
        }
        want.sort((a, b) => Number(b.dart) - Number(a.dart));
        for (const { pack, entry } of want) {
          const doc = await pack.getDocument(entry._id);
          if (!doc.system.activities?.some?.(a => (a.type === 'attack') && (a.attack?.type?.value === 'ranged'))) continue;
          const [made] = await pc.createEmbeddedDocuments('Item', [doc.toObject()]);
          created.items.push({ actorId: pc.id, id: made.id });
          return made;
        }
        return null;
      };
      const dart = await findRanged();
      if (!dart) {
        skips.push('§10 no ranged weapon with a long range ≤ 60 in any pack');
      } else {
        const normal = dart.system.range.value, long = dart.system.range.long;
        log.push(`ranged: ${dart.name} (${normal}/${long} ${dart.system.range.units})`);
        const dartAttack = () => pc.items.get(dart.id).system.activities.find(a => a.type === 'attack');
        const priorDisposition = { victim: victimTokenDoc.disposition, pc: pcTokenDoc.disposition };
        const far = [];
        try {
          await pcTokenDoc.update({ disposition: 1 });
          await victimTokenDoc.update({ disposition: -1 });   // an ENEMY, adjacent
          await until(() => (pcTokenDoc.disposition === 1) && (victimTokenDoc.disposition === -1), { label: 'the two sides set' });
          {
            const { dialog } = await gatedSwing({ activity: dartAttack() });
            const text = popupText(dialog);
            ok('10. a dart at an adjacent enemy: within 5 feet of an enemy — Disadvantage, the rule quoted, and no range box (5 feet is within normal range)',
              !!dialog && /Ranged attack within 5 feet of Hobgoblin/.test(text) && /within 5 feet of an enemy who can see you/.test(text)
                && /1 Modifier — Net Disadvantage/.test(text) && !/beyond/.test(text),
              text.slice(0, 320));
            ok('10a. …and Disadvantage is the highlighted default', defaultButton(dialog) === 'disadvantage', `default=${defaultButton(dialog)}`);
            await closeGates();
          }
          // The adjacent one stops being an enemy, so the close-combat box goes; far tokens judge the range.
          await victimTokenDoc.update({ disposition: 0 });
          const placeFar = async squares => {
            const { doc, token } = await placeToken(victim, 1500 - (squarePx * squares), 1400);
            await doc.update({ disposition: -1 });
            far.push(doc.id);
            await until(() => doc.disposition === -1, { label: 'the far token an enemy' });
            return token;
          };
          {
            const token = await placeFar(6);   // 30 feet: beyond normal 20, within long 60
            const { dialog } = await gatedSwing({ activity: dartAttack(), token });
            const text = popupText(dialog);
            ok(`10b. a dart at ${gridFeet * 6} feet — beyond normal range (${normal}/${long}): Disadvantage, and nothing about close combat`,
              !!dialog && new RegExp(`beyond normal range — ${gridFeet * 6} feet \\(${normal}/${long}\\)`).test(text)
                && /1 Modifier — Net Disadvantage/.test(text) && !/within 5 feet of/.test(text),
              text.slice(0, 320));
            await closeGates();
          }
          {
            const token = await placeFar(13);  // 65 feet: beyond long range 60
            const { dialog } = await gatedSwing({ activity: dartAttack(), token });
            const text = popupText(dialog);
            ok(`10c. a dart at ${gridFeet * 13} feet — beyond long range: LISTED, not counted — the attack cannot be made, net normal`,
              !!dialog && new RegExp(`beyond long range — ${gridFeet * 13} feet, long range ${long}: this attack cannot be made`).test(text)
                && /1 Modifier — Net Normal/.test(text) && (defaultButton(dialog) === 'normal'),
              `${text.slice(0, 320)} default=${defaultButton(dialog)}`);
            await closeGates();
          }
          {
            const token = await placeFar(3);   // 15 feet: within normal range — nothing to say, the dialog opens bare
            const { dialog, system } = await gatedSwing({ activity: dartAttack(), token });
            ok('10d. a dart within normal range at a lone enemy: no section at all — the bare system dialog', !dialog && system,
              `section=${!!dialog} system=${system}`);
            await closeGates();
          }
          // THE DROPDOWN: the dagger is melee at open (no section) and Thrown by the attack-mode select.
          {
            const token = canvas.tokens.get(far[0]); // the one at 30 feet
            const { dialog, system } = await gatedSwing({ token });
            const app = rollDialog();
            const select = app?.element?.querySelector('select[name="attackMode"]');
            const thrown = [...(select?.options ?? [])].find(o => /^thrown$/.test(o.value));
            ok('10e. the melee dagger at 30 feet opens the bare dialog — no section, no default moved',
              !dialog && system && !app?.element?.querySelector('[data-bf-reminder]'), `section=${!!dialog} system=${system}`);
            if (!select || !thrown) {
              skips.push(`§10f–g ${blade.name} offers no Thrown attack mode (modes: ${[...(select?.options ?? [])].map(o => o.value).join(',') || 'none'})`);
            } else {
              select.value = thrown.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              const grown = await until(() => app.element?.querySelector('[data-bf-reminder]'), { timeout: 4000 });
              const text = (grown?.textContent ?? '').replace(/\s+/g, ' ');
              ok('10f. switched to Thrown: the section GROWS a range box — beyond normal range, Disadvantage — and the default moves to it',
                !!grown && /beyond normal range/.test(text) && /1 Modifier — Net Disadvantage/.test(text) && (defaultButton(app) === 'disadvantage'),
                `${text.slice(0, 240)} default=${defaultButton(app)}`);
              const back = [...select.options].find(o => !/^thrown/.test(o.value));
              select.value = back.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              const gone = await until(() => !app.element?.querySelector('[data-bf-reminder]'), { timeout: 4000 });
              ok('10g. …and switched back to melee the section goes, the default back to Normal',
                gone && (defaultButton(app) === 'normal'), `gone=${gone} default=${defaultButton(app)}`);
            }
            await closeGates();
          }
        } finally {
          const liveFar = far.filter(id => scene.tokens.get(id));
          if (liveFar.length) await scene.deleteEmbeddedDocuments('Token', liveFar).catch(() => {});
          for (const id of far) { const i = created.tokens.indexOf(id); if (i >= 0) created.tokens.splice(i, 1); }
          await victimTokenDoc.update({ disposition: priorDisposition.victim }).catch(() => {});
          await pcTokenDoc.update({ disposition: priorDisposition.pc }).catch(() => {});
          await clearStatuses();
        }
      }
    });

    // ================================================== 11. effect sources
    // An ability on either sheet by NAME — an active effect or a feature — read against the effect
    // table: in scope or not, counted or listed, judged on a fact, spent where the rules spend it.
    if (want(11)) await section(11, async () => {
      await settleLast(); // any payout from the section before lands before the clear
      await clearChips();
      await clearStatuses();
      const plant = async (actor, name) => ActiveEffect.implementation.create({
        name, img: 'icons/svg/aura.svg', duration: { rounds: 10 }, transfer: false
      }, { parent: actor });
      const unplant = async () => {
        for (const a of [pc, victim]) {
          const mine = a.effects.filter(e => ['Innate Sorcery', 'Reckless', 'Demon Armor', 'Guiding Bolt'].includes(e.name));
          if (mine.length) await a.deleteEmbeddedDocuments('ActiveEffect', mine.map(e => e.id));
        }
      };
      const priorPcHp = pc.system._source.attributes.hp.value;
      let cantrip = null, packTactics = null, fury = null;
      try {
        // A ranged SPELL attack of the PC's own, for the scope test — the volleys suite's shape.
        [cantrip] = await pc.createEmbeddedDocuments('Item', [{
          name: 'BTB Test Cantrip', type: 'spell',
          system: { level: 0, school: 'evo', properties: ['vocal'], range: { value: '120', units: 'ft' }, method: 'spell', prepared: 1,
            activities: { bftestcantrip000: { _id: 'bftestcantrip000', type: 'attack', name: 'Bolt', activation: { type: 'action' },
              attack: { type: { value: 'ranged', classification: 'spell' }, bonus: '0', flat: false },
              damage: { includeBase: true, parts: [{ number: 1, denomination: 10, bonus: '', types: ['fire'] }] } } } }
        }]);
        created.items.push({ actorId: pc.id, id: cantrip.id });
        const cantripAttack = () => pc.items.get(cantrip.id).system.activities.find(a => a.type === 'attack');
        // 11a/b: Innate Sorcery — a spell-scope row: nothing on the dagger, a box on the cantrip.
        await plant(pc, 'Innate Sorcery');
        {
          const { dialog, system } = await gatedSwing();
          ok('11a. Innate Sorcery on the attacker: the DAGGER opens bare — the row is spell attacks only',
            !dialog && system, `section=${!!dialog} system=${system}`);
          await closeGates();
        }
        {
          const { dialog } = await gatedSwing({ activity: cantripAttack() });
          const text = popupText(dialog);
          // The cantrip is a RANGED spell at an adjacent enemy, so the range kind's point-blank box
          // stands beside it and the two contend — the assertion is the Innate Sorcery box itself.
          ok('11b. …and the CANTRIP meets it: an Innate Sorcery box, Advantage, its own rule (beside the range kind’s point-blank box)',
            /BTB Test PC Attacker — Innate Sorcery/.test(text) && /Sorcerer spells/.test(text)
              && !!dialog?.element?.querySelector('[data-bf-mode="advantage"]'), text.slice(0, 300));
          await closeGates();
        }
        await unplant();
        // 11c: Reckless — both sides: the attacker's own, and against a Reckless target.
        await plant(pc, 'Reckless');
        {
          const { dialog } = await gatedSwing();
          const text = popupText(dialog);
          ok('11c. Reckless on the attacker: Advantage on the weapon swing',
            /BTB Test PC Attacker — Reckless/.test(text) && /1 Modifier — Net Advantage/.test(text), text.slice(0, 300));
          await closeGates();
        }
        await unplant();
        await plant(victim, 'Reckless');
        {
          const { dialog } = await gatedSwing();
          const text = popupText(dialog);
          ok('11c2. …and Reckless on the TARGET: Advantage against it',
            /Hobgoblin is — Reckless/.test(text) && /1 Modifier — Net Advantage/.test(text), text.slice(0, 300));
          await closeGates();
        }
        await unplant();
        // 11d: Demon Armor — listed, not counted: shown, out of the net.
        await plant(pc, 'Demon Armor');
        {
          const { dialog } = await gatedSwing();
          const text = popupText(dialog);
          ok('11d. Demon Armor is LISTED: shown with its caveat, the net Normal, the tag Listed',
            /Demon Armor \(listed — Disadvantage only against demons\)/.test(text) && /1 Modifier — Net Normal/.test(text)
              && !!dialog?.element?.querySelector('[data-bf-mode="listed"]'),
            text.slice(0, 300));
          ok('11d2. …and Normal is the highlighted default', defaultButton(dialog) === 'normal', `default=${defaultButton(dialog)}`);
          await closeGates();
        }
        await unplant();
        // 11e: Pack Tactics, JUDGED ON THE MAP: nothing with no ally of the attacker within 5 feet of the
        // target; counted with one; nothing once that ally is Incapacitated. The ally is an UNLINKED token.
        [packTactics] = await pc.createEmbeddedDocuments('Item', [{ name: 'Pack Tactics', type: 'feat', system: { description: { value: '' } } }]);
        created.items.push({ actorId: pc.id, id: packTactics.id });
        const priorSides = { victim: victimTokenDoc.disposition, pc: pcTokenDoc.disposition };
        let allyDoc = null;
        try {
          await pcTokenDoc.update({ disposition: 1 });
          await victimTokenDoc.update({ disposition: -1 });
          await until(() => (pcTokenDoc.disposition === 1) && (victimTokenDoc.disposition === -1), { label: 'the two sides set' });
          {
            const { dialog, system } = await gatedSwing();
            ok('11e. Pack Tactics with no ally of the attacker within 5 feet of the target: nothing — the row is judged on the map',
              !dialog && system, `section=${!!dialog} system=${system} text="${popupText(dialog).slice(0, 200)}"`);
            await closeGates();
          }
          [allyDoc] = await scene.createEmbeddedDocuments('Token', [
            foundry.utils.mergeObject(victim.prototypeToken.toObject(),
              { x: 1400, y: 1400 + squarePx, actorId: victim.id, actorLink: false, disposition: 1, name: 'BTB Test Ally' }, { inplace: false })]);
          created.tokens.push(allyDoc.id);
          await tokenOn(allyDoc.id);
          pcToken.control({ releaseOthers: true });
          {
            const { dialog } = await gatedSwing();
            const text = popupText(dialog);
            ok('11e2. …an ally of the attacker beside the target: counted, Advantage, the rule quoted',
              /— Pack Tactics/.test(text) && /allies is within 5 feet of the creature/.test(text)
                && /1 Modifier — Net Advantage/.test(text), text.slice(0, 300));
            await closeGates();
          }
          await canvas.tokens.get(allyDoc.id)?.actor?.toggleStatusEffect('incapacitated', { active: true });
          await until(() => canvas.tokens.get(allyDoc.id)?.actor?.statuses?.has?.('incapacitated'), { label: 'the ally Incapacitated' });
          {
            const { dialog, system } = await gatedSwing();
            ok("11e3. …and that ally Incapacitated: nothing — \"the ally doesn't have the Incapacitated condition\"",
              !dialog && system, `section=${!!dialog} system=${system} text="${popupText(dialog).slice(0, 200)}"`);
            await closeGates();
          }
        } finally {
          if (allyDoc && scene.tokens.get(allyDoc.id)) await scene.deleteEmbeddedDocuments('Token', [allyDoc.id]).catch(() => {});
          if (allyDoc) { const i = created.tokens.indexOf(allyDoc.id); if (i >= 0) created.tokens.splice(i, 1); }
          await victimTokenDoc.update({ disposition: priorSides.victim }).catch(() => {});
          await pcTokenDoc.update({ disposition: priorSides.pc }).catch(() => {});
        }
        await pc.deleteEmbeddedDocuments('Item', [packTactics.id]);
        created.items.splice(created.items.findIndex(i => i.id === packTactics.id), 1);
        packTactics = null;
        // 11f: Bloodied Fury — a feature JUDGED on HP: nothing at full, a box at half.
        [fury] = await pc.createEmbeddedDocuments('Item', [{ name: 'Bloodied Fury', type: 'feat', system: { description: { value: '' } } }]);
        created.items.push({ actorId: pc.id, id: fury.id });
        {
          const { dialog, system } = await gatedSwing();
          ok('11f. Bloodied Fury at full HP: nothing — the row is judged on HP', !dialog && system, `section=${!!dialog} system=${system}`);
          await closeGates();
        }
        await pc.update({ 'system.attributes.hp.value': Math.floor(pc.system.attributes.hp.max / 2) });
        {
          const { dialog } = await gatedSwing({ heal: false });
          const text = popupText(dialog);
          ok('11f2. …and Bloodied: 1 Modifier — Net Advantage, Bloodied Fury',
            /Bloodied Fury/.test(text) && /1 Modifier — Net Advantage/.test(text), text.slice(0, 300));
          await closeGates();
        }
        await pc.update({ 'system.attributes.hp.value': priorPcHp });
        await pc.deleteEmbeddedDocuments('Item', [fury.id]);
        created.items.splice(created.items.findIndex(i => i.id === fury.id), 1);
        fury = null;
        // 11g: Guiding Bolt on the target — Advantage against it, and SPENT by the roll.
        const gb = await plant(victim, 'Guiding Bolt');
        {
          const before = lastAttack()?.id ?? null;
          const { dialog } = await gatedSwing();
          const text = popupText(dialog);
          ok('11g. Guiding Bolt on the target: Advantage against it',
            /Hobgoblin is — Guiding Bolt/.test(text) && /1 Modifier — Net Advantage/.test(text), text.slice(0, 300));
          await press(dialog, 'advantage');
          const msg = await waitAttackAfter(before);
          await gone(victim, gb.id);
          const spent = msg?.getFlag(MOD, 'chipSpend')?.spent ?? [];
          ok('11g2. …and the roll SPENDS it: the effect is gone, the receipt on the attack card names it, honoured against the net',
            !victim.effects.get(gb.id) && spent.some(s => (s.id === gb.id) && (s.key === 'effect') && (s.honoured === true)),
            JSON.stringify({ gone: !victim.effects.get(gb.id), spent }));
          await settle(msg);
        }
      } finally {
        await unplant();
        await pc.update({ 'system.attributes.hp.value': priorPcHp }).catch(() => {});
        for (const it of [cantrip, packTactics, fury].filter(Boolean)) {
          if (pc.items.get(it.id)) await pc.deleteEmbeddedDocuments('Item', [it.id]).catch(() => {});
          const i = created.items.findIndex(x => x.id === it.id); if (i >= 0) created.items.splice(i, 1);
        }
      }
    });

    // ================================================== 12. the check gate
    // A check or skill rolled WITH the dialog meets the roller's statuses against CHECK_BENDS inside the
    // system's check dialog. Poisoned is a bend the platform already rolls; Frightened is the gate's own.
    // 12a green also proves dnd5e.preRollAbilityCheck FIRED.
    if (want(12)) await section(12, async () => {
      await clearStatuses();
      await closeGates();
      const pressCheck = app => app?.element?.querySelector('[data-application-part="buttons"] button[autofocus]')
        ?? app?.element?.querySelector('[data-application-part="buttons"] button[data-action="normal"]');
      /** Roll a check WITH the dialog: wait for the system's dialog, read our section off it (or
       * note its absence), press the named button, and hand back the roll's message and record. */
      const gatedCheck = async ({ skill = null, action = 'normal' } = {}) => {
        const p = skill ? pc.rollSkill({ skill }, { configure: true }, {}) : pc.rollAbilityCheck({ ability: 'str' }, { configure: true }, {});
        // soft: no dialog at all is read as `sys` absent
        const sys = await until(rollDialog, { timeout: 6000 }).catch(() => null);
        // the check gate is carried from the pre-roll and drawn at render, only when it has a source
        await until(() => {
          const g = sys?.options?.bfCheckGate;
          return !sys || !(g?.sources?.length > 0) || sys.element?.querySelector('[data-bf-reminder]');
        }, { label: 'the check gate drawn in the check dialog' });
        const app = gateOf(sys);
        const text = app ? popupText(app) : '';
        const def = sys ? defaultButton(sys) : null;
        if (sys) (sys.element?.querySelector(`[data-application-part="buttons"] button[data-action="${action}"]`) ?? pressCheck(sys))?.click();
        const rolls = await p;
        const msg = rolls?.[0]?.parent ?? null;
        return { sys, app, text, def, rolls, msg, record: msg?.getFlag(MOD, 'reminder') ?? null };
      };
      await setStatus(pc, 'poisoned', true);
      const a = await gatedCheck();
      ok('12a. a Poisoned check meets the gate inside the system\'s check dialog: "— Poisoned", the glossary clause, 1 Modifier — Net Disadvantage, Disadvantage highlighted',
        !!a.app && /— Poisoned/.test(a.text) && /ability checks/.test(a.text) && /1 Modifier — Net Disadvantage/.test(a.text) && (a.def === 'disadvantage'),
        `dialog=${!!a.sys} gate=${!!a.app} default=${a.def} text="${a.text.replace(/\s+/g, ' ').slice(0, 160)}"`);
      ok('12b. the press is recorded on the check message: net Disadvantage, Normal pressed, not honoured, the source named',
        !!a.record && (a.record.net === 'disadvantage') && (a.record.mode === 'normal') && (a.record.honoured === false)
          && a.record.sources?.some(s => /Poisoned/.test(s.label)),
        JSON.stringify(a.record));
      await setStatus(pc, 'poisoned', false);
      await setStatus(pc, 'frightened', true);
      const b = await gatedCheck({ skill: 'ath', action: 'disadvantage' });
      ok('12c. a Frightened SKILL check meets the same gate — the label the fact alone, the line-of-sight caveat the quoted rule\'s — and Disadvantage pressed is honoured',
        !!b.app && /— Frightened/.test(b.text) && /line of sight/.test(b.text) && !/press Normal/.test(b.text)
          && (b.record?.net === 'disadvantage') && (b.record?.mode === 'disadvantage') && (b.record?.honoured === true),
        `dialog=${!!b.sys} gate=${!!b.app} record=${JSON.stringify(b.record)}`);
      const c = await pc.rollAbilityCheck({ ability: 'str' }, { configure: false }, {});
      ok('12d. a programmatic check (configure: false) is never gated — no dialog, no record',
        !!c?.[0] && !c[0].parent?.getFlag(MOD, 'reminder') && !rollDialog(),
        `rolled=${!!c?.[0]} record=${!!c?.[0]?.parent?.getFlag(MOD, 'reminder')} dialog=${!!rollDialog()}`);
      await setStatus(pc, 'frightened', false);
      const d = await gatedCheck();
      ok('12e. a clean roller gets the system\'s dialog with NO section and leaves no record',
        !!d.sys && !d.app && !d.record, `dialog=${!!d.sys} gate=${!!d.app} record=${!!d.record}`);
      await clearStatuses();
      await closeGates();
    });

    // ================================================== 13. the range cancellers
    if (want(13)) await section(13, async () => {
      await settleLast(); // any payout from the section before lands before the clear
      await clearChips();      // an earlier section's Vex on the target would count in the net
      await clearStatuses();
      await closeGates();
      const findPHB = async (name, type) => {
        for (const pack of game.packs.filter(pk => (pk.metadata.packageName === 'dnd-players-handbook') && (pk.documentName === 'Item'))) {
          const hit = (await pack.getIndex({ fields: ['type'] })).find(e => (e.name === name) && (e.type === type));
          if (hit) return pack.getDocument(hit._id);
        }
        return null;
      };
      const give = async data => {
        const [made] = await pc.createEmbeddedDocuments('Item', [data]);
        created.items.push({ actorId: pc.id, id: made.id });
        return made;
      };
      const drop = async item => {
        if (!item) return;
        if (pc.items.get(item.id)) await pc.deleteEmbeddedDocuments('Item', [item.id]).catch(() => {});
        const i = created.items.findIndex(x => x.id === item.id); if (i >= 0) created.items.splice(i, 1);
      };
      const feat = name => give({ name, type: 'feat', system: { description: { value: '' } } });
      const priorSides = { victim: victimTokenDoc.disposition, pc: pcTokenDoc.disposition };
      const priorOverride = victim.system._source.attributes.ac.override ?? null;
      const far = [];
      let xbowItem = null, dartItem = null, cantrip = null;
      try {
        const xbowSrc = await findPHB('Light Crossbow', 'weapon');
        const dartSrc = await findPHB('Dart', 'weapon');
        if (!xbowSrc || !dartSrc) throw new Error('the PHB Light Crossbow or Dart is not on this box');
        xbowItem = await give(xbowSrc.toObject());
        dartItem = await give(dartSrc.toObject());
        const attackOf = item => pc.items.get(item.id).system.activities.find(a => a.type === 'attack');
        await pcTokenDoc.update({ disposition: 1 });
        await victimTokenDoc.update({ disposition: -1 });   // an ENEMY, adjacent
        await until(() => (pcTokenDoc.disposition === 1) && (victimTokenDoc.disposition === -1), { label: 'the two sides set' });
        // 13a — Crossbow Expert
        let ce = await feat('Crossbow Expert');
        {
          const { dialog } = await gatedSwing({ activity: attackOf(xbowItem) });
          const text = popupText(dialog);
          ok('13a. Crossbow Expert, a Light Crossbow at an adjacent enemy: the point-blank row LISTED — "Crossbow Expert: no Disadvantage" — net Normal',
            !!dialog && /within 5 feet of Hobgoblin — Crossbow Expert: no Disadvantage/.test(text) && /1 Modifier — Net Normal/.test(text)
              && (defaultButton(dialog) === 'normal'), `${text.slice(0, 300)} default=${defaultButton(dialog)}`);
          await closeGates();
        }
        {
          const { dialog } = await gatedSwing({ activity: attackOf(dartItem) });
          const text = popupText(dialog);
          ok('13b. …and a DART is no crossbow: the row counts, net Disadvantage', /1 Modifier — Net Disadvantage/.test(text) && !/Crossbow Expert/.test(text),
            text.slice(0, 300));
          await closeGates();
        }
        await drop(ce); ce = null;
        // 13c — Sharpshooter at long range
        let ss = await feat('Sharpshooter');
        await victimTokenDoc.update({ disposition: 0 });
        const placeFar = async squares => {
          const { doc, token } = await placeToken(victim, 1500 - (squarePx * squares), 1400);
          await doc.update({ disposition: -1 });
          far.push(doc.id);
          await until(() => doc.disposition === -1, { label: 'the far token an enemy' });
          return token;
        };
        const at30 = await placeFar(6);
        {
          const { dialog } = await gatedSwing({ activity: attackOf(dartItem), token: at30 });
          const text = popupText(dialog);
          ok('13c. Sharpshooter, a dart at 30 feet (20/60): "beyond normal range … — Sharpshooter: no Disadvantage", net Normal',
            !!dialog && /beyond normal range — .* — Sharpshooter: no Disadvantage/.test(text) && /1 Modifier — Net Normal/.test(text), text.slice(0, 300));
          await closeGates();
        }
        // 13d — Half Cover: the recorded AC, the card line, the gate's box
        await victim.update({ 'system.attributes.ac.override': null });
        const at15 = await placeFar(3);
        const coverTarget = at15.actor;
        await coverTarget.toggleStatusEffect('coverHalf', { active: true });
        await until(() => coverTarget.statuses?.has?.('coverHalf'), { label: 'Half Cover on the target' });
        const acWith = Number(coverTarget.system.attributes.ac.value);
        const cover = Number(coverTarget.system.attributes.ac.cover);
        // The attack's AC and its cover flags are written on the message before it is created; its lines are the card's render.
        const shoot = async () => {
          target(at15);
          const rolls = await attackOf(dartItem).rollAttack({}, { configure: false }, {});
          const msg = rolls?.[0]?.parent ?? null;
          if (msg) await until(() => document.querySelector(`.message[data-message-id="${msg.id}"]`), { label: 'the attack card in the chat log' });
          return msg;
        };
        const shot = await shoot();
        const recorded = shot?.system?.targets?.[0]?.ac;
        // soft: no line reads as '' in 13d
        const line = (await until(() => document.querySelector(`.message[data-message-id="${shot?.id}"] .bf-cover-line`), { timeout: 4000 }).catch(() => null))?.dataset?.bfCoverLine ?? '';
        ok(`13d. Half Cover (+${cover}): Sharpshooter's attack RECORDS AC ${acWith - cover}, not ${acWith}; the card says "Sharpshooter — ignores …'s cover (+${cover} AC)"`,
          (cover === 2) && (recorded === acWith - cover) && (shot?.getFlag(MOD, 'coverIgnored')?.feature === 'Sharpshooter')
            && /Sharpshooter — ignores .*cover \(\+2 AC\)/.test(line), `cover=${cover} acWith=${acWith} recorded=${recorded} line="${line}"`);
        {
          const { dialog } = await gatedSwing({ activity: attackOf(dartItem), token: at15 });
          const text = popupText(dialog);
          ok('13e. …and the gate LISTS the cover: "cover (+2 AC) — Sharpshooter ignores it", nothing counted', !!dialog
            && /cover \(\+2 AC\) — Sharpshooter ignores it/.test(text) && /Net Normal/.test(text), text.slice(0, 300));
          await closeGates();
        }
        await drop(ss); ss = null;
        const plain = await shoot();
        const stray13f = await watch(() => game.messages.get(plain?.id ?? '')?.getFlag(MOD, 'coverIgnored'), { ms: 400 });   // a window: nothing ignores the cover
        ok(`13f. without the feat the cover stands: the attack records AC ${acWith}, no line`, !stray13f && (plain?.system?.targets?.[0]?.ac === acWith)
          && !plain?.getFlag(MOD, 'coverIgnored'), `recorded=${plain?.system?.targets?.[0]?.ac} stray=${!!stray13f}`);
        await coverTarget.toggleStatusEffect('coverHalf', { active: false });
        // 13g — Spell Sniper answers a cantrip's point-blank row
        await victimTokenDoc.update({ disposition: -1 });
        cantrip = await give({
          name: 'BTB Test Cantrip', type: 'spell',
          system: { level: 0, school: 'evo', properties: ['vocal'], range: { value: '120', units: 'ft' }, method: 'spell', prepared: 1,
            activities: { bftestcantrip000: { _id: 'bftestcantrip000', type: 'attack', name: 'Bolt', activation: { type: 'action' },
              attack: { type: { value: 'ranged', classification: 'spell' }, bonus: '0', flat: false },
              damage: { includeBase: true, parts: [{ number: 1, denomination: 10, bonus: '', types: ['fire'] }] } } } }
        });
        let sn = await feat('Spell Sniper');
        {
          const { dialog } = await gatedSwing({ activity: attackOf(cantrip) });
          const text = popupText(dialog);
          ok('13g. Spell Sniper, a cantrip at an adjacent enemy: the point-blank row listed — "Spell Sniper: no Disadvantage"',
            !!dialog && /Spell Sniper: no Disadvantage/.test(text) && /Net Normal/.test(text), text.slice(0, 300));
          await closeGates();
        }
        await drop(sn); sn = null;
      } finally {
        await closeGates();
        const liveFar = far.filter(id => scene.tokens.get(id));
        if (liveFar.length) await scene.deleteEmbeddedDocuments('Token', liveFar).catch(() => {});
        for (const id of far) { const i = created.tokens.indexOf(id); if (i >= 0) created.tokens.splice(i, 1); }
        await victim.update({ 'system.attributes.ac.override': priorOverride }).catch(() => {});
        await victimTokenDoc.update({ disposition: priorSides.victim }).catch(() => {});
        await pcTokenDoc.update({ disposition: priorSides.pc }).catch(() => {});
        for (const name of ['Crossbow Expert', 'Sharpshooter', 'Spell Sniper']) {
          const left = pc.items.filter(i => (i.type === 'feat') && (i.name === name) && created.items.some(c => c.id === i.id));
          for (const it of left) await drop(it);
        }
        for (const it of [xbowItem, dartItem, cantrip]) await drop(it);
        await clearStatuses();
      }
    });

    if (want(14)) await section(14, async () => {
      await settleLast(); // any payout from the section before lands before the clear
      await clearChips();
      await clearStatuses();
      await closeGates();
      const findPHB = async (name, type) => {
        for (const pack of game.packs.filter(pk => (pk.metadata.packageName === 'dnd-players-handbook') && (pk.documentName === 'Item'))) {
          const hit = (await pack.getIndex({ fields: ['type'] })).find(e => (e.name === name) && (e.type === type));
          if (hit) return pack.getDocument(hit._id);
        }
        return null;
      };
      const give = async data => {
        const [made] = await pc.createEmbeddedDocuments('Item', [data]);
        created.items.push({ actorId: pc.id, id: made.id });
        return made;
      };
      const drop = async item => {
        if (!item) return;
        if (pc.items.get(item.id)) await pc.deleteEmbeddedDocuments('Item', [item.id]).catch(() => {});
        const i = created.items.findIndex(x => x.id === item.id); if (i >= 0) created.items.splice(i, 1);
      };
      const coverScene = victimTokenDoc.parent;
      const priorNoCover = coverScene.getFlag(MOD, 'noCover') ?? null;
      // the hover card's setting, put back to what the run had at this section's start
      const hover = snapshotSettings(['effectHover']);
      const priorOverride = victim.system._source.attributes.ac.override ?? null;
      const priorVictimAt = { x: victimTokenDoc.x, y: victimTokenDoc.y };
      const walls = [];
      let farDoc = null, dartItem = null, ss = null;
      try {
        await coverScene.unsetFlag(MOD, 'noCover');
        await hover.set('effectHover', true);
        await victim.update({ 'system.attributes.ac.override': null });
        const dartSrc = await findPHB('Dart', 'weapon');
        if (!dartSrc) throw new Error('the PHB Dart is not on this box');
        dartItem = await give(dartSrc.toObject());
        const dart = () => pc.items.get(dartItem.id).system.activities.find(a => a.type === 'attack');
        // the far victim three squares out along the row; the adjacent victim stands between
        const placed = await placeToken(victim, 1500 - (squarePx * 3), 1400);
        farDoc = placed.doc;
        const far = placed.token;
        const others = canvas.tokens.placeables.filter(t => ![far, pcToken, victimToken].includes(t)).map(t => `${t.name}@${t.document.x},${t.document.y}`);
        log.push(`§14 other tokens on the scene: ${others.join('; ') || 'none'}`);
        const baseAC = Number(victim.system.attributes.ac.value);
        // the section labels are drawn in capitals (text-transform), so innerText reads "COVER" — match the label /i
        // ⚠ The hover card is drawn inside the `hoverToken` call (effect-view.js), and cover is measured off the token
        // documents and the walls' edges: nothing to wait for once the hook returns.
        const hoverText = async () => {
          pcToken.control({ releaseOthers: true });
          Hooks.callAll('hoverToken', far, true);
          const card = document.querySelector('.bf-ev-card');
          const text = card?.innerText?.replace(/\s+/g, ' ') ?? '';
          Hooks.callAll('hoverToken', far, false);
          return text;
        };
        // The attack's AC and its cover flags are written on the message before it is created; its rows are the card's render.
        const shoot = async () => {
          far.setTarget(true, { releaseOthers: true });
          const rolls = await dart().rollAttack({}, { configure: false }, {});
          const msg = rolls?.[0]?.parent ?? null;
          if (msg) await until(() => document.querySelector(`.message[data-message-id="${msg.id}"]`), { label: 'the attack card in the chat log' });
          return msg;
        };
        const lineOf = msg => document.querySelector(`.message[data-message-id="${msg?.id}"] .bf-cover-measured`)?.dataset?.bfCoverMeasured ?? '';
        /** The cover row once it is drawn; soft: no row reads as ''. */
        const lineSoon = msg => until(() => lineOf(msg) || null, { timeout: 4000 }).catch(() => '');
        // a wall's edge is set as the document is created and dropped as it is deleted (WallDocument#initializeEdge)
        const addWall = async (c, data = {}) => {
          const [w] = await scene.createEmbeddedDocuments('Wall', [{ c, ...data }]);
          walls.push(w.id);
          await until(() => scene.walls.get(w.id)?.edge, { label: 'the wall\'s edge in place' });
        };
        const clearWalls = async () => {
          const live = walls.filter(id => scene.walls.get(id));
          if (live.length) await scene.deleteEmbeddedDocuments('Wall', live);
          walls.length = 0;
          await until(() => live.every(id => !scene.walls.get(id)), { label: 'the walls gone' });
        };

        // 14a/b — a creature in the way: Half, on the card and on the attack
        {
          const text = await hoverText();
          ok('14a. hovering the far victim with the attacker selected: the card opens with "Half Cover (+2 AC)" over "Hobgoblin in the way"',
            /Cover Half Cover \(\+2 AC\) .*in the way/i.test(text) && /Effects/i.test(text), text.slice(0, 200));
          const shot = await shoot();
          const rec = shot?.system?.targets?.[0]?.ac;
          const line = await lineSoon(shot);
          ok(`14b. …and the attack RECORDS AC ${baseAC + 2} (base ${baseAC} + 2); the card says "Cover — the …: Half Cover (+2 AC) · Hobgoblin in the way", the hover's words`,
            (rec === baseAC + 2) && (shot?.getFlag(MOD, 'coverMeasured')?.targets?.[0]?.bonus === 2) && /Cover — .*Half Cover \(\+2 AC\) · .*in the way/.test(line)
              && !!shot?.getFlag(MOD, 'coverMeasured')?.targets?.[0]?.cause && text.includes(shot.getFlag(MOD, 'coverMeasured').targets[0].cause),
            `recorded=${rec} base=${baseAC} line="${line}"`);
        }
        // 14c — the line cleared: No Cover, the base AC, no line
        await victimTokenDoc.update({ y: 1400 + (squarePx * 3) });
        await until(() => victimTokenDoc.y === 1400 + (squarePx * 3), { label: 'the adjacent victim stepped down' });
        {
          const text = await hoverText();
          const shot = await shoot();
          const stray = await watch(() => lineOf(shot), { ms: 400 });   // a window: no cover row drawn
          ok('14c. the adjacent victim stepped out of the line: "No Cover" on the card; the attack records the base AC and its card draws NO cover row',
            !stray && /Cover No Cover/i.test(text) && (shot?.system?.targets?.[0]?.ac === baseAC) && !shot?.getFlag(MOD, 'coverMeasured') && !lineOf(shot),
            `card="${text.slice(0, 120)}" recorded=${shot?.system?.targets?.[0]?.ac} stray=${!!stray}`);
        }
        // 14d — a wall across the whole row between them: Total, the attack records no AC, Sharpshooter or not
        const midX = 1500 - (squarePx * 1.5);
        await addWall([midX, 1400 - (squarePx * 6), midX, 1400 + (squarePx * 6)]);
        ss = await give({ name: 'Sharpshooter', type: 'feat', system: { description: { value: '' } } });
        {
          const text = await hoverText();
          const shot = await shoot();
          const line = await lineSoon(shot);
          ok('14d. a wall across the line: "Total Cover" over "a wall in the way"; the attack records NO AC (a miss) even with Sharpshooter, and says why',
            /Total Cover a wall in the way/.test(text) && (shot?.system?.targets?.[0]?.ac === null) && /the .*: Total Cover$/.test(line)
              && !shot?.getFlag(MOD, 'coverIgnored'), `card="${text.slice(0, 120)}" recorded=${shot?.system?.targets?.[0]?.ac} line="${line}"`);
        }
        await clearWalls();
        // 14e — a wall's corner: two of the best corner's four lines blocked, Half; Sharpshooter takes it off
        await addWall([midX, 1400 - (squarePx * 6), midX, 1400 + (squarePx * 0.8)]);
        {
          const text = await hoverText();
          const shot = await shoot();
          ok('14e. a wall\'s corner: "Half Cover (+2 AC)" over "a wall in the way · Sharpshooter ignores it (ranged weapon attacks)"; the attack records the base AC and says Sharpshooter ignored the cover',
            /Cover Half Cover \(\+2 AC\) a wall in the way · Sharpshooter ignores it \(ranged weapon attacks\)/i.test(text)
              && (shot?.system?.targets?.[0]?.ac === baseAC) && (shot?.getFlag(MOD, 'coverIgnored')?.targets?.[0]?.cover === 2),
            `card="${text.slice(0, 200)}" recorded=${shot?.system?.targets?.[0]?.ac}`);
        }
        await drop(ss); ss = null;
        // 14f — a hand-set Three-Quarters over a measured Half: the most protective stands, nothing added
        await victim.toggleStatusEffect('coverThreeQuarters', { active: true });
        await until(() => victim.statuses?.has?.('coverThreeQuarters'), { label: 'Three-Quarters Cover on the victim' });
        {
          const acWith = Number(victim.system.attributes.ac.value);
          const shot = await shoot();
          const line = await lineSoon(shot);
          ok(`14f. a hand-set Three-Quarters Cover (AC ${acWith}) over a measured Half: the attack records AC ${acWith} — the degrees never add — and the card names the one that stands`,
            (acWith === baseAC + 5) && (shot?.system?.targets?.[0]?.ac === acWith) && /the .*: Three-Quarters Cover \(\+5 AC\)$/.test(line),
            `acWith=${acWith} recorded=${shot?.system?.targets?.[0]?.ac}`);
        }
        await victim.toggleStatusEffect('coverThreeQuarters', { active: false });
        await until(() => !victim.statuses?.has?.('coverThreeQuarters'), { label: 'Three-Quarters Cover off the victim' });
        await clearWalls();
        // 14g — the full-row wall again, drawn with Sight None (a wall for bodies alone): seen past, no cover
        const across = [midX, 1400 - (squarePx * 6), midX, 1400 + (squarePx * 6)];
        await addWall(across, { sight: CONST.WALL_SENSE_TYPES.NONE });
        {
          const text = await hoverText();
          const shot = await shoot();
          const stray = await watch(() => lineOf(shot), { ms: 400 });
          ok('14g. a wall across the line with Sight None: "No Cover" on the hover card; the attack records the base AC and draws NO cover row',
            !stray && /Cover No Cover/i.test(text) && (shot?.system?.targets?.[0]?.ac === baseAC) && !shot?.getFlag(MOD, 'coverMeasured'),
            `card="${text.slice(0, 120)}" recorded=${shot?.system?.targets?.[0]?.ac} stray=${!!stray}`);
        }
        await clearWalls();
        // 14h — the same wall with Sight Limited (a terrain wall: a hedge, a low wall): Half at most, named as such
        await addWall(across, { sight: CONST.WALL_SENSE_TYPES.LIMITED });
        {
          const text = await hoverText();
          const shot = await shoot();
          const line = await lineSoon(shot);
          ok(`14h. a wall across the line with Sight Limited: "Half Cover (+2 AC)" over "a limited sight wall in the way" on the hover and the card; the attack records AC ${baseAC + 2}`,
            /Cover Half Cover \(\+2 AC\) a limited sight wall in the way/i.test(text) && (shot?.system?.targets?.[0]?.ac === baseAC + 2)
              && /the .*: Half Cover \(\+2 AC\) · a limited sight wall in the way$/.test(line),
            `card="${text.slice(0, 160)}" recorded=${shot?.system?.targets?.[0]?.ac} line="${line}"`);
        }
        await clearWalls();
      } finally {
        await closeGates();
        await clearStatuses();
        const liveWalls = walls.filter(id => scene.walls.get(id));
        if (liveWalls.length) await scene.deleteEmbeddedDocuments('Wall', liveWalls).catch(() => {});
        if (farDoc && scene.tokens.get(farDoc.id)) await scene.deleteEmbeddedDocuments('Token', [farDoc.id]).catch(() => {});
        if (farDoc) { const i = created.tokens.indexOf(farDoc.id); if (i >= 0) created.tokens.splice(i, 1); }
        await victimTokenDoc.update(priorVictimAt).catch(() => {});
        await victim.update({ 'system.attributes.ac.override': priorOverride }).catch(() => {});
        await drop(ss);
        await drop(dartItem);
        if (priorNoCover) await coverScene.setFlag(MOD, 'noCover', priorNoCover).catch(() => {});
        for (const failed of await hover.restore()) log.push(`§14 settings ERROR: ${failed}`);
        pcToken.control({ releaseOthers: true });
      }
    });

    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  } finally {
    await teardown();
    for (const a of [victim, pc].filter(Boolean)) {
      try { await a.longRest?.({ dialog: false, chat: false }); } catch { /* fine */ }
    }
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: 'reminders', out, plan, f });
