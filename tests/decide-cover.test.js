import { describe, expect, it } from "vitest";
import {
  CARRIED_CAUSE,
  COVER_DEGREES,
  collisionsCover,
  coverAtTheAttack,
  coverCause,
  coverStanding,
  degreeOfLines,
  measureCover,
  segmentCrossesRect,
  squaresOf
} from "../scripts/decide/cover.js";

const G = 100;
const sq = (col, row, size = 1) => ({ x: col * G, y: row * G, w: size * G, h: size * G });

/** A wall test from plain segments — the platform's collision test stands here in the machine. */
function wallsOf(...walls) {
  const cross = (p, q, r, s) => {
    const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
    if (d === 0) return false;
    const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d;
    const u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
    return t > 0 && t < 1 && u >= 0 && u <= 1;
  };
  return (a, b) => walls.some(([r, s]) => cross(a, b, r, s));
}
const vwall = (x, y0, y1) => [
  { x, y: y0 },
  { x, y: y1 }
];

describe("measured cover — the 2024 DMG's corner lines (RULINGS *Measured cover*, 2026-09-27)", () => {
  it("counts the lines: none, 1–2 Half, 3–4 Three-Quarters", () => {
    expect([0, 1, 2, 3, 4].map(degreeOfLines)).toEqual([0, 1, 1, 2, 2]);
  });

  it("an open field is no cover", () => {
    expect(measureCover({ attacker: sq(0, 0), target: sq(4, 0), grid: G }).degree.key).toBe("none");
  });

  it("a creature in the way is Half and never more, however many lines it blocks (PHB: Three-Quarters is an object's)", () => {
    const r = measureCover({
      attacker: sq(0, 0),
      target: sq(4, 0),
      grid: G,
      creatures: [{ name: "Mira", rect: sq(2, 0) }]
    });
    expect(r.degree.key).toBe("half");
    expect(r.degree.bonus).toBe(2);
    expect(r.by).toEqual(["Mira"]);
    const wall = measureCover({
      attacker: sq(0, 0),
      target: sq(4, 0),
      grid: G,
      creatures: [
        { name: "Mira", rect: sq(2, -1) },
        { name: "Tomas", rect: sq(2, 0) },
        { name: "Ash", rect: sq(2, 1) }
      ]
    });
    expect(wall.degree.key).toBe("half");
  });

  it("a wall across every line is Total — the attack cannot reach", () => {
    const r = measureCover({
      attacker: sq(0, 0),
      target: sq(4, 0),
      grid: G,
      wallBlocks: wallsOf(vwall(250, -1000, 1000))
    });
    expect(r.degree.key).toBe("total");
    expect(r.degree.bonus).toBeNull();
  });

  it("a wall's corner: the attacker's best corner sees two lines blocked, Half", () => {
    const r = measureCover({
      attacker: sq(0, 0),
      target: sq(4, 0),
      grid: G,
      wallBlocks: wallsOf(vwall(250, -500, 80))
    });
    expect(r.degree.key).toBe("half");
    expect(r.by).toEqual(["wall"]);
    expect(r.lines.filter(l => l.wall)).toHaveLength(2);
  });

  it("an arrow slit: one line through the gap, Three-Quarters", () => {
    const r = measureCover({
      attacker: sq(0, 0),
      target: sq(4, 0),
      grid: G,
      wallBlocks: wallsOf(vwall(250, -1000, 45), vwall(250, 55, 1000))
    });
    expect(r.degree.key).toBe("threeQuarters");
    expect(r.degree.bonus).toBe(5);
  });

  it("a creature beside the line does not cover — a line grazing an edge is not blocked", () => {
    // the ally stands directly below the row the line runs along
    const r = measureCover({
      attacker: sq(0, 0),
      target: sq(4, 0),
      grid: G,
      creatures: [{ name: "Mira", rect: sq(2, 1) }]
    });
    expect(r.degree.key).toBe("none");
    expect(segmentCrossesRect({ x: 0, y: 100 }, { x: 400, y: 100 }, sq(2, 1))).toBe(false);
    expect(segmentCrossesRect({ x: 0, y: 150 }, { x: 400, y: 150 }, sq(2, 1))).toBe(true);
  });

  it("a Large target: any one of its squares — the one the attacker sees best", () => {
    expect(squaresOf(sq(4, 0, 2), G)).toHaveLength(4);
    // a wall hides the ogre's top row entirely; its bottom row stands clear
    const r = measureCover({
      attacker: sq(0, 1),
      target: sq(4, 0, 2),
      grid: G,
      wallBlocks: wallsOf(vwall(350, -1000, 100))
    });
    expect(r.degree.key).toBe("none");
  });

  it("names only what set the degree: a wall that reaches Half alone, not the creature also in the line", () => {
    const r = measureCover({
      attacker: sq(0, 0),
      target: sq(4, 0),
      grid: G,
      creatures: [{ name: "Aster", rect: sq(3, 0) }],
      wallBlocks: wallsOf(vwall(250, -500, 80))
    });
    expect(r.degree.key).toBe("half");
    expect(r.by).toEqual(["wall"]);
  });

  it("Three-Quarters from walls names the wall, never the owl in the line (session 2026-10-27)", () => {
    const r = measureCover({
      attacker: sq(0, 0),
      target: sq(4, 0),
      grid: G,
      creatures: [{ name: "Omen", rect: { x: 300, y: 25, w: 50, h: 50 } }],
      wallBlocks: wallsOf(vwall(250, -1000, 45), vwall(250, 55, 1000))
    });
    expect(r.degree.key).toBe("threeQuarters");
    expect(r.by).toEqual(["wall"]);
  });

  it("a Tiny creature's space is its own one square", () => {
    expect(squaresOf({ x: 0, y: 0, w: 50, h: 50 }, G)).toEqual([{ x: 0, y: 0, w: 50, h: 50 }]);
  });
});

