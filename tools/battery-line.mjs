// @ts-check
// THE BATTERY LINE — one battery run in one line, and the release's rule over a tag body (NOTES §5
// *Release*; tools/README.md *Release and deploy — the chain*; RULINGS *The two-run rule*).
//
//   Battery: 2026-10-15T13-55-32 — 45/45 suites, 1691/1691 checks, GREEN
//   Battery: 2026-10-22T16-04-11 + 2026-10-22T16-54-46 — 66/67 + 66/67 suites, 2328/2329 + 2335/2336 checks, GREEN by the two-run rule; one-offs 2026-10-22T18-02-10: smoke-effects, smoke-monsters
//   Battery: none (pre-release)
//
// The first form is a run under dist/battery/: its directory name, the finished-green entries over
// the entries in its plan, the checks passed over the checks run, and GREEN, RED (a finished entry
// failed) or PARTIAL (an entry has no output: still running, or the run stopped). An ASCII `-` in
// place of the dash is the same line. The second form is THE TWO-RUN RULE: two full runs of one plan,
// each red by one to three suites, no suite red in both, and every red suite green when run alone in a
// third run (the one-offs) — a flake, not a defect, and the pair releases. The third form is a release
// with no run behind it, which the release workflow publishes as a GitHub pre-release.
//
// One reading of a run directory for everything that reports on one: `readRun` is what
// battery-status.mjs draws its bar from and prints `--line` from, and what build-release.mjs checks
// a tag's line against; `checkTagBody` is the release rule itself (tests/battery-line.test.js).
// Offline, no Foundry.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));

/** Where battery.mjs writes its runs, one directory per run. */
export const BATTERY_DIR = join(REPO, "dist", "battery");

/** A run directory's name: battery.mjs stamps the run's start in UTC, `:` and `.` written as `-`. */
export const RUN_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;

/** The line of a release with no battery run behind it. */
export const NONE_LINE = "Battery: none (pre-release)";

/** The run form. */
export const RUN_FORM = "Battery: <run id> — <n>/<n> suites, <n>/<n> checks, GREEN";

/** The two-run form: run A and run B, their suites and checks, the one-offs run C and the suites it proved. */
export const TWO_RUN_FORM = "Battery: <run A> + <run B> — <n>/<n> + <n>/<n> suites, <n>/<n> + <n>/<n> checks, GREEN by the two-run rule; one-offs <run C>: <suite>, <suite>";

/** The most suites a run may be red by and still enter the two-run rule. */
export const TWO_RUN_MAX_REDS = 3;

/** The three lines a release tag's body may carry, as every refusal quotes them. */
export const FORMS = [RUN_FORM, TWO_RUN_FORM, NONE_LINE];

/** The run form; group 2 is the dash, which may be typed as an ASCII hyphen. */
const RUN_LINE = /^Battery: (\S+) (—|-) (\d+)\/(\d+) suites, (\d+)\/(\d+) checks, (GREEN|RED|PARTIAL)$/;

/** The two-run form; group 3 is the dash. */
const TWO_RUN_LINE = /^Battery: (\S+) \+ (\S+) (—|-) (\d+)\/(\d+) \+ (\d+)\/(\d+) suites, (\d+)\/(\d+) \+ (\d+)\/(\d+) checks, GREEN by the two-run rule; one-offs (\S+): (.+)$/;

/** A body line that means to be a battery line: `Battery:` at its start, whatever decorates it. */
const CANDIDATE = /^[\s>*_-]*battery\s*:/i;

/** A suite's name as the battery's order spells it. */
const SUITE_NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * @typedef {{ name: string, state: "pending"|"ok"|"failed", ok?: boolean, pass?: number,
 *   all?: number, summary?: string, at?: number }} Entry
 * @typedef {{ id: string, entries: Entry[], done: Entry[], failed: Entry[], running: Entry|null,
 *   total: number, green: number, checks: { pass: number, all: number },
 *   verdict: "GREEN"|"RED"|"PARTIAL" }} Run
 * @typedef {{ id: string, green: number, total: number, pass: number, all: number,
 *   verdict: "GREEN"|"RED"|"PARTIAL" }} RunLine
 * @typedef {{ id: string, green: number, total: number, pass: number, all: number }} RunCount
 * @typedef {{ a: RunCount, b: RunCount, c: string, names: string[] }} TwoRunLine
 */

