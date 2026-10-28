/**
 * SEVERAL GM CLIENTS, the other client's side (ARCHITECTURE §4 *The flow elect*; tools/README.md *Several GM clients
 * at once*): a declared GM identity joined beside the harness's own client while a suite or a probe runs, its page
 * watched from its first script, and hung up the way a closed window goes or the way a crashed one does. Then THE
 * ARRIVAL LANDING, the shape the two-GM suite sections share: a record answered as the second client arrives, and
 * what landed for it counted on the first client's page.
 *
 * A script that joins one declares it (`export const GM_CLIENTS = [...]`, target.mjs `declaredGmClients`); the
 * harness's preflight then allows exactly those users. ⚠ Every page function here is serialized by `evaluate` or
 * `addInitScript`: it closes over nothing.
 */
import { Foundry } from "fvtt-mcp-dnd5e/client";
import { installPrelude } from "./prelude.mjs";
import { gmConfig } from "./target.mjs";

/** A joined client's bridge diagnostics: its warnings and errors, not its every connect line. */
const quiet = tag => ({ debug() {}, info() {}, warn: m => console.warn(`[${tag}] ${m}`), error: m => console.error(`[${tag}] ${m}`) });

/** A promise raced against a ceiling: `{ settled, value }`; the loser is left running. */
export async function race(promise, ms) {
  let timer;
  let settled = false;
  let value;
  await Promise.race([promise.then(v => { settled = true; value = v; }), new Promise(r => { timer = setTimeout(r, ms); })]);
  clearTimeout(timer);
  return { settled, value };
}

/**
 * An init script on a client still connecting, so it runs before Foundry's own on the game page: the private seam
 * the bridge launches into (its browser context, once it exists). False when it never appeared or refused.
 */
export async function attachInit(client, fn, arg) {
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    const target = client.context ?? client.page;
    if (target?.addInitScript) {
      try { await target.addInitScript(fn, arg); return true; } catch { return false; }
    }
    await new Promise(r => setTimeout(r, 2));
  }
  return false;
}

/**
 * Join the GM identity `key` beside the running client. `connecting` settles `{ ok, err }` as the bridge's join
 * does; `ready` once the game is ready and the prelude is on the page (`window.__btb`); `attached` whether the init
 * script `init` (with `arg`) went on before the game page loaded.
 * @param {Record<string, string>} env
 * @param {string} key   a GM_IDENTITIES key the script declares
 * @param {{ init?: Function|null, arg?: any, tag?: string }} [opts]
 */
export function joinGm(env, key, { init = null, arg = null, tag = key } = {}) {
  const client = new Foundry(gmConfig(env, key), quiet(tag));
  const connecting = client.connect().then(() => ({ ok: true }), err => ({ ok: false, err: String(err?.message ?? err) }));
  const attached = init ? attachInit(client, init, arg) : Promise.resolve(false);
  const ready = connecting.then(async c => {
    if (!c.ok) return c;
    try { await installPrelude(client); return c; } catch (err) { return { ok: false, err: `the prelude: ${err.message}` }; }
  });
  return { client, connecting, attached, ready };
}

/** Page: what a closed window does as it goes (ui.js `beforeunload`) — its user's leading-window flag cleared. */
export async function closeLikeAWindow({ mod }) {
  const core = await import(`/modules/${mod}/scripts/core.js`);
  if (game.user?.isGM && (game.user.flags?.[core.MODULE_ID]?.[core.LEAD_FLAG] === core.WINDOW_ID)) {
    await game.user.unsetFlag(core.MODULE_ID, core.LEAD_FLAG);
  }
  return true;
}

/**
 * Hang a joined client up the way a closed window goes: its lead flag cleared, then the client disposed; a dispose
 * that does not settle closes the browser, and a browser that will not close throws (it may still hold a GM seat).
 */
export async function hangUp(client, { mod = "fvtt-mod-bythebooks", asWindow = true } = {}) {
  if (asWindow) await race(client.evaluate(closeLikeAWindow, { mod }).catch(() => {}), 10_000);
  const r = await race(client.dispose().catch(() => {}), 15_000);
  if (r.settled) return;
  const b = await race(Promise.resolve(client.browser?.close?.()).catch(() => {}), 5_000);
  if (!b.settled) throw new Error("the joined client would not hang up — its browser may still hold a GM seat");
}

/**
 * Drop a joined client the way a crashed window goes: its browser closed under the page, so no `beforeunload`
 * runs and no teardown either; then the client's own bookkeeping. Resolves the time the browser was gone.
 */
export async function dropDead(client) {
  const b = await race(Promise.resolve(client.browser?.close?.()).catch(() => {}), 10_000);
  if (!b.settled) throw new Error("the joined client's browser would not close — it may still hold a GM seat");
  const gone = Date.now();
  await race(client.dispose().catch(() => {}), 10_000);
  return gone;
}

