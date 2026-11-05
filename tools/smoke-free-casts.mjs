// Free-casts smoke suite: a granted spell's free cast first, then the slots (cast-ways.js, free-casts.js). The shape is
// dnd5e's own for Fiendish Legacy, Magic Initiate, Fey Touched and Paladin's Smite: a copy with one use and a
// "(free casting)" forward spending it. BTB Test Goliath (a Fighter: no spell slots) is lent two copies of Hellish
// Rebuke — the granted one (its use, its forward, the "spell" method) and a Pact Magic one — and given two Pact slots
// by override (level 1), so a cast that falls to dnd5e's default slot asks for a level 1 spell slot it does not have.
// Fixtures (tools/fixture-suite.mjs): BTB Test Goliath, BTB Test Victim the damager. Everything written is restored.
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from './harness.mjs';

// The coverage map (tools/coverage-map.mjs) parses this; ⚠ never import a suite (it connects on evaluation).
export const COVERS = [
  'rebukes.js',     // §1-§4 — the rebuke's offer and drive paid the shared way: the free cast, then the Pact slot, nothing when neither
  'free-casts.js'   // §5 — the sheet's cast window: the picker's twin gone, the ways as pills (the free cast picked, then greyed with the Pact slot picked), a sibling copy's free cast, a pick overridden
];

