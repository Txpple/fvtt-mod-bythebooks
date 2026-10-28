/**
 * The suite harness: env, watchdog, connect + preflight, section filtering, the hook and moment
 * ledgers, the contract recorder, teardown and the one reporter (ARCHITECTURE §11 *Adding a TEST*).
 * ⚠ `f.evaluate()` serializes its function, so a helper a suite body needs is the prelude's
 * (tools/prelude.mjs, installed on the page at connect) or travels as DATA on the evaluate argument
 * (`sectionArg`).
 * `--section 3[,5]` runs those sections plus their dependencies; `--list` prints the table.
 * Setup and teardown always run. ⚠ A filtered run's summary is stamped PARTIAL.
 * ⚠ Flags are STRICT (#11): an argument a suite does not know prints the usage and exits 2 before
 * anything connects, because `--help` once started a full battery against the world.
 * The watchdog names the phase it fired in, kills the headless browser and exits 3 (#12); a
 * heartbeat every 30 s says a long `evaluate` is alive and whether the page still answers.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Foundry, loadEnv } from "fvtt-mcp-dnd5e/client";
import { strictArgs } from "./args.mjs";
import { armContractRecorder, dumpContractRecording } from "./contract-recorder.mjs";
import { installPrelude } from "./prelude.mjs";
import { declaredGmClients, foundryConfig, gmIdentity, preflightSoleGM } from "./target.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));

/** Where a suite leaves its hook ledger for `hook-coverage.mjs` to union. */
export const LEDGER_DIR = join(REPO, "dist", "hook-ledger");

/** The MCP repo's `.env` through its own reader. */
export { loadEnv };

/** Section ids sort numeric-aware: `10` after `9`, `4a2` between `4` and `4b`. */
const bySectionId = (a, b) =>
  (Number.parseFloat(a) - Number.parseFloat(b)) || String(a).localeCompare(String(b));

/**
 * Expand a requested section set through a suite's dependency map (`{ 2: [1] }`: §2 asserts on
 * what §1 did, so asking for §2 runs §1 too).
 */
export function expandSections(requested, depends = {}) {
  if (!requested) return null;
  const out = new Set();
  const visit = id => {
    if (out.has(id)) return;
    out.add(id);
    for (const need of depends[id] ?? []) visit(String(need));
  };
  for (const id of requested) visit(String(id));
  return [...out].sort(bySectionId);
}

/**
 * Read `--section` / `--list` against a suite's `{ id: "title" }` table (STRING ids).
 * Returns `{ plan, pulled }`: plan null = run everything; pulled = sections a dependency dragged in.
 * ⚠ Strict: any other argument refuses the run (see `strictArgs`).
 */
export function sectionPlan(table, depends = {}, argv = process.argv.slice(2)) {
  const script = basename(process.argv[1] ?? "suite.mjs");
  const usage = `usage: node tools/${script} [--section <id>[,<id>…]] [--list]\n`
    + "  --section   run these sections (what they depend on is pulled in); the summary is stamped PARTIAL\n"
    + "  --list      print the section table and exit\n"
    + "  --help      this text\n"
    + "Any other argument is refused before the suite connects: a typo must never run a suite against the world.";
  const { values } = strictArgs({
    options: { section: { type: "string" }, list: { type: "boolean" } },
    usage, argv, script
  });
  if (values.list) {
    console.log("Sections:");
    // ⚠ Sorted: JS hoists integer-like keys ahead of `'4a2'`-style ones.
    for (const [id, title] of Object.entries(table).sort(([a], [b]) => bySectionId(a, b))) {
      const needs = depends[id]?.length ? `  (needs ${depends[id].join(", ")})` : "";
      console.log(`  ${String(id).padEnd(5)} ${title}${needs}`);
    }
    process.exit(0);
  }
  if (!values.section) return { plan: null, pulled: [] };
  const asked = String(values.section).split(",").map(s => s.trim()).filter(Boolean);
  const unknown = asked.filter(id => !(id in table));
  if (unknown.length) {
    console.error(`--section: no such section ${unknown.join(", ")}. Try --list.`);
    process.exit(2);
  }
  const plan = expandSections(asked, depends);
  return { plan, pulled: plan.filter(id => !asked.includes(id)) };
}

