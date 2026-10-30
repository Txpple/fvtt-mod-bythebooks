import { describe, expect, it, vi } from "vitest";

/*
 * THE LANDING LEDGER on four landings (issue #22; ARCHITECTURE §4 *The ledger*): a held share's damage
 * (damage-holds.js), a drop to 1 and Searing Vengeance's offer (drop-to-one.js), a condition ended at the turn
 * (turn-grants.js). Each is driven through its resumable on a fake world whose claimant dies at a world write
 * (before it lands, or after it lands and before its record), then re-driven by a second GM over the dead claim:
 * every write lands once.
 */

/** The platform's hooks, one dispatcher listener per name. */
const platform = new Map();
const users = new Map();
for (const id of ["a", "b"]) {
  users.set(id, {
    id,
    active: true,
    isGM: true,
    flags: {},
    get isSelf() {
      return globalThis.game.user.id === id;
    }
  });
}

/**
 * The world: its documents by uuid, the writes that landed, the rolls a live claimant made, and the claimant's death at
 * the `die.at`-th write (a dead claimant's drive runs on, every write and roll of it lost).
 */
const world = {
  docs: new Map(),
  messages: [],
  landed: [],
  rolls: 0,
  n: 0,
  dead: false,
  /** @type {{ at: number, landed: boolean }|null} */
  die: null
};
/** One world write: none once the claimant is dead; the `die.at`-th kills it, before or after it lands. */
async function write(kind, fn) {
  if (world.dead) return undefined;
  world.n += 1;
  const dies = world.die?.at === world.n;
  if (dies && !world.die.landed) {
    world.dead = true;
    return undefined;
  }
  world.landed.push(kind);
  const out = await fn();
  if (dies) world.dead = true;
  return out;
}

/** Foundry's flag merge: nested objects merged, `-=key` deleting. */
function merge(into, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (k.startsWith("-=")) delete into[k.slice(2)];
    else if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      into[k] &&
      typeof into[k] === "object"
    )
      merge(into[k], v);
    else into[k] = structuredClone(v);
  }
  return into;
}

/** A list Foundry-style: iterable, `get` by id. */
const collection = (list = []) =>
  Object.assign(list, { get: id => list.find(d => d.id === id) ?? null, contents: list });

class Actor {
  constructor(id, { hp, max = hp, items = [], disposition = -1, at = [0, 0] } = {}) {
    Object.assign(this, {
      id,
      uuid: `Actor.${id}`,
      name: id,
      documentName: "Actor",
      img: null,
      token: null
    });
    this.items = collection(items);
    this.effects = collection([]);
    this.system = {
      attributes: { hp: { value: hp, max, temp: 0, tempmax: 0 }, exhaustion: 0 },
      get _source() {
        return structuredClone({ attributes: this.attributes });
      }
    };
    for (const item of items) item.parent = this;
    world.docs.set(this.uuid, this);
    // its token on the scene, 5 ft a square
    const doc = {
      documentName: "Token",
      parent: { grid: { size: 100 } },
      x: at[0] * 100,
      y: at[1] * 100,
      width: 1,
      height: 1,
      disposition,
      name: id
    };
    const object = { document: doc, actor: this };
    doc.object = object;
    doc.actor = this;
    this.token = doc;
    globalThis.canvas.tokens.placeables.push(object);
  }
  getRollData() {
    return {};
  }
  calculateDamage() {
    return null;
  }
  async applyDamage(damages) {
    const hp = this.system.attributes.hp;
    const total = damages.reduce((n, d) => n + (Number(d.value) || 0), 0);
    const heal = damages.every(d => d.type === "healing");
    await write(`${heal ? "heal" : "damage"}:${this.id}`, () => {
      hp.value = heal ? Math.min(hp.max, hp.value + total) : Math.max(0, hp.value - total);
    });
  }
  async update(data) {
    await write(`hp:${this.id}`, () => {
      this.system.attributes.hp.value = data["system.attributes.hp.value"];
    });
  }
}

function item(id, { spent = 0, max = 1, activities = [], name = id, type = "feat" } = {}) {
  const it = {
    id,
    name,
    type,
    uuid: `Item.${id}`,
    img: null,
    system: {
      identifier: name.toLowerCase().replace(/\W+/g, "-"),
      uses: { spent, max },
      activities: collection(activities)
    },
    effects: collection([]),
    async update(data) {
      await write(`spend:${id}`, () => {
        it.system.uses.spent = data["system.uses.spent"];
      });
    }
  };
  for (const a of activities) a.item = it;
  return it;
}

