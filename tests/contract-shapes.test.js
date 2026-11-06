import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  diffSchemas,
  fieldsOf,
  foldSchema,
  idLabelOf,
  labelOfPattern,
  mergeSchemas,
  PAGE_SOURCE,
  patternOfLabel,
  sampleOf,
  schemaOf
} from "../tools/contract-shapes.mjs";
import { installFoundryStub } from "./foundry-stub.js";

/*
 * THE CONTRACTS (tools/contract-shapes.mjs, tools/contract-recorder.mjs, tools/contracts.mjs): the
 * schema a run's values derive by shape, the page recorder over a stand-in `Hooks` and the real moment
 * publisher, and the files built from a recording and checked against the code and against a run.
 */

installFoundryStub();

describe("schemaOf — one value's shape", () => {
  it("names the primitive types, null its own", () => {
    expect(schemaOf("x")).toEqual({ type: "string" });
    expect(schemaOf(3.5)).toEqual({ type: "number" });
    expect(schemaOf(true)).toEqual({ type: "boolean" });
    expect(schemaOf(null)).toEqual({ type: "null" });
    expect(schemaOf(undefined)).toEqual({});
  });

  it("an object: its properties, and every key it carries required (an undefined value is not carried)", () => {
    const s = schemaOf({ b: 1, a: "x", gone: undefined });
    expect(s.type).toBe("object");
    expect(Object.keys(s.properties)).toEqual(["b", "a"]);
    expect(s.required).toEqual(["a", "b"]);
  });

  it("an array: its items merged, an empty one no items", () => {
    expect(schemaOf([]).items).toBeUndefined();
    expect(schemaOf([{ a: 1 }, { a: 2, b: "x" }]).items).toEqual({
      type: "object",
      properties: { a: { type: "number" }, b: { type: "string" } },
      required: ["a"]
    });
  });

  it("a map keyed by document ids is one patternProperties entry, however many ids", () => {
    const s = schemaOf({ abcdefgh12345678: { n: 1 }, ZZZZZZZZ00000000: { n: 2 } });
    expect(s.properties).toBeUndefined();
    expect(Object.keys(s.patternProperties)).toEqual(["^[A-Za-z0-9]{16}$"]);
    expect(fieldsOf(s)).toEqual(["<id>", "<id>.n"]);
  });

  it("a document is named, never walked; a class instance by its class", () => {
    expect(schemaOf({ documentName: "ChatMessage", id: "x", huge: { deep: 1 } })).toEqual({
      type: "object",
      "x-document": "ChatMessage"
    });
    expect(schemaOf(new Map())).toEqual({ type: "object", "x-class": "Map" });
  });

  it("a choice-naming key keeps its short values as examples", () => {
    expect(schemaOf({ answer: "pass", name: "Goblin" }).properties).toEqual({
      answer: { type: "string", examples: ["pass"] },
      name: { type: "string" }
    });
  });

  it("a cycle and a depth past the reader's are cut, never thrown on", () => {
    const loop = { a: 1 };
    loop.self = loop;
    expect(schemaOf(loop).properties.self).toEqual({ "x-truncated": true });
    let deep = {};
    const root = deep;
    for (let i = 0; i < 20; i++) deep = deep.next = {};
    expect(JSON.stringify(schemaOf(root))).toContain("x-truncated");
  });
});

