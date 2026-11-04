/**
 * THE BATTERY — every live suite, in the order that works, each captured to a file.
 *
 *   node tools/battery.mjs                    the whole battery
 *   node tools/battery.mjs --for v3.4.22..HEAD   what the commits in a git range need, and only that —
 *                                             the release's gate, sized to the change (a bare ref is <ref>..HEAD)
 *   node tools/battery.mjs --rerun-failed     the suites the newest run's report marked failed (the one-offs);
 *                                             --rerun-failed <run id> [<run id>…] reads those runs instead
 *   node tools/battery.mjs --changed          what the working tree's change needs, and only that
 *   node tools/battery.mjs --changed main     ...the branch since main, plus the working tree
 *   node tools/battery.mjs --files scripts/emanations.js --list   the plan for a list by hand
 *   node tools/battery.mjs --from smoke-saves resume after a failure, in order
 *   node tools/battery.mjs smoke-hold smoke-saves   just these, still in the canonical order
 *   node tools/battery.mjs --snapshot         roll the world back afterwards (see below)
 *   node tools/battery.mjs --keep             leave the fixtures in the world afterwards
 *   node tools/battery.mjs --list             the order, without running anything (with a mode: its plan)
 *   node tools/battery.mjs --force=<pid>      go ahead over the seat's holder, naming it (see below)
 *
 * `--for`, `--changed` and `--files` are change-scoped: each suite's `COVERS` names its machines and the
 * plan says which changed file claimed each suite; a SPINE change (tools/check-layers.mjs's tiers) is the
 * full battery. A run's `scope.json` records which mode chose its rows: a patch release cites a `--for`
 * run (or the full battery), a minor the full battery, and `build-release.mjs --tag` refuses the rest
 * (tools/battery-line.mjs `scopeProblem`; NOTES §5 *Release*).
 *
 * 1. Every suite's full output lands in a run directory: failures print in the BODY, so a
 *    `| tail` would throw the evidence away.
 * 2. The order matters: ORDER's `needs` (tools/coverage-map.mjs) are pulled into any subset.
 *    ⚠ The two-client entries need the player test account free (no human logged in as it).
 * 3. Settings are VERIFIED after, against the world's own values recorded before the run
 *    (`settings-before.json` in the run directory): a crashed run launders its pins into the next
 *    run's "prior", and `verify-settings --against <that file> --fix` puts them back.
 * 4. SELF-CONTAINED (2026-10-07): every plan opens with `fixture-suite` (every fixture built from the
 *    compendia; a failed build stops the run) and closes with `teardown-fixtures` (unless --keep), so
 *    the sandbox world can be any world, a fresh copy of prod included, and is left as it was found.
 * 5. THE SEAT LOCK (2026-11-04): the battery holds the instance's seat lock for its whole length (the
 *    MCP's src/seat-lock.ts: a file naming this process, the run, and the suite it is on, row n of m),
 *    so the bridge's connect, a deploy, the installer, the Seer and another battery refuse meanwhile
 *    and name this run; `battery-status.mjs` and `local-foundry.mjs status` show it. A battery that
 *    finds the seat held prints the holder and exits 4; `--force=<pid>` overrides only by naming it.
 * ⚠ `--snapshot` rolls the world back after the last suite, undoing even a crashed teardown. It
 * needs the local sandbox with no clients, costs two world bounces, and discards table changes.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { strictArgs, usageOf } from "./args.mjs";
import { BATTERY_DIR, readRun, RUN_ID } from "./battery-line.mjs";
import { ORDER, planFor, rowsFor, rowsFrom } from "./coverage-map.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;

// ⚠ The ORDER lives in tools/coverage-map.mjs (with why each row sits where it does); never re-declare it here.

/** Lift `--changed [base]`, `--files a b c` and `--rerun-failed [run…]` off argv: parseArgs cannot express their tails. */
function liftTail(argv) {
  const rest = [];
  let changed = null;
  let files = null;
  let rerun = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--changed") {
      changed = { base: null };
      if ((i + 1 < argv.length) && !argv[i + 1].startsWith("-")) changed.base = argv[++i];
    } else if (a === "--files") {
      files = [];
      while ((i + 1 < argv.length) && !argv[i + 1].startsWith("--")) files.push(argv[++i]);
    } else if (a === "--rerun-failed") {
      rerun = [];
      while ((i + 1 < argv.length) && !argv[i + 1].startsWith("--")) rerun.push(argv[++i]);
    } else rest.push(a);
  }
  return { rest, changed, files, rerun };
}