function effect(id, parent, bearer) {
  const e = {
    id,
    uuid: `${parent.uuid}.ActiveEffect.${id}`,
    name: `Poisoned (${id})`,
    parent,
    disabled: false,
    async delete() {
      await write(`delete:${id}`, () => {
        world.docs.delete(e.uuid);
        bearer.effects.splice(bearer.effects.indexOf(e), 1);
      });
    },
    async update(data) {
      await write(`disable:${id}`, () => {
        e.disabled = data.disabled;
      });
    }
  };
  bearer.effects.push(e);
  world.docs.set(e.uuid, e);
  return e;
}

/** A card holding `record` under `key`, authored by `a`. */
function card(key, record) {
  const m = {
    id: `m${world.messages.length}`,
    flags: { "fvtt-mod-bythebooks": { [key]: structuredClone(record) } },
    author: users.get("a"),
    get isAuthor() {
      return globalThis.game.user.id === "a";
    },
    getFlag: (scope, k) => m.flags[scope]?.[k],
    setFlag: async (scope, k, value) => {
      if (world.dead) return;
      m.flags[scope] ??= {};
      m.flags[scope][k] ??= {};
      merge(m.flags[scope][k], value);
    },
    getAssociatedActor: () => null,
    getOriginatingMessage: () => null
  };
  world.messages.push(m);
  return m;
}

class Roll {
  constructor(formula) {
    this.formula = formula;
  }
  async evaluate() {
    if (!world.dead) world.rolls += 1;
    this.total = 9;
    return this;
  }
  static safeEval(f) {
    return Number(f);
  }
  static replaceFormulaData(f) {
    return f;
  }
}

Object.assign(globalThis, {
  Hooks: {
    on: (hook, fn) => {
      platform.set(hook, fn);
      return 1;
    },
    once: () => 1,
    call: () => true,
    callAll: () => {}
  },
  game: {
    ready: true,
    modules: { get: () => null },
    settings: { get: () => null },
    i18n: { localize: s => s },
    user: users.get("a"),
    users: {
      get: id => users.get(id) ?? null,
      activeGM: users.get("a"),
      filter: () => [],
      some: () => false
    },
    messages: collection(world.messages),
    combats: [],
    time: {
      get serverTime() {
        return Date.now();
      }
    }
  },
  canvas: {
    tokens: { placeables: [], controlled: [] },
    grid: { measurePath: ([p, q]) => ({ distance: (Math.hypot(p.x - q.x, p.y - q.y) / 100) * 5 }) },
    scene: { grid: { units: "ft" } }
  },
  CONFIG: { DND5E: { abilities: {}, conditionTypes: {} } },
  foundry: {
    utils: {
      deepClone: v => structuredClone(v),
      getProperty: (o, path) => path.split(".").reduce((v, k) => v?.[k], o),
      setProperty: (o, path, value) => {
        const keys = path.split(".");
        const last = keys.pop();
        keys.reduce((v, k) => (v[k] ??= {}), o)[last] = value;
        return true;
      },
      mergeObject: (a, b) => merge(a, b)
    }
  },
  fromUuid: async uuid => world.docs.get(uuid) ?? null,
  fromUuidSync: uuid => world.docs.get(uuid) ?? null,
  Actor,
  Item: class {},
  Roll,
  ChatMessage: { getSpeaker: () => ({}) },
  window: { addEventListener: () => {} },
  document: { addEventListener: () => {} },
  HTMLElement: class {}
});

await import("../scripts/ui.js");
await import("../scripts/damage-holds.js");
await import("../scripts/drop-to-one.js");
await import("../scripts/turn-grants.js");

/** Let every drive in flight run out (the fakes resolve at once). */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
}

/** A fresh world: no documents, no tokens, `a` the GM and alive. */
function reset() {
  world.docs.clear();
  world.messages.length = 0;
  world.landed.length = 0;
  Object.assign(world, { rolls: 0, n: 0, dead: false, die: null });
  globalThis.canvas.tokens.placeables.length = 0;
  for (const u of users.values()) u.active = true;
  globalThis.game.user = users.get("a");
  globalThis.game.users.activeGM = users.get("a");
}

