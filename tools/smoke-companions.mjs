// Live suite: COMPANIONS (RULINGS *Summons*, call 12 and the Battle Familiar pass) — Find Familiar's whole life on one
// caster, with ONE invariant read after every step: exactly one companion effect on the caster, exactly one familiar
// token on the scene, exactly one standing record in the log (zero of each once dismissed). The thing a table sees as
// "two familiar effects at once" is what this suite exists to catch: a new form landing while the old one is dismissed,
// the pocket and the recall, a new form summoned into the pocket, two casts fired back to back, the fall at 0 HP, and an
// orphan effect (its card gone from the log) swept at the next landing. The familiar's token sees (RULINGS *Summons*,
// call 60), and it lands under the name its owner gave it, remembered on the caster for the next summon (call 61).
//
// Fixtures: BTB Test Sorcerer (tools/fixture-suite.mjs) is lent the PHB's Find Familiar for the run. The records are
// answered through the pure fold and a `toCard` use (which passes the companion menu as its "Summon"), never the popup:
// a name rides the answer as the menu's field would carry it. The cards, the imported beasts, the tokens, the companion
// effects, the lent spell and the caster's remembered name are torn down.
//
// §9 holds TWO GM CLIENTS (suite issue #8): the assistant identity joins beside the suite's while a Find Familiar
// landing is answered, and the record lands once (tools/gm-clients.mjs, the arrival landing).
//
// Sections: `--section 3`, `--list`. Fixtures and teardown ALWAYS run.
import { arrivalLanding, judgeArrival } from './gm-clients.mjs';
import { announcePlan, connectSuite, finish, loadEnv, sectionArg, sectionPlan } from './harness.mjs';
import { gmIdentity } from './target.mjs';

// THE COVERAGE MAP (tools/coverage-map.mjs) — ⚠ NEVER import a suite; the map is parsed.
export const COVERS = [
  'summons.js'   // §1 the first landing (its token sees), §2 a new form replaces the old, §3 the pocket and the recall (it comes back seeing), §4 a new form into the pocket, §5 Dismiss forever, §6 two casts back to back, §7 the fall at 0 HP, §8 an orphan swept, §9 a landing as a second GM client arrives (the claim, the snapshot guard), §10 the familiar's name and its memory, §11 the Vestige's name, its own memory, §12 one seat across the pocket, the combat line's side, the hand-delete prompt, §13 a token teleported to another scene keeps its record; put away there, called back home
];

// §9's second GM client (target.mjs GM_IDENTITIES): the preflight allows exactly these.
export const GM_CLIENTS = ['suite', 'assistant'];

