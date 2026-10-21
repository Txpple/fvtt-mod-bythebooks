import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installPrelude, prelude } from "../tools/prelude.mjs";

/*
 * THE PRELUDE (tools/prelude.mjs) — the in-page object every live suite reads its waits from. It
 * runs here against stand-ins for the page's globals: `window` is the global object, `canvas`,
 * `game` and `CONFIG` small fakes.
 */

const real = {};
beforeEach(() => {
  for (const k of ["window", "canvas", "game", "CONFIG"]) real[k] = globalThis[k];
  globalThis.window = globalThis;
  delete globalThis.__btb;
  delete globalThis.__suiteStage;
  const store = new Map([
    ["fvtt-mod-bythebooks.a", 1],
    ["fvtt-mod-bythebooks.b", "two"]
  ]);
  globalThis.game = {
    settings: {
      get: (ns, k) => store.get(`${ns}.${k}`),
      set: async (ns, k, v) => {
        if (k === "broken") throw new Error("refused");
        store.set(`${ns}.${k}`, v);
        return v;
      }
    }
  };
  globalThis.canvas = { ready: false, scene: null, tokens: new Map() };
  globalThis.CONFIG = { Dice: { randomUniform: Math.random } };
  prelude();
});
afterEach(() => {
  delete globalThis.__btb;
  delete globalThis.__suiteStage;
  for (const [k, v] of Object.entries(real)) {
    if (v === undefined) delete globalThis[k];
    else globalThis[k] = v;
  }
});

const btb = () => globalThis.__btb;

describe("until — one poll, and a timeout that throws", () => {
  it("returns the first truthy value, sync or async", async () => {
    let n = 0;
    expect(await btb().until(() => (++n >= 3 ? `seen at ${n}` : null), { every: 1 })).toBe(
      "seen at 3"
    );
    expect(await btb().until(async () => 7, { every: 1 })).toBe(7);
  });

  it("throws with the label, or the predicate's own text when there is none", async () => {
    await expect(
      btb().until(() => false, { timeout: 20, every: 5, label: "the card" })
    ).rejects.toThrow("until: the card — not within 20 ms");
    await expect(
      btb().until(() => globalThis.canvas.ready, { timeout: 20, every: 5 })
    ).rejects.toThrow(/until: \(\) => globalThis\.canvas\.ready — not within 20 ms/);
  });

  it("the canvas waits are untils: a token that never lands names itself", async () => {
    await expect(btb().tokenOn("T1", { timeout: 20 })).rejects.toThrow(/token T1 on the canvas/);
    globalThis.canvas.ready = true;
    globalThis.canvas.tokens.set("T1", { id: "T1" });
    expect(await btb().tokenOn("T1")).toEqual({ id: "T1" });
    const scene = {
      id: "S",
      name: "Range",
      view: async () => {
        globalThis.canvas.scene = { id: "S" };
      }
    };
    expect(await btb().viewScene(scene)).toBe(globalThis.canvas);
  });
});

describe("watch — a window for what must not happen", () => {
  it("waits the whole window and returns null when nothing arrives", async () => {
    const t0 = Date.now();
    expect(await btb().watch(() => false, { ms: 30, every: 5 })).toBeNull();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
  });

  it("returns what arrived, as soon as it arrives", async () => {
    let n = 0;
    expect(
      await btb().watch(() => (++n === 2 ? "the wrong card" : null), { ms: 1000, every: 1 })
    ).toBe("the wrong card");
  });
});

describe("begin — the run's ledger", () => {
  it("want runs everything unfiltered, and lists a filtered-out section as skipped", () => {
    const all = btb().begin();
    expect(all.want(4)).toBe(true);
    const some = btb().begin({ sections: ["2"], titles: { 3: "the third" } });
    expect(some.want(2)).toBe(true);
    expect(some.want(3)).toBe(false);
    expect(some.skips).toEqual(["§3 the third"]);
  });

  it("a section that throws fails by name, names its stage, and the next section still runs", async () => {
    const run = btb().begin();
    await run.section(5, async () => {
      await btb().until(() => false, { timeout: 5, every: 1, label: "the popup" });
    });
    expect(globalThis.__suiteStage).toBe("§5");
    await run.section(6, async () => {
      run.ok("6a. after", true);
    });
    expect(run.results.map(r => [r.name.split(" — ")[0], r.pass])).toEqual([
      ["§5 threw", false],
      ["6a. after", true]
    ]);
    expect(run.results[0].name).toMatch(/until: the popup/);
  });
});

