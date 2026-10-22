// By the Books — the battery's progress bar: where the newest run stands, unix style, with the key stats.
//
//   node tools/battery-status.mjs            the newest run under dist/battery
//   node tools/battery-status.mjs <runDir>   a named run
//   node tools/battery-status.mjs --watch 60  redraw in place every 60 s until the run is done
//   node tools/battery-status.mjs --watch 60 --follow   ...and keep going across runs (Ctrl-C to stop)
//   node tools/battery-status.mjs --line [runDir]   the run in one line, for a release tag's body
//   node tools/battery-status.mjs --line <A> --and <B> --one-offs <C>   the two-run line (RULINGS *The two-run rule*)
//
// A run is named by its directory or by its bare run id (`2026-10-15T13-55-32`).
// Reads nothing live: the battery writes one <suite>.txt per FINISHED entry into its run directory
// (tools/battery.mjs), so a missing file is an entry still to come and the first missing one in the
// order is the one running now. The reading itself is tools/battery-line.mjs's `readRun`, the one
// the release builder checks a tag's line against. Offline, no Foundry.
//
// `--line` prints `Battery: <run id> — <n>/<n> suites, <n>/<n> checks, GREEN` (RED, PARTIAL) and exits
// 0 only for GREEN; the release tag's body carries that line (NOTES §5 *Release*).
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { BATTERY_DIR, lineOf, readRun, RUN_ID, twoRunLine } from "./battery-line.mjs";

const args = process.argv.slice(2);
const w = args.indexOf("--watch");
const watchSecs = (w >= 0) ? Math.max(5, Number(args[w + 1]) || 60) : 0;
if ( w >= 0 ) args.splice(w, (Number(args[w + 1]) ? 2 : 1));
const follow = args.includes("--follow");
if ( follow ) args.splice(args.indexOf("--follow"), 1);
const asLine = args.includes("--line");
if ( asLine ) args.splice(args.indexOf("--line"), 1);
/** A flag with its one value taken off the args, or null. */
const take = flag => { const i = args.indexOf(flag); if ( i < 0 ) return null; const v = args[i + 1] ?? null; args.splice(i, v === null ? 1 : 2); return v; };
const andRun = take("--and"), oneOffs = take("--one-offs");
if ( (andRun !== null || oneOffs !== null) && (!asLine || andRun === null || oneOffs === null) ) { console.error("battery-status: the two-run line is --line <A> --and <B> --one-offs <C>"); process.exit(2); }
const unknown = args.filter(a => a.startsWith("--"));
if ( unknown.length ) { console.error(`battery-status: unknown flag ${unknown.join(", ")}`); process.exit(2); }
if ( asLine && (watchSecs || follow) ) { console.error("battery-status: --line prints once; drop --watch and --follow"); process.exit(2); }
// A bare run id is a run under dist/battery.
const named = (args[0] === undefined) ? null
  : (!existsSync(args[0]) && RUN_ID.test(args[0])) ? join(BATTERY_DIR, args[0]) : args[0];

/** A run named by its directory or its bare id, under dist/battery; exits when it is not there. */
const runAt = name => {
  const dir = (!existsSync(name) && RUN_ID.test(name)) ? join(BATTERY_DIR, name) : name;
  if ( !existsSync(dir) || !RUN_ID.test(basename(dir)) ) { console.error(`battery-status: ${name} is not a battery run (dist/battery/<run id>)`); process.exit(2); }
  return readRun(dir);
};
if ( asLine && andRun !== null && oneOffs !== null ) {
  if ( !named ) { console.error("battery-status: the two-run line names run A first: --line <A> --and <B> --one-offs <C>"); process.exit(2); }
  const out = twoRunLine(runAt(named), runAt(andRun), runAt(oneOffs));
  if ( "why" in out ) { console.error(`battery-status: the two-run rule does not hold: ${out.why}`); process.exit(1); }
  console.log(out.line);
  process.exit(0);
}
if ( asLine ) {
  const runDir = named ?? newestRun();
  if ( !runDir || !existsSync(runDir) ) { console.error("battery-status: no battery run under dist/battery yet"); process.exit(1); }
  if ( !RUN_ID.test(basename(runDir)) ) { console.error(`battery-status: ${runDir} is not a battery run directory (dist/battery/<run id>)`); process.exit(2); }
  const run = readRun(runDir);
  console.log(lineOf(run));
  process.exit(run.verdict === "GREEN" ? 0 : 1);
}
if ( !watchSecs ) {
  const r = draw(named ?? newestRun());
  process.exit(r.failed ? 1 : 0);
}
// --watch: redraw in place; follows the newest run, so it can be started before the battery is.
const tick = () => {
  process.stdout.write("\x1b[2J\x1b[H");
  const r = draw(named ?? newestRun());
  console.log(`\n(refreshing every ${watchSecs}s — ${new Date().toLocaleTimeString()} — Ctrl-C to stop)`);
  if ( r.finished && !follow ) process.exit(r.failed ? 1 : 0);
  setTimeout(tick, watchSecs * 1000);
};
tick();

/** Print the bar for one run; `{ finished, failed }`. */
function draw(runDir) {
if ( !runDir || !existsSync(runDir) ) { console.log("no battery run under dist/battery yet"); return { finished: false, failed: 0 }; }
const started = startOf(runDir);
const now = Date.now();
const { entries, done, running, total, failed, checks } = readRun(runDir);
const lastAt = done.length ? Math.max(...done.map(e => e.at)) : started;
const elapsedMs = (running ? now : lastAt) - started;
const perEntry = done.length ? elapsedMs / done.length : 0;
const etaMs = running ? Math.max(0, perEntry * (total - done.length)) : 0;
const runningFor = running ? now - lastAt : 0;

const width = 30;
const filled = Math.round(width * done.length / Math.max(1, total));
const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
const pct = Math.round(100 * done.length / Math.max(1, total));
const status = !running ? (failed.length ? "DONE — RED" : "DONE — GREEN") : `running ${running.name} (${mins(runningFor)})`;

console.log(`battery ${runDir.split(/[\\/]/).pop()}  [${bar}] ${String(done.length).padStart(2)}/${total} ${String(pct).padStart(3)}%  elapsed ${mins(elapsedMs)}${running ? `  eta ~${mins(etaMs)}` : ""}`);
console.log(`suites ok ${done.length - failed.length}  failed ${failed.length}${failed.length ? ` (${failed.map(e => `${e.name} ${e.summary}`).join("; ")})` : ""}  checks ${checks.pass}/${checks.all}  ${status}`);
if ( running ) {
  const left = entries.slice(entries.indexOf(running) + 1).filter(e => e.state === "pending").map(e => e.name);
  if ( left.length ) console.log(`next ${left.slice(0, 4).join(", ")}${left.length > 4 ? ` … +${left.length - 4}` : ""}`);
}
return { finished: !running, failed: failed.length };
}

function newestRun() {
  if ( !existsSync(BATTERY_DIR) ) return null;
  const dirs = readdirSync(BATTERY_DIR).filter(d => /^\d{4}-\d{2}-\d{2}T/.test(d) && statSync(join(BATTERY_DIR, d)).isDirectory()).sort();
  return dirs.length ? join(BATTERY_DIR, dirs.at(-1)) : null;
}

/** The run's start from its directory name (UTC, `2026-09-30T19-32-58`). */
function startOf(dir) {
  const m = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/.exec(dir);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : statSync(dir).birthtimeMs;
}

function mins(ms) {
  const m = Math.round(ms / 60000);
  return m < 1 ? `${Math.round(ms / 1000)}s` : `${m}m`;
}
