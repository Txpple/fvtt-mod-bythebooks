import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  checkTagBody,
  FORMS,
  judgeTwoRuns,
  lineOf,
  NONE_LINE,
  parseLine,
  readRun,
  twoRunLine
} from "../tools/battery-line.mjs";

/*
 * THE BATTERY LINE (tools/battery-line.mjs) — one run in one line, and the release rule over a tag
 * body. The runs here are small fake run directories in the shape battery.mjs writes: a plan.json
 * of rows and one <row>.txt per finished row, its verdict on its last summary line.
 */

const ROOT = mkdtempSync(join(tmpdir(), "battery-line-"));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

/** A run directory: `files` maps a row to its output; a row in `plan` without one is unfinished. */
function fakeRun(id, plan, files) {
  const dir = join(ROOT, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plan.json"), `${JSON.stringify(plan)}\n`);
  for (const [row, body] of Object.entries(files)) writeFileSync(join(dir, `${row}.txt`), body);
  return dir;
}

const PLAN = ["setup-fixtures", "smoke-alert", "smoke-hold", "check-popup-routing"];
const GREEN_FILES = {
  "setup-fixtures": "[fixtures] built 22 actors\n",
  "smoke-alert": "[alert] swept the downed leftovers\n  PASS a\n[alert] 10/10 passed\n",
  "smoke-hold": "[hold] 51/51 passed\n",
  "check-popup-routing": "  PASS one\n  PASS two\n[topo] ALL PASS\n"
};
const GREEN_ID = "2026-10-15T13-55-32";
const RED_ID = "2026-10-15T13-35-41";
const PARTIAL_ID = "2026-10-15T14-00-00";
const greenDir = fakeRun(GREEN_ID, PLAN, GREEN_FILES);
const redDir = fakeRun(RED_ID, PLAN, { ...GREEN_FILES, "smoke-hold": "[hold] 50/51 passed\n" });
const partialDir = fakeRun(PARTIAL_ID, PLAN, {
  "setup-fixtures": GREEN_FILES["setup-fixtures"],
  "smoke-alert": GREEN_FILES["smoke-alert"]
});
const GREEN_LINE = `Battery: ${GREEN_ID} — 4/4 suites, 63/63 checks, GREEN`;
const runs = { [GREEN_ID]: greenDir, [RED_ID]: redDir, [PARTIAL_ID]: partialDir };
const runOf = id => (runs[id] ? readRun(runs[id]) : null);

/** A tag body in the shape of a release's notes, with `line` among them. */
const notes = (...lines) =>
  ["- **A fix.** What it does now.", "", ...lines, "", "- **Another.** And this."].join("\n");

describe("readRun and lineOf — the run in one line", () => {
  it("a finished green run: every entry green, the checks summed, GREEN", () => {
    const run = readRun(greenDir);
    expect(run.id).toBe(GREEN_ID);
    expect(run.total).toBe(4);
    expect(run.green).toBe(4);
    expect(run.checks).toEqual({ pass: 63, all: 63 });
    expect(lineOf(run)).toBe(GREEN_LINE);
  });

  it("a finished entry red is a RED run, its suite and its check short", () => {
    expect(lineOf(readRun(redDir))).toBe(`Battery: ${RED_ID} — 3/4 suites, 62/63 checks, RED`);
  });

  it("an entry with no output is a PARTIAL run, counted over the whole plan", () => {
    expect(lineOf(readRun(partialDir))).toBe(
      `Battery: ${PARTIAL_ID} — 2/4 suites, 10/10 checks, PARTIAL`
    );
  });

  it("a red entry outranks an unfinished one: the run is RED", () => {
    const dir = fakeRun("2026-10-15T15-00-00", PLAN, {
      "setup-fixtures": GREEN_FILES["setup-fixtures"],
      "smoke-alert": "[alert] 9/10 passed\n"
    });
    expect(readRun(dir).verdict).toBe("RED");
  });

  it("a run without a plan.json reads the battery's order", () => {
    const dir = join(ROOT, "2026-10-15T16-00-00");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "smoke-hold.txt"), "[hold] 51/51 passed\n");
    const run = readRun(dir, () => ["smoke-hold"]);
    expect(lineOf(run)).toBe("Battery: 2026-10-15T16-00-00 — 1/1 suites, 51/51 checks, GREEN");
  });

  it("the line it prints is the line the parser reads back", () => {
    for (const dir of [greenDir, redDir, partialDir]) {
      const run = readRun(dir);
      expect(parseLine(lineOf(run))).toEqual({
        run: {
          id: run.id,
          green: run.green,
          total: run.total,
          pass: run.checks.pass,
          all: run.checks.all,
          verdict: run.verdict
        }
      });
    }
  });
});