const SECTIONS = {
  1: 'THE FIRST LANDING: Find Familiar answered as an Owl lands beside the caster — one companion effect "Familiar: Owl (Fey)", one token, one standing record; its token sees (the Owl\'s Darkvision 120 ft)',
  2: 'A NEW FORM: the spell cast again (the menu\'s Summon) answered as a Bat — the Bat lands in the Owl\'s square, the Owl\'s record is dismissed and its effect gone; one effect, one token, one record',
  3: 'THE POCKET AND BACK: put away — one effect "· in the pocket", no token; called back — one effect, one token, and it sees',
  4: 'A NEW FORM INTO THE POCKET: put away, then cast again answered as a Cat — the Cat waits in the pocket, no token, one effect naming the Cat; called back — one token',
  5: 'DISMISS FOREVER: no companion effect, no token, no standing record',
  6: 'TWO CASTS BACK TO BACK: two uses fired before either is answered, both answered — the later lands, the earlier is dismissed; one effect, one token, one record',
  7: 'THE FALL: the familiar at 0 HP disappears — no effect, no token, the card says so',
  8: 'AN ORPHAN SWEPT: a companion effect left on the caster naming a card no longer in the log is removed by the next landing; one effect after it',
  9: 'TWO GM CLIENTS (an Assistant GM beside the suite\'s; a Gamemaster beside an Assistant waits for the gm2 user): Find Familiar answered as the assistant client arrives lands once — one claim, one token, one companion effect, one moment, no extra card',
  10: 'THE NAME: answered as an Owl named Pip — the token and its creature are Pip, the effect "Familiar: Pip (Fey)", the card "Pip — summoned" with "Owl", the world Owl keeps its name, the caster remembers Pip; cast again as a Cat with the field as the menu pre-fills it — Pip, a Cat, in the Owl\'s square; cast again with the field cleared — the Rat lands as Rat and the caster forgets; an answer with no field leaves the memory alone',
  11: 'THE VESTIGE\'S NAME (Arcana Unleashed\'s Vestige Companion, lent to the Sorcerer): with the familiar remembered as Pip, the Fiendish vestige answered as Ash lands as Ash — its token and its creature, the effect "Vestige: Ash" — and seeing; the caster remembers Ash for the Vestige and still Pip for the familiar; Dismiss takes it',
  12: 'ONE SEAT AND A GUARDED DELETE: an Owl on the table in a combat beside its caster (17 and 10) — the combat line tags no "(foe)" on it; put away, its seat goes and the 10 is kept; called back, one seat at 10 and no second roll; deleted by hand, the token stays and the prompt asks; dismissed, nothing left',
  13: 'ACROSS SCENES: the Owl moved to a second scene the way Foundry\'s teleport moves it (cloned there with its flags, the old token deleted with `replacements`) — its record follows the new token; put away from there, no token on either scene, the effect in the pocket, a snapshot kept; called back beside its caster — one token; dismissed, nothing left'
};
const DEPENDS = { 2: [1], 3: [2], 4: [3], 5: [4], 7: [6] };

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'companions', watchdogMs: 360_000 });
announcePlan('companions', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, viewScene } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const suiteStart = Date.now();

  const modDoc = game.modules.get(MOD);
  if (!modDoc?.active) return { fatal: `module active=${modDoc?.active}` };
  const api = modDoc.api?.summons;
  if (!api?.askDismiss) return { fatal: 'no summons api — OLD code (reload the box)' };
  const { placedAnswer, companionAsk } = await import(`/modules/${MOD}/scripts/decide/summons.js`);
  const { SUMMON_CHOICES } = await import(`/modules/${MOD}/scripts/decide/registry.js`);
  const { poolFromPacks } = await import(`/modules/${MOD}/scripts/gallery.js`);

  const caster = game.actors.getName('BTB Test Sorcerer');
  if (!caster) return { fatal: 'missing fixture: BTB Test Sorcerer — run tools/fixture-suite.mjs' };
  const range = game.scenes.getName('By the Books Test Range');
  if (!range) return { fatal: 'missing fixture: scene By the Books Test Range — run tools/fixture-suite.mjs' };
  await viewScene(range).catch(() => null);   // the fatal below names a canvas that never readied
  if (canvas.scene?.id !== range.id) return { fatal: 'the canvas never readied on the test range' };
  const casterToken = canvas.scene.tokens.find(t => t.actor?.id === caster.id) ?? null;
  if (!casterToken) return { fatal: 'the Sorcerer has no token on the scene — run tools/fixture-suite.mjs' };
  const grid = canvas.scene.grid.size;
  // a token's eyes: sight as stored (the landing's), the range and mode as dnd5e prepares them off the senses
  const senseSync = game.settings.get('dnd5e', 'senseVisionSync') !== false;
  const eyes = tok => ({ on: !!tok?._source?.sight?.enabled, range: tok?.sight?.range ?? null, mode: tok?.sight?.visionMode ?? null, sync: senseSync });
  const seesWith = (tok, range) => { const e = eyes(tok); return e.on && (!e.sync || ((Number(e.range) === range) && (e.mode === 'darkvision'))); };
  // the name the menu's field would be pre-filled with (summons.js reads the same flag through the same fold)
  const { rememberedName } = await import(`/modules/${MOD}/scripts/decide/summons.js`);
  const remembered = () => rememberedName(caster.getFlag(MOD, 'petNames')?.names ?? [], 'Find Familiar');

  const lent = [];
  const madeActors = [];
  const madeMessages = [];
  const madeTokens = new Set();
  const closeDialogs = async () => {
    for (const app of foundry.applications.instances.values()) {
      if (/Find Familiar/.test(app.element?.textContent ?? '') && (app instanceof foundry.applications.api.DialogV2)) { try { await app.close(); } catch { /* gone */ } }
    }
  };
  const familiarTokens = () => canvas.scene.tokens.filter(t => madeTokens.has(t.id) || /^(Owl|Bat|Cat|Rat)$/.test(t.name) && t.actor?.getFlag('dnd5e', 'summon'));
  const teardown = async () => {
    try {
      await closeDialogs();
      const tokens = familiarTokens().map(t => t.id);
      if (tokens.length) await canvas.scene.deleteEmbeddedDocuments('Token', tokens, { 'fvtt-mod-bythebooks': { companionEnd: true } });
      for (const e of caster.effects.filter(e => /^Familiar:/.test(e.name) || e.getFlag(MOD, 'companion'))) { try { await e.delete({ [MOD]: { companionEnd: true } }); } catch { try { await e.delete(); } catch { /* gone */ } } }
      if (caster.getFlag(MOD, 'petNames') !== undefined) await caster.unsetFlag(MOD, 'petNames');
      const live = caster.items.filter(i => lent.includes(i.id) || ((i.type === 'spell') && (i.name === 'Find Familiar'))).map(i => i.id);
      if (live.length) await caster.deleteEmbeddedDocuments('Item', live);
      for (const a of madeActors) { if (game.actors.get(a.id)) await a.delete({ 'fvtt-mod-bythebooks': { companionEnd: true } }); }
      const mine = game.messages.filter(m => (m.timestamp >= suiteStart) && (m.speaker?.alias?.startsWith?.('BTB Test') || Object.keys(m.flags?.[MOD] ?? {}).length));
      if (mine.length) await ChatMessage.deleteDocuments(mine.map(m => m.id));
    } catch (err) { log.push(`TEARDOWN ERROR: ${err?.message}`); }
  };

  // ---- the invariant
  // Only this caster's records: a familiar another caster stands on the table (a hand walk's, a campaign's) is not this suite's.
  const ownRecord = f => (typeof f?.sourceUuid === 'string') && f.sourceUuid.endsWith(`Actor.${caster.id}`);
  const records = () => game.messages.contents.map(m => ({ id: m.id, flag: m.getFlag(MOD, 'summon') })).filter(r => ownRecord(r.flag));
  const standingRecords = () => records().filter(({ flag }) => flag.applied && !flag.dismissAsked && !flag.dismissed && (flag.outcome !== 'failed') && flag.companion && (flag.companion.state !== 'gone'));
  const companionEffects = () => caster.effects.filter(e => !!e.getFlag(MOD, 'companion'));
  const state = () => ({ effects: companionEffects().map(e => e.name), tokens: familiarTokens().map(t => t.name), records: standingRecords().map(r => `${r.id}:${r.flag.summonName}:${r.flag.companion.state}`) });
  const invariant = async (section, { effects = 1, tokens = 1, records: n = 1, named = null, pocket = null } = {}) => {
    // the old one's dismissal and the new one's landing are two writes: wait for the counts to settle;
    // counts that never settle are this ok's to report, with the state
    await until(() => (companionEffects().length === effects) && (familiarTokens().length === tokens) && (standingRecords().length === n) ? true : null, { timeout: 15000 }).catch(() => null);
    const s = state();
    const nameOk = named ? s.effects.some(e => e.includes(named)) : true;
    const pocketOk = (pocket === null) ? true : s.effects.every(e => e.includes('in the pocket') === pocket);
    ok(`§${section} invariant: ${effects} companion effect(s), ${tokens} token(s), ${n} standing record(s)${named ? `, named ${named}` : ''}${pocket === null ? '' : pocket ? ', in the pocket' : ', on the table'}`,
      (s.effects.length === effects) && (s.tokens.length === tokens) && (s.records.length === n) && nameOk && pocketOk, JSON.stringify(s));
    return s;
  };

  // ---- the drivers
  let spell = null;
  let summon = null;
  const beast = async name => (await poolFromPacks({ crMax: 0, types: ['beast'] })).find(r => r.name === name) ?? null;
  // a cast sent to its card; with a companion standing it is the menu's "Summon" (the new form takes the old one's place)
  const cast = async () => {
    const result = await summon.use({ [MOD]: { toCard: true }, create: { measuredTemplate: false, summons: false }, consume: { spellSlot: false } }, { configure: false }, { create: true });
    const message = result?.message instanceof ChatMessage ? result.message : null;
    if (message) madeMessages.push(message);
    const flag = await until(() => message?.getFlag(MOD, 'summon')?.status === 'asked' ? message.getFlag(MOD, 'summon') : null, { timeout: 6000 });
    return { message, flag };
  };
  // `petName`: the menu's name field as typed (a string), or undefined for an answer that carries none
  const answer = async (message, flag, name, { dx = 1, dy = 0, type = 'fey', petName = undefined } = {}) => {
    const b = await beast(name);
    // as the menu answers: a companion standing in its pocket is replaced there (`intoPocket`), one on the table in its square
    const intoPocket = flag?.replaces?.state === 'pocket';
    const inPlace = (flag?.replaces?.state === 'present') ? flag.replaces.placement : null;
    const placements = intoPocket ? [{ x: 0, y: 0, elevation: 0, rotation: 0 }] : inPlace ? [inPlace] : [{ x: casterToken.x + grid * dx, y: casterToken.y + grid * dy, elevation: casterToken.elevation ?? 0, rotation: 0 }];
    const patch = (flag && b) ? placedAnswer(flag, { profileId: flag.profiles[0]?.id ?? null, pick: { uuid: b.uuid, name: b.name }, count: 1, sceneId: canvas.scene.id,
      creatureType: (flag.creatureTypes ?? []).includes(type) ? type : (flag.creatureTypes?.[0] ?? null), intoPocket, placements,
      ...(petName === undefined ? {} : { petName }) }, SUMMON_CHOICES) : null;
    if (!patch) throw new Error(`the answer for ${name} was refused (beast=${!!b})`);
    await message.setFlag(MOD, 'summon', { ...flag, ...patch });
    const landed = await until(() => message.getFlag(MOD, 'summon')?.applied ? message.getFlag(MOD, 'summon') : null, { timeout: 20000 });
    for (const l of landed?.landed ?? []) madeTokens.add(l.tokenId);
    for (const a of game.actors.filter(a => a.getFlag('dnd5e', 'isAutoImported') && (a.name === name))) if (!madeActors.includes(a)) madeActors.push(a);
    return landed;
  };
  const summonFamiliar = async (name, opts) => { const { message, flag } = await cast(); const landed = await answer(message, flag, name, opts); return { message, landed }; };
  const ask = async (message, kind, placement = null) => {
    const flag = message.getFlag(MOD, 'summon');
    const patch = companionAsk(flag.companion, placement ? { kind, placement } : { kind });
    if (!patch) throw new Error(`the ${kind} ask was refused in state ${flag.companion?.state}`);
    await message.setFlag(MOD, 'summon', { ...flag, companion: { ...flag.companion, ...patch } });
    const want = (kind === 'away') ? 'pocket' : 'present';
    await until(() => (message.getFlag(MOD, 'summon')?.companion?.state === want) && !message.getFlag(MOD, 'summon')?.companion?.ask ? true : null, { timeout: 15000 });
  };
  const dismiss = async message => {
    await api.askDismiss(message);
    await until(() => message.getFlag(MOD, 'summon')?.dismissed ? true : null, { timeout: 15000 });
    // the token and the effect go after the record: the invariant reports counts that never settle, the teardown sweeps them
    await until(() => !familiarTokens().length && !companionEffects().length, { timeout: 8000 }).catch(() => null);
  };
  const home = () => ({ x: casterToken.x + grid, y: casterToken.y, elevation: casterToken.elevation ?? 0, sceneId: canvas.scene.id });

  let current = null;
  try {
    if (game.combat) await game.combat.delete();
    // ---- fixtures: the PHB's Find Familiar, prepared; a familiar standing from an earlier run cleared
    for (const e of caster.effects.filter(e => /^Familiar:/.test(e.name) || e.getFlag(MOD, 'companion'))) { try { await e.delete({ [MOD]: { companionEnd: true } }); } catch { /* gone */ } }
    if (caster.getFlag(MOD, 'petNames') !== undefined) await caster.unsetFlag(MOD, 'petNames');
    const pack = game.packs.get('dnd-players-handbook.spells');
    const hit = (await pack.getIndex()).find(e => e.name === 'Find Familiar');
    const src = (await pack.getDocument(hit._id)).toObject();
    src.system.prepared = 1;
    const [item] = await caster.createEmbeddedDocuments('Item', [src]);
    lent.push(item.id);
    spell = item;
    summon = spell.system.activities.getByType('summon')[0];
    if (!summon) return { fatal: 'the lent Find Familiar has no summon activity' };

    // ---- 1. the first landing
    if (want(1)) await section(1, async () => {
      const { message, landed } = await summonFamiliar('Owl');
      current = message;
      ok('§1 the Owl landed as a companion', landed?.outcome === 'landed' && !!landed.companion, JSON.stringify({ outcome: landed?.outcome, failure: landed?.failure, companion: landed?.companion?.state }));
      await invariant(1, { named: 'Owl', pocket: false });
      const tok = canvas.scene.tokens.get(landed?.landed?.[0]?.tokenId) ?? null;
      ok('§1 its token sees: sight on, the Owl\'s Darkvision 120 ft', seesWith(tok, 120), JSON.stringify(eyes(tok)));
    });

    // ---- 2. a new form replaces the old
    if (want(2) && current) await section(2, async () => {
      const old = current;
      const { message, landed } = await summonFamiliar('Bat');
      current = message;
      const oldGone = await until(() => old.getFlag(MOD, 'summon')?.dismissed ? true : null, { timeout: 15000 });
      ok('§2 the Bat landed in the Owl\'s place and the Owl\'s record is dismissed', landed?.outcome === 'landed' && !!oldGone && (landed.replaced >= 1), JSON.stringify({ outcome: landed?.outcome, replaced: landed?.replaced, oldDismissed: !!oldGone }));
      await invariant(2, { named: 'Bat', pocket: false });
    });

    // ---- 3. the pocket and back
    if (want(3) && current) await section(3, async () => {
      await ask(current, 'away');
      await invariant('3a', { tokens: 0, named: 'Bat', pocket: true });
      await ask(current, 'recall', home());
      await invariant('3b', { named: 'Bat', pocket: false });
      const back = canvas.scene.tokens.get(current.getFlag(MOD, 'summon')?.landed?.[0]?.tokenId) ?? null;
      ok('§3b called back, it sees', eyes(back).on, JSON.stringify(eyes(back)));
    });

    // ---- 4. a new form into the pocket
    if (want(4) && current) await section(4, async () => {
      await ask(current, 'away');
      const old = current;
      const { message, landed } = await summonFamiliar('Cat');
      current = message;
      await until(() => old.getFlag(MOD, 'summon')?.dismissed ? true : null, { timeout: 15000 });
      ok('§4 the Cat waits in the pocket as the Bat is dismissed', landed?.outcome === 'landed' && (landed.companion?.state === 'pocket') && !!old.getFlag(MOD, 'summon')?.dismissed, JSON.stringify({ outcome: landed?.outcome, state: landed?.companion?.state }));
      await invariant('4a', { tokens: 0, named: 'Cat', pocket: true });
      await ask(current, 'recall', home());
      await invariant('4b', { named: 'Cat', pocket: false });
    });

    // ---- 5. dismiss forever
    if (want(5) && current) await section(5, async () => {
      await dismiss(current);
      await invariant(5, { effects: 0, tokens: 0, records: 0 });
      current = null;
    });

    // ---- 6. two casts back to back
    if (want(6)) await section(6, async () => {
      const first = await cast();
      const second = await cast();
      ok('§6 two cards asked at once', first.flag?.status === 'asked' && second.flag?.status === 'asked', JSON.stringify({ first: first.flag?.status, second: second.flag?.status }));
      const a = await answer(first.message, first.flag, 'Rat', { dy: 1 });
      const b = await answer(second.message, second.flag, 'Owl', { dy: 2 });
      await until(() => first.message.getFlag(MOD, 'summon')?.dismissed ? true : null, { timeout: 15000 });
      ok('§6 the later cast stands, the earlier is dismissed', a?.outcome === 'landed' && b?.outcome === 'landed' && !!first.message.getFlag(MOD, 'summon')?.dismissed && !second.message.getFlag(MOD, 'summon')?.dismissed,
        JSON.stringify({ a: a?.outcome, b: b?.outcome, firstDismissed: !!first.message.getFlag(MOD, 'summon')?.dismissed, replaced: b?.replaced }));
      current = second.message;
      await invariant(6, { named: 'Owl', pocket: false });
    });

    // ---- 7. the fall
    if (want(7) && current) await section(7, async () => {
      const tok = familiarTokens()[0] ?? null;
      await tok?.actor?.update({ 'system.attributes.hp.value': 0 });
      const fell = await until(() => current.getFlag(MOD, 'summon')?.dismissed ? current.getFlag(MOD, 'summon') : null, { timeout: 15000 });
      ok('§7 at 0 HP the familiar disappears, the record says it fell', !!fell?.companion?.fell && !!fell?.dismissed, JSON.stringify({ fell: fell?.companion?.fell, dismissed: fell?.dismissed }));
      await invariant(7, { effects: 0, tokens: 0, records: 0 });
      current = null;
    });

    // ---- 8. an orphan swept
    if (want(8)) await section(8, async () => {
      const [orphan] = await caster.createEmbeddedDocuments('ActiveEffect', [{ name: 'Familiar: Ghost (Fey)', type: 'base', transfer: false, flags: { [MOD]: { companion: 'nomessage000000' } } }]);
      ok('§8 an orphan companion effect stands on the caster', !!orphan && companionEffects().length === 1, JSON.stringify(state()));
      const { message, landed } = await summonFamiliar('Owl');
      current = message;
      ok('§8 the next landing swept the orphan', landed?.outcome === 'landed' && !caster.effects.get(orphan.id), JSON.stringify({ outcome: landed?.outcome, orphan: !!caster.effects.get(orphan.id) }));
      await invariant(8, { named: 'Owl', pocket: false });
      await dismiss(current);
      current = null;
    });

    // ---- 10. the name, and its memory on the caster
    if (want(10)) await section(10, async () => {
      if (current) { await dismiss(current); current = null; }
      ok('§10 no name remembered at the start: the field opens blank', remembered() === null, JSON.stringify(caster.getFlag(MOD, 'petNames') ?? null));
      const first = await summonFamiliar('Owl', { petName: '  Pip ' });
      current = first.message;
      const tok = canvas.scene.tokens.get(first.landed?.landed?.[0]?.tokenId) ?? null;
      const world = game.actors.get(tok?.actorId ?? '') ?? null;
      ok('§10a the Owl lands as Pip: its token and its creature, the world Owl keeps its own name', (first.landed?.petName === 'Pip') && (first.landed?.summonName === 'Owl')
          && (tok?.name === 'Pip') && (tok?.actor?.name === 'Pip') && (world?.name === 'Owl'),
        JSON.stringify({ petName: first.landed?.petName, summonName: first.landed?.summonName, token: tok?.name, actor: tok?.actor?.name, world: world?.name }));
      await invariant('10a', { named: 'Familiar: Pip (Fey)', pocket: false });
      const rowNow = () => document.querySelector(`[data-message-id="${first.message.id}"] .bythebooks-summon`);
      const row = await until(() => (/Pip — summoned/.test(rowNow()?.textContent ?? '') ? rowNow() : null), { timeout: 6000, label: 'the card row says "Pip — summoned"' }).catch(() => rowNow());
      ok('§10b the card says "Pip — summoned", the Owl beside it', /Pip — summoned/.test(row?.textContent ?? '') && /Owl/.test(row?.textContent ?? ''), (row?.textContent ?? '').trim().slice(0, 120));
      const kept = await until(() => remembered() === 'Pip' ? true : null, { timeout: 8000, label: 'the caster remembers Pip' }).catch(() => null);
      ok('§10c the caster remembers Pip for the next summon\'s field', !!kept, JSON.stringify(caster.getFlag(MOD, 'petNames') ?? null));
      // a new form: the field as the menu pre-fills it (the remembered name), untouched
      const prefill = remembered() ?? '';
      const second = await summonFamiliar('Cat', { petName: prefill });
      current = second.message;
      const cat = canvas.scene.tokens.get(second.landed?.landed?.[0]?.tokenId) ?? null;
      ok('§10d cast again as a Cat with the field pre-filled: Pip, a Cat, in the Owl\'s square', (prefill === 'Pip') && (cat?.name === 'Pip') && (second.landed?.summonName === 'Cat')
          && (cat?.x === tok?.x) && (cat?.y === tok?.y) && eyes(cat).on,
        JSON.stringify({ prefill, token: cat?.name, form: second.landed?.summonName, at: [cat?.x, cat?.y], was: [tok?.x, tok?.y], eyes: eyes(cat) }));
      await invariant('10d', { named: 'Familiar: Pip (Fey)', pocket: false });
      // an answer with no field (a macro's): the creature's own name, the memory untouched
      const third = await summonFamiliar('Bat');
      current = third.message;
      const bat = canvas.scene.tokens.get(third.landed?.landed?.[0]?.tokenId) ?? null;
      ok('§10e an answer with no name field: the Bat lands as Bat, the caster still remembers Pip', (bat?.name === 'Bat') && !Object.hasOwn(third.landed ?? {}, 'petName') && (remembered() === 'Pip'),
        JSON.stringify({ token: bat?.name, petName: third.landed?.petName, remembered: remembered() }));
      // the field cleared: its own name, and the caster forgets
      const fourth = await summonFamiliar('Rat', { petName: '' });
      current = fourth.message;
      const rat = canvas.scene.tokens.get(fourth.landed?.landed?.[0]?.tokenId) ?? null;
      const forgot = await until(() => remembered() === null ? true : null, { timeout: 8000, label: 'the caster forgets the name' }).catch(() => null);
      ok('§10f the field cleared: the Rat lands as Rat, the caster forgets', (rat?.name === 'Rat') && (fourth.landed?.petName === null) && !!forgot,
        JSON.stringify({ token: rat?.name, petName: fourth.landed?.petName, remembered: remembered() }));
      await invariant('10f', { named: 'Familiar: Rat (Fey)', pocket: false });
      await dismiss(current);
      current = null;
    });

    // ---- 11. the Vestige's name: its own memory beside the familiar's (RULINGS *Summons*, call 62)
    if (want(11)) await section(11, async () => {
      if (current) { await dismiss(current); current = null; }
      // the familiar's name stands first, so the Vestige's is seen to be its own
      const pip = await summonFamiliar('Owl', { petName: 'Pip' });
      await until(() => remembered() === 'Pip' ? true : null, { timeout: 8000, label: 'the caster remembers Pip' }).catch(() => null);
      await dismiss(pip.message);
      const vpack = game.packs.get('dnd-arcana-unleashed.subclasses');
      const vhit = vpack ? (await vpack.getIndex()).find(e => e.name === 'Vestige Companion') : null;
      if (!vhit) { ok('§11 Arcana Unleashed\'s Vestige Companion is on this box', false, `pack=${!!vpack}`); return; }
      const vsrc = (await vpack.getDocument(vhit._id)).toObject();
      delete vsrc._id;
      const [vitem] = await caster.createEmbeddedDocuments('Item', [vsrc]);
      lent.push(vitem.id);
      const vsummon = vitem.system.activities.getByType('summon')[0];
      const used = await vsummon.use({ [MOD]: { toCard: true }, create: { measuredTemplate: false, summons: false }, consume: { spellSlot: false, resources: false } }, { configure: false }, { create: true });
      const vmsg = used?.message instanceof ChatMessage ? used.message : null;
      if (vmsg) madeMessages.push(vmsg);
      const vflag = await until(() => vmsg?.getFlag(MOD, 'summon')?.status === 'asked' ? vmsg.getFlag(MOD, 'summon') : null, { timeout: 6000 }).catch(() => null);
      const form = vflag?.profiles?.find(p => /Fiendish/.test(p.label || p.name || '')) ?? vflag?.profiles?.[0] ?? null;
      const patch = (vflag && form) ? placedAnswer(vflag, { profileId: form.id, count: 1, sceneId: canvas.scene.id, petName: 'Ash',
        placements: [{ x: casterToken.x + grid, y: casterToken.y + grid, elevation: casterToken.elevation ?? 0, rotation: 0 }] }, SUMMON_CHOICES) : null;
      if (patch) await vmsg.setFlag(MOD, 'summon', { ...vflag, ...patch });
      const vlanded = patch ? await until(() => vmsg.getFlag(MOD, 'summon')?.applied ? vmsg.getFlag(MOD, 'summon') : null, { timeout: 20000 }).catch(() => null) : null;
      const vtok = canvas.scene.tokens.get(vlanded?.landed?.[0]?.tokenId) ?? null;
      if (vtok) madeTokens.add(vtok.id);
      for (const a of game.actors.filter(a => a.getFlag('dnd5e', 'isAutoImported') && /Vestige/.test(a.name ?? ''))) if (!madeActors.includes(a)) madeActors.push(a);
      const veffect = caster.effects.find(e => e.getFlag(MOD, 'companion') === vmsg?.id) ?? null;
      ok('§11a the Fiendish vestige lands as Ash: its token, its creature, the effect "Vestige: Ash", and it sees',
        (vlanded?.outcome === 'landed') && (vtok?.name === 'Ash') && (vtok?.actor?.name === 'Ash') && /^Vestige: Ash\b/.test(veffect?.name ?? '') && eyes(vtok).on,
        JSON.stringify({ patch: !!patch, form: form?.label ?? form?.name, outcome: vlanded?.outcome, failure: vlanded?.failure, token: vtok?.name, actor: vtok?.actor?.name, effect: veffect?.name, eyes: eyes(vtok) }));
      const ash = await until(() => rememberedName(caster.getFlag(MOD, 'petNames')?.names ?? [], 'Vestige Companion') === 'Ash' ? true : null, { timeout: 8000, label: 'the caster remembers Ash' }).catch(() => null);
      ok('§11b the caster remembers Ash for the Vestige and still Pip for the familiar', !!ash && (remembered() === 'Pip'), JSON.stringify(caster.getFlag(MOD, 'petNames') ?? null));
      if (vlanded) await dismiss(vmsg);
      ok('§11c Dismiss takes the vestige', !!vmsg?.getFlag(MOD, 'summon')?.dismissed && !canvas.scene.tokens.get(vtok?.id ?? ''), JSON.stringify({ dismissed: !!vmsg?.getFlag(MOD, 'summon')?.dismissed, token: !!canvas.scene.tokens.get(vtok?.id ?? '') }));
    });

    // ---- 12. one seat across the pocket, the combat line's side, the hand-delete prompt
    if (want(12)) await section(12, async () => {
      const { message } = await summonFamiliar('Owl');
      current = message;
      await invariant('12a', { named: 'Owl', pocket: false });
      const owl = () => canvas.scene.tokens.get(message.getFlag(MOD, 'summon')?.landed?.[0]?.tokenId) ?? null;
      const first = owl();
      const [combat] = await Combat.createDocuments([{ scene: canvas.scene.id, active: true }]);
      try {
        await combat.createEmbeddedDocuments('Combatant', [
          { tokenId: casterToken.id, sceneId: canvas.scene.id, actorId: caster.id, initiative: 17 },
          { tokenId: first.id, sceneId: canvas.scene.id, actorId: first.actorId, initiative: 10 }
        ]);
        await combat.startCombat();
        const roster = await until(() => game.messages.contents.findLast(m => m.getFlag(MOD, 'combatRoster')?.combatId === combat.id) ?? null, { timeout: 8000 }).catch(() => null);
        const entry = roster?.getFlag(MOD, 'combatRoster')?.combatants?.find(c => c.tokenId === first.id) ?? null;
        const text = roster?.content ?? '';
        ok('§12a the combat line tags no "(foe)" on the friendly Owl, its disposition kept', /10 · Owl/.test(text) && !/Owl \(foe\)/.test(text) && (entry?.disposition === 1),
          JSON.stringify({ roster: !!roster, entry, line: (text.match(/[^>]*Owl[^<]*/) ?? [''])[0] }));
        await ask(message, 'away');
        const kept = message.getFlag(MOD, 'summon')?.companion?.seat ?? null;
        ok('§12b put away, its seat goes and its Initiative is kept', !combat.combatants.some(c => c.tokenId === first.id) && (combat.combatants.size === 1) && (kept?.initiative === 10),
          JSON.stringify({ seats: combat.combatants.map(c => `${c.name}:${c.initiative}`), kept }));
        const since = Date.now();
        await ask(message, 'recall', home());
        const back = owl();
        const seats = await until(() => { const s = combat.combatants.filter(c => c.tokenId === back?.id); return s.length ? s : null; }, { timeout: 8000 }).catch(() => []);
        const rolled = game.messages.contents.some(m => (m.timestamp >= since) && m.getFlag('core', 'initiativeRoll'));
        ok('§12c called back, one seat at 10 and no second roll', (seats.length === 1) && (seats[0].initiative === 10) && (combat.combatants.size === 2) && !rolled
          && !message.getFlag(MOD, 'summon')?.companion?.seat, JSON.stringify({ seats: combat.combatants.map(c => `${c.name}:${c.initiative}`), rolled }));
        await canvas.scene.deleteEmbeddedDocuments('Token', [back.id]);
        const prompt = await until(() => [...foundry.applications.instances.values()].find(a => /Delete the familiar\?/.test(a.element?.textContent ?? '')) ?? null, { timeout: 5000 }).catch(() => null);
        ok('§12d deleted by hand, the token stays and the prompt asks (Proceed or Cancel)', !!canvas.scene.tokens.get(back.id) && !!prompt
          && /Proceed/.test(prompt?.element?.textContent ?? '') && /Cancel/.test(prompt?.element?.textContent ?? ''), JSON.stringify({ token: !!canvas.scene.tokens.get(back.id), prompt: !!prompt }));
        if (prompt) await prompt.close();
      } finally {
        if (game.combats.get(combat.id)) await combat.delete();
      }
      await dismiss(message);
      await invariant('12e', { effects: 0, tokens: 0, records: 0 });
      current = null;
    });
    // ---- 13. across scenes: a teleported token keeps its record; put away from there, called back home
    if (want(13)) await section(13, async () => {
      const { message } = await summonFamiliar('Owl');
      current = message;
      const first = canvas.scene.tokens.get(message.getFlag(MOD, 'summon')?.landed?.[0]?.tokenId) ?? null;
      if (!first) throw new Error('§13: the Owl has no token to move');
      const [away] = await Scene.createDocuments([{ name: 'BTB Away Scene', active: false, navigation: false, width: 1000, height: 1000, grid: { size: grid } }]);
      try {
        // Foundry's teleport across scenes: the token cloned onto the destination (its id kept, its flags with it), the old one deleted with `replacements`
        const data = first.toObject();
        data.x = 300; data.y = 300;
        const [moved] = await away.createEmbeddedDocuments('Token', [data], { keepId: true });
        await canvas.scene.deleteEmbeddedDocuments('Token', [first.id], { replacements: { [first.id]: moved.uuid } });
        const followed = await until(() => { const l = message.getFlag(MOD, 'summon')?.landed?.[0]; return (l?.sceneId === away.id) && (l?.tokenId === moved.id) ? l : null; }, { timeout: 8000 }).catch(() => null);
        ok('§13a moved to another scene, its record follows the new token', !!followed && !canvas.scene.tokens.get(first.id) && !!away.tokens.get(moved.id),
          JSON.stringify({ landed: message.getFlag(MOD, 'summon')?.landed?.[0], here: !!canvas.scene.tokens.get(first.id), there: !!away.tokens.get(moved.id) }));
        await ask(message, 'away');
        const snap = message.getFlag(MOD, 'summon')?.companion?.snapshot ?? null;
        ok('§13b put away from there: no token on either scene, the effect in the pocket, a snapshot kept', !away.tokens.get(moved.id) && !familiarTokens().length
          && (companionEffects().length === 1) && companionEffects()[0].name.includes('in the pocket') && !!snap,
          JSON.stringify({ there: !!away.tokens.get(moved.id), here: familiarTokens().map(t => t.name), effects: companionEffects().map(e => e.name), snapshot: !!snap }));
        await ask(message, 'recall', home());
        await invariant('13c', { tokens: 1, pocket: false });
      } finally {
        if (game.scenes.get(away.id)) await away.delete();
      }
      await dismiss(message);
      await invariant('13d', { effects: 0, tokens: 0, records: 0 });
      current = null;
    });
  } catch (err) {
    results.push({ name: 'suite threw', pass: false, detail: `${err?.message}\n${err?.stack}` });
  } finally {
    await teardown();
  }
  return { results, log, skips };
}, sectionArg(plan, SECTIONS));

