// EVERY PART OF A ROLL SAYS WHERE IT CAME FROM, live (RULINGS *Every part of a roll says where it came from*): the parts
// dnd5e builds named at its post-build hook, the module's own part named where it adds it, an effect the module writes
// naming its roll bonuses, and a feat that lost its effect reading the original's number (*The fighting styles*).
// Fixture: BTB Test Vanguard (fixture-suite). Every roll is built and stopped at dnd5e's last hook
// (`dnd5e.postRollConfiguration`): nothing is rolled, posted or spent. The proficiencies it sets, Exhaustion, the lent
// items and the effects are restored.
//
//   node tools/probe-roll-labels.mjs              the whole probe
//   node tools/probe-roll-labels.mjs --section 2  just §2; `--list` for the table
// Setup and teardown ALWAYS run.
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from "./harness.mjs";

// The coverage map (tools/coverage-map.mjs) parses this; ⚠ never import a suite (it connects on evaluation).
export const COVERS = ["polish.js", "damage-rules.js"];

const SECTIONS = {
  1: "dnd5e's parts named: a check's Str, a save's Cha and Proficiency (the Cloak's +1 bare), a skill's Expertise and Half Proficiency, an attack's Str and Proficiency",
  2: "Exhaustion named on every d20 test: initiative, a check, a save, a skill, an attack",
  3: "the module's own part named: Dueling's +2 on a one-handed Longsword's damage, Str beside it",
  4: "an effect the module writes names its roll bonuses (Bless's 1d4, on the effect and on a save); one written by hand keeps its words",
  5: "a feat that lost its effect reads the original's number: Dueling's face live carrying the PHB's +2, the damage still +2; with no original, the face off and saying why"
};
const DEPENDS = {};

