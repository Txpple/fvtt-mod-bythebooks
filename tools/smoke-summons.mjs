// Live suite: SUMMONS (issue #1) — the system's placement switched off at the use, the record stamped
// on the cast card, the popup off the card, the placement folded in, the elect landing the creature with
// dnd5e's own profile changes, the caster's players owning it, the seat after the caster, the dragon's
// breath narrowed and the shared resistance on the caster, and Dismiss. A creature's token lands seeing (its
// owner sees through it, dnd5e's range off its senses); a thing's does not (RULINGS *Summons*, call 60).
//
// Fixtures: BTB Test Sorcerer (tools/fixture-suite.mjs) is lent the PHB's Summon Beast, Summon Dragon and
// Find Familiar for the sections that need them; the summon art table is set for §7 and put back; the cards it posts, the tokens the elect creates, the imported
// spirits and the resistance effect are torn down. The placement preview is a canvas interaction, so
// the suite answers the record directly through the module's api and the pure fold, never the popup.
//
// §10 holds TWO GM CLIENTS (suite issue #8): the assistant identity joins beside the suite's while a Summon Beast
// landing is answered, and the record lands once (tools/gm-clients.mjs, the arrival landing).
//
// Sections: `--section 2`, `--list`. Fixtures and teardown ALWAYS run.
import { arrivalLanding, judgeArrival } from './gm-clients.mjs';
import { announcePlan, connectSuite, finish, loadEnv, sectionArg, sectionPlan } from './harness.mjs';
import { gmIdentity } from './target.mjs';

// THE COVERAGE MAP (tools/coverage-map.mjs) — ⚠ NEVER import a suite; the map is parsed.
export const COVERS = [
  'summons.js',   // §1 the intercept and the record, §2 the landing (its token sees), §3 the dragon, §4 Dismiss, §5 the seat, §6 the pool it picks from (gallery.js is a service: the battery's), §9 Battle Familiar conjured: its own seat, one at a time, the fall at 0 HP, the caster's death, §10 a landing as a second GM client arrives (the claim, the snapshot guard), §11 a thing sees nothing, §12 a sensor sees
  'summon-art.js' // §7 the Summon Art window lists the familiar's pool, and the table's art lands on the familiar; §8 Match files and Save
];

// §10's second GM client (target.mjs GM_IDENTITIES): the preflight allows exactly these.
export const GM_CLIENTS = ['suite', 'assistant'];

