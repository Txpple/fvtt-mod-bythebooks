// By the Books rest smoke test: the rest grants. Resourceful's Heroic Inspiration on a Long Rest
// (§1–2); Musician's popup after a rest listing allies within 30 ft, those already inspired greyed
// (§4–6), its landing's own card, float and moment (§7); Inspiring Leader, Chef's Bolstering Treats and
// Replenishing Meal (§8–11). Every rest-grant row is always on: a section isolates its row by the
// Halfling holding only the feat under test.
// Fixture: BTB Test Halfling is lent the PHB feats for the run. The song's sections place TEMPORARY
// linked tokens (the Halfling; BTB Test Cleric 10 ft, Bard 15 ft and already inspired, Fighter 40 ft)
// in a strip found empty at run time.
// Harness discipline: lent items, placed tokens and messages deleted; every
// touched actor's HP, Hit Dice, temp HP, uses and inspiration restored. Sections: `--section 2`, `--list`.
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from './harness.mjs';

// The coverage map (tools/coverage-map.mjs) — ⚠ NEVER import a suite; the map is parsed.
export const COVERS = [
  'rest-grants.js'          // §1–§2 — the grant on the rest's own update, the card's line; §4–§11 the song to allies (§7 its card, float and moment)
];

const SECTIONS = {
  1: 'a Long Rest with Resourceful: the Heroic Inspiration box is ticked, and the rest card says "Heroic Inspiration gained"',
  2: 'a Short Rest: nothing is given',
  4: 'Musician after a Long Rest: the card lists the allies within 30 ft (not the one at 40), the popup ticks the one without Heroic Inspiration and greys the one with it ("(has it)"); OK gives it, the card names who',
  5: 'Musician after a Short Rest: it asks too',
  6: 'every ally within 30 ft already has Heroic Inspiration: no card, no popup',
  7: 'Musician\'s song lands on two allies: its own card ("Encouraging Song — Heroic Inspiration: <the Cleric>, <the Bard>", sung by the Halfling, the rule under a closed tick), "+Heroic Inspiration" floating in white over each recipient\'s token, and the restSong moment carrying the singer, its Musician feat as the item and both recipients as targets',
  8: 'Inspiring Leader (the PHB feats, group 5) after a Short Rest: the amount read off its activity (level + the higher of Wis/Cha on a copy with no ASI record), up to six, the owner too, within 30 ft; a creature holding more is greyed; OK gives the temp HP',
  9: 'Chef after a Long Rest: Bolstering Treats handed out as the Proficiency Bonus in temp HP, up to that many, every ally on the scene; no meal on a Long Rest',
  10: 'Chef after a Short Rest: Replenishing Meal — the Cleric rested first and spent Hit Dice (healed 1d8 now, its dice on a card), the Fighter spent none (greyed), the Bard still resting (carries the meal); every Short Rest card records its Hit Dice',
  11: 'the Bard\'s own Short Rest ends with Hit Dice spent: the meal heals it then'
};
const DEPENDS = { 11: ['10'] };

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'rest', watchdogMs: 180_000 });
announcePlan('rest', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, watch, canvasReady, tokenOn } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const suiteStart = Date.now();

  const modDoc = game.modules.get(MOD);
  if (!modDoc?.active) return { fatal: `module active=${modDoc?.active}` };
  if (!game.settings.settings.has(`${MOD}.decisionTimer`)) return { fatal: 'decisionTimer not registered — OLD code (reload the box)' };

  const actor = game.actors.getName('BTB Test Halfling');
  if (!actor || (actor.type !== 'character')) return { fatal: 'missing fixture: BTB Test Halfling (a character) — run tools/fixture-suite.mjs' };
  const snapshot = actor.toObject();
  const lent = [];
  const placed = [];      // the song's temporary tokens
  const snapshots = [];   // the song's allies' inspiration
  let restored = false;
  const teardown = async () => {
    if (restored) return;
    restored = true;
    try {
      const scene = game.scenes.getName('By the Books Test Range');
      const live = placed.filter(id => scene?.tokens.get(id));
      if (live.length) await scene.deleteEmbeddedDocuments('Token', live);
      for (const s of snapshots) {
        if (s.whole) {
          await s.actor.update({ system: { attributes: s.whole.system.attributes } }, { isRest: true });
          const classes = s.whole.items.filter(i => (i.type === 'class') && s.actor.items.get(i._id))
            .map(i => ({ _id: i._id, 'system.hd.spent': i.system?.hd?.spent ?? 0 }));
          if (classes.length) await s.actor.updateEmbeddedDocuments('Item', classes);
          if (s.actor.getFlag(MOD, 'mealFed')) await s.actor.unsetFlag(MOD, 'mealFed');
        }
        for (const a of game.actors.filter(x => x.getFlag(MOD, 'mealFed'))) await a.unsetFlag(MOD, 'mealFed');
        await s.actor.update({ 'system.attributes.inspiration': s.inspiration });
      }
    } catch (err) { log.push(`TEARDOWN tokens ERROR: ${err?.message}`); }
    try {
      const live = lent.filter(id => actor.items.get(id));
      if (live.length) await actor.deleteEmbeddedDocuments('Item', live);
      await actor.update({ system: { attributes: snapshot.system.attributes } }, { isRest: true });
      const items = snapshot.items.filter(i => actor.items.get(i._id)).map(i => ({ _id: i._id, 'system.uses': i.system?.uses ?? {} }));
      if (items.length) await actor.updateEmbeddedDocuments('Item', items);
      const mine = game.messages.filter(m => (m.timestamp >= suiteStart) && ((m.speaker?.actor === actor.id) || Object.keys(m.flags?.[MOD] ?? {}).length));
      if (mine.length) await ChatMessage.deleteDocuments(mine.map(m => m.id));
    } catch (err) {
      log.push(`TEARDOWN ERROR: ${err?.message}`);
    }
  };

  try {
    // Lend Resourceful from the PHB, found by name in the pack's indexes.
    let source = null;
    for (const pack of game.packs.filter(p => (p.metadata.packageName === 'dnd-players-handbook') && (p.documentName === 'Item'))) {
      const hit = (await pack.getIndex()).find(e => e.name === 'Resourceful');
      if (hit) { source = await pack.getDocument(hit._id); break; }
    }
    if (!source) return { fatal: 'the PHB ships no "Resourceful" item this box can find' };
    if (!actor.items.some(i => i.name === 'Resourceful')) {
      const [item] = await actor.createEmbeddedDocuments('Item', [source.toObject()]);
      lent.push(item.id);
    }
    const inspired = () => actor.system.attributes.inspiration === true;
    const clear = () => actor.update({ 'system.attributes.inspiration': false });
    const lastRestCard = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && (m.speaker?.actor === actor.id)).pop() ?? null;
    const textOf = id => (document.querySelector(`.message[data-message-id="${id}"]`)?.textContent ?? '').replace(/\s+/g, ' ');

    // ================================================== 1. a Long Rest
    if (want(1)) await section(1, async () => {
      await clear();
      await actor.longRest({ dialog: false, chat: true, newDay: false, advanceTime: false });
      // The rendered line is the last to land (the inspiration rides the rest's own update).
      await until(() => /Heroic Inspiration gained/.test(textOf(lastRestCard()?.id)), { label: 'the rest card\'s "Heroic Inspiration gained" line' });
      const card = lastRestCard();
      ok('1a. the Long Rest ticked Heroic Inspiration', inspired(), `inspiration=${actor.system.attributes.inspiration}`);
      ok('1b. the rest card says "Heroic Inspiration gained" (Resourceful)',
        (card?.getFlag(MOD, 'restGrant') ?? []).some(g => g.name === 'Resourceful') && /Heroic Inspiration gained/.test(textOf(card?.id)),
        `flag=${JSON.stringify(card?.getFlag(MOD, 'restGrant'))} text="${textOf(card?.id).slice(-120)}"`);
    });

    // ================================================== 2. a Short Rest
    if (want(2)) await section(2, async () => {
      await clear();
      await actor.shortRest({ dialog: false, chat: true, advanceTime: false });
      const given = await watch(() => inspired(), { ms: 600 });
      ok('2a. a Short Rest gives nothing', !given && !inspired(), `inspiration=${actor.system.attributes.inspiration}${given ? ' (ticked in the window)' : ''}`);
    });

    // ================================================== 4–7. the song
    // A lent feat taken back, so the next section's rest raises only the row under test.
    const unlend = async name => {
      const ids = lent.filter(id => actor.items.get(id)?.name === name);
      if (ids.length) await actor.deleteEmbeddedDocuments('Item', ids);
      for (const id of ids) lent.splice(lent.indexOf(id), 1);
    };

    if (['4', '5', '6', '7', '8', '9', '10', '11'].some(id => !sections || sections.includes(id))) {
      await unlend('Resourceful');   // the Halfling's own box stays out of the song
      let musician = null;
      for (const pack of game.packs.filter(p => (p.metadata.packageName === 'dnd-players-handbook') && (p.documentName === 'Item'))) {
        const hit = (await pack.getIndex()).find(e => e.name === 'Musician');
        if (hit) { musician = await pack.getDocument(hit._id); break; }
      }
      if (!musician) return { fatal: 'the PHB ships no "Musician" item this box can find', results, log, skips };
      if (!actor.items.some(i => i.name === 'Musician')) {
        const [item] = await actor.createEmbeddedDocuments('Item', [musician.toObject()]);
        lent.push(item.id);
      }
      const scene = game.scenes.getName('By the Books Test Range');
      if (!scene) return { fatal: 'missing fixture: the By the Books Test Range scene — run tools/fixture-suite.mjs', results, log, skips };
      if (canvas.scene?.id !== scene.id) await scene.view();
      await canvasReady();
      const g = scene.grid.size;
      const allies = ['BTB Test Cleric', 'BTB Test Bard', 'BTB Test Fighter'].map(n => game.actors.getName(n));
      if (allies.some(a => !a || (a.type !== 'character'))) return { fatal: `missing fixture characters: ${allies.map(a => a?.name ?? '?').join(', ')}`, results, log, skips };
      const [cleric, bard, fighter] = allies;
      for (const a of allies) snapshots.push({ actor: a, inspiration: a.system.attributes.inspiration });
      // A strip of 10 squares on one row with nothing on it, three rows clear above and below.
      const occupied = (x, y) => scene.tokens.some(t => (t.x < (x + 1) * g) && ((t.x + t.width * g) > x * g) && (t.y < (y + 1) * g) && ((t.y + t.height * g) > y * g));
      let strip = null;
      for (let y = 3; (y < 17) && !strip; y++) {
        for (let x = 0; (x <= 10) && !strip; x++) {
          let clear = true;
          for (let dx = 0; (dx < 10) && clear; dx++) for (let dy = -1; (dy <= 1) && clear; dy++) if (occupied(x + dx, y + dy)) clear = false;
          if (clear) strip = { x, y };
        }
      }
      if (!strip) return { fatal: 'no empty 10-square strip on the test range for the song\'s tokens', results, log, skips };
      const place = async (a, dx) => {
        const [doc] = await scene.createEmbeddedDocuments('Token', [foundry.utils.mergeObject(a.prototypeToken.toObject(),
          { x: (strip.x + dx) * g, y: strip.y * g, actorId: a.id, actorLink: true, disposition: 1 }, { inplace: false })]);
        placed.push(doc.id);
        await tokenOn(doc.id);
        return canvas.tokens.get(doc.id);
      };
      const own = await place(actor, 0);
      await place(cleric, 2);    // 10 ft
      await place(bard, 3);      // 15 ft
      await place(fighter, 8);   // 40 ft
      own?.control({ releaseOthers: true });   // tokenOf: the controlled token is the actor's
      const songCard = (t0, row = 'Musician') => game.messages.contents.filter(m => (m.timestamp >= t0) && (m.getFlag(MOD, 'restSong')?.row === row)).pop() ?? null;
      const songPopup = () => [...foundry.applications.instances.values()]
        .find(app => app.rendered && (app.element?.textContent ?? '').includes('Who gets Heroic Inspiration')) ?? null;
      const boxOf = (app, a) => app?.element?.querySelector(`input[name="bf-rest-song"][value="${a.uuid}"]`) ?? null;
      const prime = async () => {
        await cleric.update({ 'system.attributes.inspiration': false });
        await bard.update({ 'system.attributes.inspiration': true });
        await fighter.update({ 'system.attributes.inspiration': false });
      };

      if (want(4)) await section(4, async () => {
        await prime();
        const t0 = Date.now();
        await actor.longRest({ dialog: false, chat: true, newDay: false, advanceTime: false });
        const card = await until(() => songCard(t0), { timeout: 6000 });
        const flag = card?.getFlag(MOD, 'restSong');
        const names = (flag?.candidates ?? []).map(c => `${c.name}:${c.feet}${c.has ? ':has' : ''}`);
        ok('4a. the card lists the allies within 30 ft — the Cleric (10 ft), the Bard (15 ft, already has it) — and not the Fighter at 40',
          !!flag && flag.candidates.some(c => (c.uuid === cleric.uuid) && !c.has) && flag.candidates.some(c => (c.uuid === bard.uuid) && c.has)
            && !flag.candidates.some(c => c.uuid === fighter.uuid) && (flag.cap === Number(actor.system.attributes.prof)),
          `candidates=${names.join(', ')} cap=${flag?.cap} prof=${actor.system.attributes.prof}`);
        const app = await until(songPopup, { timeout: 6000 });
        const cb = boxOf(app, cleric), bb = boxOf(app, bard);
        ok('4b. the popup: the Cleric ticked, the Bard greyed and marked "(has it)"',
          !!cb?.checked && !cb?.disabled && !!bb?.disabled && !bb?.checked && /(has it)/.test(bb?.closest('label')?.textContent ?? ''),
          `popup=${!!app} cleric=${cb?.checked}/${cb?.disabled} bard=${bb?.checked}/${bb?.disabled}`);
        app?.element?.querySelector('button[data-action="ok"]')?.click();
        const landed = await until(() => card?.getFlag(MOD, 'restSong')?.applied, { timeout: 6000 });
        ok('4c. OK gives it: the Cleric has Heroic Inspiration, the Fighter does not, the card names the Cleric',
          !!landed && (cleric.system.attributes.inspiration === true) && (fighter.system.attributes.inspiration !== true)
            && (card.getFlag(MOD, 'restSong').given ?? []).includes(cleric.name),
          `applied=${!!landed} cleric=${cleric.system.attributes.inspiration} fighter=${fighter.system.attributes.inspiration} given=${JSON.stringify(card?.getFlag(MOD, 'restSong')?.given)}`);
      });

      if (want(5)) await section(5, async () => {
        await prime();
        const t0 = Date.now();
        await actor.shortRest({ dialog: false, chat: true, advanceTime: false });
        const card = await until(() => songCard(t0), { timeout: 6000 });
        ok('5a. a Short Rest asks too', !!card, `card=${!!card}`);
        // Only answered so the next section starts clear: nothing here reads the popup or the landing.
        const app = await until(songPopup, { timeout: 4000 }).catch(() => null);
        app?.element?.querySelector('button[data-action="ok"]')?.click();
        await until(() => card?.getFlag(MOD, 'restSong')?.applied, { timeout: 6000 }).catch(() => null);
      });

      if (want(6)) await section(6, async () => {
        await prime();
        await cleric.update({ 'system.attributes.inspiration': true });
        const t0 = Date.now();
        await actor.longRest({ dialog: false, chat: true, newDay: false, advanceTime: false });
        const asked = await watch(() => songCard(t0) || songPopup(), { ms: 1200 });
        ok('6a. everyone within 30 ft already has it: no card, no popup', !asked && !songCard(t0) && !songPopup(), `card=${!!songCard(t0)} popup=${!!songPopup()}${asked ? ' (one rose in the window)' : ''}`);
      });

      // ================================================== 8–11. temp HP grants and the meal
      // The same popup: Temporary Hit Points (Inspiring Leader, Chef's Bolstering Treats) and Chef's
      // Replenishing Meal. The amount is read off the lent feat's heal activity on the Halfling's sheet.
      const lendFeat = async name => {
        if (actor.items.some(i => i.name === name)) return actor.items.find(i => i.name === name);
        let doc = null;
        for (const pack of game.packs.filter(p => (p.metadata.packageName === 'dnd-players-handbook') && (p.documentName === 'Item'))) {
          const hit = (await pack.getIndex()).find(e => (e.name === name) && (e.type === 'feat'));
          if (hit) { doc = await pack.getDocument(hit._id); break; }
        }
        if (!doc) return null;
        const [item] = await actor.createEmbeddedDocuments('Item', [doc.toObject()]);
        lent.push(item.id);
        return item;
      };
      // Dialogs only: the chat log is an application too, and closing it stops every card rendering.
      const popupFor = text => [...foundry.applications.instances.values()]
        .find(app => app.rendered && (app instanceof foundry.applications.api.DialogV2)
          && (app.element?.textContent ?? '').includes(text)) ?? null;
      const tempOf = a => Number(a.system.attributes.hp.temp) || 0;
      // ⚠ A row with no reach lists EVERY ally on the scene: tick only the suite's own creatures before OK.
      const tickOnly = (app, keep) => {
        for (const box of app?.element?.querySelectorAll('input[name="bf-rest-song"]') ?? []) {
          // the cap greys unticked rows (disabled); only a "has it" row stays out of reach
          const on = !box.dataset.has && keep.some(a => a.uuid === box.value);
          box.checked = on;
          if (on) box.disabled = false;
        }
      };
      const hpOf = a => Number(a.system.attributes.hp.value) || 0;
      // Every creature this block touches keeps its hit points, Hit Dice and temp HP (teardown restores).
      for (const a of [actor, ...allies]) {
        if (!snapshots.some(s => s.actor === a && s.whole)) {
          const whole = a.toObject();
          snapshots.push({ actor: a, whole, inspiration: a.system.attributes.inspiration });
        }
      }

      if (want(7)) await section(7, async () => {
        await prime();
        await bard.update({ 'system.attributes.inspiration': false });   // two recipients: the Cleric and the Bard
        const realFloat = canvas.interface?.createScrollingText?.bind(canvas.interface);
        const floats = [];
        if (canvas.interface) canvas.interface.createScrollingText = (origin, text, opts) => {
          floats.push({ x: origin?.x, y: origin?.y, text: String(text), fill: opts?.fill ?? null });
          return realFloat?.(origin, text, opts);
        };
        const moments = [];
        const hook = Hooks.on('bythebooks.moment', p => moments.push(p));
        try {
          const t0 = Date.now();
          await actor.longRest({ dialog: false, chat: true, newDay: false, advanceTime: false });
          const card = await until(() => songCard(t0), { timeout: 6000 });
          const app = await until(songPopup, { timeout: 6000 });
          tickOnly(app, [cleric, bard]);
          app?.element?.querySelector('button[data-action="ok"]')?.click();
          const landed = await until(() => card?.getFlag(MOD, 'restSong')?.applied ? card.getFlag(MOD, 'restSong') : null, { timeout: 8000 });
          const nameOf = a => landed?.candidates?.find(c => c.uuid === a.uuid)?.name ?? a.name;
          const given = landed?.given ?? [];
          const title = `Encouraging Song — Heroic Inspiration: ${given.join(', ')}`;
          // The card as the chat log draws it: its text and its fold.
          const settle = await until(() => game.messages.contents.find(m => (m.timestamp >= t0) && (m.id !== card.id) && (m.content ?? '').includes(title)
            && textOf(m.id).includes('sung by')) ?? null, { timeout: 6000, label: 'the song\'s own card' }).catch(() => null);
          const fold = settle ? document.querySelector(`.message[data-message-id="${settle.id}"] details[data-bf-rule-fold]`) : null;
          ok('7a. the song lands its own card: "Encouraging Song — Heroic Inspiration: <the Cleric>, <the Bard>", spoken by the singer, "sung by" it, the rule under a closed tick',
            !!settle && given.includes(nameOf(cleric)) && given.includes(nameOf(bard)) && (given.length === 2)
              && (settle.speaker?.actor === actor.id) && textOf(settle.id).includes(`sung by ${actor.name}`) && !!fold && !fold.open
              && (cleric.system.attributes.inspiration === true) && (bard.system.attributes.inspiration === true),
            `settle=${!!settle} given=${JSON.stringify(given)} speaker=${settle?.speaker?.alias ?? null} fold=${fold ? (fold.open ? 'open' : 'closed') : 'none'} text="${settle ? textOf(settle.id).slice(0, 160) : ''}"`);
          // Every client floats its own copy off the landed record; this page is one of them.
          const tokOf = a => placed.map(id => canvas.tokens.get(id)).find(t => t?.actor?.uuid === a.uuid) ?? null;
          const over = (a, f) => { const t = tokOf(a); return !!t && (Math.abs(f.x - t.center.x) < 1) && (Math.abs(f.y - t.center.y) < 1); };
          await until(() => [cleric, bard].every(a => floats.some(f => (f.text === '+Heroic Inspiration') && over(a, f))), { timeout: 4000, label: 'the floats over both recipients' }).catch(() => null);
          const songFloats = floats.filter(f => f.text === '+Heroic Inspiration');
          ok('7b. "+Heroic Inspiration" floats in white over the Cleric\'s and the Bard\'s tokens, and over nobody else\'s',
            [cleric, bard].every(a => songFloats.some(f => over(a, f) && (String(f.fill).toLowerCase() === '#ffffff')))
              && ![actor, fighter].some(a => songFloats.some(f => over(a, f))),
            `floats=${JSON.stringify(songFloats)}`);
          const moment = await until(() => moments.find(p => (p.kind === 'restSong') && (p.messageId === card.id)) ?? null, { timeout: 4000, label: 'the restSong moment' }).catch(() => null);
          const tUuids = (moment?.targets ?? []).map(t => t.actorUuid);
          // The feat on the singer's sheet: the item a reader keys on (restSong is every hand-out's record).
          const feat = actor.items.find(i => i.name === 'Musician');
          ok('7c. the moment: bythebooks.moment "choice" (kind restSong) — the singer the actor, its Musician feat the item, the Cleric and the Bard the targets by actor uuid and name, grant inspiration; once',
            !!moment && (moment.event === 'choice') && (moment.actorUuid === actor.uuid) && (moment.ability === 'Musician')
              && !!feat && (moment.itemUuid === feat.uuid) && (moment.itemUuid === `${actor.uuid}.Item.${landed?.itemId}`) && (moment.itemName === feat.name)
              && (tUuids.length === 2) && tUuids.includes(cleric.uuid) && tUuids.includes(bard.uuid)
              && moment.targets.every(t => t.name === nameOf(t.actorUuid === cleric.uuid ? cleric : bard))
              && (moment.details?.grant === 'inspiration') && (moments.filter(p => p.momentId === moment.momentId).length === 1),
            `moment=${JSON.stringify(moment ? { event: moment.event, actor: moment.actorName, item: moment.itemUuid, itemName: moment.itemName, ability: moment.ability, targets: moment.targets, details: moment.details } : null)} feat=${feat?.uuid ?? null}`);
        } finally {
          Hooks.off('bythebooks.moment', hook);
          if (canvas.interface && realFloat) canvas.interface.createScrollingText = realFloat;
        }
      });

      if (want(8)) await section(8, async () => {
        await unlend('Musician');
        const feat = await lendFeat('Inspiring Leader');
        if (!feat) throw new Error('the PHB ships no "Inspiring Leader" feat this box can find');
        // The lent copy has no ASI record, so the higher of Wisdom and Charisma stands; the amount is level + that modifier.
        const mod = Math.max(actor.system.abilities.wis.mod, actor.system.abilities.cha.mod);
        const amount = Number(actor.system.details.level) + mod;
        await cleric.update({ 'system.attributes.hp.temp': 0 });
        await bard.update({ 'system.attributes.hp.temp': amount + 5 });   // holds more already — greyed
        await fighter.update({ 'system.attributes.hp.temp': 0 });
        await actor.update({ 'system.attributes.hp.temp': 0 });
        const t0 = Date.now();
        await actor.shortRest({ dialog: false, chat: true, advanceTime: false });
        const card = await until(() => songCard(t0, 'Inspiring Leader'), { timeout: 6000 });
        const flag = card?.getFlag(MOD, 'restSong');
        const names = (flag?.candidates ?? []).map(c => `${c.name}:${c.feet}${c.has ? ':has' : ''}`);
        ok('8a. Inspiring Leader after a Short Rest: the amount is the activity\'s (level + the higher of Wis/Cha), up to six, the owner too, within 30 ft',
          !!flag && (flag.grant === 'temphp') && (flag.amount === amount) && (flag.cap === 6)
            && flag.candidates.some(c => (c.uuid === actor.uuid) && c.self) && flag.candidates.some(c => (c.uuid === cleric.uuid) && !c.has)
            && flag.candidates.some(c => (c.uuid === bard.uuid) && c.has) && !flag.candidates.some(c => c.uuid === fighter.uuid),
          `amount=${flag?.amount} expected=${amount} cap=${flag?.cap} candidates=${names.join(', ')}`);
        const app = await until(() => popupFor(`Who gets ${amount} Temporary Hit Points`), { timeout: 6000 });
        const bb = boxOf(app, bard);
        ok('8b. the popup asks "Who gets N Temporary Hit Points?", the Bard greyed with what it holds',
          !!app && !!bb?.disabled && /temp HP/.test(bb?.closest('label')?.textContent ?? ''),
          `popup=${!!app} bard=${bb?.disabled} "${(bb?.closest('label')?.textContent ?? '').replace(/\s+/g, ' ').trim()}"`);
        app?.element?.querySelector('button[data-action="ok"]')?.click();
        const landed = await until(() => card?.getFlag(MOD, 'restSong')?.applied, { timeout: 6000 });
        ok('8c. OK gives it: the Cleric and the leader hold the amount, the Bard keeps its larger pool, the Fighter (40 ft) nothing',
          !!landed && (tempOf(cleric) === amount) && (tempOf(actor) === amount) && (tempOf(bard) === amount + 5) && (tempOf(fighter) === 0),
          `cleric=${tempOf(cleric)} self=${tempOf(actor)} bard=${tempOf(bard)} fighter=${tempOf(fighter)} amount=${amount}`);

        // 8d. A feat taken through its ASI names the ability (here the LOWER one, Charisma), so the
        // amount is level + 0; the rest card's row is "Inspire with Performance". The live item's
        // advancement is a collection (`feat.advancement.byId`, lookup.js asiAssigned); the write
        // goes to the SOURCE (keyed by id or a list), written back whole.
        const asi = Object.values(feat.advancement?.byId ?? {}).find(v => v?.type === 'AbilityScoreImprovement');
        if (!asi) skips.push('8d. the lent feat carries no Ability Score Improvement advancement');
        else {
          const was = { wis: actor.system.abilities.wis.value, cha: actor.system.abilities.cha.value };
          await actor.update({ 'system.abilities.wis.value': 16, 'system.abilities.cha.value': 10 });
          // The scores go back even when a wait below throws: teardown restores the attributes, not the abilities.
          try {
            const src = foundry.utils.deepClone(feat.toObject().system.advancement);
            const row = Array.isArray(src) ? src.find(r => r._id === asi.id) : src[asi.id];
            foundry.utils.setProperty(row, 'value.assignments', { cha: 1 });
            await feat.update({ 'system.advancement': src });
            for (const a of [actor, cleric, bard, fighter]) await a.update({ 'system.attributes.hp.temp': 0 });
            const want8d = Number(actor.system.details.level) + actor.system.abilities.cha.mod;
            const t1 = Date.now();
            await actor.shortRest({ dialog: false, chat: true, advanceTime: false });
            const card8d = await until(() => songCard(t1, 'Inspiring Leader'), { timeout: 6000 });
            const f8d = card8d?.getFlag(MOD, 'restSong');
            // The rest card's rows are drawn after the document: wait for its Inspire row; absent, the
            // check reads (and its detail names) what the card shows.
            const restNow = () => game.messages.contents.find(m => (m.timestamp >= t1) && (m.type === 'rest'));
            const rowsOf = m => [...(document.querySelector(`#chat [data-message-id="${m?.id}"]`)?.querySelectorAll('.activities li.activity') ?? [])];
            await until(() => rowsOf(restNow()).some(li => /Inspire with/.test(li.querySelector('.subtitle')?.textContent ?? '')),
              { label: 'the rest card\'s Inspire row drawn' }).catch(() => null);
            const rest = restNow();
            const rows = rowsOf(rest);
            const subs = rows.map(li => li.querySelector('.subtitle')?.textContent?.trim());
            ok('8d. the feat’s own Ability Score Improvement names the ability (Charisma, the lower): level + its modifier; the rest card lists ONE row, "Inspire with Performance"',
              (f8d?.amount === want8d) && (subs.filter(n => /Inspire with/.test(n ?? '')).length === 1) && subs.includes('Inspire with Performance'),
              `amount=${f8d?.amount} expected=${want8d} rows=[${subs.join(' | ')}] rest=${rest?.id}/${rest?.system?.type}/${rest?.system?.actor?.uuid} lis=[${rows.map(li => li.dataset.activityUuid).join(',')}] acts=[${[...feat.system.activities].map(x => x.uuid).join(',')}]`);
            // Only closed so the next section starts clear: nothing reads it.
            const app8d = await until(() => popupFor('Temporary Hit Points'), { timeout: 6000 }).catch(() => null);
            app8d?.close?.();
          } finally {
            await actor.update({ 'system.abilities.wis.value': was.wis, 'system.abilities.cha.value': was.cha });
          }
        }
      });

      if (want(9)) await section(9, async () => {
        await unlend('Musician');
        await unlend('Inspiring Leader');
        const chef = await lendFeat('Chef');
        if (!chef) throw new Error('the PHB ships no "Chef" feat this box can find');
        const prof = Number(actor.system.attributes.prof);
        for (const a of [actor, cleric, bard, fighter]) await a.update({ 'system.attributes.hp.temp': 0 });
        const t0 = Date.now();
        await actor.longRest({ dialog: false, chat: true, newDay: false, advanceTime: false });
        const card = await until(() => songCard(t0, 'Bolstering Treats'), { timeout: 6000 });
        const flag = card?.getFlag(MOD, 'restSong');
        ok('9a. Chef after a Long Rest: Bolstering Treats handed out — the Proficiency Bonus as Temporary Hit Points, up to that many, every ally on the scene (the Fighter at 40 ft too)',
          !!flag && (flag.row === 'Bolstering Treats') && (flag.amount === prof) && (flag.cap === prof) && (flag.reach === null)
            && flag.candidates.some(c => c.uuid === fighter.uuid),
          `row=${flag?.row} amount=${flag?.amount} cap=${flag?.cap} reach=${flag?.reach} candidates=${(flag?.candidates ?? []).map(c => c.name).join(', ')}`);
        const app = await until(() => popupFor(`Who gets ${prof} Temporary Hit Points`), { timeout: 6000 });
        const startTicked = [...(app?.element?.querySelectorAll('input[name="bf-rest-song"]:checked') ?? [])].length;
        const mine = [cleric, fighter].slice(0, prof);
        tickOnly(app, mine);
        app?.element?.querySelector('button[data-action="ok"]')?.click();
        await until(() => card?.getFlag(MOD, 'restSong')?.applied, { timeout: 6000 });
        const given = [actor, cleric, bard, fighter].filter(a => tempOf(a) === prof).map(a => a.uuid);
        ok('9b. the first cap-many start ticked; OK gives exactly the picked the treats (the Cleric, the Fighter at 40 ft)',
          (startTicked === Math.min(prof, flag?.candidates?.length ?? 0)) && (given.length === mine.length) && mine.every(a => given.includes(a.uuid)),
          `startTicked=${startTicked} given=${given.length} picked=${mine.length} prof=${prof}`);
        ok('9c. a Long Rest is not Replenishing Meal\'s — no meal card', !game.messages.contents.some(m => (m.timestamp >= t0) && (m.getFlag(MOD, 'restSong')?.row === 'Replenishing Meal')),
          'a meal card appeared on a Long Rest');
      });

      // The meal in both orders: the Cleric rested (Hit Dice spent), the Fighter rested (none), the
      // Bard has not yet; then the Chef's own Short Rest asks.
      let mealCard = null;
      if (want(10)) await section(10, async () => {
        await unlend('Musician');
        await unlend('Inspiring Leader');
        if (!await lendFeat('Chef')) throw new Error('the PHB ships no "Chef" feat this box can find');
        const tLong = Date.now();
        await actor.longRest({ dialog: false, chat: false, newDay: false, advanceTime: false });   // Hit Dice back, a clean slate
        // The Treats this Long Rest raises (their card and popup) are dismissed below: wait for them to rise.
        await until(() => songCard(tLong, 'Bolstering Treats') && popupFor('Temporary Hit Points'),
          { label: 'the Long Rest\'s Bolstering Treats ask' }).catch(() => null);
        for (const m of game.messages.contents.filter(m => m.getFlag(MOD, 'restSong') && (m.timestamp >= suiteStart) && (m.getFlag(MOD, 'restSong').status === 'pending'))) await m.delete();
        popupFor('Temporary Hit Points')?.close?.();   // Chef's treats ride that Long Rest too: their ask is dismissed
        for (const a of [cleric, bard, fighter]) await a.longRest({ dialog: false, chat: false, newDay: false, advanceTime: false });
        // Every rest ask still pending (the Treats of that Long Rest, an earlier section's) goes, with its popup:
        // one popup per creature at a time, so a stale one would hold the meal's.
        for (const m of game.messages.contents.filter(m => m.getFlag(MOD, 'restSong')?.status === 'pending')) await m.delete();
        for (const app of [...foundry.applications.instances.values()].filter(a => a.rendered && (a instanceof foundry.applications.api.DialogV2) && /— BTB Test Halfling$/.test(a.title ?? ''))) await app.close();
        await cleric.update({ 'system.attributes.hp.value': Math.max(1, cleric.system.attributes.hp.max - 20) });
        await bard.update({ 'system.attributes.hp.value': Math.max(1, bard.system.attributes.hp.max - 20) });
        // The Cleric rests first and spends Hit Dice (autoHD, no dialog); the Fighter rests at full HP and spends none.
        const tShort = Date.now();
        await cleric.shortRest({ dialog: false, chat: true, advanceTime: false, autoHD: true, autoHDThreshold: 1 });
        await fighter.shortRest({ dialog: false, chat: true, advanceTime: false });
        // Each Short Rest card's Hit Dice record lands after the card (10a and the meal read both).
        const restCardOf = a => game.messages.contents.filter(m => (m.timestamp >= tShort) && (m.type === 'rest') && (m.speaker?.actor === a.id)).pop();
        await until(() => restCardOf(cleric)?.getFlag(MOD, 'restSpent') && restCardOf(fighter)?.getFlag(MOD, 'restSpent'),
          { label: 'the Cleric\'s and the Fighter\'s Short Rest cards record their Hit Dice' });
        const clericCard = game.messages.contents.filter(m => (m.type === 'rest') && (m.speaker?.actor === cleric.id)).pop();
        const spentCleric = clericCard?.getFlag(MOD, 'restSpent');
        ok('10a. every Short Rest card records the Hit Dice its creature spent (the Cleric\'s, autoHD)',
          (spentCleric?.actorUuid === cleric.uuid) && (spentCleric?.hitDice > 0), JSON.stringify(spentCleric ?? null));
        const clericHp = hpOf(cleric);
        const t0 = Date.now();
        await actor.shortRest({ dialog: false, chat: true, advanceTime: false });
        mealCard = await until(() => game.messages.contents.filter(m => (m.timestamp >= t0) && (m.getFlag(MOD, 'restSong')?.row === 'Replenishing Meal')).pop(), { timeout: 6000 });
        const flag = mealCard?.getFlag(MOD, 'restSong');
        const cOf = a => flag?.candidates?.find(c => c.uuid === a.uuid);
        ok('10b. the Chef\'s Short Rest asks who eats — up to 4 + Proficiency Bonus; the Cleric spent Hit Dice, the Fighter spent none (greyed), the Bard is still resting',
          !!flag && (flag.grant === 'meal') && (flag.formula === '1d8') && (flag.cap === 4 + Number(actor.system.attributes.prof))
            && (cOf(cleric)?.meal === 'spent') && !cOf(cleric)?.has && (cOf(fighter)?.meal === 'none') && cOf(fighter)?.has
            && (cOf(bard)?.meal === 'resting') && !cOf(bard)?.has,
          `formula=${flag?.formula} cap=${flag?.cap} ${(flag?.candidates ?? []).map(c => `${c.name}:${c.meal}${c.has ? ':greyed' : ''}`).join(', ')}`);
        // One popup per creature at a time: any other grant of this rest (Inspiring Leader) is answered first.
        for (let i = 0; i < 20 && !popupFor('Who gets an extra 1d8 Hit Points'); i++) {
          const other = [...foundry.applications.instances.values()].find(a => a.rendered && (a instanceof foundry.applications.api.DialogV2) && /— BTB Test Halfling$/.test(a.title ?? ''));
          other?.element?.querySelector('button[data-action="ok"]')?.click();
          // Each try waits for the meal's popup, or for the answered one to close.
          await until(() => popupFor('Who gets an extra 1d8 Hit Points') || (other && !other.rendered), { timeout: 300 }).catch(() => null);
        }
        const app = await until(() => popupFor('Who gets an extra 1d8 Hit Points'), { timeout: 6000 });
        tickOnly(app, [cleric, bard]);
        app?.element?.querySelector('button[data-action="ok"]')?.click();
        const landed = await until(() => mealCard?.getFlag(MOD, 'restSong')?.applied, { timeout: 8000 });
        const served = await until(() => game.messages.contents.find(m => (m.timestamp >= t0) && (m.rolls?.length) && /Replenishing Meal/.test(m.content ?? '') && m.content.includes(cleric.name)), { timeout: 6000 });
        const gain = hpOf(cleric) - clericHp;
        const rolled = served?.rolls?.[0]?.total;
        ok('10c. OK: the Cleric (rested, Hit Dice spent) is healed now by the rolled 1d8, on one card with the dice',
          !!landed && !!served && Number.isFinite(rolled) && (rolled >= 1) && (rolled <= 8) && (gain === Math.min(rolled, cleric.system.attributes.hp.max - clericHp)),
          `served=${!!served} rolled=${rolled} gain=${gain}`);
        const fed = bard.getFlag(MOD, 'mealFed');
        ok('10d. the Bard, still resting, carries the meal to its own rest\'s end; the card says it waits',
          (fed?.formula === '1d8') && ((mealCard?.getFlag(MOD, 'restSong')?.waiting ?? []).join() === bard.name),
          `fed=${JSON.stringify(fed ?? null)} waiting=${JSON.stringify(mealCard?.getFlag(MOD, 'restSong')?.waiting)}`);
      });

      if (want(11)) await section(11, async () => {
        if (!bard.getFlag(MOD, 'mealFed')) {
          skips.push('§11 needs §10 (the Bard carrying the meal)');
        } else {
          const before = hpOf(bard);
          const t1 = Date.now();
          await bard.shortRest({ dialog: false, chat: true, advanceTime: false, autoHD: true, autoHDThreshold: 1 });
          const served = await until(() => game.messages.contents.find(m => (m.timestamp >= t1) && (m.rolls?.length) && /Replenishing Meal/.test(m.content ?? '') && m.content.includes(bard.name)), { timeout: 8000 });
          await until(() => !bard.getFlag(MOD, 'mealFed'), { timeout: 4000 });
          const restCard = game.messages.contents.filter(m => (m.type === 'rest') && (m.speaker?.actor === bard.id)).pop();
          const spent = restCard?.getFlag(MOD, 'restSpent')?.hitDice ?? 0;
          ok('11a. the Bard\'s own Short Rest ends with Hit Dice spent: the meal\'s 1d8 heals it then, its card with the dice, and the mark is gone',
            (spent > 0) && !!served && !bard.getFlag(MOD, 'mealFed') && (hpOf(bard) > before),
            `spent=${spent} served=${!!served} fed=${!!bard.getFlag(MOD, 'mealFed')} hp ${before} → ${hpOf(bard)}`);
        }
      });
    }

    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  } finally {
    await teardown();
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: 'rest', out, plan, f });
