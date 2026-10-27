import { beforeAll, describe, expect, it } from "vitest";

/**
 * DECISION-layer Help action (ARCHITECTURE.md §2; RULINGS *The Help action*). No Foundry stub on purpose:
 * the item's data, which assists the facts allow, what an answer may be, the effect each facet writes and
 * the card's words are plain arithmetic over plain objects.
 */
/** @type {typeof import("../scripts/decide/help.js")} */
let h;
beforeAll(async () => {
  h = await import("../scripts/decide/help.js");
});

describe("the Help item", () => {
  it("is a feature with one Utility activity, an Action, one creature targeted, fingerprinted as the module's", () => {
    const item = h.helpItemData({ description: "<p>the page</p>" });
    expect(item.name).toBe("Help");
    expect(item.type).toBe("feat");
    expect(item.system.description.value).toBe("<p>the page</p>");
    const activities = Object.values(item.system.activities);
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      type: "utility",
      activation: { type: "action", value: 1 },
      target: { affects: { type: "creature", count: "1" } }
    });
    expect(activities[0]._id).toMatch(/^[a-zA-Z0-9]{16}$/);
    expect(item.flags["fvtt-mod-bythebooks"].helpItem).toBe(true);
  });
  it("points at the glossary page by CONFIG key, each facet at its own paragraph", () => {
    expect(h.HELP_RULE).toEqual({ page: "rule", key: "help" });
    expect(h.helpRuleFor("attack")).toEqual({
      page: "rule",
      key: "help",
      benefit: "Assist an Attack Roll"
    });
    expect(h.helpRuleFor("check")).toEqual({
      page: "rule",
      key: "help",
      benefit: "Assist an Ability Check"
    });
  });
  it("names the effects as the registry's rows do, under fixed ids", () => {
    expect(h.HELP_FACETS.attack.effect).toBe("Helped");
    expect(h.HELP_FACETS.check.effect).toBe("Assisted");
    for (const id of Object.values(h.HELP_IDS)) expect(id).toMatch(/^[a-zA-Z0-9]{16}$/);
  });
});

describe("lendable — what the helper may lend", () => {
  it("skills at proficiency 1 or more, every tool listed; an unproficient skill never", () => {
    const out = h.lendable({
      skills: [
        { key: "prc", label: "Perception", value: 1 },
        { key: "ste", label: "Stealth", value: 2 },
        { key: "ath", label: "Athletics", value: 0 }
      ],
      tools: [{ key: "thief", label: "Thieves' Tools" }]
    });
    expect(out).toEqual([
      { kind: "skill", key: "prc", label: "Perception" },
      { kind: "skill", key: "ste", label: "Stealth" },
      { kind: "tool", key: "thief", label: "Thieves' Tools" }
    ]);
  });
  it("an empty sheet lends nothing", () => {
    expect(h.lendable({})).toEqual([]);
  });
});

describe("helpRows — the popup's rows: the attack, then one check per lend", () => {
  const lends = [
    { kind: "skill", key: "prc", label: "Perception" },
    { kind: "tool", key: "thief", label: "Thieves' Tools" }
  ];
  it("within 5 feet with two lends: three open rows, the checks keyed by their lend and showing its label", () => {
    const rows = h.helpRows({ targetName: "Goblin", feet: 5, lends });
    expect(rows.map(r => r.key)).toEqual(["attack", "check:skill:prc", "check:tool:thief"]);
    expect(rows[0]).toMatchObject({ name: "Assist an Attack Roll", tag: "vs Goblin", off: null });
    expect(rows[1]).toMatchObject({
      name: "Assist an Ability Check",
      dice: "Perception",
      tag: "for Goblin",
      off: null
    });
    expect(rows[2]).toMatchObject({
      name: "Assist an Ability Check",
      dice: "Thieves' Tools",
      off: null
    });
    expect(rows.some(r => r.checked)).toBe(false); // the choice's own "Pass just this time" starts ticked
  });
  it("beyond 5 feet the attack row is greyed with the distance; the checks stay open", () => {
    const rows = h.helpRows({ targetName: "Goblin", feet: 15, lends });
    expect(rows[0].off).toBe("Goblin is 15 ft away — an enemy within 5 feet only");
    expect(rows.slice(1).every(r => !r.off)).toBe(true);
  });
  it("an unmeasured distance (no token on this scene) keeps the attack row open — the table judges", () => {
    expect(h.helpRows({ targetName: "Goblin", feet: null, lends })[0].off).toBeNull();
  });
  it("nothing to lend: one greyed check row with the reason", () => {
    const rows = h.helpRows({ targetName: "Tycon", feet: 5, lends: [] });
    expect(rows.map(r => r.key)).toEqual(["attack", "check"]);
    expect(rows[1].off).toBe("no skill or tool proficiency to lend");
  });
  it("each row folds its own paragraph of the page", () => {
    const rows = h.helpRows({ targetName: "Goblin", feet: 5, lends });
    expect(rows[0].rule).toEqual({ page: "rule", key: "help", benefit: "Assist an Attack Roll" });
    expect(rows[1].rule).toEqual({ page: "rule", key: "help", benefit: "Assist an Ability Check" });
  });
});

