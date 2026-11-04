// TWO-CLIENT SMOKE — what a single-client suite structurally cannot see (ARCHITECTURE §4 *The relay*).
//
//   §relay — the RELAYED answer: a player cannot write someone else's message, so the answer
//            travels as their OWN message carrying an envelope that the owning client folds in.
//   §pull   — a scene a player is on is LIVE (RULINGS, emanations): another user's view reaches
//            the GM only through the activity broadcast. ⚠ The PLAYER navigates: the server
//            forwards a pull only from a full Gamemaster (`Scene.#pullToScene`) and this suite
//            runs as an Assistant GM; a navigated client broadcasts the same as a pulled one.
//   §close  — `closeAnsweredHoldPopups` runs on EVERY client: the GM's BUZZER resolves a hold and
//            the PLAYER's popup must close on its own client on seeing the flag.
//   §ack    — a player's OK on the GM's reminder card reaches the card.
//   §bystander — a BYSTANDER on another client (Q2 option A): the player's Restore Balance bends the GM's
//            attack (the hold's relay, `by`) and the GM's check (bystanders.js's own relay).
//
// ⚠ THIS SUITE MUTATES (check-popup-routing.mjs is the read-only two-client check).
//
// Fixture: `BTB Test Player Shielder`, a clone of the Mage (a real Shield) OWNED BY THE PLAYER TEST USER,
// deleted on the way out. ⚠ Separate from `BTB Test Shielder`, which is GM-only for smoke-hold.
//
// Sections: `--section relay`, `--section close`, `--section ack`, `--section pull`, `--list`.
import { announcePlan, connectSuite, disposeSafely, loadEnv, report, sectionPlan }
  from './harness.mjs';
import { installPrelude } from './prelude.mjs';
import { playerConfig } from './target.mjs';
import { Foundry } from 'fvtt-mcp-dnd5e/client';

// The machines this suite drives (tools/coverage-map.mjs parses this). ⚠ NEVER import a suite:
// it connects on evaluation.
export const COVERS = [
  'hold/index.js',          // relay / close — the relayed answer, the popup closing across clients
  'hold/lookup.js',
  'hold/clock.js',
  'hold/trigger.js',
  'hold/answer.js',
  'hold/continue.js',
  'hold/views.js',
  'mastery.js',             // ack — a player's OK on the mastery notice reaches the GM's card
  'emanations.js',          // pull — a scene a player is on is live
  'bystanders.js'           // bystander — a check bent from the player's client, relayed to the roll's keeper
];

const SECTIONS = {
  relay: "the hold's RELAYED answer — the player writes its own message, the elect folds it",
  close: "the hold's popup CLOSES on the other client when the buzzer answers it",
  ack: "a PLAYER's OK on a GM-authored notice reaches the GM's card (the relayed ack)",
  bystander: "a BYSTANDER on the player's client: Restore Balance on the GM's attack (the hold's relay) and on the GM's check (bystanders.js's relay) — each answer the player's own message, folded by the GM",
  pull: "a scene the PLAYER is on is live: the Paladin's aura stands there though another scene is active and the GM is elsewhere, and comes down when the player leaves; the GM's own preview, a player connected, raises nothing"
};
// Each section stands its own attack up on the shared fixture and cleans up after itself.
const DEPENDS = {};

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const want = id => !plan || plan.includes(String(id));
const env = loadEnv();
// Two real attack loops, each hunting a plain hit, plus a 5s buzzer wait.
const gm = await connectSuite({ tag: '2client', watchdogMs: 420_000 });
announcePlan('2client', plan, pulled);

const out = { results: [], log: [], skips: [] };
const ok = (name, pass, detail = '') => out.results.push({ name, pass, detail });
const note = l => out.log.push(l);

console.log('[2client] player connecting…');
const player = new Foundry(playerConfig(env));
await player.connect();
await installPrelude(player);
const who = await player.evaluate(async () => ({ name: game.user.name, id: game.user.id }), null);
console.log(`[2client] player "${who.name}" connected`);

/* --- setup: settings, the player-owned shielder, its token -------------------------------- */