const SECTIONS = {
  1: 'the free cast first: damage from the Victim offers Hellish Rebuke at "a Reaction · the free cast (1 of 1 left)"; Use casts it through the granted copy — its use spent, both Pact slots standing',
  2: 'the free cast spent: the next damage offers it at "a Reaction, a Pact slot (level 1)"; Use casts through the Pact Magic copy — a Pact slot spent, no "no spell slots" error',
  3: 'the granted copy alone, its free cast spent: the offer still stands at a Pact slot; Use casts it through the granted copy WITH the Pact slot (dnd5e\'s own default asks for a level 1 spell slot)',
  4: 'nothing left (the free cast spent, no Pact slot): no Hellish Rebuke is offered',
  5: 'the cast window: the granted copy skips the picker (its "(free casting)" twin gone), the window shows the ways as pills, the free cast picked and the system\'s slot line hidden and unticked; Cast spends the use and no slot. Again: the free pill greyed, the Pact slot picked; Cast spends a Pact slot. The Pact Magic copy clicked with the free cast left: the free pill picked, Cast spends the granted copy\'s use. The Pact pill picked over the free cast left: Cast spends a Pact slot, the use untouched',
  6: 'the player\'s pick in the rebuke popup: the free cast left and picked by default; the Pact pill picked instead, Use spends a Pact slot through the Pact Magic copy and leaves the free cast standing'
};
const DEPENDS = { 2: [1], 3: [2], 4: [3] };

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'free-casts', watchdogMs: 600_000 });
announcePlan('free-casts', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, watch, canvasReady, tokenOn, snapshotSettings, unrig } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const suiteStart = Date.now();

  const mod = game.modules.get(MOD);
  if (!mod?.active) return { fatal: `module active=${mod?.active}` };
  const { livePopups } = await import(`/modules/${MOD}/scripts/ui.js`);

  const SETTING_KEYS = ['autoDamage', 'autoApply', 'playerRollDamage', 'damageTimer', 'dramaticBeat', 'requireTarget',
    'reactionHold', 'holdTimer', 'saves', 'castApply', 'concMode', 'reminderList', 'damageEitherList',
    'rebukeList', 'interruptList', 'clockRiderList'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { set } = settings;
  const def = k => game.settings.settings.get(`${MOD}.${k}`)?.default;

  const scene = game.scenes.getName('By the Books Test Range');
  const victim = game.actors.getName('BTB Test Victim');
  const gol = game.actors.getName('BTB Test Goliath');
  if (!scene || !victim || !gol) return { fatal: 'missing fixture: scene, BTB Test Victim or BTB Test Goliath — run tools/fixture-suite.mjs' };

  const created = { tokens: [], items: [] };
  const priorActor = {};
  const errors = [];
  const wasError = ui.notifications.error;
  ui.notifications.error = function(...args) { errors.push(String(args[0]?.message ?? args[0])); return wasError.apply(this, args); };
  let restored = false;
  const usageApps = () => [...foundry.applications.instances.values()].filter(a => /UsageDialog/.test(a.constructor?.name ?? ''));
  const closeWindows = async () => {
    for (const a of usageApps()) { try { await a.close(); } catch { /* gone */ } }
    for (const app of livePopups.values()) { try { await app.close(); } catch { /* gone */ } }
  };
  const teardown = async () => {
    if (restored) return;
    restored = true;
    unrig();
    ui.notifications.error = wasError;
    await closeWindows();
    for (const failed of await settings.restore()) log.push(`TEARDOWN settings ERROR: ${failed}`);
    try {
      const mine = gol.effects.filter(e => /^Reaction — used$/.test(e.name)).map(e => e.id);
      if (mine.length) await gol.deleteEmbeddedDocuments('ActiveEffect', mine).catch(() => {});
      const lent = created.items.filter(id => gol.items.get(id));
      if (lent.length) await gol.deleteEmbeddedDocuments('Item', lent);
      const liveTokens = created.tokens.filter(id => scene.tokens.get(id));
      if (liveTokens.length) await scene.deleteEmbeddedDocuments('Token', liveTokens);
      for (const [actorId, data] of Object.entries(priorActor)) await game.actors.get(actorId)?.update(data);
      const msgs = game.messages.filter(m => (m.timestamp >= suiteStart)
        && (m.speaker?.alias?.startsWith?.('BTB Test') || m.speaker?.alias === 'By the Books' || Object.keys(m.flags?.[MOD] ?? {}).length));
      if (msgs.length) await ChatMessage.deleteDocuments(msgs.map(m => m.id));
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
    await set('reactionHold', false);
    await set('holdTimer', 30);
    await set('saves', true);
    await set('castApply', true);
    await set('concMode', 'off');
    await set('reminderList', '');
    await set('damageEitherList', '');
    await set('clockRiderList', '');
    await set('interruptList', '');            // Stone's Endurance is the Goliath suite's
    await set('rebukeList', def('rebukeList'));

    // ---- fixtures
    if (canvas.scene?.id !== scene.id) await scene.view();
    await canvasReady();
    const strays = scene.tokens.filter(t => [victim.id, gol.id].includes(t.actorId)).map(t => t.id);
    if (strays.length) await scene.deleteEmbeddedDocuments('Token', strays);
    const placeToken = async (actor, x, y) => {
      const [doc] = await scene.createEmbeddedDocuments('Token', [
        foundry.utils.mergeObject(actor.prototypeToken.toObject(), { x, y, actorId: actor.id, actorLink: true, width: 1, height: 1 }, { inplace: false })]);
      created.tokens.push(doc.id);
      await tokenOn(doc.id);
      return doc;
    };
    const g = scene.grid.size;
    await placeToken(gol, 1 * g, 12 * g);
    await placeToken(victim, 7 * g, 12 * g);   // 30 ft: inside Hellish Rebuke's 60
    const src = gol.system._source;
    priorActor[gol.id] = { 'system.attributes.hp.value': src.attributes.hp.value, 'system.attributes.hp.max': src.attributes.hp.max,
      'system.spells.pact.override': src.spells?.pact?.override ?? null, 'system.spells.pact.value': src.spells?.pact?.value ?? 0 };
    priorActor[victim.id] = { 'system.attributes.hp.value': victim.system._source.attributes.hp.value, 'system.attributes.hp.max': victim.system._source.attributes.hp.max };
    for (const a of [gol, victim]) await a.update({ 'system.attributes.hp.max': 400, 'system.attributes.hp.value': 400 });
    await gol.update({ 'system.spells.pact.override': 2, 'system.spells.pact.value': 2 });
    const pact = () => gol.system.spells?.pact ?? {};
    await until(() => (Number(pact().max) === 2) && (Number(pact().value) === 2), { label: 'the Goliath at two Pact slots' });
    const spell1 = Number(gol.system.spells?.spell1?.max) || 0;
    if (spell1) return { fatal: `BTB Test Goliath has ${spell1} level 1 spell slots — the suite needs none`, results, log, skips };

    // The two copies of Hellish Rebuke, as a Tiefling Warlock carries them (Lysandra Vane's sheet).
    const pack = game.packs.get('dnd-players-handbook.spells');
    const entry = (await pack.getIndex()).find(e => e.name === 'Hellish Rebuke');
    if (!entry) return { fatal: 'Hellish Rebuke not in the PHB spells pack', results, log, skips };
    const base = (await pack.getDocument(entry._id)).toObject();
    const mainId = Object.keys(base.system.activities ?? {})[0];
    const granted = foundry.utils.mergeObject(foundry.utils.deepClone(base), {
      'system.method': 'spell', 'system.prepared': 2,
      'system.uses': { max: '1', spent: 0, recovery: [{ period: 'lr', type: 'recoverAll' }] },
      [`system.activities.btbfreecast0000`]: { _id: 'btbfreecast0000', type: 'forward', name: 'Save (free casting)', activity: { id: mainId },
        consumption: { targets: [{ type: 'itemUses', target: '', value: '1', scaling: {} }], scaling: { allowed: false }, spellSlot: true } }
    }, { inplace: false, performDeletions: false });
    const pactData = foundry.utils.mergeObject(foundry.utils.deepClone(base), { 'system.method': 'pact', 'system.prepared': 1 }, { inplace: false });
    for (const d of [granted, pactData]) delete d._id;
    const [grantedCopy, pactCopy] = await gol.createEmbeddedDocuments('Item', [granted, pactData]);
    created.items.push(grantedCopy.id, pactCopy.id);
    const legacy = () => gol.items.get(grantedCopy.id);
    const spent = () => Number(legacy()?.system.uses?.spent) || 0;
    if (!legacy()?.system.activities.get('btbfreecast0000')) return { fatal: 'the granted copy\'s forward did not land', results, log, skips };

    // ---- helpers
    const since = t => game.messages.filter(m => m.timestamp >= t);
    const rebukeOffer = t => since(t).find(m => m.getFlag(MOD, 'rebuke')?.options?.some?.(o => o.name === 'Hellish Rebuke')) ?? null;
    const optionOf = m => m?.getFlag(MOD, 'rebuke')?.options?.findIndex?.(o => o.name === 'Hellish Rebuke') ?? -1;
    /** The rebuke popup's Use pressed; `pay` a pill picked first. What the pills showed, and picked, before. */
    const press = async (message, action, pay = null) => {
      const dialog = await until(() => livePopups.get(`${message.id}|rebuke`) ?? null, { timeout: 6000 }).catch(() => null);
      const i = action.replace(/^use-/, '');
      const pills = [...(dialog?.element?.querySelectorAll(`input[name="bf-pay-${i}"]`) ?? [])];
      const shown = { pills: pills.map(p => `${p.value}${p.disabled ? ' off' : ''}`), picked: pills.find(p => p.checked)?.value ?? null };
      if (pay) { const pill = pills.find(p => p.value === pay); if (pill) pill.checked = true; }
      const button = dialog?.element?.querySelector(`button[data-action="${action}"]`);
      button?.click();
      return { pressed: !!button, ...shown };
    };
    const freshReaction = async () => {
      const used = gol.effects.filter(e => /^Reaction — used$/.test(e.name)).map(e => e.id);
      if (used.length) await gol.deleteEmbeddedDocuments('ActiveEffect', used);
      await gol.update({ 'system.attributes.hp.value': 400 });
    };
    const damage = async () => {
      const card = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: victim }), content: 'BTB Test — the damager\'s card' });
      await gol.applyDamage([{ value: 5, type: 'slashing', properties: new Set() }], { originatingMessage: card, isDelta: true });
    };
    const castCard = (t, filter) => since(t).find(m => (m.type === 'usage') && filter(m)) ?? null;
    const fromCopy = (m, copy) => String(m.system?.activity?.uuid ?? m.getFlag?.('dnd5e', 'activity')?.uuid ?? '').includes(`.Item.${copy.id}.`);
    /** Damage, the offer, Use: what was offered and cast. */
    const rebukeRound = async (pay = null) => {
      await freshReaction();
      const t0 = Date.now();
      errors.length = 0;
      await damage();
      const offer = await until(() => rebukeOffer(t0), { timeout: 6000 }).catch(() => null);
      const option = offer?.getFlag(MOD, 'rebuke')?.options?.[optionOf(offer)] ?? null;
      const shown = offer ? await press(offer, `use-${optionOf(offer)}`, pay) : { pressed: false, pills: [], picked: null };
      const card = shown.pressed ? await until(() => castCard(t0, m => m.getFlag(MOD, 'rebukeFor') === offer.id), { timeout: 8000 }).catch(() => null) : null;
      return { offer, option, card, ...shown };
    };

    // ---- 1. the free cast first
    if (want(1)) await section(1, async () => {
      const r = await rebukeRound();
      await until(() => spent() === 1, { timeout: 4000 }).catch(() => null);
      ok('1a. the offer names the free cast; the popup shows both ways, the free cast picked', r.option?.cost === 'a Reaction · the free cast (1 of 1 left)' && (r.option?.itemId === grantedCopy.id)
        && (JSON.stringify(r.pills) === JSON.stringify([`free:${grantedCopy.id}`, 'slot:pact'])) && (r.picked === `free:${grantedCopy.id}`),
        JSON.stringify(r.option && { cost: r.option.cost, item: r.option.itemId === grantedCopy.id ? 'granted' : r.option.itemId === pactCopy.id ? 'pact' : r.option.itemId, pills: r.pills, picked: r.picked }));
      ok('1b. Use casts through the granted copy: its use spent, both Pact slots standing', r.pressed && !!r.card && fromCopy(r.card, grantedCopy) && (spent() === 1) && (Number(pact().value) === 2),
        `pressed=${r.pressed} card=${!!r.card} spent=${spent()} pact=${pact().value} errors=${JSON.stringify(errors)}`);
    });

    // ---- 2. the free cast spent: the Pact slot, through the Pact Magic copy
    if (want(2)) await section(2, async () => {
      const r = await rebukeRound();
      await until(() => Number(pact().value) === 1, { timeout: 4000 }).catch(() => null);
      ok('2a. the offer names the Pact slot; the free pill greyed, the Pact slot picked', (r.option?.cost === 'a Reaction, a Pact slot (level 1)') && (r.option?.itemId === pactCopy.id)
        && (JSON.stringify(r.pills) === JSON.stringify([`free:${grantedCopy.id} off`, 'slot:pact'])) && (r.picked === 'slot:pact'),
        JSON.stringify(r.option && { cost: r.option.cost, pact: r.option.itemId === pactCopy.id, pills: r.pills, picked: r.picked }));
      ok('2b. Use casts through the Pact Magic copy: a Pact slot spent, the use untouched, no slot error',
        r.pressed && !!r.card && fromCopy(r.card, pactCopy) && (Number(pact().value) === 1) && (spent() === 1) && !errors.some(e => /slot/i.test(e)),
        `pressed=${r.pressed} card=${!!r.card} pact=${pact().value} spent=${spent()} errors=${JSON.stringify(errors)}`);
    });

    // ---- 3. the granted copy alone: the Pact slot through it
    if (want(3)) await section(3, async () => {
      await gol.deleteEmbeddedDocuments('Item', [pactCopy.id]);
      const r = await rebukeRound();
      await until(() => Number(pact().value) === 0, { timeout: 4000 }).catch(() => null);
      ok('3a. the offer still stands at a Pact slot, through the granted copy', (r.option?.cost === 'a Reaction, a Pact slot (level 1)') && (r.option?.itemId === grantedCopy.id),
        JSON.stringify(r.option && { cost: r.option.cost, granted: r.option.itemId === grantedCopy.id }));
      ok('3b. Use casts the granted copy with the Pact slot: no level 1 slot asked for',
        r.pressed && !!r.card && fromCopy(r.card, grantedCopy) && (Number(pact().value) === 0) && (spent() === 1) && !errors.some(e => /slot/i.test(e)),
        `pressed=${r.pressed} card=${!!r.card} pact=${pact().value} spent=${spent()} errors=${JSON.stringify(errors)}`);
    });

    // ---- 4. nothing left
    if (want(4)) await section(4, async () => {
      await freshReaction();
      const t0 = Date.now();
      await damage();
      // load-bearing: the time a WRONG offer would take to appear
      const stray = await watch(() => rebukeOffer(t0), { ms: 2500 });
      ok('4a. the free cast spent and no Pact slot: no Hellish Rebuke offered', !stray && !rebukeOffer(t0), JSON.stringify(rebukeOffer(t0)?.getFlag(MOD, 'rebuke')?.options ?? null));
    });

    // ---- 5. the sheet's cast window
    if (want(5)) await section(5, async () => {
      const ensurePact = async () => {
        if (!gol.items.get(pactCopy.id)) {
          const [again] = await gol.createEmbeddedDocuments('Item', [pactData]);
          created.items.push(again.id);
          return again;
        }
        return gol.items.get(pactCopy.id);
      };
      await legacy().update({ 'system.uses.spent': 0 });
      await gol.update({ 'system.spells.pact.value': 2 });
      await until(() => (spent() === 0) && (Number(pact().value) === 2), { label: 'the free cast and both Pact slots back' });
      const windowOf = async item => {
        await closeWindows();
        const pending = item.use({}, {}, {});
        pending?.catch?.(() => { /* closed below */ });
        const app = await until(() => usageApps().find(a => a.activity?.item?.id === item.id && a.element?.querySelector?.('[data-bf-pay]')) ?? null, { timeout: 6000 }).catch(() => null);
        const el = app?.element ?? null;
        const pills = [...(el?.querySelectorAll('input[name="bf-pay"]') ?? [])];
        const slot = el?.querySelector('[name="consume.spellSlot"]') ?? null;
        return { app, pills, picked: pills.find(p => p.checked)?.value ?? null, off: pills.filter(p => p.disabled).map(p => p.value),
          slot, slotHidden: !!slot && (slot.closest('.form-group')?.style.display === 'none'),
          picker: [...foundry.applications.instances.values()].some(a => /ActivityChoiceDialog/.test(a.constructor?.name ?? '') && a.rendered) };
      };
      /** A pill picked as a player does (a click), the window's redraw waited for. */
      const pick = async (w, key) => {
        const pill = w.pills.find(p => p.value === key);
        pill?.click();
        await until(() => w.app?.element?.querySelector(`input[name="bf-pay"][value="${key}"]`)?.checked === true, { timeout: 4000 }).catch(() => null);
        return !!pill;
      };
      const cast = async app => {
        const t0 = Date.now();
        app?.element?.querySelector('button[data-action="use"], button[type="submit"]')?.click();
        return until(() => castCard(t0, () => true), { timeout: 8000 }).catch(() => null);
      };
      const slotBox = w => w.app?.element?.querySelector('[name="consume.spellSlot"]') ?? null;
      const freeKey = `free:${grantedCopy.id}`;

      errors.length = 0;
      const w1 = await windowOf(legacy());
      await until(() => slotBox(w1)?.checked === false, { timeout: 3000 }).catch(() => null);
      ok('5a. the granted copy: no picker, the window shows the ways, the free cast picked, the system\'s slot line hidden and unticked',
        !!w1.app && !w1.picker && (w1.pills.length === 2) && (w1.picked === freeKey) && w1.slotHidden && (slotBox(w1)?.checked === false),
        `window=${!!w1.app} picker=${w1.picker} pills=${w1.pills.map(p => p.value)} picked=${w1.picked} hidden=${w1.slotHidden} slot=${slotBox(w1)?.checked}`);
      const c1 = await cast(w1.app);
      await until(() => spent() === 1, { timeout: 4000 }).catch(() => null);
      ok('5b. Cast spends the free cast and no slot', !!c1 && (spent() === 1) && (Number(pact().value) === 2),
        `card=${!!c1} spent=${spent()} pact=${pact().value} errors=${JSON.stringify(errors)}`);

      const w2 = await windowOf(legacy());
      ok('5c. again: the free pill greyed, the Pact slot picked, the system\'s slot line ticked', w2.off.includes(freeKey) && (w2.picked === 'slot:pact') && (slotBox(w2)?.checked === true),
        `off=${w2.off} picked=${w2.picked} slot=${slotBox(w2)?.checked}`);
      const c2 = await cast(w2.app);
      await until(() => Number(pact().value) === 1, { timeout: 4000 }).catch(() => null);
      ok('5d. Cast spends a Pact slot through the granted copy, no slot error', !!c2 && (Number(pact().value) === 1) && (spent() === 1) && !errors.some(e => /slot/i.test(e)),
        `card=${!!c2} pact=${pact().value} spent=${spent()} errors=${JSON.stringify(errors)}`);

      const pactNow = await ensurePact();
      await legacy().update({ 'system.uses.spent': 0 });
      await until(() => spent() === 0, { label: 'the free cast back' });
      const w3 = await windowOf(pactNow);
      ok('5e. the Pact Magic copy clicked with the free cast left: the free pill there, picked', (w3.picked === freeKey) && !w3.off.length,
        `window=${!!w3.app} picked=${w3.picked} off=${w3.off}`);
      const c3 = await cast(w3.app);
      await until(() => spent() === 1, { timeout: 4000 }).catch(() => null);
      ok('5f. Cast spends the granted copy\'s free cast, no Pact slot', !!c3 && (spent() === 1) && (Number(pact().value) === 1),
        `card=${!!c3} spent=${spent()} pact=${pact().value}`);

      await legacy().update({ 'system.uses.spent': 0 });
      await until(() => spent() === 0, { label: 'the free cast back' });
      const w4 = await windowOf(legacy());
      const picked4 = await pick(w4, 'slot:pact');
      const ticked4 = slotBox(w4)?.checked === true;
      const c4 = await cast(w4.app);
      await until(() => Number(pact().value) === 0, { timeout: 4000 }).catch(() => null);
      ok('5g. the Pact pill picked over the free cast left: Cast spends a Pact slot, the free cast untouched', picked4 && ticked4 && !!c4 && (Number(pact().value) === 0) && (spent() === 0),
        `picked=${picked4} slot=${ticked4} card=${!!c4} pact=${pact().value} spent=${spent()} errors=${JSON.stringify(errors)}`);
      await closeWindows();
    });

    // ---- 6. the player's pick in the rebuke popup
    if (want(6)) await section(6, async () => {
      if (!gol.items.find(i => (i.name === 'Hellish Rebuke') && (i.system.method === 'pact'))) {
        const [again] = await gol.createEmbeddedDocuments('Item', [pactData]);
        created.items.push(again.id);
      }
      const pactNow = gol.items.find(i => (i.name === 'Hellish Rebuke') && (i.system.method === 'pact'));
      await legacy().update({ 'system.uses.spent': 0 });
      await gol.update({ 'system.spells.pact.value': 2 });
      await until(() => (spent() === 0) && (Number(pact().value) === 2), { label: 'the free cast and both Pact slots back' });
      const r = await rebukeRound('slot:pact');
      await until(() => Number(pact().value) === 1, { timeout: 4000 }).catch(() => null);
      ok('6a. the free cast left is the popup\'s pick', r.picked === `free:${grantedCopy.id}`, `picked=${r.picked} pills=${r.pills}`);
      ok('6b. the Pact pill picked: Use spends a Pact slot through the Pact Magic copy, the free cast standing',
        !!r.card && !!pactNow && fromCopy(r.card, pactNow) && (Number(pact().value) === 1) && (spent() === 0) && !errors.some(e => /slot/i.test(e)),
        `card=${!!r.card} pact=${pact().value} spent=${spent()} errors=${JSON.stringify(errors)}`);
    });
    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  } finally {
    await teardown();
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: 'free-casts', out, plan, f });