/** One git query's lines; a failed query is an instrument failure, never "nothing changed". */
function git(args) {
  const r = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`[battery] git ${args.join(" ")} failed — ${(r.stderr ?? "").trim()}`);
    process.exit(2);
  }
  return r.stdout.split("\n").map(l => l.trim()).filter(Boolean);
}

/** A git query that may fail quietly (a tree without git): its lines, or null. */
function gitSoft(args) {
  const r = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  return r.status === 0 ? r.stdout.split("\n").map(l => l.trim()).filter(Boolean) : null;
}

/** The working tree, index and untracked files against HEAD. */
function treeFiles() {
  return [...new Set([
    ...git(["diff", "--name-only", "HEAD"]),
    ...git(["diff", "--name-only", "--cached"]),
    ...git(["ls-files", "--others", "--exclude-standard"])
  ])].sort();
}

/** The files a `--changed` run is about: the working tree; with a base, also `base...HEAD`. */
function changedFiles(base) {
  const branch = base ? git(["diff", "--name-only", `${base}...HEAD`]) : [];
  return [...new Set([...branch, ...treeFiles()])].sort();
}

/** A run named by its id or its directory, under dist/battery; the newest when `name` is null. */
function runDirOf(name) {
  if (name === null) {
    if (!existsSync(BATTERY_DIR)) return null;
    const dirs = readdirSync(BATTERY_DIR).filter(d => RUN_ID.test(d) && statSync(join(BATTERY_DIR, d)).isDirectory()).sort();
    return dirs.length ? join(BATTERY_DIR, dirs.at(-1)) : null;
  }
  const dir = (!existsSync(name) && RUN_ID.test(name)) ? join(BATTERY_DIR, name) : name;
  return (existsSync(dir) && RUN_ID.test(basename(dir))) ? dir : null;
}

const lifted = liftTail(process.argv.slice(2));
// ⚠ STRICT (#11): `--help` once ran the whole battery, because an unknown flag was ignored and the
// default is everything. Now it prints the header above; anything unknown exits 2 before connecting.
const { values, positionals } = strictArgs({
  options: {
    for: { type: "string" },
    from: { type: "string" },
    snapshot: { type: "boolean" },
    keep: { type: "boolean" },
    list: { type: "boolean" },
    section: { type: "string" },
    force: { type: "string" }
  },
  usage: usageOf(fileURLToPath(import.meta.url)),
  argv: lifted.rest,
  allowPositionals: true,
  script: "battery.mjs"
});

const modes = [
  lifted.changed && "--changed", lifted.files && "--files", values.for && "--for", lifted.rerun && "--rerun-failed",
  positionals.length && "suite names", values.from && "--from"
].filter(Boolean);
if (modes.length > 1) {
  console.error(`${modes.join(" and ")} each choose the suites themselves — pass one of them.`);
  process.exit(2);
}
if (values.section && (positionals.length !== 1)) {
  console.error("--section names sections of ONE suite; pass exactly one suite name with it.");
  process.exit(2);
}
let force = null;
if (values.force !== undefined) {
  force = Number(values.force);
  if (!Number.isInteger(force) || (force <= 0)) {
    console.error("--force names the seat holder's pid, as the refusal prints it: --force=<pid>.");
    process.exit(2);
  }
}
const byChange = lifted.changed || lifted.files || values.for;

