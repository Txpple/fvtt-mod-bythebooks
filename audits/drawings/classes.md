# The PHB classes — the drawing (measured 2026-09-28)

> **What this is:** the verdict on every PHB class and subclass feature, class by class with its subclasses
> under it (the user's order, 2026-09-28), read against the evidence in [../classes/](../classes/) and the
> tables in `scripts/decide/registry.js`. The class is **every PHB class and subclass feature**
> ([[examples-are-classes]]): 352 rows in `dnd-players-handbook.classes` (12 classes, 48 subclasses) plus
> the 67 options nothing grants ([../options.md](../options.md)). The precedent row is named for every
> verdict, per [[land-by-mechanism-not-family]]; a UI-shaped item is ruled off a prototype before a line.
>
> **Verdicts:** NATIVE — the pack or the platform does it, nothing owed · ROW — a row in a table that
> exists · ROW+VOCAB — a row plus a facet the table does not have yet · KIND — a mechanism the module
> lacks · OUT — no combat moment the module judges (DESIGN §4), or a ruling. The slice order is not
> decided here — the user sets it once the DM and Monster Manual drawings land.

## What the twelve classes share — the vocabulary the drawing creates

The same dozen shapes recur across every class; the count is how many customers each has in the PHB
classes alone. **A shape with three or more customers is built once, as a table; a one-customer shape
waits for its player.**

| Shape | Customers | Precedent |
| --- | --- | --- |
| **The reroll kind** (SWEEP §3 item 5: reroll a failed save or a missed attack, with or without a bonus) | Indomitable, Fanatical Focus, Disciplined Survivor, Living Legend, Countercharm (an ally's save), Dark One's Own Luck (add a d10 after), Homing Strikes (add a die after a miss), Peerless Skill | `D20_FOLDS` (`precision`, `bardic`, `heroic`, `succeed`): a `reroll` kind beside them |
| **The hit menu's next groups** (RULINGS *The hit menu*) | Brutal Strike (+ the forgo-Advantage gate box), Stunning Strike, Open Hand Technique, Psionic Strike + Telekinetic Thrust, Hand of Harm (+ Physician's Touch), Elemental Attunement's push/pull, Hurl Through Hell, Eldritch Smite (a NEW cost kind: a spell slot) | `HIT_OPTIONS` / `HIT_GROUPS`; cost kinds today: sneak dice, a Focus Point, a Superiority Die, a use |
| **The `roll` interrupt's next customers** (Slice A's kind) | Cutting Words (and its damage half on `INTERRUPT_REDUCTIONS`), Guided Strike (+10), Cosmic Omen (±d6), Bend Luck (±d4), Combat Inspiration (its attack half), Restore Balance (NEUTRALISE Advantage/Disadvantage — a facet) | `INTERRUPT_ROLLS` |
| **Regain on Initiative** | Persistent Rage, Superior Inspiration, Uncanny Metabolism, Perfect Focus, Tandem Footwork (a GIVE to allies) | none — one table `INITIATIVE_GRANTS`, a hook at the roll the module already reads (`INITIATIVE_SWAPS`, Assassinate) |
| **A grant at the bearer's turn start** (temp HP, a heal) | Vitality of the Tree, Survivor's heal, Elder Champion's heal, Heroic Warrior's inspiration, Circle Forms' temp HP (on the shape-shift); Heroism (SWEEP §7) | `CLOCK_RIDERS` reads `turnStart` for damage; a `grant` facet (heal / tempHP / a chip) is the vocabulary |
| **A flat bonus to one spell damage roll** | Empowered Evocation, Elemental Affinity, Radiant Soul, Potent Spellcasting ×2 (measure: the pack says the bonus "is not" automatic) | none — one table `SPELL_DAMAGE_BONUS` on the damage-roll seam the riders use |
| **Emanation rows** | Aura of Devotion, Holy Nimbus (pulse + saves), Elder Champion (saves), Corona of Light (saves), Rage of the Wilds' Wolf, Branches of the Tree (alert + save), Wrath of the Sea (a chosen pulse), Avenging Angel (enter), Oceanic Gift (a bearer facet) | `EMANATIONS` feature rows; `pulse`, `alert`, `trigger` exist |
| **The kill moment, both sides** | victim: Relentless Rage (a rising-DC save facet), Undying Sentinel, Gift of the Protectors · killer: Dark One's Blessing | `DROP_TO_ONE` (Relentless Endurance, Death Ward); Slice B owns the rest |
| **Save bends by name** (Slice A's `saves` facet) | Danger Sense, Beguiling Twist, Psychic Defenses, Eldritch Mind, Eldritch Hex, Magical Ambush, Eldritch Strike, Mantle of Majesty (a `fails` facet, Trance's mirror), Spell Resistance (a `vsSpells` facet), Corona / Elder Champion / Holy Nimbus (through the emanation) | `EFFECT_BENDS` `saves` |
| **A damage-absorbing pool, automatic** | Arcane Ward (+ Projected Ward as its reaction), Bastion of Law | none — the `preApplyDamage` seam `DROP_TO_ONE` sits on; R1: no choice, no popup |
| **Advantage cancelled against the bearer** | Elusive, Trance of Order | `EFFECT_BENDS`: a `noAdvantage` facet the gate reads |
| **A floor under the d20** ("treat 9 or lower as 10") | Trance of Order, Starry Form's Dragon (Concentration saves) | the dice changers' floor (Elemental Adept) is on damage dice; a `floor` D20 fold is the vocabulary |
| **Concentration exemptions** | Relentless Hunter (no check from damage on Hunter's Mark) | the concentration machine: a `noCheck` row |

---

## Barbarian

| Feature | The pack carries | Verdict → where |
| --- | --- | --- |
| **Rage** | effect (resistance, the damage bonus), uses | NATIVE for the numbers. The **early end** ("if you have neither attacked nor taken damage since your last turn") is nothing: ROW+VOCAB → a `turnEnd` judge on the effect table reading the turn chits (`TURN_CHITS` has attacked; damaged is the receipt's) — a reminder, never an automatic end (the Rage can be kept by a Bonus Action) |
| **Danger Sense** | effect | NATIVE (measured 2026-09-29 (M0): the effect writes `dex.save.roll.mode`) |
| **Brutal Strike** + **Improved** + **(2)** | effect, dmg | ROW+VOCAB → `HIT_OPTIONS` Brutal Strike group (Forceful Blow, Hamstring Blow; Staggering Blow = `saves` Disadvantage press, Sundering Blow = +5 to the next ally's attack, a `USE_CHIPS`-shaped give). The FORGO-ADVANTAGE trade is decided before the roll: a gate box (RULINGS *The hit menu*). Level 17's two picks is the array shape (the Goliath Battle Master trigger, SWEEP §6) |
| **Relentless Rage** | save, uses | ROW+VOCAB → `DROP_TO_ONE` with a `save` facet (DC 10 Con, +5 per use, resets on rest) — the drop machine asks Relentless Endurance today; this row rolls first |
| **Persistent Rage** | uses | ROW → `INITIATIVE_GRANTS` (the table above) |
| **Frenzy** (Berserker) | dmg | ROW → `CLOCK_RIDERS` (first hit of the turn, `while: Reckless`) |
| **Rage of the Wilds** (Wild Heart) | 2 effects | ROW → `EFFECT_CHOICES` (Bear / Eagle / Wolf at the Rage); the Wolf's allies' Advantage is an `EMANATIONS` feature row `while: raging` |
| **Power of the Wilds** (Wild Heart) | effect [prone] | ROW+VOCAB → Lion: an `EMANATIONS` row with a bend on OTHERS (Disadvantage on attacks not at the bearer); Ram: a no-save prone press on a hit (`CLOCK_RIDERS` `press`); Falcon: NATIVE (fly) |
| **Vitality of the Tree** (World Tree) | nothing | ROW+VOCAB → the turn-start `grant` facet (temp HP at the Rage and each turn) |
| **Branches of the Tree** (World Tree) | effect, save | ROW → `EMANATIONS` `alert` at a hostile's turn start within 30 ft, the reaction's save the activity's, `trigger` `oncePerTurn` |
| **Fanatical Focus** (Zealot) | text | ROW after the reroll kind |
| **Rage of the Gods** (Zealot) | effect | ROW+VOCAB → the reaction that takes an ally's damage within 30 ft: Interception's shape (`INTERRUPT_REDUCTIONS`) with `reach` and `all` |

**NATIVE:** Unarmored Defense, Weapon Mastery (the mastery machine), Reckless Attack (a row), Fast Movement, Feral Instinct (Initiative Advantage), Mindless Rage, Retaliation (`REBUKES`), Intimidating Presence (save, Frightened), Aspect of the Wilds, Battering Roots (reach), Divine Fury (`CLOCK_RIDERS`), Warrior of the Gods (a heal pool), Zealous Presence (a row).
**OUT:** Primal Knowledge, Instinctive Pounce, Indomitable Might (checks), Primal Champion, Animal Speaker, Nature Speaker, Travel Along the Tree.

## Bard

| Feature | The pack carries | Verdict → where |
| --- | --- | --- |
| **Countercharm** | text | ROW after the reroll kind — an ALLY's failed save within 30 ft, a Reaction, the reroll with Advantage (a `reach` facet) |
| **Superior Inspiration** | text | ROW → `INITIATIVE_GRANTS` |
| **Cutting Words** (Lore) | text | ROW → `INTERRUPT_ROLLS` (subtract the Bardic die from an attack roll or a check within 60 ft) and `INTERRUPT_REDUCTIONS` (its damage half); the die from the Bardic pool — the `pool` facet Parry uses |
| **Peerless Skill** (Lore) | text | ROW after the reroll kind — the `bardic` fold on the bearer's OWN failed check or attack (today it folds into an ally's roll) |
| **Combat Inspiration** (Valor) | text | ROW → the attack half is the `bardic` D20 fold; the damage half a `bardic` damage fold; the AC half an `INTERRUPT_ROLLS`-shaped `ac` interrupt paid from the holder's die |
| **Battle Magic** (Valor) | text | ROW → a reminder after an action-cast (`REMINDER_KINDS`: a `chip` the turn end drops) |
| **Inspiring Movement** (Dance) | text | ROW → `EMANATIONS` `alert` when an ENEMY ends its turn within 5 ft — a reminder to move, the movement the player's |
| **Tandem Footwork** (Dance) | text | ROW → `INITIATIVE_GRANTS` as a GIVE (the die to allies' Initiative) |
| **Leading Evasion** (Dance) | text | ROW+VOCAB → `EVASION` with a `reach: 5` facet (allies within 5 ft share the verdict) |
| **Mantle of Majesty** (Glamour) | effect, uses | ROW → `EFFECT_BENDS` with a `fails` facet on Command's save while the target is Charmed by the bard — Trance's `succeeds` mirrored |
| **Unbreakable Majesty** (Glamour) | effect, save, uses | ROW after Sanctuary's gate (SWEEP §7): the attacker's Cha save before the attack, a fail wasting it |

**NATIVE:** Bardic Inspiration (the `bardic` fold), Jack of All Trades, Font of Inspiration, Dazzling Footwork (AC, the die as the unarmed damage), Beguiling Magic, Mantle of Inspiration (a use).
**OUT:** Expertise, Magical Secrets, Words of Creation, Bonus Proficiencies, Magical Discoveries, Martial Training, Agile Strikes.

## Cleric

| Feature | The pack carries | Verdict → where |
| --- | --- | --- |
| **Blessed Strikes: Potent Spellcasting** / **Improved** | dmg | measure → `SPELL_DAMAGE_BONUS` if the pack does not add it; the level-14 temp HP to an ally on a cantrip a cast rider `grant` |
| **Disciple of Life** (Life) | nothing | ROW+VOCAB → `HEAL_REROLLS`'s machine with a `bonus` facet (2 + the slot level on a healing spell); one table, the healing seam |
| **Blessed Healer** (Life) | nothing | ROW → the same machine, a `self` facet (the caster heals 2 + the slot level when healing another) |
| **Supreme Healing** (Life) | text | ROW → the `max` facet (Beacon of Hope shares it, SWEEP §7) |
| **Improved Warding Flare** (Light) | nothing | ROW → a `heal` facet on the `INTERRUPT_ROLLS` row (the target of the flare's attack heals) |
| **Corona of Light** (Light) | effect, uses | ROW → `EMANATIONS` 30 ft harmful, `saves` Disadvantage against fire and radiant spells; the light a `TOKEN_LIGHTS` row |
| **Improved Duplicity** (Trickery) | nothing | ROW → the Invoke Duplicity bend gains `allies: true` (Shared Distraction); the heal at the illusion's end OUT |
| **Guided Strike** (War) | text | ROW → `INTERRUPT_ROLLS` +10, self or an ally within 30 ft, paid by Channel Divinity (`pool`) |
| **War Priest** (War) | uses | ROW → a reminder (`REMINDER_KINDS` `chip`) after the Attack action: the Bonus Action attack |

**NATIVE:** Channel Divinity / Turn Undead (save, Frightened + Incapacitated), Sear Undead, Blessed Strikes: Divine Strike (`CLOCK_RIDERS`), Preserve Life, Radiance of the Dawn, Warding Flare (a row), Blessing of the Trickster, Invoke Duplicity (a row), Avatar of Battle, War God's Blessing (a spell).
**OUT:** Divine Order, Divine Intervention, Greater Divine Intervention, the domain spell lists, Trickster's Transposition.

## Druid

| Feature | The pack carries | Verdict → where |
| --- | --- | --- |
| **Elemental Fury: Potent Spellcasting** | text | ROW → the damage-rules row (measured 2026-09-29 (M0): not automatic) |
| **Nature's Sanctuary** (Land) | 4 effects [coverHalf] | measure → the cover machine reads walls and tokens (RULINGS *Measured cover*); a `coverHalf` STATUS is a third source — a facet, if the status is not read already |
| **Circle Forms** (Moon) | text | ROW → the turn-start `grant` machine, `on: shapeShift` (temp HP = three × the level) |
| **Lunar Form** (Moon) | dmg | ROW → `CLOCK_RIDERS` once per turn 2d10 radiant, `while: wildShape`, `targetDamaged` |
| **Wrath of the Sea** (Sea) | effect, save, dmg | ROW+VOCAB → `EMANATIONS` feature row with a CHOSEN pulse: once per turn the bearer picks one creature in the ring, the activity's save and push. Oceanic Gift moves the ring to an ally: a `bearer` facet |
| **Starry Form** (Stars) | 3 effects, atk, dmg | ROW → Archer NATIVE (the activity); Chalice: the healing machine's `also` facet (heal a second creature when a healing spell lands); Dragon: the `floor` D20 fold on Concentration saves |
| **Cosmic Omen** (Stars) | uses, text | ROW → `INTERRUPT_ROLLS` ±d6 within 30 ft, Weal / Woe read off the rest's roll (a stored flag) |

**NATIVE:** Wild Shape (the platform's transformation), Elemental Fury: Primal Strike (`CLOCK_RIDERS`), Improved Elemental Fury, Land's Aid, Nature's Ward, Improved Circle Forms (radiant), Moonlight Step (a row), Aquatic Affinity, Stormborn, Twinkling Constellations, Full of Stars.
**OUT:** Druidic, Primal Order, Wild Companion, Wild Resurgence, Beast Spells, Archdruid, the circle spell lists, Natural Recovery, Star Map, Stride / speeds.

## Fighter

| Feature | The pack carries | Verdict → where |
| --- | --- | --- |
| **Indomitable** | uses, text | ROW after the reroll kind — the PHB customer (a failed save, + the Fighter level) |
| **Tactical Master** | effect | ROW+VOCAB → the mastery machine's `swap` facet: Push / Sap / Slow offered in place of the weapon's own property at the hit |
| **Studied Attacks** | text | ROW+VOCAB → `USE_CHIPS` armed by a MISS (SWEEP §3 item 8's new trigger): Advantage on the next attack against that creature |
| **Relentless** (Battle Master) | text | ROW → `SUPERIORITY_USES`: with none left, once per turn a d8 stands in |
| **Heroic Warrior** (Champion) | text | ROW → the turn-start `grant` (Heroic Inspiration if none) — a reminder + a sheet write the player confirms |
| **Survivor** (Champion) | effect | ROW → Defy Death: `EFFECT_BENDS` `saves` Advantage on death saves (measure: `flags.dnd5e` may carry it); Heroic Rally: the turn-start `grant` heal while Bloodied |
| **War Magic** / **Improved** (Eldritch Knight) | text | ROW → a reminder at the Attack action (replace one attack with a cantrip / a spell) |
| **Eldritch Strike** (Eldritch Knight) | effect | ROW → `EFFECT_BENDS` `saves` Disadvantage against the bearer's spells, the effect landed by the hit (the effect-riders seam) |
| **Psionic Power** (Psi Warrior) | dmg, uses | ROW → Protective Field: `INTERRUPT_REDUCTIONS` (die + Int, `reach: 30`, from the Psionic pool); Psionic Strike: `HIT_OPTIONS` (once per turn, a die); Telekinetic Movement OUT |
| **Telekinetic Adept** (Psi Warrior) | 2 effects [prone], save | ROW → Telekinetic Thrust: a follow-up on the Psionic Strike row (save or Prone / pushed); Psi-Powered Leap OUT |
| **Guarded Mind** (Psi Warrior) | text | ROW+VOCAB → a turn-start OFFER to end Charmed / Frightened by spending a die (the `grant` machine's `end` facet); the resistance NATIVE |
| **Bulwark of Force** (Psi Warrior) | effect [coverHalf] | measure with Nature's Sanctuary — the same `coverHalf` status |

**NATIVE:** Fighting Style (`DAMAGE_RULES`), Second Wind, Action Surge, Tactical Mind (a fold), Two / Three Extra Attacks, Combat Superiority (the maneuvers), Improved / Ultimate Combat Superiority, Improved / Superior Critical (the crit range on the effect; the module's crit reads the roll), Remarkable Athlete (Initiative), Additional Fighting Style, War Bond, Telekinetic Master (a spell).
**OUT:** Tactical Shift, Student of War, Know Your Enemy, Arcane Charge.

## Monk

| Feature | The pack carries | Verdict → where |
| --- | --- | --- |
| **Uncanny Metabolism** | uses | ROW → `INITIATIVE_GRANTS` (+ the Martial Arts die healed) |
| **Stunning Strike** | 2 effects [stunned], save | ROW → `HIT_OPTIONS` Monk group: once per turn, 1 Focus Point, the activity's Con save; on a success the pack's half effect (Advantage for the next attack) — the effect-riders seam |
| **Self-Restoration** | text | ROW+VOCAB → a turn-END offer to end Charmed / Frightened / Poisoned (the `grant` machine's `end` facet at `turnEnd`) |
| **Deflect Energy** | save, dmg | ROW → the Deflect Attacks `INTERRUPTS` row loses its type judge at level 13 (a `level` facet) |
| **Disciplined Survivor** | effect | ROW after the reroll kind (a failed save, 1 Focus Point) |
| **Perfect Focus** | text | ROW → `INITIATIVE_GRANTS` |
| **Hand of Harm** (Mercy) + **Physician's Touch** | dmg; effect [poisoned] | ROW → `HIT_OPTIONS` Mercy group (once per turn, 1 Focus Point, the die + Wis necrotic; Poisoned from level 6) |
| **Shadow Step** (Shadow) | text | ROW → `USE_CHIPS` (Advantage on the next melee attack after the teleport) — the pack ships no effect, the module's own chip |
| **Elemental Attunement** (Elements) | 3 effects, atk, dmg, save | ROW → the reach and the type NATIVE; the push / pull on a hit a `HIT_OPTIONS` row (the activity's save) |
| **Elemental Epitome** (Elements) | 6 effects, dmg | ROW → Empowered Strikes: `CLOCK_RIDERS` once per turn, the Martial Arts die; the resistance NATIVE; Destructive Stride OUT (movement) |
| **Open Hand Technique** (Open Hand) | 2 effects [prone], save | ROW → `HIT_OPTIONS` Open Hand group on a Flurry hit: Addle (no Reactions — an effect), Push, Topple (the save) |

**NATIVE:** Martial Arts (`UNARMED_DICE`), Monk's Focus (Flurry, Patient Defense, Step of the Wind), Unarmored Movement, Deflect Attacks (a row — measure the redirect strike's follow-up), Empowered Strikes, Evasion, Heightened Focus, Superior Defense, Hand of Healing, Shadow Arts, Cloak of Shadows, Elemental Burst, Wholeness of Body, Quivering Palm.
**OUT:** Slow Fall, Acrobatic Movement, Body and Mind, Implements of Mercy, Flurry of Healing and Harm (a substitution the player makes), Hand of Ultimate Mercy, Improved Shadow Step, Manipulate Elements, Stride of the Elements, Fleet Step.

## Paladin

| Feature | The pack carries | Verdict → where |
| --- | --- | --- |
| **Radiant Strikes** | effect | NATIVE (measured 2026-09-29 (M0): `bonuses.mwak.damage` `1d8[radiant]`) |
| **Sacred Weapon** (Devotion) | effect | measure → the +Cha NATIVE; the light a `TOKEN_LIGHTS` row |
| **Aura of Devotion** (Devotion) | effect | ROW → `EMANATIONS` (Charmed immunity — Aura of Courage's row with the status swapped) |
| **Smite of Protection** (Devotion) | effect [coverHalf] | ROW+VOCAB → a cast rider: after Divine Smite, half cover to allies in the aura until the next turn (the aura's `effect` facet, `on: cast`) |
| **Holy Nimbus** (Devotion) | effect, dmg, uses | ROW → `EMANATIONS` `pulse` at enemies' turn starts (Inner Radiance's shape) + `saves` Advantage against Fiends and Undead |
| **Inspiring Smite** (Glory) | nothing | ROW+VOCAB → a cast rider after Divine Smite: temp HP DISTRIBUTED among creatures within 30 ft — **UI-shaped, a prototype** (the smite itself stays out; this is the moment after it) |
| **Living Legend** (Glory) | effect, uses | ROW after the reroll kind (a missed attack once per turn; a failed save as a Reaction) |
| **Relentless Avenger** (Vengeance) | effect | ROW → `CLOCK_RIDERS` `on: opportunityAttack` — the pack's speed-0 effect landed by the hit; the move the player's |
| **Soul of Vengeance** (Vengeance) | text | ROW → `REBUKES` `after: attack` (Sentinel's shape) against the creature under the Vow |
| **Avenging Angel** (Vengeance) | 2 effects [frightened], save, uses | ROW → `EMANATIONS` `trigger on: enter` (the Frightened save), the flight NATIVE |
| **Undying Sentinel** (Ancients) | uses | ROW → `DROP_TO_ONE` (heal 3 × level, once per Long Rest) |
| **Elder Champion** (Ancients) | effect, uses | ROW → the turn-start `grant` heal + `EMANATIONS` `saves` Disadvantage against the paladin's spells and Channel Divinity |

**NATIVE:** Lay on Hands, Aura of Protection, Aura of Courage, Aura of Warding (rows), Abjure Foes, Aura Expansion, Peerless Athlete, Glorious Defense (a row), Vow of Enmity (a row), Nature's Wrath.
**OUT:** Paladin's Smite and Divine Smite (the smites, 2026-09-03), Faithful Steed, Restoring Touch, the oath spell lists, Aura of Alacrity (speed).

## Ranger

| Feature | The pack carries | Verdict → where |
| --- | --- | --- |
| **Relentless Hunter** | text | ROW+VOCAB → the concentration machine's `noCheck` row (damage never asks for Hunter's Mark) |
| **Bestial Fury** (Beast Master) | dmg | measure → `CLOCK_RIDERS` on the COMPANION as bearer (the mark's extra damage); the second Beast's Strike OUT |
| **Beguiling Twist** (Fey Wanderer) | save | ROW → `EFFECT_BENDS` `saves` Advantage against Charmed / Frightened; the Reaction that turns a SUCCEEDED save within 120 ft onto another creature is ROW+VOCAB (a hold raised at a save verdict — the demand machine's seam) |
| **Stalker's Flurry** (Gloom Stalker) | save | ROW+VOCAB → a `then` facet on the Dreadful Strike row: Sudden Strike (a second attack against another creature) or Mass Fear (the activity's save within 15 ft) |
| **Hunter's Prey** (Hunter) | dmg | ROW → Colossus Slayer: `CLOCK_RIDERS` `targetDamaged` (SWEEP §3 item 4's example); Horde Breaker: a reminder chip (an extra attack against a different creature within 5 ft) |
| **Defensive Tactics** (Hunter) | effect | ROW → Escape the Horde: `EFFECT_BENDS` (Disadvantage on opportunity attacks against the bearer — the OA judge the ring uses); Multiattack Defense: ROW+VOCAB (an automatic `ac` interrupt +4 against the SAME attacker's later attacks this turn) |
| **Superior Hunter's Prey** (Hunter) | dmg | ROW+VOCAB → `CLOCK_RIDERS` with a SECOND target: the mark's damage to another creature within 30 ft (a target pick — the hit menu's pick machine) |
| **Superior Hunter's Defense** (Hunter) | 13 effects | ROW → `INTERRUPT_MULTIPLIERS` (Uncanny Dodge's shape, any damage type, resistance until the turn ends — the pack's effects are the 13 types) |

**NATIVE:** Favored Enemy (free casts), Roving, Tireless, Nature's Veil, Precise Hunter (a row), Feral Senses, Foe Slayer, Exceptional Training, Dreadful Strikes and Dread Ambusher (rows), Otherworldly Glamour, Umbral Sight, Iron Mind, Shadowy Dodge (a row).
**OUT:** Deft Explorer, Primal Companion (a summon), Share Spells, the subclass spell lists, Fey Reinforcements, Misty Wanderer, Hunter's Lore.

## Rogue

| Feature | The pack carries | Verdict → where |
| --- | --- | --- |
| **Elusive** | text | ROW+VOCAB → `EFFECT_BENDS` `noAdvantage` (the gate cancels Advantage against the bearer; Trance of Order shares it) |
| **Stroke of Luck** | uses, text | ROW → the `succeed` D20 fold (`SAVE_SUCCEEDS`'s machine) widened to any D20 Test |
| **Magical Ambush** (Arcane Trickster) | text | ROW → `EFFECT_BENDS` `saves` Disadvantage when the CASTER is Invisible (a source-status judge) |
| **Versatile Trickster** (Arcane Trickster) | text | ROW → `ADVANTAGE_BUYS` (Advantage from the Mage Hand's distraction, a Cunning Strike option's shape) |
| **Envenom Weapons** (Assassin) | save, dmg | ROW → the Poison `CUNNING_OPTIONS` row gains 2d6 and the save's success no longer ends it (a `level` facet) |
| **Soul Blades** (Soulknife) | text | ROW → Homing Strikes after the reroll kind (add a Psionic die to a missed attack — Precision's shape, a different pool); Psychic Teleportation OUT |

**NATIVE:** Sneak Attack, Cunning Action, Steady Aim, Cunning Strike, Improved Cunning Strike, Devious Strikes, Uncanny Dodge (rows), Reliable Talent, Slippery Mind, Assassinate, Death Strike (rows), Psychic Blades, Psychic Veil, Rend Mind, Supreme Sneak (rows), Spell Thief (a save).
**OUT:** Thieves' Cant, Mage Hand Legerdemain, Assassin's Tools, Infiltration Expertise, Fast Hands, Second-Story Work, Use Magic Device, Thief's Reflexes (two turns in round one — the tracker's, not a moment).

## Sorcerer

| Feature | The pack carries | Verdict → where |
| --- | --- | --- |
| **Psychic Defenses** (Aberrant) | text | ROW → `EFFECT_BENDS` `saves` Advantage against Charmed / Frightened |
| **Restore Balance** (Clockwork) | uses, text | ROW+VOCAB → `INTERRUPT_ROLLS` with a `neutralise` facet (Advantage and Disadvantage both cancelled on a roll within 60 ft) |
| **Bastion of Law** (Clockwork) | effect | ROW+VOCAB → the damage-absorbing pool (a ward of d8s the bearer spends at damage) — Arcane Ward's machine, a second customer |
| **Trance of Order** (Clockwork) | effect, uses | ROW after two vocabulary items: `noAdvantage` (Elusive) and the `floor` fold (Starry Form's Dragon) |
| **Elemental Affinity** (Draconic) | dmg | ROW → `SPELL_DAMAGE_BONUS` (+Cha to one damage roll of the type, once per spell) |
| **Tides of Chaos** (Wild Magic) | uses, text | ROW → `ADVANTAGE_BUYS` (Advantage on one D20 Test before the roll, the use regained by a surge) |
| **Wild Magic Surge** + **Tamed Surge** (Wild Magic) | text | ROW+VOCAB → a cast rider: a d20 after a slot cast, a 20 rolls the surge table (the platform's rolltable); Tamed Surge is the same rider with a pick — **UI-shaped, a prototype** |
| **Bend Luck** (Wild Magic) | text | ROW → `INTERRUPT_ROLLS` ±1d4 on another creature's roll within 60 ft |

**NATIVE:** Innate Sorcery (a row), Font of Magic, Metamagic (all ten), Revelation in Flesh, Warping Implosion, Draconic Resilience, Dragon Wings, Controlled Chaos (the table roll).
**OUT:** Sorcerous Restoration, Sorcery Incarnate, Arcane Apotheosis, the subclass spell lists, Telepathic Speech, Psionic Sorcery, Clockwork Cavalcade, Dragon Companion.

## Warlock

| Feature | The pack carries | Verdict → where |
| --- | --- | --- |
| **Misty Escape** (Archfey) | effect [invisible], save, dmg | ROW+VOCAB → a Reaction raised when the bearer TAKES damage (the `REBUKES` seam) that casts Misty Step, with the Steps of the Fey rider |
| **Beguiling Defenses** (Archfey) | save, uses | ROW+VOCAB → a Reaction raised when the bearer is DEMANDED a Charmed / Frightened save: the demand's seam; the reflected save the activity's |
| **Radiant Soul** (Celestial) | dmg | ROW → `SPELL_DAMAGE_BONUS` (+Cha to one radiant or fire roll per turn) |
| **Searing Vengeance** (Celestial) | effect [blinded], dmg, uses | ROW+VOCAB → a trigger at a DEATH SAVE (the bearer's or an ally's within 60 ft) — the drop machine's neighbour; the burst the activity's |
| **Dark One's Blessing** (Fiend) | nothing | ROW+VOCAB → the KILLER's side of the kill moment (temp HP when the bearer drops an enemy to 0) — Slice B's machine, a player customer |
| **Dark One's Own Luck** (Fiend) | uses, text | ROW after the reroll kind (add a d10 to a check or save after the roll) |
| **Hurl Through Hell** (Fiend) | save, dmg, uses | ROW → `HIT_OPTIONS` (once per turn on a hit; the activity's save; the removal is the effect's) |
| **Psychic Spells** (Great Old One) | text | ROW+VOCAB → the Transmuted type pick's machine (`TRANSMUTED_TYPES`) as a standing option: any Warlock damage spell to Psychic, no Sorcery Point; the components half OUT |
| **Eldritch Hex** (Great Old One) | text | ROW → `EFFECT_BENDS` `saves` Disadvantage on the Hexed ability, keyed to Hex's effect |

**NATIVE:** Pact Magic, Steps of the Fey (the bend is a row; the temp HP the pack's), Healing Light, Fiendish Resilience, Clairvoyant Combatant (a row), Thought Shield, Create Thrall (a summon; its extra damage measure).
**OUT:** Eldritch Invocations (the list — see options), Magical Cunning, Contact Patron, Mystic Arcanum, Eldritch Master, the patron spell lists, Bewitching Magic, Celestial Resilience, Awakened Mind.

## Wizard

| Feature | The pack carries | Verdict → where |
| --- | --- | --- |
| **Arcane Ward** (Abjurer) | uses, text | ROW+VOCAB → the damage-absorbing pool at `preApplyDamage`, automatic (R1: the ward has no choice), refilled by Abjuration casts — the first customer of the shape |
| **Projected Ward** (Abjurer) | text | ROW → the pool's Reaction: `INTERRUPT_REDUCTIONS` `reach: 30` drawing from the ward |
| **Spell Resistance** (Abjurer) | text | ROW+VOCAB → `EFFECT_BENDS` `saves` Advantage with a `vsSpells` judge (the demand knows its source is a spell); the resistance NATIVE |
| **Portent** + **Greater Portent** (Diviner) | uses, text | ROW+VOCAB → a `set` D20 fold: replace a roll the bearer can see with a stored die (two or three, rolled at the rest) — **UI-shaped, a prototype** (the dice chips the gate already draws) |
| **Potent Cantrip** (Evoker) | text | ROW+VOCAB → the verdict's half rule per CASTER feature (Evasion's mirror: a cantrip's successful save still takes half) |
| **Sculpt Spells** (Evoker) | text | ROW → Careful Spell's machine (`METAMAGIC`'s area ask) as a feature row: 1 + the slot level chosen creatures succeed and take nothing |
| **Empowered Evocation** (Evoker) | dmg | ROW → `SPELL_DAMAGE_BONUS` (+Int to one damage roll of an Evocation) |
| **Overchannel** (Evoker) | dmg, uses | ROW+VOCAB → the dice changers' `max` (Empowered's popup) + a self-damage clock on the second use per rest — waits for a customer |

**NATIVE:** Spell Mastery, Signature Spells (free casts), The Third Eye, Illusory Self (a row), Greater Portent (the third die).
**OUT:** Arcane Recovery, Ritual Adept, Scholar, Memorize Spell, the savants, Spell Breaker (spells), Expert Divination, Improved Illusions, Phantasmal Creatures, Illusory Reality.

## The options nothing grants (Warlock invocations; the maneuvers and metamagic are done)

| Option | The pack carries | Verdict → where |
| --- | --- | --- |
| **Repelling Blast** | effect | ROW → `CLOCK_RIDERS` `press: push 10` on an Eldritch Blast hit (no cost, every beam) |
| **Eldritch Smite** | dmg | ROW+VOCAB → `HIT_OPTIONS` with a NEW cost kind, a Pact slot: +1d8 per slot level force, Prone if Huge or smaller |
| **Lifedrinker** | dmg | ROW → `CLOCK_RIDERS` once per turn on a pact-weapon hit (1d6 necrotic / psychic / radiant, the pick a type facet) |
| **Eldritch Mind** | effect | NATIVE (measured 2026-09-29 (M0): `concentration.roll.mode`) |
| **Gift of the Protectors** | uses, text | ROW → `DROP_TO_ONE` for the NAMED creatures (the tome's list) |
| **Lunging Attack** (maneuver) | dmg | ROW → `USE_CHIPS` (Dash, then the die on a melee hit this turn) |
| **Evasive Footwork** (maneuver) | effect | measure → the die as AC until the turn ends — NATIVE if the pack's effect rolls it |
| **Bait and Switch** (maneuver) | 12 effects | NATIVE (the swap is movement; the AC bonus an effect) |

**NATIVE:** Agonizing Blast, Eldritch Spear, Devil's Sight, Fiendish Vigor, Thirsting Blade, Devouring Blade, Witch Sight, Pact of the Blade / Chain / Tome, the ten metamagic options, the on-hit and fold maneuvers (rows), Rally, Ambush, Tactical Assessment, Commanding Presence.
**OUT:** the utility invocations (Armor of Shadows, Mask of Many Faces, Misty Visions, Otherworldly Leap, Ascendant Step, Gaze of Two Minds, Gift of the Depths, Master of Myriad Forms, One with Shadows, Whispers of the Grave, Visions of Distant Realms, Lessons of the First Ones), Investment of the Chain Master (the familiar), Epic Boon (out by ruling).

---

## The tally, by class

| Class | Rows in a table that exists | Rows needing a facet | Waits for a kind | UI-shaped (prototype first) |
| --- | --- | --- | --- | --- |
| Barbarian | 6 | 6 | Fanatical Focus | Brutal Strike's gate box |
| Bard | 8 | 1 | Countercharm, Peerless Skill | — |
| Cleric | 6 | 2 | — | — |
| Druid | 4 | 2 | — | — |
| Fighter | 8 | 4 | Indomitable | — |
| Monk | 10 | 1 | Disciplined Survivor | — |
| Paladin | 9 | 2 | Living Legend | Inspiring Smite |
| Ranger | 6 | 4 | — | — |
| Rogue | 4 | 1 | Homing Strikes | — |
| Sorcerer | 5 | 3 | — | Wild Magic Surge |
| Warlock | 4 | 5 | Dark One's Own Luck | — |
| Wizard | 3 | 4 | — | Portent |
| Options | 6 | 1 | — | — |

**The one kind the classes ask for is the reroll kind** (eight customers). Everything else is rows and
facets on tables that exist, and the four prototypes. The order between classes is the user's, set by
the next party (BACKLOG *The long-term order* step 5): this drawing is the map, not the commission.

---

## Register verdicts (2026-09-29, for Session 0's plan)

> **What this table is:** the hand verdicts the generated register cannot derive — one row per feature the
> defaults get wrong, read by `tools/audit-classes-register.mjs` (a default is MODULE when a table names the
> row, OUT for a spell list, TEXT for a paragraph, else NATIVE). The words: NATIVE · MODULE (a table names it
> today) · **ROW** (a row or a facet on a machine that exists — *Precedent* names the table and the row it
> resembles, per the standing rule) · **TABLE** (a new table, not a kind) · **KIND** (the R4 tripwire moves) ·
> TEXT · OUT · **WAITS** (drawn, held for its first player). *Stage* is the plan's build stage
> ([../plans/session-0-classes.md](../plans/session-0-classes.md)): A1–A7 the level 1–5 band, B1–B5 levels 6–10,
> C1 levels 11–16, D1 levels 17–20, M0 a measurement first (the sandbox, after the release battery) —
> nothing here is built until the user says go. Names are the pack's own.

| Feature | Class — Sub | Verdict | Precedent | Stage | Why not / how |
| --- | --- | --- | --- | --- | --- |
| **Rage** | Barbarian | MODULE | `TURN_GRANTS` · Rage (`remind: "extend"`, `on: turnEnd`) | A1 | BUILT 2026-09-29 (A1): the turn-end reminder read off the turn's own cards — the 2024 text: an attack roll at an enemy or a save forced on one extends it (not "attacked or took damage"); never an end — nothing records the Bonus Action (a bend row) |
| **Danger Sense** | Barbarian | NATIVE | — | — | measured 2026-09-29 (M0): the pack's transferred effect writes `system.abilities.dex.save.roll.mode` +1, the platform rolls the Advantage (Gnomish Cunning's shape); the Incapacitated exception is the table's (the pack's own note: toggle it in the Effects tab) |
| **Brutal Strike** | Barbarian | ROW | `ADVANTAGE_BUYS` · Lucky (its mirror — a FORGO tick) + `HIT_GROUPS` · Combat Superiority (`free`, `ownDice`, `requires.forgo`) + `HIT_OPTIONS` · Distracting Strike (`effects`) | B3 | BUILT: the forgo is a box in the attack dialog beside the Reckless source (the Advantage struck, the net Normal, `forgo` on the record); only a forgone hit offers the group — the feature's die on every option, one effect per hit: Forceful Blow a line, Hamstring Blow the pack's Hamstrung |
| **Relentless Rage** | Barbarian | ROW | `DROP_TO_ONE` · Undead Fortitude (`save`) + Relentless Endurance (`uses`) | C1 | BUILT: the `save` row while raging — the pack's own DC (10, +5 per use), the use spent by the roll, the heal on a success — was: held at 1 while the Constitution save rolls on the keeper, DC 10 rising by 5 per use (a `dc` counter facet, reset on a rest), `while: raging`; a success heals the level's worth as the pack's heal activity |
| **Persistent Rage** | Barbarian | TABLE | `INITIATIVE_GRANTS` (new; the seam `initiative-swap.js` reads — every combatant rolled) | A6 | regain all Rage uses when Initiative is rolled — a card and the sheet write, no choice (R1); 5 customers across the classes make the table |
| **Improved Brutal Strike** | Barbarian | ROW | `HIT_OPTIONS` · the Brutal Strike group (`dieFrom`) + `EFFECT_BENDS` · Struck (`saves`, `spend: "save"`) / a `plus` row | B3 | BUILT: Staggering Blow lands Staggered (Disadvantage on the next save, spent by it); Sundering Blow lands Sundered (+5 pushed onto another creature's next attack roll at the target, spent by it, never the barbarian's own) |
| **Improved Brutal Strike (2)** | Barbarian | ROW | `HIT_GROUPS` · `max: 2` (the pick-per-group ruling) | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: two different Brutal Strike effects on one hit: the group's `max` |
| **Frenzy** | Barbarian — Path of the Berserker | MODULE | `CLOCK_RIDERS` · frenzy (`judge: reckless`, `when: oncePerTurn`) | A1 | BUILT 2026-09-29 (A1): the Rage Damage d6s on the first hit of the turn while raging and Reckless |
| **Rage of the Wilds** | Barbarian — Path of the Wild Heart | MODULE | `EFFECT_CHOICES` · Rage of the Wilds (`on: Rage`, `picks`, `use`) + `EMANATIONS` / `EFFECT_BENDS` · Rage of the Wolf (`member`) | A1 | BUILT 2026-09-29 (A1): Bear / Eagle / Wolf asked at the Rage (the pick uses the feature's own activity); the Wolf's 5-ft ring on enemies while the Wolf and the Rage stand, its members attacked with Advantage by all but the barbarian |
| **Power of the Wilds** | Barbarian — Path of the Wild Heart | ROW | `EMANATIONS` · Reactive Strike's ring (`quiet`) + `CLOCK_RIDERS` · Hill's Tumble's press | C1 | BUILT: the pick at the Rage kept as a chip; Lion a `made` member effect on Rage of the Wolf's ring (EFFECT_BENDS `except: source`); Ram a clock rider landing the pack's Prone on a melee hit — was: Lion: a ring whose members' attacks NOT at the rager roll at Disadvantage (`EFFECT_BENDS` on the member effect, `except: source`); Ram: a no-save Prone press on a hit once per turn; Falcon: NATIVE (fly) |
| **Vitality of the Tree** | Barbarian — Path of the World Tree | ROW | `TURN_GRANTS` · Heroism (`on: use` of the Rage; `while: raging`, `to: ally`) | A6 | measured (A6): Vitality Surge — temp HP = the Barbarian level when the Rage is USED (not each turn); Life-Giving Force — at the START of each raging turn, (Rage Damage)d6 temp HP given to another creature within 10 ft, a pick, so asked (the rest song's popup) |
| **Branches of the Tree** | Barbarian — Path of the World Tree | ROW | `EMANATIONS` · Unnerving Gaze (`alert.on: "turnStart"`, 30 ft) | B5 | BUILT: Unnerving Gaze's alert standing only while the Rage does (`while`), quiet; the hostile starting its turn within 30 ft raises the reminder on the rager, the save from the sheet — was: a hostile starting its turn within 30 ft while raging raises the reminder; the Reaction's save and the teleport are the activity's, from the sheet |
| **Fanatical Focus** | Barbarian — Path of the Zealot | KIND | `D20_FOLDS` · Heroic Inspiration (a reroll, `replace`) — the `reroll` kind, table `REROLLS` | B1 | a failed save rerolled with the Rage Damage bonus added, once per Rage (`while: raging`, the once a chit keyed to the Rage effect) |
| **Rage of the Gods** | Barbarian — Path of the Zealot | ROW | `INTERRUPT_REDUCTIONS` · Interception (`ally`, `reach: 30`) | C1 | BUILT: the pack ships REVIVIFICATION (measured): an `ally: 30` keeper row on DROP_TO_ONE — the raging Zealot asked, a Rage use, the creature drops to the barbarian's level (`to: "roll"`); the register's Protective Wings was a misread — was: Protective Wings: a Reaction that takes an ally's damage within 30 ft — the guard's shape, the whole amount (`all`), the flight and the resistances the pack's effect |
| **Indomitable Might** | Barbarian | OUT | — | — | a check floor — no check gate carries a floor, and the user's rule keeps checks out |
| **Primal Champion** | Barbarian | OUT | — | — | ability scores — the sheet's |
| **Instinctive Pounce** | Barbarian | OUT | — | — | movement (DESIGN §4) |
| **Primal Knowledge** | Barbarian | OUT | — | — | skills — the sheet's |
| **Travel Along the Tree** | Barbarian — Path of the World Tree | OUT | — | — | a teleport — movement (DESIGN §4) |
| **Animal Speaker** | Barbarian — Path of the Wild Heart | OUT | — | — | out-of-combat casts |
| **Nature Speaker** | Barbarian — Path of the Wild Heart | OUT | — | — | an out-of-combat cast |
| **Weapon Mastery** | Barbarian | NATIVE | — | — | the mastery machine (`mastery.js`) reads the weapon's own property |
| **Countercharm** | Bard | ROW | `INTERRUPT_ROLLS` · the bystander's bend (Restore Balance, Portent) with `bend: "reroll"`, `bystander: 30`, `against`, `advantage` | B1 | a FRIEND's failed demanded save against Charmed or Frightened within 30 ft (the bard's own included): the bard's Reaction rerolls it with Advantage, the new roll stands — built 2026-09-30 as a bystander row, not a fold row (RULINGS *The PHB classes — B1*, call 4) |
| **Superior Inspiration** | Bard | TABLE | `INITIATIVE_GRANTS` · Persistent Rage | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: regain uses to two when Initiative is rolled — a sheet write and a card |
| **Font of Inspiration** | Bard | OUT | — | — | rest recovery and a slot-for-a-use trade — the sheet's |
| **Expertise** | Bard | OUT | — | — | a proficiency |
| **Magical Secrets** | Bard | OUT | — | — | spell selection |
| **Words of Creation** | Bard | OUT | — | — | spell selection (Power Word Heal / Kill are the spells register's) |
| **Cutting Words** | Bard — College of Lore | MODULE | `INTERRUPT_ROLLS` · Cutting Words (the bystander facets: `bystander: 60`, `tests: [attack, check]`, `bend: die`, `sign: -1`, `damage`) | A3 | BUILT 2026-09-29 (A3): a hostile's hit on anyone within 60 ft of the bard, asked when a Bardic die can turn it (the margin gate); quiet otherwise — the card's die off the damage; a hostile's check (no DC: the arithmetic, the DM rules); "Not this combat" (RULINGS *The bystander's bend — built*) |
| **Peerless Skill** | Bard — College of Lore | ROW | `D20_FOLDS` · Tactical Mind (`tactical`: an item's uses) with `tests: [attack, check]` | C1 | BUILT: a TACTICAL_FOLDS row on the feature's own activity (the Bardic die, a Bardic Inspiration use) — was: the bard's OWN failed check or attack roll: the Bardic die added, paid from Bardic Inspiration's uses — the `tactical` spend widened by a `tests` facet |
| **Combat Inspiration** | Bard — College of Valor | MODULE | `CLOCK_RIDERS` · combat-inspiration (`inspired`, `unticked`) + `INTERRUPT_ROLLS` · Combat Inspiration (`inspired`, `only: self`) | A1 | BUILT 2026-09-29 (A1): the attack half stays the `bardic` fold; Offense the bard's die on the damage offer, UNticked (ruled); Defense the hit creature's own popup, −the die off the attack, the Inspired effect spent |
| **Battle Magic** | Bard — College of Valor | ROW | `BONUS_SWINGS` · Pole Strike (`when: "cast"`) | C1 | BUILT: BONUS_SWINGS `when: "cast"` — Hew's reminder on an action-cast spell's usage card — was: after an action-cast, Hew's reminder: one weapon attack as a Bonus Action — the swing from the sheet |
| **Martial Training** | Bard — College of Valor | OUT | — | — | proficiencies; the spellcasting focus is the sheet's |
| **Inspiring Movement** | Bard — College of Dance | ROW | `EMANATIONS` · Reactive Strike (`alert`, 5 ft) with `alert.on: "turnEnd"` | B5 | BUILT: `alert.on: "turnEnd"` off the region's turn-end event; the enemy ending its turn beside the bard raises the reminder, the Reaction and the moves from the sheet — was: an ENEMY ending its turn within 5 ft raises the reminder (a use of Bardic Inspiration, the Reaction); the move is the player's — `turnEnd` joins the alert vocabulary |
| **Tandem Footwork** | Bard — College of Dance | TABLE | `INITIATIVE_GRANTS` · Persistent Rage, `to: "allies"` (Musician's give) | B4 | BUILT: one roll onto every ally's Initiative within 30 ft (the bard too), late rollers noted on the combat and paid as theirs lands; the Bardic Inspiration use the activity's — was: at Initiative, a use of Bardic Inspiration gives the die to allies within 30 ft (the bard too) — the numbers re-set as Ambush's fold re-sets a combatant's |
| **Leading Evasion** | Bard — College of Dance | ROW | `EVASIONS` · Evasion (`reach: 5`) | C1 | BUILT: the `share: 5` facet — the demand's other targets within 5 ft of the bard take its verdict — was: allies within 5 ft share the bard's Evasion verdict — a `reach` facet the consequences pass reads off the map (R1) |
| **Dazzling Footwork** | Bard — College of Dance | NATIVE | — | — | the pack: the AC, the die as unarmed damage, Advantage on a check |
| **Beguiling Magic** | Bard — College of Glamour | NATIVE | — | — | the pack: a save, Charmed / Frightened |
| **Mantle of Inspiration** | Bard — College of Glamour | NATIVE | — | — | temp HP on use; the free move is the table's |
| **Mantle of Majesty** | Bard — College of Glamour | ROW | `EFFECT_BENDS` · Trance (`saves.succeeds`) mirrored: `saves.fails`, with `side: "caster"` and `named` | B2 | BUILT: the pack's "Unearthly Appearance" on the bard (the demand's caster snapshot), a Command at a creature CHARMED BY THE BARD (the Charmed's source stamp, else its origin) — the Fails button the default, the entry autoFailed |
| **Unbreakable Majesty** | Bard — College of Glamour | ROW | `DUPLICATES` · Reflective Carapace (`match: "feature"`, a save for the die) | C1 | BUILT: a `save` duplicate — the attacker's Charisma save inside the hold once the hit stands, once per turn per attacker — was: after a HIT stands, the attacker's Charisma save (the pack's activity); a failure turns the hit into a miss (`absorbed`), and the row is spent for that attacker's turn — NOT Sanctuary's before-the-roll shape (the 2024 text puts the save after the hit) |
| **Bonus Proficiencies** | Bard — College of Lore | OUT | — | — | proficiencies |
| **Magical Discoveries** | Bard — College of Lore | OUT | — | — | spell selection |
| **Jack of All Trades** | Bard | NATIVE | — | — | the pack's effect |
| **Bardic Inspiration** | Bard | MODULE | `D20_FOLDS` · Inspired (`bardic`) | — | the Inspired effect's die folds into the holder's roll today |
| **Divine Order** | Cleric | OUT | — | — | a level-1 pick — the sheet's |
| **Blessed Strikes** | Cleric | ROW | `DAMAGE_RULES` · Elemental Adept (`spells`, gate `always`) — a `bonus: "@mod"` on the class's cantrips | B4 | BUILT as the option row (Potent Spellcasting a `DAMAGE_RULES` row); Divine Strike stands as its clock rider — was: the parent names the pick: Divine Strike is a `CLOCK_RIDERS` row already; Potent Spellcasting — measured 2026-09-29 (M0): NOT automatic (the pack ships a separate Damage activity with `@abilities.wis.mod`, typed by the dialog) — one row on the damage-rules table (`spells: "cantrip"`, `classes: [cleric]`) |
| **Improved Blessed Strikes** | Cleric | ROW | `CLOCK_RIDERS` · Divine Strike (the die; the pack's own scaling) + `REST_GRANTS` · Inspiring Leader's temp HP shape on a CAST | C1 | BUILT: a HEAL_ON_HIT `on: "damage"` pick — the rest song's one-creature popup when a cleric cantrip lands damage — was: Divine Strike's 2d8 is the activity's own scaling (NATIVE); Potent Spellcasting's temp HP to a creature within 60 ft on a cantrip's damage is a cast rider `grant: temphp` — an ask (the pick is the cleric's) |
| **Divine Intervention** | Cleric | OUT | — | — | a free cast — the sheet's |
| **Greater Divine Intervention** | Cleric | OUT | — | — | Wish — the table's |
| **Disciple of Life** | Cleric — Life Domain | ROW | `HEAL_REROLLS` · Beacon of Hope (`max`, the cast path's healing) — a `bonus: "2 + @slot"` facet | A4 | a healing spell cast with a slot heals 2 + the slot level more — added as the healing lands through `cast.js`, the receipt saying so (a card's own buttons are not raised: Beacon's bend row) |
| **Blessed Healer** | Cleric — Life Domain | ROW | `HEAL_REROLLS` · Disciple of Life — a `self: "2 + @slot"` facet | B4 | BUILT: the cleric's own card and receipt (2 + the slot) after its slot-cast heal lands on another — was: after a slot-cast healing spell aimed at another creature lands, the cleric regains 2 + the slot level, its own receipt on the cast card |
| **Supreme Healing** | Cleric — Life Domain | ROW | `HEAL_REROLLS` · Beacon of Hope (`max`) on the CASTER | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: the cleric's own healing dice count their maximum — Beacon's `max` keyed to the caster's feature instead of the target's effect |
| **Preserve Life** | Cleric — Life Domain | NATIVE | — | — | the pack's heal pool — the distribution is the sheet's |
| **Warding Flare** | Cleric — Light Domain | MODULE | `INTERRUPT_ROLLS` · Warding Flare | — | the `roll` interrupt; the owner-only gap is DESIGN §8's, its reopen the `ally: 30` facet Protection has |
| **Improved Warding Flare** | Cleric — Light Domain | ROW | `INTERRUPT_ROLLS` · Warding Flare — a `heal` facet | B4 | BUILT: the Flare's answer lands 2d6 + Wis Temporary Hit Points on the flared creature, receipted on the attack card (`heal` on the roll row) — was: the flared attack's target regains 2d6 + Wis (the pack's heal activity) when the Flare bends the roll — landed with the answer, receipted; the rest recovery is the sheet's |
| **Corona of Light** | Cleric — Light Domain | ROW | `EMANATIONS` · Aura of Protection (`saves` on the member effect) + `TOKEN_LIGHTS` · Inner Radiance | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: a 30-ft harmful ring for 1 minute: enemies inside save at Disadvantage against fire and radiant spells (the `saves` facet with `types`); the light is a Token Lights row |
| **Radiance of the Dawn** | Cleric — Light Domain | NATIVE | — | — | the pack: a save, damage |
| **Invoke Duplicity** | Cleric — Trickery Domain | MODULE | `EFFECT_BENDS` · Invoke Duplicity | — | the bend row exists; the illusion's position is the table's |
| **Improved Duplicity** | Cleric — Trickery Domain | ROW | `EFFECT_BENDS` · Invoke Duplicity (`allies: true`) | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: Shared Distraction: the bend serves allies too; the heal when the illusion ends is OUT (the illusion is not a token the module reads) |
| **Trickster's Transposition** | Cleric — Trickery Domain | OUT | — | — | a teleport — movement |
| **Blessing of the Trickster** | Cleric — Trickery Domain | NATIVE | — | — | the pack's effect (Advantage on Stealth) |
| **Guided Strike** | Cleric — War Domain | MODULE | `INTERRUPT_ROLLS` · Guided Strike (`on: miss`, `bonus: 10`, `self` with no Reaction) | A3 | BUILT 2026-09-29 (A3): the cleric's own miss or an ally's within 30 ft, held on the miss when +10 reaches the AC; the turned miss rolls its damage at the resolve |
| **War Priest** | Cleric — War Domain | MODULE | `BONUS_SWINGS` · War Priest (`uses`, `ranged`) | A1 | BUILT 2026-09-29 (A1): Hew's reminder after any weapon or Unarmed Strike attack on your turn, the uses shown |
| **War God's Blessing** | Cleric — War Domain | NATIVE | — | — | Shield of Faith cast from the feature — the spell's own row |
| **Avatar of Battle** | Cleric — War Domain | NATIVE | — | — | the resistances are the sheet's traits |
| **Channel Divinity** | Cleric | NATIVE | — | — | Turn Undead: the pack's save, Frightened + Incapacitated |
| **Sear Undead** | Cleric | NATIVE | — | — | the pack's damage on the Turn |
| **Druidic** | Druid | OUT | — | — | a language |
| **Primal Order** | Druid | OUT | — | — | a level-1 pick |
| **Wild Companion** | Druid | OUT | — | — | a summon (Find Familiar — the spells register's) |
| **Wild Shape** | Druid | NATIVE | — | — | the platform's transformation |
| **Wild Resurgence** | Druid | OUT | — | — | a slot-for-a-use trade — the sheet's |
| **Elemental Fury** | Druid | ROW | `DAMAGE_RULES` · Elemental Adept (`spells`) — the same row shape as Blessed Strikes | B4 | BUILT as the option row (Potent Spellcasting a `DAMAGE_RULES` row); Primal Strike stands as its clock rider — was: the parent names the pick: Primal Strike is a `CLOCK_RIDERS` row already; Potent Spellcasting — measured 2026-09-29 (M0): NOT automatic (no activity, no effect; the text's lookup is display only) — one damage-rules row on the druid's cantrips |
| **Improved Elemental Fury** | Druid | NATIVE | — | — | Primal Strike's 2d8 is the activity's scaling; Potent Spellcasting's range is the spell's own |
| **Beast Spells** | Druid | OUT | — | — | casting in Beast form — the table's |
| **Archdruid** | Druid | OUT | — | — | recovery — the sheet's |
| **Land's Aid** | Druid — Circle of the Land | NATIVE | — | — | the pack: a save, damage, a heal |
| **Natural Recovery** | Druid — Circle of the Land | OUT | — | — | a free cast — the sheet's |
| **Nature's Sanctuary** | Druid — Circle of the Land | NATIVE | — | — | measured 2026-09-29 (M0): the four Nature's Ward effects carry the `coverHalf` STATUS; dnd5e folds it into `ac.cover`, which the cover measure already reads as the CARRIED cover (reminders.js `coverOf`, the measure raises only above it) — nothing to build; the cube's placement and which allies stand in it are the table's |
| **Circle Forms** | Druid — Circle of the Moon | NATIVE | — | — | measured (A6): dnd5e's `wildshape` transformation preset carries it — `tempFormula: max(@classes.druid.levels, @subclasses.moon.levels * 3)` and `minimumAC: (13 + Wis) × sign(moon levels)`; the CR is the pack's profile |
| **Improved Circle Forms** | Druid — Circle of the Moon | NATIVE | — | — | the pack's effect (radiant option) |
| **Lunar Form** | Druid — Circle of the Moon | ROW | `CLOCK_RIDERS` · Divine Fury (`when: oncePerTurn`, `judge: wildShape`) | C1 | BUILT: `judge: "wildShape"` — the platform's transformation flag — was: 2d10 radiant once per turn on an attack in Wild Shape — a `judge: wildShape` reading the transformation |
| **Wrath of the Sea** | Druid — Circle of the Sea | ROW | `EMANATIONS` · Inner Radiance (`pulse`) with a `pick` (the ask at the area's shape) | B5 | BUILT: the ring while "Manifesting Ocean Spray" stands (reach all, the scale's range); the turn-start card lists who stands inside with a button each, the pick demands the pack's "Bonus Action Save" once per turn, the push a line; Oceanic Gift's `bearer` is C1's — was: a 5-ft ring while the Wild Shape use stands; once per turn the druid PICKS one creature inside (an ask on the turn's card, the clock's default the only one), the activity's Constitution save and push; Oceanic Gift moves the ring to an ally (a `bearer` facet) |
| **Aquatic Affinity** | Druid — Circle of the Sea | NATIVE | — | — | the ring's size is the activity's; the speed the sheet's |
| **Stormborn** | Druid — Circle of the Sea | NATIVE | — | — | flight and resistance — the pack's effect |
| **Oceanic Gift** | Druid — Circle of the Sea | ROW | `EMANATIONS` · Wrath of the Sea — a `bearer` facet | C1 | BUILT: the `bearer` facet — the ring on the token wearing Stormborn, the druid its source (the scale, the DC, the pick) — was: the ring manifested around a willing ally within 60 ft (the pick at the use), the druid's DC on the save |
| **Star Map** | Druid — Circle of the Stars | OUT | — | — | a focus and a free cast |
| **Starry Form** | Druid — Circle of the Stars | MODULE | `EFFECT_CHOICES` · Starry Form (`picks`, `lands`, `chip`) + `HEAL_REROLLS` · Starry Form (`also: Chalice`) | A1 | BUILT 2026-09-29 (A1): the constellation asked at Consume Wild Shape — Dragon Form lands only with Dragon; Chalice keeps a form chip and a levelled healing spell's card offers the second heal; Archer NATIVE; the Dragon's Concentration floor NATIVE (the pack's `concentration.roll.min`) |
| **Cosmic Omen** | Druid — Circle of the Stars | ROW | `INTERRUPT_ROLLS` · Cutting Words' bystander facets (`bystander: 30`, `tests: [attack, save, check]`, `die: ±d6`) | B4 | BUILT: the Long Rest's d6 on a `STORED_DICE` chip (Weal / Woe, never spent), its parity the sign, the pack's Weal (Even) / Woe (Odd) activity picked by it; asked after the roll (the platform register) — was: Weal adds, Woe subtracts — read off the rest's roll stored on the feature's uses (a `stored` facet); the bystander's popup to the druid |
| **Twinkling Constellations** | Druid — Circle of the Stars | NATIVE | — | — | the dice scale on the pack's activities |
| **Full of Stars** | Druid — Circle of the Stars | NATIVE | — | — | the pack's effect (resistances) |
| **Fighting Style** | Fighter | NATIVE | — | — | the Fighting Styles table reads the feat |
| **Second Wind** | Fighter | NATIVE | — | — | the pack's heal; Tactical Mind is a fold row |
| **Action Surge** | Fighter | OUT | — | — | action economy |
| **Tactical Shift** | Fighter | OUT | — | — | movement |
| **Indomitable** | Fighter | KIND | `D20_FOLDS` · Heroic Inspiration — the `reroll` kind, table `REROLLS` (`bonus: "@classes.fighter.levels"`, uses) | B1 | a failed save rerolled with the Fighter level added, the item's uses paid — the PHB customer of the kind; offered on a demanded save before its verdict (the withhold) and on a sheet save as an offer |
| **Tactical Master** | Fighter | NATIVE | dnd5e 6 — `item.system.masteryOptions` off the pack's `weaponProf.mastery.bonus` effect; the attack dialog's Mastery select; `system.mastery` on the message | B3 | MEASURED 2026-09-30: the platform offers the swap (the weapon's own, Push, Sap, Slow) and stamps the pick, which the mastery machine already resolves — no row |
| **Two Extra Attacks** | Fighter | OUT | — | — | action economy |
| **Three Extra Attacks** | Fighter | OUT | — | — | action economy |
| **Studied Attacks** | Fighter | ROW | `USE_CHIPS` · Steady Aim, written by a MISS (`on: "miss"`, `against`) + `EFFECT_BENDS` (`against`, `spend: "attack"`) | B3 | BUILT: a miss writes "Studied Attacks — vs <creature>" on the fighter (read as rolled, Graze's road), the vex window; the gate reads it at THAT creature alone, the roll at it spends it |
| **Combat Superiority** | Fighter — Battle Master | MODULE | `HIT_GROUPS` · Combat Superiority | — | every maneuver lands on a machine (RULINGS *The rest of the maneuvers*) |
| **Student of War** | Fighter — Battle Master | OUT | — | — | proficiencies |
| **Know Your Enemy** | Fighter — Battle Master | OUT | — | — | information — the table's |
| **Improved Combat Superiority** | Fighter — Battle Master | NATIVE | — | — | the die is `@scale.battle-master.superiority.die` |
| **Relentless** | Fighter — Battle Master | ROW | `SUPERIORITY_STAND_INS` (`die: "1d8"`, `pool: "Combat Superiority"`) — the hit menu's rider | B3 | BUILT: with no Superiority Dice left, once per turn, the hit menu offers the maneuver at "1d8 Superiority Die" and the d8 rides in the die's place, nothing spent (a bend by choice: only at an empty pool); Parry and the Bonus Action maneuvers still ask for a die |
| **Ultimate Combat Superiority** | Fighter — Battle Master | NATIVE | — | — | the scale value |
| **Improved Critical** | Fighter — Champion | NATIVE | — | — | the pack's effect sets the crit range; the module reads `isCritical` off the roll |
| **Remarkable Athlete** | Fighter — Champion | NATIVE | — | — | the pack's effect (Initiative Advantage); the move after a crit is the table's |
| **Additional Fighting Style** | Fighter — Champion | NATIVE | — | — | a second Fighting Styles row on the sheet |
| **Heroic Warrior** | Fighter — Champion | ROW | `TURN_GRANTS` · Regeneration (`match: "feature"`) — `grant: "inspiration"` (Resourceful's write) | B4 | BUILT: Heroic Inspiration written at the turn start when none is held, a card (`grant: "inspiration"`) — was: at the fighter's turn start in combat, Heroic Inspiration if none is held — a sheet write and a card, no choice (R1: "you can" with one sensible answer, the dice changers' rule) |
| **Superior Critical** | Fighter — Champion | NATIVE | — | — | the crit range on the effect |
| **Survivor** | Fighter — Champion | ROW | `TURN_GRANTS` · Regeneration (`grant: heal`, `while: bloodied`) + a death-save crit range at `dnd5e.preRollDeathSave` | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: Heroic Rally: 5 + Con at each turn start while Bloodied — the turn grant (the pack's Heal activity, `activation: turnStart`, is the number); Defy Death — measured 2026-09-29 (M0): the Advantage is NATIVE (the transferred effect writes `system.attributes.death.roll.mode` +1); the 18–20-counts-as-20 half is NOT (the pack's note) — a row at the death save's config (the critical threshold 18) |
| **War Bond** | Fighter — Eldritch Knight | NATIVE | — | — | the bond and the summon are the sheet's |
| **War Magic** | Fighter — Eldritch Knight | ROW | `BONUS_SWINGS` · Pole Strike — a reminder at the Attack action (`when: "attack"`, `says`) | B4 | BUILT: the reminder alone on the Attack action's first attack (`BONUS_SWINGS` `when: "attack"`, no drive) — was: the reminder that one attack may be a cantrip — a card line, nothing driven; Improved War Magic is the same row's words at 18 |
| **Eldritch Strike** | Fighter — Eldritch Knight | ROW | `CLOCK_RIDERS` · Slasher (`lands`, `clock: "vex"`) + `EFFECT_BENDS` · Magic Resistance (`saves`, `spells: "source"`, `spend: "save"`) | B2 | BUILT: every weapon hit lands the pack's "Struck" (one copy, until the end of the fighter's next turn); the target's next save against the FIGHTER's spell is at Disadvantage and spends it |
| **Arcane Charge** | Fighter — Eldritch Knight | OUT | — | — | a teleport — movement |
| **Improved War Magic** | Fighter — Eldritch Knight | ROW | `BONUS_SWINGS` · War Magic | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: the same reminder, two attacks replaced |
| **Psionic Power** | Fighter — Psi Warrior | MODULE | `HIT_OPTIONS` · psionic-strike (group `psionic-power`, `ownDice`, `oncePerTurn`, `weapon`) + `INTERRUPT_REDUCTIONS` · Psionic Power (`activity: Protective Field`, `pool`, `any`, `ally: 30`) | A2 | BUILT 2026-09-29 (A2): Psionic Strike a hit-menu row (the die + Int as Force, once per turn, a weapon hit, the Psionic Energy Dice); Protective Field the die + Int off your own damage (any) or an ally's attack damage within 30 ft (the guard); Telekinetic Movement OUT (movement) |
| **Telekinetic Adept** | Fighter — Psi Warrior | ROW | `HIT_OPTIONS` · Trip Attack (`save`, `onFail: prone`) as a FOLLOW-UP on Psionic Strike | B4 | BUILT: Telekinetic Thrust a `follow` on Psionic Strike — the Strength save at the hit target after the ride, Prone on a failure; the push and Psi-Powered Leap the table's — was: Telekinetic Thrust: on a Psionic Strike, the target's Strength save or Prone / pushed — the option's save activity used after the damage (Trip's path); Psi-Powered Leap: OUT (movement) |
| **Guarded Mind** | Fighter — Psi Warrior | ROW | `TURN_GRANTS` · Heroic Warrior — `grant: "end"` (`statuses: [charmed, frightened]`, `pool`) | B4 | BUILT: at the turn start an offer to end Charmed or Frightened, the End Effects activity paying a Psionic die (`grant: "end"`) — was: at the turn start, an OFFER to spend a Psionic die and end Charmed or Frightened (the effect deleted, receipted); the resistance is the pack's |
| **Bulwark of Force** | Fighter — Psi Warrior | NATIVE | — | — | measured 2026-09-29 (M0) with Nature's Sanctuary: the effect carries `coverHalf`, dnd5e's `ac.cover` reads it, the measure respects it as carried cover; the picks are the use's own targets |
| **Telekinetic Master** | Fighter — Psi Warrior | NATIVE | — | — | Telekinesis cast from the feature; the Bonus Action attack while concentrating is the table's |
| **Martial Arts** | Monk | NATIVE | — | — | the Martial Arts die is the pack's; the unarmed-dice swap leaves a strike that rolls a die alone |
| **Monk's Focus** | Monk | NATIVE | — | — | Flurry, Patient Defense, Step of the Wind are the pack's activities and effects |
| **Uncanny Metabolism** | Monk | TABLE | `INITIATIVE_GRANTS` · Persistent Rage — `heal: "Martial Arts die + level"` | A6 | at Initiative, once per Long Rest: every Focus Point back and the heal rolled — an OFFER (it is once per Long Rest, the player may keep it), Persistent Rage's table |
| **Deflect Attacks** | Monk | MODULE | `INTERRUPT_REDUCTIONS` · Deflect Attacks (`types`, `anyType`, `atZero: Redirect`) | A1 | BUILT 2026-09-29 (A1): rolled at the answer (Parry's path; before, reduce by hand), B/P/S hits unless Deflect Energy; the Redirect offered on the damage card when it lands at 0 |
| **Slow Fall** | Monk | OUT | — | — | falling damage — the table's |
| **Stunning Strike** | Monk | MODULE | `HIT_OPTIONS` · stunning-strike (group `monks-focus`, `save`, `noDie`, `oncePerTurn`, `weapons: monk`) + `SAVE_PRESSES` `success` | A2 | BUILT 2026-09-29 (A2): on a Monk weapon or Unarmed Strike hit, once per turn; the save activity is the cost (1 Focus Point); Stunned on a failure, Slowed on a success (the pack marks Slowed failure-only — `success` moves it, the sheet path too) |
| **Empowered Strikes** | Monk | NATIVE | — | — | the type choice is the attack's own |
| **Evasion** | Monk | MODULE | `EVASIONS` · Evasion | — | the verdict outcome |
| **Acrobatic Movement** | Monk | OUT | — | — | movement |
| **Heightened Focus** | Monk | NATIVE | — | — | Flurry's third strike, Patient Defense's temp HP and Step of the Wind's carry are the pack's activities |
| **Self-Restoration** | Monk | ROW | `TURN_GRANTS` · Guarded Mind's `grant: "end"` at `on: "turnEnd"` (`statuses: [charmed, frightened, poisoned]`, no cost) | B4 | BUILT: at the turn END an offer to end Charmed, Frightened or Poisoned, free (`on: "turnEnd"`, `grant: "end"`) — was: at the monk's turn END an offer to end one of the three — "you can" with a pick, so asked |
| **Deflect Energy** | Monk | ROW | `INTERRUPT_REDUCTIONS` · Deflect Attacks — a `level: 13` facet dropping the type judge | C1 | BUILT: A1's `anyType` on Deflect Attacks' row (smoke-classes §16h) — was: from level 13 any damage type qualifies; the row reads the class level off the sheet |
| **Disciplined Survivor** | Monk | KIND | the `reroll` kind (Indomitable) — `pool` the Focus Points | C1 | BUILT: the `reroll` kind with an `activity` pool (a Focus Point), no bonus — was: a failed save rerolled for 1 Focus Point; the proficiencies are the pack's |
| **Perfect Focus** | Monk | TABLE | `INITIATIVE_GRANTS` · Uncanny Metabolism (`unless: uncanny-metabolism`) | C1 | BUILT: `upTo: 4` with `unless: Uncanny Metabolism` — the fallback on that card's No, its own card otherwise — was: Focus Points back to 4 at Initiative when Uncanny Metabolism is not used — the same card, one line |
| **Superior Defense** | Monk | NATIVE | — | — | the pack's effect (resistances) at a turn-start use |
| **Body and Mind** | Monk | OUT | — | — | ability scores |
| **Hand of Harm** | Monk — Warrior of Mercy | MODULE | `HIT_OPTIONS` · hand-of-harm (group `monks-focus`, `ownType`, `oncePerTurn`, `unarmed`) | A2 | BUILT 2026-09-29 (A2): 1 Focus Point on an Unarmed Strike hit, the Martial Arts die + Wis necrotic rides; Physician's Touch's Poisoned is B4's |
| **Hand of Healing** | Monk — Warrior of Mercy | NATIVE | — | — | the pack's heal |
| **Implements of Mercy** | Monk — Warrior of Mercy | OUT | — | — | proficiencies |
| **Physician's Touch** | Monk — Warrior of Mercy | ROW | `HIT_OPTIONS` · Hand of Harm (`effects`, `level: 6`) | B4 | BUILT: Poisoned (Hand of Harm) lands with Hand of Harm's ride (`also`, the vex window); Hand of Healing offers to end a condition on the healed creature (`to: "target"`) — was: Hand of Harm also lands Poisoned until the end of the monk's next turn; Hand of Healing also ends a condition — the heal's own card, a pick (asked) |
| **Flurry of Healing and Harm** | Monk — Warrior of Mercy | OUT | — | — | a substitution the player makes from the sheet |
| **Hand of Ultimate Mercy** | Monk — Warrior of Mercy | OUT | — | — | a revival — the table's |
| **Shadow Arts** | Monk — Warrior of Shadow | NATIVE | — | — | Darkness, Darkvision and Minor Illusion — the pack's |
| **Shadow Step** | Monk — Warrior of Shadow | ROW | `USE_CHIPS` · Steady Aim (`bend: advantage`, `window: steadyAim`, `melee`) | B4 | BUILT: a use chip (`window: "steadyAim"`) with a melee-scoped bend row — Advantage on the next melee attack this turn — was: the teleport's use arms Advantage on the next melee attack this turn — the pack ships no effect, the chip is the module's; the teleport itself is the table's move |
| **Improved Shadow Step** | Monk — Warrior of Shadow | OUT | — | — | the light clause and the free strike — the table's |
| **Cloak of Shadows** | Monk — Warrior of Shadow | NATIVE | — | — | the pack's Invisible effect |
| **Elemental Attunement** | Monk — Warrior of the Elements | MODULE | `HIT_OPTIONS` · elemental-attunement (free group, `activity: Elemental Save`, `only: own`, a line) | A2 | BUILT 2026-09-29 (A2): on an Elemental Strike hit (the feature's own attack), the Strength save; the push or pull a card line |
| **Manipulate Elements** | Monk — Warrior of the Elements | OUT | — | — | a cantrip |
| **Elemental Burst** | Monk — Warrior of the Elements | NATIVE | — | — | the pack: a save, damage |
| **Stride of the Elements** | Monk — Warrior of the Elements | OUT | — | — | movement |
| **Elemental Epitome** | Monk — Warrior of the Elements | ROW | `CLOCK_RIDERS` · Divine Fury (`when: oncePerTurn`, `while: attuned`) | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: Empowered Strikes: the Martial Arts die once per turn on an Unarmed Strike hit while attuned; the resistance is the pack's effect; Destructive Stride is OUT (movement) |
| **Open Hand Technique** | Monk — Warrior of the Open Hand | MODULE | `HIT_OPTIONS` · Addle / Push / Topple (free group, `activity` each, `only: flurry`) | A2 | BUILT 2026-09-29 (A2): one pick on an Unarmed Strike after Flurry of Blows this turn (the use writes a turn chit; out of combat every Unarmed Strike); Addle's effect lands, Push and Topple through their saves |
| **Wholeness of Body** | Monk — Warrior of the Open Hand | NATIVE | — | — | the pack's heal |
| **Fleet Step** | Monk — Warrior of the Open Hand | OUT | — | — | action economy |
| **Quivering Palm** | Monk — Warrior of the Open Hand | NATIVE | — | — | the pack: the save and the damage from the sheet |
| **Lay on Hands** | Paladin | NATIVE | — | — | the pack's pool |
| **Paladin's Smite** | Paladin | OUT | — | — | Divine Smite is a Bonus Action cast after the hit — out of the hit menu (SWEEP §0, 2026-09-03) |
| **Faithful Steed** | Paladin | OUT | — | — | a summon |
| **Radiant Strikes** | Paladin | NATIVE | — | — | measured 2026-09-29 (M0): the transferred effect writes `system.bonuses.mwak.damage` `1d8[radiant]` — every melee weapon attack and Unarmed Strike (both `mwak`) rolls it |
| **Restoring Touch** | Paladin | OUT | — | — | a condition removed on a Lay on Hands use — the pick is the sheet's |
| **Aura Expansion** | Paladin | NATIVE | — | — | the scale value |
| **Sacred Weapon** | Paladin — Oath of Devotion | MODULE | `TOKEN_LIGHTS` · Sacred Weapon (`ends: enchantment`) | A1 | BUILT 2026-09-29 (A1): 20/40 on the paladin's token, clocked as the enchantment and out when it leaves the weapon; a re-use ends the earlier enchantment (`recast: "ends"`, 2026-11-02); the +Cha and Radiant the pack's Enchant (NATIVE) |
| **Aura of Devotion** | Paladin — Oath of Devotion | ROW | `EMANATIONS` · Aura of Courage (the status swapped) | B5 | BUILT: Aura of Courage's row, the pack's "Devoted" on the allies inside (no change on it — the world adds the immunity) — was: Charmed immunity to allies in the aura — the pack's effect on the members |
| **Smite of Protection** | Paladin — Oath of Devotion | ROW | `EMANATIONS` · Aura of Protection — an `effect` handed out `on: "cast"` (Divine Smite) | C1 | BUILT: a CAST_RIDERS `aura` row — the pack's coverHalf effect on the Aura of Protection's members until the paladin's next turn start — was: after Divine Smite is cast, the members of the aura gain the pack's Half Cover effect until the paladin's next turn start — a cast rider on the aura's members, `coverHalf` read by the cover machine |
| **Holy Nimbus** | Paladin — Oath of Devotion | ROW | `EMANATIONS` · Inner Radiance (`pulse` at ENEMIES' turn starts: `trigger.on: turnStart` + damage) + `saves` on the member effect | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: for 10 minutes: enemies starting their turn in the aura take the activity's radiant damage (no save); allies in it have Advantage on saves against Fiends and Undead (a `saves` facet with `sourceTypes`) |
| **Inspiring Smite** | Paladin — Oath of Glory | ROW | `REST_GRANTS` · Inspiring Leader's popup (a temp-HP hand-out) `on: "cast"` (Divine Smite) | A7 | UI-shaped, prototype: after Divine Smite, 2d8 + level temp HP DISTRIBUTED among creatures within 30 ft (the paladin too) — a tick per creature, the total split evenly (2026-11-02; a number per creature before), the clock giving all to the paladin |
| **Peerless Athlete** | Paladin — Oath of Glory | NATIVE | — | — | the pack's effect (checks, jumps) |
| **Aura of Alacrity** | Paladin — Oath of Glory | OUT | — | — | speed — movement |
| **Glorious Defense** | Paladin — Oath of Glory | MODULE | `INTERRUPT_ROLLS` · Glorious Defense (`reach: target`, formula `bonus`, `turned: strike`) | A1 | BUILT 2026-09-29 (A1): −Cha off an attack hitting the paladin or a creature within 10 ft of it; turned to a miss, a Strike popup drives one weapon attack at the attacker (moved off the `ac` list — the pack's utility moves no AC) |
| **Living Legend** | Paladin — Oath of Glory | KIND | the `reroll` kind (Indomitable) — `tests: [attack, save]`, once per turn on an attack, a Reaction on a save | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: a missed attack rerolled once per turn; a failed save rerolled as a Reaction; the Charisma checks are the pack's effect |
| **Vow of Enmity** | Paladin — Oath of Vengeance | MODULE | `EFFECT_BENDS` · Vow of Enmity | — | the bend row |
| **Relentless Avenger** | Paladin — Oath of Vengeance | ROW | `CLOCK_RIDERS` · Sentinel's Halt (`judge: "opportunity"`, `lands`) | B4 | BUILT: Halt's shape — the pack's speed-0 effect on an Opportunity Attack's hit, the `halt` clock — was: the pack's speed-0 effect lands on an Opportunity Attack's hit (Halt's clock); the paladin's free move is the table's |
| **Soul of Vengeance** | Paladin — Oath of Vengeance | ROW | `REBUKES` · Sentinel (`ward`, `on: "attack"`) | C1 | BUILT: REBUKES `on: "attack"` with `mark: Vow of Enmity` — the attack card, hit or miss — was: after the creature under the Vow attacks (hit or miss), the paladin within 5 ft is offered one melee attack at it — Sentinel's bystander shape keyed to the Vow's mark, `on: attack` (the attack card, hit or miss) |
| **Avenging Angel** | Paladin — Oath of Vengeance | ROW | `EMANATIONS` · Fear Aura (`trigger.on: enter`, `oncePerTurn`, the activity's Wisdom save) | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: for 10 minutes a 30-ft harmful ring: an enemy ENTERING it saves against Frightened (the pack's effect); the flight is the pack's |
| **Nature's Wrath** | Paladin — Oath of the Ancients | NATIVE | — | — | the pack: a save, Restrained |
| **Undying Sentinel** | Paladin — Oath of the Ancients | ROW | `DROP_TO_ONE` · Relentless Endurance (`ask`, `uses`) — a `heal` facet | C1 | BUILT: the `heal` facet on the ask — was: drop to 1 instead and regain 3 × level (the pack's heal) — asked, once per Long Rest |
| **Elder Champion** | Paladin — Oath of the Ancients | ROW | `TURN_GRANTS` · Regeneration (`grant: heal`, `while`) + `EMANATIONS` · Corona of Light (`saves` Disadvantage) | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: 10 HP at each turn start while the form stands; enemies in the aura save at Disadvantage against the paladin's spells and Channel Divinity (`spells: "source"`); the free-cast spells are the table's |
| **Favored Enemy** | Ranger | NATIVE | — | — | Hunter's Mark's free casts and the RIDERS row |
| **Deft Explorer** | Ranger | OUT | — | — | skills and languages |
| **Relentless Hunter** | Ranger | ROW | `concentration.js` — a `noCheck` row (`spell: "Hunter's Mark"`) | C1 | BUILT: CONCENTRATION_EXEMPTS — the ask machine's first exempt row, a card — was: damage never demands a Concentration save for Hunter's Mark — the ask machine skips the demand, a line on the damage card |
| **Precise Hunter** | Ranger | MODULE | `EFFECT_BENDS` · Precise Hunter | — | the bend row |
| **Foe Slayer** | Ranger | MODULE | `RIDER_UPGRADES` · foe-slayer | — | the d10 replaces the mark's d6 |
| **Primal Companion** | Ranger — Beast Master | OUT | — | — | a summon |
| **Bestial Fury** | Ranger — Beast Master | ROW | `CLOCK_RIDERS` · Dreadful Strikes — the COMPANION as bearer | C1 | BUILT: `owner: "summoner"` + `marked` — the summon's hit reads the ranger's feature, dice and mark through the summon origin — was: measured 2026-09-29 (M0): nothing rides the companion — the pack ships a Damage activity on the RANGER's feature (`@scale.ranger.mark` force) to click by hand; the rider is keyed to the ranger's mark and read off the companion's sheet through the summon's origin (the companion is its own actor); the second strike is OUT (action economy) |
| **Share Spells** | Ranger — Beast Master | OUT | — | — | a second target for a self spell — the table's |
| **Beguiling Twist** | Ranger — Fey Wanderer | ROW | `EFFECT_BENDS` · Brave (`saves` Advantage against Charmed / Frightened) + `INTERRUPT_ROLLS` · Countercharm (`bend: "twist"`, `bystander: 120`, `against`) + `SAVE_PRESSES` · Command (`word.statuses`, `lasts`) | B2 | BUILT: the Advantage is Brave's row; anyone's SUCCEEDED demanded save against Charmed / Frightened within 120 ft asks the ranger (the bystander's row, B1's precedent) — the pack's Save activity at the ranger's TARGET, the failure landing the ranger's word (Charmed or Frightened) for a minute |
| **Fey Reinforcements** | Ranger — Fey Wanderer | OUT | — | — | a summon's free cast |
| **Misty Wanderer** | Ranger — Fey Wanderer | OUT | — | — | free casts — the sheet's |
| **Otherworldly Glamour** | Ranger — Fey Wanderer | NATIVE | — | — | the pack's effect (Charisma checks) |
| **Iron Mind** | Ranger — Gloom Stalker | OUT | — | — | a proficiency |
| **Stalker's Flurry** | Ranger — Gloom Stalker | ROW | `CLOCK_RIDERS` · Dreadful Strikes — a `then` facet (Sudden Strike: a second attack reminder; Mass Fear: the activity's save within 15 ft) | C1 | BUILT: the `follow` facet on Dread Ambusher — Sudden Strike's reminder or Mass Fear's save, one pick on the damage card — was: when Dreadful Strike rides, the card offers Sudden Strike (Hew's reminder: an attack at another creature) or Mass Fear (the pack's Wisdom save demanded of creatures within 15 ft) — one pick |
| **Hunter's Prey** | Ranger — Hunter | MODULE | `CLOCK_RIDERS` · hunters-prey-colossus-slayer (`targetDamaged`, `option`) + `BONUS_SWINGS` · Hunter's Prey (`option`, `near: 5`) | A1 | BUILT 2026-09-29 (A1): the option asked once on the damage offer and kept (ruled); Colossus Slayer 1d8 once per turn on a damaged target; Horde Breaker's reminder with another creature within 5 ft of the target |
| **Defensive Tactics** | Ranger — Hunter | ROW | `EFFECT_BENDS` · Escape the Horde (`target: disadvantage`, `judge: opportunity`) + `INTERRUPT_ROLLS` · Shield's `ac` shape, automatic | B4 | BUILT: Escape the Horde as the gate's `judge: "opportunity"` (an off-turn melee attack, the counted caveat); Multiattack Defense a chip on the ranger against the hitter, −4 pushed onto that attacker's rolls (`plus`, negative, `against: "attacker"`) — was: Escape the Horde: Opportunity Attacks against the ranger at Disadvantage — the gate reads off-turn melee as the judge (Halt's fact); Multiattack Defense: +4 AC against the SAME attacker's later attacks this turn once one hits — an automatic `ac` entry on the hold (no Reaction, no ask: R1) |
| **Superior Hunter's Prey** | Ranger — Hunter | ROW | `CLOCK_RIDERS` · Celestial Revelation's spell pick (the extra to ONE other creature, a button per candidate) | C1 | BUILT: `spread: 30` + `marked` — the spell-pick shape on any damage card, the die rolled at the pick — was: once per turn, the mark's damage to a second creature within 30 ft of the marked one — a pick after the damage lands (the Aasimar's bend row), its own card and receipt |
| **Superior Hunter's Defense** | Ranger — Hunter | ROW | `INTERRUPT_MULTIPLIERS` · Uncanny Dodge (×0.5) on any damage | C1 | BUILT: an INTERRUPT_MULTIPLIERS row with `any` and `effects: "type"` — the hold for a hit, the damage hold for the rest, the typed Resistance landed — was: a Reaction on any damage: resistance to that type until the turn ends — the pack's 13 effects are the types; the hold serves attack damage, `damage-holds.js` the rest (Stone's Endurance's seam) |
| **Hunter's Lore** | Ranger — Hunter | OUT | — | — | information — the table's |
| **Thieves' Cant** | Rogue | OUT | — | — | a language |
| **Cunning Action** | Rogue | NATIVE | — | — | the pack's Hide effect |
| **Reliable Talent** | Rogue | NATIVE | — | — | the pack's effect floors the die (`changedDice` shows it) |
| **Improved Cunning Strike** | Rogue | MODULE | `CUNNING_OPTIONS` (two picks) | — | the menu reads it today |
| **Slippery Mind** | Rogue | OUT | — | — | proficiencies |
| **Elusive** | Rogue | ROW | `EFFECT_BENDS` · Displacement (`match: "feature"`) — a `noAdvantage` facet the gate nets | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: no attack roll against the rogue has Advantage while it is not Incapacitated — the gate lists the sources and nets to Normal at best (`judge: notIncapacitated`) |
| **Stroke of Luck** | Rogue | ROW | `SAVE_SUCCEEDS` · Mage Slayer (the `succeed` fold) — `tests: [attack, save, check]` | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: a failed D20 Test turned into a 20 — the verdict fold widened from saves to attacks and checks, once per rest |
| **Mage Hand Legerdemain** | Rogue — Arcane Trickster | OUT | — | — | the hand's actions — the table's |
| **Magical Ambush** | Rogue — Arcane Trickster | ROW | `EFFECT_BENDS` · Magic Resistance (`saves`, `spells`) with `side: "caster"` and `sourceStatus: "invisible"` | B2 | BUILT: the demand carries the caster's snapshot — the rogue Invisible AS IT CAST: Disadvantage against its spell; visible, nothing |
| **Versatile Trickster** | Rogue — Arcane Trickster | ROW | `ADVANTAGE_BUYS` · Lucky (the gate's buy box) — a `when: "cunning-strike"` facet | C1 | BUILT: a `free` buy box `when: "cunning-strike"` — offered after a Trip or Withdraw this turn — was: Advantage on the next attack this turn against a creature within 5 ft of the Mage Hand after a Trip / Withdraw use — the hand's position is the table's, so the box is offered and the tick is the player's |
| **Spell Thief** | Rogue — Arcane Trickster | NATIVE | — | — | the pack's save; the stolen spell is the table's |
| **Assassin's Tools** | Rogue — Assassin | OUT | — | — | kits |
| **Infiltration Expertise** | Rogue — Assassin | OUT | — | — | out of combat |
| **Envenom Weapons** | Rogue — Assassin | ROW | `CUNNING_OPTIONS` · Poison (`level: 13`) | C1 | BUILT: the Poison option's `upgrade` (the sneak machine) — nothing added — was: the Poison option's 2d6 and the success no longer ending it — the pack's own activity at 13; the row reads the class level |
| **Psychic Blades** | Rogue — Soulknife | NATIVE | — | — | the pack's weapons |
| **Soul Blades** | Rogue — Soulknife | ROW | `D20_FOLDS` · Precision Attack (a die on a MISS) with `tactical`'s spend (the Psionic dice) | B4 | BUILT: Homing Strikes a `tactical` fold with its own tests (`TACTICAL_FOLDS`: attack, the Psychic Blades), the Psionic die on a miss; Psychic Teleportation OUT — was: Homing Strikes: a Psionic die added to a missed Psychic Blade attack, the die spent — the rescue window's row; Psychic Teleportation is OUT (movement) |
| **Fast Hands** | Rogue — Thief | OUT | — | — | action economy |
| **Second-Story Work** | Rogue — Thief | NATIVE | — | — | the pack's effect (speeds) |
| **Use Magic Device** | Rogue — Thief | OUT | — | — | attunement and charges — the sheet's |
| **Thief's Reflexes** | Rogue — Thief | OUT | — | — | two turns in round one — the tracker's, not a moment |
| **Font of Magic** | Sorcerer | NATIVE | — | — | the points and the slot trade are the sheet's; the metamagic machine reads the pool |
| **Metamagic** | Sorcerer | MODULE | `METAMAGIC` | — | all ten options |
| **Sorcerous Restoration** | Sorcerer | OUT | — | — | rest recovery |
| **Sorcery Incarnate** | Sorcerer | OUT | — | — | a points-for-a-use trade — the sheet's |
| **Arcane Apotheosis** | Sorcerer | OUT | — | — | a free option per turn — the sheet's |
| **Telepathic Speech** | Sorcerer — Aberrant Sorcery | OUT | — | — | out of combat |
| **Psionic Sorcery** | Sorcerer — Aberrant Sorcery | OUT | — | — | a points-for-a-slot trade — the sheet's |
| **Psychic Defenses** | Sorcerer — Aberrant Sorcery | ROW | `EFFECT_BENDS` · Brave (`match: "feature"`, `saves` against Charmed / Frightened) | B2 | BUILT: Advantage on saves against Charmed and Frightened — Brave's row twice; the resistance is the sheet's |
| **Revelation in Flesh** | Sorcerer — Aberrant Sorcery | NATIVE | — | — | the pack's effects |
| **Warping Implosion** | Sorcerer — Aberrant Sorcery | NATIVE | — | — | the pack: a save, damage; the teleport is the table's |
| **Restore Balance** | Sorcerer — Clockwork Sorcery | MODULE | `INTERRUPT_ROLLS` · Restore Balance (`bend: neutralise`, `on: both`, `tests: [attack, save, check]`) | A3 | BUILT 2026-09-29 (A3): an attack, a DEMANDED save (the verdict withheld) or a check rolled with Advantage or Disadvantage within 60 ft, asked when the first d20 flips it; after the roll, the first d20 standing — a RULE OF COOL (*Bent by choice*) |
| **Bastion of Law** | Sorcerer — Clockwork Sorcery | TABLE | `WARD_POOLS` · Arcane Ward (the damage-absorbing pool at `dnd5e.preCalculateDamage`) | B4 | BUILT: the ward pool on the "Warded by Law" effect landed on the targeted creature, a d8 per point (the use's scaling), spent as damage lands, gone at 0 — was: a ward of 1–5 d8s on a creature the sorcerer picks (the pack's effect), spent on damage — the pool's second customer; "you can expend" is one sensible answer, so automatic (R1) |
| **Trance of Order** | Sorcerer — Clockwork Sorcery | ROW | `EFFECT_BENDS` · Elusive (`noAdvantage`) + `D20_FOLDS` · the `floor` fold (Starry Form's Dragon) on every D20 Test | C1 | BUILT: `cancel: "advantage"` on the effect table + D20_FLOORS (the platform's `minimum`), Starry Form's Dragon on the same table — was: for 1 minute: attacks against the sorcerer cannot have Advantage; its own D20 Tests treat a 9 or lower as 10 — both facets built by their first customers |
| **Clockwork Cavalcade** | Sorcerer — Clockwork Sorcery | OUT | — | — | a heal, repairs and dispels in a cube — the table's |
| **Draconic Resilience** | Sorcerer — Draconic Sorcery | NATIVE | — | — | the pack's effects (HP, AC) |
| **Elemental Affinity** | Sorcerer — Draconic Sorcery | ROW | `DAMAGE_RULES` · Elemental Adept (`typed` off the feat's name, `spells`) — a `bonus: "@mod"`, `once: "spell"` | B4 | BUILT: a typed `DAMAGE_RULES` row (the type off the copy's name, the type popup), +Cha on one roll of the type per cast — was: measured 2026-09-29 (M0): NOT automatic (five typed Damage activities with `@abilities.cha.mod`, clicked by hand) — one damage-rules row: +Cha to one damage roll of the chosen type per spell (the first part of the type, said on the card); the resistance is the sheet's |
| **Dragon Wings** | Sorcerer — Draconic Sorcery | NATIVE | — | — | the pack's effect (flight) |
| **Dragon Companion** | Sorcerer — Draconic Sorcery | OUT | — | — | a summon's free cast |
| **Tides of Chaos** | Sorcerer — Wild Magic Sorcery | MODULE | `ADVANTAGE_BUYS` · Tides of Chaos | A1 | BUILT 2026-09-29 (A1): the buy box on every D20 Test and the initiative fold; the surge's write-back is A7's |
| **Wild Magic Surge** | Sorcerer — Wild Magic Sorcery | ROW | `cast.js`'s cast riders (the cast slice) + the platform's RollTable (`roll-on-table`) | A7 | UI-shaped, prototype: once per turn after a slot cast, a d20 rolled on the card automatically (R1); a 20 rolls the pack's Wild Magic Surge table and posts it — the effect is the table's to play; a card line on every other face |
| **Bend Luck** | Sorcerer — Wild Magic Sorcery | ROW | `INTERRUPT_ROLLS` · Cutting Words' bystander facets (`bystander: 60`, `tests: [attack, save, check]`, `die: ±d4`, 1 Sorcery Point) | B4 | BUILT: a bystander row whose sign follows the side (`sign: "either"`): −1d4 on a foe's roll, +1d4 on a friend's, a Sorcery Point — was: another creature's attack, save or check within 60 ft: ±1d4 after the roll — the bystander's popup to the sorcerer |
| **Controlled Chaos** | Sorcerer — Wild Magic Sorcery | ROW | the surge rider (Wild Magic Surge) — `twice: true` | C1 | BUILT: `twice` on Wild Magic Surge — two table rolls, the pick on the card — was: two rolls on the table, the sorcerer picks — a two-button popup on the surge card |
| **Tamed Surge** | Sorcerer — Wild Magic Sorcery | ROW | the surge rider — a pick from the table instead of a roll | D1 | BUILT (RULINGS *The PHB classes — D1*) — was: after a slot cast, once per Long Rest, choose an effect from the surge table — the prototype's second scene |
| **Eldritch Invocations** | Warlock | OUT | — | — | the list — each option is its own row below |
| **Pact Magic** | Warlock | NATIVE | — | — | the pact slots |
| **Magical Cunning** | Warlock | OUT | — | — | slot recovery |
| **Contact Patron** | Warlock | OUT | — | — | Contact Other Plane — out of combat |
| **Mystic Arcanum** | Warlock | OUT | — | — | spell selection |
| **Eldritch Master** | Warlock | OUT | — | — | slot recovery |
| **Steps of the Fey** | Warlock — Archfey Patron | MODULE | `EFFECT_BENDS` · Steps of the Fey | — | the bend row; the temp HP is the pack's |
| **Misty Escape** | Warlock — Archfey Patron | ROW | `REBUKES` · Ink Cloud (`self`: a Reaction on taking damage aimed at nobody) | B4 | BUILT: a self rebuke — the feature's Cast activity (Misty Step, no slot) on taking damage, Disappearing Step / Dreadful Step offered after (`follow`) — was: a Reaction when the warlock TAKES damage: Misty Step cast with the Steps of the Fey rider (Invisible / the Frightened save) — the rebukes' seam; ⚠ the Monster Manual's Misty Escape row on `DROP_TO_ONE` is a same-named collision, not this feature |
| **Beguiling Defenses** | Warlock — Archfey Patron | ROW | `INTERRUPTS` `damage` + `INTERRUPT_MULTIPLIERS` · Uncanny Dodge (`0.5`) with `uses`, `at: "attacker"`, `failDamage` | B2 | BUILT (2024's text — the plan drew the 2014 charm reflection): after a hit the damage is halved and the pack's save activity is demanded of the attacker at the cast; a failure deals it Psychic damage equal to the damage taken (read off the hit's receipt); the Charmed immunity is the sheet's |
| **Bewitching Magic** | Warlock — Archfey Patron | OUT | — | — | a teleport — movement |
| **Healing Light** | Warlock — Celestial Patron | NATIVE | — | — | the pack's pool |
| **Radiant Soul** | Warlock — Celestial Patron | ROW | `DAMAGE_RULES` · Elemental Affinity's row (`bonus: "@mod"`, `types: [radiant, fire]`, `once: "turn"`) | B4 | BUILT: a `DAMAGE_RULES` row, +Cha on one radiant or fire roll per turn (a rider chit) — was: +Cha to one radiant or fire damage roll per turn — the damage-rules row with a turn chit; the resistance is the sheet's |
| **Celestial Resilience** | Warlock — Celestial Patron | NATIVE | — | — | temp HP on Magical Cunning and rests — the pack's heal |
| **Searing Vengeance** | Warlock — Celestial Patron | ROW | `DROP_TO_ONE` · Relentless Endurance (`ask`) at the DEATH SAVE (`dnd5e.rollDeathSave`, the vetoable hook) with `ally: 60` | C1 | BUILT: DROP_TO_ONE `on: "deathSave"` — the offer as the death save rolls, half the maximum, the burst and Blinded — was: when the warlock or an ally within 60 ft is about to roll a Death Saving Throw: an OFFER — half the maximum HP back, the burst's radiant damage and Blinded on enemies within 30 ft (the pack's activity at the corpse's position: Death Throes' shape); once per Long Rest |
| **Dark One's Blessing** | Warlock — Fiend Patron | MODULE | `HEAL_ON_HIT` · Dark One's Blessing (`on: kill`, `temphp`, `within: 10`) | A1 | BUILT 2026-09-29 (A1): the pack's heal as Temporary Hit Points when the warlock drops an enemy or anyone does within 10 ft of it (the 2024 text); a drop no card dealt pays nothing (a bend row) |
| **Dark One's Own Luck** | Warlock — Fiend Patron | ROW | `D20_FOLDS` · Tactical Mind (`tactical`: uses through the feature's activity) with `tests: [check, save]` | B4 | BUILT: a `tactical` fold with its own tests (`TACTICAL_FOLDS`: check, save), the d10 through the Luck activity's use, no refund clause — was: a d10 added to a check or save after the roll, the feature's uses paid — the `tactical` spend widened by a `tests` facet; offered on the withhold for a demanded save, in the rescue window for a check |
| **Fiendish Resilience** | Warlock — Fiend Patron | NATIVE | — | — | the pack's twelve effects (the pick is the sheet's) |
| **Hurl Through Hell** | Warlock — Fiend Patron | ROW | `HIT_OPTIONS` · Stunning Strike (a hit-menu row, once per turn, the item's uses) | C1 | BUILT: a HIT_GROUPS + HIT_OPTIONS pair — the save activity the cost — was: on a hit: the target's Charisma save (the pack's activity), the 8d10 psychic on a failure; the removal and the return are the table's — a line |
| **Awakened Mind** | Warlock — Great Old One Patron | OUT | — | — | telepathy |
| **Psychic Spells** | Warlock — Great Old One Patron | ROW | `METAMAGIC` · Transmuted Spell (`TRANSMUTED_TYPES`, the cast dialog's group) as a FEATURE row with no cost | A4 | any Warlock spell dealing damage may deal Psychic instead: a tick in the cast dialog (Transmuted's machine, no Sorcery Point, the type fixed); the components half is OUT |
| **Clairvoyant Combatant** | Warlock — Great Old One Patron | MODULE | `EFFECT_BENDS` · Clairvoyant Combatant | — | the bend row |
| **Eldritch Hex** | Warlock — Great Old One Patron | ROW | `EFFECT_BENDS` · Irresistible Dance (`saves.abilities`) ×6 — "Hexed <Ability>", `sourceFeature: "Eldritch Hex"` | B2 | BUILT: six rows, one per Hexed effect, the ability the row's; the bend only where the Hex's SOURCE holds the feature |
| **Thought Shield** | Warlock — Great Old One Patron | NATIVE | — | — | the pack's effect (resistance); the reflected psychic damage is the table's |
| **Create Thrall** | Warlock — Great Old One Patron | ROW | `CLOCK_RIDERS` · Bestial Fury's companion row | C1 | BUILT: Bestial Fury's summoner row on the Hex — was: a summon's free cast (NATIVE); measured 2026-09-29 (M0): the extra psychic is a Hex Damage activity on the WARLOCK's feature (1d6, by hand) — the rider on the summoned Aberration, Bestial Fury's shape; ⚠ the pack's Thrall Temporary HP formula misspells `@abilitis.cha.mod` (a data defect for Errata 5e — the warlock level alone rolls; not By the Books') |
| **Arcane Recovery** | Wizard | OUT | — | — | slot recovery |
| **Ritual Adept** | Wizard | OUT | — | — | ritual casting |
| **Scholar** | Wizard | OUT | — | — | a proficiency |
| **Memorize Spell** | Wizard | OUT | — | — | preparation |
| **Spell Mastery** | Wizard | NATIVE | — | — | free casts |
| **Signature Spells** | Wizard | NATIVE | — | — | the pack's free casts |
| **Arcane Ward** | Wizard — Abjurer | TABLE | `WARD_POOLS` (new; the seam `dnd5e.preCalculateDamage` — Heavy Armor Master's `block`, so the card's own buttons carry it) | A5 | a pool of HP on the wizard (the item's own uses: max 2 × level + Int), absorbing damage AUTOMATICALLY before it lands (R1: the ward has no choice), refilled by 2 × the slot level on each Abjuration cast (a cast rider), the receipt saying what the ward took; the ward's pop over the token |
| **Projected Ward** | Wizard — Abjurer | ROW | `INTERRUPT_REDUCTIONS` · Interception (`ally`, `reach: 30`) drawing from the ward pool (`pool: "ward"`) | B4 | BUILT: a guard on ANY damage within 30 ft drawing on the wizard's Arcane Ward (`pool: "ward"`), as much as it holds — was: a Reaction when a creature within 30 ft takes damage: the ward absorbs it instead — the guard's shape on the damage claim, the pool spent |
| **Spell Breaker** | Wizard — Abjurer | NATIVE | — | — | Counterspell and Dispel Magic — the spells register's |
| **Spell Resistance** | Wizard — Abjurer | ROW | `EFFECT_BENDS` · Magic Resistance (`match: "feature"`, `saves: { bend: advantage, spells: true }`) | C1 | BUILT: Magic Resistance's row on the feature — was: Advantage on saves against spells — Magic Resistance's row on a PC feature; the resistance to spell damage is the table's (no seam tells a spell's damage from a trait's on every path) |
| **Portent** | Wizard — Diviner | ROW | `STORED_DICE` (new; the rest's d20s kept on a chip) + `INTERRUPT_ROLLS` `bend: "set"` · Cutting Words (the bystander's bend) — measured (A7): no `set` kind | A7 | UI-shaped, prototype: the two d20s rolled at the Long Rest (the rest card), kept as chips; any attack, save or check the wizard can see — its own, an ally's or an enemy's — may be REPLACED by one before or after the roll: offered as a bystander row (the gate's section for its own rolls; the bystander's popup for others'); Greater Portent is the third die |
| **Expert Divination** | Wizard — Diviner | OUT | — | — | slot recovery on a cast |
| **The Third Eye** | Wizard — Diviner | NATIVE | — | — | the pack's effects (senses) |
| **Greater Portent** | Wizard — Diviner | ROW | Portent's row — `dice: 3` | C1 | BUILT: the `more` facet on Portent's row — was: three dice at the rest |
| **Potent Cantrip** | Wizard — Evoker | ROW | `EVASIONS` · Evasion — the mirror on the CASTER: `side: "caster"`, `onSuccess: 0.5` | A4 | a cantrip's successful save still takes half (and the pack's failure effects are unchanged) — the verdict's multiplier keyed to the caster's feature, no choice (R1) |
| **Sculpt Spells** | Wizard — Evoker | ROW | `METAMAGIC` · Careful Spell (the ask at the area, `area-ask.js`) as a FEATURE row (`cap: "1 + @slot"`, no cost) | B4 | BUILT: a free `METAMAGIC` row riding Careful's ask (`asks: "careful"`) on the wizard's Evocation spells, the cap 1 + the slot — was: an Evocation spell: up to 1 + the slot level creatures picked on the card succeed automatically and take NO damage — Careful's ask with a `none` outcome, no point spent |
| **Empowered Evocation** | Wizard — Evoker | ROW | `DAMAGE_RULES` · Elemental Affinity's row (`bonus: "@abilities.int.mod"`, `school: "evo"`, `once: "spell"`) | B4 | BUILT: a `DAMAGE_RULES` row, +Int on one roll of a Wizard Evocation per cast — was: +Int to one damage roll of an Evocation spell — the damage-rules row |
| **Overchannel** | Wizard — Evoker | WAITS | `dice-changers.js` · Empowered Spell (`max` the dice) + a self-damage clock on later uses | — | maximum damage on a level 1–5 spell once free, then 2d12 necrotic per spell level to the wizard per use before a Long Rest (a counter on the feature) — a dice-changers row with a `max` outcome and a `SELF_DAMAGE` rider; one customer, held for its player |
| **Improved Illusions** | Wizard — Illusionist | OUT | — | — | components and range — the table's |
| **Phantasmal Creatures** | Wizard — Illusionist | OUT | — | — | summons |
| **Illusory Self** | Wizard — Illusionist | MODULE | `INTERRUPTS` · Illusory Self (`ac`) | — | the hold row; the miss it forces is the `ac` hold's negate |
| **Illusory Reality** | Wizard — Illusionist | OUT | — | — | an illusion made real — the table's |
| **Armor of Shadows** | Options | OUT | — | — | a utility cast |
| **Eldritch Mind** | Options | NATIVE | — | — | measured 2026-09-29 (M0): the transferred effect writes `system.attributes.concentration.roll.mode` +1 — the platform rolls it, the gate lists it (War Caster's key) |
| **Pact of the Blade** | Options | NATIVE | — | — | the conjured weapon |
| **Pact of the Chain** | Options | OUT | — | — | a familiar |
| **Pact of the Tome** | Options | OUT | — | — | cantrips and rituals |
| **Divine Order: Protector** | Options | OUT | — | — | proficiencies |
| **Divine Order: Thaumaturge** | Options | NATIVE | — | — | the pack's effect |
| **Primal Order: Magician** | Options | NATIVE | — | — | the pack's effect |
| **Primal Order: Warden** | Options | OUT | — | — | proficiencies |
| **Lessons of the First Ones** | Options | OUT | — | — | an origin feat — Slice A's |
| **Mask of Many Faces** | Options | OUT | — | — | a utility cast |
| **Misty Visions** | Options | OUT | — | — | a utility cast |
| **Otherworldly Leap** | Options | OUT | — | — | a utility cast |
| **Repelling Blast** | Options | MODULE | `CLOCK_RIDERS` · repelling-blast (`enchant`, `maxSize`, `says`) | A1 | BUILT 2026-09-29 (A1): a card line per beam on the enchanted cantrip (else Eldritch Blast), Large or smaller; the token never moved (a bend row) |
| **Commanding Presence** | Options | MODULE | `SUPERIORITY_FOLDS` · Commanding Presence | A1 | BUILT 2026-09-29 (A1): Tactical Assessment's scoped fold on Intimidation, Performance or Persuasion |
| **Ascendant Step** | Options | OUT | — | — | a utility cast |
| **Eldritch Smite** | Options | ROW | `HIT_OPTIONS` · Stunning Strike's group shape — a NEW cost kind, a Pact slot (`pool: "pactSlot"`) | B4 | BUILT: a hit-menu group paid by a Pact slot (`pool: "pactSlot"` — every slot one level, no picker), the pact weapon judged by Pact of the Blade's bond (none bonded: any weapon, the caveat), Prone on Huge or smaller — was: on a pact-weapon hit, once per turn: 1d8 + 1d8 per slot level force, Prone if Huge or smaller (`maxSize: "huge"`, `press: prone`) — the slot the cost, picked on the row (the lowest by default, Q8) |
| **Gaze of Two Minds** | Options | OUT | — | — | out of combat |
| **Gift of the Depths** | Options | OUT | — | — | movement and breathing |
| **Investment of the Chain Master** | Options | OUT | — | — | the familiar's sheet |
| **Master of Myriad Forms** | Options | OUT | — | — | a utility cast |
| **One with Shadows** | Options | OUT | — | — | Invisible while still in darkness — the table's |
| **Thirsting Blade** | Options | NATIVE | — | — | Extra Attack with the pact weapon — action economy |
| **Blessed Strikes: Potent Spellcasting** | Options | ROW | `DAMAGE_RULES` · Elemental Adept (`spells: "cantrip"`, `bonus: "@abilities.wis.mod"`) | B4 | BUILT: a `DAMAGE_RULES` row (`spells: "cantrip"`, `classes: [cleric]`), +Wis on the roll — was: measured 2026-09-29 (M0): NOT automatic — the pack's Damage activity rolls the Wisdom modifier alone, clicked by hand; one damage-rules row on the cleric's cantrips (the option row; its parent Blessed Strikes names the pick) |
| **Elemental Fury: Potent Spellcasting** | Options | ROW | `DAMAGE_RULES` · Blessed Strikes: Potent Spellcasting's row | B4 | BUILT: a `DAMAGE_RULES` row (`spells: "cantrip"`, `classes: [druid]`), +Wis on the roll — was: measured 2026-09-29 (M0): NOT automatic (no activity at all; the pack's note says so) — the druid's cantrips, the same row shape |
| **Whispers of the Grave** | Options | OUT | — | — | a utility cast |
| **Gift of the Protectors** | Options | ROW | `DROP_TO_ONE` · Relentless Endurance (`ask`) for the NAMED creatures (`named: true`) | B4 | BUILT: a `named` drop row — the dropped creature's name in the feature's description on a character's sheet, Protect's use the once, the card names the keeper — was: a creature whose name is in the Book of Shadows drops to 1 instead of 0, once per Long Rest — the names are a list the warlock keeps on the feature (the tome's description read as data), the drop machine's row on each |
| **Lifedrinker** | Options | ROW | `CLOCK_RIDERS` · Dread Ambusher (`when: oncePerTurn`, the pact weapon a `weapon` judge, the type a pick) | B4 | BUILT: a clock rider on the pact weapon (`enchantBy: "Pact of the Blade"`), the type the activity's first (necrotic), the Hit-Die heal OFFERED on the damage card — was: 1d6 necrotic / psychic / radiant once per turn on a pact-weapon hit (the type the activity's first, said on the card — the rider ruling) and 1d6 healing when Bloodied — the heal a receipt on the same card |
| **Visions of Distant Realms** | Options | OUT | — | — | a utility cast |
| **Devouring Blade** | Options | NATIVE | — | — | action economy |
| **Witch Sight** | Options | NATIVE | — | — | the pack's effect (Truesight — the gate's `sightOf` reads it) |
| **Epic Boon** | Options | OUT | — | — | out by ruling (RULINGS *The PHB feats — the scope*) |
