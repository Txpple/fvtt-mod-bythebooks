/**
 * SEVERAL GM CLIENTS: THE CONNECT RACE, MEASURED (suite issue #8, items 3 and 5). One landing per cycle,
 * fired as a second GM client connects, and what lands per record counted: the claims on the record
 * (`applying` written, by which user), the tokens, the companion effects, the moments, the chat cards.
 * Both pages log the elect as they see it (`isActiveGM`, sampled every 5 ms), so each cycle also says
 * how long both clients held the elect at once (the overlap) and how long neither did (the gap).
 *
 *   node tools/probe-multi-gm.mjs                        every ordering the world's identities allow, 16 cycles each
 *   node tools/probe-multi-gm.mjs --orderings same-moves,assistant-full
 *   node tools/probe-multi-gm.mjs --cycles 10            the first 10 offsets of the schedule
 *   node tools/probe-multi-gm.mjs --aim=-10 --cycles 24  every cycle at one offset (ms; a negative one takes the =): a narrow window sampled densely
 *   node tools/probe-multi-gm.mjs --keep-lead            leave the arriving user's leading-window flag as its last
 *                                                        window left it (a crashed browser), not cleared (a closed one)
 *   node tools/probe-multi-gm.mjs --json <file>          where the cycles go (default dist/probe-multi-gm/<stamp>.json)
 *   node tools/probe-multi-gm.mjs --watchdog 50          minutes before the hard abort (default 50)
 *   node tools/probe-multi-gm.mjs --list                 the orderings and the offsets, without connecting
 *
 * THE ORDERINGS. W is the GM client already on (the harness's own connection), X the one connecting.
 *   full-assistant   W a Gamemaster, X an Assistant GM: the elect stays on W
 *   assistant-full   W an Assistant GM, X a Gamemaster: the elect moves to X as it connects
 *   same-stays       W and X of one role, X the higher id: the elect stays on W
 *   same-moves       W and X of one role, X the lower id: the elect moves to X as it connects
 *   hangup-claim     same-moves, then X, the elect, claims the landing and its browser closes under the page
 *                    before its first token (no beforeunload, no teardown): W lands the record once
 *   hangup-landing   the same, X's browser closing after its token and before the companion effect: W removes
 *                    the token X left (it carries the card) and lands the record once
 * Foundry's elect is the active GM with the highest role, then the lowest id (`Users#getDesignatedUser`), so
 * an ordering is "stays" or "moves" by role and id alone. The identities are the GM_CLIENTS below, named in
 * the family .env (tools/README.md); a Gamemaster pair is preferred for the same-role rows, an Assistant
 * pair otherwise. An ordering whose identities are missing from the world, or hold other roles, is skipped
 * and named (tools/seed-gm-identities.mjs creates them).
 *
 * ONE CYCLE. W casts Find Familiar from BTB Test Sorcerer to its card (the record `asked`) and computes the
 * answer; X starts connecting (a fresh headless browser, its timeline logged from the first script of its
 * game page); W writes the answer (the record `placed`, which the elect lands) at an offset from the moment
 * W hears X connect (`userConnected`). A negative offset is aimed from the connect times measured so far,
 * and every cycle reports the offset it got. When the record has landed and the world is quiet, X hangs up
 * the way a closed window does (its leading-window flag cleared, unless --keep-lead), and W, alone again,
 * dismisses the familiar and removes the cycle's tokens, companion effects and cards.
 * A HANG-UP CYCLE (the hangup-* orderings) proves the re-drive (core.js `claimLanding`, ui.js's `userConnected`):
 * X joins with its landing stalled (an init script holds X's token or companion-effect create forever), W answers
 * the record once X is ready, X claims it, and its browser is closed the moment W sees the claim; W, the elect again,
 * finds the claim dead and lands the record — one claim of W's over X's, one familiar token standing, one companion
 * effect, the record `applied` by W.
 *
 * Fixtures: run tools/fixture-suite.mjs first and tools/teardown-fixtures.mjs after. ⚠ Mutates the world:
 * Find Familiar lent to the Sorcerer, one card, one familiar and one companion effect per cycle, the Owl the
 * system imports; all removed at the end. Disconnect the bridge first: the preflight allows the declared
 * identities only. Exit 0 when every planned cycle was measured, 1 when one was not, 2 on a refusal.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Foundry } from "fvtt-mcp-dnd5e/client";
import { strictArgs, usageOf } from "./args.mjs";
import { attachInit, closeLikeAWindow, dropDead, hangUp as hangUpGm, race } from "./gm-clients.mjs";
import { connectSuite, loadEnv } from "./harness.mjs";
import { gmConfig, gmIdentity } from "./target.mjs";

/** The GM identities this probe holds at once (target.mjs `GM_IDENTITIES`); the preflight allows exactly these. */
export const GM_CLIENTS = ["suite", "gm2", "assistant"];

const TAG = "multi-gm";
const MOD = "fvtt-mod-bythebooks";
const CASTER = "BTB Test Sorcerer";
const RANGE = "By the Books Test Range";
const REPO = dirname(dirname(fileURLToPath(import.meta.url)));

const ORDERINGS = {
  "full-assistant": "W a Gamemaster, X an Assistant GM: the elect stays on W",
  "assistant-full": "W an Assistant GM, X a Gamemaster: the elect moves to X as it connects",
  "same-stays": "W and X of one role, X the higher id: the elect stays on W",
  "same-moves": "W and X of one role, X the lower id: the elect moves to X as it connects",
  "hangup-claim": "same-moves; X claims the landing and is hung up before its token: W re-drives it",
  "hangup-landing": "same-moves; X claims, lands its token and is hung up before the companion effect: W removes it and re-drives"
};

/** Where a hang-up ordering's X stalls its landing: before its token, or after it. */
const HANG = { "hangup-claim": "token", "hangup-landing": "effect" };

/**
 * The fire's offset from the moment W hears X connect, in ms, one per cycle: the first calibrates the
 * connect time the negative ones are aimed from; then the claim racing the connect (just before it), the
 * connect itself, X's load (its world snapshot is taken at the connect, its listeners start at ready),
 * and X ready.
 */
const OFFSETS = [0, -150, -80, -40, -20, -10, 10, 20, 40, 80, 150, 300, 600, 1200, 2500, 5000];