/** `a` drives the card and dies at `die`; `b`, the GM now, re-drives it over the dead claim. */
async function drive(message, die) {
  world.die = die;
  platform.get("updateChatMessage")(message, {}, {}, "a");
  await settle();
  if (!die) return;
  world.dead = false;
  world.die = null;
  users.get("a").active = false;
  globalThis.game.user = users.get("b");
  globalThis.game.users.activeGM = users.get("b");
  platform.get("updateChatMessage")(message, {}, {}, "b");
  await settle();
}

/** Every death: before and after each of the landing's `writes` world writes, and none. */
const deaths = writes => [
  null,
  ...Array.from({ length: writes }, (_, i) => [
    { at: i + 1, landed: false },
    { at: i + 1, landed: true }
  ]).flat()
];
const named = die => (die ? `dead ${die.landed ? "after" : "before"} write ${die.at}` : "no death");

vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("damage-holds — a held share's damage lands once", () => {
  for (const die of deaths(1)) {
    it(named(die), async () => {
      reset();
      const target = new Actor("target", { hp: 30 });
      const m = card("damageHold", {
        status: "resolved",
        answer: "cast",
        reduceBy: 4,
        reaction: "Stone's Endurance",
        target: { uuid: target.uuid, name: target.name },
        damages: [{ value: 10, type: "fire", properties: [] }]
      });
      await drive(m, die);
      expect(target.system.attributes.hp.value).toBe(24);
      expect(world.landed).toEqual(["damage:target"]);
      const flag = m.flags["fvtt-mod-bythebooks"].damageHold;
      expect(flag.applied).toBe(true);
      expect(flag.ledger).toBeUndefined();
    });
  }
});

describe("drop-to-one — a drop to 1 lands once", () => {
  for (const die of deaths(2)) {
    it(`Rage of the Gods: the Rage spent once, the Hit Points set once — ${named(die)}`, async () => {
      reset();
      const rage = item("rage", { spent: 1, max: 3, name: "Rage" });
      const revive = {
        id: "rev",
        name: "Revivification",
        roll: { formula: "14" },
        consumption: { targets: [{ type: "itemUses", target: "rage" }] }
      };
      const gods = item("gods", { name: "Rage of the Gods", activities: [revive] });
      const keeper = new Actor("keeper", { hp: 50, items: [gods, rage] });
      const fallen = new Actor("fallen", { hp: 1, max: 20 });
      const m = card("dropToOne", {
        status: "resolved",
        answer: "use",
        row: "Rage of the Gods",
        actorUuid: fallen.uuid,
        keeperUuid: keeper.uuid,
        itemId: "gods"
      });
      await drive(m, die);
      expect(rage.system.uses.spent).toBe(2);
      expect(fallen.system.attributes.hp.value).toBe(14);
      expect(world.landed).toEqual(["spend:rage", "hp:fallen"]);
      const flag = m.flags["fvtt-mod-bythebooks"].dropToOne;
      expect(flag).toMatchObject({ applied: true, to: 14 });
      expect(flag.ledger).toBeUndefined();
    });

    it(`Undying Sentinel: the use spent once, the heal rolled once and landed once — ${named(die)}`, async () => {
      reset();
      const heal = { id: "heal", name: "Heal", healing: { number: 1, denomination: 8 } };
      const sentinel = item("sentinel", { name: "Undying Sentinel", activities: [heal] });
      const paladin = new Actor("paladin", { hp: 1, max: 40, items: [sentinel] });
      const m = card("dropToOne", {
        status: "resolved",
        answer: "use",
        row: "Undying Sentinel",
        actorUuid: paladin.uuid,
        itemId: "sentinel"
      });
      await drive(m, die);
      expect(sentinel.system.uses.spent).toBe(1);
      expect(paladin.system.attributes.hp.value).toBe(10);
      expect(world.rolls).toBe(1);
      expect(world.landed).toEqual(["spend:sentinel", "heal:paladin"]);
    });
  }

  for (const die of deaths(1)) {
    it(`a pass: the held 1 falls to 0 once, and the re-drive still knows it fell — ${named(die)}`, async () => {
      reset();
      const orc = new Actor("orc", { hp: 1, max: 15 });
      const m = card("dropToOne", {
        status: "resolved",
        answer: "pass",
        row: "Relentless Endurance",
        actorUuid: orc.uuid
      });
      await drive(m, die);
      expect(orc.system.attributes.hp.value).toBe(0);
      expect(world.landed).toEqual(["hp:orc"]);
      expect(m.flags["fvtt-mod-bythebooks"].dropToOne.applied).toBe(true);
    });
  }
});