/**
 * Page init script: every `bythebooks.moment` whose payload mentions `cfg.watch` (a card's id), from the first
 * script of the game page, kept on `window.__gmMoments`. Serialized: closes over nothing.
 */
export function watchMoments(cfg) {
  if (!/\/game$/.test(window.location.pathname)) return;
  const seen = [];
  window.__gmMoments = seen;
  const timer = setInterval(() => {
    const H = globalThis.Hooks;
    if (!H?.on) return;
    clearInterval(timer);
    H.on("bythebooks.moment", p => {
      try { if (JSON.stringify(p).includes(cfg.watch)) seen.push({ t: Date.now(), kind: p?.kind ?? null, event: p?.event ?? null }); }
      catch { /* a counter never reaches the moment it counts */ }
    });
  }, 2);
}

/** Page: the moments `watchMoments` kept. */
export function momentsSeen() {
  return [...(window.__gmMoments ?? [])];
}

/**
 * Page, on the client already on: THE ARRIVAL LANDING's ledger and its fire. `cfg.messageId` is a card whose record
 * is armed (`cfg.flagKey`), `cfg.patch` the answer that releases its landing, written `cfg.offset` ms after this
 * client hears the user `cfg.xUserId` connect. The ledger: every write to the record (who claimed it), the tokens
 * made on `cfg.sceneId`, the effects made on the actor `cfg.casterId`, the cards posted, and the moments that name the
 * card — each stamped with the user that made it. `window.__arrival.state()` and `.ledger()` read it.
 */
export function armArrival(cfg) {
  const { mod, flagKey, messageId, patch, xUserId, offset, sceneId, casterId } = cfg;
  const A = { events: [], heard: null, fired: null, firedAck: null, fireError: null, closed: false };
  window.__arrival = A;
  const push = e => { if (!A.closed) A.events.push({ t: Date.now(), ...e }); };
  const isClaim = a => (a === true) || (!!a && (typeof a === "object") && ("at" in a || "by" in a || "window" in a));
  const hooks = [
    ["updateChatMessage", (m, changes, _o, userId) => {
      if (m.id !== messageId) return;
      const s = changes?.flags?.[mod]?.[flagKey];
      if (s) push({ kind: "update", by: userId, claim: isClaim(s.applying), applied: s.applied ?? null });
    }],
    ["createToken", (doc, _o, userId) => { if (doc.parent?.id === sceneId) push({ kind: "token", by: userId, id: doc.id }); }],
    ["createActiveEffect", (e, _o, userId) => {
      if (e.parent?.id === casterId) push({ kind: "effect", by: userId, id: e.id, companion: !!e.getFlag(mod, "companion") });
    }],
    ["createChatMessage", (m, _o, userId) => {
      if (m.id === messageId) return;
      // the landing's own: spoken by the caster or a creature it made, or naming the card; anything else is another machine's
      let mentions = false;
      try { mentions = JSON.stringify({ flags: m.flags, content: m.content }).includes(messageId); } catch { /* unreadable: not the landing's */ }
      push({ kind: "message", by: userId, id: m.id, actor: m.speaker?.actor ?? null, token: m.speaker?.token ?? null, mentions,
        flags: Object.keys(m.flags?.[mod] ?? {}) });
    }],
    ["bythebooks.moment", p => {
      try { if (JSON.stringify(p).includes(messageId)) push({ kind: "moment", what: p?.kind ?? null }); }
      catch { /* a counter never reaches the moment it counts */ }
    }],
    ["userConnected", (u, active) => {
      if ((u.id !== xUserId) || !active || A.heard) return;
      A.heard = Date.now();
      setTimeout(async () => {
        A.fired = Date.now();
        try {
          const m = game.messages.get(messageId);
          await m.setFlag(mod, flagKey, { ...m.getFlag(mod, flagKey), ...patch });
          A.firedAck = Date.now();
        } catch (err) { A.fireError = String(err?.message ?? err); }
      }, Math.max(0, offset));
    }]
  ];
  A.ids = hooks.map(([hook, fn]) => [hook, Hooks.on(hook, fn)]);
  A.lastEventAt = () => A.events.at(-1)?.t ?? A.firedAck ?? 0;
  A.state = () => {
    const f = game.messages.get(messageId)?.getFlag(mod, flagKey) ?? null;
    return { heard: A.heard, fired: A.fired, firedAck: A.firedAck, fireError: A.fireError, applied: !!f?.applied,
      outcome: f?.outcome ?? null, quietMs: Date.now() - A.lastEventAt() };
  };
  A.ledger = () => {
    A.closed = true;
    for (const [hook, id] of A.ids) Hooks.off(hook, id);
    return { heard: A.heard, fired: A.fired, firedAck: A.firedAck, fireError: A.fireError, events: A.events };
  };
  return { armed: true };
}