/** Print a plan: the rows and why each runs. */
const printPlan = (rows, heading) => {
  console.log(heading);
  const w = Math.max(0, ...rows.map(r => r.name.length));
  for (const r of rows) {
    const why = r.why?.length ? r.why.join("; ") : r.note;
    console.log(`  ${r.name.padEnd(w)}  ${r.reset ? "(seed) " : ""}${why}`);
  }
};

if (values.list && !modes.length) {
  console.log("The battery, in order:");
  for (const s of ORDER) {
    const needs = s.needs?.length ? `  [needs ${s.needs.join(", ")}]` : "";
    console.log(`  ${s.name.padEnd(22)}${s.note}${needs}`);
  }
  process.exit(0);
}

/** How this run's rows were chosen, written beside the plan for battery-status and the release builder. */
const scope = { mode: "full", head: gitSoft(["rev-parse", "HEAD"])?.[0] ?? null };

let plan;
if (byChange) {
  let files;
  if (values.for) {
    const range = values.for.includes("..") ? values.for : `${values.for}..HEAD`;
    files = git(["diff", "--name-only", range]);
    // ⚠ A `--for` run stands for its commits. The deployed tree is what runs, so an uncommitted change to a
    // live file outside the range was tested without its suites being chosen: named here, recorded, and the
    // release builder refuses to cite the run (commit it, and the range takes it in; `--changed` is the loop
    // for work in flight).
    const dirty = treeFiles();
    let dirtyLive = [];
    if (dirty.length) {
      // The planner's own word on each: a file it calls inert (a doc, a test, a tool no suite imports) is fine.
      try { dirtyLive = dirty.filter(f => !planFor(dirty).inert.some(i => i.file === f)); } catch { dirtyLive = dirty; }
    }
    Object.assign(scope, { mode: "for", range, files, dirty, dirtyLive });
    if (dirtyLive.length) {
      console.log(`[battery] ⚠ uncommitted changes to live files outside ${range}: ${dirtyLive.join(", ")} — this tree runs, but `
        + "their suites are not chosen by the range and a release cannot cite this run; commit them (the range then takes them in) or stash them.");
    } else if (dirty.length) console.log(`[battery] the working tree also carries ${dirty.length} uncommitted inert file(s), outside ${range}: fine for a release`);
  } else {
    files = lifted.files ?? changedFiles(lifted.changed.base);
    Object.assign(scope, lifted.files ? { mode: "files", files } : { mode: "changed", base: lifted.changed.base, files });
  }
  let p;
  try {
    p = planFor(files);
  } catch (err) {
    console.error(`[battery] the coverage map could not be read — ${err.message}`);
    process.exit(2);
  }
  const what = values.for ? `--for ${scope.range}` : lifted.files ? "--files" : `--changed ${lifted.changed.base ? `${lifted.changed.base}...HEAD + ` : ""}the working tree`;
  console.log(`[battery] ${what}: ${files.length} file(s)`);
  for (const f of p.inert) console.log(`  · ${f.file} — ${f.why}`);
  if (p.full.length) {
    console.log("[battery] THE FULL BATTERY, because:");
    for (const why of p.full) console.log(`  ⚠ ${why}`);
    scope.full = p.full;
  }
  if (!p.rows.length) {
    console.log("[battery] nothing live to run — no change reaches a machine a suite claims.");
    process.exit(0);
  }
  plan = p.rows;
  if (values.list) {
    printPlan(plan, `\nThe plan — ${plan.length} of ${ORDER.length} rows, in order:`);
    process.exit(0);
  }
  console.log("");
} else if (lifted.rerun) {
  // The one-offs: every suite a run's report marked failed, run again alone (RULINGS *The two-run rule*).
  const named = lifted.rerun.length ? lifted.rerun : [null];
  const runs = [];
  const reds = new Set();
  const notSuites = [];
  for (const n of named) {
    const dir = runDirOf(n);
    if (!dir) {
      console.error(n === null ? "[battery] --rerun-failed: no battery run under dist/battery yet" : `[battery] --rerun-failed: ${n} is not a battery run (dist/battery/<run id>)`);
      process.exit(2);
    }
    const run = readRun(dir);
    runs.push(run.id);
    for (const e of run.failed) {
      const name = e.name.replace(/-\d+$/, "");
      if (ORDER.some(s => (s.name === name) && !s.reset)) reds.add(name);
      else notSuites.push(e.name);
    }
    console.log(`[battery] ${run.id}: ${run.verdict}, ${run.failed.length} failed entr${run.failed.length === 1 ? "y" : "ies"}${run.failed.length ? ` (${run.failed.map(e => e.name).join(", ")})` : ""}`);
  }
  if (notSuites.length) console.log(`[battery] ⚠ not suites, not rerun here: ${notSuites.join(", ")} — a failed seed or setup is the whole run again`);
  if (!reds.size) {
    console.log("[battery] nothing to rerun — no suite is marked failed in that run.");
    process.exit(0);
  }
  const suites = ORDER.filter(s => reds.has(s.name)).map(s => s.name);
  Object.assign(scope, { mode: "rerun-failed", runs, suites });
  plan = rowsFor(suites);
  for (const r of plan) if (r.why[0] !== "asked for") console.log(`[battery] ${r.name}: ${r.why.join("; ")}`);
  if (values.list) {
    printPlan(plan, `\nThe one-offs of ${runs.join(", ")} — ${plan.length} rows, in order:`);
    process.exit(0);
  }
} else if (positionals.length) {
  // Needs are pulled, not refused: smoke-hold runs smoke-bythebooks immediately before it.
  const unknown = positionals.filter(a => !ORDER.some(s => s.name === a));
  if (unknown.length) {
    console.error(`no such suite: ${unknown.join(", ")}. Try --list.`);
    process.exit(2);
  }
  Object.assign(scope, { mode: "named", suites: positionals, ...(values.section ? { section: values.section } : {}) });
  plan = rowsFor(positionals);
  for (const r of plan) if (r.why[0] !== "asked for") console.log(`[battery] ${r.name}: ${r.why.join("; ")}`);
  // ⚠ `--section` is per-SUITE vocabulary: only with exactly one named suite, and its pulled needs run whole.
} else if (values.from) {
  const at = ORDER.findIndex(s => s.name === values.from);
  if (at < 0) { console.error(`--from: no such suite "${values.from}". Try --list.`); process.exit(2); }
  Object.assign(scope, { mode: "from", from: values.from });
  // A resume pulls what its rows need from above the cut.
  plan = rowsFrom(at);
  for (const r of plan) if (r.at < at) console.log(`[battery] ${r.name}: ${r.why.join("; ")}`);
} else {
  plan = ORDER;
}