describe("a wall's Sight decides its cover (the user, 2026-10-28)", () => {
  const NONE = 0;
  const LIMITED = 10;
  const NORMAL = 20;
  const sense = { none: NONE, limited: LIMITED };
  const hit = (...sights) => ({ edges: new Set(sights.map(sight => ({ sight }))) });
  it("a wall that blocks sight covers; one with Sight None is seen past", () => {
    expect(collisionsCover([hit(NORMAL)], sense)).toBe(true);
    expect(collisionsCover([hit(NONE)], sense)).toBe(false);
    expect(collisionsCover([hit(NONE), hit(NORMAL)], sense)).toBe(true);
    expect(collisionsCover([hit(NONE, NORMAL)], sense)).toBe(true);
  });
  it('a line stopped only by Limited-sight walls is "limited"; a full wall on it wins', () => {
    expect(collisionsCover([hit(LIMITED)], sense)).toBe("limited");
    expect(collisionsCover([hit(LIMITED), hit(LIMITED)], sense)).toBe("limited");
    expect(collisionsCover([hit(LIMITED), hit(NORMAL)], sense)).toBe(true);
    expect(collisionsCover([hit(NONE), hit(LIMITED)], sense)).toBe("limited");
  });

  it("Limited-sight walls lift the cover to Half at most, named as such; a full wall beside them still counts", () => {
    const limited = measureCover({
      attacker: sq(0, 0),
      target: sq(4, 0),
      grid: G,
      wallBlocks: () => "limited"
    });
    expect(limited.degree.key).toBe("half");
    expect(limited.by).toEqual(["limited"]);
    expect(coverCause(limited.by)).toBe("a limited sight wall in the way");
    const slit = measureCover({
      attacker: sq(0, 0),
      target: sq(4, 0),
      grid: G,
      wallBlocks: (a, b) =>
        wallsOf(vwall(250, -1000, 45), vwall(250, 55, 1000))(a, b) ? true : "limited"
    });
    expect(slit.degree.key).toBe("threeQuarters");
    expect(slit.by).toEqual(["wall"]);
  });

  it("no collision is no cover", () => {
    expect(collisionsCover([], sense)).toBe(false);
    expect(collisionsCover(null, sense)).toBe(false);
  });
});

describe("the cause — one wording for the hover card and the attack card", () => {
  it("says what is in the way", () => {
    expect(coverCause(["wall"])).toBe("a wall in the way");
    expect(coverCause(["Omen", "Mira"])).toBe("Omen, Mira in the way");
    expect(coverCause([])).toBe("");
  });

  it("the standing cover: the measure, or the target's own status when that is more protective", () => {
    const [none, half, threeQuarters, total] = COVER_DEGREES;
    const owl = { degree: half, by: ["Omen"] };
    expect(coverStanding(0, owl)).toEqual({ degree: half, cause: "Omen in the way" });
    expect(coverStanding(2, owl)).toEqual({ degree: half, cause: "Omen in the way" });
    expect(coverStanding(5, owl)).toEqual({ degree: threeQuarters, cause: CARRIED_CAUSE });
    expect(coverStanding(5, { degree: none, by: [] })).toEqual({
      degree: threeQuarters,
      cause: CARRIED_CAUSE
    });
    expect(coverStanding(0, { degree: none, by: [] })).toEqual({ degree: none, cause: "" });
    expect(coverStanding(5, { degree: total, by: ["wall"] })).toEqual({
      degree: total,
      cause: "a wall in the way"
    });
    expect(coverStanding(null, owl)).toEqual({ degree: total, cause: CARRIED_CAUSE });
  });
});

describe("the degrees' pictures — Foundry's painted library, one per degree", () => {
  it("names a core icon for every degree", () => {
    for (const d of COVER_DEGREES) expect(d.img).toMatch(/^icons\/environment\/.+\.webp$/);
  });
});

describe("cover at the attack — the most protective applies, never added", () => {
  it("raises the recorded AC by what the measure adds over the cover already carried", () => {
    const [, half, threeQuarters, total] = COVER_DEGREES;
    expect(coverAtTheAttack(0, half)).toEqual({ raise: 2, total: false });
    expect(coverAtTheAttack(2, half)).toEqual({ raise: 0, total: false });
    expect(coverAtTheAttack(2, threeQuarters)).toEqual({ raise: 3, total: false });
    expect(coverAtTheAttack(5, half)).toEqual({ raise: 0, total: false });
    expect(coverAtTheAttack(0, total)).toEqual({ raise: 0, total: true });
  });
});