/**
 * One run directory read. Each row of the run's plan is an entry, finished once its `<row>.txt`
 * exists (battery.mjs writes the file as the row ends), green or red by the verdict in that file.
 * A run without a plan.json falls back to the battery's full order, `orderOf()`.
 * A finished red entry makes the run RED; else an entry with no file makes it PARTIAL.
 * @param {string} runDir
 * @param {() => string[]} [orderOf]
 * @returns {Run}
 */
export function readRun(runDir, orderOf = listOrder) {
  const planFile = join(runDir, "plan.json");
  /** @type {string[]} */
  const rows = existsSync(planFile) ? JSON.parse(readFileSync(planFile, "utf8"))
    : existsSync(join(runDir, "setup-fixtures.txt")) ? ["setup-fixtures", ...orderOf()] : orderOf();
  /** @type {Entry[]} */
  const entries = rows.map(name => {
    const file = join(runDir, `${name}.txt`);
    if ( !existsSync(file) ) return { name, state: "pending" };
    const body = readFileSync(file, "utf8");
    const verdict = verdictOf(body, /^(fixture-|reset-|setup-)/.test(name));
    return { name, state: verdict.ok ? "ok" : "failed", ...verdict, at: statSync(file).mtimeMs };
  });
  const done = entries.filter(e => e.state !== "pending");
  const failed = done.filter(e => e.state === "failed");
  const running = entries.find(e => e.state === "pending") ?? null;
  const checks = done.reduce((a, e) => ({ pass: a.pass + (e.pass ?? 0), all: a.all + (e.all ?? 0) }), { pass: 0, all: 0 });
  const verdict = failed.length ? "RED" : running ? "PARTIAL" : "GREEN";
  return { id: basename(runDir), entries, done, failed, running, total: entries.length,
    green: done.length - failed.length, checks, verdict };
}

/**
 * The run in one line, the first of FORMS.
 * @param {Run} run
 */
export function lineOf(run) {
  return `Battery: ${run.id} — ${run.green}/${run.total} suites, ${run.checks.pass}/${run.checks.all} checks, ${run.verdict}`;
}

/**
 * THE TWO-RUN RULE over three runs read: A and B are two finished runs of ONE plan, each red by one to
 * TWO_RUN_MAX_REDS suites, no suite red in both (a suite red twice is a defect, not a flake), and C, the
 * one-offs, ran every suite red in either and is green throughout. The suites the rule scratched to one-offs
 * come back sorted, for the line.
 * @param {Run} a
 * @param {Run} b
 * @param {Run} c
 * @returns {{ ok: true, reds: string[] } | { ok: false, why: string }}
 */
export function judgeTwoRuns(a, b, c) {
  for ( const [run, letter] of /** @type {[Run, string][]} */ ([[a, "A"], [b, "B"]]) ) {
    if ( run.running ) return { ok: false, why: `run ${letter} (${run.id}) is PARTIAL: ${run.running.name} has no output` };
    if ( !run.failed.length ) return { ok: false, why: `run ${letter} (${run.id}) is GREEN on its own: name it alone` };
    if ( run.failed.length > TWO_RUN_MAX_REDS ) return { ok: false, why: `run ${letter} (${run.id}) is red by ${run.failed.length} suites; the rule takes one to ${TWO_RUN_MAX_REDS}` };
  }
  const planA = a.entries.map(e => e.name), planB = b.entries.map(e => e.name);
  if ( (planA.length !== planB.length) || planA.some((n, i) => n !== planB[i]) ) return { ok: false, why: "the two runs are not runs of one plan" };
  const redsA = a.failed.map(e => e.name), redsB = b.failed.map(e => e.name);
  const twice = redsA.filter(n => redsB.includes(n));
  if ( twice.length ) return { ok: false, why: `${twice.join(", ")} red in both runs: a defect, not a flake` };
  const reds = [...new Set([...redsA, ...redsB])].sort();
  if ( c.running ) return { ok: false, why: `the one-offs run ${c.id} is PARTIAL: ${c.running.name} has no output` };
  if ( c.failed.length ) return { ok: false, why: `the one-offs run ${c.id} is red: ${c.failed.map(e => e.name).join(", ")}` };
  const missing = reds.filter(n => !c.entries.some(e => (e.name === n) && (e.state === "ok")));
  if ( missing.length ) return { ok: false, why: `${missing.join(", ")} not green alone in the one-offs run ${c.id}` };
  return { ok: true, reds };
}