describe("checkTagBody — the forms", () => {
  it("accepts a GREEN run line among the notes: a release, the form alone without the run here", () => {
    const r = checkTagBody(notes(GREEN_LINE));
    expect(r).toMatchObject({ ok: true, prerelease: false, line: GREEN_LINE });
    expect(r.note).toMatch(/form alone/);
  });

  it("accepts an ASCII hyphen for the dash", () => {
    const ascii = GREEN_LINE.replace(" — ", " - ");
    expect(checkTagBody(notes(ascii))).toMatchObject({ ok: true, prerelease: false, line: ascii });
  });

  it("accepts a CRLF body", () => {
    expect(checkTagBody(notes(GREEN_LINE).replace(/\n/g, "\r\n")).ok).toBe(true);
  });

  it("accepts the no-run line as a pre-release", () => {
    const r = checkTagBody(notes(NONE_LINE));
    expect(r).toMatchObject({ ok: true, prerelease: true, line: NONE_LINE });
    expect(r.note).toMatch(/pre-release/);
  });

  it("refuses a body with no Battery line, quoting both forms", () => {
    const r = checkTagBody(
      notes("The first full battery since the last release ran before this one.")
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no Battery line/);
    for (const form of FORMS) expect(r.error).toContain(form);
  });

  it("refuses an empty body", () => {
    expect(checkTagBody("").ok).toBe(false);
  });

  it("refuses a RED line and a PARTIAL line, quoting both forms", () => {
    for (const line of [
      `Battery: ${RED_ID} — 3/4 suites, 62/63 checks, RED`,
      `Battery: ${PARTIAL_ID} — 2/4 suites, 10/10 checks, PARTIAL`
    ]) {
      const r = checkTagBody(notes(line));
      expect(r.ok, line).toBe(false);
      expect(r.error).toMatch(/only a GREEN run releases/);
      for (const form of FORMS) expect(r.error).toContain(form);
    }
  });

  it("refuses a malformed line, quoting both forms", () => {
    for (const line of [
      "Battery: none",
      "Battery: none (prerelease)",
      "battery: none (pre-release)",
      "- Battery: none (pre-release)",
      "**Battery:** none (pre-release)",
      `Battery: ${GREEN_ID} 4/4 suites, 63/63 checks, GREEN`,
      `Battery: ${GREEN_ID} — 4/4 suites, 63/63 checks, green`,
      `Battery: ${GREEN_ID} — 4/4 suites, 63/63 checks`,
      "Battery: latest — 4/4 suites, 63/63 checks, GREEN",
      "Battery: ../../etc — 4/4 suites, 63/63 checks, GREEN",
      `Battery: ${GREEN_ID} — 3/4 suites, 63/63 checks, GREEN`,
      `Battery: ${GREEN_ID} — 4/4 suites, 62/63 checks, GREEN`,
      `Battery: ${GREEN_ID} — 0/0 suites, 0/0 checks, GREEN`,
      `Battery: ${GREEN_ID} — 4/4 suites, 0/0 checks, GREEN`,
      `Battery: ${GREEN_ID} — 5/4 suites, 63/63 checks, RED`,
      `Battery: ${GREEN_ID} — 4/4 suites, 62/63 checks, RED`,
      `Battery: ${GREEN_ID} â€” 4/4 suites, 63/63 checks, GREEN`
    ]) {
      const r = checkTagBody(notes(line));
      expect(r.ok, line).toBe(false);
      expect(r.error, line).toMatch(/is not a Battery line/);
      for (const form of FORMS) expect(r.error).toContain(form);
    }
  });

  it("refuses a body with two Battery lines, even two alike", () => {
    for (const pair of [
      [GREEN_LINE, NONE_LINE],
      [GREEN_LINE, GREEN_LINE]
    ]) {
      const r = checkTagBody(notes(pair[0], "", pair[1]));
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/2 Battery lines/);
      for (const form of FORMS) expect(r.error).toContain(form);
    }
  });
});