const { values } = strictArgs({
  options: {
    orderings: { type: "string" },
    cycles: { type: "string" },
    aim: { type: "string" },
    "keep-lead": { type: "boolean" },
    json: { type: "string" },
    watchdog: { type: "string" },
    list: { type: "boolean" }
  },
  usage: usageOf(fileURLToPath(import.meta.url)),
  script: "probe-multi-gm.mjs"
});
if (values.list) {
  console.log("Orderings (W on first, X connecting):");
  for (const [k, v] of Object.entries(ORDERINGS)) console.log(`  ${k.padEnd(15)} ${v}`);
  console.log(`Offsets from W hearing X connect, one per cycle (ms): ${OFFSETS.join(", ")}`);
  process.exit(0);
}
const asked = values.orderings ? values.orderings.split(",").map(s => s.trim()).filter(Boolean) : Object.keys(ORDERINGS);
const unknownOrdering = asked.filter(k => !(k in ORDERINGS));
if (unknownOrdering.length) { console.error(`--orderings: no such ordering ${unknownOrdering.join(", ")}. Try --list.`); process.exit(2); }
const cycles = values.cycles === undefined ? OFFSETS.length : Number(values.cycles);
const aim = values.aim === undefined ? null : Number(values.aim);
if ((aim !== null) && !Number.isFinite(aim)) { console.error("--aim takes an offset in ms"); process.exit(2); }
const offsetOf = i => aim ?? OFFSETS[i % OFFSETS.length];
if (!Number.isInteger(cycles) || cycles < 1) { console.error("--cycles takes a positive integer"); process.exit(2); }
const watchdogMin = values.watchdog === undefined ? 50 : Number(values.watchdog);
if (!Number.isFinite(watchdogMin) || watchdogMin <= 0) { console.error("--watchdog takes minutes"); process.exit(2); }
const keepLead = !!values["keep-lead"];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonPath = values.json ?? join(REPO, "dist", "probe-multi-gm", `${stamp}.json`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
/** The arriving client's bridge diagnostics: its warnings and errors, not its every connect line. */
const X_LOG = { debug() {}, info() {}, warn: m => console.warn(`[${TAG}] X: ${m}`), error: m => console.error(`[${TAG}] X: ${m}`) };
const median = xs => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

/* ─── the page side of W, installed once per W connection (closes over nothing: serialized) ─── */

async function installW({ mod, casterName, rangeName }) {
  const P = {};
  globalThis.__mgp = P;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (test, timeout = 8000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) { const v = await test(); if (v) return v; await sleep(100); }
    return test();
  };
  const core = await import(`/modules/${mod}/scripts/core.js`);
  const { placedAnswer } = await import(`/modules/${mod}/scripts/decide/summons.js`);
  const { SUMMON_CHOICES } = await import(`/modules/${mod}/scripts/decide/registry.js`);
  const { poolFromPacks } = await import(`/modules/${mod}/scripts/gallery.js`);
  const api = game.modules.get(mod)?.api?.summons;
  if (!api?.askDismiss) return { fatal: "no summons api on this box — reload the world" };
  const caster = game.actors.getName(casterName);
  const range = game.scenes.getName(rangeName);
  if (!caster || !range) return { fatal: `missing fixture: ${!caster ? casterName : rangeName} — run tools/fixture-suite.mjs` };
  const casterToken = range.tokens.find(t => t.actorId === caster.id);
  if (!casterToken) return { fatal: `${casterName} has no token on ${rangeName} — run tools/fixture-suite.mjs` };
  // The lent spell, one per run: a later W connection finds it by its stamp.
  let spell = caster.items.find(i => i.getFlag("world", "multiGmProbe"));
  if (!spell) {
    const pack = game.packs.get("dnd-players-handbook.spells");
    const hit = pack ? (await pack.getIndex()).find(e => e.name === "Find Familiar") : null;
    if (!hit) return { fatal: "the PHB's Find Familiar is not on this box" };
    const src = (await pack.getDocument(hit._id)).toObject();
    src.system.prepared = 1;
    src.flags = { ...(src.flags ?? {}), world: { ...(src.flags?.world ?? {}), multiGmProbe: true } };
    [spell] = await caster.createEmbeddedDocuments("Item", [src]);
  }
  const summon = spell?.system?.activities?.getByType?.("summon")?.[0] ?? null;
  if (!summon) return { fatal: "the lent Find Familiar has no summon activity" };
  const owl = (await poolFromPacks({ crMax: 0, types: ["beast"] })).find(r => r.name === "Owl") ?? null;
  if (!owl) return { fatal: "no Owl in the familiar pool" };

  // THE LEDGER: every write this page hears during a cycle, stamped with the user that made it.
  const push = e => {
    const c = P.cycle;
    if (!c || c.closed) return;
    c.events.push({ t: Date.now(), ...e });
    c.lastEventAt = Date.now();
  };
  Hooks.on("updateChatMessage", (m, changes, _options, userId) => {
    const c = P.cycle;
    if (!c || (m.id !== c.id)) return;
    const s = changes?.flags?.[mod]?.summon;
    if (!s) return;
    push({ kind: "update", by: userId, status: s.status, applying: s.applying, applied: s.applied, outcome: s.outcome,
      landed: Array.isArray(s.landed) ? s.landed.length : undefined, dismissed: s.dismissed });
    const claim = (s.applying === true) || (!!s.applying && (typeof s.applying === "object") && ("at" in s.applying || "by" in s.applying));
    if (claim && (userId === c.xUserId)) c.xClaimAt ??= Date.now();
  });
  Hooks.on("createToken", (doc, _options, userId) => {
    if (doc.parent?.id !== range.id) return;
    push({ kind: "token", by: userId, id: doc.id, name: doc.name, card: doc.getFlag(mod, "summonCard") ?? null });
    if (P.cycle && (userId === P.cycle.xUserId)) P.cycle.xTokenAt ??= Date.now();
  });
  Hooks.on("deleteToken", (doc, _options, userId) => { if (doc.parent?.id === range.id) push({ kind: "token-gone", by: userId, id: doc.id }); });
  Hooks.on("createActiveEffect", (e, _options, userId) => {
    if (e.parent?.id === caster.id) push({ kind: "effect", by: userId, id: e.id, name: e.name, companion: !!e.getFlag(mod, "companion") });
  });
  Hooks.on("deleteActiveEffect", (e, _options, userId) => { if (e.parent?.id === caster.id) push({ kind: "effect-gone", by: userId, id: e.id }); });
  Hooks.on("createChatMessage", (m, _options, userId) => { if (P.cycle && (m.id !== P.cycle.id)) push({ kind: "message", by: userId, id: m.id }); });
  Hooks.on("bythebooks.moment", payload => {
    const c = P.cycle;
    try { if (c && JSON.stringify(payload).includes(c.id)) push({ kind: "moment", what: payload?.kind ?? null, event: payload?.event ?? null }); }
    catch { /* a counter never reaches the moment it counts */ }
  });
  Hooks.on("userConnected", (user, active) => {
    const c = P.cycle;
    if (!c || (user.id !== c.xUserId)) return;
    push({ kind: active ? "act" : "deact" });
    if (active && !c.act) {
      c.act = Date.now();
      if (c.plan && (c.plan.offset >= 0) && !c.fired) c.timer = setTimeout(() => { void P.fire("relative"); }, c.plan.offset);
    }
  });

  /** The record armed: the cast to its card, the answer computed, the elect sampled from here on. */
  P.arm = async ({ cycle, xUserId, clearLead }) => {
    for (const app of foundry.applications.instances.values()) {
      if ((app instanceof foundry.applications.api.DialogV2) && /Find Familiar/.test(app.element?.textContent ?? "")) {
        try { await app.close(); } catch { /* gone */ }
      }
    }
    const xu = game.users.get(xUserId);
    let leadCleared = false;
    if (clearLead && xu?.flags?.[mod]?.leadWindow) { await xu.unsetFlag(mod, "leadWindow"); leadCleared = true; }
    const result = await summon.use({ [mod]: { toCard: true }, create: { measuredTemplate: false, summons: false }, consume: { spellSlot: false } },
      { configure: false }, { create: true });
    const message = (result?.message instanceof ChatMessage) ? result.message : null;
    if (!message) return { error: "the cast posted no card" };
    const flag = await waitFor(() => (message.getFlag(mod, "summon")?.status === "asked") ? message.getFlag(mod, "summon") : null, 8000);
    if (!flag) return { error: `the record never reached asked (${message.getFlag(mod, "summon")?.status ?? "no record"})`, messageId: message.id };
    const grid = range.grid.size;
    const types = flag.creatureTypes ?? [];
    const patch = placedAnswer(flag, { profileId: flag.profiles?.[0]?.id ?? null, pick: { uuid: owl.uuid, name: owl.name }, count: 1, sceneId: range.id,
      creatureType: types.includes("fey") ? "fey" : (types[0] ?? null), intoPocket: false,
      placements: [{ x: casterToken.x + grid, y: casterToken.y + grid * (cycle % 3), elevation: casterToken.elevation ?? 0, rotation: 0 }] }, SUMMON_CHOICES);
    if (!patch) return { error: "placedAnswer refused the answer", messageId: message.id };
    const c = { id: message.id, patch, events: [], wSamples: [], armedAt: Date.now(), lastEventAt: Date.now(), xUserId,
      plan: null, fired: null, act: null, leadCleared, replaces: flag.replaces ?? null, closed: false };
    P.cycle = c;
    let last = null;
    const sample = () => {
      const active = core.isActiveGM();
      const elect = game.users.activeGM?.name ?? null;
      const k = `${active}|${elect}`;
      if (k !== last) { last = k; c.wSamples.push({ t: Date.now(), active, elect }); }
    };
    sample();
    c.poller = setInterval(sample, 5);
    return { messageId: message.id, leadCleared };
  };

  /** When to fire: `offset` after W hears X connect, or at `absoluteAt` (an offset aimed before it). */
  P.plan = plan => {
    const c = P.cycle;
    c.plan = plan;
    if (Number.isFinite(plan.absoluteAt)) c.timer = setTimeout(() => { void P.fire("absolute"); }, Math.max(0, plan.absoluteAt - Date.now()));
    return { at: Date.now() };
  };

  /** THE FIRE: the record answered, as the placement popup answers it; the elect lands what it places. */
  P.fire = async how => {
    const c = P.cycle;
    if (!c || c.fired) return;
    c.fired = Date.now();
    c.fireHow = how;
    const m = game.messages.get(c.id);
    try {
      await m.setFlag(mod, "summon", { ...m.getFlag(mod, "summon"), ...c.patch });
      c.firedAck = Date.now();
    } catch (err) { c.fireError = String(err?.message ?? err); }
  };

  P.status = () => {
    const c = P.cycle;
    const f = game.messages.get(c.id)?.getFlag(mod, "summon");
    return { now: Date.now(), fired: c.fired, act: c.act, applied: !!f?.applied, applying: !!f?.applying, status: f?.status ?? null, lastEventAt: c.lastEventAt,
      xClaimAt: c.xClaimAt ?? null, xTokenAt: c.xTokenAt ?? null, deact: c.events.find(e => e.kind === "deact")?.t ?? null };
  };

  /** The cycle as this page saw it; the ledger closes. */
  P.collect = () => {
    const c = P.cycle;
    clearInterval(c.poller);
    clearTimeout(c.timer);
    c.closed = true;
    c.collectedAt = Date.now();
    const f = game.messages.get(c.id)?.getFlag(mod, "summon") ?? null;
    const tokens = c.events.filter(e => e.kind === "token").map(e => e.id);
    return {
      id: c.id, armedAt: c.armedAt, act: c.act, fired: c.fired, firedAck: c.firedAck ?? null, fireHow: c.fireHow ?? null,
      fireError: c.fireError ?? null, plan: c.plan, leadCleared: c.leadCleared, replaces: c.replaces, collectedAt: c.collectedAt,
      events: c.events, wSamples: c.wSamples,
      xClaimAt: c.xClaimAt ?? null, xTokenAt: c.xTokenAt ?? null,
      final: f ? { status: f.status ?? null, applied: !!f.applied, applying: !!f.applying, outcome: f.outcome ?? null,
        landed: (f.landed ?? []).length, companion: f.companion?.state ?? null, failure: f.failure ?? null } : null,
      standing: { tokens: tokens.filter(id => range.tokens.get(id)).length,
        companionEffects: caster.effects.filter(e => e.getFlag(mod, "companion")).length },
      users: Object.fromEntries(game.users.map(u => [u.id, u.name]))
    };
  };

  /** W alone again: the familiar dismissed by the module, then whatever a doubled landing left, then the cards. */
  P.cleanup = async () => {
    const c = P.cycle;
    if (!c) return { clean: true, left: {} };
    clearInterval(c.poller);
    clearTimeout(c.timer);
    c.closed = true;
    const m = game.messages.get(c.id);
    const f = m?.getFlag(mod, "summon");
    if (m && f?.applied && !f.dismissed && !f.dismissAsked) {
      await api.askDismiss(m).catch(() => {});
      await waitFor(() => (m.getFlag(mod, "summon")?.dismissed ? true : null), 10000);
    }
    const made = c.events.filter(e => e.kind === "token").map(e => e.id);
    const tokens = made.filter(id => range.tokens.get(id));
    if (tokens.length) await range.deleteEmbeddedDocuments("Token", tokens, { "fvtt-mod-bythebooks": { companionEnd: true } }).catch(() => {});
    for (const e of caster.effects.filter(x => x.getFlag(mod, "companion") || /^Familiar:/.test(x.name ?? ""))) {
      try { await e.delete({ [mod]: { companionEnd: true } }); } catch { /* gone */ }
    }
    const msgs = [c.id, ...c.events.filter(e => e.kind === "message").map(e => e.id)].filter(id => game.messages.get(id));
    if (msgs.length) await ChatMessage.deleteDocuments(msgs).catch(() => {});
    await sleep(400);
    const left = {
      tokens: made.filter(id => range.tokens.get(id)).length,
      effects: caster.effects.filter(x => x.getFlag(mod, "companion")).length,
      messages: msgs.filter(id => game.messages.get(id)).length
    };
    P.cycle = null;
    return { clean: !left.tokens && !left.effects && !left.messages, left };
  };

  /** The end of the run: the lent spell, the familiars, the cards and the Owl the system imported. */
  P.sweep = async ({ runStart, tokenIds }) => {
    const out = [];
    for (const e of caster.effects.filter(x => x.getFlag(mod, "companion") || /^Familiar:/.test(x.name ?? ""))) {
      try { await e.delete({ [mod]: { companionEnd: true } }); out.push(`effect ${e.name}`); } catch { /* gone */ }
    }
    const tokens = (tokenIds ?? []).filter(id => range.tokens.get(id));
    if (tokens.length) { await range.deleteEmbeddedDocuments("Token", tokens, { "fvtt-mod-bythebooks": { companionEnd: true } }).catch(() => {}); out.push(`${tokens.length} token(s)`); }
    const spells = caster.items.filter(i => i.getFlag("world", "multiGmProbe")).map(i => i.id);
    if (spells.length) { await caster.deleteEmbeddedDocuments("Item", spells).catch(() => {}); out.push("the lent Find Familiar"); }
    const cards = game.messages.filter(m => (m.timestamp >= runStart) && (m.speaker?.actor === caster.id) && m.getFlag(mod, "summon")).map(m => m.id);
    if (cards.length) { await ChatMessage.deleteDocuments(cards).catch(() => {}); out.push(`${cards.length} card(s)`); }
    const imported = game.actors.filter(a => a.getFlag("dnd5e", "isAutoImported") && ((a._stats?.createdTime ?? 0) >= runStart));
    if (imported.length) { await Actor.deleteDocuments(imported.map(a => a.id), { "fvtt-mod-bythebooks": { companionEnd: true } }).catch(() => {}); out.push(`imported ${imported.map(a => a.name).join(", ")}`); }
    return out;
  };

  return { ok: true, self: game.user.name, role: game.user.role, id: game.user.id };
}