describe("names that change run to run — never a field", () => {
  it("idLabelOf: an id is <id> wherever it stands in the name, a slot's index <n>; a name is null", () => {
    expect(idLabelOf("abcdefgh12345678")).toBe("<id>");
    expect(idLabelOf("ANSpcJYzznsSwGZM")).toBe("<id>");
    expect(idLabelOf("gInGiIbxxZCsgWiP")).toBe("<id>");
    expect(idLabelOf("ally-0SSengnfp7NfltfN")).toBe("ally-<id>");
    expect(idLabelOf("Actor|YeegJ3yS1vLryJ4C")).toBe("Actor|<id>");
    expect(idLabelOf("Scene|abcdefgh12345678|Token|QWERTYUIOPASDFGH")).toBe(
      "Scene|<id>|Token|<id>"
    );
    expect(idLabelOf("burst-1")).toBe("burst-<n>");
    expect(idLabelOf("burst-1", false)).toBeNull();
    for (const name of [
      "compendiumSource",
      "awaitingTemplate",
      "fallbackRegained",
      "bar1",
      "dnd5e",
      "d20",
      "beat-companion-events",
      "fvtt-mod-bythebooks",
      "<id>",
      "ally-<id>",
      "burst-<n>"
    ]) {
      expect(idLabelOf(name)).toBeNull();
    }
  });

  it("a label's pattern matches what it stands for and reads back as the label", () => {
    expect(patternOfLabel("<id>")).toBe("^[A-Za-z0-9]{16}$");
    for (const label of ["<id>", "ally-<id>", "Actor|<id>", "burst-<n>", "Scene|<id>|Token|<id>"]) {
      expect(labelOfPattern(patternOfLabel(label))).toBe(label);
    }
    const uuidKey = new RegExp(patternOfLabel("Actor|<id>"));
    expect(uuidKey.test("Actor|YeegJ3yS1vLryJ4C")).toBe(true);
    expect(uuidKey.test("ActorxYeegJ3yS1vLryJ4C")).toBe(false);
    expect(new RegExp(patternOfLabel("burst-<n>")).test("burst-12")).toBe(true);
  });

  it("a map keyed by ids with and without digits is one entry; a name-shaped id folds beside them", () => {
    const s = schemaOf({ abcdefgh12345678: true, ANSpcJYzznsSwGZM: true, someWordShapedId: true });
    expect(s.properties).toBeUndefined();
    expect(s.required).toBeUndefined();
    expect(fieldsOf(s)).toEqual(["<id>"]);
    expect(fieldsOf(schemaOf({ someWordShapedId: true, compendiumSource: "x" }))).toEqual([
      "compendiumSource",
      "someWordShapedId"
    ]);
  });

  it("a ledger's steps by id and by slot are one field each; its named steps stay named and required", () => {
    const step = { state: "done", before: null };
    const s = schemaOf({
      "ally-0SSengnfp7NfltfN": step,
      "ally-gziHvFEVLin64JO7": step,
      "burst-0": step,
      "burst-1": { ...step, result: 3 },
      die: step
    });
    expect(fieldsOf(s)).toEqual([
      "ally-<id>",
      "ally-<id>.before",
      "ally-<id>.state",
      "burst-<n>",
      "burst-<n>.before",
      "burst-<n>.result",
      "burst-<n>.state",
      "die",
      "die.before",
      "die.state"
    ]);
    expect(s.required).toEqual(["die"]);
  });

  it("the union folds a name-shaped id one side saw into the ids the other folded", () => {
    const m = mergeSchemas(schemaOf({ abcdefgh12345678: 1 }), schemaOf({ someWordShapedId: 2 }));
    expect(m.properties).toBeUndefined();
    expect(fieldsOf(m)).toEqual(["<id>"]);
  });

  it("foldSchema folds a schema recorded before the rule, at every level", () => {
    const step = { type: "object", properties: { state: { type: "string" } }, required: ["state"] };
    const old = {
      type: "object",
      properties: {
        ledger: {
          type: "object",
          properties: {
            "ally-0SSengnfp7NfltfN": step,
            "eat-0": step,
            "eat-1": step,
            cost: step
          },
          required: ["ally-0SSengnfp7NfltfN", "cost", "eat-0", "eat-1"]
        },
        read: { type: "object", properties: { ANSpcJYzznsSwGZM: { type: "boolean" } } }
      },
      required: ["ledger", "read"]
    };
    const folded = foldSchema(old);
    expect(fieldsOf(folded)).toEqual([
      "ledger",
      "ledger.ally-<id>",
      "ledger.ally-<id>.state",
      "ledger.cost",
      "ledger.cost.state",
      "ledger.eat-<n>",
      "ledger.eat-<n>.state",
      "read",
      "read.<id>"
    ]);
    expect(folded.properties.ledger.required).toEqual(["cost"]);
    expect(folded.required).toEqual(["ledger", "read"]);
    expect(foldSchema(null)).toBeNull();
  });

  it("a new id or slot under a folded name adds nothing; a new labelled name is added by its label", () => {
    const documented = schemaOf({ ledger: { "ally-0SSengnfp7NfltfN": { state: "done" } } });
    const seen = schemaOf({
      ledger: { "ally-kbJwYdeJRNU7I64A": { state: "done" }, "give-0": { state: "done" } }
    });
    expect(diffSchemas(documented, seen).added).toEqual([
      "ledger.give-<n>",
      "ledger.give-<n>.state"
    ]);
  });

  it("a sample masks an id in a property name and keeps a slot's index", () => {
    expect(
      sampleOf({
        "ally-0SSengnfp7NfltfN": 1,
        "burst-0": 2,
        ANSpcJYzznsSwGZM: 3,
        compendiumSource: 4
      })
    ).toEqual({ "ally-<id>": 1, "burst-0": 2, "<id>": 3, compendiumSource: 4 });
  });
});