const SECTIONS = {
  1: 'THE RECORD: a Summon Beast cast by the Sorcerer posts its card with NO token created by the system and a `summon` flag `asked` carrying three profile rows with art and stat lines',
  2: 'THE LANDING: the record answered (Bestial Land Spirit, one square beside the caster) is landed by the elect — one token on the scene, the Land spirit, flags.dnd5e.summon.level = 2, the card "summoned", its token seeing (sight on, Darkvision 60 ft off its senses)',
  3: 'THE DRAGON: Summon Dragon answered with fire lands a Draconic Spirit whose Breath Weapon carries fire alone, and a "Shared Resistance (Fire)" effect on the caster dependent on the concentration effect',
  4: 'DISMISS: the Dismiss ask deletes the landed token and the resistance effect; the card says dismissed',
  5: 'THE SEAT: with the caster in a started combat at Initiative 15, the landed creature joins at 14.99 right after it',
  6: 'THE POOL: the pack index pool at CR 0, beasts only, holds Owl once (the MM copy), sorted by CR then name',
  7: 'SUMMON ART: the Summon Art window lists the Owl for Find Familiar; with the Owl given a token and a portrait in the table, a Find Familiar landed as an Owl wears the token, the portrait and the token on its companion effect, and sees (the Owl\'s Darkvision 120 ft)',
  8: 'MATCH AND SAVE: in the Summon Art window, Match files over a folder holding owl.webp, owl-portrait.webp and bat.webp fills the Owl and the Bat, keeps a Bat token set by hand, and Save stores the table by name',
  9: 'BATTLE FAMILIAR CONJURED (Arcana Unleashed): with no familiar standing the Brute lands seeing on the Sorcerer\'s 1-hour effect and rolls its own Initiative in the started combat; a second cast dismisses the first (one at a time); at 0 HP it disappears, the card saying so; a third cast disappears when the caster is marked dead',
  10: 'TWO GM CLIENTS (an Assistant GM beside the suite\'s; a Gamemaster beside an Assistant waits for the gm2 user): Summon Beast answered as the assistant client arrives lands once — one claim, one token, no effect on the caster, one moment, no extra card',
  11: 'A THING SEES NOTHING: Mage Hand (a Spectral Hand, no creature type of the book\'s, no senses) lands with its token\'s sight off, where every creature above lands seeing; Dismiss takes it',
  12: 'A SENSOR SEES: Clairvoyance\'s Invisible Sensor (a thing, no senses) lands half seen and seeing, by its SUMMON_LOOKS row (Scrying\'s is the same creature); its Concentration\'s end takes it'
};
const DEPENDS = { 3: [1], 4: [2], 5: [2] };

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'summons', watchdogMs: 300_000 });
announcePlan('summons', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, viewScene } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });

  const modDoc = game.modules.get(MOD);
  if (!modDoc?.active) return { fatal: `module active=${modDoc?.active}` };
  const api = modDoc.api?.summons;
  if (!api?.askDismiss) return { fatal: 'no summons api — OLD code (reload the box)' };

  const caster = game.actors.getName('BTB Test Sorcerer');
  if (!caster) return { fatal: 'missing fixture: BTB Test Sorcerer — run tools/fixture-suite.mjs' };
  // ⚠ The range is VIEWED first (every other suite does): a fresh client's canvas is the world's
  // active scene, and in the battery that is not the range — this suite went FATAL at
  // "the Sorcerer has no token on the scene" in the overnight battery of 2026-10-11 while green alone.
  const range = game.scenes.getName('By the Books Test Range');
  if (!range) return { fatal: 'missing fixture: scene By the Books Test Range — run tools/fixture-suite.mjs' };
  await viewScene(range).catch(() => null);
  if (canvas.scene?.id !== range.id) return { fatal: 'the canvas never readied on the test range' };
  const casterToken = canvas.scene.tokens.find(t => t.actor?.id === caster.id) ?? null;
  if (!casterToken) return { fatal: 'the Sorcerer has no token on the scene — run tools/fixture-suite.mjs' };
  const lent = [];
  let artBefore;
  const suiteStart = Date.now();
  const madeTokens = [];
  const madeActors = [];
  const madeMessages = [];
  const teardown = async () => {
    try {
      for (const app of foundry.applications.instances.values()) {
        if (/Summon/.test(app.element?.textContent ?? '') && (app instanceof foundry.applications.api.DialogV2)) { try { await app.close(); } catch { /* gone */ } }
      }
      const tokens = madeTokens.filter(id => canvas.scene.tokens.get(id));
      if (tokens.length) await canvas.scene.deleteEmbeddedDocuments('Token', tokens);
      for (const e of caster.effects.filter(e => /Shared Resistance|Summon|Battle Familiar|Mage Hand|Clairvoyance/.test(e.name))) { try { await e.delete({ [MOD]: { summonEnd: true } }); } catch { /* gone */ } }
      for (const e of caster.effects.filter(e => e.statuses?.has?.('dead'))) { try { await e.delete(); } catch { /* gone */ } }
      if (artBefore !== undefined) await game.settings.set(MOD, 'summonArt', artBefore);
      const live = lent.filter(id => caster.items.get(id));
      if (live.length) await caster.deleteEmbeddedDocuments('Item', live);
      for (const a of madeActors) { if (game.actors.get(a.id)) await a.delete(); }
      // The gear a fallen Battle Familiar leaves (a Loot Shelf chest where it stood): its token and its actor go too,
      // or the next area ask on the range lists the chest.
      const chests = game.actors.filter(a => /'s gear$/.test(a.name ?? '') && (a._stats?.createdTime ?? 0) >= suiteStart);
      const chestTokens = canvas.scene.tokens.filter(t => chests.some(a => a.id === t.actorId)).map(t => t.id);
      if (chestTokens.length) await canvas.scene.deleteEmbeddedDocuments('Token', chestTokens);
      if (chests.length) await Actor.deleteDocuments(chests.map(a => a.id));
      for (const m of madeMessages) { if (game.messages.get(m.id)) await m.delete(); }
      if (game.combat?.getFlag(MOD, 'suiteSummons')) await game.combat.delete();
    } catch (err) { log.push(`TEARDOWN ERROR: ${err?.message}`); }
  };

  const lend = async (name, packId = 'dnd-players-handbook.spells') => {
    const pack = game.packs.get(packId);
    if (!pack) throw new Error(`${packId} is not on this box`);
    const hit = (await pack.getIndex()).find(e => e.name === name);
    if (!hit) throw new Error(`${packId} ships no "${name}" this box can find`);
    const src = (await pack.getDocument(hit._id)).toObject();
    src.system.prepared = 1;
    const [item] = await caster.createEmbeddedDocuments('Item', [src]);
    lent.push(item.id);
    return item;
  };
  const tokensBefore = () => new Set(canvas.scene.tokens.map(t => t.id));
  const newTokens = before => canvas.scene.tokens.filter(t => !before.has(t.id));
  const importedSpirits = () => game.actors.filter(a => a.getFlag('dnd5e', 'isAutoImported') && /Spirit/.test(a.name));
  const castSummon = async (item, { consume = false } = {}) => {
    const activity = item.system.activities.getByType('summon')[0];
    const before = tokensBefore();
    // sent to its card (RULINGS *Summons*, call 33): the record posts asked, answered below as the card's popup would
    const result = await activity.use({ consume: { spellSlot: consume }, create: { measuredTemplate: false }, [MOD]: { toCard: true } }, { configure: false }, { create: true });
    const message = result?.message instanceof ChatMessage ? result.message : null;
    if (message) madeMessages.push(message);
    // Every caller reads a missing record (`flag ? … : null`, `flag?.…`): absent, it is null.
    const flag = await until(() => message?.getFlag(MOD, 'summon')?.status === 'asked' ? message.getFlag(MOD, 'summon') : null, { timeout: 6000 }).catch(() => null);
    return { activity, message, flag, before };
  };
  // The suite answers the record as the popup would, through the pure fold the module exports: one square to the right of the caster.
  const answer = async (message, { profileName = null, choice = null } = {}) => {
    const { placedAnswer } = await import('/modules/fvtt-mod-bythebooks/scripts/decide/summons.js');
    const { SUMMON_CHOICES } = await import('/modules/fvtt-mod-bythebooks/scripts/decide/registry.js');
    const flag = message.getFlag(MOD, 'summon');
    const profile = profileName ? flag.profiles.find(p => p.label === profileName || p.name === profileName) : flag.profiles[0];
    const grid = canvas.scene.grid.size;
    const patch = placedAnswer(flag, { profileId: profile?.id ?? null, choice, count: 1, sceneId: canvas.scene.id,
      placements: [{ x: casterToken.x + grid * 2, y: casterToken.y, elevation: casterToken.elevation ?? 0, rotation: 0 }] }, SUMMON_CHOICES);
    if (!patch) throw new Error('the suite\'s answer was refused by placedAnswer');
    await message.setFlag(MOD, 'summon', { ...flag, ...patch });
    return until(() => message.getFlag(MOD, 'summon')?.applied ? message.getFlag(MOD, 'summon') : null, { timeout: 20000 });
  };
  const landedToken = flag => canvas.scene.tokens.get(flag?.landed?.[0]?.tokenId) ?? null;
  // a landed token's eyes: sight as stored (the landing's), the range and mode as dnd5e prepares them off the senses
  const senseSync = game.settings.get('dnd5e', 'senseVisionSync') !== false;
  const eyes = tok => ({ on: !!tok?._source?.sight?.enabled, range: tok?.sight?.range ?? null, mode: tok?.sight?.visionMode ?? null, sync: senseSync });
  const seesWith = (tok, range) => { const e = eyes(tok); return e.on && (!e.sync || ((Number(e.range) === range) && (e.mode === 'darkvision'))); };

  try {
    const beastItem = want(1) || want(2) || want(4) || want(5) ? await lend('Summon Beast') : null;
    if (sections === null || sections.some(s => ['1', '2', '4', '5'].includes(s))) await section(1, async () => {
      const { message, flag, before } = await castSummon(beastItem);
      ok('§1 the system placed nothing', newTokens(before).length === 0, `${newTokens(before).length} new tokens`);
      ok('§1 the record is asked with three profiles', flag?.status === 'asked' && flag.profiles?.length === 3, JSON.stringify(flag?.profiles?.map(p => p.label)));
      ok('§1 a row carries art and a stat line', !!flag?.profiles?.[0]?.img && !!flag.profiles[0].summary?.attacks?.length, JSON.stringify(flag?.profiles?.[0]?.summary));
      if (want(2) && flag) await section(2, async () => {
        const landed = await answer(message, { profileName: 'Bestial Land Spirit' });
        const tok = landedToken(landed);
        if (tok) madeTokens.push(tok.id);
        for (const a of importedSpirits()) if (!madeActors.includes(a)) madeActors.push(a);
        ok('§2 the elect landed one token', landed?.outcome === 'landed' && !!tok, JSON.stringify({ outcome: landed?.outcome, failure: landed?.failure }));
        // ⚠ The PHB names all three forms' prototype tokens "Bestial Spirit": the form is the actor's name.
        const base = game.actors.get(tok?.actorId ?? '');
        const source = base?._stats?.compendiumSource ?? '';
        ok('§2 it is the Land spirit at the spell\'s level', /BestialLan/.test(source) && (tok?.actor?.getFlag('dnd5e', 'summon')?.level === 2), `${base?.name} from ${source} level=${tok?.actor?.getFlag('dnd5e', 'summon')?.level}`);
        ok('§2 its token sees: sight on, Darkvision 60 ft off its senses', seesWith(tok, 60), JSON.stringify(eyes(tok)));
        // The landed row replaces the asked one on the re-render after the flag lands: wait for its words;
        // absent, the check reads the row as it stands.
        const rowNow = () => document.querySelector(`[data-message-id="${message.id}"] .bythebooks-summon`);
        const row = await until(() => (/— summoned/.test(rowNow()?.textContent ?? '') ? rowNow() : null),
          { timeout: 6000, label: 'the card row says "— summoned"' }).catch(() => rowNow());
        ok('§2 the card says summoned', /— summoned/.test(row?.textContent ?? ''), (row?.textContent ?? '').trim().slice(0, 120));
        if (want(5)) await section(5, async () => {
          // The seat: a combat with the caster at 15; a second cast lands beside it.
          const combat = await Combat.create({ scene: canvas.scene.id, active: true, [`flags.${MOD}.suiteSummons`]: true });
          await combat.createEmbeddedDocuments('Combatant', [{ tokenId: casterToken.id, sceneId: canvas.scene.id, actorId: caster.id, initiative: 15 }]);
          await combat.startCombat();
          const second = await castSummon(beastItem);
          const landed2 = second.flag ? await answer(second.message, { profileName: 'Bestial Air Spirit' }) : null;
          const tok2 = landedToken(landed2);
          if (tok2) madeTokens.push(tok2.id);
          const seat = combat.combatants.find(c => c.tokenId === tok2?.id);
          ok('§5 the creature sits right after the caster', seat?.initiative === 14.99, `initiative=${seat?.initiative}`);
          await combat.delete();
        });
        if (want(4)) await section(4, async () => {
          await api.askDismiss(message);
          const gone = await until(() => message.getFlag(MOD, 'summon')?.dismissed ? true : null, { timeout: 15000 });
          ok('§4 Dismiss deleted the token', gone && !canvas.scene.tokens.get(tok?.id), `dismissed=${gone} tokenStands=${!!canvas.scene.tokens.get(tok?.id)}`);
        });
      });
    });
    if (want(3)) await section(3, async () => {
      // no Concentration standing from §1: a cast past the dialog that would end it asks first (RULINGS *Summons*, call 18)
      if (caster.concentration?.effects?.size) {
        await caster.endConcentration().catch(() => {});
        await until(() => !caster.concentration?.effects?.size, { label: 'the Sorcerer\'s Concentration ended' });
      }
      const dragonItem = await lend('Summon Dragon');
      const { message, flag } = await castSummon(dragonItem);
      ok('§3 the dragon\'s record asks the choice', flag?.choice === 'Summon Dragon' && flag.profiles?.length === 1, JSON.stringify({ choice: flag?.choice, n: flag?.profiles?.length }));
      const landed = flag ? await answer(message, { choice: 'fire' }) : null;
      const tok = landedToken(landed);
      if (tok) madeTokens.push(tok.id);
      for (const a of importedSpirits()) if (!madeActors.includes(a)) madeActors.push(a);
      const breath = tok?.actor?.items.find(i => i.name === 'Breath Weapon');
      const types = [...(breath?.system.activities ?? [])].flatMap(a => (a.damage?.parts ?? []).flatMap(p => [...(p.types ?? [])]));
      ok('§3 the breath carries fire alone', types.length > 0 && types.every(t => t === 'fire'), JSON.stringify(types));
      const effect = caster.effects.find(e => /Shared Resistance/.test(e.name));
      const conc = caster.effects.get(message.system?.concentration);
      ok('§3 the resistance stands on the caster, dependent on concentration', !!effect && (effect.getFlag('dnd5e', 'dependentOn') === conc?.uuid) && effect.changes.some(c => c.key === 'system.traits.dr.value' && c.value === 'fire'), JSON.stringify({ effect: effect?.name, dep: effect?.getFlag('dnd5e', 'dependentOn'), conc: conc?.uuid }));
      if (conc) {
        await conc.delete();
        const gone = await until(() => (!canvas.scene.tokens.get(tok?.id) && !caster.effects.get(effect?.id)) ? true : null, { timeout: 15000 });
        ok('§3 ending concentration takes the token and the resistance with it', !!gone, `token=${!!canvas.scene.tokens.get(tok?.id)} resistance=${!!caster.effects.get(effect?.id)} dismissed=${!!message.getFlag(MOD, 'summon')?.dismissed}`);
      }
    });
    if (want(6)) await section(6, async () => {
      const { poolFromPacks } = await import('/modules/fvtt-mod-bythebooks/scripts/gallery.js');
      const rows = await poolFromPacks({ crMax: 0, types: ['beast'] });
      const owls = rows.filter(r => r.name === 'Owl');
      ok('§6 the pool holds Owl once, the MM copy', owls.length === 1 && /dnd-monster-manual/.test(owls[0]?.pack ?? ''), JSON.stringify(owls.map(o => o.pack)));
      ok('§6 sorted by CR then name', rows.every((r, i) => !i || (rows[i - 1].cr < r.cr) || ((rows[i - 1].cr === r.cr) && (rows[i - 1].name.localeCompare(r.name) <= 0))), `${rows.length} rows`);
    });
    if (want(7)) await section(7, async () => {
      // The window: opened from its settings button, its Owl row drawn.
      const menu = game.settings.menus.get(`${MOD}.summonArtMenu`);
      const win = menu ? new menu.type() : null;
      if (win) await win.render(true);
      // the window opens on the first spell alphabetically: Find Familiar is picked from its list
      (await until(() => win?.element?.querySelector('[data-bf-art-pick-spell="Find Familiar"]'), { timeout: 20000 }))?.click();
      const owlRow = await until(() => win?.element?.querySelector('[data-bf-art-row="owl"]'), { timeout: 20000 });
      ok('§7 the window lists the Owl for Find Familiar', !!owlRow, `menu=${!!menu} rows=${win?.element?.querySelectorAll('[data-bf-art-row]').length ?? 0}`);
      if (win) await win.close();
      // The landing: the table's art for the Owl, then a familiar cast and answered as an Owl (Fey).
      const TOKEN = 'icons/svg/mystery-man.svg';
      const PORTRAIT = 'icons/svg/cowled.svg';
      artBefore = foundry.utils.deepClone(game.settings.get(MOD, 'summonArt') ?? {});
      await game.settings.set(MOD, 'summonArt', { ...artBefore, 'find familiar': { owl: { token: TOKEN, portrait: PORTRAIT } } });
      const familiar = await lend('Find Familiar');
      const { message, flag } = await castSummon(familiar);
      const { placedAnswer } = await import('/modules/fvtt-mod-bythebooks/scripts/decide/summons.js');
      const { SUMMON_CHOICES } = await import('/modules/fvtt-mod-bythebooks/scripts/decide/registry.js');
      const { poolFromPacks } = await import('/modules/fvtt-mod-bythebooks/scripts/gallery.js');
      const owl = (await poolFromPacks({ crMax: 0, types: ['beast'] })).find(r => r.name === 'Owl');
      const grid = canvas.scene.grid.size;
      const patch = (flag && owl) ? placedAnswer(flag, { profileId: flag.profiles[0]?.id ?? null, pick: { uuid: owl.uuid, name: owl.name }, count: 1, sceneId: canvas.scene.id,
        creatureType: (flag.creatureTypes ?? []).includes('fey') ? 'fey' : (flag.creatureTypes?.[0] ?? null),
        placements: [{ x: casterToken.x, y: casterToken.y + grid * 2, elevation: casterToken.elevation ?? 0, rotation: 0 }] }, SUMMON_CHOICES) : null;
      if (patch) await message.setFlag(MOD, 'summon', { ...flag, ...patch });
      const landed = patch ? await until(() => message.getFlag(MOD, 'summon')?.applied ? message.getFlag(MOD, 'summon') : null, { timeout: 20000 }) : null;
      const tok = landedToken(landed);
      if (tok) madeTokens.push(tok.id);
      for (const a of game.actors.filter(a => a.getFlag('dnd5e', 'isAutoImported') && a.name === 'Owl')) if (!madeActors.includes(a)) madeActors.push(a);
      ok('§7 the familiar landed as an Owl', landed?.outcome === 'landed' && !!tok, JSON.stringify({ patch: !!patch, owl: !!owl, outcome: landed?.outcome, failure: landed?.failure }));
      ok('§7 it wears the table token', tok?.texture?.src === TOKEN, `texture=${tok?.texture?.src}`);
      ok('§7 the familiar\'s token sees: sight on, the Owl\'s Darkvision 120 ft', seesWith(tok, 120), JSON.stringify(eyes(tok)));
      ok('§7 its sheet wears the table portrait', tok?.actor?.img === PORTRAIT, `img=${tok?.actor?.img}`);
      const effect = caster.effects.find(e => e.getFlag(MOD, 'companion') === message.id);
      ok('§7 the companion effect wears the token', effect?.img === TOKEN, `effect=${effect?.name} img=${effect?.img}`);
      if (landed) {
        await api.askDismiss(message);
        await until(() => message.getFlag(MOD, 'summon')?.dismissed ? true : null, { timeout: 15000 });
      }
    });
    if (want(8)) await section(8, async () => {
      // The folder is Foundry's browse, stubbed for the one call: the suite owns no files on the box.
      const FP = foundry.applications.apps.FilePicker.implementation;
      const browse = FP.browse;
      if (artBefore === undefined) artBefore = foundry.utils.deepClone(game.settings.get(MOD, 'summonArt') ?? {});
      await game.settings.set(MOD, 'summonArt', { 'find familiar': { bat: { token: 'mine/bat.webp' } } });
      FP.browse = async () => ({ files: ['art/fam/owl.webp', 'art/fam/owl-portrait.webp', 'art/fam/bat.webp', 'art/fam/notes.txt'], dirs: [] });
      const menu = game.settings.menus.get(`${MOD}.summonArtMenu`);
      const win = new menu.type();
      try {
        await win.render(true);
        (await until(() => win.element?.querySelector('[data-bf-art-pick-spell="Find Familiar"]'), { timeout: 20000 }))?.click();
        await until(() => win.element?.querySelector('[data-bf-art-row="owl"]'), { timeout: 20000 });
        const folder = win.element.querySelector('[data-bf-art-folder]');
        folder.value = 'art/fam';
        folder.dispatchEvent(new Event('change'));
        win.element.querySelector('[data-bf-art-match]').click();
        const owlToken = await until(() => win.element?.querySelector('[data-bf-art-row="owl"] [data-bf-art-field="token"]')?.value || null, { timeout: 8000 });
        const field = (row, f) => win.element?.querySelector(`[data-bf-art-row="${row}"] [data-bf-art-field="${f}"]`)?.value ?? null;
        ok('§8 Match files fills the Owl', owlToken === 'art/fam/owl.webp' && field('owl', 'portrait') === 'art/fam/owl-portrait.webp', JSON.stringify({ token: owlToken, portrait: field('owl', 'portrait') }));
        ok('§8 a field set by hand is kept', field('bat', 'token') === 'mine/bat.webp', `bat token=${field('bat', 'token')}`);
        win.element.querySelector('[data-bf-art-save]').click();
        const saved = await until(() => { const t = game.settings.get(MOD, 'summonArt'); return t?.['find familiar']?.owl ? t : null; }, { timeout: 8000 });
        ok('§8 Save stores the table by name', JSON.stringify(saved?.['find familiar']) === JSON.stringify({ bat: { token: 'mine/bat.webp' }, owl: { token: 'art/fam/owl.webp', portrait: 'art/fam/owl-portrait.webp' } }), JSON.stringify(saved));
      } finally {
        FP.browse = browse;
        if (win.rendered) await win.close();
      }
    });
    if (want(9)) await section(9, async () => {
      // Battle Familiar on a caster with NO familiar: the plain summon road, the Brute, Fey
      const battle = await lend('Battle Familiar', 'dnd-arcana-unleashed.spells');
      const { placedAnswer } = await import('/modules/fvtt-mod-bythebooks/scripts/decide/summons.js');
      const { SUMMON_CHOICES } = await import('/modules/fvtt-mod-bythebooks/scripts/decide/registry.js');
      const grid = canvas.scene.grid.size;
      const stale = caster.effects.filter(e => /^Battle Familiar/.test(e.name)).map(e => e.id);
      if (stale.length) await caster.deleteEmbeddedDocuments('ActiveEffect', stale, { [MOD]: { summonEnd: true } });
      // a started combat with the caster at 15, so the seat can be read
      let combat = game.combat;
      if (!combat?.getFlag(MOD, 'suiteSummons')) {
        combat = await Combat.create({ scene: canvas.scene.id, active: true, [`flags.${MOD}.suiteSummons`]: true });
        await combat.createEmbeddedDocuments('Combatant', [{ tokenId: casterToken.id, actorId: caster.id, sceneId: canvas.scene.id, initiative: 15 }]);
        await combat.startCombat();
      }
      const conjure = async (dy, form = 'Brute') => {
        const { message, flag } = await castSummon(battle);
        const profile = flag?.profiles?.find(p => /Brute|Flyer|Stalker/.test(p.label || p.name) && (p.label || p.name).includes(form)) ?? flag?.profiles?.[0] ?? null;
        const patch = (flag && profile) ? placedAnswer(flag, { profileId: profile.id, count: 1, sceneId: canvas.scene.id, creatureType: 'fey',
          placements: [{ x: casterToken.x, y: casterToken.y + grid * dy, elevation: casterToken.elevation ?? 0, rotation: 0 }] }, SUMMON_CHOICES) : null;
        if (patch) await message.setFlag(MOD, 'summon', { ...flag, ...patch });
        const landed = patch ? await until(() => message.getFlag(MOD, 'summon')?.applied ? message.getFlag(MOD, 'summon') : null, { timeout: 20000 }) : null;
        const tok = landedToken(landed);
        if (tok) madeTokens.push(tok.id);
        for (const a of game.actors.filter(a => a.getFlag('dnd5e', 'isAutoImported') && /Battle Familiar/.test(a.name))) if (!madeActors.includes(a)) madeActors.push(a);
        return { message, flag, patch, landed, tok };
      };
      const first = await conjure(2);
      const standing = caster.effects.find(e => e.getFlag(MOD, 'summonEffect') === first.message?.id) ?? null;
      ok('§9a the Brute lands as a Fey on the caster\'s 1-hour effect, no companion', first.landed?.outcome === 'landed' && !!first.tok && (first.tok.actor?.system?.details?.type?.value === 'fey')
        && !!standing && (Number(standing.duration?.seconds) === 3600) && !first.landed.companion,
        JSON.stringify({ outcome: first.landed?.outcome, failure: first.landed?.failure, type: first.tok?.actor?.system?.details?.type?.value, effect: standing?.name, seconds: standing?.duration?.seconds }));
      ok('§9b the form rows were marked with the last form (the second cast pre-picks the Brute)', (first.flag?.profiles?.length === 3) && (first.patch?.profileId === first.landed?.profileId), JSON.stringify({ rows: first.flag?.profiles?.map(p => p.label || p.name), picked: first.landed?.profileName }));
      ok('§9g the Brute\'s token sees: sight on, Darkvision 60 ft', seesWith(first.tok, 60), JSON.stringify(eyes(first.tok)));
      const seat = combat.combatants.find(c => c.tokenId === first.tok?.id) ?? null;
      ok('§9c it rolls its own Initiative, not the caster\'s less 0.01', !!seat && Number.isFinite(Number(seat.initiative)) && (seat.initiative !== 14.99), `initiative=${seat?.initiative}`);
      // one at a time: a second cast dismisses the first
      const second = await conjure(3, 'Flyer');
      const firstGone = await until(() => first.message?.getFlag(MOD, 'summon')?.dismissed ? true : null, { timeout: 15000 });
      ok('§9d a second cast dismisses the first (one at a time): its token gone, the new card says so', !!firstGone && !canvas.scene.tokens.get(first.tok?.id) && (second.landed?.replaced >= 1),
        JSON.stringify({ firstDismissed: !!firstGone, firstToken: !!canvas.scene.tokens.get(first.tok?.id), replaced: second.landed?.replaced }));
      // at 0 HP it disappears, what it carried dropped (a dagger given to it)
      const dagger = (await game.packs.get('dnd-players-handbook.equipment')?.getIndex())?.find(e => e.name === 'Dagger') ?? null;
      if (dagger && second.tok?.actor) await second.tok.actor.createEmbeddedDocuments('Item', [(await game.packs.get('dnd-players-handbook.equipment').getDocument(dagger._id)).toObject()]);
      await second.tok?.actor?.update({ 'system.attributes.hp.value': 0 });
      const fell = await until(() => second.message?.getFlag(MOD, 'summon')?.dismissed ? second.message.getFlag(MOD, 'summon') : null, { timeout: 15000 });
      ok('§9e at 0 HP it disappears: the token gone, the record fell, the effect gone', !!fell?.fell && !canvas.scene.tokens.get(second.tok?.id) && !caster.effects.find(e => e.getFlag(MOD, 'summonEffect') === second.message?.id),
        JSON.stringify({ fell: fell?.fell, dismissed: fell?.dismissed, token: !!canvas.scene.tokens.get(second.tok?.id) }));
      // the caster's death takes a third one with it
      const third = await conjure(4, 'Stalker');
      await caster.toggleStatusEffect('dead', { active: true });
      const died = await until(() => third.message?.getFlag(MOD, 'summon')?.dismissed ? true : null, { timeout: 15000 });
      await caster.toggleStatusEffect('dead', { active: false });
      ok('§9f the caster marked dead: the familiar disappears', !!died && !canvas.scene.tokens.get(third.tok?.id), `dismissed=${!!died} token=${!!canvas.scene.tokens.get(third.tok?.id)}`);
    });
    if (want(11)) await section(11, async () => {
      // a thing (RULINGS *Summons*, call 60): the pack's Mage Hand is a "Spectral Hand" with no senses — its owner sees nothing through it
      const hand = await lend('Mage Hand');
      const { message, flag } = await castSummon(hand);
      const landed = flag ? await answer(message) : null;
      const tok = landedToken(landed);
      if (tok) madeTokens.push(tok.id);
      ok('§11a Mage Hand landed', landed?.outcome === 'landed' && !!tok, JSON.stringify({ outcome: landed?.outcome, failure: landed?.failure }));
      ok('§11b its token\'s sight stays off', !!tok && !eyes(tok).on, JSON.stringify({ ...eyes(tok), type: tok?.actor?.system?.details?.type?.value ?? null }));
      if (landed) {
        await api.askDismiss(message);
        const gone = await until(() => message.getFlag(MOD, 'summon')?.dismissed ? true : null, { timeout: 15000 });
        ok('§11c Dismiss takes it', !!gone && !canvas.scene.tokens.get(tok?.id), `dismissed=${!!gone} token=${!!canvas.scene.tokens.get(tok?.id)}`);
      }
    });
    if (want(12)) await section(12, async () => {
      // the one thing that sees (RULINGS *Summons*, call 62): Clairvoyance's sensor, by its SUMMON_LOOKS row; no Concentration standing first
      if (caster.concentration?.effects?.size) {
        await caster.endConcentration().catch(() => {});
        await until(() => !caster.concentration?.effects?.size, { label: 'the Sorcerer\'s Concentration ended' });
      }
      const spell = await lend('Clairvoyance');
      const { message, flag } = await castSummon(spell);
      const landed = flag ? await answer(message) : null;
      const tok = landedToken(landed);
      if (tok) madeTokens.push(tok.id);
      for (const a of game.actors.filter(a => a.getFlag('dnd5e', 'isAutoImported') && (a.name === 'Invisible Sensor'))) if (!madeActors.includes(a)) madeActors.push(a);
      ok('§12a the sensor landed, drawn half seen', landed?.outcome === 'landed' && !!tok && (Number(tok.alpha) === 0.5), JSON.stringify({ outcome: landed?.outcome, failure: landed?.failure, alpha: tok?.alpha }));
      ok('§12b its token sees, though it is a thing', eyes(tok).on, JSON.stringify({ ...eyes(tok), type: tok?.actor?.system?.details?.type?.value ?? null }));
      const conc = caster.effects.get(message?.system?.concentration ?? '') ?? null;
      if (conc) await conc.delete();
      else if (landed) await api.askDismiss(message);
      const gone = landed ? await until(() => message.getFlag(MOD, 'summon')?.dismissed ? true : null, { timeout: 15000 }).catch(() => null) : null;
      ok('§12c ending the spell takes it', !!gone && !canvas.scene.tokens.get(tok?.id), `dismissed=${!!gone} token=${!!canvas.scene.tokens.get(tok?.id)} concentration=${!!conc}`);
    });
  } catch (err) {
    results.push({ name: 'suite threw', pass: false, detail: `${err?.message}\n${err?.stack}` });
  } finally {
    await teardown();
  }
  return { results, log, skips };
}, sectionArg(plan, SECTIONS));