/** Page, on the client already on: the arrival's answer written, then the record landed and the world quiet for 2.5 s. */
export async function awaitArrival({ timeout = 45_000 } = {}) {
  const { until } = window.__btb;
  const A = window.__arrival;
  try {
    await until(() => A.state().fired, { timeout, label: "the answer written as the second GM client arrived" });
    await until(() => { const s = A.state(); return s.applied && (s.quietMs >= 2500); }, { timeout, label: "the record landed and the world quiet" });
    return { ok: true, ...A.state() };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err), ...A.state() };
  }
}

/** Page: the user `userId` seen gone (its client hung up), at most `timeout` ms. */
export async function awaitGone({ userId, timeout = 20_000 }) {
  const { until } = window.__btb;
  try { await until(() => !game.users.get(userId)?.active, { timeout, label: "the second GM client gone" }); return true; }
  catch { return false; }
}

/**
 * THE ARRIVAL LANDING, node side: `prep` (a page function, with `prepArg`) arms a record on the harness's page and
 * answers `{ messageId, patch, casterId, sceneId, xUserId }` or `{ fatal }`; the record's answer is then written
 * the moment that page hears the GM identity `key` connect, while it boots. What landed is counted on the first
 * page (`armArrival`) and the moments on both: `{ prep, joined, landed, ledger, xMoments, gone }`. The second
 * client is hung up the way a closed window goes before this returns, whatever happened.
 * @param {any} f   the harness's connected client
 * @param {{ env: Record<string, string>, key: string, prep: Function, prepArg?: any, flagKey: string, tag?: string }} opts
 */
export async function arrivalLanding(f, { env, key, prep, prepArg = null, flagKey, tag = key }) {
  const mod = "fvtt-mod-bythebooks";
  const p = await f.evaluate(prep, prepArg);
  if (!p || p.fatal) return { prep: p ?? { fatal: "the prep answered nothing" } };
  await f.evaluate(armArrival, { mod, flagKey, messageId: p.messageId, patch: p.patch, xUserId: p.xUserId, offset: 0, sceneId: p.sceneId, casterId: p.casterId });
  const x = joinGm(env, key, { init: watchMoments, arg: { watch: p.messageId }, tag });
  let joined = { ok: false, err: "not joined" };
  let landed = null;
  let xMoments = [];
  try {
    const j = await race(x.ready, 120_000);
    joined = j.settled ? j.value : { ok: false, err: "the second client did not join in 120 s" };
    landed = await f.evaluate(awaitArrival, { timeout: 45_000 });
    if (joined.ok) xMoments = await x.client.evaluate(momentsSeen, null).catch(() => []);
  } finally {
    await hangUp(x.client, { mod });
  }
  const gone = await f.evaluate(awaitGone, { userId: p.xUserId });
  const ledger = await f.evaluate(() => window.__arrival.ledger(), null);
  return { prep: p, joined, landed, ledger, xMoments, gone };
}

/**
 * Page, on the client already on, once the second client is gone: the arrival landing judged — the record landed
 * once (one claim, one token made and standing, `expect.companionEffects` companion effects made and standing, no
 * other effect made on the caster unless `expect.casterEffects` says so, one moment over both pages, no extra card of
 * the landing's: spoken by the caster or a creature it made, or naming the card; another machine's card posted
 * meanwhile, an aura the new elect raises on the live scene, is logged, not counted) —
 * and then put away: the summon dismissed, what carries the card removed, Concentration ended where the prep began
 * one, the lent spell (`flags.world.twoGmSection`), the card and the actors the system imported for it deleted.
 * Answers the prelude's `{ results, log, skips }` for section `id`.
 */