describe("mergeSchemas — the union", () => {
  it("joins types and properties; a key is required only where every object carried it", () => {
    const m = mergeSchemas(schemaOf({ a: 1, b: "x" }), schemaOf({ a: null, c: true }));
    expect(m.properties.a.type).toEqual(["null", "number"]);
    expect(Object.keys(m.properties)).toEqual(["a", "b", "c"]);
    expect(m.required).toEqual(["a"]);
  });

  it("a side that saw no object leaves the other's required list alone", () => {
    expect(mergeSchemas(schemaOf({ a: 1 }), schemaOf(null))).toEqual({
      type: ["null", "object"],
      properties: { a: { type: "number" } },
      required: ["a"]
    });
  });

  it("joins examples, sorted and capped", () => {
    let s = null;
    for (const v of ["b", "a", "b"]) s = mergeSchemas(s, schemaOf({ outcome: v }));
    expect(s.properties.outcome.examples).toEqual(["a", "b"]);
    for (let i = 0; i < 20; i++) s = mergeSchemas(s, schemaOf({ outcome: `v${i}` }));
    expect(s.properties.outcome.examples.length).toBe(12);
  });

  it("either side null is the other", () => {
    expect(mergeSchemas(null, { type: "string" })).toEqual({ type: "string" });
    expect(mergeSchemas({ type: "string" }, null)).toEqual({ type: "string" });
    expect(mergeSchemas(null, null)).toEqual({});
  });
});