/**
 * The argument every filtered `f.evaluate()` takes: the plan and titles as DATA (the closure
 * cannot import `want()`), so a skipped section names itself. `extra` is the suite's own argument.
 */
export function sectionArg(plan, titles = {}, extra = null) {
  return { sections: plan, titles, ...(extra ? { extra } : {}) };
}

/**
 * One suite at a time. ⚠ Two suites on one box both join as the suite identity, and the preflight
 * counts users, not sockets, so it passes and the runs fight over settings and fixtures.
 * A pid file held by a LIVE pid refuses the second run; a stale lock is taken over and reported.
 */
function takeSuiteLock(tag) {
  const lock = join(tmpdir(), `bf-suite-${process.env.BTB_HOST || process.env.BF_HOST || "local"}.lock`);
  let held = null;
  try { held = JSON.parse(readFileSync(lock, "utf8")); } catch { /* no lock, or unreadable */ }
  if (held?.pid) {
    let alive = false;
    try { process.kill(held.pid, 0); alive = true; } catch { /* gone */ }
    if (alive && (held.pid !== process.pid)) {
      console.error(`[${tag}] REFUSING TO START: "${held.tag}" is already running against this `
        + `world (pid ${held.pid}, since ${held.started}). Two suites on one box share the `
        + `elect and fight over settings — and the sole-GM preflight cannot see it, because `
        + `both join as the same user. Wait for it, or kill that pid.`);
      process.exit(4);
    }
    if (!alive) console.warn(`[${tag}] taking over a stale lock from "${held.tag}" (pid ${held.pid}, `
      + `${held.started}) — that run died without tearing down, so the world may be dirty.`);
  }
  writeFileSync(lock, JSON.stringify({ tag, pid: process.pid, started: new Date().toISOString() }));
  const release = () => { try { rmSync(lock, { force: true }); } catch { /* best effort */ } };
  process.on("exit", release);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => { release(); process.exit(130); });
  }
}

/* ─── The hook ledger (ARCHITECTURE §10 D11): which hook NAMES actually dispatch during a run.
 * It wraps dispatch, not the module's callbacks, so it never replaces live function identities
 * in `Hooks.events`. ⚠ `Hooks.call` stops at the first handler returning false (e.g.
 * `dnd5e.preApplyDamage`), so "fired" means every listener ran only for `callAll`. */

/** Page side: closes over nothing (serialized by `evaluate`). */
const installLedger = () => {
  if (globalThis.__bfHookLedger) return "already";
  const ledger = Object.create(null);
  for (const name of ["call", "callAll"]) {
    const orig = Hooks[name];
    if (typeof orig !== "function") return `no Hooks.${name}`;
    // Transparent: same `this`, args and return; counts before dispatch so a throwing handler still counts.
    Hooks[name] = function (hook, ...args) {
      ledger[hook] = (ledger[hook] ?? 0) + 1;
      return orig.call(this, hook, ...args);
    };
  }
  globalThis.__bfHookLedger = ledger;
  return "installed";
};

/**
 * The moment ledger: counts `bythebooks.moment` by `kind` (and `event`) for tools/claim-proof.mjs.
 * A listener, not a wrapper. ⚠ It hears this client only (a moment publishes on the writing
 * client), so it under-reports, never over.
 */
const installMomentLedger = () => {
  if (globalThis.__bfMomentLedger) return "already";
  if (typeof Hooks?.on !== "function") return "no Hooks.on";
  const ledger = { total: 0, kinds: Object.create(null), events: Object.create(null), unkeyed: 0 };
  Hooks.on("bythebooks.moment", payload => {
    try {
      ledger.total++;
      if (payload?.kind) ledger.kinds[payload.kind] = (ledger.kinds[payload.kind] ?? 0) + 1;
      else ledger.unkeyed++;
      if (payload?.event) ledger.events[payload.event] = (ledger.events[payload.event] ?? 0) + 1;
    } catch { /* a counter never reaches the moment it counts */ }
  });
  globalThis.__bfMomentLedger = ledger;
  return "installed";
};