/** §10's record, armed on the suite's page: Summon Beast lent and cast to its card (no Concentration standing first), the Land spirit's answer computed. */
const armBeast = async ({ xName }) => {
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
  if (caster.concentration?.effects?.size) {
    await caster.endConcentration().catch(() => {});
    await until(() => !caster.concentration?.effects?.size, { label: 'the Sorcerer\'s Concentration ended' });
  }
  const since = Date.now() - 1000;
  const { placedAnswer } = await import(`/modules/${MOD}/scripts/decide/summons.js`);
  const { SUMMON_CHOICES } = await import(`/modules/${MOD}/scripts/decide/registry.js`);
  const pack = game.packs.get('dnd-players-handbook.spells');
  const hit = (await pack.getIndex()).find(e => e.name === 'Summon Beast');
  const src = (await pack.getDocument(hit._id)).toObject();
  src.system.prepared = 1;
  src.flags = { ...(src.flags ?? {}), world: { ...(src.flags?.world ?? {}), twoGmSection: true } };
  const [item] = await caster.createEmbeddedDocuments('Item', [src]);
  const activity = item.system.activities.getByType('summon')[0];
  const result = await activity.use({ consume: { spellSlot: false }, create: { measuredTemplate: false }, [MOD]: { toCard: true } }, { configure: false }, { create: true });
  const message = result?.message instanceof ChatMessage ? result.message : null;
  if (!message) return { fatal: 'the cast posted no card' };
  const flag = await until(() => (message.getFlag(MOD, 'summon')?.status === 'asked') ? message.getFlag(MOD, 'summon') : null, { timeout: 8000, label: 'the record asked' });
  const profile = flag.profiles.find(p => (p.label === 'Bestial Land Spirit') || (p.name === 'Bestial Land Spirit')) ?? flag.profiles[0];
  const patch = placedAnswer(flag, { profileId: profile?.id ?? null, choice: null, count: 1, sceneId: range.id,
    placements: [{ x: casterToken.x + range.grid.size * 2, y: casterToken.y, elevation: casterToken.elevation ?? 0, rotation: 0 }] }, SUMMON_CHOICES);
  if (!patch) return { fatal: 'placedAnswer refused the answer' };
  return { messageId: message.id, patch, casterId: caster.id, sceneId: range.id, xUserId: xUser.id, since, concentration: true };
};

if (!out?.fatal && (!plan || plan.includes('10'))) {
  const env = loadEnv();
  const assistant = gmIdentity(env, 'assistant');
  if (!assistant) {
    out.results.push({ name: '§10 the assistant identity is named in the .env (FOUNDRY_ASSISTANT_USER)', pass: false, detail: 'tools/README.md, the live tier\'s table' });
  } else {
    const run = await arrivalLanding(f, { env, key: 'assistant', prep: armBeast, prepArg: { xName: assistant.user }, flagKey: 'summon', tag: 'summons:assistant' });
    if (run.prep?.fatal) out.results.push({ name: `§10 armed — ${run.prep.fatal}`, pass: false });
    else {
      const judged = await f.evaluate(judgeArrival, { ...sectionArg(plan, SECTIONS), run, id: 10, expect: { companionEffects: 0 } });
      out.results.push(...judged.results);
      out.log.push(...judged.log);
    }
  }
  out.skips.push('§10 a Gamemaster beside an Assistant GM — waits for the gm2 user (HANDOFF §7 item 1)');
} else if (!out?.fatal) out.skips.push(`§10 ${SECTIONS[10]}`);

await finish({ tag: 'summons', out, plan, f });
