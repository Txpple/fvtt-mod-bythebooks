// Aasimar smoke suite (RULINGS *The Aasimar walk*): Celestial Revelation's self areas centred on
// the token, Inner Radiance's light and pulse, Necrotic Shroud asking no ally, the Revelation's
// extra damage on a hit and on a spell, the Light spell's emission on a token target, and Produce
// Flame's light on its caster (RULINGS *Produce Flame*).
// Fixtures (tools/fixture-suite.mjs): BTB Test Halfling (PB 2) lent the PHB's items; BTB Test Victim
// (hostile) and BTB Test Ranger (friendly) beside it. Everything written is restored or deleted.
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from './harness.mjs';

// The coverage map (tools/coverage-map.mjs) parses this; ⚠ never import a suite (it connects on evaluation).
export const COVERS = [
  'token-lights.js',        // §2, §7, §8, §9 — Searing Radiance with its light, the Light spell on a token, Produce Flame on its caster
  'emanations.js',          // §1, §2, §4, §6 — the self area placed on the token, the `while` ring, the pulse
  'cast.js',                // §9 — the cast path leaves the effect a token light adopts
  'clock-riders.js',        // §1, §3, §5 — the form chip, the Revelation rider on a hit and on a spell
  'saves/demand.js'         // §1 — an `enemy` area asks no ally
];