/**
 * Read the page's ledgers into LEDGER_DIR for `hook-coverage.mjs`.
 * ⚠ A failure writes nothing: an under-reporting file would name live handlers dead. `moments`
 * is written only when armed; an absent key reads as NOT MEASURED, an empty `{}` as "none published".
 */
export async function dumpHookLedger(tag, f) {
  try {
    const { ledger, moments } = await f.evaluate(() => {
      const m = globalThis.__bfMomentLedger;
      return {
        ledger: { ...(globalThis.__bfHookLedger ?? {}) },
        moments: m ? { total: m.total, unkeyed: m.unkeyed, kinds: { ...m.kinds }, events: { ...m.events } } : null
      };
    }, null);
    const fired = Object.keys(ledger).length;
    if (!fired) { console.warn(`[${tag}] hook ledger EMPTY — not written`); return; }
    mkdirSync(LEDGER_DIR, { recursive: true });
    writeFileSync(join(LEDGER_DIR, `${tag}.json`),
      JSON.stringify({ tag, at: new Date().toISOString(), ledger, ...(moments ? { moments } : {}) }, null, 2));
    console.log(`[${tag}] hook ledger: ${fired} distinct hooks fired`
      + (moments ? `; moment ledger: ${moments.total} published, ${Object.keys(moments.kinds).length} kind(s)`
        : "; moment ledger NOT armed — its claims will read NOT MEASURED"));
  } catch (err) {
    console.warn(`[${tag}] hook ledger NOT captured — ${err.message}`);
  }
}

/** How long a teardown may take before it is abandoned to process exit. */
const DISPOSE_CEILING_MS = 10_000;

/** How long one teardown step (the cover flags, the ledger dump) may take before the next runs. */
const TEARDOWN_STEP_CEILING_MS = 20_000;

/** A promise raced against a ceiling: `{ settled, value }`; the loser is left running, named. */
async function withCeiling(promise, ms) {
  let settled = false;
  let value;
  let timer;
  await Promise.race([
    promise.then(v => { settled = true; value = v; }),
    new Promise(r => { timer = setTimeout(r, ms); })
  ]);
  clearTimeout(timer);
  return { settled, value };
}

/**
 * End every process this one spawned: the headless browser (a direct child of this node) and its
 * renderers. For a watchdog or a hung dispose that cannot wait for `browser.close()`. ⚠ Playwright's
 * own exit hook did not do this on 2026-10-10: a chrome-headless-shell outlived its script by an
 * hour and kept the sandbox's GM seat (#12). Synchronous, so it works inside an exit path.
 */
export function killChildProcesses(tag) {
  const pid = String(process.pid);
  const list = r => (r.stdout ?? "").split(/\s+/).filter(k => /^\d+$/.test(k));
  try {
    let kids;
    if (process.platform === "win32") {
      kids = list(spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
        `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | Select-Object -ExpandProperty ProcessId`],
      { encoding: "utf8", timeout: 20_000 }));
      for (const k of kids) spawnSync("taskkill", ["/PID", k, "/T", "/F"], { stdio: "ignore", timeout: 20_000 });
    } else {
      kids = list(spawnSync("pgrep", ["-P", pid], { encoding: "utf8", timeout: 5_000 }));
      for (const k of kids) {
        spawnSync("pkill", ["-9", "-P", k], { stdio: "ignore", timeout: 5_000 });
        try { process.kill(Number(k), "SIGKILL"); } catch { /* already gone */ }
      }
    }
    if (kids.length) console.error(`[${tag}] killed ${kids.length} child process tree(s): pid ${kids.join(", ")}`);
    return kids.length;
  } catch (err) {
    console.error(`[${tag}] could not kill child processes — ${err.message}`);
    return -1;
  }
}