const setup = await gm.evaluate(async ({ playerId }) => {
  const MODULE = 'fvtt-mod-bythebooks';
  const { tokenOn, viewScene, snapshotSettings } = window.__btb;
  const log = [];
  const KEYS = ['reactionHold', 'holdReveal', 'holdTimer', 'holdSkipFutile', 'holdApplyEffect',
    'autoDamage', 'autoApply', 'requireTarget', 'dramaticBeat', 'riders', 'effectRiders',
    'masteryRiders', 'masteryAsk', 'saves', 'concMode', 'castApply', 'volleys', 'resourceNotices'];
  // Kept on the page for the teardown's own evaluate.
  const settings = snapshotSettings(KEYS);
  const { set } = settings;

  const scene = game.scenes.getName('By the Books Test Range');
  const attacker = game.actors.getName('BTB Test Attacker');
  const mage = game.actors.getName('BTB Test Mage');
  if (!scene || !attacker || !mage) return { fatal: 'missing fixture: scene, BTB Test Attacker or the Mage' };
  // Soft: the token wait below names a canvas that never readied.
  await viewScene(scene).catch(() => null);

  await set('reactionHold', true);
  // ⚠ holdReveal OFF: the futility skip follows it (hold/trigger.js holdWouldMatter), and with it on
  // a hold stamps only inside a 5-wide band; this suite is about where the answer travels.
  await set('holdReveal', false);
  await set('holdApplyEffect', true);
  // ⚠ 45 s: on a loaded box the round trips to two headless clients can outlast 20 s, and the
  // buzzer then resolves the hold before the player's click lands.
  await set('holdTimer', 45);
  await set('autoDamage', 'all');
  await set('autoApply', true);
  await set('requireTarget', false);
  await set('dramaticBeat', 0);
  for (const k of ['riders', 'effectRiders', 'masteryRiders', 'saves', 'castApply', 'volleys',
    'resourceNotices']) await set(k, false);
  await set('masteryAsk', 'auto');
  await set('concMode', 'off');
  // The Interrupt list is the code table (decide/registry.js INTERRUPTS); no world setting holds it.
  const { INTERRUPTS } = await import(`/modules/${MODULE}/scripts/decide/registry.js`);
  if (!INTERRUPTS.some(r => (r.name === 'Shield') && (r.kind === 'ac'))) {
    return { fatal: 'the interrupt table does not carry Shield:ac — this suite has nothing to hold' };
  }

  // The player-owned shielder: the Mage's sheet (a real Shield, real slots), the player as OWNER.
  let shielder = game.actors.getName('BTB Test Player Shielder');
  if (!shielder) {
    const data = mage.toObject();
    delete data._id;
    data.name = 'BTB Test Player Shielder';
    data.prototypeToken.actorLink = true;
    data.prototypeToken.name = 'BTB Test Player Shielder';
    shielder = await Actor.create(data);
    log.push('created BTB Test Player Shielder');
  }
  // OWNER for the player, DEFAULT NONE: canAnswerFor must route to exactly one client.
  await shielder.update({ ownership: { default: 0, [playerId]: 3 } }, { diff: false, recursive: false });
  await shielder.update({
    'system.spells.spell1.value': shielder.system.spells.spell1.max || 4,
    'system.attributes.hp.value': shielder.system.attributes.hp.max,
    'system.attributes.hp.temp': 0
  });
  // A fresh Reaction: clear the reaction chip (shared.js spendReaction).
  for (const e of shielder.effects.filter(e => e.getFlag(MODULE, 'mastery') === 'reaction')) await e.delete();
  for (const e of shielder.effects.filter(e => e.name === 'Imperceptible Barrier')) await e.delete();

  let tok = scene.tokens.find(t => t.actorId === shielder.id);
  if (!tok) {
    [tok] = await scene.createEmbeddedDocuments('Token', [foundry.utils.mergeObject(
      shielder.prototypeToken.toObject(),
      { x: 1700, y: 1000, actorId: shielder.id, actorLink: true }, { inplace: false })]);
  }
  // Soft: the fatal below names it (a throw here would end the run before the teardown).
  await tokenOn(tok.id).catch(() => null);
  if (!canvas.tokens.get(tok.id)) return { fatal: 'the shielder token never reached the canvas' };

  const weapon = attacker.items.find(i => i.system.activities?.some?.(a => a.type === 'attack'));
  if (!weapon) return { fatal: 'BTB Test Attacker has no attack activity' };

  globalThis.__bf2c = { settings, shielderId: shielder.id, tokenId: tok.id, weaponId: weapon.id,
    suiteStart: Date.now() };
  return { log, shielderUuid: shielder.uuid, shielderName: shielder.name,
    ac: shielder.system.attributes.ac.value, hasPlayerOwner: shielder.hasPlayerOwner };
}, { playerId: who.id });

if (setup.fatal) {
  console.error(`\n[2client] FATAL: ${setup.fatal}`);
  await disposeSafely(player, '2client');
  await gm.disconnect?.();
  process.exit(2);
}
for (const l of setup.log) note(l);
note(`shielder ${setup.shielderName} AC ${setup.ac}, playerOwned=${setup.hasPlayerOwner}`);

/* --- the shared move: one plain hit on the shielder, and the hold it stamps ---------------- */

/** Attack until a plain (non-crit, non-fumble) hit stamps a pending hold. Returns its ids. */
const holdOnShielder = () => gm.evaluate(async () => {
  const MODULE = 'fvtt-mod-bythebooks';
  const { until } = window.__btb;
  const st = globalThis.__bf2c;
  const attacker = game.actors.getName('BTB Test Attacker');
  const shielder = game.actors.get(st.shielderId);
  const token = canvas.tokens.get(st.tokenId);
  const activity = () => attacker.items.get(st.weaponId).system.activities.find(a => a.type === 'attack');
  const tried = [];
  // A retry loop: each try swings again at once; nothing the next swing reads is left pending by the last.
  for (let i = 0; i < 25; i++) {
    token.setTarget(true, { releaseOthers: true });
    const usage = await activity().use({ subsequentActions: false }, { configure: false }, {});
    const rolls = await activity().rollAttack({ advantage: true }, { configure: false },
      { data: { 'system.origin': usage?.message?.id } });
    const roll = rolls?.[0];
    const msg = roll?.parent;
    const ac = shielder.system.attributes.ac.value;
    if (roll && !roll.isCritical && !roll.isFumble && (roll.total >= ac)) {
      // The stamp is written by the attacker's own client. Soft: a hit that stamps none is a try, logged.
      const hold = await until(() => { const h = game.messages.get(msg.id)?.getFlag(MODULE, 'hold'); return (h?.status === 'pending') ? h : null; },
        { timeout: 6000, label: 'the hit stamps a pending hold' }).catch(() => null);
      if (hold) {
        return { attackId: msg.id, usageId: usage?.message?.id, total: roll.total, ac,
          reaction: hold.targets?.[0]?.reaction ?? null, tried };
      }
      tried.push(`hit ${roll.total} vs AC ${ac} stamped NO hold`);
      continue;
    }
    tried.push(`total=${roll?.total} crit=${roll?.isCritical} fumble=${roll?.isFumble} ac=${ac}`);
  }
  return { fatal: `no plain hit stamped a hold in 25 attempts: ${tried.slice(-6).join(' | ')}` };
}, null);

/** The player's view of a hold popup for a given attack, by its DialogV2 window title. */
const playerPopup = attackId => player.evaluate(async ({ id }) => {
  const dialogs = [...foundry.applications.instances.values()]
    .filter(a => (a instanceof foundry.applications.api.DialogV2) && a.rendered);
  const titles = dialogs.map(a => a.options?.window?.title ?? null);
  const dom = [...document.querySelectorAll('.application.dialog, dialog.application')]
    .map(d => d.querySelector('.window-title')?.textContent?.trim() ?? d.id);
  return {
    user: game.user.name,
    titles, dom,
    sawHold: !!game.messages.get(id)?.getFlag('fvtt-mod-bythebooks', 'hold'),
    holdStatus: game.messages.get(id)?.getFlag('fvtt-mod-bythebooks', 'hold')?.status ?? null
  };
}, { id: attackId });

/* --- §relay -------------------------------------------------------------------------------- */

