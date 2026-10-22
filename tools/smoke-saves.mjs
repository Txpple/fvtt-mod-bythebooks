// By the Books smoke test: saving throws end to end in the live world (demand stamp, forced
// verdicts via ±30 bonuses, effects, half-on-save in both arrival orders, the dialog, the buzzer,
// legendary resistance, areas and their sweeps, the save gate, the save facets).
// Harness discipline: settings restored, this run's messages deleted, fixtures long-rested,
// new messages found by ID-SET difference, HP reset before every damage assertion.
// Sections: `--section 8`, `--section 12,13`, `--list` (ARCHITECTURE §11 *Adding a TEST* rule 2).
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from './harness.mjs';

// The coverage map (tools/coverage-map.mjs parses this; `npm run coverage` checks it both ways).
// ⚠ NEVER import a suite: it connects on evaluation.
export const COVERS = [
  'saves/index.js',         // the save machine end to end — every part
  'saves/demand.js',
  'saves/areas.js',
  'saves/ask.js',
  'saves/verdict.js',
  'saves/consequences.js',
  'saves/choices.js',
  'saves/views.js',
  'receipts.js',            // §6 — legendary resistance unwinds the receipts (revertTarget)
  'reminders.js'            // §19 / §22 / §23 / §31 — the save gate (§31: Magic Resistance, Greater Magic Resistance; Avoidance on the verdict)
];