// The setup row: every fixture built from the compendia before anything runs, whatever the plan.
const SETUP = { name: "fixture-suite", note: "setup — every fixture built from the compendia", reset: true, setup: true };
if (plan[0]?.name !== "fixture-suite") plan = [SETUP, ...plan];
else plan = [{ ...plan[0], setup: true }, ...plan.slice(1)];

if (values.list) {
  printPlan(plan, "The plan, in order:");
  process.exit(0);
}
const sectionFor = values.section ? positionals[0] : null;

// THE SEAT LOCK, before anything touches the instance. The MCP client is loaded here, not at the top: `--list`
// and `--help` must cost nothing and run where the sibling's dist is not built (CI).
const mcp = await import("fvtt-mcp-dnd5e/client");
const { loadEnv } = await import("./harness.mjs");
const { foundryConfig } = await import("./target.mjs");
const serverUrl = foundryConfig(loadEnv()).serverUrl;
// A dist/ built before the seat lock has no `takeSeatLock`: the run goes ahead with none, and says so.
const hasSeat = typeof mcp.takeSeatLock === "function";
if (!hasSeat) console.log("[battery] ⚠ the MCP client's dist/ has no seat lock (npm run build in fvtt-mcp-dnd5e) — running with none");
try {
  const taken = hasSeat ? await mcp.takeSeatLock({ serverUrl, kind: "battery", name: "battery", who: "the battery" }, { force }) : { lock: null, forced: null, stale: null };
  if ("rideAlong" in taken) {
    console.error(`[battery] REFUSING TO START: this process already rides along a seat lock held by pid ${taken.rideAlong.pid} (FVTT_SEAT_HOLDER) — a battery is never started from inside a run.`);
    process.exit(4);
  }
  if (taken.forced) console.log(`[battery] ⚠ --force=${taken.forced.pid}: the seat was held by ${taken.forced.kind} "${taken.forced.name}" (since ${taken.forced.since}); going ahead over it`);
  if (taken.stale) console.log(`[battery] taking over a stale seat lock from ${taken.stale.kind} "${taken.stale.name}" (pid ${taken.stale.pid}, ${taken.stale.since}) — that run died; the world may be dirty`);
} catch (err) {
  if (!(err instanceof mcp.SeatHeldError)) throw err;
  console.error(`[battery] REFUSING TO START: ${err.message}`);
  process.exit(4);
}