/* ─── the page side of X ─── */

/**
 * X's timeline from the first script of its game page (an init script, so it runs before Foundry's own):
 * its hooks as they fire, its view of the record at `setup` (its world snapshot) and on each render of
 * the card, and the elect as it sees it, sampled every 5 ms once its users exist. Serialized: closes over
 * nothing.
 */
function xInit(cfg) {
  if (!/\/game$/.test(window.location.pathname)) return;
  const mod = cfg.mod;
  const watch = cfg.messageId;
  const rec = { nav: Date.now(), events: [], samples: 0, timer: null };
  window.__mgpX = rec;
  const note = (kind, extra = {}) => rec.events.push({ t: Date.now(), kind, ...extra });
  const recordOf = () => {
    try {
      const s = globalThis.game?.messages?.get(watch)?.flags?.[mod]?.summon;
      return s ? { status: s.status ?? null, applying: !!s.applying, applied: !!s.applied } : null;
    } catch { return null; }
  };
  const stateOf = () => {
    const users = globalThis.game?.users;
    if (!users?.current) return null;
    const elect = users.activeGM;
    return { elect: elect?.name ?? null, self: !!elect?.isSelf, lead: users.current.flags?.[mod]?.leadWindow ?? null };
  };
  let hooked = false;
  let last = null;
  const tick = () => {
    try {
      if (!hooked && globalThis.Hooks?.on) {
        hooked = true;
        const H = globalThis.Hooks;
        H.once("init", () => note("init"));
        H.once("setup", () => note("setup", { state: stateOf(), record: recordOf() }));
        H.once("ready", () => {
          note("ready", { state: stateOf(), record: recordOf() });
          // THE STALL (a hang-up cycle): X's landing held forever at its token's create, or at the companion effect's
          if (cfg.stall === "token") {
            const proto = globalThis.CONFIG.Scene.documentClass.prototype;
            const create = proto.createEmbeddedDocuments;
            proto.createEmbeddedDocuments = function (name, ...args) {
              if (name !== "Token") return create.call(this, name, ...args);
              note("stalled", { at: "token" });
              return new Promise(() => {});
            };
          } else if (cfg.stall === "effect") {
            const proto = globalThis.CONFIG.Actor.documentClass.prototype;
            const create = proto.createEmbeddedDocuments;
            proto.createEmbeddedDocuments = function (name, data, ...args) {
              if ((name !== "ActiveEffect") || !(data ?? []).some(d => d?.flags?.[mod]?.companion)) return create.call(this, name, data, ...args);
              note("stalled", { at: "companion effect" });
              return new Promise(() => {});
            };
          }
        });
        H.on("dnd5e.renderChatMessage", m => { if (m?.id === watch) note("render", { state: stateOf(), record: recordOf() }); });
        H.on("updateChatMessage", (m, _changes, _options, userId) => { if (m?.id === watch) note("update", { by: userId, record: recordOf() }); });
        H.on("userConnected", (u, active) => note("userConnected", { user: u?.name ?? null, active }));
        H.on("bythebooks.moment", p => {
          try { if (JSON.stringify(p).includes(watch)) note("moment", { what: p?.kind ?? null, event: p?.event ?? null }); }
          catch { /* a counter never reaches the moment it counts */ }
        });
      }
      const s = stateOf();
      if (s) {
        rec.samples++;
        const k = `${s.elect}|${s.self}|${s.lead}`;
        if (k !== last) { last = k; note("state", s); }
      }
    } catch { /* the page is still loading */ }
  };
  rec.timer = setInterval(tick, 5);
}