/** §9's record, armed on the suite's page: Find Familiar lent and cast to its card, the Owl's answer computed. */
const armFamiliar = async ({ xName }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, viewScene } = window.__btb;
  const caster = game.actors.getName('BTB Test Sorcerer');
  const range = game.scenes.getName('By the Books Test Range');
  if (!caster || !range) return { fatal: 'missing fixture: BTB Test Sorcerer or the test range — run tools/fixture-suite.mjs' };
  await viewScene(range).catch(() => null);
  const casterToken = range.tokens.find(t => t.actorId === caster.id);
  if (!casterToken) return { fatal: 'the Sorcerer has no token on the test range — run tools/fixture-suite.mjs' };
  const xUser = game.users.getName(xName);
  if (!xUser) return { fatal: `no world user "${xName}" for the assistant identity — run tools/seed-gm-identities.mjs` };
  const since = Date.now() - 1000;
  const { placedAnswer } = await import(`/modules/${MOD}/scripts/decide/summons.js`);
  const { SUMMON_CHOICES } = await import(`/modules/${MOD}/scripts/decide/registry.js`);
  const { poolFromPacks } = await import(`/modules/${MOD}/scripts/gallery.js`);
  const pack = game.packs.get('dnd-players-handbook.spells');
  const hit = (await pack.getIndex()).find(e => e.name === 'Find Familiar');
  const src = (await pack.getDocument(hit._id)).toObject();
  src.system.prepared = 1;
  src.flags = { ...(src.flags ?? {}), world: { ...(src.flags?.world ?? {}), twoGmSection: true } };
  const [item] = await caster.createEmbeddedDocuments('Item', [src]);
  const summon = item.system.activities.getByType('summon')[0];
  const result = await summon.use({ [MOD]: { toCard: true }, create: { measuredTemplate: false, summons: false }, consume: { spellSlot: false } }, { configure: false }, { create: true });
  const message = result?.message instanceof ChatMessage ? result.message : null;
  if (!message) return { fatal: 'the cast posted no card' };
  const flag = await until(() => (message.getFlag(MOD, 'summon')?.status === 'asked') ? message.getFlag(MOD, 'summon') : null, { timeout: 8000, label: 'the record asked' });
  const owl = (await poolFromPacks({ crMax: 0, types: ['beast'] })).find(r => r.name === 'Owl') ?? null;
  if (!owl) return { fatal: 'no Owl in the familiar pool' };
  const types = flag.creatureTypes ?? [];
  const patch = placedAnswer(flag, { profileId: flag.profiles?.[0]?.id ?? null, pick: { uuid: owl.uuid, name: owl.name }, count: 1, sceneId: range.id,
    creatureType: types.includes('fey') ? 'fey' : (types[0] ?? null), intoPocket: false,
    placements: [{ x: casterToken.x + range.grid.size, y: casterToken.y, elevation: casterToken.elevation ?? 0, rotation: 0 }] }, SUMMON_CHOICES);
  if (!patch) return { fatal: 'placedAnswer refused the answer' };
  return { messageId: message.id, patch, casterId: caster.id, sceneId: range.id, xUserId: xUser.id, since };
};

if (!out?.fatal && (!plan || plan.includes('9'))) {
  const env = loadEnv();
  const assistant = gmIdentity(env, 'assistant');
  if (!assistant) {
    out.results.push({ name: '§9 the assistant identity is named in the .env (FOUNDRY_ASSISTANT_USER)', pass: false, detail: 'tools/README.md, the live tier\'s table' });
  } else {
    const run = await arrivalLanding(f, { env, key: 'assistant', prep: armFamiliar, prepArg: { xName: assistant.user }, flagKey: 'summon', tag: 'companions:assistant' });
    if (run.prep?.fatal) out.results.push({ name: `§9 armed — ${run.prep.fatal}`, pass: false });
    else {
      const judged = await f.evaluate(judgeArrival, { ...sectionArg(plan, SECTIONS), run, id: 9, expect: { companionEffects: 1 } });
      out.results.push(...judged.results);
      out.log.push(...judged.log);
    }
  }
  out.skips.push('§9 a Gamemaster beside an Assistant GM — waits for the gm2 user (HANDOFF §7 item 1)');
} else if (!out?.fatal) out.skips.push(`§9 ${SECTIONS[9]}`);

await finish({ tag: 'companions', out, plan, f });