if (want('relay')) {
  const hold = await holdOnShielder();
  if (hold.fatal) {
    ok('relay. an attack on the player-owned shielder stamps a hold', false, hold.fatal);
  } else {
    note(`relay: attack ${hold.attackId} total ${hold.total} vs AC ${hold.ac}, holding ${hold.reaction}`);
    const before = await player.evaluate(async ({ id }) => {
      const { until } = window.__btb;
      // Soft: no popup is relay/1's failure, and the diagnostics below are its detail.
      const dlg = await until(() => [...foundry.applications.instances.values()]
        .find(a => (a instanceof foundry.applications.api.DialogV2) && a.rendered
          && /Shield/i.test(a.options?.window?.title ?? '')), { timeout: 8000, label: "the Shield popup on the player's client" }).catch(() => null);
      if (dlg) {
        // The relay is exercised only when the player CANNOT write the attack message.
        const m = game.messages.get(id);
        return { found: true, title: dlg.options?.window?.title ?? null, attackIsOwner: m?.isOwner ?? null,
          attackAuthor: m?.author?.name ?? null, speaker: m?.speaker?.alias ?? null };
      }
      const seen = game.messages.get(id)?.getFlag('fvtt-mod-bythebooks', 'hold');
      return { found: false, holdSeen: !!seen, status: seen?.status ?? null };
    }, { id: hold.attackId });

    ok('relay/1. the popup opened on the PLAYER client — it owns the reacting actor',
      before.found === true, JSON.stringify(before));

    // Pass, not Cast: the relay is the same, and Pass leaves no effect to clean up.
    const answered = await player.evaluate(async () => {
      const { until } = window.__btb;
      const before = new Set(game.messages.contents.map(m => m.id));
      const dlg = [...foundry.applications.instances.values()]
        .find(a => (a instanceof foundry.applications.api.DialogV2) && a.rendered
          && /Shield/i.test(a.options?.window?.title ?? ''));
      if (!dlg) return { clicked: false };
      // ⚠ CAUGHT AT CREATION by hook: the envelope DELETES ITSELF once folded, which can all happen
      // inside one poll.
      let caught = null;
      const hook = Hooks.on('createChatMessage', m => {
        if (!caught && !before.has(m.id) && (m.author?.id === game.user.id)) caught = m;
      });
      const buttons = [...dlg.element.querySelectorAll('button')].map(x => `${x.dataset.action ?? '?'}:${x.textContent.trim()}${x.disabled ? '(disabled)' : ''}`);
      // The hold at the click: an answer on a resolved hold is dropped (first answer wins).
      const holdSnap = () => { const m = [...game.messages.contents].reverse().find(x => x.getFlag('fvtt-mod-bythebooks', 'hold')); const h = m?.getFlag('fvtt-mod-bythebooks', 'hold'); return { status: h?.status ?? null, answers: (h?.targets ?? []).map(t => `${t.answer ?? '-'}${t.timedOut ? ' (timed out)' : ''}`) }; };
      const holdBefore = holdSnap();
      const passBtn = dlg.element.querySelector('button[data-action="pass"]');
      passBtn?.click();
      // Wait for the player's OWN message: that is the relay. Soft: none is relay/2's failure, with the click's detail.
      const mine = await until(() => caught ?? game.messages.contents.find(m => !before.has(m.id)
        && (m.author?.id === game.user.id)), { timeout: 8000, label: "the player's own answer message" }).catch(() => null);
      Hooks.off('createChatMessage', hook);
      if (mine) {
        return { clicked: true, msgId: mine.id, author: mine.author?.name ?? null,
          respondsTo: mine.getFlag('fvtt-mod-bythebooks', 'respondsTo') ?? null,
          answer: mine.getFlag('fvtt-mod-bythebooks', 'answer') ?? null,
          uuid: mine.getFlag('fvtt-mod-bythebooks', 'uuid') ?? null,
          flags: Object.keys(mine.flags?.['fvtt-mod-bythebooks'] ?? {}) };
      }
      return { clicked: !!passBtn, msgId: null, buttons, holdAtClick: holdBefore };
    }, null);

    ok('relay/2. the answer travelled as the PLAYER\'S OWN message, stamped respondsTo',
      !!answered.msgId && (answered.respondsTo === hold.attackId),
      JSON.stringify(answered));
    ok('relay/3. and it was authored by the player, not the GM — the whole point of the relay',
      answered.author === who.name, `author=${answered.author} want=${who.name}`);

    // The GM is the CONTINUING CLIENT (its own attack), so the fold happens there.
    const folded = await gm.evaluate(async ({ id }) => {
      const MODULE = 'fvtt-mod-bythebooks';
      const { until } = window.__btb;
      const holdNow = () => game.messages.get(id)?.getFlag(MODULE, 'hold');
      // The answer lands before the verdict: wait for the resolution, falling back to
      // answered-but-pending at the deadline (soft: relay/4 and relay/5 read which).
      await until(() => (holdNow()?.targets?.[0]?.answer && (holdNow().status === 'resolved')),
        { timeout: 15_000, label: 'the folded answer resolves the hold' }).catch(() => null);
      const h = holdNow();
      if (h?.targets?.[0]?.answer) {
        return { answer: h.targets[0].answer, status: h.status,
          verdict: h.targets[0].verdict ?? null, timedOut: !!h.targets[0].timedOut };
      }
      return { answer: null, status: h?.status ?? null };
    }, { id: hold.attackId });

    ok('relay/4. the CONTINUING CLIENT folded the envelope into its own hold flag',
      folded.answer === 'pass', JSON.stringify(folded));
    ok('relay/5. and the fold ran the hold to a verdict — the chain continued on this side',
      (folded.status === 'resolved') && !!folded.verdict, JSON.stringify(folded));

    // The answered popup is gone on the answerer's own client too (the local path).
    const after = await playerPopup(hold.attackId);
    ok('relay/6. the answerer\'s own popup closed behind the answer',
      !after.titles.some(t => /Shield/i.test(t ?? '')), JSON.stringify(after.titles));
  }
} else {
  out.skips.push(`§relay ${SECTIONS.relay}`);
}

/* --- §close -------------------------------------------------------------------------------- */