/**
 * `Foundry#dispose()` raced against a ceiling. ⚠ Never awaited bare: the watchdog hard-aborts
 * (exit 3), so a hanging dispose would turn a green run into an abort; after the ceiling the
 * browser is KILLED (#12: a close that never settles used to leave a chrome holding the seat).
 * `dispose` is the close to race: the bridge's own by default; the harness's teardown passes the
 * one it saved, since its `f.dispose` is the teardown itself.
 */
export async function disposeSafely(f, tag, dispose = f?.dispose?.bind(f)) {
  if (!dispose) return;
  const { settled } = await withCeiling(
    dispose().catch(err => { console.warn(`[${tag}] dispose() failed — ${err.message}`); }),
    DISPOSE_CEILING_MS);
  if (!settled) {
    console.warn(`[${tag}] dispose() did not finish in ${DISPOSE_CEILING_MS / 1000}s — killing the browser`);
    killChildProcesses(tag);
  }
  if (f) f.__bfDisposed = true;
}

/** In the page: translate the retired settings' reads and writes (see connectSuite). */
function retireSettings() {
  const MOD = "fvtt-mod-bythebooks";
  if ( game.settings._bfRetired ) return "installed";
  const TIMERS = new Set(["holdTimer", "damageTimer", "saveTimer", "concTimer", "noticeTimer"]);
  const WAS = { autoDamage: "all", diceWait: 0, measuredCover: true, autoApply: true, requireTarget: true,
    hideCardButtons: true, centerRollDialogs: true, reactionHold: true, holdSkipFutile: true, holdSettle: 8,
    holdApplyEffect: true, riders: true, effectRiders: true, masteryRiders: true, d20FoldAsk: true,
    volleys: true, emanations: true, concBreak: true, saves: true, castApply: true };
  const LISTS = ["interruptList", "blockList", "riderList", "riderUpgrades", "reminderList", "conditionList",
    "effectList", "clockRiderList", "hitMenuList", "emanationList", "damageShieldList", "spentAreaList",
    "chosenAreaList", "damageEitherList", "healRerollList", "kitTendList", "unarmedDiceList", "fightingStyleList",
    "initiativeSwapList", "tokenLightList", "tokenSenseList", "tokenSizeList", "dropToOneList", "restGrantList",
    "rebukeList", "cardChipList", "damageSaveList", "superiorityUseList", "effectChoiceList", "metamagicList",
    "maneuverFolds", "d20Folds"];
  const RETIRED = new Set([...TIMERS, "concMode", ...Object.keys(WAS), ...LISTS]);
  const settings = game.settings;
  const set = settings.set.bind(settings), get = settings.get.bind(settings);
  const registry = settings.settings;
  const has = registry.has.bind(registry);
  // A suite's "is this the new code" guard names a retired key: report it present.
  const isRetired = key => String(key).startsWith(`${MOD}.`) && RETIRED.has(String(key).slice(MOD.length + 1)) && !has(key);
  registry.has = key => has(key) || isRetired(key);
  // …and a retired key's registration reads as a stub carrying its old default ("" for a list).
  const registered = registry.get.bind(registry);
  registry.get = key => registered(key) ?? (isRetired(key) ? { key, default: WAS[String(key).slice(MOD.length + 1)] ?? "" } : undefined);
  const retired = (ns, key) => (ns === MOD) && RETIRED.has(key) && !has(`${MOD}.${key}`);
  settings.set = async (ns, key, value, options) => {
    if ( !retired(ns, key) ) return set(ns, key, value, options);
    if ( TIMERS.has(key) ) return set(MOD, "decisionTimer", value, options);
    if ( (key === "concMode") && (value !== "off") ) return set(MOD, "saveRolls", value, options);
    return value;
  };
  settings.get = (ns, key, options) => {
    if ( !retired(ns, key) ) return get(ns, key, options);
    if ( TIMERS.has(key) ) return get(MOD, "decisionTimer");
    if ( key === "concMode" ) return get(MOD, "saveRolls");
    return WAS[key];
  };
  settings._bfRetired = true;
  return "installed";
}

