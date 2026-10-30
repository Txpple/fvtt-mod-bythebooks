import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * THE LANDING LEDGER on the landings of transforms.js, kit-tend.js and initiative-swap.js (ARCHITECTURE §4 *The
 * ledger*): each landing is driven as the elect, its claimant dies between two writes (a world write that lands and
 * never returns, so no final write follows), and a second client re-drives the record over the dead claim. Every
 * write lands once: a creature is transformed once with one form effect, a Hit Point Die is spent once, two
 * Initiatives are swapped once and never swapped back.
 */

const resumables = vi.hoisted(() => new Map());

vi.mock("../scripts/ui.js", async importOriginal => ({
  ...(await importOriginal()),
  registerResumable: (key, spec) => {
    resumables.set(key, spec);
  }
}));
vi.mock("../scripts/gallery.js", () => ({
  describeCreature: async () => ({}),
  formArt: () => ({}),
  openPicker: async () => null,
  poolFromPacks: async () => []
}));
vi.mock("../scripts/geometry.js", async importOriginal => ({
  ...(await importOriginal()),
  tokenOf: () => ({ id: "tok" }),
  tokensOf: () => []
}));
vi.mock("../scripts/shared.js", async importOriginal => ({
  ...(await importOriginal()),
  withTargets: async (_tokens, fn) => fn()
}));

/* --- the platform -------------------------------------------------------------------------------- */

const merge = (into, patch) => {
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
};
const getProperty = (o, path) => path.split(".").reduce((v, k) => v?.[k], o);
const setProperty = (o, path, value) => {
  const keys = path.split(".");
  const last = keys.pop();
  const at = keys.reduce((v, k) => (v[k] ??= {}), o);
  at[last] = value;
  return true;
};
const mergeObject = (into, patch) => merge(into, patch);

/** Where the claimant dies: the name of the write that lands and never returns. */
let dieAt = null;
/** Told when the claimant dies. */
let died = () => {};
/** A world write that lands and never returns at `dieAt`: the claimant dies holding it. */
const landed = async name => {
  if (dieAt !== name) return;
  dieAt = null;
  died();
  await new Promise(() => {});
};

/** A list that answers as Foundry's collections do. */
class List extends Array {
  get(id) {
    return this.find(d => d.id === id) ?? null;
  }
  has(id) {
    return this.some(d => d.id === id);
  }
  get contents() {
    return [...this];
  }
}

let nextId = 0;
const newId = () => `id${++nextId}`;
const uuids = new Map();

class Doc {
  constructor(data) {
    Object.assign(this, { flags: {}, ...data });
  }
  getFlag(scope, key) {
    return this.flags?.[scope]?.[key];
  }
  async setFlag(scope, key, value) {
    this.flags[scope] ??= {};
    this.flags[scope][key] ??= {};
    if (value && typeof value === "object" && !Array.isArray(value))
      merge(this.flags[scope][key], value);
    else this.flags[scope][key] = structuredClone(value);
  }
}

class FakeActor extends Doc {
  constructor(data) {
    super({ effects: new List(), items: new List(), isToken: false, ...data });
    uuids.set(this.uuid, this);
  }
  get uuid() {
    return this.isToken ? `Scene.s.Token.${this.token.id}.Actor.${this.id}` : `Actor.${this.id}`;
  }
  get isPolymorphed() {
    return !!this.getFlag("dnd5e", "isPolymorphed");
  }
  async update(data) {
    merge(this, data);
  }
  async createEmbeddedDocuments(_type, data) {
    const made = data.map(d => new Doc({ id: d._id ?? newId(), ...structuredClone(d) }));
    this.effects.push(...made);
    await landed(`effect:${this.name}`);
    return made;
  }
  /** dnd5e's transform: a world actor gets a copy; an unlinked token's actor changes in place. */
  async transformInto(source) {
    if (this.isToken) {
      this.flags.dnd5e = {
        ...(this.flags.dnd5e ?? {}),
        isPolymorphed: true,
        originalActor: this.id
      };
      this.name = `${this.name} (${source.name})`;
    } else {
      const copy = new FakeActor({
        id: newId(),
        name: `${this.name} (${source.name})`,
        flags: { dnd5e: { originalActor: this.id, isPolymorphed: true } }
      });
      world.actors.push(copy);
    }
    await landed(`transform:${this.name}`);
  }
  /** dnd5e's revert: an unlinked token replaced by a new token of its own; a world copy deleted, the original back. */
  async revertOriginalForm() {
    if (this.isToken) {
      const old = this.token;
      const token = { id: newId(), actorId: old.actorId, x: old.x, y: old.y, parent: old.parent };
      token.actor = new FakeActor({
        id: this.id,
        name: this.name.replace(/ \(.*\)$/, ""),
        isToken: true,
        token
      });
      old.parent.tokens.push(token);
      old.parent.tokens.splice(old.parent.tokens.indexOf(old), 1);
      uuids.delete(this.uuid);
      await landed(`revert:${this.name}`);
      return token;
    }
    const original = world.actors.get(this.getFlag("dnd5e", "originalActor"));
    world.actors.splice(world.actors.indexOf(this), 1);
    uuids.delete(this.uuid);
    await landed(`revert:${this.name}`);
    return original;
  }
}