if (want('close')) {
  // A short buzzer, so the GM's timer answers the hold while the player is still looking at it.
  await gm.evaluate(async () => game.settings.set('fvtt-mod-bythebooks', 'holdTimer', 5), null);
  const hold = await holdOnShielder();
  if (hold.fatal) {
    ok('close. an attack on the player-owned shielder stamps a hold', false, hold.fatal);
  } else {
    note(`close: attack ${hold.attackId} total ${hold.total} vs AC ${hold.ac}`);
    const open = await player.evaluate(async () => {
      const { until } = window.__btb;
      // Soft: no popup is close/1's failure.
      const dlg = await until(() => [...foundry.applications.instances.values()]
        .find(a => (a instanceof foundry.applications.api.DialogV2) && a.rendered
          && /Shield/i.test(a.options?.window?.title ?? '')), { timeout: 8000, label: "the Shield popup on the player's client" }).catch(() => null);
      return dlg ? { found: true, title: dlg.options?.window?.title ?? null } : { found: false };
    }, null);
    ok('close/1. the popup is open on the PLAYER client, unanswered',
      open.found === true, JSON.stringify(open));

    // ⚠ NOBODY TOUCHES THE PLAYER'S DOM: the buzzer fires on the continuing client (the GM's) and
    // the player's own client closes its popup on seeing the update.
    const buzzed = await gm.evaluate(async ({ id }) => {
      const MODULE = 'fvtt-mod-bythebooks';
      const { until } = window.__btb;
      // The buzzer's own clock runs out inside this wait. Soft: a hold still pending is close/2's failure.
      const h = await until(() => { const now = game.messages.get(id)?.getFlag(MODULE, 'hold'); return (now && (now.status !== 'pending')) ? now : null; },
        { timeout: 15_000, label: "the GM's buzzer answers the hold" }).catch(() => null);
      if (h) {
        return { status: h.status, answer: h.targets?.[0]?.answer ?? null,
          timedOut: h.targets?.[0]?.timedOut ?? null };
      }
      return { status: game.messages.get(id)?.getFlag(MODULE, 'hold')?.status ?? null };
    }, { id: hold.attackId });
    ok('close/2. the GM\'s buzzer answered the hold without the player touching it',
      (buzzed.status === 'resolved') && (buzzed.answer === 'pass'), JSON.stringify(buzzed));

    const closed = await player.evaluate(async () => {
      const { until } = window.__btb;
      const t0 = Date.now();
      // The other client's resolution reaching this one. Soft: a popup still open is close/3's failure.
      const gone = await until(() => ![...foundry.applications.instances.values()]
        .some(a => (a instanceof foundry.applications.api.DialogV2) && a.rendered
          && /Shield/i.test(a.options?.window?.title ?? '')), { timeout: 8000, label: "the player's popup closes" }).catch(() => false);
      return gone ? { open: false, at: Date.now() - t0 } : { open: true };
    }, null);
    ok('close/3. THE PLAYER\'S POPUP CLOSED — the other client\'s resolution reached it (D2)',
      closed.open === false, JSON.stringify(closed));
  }
} else {
  out.skips.push(`§close ${SECTIONS.close}`);
}

/* --- §ack: the player's OK reaches the GM's card ------------------------------------------
 * The reminder card belongs to the elect (the GM) while the acknowledger is a player, so the OK
 * must relay; a solo suite only ever runs the direct write. */
if (want('ack')) {
  // A GM-authored notice card, as postMasteryNotice writes it, naming the PLAYER'S actor.
  const card = await gm.evaluate(async () => {
    const MODULE = 'fvtt-mod-bythebooks';
    const st = globalThis.__bf2c;
    const msg = await ChatMessage.create({
      content: '<p>ack relay fixture</p>',
      flags: { [MODULE]: { masteryNotice: {
        key: 'sap', attackerUuid: game.actors.get(st.shielderId)?.uuid ?? null,
        weapon: { id: null, name: 'Fixture Blade', img: null },
        title: 'Sap', subtitle: 'ack relay fixture', lines: [],
        window: 24, deadline: Date.now() + 24_000
      } } }
    });
    return { id: msg.id, ackedAtBirth: msg.getFlag(MODULE, 'masteryNotice')?.acknowledged ?? false };
  }, null);
  ok('ack/1. the GM-authored notice card starts unacknowledged',
    card.ackedAtBirth === false, JSON.stringify(card));

  // Not the author and not a GM, so the direct write is unavailable: the relay path.
  const relayed = await player.evaluate(async cardId => {
    const MODULE = 'fvtt-mod-bythebooks';
    const { until } = window.__btb;
    // ⚠ WAIT FOR THE CARD TO REPLICATE: the GM just created it. Soft: the error below names it.
    const msg = await until(() => game.messages.get(cardId), { timeout: 10_000, label: 'the card on the player client' }).catch(() => null);
    if (!msg) return { error: 'the card never reached the player client' };
    const isOwner = msg.isOwner;
    await game.modules.get(MODULE)?.api?.acknowledgeMoment?.(msg, 'masteryNotice');
    return { isOwner, called: !!game.modules.get(MODULE)?.api?.acknowledgeMoment };
  }, card.id);
  ok('ack/2. the player genuinely cannot write the card (the condition under test)',
    relayed.isOwner === false, JSON.stringify(relayed));

  const landed = await gm.evaluate(async cardId => {
    const MODULE = 'fvtt-mod-bythebooks';
    const { until } = window.__btb;
    const envelopes = () => game.messages.contents.filter(x => x.getFlag(MODULE, 'momentAck')).length;
    const t0 = Date.now();
    // The player's relayed OK reaching the card. Soft: an unacknowledged card is ack/3's failure.
    const acked = await until(() => game.messages.get(cardId)?.getFlag(MODULE, 'masteryNotice')?.acknowledged === true,
      { timeout: 10_000, label: "the player's OK on the GM's card" }).catch(() => false);
    if (acked) {
      const at = Date.now() - t0;
      // ⚠ The envelope's delete is chained AFTER the flag write: wait for it as its own event (soft: ack/4 counts what is left).
      await until(() => envelopes() === 0, { timeout: 5000, label: 'the relay envelope deletes itself' }).catch(() => null);
      return { acked: true, at, envelopes: envelopes() };
    }
    return { acked: false, envelopes: envelopes() };
  }, card.id);
  ok('ack/3. THE PLAYER\'S OK REACHED THE GM\'S CARD — the bar stops, no timeout',
    landed.acked === true, JSON.stringify(landed));
  // ⚠ Conjoined with `acked`: zero envelopes is also what "nothing was ever posted" looks like.
  ok('ack/4. the relay envelope deleted itself — a wire signal, not a line in the log',
    (landed.acked === true) && (landed.envelopes === 0), JSON.stringify(landed));
} else {
  out.skips.push(`§ack ${SECTIONS.ack}`);
}