// The run directory is named by the caller, not by a clock.
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runDir = join(REPO, "dist", "battery", stamp);
mkdirSync(runDir, { recursive: true });
// Each row's output file, in order — `plan.json` is what battery-status draws its bar from, so a partial
// run's bar counts its own rows. A repeated row (fixture-suite stands three times) gets `-2`, `-3`.
const seen = {};
for (const suite of plan) {
  seen[suite.name] = (seen[suite.name] ?? 0) + 1;
  suite.file = suite.setup ? "setup-fixtures" : (seen[suite.name] > 1) ? `${suite.name}-${seen[suite.name]}` : suite.name;
}
writeFileSync(join(runDir, "plan.json"), `${JSON.stringify(plan.map(s => s.file))}\n`);
scope.rows = plan.map(s => s.file);
scope.at = new Date().toISOString();
writeFileSync(join(runDir, "scope.json"), `${JSON.stringify(scope, null, 2)}\n`);
console.log(`[battery] output -> ${runDir}\n`);
const runRel = relative(REPO, runDir).split("\\").join("/");
/** Where the battery is, into its seat lock: the row running now (the status another session reads). */
const seatAt = (suite, row) => hasSeat && mcp.updateSeatLock(serverUrl, { suite, row, of: plan.length, runDir: runRel });
seatAt("settings-snapshot", 0);

// ⚠ Clear the hook ledgers and the contract recordings first: hook-coverage.mjs and contracts.mjs
// union whatever they find, and a previous battery's would report what this run never saw.
rmSync(join(REPO, "dist", "hook-ledger"), { recursive: true, force: true });
rmSync(join(REPO, "dist", "contract-recordings"), { recursive: true, force: true });

const run = (script, args = [], label = script) => {
  const r = spawnSync(node, [join(REPO, "tools", `${script}.mjs`), ...args], {
    cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024
  });
  // stdout and stderr are captured separately (no pty), so the file does not claim chronological order.
  const err = (r.stderr ?? "").trim();
  const SEP = "\n──────── stderr (not interleaved) ────────\n";
  const body = err ? `${r.stdout ?? ""}${SEP}${err}\n` : (r.stdout ?? "");
  writeFileSync(join(runDir, `${label}.txt`), body);
  return { code: r.status ?? -1, body };
};

if (values.snapshot) {
  console.log("[battery] taking a world snapshot (two bounces, ~1 minute)…");
  const r = spawnSync(node, [join(REPO, "tools", "world-snapshot.mjs"), "take"],
    { cwd: REPO, encoding: "utf8", stdio: "inherit" });
  if (r.status !== 0) {
    console.error("[battery] snapshot failed — refusing to run, because --snapshot promised a rollback.");
    process.exit(2);
  }
}

/** The last line a suite prints is its verdict; every suite spells it one of three ways. */
const verdictOf = body => {
  const line = body.trimEnd().split("\n").reverse()
    .find(l => /ALL PASS|FAILURE\(S\)|\d+\/\d+ passed|\d+\/\d+$/.test(l));
  return line ? line.trim() : "(no summary line — read the file)";
};