describe("helpAnswer — a row's key against what was offered", () => {
  const lends = [{ kind: "skill", key: "prc", label: "Perception" }];
  const rows = [
    { key: "attack", off: null },
    { key: "check:skill:prc", off: null }
  ];
  it("the attack row's key is the attack facet", () => {
    expect(h.helpAnswer("attack", { rows, lends })).toEqual({ facet: "attack", lend: null });
  });
  it("a check row's key is the check facet with its lend", () => {
    expect(h.helpAnswer("check:skill:prc", { rows, lends })).toEqual({
      facet: "check",
      lend: lends[0]
    });
  });
  it("pass always stands: the Action went, nothing lent", () => {
    expect(h.helpAnswer("pass", { rows, lends })).toEqual({ facet: "pass", lend: null });
  });
  it("a greyed row's key is refused", () => {
    expect(
      h.helpAnswer("attack", { rows: [{ key: "attack", off: "too far" }, rows[1]], lends })
    ).toBeNull();
  });
  it("an unknown key, a lend not among the lendable, or no key is refused", () => {
    expect(
      h.helpAnswer("check:skill:ste", {
        rows: [...rows, { key: "check:skill:ste", off: null }],
        lends
      })
    ).toBeNull();
    expect(h.helpAnswer("dash", { rows, lends })).toBeNull();
    expect(h.helpAnswer(null, { rows, lends })).toBeNull();
  });
});

describe("helpEffectData — the one effect each facet writes", () => {
  it("Helped on the enemy: the row's name, no changes, no lend, the note naming both", () => {
    const e = h.helpEffectData({
      facet: "attack",
      helperName: "Owl",
      targetName: "Goblin",
      description: "<p>rule</p>"
    });
    expect(e.name).toBe("Helped");
    expect(e._id).toBe(h.HELP_IDS.attack);
    expect(e.changes).toEqual([]);
    expect(e.transfer).toBe(false);
    expect(e.flags["fvtt-mod-bythebooks"]).toEqual({ lends: null });
    expect(e.description).toContain("<p>rule</p>");
    expect(e.description).toContain("Owl took the Help action at Goblin");
    expect(e.description).toContain("start of Owl's next turn");
  });
  it("Assisted on the ally: named after the lend, carrying it as `lends`", () => {
    const e = h.helpEffectData({
      facet: "check",
      helperName: "Owl",
      targetName: "Tycon",
      lend: { kind: "skill", key: "prc", label: "Perception" }
    });
    expect(e.name).toBe("Assisted — Perception");
    expect(e._id).toBe(h.HELP_IDS.check);
    expect(e.flags["fvtt-mod-bythebooks"]).toEqual({ lends: "skill:prc" });
    expect(e.description).toContain("Tycon's next Perception check has Advantage");
  });
  it("the item's art, else the core icon", () => {
    expect(
      h.helpEffectData({ facet: "attack", helperName: "a", targetName: "b", img: "x.webp" }).img
    ).toBe("x.webp");
    expect(h.helpEffectData({ facet: "attack", helperName: "a", targetName: "b" }).img).toBe(
      h.HELP_IMG
    );
  });
});

describe("helpWords — the card, source then result", () => {
  it("the attack facet", () => {
    expect(h.helpWords({ facet: "attack", helperName: "Owl", targetName: "Goblin" })).toEqual({
      title: "Help — Assist an Attack Roll",
      line: "Advantage on the next attack roll by an ally against Goblin, until the start of Owl's next turn"
    });
  });
  it("a pass says the Action went and nothing was lent", () => {
    expect(h.helpWords({ facet: "pass", helperName: "Owl", targetName: "Tycon" })).toEqual({
      title: "Help — passed",
      line: "Owl's Action went; nothing was lent to Tycon"
    });
  });
  it("the check facet names the lend", () => {
    expect(
      h.helpWords({
        facet: "check",
        helperName: "Owl",
        targetName: "Tycon",
        lend: { label: "Perception" }
      })
    ).toEqual({
      title: "Help — Assist an Ability Check",
      line: "Tycon has Advantage on its next Perception check, until the start of Owl's next turn"
    });
  });
});
