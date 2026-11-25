import { beforeEach, describe, expect, it, vi } from "vitest";

/** Every handler the module hangs on a platform hook, so a test can play the platform's render. */
const hooks = new Map();
globalThis.Hooks = {
  on: (hook, fn) => {
    hooks.set(hook, [...(hooks.get(hook) ?? []), fn]);
    return 1;
  },
  once: () => 1,
  call: () => true,
  callAll: () => {}
};

class ActorStub {
  constructor() {
    this.isOwner = true;
    /** @type {ReturnType<typeof rollDialog>[]} */
    this.dialogs = [];
    this.rollSavingThrow = vi.fn((_config, dialog) => {
      const app = rollDialog(dialog);
      this.dialogs.push(app);
      return app.rolled;
    });
  }
}

/**
 * The system's roll dialog as the save ask meets it: built by the roll, rendered by the platform a beat
 * later, and its promise settled by the "close" event, which the platform fires only once the closing
 * transition has run (`endTransition`).
 */
function rollDialog(dialog) {
  let settle;
  let endTransition;
  const transition = new Promise(resolve => {
    endTransition = resolve;
  });
  const app = {
    options: dialog.options,
    position: {},
    setPosition() {},
    bringToFront: vi.fn(),
    closes: 0,
    endTransition,
    rolled: new Promise(resolve => {
      settle = resolve;
    }),
    close: async () => {
      app.closes += 1;
      await transition;
      settle([]);
    }
  };
  return app;
}

const actors = new Map();
const cards = new Map();
Object.assign(globalThis, {
  Actor: ActorStub,
  game: {
    modules: { get: () => null },
    messages: { get: id => cards.get(id) ?? null, some: () => false, find: () => undefined },
    users: { activeGM: null }
  },
  ui: { chat: { updateMessage: () => {} } },
  fromUuid: async uuid => actors.get(uuid) ?? null,
  requestAnimationFrame: () => 0
});

const { openSaveDialog } = await import("../scripts/saves/ask.js");
const { claimOpening, releaseOpening, closePopup, livePopups } = await import("../scripts/ui.js");

/** A dialog element already drawn on: every query finds a node, so the handlers adopt it and draw nothing. */
const element = () => ({ querySelector: () => ({ dataset: {} }), querySelectorAll: () => [] });
/** The platform renders a roll dialog: every module handler on the render hook runs. */
const render = app => {
  for (const fn of hooks.get("renderRollConfigurationDialog") ?? []) fn(app, element());
};
/** Let the opener run to its roll (its awaits are microtasks; a macrotask is past them all). */
const settle = () => new Promise(resolve => setTimeout(resolve));

const UUID = "Actor.wizard";
const SUB = `save:${UUID}`;
let next = 0;
/** A pending area demand on a fresh card, its one target owned by this client. */
function demand() {
  const entry = { uuid: UUID, name: "The Wizard" };
  const flag = { status: "pending", dc: 13, abilities: ["dex"], targets: [entry] };
  const card = {
    id: `card${++next}`,
    getFlag: (_scope, key) => (key === "saves" ? flag : undefined)
  };
  cards.set(card.id, card);
  const actor = new ActorStub();
  actors.set(UUID, actor);
  return { card, flag, entry, actor, key: `${card.id}|${SUB}` };
}

beforeEach(() => {
  livePopups.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/**
 * THE SAVE ASK'S CLAIM (saves/ask.js `openSaveDialog`, ui.js `claimOpening`): an area's demand drops a
 * creature that leaves the area and asks it again when it returns. The re-ask must open a dialog though the
 * first one is still on its way out.
 */
describe("openSaveDialog — an entry dropped and asked again", () => {
  it("opens a fresh dialog while the withdrawn one is still closing", async () => {
    const { card, flag, entry, actor, key } = demand();
    void openSaveDialog(card, UUID);
    await settle();
    expect(actor.dialogs).toHaveLength(1);
    render(actor.dialogs[0]);
    expect(livePopups.get(key)).toBe(actor.dialogs[0]);

    // The area moves off the creature: every client closes the withdrawn ask (saves/views.js).
    flag.targets = [];
    const closing = closePopup(card, sub => sub === SUB);
    await settle();
    expect(actor.dialogs[0].closes).toBe(1);
    expect(livePopups.has(key)).toBe(false);

    // The area moves back before the first dialog's transition has ended.
    flag.targets = [entry];
    void openSaveDialog(card, UUID);
    await settle();
    expect(actor.dialogs).toHaveLength(2);
    render(actor.dialogs[1]);
    expect(livePopups.get(key)).toBe(actor.dialogs[1]);

    // The first dialog finishing its close leaves the second one standing, and a third ask fronts it.
    actor.dialogs[0].endTransition();
    await closing;
    await settle();
    expect(livePopups.get(key)).toBe(actor.dialogs[1]);
    void openSaveDialog(card, UUID);
    await settle();
    expect(actor.dialogs).toHaveLength(2);
    expect(actor.dialogs[1].bringToFront).toHaveBeenCalledTimes(1);
  });

  it("asks again when the entry was withdrawn before the first render and came back", async () => {
    const { card, flag, entry, actor, key } = demand();
    void openSaveDialog(card, UUID);
    await settle();
    flag.targets = [];
    render(actor.dialogs[0]);
    expect(actor.dialogs[0].closes).toBe(1);
    expect(livePopups.has(key)).toBe(false);

    flag.targets = [entry];
    void openSaveDialog(card, UUID);
    await settle();
    expect(actor.dialogs).toHaveLength(2);
  });

  it("builds one dialog for two asks before the first render", async () => {
    const { card, actor } = demand();
    void openSaveDialog(card, UUID);
    void openSaveDialog(card, UUID);
    await settle();
    expect(actor.dialogs).toHaveLength(1);
    render(actor.dialogs[0]);
    void openSaveDialog(card, UUID);
    await settle();
    expect(actor.dialogs).toHaveLength(1);
    expect(actor.dialogs[0].bringToFront).toHaveBeenCalledTimes(1);
  });

  it("asks again after a roll that never rendered a dialog", async () => {
    const { card, actor } = demand();
    actor.rollSavingThrow = vi.fn(async () => []);
    await openSaveDialog(card, UUID);
    await openSaveDialog(card, UUID);
    expect(actor.rollSavingThrow).toHaveBeenCalledTimes(2);
  });
});

describe("claimOpening — one dialog on its way up per popup key", () => {
  it("refuses a second claim until the first is released", () => {
    const first = claimOpening("c1|ask");
    expect(first).toEqual({ key: "c1|ask" });
    expect(claimOpening("c1|ask")).toBeNull();
    expect(claimOpening("c1|other")).not.toBeNull();
    releaseOpening(first);
    expect(claimOpening("c1|ask")).not.toBeNull();
  });

  it("leaves a later claim standing when an earlier one is released again", () => {
    const first = claimOpening("c2|ask");
    releaseOpening(first);
    const second = claimOpening("c2|ask");
    releaseOpening(first);
    releaseOpening(null);
    expect(claimOpening("c2|ask")).toBeNull();
    releaseOpening(second);
    expect(claimOpening("c2|ask")).not.toBeNull();
  });
});
