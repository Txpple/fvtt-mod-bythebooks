// Maneuver-fold smoke suite: Precision Attack patches a declared miss; Riposte answers an enemy
// melee miss with a real driven attack; plus the bash, shove, Interpose, Hew and Pole Strike
// folds. The folds share nothing with the hold machine, so they have their own suite.
// Determinism levers:
//   - The fixture Precision die is "1d8 + 20", so a flip is guaranteed against AC 25; a
//     natural 20 (a hit, no stamp) retries.
//   - holdSkipFutile OFF for the stamp sections; its own section pins the hopeless gate (AC 60).
//   - holdTimer 0 (popups wait for the suite's click); the buzzer section pins 2s locally. Every
//     timer is the ONE Decision Timer now, so the demanded saves roll themselves (saveRolls auto)
//     rather than wait on a save timer.
//   - The fold fixtures are found by their dnd5e identifier (the tables are the only list):
//     "BTB Shield Master" carries shield-master, "BTB Great Weapon Master" great-weapon-master.
// ⚠ Run `smoke-bythebooks` FIRST (BTB Test Attacker / BTB Test Victim). Sections are named after
// their fold; fixtures and teardown always run.
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from './harness.mjs';

// The coverage map (tools/coverage-map.mjs) parses this; ⚠ never import a suite (it connects on evaluation).
export const COVERS = [
  'precision.js',           // P, P8, M1, Q — Precision Attack
  'riposte.js',             // R, RP — Riposte's driven attack
  'hew.js',                 // H — the Hew reminder
  'bash-offer.js',          // B — the bash offer on a listed carrier's hit; T — Tavern Brawler's shove; C — Crusher's push
  'unarmed-dice.js',        // T4 — Tavern Brawler's die on the plain Unarmed Strike
  'saves/choices.js',       // B / I — the Prone-or-push choice and Interpose
  'saves/verdict.js'        // I — Interpose on a save success
];

