// @ts-check
/**
 * By the Books — DECISION layer (ARCHITECTURE.md §2): the rule tables, the kind lists and their readers.
 * No `game`, no settings, no imports; the tables are the only list (ARCHITECTURE.md §6). Every `rule` is
 * a pointer to the book (law 8; rule-text.js reads it).
 */

/** Maneuver fold kinds; an unknown kind is dropped. `command`: an ally's Reaction attack with the
 * fighter's die (Riposte's driven attack); `shove`: a push offer on a hit, no save (bash-offer.js). */
export const MANEUVER_KINDS = new Set(["precision", "riposte", "interpose", "bash", "hew", "command", "shove"]);

/** The `shove` kind's rows by feat: `on` "unarmed" or a damage type the hit deals; `reach` within 5 ft;
 * `larger` most sizes above the pusher (null: any); `used` the turn's once-mark flag; `rule` RULE_TEXT's key. */
export const SHOVES = Object.freeze({
  "Tavern Brawler": Object.freeze({ on: "unarmed", reach: true, larger: null, used: "shoveUsed", rule: "shove" }),
  "Crusher": Object.freeze({ on: "bludgeoning", reach: false, larger: 1, used: "crushUsed", rule: "crush" })
});

/** Interrupt kinds — what a held reaction changes. `roll` bends the attack roll itself (Disadvantage
 * after the hit shows; it can undo a natural 20, which `ac` never can): INTERRUPT_ROLLS. */
export const INTERRUPT_KINDS = new Set(["ac", "damage", "roll"]);

/** `damage` interrupts that MULTIPLY the triggering attack's damage for the reactor; any other damage
 * interrupt stays "reduce by hand". Keyed by the Interrupt list's names.
 *   uses        the item's own uses spent by a write at the cast (the activity consumes nothing)
 *   at          "attacker" — the cast is aimed at the attacker (a save activity's demand lands on it)
 *   failDamage  { type, equalTo: "taken" } — on the demanded save's FAILURE the attacker takes this type, equal to
 *               the damage the reactor took from the hit (saves/consequences.js)
 *   (a row whose activity consumes the feature's use carries no `uses` — Elemental Rebuke, Sentinel at Death's Door) */
export const INTERRUPT_MULTIPLIERS = Object.freeze({
  "Uncanny Dodge": Object.freeze({ multiplier: 0.5,
    rule: Object.freeze({ item: "Uncanny Dodge", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeUncannyDod" }) }),
  // The GM's side: the half is the module's; the teleport and the save at the destination are the sheet's.
  "Toxic Escape": Object.freeze({ multiplier: 0.5,
    caveat: "the teleport and the Constitution save at the destination are the sheet's — use Save after",
    rule: Object.freeze({ item: "Toxic Escape", uuid: "Compendium.dnd-monster-manual.features.Item.mmToxicEscape000" }) }),
  // B2: the warlock's Reaction after a hit (2024's text): the damage halved AND the pack's own save activity used at the
  // attacker (`at: "attacker"`); a failure deals the attacker Psychic damage equal to what the warlock took (`failDamage`,
  // read off the hit's receipt by the saves machine); the item's once per Long Rest is spent by a write (`uses` — the
  // activity consumes nothing). The Charmed immunity is the sheet's (the pack's level-up).
  "Beguiling Defenses": Object.freeze({ multiplier: 0.5, uses: true, at: "attacker",
    failDamage: Object.freeze({ type: "psychic", equalTo: "taken" }),
    rule: Object.freeze({ item: "Beguiling Defenses", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkBeguilingD" }) }),
  // C1 — Superior Hunter's Defense: Uncanny Dodge's half on ANY damage (`any`: damage-holds.js serves what is not an
  // attack's hit), and the pack's typed Resistance effect of the damage's type landed on the ranger until the end of the
  // current turn (`effects: "type"` — "Hunter's Defense: Fire" for fire; the `halt` window).
  "Superior Hunter's Defense": Object.freeze({ multiplier: 0.5, any: true, activity: "Resistances", effects: "type", effectPrefix: "Hunter's Defense: ", clock: "halt",
    rule: Object.freeze({ item: "Superior Hunter's Defense", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrSuperiorDe" }),
    from: "Ranger — Hunter 15" }),
  // ARCANA UNLEASHED (RULINGS *Arcana Unleashed*): the groundling's Uncanny Dodge — "while it is on the ground" is the table's.
  "Go to Ground": Object.freeze({ multiplier: 0.5,
    caveat: "only while the groundling is on the ground — the table's",
    rule: Object.freeze({ item: "Go to Ground", uuid: "Compendium.dnd-arcana-unleashed.actors.Item.aunGoToGround000" }),
    from: "Arcana Unleashed — monsters (groundlings)" }),
  // HEROES OF FAERÛN (RULINGS *Heroes of Faerûn*): Beguiling Defenses' row — the half, and the paladin's own Rebuke save used
  // at the attacker (its damage is the activity's own, half on a success). No `uses`: the Rebuke activity consumes the
  // feature's own use itself (Cha modifier per Long Rest) — a row spend on top would leave the cast nothing to pay with.
  "Elemental Rebuke": Object.freeze({ multiplier: 0.5, at: "attacker",
    caveat: "the damage type is the activity's first — pick another by hand",
    rule: Object.freeze({ item: "Elemental Rebuke", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofOngElementalR" }),
    from: "Paladin — Oath of the Noble Genies 15 (Heroes of Faerûn)" }),
  // RAVENLOFT (RULINGS *Ravenloft: The Horrors Within*) — Sentinel at Death's Door, the hit on YOU: Uncanny Dodge's half; the
  // activity consumes the feature's use itself (Wisdom modifier per Long Rest). The Bloodied ally within 60 ft and the
  // Critical Hit's effects cancelled WAIT (the register).
  "Sentinel at Death's Door": Object.freeze({ multiplier: 0.5,
    caveat: "a Bloodied ally's hit within 60 ft, and a Critical Hit's effects cancelled, are the table's for now",
    rule: Object.freeze({ item: "Sentinel at Death's Door", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwCSSentinelaOa" }),
    from: "Cleric — Grave Domain 6 (Ravenloft)" })
});

/**
 * `damage` interrupts that REDUCE BY A ROLL: the pack's heal activity's formula is the reduction, rolled
 * in the open at the answer. ⚠ The Monster Manual's "Parry" is +2 AC: a row applies only where the item
 * carries the named activity (an EMPTY stored name → the first heal activity, locale-proof).
 *   pool     the activity's consumption is spent; none left offers nothing
 *   any      every damage the module applies is held for it, not only an attack hit (damage-holds.js)
 *   ally     feet — protects ANOTHER creature in reach; every guard in reach is asked, the first wins
 *   holding  "shieldOrWeapon" — a Shield or a Simple or Martial weapon held
 *   ranged   the hit must be a RANGED attack (Deflect Missile); a melee hit never holds for it
 *   worn     the DMG — the reactor is a magic item the creature has equipped (and attuned to, where required); its
 *            activity's `roll` is the reduction when it carries no healing (Gloves of Missile Snaring)
 *   types    the hit's damage must include one of these (read off the attack's activity; unread counts), unless
 *            the defender holds the `anyType` feature (Deflect Energy)
 *   atZero   the feature's activity of that name is OFFERED on the damage card when the reduction took the
 *            damage to 0 — Deflect Attacks' Redirect, the pack's own save activity used at the attacker
 *   eyebrow / spend / hit / by   the card's and popup's words;  label  the name shown when the row is keyed by its
 *            item (Protective Field on Psionic Power);  verb  a guard's answer ("intercept" by default)
 *   pool "ward" + of  (B4, Projected Ward): the reduction is the guard's WARD (WARD_POOLS `of`, its uses the hit points) —
 *            as much of the damage as the ward holds, spent from it; `any` with `ally`: a guard asked on ANY damage to the
 *            creature beside it, not an attack's alone
 *   amount   RAVENLOFT — the reduction's own roll where the activity carries no healing and no roll (Deflect Blow's 1d10)
 */
export const INTERRUPT_REDUCTIONS = Object.freeze({
  "Parry": Object.freeze({ activity: "Heal", pool: true,
    eyebrow: "Maneuver", spend: "Superiority Die", hit: "melee attack", by: "the die plus your modifier",
    rule: Object.freeze({ item: "Parry", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvParry00000" }),
    from: "Fighter — Battle Master 3" }),
  "Stone's Endurance": Object.freeze({ activity: "Heal", pool: true,
    eyebrow: "Reaction", spend: "use", hit: "attack", by: "1d12 plus your Constitution modifier", any: true,
    rule: Object.freeze({ item: "Stone's Endurance", uuid: "Compendium.dnd-players-handbook.origins.Item.phbsptStonesEndu" }),
    from: "Goliath — Giant Ancestry (Stone)" }),
  "Interception": Object.freeze({ activity: "Intercept", pool: false,
    eyebrow: "Reaction", spend: "Reaction", hit: "attack", by: "1d10 plus your Proficiency Bonus", ally: 5, holding: "shieldOrWeapon",
    rule: Object.freeze({ item: "Interception", uuid: "Compendium.dnd-players-handbook.feats.Item.phbfstIntercepti" }),
    from: "Fighting Style feat" }),
  // B4 — Projected Ward: the wizard's Arcane Ward absorbs a creature's damage within 30 ft, a Reaction (the ward's own pool).
  "Projected Ward": Object.freeze({ activity: "Project Ward", pool: "ward", of: "Arcane Ward", any: true, ally: 30, verb: "absorb",
    eyebrow: "Reaction", spend: "Reaction", hit: "any damage, not only an attack", by: "your Arcane Ward's hit points",
    rule: Object.freeze({ item: "Projected Ward", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwzdProjectedW" }),
    from: "Wizard — Abjurer 6" }),
  // A1: rolled, as Parry's; before, "reduce by hand" (RULINGS *The PHB classes — A1*).
  "Deflect Attacks": Object.freeze({ activity: "Reduce", pool: false,
    eyebrow: "Reaction", spend: "Reaction", hit: "attack", by: "1d10 plus your Dexterity modifier and Monk level",
    types: Object.freeze(["bludgeoning", "piercing", "slashing"]), anyType: "Deflect Energy", atZero: "Redirect",
    rule: Object.freeze({ item: "Deflect Attacks", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkDeflectAtt" }),
    from: "Monk 3" }),
  // A2 — Protective Field (keyed by its item, as every row): yourself on any damage (Stone's Endurance's `any`),
  // another within 30 ft on an attack's (Interception's guard). The Soulknife's Psionic Power carries no such activity.
  "Psionic Power": Object.freeze({ activity: "Protective Field", label: "Protective Field", verb: "reduce", pool: true, any: true, ally: 30,
    eyebrow: "Reaction", spend: "Psionic Energy Die", hit: "attack", by: "a Psionic Energy Die plus your Intelligence modifier (at least 1)",
    rule: Object.freeze({ item: "Psionic Power", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrPsionicPow", benefit: "Protective Field" }),
    from: "Fighter — Psi Warrior 3" }),
  // The GM's side (Deflect Attacks' shape, ranged only): the redirect at 0 is the sheet's Save.
  "Deflect Missile": Object.freeze({ activity: "Reduce Damage", pool: true, ranged: true,
    eyebrow: "Reaction", spend: "use", hit: "ranged attack", by: "1d10",
    caveat: "\"Bludgeoning, Piercing, or Slashing\" is the table's; the redirect when the damage is reduced to 0 is the sheet's Save",
    rule: Object.freeze({ item: "Deflect Missile", uuid: "Compendium.dnd-monster-manual.features.Item.mmDeflectMissile" }),
    from: "monsters" }),
  // THE DMG: Deflect Missile's shape on a WORN item (`worn`): a ranged or thrown weapon's hit reduced by the pack's
  // own roll (1d10 + Dex, a utility activity's `roll`); "a free hand" and the catch at 0 are the table's.
  "Gloves of Missile Snaring": Object.freeze({ activity: "Snare Missile", pool: false, ranged: true, worn: true,
    eyebrow: "Reaction", spend: "Reaction", hit: "ranged attack", by: "1d10 plus your Dexterity modifier",
    caveat: "\"if you have a free hand\" and the catch at 0 are the table's",
    rule: Object.freeze({ item: "Gloves of Missile Snaring", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgGlovesOfMissi" }),
    from: "DMG wondrous item" }),
  // RAVENLOFT — Deflect Blow (Laurie Weathermay-Foxgrove): 1d10 off a hit on her or a creature within 5 ft; the pack's utility
  // carries no roll — the row's `amount` is the reduction.
  "Deflect Blow": Object.freeze({ activity: "Damage Reduction", amount: "1d10", ally: 5, eyebrow: "Reaction", spend: "Reaction", hit: "attack", by: "1d10",
    rule: Object.freeze({ item: "Deflect Blow", uuid: "Compendium.dnd-ravenloft-horrors-within.actors.Item.sBUI0I7rRklULU58" }),
    from: "Ravenloft — monsters (Laurie Weathermay-Foxgrove)" })
});

/**
 * The `roll` interrupts: Disadvantage on an attack already rolled — a second d20, the lower stands, the
 * verdict retaken against the live AC (decide/rescue-hit.js). They differ only in cost:
 *   reaction / uses   takes the Reaction / spends one of the item's uses;  point  what a use is called
 *   activity  the pack activity that IS this answer (a use from the sheet answers the hold)
 *   after     what the table still does once the roll is bent — a card line
 *   heal      B4 — a FEATURE whose heal activity lands on the flared creature with the answer (Improved Warding Flare's
 *             Temporary Hit Points), rolled on the answerer's numbers, receipted; absent from the sheet, nothing
 *   only "self" / abilities / spells   the roller's own save alone, narrowed (Arcana Unleashed; bystanders.js)
 *   die       a die ("1d4"), a roll-data path, a flat formula ("@prof" — Steel Yourself) or "hitDie" (the roller's
 *             largest Hit Die — Sustained Symbiosis); `bonus` a reroll's added number (Shared Resilience)
 * ⚠ The 2014 Halfling "Lucky" shares the name with no uses: the lookup demands the item's own uses.
 */
export const INTERRUPT_ROLLS = Object.freeze({
  "Lucky": Object.freeze({ reaction: false, uses: true, point: "Luck Point", activity: "Disadvantage",
    rule: Object.freeze({ item: "Lucky", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftLucky000000", benefit: "Disadvantage" }),
    from: "Origin feat" }),
  "Warding Flare": Object.freeze({ heal: "Improved Warding Flare", reaction: true, uses: true, point: null, activity: "Flare",
    rule: Object.freeze({ item: "Warding Flare", uuid: "Compendium.dnd-players-handbook.classes.Item.phbclcWardingFla" }),
    from: "Cleric — Light Domain 3" }),
  "Shadowy Dodge": Object.freeze({ reaction: true, uses: false, point: null, activity: "Shadowy Dodge",
    after: "teleport up to 30 feet if you wish (the table moves the token)",
    rule: Object.freeze({ item: "Shadowy Dodge", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrShadowyDod" }),
    from: "Ranger — Gloom Stalker" }),
  // `ally`: guards another creature in reach, the first to answer bends it; `holding` "shield"; `effect`
  // the pack's effect landed on the protected creature (EFFECT_BENDS "Protected (Protection)").
  "Protection": Object.freeze({ reaction: true, uses: false, point: null, activity: "Protect", ally: 5, holding: "shield", effect: "Protected",
    rule: Object.freeze({ item: "Protection", uuid: "Compendium.dnd-players-handbook.feats.Item.phbfstProtection" }),
    from: "Fighting Style feat" }),
  // THE BYSTANDERS (RULINGS *The full release — the order*, Q2 option A): another creature's roll, bent by
  // someone who is neither the roller nor its target. `bystander` the feet from the bystander to the ROLLER;
  // `tests` which D20 Tests; `bend` "die" (a signed `die` read off the BYSTANDER's roll data, or a flat
  // `bonus`) or "neutralise" (Advantage and Disadvantage gone, the first d20 standing — a rule of cool, Q3);
  // `damage` the die may come off the damage roll instead (the damage hold's ask, once the damage is known).
  // `on` which attack it bends: "hit" (a hostile's hit on the bystander's side, turned to a miss — the default),
  // "miss" (its own side's miss, turned to a hit), "both"; `self` the bystander's own roll too, with no Reaction
  // (`selfActivity` its pack activity); on a HIT the hit creature may answer for itself, and `only: "self"`
  // lets nobody else. `reach` "target": the feet are to the HIT creature (Glorious Defense), not the roller.
  // `bonus` may be a formula read off the answerer's roll data. `inspired`: the feature is the granting BARD's,
  // the die the bard's Bardic Inspiration, paid by deleting the answerer's own Inspired effect (Combat
  // Inspiration's Defense). `turned: "strike"`: a hit the bend turns to a miss offers the answerer one weapon
  // attack at the attacker (Riposte's driven attack). The pool is the activity's own consumption (`poolOf`).
  // Asked only when the bend can change the verdict. `damage`: the die may come off an attack's DAMAGE instead —
  // asked at the damage hold (damage-holds.js), once the damage and the hit creature's Hit Points are known
  // (RULINGS *The asks widened*); `verb` is that hold's word for the answer.
  "Cutting Words": Object.freeze({ reaction: true, uses: true, point: null, activity: "Cut with Words",
    bystander: 60, tests: Object.freeze(["attack", "check"]), bend: "die", sign: -1, die: "scale.bard.inspiration", damage: true, verb: "cut",
    rule: Object.freeze({ item: "Cutting Words", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdCuttingWor" }),
    from: "Bard — College of Lore 3" }),
  "Restore Balance": Object.freeze({ reaction: true, uses: true, point: null, activity: "Prevent Advantage/Disadvantage",
    bystander: 60, tests: Object.freeze(["attack", "save", "check"]), bend: "neutralise", on: "both",
    rule: Object.freeze({ item: "Restore Balance", uuid: "Compendium.dnd-players-handbook.classes.Item.phbscrRestoreBal" }),
    from: "Sorcerer — Clockwork Sorcery 3" }),
  "Guided Strike": Object.freeze({ reaction: true, uses: true, point: null, activity: "Guide Another Creature",
    self: true, selfActivity: "Guide Yourself",
    bystander: 30, tests: Object.freeze(["attack"]), bend: "die", sign: 1, bonus: 10, on: "miss",
    rule: Object.freeze({ item: "Guided Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbclcGuidedStri" }),
    from: "Cleric — War Domain 3" }),
  // A1: the AC bonus as the attack roll's minus against this target alone — the same arithmetic.
  "Glorious Defense": Object.freeze({ reaction: true, uses: true, point: null, activity: "Glorious Defense",
    reach: "target", bystander: 10, tests: Object.freeze(["attack"]), bend: "die", sign: -1,
    bonus: "max(1, @abilities.cha.mod)", on: "hit", turned: "strike",
    rule: Object.freeze({ item: "Glorious Defense", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnGloriousDe" }),
    from: "Paladin — Oath of Glory 15" }),
  // `bystander` 5: the hit creature itself stands at 0 feet (`only: "self"`).
  "Combat Inspiration": Object.freeze({ reaction: true, uses: false, point: null, activity: null, inspired: true,
    only: "self", reach: "target", bystander: 5, tests: Object.freeze(["attack"]), bend: "die", sign: -1, on: "hit",
    rule: Object.freeze({ item: "Combat Inspiration", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdCombatInsp", benefit: "Defense" }),
    from: "Bard — College of Valor 3" }),
  // A7: a STORED face replaces the d20 (`bend: "set"`, `stored` the STORED_DICE row that keeps the faces); `bystander:
  // "sight"` — the scene is the reach, sight is never judged (Q6); no Reaction, no pool. Asked on every roll a face in
  // hand turns the verdict of — a foe's hit or success to a miss or a failure, a friend's miss or failure to a hit or a
  // success — with the two mutes as the brake (RULINGS *The asks widened*; before it `ask: "crit"` kept an attack to
  // its critical hits). A CHECK only when its roll carries a DC (dnd5e's `options.target`: an enricher's or a request's);
  // a bare check asks nobody (RULINGS *Portent widened*).
  "Portent": Object.freeze({ reaction: false, uses: false, point: null, activity: null, stored: "Portent",
    bystander: "sight", tests: Object.freeze(["attack", "save", "check"]), bend: "set", on: "both",
    rule: Object.freeze({ item: "Portent", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwzdPortent000" }),
    from: "Wizard — Diviner 3" }),
  // B1: the bard's Reaction REROLLS a friend's failed save (the bard's own included) `against` an effect that applies one
  // of the listed conditions — read off the demand card, so a sheet save with no demand is never offered; the new roll
  // has Advantage (`advantage`) and stands. `bend: "reroll"` bends a FRIEND's roll only. The pack's activity is UNNAMED:
  // `activity: null` reads the item's first (bystanders.js).
  "Countercharm": Object.freeze({ reaction: true, uses: false, point: null, activity: null,
    bystander: 30, tests: Object.freeze(["save"]), bend: "reroll", advantage: true, against: Object.freeze(["charmed", "frightened"]),
    rule: Object.freeze({ item: "Countercharm", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdCountercha" }),
    from: "Bard 7" }),
  // B2: the ranger's Reaction on a SUCCEEDED demanded save `against` Charmed or Frightened — anyone's, any side, within
  // 120 ft (`bend: "twist"`): the roll is not bent; the pack's Save activity is used at the creature the ranger has
  // TARGETED (never the roller — "a different creature"; sight is not judged, Q6). SAVE_PRESSES "Beguiling Twist" lands
  // the failure's condition by the ranger's word.
  "Beguiling Twist": Object.freeze({ reaction: true, uses: false, point: null, activity: "Save",
    bystander: 120, tests: Object.freeze(["save"]), bend: "twist", against: Object.freeze(["charmed", "frightened"]),
    rule: Object.freeze({ item: "Beguiling Twist", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrBeguilingT" }),
    from: "Ranger — Fey Wanderer 7" }),
  // The GM's side (Shadowy Dodge's row): the pack lands no effect for the Advantage after — the table's.
  "Limited Foresight": Object.freeze({ reaction: true, uses: true, point: null, activity: "Expend Use",
    after: "you have Advantage on attack rolls against it until the end of your next turn (the table's)",
    rule: Object.freeze({ item: "Limited Foresight", uuid: "Compendium.dnd-monster-manual.features.Item.mmLimitedForesig" }),
    from: "monsters (the cyclops)" }),
  // B4 — Bend Luck: ±1d4 on another creature's attack, save or check within 60 ft, a Sorcery Point (Font of Magic, `poolOf`).
  // `sign: "either"` FOLLOWS THE SIDE (decide/rescue-hit.js signFor): a friend's roll +, a foe's − — R1, the one sensible
  // answer; `on: "both"`: a foe's hit and a friend's miss. The die is a plain formula (`die: "1d4"`, lookup.js bystanderDie).
  "Bend Luck": Object.freeze({ reaction: true, uses: true, point: "Sorcery Point", activity: "Bend Luck",
    bystander: 60, tests: Object.freeze(["attack", "save", "check"]), bend: "die", sign: "either", die: "1d4", on: "both",
    rule: Object.freeze({ item: "Bend Luck", uuid: "Compendium.dnd-players-handbook.classes.Item.phbscrBendLuck00" }),
    from: "Sorcerer — Wild Magic Sorcery 6" }),
  // B4 — Cosmic Omen: the Long Rest's d6 kept on a STORED_DICE chip (never spent); `sign: "omen"` reads its parity — even
  // Weal +1d6 (a friend's roll), odd Woe −1d6 (a foe's); `omen` names the pack's activity for each, the item's uses the pool.
  // "About to make a D20 Test" is bent after the roll (the platform register, Restore Balance's road).
  "Cosmic Omen": Object.freeze({ reaction: true, uses: true, point: null, activity: null, stored: "Cosmic Omen",
    omen: Object.freeze({ even: "Weal (Even)", odd: "Woe (Odd)" }),
    bystander: 30, tests: Object.freeze(["attack", "save", "check"]), bend: "die", sign: "omen", die: "1d6", on: "both",
    rule: Object.freeze({ item: "Cosmic Omen", uuid: "Compendium.dnd-players-handbook.classes.Item.phbdrdCosmicOmen" }),
    from: "Druid — Circle of the Stars 6" }),
  // ARCANA UNLEASHED (RULINGS *Arcana Unleashed*) — the save bystanders on a FAILED save, Guided Strike's die added
  // (`on: "miss"`: a friend's failure). Arcane Omens' Helpful Premonition: 1d4 to a friend's or its own save within 30 ft
  // (the roller counts as its own bystander on a save). `only: "self"` on a save (bystanders.js): the ROLLER's own row alone —
  // Transmuted Anatomy's Resilient Anatomy on a Constitution save (`abilities`), Spell Resistant's Magic Resistant against a
  // spell or magical effect (`spells`: the demand's spell mark; a bare sheet save is not asked).
  "Arcane Omens": Object.freeze({ reaction: true, uses: true, point: null, activity: "Helpful Premonition", self: true,
    bystander: 30, tests: Object.freeze(["save"]), bend: "die", sign: 1, die: "1d4", on: "miss",
    rule: Object.freeze({ item: "Arcane Omens", uuid: "Compendium.dnd-arcana-unleashed.feats.Item.aunArcaneOmensJK", benefit: "Helpful Premonition" }),
    from: "Arcana Unleashed — origin feat" }),
  "Transmuted Anatomy": Object.freeze({ reaction: true, uses: true, point: null, activity: null, only: "self", self: true,
    bystander: 5, tests: Object.freeze(["save"]), bend: "die", sign: 1, die: "1d4", on: "miss", abilities: Object.freeze(["con"]),
    rule: Object.freeze({ item: "Transmuted Anatomy", uuid: "Compendium.dnd-arcana-unleashed.feats.Item.aunTransmutedAqb", benefit: "Resilient Anatomy" }),
    from: "Arcana Unleashed — origin feat" }),
  "Spell Resistant": Object.freeze({ reaction: false, uses: true, point: null, activity: "Magic Resistant", only: "self", self: true,
    bystander: 5, tests: Object.freeze(["save"]), bend: "die", sign: 1, die: "1d6", on: "miss", spells: true,
    rule: Object.freeze({ item: "Spell Resistant", uuid: "Compendium.dnd-arcana-unleashed.feats.Item.aunSpellResistan", benefit: "Magic Resistant" }),
    from: "Arcana Unleashed — general feat" }),
  // HEROES OF FAERÛN (RULINGS *Heroes of Faerûn*) — Shared Resilience: Countercharm's reroll on a FRIEND's failed save within
  // 60 ft, plus a `bonus` read off the answerer (the fighter's level), paid from Indomitable's uses (the activity's consumption).
  "Shared Resilience": Object.freeze({ reaction: true, uses: true, point: null, activity: null,
    bystander: 60, tests: Object.freeze(["save"]), bend: "reroll", bonus: "@classes.fighter.levels",
    rule: Object.freeze({ item: "Shared Resilience", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofPdkSharedResi" }),
    from: "Fighter — Banneret 15 (Heroes of Faerûn)" }),
  // RAVENLOFT (RULINGS *Ravenloft: The Horrors Within*) — the roller's OWN failed save or check lifted (Transmuted Anatomy's
  // `only: "self"`): Steel Yourself adds the Proficiency Bonus (a flat `die`) to a failed save against Charmed or Frightened,
  // the Reaction (the pack's activity names a consumption of its own uses but carries none to count — once per Long Rest is
  // the table's); Sustained Symbiosis a Hit Die (`die: "hitDie"` — the largest;
  // the Hit Die itself is spent by hand, the feat's use by the machine); Knowledge from a Past Life 1d6 on a failed ability
  // CHECK, a use of the trait. ⚠ "Survivor (Ravenloft)": the feat shares its name with the Fighter's Survivor — ALIASES points
  // the key at the identifier, FEATURE_TYPES keeps it to the feat.
  "Survivor (Ravenloft)": Object.freeze({ reaction: true, uses: false, point: null, activity: "Steel Yourself", only: "self", self: true,
    bystander: 5, tests: Object.freeze(["save"]), bend: "die", sign: 1, die: "@prof", on: "miss", against: Object.freeze(["charmed", "frightened"]),
    caveat: "once per Long Rest is the table's — the pack's activity carries no use to count",
    rule: Object.freeze({ item: "Survivor", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwSurvivor2zrM3", benefit: "Steel Yourself" }),
    from: "Origin feat (Ravenloft)" }),
  "Symbiotic Being": Object.freeze({ reaction: true, uses: true, point: null, activity: "Sustained Symbiosis (Largest HD)", only: "self", self: true,
    bystander: 5, tests: Object.freeze(["save"]), bend: "die", sign: 1, die: "hitDie", on: "miss",
    caveat: "the Hit Die is spent by hand",
    rule: Object.freeze({ item: "Symbiotic Being", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwSymbioticBein", benefit: "Sustained Symbiosis" }),
    from: "Dark Gift (Ravenloft)" }),
  "Knowledge from a Past Life": Object.freeze({ reaction: false, uses: true, point: null, activity: "Past Aids Present", only: "self", self: true,
    bystander: 5, tests: Object.freeze(["check"]), bend: "die", sign: 1, die: "1d6", on: "miss",
    rule: Object.freeze({ item: "Knowledge from a Past Life", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwKnowledgefraL", benefit: "Past Aids Present" }),
    from: "Reborn (Ravenloft)" })
});

/**
 * d20 FOLD kinds — each names a SPEND, never a contribution shape (ARCHITECTURE.md §6):
 *   heroic     `system.attributes.inspiration`, a bare boolean — spent by a WRITE
 *   tactical   an item's uses through a real activity — `use()`
 *   bardic     the "Inspired" effect — spent by a DELETE; its die resolves on the granting bard (`origin`)
 *   advantage  a second d20, the higher stands, paid with an item use — an initiative rolled with no dialog
 *   succeed    a failed save turned into a success through the feature's activity (SAVE_SUCCEEDS)
 *   reroll     a FAILED save rerolled with a bonus added, the new roll standing, paid by the row's cost (REROLLS) — the
 *              PHB classes' B1: a spend `heroic` cannot say (a use, a Rage's once) and a contribution no row can (replace + add)
 */
export const D20_FOLD_KINDS = new Set(["heroic", "tactical", "bardic", "seeking", "advantage", "succeed", "reroll"]);

/** The closed set of volley kinds — the one definition the registry and tools/check-registry.mjs share. */
export const VOLLEY_KINDS = new Set(["damage", "attack"]);

/** The weapon masteries this module resolves; `nick` is action economy, left native (MASTERY_NATIVE). */
export const MASTERY_KINDS = new Set(["vex", "sap", "cleave", "slow", "topple", "push", "graze"]);

/** Masteries the system has and this module deliberately leaves alone. See MASTERY_KINDS. */
export const MASTERY_NATIVE = new Set(["nick"]);

/** Each mastery popup's rule: a pointer to the mastery's page in dnd5e's rules (rule-text.js reads it). */
export const MASTERY_RULES = Object.freeze({
  slow: Object.freeze({ page: "mastery", key: "slow" }),
  topple: Object.freeze({ page: "mastery", key: "topple" }),
  push: Object.freeze({ page: "mastery", key: "push" }),
  graze: Object.freeze({ page: "mastery", key: "graze" }),
  vex: Object.freeze({ page: "mastery", key: "vex" }),
  sap: Object.freeze({ page: "mastery", key: "sap" }),
  cleave: Object.freeze({ page: "mastery", key: "cleave" })
});

/** The maneuver folds' popup rules by kind, as pointers to the book. */
export const RULE_TEXT = {
  // ⚠ Precision's quote lives only in `RESCUE_KINDS` (decide/present.js): a second copy would drift.
  riposte: Object.freeze({ item: "Riposte", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvRiposte000" }),
  bash: Object.freeze({ item: "Shield Master", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftShieldMaste", benefit: "Shield Bash" }),
  shove: Object.freeze({ item: "Tavern Brawler", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftTavernBrawl", benefit: "Push" }),
  crush: Object.freeze({ item: "Crusher", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftCrusher0000", benefit: "Push" }),
  bashChoice: Object.freeze({ item: "Shield Master", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftShieldMaste", benefit: "Shield Bash" }),
  interpose: Object.freeze({ item: "Shield Master", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftShieldMaste", benefit: "Interpose Shield" }),
  hew: Object.freeze({ item: "Great Weapon Master", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftGreatWeapon", benefit: "Hew" }),
  command: Object.freeze({ item: "Commander's Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvCommanders" })
};

/**
 * Feats granting one more attack as a Bonus Action, REMINDED by the `hew` fold's popup (hew.js). A `hew`
 * list entry with no row takes Great Weapon Master's shape.
 *   when     "critOrKill" (a crit or a kill with a melee weapon) | "attack" (a qualifying weapon's attack
 *            on the owner's turn, once per turn)
 *   weapons  a base item in `base`, or every property in `properties`; absent: any weapon (an Unarmed Strike too)
 *   ranged   a ranged attack earns it too (the default is melee only)
 *   uses     the feat's own uses: none left, no reminder; the reminder says how many stand
 *   option   the feature's kept option (CLOCK_RIDERS `option`, asked on the damage offer) must be this one
 *   near     feet — another creature must stand this close to the attack's target (Horde Breaker's second target)
 *   drive    the reminder is an OFFER: Use drives the weapon's attack at the same creature, a d4 Bludgeoning
 */
export const BONUS_SWINGS = Object.freeze({
  "Great Weapon Master": Object.freeze({ when: "critOrKill", label: "Hew", rule: RULE_TEXT.hew }),
  "Polearm Master": Object.freeze({ when: "attack", label: "Pole Strike",
    weapons: Object.freeze({ base: Object.freeze(["quarterstaff", "spear"]), properties: Object.freeze(["hvy", "rch"]) }),
    drive: true,
    swing: "A Bonus Action: the other end of the weapon, a d4 of Bludgeoning — <strong>Pole Strike</strong> makes the attack for you.",
    rule: Object.freeze({ item: "Polearm Master", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftPolearmMast", benefit: "Pole Strike" }),
    from: "General feat" }),
  // A reminder, never driven: the pack's "Expend Use" spends the use from the sheet.
  "War Priest": Object.freeze({ when: "attack", label: "War Priest", ranged: true, uses: true,
    swing: "A Bonus Action: one attack with a weapon or an Unarmed Strike — use <strong>War Priest</strong> from the sheet (it spends the use), then swing.",
    rule: Object.freeze({ item: "War Priest", uuid: "Compendium.dnd-players-handbook.classes.Item.phbclcWarPriest0" }),
    from: "Cleric — War Domain 3" }),
  // B4 — War Magic: a reminder alone — one of the Attack action's attacks may be a cantrip (cast from the sheet).
  "War Magic": Object.freeze({ when: "attack", label: "War Magic", ranged: true,
    swing: "One of this Attack action's attacks may be a <strong>cantrip</strong> instead — cast it from the sheet.",
    rule: Object.freeze({ item: "War Magic", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrWarMagic00" }),
    from: "Fighter — Eldritch Knight 7" }),
  // D1 — Improved War Magic: War Magic's reminder, two attacks replaced by a level 1 or 2 Wizard spell. Listed BEFORE War
  // Magic in MANEUVER_FOLDS: the first row the sheet answers is the one reminded, so a fighter of 18 hears this one alone.
  "Improved War Magic": Object.freeze({ when: "attack", label: "Improved War Magic", ranged: true,
    swing: "Two of this Attack action's attacks may be replaced by one <strong>level 1 or 2 Wizard spell</strong> with a casting time of an action — cast it from the sheet.",
    rule: Object.freeze({ item: "Improved War Magic", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrImprovedWa" }),
    from: "Fighter — Eldritch Knight 18" }),
  // Not a Bonus Action: the extra attack is the option's own, once per turn, from the sheet.
  "Hunter's Prey": Object.freeze({ when: "attack", label: "Horde Breaker", ranged: true, option: "Horde Breaker", near: 5,
    swing: "One more attack with the same weapon at a different creature within 5 feet of the original target, one you haven't attacked this turn — make it from the sheet.",
    rule: Object.freeze({ item: "Hunter's Prey", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrHuntersPre", benefit: "Horde Breaker" }),
    from: "Ranger — Hunter 3" }),
  // C1 — Battle Magic: a reminder alone after the bard casts a spell as an action (`when: "cast"` — the usage card of an
  // action-cast spell); the Bonus Action weapon attack is swung from the sheet.
  "Battle Magic": Object.freeze({ when: "cast", label: "Battle Magic", ranged: true,
    swing: "A Bonus Action: one attack with a weapon — swing it from the sheet.",
    rule: Object.freeze({ item: "Battle Magic", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdBattleMagi" }),
    from: "Bard — College of Valor 14" })
});

/**
 * REMINDER kinds — the sources of Advantage/Disadvantage the gate reads before an attack roll. The gate
 * never SETS a mode (DESIGN R-A): it lists every source and the net, and a human presses.
 *   vex / sap  the Vexed chip on the target / the Sapped chip on the attacker
 *   prone      attacker prone → Disadvantage; target prone → Advantage within 5 ft, else Disadvantage
 *   condition  CONDITION_BENDS · effect  EFFECT_BENDS · range  RANGE_RULES (beyond long: listed, not counted)
 *   sneak / buy  a TICK beside the roll — Sneak Attack's choice / ADVANTAGE_BUYS
 */
export const REMINDER_KINDS = new Set(["vex", "sap", "prone", "condition", "range", "effect", "sneak", "buy"]);

/**
 * Advantage on your own D20 Test bought before the roll with an item use: a tick box in the system's
 * roll dialog (advantage-buys.js), spent when the roll goes out ticked. An initiative with no dialog is
 * offered it after the roll — the `advantage` d20 fold (RULINGS *Where the table bends the rule*).
 *   tests  the D20 Tests the rule reaches;  point  what one use is called
 *   forgo  true — the MIRROR (B3, Brutal Strike): the tick FORGOES the roll's Advantage (every Advantage source struck,
 *          the net Normal) and records `forgo` on the attack's reminder; nothing is spent; `ability` narrows the attack's
 *          ability ("str"); off when the attack has Disadvantage or no Advantage to forgo
 *   skills "proficient" — a check with a skill the roller is proficient in, no other check (Helpful Friend); a tool, a
 *          raw ability check or an unproficient skill shows no box
 *   near   { companion, feet } — the roller's standing COMPANIONS creature of that spell must stand within `feet`
 *          (Helpful Friend's familiar within 5 ft): none standing, no box; in its pocket, on another scene or further
 *          away, the box greyed with the reason (RULINGS *Summons*, call 47)
 * ⚠ The 2014 Halfling "Lucky" shares the name with no uses — the lookup demands them.
 */
export const ADVANTAGE_BUYS = Object.freeze({
  "Brutal Strike": Object.freeze({ forgo: true, tests: Object.freeze(["attack"]), ability: "str", uses: false, point: null, activity: null,
    rule: Object.freeze({ item: "Brutal Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbBrutalStri" }),
    from: "Barbarian 9" }),
  "Lucky": Object.freeze({ uses: true, point: "Luck Point", activity: "Advantage",
    tests: Object.freeze(["attack", "save", "check", "initiative"]),
    rule: Object.freeze({ item: "Lucky", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftLucky000000", benefit: "Advantage" }),
    from: "Origin feat" }),
  // Regained by a Sorcerer slot cast while spent — the surge rolls at once (CAST_RIDERS "Wild Magic Surge", A7).
  "Tides of Chaos": Object.freeze({ uses: true, point: "use", activity: "Expend for Advantage",
    tests: Object.freeze(["attack", "save", "check", "initiative"]),
    rule: Object.freeze({ item: "Tides of Chaos", uuid: "Compendium.dnd-players-handbook.classes.Item.phbscrTidesOfCha" }),
    from: "Sorcerer — Wild Magic Sorcery 3" }),
  // C1 — Versatile Trickster: a FREE tick (`free`, nothing spent) offered on the next attack of the turn a Trip or Withdraw
  // Cunning Strike was used (`when: "cunning-strike"` — the sneak record on this turn's attack cards); whether the Mage Hand
  // stands within 5 feet of the target is the table's, so the box is offered and the tick is the player's.
  "Versatile Trickster": Object.freeze({ free: true, when: "cunning-strike", uses: false, point: null, activity: null,
    tests: Object.freeze(["attack"]), says: "the Mage Hand within 5 feet of the target — the table's",
    rule: Object.freeze({ item: "Versatile Trickster", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeVersatileT" }),
    from: "Rogue — Arcane Trickster 13" }),
  // Helpful Friend: "When you make an ability check using a skill in which you have proficiency while your familiar is
  // within 5 feet of you, you gain Advantage on the check" — the feat's uses (@prof per Long Rest) are the pool.
  "Familiar Friend": Object.freeze({ uses: true, point: "use", activity: "Helpful Friend",
    tests: Object.freeze(["check"]), skills: "proficient", near: Object.freeze({ companion: "Find Familiar", feet: 5 }),
    rule: Object.freeze({ item: "Familiar Friend", uuid: "Compendium.dnd-arcana-unleashed.feats.Item.aunFamiliarFri4q", benefit: "Helpful Friend" }),
    from: "Origin feat (Arcana Unleashed)" })
});

/**
 * A feature turning a FAILED save into a success once per rest — the `succeed` d20 fold (d20-folds.js):
 * offered on a demanded save before its verdict, and on a sheet save as an offer the roller judges.
 *   activity  the feature's activity that pays (null: nothing paid — Unerring Strike);  label  the benefit's name;
 *   abilities  the saves reached
 *   tests     D1 — the D20 Tests reached (default ["save"]); an attack fold is offered on a clean miss, a natural 1 included
 *   twenty    D1 — the failed d20 TURNS INTO A 20 (Stroke of Luck): the roll re-judged with a 20 on the die, never a verdict
 *             forced — a high DC can still beat it; on an attack it is NOT a Critical Hit (RULINGS *The PHB classes — D1*)
 *   hit       D1 — a missed attack HITS instead (Unerring Strike), a forced verdict, no Critical Hit
 *   feature   the item that carries the row when the key is a benefit's name;  weapon  a weapon attack only
 *   whileEffect  the row stands while the roller wears this effect (Living Legend's 10 minutes);  oncePerTurn  a turn chit
 *   worn      the DMG — the item must be equipped (and attuned, where required);  against  { schools, creatureTypes } — the
 *             demanded save's spell school or its caster's type (Scarab of Protection); no demand, offered
 * ⚠ Legendary Resistance is NOT a row: dnd5e ships it NATIVE (the NPC's `resistSave`, its button on the failed
 * save's message, the `legres` resource spent by the system), and the saves machine already honours the flip
 * (saves/verdict.js `forced`; smoke-saves §6). A row would be a second entry path (RULINGS *The GM's side — the five shapes*).
 */
export const SAVE_SUCCEEDS = Object.freeze({
  "Mage Slayer": Object.freeze({ activity: "Guard Mind", label: "Guarded Mind",
    abilities: Object.freeze(["int", "wis", "cha"]),
    rule: Object.freeze({ item: "Mage Slayer", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftMageSlayer0", benefit: "Guarded Mind" }),
    from: "General feat" }),
  // D1 — Stroke of Luck: any failed D20 Test turned into a 20, once per Short or Long Rest (the pack's own activity pays).
  "Stroke of Luck": Object.freeze({ activity: "Stroke of Luck", label: "Stroke of Luck", twenty: true,
    tests: Object.freeze(["attack", "save", "check"]),
    rule: Object.freeze({ item: "Stroke of Luck", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeStrokeOfLu" }),
    from: "Rogue 20" }),
  // D1 — Living Legend's Unerring Strike: once on each of your turns, a missed WEAPON attack hits instead, while the legend
  // stands (its "Living Legend: Charismatic" effect, the pack's 10 minutes). Nothing paid; the save half is REROLLS'.
  "Unerring Strike": Object.freeze({ feature: "Living Legend", activity: null, label: "Unerring Strike", hit: true, weapon: true,
    tests: Object.freeze(["attack"]), whileEffect: "Living Legend: Charismatic", oncePerTurn: true,
    rule: Object.freeze({ item: "Living Legend", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnLivingLege", benefit: "Unerring Strike" }),
    from: "Paladin — Oath of Glory 20" }),
  // THE DMG: the worn items' charges (`worn` — equipped and attuned). Ring of Evasion: a failed Dexterity save, a charge.
  "Ring of Evasion": Object.freeze({ activity: "Succeed", label: "Ring of Evasion", abilities: Object.freeze(["dex"]), worn: true,
    rule: Object.freeze({ item: "Ring of Evasion", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgRingOfEvasion" }),
    from: "DMG ring" }),
  // Scarab of Protection's Preservation: a failed save against a Necromancy spell or an Undead's effect (`against`, read off
  // the demand; a save from the sheet with no demand is offered, the roller judging); the crumbling at the last charge is the table's.
  "Scarab of Protection": Object.freeze({ activity: "Preserve", label: "Preservation", worn: true,
    against: Object.freeze({ schools: Object.freeze(["nec"]), creatureTypes: Object.freeze(["undead"]) }),
    rule: Object.freeze({ item: "Scarab of Protection", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgScarabOfProte", benefit: "Preservation" }),
    from: "DMG wondrous item" })
});

/**
 * A FAILED save REROLLED with a bonus added, the new roll standing — the `reroll` d20 fold (d20-folds.js; the PHB
 * classes, B1). Offered where Guarded Mind is: on a demanded save before its verdict (the withhold) and on a sheet
 * save as an offer the roller judges. The reroll REPLACES the d20 (its own crit and fumble) and the bonus folds as
 * `add` in the same entry (decide/verdict.js). Another creature's save rerolled is the bystander's row
 * (INTERRUPT_ROLLS "Countercharm", `bend: "reroll"`), not a fold.
 *   tests      the D20 Tests reached
 *   bonus      a formula on the ROLLER's roll data; the pack's own activity roll ("Bonus") is read first where it
 *              carries one. Unreadable → the fold stays off (BARDIC's shape: never a guessed number)
 *   uses       the item's own uses pay (Indomitable's scale)
 *   while      "raging" — only while the Rage effect stands;  once  "rage" — once per Rage, the mark on the Rage
 *              effect itself (`rerollUsed`), gone with it
 *   advantage  the reroll has Advantage
 *   whileEffect  D1 — the row stands while the roller wears this effect (Living Legend's 10 minutes);  reaction  the cost is
 *              the roller's Reaction (said on the offer; the table tracks it)
 *   wields     THE DMG — the carrier is a magic item "on your person" (lookup.js `wieldedNamed`: the template's enchantment on a
 *              weapon, attuned); its `activity`'s own uses pay;  notIncapacitated  not while the roller is Incapacitated
 */
export const REROLLS = Object.freeze({
  "Indomitable": Object.freeze({ tests: Object.freeze(["save"]), bonus: "@classes.fighter.levels", uses: true,
    rule: Object.freeze({ item: "Indomitable", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrIndomitabl" }),
    from: "Fighter 9" }),
  "Fanatical Focus": Object.freeze({ tests: Object.freeze(["save"]), bonus: "@scale.barbarian.rage-damage", while: "raging", once: "rage",
    rule: Object.freeze({ item: "Fanatical Focus", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbFanaticalF" }),
    from: "Barbarian — Path of the Zealot 6" }),
  // C1 — Disciplined Survivor: a failed save rerolled for 1 Focus Point — the pool the feature's own activity consumes
  // (`activity`, Monk's Focus by uuid), no bonus; the saving-throw proficiencies are the pack's transferred effect.
  "Disciplined Survivor": Object.freeze({ tests: Object.freeze(["save"]), bonus: null, activity: "Consume Focus Point", point: "Focus Point",
    rule: Object.freeze({ item: "Disciplined Survivor", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkDiscipline" }),
    from: "Monk 14" }),
  // D1 — Living Legend's Saving Throw Reroll: a failed save rerolled as a Reaction while the legend stands, the new roll used.
  "Living Legend": Object.freeze({ tests: Object.freeze(["save"]), bonus: null, whileEffect: "Living Legend: Charismatic", reaction: true,
    rule: Object.freeze({ item: "Living Legend", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnLivingLege", benefit: "Saving Throw Reroll" }),
    from: "Paladin — Oath of Glory 20" }),
  // THE DMG — Luck: one failed D20 Test rerolled, the second roll used, once per dawn (the Luck activity's own use).
  "Luck Blade": Object.freeze({ tests: Object.freeze(["attack", "save", "check"]), bonus: null, wields: true, activity: "Luck", notIncapacitated: true,
    rule: Object.freeze({ item: "Luck Blade", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgLuckBlade0000", benefit: "Luck" }),
    from: "DMG weapon" }),
  // ARCANA UNLEASHED — Keyholes Dagger's Reroll Miss (Luck Blade's shape on a missed attack): the dagger's own activity, its uses.
  "Keyholes Dagger": Object.freeze({ tests: Object.freeze(["attack"]), bonus: null, wields: true, activity: "Reroll Miss",
    rule: Object.freeze({ item: "Keyholes Dagger", uuid: "Compendium.dnd-arcana-unleashed.items.Item.aunKeyholesDagoQ", benefit: "Reroll Miss" }),
    from: "Arcana Unleashed — weapon" })
});

/**
 * Sneak Attack, by name on the attacker's sheet; its dice read off its own damage activity (scaled, never a
 * level table). A checkbox beside the roll, pre-ticked when what the module can read holds; the dice ride
 * the damage roll (the hit-riders seam), crit-doubled, once per turn as a turn chip.
 */
export const SNEAK_ATTACK = Object.freeze({
  feature: "Sneak Attack",
  improved: "Improved Cunning Strike",     // up to TWO Cunning Strike effects
  rule: Object.freeze({ item: "Sneak Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeSneakAttac" }),
});

/**
 * Cunning Strike options read off the sheet: the granting FEATURE, the pack's save ACTIVITY (landed through
 * the saves machine) and the die cost. No activity → a card line (movement and stealth are the table's).
 * ⚠ Envenom Weapons' activity carries the damage (the data's 2d8 over the text's 2d6, N1) and no condition,
 * so a failure ALSO presses Poisoned (`upgrade.onFail`). Rend Mind: Psychic Blades only (`weapon`).
 */
export const CUNNING_OPTIONS = Object.freeze({
  poison: Object.freeze({ feature: "Cunning Strike", activity: "Poison", cost: 1,
    caveat: "you must have a Poisoner’s Kit on your person",
    rule: Object.freeze({ item: "Cunning Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeCunningStr", benefit: "Poison" }),
    upgrade: Object.freeze({ feature: "Envenom Weapons", activity: "Poison", onFail: "poisoned", effectFrom: "Cunning Strike",
      rule: Object.freeze({ item: "Envenom Weapons", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeEnvenomWea" }) }) }),
  trip: Object.freeze({ feature: "Cunning Strike", activity: "Trip", cost: 1,
    rule: Object.freeze({ item: "Cunning Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeCunningStr", benefit: "Trip" }) }),
  withdraw: Object.freeze({ feature: "Cunning Strike", activity: null, cost: 1,
    rule: Object.freeze({ item: "Cunning Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeCunningStr", benefit: "Withdraw" }) }),
  daze: Object.freeze({ feature: "Devious Strikes", activity: "Daze", cost: 2,
    rule: Object.freeze({ item: "Devious Strikes", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeDeviousStr", benefit: "Daze" }) }),
  knockOut: Object.freeze({ feature: "Devious Strikes", activity: "Knock Out", cost: 6,
    rule: Object.freeze({ item: "Devious Strikes", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeDeviousStr", benefit: "Knock Out" }) }),
  obscure: Object.freeze({ feature: "Devious Strikes", activity: "Obscure", cost: 3,
    rule: Object.freeze({ item: "Devious Strikes", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeDeviousStr", benefit: "Obscure" }) }),
  stealthAttack: Object.freeze({ feature: "Supreme Sneak", activity: null, cost: 1,
    rule: Object.freeze({ item: "Supreme Sneak", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeSupremeSne", benefit: "Stealth Attack" }) }),
  rendMind: Object.freeze({ feature: "Rend Mind", activity: Object.freeze(["Rend Mind (Free)", "Rend Mind"]), cost: 0, weapon: "Psychic Blade",
    rule: Object.freeze({ item: "Rend Mind", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeRendMind00" }) }),
  // HEROES OF FAERÛN — Strike Fear's Terrify: a Cunning Strike option from a subclass; its save lands the pack's Frightened, and
  // the Advantage while Frightened is EFFECT_BENDS' "Strike Fear: Terrify"; the repeat REPEAT_SAVES'.
  terrify: Object.freeze({ feature: "Strike Fear", activity: "Terrify", cost: 1,
    rule: Object.freeze({ item: "Strike Fear", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofSotStrikeFear", benefit: "Terrify" }) })
});

/** Death Strike: a clock rider on the Sneak Attack — the pack's activity is the save; a failure lands the
 * attack's damage a second time through the applier. */
export const DEATH_STRIKE = Object.freeze({
  feature: "Death Strike", activity: "Death Strike", when: "firstRound",
  rule: Object.freeze({ item: "Death Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeDeathStrik" })
});

/**
 * Damage riders on the combat CLOCK (round or turn; chips on the target are hit-riders.js): the FEATURE by
 * name and its pack damage activity — dice read off the sheet, crit-doubled. Membership: Clock Riders.
 *   when      "oncePerTurn" (every hit out of combat) | "firstRound" (never out of combat) | "any"
 *   uses      limited uses, read off the activity, else the item its consumption names; none → not offered
 *   effects   the rider activity's effects land on the target (effect-riders.js `applyActivityEffectsOnHit`)
 *   clock     a CHIP_WINDOWS key those effects land with, pinned to the ATTACKER's place
 *   requires  "sneak" — an armed Sneak Attack only;  weapon  a weapon attack only
 *   judge     "raging" | "reckless" (raging AND the "Reckless" effect on the attacker) | "targetDamaged"
 *             (the hit target below its Hit Point maximum) | "opportunity" (a driven Opportunity Attack, or an
 *             off-turn melee attack, ticked with the caveat) | "transformed" | "attuned" (D1, Elemental Epitome: the
 *             attacker's Elemental Attunement carries its active enchantment)
 *   unarmed   D1 — an Unarmed Strike only (the attack's `unarmed` classification, or Elemental Attunement's own Elemental Strike)
 *   enchant   due only on the item carrying the feature's own enchantment (Repelling Blast's "Make
 *             Repelling"); with none on the sheet, the row's `spell` stands for it
 *   maxSize   the largest target size it reaches; a larger one is not due, an unreadable size is
 *   inspired  the feature is the granting BARD's, the die the bard's Bardic Inspiration, paid by the attacker's
 *             own Inspired effect (deleted as it rides) — Combat Inspiration's damage half
 *   unticked  offered UNticked, and never ridden without a pick (a driven roll): a scarce die is spent by choice
 *   option / options  the sheet never records which option the character took (Hunter's Prey): the offer asks
 *             once, the pick is kept on the feature (`option` flag), and only the picked option's rows ride
 *   type      "weapon" — the weapon's damage type; otherwise the part's first
 *   dealt / crit  a damage type the hit must deal / a Critical Hit only
 *   lands     an effect with no activity to carry it: `{ name, from?, id, bare? }` — copied from the
 *             feature's effect `from` (changes dropped if `bare`), keyed by `id` so a new hit refreshes it
 *   bonusDice one more first die on a crit — dnd5e's `critical.bonusDice`, never doubled
 *   self      the rider is the ATTACK's own item, whatever its type (a monster's Chaos Blade, a weapon): due on that attack alone, its
 *             activity the attack's, no extra dice
 *   random    `{ die }` — one of the activity's effects, named "N: …", lands by the die (the GM's side:
 *             "roll 1d4: on a 1 Charmed, on a 2 Frightened…"), the pack's own duration; a `clock` may pin it
 *   label / says / caveat   the offer's and card's words
 *   enchantBy B4 — the enchantment judged is ANOTHER feature's (Lifedrinker's pact weapon: Pact of the Blade's bond); none
 *             bonded on the sheet, any weapon counts and the card says so (lookup.js pactWeaponFits)
 *   offers    B4 — after the rider rides, the damage card OFFERS the feature's named activity as a button, used at the
 *             attacker (Lifedrinker's heal: a Hit Point Die spent, the sheet's own heal activity — "you can")
 *   THE DMG's WEAPONS (RULINGS *The DMG — the crit riders and the enchanted weapons*):
 *   wields    the rider is the ATTACK's own weapon — one wearing the template's applied enchantment `feature` (lookup.js
 *             `wieldsAs`), or the item by that name; attuned where it requires it. Its `activity` is the WEAPON's (the
 *             template's riders land there)
 *   always    an item's property, never a pick: it neither opens nor shows on the damage offer, and always rides
 *   natural   "roll a 20 on the d20" — the d20's own 20 (or a fold that made it one), not any Critical Hit
 *   targets   what every hit creature must be — decide/clock.js `targetsAnswer` (`types`, `notTypes`, `hpBelow`, `shapeshifted`)
 *   save      the `activity` is a SAVE used at the hit creatures once the damage lands (the saves machine takes it); no dice
 *   saveOnly  that save rolls no damage (an enchantment's legacy damage change lands on every activity of the weapon — the
 *             save's too; the hit already dealt it). Giants' Bane keeps its own: its damage is how it slays.
 *   charges   the activity's own charges, when the sheet set them: none left, not due; one spent when the save SLAYS
 *             (SAVE_PRESSES `spend`)
 *   tempHp    the attacker gains that many Temporary Hit Points once the damage lands
 *   exhaustion  the hit creatures gain that many Exhaustion levels once the damage lands
 *   destroy   once the receipt lands, a hit creature left at or below that many Hit Points is destroyed (0 HP, Dead)
 *   type      a damage type of its own (Mace of Smiting's Bludgeoning), where `amount` has none
 *   RAVENLOFT: targetStatus  every hit creature wears the status (Ominous Strikes' Frightened);  owner "marker"  the bearer
 *             is whoever's item put the `marked` effect on the target — ANY ally's hit rides it (Path to the Grave);
 *             endsMark  the mark is removed from the hit creatures once the rider rides;  a `spread` row with
 *             `requires: "sneak"` spreads from the Sneak Attack's target (Wails from the Grave), its `activity` null the first damage
 * Left out: choices the sheet does not record or judgments the module cannot make (Brutal Strike, Hand of
 * Harm, Eldritch Smite, Foe Slayer). Death Strike: DEATH_STRIKE.
 */
export const CLOCK_RIDERS = Object.freeze({
  // THE GM'S SIDE — the random condition on a hit (RULINGS *The Monster Manual — the waiting rows built*): the
  // attack's own four effects, one landed by a d4 until the bearer's next turn (the pack's 1-round duration).
  "chaos-blade": Object.freeze({ feature: "Chaos Blade", activity: null, self: true, when: "any", random: Object.freeze({ die: 4 }),
    label: "Chaos Blade", says: "a d4 decides the condition — Charmed, Frightened, Poisoned or Incapacitated — until the start of your next turn",
    rule: Object.freeze({ item: "Chaos Blade", uuid: "Compendium.dnd-monster-manual.features.Item.mmChaosBlade0000" }),
    from: "monsters" }),
  "chaos-claw": Object.freeze({ feature: "Chaos Claw", activity: null, self: true, when: "any", random: Object.freeze({ die: 4 }),
    label: "Chaos Claw", says: "a d4 decides the condition — Charmed, Frightened, Poisoned or Incapacitated — until the start of your next turn",
    rule: Object.freeze({ item: "Chaos Claw", uuid: "Compendium.dnd-monster-manual.features.Item.mmChaosClaw00000" }),
    from: "monsters" }),
  "chaos-staff": Object.freeze({ feature: "Chaos Staff", activity: null, self: true, when: "any", random: Object.freeze({ die: 4 }),
    label: "Chaos Staff", says: "a d4 decides the condition — Charmed, Frightened, Poisoned or Incapacitated — until the start of your next turn",
    rule: Object.freeze({ item: "Chaos Staff", uuid: "Compendium.dnd-monster-manual.features.Item.mmChaosStaff0000" }),
    from: "monsters" }),
  // C1 — `follow` (Stalker's Flurry): once the Dreadful Strike rides, the damage card offers ONE of the feature's follow-ups —
  // Sudden Strike (a reminder: one more attack at a different creature within 5 ft of the target, from the sheet) or
  // Mass Fear (the pack's Wisdom save used at every enemy within its Emanation of the ranger).
  "dread-ambusher": Object.freeze({ feature: "Dread Ambusher", activity: "Dreadful Strike", when: "oncePerTurn", uses: true, weapon: true,
    follow: Object.freeze({ feature: "Stalker's Flurry", options: Object.freeze([
      Object.freeze({ label: "Sudden Strike", says: "one more attack with the same weapon at a different creature within 5 feet of the target — from the sheet" }),
      Object.freeze({ label: "Mass Fear", activity: "Mass Fear", radius: true })
    ]), rule: Object.freeze({ item: "Stalker's Flurry", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrStalkersFl" }) }),
    rule: Object.freeze({ item: "Dread Ambusher", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrDreadAmbus", benefit: "Dreadful Strike" }),
    from: "Ranger — Gloom Stalker 3" }),
  "assassinate": Object.freeze({ feature: "Assassinate", activity: "Damage", when: "firstRound", requires: "sneak", type: "weapon", weapon: true,
    rule: Object.freeze({ item: "Assassinate", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeAssasinate", benefit: "Surprising Strikes" }),
    from: "Rogue — Assassin 3 (Surprising Strikes)" }),
  "dreadful-strikes": Object.freeze({ feature: "Dreadful Strikes", activity: "Damage", when: "oncePerTurn", weapon: true,
    rule: Object.freeze({ item: "Dreadful Strikes", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrDreadfulSt" }),
    from: "Ranger — Fey Wanderer 3" }),
  "blessed-strikes-divine-strike": Object.freeze({ feature: "Blessed Strikes: Divine Strike", activity: "Divine Strike", when: "oncePerTurn", weapon: true,
    caveat: "the type is the activity's first — ask for the other by hand",
    rule: Object.freeze({ item: "Blessed Strikes: Divine Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbDivineStrike0" }),
    from: "Cleric 7" }),
  "elemental-fury-primal-strike": Object.freeze({ feature: "Elemental Fury: Primal Strike", activity: "Primal Strike", when: "oncePerTurn", weapon: true,
    caveat: "the type is the activity's first — ask for another by hand",
    rule: Object.freeze({ item: "Elemental Fury: Primal Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbFuryPrimalStr" }),
    from: "Druid 7" }),
  "divine-fury": Object.freeze({ feature: "Divine Fury", activity: "Divine Fury", when: "oncePerTurn", judge: "raging", weapon: true,
    caveat: "the type is the activity's first — ask for the other by hand",
    rule: Object.freeze({ item: "Divine Fury", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbDivineFury" }),
    from: "Barbarian — Zealot 3" }),
  // Offered unticked (RULINGS *The PHB classes — A1*): the die is the ally's to spend.
  "combat-inspiration": Object.freeze({ feature: "Combat Inspiration", activity: null, when: "any", inspired: true, unticked: true,
    label: "Combat Inspiration",
    rule: Object.freeze({ item: "Combat Inspiration", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdCombatInsp", benefit: "Offense" }),
    from: "Bard — College of Valor 3" }),
  // The option asked once and kept (RULINGS *The PHB classes — A1*); Horde Breaker is BONUS_SWINGS' row.
  "hunters-prey-colossus-slayer": Object.freeze({ feature: "Hunter's Prey", activity: "Damage", when: "oncePerTurn", judge: "targetDamaged",
    weapon: true, type: "weapon", label: "Colossus Slayer",
    option: "Colossus Slayer", options: Object.freeze(["Colossus Slayer", "Horde Breaker"]),
    rule: Object.freeze({ item: "Hunter's Prey", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrHuntersPre", benefit: "Colossus Slayer" }),
    from: "Ranger — Hunter 3" }),
  "frenzy": Object.freeze({ feature: "Frenzy", activity: "Damage", when: "oncePerTurn", judge: "reckless", weapon: true, type: "weapon",
    label: "Frenzy",
    rule: Object.freeze({ item: "Frenzy", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbFrenzy0000" }),
    from: "Barbarian — Path of the Berserker 3" }),
  // No dice: a card line per beam that hits; the push is the table's (the token is never moved).
  "repelling-blast": Object.freeze({ feature: "Repelling Blast", activity: null, when: "any", enchant: true, spell: "Eldritch Blast",
    maxSize: "lg", label: "Repelling Blast", says: "push it up to 10 feet straight away from you (move the token)",
    rule: Object.freeze({ item: "Repelling Blast", uuid: "Compendium.dnd-players-handbook.classes.Item.phbinvRepellingB" }),
    from: "Eldritch Invocation (Warlock 2)" }),
  // THE DMG's weapons: the template's enchantment on the weapon (`wields`), an item's property (`always`). The pack's own
  // crit bonus (Vorpal's 30, Life Stealing's 15, Sharpness's 14) rides every Critical Hit natively; these are the rest.
  "vorpal-sword": Object.freeze({ feature: "Vorpal Sword", activity: null, wields: true, always: true, natural: true, when: "any",
    label: "Vorpal Sword", says: "cut off one of its heads — it dies if it can't survive without one (Legendary Resistance can refuse it); headless, too big or immune to Slashing, it takes the extra 30 Slashing instead",
    rule: Object.freeze({ item: "Vorpal Sword", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgVorpalSword00" }),
    from: "DMG weapon" }),
  "sword-of-sharpness": Object.freeze({ feature: "Sword of Sharpness", activity: null, wields: true, always: true, natural: true, when: "any",
    exhaustion: 1, label: "Sword of Sharpness", says: "1 Exhaustion level",
    rule: Object.freeze({ item: "Sword of Sharpness", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgSwordOfSharpn" }),
    from: "DMG weapon" }),
  "sword-of-life-stealing": Object.freeze({ feature: "Sword of Life Stealing", activity: null, wields: true, always: true, natural: true, when: "any",
    targets: Object.freeze({ notTypes: Object.freeze(["construct", "undead"]) }), tempHp: 15,
    label: "Sword of Life Stealing", says: "you gain 15 Temporary Hit Points",
    rule: Object.freeze({ item: "Sword of Life Stealing", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgSwordOfLifeSt" }),
    from: "DMG weapon" }),
  "nine-lives-stealer": Object.freeze({ feature: "Nine Lives Stealer", activity: "Life Stealing", wields: true, always: true, natural: true,
    when: "any", save: true, charges: true, targets: Object.freeze({ notTypes: Object.freeze(["construct", "undead"]), hpBelow: 100 }),
    label: "Life Stealing", says: "a DC 15 Constitution save or it is slain — a charge spent if it is",
    rule: Object.freeze({ item: "Nine Lives Stealer", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgNineLivesStea", benefit: "Life Stealing" }),
    from: "DMG weapon" }),
  // Giants' Bane rides only with the paired attunement's enchantment applied: its save activity lands on the weapon with it.
  "hammer-of-thunderbolts": Object.freeze({ feature: "Hammer of Thunderbolts", activity: "Giants' Bane (On Crit)", wields: true, always: true,
    natural: true, when: "any", save: true, targets: Object.freeze({ types: Object.freeze(["giant"]) }),
    label: "Giants' Bane", says: "a DC 17 Constitution save or it dies",
    rule: Object.freeze({ item: "Hammer of Thunderbolts", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgHammerOfThund", benefit: "Giants' Bane" }),
    from: "DMG weapon" }),
  "mace-of-smiting": Object.freeze({ feature: "Mace of Smiting", activity: null, wields: true, always: true, natural: true, when: "any",
    amount: "7", type: "bludgeoning", targets: Object.freeze({ notTypes: Object.freeze(["construct"]) }), label: "Mace of Smiting",
    rule: Object.freeze({ item: "Mace of Smiting", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgMaceOfSmiting" }),
    from: "DMG weapon" }),
  "mace-of-smiting-construct": Object.freeze({ feature: "Mace of Smiting", activity: null, wields: true, always: true, natural: true, when: "any",
    amount: "14", type: "bludgeoning", targets: Object.freeze({ types: Object.freeze(["construct"]) }), destroy: 25,
    label: "Mace of Smiting", says: "a Construct left at 25 Hit Points or fewer is destroyed",
    rule: Object.freeze({ item: "Mace of Smiting", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgMaceOfSmiting" }),
    from: "DMG weapon" }),
  "silvered-weapon": Object.freeze({ feature: "Silvered Weapon", activity: null, wields: true, always: true, crit: true, when: "any",
    targets: Object.freeze({ shapeshifted: true }), bonusDice: 1, label: "Silvered Weapon", says: "one more weapon die against a shape-shifted creature",
    rule: Object.freeze({ item: "Silvered Weapon", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgSilveredWeapo" }),
    from: "DMG weapon" }),
  // Every hit: the 2d6 Necrotic is the enchantment's own part; the save, its effect and the repeat (REPEAT_SAVES) are the module's.
  "sword-of-wounding": Object.freeze({ feature: "Sword of Wounding", activity: "Sword of Wounding Save", wields: true, always: true, when: "any",
    save: true, saveOnly: true, label: "Sword of Wounding", says: "a DC 15 Constitution save or it can't regain Hit Points for 1 hour, repeating the save at the end of each of its turns",
    rule: Object.freeze({ item: "Sword of Wounding", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgSwordOfWoundi" }),
    from: "DMG weapon" }),
  // Any attack roll (weapon, unarmed or spell), so no `weapon`; the type is the part's own.
  "fires-burn": Object.freeze({ feature: "Fire's Burn", activity: "Burn", label: "Fire's Burn", when: "any", uses: true,
    rule: Object.freeze({ item: "Fire's Burn", uuid: "Compendium.dnd-players-handbook.origins.Item.phbsptFiresBurn0" }),
    from: "Goliath — Giant Ancestry (Fire)" }),
  "frosts-chill": Object.freeze({ feature: "Frost's Chill", activity: "Chill", label: "Frost's Chill", when: "any", uses: true, effects: true, clock: "slow",
    rule: Object.freeze({ item: "Frost's Chill", uuid: "Compendium.dnd-players-handbook.origins.Item.phbsptFrostsChil" }),
    from: "Goliath — Giant Ancestry (Frost)" }),
  // No activity: `amount` resolves on the bearer; the type follows the standing FORM (`forms`: an effect on
  // the bearer, or for Necrotic Shroud the module's form chip). `spells`: a no-attack damage spell is
  // offered on its card as a pick of one target (clock-riders.js).
  "celestial-revelation": Object.freeze({ feature: "Celestial Revelation", activity: null, amount: "@prof", label: "Celestial Revelation",
    when: "oncePerTurn", judge: "transformed", spells: true,
    forms: Object.freeze([
      Object.freeze({ form: "Heavenly Wings", effect: "Heavenly Wings", type: "radiant" }),
      Object.freeze({ form: "Inner Radiance", effect: "Searing Radiance", type: "radiant" }),
      Object.freeze({ form: "Necrotic Shroud", chip: "Necrotic Shroud", type: "necrotic" })
    ]),
    rule: Object.freeze({ item: "Celestial Revelation", uuid: "Compendium.dnd-players-handbook.origins.Item.phbsptCelestialR" }),
    from: "Aasimar — Celestial Revelation (character level 3)" }),
  // ⚠ The pack's "Slashed" carries Hamstring's −10 Speed AND stands for the crit's Disadvantage (EFFECT_BENDS
  // "Slashed"), so Hamstring lands as "Hamstrung" and only the crit lands "Slashed".
  "slasher-hamstring": Object.freeze({ feature: "Slasher", activity: null, label: "Hamstring", when: "oncePerTurn", dealt: "slashing",
    lands: Object.freeze({ name: "Hamstrung", from: "Slashed", id: "bfHamstrung00000" }), clock: "slow",
    says: "Speed −10 feet until the start of your next turn",
    rule: Object.freeze({ item: "Slasher", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftSlasher0000", benefit: "Hamstring" }),
    from: "General feat (Slasher)" }),
  "slasher-critical": Object.freeze({ feature: "Slasher", activity: null, label: "Slasher — Enhanced Critical", when: "any", crit: true, dealt: "slashing",
    lands: Object.freeze({ name: "Slashed", id: "bfSlashedCrit000" }), clock: "slow",
    says: "Disadvantage on its attack rolls until the start of your next turn",
    rule: Object.freeze({ item: "Slasher", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftSlasher0000", benefit: "Enhanced Critical" }),
    from: "General feat (Slasher)" }),
  "crusher-critical": Object.freeze({ feature: "Crusher", activity: null, label: "Crusher — Enhanced Critical", when: "any", crit: true, dealt: "bludgeoning",
    lands: Object.freeze({ name: "Crushed", from: "Crushed", id: "bfCrushedCrit000" }), clock: "slow",
    says: "attack rolls against it have Advantage until the start of your next turn",
    rule: Object.freeze({ item: "Crusher", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftCrusher0000", benefit: "Enhanced Critical" }),
    from: "General feat (Crusher)" }),
  "piercer-critical": Object.freeze({ feature: "Piercer", activity: null, label: "Piercer — Enhanced Critical", when: "any", crit: true, dealt: "piercing",
    bonusDice: 1, says: "one additional damage die",
    rule: Object.freeze({ item: "Piercer", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftPiercer0000", benefit: "Enhanced Critical" }),
    from: "General feat (Piercer)" }),
  // The pack's "Halted" for the rest of the current turn (the `halt` clock).
  "sentinel-halt": Object.freeze({ feature: "Sentinel", activity: null, label: "Halt", when: "any", judge: "opportunity",
    lands: Object.freeze({ name: "Halted", from: "Halted", id: "bfHalted00000000" }), clock: "halt",
    says: "Speed 0 for the rest of the current turn", caveat: "only on an Opportunity Attack",
    rule: Object.freeze({ item: "Sentinel", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftSentinel000", benefit: "Halt" }),
    from: "General feat (Sentinel)" }),
  // B2: Eldritch Strike — the pack's "Struck" (no activity carries it) landed by any weapon hit, until the end of the
  // fighter's next turn (the `vex` window is that clock); EFFECT_BENDS "Struck" reads it on the target's next save
  // against the fighter's spell and spends it.
  "eldritch-strike": Object.freeze({ feature: "Eldritch Strike", activity: null, label: "Eldritch Strike", when: "any", weapon: true,
    lands: Object.freeze({ name: "Struck", from: "Struck", id: "bfStruck00000000" }), clock: "vex",
    says: "Disadvantage on its next saving throw against a spell you cast, until the end of your next turn",
    rule: Object.freeze({ item: "Eldritch Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrEldritchSt" }),
    from: "Fighter — Eldritch Knight 10" }),
  // B4 — Lifedrinker: 1d6 once per turn on a pact-weapon hit, the type the activity's first (necrotic — the rider ruling; psychic
  // or radiant by hand); the heal (a Hit Point Die, the pack's own activities) OFFERED on the damage card.
  "lifedrinker": Object.freeze({ feature: "Lifedrinker", activity: "Damage", when: "oncePerTurn", weapon: true, enchantBy: "Pact of the Blade",
    offers: Object.freeze({ activity: "Heal (Largest Hit Die)", label: "Heal — spend a Hit Point Die" }),
    caveat: "the type is the activity's first (necrotic) — psychic or radiant by hand",
    rule: Object.freeze({ item: "Lifedrinker", uuid: "Compendium.dnd-players-handbook.classes.Item.phbinvLifedrinke" }),
    from: "Eldritch Invocation (Warlock 9)" }),
  // B4 — Relentless Avenger: Sentinel's Halt on the paladin's Opportunity Attack hit — the pack's own speed-0 effect for the
  // rest of the current turn (the `halt` clock); the paladin's free move is the table's.
  "relentless-avenger": Object.freeze({ feature: "Relentless Avenger", activity: null, label: "Relentless Avenger", when: "any", judge: "opportunity",
    lands: Object.freeze({ name: "Relentless Avenger", from: "Relentless Avenger", id: "bfRelentlessAvg0" }), clock: "halt",
    says: "Speed 0 for the rest of the current turn; you may move up to half your Speed as part of the Reaction (the table's)",
    caveat: "only on an Opportunity Attack",
    rule: Object.freeze({ item: "Relentless Avenger", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnRelentless" }),
    from: "Paladin — Oath of Vengeance 7" }),
  // C1 — Lunar Form: 2d10 radiant once per turn on a hit made in Wild Shape (`judge: "wildShape"` — the platform's
  // transformation flag on the attacker); the beast's attacks are the item, so no `weapon`.
  "lunar-form": Object.freeze({ feature: "Lunar Form", activity: "Damage", when: "oncePerTurn", judge: "wildShape", label: "Lunar Form",
    rule: Object.freeze({ item: "Lunar Form", uuid: "Compendium.dnd-players-handbook.classes.Item.phbdrdLunarForm0" }),
    from: "Druid — Circle of the Moon 14" }),
  // D1 — Elemental Epitome's Empowered Strikes: once per turn, an Unarmed Strike hit while Elemental Attunement is active
  // deals one more Martial Arts die of the strike's own type (Divine Fury's clock; the Resistance is the pack's effect,
  // Destructive Stride is movement — the table's).
  "elemental-epitome": Object.freeze({ feature: "Elemental Epitome", activity: "Empowered Strike", when: "oncePerTurn", judge: "attuned",
    unarmed: true, type: "weapon", label: "Empowered Strikes",
    rule: Object.freeze({ item: "Elemental Epitome", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkElementalE", benefit: "Empowered Strikes" }),
    from: "Monk — Warrior of the Elements 17" }),
  // C1 — Power of the Wilds' Ram (the pick at the Rage, EFFECT_CHOICES): once per turn while raging, a MELEE hit on a
  // Large or smaller creature lands the pack's own "Power of the Wilds: Ram" (Prone) — no save, no die. The pick's chip
  // ("Power of the Wilds: Ram") is the form the row reads; Lion is the ring's row (EMANATIONS), Falcon the pack's flight.
  "power-of-the-wilds-ram": Object.freeze({ feature: "Power of the Wilds", activity: null, when: "oncePerTurn", judge: Object.freeze(["raging", "transformed"]),
    melee: true, maxSize: "lg", label: "Power of the Wilds — Ram", forms: Object.freeze([Object.freeze({ form: "Ram", chip: "Ram" })]),
    lands: Object.freeze({ name: "Power of the Wilds: Ram", from: "Power of the Wilds: Ram", id: "bfPowerWildsRam0" }),
    says: "it is knocked Prone",
    rule: Object.freeze({ item: "Power of the Wilds", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbPowerOfThe", benefit: "Ram" }),
    from: "Barbarian — Path of the Wild Heart 14" }),
  // C1 — the riders on a SUMMON (`owner: "summoner"`): the feature and its dice are the SUMMONER's (the companion's sheet has
  // neither), read through the platform's summon origin; the hit target must wear the summoner's mark (`marked`: the spell's
  // effect whose origin is the summoner). Bestial Fury: the Beast's hit on the ranger's Hunter's Mark; Create Thrall: the
  // thrall's hit on the warlock's Hex (1d6 psychic).
  "bestial-fury": Object.freeze({ feature: "Bestial Fury", activity: "Damage", when: "any", owner: "summoner", marked: "Hunter's Mark", label: "Bestial Fury",
    rule: Object.freeze({ item: "Bestial Fury", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrBestialFur" }),
    from: "Ranger — Beast Master 11" }),
  "create-thrall": Object.freeze({ feature: "Create Thrall", activity: "Hex Damage", when: "any", owner: "summoner", marked: "Hex", label: "Create Thrall",
    caveat: "the thrall's Temporary Hit Points at the Hex are the pack's heal (its formula misspells the modifier — a data defect)",
    rule: Object.freeze({ item: "Create Thrall", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkCreateThra" }),
    from: "Warlock — Great Old One Patron 14" }),
  // C1 — Superior Hunter's Prey: once per turn, when the ranger's damage lands on a creature under its Hunter's Mark, the
  // mark's damage to ONE other creature within 30 ft of it — the caster's pick, a button per candidate on the damage card
  // (Celestial Revelation's spell pick, `spread` the feet from the marked creature); its own card and receipt.
  "superior-hunters-prey": Object.freeze({ feature: "Superior Hunter's Prey", activity: "Damage", when: "oncePerTurn", marked: "Hunter's Mark", spread: 30,
    label: "Superior Hunter's Prey",
    rule: Object.freeze({ item: "Superior Hunter's Prey", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrSuperiorHu" }),
    from: "Ranger — Hunter 11" }),
  // ARCANA UNLEASHED (RULINGS *Arcana Unleashed*) — the magic items' "you can" riders: offered UNTICKED (a charge is a
  // pick), the weapon's own save activity used at the hit creatures once the damage lands (its dice roll with the save).
  // `worn` (new): the carrier is a WORN item (equipped, attuned where required) on the attacker, not the attack's weapon
  // — Blood Amulet rides any damage the wearer deals.
  "blood-amulet": Object.freeze({ feature: "Blood Amulet", activity: null, worn: true, when: "any", save: true, uses: true, unticked: true,
    label: "Blood Amulet", says: "a charge: 2d10 Necrotic more, and a Constitution save or 1 Exhaustion level",
    rule: Object.freeze({ item: "Blood Amulet", uuid: "Compendium.dnd-arcana-unleashed.items.Item.aunBloodAmuletFw" }),
    from: "Arcana Unleashed — wondrous item" }),
  "diamond-staff-stunning-hit": Object.freeze({ feature: "Diamond Staff", activity: "Stunning Hit", wields: true, when: "any", save: true, uses: true,
    unticked: true, melee: true, label: "Stunning Hit", says: "a charge: a Constitution save or Stunned until the start of your next turn",
    rule: Object.freeze({ item: "Diamond Staff", uuid: "Compendium.dnd-arcana-unleashed.items.Item.aunDiamondStaftz", benefit: "Stunning Hit" }),
    from: "Arcana Unleashed — staff" }),
  "martialists-quarterstaff-trip": Object.freeze({ feature: "Martialist's Quarterstaff", activity: "Trip Save", wields: true, when: "any", save: true, uses: true,
    unticked: true, melee: true, label: "Trip", says: "a charge: a Strength save or Prone",
    rule: Object.freeze({ item: "Martialist's Quarterstaff", uuid: "Compendium.dnd-arcana-unleashed.items.Item.aunMartialistsnF", benefit: "Trip" }),
    from: "Arcana Unleashed — weapon" }),
  // No charge: "you can compel" is the pick; Named Target's chosen Critical Hit waits (the register).
  "namers-needle-identify": Object.freeze({ feature: "Namer's Needle", activity: "Save: Identify Target", wields: true, when: "any", save: true,
    unticked: true, label: "Identify Target", says: "a DC 15 Wisdom save or it says its name; a success makes it immune for 24 hours (the table's)",
    rule: Object.freeze({ item: "Namer's Needle", uuid: "Compendium.dnd-arcana-unleashed.items.Item.aunNamersNeedlzm", benefit: "Identify Target" }),
    from: "Arcana Unleashed — weapon" }),
  // HEROES OF FAERÛN (RULINGS *Heroes of Faerûn*). Polar Strikes: Divine Strike's shape — the feature's own Cold die once per
  // turn on a weapon hit ("once per creature per turn" reads as once per turn).
  "frigid-explorer-polar-strikes": Object.freeze({ feature: "Frigid Explorer", activity: "Polar Strike", when: "oncePerTurn", weapon: true,
    label: "Polar Strikes",
    rule: Object.freeze({ item: "Frigid Explorer", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofWiwFrigidExpl", benefit: "Polar Strikes" }),
    from: "Ranger — Winter Walker 3 (Heroes of Faerûn)" }),
  // Fairy Trickster's Flustering Strike: the pack ships one save per ability the feat may raise (`activities` — the ASI's pick, else
  // the higher modifier); "you can attempt" is the pick (unticked), the feat's uses the pool; the save lands the pack's Flustered.
  "fairy-trickster-flustering-strike": Object.freeze({ feature: "Fairy Trickster", activity: null,
    activities: Object.freeze({ cha: "Save Using Charisma", dex: "Save Using Dexterity" }), when: "any", save: true, uses: true, unticked: true,
    label: "Flustering Strike", says: "a Wisdom save or Disadvantage on saving throws until the end of your next turn",
    rule: Object.freeze({ item: "Fairy Trickster", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofFairyTrickste", benefit: "Flustering Strike" }),
    from: "Heroes of Faerûn — general feat" }),
  // RAVENLOFT (RULINGS *Ravenloft: The Horrors Within*). Pull of Death: Dreadful Strikes' die on a hit against a creature
  // missing Hit Points (`judge: "targetDamaged"`), once per turn; a spell's damage without an attack roll is the table's.
  "circle-of-mortality-pull-of-death": Object.freeze({ feature: "Circle of Mortality", activity: "Pull of Death", when: "oncePerTurn", judge: "targetDamaged",
    label: "Pull of Death", caveat: "a spell's damage without an attack roll is the table's",
    rule: Object.freeze({ item: "Circle of Mortality", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwCSCircleofMOG", benefit: "Pull of Death" }),
    from: "Cleric — Grave Domain 3 (Ravenloft)" }),
  // Ominous Strikes: the Wisdom modifier on any hit against a FRIGHTENED target (`targetStatus`), no die of its own.
  "ancient-might-ominous-strikes": Object.freeze({ feature: "Ancient Might", activity: null, when: "any", amount: "@abilities.wis.mod", type: "weapon",
    targetStatus: "frightened", label: "Ominous Strikes",
    rule: Object.freeze({ item: "Ancient Might", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwHWAncientMibA", benefit: "Ominous Strikes" }),
    from: "Ranger — Hollow Warden 15 (Ravenloft)" }),
  // Path to the Grave's End Curse Early: ANY ally's hit on the cursed creature (`marked` — the cleric's own Cursed effect on the
  // target; `owner: "marker"` makes the cleric the bearer, whoever hit) ends the curse (`endsMark`) for the cleric's level in
  // Necrotic or Radiant — "you can": unticked, Necrotic the type here.
  "path-to-the-grave": Object.freeze({ feature: "Path to the Grave", activity: "End Curse Early", when: "any", marked: "Cursed (Path to the Grave)",
    owner: "marker", endsMark: true, unticked: true, type: "necrotic", label: "End Curse Early",
    caveat: "Necrotic here; Radiant is the cleric's other choice — change the type by hand",
    rule: Object.freeze({ item: "Path to the Grave", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwCSPathtotheCb", benefit: "End Curse Early" }),
    from: "Cleric — Grave Domain 3 (Ravenloft)" }),
  // Wails from the Grave: after Sneak Attack damage lands, a second creature within 30 ft of the first takes half the Sneak
  // dice as Necrotic — Superior Hunter's Prey's `spread` with `requires: "sneak"`, the feature's own uses the pool.
  "wails-from-the-grave": Object.freeze({ feature: "Wails from the Grave", activity: null, when: "oncePerTurn", requires: "sneak", spread: 30, uses: true,
    label: "Wails from the Grave",
    rule: Object.freeze({ item: "Wails from the Grave", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwPRWailsfromLz" }),
    from: "Rogue — Phantom 3 (Ravenloft)" })
});

/** Text-only features whose whole consequence is a bend on the next roll: use-chips.js writes a chip named
 * as the feature, EFFECT_BENDS reads it, the roll spends it. `window` a CHIP_WINDOWS key; `changes` the
 * sheet changes; `on: "miss"` + `against` — written by a MISS, one chip per missed creature, carrying its uuid
 * (Studied Attacks, B3). B4: `on: "hit"` + `holder: "target"` — written by a HIT on the feature's bearer, the chip
 * on the BEARER against the attacker (`chipName` its name: Multiattack Defense on Defensive Tactics); `melee` is
 * the bend row's scope (Shadow Step: the next melee attack). Membership: Effect Sources. */
export const USE_CHIPS = Object.freeze({
  "Steady Aim": Object.freeze({ key: "steadyAim", bend: "advantage", window: "steadyAim",
    rule: Object.freeze({ item: "Steady Aim", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeSteadyAim0" }),
    note: "Speed 0 until the end of the turn; the next attack roll spends it",
    changes: Object.freeze([Object.freeze({ key: "system.attributes.movement.walk", mode: 5, value: "0" })]) }),
  // B3 — armed by a MISS (`on: "miss"`, read as rolled on the attack card — Graze's road), one chip per missed creature on the
  // attacker, `against` that creature (EFFECT_BENDS "Studied Attacks" reads the chip only at that target; the roll spends it).
  "Studied Attacks": Object.freeze({ key: "studiedAttacks", bend: "advantage", window: "vex", on: "miss", against: true,
    rule: Object.freeze({ item: "Studied Attacks", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrStudiedAtt" }),
    note: "the next attack roll against that creature spends it, before the end of your next turn" }),
  // B4 — Shadow Step: the teleport's use arms Advantage on the next MELEE attack this turn (the pack ships no effect).
  "Shadow Step": Object.freeze({ key: "shadowStep", bend: "advantage", window: "steadyAim", melee: true,
    rule: Object.freeze({ item: "Shadow Step", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkShadowStep" }),
    note: "the next melee attack roll this turn spends it; the teleport is the table's move" }),
  // B4 — Defensive Tactics' Multiattack Defense: once a creature hits the ranger, +4 AC against that creature's later attacks this
  // turn — a chip on the RANGER against the attacker; EFFECT_BENDS "Multiattack Defense" pushes −4 onto that attacker's rolls.
  "Defensive Tactics": Object.freeze({ key: "multiattackDefense", chipName: "Multiattack Defense", bend: null, window: "halt", on: "hit", holder: "target", against: true,
    rule: Object.freeze({ item: "Defensive Tactics", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrDefensiveT", benefit: "Multiattack Defense" }),
    note: "+4 AC against that creature's attacks for the rest of the current turn" })
});

/**
 * A use chip of its own kind (RULINGS *Bent by choice — the rule of cool*): the feature's `activity` is
 * VETOED at the use and becomes a chip `chip` on the actor for `seconds`, spending `dose` uses. The next
 * weapon hit spends it: the save in `saves` for the ability the feat raised (decide/chips.js
 * `coatSaveAbility`) is used at the struck creatures; SAVE_PRESSES presses what the pack only names.
 * `list`: the Fighting Styles entry for the same feat is its switch (a row without one is on while its carrier is owned).
 * `item`: the DMG — the carrier is the VIAL itself (a consumable the actor owns): its own `Use Poison` save activity is the
 * save at the creatures struck; on the hit a stack loses one vial, the last stays on the sheet empty (its save reads it).
 * `says`: the hit card's one line — what the struck creature faces.
 * ⚠ NOT A KIND — one table, one machine (use-chips.js); a second customer is a row.
 */
export const COATINGS = Object.freeze({
  "Poisoner": Object.freeze({ key: "poisoner", activity: "Apply Poison", chip: "Poison Coating", img: "icons/weapons/daggers/dagger-poisoned.webp", seconds: 60, dose: 1,
    saves: Object.freeze({ dex: "Poison Save (Dexterity)", int: "Poison Save (Intelligence)" }), list: "damageRules",
    says: "on a failure, 2d8 Poison and Poisoned until the end of your next turn",
    rule: Object.freeze({ item: "Poisoner", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftPoisoner000", benefit: "Brew Poison" }),
    from: "General feat" }),
  // The DMG's four INJURY poisons (audits/drawings/dm.md *Poisons as weapon coatings*): the vial is the carrier, its Use Poison the save.
  "Lolth's Sting": Object.freeze({ key: "lolthsSting", item: true, activity: "Use Poison", chip: "Lolth's Sting Coating", img: null, seconds: 60, dose: 1,
    saves: Object.freeze({ con: "Use Poison" }), says: "DC 13 — on a failure, Poisoned for 1 hour; failed by 5 or more, Unconscious as well",
    rule: Object.freeze({ item: "Lolth's Sting", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgLolthsSting00" }),
    from: "DMG injury poison" }),
  "Purple Worm Poison": Object.freeze({ key: "purpleWormPoison", item: true, activity: "Use Poison", chip: "Purple Worm Poison Coating", img: null, seconds: 60, dose: 1,
    saves: Object.freeze({ con: "Use Poison" }), says: "DC 21 — 10d6 Poison, half on a success",
    rule: Object.freeze({ item: "Purple Worm Poison", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgPurpleWormPoi" }),
    from: "DMG injury poison" }),
  "Serpent Venom": Object.freeze({ key: "serpentVenom", item: true, activity: "Use Poison", chip: "Serpent Venom Coating", img: null, seconds: 60, dose: 1,
    saves: Object.freeze({ con: "Use Poison" }), says: "DC 11 — 3d6 Poison, half on a success",
    rule: Object.freeze({ item: "Serpent Venom", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgSerpentVenom0" }),
    from: "DMG injury poison" }),
  "Wyvern Poison": Object.freeze({ key: "wyvernPoison", item: true, activity: "Use Poison", chip: "Wyvern Poison Coating", img: null, seconds: 60, dose: 1,
    saves: Object.freeze({ con: "Use Poison" }), says: "DC 14 — 7d6 Poison, half on a success",
    rule: Object.freeze({ item: "Wyvern Poison", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgWyvernPoison0" }),
    from: "DMG injury poison" })
});

/** A text-only feature used through another item's cast: that cast's card (`on`) offers a reminder chip
 * `chip` for `seconds`, at most `max` standing. The chip bends nothing. Membership: Card Chips. */
export const CARD_CHIPS = Object.freeze({
  "Tinker": Object.freeze({ feature: "Gnomish Lineage, Rock", on: "Prestidigitation", chip: "Tiny Clockwork Device", seconds: 28800, max: 3,
    ask: "Tinker — build a Tiny Clockwork Device (10 minutes)",
    rule: Object.freeze({ item: "Gnomish Lineage, Rock", uuid: "Compendium.dnd-players-handbook.origins.Item.phbsptRockGnomeL" }),
    from: "Gnome — Gnomish Lineage (Rock)" })
});


/**
 * A save activity whose FAILURE lands a condition the pack has no effect for (the 2024 Web ships none): the
 * status is pressed via `forceStatus`, the caster as origin, as Topple presses Prone — only when the
 * activity brought no effect. ⚠ tools/audit-presses.mjs's output: re-run it after a content update. Left
 * out: Sleep and Flesh to Stone (carried), Elemental Attunement and Mind Spike.
 *   word   a press behind the CASTER's word (Command): `ask` and `options` the choice, `presses` the one
 *          option that lands `status`, `default` what the clock chooses (saves/choices.js, kind `word`); with
 *          `statuses` (option → status) every option presses its own (Beguiling Twist)
 *   lasts  the pressed status's duration ({ rounds, seconds }); none → until removed
 *   success  the activity's OWN effects by name that land on a SUCCESS, never a failure (no `status`): the
 *          pack marks Stunning Strike's Slowed failure-only (A2)
 *   activity  THE DMG — the row answers an ENCHANTED item's save activity of that name (the key is the template's
 *          enchantment: "Nine Lives Stealer" on a "Nine Lives Stealer Longsword");  slain  the failure takes the
 *          creature to 0 Hit Points with the status;  spend  one of the activity's own charges spent when it lands
 */
export const SAVE_PRESSES = Object.freeze({
  "Stunning Strike": Object.freeze({ success: Object.freeze(["Slowed"]),
    rule: Object.freeze({ item: "Stunning Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkStunningSt" }) }),
  // Grovel alone lands a condition; Approach, Flee and Halt move or hold the token, the table's.
  // `types`: the SPELL alone — Heroes of Faerûn's Conjure Constructs ships a construct action named "Command" (its Clockwork Force).
  "Command": Object.freeze({ status: "prone", onFail: true, types: Object.freeze(["spell"]),
    word: Object.freeze({ ask: "Which word did you speak?", options: Object.freeze(["Approach", "Flee", "Grovel", "Halt"]), presses: "Grovel", default: "Halt" }),
    rule: Object.freeze({ item: "Command", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplCommand000" }) }),
  "Web": Object.freeze({ status: "restrained", onFail: true,
    rule: Object.freeze({ item: "Web", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplWeb0000000" }) }),
  // B2: the twist's Wisdom save (INTERRUPT_ROLLS "Beguiling Twist") — the pack ships no effect; the ranger's word picks the
  // condition (a `word` whose `statuses` map EVERY option to a press), for a minute (`lasts`).
  "Beguiling Twist": Object.freeze({ status: "frightened", onFail: true, lasts: Object.freeze({ rounds: 10, seconds: 60 }),
    word: Object.freeze({ ask: "Charmed or Frightened?", options: Object.freeze(["Charmed", "Frightened"]), presses: "Frightened", default: "Frightened",
      statuses: Object.freeze({ Charmed: "charmed", Frightened: "frightened" }) }),
    rule: Object.freeze({ item: "Beguiling Twist", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrBeguilingT" }) }),
  "Grease": Object.freeze({ status: "prone", onFail: true,
    rule: Object.freeze({ item: "Grease", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplGrease0000" }) }),
  "Sleet Storm": Object.freeze({ status: "prone", onFail: true,
    rule: Object.freeze({ item: "Sleet Storm", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplSleetStorm" }) }),
  // THE DMG — Life Stealing: the failure SLAYS (0 Hit Points, Dead) and the weapon loses a charge.
  "Nine Lives Stealer": Object.freeze({ activity: "Life Stealing", status: "dead", onFail: true, slain: true, spend: true,
    rule: Object.freeze({ item: "Nine Lives Stealer", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgNineLivesStea", benefit: "Life Stealing" }) }),
  // No effect on the feat's saves: Poisoned is pressed here, ending with the Poisoner's next turn.
  "Poisoner": Object.freeze({ status: "poisoned", onFail: true, expiry: "sourceEnd",
    rule: Object.freeze({ item: "Poisoner", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftPoisoner000", benefit: "Brew Poison" }) })
});

/** Evasion's shape, no choice (R1): a save against half-on-success takes none on a success and half on a
 * failure; not while Incapacitated. The verdict's multiplier does it. Keyed by the feature on the sheet;
 * `ability` narrows it (Evasion: Dexterity only) or null reaches every save (Avoidance, a monster's — the GM's side).
 * `onMiss` (a `side: "caster"` row): a missed attack with the caster's cantrip still deals that share — Graze's
 * shape (the miss still pays), rolled once the miss is final (auto-damage.js), landed by the applier. */
export const EVASIONS = Object.freeze({
  "Evasion": Object.freeze({ ability: "dex",
    rule: Object.freeze({ item: "Evasion", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkEvasion000" }),
    from: "Monk 7 / Rogue 7 / Ranger 15" }),
  "Avoidance": Object.freeze({ ability: null,
    rule: Object.freeze({ item: "Avoidance", uuid: "Compendium.dnd-monster-manual.features.Item.mmAvoidance00000" }),
    from: "monsters" }),
  // THE MIRROR ON THE CASTER (`side: "caster"`): keyed by the CASTER's feature, never the saver's. A successful
  // save against the caster's cantrip (`cantrip`) still takes `onSuccess` of the damage; a failure is unchanged.
  "Potent Cantrip": Object.freeze({ side: "caster", cantrip: true, onSuccess: 0.5, onMiss: 0.5, ability: null,
    rule: Object.freeze({ item: "Potent Cantrip", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwzdPotentCant" }),
    from: "Wizard — Evoker 3" }),
  // C1 — Leading Evasion: the bard's own Evasion on Dexterity saves, SHARED (`share`: feet) with every other creature making
  // the same demanded save within 5 ft of it — the consequences pass reads the demand card's other targets off the map.
  "Leading Evasion": Object.freeze({ ability: "dex", share: 5,
    rule: Object.freeze({ item: "Leading Evasion", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdLeadingEva" }),
    from: "Bard — College of Dance 14" }),
  // ARCANA UNLEASHED — Aura of Evasion: Evasion keyed to an EFFECT (`effect`, the ring's member copy of the spell's "Aura",
  // its origin `item` the spell), not a feature on the sheet; the Advantage on the save is EFFECT_BENDS' member row.
  "Aura of Evasion": Object.freeze({ ability: "dex", effect: "Aura", item: "Aura of Evasion",
    rule: Object.freeze({ item: "Aura of Evasion", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunAuraofEvasiIJ" }),
    from: "Arcana Unleashed — level 7 spell (Concentration, 1 minute)" }),
  // HEROES OF FAERÛN — Crown of Spellfire's Spell Avoidance: Evasion on every save against a SPELL or magical effect (`spells`:
  // the demand's mark) while the crown's own effect stands on the sorcerer.
  "Crown of Spellfire": Object.freeze({ ability: null, spells: true, effect: "Crown of Spellfire", item: "Crown of Spellfire",
    rule: Object.freeze({ item: "Crown of Spellfire", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofSpfCrownofSpe", benefit: "Spell Avoidance" }),
    from: "Sorcerer — Spellfire Sorcery 18 (Heroes of Faerûn)" })
});

/*
 * HOW A ROW NAMES ITS CONTENT. A row is keyed by the item's English name and FINDS the item by dnd5e's
 * `system.identifier`, stamped at creation and kept through a rename ("Heat Metal - Spellcasting" is
 * `heat-metal`); the name is the fallback, for an item with no identifier or another one.
 * `tools/check-identifiers.mjs` proves every row's identifier against the packs' snapshot.
 */

/** A row whose content's identifier is not its name's slug, name → identifier: Heroes of Faerûn's spells drop the mage's name. */
export const ALIASES = Object.freeze({
  "Laeral's Silver Lance": "silver-lance",
  "Elminster's Effulgent Spheres": "effulgent-spheres",
  "Elminster's Elusion": "elusion",
  // RAVENLOFT: the Survivor feat's rows are keyed with the book's name; the item's identifier is the plain one.
  "Survivor (Ravenloft)": "survivor"
});

/**
 * A row name a FEAT of another kind shares — the feat subtype (`system.type.value`) the registry's rows of that name
 * mean. Ravenloft's "Survivor" is a feat (`feat`) with the Fighter's name (a `class` feature); its identifier is the same
 * slug, so the name and the identifier both collide, and only the subtype tells them apart. An item of a listed name
 * whose subtype is set and differs answers no row; an item with no subtype (a hand-made copy) still does.
 */
export const FEATURE_TYPES = Object.freeze({
  "Survivor": "class",
  // RAVENLOFT: the Touch of Death feat vs Ankhtepot's action; the Survivor feat's own rows (the key carries the book).
  "Touch of Death": "feat",
  "Survivor (Ravenloft)": "feat"
});

/** The slug dnd5e's packs give a name: lower-case, apostrophes dropped, any other run one hyphen. */
const slug = name => String(name ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’'"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** The identifier a row's name finds its item by. */
export function identifierOf(name) {
  const aliased = /** @type {Record<string, string>} */ (ALIASES)[String(name)];
  return aliased ?? slug(name);
}

/**
 * How an item answers a row: "identifier", "name" (the fallback), or null.
 * @param {string} key  the row's name
 * @param {{ name?: string|null, identifier?: string|null, type?: string|null, system?: { identifier?: string|null, type?: { value?: string|null } } }|null|undefined} item
 *   an Item (its `system.identifier` is read; a feat's `system.type.value` for a FEATURE_TYPES name) or a plain `{ name, identifier, type }`
 * @param {string[]|null} [types]  the item types the row means; null for any
 * @returns {"identifier"|"name"|null}
 */
export function matchOf(key, item, types = null) {
  if ( !item || !key ) return null;
  if ( types && !types.includes(String(item.type ?? "")) ) return null;
  // A name another book's feat shares (FEATURE_TYPES): the feat subtype must agree where the item declares one.
  const wanted = /** @type {Record<string, string>} */ (FEATURE_TYPES)[String(key)];
  if ( wanted && (item.type === "feat") ) {
    const subtype = item.system?.type?.value ?? null;
    if ( subtype && (subtype !== wanted) ) return null;
  }
  const identifier = item.system?.identifier ?? item.identifier ?? null;
  if ( identifier && (identifier === identifierOf(key)) ) return "identifier";
  return (String(item.name ?? "").toLowerCase() === String(key).toLowerCase()) ? "name" : null;
}

/**
 * Does this item answer the row?
 * @param {string} key
 * @param {Parameters<typeof matchOf>[1]} item
 * @param {string[]|null} [types]
 */
export const answers = (key, item, types = null) => !!matchOf(key, item, types);

/**
 * A name-keyed table's closed, lower-cased name set and its case-insensitive lookups. `keyOf` names the
 * column a list validates against when it is not the key.
 * ⚠ List defaults derive from these names: renaming a key changes what saved settings validate against.
 * ⚠ `rowNamed` spreads the row over `{ key }`, so a row's own `key` field wins — `keyNamed` gives the table key.
 * @template T
 * @param {Record<string, T>} table
 * @param {((row: T, key: string) => string) | null} [keyOf]
 * @returns {{ names: Set<string>, keyNamed: (name: unknown) => string | null, rowNamed: (name: unknown) => (T & { key: string }) | null,
 *   keyFor: (item: any) => string | null, rowFor: (item: any) => (T & { key: string }) | null }}
 */
export function tableIndex(table, keyOf = null) {
  const keys = Object.keys(table);
  const nameOf = k => String(keyOf ? keyOf(/** @type {T} */ (table[k]), k) : k).toLowerCase();
  const names = new Set(keys.map(nameOf));
  const keyNamed = name => {
    const wanted = String(name ?? "").toLowerCase();
    return keys.find(x => nameOf(x) === wanted) ?? null;
  };
  const rowNamed = name => {
    const k = keyNamed(name);
    return k ? { key: k, .../** @type {T} */ (table[k]) } : null;
  };
  // An item's row: its identifier first, then its name.
  const byIdentifier = new Map();
  for ( const k of keys ) {
    const identifier = identifierOf(keyOf ? keyOf(/** @type {T} */ (table[k]), k) : k);
    if ( !byIdentifier.has(identifier) ) byIdentifier.set(identifier, k);   // the first row, as keyNamed
  }
  /** @param {Parameters<typeof matchOf>[1]} item */
  const keyFor = item => {
    const identifier = item?.system?.identifier ?? item?.identifier ?? null;
    return (identifier && byIdentifier.get(identifier)) || keyNamed(item?.name);
  };
  /** @param {Parameters<typeof matchOf>[1]} item */
  const rowFor = item => {
    const k = keyFor(item);
    return k ? { key: k, .../** @type {T} */ (table[k]) } : null;
  };
  return { names, keyNamed, rowNamed, keyFor, rowFor };
}


/**
 * The hit menu: one popup per hit, one pick per GROUP (RULINGS *The hit menu — a pick per group*). A group
 * is the paying feature (pool, die, pick limit, DC); an OPTION a sheet feature spending from it. All read
 * off the content (N1): die, pool (the consumption target by id, identifier or compendium source), save.
 * ⚠ Trip Attack's Prone effect sits on the ITEM, unlinked to the activity — `onFail` presses it.
 *   mode     "ride" (default: the die joins the damage roll) | "sweep" (rolled apart at a second creature)
 *   save     the option's save activity is used at the target after the damage;  onFail  the status pressed
 *   effects  the damage activity's effects land on the target, no save;  clock  their CHIP_WINDOWS key
 *   press    a status pressed with NO save, never over one the target has (the activity may be a utility)
 *   maxSize  the largest size reached; a larger target greys the row, an unreadable size does not
 *   line     the card's words for a consequence the table plays;  melee  melee attacks only
 *   activity the option's own activity BY NAME (several options on one item: Open Hand Technique's three)
 *   label    the row's words when several options share a feature;  noDie  no die: the pool (or nothing) pays
 *   oncePerTurn  a per-OPTION turn chit (the rider chit, keyed by the option); greyed "used this turn"
 *   unarmed  an Unarmed Strike only;  weapons "monk"  a Monk weapon or an Unarmed Strike;  weapon  a weapon only
 *   only     "flurry" — an Unarmed Strike after Flurry of Blows THIS turn (its use writes a chit; out of combat
 *            every Unarmed Strike, the caveat said) | "own" — the attack is the feature's OWN activity
 *   ownType  the option's die keeps its own damage type (a shared-pool group's dice otherwise take the weapon's)
 *   dieFrom  the die is ANOTHER feature's damage activity (Improved Brutal Strike's blows ride Brutal Strike's die)
 *   requires { forgo } — the group opens only on a hit whose attack recorded that forgo (Brutal Strike, B3)
 *   saveDice the die is the option's SAVE activity's damage (Arcane Shot: the pack puts the dice on the save): it rides the hit
 *            and the save follows with no dice and no second spend;  weapons "ammunition"  a ranged Ammunition weapon
 *   onceKey  the turn chit's key, shared by every option of a group that is once per turn as a whole (Arcane Shot)
 * A group's `feature` is the paying feature (null: nothing to carry — Giant Ancestry); `pool` "feature"
 * (one shared pool) | "option" (each option's own uses) | "free" (nothing paid) | "pactSlot" (B4, Eldritch Smite: a
 * Pact Magic slot — `system.spells.pact`, every slot one level, so no picker; Q9's `poolOf` branch); `max` picks
 * (`maxAt` { levels, at, max } — D1: the group's `max` rises at a class level read off the attacker's roll data);
 * `ownDice` each option shows its own die beside the pool's one use (Monk's Focus); the rest are the card's words.
 *   pact     B4 — the attack's weapon must be the PACT WEAPON (lookup.js pactWeaponFits: bonded through Pact of the Blade;
 *            none bonded on the sheet, any weapon with the caveat)
 *   follow   B4 — a FOLLOW-UP after the option rides: another feature's save activity used at the hit target
 *            (`{ feature, activity }` — Telekinetic Adept's Telekinetic Thrust after Psionic Strike, Trip's path)
 *   also     B4 — ANOTHER feature's damage activity whose effects land with the option's ride (`{ feature, activity,
 *            clock }` — Physician's Touch's Poisoned on Hand of Harm), when that feature is on the sheet
 * Membership: the Hit Menu list (option names). Precision Attack and Riposte are folds.
 */
export const HIT_GROUPS = Object.freeze({
  "combat-superiority": Object.freeze({ feature: "Combat Superiority", pool: "feature", label: "Combat Superiority", max: 1,
    dieLabel: "Superiority Die", eyebrow: "Maneuver", heading: "Maneuvers", per: "one maneuver per attack", from: "Fighter — Battle Master 3",
    rule: Object.freeze({ item: "Combat Superiority", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrCombatSupe", benefit: "Maneuvers" }) }),
  // Hill's Tumble only (Fire and Frost are CLOCK_RIDERS); no feature: the text-only parent may be missing.
  "giant-ancestry": Object.freeze({ feature: null, pool: "option", label: "Giant Ancestry", max: 1,
    dieLabel: "use", eyebrow: "Giant Ancestry", heading: "Giant Ancestry", per: "one boon per hit", from: "Goliath",
    rule: Object.freeze({ item: "Goliath", uuid: "Compendium.dnd-players-handbook.origins.Item.phbspGoliath0000", benefit: "Giant Ancestry" }) }),
  // A2: every option its own once-per-turn feature, so both may ride one hit (`max` 2).
  "monks-focus": Object.freeze({ feature: "Monk's Focus", pool: "feature", ownDice: true, label: "Monk's Focus", max: 2,
    dieLabel: "Focus Point", eyebrow: "Monk", heading: "Monk's Focus", per: "each once per turn", from: "Monk 2",
    rule: Object.freeze({ item: "Monk's Focus", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkMonksFocus" }) }),
  "open-hand-technique": Object.freeze({ feature: "Open Hand Technique", pool: "free", label: "Open Hand Technique", max: 1,
    dieLabel: "use", eyebrow: "Monk", heading: "Open Hand Technique", per: "one per Flurry of Blows hit", from: "Monk — Warrior of the Open Hand 3",
    rule: Object.freeze({ item: "Open Hand Technique", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkOpenHandTe" }) }),
  "elemental-attunement": Object.freeze({ feature: "Elemental Attunement", pool: "free", label: "Elemental Attunement", max: 1,
    dieLabel: "use", eyebrow: "Monk", heading: "Elemental Attunement", per: "on an Elemental Strike hit", from: "Monk — Warrior of the Elements 3",
    rule: Object.freeze({ item: "Elemental Attunement", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkElementalA" }) }),
  "psionic-power": Object.freeze({ feature: "Psionic Power", pool: "feature", ownDice: true, label: "Psionic Power", max: 1,
    dieLabel: "Psionic Energy Die", eyebrow: "Psi Warrior", heading: "Psionic Power", per: "once per turn", from: "Fighter — Psi Warrior 3",
    rule: Object.freeze({ item: "Psionic Power", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrPsionicPow" }) }),
  // B3 — Brutal Strike: FREE (the forgone Advantage paid for it — `requires.forgo` reads the attack's reminder record, the
  // group opens only on a hit whose attack forwent its Advantage); `ownDice`: every option rides the feature's own die
  // (`@scale.barbarian.brutal-strike`, the weapon's type), one effect per hit (`max` 1). D1 — Improved Brutal Strike at
  // Barbarian 17: two DIFFERENT effects (`maxAt` — the pack ships ONE Improved Brutal Strike item, the level is the read;
  // the 2d10 is the scale's own step).
  "brutal-strike": Object.freeze({ feature: "Brutal Strike", pool: "free", ownDice: true, requires: Object.freeze({ forgo: "Brutal Strike" }),
    label: "Brutal Strike", max: 1, maxAt: Object.freeze({ levels: "@classes.barbarian.levels", at: 17, max: 2 }), dieLabel: "die", eyebrow: "Barbarian", heading: "Brutal Strike", per: "one effect per hit — the forgone Advantage paid for it", from: "Barbarian 9",
    rule: Object.freeze({ item: "Brutal Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbBrutalStri" }) }),
  // B4 — Eldritch Smite: a Pact slot the cost (`pool: "pactSlot"`), the die the pack's Smite activity ((1 + pact level)d8 force).
  "eldritch-smite": Object.freeze({ feature: "Eldritch Smite", pool: "pactSlot", ownDice: true, label: "Eldritch Smite", max: 1,
    dieLabel: "Pact slot", eyebrow: "Warlock", heading: "Eldritch Smite", per: "once per turn, on a pact-weapon hit", from: "Eldritch Invocation (Warlock 5)",
    rule: Object.freeze({ item: "Eldritch Smite", uuid: "Compendium.dnd-players-handbook.classes.Item.phbinvEldritchSm" }) }),
  // C1 — Hurl Through Hell: Stunning Strike's shape on any attack roll's hit — the pack's Charisma save activity is the cost
  // (the feature's own once per Long Rest); the removal and the return are the table's, the pact-slot Regain Use the sheet's.
  "hurl-through-hell": Object.freeze({ feature: "Hurl Through Hell", pool: "feature", label: "Hurl Through Hell", max: 1,
    dieLabel: "use", eyebrow: "Warlock", heading: "Hurl Through Hell", per: "once per turn, once per Long Rest", from: "Warlock — Fiend Patron 14",
    rule: Object.freeze({ item: "Hurl Through Hell", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkHurlThroug" }) }),
  // ARCANA UNLEASHED (RULINGS *Arcana Unleashed*) — Arcane Shot: the pool is the Arcane Shot item's uses (each option's save
  // consumes them), one option per hit on a ranged Ammunition weapon, once per turn for the WHOLE group (`onceKey`). Every
  // option but Bursting Shot is a save that carries its own dice (`noDie` + `save`: the extra damage rolls with the save, the
  // condition lands on the failure); Bursting's die rides the hit (`ownDice`). Piercing and Seeking Shot replace the attack roll — text.
  "arcane-shot": Object.freeze({ feature: "Arcane Shot", pool: "feature", ownDice: true, label: "Arcane Shot", max: 1,
    dieLabel: "use", eyebrow: "Arcane Archer", heading: "Arcane Shot", per: "one option per hit, once per turn, on a ranged Ammunition weapon", from: "Fighter — Arcane Archer 3 (Arcana Unleashed)",
    rule: Object.freeze({ item: "Arcane Shot", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunArcaneShot000" }) })
});

export const HIT_OPTIONS = Object.freeze({
  "trip-attack": Object.freeze({ feature: "Trip Attack", group: "combat-superiority", save: true, onFail: "prone",
    rule: Object.freeze({ item: "Trip Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvTripAttack" }) }),
  "goading-attack": Object.freeze({ feature: "Goading Attack", group: "combat-superiority", save: true,
    rule: Object.freeze({ item: "Goading Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvGoadingAtt" }) }),
  "menacing-attack": Object.freeze({ feature: "Menacing Attack", group: "combat-superiority", save: true,
    rule: Object.freeze({ item: "Menacing Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvMenacingAt" }) }),
  "pushing-attack": Object.freeze({ feature: "Pushing Attack", group: "combat-superiority", save: true,
    line: "Played at the table: on a failed save, the target is pushed up to 15 feet directly away from you.",
    rule: Object.freeze({ item: "Pushing Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvPushingAtt" }) }),
  "disarming-attack": Object.freeze({ feature: "Disarming Attack", group: "combat-superiority", save: true,
    line: "Played at the table: on a failed save, the target drops one object of your choice, which lands in its space.",
    rule: Object.freeze({ item: "Disarming Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvDisarmingA" }) }),
  "distracting-strike": Object.freeze({ feature: "Distracting Strike", group: "combat-superiority", effects: true,
    rule: Object.freeze({ item: "Distracting Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvDistractin" }) }),
  "maneuvering-attack": Object.freeze({ feature: "Maneuvering Attack", group: "combat-superiority",
    line: "Played at the table: choose a willing creature who can see or hear you; it can use its Reaction to move up to half its Speed without provoking an Opportunity Attack from the target.",
    rule: Object.freeze({ item: "Maneuvering Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvManeuverin" }) }),
  "sweeping-attack": Object.freeze({ feature: "Sweeping Attack", group: "combat-superiority", mode: "sweep", melee: true,
    rule: Object.freeze({ item: "Sweeping Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvSweepingAt" }) }),
  // Any attack roll that hits and deals damage — weapon, unarmed or spell. No die: the press is the boon.
  "hills-tumble": Object.freeze({ feature: "Hill's Tumble", group: "giant-ancestry", press: "prone", maxSize: "lg",
    rule: Object.freeze({ item: "Hill's Tumble", uuid: "Compendium.dnd-players-handbook.origins.Item.phbsptHillsTumbl" }) }),
  // A2 — the Monk. Stunning Strike's save activity is the cost (1 Focus Point); the save's success half is
  // SAVE_PRESSES' `success` (the pack marks Slowed failure-only).
  "stunning-strike": Object.freeze({ feature: "Stunning Strike", group: "monks-focus", save: true, noDie: true, oncePerTurn: true, weapons: "monk",
    rule: Object.freeze({ item: "Stunning Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkStunningSt" }) }),
  // B4 — Physician's Touch: its own Hand of Harm activity carries "Poisoned (Hand of Harm)"; it lands with the ride until the
  // end of the monk's next turn (the `vex` window) when the feature is on the sheet.
  "hand-of-harm": Object.freeze({ feature: "Hand of Harm", group: "monks-focus", oncePerTurn: true, unarmed: true, ownType: true,
    also: Object.freeze({ feature: "Physician's Touch", activity: "Hand of Harm", clock: "vex" }),
    rule: Object.freeze({ item: "Hand of Harm", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkHandOfHarm" }) }),
  "open-hand-addle": Object.freeze({ feature: "Open Hand Technique", group: "open-hand-technique", activity: "Addle", label: "Addle",
    effects: true, noDie: true, only: "flurry",
    rule: Object.freeze({ item: "Open Hand Technique", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkOpenHandTe", benefit: "Addle" }) }),
  "open-hand-push": Object.freeze({ feature: "Open Hand Technique", group: "open-hand-technique", activity: "Push", label: "Push",
    save: true, noDie: true, only: "flurry",
    line: "Played at the table: on a failed save, the target is pushed up to 15 feet away from you.",
    rule: Object.freeze({ item: "Open Hand Technique", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkOpenHandTe", benefit: "Push" }) }),
  "open-hand-topple": Object.freeze({ feature: "Open Hand Technique", group: "open-hand-technique", activity: "Topple", label: "Topple",
    save: true, noDie: true, only: "flurry",
    rule: Object.freeze({ item: "Open Hand Technique", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkOpenHandTe", benefit: "Topple" }) }),
  "elemental-attunement": Object.freeze({ feature: "Elemental Attunement", group: "elemental-attunement", activity: "Elemental Save",
    label: "Push or pull", save: true, noDie: true, only: "own",
    line: "Played at the table: on a failed save, the target is pushed or pulled up to 10 feet (move the token).",
    rule: Object.freeze({ item: "Elemental Attunement", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkElementalA" }) }),
  // A2 — the Psi Warrior: a Psionic Energy Die as Force, once per turn, on a weapon hit.
  // B4 — Telekinetic Adept's Telekinetic Thrust follows the Strike: the Strength save (Prone on a failure, the activity's own
  // effect); the 10-foot push is the table's.
  "psionic-strike": Object.freeze({ feature: "Psionic Power", group: "psionic-power", activity: "Psionic Strike", label: "Psionic Strike",
    oncePerTurn: true, weapon: true, ownType: true,
    follow: Object.freeze({ feature: "Telekinetic Adept", activity: "Telekinetic Thrust",
      line: "Played at the table: on a failed save you may instead push it up to 10 feet in a straight line (move the token)." }),
    rule: Object.freeze({ item: "Psionic Power", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrPsionicPow", benefit: "Psionic Strike" }) }),
  // B3 — the Brutal Strike effects. Forceful Blow is the table's (a line); Hamstring Blow lands the pack's Hamstrung (the
  // damage activity's effect); Improved's two ride the SAME die (`dieFrom` — their item carries utility activities alone):
  // Staggering Blow lands Staggered (EFFECT_BENDS reads it on the next save), Sundering Blow lands Sundered (+5 to the next
  // other creature's attack roll, EFFECT_BENDS `plus`). Each until the start of the barbarian's next turn (`clock: "slow"`).
  "forceful-blow": Object.freeze({ feature: "Brutal Strike", group: "brutal-strike", label: "Forceful Blow", weapon: true,
    line: "Played at the table: the target is pushed 15 feet straight away from you; you may then move up to half your Speed straight toward it without provoking Opportunity Attacks.",
    rule: Object.freeze({ item: "Brutal Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbBrutalStri", benefit: "Forceful Blow" }) }),
  "hamstring-blow": Object.freeze({ feature: "Brutal Strike", group: "brutal-strike", label: "Hamstring Blow", weapon: true, effects: true, clock: "slow",
    rule: Object.freeze({ item: "Brutal Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbBrutalStri", benefit: "Hamstring Blow" }) }),
  "staggering-blow": Object.freeze({ feature: "Improved Brutal Strike", group: "brutal-strike", activity: "Staggering Blow", label: "Staggering Blow",
    weapon: true, effects: true, clock: "slow", dieFrom: "Brutal Strike",
    line: "Played at the table: it can't make Opportunity Attacks until the start of your next turn.",
    rule: Object.freeze({ item: "Improved Brutal Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbImpBrutalS", benefit: "Staggering Blow" }) }),
  "sundering-blow": Object.freeze({ feature: "Improved Brutal Strike", group: "brutal-strike", activity: "Sundering Blow", label: "Sundering Blow",
    weapon: true, effects: true, clock: "slow", dieFrom: "Brutal Strike",
    rule: Object.freeze({ item: "Improved Brutal Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbImpBrutalS", benefit: "Sundering Blow" }) }),
  // B4 — Eldritch Smite: on a pact-weapon hit, once per turn, (1 + pact level)d8 force and Prone if Huge or smaller (a press,
  // no save); the Pact slot the cost. The pact weapon is the one bonded through Pact of the Blade (`pact`).
  "eldritch-smite": Object.freeze({ feature: "Eldritch Smite", group: "eldritch-smite", activity: "Smite", label: "Eldritch Smite",
    oncePerTurn: true, weapon: true, pact: "Pact of the Blade", ownType: true, press: "prone", maxSize: "huge",
    rule: Object.freeze({ item: "Eldritch Smite", uuid: "Compendium.dnd-players-handbook.classes.Item.phbinvEldritchSm" }) }),
  // C1 — Hurl Through Hell: the save activity is the cost (its consumption the feature's use); 8d10 psychic on a failure.
  "hurl-through-hell": Object.freeze({ feature: "Hurl Through Hell", group: "hurl-through-hell", activity: "Hurl Through Hell", label: "Hurl Through Hell",
    save: true, noDie: true, oncePerTurn: true,
    line: "Played at the table: on a failed save the target vanishes to the Lower Planes until the end of your next turn, then returns to the space it left (or the nearest unoccupied one); Regain Use from the sheet spends a Pact slot for another use.",
    rule: Object.freeze({ item: "Hurl Through Hell", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkHurlThroug" }) }),
  // ARCANA UNLEASHED — the Arcane Shot options (`weapons: "ammunition"`: a ranged attack with an Ammunition weapon; `onceKey`:
  // one turn chit for the group). The pack puts each option's dice on its SAVE activity: `saveDice` rides them on the hit's
  // damage roll (the hit creature takes them whatever the save), the save then follows with no dice of its own and no second
  // spend. "Until the start/end of your next turn" is the pack's clock.
  "banishing-shot": Object.freeze({ feature: "Banishing Shot", group: "arcane-shot", save: true, saveDice: true, ownType: true, oncePerTurn: true, onceKey: "arcane-shot", weapons: "ammunition",
    line: "Played at the table: a banished creature has Speed 0 and reappears at the end of its next turn where it left (or the nearest unoccupied space).",
    rule: Object.freeze({ item: "Banishing Shot", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunBanishingShot" }) }),
  "beguiling-shot": Object.freeze({ feature: "Beguiling Shot", group: "arcane-shot", save: true, saveDice: true, ownType: true, oncePerTurn: true, onceKey: "arcane-shot", weapons: "ammunition",
    line: "Played at the table: you or an ally within 30 feet of the target is the charmer; the Charmed ends early if the charmer attacks it, damages it or forces it to save.",
    rule: Object.freeze({ item: "Beguiling Shot", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunBeguilingShot" }) }),
  "bursting-shot": Object.freeze({ feature: "Bursting Shot", group: "arcane-shot", oncePerTurn: true, onceKey: "arcane-shot", weapons: "ammunition", ownType: true,
    line: "Played at the table: each other creature within a 10-foot Emanation of the target takes the same Force damage.",
    rule: Object.freeze({ item: "Bursting Shot", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunBurstingShot0" }) }),
  "enfeebling-shot": Object.freeze({ feature: "Enfeebling Shot", group: "arcane-shot", save: true, saveDice: true, ownType: true, oncePerTurn: true, onceKey: "arcane-shot", weapons: "ammunition",
    line: "Played at the table: while Poisoned this way, its hits deal one roll of your Arcane Shot Die less damage.",
    rule: Object.freeze({ item: "Enfeebling Shot", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunEnfeeblingSho" }) }),
  "grasping-shot": Object.freeze({ feature: "Grasping Shot", group: "arcane-shot", save: true, saveDice: true, ownType: true, oncePerTurn: true, onceKey: "arcane-shot", weapons: "ammunition",
    line: "Played at the table: the brambles hold for 1 minute or until you use this option again; the Escape Check (Athletics against your Arcane Shot DC) is the sheet's.",
    rule: Object.freeze({ item: "Grasping Shot", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunGraspingShot0" }) }),
  "shadow-shot": Object.freeze({ feature: "Shadow Shot", group: "arcane-shot", save: true, saveDice: true, ownType: true, oncePerTurn: true, onceKey: "arcane-shot", weapons: "ammunition",
    rule: Object.freeze({ item: "Shadow Shot", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunShadowShot000" }) })
});


/**
 * The Battle Master's BONUS ACTION maneuvers: a use landing on a sheet, two with a die riding the next hit.
 *   use     the activity pressed, by name (`use()` consumes the pool)
 *   bonus   { key, window, what } — the rolled number as a change on the fighter's chip (the pack's has none)
 *   choice  { effectPrefix, what } — the pack's "+N" effect on whoever the fighter picks
 *   chip    { window } — a chip on the fighter;  rider  { melee?, caveat? } — the die rides the next hit
 *   marker  { effect } — the pack's effect on the TARGET, the fighter as source (EFFECT_BENDS `only`)
 * Membership: the Superiority Uses list. Rally needs no row (a heal the cast path lands).
 */
export const SUPERIORITY_USES = Object.freeze({
  "Evasive Footwork": Object.freeze({ use: "Evade", bonus: Object.freeze({ key: "system.attributes.ac.bonus", window: "sap", what: "AC" }),
    rule: Object.freeze({ item: "Evasive Footwork", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvEvasiveFoo" }),
    from: "Fighter — Battle Master" }),
  "Bait and Switch": Object.freeze({ use: "Switch Places", choice: Object.freeze({ effectPrefix: "Baited AC +", what: "AC" }),
    rule: Object.freeze({ item: "Bait and Switch", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvBaitandSwi" }),
    from: "Fighter — Battle Master" }),
  "Lunging Attack": Object.freeze({ use: "Damage", chip: Object.freeze({ window: "steadyAim" }), rider: Object.freeze({ melee: true, caveat: "if you moved at least 5 feet in a straight line just before the hit" }),
    rule: Object.freeze({ item: "Lunging Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvLungingAtt" }),
    from: "Fighter — Battle Master" }),
  "Feinting Attack": Object.freeze({ use: "Damage", marker: Object.freeze({ effect: "Feinting Attack" }), rider: Object.freeze({}),
    rule: Object.freeze({ item: "Feinting Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvFeintingAt" }),
    from: "Fighter — Battle Master" })
});


/** Maneuvers adding the die to a D20 Test: the `tactical` d20 fold with the text's scope (skills,
 * Initiative), which tells them from Tactical Mind. No refund — the die is spent either way. */
export const SUPERIORITY_FOLDS = Object.freeze({
  "Ambush": Object.freeze({ skills: Object.freeze(["ste"]), initiative: true,
    rule: Object.freeze({ item: "Ambush", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvAmbush0000" }) }),
  "Tactical Assessment": Object.freeze({ skills: Object.freeze(["his", "inv", "ins"]), initiative: false,
    rule: Object.freeze({ item: "Tactical Assessment", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvTacticalAs" }) }),
  "Commanding Presence": Object.freeze({ skills: Object.freeze(["itm", "prf", "per"]), initiative: false,
    rule: Object.freeze({ item: "Commanding Presence", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvCommanding" }) })
});

/** B4 — a `tactical` fold that is NOT a maneuver: the feature's own uses through its activity, with the text's own
 * D20 Tests (`tests`) — the `tests` facet the plan held for its first customer. No refund clause (Tactical Mind's alone).
 *   activity  the activity BY NAME (its `roll` the die);  weapon  the attack's item must be this (a name prefix — Homing
 *             Strikes on the Psychic Blades only);  tests  which D20 Tests, "attack" offered on a MISS (Precision's window) */
export const TACTICAL_FOLDS = Object.freeze({
  "Dark One's Own Luck": Object.freeze({ tests: Object.freeze(["check", "save"]), activity: "Luck",
    rule: Object.freeze({ item: "Dark One's Own Luck", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkDarkOnesOw" }),
    from: "Warlock — Fiend Patron 6" }),
  "Soul Blades": Object.freeze({ tests: Object.freeze(["attack"]), activity: "Homing Strikes", weapon: "Psychic Blade",
    rule: Object.freeze({ item: "Soul Blades", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeSoulBlades", benefit: "Homing Strikes" }),
    from: "Rogue — Soulknife 9" }),
  // C1 — Peerless Skill: the bard's OWN failed check or attack roll, the Bardic die added — the activity's roll is the die,
  // its consumption a Bardic Inspiration use (the pool by uuid).
  "Peerless Skill": Object.freeze({ tests: Object.freeze(["check", "attack"]), activity: "Use",
    rule: Object.freeze({ item: "Peerless Skill", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdPeerlessSk" }),
    from: "Bard — College of Lore 14" })
});

/** B3 — a die that STANDS IN for a Superiority Die (Relentless): with none of `pool` left, once per turn, `die` rides in the
 * die's place and nothing is spent (lookup.js `superiorityStandIn`, the hit menu's rider). Offered only at an EMPTY pool
 * (RULINGS *The PHB classes — B3*): with dice left the module spends one. */
export const SUPERIORITY_STAND_INS = Object.freeze({
  "Relentless": Object.freeze({ die: "1d8", pool: "Combat Superiority",
    rule: Object.freeze({ item: "Relentless", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrRelentless" }),
    from: "Fighter — Battle Master 15" })
});

/** Every Battle Master maneuver, lower-cased: their damage activities are the DIE (damage-casts.js skips them). */
export const MANEUVER_FEATURE_NAMES = new Set([
  ...Object.values(HIT_OPTIONS).map(r => r.feature), ...Object.keys(SUPERIORITY_USES), ...Object.keys(SUPERIORITY_FOLDS),
  "Commander's Strike", "Precision Attack", "Riposte", "Parry", "Rally"
].map(n => n.toLowerCase()));

/**
 * A persistent area attached to a token, its effect on the creatures inside (DESIGN §4). A Region attached
 * to the token moves with it and raises enter / exit / turn events (`RegionDocument.createTokenEmanation`
 * builds the token-plus-radius shape). The pack ships each aura's effect; who is inside is the module's.
 *   kind       "feature" (on while the source's token is on the scene and the range resolves) | "spell"
 *              (the system's template adopted, attached to the caster, ending with it) | "area" (the spells
 *              slice: the system's template adopted where it was PLACED, attached to nothing;
 *              the caster drags it, the platform raises enter for whoever it now covers; ends with the
 *              concentration). An `area` row's activity may be plain DAMAGE (Cloud of Daggers): no save,
 *              the trigger rolls it on the caster and applies it, receipted
 *   reach      "helpful" (allies and neutrals) | "harmful" (enemies) | "all" | "summoner" (only the creature that
 *              summoned the bearer: Conjure Animals' Strength save Advantage for the conjurer)
 *   range      null: the activity's size · a formula read off the SOURCE's roll data — ⚠ never a number for
 *              a class-scaled feature (N1) · "weaponReach": the held weapon's (10 with Reach, else 5)
 *   effect     the pack's effect by name, its changes RESOLVED against the source (else each member adds
 *              its own Charisma); null: a ring and a card only
 *   trigger    a save demanded `on` "enter", "turnEnd" and/or "turnStart" (a monster's aura: "any creature
 *              that starts its turn in"), `oncePerTurn`; the activity's save judges; `types` narrows who is
 *              asked to those creature types (Vile Appearance's Beasts and Humanoids). A row with no standing
 *              `effect` lets the verdict land the activity's own failure effect (Frightened, Poisoned).
 *              `on: "move"` (Spike Growth): the activity's plain damage per `per` feet a creature MOVES
 *              inside the area, paid once per movement when the move lands — never a pause (DESIGN §8)
 *   band       an `area` whose burning side is `feet` wide on ONE side of the wall it was placed as (Wall of
 *              Fire): the region is widened by the band on the side away from the caster, and the cast's
 *              card offers the other side (`ask`); a ring burns outside by default, inside on the ask
 *   ask        an `area` cast asks the caster to pick from `options` (Magic Circle's creature types) on the
 *              cast's card — every option on by default, toggled there; the picks live on the region
 *   gate       the attack gate reads the area: a creature of a chosen type (`types: "chosen"`) attacking a
 *              target INSIDE it rolls at `attacker` (Magic Circle's Disadvantage; reminders.js)
 *   noCastSave the cast's own save activity demands nothing at the placement (Magic Circle's Charisma save
 *              is for a teleport in, never for standing inside)
 *   heal       a heal paid `on` "turnStart" `when` "zeroHP" from `activity`
 *   remind     a notice at the source's turn start naming an AIMED heal — offered, never played (R1)
 *   holding    the ring stands only while a qualifying weapon is held (`base`, or every `properties`)
 *   alert      a reminder to the source when a reached creature itself MOVES INTO the ring (tokenMoveIn),
 *              or `on: "moveOut"` OUT of it, or `on: "turnStart"` STARTS ITS TURN inside it (Unnerving Gaze);
 *              `kind: "notice"` a plain card with `says` (no Reaction, no
 *              button — Magic Circle's entry ban, Forcecage's exit ban); `types: "chosen"` only the asked types.
 *              A monster's Reaction (Pursuit, Shriek, Watery Rebuke): the response is the activity's, from the sheet
 *   incapacitated  inactive while the source is Incapacitated;  quiet  no card
 *   item / activity / while / pulse   see the Inner Radiance row (`while` may list several — every one must
 *              stand: the Wolf's "Rage of the Wolf" AND the Rage); a `pulse` with `activity: null` rolls the
 *              item's first damage activity at the bearer's turn END (the fire auras — the GM's side)
 *   a `pulse` whose activity is a SAVE (Unnerving Aura) demands it of everyone inside instead of rolling damage
 * Membership: the Emanations list. What is left out on purpose: RULINGS *Emanations*.
 */
export const EMANATIONS = Object.freeze({
  "Aura of Protection": Object.freeze({ kind: "feature", reach: "helpful", range: "@scale.paladin.aura", effect: "Protected", incapacitated: true,
    rule: Object.freeze({ item: "Aura of Protection", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnProtection" }),
    from: "Paladin 6" }),
  "Aura of Courage": Object.freeze({ kind: "feature", reach: "helpful", range: "@scale.paladin.aura", effect: "Courageous", incapacitated: true,
    caveat: "the pack's effect carries no change — add Immunity to Frightened to it at the world",
    rule: Object.freeze({ item: "Aura of Courage", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnCourageAur" }),
    from: "Paladin 10" }),
  "Aura of Warding": Object.freeze({ kind: "feature", reach: "helpful", range: "@scale.paladin.aura", effect: "Aura of Warding", incapacitated: true,
    rule: Object.freeze({ item: "Aura of Warding", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnWardingAur" }),
    from: "Paladin — Oath of the Ancients 7" }),
  "Spirit Guardians": Object.freeze({ kind: "spell", reach: "harmful", range: null, effect: "Half Speed", incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    rule: Object.freeze({ item: "Spirit Guardians", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplSpiritGuar" }),
    from: "Cleric spell, level 3 (Concentration, 10 minutes)" }),
  "Aura of Life": Object.freeze({ kind: "spell", reach: "helpful", range: null, effect: "Aura of Life", incapacitated: false,
    heal: Object.freeze({ on: "turnStart", when: "zeroHP", activity: "Create Aura" }),
    caveat: "the pack's effect carries the Necrotic Resistance; \"Hit Point maximums can't be reduced\" is the table's",
    rule: Object.freeze({ item: "Aura of Life", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplAuraofLife" }),
    from: "Paladin spell, level 4 (Concentration, 10 minutes)" }),
  "Aura of Purity": Object.freeze({ kind: "spell", reach: "helpful", range: null, effect: "Aura of Purity", incapacitated: false,
    caveat: "the pack's effect carries the Poison Resistance; the Advantage on saves against those conditions is the save gate's (Effect Sources — Aura of Purity)",
    rule: Object.freeze({ item: "Aura of Purity", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplAuraofPuri" }),
    from: "Paladin spell, level 4 (Concentration, 10 minutes)" }),
  "Aura of Vitality": Object.freeze({ kind: "spell", reach: "helpful", range: null, effect: null, incapacitated: false,
    remind: Object.freeze({ on: "sourceTurnStart", activity: "Start of Turn Heal" }),
    caveat: "the heal is AIMED — a choice: the card at the start of your turn offers it, and never plays it",
    rule: Object.freeze({ item: "Aura of Vitality", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplAuraofVita" }),
    from: "Cleric / Druid / Paladin spell, level 3 (Concentration, 1 minute)" }),
  "Antilife Shell": Object.freeze({ kind: "spell", reach: "harmful", range: null, effect: null, incapacitated: false,
    caveat: "a barrier, not an effect — the ring is drawn for the table to honour",
    rule: Object.freeze({ item: "Antilife Shell", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplAntilifeSh" }),
    from: "Druid spell, level 5 (Concentration, 1 hour)" }),
  "Circle of Power": Object.freeze({ kind: "spell", reach: "helpful", range: null, effect: "Circle's Power", incapacitated: false,
    caveat: "the pack's effect carries no change — the Advantage on saves against spells is the save gate's, and a success against half-on-save spell damage takes none (Effect Sources — Circle's Power)",
    rule: Object.freeze({ item: "Circle of Power", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplCircleofPo" }),
    from: "Cleric / Paladin spell, level 5 (Concentration, 10 minutes)" }),
  "Crusader's Mantle": Object.freeze({ kind: "spell", reach: "helpful", range: null, effect: "Crusader’s Mantle", incapacitated: false,
    rule: Object.freeze({ item: "Crusader's Mantle", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplCrusadersM" }),
    from: "Paladin spell, level 3 (Concentration, 1 minute)" }),
  "Holy Aura": Object.freeze({ kind: "spell", reach: "helpful", range: null, effect: "Holy Protection", incapacitated: false,
    caveat: "the pack's effect carries the Advantage on saves (the save gate says so) and the attack gate reads attackers' Disadvantage off it (Effect Sources — Holy Protection); the Fiend/Undead save on a melee hit is the table's",
    rule: Object.freeze({ item: "Holy Aura", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplHolyAura00" }),
    from: "Cleric spell, level 8 (Concentration, 1 minute)" }),
  // The pack's spell has no area (Errata 5e E-003 gives it the 30-foot Emanation).
  "Pass without Trace": Object.freeze({ kind: "spell", reach: "helpful", range: null, effect: "Concealed", incapacitated: false,
    caveat: "the pack's effect carries the +10 to Stealth; \"leave no tracks\" is the table's",
    rule: Object.freeze({ item: "Pass without Trace", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplPasswithou" }),
    from: "Druid / Ranger spell, level 2 (Concentration, 1 hour); the Wood Elf's lineage at character level 5" }),
  // Stands only while `while` stands on the bearer (landed by token-lights), reaches everyone, and pays the
  // activity's damage at the bearer's turn END (`pulse`), rolled once. ⚠ The pack models the pulse as
  // damage on use; the use here is the transform alone.
  "Inner Radiance": Object.freeze({ kind: "feature", item: "Celestial Revelation", activity: "Inner Radiance", while: "Searing Radiance",
    reach: "all", range: null, effect: null, incapacitated: false,
    pulse: Object.freeze({ on: "sourceTurnEnd", activity: "Inner Radiance" }),
    rule: Object.freeze({ item: "Celestial Revelation", uuid: "Compendium.dnd-players-handbook.origins.Item.phbsptCelestialR", benefit: "Inner Radiance" }),
    from: "Aasimar — Celestial Revelation (character level 3)" }),
  // The Wolf (the pick at the Rage, EFFECT_CHOICES): the pack's own "Rage of the Wolf" worn by the enemies within 5 ft;
  // EFFECT_BENDS reads the member copies alone (`member`), for everyone but the barbarian (`except: "source"`).
  "Rage of the Wolf": Object.freeze({ kind: "feature", item: "Rage of the Wilds", while: Object.freeze(["Rage of the Wolf", "Rage"]),
    reach: "harmful", range: 5, effect: "Rage of the Wolf", incapacitated: false, quiet: true,
    rule: Object.freeze({ item: "Rage of the Wilds", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbRageOfTheW", benefit: "Wolf" }),
    from: "Barbarian — Path of the Wild Heart 3" }),
  // An invisible ring at the held weapon's reach; a hostile moving in raises the reminder (attack from the sheet).
  "Polearm Master": Object.freeze({ kind: "feature", reach: "harmful", range: "weaponReach", effect: null, incapacitated: true, quiet: true,
    holding: Object.freeze({ base: Object.freeze(["quarterstaff", "spear"]), properties: Object.freeze(["hvy", "rch"]) }),
    alert: Object.freeze({ on: "moveIn", label: "Reactive Strike",
      swing: "Take your <strong>Reaction</strong> to make one melee attack at it, from the sheet." }),
    rule: Object.freeze({ item: "Polearm Master", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftPolearmMast", benefit: "Reactive Strike" }),
    from: "General feat" }),
  // THE AREAS THAT PULSE (the spells slice, Tier 3; RULINGS *The spells slice — Tier 3*): the
  // 2024 text of each is "enters the area or ends its turn there", "when the area moves into its space",
  // "only once per turn" — Spirit Guardians' trigger to the word. Reach "all": every creature, the caster too.
  "Moonbeam": Object.freeze({ kind: "area", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    caveat: "the Magic action that moves the beam is the caster's drag of the template; a shape-shifter's reversion is the table's",
    rule: Object.freeze({ item: "Moonbeam", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplMoonbeam00" }),
    from: "Druid spell, level 2 (Concentration, 1 minute)" }),
  "Insect Plague": Object.freeze({ kind: "area", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    caveat: "Lightly Obscured and Difficult Terrain are the table's",
    rule: Object.freeze({ item: "Insect Plague", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplInsectPlag" }),
    from: "Cleric / Druid / Sorcerer spell, level 5 (Concentration, 10 minutes)" }),
  "Cloudkill": Object.freeze({ kind: "area", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    caveat: "the fog's own drift (10 feet away from you at the start of each of your turns) is the caster's drag; Heavily Obscured is the table's",
    rule: Object.freeze({ item: "Cloudkill", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplCloudkill0" }),
    from: "Sorcerer / Wizard spell, level 5 (Concentration, 10 minutes)" }),
  // No save: the pack's activity is plain damage, rolled on the caster and applied at each trigger (ruled automatic, R1).
  "Cloud of Daggers": Object.freeze({ kind: "area", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    caveat: "the Magic action that teleports the Cube is the caster's drag of the template",
    rule: Object.freeze({ item: "Cloud of Daggers", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplCloudofDag" }),
    from: "Bard / Sorcerer / Warlock / Wizard spell, level 2 (Concentration, 1 minute)" }),
  // A SUMMON: the sphere is a token of the pack's own actor, and "within 5 feet of the sphere" is a feature
  // ring around it — today's kind. Its `Flames` carries the save (the summon matches the caster's DC).
  "Flaming Sphere": Object.freeze({ kind: "feature", item: "Flames", reach: "all", range: 5, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    caveat: "the Bonus Action that rolls the sphere is its token's move; a creature it is rolled into is entered",
    rule: Object.freeze({ item: "Flaming Sphere", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplFlamingSph" }),
    from: "Druid / Sorcerer / Wizard spell, level 2 (Concentration, 1 minute)" }),
  // THE HELD SPELLS (RULINGS *The spells slice — the held spells*). The wall's one burning side is a BAND
  // the region is widened by; the cast's own save (everyone in the wall as it appears) is the pack's.
  "Wall of Fire": Object.freeze({ kind: "area", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    band: Object.freeze({ feet: 10, ask: "Which side of the wall burns?" }),
    caveat: "the wall is opaque and 20 feet high — the table's; the burning side is the region as widened, flip it on the cast's card",
    rule: Object.freeze({ item: "Wall of Fire", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplWallofFire" }),
    from: "Druid / Sorcerer / Wizard spell, level 4 (Concentration, 1 minute)" }),
  // Damage per 5 feet MOVED inside the area, paid when the move lands (DESIGN §4's second exception).
  "Spike Growth": Object.freeze({ kind: "area", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["move"]), per: 5 }),
    caveat: "Difficult Terrain, and the Wisdom (Perception or Survival) check to see the spikes, are the table's",
    rule: Object.freeze({ item: "Spike Growth", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplSpikeGrowt" }),
    from: "Druid / Ranger spell, level 2 (Concentration, 10 minutes)" }),
  // The circle stands its hour where placed (no concentration: the GM deletes the region when the hour is up).
  "Magic Circle": Object.freeze({ kind: "area", reach: "all", range: null, effect: null, incapacitated: false, noCastSave: true,
    ask: Object.freeze({ what: "types", label: "Which creature types does the circle ward against?",
      options: Object.freeze(["celestial", "elemental", "fey", "fiend", "undead"]) }),
    gate: Object.freeze({ attacker: "disadvantage", types: "chosen" }),
    alert: Object.freeze({ on: "moveIn", kind: "notice", label: "Magic Circle", types: "chosen",
      says: "cannot willingly enter the circle by nonmagical means — a teleport in needs a Charisma save (the spell's own)" }),
    caveat: "possession, and Charmed or Frightened from a warded type, are the table's; the circle stands its hour until the region is deleted; the reversed circle (kept in) is the table's",
    rule: Object.freeze({ item: "Magic Circle", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplMagicCircl" }),
    from: "Cleric / Paladin / Warlock / Wizard spell, level 3 (1 hour)" }),
  "Forcecage": Object.freeze({ kind: "area", reach: "all", range: null, effect: null, incapacitated: false,
    alert: Object.freeze({ on: "moveOut", kind: "notice", label: "Forcecage",
      says: "leaves the cage — the walls hold it; a teleport out needs a Charisma save (the spell's own), and a failure wastes the action" }),
    caveat: "the bars' cover, spells cast through the bars, and the solid box blocking spells are the table's; the cage stands its hour with the concentration",
    rule: Object.freeze({ item: "Forcecage", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplForcecage0" }),
    from: "Bard / Warlock / Wizard spell, level 7 (Concentration, 1 hour)" }),
  // THE GM'S SIDE — a monster's aura, "any creature that starts its turn in the Emanation" (RULINGS *The GM's
  // side — the aura rows*): the pack's save activity carries the Emanation and the failure's condition; nothing
  // stands on a member (`effect: null`), the verdict lands the failure. A success's "immune for 24 hours / 1
  // hour" is the table's. `incapacitated` where the text says so.
  "Fear Aura": Object.freeze({ kind: "feature", reach: "harmful", range: null, effect: null, incapacitated: true,
    trigger: Object.freeze({ on: Object.freeze(["turnStart"]), oncePerTurn: true }),
    caveat: "a success's 24-hour immunity to this aura is the table's",
    rule: Object.freeze({ item: "Fear Aura", uuid: "Compendium.dnd-monster-manual.features.Item.mmFearAura000000" }),
    from: "monsters" }),
  "Fetid Aura": Object.freeze({ kind: "feature", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["turnStart"]), oncePerTurn: true }),
    caveat: "\"an action or a Bonus Action, not both\" while Poisoned is the table's",
    rule: Object.freeze({ item: "Fetid Aura", uuid: "Compendium.dnd-monster-manual.features.Item.mmFetidAura00000" }),
    from: "monsters (swarms)" }),
  "Stench": Object.freeze({ kind: "feature", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["turnStart"]), oncePerTurn: true }),
    caveat: "\"other than a troglodyte\", and a success's 1-hour immunity to every troglodyte's Stench, are the table's",
    rule: Object.freeze({ item: "Stench", uuid: "Compendium.dnd-monster-manual.features.Item.mmStench00000000" }),
    from: "monsters (troglodytes)" }),
  // No Emanation on the activity — "within 30 feet" is its range; only Beasts and Humanoids are asked.
  "Vile Appearance": Object.freeze({ kind: "feature", reach: "all", range: 30, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["turnStart"]), oncePerTurn: true, types: Object.freeze(["beast", "humanoid"]) }),
    caveat: "\"can see its true form\" and a success's 24-hour immunity are the table's",
    rule: Object.freeze({ item: "Vile Appearance", uuid: "Compendium.dnd-monster-manual.features.Item.mmVileAppearance" }),
    from: "monsters (hags)" }),
  // "Initial Save" carries the Emanation; the failure's pick (Captivated, Fearful, Mired) is the GM's from the sheet.
  "Lordly Presence": Object.freeze({ kind: "feature", activity: "Initial Save", reach: "harmful", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["turnStart"]), oncePerTurn: true }),
    caveat: "the failure's pick — Captivated, Fearful or Mired — is used from the sheet; a success's 24-hour immunity is the table's",
    rule: Object.freeze({ item: "Lordly Presence", uuid: "Compendium.dnd-monster-manual.features.Item.mmLordlyPresence" }),
    from: "monsters" }),
  // A ring and a card: the pack's utility activity carries the Emanation and no effect.
  "Aura of Authority": Object.freeze({ kind: "feature", activity: "Expend Use", reach: "helpful", range: null, effect: null, incapacitated: true,
    caveat: "the Advantage on attack rolls and saving throws of the bearer and its allies inside is the table's",
    rule: Object.freeze({ item: "Aura of Authority", uuid: "Compendium.dnd-monster-manual.features.Item.mmAuraOfAuthorit" }),
    from: "monsters" }),
  // THE GM'S SIDE, the waiting rows (RULINGS *The Monster Manual — the waiting rows built*). The bearer's turn-end
  // pulse (Inner Radiance's shape): "at the end of each of its turns, each creature in the Emanation takes…" — the
  // damage activity carries the Emanation, rolled once on the bearer, landed on everyone inside.
  // Conjure Animals' pack (RULINGS *Summons*, call 41): the pack's own two features, on the summoned token.
  "Pack Damage": Object.freeze({ kind: "feature", reach: "harmful", range: "10", effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    caveat: "\"you can force\" reads as every enemy the pack reaches; the pack moving onto a creature is its entry",
    rule: Object.freeze({ item: "Conjure Animals", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplConjureAni" }),
    from: "Conjure Animals (the pack)" }),
  "Grant Save Advantage": Object.freeze({ kind: "feature", reach: "summoner", range: "5", effect: "Strength Save Advantage", incapacitated: false,
    rule: Object.freeze({ item: "Conjure Animals", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplConjureAni" }),
    from: "Conjure Animals (the pack)" }),
  "Fire Aura": Object.freeze({ kind: "feature", reach: "harmful", range: null, effect: null, incapacitated: false,
    pulse: Object.freeze({ on: "sourceTurnEnd", activity: null }),
    caveat: "\"of the bearer's choice\" reads as its enemies; a friend inside is spared — the table's",
    rule: Object.freeze({ item: "Fire Aura", uuid: "Compendium.dnd-monster-manual.features.Item.mmFireAura000000" }),
    from: "monsters" }),
  "Flame Aura": Object.freeze({ kind: "feature", reach: "all", range: null, effect: null, incapacitated: false,
    pulse: Object.freeze({ on: "sourceTurnEnd", activity: null }),
    rule: Object.freeze({ item: "Flame Aura", uuid: "Compendium.dnd-monster-manual.features.Item.mmFlameAura00000" }),
    from: "monsters" }),
  "Heat Aura": Object.freeze({ kind: "feature", reach: "all", range: null, effect: null, incapacitated: false,
    pulse: Object.freeze({ on: "sourceTurnEnd", activity: null }),
    caveat: "\"each creature that isn't an azer\" — a kin inside is spared, the table's",
    rule: Object.freeze({ item: "Heat Aura", uuid: "Compendium.dnd-monster-manual.features.Item.mmHeatAura000000" }),
    from: "monsters (azers)" }),
  // The turn-start ring (Stench's shape): the save demanded of a creature starting its turn inside; the d8 the GM's.
  "Gibbering": Object.freeze({ kind: "feature", reach: "all", range: null, effect: null, incapacitated: true,
    trigger: Object.freeze({ on: Object.freeze(["turnStart"]), oncePerTurn: true }),
    caveat: "the failure's d8 — what the target does this turn — is the GM's from the sheet",
    rule: Object.freeze({ item: "Gibbering", uuid: "Compendium.dnd-monster-manual.features.Item.mmGibbering00000" }),
    from: "monsters (gibbering mouther)" }),
  // The alerts (Polearm Master's shape): an invisible ring at the trigger's range; a creature moving in — or
  // starting its turn inside — raises the reminder; the Reaction's response is the activity's, from the sheet.
  "Pursuit": Object.freeze({ kind: "feature", reach: "harmful", range: 120, effect: null, incapacitated: true, quiet: true,
    alert: Object.freeze({ on: "moveIn", label: "Pursuit", swing: "Take your <strong>Reaction</strong> to use Pursuit — Teleport to a space near it, from the sheet." }),
    caveat: "\"ends its move within 120 feet\" — a creature passing through is alerted too; whether its move ended is the GM's",
    rule: Object.freeze({ item: "Pursuit", uuid: "Compendium.dnd-monster-manual.features.Item.mmPursuit0000000" }),
    from: "monsters" }),
  "Shriek": Object.freeze({ kind: "feature", reach: "all", range: 30, effect: null, incapacitated: true, quiet: true,
    alert: Object.freeze({ on: "moveIn", label: "Shriek", swing: "Take your <strong>Reaction</strong> to use Shriek, from the sheet." }),
    caveat: "a source of Bright Light moving in is the table's (a token is a creature)",
    rule: Object.freeze({ item: "Shriek", uuid: "Compendium.dnd-monster-manual.features.Item.mmShriek00000000" }),
    from: "monsters (shriekers)" }),
  "Watery Rebuke": Object.freeze({ kind: "feature", reach: "harmful", range: 5, effect: null, incapacitated: true, quiet: true,
    alert: Object.freeze({ on: "moveIn", label: "Watery Rebuke", swing: "Take your <strong>Reaction</strong> to use Watery Rebuke at it — a Strength save, the cold and the push, from the sheet." }),
    rule: Object.freeze({ item: "Watery Rebuke", uuid: "Compendium.dnd-monster-manual.features.Item.mmWateryRebuke00" }),
    from: "monsters (marids)" }),
  "Unnerving Gaze": Object.freeze({ kind: "feature", reach: "harmful", range: 30, effect: null, incapacitated: true, quiet: true,
    alert: Object.freeze({ on: "turnStart", label: "Unnerving Gaze", swing: "Take your <strong>Reaction</strong> to use Unnerving Gaze at it — a Wisdom save, from the sheet." }),
    caveat: "\"can see the bearer\" and a success's 24-hour immunity are the table's",
    rule: Object.freeze({ item: "Unnerving Gaze", uuid: "Compendium.dnd-monster-manual.features.Item.mmUnnervingGaze0" }),
    from: "monsters" }),
  // THE PHB CLASSES — B5 (RULINGS *The PHB classes — B5*): the band-B emanation rows on the shapes above.
  // Unnerving Gaze's alert, standing only while the Rage does (the Wolf's `while`): a hostile STARTING its turn
  // within 30 ft raises the reminder; the Reaction's Strength save, its Speed 0 and the teleport are the
  // activity's, from the sheet. "A creature you can see" is not judged (the bends register).
  "Branches of the Tree": Object.freeze({ kind: "feature", reach: "harmful", range: 30, effect: null, incapacitated: true, quiet: true,
    while: "Rage",
    alert: Object.freeze({ on: "turnStart", label: "Branches of the Tree",
      swing: "Take your <strong>Reaction</strong> to use Branches of the Tree at it — a Strength save, its Speed 0 and the teleport, from the sheet." }),
    caveat: "\"a creature you can see\" is the table's",
    rule: Object.freeze({ item: "Branches of the Tree", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbBranchesOf" }),
    from: "Barbarian — Path of the World Tree 6" }),
  // Reactive Strike's alert at 5 ft with `on: "turnEnd"` (new): an ENEMY ending its turn beside the bard raises the
  // reminder; the Reaction's Move (a use of Bardic Inspiration) and the ally's move are the players', from the sheet.
  "Inspiring Movement": Object.freeze({ kind: "feature", reach: "harmful", range: 5, effect: null, incapacitated: true, quiet: true,
    alert: Object.freeze({ on: "turnEnd", label: "Inspiring Movement",
      swing: "Take your <strong>Reaction</strong> and a use of Bardic Inspiration: you move up to half your Speed, then one ally within 30 ft may too — no Opportunity Attacks; the Move, from the sheet." }),
    caveat: "\"an enemy you can see\" is the table's",
    rule: Object.freeze({ item: "Inspiring Movement", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdInspiringM" }),
    from: "Bard — College of Dance 6" }),
  // Inner Radiance's shape (a ring while the use's effect stands) with a PICK instead of a pulse: once on each of the
  // druid's turns ONE creature inside is chosen — the card at the turn start lists who stands inside, the pick demands
  // the activity's Constitution save (the cold rolled on a failure). The push is a line on the verdict, the token the table's.
  "Wrath of the Sea": Object.freeze({ kind: "feature", reach: "all", range: "@scale.sea.wrath-range", effect: null, incapacitated: true,
    while: "Manifesting Ocean Spray",
    pick: Object.freeze({ on: "sourceTurnStart", activity: "Bonus Action Save", says: "pushed up to 15 feet away from you if Large or smaller — move the token" }),
    caveat: "\"a creature you can see\" is the table's; the push is the table's move of the token",
    rule: Object.freeze({ item: "Wrath of the Sea", uuid: "Compendium.dnd-players-handbook.classes.Item.phbdrdWrathOfThe" }),
    from: "Druid — Circle of the Sea 3" }),
  // Aura of Courage's row, the condition swapped: the pack's "Devoted" carries no change either.
  "Aura of Devotion": Object.freeze({ kind: "feature", reach: "helpful", range: "@scale.paladin.aura", effect: "Devoted", incapacitated: true,
    caveat: "the pack's effect carries no change — add Immunity to Charmed to it at the world",
    rule: Object.freeze({ item: "Aura of Devotion", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnDevotionAu" }),
    from: "Paladin — Oath of Devotion 7" }),
  // THE PHB CLASSES — C1 (RULINGS *The PHB classes — C1*).
  // Power of the Wilds' Lion (the pick at the Rage, EFFECT_CHOICES): Rage of the Wolf's ring, standing while the Rage AND
  // the Lion chip do; the pack ships NO member effect, so the module MAKES one (`made` — a bare effect of that name) and
  // EFFECT_BENDS "Power of the Wilds: Lion" reads the member copies: the enemies inside attack anyone but the barbarian
  // at Disadvantage (`except: "source"` is the exemption for the rager as target).
  "Power of the Wilds": Object.freeze({ kind: "feature", while: Object.freeze(["Rage", "Power of the Wilds: Lion"]),
    reach: "harmful", range: 5, effect: "Power of the Wilds: Lion", made: true, incapacitated: false, quiet: true,
    rule: Object.freeze({ item: "Power of the Wilds", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbPowerOfThe", benefit: "Lion" }),
    from: "Barbarian — Path of the Wild Heart 14" }),
  // Oceanic Gift: Wrath of the Sea's ring around ANOTHER creature (`bearer`): the token wearing the pack's effect the
  // manifest lands ("Stormborn", its origin the druid's Oceanic Gift) is the ring's centre; the item, the range's scale, the
  // DC and the turn-start pick are the DRUID's (the ring's source), read through the effect's origin.
  "Oceanic Gift": Object.freeze({ kind: "feature", item: "Wrath of the Sea", bearer: Object.freeze({ effect: "Stormborn", of: "Oceanic Gift" }),
    reach: "all", range: "@scale.sea.wrath-range", effect: null, incapacitated: true,
    pick: Object.freeze({ on: "sourceTurnStart", activity: "Bonus Action Save", says: "pushed up to 15 feet away from the bearer if Large or smaller — move the token" }),
    caveat: "\"a willing creature\" is the table's; the double manifest's second ring around the druid is Wrath of the Sea's own row when \"Manifesting Ocean Spray\" stands",
    rule: Object.freeze({ item: "Oceanic Gift", uuid: "Compendium.dnd-players-handbook.classes.Item.phbdrdOceanicGif" }),
    from: "Druid — Circle of the Sea 14" }),
  // THE PHB CLASSES — D1 (RULINGS *The PHB classes — D1*). Each ring stands `while` its feature's own effect stands on the
  // bearer — landed at the use by TOKEN_LIGHTS (`on: "self"`: Corona of Light's and Holy Nimbus's light; Elder Champion's no
  // light) or by the cast applier (Avenging Angel's self-aimed effect) — so it lives the pack's own clock.
  // Corona of Light: a 60-ft harmful ring; the enemies inside wear the pack's "Corona of Light" and EFFECT_BENDS reads the
  // member copy against the cleric's fire or radiant spells and its Radiance of the Dawn.
  "Corona of Light": Object.freeze({ kind: "feature", item: "Corona of Light", while: "Corona of Light", reach: "harmful", range: 60,
    effect: "Corona of Light", incapacitated: false,
    rule: Object.freeze({ item: "Corona of Light", uuid: "Compendium.dnd-players-handbook.classes.Item.phbclcCoronaOfLi" }),
    from: "Cleric — Light Domain 17 (1 minute)" }),
  // Holy Nimbus: the Aura of Protection's reach; an enemy STARTING its turn inside takes the activity's radiant damage (no save
  // — Cloud of Daggers' plain-damage trigger), once per turn. The Holy Ward is EFFECT_BENDS'; the sunlight is the light row.
  "Holy Nimbus": Object.freeze({ kind: "feature", item: "Holy Nimbus", while: "Holy Nimbus", reach: "harmful", range: "@scale.paladin.aura",
    effect: null, incapacitated: false, quiet: true,
    trigger: Object.freeze({ on: Object.freeze(["turnStart"]), oncePerTurn: true }),
    rule: Object.freeze({ item: "Holy Nimbus", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnHolyNimbus", benefit: "Radiant Damage" }),
    from: "Paladin — Oath of Devotion 20 (10 minutes)" }),
  // Avenging Angel's Frightful Aura: an enemy STARTING its turn in the Aura of Protection saves (Wisdom, the activity's DC) or is
  // Frightened (the activity's effect, landed by the verdict — Fear Aura's shape); attacks against it read Advantage
  // (EFFECT_BENDS "Avenging Angel: Frightened"). The flight is the pack's effect.
  "Avenging Angel": Object.freeze({ kind: "feature", item: "Avenging Angel", while: "Avenging Angel", reach: "harmful", range: "@scale.paladin.aura",
    effect: null, incapacitated: false, quiet: true,
    trigger: Object.freeze({ on: Object.freeze(["turnStart"]), oncePerTurn: true }),
    caveat: "\"or until it takes any damage\" ends the Frightened early — the table's",
    rule: Object.freeze({ item: "Avenging Angel", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnAvengingAn", benefit: "Frightful Aura" }),
    from: "Paladin — Oath of Vengeance 20 (10 minutes)" }),
  // Elder Champion's Diminish Defiance: the enemies in the Aura of Protection wear the pack's "Diminished Defiance"; EFFECT_BENDS
  // reads the member copy against the paladin's spells and Channel Divinity. Regeneration is TURN_GRANTS'; Swift Spells the table's.
  "Elder Champion": Object.freeze({ kind: "feature", item: "Elder Champion", while: "Diminished Defiance", reach: "harmful", range: "@scale.paladin.aura",
    effect: "Diminished Defiance", incapacitated: false, quiet: true,
    rule: Object.freeze({ item: "Elder Champion", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnElderChamp", benefit: "Diminish Defiance" }),
    from: "Paladin — Oath of the Ancients 20 (1 minute)" }),
  // ARCANA UNLEASHED (RULINGS *Arcana Unleashed*). Aura of Evasion: Aura of Protection's spell shape — the pack's "Aura" worn
  // by the allies inside; EFFECT_BENDS reads the member copy for the Dexterity saves' Advantage, EVASIONS for the Evasion.
  "Aura of Evasion": Object.freeze({ kind: "spell", reach: "helpful", range: null, effect: "Aura", incapacitated: false,
    caveat: "an Incapacitated creature gains nothing from the aura — the Evasion half already skips it",
    rule: Object.freeze({ item: "Aura of Evasion", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunAuraofEvasiIJ" }),
    from: "Arcana Unleashed — level 7 spell (Concentration, 1 minute)" }),
  // Lightning Ring: Spirit Guardians' trigger on the "Emanation Save" (enter, or end the turn inside, once per turn); the
  // Lightning Line is the sheet's own action.
  "Lightning Ring": Object.freeze({ kind: "spell", activity: "Emanation Save", reach: "harmful", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    caveat: "\"you can force\" reads as every enemy; a friend inside is spared — the table's",
    rule: Object.freeze({ item: "Lightning Ring", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunLightningRiWL" }),
    from: "Arcana Unleashed — level 8 spell (Concentration, 1 minute)" }),
  // Grave Ground: a placed area (Moonbeam's kind) whose enemies save on entering or ending their turn inside — the "Grave
  // Ground Save"; the cast's own save is the pack's. Difficult Terrain is the table's.
  "Grave Ground": Object.freeze({ kind: "area", activity: "Grave Ground Save", reach: "harmful", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    caveat: "the four squares are one template placed by hand; Difficult Terrain for your enemies is the table's",
    rule: Object.freeze({ item: "Grave Ground", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunGraveGroundcR" }),
    from: "Arcana Unleashed — level 5 spell (Concentration, 1 minute)" }),
  // HEROES OF FAERÛN (RULINGS *Heroes of Faerûn*) — the pulsing Emanations on Spirit Guardians' trigger. Cacophonic Shield's
  // Save (the caster's own "Shielded" is EFFECT_BENDS'); Dirge's save lands its effects by verdict (the pack's); the no-heal
  // inside is the table's.
  "Cacophonic Shield": Object.freeze({ kind: "spell", activity: "Save", reach: "harmful", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    caveat: "\"designate creatures to be unaffected\" reads as your allies — a friend inside is spared",
    rule: Object.freeze({ item: "Cacophonic Shield", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofCacophonicShi" }),
    from: "Heroes of Faerûn — level 3 spell (Concentration, 1 minute)" }),
  "Dirge": Object.freeze({ kind: "spell", activity: "Cast and Save", reach: "harmful", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    caveat: "\"can't regain Hit Points while in the Emanation\" and the Circle casting are the table's",
    rule: Object.freeze({ item: "Dirge", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofDirge00000000" }),
    from: "Heroes of Faerûn — level 6 spell (Concentration, 1 minute)" }),
  // The placed areas (Moonbeam's kind): Doomtide's fog drifts 10 ft a turn by the caster's drag; Spellfire Storm's "first time on a
  // turn" is the once-per-turn; the Constitution save to cast inside it is the table's.
  "Doomtide": Object.freeze({ kind: "area", activity: "Cast and Save", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    caveat: "the Sphere's 10-foot drift at the start of your turn is your drag of the template; the magical Darkness is the table's",
    rule: Object.freeze({ item: "Doomtide", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofDoomtide00000" }),
    from: "Heroes of Faerûn — level 4 spell (Concentration, 1 minute)" }),
  "Spellfire Storm": Object.freeze({ kind: "area", activity: "Cast and Save", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["enter", "turnEnd"]), oncePerTurn: true }),
    caveat: "the Constitution save of a creature casting inside the pillar is the table's",
    rule: Object.freeze({ item: "Spellfire Storm", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofSpellfireStor" }),
    from: "Heroes of Faerûn — level 4 spell (Concentration, 1 minute)" }),
  // Frozen Haunt's Frozen Soul: Inner Radiance's ring while the form's effect stands, its pulse at the ranger's turn START
  // ("when you first adopt this form" is the Adopt Form use itself — the table's); the enemies inside take the Cold.
  "Frozen Haunt": Object.freeze({ kind: "feature", item: "Frozen Haunt", while: "Frozen Soul", reach: "harmful", range: null, effect: null, incapacitated: false,
    pulse: Object.freeze({ on: "sourceTurnStart", activity: "Frozen Soul" }),
    caveat: "\"each creature of your choice\" reads as your enemies; the first pulse at the adoption is the use's own card",
    rule: Object.freeze({ item: "Frozen Haunt", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofWiwFrozenHaun", benefit: "Frozen Soul" }),
    from: "Ranger — Winter Walker 15 (Heroes of Faerûn)" }),
  // RAVENLOFT (RULINGS *Ravenloft: The Horrors Within*). Unnerving Aura: Frozen Haunt's ring while Ghastly Form stands, the
  // Wisdom save demanded of the enemies inside at the ranger's turn START (a save pulse); Frightened the activity's own failure.
  "Wrath of the Wild": Object.freeze({ kind: "feature", item: "Wrath of the Wild", while: "Ghastly Form", reach: "harmful", range: null, effect: null, incapacitated: true,
    activity: "Unnerving Aura", pulse: Object.freeze({ on: "sourceTurnStart", activity: "Unnerving Aura" }),
    caveat: "\"each creature of your choice\" reads as your enemies; the first save at the transform is the use's own card",
    rule: Object.freeze({ item: "Wrath of the Wild", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwHWWrathofth3C", benefit: "Unnerving Aura" }),
    from: "Ranger — Hollow Warden 3 (Ravenloft)" }),
  // The bestiary's auras on the Monster Manual's shapes: Terrifying Aura — any enemy starting its turn inside saves (off while
  // Incapacitated); Viral Aura and Deathly Stench — any creature; Possessive Aura — a creature ENDING its turn inside.
  "Terrifying Aura": Object.freeze({ kind: "feature", reach: "harmful", range: null, effect: null, incapacitated: true,
    trigger: Object.freeze({ on: Object.freeze(["turnStart"]), oncePerTurn: true }),
    caveat: "a success's 24-hour immunity to this aura is the table's",
    rule: Object.freeze({ item: "Terrifying Aura", uuid: "Compendium.dnd-ravenloft-horrors-within.actors.Item.savZZbelcq7RoGtH" }),
    from: "Ravenloft — monsters (unspeakable horror)" }),
  "Viral Aura": Object.freeze({ kind: "feature", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["turnStart"]), oncePerTurn: true }),
    caveat: "a success's 24-hour immunity to this aura is the table's",
    rule: Object.freeze({ item: "Viral Aura", uuid: "Compendium.dnd-ravenloft-horrors-within.actors.Item.GbjwSWAyF40wLx55" }),
    from: "Ravenloft — monsters (zombie plague spreader)" }),
  "Deathly Stench": Object.freeze({ kind: "feature", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["turnStart"]), oncePerTurn: true }),
    rule: Object.freeze({ item: "Deathly Stench", uuid: "Compendium.dnd-ravenloft-horrors-within.actors.Item.nz066kOxstTlhYqe" }),
    from: "Ravenloft — monsters (zombie clot)" }),
  "Possessive Aura": Object.freeze({ kind: "feature", reach: "all", range: null, effect: null, incapacitated: false,
    trigger: Object.freeze({ on: Object.freeze(["turnEnd"]), oncePerTurn: true }),
    caveat: "the Charmed's repeat at its turn end is the pack's second save, used by hand",
    rule: Object.freeze({ item: "Possessive Aura", uuid: "Compendium.dnd-ravenloft-horrors-within.actors.Item.ojxp9YnrooKBkOqD" }),
    from: "Ravenloft — monsters (Wilfred Godefroy)" })
});

/**
 * A standing effect on the DEFENDER that pays out against an attacker whose melee attack hits it, no
 * choice (R1). The dice are the pack's damage activity on the SOURCE's item, found through the effect's origin.
 *   effect    the pack's effect by name, or a map name → damage type (Fire Shield: warm burns, chill freezes)
 *   activity  the damage activity on the source's item;  melee  melee attack rolls only
 *   when      "oncePerTurn" — the defender's turn chit;  while  "tempHP" — only while temp HP stand
 *   mark      the pack ships no effect: the module writes a chip at the cast (`cast`), carrying its level
 * ⚠ Hellish Rebuke is NOT this family — a Reaction, a choice (REBUKES). Membership: Damage Shields.
 */
export const DAMAGE_SHIELDS = Object.freeze({
  // THE GM'S SIDE (RULINGS *The Monster Manual — the waiting rows built*): the DEFENDER's own trait, no effect to
  // find (`match: "feature"`): its first damage activity strikes the melee attacker; `range` where the activity carries none.
  "Corrosive Form": Object.freeze({ match: "feature", activity: null, melee: true, range: 5,
    caveat: "the ammunition destroyed and the weapon's cumulative −1 are the table's (the pack ships that penalty as an effect to drag onto the weapon)",
    rule: Object.freeze({ item: "Corrosive Form", uuid: "Compendium.dnd-monster-manual.features.Item.mmCorrosiveForm0" }),
    from: "monsters (black puddings)" }),
  "Death Armor": Object.freeze({ effect: "Death Armor", activity: "Retaliate", melee: true, when: "oncePerTurn",
    rule: Object.freeze({ item: "Death Armor", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofDeathArmor000" }),
    from: "Heroes of Faerûn — Character Options, level 2 (1 hour)" }),
  "Fire Shield": Object.freeze({ effect: Object.freeze({ "Warm Shield": "fire", "Chill Shield": "cold" }), activity: "Flame Eruption", melee: true,
    rule: Object.freeze({ item: "Fire Shield", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplFireShield" }),
    from: "PHB, level 4 (10 minutes)" }),
  "Armor of Agathys": Object.freeze({ mark: true, cast: "Cast", activity: "Frost Damage", melee: true, while: "tempHP",
    rule: Object.freeze({ item: "Armor of Agathys", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplArmorofAga" }),
    from: "PHB, level 1 (1 hour)" })
});


/** A cast shipping several effects the text makes alternatives: the caster picks in a popup (R1), only the
 * pick lands. `effects` the names in order; `ask` the question. Fewer than two present asks nothing.
 *   picks     the choices, when they are NOT all effects (a form's constellations): `lands` maps a pick to the
 *             cast's own effects that land only with it; every other effect lands whatever the pick
 *   activity  only this activity's use asks (Starry Form's "Consume Wild Shape", not its Dragon use)
 *   chip      the pick is kept as a form chip on the caster (`formChip`) for the rows that read it (Chalice)
 *   on        the item whose USE asks; the row is keyed by the FEATURE the bearer must hold (Rage of the Wilds
 *             at the Rage): the trigger's own effects land at once, never waiting; `use` — the pick uses the
 *             feature's activity of that name, whose own card lands its own effect (Bear, Wolf)
 *   img, says the picked effect lands drawn with this icon and told with this sentence (Hex) */
export const EFFECT_CHOICES = Object.freeze({
  "Fire Shield": Object.freeze({ effects: Object.freeze(["Warm Shield", "Chill Shield"]), ask: "A warm shield or a chill shield?",
    rule: Object.freeze({ item: "Fire Shield", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplFireShield" }),
    from: "PHB, level 4 (10 minutes)" }),
  // The pack lands all six "Hexed <Ability>" on every cast and move: only the chosen ability's lands, and it is the mark the
  // rider reads too (one effect: the check's Disadvantage and the hit's Necrotic), drawn as `img` and told as `says`.
  "Hex": Object.freeze({ effects: Object.freeze(["Hexed Strength", "Hexed Dexterity", "Hexed Constitution", "Hexed Intelligence", "Hexed Wisdom", "Hexed Charisma"]),
    ask: "Which ability does the curse fall on?", img: "icons/magic/perception/eye-tendrils-web-purple.webp",
    says: "Cursed by Hex: Disadvantage on ability checks with the chosen ability, and the caster's every hit on it deals Hex's extra Necrotic damage.",
    rule: Object.freeze({ item: "Hex", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplHex0000000" }),
    from: "PHB, level 1 (Concentration, 1 hour)" }),
  // The pack lands Starry Form AND Dragon Form on every use: Dragon Form only with its pick.
  "Starry Form": Object.freeze({ picks: Object.freeze(["Archer", "Chalice", "Dragon"]), activity: "Consume Wild Shape",
    lands: Object.freeze({ Dragon: Object.freeze(["Dragon Form", "Dragon Form (Twinkling)"]) }), chip: true,
    ask: "Which constellation glimmers on you?",
    rule: Object.freeze({ item: "Starry Form", uuid: "Compendium.dnd-players-handbook.classes.Item.phbdrdStarryForm" }),
    from: "Druid — Circle of the Stars 3 (10 minutes)" }),
  "Rage of the Wilds": Object.freeze({ on: "Rage", picks: Object.freeze(["Bear", "Eagle", "Wolf"]), use: true,
    ask: "Rage of the Wilds — Bear, Eagle or Wolf?",
    rule: Object.freeze({ item: "Rage of the Wilds", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbRageOfTheW" }),
    from: "Barbarian — Path of the Wild Heart 3" }),
  // C1 — Power of the Wilds at the Rage: the pick is KEPT as a chip ("Power of the Wilds: Lion") for the Rage's clock — the
  // pack's Lion and Ram utilities land nothing on the barbarian, so nothing else records the choice; the Lion's ring
  // (EMANATIONS) and the Ram's press (CLOCK_RIDERS) read the chip; Falcon's flight is used from the sheet.
  "Power of the Wilds": Object.freeze({ on: "Rage", picks: Object.freeze(["Falcon", "Lion", "Ram"]), chip: true,
    ask: "Power of the Wilds — Falcon, Lion or Ram?",
    rule: Object.freeze({ item: "Power of the Wilds", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbPowerOfThe" }),
    from: "Barbarian — Path of the Wild Heart 14" })
});


/**
 * How a spell's light looks on the token: a token light's own fields, as GEAR_LOOKS' are. Light is a
 * steady glow, coloured as the caster likes (warm white unless the table recolours it); Continual Flame
 * "looks like a regular flame"; Produce Flame a flickering flame in the hand, a torch's colour; a Dancing
 * Light is a torch-size light; the Flaming Sphere a ball of fire that flickers with no core (`flame`'s white
 * core blew out 20 ft of the map on the sandbox).
 */
export const SPELL_LOOKS = Object.freeze({
  light: Object.freeze({ color: "#fff1d6", alpha: 0.3, luminosity: 0.45, attenuation: 0.8 }),
  continualFlame: Object.freeze({ color: "#ff9a3c", alpha: 0.4, luminosity: 0.45, attenuation: 0.8,
    animation: Object.freeze({ type: "torch", speed: 3, intensity: 4 }) }),
  produceFlame: Object.freeze({ color: "#ff8a33", alpha: 0.4, luminosity: 0.45, attenuation: 0.8,
    animation: Object.freeze({ type: "torch", speed: 5, intensity: 5 }) }),
  dancingLight: Object.freeze({ color: "#ffcf7a", alpha: 0.35, luminosity: 0.4, attenuation: 0.85,
    animation: Object.freeze({ type: "torch", speed: 3, intensity: 3 }) }),
  flamingSphere: Object.freeze({ color: "#ff6a1a", alpha: 0.4, luminosity: 0.4, attenuation: 0.85,
    animation: Object.freeze({ type: "torch", speed: 5, intensity: 5 }) })
});

/**
 * A use whose text SHEDS LIGHT, carried as a `token.light` change on an effect (Foundry applies `token.*`
 * changes to the bearer's tokens), so the light follows the effect's clock and no token is written.
 * ⚠ A Foundry light's `dim` is the OUTER radius: dim = bright + "an additional".
 *   on        "self" | "targets" (every creature targeted at the use; none → the pack's use stands)
 *   item / activity   the pack item and activity whose use lands it (activity null: any use)
 *   effect    the pack effect the light rides, landed WITH it; null: the module's own, named as the item
 *   recast    "ends" — casting it again ends the caster's earlier light
 *   out       the item's other activity whose use puts the caster's light out (the effect deleted on the elect,
 *             the token's own light back); the use itself runs as the pack's
 *   ends      "enchantment" — the light goes out with the ENCHANTMENT the use put on a weapon (the item's own
 *             effect of the row's `item` name, deleted from the weapon); `clock` its duration off that effect
 */
export const TOKEN_LIGHTS = Object.freeze({
  "Inner Radiance": Object.freeze({ item: "Celestial Revelation", activity: "Inner Radiance", on: "self", effect: "Searing Radiance", bright: 10, dim: 20,
    rule: Object.freeze({ item: "Celestial Revelation", uuid: "Compendium.dnd-players-handbook.origins.Item.phbsptCelestialR", benefit: "Inner Radiance" }),
    from: "Aasimar — Celestial Revelation (character level 3)" }),
  "Light": Object.freeze({ activity: null, on: "targets", effect: null, recast: "ends", bright: 20, dim: 40, look: SPELL_LOOKS.light,
    caveat: "on a creature's token (user, 2026-09-25: any targeted token) — the rule's object is the table's to name",
    rule: Object.freeze({ item: "Light", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplLight00000" }),
    from: "PHB cantrip (1 hour)" }),
  // Continual Flame on a token (SUMMON_LIGHTS: "On a token"): until dispelled, so no recast ends it.
  "Continual Flame": Object.freeze({ activity: null, on: "targets", effect: null, bright: 20, dim: 40, look: SPELL_LOOKS.continualFlame,
    caveat: "on a creature's token, as Light's — the rule's object is the table's to name",
    rule: Object.freeze({ item: "Continual Flame", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplContinualF" }),
    from: "PHB, level 2 (until dispelled)" }),
  // Produce Flame: the flame in the caster's hand lights the caster's token for the spell's 10 minutes; casting it
  // again ends the earlier one, and hurling it puts the light out (RULINGS *Produce Flame*; the bend, RULINGS *Bent by choice*).
  "Produce Flame": Object.freeze({ activity: "Cast", on: "self", effect: null, recast: "ends", out: "Hurl Fire", bright: 20, dim: 40,
    look: SPELL_LOOKS.produceFlame,
    rule: Object.freeze({ item: "Produce Flame", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplProduceFla" }),
    from: "PHB cantrip (10 minutes)" }),
  // D1 — the uses whose OWN effect marks the form on the bearer (`on: "self"`): the EMANATIONS rows stand while it does.
  // Corona of Light: Bright Light 60 ft, Dim 30 more.
  "Corona of Light": Object.freeze({ item: "Corona of Light", activity: "Emit Aura of Sunlight", on: "self", effect: "Corona of Light", bright: 60, dim: 90,
    rule: Object.freeze({ item: "Corona of Light", uuid: "Compendium.dnd-players-handbook.classes.Item.phbclcCoronaOfLi" }),
    from: "Cleric — Light Domain 17 (1 minute)" }),
  // Holy Nimbus: the aura filled with Bright Light (the 30-ft Aura of Protection at level 18).
  "Holy Nimbus": Object.freeze({ item: "Holy Nimbus", activity: "Holy Nimbus", on: "self", effect: "Holy Nimbus", bright: 30, dim: 30,
    caveat: "the light is sunlight — the table's for what sunlight does",
    rule: Object.freeze({ item: "Holy Nimbus", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnHolyNimbus", benefit: "Sunlight" }),
    from: "Paladin — Oath of Devotion 20 (10 minutes)" }),
  // Elder Champion: NO light (`bright` 0 — nothing written to the token's light); the pack's effect on the paladin is the form's mark.
  "Elder Champion": Object.freeze({ item: "Elder Champion", activity: "Elder Champion", on: "self", effect: "Diminished Defiance", bright: 0, dim: 0,
    rule: Object.freeze({ item: "Elder Champion", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnElderChamp" }),
    from: "Paladin — Oath of the Ancients 20 (1 minute)" }),
  // The +Cha and the Radiant are the pack's Enchant (NATIVE); the weapon's light rides the paladin's token.
  "Sacred Weapon": Object.freeze({ activity: null, on: "self", effect: null, bright: 20, dim: 40, ends: "enchantment",
    caveat: "the light is the paladin's token's — the weapon is in hand",
    rule: Object.freeze({ item: "Sacred Weapon", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnSacredWeap" }),
    from: "Paladin — Oath of Devotion 3 (10 minutes)" }),
  // ARCANA UNLEASHED — Diamond Staff's Dazzling Light: Bright 40 ft, Dim 40 more, riding the pack's own effect for its minute.
  "Diamond Staff": Object.freeze({ item: "Diamond Staff", activity: "Dazzling Light", on: "self", effect: "Dazzling Light", bright: 40, dim: 80,
    rule: Object.freeze({ item: "Diamond Staff", uuid: "Compendium.dnd-arcana-unleashed.items.Item.aunDiamondStaftz", benefit: "Dazzling Light" }),
    from: "Arcana Unleashed — staff (1 minute)" })
});


/**
 * How a gear light looks on the token: a token light's own fields, written beside its radii.
 * `attenuation` near 1 fades the light to nothing at its edge; `alpha` and `luminosity` stay low so the
 * tint does not wash the map. The flicker is `torch`: the whole light's brightness moves, with no core;
 * ⚠ `flame` draws a hot white core at the source, which on a token covers its art.
 * ⚠ The hard ring at a light's edge is the scene's darkness, not the light: a dim global light gives
 * the darkness a floor (the MCP's scene-builder skill, its soft-light recipe).
 */
export const GEAR_LOOKS = Object.freeze({
  torch: Object.freeze({ color: "#ff8a33", alpha: 0.45, luminosity: 0.45, attenuation: 0.8,
    animation: Object.freeze({ type: "torch", speed: 5, intensity: 7 }) }),
  candle: Object.freeze({ color: "#fff0d6", alpha: 0.25, luminosity: 0.35, attenuation: 0.85,
    animation: Object.freeze({ type: "torch", speed: 4, intensity: 4 }) }),
  lamp: Object.freeze({ color: "#ffc46e", alpha: 0.35, luminosity: 0.4, attenuation: 0.8,
    animation: Object.freeze({ type: "torch", speed: 2, intensity: 1 }) })
});

/**
 * GEAR THAT SHEDS LIGHT (gear-lights.js): using the item opens a light toggle instead of its activity,
 * and the light rides an effect on the item's owner, as TOKEN_LIGHTS' does. Nothing is consumed and
 * nothing expires by the clock; a Long Rest puts it out (RULINGS *Gear lights*).
 * ⚠ A Foundry light's `dim` is the OUTER radius: dim = bright + "an additional".
 *   item      the names the item answers to besides the key: the 2014 names starting equipment hands out
 *   angle     the emission cone in degrees (absent: all round); a 5e cone is as wide as it is long
 *   label     the lit state's name on the popup, when the row has a second state
 *   states    the second states by key: `{ bright, dim, label, switchTo }` — `switchTo` the button that moves
 *             into it; the lit state's own `switchTo` moves back
 *   look      the flame's colour and flicker (GEAR_LOOKS), the same in every state
 */
export const GEAR_LIGHTS = Object.freeze({
  "Candle": Object.freeze({ item: Object.freeze([]), bright: 5, dim: 10, look: GEAR_LOOKS.candle,
    rule: Object.freeze({ item: "Candle", uuid: "Compendium.dnd-players-handbook.equipment.Item.phbagCandle00000" }),
    from: "PHB adventuring gear (1 hour)" }),
  "Torch": Object.freeze({ item: Object.freeze([]), bright: 20, dim: 40, look: GEAR_LOOKS.torch,
    rule: Object.freeze({ item: "Torch", uuid: "Compendium.dnd-players-handbook.equipment.Item.phbagTorch000000" }),
    from: "PHB adventuring gear (1 hour)" }),
  "Lamp": Object.freeze({ item: Object.freeze([]), bright: 15, dim: 45, look: GEAR_LOOKS.lamp,
    rule: Object.freeze({ item: "Lamp", uuid: "Compendium.dnd-players-handbook.equipment.Item.phbagLamp0000000" }),
    from: "PHB adventuring gear (6 hours on a flask of Oil)" }),
  "Lantern, Hooded": Object.freeze({ item: Object.freeze(["Hooded Lantern"]), bright: 30, dim: 60, look: GEAR_LOOKS.lamp,
    label: "hood up", switchTo: "Raise the hood",
    states: Object.freeze({ hoodDown: Object.freeze({ bright: 0, dim: 5, label: "hood down", switchTo: "Lower the hood" }) }),
    rule: Object.freeze({ item: "Lantern, Hooded", uuid: "Compendium.dnd-players-handbook.equipment.Item.phbagLanternHood" }),
    from: "PHB adventuring gear (6 hours on a flask of Oil)" }),
  "Lantern, Bullseye": Object.freeze({ item: Object.freeze(["Bullseye Lantern"]), bright: 60, dim: 120, angle: 53.13, look: GEAR_LOOKS.lamp,
    rule: Object.freeze({ item: "Lantern, Bullseye", uuid: "Compendium.dnd-players-handbook.equipment.Item.phbagLanternBull" }),
    from: "PHB adventuring gear (6 hours on a flask of Oil)" })
});


/**
 * TOKEN_LIGHTS' sibling for senses (`sight` and `detectionModes`; a `sight.visionMode` override inflates
 * the mode's defaults), added to the PACK's effect as it is created. `vision` a CONFIG.Canvas.visionModes
 * key; `detect` { mode, range }; `range` the sight range in feet; `effect` its name when not the row key.
 */
export const TOKEN_SENSES = Object.freeze({
  "Stonecunning": Object.freeze({ effect: "Stonecunning", vision: "tremorsense", range: 60,
    detect: Object.freeze({ mode: "feelTremor", range: 60 }),
    caveat: "always counted as on stone (user, 2026-09-25: no way to read the surface)",
    rule: Object.freeze({ item: "Dwarf", uuid: "Compendium.dnd-players-handbook.origins.Item.phbspDwarf000000", benefit: "Stonecunning" }),
    from: "Dwarf" })
});


/**
 * Size changes added to the PACK's effect as it is created — `token.width`/`height` and `system.traits.size`
 * — so every size reader sees them. ⚠ dnd5e resizes a token only when the SOURCE size changes.
 *   effects  { effectName: { size } | { step } } — an absolute size, or categories from the bearer's, clamped
 */
export const TOKEN_SIZES = Object.freeze({
  "Large Form": Object.freeze({ effects: Object.freeze({ "Large Form": Object.freeze({ size: "lg" }) }),
    caveat: "the space it needs is the table's to judge",
    rule: Object.freeze({ item: "Goliath", uuid: "Compendium.dnd-players-handbook.origins.Item.phbspGoliath0000", benefit: "Large Form" }),
    from: "Goliath (character level 5)" }),
  "Enlarge/Reduce": Object.freeze({ effects: Object.freeze({ "Enlarged": Object.freeze({ step: 1 }), "Reduced": Object.freeze({ step: -1 }) }),
    rule: Object.freeze({ item: "Enlarge/Reduce", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplEnlargeRed", benefit: "Enlarge" }),
    from: "PHB, level 2 (Concentration, 1 minute)" })
});


/**
 * What a feature grants on finishing a rest that the platform does not give, riding the rest's own update
 * (rest-grants.js, `dnd5e.preRestCompleted`). Keyed by the feature's name.
 *   grant    "inspiration" | "temphp" (the heal activity's amount; only where it beats what is held) |
 *            "meal" (extra dice for a creature spending Hit Dice in the same Short Rest)
 *   to       "allies" — the owner GIVES it in a popup after the rest (holders greyed); else the owner gains it
 *   feature  the feat on the sheet when the row is one of its benefits;  self  the owner may pick itself
 *   reach    feet from the owner (null: every ally on the scene);  cap  "prof", a number or a formula
 *   activity / activities  the heal activity, or one per ability (the feat's own ASI picks, else the
 *            higher modifier — decide/chips.js);  label  the rest card's name for the one kept
 *   block    true — the rest GRANTS NOTHING while the rester wears `effect` from this item (the GM's side:
 *            Cursed Touch's "no benefit from finishing a Short or Long Rest"): the rest's own update and its
 *            item updates are emptied before they land, the card says so
 */
export const REST_GRANTS = Object.freeze({
  // The curse on a rest (RULINGS *The Monster Manual — the waiting rows built*): the pack's Cursed effect, its origin the touch.
  "Cursed Touch": Object.freeze({ rests: Object.freeze(["short", "long"]), block: true, effect: "Cursed",
    caveat: "the curse's end is the table's — delete Cursed",
    rule: Object.freeze({ item: "Cursed Touch", uuid: "Compendium.dnd-monster-manual.features.Item.mmCursedTouch000" }),
    from: "monsters" }),
  "Restless Touch": Object.freeze({ rests: Object.freeze(["short"]), block: true, effect: "Cursed",
    caveat: "24 hours or the bearer's death end it — the table's; delete Cursed",
    rule: Object.freeze({ item: "Restless Touch", uuid: "Compendium.dnd-monster-manual.features.Item.mmRestlessTouch0" }),
    from: "monsters" }),
  "Resourceful": Object.freeze({ rests: Object.freeze(["long"]), grant: "inspiration",
    rule: Object.freeze({ item: "Human", uuid: "Compendium.dnd-players-handbook.origins.Item.phbspHuman000000", benefit: "Resourceful" }), from: "Human" }),
  "Musician": Object.freeze({ rests: Object.freeze(["short", "long"]), grant: "inspiration", to: "allies", reach: 30, cap: "prof",
    rule: Object.freeze({ item: "Musician", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftMusician000", benefit: "Encouraging Song" }),
    from: "Origin feat (Entertainer)" }),
  // Musician's popup, granting Temporary Hit Points (the pack's heal activity's amount).
  "Inspiring Leader": Object.freeze({ rests: Object.freeze(["short", "long"]), grant: "temphp", to: "allies", self: true, reach: 30, cap: 6,
    activities: Object.freeze({ wis: "Inspire with Wisdom", cha: "Inspire with Charisma" }), label: "Inspire with Performance",
    rule: Object.freeze({ item: "Inspiring Leader", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftInspiringLe", benefit: "Bolstering Performance" }),
    from: "General feat" }),
  // Chef's two benefits, a row each; the treats are handed out as their temp HP (RULINGS *Bent by choice*).
  "Bolstering Treats": Object.freeze({ feature: "Chef", rests: Object.freeze(["long"]), grant: "temphp", to: "allies", self: true, reach: null, cap: "prof",
    activity: "Bolstering Treats",
    rule: Object.freeze({ item: "Chef", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftChef0000000", benefit: "Bolstering Treats" }),
    from: "General feat (Chef)" }),
  "Replenishing Meal": Object.freeze({ feature: "Chef", rests: Object.freeze(["short"]), grant: "meal", to: "allies", self: true, reach: null, cap: "4 + @prof",
    activity: "Replenishing Meal",
    rule: Object.freeze({ item: "Chef", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftChef0000000", benefit: "Replenishing Meal" }),
    from: "General feat (Chef)" })
});


/**
 * What turns a drop to 0 HP into 1 (drop-to-one.js: the 1 written in the damage's own update) — and what a
 * landed 0 raises (the death's side).
 *   ask       "you can" — held at 1 and the owner asked; false — it simply happens and a card says so
 *   uses      the item's own uses pay;  effect  the effect whose presence is the row, removed when it fires
 *   ends      the spell ends when it fires;  outright  it also stands against damage that kills outright
 *   save      the DICE decide (R1, Undead Fortitude): held at 1 while the bearer's save rolls on the keeper —
 *             `ability`, `dc` ("5 + damage"), `unless` (damage types and/or "crit" read off the damage card;
 *             ⚠ a card the module cannot read counts the row — never a guessed exemption); a failure lands the 0
 *   on        "died" — THE DEATH'S SIDE (Death Throes): the row fires when the damage leaves the bearer at 0
 *             and nothing held it; `activity` (null: the first save) is used AT THE CORPSE against every
 *             creature within the activity's Emanation, one demand card, the saves machine from there
 *   notice    a `died` row with no activity to use — the card's words for the GM's move (Misty Escape: the mist)
 *   named     B4 (Gift of the Protectors): the feature is ANOTHER creature's — the warlock's, whose copy's description
 *             names the dropped creature (the tome's page, read as data); `activity` the one whose own uses pay (Protect,
 *             once per Long Rest); it simply happens (`ask: false`), the card names the keeper
 *   sets      RAVENLOFT — the `heal` SETS the Hit Points to its roll ("your Hit Points instead change to"), the held 1 counted;
 *   spendOn   "success" — a `save` row's use is spent on the success alone (Strength of the Grave), else on the roll
 * The GM's side, the waiting rows: RULINGS *The Monster Manual — the waiting rows built*.
 */
export const DROP_TO_ONE = Object.freeze({
  "Death Ward": Object.freeze({ ask: false, effect: "Protection from Death", ends: true, outright: true,
    rule: Object.freeze({ item: "Death Ward", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplDeathWard0" }),
    from: "PHB, level 4 (8 hours)" }),
  "Gift of the Protectors": Object.freeze({ ask: false, named: true, activity: "Protect", outright: false,
    caveat: "the names on the page are the feature's description on the warlock's sheet — write them there",
    rule: Object.freeze({ item: "Gift of the Protectors", uuid: "Compendium.dnd-players-handbook.classes.Item.phbinvGiftoftheP" }),
    from: "Eldritch Invocation (Warlock 9)" }),
  "Relentless Endurance": Object.freeze({ ask: true, uses: true, outright: false,
    rule: Object.freeze({ item: "Orc", uuid: "Compendium.dnd-players-handbook.origins.Item.phbspOrc00000000", benefit: "Relentless Endurance" }),
    from: "Orc" }),
  // The kill moment's two sides, the GM's (RULINGS *The GM's side — the five shapes*). Text-only in the pack: the machine rolls.
  "Undead Fortitude": Object.freeze({ ask: false, outright: false,
    save: Object.freeze({ ability: "con", dc: "5 + damage", unless: Object.freeze(["radiant", "crit"]) }),
    rule: Object.freeze({ item: "Undead Fortitude", uuid: "Compendium.dnd-monster-manual.features.Item.mmUndeadFortitud" }),
    from: "monsters (zombies)" }),
  "Death Throes": Object.freeze({ on: "died", activity: null,
    caveat: "\"revives somewhere in the Abyss\" is the table's",
    rule: Object.freeze({ item: "Death Throes", uuid: "Compendium.dnd-monster-manual.features.Item.mmDeathThroes000" }),
    from: "monsters (the balor)" }),
  // The vampire's drop: held at 1 and gone (Death Ward's shape, no effect), or the death's side said on a card.
  "Spiteful Escape": Object.freeze({ ask: false, outright: true,
    caveat: "dying within 30 feet of its anathema, the teleport to its demiplane, the 2d6 days and the curse on every creature within 60 feet are the table's",
    rule: Object.freeze({ item: "Spiteful Escape", uuid: "Compendium.dnd-monster-manual.features.Item.mmSpitefulEscape" }),
    from: "monsters" }),
  "Misty Escape": Object.freeze({ on: "died", notice: "it becomes mist — Shape-Shift, no action — and must reach its resting place within 2 hours or be destroyed; there it is Paralyzed until it regains a Hit Point",
    caveat: "outside its resting place; the mist form and the Paralyzed are the sheet's",
    rule: Object.freeze({ item: "Misty Escape", uuid: "Compendium.dnd-monster-manual.features.Item.mmMistyEscape000" }),
    from: "monsters (vampires)" }),
  "Shadow Escape": Object.freeze({ on: "died", notice: "it teleports into its resting place unless it is in running water or sunlight; there it is Paralyzed for 1 hour, then regains 1 Hit Point",
    caveat: "outside its resting place; the teleport and the Paralyzed are the sheet's",
    rule: Object.freeze({ item: "Shadow Escape", uuid: "Compendium.dnd-monster-manual.features.Item.mmShadowEscape00" }),
    from: "monsters (vampires)" }),
  // THE PHB CLASSES — C1 (RULINGS *The PHB classes — C1*): the kill moment's PC rows.
  // Relentless Rage: Undead Fortitude's save while raging (`while`), the DC the pack's own save activity's (10, rising 5 per
  // use — `dc: "activity"`), the use spent by its consumption (`uses`); a success heals the pack's Heal (`heal`, 2 × level)
  // on top of the 1; a failure lands the 0. Held at 1 while the dice roll (the bends register).
  "Relentless Rage": Object.freeze({ ask: false, outright: false, while: "raging", uses: true, heal: "Heal",
    save: Object.freeze({ activity: "Save", dc: "activity" }),
    rule: Object.freeze({ item: "Relentless Rage", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbRelentless" }),
    from: "Barbarian 11" }),
  // Undying Sentinel: Relentless Endurance's ask with a `heal` — Yes drops to 1 and regains the pack's Heal (3 × level).
  "Undying Sentinel": Object.freeze({ ask: true, uses: true, outright: false, heal: "Heal",
    caveat: "the no-ageing clause is the table's",
    rule: Object.freeze({ item: "Undying Sentinel", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnUndyingSen" }),
    from: "Paladin — Oath of the Ancients 15" }),
  // Rage of the Gods' Revivification (measured on the pack: the Reaction utility, 30 ft, a Rage use, its roll the
  // barbarian's level): ANOTHER creature's drop within `ally` feet is held while the barbarian wearing "Rage of the Gods"
  // (`while` on the KEEPER) is asked; Yes spends the activity's consumption and the creature drops to the activity's roll
  // (`to: "roll"` — its level in Hit Points) instead of 1. Gift of the Protectors' keeper shape with a reach.
  "Rage of the Gods": Object.freeze({ ask: true, outright: false, ally: 30, while: "Rage of the Gods", activity: "Revivification", to: "roll",
    rule: Object.freeze({ item: "Rage of the Gods", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbRageOfTheG", benefit: "Revivification" }),
    from: "Barbarian — Path of the Zealot 14" }),
  // Searing Vengeance — THE DEATH SAVE'S SIDE (`on: "deathSave"`): when the warlock or an ally within `ally` feet rolls a
  // Death Saving Throw, the warlock is OFFERED it (the offer rides the roll — the bends register): Yes regains half the
  // creature's Hit Point maximum (`heal: "halfMax"`), the pack's Damage activity rolls once and lands on every enemy within
  // its Emanation of that creature, its Blinded landed until the end of the current turn; the feature's use spent.
  "Searing Vengeance": Object.freeze({ on: "deathSave", ally: 60, uses: true, activity: "Damage", heal: "halfMax", clock: "halt",
    caveat: "\"can then stand up\" is the table's — the creature is no longer Prone by choice",
    rule: Object.freeze({ item: "Searing Vengeance", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkSearingVen" }),
    from: "Warlock — Celestial Patron 14" }),
  // HEROES OF FAERÛN — the Domestic Wonder's Mechanical Determination: Undead Fortitude's save with Lightning in place of Radiant.
  "Mechanical Determination": Object.freeze({ ask: false, outright: false,
    save: Object.freeze({ ability: "con", dc: "5 + damage", unless: Object.freeze(["lightning", "crit"]) }),
    rule: Object.freeze({ item: "Mechanical Determination", uuid: "Compendium.dnd-heroes-faerun.actors.Item.RTwCRKhLi5Yq7k7k" }),
    from: "Heroes of Faerûn — the Domestic Wonder" }),
  // RAVENLOFT (RULINGS *Ravenloft: The Horrors Within*). Strength of the Grave: Undead Fortitude's dice (Charisma, DC 5 + the
  // damage); a success SETS the Hit Points to Cha + the sorcerer's level ("Heal on Success", `sets`); the use is spent on the
  // success alone (`spendOn`), once per Long Rest.
  "Power of Shadow": Object.freeze({ ask: false, uses: true, spendOn: "success", outright: false, heal: "Heal on Success", sets: true,
    save: Object.freeze({ ability: "cha", dc: "5 + damage" }),
    rule: Object.freeze({ item: "Power of Shadow", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwSSPowerofShNG", benefit: "Strength of the Grave" }),
    from: "Sorcerer — Shadow Sorcery 3 (Ravenloft)" }),
  // Persistent Wrath: Undying Sentinel's ask while Ghastly Form stands — Yes SETS the Hit Points to twice the ranger's level.
  "Ancient Might": Object.freeze({ ask: true, uses: true, outright: false, while: "Ghastly Form", heal: "Persistent Wrath", sets: true,
    caveat: "the level 4+ slot that restores the use is the sheet's",
    rule: Object.freeze({ item: "Ancient Might", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwHWAncientMibA", benefit: "Persistent Wrath" }),
    from: "Ranger — Hollow Warden 15 (Ravenloft)" })
});


/**
 * A Reaction after the bearer takes damage, aimed at the damager (rebukes.js): a popup to the owner when
 * the damager stands in reach — Riposte's shape, on damage. The reach is the reaction activity's (N1).
 *   activity  the reaction activity (null: the first);  range  feet, where the activity carries none
 *   attack    "melee" — the answer is one melee attack with a weapon the bearer picks
 *   while     an effect that must stand on the bearer;  equipped  the item must be equipped
 *   ward      a BYSTANDER within `range` of a damager who hit someone else is asked;  hit  attack damage only
 *   opportunity  the answer is an Opportunity Attack (CLOCK_RIDERS "sentinel-halt" reads it)
 *   on        "miss" (Sticky Shield) — a MELEE WEAPON attack that MISSED the bearer, stamped by the elect off the
 *             attack card; the answer is the activity used at the attacker
 *   types     the damage's types the row answers to (Elemental Absorption); a damage card the module cannot
 *             read counts the row — never a guessed exemption
 *   self      the answer is aimed at nobody (a heal on self, a cloud) — no reach is measured
 *   follow    B4 — activities of the feature OFFERED on the card once the answer is driven (Misty Escape's Disappearing
 *             Step or Dreadful Step after the teleport), each a button, the pick the player's
 *   wardAlso  RAVENLOFT — a `ward` row asked on the bearer's OWN damage too (Prowling Retribution: you or an ally)
 * A spell answers at the lowest slot held — no picker in a Reaction's window.
 */
export const REBUKES = Object.freeze({
  "Storm's Thunder": Object.freeze({ activity: null, from: "Goliath — Giant Ancestry (Storm)",
    rule: Object.freeze({ item: "Storm's Thunder", uuid: "Compendium.dnd-players-handbook.origins.Item.phbsptStormsThun" }) }),
  "Hellish Rebuke": Object.freeze({ activity: null, caveat: "a creature you can see", from: "PHB level 1 spell; the Monster Manual's Hellish Rebuke casts it",
    rule: Object.freeze({ item: "Hellish Rebuke", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplHellishReb" }) }),
  "Fount of Moonlight": Object.freeze({ activity: "Blinding Reaction", while: "Wreathed in Light", caveat: "a creature you can see",
    from: "PHB level 4 spell (Concentration, 10 minutes)",
    rule: Object.freeze({ item: "Fount of Moonlight", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplFountofMoo" }) }),
  "Retaliation": Object.freeze({ attack: "melee", range: 5, from: "Barbarian 14",
    rule: Object.freeze({ item: "Retaliation", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbRetaliatio" }) }),
  "Sword of Answering": Object.freeze({ activity: "Attack Reaction", advantage: true, equipped: true, from: "DMG legendary weapon",
    rule: Object.freeze({ item: "Sword of Answering", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgSwordOfAnswer" }) }),
  // The pack's Sentinel has no activity: the answer is one melee attack with the weapon last swung.
  "Sentinel": Object.freeze({ attack: "melee", range: 5, ward: true, hit: true, opportunity: true, from: "General feat",
    caveat: "its Disengage half — nothing records a Disengage",
    rule: Object.freeze({ item: "Sentinel", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftSentinel000", benefit: "Guardian" }) }),
  // THE GM'S SIDE (RULINGS *The GM's side — the reaction rows*). A hit's save at the attacker: the damage has
  // landed by the time the rebuke asks (`dnd5e.applyDamage`); "the attack misses instead" is the table's.
  "Warding Charm": Object.freeze({ activity: "Save", hit: true, from: "monsters",
    caveat: "\"the attack roll misses\" on a failure is the table's — the damage has landed; Charmed is the pack's effect",
    rule: Object.freeze({ item: "Warding Charm", uuid: "Compendium.dnd-monster-manual.features.Item.mmWardingCharm00" }) }),
  "Jinx": Object.freeze({ activity: "Save", hit: true, from: "monsters (goblins)",
    caveat: "\"the attack misses instead\" on a failure is the table's — the damage has landed",
    rule: Object.freeze({ item: "Jinx", uuid: "Compendium.dnd-monster-manual.features.Item.mmJinx0000000000" }) }),
  "Sticky Shield": Object.freeze({ activity: "Save", on: "miss", from: "monsters (kuo-toa)",
    caveat: "the stuck weapon's Free Weapon Check and Escape Check are the sheet's",
    rule: Object.freeze({ item: "Sticky Shield", uuid: "Compendium.dnd-monster-manual.features.Item.mmStickyShield00" }) }),
  // The waiting rows (RULINGS *The Monster Manual — the waiting rows built*): the reaction's save in an Emanation
  // — the template placed from the card names the creatures of its choice.
  "Fiendish Blood": Object.freeze({ activity: "Save", self: true, from: "monsters",
    types: Object.freeze(["piercing", "slashing"]),
    caveat: "the Emanation's creatures of its choice are the template's, placed from the card; what a Fiend senses of the cursed is the table's",
    rule: Object.freeze({ item: "Fiendish Blood", uuid: "Compendium.dnd-monster-manual.features.Item.mmFiendishBlood0" }) }),
  "Elemental Absorption": Object.freeze({ activity: null, self: true, from: "monsters",
    types: Object.freeze(["acid", "cold", "fire", "lightning", "thunder"]),
    caveat: "Resistance to that instance of damage is the pack's own toggle; the Temporary Hit Points are the heal's card",
    rule: Object.freeze({ item: "Elemental Absorption", uuid: "Compendium.dnd-monster-manual.features.Item.mmElementalAbsor" }) }),
  "Ink Cloud": Object.freeze({ activity: "Expend Use", self: true, from: "monsters",
    caveat: "\"while underwater\", the Cube and the swim are the table's",
    rule: Object.freeze({ item: "Ink Cloud", uuid: "Compendium.dnd-monster-manual.features.Item.mmInkCloud000000" }) }),
  // B4 — Misty Escape (the warlock's, Archfey 6): a Reaction on taking damage, Misty Step cast without a slot (the feature's
  // own Cast activity), then one of its Steps offered. ⚠ The Monster Manual's Misty Escape is a DROP_TO_ONE `died` row.
  "Misty Escape": Object.freeze({ activity: "Misty Step", self: true, from: "Warlock — Archfey Patron 6",
    follow: Object.freeze(["Disappearing Step", "Dreadful Step"]),
    caveat: "the teleport itself is the table's move; Dreadful Step's creatures within 5 feet are your targets",
    rule: Object.freeze({ item: "Misty Escape", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkMistyEscap" }) }),
  // C1 — Soul of Vengeance: Sentinel's bystander shape keyed to the Vow's mark — when the creature wearing the paladin's
  // "Vow of Enmity" makes an attack roll (`on: "attack"`: the attack card, hit or miss), the paladin within 5 ft is offered
  // one melee attack at it (a Reaction).
  "Soul of Vengeance": Object.freeze({ attack: "melee", range: 5, on: "attack", mark: "Vow of Enmity", from: "Paladin — Oath of Vengeance 15",
    rule: Object.freeze({ item: "Soul of Vengeance", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnSoulOfVeng" }) }),
  // ARCANA UNLEASHED (RULINGS *Arcana Unleashed*). Instinctive Charm: Warding Charm's row on a wizard — the hit's Wisdom save
  // at the attacker (its own unnamed reaction, 30 ft, once per Long Rest); the miss and the redirect are the table's.
  "Instinctive Charm": Object.freeze({ activity: null, hit: true, from: "Wizard — Enchanter 10 (Arcana Unleashed)",
    caveat: "\"the attack misses instead\" on a failure is the table's — the damage has landed; the redirect to another creature is the held kind",
    rule: Object.freeze({ item: "Instinctive Charm", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunInstinctiveCh" }) }),
  // Harvest Undead — THE BLOODIED MOMENT: `judge: "becameBloodied"` — the damage took the bearer from above half its Hit Points
  // to half or fewer (and not to 0); `self` aims at nobody. The heal (the wizard's level) is the answer; the Undead reduced to 0 is the table's.
  "Harvest Undead": Object.freeze({ activity: null, self: true, judge: "becameBloodied", from: "Wizard — Necromancer 10 (Arcana Unleashed)",
    caveat: "an Undead under your control that you can see is reduced to 0 Hit Points — the table's",
    rule: Object.freeze({ item: "Harvest Undead", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunHarvestUndead" }) }),
  // Masterful Shots: Sticky Shield's miss row on ANY attack roll (`missOf: "any"`); the move and the ranged attack are from the sheet.
  "Masterful Shots": Object.freeze({ activity: null, on: "miss", missOf: "any", self: true, from: "Fighter — Arcane Archer 18 (Arcana Unleashed)",
    caveat: "move up to half your Speed away (no Opportunity Attacks) and make one ranged attack at the attacker — from the sheet",
    rule: Object.freeze({ item: "Masterful Shots", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunMasterfulShot" }) }),
  // HEROES OF FAERÛN (RULINGS *Heroes of Faerûn*). Chilling Retribution: Warding Charm's row — the hit's Wisdom save at the
  // attacker, Stunned on a failure (the pack's effect); the uses the feature's.
  // The pack's save carries no range ("when a creature hits you" — from anywhere): a long bow's reach stands in.
  "Chilling Retribution": Object.freeze({ activity: null, hit: true, range: 600, from: "Ranger — Winter Walker 11 (Heroes of Faerûn)",
    rule: Object.freeze({ item: "Chilling Retribution", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofWiwChillingRe" }) }),
  // Bloodthirst — THE BLOODIED MOMENT, WATCHED (`judge: "enemyBloodied"`): an ENEMY within the activity's 30 ft takes damage and is
  // Bloodied after it (not killed) — the rogue is offered its Reaction with that enemy as the target; Use spends the use (the
  // pack's Expend Use), the teleport beside it and the melee attack are from the sheet (the activity drives neither).
  "Bloodthirst": Object.freeze({ activity: null, judge: "enemyBloodied", from: "Rogue — Scion of the Three 3 (Heroes of Faerûn)",
    caveat: "teleport to a space within 5 feet of it and make one melee attack — from the sheet; Aura of Malevolence's damage is the table's",
    rule: Object.freeze({ item: "Bloodthirst", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofSotBloodthirs" }) }),
  // Elminster's Effulgent Spheres' Absorb Energy: Elemental Absorption's row on a spell — a sphere (the spell's own uses) for
  // Resistance to the triggering type (the pack's five effects, the pick by hand); Energy Blast is the sheet's.
  "Elminster's Effulgent Spheres": Object.freeze({ activity: "Absorb Energy", self: true, from: "Heroes of Faerûn — level 6 spell (Concentration, 1 minute)",
    types: Object.freeze(["acid", "cold", "fire", "lightning", "thunder"]),
    caveat: "the Resistance effect of the triggering type is the pack's own — toggle the right sphere; the spell ends with the last sphere",
    rule: Object.freeze({ item: "Elminster's Effulgent Spheres", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofElminstersEff", benefit: "Absorb Energy" }) }),
  // Zhentarim Tactics' Retaliate: Retaliation's row on a MELEE hit alone (`hitMelee`), the answer an Opportunity Attack.
  "Zhentarim Tactics": Object.freeze({ attack: "melee", range: 5, hit: true, hitMelee: true, opportunity: true, from: "Heroes of Faerûn — general feat",
    rule: Object.freeze({ item: "Zhentarim Tactics", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofZhentarimTact", benefit: "Retaliate" }) }),
  // RAVENLOFT (RULINGS *Ravenloft: The Horrors Within*). Prowling Retribution: an Opportunity Attack when a creature within
  // 5 ft damages the ranger OR an ally (Zhentarim Tactics' row as a ward too — `wardAlso`), while Ghastly Form stands.
  "Wrath of the Wild": Object.freeze({ activity: null, attack: "melee", range: 5, ward: true, wardAlso: true, opportunity: true, while: "Ghastly Form",
    rule: Object.freeze({ item: "Wrath of the Wild", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwHWWrathofth3C", benefit: "Prowling Retribution" }),
    from: "Ranger — Hollow Warden 3 (Ravenloft)" }),
  // Mist Walk: Misty Escape's row — a Reaction on damage, the teleport from the sheet.
  "Mist Walker": Object.freeze({ activity: "Mist Walk", self: true,
    caveat: "the teleport itself is the table's move; the failed-save trigger (Grappled or Restrained) is the table's",
    rule: Object.freeze({ item: "Mist Walker", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwMistWalkerlge", benefit: "Mist Walk" }),
    from: "Dark Gift (Ravenloft)" }),
  // Mark of Obsession: Hellish Rebuke's row — the save at the damager within 10 ft, Frightened on the failure.
  "Mark of Obsession": Object.freeze({ activity: null,
    rule: Object.freeze({ item: "Mark of Obsession", uuid: "Compendium.dnd-ravenloft-horrors-within.items.Item.rhwMarkofObsesam" }),
    from: "Blessing (Ravenloft)" }),
  // Cold Sprint: Elemental Absorption's row on Cold alone; the move and the attack are the sheet's.
  "Cold Sprint": Object.freeze({ activity: null, self: true, types: Object.freeze(["cold"]),
    caveat: "the move and the Pseudopod attack with Advantage are the sheet's",
    rule: Object.freeze({ item: "Cold Sprint", uuid: "Compendium.dnd-ravenloft-horrors-within.actors.Item.oaO60CxJhiY283ZQ" }),
    from: "Ravenloft — monsters (shoggoth)" })
});

/**
 * A feature that gives the Reaction back on EVERY turn of combat, not only at the start of the bearer's own
 * (Reactive, the marilith): the spent chip stands for the turn it was spent on and dies with it
 * (decide/chips.js `reactionStandsEveryTurn`, shared.js `reactionSpent`).
 */
export const REACTION_RESETS = Object.freeze({
  "Reactive": Object.freeze({ every: "turn",
    rule: Object.freeze({ item: "Reactive", uuid: "Compendium.dnd-monster-manual.features.Item.mmReactive000000" }),
    from: "monsters" })
});


/** A damage activity whose text ties a SAVE to the damage (Heat Metal): damage-casts.js rolls `damage`,
 * then uses `save` at the same targets. The drop is the table's (R1): `line` says so on the card. */
export const DAMAGE_SAVES = Object.freeze({
  "Heat Metal": Object.freeze({ damage: Object.freeze(["Cast and Heat", "Reheat"]), save: "On Damage Save",
    line: "Played at the table: on a failed save the creature drops the object if it can — remove Heated Metal if it did; a creature that keeps hold of it has Disadvantage on attack rolls and ability checks until the start of the caster's next turn.",
    rule: Object.freeze({ item: "Heat Metal", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplHeatMetal0" }),
    from: "PHB, level 2 (Concentration, 1 minute)" })
});


/** The two lifecycles an emanation can have — the closed set the R4 tripwire counts. */
export const EMANATION_KINDS = new Set(["feature", "spell", "area"]);

/**
 * Areas whose DATA lies about their life, spent at their last verdict (saves/areas.js reads every other
 * area's life off the data). `data` says what the pack writes instead.
 * ⚠ A row is a claim about the TEXT: a genuinely persisting area (Grease, Web, Cloudkill) must never be listed.
 */
export const SPENT_AREAS = Object.freeze({
  "Noxious Miasma": Object.freeze({
    rule: Object.freeze({ item: "Noxious Miasma", uuid: "Compendium.dnd-monster-manual.features.Item.mmNoxiousMiasma0" }),
    data: "Monster Manual, Adult Green Dragon — the activity's duration reads 1 turn: the AC penalty's clock, not the cloud's" }),
  "Hypnotic Pattern": Object.freeze({
    rule: Object.freeze({ item: "Hypnotic Pattern", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplHypnoticPa" }),
    data: "PHB, level 3 (Concentration, 1 minute) — the DURATION is the Charmed condition's; the pattern \"appears for a moment and vanishes\", and an imported copy missing the concentration flag falls into the GM's bucket" }),
  // The area only CHOOSES the targets; the pack writes the spell's minute on the activity.
  "Slow": Object.freeze({
    rule: Object.freeze({ item: "Slow", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplSlow000000" }),
    data: "PHB, level 3 (Concentration, 1 minute) — the duration is the targets' slowing; the Cube chooses them at the cast" }),
  "Fear": Object.freeze({
    rule: Object.freeze({ item: "Fear", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplFear000000" }),
    data: "PHB, level 3 (Concentration, 1 minute) — the duration is the Frightened condition's; the Cone is the cast's" }),
  "Confusion": Object.freeze({
    rule: Object.freeze({ item: "Confusion", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplConfusion0" }),
    data: "PHB, level 4 (Concentration, 1 minute) — the duration is the confusion's; the Sphere chooses the targets at the cast" }),
  "Sleep": Object.freeze({
    rule: Object.freeze({ item: "Sleep", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplSleep00000" }),
    data: "PHB, level 1 (Concentration, 1 minute) — the duration is the targets' sleep; the Sphere chooses them at the cast" }),
  "Calm Emotions": Object.freeze({
    rule: Object.freeze({ item: "Calm Emotions", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplCalmEmotio" }),
    data: "PHB, level 2 (Concentration, 1 minute) — the duration is the effect's on each Humanoid; the Sphere chooses them at the cast" }),
  "Faerie Fire": Object.freeze({
    rule: Object.freeze({ item: "Faerie Fire", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplFaerieFire" }),
    data: "PHB, level 1 (Concentration, 1 minute) — the outline is on what stood in the Cube at the cast; the Cube itself is nothing after (the 2026-08-18 region that outlived the spell)" })
});

/**
 * Area spells whose CASTER chooses who is affected: when the area holds anyone not hostile, or more
 * hostiles than allowed, the caster is asked (saves/demand.js, metamagic.js); Careful Spell greys.
 * ⚠ BY NAME, NOT BY FLAG (ARCHITECTURE §6): dnd5e's `target.affects.choice` is off on Slow, Sleep and both
 * Conjures. The number allowed is read off the text (decide/metamagic.js `choiceCapFrom`).
 */
export const CHOSEN_AREAS = Object.freeze({
  "Slow": Object.freeze({ data: "PHB, level 3 — “up to six creatures of your choice in a 40-foot Cube”; the pack's choose flag is off" }),
  "Sleep": Object.freeze({ data: "PHB, level 1 — “each creature of your choice in a 5-foot-radius Sphere”; the pack's choose flag is off" }),
  "Conjure Barrage": Object.freeze({ data: "PHB, level 3 — “each creature of your choice that you can see in a 60-foot Cone”; the pack's choose flag is off" }),
  "Conjure Volley": Object.freeze({ data: "PHB, level 5 — “each creature of your choice that you can see in a 40-foot-radius, 20-foot-high Cylinder”; the pack's choose flag is off" }),
  "Word of Radiance": Object.freeze({ data: "PHB, cantrip — “each creature of your choice that you can see in it” (a 5-foot Emanation); the pack flags the choice" }),
  "Destructive Wave": Object.freeze({ data: "PHB, level 5 — “each creature you choose in the Emanation”; the pack flags the choice" }),
  "Weird": Object.freeze({ data: "PHB, level 9 — “each creature of your choice in a 30-foot-radius Sphere”; the pack flags the choice" }),
  "Wither and Bloom": Object.freeze({ data: "Arcana Unleashed, level 2 — “each creature of your choice in that area” (a 10-foot-radius Sphere); the Bloom's Hit Point Die is the table's" }),
  "Laeral's Silver Lance": Object.freeze({ data: "Heroes of Faerûn, level 3 — “each creature of your choice in the Line” (120 feet long, 5 wide)" })
});

/** The 2024 Rules Glossary on range, as pointers to dnd5e's rules pages (rule-text.js reads them). */
export const RANGE_RULES = Object.freeze({
  long: Object.freeze({ page: "rule", key: "range" }),
  single: Object.freeze({ page: "rule", key: "range" }),
  close: Object.freeze({ page: "rule", key: "rangedattacksinclosecombat" })
});

/**
 * Attacker feats that take away RANGE_RULES rows; a cancelled row is still LISTED with the feat, never counted.
 *   scope    "rangedWeapon" (never a thrown melee weapon) | "spell" | "crossbow" (by dnd5e's base item)
 *   cancels  the rows taken away ("long", "close"); beyond long range still cannot be attacked
 *   cover    Half and Three-Quarters Cover ignored: each target's recorded AC drops the bonus (Total stays)
 *   reach    feet added to a spell's range of at least 10 feet
 * No list of its own: the Reminder Sources' `range` kind is their switch too.
 */
export const RANGE_FEATS = Object.freeze({
  "Sharpshooter": Object.freeze({ scope: "rangedWeapon", cancels: Object.freeze(["long", "close"]), cover: true,
    rule: Object.freeze({ item: "Sharpshooter", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftSharpshoote" }) }),
  "Spell Sniper": Object.freeze({ scope: "spell", cancels: Object.freeze(["close"]), cover: true, reach: 60,
    rule: Object.freeze({ item: "Spell Sniper", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftSpellSniper" }) }),
  "Crossbow Expert": Object.freeze({ scope: "crossbow", cancels: Object.freeze(["close"]),
    rule: Object.freeze({ item: "Crossbow Expert", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftCrossbowExp", benefit: "Firing in Melee" }) })
});

/** The three crossbows, by dnd5e's base item (CONFIG.DND5E.weaponIds). */
export const CROSSBOWS = Object.freeze(["handcrossbow", "lightcrossbow", "heavycrossbow"]);

/**
 * What the 2024 conditions do to an ATTACK ROLL, both roles — each rule the glossary's page; decided by
 * decide/reminders.js `conditionSources`. ⚠ The Condition Sources list's closed set and default derive
 * from these keys: a new condition is a row here and nothing else. Prone lives in `proneSources`.
 *   caveat  counted, and said;  note  listed, never counted
 *   critWithinFeet  a hit from within that many feet is a Critical Hit (auto-damage.js `critFor`)
 * @type {Readonly<Record<string, Readonly<{attacker: "advantage"|"disadvantage"|null, target: "advantage"|"disadvantage"|null, rule: object|string|null, caveat?: string, note?: string, critWithinFeet?: number}>>>}
 */
export const CONDITION_BENDS = Object.freeze({
  blinded: Object.freeze({ attacker: "disadvantage", target: "advantage",
    rule: Object.freeze({ page: "condition", key: "blinded", benefit: "Attacks Affected" }) }),
  invisible: Object.freeze({ attacker: "advantage", target: "disadvantage",
    rule: Object.freeze({ page: "condition", key: "invisible", benefit: "Attacks Affected" }) }),
  // The system's Hiding status: the glossary's Unseen Attackers and Targets clause.
  hiding: Object.freeze({ attacker: "advantage", target: "disadvantage",
    rule: Object.freeze({ page: "rule", key: "unseenattackers" }),
    caveat: "counted — press Normal if the other side can see you" }),
  paralyzed: Object.freeze({ attacker: null, target: "advantage",
    rule: Object.freeze({ page: "condition", key: "paralyzed", benefit: "Automatic Critical Hits" }),
    critWithinFeet: 5 }),
  petrified: Object.freeze({ attacker: null, target: "advantage",
    rule: Object.freeze({ page: "condition", key: "petrified", benefit: "Attacks Affected" }) }),
  poisoned: Object.freeze({ attacker: "disadvantage", target: null,
    rule: Object.freeze({ page: "condition", key: "poisoned", benefit: "Ability Checks and Attacks Affected" }) }),
  restrained: Object.freeze({ attacker: "disadvantage", target: "advantage",
    rule: Object.freeze({ page: "condition", key: "restrained", benefit: "Attacks Affected" }) }),
  stunned: Object.freeze({ attacker: null, target: "advantage",
    rule: Object.freeze({ page: "condition", key: "stunned", benefit: "Attacks Affected" }) }),
  unconscious: Object.freeze({ attacker: null, target: "advantage",
    rule: Object.freeze({ page: "condition", key: "unconscious", benefit: "Automatic Critical Hits" }),
    critWithinFeet: 5 }),
  frightened: Object.freeze({ attacker: "disadvantage", target: null,
    rule: Object.freeze({ page: "condition", key: "frightened", benefit: "Ability Checks and Attacks Affected" }),
    caveat: "counted — press Normal if the source of the fear is out of sight" }),
  grappled: Object.freeze({ attacker: "disadvantage", target: null,
    rule: Object.freeze({ page: "condition", key: "grappled", benefit: "Attacks Affected" }),
    caveat: "counted — press Normal if this attack is against the grappler" }),
  incapacitated: Object.freeze({ attacker: null, target: null,
    rule: Object.freeze({ page: "condition", key: "incapacitated", benefit: "Inactive" }),
    note: "an Incapacitated creature cannot attack at all — this roll should not be happening" }),
  dodging: Object.freeze({ attacker: null, target: "disadvantage",
    rule: Object.freeze({ page: "rule", key: "dodge" }),
    caveat: "counted — press Normal if it cannot see the attacker, is Incapacitated, or has Speed 0" }),
  charmed: Object.freeze({ attacker: null, target: null,
    rule: Object.freeze({ page: "condition", key: "charmed", benefit: "Can’t Harm the Charmer" }),
    note: "a Charmed creature cannot attack its charmer — if this is the charmer, this roll should not be happening" })
});

/** The table's rows, in the order the table reads them. */
export const CONDITION_KEYS = Object.freeze(Object.keys(CONDITION_BENDS));

/**
 * What the 2024 conditions do to a SAVING THROW (the glossary's page), read by decide/reminders.js
 * `saveSources`. `autoFail`: the save CANNOT succeed — a fourth button, still pressed (R1).
 * Not here: Exhaustion (dnd5e applies it); Poisoned and Frightened touch checks and attacks only.
 * @type {Readonly<Record<string, Readonly<{abilities: readonly string[], bend?: "advantage"|"disadvantage", autoFail?: boolean, rule: object|string|null, caveat?: string}>>>}
 */
export const SAVE_BENDS = Object.freeze({
  restrained: Object.freeze({ abilities: Object.freeze(["dex"]), bend: "disadvantage",
    rule: Object.freeze({ page: "condition", key: "restrained", benefit: "Saving Throws Affected" }) }),
  dodging: Object.freeze({ abilities: Object.freeze(["dex"]), bend: "advantage",
    rule: Object.freeze({ page: "rule", key: "dodge" }),
    caveat: "counted — press Normal if it is Incapacitated or its Speed is 0" }),
  paralyzed: Object.freeze({ abilities: Object.freeze(["str", "dex"]), autoFail: true,
    rule: Object.freeze({ page: "condition", key: "paralyzed", benefit: "Saving Throws Affected" }) }),
  stunned: Object.freeze({ abilities: Object.freeze(["str", "dex"]), autoFail: true,
    rule: Object.freeze({ page: "condition", key: "stunned", benefit: "Saving Throws Affected" }) }),
  unconscious: Object.freeze({ abilities: Object.freeze(["str", "dex"]), autoFail: true,
    rule: Object.freeze({ page: "condition", key: "unconscious", benefit: "Saving Throws Affected" }) }),
  petrified: Object.freeze({ abilities: Object.freeze(["str", "dex"]), autoFail: true,
    rule: Object.freeze({ page: "condition", key: "petrified", benefit: "Saving Throws Affected" }) })
});

/**
 * What the 2024 conditions do to an ABILITY CHECK (never initiative), the glossary's page.
 * ⚠ The platform already rolls a Poisoned check at Disadvantage: `platform` marks a reminder, never a
 * second application. Exhaustion is the system's subtraction — no row.
 * @type {Readonly<Record<string, Readonly<{bend: "advantage"|"disadvantage", rule: object|string|null, platform?: boolean}>>>}
 */
export const CHECK_BENDS = Object.freeze({
  poisoned: Object.freeze({ bend: "disadvantage", platform: true,
    rule: Object.freeze({ page: "condition", key: "poisoned", benefit: "Ability Checks and Attacks Affected" }) }),
  frightened: Object.freeze({ bend: "disadvantage",
    rule: Object.freeze({ page: "condition", key: "frightened", benefit: "Ability Checks and Attacks Affected" }) })
});

/**
 * Abilities that bend a roll, as an ACTIVE EFFECT on the sheet or a FEATURE with no effect; read by the
 * attack, check and save gates.
 *   match     "effect" (default) | "feature" — ⚠ a feature row must never name something that also lands
 *             as an effect (Innate Sorcery the feature is always on the sheet)
 *   counted   false — LISTED, not counted: the caveat IS the rule
 *   judge     a fact the module holds; an unknown map fact counts the row (the gate never guesses an exemption)
 *   spend     "attack" — the next attack roll uses the effect up, with a receipt
 *   only / except  "source" — the bend is for / against all but the creature that placed it (the module's
 *             stamp, else the origin); with no source `only` skips the row and `except` counts it
 *   member    only an emanation's MEMBER copy bends — the bearer's own effect of the same name never does
 *   checks / checksWhen  a bend on the bearer's ability checks, narrowed to { statuses, skills }
 *   saves     { bend, statuses?, spells?, abilities?, halfToNone? } scoped by the demand (`abilities`: the
 *             save's own ability, Irresistible Dance's Dexterity), or { succeeds, sleep } — the save
 *             cannot fail against magical sleep (a fourth button); B2's facets: `fails` (the save cannot
 *             succeed — the Fails button), `item` (the demand's item by name), `charmedBy: "source"` (the roller
 *             Charmed by the demand's caster), `sourceStatus` (the caster's status as it cast), `spells: "source"`
 *             (a spell of the effect's own source), `sourceFeature` (the effect's source holds the feature)
 *   side      "caster" — the row's carrier is the DEMAND's caster (the demand's `source` snapshot), not the roller
 *   spend     "save" — the save the row bends spends the effect (Struck), as "attack" does the next attack roll
 *   against   the carrier chip names the ONE creature it is against (`flags.<module>.against`): read at that target alone
 *   plus      a flat bonus to an attack roll AT the bearer (Sundered's +5), pushed onto the roll's parts by the gate —
 *             a listed source (no bend), `except: "source"` keeps it from the placer's own roll; NEGATIVE with
 *             `against: "attacker"` (B4, Multiattack Defense's −4): only the roll of the creature the bearer's chip names
 *   judge "opportunity" (B4, Escape the Horde): a melee attack off the attacker's combat turn — read as an Opportunity
 *             Attack (Halt's fact), the caveat said; out of combat, never
 *   attack    the bend rides ONE attack alone — the item making it (Object Slam, the GM's side): the attack
 *             itself is the carrier, no feature or effect is read;  judge "targetInSpace": the target's
 *             token overlaps the attacker's (Pack Tactics' map reading)
 * ⚠ Names are the packs' own, colons and all.
 *   allies    D1 — a `match: "feature"` row read off ANOTHER creature of the attacker's side on the scene (Improved Duplicity)
 *   match "worn"  the DMG — the carrier is a magic ITEM of that name the creature has equipped (and attuned to,
 *             where the item requires attunement): Mantle of Spell Resistance, Cloak of Displacement
 *   judge "displaced"  Cloak of Displacement — the wearer took no damage since its own last turn start, its Speed is not 0, and
 *             the pack's "Displacement Suppressed" is not switched on
 *   saves.by  D1 — the save is against WHOM and WHAT, read off the demand: `caster` (the effect's own source cast it),
 *             any of `spells` (a spell — with `types`, one dealing a listed damage type), `items` (the demand's item by name),
 *             `channel` (a Channel Divinity use); or `creatureTypes` (the caster's creature type — Holy Ward)
 *   itemOnly  D1 — the effect's own item must be the row's `item` (an unattributed effect of the same name never carries it)
 * @type {Readonly<Record<string, Readonly<{match?: "effect"|"feature"|"worn", attacker: "advantage"|"disadvantage"|null,
 *   target: "advantage"|"disadvantage"|null, scope: "any"|"spell"|"weapon"|"melee"|"ranged", caveat?: string,
 *   counted?: boolean, judge?: "bloodied"|"targetBloodied"|"targetDamaged"|"targetGrappled"|"targetNotActed"|"allyNearTarget"|"notIncapacitated"|"targetInSpace"|"opportunity"|"displaced"|"targetStatus", status?: string, spend?: "attack"|"save", attack?: string,
 *   only?: "source", except?: "source", side?: "caster", named?: string, against?: boolean|"attacker", plus?: number, rule: object|string|null, from: string}>>>}
 */
export const EFFECT_BENDS = Object.freeze({
  // --- A. standing, no caveat: the row is the whole truth ---------------------------------
  "Innate Sorcery": Object.freeze({ attacker: "advantage", target: null, scope: "spell", from: "Sorcerer",
    rule: Object.freeze({ item: "Innate Sorcery", uuid: "Compendium.dnd-players-handbook.classes.Item.phbscrInnateSorc" }) }),
  "Reckless": Object.freeze({ attacker: "advantage", target: "advantage", scope: "weapon", from: "Barbarian, Reckless Attack",
    rule: Object.freeze({ item: "Reckless Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbRecklessAt" }) }),
  "Foresight": Object.freeze({ attacker: "advantage", target: "disadvantage", scope: "any", from: "Foresight",
    rule: Object.freeze({ item: "Foresight", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplForesight0" }) }),
  "Blurred": Object.freeze({ attacker: null, target: "disadvantage", scope: "any", from: "Blur",
    rule: Object.freeze({ item: "Blur", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplBlur000000" }) }),
  "Holy Protection": Object.freeze({ attacker: null, target: "disadvantage", scope: "any", from: "Holy Aura",
    rule: Object.freeze({ item: "Holy Aura", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplHolyAura00" }) }),
  "Shining": Object.freeze({ attacker: null, target: "advantage", scope: "any", from: "Shining Smite",
    rule: Object.freeze({ item: "Shining Smite", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplShiningSmi" }) }),
  "Crushed": Object.freeze({ attacker: null, target: "advantage", scope: "any", from: "Crusher",
    rule: Object.freeze({ item: "Crusher", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftCrusher0000", benefit: "Enhanced Critical" }) }),
  "Slashed": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", from: "Slasher",
    rule: Object.freeze({ item: "Slasher", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftSlasher0000", benefit: "Enhanced Critical" }) }),
  "Zealous Presence": Object.freeze({ attacker: "advantage", target: null, scope: "any", from: "Zealot Barbarian",
    rule: Object.freeze({ item: "Zealous Presence", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbZealousPre" }) }),
  "Rallied": Object.freeze({ attacker: "advantage", target: null, scope: "any", from: "Rally (monsters)",
    rule: Object.freeze({ item: "Rally", uuid: "Compendium.dnd-monster-manual.features.Item.mmRally000000000" }) }),
  "Attack: Advantage": Object.freeze({ attacker: "advantage", target: null, scope: "any", from: "War Cry (monsters)",
    rule: Object.freeze({ item: "War Cry", uuid: "Compendium.dnd-monster-manual.features.Item.mmWarCry00000000" }) }),
  "Adv: Attacks & Saves": Object.freeze({ attacker: "advantage", target: null, scope: "any", from: "Marshal Undead (monsters)",
    rule: Object.freeze({ item: "Marshal Undead", uuid: "Compendium.dnd-monster-manual.features.Item.mmMarshalUndead0" }) }),
  "Manacled": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", from: "Manacles",
    rule: Object.freeze({ item: "Manacles", uuid: "Compendium.dnd-players-handbook.equipment.Item.phbagManacles000" }) }),
  "Heated Metal": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", checks: "disadvantage", from: "Heat Metal",
    rule: Object.freeze({ item: "Heat Metal", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplHeatMetal0" }) }),
  "Averse": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", checks: "disadvantage", from: "Aversion to Fire (monsters)",
    rule: Object.freeze({ item: "Aversion to Fire", uuid: "Compendium.dnd-dungeon-masters-guide.features.Item.dmgAversionToFir" }) }),
  "Target: Disadvantage": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", from: "Sap, Pesky Swarm (monsters)",
    rule: Object.freeze({ item: "Flash of Light", uuid: "Compendium.dnd-monster-manual.features.Item.mmFlashOfLight00" }) }),
  "Attacks: Disadvantage": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", from: "Flash of Light (monsters)",
    rule: Object.freeze({ item: "Flash of Light", uuid: "Compendium.dnd-monster-manual.features.Item.mmFlashOfLight00" }) }),
  "Attack and Save Disadvantage": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", from: "Howl (Ravenloft)",
    saves: Object.freeze({ bend: "disadvantage" }),
    rule: Object.freeze({ item: "Howl", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwHowlA3f2I58L3" }) }),
  "Cursed (Path to the Grave)": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", from: "Path to the Grave (Ravenloft)",
    saves: Object.freeze({ bend: "disadvantage" }),
    rule: Object.freeze({ item: "Path to the Grave", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwCSPathtotheCb" }) }),
  "Disadv. Attacks & Saves": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", from: "Sunlight (monsters)",
    rule: Object.freeze({ item: "Sunlight", uuid: "Compendium.dnd-monster-manual.features.Item.mmSunlight000000" }) }),
  "Disadv. Attacks & Checks": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", from: "Vampire Weakness (monsters)",
    rule: Object.freeze({ item: "Vampire Weakness", uuid: "Compendium.dnd-monster-manual.features.Item.mmVampireWeaknes", benefit: "Sunlight" }) }),
  "Disadv.: Attacks & Checks": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", from: "Fear of Fire (monsters)",
    rule: Object.freeze({ item: "Fear of Fire", uuid: "Compendium.dnd-monster-manual.features.Item.mmFearOfFire0000" }) }),
  // --- B. the effect sits on the creature the feature is USED ON, the source judging (`only`/`except`);
  // read on the owner's own sheet these fire for nobody. A caveat stays where a fact is unreadable.
  "Vow of Enmity": Object.freeze({ attacker: null, target: "advantage", scope: "any", only: "source", from: "Paladin",
    rule: Object.freeze({ item: "Vow of Enmity", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnVowOfEnmit" }) }),
  // The pack's effect is on the MONSTER; the marked creature is nowhere in the data.
  "Prey: Attack Advantage": Object.freeze({ attacker: "advantage", target: null, scope: "any", from: "Marked as Prey (monsters)",
    caveat: "counted — press Normal if this attack is not at the marked creature",
    rule: Object.freeze({ item: "Marked as Prey", uuid: "Compendium.dnd-monster-manual.features.Item.mmMarkedAsPrey00" }) }),
  // Both sides are the source's alone.
  "Clairvoyant Combatant": Object.freeze({ attacker: "disadvantage", target: "advantage", scope: "any", only: "source", from: "Clairvoyant Combatant",
    rule: Object.freeze({ item: "Clairvoyant Combatant", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkClairvoyan" }) }),
  "Strike Fear: Terrify": Object.freeze({ attacker: null, target: "advantage", scope: "any", only: "source", from: "Strike Fear (Heroes of Faerûn)",
    caveat: "counted — press Normal if the target is no longer Frightened by you",
    rule: Object.freeze({ item: "Strike Fear", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofSotStrikeFear", benefit: "Terrify" }) }),
  "Compelled": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", except: "source", from: "Compelled Duel",
    rule: Object.freeze({ item: "Compelled Duel", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplCompelledD" }) }),
  "Goaded": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", except: "source", from: "Battle Master, Goading Attack",
    rule: Object.freeze({ item: "Goading Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvGoadingAtt" }) }),
  "Taunted": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", except: "source", from: "Steps of the Fey",
    rule: Object.freeze({ item: "Steps of the Fey", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkStepsOfThe", benefit: "Taunting Step" }) }),
  // The packs carry no data for these save bends; the rows are where it lives.
  "Aura of Purity": Object.freeze({ attacker: null, target: null, scope: "any", from: "Aura of Purity",
    saves: Object.freeze({ bend: "advantage", statuses: Object.freeze(["blinded", "charmed", "deafened", "frightened", "paralyzed", "poisoned", "stunned"]) }),
    rule: Object.freeze({ item: "Aura of Purity", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplAuraofPuri" }) }),
  "Circle's Power": Object.freeze({ attacker: null, target: null, scope: "any", from: "Circle of Power",
    saves: Object.freeze({ bend: "advantage", spells: true, halfToNone: true }),
    rule: Object.freeze({ item: "Circle of Power", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplCircleofPo" }) }),
  // The pack's effect carries the Poison Resistance; the Advantage against Poisoned is this row's.
  "Poison Protection": Object.freeze({ attacker: null, target: null, scope: "any", from: "Protection from Poison",
    saves: Object.freeze({ bend: "advantage", statuses: Object.freeze(["poisoned"]) }),
    rule: Object.freeze({ item: "Protection from Poison", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplProtection" }) }),
  // The pack's effect carries Charmed alone; the dance's bends are this row's (the repeat, REPEAT_SAVES).
  "Irresistible Dance": Object.freeze({ attacker: "disadvantage", target: "advantage", scope: "any", from: "Otto's Irresistible Dance",
    saves: Object.freeze({ bend: "disadvantage", abilities: Object.freeze(["dex"]) }),
    rule: Object.freeze({ item: "Otto's Irresistible Dance", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplOttosIrres" }) }),
  "Cursed Attacks": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", from: "Bestow Curse",
    caveat: "counted — press Normal if this attack is not at the caster",
    rule: Object.freeze({ item: "Bestow Curse", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplBestowCurs" }) }),
  // The Wolf's ring members (EMANATIONS "Rage of the Wolf"): the barbarian's allies attack them with Advantage.
  "Rage of the Wolf": Object.freeze({ attacker: null, target: "advantage", scope: "any", member: true, except: "source",
    from: "Barbarian — Path of the Wild Heart 3 (Rage of the Wilds: Wolf)",
    caveat: "counted — an attacker who is not the barbarian's ally is the table's to press Normal",
    rule: Object.freeze({ item: "Rage of the Wilds", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbRageOfTheW", benefit: "Wolf" }) }),
  // C1 — the Lion's ring members (EMANATIONS "Power of the Wilds"): an enemy inside attacks anyone but the barbarian at
  // Disadvantage — the module-made member copy is the carrier; `except: "source"` spares the attack aimed at the rager.
  "Power of the Wilds: Lion": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", member: true, except: "source",
    from: "Barbarian — Path of the Wild Heart 14 (Power of the Wilds: Lion)",
    caveat: "counted — \"another Barbarian who has this option\" as a target is the table's to press Normal",
    rule: Object.freeze({ item: "Power of the Wilds", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbPowerOfThe", benefit: "Lion" }) }),
  // C1 — Trance of Order: attack rolls against the sorcerer CANNOT have Advantage (`cancel: "advantage"` — every Advantage
  // source on the roll is struck, Brutal Strike's forgo shape, and the gate says why); its own d20 floor of 10 is D20_FLOORS'.
  "Trance of Order": Object.freeze({ attacker: null, target: null, scope: "any", cancel: "advantage", from: "Sorcerer — Clockwork Sorcery 14",
    rule: Object.freeze({ item: "Trance of Order", uuid: "Compendium.dnd-players-handbook.classes.Item.phbscrTranceOfOr" }) }),
  // D1 — Elusive: Trance of Order's cancel on a FEATURE (`match: "feature"`), off while the rogue is Incapacitated
  // (Displacement's `notIncapacitated` judge) — no attack roll against it can have Advantage.
  "Elusive": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", cancel: "advantage", judge: "notIncapacitated",
    from: "Rogue 18",
    rule: Object.freeze({ item: "Elusive", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeElusive000" }) }),
  // `item`: only an effect from THIS item (the Aura of Protection's "Protected" is a save bonus).
  "Protected": Object.freeze({ attacker: null, target: "disadvantage", scope: "any", from: "Protection from Evil and Good", item: "Protection from Evil and Good",
    caveat: "counted — press Normal if the attacker is not an Aberration, Celestial, Elemental, Fey, Fiend or Undead",
    rule: Object.freeze({ item: "Protection from Evil and Good", uuid: "Compendium.dnd-players-handbook.spells.Item.phbEvilAndGoodPr" }) }),
  // The "Protected" the Protection answer lands (hold/continue.js), found by `named`; it bends only
  // while the guard stands within `sourceWithin` feet.
  "Protected (Protection)": Object.freeze({ named: "Protected", attacker: null, target: "disadvantage", scope: "any", from: "Protection (Fighting Style)", item: "Protection",
    sourceWithin: 5,
    rule: Object.freeze({ item: "Protection", uuid: "Compendium.dnd-players-handbook.feats.Item.phbfstProtection" }) }),
  "Protection from Evil and Good": Object.freeze({ attacker: null, target: "disadvantage", scope: "any", from: "Protection from Evil and Good (2014)",
    caveat: "counted — press Normal if the attacker is not an Aberration, Celestial, Elemental, Fey, Fiend or Undead",
    rule: Object.freeze({ item: "Protection from Evil and Good", uuid: "Compendium.dnd-players-handbook.spells.Item.phbEvilAndGoodPr" }) }),
  "Dispelling Evil and Good": Object.freeze({ attacker: null, target: "disadvantage", scope: "any", from: "Dispel Evil and Good",
    caveat: "counted — press Normal if the attacker is not a Celestial, Elemental, Fey, Fiend or Undead",
    rule: Object.freeze({ item: "Dispel Evil and Good", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplDispelEvil" }) }),
  "Assasinate": Object.freeze({ attacker: "advantage", target: null, scope: "any", from: "Assassin Rogue (the pack's own spelling)",
    caveat: "counted — press Normal if this is not the first round, or the target has taken a turn",
    rule: Object.freeze({ item: "Assassinate", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeAssasinate", benefit: "Surprising Strikes" }) }),
  // --- listed, not counted: the caveat is the rule ------------------------------------------
  "Chill Touch": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", counted: false, from: "Chill Touch (2014)",
    caveat: "listed — Disadvantage only for an Undead attacker, and only against the caster",
    rule: Object.freeze({ item: "Chill Touch", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplChillTouch" }) }),
  "Shocking Grasp": Object.freeze({ attacker: "advantage", target: null, scope: "spell", counted: false, from: "Shocking Grasp (2014)",
    caveat: "listed — Advantage only if the target wears metal armor",
    rule: Object.freeze({ item: "Shocking Grasp", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplShockingGr" }) }),
  "Boots of Speed Active": Object.freeze({ attacker: null, target: "disadvantage", scope: "any", counted: false, from: "Boots of Speed",
    caveat: "listed — Disadvantage only on an Opportunity Attack",
    rule: Object.freeze({ item: "Boots of Speed", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgBootsOfSpeed0" }) }),
  "Demon Armor": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", counted: false, from: "Demon Armor",
    caveat: "listed — Disadvantage only against demons",
    rule: Object.freeze({ item: "Demon Armor", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgDemonArmor000", benefit: "Curse" }) }),
  "Air Focus": Object.freeze({ attacker: "advantage", target: "disadvantage", scope: "any", counted: false, from: "Ring of Elemental Command",
    caveat: "listed — only against, or from, Elementals",
    rule: Object.freeze({ item: "Air Ring of Elemental Command", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgAirRingOfElem", benefit: "Elemental Bane" }) }),
  "Earth Focus": Object.freeze({ attacker: "advantage", target: "disadvantage", scope: "any", counted: false, from: "Ring of Elemental Command",
    caveat: "listed — only against, or from, Elementals",
    rule: Object.freeze({ item: "Earth Ring of Elemental Command", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgEarthRingOfEl", benefit: "Elemental Bane" }) }),
  "Fire Focus": Object.freeze({ attacker: "advantage", target: "disadvantage", scope: "any", counted: false, from: "Ring of Elemental Command",
    caveat: "listed — only against, or from, Elementals",
    rule: Object.freeze({ item: "Fire Ring of Elemental Command", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgFireRingOfEle", benefit: "Elemental Bane" }) }),
  "Water Focus": Object.freeze({ attacker: "advantage", target: "disadvantage", scope: "any", counted: false, from: "Ring of Elemental Command",
    caveat: "listed — only against, or from, Elementals",
    rule: Object.freeze({ item: "Ring of Elemental Command", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgRingOfElement", benefit: "Elemental Bane" }) }),
  "Ring Focus": Object.freeze({ attacker: "advantage", target: "disadvantage", scope: "any", counted: false, from: "Ring of Water Elemental Command (2014)",
    caveat: "listed — only against, or from, Water Elementals",
    rule: Object.freeze({ item: "Ring of Water Elemental Command", uuid: "Compendium.dnd5e.items.Item.HnIERWmmra74hSCw" }) }),
  "Berserker Axe": Object.freeze({ attacker: "disadvantage", target: null, scope: "weapon", counted: false, from: "Berserker Axe",
    caveat: "listed — Disadvantage only with a weapon other than the axe",
    rule: Object.freeze({ item: "Berserker Battleaxe", uuid: "Compendium.dnd5e.items.Item.dvNzJqb7vq6oJlA2", benefit: "Curse" }) }),
  "Oathbow": Object.freeze({ attacker: "disadvantage", target: null, scope: "weapon", counted: false, from: "Oathbow",
    caveat: "listed — Disadvantage only with a weapon other than the bow, while the sworn enemy lives",
    rule: Object.freeze({ item: "Oathbow", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgOathbow000000" }) }),
  "Sword of Vengeance": Object.freeze({ attacker: "disadvantage", target: null, scope: "weapon", counted: false, from: "Sword of Vengeance",
    caveat: "listed — Disadvantage only with a weapon other than the sword",
    rule: Object.freeze({ item: "Sword of Vengeance", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgSwordOfVengea" }) }),
  // --- C. spent by the next attack roll — Vex and Sap's shape ---------------------------------
  "Guiding Bolt": Object.freeze({ attacker: null, target: "advantage", scope: "any", spend: "attack", from: "Guiding Bolt",
    rule: Object.freeze({ item: "Guiding Bolt", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplGuidingBol" }) }),
  "Mocked": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", spend: "attack", from: "Vicious Mockery",
    rule: Object.freeze({ item: "Vicious Mockery", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplViciousMoc" }) }),
  "Vicious Mockery": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", spend: "attack", from: "Vicious Mockery (2014)",
    rule: Object.freeze({ item: "Vicious Mockery", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplViciousMoc" }) }),
  "Enervated": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", spend: "attack", from: "Ray of Enfeeblement",
    rule: Object.freeze({ item: "Ray of Enfeeblement", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplRayofEnfee" }) }),
  "Brief Enfeeblement": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", spend: "attack", from: "Ray of Enfeeblement",
    rule: Object.freeze({ item: "Ray of Enfeeblement", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplRayofEnfee" }) }),
  // On the TARGET, the fighter as source (superiority-uses.js): the fighter's next attack alone spends it.
  "Feinting Attack": Object.freeze({ attacker: null, target: "advantage", scope: "any", only: "source", spend: "attack", from: "Battle Master",
    rule: Object.freeze({ item: "Feinting Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvFeintingAt" }) }),
  "Distracted": Object.freeze({ attacker: null, target: "advantage", scope: "any", spend: "attack", except: "source", from: "Battle Master, Distracting Strike",
    rule: Object.freeze({ item: "Distracting Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvDistractin" }) }),
  "Aiming: Attack Advantage": Object.freeze({ attacker: "advantage", target: null, scope: "any", spend: "attack", from: "Aim, Deadly Aim (monsters)",
    rule: Object.freeze({ item: "Aim", uuid: "Compendium.dnd-monster-manual.features.Item.mmAim00000000000" }) }),
  "Killer's Fortune (Attack Advantage)": Object.freeze({ attacker: "advantage", target: null, scope: "any", spend: "attack", from: "Boon of Bloodshed (Heroes of Faerûn)",
    rule: Object.freeze({ item: "Boon of Bloodshed", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofBoonofBloodsh", benefit: "Killer’s Fortune" }) }),
  "Adv. Next Attack": Object.freeze({ attacker: "advantage", target: null, scope: "any", spend: "attack", from: "Lords' Alliance Agent (Heroes of Faerûn)",
    caveat: "counted — press Normal if this attack is not at the enemy that hurt your ally",
    rule: Object.freeze({ item: "Lords' Alliance Agent", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofLordsAlliance", benefit: "Reassert Honor" }) }),
  "Moonlight Step": Object.freeze({ attacker: "advantage", target: null, scope: "any", spend: "attack", from: "Moon Druid",
    rule: Object.freeze({ item: "Moonlight Step", uuid: "Compendium.dnd-players-handbook.classes.Item.phbdrdMoonlightS" }) }),
  "Disadvantaged": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", spend: "attack", from: "Rival Coin",
    rule: Object.freeze({ item: "Rival Coin", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgRivalCoin0000", benefit: "Heads" }) }),
  "Vigilant": Object.freeze({ attacker: null, target: "disadvantage", scope: "any", spend: "attack", from: "Tyro of the Gauntlet (Heroes of Faerûn)",
    rule: Object.freeze({ item: "Tyro of the Gauntlet", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofTyrooftheGaun", benefit: "Vigilant" }) }),
  // --- D. a feature, matched by name. Pack Tactics is judged on the map; its caveat is an unknown side.
  "Pack Tactics": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any", judge: "allyNearTarget", from: "monsters",
    caveat: "counted — when the attacker's side cannot be read; press Normal if no ally of the attacker is within 5 feet of the target",
    rule: Object.freeze({ item: "Pack Tactics", uuid: "Compendium.dnd-monster-manual.features.Item.mmPackTactics000" }) }),
  "Bloodied Fury": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any", judge: "bloodied", from: "monsters",
    rule: Object.freeze({ item: "Bloodied Fury", uuid: "Compendium.dnd-monster-manual.features.Item.mmBloodiedFury00" }) }),
  "Bloodied Frenzy": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any", judge: "bloodied", from: "monsters",
    rule: Object.freeze({ item: "Bloodied Frenzy", uuid: "Compendium.dnd-monster-manual.features.Item.mmBloodiedFrenzy" }) }),
  "Purple Dragon Commandant": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any", judge: "bloodied", from: "Heroes of Faerûn",
    rule: Object.freeze({ item: "Purple Dragon Commandant", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofPurpleDragonC", benefit: "Last Stand" }) }),
  "Warrior's Wrath": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "melee", judge: "targetBloodied", from: "DMG",
    rule: Object.freeze({ item: "Warrior's Wrath", uuid: "Compendium.dnd-dungeon-masters-guide.features.Item.dmgWarriorsWrath" }) }),
  "Blood Frenzy": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any", judge: "targetDamaged", from: "monsters",
    rule: Object.freeze({ item: "Blood Frenzy", uuid: "Compendium.dnd-monster-manual.features.Item.mmBloodFrenzy000" }) }),
  "Grappler": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any", judge: "targetGrappled", from: "the Grappler feat",
    caveat: "counted — press Normal if the target is not Grappled by you",
    rule: Object.freeze({ item: "Grappler", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftGrappler000", benefit: "Attack Advantage" }) }),
  "Street Justice": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any", judge: "targetGrappled", from: "Heroes of Faerûn",
    caveat: "counted — press Normal if the target is not Grappled by your ally",
    rule: Object.freeze({ item: "Street Justice", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofStreetJustice", benefit: "Headlock" }) }),
  "Precise Hunter": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any", from: "Ranger",
    caveat: "counted — press Normal if the target is not your Hunter's Mark",
    rule: Object.freeze({ item: "Precise Hunter", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrPreciseHun" }) }),
  "Light Sensitivity": Object.freeze({ match: "feature", attacker: "disadvantage", target: null, scope: "any", counted: false, from: "monsters",
    caveat: "listed — Disadvantage only in Bright Light",
    rule: Object.freeze({ item: "Light Sensitivity", uuid: "Compendium.dnd-monster-manual.features.Item.mmLightSensitivi" }) }),
  "Sunlight Sensitivity": Object.freeze({ match: "feature", attacker: "disadvantage", target: null, scope: "any", counted: false, from: "monsters",
    caveat: "listed — Disadvantage only in sunlight",
    rule: Object.freeze({ item: "Sunlight Sensitivity", uuid: "Compendium.dnd-monster-manual.features.Item.mmSunlightSensit" }) }),
  // THE GM'S SIDE — the attack's own bend, judged on the map: Advantage when the target stands inside the bearer's space.
  "Object Slam": Object.freeze({ match: "feature", attack: "Object Slam", attacker: "advantage", target: null, scope: "any", judge: "targetInSpace", from: "monsters (mimics)",
    rule: Object.freeze({ item: "Object Slam", uuid: "Compendium.dnd-monster-manual.features.Item.mmObjectSlam0000" }) }),
  "Sun Sickness": Object.freeze({ match: "feature", attacker: "disadvantage", target: null, scope: "any", counted: false, from: "monsters (fomorians)",
    caveat: "listed — Disadvantage on D20 Tests only in sunlight; the hour's death clock is the table's",
    rule: Object.freeze({ item: "Sun Sickness", uuid: "Compendium.dnd-monster-manual.features.Item.mmSunSickness000" }) }),
  "Sunlight Weakness": Object.freeze({ match: "feature", attacker: "disadvantage", target: null, scope: "any", counted: false, from: "monsters",
    caveat: "listed — Disadvantage only in sunlight",
    rule: Object.freeze({ item: "Vampire Weakness", uuid: "Compendium.dnd-monster-manual.features.Item.mmVampireWeaknes", benefit: "Sunlight" }) }),
  "Sunlight Hypersensitivity": Object.freeze({ match: "feature", attacker: "disadvantage", target: null, scope: "any", counted: false, from: "monsters",
    caveat: "listed — Disadvantage only in sunlight",
    rule: Object.freeze({ item: "Sunlight Hypersensitivity", uuid: "Compendium.dnd-monster-manual.features.Item.mmSunlightHypers" }) }),
  "Mounted Combatant": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any", counted: false, from: "the Mounted Combatant feat",
    caveat: "listed — Advantage only while mounted, against a smaller unmounted creature within 5 feet of the mount",
    rule: Object.freeze({ item: "Mounted Combatant", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftMountedComb", benefit: "Mounted Strike" }) }),
  "Invoke Duplicity": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any", counted: false, from: "Trickery Cleric",
    caveat: "listed — Advantage only with the illusion and you both within 5 feet of the target",
    rule: Object.freeze({ item: "Invoke Duplicity", uuid: "Compendium.dnd-players-handbook.classes.Item.phbclcInvokeDupl", benefit: "Distract" }) }),
  // D1 — Improved Duplicity's Shared Distraction: the bend serves the cleric's ALLIES (`allies` — the feature held by another
  // creature of the attacker's side on the scene); listed, as Invoke Duplicity is (the illusion is not a token the module
  // reads). The cleric's own attacks keep Invoke Duplicity's row; Healing Illusion is the table's.
  "Improved Duplicity": Object.freeze({ match: "feature", allies: true, attacker: "advantage", target: null, scope: "any", counted: false,
    from: "Trickery Cleric 17",
    caveat: "listed — Advantage only against a creature within 5 feet of the cleric's illusion",
    rule: Object.freeze({ item: "Improved Duplicity", uuid: "Compendium.dnd-players-handbook.classes.Item.phbclcImprovedDu", benefit: "Shared Distraction" }) }),
  // D1 — the auras' save bends, read off the demand (`saves.by`, decide/reminders.js). Corona of Light's member copy: Disadvantage
  // against the cleric's own (`caster`) spell dealing fire or radiant damage, or its Radiance of the Dawn.
  "Corona of Light": Object.freeze({ attacker: null, target: null, scope: "any", member: true, from: "Cleric — Light Domain 17",
    saves: Object.freeze({ bend: "disadvantage", by: Object.freeze({ caster: true, spells: true, types: Object.freeze(["fire", "radiant"]), items: Object.freeze(["Radiance of the Dawn"]) }) }),
    rule: Object.freeze({ item: "Corona of Light", uuid: "Compendium.dnd-players-handbook.classes.Item.phbclcCoronaOfLi" }) }),
  // Elder Champion's member copy: Disadvantage against the paladin's spells and Channel Divinity options.
  "Diminished Defiance": Object.freeze({ attacker: null, target: null, scope: "any", member: true, from: "Paladin — Oath of the Ancients 20",
    saves: Object.freeze({ bend: "disadvantage", by: Object.freeze({ caster: true, spells: true, channel: true }) }),
    rule: Object.freeze({ item: "Elder Champion", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnElderChamp", benefit: "Diminish Defiance" }) }),
  // Holy Nimbus's Holy Ward: the paladin's own effect — Advantage on a save a Fiend or an Undead forces (the caster's type).
  "Holy Nimbus": Object.freeze({ attacker: null, target: null, scope: "any", from: "Paladin — Oath of Devotion 20",
    saves: Object.freeze({ bend: "advantage", by: Object.freeze({ creatureTypes: Object.freeze(["fiend", "undead"]) }) }),
    rule: Object.freeze({ item: "Holy Nimbus", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnHolyNimbus", benefit: "Holy Ward" }) }),
  // Avenging Angel's Frightened: attack rolls against the creature have Advantage — only the copy its Frightful Aura landed
  // (`itemOnly`: the effect's own item must be Avenging Angel; every other Frightened is the condition's row).
  "Avenging Angel: Frightened": Object.freeze({ named: "Frightened", item: "Avenging Angel", itemOnly: true, attacker: null, target: "advantage", scope: "any",
    from: "Paladin — Oath of Vengeance 20",
    rule: Object.freeze({ item: "Avenging Angel", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnAvengingAn", benefit: "Frightful Aura" }) }),
  "Ambusher": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any", counted: false, from: "monsters",
    caveat: "listed — Advantage only in the first round, against a creature it surprised",
    rule: Object.freeze({ item: "Ambusher", uuid: "Compendium.dnd5e.monsterfeatures.Item.EMygUh5uRujWaFYK" }) }),
  // --- E. a use chip, named as the feature (the pack ships Steady Aim with no effect), and the combat
  // clock as judge (`targetNotActed`: the round and the turn order; never out of combat).
  "Steady Aim": Object.freeze({ attacker: "advantage", target: null, scope: "any", spend: "attack",
    rule: Object.freeze({ item: "Steady Aim", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeSteadyAim0" }),
    from: "Rogue 3 (a use chip)" }),
  // B4 — the use chips: Shadow Step (the next melee attack), Multiattack Defense (the chip on the RANGER, −4 to the named
  // attacker's rolls for the rest of the turn); Escape the Horde: the ranger's own feature, Opportunity Attacks at Disadvantage.
  "Shadow Step": Object.freeze({ attacker: "advantage", target: null, scope: "melee", spend: "attack",
    rule: Object.freeze({ item: "Shadow Step", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkShadowStep" }),
    from: "Monk — Warrior of Shadow 6 (a use chip)" }),
  "Multiattack Defense": Object.freeze({ attacker: null, target: null, scope: "any", plus: -4, against: "attacker",
    rule: Object.freeze({ item: "Defensive Tactics", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrDefensiveT", benefit: "Multiattack Defense" }),
    from: "Ranger — Hunter 7 (a use chip)" }),
  "Escape the Horde": Object.freeze({ match: "feature", named: "Defensive Tactics", attacker: null, target: "disadvantage", scope: "melee", judge: "opportunity",
    caveat: "counted — Opportunity Attacks only: a melee attack off the attacker's turn in combat is read as one",
    rule: Object.freeze({ item: "Defensive Tactics", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrDefensiveT", benefit: "Escape the Horde" }),
    from: "Ranger — Hunter 7" }),
  "Assassinate": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any",
    judge: "targetNotActed",
    rule: Object.freeze({ item: "Assassinate", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeAssasinate", benefit: "Surprising Strikes" }),
    from: "Rogue — Assassin (Surprising Strikes)" }),
  // --- G. species traits bending SAVES (text only in the pack, read by name). A sheet save to END the
  // condition has no demand: listed, never counted (R1).
  "Brave": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", from: "Halfling",
    saves: Object.freeze({ bend: "advantage", statuses: Object.freeze(["frightened"]) }),
    rule: Object.freeze({ item: "Halfling", uuid: "Compendium.dnd-players-handbook.origins.Item.phbspHalfling000", benefit: "Brave" }) }),
  "Fey Ancestry": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", from: "Elf",
    saves: Object.freeze({ bend: "advantage", statuses: Object.freeze(["charmed"]) }),
    rule: Object.freeze({ item: "Fey Ancestry", uuid: "Compendium.dnd-players-handbook.origins.Item.phbsptFeyAncestr" }) }),
  "Dwarven Resilience": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", from: "Dwarf",
    saves: Object.freeze({ bend: "advantage", statuses: Object.freeze(["poisoned"]) }),
    rule: Object.freeze({ item: "Dwarf", uuid: "Compendium.dnd-players-handbook.origins.Item.phbspDwarf000000", benefit: "Dwarven Resilience" }) }),
  // Cannot fail a save whose failure would sleep it (decide/demand.js `putsToSleep`).
  "Trance": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", from: "Elf",
    saves: Object.freeze({ succeeds: true, sleep: true }),
    rule: Object.freeze({ item: "Trance", uuid: "Compendium.dnd-players-handbook.origins.Item.phbsptTrance0000" }) }),
  // --- H. monster traits bending SAVES against magic (the GM's side) — the demand's own `spell` mark
  // (a spell, or an item with the Magical property). Text only in the pack; the rows are the data.
  "Magic Resistance": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", from: "monsters",
    saves: Object.freeze({ bend: "advantage", spells: true }),
    rule: Object.freeze({ item: "Magic Resistance", uuid: "Compendium.dnd-monster-manual.features.Item.mmMagicResistanc" }) }),
  // C1 — Spell Resistance: Magic Resistance's row on a PC feature; the Resistance to spell damage is the table's.
  "Spell Resistance": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", from: "Wizard — Abjurer 14",
    saves: Object.freeze({ bend: "advantage", spells: true }),
    caveat: "counted — the Resistance to the damage of spells is the table's (no seam tells a spell's damage from a trait's on every path)",
    rule: Object.freeze({ item: "Spell Resistance", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwzdSpellResis" }) }),
  // The save cannot fail (the fourth button); "the attack rolls of spells automatically miss it" is the
  // table's — the attack gate has no auto-miss (RULINGS *The GM's side — the five shapes*).
  "Greater Magic Resistance": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", from: "monsters",
    saves: Object.freeze({ succeeds: true, spells: true }),
    caveat: "counted — the spell attacks that automatically miss are the table's",
    rule: Object.freeze({ item: "Greater Magic Resistance", uuid: "Compendium.dnd-monster-manual.features.Item.mmGreaterMagicRe" }) }),
  // --- I. THE DMG's magic items (audits/plans/dmg-build.md): Magic Resistance's row on a WORN item (`match: "worn"` —
  // equipped, and attuned where the item requires it). The demand's `spell` mark reads spells and magical effects alike;
  // `spells: "cast"` narrows a row to a SPELL cast (the demand's `cast` mark — a spell item, the thing a slot pays for):
  // the Mantle and the Ring say "spells" alone (RULINGS *The DMG — the worn items*).
  "Mantle of Spell Resistance": Object.freeze({ match: "worn", attacker: null, target: null, scope: "any", from: "DMG wondrous item",
    saves: Object.freeze({ bend: "advantage", spells: "cast" }),
    rule: Object.freeze({ item: "Mantle of Spell Resistance", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgMantleOfSpell" }) }),
  "Ring of Spell Turning": Object.freeze({ match: "worn", attacker: null, target: null, scope: "any", from: "DMG ring",
    saves: Object.freeze({ bend: "advantage", spells: "cast" }),
    caveat: "counted — the spell of level 7 or lower that has no effect on a success, and the reflection, are the table's",
    rule: Object.freeze({ item: "Ring of Spell Turning", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgRingOfSpellTu" }) }),
  "Robe of the Archmagi": Object.freeze({ match: "worn", attacker: null, target: null, scope: "any", from: "DMG wondrous item",
    saves: Object.freeze({ bend: "advantage", spells: true }),
    rule: Object.freeze({ item: "Robe of the Archmagi", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgRobeOfTheArch", benefit: "Magic Resistance" }) }),
  "Scarab of Protection": Object.freeze({ match: "worn", attacker: null, target: null, scope: "any", from: "DMG wondrous item",
    saves: Object.freeze({ bend: "advantage", spells: true }),
    rule: Object.freeze({ item: "Scarab of Protection", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgScarabOfProte", benefit: "Spell Resistance" }) }),
  // Spellguard Shield: the saves AND spell attack rolls against the bearer at Disadvantage (`scope: "spell"`).
  "Spellguard Shield": Object.freeze({ match: "worn", attacker: null, target: "disadvantage", scope: "spell", from: "DMG shield",
    saves: Object.freeze({ bend: "advantage", spells: true }),
    rule: Object.freeze({ item: "Spellguard Shield", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgSpellguardShi" }) }),
  // A supernatural gift is a feat on the sheet: the plain feature row.
  "Blessing of Magic Resistance": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", from: "DMG supernatural gift",
    saves: Object.freeze({ bend: "advantage", spells: true }),
    rule: Object.freeze({ item: "Blessing of Magic Resistance", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgBlessingOfMag" }) }),
  // Cloak of Displacement: Displacement's Disadvantage on a WORN cloak, off once the wearer took damage since its own last turn
  // start, while its Speed is 0, or with the pack's "Displacement Suppressed" switched on (`judge: "displaced"`).
  "Cloak of Displacement": Object.freeze({ match: "worn", attacker: null, target: "disadvantage", scope: "any", judge: "displaced", from: "DMG wondrous item",
    rule: Object.freeze({ item: "Cloak of Displacement", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgCloakOfDispla" }) }),
  // Arrow-Catching Shield's +2 AC against RANGED attack rolls, as the gate's −2 on the roll (Multiattack Defense's `plus`);
  // the pack ships the bonus as an optional toggle. Intercept Attack (become the target) waits for the redirect kind.
  "Arrow-Catching Shield": Object.freeze({ match: "worn", attacker: null, target: null, scope: "ranged", plus: -2, from: "DMG shield",
    caveat: "counted — the Reaction to become the target instead is the table's (the redirect waits for its kind)",
    rule: Object.freeze({ item: "Arrow-Catching Shield", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgArrowcatching" }) }),
  // Disadvantage on attacks AGAINST the bearer, off while it is Incapacitated — the `notIncapacitated` judge.
  "Displacement": Object.freeze({ match: "feature", attacker: null, target: "disadvantage", scope: "any", judge: "notIncapacitated", from: "monsters (the displacer beast)",
    rule: Object.freeze({ item: "Displacement", uuid: "Compendium.dnd-monster-manual.features.Item.mmDisplacement00" }) }),
  "Blurred Form": Object.freeze({ match: "feature", attacker: null, target: "disadvantage", scope: "any", judge: "notIncapacitated", from: "monsters",
    rule: Object.freeze({ item: "Blurred Form", uuid: "Compendium.dnd-monster-manual.features.Item.mmBlurredForm000" }) }),
  // While Grappled, its Athletics and Acrobatics checks count as the escape
  // (RULINGS *Where the table bends the rule*); the pack's effect carries only the carrying capacity.
  "Powerful Build": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", from: "Goliath",
    checks: "advantage", checksWhen: Object.freeze({ statuses: Object.freeze(["grappled"]), skills: Object.freeze(["ath", "acr"]) }),
    caveat: "counted — while Grappled, an Athletics or Acrobatics check counts as the escape",
    rule: Object.freeze({ item: "Goliath", uuid: "Compendium.dnd-players-handbook.origins.Item.phbspGoliath0000", benefit: "Powerful Build" }) }),
  // --- H. the PHB classes — B2: the save bends by name (RULINGS *The PHB classes — B2*) -----------------
  // Brave's shape (G) twice: text-only in the pack, read by name; a sheet save to END the condition is listed, not counted.
  "Psychic Defenses": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", from: "Sorcerer — Aberrant Sorcery 6",
    saves: Object.freeze({ bend: "advantage", statuses: Object.freeze(["charmed", "frightened"]) }),
    rule: Object.freeze({ item: "Psychic Defenses", uuid: "Compendium.dnd-players-handbook.classes.Item.phbscrPsychicDef" }) }),
  "Beguiling Twist": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", from: "Ranger — Fey Wanderer 7",
    saves: Object.freeze({ bend: "advantage", statuses: Object.freeze(["charmed", "frightened"]) }),
    rule: Object.freeze({ item: "Beguiling Twist", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrBeguilingT" }) }),
  // `side: "caster"`: read off the DEMAND's caster — its snapshot at the cast (saves/demand.js `source`), never the
  // roller's sheet; with no demand there is nothing to list. Magical Ambush: the caster Invisible as it cast (`sourceStatus`).
  "Magical Ambush": Object.freeze({ match: "feature", side: "caster", attacker: null, target: null, scope: "any", from: "Rogue — Arcane Trickster 9",
    saves: Object.freeze({ bend: "disadvantage", spells: true, sourceStatus: "invisible" }),
    rule: Object.freeze({ item: "Magical Ambush", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgeMagicalAmb" }) }),
  // Mantle of Majesty: the pack's "Unearthly Appearance" effect on the BARD (`named`); a Command (`item`) at a creature the
  // bard has Charmed (`charmedBy: "source"` — the roller's Charmed whose source is the bard) cannot succeed (`fails`).
  "Mantle of Majesty": Object.freeze({ named: "Unearthly Appearance", side: "caster", attacker: null, target: null, scope: "any", from: "Bard — College of Glamour 6",
    saves: Object.freeze({ fails: true, item: "Command", charmedBy: "source" }),
    rule: Object.freeze({ item: "Mantle of Majesty", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdMantleOfMa" }) }),
  // Eldritch Strike: the pack's "Struck", landed by the hit (CLOCK_RIDERS "eldritch-strike"); the target's next save against a
  // spell the FIGHTER casts (`spells: "source"` — the effect's source is the demand's caster) is at Disadvantage, and that
  // save spends it (`spend: "save"`).
  "Struck": Object.freeze({ attacker: null, target: null, scope: "any", spend: "save", from: "Fighter — Eldritch Knight 10",
    saves: Object.freeze({ bend: "disadvantage", spells: "source" }),
    rule: Object.freeze({ item: "Eldritch Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrEldritchSt" }) }),
  // Eldritch Hex: Hex's six "Hexed <Ability>" effects, a row each, the ability the row's; the bend only where the effect's
  // SOURCE holds the feature (`sourceFeature`) — any other warlock's Hex bends checks alone (the pack's own change).
  "Hexed Strength": Object.freeze({ attacker: null, target: null, scope: "any", from: "Warlock — Great Old One Patron 10 (Eldritch Hex)",
    saves: Object.freeze({ bend: "disadvantage", abilities: Object.freeze(["str"]), sourceFeature: "Eldritch Hex" }),
    rule: Object.freeze({ item: "Eldritch Hex", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkEldritchHe" }) }),
  "Hexed Dexterity": Object.freeze({ attacker: null, target: null, scope: "any", from: "Warlock — Great Old One Patron 10 (Eldritch Hex)",
    saves: Object.freeze({ bend: "disadvantage", abilities: Object.freeze(["dex"]), sourceFeature: "Eldritch Hex" }),
    rule: Object.freeze({ item: "Eldritch Hex", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkEldritchHe" }) }),
  "Hexed Constitution": Object.freeze({ attacker: null, target: null, scope: "any", from: "Warlock — Great Old One Patron 10 (Eldritch Hex)",
    saves: Object.freeze({ bend: "disadvantage", abilities: Object.freeze(["con"]), sourceFeature: "Eldritch Hex" }),
    rule: Object.freeze({ item: "Eldritch Hex", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkEldritchHe" }) }),
  "Hexed Intelligence": Object.freeze({ attacker: null, target: null, scope: "any", from: "Warlock — Great Old One Patron 10 (Eldritch Hex)",
    saves: Object.freeze({ bend: "disadvantage", abilities: Object.freeze(["int"]), sourceFeature: "Eldritch Hex" }),
    rule: Object.freeze({ item: "Eldritch Hex", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkEldritchHe" }) }),
  "Hexed Wisdom": Object.freeze({ attacker: null, target: null, scope: "any", from: "Warlock — Great Old One Patron 10 (Eldritch Hex)",
    saves: Object.freeze({ bend: "disadvantage", abilities: Object.freeze(["wis"]), sourceFeature: "Eldritch Hex" }),
    rule: Object.freeze({ item: "Eldritch Hex", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkEldritchHe" }) }),
  "Hexed Charisma": Object.freeze({ attacker: null, target: null, scope: "any", from: "Warlock — Great Old One Patron 10 (Eldritch Hex)",
    saves: Object.freeze({ bend: "disadvantage", abilities: Object.freeze(["cha"]), sourceFeature: "Eldritch Hex" }),
    rule: Object.freeze({ item: "Eldritch Hex", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkEldritchHe" }) }),
  // --- I. the PHB classes — B3 (RULINGS *The PHB classes — B3*) --------------------------------------------
  // Studied Attacks: the use chip a MISS wrote (USE_CHIPS), named "Studied Attacks — vs <creature>", read only at THAT
  // creature (`against`: the chip's uuid must be the attack's target), spent by the roll.
  "Studied Attacks": Object.freeze({ attacker: "advantage", target: null, scope: "any", spend: "attack", against: true, from: "Fighter 13",
    rule: Object.freeze({ item: "Studied Attacks", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrStudiedAtt" }) }),
  // Improved Brutal Strike's two landed effects. Staggered: Disadvantage on the target's NEXT save, which spends it (the
  // Opportunity Attack ban is the table's, the option's line). Sundered: +5 to the next attack roll by ANOTHER creature at
  // the target (`plus`, `except: "source"` — the barbarian's own attack gains nothing), that roll spending it.
  "Staggered": Object.freeze({ attacker: null, target: null, scope: "any", spend: "save", from: "Barbarian 13 (Improved Brutal Strike)",
    saves: Object.freeze({ bend: "disadvantage" }),
    rule: Object.freeze({ item: "Improved Brutal Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbImpBrutalS", benefit: "Staggering Blow" }) }),
  "Sundered": Object.freeze({ attacker: null, target: null, scope: "any", plus: 5, except: "source", spend: "attack", from: "Barbarian 13 (Improved Brutal Strike)",
    rule: Object.freeze({ item: "Improved Brutal Strike", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbImpBrutalS", benefit: "Sundering Blow" }) }),
  // --- J. ARCANA UNLEASHED (RULINGS *Arcana Unleashed*) ---------------------------------------------------------
  // Superior Magic Resistance: Spellguard Shield's row on a monster's trait — spell attack rolls at Disadvantage, saves
  // against spells and magical effects at Advantage.
  "Superior Magic Resistance": Object.freeze({ match: "feature", attacker: null, target: "disadvantage", scope: "spell", from: "Arcana Unleashed — monsters (spellguards)",
    saves: Object.freeze({ bend: "advantage", spells: true }),
    rule: Object.freeze({ item: "Superior Magic Resistance", uuid: "Compendium.dnd-arcana-unleashed.actors.Item.aunSuperiorMagic" }) }),
  // Arcana's Marshal Undead ships its own effect ("Marshaled") where the Monster Manual's is "Adv: Attacks & Saves".
  "Marshaled": Object.freeze({ attacker: "advantage", target: null, scope: "any", from: "Marshal Undead (Arcana Unleashed — the necromancer archmage)",
    saves: Object.freeze({ bend: "advantage" }),
    rule: Object.freeze({ item: "Marshal Undead", uuid: "Compendium.dnd-arcana-unleashed.actors.Item.aunMarshalUndead" }) }),
  // Venger's Mounted Adept: Advantage on Dexterity saves while mounted and not Incapacitated; the mount's own and the redirect are the table's.
  "Mounted Adept": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", judge: "notIncapacitated", from: "Arcana Unleashed — monsters (Venger)",
    saves: Object.freeze({ bend: "advantage", abilities: Object.freeze(["dex"]) }),
    caveat: "counted — press Normal if Venger is not mounted; the mount's Advantage and \"target him instead\" are the table's",
    rule: Object.freeze({ item: "Mounted Adept", uuid: "Compendium.dnd-arcana-unleashed.actors.Item.aunMountedAdept0" }) }),
  // The vestige's Cursed Invocation: the pack's "Cursed" from Divine Power alone (`itemOnly` — Cursed Touch's Cursed is a rest block).
  "Cursed (Divine Power)": Object.freeze({ named: "Cursed", item: "Divine Power", itemOnly: true, attacker: "disadvantage", target: null, scope: "any",
    from: "Divine Power (Arcana Unleashed — the Vestige Companion)",
    caveat: "counted — press Normal if this attack is not at the warlock or the vestige",
    rule: Object.freeze({ item: "Divine Power", uuid: "Compendium.dnd-arcana-unleashed.actors.Item.aunDivinePower00", benefit: "Cursed Invocation" }) }),
  // Wondrous Alteration's Natural Weapons: Advantage on the Constitution save to keep Concentration while its effect stands.
  "Wondrous Alteration": Object.freeze({ attacker: null, target: null, scope: "any", from: "Wizard — Transmuter 3 (Arcana Unleashed)",
    saves: Object.freeze({ bend: "advantage", abilities: Object.freeze(["con"]) }),
    caveat: "counted — a Constitution save to maintain Concentration alone; press Normal on any other",
    rule: Object.freeze({ item: "Wondrous Alteration", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunWondrousAlter", benefit: "Natural Weapons" }) }),
  // Aura of Evasion's member copy (EMANATIONS "Aura of Evasion"): Advantage on Dexterity saves inside; the Evasion half is EVASIONS'.
  "Aura (Aura of Evasion)": Object.freeze({ named: "Aura", item: "Aura of Evasion", itemOnly: true, member: true, attacker: null, target: null, scope: "any",
    from: "Aura of Evasion (Arcana Unleashed — level 7 spell)",
    saves: Object.freeze({ bend: "advantage", abilities: Object.freeze(["dex"]) }),
    rule: Object.freeze({ item: "Aura of Evasion", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunAuraofEvasiIJ" }) }),
  // --- K. HEROES OF FAERÛN (RULINGS *Heroes of Faerûn*) ----------------------------------------------------------
  // Team Tactics' effect (Group Recovery's chosen allies): Advantage on D20 Tests until the banneret's next turn — attacks,
  // saves and checks; the pack's effect carries no change.
  "Team Tactics": Object.freeze({ attacker: "advantage", target: null, scope: "any", checks: "advantage", from: "Fighter — Banneret 7 (Heroes of Faerûn)",
    saves: Object.freeze({ bend: "advantage" }),
    rule: Object.freeze({ item: "Team Tactics", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofPdkTeamTactic" }) }),
  // Lordly Resolve's Bolstered: Advantage on a new save against Charmed or Frightened; "can't gain the condition" is the table's.
  "Bolstered": Object.freeze({ attacker: null, target: null, scope: "any", from: "Lordly Resolve (Heroes of Faerûn)",
    saves: Object.freeze({ bend: "advantage", statuses: Object.freeze(["charmed", "frightened"]) }),
    caveat: "counted — a bolstered creature cannot GAIN Charmed or Frightened at all (the table's)",
    rule: Object.freeze({ item: "Lordly Resolve", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofLordlyResolve", benefit: "Standard Bearer" }) }),
  // Order's Resilience' Stronger Together: Advantage on Strength saves while an ally stands within 5 ft (the pack's transferred effect).
  "Stronger Together": Object.freeze({ attacker: null, target: null, scope: "any", from: "Order’s Resilience (Heroes of Faerûn)",
    saves: Object.freeze({ bend: "advantage", abilities: Object.freeze(["str"]) }),
    caveat: "counted — press Normal with no ally within 5 feet, or while Incapacitated",
    rule: Object.freeze({ item: "Order’s Resilience", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofOrdersResilie", benefit: "Stronger Together" }) }),
  "Fortifying Soul": Object.freeze({ attacker: null, target: null, scope: "any", from: "Ranger — Winter Walker 7 (Heroes of Faerûn)",
    saves: Object.freeze({ bend: "advantage", statuses: Object.freeze(["frightened"]) }),
    rule: Object.freeze({ item: "Fortifying Soul", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofWiwFortifying" }) }),
  // Elminster's Elusion: Circle of Power's row — Advantage against spells and magical effects, a success against half takes none.
  "Elminster's Elusion": Object.freeze({ attacker: null, target: null, scope: "any", from: "Heroes of Faerûn — level 2 spell (1 minute)",
    saves: Object.freeze({ bend: "advantage", spells: true, halfToNone: true }),
    rule: Object.freeze({ item: "Elminster's Elusion", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofElminstersElu" }) }),
  // Cacophonic Shield's Shielded (the caster's own): ranged attack rolls against it at Disadvantage; the Thunder Resistance is the effect's.
  "Shielded": Object.freeze({ attacker: null, target: "disadvantage", scope: "ranged", from: "Cacophonic Shield (Heroes of Faerûn)",
    rule: Object.freeze({ item: "Cacophonic Shield", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofCacophonicShi" }) }),
  // Fairy Trickster's Flustered: Disadvantage on saving throws until the end of the trickster's next turn.
  "Flustered": Object.freeze({ attacker: null, target: null, scope: "any", from: "Fairy Trickster (Heroes of Faerûn)",
    saves: Object.freeze({ bend: "disadvantage" }),
    rule: Object.freeze({ item: "Fairy Trickster", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofFairyTrickste", benefit: "Flustering Strike" }) }),
  // RAVENLOFT (RULINGS *Ravenloft: The Horrors Within*). Paranoia (Watchers): Disadvantage on D20 Tests — attacks and saves
  // here, checks the sheet's. The bestiary: Terrorizer's Advantage against a Frightened target (`judge: "targetStatus"`),
  // Incomprehensible Form (Displacement's row), Susceptible to Charm (a save bend against Charmed).
  "Paranoia": Object.freeze({ attacker: "disadvantage", target: null, scope: "any", from: "Watchers (Ravenloft)",
    saves: Object.freeze({ bend: "disadvantage" }), caveat: "counted — Disadvantage on ability checks is the sheet's",
    rule: Object.freeze({ item: "Watchers", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwWatchersGH8OL", benefit: "Incessant Watchers" }) }),
  "Terrorizer": Object.freeze({ match: "feature", attacker: "advantage", target: null, scope: "any", judge: "targetStatus", status: "frightened", from: "Ravenloft — monsters (dullahan)",
    rule: Object.freeze({ item: "Terrorizer", uuid: "Compendium.dnd-ravenloft-horrors-within.actors.Item.S9zgzOtIPHvwUsh5" }) }),
  "Incomprehensible Form": Object.freeze({ match: "feature", attacker: null, target: "disadvantage", scope: "any", judge: "notIncapacitated", from: "Ravenloft — monsters (unspeakable horror)",
    rule: Object.freeze({ item: "Incomprehensible Form", uuid: "Compendium.dnd-ravenloft-horrors-within.actors.Item.wppJPti41TkH4BYz" }) }),
  "Susceptible to Charm": Object.freeze({ match: "feature", attacker: null, target: null, scope: "any", from: "Ravenloft — monsters (shoggoth)",
    saves: Object.freeze({ bend: "disadvantage", statuses: Object.freeze(["charmed"]) }),
    rule: Object.freeze({ item: "Susceptible to Charm", uuid: "Compendium.dnd-ravenloft-horrors-within.actors.Item.xqj8SpNUMKvlN0D6" }) })
});

/** The table's rows, in the order the table reads them. */
export const EFFECT_KEYS = Object.freeze(Object.keys(EFFECT_BENDS));




/**
 * The ten 2024 metamagic options by feat name (RULINGS *Metamagic*): `when` a named predicate on the spell
 * (decide/metamagic.js), `moment` when it is offered, `picks` what it asks beyond the tick, `apply` prose.
 * ⚠ NO COST HERE (N1): the cost is the option's consumption target, and the rule text the feat's, read live.
 */
export const METAMAGIC = Object.freeze({
  "Careful Spell":    { key: "careful",    moment: "cast",   when: "save",       picks: "protect", apply: "the protected creatures leave the save demand",
    // CHOSEN_AREAS already leave the unchosen out, so Careful buys nothing there.
    unless: "choosesTargets" },
  "Distant Spell":    { key: "distant",    moment: "cast",   when: "range",      picks: null,      apply: "the range the gate's reminder reads is doubled (Touch → 30 ft)" },
  "Empowered Spell":  { key: "empowered",  moment: "damage", when: "damageRoll", picks: "dice",    apply: "up to CHA-mod dice rerolled, the new rolls stand" },
  "Extended Spell":   { key: "extended",   moment: "cast",   when: "duration",   picks: null,      apply: "the effects' clock doubled (24 h cap); concentration saves with Advantage" },
  "Heightened Spell": { key: "heightened", moment: "cast",   when: "save",       picks: "target",  apply: "one target's save gate reads Disadvantage" },
  "Quickened Spell":  { key: "quickened",  moment: "cast",   when: "action",     picks: null,      apply: "a card line: Bonus Action (never policed — DESIGN §8)" },
  "Seeking Spell":    { key: "seeking",    moment: "miss",   when: "spellAttack", picks: null,     apply: "the d20 rerolled on a miss, the new roll stands" },
  "Subtle Spell":     { key: "subtle",     moment: "cast",   when: "any",        picks: null,      apply: "a card line: cast without components" },
  "Transmuted Spell": { key: "transmuted", moment: "cast",   when: "damageType", picks: "type",    apply: "the cast's damage parts carry the picked type" },
  "Twinned Spell":    { key: "twinned",    moment: "cast",   when: "scalesTargets", picks: "twin", apply: "one more creature in the target snapshot, the cast one level higher for targets" },
  // A CLASS FEATURE in the group (`free`): no cost, no Sorcery Point, never one of the one-per-cast options - its
  // tick stands beside a Metamagic pick. `fixed` the damage type every damage roll of the cast takes; `classes`
  // the spell's own class (its `sourceClass`). The components half is out (a card line would police nothing).
  "Psychic Spells":   { key: "psychic",    moment: "cast",   when: "damageRoll", picks: null, free: true, fixed: "psychic", classes: ["warlock"],
    apply: "the cast's damage rolls are psychic" },
  // B4 — Sculpt Spells: Careful's ask at the area as a FREE class-feature row (`asks: "careful"` — the same popup, the same
  // outcome: the spared succeed and take nothing), up to 1 + the slot level (`cap`), on the wizard's Evocation spells (`school`).
  "Sculpt Spells":    { key: "sculpt",     moment: "cast",   when: "save",       picks: "protect", free: true, asks: "careful", classes: ["wizard"], school: "evo",
    unless: "choosesTargets", cap: "1 + @slot", apply: "up to 1 + the slot level creatures are spared: no save, no damage" }
});
/** The damage types Transmuted Spell trades between — the option's own list. */
export const TRANSMUTED_TYPES = Object.freeze(["acid", "cold", "fire", "lightning", "poison", "thunder"]);
/** Twinned Spell's exceptions to "the target count grows with the level" (tools/probe-twinnable.mjs):
 * `except` the extra is a dart, ray, corpse or arrow; `also` the text grants it but the count is flat. */
export const TWINNED_EXCEPTIONS = Object.freeze({
  except: Object.freeze(["Magic Missile", "Scorching Ray", "Animate Dead", "Create Undead", "Cordon of Arrows", "Tasha's Mind Whip"]),
  also: Object.freeze(["Jump"])
});

/**
 * A feature that rolls a weapon's damage dice again, the higher total standing; the popup asks only
 * WHETHER (dice-changers.js; decide/damage-dice.js). The activity's own dice only, doubled on a crit.
 *   key  the once-per-turn chit's riderKey (combatants only);  one  ONE die rerolled, the new roll stands
 *   weapon / dealt   a weapon hit only / a damage type the hit must deal
 * ⚠ NOT A KIND — one table, one machine; a second customer is a row.
 */
export const DAMAGE_EITHER = Object.freeze({
  "Savage Attacker": Object.freeze({ key: "savage-attacker", weapon: true,
    rule: Object.freeze({ item: "Savage Attacker", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftSavageAttac" }),
    from: "Origin feat" }),
  // `one`: the die with the most to gain (its average less its face), so the popup never asks which. With
  // Savage Attacker too, one popup: Savage's set first, then this die.
  "Piercer": Object.freeze({ key: "piercer", one: true, dealt: "piercing",
    rule: Object.freeze({ item: "Piercer", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftPiercer0000", benefit: "Puncture" }),
    from: "General feat" })
});

/**
 * A feature that rerolls a healing die on the `reroll` face, automatically, before the healing lands once
 * (heal-rerolls.js). `spells`: the owner's healing spells qualify; `own`: the feature's own healing — the
 * pack's `r1` is stripped from those formulas so the machine does the reroll.
 *   effect / max   a row on the HEALED creature: while `effect` stands on it, healing the module lands
 *                  (cast.js) is the roll's MAXIMUM — Beacon of Hope; the pack's effect carries the save modes
 *   also      the feature's heal ACTIVITY of that name heals one more creature after the caster's own healing
 *             spell cast with a slot (Starry Form's Chalice): offered on the spell's healing card as a pick of
 *             the caster or a creature on its side `within` feet, while `while` stands and the form chip
 *             (EFFECT_CHOICES `chip`) reads `form`; the pick uses the activity at that creature
 *   bonus / slotCast   the owner's levelled spell heals `bonus` more (`@slot` the cast's level), a part on the roll
 *   self      B4 (Blessed Healer): after the owner's slot-cast healing spell lands on ANOTHER creature, the owner regains
 *             `self` (`@slot` the cast's level) — its own card and receipt, once per cast
 *   atZero    RAVENLOFT (Return to Life): a `caster` `max` row raises the dice only for a creature AT 0 Hit Points
 * ⚠ NOT A KIND — one table, one machine; a second customer is a row.
 */
export const HEAL_REROLLS = Object.freeze({
  "Healer": Object.freeze({ reroll: 1, spells: true, own: true,
    rule: Object.freeze({ item: "Healer", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftHealer00000", benefit: "Healing Rerolls" }),
    from: "Origin feat (Hermit)" }),
  "Beacon of Hope": Object.freeze({ effect: "Hopeful", max: true,
    caveat: "healing applied with a card's own buttons, or typed on a sheet, is not raised",
    rule: Object.freeze({ item: "Beacon of Hope", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplBeaconofHo" }),
    from: "Cleric spell, level 3 (Concentration, 1 minute)" }),
  // D1 — Supreme Healing: Beacon's `max` keyed to the CASTER's feature (`caster`) — every creature the cleric's spell or
  // Channel Divinity heals takes the dice's maximum; the flat parts stay as rolled.
  "Supreme Healing": Object.freeze({ max: true, caster: true,
    caveat: "healing applied with a card's own buttons, or typed on a sheet, is not raised",
    rule: Object.freeze({ item: "Supreme Healing", uuid: "Compendium.dnd-players-handbook.classes.Item.phbclcSupremeHea" }),
    from: "Cleric — Life Domain 17" }),
  // `bonus` + `slotCast`: a levelled spell the owner casts (never innate or at will) heals `2 + @slot` more - a
  // part added to the healing roll itself, so the card's own buttons carry it too.
  "Disciple of Life": Object.freeze({ bonus: "2 + @slot", slotCast: true,
    rule: Object.freeze({ item: "Disciple of Life", uuid: "Compendium.dnd-players-handbook.classes.Item.phbclcDiscipleOf" }),
    from: "Cleric — Life Domain 3" }),
  "Blessed Healer": Object.freeze({ self: "2 + @slot", slotCast: true,
    rule: Object.freeze({ item: "Blessed Healer", uuid: "Compendium.dnd-players-handbook.classes.Item.phbclcBlessedHea" }),
    from: "Cleric — Life Domain 6" }),
  "Starry Form": Object.freeze({ also: "Chalice", while: "Starry Form", form: "chalice", within: 30,
    rule: Object.freeze({ item: "Starry Form", uuid: "Compendium.dnd-players-handbook.classes.Item.phbdrdStarryForm", benefit: "Chalice" }),
    from: "Druid — Circle of the Stars 3" }),
  // RAVENLOFT — Return to Life (Circle of Mortality): Supreme Healing's maximum for a creature AT 0 Hit Points alone (`atZero`).
  "Circle of Mortality": Object.freeze({ max: true, caster: true, atZero: true,
    caveat: "healing applied with a card's own buttons, or typed on a sheet, is not raised; Spare the Dying as a Bonus Action is the sheet's",
    rule: Object.freeze({ item: "Circle of Mortality", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwCSCircleofMOG", benefit: "Return to Life" }),
    from: "Cleric — Grave Domain 3 (Ravenloft)" })
});

/**
 * A POOL OF HIT POINTS on its bearer that takes damage first, automatically (R1: the ward has no choice) —
 * ward-pools.js at `dnd5e.preApplyDamage`, after Resistances, so the card's own buttons carry it too.
 *   pool     where the hit points live: "uses" — the feature's own uses (the pack's Create Ward / Damage Ward
 *            activities write them); the maximum is the item's
 *   create   the feature's activity whose use creates the ward (full) once per Long Rest, on the first cast
 *   refill   `{ school, per }`: a spell of that school cast from a slot restores `per` × the slot level
 *   pool "effect" (B4, Bastion of Law): the hit points live on the pack's `effect` landed on the WARDED creature (the
 *            sorcerer's pick — the targeted token, else itself), written at the `create` activity's use: `die` per Sorcery
 *            Point spent (the use's scaling), the whole pool spent as damage lands, the effect gone at 0
 * ⚠ NOT A KIND — one table, one machine; Bastion of Law is the second customer (B4).
 */
export const WARD_POOLS = Object.freeze({
  "Arcane Ward": Object.freeze({ pool: "uses", create: "Create Ward", refill: Object.freeze({ school: "abj", per: 2 }),
    rule: Object.freeze({ item: "Arcane Ward", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwzdArcaneWard" }),
    from: "Wizard — Abjurer 3" }),
  "Bastion of Law": Object.freeze({ pool: "effect", effect: "Warded by Law", create: "Create Shield", die: 8,
    caveat: "the ward lasts until the sorcerer uses the feature again or finishes a Long Rest — the effect's own clock",
    rule: Object.freeze({ item: "Bastion of Law", uuid: "Compendium.dnd-players-handbook.classes.Item.phbscrBastionOfL" }),
    from: "Sorcerer — Clockwork Sorcery 6" })
});

/**
 * THE INITIATIVE GRANTS (the PHB classes, A6; initiative-grants.js): what a feature gives back "when you roll
 * Initiative" — read as each combatant's Initiative lands (the swap's seam), once per combat, on the GM. Keyed by
 * the feature; the feature's OWN uses pay (once per Long Rest) and are spent with it.
 *   regain   the item whose expended uses all come back (Rage; Monk's Focus);  unit  what the card calls them
 *   heal     the feature's heal activity, rolled on the owner's numbers and landed with a receipt
 *   ask      true — OFFERED (the use is the player's to keep): a Yes/No popup, the clock answers No; else it
 *            simply happens (R1) and a card says so — never when nothing would come back
 *   to: "allies" (B4, Tandem Footwork): the feature's `activity` is rolled ONCE on the owner's numbers (its `roll`) and
 *            the number is ADDED to the Initiative of the owner and every ally within `reach` feet — the combatants
 *            already rolled at once, the rest as theirs lands (a combat flag holds what is due); the activity's own
 *            consumption pays (`poolOf`: a Bardic Inspiration use). Musician's give, on the swap's seam.
 *   reroll   RAVENLOFT (Hypervigilance): the owner's Initiative d20 at or under this face is OFFERED a reroll (the face read as
 *            the total less the sheet's Initiative modifier); Yes rerolls it, the new roll stands; nothing regained, no use
 * ⚠ NOT A KIND — one table, one machine; Perfect Focus (C1) and Superior Inspiration (D1) are rows.
 */
export const INITIATIVE_GRANTS = Object.freeze({
  "Persistent Rage": Object.freeze({ regain: "Rage", unit: "Rage uses",
    rule: Object.freeze({ item: "Persistent Rage", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbPersistent" }),
    from: "Barbarian 15" }),
  "Uncanny Metabolism": Object.freeze({ regain: "Monk's Focus", unit: "Focus Points", heal: "Uncanny Metabolism", ask: true,
    rule: Object.freeze({ item: "Uncanny Metabolism", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkUncannyMet" }),
    from: "Monk 2" }),
  "Tandem Footwork": Object.freeze({ to: "allies", reach: 30, activity: "Initiative Bonus", unit: "Bardic Inspiration", ask: true,
    rule: Object.freeze({ item: "Tandem Footwork", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdTandemFoot" }),
    from: "Bard — College of Dance 6" }),
  // C1 — Perfect Focus: Focus Points back UP TO 4 (`upTo`) at Initiative, automatically, when Uncanny Metabolism is not
  // used (`unless`: with that ask pending, this row waits for its No — the same card, one line; with no ask due, its own).
  "Perfect Focus": Object.freeze({ regain: "Monk's Focus", unit: "Focus Points", upTo: 4, unless: "Uncanny Metabolism",
    rule: Object.freeze({ item: "Perfect Focus", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkPerfectFoc" }),
    from: "Monk 15" }),
  // D1 — Superior Inspiration: Bardic Inspiration back UP TO 2 at Initiative, automatically (Perfect Focus's `upTo`; the
  // feature has no uses of its own — nothing spent, nothing asked).
  "Superior Inspiration": Object.freeze({ regain: "Bardic Inspiration", unit: "Bardic Inspiration uses", upTo: 2,
    rule: Object.freeze({ item: "Superior Inspiration", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdSuperiorIn" }),
    from: "Bard 18" }),
  // ARCANA UNLEASHED — Ever-Ready Shot: ONE expended use of Arcane Shot back at Initiative (`count` — never past the maximum);
  // "you can" is the ask.
  "Ever-Ready Shot": Object.freeze({ regain: "Arcane Shot", unit: "Arcane Shot uses", count: 1, ask: true,
    rule: Object.freeze({ item: "Ever-Ready Shot", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunEverreadyShot" }),
    from: "Fighter — Arcane Archer 10 (Arcana Unleashed)" }),
  // RAVENLOFT — Hypervigilance (the Survivor feat): an Initiative d20 of 9 or lower may be rerolled (`reroll`), the new roll
  // stands; asked, no use. The key is the feat's (ALIASES → "survivor", FEATURE_TYPES → the feat, not the Fighter's).
  "Survivor (Ravenloft)": Object.freeze({ reroll: 9, ask: true, regain: null,
    rule: Object.freeze({ item: "Survivor", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwSurvivor2zrM3", benefit: "Hypervigilance" }),
    from: "Origin feat (Ravenloft)" })
});

/**
 * THE CAST RIDERS (the PHB classes, A7; cast-riders.js): what a feature does right after its bearer casts, read at
 * `dnd5e.postUseActivity` on the casting client. Keyed by the feature.
 *   spellClass  the spell must be this class's, cast WITH A SPELL SLOT (levelled, not innate or at will, a slot spent)
 *   surgeOn · table  the d20 rolled by the module once per turn (in a combat), the RollTable rolled on that face
 *   tides    the feature whose spent use makes the table roll at once, and comes back (Tides of Chaos)
 *   after    the spell whose cast raises the rider (Inspiring Smite: Divine Smite)
 *   handOut  the feature's heal activity's Temporary Hit Points DIVIDED among creatures within `reach` (the giver
 *            too) — the rest song's popup; the activity's consumption (Channel Divinity) paid only when given
 *   tamed    the feature whose use lets the sorcerer CHOOSE a table row instead of rolling (D1)
 * ⚠ NOT A KIND — one table, one machine; Controlled Chaos (C1) and Tamed Surge (D1) are facets of the surge row.
 */
export const CAST_RIDERS = Object.freeze({
  // C1 — `twice` (Controlled Chaos): with that feature on the sheet a surge rolls the table TWICE; both results post and
  // the surge line offers the pick (a button each); the choice is recorded, the effects are the table's as ever.
  // D1 — `tamed` (Tamed Surge): after the same cast, once per Long Rest (the feature's own use), the sorcerer may CHOOSE an
  // effect from the table instead of rolling it — a pick on the surge line from every row but the last; the use is spent
  // with the pick, and the effect is the table's to play as ever.
  "Wild Magic Surge": Object.freeze({ spellClass: "sorcerer", surgeOn: 20, tides: "Tides of Chaos", twice: "Controlled Chaos", tamed: "Tamed Surge",
    table: "Compendium.dnd-players-handbook.tables.RollTable.phbWildMagicSurg",
    rule: Object.freeze({ item: "Wild Magic Surge", uuid: "Compendium.dnd-players-handbook.classes.Item.phbscrSurgeWildM" }),
    from: "Sorcerer — Wild Magic Sorcery 3" }),
  "Inspiring Smite": Object.freeze({ after: "Divine Smite", handOut: true, activity: "Heal", reach: 30, self: true,
    rule: Object.freeze({ item: "Inspiring Smite", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnInspiringS" }),
    from: "Paladin — Oath of Glory 3" }),
  // C1 — Smite of Protection: after Divine Smite, the paladin and every creature inside its Aura of Protection ring wear a
  // copy of the pack's "Smite of Protection" (the `coverHalf` status the cover measure reads) until the start of the
  // paladin's next turn (`clock: "slow"`); the `aura` names the ring whose members are read off the region.
  "Smite of Protection": Object.freeze({ after: "Divine Smite", aura: "Aura of Protection", effect: "Smite of Protection", clock: "slow", self: true,
    rule: Object.freeze({ item: "Smite of Protection", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnSmiteOfPro" }),
    from: "Paladin — Oath of Devotion 15" }),
  // HEROES OF FAERÛN — Hunter's Rime: right after Hunter's Mark is cast, the feature's "Heal and Apply Rime" used on the ranger
  // itself (`use`): the Temporary Hit Points and the rimed mark's effect, no ask (R1); "can't Disengage" is the table's.
  "Hunter's Rime": Object.freeze({ after: "Hunter's Mark", use: "Heal and Apply Rime",
    rule: Object.freeze({ item: "Hunter's Rime", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofWiwHuntersRim" }),
    from: "Ranger — Winter Walker 3 (Heroes of Faerûn)" })
});

/**
 * THE STORED DICE (the PHB classes, A7; stored-dice.js): d20s rolled at a rest and kept as faces on a chip on the
 * bearer ("Portent — 17 · 3", the effect view lists it), each spent once to REPLACE a D20 Test's d20.
 *   dice     how many d20s the rest rolls (Greater Portent: 3, C1);  rests  which rests roll them (the old faces go)
 *   tests    the bearer's OWN rolls a face may replace, ticked in the roll's dialog BEFORE the roll (the rule's order)
 *   oncePerTurn  one replacement per turn, whoever's roll (a stamp on the chip)
 *   die      the die's size (20 by default);  omen  true — the face is a SIGN, never spent (Cosmic Omen, B4: even Weal,
 *            odd Woe — INTERRUPT_ROLLS "Cosmic Omen" reads its parity, `sign: "omen"`); `tests` empty: no dialog tick
 * Another creature's roll is the bystander's row (INTERRUPT_ROLLS "Portent", `bend: "set"`), after the roll.
 * ⚠ NOT A KIND — one table, one machine; the replacement is a bend on the `roll` interrupt and a pinned die.
 */
export const STORED_DICE = Object.freeze({
  // C1 — `more` (Greater Portent): with that feature on the sheet the rest rolls three dice.
  "Portent": Object.freeze({ dice: 2, rests: Object.freeze(["long"]), tests: Object.freeze(["attack", "save", "check"]), oncePerTurn: true,
    more: Object.freeze({ feature: "Greater Portent", dice: 3 }),
    rule: Object.freeze({ item: "Portent", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwzdPortent000" }),
    from: "Wizard — Diviner 3" }),
  "Cosmic Omen": Object.freeze({ dice: 1, die: 6, rests: Object.freeze(["long"]), tests: Object.freeze([]), omen: true,
    rule: Object.freeze({ item: "Cosmic Omen", uuid: "Compendium.dnd-players-handbook.classes.Item.phbdrdCosmicOmen" }),
    from: "Druid — Circle of the Stars 6" })
});

/**
 * THE MISHAPS (RULINGS *Ravenloft: The Horrors Within*; mishaps.js): a feature whose bearer, "immediately after you make a
 * D20 Test and roll a 1 on the d20", makes the feature's own save — the dark gifts. Read on the EVALUATED roll hooks
 * (an attack roll, a saving throw, an ability check or a Death Saving Throw whose kept d20 shows a 1, on the roller's client); the row's save
 * `activity` is used at the bearer and the saves machine takes it from there (the DC and the failure's effect the pack's).
 * Keyed by the feature. A mishap's own save is a D20 Test too: a 1 on it asks again, as the text reads.
 *   activity  the save activity by name (as the pack spells it)
 * ⚠ NOT A KIND — one table, one machine; a seventh dark gift is a row.
 */
export const MISHAPS = Object.freeze({
  "Aberrant Anatomy": Object.freeze({ activity: "Warping Flesh",
    rule: Object.freeze({ item: "Aberrant Anatomy", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwAberrantAnato", benefit: "Warping Flesh" }),
    from: "Dark Gift (Ravenloft)" }),
  "Echoing Soul": Object.freeze({ activity: "Intrusive Echos",
    rule: Object.freeze({ item: "Echoing Soul", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwEchoingSoulGK", benefit: "Intrusive Echoes" }),
    from: "Dark Gift (Ravenloft)" }),
  "Gathered Whispers": Object.freeze({ activity: "Voices from Beyond",
    rule: Object.freeze({ item: "Gathered Whispers", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwGatheredWhisp", benefit: "Voices from Beyond" }),
    from: "Dark Gift (Ravenloft)" }),
  "Living Shadow": Object.freeze({ activity: "Ominous Will",
    caveat: "the Shadow's Will table at your next turn start is the table's",
    rule: Object.freeze({ item: "Living Shadow", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwLivingShadow2", benefit: "Ominous Will" }),
    from: "Dark Gift (Ravenloft)" }),
  "Symbiotic Being": Object.freeze({ activity: "Symbiotic Agenda",
    rule: Object.freeze({ item: "Symbiotic Being", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwSymbioticBein", benefit: "Symbiotic Agenda" }),
    from: "Dark Gift (Ravenloft)" }),
  "Watchers": Object.freeze({ activity: "Incessant Watchers",
    rule: Object.freeze({ item: "Watchers", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwWatchersGH8OL", benefit: "Incessant Watchers" }),
    from: "Dark Gift (Ravenloft)" })
});

/** Trade Initiative with a willing ally: once every combatant has rolled, the owner is asked once per
 * combat (initiative-swap.js). ⚠ NOT A KIND — a second customer is a row. */
export const INITIATIVE_SWAPS = Object.freeze({
  "Alert": Object.freeze({
    rule: Object.freeze({ item: "Alert", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftAlert000000", benefit: "Initiative Swap" }),
    from: "Origin feat (Criminal, Guard)" })
});

/**
 * An Unarmed Strike die "instead of the normal damage": the pack ships it only on the feature's own attack,
 * so unarmed-dice.js swaps that formula in at `preRollDamage`. A strike already rolling a die (Martial
 * Arts) is left alone. ⚠ NOT A KIND — a second customer is a row.
 */
export const UNARMED_DICE = Object.freeze({
  "Tavern Brawler": Object.freeze({
    rule: Object.freeze({ item: "Tavern Brawler", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftTavernBrawl", benefit: "Enhanced Unarmed Strike" }),
    from: "Origin feat (Sailor)" }),
  // `pick: "hands"`: two pack attacks (d6 weapon in hand, d8 empty hand); what the owner holds picks one.
  "Unarmed Fighting": Object.freeze({ pick: "hands",
    rule: Object.freeze({ item: "Unarmed Fighting", uuid: "Compendium.dnd-players-handbook.feats.Item.phbfstUnarmedFig" }),
    from: "Fighting Style feat" })
});

/** A kit use on a creature within `reach`, healed from its own Hit Point Dice: the size is picked in a popup
 * and the feature's heal activity of that size rolled (kit-tend.js). ⚠ NOT A KIND — a second customer is a row. */
export const KIT_TENDS = Object.freeze({
  "Healer": Object.freeze({ kit: "Healer's Kit", reach: 5,
    rule: Object.freeze({ item: "Healer", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftHealer00000", benefit: "Battle Medic" }),
    from: "Origin feat (Hermit)" })
});

/** THE DMG — a creature wearing the `effect` regains no Hit Points (Temporary Hit Points are not regained ones): the heal
 * is held at the current Hit Points as it is applied (heal-on-hit.js). ⚠ NOT A KIND — a second customer is a row. */
export const HEAL_BLOCKS = Object.freeze({
  "Sword of Wounding": Object.freeze({ effect: "Wounded and Cannot Heal",
    rule: Object.freeze({ item: "Sword of Wounding", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgSwordOfWoundi" }),
    from: "DMG weapon" })
});

/**
 * THE DAMAGE RULES (RULINGS *The fighting styles*; renamed from FIGHTING_STYLES in B4, Q5 ruled): a style,
 * feat or class feature whose rule is a NUMBER on a damage roll, or turns on what the owner HOLDS or WEARS.
 * damage-rules.js keeps one FACE effect per row, live or greyed, read off the equipped items, and applies
 * its number to the roll it fits. The persisted names stay: the face's flag `fightingStyle`, the world's
 * `fightingStyleList` setting (a rename would orphan every face and list on a live world).
 *   gate       twoHanded | thrown | offhand (the Light extra attack) | oneHanded | armored | unarmed | heavy
 *              (on the owner's turn) | heavyArmor | offhandCrossbow | always (no equipment in the rule)
 *   minimum    the damage dice's floor;  bonus  "2" | "@mod" | "@prof" | "effect" (the pack effect's, N1)
 *   ac         "effect" — the pack effect's AC change, moved onto the face
 *   takesOver  the pack's UNGATED effect is switched off; the face carries the rule
 *   block      cut from `types` damage before resistances, at dnd5e.preCalculateDamage (the card's buttons too)
 *   ignores    "resistance" — the owner's `types` damage ignores Resistance (`options.ignore.resistance`)
 *   wields     THE DMG — the carrier is the damage's own WEAPON (lookup.js `wieldsAs`: the template's enchantment, attuned), not
 *              a feat: no face; only the ignored Resistance reads it
 *   typed      types read off the feat's NAME ("Elemental Adept (Fire)"); none → a greyed face;  choices  the pick;
 *              pickLine  the type popup's words for what the pick does
 *   spells     spell damage only (true), or "cantrip" — level 0 only;  feat  a feat or class feature (its face wears
 *              the item's own name)
 *   breaks     "concentration" — creatures the owner damages save at Disadvantage (concentration.js)
 *   B4 — THE SPELL-DAMAGE BONUSES (Q5; decide/damage-rules.js spellRuleFits): a `spells` row with a `bonus` formula
 *   ("@abilities.cha.mod", the owner's roll data) pushed onto ONE of the spell's damage rolls — the first whose type the
 *   row names (`types`, or a `typed` row's picks; none → any).  classes  the spell's own class (its `sourceClass`);
 *   school  the spell's school ("evo");  once  "spell" (one roll per cast — Scorching Ray's rays share it) | "turn"
 *   (a turn chit, `rider` keyed `damage-rule:<key>`); absent, every roll. The pack's own Damage activities for these
 *   (measured in M0) are clicked by hand; the row is the mechanism.
 *   spell    RAVENLOFT — a `spells` row for ONE spell by name (Death Touch's Chill Touch)
 * ⚠ NOT A KIND — one table, one machine; a second customer is a row.
 */
export const DAMAGE_RULES = Object.freeze({
  "Great Weapon Fighting": Object.freeze({ key: "great-weapon-fighting", gate: "twoHanded", minimum: 3,
    rule: Object.freeze({ item: "Great Weapon Fighting", uuid: "Compendium.dnd-players-handbook.feats.Item.phbfstGreatWeapo" }),
    from: "Fighting Style feat" }),
  "Thrown Weapon Fighting": Object.freeze({ key: "thrown-weapon-fighting", gate: "thrown", bonus: "2",
    rule: Object.freeze({ item: "Thrown Weapon Fighting", uuid: "Compendium.dnd-players-handbook.feats.Item.phbfstThrownWeap" }),
    from: "Fighting Style feat" }),
  "Two-Weapon Fighting": Object.freeze({ key: "two-weapon-fighting", gate: "offhand", bonus: "@mod",
    rule: Object.freeze({ item: "Two-Weapon Fighting", uuid: "Compendium.dnd-players-handbook.feats.Item.phbfstTwoWeaponF" }),
    from: "Fighting Style feat" }),
  "Dueling": Object.freeze({ key: "dueling", gate: "oneHanded", bonus: "effect", takesOver: true,
    rule: Object.freeze({ item: "Dueling", uuid: "Compendium.dnd-players-handbook.feats.Item.phbfstDueling000" }),
    from: "Fighting Style feat" }),
  "Defense": Object.freeze({ key: "defense", gate: "armored", ac: "effect", takesOver: true,
    rule: Object.freeze({ item: "Defense", uuid: "Compendium.dnd-players-handbook.feats.Item.phbfstDefense000" }),
    from: "Fighting Style feat" }),
  "Unarmed Fighting": Object.freeze({ key: "unarmed-fighting", gate: "unarmed",
    rule: Object.freeze({ item: "Unarmed Fighting", uuid: "Compendium.dnd-players-handbook.feats.Item.phbfstUnarmedFig" }),
    from: "Fighting Style feat" }),
  "Great Weapon Master": Object.freeze({ key: "great-weapon-master", gate: "heavy", bonus: "@prof", feat: true,
    rule: Object.freeze({ item: "Great Weapon Master", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftGreatWeapon", benefit: "Heavy Weapon Mastery" }),
    from: "General feat" }),
  "Heavy Armor Master": Object.freeze({ key: "heavy-armor-master", gate: "heavyArmor", takesOver: true, feat: true,
    block: "@prof", types: Object.freeze(["bludgeoning", "piercing", "slashing"]),
    rule: Object.freeze({ item: "Heavy Armor Master", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftHeavyArmorM", benefit: "Damage Reduction" }),
    from: "General feat" }),
  // The pack ships Elemental Adept as text and Potent Poison as nothing: the rows are the mechanism.
  "Elemental Adept": Object.freeze({ key: "elemental-adept", gate: "always", feat: true, typed: true, spells: true,
    ignores: "resistance", minimum: 2, choices: Object.freeze(["acid", "cold", "fire", "lightning", "thunder"]),
    rule: Object.freeze({ item: "Elemental Adept", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftElementalAd", benefit: "Energy Mastery" }),
    from: "General feat" }),
  // THE DMG — "the weapon ignores Resistance to Slashing damage".
  "Vorpal Sword": Object.freeze({ key: "vorpal-sword", gate: "always", wields: true, ignores: "resistance", types: Object.freeze(["slashing"]),
    rule: Object.freeze({ item: "Vorpal Sword", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgVorpalSword00" }),
    from: "DMG weapon" }),
  // Beside Two-Weapon Fighting it adds nothing twice (the machine adds one modifier).
  "Crossbow Expert": Object.freeze({ key: "crossbow-expert", gate: "offhandCrossbow", bonus: "@mod", feat: true,
    rule: Object.freeze({ item: "Crossbow Expert", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftCrossbowExp", benefit: "Dual Wielding" }),
    from: "General feat" }),
  "Poisoner": Object.freeze({ key: "poisoner", gate: "always", feat: true, ignores: "resistance", types: Object.freeze(["poison"]),
    rule: Object.freeze({ item: "Poisoner", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftPoisoner000", benefit: "Potent Poison" }),
    from: "General feat" }),
  // No pack data for the breaker: the row is the switch and the face (concentration.js reads it).
  "Mage Slayer": Object.freeze({ key: "mage-slayer", gate: "always", feat: true, breaks: "concentration",
    rule: Object.freeze({ item: "Mage Slayer", uuid: "Compendium.dnd-players-handbook.feats.Item.phbftMageSlayer0", benefit: "Concentration Breaker" }),
    from: "General feat" }),
  // B4 — the spell-damage bonuses (RULINGS *The PHB classes — B4*). The parents (Blessed Strikes, Elemental Fury) name the
  // pick; the option on the sheet is the row. Divine Strike and Primal Strike are CLOCK_RIDERS rows already.
  "Blessed Strikes: Potent Spellcasting": Object.freeze({ key: "potent-spellcasting-cleric", gate: "always", feat: true,
    spells: "cantrip", classes: Object.freeze(["cleric"]), bonus: "@abilities.wis.mod",
    rule: Object.freeze({ item: "Blessed Strikes: Potent Spellcasting", uuid: "Compendium.dnd-players-handbook.classes.Item.phbClcPotentSpel" }),
    from: "Cleric 7 (Blessed Strikes)" }),
  "Elemental Fury: Potent Spellcasting": Object.freeze({ key: "potent-spellcasting-druid", gate: "always", feat: true,
    spells: "cantrip", classes: Object.freeze(["druid"]), bonus: "@abilities.wis.mod",
    rule: Object.freeze({ item: "Elemental Fury: Potent Spellcasting", uuid: "Compendium.dnd-players-handbook.classes.Item.phbFuryPotentSpe" }),
    from: "Druid 7 (Elemental Fury)" }),
  // The affinity's type is read off the copy's NAME ("Elemental Affinity (Fire)") as Elemental Adept's is; the pack ships
  // five typed Damage activities and no pick. The Resistance half is the sheet's (a Sorcery Point, by hand).
  "Elemental Affinity": Object.freeze({ key: "elemental-affinity", gate: "always", feat: true, typed: true, spells: true,
    once: "spell", bonus: "@abilities.cha.mod", choices: Object.freeze(["acid", "cold", "fire", "lightning", "poison"]),
    pickLine: "one damage roll of your spells of that type adds your Charisma modifier",
    rule: Object.freeze({ item: "Elemental Affinity", uuid: "Compendium.dnd-players-handbook.classes.Item.phbscrElementalA" }),
    from: "Sorcerer — Draconic Sorcery 6" }),
  "Radiant Soul": Object.freeze({ key: "radiant-soul", gate: "always", feat: true, spells: true, once: "turn",
    types: Object.freeze(["radiant", "fire"]), bonus: "@abilities.cha.mod",
    rule: Object.freeze({ item: "Radiant Soul", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkRadiantSou" }),
    from: "Warlock — Celestial Patron 6" }),
  "Empowered Evocation": Object.freeze({ key: "empowered-evocation", gate: "always", feat: true, spells: true, once: "spell",
    school: "evo", classes: Object.freeze(["wizard"]), bonus: "@abilities.int.mod",
    rule: Object.freeze({ item: "Empowered Evocation", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwzdEmpoweredE" }),
    from: "Wizard — Evoker 10" }),
  // ARCANA UNLEASHED — Mage Breaker: Mage Slayer's breaker on a WIELDED weapon (`wields` — the dealer holds the staff; which
  // weapon dealt the blow is the caveat's).
  "Mage Breaker": Object.freeze({ key: "mage-breaker", gate: "always", wields: true, breaks: "concentration",
    caveat: "counted — Disadvantage only when the damage was Mage Breaker's own hit",
    rule: Object.freeze({ item: "Mage Breaker", uuid: "Compendium.dnd-arcana-unleashed.items.Item.aunMageBreakerFf" }),
    from: "Arcana Unleashed — weapon" }),
  // HEROES OF FAERÛN — the ignored Resistances (Elemental Adept's shape, no face): Frigid Explorer's Biting Cold on the ranger's
  // Cold (weapon attacks, Ranger spells and features — read as all its Cold); Spellfire Adept's Searing Spellfire on Radiant.
  "Frigid Explorer": Object.freeze({ key: "frigid-explorer", gate: "always", feat: true, ignores: "resistance", types: Object.freeze(["cold"]),
    caveat: "counted — Cold from a source that is not the ranger's weapon, spell or feature is the table's",
    rule: Object.freeze({ item: "Frigid Explorer", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofWiwFrigidExpl", benefit: "Biting Cold" }),
    from: "Ranger — Winter Walker 3 (Heroes of Faerûn)" }),
  "Spellfire Adept": Object.freeze({ key: "spellfire-adept", gate: "always", feat: true, ignores: "resistance", types: Object.freeze(["radiant"]),
    rule: Object.freeze({ item: "Spellfire Adept", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofSpellfireAdep", benefit: "Searing Spellfire" }),
    from: "Heroes of Faerûn — general feat" }),
  // RAVENLOFT (RULINGS *Ravenloft: The Horrors Within*) — the ignored Resistances: Death Touch (Touch of Death) on Chill Touch's
  // Necrotic alone (`spell`); Grave Touched's Arcane Necrosis on the warlock's Necrotic. Power from Beyond: 1d6 on a Bard spell's
  // damage once per turn (B4's spell bonus; the healing half and "with a spell slot" are the table's).
  "Touch of Death": Object.freeze({ key: "touch-of-death", gate: "always", feat: true, ignores: "resistance", types: Object.freeze(["necrotic"]), spells: true, spell: "Chill Touch",
    rule: Object.freeze({ item: "Touch of Death", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwTouchofDeathA", benefit: "Death Touch" }),
    from: "Dark Gift (Ravenloft)" }),
  "Grave Touched": Object.freeze({ key: "grave-touched", gate: "always", feat: true, ignores: "resistance", types: Object.freeze(["necrotic"]),
    caveat: "the Necrotic type swap and Dreaded Necrosis' extra die are the table's",
    rule: Object.freeze({ item: "Grave Touched", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwUPGraveToucq1", benefit: "Arcane Necrosis" }),
    from: "Warlock — Undead Patron 6 (Ravenloft)" }),
  "Empowered Channeling": Object.freeze({ key: "empowered-channeling", gate: "always", feat: true, spells: true, classes: Object.freeze(["bard"]), bonus: "1d6", once: "turn",
    caveat: "a healing spell's 1d6, and \"with a spell slot\", are the table's",
    rule: Object.freeze({ item: "Empowered Channeling", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwCSEmpoweredtO", benefit: "Power from Beyond" }),
    from: "Bard — College of Spirits 6 (Ravenloft)" })
});

/** What raises a repeated save — the closed set the R4 tripwire counts (repeat-saves.js). */
export const REPEAT_TRIGGERS = new Set(["turnEnd", "damaged", "action"]);

/**
 * A SPELL whose landed effect lets the target repeat the save, ending the effect on a success (RULINGS *The
 * spells slice*). Keyed by the spell; the effect is found on the bearer by the pack's effect name AND its
 * origin item (a Paralyzed from a ghoul's claw is not Hold Person's). The save is the item's own save
 * activity — never a DC or an ability copied. A success removes the effect through the cast card's receipt,
 * no choice (R1); the card says so and the name floats off the token (repeat-saves.js).
 *   effect     the pack's effect name, or a list of them (Blindness/Deafness, Eyebite, Contagion)
 *   on         REPEAT_TRIGGERS: "turnEnd" the bearer's turn end · "damaged" damage landing on it ·
 *              "action" offered on a card at the bearer's turn start (Otto's: its own action)
 *   advantage  "damaged" — the save has Advantage when damage raised it (Tasha's Hideous Laughter)
 *   onSave     overrides the activity's damage-on-save for the repeat (Phantasmal Killer: the pack's "half"
 *              is the cast's; the repeat's success takes none)
 *   count      { saves, fails?, press? } — the tally on the effect: `saves` successes end it, `fails` failures
 *              stop the asking (Contagion) or press `press` (Flesh to Stone's Petrified)
 *              — `swap: true` (the GM's side): the pressed status REPLACES the effect (the medusa's second
 *              failure is Petrified INSTEAD OF Restrained)
 *   item       the spell, where the key must differ from it (a second row on one spell — Prismatic Spray's rays)
 *   activity   the save activity by NAME, where the spell's first save activity is not the repeat's
 *              (Prismatic Spray's "Indigo Save (Con)" — the Cast is a Dexterity save)
 *   caveat     what the rule leaves to the table, said on the card
 *   endsOn     the causes that END the effect outright instead of repeating its save (Sleep: "the spell ends on a
 *              target if it takes damage") — the machine ends it through the cast card's receipt and says so
 *   lifts      true — the status a `count.press` pressed goes with the effect when the effect ends (Sleep's
 *              Unconscious "for the duration"); Flesh to Stone's Petrified stays, the table's (its `caveat`)
 * A MONSTER's own activity (the GM's side, RULINGS *The Monster Manual — the waiting rows built*): the same
 * row, keyed by the trait — the pack's effect on the target names the trait's activity as its origin, and
 * the trait's save activity is the repeat's. The pack ships no repeat.
 * Membership: every row. Left out on purpose: Eyebite's Asleep (ends on damage, no save — the table's);
 * Prismatic Spray's violet ray (its save is at the CASTER's next turn start, when the pack's own clock ends
 * the Blinded anyway — the plane shift is the table's).
 */
export const REPEAT_SAVES = Object.freeze({
  // THE DMG — the enchanted weapon is the origin (repeat-saves.js reads it through `answersOrEnchanted`); the weapon's own
  // save activity ("Sword of Wounding Save") is the repeat's.
  "Sword of Wounding": Object.freeze({ effect: "Wounded and Cannot Heal", on: Object.freeze(["turnEnd"]), activity: "Sword of Wounding Save",
    rule: Object.freeze({ item: "Sword of Wounding", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgSwordOfWoundi" }),
    from: "DMG weapon" }),
  "Hold Person": Object.freeze({ effect: "Paralyzed", on: Object.freeze(["turnEnd"]),
    rule: Object.freeze({ item: "Hold Person", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplHoldPerson" }),
    from: "Bard / Cleric / Druid / Sorcerer / Warlock / Wizard spell, level 2 (Concentration, 1 minute)" }),
  "Hold Monster": Object.freeze({ effect: "Paralyzed", on: Object.freeze(["turnEnd"]),
    rule: Object.freeze({ item: "Hold Monster", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplHoldMonste" }),
    from: "Bard / Sorcerer / Warlock / Wizard spell, level 5 (Concentration, 1 minute)" }),
  "Tasha's Hideous Laughter": Object.freeze({ effect: "Uncontrollable Laughter", on: Object.freeze(["turnEnd", "damaged"]), advantage: "damaged",
    rule: Object.freeze({ item: "Tasha's Hideous Laughter", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplTashasHide" }),
    from: "Bard / Warlock / Wizard spell, level 1 (Concentration, 1 minute)" }),
  // Sleep (2024): Incapacitated until the end of its next turn, then the save again — a success ends it, a failure is
  // Unconscious for the duration (locked, no more saves); damage ends the spell on it, the Unconscious with it. The
  // first save is the cast's (the pack's Sleeping effect lands on the failure); the shake-awake is the table's
  // (RULINGS *Session zero's combat*).
  "Sleep": Object.freeze({ effect: "Sleeping", on: Object.freeze(["turnEnd"]), count: Object.freeze({ saves: 1, fails: 1, press: "unconscious" }),
    endsOn: Object.freeze(["damaged"]), lifts: true,
    caveat: "a creature within 5 feet may use its action to shake the sleeper awake — the table removes the effect",
    rule: Object.freeze({ item: "Sleep", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplSleep00000" }),
    from: "Bard / Sorcerer / Wizard spell, level 1 (Concentration, 1 minute)" }),
  "Blindness/Deafness": Object.freeze({ effect: Object.freeze(["Blindness", "Deafness"]), on: Object.freeze(["turnEnd"]),
    rule: Object.freeze({ item: "Blindness/Deafness", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplBlindnessD" }),
    from: "Bard / Cleric / Sorcerer / Wizard spell, level 2 (1 minute)" }),
  "Crown of Madness": Object.freeze({ effect: "Spectral Crown", on: Object.freeze(["turnEnd"]),
    rule: Object.freeze({ item: "Crown of Madness", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplCrownofMad" }),
    from: "Bard / Sorcerer / Warlock / Wizard spell, level 2 (Concentration, 1 minute)" }),
  "Slow": Object.freeze({ effect: "Slowed", on: Object.freeze(["turnEnd"]),
    rule: Object.freeze({ item: "Slow", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplSlow000000" }),
    from: "Sorcerer / Wizard spell, level 3 (Concentration, 1 minute)" }),
  "Fear": Object.freeze({ effect: "Fear", on: Object.freeze(["turnEnd"]),
    caveat: "only while it has no line of sight to the caster — the table's call; a success it should not have had is reverted from the card",
    rule: Object.freeze({ item: "Fear", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplFear000000" }),
    from: "Bard / Sorcerer / Warlock / Wizard spell, level 3 (Concentration, 1 minute)" }),
  "Confusion": Object.freeze({ effect: "Confused", on: Object.freeze(["turnEnd"]),
    rule: Object.freeze({ item: "Confusion", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplConfusion0" }),
    from: "Bard / Druid / Sorcerer / Wizard spell, level 4 (Concentration, 1 minute)" }),
  "Phantasmal Killer": Object.freeze({ effect: "Fears Manifested", on: Object.freeze(["turnEnd"]), onSave: "none",
    rule: Object.freeze({ item: "Phantasmal Killer", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplPhantasmal" }),
    from: "Wizard spell, level 4 (Concentration, 1 minute)" }),
  "Eyebite": Object.freeze({ effect: Object.freeze(["Panicked", "Sickened"]), on: Object.freeze(["turnEnd"]),
    rule: Object.freeze({ item: "Eyebite", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplEyebite000" }),
    from: "Bard / Sorcerer / Warlock / Wizard spell, level 6 (Concentration, 1 minute)" }),
  "Contagion": Object.freeze({
    effect: Object.freeze(["Infected (Strength)", "Infected (Dexterity)", "Infected (Constitution)", "Infected (Intelligence)", "Infected (Wisdom)", "Infected (Charisma)"]),
    on: Object.freeze(["turnEnd"]), count: Object.freeze({ saves: 3, fails: 3 }),
    caveat: "three failures lock the disease in for its seven days; the ability's Disadvantage is the effect's",
    rule: Object.freeze({ item: "Contagion", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplContagion0" }),
    from: "Cleric / Druid spell, level 5 (7 days)" }),
  "Flesh to Stone": Object.freeze({ effect: "Turning to Stone", on: Object.freeze(["turnEnd"]), count: Object.freeze({ saves: 3, fails: 3, press: "petrified" }),
    caveat: "three failures press Petrified, the spell's effect standing under it; a Petrified that outlasts the concentration is the table's",
    rule: Object.freeze({ item: "Flesh to Stone", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplFleshtoSto" }),
    from: "Sorcerer / Wizard spell, level 6 (Concentration, 1 minute)" }),
  "Dominate Beast": Object.freeze({ effect: "Dominated", on: Object.freeze(["damaged"]),
    rule: Object.freeze({ item: "Dominate Beast", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplDominateBe" }),
    from: "Druid / Ranger / Sorcerer spell, level 4 (Concentration, 1 minute)" }),
  "Dominate Person": Object.freeze({ effect: "Dominated", on: Object.freeze(["damaged"]),
    rule: Object.freeze({ item: "Dominate Person", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplDominatePe" }),
    from: "Bard / Sorcerer / Wizard spell, level 5 (Concentration, 1 minute)" }),
  "Dominate Monster": Object.freeze({ effect: "Dominated", on: Object.freeze(["damaged"]),
    rule: Object.freeze({ item: "Dominate Monster", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplDominateMo" }),
    from: "Bard / Sorcerer / Warlock / Wizard spell, level 8 (Concentration, 1 hour)" }),
  // The save is the dancer's ACTION: offered at its turn start, never demanded by the clock.
  "Otto's Irresistible Dance": Object.freeze({ effect: "Irresistible Dance", on: Object.freeze(["action"]),
    rule: Object.freeze({ item: "Otto's Irresistible Dance", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplOttosIrres" }),
    from: "Bard / Wizard spell, level 6 (Concentration, 1 minute)" }),
  // The indigo ray's Restrained (RAY_TABLES lands it): Flesh to Stone's count against the spell's own Con save.
  "Prismatic Spray (Indigo)": Object.freeze({ item: "Prismatic Spray", effect: "Petrifying (Indigo)", activity: "Indigo Save (Con)",
    on: Object.freeze(["turnEnd"]), count: Object.freeze({ saves: 3, fails: 3, press: "petrified" }),
    caveat: "three failures press Petrified until freed by Greater Restoration or the like — the table's",
    rule: Object.freeze({ item: "Prismatic Spray", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplPrismaticS" }),
    from: "Sorcerer / Wizard spell, level 7 (instantaneous; the ray's Restrained lasts until the saves decide it)" }),
  // The GM's side — a monster's own activity, the pack's effect on the target (RULINGS *The Monster Manual — the waiting rows built*).
  "Pacifying Spores": Object.freeze({ effect: "Stunned", on: Object.freeze(["turnEnd"]),
    caveat: "after 1 minute it succeeds automatically — the effect's own clock",
    rule: Object.freeze({ item: "Pacifying Spores", uuid: "Compendium.dnd-monster-manual.features.Item.mmPacifyingSpore" }),
    from: "monsters (myconid sovereign)" }),
  "Paralysis Gas": Object.freeze({ effect: "Paralyzed", on: Object.freeze(["turnEnd"]),
    caveat: "after 1 minute it succeeds automatically — the effect's own clock",
    rule: Object.freeze({ item: "Paralysis Gas", uuid: "Compendium.dnd-monster-manual.features.Item.mmParalysisGas00" }),
    from: "monsters" }),
  "Scare": Object.freeze({ effect: "Frightened", on: Object.freeze(["turnEnd"]),
    caveat: "after 1 minute it succeeds automatically — the effect's own clock",
    rule: Object.freeze({ item: "Scare", uuid: "Compendium.dnd-monster-manual.features.Item.mmScare000000000" }),
    from: "monsters" }),
  "Spores": Object.freeze({ effect: "Poisoned", on: Object.freeze(["turnEnd"]),
    caveat: "Holy Water ending it early is the table's; the damage while Poisoned is TURN_GRANTS' row",
    rule: Object.freeze({ item: "Spores", uuid: "Compendium.dnd-monster-manual.features.Item.mmSpores00000000" }),
    from: "monsters (violet fungus)" }),
  // The escalation: the first failure's Restrained repeats at the turn end; the second failure is Petrified INSTEAD.
  "Petrifying Bite": Object.freeze({ effect: "Restrained", activity: "Second Save", on: Object.freeze(["turnEnd"]),
    count: Object.freeze({ saves: 1, fails: 1, press: "petrified", swap: true }),
    caveat: "freed by Greater Restoration or the like — the table's",
    rule: Object.freeze({ item: "Petrifying Bite", uuid: "Compendium.dnd-monster-manual.features.Item.mmPetrifyingBite" }),
    from: "monsters (cockatrice)" }),
  "Petrifying Breath": Object.freeze({ effect: "Restrained", on: Object.freeze(["turnEnd"]),
    count: Object.freeze({ saves: 1, fails: 1, press: "petrified", swap: true }),
    caveat: "the pack's one save carries both effects — the tray lands Restrained first; freed by Greater Restoration or the like — the table's",
    rule: Object.freeze({ item: "Petrifying Breath", uuid: "Compendium.dnd-monster-manual.features.Item.mmPetrifyingBrea" }),
    from: "monsters (gorgon)" }),
  "Petrifying Gaze": Object.freeze({ effect: "Restrained", activity: "Second Save", on: Object.freeze(["turnEnd"]),
    count: Object.freeze({ saves: 1, fails: 1, press: "petrified", swap: true }),
    caveat: "the medusa's own reflection is the table's; freed by Greater Restoration or the like — the table's",
    rule: Object.freeze({ item: "Petrifying Gaze", uuid: "Compendium.dnd-monster-manual.features.Item.mmPetrifyingGaze" }),
    from: "monsters (medusa)" }),
  // ARCANA UNLEASHED (RULINGS *Arcana Unleashed*) — the repeating saves at the bearer's turn end, the spell's own save activity
  // (named where the first save is the cast's, not the repeat's).
  "Festering Blast": Object.freeze({ effect: "Poisoned", activity: "Repeat Save", on: Object.freeze(["turnEnd"]),
    rule: Object.freeze({ item: "Festering Blast", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunFesteringBlzT" }),
    from: "Arcana Unleashed — level 4 spell (Concentration, 1 minute)" }),
  "Entrancing Mirrors": Object.freeze({ effect: "Stunned", on: Object.freeze(["turnEnd"]),
    caveat: "the halved Speed while Stunned is the table's",
    rule: Object.freeze({ item: "Entrancing Mirrors", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunEntrancingMlx" }),
    from: "Arcana Unleashed — level 8 spell (1 minute)" }),
  "Fractured Awareness": Object.freeze({ effect: "Disadv. D20 Tests", on: Object.freeze(["turnEnd"]), onSave: "none",
    rule: Object.freeze({ item: "Fractured Awareness", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunFracturedAwZD" }),
    from: "Arcana Unleashed — level 7 spell (Concentration, 1 minute)" }),
  "Inflict Doubt": Object.freeze({ effect: "Disadv. D20 Tests", on: Object.freeze(["turnEnd"]),
    rule: Object.freeze({ item: "Inflict Doubt", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunInflictDoubTp" }),
    from: "Arcana Unleashed — level 3 spell (Concentration, 1 minute)" }),
  "Uncertain Footing": Object.freeze({ effect: "Hampered", on: Object.freeze(["turnEnd"]),
    caveat: "\"can't take the Dash action\" is the table's",
    rule: Object.freeze({ item: "Uncertain Footing", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunUncertainForz" }),
    from: "Arcana Unleashed — level 2 spell (Concentration, 1 minute)" }),
  "Vision of Elapsing Eons": Object.freeze({ effect: "Paralyzed", on: Object.freeze(["turnEnd"]), onSave: "none",
    caveat: "each FAILED repeat gives 1 Exhaustion level — the table's; someone within 5 feet shaking it free ends the spell",
    rule: Object.freeze({ item: "Vision of Elapsing Eons", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunVisionofElaMG" }),
    from: "Arcana Unleashed — level 9 spell (Concentration, 1 minute)" }),
  "Power Word Pain": Object.freeze({ effect: "Power Word Pain", activity: "Repeat Save", on: Object.freeze(["turnEnd"]),
    caveat: "the Constitution save to cast a spell while in pain is the table's (the pack's Spellcasting Save, from the sheet)",
    rule: Object.freeze({ item: "Power Word Pain", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunPowerWordPaww" }),
    from: "Arcana Unleashed — level 7 spell (1 minute)" }),
  // A worn item's save: the bellows' Incapacitated repeats at the creature's turn end against the First Command Word's DC.
  "Bellows of Strangulation": Object.freeze({ effect: "Incapacitated", activity: "First Command Word", on: Object.freeze(["turnEnd"]),
    caveat: "the Second Command Word's creatures repeat against the same DC",
    rule: Object.freeze({ item: "Bellows of Strangulation", uuid: "Compendium.dnd-arcana-unleashed.items.Item.aunBellowsofStJo" }),
    from: "Arcana Unleashed — wondrous item" }),
  // The GM's side — the illusory dragon's Frightened repeats on its own "Repeat Frightening Save" (the monster's-own-activity shape).
  "Frightening Appearance": Object.freeze({ effect: "Frightened", activity: "Repeat Frightening Save", on: Object.freeze(["turnEnd"]),
    caveat: "\"no line of sight to the illusion\" and the dropped items are the table's",
    rule: Object.freeze({ item: "Frightening Appearance", uuid: "Compendium.dnd-arcana-unleashed.actors.Item.aSPI6eWw42j6t3fs" }),
    from: "Arcana Unleashed — Illusory Dragon (level 8 spell)" }),
  // HEROES OF FAERÛN — Strike Fear's Terrify: the Frightened repeats at the creature's turn end against the Terrify save.
  "Strike Fear": Object.freeze({ effect: "Strike Fear: Terrify", activity: "Terrify", on: Object.freeze(["turnEnd"]),
    rule: Object.freeze({ item: "Strike Fear", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofSotStrikeFear", benefit: "Terrify" }),
    from: "Rogue — Scion of the Three 9 (Heroes of Faerûn)" }),
  // RAVENLOFT — the dark gifts' landed effects: Paranoia (Watchers) repeats at the bearer's turn end; Symbiotic Agenda's Charmed
  // whenever damage lands on the bearer.
  "Watchers": Object.freeze({ effect: "Paranoia", activity: "Incessant Watchers", on: Object.freeze(["turnEnd"]),
    rule: Object.freeze({ item: "Watchers", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwWatchersGH8OL", benefit: "Incessant Watchers" }),
    from: "Dark Gift (Ravenloft)" }),
  "Symbiotic Being": Object.freeze({ effect: "Symbiotic Agenda (Charmed)", activity: "Symbiotic Agenda", on: Object.freeze(["damaged"]),
    caveat: "the DM's save for acting against the agenda is the table's",
    rule: Object.freeze({ item: "Symbiotic Being", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwSymbioticBein", benefit: "Symbiotic Agenda" }),
    from: "Dark Gift (Ravenloft)" })
});

/**
 * A SPELL whose landed effect pays the bearer something at the start of each of its turns that the pack
 * rolls once, at the cast (turn-grants.js): the origin item's `activity` is rolled again on the CASTER's
 * numbers and landed on the bearer, receipted, no choice (R1). Keyed by the spell; `effect` the pack's
 * effect name on the bearer. Precedent: the emanation's `heal on "turnStart"` (EMANATIONS, Aura of Life).
 * ⚠ NOT A KIND — one table, one machine; a second customer is a row.
 *   match     "feature" (Regeneration, the GM's side): the bearer's OWN trait pays, rolled on ITS numbers — no effect,
 *             no caster; `activity` null is the first heal activity
 *   while     "aboveZero" — only with at least 1 Hit Point at the turn start
 *   unless    { damagedBy: "text" } — the block read off the BEARER's copy of the trait ("takes Acid or Fire
 *             damage"): dealt any named type since its last turn started (the receipts), it pays nothing and a
 *             card says why. The pack's item names no type; each monster's copy names its own
 *   on        "turnStart" (the default) | "turnEnd" — the bearer's turn END (the swarm's grappled target)
 *   deals     true — the activity is a DAMAGE landed on the bearer of the effect, rolled on the ORIGIN's numbers
 *             (the grappled creature's own turn: Constricting Vine's "Damage: Grappled"; Spores' "Damage While
 *             Poisoned"); a feature row's `deals: "grappled"` deals its damage activity, at the bearer's own turn
 *             start, to the creatures the bearer GRAPPLES (Barbed Hide — Unarmed Fighting's finder, the grapples
 *             it can trace to the bearer only; the rest are the table's)
 *   remind    "extend" — pays nothing: at the bearer's turn END a card says the effect ends now unless the turn
 *             extended it (Rage: an attack roll at an enemy or a save forced on one, read off the turn's cards,
 *             or a Bonus Action nothing records) — never an end (RULINGS *Where the table bends the rule*);
 *             the turn the effect began is never reminded; `unlessFeature` — a feature on the bearer that
 *             silences it (Persistent Rage: the Rage lasts without extending)
 *   feature   a `match: "feature"` row that is ONE BENEFIT of a feature: the sheet's item is this name, the row
 *             key the benefit (Vitality of the Tree's two)
 *   on: "use" + of   the bearer's OWN use of the named item (`of`: the Rage) pays the row (Vitality Surge)
 *   while     "raging" — the bearer wears its Rage · "bloodied" (D1, Survivor's Heroic Rally) — at half its Hit Points or
 *             fewer and at least 1 · `whileEffect` (D1) — the bearer wears an effect of that name (Elder Champion's form)
 *   to: "ally" the row's amount is GIVEN to one creature within `reach` feet — the owner picks (the rest song's
 *             popup, rest-grants.js); `self` false: another creature (Life-Giving Force)
 *   grant     B4 — what a feature row pays that is not a roll: "inspiration" (Heroic Warrior: Heroic Inspiration written
 *             on the sheet at the turn start when none is held, a card, no choice — R1) | "end" (Guarded Mind, Self-
 *             Restoration, Physician's Touch: one of `statuses` ended on the bearer — OFFERED, a button per condition it
 *             wears, `activity` the pack's activity that pays when the row has a cost, the clock keeps it)
 *   to: "target"  an `on: "use"` row whose bearer is the use's TARGET (Hand of Healing's healed creature); `of` may be a
 *             list of items (the pack ships the heal on two), `activityType` narrows the use ("heal")
 * The GM's side: RULINGS *The Monster Manual — the waiting rows built*.
 */
export const TURN_GRANTS = Object.freeze({
  "Heroism": Object.freeze({ effect: "Bravery", activity: "Heal", on: "turnStart",
    rule: Object.freeze({ item: "Heroism", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplHeroism000" }),
    from: "Bard / Paladin spell, level 1 (Concentration, 1 minute)" }),
  "Regeneration": Object.freeze({ match: "feature", effect: null, activity: null, on: "turnStart", while: "aboveZero",
    unless: Object.freeze({ damagedBy: "text" }),
    caveat: "a block that is not a damage type (the vampire's sunlight, running water) is the table's",
    rule: Object.freeze({ item: "Regeneration", uuid: "Compendium.dnd-monster-manual.features.Item.mmRegeneration00" }),
    from: "monsters (trolls, hydras, vampires)" }),
  // The grappled creature's own turn: the grappler's damage activity, its Grappled the effect (the tray's copy names the attack).
  "Constricting Vine": Object.freeze({ effect: "Grappled", activity: "Damage: Grappled", on: "turnStart", deals: true,
    rule: Object.freeze({ item: "Constricting Vine", uuid: "Compendium.dnd-monster-manual.features.Item.mmConstrictingVi" }),
    from: "monsters (vine blight)" }),
  "Smother": Object.freeze({ effect: "Grappled + Other Conditions", activity: "Grappled: Damage", on: "turnStart", deals: true,
    caveat: "the rug halving its own damage and passing it to the smothered is the table's",
    rule: Object.freeze({ item: "Smother", uuid: "Compendium.dnd-monster-manual.features.Item.mmSmother0000000" }),
    from: "monsters (rug of smothering)" }),
  "Swarm of Proboscises": Object.freeze({ effect: "Grappled", activity: "Damage: Grappled", on: "turnEnd", deals: true,
    rule: Object.freeze({ item: "Swarm of Proboscises", uuid: "Compendium.dnd-monster-manual.features.Item.mmSwarmOfProbosc" }),
    from: "monsters (swarm of stirges)" }),
  "Spores": Object.freeze({ effect: "Poisoned", activity: "Damage While Poisoned", on: "turnStart", deals: true,
    rule: Object.freeze({ item: "Spores", uuid: "Compendium.dnd-monster-manual.features.Item.mmSpores00000000" }),
    from: "monsters (violet fungus)" }),
  // The grappler's own turn start: its damage to what it holds.
  "Barbed Hide": Object.freeze({ match: "feature", effect: null, activity: null, on: "turnStart", deals: "grappled",
    caveat: "a grapple the module cannot trace to the bearer is the table's",
    rule: Object.freeze({ item: "Barbed Hide", uuid: "Compendium.dnd-monster-manual.features.Item.mmBarbedHide0000" }),
    from: "monsters (barbed devil)" }),
  "Rage": Object.freeze({ effect: "Rage", on: "turnEnd", remind: "extend", unlessFeature: "Persistent Rage",
    says: "an attack roll against an enemy, a saving throw forced on one, or a Bonus Action to extend it",
    rule: Object.freeze({ item: "Rage", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbRage000000", benefit: "Duration" }),
    from: "Barbarian 1" }),
  // Vitality of the Tree's two benefits (the PHB classes, A6): the surge at the Rage, the gift at each raging turn start.
  "Vitality Surge": Object.freeze({ match: "feature", feature: "Vitality of the Tree", activity: "Vitality Surge", on: "use", of: "Rage",
    rule: Object.freeze({ item: "Vitality of the Tree", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbVitalityOf", benefit: "Vitality Surge" }),
    from: "Barbarian — Path of the World Tree 3" }),
  "Life-Giving Force": Object.freeze({ match: "feature", feature: "Vitality of the Tree", activity: "Life-Giving Force", on: "turnStart",
    while: "raging", to: "ally", reach: 10, self: false,
    caveat: "the Temporary Hit Points vanishing when the Rage ends is the table's",
    rule: Object.freeze({ item: "Vitality of the Tree", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrbVitalityOf", benefit: "Life-Giving Force" }),
    from: "Barbarian — Path of the World Tree 3" }),
  // B4 — the grants that are not a roll (RULINGS *The PHB classes — B4*). Heroic Warrior: in a combat, at the turn start.
  "Heroic Warrior": Object.freeze({ match: "feature", on: "turnStart", grant: "inspiration",
    rule: Object.freeze({ item: "Heroic Warrior", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrHeroicWarr" }),
    from: "Fighter — Champion 10" }),
  // Guarded Mind: the pack's End Effects activity spends a Psionic Energy Die (poolOf); the Resistance half is the pack's.
  "Guarded Mind": Object.freeze({ match: "feature", on: "turnStart", grant: "end", activity: "End Effects",
    statuses: Object.freeze(["charmed", "frightened"]),
    rule: Object.freeze({ item: "Guarded Mind", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrGuardedMin" }),
    from: "Fighter — Psi Warrior 10" }),
  "Self-Restoration": Object.freeze({ match: "feature", on: "turnEnd", grant: "end",
    statuses: Object.freeze(["charmed", "frightened", "poisoned"]),
    caveat: "the no-food-no-drink half is the table's",
    rule: Object.freeze({ item: "Self-Restoration", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkSelfrestor" }),
    from: "Monk 10" }),
  // Physician's Touch's Hand of Healing half: the healed creature may lose one condition (asked). The Hand of Harm half is
  // the hit menu's (HIT_OPTIONS "hand-of-harm" `also`). The pack ships the heal on Hand of Healing AND on Physician's Touch.
  "Physician's Touch": Object.freeze({ match: "feature", on: "use", of: Object.freeze(["Hand of Healing", "Physician's Touch"]),
    activityType: "heal", to: "target", grant: "end",
    statuses: Object.freeze(["blinded", "deafened", "paralyzed", "poisoned", "stunned"]),
    rule: Object.freeze({ item: "Physician's Touch", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnkPhysicians" }),
    from: "Monk — Warrior of Mercy 6" }),
  // D1 — Survivor's Heroic Rally: the pack's heal (5 + Con) at each turn start while Bloodied, no choice (R1).
  "Heroic Rally": Object.freeze({ match: "feature", feature: "Survivor", activity: "Heroic Rally", on: "turnStart", while: "bloodied",
    rule: Object.freeze({ item: "Survivor", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrSurvivor00", benefit: "Heroic Rally" }),
    from: "Fighter — Champion 18" }),
  // D1 — Elder Champion's Regeneration: 10 Hit Points at each turn start while the form stands (its effect on the paladin).
  "Elder Champion": Object.freeze({ match: "feature", activity: "Regeneration", on: "turnStart", whileEffect: "Diminished Defiance",
    rule: Object.freeze({ item: "Elder Champion", uuid: "Compendium.dnd-players-handbook.classes.Item.phbpdnElderChamp", benefit: "Regeneration" }),
    from: "Paladin — Oath of the Ancients 20" }),
  // ARCANA UNLEASHED — Festering Blast: Spores' shape — the Poisoned creature takes the spell's "Ongoing Poison Damage" at its
  // own turn start, rolled on the caster's numbers; the repeat at its turn end is REPEAT_SAVES'.
  "Festering Blast": Object.freeze({ effect: "Poisoned", activity: "Ongoing Poison Damage", on: "turnStart", deals: true,
    rule: Object.freeze({ item: "Festering Blast", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunFesteringBlzT" }),
    from: "Arcana Unleashed — level 4 spell (Concentration, 1 minute)" }),
  // RAVENLOFT — Ravenous Bites: Spores' row on the swarm's attack — the Poisoned creature takes the trait's 1d8 at each of its
  // turn starts (the trait's own damage activity, unnamed: the first).
  "Ravenous Bites": Object.freeze({ effect: "Poisoned", activity: null, on: "turnStart", deals: true,
    caveat: "\"ends early if a spell or effect restores Hit Points\" and the death at 0 are the table's",
    rule: Object.freeze({ item: "Ravenous Bites", uuid: "Compendium.dnd-ravenloft-horrors-within.actors.Item.Gf86wgOqCghVGdJd" }),
    from: "Ravenloft — monsters (swarm of ravenous insects)" })
});

/**
 * THE WARDS (the spells slice, Tier 3; wards.js; RULINGS *The spells slice — Tier 3*): a standing
 * effect on a creature that makes whoever TARGETS it save first, BEFORE the roll — the buy box's seam
 * (`dnd5e.preRollAttack`, advantage-buys.js) and the cast's (`dnd5e.preUseActivity`). Keyed by the spell; the
 * effect is found on the bearer by its name AND its origin item (`repeatRowFor`'s matcher). The save is the
 * item's own activity, demanded of the attacker through the saves machine; a failure cancels the attack or the
 * spell (the card says so, the target is the attacker's to change); a success lets it roll.
 *   effect    the pack's effect on the WARDED creature;  activity  the save activity on the ward's item
 *   gates     "attack" — every attack roll at the bearer · "damagingSpell" — a spell with damage aimed at it
 *             (no area: "doesn't protect from areas of effect")
 *   endsOn    what the BEARER does that ends it: "attack" (an attack roll) · "spell" (any cast, cantrips and
 *             heals included — ruled) · "damage" (a damage roll — the register row)
 * Not a kind: one machine, rows of data. ⚠ Unbreakable Majesty (Bard, Glamour 14) is NOT this shape in 2024:
 * its save comes AFTER a hit ("or the attack misses instead") — the duplicates' seam with a save for the die.
 */
export const WARDS = Object.freeze({
  "Sanctuary": Object.freeze({ effect: "Warded", activity: "Save on Target",
    gates: Object.freeze(["attack", "damagingSpell"]), endsOn: Object.freeze(["attack", "spell", "damage"]),
    rule: Object.freeze({ item: "Sanctuary", uuid: "Compendium.dnd-players-handbook.spells.Item.phbSanctuary0000" }),
    from: "Cleric spell, level 1 (1 minute)" })
});

/**
 * THE DUPLICATES (the spells slice, Tier 3; hold/*, RULINGS *The spells slice — Tier 3*): a hit that
 * stands after the defender's reactions is rolled AGAINST THE DUPLICATES — a die per standing duplicate, any
 * face at `at` or higher redirects the hit to one of them, which is destroyed (its effect deleted); no choice
 * (R1), no popup — the dice rise off the token. Rides the hold: the target entry is answered by the machine, the
 * absorbed hit is a `verdict: "absorbed"` (decide/verdict.js). An attacker that sees through (a status, a sense)
 * rolls nothing and a line says why.
 *   effect    the pack's effects, one per duplicate (the count is what stands on the sheet)
 *   die · at  the die per duplicate, the face that redirects
 *   seesThrough  { statuses, senses } on the ATTACKER that make it immune
 *   match     "feature" (the GM's side, Reflective Carapace): the DEFENDER's own trait, one "duplicate" that is
 *             never destroyed — `only: "rangedSpellAttack"` narrows the hits it answers; `reflectAt` the face
 *             that also reflects the spell (the caster the target — the table's, the card says so)
 *   save      (C1, Unbreakable Majesty) the ATTACKER's save in place of the die: the pack's save activity of that
 *             name on the defender's item; a failure absorbs the hit, once per turn per attacker
 * Not a kind: one machine, rows of data.
 */
export const DUPLICATES = Object.freeze({
  "Mirror Image": Object.freeze({ effect: Object.freeze(["Duplicate A", "Duplicate B", "Duplicate C"]), die: 6, at: 3,
    seesThrough: Object.freeze({ statuses: Object.freeze(["blinded"]), senses: Object.freeze(["blindsight", "truesight"]) }),
    rule: Object.freeze({ item: "Mirror Image", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplMirrorImag" }),
    from: "Bard / Sorcerer / Warlock / Wizard spell, level 2 (1 minute)" }),
  // The tarrasque's shell: every ranged spell attack is turned aside (a d6 — 1 to 5 unaffected, a 6 unaffected AND reflected).
  "Reflective Carapace": Object.freeze({ match: "feature", die: 6, at: 1, reflectAt: 6, only: "rangedSpellAttack",
    caveat: "Magic Missile (no attack roll) is the cast-triggered kind, not built; the reflection on a 6 — the caster the target — is the table's",
    rule: Object.freeze({ item: "Reflective Carapace", uuid: "Compendium.dnd-monster-manual.features.Item.mmReflectiveCara" }),
    from: "monsters (the tarrasque)" }),
  // C1 — Unbreakable Majesty: one "duplicate" that is never destroyed; a hit that stands inside the Majestic Presence demands
  // the ATTACKER's Charisma save (`save`: the pack's activity on the bard's item, the bard's DC) in place of a die — a failure
  // turns the hit aside (`absorbed`), once per turn per attacker (the `recoiled` stamp on the effect).
  "Unbreakable Majesty": Object.freeze({ effect: "Majestic Presence", save: "Recoil Save",
    rule: Object.freeze({ item: "Unbreakable Majesty", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdUnbreakabl" }),
    from: "Bard — College of Glamour 14" })
});

/**
 * THE DAMAGE SHARES (RULINGS *The spells slice — the held spells*; damage-shares.js): a standing effect on a
 * creature whose text says its CASTER takes what it takes (Warding Bond). Read on `dnd5e.applyDamage`, the
 * rebukes' seam: the amount that LANDED on the bearer is applied to the caster (the effect's origin actor)
 * as untyped damage — the same number, no second resistance — with its own receipt on the same card, no
 * choice (R1). Keyed by the spell; the effect is found by its name AND its origin (`repeatRowFor`).
 *   effect    the pack's effect on the BEARER;  share  the fraction of the landed amount (1: the same)
 *   within    feet — beyond it the bond is out of reach: nothing is shared and a card says so
 *   endsAt    "zeroHP" — the caster dropping to 0 ends the spell (the effect deleted, receipted)
 * Not a kind: one machine, rows of data.
 */
export const DAMAGE_SHARES = Object.freeze({
  "Warding Bond": Object.freeze({ effect: "Bonded", share: 1, within: 60, endsAt: "zeroHP",
    caveat: "the bond's end at more than 60 feet, or at a re-cast on either creature, is the table's — delete Bonded",
    rule: Object.freeze({ item: "Warding Bond", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplWardingBon" }),
    from: "Cleric / Paladin spell, level 2 (1 hour)" })
});

/**
 * THE HEAL ON HIT (RULINGS *The spells slice — the held spells*; heal-on-hit.js): a spell whose damage, once
 * it has LANDED, heals its caster a share of what landed (Vampiric Touch — Lifedrinker's shape, SWEEP §3
 * item 4). Read on `dnd5e.applyDamage`: the dealing card's activity answers the row; the amount taken of
 * the row's `type` (every part of it, on this spell) times `share`, floored, is healed on the caster with a
 * receipt on the same card, once per creature per card, no choice (R1). Keyed by the spell.
 *   share   the fraction healed;  type  the damage type the text names, or null for every type
 *   on      "kill" — keyed by a FEATURE on its bearer, not the dealing item: when an ENEMY of the bearer (the
 *           tokens on opposite sides) drops to 0 under damage a card dealt, and the bearer dealt it or stands
 *           `within` feet of the fallen, the feature's own heal activity lands on the bearer (`temphp`: its
 *           Temporary Hit Points, which never stack) — receipted, no choice (R1). A drop no card dealt (a sheet
 *           edit) names no dealer and pays nothing (RULINGS *Where the table bends the rule*)
 *   RAVENLOFT: a `kill` row's `pick` (with `within`, `self`) OFFERS the heal to one creature in reach instead of landing it on
 *           the bearer (Keeper of Souls), `uses` the feature's own, never while Incapacitated; `on: "hit"` — the bearer's own
 *           attack lands damage: `activity` rolled on the bearer and landed on it, `while` an effect it must wear, `bloodied`
 *           at half or fewer, `once: "turn"` a turn chit (Hungering Might)
 * Not a kind: one machine, rows of data.
 */
export const HEAL_ON_HIT = Object.freeze({
  "Vampiric Touch": Object.freeze({ share: 0.5, type: "necrotic",
    rule: Object.freeze({ item: "Vampiric Touch", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplVampiricTo" }),
    from: "Sorcerer / Warlock / Wizard spell, level 3 (Concentration, 1 minute)" }),
  "Dark One's Blessing": Object.freeze({ on: "kill", temphp: true, within: 10,
    rule: Object.freeze({ item: "Dark One's Blessing", uuid: "Compendium.dnd-players-handbook.classes.Item.phbwlkDarkOnesBl" }),
    from: "Warlock — Fiend Patron 3" }),
  // C1 — Improved Blessed Strikes (Potent Spellcasting's temp HP): when the bearer's CLERIC CANTRIP lands damage
  // (`on: "damage"`, `spell: "cantrip"`, `spellClass`), the feature's heal activity's Temporary Hit Points (2 × Wis) are
  // OFFERED to one creature within `within` feet — the giver too (`self`) — the rest song's pick popup, once per card.
  "Improved Blessed Strikes": Object.freeze({ on: "damage", spell: "cantrip", spellClass: "cleric", temphp: true, pick: true, self: true, within: 60,
    activity: "Potent Spellcasting: Heal",
    rule: Object.freeze({ item: "Improved Blessed Strikes", uuid: "Compendium.dnd-players-handbook.classes.Item.phbclcImprovedBl" }),
    from: "Cleric 14" }),
  // ARCANA UNLEASHED — Enervation: Vampiric Touch's row (half the Necrotic landed, the cast's and each Drain Life's).
  "Enervation": Object.freeze({ share: 0.5, type: "necrotic",
    rule: Object.freeze({ item: "Enervation", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunEnervationNxK" }),
    from: "Arcana Unleashed — level 5 spell (Concentration, 1 minute)" }),
  // RAVENLOFT — Keeper of Souls: an enemy dies within 60 ft; the heal (twice the cleric's level) OFFERED to one creature within
  // 60 ft, the cleric too (`pick`, the rest song's popup); the feature's use spent (once per Short Rest); not while Incapacitated.
  "Divine Reaper": Object.freeze({ on: "kill", within: 60, pick: true, self: true, uses: true, activity: "Keeper of Souls",
    caveat: "the level 6+ slot that restores the use is the sheet's",
    rule: Object.freeze({ item: "Divine Reaper", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwCSDivineRea8I", benefit: "Keeper of Souls" }),
    from: "Cleric — Grave Domain 17 (Ravenloft)" }),
  // Hungering Might (Wrath of the Wild's own heal activity): on the ranger's hit while Ghastly Form stands and the ranger is
  // Bloodied, 1d10 + Wis regained, once per turn (`on: "hit"`).
  "Wrath of the Wild": Object.freeze({ on: "hit", activity: "Hungering Might", while: "Ghastly Form", bloodied: true, once: "turn",
    rule: Object.freeze({ item: "Wrath of the Wild", uuid: "Compendium.dnd-ravenloft-horrors-within.options.Item.rhwHWWrathofth3C", benefit: "Hungering Might" }),
    from: "Ranger — Hollow Warden 7 (Ravenloft)" })
});

/**
 * THE DRAIN (RULINGS *The Monster Manual — the waiting rows built*; drains.js): a monster's attack whose damage,
 * once it has LANDED, lowers the target — its Hit Point maximum by what landed (Life Drain, Proboscis), or an
 * ability score by the die its text names (Draining Swipe). Vampiric Touch's seam: on `dnd5e.applyDamage` the
 * dealing card's activity answers the row; the module writes an effect on the target — the pack's own where it
 * ships one ("Hit: STR Score −N"), else its own (`hp.tempmax` lowered; one copy per row, refreshed with the
 * total) — receipted on the drain's own card, once per creature per card, no choice (R1). Keyed by the item.
 *   what      "max" (the maximum, by the damage taken) | "ability" (a score)
 *   type      the damage type counted, or null for every type (Proboscis: the Necrotic alone)
 *   ability   a score row's key;  amount  "text" — the die read off the item's text ("[[/r 1d4]]"), never copied
 * Not a kind: one machine, rows of data.
 */
export const DRAINS = Object.freeze({
  "Life Drain": Object.freeze({ what: "max", type: null,
    caveat: "the target dies if the fall leaves its maximum at 0, and when the fall ends — the table's",
    rule: Object.freeze({ item: "Life Drain", uuid: "Compendium.dnd-monster-manual.features.Item.mmLifeDrain00000" }),
    from: "monsters (wights, specters, wraiths)" }),
  "Proboscis": Object.freeze({ what: "max", type: "necrotic",
    caveat: "the target dies if the fall leaves its maximum at 0, and when the fall ends — the table's",
    rule: Object.freeze({ item: "Proboscis", uuid: "Compendium.dnd-monster-manual.features.Item.mmProboscis00000" }),
    from: "monsters (stirges)" }),
  "Draining Swipe": Object.freeze({ what: "ability", ability: "str", amount: "text",
    caveat: "the target dies at a Strength of 0, and the Shadow that rises from a Humanoid — the table's",
    rule: Object.freeze({ item: "Draining Swipe", uuid: "Compendium.dnd-monster-manual.features.Item.mmDrainingSwipe0" }),
    from: "monsters (shadows)" })
});

/**
 * THE RAY TABLES (RULINGS *The spells slice — the held spells*; prismatic.js): a cone whose text rolls a die
 * PER CREATURE to pick which ray hits it (Prismatic Spray). The cast's own demand is closed at birth; when
 * the cone is placed the machine rolls `die` per creature inside and raises ONE demand per (creature, ray)
 * against the `cast` activity's save, the ray's `type` forced onto the damage roll; a ray with `save`
 * demands that activity instead and lands `effect` on a failure (the module's own, since the pack ties the
 * effects to the Cast). A `twice` face rolls two more, ignoring that face.
 *   rays    by face: { colour, type } for damage, { colour, save, effect, words } for a condition
 * Not a kind: one machine, rows of data.
 */
export const RAY_TABLES = Object.freeze({
  "Prismatic Spray": Object.freeze({ die: 8, cast: "Cast", twice: 8,
    rays: Object.freeze({
      1: Object.freeze({ colour: "red", type: "fire" }),
      2: Object.freeze({ colour: "orange", type: "acid" }),
      3: Object.freeze({ colour: "yellow", type: "lightning" }),
      4: Object.freeze({ colour: "green", type: "poison" }),
      5: Object.freeze({ colour: "blue", type: "cold" }),
      6: Object.freeze({ colour: "indigo", save: "Indigo Save (Con)", effect: "Petrifying (Indigo)",
        words: "Restrained; the save repeats at the end of each of its turns — three successes end it, three failures petrify it" }),
      7: Object.freeze({ colour: "violet", save: "Violet Save (Wis)", effect: "Teleporting (Violet)",
        words: "Blinded until the start of the caster's next turn; the Wisdom save then — a failure sends it to another plane — is the table's" }),
      8: Object.freeze({ colour: "special", twice: true })
    }),
    rule: Object.freeze({ item: "Prismatic Spray", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplPrismaticS" }),
    from: "Sorcerer / Wizard spell, level 7 (instantaneous, a 60-foot Cone)" })
});

/**
 * THE CONCENTRATION EXEMPTS (the PHB classes, C1; concentration.js): a feature under which damage never demands a
 * Concentration save for one spell — the ask machine skips the demand and a line on the card says so.
 *   spell   the spell concentrated on (every effect held must be its)
 * ⚠ NOT A KIND — one row on the ask machine; a second customer is a row.
 */
export const CONCENTRATION_EXEMPTS = Object.freeze({
  "Relentless Hunter": Object.freeze({ spell: "Hunter's Mark",
    rule: Object.freeze({ item: "Relentless Hunter", uuid: "Compendium.dnd-players-handbook.classes.Item.phbrgrRelentless" }),
    from: "Ranger 13" }),
  // ARCANA UNLEASHED — Focused Conjuration: every spell held is of the `school` (Conjuration), not one spell by name.
  "Focused Conjuration": Object.freeze({ school: "con",
    rule: Object.freeze({ item: "Focused Conjuration", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunFocusedConjur" }),
    from: "Wizard — Conjurer 10 (Arcana Unleashed)" })
});

/**
 * THE D20 FLOORS (the PHB classes, C1; d20-folds.js): while `effect` stands on the roller, its own D20 Tests treat a d20
 * face below `minimum` as `minimum` — the platform's own `minimum` on the roll configuration (Reliable Talent's knob).
 *   tests    which of the bearer's D20 Tests (attack, save, check);  abilities  narrows saves and checks to these
 *   concentration  true — a save row reaches Concentration saves alone (Starry Form's Dragon)
 *   feature   D1 — the row stands while the roller HOLDS this feature (no effect to find)
 *   worn      the DMG — with `feature`: the row stands while that magic item is WORN (equipped, and attuned where required)
 *   critical  D1 — the platform's other knob: a d20 face of at least this counts as a 20 (`criticalSuccess` on the roll
 *             configuration); `tests: ["death"]` — the Death Saving Throw alone (Survivor's Defy Death: 18–20 is a 20)
 * ⚠ NOT A KIND — a knob the platform reads, set before the roll; rows of data.
 */
export const D20_FLOORS = Object.freeze({
  "Trance of Order": Object.freeze({ effect: "Trance of Order", minimum: 10, tests: Object.freeze(["attack", "save", "check"]),
    rule: Object.freeze({ item: "Trance of Order", uuid: "Compendium.dnd-players-handbook.classes.Item.phbscrTranceOfOr" }),
    from: "Sorcerer — Clockwork Sorcery 14 (1 minute)" }),
  // Starry Form's Dragon (its first customer, A1 as text): Intelligence and Wisdom checks, and the Constitution save to keep Concentration.
  "Starry Form": Object.freeze({ effect: "Dragon Form", minimum: 10, tests: Object.freeze(["save", "check"]),
    abilities: Object.freeze({ check: Object.freeze(["int", "wis"]), save: Object.freeze(["con"]) }), concentration: true,
    rule: Object.freeze({ item: "Starry Form", uuid: "Compendium.dnd-players-handbook.classes.Item.phbdrdStarryForm", benefit: "Dragon" }),
    from: "Druid — Circle of the Stars 3" }),
  // D1 — Survivor's Defy Death: an 18 or 19 on a Death Saving Throw counts as a 20 (its Advantage is the pack's effect).
  "Survivor": Object.freeze({ feature: "Survivor", critical: 18, tests: Object.freeze(["death"]),
    rule: Object.freeze({ item: "Survivor", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrSurvivor00", benefit: "Defy Death" }),
    from: "Fighter — Champion 18" }),
  // The DMG — Life Preservation: a Death Saving Throw's 9 or lower becomes a 10 while the pendant is worn; Natural Healing
  // Boost (the Hit Point Die doubled) is the table's.
  "Periapt of Wound Closure": Object.freeze({ feature: "Periapt of Wound Closure", worn: true, minimum: 10, tests: Object.freeze(["death"]),
    rule: Object.freeze({ item: "Periapt of Wound Closure", uuid: "Compendium.dnd-dungeon-masters-guide.equipment.Item.dmgPeriaptOfWoun", benefit: "Life Preservation" }),
    from: "DMG wondrous item" })
});

/**
 * THE R4 TRIPWIRE (DESIGN.md R4, ARCHITECTURE §6): every closed kind set, with the size of the dnd5e enum it
 * mirrors (`system`; null for the module's own). tools/check-registry.mjs pins the total, so ADDING A KIND
 * FAILS THE GATE until the pin moves on purpose. Only masteries mirror one (`CONFIG.DND5E.weaponMasteries`).
 */
export const KIND_SETS = [
  { name: "interrupt", owner: "hold/index.js", kinds: INTERRUPT_KINDS, system: null,
    note: "what a held reaction changes about an attack already rolled — the AC, the damage, or "
      + "(2026-09-24, Slice A) the roll itself: Disadvantage after the hit showed" },
  { name: "maneuverFold", owner: "precision.js · riposte.js · hew.js · bash-offer.js · command.js", kinds: MANEUVER_KINDS, system: null,
    note: "how a listed feat folds into a resolved attack — D8 says this set is the one under pressure; "
      + "`command` (2026-09-05) is Riposte's driven attack with the attacker changed to an ally; "
      + "`shove` (2026-09-25) is the bash offer on an Unarmed Strike with no save — Tavern Brawler's push" },
  { name: "d20Fold", owner: "d20-folds.js", kinds: D20_FOLD_KINDS, system: null,
    note: "where the marker lives and how it is spent — the three surveyed features (v1.23.0); "
      + "the ARITHMETIC is shared and already shipped with D8, so only the spend earns a kind — "
      + "bar `advantage` (keep the higher d20) and `succeed` (2026-09-27: the verdict itself, no die)" },
  { name: "volley", owner: "volleys.js", kinds: VOLLEY_KINDS, system: null,
    note: "how a multi-projectile spell resolves: aggregated damage, or independent attacks" },
  { name: "mastery", owner: "mastery.js", kinds: MASTERY_KINDS, system: 8,
    note: "7 of the system's 8; nick is deliberately native (action economy, ruling 1)" },
  { name: "reminder", owner: "reminders.js", kinds: REMINDER_KINDS, system: null,
    note: "what the gate can READ as a source of Advantage/Disadvantage before an attack roll — "
      + "a chip on the target, a chip on the attacker, a status with geometry (Stage 2, 2026-09-01), "
      + "the condition table, and a ranged attack's own range (2026-09-02)" },
  { name: "emanation", owner: "emanations.js", kinds: EMANATION_KINDS, system: null,
    note: "how an emanation lives: always on with a feature's source token, or cast and adopted from "
      + "the template the system placed (2026-09-03) — the platform's Region keeps geometry and clock; "
      + "`area` (the spells slice): the template adopted where it was placed, attached to nothing — its "
      + "trigger words (enter, turnEnd, move) and its band, ask, gate and alert facets are vocabulary, not kinds" },
  { name: "repeatSave", owner: "repeat-saves.js", kinds: REPEAT_TRIGGERS, system: null,
    note: "what raises a landed effect's repeated save (the spells slice, 2026-09-28): the bearer's turn "
      + "end, damage landing on it, or the bearer's own action offered at its turn start" }
];

/**
 * THE KIND LISTS: which content takes which kind, where the table of the kind itself does not say.
 * The code table is the only list; a world never edits one.
 * ⚠ Riposte is ABSENT from INTERRUPTS: it triggers on a MISS and boosts no AC, so there it would hold
 * every hit. It is a maneuver fold.
 * ⚠ D20_FOLDS' `name` is a LOOKUP KEY, the card's words come from the kind (d20-folds.js `KIND_LABEL`):
 *   tactical → an item by this name · bardic → the "Inspired" EFFECT (the card says Bardic Inspiration)
 *   heroic → no lookup (a boolean) · seeking → METAMAGIC must hold it too · succeed → the FEAT (SAVE_SUCCEEDS)
 *   reroll → the FEATURE (REROLLS; the card says the feature's name)
 */
const row = (name, kind) => Object.freeze({ name, kind });
export const INTERRUPTS = Object.freeze([
  row("Shield", "ac"), row("Absorb Elements", "damage"), row("Uncanny Dodge", "damage"), row("Defensive Duelist", "ac"),
  row("Illusory Self", "ac"), row("Glorious Defense", "roll"), row("Parry", "ac"), row("Counterattack", "ac"),
  row("Defensive Stance", "ac"), row("Whirlwind of Sand", "ac"), row("Deflect Attacks", "damage"),
  row("Stone's Endurance", "damage"), row("Lucky", "roll"), row("Warding Flare", "roll"), row("Shadowy Dodge", "roll"),
  row("Interception", "damage"), row("Psionic Power", "damage"), row("Protection", "roll"), row("Cutting Words", "roll"), row("Restore Balance", "roll"), row("Guided Strike", "roll"),
  row("Combat Inspiration", "roll"), row("Portent", "roll"), row("Countercharm", "roll"),
  row("Beguiling Twist", "roll"), row("Beguiling Defenses", "damage"),
  row("Bend Luck", "roll"), row("Cosmic Omen", "roll"), row("Projected Ward", "damage"),
  row("Superior Hunter's Defense", "damage"),
  // the GM's side
  row("Toxic Escape", "damage"), row("Deflect Missile", "damage"), row("Limited Foresight", "roll"),
  // the DMG
  row("Gloves of Missile Snaring", "damage"),
  // Arcana Unleashed
  row("Go to Ground", "damage"), row("Arcane Omens", "roll"), row("Transmuted Anatomy", "roll"), row("Spell Resistant", "roll"),
  // Heroes of Faerûn
  row("Elemental Rebuke", "damage"), row("Shared Resilience", "roll"),
  // RAVENLOFT
  row("Sentinel at Death's Door", "damage"), row("Deflect Blow", "damage"),
  row("Survivor (Ravenloft)", "roll"), row("Symbiotic Being", "roll"), row("Knowledge from a Past Life", "roll")
]);
/** Which spells a reaction stops outright. */
export const BLOCKS = Object.freeze([Object.freeze({ spell: "Magic Missile", reaction: "Shield" })]);
export const MANEUVER_FOLDS = Object.freeze([
  row("Precision Attack", "precision"), row("Riposte", "riposte"), row("Shield Master", "interpose"),
  row("Shield Master", "bash"), row("Great Weapon Master", "hew"), row("Commander's Strike", "command"),
  row("Tavern Brawler", "shove"), row("Crusher", "shove"), row("Polearm Master", "hew"), row("War Priest", "hew"), row("Improved War Magic", "hew"), row("War Magic", "hew"),
  row("Hunter's Prey", "hew"), row("Battle Magic", "hew")
]);
export const D20_FOLDS = Object.freeze([
  row("Heroic Inspiration", "heroic"), row("Tactical Mind", "tactical"), row("Inspired", "bardic"),
  row("Ambush", "tactical"), row("Tactical Assessment", "tactical"), row("Seeking Spell", "seeking"),
  row("Lucky", "advantage"), row("Mage Slayer", "succeed"), row("Commanding Presence", "tactical"), row("Tides of Chaos", "advantage"),
  row("Indomitable", "reroll"), row("Fanatical Focus", "reroll"), row("Disciplined Survivor", "reroll"),
  row("Dark One's Own Luck", "tactical"), row("Soul Blades", "tactical"), row("Peerless Skill", "tactical"),
  row("Stroke of Luck", "succeed"), row("Unerring Strike", "succeed"), row("Living Legend", "reroll"),
  // the DMG
  row("Ring of Evasion", "succeed"), row("Scarab of Protection", "succeed"), row("Luck Blade", "reroll"),
  // Arcana Unleashed
  row("Keyholes Dagger", "reroll")
]);
/** Which marks pay, by system identifier. What they pay is read from the mark. */
export const RIDERS = Object.freeze(["hunters-mark", "hex", "great-old-one-hex"].map(name => Object.freeze({ name })));
/** Which of the attacker's own features replaces a mark's damage, by identifier. */
export const RIDER_UPGRADES = Object.freeze([Object.freeze({ feature: "foe-slayer", rider: "hunters-mark" })]);
/**
 * A spell whose Concentration lasts longer with a higher slot (its "Using a Higher-Level Spell Slot"), by name:
 * `[lowest slot level, hours]` steps, the highest the cast reaches standing. dnd5e lands the base duration at
 * every level; the cast's effects and the caster's Concentration take the step's (cast.js).
 */
export const SLOT_DURATIONS = Object.freeze({
  "Hex": Object.freeze([Object.freeze([2, 4]), Object.freeze([3, 8]), Object.freeze([5, 24])]),
  "Hunter's Mark": Object.freeze([Object.freeze([3, 8]), Object.freeze([5, 24])])
});
/**
 * A mark spell's uses in the system's activity picker, by identifier: `cast` the pack's activity that spends the
 * slot and `move` the one that moves the mark (no slot, no dialog, the caster's standing Concentration kept), each
 * drawn as its `label`; the rider's own damage activity is not offered (it rides the hit).
 */
export const MARK_USES = Object.freeze({
  "hex": Object.freeze({ cast: "Place Curse", move: "Curse New Creature", castLabel: "Cast Hex", moveLabel: "Move Hex" }),
  "hunters-mark": Object.freeze({ cast: "Mark Creature", move: "Move Mark", castLabel: "Cast Hunter's Mark", moveLabel: "Move Hunter's Mark" })
});

/** The kind lists and the closed set each one's kinds come from, for tools/check-registry.mjs. */
export const KIND_LISTS = Object.freeze({
  INTERRUPTS: { rows: INTERRUPTS, kinds: INTERRUPT_KINDS },
  MANEUVER_FOLDS: { rows: MANEUVER_FOLDS, kinds: MANEUVER_KINDS },
  D20_FOLDS: { rows: D20_FOLDS, kinds: D20_FOLD_KINDS }
});

/* THE READERS: fresh copies, so no caller can edit a table. A membership reader is every row of its
 * table, as `{ kind }` lower-cased. */
/**
 * SUMMON CHOICES (summons.js, issue #1): the question a summon spell's own text asks at the cast that
 * dnd5e's profile select cannot hold, and what the answer lands. `item` the spell (the key when
 * absent); `ask` the question's label; `options` the answers (damage-type keys); `narrow` the summoned
 * creature's item whose damage parts are narrowed to the one type; `resist` the name of the resistance
 * effect landed on the caster for the spell's life (null for none); `says` the book's sentence the effect carries. The Draconic Spirit ships every
 * breath type on one part and five "Shared Resistance" buttons on its own sheet.
 */
export const SUMMON_CHOICES = Object.freeze({
  "Summon Dragon": Object.freeze({
    ask: "The dragon's damage type", options: Object.freeze(["acid", "cold", "fire", "lightning", "poison"]),
    narrow: "Breath Weapon", resist: "Shared Resistance",
    says: "The spirit's Breath Weapon deals the chosen type; while it is within 10 feet, the caster has Resistance to that type.",
    rule: Object.freeze({ item: "Summon Dragon", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplSummonDrag" })
  })
});

/**
 * SUMMON SINGLES (summons.js): a summon the caster may have only one of. When a new one lands, the elect
 * dismisses the caster's earlier one of the same spell that still stands — the 2024 text's "can't have
 * more than one … at a time", the new cast taking a new form. A spell with Concentration needs no row:
 * a second cast ends the first's concentration, and that already dismisses it. `says` the book's
 * sentence. Wild Companion casts the spell itself, so its familiar is this row's too.
 */
export const SUMMON_SINGLES = Object.freeze({
  "Find Familiar": Object.freeze({
    says: "You can't have more than one familiar at a time. If you cast this spell while you have a familiar, you instead cause it to adopt a new eligible form.",
    rule: Object.freeze({ item: "Find Familiar", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplFindFamili" })
  }),
  "Vestige Companion": Object.freeze({
    says: "Whenever you finish a Long Rest, you can summon the vestige in a new form. If the vestige is already manifested from this feature, its form changes to the new one.",
    rule: Object.freeze({ item: "Vestige Companion", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunVestigeCompan" })
  }),
  "Mage Hand": Object.freeze({
    says: "The hand vanishes if it is ever more than 30 feet away from you or if you cast this spell again.",
    rule: Object.freeze({ item: "Mage Hand", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplMageHand00" })
  }),
  "Minor Illusion": Object.freeze({
    says: "The illusion ends if you cast this spell again.",
    rule: Object.freeze({ item: "Minor Illusion", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplMinorIllus" })
  }),
  "Light": Object.freeze({
    says: "The spell ends if you cast it again.",
    rule: Object.freeze({ item: "Light", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplLight00000" })
  }),
  // ARCANA UNLEASHED (RULINGS *Summons*, the Battle Familiar pass)
  "Battle Familiar": Object.freeze({
    says: "You can't have more than one familiar at a time. If you cast this spell while you already have a familiar from this spell, that familiar is replaced by the new one.",
    rule: Object.freeze({ item: "Battle Familiar", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunBattleFamilq9" })
  })
});

/**
 * SUMMON LIGHTS (summons.js): a spell that lights what the caster touches, which dnd5e ships as a summon
 * of a "Light" object. The cast asks where the light goes: ON A TOKEN (the targeted creature's token, the
 * TOKEN_LIGHTS row of the same name) or ON AN OBJECT (a token placed for the thing touched, `object` its
 * name, art and `scale` in its square, carrying `light`; `size` its one size, a 5-ft square, never asked). `look` the light's
 * colour and flicker (SPELL_LOOKS).
 */
export const SUMMON_LIGHTS = Object.freeze({
  "Light": Object.freeze({
    // a Tiny stone, half a square, drawn whole (RULINGS *Summons*, call 29)
    object: Object.freeze({ name: "Glowing Stone", img: "icons/commodities/stone/geode-raw-white.webp" }),
    size: "tiny", bright: 20, dim: 40, look: SPELL_LOOKS.light,
    rule: Object.freeze({ item: "Light", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplLight00000" })
  }),
  "Continual Flame": Object.freeze({
    // a Tiny stone, as Light's (RULINGS *Summons*, call 29)
    object: Object.freeze({ name: "Everburning Stone", img: "icons/commodities/stone/ore-chunk-copper-orange.webp" }),
    size: "tiny", bright: 20, dim: 40, look: SPELL_LOOKS.continualFlame,
    rule: Object.freeze({ item: "Continual Flame", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplContinualF" })
  })
});

/**
 * SUMMON ONE FORM (summons.js): a spell whose pack splits one thing into forms the text never asks for. The
 * menu offers no form: the `from` profile's creature lands, named `name` (Major Image is one image of
 * every sense at once; the pack ships Illusory Creature, Object and Phenomenon as three).
 */
export const SUMMON_ONE_FORM = Object.freeze({
  "Major Image": Object.freeze({ name: "Major Image", from: "Illusory Creature",
    rule: Object.freeze({ item: "Major Image", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplMajorImage" }) }),
  // the pack's steed is its Riding Horse: it lands named for what it is
  "Phantom Steed": Object.freeze({ name: "Phantom Steed", from: "Phantom Steed",
    rule: Object.freeze({ item: "Phantom Steed", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplPhantomSte" }) })
});

/**
 * SUMMON GUISES (summons.js): a spell whose one creature takes a look the caster picks (`ask`), the stat
 * block the same for every pick. The menu offers one row per guise; the creature lands named `name` with
 * `{guise}` filled, wearing that name's Summon Art (else the book's own art). The Summon Art window lists
 * each guise as its own creature (RULINGS *Summons*, call 35). `size` a house size the creature lands at, its
 * token filling that footprint (the placement's ghost too), whatever the book's.
 */
export const SUMMON_GUISES = Object.freeze({
  // Medium, the whole square, against the book's Tiny (a house call, RULINGS *Summons*, call 38)
  "Spiritual Weapon": Object.freeze({ ask: "The weapon", name: "Spiritual {guise}", guises: Object.freeze(["Mace", "Maul", "Sword", "Scythe"]), size: "med",
    rule: Object.freeze({ item: "Spiritual Weapon", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplSpiritualW" }) }),
  // "you choose the spirits' animal form, such as wolves, serpents, or birds" (the book's three, RULINGS *Summons*, call 40)
  "Conjure Animals": Object.freeze({ ask: "The animals", name: "Spectral {guise}", guises: Object.freeze(["Wolves", "Serpents", "Birds"]),
    rule: Object.freeze({ item: "Conjure Animals", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplConjureAni" }) })
});

/**
 * SUMMON COMMANDS (summons.js): a summoned creature whose one feature holds the options the caster
 * commands (`item`). On landing, each option becomes its own at-will spell on the creature, named for
 * the option, so its owner casts it straight from the sheet; the feature goes. The DC and the dice are
 * the landing's own (dnd5e's `match` and the cast level's bonuses).
 */
export const SUMMON_COMMANDS = Object.freeze({
  "Conjure Constructs": Object.freeze({ item: "Command",
    rule: Object.freeze({ item: "Conjure Constructs", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofConjureConstr" }) })
});

/**
 * SUMMON LOOKS (summons.js): how a summoned creature's token is drawn, by the creature's name, folded into
 * dnd5e's own changes as it lands. `light` the token's light (radii in feet, `dim` the OUTER radius, and a
 * SPELL_LOOKS look), where the pack ships one the spell's text does not say; `alpha` the token's opacity;
 * `scale` the art's scale in its square, for a thing smaller than its footprint (a 3-ft disk in a 5-ft square);
 * `seen` the creature's Invisible condition is switched off on the token, so the table can see it (the
 * faded token says what the condition said);
 * `spell` the spell that summons it, when the creature's name is no pack item's.
 */
export const SUMMON_LOOKS = Object.freeze({
  "Dancing Light (Tiny)": Object.freeze({ spell: "Dancing Lights", light: Object.freeze({ bright: 0, dim: 10, look: SPELL_LOOKS.dancingLight }) }),
  "Dancing Light (Medium)": Object.freeze({ spell: "Dancing Lights", light: Object.freeze({ bright: 0, dim: 10, look: SPELL_LOOKS.dancingLight }) }),
  // "The sphere sheds Bright Light in a 20-foot radius and Dim Light for an additional 20 feet" (the pack ships 0.25 ft).
  "Flaming Sphere": Object.freeze({ light: Object.freeze({ bright: 20, dim: 40, look: SPELL_LOOKS.flamingSphere }) }),
  // An invisible servant: drawn half seen, so the table can find and move it (RULINGS *Summons*).
  // ⚠ The pack's servant carries Invisible, which Foundry draws for no one without See Invisibility, its owner included.
  "Unseen Servant": Object.freeze({ alpha: 0.5, seen: true }),
  // "a circular, horizontal plane of force, 3 feet in diameter": 3 ft of a 5-ft square.
  "Floating Disk": Object.freeze({ spell: "Tenser's Floating Disk", scale: 0.6 }),
  // Clairvoyance's sensor: the same, for the same reason.
  "Invisible Sensor": Object.freeze({ spell: "Clairvoyance", alpha: 0.5, seen: true })
});

/**
 * COMPANIONS (summons.js): a summon that stays until it is dismissed: an effect on its owner names it for
 * as long as it stands (on the table or in the pocket; removing the effect asks, then dismisses it
 * forever), and casting the spell again while it stands opens a menu instead of the cast — put it away
 * or call it back, dismiss it forever, or cast for a new form (which takes the old one's place: in its
 * space, or in the pocket). `noun` the effect's word; `pocket` it can wait in a pocket dimension,
 * `recallFt` the reach of its return (an unoccupied space, no sight needed); `says` the book's sentence;
 * `brief` the cast menu's one line under the creature (the spell's full text is a click away on its card);
 * `rangeFt` where it first appears, when the use's own range says none (the Vestige's "Self": the familiar's 10 ft).
 * `names`: its owner names it — the summon menu asks a name every time, pre-filled with the one the caster last
 * gave it (one name per caster, whatever the form: a new form is the same familiar), and it lands so named.
 * Primal Companion and Find Steed join when their text is ruled.
 */
export const COMPANIONS = Object.freeze({
  "Find Familiar": Object.freeze({
    noun: "Familiar", pocket: true, recallFt: 30, names: true,
    brief: "A Magic action puts it away into its pocket dimension or calls it back within 30 ft; casting the spell again gives it a new form.",
    says: "As a Magic action, you can temporarily dismiss the familiar to a pocket dimension. Alternatively, you can dismiss it forever. As a Magic action while it is temporarily dismissed, you can cause it to reappear in an unoccupied space within 30 feet of you.",
    rule: Object.freeze({ item: "Find Familiar", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplFindFamili" })
  }),
  // the Vestige Patron's vestige: the familiar's pocket, its reach and its 10-ft arrival;
  // it acts on the warlock's turn, so it is seated after the warlock (no SUMMON_OWN_INITIATIVE row)
  "Vestige Companion": Object.freeze({
    noun: "Vestige", pocket: true, recallFt: 30, rangeFt: 10,
    brief: "A Magic action puts it away into its pocket dimension or calls it back within 30 ft; the 1-minute rite again gives it a new form.",
    says: "As a Magic action, you can temporarily dismiss the vestige to a pocket dimension. As a Magic action while it is temporarily dismissed, you can cause the vestige to reappear in an unoccupied space within 30 feet of you.",
    rule: Object.freeze({ item: "Vestige Companion", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunVestigeCompan" })
  })
});

/**
 * SUMMONS AS (summons.js): a feature that casts a summon spell, read as that spell everywhere a table names
 * it (`as`): its companion, its seat, one at a time with the spell's own. `rangeFt` the spell's range when the
 * feature's activity carries none; `longRest` it disappears when its caster finishes a Long Rest; `says` the
 * feature's own sentence (RULINGS *Summons*, call 39).
 */
export const SUMMON_AS = Object.freeze({
  // "You learn the Find Familiar spell and can cast it as a Magic action without expending a spell slot"
  "Pact of the Chain": Object.freeze({ as: "Find Familiar", rangeFt: 10,
    says: "You learn the Find Familiar spell and can cast it as a Magic action without expending a spell slot.",
    rule: Object.freeze({ item: "Pact of the Chain", uuid: "Compendium.dnd-players-handbook.classes.Item.phbinvPactChain0" }) }),
  "Wild Companion": Object.freeze({ as: "Find Familiar", rangeFt: 10, longRest: true,
    says: "As a Magic action, you can expend a spell slot or a use of Wild Shape to cast the Find Familiar spell without Material components. When you cast the spell in this way, the familiar is Fey and disappears when you finish a Long Rest.",
    rule: Object.freeze({ item: "Wild Companion", uuid: "Compendium.dnd-players-handbook.classes.Item.phbdrdWildCompan" }) })
});

/**
 * SUMMON BOONS (summons.js): a feature on the caster that changes what a summon spell lands, carried as the
 * pack's own enchantment change on the feature (`transfer: true`, a key the system applies only from the spell's
 * own effects, so on the sheet it does nothing — RULINGS *Summons*, call 46). The elect reads the change named
 * `change` off the caster's feature and lands it as dnd5e's own summon bonus would: `hp` on the creature's Hit
 * Point maximum and current Hit Points (the formula rolled on the caster's roll data). `spell` the spell it
 * reaches, read through SUMMON_AS (Wild Companion's and Pact of the Chain's familiars are Find Familiar's).
 * No amount here: the formula is the feature's (N1).
 */
export const SUMMON_BOONS = Object.freeze({
  // "When you cast the Find Familiar spell, your familiar's Hit Point maximum and current Hit Points are increased by an
  // amount equal to twice your character level" — the pack's "Fortified Familiar" enchantment, `2 * @details.level`.
  "Familiar Friend": Object.freeze({ spell: "Find Familiar", benefit: "Fortified Familiar", change: "activities[summon].bonuses.hp", lands: "hp",
    says: "When you cast the Find Familiar spell, your familiar's Hit Point maximum and current Hit Points are increased by an amount equal to twice your character level.",
    rule: Object.freeze({ item: "Familiar Friend", uuid: "Compendium.dnd-arcana-unleashed.feats.Item.aunFamiliarFri4q", benefit: "Fortified Familiar" }) })
});

/**
 * SUMMON EXTRAS (summons.js): a feature that adds forms to a summon spell, offered on a tab of their own beside
 * the spell's (`tab` its label) whenever its bearer casts the spell (`spell`, read through SUMMON_AS), or uses
 * the feature's own cast. The forms are the profiles of the feature's activity named `activity`; the spell's
 * creature type is asked of every form, its own and the extras alike.
 */
export const SUMMON_EXTRAS = Object.freeze({
  "Pact of the Chain": Object.freeze({ spell: "Find Familiar", activity: "Find Familiar (Expanded Options)", tab: "Pact of the Chain",
    says: "When you cast the spell, you choose one of the normal forms for your familiar or one of the special forms.",
    rule: Object.freeze({ item: "Pact of the Chain", uuid: "Compendium.dnd-players-handbook.classes.Item.phbinvPactChain0" }) })
});

/**
 * SUMMON SEATS (summons.js): where a summoned creature landed into a started combat takes its turn. Two
 * ways, by the spell's text: FOLLOWS the caster (the default, no row — the 2024 Summon spells' "takes its
 * turn immediately after yours": a combatant on the caster's Initiative less 0.01), or rolls its OWN
 * Initiative and acts on its own turn (a row here: the familiar). `says` the book's sentence.
 */
export const SUMMON_OWN_INITIATIVE = Object.freeze({
  "Find Familiar": Object.freeze({
    says: "The familiar rolls its own Initiative and acts on its own turn.",
    rule: Object.freeze({ item: "Find Familiar", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplFindFamili" })
  }),
  "Battle Familiar": Object.freeze({
    says: "The familiar is an ally to you and your allies. It rolls its own Initiative and acts on its own turn.",
    rule: Object.freeze({ item: "Battle Familiar", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunBattleFamilq9" })
  })
});

/**
 * SUMMON FALLS (summons.js): a summon that stands on its caster's effect (no Concentration, not a companion) and
 * disappears when its own text says: `atZero` at 0 Hit Points, `casterDeath` when its caster dies (the `dead`
 * status landing on the caster, never 0 Hit Points alone: a character at 0 is Dying). `drops`: what it carried
 * is left where it stood as it goes, however it goes (the companion's Loot Shelf chest, else lost). `says` the
 * book's sentence (RULINGS *Summons*, the Battle Familiar pass).
 */
export const SUMMON_FALLS = Object.freeze({
  "Battle Familiar": Object.freeze({ atZero: true, casterDeath: true, drops: true,
    says: "The battle familiar disappears when the spell ends, if it drops to 0 Hit Points, or if you die. When it disappears, it leaves behind in its space anything it was wearing or carrying.",
    rule: Object.freeze({ item: "Battle Familiar", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunBattleFamilq9" }) })
});

/**
 * SUMMON EMPOWERS (summons.js): a summon spell that, cast while its caster's COMPANION of another spell stands,
 * empowers that companion instead of conjuring: the companion's token is transformed into the spell's form
 * through the TRANSFORMS row the key names (`transform`), its own name and art kept, the spell's level stamped
 * on it. The route at the cast (RULINGS *Summons*, the Battle Familiar pass): no companion, the summon road;
 * the companion in its pocket, the cast refused before any slot is spent; the companion on the table, one
 * question — summon a new one (the companion dismissed forever as the new one lands) or empower it. A house
 * bend: the text empowers with no choice. `says` the book's sentence.
 */
export const SUMMON_EMPOWERS = Object.freeze({
  "Battle Familiar": Object.freeze({ companion: "Find Familiar", transform: "Battle Familiar",
    says: "If you have a familiar from the Find Familiar spell when you cast this spell, you empower your existing familiar rather than conjuring a new one. For the duration, your familiar can attack in addition to taking other actions as normal, and your familiar's game statistics are replaced by the Battle Familiar stat block, but it retains its creature type, alignment, Hit Points, Hit Point Dice, and any features granted by the Find Familiar spell. Your familiar gains a number of Temporary Hit Points equal to the Hit Points of the battle familiar. Battle Familiar ends early if the familiar has no more Temporary Hit Points left, and these Temporary Hit Points vanish if any remain when Battle Familiar ends. Your familiar reverts to its previous form when Battle Familiar ends.",
    rule: Object.freeze({ item: "Battle Familiar", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunBattleFamilq9" }) })
});

/**
 * TRANSFORMS (transforms.js, issue #2): a transform activity the module takes off the system's hands — the
 * form picked from the shared gallery in one popup, the elect transforming with dnd5e's own presets, the
 * form ended when the rules say. `self` the one using it is the one transformed (else the targeted creatures);
 * `known` the Known Forms slots on the item (a number), or the row whose item holds them (Circle Forms
 * spends Wild Shape's); `ends` what ends the form beyond its clock — `incapacitated` (the condition lands),
 * `zero` (Hit Points reach 0), `noTemp` (the Temporary Hit Points the form gave are gone); `clock` where
 * the form's clock comes from — `activity` (the activity's duration), `concentration` (the caster's
 * Concentration on the item), null for none. The presets are the system's and never re-implemented
 * (RULINGS *Wild Shape and the polymorph spells*). A row a SUMMON_EMPOWERS spell drives (`subject: "companion"`)
 * transforms the caster's standing companion of `companion` instead of the caster or a target: its own
 * `keep` and `effects` (dnd5e's setting categories) and the form's Hit Points at the cast level as Temporary
 * Hit Points; the summon activity's own bonuses land on top (RULINGS *Summons*, the Battle Familiar pass).
 */
export const TRANSFORMS = Object.freeze({
  "Wild Shape": Object.freeze({ self: true, known: 4, ends: Object.freeze(["incapacitated", "zero"]), clock: "activity",
    rule: Object.freeze({ item: "Wild Shape", uuid: "Compendium.dnd-players-handbook.classes.Item.phbdrdWildShape0" }),
    from: "Druid 2" }),
  "Circle Forms": Object.freeze({ self: true, known: "Wild Shape", ends: Object.freeze(["incapacitated", "zero"]), clock: "activity",
    rule: Object.freeze({ item: "Circle Forms", uuid: "Compendium.dnd-players-handbook.classes.Item.phbdrdCircleForm" }),
    from: "Druid — Circle of the Moon 3" }),
  "Polymorph": Object.freeze({ self: false, ends: Object.freeze(["noTemp"]), clock: "concentration",
    caveat: "the Wisdom save is the spell's own demand; the caster transforms whoever is targeted at the Transform activity's use",
    rule: Object.freeze({ item: "Polymorph", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplPolymorph0" }),
    from: "PHB level 4 (Concentration, 1 hour)" }),
  "Animal Shapes": Object.freeze({ self: false, ends: Object.freeze(["noTemp"]), clock: "concentration",
    caveat: "one form for every target at a use; a different form per target is a second use on fewer targets",
    rule: Object.freeze({ item: "Animal Shapes", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplAnimalShap" }),
    from: "PHB level 8 (Concentration, 24 hours)" }),
  "True Polymorph": Object.freeze({ self: false, ends: Object.freeze(["noTemp"]), clock: "concentration",
    caveat: "a creature into an object, and the permanence after the full duration, are the table's",
    rule: Object.freeze({ item: "True Polymorph", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplTruePolymo" }),
    from: "PHB level 9 (Concentration, 1 hour)" }),
  "Shapechange": Object.freeze({ self: true, ends: Object.freeze(["noTemp"]), clock: "concentration",
    caveat: "\"a sort of creature you have seen\" and the ban on Constructs and Undead are the table's",
    rule: Object.freeze({ item: "Shapechange", uuid: "Compendium.dnd-players-handbook.spells.Item.phbsplShapechang" }),
    from: "PHB level 9 (Concentration, 1 hour)" }),
  "Boon of Fluid Forms": Object.freeze({ self: true, ends: Object.freeze(["noTemp"]), clock: "activity",
    rule: Object.freeze({ item: "Boon of Fluid Forms", uuid: "Compendium.dnd-heroes-faerun.options.Item.hofBoonofFluidFo", benefit: "Shapechanger" }),
    from: "Epic Boon (Heroes of Faerûn)" }),
  // ARCANA UNLEASHED — the familiar empowered: the stat block replaces its own, it keeps its type, alignment, Hit Points
  // and Hit Dice (dnd5e's `keep`), the form's Hit Points become its Temporary Hit Points, and the spell ends early when
  // those are gone (`noTemp`); the clock is the spell's hour.
  "Battle Familiar": Object.freeze({ self: false, subject: "companion", companion: "Find Familiar", ends: Object.freeze(["noTemp"]), clock: "activity",
    keep: Object.freeze(["hp", "type", "bio", "vision"]), effects: Object.freeze(["otherOrigin", "origin", "spell"]),
    caveat: "the features Find Familiar grants are the table's: the pack grants the familiar none as items",
    rule: Object.freeze({ item: "Battle Familiar", uuid: "Compendium.dnd-arcana-unleashed.spells.Item.aunBattleFamilq9" }),
    from: "Arcana Unleashed level 2 (1 hour)" }),
  "Shape-Shifter": Object.freeze({ self: true, ends: Object.freeze(["noTemp"]), clock: "concentration",
    caveat: "the modified Polymorph's own benefits are the pack's settings on the activity",
    rule: Object.freeze({ item: "Shape-Shifter", uuid: "Compendium.dnd-arcana-unleashed.subclasses.Item.aunShapeshifter0" }),
    from: "Wizard — Transmuter 6 (Arcana Unleashed)" }),
  "Necklace of the Beastly Familiar (Fire Opal)": Object.freeze({ self: true, ends: Object.freeze(["noTemp"]), clock: "activity",
    rule: Object.freeze({ item: "Necklace of the Beastly Familiar (Fire Opal)", uuid: "Compendium.dnd-arcana-unleashed.items.Item.FoJxaTGKckzk5Hof", benefit: "Beast Transformation" }),
    from: "Arcana Unleashed magic item" }),
  "Necklace of the Beastly Familiar (Azurite)": Object.freeze({ self: true, ends: Object.freeze(["noTemp"]), clock: "activity",
    rule: Object.freeze({ item: "Necklace of the Beastly Familiar (Azurite)", uuid: "Compendium.dnd-arcana-unleashed.items.Item.aunNecklaceoftdK", benefit: "Beast Transformation" }),
    from: "Arcana Unleashed magic item" }),
  "Necklace of the Beastly Familiar (Zircon)": Object.freeze({ self: true, ends: Object.freeze(["noTemp"]), clock: "activity",
    rule: Object.freeze({ item: "Necklace of the Beastly Familiar (Zircon)", uuid: "Compendium.dnd-arcana-unleashed.items.Item.b4VSkPIvvpUTAqmU", benefit: "Beast Transformation" }),
    from: "Arcana Unleashed magic item" }),
  "Necklace of the Beastly Familiar (Topaz)": Object.freeze({ self: true, ends: Object.freeze(["noTemp"]), clock: "activity",
    rule: Object.freeze({ item: "Necklace of the Beastly Familiar (Topaz)", uuid: "Compendium.dnd-arcana-unleashed.items.Item.habvW1Bz6tFFTM0e", benefit: "Beast Transformation" }),
    from: "Arcana Unleashed magic item" }),
  "Necklace of the Beastly Familiar (Chrysoprase)": Object.freeze({ self: true, ends: Object.freeze(["noTemp"]), clock: "activity",
    rule: Object.freeze({ item: "Necklace of the Beastly Familiar (Chrysoprase)", uuid: "Compendium.dnd-arcana-unleashed.items.Item.uxpeCtn6FLwAL9Gf", benefit: "Beast Transformation" }),
    from: "Arcana Unleashed magic item" }),
  "Harkon's Bite": Object.freeze({ self: true, ends: Object.freeze([]), clock: null,
    caveat: "the curse's trigger and the werewolf's turn are the table's; the module only lands the fixed form",
    rule: Object.freeze({ item: "Harkon's Bite", uuid: "Compendium.dnd-ravenloft-horrors-within.items.Item.rhwHarkonsBite2Q" }),
    from: "Ravenloft cursed item" })
});

const copies = rows => rows.map(r => ({ ...r }));
const everyRow = names => [...new Set(names)].map(n => ({ kind: String(n).toLowerCase() }));

/** The listed kinds of a membership reader, as a set. */
export const listedNames = entries => new Set(entries.map(e => String(e.kind ?? "").toLowerCase()));

export const interruptEntries = () => copies(INTERRUPTS);
export const blockEntries = () => copies(BLOCKS);
export const maneuverFoldEntries = () => copies(MANEUVER_FOLDS);
export const d20FoldEntries = () => copies(D20_FOLDS);
export const riderEntries = () => copies(RIDERS);
export const riderUpgradeEntries = () => copies(RIDER_UPGRADES);
export const reminderEntries = () => everyRow(REMINDER_KINDS);
export const conditionEntries = () => everyRow(CONDITION_KEYS);
export const effectEntries = () => everyRow(EFFECT_KEYS);
export const clockRiderEntries = () => everyRow(Object.values(CLOCK_RIDERS).map(r => r.feature));
export const hitMenuEntries = () => everyRow([...new Set(Object.values(HIT_OPTIONS).map(r => r.feature))]);   // several options share a feature (A2)
export const emanationEntries = () => everyRow(Object.keys(EMANATIONS));
export const damageShieldEntries = () => everyRow(Object.keys(DAMAGE_SHIELDS));
export const initiativeSwapEntries = () => everyRow(Object.keys(INITIATIVE_SWAPS));
export const initiativeGrantEntries = () => everyRow(Object.keys(INITIATIVE_GRANTS));
export const mishapEntries = () => everyRow(Object.keys(MISHAPS));
export const castRiderEntries = () => everyRow(Object.keys(CAST_RIDERS));
export const storedDiceEntries = () => everyRow(Object.keys(STORED_DICE));
export const kitTendEntries = () => everyRow(Object.keys(KIT_TENDS));
export const damageRuleEntries = () => everyRow(Object.keys(DAMAGE_RULES));
export const unarmedDiceEntries = () => everyRow(Object.keys(UNARMED_DICE));
export const healRerollEntries = () => everyRow(Object.keys(HEAL_REROLLS));
export const wardPoolEntries = () => everyRow(Object.keys(WARD_POOLS));
export const repeatSaveEntries = () => everyRow(Object.keys(REPEAT_SAVES));
export const turnGrantEntries = () => everyRow(Object.keys(TURN_GRANTS));
export const wardEntries = () => everyRow(Object.keys(WARDS));
export const duplicateEntries = () => everyRow(Object.keys(DUPLICATES));
export const damageShareEntries = () => everyRow(Object.keys(DAMAGE_SHARES));
export const healOnHitEntries = () => everyRow(Object.keys(HEAL_ON_HIT));
export const drainEntries = () => everyRow(Object.keys(DRAINS));
export const rayTableEntries = () => everyRow(Object.keys(RAY_TABLES));
export const damageEitherEntries = () => everyRow(Object.keys(DAMAGE_EITHER));
export const cardChipEntries = () => everyRow(Object.keys(CARD_CHIPS));
export const rebukeEntries = () => everyRow(Object.keys(REBUKES));
export const dropToOneEntries = () => everyRow(Object.keys(DROP_TO_ONE));
export const restGrantEntries = () => everyRow(Object.keys(REST_GRANTS));
export const tokenSizeEntries = () => everyRow(Object.keys(TOKEN_SIZES));
export const tokenSenseEntries = () => everyRow(Object.keys(TOKEN_SENSES));
export const tokenLightEntries = () => everyRow(Object.keys(TOKEN_LIGHTS));
export const gearLightEntries = () => everyRow(Object.keys(GEAR_LIGHTS));
export const summonChoiceEntries = () => everyRow(Object.keys(SUMMON_CHOICES));
export const summonSingleEntries = () => everyRow(Object.keys(SUMMON_SINGLES));
export const summonOwnInitiativeEntries = () => everyRow(Object.keys(SUMMON_OWN_INITIATIVE));
export const summonFallEntries = () => everyRow(Object.keys(SUMMON_FALLS));
export const summonEmpowerEntries = () => everyRow(Object.keys(SUMMON_EMPOWERS));
export const transformEntries = () => everyRow(Object.keys(TRANSFORMS));
export const damageSaveEntries = () => everyRow(Object.keys(DAMAGE_SAVES));
export const superiorityUseEntries = () => everyRow(Object.keys(SUPERIORITY_USES));
export const effectChoiceEntries = () => everyRow(Object.keys(EFFECT_CHOICES));
export const metamagicEntries = () => everyRow(Object.keys(METAMAGIC));
export const concentrationExemptEntries = () => everyRow(Object.keys(CONCENTRATION_EXEMPTS));
export const d20FloorEntries = () => everyRow(Object.keys(D20_FLOORS));

/**
 * Is this area's item one swept at the last verdict whatever its data says?
 * @param {Parameters<typeof matchOf>[1]|string|null|undefined} item  the item, or a name off a flag
 */
export function spentAreaListed(item) {
  const index = tableIndex(SPENT_AREAS);
  return !!((typeof item === "string") ? index.keyNamed(item) : index.keyFor(item));
}

/**
 * Is this spell one whose caster chooses who its area affects?
 * @param {Parameters<typeof matchOf>[1]|string|null|undefined} item  the item, or a name off a flag
 */
export function chosenAreaListed(item) {
  const index = tableIndex(CHOSEN_AREAS);
  return !!((typeof item === "string") ? index.keyNamed(item) : index.keyFor(item));
}
