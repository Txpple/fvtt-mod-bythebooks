import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as rb from "../scripts/decide/rebukes.js";
import * as reg from "../scripts/decide/registry.js";

const emanationsSource = readFileSync(new URL("../scripts/emanations.js", import.meta.url), "utf8");
const machineSource = readFileSync(new URL("../scripts/rebukes.js", import.meta.url), "utf8");
const byKey = reg.tableIndex(reg.EMANATIONS);
const byItem = reg.tableIndex(reg.EMANATIONS, (row, key) => row.item ?? key);
const placed = keys => rb.placedAreaDamage(keys.map(k => byKey.rowNamed(k)));

describe("rebukes — a placed area's damage answers nobody; a ring on its caster still does (the DM's ruling, 2026-11-09)", () => {
  it("a zone card names its row through any of its zone flags", () => {
    expect(rb.zoneKeysOf({ emanationTrigger: { key: "Cloud of Daggers", damage: true } })).toEqual([
      "Cloud of Daggers"
    ]);
    expect(rb.zoneKeysOf({ areaMove: { key: "Spike Growth" } })).toEqual(["Spike Growth"]);
    expect(rb.zoneKeysOf({ emanationPulse: { key: "Fire Aura" } })).toEqual(["Fire Aura"]);
    expect(rb.zoneKeysOf({ saves: {}, receipt: {} })).toEqual([]);
    expect(rb.zoneKeysOf(undefined)).toEqual([]);
  });

  it("a placed area skips: Cloud of Daggers entered or a turn ended in it, Moonbeam moved onto a creature, Spike Growth walked", () => {
    for (const key of [
      "Cloud of Daggers",
      "Moonbeam",
      "Spike Growth",
      "Wall of Fire",
      "Cloudkill",
      "Insect Plague"
    ]) {
      expect(placed([key]), key).toBe(true);
    }
  });

  it("a ring carried on its source still offers: Spirit Guardians, a monster's aura", () => {
    expect(placed(["Spirit Guardians"])).toBe(false);
    expect(placed(["Fire Aura"])).toBe(false);
    expect(placed(["Inner Radiance"])).toBe(false);
  });

  it("the cast card of a placed area spell is the area's; Spirit Guardians' cast is the caster's", () => {
    expect(rb.placedAreaDamage([byItem.rowFor({ name: "Cloud of Daggers" })])).toBe(true);
    expect(rb.placedAreaDamage([byItem.rowFor({ name: "Moonbeam" })])).toBe(true);
    expect(rb.placedAreaDamage([byItem.rowFor({ name: "Spirit Guardians" })])).toBe(false);
  });

  it("damage dealt at the cast or the blow stays the dealer's: Fireball, Burning Hands, Shatter, Thunderwave, a spell attack", () => {
    for (const name of ["Fireball", "Burning Hands", "Shatter", "Thunderwave", "Eldritch Blast"]) {
      expect(byItem.rowFor({ name }), name).toBeNull();
      expect(rb.placedAreaDamage([byItem.rowFor({ name })]), name).toBe(false);
    }
    expect(rb.placedAreaDamage([])).toBe(false);
  });

  it("a key the table does not know is a blow, never a guessed exemption", () => {
    expect(placed(["No Such Area"])).toBe(false);
  });

  it("only a row aimed at the dealer is skipped: a self answer (Misty Escape) still stands", () => {
    expect(rb.rebukeAimsAtDealer(reg.REBUKES["Hellish Rebuke"])).toBe(true);
    expect(rb.rebukeAimsAtDealer(reg.REBUKES["Storm's Thunder"])).toBe(true);
    expect(rb.rebukeAimsAtDealer(reg.REBUKES["Misty Escape"])).toBe(false);
  });

  it("the zone flags are the ones emanations.js stamps, each with the row's key (a rename there must move here)", () => {
    for (const flag of rb.ZONE_CARD_FLAGS) {
      expect(emanationsSource).toMatch(new RegExp(`\\b${flag}: \\{[^}]*\\bkey: row\\.key`));
    }
  });

  it("the machine passes the verdict from the damage seam into the offer", () => {
    expect(machineSource).toMatch(/const zone = isZoneDamage\(origin\);/);
    expect(machineSource).toMatch(/if \( zone && rebukeAimsAtDealer\(row\) \) continue;/);
  });
});
