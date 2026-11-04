// Live suite: ALERT's Initiative Swap. Once every combatant has an Initiative, the Alert holder is
// asked once per combat; allies on its side who are not Incapacitated are listed with their
// Initiative; Swap exchanges the two numbers in the tracker, No leaves it.
//
// Fixtures (tools/fixture-suite.mjs): BTB Test Halfling is lent the PHB's Alert; BTB Test Cleric and
// BTB Test Bard are its allies, BTB Test Victim the enemy. TEMPORARY linked tokens in a strip it finds
// empty and its own combats, all deleted in teardown with everything else it touched.
//
// Sections: `--section 3`, `--list`. Fixtures and teardown ALWAYS run.
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from './harness.mjs';

// THE COVERAGE MAP (tools/coverage-map.mjs) — ⚠ NEVER import a suite; the map is parsed.
export const COVERS = [
  'initiative-swap.js'      // the whole machine — the ask, the popup, the relay-free GM fold, the swap
];

const SECTIONS = {
  1: 'the last Initiative lands: the Alert holder\'s card lists the two allies with their Initiative (not the enemy); the popup is a radio per ally, Swap dark until one is picked; the whole lineup shown, the holder and the enemy greyed',
  2: 'Swap with the Bard: the two Initiatives are exchanged in the tracker, and the card says so (11 ↔ 17)',
  3: 'once per roll: a later Initiative change asks nothing new; a reset and a re-roll asks again',
  4: 'an Incapacitated ally is not listed',
  5: 'No: the order stands; an Incapacitated Alert holder is not asked at all',
  6: 'the clock answers No (timed out), never sooner than 60 s (a 3 s Decision Timer floors at 60; Session 03 of Echoes of Halruaa: the ask timed out on Tychon at 24 s)'
};
const DEPENDS = { 2: ['1'], 3: ['1'] };

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'alert', watchdogMs: 300_000 });
announcePlan('alert', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, watch, canvasReady, snapshotSettings } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const suiteStart = Date.now();

  const mod = game.modules.get(MOD);
  if (!mod?.active) return { fatal: `module active=${mod?.active}` };
  if (!game.settings.settings.has(`${MOD}.decisionTimer`)) return { fatal: 'decisionTimer not registered — OLD code (reload the box)' };

  const SETTING_KEYS = ['decisionTimer'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { set } = settings;

  const scene = game.scenes.getName('By the Books Test Range');
  const [halfling, cleric, bard, victim] = ['BTB Test Halfling', 'BTB Test Cleric', 'BTB Test Bard', 'BTB Test Victim'].map(n => game.actors.getName(n));
  if (!scene || !halfling || !cleric || !bard || !victim) return { fatal: 'missing fixtures — run tools/fixture-suite.mjs' };

  const lent = [];
  const placed = [];
  const combats = [];
  let restored = false;
  const clearIncap = async a => {
    if (a.statuses.has('incapacitated')) await a.toggleStatusEffect('incapacitated', { active: false }).catch(() => {});
  };
  const teardown = async () => {
    if (restored) return;
    restored = true;
    for (const failed of await settings.restore()) log.push(`TEARDOWN settings ERROR: ${failed}`);
    try {
      for (const app of foundry.applications.instances.values()) {
        if (app.element?.querySelector?.('[data-bf-initiative-swap]')) { try { await app.close(); } catch { /* gone */ } }
      }
      for (const c of combats) if (game.combats.get(c.id)) await c.delete().catch(() => {});
      const tokens = placed.filter(id => scene.tokens.get(id));
      if (tokens.length) await scene.deleteEmbeddedDocuments('Token', tokens);
      for (const a of [halfling, cleric, bard]) await clearIncap(a);
      const live = lent.filter(id => halfling.items.get(id));
      if (live.length) await halfling.deleteEmbeddedDocuments('Item', live);
      const mine = game.messages.filter(m => (m.timestamp >= suiteStart) && Object.keys(m.flags?.[MOD] ?? {}).length);
      if (mine.length) await ChatMessage.deleteDocuments(mine.map(m => m.id));
    } catch (err) {
      log.push(`TEARDOWN ERROR: ${err?.message}`);
    }
  };

  try {
    await set('decisionTimer', 0);   // the popup waits for the suite's click

    let alertSrc = null;
    for (const pack of game.packs.filter(p => (p.metadata.packageName === 'dnd-players-handbook') && (p.documentName === 'Item'))) {
      const hit = (await pack.getIndex()).find(e => (e.name === 'Alert') && (e.type === 'feat'));
      if (hit) { alertSrc = await pack.getDocument(hit._id); break; }
    }
    if (!alertSrc) return { fatal: 'the PHB ships no "Alert" feat this box can find', results, log, skips };
    if (!halfling.items.some(i => i.name === 'Alert')) {
      const [item] = await halfling.createEmbeddedDocuments('Item', [alertSrc.toObject()]);
      lent.push(item.id);
    }

    if (canvas.scene?.id !== scene.id) await scene.view();
    await canvasReady();
    const g = scene.grid.size;
    const occupied = (x, y) => scene.tokens.some(t => (t.x < (x + 1) * g) && ((t.x + t.width * g) > x * g) && (t.y < (y + 1) * g) && ((t.y + t.height * g) > y * g));
    let strip = null;
    for (let y = 3; (y < 17) && !strip; y++) for (let x = 0; (x <= 14) && !strip; x++) {
      let clear = true;
      for (let dx = 0; (dx < 5) && clear; dx++) if (occupied(x + dx, y)) clear = false;
      if (clear) strip = { x, y };
    }
    if (!strip) return { fatal: 'no empty 5-square strip on the test range', results, log, skips };
    const place = async (a, dx, disposition) => {
      const [doc] = await scene.createEmbeddedDocuments('Token', [foundry.utils.mergeObject(a.prototypeToken.toObject(),
        { x: (strip.x + dx) * g, y: strip.y * g, actorId: a.id, actorLink: true, disposition }, { inplace: false })]);
      placed.push(doc.id);
      return doc;
    };
    const tHalfling = await place(halfling, 0, 1);
    const tCleric = await place(cleric, 1, 1);
    const tBard = await place(bard, 2, 1);
    const tVictim = await place(victim, 4, -1);

    const cardFor = combat => game.messages.contents.filter(m => m.getFlag(MOD, 'initiativeSwap')?.combatId === combat.id).pop() ?? null;
    const swapPopup = () => [...foundry.applications.instances.values()]
      .find(app => app.rendered && app.element?.querySelector?.('[data-bf-initiative-swap]')) ?? null;
    /** A fresh combat of the four, the Initiatives set one by one — the last one is the moment. */
    const fight = async (inits) => {
      const combat = await Combat.create({ scene: scene.id, active: false });
      combats.push(combat);
      const docs = [[tHalfling, 11], [tCleric, 14], [tBard, 17], [tVictim, 9]];
      const made = await combat.createEmbeddedDocuments('Combatant', docs.map(([t]) => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId })));
      const byToken = Object.fromEntries(made.map(c => [c.tokenId, c]));
      for (const [t, n] of docs) await combat.setInitiative(byToken[t.id].id, inits?.[t.id] ?? n);
      return { combat, of: t => combat.combatants.get(byToken[t.id].id) };
    };

    // ================================================== 1–3. the ask, Swap, once per combat
    let first = null;
    if (want(1)) await section(1, async () => {
      first = await fight();
      const card = await until(() => cardFor(first.combat), { timeout: 6000 });
      const flag = card?.getFlag(MOD, 'initiativeSwap');
      const names = (flag?.allies ?? []).map(a => `${a.name}:${a.initiative}`);
      ok('1a. the card lists the two allies with their Initiative, not the enemy',
        !!flag && (flag.allies.length === 2) && flag.allies.some(a => a.initiative === 17) && flag.allies.some(a => a.initiative === 14)
          && !flag.allies.some(a => a.name === tVictim.name) && (flag.initiative === 11),
        `allies=${names.join(', ')} own=${flag?.initiative}`);
      const app = await until(swapPopup, { timeout: 6000 });
      const radios = [...(app?.element?.querySelectorAll('input[name="bf-initiative-swap"]') ?? [])];
      const swapBtn = app?.element?.querySelector('button[data-action="swap"]');
      ok('1b. the popup: a radio per ally, Swap dark until one is picked, and No',
        (radios.length === 2) && !!swapBtn?.disabled && !!app?.element?.querySelector('button[data-action="no"]'),
        `popup=${!!app} radios=${radios.length} swapDisabled=${swapBtn?.disabled}`);
      const lineup = flag?.lineup ?? [];
      const inits = lineup.map(r => r.initiative);
      ok('1c. the lineup: every combatant in Initiative order, coloured by side, the holder "(you)", the enemy unpickable',
        (lineup.length === 4) && inits.every((v, i) => !i || (inits[i - 1] >= v))
          && (lineup.find(r => r.role === 'self')?.initiative === 11) && (lineup.find(r => r.role === 'enemy')?.name === tVictim.name)
          && !!app?.element?.querySelector('[data-bf-initiative-row="self"]')?.textContent?.includes('(you)')
          && !!app?.element?.querySelector('[data-bf-initiative-row="enemy"]') && !app?.element?.querySelector('[data-bf-initiative-row="enemy"] input'),
        `lineup=${lineup.map(r => `${r.name}:${r.initiative}:${r.role}`).join(', ')}`);
    });
    if (want(2)) await section(2, async () => {
      const app = swapPopup();
      const bardRadio = [...(app?.element?.querySelectorAll('input[name="bf-initiative-swap"]') ?? [])]
        .find(r => r.value === first.of(tBard).id);
      if (bardRadio) { bardRadio.checked = true; bardRadio.dispatchEvent(new Event('change', { bubbles: true })); }
      app?.element?.querySelector('button[data-action="swap"]')?.click();
      const card = cardFor(first.combat);
      const applied = await until(() => card?.getFlag(MOD, 'initiativeSwap')?.applied, { timeout: 8000 });
      ok('2a. Swap: the Halfling has 17, the Bard has 11, and the card says 11 ↔ 17',
        !!applied && (first.of(tHalfling).initiative === 17) && (first.of(tBard).initiative === 11)
          && (card.getFlag(MOD, 'initiativeSwap').from === 11) && (card.getFlag(MOD, 'initiativeSwap').to === 17),
        `halfling=${first.of(tHalfling).initiative} bard=${first.of(tBard).initiative} flag=${JSON.stringify({ from: card?.getFlag(MOD, 'initiativeSwap')?.from, to: card?.getFlag(MOD, 'initiativeSwap')?.to })}`);
    });
    if (want(3)) await section(3, async () => {
      const before = game.messages.contents.filter(m => m.getFlag(MOD, 'initiativeSwap')?.combatId === first.combat.id).length;
      await first.combat.setInitiative(first.of(tCleric).id, 20);
      const cardsOf = () => game.messages.contents.filter(m => m.getFlag(MOD, 'initiativeSwap')?.combatId === first.combat.id).length;
      const asked = await watch(() => cardsOf() > before, { ms: 1500 });
      const after = cardsOf();
      ok('3a. once per roll: a later Initiative change asks nothing new', !asked && (after === before), `cards ${before} → ${after}`);
      // A reset and a re-roll is a new roll: the holder is asked again.
      swapPopup()?.element?.querySelector('button[data-action="no"]')?.click();
      await first.combat.resetAll();
      await until(() => !first.combat.getFlag(MOD, 'initiativeSwapAsked')?.[first.of(tHalfling).id], { label: 'the swap latch re-armed by the reset' });
      for (const [t, n] of [[tHalfling, 12], [tCleric, 15], [tBard, 18], [tVictim, 8]]) await first.combat.setInitiative(first.of(t).id, n);
      const again = await until(() => {
        const n = game.messages.contents.filter(m => m.getFlag(MOD, 'initiativeSwap')?.combatId === first.combat.id).length;
        return (n > before) ? n : null;
      }, { timeout: 6000 });
      ok('3b. reset Initiative and roll again: the holder is asked again', !!again && (cardFor(first.combat)?.getFlag(MOD, 'initiativeSwap')?.initiative === 12),
        `cards ${before} → ${again} own=${cardFor(first.combat)?.getFlag(MOD, 'initiativeSwap')?.initiative}`);
      swapPopup()?.element?.querySelector('button[data-action="no"]')?.click();
    });

    // ================================================== 4. an Incapacitated ally
    if (want(4)) await section(4, async () => {
      await cleric.toggleStatusEffect('incapacitated', { active: true });
      const { combat } = await fight();
      const card = await until(() => cardFor(combat), { timeout: 6000 });
      const allies = card?.getFlag(MOD, 'initiativeSwap')?.allies ?? [];
      ok('4a. the Incapacitated Cleric is not listed; the Bard is', !!card && (allies.length === 1) && (allies[0].initiative === 17),
        `allies=${allies.map(a => a.name).join(', ')}`);
      swapPopup()?.element?.querySelector('button[data-action="no"]')?.click();
      await clearIncap(cleric);
      await until(() => !swapPopup() && !cleric.statuses.has('incapacitated'), { label: 'the swap popup closed and the Cleric no longer Incapacitated' });
    });

    // ================================================== 5. No; an Incapacitated holder
    if (want(5)) await section(5, async () => {
      const { combat, of } = await fight();
      const card = await until(() => cardFor(combat), { timeout: 6000 });
      const app = await until(swapPopup, { timeout: 6000 });
      app?.element?.querySelector('button[data-action="no"]')?.click();
      const answered = await until(() => card?.getFlag(MOD, 'initiativeSwap')?.answer, { timeout: 6000 });
      ok('5a. No: the order stands', (answered === 'no') && (of(tHalfling).initiative === 11) && (of(tBard).initiative === 17),
        `answer=${answered} halfling=${of(tHalfling).initiative}`);
      await halfling.toggleStatusEffect('incapacitated', { active: true });
      const second = await fight();
      const stray = await watch(() => cardFor(second.combat), { ms: 1500 });
      ok('5b. an Incapacitated Alert holder is not asked', !stray && !cardFor(second.combat), `card=${!!cardFor(second.combat)} stray=${!!stray}`);
      await clearIncap(halfling);
    });

    // ================================================== 6. the clock
    if (want(6)) await section(6, async () => {
      await set('decisionTimer', 3);
      const { combat, of } = await fight();
      const card = await until(() => cardFor(combat), { timeout: 6000 });
      const asked = card?.getFlag(MOD, 'initiativeSwap') ?? null;
      ok('6a. the swap clock is 60 s though the Decision Timer is 3', (asked?.window === 60) && ((asked?.deadline ?? 0) - Date.now() > 50_000),
        `window=${asked?.window} left=${Math.round(((asked?.deadline ?? 0) - Date.now()) / 1000)}s`);
      const flag = await until(() => (card?.getFlag(MOD, 'initiativeSwap')?.answer === 'no') ? card.getFlag(MOD, 'initiativeSwap') : null, { timeout: 75000 });
      ok('6b. the clock answers No (timed out); the order stands', !!flag?.timedOut && (of(tHalfling).initiative === 11),
        `answer=${card?.getFlag(MOD, 'initiativeSwap')?.answer} timedOut=${!!flag?.timedOut}`);
      await set('decisionTimer', 0);
    });

    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  } finally {
    await teardown();
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: 'alert', out, plan, f });