/**
 * The two-run line, the second of FORMS, over three runs the rule accepts; `{ why }` when it does not.
 * @param {Run} a
 * @param {Run} b
 * @param {Run} c
 * @returns {{ line: string, reds: string[] } | { why: string }}
 */
export function twoRunLine(a, b, c) {
  const judged = judgeTwoRuns(a, b, c);
  if ( !judged.ok ) return { why: judged.why };
  const line = `Battery: ${a.id} + ${b.id} — ${a.green}/${a.total} + ${b.green}/${b.total} suites, `
    + `${a.checks.pass}/${a.checks.all} + ${b.checks.pass}/${b.checks.all} checks, GREEN by the two-run rule; `
    + `one-offs ${c.id}: ${judged.reds.join(", ")}`;
  return { line, reds: judged.reds };
}

/**
 * One line read as a battery line: `{ none: true }`, `{ run }` for the run form, `{ pair }` for the two-run
 * form, or `{ why }` when it is none of them. A GREEN run line is whole (every suite, every check, at least
 * one check); a RED or PARTIAL line is short of whole. A two-run line counts each run short by one to
 * TWO_RUN_MAX_REDS suites of one total, and names at least one suite.
 * @param {string} text
 * @returns {{ none: true } | { run: RunLine } | { pair: TwoRunLine } | { why: string }}
 */
export function parseLine(text) {
  const line = text.trim();
  if ( line === NONE_LINE ) return { none: true };
  const pair = TWO_RUN_LINE.exec(line);
  if ( pair ) return parsePair(pair);
  const m = RUN_LINE.exec(line);
  if ( !m ) return { why: "it is in none of the forms" };
  const id = m[1] ?? "";
  const [green = 0, total = 0, pass = 0, all = 0] = [m[3], m[4], m[5], m[6]].map(Number);
  const verdict = /** @type {RunLine["verdict"]} */ (m[7]);
  if ( !RUN_ID.test(id) ) return { why: `"${id}" is not a run id (a dist/battery directory name, e.g. 2026-10-15T13-55-32)` };
  if ( !total ) return { why: "a run of no suites proves nothing" };
  if ( (green > total) || (pass > all) ) return { why: "it counts more passed than run" };
  const whole = (green === total) && (pass === all) && (all > 0);
  if ( (verdict === "GREEN") && !whole ) return { why: "a GREEN line counts every suite and every check green" };
  if ( (verdict !== "GREEN") && (green === total) ) return { why: `a ${verdict} line counts a suite short of green` };
  return { run: { id, green, total, pass, all, verdict } };
}

/**
 * The two-run form's groups read.
 * @param {RegExpExecArray} m
 * @returns {{ pair: TwoRunLine } | { why: string }}
 */