const SECTIONS = {
  P: 'Precision — the stamp gates, Pass, Use, the re-drive',
  R: 'Riposte — the offer and the driven attack',
  P8: 'finding ①: player-owned, owner OFFLINE',
  M1: 'finding ④: two weapons, smart default',
  RP: '(l)+(p): the riposte HIT celebrates',
  B: 'finding ⑤: the bash choice (Prone or push)',
  T: 'Tavern Brawler: the shove offer on an Unarmed Strike hit (Push 5 feet / Pass, announced), none on a weapon hit; the plain Unarmed Strike rolls the feat 1d4 with a card line',
  C: 'Crusher (the PHB feats, group 3, 2026-09-26): a Mace hit (Bludgeoning) offers the push — the Crusher rule quoted, Push 5 feet announced; a Dagger hit (Piercing) offers nothing; a Huge target (two sizes larger) offers nothing',
  I: 'finding ⑥: Interpose (save-success reaction)',
  H: '② + (c): the Hew reminder POPS now',
  PS: "Pole Strike (Polearm Master, 2026-09-27): an attack with a Spear posts Hew's reminder for the other end's Bonus Action swing, and it pops; a weapon that does not qualify says nothing",
  Q: '(s): the cascade is a staircase queue'
};
// Each group stands up its own fixtures and settings. `P` leaves the victim on AC 25; others set their own.
const DEPENDS = {};

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'maneuvers', watchdogMs: 600_000 });
announcePlan('maneuvers', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  // The spent Reaction is an effect chip.
  const clearReaction = async a => { const ids = (a?.effects ?? []).filter(e => e.getFlag(MOD, 'mastery') === 'reaction').map(e => e.id); if (ids.length) await a.deleteEmbeddedDocuments('ActiveEffect', ids).catch(() => {}); };
  const spendReactionOf = async a => { await a.createEmbeddedDocuments('ActiveEffect', [{ name: 'Reaction — used', img: 'icons/svg/clockwork.svg', transfer: false, flags: { [MOD]: { mastery: 'reaction' } } }]); };
  const reactionChip = a => !!a?.effects?.some(e => e.getFlag(MOD, 'mastery') === 'reaction');
  const { until, watch, tokenOn, snapshotSettings, dialogsWith } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  // The page-side section gate (tools/harness.mjs); the plan arrives as data.
  const suiteStart = Date.now();

  // Console-error capture: the module logs its failures there.
  const consoleErrors = [];
  const origConsoleError = console.error;
  console.error = (...a) => {
    try { consoleErrors.push(a.map(x => x?.message ?? String(x)).join(' | ').slice(0, 300)); } catch {}
    origConsoleError(...a);
  };

  const mod = game.modules.get(MOD);
  if (!mod?.active) return { fatal: `module active=${mod?.active}` };
  if (!game.settings.settings.has(`${MOD}.decisionTimer`)) {
    return { fatal: 'decisionTimer not registered — this client is running OLD code (F5)' };
  }

  const SETTING_KEYS = ['autoDamage', 'autoApply', 'dramaticBeat', 'requireTarget',
    'reactionHold', 'riders', 'effectRiders', 'masteryRiders', 'playerRollDamage',
    'holdTimer', 'holdSkipFutile', 'holdReveal', 'castApply', 'saves', 'saveRolls'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { set } = settings;

  const scene = game.scenes.getName('By the Books Test Range');
  const enemy = game.actors.getName('BTB Test Attacker');
  const victim = game.actors.getName('BTB Test Victim');
  if (!scene || !enemy || !victim) return { fatal: 'missing fixtures — run smoke-bythebooks first' };

  const created = { tokens: [], enemyItems: [], victimItems: [] };
  let pc = null;
  const priorActor = {};
  let restored = false;
  const teardown = async () => {
    if (restored) return;
    restored = true;
    for (const failed of await settings.restore()) log.push(`TEARDOWN settings ERROR: ${failed}`);
    try {
      const liveTokens = created.tokens.filter(id => scene.tokens.get(id));
      if (liveTokens.length) await scene.deleteEmbeddedDocuments('Token', liveTokens);
      const liveItems = created.enemyItems.filter(id => enemy.items.get(id));
      if (liveItems.length) await enemy.deleteEmbeddedDocuments('Item', liveItems);
      const liveVictimItems = created.victimItems.filter(id => victim.items.get(id));
      if (liveVictimItems.length) await victim.deleteEmbeddedDocuments('Item', liveVictimItems);
      for (const e of victim.effects.filter(x => x.name === 'BTB Test Prone')) await e.delete().catch(() => {});
      for (const [actorId, data] of Object.entries(priorActor)) {
        await game.actors.get(actorId)?.update(data);
      }
      await clearReaction(enemy);
      if (pc) await pc.delete().catch(() => {});
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
    await set('effectRiders', false);
    await set('masteryRiders', false);
    await set('playerRollDamage', false);
    await set('holdTimer', 0);
    await set('holdSkipFutile', false);
    await set('holdReveal', true);
    await set('castApply', false);
    await set('saves', false);
    // One Decision Timer: a save timer would be the fold's timer too, so the demanded saves roll
    // themselves and the post-verdict choice is the only clock §B and §I watch.
    await set('saveRolls', 'auto');

    // ---- fixtures
    if (canvas.scene?.id !== scene.id) await scene.view();
    // ⚠ Sweep existing fixture tokens FIRST: getSpeaker resolves through the actor's OLDEST
    // token, and an unlinked leftover makes the attack speak as a synthetic actor.
    const stale = scene.tokens.filter(t => [enemy.id, victim.id].includes(t.actorId)).map(t => t.id);
    if (stale.length) await scene.deleteEmbeddedDocuments('Token', stale);
    const enemyWeapon = enemy.items.find(i => i.system.activities?.some?.(a => a.type === 'attack'));
    if (!enemyWeapon) return { fatal: 'BTB Test Attacker has no weapon' };

    pc = await Actor.create({
      name: 'BTB Test Maneuver PC', type: 'character',
      system: { abilities: { str: { value: 16 }, dex: { value: 16 } },
        attributes: { hp: { value: 30, max: 30 } } },
      items: [foundry.utils.mergeObject(enemyWeapon.toObject(), {
        system: { equipped: true } }, { inplace: false })]
    });
    // The pool first: the maneuvers' consumption targets its id.
    const [pool] = await pc.createEmbeddedDocuments('Item', [{
      name: 'BTB Combat Superiority', type: 'feat',
      system: { type: { value: 'feat' }, uses: { spent: 0, max: '4', recovery: [] } }
    }]);
    await pc.createEmbeddedDocuments('Item', [
      { name: 'Precision Attack', type: 'feat',
        system: { type: { value: 'feat' }, activities: {
          bfprecision00000: {
            _id: 'bfprecision00000', type: 'utility',
            activation: { type: '', override: false },
            consumption: { targets: [{ type: 'itemUses', target: pool.id, value: '1' }] },
            roll: { formula: '1d8 + 20', name: 'Bonus' }
          }
        } } },
      { name: 'Riposte', type: 'feat',
        system: { type: { value: 'feat' }, activities: {
          bfriposte0000000: {
            _id: 'bfriposte0000000', type: 'damage',
            activation: { type: 'reaction', override: false },
            consumption: { targets: [{ type: 'itemUses', target: pool.id, value: '1' }] },
            damage: { parts: [{ custom: { enabled: true, formula: '1d8' }, types: ['slashing'] }] },
            target: { affects: { type: 'creature' } }
          }
        } } }
    ]);
    const poolUses = () => pc.items.get(pool.id)?.system.uses?.value ?? -1;
    log.push(`fixture: ${pc.name} · weapon ${enemyWeapon.name} · pool ${poolUses()}/4`);

    const mkToken = async (actor, x, y) => {
      const [doc] = await scene.createEmbeddedDocuments('Token', [
        foundry.utils.mergeObject(actor.prototypeToken.toObject(),
          { x, y, actorId: actor.id, actorLink: true }, { inplace: false })]);
      created.tokens.push(doc.id);
      await tokenOn(doc.id);
      return canvas.tokens.get(doc.id);
    };
    const pcToken = await mkToken(pc, 900, 900);
    const enemyToken = await mkToken(enemy, 1000, 900);
    const victimToken = await mkToken(victim, 1100, 900);
    if (!pcToken || !enemyToken || !victimToken) return { fatal: 'tokens never reached the canvas' };

    priorActor[victim.id] = {
      'system.attributes.ac.override': victim.system._source.attributes.ac.override ?? null,
      'system.attributes.hp.value': victim.system._source.attributes.hp.value
    };
    priorActor[enemy.id] = {
      'system.attributes.ac.override': enemy.system._source.attributes.ac.override ?? null,
      'system.attributes.hp.value': enemy.system._source.attributes.hp.value
    };
    const acFlat = (a, n) => a.update({
      'system.attributes.ac.override': n });

    const pcAttackAct = () => pc.items.find(i => i.name === enemyWeapon.name)
      ?.system.activities.find(a => a.type === 'attack');
    const enemyAttackAct = () => enemy.items.get(enemyWeapon.id)
      ?.system.activities.find(a => a.type === 'attack');

    // Targeting is synchronous on this client; dnd5e reads game.user.targets when the activity is used.
    const targetsOnly = token => (game.user.targets.size === 1) && ([...game.user.targets][0]?.id === token?.id);
    const attack = async (activity, token, _opts = {}) => {
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      token.setTarget(true, { releaseOthers: true });
      await until(() => targetsOnly(token), { label: `the attack's one target ${token?.name}` });
      const use = await activity.use({ subsequentActions: false }, { configure: false }, {});
      const usageId = use?.message?.id ?? null;
      const rolls = await activity.rollAttack({ advantage: false, disadvantage: true },
        { configure: false }, usageId ? { data: { 'system.origin': usageId } } : {});
      // dnd5e sets the roll's message on it before rollAttack resolves; each caller waits on what it reads.
      return { usageId, msg: rolls?.[0]?.parent ?? null, roll: rolls?.[0] ?? null };
    };
    const damageOf = originId => game.messages.contents.find(x =>
      (x.type === 'damage')
      && (x._source.system?.origin === originId));
    const waitDamage = (originId, ms = 10000) => until(() => damageOf(originId),
      { timeout: ms, label: `the damage roll of ${originId}` });
    // A card's rule text is filled into the rendered message by rule-text.js, never stored in its content:
    // a pointer is marked done as its fill starts and holds its text once the read resolves.
    const renderedText = async message => {
      const el = await until(() => {
        const node = document.querySelector(`.message[data-message-id="${message?.id}"]`);
        const pointers = node ? [...node.querySelectorAll('[data-bf-rule]')] : [];
        return (node && pointers.every(p => p.hasAttribute('data-bf-rule-done') && p.innerHTML.trim())) ? node : null;
      }, { timeout: 6300, label: 'the card rendered with its rule text filled' });
      return el.textContent ?? '';
    };
    /**
     * The merged rescue window: one row per rescue, the control is `[data-bf-rescue-action]` on a
     * div (no `Use <item>` button). `Pass` stays a footer button, sent to every pending source.
     */
    const rescueWindow = (action = 'use') => [...document.querySelectorAll('.application')]
      .find(el => (el.tagName === 'DIALOG')
        && !!el.querySelector(`[data-bf-rescue-action="${action}"]`));
    const rescueRow = (win, action = 'use') =>
      win?.querySelector(`[data-bf-rescue-action="${action}"]`) ?? null;
    const closeDialogs = async text => {
      const closing = [];
      for (const el of dialogsWith(text)) {
        try {
          const control = el.querySelector('[data-action="close"]') ?? el.querySelector('.header-control');
          if (control) { control.click(); closing.push(el); }
        } catch {}
      }
      // A cleanup: a window that stays open was never asserted, so the wait for it to leave the page is soft.
      await until(() => closing.every(el => !el.isConnected),
        { timeout: 3000, label: `the "${text}" windows closed` }).catch(() => null);
    };
    /** Attack until the fold stamps (a nat-20 hit stamps nothing and retries). */
    const missUntilStamped = async (activity, token, flagKey, tries = 8) => {
      for (let i = 0; i < tries; i++) {
        const { msg } = await attack(activity, token);
        // Per try: a hit or a fumble stamps nothing, and the loop swings again.
        const flag = await until(() => msg?.getFlag(MOD, flagKey),
          { timeout: 4000, label: `the ${flagKey} stamp` }).catch(() => null);
        if (flag) return { msg, flag };
        log.push(`${flagKey}: attempt ${i + 1} did not stamp (hit or fumble) — retrying`);
        await closeDialogs('Weapon Mastery');
      }
      return { msg: null, flag: null };
    };

    const castAt = async (activity, token) => {
      // Two logged tries: a target that lands late in the dnd5e snapshot stamps nothing.
      for (let attempt = 1; attempt <= 2; attempt++) {
        game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
        token.setTarget(true, { releaseOthers: true });
        // Per try: the retry's log line below names the targets when they did not take.
        await until(() => targetsOnly(token), { label: `the cast's one target ${token?.name}` }).catch(() => null);
        const use = await activity.use({ subsequentActions: false }, { configure: false }, {});
        const card = use?.message?.id ? game.messages.get(use.message.id) : null;
        const stamped = await until(() => card?.getFlag(MOD, 'saves'),
          { timeout: 5000, label: 'the save demand stamped' }).catch(() => null);
        if (stamped) return card;
        log.push(`castAt: the demand did not stamp (attempt ${attempt}: card=${!!card}, userTargets=${game.user.targets.size}, `
          + `dnd5eTargets=${JSON.stringify((card?.system?.targets ?? []).map(t => ({ ...t, uuid: t.actor })).map(t => t.name))}, `
          + `tokenDestroyed=${!!token?.destroyed}, tokenActor=${token?.actor?.name ?? null}) — retrying`);
      }
      return null;
    };
    // ⚠ Revive the victim before every bash cast: the dead-target gate stamps nothing.
    const reviveVictim = () => victim.update({
      'system.attributes.hp.value': victim.system.attributes.hp.max });

    /* ==== P1+P2 — the Precision stamp gates */
    if (want('P')) await section('P', async () => {
      await acFlat(victim, 25);   // miss band: disadvantage total 6..25, nat-20 retries
      await victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max });
      {
        const { msg, flag } = await missUntilStamped(pcAttackAct(), victimToken, 'precision');
        ok('P1. a clean miss stamps a pending precision offer',
          !!flag && (flag.status === 'pending') && (flag.itemName === 'Precision Attack')
            && (flag.targets?.length === 1),
          JSON.stringify({ status: flag?.status, targets: flag?.targets?.length }));
        const popup = await until(() => rescueWindow('use'), { timeout: 6000, label: 'the precision rescue window' });
        ok('P2. the offer window carries a pressable row and ONE Pass',
          !!popup && !!rescueRow(popup, 'use')
            && (popup.querySelectorAll('button[data-action="pass"]').length === 1),
          `popup=${!!popup} rows=${popup?.querySelectorAll('[data-bf-rescue-row]').length ?? 0}`);

        /* P3 — PASS: nothing rolls, the pool is untouched. */
        const usesBefore = poolUses();
        popup?.querySelector('button[data-action="pass"]')?.click();
        const resolved = await until(() => {
          const p = msg.getFlag(MOD, 'precision');
          return (p?.status === 'resolved') ? p : null;
        }, { timeout: 6000, label: 'the precision offer resolved' });
        // The window: a passed offer rolls no damage.
        const dmg = await watch(() => damageOf(msg._source.system?.origin), { ms: 2500 });
        ok('P3. Pass — the miss stands, nothing rolls, the die is not spent',
          (resolved?.outcome === 'passed') && !dmg && (poolUses() === usesBefore),
          `outcome=${resolved?.outcome} dmg=${!!dmg} uses ${usesBefore}→${poolUses()}`);
      }

      /* P4 — a HIT stamps nothing. */
      {
        await acFlat(victim, 1);
        const { msg } = await attack(pcAttackAct(), victimToken);
        // The window: a hit stamps no offer.
        const stray = await watch(() => msg?.getFlag(MOD, 'precision'), { ms: 1500 });
        ok('P4. a hit stamps no precision offer',
          !!msg && !stray && !msg.getFlag(MOD, 'precision'),
          `flag=${!!(stray ?? msg?.getFlag(MOD, 'precision'))}`);
        // Let the chain finish; a fumble rolls no damage, so the wait is soft.
        await waitDamage(msg?._source.system?.origin, 8000).catch(() => null);
        await acFlat(victim, 25);
      }

      /* P5 — ACCEPT: the die is spent, the verdict flips, the damage chain runs, applied. */
      {
        await victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max });
        const hpBefore = victim.system.attributes.hp.value;
        const usesBefore = poolUses();
        const { msg, flag } = await missUntilStamped(pcAttackAct(), victimToken, 'precision');
        if (!flag) {
          ok('P5. accept — the die spends, the verdict flips, damage lands', false, 'no stamp in 8 tries');
        } else {
          const popup = await until(() => rescueWindow('use'), { timeout: 6000, label: 'the precision rescue window' });
          rescueRow(popup, 'use')?.click();
          const resolved = await until(() => {
            const p = msg.getFlag(MOD, 'precision');
            return ((p?.status === 'resolved') && (p.outcome === 'used')) ? p : null;
          }, { timeout: 15000, label: 'the precision offer resolved used' });
          ok('P5a. accept — the pool spends exactly one use and the die is recorded',
            !!resolved && (poolUses() === usesBefore - 1) && (resolved.die >= 21),
            `uses ${usesBefore}→${poolUses()} die=${resolved?.die}`);
          ok('P5b. the verdict flips through the shared channel ("now hits")',
            resolved?.targets?.[0]?.verdict === 'hit',
            JSON.stringify(resolved?.targets));
          const dieMsg = game.messages.contents.find(m =>
            (m.getFlag(MOD, 'respondsTo') === msg.id) && m.rolls?.length);
          ok('P5c. the die rolled PUBLICLY with provenance (respondsTo the attack)',
            !!dieMsg, `dieMsg=${!!dieMsg}`);
          // The re-drive stamps the FLAT originating key the riders key on (riderTargets branch 1).
          const dmg = await waitDamage(msg._source.system?.origin, 12000);
          const applied = await until(() => {
            const r = dmg?.getFlag(MOD, 'receipt');
            return r?.targets?.some(t => t.uuid === victim.uuid) ? r : null;
          }, { timeout: 10000, label: 'the re-driven damage receipt on the victim' });
          ok('P5d. the re-driven damage lands and APPLIES to the flipped target',
            !!dmg && !!applied && (victim.system.attributes.hp.value < hpBefore),
            `dmg=${!!dmg} applied=${!!applied} hp ${hpBefore}→${victim.system.attributes.hp.value}`);
          const announce = game.messages.contents.find(m =>
            (m.timestamp >= suiteStart) && /now hits/.test(m.content ?? ''));
          ok('P5e. the arithmetic announces ("A + die = B vs AC — now hits")',
            !!announce, `announce=${!!announce}`);
        }
      }

      /* P6 — the hopeless gate: an unreachable AC is never offered (math shown). */
      {
        await set('holdSkipFutile', true);
        await acFlat(victim, 60);
        const { msg } = await attack(pcAttackAct(), victimToken);
        // The window: a hopeless miss stamps no offer.
        const stray = await watch(() => msg?.getFlag(MOD, 'precision'), { ms: 1500 });
        ok('P6. hopeless (margin beyond the maximised die) — no offer, the miss just stands',
          !!msg && !stray && !msg.getFlag(MOD, 'precision'),
          `flag=${!!(stray ?? msg?.getFlag(MOD, 'precision'))}`);
        await set('holdSkipFutile', false);
        await acFlat(victim, 25);
      }

      /* P7 — the buzzer passes an unanswered offer. */
      {
        await set('holdTimer', 2);
        const usesBefore = poolUses();
        const { msg, flag } = await missUntilStamped(pcAttackAct(), victimToken, 'precision');
        if (!flag) {
          ok('P7. the buzzer passes', false, 'no stamp in 8 tries');
        } else {
          const resolved = await until(() => {
            const p = msg.getFlag(MOD, 'precision');
            return (p?.status === 'resolved') ? p : null;
          }, { timeout: 10000, label: 'the precision offer resolved by the buzzer' });
          // The window: a buzzer's Pass rolls no damage.
          const dmg = await watch(() => damageOf(msg._source.system?.origin), { ms: 2000 });
          ok('P7. left alone — the buzzer answers Pass, nothing rolls, nothing spends',
            (resolved?.outcome === 'passed (timer)') && !dmg && (poolUses() === usesBefore),
            `outcome=${resolved?.outcome} uses ${usesBefore}→${poolUses()}`);
        }
        await set('holdTimer', 0);
        await closeDialogs('Precision');
      }
    });

    /* ==== R1+R2 — the Riposte offer + the driven attack */
    if (want('R')) await section('R', async () => {
      await acFlat(pc, 40);   // the enemy always misses the PC
      await acFlat(enemy, 1);              // the riposte always hits back (a fumble retries below)
      {
        const usesBefore = poolUses();
        const { msg, flag } = await missUntilStamped(enemyAttackAct(), pcToken, 'riposte');
        ok('R1. an enemy MELEE miss offers the riposte to the missed reactor',
          !!flag && (flag.status === 'pending') && (flag.reactors?.length === 1)
            && (flag.reactors[0].uuid === pc.uuid) && (flag.attackerUuid === enemy.uuid),
          JSON.stringify({ reactors: flag?.reactors?.map(r => r.name),
            attackerUuid: flag?.attackerUuid, want: enemy.uuid }));
        const popup = await until(() => dialogsWith('Riposte with')[0], { timeout: 6000, label: 'the riposte popup' });
        // ONE equipped melee weapon skips the dropdown: the popup NAMES it.
        ok('R2a. the popup carries Riposte/Pass and NAMES the single weapon (no dropdown, ④)',
          !!popup && !!popup.querySelector('button[data-action="riposte"]')
            && !popup.querySelector('select[name="bf-riposte-weapon"]')
            && (popup.innerHTML ?? '').includes(enemyWeapon.name),
          `popup=${!!popup} select=${!!popup?.querySelector('select[name="bf-riposte-weapon"]')}`);

        popup?.querySelector('button[data-action="riposte"]')?.click();
        const driven = await until(() => game.messages.contents.find(m =>
          (m.getFlag(MOD, 'riposteFor') === msg?.id) && (m.getFlag(MOD, 'riposteBy') === pc.uuid)),
        { timeout: 15000, label: 'the driven riposte attack' });
        ok('R2b. accepting drives a REAL attack carrying its provenance, aimed at the attacker',
          !!driven && (driven.type === 'attack')
            && (driven.system?.targets ?? []).map(t => ({ ...t, uuid: t.actor })).some(t => t.uuid === enemy.uuid),
          `driven=${!!driven} targets=${JSON.stringify(driven?.system?.targets?.map(t => t.name))}`);
        ok('R2c. the maneuver really spent — the pool is down one',
          poolUses() === usesBefore - 1, `uses ${usesBefore}→${poolUses()}`);

        const drivenRoll = driven?.rolls?.[0];
        if (drivenRoll?.isFumble) {
          skips.push('R2d/e — the driven attack rolled a natural 1 (miss); die-in-damage not exercised this run');
        } else {
          const dmg = await waitDamage(driven?._source.system?.origin, 12000);
          // The die folds INTO the base roll: two d8 terms in one roll, counted by group, not by
          // literal "1d8" (a driven crit doubles both to 2d8).
          const d8s = (dmg?.rolls?.[0]?.formula?.match(/\d+d8/g) ?? []).length;
          ok('R2d. the superiority die is BAKED INTO the base damage roll — one group ((d))',
            !!dmg && (dmg.rolls?.length === 1) && (d8s === 2),
            `dmg=${!!dmg} rolls=${dmg?.rolls?.length} d8Groups=${d8s} formula=${dmg?.rolls?.[0]?.formula}`);
          const receipt = await until(() => dmg?.getFlag(MOD, 'receipt'), { timeout: 8000, label: 'the driven damage receipt' });
          ok('R2e. the driven chain applies like any real attack (receipt on the enemy)',
            !!receipt?.targets?.some(t => t.uuid === enemy.uuid),
            `receipt=${!!receipt}`);
        }
        ok('R2f. out of combat no Reaction chip is written (no turn to bring it back)',
          !reactionChip(pc),
          `chip=${reactionChip(pc)}`);
        const rFlag = msg?.getFlag(MOD, 'riposte');
        ok('R2g. the chosen weapon is RECORDED on the fold — the card can name it (④)',
          rFlag?.reactors?.[0]?.weaponName === enemyWeapon.name,
          `weaponName=${rFlag?.reactors?.[0]?.weaponName} want=${enemyWeapon.name}`);

        // The maneuver's own use must NOT chain dnd5e's follow-up damage dialog; it would open
        // async, so this is a negative assert over a window.
        const orphan = await watch(() => [...document.querySelectorAll('.application')].find(el =>
          (el.querySelector('.window-title')?.textContent ?? '').includes('Damage Roll')
          && (el.innerHTML ?? '').includes('Riposte')), { ms: 1200 });
        ok('R2h. (v) no native damage dialog orphans off the maneuver use',
          !orphan, `orphanDialog=${!!orphan}`);
      }

      /* R3 — a spent reaction is never offered. */
      {
        await spendReactionOf(pc);
        const { msg } = await attack(enemyAttackAct(), pcToken);
        // The window: a spent Reaction stamps no offer.
        const stray = await watch(() => msg?.getFlag(MOD, 'riposte'), { ms: 1500 });
        ok('R3. a standing Reaction chip suppresses the offer entirely',
          !!msg && !stray && !msg.getFlag(MOD, 'riposte'),
          `offered=${!!(stray ?? msg?.getFlag(MOD, 'riposte'))}`);
        await clearReaction(pc);
      }

      /* R4 — a RANGED miss never offers. */
      {
        const importByName = async name => {
          for (const p of game.packs.filter(p => p.documentName === 'Item')) {
            const e = p.index.find(i => i.name === name);
            if (e) { const d = await p.getDocument(e._id); return d.toObject(); }
          }
          return null;
        };
        const bowSrc = await importByName('Shortbow');
        if (bowSrc) {
          const [bow] = await enemy.createEmbeddedDocuments('Item', [
            { ...bowSrc, name: 'BTB Test Bow', system: { ...bowSrc.system, equipped: true } }]);
          created.enemyItems.push(bow.id);
          const bowAct = bow.system.activities?.contents?.find(a => a.type === 'attack');
          game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
          pcToken.setTarget(true, { releaseOthers: true });
          await until(() => targetsOnly(pcToken), { label: 'the bow\'s one target' });
          const use = await bowAct.use({ subsequentActions: false }, { configure: false }, {});
          const rolls = await bowAct.rollAttack({ advantage: false, disadvantage: true },
            { configure: false }, { data: { 'system.origin': use?.message?.id } });
          const msg = rolls?.[0]?.parent;
          // The window: a ranged miss stamps no offer.
          const stray = await watch(() => msg?.getFlag(MOD, 'riposte'), { ms: 1800 });
          ok('R4. a ranged miss offers nothing — the fold is melee-gated',
            !!msg && !stray && !msg.getFlag(MOD, 'riposte'),
            `flag=${!!(stray ?? msg?.getFlag(MOD, 'riposte'))}`);
        } else {
          skips.push('R4 — no Shortbow in any pack; ranged gate not exercised');
        }
      }

      /* R5 — decline: nothing drives, nothing spends. */
      {
        const usesBefore = poolUses();
        const { msg, flag } = await missUntilStamped(enemyAttackAct(), pcToken, 'riposte');
        if (!flag) {
          ok('R5. decline — nothing drives', false, 'no stamp in 8 tries');
        } else {
          const popup = await until(() => dialogsWith('Riposte with')[0], { timeout: 6000, label: 'the riposte popup' });
          popup?.querySelector('button[data-action="pass"]')?.click();
          const resolved = await until(() => {
            const r = msg.getFlag(MOD, 'riposte');
            return (r?.status === 'resolved') ? r : null;
          }, { timeout: 6000, label: 'the riposte offer resolved' });
          // The window: a declined riposte drives no attack.
          const driven = await watch(() => game.messages.contents.find(m => m.getFlag(MOD, 'riposteFor') === msg.id), { ms: 800 });
          ok('R5. decline — no driven attack, the die stays in the pool',
            (resolved?.reactors?.[0]?.answer === 'declined') && !driven && (poolUses() === usesBefore),
            `answer=${resolved?.reactors?.[0]?.answer} driven=${!!driven}`);
        }
      }

      /* R6 — a DRIVEN attack never chains a second offer, even at an eligible reactor. */
      {
        // Make the ENEMY riposte-eligible and force the driven attack to miss: only the
        // riposteFor guard stops a chained offer.
        const [ePool] = await enemy.createEmbeddedDocuments('Item', [{
          name: 'BTB Enemy Superiority', type: 'feat',
          system: { type: { value: 'feat' }, uses: { spent: 0, max: '4', recovery: [] } }
        }]);
        created.enemyItems.push(ePool.id);
        const [eRiposte] = await enemy.createEmbeddedDocuments('Item', [{
          name: 'Riposte', type: 'feat',
          system: { type: { value: 'feat' }, activities: {
            bfriposteenemy00: {
              _id: 'bfriposteenemy00', type: 'damage',
              activation: { type: 'reaction', override: false },
              consumption: { targets: [{ type: 'itemUses', target: ePool.id, value: '1' }] },
              damage: { parts: [{ custom: { enabled: true, formula: '1d8' }, types: ['slashing'] }] },
              target: { affects: { type: 'creature' } }
            }
          } } }]);
        created.enemyItems.push(eRiposte.id);
        await acFlat(enemy, 40);   // the driven attack will MISS the now-eligible enemy
        const { msg, flag } = await missUntilStamped(enemyAttackAct(), pcToken, 'riposte');
        if (!flag) {
          ok('R6. a driven attack never re-offers', false, 'no stamp in 8 tries');
        } else {
          const popup = await until(() => dialogsWith('Riposte with')[0], { timeout: 6000, label: 'the riposte popup' });
          popup?.querySelector('button[data-action="riposte"]')?.click();
          const driven = await until(() => game.messages.contents.find(m =>
            (m.getFlag(MOD, 'riposteFor') === msg.id) && (m.getFlag(MOD, 'riposteBy') === pc.uuid)),
          { timeout: 15000, label: 'the driven riposte attack' });
          // The window: the stamp hook would need a beat to fire, if it wrongly did.
          const chained = await watch(() => driven.getFlag(MOD, 'riposte'), { ms: 2000 });
          ok('R6. the driven attack misses an ELIGIBLE reactor and still never chains an offer',
            !!driven && !chained && !driven.getFlag(MOD, 'riposte'),
            `driven=${!!driven} chained=${!!(chained ?? driven?.getFlag(MOD, 'riposte'))}`);
          // The announced miss: the card posts before any Graze/Precision offer can arrive.
          // ⚠ A natural 20 hits through AC 40 and correctly posts no miss card: skipped, not failed.
          const drivenCrit = driven?.rolls?.[0]?.isCritical === true;
          if (drivenCrit) {
            skips.push('R6b — the driven attack rolled a natural 20 and auto-hit through flat AC 40; '
              + 'the miss announcement cannot post, so (p) is not exercised this run');
          } else {
            const missCard = await until(() => game.messages.contents.find(m => (m.timestamp >= suiteStart)
              && /the strike back misses/.test(m.content ?? '')), { timeout: 6000, label: 'the "strike back misses" card' });
            ok('R6b. (p) the driven MISS announces itself — "the strike back misses" posts',
              !!missCard, `card=${!!missCard}`);
          }
        }
        await closeDialogs('Precision');   // the PC's own precision may have offered on that miss
        await closeDialogs('Riposte');
      }
    });

    /* ==== P8 — player-owned, owner OFFLINE: player-first, GM fallback (the GM gets the popup) */
    if (want('P8')) await section('P8', async () => {
      {
        const playerUser = game.users.find(u => !u.isGM);
        if (!playerUser) {
          skips.push('P8 — no player user in this world; the ①-gate pin not exercised');
        } else {
          // Object form: a dotted key raises "is not a mapping". The grant must provably land, or
          // the pin passes vacuously.
          await pc.update({ ownership: { [playerUser.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
          ok('P8a. the fixture is really player-owned (the pin cannot pass vacuously)',
            pc.hasPlayerOwner === true, `hasPlayerOwner=${pc.hasPlayerOwner}`);
          const { msg, flag } = await missUntilStamped(pcAttackAct(), victimToken, 'precision');
          if (!flag) {
            ok('P8b. player-owned attacker, owner offline — the GM STILL gets the popup (①)', false, 'no stamp in 8 tries');
          } else {
            const popup = await until(() => rescueWindow('use'), { timeout: 6000, label: 'the precision rescue window on the GM' });
            ok('P8b. player-owned attacker, owner offline — the GM STILL gets the popup (①)',
              !!popup, `popup=${!!popup}`);
            popup?.querySelector('button[data-action="pass"]')?.click();
            await until(() => msg.getFlag(MOD, 'precision')?.status === 'resolved', { timeout: 6000, label: 'the precision offer resolved' });
          }
          await pc.update({ ownership: { [playerUser.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE } });
        }
      }
    });

    /* ==== M1 — two weapons, smart default */
    if (want('M1')) await section('M1', async () => {
      {
        const [offhand] = await pc.createEmbeddedDocuments('Item', [
          foundry.utils.mergeObject(enemyWeapon.toObject(), {
            name: 'BTB Test Offhand', system: { equipped: true } }, { inplace: false })]);
        // Attack with the offhand first: the default tracks USAGE, not inventory order.
        const offAct = pc.items.get(offhand.id)?.system.activities.find(a => a.type === 'attack');
        await acFlat(victim, 1);
        const { msg: offMsg } = await attack(offAct, victimToken);
        // The offhand's chain finishes first; a fumble rolls no damage, so the wait is soft.
        await waitDamage(offMsg?._source.system?.origin, 8000).catch(() => null);
        await acFlat(victim, 25);
        await closeDialogs('Weapon Mastery');

        const { msg, flag } = await missUntilStamped(enemyAttackAct(), pcToken, 'riposte');
        if (!flag) {
          ok('M1. two weapons — the dropdown returns, preselected to the LAST-ATTACKED (④)', false, 'no stamp in 8 tries');
        } else {
          const popup = await until(() => dialogsWith('Riposte with')[0], { timeout: 6000, label: 'the riposte popup' });
          const select = popup?.querySelector('select[name="bf-riposte-weapon"]');
          ok('M1. two weapons — the dropdown returns, preselected to the LAST-ATTACKED (④)',
            !!select && (select.value === offhand.id),
            `select=${!!select} value=${select?.value} want=${offhand.id}`);
          popup?.querySelector('button[data-action="pass"]')?.click();
          await until(() => msg.getFlag(MOD, 'riposte')?.status === 'resolved', { timeout: 6000, label: 'the riposte offer resolved' });
        }
        await pc.deleteEmbeddedDocuments('Item', [offhand.id]).catch(() => {});
        await closeDialogs('Riposte');
      }
    });

    /* ==== RP — the riposte HIT celebrates */
    if (want('RP')) await section('RP', async () => {
      {
        await pc.items.get(pool.id)?.update({ 'system.uses.spent': 0 });   // top the pool back up
        await set('playerRollDamage', true);
        await acFlat(enemy, 1);   // the strike back always hits
        const { msg, flag } = await missUntilStamped(enemyAttackAct(), pcToken, 'riposte');
        if (!flag) {
          ok('RP1. (l)/(p) the damage offer celebrates the riposte BY NAME, die note aboard', false, 'no stamp in 8 tries');
        } else {
          const popup = await until(() => dialogsWith('Riposte with')[0], { timeout: 6000, label: 'the riposte popup' });
          popup?.querySelector('button[data-action="riposte"]')?.click();
          // Soft: no driven attack is the skip below.
          const driven = await until(() => game.messages.contents.find(m =>
            (m.getFlag(MOD, 'riposteFor') === msg.id) && (m.getFlag(MOD, 'riposteBy') === pc.uuid)),
          { timeout: 15000, label: 'the driven riposte attack' }).catch(() => null);
          if (!driven || driven.rolls?.[0]?.isFumble) {
            skips.push('RP — the driven attack fumbled (nat 1 vs flat AC 1); the celebration popup not exercised this run');
            await closeDialogs('Precision');
          } else {
            // The offer popup on the driving client names the riposte, with the die-riding note.
            const offer = await until(() => [...document.querySelectorAll('.application')]
              .find(el => el.querySelector('button[data-action="roll"]') && /riposte/i.test(el.innerHTML ?? '')),
            { timeout: 8000, label: 'the riposte damage offer popup' });
            const title = offer?.querySelector('.window-title')?.textContent ?? '';
            ok('RP1. (l)/(p) the damage offer celebrates the riposte BY NAME, die note aboard',
              !!offer && /riposte/i.test(title) && /roll damage/i.test(title)
                && /superiority die rides this roll/i.test(offer?.innerHTML ?? ''),
              `offer=${!!offer} title="${title}"`);
            offer?.querySelector('button[data-action="roll"]')?.click();
            const dmg = await waitDamage(driven?._source.system?.origin, 12000);
            ok('RP2. the celebrated button rolls through the same chokepoint — the damage lands',
              !!dmg, `dmg=${!!dmg}`);
          }
        }
        await set('playerRollDamage', false);
        await closeDialogs('Riposte');
        await closeDialogs('Weapon Mastery');
      }
    });

    /* ==== B — the bash choice (Prone or push) */
    if (want('B')) await section('B', async () => {
      await set('saves', true);
      // A listed feat whose save presses an effect on failure (DC 30: always fails; the effect
      // wired by its real id after creation).
      const [bashFeat] = await pc.createEmbeddedDocuments('Item', [{
        name: 'BTB Shield Master', type: 'feat',
        system: { type: { value: 'feat' }, identifier: 'shield-master', activities: {
          bfbash0000000000: {
            _id: 'bfbash0000000000', type: 'save',
            activation: { type: '', override: false },
            damage: { parts: [], onSave: 'half' },
            effects: [],
            save: { ability: ['str'], dc: { calculation: '', formula: '30' } },
            target: { affects: { type: 'creature' } }
          }
        } },
        effects: [{ name: 'BTB Test Prone', icon: 'icons/svg/falling.svg',
          transfer: false, statuses: ['prone'] }]
      }]);
      const proneEffect = bashFeat.effects.contents[0];
      await bashFeat.update({
        'system.activities.bfbash0000000000.effects': [{ _id: proneEffect.id, onSave: false }] });
      const bashAct = () => pc.items.get(bashFeat.id)?.system.activities.get('bfbash0000000000');
      // Off the sheet however the section ends: every table row is live, so a weapon hit beside the victim in §T would bash.
      try {

      /* B1 — the failed save opens the choice; the verdict line is source-first, saver-spoken. */
      {
        await reviveVictim();
        const card = await castAt(bashAct(), victimToken);
        // Soft: on absence B1a's detail prints the demand's target instead.
        const choice = await until(() => {
          const t = card?.getFlag(MOD, 'saves')?.targets?.[0];
          return (t?.choice && !t.choice.answer) ? t.choice : null;
        }, { timeout: 20000, label: 'the bash choice opened' }).catch(() => null);
        ok('B1a. a failed listed save opens the bash choice instead of hard-pressing (⑤)',
          choice?.kind === 'bash',
          `choice=${choice ? choice.kind : JSON.stringify(card?.getFlag(MOD, 'saves')?.targets?.[0] ?? null)}`);
        // The usage card carries the verdict; no separate verdict card posts.
        const verdictCards = game.messages.contents.filter(m => m.getFlag(MOD, 'verdictLine')?.sourceMessageId === card?.id);
        const cardTextB1 = () => (ui.chat.element?.querySelector(`.message[data-message-id="${card?.id}"]`)?.textContent ?? '').replace(/\s+/g, ' ');
        // Soft: on absence B1b's detail prints the card's text as it stands.
        const onCardB1 = await until(() => /vs DC \d+ — failed/.test(cardTextB1()) ? cardTextB1() : null,
          { timeout: 6000, label: 'the verdict on the usage card' }).catch(() => null);
        ok('B1b. the verdict is on the usage card — "vs DC … — failed" — and no public verdict card posts (the line retired 2026-09-18)',
          !!onCardB1 && (verdictCards.length === 0),
          `cards=${verdictCards.length} text="${(onCardB1 ?? cardTextB1()).slice(0, 160)}"`);
        const popup = await until(() => dialogsWith('Knock Prone')[0], { timeout: 6000, label: 'the bash choice popup' });
        // The rule line fills from the book a moment after the popup draws.
        await until(() => (popup?.textContent ?? '').includes('cause it to have the Prone condition'),
          { timeout: 4000, label: 'the bash popup\'s rule line' });
        ok('B1c. the choice popup carries Knock Prone / Push 5 feet, quotes the feat verbatim ((z)) and tooltips its icon ((aa))',
          !!popup && !!popup.querySelector('button[data-action="prone"]')
            && !!popup.querySelector('button[data-action="push"]')
            && (popup.textContent ?? '').includes('cause it to have the Prone condition')
            && !!popup.querySelector('img[data-tooltip]'),
          `popup=${!!popup} verbatim=${(popup?.textContent ?? '').includes('cause it to have the Prone condition')} tooltip=${!!popup?.querySelector('img[data-tooltip]')}`);
        popup?.querySelector('button[data-action="push"]')?.click();
        const applied = await until(() => card?.getFlag(MOD, 'saves')?.targets?.[0]?.applied,
          { timeout: 15000, label: 'the push answer applied' });
        const pressed = victim.effects.some(e => e.name === 'BTB Test Prone');
        const pushMsg = game.messages.contents.find(m => (m.timestamp >= suiteStart)
          && /pushes .* 5 feet/.test(m.content ?? ''));
        ok('B1d. push — NO press lands (custom or standard), the announce card does (the Push idiom)',
          !!applied && !pressed && !victim.statuses.has('prone') && !!pushMsg,
          `applied=${!!applied} pressed=${pressed} prone=${victim.statuses.has('prone')} pushMsg=${!!pushMsg}`);
      }

      /* B2 — the prone answer presses the STANDARD Prone chip (canonical id, origin names the
       * presser), never the item's own effect. */
      {
        await reviveVictim();
        await victim.effects.find(e => e.statuses.has('prone'))?.delete().catch(() => {});
        const card = await castAt(bashAct(), victimToken);
        const popup = await until(() => dialogsWith('Knock Prone')[0], { timeout: 20000, label: 'the bash choice popup' });
        popup?.querySelector('button[data-action="prone"]')?.click();
        const applied = await until(() => card?.getFlag(MOD, 'saves')?.targets?.[0]?.applied,
          { timeout: 15000, label: 'the prone answer applied' });
        const chip = await until(() => victim.effects.find(e => e.statuses.has('prone')),
          { timeout: 6000, label: 'the Prone chip on the victim' });
        ok('B2. (x) prone — the STANDARD Prone chip lands: canonical id, attacker origin, no custom effect',
          !!applied && (chip?.id === 'dnd5eprone000000') && (chip?.origin === pc.uuid)
            && !victim.effects.some(e => e.name === 'BTB Test Prone'),
          `applied=${!!applied} chip=${chip?.id ?? null} origin=${chip?.origin ?? null} want=${pc.uuid} `
            + `custom=${victim.effects.some(e => e.name === 'BTB Test Prone')}`);
        await chip?.delete().catch(() => {});
      }

      /* B3 — the choice bar is VISIBLE, then the buzzer defaults to Prone and says so. */
      {
        await set('holdTimer', 4);
        await reviveVictim();
        await victim.effects.find(e => e.statuses.has('prone'))?.delete().catch(() => {});
        const card = await castAt(bashAct(), victimToken);
        // The pending choice draws its bar (card row AND popup). The DOM is the assertion: the
        // flags can be right while a status-gated wrapper renders "".
        const choiceStamped = await until(() => {
          const x = card?.getFlag(MOD, 'saves')?.targets?.[0];
          return (x?.choice && !x.choice.answer) ? x.choice : null;
        }, { timeout: 20000, label: 'the bash choice opened' });
        const choicePopup = await until(() => dialogsWith('Knock Prone')[0], { timeout: 4000, label: 'the bash choice popup' });
        const cardBar = await until(() => document.querySelector(
          `.message[data-message-id="${card?.id}"] [data-bf-deadline]`), { timeout: 3000, label: 'the choice bar on the card row' });
        const popupBar = choicePopup?.querySelector('[data-bf-deadline]') ?? null;
        ok('B3a. (n) the pending choice bar RENDERS — card row and popup both carry data-bf-deadline',
          !!choiceStamped?.deadline && !!cardBar && !!popupBar,
          `deadline=${!!choiceStamped?.deadline} cardBar=${!!cardBar} popupBar=${!!popupBar}`);
        const t = await until(() => {
          const x = card?.getFlag(MOD, 'saves')?.targets?.[0];
          return (x?.choice?.answer && x.applied) ? x : null;
        }, { timeout: 25000, label: 'the buzzer\'s bash answer applied' });
        const chip = victim.effects.find(e => e.statuses.has('prone'));
        ok('B3. left alone — the buzzer defaults the bash to Prone (the (x) standard chip, stated on the card)',
          (t?.choice?.answer === 'prone') && !!t?.choice?.timedOut && (chip?.id === 'dnd5eprone000000'),
          `answer=${t?.choice?.answer} timedOut=${!!t?.choice?.timedOut} chip=${chip?.id ?? null}`);
        await chip?.delete().catch(() => {});
        await set('holdTimer', 0);
        await closeDialogs('BTB Shield Master');
      }

      /* B4 — the HIT is the trigger: offer → drive → demand → choice → press. */
      {
        // Unkillable for the section: the dead gate would silently eat the demand.
        priorActor[victim.id]['system.attributes.hp.max'] = victim.system._source.attributes.hp.max;
        await victim.update({ 'system.attributes.hp.max': 1000, 'system.attributes.hp.value': 1000 });
        await acFlat(victim, 1);
        await victim.effects.find(e => e.statuses.has('prone'))?.delete().catch(() => {});
        // The feat's reach (within 5 feet): a hit from two squares off stamps nothing; then the
        // PC steps beside the target for the chain below.
        {
          let far = null;
          for (let i = 0; i < 4 && !far; i++) {
            const { msg, roll } = await attack(pcAttackAct(), victimToken);
            if (roll && !roll.isFumble) far = msg;
          }
          // The window: a hit from beyond the reach stamps no offer.
          const stray = await watch(() => far?.getFlag(MOD, 'bashOffer'), { ms: 2500 });
          const feet = canvas.grid.measurePath([pcToken.center, victimToken.center]).distance;
          ok('B4e. a HIT from beyond 5 feet stamps no bash offer — the feat\'s own reach (a play report, 2026-09-22)',
            !!far && (feet > 5) && !stray && !far.getFlag(MOD, 'bashOffer'),
            `hit=${!!far} feet=${feet} offer=${JSON.stringify(stray ?? far?.getFlag(MOD, 'bashOffer') ?? null)}`);
        }
        const pcHome = { x: pcToken.document.x, y: pcToken.document.y };
        const beside = { x: victimToken.document.x, y: victimToken.document.y + canvas.grid.size };
        await pcToken.document.update(beside, { animate: false });
        // The reach is measured off the token documents (geometry.js nearestFeet).
        await until(() => (pcToken.document.x === beside.x) && (pcToken.document.y === beside.y),
          { label: 'the PC token beside the victim' });
        let offer = null, atkMsg = null, queuedFirst = null, dmgAtPromotion = null;
        // ⚠ The statuses are read off the WRITES, not polled: on Foundry 14.369 / dnd5e 6.0.6 the
        // damage lands ~25 ms after the attack and the promotion ~40 ms after that, so a 200 ms poll
        // saw `pending` first and called the sequence broken (2026-10-10, suite issue #8).
        const statusLedger = new Map(); // attack message id → every bashOffer status written, in order
        const ledgerHook = Hooks.on('updateChatMessage', (m, changed) => {
          const status = changed?.flags?.[MOD]?.bashOffer?.status;
          if (!status) return;
          if (!statusLedger.has(m.id)) statusLedger.set(m.id, []);
          statusLedger.get(m.id).push(status);
        });
        for (let i = 0; i < 6 && !offer; i++) {
          const { msg } = await attack(pcAttackAct(), victimToken);
          atkMsg = msg;
          // The hit stamps the offer QUEUED; it goes pending (clock starts) once the damage lands.
          // Per try (soft): a miss or a fumble stamps nothing, and the loop swings again.
          const stamped = await until(() => msg?.getFlag(MOD, 'bashOffer'),
            { timeout: 4000, label: 'the bash offer stamped' }).catch(() => null);
          if (stamped) {
            queuedFirst = statusLedger.get(msg.id)?.[0] ?? stamped.status;
            offer = await until(() => {
              const b = msg?.getFlag(MOD, 'bashOffer');
              return (b?.status === 'pending') ? b : null;
            }, { timeout: 12000, label: 'the bash offer pending' }).catch(() => null);
            // Soft: a missing damage roll leaves dmgAtPromotion null, which B4a2 reports.
            const dmg = offer ? await waitDamage(msg?._source.system?.origin, 500).catch(() => null) : null;
            dmgAtPromotion = dmg ? dmg.timestamp : null;
          }
          if (!offer) log.push(`B4: attempt ${i + 1} produced no offer (miss/fumble) — retrying`);
        }
        Hooks.off('updateChatMessage', ledgerHook);
        const statusesWritten = JSON.stringify(statusLedger.get(atkMsg?.id) ?? null);
        ok('B4a. a melee weapon HIT by the listed carrier stamps the bash offer ((g))',
          (offer?.status === 'pending') && ((offer?.targets ?? []).length === 1),
          `offer=${!!offer} targets=${offer?.targets?.length}`);
        // holdTimer is 0 here, so promotedAt is the proof the clock starts at the promotion.
        ok('B4a2. THE SEQUENCE — stamped queued at the hit, pending only after the damage landed, promoted after it',
          (queuedFirst === 'queued') && Number.isFinite(dmgAtPromotion) && Number.isFinite(offer?.promotedAt)
            && (offer.promotedAt >= dmgAtPromotion) && (offer.promotedAt > (atkMsg?.timestamp ?? 0)),
          `first=${queuedFirst} written=${statusesWritten} damageAt=${dmgAtPromotion} promotedAt=${offer?.promotedAt} attackAt=${atkMsg?.timestamp}`);
        const popup = await until(() => dialogsWith('— bash')[0], { timeout: 6000, label: 'the bash offer popup' });
        ok('B4b. the offer popup carries Use/Pass',
          !!popup && !!popup.querySelector('button[data-action="use"]')
            && !!popup.querySelector('button[data-action="pass"]'),
          `popup=${!!popup}`);
        popup?.querySelector('button[data-action="use"]')?.click();
        const usage = await until(() => game.messages.contents.find(m =>
          m.getFlag(MOD, 'bashFor') === atkMsg?.id), { timeout: 12000, label: 'the driven bash usage card' });
        ok('B4c. accepting drives the feat\'s OWN save activity, provenance-stamped',
          !!usage && !!(await until(() => usage?.getFlag(MOD, 'saves'), { timeout: 8000, label: 'the driven save demand' })),
          `usage=${!!usage} demand=${!!usage?.getFlag(MOD, 'saves')}`);
        const choicePopup = await until(() => dialogsWith('Knock Prone')[0], { timeout: 25000, label: 'the bash choice popup' });
        choicePopup?.querySelector('button[data-action="prone"]')?.click();
        const applied = await until(() => usage?.getFlag(MOD, 'saves')?.targets?.[0]?.applied,
          { timeout: 15000, label: 'the prone answer applied' });
        const chip = await until(() => victim.effects.find(e => e.statuses.has('prone')),
          { timeout: 6000, label: 'the Prone chip on the victim' });
        ok('B4d. the driven demand fails and the chosen press lands the (x) standard chip — end to end',
          !!applied && (chip?.id === 'dnd5eprone000000'), `applied=${!!applied} chip=${chip?.id ?? null}`);
        await chip?.delete().catch(() => {});
        await pcToken.document.update(pcHome, { animate: false });
        await acFlat(victim, 25);
        await closeDialogs('BTB Shield Master');
      }
      } finally {
        await pc.deleteEmbeddedDocuments('Item', [bashFeat.id]).catch(() => {});
      }
    });

    /* ==== T — Tavern Brawler's push (the `shove` kind) */
    if (want('T')) await section('T', async () => {
      // The PHB's own Tavern Brawler: its Enhanced Unarmed Strike is an attack activity classified unarmed.
      let brawlerSrc = null;
      for (const pack of game.packs.filter(p => (p.metadata.packageName === 'dnd-players-handbook') && (p.documentName === 'Item'))) {
        const hit = (await pack.getIndex()).find(e => e.name === 'Tavern Brawler');
        if (hit) { brawlerSrc = await pack.getDocument(hit._id); break; }
      }
      if (!brawlerSrc) {
        ok('T0. the PHB ships Tavern Brawler', false, 'no "Tavern Brawler" in the PHB packs');
      } else {
        const [brawler] = await pc.createEmbeddedDocuments('Item', [brawlerSrc.toObject()]);
        const unarmedAct = () => pc.items.get(brawler.id)?.system.activities.find(a => a.type === 'attack');
        priorActor[victim.id]['system.attributes.hp.max'] ??= victim.system._source.attributes.hp.max;
        await victim.update({ 'system.attributes.hp.max': 1000, 'system.attributes.hp.value': 1000 });
        await acFlat(victim, 1);
        const pcHome = { x: pcToken.document.x, y: pcToken.document.y };
        const beside = { x: victimToken.document.x, y: victimToken.document.y + canvas.grid.size };
        await pcToken.document.update(beside, { animate: false });
        // The reach is measured off the token documents (geometry.js nearestFeet).
        await until(() => (pcToken.document.x === beside.x) && (pcToken.document.y === beside.y),
          { label: 'the PC token beside the victim' });
        const hitUntil = async act => {
          for (let i = 0; i < 6; i++) {
            const { msg, roll } = await attack(act, victimToken);
            if (roll && !roll.isFumble && (roll.total > 1)) return msg;
          }
          return null;
        };

        /* T1 — an Unarmed Strike hit: queued, promoted after the damage, Push 5 feet / Pass. */
        {
          const msg = await hitUntil(unarmedAct());
          const stamped = await until(() => msg?.getFlag(MOD, 'bashOffer'), { timeout: 4000, label: 'the shove offer stamped' });
          const offer = await until(() => { const b = msg?.getFlag(MOD, 'bashOffer'); return (b?.status === 'pending') ? b : null; },
            { timeout: 12000, label: 'the shove offer pending' });
          ok('T1a. an Unarmed Strike hit by a Tavern Brawler stamps the shove offer (kind shove), pending after the damage',
            (stamped?.kind === 'shove') && (offer?.status === 'pending') && ((offer?.targets ?? []).length === 1),
            `stamped=${JSON.stringify(stamped ? { kind: stamped.kind, status: stamped.status } : null)} offer=${offer?.status}`);
          const popup = await until(() => dialogsWith('5 feet?')[0], { timeout: 6000, label: 'the shove popup' });
          const use = popup?.querySelector('button[data-action="use"]');
          ok('T1b. the popup asks "push … 5 feet?" with Push 5 feet / Pass',
            !!use && /Push 5 feet/.test(use.textContent ?? '') && !!popup?.querySelector('button[data-action="pass"]'),
            `popup=${!!popup} use="${use?.textContent ?? ''}"`);
          use?.click();
          const card = await until(() => game.messages.contents.find(m => m.getFlag(MOD, 'bashFor') === msg?.id),
            { timeout: 8000, label: 'the push announcement card' });
          const text = (card?.content ?? '').replace(/<[^>]+>/g, ' ');
          ok('T1c. Push announces it — "pushes Victim 5 feet", moved by hand — and drives no save activity',
            !!card && /pushes .* 5 feet/.test(text) && /by hand/.test(text) && !card.getFlag(MOD, 'saves'),
            `card=${!!card} text="${text.replace(/\s+/g, ' ').trim().slice(0, 120)}"`);
          ok('T1d. the offer resolved "use"', msg?.getFlag(MOD, 'bashOffer')?.answer === 'use', `answer=${msg?.getFlag(MOD, 'bashOffer')?.answer}`);
          await closeDialogs('Tavern Brawler');
        }

        /* T2 — a weapon hit carries no shove. */
        {
          const msg = await hitUntil(pcAttackAct());
          // The window: a weapon hit stamps no shove offer.
          const stray = await watch(() => msg?.getFlag(MOD, 'bashOffer'), { ms: 2500 });
          ok('T2a. a weapon hit stamps no shove offer — the Unarmed Strike alone', !!msg && !stray && !msg.getFlag(MOD, 'bashOffer'),
            `hit=${!!msg} offer=${JSON.stringify(stray ?? msg?.getFlag(MOD, 'bashOffer') ?? null)}`);
        }

        /* T4 — the plain Unarmed Strike (the PHB's own weapon) rolls the feat's die, and says so. */
        {
          const usSrc = await fromUuid('Compendium.dnd-players-handbook.equipment.Item.phbUnarmedStrike');
          if (!usSrc) {
            ok('T4. the PHB ships the Unarmed Strike weapon', false, 'no phbUnarmedStrike');
          } else {
            const [us] = await pc.createEmbeddedDocuments('Item', [usSrc.toObject()]);
            const usAct = () => pc.items.get(us.id)?.system.activities.find(a => a.type === 'attack');
            const dmgOf = async () => {
              for (let i = 0; i < 6; i++) {
                const { usageId, roll } = await attack(usAct(), victimToken);
                if (!roll || roll.isFumble || (roll.total <= 1)) continue;
                return waitDamage(usageId);
              }
              return null;
            };
            const dmg = await dmgOf();
            const flag = dmg?.getFlag(MOD, 'unarmedDice');
            const formula = dmg?.rolls?.[0]?.formula ?? '';
            ok('T4a. the plain Unarmed Strike rolls the feat 1d4 (1s rerolled) + Str, not the flat 1 + Str; the flag names the swap',
              /1d4r1/.test(formula) && (flag?.feature === 'Tavern Brawler') && /1d4r1/.test(flag?.formula ?? '') && !/d/.test(flag?.was ?? 'd'),
              `formula="${formula}" flag=${JSON.stringify(flag ?? null)}`);
            const line = await until(() => document.querySelector(`[data-message-id="${dmg?.id}"] .bf-unarmed-dice-line`),
              { timeout: 4000, label: 'the unarmed-dice line on the damage card' });
            ok('T4b. the damage card says so: "Tavern Brawler — 1d4r1 + N in place of 1 + N"',
              /Tavern Brawler — 1d4r1 .* in place of 1 \+/.test(line?.textContent ?? ''), `line="${line?.textContent ?? ''}"`);
            await pc.deleteEmbeddedDocuments('Item', [us.id]);
          }
        }
        await pcToken.document.update(pcHome, { animate: false });
        await acFlat(victim, 25);
        await closeDialogs('Tavern Brawler');
        await closeDialogs('Weapon Mastery');
      }
    });

    /* ==== C — Crusher's push */
    if (want('C')) await section('C', async () => {
      const phb = async (name, type) => {
        for (const pack of game.packs.filter(p => (p.metadata.packageName === 'dnd-players-handbook') && (p.documentName === 'Item'))) {
          const hit = (await pack.getIndex({ fields: ['type'] })).find(e => (e.name === name) && (e.type === type));
          if (hit) return pack.getDocument(hit._id);
        }
        return null;
      };
      const srcs = { crusher: await phb('Crusher', 'feat'), mace: await phb('Mace', 'weapon'), dagger: await phb('Dagger', 'weapon') };
      if (!srcs.crusher || !srcs.mace || !srcs.dagger) {
        ok('C0. the PHB ships Crusher, a Mace and a Dagger', false, JSON.stringify(Object.fromEntries(Object.entries(srcs).map(([k, v]) => [k, !!v]))));
      } else {
        const made = await pc.createEmbeddedDocuments('Item', [srcs.crusher.toObject(), srcs.mace.toObject(), srcs.dagger.toObject()]);
        // ⚠ BY NAME: createEmbeddedDocuments' result order is not the request's.
        const mace = made.find(i => (i.name === 'Mace') && (i.type === 'weapon'));
        const dagger = made.find(i => (i.name === 'Dagger') && (i.type === 'weapon'));
        const actOf = item => () => pc.items.get(item.id)?.system.activities.find(a => a.type === 'attack');
        const sizeBefore = victim.system._source.traits?.size ?? 'med';
        priorActor[victim.id]['system.attributes.hp.max'] ??= victim.system._source.attributes.hp.max;
        await victim.update({ 'system.attributes.hp.max': 1000, 'system.attributes.hp.value': 1000 });
        await acFlat(victim, 1);
        const hitUntil = async act => {
          if (!act) {
            // Say what the sheet held when the Mace's attack is missing.
            const it = pc.items.get(mace?.id);
            log.push(`§C: no attack activity — made=${JSON.stringify(made.map(x => [x.name, x.id]))} onSheet=${!!it} activities=${JSON.stringify(it ? [...it.system.activities].map(a => a.type) : null)} pc=${pc.name}/${pc.uuid} items=${pc.items.size}`);
            ok('C. the Mace on the sheet carries its attack', false, log.at(-1));
            return null;
          }
          for (let i = 0; i < 6; i++) {
            const { msg, roll } = await attack(act, victimToken);
            if (roll && !roll.isFumble && (roll.total > 1)) return msg;
          }
          return null;
        };
        try {
          {
            const msg = await hitUntil(actOf(mace)());
            const offer = await until(() => { const b = msg?.getFlag(MOD, 'bashOffer'); return (b?.status === 'pending') ? b : null; },
              { timeout: 12000, label: 'the Crusher push offer pending' });
            ok('C1a. a Mace hit (Bludgeoning) by a Crusher stamps the shove offer, its row named Crusher',
              (offer?.kind === 'shove') && (offer?.shoveRow === 'Crusher'), `offer=${JSON.stringify(offer ? { kind: offer.kind, row: offer.shoveRow, status: offer.status } : null)}`);
            const popup = await until(() => dialogsWith('5 feet?')[0], { timeout: 6000, label: 'the Crusher push popup' });
            const text = (popup?.textContent ?? '').replace(/\s+/g, ' ');
            ok('C1b. the popup quotes Crusher\'s own rule ("…deals Bludgeoning damage…one size larger…")',
              /deals Bludgeoning damage/.test(text) && /one size larger/.test(text), text.slice(0, 200));
            popup?.querySelector('button[data-action="use"]')?.click();
            const card = await until(() => game.messages.contents.find(m => m.getFlag(MOD, 'bashFor') === msg?.id),
              { timeout: 8000, label: 'the push announcement card' });
            ok('C1c. Push 5 feet announces it', !!card && /pushes .* 5 feet/.test((card?.content ?? '').replace(/<[^>]+>/g, ' ')), `card=${!!card}`);
            await closeDialogs('Crusher');
          }
          {
            const msg = await hitUntil(actOf(dagger)());
            // The window: a Piercing hit stamps no push.
            const stray = await watch(() => msg?.getFlag(MOD, 'bashOffer'), { ms: 2500 });
            ok('C2. a Dagger hit (Piercing) stamps no push', !!msg && !stray && !msg.getFlag(MOD, 'bashOffer'),
              `offer=${JSON.stringify(stray ?? msg?.getFlag(MOD, 'bashOffer') ?? null)}`);
          }
          {
            await victim.update({ 'system.traits.size': 'huge' });
            const msg = await hitUntil(actOf(mace)());
            // The window: a target two sizes larger stamps no push.
            const stray = await watch(() => msg?.getFlag(MOD, 'bashOffer'), { ms: 2500 });
            ok('C3. a Huge target (two sizes larger than a Medium pusher): no push', !!msg && !stray && !msg.getFlag(MOD, 'bashOffer'),
              `size=${victim.system.traits.size} pc=${pc.system.traits.size} offer=${JSON.stringify(stray ?? msg?.getFlag(MOD, 'bashOffer') ?? null)}`);
          }
        } finally {
          await victim.update({ 'system.traits.size': sizeBefore }).catch(() => {});
          await pc.deleteEmbeddedDocuments('Item', made.map(i => i.id).filter(id => pc.items.get(id))).catch(() => {});
          await acFlat(victim, 25);
          await closeDialogs('Crusher');
          await closeDialogs('Weapon Mastery');
        }
      }
    });

    /* ==== I — Interpose (save-success reaction) */
    if (want('I')) await section('I', async () => {
      // A shield + the listed feat on the VICTIM; a DEX half-damage demand it always saves.
      priorActor[victim.id]['system.abilities.dex.value'] = victim.system._source.abilities.dex.value;
      await victim.update({ 'system.abilities.dex.value': 16 });
      {
        const [shield] = await victim.createEmbeddedDocuments('Item', [{
          name: 'BTB Test Shield', type: 'equipment',
          system: { type: { value: 'shield' }, equipped: true, armor: { value: 2 } }
        }]);
        created.victimItems.push(shield.id);
        const [interposeFeat] = await victim.createEmbeddedDocuments('Item', [{
          name: 'BTB Shield Master', type: 'feat', system: { type: { value: 'feat' }, identifier: 'shield-master' } }]);
        created.victimItems.push(interposeFeat.id);
      }
      const [dexBlast] = await pc.createEmbeddedDocuments('Item', [{
        name: 'BTB Test Dex Blast', type: 'feat',
        system: { type: { value: 'feat' }, activities: {
          bfdexblast000000: {
            _id: 'bfdexblast000000', type: 'save',
            activation: { type: '', override: false },
            damage: { parts: [{ custom: { enabled: true, formula: '10' }, types: ['fire'] }], onSave: 'half' },
            save: { ability: ['dex'], dc: { calculation: '', formula: '1' } },
            target: { affects: { type: 'creature' } }
          }
        } } }]);
      const dexAct = () => pc.items.get(dexBlast.id)?.system.activities.get('bfdexblast000000');

      /* I1 — NOTHING stamps with the demand; the SAVED verdict opens the choice; use turns the
       * half into NONE (the 2024 text conditions the Reaction on succeeding). */
      {
        await set('holdTimer', 15);   // the post-verdict choice window — room to click
        await victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max });
        const hpBefore = victim.system.attributes.hp.value;
        const card = await castAt(dexAct(), victimToken);
        // The save rolls itself at once: a choice may already stand, but never before the verdict.
        const early = card?.getFlag(MOD, 'saves')?.targets?.[0];
        ok('I1a. (y) nothing stamps with the demand — the choice is the VERDICT\'s to open',
          !!early && (!early.choice || (early.done === true)),
          `choice=${JSON.stringify(early?.choice ?? null)} done=${early?.done}`);
        const opened = await until(() => {
          const t = card?.getFlag(MOD, 'saves')?.targets?.[0];
          return (t?.done && (t.outcome === 'saved') && t.choice && !t.choice.answer) ? t : null;
        }, { timeout: 20000, label: 'the interpose choice opened on the saved verdict' });
        ok('I1b. (y) the SAVED verdict opens the interpose choice — post-verdict, success-only',
          opened?.choice?.kind === 'interpose',
          `outcome=${opened?.outcome} kind=${opened?.choice?.kind ?? null}`);
        const popup = await until(() => dialogsWith('take no damage')[0], { timeout: 6000, label: 'the interpose popup' });
        await until(() => (popup?.textContent ?? '').includes('holding a Shield'),
          { timeout: 4000, label: 'the interpose popup\'s rule line' });
        ok('I1c. (z)+(aa) the popup quotes the feat verbatim, tooltips its icon, offers Use / Take half',
          !!popup && (popup.textContent ?? '').includes('holding a Shield')
            && !!popup.querySelector('img[data-tooltip]')
            && !!popup.querySelector('button[data-action="use"]')
            && !!popup.querySelector('button[data-action="pass"]'),
          `popup=${!!popup} verbatim=${(popup?.textContent ?? '').includes('holding a Shield')} `
            + `tooltip=${!!popup?.querySelector('img[data-tooltip]')}`);
        popup?.querySelector('button[data-action="use"]')?.click();
        const applied = await until(() => card?.getFlag(MOD, 'saves')?.targets?.[0]?.applied,
          { timeout: 20000, label: 'the interposed save applied' });
        const validation = game.messages.contents.find(m => (m.timestamp >= suiteStart)
          && /takes no damage/.test(m.content ?? ''));
        ok('I1d. use — the half becomes NONE, the settle card posts, no reaction flag out of combat',
          !!applied && (victim.system.attributes.hp.value === hpBefore) && !!validation
            && !reactionChip(victim),
          `applied=${!!applied} hp ${hpBefore}→${victim.system.attributes.hp.value} card=${!!validation}`);
        await set('holdTimer', 0);
        await closeDialogs('BTB Shield Master');
      }

      /* I2 — the buzzer PASSES (a Reaction is never spent by a timer): the saved half applies. */
      {
        await set('holdTimer', 2);
        await victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max });
        const hpBefore = victim.system.attributes.hp.value;
        const card = await castAt(dexAct(), victimToken);
        const t = await until(() => {
          const x = card?.getFlag(MOD, 'saves')?.targets?.[0];
          return (x?.choice?.answer && x.applied) ? x : null;
        }, { timeout: 25000, label: 'the buzzer\'s interpose answer applied' });
        const dropped = hpBefore - victim.system.attributes.hp.value;
        ok('I2. left alone — the buzzer passes and the saved HALF (5 of 10) applies normally',
          (t?.choice?.answer === 'pass') && !!t?.choice?.timedOut && (dropped === 5),
          `answer=${t?.choice?.answer} timedOut=${!!t?.choice?.timedOut} dropped=${dropped}`);
        await set('holdTimer', 0);
        await closeDialogs('BTB Shield Master');
        await victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max });
      }

      /* I3 — a FAILED save never offers and never spends: full damage, no choice, no popup. */
      const [dexHard] = await pc.createEmbeddedDocuments('Item', [{
        name: 'BTB Test Dex Blast Hard', type: 'feat',
        system: { type: { value: 'feat' }, activities: {
          bfdexhard0000000: {
            _id: 'bfdexhard0000000', type: 'save',
            activation: { type: '', override: false },
            damage: { parts: [{ custom: { enabled: true, formula: '10' }, types: ['fire'] }], onSave: 'half' },
            save: { ability: ['dex'], dc: { calculation: '', formula: '30' } },
            target: { affects: { type: 'creature' } }
          }
        } } }]);
      {
        const before = Date.now();
        await set('holdTimer', 15);   // were a choice to open wrongly it would STAND, and be seen
        await victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max });
        const hpBefore = victim.system.attributes.hp.value;
        const act = pc.items.get(dexHard.id)?.system.activities.get('bfdexhard0000000');
        const card = await castAt(act, victimToken);
        const applied = await until(() => card?.getFlag(MOD, 'saves')?.targets?.[0]?.applied,
          { timeout: 25000, label: 'the failed save applied' });
        const t = card?.getFlag(MOD, 'saves')?.targets?.[0];
        const dropped = hpBefore - victim.system.attributes.hp.value;
        const offered = !!t?.choice || !!dialogsWith('take no damage')[0];
        const settle = game.messages.contents.find(m => (m.timestamp >= before)
          && /takes no damage|Reaction is spent/.test(m.content ?? ''));
        ok('I3. (y) the failed save: NO interpose offer, NO spend — the full 10 applies',
          !!applied && (dropped === 10) && !offered && !settle
            && !reactionChip(victim),
          `applied=${!!applied} dropped=${dropped} offered=${offered} settle=${!!settle}`);
        await set('holdTimer', 0);
        await closeDialogs('BTB Shield Master');
        await victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max });
      }
    });

    /* ==== H — the Hew reminder POPS */
    if (want('H')) await section('H', async () => {
      {
        // The bash feat and the blasts leave first (their popups would stack). ⚠ BY NAME: a
        // `--section H` run never made them.
        const inTheWay = ['BTB Shield Master', 'BTB Test Dex Blast', 'BTB Test Dex Blast Hard'];
        await pc.deleteEmbeddedDocuments('Item',
          pc.items.filter(i => inTheWay.includes(i.name)).map(i => i.id)).catch(() => {});
        const [gwm] = await pc.createEmbeddedDocuments('Item', [{
          name: 'BTB Great Weapon Master', type: 'feat', system: { type: { value: 'feat' }, identifier: 'great-weapon-master' } }]);
        await set('holdTimer', 15);   // the notice family pops only inside a live window
        await acFlat(victim, 1);
        let hew = null, dmg = null;
        for (let i = 0; i < 6 && !hew; i++) {
          await victim.update({ 'system.attributes.hp.value': 1 });
          const { msg } = await attack(pcAttackAct(), victimToken);
          // Per try (soft): a fumble rolls no damage and posts no reminder, and the loop swings again.
          dmg = await waitDamage(msg?._source.system?.origin, 10000).catch(() => null);
          if (!dmg) { log.push(`H1: attempt ${i + 1} rolled no damage (fumble) — retrying`); continue; }
          hew = await until(() => game.messages.contents.find(m => (m.timestamp >= suiteStart)
            && /Hew — .*can attack again/.test(m.content ?? '')), { timeout: 10000, label: 'the Hew reminder card' }).catch(() => null);
        }
        ok('H1. a module-applied KILL with a melee weapon posts the Hew reminder (②)',
          !!hew && (victim.system.attributes.hp.value <= 0) && (dmg?.getFlag(MOD, 'hewNoticed') === true),
          `hew=${!!hew} hp=${victim.system.attributes.hp.value} noticed=${!!dmg?.getFlag(MOD, 'hewNoticed')}`);
        const hewCount = game.messages.contents.filter(m => (m.timestamp >= suiteStart)
          && /Hew — /.test(m.content ?? '')).length;
        ok('H2. exactly ONE reminder for the swing (the crit-defers-to-kill dedupe)',
          hewCount === 1, `count=${hewCount}`);
        // Easy-to-forget things pop a notice, not just a card.
        const hewPopup = await until(() => dialogsWith('Hew —')
          .find(d => d.querySelector('button[data-action="ok"]')), { timeout: 6000, label: 'the Hew notice popup' });
        ok('H3. the reminder POPS — the OK-only notice shape on the fold\'s own namespace ((c))',
          !!hewPopup, `popup=${!!hewPopup}`);
        hewPopup?.querySelector('button[data-action="ok"]')?.click();
        // The ACK: OK resolves the pending presentation (flag recorded, no bar). The notice family
        // shares acknowledgeMoment.
        const hewAcked = await until(() => hew?.getFlag(MOD, 'hewNotice')?.acknowledged === true,
          { timeout: 5000, label: 'the Hew notice acknowledged' });
        const barOf = () => (hew ? document.querySelector(`.message[data-message-id="${hew.id}"] [data-bf-deadline]`) : null);
        // The card re-renders without its bar once the ack lands.
        await until(() => !barOf(), { timeout: 2000, label: 'the Hew card\'s bar gone' });
        const hewBar = barOf();
        ok('H4. (j) OK ACKNOWLEDGES the reminder — flag recorded, the card bar leaves',
          (hewAcked === true) && !hewBar, `acked=${hewAcked} bar=${!!hewBar}`);
        await pc.deleteEmbeddedDocuments('Item', [gwm.id]).catch(() => {});
        await victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max });
        await acFlat(victim, 25);
        await set('holdTimer', 0);
        skips.push('H — the CRIT trigger is not forced headlessly (nat-20 farming under disadvantage); it now rides the SAME damage-side chain context the kill path pins ((k): dedupe unified on the damage message)');
      }
    });

    /* ==== PS — Pole Strike's reminder (Hew's shape): after a Quarterstaff, Spear or Heavy + Reach
     * attack, an OK-only reminder of the Bonus Action swing; other weapons say nothing. */
    if (want('PS')) await section('PS', async () => {
      const phb = async (name, type) => {
        for (const pack of game.packs.filter(p => (p.metadata.packageName === 'dnd-players-handbook') && (p.documentName === 'Item'))) {
          const hit = (await pack.getIndex({ fields: ['type'] })).find(e => (e.name === name) && (e.type === type));
          if (hit) return (await pack.getDocument(hit._id)).toObject();
        }
        return null;
      };
      const feat = await phb('Polearm Master', 'feat');
      const spear = await phb('Spear', 'weapon');
      if (!feat || !spear) throw new Error('section PS: no Polearm Master or Spear in the PHB packs');
      spear.system.equipped = true;
      const lent = await pc.createEmbeddedDocuments('Item', [feat, spear]);
      try {
        await set('holdTimer', 15);
        await acFlat(victim, 1);
        await victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max });
        const spearAct = pc.items.get(lent.find(i => i.type === 'weapon').id).system.activities.find(a => a.type === 'attack');
        const pole = t => game.messages.contents.filter(m => (m.timestamp >= t) && /Pole Strike — .*can attack again/.test(m.content ?? ''));
        const t0 = Date.now();
        const { msg } = await attack(spearAct, victimToken);
        // The chain finishes first; a fumble rolls no damage, so the wait is soft.
        await waitDamage(msg?._source.system?.origin, 10000).catch(() => null);
        const card = await until(() => pole(t0)[0] ?? null, { timeout: 10000, label: 'the Pole Strike offer card' });
        const offerOf = card?.getFlag(MOD, 'hewNotice')?.offer ?? null;
        ok('PS1. an attack with a Spear, held by a Polearm Master, posts Pole Strike\'s OFFER — the rule and the other end',
          !!card && /Pole Strike\. Immediately after you take the Attack action/.test(await renderedText(card)) && /other end/.test(card.content ?? '') && !!offerOf,
          `card=${!!card} offer=${JSON.stringify(offerOf)}`);
        const popup = await until(() => dialogsWith('Pole Strike —').find(d => d.querySelector('button[data-action="use"]')),
          { timeout: 6000, label: 'the Pole Strike offer popup' });
        ok('PS2. the offer POPS with Pole Strike / Pass (the walk, 2026-09-27)', !!popup?.querySelector('button[data-action="pass"]'), `popup=${!!popup}`);
        const tUse = Date.now();
        popup?.querySelector('button[data-action="use"]')?.click();
        const swing = await until(() => game.messages.contents.find(m => (m.timestamp >= tUse) && m.rolls?.length
          && (m.getFlag(MOD, 'poleStrike') === card?.id)), { timeout: 10000, label: 'the driven Pole Strike swing' });
        const die = await until(() => game.messages.contents.find(m => (m.timestamp >= tUse) && m.getFlag(MOD, 'poleStrikeDie')),
          { timeout: 12000, label: 'the Pole Strike die' });
        const dieFlag = die?.getFlag(MOD, 'poleStrikeDie') ?? null;
        const dieTypes = [...(die?.rolls?.[0]?.options?.types ?? [])];
        ok('PS2b. Use drives the SPEAR\'s own attack at the same target; its damage is a d4 of Bludgeoning, and the card says so',
          !!swing && !!dieFlag && /d4/.test(dieFlag.now ?? '') && ((die.rolls?.[0]?.options?.type === 'bludgeoning') || dieTypes.includes('bludgeoning')),
          `swing=${!!swing} die=${JSON.stringify(dieFlag)} type=${die?.rolls?.[0]?.options?.type} types=[${dieTypes}]`);
        const hewSince = t => game.messages.contents.some(m => (m.timestamp >= t) && /Hew — /.test(m.content ?? ''));
        // The window: the driven swing posts no second offer and no Hew.
        const stray = await watch(() => (pole(t0).length > 1) || hewSince(t0), { ms: 600 });
        ok('PS3. one offer for the attack (the driven swing offers none), and no Hew beside it', !stray && (pole(t0).length === 1)
          && !hewSince(t0), `pole=${pole(t0).length} stray=${!!stray}`);
        const t1 = Date.now();
        const { msg: m2 } = await attack(pcAttackAct(), victimToken);
        // The chain finishes first; a fumble rolls no damage, so the wait is soft.
        await waitDamage(m2?._source.system?.origin, 10000).catch(() => null);
        // The window (load-bearing): time for a WRONG reminder.
        const wrong = await watch(() => pole(t1).length, { ms: 2000 });
        ok('PS4. an attack with a weapon that does not qualify says nothing', !wrong && !pole(t1).length, `pole=${pole(t1).length}`);
      } finally {
        await pc.deleteEmbeddedDocuments('Item', lent.map(i => i.id).filter(id => pc.items.get(id))).catch(() => {});
        await acFlat(victim, 25);
        await victim.update({ 'system.attributes.hp.value': victim.system.attributes.hp.max });
        await set('holdTimer', 0);
      }
    });

    /* ==== Q — the cascade is a staircase queue: common anchor, one header-height step per slot,
     * slots reused as they free; the FIRST moment's popup stays in front. */
    if (want('Q')) await section('Q', async () => {
      {
        const uiMod = await import('/modules/fvtt-mod-bythebooks/scripts/ui.js');
        const anyMsg = game.messages.contents.at(-1);
        const mk = title => new foundry.applications.api.DialogV2({
          window: { title }, position: { width: 300 },
          content: '<p>cascade probe</p>',
          buttons: [{ action: 'ok', label: 'OK', default: true, callback: () => {} }],
          rejectClose: false
        });
        const zOf = d => Number(d.position?.zIndex ?? d.element?.style?.zIndex ?? 0);
        const d1 = mk('BTB Cascade First');
        const d2 = mk('BTB Cascade Second');
        // openManagedPopup resolves after the render, the staircase position and the fronting.
        await uiMod.openManagedPopup('bf-cascade-1', anyMsg, d1);
        await uiMod.openManagedPopup('bf-cascade-2', anyMsg, d2);
        await until(() => d1.rendered && d2.rendered, { label: 'the two cascade popups rendered' });
        const p1 = { left: d1.position.left, top: d1.position.top };
        const step = { left: d2.position.left - p1.left, top: d2.position.top - p1.top };
        ok('Q1. (s) the second popup steps down-right one header from the first',
          (step.left === 36) && (step.top === 36), `step=${JSON.stringify(step)}`);
        ok('Q2. (s) event order IS z-order — the first moment stays in front',
          zOf(d1) > zOf(d2), `z1=${zOf(d1)} z2=${zOf(d2)}`);
        // The managed close frees the slot before the window's own close runs.
        await d1.close();
        await until(() => !d1.rendered, { label: 'the first cascade popup closed' });
        const d3 = mk('BTB Cascade Third');
        await uiMod.openManagedPopup('bf-cascade-3', anyMsg, d3);
        await until(() => d3.rendered, { label: 'the third cascade popup rendered' });
        ok('Q3. (s) a freed slot is reused — the third lands on the anchor, never on the survivor',
          (d3.position.left === p1.left) && (d3.position.top === p1.top),
          `third=${JSON.stringify({ left: d3.position.left, top: d3.position.top })} anchor=${JSON.stringify(p1)}`);
        await d2.close(); await d3.close();
        await until(() => !d2.rendered && !d3.rendered, { label: 'the cascade popups closed' });
        // THE RANK: the mastery fronts the bash offer though it arrives second; the unranked go
        // behind both. Real subs, through the real popups' opener.
        const dBash = mk('BTB Rank Bash');
        const dMast = mk('BTB Rank Mastery');
        const dHold = mk('BTB Rank Hold');
        await uiMod.openManagedPopup(`${anyMsg.id}|bashoffer`, anyMsg, dBash);
        await uiMod.openManagedPopup(`${anyMsg.id}|mastery`, anyMsg, dMast);
        await until(() => dBash.rendered && dMast.rendered, { label: 'the ranked popups rendered' });
        ok('Q4. the RANK — the mastery arrives second and still fronts the bash offer',
          zOf(dMast) > zOf(dBash), `mastery=${zOf(dMast)} bash=${zOf(dBash)}`);
        await uiMod.openManagedPopup(`${anyMsg.id}|hold`, anyMsg, dHold);
        await until(() => dHold.rendered, { label: 'the unranked popup rendered' });
        ok('Q5. an unranked newcomer goes to the back — mastery, then the offer, then the rest',
          (zOf(dMast) > zOf(dBash)) && (zOf(dBash) > zOf(dHold)),
          `mastery=${zOf(dMast)} bash=${zOf(dBash)} hold=${zOf(dHold)}`);
        await dBash.close(); await dMast.close(); await dHold.close();
        await until(() => ![dBash, dMast, dHold].some(d => d.rendered), { label: 'the ranked popups closed' });
      }
    });

    return { log, results, skips, consoleErrors };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips, consoleErrors };
  } finally {
    console.error = origConsoleError;
    await teardown();
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: 'maneuvers', out, plan, f });