/** The heartbeat interval while an `evaluate` is in flight (#12: a slow run must look alive). */
const HEARTBEAT_MS = 30_000;

/**
 * The GM identities the running script declares (`GM_CLIENTS`, target.mjs `declaredGmClients`), read
 * from its own text; null when it declares none or its text cannot be read. A declaration naming an
 * unknown identity refuses the run before anything connects (exit 2).
 */
function declaredGmClientsOf(file, tag) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { return null; }
  try {
    return declaredGmClients(src);
  } catch (err) {
    console.error(`[${tag}] REFUSING TO START: ${err.message}`);
    process.exit(2);
  }
}

/**
 * Connect, preflight, arm the watchdog; returns the live `Foundry`. `watchdogMs` is per-suite
 * (measured wall clocks differ widely). ⚠ Armed BEFORE `connect()`: a launch that never
 * finishes is the hang it exists to break. When it fires it names the PHASE (connecting,
 * preflight, `evaluate #n`, teardown), kills the browser and exits 3 — whatever is pending.
 * While an `evaluate` runs longer than `heartbeatMs` a line every `heartbeatMs` says so, with the
 * world's message count and whether the page answered a concurrent peek within 5 s: a slow run
 * and a hung one no longer look the same.
 * SEVERAL GM CLIENTS: a script that holds more than one GM identity at once declares them,
 * `export const GM_CLIENTS = ["suite", "gm2", "assistant"]` beside its SECTIONS or COVERS
 * (target.mjs `GM_IDENTITIES`); the preflight then allows exactly those users. `identity` joins
 * this client as one of them (the suite identity by default); a script that names another
 * identity without declaring it is refused before anything connects.
 */
