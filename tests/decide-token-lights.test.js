import { beforeAll, describe, expect, it } from "vitest";

/**
 * DECISION-layer token lights (ARCHITECTURE.md §2; the Aasimar walk, 2026-09-25): which use sheds
 * a light, the changes that carry it, and who it lands on. No Foundry stub on purpose.
 */
/** @type {typeof import("../scripts/decide/token-lights.js")} */
let tl;
/** @type {typeof import("../scripts/decide/registry.js")} */
let reg;
beforeAll(async () => {
  tl = await import("../scripts/decide/token-lights.js");
  reg = await import("../scripts/decide/registry.js");
});

const all = () => new Set(Object.keys(reg.TOKEN_LIGHTS).map(k => k.toLowerCase()));

describe("lightRowKey — the use a row answers to", () => {
  it("Inner Radiance answers to its own activity on Celestial Revelation, not the item's other forms", () => {
    expect(
      tl.lightRowKey(
        reg.TOKEN_LIGHTS,
        { itemName: "Celestial Revelation", activityName: "Inner Radiance" },
        all()
      )
    ).toBe("Inner Radiance");
    expect(
      tl.lightRowKey(
        reg.TOKEN_LIGHTS,
        { itemName: "Celestial Revelation", activityName: "Heavenly Wings" },
        all()
      )
    ).toBeNull();
  });
  it("Light answers to any use of the spell", () => {
    expect(
      tl.lightRowKey(reg.TOKEN_LIGHTS, { itemName: "Light", activityName: "Summon" }, all())
    ).toBe("Light");
    expect(
      tl.lightRowKey(reg.TOKEN_LIGHTS, { itemName: "light", activityName: "Cast" }, all())
    ).toBe("Light");
  });
  it("the list is the switch: a row off the list answers to nothing", () => {
    expect(
      tl.lightRowKey(
        reg.TOKEN_LIGHTS,
        { itemName: "Light", activityName: "Summon" },
        new Set(["inner radiance"])
      )
    ).toBeNull();
    expect(tl.lightRowKey(reg.TOKEN_LIGHTS, { itemName: "", activityName: "x" }, all())).toBeNull();
  });
});

describe("lightChanges — the token's own light, Foundry 14's `token.*` changes", () => {
  it("Inner Radiance: 10 Bright, 20 Dim (the dim radius is the OUTER one); Light: 20 and 40", () => {
    expect(tl.lightChanges(reg.TOKEN_LIGHTS["Inner Radiance"])).toEqual([
      { key: "token.light.bright", type: "override", value: 10, phase: "initial" },
      { key: "token.light.dim", type: "override", value: 20, phase: "initial" }
    ]);
    expect(
      tl
        .lightChanges(reg.TOKEN_LIGHTS.Light)
        .slice(0, 2)
        .map(c => c.value)
    ).toEqual([20, 40]);
  });
  it("a dim below the bright is lifted to it; nonsense reads as nothing", () => {
    expect(tl.lightChanges({ bright: 10, dim: 5 }).map(c => c.value)).toEqual([10, 10]);
    // D1 — no light at all (nonsense included) writes NOTHING: never a 0 over the token's own light (Elder Champion).
    expect(tl.lightChanges({ bright: "x", dim: null })).toEqual([]);
    expect(tl.lightChanges({ bright: 0, dim: 0 })).toEqual([]);
  });
});

describe("lightTargets — who the light lands on", () => {
  const me = { uuid: "Actor.a", name: "Aasimar" };
  const t1 = { uuid: "Actor.v", name: "Victim" };
  it("a self row lights its user whatever is targeted", () => {
    expect(tl.lightTargets({ on: "self" }, { self: me, targets: [t1] })).toEqual([me]);
  });
  it("a targets row lights every creature targeted, once each — and nobody targeted is no light", () => {
    expect(tl.lightTargets({ on: "targets" }, { self: me, targets: [t1, t1] })).toEqual([t1]);
    expect(tl.lightTargets({ on: "targets" }, { self: me, targets: [] })).toEqual([]);
  });
});