describe("checkTagBody — the line against its run", () => {
  it("a GREEN line its run on this machine agrees with", () => {
    const r = checkTagBody(notes(GREEN_LINE), { runOf });
    expect(r).toMatchObject({ ok: true, prerelease: false });
    expect(r.note).toMatch(/reads the same/);
  });

  it("a GREEN line over a RED run is refused, with the run's own line", () => {
    const claim = `Battery: ${RED_ID} — 4/4 suites, 63/63 checks, GREEN`;
    const r = checkTagBody(notes(claim), { runOf });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/disagrees with the run on this machine/);
    expect(r.error).toContain(`Battery: ${RED_ID} — 3/4 suites, 62/63 checks, RED`);
  });

  it("a GREEN line over an unfinished run is refused", () => {
    const claim = `Battery: ${PARTIAL_ID} — 4/4 suites, 10/10 checks, GREEN`;
    expect(checkTagBody(notes(claim), { runOf }).ok).toBe(false);
  });

  it("a GREEN line whose counts are not its run's is refused", () => {
    const claim = `Battery: ${GREEN_ID} — 4/4 suites, 64/64 checks, GREEN`;
    const r = checkTagBody(notes(claim), { runOf });
    expect(r.ok).toBe(false);
    expect(r.error).toContain(GREEN_LINE);
  });

  it("a run not on this machine checks the form alone, and says so", () => {
    const elsewhere = "Battery: 2026-10-01T00-00-00 — 45/45 suites, 1691/1691 checks, GREEN";
    const r = checkTagBody(notes(elsewhere), { runOf });
    expect(r).toMatchObject({ ok: true, prerelease: false });
    expect(r.note).toMatch(/not under dist\/battery\/ on this machine.*form alone/);
  });
});

/*
 * THE TWO-RUN RULE (RULINGS *The two-run rule*): two full runs of one plan, each red by one to three
 * suites, no suite red in both, every red suite green alone in a third run — the pair releases.
 */