const users = new Map();
const world = {
  ready: true,
  actors: new List(),
  messages: new List(),
  combats: new List(),
  scenes: new List(),
  modules: { get: () => null },
  settings: { get: () => null },
  users: { activeGM: null, get: id => users.get(id) ?? null, filter: () => [] },
  user: { id: "a", isGM: true, flags: {}, targets: new Set() },
  time: {
    get serverTime() {
      return Date.now();
    }
  }
};

Object.assign(globalThis, {
  game: world,
  Actor: FakeActor,
  ChatMessage: class {},
  fromUuidSync: uuid => uuids.get(uuid) ?? null,
  fromUuid: async uuid => uuids.get(uuid) ?? null,
  foundry: {
    utils: {
      deepClone: v => structuredClone(v),
      getProperty,
      setProperty,
      mergeObject,
      randomID: newId
    }
  },
  Hooks: { on: () => 1, once: () => 1, off: () => {}, call: () => true, callAll: () => {} },
  window: { addEventListener: () => {} },
  document: { addEventListener: () => {} },
  HTMLElement: class {},
  ui: { notifications: { warn: () => {}, error: () => {}, info: () => {} } }
});

const { MODULE_ID } = await import("../scripts/core.js");
await import("../scripts/transforms.js");
await import("../scripts/kit-tend.js");
await import("../scripts/initiative-swap.js");

/** A card holding one record under `key`. */
function card(key, record) {
  const message = new Doc({ id: newId(), flags: { [MODULE_ID]: { [key]: record } } });
  message.getAssociatedActivity = () => null;
  world.messages.push(message);
  return message;
}
const record = (message, key) => message.flags[MODULE_ID][key];

/** The claimant (user `a`) drives; it dies at `die`. The drive never returns when it dies. */
async function driveAs(user, key, message, die = null) {
  world.user.id = user;
  users.set(user, { id: user, active: true, isGM: true, isSelf: true });
  dieAt = die;
  const dead = new Promise(resolve => {
    died = resolve;
  });
  const drive = resumables.get(key).drive(message);
  if (!die) return drive;
  // the write lands; the claimant is gone before it returns (nothing it awaits after it runs)
  await Promise.race([
    dead,
    drive.then(() => {
      throw new Error(`the drive never reached ${die}`);
    })
  ]);
  users.set(user, { id: user, active: false, isGM: true });
}
/** The dead claimant's record, re-driven by user `b` over its claim. */
async function redrive(key, message) {
  expect(resumables.get(key).pending(record(message, key), message, "render")).toBe(true);
  await driveAs("b", key, message);
}

beforeEach(() => {
  world.actors.length = 0;
  world.messages.length = 0;
  world.combats.length = 0;
  world.scenes.length = 0;
  uuids.clear();
  users.clear();
  dieAt = null;
});

/* --- transforms ---------------------------------------------------------------------------------- */

/** A Polymorph of a world creature (or of an unlinked token's, `token`), its record picked. */
function polymorph({ token = false } = {}) {
  const caster = new FakeActor({ id: newId(), name: "Mage" });
  const item = new Doc({ id: newId(), name: "Polymorph", type: "spell" });
  item.system = {
    activities: [{ id: "act", type: "transform", settings: {}, actor: caster, duration: {} }]
  };
  caster.items.push(item);
  let ogre;
  if (token) {
    const scene = { id: "s", tokens: new List() };
    world.scenes.push(scene);
    const doc = { id: newId(), actorId: newId(), x: 100, y: 200, parent: scene };
    ogre = doc.actor = new FakeActor({ id: doc.actorId, name: "Ogre", isToken: true, token: doc });
    scene.tokens.push(doc);
  } else {
    ogre = new FakeActor({ id: newId(), name: "Ogre" });
    world.actors.push(ogre);
  }
  const wolf = new FakeActor({ id: newId(), name: "Wolf", img: "wolf.webp" });
  world.actors.push(caster);
  const message = card("transform", {
    status: "picked",
    key: "Polymorph",
    sourceUuid: caster.uuid,
    sourceName: "Mage",
    itemName: "Polymorph",
    itemUuid: "Actor.x.Item.y",
    activityUuid: null,
    targets: [{ uuid: ogre.uuid, name: "Ogre" }],
    slots: 0,
    pick: { uuid: wolf.uuid, name: "Wolf", img: "wolf.webp" }
  });
  return { caster, ogre, wolf, message };
}