describe("drop-to-one — Searing Vengeance lands once: one use, one heal, one burst roll, one hit per enemy", () => {
  for (const die of deaths(4)) {
    it(named(die), async () => {
      reset();
      const burst = {
        id: "dmg",
        name: "Damage",
        target: { template: { size: 10, units: "ft" } },
        effects: [],
        rollDamage: async () => {
          if (!world.dead) world.rolls += 1;
          return [{ total: 7, options: { type: "radiant" } }];
        }
      };
      const vengeance = item("vengeance", { name: "Searing Vengeance", activities: [burst] });
      const warlock = new Actor("warlock", { hp: 0, max: 20, items: [vengeance], disposition: 1 });
      // the first enemy dies of the burst: a re-drive that looked again would not find it
      const near = new Actor("near", { hp: 5, at: [1, 0] });
      const far = new Actor("far", { hp: 30, at: [0, 2] });
      new Actor("away", { hp: 30, at: [9, 9] });
      const m = card("deathSaveOffer", {
        status: "resolved",
        answer: "use",
        row: "Searing Vengeance",
        actorUuid: warlock.uuid,
        keeperUuid: warlock.uuid,
        itemId: "vengeance",
        activityId: "dmg"
      });
      await drive(m, die);
      expect(vengeance.system.uses.spent).toBe(1);
      expect(warlock.system.attributes.hp.value).toBe(10);
      expect(near.system.attributes.hp.value).toBe(0);
      expect(far.system.attributes.hp.value).toBe(23);
      expect(world.rolls).toBe(1);
      expect(world.landed).toEqual([
        "spend:vengeance",
        "heal:warlock",
        "damage:near",
        "damage:far"
      ]);
      const flag = m.flags["fvtt-mod-bythebooks"].deathSaveOffer;
      expect(flag).toMatchObject({ applied: true, healed: 10, burst: 7, victims: ["near", "far"] });
      expect(flag.ledger).toBeUndefined();
    });
  }
});

describe("turn-grants — a condition ended lands once: one use, each effect ended once and named", () => {
  for (const die of deaths(4)) {
    it(named(die), async () => {
      reset();
      const cure = {
        id: "cure",
        name: "Cure",
        consumption: { targets: [] },
        use: async (_usage, _dialog, config) => {
          await write("use:spend", () => {
            cure.item.system.uses.spent += 1;
          });
          await write("use:card", () => {
            world.messages.push({
              id: `use${world.messages.length}`,
              flags: structuredClone(config?.data?.flags ?? {})
            });
          });
        }
      };
      const touch = item("touch", { max: 3, name: "Physician's Touch", activities: [cure] });
      const healer = new Actor("healer", { hp: 20, items: [touch] });
      const worn = item("ring", { name: "Ring", type: "equipment" });
      const bearer = new Actor("bearer", { hp: 20, items: [worn] });
      const own = effect("e1", bearer, bearer);
      const carried = effect("e2", worn, bearer);
      const m = card("conditionEnd", {
        status: "resolved",
        answer: "poisoned",
        row: "Physician's Touch",
        actorUuid: healer.uuid,
        bearerUuid: bearer.uuid,
        itemId: "touch",
        activityId: "cure",
        options: [
          {
            status: "poisoned",
            label: "Poisoned",
            names: [own.name, carried.name],
            effectIds: [own.uuid, carried.uuid]
          }
        ]
      });
      await drive(m, die);
      expect(touch.system.uses.spent).toBe(1);
      // a claimant gone between the use's spend and its card: the spend is the witness, the card is not made again
      const cardLost = !!die && ((die.at === 1 && die.landed) || (die.at === 2 && !die.landed));
      expect(world.messages.filter(x => x.id.startsWith("use"))).toHaveLength(cardLost ? 0 : 1);
      expect(bearer.effects.map(e => e.id)).toEqual(["e2"]);
      expect(carried.disabled).toBe(true);
      expect(world.landed.filter(k => !k.startsWith("use:"))).toEqual(["delete:e1", "disable:e2"]);
      const flag = m.flags["fvtt-mod-bythebooks"].conditionEnd;
      expect(flag).toMatchObject({
        applied: true,
        ended: "poisoned",
        gone: [own.name, carried.name]
      });
      expect(flag.failed).toBeUndefined();
      expect(flag.ledger).toBeUndefined();
    });
  }
});