/** X's timeline and its window id, read once the cycle settles. */
async function collectX({ mod }) {
  const rec = window.__mgpX ?? null;
  if (rec?.timer) clearInterval(rec.timer);
  let windowId = null;
  let isActive = null;
  try {
    const core = await import(`/modules/${mod}/scripts/core.js`);
    windowId = core.WINDOW_ID;
    isActive = core.isActiveGM();
  } catch { /* the module did not load */ }
  return { rec: rec ? { nav: rec.nav, events: rec.events, samples: rec.samples } : null, windowId, isActive, self: game.user?.name ?? null };
}


/* ─── node side ─── */

/** Hang X up the way a closed window goes (its lead flag already cleared, unless --keep-lead). */
const hangUp = xf => hangUpGm(xf, { asWindow: false });

/** Step intervals `[a, b]` where the sampled value is true, between `from` and `to`. */
function trueIntervals(points, from, to) {
  const out = [];
  let open = null;
  for (const [t, v] of points) {
    const at = Math.max(t, from);
    if (v && (open === null)) open = at;
    if (!v && (open !== null)) { if (at > open) out.push([open, at]); open = null; }
  }
  if ((open !== null) && (to > open)) out.push([open, to]);
  return out.filter(([a, b]) => (b > a) && (a < to));
}
const intersect = (A, B) => {
  const out = [];
  for (const [a1, b1] of A) for (const [a2, b2] of B) { const a = Math.max(a1, a2); const b = Math.min(b1, b2); if (b > a) out.push([a, b]); }
  return out;
};
const measure = I => I.reduce((n, [a, b]) => n + (b - a), 0);
/** How long, within `[from, to]`, neither interval list is true. */
function neither(A, B, from, to) {
  if (!(to > from)) return 0;
  const cuts = [...A, ...B].map(([a, b]) => [Math.max(a, from), Math.min(b, to)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let covered = 0;
  let edge = from;
  for (const [a, b] of cuts) {
    if (b <= edge) continue;
    covered += b - Math.max(a, edge);
    edge = b;
  }
  return (to - from) - covered;
}

/** A record write that claims its landing: the stamp `{ by, window, at }` (core.js `claimStamp`), or a claim written before it. */
const isClaim = a => (a === true) || (!!a && (typeof a === "object") && (("at" in a) || ("by" in a) || ("window" in a)));

/** One cycle's numbers, from both pages' logs. */
function analyse({ row, i, offset, tStart, connect, attached, ws, xs, clean }) {
  const name = id => ws.users?.[id] ?? id;
  const act = ws.act;
  const rel = t => (Number.isFinite(t) && Number.isFinite(act)) ? (t - act) : null;
  const xEv = xs?.rec?.events ?? [];
  const xFirst = kind => xEv.find(e => e.kind === kind) ?? null;
  const xSetup = xFirst("setup");
  const xReady = xFirst("ready");
  const claims = ws.events.filter(e => (e.kind === "update") && isClaim(e.applying))
    .map(e => ({ by: name(e.by), x: e.by === row.x.id, at: rel(e.t), sinceFire: Number.isFinite(ws.fired) ? (e.t - ws.fired) : null }));
  const tokens = ws.events.filter(e => e.kind === "token");
  const companions = ws.events.filter(e => (e.kind === "effect") && e.companion);
  const moments = { w: ws.events.filter(e => e.kind === "moment").length, x: xEv.filter(e => e.kind === "moment").length };
  const messages = ws.events.filter(e => e.kind === "message").length;
  const end = ws.collectedAt;
  const wTrue = trueIntervals(ws.wSamples.map(s => [s.t, s.active]), ws.armedAt, end);
  const xActive = s => !!s && s.self && (!s.lead || (s.lead === xs?.windowId));
  const xPoints = xEv.filter(e => (e.kind === "state") || ((e.kind === "setup") && e.state))
    .map(e => [e.t, xActive(e.kind === "setup" ? e.state : e)]).sort((a, b) => a[0] - b[0]);
  const xTrue = xPoints.length ? trueIntervals(xPoints, xPoints[0][0], end) : [];
  const overlapMs = measure(intersect(wTrue, xTrue));
  const gapMs = Number.isFinite(act) ? neither(wTrue, xTrue, act, end) : null;
  const fireRel = rel(ws.fired);
  const phase = !Number.isFinite(fireRel) ? "unfired"
    : (fireRel < 0) ? "pre"
      : (!xSetup || (ws.fired < xSetup.t)) ? "boot"
        : (!xReady || (ws.fired < xReady.t)) ? "setup" : "ready";
  const snap = xSetup?.record ?? null;
  // Who wrote the record after the fire (the fire's own write excluded): one client per landing. A second
  // claim from a stale view may not reach the diff (the stored value is already true), so the tokens and the
  // companion effects, one create per landing, are counted beside it.
  const fireWrite = ws.events.find(e => (e.kind === "update") && (e.status === "placed"));
  const writers = [...new Set(ws.events.filter(e => (e.kind === "update") && (e !== fireWrite) && (e.t >= (ws.fired ?? 0))).map(e => name(e.by)))];
  const landings = Math.max(claims.length, tokens.length, companions.length);
  const doubled = (landings > 1) || (writers.length > 1);
  // A hang-up: X's claim, then W's over it once X is gone; what stands is what counts, X's leavings removed.
  const gone = tokens.filter(e => e.by === row.x.id).map(e => e.id);
  const removed = ws.events.filter(e => (e.kind === "token-gone") && gone.includes(e.id) && (e.by !== row.x.id)).length;
  const xi = claims.findIndex(k => k.x);
  const reclaim = (xi >= 0) ? (claims.slice(xi + 1).find(k => !k.x) ?? null) : null;
  const deactAt = ws.events.find(e => e.kind === "deact")?.t ?? null;
  const hang = row.hang ? {
    stall: row.hang, xClaimed: xi >= 0, wReclaimed: !!reclaim,
    xGoneRel: rel(deactAt), reclaimAfterGone: (reclaim && Number.isFinite(deactAt)) ? (reclaim.at - rel(deactAt)) : null,
    xTokens: gone.length, removedByW: removed, standingTokens: ws.standing?.tokens ?? null, standingEffects: ws.standing?.companionEffects ?? null,
    lastWriter: name([...ws.events].reverse().find(e => e.kind === "update")?.by ?? null)
  } : null;
  if (hang) hang.landedOnce = !!ws.final?.applied && (ws.final.outcome === "landed") && (ws.final.landed === 1) && hang.xClaimed && hang.wReclaimed
    && (hang.standingTokens === 1) && (hang.standingEffects === 1) && (hang.removedByW === hang.xTokens) && (hang.lastWriter === row.w.user);
  return {
    ordering: row.name, cycle: i + 1, offset, w: row.w.user, x: row.x.user,
    connectMs: Number.isFinite(act) ? act - tStart : null, xConnected: connect.ok, xError: connect.ok ? null : connect.err, xTimeline: attached && !!xs?.rec,
    fireRel, fireHow: ws.fireHow, fireError: ws.fireError, phase,
    xSetupRel: rel(xSetup?.t), xReadyRel: rel(xReady?.t), xSnapshot: snap,
    // the snapshot path: X claimed during its setup, before its `ready` (ui.js's snapshot guard defers it to `ready`)
    xClaimBeforeReady: claims.some(k => k.x && Number.isFinite(k.at) && Number.isFinite(rel(xReady?.t)) && (k.at < rel(xReady.t))), xRenders: xEv.filter(e => e.kind === "render").map(e => ({ at: rel(e.t), record: e.record, self: e.state?.self ?? null })),
    claims, writers, landings, tokens: tokens.length, tokensBy: tokens.map(e => name(e.by)), companionEffects: companions.length, moments, messages,
    final: ws.final, doubled, landed: !!ws.final?.applied && (ws.final.outcome === "landed"),
    overlapMs, gapMs, wElect: ws.wSamples.map(s => ({ at: rel(s.t), active: s.active, elect: s.elect })),
    xElect: xPoints.map(([t, v]) => ({ at: rel(t), active: v })),
    recordWrites: ws.events.filter(e => e.kind === "update").map(e => ({ at: rel(e.t), by: name(e.by), status: e.status, applying: e.applying, applied: e.applied })),
    leadCleared: ws.leadCleared, replaces: ws.replaces, clean, hang
  };
}

/** Which identities play W and X in each ordering, from the world's own users (their roles and ids). */
function planOrderings(ids) {
  const live = ids.filter(i => i.exists);
  const ofRole = role => live.filter(i => i.role === role);
  const gm = ofRole(4).find(i => i.key === "gm2") ?? ofRole(4)[0] ?? null;
  const asst = ofRole(3).find(i => i.key === "assistant") ?? ofRole(3)[0] ?? null;
  const pairOf = role => { const of = ofRole(role); return (of.length >= 2) ? of.slice(0, 2) : null; };
  const pair = pairOf(4) ?? pairOf(3);
  const byId = pair ? [...pair].sort((a, b) => (a.id < b.id ? -1 : 1)) : null;   // the lower id leads a tie
  const why = { gm: "no Gamemaster-role identity in the world (FOUNDRY_GM2_USER, created by a Gamemaster)",
    asst: "no Assistant GM-role identity in the world (FOUNDRY_ASSISTANT_USER; tools/seed-gm-identities.mjs)",
    pair: "no two identities of one role in the world" };
  return {
    "full-assistant": (gm && asst) ? { w: gm, x: asst } : { skip: !gm ? why.gm : why.asst },
    "assistant-full": (gm && asst) ? { w: asst, x: gm } : { skip: !gm ? why.gm : why.asst },
    "same-stays": byId ? { w: byId[0], x: byId[1] } : { skip: why.pair },
    "same-moves": byId ? { w: byId[1], x: byId[0] } : { skip: why.pair },
    "hangup-claim": byId ? { w: byId[1], x: byId[0], hang: HANG["hangup-claim"] } : { skip: why.pair },
    "hangup-landing": byId ? { w: byId[1], x: byId[0], hang: HANG["hangup-landing"] } : { skip: why.pair }
  };
}

const env = loadEnv();
const deadline = Date.now() + (watchdogMin * 60_000);
const remaining = () => Math.max(60_000, deadline - Date.now());
const runStart = Date.now();
let w = null;
let wKey = null;
let xf = null;
const results = [];
const allTokens = new Set();
const notes = [];

/** W, joined as `key` through the harness (lock, watchdog, the declared-set preflight), with the page side installed. */
async function connectW(key) {
  if (w && (wKey === key)) return;
  if (w) { await w.dispose(); w = null; wKey = null; }
  w = await connectSuite({ tag: TAG, watchdogMs: remaining(), identity: key, env });
  wKey = key;
  const inst = await w.evaluate(installW, { mod: MOD, casterName: CASTER, rangeName: RANGE });
  if (inst?.fatal) throw new Error(inst.fatal);
}

/** The GM users connected as W sees them; waits out the previous X, refuses a stranger. */
async function waitAlone(row) {
  const until = Date.now() + 20_000;
  for (;;) {
    const gms = await w.evaluate(() => game.users.filter(u => u.active && u.isGM).map(u => ({ name: u.name, id: u.id, self: u.isSelf })), null);
    const others = gms.filter(g => !g.self);
    const strangers = others.filter(g => g.id !== row.x.id);
    if (strangers.length) throw new Error(`another GM-capable client joined: ${strangers.map(g => g.name).join(", ")} — stopping (nobody is evicted)`);
    if (!others.length) return;
    if (Date.now() > until) throw new Error(`"${others.map(g => g.name).join(", ")}" is still connected 20 s after its hang-up`);
    await sleep(250);
  }
}

/** Wait for the planned fire, at most `ms`; one that never came (W never heard X connect) is made now, marked `fallback`. */
async function awaitFire(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const s = await w.evaluate(() => globalThis.__mgp.status(), null);
    if (s.fired) return;
    await sleep(100);
  }
  await w.evaluate(() => globalThis.__mgp.fire("fallback"), null);
}

/** Wait for the record to land and the world to go quiet (2.5 s with no write), at most `ms`. */
async function settle(ms) {
  const until = Date.now() + ms;
  let s = null;
  while (Date.now() < until) {
    s = await w.evaluate(() => globalThis.__mgp.status(), null);
    if (s.fired && s.applied && ((s.now - s.lastEventAt) >= 2500)) return { settled: true, ...s };
    await sleep(250);
  }
  return { settled: false, ...(s ?? {}) };
}

async function runCycle(row, i, offset, connectTimes) {
  await waitAlone(row);
  const armed = await w.evaluate(p => globalThis.__mgp.arm(p), { cycle: i, xUserId: row.x.id, clearLead: !keepLead });
  if (armed?.error) return { ordering: row.name, cycle: i + 1, offset, error: `arm: ${armed.error}` };
  xf = new Foundry(gmConfig(env, row.x.key), X_LOG);
  const tStart = Date.now();
  const connecting = xf.connect().then(() => ({ ok: true }), err => ({ ok: false, err: String(err?.message ?? err) }));
  const attaching = attachInit(xf, xInit, { mod: MOD, messageId: armed.messageId });
  const aimed = median(connectTimes) ?? 3000;
  await w.evaluate(p => globalThis.__mgp.plan(p), (offset >= 0) ? { offset } : { offset, absoluteAt: tStart + aimed + offset });
  const attached = await attaching;
  const c = await race(connecting, 120_000);
  const connect = c.settled ? c.value : { ok: false, err: "the connect did not finish in 120 s" };
  await awaitFire(connect.ok ? Math.max(15_000, offset + 10_000) : 0);
  const settled = await settle(connect.ok ? 30_000 : 15_000);
  const ws = await w.evaluate(() => globalThis.__mgp.collect(), null);
  for (const e of ws.events) if (e.kind === "token") allTokens.add(e.id);
  let xs = null;
  if (connect.ok) {
    xs = await xf.evaluate(collectX, { mod: MOD }).catch(err => ({ error: String(err?.message ?? err) }));
    if (!keepLead) await xf.evaluate(closeLikeAWindow, { mod: MOD }).catch(() => {});
  }
  await hangUp(xf);
  xf = null;
  await waitAlone(row);
  const clean = await w.evaluate(() => globalThis.__mgp.cleanup(), null);
  if (!clean.clean) notes.push(`${row.name} cycle ${i + 1}: the cleanup left ${JSON.stringify(clean.left)}`);
  const out = analyse({ row, i, offset, tStart, connect, attached, ws, xs, clean });
  out.settled = settled.settled;
  if (Number.isFinite(out.connectMs)) connectTimes.push(out.connectMs);
  return out;
}

/** Poll W until `test(status)` holds, at most `ms`; the last status either way. */
async function statusUntil(test, ms) {
  const until = Date.now() + ms;
  let s = null;
  while (Date.now() < until) {
    s = await w.evaluate(() => globalThis.__mgp.status(), null);
    if (test(s)) return { ok: true, ...s };
    await sleep(50);
  }
  return { ok: false, ...(s ?? {}) };
}

/**
 * ONE HANG-UP CYCLE: X joins with its landing stalled, W answers once X is ready, X claims, and X's browser is
 * closed under its page the moment W sees the claim (and, for hangup-landing, X's token); then W, alone and the
 * elect again, re-drives the record.
 */
async function runHangCycle(row, i) {
  await waitAlone(row);
  const armed = await w.evaluate(p => globalThis.__mgp.arm(p), { cycle: i, xUserId: row.x.id, clearLead: true });
  if (armed?.error) return { ordering: row.name, cycle: i + 1, offset: null, error: `arm: ${armed.error}` };
  xf = new Foundry(gmConfig(env, row.x.key), X_LOG);
  const tStart = Date.now();
  const connecting = xf.connect().then(() => ({ ok: true }), err => ({ ok: false, err: String(err?.message ?? err) }));
  const attached = await attachInit(xf, xInit, { mod: MOD, messageId: armed.messageId, stall: row.hang });
  await w.evaluate(p => globalThis.__mgp.plan(p), { manual: true });
  const c = await race(connecting, 120_000);
  const connect = c.settled ? c.value : { ok: false, err: "the connect did not finish in 120 s" };
  let xs = null;
  let stalled = null;
  if (connect.ok) {
    await w.evaluate(() => globalThis.__mgp.fire("after-ready"), null);
    stalled = await statusUntil(s => s.xClaimAt && ((row.hang !== "effect") || s.xTokenAt), 30_000);
    xs = await xf.evaluate(collectX, { mod: MOD }).catch(err => ({ error: String(err?.message ?? err) }));
  }
  await dropDead(xf);
  xf = null;
  const settled = await settle(45_000);
  const ws = await w.evaluate(() => globalThis.__mgp.collect(), null);
  for (const e of ws.events) if (e.kind === "token") allTokens.add(e.id);
  await waitAlone(row);
  const clean = await w.evaluate(() => globalThis.__mgp.cleanup(), null);
  if (!clean.clean) notes.push(`${row.name} cycle ${i + 1}: the cleanup left ${JSON.stringify(clean.left)}`);
  const out = analyse({ row, i, offset: null, tStart, connect, attached, ws, xs, clean });
  out.settled = settled.settled;
  out.stalledInTime = !!stalled?.ok;
  return out;
}

function lineOf(r) {
  if (r.error) return `  ${String(r.cycle).padStart(2)} ${String(r.offset).padStart(5)} ms  ERROR ${r.error}`;
  if (r.hang) {
    const h = r.hang;
    return `  ${String(r.cycle).padStart(2)}  stall ${h.stall.padEnd(6)}  claims ${r.claims.map(c => c.x ? "X" : "W").join(" ") || "none"}`
      + `  X gone at ${h.xGoneRel ?? "—"} ms, W re-claimed ${h.reclaimAfterGone ?? "—"} ms after  X's tokens ${h.xTokens} removed ${h.removedByW}`
      + `  standing tokens ${h.standingTokens} effects ${h.standingEffects}  last writer ${h.lastWriter ?? "—"}`
      + `${h.landedOnce ? "  landed once" : "  ⚠ NOT LANDED ONCE"}${r.stalledInTime ? "" : "  ⚠ X never claimed in 30 s"}`;
  }
  const claims = r.claims.map(c => `${c.x ? "X" : "W"}${Number.isFinite(c.sinceFire) ? `+${c.sinceFire}` : ""}`).join(" ") || "none";
  return `  ${String(r.cycle).padStart(2)} ${String(r.offset).padStart(5)} ms  fired ${String(r.fireRel ?? "—").padStart(6)} (${r.phase.padEnd(5)})`
    + `  claims ${claims.padEnd(14)} writers ${r.writers.join("+") || "none"}  tokens ${r.tokens} effects ${r.companionEffects} moments ${r.moments.w}+${r.moments.x}`
    + `  overlap ${r.overlapMs} ms gap ${r.gapMs ?? "—"} ms  X setup ${r.xSetupRel ?? "—"} ready ${r.xReadyRel ?? "—"}`
    + `${r.doubled ? "  ⚠ DOUBLED" : ""}${r.landed ? "" : `  ⚠ NOT LANDED (${r.final?.status ?? "no record"}${r.final?.applying ? ", applying" : ""})`}`;
}

/** The table: one row per ordering. */
function summary(rows, plan) {
  const out = [];
  out.push("");
  out.push("| Ordering | W → X | Cycles | Fired pre / boot / setup / ready | Landed once | Doubled | Not landed | Claims by W / X | Overlap > 0 (max ms) | Gap median / max ms | Fire → claim median ms (pre / boot / setup / ready) | X connect → setup / ready median ms |");
  out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [name, p] of Object.entries(plan)) {
    if (HANG[name]) continue;
    if (p.skip) { out.push(`| ${name} | — | skipped: ${p.skip} | | | | | | | | | |`); continue; }
    const rs = rows.filter(r => (r.ordering === name) && !r.error);
    if (!rs.length) { out.push(`| ${name} | ${p.w.user} → ${p.x.user} | 0 measured | | | | | | | | | |`); continue; }
    const by = ph => rs.filter(r => r.phase === ph);
    const latency = ph => median(by(ph).map(r => r.claims[0]?.sinceFire));
    const overl = rs.filter(r => r.overlapMs > 0);
    out.push(`| ${name} | ${p.w.user} (${p.w.role}) → ${p.x.user} (${p.x.role}) | ${rs.length} | ${["pre", "boot", "setup", "ready"].map(ph => by(ph).length).join(" / ")}`
      + ` | ${rs.filter(r => r.landed && !r.doubled).length} | ${rs.filter(r => r.doubled).length} | ${rs.filter(r => !r.landed).length}`
      + ` | ${rs.reduce((n, r) => n + r.claims.filter(c => !c.x).length, 0)} / ${rs.reduce((n, r) => n + r.claims.filter(c => c.x).length, 0)}`
      + ` | ${overl.length} (${Math.max(0, ...rs.map(r => r.overlapMs))})`
      + ` | ${median(rs.map(r => r.gapMs)) ?? "—"} / ${Math.max(0, ...rs.map(r => r.gapMs ?? 0))}`
      + ` | ${["pre", "boot", "setup", "ready"].map(ph => latency(ph) ?? "—").join(" / ")}`
      + ` | ${median(rs.map(r => r.xSetupRel)) ?? "—"} / ${median(rs.map(r => r.xReadyRel)) ?? "—"} |`);
  }
  const early = rows.filter(r => !r.error && !r.hang && r.xClaimBeforeReady);
  out.push("");
  out.push(`X claimed before its own ready (the snapshot path): ${early.length} cycle(s)${early.length ? ` — ${early.map(r => `${r.ordering} ${r.cycle}`).join(", ")}` : ""}`);
  if (Object.keys(plan).some(k => HANG[k])) {
    out.push("");
    out.push("| Ordering | W → X | Cycles | Landed once by W | Not landed once | X's claim, then W's | W re-claim after X gone, median / max ms | X's tokens / removed by W | Standing tokens / effects |");
    out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const [name, p] of Object.entries(plan)) {
      if (!HANG[name]) continue;
      if (p.skip) { out.push(`| ${name} | — | skipped: ${p.skip} | | | | | | |`); continue; }
      const rs = rows.filter(r => (r.ordering === name) && !r.error && r.hang);
      const after = rs.map(r => r.hang.reclaimAfterGone).filter(Number.isFinite);
      out.push(`| ${name} | ${p.w.user} (${p.w.role}) → ${p.x.user} (${p.x.role}) | ${rs.length} | ${rs.filter(r => r.hang.landedOnce).length}`
        + ` | ${rs.filter(r => !r.hang.landedOnce).length} | ${rs.filter(r => r.hang.xClaimed && r.hang.wReclaimed).length}`
        + ` | ${median(after) ?? "—"} / ${after.length ? Math.max(...after) : "—"}`
        + ` | ${rs.reduce((n, r) => n + r.hang.xTokens, 0)} / ${rs.reduce((n, r) => n + r.hang.removedByW, 0)}`
        + ` | ${rs.map(r => `${r.hang.standingTokens}/${r.hang.standingEffects}`).join(", ")} |`);
    }
  }
  return out.join("\n");
}