// The world's own settings are the reference: recorded before anything runs, checked after.
const BEFORE = join(runDir, "settings-before.json");
const snap = run("verify-settings", ["--snapshot", BEFORE], "settings-snapshot");
if (snap.code !== 0) {
  console.error(`[battery] the settings snapshot failed — refusing to run without a reference. See ${join(runDir, "settings-snapshot.txt")}`);
  process.exit(2);
}
console.log(`[battery] ${snap.body.split("\n").find(l => l.startsWith("[verify] SNAPSHOT")) ?? "settings recorded"}`);

// ⚠ THE HOUSE RULES OFF for the run, back before the settings check: the suites assert the rules as written, and a
// table with House Rules' going-down rule on (a level of Exhaustion at every drop to 0) walks its fixtures to
// Exhaustion 6 — dead — inside a dozen suites. The section that tests the seam (smoke-bythebooks §4d) pins it on
// itself. The rules live in Open Roll 5e: House Rules; on a table without the module, or one whose House Rules
// predates a key, the job writes nothing and returns no prior for it.
const HOUSE_RULES_MODULE = "fvtt-mod-houserules";
const HOUSE_RULES = ["goingDown"];
const pinHouseRules = (values_, label) => run("job", ["-e",
  `const MOD = ${JSON.stringify(HOUSE_RULES_MODULE)}; const out = {}; if (!game.modules.get(MOD)?.active) return out; for (const [k, v] of Object.entries(arg)) { if (!game.settings.settings.has(MOD + "." + k)) continue; out[k] = game.settings.get(MOD, k); await game.settings.set(MOD, k, v); } return out;`,
  "--arg", JSON.stringify(values_)], label);
const pinned = pinHouseRules(Object.fromEntries(HOUSE_RULES.map(k => [k, false])), "pin-house-rules");
// job.mjs prints its result pretty, over several lines: the text between the first "{" and the last "}".
const priorHouseRules = (() => {
  try { return JSON.parse(pinned.body.slice(pinned.body.indexOf("{"), pinned.body.lastIndexOf("}") + 1)); }
  catch { return {}; }
})();
const pinnedKeys = HOUSE_RULES.filter(k => k in priorHouseRules);
if (pinned.code !== 0) console.log(`[battery] ⚠ the house rules could not be pinned off (exit ${pinned.code}) — see ${join(runDir, "pin-house-rules.txt")}`);
else if (!pinnedKeys.length) console.log(`[battery] house rules: nothing to pin (${HOUSE_RULES_MODULE} not active, or without ${HOUSE_RULES.join(", ")})`);
else console.log(`[battery] house rules off for the run: ${pinnedKeys.map(k => `${k} (was ${JSON.stringify(priorHouseRules[k])})`).join(", ")}`);

const results = [];
let failed = 0;
for (const [i, suite] of plan.entries()) {
  seatAt(suite.file, i + 1);
  process.stdout.write(`[battery] ${suite.name}… `);
  const t0 = Date.now();
  // The setup row writes its own file (`setup-fixtures.txt`): fixture-suite also stands in ORDER, and
  // battery-status counts a row done by its file.
  const { code, body } = run(suite.name, (suite.name === sectionFor) ? ["--section", values.section] : [],
    suite.file);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  // ⚠ A seed or sweep is judged by its exit code too (issue #9, 2026-10-11): `fixture-suite` died
  // halfway on a double-deleted Bloodied, printed "swept", and probe-effect-view ran on what it left.
  const verdict = suite.reset ? ((code === 0) ? "swept" : `FAILED (exit ${code}) — the seed did not finish`) : verdictOf(body);
  const bad = code !== 0;
  if (bad) failed++;
  results.push({ name: suite.name, code, secs, verdict, bad });
  console.log(`${bad ? "FAILED" : "ok"} (${secs}s) — ${verdict}`);
  if (suite.setup && (code !== 0)) {
    console.log(`\n[battery] the fixture build failed — nothing can run. See ${join(runDir, "setup-fixtures.txt")}`);
    for (const l of body.split("\n")) if (/FAIL|FATAL|ERROR|⚠/.test(l)) console.log(l);
    process.exit(2);
  }
  // Failures print here in full, as well as landing in the file.
  if (bad) {
    console.log(`\n──────── ${suite.name} — the failing lines ────────`);
    for (const l of body.split("\n")) if (/FAIL|FATAL|ERROR/.test(l)) console.log(l);
    console.log(`──────── full output: ${join(runDir, `${suite.file}.txt`)}\n`);
  }
}
seatAt("the checks after the run", plan.length);