describe("Produce Flame — the flame in the hand lights its caster; a recast replaces it, a hurl puts it out (RULINGS *Produce Flame*)", () => {
  const row = () => reg.TOKEN_LIGHTS["Produce Flame"];
  it("the row: on the caster, the module's own effect, a recast ends the earlier one, Hurl Fire puts it out", () => {
    expect(row()).toMatchObject({
      activity: "Cast",
      on: "self",
      effect: null,
      recast: "ends",
      out: "Hurl Fire",
      bright: 20,
      dim: 40
    });
    expect(Object.isFrozen(row())).toBe(true);
    expect(row().rule).toEqual({
      item: "Produce Flame",
      uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplProduceFla"
    });
  });
  it("the Cast lights it; Hurl Fire does not light it", () => {
    expect(
      tl.lightRowKey(reg.TOKEN_LIGHTS, { itemName: "Produce Flame", activityName: "Cast" }, all())
    ).toBe("Produce Flame");
    expect(
      tl.lightRowKey(
        reg.TOKEN_LIGHTS,
        { itemName: "Produce Flame", activityName: "Hurl Fire" },
        all()
      )
    ).toBeNull();
  });
  it("Hurl Fire puts it out; the Cast, another spell's use and an unlisted row put nothing out", () => {
    expect(
      tl.lightOutKey(
        reg.TOKEN_LIGHTS,
        { itemName: "Produce Flame", activityName: "Hurl Fire" },
        all()
      )
    ).toBe("Produce Flame");
    expect(
      tl.lightOutKey(
        reg.TOKEN_LIGHTS,
        { itemName: "produce flame", activityName: "hurl fire" },
        all()
      )
    ).toBe("Produce Flame");
    expect(
      tl.lightOutKey(reg.TOKEN_LIGHTS, { itemName: "Produce Flame", activityName: "Cast" }, all())
    ).toBeNull();
    expect(
      tl.lightOutKey(reg.TOKEN_LIGHTS, { itemName: "Light", activityName: "Hurl Fire" }, all())
    ).toBeNull();
    expect(
      tl.lightOutKey(
        reg.TOKEN_LIGHTS,
        { itemName: "Produce Flame", activityName: "Hurl Fire" },
        new Set(["light"])
      )
    ).toBeNull();
    expect(
      tl.lightOutKey(reg.TOKEN_LIGHTS, { itemName: "Produce Flame", activityName: "" }, all())
    ).toBeNull();
  });
  it("a world copy whose Cast applies its own 'Produce Flame' effect: the light adopts it (one effect, not two)", () => {
    const use = effectName => ({
      itemName: "Produce Flame",
      activityName: "Cast",
      activityType: "utility",
      effectName
    });
    expect(tl.lightAdopts(reg.TOKEN_LIGHTS, use("Produce Flame"), all())).toBe("Produce Flame");
    expect(tl.lightAdopts(reg.TOKEN_LIGHTS, use("produce flame"), all())).toBe("Produce Flame");
    // another effect the copy carries stays the cast path's
    expect(tl.lightAdopts(reg.TOKEN_LIGHTS, use("Warmed"), all())).toBeNull();
    // the hurl is not the row's use; an unlisted row adopts nothing
    expect(
      tl.lightAdopts(
        reg.TOKEN_LIGHTS,
        {
          itemName: "Produce Flame",
          activityName: "Hurl Fire",
          activityType: "attack",
          effectName: "Produce Flame"
        },
        all()
      )
    ).toBeNull();
    expect(tl.lightAdopts(reg.TOKEN_LIGHTS, use("Produce Flame"), new Set(["light"]))).toBeNull();
  });
  it("an enchantment is never adopted, nor a use that is not a utility (Sacred Weapon's Enchant, the hurl)", () => {
    expect(
      tl.lightAdopts(
        reg.TOKEN_LIGHTS,
        {
          itemName: "Sacred Weapon",
          activityName: "Sacred Weapon",
          activityType: "enchant",
          effectName: "Sacred Weapon",
          effectType: "enchantment"
        },
        all()
      )
    ).toBeNull();
    expect(
      tl.lightAdopts(
        reg.TOKEN_LIGHTS,
        {
          itemName: "Sacred Weapon",
          activityName: "Sacred Weapon",
          activityType: "utility",
          effectName: "Sacred Weapon",
          effectType: "enchantment"
        },
        all()
      )
    ).toBeNull();
  });
  it("a row that names its pack effect adopts nothing: the pack effect is the row's own (Corona of Light)", () => {
    expect(
      tl.lightAdopts(
        reg.TOKEN_LIGHTS,
        {
          itemName: "Corona of Light",
          activityName: "Emit Aura of Sunlight",
          effectName: "Corona of Light"
        },
        all()
      )
    ).toBeNull();
  });
  it("the item names a row answers to: its `item`, else its key", () => {
    const names = tl.lightItemNames(reg.TOKEN_LIGHTS);
    expect(names).toContain("Produce Flame");
    expect(names).toContain("Celestial Revelation");
    expect(names).not.toContain("Inner Radiance");
  });
  it("the effect wears the spell's icon, the module's own or an adopted copy's; a named pack effect keeps its own", () => {
    const spellImg = "icons/magic/light/hand-sparks-glow-yellow.webp";
    expect(tl.lightEffectImg(row(), { itemImg: spellImg, effectImg: "icons/svg/aura.svg" })).toBe(
      spellImg
    );
    expect(tl.lightEffectImg(row(), { itemImg: spellImg })).toBe(spellImg);
    expect(tl.lightEffectImg(row(), { itemImg: null, effectImg: "icons/svg/aura.svg" })).toBe(
      "icons/svg/aura.svg"
    );
    expect(tl.lightEffectImg(row(), {})).toBe(tl.LIGHT_EFFECT_IMG);
    expect(
      tl.lightEffectImg(reg.TOKEN_LIGHTS["Inner Radiance"], {
        itemImg: "celestial.webp",
        effectImg: "searing.webp"
      })
    ).toBe("searing.webp");
  });
  it("a token's own light: its radii when it sheds one, else null (the out card names a light set on the token)", () => {
    expect(tl.tokenOwnLight({ bright: 10, dim: 20 })).toEqual({ bright: 10, dim: 20 });
    expect(tl.tokenOwnLight({ bright: 0, dim: 5 })).toEqual({ bright: 0, dim: 5 });
    expect(tl.tokenOwnLight({ bright: 10, dim: 0 })).toEqual({ bright: 10, dim: 10 });
    expect(tl.tokenOwnLight({ bright: 0, dim: 0 })).toBeNull();
    expect(tl.tokenOwnLight(null)).toBeNull();
  });
  it("only Produce Flame has an `out` use", () => {
    expect(
      Object.entries(reg.TOKEN_LIGHTS)
        .filter(([, r]) => r.out)
        .map(([k]) => k)
    ).toEqual(["Produce Flame"]);
  });
  it("20 ft Bright, 40 ft Dim (the OUTER radius), a warm flame's flicker with no white core", () => {
    const changes = tl.lightChanges(row());
    const at = key => changes.find(c => c.key === key)?.value;
    expect(at("token.light.bright")).toBe(20);
    expect(at("token.light.dim")).toBe(40);
    expect(at("token.light.color")).toBe(reg.SPELL_LOOKS.produceFlame.color);
    expect(at("token.light.animation.type")).toBe("torch");
    expect(at("token.light.attenuation")).toBeGreaterThanOrEqual(0.8);
    expect(changes.every(c => c.type === "override" && c.phase === "initial")).toBe(true);
  });
  it("it lights the caster alone, whoever is targeted", () => {
    const me = { uuid: "Actor.d", name: "Druid" };
    expect(
      tl.lightTargets(row(), { self: me, targets: [{ uuid: "Actor.v", name: "Victim" }] })
    ).toEqual([me]);
  });
});