describe("sampleOf — a value for a contract file", () => {
  it("masks ids in id fields and clocks, keeps names and the rest", () => {
    expect(
      sampleOf({
        actorUuid: "Actor.abcdefgh12345678.Item.QWERTYUI00000000",
        momentId: "ZZZZZZZZ00000000|receipt|Actor.abcdefgh12345678",
        actorName: "BTB Test Rogue Abcdefgh12345678",
        at: 1760000000000,
        answeredAt: 5,
        total: 14
      })
    ).toEqual({
      actorUuid: "Actor.<id>.Item.<id>",
      momentId: "<id>|receipt|Actor.<id>",
      actorName: "BTB Test Rogue Abcdefgh12345678",
      at: 0,
      answeredAt: 0,
      total: 14
    });
  });

  it("names a document, cuts a long array", () => {
    expect(sampleOf({ message: { documentName: "ChatMessage", id: "x" } })).toEqual({
      message: { $document: "ChatMessage" }
    });
    expect(sampleOf([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([1, 2, 3, 4, 5, 6, "… 2 more"]);
    expect(sampleOf({ activity: new (class AttackActivity {})() })).toEqual({
      activity: { $class: "AttackActivity" }
    });
  });
});

describe("fieldsOf and diffSchemas", () => {
  it("every path, arrays as []", () => {
    expect(
      fieldsOf(schemaOf({ targets: [{ uuid: "a", hit: true }], details: { answer: "pass" } }))
    ).toEqual([
      "details",
      "details.answer",
      "targets",
      "targets[]",
      "targets[].hit",
      "targets[].uuid"
    ]);
  });

  it("a field the run saw and the contract does not name is added; one never seen is missing; a new type widens", () => {
    const documented = schemaOf({ a: 1, gone: "x", t: [{ u: "x" }] });
    const seen = schemaOf({ a: null, fresh: 2, t: [{ u: "x", hit: true }] });
    expect(diffSchemas(documented, seen)).toEqual({
      added: ["fresh", "t[].hit"],
      missing: ["gone"],
      widened: ["a: null"]
    });
  });
});

describe("the page bundle", () => {
  it("evaluates to the three functions with no closure (the recorder ships it as text)", () => {
    const { schemaOf: s, mergeSchemas: m, sampleOf: o } = new Function(PAGE_SOURCE)();
    expect(m(s({ a: 1 }), s({ a: 2, b: "x" }))).toEqual(
      mergeSchemas(schemaOf({ a: 1 }), schemaOf({ a: 2, b: "x" }))
    );
    expect(o({ at: 9 })).toEqual({ at: 0 });
    const ledger = { "ally-0SSengnfp7NfltfN": { state: "done" }, ANSpcJYzznsSwGZM: true };
    expect(s(ledger)).toEqual(schemaOf(ledger));
    expect(o(ledger)).toEqual(sampleOf(ledger));
  });
});

describe("the recorder — over a stand-in Hooks and the real moment publisher", () => {
  /** @type {typeof import("../tools/contract-recorder.mjs")} */
  let recorder;
  /** @type {typeof import("../scripts/events.js")} */
  let events;
  let original;
  beforeAll(async () => {
    recorder = await import("../tools/contract-recorder.mjs");
    events = await import("../scripts/events.js");
  });
  afterEach(() => {
    if (original) globalThis.Hooks = original;
    original = null;
    delete globalThis.__btbContractRecorder;
  });
  const arm = () => {
    original = globalThis.Hooks;
    globalThis.Hooks = { ...original, call: (...a) => a.length, callAll: () => "dispatched" };
    expect(recorder.installRecorder(PAGE_SOURCE)).toBe("installed");
    return globalThis.__btbContractRecorder;
  };

  it("records a moment per <event>|<kind>, its shape and one sample, and counts the word's own hook", () => {
    const rec = arm();
    events.publishMoment("sneak", {
      actor: "Actor.rogue",
      message: { id: "msgDamage" },
      kind: "sneakDamage",
      marker: "message",
      targets: [{ uuid: "Actor.goblin", name: "Goblin", hit: true }],
      details: { formula: "6d6", picks: ["trip"] }
    });
    expect(Object.keys(rec.moments)).toEqual(["sneak|sneakDamage"]);
    expect(fieldsOf(rec.moments["sneak|sneakDamage"].schema)).toContain("targets[].hit");
    expect(rec.moments["sneak|sneakDamage"].sample.momentId).toBe("msgDamage|sneakDamage|message");
    expect(rec.hooks["bythebooks.moment"].count).toBe(1);
    expect(rec.hooks["bythebooks.sneak"]).toEqual({ count: 1, args: [] });
  });

  it("records a companion hook's arguments, and a document's flag keys with where they were seen", () => {
    const rec = arm();
    globalThis.Hooks.callAll("bythebooks.holdOpened", {
      subject: "Actor.x.Item.y.Activity.z",
      reason: "careful"
    });
    globalThis.Hooks.callAll("createChatMessage", {
      documentName: "ChatMessage",
      flags: { "fvtt-mod-bythebooks": { receipt: { targets: [{ uuid: "a" }] } } }
    });
    globalThis.Hooks.callAll("updateActor", {
      documentName: "Actor",
      flags: { "fvtt-mod-bythebooks": { cleaveArm: true }, dnd5e: { x: 1 } }
    });
    globalThis.Hooks.callAll("updateItem", { documentName: "Item", flags: { dnd5e: { x: 1 } } });
    expect(fieldsOf(rec.hooks["bythebooks.holdOpened"].args[0])).toEqual(["reason", "subject"]);
    expect(rec.flags.receipt.on).toEqual({ ChatMessage: 1 });
    expect(rec.flags.cleaveArm.schema).toEqual({ type: "boolean" });
    expect(Object.keys(rec.flags)).toEqual(["receipt", "cleaveArm"]);
  });

  it("is transparent: the dispatch's own return, a second install a no-op, a value it cannot read never thrown", () => {
    arm();
    expect(globalThis.Hooks.call("x", 1, 2)).toBe(3);
    expect(globalThis.Hooks.callAll("y")).toBe("dispatched");
    expect(recorder.installRecorder(PAGE_SOURCE)).toBe("already");
    const hostile = { documentName: "ChatMessage" };
    Object.defineProperty(hostile, "flags", {
      get() {
        throw new Error("no");
      }
    });
    expect(globalThis.Hooks.callAll("createChatMessage", hostile)).toBe("dispatched");
    expect(globalThis.__btbContractRecorder.errors).toBe(1);
  });
});

describe("the contract files — built from a recording, checked against the code and a run", () => {
  /** @type {typeof import("../tools/contracts.mjs")} */
  let tool;
  const DIR = mkdtempSync(join(tmpdir(), "contracts-"));
  const recording = (tag, rec) =>
    writeFileSync(join(DIR, `${tag}.json`), JSON.stringify({ tag, ...rec }));
  beforeAll(async () => {
    tool = await import("../tools/contracts.mjs");
    mkdirSync(DIR, { recursive: true });
    const payload = (kind, details) => ({
      event: "damage",
      module: "fvtt-mod-bythebooks",
      version: 2,
      kind,
      marker: "m",
      momentId: "x|receipt|m",
      actorUuid: "Actor.a",
      targets: [{ actorUuid: "Actor.b", tokenUuid: null, name: "B", hit: true }],
      details
    });
    recording("one", {
      hooks: { "bythebooks.moment": { count: 1, args: [] } },
      moments: {
        "damage|receipt": {
          count: 1,
          schema: schemaOf(payload("receipt", { taken: 4 })),
          sample: sampleOf(payload("receipt", { taken: 4 }))
        }
      },
      flags: {
        receipt: {
          count: 2,
          on: { ChatMessage: 2 },
          schema: schemaOf({
            combat: null,
            sourceUuid: "Actor.a",
            targets: [{ uuid: "b", taken: 4 }]
          })
        }
      }
    });
    recording("two", {
      hooks: {},
      moments: {
        "damage|receipt": {
          count: 1,
          schema: schemaOf(payload("receipt", { taken: 2, note: "x" }))
        }
      },
      flags: {
        receipt: {
          count: 1,
          on: { ChatMessage: 1 },
          schema: schemaOf({ combat: "c:1:0", sourceUuid: null, targets: [] })
        }
      }
    });
  });
  afterAll(() => rmSync(DIR, { recursive: true, force: true }));

  it("unions the suites' recordings: schemas merged, the first sample kept", () => {
    const run = tool.readRecordings(DIR);
    expect(run.suites).toEqual(["one", "two"]);
    expect(fieldsOf(run.moments["damage|receipt"].schema)).toContain("details.note");
    expect(run.moments["damage|receipt"].sample.details).toEqual({ taken: 4 });
    expect(run.flags.receipt.on).toEqual({ ChatMessage: 3 });
  });

  it("builds the files: every word, record, key and companion hook listed, the recorded ones shaped, the stamp found", () => {
    const run = tool.readRecordings(DIR);
    const moment = tool.buildMoment(null, run);
    const flags = tool.buildFlags(null, run, { receipt: ["auto-apply.js"] }, null);
    expect(moment.version).toBe(2);
    expect(moment.kinds.receipt.recorded).toBe(true);
    expect(moment.kinds.hold.recorded).toBe(false);
    expect(moment.events.damage).toEqual({
      kinds: ["receipt"],
      recorded: true,
      fields: moment.moments["damage|receipt"].fields
    });
    expect(moment.moments["damage|receipt"].fields).toEqual(
      expect.arrayContaining(["momentId", "targets[].hit", "details.taken", "details.note"])
    );
    expect(Object.keys(moment.hooks)).toEqual(
      expect.arrayContaining([
        "bythebooks.moment",
        "bythebooks.<event>",
        "bythebooks.holdOpened",
        "bythebooks.armorBlock"
      ])
    );
    expect(flags.keys.receipt).toMatchObject({
      class: "record",
      family: "damage",
      writers: ["auto-apply.js"],
      on: ["ChatMessage"],
      stamp: "flag",
      recorded: true
    });
    expect(flags.keys.cleaveArm).toMatchObject({ class: "state", recorded: false, fields: [] });
    expect(tool.checkOffline(moment, flags).fail).toEqual([]);
  });

  it("the offline check fails a key, word or kind the code has and the file lacks, and a stale version", () => {
    const run = tool.readRecordings(DIR);
    const moment = tool.buildMoment(null, run);
    const flags = tool.buildFlags(null, run, {}, null);
    delete flags.keys.receipt;
    delete moment.events.volley;
    moment.version = 1;
    const { fail } = tool.checkOffline(moment, flags);
    expect(fail.some(f => f.includes("card-flags.json keys") && f.includes("receipt"))).toBe(true);
    expect(fail.some(f => f.includes("moment.json events") && f.includes("volley"))).toBe(true);
    expect(fail.some(f => f.includes("version 1"))).toBe(true);
  });

  it("against a run: a new field, pair or key fails; a documented field never seen is reported", () => {
    const committed = tool.buildMoment(null, tool.readRecordings(DIR));
    const flags = tool.buildFlags(null, tool.readRecordings(DIR), {}, null);
    const later = {
      suites: ["three"],
      errors: 0,
      hooks: {
        "bythebooks.styleDice": {
          count: 1,
          args: [schemaOf({ messageId: "m", key: "k", chips: [] })]
        }
      },
      moments: {
        "damage|receipt": {
          count: 1,
          schema: schemaOf({ event: "damage", details: { taken: 1, renamed: 2 } })
        },
        "volley|volley": { count: 1, schema: schemaOf({ event: "volley" }) }
      },
      flags: {
        receipt: {
          count: 1,
          on: { ChatMessage: 1 },
          schema: schemaOf({ combat: null, sourceUuid: null, newField: 1 })
        }
      }
    };
    const { fail, note } = tool.checkRun(committed, flags, later);
    expect(fail).toEqual(
      expect.arrayContaining([
        "NEW field damage|receipt details.renamed",
        expect.stringContaining("NEW moment pair volley|volley"),
        "NEW field receipt newField",
        "NEW field bythebooks.styleDice argument 0 chips"
      ])
    );
    expect(
      note.some(
        n =>
          n.startsWith("damage|receipt: documented, not seen this run") &&
          n.includes("details.note")
      )
    ).toBe(true);
  });

  it("a key the module does not write (a tool's stamp, a table's lever) is noted, never failed", () => {
    const committed = tool.buildMoment(null, tool.readRecordings(DIR));
    const flags = tool.buildFlags(null, tool.readRecordings(DIR), {}, null);
    const run = {
      suites: ["x"],
      errors: 0,
      hooks: {},
      moments: {},
      flags: { noCover: { count: 3, on: { Scene: 3 }, schema: { type: "boolean" } } }
    };
    const { fail, note } = tool.checkRun(committed, flags, run);
    expect(fail).toEqual([]);
    expect(note.some(n => n.startsWith("noCover seen on Scene: not a key the module writes"))).toBe(
      true
    );
  });

  it("a recording and a committed file written before the fold read as folded: their ids are one <id>", () => {
    const OLD = mkdtempSync(join(tmpdir(), "contracts-old-"));
    try {
      const idMap = ids => ({
        type: "object",
        properties: Object.fromEntries(ids.map(id => [id, { type: "boolean" }])),
        required: [...ids].sort()
      });
      writeFileSync(
        join(OLD, "old.json"),
        JSON.stringify({
          tag: "old",
          hooks: {},
          moments: {},
          flags: {
            initiativeGrantRead: {
              count: 1,
              on: { Combat: 1 },
              schema: idMap(["abcdefgh12345678", "ANSpcJYzznsSwGZM"])
            }
          }
        })
      );
      const run = tool.readRecordings(OLD);
      expect(fieldsOf(run.flags.initiativeGrantRead.schema)).toEqual(["<id>"]);
      const committed = tool.buildFlags(null, run, {}, null);
      committed.keys.initiativeGrantRead.schema = idMap(["ATebbUcZtluWtOET"]);
      const flags = tool.buildFlags(committed, run, {}, null);
      expect(flags.keys.initiativeGrantRead.fields).toEqual(["<id>"]);
      const later = {
        suites: ["later"],
        errors: 0,
        hooks: {},
        moments: {},
        flags: {
          initiativeGrantRead: {
            count: 1,
            on: { Combat: 1 },
            schema: schemaOf({ zoOtbBzWmnBVXRdI: true, QWERTYUI00000000: true })
          }
        }
      };
      expect(tool.checkRun(tool.buildMoment(null, run), committed, later).fail).toEqual([]);
    } finally {
      rmSync(OLD, { recursive: true, force: true });
    }
  });

  it("a write unions into the committed file: a schema only grows, a sample once there stays", () => {
    const first = tool.buildMoment(null, tool.readRecordings(DIR));
    const again = tool.buildMoment(first, {
      suites: ["three"],
      hooks: {},
      flags: {},
      errors: 0,
      moments: {
        "damage|receipt": {
          count: 1,
          schema: schemaOf({ details: { extra: true } }),
          sample: { other: true }
        }
      }
    });
    expect(again.moments["damage|receipt"].fields).toEqual(
      expect.arrayContaining(["details.taken", "details.extra"])
    );
    expect(again.moments["damage|receipt"].sample).toEqual(first.moments["damage|receipt"].sample);
    expect(again.recorded.suites).toEqual(["one", "three", "two"]);
    const fresh = tool.buildMoment(
      first,
      { suites: ["three"], hooks: {}, flags: {}, errors: 0, moments: {} },
      true
    );
    expect(fresh.moments).toEqual({});
  });
});