let plan = null;
let failed = false;
try {
  await connectW("suite");
  const census = await w.evaluate(want => want.map(i => {
    const u = game.users.getName(i.user);
    return { ...i, exists: !!u, role: u?.role ?? null, id: u?.id ?? null };
  }), GM_CLIENTS.map(key => gmIdentity(env, key)).filter(Boolean).map(i => ({ key: i.key, user: i.user, wantRole: i.role })));
  console.log(`[${TAG}] the identities: ${census.map(i => `${i.key} "${i.user}" ${i.exists ? `role ${i.role}, id ${i.id}` : "NOT A WORLD USER"}`).join("; ")}`);
  for (const i of census) if (i.exists && (i.wantRole !== null) && (i.role !== i.wantRole)) console.warn(`[${TAG}] ⚠ ${i.key} "${i.user}" holds role ${i.role}, not ${i.wantRole}`);
  plan = planOrderings(census);
  for (const name of Object.keys(plan)) if (!asked.includes(name)) plan[name] = { skip: "not asked (--orderings)" };
  for (const [name, p] of Object.entries(plan)) {
    console.log(`[${TAG}] ${name}: ${p.skip ? `skipped — ${p.skip}` : `W "${p.w.user}" (role ${p.w.role}) on, X "${p.x.user}" (role ${p.x.role}) connecting`}`);
  }
  for (const [name, p] of Object.entries(plan)) {
    if (p.skip) continue;
    const row = { name, w: p.w, x: p.x, hang: p.hang ?? null };
    await connectW(p.w.key);
    console.log(`\n[${TAG}] ${name} — ${ORDERINGS[name]}; ${cycles} cycle(s)`);
    const connectTimes = [];
    for (let i = 0; i < cycles; i++) {
      const offset = offsetOf(i);
      let r;
      try { r = row.hang ? await runHangCycle(row, i) : await runCycle(row, i, offset, connectTimes); }
      catch (err) {
        r = { ordering: name, cycle: i + 1, offset, error: String(err?.message ?? err) };
        if (/another GM-capable client|would not hang up/.test(r.error)) { results.push(r); console.log(lineOf(r)); throw err; }
        // A cycle that broke midway: X hung up, then W alone puts the cycle's leavings away before the next one.
        if (xf) { await hangUp(xf).catch(e => notes.push(`${name} cycle ${i + 1}: ${e.message}`)); xf = null; }
        await waitAlone(row).catch(() => {});
        await w.evaluate(() => globalThis.__mgp?.cycle ? globalThis.__mgp.cleanup() : null, null).catch(() => {});
      }
      results.push(r);
      console.log(lineOf(r));
      if (r.error && (i === 0)) { notes.push(`${name}: the first cycle failed, the ordering stopped — ${r.error}`); break; }
    }
  }
} catch (err) {
  failed = true;
  console.error(`\n[${TAG}] STOPPED: ${err?.message ?? err}`);
} finally {
  if (xf) await hangUp(xf).catch(err => console.error(`[${TAG}] ${err.message}`));
  if (w) {
    const swept = await race(w.evaluate(p => globalThis.__mgp?.sweep?.(p) ?? [], { runStart, tokenIds: [...allTokens] }), 60_000);
    if (swept.settled) console.log(`[${TAG}] swept: ${(swept.value ?? []).join("; ") || "nothing left"}`);
    else console.warn(`[${TAG}] ⚠ the sweep did not finish: remove the lent Find Familiar, any Owl on the range and the imported Owl by hand`);
    await w.dispose();
  }
}

mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, JSON.stringify({ at: new Date().toISOString(), keepLead, offsets: Array.from({ length: cycles }, (_, i) => offsetOf(i)), plan, results, notes }, null, 2));
if (plan) console.log(summary(results, plan));
for (const n of notes) console.log(`  · ${n}`);
console.log(`\n[${TAG}] ${results.filter(r => !r.error).length} cycle(s) measured, ${results.filter(r => r.error).length} failed; written to ${jsonPath}`);
process.exit(failed ? 2 : (results.some(r => r.error) ? 1 : 0));