/* --- §bystander: the player's Restore Balance on the GM's rolls -------------------------------- */

if (want('bystander')) {
  const setupB = await gm.evaluate(async () => {
    const { tokenOn } = window.__btb;
    const st = globalThis.__bf2c;
    const scene = game.scenes.getName('By the Books Test Range');
    const attacker = game.actors.getName('BTB Test Attacker');
    const shielder = game.actors.get(st.shielderId);
    let src = null;
    for (const pack of game.packs.filter(p => (p.metadata.packageName === 'dnd-players-handbook') && (p.documentName === 'Item'))) {
      const hit = (await pack.getIndex({ fields: ['type'] })).find(e => (e.name === 'Restore Balance') && (e.type === 'feat'));
      if (hit) { src = await pack.getDocument(hit._id); break; }
    }
    if (!src) return { fatal: 'the PHB ships no Restore Balance this box can find' };
    const [rb] = await shielder.createEmbeddedDocuments('Item', [src.toObject()]);
    await rb.update({ 'system.uses.max': '3', 'system.uses.spent': 0 });
    const tok = scene.tokens.get(st.tokenId);
    st.bystander = { shielderDisposition: tok.disposition };
    await tok.update({ disposition: 1 });
    let atk = scene.tokens.find(x => x.actorId === attacker.id);
    if (!atk) {
      [atk] = await scene.createEmbeddedDocuments('Token', [foundry.utils.mergeObject(attacker.prototypeToken.toObject(),
        { x: 1600, y: 1000, actorId: attacker.id, actorLink: true, disposition: -1 }, { inplace: false })]);
      st.bystander.attackerTokenId = atk.id;
    }
    // Soft: the check below falls back to the actor when the token is not on the canvas.
    await tokenOn(atk.id).catch(() => null);
    st.bystander.rollerTokenId = atk.id;   // ⚠ an unlinked token's actor is its own: the check rolls from the TOKEN
    return { ok: true, ac: shielder.system.attributes.ac.value };
  }, null);
  if (setupB.fatal) ok('bystander/0. fixtures', false, setupB.fatal);
  else {
    // The GM's attack with Advantage, the FIRST die a miss and the second a hit (the PRNG pinned on the GM).
    const atk = await gm.evaluate(async () => {
      const MOD = 'fvtt-mod-bythebooks';
      const { until, faces, unrig } = window.__btb;
      const st = globalThis.__bf2c;
      const attacker = game.actors.getName('BTB Test Attacker');
      const token = canvas.tokens.get(st.tokenId);
      const act = attacker.items.get(st.weaponId).system.activities.find(a => a.type === 'attack');
      faces([[2, 20], [19, 20], [3, 20], [3, 20]]);
      try {
        token.setTarget(true, { releaseOthers: true });
        const usage = await act.use({ subsequentActions: false }, { configure: false }, {});
        const rolls = await act.rollAttack({ advantage: true }, { configure: false }, { data: { 'system.origin': usage?.message?.id } });
        const msg = rolls?.[0]?.parent;
        // Soft: no hold is bystander/1's failure, read from the guards below.
        const hold = await until(() => game.messages.get(msg?.id)?.getFlag(MOD, 'hold'), { timeout: 6000, label: 'the attack stamps its hold' }).catch(() => null);
        return { id: msg?.id, total: rolls?.[0]?.total, guards: (hold?.targets?.[0]?.guards ?? []).map(g => `${g.row}:${g.quiet ? 'quiet' : 'asked'}`) };
      } finally { unrig(); }
    }, null);
    ok('bystander/1. the GM\'s Advantage hit (2 and 19) holds for the player\'s Restore Balance', (atk.guards ?? []).includes('Restore Balance:asked'), JSON.stringify(atk));
    const answered = await player.evaluate(async ({ id }) => {
      const { until } = window.__btb;
      // Soft: no popup is bystander/2's failure (found: false).
      const dlg = await until(() => [...foundry.applications.instances.values()].find(a => (a instanceof foundry.applications.api.DialogV2) && a.rendered
        && /Restore Balance/i.test(a.options?.window?.title ?? '')), { timeout: 8000, label: "the Restore Balance popup on the player's client" }).catch(() => null);
      if (!dlg) return { found: false };
      const before = new Set(game.messages.contents.map(m => m.id));
      let caught = null;
      const hook = Hooks.on('createChatMessage', m => { if (!caught && !before.has(m.id) && (m.author?.id === game.user.id) && m.getFlag('fvtt-mod-bythebooks', 'respondsTo')) caught = m; });
      // The popup is radios with one Apply (the pass is ticked by default): tick the rescue's own row, then Apply.
      const row = [...dlg.element.querySelectorAll('[data-bf-ticks] input')].find(i => !i.disabled && !/^(pass|mute-)/.test(i.value)) ?? null;
      if (row) { row.checked = true; row.dispatchEvent(new Event('change', { bubbles: true })); }
      dlg.element.querySelector('button[data-action="answer"]')?.click();
      // The answer travelling as the player's own message, caught at its creation. Soft: none is bystander/2's failure (msg: null).
      await until(() => caught, { timeout: 8000, label: "the player's own answer message" }).catch(() => null);
      Hooks.off('createChatMessage', hook);
      return { found: true, title: dlg.options?.window?.title, isOwner: game.messages.get(id)?.isOwner ?? null,
        msg: caught ? { respondsTo: caught.getFlag('fvtt-mod-bythebooks', 'respondsTo'), by: caught.getFlag('fvtt-mod-bythebooks', 'by') ?? null,
          rescue: caught.getFlag('fvtt-mod-bythebooks', 'rescue') ?? null } : null };
    }, { id: atk.id });
    ok('bystander/2. the popup opened on the PLAYER\'s client and its answer travelled as the player\'s own message (respondsTo, by)',
      answered.found && (answered.isOwner === false) && (answered.msg?.respondsTo === atk.id) && !!answered.msg?.by && (answered.msg?.rescue === 'Restore Balance'),
      JSON.stringify(answered));
    const folded = await gm.evaluate(async ({ id }) => {
      const { until } = window.__btb;
      // The player's envelope folded on the GM's client. Soft: a hold still open is bystander/3's failure.
      const h = await until(() => { const now = game.messages.get(id)?.getFlag('fvtt-mod-bythebooks', 'hold'); return (now?.status === 'resolved') ? now : null; },
        { timeout: 15_000, label: 'the GM folds the answer and resolves the hold' }).catch(() => null);
      if (h) { const t = h.targets[0]; return { verdict: t.verdict, answer: t.answer, rescue: t.rescue, by: t.guardedBy?.name ?? null, stood: t.bent?.stood ?? null }; }
      return { status: game.messages.get(id)?.getFlag('fvtt-mod-bythebooks', 'hold')?.status ?? null };
    }, { id: atk.id });
    ok('bystander/3. the GM folded it: the first d20 (2) stands — a MISS, answered by the player\'s creature',
      (folded.verdict === 'miss') && (folded.rescue === 'Restore Balance') && (folded.stood === 2), JSON.stringify(folded));

    // The GM's CHECK with Advantage (3 then 18): bystanders.js's relay.
    const chk = await gm.evaluate(async () => {
      const MOD = 'fvtt-mod-bythebooks';
      const { until, faces, unrig } = window.__btb;
      const attacker = game.actors.getName('BTB Test Attacker');
      faces([[3, 20], [18, 20]]);
      try {
        const roller = canvas.tokens.get(globalThis.__bf2c.bystander.rollerTokenId)?.actor ?? attacker;
        const rolls = await roller.rollSkill({ skill: 'ath', advantage: true }, { configure: false }, {});
        const msg = rolls?.[0]?.parent;
        // Soft: no offer is bystander/4's failure, with the reader's view below as its detail.
        const f = await until(() => game.messages.get(msg?.id)?.getFlag(MOD, 'bystanderRoll'), { timeout: 6000, label: 'the check stamps its bystander offer' }).catch(() => null);
        // Diagnostics for a miss: what the reader sees.
        const L = await import(`/modules/${MOD}/scripts/lookup.js`);
        const G = await import(`/modules/${MOD}/scripts/geometry.js`);
        const shielder = game.actors.get(globalThis.__bf2c.shielderId);
        const aTok = G.tokenOf(roller.uuid), sTok = G.tokenOf(shielder.uuid);
        const rbItem = shielder.items.find(x => x.name === 'Restore Balance');
        const diag = { rows: L.bystanderRows('check'), aTok: aTok ? [aTok.document.x, aTok.document.y, aTok.document.disposition] : null,
          sTok: sTok ? [sTok.document.x, sTok.document.y, sTok.document.disposition] : null, feet: (aTok && sTok) ? G.nearestFeet(sTok, aTok) : null,
          rb: rbItem ? `${rbItem.system.uses?.value}/${rbItem.system.uses?.max}` : null, isAuthor: msg?.isAuthor ?? null,
          mode: L.d20FactsOf(rolls?.[0]), hp: shielder.system.attributes.hp.value };
        return { id: msg?.id, status: f?.status ?? null, guards: (f?.guards ?? []).map(g => g.row), diag };
      } finally { unrig(); }
    }, null);
    ok('bystander/4. the GM\'s Advantage check stamps the offer for the player\'s Restore Balance', (chk.status === 'pending') && chk.guards.includes('Restore Balance'), JSON.stringify(chk));
    const answered2 = await player.evaluate(async () => {
      const { until } = window.__btb;
      // Soft: no popup is bystander/5's failure (found: false).
      const dlg = await until(() => [...foundry.applications.instances.values()].find(a => (a instanceof foundry.applications.api.DialogV2) && a.rendered
        && /Restore Balance/i.test(a.options?.window?.title ?? '') && /check/i.test(a.options?.window?.title ?? '')),
      { timeout: 8000, label: "the Restore Balance check popup on the player's client" }).catch(() => null);
      if (!dlg) return { found: false };
      const before = new Set(game.messages.contents.map(m => m.id));
      let caught = null;
      const hook = Hooks.on('createChatMessage', m => { if (!caught && !before.has(m.id) && m.getFlag('fvtt-mod-bythebooks', 'bystanderRollAnswer')) caught = m; });
      // The popup is radios with one Apply (the pass is ticked by default): tick the rescue's own row, then Apply.
      const row = [...dlg.element.querySelectorAll('[data-bf-ticks] input')].find(i => !i.disabled && !/^(pass|mute-)/.test(i.value)) ?? null;
      if (row) { row.checked = true; row.dispatchEvent(new Event('change', { bubbles: true })); }
      dlg.element.querySelector('button[data-action="answer"]')?.click();
      // The answer travelling as the player's own envelope, caught at its creation. Soft: none is bystander/5's failure (envelope: null).
      await until(() => caught, { timeout: 8000, label: "the player's own answer envelope" }).catch(() => null);
      Hooks.off('createChatMessage', hook);
      return { found: true, envelope: caught?.getFlag('fvtt-mod-bythebooks', 'bystanderRollAnswer') ?? null, author: caught?.author?.name ?? null };
    }, null);
    ok('bystander/5. the check\'s answer travelled as the player\'s own message (a bystanderRollAnswer envelope)',
      answered2.found && (answered2.envelope?.answer === 'roll') && (answered2.author === who.name), JSON.stringify(answered2));
    const folded2 = await gm.evaluate(async ({ id }) => {
      const { until } = window.__btb;
      // The player's envelope folded by the roll's keeper. Soft: an offer still open is bystander/6's failure.
      const f = await until(() => { const now = game.messages.get(id)?.getFlag('fvtt-mod-bythebooks', 'bystanderRoll'); return (now?.status === 'resolved') ? now : null; },
        { timeout: 15_000, label: 'the GM folds the answer and resolves the offer' }).catch(() => null);
      if (f) return { answer: f.answer, rescue: f.rescue, stood: f.bent?.stood ?? null, total: f.bent?.total ?? null };
      return { status: game.messages.get(id)?.getFlag('fvtt-mod-bythebooks', 'bystanderRoll')?.status ?? null };
    }, { id: chk.id });
    ok('bystander/6. the GM folded it: the first d20 (3) stands on the check', (folded2.answer === 'roll') && (folded2.stood === 3), JSON.stringify(folded2));
  }
  await gm.evaluate(async () => {
    const st = globalThis.__bf2c;
    const scene = game.scenes.getName('By the Books Test Range');
    if (st.bystander?.attackerTokenId && scene.tokens.get(st.bystander.attackerTokenId)) await scene.deleteEmbeddedDocuments('Token', [st.bystander.attackerTokenId]);
    const tok = scene.tokens.get(st.tokenId);
    if (tok && (st.bystander?.shielderDisposition !== undefined)) await tok.update({ disposition: st.bystander.shielderDisposition });
  }, null);
} else {
  out.skips.push(`§bystander ${SECTIONS.bystander}`);
}