describe("lightLasts — how long the light stands, in the card's words", () => {
  it("a recast row stands until its effect is removed; Produce Flame says what else puts it out", () => {
    expect(tl.lightLasts(reg.TOKEN_LIGHTS.Light)).toBe(
      "until its effect is removed or the spell is cast again"
    );
    expect(tl.lightLasts(reg.TOKEN_LIGHTS["Produce Flame"])).toBe(
      "until its effect is removed or the spell is cast again; Hurl Fire puts it out"
    );
  });
  it("a form's light stands while the form does; an enchantment's while the enchantment does", () => {
    expect(tl.lightLasts(reg.TOKEN_LIGHTS["Inner Radiance"])).toBe(
      "while the transformation stands"
    );
    expect(tl.lightLasts(reg.TOKEN_LIGHTS["Sacred Weapon"])).toBe(
      "while the weapon's enchantment stands"
    );
  });
  it("a spell no recast ends never says a recast ends it (Continual Flame)", () => {
    expect(tl.lightLasts(reg.TOKEN_LIGHTS["Continual Flame"])).toBe("for the spell's duration");
  });
});

describe("token senses — the pack's own effect, the token's vision (the Dwarf walk, 2026-09-25)", () => {
  const senses = () => new Set(Object.keys(reg.TOKEN_SENSES).map(k => k.toLowerCase()));
  it("Stonecunning's effect answers by its name, case-insensitive; unlisted or unnamed is nothing", () => {
    expect(tl.senseRowKey(reg.TOKEN_SENSES, "Stonecunning", senses())).toBe("Stonecunning");
    expect(tl.senseRowKey(reg.TOKEN_SENSES, "stonecunning", senses())).toBe("Stonecunning");
    expect(tl.senseRowKey(reg.TOKEN_SENSES, "Stonecunning", new Set())).toBeNull();
    expect(tl.senseRowKey(reg.TOKEN_SENSES, "Searing Radiance", senses())).toBeNull();
    expect(tl.senseRowKey(reg.TOKEN_SENSES, "", senses())).toBeNull();
  });
  it("Stonecunning: Tremorsense vision at 60 ft and Feel Tremor detection at 60 ft", () => {
    expect(tl.senseChanges(reg.TOKEN_SENSES.Stonecunning)).toEqual([
      { key: "token.sight.visionMode", type: "override", value: "tremorsense", phase: "initial" },
      { key: "token.sight.range", type: "override", value: 60, phase: "initial" },
      {
        key: "token.detectionModes.feelTremor.enabled",
        type: "override",
        value: true,
        phase: "initial"
      },
      {
        key: "token.detectionModes.feelTremor.range",
        type: "override",
        value: 60,
        phase: "initial"
      }
    ]);
  });
  it("an effect already carrying a sense is not given it twice; the pack's own change is not one", () => {
    expect(tl.carriesSense([{ key: "system.attributes.senses.tremorsense" }])).toBe(false);
    expect(tl.carriesSense(tl.senseChanges(reg.TOKEN_SENSES.Stonecunning))).toBe(true);
  });
});