export async function connectSuite({ tag, watchdogMs, requireElect = true, allowBridge = false, env = loadEnv(), heartbeatMs = HEARTBEAT_MS, identity = "suite" }) {
  const gmClients = declaredGmClientsOf(process.argv[1], tag);
  if (identity !== "suite" && !gmClients?.includes(identity)) {
    console.error(`[${tag}] REFUSING TO START: it joins as the "${identity}" identity, which its GM_CLIENTS `
      + `does not declare (${gmClients ? gmClients.join(", ") : "no GM_CLIENTS"}).`);
    process.exit(2);
  }
  takeSuiteLock(tag);
  const started = Date.now();
  const elapsed = () => Math.round((Date.now() - started) / 1000);
  let stage = "connecting";
  let phase = stage;
  let f = null;
  setTimeout(() => {
    console.error(`[${tag}] WATCHDOG ${Math.round(watchdogMs / 1000)}s — hard abort while ${phase} (${elapsed()}s in)`);
    killChildProcesses(tag);
    if (f) f.__bfDisposed = true; // the exit sweep below has nothing left to do
    process.exit(3);
  }, watchdogMs);
  // ⚠ Whatever ends this process (an uncaught throw, `finish`, the watchdog) must not leave a
  // browser behind holding the GM seat: the kill is skipped only after a clean dispose.
  process.on("exit", () => { if (f && !f.__bfDisposed) killChildProcesses(tag); });
  f = new Foundry(foundryConfig(env, identity));
  console.log(`[${tag}] connecting…`);
  await f.connect();

  // The phase and the heartbeat ride every `evaluate` from here on (the peek uses the raw seam).
  const evaluate = f.evaluate.bind(f);
  let calls = 0;
  let inflight = null;
  f.evaluate = async (fn, arg) => {
    const n = ++calls;
    inflight = { n, since: Date.now() };
    phase = `${stage}: evaluate #${n}`;
    try { return await evaluate(fn, arg); }
    finally { if (inflight?.n === n) { inflight = null; phase = `${stage}: between evaluates (after #${n})`; } }
  };
  // Ticks every 5 s and prints once the evaluate has run `heartbeatMs`, then every `heartbeatMs`.
  let lastBeat = 0;
  const beat = setInterval(async () => {
    if (!inflight) return;
    const now = Date.now();
    if ((now - inflight.since < heartbeatMs) || (now - lastBeat < heartbeatMs)) return;
    lastBeat = now;
    const secs = Math.round((now - inflight.since) / 1000);
    let pulse;
    let peekTimer;
    try {
      const w = await Promise.race([
        evaluate(() => ({ messages: game.messages.size, combat: game.combat ? `round ${game.combat.round} turn ${game.combat.turn}` : "none", stage: window.__suiteStage ?? null }), null),
        new Promise((_, reject) => { peekTimer = setTimeout(() => reject(new Error("no answer in 5 s")), 5_000); })
      ]);
      pulse = `the page answers: ${w.messages} messages, combat ${w.combat}${w.stage ? `, stage ${w.stage}` : ""}`;
    } catch (err) {
      pulse = `⚠ the page did not answer (${err.message})`;
    } finally { clearTimeout(peekTimer); }
    console.log(`[${tag}] … ${phase} still running after ${secs}s — ${pulse}`);
  }, Math.min(heartbeatMs, 5_000));
  beat.unref();

  stage = "preflight";
  await preflightSoleGM(f, { requireElect, allowBridge, env, gmClients });
  stage = "baseline";

  // THE SEAT WATCH: the preflight sees a second GM-capable seat only at the start. One that joins mid-run (a
  // bridge another session opens for one call) outranks the suite identity by id, so the elect moves to it
  // and every elect-driven write in that window lands nowhere; `finish` turns the record into a failing
  // line that names the joiner, so the run's reds read as the seat's, not the module's.
  const ownSeats = [...(gmClients ?? ["suite"]).map(k => gmIdentity(env, k)?.user),
    ...(allowBridge ? [env?.FOUNDRY_USER ?? env?.LOCAL_FOUNDRY_USER] : [])].filter(Boolean);
  await f.evaluate(async allowed => {
    window.__btbSeats = [];
    Hooks.on("userConnected", (user, active) => {
      if (!user?.isGM || (user.id === game.user.id) || allowed.includes(user.name)) return;
      window.__btbSeats.push({ name: user.name, role: user.role, active: !!active, at: new Date().toISOString() });
    });
    return "installed";
  }, ownSeats).catch(e => console.warn(`[${tag}] seat watch not armed (${e.message})`));

  /**
   * ⚠ THE DOWNED LEFTOVERS, swept on every suite's connect: the module applies the downed conditions out of combat
   * too (dnd5e's own mapping), and the Prone rider OUTLIVES the heal, as written — so a fixture a previous suite
   * dropped and healed stands Prone, with Exhaustion from House Rules' going-down rule when a table has it on, and
   * death saves from a death save section. Every `BTB Test` actor goes back to standing: those three statuses
   * off, Exhaustion 0, death saves 0. Pools are each suite's own (reset-fixture-state fills the shared four).
   */
  if ( requireElect ) {
    const swept = await f.evaluate(async () => {
      const out = [];
      for ( const a of game.actors.filter(x => /^BTB Test /.test(x.name ?? "")) ) {
        const stale = a.effects.filter(e => ["prone", "unconscious", "dead"].some(s => e.statuses?.has?.(s)));
        const update = {};
        if ( Number(a.system?.attributes?.exhaustion ?? 0) ) update["system.attributes.exhaustion"] = 0;
        const death = a.system?.attributes?.death;
        if ( Number(death?.success ?? 0) || Number(death?.failure ?? 0) ) Object.assign(update, { "system.attributes.death.success": 0, "system.attributes.death.failure": 0 });
        if ( !stale.length && !Object.keys(update).length ) continue;
        if ( stale.length ) await a.deleteEmbeddedDocuments("ActiveEffect", stale.map(e => e.id)).catch(() => {});
        if ( Object.keys(update).length ) await a.update(update).catch(() => {});
        out.push(`${a.name}: ${stale.map(e => e.name).join(", ") || "no status"}${update["system.attributes.exhaustion"] !== undefined ? ", Exhaustion" : ""}${update["system.attributes.death.success"] !== undefined ? ", death saves" : ""}`);
      }
      return out;
    }, null);
    if ( swept.length ) console.log(`[${tag}] swept the downed leftovers — ${swept.join("; ")}`);
  }

  /**
   * ⚠ Client-scoped baseline: verify-settings pins WORLD keys only and the tester is a fresh
   * profile, so a client default change hits every suite. Suites run with silent auto-roll; the
   * sections that test the offer set it true and restore it. A hand-built second client (e.g.
   * check-popup-routing's player) skips this and must pin its own if it rolls damage.
   */
  await f.evaluate(async () =>
    game.settings.set("fvtt-mod-bythebooks", "playerRollDamage", false), null);

  /**
   * THE RETIRED SETTINGS: the module keeps ten settings, and the suites still write the rest. A
   * retired key is translated in the page: the five timers are the Decision Timer, the concentration
   * mode is Players Roll Their Own Saves, and a switch that is now always on is a no-op that reads
   * back its old default. A list setting reads back undefined: the tables are the only list.
   */
  await f.evaluate(retireSettings, null);

  // The prelude (tools/prelude.mjs): the waits and the bookkeeping every suite body reads off `window.__btb`.
  await installPrelude(f);

  /**
   * ⚠ Measured cover OFF for the run, restored at teardown: fixtures stand creatures in a row, so
   * cover would move hit/miss in unrelated sections. The lever is each scene's `noCover` flag, set
   * on every scene for the run; the section that tests cover clears it itself.
   */
  const coverScenes = await f.evaluate(async () => {
    // One batched write each way: a teardown cut off by the dispose ceiling once left the late scenes flagged.
    const flagged = game.scenes.filter(s => !s.getFlag("fvtt-mod-bythebooks", "noCover")).map(s => s.id);
    if ( flagged.length ) await Scene.updateDocuments(flagged.map(_id => ({ _id, "flags.fvtt-mod-bythebooks.noCover": true })));
    return flagged;
  }, null).catch(() => []);

  // ⚠ The ledger dump rides the teardown, not `finish()`: several suites never call `finish`.
  const install = await f.evaluate(installLedger, null).catch(e => `failed: ${e.message}`);
  if (install !== "installed") console.warn(`[${tag}] hook ledger not armed (${install})`);
  const moments = await f.evaluate(installMomentLedger, null).catch(e => `failed: ${e.message}`);
  if (moments !== "installed") console.warn(`[${tag}] moment ledger not armed (${moments})`);
  // What the run published, by shape, for tools/contracts.mjs (tools/contract-recorder.mjs).
  await armContractRecorder(f, tag);

  // One teardown under both names: suites call `disconnect`, `dispose` is the real one.
  // ⚠ Each step under a ceiling: a page that stopped answering must not hold the teardown
  // (and so the lock and the seat) past the browser kill at the end.
  // ⚠ The bridge's own close is saved BEFORE `f.dispose` becomes the teardown: called through
  // `f.dispose` it would be the teardown again, which returns at once, and the browser (and the
  // user's seat) would live until the process exits — a script that connects twice sees its
  // first client still on.
  const closeBridge = f.dispose.bind(f);
  let hungUp = false;
  const teardown = async () => {
    if (hungUp) return;
    hungUp = true;
    stage = "teardown";
    if ( coverScenes.length ) {
      const clear = f.evaluate(async ids => Scene.updateDocuments(ids.filter(id => game.scenes.has(id)).map(_id => ({ _id, "flags.fvtt-mod-bythebooks.-=noCover": null }))), coverScenes)
        .catch(e => console.warn(`[${tag}] the scenes' noCover flags not cleared (${e.message}) — run verify-settings --fix`));
      const { settled } = await withCeiling(clear, TEARDOWN_STEP_CEILING_MS);
      if (!settled) console.warn(`[${tag}] the noCover clear did not finish in ${TEARDOWN_STEP_CEILING_MS / 1000}s — run verify-settings --fix`);
    }
    const { settled } = await withCeiling(dumpHookLedger(tag, f), TEARDOWN_STEP_CEILING_MS);
    if (!settled) console.warn(`[${tag}] the hook ledger dump did not finish in ${TEARDOWN_STEP_CEILING_MS / 1000}s — not written`);
    const recorded = await withCeiling(dumpContractRecording(tag, f), TEARDOWN_STEP_CEILING_MS);
    if (!recorded.settled) console.warn(`[${tag}] the contract recording dump did not finish in ${TEARDOWN_STEP_CEILING_MS / 1000}s — not written`);
    await disposeSafely(f, tag, closeBridge);
  };
  f.disconnect = teardown;
  f.dispose = teardown;

  stage = "the run";
  console.log(`[${tag}] connected`);
  return f;
}