/* --- §pull: the scene a player was pulled to ------------------------------------------------ */

if (want('pull')) {
  // The GM activates ANOTHER scene and stands the Ranger in the Paladin's ring on the range; only
  // the PLAYER goes back to the range, so the player's view is the only thing making it live.
  const setupPull = await gm.evaluate(async () => {
    const MOD = 'fvtt-mod-bythebooks';
    const { until } = window.__btb;
    const scene = game.scenes.getName('By the Books Test Range');
    const paladin = game.actors.getName('BTB Test Paladin');
    const ranger = game.actors.getName('BTB Test Ranger');
    const palTok = scene?.tokens.find(t => t.actorId === paladin?.id);
    const rgrTok = scene?.tokens.find(t => t.actorId === ranger?.id);
    if (!palTok || !rgrTok) return { fatal: 'missing fixture: BTB Test Paladin or BTB Test Ranger on the range — run tools/fixture-suite.mjs' };
    if (!game.settings.get(MOD, 'emanations')) return { fatal: 'Emanations are off — the shipped default has them on (scripts/settings.js)' };
    const st = globalThis.__bf2c;
    st.pull = { priorActive: game.scenes.active?.id ?? null, rangerId: rgrTok.id, rangerHome: { x: rgrTok.x, y: rgrTok.y } };
    const elsewhere = await Scene.create({ name: 'BTB Test Elsewhere (2client)', width: 2000, height: 2000, grid: { size: 100, distance: 5 } });
    st.pull.elsewhereId = elsewhere.id;
    await elsewhere.activate();
    const grid = scene.grid.size;
    await rgrTok.update({ x: palTok.x, y: palTok.y - (2 * grid) }, { teleport: true, animate: false });
    const rings = () => scene.regions.filter(r => r.getFlag(MOD, 'emanation')?.kind === 'feature' && r.getFlag(MOD, 'emanation')?.tokenId === palTok.id).length;
    const fx = () => ranger.effects.filter(e => e.getFlag(MOD, 'emanation')).length;
    // The range's rings come down once nobody is on it. Soft: a ring left standing is pull/1's failure.
    await until(() => (rings() === 0) && (fx() === 0), { timeout: 15_000, label: 'the range empty of rings and auras' }).catch(() => null);
    return { rings: rings(), fx: fx(), active: game.scenes.active?.name, gmViews: game.scenes.get(game.user.viewedScene)?.name ?? null };
  }, null);
  if (setupPull.fatal) {
    ok('pull/0. fixtures', false, setupPull.fatal);
  } else {
    ok('pull/1. another scene active and nobody on the range: no ring stands there and the Ranger inside wears nothing',
      (setupPull.rings === 0) && (setupPull.fx === 0), JSON.stringify(setupPull));
    // The GM's preview with a player at the table: the range is NOT live (a GM's view counts only
    // while no player is at the table: one viewing a scene or playing a character).
    const preview = await gm.evaluate(async () => {
      const MOD = 'fvtt-mod-bythebooks';
      const { until, watch } = window.__btb;
      const scene = game.scenes.getName('By the Books Test Range');
      const ranger = game.actors.getName('BTB Test Ranger');
      const elsewhere = game.scenes.get(globalThis.__bf2c.pull.elsewhereId);
      const rings = () => scene.regions.filter(r => r.getFlag(MOD, 'emanation')?.kind === 'feature').length;
      const fx = () => ranger.effects.filter(e => e.getFlag(MOD, 'emanation')).length;
      // ⚠ Scene#view REFUSES while the canvas is loading (a warning, no throw): wait the load out and
      // confirm the view took. Soft: a view that never takes is pull/1b's failure (gmViews).
      await until(() => !canvas.loading, { timeout: 10_000, label: 'the canvas done loading' }).catch(() => null);
      // A retry loop: the view asked again until it takes.
      for (let i = 0; (i < 3) && (game.user.viewedScene !== scene.id); i++) {
        await scene.view();
        await until(() => (game.user.viewedScene === scene.id) && !canvas.loading, { timeout: 10_000, label: 'the GM views the range' }).catch(() => null);
      }
      // ⚠ A window: a ring or an aura the GM's view must not raise rises within it.
      const stray = await watch(() => (rings() > 0) || (fx() > 0), { ms: 3000 });
      const out = { gmViews: game.scenes.get(game.user.viewedScene)?.name ?? null,
        rings: rings(), fx: fx(), stray,
        players: game.users.filter(u => u.active && !u.isGM && (u.viewedScene || u.character)).map(u => u.name) };
      // Back to the other scene before the player's view. Soft: pull/2 reads where the GM stands (gmViews).
      await until(() => !canvas.loading, { timeout: 10_000, label: 'the canvas done loading' }).catch(() => null);
      await elsewhere.view();
      await until(() => game.user.viewedScene === elsewhere.id, { timeout: 10_000, label: 'the GM views the other scene' }).catch(() => null);
      return out;
    }, null);
    ok('pull/1b. the GM previews the range while a player is at the table: no ring rises and the Ranger inside wears nothing (a GM\'s view counts only when no player is on)',
      (preview.gmViews === 'By the Books Test Range') && !preview.stray && (preview.rings === 0) && (preview.fx === 0) && (preview.players.length > 0), JSON.stringify(preview));
    const navBefore = await gm.evaluate(async () => globalThis.__bfHookLedger?.renderSceneNavigation ?? 0, null);
    await player.evaluate(async () => { await game.scenes.getName('By the Books Test Range')?.view(); }, null);
    const pulled = await gm.evaluate(async ({ playerId, navBefore }) => {
      const MOD = 'fvtt-mod-bythebooks';
      const { until } = window.__btb;
      const scene = game.scenes.getName('By the Books Test Range');
      const ranger = game.actors.getName('BTB Test Ranger');
      const palTok = scene.tokens.find(t => t.actorId === game.actors.getName('BTB Test Paladin')?.id);
      const rings = () => scene.regions.filter(r => r.getFlag(MOD, 'emanation')?.kind === 'feature' && r.getFlag(MOD, 'emanation')?.tokenId === palTok.id).length;
      const fx = () => ranger.effects.filter(e => e.getFlag(MOD, 'emanation')).length;
      const t0 = Date.now();
      // The player's view reaching the GM through the activity broadcast raises the rings. Soft: pull/2 counts them.
      await until(() => (rings() === 3) && (fx() === 3), { timeout: 20_000, label: "the Paladin's three rings and the Ranger's three auras" }).catch(() => null);
      return { rings: rings(), fx: fx(), ms: Date.now() - t0, playerViews: game.scenes.get(game.users.get(playerId)?.viewedScene)?.name ?? null,
        gmViews: game.scenes.get(game.user.viewedScene)?.name ?? null, active: game.scenes.active?.name,
        navFired: (globalThis.__bfHookLedger?.renderSceneNavigation ?? 0) - navBefore };
    }, { playerId: who.id, navBefore });
    ok('pull/2. THE PLAYER ON THE RANGE: the Paladin\'s three rings stand there and the Ranger inside wears the three auras — no activation, the GM elsewhere',
      (pulled.rings === 3) && (pulled.fx === 3) && (pulled.playerViews === 'By the Books Test Range') && (pulled.gmViews !== 'By the Books Test Range'), JSON.stringify(pulled));
    // Conjoined with the player's view having ARRIVED: a navigation render happens for other reasons.
    ok('pull/3. the GM heard the player\'s view through renderSceneNavigation (the only public signal a remote view raises)',
      (pulled.playerViews === 'By the Books Test Range') && (pulled.navFired > 0), JSON.stringify(pulled));
    await player.evaluate(async () => { await game.scenes.active?.view(); }, null);
    const left = await gm.evaluate(async playerId => {
      const MOD = 'fvtt-mod-bythebooks';
      const { until } = window.__btb;
      const scene = game.scenes.getName('By the Books Test Range');
      const ranger = game.actors.getName('BTB Test Ranger');
      const rings = () => scene.regions.filter(r => r.getFlag(MOD, 'emanation')?.kind === 'feature').length;
      const fx = () => ranger.effects.filter(e => e.getFlag(MOD, 'emanation')).length;
      const t0 = Date.now();
      // The player's leaving reaching the GM brings the rings down. Soft: pull/4 counts what is left.
      await until(() => (rings() === 0) && (fx() === 0), { timeout: 20_000, label: 'the range empty of rings and auras' }).catch(() => null);
      return { rings: rings(), fx: fx(), ms: Date.now() - t0, playerViews: game.scenes.get(game.users.get(playerId)?.viewedScene)?.name ?? null };
    }, who.id);
    ok('pull/4. the player back on the active scene: nobody is on the range, its rings come down and the Ranger\'s three are lifted',
      (left.rings === 0) && (left.fx === 0) && (left.playerViews !== 'By the Books Test Range'), JSON.stringify(left));
  }
} else {
  out.skips.push(`§pull ${SECTIONS.pull}`);
}