function parsePair(m) {
  const [idA = "", idB = "", idC = ""] = [m[1], m[2], m[12]];
  for ( const id of [idA, idB, idC] ) {
    if ( !RUN_ID.test(id) ) return { why: `"${id}" is not a run id (a dist/battery directory name, e.g. 2026-10-15T13-55-32)` };
  }
  if ( new Set([idA, idB, idC]).size !== 3 ) return { why: "the two-run rule names three different runs" };
  const [gA = 0, tA = 0, gB = 0, tB = 0, pA = 0, aA = 0, pB = 0, aB = 0] = [m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11]].map(Number);
  if ( !tA || (tA !== tB) ) return { why: "the two runs count different totals, so they are not runs of one plan" };
  for ( const [g, t, p, a, letter] of /** @type {[number, number, number, number, string][]} */ ([[gA, tA, pA, aA, "A"], [gB, tB, pB, aB, "B"]]) ) {
    if ( (g > t) || (p > a) ) return { why: "it counts more passed than run" };
    const short = t - g;
    if ( !short ) return { why: `run ${letter} counts every suite green: a GREEN run is named alone` };
    if ( short > TWO_RUN_MAX_REDS ) return { why: `run ${letter} is short by ${short} suites; the rule takes one to ${TWO_RUN_MAX_REDS}` };
  }
  const names = String(m[13] ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if ( !names.length || names.some(n => !SUITE_NAME.test(n)) ) return { why: "the one-offs name the suites the rule scratched, comma-separated" };
  if ( names.length > 2 * TWO_RUN_MAX_REDS ) return { why: `the one-offs name ${names.length} suites; two runs red by ${TWO_RUN_MAX_REDS} name at most ${2 * TWO_RUN_MAX_REDS}` };
  return { pair: { a: { id: idA, green: gA, total: tA, pass: pA, all: aA }, b: { id: idB, green: gB, total: tB, pass: pB, all: aB }, c: idC, names } };
}

/**
 * The release rule over an annotated tag's body. It carries exactly one battery line, in one of
 * FORMS; a run's line is GREEN, or a two-run line whose three runs bear the rule out; and when `runOf(id)`
 * finds the runs on this machine, their own reading agrees with the line. Without the runs here (CI has no
 * dist/battery/) the form alone is checked, and `note` says so.
 * @param {string} body
 * @param {{ runOf?: (id: string) => Run | null }} [opts]
 * @returns {{ ok: true, prerelease: boolean, line: string, note: string } | { ok: false, error: string }}
 */
export function checkTagBody(body, { runOf } = {}) {
  const forms = "a release tag's body carries exactly one of:\n"
    + `  ${RUN_FORM}   (the line \`node tools/battery-status.mjs --line\` prints)\n`
    + `  ${TWO_RUN_FORM}   (\`--line <A> --and <B> --one-offs <C>\`: two runs red on different suites, each green alone)\n`
    + `  ${NONE_LINE}   (no run: published as a pre-release, never the latest release)`;
  const refuse = (/** @type {string} */ why) => ({ ok: /** @type {const} */ (false), error: `${why}\n${forms}` });
  const lines = String(body ?? "").split(/\r?\n/).map(l => l.trim()).filter(l => CANDIDATE.test(l));
  if ( !lines.length ) return refuse("the tag's body has no Battery line;");
  if ( lines.length > 1 ) return refuse(`the tag's body has ${lines.length} Battery lines (${lines.map(l => `"${l}"`).join(", ")});`);
  const line = /** @type {string} */ (lines[0]);
  const read = parseLine(line);
  if ( "why" in read ) return refuse(`"${line}" is not a Battery line: ${read.why};`);
  if ( "none" in read ) {
    return { ok: true, prerelease: true, line,
      note: "no battery run: published as a pre-release, never the latest release" };
  }
  if ( "pair" in read ) return checkPair(line, read.pair, runOf, refuse);
  const { run } = read;
  if ( run.verdict !== "GREEN" ) return refuse(`"${line}" names a ${run.verdict} run, and only a GREEN run releases;`);
  const here = runOf ? runOf(run.id) : null;
  if ( !here ) {
    return { ok: true, prerelease: false, line,
      note: `run ${run.id} is not under dist/battery/ on this machine, so the form alone is checked (CI never has the run)` };
  }
  const own = lineOf(here);
  const agrees = (here.green === run.green) && (here.total === run.total) && (here.checks.pass === run.pass)
    && (here.checks.all === run.all) && (here.verdict === run.verdict);
  if ( !agrees ) return refuse(`"${line}" disagrees with the run on this machine, which reads "${own}";`);
  return { ok: true, prerelease: false, line, note: `run ${run.id} is on this machine and reads the same` };
}

