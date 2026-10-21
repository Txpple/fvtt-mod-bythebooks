/**
 * THE PRELUDE: the one in-page object every suite's `evaluate` body reads its waits and its
 * bookkeeping from (ARCHITECTURE §11 *Adding a TEST*; tools/README.md *Static*, `check-harness`).
 *
 *   const { sleep, until, watch, begin, faces, unrig } = window.__btb;
 *
 * `connectSuite` (harness.mjs) installs it once per page, before any suite body runs; a suite
 * that opens a second page (a player, a planter) installs it there with `installPrelude`.
 * ⚠ `f.evaluate()` serializes its function, so `prelude` closes over nothing: every helper is
 * declared inside it.
 *
 * What it carries, one form each:
 *   sleep(ms)                       a bare wait. ⚠ Only for a module clock (a decision timer, a
 *                                   buzzer, a module's own setTimeout window), with a `clock:` comment
 *   until(test, { timeout, every, label })
 *                                   polls `test` (sync or async) every `every` ms and returns its first
 *                                   truthy value; past `timeout` it THROWS, naming `label` or the
 *                                   predicate's own text
 *   watch(test, { ms, every })      a window for something that must NOT happen: polls the whole `ms`
 *                                   and returns the first truthy value seen, or null
 *   canvasReady() · tokenOn(id) · viewScene(scene)
 *                                   the canvas, a token's placeable, a scene viewed — each an `until`
 *   begin({ sections, titles })     the run's `results`, `log`, `skips` and its `ok`, `want`, `section`
 *   snapshotSettings(keys)          `{ prior, set, restore }` over the module's world settings
 *   faces([[n, of], …]) · unrig()   the dice rigging: each roll draws the next face (the last repeats);
 *                                   `unrig` puts the platform's generator back
 *   stage(name)                     the step the harness heartbeat names (`window.__suiteStage`)
 *   dialogsWith(text)               the open windows (`.application`) whose markup carries `text`, a window
 *                                   CLOSING left out: its element stays in the page through its fade, so a
 *                                   search by text right after an answer finds the window just answered
 */

/** The page side, installed by `installPrelude` as `window.__btb`. Self-contained: it is serialized. */
export const prelude = () => {
  const MOD = "fvtt-mod-bythebooks";
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const textOf = test => String(test).replace(/\s+/g, " ").trim().slice(0, 200);

  const until = async (test, { timeout = 10_000, every = 50, label = null } = {}) => {
    const end = Date.now() + timeout;
    for (;;) {
      const value = await test();
      if (value) return value;
      if (Date.now() >= end) throw new Error(`until: ${label ?? textOf(test)} — not within ${timeout} ms`);
      await sleep(every);
    }
  };

  const watch = async (test, { ms, every = 50 } = {}) => {
    const end = Date.now() + ms;
    for (;;) {
      const value = await test();
      if (value) return value;
      if (Date.now() >= end) return null;
      await sleep(every);
    }
  };

  const canvasReady = (opts = {}) => until(() => canvas.ready, { label: "canvas.ready", ...opts });
  const tokenOn = (id, opts = {}) => until(() => canvas.ready && canvas.tokens.get(id),
    { label: `token ${id} on the canvas`, ...opts });
  const viewScene = async (scene, opts = {}) => {
    if ( canvas.scene?.id !== scene.id ) await scene.view();
    return until(() => canvas.ready && (canvas.scene?.id === scene.id) && canvas,
      { label: `the scene "${scene.name}" viewed`, ...opts });
  };

  const stage = name => { window.__suiteStage = name; };

  // ⚠ ApplicationV2 keeps a closing window's element in the page until its fade ends (state CLOSING), and an answered
  // popup closes over ~200 ms: a section that searches the page by text right after an answer must not find it.
  const dialogsWith = text => [...document.querySelectorAll(".application")].filter(el => {
    const apps = globalThis.foundry?.applications;
    const app = apps?.instances?.get?.(el.id);
    const RENDERED = apps?.api?.ApplicationV2?.RENDER_STATES?.RENDERED ?? 2;
    return (!app || (app.state === RENDERED)) && (el.innerHTML ?? "").includes(text);
  });

  /**
   * The run's ledger: `ok` records an assertion, `want(id)` says whether a section runs (and lists
   * a skipped one), `section(id, fn)` runs a section's body so a throw inside it (an `until` that
   * timed out) fails that section by name and the next one still runs.
   */
  const begin = ({ sections = null, titles = {} } = {}) => {
    const results = [];
    const log = [];
    const skips = [];
    const ok = (name, pass, detail = "") => results.push({ name, pass, detail });
    const want = id => {
      if ( !sections || sections.includes(String(id)) ) return true;
      skips.push(`§${id} ${titles?.[id] ?? ""}`);
      return false;
    };
    const section = async (id, fn) => {
      stage(`§${id}`);
      try { await fn(); }
      catch (err) {
        const at = String(err?.stack ?? "").split("\n").slice(1, 3).map(l => l.trim()).join(" | ");
        results.push({ name: `§${id} threw — ${err?.message ?? err}`, pass: false, detail: at });
      }
    };
    return { results, log, skips, ok, want, section };
  };

  /** The module's world settings `keys` read now; `restore` sets each back, every key in its own guard. */
  const snapshotSettings = keys => {
    const prior = Object.fromEntries(keys.map(k => [k, game.settings.get(MOD, k)]));
    const set = (k, v) => game.settings.set(MOD, k, v);
    const restore = async () => {
      const failed = [];
      for ( const [k, v] of Object.entries(prior) ) {
        try { await set(k, v); }
        catch (err) { failed.push(`${k}: ${err?.message ?? err}`); }
      }
      return failed;
    };
    return { prior, set, restore };
  };

  // ⚠ The platform maps a uniform draw u to the face ceil((1 - u) * of), so u = 1 - (n - 0.5) / of is face n.
  const realPRNG = window.__btb?.realPRNG ?? CONFIG.Dice.randomUniform;
  const faces = spec => {
    const queue = spec.map(([n, of]) => 1 - ((n - 0.5) / of));
    let i = 0;
    CONFIG.Dice.randomUniform = () => queue[Math.min(i++, queue.length - 1)];
  };
  const unrig = () => { CONFIG.Dice.randomUniform = realPRNG; };

  window.__btb = {
    MOD, sleep, until, watch, canvasReady, tokenOn, viewScene, stage, begin, snapshotSettings, faces, unrig, realPRNG, dialogsWith
  };
  return "installed";
};

/** Install the prelude on a connected page; throws when it does not take. */
export async function installPrelude(f) {
  const done = await f.evaluate(prelude, null);
  if (done !== "installed") throw new Error(`the prelude did not install (${done})`);
}