const TAG = "probe-roll-labels";
const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: TAG, watchdogMs: 180_000 });
announcePlan(TAG, plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = "fvtt-mod-bythebooks";
  const { until } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });

  // ---- preflight
  const mod = game.modules.get(MOD);
  if ( !mod?.active ) return { fatal: `module active=${mod?.active}` };
  const v = game.actors.getName("BTB Test Vanguard");
  if ( !v ) return { fatal: "missing fixture: BTB Test Vanguard (run tools/fixture-suite.mjs)" };
  const sword = v.items.find(i => (i.type === "weapon") && /longsword/i.test(i.name));
  const swordAttack = sword ? [...sword.system.activities].find(a => a.type === "attack") : null;
  if ( !swordAttack ) return { fatal: "BTB Test Vanguard has no Longsword attack — run tools/fixture-suite.mjs" };
  log.push(`module ${mod.version}`);

  // Every roll is built and stopped at dnd5e's last hook: its formula, never rolled.
  let caught = null;
  const hookId = Hooks.on("dnd5e.postRollConfiguration", rolls => { caught = rolls.map(r => r.formula); return false; });
  const NO = [{ configure: false }, { create: false }];
  const built = async fn => { caught = null; await fn(); return caught?.[0] ?? ""; };
  const initiative = () => { delete v._cachedInitiativeRoll; return v.getInitiativeRoll()?.formula ?? ""; };
  const findPHB = async (name, type) => {
    for ( const pack of game.packs.filter(p => (p.metadata.packageName === "dnd-players-handbook") && (p.documentName === "Item")) ) {
      const hit = (await pack.getIndex({ fields: ["type"] })).find(e => (e.name === name) && (e.type === type));
      if ( hit ) return pack.getDocument(hit._id);
    }
    return null;
  };
  const duelFace = () => v.effects.find(e => e.flags?.[MOD]?.fightingStyle?.key === "dueling") ?? null;
  // The Exhaustion this probe added goes as its effect: a toggle would only add another level.
  const clearExhaustion = async () => {
    const ids = v.effects.filter(e => e.statuses?.has?.("exhaustion")).map(e => e.id);
    if ( ids.length ) await v.deleteEmbeddedDocuments("ActiveEffect", ids);
    await until(() => !v.statuses.has("exhaustion"), { timeout: 4000, label: "Exhaustion off the Vanguard" }).catch(() => null);
  };
  const changesOf = e => [...(e?.system?.changes ?? e?.changes ?? [])];

  const prior = {
    ath: v.system.skills?.ath?.value ?? 0, his: v.system.skills?.his?.value ?? 0,
    chaSave: v.system.abilities?.cha?.proficient ?? 0,
    swordProficient: sword.system.proficient ?? null, swordEquipped: sword.system.equipped === true
  };
  let exhausted = false;
  const lent = [], made = [];
  try {
    // ---- setup (always runs): the proficiencies a pack-built fixture lacks, the Longsword in hand
    await v.update({ "system.skills.ath.value": 2, "system.skills.his.value": 0.5, "system.abilities.cha.proficient": 1 });
    await sword.update({ "system.proficient": 1, "system.equipped": true });

    // ---- 1. dnd5e's parts
    if ( want(1) ) await section(1, async () => {
      const str = await built(() => v.rollAbilityCheck({ ability: "str" }, ...NO));
      ok("1. an ability check names its ability: Str", /\b3\[Str\]/.test(str), `formula="${str}"`);
      const cha = await built(() => v.rollSavingThrow({ ability: "cha" }, ...NO));
      ok("1b. a proficient save names Cha and Proficiency; the Cloak's +1, a worn item's, stays bare",
        /\b2\[Cha\]/.test(cha) && /\b3\[Proficiency\]/.test(cha) && /\+ 1(?!\[)/.test(cha), `formula="${cha}"`);
      const ath = await built(() => v.rollSkill({ skill: "ath" }, ...NO));
      ok("1c. a skill with Expertise names Str and Expertise", /\b3\[Str\]/.test(ath) && /\b6\[Expertise\]/.test(ath), `formula="${ath}"`);
      const his = await built(() => v.rollSkill({ skill: "his" }, ...NO));
      ok("1d. a skill at half proficiency, no feature to name it: Half Proficiency; the Int of 0 stays bare",
        /\b1\[Half Proficiency\]/.test(his) && !/\[Int\]/.test(his), `formula="${his}"`);
      const atk = await built(() => swordAttack.rollAttack({}, ...NO));
      ok("1e. an attack names Str and Proficiency", /\b3\[Str\]/.test(atk) && /\b3\[Proficiency\]/.test(atk), `formula="${atk}"`);
    });

    // ---- 2. Exhaustion on every d20 test (its reduction is built after an earlier hook on skills and attacks)
    if ( want(2) ) await section(2, async () => {
      // ⚠ A condition with levels ignores `active`: dnd5e 6's toggle adds `levels` (1 by default), so "off" would add one.
      if ( !v.statuses.has("exhaustion") ) {
        await v.toggleStatusEffect("exhaustion", { levels: 1 });
        exhausted = true;
      }
      await until(() => v.statuses.has("exhaustion"), { timeout: 4000, label: "Exhaustion on the Vanguard" }).catch(() => null);
      const rolls = {
        initiative: initiative(),
        check: await built(() => v.rollAbilityCheck({ ability: "str" }, ...NO)),
        save: await built(() => v.rollSavingThrow({ ability: "cha" }, ...NO)),
        skill: await built(() => v.rollSkill({ skill: "ath" }, ...NO)),
        attack: await built(() => swordAttack.rollAttack({}, ...NO))
      };
      const bare = Object.entries(rolls).filter(([, formula]) => !/- 2\[Exhaustion\]/.test(formula)).map(([k]) => k);
      ok("2. Exhaustion 1 reads \"- 2[Exhaustion]\" on initiative, a check, a save, a skill and an attack",
        !bare.length, `missing on ${JSON.stringify(bare)} — ${JSON.stringify(rolls)}`);
    });
    if ( exhausted ) {
      await clearExhaustion();
      exhausted = false;
    }

    // ---- 3. the module's own part
    if ( want(3) ) await section(3, async () => {
      const duel = await findPHB("Dueling", "feat");
      if ( !duel ) { skips.push("§3: the PHB's Dueling is not on this box"); return; }
      lent.push(...await v.createEmbeddedDocuments("Item", [duel.toObject()]));
      const face = await until(() => { const e = duelFace(); return (e && !e.disabled) ? e : null; }, { timeout: 5000 }).catch(() => null);
      const dmg = await built(() => swordAttack.rollDamage({ attackMode: "oneHanded" }, ...NO));
      ok("3. Dueling's +2 rides a one-handed Longsword's damage named \"2[Dueling]\", Str beside it",
        !!face && /\b2\[Dueling\]/.test(dmg) && /\b3\[Str\]/.test(dmg), `face=${!!face} formula="${dmg}"`);
      await v.deleteEmbeddedDocuments("Item", lent.splice(0).map(i => i.id).filter(id => v.items.get(id)));
      await until(() => !duelFace(), { timeout: 5000, label: "the Dueling face gone" }).catch(() => null);
    });

    // ---- 4. an effect the module writes
    if ( want(4) ) await section(4, async () => {
      const bless = await findPHB("Bless", "spell");
      const template = bless?.effects?.contents?.[0]?.toObject();
      if ( !template ) { skips.push("§4: the PHB's Bless (its effect) is not on this box"); return; }
      delete template._id;
      const ours = foundry.utils.mergeObject(foundry.utils.deepClone(template), { origin: bless.uuid, flags: { [MOD]: { applied: true } } });
      const [named] = await v.createEmbeddedDocuments("ActiveEffect", [ours]);
      made.push(named);
      const values = changesOf(named).map(c => String(c.value));
      const save = await built(() => v.rollSavingThrow({ ability: "cha" }, ...NO));
      ok(`4. the module's Bless names its bonuses after its effect ("1d4[${named.name}]") and a save carries the name`,
        values.length && values.every(x => x.endsWith(`[${named.name}]`)) && save.includes(`1d4[${named.name}]`), `values=${JSON.stringify(values)} formula="${save}"`);
      await v.deleteEmbeddedDocuments("ActiveEffect", made.splice(0).map(e => e.id).filter(id => v.effects.get(id)));
      const byHand = foundry.utils.mergeObject(foundry.utils.deepClone(template), { origin: bless.uuid });
      const [plain] = await v.createEmbeddedDocuments("ActiveEffect", [byHand]);
      made.push(plain);
      const plainValues = changesOf(plain).map(c => String(c.value));
      ok("4b. the same effect written by hand keeps its words", plainValues.length && !plainValues.some(x => x.includes("[")), `values=${JSON.stringify(plainValues)}`);
      await v.deleteEmbeddedDocuments("ActiveEffect", made.splice(0).map(e => e.id).filter(id => v.effects.get(id)));
    });

    // ---- 5. a feat that lost its effect
    if ( want(5) ) await section(5, async () => {
      const duel = await findPHB("Dueling", "feat");
      if ( !duel ) { skips.push("§5: the PHB's Dueling is not on this box"); return; }
      const stripped = foundry.utils.mergeObject(duel.toObject(), { _stats: { compendiumSource: duel.uuid } });
      stripped.effects = [];
      lent.push(...await v.createEmbeddedDocuments("Item", [stripped]));
      const face = await until(() => { const e = duelFace(); return (e && !e.disabled && e.flags[MOD].fightingStyle.bonus) ? e : null; }, { timeout: 6000 }).catch(() => null);
      const dmg = await built(() => swordAttack.rollDamage({ attackMode: "oneHanded" }, ...NO));
      ok("5. Dueling with its effect gone: the face live, carrying the PHB original's +2, and the damage still \"2[Dueling]\"",
        !!face && (String(face.flags[MOD].fightingStyle.bonus) === "2") && /\b2\[Dueling\]/.test(dmg),
        `face=${JSON.stringify(duelFace()?.flags?.[MOD]?.fightingStyle ?? null)} formula="${dmg}"`);
      await v.deleteEmbeddedDocuments("Item", lent.splice(0).map(i => i.id).filter(id => v.items.get(id)));
      await until(() => !duelFace(), { timeout: 5000, label: "the Dueling face gone" }).catch(() => null);
      const orphan = duel.toObject();
      orphan.effects = [];
      orphan._stats = { ...(orphan._stats ?? {}), compendiumSource: null, duplicateSource: null };
      foundry.utils.setProperty(orphan, "flags.core.sourceId", null);
      lent.push(...await v.createEmbeddedDocuments("Item", [orphan]));
      const off = await until(() => { const e = duelFace(); return e?.disabled ? e : null; }, { timeout: 6000 }).catch(() => null);
      const dmg2 = await built(() => swordAttack.rollDamage({ attackMode: "oneHanded" }, ...NO));
      ok("5b. with no original to read, the face is off and says why, and nothing rides the damage",
        !!off && /its own effect is missing/.test(off.flags[MOD].fightingStyle.detail ?? "") && !/\[Dueling\]/.test(dmg2),
        `face=${JSON.stringify(duelFace()?.flags?.[MOD]?.fightingStyle ?? null)} formula="${dmg2}"`);
    });

    return { results, log, skips };
  } catch(err) {
    return { fatal: `${err?.message ?? err}\n${err?.stack ?? ""}`, results, log, skips };
  } finally {
    Hooks.off("dnd5e.postRollConfiguration", hookId);
    try { const ids = made.map(e => e.id).filter(id => v.effects.get(id)); if ( ids.length ) await v.deleteEmbeddedDocuments("ActiveEffect", ids); } catch(err) { log.push(`cleanup effects: ${err?.message}`); }
    try { const ids = lent.map(i => i.id).filter(id => v.items.get(id)); if ( ids.length ) await v.deleteEmbeddedDocuments("Item", ids); } catch(err) { log.push(`cleanup lent items: ${err?.message}`); }
    try { if ( exhausted ) await clearExhaustion(); } catch(err) { log.push(`cleanup exhaustion: ${err?.message}`); }
    try {
      await v.update({ "system.skills.ath.value": prior.ath, "system.skills.his.value": prior.his, "system.abilities.cha.proficient": prior.chaSave });
      await sword.update({ "system.proficient": prior.swordProficient, "system.equipped": prior.swordEquipped });
    } catch(err) { log.push(`cleanup sheet: ${err?.message}`); }
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: TAG, out, plan, f });
