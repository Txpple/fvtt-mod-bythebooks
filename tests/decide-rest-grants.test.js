import { beforeAll, describe, expect, it } from "vitest";

/**
 * DECISION-layer rests (ARCHITECTURE.md §2): what a rest ends on the rester — a Long Rest Concentration
 * and every effect of 8 hours or less, a Short Rest every effect of 1 hour or less (RULINGS *Rests end the
 * short effects*). No Foundry stub on purpose.
 */
/** @type {typeof import("../scripts/decide/rest-grants.js")} */
let r;
beforeAll(async () => {
  r = await import("../scripts/decide/rest-grants.js");
});

describe("effectSeconds — an effect's length off Foundry 14's duration", () => {
  it("a value in its units; rounds and turns 6 seconds each", () => {
    expect(r.effectSeconds({ value: 1, units: "minutes" })).toBe(60);
    expect(r.effectSeconds({ value: 8, units: "hours" })).toBe(28800);
    expect(r.effectSeconds({ value: 10, units: "rounds" })).toBe(60);
  });
  it("an expiry alone: a combat or turn event is short, a rest event the rest's own length", () => {
    expect(r.effectSeconds({ value: null, expiry: "turnEnd" })).toBe(0);
    expect(r.effectSeconds({ expiry: "shortRest" })).toBe(3600);
    expect(r.effectSeconds({ expiry: "longRest" })).toBe(28800);
  });
  it("no duration at all stands forever", () => {
    expect(r.effectSeconds({ value: null, units: "seconds", expiry: null })).toBe(Infinity);
    expect(r.effectSeconds(null)).toBe(Infinity);
  });
});

describe("restEnds — what a rest ends", () => {
  const effects = [
    { id: "conc", concentration: ["conc"], duration: { value: 1, units: "minutes" } },
    { id: "hand", duration: { value: 1, units: "minutes" } },
    { id: "hour", duration: { value: 1, units: "hours" } },
    { id: "eight", duration: { value: 8, units: "hours" } },
    { id: "day", duration: { value: 24, units: "hours" } },
    { id: "mark", duration: {} }
  ];
  it("a Short Rest ends what lasts an hour or less, Concentration included; a longer Concentration stands", () => {
    expect(r.restEnds(effects, "short")).toEqual({
      end: ["hand", "hour"],
      concentration: ["conc"]
    });
    const long = [{ id: "c8", concentration: ["conc"], duration: { value: 8, units: "hours" } }];
    expect(r.restEnds(long, "short")).toEqual({ end: [], concentration: [] });
  });
  it("a Long Rest ends Concentration and what lasts 8 hours or less", () => {
    expect(r.restEnds(effects, "long")).toEqual({
      end: ["hand", "hour", "eight"],
      concentration: ["conc"]
    });
  });
  it("another rest type ends nothing", () => {
    expect(r.restEnds(effects, "other")).toEqual({ end: [], concentration: [] });
  });
});

/**
 * Musician's song lands (RULINGS *Musician's song lands*): the card names who sang and who received
 * Heroic Inspiration, the float rises over each recipient, the moment carries every recipient as a target.
 */
describe("songCard — the song's own card as it lands", () => {
  const facts = {
    grant: "inspiration",
    benefit: "Encouraging Song",
    row: "Musician",
    label: "Heroic Inspiration",
    singer: "Cecil"
  };
  it("one line: the song, the grant, every recipient; the singer under it; the feat as the eyebrow", () => {
    expect(r.songCard({ ...facts, given: ["Ilka", "Tychon"] })).toEqual({
      eyebrow: "Musician",
      title: "Encouraging Song — Heroic Inspiration: Ilka, Tychon",
      subtitle: "sung by Cecil"
    });
  });
  it("a row with no benefit named is its own song", () => {
    expect(r.songCard({ ...facts, benefit: null, given: ["Ilka"] })?.title).toBe(
      "Musician — Heroic Inspiration: Ilka"
    );
  });
  it("nobody given it, no card", () => {
    expect(r.songCard({ ...facts, given: [] })).toBeNull();
    expect(r.songCard({ ...facts, given: null })).toBeNull();
  });
  it("a grant the table already sees (temp HP on the token's bar, the meal's own card) posts none", () => {
    expect(r.songCard({ ...facts, grant: "temphp", given: ["Ilka"] })).toBeNull();
    expect(r.songCard({ ...facts, grant: "meal", given: ["Ilka"] })).toBeNull();
  });
});

describe("songFloat — the text over each recipient", () => {
  const landed = { grant: "inspiration", applied: true, picks: ["Actor.ilka", "Actor.tychon"] };
  it("+Heroic Inspiration over every pick, once each", () => {
    expect(r.songFloat(landed, "Heroic Inspiration")).toEqual({
      text: "+Heroic Inspiration",
      uuids: ["Actor.ilka", "Actor.tychon"]
    });
    expect(
      r.songFloat({ ...landed, picks: ["Actor.ilka", "Actor.ilka"] }, "Heroic Inspiration")?.uuids
    ).toEqual(["Actor.ilka"]);
  });
  it("only once the grant has landed", () => {
    expect(r.songFloat({ ...landed, applied: false }, "Heroic Inspiration")).toBeNull();
    expect(
      r.songFloat({ ...landed, applied: undefined, status: "resolved" }, "Heroic Inspiration")
    ).toBeNull();
    expect(r.songFloat(null, "Heroic Inspiration")).toBeNull();
  });
  it("nobody picked, nothing floats; a temp-HP hand-out is the token bar's", () => {
    expect(r.songFloat({ ...landed, picks: [] }, "Heroic Inspiration")).toBeNull();
    expect(
      r.songFloat({ grant: "temphp", applied: true, picks: [{ uuid: "Actor.ilka", n: 5 }] }, "x")
    ).toBeNull();
  });
});

describe("the restSong moment — the singer and every recipient, for FX Studio", () => {
  /** @type {typeof import("../scripts/decide/moments.js")} */
  let m;
  beforeAll(async () => {
    m = await import("../scripts/decide/moments.js");
  });
  const song = {
    status: "resolved",
    row: "Musician",
    grant: "inspiration",
    itemId: "feat",
    actorUuid: "Actor.cecil",
    actorName: "Cecil",
    cap: 3,
    candidates: [
      { uuid: "Actor.ilka", name: "Ilka", has: false },
      { uuid: "Actor.tychon", name: "Tychon", has: false },
      { uuid: "Actor.bard", name: "Bard", has: true }
    ],
    picks: ["Actor.ilka", "Actor.tychon"]
  };
  const ctx = { messageId: "msg", itemUuid: null, activityUuid: null, actorUuid: "Actor.cecil" };
  it("resolves once landed: under `choice`, the singer the actor, each recipient a target by uuid and name", () => {
    const [moment, ...more] = m.resolvedMoments(
      "restSong",
      { ...song, applied: true, given: ["Ilka", "Tychon"] },
      ctx
    );
    expect(more).toEqual([]);
    expect(moment.marker).toBe("message");
    expect(moment.events).toEqual(["choice"]);
    expect(moment.facts.actor).toBe("Actor.cecil");
    expect(moment.facts.ability).toBe("Musician");
    expect(moment.facts.targets).toEqual([
      { uuid: "Actor.ilka", name: "Ilka" },
      { uuid: "Actor.tychon", name: "Tychon" }
    ]);
    expect(moment.facts.details).toEqual({ grant: "inspiration", given: ["Ilka", "Tychon"] });
  });
  it("nothing before the landing", () => {
    expect(m.resolvedMoments("restSong", song, ctx)).toEqual([]);
  });
});
