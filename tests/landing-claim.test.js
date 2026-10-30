import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The platform's registry, as the dispatcher sees it: one listener per hook name. */
const platform = new Map();
globalThis.Hooks = {
  on: (hook, fn) => {
    platform.set(hook, fn);
    return 1;
  },
  once: () => 1,
  call: () => true,
  callAll: () => {}
};

/** The users the liveness rule reads: `w` and `x` GMs, `me` this client's own. */
const users = new Map();
const user = (id, active) => users.set(id, { id, active, isSelf: id === "me", isGM: true });
/** The chat log the re-drive resumes. */
const log = [];
const world = {
  ready: true,
  modules: { get: () => null },
  messages: { get: id => log.find(m => m.id === id) ?? null, contents: log },
  users: { activeGM: null, get: id => users.get(id) ?? null },
  user: { id: "me", isGM: true, flags: {} },
  time: {
    get serverTime() {
      return Date.now();
    }
  }
};
Object.assign(globalThis, {
  game: world,
  foundry: {
    utils: {
      deepClone: v => structuredClone(v),
      getProperty: (o, path) => path.split(".").reduce((v, k) => v?.[k], o),
      setProperty: (o, path, value) => {
        const keys = path.split(".");
        const last = keys.pop();
        const at = keys.reduce((v, k) => (v[k] ??= {}), o);
        at[last] = value;
        return true;
      }
    }
  },
  window: { addEventListener: () => {} },
  document: { addEventListener: () => {} },
  HTMLElement: class {}
});

const core = await import("../scripts/core.js");
const { claimStamp, claimHolds, claimLanding, CLAIM_CEILING_MS, WINDOW_ID } = core;
const { registerResumable } = await import("../scripts/ui.js");