describe("token sizes (the Goliath walk, 2026-09-25)", () => {
  const listed = () => new Set(Object.keys(reg.TOKEN_SIZES).map(k => k.toLowerCase()));
  // dnd5e 6.0.5's CONFIG.DND5E.actorSizes, the fields read (measured on the sandbox).
  const SIZES = {
    tiny: { numerical: 0, token: 0.5 },
    sm: { numerical: 1 },
    med: { numerical: 2 },
    lg: { numerical: 3, token: 2 },
    huge: { numerical: 4, token: 3 },
    grg: { numerical: 5, token: 4 }
  };
  it("an effect's name finds its row and entry among the listed rows only", () => {
    expect(tl.sizeRowFor(reg.TOKEN_SIZES, "Large Form", listed())).toEqual({
      key: "Large Form",
      entry: { size: "lg" }
    });
    expect(tl.sizeRowFor(reg.TOKEN_SIZES, "enlarged", listed())).toEqual({
      key: "Enlarge/Reduce",
      entry: { step: 1 }
    });
    expect(tl.sizeRowFor(reg.TOKEN_SIZES, "Reduced", listed())).toEqual({
      key: "Enlarge/Reduce",
      entry: { step: -1 }
    });
    expect(tl.sizeRowFor(reg.TOKEN_SIZES, "Large Form", new Set())).toBeNull();
    expect(tl.sizeRowFor(reg.TOKEN_SIZES, "Stonecunning", listed())).toBeNull();
  });
  it("Large Form makes a Medium creature Large, and a Large one nothing", () => {
    expect(tl.sizeAfter({ size: "lg" }, "med", SIZES)).toBe("lg");
    expect(tl.sizeAfter({ size: "lg" }, "lg", SIZES)).toBeNull();
  });
  it("a step moves one size along the system's order, clamped at both ends", () => {
    expect(tl.sizeAfter({ step: 1 }, "med", SIZES)).toBe("lg");
    expect(tl.sizeAfter({ step: 1 }, "lg", SIZES)).toBe("huge");
    expect(tl.sizeAfter({ step: -1 }, "med", SIZES)).toBe("sm");
    expect(tl.sizeAfter({ step: -1 }, "tiny", SIZES)).toBeNull();
    expect(tl.sizeAfter({ step: 1 }, "grg", SIZES)).toBeNull();
    expect(tl.sizeAfter({ step: 1 }, "unknown", SIZES)).toBeNull();
  });
  it("the changes: the sheet's size and the token's footprint, 1 where the system gives none", () => {
    expect(tl.sizeChanges("lg", SIZES)).toEqual([
      { key: "system.traits.size", type: "override", value: "lg", phase: "initial" },
      { key: "token.width", type: "override", value: 2, phase: "initial" },
      { key: "token.height", type: "override", value: 2, phase: "initial" }
    ]);
    expect(tl.sizeChanges("sm", SIZES)[1].value).toBe(1);
    expect(tl.sizeChanges("tiny", SIZES)[1].value).toBe(0.5);
  });
  it("an effect already carrying a size is not given it twice; the pack's speed change is not one", () => {
    expect(tl.carriesSize([{ key: "system.attributes.movement.walk" }])).toBe(false);
    expect(tl.carriesSize(tl.sizeChanges("lg", SIZES))).toBe(true);
  });
});