const copiesOf = actor =>
  world.actors.filter(a => a.getFlag("dnd5e", "originalActor") === actor.id);
const formEffects = actor => actor.effects.filter(e => e.flags?.[MODULE_ID]?.form);

describe("transforms — a re-drive over a dead claimant transforms once", () => {
  it("a first drive transforms, makes one form effect and closes its ledger", async () => {
    const { ogre, message } = polymorph();
    await driveAs("a", "transform", message);
    const copies = copiesOf(ogre);
    expect(copies).toHaveLength(1);
    expect(formEffects(copies[0])).toHaveLength(1);
    expect(record(message, "transform")).toMatchObject({
      applied: true,
      outcome: "landed",
      landed: [{ actorUuid: copies[0].uuid }]
    });
    expect(record(message, "transform").ledger).toBeUndefined();
  });

  for (const die of ["transform:Ogre", "effect:Ogre (Wolf)"]) {
    it(`dead at ${die}: one copy, one form effect, the record landed`, async () => {
      const { ogre, message } = polymorph();
      await driveAs("a", "transform", message, die);
      expect(record(message, "transform").applied).toBeFalsy();
      await redrive("transform", message);
      const copies = copiesOf(ogre);
      expect(copies).toHaveLength(1);
      expect(formEffects(copies[0])).toHaveLength(1);
      expect(record(message, "transform")).toMatchObject({
        applied: true,
        outcome: "landed",
        landed: [{ actorUuid: copies[0].uuid }]
      });
      expect(record(message, "transform").ledger).toBeUndefined();
    });
  }

  it("an unlinked token, dead at its transform: changed in place once, one form effect", async () => {
    const { ogre, message } = polymorph({ token: true });
    await driveAs("a", "transform", message, "transform:Ogre (Wolf)");
    await redrive("transform", message);
    expect(ogre.name).toBe("Ogre (Wolf)");
    expect(formEffects(ogre)).toHaveLength(1);
    expect(record(message, "transform")).toMatchObject({
      applied: true,
      outcome: "landed",
      landed: [{ actorUuid: ogre.uuid }]
    });
  });

  /** The GM's change to a Bear asked on a landed Wolf. */
  async function changed({ token = false } = {}) {
    const made = polymorph({ token });
    await driveAs("a", "transform", made.message);
    const bear = new FakeActor({ id: newId(), name: "Bear" });
    Object.assign(record(made.message, "transform"), {
      changeAsked: { uuid: bear.uuid, name: "Bear", img: null }
    });
    return made;
  }
  /** The change landed once: `form` the one creature now in the Bear's form. */
  const changedOnce = (message, form) => {
    expect(formEffects(form)).toHaveLength(1);
    const rec = record(message, "transform");
    expect(rec).toMatchObject({ pick: { name: "Bear" }, landed: [{ actorUuid: form.uuid }] });
    expect(rec.changed.at(-1).failure).toBeUndefined();
    expect(rec.ledger).toBeUndefined();
  };

  for (const die of ["revert:Ogre (Wolf)", "transform:Ogre", "effect:Ogre (Bear)"]) {
    it(`a change dead at ${die}: the creature found off the plan, transformed once into the new pick`, async () => {
      const { ogre, message } = await changed();
      await driveAs("a", "transform", message, die);
      await redrive("transform", message);
      const copies = copiesOf(ogre);
      expect(copies.map(c => c.name)).toEqual(["Ogre (Bear)"]);
      changedOnce(message, copies[0]);
    });
  }

  it("an unlinked token's change dead at its revert: the token dnd5e made found off the plan, transformed once", async () => {
    const { message } = await changed({ token: true });
    const scene = world.scenes.get("s");
    await driveAs("a", "transform", message, "revert:Ogre (Wolf)");
    await redrive("transform", message);
    expect(scene.tokens).toHaveLength(1);
    const form = scene.tokens[0].actor;
    expect(form.name).toBe("Ogre (Bear)");
    changedOnce(message, form);
  });
});

/* --- the known-form swap ------------------------------------------------------------------------- */