/**
 * The two-run line against its three runs: the rule judged over the runs on this machine, and the line's
 * counts and names the runs' own; the form alone when any run is not here.
 * @param {string} line
 * @param {TwoRunLine} pair
 * @param {((id: string) => Run | null) | undefined} runOf
 * @param {(why: string) => { ok: false, error: string }} refuse
 * @returns {{ ok: true, prerelease: boolean, line: string, note: string } | { ok: false, error: string }}
 */
function checkPair(line, pair, runOf, refuse) {
  const [a, b, c] = runOf ? [runOf(pair.a.id), runOf(pair.b.id), runOf(pair.c)] : [null, null, null];
  if ( !a || !b || !c ) {
    const gone = [[pair.a.id, a], [pair.b.id, b], [pair.c, c]].filter(([, run]) => !run).map(([id]) => id);
    return { ok: true, prerelease: false, line,
      note: `run ${gone.join(", ")} not under dist/battery/ on this machine, so the form alone is checked (CI never has the runs)` };
  }
  const judged = judgeTwoRuns(a, b, c);
  if ( !judged.ok ) return refuse(`"${line}" does not hold on this machine: ${judged.why};`);
  const counts = (/** @type {RunCount} */ want, /** @type {Run} */ run) => (run.green === want.green) && (run.total === want.total)
    && (run.checks.pass === want.pass) && (run.checks.all === want.all);
  const names = judged.reds.join(", ");
  if ( !counts(pair.a, a) || !counts(pair.b, b) || ([...pair.names].sort().join(", ") !== names) ) {
    const own = twoRunLine(a, b, c);
    return refuse(`"${line}" disagrees with the runs on this machine, which read "${"line" in own ? own.line : own.why}";`);
  }
  return { ok: true, prerelease: false, line, note: `runs ${a.id}, ${b.id} and ${c.id} are on this machine and bear the two-run rule out (${names} green alone)` };
}

/** The battery's order from its own `--list`, the table it runs; read once. */
let order = /** @type {string[]|null} */ (null);
function listOrder() {
  order ??= execFileSync(process.execPath, [join(REPO, "tools", "battery.mjs"), "--list"], { encoding: "utf8" })
    .split(/\r?\n/).map(l => /^\s{2}(\S+)\s{2,}/.exec(l)?.[1]).filter(n => n !== undefined);
  return order;
}

/**
 * A suite's verdict off its output: `N/M passed`, `ALL PASS`, `N FAILURE(S)`, `swept` (a fixture step).
 * @param {string} body
 * @param {boolean} [step] a seed or sweep, which asserts nothing
 * @returns {{ ok: boolean, pass: number, all: number, summary: string }}
 */
function verdictOf(body, step = false) {
  const lines = body.split(/\r?\n/).reverse();
  const line = lines.find(l => /ALL PASS|FAILURE\(S\)|\d+\/\d+ passed|\d+\/\d+$|swept|FATAL/.test(l)) ?? "";
  const ratio = /(\d+)\/(\d+)/.exec(line);
  if ( ratio ) return { ok: ratio[1] === ratio[2] && !/FAIL/.test(line), pass: Number(ratio[1]), all: Number(ratio[2]), summary: `${ratio[1]}/${ratio[2]}` };
  if ( /ALL PASS/.test(line) ) { const n = (body.match(/^\s*PASS /gm) ?? []).length; return { ok: true, pass: n, all: n, summary: "ALL PASS" }; }
  if ( /swept/.test(line) && !/FAIL|FATAL/.test(line) ) return { ok: true, pass: 0, all: 0, summary: "swept" };
  const n = (body.match(/^\s*PASS /gm) ?? []).length, f = (body.match(/^\s*FAIL /gm) ?? []).length;
  // ⚠ No verdict line and no assertions is a crash (a setup error, a refused preflight), never a pass.
  // A seed or sweep step asserts nothing: only a crash marker fails it.
  const crashed = /FATAL|FAILED|PREFLIGHT|Error:/.test(body) || (!step && (n + f === 0));
  return { ok: !f && !crashed, pass: n, all: n + f, summary: /FATAL/.test(body) ? "FATAL" : (crashed && !f) ? "crashed" : `${n}/${n + f}` };
}