const SECTIONS = {
  1: 'the stamp + two forced verdicts + effects',
  2: 'damage AFTER verdicts: full vs half',
  3: 'damage BEFORE the verdict + the popup path',
  4: 'a bare sheet roll is the answer',
  5: 'the buzzer ROLLS — straight and marked',
  6: 'legendary resistance overturns the verdict',
  7: 'the exclusions',
  8: 'templates: containment IS the target set',
  9: 'rider damage (onSave "full") + per-row bars',
  10: 'the waiting demand (v1.12.0, findings ②+③)',
  11: 'the GM popup routing (finding ④ + (h))',
  12: 'spell-truth geometry (v1.13.0 walk finding ①)',
  13: 'the spent sweep converges (finding ②)',
  14: 'the duration sweep (2026-08-18 finding ①)',
  15: 'NO verdict lines (2026-09-18: v1.19.0\'s public cards retired — the usage card carries every verdict); the LR flip corrects the card',
  16: 'the DEAD-TARGET gate (v1.19.0, user call)',
  17: 'the BASH shape (v1.19.0, FLOW item 5)',
  18: 'the player-rolled damage offer on the SAVE path (was probe-save-damage-popup)',
  19: 'the save gate (option E, 2026-09-02): the system dialog, the section, the default, Fails',
  20: 'a save press (SAVE_PRESSES): Web ships no effect — a failure presses Restrained, receipted, with a revert',
  23: 'the effect table\'s SAVES facet (2026-09-05): Aura of Purity counts Advantage against a demand imposing one of its conditions; Circle\'s Power against a spell, and a success takes NONE instead of half',
  21: 'Evasion: a Dexterity save for half — none on a success, half on a failure, said on the row and the receipt',
  22: 'the save gate says WHY when the PLATFORM bends the save (2026-09-04): an item effect on the sheet is a box',
  24: 'the chained roll\'s SUMMARY (the 6.0 pass, phase 4): the roll\'s card hidden, the gate\'s record inside the usage card, the nudge, summaries off; the verdict written into the platform\'s row, the line only where no row (2026-09-18)',
  25: 'a used-up item\'s failed save (2026-09-22): the vial is gone before its card exists, and its effect still lands — read off the card',
  26: 'a FEATURE row\'s saves facet (Slice A, 2026-09-24): Brave, a text-only trait on the sheet, counts Advantage against a demand that would frighten, and nothing against one that would poison',
  28: 'Trance (the Elf, 2026-09-27): against a SPELL whose failed-save effect puts the target to sleep ("Asleep"), a text-only Trance on the sheet says the save cannot fail — Net Succeeds, a Succeeds button the default; pressed, the verdict is SAVED with no die ("cannot fail (Trance)"), the sleep never lands; against a demand that does not sleep, Trance is nowhere in the section',
  29: 'Command (the spells slice, 2026-09-28): a failed save behind a press with a WORD asks the caster — Approach / Flee / Grovel / Halt; Grovel presses Prone (receipted, the announce card says who falls); Halt presses nothing and the card says the table moves the token',
  30: 'the saves facet\'s two new effect rows (the spells slice, 2026-09-28): Poison Protection counts Advantage against a demand that would poison; Irresistible Dance counts Disadvantage against a DEXTERITY demand (the `abilities` scope) and nothing against a Wisdom one',
  27: 'Guarded Mind (the PHB feats, group 4, 2026-09-27): a failed demanded Wisdom save is withheld and offered the `succeed` fold; pressed, the use is spent and the verdict is SAVED (half damage, no fail-only effect); spent, not offered; a Constitution save never',
  31: 'THE GM\'S SIDE (2026-09-28): Magic Resistance, text-only on the sheet, counts Advantage against a spell\'s demand; Greater Magic Resistance says the save cannot fail (a Succeeds button, the default — SAVED with no die); Avoidance on a CONSTITUTION save takes none on a success and half on a failure, the row and the receipt naming Avoidance',
  32: 'THE PHB CLASSES — B2 (2026-09-30): the save bends by name — Psychic Defenses (Brave\'s shape) counts Advantage against a frightening demand; Magical Ambush on the CASTER, Invisible as it casts, counts Disadvantage (the demand\'s caster snapshot) and nothing when visible; Struck by the caster counts Disadvantage against its spell and the save SPENDS it; Hexed Dexterity by a warlock holding Eldritch Hex counts Disadvantage on a Dexterity demand and nothing on a Wisdom one; Mantle of Majesty (the bard\'s Unearthly Appearance) makes a Command at a creature Charmed by the bard FAIL (the Fails button the default, the entry autoFailed), and a Charmed by someone else lists nothing'
};
// §2 rolls §1's demand damage (`card1`); §13 rides §12's lifecycle (`card12`, its area, its scene).
const DEPENDS = { 2: ['1'], 13: ['12'] };

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
// §18 waits out two real buzzer windows on top of §§1-17.
const f = await connectSuite({ tag: 'saves', watchdogMs: 900_000 });
announcePlan('saves', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, watch, tokenOn, viewScene, snapshotSettings } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  // The section gate (tools/harness.mjs): the plan arrives as DATA in this serialized closure.
  // Every moment payload published during the run, so a section can assert its resolve was heard.
  const moments = [];
  const momentHookId = Hooks.on('bythebooks.moment', p => moments.push(p));
  const momentsOf = (event, since = 0) => moments.filter(p => (p.event === event) && (p.at >= since));
  const plain = p => { try { return JSON.stringify(p) === JSON.stringify(JSON.parse(JSON.stringify(p))); } catch { return false; } };
  const suiteStart = Date.now();

  const mod = game.modules.get(MOD);
  if (!mod?.active) return { fatal: `module active=${mod?.active}` };
  if (!game.settings.settings.has(`${MOD}.saves`)) {
    return { fatal: 'setting saves not registered — this client is running OLD code (F5)' };
  }

  const SETTING_KEYS = ['saves', 'saveTimer', 'autoDamage', 'autoApply',
    'dramaticBeat', 'requireTarget', 'reactionHold',
    'riders', 'effectRiders', 'masteryRiders', 'concMode', 'castApply', 'd20FoldAsk', 'd20Folds'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { set } = settings;

  const scene = game.scenes.getName('By the Books Test Range');
  const victim = game.actors.getName('BTB Test Victim');
  const shielder = game.actors.getName('BTB Test Shielder');
  const npc = game.actors.getName('BTB Test Attacker');
  if (!scene || !victim || !npc || !shielder) return { fatal: 'missing fixture: scene or BTB Test actors' };

  const CHIP_NAMES = ['BTB Poisoned', 'BTB Splashed', 'BTB Vial Poisoned'];
  const created = { items: [], tokens: [], templates: [] };   // templates: the REGION ids this suite placed (dnd5e 6.0 areas are Regions)
  // An area as dnd5e's TemplatePlacement writes it: a Region (radius in PIXELS), the activity on `flags.dnd5e.activity`.
  const px = scene.grid.size / scene.grid.distance;
  const circleArea = (x, y, ft, flags = {}) => scene.createEmbeddedDocuments('Region', [{
    name: 'BTB test area', shapes: [{ type: 'circle', x, y, radius: ft * px }], flags
  }]);
  const areaFor = activityUuid => ({ dnd5e: { activity: activityUuid } });
  const priorActor = {};
  let shimScene = null; // §12's own 140px scene — deleted whole in teardown
  let restored = false;
  const clearChips = async () => {
    for (const a of [victim, shielder, game.actors.getName('BTB Test Rogue')].filter(Boolean)) {
      const strays = a.effects.filter(e => CHIP_NAMES.includes(e.name));
      if (strays.length) await a.deleteEmbeddedDocuments('ActiveEffect', strays.map(e => e.id));
    }
  };
  const teardown = async () => {
    if (restored) return;
    restored = true;
    // ⚠ Settings restore first, in its own guard: a later cleanup error must never leave suite settings on the table.
    for (const failed of await settings.restore()) log.push(`TEARDOWN settings ERROR: ${failed}`);
    try {
      await clearChips();
      // §19 presses statuses on the victim; a dead run must not leave it Paralyzed (NOTES §5).
      const pressed = victim.effects.filter(e => ['restrained', 'paralyzed'].some(s => e.statuses?.has?.(s)));
      if (pressed.length) await victim.deleteEmbeddedDocuments('ActiveEffect', pressed.map(e => e.id));
      for (const [actorId, ids] of Object.entries(created.items.reduce((m, i) => {
        (m[i.actorId] ??= []).push(i.id); return m;
      }, {}))) {
        const a = game.actors.get(actorId);
        const live = ids.filter(id => a?.items.get(id));
        if (live.length) await a.deleteEmbeddedDocuments('Item', live);
      }
      const liveTokens = created.tokens.filter(id => scene.tokens.get(id));
      if (liveTokens.length) await scene.deleteEmbeddedDocuments('Token', liveTokens);
      const liveTemplates = created.templates.filter(id => scene.regions.get(id));
      if (liveTemplates.length) await scene.deleteEmbeddedDocuments('Region', liveTemplates);
      if (shimScene && game.scenes.get(shimScene.id)) await shimScene.delete();
      for (const [actorId, data] of Object.entries(priorActor)) {
        await game.actors.get(actorId)?.update(data);
      }
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
    await set('saves', true);
    await set('saveTimer', 0);
    await set('autoApply', true);        // the damage half of the machine is under test
    await set('autoDamage', 'off');      // no attacks in this suite
    await set('dramaticBeat', 0);
    await set('requireTarget', false);
    await set('reactionHold', false);
    await set('riders', false);
    await set('effectRiders', false);
    await set('masteryRiders', false);
    await set('concMode', 'off');        // its bare-save recognizer must never be in play
    await set('castApply', false);       // the save machine stands alone
    // -------------------------------------------------- fixtures
    await viewScene(scene);
    // ⚠ Sweep stale victim/shielder tokens first: getSpeaker resolves through the actor's OLDEST
    // token on the scene, and a stale unlinked one gives §4's sheet roll a uuid the fold cannot match.
    const pcActor = game.actors.getName('BTB Test PC Attacker'); // §11's player-owned fixture
    const stale = scene.tokens.filter(t =>
      [victim.id, shielder.id, ...(pcActor ? [pcActor.id] : [])].includes(t.actorId)).map(t => t.id);
    if (stale.length) await scene.deleteEmbeddedDocuments('Token', stale);
    const mkToken = async (actor, x) => {
      const [doc] = await scene.createEmbeddedDocuments('Token', [
        foundry.utils.mergeObject(actor.prototypeToken.toObject(),
          { x, y: 1400, actorId: actor.id, actorLink: true }, { inplace: false })]);
      created.tokens.push(doc.id);
      await tokenOn(doc.id);
      return canvas.tokens.get(doc.id);
    };
    const victimToken = await mkToken(victim, 1000);
    const shielderToken = await mkToken(shielder, 1200);
    if (!victimToken || !shielderToken) return { fatal: 'target tokens never reached the canvas' };

    for (const a of [victim, shielder]) {
      priorActor[a.id] = {
        'system.attributes.hp.value': a.system._source.attributes.hp.value,
        'system.abilities.con.save.roll.bonus': a.system._source.abilities?.con?.save?.roll?.bonus ?? '',
        'system.abilities.wis.save.roll.bonus': a.system._source.abilities?.wis?.save?.roll?.bonus ?? '',
      };
    }
    priorActor[victim.id]['system.resources.legres.max'] =
      victim.system._source.resources?.legres?.max ?? 0;
    priorActor[victim.id]['system.resources.legres.spent'] =
      victim.system._source.resources?.legres?.spent ?? 0;

    const saveBonus = (a, v) => a.update({ 'system.abilities.con.save.roll.bonus': v });
    // ⚠ Healing also clears the dead STATUS: `isDeadForSaves` reads it, and an ActiveEffect
    // survives an hp restore and survives across runs (NOTES §5).
    const healFull = async a => {
      await a.update({ 'system.attributes.hp.value': a.system.attributes.hp.max });
      // Delete by id, never toggleStatusEffect (the toggle can throw on a fixed-id effect racing its removal).
      const down = a.effects.filter(e =>
        ['dead', 'unconscious'].some(s => e.statuses?.has?.(s)));
      if ( down.length ) {
        await a.deleteEmbeddedDocuments('ActiveEffect', down.map(e => e.id)).catch(() => {});
      }
      return a.system.attributes.hp.max;
    };

    // The fixture: an innate save spell, flat 10 damage (half is exactly 5), a formula DC, and two
    // effects: one fail-only, one marked onSave (the system stores that flag; nothing native reads it).
    const EFF_FAIL = 'bfsavefail000000';
    const EFF_ALWAYS = 'bfsavealways0000';
    const [poisonItem] = await npc.createEmbeddedDocuments('Item', [{
      name: 'BTB Test Poison Burst', type: 'spell',
      system: {
        level: 1, school: 'evo', properties: ['vocal'],
        duration: { units: 'inst' },   // §8's spent-template rule reads this off the stamp
        target: { affects: { type: 'creature', count: '2', choice: false } },
        range: { value: '60', units: 'ft' },
        method: 'spell', prepared: 1, identifier: 'bf-test-poison-burst',
        activities: {
          bfsaveact0000000: {
            _id: 'bfsaveact0000000', type: 'save',
            activation: { type: 'action', override: false },
            consumption: { targets: [], spellSlot: false },
            damage: { onSave: 'half', parts: [{ custom: { enabled: true, formula: '10' }, types: ['poison'] }] },
            effects: [{ _id: EFF_FAIL, onSave: false }, { _id: EFF_ALWAYS, onSave: true }],
            save: { ability: ['con'], dc: { calculation: '', formula: '15' } },
            target: { override: false, prompt: true }
          },
          // §19: a Dexterity save, the ability Restrained bends and Paralyzed fails outright.
          bfsavedex0000000: {
            _id: 'bfsavedex0000000', type: 'save',
            activation: { type: 'action', override: false },
            consumption: { targets: [], spellSlot: false },
            damage: { onSave: 'half', parts: [{ custom: { enabled: true, formula: '10' }, types: ['poison'] }] },
            effects: [{ _id: EFF_FAIL, onSave: false }, { _id: EFF_ALWAYS, onSave: true }],
            save: { ability: ['dex'], dc: { calculation: '', formula: '15' } },
            target: { override: false, prompt: true }
          },
          // §27: a Wisdom save (Guarded Mind reaches Int, Wis and Cha saves only).
          bfsavewis0000000: {
            _id: 'bfsavewis0000000', type: 'save',
            activation: { type: 'action', override: false },
            consumption: { targets: [], spellSlot: false },
            damage: { onSave: 'half', parts: [{ custom: { enabled: true, formula: '10' }, types: ['poison'] }] },
            effects: [{ _id: EFF_FAIL, onSave: false }, { _id: EFF_ALWAYS, onSave: true }],
            save: { ability: ['wis'], dc: { calculation: '', formula: '15' } },
            target: { override: false, prompt: true }
          },
          bfsaveself000000: {
            _id: 'bfsaveself000000', type: 'save',
            activation: { type: 'action', override: false },
            consumption: { targets: [], spellSlot: false },
            damage: { onSave: 'half', parts: [{ custom: { enabled: true, formula: '10' }, types: ['poison'] }] },
            effects: [],
            save: { ability: ['con'], dc: { calculation: '', formula: '15' } },
            target: { override: true, affects: { type: 'self' }, prompt: false }
          },
          // §9: Web's burn clause, damage on the save activity with onSave "full" (rider damage, not the save's consequence).
          bfsavefull000000: {
            _id: 'bfsavefull000000', type: 'save',
            activation: { type: 'action', override: false },
            consumption: { targets: [], spellSlot: false },
            damage: { onSave: 'full', parts: [{ custom: { enabled: true, formula: '10' }, types: ['fire'] }] },
            effects: [],
            save: { ability: ['con'], dc: { calculation: '', formula: '15' } },
            target: { override: false, prompt: true }
          },
          // §10: Web's template flow, a CUBE save activity cast bare, the area placed after as an
          // origin-less rect (the toolbar draw). The harness passes create.measuredTemplate false:
          // a real drawPreview never resolves headless.
          bfsavetmpl000000: {
            _id: 'bfsavetmpl000000', type: 'save',
            activation: { type: 'action', override: false },
            consumption: { targets: [], spellSlot: false },
            damage: { onSave: 'half', parts: [{ custom: { enabled: true, formula: '10' }, types: ['poison'] }] },
            effects: [],
            save: { ability: ['con'], dc: { calculation: '', formula: '15' } },
            target: { override: true, prompt: true,
              template: { type: 'cube', size: '10', units: 'ft', count: '' },
              affects: { type: 'creature', count: '', choice: false } }
          }
        }
      },
      effects: [
        { _id: EFF_FAIL, name: 'BTB Poisoned', transfer: false, disabled: false,
          img: 'icons/svg/poison.svg', duration: { seconds: 60 },
          description: '<p>Poisoned (BTB test fixture — fail only).</p>' },
        { _id: EFF_ALWAYS, name: 'BTB Splashed', transfer: false, disabled: false,
          img: 'icons/svg/acid.svg', duration: { seconds: 60 },
          description: '<p>Splashed (BTB test fixture — applies even on save).</p>' }
      ]
    }]);
    created.items.push({ actorId: npc.id, id: poisonItem.id });

    const saveActivity = () => npc.items.get(poisonItem.id).system.activities.get('bfsaveact0000000');
    const selfActivity = () => npc.items.get(poisonItem.id).system.activities.get('bfsaveself000000');
    const dexActivity = () => npc.items.get(poisonItem.id).system.activities.get('bfsavedex0000000');
    const wisActivity = () => npc.items.get(poisonItem.id).system.activities.get('bfsavewis0000000');
    const fullActivity = () => npc.items.get(poisonItem.id).system.activities.get('bfsavefull000000');
    const tmplActivity = () => npc.items.get(poisonItem.id).system.activities.get('bfsavetmpl000000');
    const target = (...tokens) => {
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      tokens.forEach((t, i) => { t.setTarget(true, { releaseOthers: i === 0 }); });
    };
    const snap = () => new Set(game.messages.contents.map(m => m.id));
    const fresh = before => game.messages.contents.filter(m => !before.has(m.id));
    // No save dialog left in the page, a closing one included: its element leaves at the close's end.
    const saveDialogsGone = () => !document.querySelector('[data-bf-save-demand]');
    // Every target's consequence pass ran to its end, or stands held on a choice (Command's word).
    const passSettled = card => (card?.getFlag(MOD, 'saves')?.targets ?? []).every(t => t.applied || t.choice);
    const usageCards = msgs => msgs.filter(m =>
      (m.type === 'usage'));
    const chipOn = (a, name) => a.effects.find(e => e.name === name);
    // The ask is the system's Saving Throw dialog, found by the application registry and our fieldset.
    const savePopups = () => [...foundry.applications.instances.values()]
      .filter(app => app.rendered && app.element?.querySelector?.('[data-bf-save-demand]'))
      .map(app => app.element);
    // Who a dialog asks, read off OUR fieldset: the dialog's own target block names the client's current targets.
    const demandText = el => el?.querySelector?.('[data-bf-save-demand]')?.textContent ?? '';
    const entryOf = (card, a) => card.getFlag(MOD, 'saves')?.targets?.find(t => t.uuid === a.uuid);
    const rollDamageChained = card => saveActivity().rollDamage({}, { configure: false },
      { data: { 'system.origin': card.id } });

    // ============================================== 1. the stamp + two forced verdicts + effects
    let card1;
    if (want(1)) await section(1, async () => {
      await saveBonus(victim, '-30');            // forced failure vs DC 15
      await saveBonus(shielder, '+30');          // forced success vs DC 15
      await healFull(victim);
      await healFull(shielder);
      target(victimToken, shielderToken);
      const before = snap();
      const use = await saveActivity().use({}, { configure: false }, {});
      if (use === undefined) throw new Error('the save fixture cast was refused');
      card1 = use?.message instanceof ChatMessage ? use.message : null;
      if (!card1) throw new Error('the save cast produced no usage card');
      await until(() => card1.getFlag(MOD, 'saves'), { timeout: 15000, label: '§1 the demand stamped' });

      // The machine rolled the card's damage at the stamp. §2 owns late-arrival ordering, so the
      // auto roll is asserted and then deleted to keep that ordering constructible.
      // Soft: 1a2 reports a missing roll and the delete below is guarded on it.
      const autoDmg = await until(() => fresh(before).find(m =>
        (m.type === 'damage')
        && (m._source.system?.origin === card1.id)), { timeout: 15000, label: '1a2 the stamp\'s damage roll' }).catch(() => null);
      ok('1a2. the demand rolls its own damage at the stamp (the hidden-buttons companion)',
        !!autoDmg && (autoDmg.system?.onSave === 'half'),
        `auto=${!!autoDmg} onSave=${autoDmg?.system?.onSave}`);

      // The platform's own button list is non-empty (guards a vacuous pass); the card keeps none of it.
      const platformBtns = saveActivity()._usageChatButtons({ hasConsumption: false }).map(b => b.action);
      const dataBtns = (card1.system?.buttons ?? []).map(b => b.action);
      const cardEl = ui.chat.element.querySelector(`.message[data-message-id="${card1.id}"]`);
      const drawnBtns = [...(cardEl?.querySelectorAll('.icon-row button[data-action]') ?? [])].map(b => b.dataset.action);
      ok('1a3. the card\'s action buttons are dropped from its DATA — the machine owns the workflow; Refund Resource is the only one that may stay',
        platformBtns.includes('rollSave') && platformBtns.includes('rollDamage')
          && dataBtns.every(a => a === 'refundResource') && drawnBtns.every(a => a === 'refundResource'),
        `platform=[${platformBtns.join()}] data=[${dataBtns.join()}] drawn=[${drawnBtns.join()}]`);
      if (autoDmg) await ChatMessage.deleteDocuments([autoDmg.id]);

      // Both targets answer through the popup; different actors, so both offer at once.
      // Soft per try: the loop breaks on a missing popup and the settle below is the verdict.
      for (let i = 0; i < 2; i++) {
        const popup = await until(() => savePopups()[0], { timeout: 8000 }).catch(() => null);
        if (!popup) break;
        [...popup.querySelectorAll('footer button, .form-footer button, nav.dialog-buttons button')]
          .find(b => b.textContent.trim() === 'Normal')?.click();
        await until(() => !document.contains(popup), { timeout: 8000 }).catch(() => null);
      }
      await until(() => {
        const f2 = card1.getFlag(MOD, 'saves');
        return f2?.targets.every(t => t.done && t.applied);
      }, { timeout: 15000, label: '§1 both verdicts landed and applied' });
      const flag = card1.getFlag(MOD, 'saves');
      ok('1a. the save card posts and carries the demand stamp',
        (usageCards(fresh(before)).length === 1) && !!flag
          && (flag.dc === 15) && (flag.abilities?.join() === 'con')
          && (flag.damageOnSave === 'half') && (flag.hasDamage === true)
          && (flag.targets?.length === 2)
          && (flag.effectNames?.fail?.join() === 'BTB Poisoned')
          && (flag.effectNames?.always?.join() === 'BTB Splashed'),
        `card=${usageCards(fresh(before)).length} dc=${flag?.dc} abilities=${flag?.abilities?.join()} `
          + `onSave=${flag?.damageOnSave} targets=${flag?.targets?.length}`);

      const ev = entryOf(card1, victim);
      const es = entryOf(card1, shielder);
      ok('1b. forced verdicts fold per target: the -30 fails, the +30 saves',
        (ev?.outcome === 'failed') && (es?.outcome === 'saved') && ev?.done && es?.done,
        `victim=${ev?.outcome} shielder=${es?.outcome}`);
      // Each verdict landing publishes `save` through the gate: marker = the target's uuid.
      const sv = momentsOf('save').filter(p => p.messageId === card1.id);
      const svV = sv.find(p => p.actorUuid === victim.uuid), svS = sv.find(p => p.actorUuid === shielder.uuid);
      ok('1z. the verdicts were PUBLISHED through the gate: bythebooks.moment "save" (kind saves) once per target — the victim failed, the shielder saved, the DC and the caster on each; plain and frozen',
        (sv.length === 2) && !!svV && !!svS && (svV.kind === 'saves') && (svV.marker === victim.uuid) && (svV.details?.outcome === 'failed') && (svS.details?.outcome === 'saved')
          && (svV.details?.dc === 15) && (svV.details?.casterUuid === flag?.sourceUuid) && (svV.ability === flag?.item?.name) && Object.isFrozen(svV) && plain(svV) && plain(svS),
        `saves=${JSON.stringify(sv.map(p => ({ actor: p.actorUuid, marker: p.marker, outcome: p.details?.outcome, ability: p.ability })))}`);

      const rollV = ev?.rollMessageId ? game.messages.get(ev.rollMessageId) : null;
      ok('1c. the roll chains to the card, answers by the exact channel, and carries the DC',
        (rollV?._source.system?.origin === card1.id)
          && (rollV?.getFlag(MOD, 'respondsTo') === card1.id)
          && (rollV?.getFlag(MOD, 'saveFor') === victim.uuid)
          && (rollV?.rolls?.[0]?.options?.target === 15),
        `origin=${rollV?._source.system?.origin} target=${rollV?.rolls?.[0]?.options?.target}`);

      const receipt = card1.getFlag(MOD, 'effectReceipt');
      const evR = receipt?.targets?.find(t => t.uuid === victim.uuid);
      const esR = receipt?.targets?.find(t => t.uuid === shielder.uuid);
      ok('1d. a failure takes BOTH effects, a success only the onSave one',
        !!chipOn(victim, 'BTB Poisoned') && !!chipOn(victim, 'BTB Splashed')
          && !chipOn(shielder, 'BTB Poisoned') && !!chipOn(shielder, 'BTB Splashed')
          && (evR?.effects?.length === 2) && (esR?.effects?.length === 1),
        `victim chips=[${CHIP_NAMES.map(n => !!chipOn(victim, n)).join()}] `
          + `shielder chips=[${CHIP_NAMES.map(n => !!chipOn(shielder, n)).join()}] `
          + `receipts v=${evR?.effects?.length} s=${esR?.effects?.length}`);
    });

    // ============================================== 2. damage AFTER verdicts: full vs half
    if (want(2)) await section(2, async () => {
      const vMax = victim.system.attributes.hp.max;
      const sMax = shielder.system.attributes.hp.max;
      const before = snap();
      await rollDamageChained(card1);
      const dmg = await until(() => fresh(before).find(m =>
        (m.type === 'damage')
        && (m.getFlag(MOD, 'receipt')?.targets?.length === 2)), { timeout: 15000 });
      const rv = dmg?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === victim.uuid);
      const rs = dmg?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === shielder.uuid);
      ok('2a. the failed target takes the flat 10 in full; the saved target takes exactly half',
        (dmg?.system?.onSave === 'half')
          && (rv?.taken === 10) && !rv?.multiplier
          && (rs?.taken === 5) && (rs?.multiplier === 0.5)
          && (rs?.note === 'saved — half damage'),
        `onSave=${dmg?.system?.onSave} v.taken=${rv?.taken} `
          + `s.taken=${rs?.taken} s.mult=${rs?.multiplier} s.note=${rs?.note}`);
      ok('2b. the pools moved by exactly those numbers',
        (victim.system.attributes.hp.value === vMax - 10)
          && (shielder.system.attributes.hp.value === sMax - 5),
        `victim ${vMax}→${victim.system.attributes.hp.value} shielder ${sMax}→${shielder.system.attributes.hp.value}`);
    });

    // ============================================== 3. damage BEFORE the verdict + the popup path
    if (want(3)) await section(3, async () => {
      await clearChips();
      await saveBonus(victim, '');               // neutral: the popup's own +30 must be the reason
      const vMax = await healFull(victim);
      target(victimToken);
      const before = snap();
      const use = await saveActivity().use({}, { configure: false }, {});
      const card = use?.message instanceof ChatMessage ? use.message : null;
      if (!card) throw new Error('section 3 cast produced no card');
      await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000 });
      // The stamp's own auto-roll is the early damage.
      const dmg = await until(() => fresh(before).find(m => m.type === 'damage'), { timeout: 15000, label: '3a the stamp\'s damage roll' });
      // The window: a pending target's damage must not apply while the verdict waits.
      const early3 = await watch(() => dmg.getFlag(MOD, 'receipt') || (victim.system.attributes.hp.value !== vMax), { ms: 1800 });
      ok('3a. a pending target\'s damage WAITS — per-target independence, nothing applied',
        !!dmg && !early3 && !dmg.getFlag(MOD, 'receipt')
          && (victim.system.attributes.hp.value === vMax),
        `receipt=${!!dmg?.getFlag(MOD, 'receipt')} hp=${victim.system.attributes.hp.value}/${vMax} early=${!!early3}`);

      // Soft: the buttons below are read off a missing popup as none, and 3b says so.
      const popup = await until(() => savePopups()[0], { timeout: 6000 }).catch(() => null);
      const buttons = popup ? [...popup.querySelectorAll('footer button, .form-footer button, nav.dialog-buttons button')] : [];
      const labels = buttons.map(b => b.textContent.trim());
      // The ask is the system's Saving Throw dialog plus By the Books' demand fieldset.
      ok('3b. the demand opens the SYSTEM dialog: its own Adv/Normal/Dis, its situational bonus, its roll mode — and our demand fieldset',
        (labels.join('/') === 'Advantage/Normal/Disadvantage')
          && !!popup?.querySelector('input[name="roll.0.situational"]')
          && !!popup?.querySelector('select[name="rollMode"]')
          && !!popup?.querySelector('[data-bf-save-demand]'),
        `buttons=[${labels.join('|')}] input=${!!popup?.querySelector('input[name="roll.0.situational"]')} demand=${!!popup?.querySelector('[data-bf-save-demand]')}`);
      // The demand stores the TOKEN's name (the fixture's prototype token is "Hobgoblin").
      const rollerName = card.getFlag(MOD, 'saves')?.targets?.[0]?.name ?? 'BTB Test Victim';
      ok('3b2. the demand fieldset leads with WHO is rolling — the creature owns the title',
        ((popup?.querySelector('[data-bf-save-demand]')?.textContent ?? '').includes(rollerName)),
        `demand="${popup?.querySelector('[data-bf-save-demand]')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120)}" expected="${rollerName}"`);

      // The dialog rebuilds its rolls on CHANGE, so a programmatic value must dispatch one; the
      // submit rebuilds them again from the form itself, so the click needs no wait.
      const input = popup?.querySelector('input[name="roll.0.situational"]');
      if (input) { input.value = '+30'; input.dispatchEvent(new Event('change', { bubbles: true })); }
      buttons.find(b => b.textContent.trim() === 'Advantage')?.click();
      await until(() => entryOf(card, victim)?.done, { timeout: 15000, label: '3c the verdict landed' });
      const entry = entryOf(card, victim);
      const roll = entry?.rollMessageId ? game.messages.get(entry.rollMessageId) : null;
      ok('3c. the bonus reaches the formula, Advantage reaches the d20, the verdict is saved',
        (entry?.outcome === 'saved') && /30/.test(roll?.rolls?.[0]?.formula ?? '')
          && (roll?.rolls?.[0]?.options?.advantageMode === 1),
        `outcome=${entry?.outcome} advMode=${roll?.rolls?.[0]?.options?.advantageMode} formula=${roll?.rolls?.[0]?.formula}`);

      const applied = await until(() => dmg.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === victim.uuid), { timeout: 15000, label: '3d the waiting damage receipted' });
      ok('3d. the waiting damage applies once the verdict pass completes — at half, chips first',
        (applied?.taken === 5) && (applied?.multiplier === 0.5)
          && (victim.system.attributes.hp.value === vMax - 5)
          && !chipOn(victim, 'BTB Poisoned') && !!chipOn(victim, 'BTB Splashed'),
        `taken=${applied?.taken} mult=${applied?.multiplier} hp=${victim.system.attributes.hp.value}/${vMax} `
          + `chips=[${CHIP_NAMES.map(n => !!chipOn(victim, n)).join()}]`);

      await until(() => savePopups().length === 0, { timeout: 5000, label: '3e the answered popup closed' });
      ok('3e. the answered popup closed itself', savePopups().length === 0,
        `popups=${savePopups().length}`);
    });

    // ============================================== 4. a bare sheet roll is the answer
    if (want(4)) await section(4, async () => {
      await clearChips();
      await saveBonus(victim, '-30');
      await healFull(victim);
      target(victimToken);
      const use = await saveActivity().use({}, { configure: false }, {});
      const card = use?.message instanceof ChatMessage ? use.message : null;
      if (!card) throw new Error('section 4 cast produced no card');
      await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '§4 the demand stamped' });
      // Let the popup offer itself — the roll below must beat it, not race it.
      await until(() => savePopups()[0], { timeout: 6000, label: '§4 the victim\'s save dialog offered' });
      await victim.rollSavingThrow({ ability: 'con' }, { configure: false }, {});
      await until(() => entryOf(card, victim)?.done, { timeout: 15000, label: '4a the sheet roll folded' });
      const entry = entryOf(card, victim);
      const roll = entry?.rollMessageId ? game.messages.get(entry.rollMessageId) : null;
      ok('4a. a bare sheet roll answers the pending demand, judged against the STORED DC',
        (entry?.outcome === 'failed') && !roll?.getFlag(MOD, 'respondsTo')
          && !roll?._source.system?.origin
          && (roll?.rolls?.[0]?.options?.target == null),
        `outcome=${entry?.outcome} target=${roll?.rolls?.[0]?.options?.target}`);
      // Wait for the whole consequence pass: its two creates are sequential.
      await until(() => entryOf(card, victim)?.applied, { timeout: 15000, label: '4b the consequence pass applied' });
      ok('4b. the failure\'s consequences ran off the sheet roll (both chips landed)',
        !!chipOn(victim, 'BTB Poisoned') && !!chipOn(victim, 'BTB Splashed'),
        `chips=[${CHIP_NAMES.map(n => !!chipOn(victim, n)).join()}]`);
      await until(() => savePopups().length === 0, { timeout: 5000, label: '4c the popup closed' });
      ok('4c. the popup closed when the sheet answered', savePopups().length === 0,
        `popups=${savePopups().length}`);
    });

    // ============================================== 5. the buzzer ROLLS — straight and marked
    if (want(5)) await section(5, async () => {
      await clearChips();
      await saveBonus(victim, '-30');
      await healFull(victim);
      await set('saveTimer', 2);
      // The clock goes back to 0 however the section ends: every later section reads it off.
      try {
        target(victimToken);
        const use = await saveActivity().use({}, { configure: false }, {});
        const card = use?.message instanceof ChatMessage ? use.message : null;
        if (!card) throw new Error('section 5 cast produced no card');
        const entry = await until(() => {
          const e = entryOf(card, victim);
          return e?.done ? e : null;
        }, { timeout: 12000, label: '5a the buzzer rolled the save' });
        const roll = entry?.rollMessageId ? game.messages.get(entry.rollMessageId) : null;
        ok('5a. the deadline rolls the save itself — marked, straight, data-driven',
          (entry?.timedOut === true) && (entry?.outcome === 'failed')
            && (roll?.getFlag(MOD, 'timedOut') === true)
            && (roll?.rolls?.[0]?.options?.advantageMode === 0),
          `timedOut=${entry?.timedOut} outcome=${entry?.outcome} advMode=${roll?.rolls?.[0]?.options?.advantageMode}`);
        // Quiesce: this verdict's late application would otherwise land inside §6's healed pool.
        await until(() => entryOf(card, victim)?.applied, { timeout: 15000, label: '§5 the buzzer\'s verdict applied' });
      } finally {
        await set('saveTimer', 0);
      }
    });

    // ============================================== 6. legendary resistance overturns the verdict
    if (want(6)) await section(6, async () => {
      await clearChips();
      await saveBonus(victim, '-30');
      const vMax = await healFull(victim);
      await victim.update({ 'system.resources.legres.max': 1, 'system.resources.legres.spent': 0 });
      target(victimToken);
      const before = snap();
      const use = await saveActivity().use({}, { configure: false }, {});
      const card = use?.message instanceof ChatMessage ? use.message : null;
      if (!card) throw new Error('section 6 cast produced no card');
      await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '§6 the demand stamped' });
      // The popup offers itself; the bare roll answers first (§4's channel).
      await until(() => savePopups()[0], { timeout: 6000, label: '§6 the victim\'s save dialog offered' });
      await victim.rollSavingThrow({ ability: 'con' }, { configure: false }, {});
      await until(() => entryOf(card, victim)?.applied, { timeout: 15000, label: '6-pre the failure applied' });
      const dmg = await until(() => fresh(before).find(m =>
        (m.type === 'damage')
        && m.getFlag(MOD, 'receipt')?.targets?.some(t => t.uuid === victim.uuid)), { timeout: 15000, label: '6-pre the damage receipted' });
      ok('6-pre. the failure landed in full first (10 damage, both chips)',
        (victim.system.attributes.hp.value === vMax - 10) && !!chipOn(victim, 'BTB Poisoned'),
        `hp=${victim.system.attributes.hp.value}/${vMax} poisoned=${!!chipOn(victim, 'BTB Poisoned')}`);

      if (typeof victim.system.resistSave !== 'function') {
        skips.push('6a-c: BTB Test Victim is not NPC-typed — resistSave unavailable');
      } else {
        const rollMsg = game.messages.get(entryOf(card, victim).rollMessageId);
        await victim.system.resistSave(rollMsg);
        await until(() => entryOf(card, victim)?.outcome === 'saved', { timeout: 15000, label: '6a the flip recorded' });
        const entry = entryOf(card, victim);
        ok('6a. the flip is recorded: saved, by legendary resistance, resource spent',
          (entry?.outcome === 'saved') && (entry?.forced === true)
            && (victim.system.resources.legres.value === 0),
          `outcome=${entry?.outcome} forced=${entry?.forced} legres=${victim.system.resources.legres.value}`);

        const effReceipt = await until(() => {
          const r = card.getFlag(MOD, 'effectReceipt')?.targets?.find(t => t.uuid === victim.uuid);
          return r?.effects?.find(e => (e.name === 'BTB Poisoned') && e.reverted) ? r : null;
        }, { timeout: 15000, label: '6b the fail-only effect reverted' });
        ok('6b. the fail-only effect unwinds; the onSave effect survives',
          !chipOn(victim, 'BTB Poisoned') && !!chipOn(victim, 'BTB Splashed')
            && !!effReceipt?.effects?.find(e => (e.name === 'BTB Poisoned') && e.reverted)
            && !!effReceipt?.effects?.find(e => (e.name === 'BTB Splashed') && !e.reverted),
          `chips=[${CHIP_NAMES.map(n => !!chipOn(victim, n)).join()}]`);

        const rV = await until(() => {
          const r = dmg.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === victim.uuid);
          return (r?.multiplier === 0.5) ? r : null;
        }, { timeout: 15000, label: '6c the damage re-applied at half' });
        ok('6c. the damage re-applies at the success multiplier: 10 reverted, 5 landed',
          (rV?.taken === 5) && (rV?.multiplier === 0.5) && !rV?.reverted
            && (victim.system.attributes.hp.value === vMax - 5),
          `taken=${rV?.taken} mult=${rV?.multiplier} hp=${victim.system.attributes.hp.value}/${vMax}`);
      }
      await victim.update({
        'system.resources.legres.max': priorActor[victim.id]['system.resources.legres.max'],
        'system.resources.legres.spent': priorActor[victim.id]['system.resources.legres.spent']
      });
    });

    // ============================================== 7. the exclusions
    if (want(7)) await section(7, async () => {
      await clearChips();

      target();
      let use = await saveActivity().use({}, { configure: false }, {});
      let card = use?.message instanceof ChatMessage ? use.message : null;
      // The window for a WRONG stamp.
      const stamped7b = await watch(() => card?.getFlag(MOD, 'saves'), { ms: 1200 });
      ok('7b. a targetless cast with NO template shape stays native (a waiting demand needs an area to wait for)',
        !!card && !stamped7b && !card.getFlag(MOD, 'saves'), `flag=${!!card?.getFlag(MOD, 'saves')}`);

      target(victimToken);
      use = await selfActivity().use({}, { configure: false }, {});
      card = use?.message instanceof ChatMessage ? use.message : null;
      const stamped7c = await watch(() => card?.getFlag(MOD, 'saves'), { ms: 1200 });
      ok('7c. a self-aimed save activity never stamps (incidental UI targeting)',
        !!card && !stamped7c && !card.getFlag(MOD, 'saves'), `flag=${!!card?.getFlag(MOD, 'saves')}`);
    });

    // ============================================== 8. templates: containment IS the target set
    if (want(8)) await section(8, async () => {
      await clearChips();
      await saveBonus(victim, '-30');
      await saveBonus(shielder, '+30');
      await healFull(victim);
      await healFull(shielder);
      target(shielderToken);              // the manual snapshot aims WRONG on purpose
      const before = snap();
      const use = await saveActivity().use({}, { configure: false }, {});
      const card = use?.message instanceof ChatMessage ? use.message : null;
      if (!card) throw new Error('section 8 cast produced no card');
      await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '§8 the demand stamped' });

      // The template lands over the victim only: the untargeted victim inside joins, the targeted shielder outside drops.
      let hookFired = 0;
      const hid = Hooks.on('createRegion', () => { hookFired++; });
      // ⚠ Radius 2.5 ft on purpose: the fixtures stand one square apart and a GRIDDED 5 ft circle
      // covers the adjacent square. 2.5 ft keeps the neighbor out gridded or Euclidean.
      const [tpl] = await circleArea(victimToken.center.x, victimToken.center.y, 2.5, areaFor(card.getFlag(MOD, 'saves').activityUuid));
      created.templates.push(tpl.id);
      // The adoption floor rides the card's RENDER (the CRUD hooks never fire on this page): nudge one.
      // The region is in the scene once its create resolves, so the nudge goes at once.
      try { ui.chat?.updateMessage?.(card); } catch { /* re-renders next message anyway */ }
      // Soft: a miss logs its inputs below and 8a reports it.
      const adopted = await until(() => {
        const f2 = card.getFlag(MOD, 'saves');
        return (f2?.templated && f2.targets.some(t => t.uuid === victim.uuid)
          && !f2.targets.some(t => t.uuid === shielder.uuid)) ? f2 : null;
      }, { timeout: 15000 }).catch(() => null);
      Hooks.off('createRegion', hid);
      if (!adopted) {
        const f2 = card.getFlag(MOD, 'saves');
        log.push(`8a dbg: ${JSON.stringify({
          hookFired,
          hookCount: Hooks.events.createRegion?.length ?? 0,
          tplExists: !!scene.regions.get(tpl.id),
          tplOrigin: tpl.getFlag('dnd5e', 'activity'),
          cardActivity: f2?.activityUuid,
          equal: tpl.getFlag('dnd5e', 'activity') === f2?.activityUuid,
          status: f2?.status, undone: (f2?.targets ?? []).filter(t => !t.done).length,
          activeGM: game.users.activeGM?.isSelf ?? null,
          victimCenter: victimToken?.center, tplXY: { x: tpl.shapes?.[0]?.x, y: tpl.shapes?.[0]?.y }
        })}`);
      }
      ok('8a. a template adopts the demand: containment in, stale manual targets out',
        !!adopted && (adopted.targets.length === 1),
        `templated=${!!adopted?.templated} targets=[${(card.getFlag(MOD, 'saves')?.targets ?? []).map(t => t.name).join()}]`);

      // 8a2: the dropped target's popup CLOSES wherever it lives (no popup asking a withdrawn question).
      const strandGone = await until(() => !savePopups().some(p =>
        demandText(p).includes(shielder.name)), { timeout: 6000, label: '8a2 the dropped entry\'s popup closed' });
      ok('8a2. the dropped entry\'s popup closes — no stranded question on screen',
        !!strandGone,
        `open save popups: ${savePopups().length}`);

      // The circle moves onto the shielder and the pending set follows. `templated` must already be
      // true or this could pass on the manual snapshot. Delete + re-place because tpl.update()
      // no-ops on this headless page; live moves funnel into the same recompute.
      await scene.deleteEmbeddedDocuments('Region', [tpl.id]);
      const [tpl2] = await circleArea(shielderToken.center.x, shielderToken.center.y, 2.5, areaFor(card.getFlag(MOD, 'saves').activityUuid));
      created.templates.push(tpl2.id);
      try { ui.chat?.updateMessage?.(card); } catch { /* re-renders next message anyway */ }
      // Soft: a miss logs its inputs below and 8b reports it.
      const walked = await until(() => {
        const f2 = card.getFlag(MOD, 'saves');
        return (f2?.templated && f2.targets.some(t => t.uuid === shielder.uuid)
          && !f2.targets.some(t => t.uuid === victim.uuid)) ? f2 : null;
      }, { timeout: 15000 }).catch(() => null);
      if (!walked) {
        const f2 = card.getFlag(MOD, 'saves');
        const tplNow = scene.regions.get(tpl2.id);
        log.push(`8b dbg: ${JSON.stringify({
          tplXY: { x: tplNow?.shapes?.[0]?.x, y: tplNow?.shapes?.[0]?.y }, shielderCenter: shielderToken.center,
          origin: tplNow?.getFlag('dnd5e', 'activity'),
          targets: f2?.targets?.map(t => ({ n: t.name, done: t.done, applied: t.applied })),
          templated: f2?.templated
        })}`);
      }
      ok('8b. the area moved and the pending set moved with it',
        !!walked, `templated=${!!card.getFlag(MOD, 'saves')?.templated} `
          + `targets=[${(card.getFlag(MOD, 'saves')?.targets ?? []).map(t => t.name).join()}]`);

      // Resolve the moved demand; the fixture is instantaneous, so the area leaves with the last consequence.
      const autoDmg8 = fresh(before).find(m =>
        (m.type === 'damage')
        && (m._source.system?.origin === card.id));
      // The shielder's popup offers itself before the bare roll answers (§4's channel). Soft: the
      // walk above may have missed, and 8b already said so.
      const shielderEntry8 = () => card.getFlag(MOD, 'saves')?.targets?.find(t => t.uuid === shielder.uuid);
      await until(() => shielderEntry8() && savePopups().find(p => demandText(p).includes(shielderEntry8().name)),
        { timeout: 6000 }).catch(() => null);
      await shielder.rollSavingThrow({ ability: 'con' }, { configure: false }, {});
      await until(() => (card.getFlag(MOD, 'saves')?.targets ?? []).every(t => t.done && t.applied), { timeout: 15000, label: '8c every consequence landed' });
      await until(() => !scene.regions.get(tpl2.id), { timeout: 8000, label: '8c the instant area swept' });
      ok('8c. the instantaneous area is spent once every consequence landed',
        !scene.regions.get(tpl2.id),
        `area=${!!scene.regions.get(tpl2.id)} autoDmg=${!!autoDmg8}`);

      // 8d: results.templates entries are ARRAYS (drawPreview()'s resolution); unflattened, a
      // placement during usage falls back to the manual snapshot. The harness cannot drive
      // drawPreview, so the hook fires by hand with the live nested shape.
      await clearChips();
      const [tpl8d] = await circleArea(victimToken.center.x, victimToken.center.y, 2.5);
      created.templates.push(tpl8d.id);
      const msg8d = await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: npc }),
        content: '<p>BTB 8d stamp-path fixture</p>',
        flags: { dnd5e: {
          targets: [{ uuid: shielder.uuid, name: shielder.name, img: null, ac: null }],
          activity: { id: saveActivity().id, uuid: saveActivity().uuid, type: 'save' }
        } }
      });
      Hooks.callAll('dnd5e.postUseActivity', saveActivity(), {},
        { message: msg8d, templates: [[tpl8d]] });
      const stamped8d = await until(() => {
        const f = msg8d.getFlag(MOD, 'saves');
        return (f?.targets?.length ? f : null);
      }, { timeout: 6000, label: '8d the stamp-path fixture stamped with targets' });
      ok('8d. the stamp flattens results.templates: contained targets in, the snapshot out',
        !!stamped8d && (stamped8d.templated === true)
          && stamped8d.targets.some(t => t.uuid === victim.uuid)
          && !stamped8d.targets.some(t => t.uuid === shielder.uuid),
        `templated=${stamped8d?.templated} targets=[${(stamped8d?.targets ?? []).map(t => t.name).join()}]`);
      // Sweep the fixture message and its chain before teardown counts cards.
      const chained8d = game.messages.contents.filter(m =>
        m._source.system?.origin === msg8d.id);
      await ChatMessage.deleteDocuments([msg8d.id, ...chained8d.map(m => m.id)]);

      // 8e: an instantaneous area placed on nobody stamps DONE, rolls no damage, and is swept by the
      // elect's floor. The template-shaped activity on purpose: a targetless non-template cast stays native.
      const before8e = snap();
      const [tpl8e] = await circleArea(200, 200, 2.5, areaFor(tmplActivity().uuid));   // far from every fixture token
      created.templates.push(tpl8e.id);
      const msg8e = await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: npc }),
        content: '<p>BTB 8e empty-instant fixture</p>',
        flags: { dnd5e: {
          targets: [],
          activity: { id: tmplActivity().id, uuid: tmplActivity().uuid, type: 'save' }
        } }
      });
      Hooks.callAll('dnd5e.postUseActivity', tmplActivity(), {},
        { message: msg8e, templates: [[tpl8e]] });
      const stamped8e = await until(() => msg8e.getFlag(MOD, 'saves'), { timeout: 6000, label: '8e the empty instant area stamped' });
      ok('8e. an instant area placed on nobody stamps DONE — no wait, no clock, no damage roll',
        !!stamped8e && (stamped8e.status === 'done') && (stamped8e.templated === true)
          && !stamped8e.awaitingTemplate && !(stamped8e.targets ?? []).length
          && !stamped8e.deadline,
        `status=${stamped8e?.status} templated=${stamped8e?.templated} `
          + `awaiting=${stamped8e?.awaitingTemplate} targets=${(stamped8e?.targets ?? []).length}`);
      const swept8e = await until(() => !scene.regions.get(tpl8e.id), { timeout: 8000, label: '8e the empty area swept' });
      ok('8e. …and the convergent floor sweeps the empty area',
        !!swept8e, `still=${!!scene.regions.get(tpl8e.id)}`);
      const rolled8e = fresh(before8e).some(m =>
        m._source.system?.origin === msg8e.id);
      ok('8e. nothing rolled damage at nobody', !rolled8e, `chained=${rolled8e}`);
      const chained8e = game.messages.contents.filter(m =>
        m._source.system?.origin === msg8e.id);
      await ChatMessage.deleteDocuments([msg8e.id, ...chained8e.map(m => m.id)]);

      // 8f: a monster's breath is a `feat` with no system.duration; the stamp falls back to the
      // ACTIVITY's duration (`inst`), so an empty breath is swept like 8e.
      const [breath] = await npc.createEmbeddedDocuments('Item', [{
        name: 'BTB Test Breath', type: 'feat',
        system: {
          activities: {
            bfbreathact00000: {
              _id: 'bfbreathact00000', type: 'save',
              activation: { type: 'action', override: false },
              consumption: { targets: [] },
              duration: { units: 'inst', override: false },
              damage: { onSave: 'half', parts: [{ custom: { enabled: true, formula: '10' }, types: ['poison'] }] },
              save: { ability: ['con'], dc: { calculation: '', formula: '15' } },
              target: { override: false, prompt: true, template: { type: 'cone', size: '30', units: 'ft' }, affects: { type: 'enemy' } }
            }
          }
        }
      }]);
      try {
        const breathAct = () => npc.items.get(breath.id)?.system.activities.get('bfbreathact00000');
        const before8f = snap();
        // ⚠ The cone must stand on EMPTY ground, clear of every fixture's home tile; 8f-pre checks it
        // before anything fires so a new fixture home fails loudly here.
        const [tpl8f] = await scene.createEmbeddedDocuments('Region', [{
          name: 'BTB test cone', shapes: [{ type: 'cone', x: 200, y: 600, radius: 20 * px, angle: 53.13, rotation: 0 }],
          flags: areaFor(breathAct().uuid)
        }]);
        created.templates.push(tpl8f.id);
        const occ8f = scene.tokens.filter(t => t.testInsideRegion?.(tpl8f));
        ok('8f-pre. the cone stands on empty ground (no fixture token inside it)', !occ8f.length,
          `inside=${occ8f.map(t => t.name).join(', ') || 'none'}`);
        const msg8f = await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: npc }),
          content: '<p>BTB 8f feature-breath fixture</p>',
          flags: { dnd5e: {
            targets: [],
            activity: { id: breathAct().id, uuid: breathAct().uuid, type: 'save' }
          } }
        });
        Hooks.callAll('dnd5e.postUseActivity', breathAct(), {},
          { message: msg8f, templates: [[tpl8f]] });
        const stamped8f = await until(() => msg8f.getFlag(MOD, 'saves'), { timeout: 6000, label: '8f the breath stamped' });
        ok('8f. a FEATURE\'s breath (a feat: no item duration) stamps the ACTIVITY\'s "inst" — and an empty one stamps DONE',
          !!stamped8f && (stamped8f.durationUnits === 'inst') && (stamped8f.status === 'done')
            && (stamped8f.templated === true) && !stamped8f.awaitingTemplate,
          `durationUnits=${stamped8f?.durationUnits} status=${stamped8f?.status} `
            + `templated=${stamped8f?.templated} awaiting=${stamped8f?.awaitingTemplate}`);
        const swept8f = await until(() => !scene.regions.get(tpl8f.id), { timeout: 8000, label: '8f the cone swept' });
        ok('8f. …and the cone is swept like any spent instant area',
          !!swept8f, `still=${!!scene.regions.get(tpl8f.id)} rolled=${fresh(before8f).some(m => m._source.system?.origin === msg8f.id)}`);
        const chained8f = game.messages.contents.filter(m =>
          m._source.system?.origin === msg8f.id);
        await ChatMessage.deleteDocuments([msg8f.id, ...chained8f.map(m => m.id)]);
      } finally {
        if (npc.items.get(breath.id)) await npc.deleteEmbeddedDocuments('Item', [breath.id]).catch(() => {});
      }

      // 8g: a Spent Areas row is swept at the last verdict whatever its data says (this one lies:
      // 1-turn, no concentration); a name the table does not hold stamps WAITING and the area stands.
      const [miasma] = await npc.createEmbeddedDocuments('Item', [{
        name: 'Noxious Miasma', type: 'feat',
        system: {
          activities: {
            bfmiasmaact00000: {
              _id: 'bfmiasmaact00000', type: 'save',
              activation: { type: 'action', override: false },
              consumption: { targets: [] },
              duration: { value: '1', units: 'turn', override: false },
              damage: { onSave: 'none', parts: [{ custom: { enabled: true, formula: '7' }, types: ['poison'] }] },
              save: { ability: ['con'], dc: { calculation: '', formula: '17' } },
              target: { override: false, prompt: true, template: { type: 'sphere', size: '20', units: 'ft' }, affects: { type: 'creature' } }
            }
          }
        }
      }]);
      try {
        const miasmaAct = () => npc.items.get(miasma.id)?.system.activities.get('bfmiasmaact00000');
        const castEmpty = async label => {
          const [tpl] = await circleArea(200, 700, 20, areaFor(miasmaAct().uuid));   // far from every fixture token
          created.templates.push(tpl.id);
          const msg = await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: npc }),
            content: `<p>BTB 8g ${label} fixture</p>`,
            flags: { dnd5e: { targets: [], activity: { id: miasmaAct().id, uuid: miasmaAct().uuid, type: 'save' } } }
          });
          Hooks.callAll('dnd5e.postUseActivity', miasmaAct(), {}, { message: msg, templates: [[tpl]] });
          const stamped = await until(() => msg.getFlag(MOD, 'saves'), { timeout: 6000, label: `8g the ${label} area stamped` });
          // The window: a listed area is swept inside it, an unlisted one must outlast it.
          const swept = await watch(() => !scene.regions.get(tpl.id), { ms: 2500 });
          const still = !swept && !!scene.regions.get(tpl.id);
          const chained = game.messages.contents.filter(m => m._source.system?.origin === msg.id);
          await ChatMessage.deleteDocuments([msg.id, ...chained.map(m => m.id)]).catch(() => {});
          if (still) await scene.regions.get(tpl.id)?.delete().catch(() => {});
          return { stamped, still };
        };
        const listed = await castEmpty('listed');
        ok('8g. LISTED, a 1-turn feature area placed on nobody stamps DONE and is swept — the fourth bucket',
          !!listed.stamped && (listed.stamped.status === 'done') && (listed.stamped.durationUnits === 'turn') && !listed.still,
          `status=${listed.stamped?.status} durationUnits=${listed.stamped?.durationUnits} still=${listed.still}`);
        // Not a table row: the same cast under a name (and identifier) the Spent Areas table lacks.
        await npc.items.get(miasma.id).update({ name: 'BTB Unlisted Area', 'system.identifier': 'bf-unlisted-area' });
        const struck = await castEmpty('unlisted');
        ok('8g. NOT a Spent Areas row, the same cast waits and the area stands — the GM\'s bucket',
          !!struck.stamped && (struck.stamped.status === 'pending') && struck.stamped.awaitingTemplate && struck.still,
          `status=${struck.stamped?.status} awaiting=${struck.stamped?.awaitingTemplate} still=${struck.still}`);
      } finally {
        if (npc.items.get(miasma.id)) await npc.deleteEmbeddedDocuments('Item', [miasma.id]).catch(() => {});
      }
    });

    // ============================================== 9. rider damage (onSave "full") + per-row bars
    // Damage the save does not modulate stamps no damage dimension: no auto-roll, no per-verdict
    // application. Every pending row drains its own bar.
    if (want(9)) await section(9, async () => {
      await clearChips();
      await saveBonus(victim, '-30');            // forced failure — ③'s dangerous case
      await saveBonus(shielder, '+30');
      const vMax9 = await healFull(victim);
      await healFull(shielder);
      await set('saveTimer', 4);                 // bars need a window; the buzzer backstops
      // The clock goes back to 0 however the section ends: every later section reads it off.
      try {
        target(victimToken, shielderToken);
        const before = snap();
        const use = await fullActivity().use({}, { configure: false }, {});
        const card = use?.message instanceof ChatMessage ? use.message : null;
        if (!card) throw new Error('section 9 cast produced no card');
        const flag9 = await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '9a the rider demand stamped' });

        ok('9a. onSave "full" is rider damage — the demand stamps with NO damage dimension',
          (flag9?.damageOnSave === 'full') && (flag9?.hasDamage === false),
          `onSave=${flag9?.damageOnSave} hasDamage=${flag9?.hasDamage}`);

        // Re-query per poll: a re-render replaces the card element.
        const barCount = () => document.querySelector(`[data-message-id="${card.id}"]`)
          ?.querySelectorAll('[data-bf-deadline]')?.length ?? 0;
        await until(() => barCount() === 2, { timeout: 2500, label: '9c two bars drawn' });
        const pending9 = card.getFlag(MOD, 'saves').targets.filter(t => !t.done).length;
        ok('9c. every pending row drains its own bar', (pending9 === 2) && (barCount() === 2),
          `pending=${pending9} bars=${barCount()}`);

        // The window: an auto-roll would land inside it if the gate regressed.
        const autoDmg9 = await watch(() => fresh(before).find(m => (m.type === 'damage')
          && (m._source.system?.origin === card.id)), { ms: 900 });
        ok('9b. rider damage never auto-rolls at the stamp', !autoDmg9, `autoRolled=${!!autoDmg9}`);

        // Resolve through the popups; if the buzzer wins instead, the assertions hold either way
        // (soft per try: the loop breaks on a missing popup).
        for (let i = 0; i < 2; i++) {
          const popup = await until(() => savePopups()[0], { timeout: 6000 }).catch(() => null);
          if (!popup) break;
          [...popup.querySelectorAll('footer button, .form-footer button, nav.dialog-buttons button')]
            .find(b => b.textContent.trim() === 'Normal')?.click();
          await until(() => !document.contains(popup), { timeout: 6000 }).catch(() => null);
        }
        await until(() => card.getFlag(MOD, 'saves')?.targets?.every(t => t.done && t.applied), { timeout: 12000, label: '9d both verdicts applied' });
        const e9 = entryOf(card, victim);
        ok('9d. a FAILED save against rider damage applies no damage at all',
          (e9?.outcome === 'failed') && (victim.system.attributes.hp.value === vMax9),
          `outcome=${e9?.outcome} hp=${victim.system.attributes.hp.value}/${vMax9}`);
      } finally {
        await set('saveTimer', 0);
      }
    });

    // ============================================== 10. the waiting demand
    // A template-shaped save activity cast bare stamps WAITING (zero targets, no deadline), hides
    // every card button but refundResource, and the placed area delivers targets and arms the clock.
    if (want(10)) await section(10, async () => {
      await clearChips();
      // ⚠ Sweep origin-less templates first: a waiting demand CLAIMS any unowned template of its
      // shape, so a leftover rect is claimed by the older cast and 10d2 fails on residue.
      // A toolbar draw is a Region with the core MeasuredTemplate flag and no activity.
      const strayAreas10 = scene.regions.filter(r => r.getFlag('core', 'MeasuredTemplate') && !r.getFlag('dnd5e', 'activity'));
      if (strayAreas10.length) {
        log.push(`section 10 swept ${strayAreas10.length} unowned leftover drawn template(s)`);
        await scene.deleteEmbeddedDocuments('Region', strayAreas10.map(t => t.id));
      }
      await saveBonus(victim, '-30');
      const vMax10 = await healFull(victim);
      await set('saveTimer', 15);
      // The clock goes back to 0 however the section ends: every later section reads it off.
      try {
        target();                            // BARE on purpose — the whole finding
        // TWO bare casts: one placement must fill exactly one (the newest-customer gate).
        const useOld10 = await tmplActivity().use(
          { create: { measuredTemplate: false } }, { configure: false }, {});
        const cardOld10 = useOld10?.message instanceof ChatMessage ? useOld10.message : null;
        if (!cardOld10) throw new Error('section 10 older cast produced no card');
        await until(() => cardOld10.getFlag(MOD, 'saves'), { timeout: 6000, label: '§10 the older cast stamped' });
        // Distinct timestamps — the gate sorts by them: the newer cast goes out a clear margin later.
        await until(() => Date.now() - cardOld10.timestamp > 150, { label: '§10 past the older card\'s timestamp' });
        const snap10 = snap();
        const use10 = await tmplActivity().use(
          { create: { measuredTemplate: false } }, { configure: false }, {});
        const card10 = use10?.message instanceof ChatMessage ? use10.message : null;
        if (!card10) throw new Error('section 10 cast produced no card');
        const flag10 = await until(() => card10.getFlag(MOD, 'saves'), { timeout: 6000, label: '10a the waiting demand stamped' });

        ok('10a. a targetless template cast stamps a WAITING demand — zero targets, no deadline',
          !!flag10 && (flag10.status === 'pending') && ((flag10.targets ?? []).length === 0)
            && (flag10.awaitingTemplate === true) && !flag10.deadline && (flag10.window === 15)
            && (flag10.templateType === 'cube'),
          `flag=${!!flag10} targets=${flag10?.targets?.length} awaiting=${flag10?.awaitingTemplate} `
            + `deadline=${flag10?.deadline} window=${flag10?.window} tmplType=${flag10?.templateType}`);

        // The platform's list carries a real Place Template button; the card keeps only refundResource.
        const platform10 = tmplActivity()._usageChatButtons({ hasConsumption: false }).map(b => b.action);
        const data10 = (card10.system?.buttons ?? []).map(b => b.action);
        const cardEl10 = await until(() => ui.chat.element.querySelector(`.message[data-message-id="${card10.id}"]`), { timeout: 4000, label: '10b the card drawn in the log' });
        const drawn10 = [...(cardEl10?.querySelectorAll('.icon-row button[data-action]') ?? [])].map(b => b.dataset.action);
        ok('10b. Place Template is a button the platform offers and the card\'s DATA drops it — the keep-list is refundResource only',
          platform10.includes('placeTemplate') && data10.every(a => a === 'refundResource') && drawn10.every(a => a === 'refundResource'),
          `platform=[${platform10.join()}] data=[${data10.join()}] drawn=[${drawn10.join()}]`);
        const waitLine10 = await until(() => {
          const t = document.querySelector(`[data-message-id="${card10.id}"]`)
            ?.querySelector('.bythebooks-saves')?.textContent ?? '';
          return t.includes("waiting for the template's area") ? t : null;
        }, { timeout: 4000, label: '10c the waiting line drawn' });
        ok('10c. the waiting card says so', !!waitLine10, `line="${(waitLine10 ?? '').trim()}"`);

        // The toolbar's origin-less rect: the waiting demand must CLAIM it, fill, and arm the clock.
        // ⚠ Snapshot the older demand BEFORE the rect exists: templated already means it claimed residue.
        const oldBefore10 = {
          targets: (cardOld10.getFlag(MOD, 'saves')?.targets ?? []).length,
          templated: cardOld10.getFlag(MOD, 'saves')?.templated ?? false,
          scenePool: scene.regions.filter(r => r.getFlag('core', 'MeasuredTemplate') || r.getFlag('dnd5e', 'activity')).map(r => ({ id: r.id, t: r.shapes?.[0]?.type,
            origin: r.getFlag('dnd5e', 'activity') ?? null })),
        };
        // The toolbar creates a Region flagged `flags.core.MeasuredTemplate`, a cube as a rectangle, 200px around the victim.
        const [tpl10] = await scene.createEmbeddedDocuments('Region', [{
          name: 'BTB toolbar rect', shapes: [{ type: 'rectangle', x: victimToken.center.x - 100, y: victimToken.center.y - 100, width: 200, height: 200, rotation: 0 }],
          flags: { core: { MeasuredTemplate: true } }
        }]);
        created.templates.push(tpl10.id);
        // The rect is in the scene once its create resolves, so the render nudge goes at once.
        try { ui.chat?.updateMessage?.(card10); } catch { /* re-renders next message anyway */ }
        const adopted10 = await until(() => {
          const f = card10.getFlag(MOD, 'saves');
          return (f?.templated && !f.awaitingTemplate && f.deadline
            && f.targets.some(t => t.uuid === victim.uuid)) ? f : null;
        }, { timeout: 15000, label: '10d the toolbar rect claimed and the demand filled' });
        // ⚠ The claim's origin write cannot be asserted: template updates no-op on this page. Rows
        // appearing at all prove claimBareTemplate chose this rect (templatesForOrigin is empty here).
        ok('10d. the toolbar rect is claimed and fills the waiting demand, clock armed from that moment',
          !!adopted10 && (adopted10.targets.length === 1) && (adopted10.deadline > Date.now())
            && (adopted10.deadline <= Date.now() + 15_500),
          `targets=[${(card10.getFlag(MOD, 'saves')?.targets ?? []).map(t => t.name).join()}] `
            + `deadline=${adopted10?.deadline} now=${Date.now()} `
            + `originOnPage=${JSON.stringify(scene.regions.get(tpl10.id)?.getFlag('dnd5e', 'activity') ?? null)}`);
        const oldFlag10 = cardOld10.getFlag(MOD, 'saves');
        ok('10d2. the OLDER waiting cast is not the customer — one area fills exactly one demand',
          (oldFlag10?.status === 'pending') && ((oldFlag10?.targets ?? []).length === 0)
            && (oldFlag10?.awaitingTemplate === true) && !oldFlag10?.deadline,
          `older: targets=${oldFlag10?.targets?.length} awaiting=${oldFlag10?.awaitingTemplate} `
            + `deadline=${oldFlag10?.deadline}`
            // the fossil wall's inputs, so a failure says why
            + ` | oldTs=${cardOld10.timestamp} newTs=${card10.timestamp}`
            + ` sameActivity=${oldFlag10?.activityUuid === card10.getFlag(MOD, 'saves')?.activityUuid}`
            + ` oldStatus=${oldFlag10?.status} oldTemplated=${oldFlag10?.templated}`
            + ` tplOrigin=${JSON.stringify(scene.regions.get(tpl10.id)?.getFlag('dnd5e', 'activity') ?? null)}`
            + ` oldBefore=${JSON.stringify(oldBefore10)}`
            + ` newerSeenFromOld=${game.messages.contents.some(m => (m.id !== cardOld10.id)
                && (m.timestamp > cardOld10.timestamp)
                && (m.getFlag(MOD, 'saves')?.activityUuid === oldFlag10?.activityUuid))}`);

        // The NPC arrival is asked; -30 fails and the half-rule damage applies at ×1.
        // ⚠ Match the popup by the entry's stored (TOKEN) name, never the actor's.
        const entryName10 = adopted10.targets[0]?.name ?? victim.name;
        const popup10 = await until(() => savePopups().find(p => demandText(p).includes(entryName10)), { timeout: 6000, label: '10e the arrival\'s ask' });
        ok('10e. the arrival gets its ask', !!popup10,
          `popups=${savePopups().length} lookingFor="${entryName10}"`);
        [...(popup10?.querySelectorAll('footer button, .form-footer button, nav.dialog-buttons button') ?? [])]
          .find(b => b.textContent.trim() === 'Normal')?.click();
        await until(() => card10.getFlag(MOD, 'saves')?.targets?.every(t => t.done && t.applied), { timeout: 20000, label: '10f the adopted demand applied' });
        const e10 = entryOf(card10, victim);
        const dmg10 = fresh(snap10).find(m => (m.type === 'damage')
          && (m._source.system?.origin === card10.id));
        ok('10f. the adopted demand runs the whole machine — verdict, damage, receipt',
          (e10?.outcome === 'failed') && (victim.system.attributes.hp.value === vMax10 - 10),
          `outcome=${e10?.outcome} applied=${e10?.applied} dmgRolled=${!!dmg10} `
            + `hp=${victim.system.attributes.hp.value}/${vMax10}`);
      } finally {
        await set('saveTimer', 0);
      }
    });

    // ============================================== 11. the GM popup routing
    // canAnswerFor alone routes the popups: an online owner keeps the GM quiet; a player-owned
    // target whose owner is offline pops for the GM. The buzzer is the last resort (11c).
    // Ownership is set in object form (the dotted key raises validation noise).
    if (want(11)) await section(11, async () => {
      await clearChips();
      const playerUser11 = game.users.find(u => !u.isGM && !u.active);
      let owned11 = false;
      if (pcActor && playerUser11) {
        await pcActor.update({ ownership: { [playerUser11.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
        owned11 = !!pcActor.hasPlayerOwner
          && !game.users.some(u => !u.isGM && u.active && pcActor.testUserPermission(u, 'OWNER'));
      }
      // The clock and the borrowed ownership go back however the section ends.
      try {
        if (!owned11) {
          skips.push(`11: could not produce an offline player owner `
            + `(actor=${!!pcActor} playerUser=${!!playerUser11} hasPlayerOwner=${pcActor?.hasPlayerOwner})`);
        } else {
          priorActor[pcActor.id] = {
            'system.abilities.con.save.roll.bonus': pcActor.system._source.abilities?.con?.save?.roll?.bonus ?? '',
            'system.attributes.hp.value': pcActor.system._source.attributes.hp.value,
            ...(priorActor[pcActor.id] ?? {})
          };
          await pcActor.update({ 'system.abilities.con.save.roll.bonus': '-30' });
          await saveBonus(victim, '-30');
          await healFull(victim);
          await healFull(pcActor);
          const pcToken = await mkToken(pcActor, 1400);
          if (!pcToken) throw new Error('section 11 PC token never reached the canvas');
          // 8s: the pending-state assertions need time to look before the buzzer resolves everything.
          await set('saveTimer', 8);
          target(victimToken, pcToken);
          const use11 = await saveActivity().use({}, { configure: false }, {});
          const card11 = use11?.message instanceof ChatMessage ? use11.message : null;
          if (!card11) throw new Error('section 11 cast produced no card');
          const flag11 = await until(() => card11.getFlag(MOD, 'saves'), { timeout: 15000, label: '§11 the demand stamped' });
          // Entry names are TOKEN names: match popups by what the demand stored.
          const nameOf11 = a => flag11?.targets?.find(t => t.uuid === a.uuid)?.name ?? a.name;
          const npcName11 = nameOf11(victim);
          const pcName11 = nameOf11(pcActor);

          const npcPopup = await until(() => savePopups().find(p => demandText(p).includes(npcName11)), { timeout: 4000, label: '11a the NPC\'s popup' });
          const pcPopup = await until(() => savePopups().find(p => demandText(p).includes(pcName11)), { timeout: 4000, label: '11a the offline-owner PC\'s popup' });
          ok('11a. an empty room pops for EVERYONE — the offline-owner PC included ((h))',
            !!npcPopup && !!pcPopup,
            `npcPopup=${!!npcPopup} pcPopup=${!!pcPopup} open=${savePopups().length} `
              + `names=["${npcName11}","${pcName11}"]`);

          const rowText11 = await until(() => {
            const t = document.querySelector(`[data-message-id="${card11.id}"]`)
              ?.querySelector('.bythebooks-saves')?.textContent ?? '';
            return t.includes('waiting on') ? t : null;
          }, { timeout: 3000, label: '11b the card row names the roller' });
          ok('11b. the card row names the ROLLER again — "owner offline" described the removed quiet',
            !!rowText11 && !rowText11.includes('owner offline'),
            `row="${(rowText11 ?? '').trim()}"`);

          // Resolve the NPC's popup; the PC's stays open so the buzzer must still resolve it.
          [...(npcPopup?.querySelectorAll('footer button, .form-footer button, nav.dialog-buttons button') ?? [])]
            .find(b => b.textContent.trim() === 'Normal')?.click();
          await until(() => card11.getFlag(MOD, 'saves')?.targets?.every(t => t.done), { timeout: 20000, label: '11c the buzzer resolved the PC' });
          const ePc = entryOf(card11, pcActor);
          ok('11c. the buzzer resolves the unanswered PC — timed out, judged, done',
            (ePc?.done === true) && (ePc?.timedOut === true) && (ePc?.outcome === 'failed'),
            `done=${ePc?.done} timedOut=${ePc?.timedOut} outcome=${ePc?.outcome}`);
          await until(() => card11.getFlag(MOD, 'saves')?.targets?.every(t => t.applied), { timeout: 12000, label: '§11 both verdicts applied' });
        }
      } finally {
        await set('saveTimer', 0);
        if (pcActor && playerUser11) {
          await pcActor.update({ ownership: { [playerUser11.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE } });
        }
      }
    });

    // ============================================== 12. spell-truth geometry
    // A suite-built 140px scene: containment must match the SPELL's area at any grid size. The
    // assertions are factor-proof (shimFactor is logged).
    let card12 = null;               // §13 rides this demand's completed lifecycle
    let tpl12Id = null;
    const actUuid12 = tmplActivity().uuid;
    // The shim scene's cube (§12 places it, §13 re-places it, §14 borrows it).
    const cube12 = () => ({ name: 'BTB shim cube', shapes: [{ type: 'rectangle', x: 1400, y: 1400, width: 280, height: 280, rotation: 0 }], flags: { dnd5e: { activity: actUuid12 } } });
    if (want(12)) await section(12, async () => {
      await clearChips();
      await saveBonus(victim, '-30');
      await healFull(victim);
      shimScene = await Scene.create({
        name: 'BTB Shim Range', width: 2800, height: 2100, tokenVision: false,
        grid: { type: 1, size: 140, distance: 5, units: 'ft' }
      });
      const proto = a => foundry.utils.mergeObject(a.prototypeToken.toObject(),
        { actorId: a.id, actorLink: true }, { inplace: false });
      // A 10 ft cube at (1400,1400), honest side 280px. IN stands in its first square; OUT stands
      // 350px from the origin (outside 280, inside a ×1.4 phantom's 392). Distinct actors: entries
      // dedupe by actor uuid.
      await shimScene.createEmbeddedDocuments('Token',
        [foundry.utils.mergeObject(proto(victim), { x: 1400, y: 1400 }, { inplace: false })]);
      await shimScene.createEmbeddedDocuments('Token',
        [foundry.utils.mergeObject(proto(shielder), { x: 1680, y: 1400 }, { inplace: false })]);
      target();                       // bare — the WAITING stamp is adoption's customer
      const use12 = await tmplActivity().use(
        { create: { measuredTemplate: false } }, { configure: false }, {});
      card12 = use12?.message instanceof ChatMessage ? use12.message : null;
      if (!card12) throw new Error('section 12 cast produced no card');
      await until(() => card12.getFlag(MOD, 'saves'), { timeout: 6000, label: '§12 the waiting demand stamped' });

      // The dialog placement's shape at 140px: a Region rectangle in PIXELS, the activity on its flag.
      const [tpl12] = await shimScene.createEmbeddedDocuments('Region', [cube12()]);
      tpl12Id = tpl12.id;
      log.push(`section 12 region ${tpl12.id} shape=${JSON.stringify(tpl12.shapes[0])} grid=${shimScene.grid.size}px`);

      try { ui.chat?.updateMessage?.(card12); } catch { /* the next render carries it */ }
      const adopted12 = await until(() => {
        const f = card12.getFlag(MOD, 'saves');
        return (f?.templated && (f.targets ?? []).length) ? f : null;
      }, { timeout: 15000, label: '12a the cube adopted the demand' });
      const uuids12 = (adopted12?.targets ?? []).map(t => t.uuid);
      ok('12a. containment is spell-true on a 140px grid — the region\'s own geometry, the platform\'s test',
        !!adopted12 && uuids12.includes(victim.uuid) && !uuids12.includes(shielder.uuid)
          && (uuids12.length === 1),
        `targets=[${(adopted12?.targets ?? []).map(t => t.name).join()}]`);

      // Run it to done for §13.
      const name12 = adopted12?.targets?.[0]?.name ?? victim.name;
      const popup12 = await until(() => savePopups().find(p => demandText(p).includes(name12)), { timeout: 6000, label: '12b the shim-scene ask' });
      [...(popup12?.querySelectorAll('footer button, .form-footer button, nav.dialog-buttons button') ?? [])]
        .find(b => b.textContent.trim() === 'Normal')?.click();
      const done12 = await until(() => {
        const f = card12.getFlag(MOD, 'saves');
        return f?.targets?.every(t => t.done && t.applied) ? f : null;
      }, { timeout: 20000, label: '12b the shim-scene demand applied' });
      ok('12b. the shim-scene demand runs to applied', !!done12,
        `state=${JSON.stringify((card12.getFlag(MOD, 'saves')?.targets ?? [])
          .map(t => ({ done: t.done, applied: t.applied })))}`);
    });

    // ============================================== 13. the spent sweep converges
    // done + instantaneous + area standing ⇒ swept on the next render, whoever the elect is; a NEWER
    // same-activity card disarms an older card's sweep (the fossil wall: a recast reuses the uuid).
    if (want(13)) await section(13, async () => {
      // 13a: the completion one-shot swept §12's area.
      const gone13 = await until(() => !shimScene.regions.get(tpl12Id), { timeout: 8000, label: '13a §12 area swept at completion' });
      ok('13a. an instantaneous demand sweeps its area at completion', !!gone13,
        `still=${!!shimScene.regions.get(tpl12Id)}`);

      // 13b: a stale leftover converges on the next render.
      const [stale13] = await shimScene.createEmbeddedDocuments('Region', [cube12()]);
      try { ui.chat?.updateMessage?.(card12); } catch { /* render floor */ }
      const swept13 = await until(() => !shimScene.regions.get(stale13.id), { timeout: 8000, label: '13b the stale area re-swept on render' });
      ok('13b. a done demand re-sweeps a stale area on render — the convergent floor', !!swept13,
        `still=${!!shimScene.regions.get(stale13.id)}`);

      // 13c: the fossil wall. The stub is DONE with no `templated`: it exists only to be newer.
      const stub13 = await ChatMessage.create({
        content: 'BTB test — newer same-activity stub (section 13c)',
        flags: { [MOD]: { saves: { status: 'done', activityUuid: actUuid12, targets: [] } } }
      });
      const [stale13c] = await shimScene.createEmbeddedDocuments('Region', [cube12()]);
      try { ui.chat?.updateMessage?.(card12); } catch { /* render floor */ }
      // The window for a WRONG sweep: the newer stub disarms the old card's.
      const swept13c = await watch(() => !shimScene.regions.get(stale13c.id), { ms: 1500 });
      const held13 = !swept13c && !!shimScene.regions.get(stale13c.id);
      ok('13c. a newer same-activity cast disarms an old card\'s sweep — the fossil wall',
        held13, `survived=${held13}`);
      if (shimScene.regions.get(stale13c.id)) {
        await shimScene.deleteEmbeddedDocuments('Region', [stale13c.id]);
      }
      await ChatMessage.deleteDocuments([stub13.id]);

      // 13d: a closed demand's never-asked entry (appended by a refresh racing the buzzer) does not
      // hold the area up.
      const prior13d = foundry.utils.deepClone(card12.getFlag(MOD, 'saves'));
      const [stale13d] = await shimScene.createEmbeddedDocuments('Region', [cube12()]);
      await card12.setFlag(MOD, 'saves', { ...prior13d, status: 'done',
        targets: [...(prior13d.targets ?? []), { uuid: shielder.uuid, name: shielder.name, done: false, outcome: null, total: null, rollMessageId: null }] });
      try { ui.chat?.updateMessage?.(card12); } catch { /* render floor */ }
      const swept13d = await until(() => !shimScene.regions.get(stale13d.id), { timeout: 8000, label: '13d the closed demand swept its area' });
      ok('13d. a CLOSED demand with a never-asked entry still sweeps its area — the orphan holds nothing up',
        !!swept13d, `still=${!!shimScene.regions.get(stale13d.id)}`);
      if (shimScene.regions.get(stale13d.id)) await shimScene.deleteEmbeddedDocuments('Region', [stale13d.id]);
      await card12.setFlag(MOD, 'saves', prior13d);
    });

    // ============================================== 14. the duration sweep
    // A duration area is spent when the caster stops wearing the concentration effect the card
    // names; while concentration holds it must never sweep.
    if (want(14)) await section(14, async () => {
      const [concItem] = await npc.createEmbeddedDocuments('Item', [{
        name: 'BTB Test Clinging Web', type: 'spell',
        system: {
          level: 1, school: 'con', properties: ['vocal', 'concentration'],
          duration: { units: 'minute', value: '1' },
          range: { value: '60', units: 'ft' },
          method: 'spell', prepared: 1, identifier: 'bf-test-clinging-web',
          target: { affects: { type: 'creature', count: '', choice: false } },
          activities: {
            bfsaveconc000000: {
              _id: 'bfsaveconc000000', type: 'save',
              activation: { type: 'action', override: false },
              consumption: { targets: [], spellSlot: false },
              damage: { onSave: 'half', parts: [{ custom: { enabled: true, formula: '10' }, types: ['poison'] }] },
              effects: [],
              save: { ability: ['con'], dc: { calculation: '', formula: '15' } },
              target: { override: true, prompt: true,
                template: { type: 'cube', size: '10', units: 'ft', count: '' },
                affects: { type: 'creature', count: '', choice: false } }
            }
          }
        }
      }]);
      created.items.push({ actorId: npc.id, id: concItem.id });
      const concActivity = () => npc.items.get(concItem.id).system.activities.get('bfsaveconc000000');

      let concEff14 = null;
      // The caster's concentration ends however the section ends (14c ends it on purpose).
      try {
        await clearChips();
        await saveBonus(victim, '-30');
        await healFull(victim);
        target(); // bare — the WAITING stamp, exactly the live Web/Faerie Fire flow
        const use14 = await concActivity().use(
          { create: { measuredTemplate: false } }, { configure: false }, {});
        const card14 = use14?.message instanceof ChatMessage ? use14.message : null;
        if (!card14) throw new Error('section 14 cast produced no card');
        await until(() => card14.getFlag(MOD, 'saves'), { timeout: 6000, label: '14a the concentration cast stamped' });
        concEff14 = card14.system?.concentration
          ? npc.effects.get(card14.system.concentration) : null;
        ok('14a. the concentration cast stamps its demand and the card names the effect',
          !!card14.getFlag(MOD, 'saves') && !!concEff14,
          `flag=${!!card14.getFlag(MOD, 'saves')} concId=${card14.system?.concentration ?? 'MISSING'} `
            + `effect=${!!concEff14}`);

        const actUuid14 = concActivity().uuid;
        const [tpl14] = await shimScene.createEmbeddedDocuments('Region', [{ ...cube12(), flags: { dnd5e: { activity: actUuid14 } } }]);
        try { ui.chat?.updateMessage?.(card14); } catch { /* the next render carries it */ }
        const adopted14 = await until(() => {
          const f = card14.getFlag(MOD, 'saves');
          return (f?.templated && (f.targets ?? []).length) ? f : null;
        }, { timeout: 15000, label: '§14 the cube adopted the demand' });
        const name14 = adopted14?.targets?.[0]?.name ?? victim.name;
        const popup14 = await until(() => savePopups().find(p => demandText(p).includes(name14)), { timeout: 6000, label: '§14 the ask' });
        [...(popup14?.querySelectorAll('footer button, .form-footer button, nav.dialog-buttons button') ?? [])]
          .find(b => b.textContent.trim() === 'Normal')?.click();
        const done14 = await until(() => {
          const f = card14.getFlag(MOD, 'saves');
          return f?.targets?.every(t => t.done && t.applied) ? f : null;
        }, { timeout: 20000, label: '14b the demand applied' });

        // 14b: done and applied — and the area STANDS, because the spell is still up.
        try { ui.chat?.updateMessage?.(card14); } catch { /* render floor */ }
        // The window for a WRONG sweep: concentration still holds the area up.
        const swept14 = await watch(() => !shimScene.regions.get(tpl14.id), { ms: 2000 });
        ok('14b. a DURATION area stands after its demand completes — concentration is alive',
          !!done14 && !swept14 && !!shimScene.regions.get(tpl14.id),
          `done=${!!done14} still=${!!shimScene.regions.get(tpl14.id)}`);

        // 14c: concentration ends — the deleteActiveEffect trigger sweeps the orphaned area.
        if (concEff14) await concEff14.delete();
        const gone14 = await until(() => !shimScene.regions.get(tpl14.id), { timeout: 8000, label: '14c the orphaned area swept' });
        ok('14c. concentration ends and the orphaned area sweeps — finding ① converges',
          !!concEff14 && !!gone14,
          `concEffect=${!!concEff14} still=${!!shimScene.regions.get(tpl14.id)}`);
      } finally {
        if (concEff14 && npc.effects.get(concEff14.id)) await concEff14.delete().catch(() => {});
      }
    });

    // ============================================== 15. the verdict lines
    // No public line posts; the usage card says each verdict once, and a legendary-resistance flip
    // reads corrected.
    if (want(15)) await section(15, async () => {
      const linesFor = cardId => game.messages.contents.filter(m => m.getFlag(MOD, 'verdictLine')?.sourceMessageId === cardId);
      await clearChips();
      await saveBonus(victim, '-30');
      await saveBonus(shielder, '+30');
      await healFull(victim);
      await healFull(shielder);
      await victim.update({ 'system.resources.legres.max': 1, 'system.resources.legres.spent': 0 });
      await set('saveTimer', 2);                 // the buzzer rolls both; verdicts land fast
      // The clock and the legendary resistance go back however the section ends.
      try {
        target(victimToken, shielderToken);
        const use15 = await saveActivity().use({}, { configure: false }, {});
        const card15 = use15?.message instanceof ChatMessage ? use15.message : null;
        if (!card15) throw new Error('section 15 cast produced no card');
        const done15 = await until(() => {
          const f = card15.getFlag(MOD, 'saves');
          return f?.targets?.every(t => t.done && t.applied) ? f : null;
        }, { timeout: 25000 }).catch(() => null);   // soft: a miss logs its cause below and 15a reports it
        if (!done15) {
          // Name the cause on a red (a lost token speaker lands the verdict after the wait).
          const f = card15.getFlag(MOD, 'saves');
          const rollOf = t => (t?.rollMessageId ? game.messages.get(t.rollMessageId) : null);
          log.push(`15 TIMEOUT: canvas.ready=${canvas.ready} scene=${canvas.scene?.id === scene.id} `
            + `victimToken=${!!scene.tokens.get(victimToken.document.id)} active=${victim.getActiveTokens().length} `
            + `targets=${JSON.stringify((f?.targets ?? []).map(t => ({ name: t.name, done: !!t.done, applied: !!t.applied,
              outcome: t.outcome ?? null, roll: !!t.rollMessageId, speaker: rollOf(t)?.speaker?.token ?? null })))}`);
        }
        // The window where a line would have posted — let any create land.
        const line15 = await watch(() => linesFor(card15.id).length, { ms: 1500 });

        // No public line: the usage card says each verdict once.
        const cardText15 = () => (ui.chat.element?.querySelector(`.message[data-message-id="${card15.id}"]`)?.textContent ?? '').replace(/\s+/g, ' ');
        ok('15a. no public verdict card posts — the usage card carries both verdicts (v1.19.0\'s lines retired 2026-09-18)',
          !!done15 && !line15 && (linesFor(card15.id).length === 0) && /vs DC 15/.test(cardText15()) && /half damage/.test(cardText15()),
          `lines=${linesFor(card15.id).length} card="${cardText15().slice(0, 240)}"`);

        // 15c — a render storm posts nothing either.
        for (let i = 0; i < 3; i++) { try { ui.chat?.updateMessage?.(card15); } catch {} }
        const stormLine15 = await watch(() => linesFor(card15.id).length, { ms: 1500 });
        ok('15c. re-renders post nothing', !stormLine15 && (linesFor(card15.id).length === 0), `lines=${linesFor(card15.id).length}`);

        // 15d — legendary resistance flips the failure AFTER it landed: the entry flips forced
        // and the usage card reads the corrected verdict — "(legendary resistance)".
        const entry15 = card15.getFlag(MOD, 'saves')?.targets?.find(t => t.uuid === victim.uuid);
        const rollMsg15 = entry15?.rollMessageId ? game.messages.get(entry15.rollMessageId) : null;
        if (rollMsg15) await rollMsg15.update({ 'system.resisted': true });
        const flipped15 = await until(() => {
          const t = card15.getFlag(MOD, 'saves')?.targets?.find(x => x.uuid === victim.uuid);
          return ((t?.outcome === 'saved') && (t?.forced === true)) ? t : null;
        }, { timeout: 10000, label: '15d the LR flip recorded' });
        const corrected = await until(() => /legendary resistance/.test(cardText15()) ? cardText15() : null, { timeout: 6000, label: '15d the card reads the corrected verdict' });
        ok('15d. the LR flip corrects the verdict ON THE CARD — "(legendary resistance)" in the victim\'s row — and posts no card',
          !!rollMsg15 && !!flipped15 && !!corrected && (linesFor(card15.id).length === 0),
          `flipped=${flipped15?.outcome}/${flipped15?.forced} lines=${linesFor(card15.id).length} card="${(corrected ?? cardText15()).slice(0, 240)}"`);
      } finally {
        await set('saveTimer', 0);
        await victim.update({ 'system.resources.legres.max':
          priorActor[victim.id]['system.resources.legres.max'],
          'system.resources.legres.spent': priorActor[victim.id]['system.resources.legres.spent'] });
      }
    });

    // ============================================== 16. the dead-target gate
    // Dead (status, or an NPC at 0 HP) is skipped at stamp and adoption; all-dead stamps nothing;
    // a dying PC (character at 0 HP) still rolls.
    if (want(16)) await section(16, async () => {
      // Both fixtures stand up again however the section ends.
      try {
        // 16a — mixed: the dead NPC is dropped from the rows, the living one is demanded.
        await saveBonus(victim, '');
        await saveBonus(shielder, '');
        await victim.update({ 'system.attributes.hp.value': 0 });   // npc at 0 ⇒ dead
        await healFull(shielder);
        target(victimToken, shielderToken);
        const before16a = snap();
        const use16a = await saveActivity().use({}, { configure: false }, {});
        const card16a = use16a?.message instanceof ChatMessage ? use16a.message : null;
        const flag16a = await until(() => card16a?.getFlag(MOD, 'saves'), { timeout: 6000, label: '16a the living target stamped' });
        ok('16a. mixed dead+living — only the living target is stamped',
          !!flag16a && (flag16a.targets.length === 1)
            && (flag16a.targets[0].uuid === shielder.uuid),
          `targets=${JSON.stringify(flag16a?.targets?.map(t => t.name))}`);
        await ChatMessage.deleteDocuments(fresh(before16a).map(m => m.id)).catch(() => {});

        // 16b — all dead: NO saves flag, NO auto damage roll, fully native.
        await shielder.update({ 'system.attributes.hp.value': 0 });
        // The Shielder is a CHARACTER: at 0 HP it is dying, not dead, and nothing in the family marks it Dead
        // (Combat Plus writes no status on a character), so the section presses the status itself.
        if (!shielder.statuses?.has?.('dead')) await shielder.toggleStatusEffect('dead', { active: true, overlay: true });
        await until(() => shielder.statuses?.has?.('dead') && victim.statuses?.has?.('dead'), { timeout: 4000, label: '16b both targets marked dead' });
        target(victimToken, shielderToken);
        const before16b = snap();
        const use16b = await saveActivity().use({}, { configure: false }, {});
        const card16b = use16b?.message instanceof ChatMessage ? use16b.message : null;
        // The window for a WRONG stamp or an auto-roll at the dead.
        const autoDmg16bOf = () => fresh(before16b).find(m =>
          (m.type === 'damage')
          && (m._source.system?.origin === card16b?.id));
        const stray16b = await watch(() => card16b?.getFlag(MOD, 'saves') || autoDmg16bOf(), { ms: 2500 });
        const autoDmg16b = autoDmg16bOf();
        ok('16b. every target dead — no demand stamps and no damage auto-rolls (fully native)',
          !!card16b && !stray16b && !card16b.getFlag(MOD, 'saves') && !autoDmg16b,
          `flag=${!!card16b?.getFlag(MOD, 'saves')} autoDmg=${!!autoDmg16b} targets=${JSON.stringify(card16b?.getFlag(MOD, 'saves')?.targets?.map(t => t.name))} hp=${victim.system.attributes.hp.value}/${shielder.system.attributes.hp.value} types=${victim.type}/${shielder.type} dead=${victim.statuses?.has?.('dead')}/${shielder.statuses?.has?.('dead')}`);
        await ChatMessage.deleteDocuments(fresh(before16b).map(m => m.id)).catch(() => {});

        // 16c: a dying PC (character, 0 HP) is still demanded.
        if (pcActor) {
          priorActor[pcActor.id] = {
            ...(priorActor[pcActor.id] ?? {}),
            'system.attributes.hp.value': pcActor.system._source.attributes.hp.value
          };
          const pcToken16 = await mkToken(pcActor, 1600);
          await pcActor.update({ 'system.attributes.hp.value': 0 });
          // ⚠ Construct "dying": this world's stack may mark the drop DEAD, and the gate honors that
          // status, so strip it. The section means a 0-HP character WITHOUT the dead status.
          // Soft: the world may not mark the drop at all.
          await until(() => pcActor.statuses?.has?.('dead'), { timeout: 4000 }).catch(() => null);
          const marked16 = pcActor.effects.filter(e => e.statuses?.has?.('dead'));
          if (marked16.length) {
            await pcActor.deleteEmbeddedDocuments('ActiveEffect', marked16.map(e => e.id))
              .catch(() => {});
          }
          target(pcToken16);
          const before16c = snap();
          const use16c = await saveActivity().use({}, { configure: false }, {});
          const card16c = use16c?.message instanceof ChatMessage ? use16c.message : null;
          const flag16c = await until(() => card16c?.getFlag(MOD, 'saves'), { timeout: 6000, label: '16c the dying PC stamped' });
          ok('16c. a DYING PC (0 HP character) is still demanded — the gate is dead-only',
            !!flag16c && (flag16c.targets.length === 1)
              && (flag16c.targets[0].uuid === pcActor.uuid),
            `targets=${JSON.stringify(flag16c?.targets?.map(t => t.name))}`);
          await ChatMessage.deleteDocuments(fresh(before16c).map(m => m.id)).catch(() => {});
          await pcActor.update({ 'system.attributes.hp.value':
            priorActor[pcActor.id]['system.attributes.hp.value'] });
        } else {
          skips.push('16c — no BTB Test PC Attacker fixture; run smoke-bythebooks first');
        }
      } finally {
        // Dead goes before the Hit Points (the family's dead contract); the pressed status is not dnd5e's, so the heal leaves it.
        const dead16 = shielder.effects.filter(e => e.statuses?.has?.('dead')).map(e => e.id);
        if (dead16.length) await shielder.deleteEmbeddedDocuments('ActiveEffect', dead16).catch(() => {});
        await healFull(victim);
        await healFull(shielder);
      }
    });

    // ============================================== 17. the bash shape
    // A feat's save activity with a bound status effect is a full customer of this machine; this
    // pins it for the world's Shield Master (tools/content/fix-shield-master.mjs).
    if (want(17)) await section(17, async () => {
      const EFF_BASH = 'bfbashprone00000';
      const [bashItem] = await npc.createEmbeddedDocuments('Item', [{
        name: 'BTB Test Bash', type: 'feat',
        system: {
          type: { value: 'feat' },
          activities: {
            bfbashact0000000: {
              _id: 'bfbashact0000000', type: 'save',
              activation: { type: 'bonus', override: false },
              consumption: { targets: [] },
              damage: { onSave: 'none', parts: [] },
              effects: [{ _id: EFF_BASH, onSave: false }],
              save: { ability: ['con'], dc: { calculation: '', formula: '15' } },
              target: { override: false, prompt: true,
                affects: { type: 'creature', count: '1', choice: false } }
            }
          }
        },
        effects: [
          { _id: EFF_BASH, name: 'BTB Bashed Prone', transfer: false, disabled: false,
            img: 'icons/svg/falling.svg', statuses: ['prone'],
            description: '<p>Knocked Prone (BTB bash fixture).</p>' }
        ]
      }]);
      created.items.push({ actorId: npc.id, id: bashItem.id });
      const bashActivity = () => npc.items.get(bashItem.id).system.activities.get('bfbashact0000000');

      await set('saveTimer', 2);
      // The clock, the Prone and the bonuses go back however the section ends.
      try {
        // 17a: the failure presses Prone, receipted.
        await saveBonus(victim, '-30');
        await healFull(victim);
        if (victim.statuses?.has?.('prone')) await victim.toggleStatusEffect('prone', { active: false });
        target(victimToken);
        const use17a = await bashActivity().use({}, { configure: false }, {});
        const card17a = use17a?.message instanceof ChatMessage ? use17a.message : null;
        const done17a = await until(() => {
          const f = card17a?.getFlag(MOD, 'saves');
          return f?.targets?.every(t => t.done && t.applied) ? f : null;
        }, { timeout: 25000, label: '17a the bash applied' });
        await until(() => victim.statuses?.has?.('prone') && card17a?.getFlag(MOD, 'effectReceipt')?.targets?.some(t => (t.uuid === victim.uuid)
          && t.effects.some(e => e.name === 'BTB Bashed Prone')), { timeout: 6000, label: '17a Prone pressed and receipted' });
        const receipt17a = card17a?.getFlag(MOD, 'effectReceipt');
        ok('17a. a FEAT save activity with a bound status effect presses Prone on the failure, receipted',
          !!done17a && victim.statuses?.has?.('prone')
            && !!receipt17a?.targets?.some(t => (t.uuid === victim.uuid)
              && t.effects.some(e => e.name === 'BTB Bashed Prone')),
          `prone=${victim.statuses?.has?.('prone')} receipt=${!!receipt17a}`);

        // 17b: the pass leaves the target standing.
        await saveBonus(shielder, '+30');
        await healFull(shielder);
        if (shielder.statuses?.has?.('prone')) await shielder.toggleStatusEffect('prone', { active: false });
        target(shielderToken);
        const use17b = await bashActivity().use({}, { configure: false }, {});
        const card17b = use17b?.message instanceof ChatMessage ? use17b.message : null;
        const done17b = await until(() => {
          const f = card17b?.getFlag(MOD, 'saves');
          return f?.targets?.every(t => t.done && t.applied) ? f : null;
        }, { timeout: 25000, label: '17b the pass applied' });
        // The window for a WRONG press on the pass.
        const prone17b = await watch(() => shielder.statuses?.has?.('prone'), { ms: 1200 });
        const entry17b = done17b?.targets?.find(t => t.uuid === shielder.uuid);
        ok('17b. the pass stays standing and the card\'s verdict reads saved (no public line since 2026-09-18)',
          !!done17b && !prone17b && !shielder.statuses?.has?.('prone') && (entry17b?.outcome === 'saved'),
          `prone=${shielder.statuses?.has?.('prone')} outcome=${entry17b?.outcome}`);
      } finally {
        await set('saveTimer', 0);
        if (victim.statuses?.has?.('prone')) await victim.toggleStatusEffect('prone', { active: false });
        await saveBonus(victim, '');
        await saveBonus(shielder, '');
      }
    });

    // ============================================== 19. the save gate
    // The demand opens dnd5e's own dialog; the save table's bends are the section, the net the
    // default, a save the rules fail a fourth button. A sheet save meets the same gate.
    if (want(19)) await section(19, async () => {
      const ledger = globalThis.__bfHookLedger ?? null;
      const count = name => ledger?.[name] ?? 0;
      const setStatus = async (actor, id, on) => {
        const carriers = actor.effects.filter(e => e.statuses?.has?.(id));
        if (on && !carriers.length) {
          const eff = await ActiveEffect.implementation.fromStatusEffect(id);
          await ActiveEffect.implementation.create(eff.toObject(), { parent: actor, keepId: true });
        } else if (!on && carriers.length) {
          await actor.deleteEmbeddedDocuments('ActiveEffect', carriers.map(e => e.id));
        }
        // Soft: setStatus runs in the finally too, and the dialog's own section reads the status next.
        await until(() => !!actor.statuses?.has?.(id) === on, { timeout: 4000 }).catch(() => null);
      };
      const entryName = card => card.getFlag(MOD, 'saves')?.targets?.[0]?.name ?? 'BTB Test Victim';
      const dialogFor = name => until(() => savePopups().find(p => demandText(p).includes(name)), { timeout: 12000, label: `§19 the save dialog for ${name}` });
      const sectionText = dlg => (dlg?.querySelector('[data-bf-reminder]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const defaultOf = dlg => dlg?.querySelector('button[autofocus]')?.dataset?.action ?? null;
      const saveRollsIn = before => fresh(before).filter(m => m.type === 'save');
      const castDex = async () => {
        target(victimToken);
        const use = await dexActivity().use({}, { configure: false }, {});
        const card = use?.message instanceof ChatMessage ? use.message : null;
        if (card) await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '§19 the Dexterity demand stamped' });
        return card;
      };

      // The clock, the pressed statuses and the chips go back however the section ends.
      try {
        // 19a–d: Restrained bends a Dexterity save — the section, the default, the record.
        await clearChips();
        await saveBonus(victim, '');
        await healFull(victim);
        await setStatus(victim, 'restrained', true);
        const firedBefore = count('dnd5e.preRollSavingThrow');
        const cardA = await castDex();
        if (!cardA) throw new Error('section 19 dex cast produced no card');
        const dlgA = await dialogFor(entryName(cardA));
        const textA = sectionText(dlgA);
        ok('19a. a Restrained roller meets the gate INSIDE the system dialog: the demand fieldset above, the section below, "1 Modifier — Net Disadvantage"',
          !!dlgA && !!dlgA.querySelector('[data-bf-save-demand]') && /Restrained/.test(textA)
            && /1 Modifier — Net Disadvantage/.test(textA)
            && !!dlgA.querySelector('input[name="roll.0.situational"]'),
          `dialog=${!!dlgA} demand=${!!dlgA?.querySelector('[data-bf-save-demand]')} section="${textA.slice(0, 160)}"`);
        ok('19b. the highlighted default is the net — Disadvantage (the user\'s ruling, on the save hook)',
          defaultOf(dlgA) === 'disadvantage', `default=${defaultOf(dlgA)}`);
        ok('19c. the registration FIRED (§11): dnd5e.preRollSavingThrow moved',
          count('dnd5e.preRollSavingThrow') > firedBefore,
          `before=${firedBefore} after=${count('dnd5e.preRollSavingThrow')}`);
        dlgA?.querySelector('button[data-action="normal"]')?.click();   // against the net, on purpose
        await until(() => entryOf(cardA, victim)?.done, { timeout: 15000, label: '19d the flat roll folded' });
        const entryA = entryOf(cardA, victim);
        const rollA = entryA?.rollMessageId ? game.messages.get(entryA.rollMessageId) : null;
        const remA = rollA?.getFlag(MOD, 'reminder');
        ok('19d. the save message carries the gate\'s record — net Disadvantage, rolled flat, NOT honoured — and answers the demand exactly as any roll does',
          !!remA && (remA.net === 'disadvantage') && (remA.mode === 'normal') && (remA.honoured === false)
            && (remA.sources?.[0]?.kind === 'condition') && (rollA?.getFlag(MOD, 'respondsTo') === cardA.id)
            && (rollA?.rolls?.[0]?.options?.target === 15),
          `record=${JSON.stringify(remA)} respondsTo=${rollA?.getFlag(MOD, 'respondsTo')}`);
        await until(() => entryOf(cardA, victim)?.applied, { timeout: 12000, label: '§19 the Restrained demand applied' });
        await setStatus(victim, 'restrained', false);

        // 19e–h: Paralyzed cannot succeed on Dexterity — Fails, no dice, recorded, consequences.
        await clearChips();
        await saveBonus(victim, '+30');        // a ROLLED save would succeed: only the button can fail it
        await healFull(victim);
        await setStatus(victim, 'paralyzed', true);
        const beforeE = snap();
        const cardE = await castDex();
        if (!cardE) throw new Error('section 19 paralyzed cast produced no card');
        const dlgE = await dialogFor(entryName(cardE));
        const failsE = dlgE?.querySelector('[data-bf-fails]');
        const textE = sectionText(dlgE);
        ok('19e. a Paralyzed roller\'s Dexterity save cannot succeed: the section says so, Fails is a fourth button and the default',
          !!failsE && failsE.hasAttribute('autofocus') && /cannot succeed/.test(textE) && /Net Fails/.test(textE)
            && (dlgE.querySelectorAll('nav.dialog-buttons button').length === 4),
          `fails=${!!failsE} default=${defaultOf(dlgE)} buttons=${dlgE?.querySelectorAll('nav.dialog-buttons button').length} section="${textE.slice(0, 160)}"`);
        failsE?.click();
        const entryE = await until(() => { const e = entryOf(cardE, victim); return e?.done ? e : null; }, { timeout: 8000, label: '19f Fails recorded' });
        ok('19f. Fails records the failure with NO dice: failed, automatically, by Paralyzed, no roll message anywhere',
          (entryE?.outcome === 'failed') && (entryE?.autoFailed === true) && /Paralyzed/.test(entryE?.autoFailedBy ?? '')
            && !entryE?.rollMessageId && (saveRollsIn(beforeE).length === 0),
          `entry=${JSON.stringify(entryE)} saveRolls=${saveRollsIn(beforeE).length}`);
        await until(() => entryOf(cardE, victim)?.applied, { timeout: 12000, label: '19g the automatic failure applied' });
        ok('19g. the consequences follow the automatic failure exactly as a rolled one: both chips, full damage owed',
          !!chipOn(victim, 'BTB Poisoned') && !!chipOn(victim, 'BTB Splashed') && (entryOf(cardE, victim)?.applied === true),
          `chips=[${CHIP_NAMES.map(n => !!chipOn(victim, n)).join()}]`);
        const cardTextE = () => (ui.chat.element?.querySelector(`.message[data-message-id="${cardE.id}"] .bythebooks-saves`)?.textContent ?? '').replace(/\s+/g, ' ');
        const lineE = await until(() => /cannot succeed/.test(cardTextE()) ? cardTextE() : null, { timeout: 6000, label: '19h the card line drawn' });
        ok('19h. the card\'s own line prints the condition where the total would be (no die rolled, so no summary row to carry it)',
          !!lineE && /Paralyzed/.test(lineE) && !/null/.test(lineE), (lineE ?? cardTextE()).slice(0, 160));

        // 19i: the buzzer on a save that cannot succeed records the failure rather than rolling.
        await clearChips();
        await healFull(victim);
        await set('saveTimer', 2);
        const beforeI = snap();
        const cardI = await castDex();
        if (!cardI) throw new Error('section 19 buzzer cast produced no card');
        const dlgI = await dialogFor(entryName(cardI));
        const entryI = await until(() => { const e = entryOf(cardI, victim); return e?.done ? e : null; }, { timeout: 15000, label: '19i the buzzer recorded the failure' });
        const closedI = await until(() => !document.contains(dlgI), { timeout: 5000, label: '19i the open dialog closed' });   // the close rides the fold's update — a beat behind the flag
        ok('19i. the buzzer takes the same path — timed out, automatically failed, no die rolled — and the open dialog closed',
          (entryI?.autoFailed === true) && (entryI?.timedOut === true) && (entryI?.outcome === 'failed')
            && (saveRollsIn(beforeI).length === 0) && !!dlgI && closedI,
          `entry=${JSON.stringify(entryI)} saveRolls=${saveRollsIn(beforeI).length} dialogWasOpen=${!!dlgI} stillOpen=${!!dlgI && document.contains(dlgI)}`);
        await until(() => entryOf(cardI, victim)?.applied, { timeout: 12000, label: '§19 the timed-out failure applied' });
        await set('saveTimer', 0);

        // 19j: a sheet save meets the same gate; Fails posts the record as a card and rolls nothing.
        const beforeJ = snap();
        void victim.rollSavingThrow({ ability: 'dex' }, {}, {});
        const dlgJ = await until(() => [...foundry.applications.instances.values()].map(app => app.element)
          .find(el => el?.querySelector?.('[data-bf-fails]') && !el.querySelector('[data-bf-save-demand]')), { timeout: 6000, label: '19j the sheet save dialog with Fails' });
        dlgJ?.querySelector('[data-bf-fails]')?.click();
        const cardJ = await until(() => fresh(beforeJ).find(m => m.getFlag(MOD, 'saveAutoFail')), { timeout: 6000, label: '19j the Fails record card' });
        ok('19j. a sheet save meets the same gate, and Fails with no demand posts the record as a card — no roll',
          !!dlgJ && !!cardJ && (cardJ.getFlag(MOD, 'saveAutoFail')?.ability === 'dex')
            && /Paralyzed/.test(cardJ.content ?? '') && (saveRollsIn(beforeJ).length === 0),
          `dialog=${!!dlgJ} card=${!!cardJ} flag=${JSON.stringify(cardJ?.getFlag(MOD, 'saveAutoFail'))}`);

        // 19k: a Constitution save under Paralyzed meets no row — no section, the plain dialog.
        await clearChips();
        await saveBonus(victim, '');
        await healFull(victim);
        target(victimToken);
        const useK = await saveActivity().use({}, { configure: false }, {});
        const cardK = useK?.message instanceof ChatMessage ? useK.message : null;
        if (cardK) await until(() => cardK.getFlag(MOD, 'saves'), { timeout: 15000, label: '19k the Constitution demand stamped' });
        const dlgK = await dialogFor(entryName(cardK));
        ok('19k. a Constitution save shows nothing — the table is Strength and Dexterity only; the demand stands, no section, three buttons',
          !!dlgK && !dlgK.querySelector('[data-bf-reminder]') && !dlgK.querySelector('[data-bf-fails]')
            && !!dlgK.querySelector('[data-bf-save-demand]')
            && (dlgK.querySelectorAll('nav.dialog-buttons button').length === 3),
          `dialog=${!!dlgK} section=${!!dlgK?.querySelector('[data-bf-reminder]')} buttons=${dlgK?.querySelectorAll('nav.dialog-buttons button').length}`);
        dlgK?.querySelector('button[data-action="normal"]')?.click();
        await until(() => entryOf(cardK, victim)?.applied, { timeout: 12000, label: '19k the Constitution demand applied' });
      } finally {
        await set('saveTimer', 0);
        await setStatus(victim, 'restrained', false);
        await setStatus(victim, 'paralyzed', false);
        await clearChips();
      }
    });

    // ============================================== 20. a save press
    // The PHB's Web carries no effect; SAVE_PRESSES names the status. ⚠ Every row is cast bare under
    // its own name and its status must land: a row this section does not turn green is never read.
    if (want(20)) await section(20, async () => {
      const PRESSES = [['Web', 'restrained', 'a'], ['Grease', 'prone', 'c'], ['Sleet Storm', 'prone', 'd']];
      await clearChips();
      await saveBonus(victim, '-30');
      await victim.update({ 'system.abilities.dex.save.roll.bonus': '-30' });   // all three are DEXTERITY saves
      await healFull(victim);
      // The Dexterity bonus (no teardown row holds it) and any press left standing go back however the section ends.
      try {
        for (const [itemName, status, letter] of PRESSES) {
          const stray = victim.effects.filter(e => e.statuses?.has?.(status));
          if (stray.length) await victim.deleteEmbeddedDocuments('ActiveEffect', stray.map(e => e.id));
          const actId = `bfpress${letter}000000000`.slice(0, 16);
          const [pressItem] = await npc.createEmbeddedDocuments('Item', [{
            name: itemName, type: 'spell',
            system: { level: 2, school: 'con', properties: ['vocal'], duration: { units: 'hour', value: 1 },
              target: { affects: { type: 'creature', count: '2', choice: false } }, range: { value: '60', units: 'ft' },
              method: 'spell', prepared: 1, identifier: itemName.toLowerCase().replace(/\s+/g, '-'),
              activities: { [actId]: { _id: actId, type: 'save', activation: { type: 'action', override: false },
                consumption: { targets: [], spellSlot: false }, damage: { onSave: 'full', parts: [] }, effects: [],
                save: { ability: ['dex'], dc: { calculation: '', formula: '15' } }, target: { override: false, prompt: true } } } }
          }]);
          created.items.push({ actorId: npc.id, id: pressItem.id });
          target(victimToken);
          const useW = await npc.items.get(pressItem.id).system.activities.get(actId).use({}, { configure: false }, {});
          const cardW = useW?.message instanceof ChatMessage ? useW.message : null;
          if (!cardW) throw new Error(`section 20 ${itemName} cast produced no card`);
          await until(() => cardW.getFlag(MOD, 'saves'), { timeout: 15000, label: `20${letter} the ${itemName} demand stamped` });
          const dlgW = await until(() => savePopups().find(p => demandText(p).includes(cardW.getFlag(MOD, 'saves')?.targets?.[0]?.name ?? 'Hobgoblin')), { timeout: 6000, label: `20${letter} the ${itemName} ask` });
          dlgW?.querySelector('button[data-action="normal"]')?.click();
          await until(() => entryOf(cardW, victim)?.applied, { timeout: 15000, label: `20${letter} the ${itemName} failure applied` });
          const pressed = victim.effects.find(e => e.statuses?.has?.(status));
          const rr = cardW.getFlag(MOD, 'effectReceipt')?.targets?.find(t => t.uuid === victim.uuid);
          ok(`20${letter}. ${itemName} fails the victim, and the module presses ${status} — the standard status, the caster as origin, receipted on the demand card`,
            (entryOf(cardW, victim)?.outcome === 'failed') && !!pressed && (pressed.origin === npc.uuid)
              && !!rr?.effects?.some(e => e.id === pressed.id),
            `outcome=${entryOf(cardW, victim)?.outcome} ${status}=${!!pressed} origin=${pressed?.origin} receipt=${JSON.stringify(rr?.effects?.map(e => e.name))}`);
          if (itemName === 'Web') {
            const cardEl = await until(() => [...(document.querySelector(`[data-message-id="${cardW.id}"]`)?.querySelectorAll('button') ?? [])].find(b => /Revert/.test(b.textContent ?? '')), { timeout: 4000, label: '20b the revert drawn on the card' });
            ok('20b. the card carries the revert for it', !!cardEl, `revert=${!!cardEl}`);
          }
          if (pressed) await victim.deleteEmbeddedDocuments('ActiveEffect', [pressed.id]).catch(() => {});
          await npc.deleteEmbeddedDocuments('Item', [pressItem.id]).catch(() => {});
        }
      } finally {
        await saveBonus(victim, '');
        await victim.update({ 'system.abilities.dex.save.roll.bonus': '' });
        const leftPressed = victim.effects.filter(e => (e.origin === npc.uuid) && ['restrained', 'prone'].some(s => e.statuses?.has?.(s)));
        if (leftPressed.length) await victim.deleteEmbeddedDocuments('ActiveEffect', leftPressed.map(e => e.id)).catch(() => {});
      }
    });

    // ============================================== 21. Evasion
    if (want(21)) await section(21, async () => {
      const rogue = game.actors.getName('BTB Test Rogue');
      if (!rogue?.items.some(i => i.name === 'Evasion')) { skips.push('§21: BTB Test Rogue with Evasion missing — run fixture-suite'); }
      else {
        const rogueToken = await mkToken(rogue, 800);
        priorActor[rogue.id] = { 'system.attributes.hp.value': rogue.system._source.attributes.hp.value,
          'system.abilities.dex.save.roll.bonus': rogue.system._source.abilities?.dex?.save?.roll?.bonus ?? '' };
        const rMax = rogue.system.attributes.hp.max;
        const damageFor = card => game.messages.contents.find(m => (m.type === 'damage') && (m._source.system?.origin === card?.id));
        const heal = () => rogue.update({ 'system.attributes.hp.value': rMax });
        const runOne = async bonus => {
          await rogue.update({ 'system.abilities.dex.save.roll.bonus': bonus });
          await heal();
          target(rogueToken);
          const use = await dexActivity().use({}, { configure: false }, {});
          const card = use?.message instanceof ChatMessage ? use.message : null;
          if (card) await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: `§21 the rogue's demand stamped (bonus ${bonus})` });
          const dlg = await until(() => savePopups().find(p => demandText(p).includes(card?.getFlag(MOD, 'saves')?.targets?.[0]?.name ?? 'BTB Test Rogue')), { timeout: 6000, label: `§21 the rogue's ask (bonus ${bonus})` });
          dlg?.querySelector('button[data-action="normal"]')?.click();
          await until(() => entryOf(card, rogue)?.applied, { timeout: 15000, label: `§21 the rogue's verdict applied (bonus ${bonus})` });
          const dmg = await until(() => damageFor(card)?.getFlag(MOD, 'receipt')?.targets?.find(x => x.uuid === rogue.uuid) ? damageFor(card) : null, { timeout: 10000, label: `§21 the rogue's damage receipted (bonus ${bonus})` });
          return { card, entry: entryOf(card, rogue), receipt: dmg?.getFlag(MOD, 'receipt')?.targets?.find(x => x.uuid === rogue.uuid) };
        };
        const a = await runOne('+30');
        ok('23a. a SUCCESS with Evasion takes NO damage — applied at ×0, receipted and said, the row says Evasion',
          (a.entry?.outcome === 'saved') && (a.entry?.evasion === true) && (a.receipt?.taken === 0) && (a.receipt?.multiplier === 0)
            && /Evasion/.test(a.receipt?.note ?? '') && (rogue.system.attributes.hp.value === rMax),
          `outcome=${a.entry?.outcome} evasion=${a.entry?.evasion} taken=${a.receipt?.taken} mult=${a.receipt?.multiplier} note="${a.receipt?.note}" hp=${rogue.system.attributes.hp.value}/${rMax}`);
        const b = await runOne('-30');
        ok('23b. a FAILURE with Evasion takes HALF — 5 of the flat 10',
          (b.entry?.outcome === 'failed') && (b.entry?.evasion === true) && (b.receipt?.taken === 5) && (b.receipt?.multiplier === 0.5)
            && /Evasion/.test(b.receipt?.note ?? ''),
          `outcome=${b.entry?.outcome} taken=${b.receipt?.taken} mult=${b.receipt?.multiplier} note="${b.receipt?.note}"`);
        // Incapacitated: no Evasion — a failure takes the full 10.
        const eff = await ActiveEffect.implementation.fromStatusEffect('incapacitated');
        const [inc] = await ActiveEffect.implementation.create(eff.toObject(), { parent: rogue, keepId: true }).then(e => [e]);
        // The rogue stands up again however the section ends: no teardown row lifts Incapacitated.
        try {
          const c = await runOne('-30');
          ok('23c. not while Incapacitated — the failure takes the full 10',
            (c.entry?.outcome === 'failed') && !c.entry?.evasion && (c.receipt?.taken === 10),
            `evasion=${c.entry?.evasion} taken=${c.receipt?.taken}`);
        } finally {
          await rogue.deleteEmbeddedDocuments('ActiveEffect', [inc.id]).catch(() => {});
          await heal();
        }
      }
    });

    // ============================================== 22. the platform's own mode, explained
    // An item effect on `system.abilities.<ab>.save.roll.mode` sets the dialog's mode; the gate
    // names each such effect's ITEM in a box. The dialog's own default is left alone.
    if (want(22)) await section(22, async () => {
      const sectionText = dlg => (dlg?.querySelector('[data-bf-reminder]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const defaultOf = dlg => dlg?.querySelector('button[autofocus]')?.dataset?.action ?? null;
      const sheetDialog = () => [...foundry.applications.instances.values()].map(app => app.element)
        .find(el => el?.querySelector?.('[data-application-part="buttons"]') && !el.querySelector('[data-bf-save-demand]')
          && /Saving Throw/i.test(el.querySelector('h1, .window-title')?.textContent ?? ''));
      const formulaOf = dlg => (dlg?.querySelector('.formula, [data-application-part="formulas"]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      // Wait for the dialog to actually leave: a cold client closes it slower than a fixed pause.
      // The next step opens its own dialog and waits for that one.
      const closeVia = async (dlg, action) => { dlg?.querySelector(`button[data-action="${action}"]`)?.click(); await until(() => !dlg?.isConnected, { timeout: 8000, label: `§22 the dialog closed by ${action}` }); };
      // The application behind a dialog element (the gate's record rides its options).
      const appOf = el => [...foundry.applications.instances.values()].find(app => app.element === el) ?? null;
      // Diagnostic only: the Reminder Sources list as the world holds it (its `effect` kind is the switch).
      const kindsOn = (() => { try { return String(game.settings.get(MOD, 'reminderList') ?? ''); } catch { return '(unreadable)'; } })();
      const [trinket] = await victim.createEmbeddedDocuments('Item', [{
        name: 'BTB Test Amulet', type: 'equipment',
        system: { equipped: true, type: { value: 'trinket' } },
        effects: [{ name: 'BTB Test Amulet', transfer: true, disabled: false,
          changes: [{ key: 'system.abilities.dex.save.roll.mode', mode: 2, value: '1' }] }]
      }]);
      try {
        // The amulet's transferred change is on the sheet before the roll reads it.
        await until(() => victim.appliedEffects?.some(e => e.name === 'BTB Test Amulet'), { label: "§22 the amulet's effect applied" });
        // 22a: a Dexterity save — the platform opens at Advantage, and the section says who.
        void victim.rollSavingThrow({ ability: 'dex' }, {}, {});
        const dlgA = await until(() => { const d = sheetDialog(); return d?.querySelector('[data-bf-reminder]') ? d : null; }, { timeout: 6000, label: '22a the Dexterity dialog drew its section' });
        const textA = sectionText(dlgA);
        ok('22a. a Dexterity save opens at the platform\'s Advantage AND the section names the trinket as the one Advantage box, the default on Advantage',
          !!dlgA && /BTB Test Amulet/.test(textA) && /1 Modifier/.test(textA) && /Advantage/.test(textA)
            && /Dexterity saving throws to roll with Advantage/.test(textA) && (defaultOf(dlgA) === 'advantage'),
          `dialog=${!!dlgA} reminderList="${kindsOn}" default=${defaultOf(dlgA)} formula="${formulaOf(dlgA)}" text="${textA.slice(0, 220)}"`);
        await closeVia(dlgA, 'normal');

        // 22b: a Wisdom save — the key names the ability; no section, the plain dialog.
        void victim.rollSavingThrow({ ability: 'wis' }, {}, {});
        const dlgB = await until(() => { const dd = sheetDialog(); return /Wisdom/i.test(dd?.querySelector('h1, .window-title')?.textContent ?? '') ? dd : null; }, { timeout: 6000, label: '22b the Wisdom dialog' });
        // The gate's record is set before the dialog renders; the section is drawn only when it has a source.
        await until(() => {
          const app = appOf(dlgB);
          const g = app?.options?.bfReminder;
          return !app || !g || !((g.sources?.length > 0) || g.sneak) || app.element?.querySelector('[data-bf-reminder]');
        }, { label: '22b the gate drawn in the roll dialog' });
        ok('22b. a Wisdom save shows nothing — the effect names Dexterity, and a mode change on another ability is not this roll\'s',
          !!dlgB && !dlgB.querySelector('[data-bf-reminder]'),
          `dialog=${!!dlgB} section=${!!dlgB?.querySelector('[data-bf-reminder]')} title="${dlgB?.querySelector('h1, .window-title')?.textContent?.trim()}" text="${sectionText(dlgB).slice(0, 200)}"`);
        await closeVia(dlgB, 'normal');

        // 22c: Restrained beside it — the status row's Disadvantage against the trinket's
        // Advantage nets Normal, both boxes under one header, the default on Normal.
        const eff = await ActiveEffect.implementation.fromStatusEffect('restrained');
        await ActiveEffect.implementation.create(eff.toObject(), { parent: victim, keepId: true });
        await until(() => victim.statuses?.has?.('restrained'), { label: '22c Restrained on the victim' });
        void victim.rollSavingThrow({ ability: 'dex' }, {}, {});
        const dlgC = await until(() => { const d = sheetDialog(); return d?.querySelector('[data-bf-reminder]') ? d : null; }, { timeout: 6000, label: '22c the Dexterity dialog drew its section' });
        const textC = sectionText(dlgC);
        ok('22c. Restrained beside the trinket: two boxes, one Advantage and one Disadvantage, netting Normal — the default on Normal',
          !!dlgC && /2 Modifiers/.test(textC) && /Restrained/.test(textC) && /BTB Test Amulet/.test(textC) && (defaultOf(dlgC) === 'normal'),
          `default=${defaultOf(dlgC)} text="${textC.slice(0, 260)}"`);
        await closeVia(dlgC, 'normal');
      } finally {
        const carriers = victim.effects.filter(e => e.statuses?.has?.('restrained'));
        if (carriers.length) await victim.deleteEmbeddedDocuments('ActiveEffect', carriers.map(e => e.id)).catch(() => {});
        if (trinket && victim.items.get(trinket.id)) await victim.deleteEmbeddedDocuments('Item', [trinket.id]).catch(() => {});
      }
    });

    // ============================================== 23. the SAVES facet — Aura of Purity, Circle's Power
    if (want(23)) await section(23, async () => {
      const lists = snapshotSettings(['reminderList', 'effectList']);
      const priorLists = lists.prior;
      const failEff = npc.items.get(poisonItem.id).effects.get(EFF_FAIL);
      const priorStatuses = [...(failEff?.statuses ?? [])];
      const wards = [];
      try {
        await clearChips();
        await saveBonus(victim, '');
        await healFull(victim);
        if (!/\beffect\b/.test(priorLists.reminderList)) await set('reminderList', `${priorLists.reminderList}, effect`);
        await set('effectList', `${priorLists.effectList}, Aura of Purity, Circle's Power`);
        const sectionText = dlg => (dlg?.querySelector('[data-bf-reminder]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const defaultOf = dlg => dlg?.querySelector('button[autofocus]')?.dataset?.action ?? null;
        // The demand names the TOKEN (the fixture's is "Hobgoblin"), so look the dialog up by the card's own entry name.
        const dialogFor = card => until(() => savePopups().find(p => demandText(p).includes(card?.getFlag(MOD, 'saves')?.targets?.[0]?.name ?? ' ')), { timeout: 6000, label: '§23 the save dialog' });
        const ward = async name => { const [e] = await victim.createEmbeddedDocuments('ActiveEffect', [{ name, img: 'icons/svg/aura.svg', transfer: false, disabled: false }]); wards.push(e); return e; };
        const castDexAt = async () => {
          target(victimToken);
          const use = await dexActivity().use({}, { configure: false }, {});
          const card = use?.message instanceof ChatMessage ? use.message : null;
          if (card) await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '§23 the Dexterity demand stamped' });
          return card;
        };

        // 21a–b: Aura of Purity against a demand whose failed effect imposes Poisoned.
        await failEff.update({ statuses: ['poisoned'] });
        await ward('Aura of Purity');
        const cardA = await castDexAt();
        const demandA = cardA?.getFlag(MOD, 'saves')?.demand;
        ok('23a. the demand records what the save is against — a spell, and the Poisoned condition its failed effect imposes',
          (demandA?.spell === true) && (demandA?.statuses ?? []).includes('poisoned'), `demand=${JSON.stringify(demandA)}`);
        const dlgA = await dialogFor(cardA);
        const textA = sectionText(dlgA);
        ok('23b. the victim wearing Aura of Purity meets the gate: "Aura of Purity — against Poisoned", Net Advantage, Advantage the default',
          !!dlgA && /Aura of Purity — against Poisoned/.test(textA) && /Net Advantage/.test(textA) && (defaultOf(dlgA) === 'advantage'),
          `text="${textA.slice(0, 200)}" default=${defaultOf(dlgA)}`);
        dlgA?.querySelector('button[autofocus]')?.click();
        await until(() => cardA?.getFlag(MOD, 'saves')?.status === 'done', { timeout: 10000, label: '§23 the Aura of Purity demand done' });
        // The elect's own damage for cardA lands after the verdict — wait for its receipt, then heal.
        await until(() => game.messages.contents.some(m => (m._source.system?.origin === cardA?.id) && m.getFlag(MOD, 'receipt')), { timeout: 12000, label: '§23 the Aura of Purity damage receipted' });
        // The pass ran to its end and the answered dialog left: the next cast opens its own.
        await until(() => passSettled(cardA) && saveDialogsGone(), { timeout: 8000, label: '§23 the Aura of Purity demand settled' });
        for (const w of wards.splice(0)) await w.delete().catch(() => {});
        await failEff.update({ statuses: priorStatuses });

        // 21c–d: Circle's Power against a spell — Advantage, and a SUCCESS takes none.
        await ward("Circle's Power");
        await victim.update({ 'system.abilities.dex.save.roll.bonus': '+30' });   // the fixture demands a DEXTERITY save: a rolled one succeeds
        await healFull(victim);
        const vMax = victim.system.attributes.hp.max;
        const cardB = await castDexAt();
        const dlgB = await dialogFor(cardB);
        const textB = sectionText(dlgB);
        ok('23c. the victim wearing Circle\'s Power meets the gate against a spell: "Circle\'s Power — against a spell", Net Advantage',
          !!dlgB && /Circle's Power — against a spell/.test(textB) && /Net Advantage/.test(textB), `text="${textB.slice(0, 200)}"`);
        dlgB?.querySelector('button[autofocus]')?.click();
        await until(() => cardB?.getFlag(MOD, 'saves')?.status === 'done', { timeout: 10000, label: "§23 the Circle's Power demand done" });
        const entryB = cardB?.getFlag(MOD, 'saves')?.targets?.find(t => t.uuid === victim.uuid);
        const beforeDmg = snap();
        await dexActivity().rollDamage({}, { configure: false }, { data: { 'system.origin': cardB.id } });
        const dmgB = await until(() => fresh(beforeDmg).find(m => (m.type === 'damage') && m.getFlag(MOD, 'receipt')?.targets?.some(t => t.uuid === victim.uuid)), { timeout: 12000, label: '23d the chained damage receipted' });
        const rv = dmgB?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === victim.uuid);
        ok('23d. the success is stamped noneOnSuccess and the half becomes NONE — 0 applied and receipted, the note naming Circle\'s Power, the pool untouched',
          (entryB?.outcome === 'saved') && (entryB?.noneOnSuccess === "Circle's Power") && !!rv && (rv.taken === 0) && (rv.multiplier === 0) && /Circle's Power, no damage/.test(rv.note ?? '') && (victim.system.attributes.hp.value === vMax),
          `entry=${JSON.stringify(entryB && { outcome: entryB.outcome, none: entryB.noneOnSuccess })} receipt=${JSON.stringify(rv && { taken: rv.taken, multiplier: rv.multiplier, note: rv.note })} hp ${vMax}→${victim.system.attributes.hp.value} allDmg=${JSON.stringify(game.messages.contents.filter(m => (m.type === 'damage') && (m._source.system?.origin === cardB?.id)).map(m => ({ t: new Date(m.timestamp).toISOString().slice(14, 23), by: m.speaker?.alias, receipts: m.getFlag(MOD, 'receipt')?.targets?.map(x => ({ n: x.name, taken: x.taken, mult: x.multiplier, note: x.note })) })))}`);
      } finally {
        for (const w of wards) await w.delete().catch(() => {});
        await failEff?.update({ statuses: priorStatuses }).catch(() => {});
        await saveBonus(victim, '');
        await victim.update({ 'system.abilities.dex.save.roll.bonus': '' });
        for (const failed of await lists.restore()) log.push(`§23 lists restore ERROR: ${failed}`);
      }
    });

    // ============================================== 28. Trance
    // A text-only trait on the sheet, read by name (decide/reminders.js rowCarriers); a bare feat is the pack's shape.
    if (want(28)) await section(28, async () => {
      const lists = snapshotSettings(['reminderList', 'effectList']);
      const priorLists = lists.prior;
      const failEff = npc.items.get(poisonItem.id).effects.get(EFF_FAIL);
      const priorName = failEff?.name;
      let trait = null;
      try {
        await clearChips();
        await saveBonus(victim, '');
        await healFull(victim);
        if (!/\beffect\b/.test(priorLists.reminderList)) await set('reminderList', `${priorLists.reminderList}, effect`);
        if (!/(^|,\s*)Trance(\s*,|$)/i.test(priorLists.effectList)) await set('effectList', `${priorLists.effectList}, Trance`);
        const sectionText = dlg => (dlg?.querySelector('[data-bf-reminder]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const defaultOf = dlg => dlg?.querySelector('button[autofocus]')?.dataset?.action ?? null;
        const dialogFor = card => until(() => savePopups().find(p => demandText(p).includes(card?.getFlag(MOD, 'saves')?.targets?.[0]?.name ?? ' ')), { timeout: 12000, label: '§28 the save dialog' });   // 12 s: a 6 s wait was the battery's timing-class red (§32 g)
        const castDexAt = async () => {
          target(victimToken);
          const use = await dexActivity().use({}, { configure: false }, {});
          const card = use?.message instanceof ChatMessage ? use.message : null;
          if (card) await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '§28 the Dexterity demand stamped' });
          return card;
        };
        const settle = async card => {
          await until(() => card?.getFlag(MOD, 'saves')?.status === 'done', { timeout: 10000, label: '§28 the demand done' });
          await until(() => game.messages.contents.some(m => (m._source.system?.origin === card?.id) && m.getFlag(MOD, 'receipt')), { timeout: 12000, label: '§28 the damage receipted' });
          // The pass ran to its end and the answered dialog left: the heal sticks and the next cast opens its own.
          await until(() => passSettled(card) && saveDialogsGone(), { timeout: 8000, label: '§28 the demand settled' });
          await healFull(victim);
        };
        [trait] = await victim.createEmbeddedDocuments('Item', [{ name: 'Trance', type: 'feat',
          system: { type: { value: 'race' }, description: { value: '<p>You don’t need to sleep, and magic can’t put you to sleep.</p>' } } }]);

        // 28a: a spell whose failure puts the target to sleep — the save cannot fail.
        await failEff.update({ name: 'Asleep' });
        const cardA = await castDexAt();
        ok('28a0. the demand says it would put its target to sleep', cardA?.getFlag(MOD, 'saves')?.demand?.sleep === true,
          JSON.stringify(cardA?.getFlag(MOD, 'saves')?.demand));
        const dlgA = await dialogFor(cardA);
        const textA = sectionText(dlgA);
        const succeedsBtn = dlgA?.querySelector('button[data-action="bf-succeeds"]');
        ok('28a. a text-only Trance meets the gate: "Trance: this save cannot fail", a Succeeds button, the default',
          !!dlgA && /Trance: this save cannot fail/.test(textA) && !!succeedsBtn && (defaultOf(dlgA) === 'bf-succeeds'),
          `text="${textA.slice(0, 220)}" default=${defaultOf(dlgA)} button=${!!succeedsBtn}`);
        succeedsBtn?.click();
        const entryA = await until(() => { const t = game.messages.get(cardA?.id)?.getFlag(MOD, 'saves')?.targets?.[0]; return t?.done ? t : null; }, { timeout: 10000, label: '28b Succeeds recorded' });
        await settle(cardA);
        ok('28b. Succeeds: the verdict is SAVED with no die — cannot fail (Trance) — and the sleep never lands',
          (entryA?.outcome === 'saved') && (entryA?.autoSucceeded === true) && (entryA?.autoSucceededBy === 'Trance') && (entryA?.total === null)
            && !victim.effects.some(e => e.name === 'Asleep'),
          `entry=${JSON.stringify(entryA)} effects=${victim.effects.map(e => e.name).join(',')}`);

        // 28c: a spell that does not sleep — Trance is not in the section at all.
        await failEff.update({ name: priorName });
        const cardB = await castDexAt();
        const dlgB = await dialogFor(cardB);
        const textB = sectionText(dlgB);
        ok('28c. …and against a demand that does not sleep, Trance is nowhere in the section and no Succeeds button stands',
          !!dlgB && !/Trance/.test(textB) && !dlgB.querySelector('button[data-action="bf-succeeds"]'), `text="${textB.slice(0, 200)}"`);
        dlgB?.querySelector('button[data-action="normal"]')?.click();
        await settle(cardB);
      } finally {
        await trait?.delete().catch(() => {});
        if (priorName) await failEff?.update({ name: priorName }).catch(() => {});
        await saveBonus(victim, '');
        for (const failed of await lists.restore()) log.push(`§28 lists restore ERROR: ${failed}`);
      }
    });

    // ============================================== 26. a feature row's saves facet (Brave, text only)
    if (want(26)) await section(26, async () => {
      const lists = snapshotSettings(['reminderList', 'effectList']);
      const priorLists = lists.prior;
      const failEff = npc.items.get(poisonItem.id).effects.get(EFF_FAIL);
      const priorStatuses = [...(failEff?.statuses ?? [])];
      let trait = null;
      try {
        await clearChips();
        await saveBonus(victim, '');
        await healFull(victim);
        if (!/\beffect\b/.test(priorLists.reminderList)) await set('reminderList', `${priorLists.reminderList}, effect`);
        if (!/(^|,\s*)Brave(\s*,|$)/i.test(priorLists.effectList)) await set('effectList', `${priorLists.effectList}, Brave`);
        const sectionText = dlg => (dlg?.querySelector('[data-bf-reminder]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const defaultOf = dlg => dlg?.querySelector('button[autofocus]')?.dataset?.action ?? null;
        const dialogFor = card => until(() => savePopups().find(p => demandText(p).includes(card?.getFlag(MOD, 'saves')?.targets?.[0]?.name ?? ' ')), { timeout: 12000, label: '§26 the save dialog' });   // 12 s: a 6 s wait was the battery's timing-class red (§32 g)
        const castDexAt = async () => {
          target(victimToken);
          const use = await dexActivity().use({}, { configure: false }, {});
          const card = use?.message instanceof ChatMessage ? use.message : null;
          if (card) await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '§26 the Dexterity demand stamped' });
          return card;
        };
        const settle = async card => {
          await until(() => card?.getFlag(MOD, 'saves')?.status === 'done', { timeout: 10000, label: '§26 the demand done' });
          await until(() => game.messages.contents.some(m => (m._source.system?.origin === card?.id) && m.getFlag(MOD, 'receipt')), { timeout: 12000, label: '§26 the damage receipted' });
          // The pass ran to its end and the answered dialog left: the heal sticks and the next cast opens its own.
          await until(() => passSettled(card) && saveDialogsGone(), { timeout: 8000, label: '§26 the demand settled' });
          await healFull(victim);
        };
        [trait] = await victim.createEmbeddedDocuments('Item', [{ name: 'Brave', type: 'feat',
          system: { type: { value: 'race' }, description: { value: '<p>You have Advantage on saving throws you make to avoid or end the Frightened condition.</p>' } } }]);

        // 26a: a demand that would frighten — the trait counts, with no effect anywhere on the sheet.
        await failEff.update({ statuses: ['frightened'] });
        const cardA = await castDexAt();
        const dlgA = await dialogFor(cardA);
        const textA = sectionText(dlgA);
        ok('26a. a text-only Brave on the sheet meets the gate against a frightening demand: "Brave — against Frightened", Net Advantage, Advantage the default',
          !!dlgA && /Brave — against Frightened/.test(textA) && /Net Advantage/.test(textA) && (defaultOf(dlgA) === 'advantage')
            && !victim.effects.some(e => /brave/i.test(e.name)),
          `text="${textA.slice(0, 200)}" default=${defaultOf(dlgA)}`);
        dlgA?.querySelector('button[autofocus]')?.click();
        await settle(cardA);

        // 26b: a demand that would poison — Brave is not in the section at all.
        await failEff.update({ statuses: ['poisoned'] });
        const cardB = await castDexAt();
        const dlgB = await dialogFor(cardB);
        const textB = sectionText(dlgB);
        ok('26b. …and against a poisoning demand Brave is nowhere in the section',
          !!dlgB && !/Brave/.test(textB), `text="${textB.slice(0, 200)}"`);
        dlgB?.querySelector('button[data-action="normal"]')?.click();
        await settle(cardB);
      } finally {
        await trait?.delete().catch(() => {});
        await failEff?.update({ statuses: priorStatuses }).catch(() => {});
        await saveBonus(victim, '');
        for (const failed of await lists.restore()) log.push(`§26 lists restore ERROR: ${failed}`);
      }
    });

    // ============================================== 24. the chained roll's summary
    // dnd5e draws a save rolled against a usage card as a SUMMARY inside it (chatCardSummary) and
    // hides the roll's card: By the Books' rows must draw in the summary (ui.js cardRow), and a
    // flag write on the roll must re-render it (the platform re-renders on a system change only).
    if (want(24)) await section(24, async () => {
      const priorSummary = game.settings.get('dnd5e', 'chatCardSummary');
      const setStatus24 = async (actor, id, on) => {
        const carriers = actor.effects.filter(e => e.statuses?.has?.(id));
        if (on && !carriers.length) {
          const eff = await ActiveEffect.implementation.fromStatusEffect(id);
          await ActiveEffect.implementation.create(eff.toObject(), { parent: actor, keepId: true });
        } else if (!on && carriers.length) {
          await actor.deleteEmbeddedDocuments('ActiveEffect', carriers.map(e => e.id));
        }
        // Soft: setStatus24 runs in the finally too, and the dialog's own section reads the status next.
        await until(() => !!actor.statuses?.has?.(id) === on, { timeout: 4000 }).catch(() => null);
      };
      const text = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
      try {
        await game.settings.set('dnd5e', 'chatCardSummary', true);
        await clearChips();
        await saveBonus(victim, '');
        await healFull(victim);
        await setStatus24(victim, 'restrained', true);
        target(victimToken);
        const use24 = await dexActivity().use({}, { configure: false }, {});
        const card24 = use24?.message instanceof ChatMessage ? use24.message : null;
        if (!card24) throw new Error('section 24 dex cast produced no card');
        await until(() => card24.getFlag(MOD, 'saves'), { timeout: 15000, label: '§24 the Dexterity demand stamped' });
        const name24 = card24.getFlag(MOD, 'saves')?.targets?.[0]?.name ?? victim.name;   // the TOKEN's name (an unlinked fixture speaks under it)
        const dlg24 = await until(() => savePopups().find(p => demandText(p).includes(name24)), { timeout: 6000, label: '§24 the save dialog' });
        dlg24?.querySelector('button[data-action="normal"]')?.click();   // against the net: the record says so
        // Soft: a missing roll is 24a's own red, written below with the entry and the dialog.
        await until(() => entryOf(card24, victim)?.done, { timeout: 15000 }).catch(() => null);
        const entry24 = entryOf(card24, victim);
        const roll24 = entry24?.rollMessageId ? game.messages.get(entry24.rollMessageId) : null;
        if (!roll24) {
          ok('24a. the roll is chained (system.origin = the usage card), its own card is HIDDEN and the usage card carries its summary — the platform\'s 6.0 shape, measured',
            false, `no roll message: entry=${JSON.stringify(entry24)} dialog=${!!dlg24} popups=${savePopups().length} flag=${JSON.stringify(card24.getFlag(MOD, 'saves'))?.slice(0, 300)}`);
          throw new Error('section 24: no roll message — see 24a');
        }
        const log24 = ui.chat.element;
        const ownLi = () => log24?.querySelector(`.message[data-message-id="${roll24?.id}"]`);
        const summaryEl = () => log24?.querySelector(
          `.message[data-message-id="${card24.id}"] .card-summary[data-message-id="${roll24?.id}"]`);

        const summary24 = await until(() => summaryEl(), { timeout: 6000, label: '24a the summary drawn in the usage card' });
        ok('24a. the roll is chained (system.origin = the usage card), its own card is HIDDEN and the usage card carries its summary — the platform\'s 6.0 shape, measured',
          !!roll24 && (roll24._source.system?.origin === card24.id) && (ownLi()?.hidden === true) && !!summary24,
          `roll=${!!roll24} origin=${roll24?._source.system?.origin} hidden=${ownLi()?.hidden} summary=${!!summary24}`);

        const rowIn = await until(() => /Reminded — net Disadvantage/.test(text(summaryEl())) ? summaryEl() : null, { timeout: 6000, label: '24b the record drawn in the summary' });
        ok('24b. the save gate\'s record draws INSIDE the summary, where the table looks — and not on the hidden card',
          !!rowIn && /against the net/.test(text(rowIn)) && !/Reminded — net/.test(text(ownLi())),
          `inSummary=${!!rowIn} onHidden=${/Reminded — net/.test(text(ownLi()))} text="${text(summaryEl()).slice(0, 200)}"`);

        // A FLAG write on the summarized roll re-renders the origin.
        const rem24 = roll24?.getFlag(MOD, 'reminder');
        await roll24?.setFlag(MOD, 'reminder', { ...rem24, honoured: true });
        const refreshed = await until(() => {
          const t = text(summaryEl());
          return /Reminded — net Disadvantage/.test(t) && !/against the net/.test(t) ? t : null;
        }, { timeout: 6000, label: '24c the summary re-rendered on the flag write' });
        ok('24c. a flag write on the summarized roll re-renders its summary — By the Books nudges the origin (the platform re-renders it on a system change only)',
          !!refreshed, `text="${(refreshed ?? text(summaryEl())).slice(0, 200)}"`);

        // The summary row carries "vs DC … — saved/failed"; no second line.
        const tail24 = await until(() => summaryEl()?.querySelector('.bf-verdict') ?? null, { timeout: 6000, label: '24e the verdict in the summary row' });
        const bfLines24 = () => [...(log24?.querySelectorAll(`.message[data-message-id="${card24.id}"] .bythebooks-saves div`) ?? [])].map(d => text(d));
        ok('24e. the verdict is written into the platform\'s summary row — "vs DC … — saved/failed" beside the total — and By the Books draws no second line for that target (user ruling 2026-09-18)',
          !!tail24 && /^vs DC \d+ — (saved|failed)/.test(text(tail24)) && !bfLines24().some(l => /vs DC/.test(l)),
          `tail="${text(tail24)}" lines=${JSON.stringify(bfLines24())}`);

        await until(() => entryOf(card24, victim)?.applied, { timeout: 12000, label: '§24 the first demand applied' });

        // Summaries OFF: a FRESH roll's card shows and draws the row. ⚠ Proven on a new roll: core's
        // ChatLog#rerenderMessage carries `hidden` over, so a once-summarized card stays hidden.
        await game.settings.set('dnd5e', 'chatCardSummary', false);
        await clearChips();
        await healFull(victim);
        target(victimToken);
        const useD = await dexActivity().use({}, { configure: false }, {});
        const cardD = useD?.message instanceof ChatMessage ? useD.message : null;
        if (cardD) await until(() => cardD.getFlag(MOD, 'saves'), { timeout: 15000, label: '24d the fresh demand stamped' });
        const dlgD = cardD ? await until(() => savePopups().find(p => demandText(p).includes(name24)), { timeout: 6000, label: '24d the fresh save dialog' }) : null;
        dlgD?.querySelector('button[data-action="normal"]')?.click();
        if (cardD) await until(() => entryOf(cardD, victim)?.done, { timeout: 15000, label: '24d the fresh roll folded' });
        const rollD = cardD ? game.messages.get(entryOf(cardD, victim)?.rollMessageId ?? '') : null;
        const liD = () => log24?.querySelector(`.message[data-message-id="${rollD?.id}"]`);
        const shown = await until(() => rollD && (liD()?.hidden === false) && /Reminded — net/.test(text(liD())) ? liD() : null, { timeout: 6000, label: "24d the fresh roll's own card shown with the row" });
        const summaryD = log24?.querySelector(`.message[data-message-id="${cardD?.id}"] .card-summary`);
        ok('24d. with summaries OFF a fresh roll\'s own card is shown and draws the row itself, and its usage card renders no summary',
          !!shown && !summaryD,
          `roll=${!!rollD} shown=${!!shown} hidden=${liD()?.hidden} summary=${!!summaryD}`);
        const lineD = cardD ? await until(() => { const ls = [...(log24?.querySelectorAll(`.message[data-message-id="${cardD.id}"] .bythebooks-saves div`) ?? [])].map(d => text(d)); return ls.some(l => /vs DC/.test(l)) ? ls : null; }, { timeout: 6000, label: "24f the card's own verdict line" }) : null;
        ok('24f. with summaries OFF there is no summary row to carry the verdict, so the card\'s own line says it (the 2026-09-18 ruling\'s other half)', !!lineD, JSON.stringify(lineD));
        if (cardD) await until(() => entryOf(cardD, victim)?.applied, { timeout: 12000, label: '§24 the fresh demand applied' });
      } catch (err) {
        if (!String(err?.message).startsWith('section 24: no roll message')) throw err;
      } finally {
        await game.settings.set('dnd5e', 'chatCardSummary', priorSummary);
        await setStatus24(victim, 'restrained', false);
        await clearChips();
      }
    });

    // ============================================== 25. a used-up item's failed save
    // dnd5e spends before it posts, so the last use's item is gone before its card exists; the
    // consequence reads the activity off the card's snapshot (lookup.js cardActivity).
    if (want(25)) await section(25, async () => {
      const VIAL_EFF = 'bfvialeffect0000';
      const [vial] = await npc.createEmbeddedDocuments('Item', [{
        name: 'BTB Test Vial', type: 'consumable',
        system: {
          type: { value: 'poison' }, quantity: 1,
          uses: { max: '1', spent: 0, autoDestroy: true, recovery: [] },
          activities: {
            bfvialsave000000: {
              _id: 'bfvialsave000000', type: 'save',
              activation: { type: 'action', override: false },
              consumption: { targets: [{ type: 'itemUses', value: '1', target: '' }], spellSlot: false },
              damage: { onSave: 'none', parts: [] },
              effects: [{ _id: VIAL_EFF, onSave: false }],
              save: { ability: ['con'], dc: { calculation: '', formula: '15' } },
              target: { override: false, prompt: true, affects: { type: 'creature', count: '1', choice: false } }
            }
          }
        },
        effects: [{ _id: VIAL_EFF, name: 'BTB Vial Poisoned', transfer: false, disabled: false,
          img: 'icons/svg/poison.svg', duration: { seconds: 60 },
          description: '<p>Poisoned by a vial (BTB test fixture — fail only).</p>' }]
      }]);
      created.items.push({ actorId: npc.id, id: vial.id });
      try {
        await clearChips();
        await saveBonus(victim, '-30');          // forced failure vs DC 15
        await healFull(victim);
        target(victimToken);
        const act = npc.items.get(vial.id).system.activities.get('bfvialsave000000');
        const use = await act.use({}, { configure: false }, {});
        const card25 = use?.message instanceof ChatMessage ? use.message : null;
        const gone = !npc.items.get(vial.id);
        const stamped = card25 ? await until(() => card25.getFlag(MOD, 'saves'), { timeout: 15000, label: "25a the vial's demand stamped" }) : null;
        const popup = card25 ? await until(() => savePopups()[0], { timeout: 8000, label: "25a the vial's ask" }) : null;
        popup?.querySelector('button[data-action="normal"]')?.click();
        if (card25) await until(() => entryOf(card25, victim)?.applied, { timeout: 12000, label: '25a the failure applied' });
        const chip = await until(() => chipOn(victim, 'BTB Vial Poisoned'), { timeout: 6000, label: "25a the vial's effect landed" });
        const entry = card25 ? entryOf(card25, victim) : null;
        ok('25a. the vial\'s last use DELETES it before the card, yet the demand stands, the save fails, and the vial\'s effect lands off the card\'s snapshot',
          gone && !!stamped && (entry?.outcome === 'failed') && !!chip,
          `gone=${gone} card=${!!card25} stamped=${!!stamped} popup=${!!popup} outcome=${entry?.outcome} applied=${entry?.applied} chip=${!!chip}`);
      } finally {
        await saveBonus(victim, priorActor[victim.id]['system.abilities.con.save.roll.bonus']);
        await clearChips();
      }
    });

    // ============================================== 27. Guarded Mind on a demanded save
    // The `succeed` fold on the withheld failure of a demanded Wisdom save: pressed, the use is
    // spent and the verdict lands SAVED. Spent, not offered; a Constitution save never.
    if (want(27)) await section(27, async () => {
      const pack = game.packs.get('dnd-players-handbook.feats');
      const idx = pack ? await pack.getIndex() : [];
      const src = idx.find?.(e => e.name === 'Mage Slayer');
      const doc = src ? await pack.getDocument(src._id) : null;
      if (!doc) throw new Error('section 27: no Mage Slayer in dnd-players-handbook.feats');
      const [feat] = await victim.createEmbeddedDocuments('Item', [doc.toObject()]);
      created.items.push({ actorId: victim.id, id: feat.id });
      const wisBonus = v => victim.update({ 'system.abilities.wis.save.roll.bonus': v });
      // The fold's gates: d20FoldAsk on, autoDamage "all", saveTimer 0 (no fold clock).
      const asked = snapshotSettings(['d20FoldAsk']);
      await asked.set('d20FoldAsk', true);
      await set('d20Folds', game.settings.settings.get(`${MOD}.d20Folds`)?.default ?? '');   // the shipped list carries Mage Slayer:succeed
      await set('autoDamage', 'all');
      const rescueRow = kind => [...document.querySelectorAll('.application')]
        .map(el => el.querySelector(`[data-bf-rescue-action="${kind}"]`)).find(Boolean) ?? null;
      const demand = async (activity, ability) => {
        target(victimToken);
        const use = await activity.use({}, { configure: false }, {});
        const card = use?.message instanceof ChatMessage ? use.message : null;
        if (!card) return { card: null, roll: null };
        await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: `§27 the ${ability} demand stamped` });
        // The popup offers itself; the bare roll answers first (§4's channel).
        await until(() => savePopups()[0], { timeout: 6000, label: `§27 the ${ability} save dialog offered` });
        await victim.rollSavingThrow({ ability }, { configure: false }, {});
        // Soft: every caller reads a missing roll as no fold (`roll ? … : null`, `roll?.`).
        const roll = await until(() => game.messages.contents.findLast(m => (m.speaker?.actor === victim.id)
          && (m.system?.ability === ability) && (m.timestamp >= card.timestamp)), { timeout: 6000 }).catch(() => null);
        return { card, roll };
      };
      try {
        await clearChips();
        await wisBonus('-30');                    // a forced failure against DC 15
        await healFull(victim);
        const vMax = victim.system.attributes.hp.max;
        const { card, roll } = await demand(wisActivity(), 'wis');
        const fold = roll ? await until(() => roll.getFlag(MOD, 'd20fold'), { timeout: 8000, label: '27a the fold withheld the failure' }) : null;
        const offer = (fold?.offers ?? []).find(o => o.kind === 'succeed');
        ok('27a. a failed demanded Wisdom save is WITHHELD and offered Guarded Mind — the benefit\'s name, its rule, the use left',
          !!card && !!offer && (offer.label === 'Guarded Mind') && (offer.rule?.benefit === 'Guarded Mind') && /1 left/.test(offer.cost ?? '')
            && !entryOf(card, victim)?.done,
          `card=${!!card} roll=${!!roll} offers=${JSON.stringify(fold?.offers ?? null)} done=${entryOf(card, victim)?.done}`);
        const row = await until(() => rescueRow('succeed'), { timeout: 8000, label: '27b the Guarded Mind row offered' });
        row?.click();
        const entry = card ? await until(() => { const e = entryOf(card, victim); return e?.applied ? e : null; }, { timeout: 20000, label: '27b the saved verdict applied' }) : null;
        const spent = await until(() => Number(victim.items.get(feat.id)?.system?.uses?.value) === 0, { timeout: 6000, label: "27b the feat's use spent" });
        ok('27b. pressed: the feat\'s one use is spent through its own activity, and the save is SAVED — named on the verdict',
          (entry?.outcome === 'saved') && (entry?.madeBy === 'Guarded Mind') && !!spent,
          `outcome=${entry?.outcome} madeBy=${entry?.madeBy} uses=${victim.items.get(feat.id)?.system?.uses?.value} row=${!!row}`);
        const dmgTaken = await until(() => (victim.system.attributes.hp.value === vMax - 5) ? true : null, { timeout: 10000, label: '27c half damage landed' });
        ok('27c. the success\'s consequences: half damage, the fail-only effect never lands, the onSave one does',
          !!dmgTaken && !chipOn(victim, 'BTB Poisoned') && !!chipOn(victim, 'BTB Splashed'),
          `hp=${victim.system.attributes.hp.value}/${vMax} poisoned=${!!chipOn(victim, 'BTB Poisoned')} splashed=${!!chipOn(victim, 'BTB Splashed')}`);
        const settled = roll?.getFlag(MOD, 'd20fold');
        ok('27d. the fold settles as a spend with the verdict, no die, no reroll',
          (settled?.status === 'resolved') && (settled?.spends?.[0]?.kind === 'succeed') && (settled?.spends?.[0]?.verdict === 'saved')
            && !Number.isFinite(settled?.spends?.[0]?.die) && !settled?.spends?.[0]?.reroll,
          JSON.stringify(settled?.spends ?? null));
        // The use is gone: the next failure is not offered it.
        await clearChips();
        await healFull(victim);
        const again = await demand(wisActivity(), 'wis');
        const e2 = again.card ? await until(() => { const e = entryOf(again.card, victim); return e?.applied ? e : null; }, { timeout: 15000, label: '27e the unaided failure applied' }) : null;
        const f2 = again.roll?.getFlag(MOD, 'd20fold');
        ok('27e. with the use spent, the next failed Wisdom save is not offered Guarded Mind — it fails',
          (e2?.outcome === 'failed') && !(f2?.offers ?? []).some(o => o.kind === 'succeed'),
          `outcome=${e2?.outcome} offers=${JSON.stringify(f2?.offers ?? null)}`);
        // A Constitution save is never Guarded Mind's, even with the use back.
        await victim.items.get(feat.id)?.update({ 'system.uses.spent': 0 });
        await clearChips();
        await healFull(victim);
        await saveBonus(victim, '-30');
        const con = await demand(saveActivity(), 'con');
        const e3 = con.card ? await until(() => { const e = entryOf(con.card, victim); return e?.applied ? e : null; }, { timeout: 15000, label: '27f the Constitution failure applied' }) : null;
        const f3 = con.roll?.getFlag(MOD, 'd20fold');
        ok('27f. a failed Constitution save is never offered it — the rule names Intelligence, Wisdom and Charisma',
          (e3?.outcome === 'failed') && !(f3?.offers ?? []).some(o => o.kind === 'succeed'),
          `outcome=${e3?.outcome} offers=${JSON.stringify(f3?.offers ?? null)}`);
      } finally {
        await wisBonus(priorActor[victim.id]['system.abilities.wis.save.roll.bonus']);
        await saveBonus(victim, priorActor[victim.id]['system.abilities.con.save.roll.bonus']);
        for (const failed of await asked.restore()) log.push(`§27 d20FoldAsk restore ERROR: ${failed}`);
        await set('autoDamage', 'off');
        await clearChips();
      }
    });

    // ================================================== 29. Command's word
    if (want(29)) await section(29, async () => {
      let commandItem = null;
      try {
        await clearChips();
        await healFull(victim);
        await victim.update({ 'system.abilities.wis.save.roll.bonus': '-30' });
        // §27's Mage Slayer would WITHHOLD a failed Wisdom save and offer Guarded Mind: the feat goes first.
        const slayer = victim.items.filter(i => i.name === 'Mage Slayer').map(i => i.id);
        if (slayer.length) await victim.deleteEmbeddedDocuments('Item', slayer);
        for (const pack of game.packs.filter(p => (p.metadata.packageName === 'dnd-players-handbook') && (p.documentName === 'Item'))) {
          const hit = (await pack.getIndex()).find(e => (e.name === 'Command') && (e.type === 'spell'));
          if (!hit) continue;
          const data = (await pack.getDocument(hit._id)).toObject();
          data.system.prepared = 1;
          data.system.method = 'atwill';   // the statblock has no slot to spend
          [commandItem] = await npc.createEmbeddedDocuments('Item', [data]);
          created.items.push({ actorId: npc.id, id: commandItem.id });
          break;
        }
        if (!commandItem) { ok('29. the PHB ships Command', false, 'no Command in the PHB packs'); }
        else {
          const wordPopup = () => [...foundry.applications.instances.values()]
            .find(app => app.rendered && [...(app.element?.querySelectorAll?.('button') ?? [])].some(b => b.textContent?.trim() === 'Grovel')) ?? null;
          const speak = async word => {
            const stray = victim.effects.filter(e => e.statuses?.has?.('prone'));
            if (stray.length) await victim.deleteEmbeddedDocuments('ActiveEffect', stray.map(e => e.id));
            target(victimToken);
            const act = npc.items.get(commandItem.id).system.activities.find(a => a.type === 'save');
            const use = await act.use({}, { configure: false }, {});
            const card = use?.message instanceof ChatMessage ? use.message : null;
            if (!card) return { card: null };
            await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: `§29 the ${word} demand stamped` });
            const dlg = await until(() => savePopups().find(p => demandText(p).includes(card.getFlag(MOD, 'saves')?.targets?.[0]?.name ?? ' ')), { timeout: 12000, label: `§29 the ${word} save dialog` });   // 12 s: a 6 s wait was the battery's timing-class red (§32 g)
            dlg?.querySelector('button[data-action="normal"]')?.click();
            const choice = await until(() => entryOf(card, victim)?.choice ?? null, { timeout: 12000, label: `29a the word's choice on the entry (${word})` });
            const popup = await until(wordPopup, { timeout: 8000, label: `29a the caster's word popup (${word})` });
            const button = [...(popup?.element?.querySelectorAll?.('button') ?? [])].find(b => b.textContent?.trim() === word) ?? null;
            button?.click();
            const applied = await until(() => entryOf(card, victim)?.applied ? entryOf(card, victim) : null, { timeout: 15000, label: `§29 the ${word} pass applied` });
            const announce = await until(() => game.messages.contents.find(m => (m.timestamp >= card.timestamp) && new RegExp(`Command — "${word}"`).test(m.content ?? '')) ?? null, { timeout: 8000, label: `§29 the ${word} announce` });
            // The receipt lands after the announce: the presser waits for its press receipted; any other
            // word's window is for a WRONG press.
            const pressedNow = () => victim.effects.find(e => e.statuses?.has?.('prone')) ?? null;
            let strayPress = null;
            if (choice?.presses === word) {
              await until(() => pressedNow() && card.getFlag(MOD, 'effectReceipt')?.targets?.find(t => t.uuid === victim.uuid)?.effects?.length,
                { timeout: 6000, label: `29b the ${word} press receipted` });
            } else strayPress = await watch(pressedNow, { ms: 300 });
            return { card, choice, popup: !!popup, button: !!button, applied, announce, strayPress,
              prone: victim.effects.find(e => e.statuses?.has?.('prone')) ?? null,
              receipt: card.getFlag(MOD, 'effectReceipt')?.targets?.find(t => t.uuid === victim.uuid) ?? null };
          };
          const g = await speak('Grovel');
          ok('29a. the failed save opens the caster\'s WORD: a choice of kind word on the entry, the four options, Grovel the presser, the popup on the caster\'s client',
            !!g.card && (g.choice?.kind === 'word') && (g.choice?.options?.join() === 'Approach,Flee,Grovel,Halt') && (g.choice?.presses === 'Grovel') && g.popup && g.button,
            `choice=${JSON.stringify(g.choice && { kind: g.choice.kind, options: g.choice.options, presses: g.choice.presses })} popup=${g.popup} button=${g.button} entry=${JSON.stringify(g.card ? entryOf(g.card, victim) : null)} saveRolls=${game.settings.get(MOD, 'saveRolls')} timer=${game.settings.get(MOD, 'decisionTimer')}`);
          ok('29b. "Grovel": Prone is pressed on the Victim, the caster as origin, receipted on the demand card; the announce names who falls',
            (g.applied?.choice?.answer === 'Grovel') && !!g.prone && (g.prone.origin === npc.uuid) && !!g.receipt?.effects?.some(e => e.id === g.prone.id)
              && /falls Prone/.test(g.announce?.content ?? ''),
            `answer=${g.applied?.choice?.answer} prone=${!!g.prone} origin=${g.prone?.origin} receipt=${JSON.stringify(g.receipt?.effects?.map(e => e.name))} announce=${!!g.announce}`);
          const h = await speak('Halt');
          ok('29c. "Halt": nothing is pressed, and the announce says the table plays the word',
            (h.applied?.choice?.answer === 'Halt') && !h.prone && !h.strayPress && !h.receipt?.effects?.length && /obeys/.test(h.announce?.content ?? ''),
            `answer=${h.applied?.choice?.answer} prone=${!!h.prone} receipt=${JSON.stringify(h.receipt?.effects?.map(e => e.name) ?? null)} announce=${!!h.announce}`);
        }
      } finally {
        const stray = victim.effects.filter(e => e.statuses?.has?.('prone'));
        if (stray.length) await victim.deleteEmbeddedDocuments('ActiveEffect', stray.map(e => e.id)).catch(() => {});
        await victim.update({ 'system.abilities.wis.save.roll.bonus': priorActor[victim.id]['system.abilities.wis.save.roll.bonus'] ?? '' });
        await clearChips();
      }
    });

    // ================================================== 30. the two new saves-facet effect rows
    if (want(30)) await section(30, async () => {
      const failEff = npc.items.get(poisonItem.id).effects.get(EFF_FAIL);
      const priorStatuses = [...(failEff?.statuses ?? [])];
      const wards = [];
      try {
        await clearChips();
        await saveBonus(victim, '');
        await healFull(victim);
        const sectionText = dlg => (dlg?.querySelector('[data-bf-reminder]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const dialogFor = card => until(() => savePopups().find(p => demandText(p).includes(card?.getFlag(MOD, 'saves')?.targets?.[0]?.name ?? ' ')), { timeout: 12000, label: '§30 the save dialog' });   // 12 s: a 6 s wait was the battery's timing-class red (§32 g)
        const ward = async name => { const [e] = await victim.createEmbeddedDocuments('ActiveEffect', [{ name, img: 'icons/svg/aura.svg', transfer: false, disabled: false }]); wards.push(e); return e; };
        const castAt = async activity => {
          // ⚠ The LIVE token, and the target confirmed before the cast: a stale placeable takes the click and the
          // cast goes out with no target, so nothing is stamped (no dialog, §32 h or j, 1 run in 3 on 2026-10-07).
          const liveVictim = canvas.tokens.get(victimToken.id) ?? victimToken;
          target(liveVictim);
          await until(() => [...game.user.targets].some(t => t.id === liveVictim.id), { timeout: 4000, label: '§30 the victim targeted' });
          // The previous demand's dialog must be GONE first: cast over a closing dialog, the next one never shows (the battery's timing-class red, §32 f/g).
          await until(() => !savePopups().length, { timeout: 8000, label: '§30 the last save dialog answered' });
          // …and gone from the page: its element leaves at the close's end.
          await until(saveDialogsGone, { timeout: 8000, label: '§30 the last save dialog closed' });
          const use = await activity.use({}, { configure: false }, {});
          const card = use?.message instanceof ChatMessage ? use.message : null;
          if (card) await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '§30 the demand stamped' });
          return card;
        };
        const settle = async (card, dlg) => {
          dlg?.querySelector('button[autofocus]')?.click();
          await until(() => card?.getFlag(MOD, 'saves')?.status === 'done', { timeout: 10000, label: '§30 the demand done' });
          // The pass ran to its end: the heal below sticks.
          await until(() => passSettled(card), { timeout: 8000, label: '§30 the demand settled' });
          for (const w of wards.splice(0)) await w.delete().catch(() => {});
          await healFull(victim);
        };
        // Poison Protection against a demand whose failed effect imposes Poisoned.
        await failEff.update({ statuses: ['poisoned'] });
        await ward('Poison Protection');
        const cardA = await castAt(dexActivity());
        const dlgA = await dialogFor(cardA);
        const textA = sectionText(dlgA);
        ok('30a. Poison Protection on the Victim: "Poison Protection — against Poisoned", Net Advantage',
          !!dlgA && /Poison Protection — against Poisoned/.test(textA) && /Net Advantage/.test(textA), `text="${textA.slice(0, 220)}"`);
        await settle(cardA, dlgA);
        await failEff.update({ statuses: priorStatuses });
        // Irresistible Dance against a DEXTERITY demand: Disadvantage; against a Wisdom one, nothing.
        await ward('Irresistible Dance');
        const cardB = await castAt(dexActivity());
        const dlgB = await dialogFor(cardB);
        const textB = sectionText(dlgB);
        ok('30b. Irresistible Dance on the Victim against a Dexterity demand: "Irresistible Dance — a Dexterity save", Net Disadvantage',
          !!dlgB && /Irresistible Dance — a Dexterity save/.test(textB) && /Net Disadvantage/.test(textB), `text="${textB.slice(0, 220)}"`);
        dlgB?.querySelector('button[autofocus]')?.click();
        await until(() => cardB?.getFlag(MOD, 'saves')?.status === 'done', { timeout: 10000, label: '30b the demand done' });
        await until(() => passSettled(cardB), { timeout: 8000, label: '30b the demand settled' });
        await healFull(victim);
        const cardC = await castAt(wisActivity());
        const dlgC = await dialogFor(cardC);
        const textC = sectionText(dlgC);
        ok('30c. …and nowhere in the section of a Wisdom demand', !!dlgC && !/Irresistible Dance/.test(textC), `text="${textC.slice(0, 220)}"`);
        await settle(cardC, dlgC);
      } finally {
        for (const w of wards.splice(0)) await w.delete().catch(() => {});
        await failEff.update({ statuses: priorStatuses }).catch(() => {});
        await clearChips();
      }
    });

    // ============================================== 31. the GM's side — saves against magic, Avoidance
    if (want(31)) await section(31, async () => {
      const traits = [];
      try {
        await clearChips();
        await saveBonus(victim, '');
        await healFull(victim);
        const sectionText = dlg => (dlg?.querySelector('[data-bf-reminder]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const defaultOf = dlg => dlg?.querySelector('button[autofocus]')?.dataset?.action ?? null;
        const dialogFor = card => until(() => savePopups().find(p => demandText(p).includes(card?.getFlag(MOD, 'saves')?.targets?.[0]?.name ?? ' ')), { timeout: 12000, label: '§31 the save dialog' });   // 12 s: a 6 s wait was the battery's timing-class red (§32 g)
        const damageFor = card => game.messages.contents.find(m => (m.type === 'damage') && (m._source.system?.origin === card?.id));
        const lendTrait = async name => {
          const pack = game.packs.get('dnd-monster-manual.features');
          const hit = (await pack?.getIndex())?.find(e => e.name === name);
          if (!hit) throw new Error(`the Monster Manual ships no "${name}" this box can find`);
          const src = await pack.getDocument(hit._id);
          const [item] = await victim.createEmbeddedDocuments('Item', [src.toObject()]);
          traits.push(item);
          return item;
        };
        const dropTraits = async () => { for (const t of traits.splice(0)) await t.delete().catch(() => {}); };
        const castAt = async activity => {
          target(victimToken);
          // The previous demand's dialog must be GONE first: cast over a closing dialog, the next one never shows (the battery's timing-class red, §32 f/g).
          await until(() => !savePopups().length, { timeout: 8000, label: '§31 the last save dialog answered' });
          // …and gone from the page: its element leaves at the close's end.
          await until(saveDialogsGone, { timeout: 8000, label: '§31 the last save dialog closed' });
          const use = await activity.use({}, { configure: false }, {});
          const card = use?.message instanceof ChatMessage ? use.message : null;
          if (card) await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '§31 the demand stamped' });
          return card;
        };
        const settle = async card => {
          await until(() => card?.getFlag(MOD, 'saves')?.status === 'done', { timeout: 10000, label: '§31 the demand done' });
          await until(() => game.messages.contents.some(m => (m._source.system?.origin === card?.id) && m.getFlag(MOD, 'receipt')), { timeout: 12000, label: '§31 the damage receipted' });
          // The pass ran to its end: the heal below sticks.
          await until(() => passSettled(card), { timeout: 8000, label: '§31 the demand settled' });
          await healFull(victim);
        };

        // 31a: Magic Resistance — the poison burst IS a spell: the row counts Advantage.
        await lendTrait('Magic Resistance');
        const cardA = await castAt(dexActivity());
        const dlgA = await dialogFor(cardA);
        const textA = sectionText(dlgA);
        ok('31a. Magic Resistance, text-only on the sheet, meets the gate against a spell: "Magic Resistance — against a spell", Net Advantage, Advantage the default',
          !!dlgA && /Magic Resistance — against a spell/.test(textA) && /Net Advantage/.test(textA) && (defaultOf(dlgA) === 'advantage'),
          `text="${textA.slice(0, 220)}" default=${defaultOf(dlgA)}`);
        dlgA?.querySelector('button[autofocus]')?.click();
        await settle(cardA);
        await dropTraits();
        await clearChips();   // 31a's failure may have landed BTB Poisoned; 31c asserts on a clean sheet

        // 31b/c: Greater Magic Resistance — the save cannot fail: the fourth button, the default.
        await lendTrait('Greater Magic Resistance');
        const cardB = await castAt(dexActivity());
        const dlgB = await dialogFor(cardB);
        const textB = sectionText(dlgB);
        const succeedsBtn = dlgB?.querySelector('button[data-action="bf-succeeds"]');
        ok('31b. Greater Magic Resistance: "this save cannot fail — against a spell or other magical effect", a Succeeds button, the default',
          !!dlgB && /Greater Magic Resistance: this save cannot fail/.test(textB) && !!succeedsBtn && (defaultOf(dlgB) === 'bf-succeeds'),
          `text="${textB.slice(0, 240)}" default=${defaultOf(dlgB)} button=${!!succeedsBtn}`);
        succeedsBtn?.click();
        const entryB = await until(() => { const t = game.messages.get(cardB?.id)?.getFlag(MOD, 'saves')?.targets?.[0]; return t?.done ? t : null; }, { timeout: 10000, label: '31c Succeeds recorded' });
        await settle(cardB);
        ok('31c. Succeeds: the verdict is SAVED with no die — cannot fail (Greater Magic Resistance) — the fail-only effect never lands',
          (entryB?.outcome === 'saved') && (entryB?.autoSucceeded === true) && (entryB?.autoSucceededBy === 'Greater Magic Resistance') && (entryB?.total === null)
            && !chipOn(victim, 'BTB Poisoned'),
          `entry=${JSON.stringify(entryB)} poisoned=${!!chipOn(victim, 'BTB Poisoned')}`);
        await dropTraits();

        // 31d/e: Avoidance on a CONSTITUTION save (Evasion's shape, any ability): none on a success, half on a failure.
        await lendTrait('Avoidance');
        const vMax = victim.system.attributes.hp.max;
        const runOne = async bonus => {
          await saveBonus(victim, bonus);
          await healFull(victim);
          const card = await castAt(saveActivity());
          const dlg = await dialogFor(card);
          dlg?.querySelector('button[data-action="normal"]')?.click();
          await until(() => entryOf(card, victim)?.applied, { timeout: 15000, label: `§31 the Avoidance verdict applied (bonus ${bonus})` });
          const dmg = await until(() => damageFor(card)?.getFlag(MOD, 'receipt')?.targets?.find(x => x.uuid === victim.uuid) ? damageFor(card) : null, { timeout: 10000, label: `§31 the Avoidance damage receipted (bonus ${bonus})` });
          return { entry: entryOf(card, victim), receipt: dmg?.getFlag(MOD, 'receipt')?.targets?.find(x => x.uuid === victim.uuid) };
        };
        const a = await runOne('+30');
        ok('31d. Avoidance on a Constitution save: a SUCCESS takes NO damage — ×0, receipted and said, the row names Avoidance',
          (a.entry?.outcome === 'saved') && (a.entry?.evasion === true) && (a.entry?.evasionBy === 'Avoidance') && (a.receipt?.taken === 0) && (a.receipt?.multiplier === 0)
            && /Avoidance/.test(a.receipt?.note ?? '') && (victim.system.attributes.hp.value === vMax),
          `outcome=${a.entry?.outcome} by=${a.entry?.evasionBy} taken=${a.receipt?.taken} mult=${a.receipt?.multiplier} note="${a.receipt?.note}"`);
        const b = await runOne('-30');
        ok('31e. a FAILURE with Avoidance takes HALF — 5 of the flat 10, the row names Avoidance',
          (b.entry?.outcome === 'failed') && (b.entry?.evasion === true) && (b.entry?.evasionBy === 'Avoidance') && (b.receipt?.taken === 5) && (b.receipt?.multiplier === 0.5)
            && /Avoidance/.test(b.receipt?.note ?? ''),
          `outcome=${b.entry?.outcome} by=${b.entry?.evasionBy} taken=${b.receipt?.taken} mult=${b.receipt?.multiplier} note="${b.receipt?.note}"`);
      } finally {
        for (const t of traits.splice(0)) await t.delete().catch(() => {});
        await saveBonus(victim, '');
        await healFull(victim);
        await clearChips();
      }
    });

    // ============================================== 32. the PHB classes — B2: the save bends by name
    if (want(32)) await section(32, async () => {
      const failEff = npc.items.get(poisonItem.id).effects.get(EFF_FAIL);
      const priorStatuses = [...(failEff?.statuses ?? [])];
      const wards = [];
      const lent = [];   // { actor, id }
      let commandItem = null;
      try {
        await clearChips();
        await saveBonus(victim, '');
        await healFull(victim);
        const sectionText = dlg => (dlg?.querySelector('[data-bf-reminder]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const defaultOf = dlg => dlg?.querySelector('button[autofocus]')?.dataset?.action ?? null;
        const dialogFor = async card => {
          // Read the LIVE card inside the wait: the demand's flag can land after castAt's own wait gave up (the dialog
          // already open, "Command — Hobgoblin", the handle's flag still empty — the battery's timing-class red, §32 j).
          const live = () => game.messages.get(card?.id) ?? card;
          // No flag yet: every §32 cast targets the victim, its token's name in the dialog.
          const nameOf = () => live()?.getFlag(MOD, 'saves')?.targets?.[0]?.name ?? victimToken.document.name;
          // Timed: a dialog opens within ~300 ms or not at all (2026-10-07); the log says which.
          const t0 = Date.now();
          // Soft: a missing dialog is logged with its inputs below, and the assertion after says so.
          const dlg = await until(() => savePopups().find(p => demandText(p).includes(nameOf())), { timeout: 12000 }).catch(() => null);
          log.push(`§32 dialog for card ${card?.id}: ${dlg ? `${Date.now() - t0} ms` : 'none in 12 s'}`);
          if (!dlg) log.push(`§32 no dialog for card ${card?.id}: victimHp=${victim.system.attributes.hp.value} statuses=${[...victim.statuses].join(',')} targets=${JSON.stringify((live()?.system?.targets ?? live()?.getFlag('dnd5e', 'targets') ?? []).map?.(t => t.name) ?? null)} userTargets=${game.user.targets.size} saves=${JSON.stringify(live()?.getFlag(MOD, 'saves') && { status: live().getFlag(MOD, 'saves').status, targets: live().getFlag(MOD, 'saves').targets?.map(t => [t.name, t.done ?? null, t.outcome ?? null]) })} apps=${[...foundry.applications.instances.values()].filter(a => a.rendered).map(a => (a.constructor?.name ?? '?') + ':' + String(a.title ?? a.options?.window?.title ?? '').slice(0, 40)).join(' | ')}`);
          return dlg;
        };
        const ward = async (name, data = {}) => { const [e] = await victim.createEmbeddedDocuments('ActiveEffect', [{ name, img: 'icons/svg/aura.svg', transfer: false, disabled: false, ...data }]); wards.push(e); return e; };
        const feat = async (actor, name) => {
          const [it] = await actor.createEmbeddedDocuments('Item', [{ name, type: 'feat', system: { description: { value: `<p>${name}</p>` } } }]);
          lent.push({ actor, id: it.id }); return it;
        };
        // The caster as every one of its tokens' actors sees it (an unlinked token's actor follows the base a beat behind).
        const npcEverywhere = test => test(npc) && (canvas.scene?.tokens.filter(t => t.actorId === npc.id) ?? []).every(t => !t.actor || test(t.actor));
        const unfeat = async it => { const l = lent.find(x => x.id === it.id); if (l?.actor.items.get(it.id)) await l.actor.deleteEmbeddedDocuments('Item', [it.id]); lent.splice(lent.indexOf(l), 1); };
        const castAt = async activity => {
          target(victimToken);
          // The previous demand's dialog must be GONE first: cast over a closing dialog, the next one never shows (the battery's timing-class red, §32 f/g).
          await until(() => !savePopups().length, { timeout: 8000, label: '§32 the last save dialog answered' });
          // …and gone from the page: its element leaves at the close's end.
          await until(saveDialogsGone, { timeout: 8000, label: '§32 the last save dialog closed' });
          // ⚠ The victim ALIVE at the cast: an earlier demand's damage can land after the last heal, and a dead
          // target is rightly dropped by the dead-target gate — no demand, no dialog (§32 h or j, 2026-10-07).
          await healFull(victim);
          await until(() => !victim.statuses.has('dead') && (victim.system.attributes.hp.value > 0), { timeout: 5000, label: '§32 the victim alive at the cast' });
          const use = await activity.use({}, { configure: false }, {});
          const card = use?.message instanceof ChatMessage ? use.message : null;
          // Soft: the flag can land after this wait gives up, and dialogFor reads the live card for it.
          if (card) await until(() => (game.messages.get(card.id) ?? card).getFlag(MOD, 'saves'), { timeout: 15000 }).catch(() => null);
          return card ? (game.messages.get(card.id) ?? card) : null;   // the collection's document, never a stale handle
        };
        const roll = async (card, dlg, action = null) => {
          (action ? dlg?.querySelector(`button[data-action="${action}"]`) : dlg?.querySelector('button[autofocus]'))?.click();
          await until(() => card?.getFlag(MOD, 'saves')?.status === 'done', { timeout: 10000, label: '§32 the demand done' });
          // The pass ran to its end, or stands on Command's word: the heal that follows sticks.
          await until(() => passSettled(card), { timeout: 8000, label: '§32 the demand settled' });
        };
        const settle = async (card, dlg, action = null) => {
          await roll(card, dlg, action);
          for (const w of wards.splice(0)) await w.delete().catch(() => {});
          await healFull(victim);
        };

        // a. Psychic Defenses, a text-only trait on the Victim, against a demand that would frighten (Brave's shape).
        await failEff.update({ statuses: ['frightened'] });
        const pd = await feat(victim, 'Psychic Defenses');
        const cardA = await castAt(dexActivity());
        const dlgA = await dialogFor(cardA);
        const textA = sectionText(dlgA);
        ok('32a. Psychic Defenses on the Victim (text only) against a frightening demand: "Psychic Defenses — against Frightened", Net Advantage',
          !!dlgA && /Psychic Defenses — against Frightened/.test(textA) && /Net Advantage/.test(textA), `text="${textA.slice(0, 220)}"`);
        await settle(cardA, dlgA);
        await unfeat(pd);
        await failEff.update({ statuses: priorStatuses });

        // b–c. Magical Ambush: the CASTER's feature, Invisible as it casts; visible, nothing.
        const ma = await feat(npc, 'Magical Ambush');
        await npc.toggleStatusEffect('invisible', { active: true });
        await until(() => npcEverywhere(a => a.statuses?.has?.('invisible')), { label: '32b the caster Invisible on every token' });
        const cardB = await castAt(dexActivity());
        const dlgB = await dialogFor(cardB);
        const textB = sectionText(dlgB);
        const snapB = cardB?.getFlag(MOD, 'saves')?.demand?.source ?? null;
        ok('32b. the caster Invisible with Magical Ambush: "BTB Test Attacker — Magical Ambush — against a spell, BTB Test Attacker Invisible as it cast", Net Disadvantage; the demand carries the caster\'s snapshot',
          !!dlgB && /Magical Ambush — against a spell, BTB Test Attacker Invisible as it cast/.test(textB) && /Net Disadvantage/.test(textB)
            && (snapB?.uuid === npc.uuid) && (snapB?.statuses ?? []).includes('invisible') && (snapB?.features ?? []).includes('Magical Ambush'),
          `text="${textB.slice(0, 220)}" source=${JSON.stringify(snapB)}`);
        await settle(cardB, dlgB);
        await npc.toggleStatusEffect('invisible', { active: false });
        await until(() => npcEverywhere(a => !a.statuses?.has?.('invisible')), { label: '32c the caster visible on every token' });
        const cardC = await castAt(dexActivity());
        const dlgC = await dialogFor(cardC);
        const textC = sectionText(dlgC);
        ok('32c. …the caster visible: Magical Ambush nowhere in the section', !!dlgC && !/Magical Ambush/.test(textC), `text="${textC.slice(0, 220)}"`);
        await settle(cardC, dlgC);
        await unfeat(ma);

        // d–e. Struck by the caster: Disadvantage against ITS spell, and the save spends it.
        const struck = await ward('Struck', { flags: { [MOD]: { sourceUuid: npc.uuid } } });
        const cardD = await castAt(dexActivity());
        const dlgD = await dialogFor(cardD);
        const textD = sectionText(dlgD);
        ok('32d. Struck (its source the caster) against the caster\'s spell: "Struck — against BTB Test Attacker\'s spell", Net Disadvantage',
          !!dlgD && /Struck — against BTB Test Attacker's spell/.test(textD) && /Net Disadvantage/.test(textD), `text="${textD.slice(0, 220)}"`);
        await roll(cardD, dlgD);
        const struckGone = await until(() => !victim.effects.get(struck.id), { timeout: 6000, label: '32e the save spent Struck' });
        ok('32e. the save SPENT Struck: the effect is gone from the Victim', struckGone === true, `gone=${!victim.effects.get(struck.id)}`);
        for (const w of wards.splice(0)) await w.delete().catch(() => {});
        await healFull(victim);

        // f–g. Hexed Dexterity by a warlock holding Eldritch Hex: a Dexterity demand, Disadvantage; a Wisdom one, nothing.
        const eh = await feat(npc, 'Eldritch Hex');
        await ward('Hexed Dexterity', { statuses: ['cursed'], flags: { [MOD]: { sourceUuid: npc.uuid } } });
        const cardF = await castAt(dexActivity());
        const dlgF = await dialogFor(cardF);
        const textF = sectionText(dlgF);
        ok('32f. Hexed Dexterity (its source holds Eldritch Hex) against a Dexterity demand: "Hexed Dexterity — a Dexterity save", Net Disadvantage',
          !!dlgF && /Hexed Dexterity — a Dexterity save/.test(textF) && /Net Disadvantage/.test(textF), `text="${textF.slice(0, 220)}"`);
        await settle(cardF, dlgF);
        await ward('Hexed Dexterity', { statuses: ['cursed'], flags: { [MOD]: { sourceUuid: npc.uuid } } });
        const cardG = await castAt(wisActivity());
        const dlgG = await dialogFor(cardG);
        const textG = sectionText(dlgG);
        ok('32g. …and nowhere in the section of a Wisdom demand', !!dlgG && !/Hexed/.test(textG), `text="${textG.slice(0, 220)}"`);
        await settle(cardG, dlgG);
        await unfeat(eh);

        // h–j. Mantle of Majesty: the bard's Unearthly Appearance, a Command at a creature Charmed BY the bard — Fails.
        [commandItem] = await npc.createEmbeddedDocuments('Item', [{
          name: 'Command', type: 'spell',
          system: {
            level: 1, school: 'enc', properties: ['vocal'], duration: { units: 'round', value: 1 },
            target: { affects: { type: 'creature', count: '1', choice: false } }, range: { value: '60', units: 'ft' },
            method: 'spell', prepared: 1, identifier: 'bf-b2-command',
            activities: {
              bfb2command00000: {
                _id: 'bfb2command00000', type: 'save', activation: { type: 'action', override: false },
                consumption: { targets: [], spellSlot: false }, damage: { parts: [] }, effects: [],
                save: { ability: ['wis'], dc: { calculation: '', formula: '15' } }, target: { override: false, prompt: true }
              }
            }
          }
        }]);
        // ⚠ An item added to the BASE actor reaches its unlinked tokens' synthetic actors asynchronously: cast before
        // they carry it and the demand is never stamped (no dialog, 1 run in 3 on 2026-10-07). Wait for every token.
        await until(() => (canvas.scene?.tokens.filter(t => t.actorId === npc.id) ?? []).every(t => t.actor?.items.get(commandItem.id)?.system.activities?.size), { timeout: 8000, label: '32h Command on every token of the caster' });
        const cmdAct = () => npc.items.get(commandItem.id).system.activities.get('bfb2command00000');
        const [ua] = await npc.createEmbeddedDocuments('ActiveEffect', [{ name: 'Unearthly Appearance', img: 'icons/svg/aura.svg', transfer: false, disabled: false }]);
        await ward('Charmed', { statuses: ['charmed'], flags: { [MOD]: { sourceUuid: npc.uuid } } });
        const cardH = await castAt(cmdAct());
        const dlgH = await dialogFor(cardH);
        const textH = sectionText(dlgH);
        ok('32h. Mantle of Majesty — a Command at a creature Charmed by the bard: "BTB Test Attacker — Mantle of Majesty: this save cannot succeed — Command, BTB Test Victim Charmed by BTB Test Attacker", the Fails button the default',
          !!dlgH && /Mantle of Majesty: this save cannot succeed — Command, BTB Test Victim Charmed by BTB Test Attacker/.test(textH)
            && !!dlgH.querySelector('[data-bf-fails]') && (defaultOf(dlgH) === 'bf-fails'),
          `text="${textH.slice(0, 260)}" fails=${!!dlgH?.querySelector('[data-bf-fails]')} default=${defaultOf(dlgH)}`);
        dlgH?.querySelector('[data-bf-fails]')?.click();
        const entryH = await until(() => { const e = entryOf(cardH, victim); return e?.done ? e : null; }, { timeout: 10000, label: '32i Fails recorded' });
        ok('32i. Fails: the entry FAILED with no die, by Mantle of Majesty',
          (entryH?.outcome === 'failed') && (entryH?.autoFailed === true) && /Mantle of Majesty/.test(entryH?.autoFailedBy ?? ''),
          `entry=${JSON.stringify(entryH && { outcome: entryH.outcome, autoFailed: entryH.autoFailed, by: entryH.autoFailedBy })}`);
        // The pass ran to its end, or stands on Command's word: the heal below sticks.
        await until(() => passSettled(cardH), { timeout: 8000, label: '32i the automatic failure settled' });
        for (const w of wards.splice(0)) await w.delete().catch(() => {});
        await healFull(victim);
        // j. Charmed by someone else: no row, no Fails button.
        await ward('Charmed', { statuses: ['charmed'], flags: { [MOD]: { sourceUuid: 'Actor.someoneElse00' } } });
        const cardJ = await castAt(cmdAct());
        const dlgJ = await dialogFor(cardJ);
        const textJ = sectionText(dlgJ);
        ok('32j. …Charmed by someone else: no Mantle row, no Fails button',
          !!dlgJ && !/Mantle/.test(textJ) && !dlgJ.querySelector('[data-bf-fails]'), `text="${textJ.slice(0, 220)}" fails=${!!dlgJ?.querySelector('[data-bf-fails]')}`);
        await settle(cardJ, dlgJ, 'normal');
        await ua.delete().catch(() => {});
      } finally {
        for (const w of wards.splice(0)) await w.delete().catch(() => {});
        for (const l of lent.splice(0)) if (l.actor.items.get(l.id)) await l.actor.deleteEmbeddedDocuments('Item', [l.id]).catch(() => {});
        if (commandItem && npc.items.get(commandItem.id)) await npc.deleteEmbeddedDocuments('Item', [commandItem.id]).catch(() => {});
        for (const e of npc.effects.filter(e => e.name === 'Unearthly Appearance')) await e.delete().catch(() => {});
        if (npc.statuses.has('invisible')) await npc.toggleStatusEffect('invisible', { active: false }).catch(() => {});
        for (const e of victim.effects.filter(e => e.statuses?.has?.('charmed') || e.statuses?.has?.('cursed'))) await e.delete().catch(() => {});
        await failEff.update({ statuses: priorStatuses }).catch(() => {});
        await saveBonus(victim, '');
        await healFull(victim);
        await clearChips();
      }
    });

    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  } finally {
    Hooks.off('bythebooks.moment', momentHookId);
    await teardown();
    for (const a of [victim, shielder, npc, game.actors.getName('BTB Test PC Attacker')]
      .filter(Boolean)) {
      try { await a.longRest?.({ dialog: false, chat: false }); } catch { /* fine */ }
    }
  }
}, sectionArg(plan, SECTIONS));

/* ============================================== 18. the player-rolled damage offer, SAVE path
 * The offer on the save path costs no new machinery: `dnd5e.postUseActivity` runs on the casting
 * client, and the saves machine is order-independent, so a late roll still folds by verdict (11).
 * Self-contained: its own page context, caster, targets and spell. Assertions:
 *   1 OFF: auto-rolls, no popup   2 ON: popup, no roll yet   3 half stakes   4 avoid stakes
 *   5 no crit badge   6 press rolls, chained   7 dismiss rolls now   8 buzzer rolls
 *   9 rider damage offers nothing   10 two targets, one popup   11 verdicts first, then 10/5
 *   12 bare-cast area offers targetless   13 control: 11's ordering with the popup OFF
 * ⚠ 9 guards the wiring: rider damage must never auto-roll.
 */
if (!out.fatal && (!plan || plan.includes('18'))) {
  const sd = await f.evaluate(async () => {
    const MOD = 'fvtt-mod-bythebooks';
    const { until, watch, tokenOn, viewScene, snapshotSettings } = window.__btb;
    // Each assertion is named by its number ("1. …"); the Node side prefixes "18/" and orders them.
    const { results, log, ok, section } = window.__btb.begin();

    const scene = game.scenes.getName('By the Books Test Range') ?? canvas.scene;
    // Soft: the check below names a canvas that never came up.
    if (scene) await viewScene(scene, { timeout: 15000 }).catch(() => null);
    if (!canvas.scene) return { fatal: 'no active scene' };

    /* --- prior state, restored in full at the end ------------------------------------------ */
    const KEYS = ['saves', 'saveTimer', 'damageTimer', 'autoApply', 'autoDamage', 'reactionHold',
      'riders', 'masteryRiders', 'concMode', 'playerRollDamage', 'hideCardButtons', 'saveRolls'];
    const settings = snapshotSettings(KEYS);
    const { prior, set } = settings;
    await set('saves', true);
    await set('saveTimer', 4);          // verdicts land fast so 11 is constructible
    // ⚠ The offer window is pinned below §8's 22s wait-out ceiling.
    await set('damageTimer', 15);
    await set('autoApply', false);      // the ROLL is under test until 11 turns this on
    await set('reactionHold', false);
    await set('riders', false);
    await set('masteryRiders', false);
    await set('concMode', 'off');

    /* --- the fixture: one caster, two targets, four save activities ------------------------ */
    const mkNpc = (name, hp) => ({
      name, type: 'npc',
      system: { attributes: { hp: { value: hp, max: hp }, ac: { flat: 10, calc: 'flat' } } }
    });
    // ⚠ C and D exist only for assertion 11: earlier sections leave unapplied damage rolls that a
    // re-render with autoApply on would sweep onto whichever target they named.
    // ⚠⚠ Bind by NAME: `Actor.createDocuments` does not return documents in the passed order.
    const made = await Actor.createDocuments([
      mkNpc('BTB Probe Caster', 40), mkNpc('BTB Probe Target A', 60), mkNpc('BTB Probe Target B', 60),
      mkNpc('BTB Probe Target C', 60), mkNpc('BTB Probe Target D', 60),
      mkNpc('BTB Probe Target E', 60), mkNpc('BTB Probe Target F', 60)
    ]);
    const byName = n => made.find(a => a.name === n);
    const caster = byName('BTB Probe Caster');
    const tgtA = byName('BTB Probe Target A');
    const tgtB = byName('BTB Probe Target B');
    const tgtC = byName('BTB Probe Target C');
    const tgtD = byName('BTB Probe Target D');
    const tgtE = byName('BTB Probe Target E');
    const tgtF = byName('BTB Probe Target F');
    if ([caster, tgtA, tgtB, tgtC, tgtD, tgtE, tgtF].some(a => !a)) {
      return { fatal: `fixture actors did not all create: ${made.map(a => a.name).join(' | ')}` };
    }

    const mkToken = async (actor, x) => {
      const [doc] = await canvas.scene.createEmbeddedDocuments('Token', [{
        name: actor.name, actorId: actor.id, actorLink: true,
        x: canvas.grid.size * x, y: canvas.grid.size * 4, hidden: true, disposition: -1
      }]);
      // Soft: the caller checks every token's placeable and names the fatal.
      await tokenOn(doc.id).catch(() => null);
      return doc;
    };
    const tokA = await mkToken(tgtA, 3);
    const tokB = await mkToken(tgtB, 5);
    const tokC = await mkToken(tgtC, 7);
    const tokD = await mkToken(tgtD, 9);
    const tokE = await mkToken(tgtE, 11);
    const tokF = await mkToken(tgtF, 13);
    if ([tokA, tokB, tokC, tokD, tokE, tokF].some(t => !t?.object)) {
      return { fatal: 'probe target tokens never reached the canvas' };
    }

    // Flat damage so halves are exact; a formula DC. The four activities are the four shapes the wiring tells apart.
    const saveBlock = { ability: ['con'], dc: { calculation: '', formula: '15' } };
    const base = { activation: { type: 'action', override: false },
      consumption: { targets: [], spellSlot: false }, effects: [] };
    const [spell] = await caster.createEmbeddedDocuments('Item', [{
      name: 'BTB Probe Save Spell', type: 'spell',
      system: {
        level: 1, school: 'evo', properties: ['vocal'], duration: { units: 'inst' },
        target: { affects: { type: 'creature', count: '2', choice: false } },
        range: { value: '60', units: 'ft' },
        method: 'spell', prepared: 1, identifier: 'bf-probe-save-spell',
        activities: {
          // Fireball's shape — a save halves it.
          bfprobehalf00000: { ...base, _id: 'bfprobehalf00000', type: 'save', save: saveBlock,
            damage: { onSave: 'half', parts: [{ custom: { enabled: true, formula: '10' }, types: ['poison'] }] },
            target: { override: false, prompt: true } },
          // Vicious Mockery's shape — a save avoids it entirely.
          bfprobenone00000: { ...base, _id: 'bfprobenone00000', type: 'save', save: saveBlock,
            damage: { onSave: 'none', parts: [{ custom: { enabled: true, formula: '4' }, types: ['psychic'] }] },
            target: { override: false, prompt: true } },
          // Web's burn clause — rider damage the save does not modulate. Must never be offered.
          bfprobefull00000: { ...base, _id: 'bfprobefull00000', type: 'save', save: saveBlock,
            damage: { onSave: 'full', parts: [{ custom: { enabled: true, formula: '10' }, types: ['fire'] }] },
            target: { override: false, prompt: true } },
          // The area — cast bare, placed after. The `awaitingTemplate` corner.
          bfprobetmpl00000: { ...base, _id: 'bfprobetmpl00000', type: 'save', save: saveBlock,
            damage: { onSave: 'half', parts: [{ custom: { enabled: true, formula: '10' }, types: ['poison'] }] },
            target: { override: true, prompt: true,
              template: { type: 'cube', size: '10', units: 'ft', count: '' },
              affects: { type: 'creature', count: '', choice: false } } }
        }
      }
    }]);

    const act = id => caster.items.get(spell.id).system.activities.get(id);
    const created = [];
    const snap = () => new Set(game.messages.contents.map(m => m.id));
    const fresh = before => game.messages.contents.filter(m => !before.has(m.id));
    const usageCards = msgs => msgs.filter(m =>
      (m.type === 'usage'));

    /** OUR popup, found by the eyebrow no other dialog in this module carries. */
    const popupEls = () => [...document.querySelectorAll('.application')]
      .filter(el => (el.innerHTML ?? '').includes('Damage &mdash; your roll')
                 || (el.innerHTML ?? '').includes('Damage — your roll'));
    /** The targets' SAVE asks — closed between sections so they never pile up on screen. */
    const savePopupEls = () => [...foundry.applications.instances.values()]
      .filter(app => app.rendered && app.element?.querySelector?.('[data-bf-save-demand]'))
      .map(app => app.element);
    const closeEls = async (els) => {
      for (const el of els) {
        const btn = el.querySelector('[data-action="close"]') ?? el.querySelector('.header-control');
        try { btn?.click(); } catch {}
      }
      // Each element leaves the page at its close's end. Soft: the teardown closes through here too.
      await until(() => els.every(el => !el.isConnected), { timeout: 4000 }).catch(() => null);
    };
    const closeDamagePopups = () => closeEls(popupEls());
    const closeEverything = async () => { await closeEls([...popupEls(), ...savePopupEls()]); };

    const target = (...tokens) => {
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      tokens.forEach((t, i) => { t.setTarget(true, { releaseOthers: i === 0 }); });
    };

    /** Cast one save activity at `tokens`; return its usage card. */
    const cast = async (id, tokens, useConfig = {}) => {
      target(...tokens);
      const use = await act(id).use(useConfig, { configure: false }, {});
      const card = (use?.message instanceof ChatMessage) ? use.message : null;
      if (card) created.push(card.id);
      return card;
    };

    /** The damage roll chained to a card, if it has landed. */
    const damageFor = card => game.messages.contents.slice(-30).find(m =>
      (m.type === 'damage')
      && (m._source.system?.origin === card?.id));
    // Soft: every caller reads a roll that never landed as its own verdict (`!!dmg`).
    const waitDamage = async (card, ms) => {
      const d = await until(() => damageFor(card), { timeout: ms }).catch(() => null);
      if (d) created.push(d.id);
      return d;
    };

    const saveBonus = (a, v) => a.update({ 'system.abilities.con.save.roll.bonus': v });
    const healFull = a => a.update({ 'system.attributes.hp.value': a.system.attributes.hp.max });
    const poolsFull = (...actors) => actors.every(a => a.system.attributes.hp.value === a.system.attributes.hp.max);

    await section(18, async () => {
      /* 1 — setting OFF: the stamp still auto-rolls, and nothing pops. ----------------------- */
      await set('playerRollDamage', false);
      {
        const card = await cast('bfprobehalf00000', [tokA.object]);
        if (!card) throw new Error('the half fixture cast produced no usage card');
        await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '18/1 the demand stamped' });
        const dmg = await waitDamage(card, 8000);
        ok('1. OFF — the stamp auto-rolls, no popup',
          !!dmg && (popupEls().length === 0),
          `damage=${!!dmg} popups=${popupEls().length}`);
        await closeEverything();
      }

      /* 2, 3, 5, 6 — ON: the offer, its stakes, its silence about crits, and the press. ------ */
      await set('playerRollDamage', true);
      {
        const before = snap();
        const card = await cast('bfprobehalf00000', [tokA.object]);
        await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '18/2 the demand stamped' });
        // The window: the offer opens inside it, and the damage must not roll yet.
        const early = await watch(() => damageFor(card), { ms: 1400 });
        const popups = popupEls();
        ok('2. ON — the popup opens and the damage waits',
          (popups.length === 1) && !early,
          `popups=${popups.length} damageAlready=${!!early}`);

        const html = popups[0]?.innerHTML ?? '';
        const label = popups[0]?.querySelector('button[data-action="roll"]')?.textContent?.trim() ?? '';
        const title = popups[0]?.querySelector('.window-title')?.textContent ?? '';
        ok('3. onSave "half" — the stakes line says a save HALVES it',
          /halves/i.test(html), `stakes present=${/halves/i.test(html)}`);
        // A save spell has no attack roll, so no crit.
        ok('5. no crit anywhere — no badge, plain label, plain title',
          !html.includes('Critical Hit') && !/Critical/i.test(label) && !/Critical/i.test(title),
          `badge=${html.includes('Critical Hit')} label="${label}" title="${title}"`);

        popups[0]?.querySelector('button[data-action="roll"]')?.click();
        const dmg = await waitDamage(card, 8000);
        ok('6. button pressed — rolls, chained, carrying damageOnSave',
          !!dmg && (dmg._source.system?.origin === card.id)
            && (dmg.system?.onSave === 'half'),
          `damage=${!!dmg} origin=${dmg?._source.system?.origin === card.id}`
            + ` onSave=${dmg?.system?.onSave}`);
        created.push(...fresh(before).map(m => m.id));
        await closeEverything();
      }

      /* 4 — Vicious Mockery's shape: a save avoids it entirely. ------------------------------ */
      {
        const card = await cast('bfprobenone00000', [tokA.object]);
        await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '18/4 the demand stamped' });
        // The window: the one offer opens inside it, never a second.
        await watch(() => popupEls().length > 1, { ms: 1400 });
        const html = popupEls()[0]?.innerHTML ?? '';
        ok('4. onSave "none" — the stakes line says a save AVOIDS it entirely',
          (popupEls().length === 1) && /avoids it/i.test(html) && /entirely/i.test(html),
          `popups=${popupEls().length} avoids=${/avoids it/i.test(html)}`);
        await closeDamagePopups();
        await waitDamage(card, 6000);      // the dismissal rolls it; let it land before moving on
        await closeEverything();
      }

      /* 9 — rider damage offers NOTHING and rolls nothing (finding ③'s fence). --------------- */
      {
        const card = await cast('bfprobefull00000', [tokA.object]);
        await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '18/9 the demand stamped' });
        // The window for a WRONG offer or roll.
        await watch(() => popupEls().length || damageFor(card), { ms: 2500 });
        const flag = card.getFlag(MOD, 'saves');
        const dmg = damageFor(card);
        ok('9. rider damage (onSave "full") — no popup, no roll, the fence holds',
          (popupEls().length === 0) && !dmg && (flag?.hasDamage === false),
          `popups=${popupEls().length} rolled=${!!dmg} hasDamage=${flag?.hasDamage}`);
        await closeEverything();
      }

      /* 10 — two targets, ONE popup. --------------------------------------------------------- */
      {
        const card = await cast('bfprobehalf00000', [tokA.object, tokB.object]);
        await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '18/10 the demand stamped' });
        // The window: one offer per CAST opens inside it, never a second for the second target.
        await watch(() => popupEls().length > 1, { ms: 1400 });
        const stamped = card.getFlag(MOD, 'saves')?.targets?.length ?? 0;
        ok('10. two targets — exactly ONE popup (per CAST, never per target)',
          (popupEls().length === 1) && (stamped === 2),
          `stampedTargets=${stamped} popups=${popupEls().length}`);

        /* 7 — dismissing rolls IMMEDIATELY, well inside the 15s window. ---------------------- */
        await closeDamagePopups();
        const dmg = await waitDamage(card, 6000);
        ok('7. dismissed — rolls immediately, not at the buzzer',
          !!dmg, `damage within 6s of dismissal = ${!!dmg}`);
        await closeEverything();
      }

      /* 8 — the buzzer. Waited out for real. ------------------------------------------------- */
      {
        const card = await cast('bfprobehalf00000', [tokA.object]);
        await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '18/8 the demand stamped' });
        // The window: the one offer opens inside it, and nothing rolls before the buzzer.
        await watch(() => damageFor(card) || (popupEls().length > 1), { ms: 1400 });
        const opened = popupEls().length;
        const early = !!damageFor(card);
        const dmg = await waitDamage(card, 22000);   // the window is 15s — PINNED above, not the world's
        ok('8. left alone — the buzzer rolls it',
          (opened === 1) && !early && !!dmg,
          `popup=${opened} rolledEarly=${early} rolledByBuzzer=${!!dmg}`);
        await closeEverything();
      }

      /* 11 — the order claim with real HP: verdicts land first, the button is pressed after, and
       * reconcileSaveDamage still applies each target's multiplier on arrival. The saves roll
       * themselves, so the verdicts land in a second while the offer's window runs: with one
       * Decision Timer, two buzzers armed together would race. ------------------------------ */
      {
        await set('saveRolls', 'auto');
        await set('autoApply', true);
        await saveBonus(tgtC, '-30');        // forced FAILURE vs DC 15 → full 10
        await saveBonus(tgtD, '+30');        // forced SUCCESS vs DC 15 → half, 5
        await healFull(tgtC); await healFull(tgtD);
        await until(() => poolsFull(tgtC, tgtD), { label: '18/11 both pools full' });
        const aMax = tgtC.system.attributes.hp.max;
        const bMax = tgtD.system.attributes.hp.max;

        const card = await cast('bfprobehalf00000', [tokC.object, tokD.object]);
        await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '18/11 the demand stamped' });
        // The offer is open before the press below reads it.
        const popups = await until(() => (popupEls().length ? popupEls() : null), { timeout: 8000, label: '18/11 the damage offer opened' });

        // Both verdicts land while the damage popup still sits open. Soft: the log line and 11 read a miss.
        const bothDone = await until(() =>
          (card.getFlag(MOD, 'saves')?.targets ?? []).every(t => t.done) ? true : null, { timeout: 20000 }).catch(() => null);
        const stillOpen = popupEls().length === 1;
        const nothingYet = !damageFor(card);
        log.push(`11: verdicts done=${bothDone} popupStillOpen=${stillOpen} damageBeforePress=${!nothingYet}`);

        log.push(`11 diag: identities — C="${tgtC.name}" (${tgtC.uuid}) hp=${tgtC.system.attributes.hp.value}`
          + ` / D="${tgtD.name}" (${tgtD.uuid}) hp=${tgtD.system.attributes.hp.value}`);

        popups[0]?.querySelector('button[data-action="roll"]')?.click();
        // Soft: the receipt-guarded push below and 11 read a roll that never landed.
        const dmg = await until(() => {
          const d = damageFor(card);
          return (d?.getFlag(MOD, 'receipt')?.targets?.length === 2) ? d : null;
        }, { timeout: 20000 }).catch(() => null);
        if (dmg) created.push(dmg.id);
        // The window for a second application, sampled: one application looks flat, two look like a staircase.
        const trace = [];
        const t0 = Date.now();
        await watch(() => {
          trace.push(`${((Date.now() - t0) / 1000).toFixed(1)}s C=${tgtC.system.attributes.hp.value} D=${tgtD.system.attributes.hp.value}`);
          return false;
        }, { ms: 3000, every: 500 });
        log.push(`11 diag: pool trace — ${trace.join(' | ')}`);
        // ⚠ Diagnostic, kept: two chained rolls = the popup forked; one roll with two receipt entries
        // for a target = the applier did.
        const chained = game.messages.contents
          .filter(m => (m.type === 'damage')
                    && (m._source.system?.origin === card.id))
          .map(m => ({
            id: m.id, total: m.rolls?.[0]?.total ?? null,
            onSave: m.system?.onSave ?? null,
            receipt: (m.getFlag(MOD, 'receipt')?.targets ?? [])
              .map(t => `${t.name ?? t.uuid?.slice(-6)}:${t.taken}${t.multiplier ? `x${t.multiplier}` : ''}${t.reverted ? '(rev)' : ''}`)
          }));
        log.push(`11 diag: ${chained.length} chained damage roll(s) — ${JSON.stringify(chained)}`);
        log.push(`11 diag: demand targets — ${JSON.stringify((card.getFlag(MOD, 'saves')?.targets ?? [])
          .map(t => ({ n: t.name, done: t.done, out: t.outcome, applied: t.applied, total: t.total })))}`);

        const ra = dmg?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === tgtC.uuid);
        const rb = dmg?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === tgtD.uuid);

        ok('11. verdicts FIRST, then the button — the late roll still folds 10 / 5 by multiplier',
          !!bothDone && stillOpen && nothingYet
            && (ra?.taken === 10) && !ra?.multiplier
            && (rb?.taken === 5) && (rb?.multiplier === 0.5)
            && (tgtC.system.attributes.hp.value === aMax - 10)
            && (tgtD.system.attributes.hp.value === bMax - 5),
          `verdictsFirst=${bothDone} popupSurvived=${stillOpen} noEarlyRoll=${nothingYet} `
            + `C.taken=${ra?.taken} D.taken=${rb?.taken} D.mult=${rb?.multiplier} `
            + `hp ${aMax}→${tgtC.system.attributes.hp.value} / ${bMax}→${tgtD.system.attributes.hp.value}`);
        await closeEverything();
        await set('saveRolls', prior.saveRolls);
      }

      /* 13 — the control: 11's ordering with the popup OFF (auto-roll, delete it, wait out the
       * verdicts, chain a roll by hand). PASS: the popup is innocent. FAIL: the ordering itself is
       * broken, independent of the popup. -------------------------------------------------------- */
      {
        await set('playerRollDamage', false);
        await set('autoApply', true);
        await saveBonus(tgtE, '-30');        // forced FAILURE → full 10
        await saveBonus(tgtF, '+30');        // forced SUCCESS → half, 5
        await healFull(tgtE); await healFull(tgtF);
        await until(() => poolsFull(tgtE, tgtF), { label: '18/13 both pools full' });
        const eMax = tgtE.system.attributes.hp.max;
        const fMax = tgtF.system.attributes.hp.max;

        const card = await cast('bfprobehalf00000', [tokE.object, tokF.object]);
        await until(() => card.getFlag(MOD, 'saves'), { timeout: 15000, label: '18/13 the demand stamped' });

        // Delete the stamp's auto-roll so the late-arrival ordering can be built.
        // Soft: the delete is guarded on it and 13's detail reports it.
        const auto = await until(() => damageFor(card), { timeout: 8000 }).catch(() => null);
        if (auto) await auto.delete().catch(() => {});
        await until(() => !auto || !game.messages.has(auto.id), { label: '18/13 the auto-roll deleted' });

        const bothDone = await until(() =>
          (card.getFlag(MOD, 'saves')?.targets ?? []).every(t => t.done) ? true : null, { timeout: 20000, label: '18/13 both verdicts landed' });
        const noneYet = !damageFor(card);

        await act('bfprobehalf00000').rollDamage({}, { configure: false },
          { data: { 'system.origin': card.id } });
        // Soft: the receipt-guarded push below and 13 read a roll that never landed.
        const dmg = await until(() => {
          const d = damageFor(card);
          return (d?.getFlag(MOD, 'receipt')?.targets?.length === 2) ? d : null;
        }, { timeout: 20000 }).catch(() => null);
        if (dmg) created.push(dmg.id);
        // The window for a second application of the same roll.
        await watch(() => (tgtE.system.attributes.hp.value < eMax - 10) || (tgtF.system.attributes.hp.value < fMax - 5), { ms: 2000 });
        const re = dmg?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === tgtE.uuid);
        const rf = dmg?.getFlag(MOD, 'receipt')?.targets?.find(t => t.uuid === tgtF.uuid);

        ok('13. CONTROL — same ordering with the popup OFF folds 10 / 5 (is the popup implicated?)',
          !!bothDone && noneYet
            && (re?.taken === 10) && (rf?.taken === 5) && (rf?.multiplier === 0.5)
            && (tgtE.system.attributes.hp.value === eMax - 10)
            && (tgtF.system.attributes.hp.value === fMax - 5),
          `verdictsFirst=${bothDone} autoRollDeleted=${!!auto} noEarlyRoll=${noneYet} `
            + `E.taken=${re?.taken} F.taken=${rf?.taken} F.mult=${rf?.multiplier} `
            + `hp ${eMax}→${tgtE.system.attributes.hp.value} / ${fMax}→${tgtF.system.attributes.hp.value}`);
        await closeEverything();
      }

      /* 12 — the area cast bare: the offer still comes, targetless, and says why. -------------- */
      {
        // States its own precondition: the control above turned the popup OFF.
        await set('playerRollDamage', true);
        await set('autoApply', false);
        game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
        const before = snap();
        // ⚠ A template-bearing `use()` never resolves headless: pass `create.measuredTemplate false`
        // AND race the call against a deadline, so a stall fails this assertion rather than the watchdog.
        const used = await Promise.race([
          act('bfprobetmpl00000').use({ create: { measuredTemplate: false } }, { configure: false }, {})
            .catch(() => null),
          // The deadline: a stalled use() rejects here and reads as 'timeout'.
          new Promise((_, rej) => setTimeout(() => rej(new Error('use() stalled')), 6000))
        ]).catch(() => 'timeout');
        const card = await until(() => usageCards(fresh(before)).find(m => m.getFlag(MOD, 'saves')), { timeout: 8000, label: '18/12 the waiting demand stamped' });
        created.push(...fresh(before).map(m => m.id));
        const flag = card?.getFlag(MOD, 'saves');
        // The window: the one targetless offer opens inside it, never a second.
        await watch(() => popupEls().length > 1, { ms: 1200 });
        const html = popupEls()[0]?.innerHTML ?? '';
        ok('12. bare-cast area — a WAITING demand still offers the roll, and says why it names nobody',
          (flag?.awaitingTemplate === true) && (popupEls().length === 1)
            && /not placed yet/i.test(html) && !/Against/i.test(html),
          `use=${used === 'timeout' ? 'raced-out' : 'resolved'} awaiting=${flag?.awaitingTemplate} `
            + `popups=${popupEls().length} saysWhy=${/not placed yet/i.test(html)} `
            + `namesNobody=${!/Against/i.test(html)}`);
        await closeEverything();
        await waitDamage(card, 6000);   // the dismissal rolls it; let it land before teardown
      }
    });

    /* teardown ----------------------------------------------------------------------------- */
    // ⚠ Settings first, each key in its own guard: a later cleanup error must never leave them pinned.
    for (const failed of await settings.restore()) log.push(`teardown settings ERROR: ${failed}`);
    await closeEverything();
    game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: false }); });
    // Any Region the bare cast left behind goes too.
    const strayTemplates = canvas.scene.regions
      .filter(r => r.getFlag('core', 'MeasuredTemplate') && !r.getFlag('dnd5e', 'activity')).map(r => r.id);
    if (strayTemplates.length) {
      await canvas.scene.deleteEmbeddedDocuments('Region', strayTemplates).catch(() => {});
    }
    await ChatMessage.deleteDocuments([...new Set(created)].filter(id => game.messages.has(id)))
      .catch(() => {});
    for (const doc of [tokA, tokB, tokC, tokD, tokE, tokF]) {
      await canvas.scene.deleteEmbeddedDocuments('Token', [doc.id]).catch(() => {});
    }
    for (const a of [caster, tgtA, tgtB, tgtC, tgtD, tgtE, tgtF]) await a.delete().catch(() => {});
    const drifted = KEYS.filter(k => JSON.stringify(game.settings.get(MOD, k)) !== JSON.stringify(prior[k]));

    return { scene: canvas.scene?.name, log, results, drifted };
  }, null);
  if (sd.fatal) {
    out.results.push({ name: '18. the save-path damage offer ran', pass: false,
      detail: `FATAL: ${sd.fatal}` });
  } else {
    for (const l of sd.log) out.log.push(`18: ${l}`);
    // In their numbered order; a section-level throw ("§18 threw — …") goes last, unprefixed.
    const numberOf = r => Number.parseInt(r.name, 10) || Number.MAX_SAFE_INTEGER;
    for (const a of sd.results.sort((p, q) => numberOf(p) - numberOf(q))) {
      const name = /^\d/.test(a.name) ? `18${String.fromCharCode(47)}${a.name}` : a.name;
      out.results.push({ name, pass: !!a.pass, detail: a.detail });
    }
    if (sd.drifted?.length) {
      out.results.push({ name: '18. §18 restored every setting it pinned', pass: false,
        detail: `DRIFTED: ${sd.drifted.join(', ')} — restore by hand` });
    }
  }
} else if (!out.fatal) {
  out.skips.push('§18 the player-rolled damage offer on the SAVE path');
}

await finish({ tag: 'saves', out, plan, f });