// Coverage is printed, never enforced (ARCHITECTURE §10 D11), and before the settings check so a
// drifted-settings exit still leaves it on screen.
console.log("\n[battery] hook coverage — which registrations actually fired…");
const coverage = run("hook-coverage");
if (coverage.code !== 0) {
  console.log("  ⚠ NOT MEASURED — the ledgers are missing or unreadable. That is an instrument "
    + "failure, not a clean result; do not read it as 'everything fired'.");
} else {
  const lines = coverage.body.split("\n");
  const from = lines.findIndex(l => l.includes("NEVER FIRED"));
  if (from >= 0) for (const l of lines.slice(from)) console.log(l.trimEnd());
  else console.log(`  ${lines.find(l => l.startsWith("REPORT")) ?? ""}`);
}

// The contracts against what this run published (tools/contracts.mjs): printed, never enforced here;
// `npm run verify` holds the committed files to the code, and a drift is recorded with --write.
console.log("\n[battery] the contracts — what this run published against contracts/…");
const contracts = run("contracts", ["--check", "--run"]);
for (const l of contracts.body.split("\n")) if (/^(CONTRACT|FAIL|REPORT| {2})/.test(l)) console.log(l.trimEnd());

if (pinned.code === 0) {
  // Only what was pinned goes back, to the value it had; a key the pin never touched is left as it is.
  const back = pinHouseRules(Object.fromEntries(pinnedKeys.map(k => [k, priorHouseRules[k]])), "unpin-house-rules");
  console.log(`\n[battery] house rules back to the table's own${back.code === 0 ? "" : ` — ⚠ FAILED (exit ${back.code}), see ${join(runDir, "unpin-house-rules.txt")}`}`);
}

console.log("\n[battery] the settings, against the world's own before the run…");
const settings = run("verify-settings", ["--against", BEFORE]);
const clean = settings.code === 0;
console.log(clean ? "  CLEAN" : `  ⚠ DRIFTED — see ${join(runDir, "verify-settings.txt")}, `
  + `then \`node tools/verify-settings.mjs --against ${BEFORE} --fix\``);

if (values.keep) console.log("\n[battery] --keep: the fixtures stay in the world");
else {
  console.log("\n[battery] tearing the fixtures down…");
  const down = run("teardown-fixtures");
  console.log(`  ${down.body.split("\n").find(l => /^\[teardown-fixtures\] removed/.test(l)) ?? `⚠ exit ${down.code} — see the file`}`);
}

if (values.snapshot) {
  console.log("\n[battery] rolling the world back to the snapshot…");
  spawnSync(node, [join(REPO, "tools", "world-snapshot.mjs"), "restore"],
    { cwd: REPO, encoding: "utf8", stdio: "inherit" });
}

console.log("\n──────── BATTERY ────────");
const w = Math.max(...results.map(r => r.name.length));
for (const r of results) {
  console.log(`  ${r.bad ? "FAIL" : "pass"}  ${r.name.padEnd(w)}  ${String(r.secs).padStart(4)}s  ${r.verdict}`);
}
const total = results.reduce((n, r) => n + Number(r.secs), 0);
console.log(`  ${failed ? `${failed} SUITE(S) FAILED` : "every suite green"}`
  + ` · settings ${clean ? "clean" : "DRIFTED"} · ${Math.round(total / 60)}m ${total % 60}s`);
console.log(`  output: ${runDir}`);
if (failed) console.log(`  the one-offs: node tools/battery.mjs --rerun-failed ${stamp}`);
process.exit((failed || !clean) ? 1 : 0);