const SECTIONS = {
  1: 'Necrotic Shroud: no placement — the area lands on the token by itself; its save asks the hostile beside it and NOT the ally; the form chip marks the Aasimar; the failed save\'s Frightened ends at the end of the Aasimar\'s next turn (Errata 5e E-002, when Errata 5e is on); a hit then carries +PB NECROTIC',
  2: 'Inner Radiance: the use places no area and rolls no damage; Searing Radiance lands on the Aasimar with 10 ft Bright / 20 ft Dim on its token, and the 10-ft ring stands on it, announced',
  3: 'a spell with no attack roll (Sacred Flame): once its damage lands, its card offers +PB radiant to ONE damaged target; the pick lands on its own card with a receipt',
  4: 'the pulse: the Aasimar\'s turn ends in combat — every creature within 10 ft, the ally included, takes PB radiant on one card with receipts; the Aasimar does not',
  5: 'a weapon hit in combat carries +PB RADIANT once; the second hit the same turn carries none',
  6: 'the transformation ends (Searing Radiance removed): the ring comes down and the token\'s light goes',
  7: 'the Light spell at a targeted token: no summon, a "Light" effect with 20 ft Bright / 40 ft Dim on its token; cast again at another, the first light goes out',
  8: 'Produce Flame: the Cast lights the CASTER\'s token 20 ft Bright / 40 ft Dim under a 10-minute "Produce Flame" effect, receipted on its card; cast again, one copy stands; ✕ Revert takes it off and the token\'s own light is back; Hurl Fire puts it out and its card says so; a hurl with no flame lit lands nothing',
  9: 'Produce Flame as a table\'s sheet has it: a world copy whose Cast applies its own "Produce Flame" effect, on a token with a light set on it (10 / 20) — the Cast lands ONE "Produce Flame" carrying the light; a recast leaves one; ✕ Revert, and a hurl after the Cast, leave no "Produce Flame" and the token at its own 10 / 20, the hurl\'s card naming that light; a hurl with no Cast lands nothing'
};
const DEPENDS = { 3: [2], 4: [2], 5: [2], 6: [2] };

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'aasimar', watchdogMs: 600_000 });
announcePlan('aasimar', plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = 'fvtt-mod-bythebooks';
  const { until, watch, canvasReady, tokenOn, snapshotSettings, faces, unrig } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const suiteStart = Date.now();

  const mod = game.modules.get(MOD);
  if (!mod?.active) return { fatal: `module active=${mod?.active}` };
  if (!game.settings.settings.has(`${MOD}.decisionTimer`)) return { fatal: 'decisionTimer not registered — OLD code (restart the box)' };

  const SETTING_KEYS = ['autoDamage', 'autoApply', 'playerRollDamage', 'damageTimer', 'dramaticBeat', 'requireTarget',
    'reactionHold', 'holdTimer', 'riders', 'effectRiders', 'masteryRiders', 'masteryAsk', 'saves', 'saveTimer', 'castApply',
    'concMode', 'reminderList', 'clockRiderList', 'damageEitherList', 'emanations', 'emanationList', 'tokenLightList', 'metamagicList'];
  const settings = snapshotSettings(SETTING_KEYS);
  const { set } = settings;
  const def = k => game.settings.settings.get(`${MOD}.${k}`)?.default;

  const scene = game.scenes.getName('By the Books Test Range');
  const victim = game.actors.getName('BTB Test Victim');
  const aas = game.actors.getName('BTB Test Halfling');
  const ally = game.actors.getName('BTB Test Ranger');
  if (!scene || !victim || !aas || !ally) return { fatal: 'missing fixture: scene, BTB Test Victim, BTB Test Halfling or BTB Test Ranger — run tools/fixture-suite.mjs' };

  const created = { tokens: [], items: [] };
  const priorActor = {};
  let combat = null;
  let restored = false;
  const realDice = () => { unrig(); };
  const ours = e => e.getFlag(MOD, 'tokenLight') || e.getFlag(MOD, 'formChip') || e.getFlag(MOD, 'mastery')
    || /^(Searing Radiance|Heavenly Wings|Necrotic Shroud|Light|Produce Flame)$/.test(e.name) || /Celestial Revelation|used this turn/.test(e.name);
  const clearEffects = async () => {
    for (const a of [victim, aas, ally]) {
      const live = a.effects.filter(ours).map(e => e.id).filter(id => a.effects.get(id));
      if (live.length) await a.deleteEmbeddedDocuments('ActiveEffect', live).catch(() => {});
    }
  };
  const areaRegions = () => scene.regions.filter(r => {
    const item = r.getFlag('dnd5e', 'item') ?? r.getFlag(MOD, 'emanation')?.itemUuid ?? '';
    return created.items.some(([, id]) => String(item).endsWith(`Item.${id}`));
  });
  const teardown = async () => {
    if (restored) return;
    restored = true;
    realDice();
    for (const failed of await settings.restore()) log.push(`TEARDOWN settings ERROR: ${failed}`);
    try {
      await clearEffects();
      try { if (combat && game.combats.get(combat.id)) await combat.delete(); } catch { /* gone */ }
      for (const r of areaRegions()) await r.delete().catch(() => {});
      for (const [actorId, ids] of Object.entries(created.items.reduce((m, [a, id]) => { (m[a] ??= []).push(id); return m; }, {}))) {
        const actor = game.actors.get(actorId);
        const live = ids.filter(id => actor?.items.get(id));
        if (live.length) await actor.deleteEmbeddedDocuments('Item', live);
      }
      const liveTokens = created.tokens.filter(id => scene.tokens.get(id));
      if (liveTokens.length) await scene.deleteEmbeddedDocuments('Token', liveTokens);
      for (const [actorId, data] of Object.entries(priorActor)) await game.actors.get(actorId)?.update(data);
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      const mine = game.messages.filter(m => (m.timestamp >= suiteStart)
        && (m.speaker?.alias?.startsWith?.('BTB Test') || m.speaker?.alias === 'By the Books' || Object.keys(m.flags?.[MOD] ?? {}).length));
      if (mine.length) await ChatMessage.deleteDocuments(mine.map(m => m.id));
    } catch (err) {
      log.push(`TEARDOWN ERROR: ${err?.message}`);
    }
  };

  try {
    await set('autoDamage', 'all');
    await set('autoApply', true);
    await set('playerRollDamage', false);
    await set('damageTimer', 1);      // a due rider opens the damage offer; its clock rolls it
    await set('dramaticBeat', 0);
    await set('requireTarget', false);
    await set('reactionHold', false);
    await set('holdTimer', 0);
    await set('riders', false);
    await set('effectRiders', true);
    await set('masteryRiders', false);
    await set('masteryAsk', false);
    await set('saves', true);
    await set('saveTimer', 2);        // nobody answers: the buzzer rolls, the dice are the suite's
    await set('castApply', true);
    await set('concMode', 'off');
    await set('reminderList', '');
    await set('damageEitherList', '');   // the Halfling's Savage Attacker would pause every hit
    await set('metamagicList', '');
    await set('clockRiderList', def('clockRiderList'));
    await set('emanations', true);
    await set('emanationList', def('emanationList'));
    await set('tokenLightList', def('tokenLightList'));

    // ---- fixtures
    if (canvas.scene?.id !== scene.id) await scene.view();
    await canvasReady();
    const strays = scene.tokens.filter(t => [victim.id, aas.id].includes(t.actorId)).map(t => t.id);
    if (strays.length) await scene.deleteEmbeddedDocuments('Token', strays);
    const px = scene.grid.size / scene.grid.distance;
    const placeToken = async (actor, x, y) => {
      const [doc] = await scene.createEmbeddedDocuments('Token', [
        foundry.utils.mergeObject(actor.prototypeToken.toObject(), { x, y, actorId: actor.id, actorLink: true }, { inplace: false })]);
      created.tokens.push(doc.id);
      await tokenOn(doc.id);
      const token = canvas.tokens.get(doc.id);
      if (!token) throw new Error(`${actor.name}'s token never reached the canvas`);
      return { doc, token };
    };
    const g = scene.grid.size;
    const { doc: aasDoc, token: aasToken } = await placeToken(aas, 15 * g, 17 * g);
    const { doc: victimDoc, token: victimToken } = await placeToken(victim, 14 * g, 17 * g);
    const { doc: allyDoc, token: allyToken } = await placeToken(ally, 16 * g, 17 * g);
    log.push(`dispositions aas=${aasDoc.disposition} victim=${victimDoc.disposition} ally=${allyDoc.disposition}; PB ${aas.system.attributes.prof}`);
    const pb = Number(aas.system.attributes.prof);

    for (const a of [victim, ally]) {
      priorActor[a.id] = { 'system.attributes.hp.value': a.system._source.attributes.hp.value, 'system.attributes.hp.max': a.system._source.attributes.hp.max,
        'system.attributes.ac.override': a.system._source.attributes.ac.override ?? null };
      await a.update({ 'system.attributes.hp.max': 400, 'system.attributes.hp.value': 400, 'system.attributes.ac.override': 10 });
    }
    const healAll = async () => { for (const a of [victim, ally]) await a.update({ 'system.attributes.hp.value': 400, 'system.attributes.hp.temp': 0 }); };

    // The lent items, from the packs a player's would come from.
    const lend = async (packId, name) => {
      const pack = game.packs.get(packId);
      const entry = (await pack.getIndex()).find(e => e.name === name);
      if (!entry) throw new Error(`${name} not in ${packId}`);
      const doc = await pack.getDocument(entry._id);
      const [item] = await aas.createEmbeddedDocuments('Item', [doc.toObject()]);
      created.items.push([aas.id, item.id]);
      return item;
    };
    await clearEffects();
    const rev = await lend('dnd-players-handbook.origins', 'Celestial Revelation');
    const light = await lend('dnd-players-handbook.spells', 'Light');
    const flame = await lend('dnd-players-handbook.spells', 'Sacred Flame');
    const produce = await lend('dnd-players-handbook.spells', 'Produce Flame');
    const actNamed = (item, n) => item.system.activities.find(a => a.name === n);
    const shroudAct = actNamed(rev, 'Necrotic Shroud');
    const irAct = actNamed(rev, 'Inner Radiance');
    const freshUse = async () => rev.update({ 'system.uses.spent': 0 });

    // ---- helpers
    const textOf = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const cardEl = id => document.querySelector(`.message[data-message-id="${id}"]`);
    const use = async (activity, config = {}) => {
      aasToken.control({ releaseOthers: true });
      let settled = false;
      let failed = false;
      let res = null;
      activity.use({ consume: { spellSlot: false }, ...config }, { configure: false }, { create: true })
        .then(r => { settled = true; res = r; }, err => { failed = true; log.push(`use(${activity.name}): ${err?.message}`); });
      // A use that waits on a placement click never settles: 8 s is its window, and `settled` says which it was.
      await until(() => settled || failed, { timeout: 8000, label: `the use of ${activity.name} settled` }).catch(() => null);
      return { res, settled };
    };
    const target = (...tokens) => {
      game.user.targets.forEach(t => { t.setTarget(false, { releaseOthers: true }); });
      tokens.forEach((t, i) => { t.setTarget(true, { releaseOthers: i === 0 }); });
    };
    const shortsword = aas.items.find(i => (i.type === 'weapon') && (i.name === 'Shortsword'));
    const swordAct = shortsword?.system.activities.find(a => a.type === 'attack');
    const damageFor = originId => game.messages.contents.find(m => (m.type === 'damage') && (m._source.system?.origin === originId));
    const swing = async () => {
      aasToken.control({ releaseOthers: true });
      target(victimToken);
      faces([[15, 20], [3, 6]]);
      const results = await swordAct.use({ subsequentActions: false }, { configure: false }, {});
      const rolls = await swordAct.rollAttack({}, { configure: false }, results?.message?.id ? { data: { 'system.origin': results.message.id } } : {});
      const attackMsg = rolls?.[0]?.parent ?? null;
      const originId = attackMsg?._source.system?.origin ?? attackMsg?.id;
      // A swing with no damage message is logged and handed back as null (the callers read `!!dmg`).
      const dmg = await until(() => damageFor(originId), { timeout: 15000 }).catch(() => null);
      realDice();
      if (!dmg) log.push(`swing: no damage message for ${originId}`);
      return dmg;
    };
    const revRider = dmg => (dmg?.getFlag(MOD, 'clockRiders')?.riders ?? []).find(r => r.key === 'celestial-revelation') ?? null;
    const ring = () => scene.regions.find(r => (r.getFlag(MOD, 'emanation')?.key === 'Inner Radiance') && (r.getFlag(MOD, 'emanation')?.tokenId === aasDoc.id)) ?? null;
    const lightOf = doc => ({ bright: scene.tokens.get(doc.id)?.light?.bright ?? null, dim: scene.tokens.get(doc.id)?.light?.dim ?? null });

    // ---- 1. Necrotic Shroud
    if (want(1)) await section(1, async () => {
      await freshUse();
      target();
      faces([[1, 20]]);   // the victim's save, when the buzzer rolls it
      try {
        const { settled } = await use(shroudAct);
        ok('1a. the use settles with no placement click (the prompt is off for a self-centered area)', settled, '');
        const area = await until(() => scene.regions.find(r => r.getFlag('dnd5e', 'activity') === shroudAct.uuid) ?? null, { timeout: 8000 });
        const shape = area?.shapes?.[0];
        ok('1b. the area is on the Aasimar\'s token — an attached emanation, 10 ft from the edge, never drawn (the ring ruling reaches every area placed on a token)',
          !!area && (area.attachment?.token?.id === aasDoc.id) && (shape?.type === 'emanation') && (shape?.radius === 10 * px) && (area.visibility === CONST.REGION_VISIBILITY.LAYER_UNLOCKED) && area.locked,
          `area=${area?.id} attached=${area?.attachment?.token?.id} shape=${JSON.stringify(shape)} visibility=${area?.visibility}`);
        const demand = await until(() => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && (m.getFlag(MOD, 'saves')?.activityUuid === shroudAct.uuid)).at(-1)?.getFlag(MOD, 'saves')?.targets?.length
          ? game.messages.contents.filter(m => (m.timestamp >= suiteStart) && (m.getFlag(MOD, 'saves')?.activityUuid === shroudAct.uuid)).at(-1) : null, { timeout: 10000 });
        const names = demand?.getFlag(MOD, 'saves')?.targets?.map(t => t.name) ?? [];
        ok('1c. the save asks the hostile beside the Aasimar and NOT the ally or the Aasimar ("creatures other than your allies")',
          names.includes(victimDoc.name) && !names.includes(allyDoc.name) && !names.includes(aasDoc.name), `targets=[${names.join(', ')}]`);
        const chip = await until(() => aas.effects.find(e => e.getFlag(MOD, 'formChip')?.form === 'necrotic shroud') ?? null, { timeout: 6000 });
        ok('1d. the form chip marks the Aasimar: "Celestial Revelation: Necrotic Shroud", the transformation\'s minute',
          !!chip && (chip.name === 'Celestial Revelation: Necrotic Shroud') && (chip.duration?.seconds === 60 || chip.duration?.value === 1 || chip._source.duration?.value === 1),
          `chip=${chip?.name} duration=${JSON.stringify(chip?._source?.duration)}`);
        const frightened = await until(() => victim.effects.find(e => (e.name === 'Necrotic Shroud') && e.statuses.has('frightened')) ?? null, { timeout: 15000 });
        realDice();
        // Errata 5e has no settings: the module enabled means every fix is on, E-002 among them.
        const errataOn = !!game.modules.get('fvtt-mod-errata5e')?.active;
        if (errataOn) {
          ok('1e. the failed save frightens — and (Errata 5e E-002) until the end of the Aasimar\'s next turn: expiry sourceEnd',
            !!frightened && (frightened._source.duration?.expiry === 'sourceEnd'), `effect=${frightened?.name} duration=${JSON.stringify(frightened?._source?.duration)}`);
        } else {
          ok('1e. the failed save frightens (Errata 5e is off or absent here — the clock is the pack\'s)', !!frightened,
            `errata5e active=${errataOn} duration=${JSON.stringify(frightened?._source?.duration)}`);
        }
        const dmg = await swing();
        const r = revRider(dmg);
        ok(`1f. a weapon hit while the Shroud stands carries +${pb} NECROTIC (the form's type)`, !!r && (r.type === 'necrotic') && (String(r.formula) === String(pb)),
          `rider=${JSON.stringify(r)}`);
      } finally {
        realDice();
        for (const x of scene.regions.filter(r2 => r2.getFlag('dnd5e', 'activity') === shroudAct.uuid)) await x.delete().catch(() => {});
        await clearEffects();
        await healAll();
      }
    });

    // ---- 2. Inner Radiance
    let searing = null;
    if (want(2)) await section(2, async () => {
      await freshUse();
      target(victimToken);
      const before = new Set(game.messages.map(m => m.id));
      const baseLight = lightOf(aasDoc);
      const trace = Hooks.on('dnd5e.preRollDamage', config => { if (config?.subject?.name === 'Inner Radiance') log.push(`IR damage roll from: ${new Error().stack.split('\n').slice(2, 14).join(' | ')}`); });
      const { settled } = await use(irAct);
      setTimeout(() => Hooks.off('dnd5e.preRollDamage', trace), 4000);
      ok('2a. the transform settles with no placement click', settled, '');
      searing = await until(() => aas.effects.find(e => (e.name === 'Searing Radiance') && e.getFlag(MOD, 'tokenLight')) ?? null, { timeout: 8000 });
      const keys = (searing?.system?.changes ?? []).map(c => `${c.key}=${c.value}`);
      ok('2b. Searing Radiance lands on the Aasimar carrying the light (token.light.bright 10, token.light.dim 20)',
        !!searing && keys.includes('token.light.bright=10') && keys.includes('token.light.dim=20'), `effect=${searing?.name} changes=[${keys.join(', ')}]`);
      const lit = await until(() => (lightOf(aasDoc).bright === 10) ? lightOf(aasDoc) : null, { timeout: 5000 });
      ok('2c. the token itself sheds it: 10 ft Bright, 20 ft Dim', !!lit && (lit.dim === 20), `light=${JSON.stringify(lightOf(aasDoc))} before=${JSON.stringify(baseLight)}`);
      const rg = await until(() => ring()?.behaviors?.find(b => b.type === `${MOD}.emanation`) ? ring() : null, { timeout: 8000 });
      ok('2d. the 10-ft ring stands on the Aasimar (reach every creature) while Searing Radiance does',
        !!rg && (rg.shapes?.[0]?.radius === 10 * px) && (rg.behaviors.find(b => b.type === `${MOD}.emanation`)?.system?.reach === 'all'),
        `ring=${rg?.id} radius=${rg?.shapes?.[0]?.radius} reach=${rg?.behaviors.find(b => b.type === `${MOD}.emanation`)?.system?.reach}`);
      // The window a damage roll, an area for the use or Searing Radiance on the victim must NOT arrive in.
      const stray = await watch(() => game.messages.find(m => !before.has(m.id) && (m.type === 'damage'))
        ?? scene.regions.find(r => r.getFlag('dnd5e', 'activity') === irAct.uuid)
        ?? victim.effects.find(e => e.name === 'Searing Radiance'), { ms: 1500 });
      const fresh = game.messages.filter(m => !before.has(m.id));
      const damageRolls = fresh.filter(m => m.type === 'damage');
      const placed = scene.regions.filter(r => r.getFlag('dnd5e', 'activity') === irAct.uuid);
      ok('2e. no damage at the transform and no area placed for it (the pulse is the damage; the ring is the area)',
        !stray && !damageRolls.length && !placed.length && !victim.effects.some(e => e.name === 'Searing Radiance'),
        `stray=${stray?.name ?? stray?.id ?? null} damage=${damageRolls.length} placed=${placed.length} ${damageRolls.map(m => `[${m.getAssociatedActivity?.()?.item?.name}/${m.getAssociatedActivity?.()?.name} flags=${Object.keys(m.flags?.[MOD] ?? {}).join(',')} origin=${m._source.system?.origin}]`).join(' ')}`);
      const card = await until(() => game.messages.find(m => !before.has(m.id) && (m.getFlag(MOD, 'emanationCard')?.key === 'Inner Radiance')),
        { timeout: 5000, label: 'the ring\'s announcement card' });
      ok('2f. the ring is announced, naming the pulse', !!card && /end of your turns/.test(textOf(cardEl(card.id)) || card.content), (card?.content ?? '').replace(/<[^>]+>/g, ' ').slice(0, 200));
      // The effect receipt joins the use's card after its token-light record.
      const useCard = await until(() => game.messages.find(m => !before.has(m.id) && m.getFlag(MOD, 'tokenLight')?.landed?.length && m.getFlag(MOD, 'effectReceipt')),
        { timeout: 5000, label: 'the use\'s card with its light landed and its effect receipt' });
      ok('2g. the use\'s card says the light landed (Token light) and carries the effect receipt', !!useCard?.getFlag(MOD, 'tokenLight')?.landed?.length && !!useCard?.getFlag(MOD, 'effectReceipt'),
        JSON.stringify(useCard?.getFlag(MOD, 'tokenLight')));
    });

    // ---- 3. a spell's damage, the ONE target
    if (want(3) && searing) await section(3, async () => {
      await healAll();
      target(victimToken);
      faces([[1, 20]]);   // every die its lowest: the victim's save fails, the flame deals 1
      await use(flame.system.activities.find(a => a.type === 'save'));
      const spellDmg = await until(() => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && (m.type === 'damage') && (m.getFlag(MOD, 'receipt')?.targets?.length)
        && (m.getAssociatedActivity?.()?.item?.name === 'Sacred Flame')).at(-1) ?? null, { timeout: 15000 });
      realDice();
      ok('3a. Sacred Flame\'s damage landed on the victim (a receipt on its damage card)', !!spellDmg, '');
      const offer = await until(() => [...(cardEl(spellDmg?.id)?.querySelectorAll('button') ?? [])].find(b => textOf(b) === victimDoc.name) ?? null, { timeout: 5000 });
      ok(`3b. the card offers +${pb} radiant to one damaged target — a button per creature`, !!offer && /Celestial Revelation — \+\d+ radiant to one target/.test(textOf(cardEl(spellDmg?.id))),
        textOf(cardEl(spellDmg?.id)).slice(-240));
      const hp0 = victim.system.attributes.hp.value;
      offer?.click();
      const riderCard = await until(() => game.messages.contents.find(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'spellRiderCard') && m.getFlag(MOD, 'receipt')) ?? null, { timeout: 8000 });
      const taken = riderCard?.getFlag(MOD, 'receipt')?.targets?.[0]?.taken;
      ok(`3c. the pick lands ${pb} radiant on the victim on its own card, with a receipt`, (taken === pb) && (victim.system.attributes.hp.value === hp0 - pb), `taken=${taken} hp ${hp0}→${victim.system.attributes.hp.value}`);
      const named = await until(() => { const t = textOf(cardEl(spellDmg?.id)); return (!/to one target \(/.test(t) && /Celestial Revelation — \+\d+ radiant to/.test(t)) ? t : null; }, { timeout: 6000 });
      ok('3d. the offer is gone and the spell\'s card names where the extra went', !!named,
        `flag=${JSON.stringify(game.messages.get(spellDmg?.id)?.getFlag(MOD, 'spellRider'))} text=${textOf(cardEl(spellDmg?.id)).slice(0, 400)}`);
    });

    // ---- 4. the pulse
    if (want(4) && searing) await section(4, async () => {
      await healAll();
      if (game.combat) await game.combat.delete();
      combat = await Combat.create({ scene: scene.id });
      await combat.createEmbeddedDocuments('Combatant', [
        { actorId: aas.id, tokenId: aasDoc.id, sceneId: scene.id, initiative: 20 },
        { actorId: victim.id, tokenId: victimDoc.id, sceneId: scene.id, initiative: 10 },
        { actorId: ally.id, tokenId: allyDoc.id, sceneId: scene.id, initiative: 5 }]);
      await combat.startCombat();
      await until(() => combat.started, { label: 'the combat started' });
      ok('4-. the Aasimar has the turn', combat.combatant?.actorId === aas.id, `current=${combat.combatant?.name}`);
      await combat.nextTurn();
      const pulseCard = await until(() => game.messages.contents.find(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'emanationPulse') && m.getFlag(MOD, 'receipt')?.targets?.length >= 2) ?? null, { timeout: 10000 });
      const rec = pulseCard?.getFlag(MOD, 'receipt')?.targets ?? [];
      const byName = Object.fromEntries(rec.map(t => [t.name, t.taken]));
      ok(`4a. the turn ended: ONE card, every creature within 10 ft takes ${pb} radiant — the hostile AND the ally`,
        (byName[victimDoc.name] === pb) && (byName[allyDoc.name] === pb), JSON.stringify(byName));
      ok('4b. the Aasimar takes none of its own light', !(aasDoc.name in byName), JSON.stringify(Object.keys(byName)));
      const pulseCards = () => game.messages.contents.filter(m => (m.timestamp >= suiteStart) && m.getFlag(MOD, 'emanationPulse'));
      // The window an echoed update's second pulse card would arrive in.
      const echo = await watch(() => pulseCards().length > 1, { ms: 1200 });
      const again = pulseCards();
      ok('4c. once per ended turn — one pulse card, however the update echoes', !echo && (again.length === 1), `cards=${again.length}`);
      await combat.nextTurn();   // the victim's turn ends — no pulse
      // The window a pulse on another creature's turn end would arrive in.
      const wrong = await watch(() => pulseCards().length > 1, { ms: 1000 });
      ok('4d. another creature\'s turn ending pays nothing', !wrong && (pulseCards().length === 1), `cards=${pulseCards().length}`);
    });

    // ---- 5. the rider on a hit, once per turn
    if (want(5) && searing) await section(5, async () => {
      await healAll();
      const first = await swing();
      const r1 = revRider(first);
      ok(`5a. a hit carries +${pb} RADIANT (Inner Radiance's type)`, !!r1 && (r1.type === 'radiant') && (String(r1.formula) === String(pb)), JSON.stringify(r1));
      if (combat) {
        const second = await swing();
        ok('5b. in combat, the second hit the same turn carries none (the rider chit)', !!second && !revRider(second), `dmg=${!!second} rider=${JSON.stringify(revRider(second))}`);
      }
    });

    // ---- 6. the transformation ends
    if (want(6) && searing) await section(6, async () => {
      if (combat && game.combats.get(combat.id)) { await combat.delete(); combat = null; }
      const live = aas.effects.find(e => e.name === 'Searing Radiance');
      if (live) await live.delete();
      const gone = await until(() => !ring(), { timeout: 8000 });
      ok('6a. the ring comes down with the transformation', gone, `ring=${ring()?.id}`);
      const dark = await until(() => lightOf(aasDoc).bright !== 10, { timeout: 5000 });
      ok('6b. the token\'s light goes with the effect', dark, JSON.stringify(lightOf(aasDoc)));
    });

    // ---- 7. the Light spell on a token
    if (want(7)) await section(7, async () => {
      const act = light.system.activities.contents[0];
      const lightActorsBefore = scene.tokens.filter(t => /^Light/.test(t.name)).length;
      // every summon spell answers in By the Books' window (RULINGS *Summons*, calls 32-34): a token targeted, its pill
      // is picked and the button reads "Light" — press it, as the player does
      const pressLight = async () => {
        const btn = await until(() => [...document.querySelectorAll('button[data-action="place"]')].find(b => /^\s*Light\s*$/.test(b.textContent ?? '')) ?? null, { timeout: 6000 });
        btn?.click();
        return !!btn;
      };
      target(victimToken);
      await use(act);
      await pressLight();
      const onVictim = await until(() => victim.effects.find(e => e.getFlag(MOD, 'tokenLight')?.key === 'Light') ?? null, { timeout: 8000 });
      const vl = await until(() => (lightOf(victimDoc).bright === 20) ? lightOf(victimDoc) : null, { timeout: 5000 });
      ok('7a. the targeted token wears "Light" and sheds 20 ft Bright, 40 ft Dim', !!onVictim && !!vl && (vl.dim === 40),
        `effect=${onVictim?.name} light=${JSON.stringify(lightOf(victimDoc))} duration=${JSON.stringify(onVictim?._source?.duration)}`);
      // The window a summoned Light token must NOT arrive in.
      const summoned = await watch(() => scene.tokens.filter(t => /^Light/.test(t.name)).length !== lightActorsBefore, { ms: 800 });
      ok('7b. cast at a token, nothing is summoned', !summoned && (scene.tokens.filter(t => /^Light/.test(t.name)).length === lightActorsBefore), '');
      target(allyToken);
      await use(act);
      await pressLight();
      const onAlly = await until(() => ally.effects.find(e => e.getFlag(MOD, 'tokenLight')?.key === 'Light') ?? null, { timeout: 8000 });
      const out = await until(() => !victim.effects.some(e => e.getFlag(MOD, 'tokenLight')?.key === 'Light'), { timeout: 5000 });
      ok('7c. cast again at the ally: the ally is lit and the victim\'s light is out ("the spell ends if you cast it again")', !!onAlly && out,
        `ally=${onAlly?.name} victimStill=${!out} victimLight=${JSON.stringify(lightOf(victimDoc))}`);
    });

    // ---- 8. Produce Flame on its caster
    if (want(8)) await section(8, async () => {
      await clearEffects();
      const castAct = actNamed(produce, 'Cast');
      const hurlAct = actNamed(produce, 'Hurl Fire');
      if (!castAct || !hurlAct) throw new Error(`Produce Flame's activities: ${produce.system.activities.map(a => a.name).join(', ')}`);
      const flames = () => aas.effects.filter(e => e.getFlag(MOD, 'tokenLight')?.key === 'Produce Flame');
      await until(() => !aas.effects.some(e => e.getFlag(MOD, 'tokenLight')), { timeout: 5000, label: 'no token light left on the Aasimar' });
      const base = lightOf(aasDoc);
      const isBase = () => (lightOf(aasDoc).bright === base.bright) && (lightOf(aasDoc).dim === base.dim);
      const tenMinutes = d => ((Number(d?.value) === 10) && /^minute/.test(d?.units ?? '')) || ((Number(d?.value) === 600) && /^second/.test(d?.units ?? ''));
      const castCard = before => until(() => game.messages.find(m => !before.has(m.id) && (m.getFlag(MOD, 'tokenLight')?.key === 'Produce Flame')
        && m.getFlag(MOD, 'tokenLight')?.landed?.length && m.getFlag(MOD, 'effectReceipt')) ?? null, { timeout: 8000, label: 'the Cast\'s card with its light landed and its effect receipt' });
      const cast = async () => {
        const before = new Set(game.messages.map(m => m.id));
        target(victimToken);   // a self light: a target is ignored
        await use(castAct);
        return castCard(before);
      };

      const card1 = await cast();
      const fx = await until(() => flames()[0] ?? null, { timeout: 8000, label: '"Produce Flame" on the Aasimar' });
      const keys = (fx?.system?.changes ?? []).map(c => `${c.key}=${c.value}`);
      ok('8a. the Cast lands "Produce Flame" on the CASTER (not the target), carrying 20 ft Bright / 40 ft Dim and a torch flicker, for 10 minutes',
        !!fx && (fx.name === 'Produce Flame') && keys.includes('token.light.bright=20') && keys.includes('token.light.dim=40')
          && keys.includes('token.light.animation.type=torch') && tenMinutes(fx._source.duration)
          && !victim.effects.some(e => e.getFlag(MOD, 'tokenLight')?.key === 'Produce Flame'),
        `effect=${fx?.name} changes=[${keys.join(', ')}] duration=${JSON.stringify(fx?._source?.duration)}`);
      const lit = await until(() => (lightOf(aasDoc).bright === 20) ? lightOf(aasDoc) : null, { timeout: 5000, label: 'the token lit 20/40' });
      ok('8b. the token itself sheds it: 20 ft Bright, 40 ft Dim', !!lit && (lit.dim === 40), `light=${JSON.stringify(lightOf(aasDoc))} base=${JSON.stringify(base)}`);
      const said1 = await until(() => /Produce Flame — .+ sheds light: 20 ft Bright, 20 ft more Dim/.test(textOf(cardEl(card1?.id))) ? textOf(cardEl(card1.id)) : null,
        { timeout: 5000, label: 'the Cast\'s card says the light' }).catch(() => textOf(cardEl(card1?.id)));
      ok('8c. the Cast\'s card says it ("sheds light: 20 ft Bright, 20 ft more Dim", "Hurl Fire puts it out") and carries the effect receipt',
        !!card1 && /sheds light: 20 ft Bright, 20 ft more Dim/.test(said1 ?? '') && /Hurl Fire puts it out/.test(said1 ?? ''),
        (said1 ?? '').slice(-260));

      const card2 = await cast();
      const second = await until(() => {
        const live = flames();
        return ((live.length === 1) && (live[0].id !== fx?.id)) ? live[0] : null;
      }, { timeout: 8000, label: 'one fresh "Produce Flame" in place of the first' }).catch(() => null);
      ok('8d. cast again: the earlier flame is replaced — one "Produce Flame" stands, the token still 20/40 ("the spell ends if you cast it again")',
        !!card2 && !!second && (lightOf(aasDoc).bright === 20) && (lightOf(aasDoc).dim === 40),
        `effects=[${flames().map(e => e.id).join(', ')}] first=${fx?.id} light=${JSON.stringify(lightOf(aasDoc))}`);

      const revertBtn = await until(() => cardEl(card2?.id)?.querySelector('.bythebooks-receipt button') ?? null, { timeout: 5000, label: 'the ✕ Revert on the Cast\'s card' }).catch(() => null);
      revertBtn?.click();
      const reverted = await until(() => !flames().length && isBase(), { timeout: 8000, label: 'the flame reverted, the token\'s own light back' }).catch(() => false);
      const entry = game.messages.get(card2?.id)?.getFlag(MOD, 'effectReceipt')?.targets?.[0]?.effects?.[0];
      ok('8e. ✕ Revert on the Cast\'s card takes the flame off: no "Produce Flame", the token\'s own light back, the receipt marked',
        !!revertBtn && reverted && !!entry?.reverted,
        `button=${!!revertBtn} effects=${flames().length} light=${JSON.stringify(lightOf(aasDoc))} base=${JSON.stringify(base)} entry=${JSON.stringify(entry)}`);

      await cast();
      await until(() => (flames().length === 1) && (lightOf(aasDoc).bright === 20), { timeout: 8000, label: 'lit again for the hurl' });
      const beforeHurl = new Set(game.messages.map(m => m.id));
      target(victimToken);
      await use(hurlAct, { subsequentActions: false });
      const out = await until(() => !flames().length && isBase(), { timeout: 8000, label: 'the hurl put the light out' }).catch(() => false);
      ok('8f. Hurl Fire puts the light out: the effect is gone and the token\'s own light is back', out,
        `effects=${flames().length} light=${JSON.stringify(lightOf(aasDoc))} base=${JSON.stringify(base)}`);
      const hurlCard = await until(() => game.messages.find(m => !beforeHurl.has(m.id) && m.getFlag(MOD, 'tokenLight')?.out && m.getFlag(MOD, 'tokenLight')?.done
        && ('putOut' in (m.getFlag(MOD, 'tokenLight') ?? {}))) ?? null, { timeout: 8000, label: 'the hurl\'s card with the put-out written' }).catch(() => null);
      const said2 = await until(() => /Produce Flame — .+'s light goes out/.test(textOf(cardEl(hurlCard?.id))) ? textOf(cardEl(hurlCard.id)) : null,
        { timeout: 5000, label: 'the hurl\'s card says the light went out' }).catch(() => textOf(cardEl(hurlCard?.id)));
      ok('8g. the hurl\'s card says so: "Produce Flame — …\'s light goes out", one light put out',
        (hurlCard?.getFlag(MOD, 'tokenLight')?.putOut === 1) && /Produce Flame — .+'s light goes out/.test(said2 ?? ''),
        `flag=${JSON.stringify(hurlCard?.getFlag(MOD, 'tokenLight'))} text=${(said2 ?? '').slice(-200)}`);

      // A hurl with no flame lit, the way a player throws first: nothing lands, nothing is left.
      const beforeBare = new Set(game.messages.map(m => m.id));
      target(victimToken);
      await use(hurlAct, { subsequentActions: false });
      const bareCard = await until(() => game.messages.find(m => !beforeBare.has(m.id) && m.getFlag(MOD, 'tokenLight')?.out && m.getFlag(MOD, 'tokenLight')?.done
        && ('putOut' in (m.getFlag(MOD, 'tokenLight') ?? {}))) ?? null, { timeout: 8000, label: 'the bare hurl\'s card with its put-out written' }).catch(() => null);
      const stray = await watch(() => aas.effects.find(e => /Produce Flame/.test(e.name)) ?? (!isBase() ? lightOf(aasDoc) : null), { ms: 1500 });
      ok('8h. a hurl with no flame lit lands nothing: no "Produce Flame", the token at its own light, the card says nothing went out',
        !!bareCard && (bareCard.getFlag(MOD, 'tokenLight')?.putOut === 0) && !stray && !aas.effects.some(e => /Produce Flame/.test(e.name)) && isBase()
          && !/light goes out/.test(textOf(cardEl(bareCard.id))),
        `flag=${JSON.stringify(bareCard?.getFlag(MOD, 'tokenLight'))} stray=${stray?.name ?? JSON.stringify(stray)} light=${JSON.stringify(lightOf(aasDoc))}`);
    });

    // ---- 9. Produce Flame as a table's sheet has it
    if (want(9)) await section(9, async () => {
      await clearEffects();
      // A world copy whose Cast applies its own "Produce Flame" (the table's sheet), on a token with a light of its own.
      const copy = await lend('dnd-players-handbook.spells', 'Produce Flame');
      const [own] = await copy.createEmbeddedDocuments('ActiveEffect', [{ name: 'Produce Flame', img: 'icons/svg/aura.svg', transfer: false,
        duration: { value: 10, units: 'minutes' }, description: '<p>A flame in the hand (the world copy\'s own effect).</p>',
        system: { changes: [{ key: 'flags.btbtest.produceFlame', type: 'override', value: '1', phase: 'initial' }] } }]);
      await actNamed(copy, 'Cast').update({ effects: [{ _id: own.id }] });
      // The activities are prepared again on the update: read them after it.
      const castAct = actNamed(copy, 'Cast');
      const hurlAct = actNamed(copy, 'Hurl Fire');
      if (!castAct?.effects?.some(e => e._id === own.id)) throw new Error(`the copy's Cast does not apply its own effect: ${JSON.stringify(castAct?.effects)}`);
      const priorLight = { bright: aasDoc._source.light?.bright ?? 0, dim: aasDoc._source.light?.dim ?? 0 };
      await aasDoc.update({ light: { bright: 10, dim: 20 } });
      try {
        const named = () => aas.effects.filter(e => e.name === 'Produce Flame');
        const atOwn = () => (lightOf(aasDoc).bright === 10) && (lightOf(aasDoc).dim === 20);
        await until(atOwn, { timeout: 5000, label: 'the token at its own 10 / 20' });
        const cast = async () => {
          const before = new Set(game.messages.map(m => m.id));
          target(victimToken);
          await use(castAct);
          return until(() => game.messages.find(m => !before.has(m.id) && m.getFlag(MOD, 'tokenLight')?.landed?.length && m.getFlag(MOD, 'effectReceipt')) ?? null,
            { timeout: 8000, label: 'the copy\'s Cast card with its light landed' });
        };
        const hurl = async () => {
          const before = new Set(game.messages.map(m => m.id));
          target(victimToken);
          await use(hurlAct, { subsequentActions: false });
          return until(() => game.messages.find(m => !before.has(m.id) && m.getFlag(MOD, 'tokenLight')?.out && m.getFlag(MOD, 'tokenLight')?.done
            && ('putOut' in (m.getFlag(MOD, 'tokenLight') ?? {}))) ?? null, { timeout: 8000, label: 'the copy\'s hurl card with its put-out written' });
        };

        const card1 = await cast();
        await until(() => (lightOf(aasDoc).bright === 20) && named().length, { timeout: 8000, label: 'the copy\'s flame lit' });
        // The window a second "Produce Flame" (the cast path's copy) must NOT arrive in.
        const twin = await watch(() => (named().length > 1) ? named() : null, { ms: 1500 });
        const one = named()[0];
        const keys = (one?.system?.changes ?? []).map(c => `${c.key}=${c.value}`);
        const entries = card1?.getFlag(MOD, 'effectReceipt')?.targets?.flatMap(t => t.effects ?? []) ?? [];
        ok('9a. the Cast lands ONE "Produce Flame" — the copy\'s own effect, carrying the light (20 / 40) and its own change — and one receipt entry',
          !twin && (named().length === 1) && keys.includes('token.light.bright=20') && keys.includes('flags.btbtest.produceFlame=1')
            && (lightOf(aasDoc).dim === 40) && (entries.length === 1),
          `effects=[${named().map(e => e.id).join(', ')}] changes=[${keys.join(', ')}] receipt=${entries.length} light=${JSON.stringify(lightOf(aasDoc))}`);

        await cast();
        const replaced = await until(() => ((named().length === 1) && (named()[0].id !== one?.id)) ? named()[0] : null, { timeout: 8000, label: 'one fresh copy in place of the first' }).catch(() => null);
        const twin2 = await watch(() => (named().length > 1) ? named() : null, { ms: 1500 });
        ok('9b. cast again: one "Produce Flame" stands, the token 20 / 40', !!replaced && !twin2 && (lightOf(aasDoc).bright === 20),
          `effects=[${named().map(e => e.id).join(', ')}] first=${one?.id} light=${JSON.stringify(lightOf(aasDoc))}`);

        const card3 = game.messages.contents.filter(m => m.getFlag(MOD, 'tokenLight')?.landed?.some(l => l.effectId === replaced?.id)).at(-1);
        const revertBtn = await until(() => cardEl(card3?.id)?.querySelector('.bythebooks-receipt button') ?? null, { timeout: 5000, label: 'the ✕ Revert on the copy\'s Cast card' }).catch(() => null);
        revertBtn?.click();
        const reverted = await until(() => !named().length && atOwn(), { timeout: 8000, label: 'reverted to the token\'s own light' }).catch(() => false);
        ok('9c. ✕ Revert leaves no "Produce Flame" and the token at its own 10 / 20', !!revertBtn && reverted,
          `button=${!!revertBtn} effects=${named().length} light=${JSON.stringify(lightOf(aasDoc))}`);

        await cast();
        await until(() => (lightOf(aasDoc).bright === 20) && (named().length === 1), { timeout: 8000, label: 'lit again for the hurl' });
        const hurlCard = await hurl();
        const out = await until(() => !named().length && atOwn(), { timeout: 8000, label: 'the hurl ended the flame' }).catch(() => false);
        const said = await until(() => /keeps the light set on it: 10 ft Bright, 10 ft more Dim/.test(textOf(cardEl(hurlCard?.id))) ? textOf(cardEl(hurlCard.id)) : null,
          { timeout: 5000, label: 'the hurl\'s card names the token\'s own light' }).catch(() => textOf(cardEl(hurlCard?.id)));
        ok('9d. Cast, then Hurl Fire: no "Produce Flame" left, the token at its own 10 / 20, the hurl\'s card naming that light',
          out && (hurlCard?.getFlag(MOD, 'tokenLight')?.putOut === 1) && (hurlCard?.getFlag(MOD, 'tokenLight')?.ownLight?.bright === 10)
            && /keeps the light set on it: 10 ft Bright, 10 ft more Dim/.test(said ?? ''),
          `effects=${named().length} light=${JSON.stringify(lightOf(aasDoc))} flag=${JSON.stringify(hurlCard?.getFlag(MOD, 'tokenLight'))} text=${(said ?? '').slice(-160)}`);

        const bare = await hurl();
        const stray = await watch(() => named()[0] ?? (!atOwn() ? lightOf(aasDoc) : null), { ms: 1500 });
        ok('9e. a hurl with no Cast lands nothing: no "Produce Flame", the token at its own 10 / 20',
          (bare?.getFlag(MOD, 'tokenLight')?.putOut === 0) && !stray && !named().length && atOwn(),
          `flag=${JSON.stringify(bare?.getFlag(MOD, 'tokenLight'))} stray=${stray?.name ?? JSON.stringify(stray)} light=${JSON.stringify(lightOf(aasDoc))}`);
      } finally {
        await aasDoc.update({ light: priorLight });
        await clearEffects();
      }
    });

    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  } finally {
    await teardown();
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: 'aasimar', out, plan, f });