describe("the two-run rule — judgeTwoRuns, twoRunLine, the pair form", () => {
  const A_ID = "2026-10-22T16-04-11";
  const B_ID = "2026-10-22T16-54-46";
  const C_ID = "2026-10-22T18-02-10";
  const redAlert = {
    ...GREEN_FILES,
    "smoke-alert": "[alert] swept\n  PASS a\n  FAIL b\n[alert] 9/10 passed\n"
  };
  const redHold = { ...GREEN_FILES, "smoke-hold": "[hold] 50/51 passed\n" };
  const runA = readRun(fakeRun(A_ID, PLAN, redAlert));
  const runB = readRun(fakeRun(B_ID, PLAN, redHold));
  const runC = readRun(
    fakeRun(C_ID, ["setup-fixtures", "smoke-alert", "smoke-hold"], {
      "setup-fixtures": GREEN_FILES["setup-fixtures"],
      "smoke-alert": GREEN_FILES["smoke-alert"],
      "smoke-hold": GREEN_FILES["smoke-hold"]
    })
  );
  const PAIR_LINE = `Battery: ${A_ID} + ${B_ID} — 3/4 + 3/4 suites, 62/63 + 62/63 checks, GREEN by the two-run rule; one-offs ${C_ID}: smoke-alert, smoke-hold`;
  const three = { [A_ID]: runA, [B_ID]: runB, [C_ID]: runC };
  const runOf3 = id => three[id] ?? null;

  it("two runs red on different suites, each green alone: the pair line, read back", () => {
    expect(judgeTwoRuns(runA, runB, runC)).toEqual({
      ok: true,
      reds: ["smoke-alert", "smoke-hold"]
    });
    expect(twoRunLine(runA, runB, runC)).toEqual({
      line: PAIR_LINE,
      reds: ["smoke-alert", "smoke-hold"]
    });
    expect(parseLine(PAIR_LINE)).toEqual({
      pair: {
        a: { id: A_ID, green: 3, total: 4, pass: 62, all: 63 },
        b: { id: B_ID, green: 3, total: 4, pass: 62, all: 63 },
        c: C_ID,
        names: ["smoke-alert", "smoke-hold"]
      }
    });
  });

  it("the same suite red in both runs is a defect, not a flake", () => {
    const again = readRun(fakeRun("2026-10-22T17-00-00", PLAN, redAlert));
    expect(judgeTwoRuns(runA, again, runC)).toMatchObject({
      ok: false,
      why: expect.stringMatching(/smoke-alert red in both/)
    });
  });

  it("a run red by more than three suites, a GREEN run, or a PARTIAL run is not the rule's", () => {
    const four = readRun(
      fakeRun("2026-10-22T17-01-00", PLAN, {
        "setup-fixtures": "[fixtures] FATAL\n",
        "smoke-alert": "[alert] 9/10 passed\n",
        "smoke-hold": "[hold] 50/51 passed\n",
        "check-popup-routing": "  FAIL one\n[topo] 1 FAILURE(S)\n"
      })
    );
    expect(judgeTwoRuns(four, runB, runC)).toMatchObject({
      ok: false,
      why: expect.stringMatching(/red by 4 suites/)
    });
    expect(judgeTwoRuns(readRun(greenDir), runB, runC)).toMatchObject({
      ok: false,
      why: expect.stringMatching(/GREEN on its own/)
    });
    expect(judgeTwoRuns(readRun(partialDir), runB, runC)).toMatchObject({
      ok: false,
      why: expect.stringMatching(/PARTIAL/)
    });
  });

  it("the one-offs must run every red suite and be green", () => {
    const short = readRun(
      fakeRun("2026-10-22T17-02-00", ["smoke-alert"], { "smoke-alert": GREEN_FILES["smoke-alert"] })
    );
    expect(judgeTwoRuns(runA, runB, short)).toMatchObject({
      ok: false,
      why: expect.stringMatching(/smoke-hold not green alone/)
    });
    const red = readRun(
      fakeRun("2026-10-22T17-03-00", ["smoke-alert", "smoke-hold"], {
        "smoke-alert": GREEN_FILES["smoke-alert"],
        "smoke-hold": "[hold] 50/51 passed\n"
      })
    );
    expect(judgeTwoRuns(runA, runB, red)).toMatchObject({
      ok: false,
      why: expect.stringMatching(/one-offs run .* is red: smoke-hold/)
    });
  });

  it("two runs of different plans are not a pair", () => {
    const other = readRun(
      fakeRun("2026-10-22T17-04-00", ["setup-fixtures", "smoke-hold"], {
        "setup-fixtures": GREEN_FILES["setup-fixtures"],
        "smoke-hold": "[hold] 50/51 passed\n"
      })
    );
    expect(judgeTwoRuns(runA, other, runC)).toMatchObject({
      ok: false,
      why: expect.stringMatching(/not runs of one plan/)
    });
  });

  it("checkTagBody: the pair line releases, the runs here bearing it out; the form alone on CI", () => {
    const here = checkTagBody(notes(PAIR_LINE), { runOf: runOf3 });
    expect(here).toMatchObject({ ok: true, prerelease: false, line: PAIR_LINE });
    expect(here.note).toMatch(/bear the two-run rule out/);
    const ci = checkTagBody(notes(PAIR_LINE));
    expect(ci).toMatchObject({ ok: true, prerelease: false, line: PAIR_LINE });
    expect(ci.note).toMatch(/form alone/);
  });

  it("checkTagBody refuses a pair line its runs do not bear out, and a malformed one", () => {
    const wrongNames = PAIR_LINE.replace("smoke-alert, smoke-hold", "smoke-alert");
    expect(checkTagBody(notes(wrongNames), { runOf: runOf3 })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/disagrees with the runs/)
    });
    const wrongCount = PAIR_LINE.replace("3/4 + 3/4", "4/4 + 3/4");
    expect(checkTagBody(notes(wrongCount))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/counts every suite green/)
    });
    const tooRed = PAIR_LINE.replace("3/4 + 3/4", "0/4 + 3/4");
    expect(checkTagBody(notes(tooRed))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/short by 4 suites/)
    });
    const twice = PAIR_LINE.replace(B_ID, A_ID);
    expect(checkTagBody(notes(twice))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/three different runs/)
    });
    for (const form of FORMS) expect(checkTagBody(notes("nothing")).error).toContain(form);
  });
});