describe("the known-form swap — the list judged once", () => {
  it("dead after the list was written: the re-drive says changed, never stale", async () => {
    const druid = new FakeActor({ id: newId(), name: "Druid" });
    const shape = new Doc({ id: newId(), name: "Wild Shape", type: "feat" });
    shape.uuid = `${druid.uuid}.Item.${shape.id}`;
    uuids.set(shape.uuid, shape);
    const known = [{ uuid: "c", name: "Cat", img: null }];
    shape.flags[MODULE_ID] = { knownForms: known };
    shape.setFlag = async (scope, key, value) => {
      shape.flags[scope][key] = structuredClone(value);
      await landed("knownForms");
    };
    const message = card("formSwap", {
      status: "resolved",
      key: "Wild Shape",
      actorUuid: druid.uuid,
      itemUuid: shape.uuid,
      slots: 2,
      known,
      adds: [{ uuid: "o", name: "Owl", img: null }]
    });
    await driveAs("a", "formSwap", message, "knownForms");
    await redrive("formSwap", message);
    expect(shape.flags[MODULE_ID].knownForms.map(k => k.name)).toEqual(["Cat", "Owl"]);
    expect(record(message, "formSwap")).toMatchObject({ applied: true, outcome: "changed" });
  });
});

/* --- kit tending --------------------------------------------------------------------------------- */

/** A Healer's kit tending a fighter: the class die, the feature's heal activity making its two cards. */
function tending() {
  const healer = new FakeActor({ id: newId(), name: "Healer" });
  const fighter = new FakeActor({ id: newId(), name: "Fighter", isOwner: true });
  const cls = new Doc({ id: newId(), name: "Fighter", system: { hd: { spent: 1 } } });
  cls.update = async data => {
    cls.system.hd.spent = data["system.hd.spent"];
    await landed("hd");
  };
  fighter.items.push(cls);
  const post = async (name, config) => {
    world.messages.push(new Doc({ id: newId(), flags: structuredClone(config.data.flags) }));
    await landed(name);
  };
  const heal = {
    type: "heal",
    healing: { denomination: 10 },
    use: async (_u, _d, config) => post("use", config),
    rollDamage: async (_r, _d, config) => post("roll", config)
  };
  const feature = new Doc({ id: newId(), name: "Healer", system: { activities: [heal] } });
  healer.items.push(feature);
  const message = card("kitTend", {
    status: "resolved",
    answer: "tend",
    pick: cls.id,
    row: "Healer",
    actorUuid: healer.uuid,
    featureId: feature.id,
    targetUuid: fighter.uuid,
    targetName: "Fighter",
    pools: [{ key: cls.id, faces: 10, value: 3, max: 4 }]
  });
  return { cls, message };
}
const tendCards = (message, name) =>
  world.messages.filter(
    m =>
      m.flags?.[MODULE_ID]?.kitTendFor === message.id &&
      m.flags[MODULE_ID].ledgerStamp?.endsWith(`.${name}`)
  );

describe("kit tending — one die, one heal", () => {
  for (const die of [null, "hd", "use", "roll"]) {
    it(`${die ? `dead at ${die}` : "a first drive"}: the die spent once, one use card, one heal roll`, async () => {
      const { cls, message } = tending();
      if (die) {
        await driveAs("a", "kitTend", message, die);
        await redrive("kitTend", message);
      } else await driveAs("a", "kitTend", message);
      expect(cls.system.hd.spent).toBe(2);
      expect(tendCards(message, "use")).toHaveLength(1);
      expect(tendCards(message, "roll")).toHaveLength(1);
      expect(record(message, "kitTend")).toMatchObject({ applied: true, spent: true, faces: 10 });
      expect(record(message, "kitTend").ledger).toBeUndefined();
    });
  }
});

/* --- the initiative swap ------------------------------------------------------------------------- */

function swapping() {
  const own = new Doc({ id: newId(), name: "Rogue", initiative: 7 });
  const ally = new Doc({ id: newId(), name: "Paladin", initiative: 19 });
  const combat = new Doc({ id: newId(), combatants: new List(own, ally) });
  combat.updateEmbeddedDocuments = async (_type, updates) => {
    for (const u of updates) combat.combatants.get(u._id).initiative = u.initiative;
    await landed("tracker");
  };
  world.combats.push(combat);
  const message = card("initiativeSwap", {
    status: "resolved",
    answer: "swap",
    combatId: combat.id,
    combatantId: own.id,
    pick: ally.id,
    row: "Alert"
  });
  return { own, ally, message };
}

describe("the initiative swap — swapped once, never swapped back", () => {
  for (const die of [null, "tracker"]) {
    it(`${die ? "dead after the tracker write" : "a first drive"}: 19 and 7, the record from 7 to 19`, async () => {
      const { own, ally, message } = swapping();
      if (die) {
        await driveAs("a", "initiativeSwap", message, die);
        expect([own.initiative, ally.initiative]).toEqual([19, 7]);
        await redrive("initiativeSwap", message);
      } else await driveAs("a", "initiativeSwap", message);
      expect([own.initiative, ally.initiative]).toEqual([19, 7]);
      expect(record(message, "initiativeSwap")).toMatchObject({
        applied: true,
        from: 7,
        to: 19,
        allyName: "Paladin"
      });
      expect(record(message, "initiativeSwap").ledger).toBeUndefined();
    });
  }
});