/** Announce the plan before the run, so a scrollback tells you what was actually exercised. */
export function announcePlan(tag, plan, pulled = []) {
  if (!plan) return;
  const because = pulled.length ? ` (${pulled.join(", ")} pulled in by a dependency)` : "";
  console.log(`[${tag}] PARTIAL RUN — sections ${plan.join(", ")}${because}`);
}

/**
 * The one reporter for `{ fatal, results, log, skips }`. ⚠ Failures print in the body with detail;
 * the summary stays last so a `| tail` is useful but never sufficient.
 */
export function report({ tag, out, plan = null }) {
  if (out?.fatal) {
    console.error(`\n[${tag}] FATAL: ${out.fatal}`);
    for (const r of out.results ?? []) console.log(`  ${r.pass ? "PASS" : "FAIL"} ${r.name}`);
    process.exit(2);
  }
  for (const l of out.log ?? []) console.log(`  · ${l}`);
  if (out.log?.length) console.log("");
  let failures = 0;
  for (const r of out.results ?? []) {
    if (!r.pass) failures++;
    console.log(`  ${r.pass ? "PASS" : "FAIL"} ${r.name}${r.detail ? `  [${r.detail}]` : ""}`);
  }
  for (const s of out.skips ?? []) console.log(`  SKIP ${s}`);
  if (out.consoleErrors?.length) {
    console.log("\n  CONSOLE ERRORS DURING THE RUN:");
    for (const e of out.consoleErrors) console.log(`   ⚠ ${e}`);
  }
  const total = out.results?.length ?? 0;
  const partial = plan ? `  ⚠ PARTIAL RUN — sections ${plan.join(", ")} only` : "";
  console.log(`\n[${tag}] ${total - failures}/${total} passed${partial}`);
  return failures;
}