export async function judgeArrival({ sections, titles, run, id, expect = {} }) {
  const MOD = "fvtt-mod-bythebooks";
  const { until } = window.__btb;
  const { results, log, skips, ok, section } = window.__btb.begin({ sections, titles });
  const { prep, joined, landed, ledger, xMoments, gone } = run;
  const caster = game.actors.get(prep.casterId);
  const range = game.scenes.get(prep.sceneId);
  const message = game.messages.get(prep.messageId);
  const name = uid => game.users.get(uid)?.name ?? uid;
  const ev = ledger?.events ?? [];
  const stamped = () => (range?.tokens ?? []).filter(t => t.getFlag(MOD, "summonCard") === prep.messageId);
  const companions = () => (caster?.effects ?? []).filter(e => e.getFlag(MOD, "companion") === prep.messageId);
  await section(id, async () => {
    const flag = message?.getFlag(MOD, "summon") ?? null;
    const claims = ev.filter(e => (e.kind === "update") && e.claim);
    const tokens = ev.filter(e => e.kind === "token");
    const effects = ev.filter(e => e.kind === "effect");
    const madeTokens = new Set(tokens.map(t => t.id));
    const ofLanding = e => e.mentions || (e.actor === prep.casterId) || (!!e.token && madeTokens.has(e.token));
    const cards = ev.filter(e => (e.kind === "message") && ofLanding(e));
    const elsewhere = ev.filter(e => (e.kind === "message") && !ofLanding(e));
    if (elsewhere.length) log.push(`§${id} ${elsewhere.length} card(s) of other machines posted meanwhile, not the landing's: ${elsewhere.map(e => `${name(e.by)} [${e.flags.join("+") || "no module flag"}]`).join("; ")}`);
    const moments = ev.filter(e => e.kind === "moment").length + (xMoments?.length ?? 0);
    const after = (Number.isFinite(ledger?.fired) && Number.isFinite(ledger?.heard)) ? (ledger.fired - ledger.heard) : null;
    log.push(`§${id} the second GM client ${joined?.ok ? "joined" : `did not join (${joined?.err})`}; the answer written ${after ?? "?"} ms after the arrival; `
      + `claimed by ${claims.map(c => name(c.by)).join(", ") || "nobody"}; the token made by ${tokens.map(t => name(t.by)).join(", ") || "nobody"}`);
    ok(`§${id} the second GM client joined and the record landed`, !!joined?.ok && !!landed?.ok && !!flag?.applied && (flag.outcome === "landed") && ((flag.landed ?? []).length === 1),
      JSON.stringify({ joined: joined?.ok ? true : joined?.err, landed: landed?.ok ? true : landed?.error, outcome: flag?.outcome, failure: flag?.failure, landedTokens: flag?.landed?.length }));
    ok(`§${id} one claim on the record`, claims.length === 1, JSON.stringify(claims.map(c => name(c.by))));
    ok(`§${id} one token made, one standing`, (tokens.length === 1) && (stamped().length === 1), JSON.stringify({ made: tokens.length, standing: stamped().length }));
    const wantCompanions = expect.companionEffects ?? 0;
    const madeCompanions = effects.filter(e => e.companion).length;
    ok(`§${id} ${wantCompanions} companion effect(s) made and standing`, (madeCompanions === wantCompanions) && (companions().length === wantCompanions),
      JSON.stringify({ made: madeCompanions, standing: companions().length }));
    const others = effects.filter(e => !e.companion).length;
    ok(`§${id} no other effect made on the caster`, others === (expect.casterEffects ?? 0), JSON.stringify(effects));
    ok(`§${id} one moment over both clients`, moments === 1, JSON.stringify({ first: ev.filter(e => e.kind === "moment"), second: xMoments }));
    ok(`§${id} no extra card from the landing`, cards.length === 0, JSON.stringify(cards));
    ok(`§${id} the second GM client hung up`, gone === true, `gone=${gone}`);
  });
  // put away, whatever the asserts said
  try {
    const api = game.modules.get(MOD)?.api?.summons;
    const f = message?.getFlag(MOD, "summon");
    if (message && f?.applied && !f.dismissed && !f.dismissAsked && api?.askDismiss) {
      await api.askDismiss(message);
      await until(() => message.getFlag(MOD, "summon")?.dismissed, { timeout: 15_000, label: "the summon dismissed" }).catch(() => null);
    }
    const left = stamped().map(t => t.id);
    if (left.length) await range.deleteEmbeddedDocuments("Token", left, { "fvtt-mod-bythebooks": { companionEnd: true } }).catch(() => {});
    const effectIds = companions().map(e => e.id);
    if (effectIds.length) await caster.deleteEmbeddedDocuments("ActiveEffect", effectIds, { [MOD]: { companionEnd: true } }).catch(() => {});
    if (prep.concentration && caster?.concentration?.effects?.size) await caster.endConcentration().catch(() => {});
    const lent = (caster?.items ?? []).filter(i => i.getFlag("world", "twoGmSection")).map(i => i.id);
    if (lent.length) await caster.deleteEmbeddedDocuments("Item", lent).catch(() => {});
    if (message && game.messages.get(message.id)) await message.delete().catch(() => {});
    const imported = game.actors.filter(a => a.getFlag("dnd5e", "isAutoImported") && ((a._stats?.createdTime ?? 0) >= prep.since));
    if (imported.length) await Actor.deleteDocuments(imported.map(a => a.id), { "fvtt-mod-bythebooks": { companionEnd: true } }).catch(() => {});
  } catch (err) { log.push(`§${id} TEARDOWN ERROR: ${err?.message ?? err}`); }
  return { results, log, skips };
}