describe("snapshotSettings and the dice", () => {
  it("restore puts each key back, every key in its own guard", async () => {
    const s = btb().snapshotSettings(["a", "b", "broken"]);
    await s.set("a", 9);
    expect(globalThis.game.settings.get("fvtt-mod-bythebooks", "a")).toBe(9);
    expect(await s.restore()).toEqual(["broken: refused"]);
    expect(globalThis.game.settings.get("fvtt-mod-bythebooks", "a")).toBe(1);
  });

  it("faces draws each face in turn under the platform's mapping, the last repeating; unrig restores", () => {
    btb().faces([
      [19, 20],
      [3, 6]
    ]);
    const face = of => Math.ceil((1 - globalThis.CONFIG.Dice.randomUniform()) * of);
    expect([face(20), face(6), face(6)]).toEqual([19, 3, 3]);
    btb().unrig();
    expect(globalThis.CONFIG.Dice.randomUniform).toBe(Math.random);
  });

  it("a second install keeps the platform's generator, even when the dice are rigged", () => {
    btb().faces([[1, 20]]);
    prelude();
    btb().unrig();
    expect(globalThis.CONFIG.Dice.randomUniform).toBe(Math.random);
  });
});

describe("dialogsWith — the open windows by their text, a closing one left out", () => {
  const RENDERED = 2;
  const CLOSING = -2;
  const el = (id, html) => ({ id, innerHTML: html });
  let pageEls;
  let realDocument;
  let realFoundry;
  beforeEach(() => {
    realDocument = globalThis.document;
    realFoundry = globalThis.foundry;
    pageEls = [];
    globalThis.document = { querySelectorAll: sel => (sel === ".application" ? pageEls : []) };
    globalThis.foundry = {
      applications: {
        instances: new Map(),
        api: { ApplicationV2: { RENDER_STATES: { RENDERED, CLOSING } } }
      }
    };
  });
  afterEach(() => {
    if (realDocument === undefined) delete globalThis.document;
    else globalThis.document = realDocument;
    if (realFoundry === undefined) delete globalThis.foundry;
    else globalThis.foundry = realFoundry;
  });
  const btb = () => globalThis.__btb;

  it("a window answered and fading out is not found; the one opened after it is", () => {
    const answered = el("dialog-96", "BTB Shield Master — Hobgoblin failed: choose … Knock Prone");
    const next = el("dialog-97", "BTB Shield Master — Hobgoblin failed: choose … Knock Prone");
    pageEls.push(answered, next);
    globalThis.foundry.applications.instances.set("dialog-96", { state: CLOSING });
    globalThis.foundry.applications.instances.set("dialog-97", { state: RENDERED });
    expect(btb().dialogsWith("Knock Prone")).toEqual([next]);
  });

  it("matches on the markup's text, and an element no application owns still counts", () => {
    pageEls.push(el("a", "Push 5 feet"), el("b", "something else"));
    expect(
      btb()
        .dialogsWith("Push 5 feet")
        .map(e => e.id)
    ).toEqual(["a"]);
    expect(btb().dialogsWith("nothing")).toEqual([]);
  });
});

describe("installPrelude", () => {
  it("evaluates the prelude on the page and refuses a page where it does not take", async () => {
    const page = { evaluate: async fn => fn() };
    await expect(installPrelude(page)).resolves.toBeUndefined();
    await expect(installPrelude({ evaluate: async () => "no page" })).rejects.toThrow(
      /did not install \(no page\)/
    );
  });
});