/**
 * Report, hang up, and carry the verdict out as the exit code. ⚠ A FATAL hangs up too: `report`
 * exits on a fatal before any teardown, which left every scene's `noCover` flag set after the two
 * FATAL suites of the 2026-10-11 battery (the settings check read DRIFTED for a harness reason).
 */
export async function finish({ tag, out, plan = null, f = null }) {
  if (out?.fatal) {
    console.error(`\n[${tag}] FATAL: ${out.fatal}`);
    for (const r of out.results ?? []) console.log(`  ${r.pass ? "PASS" : "FAIL"} ${r.name}`);
    await f?.disconnect?.();
    process.exit(2);
  }
  const seats = await (f?.evaluate?.(async () => window.__btbSeats ?? [], null) ?? Promise.resolve([])).catch(() => []);
  if (seats.length) {
    out.results = [...(out.results ?? []), {
      pass: false,
      name: "seat: a GM-capable user outside this run's own joined mid-run; the elect moved to it and every elect-driven write in that window is suspect, so the reds above are not the module's until it is explained",
      detail: seats.map(s => `${s.name} (role ${s.role}) ${s.active ? "joined" : "left"} ${s.at}`).join("; ")
    }];
  }
  const failures = report({ tag, out, plan });
  await f?.disconnect?.();
  process.exit(failures ? 1 : 0);
}