/** A card whose `record` flag is what the document holds; `setFlag` stores what the serializer writes. */
function card(id, record) {
  const message = {
    id,
    record,
    writes: 0,
    getFlag: (_scope, key) => (key === "landProbe" ? message.record : null),
    setFlag: async (_scope, _key, value) => {
      message.writes++;
      const next = { ...message.record };
      for (const [k, v] of Object.entries(value)) {
        if (k.startsWith("-=")) delete next[k.slice(2)];
        else next[k] = v;
      }
      message.record = next;
    }
  };
  return message;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  users.clear();
  user("me", true);
  user("w", true);
  user("x", true);
  log.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

/** THE STAMP (core.js `claimStamp`, ARCHITECTURE §4 *The flow elect*): who claimed, in which window, when. */
describe("claimStamp — the claim names its claimant", () => {
  it("carries this client's user, its window and the server's time", () => {
    expect(claimStamp()).toEqual({ by: "me", window: WINDOW_ID, at: 1_000_000 });
  });
});

/** THE LIVENESS RULE (core.js `claimHolds`): a claim holds while its user is on and it is younger than the ceiling. */
describe("claimHolds — a claim is dead once its claimant is gone", () => {
  const stamp = (by, at = 1_000_000) => ({ by, window: "w1", at });

  it("holds nothing for no claim, and always holds a claim written before the stamp", () => {
    expect(claimHolds(undefined)).toBe(false);
    expect(claimHolds(null)).toBe(false);
    expect(claimHolds(false)).toBe(false);
    expect(claimHolds(true)).toBe(true);
  });

  it("holds a fresh claim of a connected user", () => {
    expect(claimHolds(stamp("x"))).toBe(true);
    expect(claimHolds(stamp("me"))).toBe(true);
  });

  it("is dead once its user is no longer active, or is no user at all", () => {
    users.get("x").active = false;
    expect(claimHolds(stamp("x"))).toBe(false);
    expect(claimHolds(stamp("gone"))).toBe(false);
    expect(claimHolds({ window: "w1", at: 1_000_000 })).toBe(false);
  });

  it("is dead past the ceiling though its user stays on (a window closed mid-landing)", () => {
    const old = stamp("x", 1_000_000 - CLAIM_CEILING_MS);
    expect(claimHolds(old)).toBe(true);
    expect(claimHolds(old, 1_000_001)).toBe(false);
    expect(CLAIM_CEILING_MS).toBe(60_000);
  });
});

/** THE CLAIM (core.js `claimLanding`): one helper writes it, inside the serializer, over a dead claim only. */
describe("claimLanding — the claim taken, refused, or written over a dead one", () => {
  const due = current => current.status === "placed";

  it("claims a due record with the stamp and answers it took no claim over", async () => {
    const m = card("c1", { status: "placed" });
    await expect(claimLanding(m, "landProbe", due)).resolves.toEqual({ over: null });
    expect(m.record.applying).toEqual({ by: "me", window: WINDOW_ID, at: 1_000_000 });
  });

  it("refuses a record not due, one already landed, and one a live claim holds — writing nothing", async () => {
    const asked = card("c2", { status: "asked" });
    const landed = card("c3", { status: "placed", applied: true });
    const held = card("c4", { status: "placed", applying: { by: "x", window: "xw", at: 999_000 } });
    const old = card("c5", { status: "placed", applying: true });
    for (const m of [asked, landed, held, old])
      await expect(claimLanding(m, "landProbe", due)).resolves.toBeNull();
    expect([asked, landed, held, old].map(m => m.writes)).toEqual([0, 0, 0, 0]);
    expect(held.record.applying.by).toBe("x");
  });

  it("writes over a dead claim and hands it back, so the landing can find what the dead one left", async () => {
    users.get("x").active = false;
    const dead = { by: "x", window: "xw", at: 999_000 };
    const m = card("c6", { status: "placed", applying: dead });
    await expect(claimLanding(m, "landProbe", due)).resolves.toEqual({ over: dead });
    expect(m.record.applying.by).toBe("me");
  });

  it("claims another field against another done marker (initiative-grants' fallback)", async () => {
    const m = card("c7", { status: "resolved", answer: "no", fallback: true });
    const opts = { field: "fallbackApplying", done: "fallbackApplied" };
    await expect(claimLanding(m, "landProbe", c => c.answer === "no", opts)).resolves.toEqual({
      over: null
    });
    expect(m.record.fallbackApplying.by).toBe("me");
    expect(m.record.applying).toBeUndefined();
    m.record.fallbackApplied = true;
    await expect(claimLanding(m, "landProbe", c => c.answer === "no", opts)).resolves.toBeNull();
  });

  it("claims a nested field, and a step its own due ends (done: null; summons' companion errand, issue #21)", async () => {
    const opts = { field: "companion.acting", done: null };
    const due = c => !!c.companion?.ask;
    const m = card("c8", { status: "placed", companion: { ask: { kind: "away" }, acting: false } });
    await expect(claimLanding(m, "landProbe", due, opts)).resolves.toEqual({ over: null });
    expect(m.record.companion.acting.by).toBe("me");
    expect(m.record.companion.ask).toEqual({ kind: "away" });
    // a live claim holds; a claim whose user left is written over
    await expect(claimLanding(m, "landProbe", due, opts)).resolves.toBeNull();
    const dead = { by: "gone", window: "gw", at: 999_000 };
    m.record.companion.acting = dead;
    await expect(claimLanding(m, "landProbe", due, opts)).resolves.toEqual({ over: dead });
    m.record.companion = { ask: null, acting: false };
    await expect(claimLanding(m, "landProbe", due, opts)).resolves.toBeNull();
  });
});

/**
 * THE RE-DRIVE (ui.js, ARCHITECTURE §4 *The flow elect*): a resumable's `pending` reads a dead claim as none, and a
 * user leaving resumes the recent cards; a window handed its user's lead resumes now and again past the ceiling.
 */
describe("the re-drive — a dead claim's record is landed by whoever drives it now", () => {
  const drive = vi.fn(async () => {});
  registerResumable("landProbe", {
    pending: flag => flag.status === "placed" && !flag.applied && !claimHolds(flag.applying),
    drives: () => true,
    drive
  });
  const settle = () => vi.advanceTimersByTimeAsync(0);
  beforeEach(() => {
    drive.mockClear();
    world.user.flags = {};
  });

  it("drives the record of a claimant who left, on the departure, and leaves a live claim alone", async () => {
    const left = card("r1", { status: "placed", applying: { by: "x", window: "xw", at: 999_500 } });
    const live = card("r2", { status: "placed", applying: { by: "w", window: "ww", at: 999_500 } });
    const landed = card("r3", { status: "placed", applied: true, applying: false });
    log.push(left, live, landed);
    users.get("x").active = false;
    platform.get("userConnected")?.(users.get("x"), false);
    await settle();
    expect(drive).toHaveBeenCalledTimes(1);
    expect(drive).toHaveBeenCalledWith(left);
  });

  it("does not resume on an arrival", async () => {
    log.push(card("r4", { status: "placed" }));
    platform.get("userConnected")?.(users.get("x"), true);
    await settle();
    expect(drive).not.toHaveBeenCalled();
  });

  it("a window handed the lead lands its own user's claim from a closed window once the claim passes the ceiling", async () => {
    const orphan = card("r5", {
      status: "placed",
      applying: { by: "me", window: "closed", at: 1_000_000 }
    });
    log.push(orphan);
    // the leader's flag cleared as it closed: this window leads by its absence
    platform.get("updateUser")?.(users.get("me"), {});
    await settle();
    expect(drive).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(CLAIM_CEILING_MS + 1000);
    expect(drive).toHaveBeenCalledTimes(1);
    expect(drive).toHaveBeenCalledWith(orphan);
  });

  it("a window that takes the lead itself (its own id on the flag) is not handed it", async () => {
    log.push(
      card("r6", { status: "placed", applying: { by: "me", window: "closed", at: 1_000_000 } })
    );
    // another window of this user leads, then this one claims it: its own claim resumes, a hand-over does not
    world.user.flags = { "fvtt-mod-bythebooks": { leadWindow: "other" } };
    platform.get("updateUser")?.(users.get("me"), {});
    world.user.flags = { "fvtt-mod-bythebooks": { leadWindow: WINDOW_ID } };
    platform.get("updateUser")?.(users.get("me"), {});
    await vi.advanceTimersByTimeAsync(CLAIM_CEILING_MS + 1000);
    expect(drive).not.toHaveBeenCalled();
  });
});