/* --- teardown: always ---------------------------------------------------------------------- */

const torn = await gm.evaluate(async () => {
  const MODULE = 'fvtt-mod-bythebooks';
  const st = globalThis.__bf2c;
  const errs = [];
  for (const failed of await st.settings.restore()) errs.push(`settings: ${failed}`);
  // §pull: the Ranger home, the prior active scene back (every client follows it), the scene gone.
  try {
    if (st.pull) {
      const scene = game.scenes.getName('By the Books Test Range');
      const rgr = scene?.tokens.get(st.pull.rangerId);
      if (rgr) await rgr.update(st.pull.rangerHome, { teleport: true, animate: false });
      const back = st.pull.priorActive ? game.scenes.get(st.pull.priorActive) : null;
      if (back && (game.scenes.active?.id !== back.id)) await back.activate();
      if (canvas.scene?.id !== scene?.id) await scene?.view();
      const elsewhere = game.scenes.get(st.pull.elsewhereId);
      if (elsewhere) await elsewhere.delete();
    }
  } catch (err) { errs.push(`pull: ${err?.message}`); }
  try {
    const scene = game.scenes.getName('By the Books Test Range');
    const tok = scene?.tokens.get(st.tokenId);
    if (tok) await scene.deleteEmbeddedDocuments('Token', [st.tokenId]);
    const shielder = game.actors.get(st.shielderId);
    if (shielder) await shielder.delete();
    for (const t of game.user.targets) t.setTarget(false, { releaseOthers: true });
    const mine = game.messages.filter(m => (m.timestamp >= st.suiteStart)
      && (m.speaker?.alias?.startsWith?.('BTB Test') || m.speaker?.alias === 'By the Books'
        || (Object.keys(m.flags?.[MODULE] ?? {}).length > 0)));
    if (mine.length) await ChatMessage.deleteDocuments(mine.map(m => m.id));
    return { errs, deleted: mine.length };
  } catch (err) {
    errs.push(`cleanup: ${err?.message}`);
    return { errs, deleted: 0 };
  }
}, null);
for (const e of torn.errs ?? []) note(`TEARDOWN ERROR: ${e}`);
note(`teardown removed ${torn.deleted} messages, the token and the fixture actor`);

await disposeSafely(player, '2client');
const failures = report({ tag: '2client', out, plan });
await gm.disconnect?.();
process.exit(failures ? 1 : 0);
