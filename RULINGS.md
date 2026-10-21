# RULINGS.md — the feature rulings

> **What each feature does, as the user ruled it, and what pins it.** One section per feature.
> Each records the ruling with its date, the mechanism it settled (the table, the file), and the
> suite or test that holds it. The reasons a thing is NOT done live in [DESIGN.md](DESIGN.md) §8
> *Settled*; the structure lives in [ARCHITECTURE.md](ARCHITECTURE.md); platform facts in
> [NOTES.md](NOTES.md). The narrative of how each ruling was reached is in git history.
>
> The binding rules every section applies: R1 automate outcomes, never decisions; N1 amounts
> are read from the content, never stored; R4 mechanisms in code, membership in data; R5 every
> application is receipted. A ruling here that seems to bend one of those is the exception the
> user made, and it says so.

---

## Where the table bends the rule (the register, 2026-09-24)

**Every place the module plays a rule other than as written, one row each.** User, 2026-09-24:
*"i'm sure stuff like that will happen again... where its impossible to follow the RAW. gotta
keep those 'modifications' recorded"*. ⚠ **A STANDING RULE: a new bend adds its row here IN THE
SAME COMMIT as its code.** A bend with no row is a bug in this file. The reasons a thing is not
done at all stay in DESIGN §8; this is what IS done, differently from the page.

| The rule as written | What the module does | Why the platform forces it | Since |
| --- | --- | --- | --- |
| **Shield**: "when you are hit" (2024: hit by an attack roll) — and every AC reaction beside it | offered after the roll shows a hit, before the damage | the defender's client cannot pause the attacker's roll: `dnd5e.preRollAttack` runs synchronously on the attacker's client, so the hold is stamped on the hit (`hold/trigger.js`) | 2026-08-15 (Phase 1.5, v1.1.0 — the hold's birth, `hold/index.js`) |
| **Lucky**: Disadvantage "when a creature rolls a d20 for an attack roll against you" | offered after the hit, before the damage — a second d20, the lower standing | the same | 2026-09-24 |
| **Fire Aura, Flame Aura, Heat Aura**: nonmagical fire at the bearer's turn end | the pulse lands its damage as MAGICAL (Inner Radiance's `mgc` property on every pulse) | one pulse for the ring's rows; a Resistance to nonmagical damage would not apply to it — the platform reads the property, not the source | 2026-09-28 |
| **Warding Flare**: light flares "before it hits or misses" | offered after the hit | the same | 2026-09-24 |
| **Shadowy Dodge**: "when a creature makes an attack roll against you" | offered after the hit | the same | 2026-09-24 |
| **Protection** (the Fighting Style): "when a creature you can see attacks a target other than you" | offered to the guard after the roll shows a HIT, before the damage — the second d20, the lower standing (ruled R1, 2026-09-26); a miss asks nothing | the same (`hold/trigger.js` stamps the guards on the held target) | 2026-09-26 |
| **Protection** and **Interception**: "a creature you can see" · "another creature within 5 feet of you" | every creature within 5 feet of the one hit, on ITS side of the table (token disposition), not Incapacitated, holding what the style demands, is asked; sight is not judged | nothing the module reads says who can see whom; the side is the fact it can read, and the owner who cannot see simply passes (`geometry.js` `alliesWithin`) | 2026-09-26 |
| **Interception**: "reduce the damage dealt to the target" when an attack hits it | the attack's damage is held at the module's applier and each guard asked (P1); damage applied with the card's own buttons, or typed on a sheet, is not held | the applier's claim is the only seam where the damage waits (`damage-holds.js`, Stone's Endurance's shape) | 2026-09-26 |
| **Dueling, Defense, Great Weapon Fighting, Two-Weapon Fighting, Unarmed Fighting, Protection, Interception, Heavy Armor Master**: what you are "holding" / "wearing" | read off the sheet's EQUIPPED boxes; a Versatile weapon's grip is the attack's own mode (one hand or two) | the sheet has no hands — Equipped is the one fact dnd5e keeps about what is held (ruled off the prototype, 2026-09-26: "gate it on what pc is holding") | 2026-09-26 |
| **Unarmed Fighting**: "1d4 Bludgeoning damage to one creature Grappled by you" at the start of each of your turns | asked of the owner (ruled U1: Deal it / Skip), the clock dealing it; "grappled by you" is the Grappled effect's own provenance (the module's source stamp, else its origin's actor); a Grappled that names no grappler is OFFERED when it stands within 5 feet, and never dealt by the clock | the Grappled condition carries no grappler of its own — a status toggled from the token HUD says nothing about who holds it (`damage-rules.js` `grapplerOf`) | 2026-09-26 |
| **Warding Flare** protects any creature the Cleric can see within 30 feet | protects its OWNER only | the hold is stamped per DEFENDER: only a hit target's own sheet is read for rows (`hold/lookup.js` `rollRescuesOf`) — a known gap, DESIGN §8 | 2026-09-24 |
| **Stone's Endurance**: "when you take damage" (any damage) | ASKED in one popup, and on the click the damage lands reduced by the roll (user, 2026-09-25: "the popup for stones endurance should show up, and if hte person rolls, then the damage is auto reduced"): an attack hit asks at the hit (the hold); every other damage the MODULE applies is held at its applier until the answer (`damage-holds.js`); damage applied with the card's OWN buttons or typed on a sheet is reduced by hand | only the module's own applier can make a number wait: the card's buttons call `Actor#applyDamage` straight, and `dnd5e.preApplyDamage` is synchronous — no popup can be answered inside it (`auto-apply.js` `registerDamageClaim`) | 2026-09-24; widened 2026-09-25 |
| **Powerful Build**: Advantage on "any ability check you make to end the Grappled condition" | while the Goliath IS Grappled, its Athletics and Acrobatics checks have Advantage, whatever they are for | nothing tells an escape check from any other check the module meets (`EFFECT_BENDS` `checksWhen`); the bearer's status and the escape's two skills are the facts it can read | 2026-09-25 |
| **Storm's Thunder, Hellish Rebuke, Fount of Moonlight, Retaliation, Sword of Answering** — a Reaction when a creature damages you | offered only when the damage names its dealer: the card it came from (any application with an originating card — the module's, or the card's own buttons); an HP typed on a sheet offers nothing | `dnd5e.applyDamage` knows the dealer only through `originatingMessage`; a sheet edit carries none (`rebukes.js`) | 2026-09-25 |
| **Polymorph**: "the target must succeed on a Wisdom saving throw or shape-shift" | the spell's save is its own demand card; the transform activity's use transforms whoever is targeted at that use, save or no save — the caster targets the ones who failed | the save activity and the transform activity are two uses on two cards, and nothing on the transform's card names the save's verdict (`transforms.js`, RULINGS *Wild Shape and the polymorph spells*) | 2026-10-11 |
| **Animal Shapes**: "you can choose a different form for each target" | one form for every creature targeted at a use; a second form is a second use (the Follow Up Transformations activity) on fewer targets | the one popup asks one form; a form per target is a picker per row the ruled gallery does not draw | 2026-10-11 |
| **Polymorph on an enemy**: the GM may override the caster's pick "before the elect transforms" (the ruling) | the GM changes the form from the card AFTER the landing — the creature reverts and takes the new form | a hold before every transform would be a required GM click on every Wild Shape (N4); the change after costs the GM one click only when wanted | 2026-10-11 |
| **Trip Attack and Hill's Tumble on one hit** (the rules allow a maneuver and the boon together) | one hit-menu pick per hit; a clock rider (Fire's Burn, Frost's Chill) still rides beside any pick | the pick is ONE record (`hitPick` → `hitManeuver`), so a second pick would be dropped in silence (`decide/hit-menu.js` `hitPick`); the array shape is BACKLOG's | 2026-09-24 |
| **Undead Fortitude**: "unless the damage is Radiant or from a Critical Hit" | the exemption is read off the damage card (its rolls' types, the crit off its rolls or the attack it answers); damage with no card the module can read — typed on a sheet, applied by a macro — COUNTS the row and the save rolls | the seam (`dnd5e.preApplyDamage`) knows the type and the crit only through `originatingMessage`; the gate never guesses an exemption (DESIGN R1) | 2026-09-28 |
| **Death Throes**: "each creature in a 30-foot Emanation" | every creature WITH Hit Points within the Emanation is asked; a creature at 0 is not | the dead-target gate: a demand on a 0-HP creature starves the machine (`saves/demand.js`); the corpse's reach is measured edge to edge from the token's squares (`geometry.js` `creaturesWithin`) | 2026-09-28 |
| **Emanation** (PHB): its area "doesn't include its origin creature or object unless its creator decides otherwise" | a save area that starts on its user (a `radius` or `emanation` template at range self, listed or not: Arms of Hadar, Thunderclap) never puts its caster in the demand, the Metamagic ask or a re-read of the area; the caster cannot opt in | no seam asks the caster about themself, and no 2024 spell wants it (`decide/emanations.js` `selfEmanation`) | 2026-10-19 |
| **Greater Magic Resistance**: "the attack rolls of spells automatically miss it" | the save cannot fail (the Succeeds button); a spell attack rolls as any attack — the miss is the table's | the attack gate has no auto-miss verdict; one customer, the row's caveat says so | 2026-09-28 |
| **Regeneration**: "if it takes Acid or Fire damage, this trait doesn't function on its next turn" | the block is read off the receipts the MODULE wrote since the bearer's last turn started; damage applied with the card's own buttons or typed on a sheet writes no receipt and blocks nothing | only the module's applier receipts the type (`auto-apply.js`); a sheet edit carries none | 2026-09-28 |
| **Warding Charm, Jinx**: on a failed save "the attack misses instead" | the save is put to the attacker AFTER the hit's damage has landed; a failure's miss is the table's (revert the receipt from the card) | the rebukes' seam is `dnd5e.applyDamage` — the one that knows the dealer; the hold's seam knows the hit but no save can pause the attacker's damage roll on the defender's client | 2026-09-28 |
| **Instinctive Charm** (Arcana Unleashed): "when a creature … hits you with an attack roll … on a failed save, the attack misses instead" | Warding Charm's road: the save after the damage landed; the miss and the redirect to another creature are the table's | the same | 2026-10-02 |
| **Fiendish Blood**: a save "each creature of the sahuagin's choice in a 10-foot Emanation" on taking Piercing or Slashing | not built — use the trait from the sheet | a Reaction whose answer is an Emanation save with a pick has no machine: Death Throes' corpse save asks everyone, a rebuke aims at one | 2026-09-28 |
| **Brave / Fey Ancestry / Dwarven Resilience** on a save to END the condition | the row is listed on the gate, not counted — except on a repeat the module raises itself (`REPEAT_SAVES`, 2026-09-28), whose demand says what it is against: there the row COUNTS | an end-of-turn repeat rolled from the sheet is a bare roll with no demand to read what it is against (R1: never guessed) | 2026-09-24; narrowed 2026-09-28 |
| **Disadvantage imposed on an attack rolled WITH Advantage** (the two cancel) | the plain roll is the FIRST d20 rolled — the first face a reroll modifier did not replace — and no second d20 is rolled | both dice are already on the table, and the first was chosen before anyone saw a face (`decide/rescue-hit.js` `d20Faces`, `disadvantageOutcome`) | 2026-09-24 |
| **A critical hit** when a live Disadvantage row could undo it | the damage is NOT rolled at the hit; it is rolled once after the answer, doubled only if the crit still stands for every hit target | doubled dice rolled before the answer would be discarded the moment the second d20 comes up lower (`hold.critAtStake`, `auto-damage.js` `damageAfterHold`) | 2026-09-24 |
| **Heroic Inspiration, Precision Attack, Graze** once a defender's Lucky (or any `roll` row) turned the hit into a miss | not offered to the attacker | the attacker's rescues are offered at `dnd5e.rollAttack`, where the roll was a hit; nothing re-offers them after the hold's verdict — a known gap, DESIGN §8 (Graze already had it for Shield, `mastery.js`) | 2026-09-24 |
| **Lucky**: Advantage "when you roll a d20 for a D20 Test" — chosen as you roll | in the roll dialog: a box with a tick, spent when the roll goes out ticked (`advantage-buys.js`). An initiative rolled with NO dialog (the carousel, Roll All) is offered it AFTER the roll — a second d20, the higher standing — so the player has seen the first die when choosing (ruled "After the roll", 2026-09-25) | `Combat#rollInitiative` rolls with no pause before its dice and no hook that can wait for an answer (`dnd5e.preConfigureInitiative` is synchronous), so no popup can come before that roll (`d20-folds.js` `ADVANTAGE`) | 2026-09-25 |
| **Relentless Endurance** ("when you are reduced to 0 Hit Points") and **Death Ward** ("the first time the target would drop to 0 Hit Points") | caught on DAMAGE applied through the system's damage application — the module's applier and the card's own buttons: the Hit Points are written as 1 in that same update (Death Ward automatic, the effect removed; Relentless Endurance held at 1 while its popup asks, and the clock's pass lands the 0). Hit Points typed on a sheet, or a drop to 0 with no damage, are the table's | `dnd5e.preApplyDamage` is the one place a drop can be changed before it lands, and it is synchronous — the ask has to stand at 1, not at 0; a sheet edit carries no damage to read (`drop-to-one.js`) | 2026-09-25 |
| **Celestial Revelation's extra damage** on a spell with no attack roll: dealt "when you deal damage to it", with the spell | offered on the spell's card once its damage has landed; the pick lands as its OWN damage (its own card and receipt) — a concentrating target makes a second Constitution save for it | the extra goes to ONE of the spell's targets, the caster's pick, and the spell's damage is one roll applied to all of them: it cannot ride the roll, and the spell's receipt is keyed by creature, so an entry there would overwrite the spell's own (`clock-riders.js`) | 2026-09-25 |
| **Heavy Weapon Mastery** (Great Weapon Master): "as part of the Attack action on your turn" | +Proficiency Bonus on every damage roll of a Heavy weapon's attack on the owner's own turn — Hew's Bonus Action swing included; a combat that holds the owner on another's turn (an Opportunity Attack) adds nothing and the card says "off — not your turn" | nothing on a damage roll says which action the attack was part of: Hew's swing is the same weapon's same attack activity (`damage-rules.js` `ownTurnOf`, the `heavy` gate) | 2026-09-26 |
| **Heavy Armor Master**: "when you're hit by an attack" | the cut is taken on damage from an ATTACK's damage card (its activity an attack, or a card answering one), through the module's applier or the card's own buttons; a save's, an area's or a rider's damage is never cut, and neither is a number typed on the token bar or the sheet. "Any Bludgeoning, Piercing, and Slashing damage … is reduced by" one Proficiency Bonus in all, not one per type | the damage application knows only the card it came from (`originatingMessage`); a bare number carries none (`damage-rules.js`, `dnd5e.preCalculateDamage`) | 2026-09-26 |
| **Mage Slayer**'s Concentration Breaker: "When you damage a creature that is concentrating" | the concentration save is at Disadvantage when the damage came from a CARD whose speaker holds the feat — the module's applier or the card's own buttons; damage typed on a sheet names no dealer and breaks nothing | `dnd5e.preApplyDamage` knows the dealer only through `originatingMessage` (`concentration.js` `breakerFor`, the rebukes' floor) | 2026-09-27 |
| **Sentinel**'s Guardian: "Immediately after a creature within 5 feet of you takes the Disengage action or hits a target other than you with an attack" | asked when the hit's DAMAGE lands, with the card it came from, of a bystander on another side of the map (token disposition); a hit that deals no damage, damage typed on a sheet, and a Disengage ask nothing; a friend's hit is not asked (ⓐ — noise) | the landing is where a hit is final (after any reaction that could still turn it) and where its card names the hitter (`rebukes.js` `stampWards`); nothing records a Disengage (NOTES §2) | 2026-09-27 |
| **Sentinel**'s Halt: "When you hit a creature with an Opportunity Attack" | due on the Opportunity Attack the module drove (its cards say so) AND on any melee hit the Sentinel makes off its own turn in a running combat — ticked on the damage offer, with the caveat "only on an Opportunity Attack" | an Opportunity Attack made from the sheet is an ordinary attack roll: nothing marks it; off-turn melee is the fact the module can read (`clock-riders.js`, `judge: "opportunity"`) | 2026-09-27 |
| **Polearm Master**'s Reactive Strike: "a creature that enters the reach you have with that weapon" — the attack happens as it enters | a REMINDER as the hostile's move crosses into the reach ring (Foundry splits the move there, so a pass-through is caught), while the move itself carries on; the attack is made from the sheet after | holding the mover at the edge for the answer would need Foundry's `pauseMovement`, callable only on the MOVING user's client — movement pauses are out of scope (DESIGN §8) (`emanations.js` `maybeAlert`) | 2026-09-27 |
| **Chef**'s Replenishing Meal: food cooked "as part of a Short Rest"; "At the end of the Short Rest, any creature who eats the food and spends one or more Hit Dice" regains 1d8 | the Chef picks the eaters AFTER its own Short Rest; an eater whose Short Rest already ended in the same sitting (the same Rest request, else within two hours) is healed then if it spent a Hit Die; one still resting is healed as its own rest ends | every creature rests on its own client, in any order, and dnd5e's rest card states the Hit Dice spent only in words — the module stamps its own record on each Short Rest card (`rest-grants.js` `restSpent`, `decide/rest-grants.js` `mealStanding`) | 2026-09-27 |
| **Command**: the word is spoken as the spell is cast | asked of the caster when the target's save FAILS (a success asks nothing): Approach / Flee / Grovel / Halt in one popup; Grovel presses Prone (receipted), the other three are the table's to play; the clock defaults to Halt | the verdict pass is the one seam that can hold a consequence for an answer (`saves/choices.js`, the bash's shape), and the word changes nothing the save reads | 2026-09-28 |
| **Fear**: the target repeats the save "if it doesn't have line of sight to you" | demanded at every turn end, the clause said on the card; a success the creature should not have had is reverted from the cast card by hand | sight is nothing the module reads (`REPEAT_SAVES` `caveat`) | 2026-09-28 |
| **Beacon of Hope**: "regains the maximum number of Hit Points possible from any healing" | healing the MODULE lands through the cast path (a healing spell aimed at the creature) is raised to the roll's maximum, the receipt saying so; healing applied with a card's own buttons, by a kit, an aura or a sheet edit is not | only the module's own applier can change a number as it lands (`cast.js`, `HEAL_REROLLS` `max`) | 2026-09-28 |
| **Sanctuary**: the spell ends if the warded creature "deals damage" | the bearer's own DAMAGE ROLL ends it (an attack roll and a cast end it as written) | the applier knows a damage's dealer only through its originating card, and not on every path; the bearer's damage roll is the fact read on all of them (`wards.js`, `dnd5e.rollDamage`) | 2026-09-28 |
| **Sanctuary**: on a failed save the attacker must "choose a new target or lose the attack or spell" | the use is VETOED before it rolls or casts: nothing is spent — no attack, no slot — and the attacker aims again or lets it go; "lose the spell" (the slot) is not enforced | the veto (`dnd5e.preRollAttack`, `dnd5e.preUseActivity`) is the one seam before the roll, and it stops the use before the platform consumes anything; spending a slot on a cast that never happened would be a hand-written deduction (`wards.js`) | 2026-09-28 |
| **Mirror Image**: "each time a creature hits you with an attack roll" — the duplicates before anything else | rolled AFTER the defender's held reactions resolve (Shield, Lucky, a guard), only if the hit still stands | the hold is the seam where a hit waits; the duplicates ride it as an entry of their own, and rolling before the answer would burn a duplicate on a hit a Shield then turns (`hold/continue.js`) | 2026-09-28 |
| **Spike Growth**: "for every 5 feet it travels" — as it goes | paid ONCE when the move lands, for the feet the platform's split of the move says were inside (floor(feet ÷ 5) × 2d4, one roll); the mover is never stopped or asked | the region events fire after the move is committed, and holding the mover would need the moving client's `pauseMovement` — movement pauses are out of scope (DESIGN §8) (`emanations.js` `maybeMoveDamage`) | 2026-09-28 |
| **Wall of Fire**: "within 10 feet of that side" of a 1-foot wall | the region is WIDENED by 10 feet on one side — away from the caster by default, flipped on the cast's card by compass name; the ring burns outside as a 10-foot ring, inside as the disc | a region knows only who stands inside it: the burning band has to BE the region (`decide/emanations.js` `bandShape`); "selected by you when you cast" has no seam before the placement, so the default is the far side and the card is the pick | 2026-09-28 |
| **Warding Bond**: the caster takes "the same amount of damage"; the spell ends "if you and the target become separated by more than 60 feet" or at a re-cast | the same NUMBER, applied untyped (no second resistance); beyond 60 feet at the moment damage lands nothing is shared and the card says so, but the bond STANDS — its end by distance, and by a re-cast on either creature, is the table's (delete Bonded); the caster's drop to 0 ends it | the applier knows the amount that landed, not why; nothing watches two tokens' distance between damages, and a re-cast lands a second Bonded the pack does not tie to the first (`damage-shares.js`) | 2026-09-28 |
| **Prismatic Spray**, the violet ray: "makes a Wisdom saving throw at the start of your next turn … on a failed save the creature teleports to another plane" | the ray's Blinded lands on a failed Wisdom save (the ray's own activity); the LATER save is the table's | the pack clocks Teleporting (Violet) to end at the caster's next turn start — dnd5e's own expiry, judged on the same combat edge the repeat would need, and the effect may be gone before a demand could name it; a plane shift is nothing the module plays (`RAY_TABLES`) | 2026-09-28 |
| **Cutting Words** ("makes a damage roll or succeeds on an ability check or attack roll") and **Guided Strike** ("misses with an attack roll") — another creature's roll | offered after the roll shows its verdict, before the damage; a hit or a miss is held for the bystander (`hold/trigger.js`), a check is offered on its own card | the roller's client cannot be paused by another player's Reaction (Shield's row) | 2026-09-29 |
| **Every bystander's "a creature you can see within N feet"** (Cutting Words, Guided Strike, Restore Balance) | every creature on the right side of the table (token disposition) within the feet of the ROLLER, not Incapacitated, its Reaction free and a use left, is asked; sight is not judged | nothing the module reads says who sees whom; the side and the distance are the facts it can read (Protection's row) | 2026-09-29 |
| **Cutting Words' damage half** ("makes a damage roll … reducing the damage") | offered on the attack card only where a hold already stands for the hit (another reaction asked); a hit nobody else is asked about lands whole — **superseded 2026-10-14**: asked at the damage hold on every foe's hit, with the mutes (*The asks widened*) | the ruled noise gate (Q2 option A): no hold opens for a bend that cannot change the verdict, and without a hold the damage has already landed when a card button could be pressed | 2026-09-29 |
| **Portent**: "you must choose to do so before the roll" — another creature's D20 Test | offered AFTER that roll, the faces that turn it shown: a demanded save that a stored face turns asks the diviner (the save's verdict waits); an attack asks only on a critical hit, an ordinary hit a face would turn keeps the card row where a hold already stands; the diviner's OWN rolls keep the rule's order (a tick in its roll dialog, before the roll); since 2026-10-14 a check or a save whose roll carries a DC asks like a demanded save (*Portent widened*), and the narrowing to critical hits is gone — every roll a face turns asks, the mutes the brake (*The asks widened*) | the roller's client cannot be paused by another player (Shield's row); the noise gate narrows it to saves and critical hits (Q2 option A) | 2026-09-29 |
| **A bystander's bend on a CHECK** | the bent total is stated on the check's card — "ask your DM whether it still succeeds"; the module claims no verdict | dnd5e keeps no DC for a check (the raw-check shape, Tactical Mind's) | 2026-09-29 |
| **A bystander's bend on a SAVE** — and **Countercharm**'s "fails a saving throw against an effect that applies the Charmed or Frightened condition" (2026-09-30) | offered only on a save the module DEMANDED (its DC known, the verdict withheld while the bystander answers); a save rolled from the sheet with no demand is not offered — Countercharm reads what the save is against off the demand's effects | only a demand carries the DC, a verdict to withhold (`registerWithhold`) and what the save is against | 2026-09-29; Countercharm 2026-09-30 |
| **Magic Circle** and **Forcecage**: a creature "can't willingly enter" / "can't leave it by nonmagical means" | a NOTICE card as the creature moves in or out; the move itself carries on | Polearm Master's row, the same seam: a pause would need the moving client's `pauseMovement`, out of scope (DESIGN §8) (`emanations.js` `notice`) | 2026-09-28 |
| **Rage**'s duration: it ends at the end of a turn that did not extend it (an attack roll against an enemy, a saving throw forced on one, or a Bonus Action) | a REMINDER card at the barbarian's turn end when the turn's own cards show no attack roll and no save at an enemy — "it ends now unless you extended it"; nothing is removed, the barbarian deletes the Rage | nothing records the Bonus Action that extends it, so an automatic end would end a Rage the player kept; the turn's cards are read only from a turn this client saw begin (`turn-grants.js` `remindExtend`) | 2026-09-29 |
| **Dark One's Blessing**: "when you reduce an enemy to 0 Hit Points" (or someone else does, within 10 feet of you) | paid when damage a CARD dealt takes an enemy (the tokens on opposite sides) to 0; the dealer is the card's actor | a drop typed on a sheet names no dealer and no card (the rebukes' floor), and "enemy" is read off the tokens' dispositions (`heal-on-hit.js` `on: "kill"`) | 2026-09-29 |
| **Repelling Blast**: "push the creature up to 10 feet straight away from you" | a card line on every beam that hits a Large or smaller creature — "push it up to 10 feet … (move the token)"; the token is never moved | a push is a token move the module never makes (Pushing Attack's line) | 2026-09-29 |
| **Combat Inspiration**'s Defense and **Glorious Defense**: a bonus to the target's AC "against that attack", when an attack roll hits | offered after the hit shows (Shield's row); the bonus is played as the attack roll's MINUS against that one target — the same arithmetic — and Glorious Defense's "creature you can see within 10 feet of you" is every paladin on the target's side within 10 ft of it (the bystanders' row) | the AC is the defender's number the hold reads; a minus on this roll touches no other attack (`hold/lookup.js` `bystandersOf`, `reach: "target"`) | 2026-09-29 |
| **Hunter's Prey**: the option is the character's, changeable after a Short or Long Rest | asked ONCE on the damage offer ("which option did you take?") and kept on the feature; the card's *Change* forgets it and the next hit asks again — the rest is the table's | the pack ships one item for both options and records neither (`clock-riders.js` `option`; the user, 2026-09-29) | 2026-09-29 |
| **Deflect Attacks**' Redirect: "if you reduce the damage to 0" | offered on the damage card once the reduced damage has LANDED at 0, as the pack's own save activity at the attacker; the range and the Focus Point are the activity's | the reduction is rolled at the answer and the damage lands later; only the receipt knows it came to 0 (`hold/views.js` `atZero`) | 2026-09-29 |
| **Open Hand Technique**: "whenever you hit a creature with an attack granted by your Flurry of Blows" | offered on an Unarmed Strike hit after Flurry of Blows was USED this turn (the use writes a turn chit); out of combat, on every Unarmed Strike hit, the caveat said | the pack's Flurry of Blows is a utility on Monk's Focus: the strikes that follow are plain Unarmed Strikes, and no card records which were granted by it (`hit-menu.js` `FLURRY`) | 2026-09-29 |
| **Protective Field**: "when you or another creature you can see within 30 feet of you takes damage" | yourself on any damage the module applies; another creature only on an ATTACK's damage (Interception's guard) | the guard hold (`damage-holds.js`) is asked on an attack's damage alone — a save's or an aura's damage to an ally is not held for a guard (Interception's rule) | 2026-09-29 |
| **Beguiling Defenses**: Psychic damage "equal to the damage you take" | read off the HIT's receipt for the warlock once it lands (the demand's `failDamage`); a save answered before the damage landed says so on a card and the table applies it by hand | the hold's landing and the attacker's save are two moments in either order; a receipt is the only honest number | 2026-09-30 |
| **Brutal Strike**: forgo Advantage on "one Strength-based attack roll of your choice" | the forgo is a TICK in the attack dialog before the roll; a roll with no dialog (a shift-click) cannot forgo, and the hit offers no group | the choice must be recorded before the d20; only the dialog is a place to make it | 2026-09-30 |
| **Studied Attacks**: "if you make an attack roll against a creature and miss" | the chip is written as ROLLED on the attack card (Graze's row): a Shield or a Lucky that turns the verdict later does not re-open it | the miss is read where Graze reads it, before any reaction; the rescue machine does not replay the attack's riders | 2026-09-30 |
| **Sundering Blow**: +5 to "the next attack roll made by another creature against the target" | the +5 is pushed onto the roll's parts at the dialog for the targets aimed at that moment; a re-target inside the dialog does not re-push it | the parts are fixed before the dialog renders (dnd5e's preRollAttack); the gate lists the source either way | 2026-09-30 |
| **Cosmic Omen**: "whenever a creature you can see within 30 feet of you is about to make a D20 Test" | offered AFTER the roll, the die added or subtracted from the total (Restore Balance's road) | the platform cannot pause the roller; the Reaction's window is the roll's card | 2026-09-30 |
| **Multiattack Defense**: "when a creature hits you with an attack roll" — every later attack it makes against you this turn | counts the hits the module SAW: the chip is written off the attack card, the −4 read on that attacker's rolls through the gate | a hit made outside the module's cards writes nothing; the gate is the one place the roll is bent | 2026-09-30 |
| **Misty Escape**: "immediately after you take damage" | offered only when the damage names its dealer (the rebukes' floor); a self answer, no reach measured | damage with no card behind it names nobody | 2026-09-30 |
| **Eldritch Smite, Lifedrinker**: "your pact weapon" | the weapon bonded through Pact of the Blade's enchantment; with NONE bonded on the sheet, any weapon counts and the card says so | the sheet cannot say which weapon is the pact weapon until the bond is made; a guessed exemption is never made | 2026-09-30 |
| **Branches of the Tree, Inspiring Movement, Wrath of the Sea**: "a creature you can see" | the side and the ring are judged; sight is not — the reminder is raised, the pick offered, for a creature the bearer might not see | the module reads no line of sight for a reminder or an offer (the gate's own judgement is the table's; RULINGS *Emanations*) | 2026-09-30 |
| **Searing Vengeance**: "when you or an ally within 60 feet of you is about to make a Death Saving Throw" | the offer is raised AS the Death Saving Throw rolls, the roll standing; Yes then heals half the maximum (a creature above 0 keeps no death-save tally) | dnd5e 6 fires no pre-roll hook for a Death Saving Throw (`dnd5e.rollDeathSave` is after the dice); the roll cannot be paused | 2026-09-30 |
| **Relentless Rage**: "you can make a DC 10 Constitution saving throw… if you succeed, your Hit Points instead change to 2 × level" | held at 1 while the save rolls; a success heals 2 × level on top of the 1 (2 × level + 1) | Undead Fortitude's seam: the 1 is written in the damage's own update before any roll can be made; the heal lands after (the platform applies healing to what stands) | 2026-09-30 |
| **Unbreakable Majesty**: "hits you with an attack roll… must succeed on a Charisma saving throw or the attack misses instead" | the attacker's save is rolled INSIDE the hold once the hit stands, by the elect on the attacker's numbers (no dialog) | a save the attacker's client would roll cannot be awaited inside the hold; the elect rolls it flat (the save gate's bends are not read for it) | 2026-09-30 |
| **Leading Evasion**: "creatures within 5 feet of you… who can see or hear you" | the reach alone is judged; sight and hearing are not | the module reads no line of sight or sound for a shared verdict | 2026-09-30 |
| **Versatile Trickster**: "if the hand is within 5 feet of the target" | the box is offered on the turn a Trip or Withdraw was used; the Mage Hand's position is the table's — the tick is the player's | the Mage Hand is a summon the module does not track; a guessed judgement is never made | 2026-09-30 |
| **Superior Hunter's Prey**: "once per turn when you deal damage to a creature marked by your Hunter's Mark" | offered on the damage card once the damage LANDED (the receipt), the pick's die rolled at the pick | the candidates within 30 ft of the marked creature are read off the map after the landing; the spell-pick road (Celestial Revelation's) | 2026-09-30 |

## Bent by choice — the rule of cool (2026-09-26)

**Where the module plays a rule more generously than the page, on purpose.** User, 2026-09-26:
*"i think B and bend it, its more fun that way. we should make these notes where we bend the rules
slightly for rule of cool"*. The register above is what the PLATFORM forces; this is what the
TABLE chose. ⚠ **The same standing rule: a new bend by choice adds its row here IN THE SAME COMMIT
as its code.**

| The rule as written | What the module does | Why it's more fun | Since |
| --- | --- | --- | --- |
| **Interpose Shield** (Shield Master): a Reaction when "subjected to an effect that allows you to make a Dexterity saving throw to take only half damage" — taken before the save is known | offered only AFTER the save SUCCEEDS (a Dexterity half-damage save, a Shield held, the Reaction free): Use turns the half into none and spends the Reaction; a failed save never asks (`saves/choices.js`, kind `interpose`) | the Reaction is never wasted on a save that fails, and the ask comes with the good news (ruled "B", 2026-09-26; built so since walk-5 (y)) | 2026-09-26 (built earlier; recorded as a choice this day) |
| **Poisoner's Apply Poison**: a dose applied to ONE weapon or piece of ammunition, potent for 1 minute or until that item deals damage | the use puts a **Poison Coating** on the CHARACTER (no weapon picked — the pack's drop-a-weapon card is not drawn): a Bonus Action said on its own card, a dose spent, "+(Poison Coating)" floated; the NEXT weapon hit spends it — the feat's own save at the creatures struck, 2d8 and Poisoned (until the end of the Poisoner's next turn, `sourceEnd`) on a failure; a miss spends nothing (`use-chips.js` COATINGS; the switch is the Fighting Styles list's Poisoner) | no weapon bookkeeping, and the poison always meets the next thing the Poisoner hits (the user, 2026-09-26: *"make it a buff applied to the actor"*) | 2026-09-26 |
| **The DMG's injury poisons** (Lolth's Sting, Purple Worm Poison, Serpent Venom, Wyvern Poison): applied to ONE weapon or piece of ammunition, potent for 1 minute or until it deals damage | Poisoner's bend on the vial itself: Use Poison writes a coating chip on the CHARACTER, the dose spent; the next weapon hit uses the vial's own save at the creatures struck, the last vial left empty on the sheet; a miss spends nothing (`use-chips.js` COATINGS, `item` rows) | the same no-weapon-bookkeeping as the Poisoner's, and a found vial works the day it is found (the user's cut, 2026-10-01) | 2026-10-01 |
| **Chef**'s Bolstering Treats: cooked "with 1 hour of work or when you finish a Long Rest", they last 8 hours, and "a creature can use a Bonus Action to eat one" for Temporary Hit Points equal to the Proficiency Bonus | after the Chef's Long Rest a popup hands them out: up to the Proficiency Bonus creatures on the scene (the Chef too) gain that many Temporary Hit Points at once — no treat to carry, no Bonus Action (`REST_GRANTS` "Bolstering Treats", `rest-grants.js`) | no treat bookkeeping, and the party starts the day with them (the user, 2026-09-26: Bolstering Treats as temp HP handed out after the Long Rest) | 2026-09-27 (ruled 2026-09-26) |
| **Restore Balance**: "is about to roll a d20 with Advantage or Disadvantage" — before the roll | offered AFTER the roll, both faces shown; answered, the FIRST d20 stands (the register's arithmetic for a cancelled Advantage), on an attack, a demanded save or a check (`decide/rescue-hit.js` `neutraliseOutcome`) | the sorcerer chooses with the faces in hand, which is more fun than guessing; the seam before the roll does not exist on another client (ruled Q3, 2026-09-29: *"yes we will have to rule of cool the restore balance that way"*) | 2026-09-29 |
| **Counterspell**: "you attempt to interrupt a creature in the process of casting a spell" — a Reaction at the moment of the cast | the caster TARGETS the creature and uses Counterspell; the saves machine demands its Constitution save as for any targeted save, and the verdict stands on the card — nothing watches for a cast, no hold is raised, no spell is stopped by the module; the rest is the table's | the drawing's cast-triggered hold (a reaction at a hostile's cast, prototype-first, cost 2) was traded for the table's own timing: the player says "Counterspell" as the spell is declared, the module answers with the save (the user, 2026-09-28: *"the user can just target intended counterspell actor, and force them to make the con save per the spell. the rest can be handled at table"*) | 2026-09-28 |
| **Wild Magic Surge**: "you can roll 1d20 immediately after you cast a Sorcerer spell with a spell slot" | the module rolls the d20 itself after every such cast, once per turn in a combat; a 20 rolls the surge table and posts it (`cast-riders.js`, `CAST_RIDERS`) | no click on every cast for a die with one sensible answer, and the surge is never forgotten (ruled Q7, 2026-09-29: the dice changers' one-sensible-answer rule) | 2026-09-29 |
| **Stroke of Luck** on an attack: "you can turn the roll into a 20" — the roll counts as 20; the page never says a 20 was rolled, so by the letter no Critical Hit | the 20 IS a Critical Hit: the miss hits whatever the AC and the damage crit-doubles, the resolve card "now hits — a Critical Hit" (`decide/verdict.js` the `twenty` replace, `auto-damage.js` `critFor` reads the crit through the folds) | a Rogue of 20 who burns the feature on a miss deserves the fireworks (the user, 2026-10-01: *"20 is a crit, make it rule of cool"*) | 2026-10-01 |
| **Inspiring Smite**: the Temporary Hit Points "divided among the chosen creatures however you like" | asked in a popup; when its timer runs out the whole amount goes to the paladin and the Channel Divinity is spent (`askHandOut` `distribute`, `rest-grants.js`) | the smite's gift is never lost to a slow answer (the plan's pre-listed bend, stage A7) | 2026-09-29 |
| **Relentless**: "once per turn, when you use a maneuver, you can roll 1d8 and use the number rolled instead of expending a Superiority Die" | the d8 stands in only when NO Superiority Dice are left; with dice left the module spends one | an ask on every maneuver would double the popups for a trade nobody takes with dice in hand (the noise gate, Q2); the user may overrule | 2026-09-30 |
| **Candles, Torches, Lamps and Lanterns**: a Candle or Torch burns for 1 hour, a Lamp or Lantern for 6 hours on a flask of Oil; a Torch is used up | using the item toggles its light on the bearer's token; nothing is consumed and nothing expires by the clock; it stays lit until put out or a Long Rest (`gear-lights.js`, `GEAR_LIGHTS`; *Gear lights*) | no light bookkeeping; the table lights a torch and forgets about it (the user, 2026-10-11) | 2026-10-12 |
| **Produce Flame** (2024): "Until the spell ends, you can take a Magic action to hurl fire" — the flame stays in the hand after a hurl, for the spell's 10 minutes | a use of the spell's **Hurl Fire** puts the caster's flame out: the "Produce Flame" effect deleted on the elect, the token's own light back, the hurl's card saying so; the hurl itself rolls as the pack's, and hurling again with no flame lit is the table's to allow (`TOKEN_LIGHTS` `out`, `token-lights.js`; *Produce Flame*) | the light follows the flame: thrown, the hand is dark (the user, 2026-10-21: *"cast light on the token per spell. if thrown, light goes away."*) — the older printing's "doing so ends the spell" | 2026-10-21 |

## Gear lights (2026-10-12)

**A Candle, Torch, Lamp or Lantern is a light switch** (issue #7, ruled by the user 2026-10-11:
items only, a toggle popup, the Hooded Lantern's hood, the light on the character, nothing
tracked). `scripts/gear-lights.js`, the table `GEAR_LIGHTS` beside `TOKEN_LIGHTS`, the pure half in
`scripts/decide/token-lights.js`. It replaces the third-party Torch module at our tables.

- **The use is the toggle and nothing else.** From the sheet, from a hotbar item macro, or through
  the Torch's own Attack, the item's use opens one popup on the client that used it: the item, the
  book's line, and the presses. No activity runs, no usage card is posted, nothing is consumed. The
  Torch's improvised-weapon Attack is never offered (decided: the toggle is the item's only use).
- **The presses.** Unlit: **Light**. Lit: **Put out**. The **Hooded Lantern** is the one item with a
  second state: unlit it offers *Light — hood up* (30 ft Bright, 30 more Dim) and *Light — hood
  down* (5 ft Dim); lit, *Put out* and the hood (*Lower the hood* / *Raise the hood*). The ✕ does
  nothing.
- **The light is on the character.** An effect on the item's owner, named for the item ("Torch
  (lit)"), its origin the item, carrying `token.light.*` changes and no clock. Its presence is the
  light being on: deleting it by hand is the same as Put out, and so is ✕ Revert on the card.
- **One gear light per character.** Lighting a second item puts the first out, and the card says
  so; a Token Lights light (the Light cantrip, Corona of Light) stands beside it untouched.
- **The Long Rest puts every gear light out** (the user, 2026-10-11), one card each: "<Actor>'s
  Torch goes out (Long Rest)". A Short Rest changes nothing. The resting client does it: dnd5e
  fires the rest's hook on that client alone, so there is one writer without an elect.
- **An item that leaves the sheet takes its light** (dropped, handed over, moved to a party stash);
  the elect deletes it, no card.
- **Nothing is tracked**: the rule-of-cool row in *Bent by choice — the rule of cool*.

| Item | Answers to | Bright | Dim (outer) | Second state |
| --- | --- | --- | --- | --- |
| Candle | Candle | 5 | 10 | |
| Torch | Torch | 20 | 40 | |
| Lamp | Lamp | 15 | 45 | |
| Lantern, Hooded | Hooded Lantern (2014) | 30 | 60 | hood down: 0 / 5 |
| Lantern, Bullseye | Bullseye Lantern (2014) | 60 | 120 | the 60-ft cone as a 53.13° light (a 5e cone is as wide as it is long; the user may overrule) |

An item answers by its identifier or its name, so a world copy or a homebrew item of the same name
counts; a magic lantern (Lantern of Revealing) does not.

**The flame's look** (the user, 2026-10-12): each light carries its colour and flicker on the same
effect (`GEAR_LOOKS`), soft at its edge (attenuation 0.8 or more), alpha and luminosity low so the tint
does not wash the map. Put out, the token's own light comes back whole.

| Look | Items | Colour | Flicker |
| --- | --- | --- | --- |
| torch | Torch | orange `#ff8a33` | `torch`, speed 5, intensity 7 |
| candle | Candle | a soft warm white `#fff0d6`, the faintest tint | `torch`, speed 4, intensity 4 |
| lamp | Lamp, both lanterns (oil behind glass), the hood down too | between them, `#ffc46e` | `torch`, speed 2, intensity 1 — barely moving |

The flicker is the `torch` animation, never `flame`: `flame` draws a hot white core at the light's
source, and on a token that covers its art (the user, 2026-10-12).

The hard ring at a light's edge is the scene's darkness, not the light: a scene with a dim global
light under its darkness shows none (the MCP's scene-builder skill).

## Produce Flame (2026-10-21)

**The flame in the caster's hand lights the caster's token** (issue #13; the user, 2026-10-21:
*"cast light on the token per spell. if thrown, light goes away."*). A `TOKEN_LIGHTS` row beside
Light and Continual Flame on the same machine (`scripts/token-lights.js`, the pure half in
`scripts/decide/token-lights.js`); it replaces the table's hotbar macro, which set the token's own
light by hand.

- **The Cast lights the caster.** `on: "self"`: whoever is targeted, the spell's **Cast** lands the
  module's own "Produce Flame" effect on the caster (the pack ships none), carrying 20 ft Bright and
  40 ft Dim (`dim` is the outer radius: 20 more) in a torch's colour and flicker
  (`SPELL_LOOKS.produceFlame`: orange `#ff8a33`, `torch` at speed 5, intensity 5, soft at its edge),
  on the Cast's own clock, the spell's 10 minutes. No token document is written: the light is the
  effect's `token.light.*` changes, so whatever ends the effect gives the token its own light back whole.
- **Receipted.** The Cast's card says it ("Produce Flame — <token> sheds light: 20 ft Bright, 20 ft
  more Dim", then how long and what puts it out) and carries the effect receipt; ✕ Revert deletes
  the effect, and the light with it.
- **Casting it again replaces it** ("The spell ends if you cast it again"): `recast: "ends"`, Light's
  word. The caster's earlier flame is deleted before the new one lands, so a recast never stacks two
  lights or two effects.
- **Hurling it puts it out** (the bend: *Bent by choice*). The row's new word, `out: "Hurl Fire"`:
  a use of that activity stamps its card (`tokenLight` with `out`), and the elect deletes the
  caster's standing flame. The card says "Produce Flame — <token>'s light goes out" when a flame was
  still shining, and nothing when none was. The hurl itself is the pack's attack, untouched. The
  put-out carries no receipt, as a recast's put-out and a gear light's Put out carry none: nothing
  landed, and reverting the hurl's damage does not light the flame again (cast it again).
- **Any other end gives the light back**: the 10 minutes run out (the platform marks the effect
  expired and a suppressed effect changes no token), the effect is deleted by hand, or a rest tidies
  it (*Rests end the short effects*).
- **A sheet's own copy of the spell** (the user's hand walk on the sandbox, 2026-10-21: *"light doesnt
  go out if i just hurl it. if im carrying it, then hurl, the effect of light still stays on"*). Cecil's
  Produce Flame is the stopgap's world copy: its Cast applies its own "Produce Flame" effect (a marker
  the macro reads), and the macro had set the token's OWN light (10 / 20 on the prototype and the
  placed tokens). The cast path landed that effect beside the light's, two "Produce Flame" on the
  sheet, and the hurl put out only the light's; the token then fell back to its own 10 / 20. Two
  answers. **The light adopts the use's own effect of the spell's name** (`lightAdopts`): a row with no
  `effect` of its own whose utility use applies a creature effect named as the row lands THAT effect
  with the light on it, and the cast path leaves it (`cast.js`), so the caster wears one "Produce
  Flame" and the hurl, a recast and ✕ Revert each take it whole. An enchantment is never adopted
  (Sacred Weapon's stays on the weapon, its light on the paladin). **The effect wears the spell's
  icon** (the user, 2026-10-21: *"can you give the hurl flame active effect the flame icon from the
  spell"*): the module's own effect and an adopted copy alike take the item's image
  (`lightEffectImg`); a row that names its pack effect (Searing Radiance) keeps that effect's own. **The hurl's card names a light set on the token itself**
  ("the token keeps the light set on it: 10 ft Bright, 10 ft more Dim"), so the token's own setting
  is never taken for the flame; the module never writes the token's own light, so that setting is
  the table's to clear (the macro's off press, or the token's light config).
- Pinned by `tests/decide-token-lights.test.js` (the row, `lightOutKey`, `lightAdopts`,
  `tokenOwnLight`, `lightEffectImg`, the changes, `lightLasts`) and `smoke-aasimar` §8 (the pack's spell: cast,
  recast, revert, hurl, a hurl with nothing lit) and §9 (the sheet's copy on a token with its own
  light: one effect, recast, revert, hurl, a hurl with nothing lit).

## Musician's song lands (2026-10-21)

**The song says itself as it lands** (the user, 2026-10-21: *"when cecil gives a musician's
inspiration to someone, can you give a bardic song variant vfx on those who receive it. also make a
card and like a floating white text so ppl know."*). Heroic Inspiration is a box on the sheet, so
nothing at the table showed it land: the elect wrote the boxes and the ask card's small line turned
to "Heroic Inspiration — Ilka, Tychon". The machine is `scripts/rest-grants.js`, the pure half
`scripts/decide/rest-grants.js`.

- **Its own card.** As the elect lands the picks (`landSong`), it posts the song's card, spoken by
  the singer, in the house shape (DESIGN *Cards*): the feat as the eyebrow, one line of what
  happened, "Encouraging Song — Heroic Inspiration: Ilka, Tychon" (the row's `rule.benefit`, the
  grant, every recipient), "sung by Cecil" under it, and the feat's text under the closed rule tick.
  Nobody given it, no card. The ask card keeps its line. `songCard`.
- **The float.** Every client, as the record's `applied` lands, raises "+Heroic Inspiration" in
  white over each recipient's token it can see (a hidden or secret token is skipped): display only,
  no write, once per card, live updates only (a client that loads later does not replay it), the
  initiative swap's float. `songFloat`.
- **The effect is FX Studio's.** `restSong` publishes `choice` with the singer as the actor and every
  pick as a target by uuid and name (the payload's `targets[]`, `{ actorUuid, tokenUuid, name }`),
  `ability` the row ("Musician"), `details` `{ grant: "inspiration", given }`. **It names the item**:
  the giver's own feature, `<actorUuid>.Item.<itemId>` (the payload's `itemUuid` and `itemName`),
  because FX Studio keys an effect to the feat, never to a name, and `restSong` is every hand-out's
  record (Inspiring Leader, Chef's two, Life-Giving Force, Inspiring Smite, the heal-on-hit picks
  such as Improved Blessed Strikes); every writer stores both ids, so each names its own feature. Additive in
  `contracts/moment.json` (the pair's `itemUuid` and `itemName` widened to a string; version 2
  stands). What plays on each recipient is FX Studio's call (ARCHITECTURE *The moment events*).
- **Heroic Inspiration only** (`SHOWN_GRANTS`): a temp-HP grant (Inspiring Leader, Bolstering
  Treats, the turn's and the cast's hand-outs) shows on the token's Hit Point bar, and Chef's meal
  posts its own card.
- Pinned by `tests/decide-rest-grants.test.js` (`songCard`, `songFloat`, the `restSong` moment's
  targets and item, every writer's record) and `smoke-rest` §7.

## The effect view (2026-09-15; the aura row 2026-09-15; the panel 2026-09-18)

**Buffs and debuffs, visible on demand, never actions.** A creature carries more effects than
its token paints (the module's chips carry no status), so the sheet knows things the table
cannot see. `scripts/effect-view.js`, pure half `scripts/decide/effect-view.js`; ruled shot by
shot off `prototypes/effect-views.html` on the live sandbox. Replaces the chit layer and the buff
bar (`prototypes/buff-bar.html`), both retired the same day: chrome on the screen at rest was the
objection, and a spendable-actions surface was never the need.

- **Three surfaces, one renderer, nothing written by the view.** The bar above the hotbar for the
  controlled token (else the user's character), always on; the hover card beside any token
  pointed at, never for a controlled token (the bar is its list); the held Alt showing every
  creature's list at once. Two client switches, one per family.
- **What is listed is what is IN FORCE:** an active effect that is clocked, a condition, or one
  applied by a cast; never a worn item's transfer effect. Plus Temporary HP and Heroic
  Inspiration, read off the sheet. A row the token cannot paint is tagged *no icon*, by Foundry's own
  rule (`drawsOnToken`): `showIcon` ALWAYS, or CONDITIONAL (the default) while the effect has a duration;
  a status alone draws nothing (2026-10-13).
- **Every effect the module writes on a creature is drawn on its token** (2026-10-13, the user: Continual
  Flame's stone "says no icon, but has one", then "do a pattern check"). Foundry draws a CONDITIONAL effect
  only while it has a duration, and the module wrote its effects with the default: a companion, a summon
  standing "until dispelled", a lit gear light, a light on a token, a Wild Shape form with no clock and an
  aura's mark (whose status was meant to show it) never showed. `preCreateActiveEffect` (effect-view.js,
  `drawnAlways`) sets ALWAYS on an effect carrying the module's flag on an actor, unless the writer set its
  own; a fighting style's face (a worn passive) and an item's transfer effect are left alone. The active
  GM's load marks the earlier ones the same way, once. The hover
  card and the bar's name panel add the marks the creature holds on others (not on the strip).
- **The bearer's own standing aura is in force** (v1.42.0): a feature's emanation sits on its
  bearer as the pack's transfer effect, so the one creature radiating the aura was the one hidden.
  Listed as a buff, named as the pack names it, tagged *no icon*; the class is every feature row
  of the emanation table, read and gated as the floor reads it. The floor never writes the bearer
  a marker.
- **The bar is the ONE interactive surface.** The name opens the full list upward, grouped as
  the sheet groups it (Temporary, Passive, Unavailable), so a GM can sweep a dead effect. A chip
  opens a fold with its one write for an owner: Remove an effect, Disable an item's (never
  deleted), Clear a sheet row. The hover card and the held key are read-only. A *Details* entry
  was tried and dropped.
- **Tone is a PATTERN, not a list:** concentration is its own yellow and leads; a condition or a
  module mark is a debuff; else the effect's own CHANGES decide (a penalty outranks a bonus); else
  the caster's side by disposition; else a buff.
- **Order:** concentration, debuffs, buffs, the sheet rows last; the panel vertical.

Not picked: a count badge, tracker chip lines, a turn-start card. Pinned by
`tests/decide-effect-view.test.js` and `tools/probe-effect-view.mjs`.

## Chips and clocks — where a chip belongs, and who keeps its time

**Combat chips are TEMPORARY effects; Passive is for what a character wears** (2026-09-01).
Anything the module applies out of a swing, a save or a reaction carries a real duration. A chip
Foundry cannot measure is filed Unavailable and reads as the feature doing nothing (the v1.27.1
Sap report: a round clock stamped against a combat that was not `game.combat`, `activeCombatFor`
in core.js). A chip nothing expires accumulates; the sweep runs at apply time.

**The platform keeps the clock; the module keeps its word** (2026-09-01). A chip's duration is
the rules text written once as Foundry v14 expiry data (`decide/chips.js`), and since dnd5e 6.0
the pseudo-expiries `sourceStart | sourceEnd | targetStart | targetEnd` say whose turn: Vex
`sourceEnd`, Sap and Slow `sourceStart`, the reaction chip `targetStart`, a Miasma `targetEnd`.
Foundry marks the chip expired on the boundary; the module deletes what Foundry marked and sweeps
its chips when a combat is deleted. **Nothing in this module counts turns, and nothing may start
to.** The module's own are EVENTS: the attack roll that spends Vex or Sap (a receipt on the attack
card), and the once-per-turn chits (Cleave, Sneak Attack, a clock rider, Steady Aim), which have
no platform equivalent. Out of combat there is no clock; a chip lives until its spend closes it.
The module's own re-derivation (`appliedClock`, v1.41.0) was retired by the 6.0 pass (NOTES §2).

**An empty clock takes the spell's** (2026-09-15, dnd5e 6.0's `Activity#getAppliedEffectChanges`):
a pack that wrote a duration on the spell and not its effect (Death Armor) lands clocked through
the one applier every cast's and every save's effects pass through (`effect-riders.js`).

**Dead is the platform's MARK, never the arithmetic** (2026-09-01). A one-round chip's
`remaining` reads zero for the whole round its boundary falls in; zero is alive, a negative
clock is the one fallback for a no-GM table. The Cleave chit is a stamp comparison against the
turn IN PROGRESS (`combatStamp`), because the mark is GM-written.

**A reaction's own effect is on the Reaction chip's clock** (2026-09-10, the stale-Shield
report): Shield's "until the start of your next turn" is the chip's sentence, so the hold applies
the cast reaction's effect at `targetStart` pinned to the reactor, not the pack's `{1 rounds,
turnStart}` stamped with the attacker's turn. An expired effect is MARKED, not deleted (core's
`isSuppressed`), so the tidy owns the reaction's effect and the offer gate reads `active`.
Pinned by `smoke-hold` §9.

**Prone is the named exception and stays Passive** (2026-09-01). The rules give it no window; a
Temporary Prone would stand creatures up on a clock nobody rolled for. Take the duration from the
rules, and where they give none, give none. A pass that "fixes" Prone into Temporary is a
regression.

**The Reaction is a chip** (2026-09-02): on the reactor, spent by any interrupt, back at the
start of the reactor's next turn (`reactionStands`). Never a flag the module clears by hand.

## The gate before the roll (2026-09-01 → 2026-09-04)

**A reminder is proactive, never a rescue.** When something the module can READ bends a d20, the
gate meets the roller BEFORE the dice, inside the system's own roll dialog (forced open under a
fast-forward key), as ONE section shaped like the dialog's configuration: a box per source (the
fact, the bend as a badge, the rule quoted verbatim) under one header line carrying the count and
the net as a coloured tag. No net block; the arithmetic rides the header's tooltip. The human
presses one of the dialog's own buttons and the roll goes out natively. **Nothing is ever applied
for the roller.** The card records what was shown and pressed; the stats plane reads honour off
it. Membership: the Reminder Sources list names the KINDS, the Condition Sources list names WHICH
conditions (Hiding included). An empty Reminder Sources list is the gate off.

- **The highlighted button is the net** the section names, marked with a persistent border in the
  outcome's hue (keyboard focus is not a mark; a click takes it). Enter is still a press. The
  section re-judges on the dialog's own re-renders and on a re-target.
- **One palette, one meaning per hue, everywhere the module paints:** green good for you, red bad
  for you, orange waiting on you, yellow a critical hit, grey nothing bending. Blue is dnd5e's
  healing and stays out.
- **The net is the 5e rule:** any Advantage against any Disadvantage is normal, however many of
  each. A source the module cannot judge is listed and not counted.
- **The labels are the fact alone** ("Rogue — Hiding"); the quoted rule carries the condition.
  No tooltip on the header line.
- **A recorded spend counts as spent** whatever the sheet says (a no-GM table's lingering chip).
- **Effect sources** (2026-09-02): abilities that bend an attack roll and sit on a sheet as an
  ACTIVE EFFECT or a FEATURE — `EFFECT_BENDS` in `decide/registry.js`, one row of data each, from
  a scan of every pack on the sandbox. Matched by NAME (what a GM can type), and by the effect's
  ITEM where two packs share a name (`item`). Each row: the side, a SCOPE (Innate Sorcery is spell
  attacks only), a caveat where the module cannot judge, `counted: false` where the caveat is the
  rule (Demon Armor), a `judge` where the module CAN read the fact (Bloodied, the target Grappled,
  an ally within 5 feet — off the map since 2026-09-22), `spend: "attack"` where the rules spend it
  on the next attack roll, `only: "source"` (Feinting Attack, Vow of Enmity) and `except:
  "source"` (Goaded). A map fact the module cannot read counts, never guessed exempt. The Effect
  Sources list is membership, parsed whole.
- **Range is a source** (2026-09-02): any ranged attack roll, off the activity's own range and the
  Prone geometry — beyond normal range Disadvantage, beyond long range listed not counted, an
  enemy within 5 feet Disadvantage with its caveat. `RANGE_RULES`.
- **A volley meets the gate at its aim** (2026-09-02): the aim popup judges once per ray, each row
  folded to its header, the mode select defaulting to its net, a re-aim re-judging the rays
  after. Spends are carried forward in ray order — Sap and Vex bend ONE ray (N1). Darts are
  damage, nothing drawn.
- **An outcome the table carries is APPLIED:** the automatic crit within 5 feet of a Paralyzed or
  Unconscious target is made by the damage service off the same table and distance
  (`critWithinFeet`, `critFor`), when true of every target the roll serves; the card says why.
- **What the gate never touches:** a roll whose caller suppressed the dialog and has no aim.

**The save gate is the attack pattern on the save hook** (2026-09-02, option E: cascading saves,
no queue). A demand opens dnd5e's own Saving Throw dialog with THE DEMAND above the configuration
(who rolls, the DC, what a success buys, the timer bar) and BEFORE YOU ROLL below it (`SAVE_BENDS`:
Restrained, the Dodge action, the auto-fails), the default the net. A sheet save meets the same
gate. The Topple save and the concentration check joined it 2026-09-03. **A save the rules fail
before the dice grows a Fails button as the default** — no dice, still a press; the buzzer takes
Fails too. Option C, resolving with no press, is settled against (DESIGN §8).

**The save and check gates say WHY when the PLATFORM bends the roll** (2026-09-04): the roller's
applied effects are read for the roll-mode key that names this roll, each a box naming the ITEM,
netted with the status rows; read off the effect CHANGES, never the computed mode. A mode the
SYSTEM sets from a rule of its own stays unexplained.

**The check gate is the same pattern on the ability-check hook** (2026-09-03): `CHECK_BENDS`
(Poisoned, Frightened, the glossary verbatim). Poisoned's Disadvantage the platform rolls itself,
so its box explains a default; Frightened is the gate's own. Nothing applied. Initiative is
skipped on purpose.

**Sneak Attack is a CHOICE beside the roll** (2026-09-02, the prototype *Sneak Attack, Cunningly*;
`sneak.js`, `SNEAK_ATTACK`, `CUNNING_OPTIONS`; `smoke-sneak`). With the feature on the sheet and a
Finesse or ranged weapon the section grows one box outside the fold: the dice read off the
feature's own activity on the sheet, a checkbox ticked when the conditions hold — the roll nets
Advantage, or an ally of the rogue (not Incapacitated) stands within 5 feet of every target and
the roll has no Disadvantage (judged off the map since 2026-09-22; the tick stays the player's).
On the hit the damage offer opens even under auto damage: the Cunning Strike menu read off the
sheet, subclass included, up to two picks with Improved Cunning Strike. Costs come off before the
roll, the sneak dice ride as their own part, a crit doubles what is left, one receipt. The effects
run through the saves machine on the pack's activities; Envenom's failure also presses Poisoned;
Death Strike on round one demands its save. Once per turn is a turn chit on the attacker.

**Clock riders are NOTIFIED, never asked, and each is a ticked checkbox on the offer**
(2026-09-02, reversed the same evening from a line to a tick; `CLOCK_RIDERS`, `clock-riders.js`,
`smoke-clock`): a feature on the attacker's sheet whose extra damage hangs on the ROUND or the
TURN (Dreadful Strike, the Assassin's dice, Divine Strike, Primal Strike, Divine Fury). The part
rides the hit when the clock says so, the chit is written, a use is spent, the card says why. A
declined rider spends nothing. Left out on purpose: rows with a choice inside them or an
unjudgeable fact. A damage TYPE the rules leave open takes the activity's first type and says so.
Once-per-turn counts only for a combatant in the running combat.

**The first walk's rulings (2026-09-02/03), all standing:** a standing effect source shows on
every ray, only what the rules SPEND is carried forward; a text-only feature becomes a chip on
use (`USE_CHIPS`, Steady Aim); a failed save presses the standard status from a row where the pack
ships no effect (`SAVE_PRESSES`, Web); Evasion is an outcome (`EVASION`, none on a success, half
on a failure, applied and receipted); Incapacitated breaks concentration off the effect, no save;
Uncanny Dodge is an attack-roll interrupt only; an interrupt is the ABILITY by name, never its
effect; a damage interrupt the module can settle is settled (`INTERRUPT_MULTIPLIERS`: Uncanny Dodge
×0.5; Absorb Elements stays "reduce by hand"; Deflect Attacks is rolled since A1 — *The PHB classes — A1*). **Every row on the offer is the
same shape:** a tick, the name and the dice, a fact as the tag, the rule folded under — never a
line of explanation above or below (the standing UI rule). The offer's menus scroll in a bounded
box; the Roll button names the weapon.

**Heroic Inspiration's text** is quoted from `dnd5e.content24`, *Appendix D: Rule References*, page
`nkEPI89CiQnOaLYh`. It reaches every d20 test the module meets (attacks, saves, checks through the
sheet's dialog, Initiative — `tools/probe-heroic-check.mjs`); not damage dice, and not the transfer
clause (DESIGN §8).

## Emanations (2026-09-03; amended 2026-09-04, 09-05, 09-18, 09-23)

**An aura applies itself to the creatures inside it, and the platform keeps the geometry and the
clock.** The user opened DESIGN §4 to them: an aura applying to whoever stands inside is an
OUTCOME, "no different than auto-applying Slow with mastery". The measurement that made it fit
(`tools/probe-emanations.mjs`): Foundry 14's `RegionDocument.createTokenEmanation` builds the
rules-correct shape attached to the token, tracks who stands inside, raises enter / exit / turn
events. **Nothing here measures a distance or counts a turn.** `emanations.js`, `decide/emanations.js`,
`EMANATIONS`; `smoke-emanations`, `smoke-twoclient`.

- **A feature's aura is always on:** it stands whenever the token is on the scene and its range
  resolves; off while the source is Incapacitated; a GM-deleted region comes back on the next
  sweep.
- **A spell's aura places itself on the caster** — the placement prompt switched off, the area
  centred on the token, adopted when its Region appears, ended when the concentration effect for
  that cast is deleted.
- **The cast's own save asks only who the aura reaches:** a listed row filters the area adoption
  by its reach and never asks the caster. Spirit Guardians cast among allies demands nothing.
- **Range is the content's:** the activity's size, else the class's scale value the pack's aura
  activities reference (`@scale.paladin.aura`). A Paladin below 6th has no aura and the data says so.
- **The effect is the pack's, with the SOURCE's numbers read in** at write time, re-read when the
  source changes; named for its source ("Protected — Ysolde").
- **Reach by disposition:** helpful auras reach allies and neutrals, harmful ones enemies. A
  feature's own token is never a member of its own emanation (the transfer effect covers it);
  **a spell's ring includes its caster** (2026-09-05: "you and your allies"); a harmful ring never
  admits its caster.
- **A triggered save is a demand over the bus** for that one creature, once per turn, counted only
  for a combatant. The standing effect is the region's, never applied again by the verdict.
- **Not drawn at all** (2026-09-18): the Region is the machine, locked, `LAYER_UNLOCKED`
  visibility. What the table sees is the member's chit: the member's copy wears the module status
  `bfEmanation`, visible while inside, gone with the effect. One copy, one lifecycle: the cast's
  own demand never applies the spell's standing effect.
- **A damage type the part leaves open is the alignment's by default and the caster's by
  choice** (Spirit Guardians): the default read off the sheet, picked by a radio in the system's
  own casting window, changeable from the card, every roll of that cast wearing it. This is the
  emanation's answer, not the clock riders': here the rules NAME the deciding fact.
- **Asked once at the cast:** whoever stands inside when the area appears is asked by the cast's
  demand; the area attaching around them is not an entry.
- **The floor is the truth:** the active GM keeps the standing effects true to the platform's
  membership on every event and every move, one write per creature per region. With no GM the
  flow-elect law holds.
- **An emanation exists on every LIVE scene — the active one and every scene a connected user is
  viewing — with ONE copy per aura** (2026-09-04 active-only; amended 2026-09-23 after a play session
  played on scenes nobody activated). The count is per AURA (the bearer's item and the row,
  `emanationGroup`), so two scenes can never stack; a lift reads every actor. A GM's view counts
  only while no player is connected; an Assistant GM is a GM for this. Pinned by
  `smoke-emanations` §11g–l and `smoke-twoclient` `pull`.
- **Aura of Courage's pack effect carries no change:** a content fix at the world.

**The second slice** (2026-09-05): every 2024 PHB emanation with a standing effect is a row — Aura
of Life, Aura of Purity, Circle of Power, Crusader's Mantle, Holy Aura — applying exactly the
pack's effect; each row's caveat names the clause the pack does not carry. **The save clauses the
packs leave out are the save gate's, by effect:** the effect table's `saves` facet reads the DEMAND
— Aura of Purity counts Advantage when the demanding spell's failed effect would impose one of its
seven conditions, Circle of Power when a spell demands the save at all, and a success under Circle
of Power against half-on-save spell damage takes NONE, applied and receipted like Evasion. A heal
the caster AIMS is a notice, never played (Aura of Vitality). A barrier is a ring and a card
(Antilife Shell). An area can pay a member at a moment (Aura of Life's 1 HP at turn start). Left
out: rings that carry no effect (Antimagic Field, Darkness, Daylight), and emanation saves a
Bonus Action casts.

## The hit menu (2026-09-04, off `prototypes/hit-menu.html`)

**One popup per hit, a group per paying feature** — the general form of the Cunning Strike menu
(SWEEP item 2: one popup, grouped by the feature that grants the rows, smites out). `hit-menu.js`,
`HIT_GROUPS` (the feature that pays: its pool, its die, its pick limit, its DC rule), `HIT_OPTIONS`
(a feature on the sheet that spends from it); membership the Hit Menu list; `smoke-hitmenu`.

- **The row is the name and the cost, nothing else;** the save and the condition live in the rule
  folded under and on the card after. A caveat the rules leave to the player is the one extra line.
- **One pick per group** ("only one maneuver per attack"); a maneuver AND a Cunning Strike on one
  hit is two groups. **Since 2026-09-24, one pick per HIT across the hit menu's own groups**
  (Combat Superiority, Giant Ancestry): the pick is one record — *Slice A* below, and the bends
  register above.
- **An affordable row opens the offer even under auto damage.** No dice left: the group shows *no
  dice left*, greyed.
- **The die rides the damage roll** as its own part, crit-doubled; the pool is spent on the sheet.
  **Sweeping Attack's die does not ride:** a popup asks for a creature within 5 feet of the
  target (the hold family's clock; at expiry the only creature, else nobody; the die spent either
  way), the elect rolls the die in the open, judges the ORIGINAL attack roll against that AC and
  applies through the receipt chokepoint.
- **The save is the pack's own activity** used at the hit target after the damage lands. A
  condition the pack left unlinked on the ITEM (Trip's Prone) is pressed on the failure. **The
  fighter never carries a target's effect:** the pack ships Goaded as a transfer effect, and the
  module corrects the wielder's own copy to `transfer: false` (NOTES §2).
- **The goader is exempt** (`except: "source"`); the inverse is `only: "source"` (Feinting Attack,
  Vow of Enmity, Clairvoyant Combatant, Strike Fear — markers the packs put on the creature the
  feature is USED ON).
- **A LINE option says what the table plays** (Maneuvering's ally move, Pushing's 15 feet),
  never automated. **A riposte's hit offers the menu too.**

What is read, never typed: the die (`@scale.battle-master.superiority.die` on the option's own
activity, resolved on the sheet), the pool (the activity's consumption target in the three shapes
the pack ships), the save, its DC, the condition. Precision Attack and Riposte stay folds
(`precision.js`, `riposte.js`). The seam it proved: the offer's contributions (`registerOfferPart`,
ARCHITECTURE §7).

## The rest of the maneuvers (2026-09-04/05)

**Every Battle Master maneuver lands on a machine that already exists, and no maneuver plays a
choice.** `superiority-uses.js`, `SUPERIORITY_USES`, `SUPERIORITY_FOLDS`; `smoke-superiority`,
`smoke-maneuvers`.

- **Parry is a damage interrupt that REDUCES by a roll** (`INTERRUPT_REDUCTIONS`): the pack's heal
  formula IS the reduction; the answer spends the die and the Reaction, rolls in the open, the
  applier lands the damage short by it. The Monster Manual's AC "Parry" stays an AC hold: the row
  applies only where the item carries the named activity.
- **Evasive Footwork, Bait and Switch, Lunging Attack and Feinting Attack are USES.** Evasive
  Footwork rolls the die and writes it on the AC until the fighter's next turn. Bait and Switch
  rolls and ASKS who wears the pack's "Baited AC +N" (the pack ships twelve; the cast slice is
  kept off every maneuver's card). Lunging Attack is a chip whose die is a ticked checkbox on the
  next melee hit's offer (the straight line is the player's fact). Feinting Attack marks the
  target with the fighter as source; the gate reads it as Advantage for the fighter alone, the
  next attack at that target spends it, the die rides.
- **Ambush and Tactical Assessment are d20 folds with a SCOPE** (the `tactical` spend, the
  feature's text naming which checks; Ambush on Initiative too, the original roll standing as
  history). No refund. **Used from the sheet FIRST, they ARM:** the use rolls the die, a chip
  carries it, a notice names the check, the next check the scope names folds it in.
- **Commander's Strike is a NOTICE and a chip, never a driven attack:** the elect puts a chip
  carrying the fighter's die on the ally until the end of the fighter's turn; the ally is told
  (OK only) and attacks from their own sheet; that damage folds the die in, spends the chip and
  the Reaction. No attack the module drives on someone else's sheet.
- **Rally needed nothing built.**

**One UI language for every maneuver:** the feature's art, the eyebrow `Maneuver — Name`, the
title `Name — what happened`, the spend, the rule; the popup `Name — who` with the maneuver's verb
and `Pass`; the recall `Answer — …`. **One wording for a spent die** (`Combat Superiority: 3 of 4
remaining`) from ONE reader (`poolSpendsOn`) over dnd5e's consumption deltas and the module's hand
spends alike, the hand spends through ONE pass-through (`spendSuperiorityDie`).

## Damage shields (2026-09-04)

**A ward on the defender pays out against whoever hits it, and there is no choice in it.**
Death Armor, Fire Shield and Armor of Agathys: a standing effect on the DEFENDER whose pack
activity deals damage to the ATTACKER when a melee attack roll hits. `damage-shields.js`,
`DAMAGE_SHIELDS`, the Damage Shields list; `smoke-shields`. The ward is found by the pack's effect
NAME, walked to its caster as a mark is, the caster's own activity rolled on the elect and posted
as the defender's, landed through the receipt chokepoint naming the ward. The reach is the
activity's own; once per turn is a chit on the defender; Fire Shield's type follows the shield
that stands; Armor of Agathys ships no effect, so the module MARKS the cast and the ward strikes
while the Temporary HP last. Judged only when the attack's DAMAGE lands, and judged ONCE at the
hit — a re-render never re-judges. Hellish Rebuke is a Reaction and the hold's.

## Effect choices (2026-09-05)

**A cast that offers a choice between effects asks the caster, and only the pick lands.** Fire
Shield ships Warm and Chill on one activity and marks nothing; the cast slice landed both. A popup
on the caster's own usage card at the cast, the cast waiting on the card until answered, the
card's button reopening it, the elect applying the one effect chosen. No clock. `cast.js`,
`EFFECT_CHOICES`, the Effect Choices list; `smoke-cast`. Not this family: Bait and Switch's fan
(the maneuver machine's) and an activity whose effects all stand at once (Bless, the auras).

**Hex is an effect choice, and its move is a move** (2026-10-13, the user: "model more after hunters mark --- Cast
Hex / Move Hex as the two options ... apply just that ability debuff plus the damage rider debuff ... move needs to
work and not take a spell slot"). The pack lands all six "Hexed <Ability>" on every cast and move; the row asks the
ability and lands one, drawn with its own icon and told as the curse (`img`, `says`): that one effect is also
the mark the rider reads, so the hit's Necrotic and the check's Disadvantage are one effect. **The pick is the
caster's** (the popup's subject is the card's actor, the first target only for a self cast): a curse on a foe was
the GM's to answer before. The buttons drop a word every option shares ("Strength", not "Hexed Strength").
`MARK_USES` (Hex, Hunter's Mark): the system's picker offers the cast and the move as "Cast Hex" / "Move Hex",
never the rider's own damage activity; the move skips the system's dialog and spends no slot, joins the caster's
standing Concentration on the spell (its effect hangs on it) and lifts the earlier mark from whoever wore it.
`hit-riders.js`, `cast.js`. **The higher slot's longer Concentration** (the user: "its only doing 1 hour tho its
upcast to lvl 3"): `SLOT_DURATIONS` — Hex 4 hours at level 2, 8 at 3–4, 24 at 5+; Hunter's Mark 8 at 3–4, 24 at
5+ — on the curse and on the caster's Concentration; a move takes the standing Concentration's clock. **The pick is
the picker's** (the user: "radio buttons and a 'Apply' or something button"): every effect choice is radios in an
even grid, Apply and Not now, the rule under its tick; the card keeps the pick and the tick, and the system's
Effects tray (every alternative with an Apply) is gone from it (DESIGN *Cards*).

## A listed reaction cast freestanding (2026-09-06)

**A reaction on the Interrupts list, cast with no hold waiting on the caster, self-aims like any
other SELF ability.** The v1.5.1 blanket carve-out is gone; the birth stamp asks whether a PENDING
hold names the caster (the hold's message exists before the answering cast's card) and only then
stands aside. Answering, the reaction is the hold's, once. `polish.js`; `smoke-cast` §6d, §6e; the
through-the-hold +5 is `smoke-hold`'s.

## Damage casts (2026-09-04, Heat Metal)

**A bare damage activity's dice are the module's to roll, once.** dnd5e follows a damage
activity's card with the damage ROLL DIALOG, which the module hides, so the dice never rolled. Now
a bare damage activity aimed at targets rolls at the use on the casting client (offered when the
caster wants their dice), the native follow-up switched off, landed by the no-attack applier with
a receipt. Volleys stay the volley machine's; a maneuver's damage activity is its die. **A listed
row demands the save its text ties to the damage** (`DAMAGE_SAVES`: Heat Metal's On Damage Save at
the same targets right after the dice; the drop is a judgment). `damage-casts.js`; `smoke-heatmetal`.

## Metamagic (2026-09-09, off `prototypes/metamagic.html`; Careful's ask 2026-09-18)

**Metamagic is a pick on the cast and a spend on the card; the module does the arithmetic the
option names and judges nothing else.** `metamagic.js`, `decide/metamagic.js`, `METAMAGIC`,
`TWINNED_EXCEPTIONS`, the Metamagic list; `smoke-metamagic`, `tests/decide-metamagic.test.js`.

- **The pick is a group in the system's own cast dialog** (one fieldset on the usage dialog's
  render hook; never the attack gate). Every row: a tick, the name, the cost as the tag, the rule
  folded under. A row the spell does not fit, or the points cannot afford, stays visible and greyed
  with the reason. **One option per cast.** Empowered and Seeking are later moments.
- **The spend is BY HAND** (`spendPoolUse` on Font of Magic, `poolSpend` on the spell's card, one
  line, the floating text every decrement gets), read by the ONE reader. Never refunded on a revert.
- **Careful lists NOBODY in the casting window; the creatures to spare are asked on the card**
  once the cast is out — the creatures the save REACHES, every non-hostile ticked by default up
  to the Charisma modifier, the demand waiting on the answer or the clock's default; a protected
  creature leaves the demand at BOTH filters (the stamp and the area's adoption). The tick is the
  player's; sight and willingness are never judged.
- **Heightened marks one target on the demand** (a radio in the window; nobody for a template
  spell) and the save gate reads it as a Disadvantage source.
- **Subtle and Quickened are a card line and a spend.** Components never read, the turn never
  policed.
- **Twinned is a DATA read** (the pack's target-count formula over the cast's level) corrected by
  `TWINNED_EXCEPTIONS` (Magic Missile and Scorching Ray out; Jump in); the count is never policed.
  **Distant** doubles the range the gate's reminder reads; **Extended** doubles the clock on the
  effects the cast creates (24 h cap) and gives the concentration gate an Advantage source;
  **Transmuted** retypes the cast's own damage parts; **Twinned** adds one creature to the target
  snapshot (`messageConfig`).
- **Empowered and Seeking are folds AFTER a roll.** Seeking is a d20 fold KIND, offered on a spell
  attack's miss beside Heroic Inspiration, one point by hand. Empowered opens on the spell's damage
  with the dice shown, up to CHA-mod picked and rerolled (Reroll greyed until a die is ticked), and
  PATCHES the damage message's own roll the way the dice rules do; damage already applied is moved
  by the difference as its own receipt. Both record old and new dice.
  Empowered is **damage only** ("when you roll damage for a spell"): a spell's healing, which dnd5e
  rolls through the same damage roll, is never offered it (the walk, 2026-09-26: Cure Wounds showed
  Empowered beside Healer's reroll).
- **The ask timer keeps rolling for PCs** — an afk table plays through. Careful is the fix for the
  excluded, not the timer.
- **Using an option from the SHEET arms nothing** (2026-09-24): the casting window is where
  metamagic lives; an armed-chip design was weighed and declined.

Read: the metamagic feats on the sheet (`type.subtype: "metamagic"`), Font of Magic as the pool,
the SPELL's own save, range, duration, damage types and target scaling. Not judged: sight, a
willing creature, a Twinned target's legality, whether a levelled spell was already cast this
turn. The 2014 options are ignored.

## Spells that choose their targets (2026-09-24, off the prototype *Creatures of Your Choice*)

**A placed area asks everyone it holds; a spell whose text says "creatures of your choice" asks
the caster who.** Slow was the case. `CHOSEN_AREAS`, the Chosen Areas list (the PHB's seven: Slow,
Sleep, Conjure Barrage, Conjure Volley, Word of Radiance, Destructive Wave, Weird — dnd5e's
`target.affects.choice` flags only four, so the flag is not the membership); `saves/demand.js`
`areaChoiceForDemand`. A spell that chooses by TARGETING needs nothing.

- **Asked only when there is a real choice:** the area holds someone not hostile, or more hostiles
  than the spell lets the caster choose (the number read off the spell's own text, never stored).
  Otherwise every hostile is the choice and the card still says who.
- **The question is the ask at the area** (Careful's popup, clock and answer — a third kind):
  the spell's sentence quoted, the hostiles ticked, a tick pinging the token; the clock keeps the
  ticked default; the caster and a corpse are never candidates; the demand waits, clockless.
- **Heightened on such a spell asks ONE question** (a Disadvantage radio beside each ticked row).
  **Careful greys** on a listed spell.
- **The picture waits for the answer:** the hold registry holds the cast's activity from the
  card's birth, and the answer lifts it.
- **The record** is `areaChoice` on the spell's card (`chosen`, `left`, `asked`), one line, and a
  `choice` moment when the caster was asked.

**The ask is its own machine since 2026-09-24** (user: "better to pay this debt now than later"):
`scripts/area-ask.js`, a service both metamagic and the saves machine route the question through
— the popup, the clock, the answer, the demand filled from it, `bythebooks.areaAskAnswered`
published — with its arithmetic in `decide/area-ask.js` (the defaults, the words, the outcome).
A customer raises the ask by writing its flag (`newAsk`, `raiseAsk`) and may register an
ANSWER PART for what its answer writes (metamagic's record, its held card). The flag key stays
`metamagicAsk`: it is stored on cards, and a rename is a migration for nothing.

**Sleep is on this path, as it has been since the list's birth** (2026-10-21, read against the code after
Echoes of Halruaa's session of 2026-10-20: Tychon's Sleep over two grimlocks and the intellect devourer, the
table unsure the Sphere was "of your choice"; the user: *"follow the same pattern as other spells where you
can choose allies/enemies"*). Sleep is a `CHOSEN_AREAS` row on Slow's path; nothing in the code leaves it out.

- **No number:** its text says "each creature of your choice", so `choiceCapFrom` reads none and the ask
  is "Who does Sleep affect?" with every hostile ticked and no cap; the clock keeps that default.
- **Who is asked about:** the creatures standing in the placed Sphere, never the caster. A friend, a
  neutral or a secret token among them asks; a Sphere of hostiles alone asks nobody (the ruling above), and
  the card's line still names the chosen. A cast at targets with no area placed takes its targets as the choice.
- **Only the chosen roll:** the unchosen get no row on the demand, no save and nothing lands on them.
- **What the chosen meet is the spell's own, unchanged:** the Sleeping effect on the failure, the turn-end
  repeat, Unconscious pressed on the second failure, damage ending it, the save that cannot fail against
  magical sleep (Trance, Immunity to Exhaustion — *Session zero's combat*).
- **Held by** `smoke-spells` §11, the first live run of Sleep's choice (§10 casts at a target and
  `smoke-metamagic` §20–§22 place only Slow's Cube), and `tests/decide-area-ask.test.js`.

## Slice A — species and origin feats (2026-09-24)

**The first slice of the sweep: every PHB species trait and origin feat, read against the tables
that exist** (SWEEP §6 is the drawing — the measured inventory, what is NATIVE, OUT, parked and
held). Built on the user's "go" in three tiers, the UI ruled off `prototypes/slice-a.html`.

- **PHB first.** Arcana Unleashed's ten origin feats are the phase after (three need module work).
- **The tiers.** Tier 1: the save gate reads FEATURE rows, and Stone's Endurance on
  `INTERRUPT_REDUCTIONS`. Tier 2: Hill's Tumble on the hit menu, Fire's Burn and Frost's Chill as
  clock riders. Tier 3: *Rescuing the hit* (the `roll` interrupt) and *Savage Attacker*, below.
- **Check the existing shapes first — a STANDING RULE** (user, 2026-09-24: *"fires burn should
  pretty much have the same shape as that gloomstalker attack no?"* → *"yes you should switch"*).
  Reviewing any new feature starts by naming the PRECEDENT row — the table and the row it already
  resembles — before a table or a kind is chosen. Tier 2 first put all three Goliath boons on the
  hit menu; a Goliath owns ONE boon, so the hit never asks WHICH, only whether — the rider's
  question, not the menu's. The two with dice moved to `CLOCK_RIDERS` the same day.
- **One pick per hit on the hit menu, for now** (decided 2026-09-24): the offer keeps one tick
  across its groups. The trigger for the array shape is a Goliath Battle Master at the table
  (BACKLOG *Features*); the bend is in the register above.
- **One rescue row per SOURCE** (user, 2026-09-24: *"we already have that precedent with Precision
  and Heroic Inspiration, so it would just be more button choices"*) — Lucky, Warding Flare and
  Shadowy Dodge are three rows, never one "Disadvantage" row listing its sources.
- **Parked** (BACKLOG *Features*, each with its trigger): Trance. (Built in the walk, 2026-09-25:
  Inner Radiance's pulse and Celestial Revelation's extra damage — *The Aasimar walk*; Lucky's
  Advantage half and Relentless Endurance — *The species walk, continued*; Healer's healing
  rerolls — *The origin feats*; all below.)

**The save gate reads features** (tier 1; `EFFECT_BENDS` rows `match: "feature"` with a `saves`
facet; `decide/reminders.js` `rowCarriers`, one carrier test for the check gate and both save
readers). Brave, Fey Ancestry and Dwarven Resilience ship as text alone, so the row is carried by
the feature's NAME and scoped by the demand's statuses the Aura of Purity way: a save against a
demand that would impose Frightened (Charmed, Poisoned) counts Advantage. A save to END the
condition is a bare sheet roll with no demand — listed, not counted (the register). Dwarven
Resilience's Poison Resistance is the species' own advancement. `smoke-saves` §26,
`tests/decide-reminders.test.js`.

**Stone's Endurance reduces the hit by its roll** (tier 1): the second `INTERRUPT_REDUCTIONS` row,
Parry's shape — the pack's heal formula (`1d12 + @abilities.con.mod`) IS the reduction, rolled in
the open at the answer, one use of the item spent. It speaks in its own voice: the row carries its
eyebrow ("Reaction", not "Maneuver"), what one use is called, the trigger and the reduction in
words, stamped on the hold flag. The lookup is locale-proof (its activity's stored name is empty —
NOTES §2). Before the row it held as a plain damage interrupt: Cast used the heal (healing a
Goliath at full HP) and the whole hit landed "reduce by hand". Attack hits only (the register).
`smoke-superiority` §12.

**The Goliath's boons** (tier 2, switched the same day). **Fire's Burn and Frost's Chill ride as
clock riders** (`CLOCK_RIDERS` `when: "any"` — every hit, uses permitting; weapon, unarmed or
spell attack): a ticked checkbox on the offer like every rider, the die in the boon's own type,
one use of the ITEM spent (the species packs keep every use on the item), the offer and the card
calling it by the feature's name. Frost's Chill's own "Chilled" lands on the hit through
`effect-riders.js` `applyActivityEffectsOnHit`, clocked the Slow mastery's way — to the start of
the ATTACKER's next turn. **Hill's Tumble stays on the hit menu** as the Giant Ancestry group (no
feature to require — the parent is text only; each option pays from its own uses): a no-save
Prone press, receipted, never pressed over a Prone already standing, greyed "too large" when a hit
target's sheet says larger than Large (an unreadable size never greys it). A boon publishes
`rider`, not `maneuver`. `smoke-clock` §8–9, `smoke-hitmenu` §12–15.

## Rescuing the hit — the `roll` interrupt (2026-09-24, off `prototypes/slice-a.html`)

**A defender's Disadvantage on an attack roll already made: a second d20, the lower standing, the
verdict taken again.** Lucky's Disadvantage, Warding Flare, Shadowy Dodge — the third interrupt
KIND beside `ac` and `damage` (the R4 pin 30 → 31): not `ac` (the AC never moves, and a natural 20
can be undone) and not `damage` (it changes whether the attack hit). The three differ only in
what they COST, so the cost is data (`INTERRUPT_ROLLS`: the Reaction, an item use, what a use is
called, the answering activity, what the rule leaves to the table after). Membership is the
Interrupt list (`Name:roll`). `hold/answer.js`, `hold/lookup.js`, `decide/rescue-hit.js`;
`smoke-rescue`, `tests/decide-rescue-hit.test.js`, `tests/decide-verdict.test.js`.

- **Offered to the defender AFTER the roll shows a hit, before the damage** — the timing bend,
  accepted (the register). A crit can be undone, so the popup opens on a crit when a `roll` row is
  live, and the crit's dice wait for the answer (the register).
- **The hold's popup, grown rows:** every way to rescue the hit a ticked row — the reaction the
  list found (Shield, Parry) and every `roll` row the sheet holds — the name, what it does, a FACT
  as the tag (the cost, or why it cannot be taken), the rule folded under. **One row per source**
  (Slice A, above). Titled **"Rescue the hit — <defender>"** once several rows sit in it; one row
  keeps the house's `Name — who`. One tick at a time, Answer live only while a row is ticked — the
  tick stays even on a one-row popup. A spent row stays, greyed, its reason as the tag ("Reaction
  spent this round", "no Luck Points left", "already at Disadvantage", "a crit ignores AC").
  **Every row spent → no popup**, the way a spent Reaction has always skipped Shield.
- **The arithmetic** (`disadvantageOutcome`): a plain roll rolls a second d20 in the open with the
  attack's own die modifiers (a Halfling attacker's natural-1 reroll rides it), the lower standing;
  a roll with Advantage cancels to the first die, no second rolled (the register); a roll already
  at Disadvantage moves nothing, so the row is shown spent. The stood d20 carries its own crit and
  fumble — a natural 20 replaced by a lower die is no longer a crit — so it folds in as a
  `replace` beside the live AC, never an `add`.
- **The spend is by hand** (Parry's precedent: a `use()` would post a card, and Warding Flare's
  would place its 30-foot area): a Luck Point or a use through the one pass-through, the Reaction
  chip. A row used from the SHEET answers too — the ONE oldest pending hold that asks this defender
  with the row live (Disadvantage is imposed on "that roll").
- **The cards:** the defender's says what it cost ("1 Luck Point spent · Luck Points: 2 of 3
  remaining"; Shadowy Dodge's adds the teleport as a line — the table moves the token); the
  attacker's reads *"Lucky bent the roll — Disadvantage, 17 → 13, MISS"*, the struck d20 under it.
- **Known gaps** (DESIGN §8): Warding Flare protects its owner only; the attacker's own rescues are
  not re-offered after a bent miss.

- **An offer that cannot win is not made** (2026-10-13, the user: "no i dont want offers if they cant win ...
  just like shield"). A d20 fold is offered only when its best outcome reaches the target, as Shield is offered only
  when its +5 turns the hit: a die's largest face added (a Bardic Inspiration d8 never offered 9 short), a natural 20
  plus the roll's modifier for a reroll, a verdict always. The target is the module's own number: the easiest AC an
  attack missed, a demanded save's DC; a plain check (Tactical Mind's) has none, so its offers stand. The re-offer
  after a spend asks again from where the roll then stands. `decide/rescue-hit.js` `foldCanReach`, `d20-folds.js`;
  `tests/decide-rescue-hit.test.js`.

## Savage Attacker (2026-09-24, off `prototypes/slice-a.html`)

**A popup on the weapon hit asks ONE thing — use it on THIS hit? — and on yes the higher set
stands with no second question** (R1: the rules leave no choice once both sets are seen). Once per
turn, and a Fighter with Extra Attack may want it for a bigger roll later, so whether is the
player's; which set is not. `damage-either.js` (a MACHINE), `decide/damage-dice.js`,
`DAMAGE_EITHER`, the Damage Rolled Twice list; `smoke-savage`, `tests/decide-damage-dice.test.js`.

- **The question waits for the hit to stand.** The damage message is born with the fold due and
  the application held (a second claim in `auto-apply.js`); the popup opens only once the
  defender's hold is off the roll — the card says "asks once the hit stands" meanwhile — and a
  hold that turned the hit into a miss resolves it moot. The dice land ONCE, with the set that
  stood.
- **The popup is a one-row tick** (the tick stays on a one-row popup, the ruling): "Roll again"
  dark until ticked, "Keep the roll"; the clock keeps the roll.
- **"The weapon's damage dice"** are every die of the activity's own damage rolls — counted at
  `preRollDamage` before any rider pushes its roll, the doubled set on a crit — never a modifier,
  never a rider's dice. Rolled again as ONE set on its own card; the higher total stands (a tie
  keeps the first); the damage roll shows both, the loser struck.
- **Once per turn** is the clock riders' turn chit (`riderKey` `savage-attacker`), counted only for
  a combatant; a second hit the same turn carries only the tag "used this turn". A weapon item
  only. Damage already applied is moved by the difference (the ARCHITECTURE §11 obligation,
  Empowered's `moveAppliedDamage`) — with the claim holding the application, a belt, not the road.
- **Not a kind:** one table read by one machine, the `CLOCK_RIDERS` / `METAMAGIC` shape; a second
  customer is a row. The published word is `fold`.

## The Aasimar walk (2026-09-25, the Slice A walk by hand)

**The walk goes species by species, then the origin feats; each opens with a *Trait | What you
should see* table** (user, 2026-09-25). The Aasimar's findings, each ruled in the walk and built on
the user's word; `smoke-aasimar` (29 checks), `tests/decide-token-lights.test.js`, and the
Celestial Revelation cases in `tests/decide-clock.test.js` / `tests/decide-emanations.test.js`.

- **Every area that starts on its user lands on the user's token — no placement click** (user:
  *"it should always just be centered on the token without additional placing"*; the class ruled
  as *every self-centered area*). The Spirit Guardians idiom, generalized (`emanations.js`
  `selfAreaOf`): a `radius` (or `emanation`) template with range self — any spell, species form or
  monster feature — has the system's placement prompt switched off and its Region placed at the
  use, attached to the token, the placement's own flags stamped. A listed emanation spell's region
  stays the machine's (no platform behaviour); every other area is the platform's, its own
  behaviours on it. **None is drawn** (user, 2026-09-25: *"it can be invisible, just like inner
  radiance"* — the ring ruling of 2026-09-18, reaching every area placed on a token). The Emanations switch gates it.
- **An area whose activity names who it affects is read that way** (`decide/emanations.js`
  `affectsAdmits`; the save demand's area adoption): `enemy` takes everyone not on the user's side,
  `ally` the user's side. Necrotic Shroud (`enemy`; *"creatures other than your allies"*) no longer
  asks the Aasimar's friends beside it.
- **Necrotic Shroud's Frightened lasts until the end of the Aasimar's next turn** — a PACK defect
  (60 seconds), fixed in **Errata 5e E-002** (the sister module; user, then of its predecessor:
  *"put the fix in the vendor fixes sister repo"*), never here: the copy's clock becomes the system's `sourceEnd`. By the Books depends on it
  (the register's Dependents).
- **Inner Radiance pulses** (user: *"inner radiance needs to pulse - you can probably shape it like
  spirit guardians in part"*). An `EMANATIONS` feature row with three new fields: `while` (it
  stands only while the form's effect, Searing Radiance, stands on the bearer — the transformation
  ends, the ring goes), `reach: "all"` (*"each creature within 10 feet of you"* — allies included,
  as written; user: *"Everyone, as written"*), and `pulse` (at the END of the BEARER's turn — no
  region event carries it, so the turn moving is read — the activity's own `@prof` part rolled once
  on the bearer, applied to everyone the ring holds on one card with receipts; forward moves only,
  once per ended turn). Out of combat there are no turns and no pulse.
- **No damage at the transform** (user: *"No damage at transform"*): the pack models the pulse as
  damage on use; the use is the transformation alone — no area placed, the system's follow-up roll
  off, and the bare-damage machine (`damage-casts.js`) steps aside for a pulse form. The pulse is
  the damage. (Built here, not in Errata 5e: the pulse reads the pack's own damage part.)
- **Token lights** (user: *"add the bright/dim light settings … edit the Light spell so it adds light
  emission to a token target as well"*): a new table, `TOKEN_LIGHTS`, and machine,
  `token-lights.js`; the Token Lights list. Foundry 14 applies an effect change keyed `token.*` to
  the bearer's tokens (`light` is a targetable key), so the light is two changes on an effect and
  lives and dies with it — no token document is written. **Inner Radiance** lands its own Searing
  Radiance on the Aasimar (nothing else lands a damage activity's effect on its user) with 10 ft
  Bright / 20 ft Dim — that effect is what the ring's `while` and the rider's form read. **Light**
  cast at targeted tokens lights each (20 / 40, the spell's hour) instead of summoning its object;
  casting it again puts the caster's earlier light out; cast at nobody, the pack's summon stands.
  **Any targeted token** (user: *"Any targeted token"*) — friend, foe or self; the rule's "object
  not worn or carried by someone else" is the table's to name, and the PHB's Light has no save.
- **Celestial Revelation's extra damage** (user: *"you need to add this in and not skip it"*): a
  `CLOCK_RIDERS` row with no activity — its `amount` is the text's `@prof` — judged `transformed`
  by the FORM that stands (`forms`: Heavenly Wings' and Searing Radiance's own effects, and for
  Necrotic Shroud, which lands nothing on its bearer, the module's form chip written at its use,
  matched by flag — never by the name a frightened creature also wears). Radiant, or necrotic for
  the Shroud; once per turn by the rider chit. An attack — weapon or spell — carries it on the roll
  like every rider. **A spell with no attack roll** may hit many and the extra goes to ONE target,
  the caster's choice (R1): once its damage lands, its card offers a button per damaged creature;
  the pick lands on its own card with a receipt (the bend: the register).

## The species walk, continued (2026-09-25)

**Every PHB species walked and passed on the sandbox, one at a time** (the user's order, each
opening with its *Trait | What you should see* table; the roster was the `BTB Species` actors,
level-5 characters built through dnd5e advancement). The findings, each ruled in the walk and built
on the user's word. The full battery proved them on 2026-09-26.

- **Dragonborn, Elves' Fey Ancestry, Gnomish Cunning, Halfling's Luck, Skillful, Versatile,
  Adrenaline Rush, Fiendish Legacy** — native or already Slice A's; no findings.
- **Stonecunning** (user: *"just run it always and assume stone ... change the vision type to
  tremor sense for the duration"*): a new table, `TOKEN_SENSES`, and the Token Senses list — the
  pack's own Stonecunning effect gains Tremorsense vision and Feel Tremor detection (60 ft) as it is
  created, so the sense lives and dies with the effect.
- **Pass without Trace** (user: *"an emanation similar to the paladin one, but grants +10
  stealth"*): an `EMANATIONS` row (spell, helpful, the pack's Concealed effect). The pack's spell
  carries no area — **Errata 5e E-003** gives it the 30-foot Emanation.
- **Tinker** (user: *"just give a buff called tiny clockwork device ... the rest is played at
  table"*; reworked: *"a popup to create the clockwork with x/3 remaining ... to max 3"*): a new
  table, `CARD_CHIPS`, and the Card Chips list — the Rock Gnome's Prestidigitation cast asks
  *Build it* / *Not now* with the count; each device is its own chip (the `stacks` flag); a build
  at three asks which to remove first; the card's button recalls the ask.
- **The Goliaths** — the boons' uses shown ("2 of 3 uses left", read off `@prof`); **Large Form**
  resizes the token (`TOKEN_SIZES`, the Token Sizes list, Enlarge/Reduce beside it); **Storm's
  Thunder** is the first row of `REBUKES` (`rebukes.js`; Hellish Rebuke, Fount of Moonlight,
  Retaliation and Sword of Answering beside it) — a popup to the damaged creature when its dealer
  stands inside the reaction's own range, and the thunder lands on the DEALER; **Stone's Endurance
  on any damage** the module applies (ruled *"Hold before it lands"*: `damage-holds.js` claims the
  share at `auto-apply.js`'s `registerDamageClaim` and asks in ONE popup; the click rolls and lands
  the damage reduced); **Powerful Build** as a proxy (Advantage on Athletics/Acrobatics while
  Grappled, an `EFFECT_BENDS` `checksWhen` row). Three rows in the register.
- **Lucky's Advantage half** (user: *"we need to unpark the advantage on our own d20"*; ruled off a
  prototype, not kept): the gate's BUY box — "Lucky — 1 Luck Point · N left" with an
  Advantage tick in any attack, save, check or initiative dialog, counted in the net and the
  default, spent when the roll goes out ticked (`advantage-buys.js`, the Reminder Sources `buy`
  row). Initiative with no dialog is the fifth D20 fold kind, `advantage` (ruled *"After the
  roll"*): a second d20, the higher standing (the register). `smoke-lucky`.
- **Resourceful** (user: *"just needs [Heroic Inspiration] to be ticked on long rest"*): a new
  table, `REST_GRANTS`, and the Rest Grants list; the grant rides the rest's own actor update
  (`dnd5e.preRestCompleted`), the rest card names it; a Short Rest gives nothing. `smoke-rest`.
- **Relentless Endurance, with Death Ward** (user: *"if something takes them to zero, then a popup
  should ask to use the feat. same shape as death ward which you should do now too"*): a new table,
  `DROP_TO_ONE`, and the Drop to 1 HP list (`drop-to-one.js`) — at `dnd5e.preApplyDamage` the HP is
  written as 1 in the damage's own update; Relentless Endurance ASKS (Drop to 1 spends the use,
  Drop to 0 or the clock lands the 0; never against an outright kill); Death Ward is automatic, its
  effect removed. Sheet-typed HP goes around it (the register). Slice B adds its monster rows.
  `smoke-drop`.
- **Hellish Rebuke from Fiendish Legacy**: a spell with its own use left needs no slot — the
  rebuke casts with `consume.spellSlot: false` and the use pays.

## The origin feats (2026-09-25, off `prototypes/origin-feats.html`)

**The five PHB origin feats with a table moment, walked on the `BTB Feats` roster** (level-5
characters built through advancement, the feat the background's own). Tough, Magic Initiate,
Crafter and Skilled are native or out of combat. Proved by the full battery, 2026-09-26.

- **Savage Attacker's hint** (the walk, off `prototypes/savage-hint.html`): a die meter in the popup's header (the first roll against
  the average, the odds a second beats it); the tick starts TICKED on a roll under the average;
  both buttons side by side, the tick greying the other. The clock keeps the roll.
- **Tavern Brawler's push** (user: *"mimic the shield master push"*): the maneuver-fold kind
  `shove` in `bash-offer.js` — Push 5 feet / Pass after an Unarmed Strike hit's damage, once per
  turn in combat, announced (the module never moves the token). **Its die on the plain Unarmed
  Strike** (user: *"every time I roll unarmed strike damage it's a 4"* → *"Module swaps it"*, *"but
  give some kind of notice"*): a new table, `UNARMED_DICE`, and the Unarmed Strike Dice list
  (`unarmed-dice.js`) — the flat 1 + Str becomes the formula the feature's own unarmed attack
  carries (1d4r1 + Str) at `preRollDamage`, with one line on the damage card; a strike already
  rolling a die is left alone.
- **Healer's rerolls** (ruled off the prototype: the 1s start ticked): a new table, `HEAL_REROLLS`,
  and the Healing Rerolls list (`heal-rerolls.js`, the heal applier's claim in `cast.js`) — a
  healing roll showing a 1 opens a popup with every die as a chip, the 1s ticked; the healing
  waits for the answer and lands once. **Battle Medic on the Healer's Kit** (user: *"if in 5 feet,
  give the 'caster' of healer kit option to choose hit dice and make the roll for the other
  player"*, *"and then reroll 1 option"*): a new table, `KIT_TENDS`, and the Kit Tending list
  (`kit-tend.js`) — the kit used on one creature within 5 ft asks which of ITS Hit Dice (the
  largest ticked); Tend spends the die and rolls the feat's own Heal dN, so the rerolls popup
  follows. **A picked die shows** — `paintDieChip` (ui.js) for this popup and Empowered Spell's.
- **Alert's Initiative Swap** (ruled: the player's pick is the ally's willingness): a new table,
  `INITIATIVE_SWAPS`, and the Initiative Swaps list (`initiative-swap.js`) — once every combatant
  has an Initiative, the holder is asked once per combat with the tracker in order; the allies on
  its side who are not Incapacitated are pickable, their portraits framed in the MAP's disposition
  colours (ruled *"Map colours"*); a pick previews the trade; Swap exchanges the two numbers.
  The tracker's Reset Initiative re-arms it (`Combat#resetAll` is ONE Combat update).
- **Musician's Encouraging Song** (user, the Rest Grants shape): a `to: "allies"` row on
  `REST_GRANTS` — after a Short or Long Rest a popup lists the allies within 30 ft, those without
  Heroic Inspiration ticked up to the Proficiency Bonus, those with it greyed "(has it)"; OK ticks
  their boxes. Its landing posts its own card and floats over each recipient (*Musician's song lands*).

## The fighting styles (2026-09-26, off `prototypes/damage-rules.html`)

**Every PHB Fighting Style measured against the pack, and the gaps built on the user's go.** The
rulings: *"one table"*; *"gate it on what pc is holding - not overall rule, we want flows to work,
not editing items"*; *"the feats that do weapon mods should be effects on the player ... so itd
show in the detailed buff bar"*; the notice **B**, the guards **P1**, Protection **R1**, Unarmed
Fighting **U1**, *"truesight yes"*. `smoke-damage-rules` (31 checks), `smoke-guards` (15),
`tests/decide-damage-rules.test.js`.

- **Native, nothing built:** Archery (the pack's +2 on ranged attacks — dnd5e counts a thrown
  melee weapon as ranged too, and that reading stands), Blessed Warrior, Druidic Warrior, Arcane
  Warrior (Arcana Unleashed).
- **The Fighting Styles table and list** (`DAMAGE_RULES`, `damage-rules.js`): each listed
  style keeps ONE effect on the character — its **face** — live, or disabled with the reason ("a
  second weapon held (Dagger)", "no armor worn"), read off the sheet's **Equipped** boxes (held =
  equipped, the register). The effect view's panel lists it (Passive when live, Unavailable with
  why when off; never the bar). Where the pack ships an UNGATED effect (Defense, Dueling — their
  notes say "disable it when …"), the machine switches that off and the face carries the rule
  (Defense's AC change, read off the pack's effect); unlisting the style gives it back.
- **The face on the panel is ONE line, no suffix** (the walk, 2026-09-26: "i only want one line";
  then "just remove the (weapon) suffix. the player can figure things out"): "Fighting Style:
  Great Weapon Fighting"; why it is off is the hover title. Consistent across every style
  ("whatever the official feat name is"): a Fighting Style feat's OWN effect (Blind Fighting's
  senses) is titled by the feat too, found by dnd5e's `fightingStyle` subtype. **Thrown Weapon Fighting's face is
  always on** — the attack's thrown mode is its whole gate ("the user selects the thrown attack
  mode").
- **A face that turns on or off floats core's own toggle** with the panel's title in it —
  "+(Fighting Style: Defense)" / "−(Fighting Style: Defense)", drawn as core draws every effect's
  (the walk, 2026-09-26: "the toggle should be the standard +/- every other effect uses"; "match
  the buff name"); the module draws it for every face, since core floats only an effect with
  changes, and quiets core's on the face writes so Defense floats once.
- **The numbers on the roll** (`preRollDamage`, by the attack's own mode): **Great Weapon
  Fighting** floors every damage die of the attack at 3 (`min3`, a crit's doubled dice included —
  "a damage die"), only in two hands with a Two-Handed or Versatile melee weapon; **Thrown Weapon
  Fighting** +2 on a thrown attack; **Two-Weapon Fighting** the ability modifier back on the
  off-hand attack (dnd5e keeps a negative one already); **Dueling** +2 (the pack's number) with one
  melee weapon in one hand and no other weapon — a Versatile weapon swung two-handed says "Dueling
  off — two hands", and nothing else does (a line on every Greatsword swing was noise).
- **The notice, L4 + F7** (the walk, 2026-09-26, ruled off the Artifact "GWF Notice Options":
  "the player needs something fun or cool when they see it doing extra damage on the canvas, like
  they appreciate takig the feat, but it should be unobtrusive"; "like the empower where you pick
  dice is fun, or savage attacker, but oviously for these it cant require clicks"). Per style that
  CHANGED the roll, the damage card's line shows the attack's own dice as Empowered's chips, in the
  card's own ink (the gold line read badly on the parchment): a die Great Weapon Fighting raised
  turns over from its face to what it counts, once as the card is born, and keeps a gold edge
  (bronze on the light theme) with the old face ghosted; the gain follows ("+2"). A flat bonus
  (Dueling, Thrown, Two-Weapon) is one more chip. On the canvas the same chips rise off the
  ATTACKER's own token, the turned die flipping with a gold flash, about a second and a half,
  never over the target (its damage number stands alone); off with core's scrolling-status
  setting. The `fightingStyle` record carries each style's `gain` for the stats reader
  (ARCHITECTURE §4) and the chips' `dice`. A floor that raised nothing leaves no trace.
- **The dice that rise — THE RULE, settled; do not reopen** (the walk, 2026-09-26: "make this a rule
  too so we dont keep revisiting"; its shape: a reaction, or a situational effect — "eg gwf, duelist,
  twf, etc"). The canvas dice (`dice-rise.js`, every client sees them) play for:
  1. **A reaction — or a spend — that modifies a roll already made**: the bent d20s (Protection,
     Lucky, Warding Flare, Shadowy Dodge); the reductions (Interception, Parry, Stone's Endurance —
     the die off whoever reacted, "−N" drifting to the one protected); Shield's "+5 AC"; a fold's die
     or reroll (Bardic Inspiration, Tactical Mind, Heroic Inspiration, Lucky); Empowered's, Healer's
     and Savage Attacker's rerolls; Cutting Words when it is built.
  2. **A situational effect** — one that fires only when its circumstances line up, not every turn
     by default ("not like every turn by default"; "situational is best"), so
     the player needs to SEE that it did: the Fighting Styles (Great Weapon Fighting's floor, Dueling, Thrown,
     Two-Weapon), and the dice the platform changes on its own (`changedDice`: Halfling Luck,
     Reliable Talent, Elemental Adept, Tavern Brawler).
  Nothing else. Dice ADDED every time as the roll is made — Sneak Attack, Divine Smite, Hunter's
  Mark, Bless, Bane — stay on the card ("its kinda spammy if we take it too far ... it does open the
  floodgates"). A new rule is sorted by these two, not re-asked.
  **Where they rise** (the table, 2026-10-14): over the ONE whose number changed, nowhere else. A bent attack or
  check (Cutting Words' die, Portent's face) over the roller, never the one hit; a reduction with its share known
  (Cutting Words' damage half, Interception) over the one who takes the damage, nothing over the reducer and
  nothing in flight. Two cards: the modifier or the new face first, then a beat later the old value turning over
  to the new ("−5", then "19" → "14"; "2", then "20" → "2"; "−3", then "5" → "2"). Shield's "+5 AC" stays over the
  one hit, whose AC it is; Parry's reduction, its share unknown, keeps the die off the reducer and the drift.
- **Unarmed Fighting:** its die on the sheet's plain Unarmed Strike rides the Unarmed Strike Dice
  table (a `hands` row: the feat's d8 attack with nothing held, its d6 otherwise; two rows on one
  actor swap in the larger die). **At the start of the turn** (U1) the owner of a grapple is asked
  "Deal 1d4 to the … you're grappling?" — Deal it uses the feat's own Grappled Damage activity at
  the pick; the clock deals it to the one creature known to be held (the register).
- **Blind Fighting — who sees the unseen** (`decide/reminders.js` `sightOf`): Invisible's own
  clause ("If a creature can somehow see you …") read off the senses — a creature whose Blindsight
  reaches the other sees it (the hidden too), whose Truesight reaches it sees the invisible; the
  condition's bend is LISTED with why, never counted. Any creature's senses, not the feat's alone.
- **The guards — Protection and Interception** answer for the creature BESIDE them, a new shape:
  every creature within 5 ft of the one hit, on its side, not the attacker, holding what the style
  demands (a Shield; a Shield or a Simple/Martial weapon), its Reaction free (the register: the side
  is read, sight is not). **P1:** each guard gets a popup of its own; any act settles the moment, the
  first winning; a pass settles it only when everyone asked has passed. **Protection (R1)** is a
  `roll` row with `ally` — asked after the roll shows a hit, Lucky's shape: the second d20, the
  lower standing, the attack card naming the guard; then "Protected — <guard>" lands on the
  protected creature until the start of the guard's next turn, and the gate gives every attack at it
  Disadvantage while the guard stands within 5 ft (`EFFECT_BENDS` "Protected (Protection)":
  `named`, `item`, `sourceWithin`). When the attack already rolled with Disadvantage the guard is
  still asked — greyed, "no effect — already at Disadvantage", the popup saying Disadvantage doesn't
  stack and the Reaction is better kept, the button "Keep my Reaction" (the walk, 2026-09-26: "pop
  it up, but say its not worth spending reaction"). **Interception** is an `INTERRUPT_REDUCTIONS` row with `ally` —
  the attack's damage is claimed at the applier (Stone's Endurance's seam), the first guard to
  intercept rolls 1d10 + PB and the damage lands short by it.
- **Found on the way:** dnd5e 6.0 stamps an applied effect's origin with the ACTIVITY, so the gate's
  `item` discriminator never knew the item — Protection from Evil and Good's "Protected" matched
  every "Protected" (the Aura of Protection's included). The gate reads through to the item now.

## The PHB feats — the first batch (2026-09-26)

**The feats a table first played, first.** The origin feats and styles were in already; of the PHB
general feats, Great Weapon Master, Heavy Armor Master, Shield Master and Fey-Touched came first.
Rulings: Great Weapon Master's damage rides the hit; Heavy Armor Master blocks damage the way Stone's
Endurance and Protection do; Great Weapon Master is also the situational bonus with damage; Interpose Shield **B**, bent by choice (the rule-of-cool table above). `smoke-damage-rules`
§11–§12, `tests/decide-damage-rules.test.js`.

- **Two rows on `DAMAGE_RULES`** (the table's comment asked for it: a second customer is a row),
  `feat: true` so the face and its float wear the feat's own name, not "Fighting Style:".
- **Heavy Weapon Mastery** — gate `heavy`: the face is live with a Heavy weapon equipped; a Heavy
  weapon's damage on the owner's own turn gets +PB on the roll, "Great Weapon Master — +3" on the
  card and the +3 chip rising off the attacker (the dice that rise, the situational kind); an
  Opportunity Attack says "off — not your turn". The pack's separate "Heavy Weapon Damage" button
  stays on the sheet — pressing it as well would add it twice. Hew was in already (`hew.js`).
- **Heavy Armor Master** — gate `heavyArmor`, `takesOver` (the pack's always-on `traits.dm`
  effect is switched off — every copy of the feat by name, found when a lent copy sat beside the
  fixture's own and the damage was cut twice); `block: "@prof"` on an attack's Bludgeoning,
  Piercing and Slashing damage at `dnd5e.preCalculateDamage`, so the card's own buttons carry it
  too. The block pops "−3" over the armored creature on every client (Stone's Endurance's pop, no
  roll — it rides the damage's own actor update) and the receipt row says "Heavy Armor Master —
  blocked 3".
- **Native, nothing built:** Shield Master's bash and Interpose Shield (built in v1.19, the
  maneuver folds), Hew, Fey-Touched (Misty Step and its spell, the pack's own free casts), Tough.
- ⚠ **A world's Fighting Styles list is stored**: the new default adds the two names; a world with
  the old value runs neither until the names are added (or Reset Defaults).

## The PHB feats — the scope (2026-09-26)

**The user's first pass over the 2024 PHB feats not yet in, ruled off one list.** The origin
feats, the fighting styles and the party's own (above) were in; the rest were read against the
pack (`tools/scan-corpus.mjs`, the sandbox, 2026-09-26) and sorted. The user pulled back every
feat whose shape the module already has (*"inspiring leader, its just like musician"*, *"chef
as well, same shape again"*, *"skulker, some shapes like fs: blind"*, *"keep slasher"*).

- **Out: the epic boons**, all of them (*"scope out epic boons"*).
- **Out, nothing for By the Books to do (19):** Ability Score Improvement, Actor, Athlete,
  Durable (the pack's effect gives Advantage on death saves; Speedy Recovery is its own
  activity), Dual Wielder, Heavily Armored, Keen Mind, Lightly Armored, Martial Weapon Training,
  Medium Armor Master, Moderately Armored, Observant, Resilient, Ritual Caster, Shadow-Touched,
  Skill Expert, Speedy, Telekinetic, Telepathic.
- **In, to build (13)** — the precedent row named per feat before a table is chosen (SWEEP §1):

| Feat | What By the Books owes | The shape it looks like |
| --- | --- | --- |
| Chef | Replenishing Meal's extra 1d8 on the allies' Hit Dice during a Short Rest; Bolstering Treats after a Long Rest (the pack's own heal activities) | Musician's rest grant; the meal lands DURING the rest, the others after |
| Crossbow Expert | no Disadvantage for a ranged attack within 5 feet | a range-row canceller (SWEEP §3 item 6) |
| Elemental Adept | the chosen type's resistance ignored; its 1s count as 2s — the pack ships text only | dnd5e's `ignore.resistance` set off the attacker's feat, at the damage chokepoint Heavy Armor Master uses |
| Inspiring Leader | temp HP to up to six creatures within 30 feet after a Short or Long Rest | Musician's rest grant, a temp-HP grant |
| Mage Slayer | Disadvantage on the concentration save its damage forces; Guarded Mind turns a failed Int/Wis/Cha save into a success | the concentration machine; a save fold |
| Piercer | reroll one Piercing damage die once per turn; the crit's extra die | Savage Attacker's damage-die kind |
| Poisoner | Potent Poison: the poison damage ignores resistance (Apply Poison and the doses are the pack's) | Elemental Adept's, one row |
| Polearm Master | Reactive Strike when a creature enters the reach | a reaction attack, Riposte's shape — ⚠ the trigger is movement, measure first |
| Sentinel | the reaction attack on a Disengage or an attack on someone else; Halt, speed 0 on an Opportunity Attack's hit | Polearm Master's, built together |
| Sharpshooter | cover, long range and an enemy within 5 feet cancelled | the range-row canceller |
| Skulker | nothing, measured 2026-09-26: the pack's effect is already named Skulker in the view, and nothing ends Hidden on an attack (dnd5e 6.0.5 nor the module), so Sniper has nothing to keep | the gate's sight (`sightOf`) already reads its Blindsight 10; Fog of War is the pack's |
| Slasher | Hamstring: speed −10 feet on a Slashing hit, once per turn; the crit's Disadvantage (NOT in before — see the second pass) | a hit rider, Frost's Chill's shape |
| Spell Sniper | cover and an enemy within 5 feet cancelled for spell attacks | the range-row canceller |

- **Kept open, a lean either way (5):** Charger (the damage or push after a 10-foot straight
  move — movement the module does not track), Crusher's 5-foot push, Grappler's Punch and Grab,
  Mounted Combatant's rest (no mount at the table), War Caster's Reactive Spell.
- **The second pass (user, 2026-09-26, off the measurement):** Elemental Adept's type is read off
  the item's NAME ("Elemental Adept (Fire)"); Chef's Bolstering Treats become temp HP handed out
  after the Long Rest (a bend by choice); Crusher's push joins the build (Tavern Brawler's shove);
  Charger, Grappler's Punch and Grab, Mounted Combatant's rest and War Caster's Reactive Spell are
  PARKED. ⚠ Correction: Crusher's and Slasher's crit halves were NOT in — `EFFECT_BENDS` rows
  nothing applied, and the pack's "Slashed" is Hamstring's speed −10. The build is six groups;
  1–3 are built (below), 4–6 since 2026-09-27 (*The PHB feats — groups 4–6*,
  Polearm Master included).
- ⚠ **Measured, and a comment corrected with the build:** `decide/dice-chips.js` says dnd5e floors
  Elemental Adept's 1s to 2 on its own; the pack ships the feat as text only, so nothing does.

## The dice changers — automatic where there is no choice (2026-09-26)

**A dice change that can never make the roll worse is not a choice, so it asks nothing** (DESIGN R1;
the user, the PHB feats walk: *"make adept automatic, fix healer that way too"* — *"yea then its
consistent with that great weapon one"*). The "you can" in Elemental Adept's and Healer's text has
one sensible answer, the way Great Weapon Fighting's does.

- **Elemental Adept stays automatic** — its type's 1s count as 2 (the `min2` floor, group 1).
- **Elemental Adept's type is asked as the feat LANDS** (the user: *"how to assist players ... when
  they level up ... they will have the unautomated version of the feat"* — *"A is good"*): the pack's
  copy carries no type, so a typeless copy arriving on a character (a level-up, a drag, a drop) posts
  a card to its owners and opens a popup — Acid, Cold, Fire, Lightning, Thunder, less the types its
  other copies already name, and Later. The answer renames the copy "Elemental Adept (Fire)"; the
  card's Choose type… button asks again; a rename by hand settles the card too; and a click on a
  typeless feat on the sheet (its own card, `dnd5e.displayCard`) asks there as well (`damage-rules.js`,
  the row's `choices`).
- **Healer rerolls every 1 as the dice land** — no popup; the healing waits for the new dice and
  lands once, the new die on its own card and over the healer on the canvas (`heal-rerolls.js`, the
  same road, the ask taken out).
- **A reroll keeps its die's floor** (`decide/damage-dice.js` `rerollFaces`): a new face under the
  term's `minN` counts N, the way Foundry's `Die#minimum` counts it — so Aster's Empowered reroll that
  lands on a fire 1 is still a 2, and a Piercer reroll under Great Weapon Fighting is still a 3.
- **The choices keep their popups**: Empowered Spell (a point, the dice picked), Savage Attacker and
  Piercer (once per turn).
- **One shared dice popup** was drawn and liked (*"the ui looks good for the dice rerollers"*,
  [prototypes/dice-popup.html](prototypes/dice-popup.html)), parked the same hour, and BUILT on
  2026-09-27 — *The dice changers — one popup*, below.

## The dice changers — one popup (2026-09-27)

**Every feature that changes a damage roll's landed dice is a row of ONE popup per roll** (the
user: *"maybe its time to solve for dice changers to fix the piercer/savage attacker"*; the shape
off [prototypes/dice-popup.html](prototypes/dice-popup.html), less Healer and Elemental Adept, which
were ruled automatic). One machine, [dice-changers.js](scripts/dice-changers.js), replaces the two
copies (Empowered's in metamagic.js, Savage's and Piercer's in damage-either.js — gone).

- **The rows.** Empowered Spell (pick up to CHA-mod dice, 1 SP at the answer), Savage Attacker (the
  weapon's set again, the higher stands), Piercer (one die again, the new roll stands). A character
  holding two of them on one roll gets one popup with both rows — the Piercer-beside-Savage gap
  (BACKLOG, 2026-09-26) is closed. A spell attack dealing Piercing damage (Ice Knife) can show
  Empowered and Piercer together.
- **The order: pick, then set, then one** (the user's pick, *"Savage first, auto die"*). One Apply
  runs the ticked rows in that order; **Piercer's die is chosen AFTER Savage's set stands**, off the
  faces standing then — still never asked which die (the group 3 ruling), and never wasted by a set
  that replaced it.
- **The ticks.** A roll-again row starts where its die meter leans (option D, 2026-09-25: under the
  average, ticked); the meter shows the first roll-again row's odds. Empowered's row follows its
  chips — a pick ticks it, the last chip let go unticks it — so a point is spent only on dice chosen.
- **The buttons** — both, the ticks pick which is live (the Savage popup's rule, 2026-09-25): Apply
  while the plan does something, Keep the roll while nothing is ticked. One row asking keeps its own
  words ("Roll again", "Reroll the picked dice"); two or more say "Apply" and ask "change the dice?".
- **The record** is `diceChange` on the damage message, one per roll, a row per feature; born due at
  `preRollDamage` (Empowered too, now), promoted once the attack's hold is off the roll, a claim
  on an attack's application while it asks (the dice land once). The old `either` and `empowered`
  keys are no longer written; a card from v2.4.0 or earlier still reads its line on a reload.
- **One announce card** carries every step's fresh dice (Dice So Nice rolls them), a line per step,
  and the canvas replay of all of them in order; each roll-again row writes its own once-per-turn
  chit; the moment publishes once per row (`fold` for a set or one die, `metamagic` for Empowered).

## The hit menu — a pick per group (2026-09-27)

**One pick per GROUP, and a pick in each group rides the one hit** (the user: "fix them all";
BACKLOG since Slice A, 2026-09-24). "You can use only one maneuver per attack" binds Combat
Superiority's own rows; Giant Ancestry's Hill's Tumble is not a maneuver, and the rules let a
Goliath Battle Master knock the target Prone AND ride a maneuver on one hit.

- **The offer**: a tick unticks only its own group's other rows; with two groups the line says
  "one pick per group".
- **The records are lists** — `hitPick` on the attack (`picks`), `hitManeuver` on the damage roll
  (`picks`), read through one reader (decide/hit-menu.js `picksOf`, which reads a record from
  before the list as a list of one). A die rides the roll as its own part per pick, a pool is
  spent per pick, a card per pick, the moment published per pick (`maneuver` for a Superiority
  die, `rider` for a Giant Ancestry boon).

## Trance (2026-09-27)

**"Magic can't put you to sleep" — a save against magic whose failure would put the Elf to sleep
cannot fail** (the user: "fix them all"; parked since Slice A). The 2024 Sleep spell says it
outright ("Creatures that don't sleep, such as elves … automatically succeed").

- **Which demands sleep is read off the data**, never a spell list: the demand stamps `sleep` when
  the spell's name or one of its failed-save effects' names says sleep (Sleep, Symbol's Sleep,
  Eyebite's Asleep — decide/demand.js `putsToSleep`), beside `spell` (a spell or a magical item —
  "magic"). A sleep that is not magic (a monster's breath) is not Trance's.
- **The shape is the automatic failure's mirror**: a `succeeds` facet on the effect table's feature
  row; the save gate nets `succeeds` and adds a green **Succeeds** button, the default; pressed, the
  verdict is SAVED with no die ("cannot fail (Trance)") and the failed-save effect never lands;
  the buzzer takes the same fold. A condition's automatic failure stands over it.
- **A sheet roll with no demand lists the row** (the facet's scope, "it cannot fail if this is
  one"), as every save facet is listed there; a concentration check never takes it.
- **The Long Rest in 4 hours** is the platform's rest, untouched.

## The PHB feats — groups 1–3 (2026-09-26)

**Built in one autonomous pass** (the user: *"work autonomously til done with 1-3"*), off the scope
above. The calls made while the user was away are marked ⓐ. **WALKED 2026-09-26 on the walk scene**
(`tools/content/place-feats-walk.mjs`), feat by feat, all eight good; every ⓐ call stands, with one
later ruling: Elemental Adept's floor stays automatic and survives a reroll (*The dice changers*,
above). The range feats keep no list of their own
(the user: *"this is fine leave it to the table"*). Poisoner's Apply Poison became a Poison Coating on
the character the same walk (*Bent by choice*).

**Group 1 — the damage rules** (`damage-rules.js`, two `DAMAGE_RULES` rows, gate `always`).
- **Elemental Adept**: the type is read off the feat's NAME — "Elemental Adept (Fire)", every copy
  adding its own (the user's ruling); a copy with no type is a greyed face that says how to rename
  it. A spell's damage of the type ignores Resistance — dnd5e's own `options.ignore.resistance`,
  set at `dnd5e.preCalculateDamage` off the damage card's actor (Heavy Armor Master's seam, the
  attacker's side), so the card's buttons carry it too; the receipt row says "Elemental Adept —
  ignores fire resistance". Its 1s count as 2 — Great Weapon Fighting's floor at 2, ⓐ on that
  type's dice only (a spell dealing two types floors one), with the card line and the dice that rise.
- **Poisoner**: Potent Poison — any Poison damage its owner deals ignores Resistance to Poison.
- `smoke-damage-rules` §13, `tests/decide-damage-rules.test.js`.

**Group 2 — the range cancellers** (`reminders.js`, `RANGE_FEATS`).
- A cancelled range row is **listed with the feat, never counted** ("Ranged attack within 5 feet of
  Hobgoblin — Crossbow Expert: no Disadvantage") — Blindsight's shape; ⓐ no prototype, the gate's
  existing listed box. Beyond long range still cannot be made.
- **Sharpshooter** (a Ranged weapon — ⓐ by its kind, so a dart thrown counts and a dagger thrown does
  not): long range, point-blank, cover. **Spell Sniper** (a spell's attack roll): point-blank, cover,
  +60 ft on a range of 10 ft or more. **Crossbow Expert** (the three crossbows): point-blank; its
  Dual Wielding is a `DAMAGE_RULES` row (gate `offhandCrossbow`), and beside Two-Weapon Fighting
  the modifier is given back ONCE.
- **Bypass Cover** is the one new seam: the attack RECORDS each target's AC without its cover bonus
  (`system.targets[].ac`, dialog or no dialog), so the card's hit and miss are right on every
  client; the card says "Sharpshooter — ignores the Goblin's cover (+2 AC)" and the gate lists it.
  An AC override carries no cover in dnd5e 6.0.5 and is left alone; Total Cover records no AC.
- ⓐ No list of their own: the Reminder Sources' `range` kind is the switch (the data settles the
  rule — DESIGN R1).
- `smoke-reminders` §13, `smoke-damage-rules` §14, `tests/decide-reminders.test.js`.

**Group 3 — the on-hit riders** (`clock-riders.js`, `CLOCK_RIDERS`; `bash-offer.js`; `damage-either.js`).
- **Slasher**: Hamstring rides a Slashing hit once per turn (a ticked row on the damage offer, "you
  can") and lands **"Hamstrung"** — the pack's speed −10 under its own name; a Critical Hit lands
  **"Slashed"**, which the gate reads as Disadvantage. ⓐ The split: the pack's one "Slashed" effect
  carried both, and applied on every Hamstring the gate would have counted a crit's Disadvantage.
- **Crusher**: its crit lands the pack's **"Crushed"** (Advantage against it); its push is a
  `SHOVES` row on the shove offer — any hit that deals Bludgeoning, any reach, a target no more
  than one size larger (the data settles it), its own once-per-turn mark (`crushUsed`).
- **Piercer**: its crit rolls one more die than the crit's double (dnd5e's own
  `critical.bonusDice`). Puncture is a `DAMAGE_EITHER` row with `one`: Savage Attacker's popup,
  unchanged — ⓐ **the die is the module's pick**, the one with the most to gain (its size's
  average less its face), so the popup asks only whether ("roll the 1 on the d6 again?"), and the
  new roll stands, lower or not.
- The effect-only riders' clock is Frost's Chill's (`slow`: until the start of the attacker's next
  turn). `smoke-clock` §10, `smoke-savage` §11, `smoke-maneuvers` C, `tests/decide-clock.test.js`,
  `tests/decide-damage-dice.test.js`.
- ⚠ **Stored lists**: a world keeps its own Fighting Styles, Clock Riders, Damage Rolled Twice and
  Maneuver Folds lists — the new names arrive with Reset Defaults or by hand (BACKLOG, the next
  release).

## The PHB feats — groups 4–6 (2026-09-27)

**Built in one autonomous pass** (the user: *"do a careful run of 4-6, working on each with full
review and not guessing/memory as to the shape it should be"*), off BACKLOG's drawing of
2026-09-26 — each feat measured on the pack first (`tools/probe-pack-shapes.mjs`, the sandbox,
2026-09-27) and its precedent named before a table was chosen (SWEEP §1). The calls made while the
user was away are marked ⓐ; nothing here is walked yet.

**Group 4 — the saves: Mage Slayer.** The pack ships one activity, Guard Mind (a utility that
spends the item's one use, back on a Short or Long Rest), and nothing for the breaker.
- **Concentration Breaker** — a `DAMAGE_RULES` row (gate `always`, `feat`, `breaks:
  "concentration"`): the feat's face, and the Fighting Styles list its switch, as Elemental
  Adept's and Poisoner's damage rules are. The precedent is Extended Spell's mark on a
  concentration save: the concentration ask RECORDS the damage's dealer (the card that dealt it
  names its actor — `concentration.js` `breakerFor`), the ask card and its dialog say
  "Mage Slayer (Bramm) — the save is made at Disadvantage", and the save gate lists it, counted.
  The roll carries `disadvantage` alone, so dnd5e nets it with the concentrator's own Advantage:
  War Caster beside Mage Slayer is a plain roll. The buzzer and auto mode roll it too (Heightened
  Spell's buzzer, the same shape). Damage with no card (a sheet edit) names no dealer — nothing.
- **The walk, 2026-09-27** (the user: *"on the concentration save offer, you have the dc, so i dont
  think you need offer heroic inspiration if it passes"*): a concentration save answering the module's
  check is WITHHELD like a demanded save — the check owns the DC, so a rescue (Heroic Inspiration, a
  Bardic die) is offered only on a FAILURE, the spell stands while it is asked, and the rescue's reroll
  or die is folded into the verdict (`concentration.js`, the spine's withhold registry; the clock's own
  roll is never withheld). A concentration save rolled with no check pending keeps the sheet-save offer.
  `smoke-concentration` §17.
- **Found on the way, fixed with it:** the save gate never listed War Caster on a concentration
  save — dnd5e 6.0.5's `rollConcentration` reads `system.attributes.concentration.roll.mode`,
  a key the gate's mode reader did not know — so the net beside Mage Slayer would have been
  Disadvantage where the roll is plain. `modeKeys` reads it now (`tests/decide-reminders.test.js`).
- **Guarded Mind** — a new D20 fold kind, `succeed` (R4 pin 34 → 35): a failed Intelligence,
  Wisdom or Charisma save made a success, paid through the pack's own Guard Mind activity (dnd5e
  takes the use). No die and no reroll — the contribution is the VERDICT (`decide/verdict.js`,
  the save side's `verdict`, the way a negate hold forces the attack side's). Its row is
  `SAVE_SUCCEEDS` (the feat, the activity, the label, the three abilities, the rule verbatim); the
  D20 Folds list's `Mage Slayer:succeed` is the switch. Offered where the fold machine already
  offers: on a save the module DEMANDED, after the failure and before the verdict applies (the
  withhold), the save's own verdict line then reading "saved (Guarded Mind)"; on a save rolled from
  the sheet, as an offer the roller judges — no DC exists there (the DC finding).
- ⚠ **Stored lists**: a world keeps its own Fighting Styles and D20 Folds lists — the two new
  names arrive with Reset Defaults or by hand.
- `smoke-concentration` §16, `smoke-saves` §27, `smoke-d20-folds` §11, `tests/decide-verdict.test.js`,
  `tests/decide-reminders.test.js`, `tests/decide-present.test.js`, `tests/decide-registry.test.js`.

**Group 5 — the rest grants: Inspiring Leader, Chef.** Musician's after-rest popup (`REST_GRANTS`
`to: "allies"`, `rest-grants.js`), grown two grants; the amounts are the pack's own heal activities'
(N1), never typed.
- **Inspiring Leader** (`grant: "temphp"`): after a Short or Long Rest, up to six creatures within
  30 ft, the owner too (`self`), each given Temporary Hit Points = the activity's formula (level + the
  modifier). ⓐ The activity is the one for the ability the feat RAISED — its own Ability Score
  Improvement record (`asiAssigned`, moved to `lookup.js` with this second customer), else the higher
  modifier of the activities the sheet still carries (the Poisoner's pick). ⓐ Temporary Hit Points do
  not stack, so a creature already holding as many is greyed "(has N temp HP)" and one holding fewer
  is raised to the amount (`decide/rest-grants.js` `holdsTemp`).
  ⓐ The rest card's own activity list (dnd5e lists a feat's rest-period activities) keeps only that
  one of the pack's two, called **"Inspire with Performance"** (the row's `label`; the walk, 2026-09-27:
  *"saying with wis or cha is nonsensical"*, *"Inspire with Performance is fine (just once)"*).
  `smoke-rest` §8d takes the feat through its record, the lower ability.
- **Chef — Bolstering Treats**: after a Long Rest, the Proficiency Bonus in Temporary Hit Points to
  up to that many creatures — handed out, a bend by choice (ruled 2026-09-26; *Bent by choice*). ⓐ The
  rule names no distance, so every ally on the scene is listed (`reach: null`); the owner too.
- **Chef — Replenishing Meal** (`grant: "meal"`): after the Chef's Short Rest, up to 4 + the
  Proficiency Bonus eaters (the text's number; the pack's activity targets 4). Every creature rests on
  its own client in any order, so ⓐ the meal is judged per eater off its OWN Short Rest card — which
  the module now stamps with the Hit Dice spent (`restSpent`; dnd5e writes it only in words, NOTES §2):
  rested and spent Hit Dice → the activity's 1d8 is healed at once, the dice on one card; rested and
  spent none → greyed "(spent no Hit Dice)"; still resting → the eater carries the meal (`mealFed`, an
  actor flag) and its own rest's end heals it if it spent a Hit Die. ⓐ "The same rest" is the same
  Rest request when both rests answer one, else ends within two hours of each other.
- ⚠ **Stored list**: a world keeps its own Rest Grants list — "Inspiring Leader, Bolstering Treats,
  Replenishing Meal" arrive with Reset Defaults or by hand.
- `smoke-rest` §8–§11, `tests/decide-rest-grants.test.js`.

**Group 6 — the reaction attacks: Sentinel; Polearm Master (ruled off options, below).** SWEEP §1's "Turn chit / the Reaction" family; the precedent is Retaliation's row on
`REBUKES` — a Reaction taken when damage lands, answered with one melee attack with the weapon last
swung (`rebukes.js`).
- **Guardian** — a `REBUKES` row with `ward`: the bearer is a BYSTANDER. When an attack's damage lands
  (`hit`: its card an attack's), every OTHER creature on the scene holding a listed ward — not the one
  hit, not the one hitting — within 5 ft of the hitter is asked (`stampWards`), Riposte's popup and
  card: "Hobgoblin hit Aster — strike?". Use drives the melee attack at the hitter, its cards marked
  `opportunity`; the Reaction is spent. ⓐ Asked only when the hitter stands on ANOTHER side of the map
  (token disposition): RAW any creature's hit triggers it, but a popup on every friend's hit is noise
  — punishing a friend stays a sheet attack. ⓐ Offered when the hit's damage LANDS (the rebukes' seam:
  after any reaction that could still turn the hit), so a hit dealing no damage asks nothing
  (*Where the table bends the rule*). The **Disengage** half is not offered — nothing records a
  Disengage (NOTES §2); the row's caveat says so.
- **Halt** — a `CLOCK_RIDERS` row (`judge: "opportunity"`): the pack's own "Halted" (Speed 0) lands on
  the hit (`lands`, group 3's path), for the rest of the CURRENT turn — the new `halt` clock, pinned to
  the turn it lands in rather than the attacker's (`TURN_PINNED`, `effect-riders.js` `clockPlace`);
  out of combat, the pack's own duration. Due on the Opportunity Attack the module drove, and ⓐ on any
  melee hit the Sentinel makes off its own turn in a running combat — an Opportunity Attack made from
  the sheet carries no mark of its own — ticked with the caveat "only on an Opportunity Attack".
- ⚠ **Stored lists**: a world keeps its own Rebukes and Clock Riders lists — "Sentinel" joins both.
- `smoke-goliath` §5, `tests/decide-rebukes.test.js`, `tests/decide-clock.test.js`.
- **Polearm Master — ruled off BACKLOG's options the same day** (the user: *"p1 gowith that"*; and
  for Reactive Strike: *"if wielding right weapon with polearm master, an invisible emanation. if a
  hostile person gets the emanation buff, then trigger a popup reminding the player they can attack
  (same shape as hew too)"*). Both halves are REMINDERS — the swing is from the sheet.
  - **Pole Strike** — a `BONUS_SWINGS` row (`when: "attack"`): after an attack with a Quarterstaff, a
    Spear or a Heavy + Reach weapon, on the owner's own turn and once per turn (out of combat, every
    such attack), Hew's OK-only popup and card say the Bonus Action swing with the other end is there
    (`hew.js`, the `hew` kind — Great Weapon Master's row keeps the crit-or-kill trigger, and a `hew`
    entry not in the table keeps it too). After the attack RESOLVES: on the hit's damage card, or on
    the attack card when it missed. The Maneuver Folds list's `Polearm Master:hew` is the switch.
    **The walk (2026-09-27): an OFFER, driven** (*"an offer to attack, using bonus action, player
    chooses yes or no, and then it does the attack for them"*): the popup asks **Pole Strike / Pass**;
    Use drives the WEAPON's own attack at the creature the triggering attack was aimed at, its damage
    die made a d4 and its type Bludgeoning before the roll (the Unarmed Strike's swap), a line on the
    card. So the weapon's own +1, masteries and styles ride it (the user: *"then pole strike will
    actually carry enhancements like +1 and stuff too"*) — the pack's feat-borne Pole Strike activity
    would carry none. Great Weapon Master's +PB stays off it: a Bonus Action is not "part of the Attack
    action" (`damage-rules.js`, the `heavy` gate).
    Every card of the swing is titled **"<weapon> — Pole Strike"** (the walk: *"needs suffix for attack
    and dmg cards too"*): the usage card's item snapshot is renamed at its birth; the attack and damage
    cards' header reads the LIVE item (`getAssociatedItem()`), so theirs is drawn at render
    (`SURFACES.cardHeaderTitle`).
  - **Reactive Strike** — an `EMANATIONS` feature row: while the owner HOLDS a qualifying weapon, an
    invisible, quiet ring of that weapon's reach (10 ft with Reach) stands around it (`holding`,
    `range: "weaponReach"`, `effect: null`, `quiet`); a hostile creature MOVING into it — Foundry's own
    `tokenMoveIn`, raised only when the creature itself moved (measured: the ring sliding over a
    standing creature raises none, and a teleport-style drag raises it) — posts Hew's reminder on the
    owner, "Reactive Strike — Hobgoblin entered Bramm's reach" (`alert`), unless its Reaction is
    spent or it is Incapacitated. Nothing is applied to the hostile: the "buff" is the ring's own entry
    event (ⓐ — a mark on every foe that stepped close would be noise on its token; the user asked,
    2026-09-27, whether the buff's own application would catch more — it is raised by the same entry
    event, so it would not). A creature PASSING THROUGH the reach in one move is caught too: Foundry
    splits a walked move at the edge of every region listening for entry
    (`TokenDocument#splitMovementPath`, 14.368), so the entry is a checkpoint of its own
    (`smoke-emanations` §17e). The Emanations list's "Polearm Master" is the switch.
  - `smoke-maneuvers` PS, `smoke-emanations` §17, `tests/decide-registry.test.js`.
  - ⚠ **Stored lists**: Maneuver Folds and Emanations — "Polearm Master" joins both.

## Measured cover (2026-09-27)

The user, 2026-09-27: "a person selects an actor token. when they hover over other tokens ... on top
of the list, in its own section called Cover, ... say if it has no cover, half, 3/4 or full. then the
player knows what they are dealing with. if they want, then can target/attack, and then the penalty
applies accordingly (taking into account sniper/sharpshooter)"; "we need to follow the 2024 dmg".
Un-parked from BACKLOG's *Cover, measured on hover*; DESIGN §8's cover row amended the same day.

- **The rule is the 2024 DMG's grid method** (Running Combat → Miniatures → Cover, read off the book
  on the box): lines from ONE corner of the attacker's space to the four corners of ANY ONE square
  the target occupies; 1–2 blocked is Half (+2 AC), 3–4 blocked but a line still reaches is
  Three-Quarters (+5 AC). The attacker picks the corner and the square: the answer is the LEAST
  cover over every corner × square (a Large target's clearest square).
- **A creature gives Half at most** — the PHB 2024 Cover table (Three-Quarters and Total are an
  object's). The DMG counts a creature as an obstacle for the lines; lines only a creature blocks
  never lift the degree past Half. Ally or foe alike. A hidden token and a dead one are not counted.
- **Total** is "no line reaches": every line from every corner to every square meets a wall.
- **The measure is not symmetric, and stays so** (the user, 2026-09-27, the walk: Elra had Half
  against Dorian's shot while Dorian had none against Elra's; offered a symmetric bend, ruled
  "keep the DMG rule as written"). The lines run from ONE corner of the attacker's space to ALL
  four corners of the target's square, so the creature standing beside an obstacle is the covered
  one.
- **Walls are the platform's MOVE collision test** (`CONFIG.Canvas.polygonBackends.move`): a closed
  door blocks, an open one does not, a one-way wall from its side only; a window (sight passes,
  bodies and arrows do not) is cover. Foundry walls have no height: a drawn wall is a whole wall,
  so a low wall a table wants as Half is set by hand (the status still counts — below).
- ⓐ **A line that only grazes an obstacle does not count** — the books are silent (the DMG's line of
  sight counts a touch; its cover rule says "blocked"). Two tokens side by side would otherwise
  cover each other along the shared edge. The corners sit a hair inside their squares and the
  creatures' boxes a hair inside their edges (`decide/cover.js`).
- **The hover card**: with ONE token controlled, pointing at another opens its card with a **Cover**
  section on top, TWO lines (the user, 2026-09-27: "keep it 2 lines, the cover amount with the AC
  mod, then second line the desc/whats in way"): "Half Cover (+2 AC)" (or No Cover, Three-Quarters
  Cover (+5 AC), Total Cover — nothing more: "for total cover you dont need to say cant be
  targeted"), then "Hobgoblin in the way" — and "· Sharpshooter
  ignores it (ranged weapon attacks)" (or Spell Sniper, spell attacks) when the controlled creature
  holds one. No Cover is its one line. Each degree carries a painted icon from Foundry's own library
  (the user: "nice icons ... color", "pulled from foundry library") — an open road, a low picket
  fence, a portcullis gate (the PHB's Three-Quarters example), a castle wall.
  The chip's colour reads for the ATTACKER: No Cover green (the user, 2026-09-27: "lets make no cover
  green"), Half and Three-Quarters orange, Total red. The effects follow under their own label. Still a pure view
  (*The effect view*).
- **At the attack** the same measure goes on each target's RECORDED AC (`system.targets[].ac`, the
  seam Bypass Cover already uses): the most protective degree applies and degrees never add — a
  cover status set by hand stands when it is higher; Total records no AC (a miss, as dnd5e records a
  `coverTotal` target). The card says the cover on EVERY attack while it is measured (the user, 2026-09-27: "a card
  should have the cover status on its attack roll"): "Cover — the Goblin: Half Cover (+2 AC)", "…: Total
  Cover" — and nothing for No Cover ("you dont need to put no cover on the card"); a hand-set status that wins is the one named. It is a ROW directly under the card's header
  (the user: "its not very prominent", "cover is like an important thing, it should be up above"):
  the degree's picture and colour, "Half Cover (+2 AC)" in bold, "vs Sharran Acolyte" under it —
  "· Sharpshooter ignores it" on the same row when a feat took it off. Then Sharpshooter and
  Spell Sniper take the whole carried cover off, measured and hand-set alike (*The PHB feats —
  groups 1–3*, group 2); Total stays.
- ⓐ **Attacks only.** A Dex save against an area measured from its point of origin is the DMG's too;
  not built (BACKLOG).
- ⓐ **Hex grids are not measured** (the DMG counts six corners there; no table plays on hexes) — no
  section, no change to the attack. A gridless scene measures each space as one square.
- Always on (*The settings*, below).
- The suites run with no cover: the harness flags every scene `noCover` and clears the flags it set
  at the teardown, because their fixtures stand creatures in a row on purpose and a measured +2 would move
  hit and miss under sections about something else. `smoke-reminders` §14 clears the flag.
- `tests/decide-cover.test.js`, `smoke-reminders` §14 (written 2026-09-27 while the sandbox ran the
  release battery; its first live run is owed).

## The settings (2026-09-27)

The user, 2026-09-27, ruling the draft list: *"this is fine for now"*, and agreeing with its three
calls. The vision behind it (DESIGN, the refactor's rulings of 2026-09-27): batteries included, a few configs for DMs;
midi is the alternative for a table that wants to configure everything.

- **Ten settings** (twelve since *Open roll by default*; thirteen since *Session zero's combat*, 2026-10-14: Going Down
  Costs a Level of Exhaustion, the one house rule, off by default). For the DM: Decision Timer, Dramatic Beat,
  Players Roll Their Own Saves, Concentration Checks Are Public, Hold Shows the Math, Optional
  Masteries, Resource Use Notices.
  For each player: Roll Your Own Damage, Effect Bar, Effect Cards on Hover and Alt.
- **Every machine is always on**: the resolver, applying damage, requiring a target, the hidden card
  buttons, the reaction hold, the riders, emanations, volleys, casts, saves, concentration and
  measured cover. A table that wants one off wants midi.
- **One Decision Timer** is the clock of every question: a reaction to a hit, an offered damage roll,
  a save, a concentration check, a mastery or maneuver offer, a reminder. A mandatory roll rolls when
  it runs out; an optional offer passes.
- **The NPC/PC split of the resolver is gone**: Roll Your Own Damage covers the player who wants to
  roll.
- **Players Roll Their Own Saves** covers the saves the module demands as well as concentration.
  "Roll automatically" rolls each on the roller's client at once, with no popup; a save the rules
  decide before the dice is recorded, not rolled.
- **Waiting for the dice is automatic**: a verdict waits up to 4 seconds for Dice So Nice's dice to
  come to rest. **Skip Hopeless Holds** follows Hold Shows the Math. A cast reaction's AC change is
  given 8 seconds to land.
- **The content tables are the only list** (the refactor's rulings, 2026-09-27): no
  per-world list and no per-row switch. Prod's saved lists all equalled the shipped defaults, so no
  house row was lost.

## Open roll by default (2026-10-09, issue #4)

The user's issue #4: install one thing and play, with every number on the table.

- **Two more settings, twelve in all.** Roll Results Players See (results, AC and DC by default;
  results only; hide all; leave it to dnd5e) and Bloodied Shows on Every Token (on by default).
  Both override dnd5e's Visibility menu, written by the active GM on load and on change, only where
  a key differs.
- **Bloodied off is dnd5e's `player`, never `none`**: `none` also stops dnd5e tracking the status.
  The automation (Bloodied Fury, Harvest Undead, Bloodthirst, heal-on-hit) reads Hit Points either way.
- **Hold Shows the Math is separate**: it governs the reaction popup for the one player deciding,
  not the public card.
- `concealItemDescriptions` is out of scope: it is not about combat results.

## The rule fold reads the book (2026-09-27, off the prototype *The rule fold*)

The user, 2026-09-27, choosing between three shapes: *"A, go with that"* — and of the link-only
shape, *"C is gonna have a lot of link noise"*.

- "the rule ▸" shows the paragraph the row is about, read from the item's own description: the
  paragraph whose bold lead names the row's benefit (Mage Slayer's **Guarded Mind.**), else the whole
  description. A condition or a mastery reads dnd5e's rules page for it.
- Nothing is copied into the code. A text the packs do not carry shows no fold, never a guess.
- The text is enriched; a roll link in it reads as plain text, so nothing rolls outside the machine.
  Foundry's private notes stay out.

## The slice order, off the drawings (2026-09-28)

The 2024 corpus was measured and drawn book by book ([audits/drawings/](audits/drawings/)) and the
order set off the drawings: **the spells slice, then Slice B, then session 0 of the next campaign
sets the class slices** (player-facing first, DESIGN N3; B is small and party-independent; the
classes wait for the party). The commission is HANDOFF.md.

- **A repeated save that succeeds ends the effect automatically** — the rule leaves no choice (R1)
  — **with a visible cue**: the effect's name floats off the token as it leaves (the scrolling text
  the use chips and the fighting styles draw), and the card records the end.
- **All three UI-shaped spell items are in the slice**, each ruled off a prototype first: the placed
  area that pulses, Sanctuary's gate, Mirror Image's defender interrupt.
- **The DMG is a register, not a slice**: its shapes are built with their PHB or Monster Manual
  customer; its own rows wait for the item to be found.
- **Relentless is not in the 2025 Monster Manual**; the kill moment's monster row is Undead
  Fortitude. Slice B is redrawn to five shapes in its drawing.
- **The drawings are the map, never a commission**: nothing in them is owed until the user sets it.

## The spells slice — Tiers 1 and 2 (2026-09-28, HANDOFF.md)

**Measured before a row was written** (`tools/probe-pack-shapes.mjs`, the sandbox on dnd5e 6.0.5): four of
the drawing's eight Tier 1 rows are the pack's already and got no row — **Haste** (Hasted carries the
Dexterity save mode), **Synaptic Static** (Muddled Thoughts carries the −1d6 on attacks, checks and
concentration), **Sorcerous Burst** (its damage is `1d8x@mod=8`: Foundry's own explode modifier with a
cap, the modifier's worth of extra d8s on an 8), and **Beacon of Hope's saves** (Hopeful carries the
Wisdom and death save modes). The rows that stayed:

| Spell | Table | What the module adds |
| --- | --- | --- |
| **Protection from Poison** | `EFFECT_BENDS` "Poison Protection" `saves` | Advantage against a demand that would poison — Dwarven Resilience's facet on an effect (the pack carries the resistance) |
| **Otto's Irresistible Dance** | `EFFECT_BENDS` "Irresistible Dance" + `REPEAT_SAVES` | attacks at Disadvantage, attacks against it at Advantage, Dexterity saves at Disadvantage — the facet's new `abilities` scope, the demand naming its ability; the repeat is the dancer's ACTION, offered on a card at its turn start, never demanded by the clock |
| **Beacon of Hope** | `HEAL_REROLLS` "Beacon of Hope" `max` | a creature wearing Hopeful is healed the roll's MAXIMUM by the cast path, the receipt saying so (the register above says what is not raised) |
| **Command** | `SAVE_PRESSES` "Command" `word` | the caster's word asked on the failure (the bash's shape, `saves/choices.js` kind `word`); Grovel presses Prone; the register row above |
| **Heroism** | `TURN_GRANTS` "Heroism" (new table, `turn-grants.js`) | the pack rolls the Temporary Hit Points once, at the cast; the machine rolls the spell's Heal activity again on the CASTER's numbers at each of the bearer's turn starts while Bravery stands, receipted. ⚠ The commission said a `CLOCK_RIDERS` facet; a table of its own because that one is keyed by the ATTACKER's feature and read at a hit, and this is keyed by an effect on the BEARER and read by the clock |

**Tier 2 — the repeating save, a KIND** (`REPEAT_SAVES`, the R4 tripwire 35 → 38: `turnEnd`, `damaged`,
`action`; `repeat-saves.js`). A row is keyed by the SPELL and names the pack's effect(s); the effect is
found on the bearer by its name AND its origin item together (a ghoul's Paralyzed is not Hold
Person's), the origin read through `effectSourceOf` (a tray-applied copy's `item` names the pack). The
save is the item's own save activity, demanded on a card of the machine's through the saves machine
(`effectsHandled: "repeat"`); **a success removes the effect through the cast card's receipt** (the
entry reverted — the same revert button the receipt carries), no choice (R1), and the card says
*"Paralyzed ended — the save succeeded"*; a failure says it holds. **The float:** Foundry v14 floats
`−(name)` off the token itself for any effect with a status or a change (NOTES §1), so the module
draws it only for a bare one (Confused). Tasha's damaged save has Advantage as the demand's OWN
bend (the gate lists it, the automatic roll rolls it). Phantasmal Killer's repeat takes none on a
success (the pack's "half" is the cast's). **The counters** (`count`): Contagion — three successes end
it, three failures lock the asking; Flesh to Stone — three failures press Petrified and lock, the
effect standing under it. Rows: Hold Person, Hold Monster, Tasha's Hideous Laughter, Blindness/Deafness,
Crown of Madness, Slow, Fear, Confusion, Phantasmal Killer, Eyebite (Panicked, Sickened), Contagion,
Flesh to Stone, the three Dominates, Otto's. Out on purpose: Eyebite's Asleep (ends on damage with no
save — the table's). ⚠ Contagion's pack lands all six Infected effects on a failure (the data; the
disease is the caster's pick — fix at the data, never a carve-out).

**The walk — Tier 1** (`tools/content/place-spells-walk.mjs` puts BTB Walk Cleric with the slice's spells
and two targets on the walk scene):

| Spell | What you should see |
| --- | --- |
| **Protection from Poison** on a target, then a poisoning save at it | the save dialog's section: "Poison Protection — against Poisoned", Net Advantage |
| **Otto's Irresistible Dance** landed, then a Dexterity save at the dancer | "Irresistible Dance — a Dexterity save", Net Disadvantage; an attack at it shows Advantage, its own attacks Disadvantage |
| **Beacon of Hope** on a target, then Cure Wounds at it | the receipt line says "Healing — Beacon of Hope — the maximum"; the Hit Points move by the dice's maximum |
| **Command** at a target that fails | the caster's popup: Approach / Flee / Grovel / Halt; Grovel → Prone lands, a card says who falls; any other word → a card says the table moves the token |
| **Heroism** on a target, then its turn starts | a "Turn start" card: "Heroism — <name> gains N Temporary Hit Points", N the caster's spellcasting modifier; once per turn |
| **Haste**, **Synaptic Static**, **Sorcerous Burst** | nothing of the module's: the pack does it (Hasted's Dexterity Advantage in the save dialog; Muddled Thoughts' −1d6 on the attack; an 8 on the Burst's d8 rolls another) |

**The walk — Tier 2:**

| Spell | What you should see |
| --- | --- |
| **Hold Person** landed, the target's turn ends | a "Repeated save" card; the save rolls (or asks); a failure: "Paralyzed holds — the save failed"; a success: "Paralyzed ended — the save succeeded", the effect gone, "−(Paralyzed)" floating off the token, the cast card's receipt row struck |
| **Tasha's Hideous Laughter** landed, damage the target | the repeat raised at once, "with Advantage" on the card and in the dialog's section; the turn end raises it too |
| **Otto's Irresistible Dance** landed, the dancer's turn starts | a card with a button "Repeat the save — your action"; the turn END raises nothing; the button raises the demand |
| **Flesh to Stone** landed, three failed turn ends | "1 of 3 failures", "2 of 3", then "the third failure: Petrified" — Petrified on the token, no fourth ask |
| **Dominate Person** landed, damage the target | the repeat raised on the damage, none at the turn end |
| **Confusion** landed, a successful turn end | the effect ends and the module's own "−(Confused)" floats (the platform draws none for a bare effect) |

## The spells slice — Tier 3 (2026-09-28, ruled off `prototypes/spells-slice.html`: "all drawn as, go")

**Two corrections to the commission before a line was written** (the PHB pack read on the sandbox): the
handoff carried 2014 rules in two places. **The placed area's trigger is enter / *ends its turn there* / the
area moved onto it, once per turn** — every 2024 spell in the list says so, and that is Spirit Guardians'
trigger word for word, so the area kind reuses it (the handoff said turn *start*). **Mirror Image rolls a d6
per remaining duplicate on each hit; any 3 or higher redirects** — the pack models it so with three
Duplicate effects (the d20 against 6 / 8 / 11 was 2014). Sanctuary was as drawn, plus its second clause: it
gates a *damaging spell* too, never an area.

### The area that pulses — `EMANATIONS` kind `area` (Moonbeam the customer)

The system's template is adopted where it was PLACED, attached to nothing: the caster drags it (the Magic
action that moves the beam, the fog's drift, the cube's teleport — all the caster's drag of the template)
and the platform raises the entry for whoever it then covers. The save is the activity's own, demanded on
the emanation's trigger card as Spirit Guardians' is; the area ends with the concentration. Rows: Moonbeam,
Insect Plague, Cloudkill (a save), **Cloud of Daggers** (plain damage, no save — rolled on the caster at the
cast's level and applied, receipted: the rule leaves no choice, R1). **Flaming Sphere is a summon:** "within
5 feet of the sphere" is a 5-foot feature ring around the sphere's own token (today's kind), its `Flames`
the save (the summon matches the caster's DC); rolling the sphere into a creature is an entry. Reach `all`:
"each creature", the caster too. Held out at the time: **Wall of Fire** (read as having no area in its data —
a misread: the pack carries the wall and the ring — and a one-sided 10-foot band), **Spike Growth** (damage
per 5 feet moved — DESIGN §4); both built with the held spells the same evening (*The spells slice — the held
spells*, below). The caveats the table plays: a shape-shifter's reversion, Obscured, Difficult Terrain.

- **A second trigger in the same turn says so** on a small card ("already saved this turn"), as Spirit Guardians does.
- **Who moves the area:** whoever may move the template on the platform.
- **An adopted emanation's cast asks once:** the cast's demand asks who stood inside at the cast; every later
  save is the region's trigger's (enter, turn end, the area moved). An arrival never joins the cast's demand
  (it would be asked twice — `saves/areas.js`), and an emanation placed with nobody inside owes nothing at
  the cast (`saves/demand.js`). Spirit Guardians gains this too.

### Sanctuary — `WARDS`, `wards.js` (the gate before the roll)

The buy box's seam: `dnd5e.preRollAttack` for any attack roll at the warded creature (any item, every
attack — a Bugbear with two attacks saves twice), `dnd5e.preUseActivity` for a spell with damage aimed at it
(no area: "doesn't protect the warded creature from areas of effect"; an attack-type spell is gated at its
roll). The use is vetoed, the ward item's own save activity demanded of the ATTACKER through the saves
machine on a card of the ward's; **a failure turns it aside** — the card says "no attack roll; choose a new
target, or the attack is lost", *turned aside* floats off the ward, and a new attack is a new attack (the
module spends and refunds nothing); **a success makes the use again** with a pass in hand, the roll dialog
asking as the first press would have. The ward is found by the effect's name AND its origin item (the
repeat's matcher), so a Warded from elsewhere is nobody's. **The ward ends** on its bearer's own attack roll,
any cast (cantrips and heals included — the rule says "casts a spell") or damage roll, no choice; a card
says why and the name floats off (a bare effect: the module draws it). A second customer waits:
**Unbreakable Majesty is NOT this shape in 2024** — its save comes AFTER a hit ("or the attack misses
instead"), the duplicates' seam with a save for the die.

### Mirror Image — `DUPLICATES`, the hold (the defender's interrupt after the verdict)

No popup, no Reaction (R1): on a hit that STILL stands after the defender's reactions (Shield, Lucky, the
guards — the other order would roll dice on hits a Shield then turns), a die per standing duplicate is rolled
in the open and rises off the token (the dice-that-rise rule's second case: a situational effect that
changes a roll's outcome); any face at 3 or higher redirects the hit to a duplicate, which is destroyed
(its effect deleted — Duplicate C first; the platform floats its name), and the hit is `absorbed` — a forced
verdict on the attack the applier drops, whatever AC it was judged against; the crit's damage goes with it.
The duplicates ride the hold: an entry the machine answers itself when nothing else asks. An attacker with
the Blinded condition, Blindsight or Truesight rolls nothing — read off its sheet — and one line says why.
The last duplicate destroyed ends the spell (the card says so).

**The walk — Tier 3** (`tools/content/place-spells-walk.mjs`: BTB Walk Cleric carries Moonbeam, Cloud of
Daggers, Cloudkill, Insect Plague, Flaming Sphere, Sanctuary, Mirror Image and Sacred Flame; BTB Walk Target
carries a Morningstar):

| Spell | What you should see |
| --- | --- |
| **Moonbeam** placed beside the Target, then the Target walks in | an "Emanation" card: "Moonbeam — BTB Walk Target entered BTB Walk Cleric's Moonbeam", a Constitution save, the 2d10 rolled; ending its turn inside asks again on a new turn, and a second entry in the same turn says "already saved this turn" |
| **Moonbeam** dragged onto the standing Ally | the same card for the Ally (reach `all`) |
| **Cloud of Daggers** placed, the Target walks in | a card with the 4d4 rolled and a receipt — no save; the Hit Points move |
| **Flaming Sphere** cast (the sphere summoned beside the Target), the Target's turn ends within 5 ft | the sphere's own ring: "Flaming Sphere — … ended its turn inside", a Dexterity save, the 2d6 |
| **Sanctuary** on the Ally, then the Target attacks the Ally | no attack roll: "Sanctuary — a save before the attack" on the Target's side, the Wisdom save; a failure: "turned aside" floats off the Ally and the card says to choose a new target; a success: the attack dialog opens and the attack rolls |
| **Sanctuary** on the Ally, then Sacred Flame at the Ally | the same gate before the cast; a Fireball at the Ally is not gated |
| the warded Ally attacks | "Sanctuary ended — BTB Walk Ally made an attack roll", the Warded effect gone, "−(Warded)" floating |
| **Mirror Image** on the Cleric, then the Target hits it | the dice rise off the Cleric (3d6, the redirecting face gold); a duplicate destroyed ("−(Duplicate C)" floats), "A duplicate takes the hit — duplicates: 2 of 3 left", no damage; low dice: "The hit gets through" and the damage lands |
| the last duplicate | "The last duplicate takes the hit — Mirror Image ended" |

## The spells slice — the held spells (2026-09-28, evening; HANDOFF.md §The held spells)

**The user's scope** (2026-09-28): *"build all three [Warding Bond, Vampiric Touch, Prismatic Spray], work
autonomously, push when done … we need to tackle wall of fire / spike growth … put force cage and magic circle
in scope. we can create the region for them, and partially implement them"*; then *"add counterspell back in
scope, the user can just target intended counterspell actor, and force them to make the con save per the spell.
the rest can be handled at table."* Every row measured on the pack first (`tools/probe-pack-shapes.mjs`, the
sandbox on dnd5e 6.0.5). **Not a kind moved:** three new tables that are not kinds, vocabulary on two that
exist, and one NATIVE.

| Spell | Table · machine | What the module adds |
| --- | --- | --- |
| **Warding Bond** | `DAMAGE_SHARES` · `damage-shares.js` (new) | the pack's Bonded carries the +1 AC, +1 saves and the resistance (NATIVE). The share is the module's: on `dnd5e.applyDamage` (the rebukes' seam — the one that knows the landing) the amount that LANDED on the bearer is applied to the caster as **untyped** damage — the same number, no second pass through the caster's resistances — with a receipt on a card of the machine's, no choice (R1); **beyond 60 feet** (`nearestFeet`) nothing is shared and the card says so; the **caster dropping to 0** ends the bond (Bonded deleted, the card says why). The bond's other ends — more than 60 feet apart, a re-cast on either — are the table's (the register) |
| **Vampiric Touch** | `HEAL_ON_HIT` · `heal-on-hit.js` (new; Lifedrinker's shape, SWEEP §3 item 4) | the pack's attack and 3d6 are NATIVE; the heal is the module's: on `dnd5e.applyDamage` the dealing card's activity answers the row, and **half the necrotic damage that landed** (by the rolled parts' proportion, floored) is healed on the caster with a receipt on the heal's own card, once per creature per card. "The attack again each turn as a Magic action" is the sheet's |
| **Prismatic Spray** | `RAY_TABLES` · `prismatic.js` (new) + a second `REPEAT_SAVES` row | the pack ships ONE Dexterity save with all five types on one 12d6 part, the two condition effects tied to it, and two bare save activities. The module: the cast's own demand is **closed as its card is born** (nothing asked at the cast; the 12d6 never rolls there); once the cone stands — the cast's placement, or a region placed after — the caster's driver **rolls a d8 per creature inside** (an 8 is two more draws, never a ray), posts one summary card with the dice, and raises **one demand per (creature, ray)**: rays 1–5 against the Cast's Dexterity save with the **ray's type forced onto the 12d6**; the indigo ray against "Indigo Save (Con)" and the violet ray against "Violet Save (Wis)", each landing its effect on a FAILURE by the machine's own hand (receipted). The cone goes with its rays (instantaneous). **The indigo repeat** is a second `REPEAT_SAVES` row keyed *Prismatic Spray (Indigo)* — the row's `item` names the spell, its `activity` the named save (two new words: a second row on one spell, a save that is not the spell's first) — Flesh to Stone's count: three successes end Restrained, three failures press Petrified. **The violet ray's later save is the table's** (the register): it falls at the caster's next turn start, the same edge dnd5e's own clock ends the Blinded on |
| **Wall of Fire** | `EMANATIONS` `area` + `band` | both activities carry a template (the wall's `wall/60`, the ring's `cylinder/10`) — the earlier "no area in its data" was a misread. The cast's own save (every creature in the wall as it appears) is the pack's, through the saves machine. The **burning side** is a BAND: at adoption the region is widened by 10 feet on the side AWAY from the caster (the default the text leaves to the caster), and the cast's card offers the other side by its compass name ("the north side"); the ring burns OUTSIDE by default (a ring of 10 feet beyond the wall), inside on the pick (the disc). Enter / turn-end inside the widened region demands the save as Moonbeam's does. The wall's height and opacity are the table's |
| **Spike Growth** | `EMANATIONS` `area` + `trigger on "move"` | the platform's own split of a move through the region (`segmentizeRegionMovementPath`, the same seam Polearm Master's reminder reads) gives the feet travelled INSIDE; per 5 feet the activity's 2d4, rolled once on the caster when the move lands and applied with a receipt, once per movement. **DESIGN §4's second exception**, the user's by name (the register: paid at the move's END, never as it goes; the mover is never paused, DESIGN §8). Difficult Terrain and the Perception check are the table's |
| **Magic Circle** | `EMANATIONS` `area` + `ask` · `gate` · `alert` (`kind: "notice"`) · `noCastSave` | the pack ships a Charisma save with the cylinder — for a teleport IN, never for standing inside, so the cast's demand is switched off (`noCastSave`). The region stands where placed for its hour (no concentration: the GM deletes it when the hour is up). **The types** are asked on the cast's card — every one of the five on by default, toggled there, the picks written to the region (a player's pick travels by relay; the active GM writes the region). **The Disadvantage**: the attack gate lists *"Magic Circle — a fiend attacking into the circle"* when the attacker's creature type is a chosen one and the target stands inside (`reminders.js`, read off the region and its picks). **The entry ban** is a notice card as a chosen-type creature MOVES IN — the move never paused (DESIGN §8). Possession, Charmed and Frightened from the warded types, and the reversed circle, are the table's |
| **Forcecage** | `EMANATIONS` `area` + `alert on "moveOut"` | two utility activities (the 20-ft cage, the 10-ft box), both cubes; the region stands where placed with the concentration. **The exit ban** is a notice card as a creature inside MOVES OUT — `moveOut` joins the alert vocabulary — the move never paused; the teleport-out save, the bars' cover and the box's blocking are the table's |
| **Counterspell** | NATIVE (the saves machine) | the pack's Counterspell is ONE save activity: Constitution, the caster's DC, one creature at 60 feet, a Reaction. The caster targets the creature whose spell they mean to counter and uses it; the saves machine demands the save of that target as it does for any targeted save. Nothing watches for the cast — *Bent by choice*, the user's ruling — and whether the spell was being cast, and what fails, is the table's |

**The walk — Tier 4** (`tools/content/place-spells-walk.mjs`: BTB Walk Cleric carries the eight; BTB Walk Target
and BTB Walk Ally stand 5 ft east of it; the Target is a Fiend for the circle):

| Spell | What you should see |
| --- | --- |
| **Warding Bond** on the Ally, then damage the Ally from any card (an attack, a save's damage, the tray) | a card "Warding Bond — BTB Walk Cleric takes N with BTB Walk Ally", the Cleric's Hit Points down by the same N with a receipt; the Ally 65 ft away: "takes nothing: … beyond the bond's 60 feet"; the Cleric dropped to 0 by a share: "Warding Bond ended — the caster dropped to 0 Hit Points", Bonded gone |
| **Vampiric Touch** at the Target (a hit) | the damage lands, then a card "Vampiric Touch — BTB Walk Cleric regains N Hit Points from BTB Walk Target", N half of what landed, receipted; a miss pays nothing; the damage card's own line says the caster was paid |
| **Prismatic Spray** placed over both | the cast's card asks nothing; a summary card "Prismatic Spray — 2 creatures in the cone" with the d8s; per creature one card per ray: "the red ray strikes …" with a Dexterity save and 12d6 FIRE (the type of the ray), or "the indigo ray strikes …" with a Constitution save — a failure lands Petrifying (Indigo) (Restrained) and the line says so; the Target's turn ends: "Prismatic Spray — repeats the save" against the Indigo save, "1 of 3 failures"; an 8 on the d8: two rays on that creature; the cone region gone |
| **Wall of Fire** cast, the wall placed between the Cleric and the Target | the cast's save for whoever stood in the wall; the region widened 10 ft on the Target's side; the cast's card: "Which side of the wall burns? — the east side ✓ / the west side" (compass names off the wall's angle); flip it: the band moves; the Target ending its turn within 10 ft of the hot side: an "Emanation" save card with 5d8 fire; the Ally beside the cold side: nothing. The ring: "outside the ring ✓ / inside the ring" |
| **Spike Growth** placed, the Target walks 15 ft through it | when the move lands: "Spike Growth — BTB Walk Target moved 15 feet through it: N piercing damage", 6d4 rolled on the card, a receipt; a 4-ft nudge inside pays nothing; a second move pays again |
| **Magic Circle** placed on the Ally (the Cleric beside it) | no save asked at the cast; the cast's card lists Celestial / Elemental / Fey / Fiend / Undead all ticked — untick Fey; the Target (a Fiend) walking in: "Magic Circle — BTB Walk Target enters BTB Walk Cleric's Magic Circle … cannot willingly enter"; the Target attacking the Ally inside: the gate's section lists "Magic Circle — a fiend attacking into the circle", Net Disadvantage; the Target attacking the Cleric outside: nothing; the Ally (a Humanoid) walking in: nothing |
| **Forcecage** placed over the Target | the Target walking out: "Forcecage — BTB Walk Target leaves BTB Walk Cleric's Forcecage — the walls hold it …"; walking in: nothing |
| **Counterspell** — target the Target, use Counterspell | the ordinary saves demand of the Target: Constitution, the Cleric's DC; the verdict on the card; nothing else |

## The DMG register (2026-09-28, night; HANDOFF.md)

**The commission's question — what "a register" means for the DMG — ruled the spells register's shape:
one row per DMG row, generated, never edited.** [audits/dmg-register.md](audits/dmg-register.md) from
`tools/audit-dmg-register.mjs` (the readers it shares with the spells' generator lifted into
`tools/register-shared.mjs`; the spells register regenerates byte-identical through it), off a DMG-only
corpus scan joined with the registry, RULINGS and the DMG drawing's TWO hand tables — *The shapes the DMG
shares with the other books* (a customer named there lands WAITS on that shape) and *Register verdicts*
(the verdicts the data cannot derive). 571 rows: 484 magic items, 14 poisons, 20 supernatural gifts, 8
traps, 12 hazards, 10 siege weapons, 23 NPC traits.

| What the DMG needed beyond the spells' | The ruling |
| --- | --- |
| **A fifth verdict word — WAITS** | a row whose shape is drawn on a machine that exists and whose customer is a found item: built when the first is found (the drawing: "the DMG is not a slice"). 29 rows wait, on nine shapes |
| **Kind** | magic item · poison · supernatural gift · trap · hazard · siege weapon · feature, read off the pack's item type and the text's first words (a "Potion"-typed row whose text opens "Ingested Poison" is a poison) |
| **Shape** | the shared-shapes row a waiting row lands on, by its code (`CRIT_RIDERS`, `COATINGS`, `SAVE_SUCCEEDS`, `vsSpells`, `REBUKES · INTERRUPTS`, `grant · CLOCK_RIDERS · turnStart`, `EFFECT_BENDS · until: damaged`) or its name (the reroll kind, the cast-triggered reaction) |
| **The defaults** | a trap, hazard or siege weapon is OUT (the GM runs it; its save and damage are the demand's); a row with no family or a paragraph only is TEXT ("a utility item — no combat mechanism"); a same-named registry row is a collision, not a machine, when a hand verdict says so (the Deck's *Flames* is not Flaming Sphere's row, the trait *Light* is not the spell's) |
| **The poisons** | only the four INJURY poisons (Lolth's Sting, Purple Worm Poison, Serpent Venom, Wyvern Poison) wait on `COATINGS`; the ingested, inhaled and contact ones are NATIVE — the item's own save used at the creature, never a coating |

**Measured on the pack, for the scope call:** the six crit riders (Vorpal Sword, Sword of Life Stealing,
Nine Lives Stealer, Hammer of Thunderbolts, Mace of Smiting, Silvered Weapon) ship as ENCHANTMENTS — the
item is applied to a base weapon and renames it ("Vorpal {}"), so the weapon on a sheet is *Vorpal
Longsword* carrying the item's enchantment effect; a `CRIT_RIDERS` row must be found by the enchantment on
the attacking weapon, not by the weapon's name — a reader `CLOCK_RIDERS` does not have. The four injury
poisons are consumables with one "Use Poison" save activity (Constitution, the damage or the conditions on
it, `itemUses` consumed): a `COATINGS` row on the item's own activity needs the machine's Poisoner-only
words (the feat's ASI-picked save, the Fighting Styles switch, the card's "2d8 and Poisoned") read off the
row. Neither is built; the scope is the user's call.

**RULED OUT (the user, 2026-09-28, on seeing the register):** *"lets scope out DMG, nothing is really worth our
time at the moment … intentionally ruled out those items because high impact limited value."* Nothing in
the DMG is built — not `CRIT_RIDERS`, not the injury-poison `COATINGS` rows, not the 29 WAITS rows:
each is a machine change or a new reader for a found item no one holds. The register stands as the record
of where each row lands the day an item is in a player's hands; that day is a new commission on the user's
word, never owed. The order moves on to Slice B.

**RE-REVIEWED 2026-10-01 (the user, after the C1 battery), the 29 WAITS rows split by cost, nothing built:**
fourteen rows are rows on machines that exist (the five `vsSpells` items, Ring of Evasion and Scarab of
Protection on `SAVE_SUCCEEDS`, the four on-hit reactions, Sword of Wounding, Cloak of Displacement, Luck
Blade) — an afternoon, and the items a party finds at tiers 2–3; the crit riders need a new table and an
enchantment-aware weapon reader (a day; eight customers now — **Sword of Sharpness** was misread as a
utility item and joins them); the four injury poisons need Poisoner's coating machine generalised; the
three absorption items wait on the cast-triggered kind with the splat books. Three more first-scan misreads
corrected in the drawing's hand table: **Moonblade** (the crit threshold), **Shield of Missile Attraction**
(the redirect kind, held with the MM's Redirect Attack) and **Periapt of Wound Closure** (the death-save
seam Survivor opens in D1). The combat classics (Flame Tongue, Frost Brand, Holy Avenger, Defender, the
Slayers, the Maces, the Staves, Dragon Scale Mail…) are NATIVE on the pack's effects and activities; the
passive stat items are the sheet's. The traps, hazards and siege weapons stay the GM's. **The rules
chapters** (the pack's journal pages: cover from an area's origin, fear and mental stress, curses,
environmental effects) were never scanned — the register reads the two item compendia only; a scan of the
journal pages is owed before the DMG is called read.

**The rules chapters SCANNED 2026-10-01** (`tools/scan-dmg-rules.mjs`: 341 journal pages, 76 with a mechanism word, each
read): **no row owed.** Two optional rules could become DM configs, off by default — Fight or Flight (a Bloodied and
Frightened monster's morale notice at its turn start) and Success at a Cost (a D20 Test failed by 1 or 2) — the user's
call; the rest is guidance, exploration time, the GM's procedures or the register's own items. The table and the order
of the remaining DMG work: [audits/plans/dmg-build.md](audits/plans/dmg-build.md). **The user, the same night:** the
fourteen rows on machines that exist are built now (v2.11.0); the crit riders, the injury poisons and the rest tomorrow.

## The DMG — the worn items (2026-10-01; audits/plans/dmg-build.md)

**Eleven DMG items on the shapes the table has — no new kind, no new file, no new table; BUILT (`smoke-classes` §106–§112),
unwalked.** The user's word: the cheap rows tonight, the rest of the DMG tomorrow. Measured on the pack first: of the fourteen the
re-review called cheap, **four are not** — Sword of Wounding and Luck Blade are ENCHANTMENTS in 2024 (the crit riders' reader), the
Quarterstaff of the Acrobat and the Shield of the Cavalier carry no effect for the AC hold to read (a made effect) — all four in the
plan's §3. The calls made in the build, **each the user's to overrule**:

- **The worn-item carrier** (`match: "worn"`): a magic item is a row's carrier while it is EQUIPPED and, where the item requires
  attunement, ATTUNED — read off `system.equipped` and `system.attuned`, never guessed. A supernatural gift is a feat on the sheet
  (the plain feature row).
- **Against spells** (Magic Resistance's `saves: { spells }`): Robe of the Archmagi, Scarab of Protection, Spellguard Shield and
  the Blessing of Magic Resistance list Advantage on a save against a spell or other magical effect — the demand's own `spell`
  mark, which reads magical items' effects too. **Mantle of Spell Resistance and Ring of Spell Turning are `spells: "cast"`**: a
  save against a SPELL CAST alone (the demand's `cast` mark — the item is a spell), never a magic item's effect (the user,
  2026-10-01: *"only spells — justification: uses a spell slot"*). **Spellguard Shield** also sets spell attack rolls against the
  bearer at Disadvantage (`scope: "spell"`). The Ring's "no effect on a success" and its reflection are the table's.
- **Ring of Evasion and Scarab of Protection are `succeed` rows** (Guarded Mind's fold) paid by the item's charges: the Ring on a
  failed Dexterity save; the Scarab's Preservation on a failed save against a Necromancy spell or an Undead's effect, read off the
  demand (its spell's school — the demand now carries it — and its caster's type); a save rolled from the sheet with no demand is
  offered, the roller judging. The Scarab crumbling at its last charge is the table's.
- **Cloak of Displacement** is Displacement's Disadvantage on the worn cloak (`judge: "displaced"`): off once the wearer took damage
  since its OWN last turn start (the receipts — Regeneration's reader), while its Speed is 0 (a status that holds it, or a walking
  speed of 0), or while the pack's "Displacement Suppressed" is switched on.
- **Gloves of Missile Snaring** are Deflect Missile's reduction on a worn item (`worn`): a ranged or thrown weapon's hit held for the
  pack's own roll (1d10 + Dex, the utility activity's `roll` — read when the activity carries no healing). "A free hand" and the catch
  at 0 are the table's.
- **Arrow-Catching Shield's +2 AC against ranged attacks** is the gate's −2 on the roll (`plus`, Multiattack Defense's shape, `scope:
  "ranged"`) — the pack ships the bonus as an optional toggle; Intercept Attack (become the target) waits for the redirect kind.

**The second cut (2026-10-01, the user: the rest of the DMG's items are edge cases — build the ones a table meets):**

- **The four injury poisons are `COATINGS` rows carried by the VIAL** (`item: true`): Lolth's Sting, Purple Worm Poison, Serpent
  Venom, Wyvern Poison. Use Poison is vetoed into a coating chip on the character (Poisoner's bend, *Bent by choice*), the dose
  spent; the next weapon hit uses the vial's own Use Poison save at the creatures struck; a stack loses one vial, and the LAST
  vial stays on the sheet empty (the save card reads its activity off the item, so it is never deleted under it — the player
  discards it); a miss spends nothing. The ingested, inhaled and contact poisons stay NATIVE (the item's own save, used at the
  creature).
- **Periapt of Wound Closure is a `D20_FLOORS` row on the Death Saving Throw** (`worn`, `minimum: 10`): a 9 or lower counts as a
  10 while the pendant is worn and attuned — the platform's own `minimum` knob (Reliable Talent's), the card "Periapt of Wound
  Closure — the d20's 4 counts as 10". Natural Healing Boost (the Hit Point Die doubled) is the table's.
- **The crit riders, Sword of Wounding, Luck Blade and Moonblade** were held to BACKLOG at first, then BUILT the same day on
  the user's word (*The DMG — the crit riders and the enchanted weapons*, below). The made AC effect (Quarterstaff of the
  Acrobat, Shield of the Cavalier) is scoped out for good (BACKLOG *Scoped out for good*).

**The walk table** (for the batched walk):

| Item | What you should see |
| --- | --- |
| Mantle of Spell Resistance worn and attuned, a save against a spell | the save gate "Mantle of Spell Resistance — against a spell", Advantage; unequipped, nothing |
| Spellguard Shield, Fire Bolt at the bearer | the attack gate lists it, Disadvantage |
| Ring of Evasion, a failed Dexterity save | the rescue row "Ring of Evasion — succeed instead", a charge |
| Scarab of Protection, a failed save | Advantage against spells; the rescue row "Preservation" (against Necromancy or an Undead) |
| Cloak of Displacement, an attack at the wearer | "Cloak of Displacement", Disadvantage; after it takes damage, nothing until its next turn |
| Gloves of Missile Snaring, a ranged hit | the hold "Gloves of Missile Snaring — 1d10 + Dex"; a melee hit never |
| Arrow-Catching Shield, a ranged attack at the bearer | the gate "… is Arrow-Catching Shield — −2 to this attack roll" |
| Serpent Venom (or any injury poison) used | the "Serpent Venom Coating" chip on the character, the vial's dose spent; the next weapon hit demands its DC 11 Constitution save of the creature struck and the vial is left empty; a miss keeps the chip |
| Periapt of Wound Closure worn and attuned, a Death Saving Throw of 9 or lower | a success — "Periapt of Wound Closure — the d20's 4 counts as 10"; unattuned, the die stands |

## The DMG — the crit riders and the enchanted weapons (2026-10-01; audits/drawings/dm.md)

**The user, 2026-10-01: build them out — the crit riders, the two enchanted weapons, Moonblade.** Measured first
(`tools/probe-dmg-weapons.mjs`): every one but the Mace of Smiting is a **template** — a weapon item whose Enchant activity (or
its effect dropped on a weapon's sheet) puts an applied enchantment of the template's name on a real weapon ("Vorpal Longsword",
identifier `longsword`), and brings over the template's rider activities and effects (the weapon gains "Life Stealing", "Sword
of Wounding Save", "Luck"). The pack already carries the flat crit damage (Vorpal's 30, Life Stealing's 15, Sharpness's 14, as
`critical.bonus`) and Moonblade's 19 (its "Rune: Critical Range"). The calls made, **each the user's to overrule**:

- **The reader** (lookup.js `wieldsAs`): the attacking weapon wears the APPLIED, enabled enchantment of the item's name, or IS the
  item by name (the Mace ships as a weapon); attuned where it requires it. The template item's own unapplied enchantment never
  counts.
- **One table, no new kind:** the riders are `CLOCK_RIDERS` rows (`wields`, `always`, `natural`, `targets`, `save`, `charges`,
  `tempHp`, `exhaustion`, `destroy`). **`always`** — a magic item's property is never a pick: it neither opens nor shows on the
  damage offer, always rides, and says itself on the damage card.
- **"Roll a 20 on the d20"** (`natural`) is the d20's own 20, or a fold that made one (Stroke of Luck's twenty, a reroll's 20) —
  not every Critical Hit: a Moonblade's 19 or a Paralyzed target's automatic crit does not behead. The pack's own crit bonus
  rides EVERY Critical Hit (the platform's; not the module's to narrow). **Silvered Weapon** reads any Critical Hit, as written.
- **Vorpal Sword:** the 20 is a card line — the head and whether the creature survives without it are the DM's (the data has no
  head); the 30 extra is the pack's. **"Ignores Resistance to Slashing"** is a `DAMAGE_RULES` row (`wields`, Elemental Adept's
  ignored Resistance) read off the damage's own weapon.
- **Sword of Sharpness:** a 20 against a creature gives it 1 Exhaustion level. ⚠ The pack types its 14 as **Necrotic** (the text
  says Slashing) — a vendor-data fault, never patched here: Errata 5e's **E-004** (the sister module, v1.0.0) retypes it in
  memory; the module leaves the 14 to the pack's own crit bonus either way. "Maximize against an object" is the table's.
- **Sword of Life Stealing:** a 20 against a creature that is not a Construct or Undead gives the wielder **15** Temporary Hit
  Points — the text's "equal to the Necrotic damage taken" read as the flat 15 (a resisted 15 is the table's to trim).
- **Nine Lives Stealer:** a 20 against a creature under 100 Hit Points that is not a Construct or Undead uses the weapon's own
  Life Stealing save (DC 15 Con); a failure SLAYS it (0 Hit Points, Dead — `SAVE_PRESSES` `slain`) and spends one of the
  activity's charges. The charges are the activity's own uses (the pack's Foundry note: set them to the rolled 1d8 + 1); none
  left, the property is gone; none set, it rides.
- **Hammer of Thunderbolts:** Giants' Bane rides only when the weapon carries its paired attunement's enchantment (the save
  activity comes with it): a 20 against a Giant uses that DC 17 Con save, the pack's own 1000 damage on a failure. Hurl Hammer's
  thunderclap is the pack's attack.
- **Mace of Smiting:** a 20 adds 7 Bludgeoning, 14 against a Construct; a Construct left at 25 Hit Points or fewer once the
  receipt lands is destroyed (0 Hit Points, Dead). The +3 against Constructs is the pack's own "Attack Construct" activity.
- **Adamantine Weapon:** "a hit on an object is a Critical Hit" — an object is a **vehicle** actor (the platform has no object
  creature); the crit judgement (`critFor`) names it beside the conditions' automatic crits. The weapon or the ammunition
  carrying the `ada` property counts.
- **Sword of Wounding:** every hit uses the weapon's own save (DC 15 Con) at the creature hit; a failure lands the pack's
  "Wounded and Cannot Heal" for its hour, the save repeating at the end of each of its turns (`REPEAT_SAVES`, the enchanted weapon
  as its origin). **"Unable to regain Hit Points"** is `HEAL_BLOCKS`: a heal applied to the creature is held at its current Hit
  Points (Temporary Hit Points pass); the 2d6 Necrotic is the enchantment's own part.
- **Luck Blade:** Luck is a `REROLLS` row (`wields`) — one failed D20 Test (attack, save or check) rerolled, the second roll used,
  once per dawn (the Luck activity's own use), not while Incapacitated. The +1 to saves is the pack's effect; Wish is the sheet's.
- **Moonblade:** NATIVE — the pack's "Rune: Critical Range" sets the attack's crit threshold to 19; its other runes are the
  pack's activities.

**The walk table** (for the batched walk):

| Item | What you should see |
| --- | --- |
| Vorpal Sword, a 20 on a creature | the damage card "Vorpal Sword — a 20 on the d20", the head line; Slashing resistance ignored |
| Sword of Sharpness, a 20 | the card line; the target gains 1 Exhaustion level |
| Sword of Life Stealing, a 20 on a living creature | the card line; the wielder gains 15 Temporary Hit Points; on an Undead, nothing |
| Nine Lives Stealer, a 20 on a creature under 100 HP | the Life Stealing save demanded; a failure leaves it at 0 HP and Dead, a charge spent |
| Hammer of Thunderbolts with Giant's Bane, a 20 on a Giant | the Giants' Bane save demanded |
| Mace of Smiting, a 20 | +7 Bludgeoning (14 on a Construct); a Construct at 25 HP or fewer after it is destroyed |
| Silvered Weapon, a crit on a shape-shifted creature | one more weapon die |
| Adamantine Weapon, a hit on a vehicle | a Critical Hit, the crit line names Adamantine |
| Sword of Wounding, any hit | its save demanded; a failure lands "Wounded and Cannot Heal" — a heal does nothing; it saves again at its turn end |
| Luck Blade, a failed attack, save or check | the rescue row "Luck Blade — reroll", once per dawn |
| Moonblade with the Critical Range rune | a 19 is a Critical Hit (the pack's) |

## Arcana Unleashed (2026-10-02; audits/plans/splat-books.md, audits/drawings/splat-arcana.md)

**The user, 2026-10-01 night: the splat books before 3.0, Arcana first, then Faerûn, Ravenloft held; autonomous, rapid
mode — rows and suites, no walk.** The book's register is [audits/arcana-register.md](audits/arcana-register.md) (257 rows:
38 MODULE, 23 WAITS, 26 OUT, 97 TEXT, 73 NATIVE); the calls made, **each the user's to overrule**:

- **No new kind.** Every Arcana row sits on a table that exists; the book added seven facets, no machine: the hit menu's
  `weapons: "ammunition"` and `onceKey` (one turn chit for a whole group), the rebukes' `judge: "becameBloodied"` and
  `missOf: "any"`, the Initiative grants' `count`, the concentration exempts' `school`, the evasions' `effect`, the clock
  riders' `worn`, the save bystanders' `only: "self"` / `abilities` / `spells`.
- **Arcane Shot is a hit-menu GROUP** (Combat Superiority's shape): the Arcane Shot item's uses are the pool, one option
  per hit on a ranged Ammunition weapon, **once per turn for the whole group**. The pack puts five options' dice on their
  SAVE activity (`onSave: full` — the save never modulates them): the module rides those dice on the hit's damage roll
  (`saveDice`: the creature hit takes them whatever the save, crit-doubled with the hit), then the save follows with no dice
  of its own and no second spend; the condition lands on the failure. Bursting Shot's die rides the hit, its Emanation to
  the others a card line. **Piercing Shot and Seeking Shot are text**: they replace the attack roll with a save, used from
  the sheet.
- **The Bloodied moment is a rebuke facet, not a kind** (`judge: "becameBloodied"`): Harvest Undead is offered when a hit
  takes the wizard from above half its Hit Points to half or fewer (not to 0), read AFTER the damage lands (the rebukes'
  seam). Faerûn's Bloodthirst (an enemy becoming Bloodied) takes the same judge on a ward row when its book comes.
- **Instinctive Charm is Warding Charm's row** — the hit's Wisdom save at the attacker after the damage landed; "the attack
  misses instead" and the redirect are the table's (the bends register, Warding Charm's row). **Masterful Shots** is Sticky
  Shield's miss row widened to any attack roll; the move and the ranged attack are from the sheet.
- **The magic items' "you can" riders are UNTICKED** (a charge is a pick; the DMG's `always` was for properties): Blood
  Amulet (a WORN item on any damage the wearer deals — `worn`), Diamond Staff's Stunning Hit, the Martialist's
  Quarterstaff's Trip, Namer's Needle's Identify Target. Keyholes Dagger's Reroll Miss is Luck Blade's row on an attack.
  Mage Breaker is Mage Slayer's breaker on a wielded weapon.
- **Aura of Evasion** is three rows, no kind: the spell emanation (the pack's "Aura" on the allies inside), the member
  copy's Dexterity-save Advantage (`EFFECT_BENDS`), and Evasion keyed to that effect (`EVASIONS` `effect`).
- **The save bystanders** take Arcana's three: Arcane Omens' Helpful Premonition (1d4 to a friend's or its own failed save
  within 30 ft), and two own-save rows — Transmuted Anatomy on a Constitution save, Spell Resistant against a spell or
  magical effect (the demand's spell mark; a bare sheet save is never asked — never guess what it is against).
- **Summons-shaped features park on GitHub issue #1** (Vestige Companion / Recovery / Semblance of Life, Durable and
  Splintered Summons, Battle Familiar, Summon Plant / Dinosaur, Spirit Lantern); **cast-triggered rows stay held** (Modify
  Magic, Dispelling Recovery, Split Enchantment, Empowered Transmutation, Abjuration and Necromancy Adept); **the redirect
  stays held** (Curving Shot, Warlike Familiar's Intercept Attack); the three epic boons are the boons slice's.
- **What WAITS, its precedent named** (the register): Goading Ammunition (a rider read off the attack's consumed ammunition —
  measure the seam first), Focused Strike (the pack's activity names an effect it does not ship — Errata 5e's), Death's
  Master's Extinguish Undead, Divination Adept (Advantage after the roll), Soothing Familiar, Evocation Adept, Arcane
  Overload, Boon Companions' Bands, Arcanist's Bestiary, Lucky Foot, Named Target, Dissuader, the Scholar's Anchoring
  Bangle, Distorted Distance, Transfix, Moment of Prescience, Reweave Fate, Defensive Divination, Evocation Sculptor,
  Spore Spray — each one row or one facet when its first player is found.
- **The bestiary rides the Monster Manual's rows by name** (Magic Resistance on the archmages) and adds its own:
  Superior Magic Resistance (Spellguard Shield's row), Marshaled (Arcana's own effect name), Mounted Adept (while mounted —
  the table's), the vestige's Cursed (Divine Power's copy alone), Go to Ground (Uncanny Dodge's half; "on the ground" the
  table's), Frightening Appearance's repeat.

**The walk table** (for the batched walk):

| Row | What you should see |
| --- | --- |
| Arcane Shot, a Longbow hit | the damage offer's group "Arcane Shot" (N uses left); Beguiling Shot ticked: the Wisdom save demanded, its dice land, a use spent; a second hit this turn greys the group; a Longsword hit shows no group |
| Ever-Ready Shot at Initiative | "use it now?" — Yes gives one Arcane Shot use back |
| Harvest Undead, a hit that makes you Bloodied | the rebuke card and popup; Use heals your Wizard level |
| Instinctive Charm, a hit within 30 ft | the rebuke; Use demands the attacker's Wisdom save |
| Masterful Shots, any miss on you | the rebuke card (the move and the shot from the sheet) |
| Blood Amulet, any hit | the offer's unticked "Blood Amulet"; ticked, the save at the target with its 2d10, a charge spent |
| Diamond Staff / Martialist's Quarterstaff, a melee hit | the unticked Stunning Hit / Trip; ticked, the save, a charge |
| Keyholes Dagger, a miss | the rescue row "Keyholes Dagger — reroll"; pressed, Reroll Miss's use spent |
| Mage Breaker, a hit on a concentrating creature | its Concentration save at Disadvantage, the ask says why |
| Aura of Evasion, an ally inside saving on Dexterity | the save gate lists the aura (Advantage); a success takes none, a failure half |
| Lightning Ring / Grave Ground | the ring or the placed area; an enemy entering or ending its turn inside saves |
| Festering Blast | the Poisoned creature takes 2d10 at its turn start and saves again at its turn end |
| Enervation | the caster regains half the Necrotic that landed |
| Entrancing Mirrors, Inflict Doubt, Uncertain Footing, Fractured Awareness, Vision of Elapsing Eons, Power Word Pain | the save repeats at the creature's turn end; a success ends it |
| Superior Magic Resistance | the spell attack's gate reads Disadvantage; the save gate Advantage |

## Heroes of Faerûn (2026-10-02; audits/plans/splat-books.md, audits/drawings/splat-faerun.md)

**The second splat book, the same night, rapid mode.** The register is [audits/faerun-register.md](audits/faerun-register.md);
the calls made, **each the user's to overrule**:

- **No new kind.** Five facets: the rebukes' `judge: "enemyBloodied"` (a bystander watching an ENEMY become Bloodied) and
  `hitMelee`; the save bystanders' reroll `bonus`; the cast riders' `use`; the clock riders' `activities` (one save per
  ability a feat may raise — the ASI's pick, else the higher modifier); the emanations' `pulse.on: "sourceTurnStart"`;
  the evasions' `spells`; the save presses' `types`.
- **Bloodthirst is the Bloodied moment watched**: an enemy within 30 ft takes damage and is Bloodied after it (not killed)
  — the rogue is offered its Reaction with that enemy as the target, after the damage lands; Use spends the use; the
  teleport beside it and the melee attack are from the sheet. Harvest Undead (Arcana) is the same judge on the bearer.
- **Shared Resilience** rerolls a friend's failed save within 60 ft with the fighter's level added, paid from Indomitable
  (the activity's consumption). **Elemental Rebuke** is Beguiling Defenses' row: the half, the Rebuke save at the attacker
  (its own 2d10 + Cha, half on a success); the damage type is the activity's first. **Chilling Retribution** is Warding
  Charm's row (Stunned on the failure, the pack's).
- **The Winter Walker:** Biting Cold ignores Cold Resistance (a feat row, no face); Polar Strikes ride a weapon hit once
  per turn ("once per creature per turn" read as once per turn); Hunter's Rime uses the feature's heal on the ranger right
  after Hunter's Mark (no ask); Frozen Haunt is a ring while Frozen Soul stands, pulsing at the ranger's turn START (the
  first pulse at the adoption is the use's own card). Fortifying Soul's Advantage against Frightened is a bend.
- **The feats:** Fairy Trickster's Flustering Strike rides any hit, unticked, the save by the ability the feat raised;
  Lordly Resolve's Bolstered, Order's Resilience' Stronger Together, Zhentarim Tactics' Retaliate (an Opportunity Attack
  on a melee hit), Spellfire Adept's Searing Spellfire (Radiant ignores Resistance); Strike Fear's Terrify is a Cunning
  Strike option whose Frightened repeats at the turn end.
- **The spells:** Cacophonic Shield and Dirge pulse on the caster (Spirit Guardians' trigger), Doomtide and Spellfire Storm
  are placed areas; Elminster's Elusion is Circle of Power's bend; Laeral's Silver Lance chooses its targets; Crown of
  Spellfire's Spell Avoidance is Evasion against spells while the crown stands; Effulgent Spheres' Absorb Energy is a
  rebuke on elemental damage.
- **Two aliases**: Laeral's Silver Lance and Elminster's Effulgent Spheres carry identifiers without the mage's name
  (`silver-lance`, `effulgent-spheres`) — `ALIASES` holds them (Elusion's too).
- **The bestiary:** Mechanical Determination is Undead Fortitude with Lightning; the construct's "Command" action no longer
  answers the Command SPELL's press (`types: ["spell"]` — a collision the book exposed).
- **What WAITS, its precedent named** (the register): Group Recovery (a hand-out of healing to several), Elemental Smite
  (Inspiring Smite's `after` with a pick), Aura of Elemental Shielding, Noble Scion's Minor Wish, Song of Defense (a slot as
  the reduction), Spellfire Spark, Purple Dragon Rook's Rallying Cry, Lords' Alliance Agent's Inspiring Strike, Zhentarim
  Ruffian, Cold Caster, Mythal Touched, Moon's Inspiration, Blessing of Moonlight, Spellfire Flare, Backlash, Alustriel's
  Mooncloak (a dangling effect — Errata 5e's), Songal's Elemental Suffusion, Holy Star's Reaction, Burning Life Force,
  Fueled Spellfire. **Out:** the cast-triggered rows (Spellfire Burst, Honed Spellfire, Absorb Spells, Simbul's), the
  summons-shaped (Conjure Constructs, Deryan's Homunculi — issue #1), the thirteen epic boons (the boons slice).

**The walk table** (for the batched walk):

| Row | What you should see |
| --- | --- |
| Bloodthirst, an enemy within 30 ft made Bloodied by anyone | the rebuke card "<enemy> is Bloodied" and popup; Use spends the use (teleport and attack from the sheet) |
| Chilling Retribution, a hit on you | the rebuke; Use demands the attacker's Wisdom save, Stunned on a failure |
| Elemental Rebuke, a hit on you | the hold popup; Cast halves the damage, the attacker's Dexterity save with its own damage |
| Shared Resilience, an ally within 60 ft fails a save | the fighter's popup; Answer rerolls the ally's d20 + the fighter's level, an Indomitable use spent |
| Frigid Explorer, a weapon hit | the ticked "Polar Strikes — 1d4 cold"; Cold against a Cold-resistant creature lands in full |
| Hunter's Rime, Hunter's Mark cast | the Temporary Hit Points and the rimed mark's effect land on the ranger |
| Frozen Haunt, the form adopted | the ring; each of the ranger's turn starts deals the Cold to the enemies inside |
| Fairy Trickster, any hit | the unticked "Flustering Strike"; ticked, the Wisdom save, Flustered on a failure (its saves at Disadvantage) |
| Strike Fear, a Sneak Attack | Terrify on the Cunning Strike menu; the save, Frightened for a minute repeating at its turn end; your attacks at Advantage |
| Cacophonic Shield / Dirge / Doomtide / Spellfire Storm | the ring or the area; entering or ending a turn inside saves, once per turn |
| Elminster's Elusion / Fortifying Soul / Bolstered / Stronger Together / Team Tactics | the save gate lists the source |
| Mechanical Determination, a drop to 0 | held at 1 while the Constitution save rolls (DC 5 + damage); Lightning or a crit lands the 0 |

## Ravenloft: The Horrors Within (2026-10-02; audits/plans/splat-books.md, audits/drawings/splat-ravenloft.md)

**The third splat book, the morning after, on the user's go** (*"lets continue on to ravenloft!"*; the WAITS rows of every book
kept standing for a pass of their own — *"keep those waits rows hanging"*). The register is
[audits/ravenloft-register.md](audits/ravenloft-register.md); the calls made, **each the user's to overrule**:

- **One new TABLE, no kind: `MISHAPS`.** Six dark gifts share one shape — "immediately after you make a D20 Test and roll a 1
  on the d20", the bearer makes the feature's own save (Warping Flesh, Intrusive Echoes, Voices from Beyond, Ominous Will,
  Symbiotic Agenda, Incessant Watchers). Three or more customers make a table (DESIGN §3): `mishaps.js` reads the kept d20
  on the roller's client and uses the save activity at the bearer; the saves machine demands it, the pack's DC and failure
  effect land. No choice (R1). A mishap's save is a D20 Test too — a 1 on it asks again, as the text reads.
- **The facets, no kind:** the clock riders' `targetStatus` (Ominous Strikes' Frightened — a judge on the TARGET's status, its
  first customer; Arcana's Spore Spray is its second when measured), `owner: "marker"` and `endsMark` (Path to the Grave:
  any ally's hit on the cleric's Cursed target ends the curse for the cleric's level), a `spread` from the Sneak Attack's
  target (Wails from the Grave); the heal on hit's `on: "hit"` with `while`, `bloodied` and `once: "turn"` (Hungering Might)
  and a `kill` row's `pick` + `uses` (Keeper of Souls); the drop's `sets` ("your Hit Points instead change to") and
  `spendOn: "success"` (Strength of the Grave); the rebukes' `wardAlso` (Prowling Retribution: you OR an ally); the
  Initiative grants' `reroll` (Hypervigilance); the damage rules' `spell` (Death Touch's Chill Touch alone); the heal
  rerolls' `atZero` (Return to Life); the reductions' `amount` (Deflect Blow's 1d10 the activity does not carry); the
  bystanders' flat `die` ("@prof") and `die: "hitDie"`; the bends' `judge: "targetStatus"` (Terrorizer); an emanation
  `pulse` whose activity is a SAVE (Unnerving Aura) demands it of everyone inside.
- **The Survivor feat shares its name with the Fighter's Survivor.** Its own rows are keyed "Survivor (Ravenloft)":
  `ALIASES` points the key at the identifier, `FEATURE_TYPES` keeps it to the feat (and the Fighter's rows to the class
  feature — the collision fixed with Arcana). Touch of Death's feat is told from Ankhtepot's action the same way.
- **Steel Yourself** lifts the bearer's own failed save against Charmed or Frightened by the Proficiency Bonus — the
  Reaction gates it; the pack's activity names a consumption of its own uses but carries none to count, so **once per Long
  Rest is the table's** (the register says so). Sustained Symbiosis adds the largest Hit Die; the Hit Die itself is spent by
  hand (the machine spends the feat's use). Knowledge from a Past Life: 1d6 on a failed ability CHECK.
- **Sentinel at Death's Door** is Uncanny Dodge's half on the hit on YOU; the Bloodied ally within 60 ft and the Critical
  Hit's effects cancelled WAIT (an ally guard on the multiplier hold and a crit cancel, their first customers).
- **The Hollow Warden:** Unnerving Aura is Frozen Haunt's ring while Ghastly Form stands, the Wisdom save demanded of the
  enemies inside at the ranger's turn START (the transform's own use is the first); Prowling Retribution an Opportunity
  Attack when a creature within 5 ft damages the ranger or an ally; Hungering Might heals 1d10 + Wis on the ranger's own
  hit while transformed and Bloodied, once per turn; Ominous Strikes the Wisdom modifier against a Frightened target;
  Persistent Wrath the drop held at twice the ranger's level while the form stands (asked — "you can").
- **The Grave Domain:** Pull of Death is Dreadful Strikes' die on a damaged target once per turn (a spell's damage without
  an attack roll is the table's); Return to Life maxes the healing dice on a creature at 0; Path to the Grave's curse is the
  pack's effect (its Disadvantage a bend), End Curse Early rides any ally's hit (Necrotic here — Radiant by hand); Keeper of
  Souls offers its heal to one creature within 60 ft when an enemy dies, the use spent.
- **The Phantom's Wails from the Grave** spreads half the Sneak dice as Necrotic to a second creature within 30 ft of the
  Sneak Attack's target — a pick on the damage card, a use of the feature. Death's Lament (both creatures) WAITS.
- **Strength of the Grave:** the dice decide (Charisma, DC 5 + the damage); a success sets the Hit Points to Cha + the level
  and spends the use; a failure lands the 0 and spends nothing.
- **The bestiary:** Terrifying Aura, Viral Aura, Deathly Stench (turn start inside) and Possessive Aura (turn end) are the
  Monster Manual's aura shapes; Terrorizer, Incomprehensible Form (Displacement's row) and Susceptible to Charm are bends;
  Deflect Blow a reduction; Cold Sprint a rebuke on Cold; Ravenous Bites' 1d8 at the Poisoned creature's turn start is
  Spores' row. Aura of Violence WAITS (its failure is a forced Reaction attack, the damage only when nothing is in reach).
- **Out:** the Reanimator's companion and its modifications (summons-shaped — issue #1), Beasts of Ill Omen, the redirects
  (Transfer Harm, Redirect Attack), the cast-triggered rows (Magic Allergy, Siphon Spell, Haunted Zone).
- **What WAITS, its precedent named** (the register): Jolt to Life, Form of Dread's Frightful Avatar, Necrotic Husk's Unholy
  Resuscitation, Tokens of the Departed's claim, Death's Friend, Divine Reaper's Enhanced Necromancy, Empowered
  Channeling's Spiritual Manifestation, Grave Touched's type swap and Dreaded Necrosis, Gathered Whispers' Unearthly
  Scream (a Reaction AC bonus the pack ships without an effect), Sentinel's ally half and crit cancel; the bestiary's
  Protective Swarm, Bolster Inventions, Warp Mind, Bloodthirsty Slash, Tattoo of Osybus, Meltable, Dreadful Impaling,
  Trapped Ground, Aura of Violence.

**The walk table** (for the batched walk):

| Row | What you should see |
| --- | --- |
| a dark gift, any D20 Test rolling a 1 | the mishap card names the test; the gift's save demanded of you; the pack's effect on a failure |
| Survivor (Ravenloft), Initiative with a d20 of 9 or lower | "reroll the Initiative?"; Yes rerolls it, the new roll stands |
| Survivor (Ravenloft), a failed save against Charmed or Frightened | the popup asks; Answer adds your Proficiency Bonus, the Reaction spent |
| Sentinel at Death's Door, a hit on you | the hold popup; Cast halves the damage, a use spent |
| Ancient Might, a hit on a Frightened target | the ticked "Ominous Strikes — +Wis" |
| Ancient Might, a drop to 0 while Ghastly Form stands | the ask; Yes sets your Hit Points to twice your level |
| Wrath of the Wild transformed | the ring; each of your turn starts demands the Wisdom save of the enemies inside; a hit while Bloodied heals you once per turn; a creature within 5 ft damaging you or an ally offers the Opportunity Attack |
| Circle of Mortality, a hit on a damaged creature | the ticked "Pull of Death"; healing a creature at 0 lands the dice's maximum |
| Path to the Grave, an ally's hit on the cursed creature | the unticked "End Curse Early"; ticked, the cleric's level in Necrotic and the curse ends |
| Divine Reaper, an enemy dies within 60 ft | the pick popup: who regains twice your level; the use spent |
| Wails from the Grave, a Sneak Attack | the damage card offers a second creature within 30 ft; the half dice land as Necrotic, a use spent |
| Power of Shadow, a drop to 0 | the Charisma save rolls (DC 5 + the damage); a success keeps you up at Cha + level, the use spent |
| Mist Walker / Mark of Obsession / Cold Sprint, damage taken | the rebuke card; Use from the sheet |
| Touch of Death, Chill Touch on a Necrotic-resistant creature | the Necrotic lands in full |
| Watchers / Symbiotic Being, the landed effect | the repeat save at your turn end / when damaged |
| Terrorizer / Incomprehensible Form / Susceptible to Charm | the attack and save gates list the source |
| Terrifying Aura / Viral Aura / Deathly Stench / Possessive Aura | the ring; starting (ending) a turn inside saves, once per turn |

## The full release — the order (2026-09-29)

**The user, ruling Q1 of the Session 0 plan** (`audits/plans/session-0-classes.md`): *"this pass is for all
characters, and we'll work on this independently … we are no longer building as the table progresses. we are
building toward a fully functional release for all things. phb, dmg and mm first. then splat books (arcana,
faerun, ravenloft). caveat: we will prioritize work if the table needs something for itself."*

- **The pacing changes, the bounds do not.** Every band of every PHB class is in the pass — not one band
  ahead of a party. The order inside the pass stays shape-first (a table with three or more customers before
  its rows), the band only a sequence. DESIGN §3 carries the frame; BACKLOG *The long-term order* the steps.
- **The DMG is back in scope** for the full release (its 2026-09-28 ruling-out, *The DMG register* above,
  stands as history): built on its register's precedents after the PHB classes, before the splat books.
- **The splat books follow** — Arcana Unleashed, Heroes of Faerûn, Ravenloft — scanned, drawn and registered
  the way the three core books were.
- **The caveat is the only priority rule:** a thing the table needs for itself jumps the queue. Nothing else does.

**Re-ruled 2026-10-01 — the splat books land BEFORE 3.0** (the user, in a holding pattern: *"start a new project
whereby we will add in arcana unleashed, heroes of faerun, and ravenloft to the scope … these will be added prior to
3.0 … we are still in rapid devmode"*). So v3.0.0 = the PHB, the DMG, the Monster Manual AND the three splat books,
all built and unwalked; 3.x stays the walkthroughs. The prework is `audits/plans/splat-books.md`; the evidence was read
OFFLINE (*"stay out of the sandbox"*) by `tools/scan-corpus-offline.mjs`. The epic boons — every book's — are parked
in BACKLOG as a slice of their own (*"add epic boons to the backlog"*), no longer out.

**The same morning, Q2 and Q3 of the plan:**

- **Q2 — the bystander's bend, the FULL way** (*"this gate type is what we need"*): one popup for another
  creature's attack, save or check — vocabulary on the `roll` interrupt (`bystander`, `tests`, `die`), the hold
  for attacks, the save withhold for demanded saves, the rescue window for checks; not a kind. **With a noise
  gate, to brainstorm before it is built** (*"without being super annoying to the player getting a popup every
  turn"*): the plan's §4a lists the candidates (a margin gate on the futile-skip precedent, the Reaction gate,
  once per turn, a "not this combat" mute, the card's Answer button as the quiet road) — ruled off the
  prototype's next revision.
- **Q3 — Restore Balance after the roll, the first d20 standing, AS A RULE OF COOL** (*"yes we will have to rule
  of cool the restore balance that way, and mark it in the rule of cool"*): its row goes in *Bent by choice*
  when it is built, not the platform register — the sorcerer sees both faces before choosing.
- **Q2's noise gate — OPTION A** (ruled 2026-09-29 off the prototype's group N, *"A, with Portent narrowed to saves
  and crits"*): a bystander is ASKED only when its bend can change the verdict (the **margin gate**, the
  futile-skip precedent `holdSkipped`: a subtracted die up to its maximum under the AC or DC, a +10 short of it, a
  cancelled Advantage or Disadvantage whose other face flips it); never while its Reaction is spent (the
  **Reaction gate**, the hold's rule already); the popup carries a third button, **"Not this combat"**, muting the
  feature for its bearer until the combat ends (a chip on the bearer, listed by the effect view, swept with the
  combat). Everything the gate stays silent on keeps the attack card's **Answer button** — the quiet road — live
  until the damage rolls. **Portent is narrowed to saves and critical hits** (A7): an ordinary hit a stored face
  would flip gets the card button only. No setting; no new kind. The measurement (plan §4a): 20 popups ungated →
  9, every chance the players want still taken; the alternatives (B, ask always + mute; C, a quiet toast) stand
  in the prototype as history.

## The bystander's bend — built (2026-09-29, Session 0 stage A3)

**Q2 as ruled (option A), built and proved by the suites — unwalked (rapid mode).** Another creature's D20 Test
bent by someone who is neither the roller nor its target: vocabulary on the `roll` interrupt, not a kind.

| Test | Where it rides | Rows | What the player sees |
| --- | --- | --- | --- |
| **an attack that HITS** | the reaction hold — the bystanders stamped beside the guards (`hold/lookup.js` `bystandersOf`) | Cutting Words (−Bardic die), Restore Balance (the first d20) | a popup titled "Cutting Words — the Bugbear's attack at Aster", the situation line with the margin ("A d8 can turn it: 17 − 8 = 9"), one tick row, Answer / Pass / **Not this combat**; the attack card: "Cutting Words (Corin) −5 — 17 → 12, MISS" |
| **an attack that MISSES** | a hold of its own on the miss (`stampMissHoldIfBystanders`), one judged target; a turned miss rolls its damage at the resolve | Guided Strike (+10; the cleric's own miss with no Reaction), Restore Balance | the same popup, "You missed …" on the cleric's own roll; "Guided Strike (Tavin) +10 — 13 → 23, HIT" |
| **a DEMANDED save** | the save's verdict WITHHELD (`bystanders.js`, `registerWithhold`); the bent roll REPLACES the total (`SAVE_FOLDS`) | Restore Balance | "Restore Balance — the Halfling's saving throw"; the verdict lands after the answer; the roll's card names the bend |
| **a check** | an offer on the check's own card (`bystanders.js`), nothing withheld | Cutting Words (a hostile's check), Restore Balance | the popup says no DC is known; the card: "Cutting Words (Corin) −5: 15 → 10 — ask your DM whether it still succeeds" |

- **The margin gate**: asked only when the bend can change the verdict (a die up to its maximum across the AC or
  DC, the first d20 across it). A check has no DC, so it asks. With "Hold Shows the Math" off, a die bend is asked
  on every hit but a natural 20 or 1 (the gate would leak the AC — `holdWouldMatter`'s rule).
- **The quiet road** (retired 2026-10-14, *The asks widened*): a bystander the gate is silent on, whose row has a damage half (Cutting Words), rides a hold
  that already stands, on the attack card only and only on its own client — "Cutting Words (Corin) — −d8 off
  the damage [Answer] [Not this combat]". It never opens a hold of its own (the register's row).
- **"Not this combat"** (since 2026-10-14 one of two scopes, with "Not until my turn", *The asks widened*): on the popup and on the card row, only while a combat runs; an effect on the bearer
  ("Cutting Words — muted this combat", flag `bystanderMute`), listed by the effect view, swept when the combat
  ends (`chip-spend.js`), deleted to unmute.
- **The pools** are each activity's own consumption (`poolOf`); a pool named by the pack's uuid on a sheet whose
  copy carries no source (an imported Bardic Inspiration) is found by the pack index's name.
- **Two clients**: the hold's answer relays as the bystander's own message (`respondsTo`, `by`); a save's or
  check's as `bystanderRollAnswer`, folded by the roll's keeper (`smoke-twoclient` §bystander).
- **Deferred to their stages**: Bend Luck and Cosmic Omen (B4, the same facets), Portent (A7 — narrowed to saves
  and critical hits by the ruling; widened to every roll a face turns on 2026-10-14, *The asks widened*).

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Cutting Words, a Bugbear hits Aster by 2, Corin within 60 ft of the Bugbear | Corin's popup with "A d8 can turn it"; Answer: the die rolls, "Cutting Words (Corin) −5 … MISS" on the attack card, a Bardic Inspiration spent |
| The same Bugbear hits by 9 | nobody asked, the damage lands |
| A hit that holds for someone else (Aster's Lucky) and Cutting Words can't turn it | no popup for Corin; her row on the attack card, "−d8 off the damage" — Answer lands the hit 1d8 lighter |
| Restore Balance, the Bugbear hits with Advantage, its first die a miss | the sorcerer's popup naming the first d20; Answer: a MISS |
| Guided Strike, an ally misses by 7 within 30 ft of the cleric | the cleric's popup "+10 · a Reaction"; Answer: HIT, the damage rolls |
| Guided Strike, the cleric misses | its own popup, "No Reaction" |
| Restore Balance on a demanded Dexterity save rolled with Disadvantage | the save waits; Answer: the first d20 stands, SAVED |
| Cutting Words on a Bugbear's Athletics | the popup says no DC is known; the card states the arithmetic and "ask your DM" |
| "Not this combat" in a fight | the popup closes, the bearer shows "Cutting Words — muted this combat"; nobody asks again until the combat ends |

## The PHB classes — A1 (2026-09-29, Session 0 stage A1)

**Fourteen band-A rows on tables that exist — no new kind, no new file; unwalked (rapid mode).** The plan's §3 A1,
built off the pack as measured (`dnd-players-handbook.classes`, dnd5e 6.0.5). Two rulings the user gave mid-build
(2026-09-29): **Hunter's Prey's option is asked once and kept** (the pack records neither option); **Combat
Inspiration's damage die is offered UNTICKED** (the die is the ally's to spend).

| Row | Table · facet | What it does |
| --- | --- | --- |
| Commanding Presence | `SUPERIORITY_FOLDS` | Tactical Assessment's scoped fold on Intimidation, Performance or Persuasion (and armed from the sheet) |
| Tides of Chaos | `ADVANTAGE_BUYS` + `D20_FOLDS` `advantage` | Lucky's buy box on every D20 Test; the surge's write-back is A7's |
| War Priest | `BONUS_SWINGS` `uses`, `ranged` | Hew's reminder after any weapon or Unarmed Strike attack on your turn, the uses shown; none left, no reminder |
| Hunter's Prey — Colossus Slayer | `CLOCK_RIDERS` `judge: targetDamaged`, `option` | 1d8 of the weapon's type once per turn on a target below its maximum |
| Hunter's Prey — Horde Breaker | `BONUS_SWINGS` `option`, `near: 5` | the reminder when another creature stands within 5 ft of the target, once per turn |
| Frenzy | `CLOCK_RIDERS` `judge: reckless` | the Rage Damage d6s on the first hit of the turn while raging and Reckless |
| Repelling Blast | `CLOCK_RIDERS` `enchant`, `maxSize`, `says` | a card line per beam on the cantrip the invocation enchanted (else Eldritch Blast) |
| Combat Inspiration — Offense | `CLOCK_RIDERS` `inspired`, `unticked` | the bard's die on the damage offer, unticked; ridden, the Inspired effect is spent |
| Combat Inspiration — Defense | `INTERRUPT_ROLLS` `inspired`, `only: "self"` | the hit creature's own popup: −the die off the attack, its Reaction and its Inspired die spent |
| Glorious Defense | `INTERRUPT_ROLLS` `reach: "target"`, formula `bonus`, `turned: "strike"` | −Cha off an attack that hits the paladin or a creature within 10 ft of it; turned to a miss, a Strike popup drives one weapon attack at the attacker. Moved from the `ac` list, where the pack's effectless utility moved no AC |
| Dark One's Blessing | `HEAL_ON_HIT` `on: "kill"`, `temphp`, `within: 10` | the pack's heal (Cha + Warlock level, min 1) as Temporary Hit Points when the warlock drops an enemy — or anyone does within 10 ft of it (the 2024 text; the plan's walk line had it the warlock's kill only) |
| Starry Form | `EFFECT_CHOICES` `picks`, `lands`, `chip` + `HEAL_REROLLS` `also` | Archer / Chalice / Dragon asked at "Consume Wild Shape": Dragon Form lands only with Dragon (the pack lands it on every use); Chalice keeps a form chip, and a levelled healing spell's card then offers the Chalice heal to you or a creature on your side within 30 ft |
| Dragon's Concentration floor | — | **NATIVE**: the pack's Dragon Form carries `concentration.roll.min` 10 (M0 missed it); no `floor` facet was built |
| Rage of the Wilds | `EFFECT_CHOICES` `on: "Rage"`, `use` + `EMANATIONS` `while` (a list) + `EFFECT_BENDS` `member` | Bear / Eagle / Wolf asked at the Rage (which lands at once); the pick uses the feature's own activity. The Wolf: a quiet 5-ft ring on enemies while Rage of the Wolf AND Rage stand; its members are attacked with Advantage by everyone but the barbarian — the barbarian's own "Rage of the Wolf" never counts |
| Rage | `TURN_GRANTS` `remind: "extend"` | the turn-end reminder (the register's row) — the 2024 text, not "attacked or took damage" |
| Sacred Weapon | `TOKEN_LIGHTS` `ends: "enchantment"` | 20 ft Bright, 20 more Dim on the paladin's token, clocked as the enchantment, out when it leaves the weapon; the +Cha and Radiant stay the pack's |
| Deflect Attacks | `INTERRUPT_REDUCTIONS` `types`, `anyType`, `atZero` | rolled at the answer (Parry's path) — B/P/S hits only unless Deflect Energy; at 0, the Redirect is offered on the damage card |

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Rage, then a turn with no attack roll and no save forced | at the turn end: "Rage — it ends now unless you extended it"; nothing removed |
| Frenzy, Reckless ticked, the first hit | the offer's ticked row "Frenzy — 2d6 …"; the second hit shows none |
| Rage with Rage of the Wilds | the Rage's card asks Bear / Eagle / Wolf; Wolf: an ally attacking a goblin beside the barbarian sees "Rage of the Wolf — Advantage" in the gate |
| Combat Inspiration, an Inspired ally hits | the offer's UNticked row "Combat Inspiration — 1d6"; ticked, the die rides and the Inspired effect is gone |
| Combat Inspiration, an Inspired ally is hit by 2 | the ally's popup "−1d6 · a Reaction · the Inspired die"; Answer: the die rolls, MISS |
| War Priest, a weapon attack | Hew's popup "War Priest — … 3 of 3 uses left" |
| Starry Form | "Which constellation glimmers on you?"; Chalice, then Cure Wounds at an ally: "Chalice — heal one more within 30 ft" with a button per creature |
| Hunter's Prey, the first hit | the offer asks "Hunter's Prey — which option did you take?"; Colossus Slayer on a damaged target rides 1d8; the card's *Change* asks again next hit |
| Horde Breaker, a goblin beside the target | "Horde Breaker — … Goblin 2 within 5 ft of Goblin" |
| Tides of Chaos, any d20 dialog | the buy box "Tides of Chaos (1 use)" |
| Dark One's Blessing, the fighter drops a goblin 5 ft from the warlock | "Dark One's Blessing — Vyr gains 7 Temporary Hit Points", receipted |
| Repelling Blast, an Eldritch Blast hit | "Repelling Blast — push it up to 10 feet … (move the token)" per beam |
| Commanding Presence, a Persuasion check | the superiority die offered on the check |
| Sacred Weapon | the paladin's token lights 20/40; deleting the weapon's enchantment puts it out |
| Glorious Defense, an ally beside the paladin hit by 2 | the paladin's popup "−3"; Answer: MISS, then "Strike the Bugbear with Longsword?" |
| Deflect Attacks, a 7-damage hit | the monk's popup, the reduction rolled; at 0, the damage card offers "Redirect" |

## The PHB classes — A2 (2026-09-29, Session 0 stage A2)

**The hit menu's next groups — five rows, no new kind, no new file; BUILT and PROVEN (`smoke-classes` §28–31), unwalked.**
The plan's §3 A2, read off the pack (`dnd-players-handbook.classes`, dnd5e 6.0.5). Built in rapid mode on calls the
plan left open — **each is the user's to overrule**:

1. **Monk's Focus is ONE group of two picks** (`max: 2`): Stunning Strike and Hand of Harm are separate once-per-turn
   features, and the rules let both ride one hit; the plan's "one pick per group" would have forbidden it. Each
   option shows its own die beside the one Focus Point (`ownDice`).
2. **Open Hand Technique and Elemental Attunement are FREE groups of their own** (`pool: "free"`), not rows in the
   Focus group: they cost nothing and ride beside a Focus pick (Stunning Strike + Topple on one Flurry hit).
3. **"A Flurry of Blows hit" is a turn chit** written when Flurry of Blows is used (the pack's strikes carry no
   mark) — a bend row. Out of combat every Unarmed Strike offers it.
4. **Stunning Strike's success half is fixed at the SAVE**, not the menu: the pack marks Slowed failure-only, so a
   failure landed Stunned AND Slowed and a success nothing — from the sheet too. `SAVE_PRESSES` gains a `success`
   facet (the named activity effects land on a success, never a failure); the save's card says both halves.
5. **Protective Field is keyed by its item** (`INTERRUPT_REDUCTIONS["Psionic Power"]`, `activity: "Protective
   Field"`): Stone's Endurance's `any` for yourself, Interception's guard (`ally: 30`) for another — a bend row
   (the guard is asked on an attack's damage only); a guard with no Psionic Energy Dice left is never asked.

| Row | Table · facet | What it does |
| --- | --- | --- |
| Stunning Strike | `HIT_OPTIONS` `noDie`, `save`, `oncePerTurn`, `weapons: "monk"` + `SAVE_PRESSES` `success` | on a Monk weapon or Unarmed Strike hit, once per turn: the save activity used at the target IS the cost (1 Focus Point, `paidBySave`); Stunned on a failure, Slowed on a success |
| Hand of Harm | `HIT_OPTIONS` `ownType`, `oncePerTurn`, `unarmed` | 1 Focus Point on an Unarmed Strike hit: the Martial Arts die + Wis necrotic rides the roll |
| Open Hand Technique | `HIT_OPTIONS` × 3 (`activity` Addle / Push / Topple, `label`, `only: "flurry"`) in a free group | one pick: Addle's effect lands on the hit; Push and Topple through their saves (Topple's Toppled is the save's own effect) |
| Elemental Attunement | `HIT_OPTIONS` (`activity: "Elemental Save"`, `only: "own"`, a line) in a free group | on an Elemental Strike hit (the feature's own attack): the Strength save; the push or pull a card line |
| Psionic Power — Psionic Strike | `HIT_OPTIONS` (`activity`, `ownType`, `oncePerTurn`, `weapon`) in the `psionic-power` group | a Psionic Energy Die + Int as Force on a weapon hit, once per turn |
| Psionic Power — Protective Field | `INTERRUPT_REDUCTIONS` `pool`, `any`, `ally: 30` | the die + Int (at least 1) off the damage, yourself or an ally within 30 ft; the pool spent at the answer |

**Found by the suite:** an applied enchantment DOUBLES its rider activities (Elemental Attunement's Elemental Save:
the hidden rider and the enchantment's copy) — the hit menu takes the usable copy by name (`usableNamed`). The guard's
popup reads the row's words (`label`, `verb`: Protective Field's "Reduce"; Interception keeps "Intercept").

**Owed in the code (known, small):** a Legendary Resistance flip of a failed Stunning Strike unwinds Stunned but
lands no Slowed (`saves/verdict.js` `unwindFailedConsequences` re-applies damage only); Physician's Touch's
Poisoned rider is B4's.

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Stunning Strike, an Unarmed Strike hit | the hit menu: "Monk's Focus · N Focus Points left", "Stunning Strike — 1 Focus Point"; the Constitution save after the damage; a failure Stunned, a success Slowed |
| Stunning Strike, the second hit this turn | the row greyed "used this turn" |
| Stunning Strike + Hand of Harm on one Unarmed Strike | both ticked; the die rides, two Focus Points spent |
| Open Hand Technique after Flurry of Blows | the group "Open Hand Technique · free": Addle / Push / Topple, one pick; a plain Unarmed Strike (no Flurry this turn) shows none |
| Hand of Harm | "Hand of Harm — 1d8 + 3 necrotic · 1 Focus Point" rides the damage |
| Elemental Attunement, an Elemental Strike hit | "Push or pull — free"; the Strength save; the card's line says the table moves the token |
| Psionic Strike, a weapon hit | "Psionic Strike — 1d8 + 3 force · 1 Psionic Energy Die"; the pool spent |
| Protective Field, an ally within 30 ft hit | the guard's popup to the Psi Warrior; the damage lands short by the roll |

## The PHB classes — A4 (2026-09-29, Session 0 stage A4)

**The healing seam and the caster's feature rows — three rows on tables that exist, no new kind, no new file; BUILT
and PROVEN (`smoke-classes` §32–35), unwalked.**
The plan's §3 A4, read off the pack (`dnd-players-handbook.classes`, dnd5e 6.0.5). Built in rapid mode on calls the
plan left open — **all three confirmed by the user (2026-09-29)**:

1. **Disciple of Life rides the healing ROLL, not the landing.** The plan put the bonus on `cast.js`'s landing with
   Beacon of Hope's bend ("a card's own buttons are not raised"); a labelled number on the roll (`4[Disciple of Life]`
   — a label that is no damage type leaves the roll's type alone) reaches every applier, the card's buttons too, so
   there is NO bend: Beacon's maximum and the Healer's rerolls read the same roll. "Cast with a spell slot" is read off
   the data: a levelled spell, not innate or at will, and the activity that spends the slot (`consumption.spellSlot`) —
   a lingering heal on a later turn (Aura of Vitality) spends none and gets none. The slot is the item's level plus
   the roll's scaling. The healing card says "Disciple of Life — +N healing".
2. **Potent Cantrip is the caster's mirror of Evasion** (`EVASIONS` `side: "caster"`): read off the DEMAND card's
   caster at the fold, stamped on the entry (`casterHalf`), so a Legendary Resistance flip and an automatic success
   (Greater Magic Resistance) take the half too. It never lowers a half or a full success, and Evasion's "none" still
   wins for a saver who has it. A failure is unchanged, and a success lands none of the cantrip's other effects (the
   save's own rule). **Its attack half** (`onMiss: 0.5`, Graze's shape — the miss still pays) is rolled ONCE THE
   MISS IS FINAL: a rescue that could turn it (the d20 fold, Precision) says so at the roll (`registerMissWait`, the
   synchronous half of its stamp), and the share rolls when it — or a bystander's miss hold — resolves with the miss
   standing; a turned miss rolls the full damage and never a share. The applier deals the missed targets the share,
   so a Shield-flipped hit or a partial hit pays it from the hit's own roll. Like Graze it rolls itself, even where
   the player rolls their own damage.
3. **Psychic Spells is a FREE row of the casting window** (`METAMAGIC` `free`, `fixed: "psychic"`, `classes:
   ["warlock"]`): no cost, no Sorcery Points line when it stands alone, and its tick stands BESIDE a Metamagic pick
   (a Sorcerer multiclass may take both — it is no Metamagic option). The tick rides its own birth flag,
   `metamagicFree` (state), and every damage roll of the cast — never healing — takes Psychic. "A Warlock spell" is
   the spell's own class (dnd5e 6's `classIdentifier`, else its `sourceItem` "class:warlock"), else the caster's one
   class. The components half (Enchantment and Illusion spells
   without Verbal or Somatic components) is out, as the plan ruled: a card line would police nothing.

| Row | Table · facet | What it does |
| --- | --- | --- |
| Disciple of Life | `HEAL_REROLLS` `bonus: "2 + @slot"`, `slotCast` | a levelled spell cast from a slot heals 2 + the slot level more, a labelled part on the healing roll |
| Potent Cantrip | `EVASIONS` `side: "caster"`, `cantrip`, `onSuccess: 0.5`, `onMiss: 0.5` | a successful save against the caster's cantrip takes half its damage — "saved — half damage (Potent Cantrip)"; a missed cantrip attack deals half — "missed — Potent Cantrip, half damage" |
| Psychic Spells | `METAMAGIC` `free`, `fixed`, `classes` | a tick in the casting window on a Warlock spell that deals damage: every damage roll of the cast is Psychic |

**Found by the suite:** dnd5e 6 moved a spell's class from `sourceClass` to `sourceItem` ("class:warlock"),
resolved by `classIdentifier` only when the class is on the sheet. A damage roll that names its usage card now reads
THAT card's metamagic record alone — before, a card with no pick fell back to the newest card of the last minute and
could borrow an earlier cast's Transmuted type.

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Disciple of Life, Cure Wounds at level 2 | the healing roll "2d8 + 3 + 4"; the card's line "Disciple of Life — +4 healing"; the healing lands with it; a potion adds nothing |
| Potent Cantrip, Sacred Flame saved | the verdict "saved — half damage (Potent Cantrip)", the damage halved and applied |
| Potent Cantrip, Fire Bolt misses | the damage rolls anyway; the receipt "missed — Potent Cantrip, half damage"; with Heroic Inspiration, nothing rolls until the rescue window is passed |
| Psychic Spells, an Eldritch Blast cast | the casting window's group "By the Books — Psychic Spells": the row "Psychic Spells · free"; ticked, the beams deal Psychic, the card says "Psychic Spells — the damage is psychic" |

## The PHB classes — A5 (2026-09-29, Session 0 stage A5)

**The ward pool — a new table (`WARD_POOLS`) and its machine (`scripts/ward-pools.js`); no new kind; BUILT and
PROVEN (`smoke-classes` §36), unwalked.** Calls the plan left open — **each is the user's to overrule**:

1. **The seam is `dnd5e.preApplyDamage`, not `preCalculateDamage`** (the plan's): the rule applies Resistances and
   Vulnerabilities BEFORE the ward, and `preApplyDamage` hands the amount after them, with the hit-point update still
   open. The ward takes its share, the rest goes through Temporary Hit Points then Hit Points (dnd5e's own split), so
   every applier carries it — the module's and the card's own buttons. It runs before drop-to-one, which reads the
   update; dnd5e's concentration check reads the real change, so a hit the ward swallows asks no save.
2. **Created automatically** on the first Abjuration cast from a slot after a Long Rest (R1 — "you can" has one
   sensible answer): the pack's Create Ward activity (1 per Long Rest) is spent and the ward filled; every later such
   cast refills 2 × the slot level. The pack's Bonus Action refill ("Expend Spell Slot for Ward") stays the sheet's.
3. **The receipt says what the ward took** ("Arcane Ward took 2 — 7 landed") and its **revert gives the ward back**
   (the entry's `ward`); the take pops over the wizard on every client (`wardAbsorb`, Heavy Armor Master's shape).

| Row | Table · facet | What it does |
| --- | --- | --- |
| Arcane Ward | `WARD_POOLS` `pool: "uses"`, `create`, `refill: { school: "abj", per: 2 }` | the feature's own uses are the ward's hit points; damage lands on it first, after traits; an Abjuration slot cast creates or refills it |

**Known limit (small):** the `amount` other damage hooks read (`dnd5e.applyDamage` — the rebukes, damage shares,
drains) is the amount before the ward, so a hit the ward swallows still counts as damage taken there. The effect
view does not yet list the ward's hit points (they stand on the sheet's uses).

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Arcane Ward, the first Abjuration cast after a Long Rest | the card's line "Arcane Ward — created, 12 hit points (of 12)" |
| a 9-damage hit on the wizard, the ward at 4 | "−4 Arcane Ward" pops over the wizard; the receipt "Arcane Ward took 4 — 5 landed" |
| damage applied from the card's own buttons | the ward takes it the same way |
| a Shield cast (level 1) | "Arcane Ward — +2 (6 of 12)" |

## The PHB classes — A6 (2026-09-29, Session 0 stage A6)

**The grants on Initiative and at the turn — a new table (`INITIATIVE_GRANTS`) and its machine
(`scripts/initiative-grants.js`), two `TURN_GRANTS` rows; no new kind; BUILT and PROVEN (`smoke-classes` §37–38),
unwalked.** Measured on the pack first (`dnd-players-handbook.classes`, dnd5e 6.0.5); the plan's drawing was wrong in
three places and the pack's text rules. Calls the plan left open — **each is the user's to overrule**:

1. **Circle Forms is NATIVE** — nothing built. dnd5e's own `wildshape` transformation preset carries the Moon's
   numbers: `tempFormula: max(@classes.druid.levels, @subclasses.moon.levels * 3)` and the `minimumAC` of 13 + Wis.
   The plan's `on: "transform"` trigger word is not needed.
2. **Vitality Surge fires when the Rage is USED, not at every turn start** (the pack's text: "When you activate your
   Rage"): a `TURN_GRANTS` feature row `on: "use"`, `of: "Rage"` — the Barbarian level in Temporary Hit Points, a card.
   **Life-Giving Force is at the turn START** (the plan said the end): each raging turn start rolls (Rage Damage)d6
   and asks the barbarian who gets it — ONE other creature on its side within 10 ft (an allied NPC or summon counts).
   The pick is the rest song's popup (`askHandOut`, rest-grants.js — one picker for every Temporary Hit Point
   hand-out); it has no clock (nothing waits on it). The Temporary Hit Points vanishing when the Rage ends is the
   table's (the row's caveat; the pack's own note says it does not remove them either).
3. **The Initiative grants read each combatant as ITS OWN Initiative lands** ("when you roll Initiative"), not after
   everyone has rolled (Alert's swap waits for all — it needs the others' numbers). Once per combat, re-armed by a
   reset. **Never burnt on nothing:** Persistent Rage happens automatically (R1) only when a Rage use is expended;
   Uncanny Metabolism is offered only when a Focus Point is spent or a Hit Point missing — its popup says what comes
   back ("regain 3 Focus Points and 1d8 + 5 Hit Points? (once per Long Rest)"), the clock answers No. The feature's
   own use (once per Long Rest) is spent with it; the heal is receipted on the card.
4. **Persistent Rage silences the Rage's turn-end reminder** (`unlessFeature`): the Rage lasts 10 minutes without
   being extended.

| Row | Table · facet | What it does |
| --- | --- | --- |
| Persistent Rage | `INITIATIVE_GRANTS` `regain: "Rage"` | at Initiative, every expended Rage use back, its own use spent — "Persistent Rage — Rage uses regained (3 of 3)" |
| Uncanny Metabolism | `INITIATIVE_GRANTS` `regain: "Monk's Focus"`, `heal`, `ask` | at Initiative, offered: every Focus Point back and the Martial Arts die + Monk level healed, receipted |
| Vitality Surge | `TURN_GRANTS` `match: "feature"`, `feature`, `on: "use"`, `of: "Rage"` | the Rage used: the Barbarian level in Temporary Hit Points |
| Life-Giving Force | `TURN_GRANTS` `feature`, `while: "raging"`, `to: "ally"`, `reach: 10` | a raging turn start: (Rage Damage)d6 Temporary Hit Points to one creature the barbarian picks |
| Rage | `TURN_GRANTS` `unlessFeature: "Persistent Rage"` | the turn-end reminder is never posted for a Persistent Rage |
| Circle Forms | NATIVE | dnd5e's Wild Shape preset gives the Moon's temp HP and AC |

**Found in the build:** the moments scan resolves a `[CONST]` flag key through EVERY file's constants, so two
machines naming different keys by the same constant name collide (`GRANT_FLAG` was already turn-grants.js's
`turnGrant`) — the new machine's constants carry its own prefix.

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Persistent Rage, Initiative rolled with a Rage use spent | a card "Persistent Rage — Rage uses regained (3 of 3)"; with none spent, nothing |
| Uncanny Metabolism, Initiative rolled with Focus spent | the popup "Uncanny Metabolism — regain N Focus Points and 1d8 + 5 Hit Points? (once per Long Rest)"; Yes: the sheet moves, the card says both; No: "kept for later" |
| Vitality Surge, the Rage used | "Vitality Surge — (name) gains N Temporary Hit Points" |
| Life-Giving Force, a raging turn start | the dice on a card and the popup "Who gets N Temporary Hit Points?" — creatures on your side within 10 ft, one pick; OK: the card names who got them |
| Persistent Rage, a raging turn with no attack | no "it ends now unless you extended it" card |
| Circle Forms, Wild Shape | the form lands with 3 × the Druid level in temp HP (dnd5e's own) |

## The PHB classes — A7 (2026-09-29, Session 0 stage A7)

**The cast riders — a new table (`CAST_RIDERS`) and its machine (`scripts/cast-riders.js`); no new kind; BUILT and
PROVEN (`smoke-classes` §39–40), unwalked. Then Portent (below, §41).** Measured on the pack first (`dnd-players-handbook.classes`, dnd5e 6.0.5).
Calls the plan left open — **each is the user's to overrule**:

1. **Wild Magic Surge's d20 is rolled by the module** after every Sorcerer spell cast with a slot, once per turn in a
   combat (every cast out of one) — Q7 as ruled, a *Bent by choice* row. A 20 rolls the pack's Wild Magic Surge
   table (never marked drawn) and posts its card; the cast card says "d20: 14, nothing" or "d20: 20, a SURGE — …".
   "A Sorcerer spell" is the spell's own class, else its `sourceItem`, else the caster's one class (A4's reading).
2. **Tides of Chaos, read off the pack's text:** while its use is spent, a Sorcerer slot cast rolls the table AT ONCE
   (no d20) and the use comes back — the plan's "a use back on a 20" was the 2014 wording. The buy box's row (A1)
   is unchanged.
3. **Inspiring Smite is OFFERED** (it spends a Channel Divinity): after Divine Smite the 2d8 + Paladin level rolls on
   a card and the paladin divides it — a number per creature on its side within 30 ft, the paladin among them, what
   is left counted live. It is the rest song's popup (`askHandOut` with `distribute`), not a second picker. **No**
   keeps the Channel Divinity; it is spent only when something is given. Temporary Hit Points never stack: a creature
   already holding more keeps its own ("keeps more" on the card). **The clock gives all to the paladin** — a *Bent by
   choice* row.

| Row | Table · facet | What it does |
| --- | --- | --- |
| Wild Magic Surge | `CAST_RIDERS` `spellClass`, `surgeOn`, `table`, `tides` | after a Sorcerer slot cast, once per turn: the d20; a 20 rolls the surge table; Tides of Chaos spent: the table at once, Tides back |
| Inspiring Smite | `CAST_RIDERS` `after: "Divine Smite"`, `handOut`, `activity`, `reach`, `self` | after Divine Smite: 2d8 + level Temporary Hit Points divided among creatures within 30 ft; the Channel Divinity paid when given |

**Portent — a new table (`STORED_DICE`) and its machine (`scripts/stored-dice.js`), a bystander row with `bend: "set"`;
NO new kind; BUILT and PROVEN (`smoke-classes` §41).** Calls — **each the user's to overrule**:

4. **No `set` kind** (the plan asked for one on the d20 folds; the tripwire stays at 39). A face replacing a d20 is a
   bend on the `roll` interrupt (`bend: "set"`, beside "die" and "neutralise") for another creature's roll, and a
   pinned die for the diviner's own: the shape already has its homes, so the kind would name nothing new (R4).
5. **The faces live on a chip on the wizard** ("Portent — 17 · 3", an effect the effect view lists), written at the
   Long Rest (since 2026-10-14 the bearer rolls the dice from the rest card's ask — *Portent widened*; the roll's card:
   "Portent — 17 and 3 kept"), renamed as a face is spent, deleted when none is left; the
   pack's description text is not written. Once per turn is a stamp on the chip.
6. **Its own roll, before the roll** (the rule's order): the roll dialog carries "By the Books — before the roll" with a
   tick per face; ticked, the d20 term ROLLS that face (its own result, so the crit, the fumble and every reader
   agree; the formula stays "1d20 + 5"), the face is spent, the card says "Portent — the d20 is the 17". A roll with no
   dialog (a demanded save that rolls itself) is the bystander road below, on its own roll.
7. **Another creature's roll, after it** (a platform bend, the register's row): a demanded save that a face turns
   asks the diviner — "Portent — replace the 1 with the 18", only the faces that turn it, whichever side (a friend's
   failure to a success, a foe's success to a failure); an attack asks only on a CRITICAL HIT ("replace the 20 with
   the 2"), an ordinary hit keeps the card's row where a hold already stands (the ruled noise gate); a check (no DC)
   is never offered. Sight is not judged: the scene is the reach. No Reaction, no pool.

| Row | Table · facet | What it does |
| --- | --- | --- |
| Portent | `STORED_DICE` `dice: 2`, `rests`, `tests`, `oncePerTurn` + `INTERRUPT_ROLLS` `bend: "set"`, `stored`, `bystander: "sight"`, `ask: "crit"` | two d20s at the Long Rest kept on a chip; one replaces a D20 Test's d20 — the wizard's own before the roll, another's save or critical hit after it |

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Portent after a Long Rest | the rest card "Portent — 17 and 3 kept"; the effect view's "Portent — 17 · 3" |
| Portent on the wizard's own save (the dialog) | "By the Books — before the roll": "Portent — use the 17" / "use the 3"; ticked, the d20 is the 17, "Portent — the d20 is the 17", the chip "Portent — 3" |
| Portent on an ally's failed demanded save | the popup "Portent — replace the 1 with the 18" (only the faces that save it); Answer: SAVED |
| Portent on a Bugbear's critical hit at an ally | the popup "Portent — replace the 20 with the 2"; Answer: "Portent (name) — 20 → 2 …, MISS" |
| a Bugbear's ordinary hit | no Portent popup |
| Wild Magic Surge, a slot cast | the cast card's line "Wild Magic Surge — d20: 14, nothing"; on a 20 "a SURGE — …" and the table's card |
| Wild Magic Surge, a second cast the same turn | no line |
| Tides of Chaos spent, a slot cast | "Tides of Chaos spent: the surge rolls — …; Tides of Chaos regained"; the sheet's Tides back |
| Inspiring Smite after Divine Smite | the dice on a card; the popup "Divide 12 Temporary Hit Points", a number per creature within 30 ft, "N to give · M left"; OK: the card names each share and "1 Channel Divinity spent"; No: nothing spent |
| Inspiring Smite, the timer runs out | all of it to the paladin, "(timer: all to the giver)" |

## The PHB classes — B1 (2026-09-30, Session 0 stage B1)

**The reroll kind — `reroll` on the d20 folds (R4 pin 39 → 40), its table `REROLLS` (Indomitable, Fanatical Focus); Countercharm
a bystander row (`bend: "reroll"`); no new file; BUILT and PROVEN (`smoke-d20-folds` §12–13, `smoke-classes` §42), unwalked.**
Measured on the pack first (`dnd-players-handbook.classes`, dnd5e 6.0.5): Indomitable carries its uses (`@scale.fighter.indomitable`)
and an unnamed activity whose roll is "Bonus" `@classes.fighter.levels` with NO consumption; Fanatical Focus carries nothing (no
uses, no activity — the text alone); Countercharm one unnamed Reaction activity, range 30 ft, no consumption.
Calls the plan left open — **each is the user's to overrule**:

1. **`reroll` IS a kind** (the plan's, kept): a failed save rerolled with a bonus added is a spend `heroic` cannot say (a use, a
   Rage's once) and a contribution no row can (the new d20 REPLACES and the bonus ADDS in one entry, `decide/verdict.js`).
   It offers where Guarded Mind does: on a demanded save before its verdict (the withhold), and on a save rolled from the sheet
   as an offer the roller judges (no DC there — the register's row). The row's `bonus` is a FORMULA on the roller; the pack's
   own "Bonus" activity roll is read first where the item carries one. Unreadable (a sheet with no Barbarian scale) → the
   fold stays off with a console warning, never a guessed number (BARDIC's shape).
2. **Indomitable pays its own uses by a write** (`spendPoolUses`, the Lucky fold's road): the pack's activity consumes nothing,
   so `use()` would spend nothing. The card: "Indomitable — reroll the d20, +9 · 1 use · 1 left, the new roll stands"; the
   dice: the old face struck, the new one up, a "+9" chip beside it.
3. **Fanatical Focus's once per Rage is a mark on the RAGE EFFECT** (`rerollUsed`, an ActiveEffect flag): the Rage ends, the
   effect goes, the once with it — no chip, no clock. Offered only while the Rage stands (`while: "raging"`).
4. **Countercharm is the bystander's row, NOT a fold row** (the plan wrote `ally: 30` on the kind; the register named
   Protection's guard shape). The closer precedent is the bystander machine (A3): another creature's DEMANDED save, the
   bard within 30 ft asked as a Reaction, the verdict withheld, the popup and the relay already built. So: `INTERRUPT_ROLLS`
   "Countercharm" `bend: "reroll"`, `bystander: 30`, `advantage: true`, `against: ["charmed", "frightened"]` — the
   condition read off the demand card's effects (a save the module did not demand is not offered, the register's row). A
   reroll is a GIFT: only a FRIEND's failure (the bard's own included — the roller is a bystander at 0 ft), and only where a 20
   on the new die reaches the DC. The new d20 rolls at Advantage off the ROLLER (its dice rise on the roller), the new roll
   stands whatever it shows, and the card says "Countercharm (Corin) — the d20 (4) rerolled with Advantage (17, 3) — the 17
   stands: 9 → 22 vs DC 15". "A creature you can see" is not judged (Q6's rule).
5. **Living Legend's save (D1) and Disciplined Survivor (C1) are rows of `REROLLS`** when their band comes (`advantage`, `pool`
   already facets); the plan's `tests` facet on the `tactical` spend waits for its first customer (Dark One's Own Luck, B4).

| Row | Table · facet | What it does |
| --- | --- | --- |
| Indomitable | `D20_FOLDS` `kind: "reroll"` + `REROLLS` `tests: ["save"]`, `bonus: "@classes.fighter.levels"`, `uses` | a failed save rerolled, the Fighter level added, one of the item's uses written off; the new roll stands |
| Fanatical Focus | `D20_FOLDS` `kind: "reroll"` + `REROLLS` `bonus: "@scale.barbarian.rage-damage"`, `while: "raging"`, `once: "rage"` | a failed save rerolled while raging, the Rage Damage bonus added, once per Rage (the mark on the Rage effect) |
| Countercharm | `INTERRUPTS` `roll` + `INTERRUPT_ROLLS` `bend: "reroll"`, `bystander: 30`, `advantage`, `against`, `reaction` | a friend's failed demanded save against Charmed or Frightened within 30 ft: the bard's Reaction rerolls it with Advantage; the new roll stands |

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Indomitable, a demanded save failed | the rescue window: "Indomitable — Rerolls the d20, +9 — 1 use · 1 left, the new roll stands"; Use: the old d20 struck, the new one up, "+9" beside it; the verdict retaken ("7 → 11 + 9 = 20 vs DC 18 — now saves"); the use spent |
| Indomitable, a Wisdom save rolled from the sheet (no demand) | the same offer, the roller judges ("… — ask your DM whether that lands") |
| Fanatical Focus, raging, a failed save | "Fanatical Focus — Rerolls the d20, +2 — once this Rage, the new roll stands"; a second failure the same Rage shows no row; a new Rage offers it again |
| Fanatical Focus, not raging | no row |
| Countercharm, an ally within 30 ft fails a save against Frightened | the bard's popup: "Countercharm — Aster's saving throw … The d20 (4) is rolled again with Advantage; the new roll stands"; Answer: the two d20s rise off Aster, the verdict retaken |
| Countercharm, the save is against Paralyzed (Hold Person) | no popup |
| Countercharm, the bard's own failed save against Charmed | the popup to the bard, "your saving throw" |

## The PHB classes — B2 (2026-09-30, Session 0 stage B2)

**The save bends by name — seven rows, no new kind, no new file; BUILT and PROVEN (`smoke-saves` §32 10/10, `smoke-classes`
§43–§45), unwalked.** Measured on the pack first (`tools/probe-pack-shapes.mjs`, dnd5e 6.0.5): Psychic Defenses, Beguiling
Twist's Advantage, Magical Ambush, Eldritch Hex and Studied-shaped text are TEXT ONLY; Mantle of Majesty ships a self effect
"Unearthly Appearance" (the Bonus Action) and automates nothing; Eldritch Strike ships the effect "Struck" (1 turn) that no
activity lands; Beguiling Twist ships a Save activity (Wisdom, spellcasting DC, a Reaction, 120 ft) with NO effect; Beguiling
Defenses (2024's text — the plan drew the 2014 charm reflection) ships one save activity "Beguiling Reaction" (a Reaction, Wisdom,
half on a save, no damage parts) and 1 use per Long Rest with no consumption; Hex lands six "Hexed <Ability>" effects, each a
check-mode change. Calls the plan left open — **each is the user's to overrule**:

1. **The caster-side row is a facet, not a machine** (`side: "caster"` on EFFECT_BENDS). A row read off the CASTER (Magical
   Ambush's Invisible, Mantle's Unearthly Appearance) cannot read the caster's live sheet from the roller's client: the demand
   carries a SNAPSHOT of the caster at the cast (`demand.source` — uuid, name, the effects and features the caster-side rows
   name, its statuses) and the gate reads that. Honest by construction: what the caster was AS IT CAST is what the rule asks.
2. **Mantle of Majesty is a Fails button** (`saves.fails`): the save "automatically fails" — the die-less fold's road
   (Paralyzed's), the entry `autoFailed` by "Mantle of Majesty". "Charmed by you" is the roller's Charmed whose SOURCE (the
   module's stamp, else the effect's origin) is the demand's caster (`charmedBy: "source"`); a Charmed with no readable source
   lists nothing — the gate never guesses. The row is the pack's effect BY NAME (`named: "Unearthly Appearance"`), so the
   mantle counts only while the Bonus Action's effect stands on the bard.
3. **Eldritch Strike lands its effect off the hit as a clock rider** (`CLOCK_RIDERS "eldritch-strike"`, `lands` — Slasher's
   shape), every weapon hit, one copy refreshed, the `vex` window ("until the end of your next turn"); the target's next save
   against a spell of the STRIKER's (`saves.spells: "source"`) is at Disadvantage, and that save SPENDS the effect (`spend:
   "save"` — Vex's shape on the save side: the record on the save message, the effect deleted).
4. **Eldritch Hex is six rows** ("Hexed Strength" … "Hexed Charisma"), the ability the row's — not read off the effect — and the
   bend only where the effect's SOURCE holds the feature (`saves.sourceFeature`): any other warlock's Hex bends checks alone,
   as the pack's change says.
5. **Beguiling Twist's Reaction is the bystander's row, not a fold** (B1's Countercharm precedent, `bend: "twist"`): anyone's
   SUCCEEDED demanded save against Charmed or Frightened within 120 ft of the ranger (any side — "you or a creature you can
   see"; sight not judged, Q6), the ranger's popup; the roll is NOT bent. The answer uses the pack's Save activity at the ONE
   creature the ranger has TARGETED (never the roller — "a different creature"); no target, the answer is refused and the
   popup asked again. The twist's failure lands the ranger's WORD — Charmed or Frightened (`SAVE_PRESSES` `word.statuses`, every
   option a press; Command's word shape) — for a minute (`lasts`). A save to END the condition from the sheet has no demand:
   not offered (the register's rule).
6. **Beguiling Defenses is a damage interrupt** (`INTERRUPT_MULTIPLIERS`, Uncanny Dodge's shape, halved) whose cast is AIMED at
   the attacker (`at: "attacker"` — the pack's save activity demands the Wisdom save on the cast), the item's once per Long
   Rest spent by a write (`uses` — the activity consumes nothing), and the failure's Psychic damage "equal to the damage you
   take" read off the HIT's receipt for the warlock (`failDamage` on the demand, `saves/consequences.js`) and landed on the
   attacker with a receipt. The Charmed immunity is the sheet's (the pack's level-up trait), not a row.
7. **Danger Sense is NATIVE** (M0), no row.

| Row | Table · facet | What it does |
| --- | --- | --- |
| Psychic Defenses · Beguiling Twist | `EFFECT_BENDS` feature rows, `saves: { advantage, statuses: charmed, frightened }` | Brave's shape: Advantage against a demand that would charm or frighten; a sheet save to end one is listed, not counted |
| Magical Ambush | `EFFECT_BENDS` feature row, `side: "caster"`, `saves: { disadvantage, spells, sourceStatus: "invisible" }` | the caster Invisible as it cast (the demand's snapshot): Disadvantage against its spell |
| Mantle of Majesty | `EFFECT_BENDS` `named: "Unearthly Appearance"`, `side: "caster"`, `saves: { fails, item: "Command", charmedBy: "source" }` | a Command at a creature Charmed by the bard: the save cannot succeed — the Fails button, the entry autoFailed |
| Eldritch Strike | `CLOCK_RIDERS "eldritch-strike"` (`lands` Struck, `clock: "vex"`) + `EFFECT_BENDS "Struck"` (`saves: { disadvantage, spells: "source" }`, `spend: "save"`) | a weapon hit lands Struck until the end of the fighter's next turn; the next save against the fighter's spell at Disadvantage, and it spends the effect |
| Eldritch Hex | `EFFECT_BENDS "Hexed <Ability>"` ×6, `saves: { disadvantage, abilities, sourceFeature: "Eldritch Hex" }` | a Hexed creature's saves of the hexed ability at Disadvantage, only where the hexer holds the feature |
| Beguiling Twist (the Reaction) | `INTERRUPT_ROLLS` `bend: "twist"`, `bystander: 120`, `against`, `activity: "Save"` + `SAVE_PRESSES "Beguiling Twist"` (`word.statuses`, `lasts`) | a success against Charmed/Frightened within 120 ft: the ranger's Reaction demands a Wisdom save of its target; the failure lands the word's condition for a minute |
| Beguiling Defenses | `INTERRUPTS` `damage` + `INTERRUPT_MULTIPLIERS` (`0.5`, `uses`, `at: "attacker"`, `failDamage`) | a hit's damage halved, the attacker's Wisdom save demanded; a failure deals it psychic damage equal to the damage taken |

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Psychic Defenses, a demand that would frighten | the save dialog's section "Psychic Defenses — against Frightened", Net Advantage |
| Magical Ambush, the invisible rogue casts Tasha's Hideous Laughter | the target's section "Vex — Magical Ambush — against a spell, Vex Invisible as it cast", Net Disadvantage; visible, nothing |
| Mantle of Majesty on (Unearthly Appearance), Command at a creature the bard Charmed | "Corin — Mantle of Majesty: this save cannot succeed — Command, Aster Charmed by Corin"; the red Fails button the default; Fails: the entry failed, no die |
| Eldritch Strike, a weapon hit then Hold Person at the target | the damage offer's rider row "Eldritch Strike" ticked; "Struck" on the target; its Wisdom save's section "Struck — against Bramm's spell", Net Disadvantage; after the roll Struck is gone |
| Eldritch Hex, a Hexed (Dexterity) creature's Dexterity save | "Hexed Dexterity — a Dexterity save", Net Disadvantage; a Wisdom save shows nothing |
| Beguiling Twist, anyone within 120 ft succeeds against Charm Person | the ranger's popup "Beguiling Twist — Aster's saving throw — it succeeded; target ONE other creature, then Answer"; the target's Wisdom save demanded; on its failure "Charmed or Frightened?" — the pick lands for a minute |
| Beguiling Defenses, a creature hits the warlock | the hold's popup with Beguiling Defenses (1 use); Cast: the damage halved on the receipt, the attacker's Wisdom save demanded; on its failure psychic damage equal to the damage taken, receipted |

## The PHB classes — B3 (2026-09-30, Session 0 stage B3)

**Brutal Strike and the Fighter's rows — no new kind, no new file; BUILT and PROVEN (`smoke-classes` §46–§49), unwalked.**
Measured on the pack first (`tools/probe-pack-shapes.mjs`, dnd5e 6.0.5): Brutal Strike ships one damage activity
(`@scale.barbarian.brutal-strike`, the weapon's type, the effect Hamstrung −15 ft for 1 turn); Improved Brutal Strike two
utility activities (Staggered, Sundered — bare effects, 1 turn each); Tactical Master a transferred effect adding push, sap
and slow to `weaponProf.mastery.bonus`; Studied Attacks and Relentless are text only. Calls the plan left open — **each is
the user's to overrule**:

1. **Tactical Master is NATIVE.** dnd5e 6 reads `mastery.bonus` into `item.system.masteryOptions`, its attack dialog offers
   the swap (the weapon's own, then Push, Sap, Slow) and stamps the pick on the message (`system.mastery`), which the
   mastery machine already resolves. No row; §49 proves the pick reaches the module's Push ask.
2. **The forgo is a tick in the attack dialog, the advantage buys' MIRROR** (`ADVANTAGE_BUYS` `forgo: true` — Lucky's box
   beside the Reckless source): ticked, every Advantage source is STRUCK (listed, no vote — `forgoneSources`), the net reads
   Normal, and the roll's reminder record carries `forgo: "Brutal Strike"`; nothing is spent. Off when the attack has no
   Advantage to give, has Disadvantage ("mustn't have Disadvantage"), or is not Strength-based (`ability: "str"`). Rolled
   against the net (with Advantage after all): nothing forgone, no group. A roll with NO dialog cannot forgo (the register).
3. **The hit menu's Brutal Strike group opens only on a forgone attack** (`HIT_GROUPS` `requires: { forgo }`): free — the
   Advantage paid for it — its own die on every option (`ownDice`, the feature's activity, the weapon's type), ONE effect per
   hit (`max` 1; level 17's two is D1's). Forceful Blow is a line (the push and the follow-up move are the table's);
   Hamstring Blow lands the pack's Hamstrung; Improved's Staggering and Sundering Blows ride the SAME die (`dieFrom`) and land
   Staggered and Sundered — each until the start of the barbarian's next turn (`clock: "slow"`, the pack's own duration).
4. **Staggered is a save row, Sundered a `plus` row.** Staggered: Disadvantage on the target's next save, spent by that save
   (`spend: "save"`, Struck's road); the Opportunity Attack ban is the table's (the option's line). Sundered: +5 to the next
   attack roll by ANOTHER creature at the target — a LISTED source (no bend) the gate pushes onto the roll's parts
   (`plus: 5`, `except: "source"`: the barbarian's own roll gains nothing), spent by that roll (chip-spend, Vex's road).
5. **Studied Attacks is a use chip a MISS writes** (`USE_CHIPS` `on: "miss"`, `against`): read AS ROLLED on the attack card
   (Graze's road — a later Shield does not re-open it), one chip per missed creature on the fighter, named "Studied Attacks
   — vs <creature>", the `vex` window ("before the end of your next turn"); the gate reads it at THAT creature alone
   (`EFFECT_BENDS` `against`), the roll at it spends it; a fresh miss refreshes the one copy.
6. **Relentless stands in only at an EMPTY pool** (`SUPERIORITY_STAND_INS`): the hit menu counts one die of the stand-in's
   size, the d8 rides in the Superiority Die's place, nothing is spent, a turn chit marks the once per turn. The text
   allows the d8 with dice left too; the module spends a die while one is left — a bend by choice (the register): an ask
   on every maneuver would double the popups for a trade nobody takes. The hit menu's maneuvers only: Parry and the Bonus
   Action maneuvers still ask for a die (the lookup greys them at 0) — B4's if the table wants them.

| Row | Table · facet | What it does |
| --- | --- | --- |
| Brutal Strike (the forgo) | `ADVANTAGE_BUYS` `forgo: true`, `ability: "str"` | the attack dialog's box: the Advantage forgone, the net Normal, `forgo` on the reminder record |
| Brutal Strike (the group) | `HIT_GROUPS "brutal-strike"` (`free`, `ownDice`, `requires.forgo`, `max` 1) + `HIT_OPTIONS` forceful-blow, hamstring-blow, staggering-blow, sundering-blow (`dieFrom`) | on a forgone hit: the feature's die rides and one effect lands (a line, Hamstrung, Staggered, Sundered) until the barbarian's next turn |
| Staggered · Sundered | `EFFECT_BENDS` (`saves: { disadvantage }`, `spend: "save"`) · (`plus: 5`, `except: "source"`, `spend: "attack"`) | the next save at Disadvantage, spent · +5 on another creature's next attack at the target, pushed onto the roll, spent |
| Studied Attacks | `USE_CHIPS` (`on: "miss"`, `against`, `window: "vex"`) + `EFFECT_BENDS` (`against`, `spend: "attack"`) | a miss arms Advantage on the next attack at that creature before the end of the fighter's next turn |
| Relentless | `SUPERIORITY_STAND_INS` (`die: "1d8"`, `pool: "Combat Superiority"`) | with no Superiority Dice left, once per turn, a d8 rides a hit-menu maneuver in the die's place; nothing spent |
| Tactical Master | NATIVE (dnd5e 6 `masteryOptions` off the pack's `mastery.bonus` effect) | the attack dialog's mastery select: the weapon's own, Push, Sap or Slow; the module resolves the pick |

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Brutal Strike, Reckless Attack on, the forgo box ticked | the attack dialog's section: "Reckless — forgone (Brutal Strike)", Net Normal; on the hit the damage offer's group "Brutal Strike": Forceful Blow / Hamstring Blow (+ Staggering / Sundering with Improved), each "1d10 · free" |
| Brutal Strike, the box not ticked | no group on the hit |
| Brutal Strike, Hamstring Blow picked | the die rode the roll, "the forgone Advantage paid for it"; Hamstrung on the target (−15 ft) until the start of your next turn |
| Sundering Blow, then an ally attacks the target | the ally's dialog: "Ogre is Sundered — +5 to this attack roll" and +5 in the formula; the roll spends it; the barbarian's own attack shows nothing |
| Studied Attacks, a miss then an attack at the same creature | after the miss: "Studied Attacks — vs Goblin" on the fighter; the next attack's gate "Bramm — Studied Attacks — vs Goblin", Net Advantage; against another creature nothing; the roll spends it |
| Relentless, no dice left, a maneuver picked | the offer's group "Combat Superiority" with "1d8 Superiority Die"; the card: "Relentless — a 1d8 stood in for the Superiority Die; none spent"; the pool still 0 |
| Tactical Master, a Longsword (Sap) attack | the attack dialog's Mastery select: Sap · Push · Slow; Push picked: the module's Push ask after the hit |

## The PHB classes — B4 (2026-09-30, Session 0 stage B4)

**The table renamed first** (Q5, the user: *"rename it now i hate deferred maintenance"*): `FIGHTING_STYLES`
is **`DAMAGE_RULES`** — `scripts/damage-rules.js`, `scripts/decide/damage-rules.js`, `tests/decide-damage-rules.test.js`,
`tools/smoke-damage-rules.mjs`, `prototypes/damage-rules.html`, the dispatch and check-layers names with them. The
table now holds every rule that is a NUMBER on a damage roll: the fighting styles, the damage feats and B4's
spell-damage bonuses. One name is persisted world data and stays as it is: the face effect's flag `fightingStyle` (renaming it would
orphan every face on a live actor). There is no world list for the table — every row is always listed (`everyRow`);
the `fightingStyleList` key some suites still set is a stale setting the harness tolerates.


**Thirty rows on tables that exist — no new kind (40), no new file (131); BUILT and PROVEN (`smoke-classes` §50–§63), unwalked.**
Measured on the pack first (`tools/probe-pack-shapes.mjs`, dnd5e 6.0.5): the five spell-damage bonuses ship separate Damage
activities clicked by hand (Elemental Fury's Potent Spellcasting nothing at all); Tandem Footwork an Initiative Bonus utility
consuming a Bardic Inspiration use with the scale as its roll; Cosmic Omen two Reaction utilities (Weal (Even), Woe (Odd), 1d6);
Bend Luck a Reaction consuming Font of Magic; Guarded Mind an End Effects utility consuming Psionic Power; Physician's Touch its
own Hand of Harm (with "Poisoned (Hand of Harm)") and Healing Hand; Eldritch Smite a Smite activity `(1 + @spells.pact.level)d8`
consuming `spells.pact.value`; Gift of the Protectors a Protect activity (1/LR) beside Write Name / Erase Name; Lifedrinker a 1d6
Damage and two Hit-Die heals; Telekinetic Adept a Telekinetic Thrust save (Prone); Bastion of Law a Create Shield utility (the
"Warded by Law" effect, Font of Magic scaled by amount, 1d8); Projected Ward a Reaction consuming Arcane Ward by amount;
Defensive Tactics a bare Multiattack Defense utility; Relentless Avenger a speed-0 effect; Misty Escape a Cast (Misty Step),
Disappearing Step (Invisible) and Dreadful Step (a save); Warding Flare's Improved a temp-HP heal; Blessed Healer a
`@scaling + 2` heal; Sculpt Spells, Heroic Warrior, War Magic, Self-Restoration, Elemental Fury, Blessed Strikes nothing.
**Q5 and Q9 the user ruled at the check-in** (the rename now; the Pact-slot branch built). The calls made in the build —
**each the user's to overrule**:

1. **The spell-damage bonuses are `DAMAGE_RULES` rows** (`spells` / `classes` / `school` / `types` / `once`), the bonus pushed
   onto ONE of the spell's damage rolls — the first whose type the row names (decide/damage-rules.js `spellRuleFits`). Potent
   Spellcasting rides every cantrip roll; Elemental Affinity's type is read off the copy's NAME ("Elemental Affinity (Fire)",
   Elemental Adept's road, the same type popup with its own words); Radiant Soul once per turn (a `rider` chit); Empowered
   Evocation and Elemental Affinity once per CAST (a client-local mark on the cast card's id — the rolling client rolls every ray).
   The faces wear the feature's own name (`feat: true` now reads "a feat or class feature").
2. **Eldritch Smite's Pact slot is a `poolOf` branch, not a picker** (`HIT_GROUPS` `pool: "pactSlot"`): every Pact Magic slot is
   one level, so the plan's "slot picker" had nothing to pick — the group reads `system.spells.pact`, the ride spends one, the
   record is the pool-spend shape ("Pact slot (level 2)"). **The pact weapon** is the one bonded through Pact of the Blade's
   enchantment (lookup.js `pactWeaponFits`, `pact` on the option, `enchantBy` on Lifedrinker's rider); with NO bonded weapon on the
   sheet any weapon counts and the caveat says so — the data cannot settle it, and a guessed exemption is never made.
3. **Bend Luck's sign follows the side** (`sign: "either"`, decide/rescue-hit.js `signFor`): a friend's roll +1d4, a foe's −1d4 —
   R1, the one sensible answer; asked on a foe's hit and a friend's miss, a foe's success and a friend's failure. **Cosmic Omen's
   d6 is a `STORED_DICE` chip the Long Rest rolls** ("Cosmic Omen — Weal (4)", never spent, `omen: true`); its parity is the
   sign (`sign: "omen"`), the pack's Weal (Even) / Woe (Odd) activity picked by it, the item's uses the pool. "About to make a
   D20 Test" is bent after the roll — Restore Balance's road (the platform register).
4. **Dark One's Own Luck and Homing Strikes are `tactical` folds with their own tests** (`TACTICAL_FOLDS`: `tests`, `activity`,
   `weapon` — the `tests` facet B1 held for its first customer; no new kind): a d10 on a check or save, the die on a MISS with
   the Psychic Blades alone; neither carries Tactical Mind's refund clause (a feature's own fold is spent either way).
5. **Tandem Footwork rolls ONCE** (`INITIATIVE_GRANTS` `to: "allies"`, `reach: 30`, offered): the number goes onto the Initiative of
   the bard and every ally within 30 ft already rolled; those not yet rolled are noted on the combat (`initiativeBonusDue`) and get
   it as theirs lands, with a card. The Bardic Inspiration use is the activity's consumption.
6. **The grants that are not a roll** (`TURN_GRANTS` `grant`): Heroic Warrior WRITES Heroic Inspiration at the turn start when none
   is held (a card; held already, nothing said — R1); Guarded Mind (a Psionic die, the pack's End Effects), Self-Restoration (free,
   the turn END) and Physician's Touch's Hand of Healing (on the HEALED creature, `to: "target"`) OFFER a condition's end — a button
   per condition worn, Keep the third, the clock keeps; the answer the owner's, the landing (a delete on the bearer, the activity's
   use) the GM's.
7. **Telekinetic Thrust is a `follow` on Psionic Strike** (Telekinetic Adept's save activity used at the hit target after the ride,
   Prone the activity's own effect on a failure; the 10-foot push the table's). **Physician's Touch's Poisoned is an `also` on Hand
   of Harm**: its own Hand of Harm activity's effect lands with the ride, the `vex` window (the end of the monk's next turn).
8. **Lifedrinker's heal is OFFERED** on the damage card (`offers`): a Hit Point Die is a real choice, the pack's own heal activity
   used at the attacker on the button. **Relentless Avenger is Halt's shape** (`judge: "opportunity"`, `lands` the pack's speed-0
   effect, the `halt` clock); the free move is the table's.
9. **Blessed Healer heals the cleric on its own card** after a slot-cast healing spell lands on ANOTHER creature (`HEAL_REROLLS`
   `self: "2 + @slot"`, receipted, once per cast). **Improved Warding Flare's Temporary Hit Points land with the Flare's answer**
   (`INTERRUPT_ROLLS` `heal` — the feature's heal activity rolled on the answerer, receipted on the attack card).
10. **Bastion of Law's pool lives on the effect** (`WARD_POOLS` `pool: "effect"`): Create Shield's use rolls a d8 per Sorcery Point
    (the use's scaling) and lands "Warded by Law (N)" on the TARGETED creature (else the sorcerer) with the pool in a flag; the
    take renames it, at 0 it goes. **Projected Ward is a guard on ANY damage** (`INTERRUPT_REDUCTIONS` `any` + `ally: 30`,
    `pool: "ward"`): the wizard's Arcane Ward absorbs as much of the share as it holds, spent from the ward's uses.
11. **Gift of the Protectors reads the warlock's page** (`DROP_TO_ONE` `named: true`): the dropped creature's name in the
    feature's DESCRIPTION on a character's sheet (the Write Name activity is the pack's bookkeeping; the names are text); it simply
    happens (R1), Protect's activity uses the once, the card names the keeper.
12. **The reminders and the bends.** War Magic is a `BONUS_SWINGS` reminder alone (`when: "attack"`, no drive). Shadow Step a use
    chip with a `melee` bend row. Defensive Tactics: **Escape the Horde reads an off-turn melee attack in a running combat as an
    Opportunity Attack** (the gate's `judge: "opportunity"`, the counted caveat); **Multiattack Defense is a chip on the RANGER
    against the creature that hit it** (`USE_CHIPS` `on: "hit"`, `holder: "target"`, the `halt` clock) and its bend row pushes −4
    onto THAT attacker's rolls at the ranger (Sundered's `plus`, negative, `against: "attacker"`) — the AC +4 as the roll's −4.
    **Misty Escape is a self rebuke** (`REBUKES` `self`, the feature's own Cast activity — Misty Step without a slot) whose Steps
    are offered on the card once driven (`follow`). **Sculpt Spells rides Careful's ask** (`METAMAGIC` `free`, `asks: "careful"`,
    `school: "evo"`, `classes: [wizard]`): the same popup and outcome (the spared succeed and take nothing — the 2024 Careful),
    the cap 1 + the slot level set at the card's birth.

| Row | Table · facet | What it does |
| --- | --- | --- |
| Blessed Strikes: Potent Spellcasting · Elemental Fury: Potent Spellcasting | `DAMAGE_RULES` (`spells: "cantrip"`, `classes`) | +Wis on the class's cantrip damage rolls |
| Elemental Affinity | `DAMAGE_RULES` (`typed`, `spells`, `once: "spell"`) | +Cha on one roll of the chosen type per cast; the type off the copy's name |
| Radiant Soul | `DAMAGE_RULES` (`types: [radiant, fire]`, `once: "turn"`) | +Cha on one radiant or fire roll per turn |
| Empowered Evocation | `DAMAGE_RULES` (`school: "evo"`, `classes: [wizard]`, `once: "spell"`) | +Int on one roll of a Wizard Evocation per cast |
| Bend Luck | `INTERRUPT_ROLLS` (`bystander: 60`, `sign: "either"`, `die: "1d4"`, `on: "both"`) | ±1d4 after another creature's attack, save or check, a Sorcery Point |
| Cosmic Omen | `STORED_DICE` (`die: 6`, `omen`) + `INTERRUPT_ROLLS` (`sign: "omen"`, `omen`, `stored`) | the rest's d6 kept; Weal +1d6 / Woe −1d6 within 30 ft, a use |
| Dark One's Own Luck · Soul Blades (Homing Strikes) | `D20_FOLDS` tactical + `TACTICAL_FOLDS` (`tests`, `activity`, `weapon`) | a d10 on a check or save; the Psionic die on a miss with the Psychic Blades |
| Tandem Footwork | `INITIATIVE_GRANTS` (`to: "allies"`, `reach: 30`, `ask`) | one roll onto every ally's Initiative within 30 ft, late rollers noted |
| Heroic Warrior | `TURN_GRANTS` (`match: "feature"`, `grant: "inspiration"`) | Heroic Inspiration written at the turn start when none is held |
| Guarded Mind · Self-Restoration · Physician's Touch (heal) | `TURN_GRANTS` (`grant: "end"`, `statuses`, `activity` / `on: "turnEnd"` / `on: "use"`, `to: "target"`) | a condition's end offered, the pack's activity paying where it has one |
| Physician's Touch (harm) | `HIT_OPTIONS` hand-of-harm `also` | Poisoned (Hand of Harm) lands with the ride, the vex window |
| Eldritch Smite | `HIT_GROUPS` (`pool: "pactSlot"`) + `HIT_OPTIONS` (`pact`, `press: "prone"`, `maxSize: "huge"`) | (1 + pact level)d8 force on a pact-weapon hit, a Pact slot, Prone |
| Telekinetic Adept | `HIT_OPTIONS` psionic-strike `follow` | Telekinetic Thrust's Strength save after the Strike, Prone on a failure |
| Lifedrinker | `CLOCK_RIDERS` (`enchantBy`, `offers`) | 1d6 necrotic once per turn on the pact weapon; the Hit-Die heal offered |
| Relentless Avenger | `CLOCK_RIDERS` (`judge: "opportunity"`, `lands`, `clock: "halt"`) | the pack's speed-0 effect on an Opportunity Attack's hit |
| Blessed Healer | `HEAL_REROLLS` (`self: "2 + @slot"`, `slotCast`) | the cleric regains 2 + the slot after healing another |
| Improved Warding Flare | `INTERRUPT_ROLLS` Warding Flare `heal` | 2d6 + Wis Temporary Hit Points with the Flare's answer |
| Bastion of Law | `WARD_POOLS` (`pool: "effect"`, `effect`, `create`, `die: 8`) | a d8-per-point ward on the picked creature's effect, spent as damage lands |
| Projected Ward | `INTERRUPT_REDUCTIONS` (`pool: "ward"`, `of: "Arcane Ward"`, `any`, `ally: 30`) | the wizard's ward absorbs a creature's damage within 30 ft |
| Gift of the Protectors | `DROP_TO_ONE` (`named`, `activity: "Protect"`) | a creature named on the warlock's page drops to 1 instead |
| War Magic | `BONUS_SWINGS` (`when: "attack"`) + `MANEUVER_FOLDS` hew | the reminder that one attack may be a cantrip |
| Shadow Step | `USE_CHIPS` (`melee`, `window: "steadyAim"`) + `EFFECT_BENDS` (`scope: "melee"`) | Advantage on the next melee attack this turn |
| Defensive Tactics | `EFFECT_BENDS` Escape the Horde (`judge: "opportunity"`) + `USE_CHIPS` (`on: "hit"`, `holder: "target"`) + `EFFECT_BENDS` Multiattack Defense (`plus: -4`, `against: "attacker"`) | Opportunity Attacks at Disadvantage; +4 AC against the hitter's later attacks this turn |
| Misty Escape | `REBUKES` (`self`, `activity: "Misty Step"`, `follow`) | the Reaction teleport on taking damage, its Steps offered after |
| Sculpt Spells | `METAMAGIC` (`free`, `asks: "careful"`, `school`, `classes`, `cap`) | Careful's ask on the wizard's Evocation, up to 1 + the slot spared |
| Blessed Strikes · Elemental Fury (the parents) | — (the option rows above; Divine / Primal Strike `CLOCK_RIDERS` already) | the parent names the pick |
| Tactical Master (B3) · Danger Sense (B2) | NATIVE | — |

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Potent Spellcasting, Sacred Flame's damage | the damage card's chip "+3" under "Blessed Strikes: Potent Spellcasting"; the dice rise |
| Elemental Affinity, a new copy on the sheet | the popup "Choose your damage type" (Acid · Cold · Fire · Lightning · Poison) renaming it "Elemental Affinity (Fire)"; the face live |
| Bend Luck, the Bugbear hits an ally by 2 | the sorcerer's popup "Bend Luck — −1d4 · a Reaction · Font of Magic N left"; Answer: the d4 off, a MISS |
| Bend Luck, an ally misses by 3 | "Bend Luck — +1d4"; Answer: a HIT |
| Cosmic Omen at the Long Rest | the chip "Cosmic Omen — Weal (4)" (even) or "Woe (3)" (odd); the rest card's line |
| Dark One's Own Luck, a failed check | the rescue window's row "Dark One's Own Luck — 1d10 · 1 use"; accepted, the total patched, no refund ask |
| Tandem Footwork at Initiative | the bard's popup "give 1d8 to allies within 30 ft? · a use of Bardic Inspiration"; Yes: every ally's Initiative up by the roll, the tracker re-ordered |
| Heroic Warrior at the turn start | "Heroic Warrior — <fighter> gains Heroic Inspiration"; held already, nothing |
| Guarded Mind, Frightened, at the turn start | the popup "End a condition on <fighter>? Frightened (Frightened) · 1 Psionic Power (N left)"; End Frightened: gone, a die spent |
| Self-Restoration, Poisoned, at the turn END | the popup with Poisoned · free; End Poisoned |
| Hand of Healing on a Blinded ally (Physician's Touch) | the popup "End a condition on <ally>? Blinded"; End Blinded |
| Eldritch Smite, a pact-weapon hit | the offer's group "Eldritch Smite — 3d8 force · 1 Pact slot · 2 Pact slots left"; ticked: the force dice ride, a slot gone, Prone on a Huge-or-smaller target |
| Psionic Strike with Telekinetic Adept | after the damage, "Telekinetic Adept — Telekinetic Thrust" save card at the target; a failure lands Prone |
| Lifedrinker, a pact-weapon hit | the ticked rider "Lifedrinker — 1d6 necrotic"; the damage card's "Lifedrinker — Heal — spend a Hit Point Die: Use it" |
| Blessed Healer, Cure Wounds (level 2) at an ally | "Blessed Healer — <cleric> regains 4 Hit Points", receipted |
| Warding Flare with Improved | the Flare answered: "+7 Temporary Hit Points" on the flared creature's receipt |
| Bastion of Law, Create Shield (3 points) at an ally | "Warded by Law (12)" on the ally; damage lands short by the ward, the effect renamed, gone at 0 |
| Projected Ward, an ally within 30 ft hit | the wizard's popup "Projected Ward — <ally> is within 30 ft of you · a Reaction", Absorb; the damage lands short, the Arcane Ward down |
| Gift of the Protectors, a named ally drops | "drops to 1 Hit Point instead — <warlock>'s Gift of the Protectors — its name is on the page" |
| Sculpt Spells, Fireball | the cast window's free row "Sculpt Spells"; ticked, the area's ask "Who does the spell spare? Up to 4." (Careful's popup); the spared take nothing |
| Defensive Tactics, a creature attacks off its turn | the gate "<ranger> is — Defensive Tactics (Disadvantage)"; once one hits, the next gate "<ranger> is Multiattack Defense — vs <it> — −4 to this attack roll" |
| Misty Escape, the warlock takes damage | the rebuke's popup "Misty Escape"; Use casts Misty Step (no slot), then the card's buttons "Disappearing Step" / "Dreadful Step" |

## The PHB classes — B5 (2026-09-30, Session 0 stage B5)

**Four band-B emanation rows on the shapes the table has — no new kind (40), no new file (131), one new facet
(`pick`) and one new alert cause (`turnEnd`); BUILT and PROVEN (`smoke-emanations` §26–§29, 15 checks, each section
run alone on the sandbox 2026-09-30), unwalked.** Measured on the pack first (`tools/probe-pack-shapes.mjs`, dnd5e 6.0.5):
Branches of the Tree a Reaction Save (Strength, 30 ft, the "Branches of the Tree" speed-0 effect on a failure);
Inspiring Movement a Reaction utility "Move" consuming a Bardic Inspiration use; Wrath of the Sea two Constitution
save activities ("Manifest Ocean Spray" consuming a Wild Shape use and landing "Manifesting Ocean Spray" on the druid,
"Bonus Action Save" the per-turn pick, both `(max(1,@abilities.wis.mod))d6` cold, the range `@scale.sea.wrath-range`);
Aura of Devotion the effect "Devoted" with NO change — Aura of Courage's exact shape. The calls made in the build,
**each the user's to overrule**:

- **Branches of the Tree is Unnerving Gaze's row standing only while the Rage does** (Rage of the Wolf's `while`): a
  hostile STARTING its turn within 30 ft raises Hew's reminder on the rager; the Reaction's save, its Speed 0 and the
  teleport are the activity's, from the sheet. Quiet: the ring rises and falls with the Rage and says nothing.
- **Inspiring Movement is Reactive Strike's row at 5 ft with `alert.on: "turnEnd"`** — the alert vocabulary's third
  cause (moveIn, turnStart, turnEnd): the region's own turn-end event says who ended a turn inside. The reminder names
  the enemy; the Reaction, the Bardic Inspiration use and both moves are the players', from the sheet.
- **Wrath of the Sea is Inner Radiance's ring with a PICK instead of a pulse** (`pick: { on: "sourceTurnStart",
  activity }`): the ring stands while "Manifesting Ocean Spray" does, reach all (the text says "another creature"),
  nobody wears anything. At the druid's turn start a card lists who stands inside with a button each (the one inside is
  the one button — the clock's default); the pick demands the pack's "Bonus Action Save" at that creature (the trigger's
  card, cause `pick`, the cold rolled with it), once per turn, the card recording the choice. Nobody inside — no card.
  The push is a line on the demand ("pushed up to 15 feet away from you if Large or smaller — move the token"), the
  token the table's (Repelling Blast's shape). A player's pick travels by relay (`emanationPickChoice` → the fold
  onto `emanationPick`), the active GM raises the demand off the fold.
- **Aura of Devotion is Aura of Courage's row with the condition swapped**, and the same caveat: the pack's "Devoted"
  carries no change — add Immunity to Charmed to it at the world.
- **"A creature you can see"** (Branches, Inspiring Movement, Wrath) is not judged — the side and the ring are; the
  bends register has the row.

**The rows:**

| Row | Table · facet | What it does |
| --- | --- | --- |
| Branches of the Tree | `EMANATIONS` (`alert.on: "turnStart"`, `while: "Rage"`, 30 ft, quiet) | the reminder on the rager when a hostile starts its turn inside; the save from the sheet |
| Inspiring Movement | `EMANATIONS` (`alert.on: "turnEnd"`, 5 ft, quiet) | the reminder on the bard when an enemy ends its turn beside them |
| Wrath of the Sea | `EMANATIONS` (`pick`, `while: "Manifesting Ocean Spray"`, `range: "@scale.sea.wrath-range"`, reach all) | the turn-start card asks which creature inside; the pick demands the Constitution save, the cold rolled, the push named |
| Aura of Devotion | `EMANATIONS` (`effect: "Devoted"`, `@scale.paladin.aura`) | the pack's effect on the allies inside |

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Branches of the Tree, raging, a hostile starts its turn within 30 ft | the reminder to the rager: "Branches of the Tree — the Goblin started its turn within <rager>'s reach"; the save from the sheet; no ring while not raging |
| Inspiring Movement, an enemy ends its turn within 5 ft of the bard | "Inspiring Movement — the Goblin ended its turn within <bard>'s reach: a Reaction and a use of Bardic Inspiration to move" |
| Wrath of the Sea manifested | the card "Wrath of the Sea — <druid> — 5-foot Emanation · once on each of your turns, one creature inside is yours to choose" |
| Wrath of the Sea, two creatures in the ring at the druid's turn start | the card "choose one creature inside" with a button each; the pick's demand card "<name> is chosen inside <druid>'s Wrath of the Sea — Constitution save DC N · once on each of your turns", the cold rolled, the push line; the card then reads "Chosen: <name>" |
| Aura of Devotion | allies inside wear "Devoted — <paladin>" in the effect view; the hostile nothing |

## The PHB classes — C1 (2026-09-30, Session 0 stage C1)

**Thirty band-C rows on the shapes the table has — no new kind (40), no new file (131), two new tables that are not kinds
(`CONCENTRATION_EXEMPTS`, `D20_FLOORS`) and a dozen new facets; BUILT and PROVEN (`smoke-classes` §64–§91), unwalked.**
Measured on the pack first (`tools/probe-pack-shapes.mjs`, dnd5e 6.0.5): Relentless Rage a Save activity whose DC is
`10 + (@item.uses.spent * 5)` consuming its own use and a Heal of `2 × level`; Undying Sentinel a Heal of `3 × level` once per Long
Rest; **Rage of the Gods ships Revivification** — a 30-ft Reaction consuming a Rage use whose roll is the barbarian's level (the
register's "Protective Wings" was a misread: the pack's data is the row); Searing Vengeance a Damage activity (2d8 + Cha radiant, a
30-ft Emanation, Blinded) once per Long Rest with no heal activity; Power of the Wilds three bare utilities (Ram's carries the Prone
effect, Lion's nothing); Unbreakable Majesty a Bonus Action landing "Majestic Presence" and a Recoil Save (Charisma, the bard's DC);
Peerless Skill a utility consuming Bardic Inspiration with the scale as its roll; Oceanic Gift two save activities landing "Stormborn"
on the target; Superior Hunter's Defense a Reaction with thirteen typed Resistance effects; Stalker's Flurry a Mass Fear save with a
10-ft Emanation (the data's 10 over the text's 15, N1) and no Sudden Strike activity; Trance of Order two utilities landing a bare
effect; Deflect Energy and Envenom Weapons already built (A1's `anyType`, the Poison option's `upgrade`) — marked BUILT, nothing added.
The calls made in the build, **each the user's to overrule**:

- **The kill moment.** Relentless Rage is Undead Fortitude's save while raging, the DC the activity's own (`dc: "activity"` — it climbs
  as the uses spend), the use spent by the roll itself, a success healing the pack's Heal on top of the 1; held at 1 while the dice
  roll (the bends register). Undying Sentinel is Relentless Endurance's ask with a `heal`. **Rage of the Gods' Revivification is an
  `ally` keeper row**: the barbarian within 30 ft wearing "Rage of the Gods" is asked, its Rage use pays, the creature drops to the
  activity's roll (its level) instead of 1 — Gift of the Protectors' keeper shape with a reach. **Searing Vengeance rides the death
  save** (`on: "deathSave"`): the platform has no pre-roll hook for a Death Saving Throw, so the offer is raised AS the save rolls,
  never before it (the bends register); Yes regains half the maximum and the burst lands on every enemy within its Emanation of the
  creature, Blinded until the end of the turn; "can then stand up" is the table's.
- **The rings.** Power of the Wilds is a pick at the Rage kept as a CHIP (the pack lands nothing on the barbarian for Lion or Ram):
  Lion is Rage of the Wolf's ring with a module-MADE member effect (`made` — the pack ships none) read by EFFECT_BENDS `except:
  "source"` (the enemies inside attack anyone but the rager at Disadvantage); Ram is a clock rider landing the pack's Prone on a melee
  hit once per turn while raging; Falcon is the pack's flight. **Oceanic Gift is Wrath of the Sea's ring around ANOTHER creature**
  (`bearer`): the token wearing the manifest's "Stormborn" (its origin the druid's feature) is the ring's centre, the druid its source
  — the scale, the DC and the turn-start pick are the druid's. Smite of Protection is a CAST rider: after Divine Smite the paladin and
  the members of its Aura of Protection ring wear the pack's effect (Half Cover, the cover measure reads the status) until the start of
  the paladin's next turn.
- **The folds.** Disciplined Survivor is the `reroll` kind paying from the pool its activity consumes (a Focus Point), no bonus. Peerless
  Skill is a tactical fold on the feature's own activity (the Bardic die, a Bardic Inspiration use). **Trance of Order builds two
  facets**: `cancel: "advantage"` on the effect table (every Advantage source struck in the gate, Brutal Strike's forgo shape, a
  listed line says why) and the **D20 floor** — the platform's own `options.minimum` on the roll (Reliable Talent's knob), a d20 below
  10 counting as 10 on the bearer's own D20 Tests; Starry Form's Dragon takes the same table (Int/Wis checks, the Concentration save).
  Versatile Trickster is a FREE tick in the attack dialog on a turn a Trip or Withdraw was used; whether the Mage Hand stands within
  5 ft of the target is the table's — the box is offered, the tick the player's.
- **The riders.** Lunar Form reads the platform's transformation flag (`judge: "wildShape"`). **Bestial Fury and Create Thrall are
  riders on a SUMMON** (`owner: "summoner"`): the feature and its dice are the summoner's, read through the platform's summon origin;
  the hit target must wear the summoner's mark. Superior Hunter's Prey is the spell-pick shape on ANY damage card (`spread`): the mark's
  damage to one other creature within 30 ft of the marked one, a button each, its own card and receipt, the die rolled at the pick.
  Superior Hunter's Defense is Uncanny Dodge's half on any damage (the hold for an attack's, `damage-holds` for the rest) landing the
  pack's typed Resistance for the turn. Stalker's Flurry is a `follow` on Dreadful Strike: the damage card offers Sudden Strike (a
  reminder) or Mass Fear (the pack's save used at every enemy within its Emanation of the ranger). Improved Blessed Strikes is the
  rest song's one-creature pick when the cleric's cantrip lands damage.
- **The reminders and the rest.** Battle Magic is Hew's reminder on an action-cast spell's usage card. Soul of Vengeance is Sentinel's
  bystander shape keyed to the Vow's mark, on the attack card hit or miss. Leading Evasion shares the bard's verdict with every other
  target of the same demand within 5 ft (the consequences pass reads the map; "see or hear" is not judged). Unbreakable Majesty is a
  `save` duplicate: the ATTACKER's Charisma save inside the hold once the hit stands, a failure the `absorbed` verdict, once per turn
  per attacker (a stamp on the effect), never destroyed. Relentless Hunter is the ask machine's first exempt row (a card, no demand).
  Perfect Focus regains Focus Points up to 4 at Initiative, automatically; with Uncanny Metabolism's ask pending it rides that card as
  the fallback landed on its No. Controlled Chaos rolls the surge table twice and the sorcerer picks on the card. Greater Portent is a
  `more` facet on Portent's row. Spell Resistance is Magic Resistance's row on a PC feature (the Resistance to spell damage is the
  table's). Hurl Through Hell is Stunning Strike's hit-menu shape, the save activity the cost.

**The rows:**

| Row | Table · facet | What it does |
| --- | --- | --- |
| Relentless Rage | `DROP_TO_ONE` (`save.activity`, `dc: "activity"`, `while: "raging"`, `uses`, `heal`) | held at 1 while the Constitution save rolls at the climbing DC; a success heals 2 × level; a failure lands 0 |
| Undying Sentinel | `DROP_TO_ONE` (`ask`, `uses`, `heal`) | drop to 1 instead and regain 3 × level, once per Long Rest |
| Rage of the Gods | `DROP_TO_ONE` (`ally: 30`, `while`, `activity`, `to: "roll"`) | a creature within 30 ft held while the raging Zealot is asked; a Rage use, the creature drops to the barbarian's level |
| Searing Vengeance | `DROP_TO_ONE` (`on: "deathSave"`, `ally: 60`, `heal: "halfMax"`) | the offer as a death save rolls; half the maximum back, the burst and Blinded on the enemies around |
| Power of the Wilds | `EFFECT_CHOICES` (`chip`) · `EMANATIONS` (`made`) + `EFFECT_BENDS` · `CLOCK_RIDERS` (`forms`, `melee`, `lands`) | the pick at the Rage; Lion's ring (enemies inside attack others at Disadvantage); Ram's Prone on a melee hit once per turn |
| Oceanic Gift | `EMANATIONS` (`bearer`) | Wrath of the Sea's ring around the creature wearing Stormborn, the druid's pick and DC |
| Smite of Protection | `CAST_RIDERS` (`aura`, `effect`, `clock: "slow"`) | after Divine Smite, Half Cover on the aura's members until the paladin's next turn start |
| Lunar Form | `CLOCK_RIDERS` (`judge: "wildShape"`) | 2d10 radiant once per turn in Wild Shape |
| Bestial Fury · Create Thrall | `CLOCK_RIDERS` (`owner: "summoner"`, `marked`) | the summon's hit on the summoner's Hunter's Mark / Hex rides the summoner's dice |
| Superior Hunter's Prey | `CLOCK_RIDERS` (`spread: 30`, `marked`) | the mark's damage to one other creature within 30 ft of the marked one — a pick, its own card |
| Superior Hunter's Defense | `INTERRUPT_MULTIPLIERS` (`any`, `effects: "type"`) | half of any damage as a Reaction; the typed Resistance for the turn |
| Stalker's Flurry | `CLOCK_RIDERS` (`follow` on Dread Ambusher) | Sudden Strike's reminder or Mass Fear's save, one pick on the damage card |
| Improved Blessed Strikes | `HEAL_ON_HIT` (`on: "damage"`, `pick`) | 2 × Wis Temporary Hit Points to one creature within 60 ft when a cleric cantrip lands damage |
| Battle Magic | `BONUS_SWINGS` (`when: "cast"`) | Hew's reminder after an action-cast spell |
| Soul of Vengeance | `REBUKES` (`on: "attack"`, `mark`) | the paladin within 5 ft offered a melee attack when the Vow's creature attacks |
| Leading Evasion | `EVASIONS` (`share: 5`) | the bard's Evasion shared with the demand's other targets within 5 ft |
| Unbreakable Majesty | `DUPLICATES` (`save`) | the attacker's Charisma save inside the hold; a failure turns the hit aside, once per turn per attacker |
| Peerless Skill | `TACTICAL_FOLDS` | the Bardic die on the bard's own failed check or attack, a Bardic Inspiration use |
| Disciplined Survivor | `REROLLS` (`activity`) | a failed save rerolled for a Focus Point |
| Trance of Order | `EFFECT_BENDS` (`cancel: "advantage"`) + `D20_FLOORS` | no Advantage against the sorcerer; its own d20 floor of 10 |
| Versatile Trickster | `ADVANTAGE_BUYS` (`free`, `when: "cunning-strike"`) | a free Advantage tick after a Trip or Withdraw this turn |
| Perfect Focus | `INITIATIVE_GRANTS` (`upTo: 4`, `unless`) | Focus Points back up to 4 at Initiative when Uncanny Metabolism is not used |
| Controlled Chaos | `CAST_RIDERS` (`twice` on Wild Magic Surge) | the table rolled twice, the sorcerer picks |
| Greater Portent | `STORED_DICE` (`more`) | three dice at the rest |
| Spell Resistance | `EFFECT_BENDS` | Advantage on saves against spells |
| Relentless Hunter | `CONCENTRATION_EXEMPTS` | no Concentration save for Hunter's Mark — a card |
| Hurl Through Hell | `HIT_GROUPS` + `HIT_OPTIONS` | the Charisma save on a hit, once per turn, the feature's use |
| Deflect Energy · Envenom Weapons | — | already built (A1, the sneak machine): marked BUILT |

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Relentless Rage, raging, dropped to 0 | the card "held at 1" then "saves (N vs DC 10) — it drops to 1 Hit Point instead", the heal receipt (2 × level); the next drop's DC 15 |
| Undying Sentinel, dropped to 0 | the popup "drops to 0 Hit Points — drop to 1 Hit Point instead? · and the heal"; Yes: 1 + 3 × level |
| Rage of the Gods, an ally within 30 ft drops | the Zealot's popup "drop to @classes.barbarian.levels Hit Points instead? · a Rage use"; Yes: the ally at the level |
| Searing Vengeance, an ally rolls a death save | the warlock's popup "rolls a Death Saving Throw — Searing Vengeance?"; Yes: half the maximum back, the enemies within 30 ft take the radiant and are Blinded |
| Power of the Wilds, the Rage | "Falcon, Lion or Ram?"; Lion: enemies within 5 ft wear "Power of the Wilds: Lion — <rager>", their attacks at others read Disadvantage; Ram: a melee hit's rider knocks the target Prone |
| Oceanic Gift manifested on an ally | the ring "Oceanic Gift [<ally>]" around the ally; at the druid's turn start the pick card names who stands inside |
| Smite of Protection, Divine Smite cast | the cast card's line "Smite of Protection — Smite of Protection (Half Cover) on <members> until the start of your next turn" |
| Lunar Form in Wild Shape | the offer's ticked rider "Lunar Form — 2d10 radiant" |
| Bestial Fury / Create Thrall | the companion's hit on the marked creature: the rider row with the ranger's / warlock's die |
| Superior Hunter's Prey | the damage card's row "+1d6 force to one other creature within 30 ft of the marked target" with a button each; the pick's own card |
| Superior Hunter's Defense | the hold popup on any hit; Cast halves it and lands "Hunter's Defense: <type>"; a spell's damage asks through the damage hold |
| Stalker's Flurry | the damage card's row "Stalker's Flurry — one of: Sudden Strike / Mass Fear"; Mass Fear's save card at the enemies within 10 ft |
| Improved Blessed Strikes | after a cleric cantrip's damage lands: "Improved Blessed Strikes — N Temporary Hit Points for another creature", the pick |
| Battle Magic | after an action-cast spell: "Battle Magic — <bard> can attack again" |
| Soul of Vengeance | when the Vow's creature attacks: the paladin's popup "<creature> attacked — under your Vow of Enmity"; Strike |
| Leading Evasion | an ally within 5 ft failing the Dexterity save takes half: the entry "Evasion (Leading Evasion (<bard>))" |
| Unbreakable Majesty | a hit inside the presence: the attacker's Charisma save card; a failure "the attack misses instead" |
| Peerless Skill | a failed check or attack: the rescue window's "Peerless Skill" row (the Bardic die) |
| Disciplined Survivor | a failed save: the rescue window's reroll row "Disciplined Survivor" (1 Focus Point) |
| Trance of Order | the gate "attack rolls against it cannot have Advantage — cancelled (Trance of Order)"; its own roll's line "the d20's 3 counts as 10" |
| Versatile Trickster | the next attack dialog after a Trip: the box "Versatile Trickster — free · the Mage Hand within 5 feet of the target — the table's" |
| Perfect Focus | at Initiative: "Perfect Focus — Focus Points back up to 4"; under Uncanny Metabolism's No, the same line on that card |
| Controlled Chaos | the surge line "Controlled Chaos — pick one:" with the two results as buttons |
| Greater Portent | the Long Rest's chip "Portent — a · b · c" |
| Spell Resistance | the save gate lists "Spell Resistance" against a spell |
| Relentless Hunter | damage while concentrating on Hunter's Mark: the card "Relentless Hunter — no save for Hunter's Mark", no ask |
| Hurl Through Hell | the hit menu's group "Hurl Through Hell — 1 use"; the Charisma save card |

## The PHB classes — D1 (2026-10-01, Session 0 stage D1)

**Fifteen band-D rows on the shapes the table has — no new kind (40), no new file, no new table; BUILT and PROVEN
(`smoke-classes` §92–§105), unwalked.** The PHB classes are complete with it. Measured on the pack first
(`tools/probe-pack-shapes.mjs`, dnd5e 6.0.5): **the pack ships ONE Improved Brutal Strike item** (level 13's two blows) — level
17's second effect has no item of its own, so the class level is the read; Superior Inspiration, Supreme Healing, Elusive and
Improved War Magic are text alone; Survivor carries Heroic Rally (a Heal of `5 + @abilities.con.mod`, `activation: turnStart`) and
the Defy Death effect (the Advantage, native); **Elemental Attunement is an ENCHANT activity on its own item** — the item always
holds the enchantment's templates (`transfer: false`), the APPLIED copy is the transferred one; Living Legend's three activities
land "Living Legend: Charismatic" on the paladin (10 minutes) and ship the save reroll as a bare Reaction utility; **its attack
half is "the attack hits instead", not a reroll** (the plan's reroll row was a misread: the pack's text is the row); Stroke of
Luck a utility consuming its own use; Corona of Light a utility with a 60-ft template landing "Corona of Light" on the enemies;
Holy Nimbus a damage activity (Cha + PB radiant) landing "Holy Nimbus"; Avenging Angel a self-aimed utility (the flight) and a
Frightful Aura save (Wisdom, the paladin's DC) landing Frightened; Elder Champion a utility landing "Diminished Defiance" on its
targets and a Regeneration heal of 10; Tamed Surge text alone; the Wild Magic Surge table 25 rows. The calls made in the build,
**each the user's to overrule**:

- **Improved Brutal Strike (2)** is the group's `maxAt` — the Brutal Strike group's `max` rises to 2 at Barbarian 17
  (`@classes.barbarian.levels`); the 2d10 is the scale's own step.
- **Superior Inspiration** is Perfect Focus's `upTo` row (Bardic Inspiration back up to 2, automatic — nothing spent, nothing asked).
- **Supreme Healing** is Beacon of Hope's `max` keyed to the CASTER (`caster`): every creature the cleric's spell or Channel
  Divinity heals takes the dice's maximum, the flat parts as rolled; the card's own buttons and a typed heal are not raised (the
  caveat Beacon carries).
- **Corona of Light, Holy Nimbus and Elder Champion stand while their use's own effect stands on the bearer**, landed at the use by
  TOKEN_LIGHTS' `on: "self"` (Corona's light 60/90; Holy Nimbus's sunlight 30 — the level-20 aura; **Elder Champion writes no light**
  — a row with no light writes nothing to the token's own); **Avenging Angel's** self-aimed effect is the cast applier's. So each ring
  lives the pack's own clock (1 or 10 minutes), and ends with the effect.
- **The save bends read the demand** (`saves.by`, decide/reminders.js): Corona of Light's MEMBER copy — Disadvantage against the
  cleric's own spell dealing fire or radiant damage, or its Radiance of the Dawn; Elder Champion's Diminished Defiance — against the
  paladin's spells and Channel Divinity; Holy Nimbus's Holy Ward — Advantage on a save a Fiend or an Undead forces (the demand's
  caster snapshot now carries its creature type, and the demand its damage types and whether it is a Channel Divinity use).
- **Holy Nimbus's radiant damage is the plain-damage trigger** (Cloud of Daggers' shape on a feature ring): an enemy starting its turn
  inside takes the activity's Cha + PB, no save, once per turn. **Avenging Angel's Frightful Aura is Fear Aura's** — an enemy starting
  its turn inside saves or is Frightened (the verdict lands the activity's effect); attack rolls against THAT Frightened read
  Advantage (EFFECT_BENDS `itemOnly` — a plain Frightened is the condition's row); "until it takes any damage" is the table's.
- **Survivor:** Heroic Rally is a turn grant `while: "bloodied"` (at half the maximum or fewer, at least 1); Defy Death's 18–20 is
  the D20 FLOORS table's second knob — `critical` (the platform's `criticalSuccess` on the roll), on the Death Saving Throw alone
  (`tests: ["death"]`), the card "Survivor — the d20's 18 counts as a 20".
- **Living Legend:** the save reroll is the `reroll` kind (`whileEffect`, `reaction` — the Reaction is the cost, said on the offer, the
  table tracks it); **Unerring Strike is a `succeed` row (`hit`)**: once on each of your turns, a weapon miss hits instead (a forced
  verdict, no Critical Hit), while the legend stands.
- **Stroke of Luck is a `succeed` row (`twenty`)**: any failed D20 Test — the d20 turns into a 20 and the roll is RE-JUDGED (a replace,
  like a reroll's), never a forced success: a DC above 20 + the bonus still beats it. **On an attack the 20 IS a Critical Hit**
  (the user's call, 2026-10-01 — *Bent by choice — the rule of cool*): it hits whatever the AC and the damage crit-doubles.
- **Elusive** is Trance of Order's `cancel` on a feature (`judge: "notIncapacitated"`). **Improved War Magic** is War Magic's reminder,
  listed first so a fighter of 18 hears it alone. **Elemental Epitome** is a clock rider (`judge: "attuned"` — the APPLIED enchantment;
  `unarmed`: an Unarmed Strike or the attunement's own Elemental Strike); its Resistance is the pack's effect, Destructive Stride the
  table's. **Improved Duplicity** is Invoke Duplicity's listed bend for the cleric's ALLIES (`allies` — the feature held by another
  creature of the attacker's side on the scene); the illusion is not a token the module reads; Healing Illusion is the table's.
- **Tamed Surge** is a facet of the surge row (`tamed`): after a Sorcerer slot cast, with its use standing, the surge line offers a
  pick from every table row but the last; the pick is recorded and posted and spends the use; the effect is the table's to play.

**The rows:**

| Row | Table · facet | What it does |
| --- | --- | --- |
| Improved Brutal Strike (2) | `HIT_GROUPS` (`maxAt`) | two different Brutal Strike effects on one hit at Barbarian 17 |
| Superior Inspiration | `INITIATIVE_GRANTS` (`upTo: 2`) | Bardic Inspiration back up to 2 at Initiative |
| Supreme Healing | `HEAL_REROLLS` (`max`, `caster`) | the cleric's spell and Channel Divinity heals at the dice's maximum |
| Corona of Light | `TOKEN_LIGHTS` (`on: "self"`) + `EMANATIONS` + `EFFECT_BENDS` (`saves.by`) | the light; enemies within 60 ft save at Disadvantage against the cleric's fire or radiant spells and Radiance of the Dawn |
| Improved Duplicity | `EFFECT_BENDS` (`allies`) | Shared Distraction listed on every ally's attack |
| Survivor | `TURN_GRANTS` (`while: "bloodied"`) + `D20_FLOORS` (`critical`) | Heroic Rally at a Bloodied turn start; 18–20 on a death save counts as 20 |
| Improved War Magic | `BONUS_SWINGS` | two attacks for a level 1 or 2 Wizard spell — the reminder |
| Elemental Epitome | `CLOCK_RIDERS` (`judge: "attuned"`, `unarmed`) | the Martial Arts die once per turn on an Unarmed Strike while attuned |
| Holy Nimbus | `TOKEN_LIGHTS` + `EMANATIONS` (`trigger` plain damage) + `EFFECT_BENDS` (`saves.by.creatureTypes`) | the sunlight; radiant damage to an enemy starting its turn inside; Advantage on saves against Fiends and Undead |
| Living Legend | `REROLLS` (`whileEffect`, `reaction`) + `SAVE_SUCCEEDS` "Unerring Strike" (`hit`) | the save reroll as a Reaction; a weapon miss hits instead once per turn |
| Avenging Angel | `EMANATIONS` (`trigger` save) + `EFFECT_BENDS` (`itemOnly`) | an enemy starting its turn inside saves or is Frightened; attacks against it at Advantage |
| Elder Champion | `TOKEN_LIGHTS` (no light) + `EMANATIONS` + `EFFECT_BENDS` (`saves.by`) + `TURN_GRANTS` (`whileEffect`) | enemies inside at Disadvantage against the paladin's spells and Channel Divinity; 10 HP at each turn start |
| Elusive | `EFFECT_BENDS` (`cancel`, `match: "feature"`) | no Advantage against the rogue unless Incapacitated |
| Stroke of Luck | `SAVE_SUCCEEDS` (`twenty`, `tests`) | a failed D20 Test's d20 becomes a 20, once per rest |
| Tamed Surge | `CAST_RIDERS` (`tamed` on Wild Magic Surge) | a pick from the surge table instead of a roll, once per Long Rest |

**The walk table** (for the batched walk):

| Trait | What you should see |
| --- | --- |
| Improved Brutal Strike, Barbarian 17, the forgo ticked | the hit's Brutal Strike group keeps two ticks; both ride the damage |
| Superior Inspiration, Initiative with no uses | the card "Superior Inspiration — Bardic Inspiration uses back up to 2" |
| Supreme Healing, Cure Wounds | the healing at the dice's maximum, the receipt "Healing — Supreme Healing — the maximum" |
| Corona of Light used | the cleric's light 60/90; the enemies within 60 ft wear "Corona of Light — <cleric>"; their save against Sacred Flame lists it, Disadvantage |
| Improved Duplicity, an ally attacks | the gate lists "Improved Duplicity (listed — … within 5 feet of the cleric's illusion)" |
| Survivor, Bloodied at the turn start; a death save of 18 | the heal 5 + Con; the death save a critical success, "Survivor — the d20's 18 counts as a 20" |
| Improved War Magic, an attack | "Improved War Magic — <fighter> can attack again" (War Magic's never beside it) |
| Elemental Epitome, attuned, an Unarmed Strike hit | the offer's rider "Empowered Strikes — <die>", ticked |
| Holy Nimbus used, an enemy's turn starts inside | the card "Holy Nimbus — <enemy> started its turn inside", the radiant damage landed |
| Living Legend standing: a failed save; a weapon miss | the rescue row "Living Legend — your Reaction, the new roll stands"; "Unerring Strike — hit instead", the miss now a hit |
| Avenging Angel used, an enemy's turn starts inside | the Wisdom save card; a failure lands Frightened; an attack at it lists "Frightened" with Advantage |
| Elder Champion used | the paladin's mark (no light); the enemies inside wear "Diminished Defiance — <paladin>"; 10 HP at the paladin's turn start |
| Elusive, Reckless at the rogue | the gate "has Elusive — attack rolls against it cannot have Advantage", Reckless cancelled |
| Stroke of Luck, a failed save | the rescue row "Stroke of Luck — turn the d20 into a 20"; the total re-judged with a 20 |
| Tamed Surge, a Sorcerer slot cast | the surge line's select "Tamed Surge — choose an effect instead (1 use)"; Choose records it and spends the use |

## The GM's side — the five shapes (2026-09-28, night; HANDOFF.md Stage 1)

**The commission** (BACKLOG row 4b, the drawing [audits/drawings/monsters.md](audits/drawings/monsters.md)):
the packs own the monsters' traits; what the GM's side owes is five SHAPES, each landing on a machine
that exists. Built in rapid mode — proved by the suites, not walked; the walk table below is for the
walk that comes later. Every row names its precedent.

| Shape | Customer | Lands on | What was built |
| --- | --- | --- | --- |
| **The kill moment, the victim's side** | Undead Fortitude | `DROP_TO_ONE` (Relentless Endurance's machine, `drop-to-one.js`) — a **`save` facet** | held at 1 in the damage's own update while the bearer's Constitution save rolls ON THE KEEPER, DC 5 + the damage taken (`decide/drop-to-one.js`); the dice decide (R1), no popup; a success leaves the 1, a failure lands the 0; the card says the total against the DC. The exemptions (Radiant, a Critical Hit) are read off the damage card: its rolls' types, and the crit off its rolls or the attack it answers |
| **The kill moment, the death's side** | Death Throes | the same table — a **`died` row** (`on: "died"`) | when the damage leaves the bearer at 0 and nothing held it (`dnd5e.applyDamage`, after the write; the ask's Drop to 0 and the failed save too), the trait's save activity is used AT THE CORPSE: every creature with Hit Points within the activity's Emanation (edge to edge, `geometry.js` `creaturesWithin`), one demand card pinned to them, the fire and force rolled, the saves machine from there. No creature in reach: a card says so |
| **Saves against magic** | Magic Resistance · Greater Magic Resistance · Avoidance | `EFFECT_BENDS` feature rows on the `saves` facet (the Circle's Power judge, `spells: true`); `EVASIONS` | Magic Resistance is one ROW (Advantage against a demand marked as a spell or a Magical item). Greater: `succeeds` generalised from Trance's sleep branch to the spells branch — the save cannot fail, the Succeeds button the default. **Avoidance**: `EVASION` became the table `EVASIONS` keyed by feature, `ability` null reaching every save; the verdict and the receipt name the row that applied (`evasionBy`) |
| **Legendary Resistance** | every legendary creature | **NATIVE — no row** | dnd5e ships it: the NPC's `resistSave`, its button on the failed save's message, the `legres` resource the system spends; the saves machine has honoured the flip since v1.12 (`forced`, smoke-saves §6). A `SAVE_SUCCEEDS` row would be a second entry path to the same thing (a second entry path is never built) |
| **A heal at the turn start** | Regeneration | `TURN_GRANTS` (Heroism's machine, `turn-grants.js`) — **`match: "feature"`** rows | the bearer's OWN trait: its first heal activity rolled on the bearer's numbers at its turn start, receipted; `while: "aboveZero"`; the block (`unless: { damagedBy: "text" }`) read off the BEARER's copy of the trait — "takes Acid or Fire damage" — against the receipts since its last turn started (`decide/turn-grants.js` `blockingTypes`, `damagedSince`: the combat stamp on every receipt, its own turn counting). Blocked, a card says which damage stopped it and nothing lands |

**Why the block reads the monster's copy, not the row.** The pack ships ONE Regeneration item whose
text names no type; each monster's copy (the troll's Acid or Fire, the hydra's Fire, the vampire's
sunlight) carries its own clause. A row naming the troll's types would block the hydra on acid. The
copy is the data; a clause that is not a damage type is the table's (the row's caveat).

**Where it bends** (the register rows below, same commit): a damage card the module cannot read counts
Undead Fortitude (the gate never guesses an exemption); Death Throes skips the 0-HP creatures in reach
(the dead-target gate); Greater Magic Resistance's auto-miss of spell attacks is not built.

**Lists and settings.** No list joined: since *The settings* (2026-09-27) the code table is the only
list, so a new row is on. The HANDOFF's "verify-settings must carry the default" was stale.

### The walk table (deferred — rapid mode)

| Trait | Setup | What you should see |
| --- | --- | --- |
| Undead Fortitude | a zombie at 5 HP, a 10-damage slashing hit | the zombie sits at 1; a Constitution save rolls in chat (DC 15); "saves (N vs DC 15) — it drops to 1 Hit Point instead" or "fails the save — it drops to 0", the 0 then written |
| Undead Fortitude, exempt | the same with Radiant damage, or a Critical Hit | no save; "drops to 0 — Undead Fortitude does not apply · Radiant damage: no save" |
| Undead Fortitude, unreadable | 10 typed on the sheet | the save rolls (the row counts) |
| Death Throes | a balor at 5 HP, three creatures within 30 ft, one at 0 HP | the kill; one card "Death Throes — Balor dies: 2 creatures save", Dexterity DC 19, the 9d6 fire + 9d6 force rolled; the 0-HP one not asked |
| Magic Resistance | a drow targeted by Hold Person | the save dialog's section: "Magic Resistance — against a spell", Net Advantage |
| Greater Magic Resistance | a rakshasa targeted by Hold Person | "this save cannot fail", the Succeeds button the default; pressed, "cannot fail (Greater Magic Resistance)" |
| Avoidance | a creature with Avoidance under Fireball (Dex) and a Con half-damage save | a success takes none, a failure half, "(Avoidance)" on the row and the receipt |
| Legendary Resistance | a dragon failing a demanded save | dnd5e's own "Use Legendary Resistance" button on the roll; pressed, the verdict flips to saved "(legendary resistance)", the resource spent — nothing of the module's to see |
| Regeneration | a troll at 30/84 in combat | its turn start: "Regeneration — Troll regains 10 Hit Points", a receipt; after 8 fire dealt to it, the next turn start: "regains nothing this turn · it took Fire damage since its last turn"; the turn after pays again |

## The GM's side — the aura rows and the attack bends (2026-09-28, night; HANDOFF.md Stage 2)

**The shape.** The Monster Manual writes one aura sentence over and over: *"Constitution Saving Throw:
DC N, any creature that starts its turn in a 10-foot Emanation originating from the swarm"*. The
pack ships each as a save activity carrying the Emanation and the failure's condition. That is an
`EMANATIONS` feature row on a NEW trigger word, **`turnStart`** — the third beside `enter` and
`turnEnd` (the region behaviour's `tokenTurnStart`, the same path as the turn-end trigger, "started
its turn inside"). Nothing stands on a member (`effect: null`): the row lets the verdict land the
activity's own failure effect, where a standing aura's verdict never applies anything (Spirit
Guardians' Half Speed is the region's). A trait lent or taken mid-session raises or lowers its ring
(`createItem` / `deleteItem` sweep).

| Row | Reach | Note |
| --- | --- | --- |
| Fear Aura | harmful (`target: enemy`), off while Incapacitated | a success's 24-hour immunity is the table's |
| Fetid Aura · Stench | all ("any creature") | "an action or a Bonus Action, not both" / "other than a troglodyte" and the 1-hour immunity are the table's |
| Vile Appearance | all, `range: 30` (no Emanation on the activity — "within 30 feet"), `trigger.types: beast, humanoid` — the creature type is a fact the sheet holds, so the trigger narrows itself (DESIGN R1: the data settles it) | "can see its true form" is the table's |
| Lordly Presence | harmful, `activity: "Initial Save"` | the failure's pick (Captivated, Fearful, Mired) is used from the sheet |
| Aura of Authority | helpful, `activity: "Expend Use"`, a ring and a card | the Advantage on the members' attacks and saves is the table's (a bare ring is nothing the attack gate reads) |

**Measured and left NATIVE:** Sickening Vapors (the bearer's turn END), Horror Nimbus (a Bonus
Action), Horrific Visage (an action, a cone) — a save the BEARER uses; the drawing's "eight" is five.

**The attack bends.** Displacement and Blurred Form: `EFFECT_BENDS` feature rows, Disadvantage on
attacks against the bearer, on the new **`notIncapacitated`** judge (the bearer's status is a fact the
gate holds; the judge hinges on the target, so the target pass reads it).

### The walk table (deferred — rapid mode)

| Trait | Setup | What you should see |
| --- | --- | --- |
| Fear Aura | a monster with it in combat, a PC starting its turn within 30 ft | the PC's turn start: "Fear Aura — Pip started its turn inside the Balor's Fear Aura", a Wisdom save; a failure lands Frightened; the same PC entering later in the turn is not asked again |
| Stench | a troglodyte, an ally of it inside | the ally is asked too (reach all) |
| Vile Appearance | a hag, a Beast and a Construct within 30 ft | the Beast's turn start asks; the Construct's does not |
| Aura of Authority | a hobgoblin captain | a ring and a card; nothing lands on the allies |
| Displacement | a displacer beast attacked | the gate: "Displacer Beast is — Displacement", Disadvantage; Incapacitated, the row is gone |

## The GM's side — the reaction rows (2026-09-28, night; HANDOFF.md Stage 3)

**Rows on lists that exist**, each naming its precedent; two words of vocabulary.

| Trait | Lands on | What was built |
| --- | --- | --- |
| Counterattack, Defensive Stance, Whirlwind of Sand | `INTERRUPTS` (`ac`) | rows already |
| Toxic Escape | `INTERRUPTS` `damage` + `INTERRUPT_MULTIPLIERS` (Uncanny Dodge's ×0.5) | the half is the module's; the teleport and the Constitution save at the destination are the sheet's (the row's caveat) |
| Deflect Missile | `INTERRUPT_REDUCTIONS` (Deflect Attacks' shape) — **`ranged: true`** | held on a RANGED hit only: the attack's mode (ranged, or thrown), else its activity's type (`hold/trigger.js` → `findInterrupt`); a melee hit, or one whose mode is unknown, never holds for it. The redirect at 0 is the sheet's Save |
| Limited Foresight | `INTERRUPT_ROLLS` (Shadowy Dodge's row) | a use of "Expend Use" bends the roll; the Advantage after is the table's (`after`) |
| Warding Charm, Jinx | `REBUKES` on a hit (`hit: true`), `activity: "Save"` | the save is put to the attacker after the damage lands (`dnd5e.applyDamage` is the rebukes' seam); "the attack misses instead" is the table's — the register row |
| Sticky Shield | `REBUKES` **`on: "miss"`** — new vocabulary | a MELEE WEAPON attack that MISSED the bearer: the elect stamps the offer off the attack card (`createChatMessage`, Riposte's seam), "X missed Y"; Use puts the Strength save to the attacker |
| Elemental Absorption, Ink Cloud | `REBUKES` **`types`** and **`self`** | `types`: the damage's types off the card's rolls (a card with none counts the row — never a guessed exemption); `self`: aimed at nobody, no reach measured. Elemental Absorption's Resistance is the pack's toggle; Ink Cloud's "while underwater" is the table's |
| Fiendish Blood | — | NOT built: its answer is a save in an Emanation at the bearer against creatures of its choice — Death Throes' shape on a Reaction, with a pick; the register's line |
| Reactive | `REACTION_RESETS` (`every: "turn"`) — the Reaction chip's arithmetic | the spent Reaction stands only for the turn it was spent on; every turn's start gives it back (`decide/chips.js` `reactionStandsEveryTurn`, `shared.js` `reactionSpent`) |
| Redirect Attack, the cast-triggered seven (Spell Reflection, Counterspell…), Eye Rays, Divine Beam | WAIT | a kind each, no player customer |

### The walk table (deferred — rapid mode)

| Trait | Setup | What you should see |
| --- | --- | --- |
| Sticky Shield | a kuo-toa, a PC's melee weapon attack that misses it | "Aster missed Kuo-toa" — Use; a Strength save demanded of Aster |
| Elemental Absorption | a creature with it takes fire from a card | the rebuke offer; slashing offers nothing; damage typed on the sheet offers nothing (no card) |
| Deflect Missile | a monster with it hit by an arrow, then by a sword | the hold and the reduce on the arrow; nothing on the sword |
| Toxic Escape | a monster with it hit | the hold; Use halves the damage; the teleport and the save are yours from the sheet |
| Reactive | a marilith in combat spends its Reaction on a PC's turn | on the next creature's turn it may react again |

## The Monster Manual register (2026-09-28, night)

**The user's question — "did you really go through every ability?" — and the honest answer: no.** The
drawing ([audits/drawings/monsters.md](audits/drawings/monsters.md)) had judged the 251 rows the scan gave a
mechanism family; the other 424 were listed by name only, the scan's silence taken as "the pack's". So the
424 were read one by one against the corpus text and the book got what the spells and the DMG have:
[audits/monsters-register.md](audits/monsters-register.md) from `tools/audit-monsters-register.mjs`
(the shared readers of `tools/register-shared.mjs`, the DMG's WAITS word), one row per trait, action and
reaction, generated, never edited. 680 rows: 433 NATIVE · 55 MODULE · 60 WAITS · 114 TEXT · 18 OUT.

| What the reading found | The ruling |
| --- | --- |
| **The silence was mostly right** | 250-odd rows are the attacks themselves, 60 are casts (the spell's own row in the spells register — a "casts X" row is NATIVE by the generator's rule), the rest senses, movement, telepathy, restorations, Multiattack (TEXT: the attacks it names are the items') |
| **Eleven shapes hid in it, every one on a machine that exists** | the drawing's new table *The rows the scan gave no family*: the repeating save on a monster's own activity (seven customers — Pacifying Spores, Paralysis Gas, Scare, Spores; the petrifying three with an escalation), the grappler's turn-start damage (five), the charge (four: Gore, Tusk, Avalanche Slam, Ravage), the bearer's turn-end pulse (three fire auras), the drain (three), the random condition on a hit (the three Chaos weapons), the ring that moves with the bearer (two), the vampire's drop (three), the curse on a rest (two), nine one-customer rows, one more cast-triggered check (Haunted Zone). **None is a new kind and none is built here** — each is WAITS: built when its monster comes to the table, the precedent named in the drawing |
| **Kind** | trait (the pack's `trait` property) · reaction (the text opens "Trigger:") · action (the rest) |
| **Walked** | the three GM's-side walk tables, read off their plain first cells (the registers' shared reader expects bold names; the GM's side wrote plain ones — the generator reads both) |
| **The first drawing's deferred rows restated** | Redirect Attack, Fiendish Blood, the cast-triggered seven, Eye Rays and Divine Beam, Burst of Ingenuity / Portent / Maneuver, Watery Rebuke / Pursuit / Shriek / Unnerving Gaze — WAITS with their shape; Life Suppression and Negative Energy Cone, Rampage and its kin, Swarm, Antimagic Cone — OUT, as drawn |

## The Monster Manual — the waiting rows built (2026-09-28, night; HANDOFF.md)

**The commission** (HANDOFF.md, the user's word: *"finish what's applicable in MM … autonomously"*): the
register's WAITS rows whose shape sits on a machine that exists ([audits/monsters-register.md](audits/monsters-register.md),
the drawing's *The rows the scan gave no family*) are built, in rapid mode — proved by `tools/smoke-monsters.mjs`
(BTB Test Monster lent each trait by name), not walked. Every row names its precedent. What the pack data
changed on the way is recorded below (*Re-read against the pack*).

| Stage | Shape | Rows | Lands on | What was built |
| --- | --- | --- | --- | --- |
| 1 | **the repeating save on a monster's own activity** | Pacifying Spores, Paralysis Gas, Scare, Spores | `REPEAT_SAVES` (Hold Person's kind) — the same row keyed by the trait: the pack's effect on the target names the trait's activity as its origin (the tray's copy), the trait's save activity is the repeat's; the demand is marked as NOT a spell (`demand.spell` reads the item's type — Magic Resistance never bends a myconid's spores) | nothing new on the machine: the match never had a spell gate |
| 1 | **the escalation** — "First Failure: Restrained … Second Failure: Petrified instead" | Petrifying Bite, Petrifying Breath, Petrifying Gaze | `REPEAT_SAVES` `count: { saves: 1, fails: 1, press: "petrified", swap: true }` — the pack's "Second Save" activity is the repeat's (`activity`) | **`count.swap`**: the pressed status REPLACES the effect (Flesh to Stone's press keeps it under the Petrified); the card says "Petrified instead" |
| 2 | **the grappled creature's own turn** — "until the grapple ends, the target takes N damage at the start (end) of each of its turns" | Constricting Vine, Smother, Spores' *Damage While Poisoned* (the start); Swarm of Proboscises (the end) | `TURN_GRANTS` (Heroism's shape: the pack's Grappled on the target names the attack as its origin; the grappler's "Damage: Grappled" activity rolled on the GRAPPLER's numbers, landed on the bearer, receipted) | **`deals: true`** (a damage, not a heal — the card "takes N type damage", tone bad) and **`on: "turnEnd"`** (the swarm): the machine now pays the combatant whose turn just ENDED its `turnEnd` rows |
| 3 | **the bearer's turn-end pulse** — "at the end of each of its turns, each creature in the Emanation takes…" | Fire Aura, Flame Aura, Heat Aura | `EMANATIONS` `pulse` (Inner Radiance's) | `pulse.activity: null` rolls the item's first damage activity; Fire Aura's "of its choice" reads as its enemies (`reach: "harmful"`), the other two reach all |
| 3 | **the turn-start ring** | Gibbering | `EMANATIONS` `trigger.on: "turnStart"` (Stench's row), off while Incapacitated | nothing new; the failure's d8 is the GM's |
| 3 | **the alerts** — a creature moving within reach (Pursuit 120 ft, Shriek 30, Watery Rebuke 5), or starting its turn within it (Unnerving Gaze 30) | Pursuit, Shriek, Watery Rebuke, Unnerving Gaze | `EMANATIONS` `alert` (Polearm Master's) at the trigger's range | **`alert.on: "turnStart"`**: the turn-start region event raises alerts too, once per turn; the card names a Trait and says "started its turn within"; the Reaction's response is the activity's, from the sheet |
| 4 | **the random condition on a hit** — "roll 1d4: on a 1 Charmed…" | Chaos Blade, Chaos Claw, Chaos Staff | `CLOCK_RIDERS` (the hit's riders) | **`self`** (the rider is the attack's own item, whatever the pack typed it — a weapon; due on that attack alone, no extra dice) and **`random: { die }`** (rolled as the damage lands, the effect named by the face — "1: Charmed" — landed, the face and the name on the record); the attack's own application of all four steps aside |
| 5 | **the drain** — the maximum by what landed, a score by the text's die | Life Drain, Proboscis (the Necrotic alone), Draining Swipe (Strength, 1d4) | **`DRAINS`**, a new table on Vampiric Touch's seam (`drains.js`, `dnd5e.applyDamage`) | the module's own effect for the maximum (`hp.tempmax`, one copy per row refreshed with the total, found by its flag); the pack's "Hit: STR Score −N" for the score, the die read off the item's text (`amount: "text"`, never copied), the deepest step standing past −4; receipted on the drain's card, the dealing card latched per creature |
| 6 | **the vampire's drop** | Spiteful Escape (held at 1, killed outright too — Death Ward's row with no effect); Misty Escape, Shadow Escape (the death's side) | `DROP_TO_ONE` | **`notice`**: a `died` row with no activity — the card says the GM's move (the mist, the teleport home), nothing used |
| 6 | **the curse on a rest** — "gains no benefit from finishing a Short or Long Rest" | Cursed Touch (both rests), Restless Touch (Short) | `REST_GRANTS` | **`block`**: the pack's Cursed on the rester, its origin the touch — the rest's own update and its item updates are emptied before they land, the card's block line says why (`restBlock`) |
| 6 | **the defender's own shield** — "a creature that hits it with a melee attack takes…" | Corrosive Form | `DAMAGE_SHIELDS` (Fire Shield's) | **`match: "feature"`**: the defender's own trait, no effect to find, its first damage activity strikes; `range` where the activity carries none; the weapon's cumulative −1 is the table's |
| 6 | **a typed self rebuke** | Fiendish Blood | `REBUKES` (Elemental Absorption's row) | data: `types` piercing and slashing, the Save activity; the Emanation's creatures of its choice are the template's, placed from the card |
| 6 | **the bend in sunlight** | Sun Sickness | `EFFECT_BENDS` (Sunlight Weakness's row) | data, listed not counted |
| 6 | **the attack's own bend, judged on the map** — "with Advantage if the target is inside its space" | Object Slam | `EFFECT_BENDS` | **`attack`**: the attack's own item is the carrier, no sheet read; **`judge: "targetInSpace"`**: the target's footprint overlaps the attacker's (`geometry.js` `tokensOverlap`, Pack Tactics' map reading); a Claw from the same space reads nothing |
| 6 | **the shell that turns spells aside** — "targeted by a spell that requires a ranged attack roll: roll a d6; 1–5 unaffected; 6 unaffected and reflected" | Reflective Carapace | `DUPLICATES` (Mirror Image's hold) | **`match: "feature"`**: the defender's own trait as one duplicate never destroyed, **`only: "rangedSpellAttack"`** (`hold/lookup.js` `attackFactsOf`, shared by the trigger and the continue), **`reflectAt`**: the face that also reflects — the hit is `absorbed` on the hold, the words say the spell is turned aside, and reflected (the caster the target, the table's) |
| 2 | **the grappler's own turn start** — "deals N damage to any creature grappled by it" | Barbed Hide | `TURN_GRANTS` `match: "feature"` (Regeneration's trigger) | **`deals: "grappled"`**: the bearer's damage activity rolled once, landed on every creature it grapples — Unarmed Fighting's finder, lifted to `geometry.js` (`grappledBy`: a Grappled the module's stamp or the origin traces to the bearer); a grapple it cannot trace is the table's (the caveat); no card when it holds no one |

**Re-read against the pack** (the drawing's shapes that the pack data settled differently):
- **The charge** (Gore, Tusk, Avalanche Slam, Ravage): the pack ships the charge as its OWN attack activity
  ("Moving Attack", the extra dice and the Prone on it) — the GM's pick when it charged. NATIVE, no row; the
  movement is not read (the module reads no token's movement history — Lunging Attack's precedent).
- **Suffocate**: no per-turn damage — the *suffocating* status is the effect's own. NATIVE.
- **Constricting Vine, Smother**: "its turns" are the TARGET's, not the grappler's (the drawing had read them
  as Barbed Hide's shape); the Swarm of Proboscises at the target's turn END.
- **Infernal Glaive**: the pack ships no wound effect to hang the clock on (a save and a "Damage: Infernal
  Wound" activity, no effect) — the wound is the table's. OUT; a copy carrying a wound effect would be a
  `deals` row.
- **Divine Beam**: a plain save with damage (the drawing had lent it Eye Rays' nine effects). NATIVE.

**Ruled OUT, no machine fits** (the register's *Why not*): **Fire Form** and **Blazing Movement** (a ring that
exists only while the bearer moves — a standing ring would burn every turn; the GM's click at each creature
passed); **Sacred Weapon** (the TARGET's pick after a hit — no machine offers the defender a choice on the
hit; the Stun is the effect's, the alternate damage the GM's); **Reactive Heads** (extra Reaction chips for
Opportunity Attacks alone — the chip is one boolean, a count is new arithmetic for one customer; the hydra's
are the tracker's); **Incite Rampage** (Commander's Strike's machine is the Battle Master's words and die;
the target's Reaction attack is its own sheet's); **Maneuver** (an ally's Reaction move — nothing to bend).

**Still waiting, by the earlier rulings** (kinds held for a player customer — RULINGS *The GM's side — the
reaction rows*): the cast-triggered reaction (Spell Reflection, Magical Backlash, Mind Corrosion, Protective
Magic, Counterspell, Psionic Defense, Tongue Twister, and Haunted Zone), Redirect Attack (a redirect
interrupt), Burst of Ingenuity and Portent (another creature's roll bent by a reaction — Cutting Words' and
Bend Luck's kind), Eye Rays (a random ray per target with its own save and damage — a kind of its own).

**The suite:** `tools/smoke-monsters.mjs`, fifteen sections, BTB Test Monster lent each trait by name and the
Victim's own token beside it (`COVERS` the eleven machines touched). ⚠ The pinned d20 (a 5) makes a d8 a 2 —
the sections assert the drop equals the total, never a face; the range is shared (a stray token inside a
ring is not the Victim); another session's bridge blocks the preflight — retry.

### The walk table (deferred — rapid mode)

| Trait | Setup | What you should see |
| --- | --- | --- |
| Pacifying Spores, Petrifying Bite | lent to a monster, used at a PC (the save failed) | the Stunned / Restrained repeats at the PC's turn END; a success ends it; the bite's second failure turns the Restrained into Petrified — the card says "instead" |
| Constricting Vine, Swarm of Proboscises, Barbed Hide | the pack's Grappled on a PC from the attack | the PC takes the vine's damage at its own turn start (the swarm's at its end), receipted; Barbed Hide deals at the MONSTER's turn start to what it holds |
| Flame Aura, Gibbering, Watery Rebuke, Unnerving Gaze | lent; a PC inside / moving in / starting its turn inside | the fire at the monster's turn end; the Wisdom save at the turn start; the reminder cards for the Reactions |
| Chaos Blade | a hit on a PC | one of the four conditions, by the d4; the card names the face |
| Life Drain, Draining Swipe | a hit on a PC | the maximum down by what landed (the effect on the sheet, stacking); the Strength down by the d4 (the pack's effect) |
| Spiteful Escape, Misty Escape | the monster dropped | held at 1 with a card; the notice at 0 |
| Cursed Touch | Cursed on a PC, a Long Rest | nothing regained, the rest card's block line |
| Corrosive Form, Fiendish Blood, Object Slam, Reflective Carapace | a PC's melee hit; slashing damage; a PC inside the mimic's space; a ranged spell attack at the tarrasque | the acid back; the Reaction offered; Advantage in the gate; the spell turned aside on the hold |

## Weapon Mastery — the record (2026-10-10, issue #3)

**The paperwork of Weapon Mastery, kept in dnd5e's own list — one new file (`mastery-record.js` + `decide/mastery-record.js`),
no new kind, no new table; BUILT and PROVEN (`smoke-mastery-record` §1–§8), walked 2026-10-10 (the five rulings of the walk
folded in below).** Ruled off `prototypes/weapon-mastery.html` (the four toggles took the A defaults). Measured on the pack first
(an offline dump of the PHB classes and feats, dnd5e 6.0.6): **the allowance is already data** — each class ships mastery-mode
Trait advancements (Fighter 3 at 1, +1 at 4, 10 and 16; Barbarian 2 at 1, +1 at 4 and 10; Paladin, Ranger and Rogue 2 at 1;
the Weapon Master feat +1 at level 0), and the system's eligibility is one read, `weaponProf.mastery.value.has(weapon.baseItem)`,
before it stamps `system.mastery` on the attack message (the mastery machine's trigger). A character built without the
advancement step has an empty set: no mastery ever fires, and nothing says so. The calls:

1. **The system's list is the truth; the module keeps it the right length.** Nothing is kept in a module flag. The allowance is
   the sum of the sheet's mastery-mode Trait advancements at or below their item's level (a feat's level 0 always counts;
   multiclass adds), so a new class or feat costs no code. Tactical Master's `mastery.bonus` is untouched and never counted
   (§7 proves it: three bonus kinds, the list and the allowance unchanged, a chosen kind's attack stamped and no line).
2. **Untracked means auto-fill, not all-on or all-off** (the issue's comment). On the GM's load (the elect) and after a level-up
   (the owner's client, `dnd5e.advancementManagerComplete`), a party member whose list is shorter than its allowance is topped up
   from its **equipped, proficient** weapons whose kind has a mastery, in sheet order, one per kind, capped at the open slots;
   one GM whisper names the picks and what is still open. A full list is never touched. **An over-long list is never trimmed by
   the fill** (the module cannot know which to drop): it rides the whisper when there is one, the party view flags it, and
   **the Long Rest puts it right** (call 4).
3. **The line at the point of use, RAW** (the walk: toggle B). An attack card whose weapon kind has a mastery the wielder has
   not chosen draws "⟨Weapon⟩: ⟨Mastery⟩ — not mastered by ⟨name⟩ · n of m open — pick at your next Long Rest". No button: a
   kind is chosen when the feature is gained and changed only at a Long Rest (PHB 2024), so an open slot is filled by the fill
   or at the rest, never from the card. A kind the system stamped, a weapon with no mastery, a custom weapon with no base kind,
   and a class with no allowance draw nothing — the line is for a pick gone missing, not a Wizard's staff.
4. **The Long Rest asks the resting owner** (toggle A; the rest-song's road), and **the popup says what you have first** (the
   walk: a bare dropdown confused the table): "You have these masteries: …", then **one swap per Long Rest — remove one, add
   another, or keep them** — one grid: the chosen kinds (green, a box to remove one), the open slots (orange), then the
   **Available** kinds (the sheet's proficient kinds with a mastery that are not chosen — a kind with no weapon on the sheet
   stays the trait dialog's), greyed until a slot is free and one pick per free slot (`restList`: open slots filled, then the one
   swap). Every Long Rest shows the grid, "nothing to change" when it is. **A list over the allowance gets the trim instead of
   the swap**: "n too many — drop n to continue", OK held until exactly n are ticked (`trimList`). The answer rides the card
   (`masterySwap`, a player's answer relayed as `masterySwapAnswer`), the elect lands it judged against the list as it stands
   then (`swapList` / `trimList`), and **the owner acknowledges a confirmation** — "You now have these masteries: …" with the
   change named and OK (the walk's ruling; `acknowledgeMoment`, the card recalls a dismissed popup). The card answers once.
5. **The record is visible any time off the Weapon Mastery feature's own card** (the walk: "where can they see what they have?").
   Every class ships the feature; its card carries "⟨name⟩ has these masteries" with the standing, and opens the same list popup
   with OK for the owner.
6. **The party view opens from the group sheet's header controls** (toggle A; Foundry's `getHeaderControlsGroupActorSheet`,
   GM only): every party member against its allowance — the chosen kinds with their masteries, a chosen kind the sheet shows an
   unproficient weapon of marked, and the state (none · n open · full · over by n). Read-only; the changes stay the rest's.
7. **Tactical Master picks at the hit — a bend by choice** (the walk: the dialog's select is easy to miss). dnd5e's own
   Mastery select in the attack dialog is replaced by a note ("Picked on a hit"); when the hit lands and the wielder's
   `masteryOptions` hold more than the weapon's own, the machine stamps `masteryPick` on the attack and asks the attacker —
   Sap (the weapon's), Push, Slow, or Pass — on the house timer, the weapon's own as the AFK fallback; the answer then runs the
   hit's mastery exactly as a dialog pick would (`smoke-classes` §49). Without Tactical Master nothing changes.
8. **The party is the primary party group** when the world has one — the fill and the party view read its members and nothing
   else (a retired PC or a test fixture that is player-owned and not in the group is never written; the battery of 2026-10-10
   found the fill writing the suites' fixtures at every client load). Without a group, the module's existing word applies
   (`isPartyMember`: a player-owned character). The line and the rest ask keep `isPartyMember` (a player's own sheet is theirs);
   the placeholder sheets with no class read "no mastery" and are never written.

| Row | Where | What it does |
| --- | --- | --- |
| The fill | `mastery-record.js` `fillActors` (`ready` on the elect; `dnd5e.advancementManagerComplete` on the owner) | tops a short list up from equipped weapons; the `masteryFill` whisper to the GM |
| The line | `dnd5e.renderChatMessage` on an attack card | "not mastered by" + the open count + "pick at your next Long Rest"; nothing to press |
| The swap / the trim | `dnd5e.restCompleted` (long) → `masterySwap` card → popup → relay → `registerResumable` → the confirmation | one kind out and one in, or the surplus dropped; landed by the elect; a resolve (`choice`); acknowledged by the owner |
| The record | the Weapon Mastery feature's card | "has these masteries" + the popup with OK |
| The party view | `getHeaderControlsGroupActorSheet` → `openPartyView` | the table, GM only |
| Tactical Master's pick | `mastery.js` `resolveHitMastery` → `masteryPick` card → popup → `executeMasteryPick` (the elect) | the mastery chosen at the hit; a resolve (`mastery`) |

**The walk table** (the sandbox's "Mastery Walk" party; Brannoc carries the Weapon Master feat, Kael Tactical Master):

| Step | What you should see |
| --- | --- |
| Open the world as the GM | one whisper "Masteries filled": Kael — Longsword (Sap), Longbow (Slow), 2 of 4 still open; Brannoc — Greataxe (Cleave), Handaxe (Vex), 1 of 3 still open (the feat's +1); Orin flagged 3 chosen, 2 allowed, nothing removed; Sera (full) and Tam (no mastery) absent |
| Party sheet → header ⋮ → Weapon masteries | the rows: Kael 4 / 2 open, Brannoc 3 / 1 open, Sera 2 / full, Orin 2 / over by 1, Tam 0 / no mastery |
| Kael's sheet → click the Weapon Mastery feature | its card: "Kael has these masteries: Longsword (Sap), Longbow (Slow) · 2 of 4 chosen · 2 open", and the popup with OK |
| Kael attacks with the Dagger | the line "Dagger: Nick — not mastered by Kael · 2 of 4 open — pick at your next Long Rest", no button |
| Kael attacks with the Longsword and hits | the dialog shows "Picked on a hit" where the Mastery select was; on the hit the popup "Which mastery?" — Sap (the weapon's) / Push / Slow / Pass; the pick runs (Push's card, Sap's chip…); no "not mastered" line |
| Sera attacks with the Dagger | the line with "2 of 2 chosen" and no button |
| Kael takes a Long Rest | "You have these masteries: …", Remove (keep them) / Add; Swap writes the sheet; the confirmation "Swapped Longbow → ⟨kind⟩ · You now have …" with OK; Keep leaves it and still confirms |
| Orin takes a Long Rest | "1 too many — drop 1 to continue", OK held until one is ticked; the drop lands; the confirmation names it |
| Tam attacks with the Quarterstaff | no line (a Wizard has no allowance) |

## Summons (2026-10-10, issue #1)

**The player casts and places; the active GM's client makes the creature — one new machine (`summons.js` +
`decide/summons.js`), one shared service (`gallery.js` + `decide/gallery.js`, the picker Wild Shape reuses), one table
(`SUMMON_CHOICES`), no new kind, no setting; BUILT against the static gates and the unit suite, the live suite
(`smoke-summons` §1–§6) written and NOT YET RUN.** Ruled off `prototypes/summons.html` on 2026-10-10 (all four toggles).
Measured on dnd5e 6.0.6 before the build: `SummonActivity#canSummon` is `TOKEN_CREATE && (isGM || allowSummoning)` on the
PLAYER's client and the card's Summon button is hidden without it; `fetchExisting` imports the spirit and throws without
`ACTOR_CREATE`; `getChanges`, `getPlacement` and `getTokenData` are public instance methods and
`dnd5e.canvas.TokenPlacement.place` a public static — a canvas preview with `create: false`, no permission; the summon registry
tracks a creature off `flags.dnd5e.summon.origin` in `prepareDerivedData` and untracks on delete, so nothing is registered by hand;
`flags.dnd5e.dependentOn` is honoured on effects, activities, items and actors, **never on a token**, and the summon activity ties
nothing to the concentration effect (measured live 2026-10-10: a flagged token outlived its concentration). The calls:

1. **The system places nothing.** `dnd5e.preUseActivity` on a summon activity with a profile the cast may use sets
   `usageConfig.create.summons = false` (the precedent is `token-lights.js`). dnd5e's Allow Summoning setting and the player's
   Create Token / Create Actor permissions become irrelevant to a By the Books table.
2. **One popup, off the card** (toggle A). The caster's client stamps the `summon` record (`asked`) on its own cast card at
   `dnd5e.postUseActivity` — the profiles the level allows, each with the creature's art, AC, HP, speeds, attacks and traits read
   off the compendium; the spell's own choice when a `SUMMON_CHOICES` row names one; the concentration effect; the scene — and the
   card's render opens the popup for the caster (`openMomentPopup`, the one answer gate; a dismissed popup is recalled by the card's
   "Place the creature"). The card posts a beat before the popup because the popup anchors to it and a reload re-opens it from the
   flag; the player answers once, in one window, before any creature exists — the ruling's substance.
3. **The form rows carry everything** (toggle C): the radio, the token art, the name over size · speeds · the attacks with their
   dice and the traits, AC and HP on the right (a profile pick) or CR · size · book (a pool pick). One profile asks no form; a
   `cr`-mode profile (Find Familiar, Wild Companion) asks the shared gallery — every visible Actor pack's index at the profile's cap
   and types, one row per name with the Monster Manual's copy first, then the PHB's, then the DMG's (`BOOK_ORDER`), a search box.
4. **Place, then record.** "Place" runs the system's own preview (`TokenPlacement.place`, the count rolled off the profile's
   formula on the caster's roll data) and folds the squares into the record (`placedAnswer`: the profile must be one of the
   record's, the choice one of the row's options, the pool pick present when needed, every placement a square). Cancelling on the map
   leaves the card `asked`.
5. **The elect lands it** (`registerResumable("summon")`, claimed inside `queueFlagWrite` as the mastery swap is): fetch or
   import the creature with its own permissions (`fetchExisting`, the origin stamped so a re-cast finds the one world copy — linked
   companions import once and keep); dnd5e's own `getChanges` for the profile, per token; the tokens created on the record's scene;
   **concentration's end takes them** — the elect, on the concentration effect's delete, asks the dismissal of every landed record
   naming it (call 7); `dnd5e.postSummon` fired for
   whoever listens; the caster's owners (level 3) granted OWNER on the world actor; **a seat right after the caster** (toggle A): a
   combatant on the caster's Initiative less 0.01 when the caster is in the started combat; `applied` stamped with what landed. No GM
   online: the card says "no GM online — it lands when a GM connects" and the first GM render drives it (DESIGN §4, no degraded mode).
   A failure stamps `failed` with the reason and "place it by hand".
6. **The dragon is a table row.** `SUMMON_CHOICES["Summon Dragon"]`: the popup asks the damage type (acid · cold · fire ·
   lightning · poison); the elect narrows the spirit's Breath Weapon parts to the one type on the token's delta
   (`narrowedActivities`) and lands "Shared Resistance (⟨type⟩)" on the caster — one ADD on the resistance trait, dependent on the
   concentration effect, receipted on the cast card (`effectReceipt`) so a revert takes it off. A future spirit with an at-cast
   choice is one more row.
7. **Dismiss** is a button on the landed card for the caster or a GM; the elect deletes the tokens it made and the resistance effect
   and stamps `dismissed`. The effect-view bar's Dismiss and the clock beside the creature are the sandbox pass's.
8. **Tier 2 placed objects** (lights, illusions, Mage Hand, Unseen Servant, sensors; toggle A) ride the same relay: one profile, no
   choice, so the popup is "Nothing to pick: place it" and the elect creates the object. Nothing names them; a summon activity with
   a profile is a summon.

| Row | Where | What it does |
| --- | --- | --- |
| The intercept | `summons.js` `dnd5e.preUseActivity` | `create.summons = false` on every summon activity with a profile |
| The record | `dnd5e.postUseActivity` → `summon` flag `asked` | the profiles with art and lines, the choice, the concentration, the scene |
| The popup | `dnd5e.renderChatMessage` → `showSummonPopup` | the form (rows C), the pool (the shared gallery), the choice; Place runs the preview and folds `placed` |
| The landing | `registerResumable("summon")` → `landSummon` (the elect) | fetch/import, `getChanges`, the narrowed breath, the tokens, `postSummon`, ownership, the seat, the resistance; a resolve (`cast`) |
| Dismiss | the landed card, or the concentration effect's delete (`deleteActiveEffect` on the elect) → `askDismiss` → the same resumable → `dismissSummon` | the tokens and the resistance deleted by the elect |
| The gallery | `gallery.js` `poolFromPacks` / `formRowHTML` / `poolListHTML` / `previewPlacement` over `decide/gallery.js` `galleryRows` | the picker both summons and Wild Shape route through |

**The walk table** (to run on the sandbox once it is free; the Sorcerer fixture lent the PHB's Summon Beast and Summon Dragon):

| Step | What you should see |
| --- | --- |
| A player casts Summon Beast (2nd) | the cast card, no token from the system; the popup "The form · 3 in the pack" with Air / Land / Water rows (art, "Small · 30 ft, fly 60 · Rend · 1d8 + 4 piercing", Flyby; AC 11 · 20 HP), Place |
| Place → one square | the preview on the map; the card "Bestial Land Spirit — placed · waiting for the GM's client" |
| The GM's client | the token lands beside the caster, named Bestial Land Spirit, `flags.dnd5e.summon.level` 2; the card "landed by the GM's client · ⟨caster⟩'s players own it", Dismiss; the player can move it |
| In a started combat | the creature's combatant right after the caster's at Initiative − 0.01 |
| Summon Dragon (5th) | one row (the Draconic Spirit) and the pills acid / cold / fire / lightning / poison; Place held until a type is picked |
| fire, placed, landed | the spirit's Breath Weapon rolls fire alone; "Shared Resistance (Fire)" on the caster's sheet and in the effect receipt |
| End concentration | the token and the resistance go with it |
| Find Familiar | the gallery: the CR 0 beasts of every book, one Owl (the MM's), search by name; the second question (Celestial / Fey / Fiend) is a follow-up row |
| No GM online | the card "no GM online — it lands when a GM connects"; the GM connects, it lands once |
| Dismiss | the token gone, the resistance ended, the card "dismissed" |

**The sandbox pass (2026-10-12, the user on a Wizard's Find Familiar, the prototype for every summon).** Ruled in chat:

1. **A `cr`-mode summon always picks from the pool.** The PHB's Find Familiar ships its one "CR 0 Beast" profile with the
   Bat's uuid beside the cap; the build read "a uuid means this creature" and offered the Bat alone ("Nothing to pick").
   The activity's `summon.mode` is now stamped on the record and `poolPicks` keys on it; the uuid is a default the
   system's own browser never reads. A record from before the stamp keeps the old reading.
2. **The player picks the creature type** (and the size) when the activity offers more than one: Find Familiar's
   Celestial · Fey · Fiend, three pills under the gallery, nothing pre-picked, Place refused until one is picked
   (`listAnswer`; the prototype's familiar scene). The build had taken `creatureTypes[0]` silently. One offered is
   taken without asking.
3. **The words are the player's.** The popup's subtitle is the level alone; the card says "appearing…", "summoned",
   and "no GM online — it appears when a GM connects". No "the GM's client lands it" in front of a player.
4. **Placement is Misty Step's, not a dragged token** (supersedes call 4's `TokenPlacement.place`). "Place" arms
   `gallery.js` `pickSpots`: a ring of the spell's range around the caster (`rangeFeet`: feet, touch as 5 ft, miles
   and metres converted; self or any draws no ring), the creature's footprint following the pointer, green or red by
   `spotVerdict` — within range, no sight-blocking wall between the caster's centre and the space's (the best a canvas
   can say for "a space you can see"), not on a token the player can see (hidden ones never refuse, so nothing leaks).
   A left click places one, `count` clicks place them all, right click or Escape cancels and the card stays `asked`.
   The elect creates the creature at the squares, as before.
5. **The system's checkbox is gone.** `dnd5e.preUseActivity` also sets the usage dialog's own
   `display["create.summons"] = false`, so the Creation section (Place Summons and the system's profile, size and type
   selects) never draws; ticked, it started dnd5e's placement beside the module's.
6. **The `summon` moment names the tokens** (`targets[].tokenUuid`), so FX Studio can play where the creature appeared.
7. **A missing pick keeps the popup.** Place with the creature, its type or the spell's question unpicked warns and
   stays open, the picks kept (the click is stopped before the dialog submits); it used to reopen blank.
8. **One familiar at a time** (`SUMMON_SINGLES`, Find Familiar): when a new one lands, the elect dismisses the same
   caster's earlier standing familiar (`replacedSummons`), and the card says "the earlier one is dismissed". A
   Concentration summon needs no row: a second cast ends the first's concentration, which already dismisses it.
9. **Two seats** (`SUMMON_OWN_INITIATIVE`): landed into a started combat, a summon FOLLOWS the caster (the default: the
   Summon spells, the caster's Initiative less 0.01) or, for a row there, joins and ROLLS ITS OWN Initiative (Find
   Familiar: "rolls its own Initiative and acts on its own turn"). The rules decide which, per spell.
10. **One row everywhere** (supersedes call 3's right column "CR · size · book" for a pool pick): a pool row
   (Find Familiar, Wild Shape) is a profile row — the name; size · speeds · attacks; its key abilities (a special
   sense first, Blindsight 60 ft, then its traits); on the right CR over AC and HP. The pool's creatures are read
   from their packs (one batched read a pack, kept for the session) so the row can say it; no book column (it read
   "Actors", the premium packs' label) and no count line over the list.
11. **One picker** (the user: "a unified ui presentation that the ui rendering goes thru, so everything is not a one
   off"). Every creature pick renders through `gallery.js` `openPicker`: the machine describes sections (rows, a
   searchable pool, pills, a note, the rule; `max` caps the ticks of a multi pick) and the gallery draws them, checks
   the needs on the click (the popup stays open, picks kept) and reads the answer back. Summons and every Wild Shape
   popup (the pick, the GM's change, the Long Rest swap and its confirmation) moved onto it; the row, pool and pill
   builders are private to gallery.js. The gate: `tools/check-pickers.mjs` (`npm run pickers`, in verify) fails a
   picker machine that opens its own popup, draws a radio or checkbox, or reaches into the row markup. Wild Shape's
   card no longer says "the GM's client transforms" (item 3's rule).
12. **Companions** (`COMPANIONS`, Find Familiar first; Primal Companion, Vestige Companion and Find Steed join when their
   text is ruled). A summon that stays until dismissed:
   - **The effect.** "Familiar: Owl (Fey)" on its owner for as long as it stands, on the table or in the pocket ("· in
     the pocket"); a marker, no changes. Removing it asks "Dismiss familiar? This will remove them forever. More options
     available by pressing Find Familiar spell."; yes dismisses it forever, no keeps it
     (`preDeleteActiveEffect`, a veto; the elect's own removal carries `companionEnd`).
   - **The cast menu.** Casting the spell while one stands opens a menu instead of the cast, no slot spent: on the
     table Put it away · Dismiss forever · Summon; in the pocket Call it back · Dismiss forever · Summon. Summon is the
     real cast (ritual or slot, the gallery, the type), and the new form takes the old one's place: in its square (no
     picker) or in the pocket; the old one is dismissed (`replaces` on the record, `intoPocket` on the answer).
   - **The pocket.** Put away: the token is kept as a snapshot and removed; Call back: the picker with the row's
     `recallFt` ring (30 ft), unoccupied, no sight check (`pickSpots` `seen: false`), the snapshot rebuilt there as it
     left. A familiar called back into a started combat rolls its own Initiative again.
   - **No GM online:** every one of these, the first cast included, is refused with "you can't summon or dismiss a
     familiar without a GM online", before any slot is spent.
   - **Leaving and arriving.** Each beat floats on every client the effect's own way ("+(Owl)" rising, "−(Owl)"
     falling) and publishes its own moment marker (`companion-<id>`, `details.companion` leave or appear): FX Studio
     plays `summon-leaves` on a leave, the summon FX on an appear. A leave is published while the token stands and the
     token goes a beat later.
   - **At 0 HP it disappears** (the spell's own text): the elect dismisses it, the card says "dropped to 0 HP and
     disappeared"; casting again summons a new one.
   - **What it carried** (the gear it did not land with) drops when it goes into the pocket, is dismissed, or falls to
     0 HP: a Loot Shelf chest where it stood ("Owl's gear", `createLootContainer`, ephemeral) when Loot Shelf is active,
     else lost. Loot Shelf, not Item Piles (the user): the family's own, detected, never required.
   - **Only the standing companion's own effect asks before it goes**; a stray copy or a gone companion's effect is
     removed as usual, a dismissal removes every effect naming its card, and a landing clears any before making its one
     (a landing on the sandbox left two, the second orphaned and unremovable).
13. **The caster's screen answers** (the user: a GM casting Find Familiar for Open Player 1's character got no popup;
   it went to the player's screen). A summon's and a transform's popup, and the companion menu, open for the user
   who cast it while they are connected (`askedBy`, core.js `answersHere`); the owning player only when the caster
   has left. **Two windows, one GM** land once: the leading window (ARCHITECTURE *The leading window*).
14. **The familiar keeps the form's statistics and items**, its attacks included; "it can't attack" is the table's to
   keep, nothing is stripped or noted.
15. **The table's own art** (the user, 2026-10-12: "a button on the settings screen that opens up a different window,
   otherwise too much clutter"; Find Familiar first). One world setting kept out of the list (`summonArt`), edited
   in its own window behind a settings button (`summon-art.js`, GM only): a spell select, then one row per creature
   the spell can summon (the picker's own row; for Find Familiar the gallery's pool, every book, one per name), each
   with a **Token** and a **Portrait** path, a file picker and a clear. Three calls, ruled:
   - **By creature name**, across books (`decide/summon-art.js` `artKey`): an Owl from any book wears the same art.
   - **Read when it lands.** A familiar standing keeps its art until it is summoned again; saving the window
     writes nothing to a token.
   - **A folder fills the blanks**: `owl.webp` the Owl's token, `owl-portrait.webp` its portrait (`fileStem`:
     lower case, other characters a dash). A field set by hand is kept.
   The art is read where it shows (gallery.js `summonArt`): the picker's rows, the placement ghost, and the landing,
   which folds it into dnd5e's own changes (`artChanges`: the token's texture, the portrait as the actor's image in
   the token's delta). The compendium and the world copy keep the book's art; the companion effect's icon and the
   pocket's snapshot follow the token. `ART_SPELLS` names the spells the window covers; the Summon spells and Wild
   Shape's forms join as rows.

**The second sandbox pass (2026-10-12, the user on the Summons Mage, every summon spell of the PHB, Battle
Familiar).** Ruled in chat; built the same evening, sandbox only, no battery (the user: "we are still in test
mode"):

16. *(Superseded by calls 32 and 33, 2026-10-13: the other activities are hidden, and the system's dialog comes first.)* **Straight to the module's menu, every summon** (supersedes call 2's "the card posts a beat before the
   popup"). dnd5e's activity picker is skipped for an item with a summon activity (`renderActivityChoiceDialog`,
   gear-lights' way): Dancing Lights' Move Lights, Minor Illusion's and Silent Image's Study, Flaming Sphere's
   ram save stay on the sheet and on the placed creature's own sheet. The use opens the menu INSTEAD of the
   cast (`dnd5e.preUseActivity` returns false), and Place picks the spaces and THEN casts, with no usage
   dialog: a cancelled menu or a cancelled placement spends nothing. The record is stamped `placed` at birth
   off the menu's answer. A card still `asked` (a cast from before, or a profile the cast level dropped)
   keeps "Place the creature".
17. *(Superseded by call 33, 2026-10-13: the slot is the system's dialog's.)* **The slot is the menu's.** A leveled spell's menu reads "Cast with": every slot with one left at or above
   its level, lowest first and picked by default, then "As a ritual (no slot)" for a ritual (`castOptions`);
   one option asks nothing; none left refuses the cast with a warning. A cantrip asks none.
18. *(For a summon, the system's dialog asks it since call 33; the rest stands.)* **Ask before ending Concentration** (the user: "casting this will break concentration on xxx / proceed yes
   no"). The menu asks it first (`askConcentrationEnd`, shared.js), since dnd5e asks it only in the dialog the
   menu skips. Any other spell cast past the dialog (`configure: false`) that would end the caster's
   Concentration on ANOTHER spell asks the same on the caster's client and casts again on yes
   (concentration.js; `concentrationAsked` marks an answered use). The same spell's re-use passes.
19. **A summon without Concentration stands on an effect of its caster's** (the user's rule: "if a summon
   doesn't require concentration, add the effect, which is removable; if it requires concentration, no need,
   we work with the concentration mechanic"). Mage Hand, Minor Illusion, Unseen Servant, Tenser's Floating
   Disk, Battle Familiar, a light's object: an effect named for the spell ("Minor Illusion: Illusory Object"
   when the creature says more, `summonEffectName`), the spell's duration, no change; removing it dismisses
   the summon (the elect, `deleteActiveEffect`). Find Familiar keeps its companion effect (call 12); Dancing
   Lights, Silent Image, Flaming Sphere end with Concentration (call 5).
20. **The float is the effect's, over its bearer** (supersedes call 12's "+(Owl)" over the familiar). Arrive and
   leave float "+(Familiar: Raven (Fey))" / "−(…)" over the CASTER's token, Foundry's own float for an effect
   (which a marker effect with no change never draws). The FX still plays where the creature is.
21. **Light and Continual Flame light what is touched** (supersedes TOKEN_LIGHTS' "summon off when a token is
   targeted"). The PHB ships both as a summon of a "Light" object. The menu asks where the light goes
   (`SUMMON_LIGHTS`): **On a token** (the targeted token, pre-picked when one is; token-lights.js lands it as
   before; refused until a token is targeted) or **On an object** (a token placed for the thing touched:
   "Glowing Stone" for Light, "Everburning Stone" for Continual Flame). The object's size is never asked: one
   5-ft square, Small (the user bends the rule's "Large or smaller"; `SUMMON_LIGHTS` `size`). With no token
   targeted, "On a token" is greyed out.
   Light ends when cast again either way (SUMMON_SINGLES, and token-lights' `recast` for the token).
22. **Sizes read smallest first** (`sizesInOrder`): the pack ships Light's as Small, Medium, Large, Tiny.
23. **Recast ends it**: Mage Hand, Minor Illusion and Light join SUMMON_SINGLES (their own text).
24. **Summon Art covers more spells**: Mage Hand, Dancing Lights, Unseen Servant, Light, Continual Flame. The
   table's token now turns the dynamic ring off (`artChanges`): the books' tokens wear a ring whose subject art
   drew over `texture.src`, so a familiar landed in the book's art with the table's set (the Raven).
25. **How the lights look** (`SPELL_LOOKS`, `SUMMON_LOOKS`): Light a steady warm white with a soft edge;
   Continual Flame a flame's flicker; a Dancing Light a torch-size flicker, 10 ft Dim; the Flaming Sphere 20 ft
   Bright and 20 more Dim as its text says (the pack ships 0.25 ft), a torch's flicker with no core (a `flame`
   core blew out the whole bright radius white on the sandbox: "too large"). The Unseen Servant lands
   at half opacity with its Invisible condition switched off on the token (`seen`): Foundry draws an invisible
   token for no one without See Invisibility, its owner included, so the servant could not be found at all.
   Clairvoyance's Invisible Sensor gets the same.
26. **Major Image is one image** (the user: "it includes all senses, no need to pick creature, object or sound").
   `SUMMON_ONE_FORM`: the menu offers no form; the pack's Illusory Creature lands, named "Major Image"; its
   size is still asked.
27. **A summon's commands are spells on it** (the user: "conjure constructs should be given items that allow the
   owner to cast them as if spells, for each option of the command"). `SUMMON_COMMANDS`: on landing, Conjure
   Constructs' "Command" feature becomes two at-will spells on the spirits, Clockwork Force and Orderly Ward,
   each its one activity as it landed (the caster's DC, the cast level's extra die); the feature goes.
28. **Summon Art lists every summon spell the sandbox's test mage carries** (the user): Find Familiar, Battle
   Familiar, Mage Hand, Unseen Servant, Tenser's Floating Disk, Phantom Steed, Dancing Lights, Light, Continual
   Flame, Flaming Sphere, Minor Illusion, Silent Image, Major Image, Clairvoyance, Animate Dead, Summon Fey,
   Summon Undead, Conjure Constructs (`ART_SPELLS`). A one-form spell lists its one form (Major Image). The
   sandbox's table was filled with generated art (worlds/…/assets/summons/), a token for every creature and a
   portrait for every true creature; an object's portrait is its token.
29. **Scale by what the thing is** (the user: a familiar Crab as big as a square, the Floating Disk edge to
   edge). The table's art draws at scale 1: the books' Tiny beasts carry a texture scale of 2 to fill their
   ring, and turning the ring off kept the 2 (`artChanges`). A thing smaller than its square draws so
   (`SUMMON_LOOKS` `scale`: the 3-ft disk at 0.6). A light's stone (Light's Glowing Stone, Continual Flame's
   Everburning Stone) is a Tiny token instead, half a square drawn whole (the user, 2026-10-13: "make the stone tiny").
30. **A Summon spell's creature is named form, then type** (the user: "Tricksy Fey", "Putrid Undead"; `formName`):
   Air Beast, Clay Construct, Fire Dragon (the picked type), Mind Flayer Aberration, Ankylosaur Dinosaur. The
   token and its sheet wear it; the Summon Art keys stay the book's names.
31. **The sweep's fixes** (a full cast of every summon on the sandbox's test mage, each landing screenshotted):
   Phantom Steed lands as "Phantom Steed", not the pack's "Riding Horse" (`SUMMON_ONE_FORM`); a steady light
   look puts out the creature's own flicker (the pack's Light object flames: the Glowing Stone washed white);
   a light's object is one 5-ft square even when the activity offers no size (Continual Flame's was Tiny).

**The third sandbox pass (2026-10-13, the user on the BTB Test Mage, Wizard 5, every summon spell of levels 1 to 3).**
Tried on Tenser's Floating Disk first ("that is much better"), then ruled for every summon:

32. **A summon spell is one button** (supersedes call 16's "stay on the sheet"; the user: "it should just leave cast
   spell button ... their attacks will be done from the summon itself"). A spell with a summon activity the module
   takes hides its other activities on the caster's sheet: Flaming Sphere's ram save, Dancing Lights' Move Lights,
   Minor Illusion's and Silent Image's Study. The placed creature does those from its own sheet. Hidden through
   dnd5e's `Activity#isHidden` (patched once at `init`), which every list the system draws or uses reads
   (`canUse`: the sheet, the activity picker, `Item5e#use`), so the spell's one activity is used straight, no
   picker.
33. **The system's Cast Spell dialog first, then the module's menu** (supersedes call 17 and the ruling of
   2026-10-10 on where the questions are asked, "A: one popup before the card"; the user: "allow the first popup
   dnd5e native, since its everywhere in the game ... then i dont have to reconstruct ritual, what level slot etc").
   The use opens dnd5e's own dialog (the slot, the spend ticks, the Concentration it ends), its Creation section
   hidden and switched off as before. Its answer is taken at `dnd5e.preActivityConsumption`, after the dialog and
   before anything is spent: the use is vetoed there, the menu opens at the level the dialog picked (the forms'
   stats at that level, no "Cast with" row), and Place casts again with the dialog's answer and no dialog. A
   cancelled menu or a cancelled placement still spends nothing; a companion standing still opens its own menu
   before any dialog. A use carrying `{ "fvtt-mod-bythebooks": { toCard: true } }` (a macro, an automation, the
   live suites) skips the window: the cast is spent and its card posts the record asked, answered by the card's
   own "Place the creature". `castOptions` is gone. The menu no longer offers "As a ritual": the dialog's own "consume a
   spell slot" tick, left off, is the ritual cast (the user: "thats ok there is the check box to not consume a
   spell slot"); the menu then opens at the spell's own level.
34. **A light's menu says Light** (Light, Continual Flame; the user: "find a word that works for both chars and
   stones"). The button reads "Light", not "Place". With a token targeted the light goes on it and the object's
   row is unpicked and greyed; picking "On an object" brings the row back, picked (the picker's `onlyWhen`).
35. **Spiritual Weapon's weapon is picked** (the user: "give four choices: mace, maul, sword and scythe. if no art
   override exists, use base game for each pick"). `SUMMON_GUISES`: the menu reads "The weapon" with one row per
   guise, the one stat block in each; the creature lands named "Spiritual Mace" (Maul, Sword, Scythe), wearing
   that name's Summon Art, else the book's own art. The Summon Art window lists the four as Spiritual Weapon's
   creatures (Spiritual Weapon joins `ART_SPELLS`). The sandbox's table holds JB2A's Flaming Yellow mace, maul
   and sword and the Spectral Purple scythe (token the animation, portrait its still).
36. **A summon's attack line reads at the cast** (the user: "fix the language here so its not formula"):
   `@flags.dnd5e.summon.level` and `.mod`, dnd5e's own stamp on the creature, are filled with the cast's
   level and the caster's modifier, so Spiritual Weapon's reads "1d8 + 4" at level 2, "2d8 + 4" at 3.
37. **The Summon Art window finds** (the user: "you need a search for the spells, and they should be arranged
   alphabetically. or think of a better art search function"). The spells are a list on the left in
   alphabetical order with a search that matches a spell's name or any of its creatures' ("owl" finds Find
   Familiar), each with its count of art set. Each creature row has **Find art**: every Actor compendium
   searched by name, words in any order (JB2A's actors included), the token art playing; a pick fills the
   row's token (the actor's token art) and portrait (its image).
38. **Spiritual Weapon lands Medium** (the user: "i know its not the rules, but make the spiritual weapons size med
   (occupying the whole square)"): `SUMMON_GUISES` `size`, the creature's size and its token's footprint, the
   placement's ghost the same size and in the guise's own art (it followed the pointer in the book's art).
39. **Wild Companion is Find Familiar** (the user: "it is the find familiar spell ... it should always disappear on
   a long rest"). `SUMMON_AS`: the feature is read as the spell everywhere a table names it, so it is a companion
   with the pocket, the recall within 30 ft and the companion menu; it rolls its own Initiative; one familiar at a
   time, so a Wild Companion and a Find Familiar replace each other; it wears Find Familiar's Summon Art unless
   it has its own. Placed within 10 ft (the spell's range; the feature's activity carries none). Fey, as the
   pack's activity already allows no other type. It is dismissed when its caster finishes a Long Rest (the
   resting client asks it at `dnd5e.restCompleted`). The pack ships two summon activities, a spell slot and a
   Wild Shape use: the system's dialog opens on the first, and its Consumption gains a second line built as a copy
   of the system's own, "Consume Wild Shape use? (n remaining)", the two mutually exclusive (the user: "another
   line with a mutually exclusive check"); the ticked way is the one Place casts with. Spending nothing until
   placed stands.
40. **Conjure Animals' animals are picked** (the spell: "you choose the spirits' animal form, such as wolves,
   serpents, or birds"): `SUMMON_GUISES`, "The animals", the book's three, landing as "Spectral Wolves" (Serpents,
   Birds) in that name's Summon Art. Summon Beast and Conjure Animals join `ART_SPELLS`; the sandbox carries
   generated art for both (Summon Beast: one natural beast per environment with glowing primal blue runes, the
   user's call; the packs: a spectral group each).
41. **Conjure Animals' pack carries its two emanations** (the user: "the conjure animals token should have an
   emanation with the str save and the damage"). The PHB's Conjured Animals actor ships both as features, so they
   are two `EMANATIONS` feature rows on the summoned token: **Pack Damage**, harmful, 10 ft, a Dexterity save on
   entering or ending a turn within it, once per turn (the pack moving onto a creature is its entry); **Grant
   Save Advantage**, 5 ft, the pack's "Strength Save Advantage" effect on the conjurer alone (a new reach,
   `summoner`: the actor dnd5e's `flags.dnd5e.summon.origin` names). **A summoned creature takes its caster's
   disposition** (every summon's text: "an ally to you and your allies"): the packs ship SECRET, which no
   emanation or targeting reads; a light's object keeps the pack's own.

**The warlock pass (2026-10-13, the user on the BTB Test Warlock, Warlock 5, Vestige Patron, Pact of the Chain).**

42. **The Vestige is a companion like the familiar** (the user: "vestige is modeled best after find familiar ...
   including the pocket dimension"; "vestige has the same ranges as familiar"). Vestige Companion is a `COMPANIONS`
   row: the effect on the warlock ("Vestige: Undead Vestige Companion"), the menu on a second use (put it away, call
   it back within 30 ft, dismiss forever, Summon a new form, which takes the old one's place or waits in the pocket),
   and it first appears within 10 ft (`rangeFt`, a new field: the pack's activity says Self). One at a time
   (`SUMMON_SINGLES`). It acts on the warlock's turn, so it is seated after the warlock, not on its own Initiative.
   The pack's profiles are its three forms, each carrying its own Divine Power bonus action (Healing Touch, Fiendish
   Swap, Cursed Invocation) and Vestige's Strike; dnd5e's own summon bonuses give the warlock-scaled AC, Hit Points,
   attack and damage (measured: Warlock 5, Charisma +4: AC 17, 24 HP, +7, 1d6 + 7). The Celestial form's pack data
   has no creature type, no Pact Bond effect and is Medium where the others are Small: vendor bugs, Errata's.
   Generated art for the three forms (a runed halo round a cracked mask, a burning sigil in smoke, a sigil-etched
   skull), in the Summon Art window under Vestige Companion.
43. **Pact of the Chain's forms are a tab of the familiar's menu** (the user: "i would not bundle it with the list of
   normal familiars, but make it separate (like a tab or something if possible?)"). `SUMMON_EXTRAS`: when a warlock
   holding Pact of the Chain casts Find Familiar, or uses the feature's own cast (a `SUMMON_AS` row: it is Find
   Familiar, no slot), the menu has two tabs, Find Familiar's pool and Pact of the Chain's eight forms, one pick
   across them. An extra form keeps its own creature type (the familiar's Celestial, Fey or Fiend is asked of the
   pool alone; an Imp lands a Fiend). The feature's Expanded Options activity is never a use of its own: used from
   the sheet it opens the feature's menu. The picker gained a `tabs` section kind (`gallery.js`). Generated art
   for seven forms (the Skeleton wears Animate Dead's), in the Summon Art window under Find Familiar. **Every form
   takes the familiar's Celestial, Fey or Fiend** (the user: "shoudn't pact of chain have fey/fiend/etc too?"): the
   type question stands under the tabs and answers for the form picked; the tab carries the forms alone, no rule
   text, each attack line read at the cast.
44. **A summoned creature turns to face where it moves** (the user: "all summons ... need to turn their facing
   when icon is moved"): every landing unlocks the token's rotation; a thing (a light's stone, the Floating Disk)
   keeps its facing.

**The familiar's feat (2026-10-14, Familiar Friend, Arcana Unleashed; the user's go on the plan read off session zero's
owl: greyed boxes, the Errata row, a patch).** Tychon's Find Familiar is the feat's grant: a "(free casting)" forward
activity spending the spell's one use per Long Rest and no slot. Read off the mirror: the module had landed his owl
before the session (the companion effect names a card no longer in the log; the Owl carries dnd5e's summon origin and
Tom's ownership), at 1 HP; the session's cast card is dnd5e's own, ten seconds before an Arcana roll at Advantage. The
calls:

45. **A forward's free cast keeps its cause.** dnd5e spends the forward's item use only when the summon's use carries
   `cause` (`mixin.mjs` `_prepareUsageConfig` / the consumption's linked activity). The replay after the menu dropped it
   (`asked` carried the slot, the ticks and the Concentration), so the free cast was free every time; the standing
   companion's Summon cast fresh, so a new form asked through the free cast spent a slot. Now `cause` rides `asked` into
   the replay (`castUsage`) and the menu's Summon reuses the cause the cast arrived with; a cancelled menu still spends
   nothing. **Where the free cast is**: the spell's other activities are hidden on purpose (call 32: a summon spell is
   one button), and that hid the forward too — Tychon's sheet showed Find Familiar with its 1/1 and no way to the free
   cast. The forward is now a WAY TO PAY on the Cast dialog's Consumption (the Wild Companion precedent, call 39): a line
   "Cast for free — (free casting)? Spend 1 Find Familiar use (1 remaining), no spell slot", ticked by default while a use
   is left, the slot the fallback; ticked, Place casts with the forward as the cause. Measured: `smoke-familiar` §1, §2,
   §8. **Session zero's premise — dnd5e's Allow Summoning off kept the owl
   from placing — is not so**: the module never reads it (call 1), and §8 is the player test user's own free cast with
   it off, the record stamped on their card. Tom's client had lost clicking and targeting that night (the gm-notes); the
   path itself holds. Allow Summoning stays off on prod.
46. **A boon on the caster lands at the landing** (Fortified Familiar) — **as first read; corrected by call 58 (2026-10-14):
   the enchantment does reach the spell through the feat's grant, and the module then stands down.** The pack carries the benefit as a transferred
   enchantment change on the feat, `activities[summon].bonuses.hp = 2 * @details.level`, a key dnd5e applies only from
   an item's OWN effects (`active-effect.mjs` `applyChange`, `item.mjs` `allApplicableEffects`); transferred to the actor
   it does nothing, and Tychon's summon activity reads `bonuses.hp: ""`. `SUMMON_BOONS`: the elect reads the change the
   row names off the caster's feature (`boonFormula`) and lands it as the system's own bonus would, dnd5e's three
   branches (`boonHpPlan`: classes with no hard maximum, an effect on `bonuses.overall`; linked, an effect on `max`;
   unlinked — every familiar — the amount on the maximum and the current), on top of the profile's own; the record
   carries `boon` and the landed card says "+N HP (Fortified Familiar)". No amount in the table: the formula is the
   feature's (N1). The row reaches Wild Companion's and Pact of the Chain's familiars through SUMMON_AS, as the text says
   ("when you cast the Find Familiar spell"). An Errata issue names the pack's inert enchantment; no fix there — the rule
   is this module's, and a fix would double it. Measured: §3 (Sorcerer 5: the Owl at 11/11).
47. **Helpful Friend is a buy with two facets** (the user: greyed with the reason, never hidden). `ADVANTAGE_BUYS`
   gained `skills: "proficient"` — a check with a skill the roller is proficient in; a tool, a raw ability check or an
   unproficient skill shows no box (§6) — and `near: { companion, feet }`: the roller's standing companion of that spell,
   read through the owner's marker effect to the card's record (`standingCompanion`, lookup.js; never a scan of the
   log), within the feet of the roller's token (`nearestFeet`). No companion standing: no box. In the pocket, on another
   scene or further away: the box stays, greyed with why (`buyOff`), the pool still shown (§5, §7). The press spends a
   use through the buy's own path and the record names the feat (§4); the Long Rest refills the feat's own pool. A roll
   that skips the dialog meets no box, as Lucky's. The register's verdict of 2026-10-02 ("Helpful Friend is the Help
   action", TEXT) is replaced.

**The Battle Familiar pass (2026-10-14, Arcana Unleashed; the plan `audits/plans/battle-familiar.md`, the spell measured on
the sandbox before the build: dnd5e 6.0.6's `transformInto` on an unlinked token is in place, its `revertOriginalForm` makes a
NEW token and `delete({ replacements })` re-points nothing, its transform plants a Proficiency override with the SOURCE's PB).**
The spell alone (the user: "right now I just want to support the spell"); Warlike Familiar's free cast (the pack ships no
forward and no pool) and Intercept Attack (an `ac` guard) stay WAITS rows. The calls:

48. **Battle Familiar is one at a time and rolls its own Initiative** (`SUMMON_SINGLES`, `SUMMON_OWN_INITIATIVE`; its own text).
   A recast replaces the standing one as it lands.
49. **A standing summon can fall** (`SUMMON_FALLS`): Battle Familiar's creature disappears at 0 Hit Points (`atZero`; the
   companion's road generalised — `fallenSummon`, the card "dropped to 0 HP and disappeared") and when its caster dies
   (`casterDeath`: the `dead` status landing on the caster; 0 Hit Points alone is Dying — the user took the lean). What it
   carried stays where it stood however it goes (`drops`: `standing.baseItems` at the landing, `dropCarried` at the
   dismissal — the Loot Shelf chest, else lost).
50. **The last form is remembered** ("you decide whether you summon the familiar that disappeared or a different one"):
   the profile taken is a flag on the caster's own spell (`lastForm`, summons.js `SUMMON_LAST_FLAG`), its row pre-picked
   and tagged "last time" at the next cast (`lastFormRows`; the conjure's menu and the empower's alike).
51. **The route at the cast** (the user, 2026-10-14; `SUMMON_EMPOWERS`, `empowerRoute`): no Find Familiar companion
   standing, the summon road; the companion **in its pocket**, the cast refused before any slot is spent ("you can't cast
   Battle Familiar while your familiar is in its pocket dimension — call it back first"); the companion **on the table**,
   one question before dnd5e's own Cast dialog — **Empower ⟨name⟩** or **Summon a new one** (the companion dismissed
   forever as the new one lands, `dismisses` on the record). A HOUSE BEND: the text empowers with no choice. The familiar
   of Wild Companion or Pact of the Chain counts (read through SUMMON_AS).
52. **The empower is a transform of the companion's token** (`TRANSFORMS["Battle Familiar"]`, `subject: "companion"`;
   summons.js stamps a `transform` record on the cast card, transforms.js lands it — `empowerOne`). dnd5e's Cast dialog
   first (the slot level is the stat block's), then the three form rows at that level (no type, no placement). The elect:
   `transformInto` with the row's `keep` (Hit Points and Hit Dice, type, biography, senses) and the polymorph preset's
   `effects`, the Temporary Hit Points the form's Hit Points at the cast level (the Brute's 30, +5 a level above 2nd;
   `empowerTempHp`); then the summon activity's own `getChanges` on top with its Hit Point and creature-type branches set
   aside (`empowerUpdates`): the level stamped (Rend's +level, Multiattack's and Talented's half-level), the attack and
   Proficiency matched, the AC bonus (AC 15 at 2nd). **dnd5e's own transform Proficiency override is deleted**: it carries
   the form's PB, blank for a stat block with no CR (measured: PB null). **The familiar keeps its name, its token art and
   its portrait, and stands Medium** (the user: "keep the owl's name and art"; "if I empower Crab, it should still be Crab,
   but make it medium size for rule of cool"): dnd5e names it "Owl (Battle Familiar (Brute))" and wears the form's art
   and portrait (the measure's Owl kept its own only by its wildcard set) — the look read before the transform is put back
   after, the token one square at scale 1 (a Tiny beast's texture is doubled to fill its half square; at a whole square it
   would be twice the size), snapped to its square's origin first so it fills the square it stood in (the user: "move it
   to the center of the square it's in, so when it resizes it doesn't jut out"). The caster's effect **"Battle Familiar:
   Owl"** for the spell's hour is the lever (call
   19's shape, `empowerEffect`): the form effect on the familiar depends on it, so the clock, a hand, a rest or the effect's
   end all revert through one road; **no Temporary Hit Points left** reverts (`noTemp`, the transforms machine's own end);
   Dismiss while empowered ends the spell with no form left to revert (the record `ended` "gone"); **0 Hit Points** is the
   familiar's own fall (it disappears, as Find Familiar says), never a revert. The revert keeps the Hit Points lost and drops
   the Temporary Hit Points (dnd5e's `keep: hp`). The card: "Owl is now a Brute · empowered · 30 Temporary Hit Points", End
   Battle Familiar on it; the end card names why.
53. **The revert's new token is followed** (`repointEmpowered`, measured: Foundry's `delete({ replacements })` re-points no
   combatant): every combatant of the old token takes the new one, the companion's record names it (`repointedLanded`), the
   caster's effect goes as the elect's own (`empowerEnd`). Helpful Friend finds the familiar through the transform and the
   revert alike.
54. **The pocket and the spell never overlap**: "Put it away" is not offered while empowered (`companionMenu` `empowered`;
   `companionAsk` refuses it), the mirror of call 51's refusal.
55. **A use carrying the answer skips the question** (`[MODULE_ID].empower` on the use: a macro, an automation, the live
   suites), as `toCard` skips the menu; a `toCard` use with a companion standing is the menu's Summon (the new form takes
   the old one's place), so a suite can drive the whole life of a familiar.
56. **One companion effect, ever** (the user: "occasionally I see two summon effects active at once", "especially with
   pocketed familiars"). A landing now sweeps every companion effect on the owner that names no standing companion
   (`staleCompanionEffect`): its card gone from the log (a familiar waiting in its pocket outlives its card most easily),
   its record never landed, dismissed or failed, its companion gone, or a stray copy beside the record's own. A dismissal
   in flight is left to end its own. The invariant — one companion effect, one token, one standing record after every
   step (a cast, a new form, the pocket and back, a new form into the pocket, Dismiss, two casts back to back, 0 HP, an
   orphan) — is `smoke-companions`, green 2026-10-14. Two GM clients at once is the other road to a double; its impact
   analysis is the suite's issue #8.
57. **Nothing ticked in the ways to pay casts without a cost** (the user's walk, 2026-10-14: with the free cast spent, the
   slot box could not be unticked — the module re-ticked the system's own line whenever nothing else was). The system's
   "Consume Spell Slot?" is the player's to clear, as in a plain dnd5e cast; the module's lines stay mutually exclusive with
   it and with each other, and the consumption hook already reads an unticked slot as a cast with no slot.
58. **Fortified Familiar is the sheet's own where the grant carried it** (the user's walk, 2026-10-14: a Crab at 33 and a Bat at
   31 Hit Points, +30 each). Call 46 read the pack's enchantment as inert, off the stored `bonuses.hp: ""`; the PREPARED
   activity tells another story: dnd5e's feat grant copies the feat's enchantment effect onto the granted spell
   (`flags.dnd5e.advancementOrigin` on the copy), where it applies to the spell's own summon activity, so the system's landing
   already adds 2 × level — and the module's boon added the same again. Tychon's sheet carries the enchantment **twice** (the
   Familiar Trainer background's grant ran twice at session zero, 2026-10-14 01:10; one feat was removed, both copies stayed), so
   the sheet's own number is 20 at level 5, and with the module's 10 on top the Crab read 33. Now the landing reads the system's
   own bonus off its changes (`decide/summons.js` `systemHpBonusOf`): where it carries one, the record takes that number
   (`boon.bySystem`, the card says "the sheet's own") and nothing is added; where it carries none (a spell added by hand, the
   suites' lent spell before this), the module lands the feature's change as before. The duplicate enchantment is the sheet's to
   clean (one of the two effects deleted, prod and the sandbox). Errata #792's premise (the enchantment never reaches the
   spell) is wrong by this measurement and should be withdrawn. `smoke-familiar`'s lend now copies the enchantment as the
   grant does; §3 asserts base + 2 × level once, `bySystem`.
59. **An empowered familiar keeps its own token ring** (the user's walk, 2026-10-14: "it puts a ring there that doesn't
   belong"). dnd5e's transform wears the form's prototype token `ring` (`tokenPropsFromSource`); the empower record now
   carries the familiar's ring in its look and the landing puts it back with the art and the scale (`transforms.js`
   `empowerOne`); the revert restores dnd5e's own `previousTokenData`, ring included. §9a asserts it.

| Row | Where | What it does |
| --- | --- | --- |
| The rows | `SUMMON_SINGLES`, `SUMMON_OWN_INITIATIVE`, `SUMMON_FALLS`, `SUMMON_EMPOWERS`, `TRANSFORMS` | one at a time; its own seat; the fall and the gear; the route and the transform row it drives |
| The route | summons.js `dnd5e.preUseActivity` → `askEmpowerQuestion` | refuse, ask, or the summon road; the answer rides the use to `dnd5e.preActivityConsumption` |
| The empower menu | summons.js `openEmpowerMenu` → `stampEmpower` | the forms at the level; a `transform` record `picked` at birth on the cast card, `empower` naming the companion's card |
| The landing | transforms.js `landTransform` → `empowerOne` | `transformInto` with the row's setting, `getChanges` on top, the Proficiency override deleted, the name back, the caster's effect, the form effect dependent on it, the companion's record told |
| The ends | transforms.js `revertForm` → `repointEmpowered`; summons.js `deleteActiveEffect` (`empowerEffect`) → `revertAsked`; `dismissSummon` → `endEmpower` | the revert and the re-point; the lever; the companion's going ends the spell |
| The fall | summons.js `updateActor` → `fallenSummon`; `createActiveEffect` (`dead`) → `casterDeathSummons` | 0 Hit Points and the caster's death |

**Suites:** `smoke-summons` §9 (conjured: the 1-hour effect, its own Initiative, one at a time, the fall at 0 HP with a dagger
carried, the caster marked dead); `smoke-familiar` §9–§13 (empowered in place: AC 15, Str 16, Rend, the Owl's 11 HP and
Celestial kept, 30 temp, PB 3, level 2; Helpful Friend offered while empowered; the temp HP gone reverts to a new token with
the Hit Point lost kept, the seat and the record re-pointed; the caster's effect removed by hand reverts; Dismiss while
empowered). Unit: `decide-summons` (the falls, the last form, the route, the menu while empowered), `decide-transforms` (the
setting, the temp HP, the changes set aside, the re-point). All green on the sandbox 2026-10-14.

**The walk table:**

| Step | What you should see |
| --- | --- |
| Battle Familiar with no familiar | dnd5e's Cast dialog, then the menu "The form": Brute · Flyer · Stalker at the slot's level, Place; the Brute lands as the type picked, "Battle Familiar: Brute" on the caster for an hour; in a started combat it rolls its own Initiative |
| Cast it again | the Brute row tagged "last time" and pre-picked; the new one lands, the first is dismissed, the card "the earlier one is dismissed" |
| The familiar in its pocket, Battle Familiar cast | the warning "call it back first", nothing spent |
| The Owl on the table, Battle Familiar cast | the question "Your familiar Owl is on the table — empower it, or summon a new one in its place?" |
| Empower, the Brute | the Owl's token stays where it is, AC 15, 30 temp HP over its own Hit Points, Rend on its sheet, still "Owl" in its own art; "Battle Familiar: Owl" on the caster's bar, "Battle Familiar — Brute" on the Owl's; the card "Owl is now a Brute · empowered · 30 Temporary Hit Points" |
| Its temp HP to 0 | the Owl reverts (a fresh token where it stood, its lost Hit Points kept), the end card "no Temporary Hit Points left", the caster's effect gone |
| Remove "Battle Familiar: Owl" by hand, or a Short Rest | the Owl reverts, the end card "Battle Familiar ended" |
| Dismiss the familiar while empowered | the Owl goes, the caster's effect with it, the card "dismissed" |
| The Owl to 0 HP while empowered | it disappears as a familiar does (no revert), its gear where it stood |

**The familiar's eyes and its name (2026-10-21; the table's item 10, a familiar its owner could not see through, and
the user's ask to name it).**

60. **A summoned creature sees through its token; a thing does not.** Read off dnd5e 6.0.6 and the pack snapshots: every
   creature the packs ship has its prototype token's sight OFF (the Arcane Eye and the Ranger's three Primal Companion
   beasts alone ship it on); dnd5e's sense sync (`senseVisionSync`, on by default; `TokenDocument5e#_applySenseVision`)
   derives a token's range, vision mode and detection modes from the creature's senses but never sets `sight.enabled`; and
   the summon activity's `getTokenData` builds the token off the prototype. So every summon the module landed arrived
   blind — Find Familiar, Find Steed, the Summon spells, Animate Dead, the conjures — and its owner saw nothing through it
   (the table's slot-7 macro was the stopgap). They all land through ONE path (`landSummon`), which now switches sight on
   for a creature and leaves a thing's as the pack ships it (`summonSees`): a creature is a creature type of the book's
   own, or any sense with a range (the Arcane Eye, the Faithful Hound, the Battle Familiar's forms); a thing is the rest —
   an illusion, Mage Hand, Spiritual Weapon, Bigby's Hand, the Floating Disk, the Unseen Servant, the conjures' spirits,
   Invoke Duplicity's duplicate, a light's stone — save the sensor Clairvoyance and Scrying place, the one thing whose
   text lets the caster see through it (call 62). Only the switch is
   the module's: the range and the mode stay dnd5e's (with the sync off, the prototype's own range stands). The sight rides the companion through its
   pocket (one put away blind comes back seeing) and through Battle Familiar's empower and its revert: dnd5e's transform
   and revert both take the world actor's prototype sight, so the empower record carries the familiar's and puts it back
   (`empowerOne`, `repointEmpowered`). A familiar landed before this keeps its sight off until it is summoned again, or
   put away and called back (no sweep: call 62).
61. **The familiar is named by its owner** (the user: "when a familiar is summoned, give a text box offering to change
   the name of the familiar, so people can name their pets. if one is previously named, next summon carries that forward
   and remembered"; and "the prompt ALWAYS appears on every summon, even when a name is remembered"). A `COMPANIONS` row's
   `names` (Find Familiar, so Wild Companion's and Pact of the Chain's familiars too; the Vestige, call 62): the summon menu, still the ONE popup
   (call 2), asks "Its name" every time, a text line under the form and the type (the picker's `text` section kind,
   `gallery.js`), pre-filled with the name the caster last gave it; left blank, the picked creature's own name shows in the
   line as it follows the pick, and it lands so. **One name per caster, not per form:** the spell's text makes a new form
   the same familiar ("you instead cause it to adopt a new eligible form"), so Pip the owl cast again as a cat is Pip the
   cat. Place carries the line on the answer (`placedAnswer` `petName`: control characters gone, spaces folded, at most 60
   characters, null when blank); the elect lands the token and its creature so named (the unlinked token's delta: the
   world actor keeps the book's name), the companion effect "Familiar: Pip (Fey)", the card "Pip — summoned" with the form
   beside it, and keeps the name on the caster through the serializer (`petNames`, `rememberName`; a line left blank forgets
   it). The name is undone by the familiar's own Dismiss with everything else the landing made; the memory is the
   caster's and outlives the familiar, as the last form does (call 50). Never a block: the line as it opened is an answer
   (the remembered name, or the creature's own), cancelling the menu casts nothing as before, and an answer that carries no
   line (a macro's, the live suites' fold) lands the creature's own name and leaves the memory alone.
62. **The user's four answers to the open questions** (the same day, through the coordinator): **the scrying sensor
   sees** — Clairvoyance's and Scrying's Invisible Sensor (one creature, one row) carries `sees` on its `SUMMON_LOOKS` row,
   the one thing whose token is switched on, since both spells' text has the caster see through it; **no sweep** — a
   familiar already standing on a table keeps its sight as it landed (a new summon, or the pocket and back, gives it
   eyes); **the Vestige is named as the familiar is** — `COMPANIONS["Vestige Companion"]` carries `names`, the same line,
   pre-fill and memory, kept per spell beside the familiar's (Pip the familiar and Ash the vestige on one warlock); **no
   rename for a companion already out** — the name is asked at the summon only.

| Row | Where | What it does |
| --- | --- | --- |
| The eyes | decide/summons.js `summonSees`; summons.js `landSummon`, `actCompanion` (the recall); transforms.js `empowerOne`, `repointEmpowered`; registry `SUMMON_LOOKS` `sees` (the Invisible Sensor) | sight on for a creature, and for the sensor, at the landing, the recall, the empower and its revert |
| The name | registry `COMPANIONS` `names`; summons.js `askSummon` (the "Its name" line), `landSummon`, `rememberPetName`; decide/summons.js `petNameOf`, `rememberedName`, `rememberName`; gallery.js the `text` section | asked, landed, remembered |

**Suites:** `smoke-summons` §2, §7, §9 (the Land spirit, the Owl and the Brute land seeing, Darkvision off their senses)
and §11 (Mage Hand lands blind), §12 (Clairvoyance's sensor lands seeing); `smoke-companions` §1 and §3 (the Owl lands
seeing and comes back from the pocket seeing), §10 (Pip: the token, its creature, the effect, the card and the memory; a
new form with the line pre-filled; an answer with no line; the line cleared) and §11 (the Fiendish vestige named Ash, its
memory beside Pip's); `smoke-familiar` §1, §9 and §11 (seeing through the empower and the revert). Unit:
`decide-summons` (`summonSees` and the sensor's row, the name folded into the answer, the memory, the Vestige's own).
All green on the sandbox 2026-10-21 (battery `2026-10-21T14-47-40`: summons 45/45, familiar 31/31, companions 41/41,
the two-GM sections included); the menu's name line itself is the walk's.

**The walk table:**

| Step | What you should see |
| --- | --- |
| Find Familiar, the menu | "Its name" under the creature type: blank, the picked creature's name greyed in it, following the pick |
| Type "Pip", Place | the Owl lands named Pip (its token, its sheet), "Familiar: Pip (Fey)" on the caster, the card "Pip — summoned · Owl · Fey"; the player sees through it in the dark (Darkvision 120 ft) |
| Cast it again (the menu's Summon) | "Its name" pre-filled "Pip"; Place as a Cat: Pip the Cat, in the Owl's square |
| Clear the line, Place | it lands under the creature's own name, and the next menu opens blank |
| Put it away, call it back | it comes back named and seeing |
| Battle Familiar, empower it | still Pip, still seeing; after the revert, the same |
| Mage Hand, Spiritual Weapon, an illusion | they land as before: nothing to see through |
| Clairvoyance (or Scrying) | the sensor lands half seen, and the caster's player sees what it sees |
| Vestige Companion | "Its name" in its menu too, pre-filled with the vestige's own remembered name (never the familiar's) |

## Rests end the short effects (2026-10-12)

**The user's rule, on the sandbox: "long rest should remove anything with concentration, it should also remove
anything with a duration 8 hr or less; short rest should keep concentration, but remove anything 1 hr or less."**
Built in rest-grants.js over `decide/rest-grants.js` `restEnds`, on the resting client at `dnd5e.restCompleted`:

- **A Long Rest** ends Concentration through the system (`endConcentration`, so what depends on it goes too, a
  Concentration summon with it) and deletes every effect on the rester lasting 8 hours or less.
- **A Short Rest** deletes every effect lasting 1 hour or less, and ends Concentration on a spell of 1 hour or
  less (the user, correcting the first build: "you can keep conc thru a short rest if your spell is over an
  hour; duration is duration regardless, and a short rest is always 1 hr").
- **The length is the effect's whole duration**, not what is left: `value` in `units` (a round or a turn 6
  seconds); an `expiry` alone counts as short when it is a combat or turn event, as the rest's own length when
  it is a rest event. An effect with no duration stands: a feature's mark, a companion's effect, a lit torch
  (gear lights have their own Long Rest).
- **A summon standing on its effect** (Mage Hand, Unseen Servant, …) is dismissed when the rest removes it.
- **The rest card says what ended**: "ended: Mage Hand, Bless" under the rest.
- Only the rester's own effects: a spell's effect on another creature ends with that creature's rest, or with
  the caster's Concentration.

## Wild Shape and the polymorph spells (2026-10-11, issue #2)

**Wild Shape, Circle Forms and the polymorph spells, as one machine (`transforms.js` + `decide/transforms.js`, the
`TRANSFORMS` table; the shared gallery is summons' `gallery.js`); DRAFTED in a worktree off the summons branch,
every static gate and the unit suite green, the live suite (`smoke-transforms`, §1–§8) written and NOT RUN.** Ruled
off `prototypes/wild-shape.html` and `prototypes/wild-shape-picker.html` (2026-10-10: the known forms enforced, the
locked pool a count and a link, the right column CR · size · book, the row and the one popup inherited from summons;
earlier the same day: the Monster Manual's copy first, the caster picks and the GM may override, one gallery for
both issues, Improved Circle Forms measured before ruling). Measured on dnd5e 6.0.6 and the six books' packs first
(an offline dump of every transform activity, thirty of them):

- **The activity.** `cr` mode opens the whole compendium browser INSIDE the use (`_finalizeUsage` → `queryActor`,
  before the card exists); the card's Transform button calls `transformInto` on the targeted tokens and is hidden
  from a user without Create Actor or with Allow Transformation off. The presets are right and reused as they are
  (`wildshape`: HP, class, feats, mental scores, languages and type kept, saves and skills merged, the Moon's AC floor
  `(13 + Wis) × sign(moon levels)` and `max(druid, moon × 3)` temp HP; `polymorph`: HP and type kept, the form's HP
  as temp HP). The pack's bands: Wild Shape CR ¼ with `fly` on dnd5e's NEGATIVE movement filter to level 5, CR ½
  to 7, CR 1 and fliers from 8; Circle Forms `floor(druid / 3)` with the same fly rule; Polymorph's cap BLANK (its
  text: the target's CR, else its level); Animal Shapes CR 4 and Tiny to Large; Shapechange `max(level, cr)` over
  twelve types; True Polymorph blank and CR 9 for an object; Boon of Fluid Forms CR 10 over three types; the
  Necklaces and Harkon's Bite a fixed creature each.
- **The 2024 text keeps the Hit Points.** Wild Shape: "a number of hours equal to half your Druid level, or until you
  use Wild Shape again, have the Incapacitated condition, or die" — nothing about 0 HP of a separate pool, no excess
  carried over (that is the 2014 rule the prototype's last scene drew; **dropped**). Polymorph: the form's HP as
  Temporary Hit Points, "the spell ends early on the target if it has no Temporary Hit Points"; Shapechange, Animal
  Shapes, True Polymorph and the boon the same shape.

The calls:

1. **The chooser is switched off, the use is the system's.** `dnd5e.preActivityConsumption` (after the dialog's
   profile select has spoken, before the card) hands the system a sentinel profile id, so `_finalizeUsage` finds no
   profile and opens no browser; the real profile is stashed per use and the record stamped at `postUseActivity`.
   The dialog, the consumption (Wild Shape's uses, Circle Forms' use of them) and the card stay dnd5e's; the card's
   Transform button was already dropped at birth (polish.js). A `form`-mode activity (Arcanist's Bestiary) and an
   unlisted transform stay the system's entirely.
2. **One popup off the card, the ruled row.** The known forms first (each described off its creature: art, AC, HP,
   speeds, attacks, traits; CR · size · book on the right; the last one taken marked), then the pool. With the four
   slots full the pool is a line and a link ("29 more forms in the pool at CR ¼ or lower · locked until a Long
   Rest · show them") whose rows cannot be picked; with a slot open the pool is open and **the pick is learned into
   the slot at the use** (the record carries `learn`; the elect writes the item before it transforms). A row with
   no slots (every spell) sees the whole pool at the rule. "Become the form" / "Transform"; "answer first" when
   nothing is picked. A fixed-form activity (the Necklaces, Harkon's Bite) asks nothing: the record is born picked.
3. **The elect transforms.** `registerResumable("transform")`: the active GM's client claims the picked record,
   reverts a standing form of ours first ("until you use Wild Shape again"), calls `actor.transformInto(source,
   activity.settings)` — the activity's own preset or custom settings, never re-implemented — on the creature(s) the
   record names (the user for a `self` row; the targets snapshot on the card for the spells), and lands a **form
   effect** on what came out: "Wild Shape — Wolf", clocked from the activity's duration (the hours) or a copy of the
   caster's Concentration effect's duration with `dependentOn` pointing at it (the spells), tied to the record. The
   player owns the copy (`transformInto` copies the ownership); nobody needs Create Actor or Allow Transformation.
   No GM online: the card holds and says so.
4. **The form ends when the rules say, and only the elect reverts.** The form effect is the lever: its deletion
   (Revert on the bar's fold, a hand, Concentration's end taking its dependent) reverts through dnd5e's own
   `revertOriginalForm`; its expiry (Foundry's `duration.expired` mark on the GM client) the same; **Incapacitated**
   landing on the creature (`ends: incapacitated`), **0 Hit Points** (`zero`) and **no Temporary Hit Points left**
   (`noTemp`) read off the creature's own updates, each only when the row names it. A **Revert** button on the card
   (the owner, or a GM) asks the elect. Every end stamps `ended` on the record and posts a form-end card naming why.
   Nothing carries excess damage anywhere (the 2024 text).
5. **Known Forms, enforced (RAW).** Four slots as a flag on the Wild Shape item (Circle Forms spends them: `known:
   "Wild Shape"`), the use offers those four, an open slot is filled at the use (call 2), and **the Long Rest offers
   the one swap** through the mastery record's road: the resting owner's card, the popup "You know these forms" (a
   box per known form, the pool at the rule below, one pick per free slot, Keep them a real answer), the answer on
   the card (a player's relayed as `formSwapAnswer`), the elect landing it on the item judged against the list as it
   stands (`restKnownList`), and **the owner acknowledging a confirmation** — "You now know these forms" with OK.
   Nothing on the system side holds a known form; a world without the module loses nothing but the list.
6. **Polymorph on a target: the caster picks, the GM may change it.** The transform activity's use records whoever
   is targeted then, with the cap read off the first target (CR, else level); the elect transforms them with the
   caster's pick. **The GM's override is a second pick off the card after the landing** ("Change the form": the
   creature reverts and takes the new form), not a hold before it — a required GM click before every transform would
   break N4. The Wisdom save stays the spell's own demand on its own card; the module does not tie the two.
7. **No new kind, no new setting.** One table (`TRANSFORMS`, fourteen rows: Wild Shape, Circle Forms, Polymorph,
   Animal Shapes, True Polymorph, Shapechange, Boon of Fluid Forms, Shape-Shifter, the five Necklaces, Harkon's
   Bite), two records (`transform`: a feature publishes `use`, a spell `cast`; `formSwap`: `choice`), the shared
   gallery's right column a parameter (`poolRight` for a CR-mode pool; summons' profile picks keep AC · HP).

| Row | Where | What it does |
| --- | --- | --- |
| The intercept | `dnd5e.preUseActivity` → `dnd5e.preActivityConsumption` | the real profile stashed, the sentinel handed to the system; no browser |
| The record | `dnd5e.postUseActivity` → `transform` flag `asked` (or `picked` for a fixed form) | the band with its cap evaluated, the targets, the known forms, the slots, the last form |
| The popup | `dnd5e.renderChatMessage` → `showFormPopup` | the known forms, the pool (open or locked), the pick folded by `pickedAnswer` |
| The landing | `registerResumable("transform")` → `landTransform` | `transformInto` with the activity's settings; the learned form written; the form effect clocked |
| The ends | `updateActiveEffect` (expired) · `deleteActiveEffect` · `updateActor` (hp, temp) · `createActiveEffect` (Incapacitated) → `revertForm` | `revertOriginalForm`, `ended` on the record, the form-end card |
| Revert / Change | the card's buttons → `revertAsked` / `changeAsked` → the resumable | the elect reverts, or reverts and re-lands the GM's pick |
| The Long Rest | `dnd5e.restCompleted` (long) → `formSwap` card → popup → `answerFormSwap` → `landFormSwap` → the confirmation | one swap or the open slots filled, on the item's flag; acknowledged by the owner |

**Bends, in the register above:** the Polymorph save untied from the transform; Animal Shapes one form per use; the
GM's override after the landing.

**The walk to run** (the sandbox; a Druid 2 built by `fixture-suite` as "BTB Test Druid"): use Wild Shape with four
known forms → the popup with the four rows and the locked line; Become the Wolf → the token is the Wolf, the bar
shows "Wild Shape — Wolf · 1 h" with Revert on its fold, the card "Tamsin is now a Wolf"; Revert on the card → the
form-end card; use again with three known → the pool open, the pick learned, the card saying so; the Wolf to 0 HP →
it reverts on its own; a Long Rest → "You know these forms", the swap, the confirmation with OK; the Sorcerer's
Polymorph transform activity at a targeted Dummy → a Giant Frog, its temp HP to 0 → it reverts.

**The known forms only** (2026-10-13, the user: "wildshape is way too long it should just have the lists not rule
regurgitation. it should only ever show the 1-x known shapes the druid knows. if none are known, the screen should
state so and tell the player to long rest to study their forms"). A row with a known-forms list (Wild Shape) shows
its known forms and nothing else: no pool, no locked line, no rule text (the item's own, a click away on its card).
With none known the window says "You know no forms yet. Finish a Long Rest to study your forms." and offers only
Close; a form is learned at the Long Rest's swap card, never at a use. The pool stays for the polymorph spells and
the GM's change. A Tiny beast's flat damage reads "1 piercing", never "1d0 + 1".

**Wild Shape Art** (2026-10-13, the user: "you'll need another custom art for wildshapes, next the summons custom
art button in settings. keeping the same shape"). A second settings button opens the Summon Art window's twin
(one window made from a spec, summon-art.js): the beasts by CR band on the left, Find art, folder matching, a token
and a portrait per beast (`formArt`, keyed by beast name). The known-form rows wear it, and the form wears it when it
lands: the sheet's portrait and every token of it. The sandbox's table starts from the familiar art (the same beasts
by name); a giant or close variant of an animal reuses that animal's art (the user: "dont make another crab").

## Session zero's combat (2026-10-14)

**The DM's notes from Echoes of Halruaa's session zero (2026-10-13), read against the 2024 rules and built on the user's
go.** Four items; the fourth, Familiar Friend, is *Summons* calls 45–47.

1. **Sleep (2024) is a `REPEAT_SAVES` row with two new facets.** The text: Incapacitated until the end of its next turn,
   "at which point it must repeat the save. If the target fails the second save, the target has the Unconscious condition
   for the duration. The spell ends on a target if it takes damage or someone within 5 feet of it takes an action to
   shake it out." The first save is the cast's; the pack's Sleeping effect (Incapacitated, 1 minute) lands on the
   failure. The row: `count: { saves: 1, fails: 1, press: "unconscious" }` — the turn-end repeat's success ends it, its
   failure locks it (no more asking) and presses Unconscious; **`endsOn: ["damaged"]`** — damage landing on the sleeper
   ends the effect outright, no save, through the cast card's receipt, a settled card saying why; **`lifts: true`** — the
   status the press made (recorded on the effect's count as `pressed`, by whom) goes with the effect however it ends:
   damage, the duration, a hand. Flesh to Stone's Petrified keeps standing (its caveat). The shake-awake is the table's:
   the caveat says so on the card. At the table the repeats were rolled as Wisdom *checks*; the row makes them saves.
   **The sentence's other half is data, not a list**: "Creatures that don't sleep, such as elves, or that have Immunity to
   the Exhaustion condition automatically succeed" — Trance was the `succeeds` row; the Exhaustion immunity is read off
   the sheet's condition immunities against a demand marked `sleep` (`immunitySleepSource`), gated by no list.
2. **Healing up from 0 leaves the creature Prone — native, once dnd5e's Apply Downed is on.** The 2024 Unconscious
   condition: "You have the Incapacitated and Prone conditions … When this condition ends, you remain Prone." dnd5e's
   `unconscious` condition carries `riders: ["prone"]`; a rider is created as its own status effect (`collectRiders`),
   NOT a dependent of the Unconscious, so dnd5e's `updateDowned` (Apply Downed Conditions, `autoApplyDowned`) puts
   Unconscious and Prone on at 0 HP in combat and takes only its own Unconscious off when the Hit Points come back:
   Prone stays, as written. Kartor's case needs the setting at **all** (prod had **none**: nothing was applied at
   0, so nothing could remain). **And out of combat too** (the user, 2026-10-14, after a drop outside the tracker
   applied nothing): dnd5e applies the downed conditions only to a combatant in the active combat; drop-to-one.js now
   applies the system's own mapping (`downedOutcome`, dnd5e's setting governing, nothing at "none") to a creature NOT in
   combat, on the updating client with the system's `autoDowned` flag, so the system's own removal on the heal ends it
   and the Prone rider stays either way.
3. **Going down costs a level of Exhaustion — a SETTING, the one house rule** (the campaign's `house-rules.md`: each
   time a creature is reduced to 0 Hit Points it gains one level, at the drop, not when healed; the sixth is death).
   `Going Down Costs a Level of Exhaustion`, world, off by default: the module plays the book until a table says
   otherwise, and a house rule is the one thing that earns a switch (ARCHITECTURE §8 rule 1 is about machines, not
   rules). The seam is drop-to-one.js's `dnd5e.preApplyDamage`, registered after the holds: a creature held at 1
   (Relentless Endurance, Death Ward, a winning save) pays nothing; the level is written IN THE DAMAGE'S OWN UPDATE
   on the applying client (one write, no race), capped at the platform's 6, which dnd5e reads as Dead. The receipt's
   snapshots carry the Exhaustion either side (`exhaustionChange`), the row says "Exhaustion 0 → 1", and Revert puts the
   level back with the Hit Points (`revertPlan`). Every creature, as the user ruled (2026-10-14): a non-important NPC
   dies at 0 under dnd5e and gains its level all the same, harmlessly.

## Portent widened (2026-10-14)

**Built on `main`, unreleased.** The user's ask off the day's analysis ("widen Portent's bystander offers"), measured first
(`audits/plans/portent-widened.md`: the three widenings, the prototype's noise meter re-run with today's code), the plan's
recommendations taken and the rest left as the 2026-09-29 ruling has it. The suites: `smoke-classes` §41, §52 and §82 amended
(the rest's ask pressed), §126 new.

| Call | Ruling | Why | Date |
| --- | --- | --- | --- |
| **A check — or a save that is no demand's answer — whose roll CARRIES a DC** (dnd5e's `options.target`: an enricher's `[[/check … dc=]]` or `[[/save … dc=]]`, a GM's roll request with a DC, an activity's own check) | judged like a demanded save: the margin gate reads the DC, Portent offers only the faces that turn the verdict, the roll's card states "… → 22 vs DC 15 — **SUCCESS**"; nothing is withheld (no demand to withhold for), the bent total is the line's; a die row on such a check (Cutting Words) is margin-gated the same way (`bystanders.js` `dcOnRoll`) | the DC is on the roll, and it is the test the GM chose to set one on; the cost is nothing measurable (`smoke-classes` §126) | 2026-10-14 |
| **A bare check** (no DC on the roll) | not offered — a check with no DC asks nobody for a stored face; Cutting Words' raw-check shape is unchanged | the exploration-time spam: every check on the scene would ask, and no mute exists out of combat (the plan's W3) | 2026-10-14 |
| **An ordinary hit, a friend's miss** | unchanged: the card's quiet row where a hold already stands, no popup | the meter re-run with today's code: 8–9 Portent popups a fight against 1–3, and the mute a player reaches for costs the crit and the big save (the plan's W2) | 2026-10-14 |
| **The rest's dice are the bearer's to roll** (the user: "way more fun") | the rest card ASKS (`storedAsk`): a popup with one button, Roll, for whoever answers for the creature (the owning player when connected, the GM otherwise — `canAnswerFor`); Roll posts the dice as the bearer's own roll message (the dice land on the table; `storedFor` points at the rest card, `storedRolled` is its line) and writes the chip; the decision timer rolls when it runs out ("(timer)"); a popup closed unpressed leaves a Roll button on the rest card; a rest with chat off rolls at once, in the open; the old faces go at the rest, before the new ones are rolled (`stored-dice.js`) | the roll is the player's moment; the module's clocks already say a mandatory roll rolls when the timer runs out | 2026-10-14 |

**The walk table** (the sandbox, Tychon holding Portent; the GM's seat sees the diviner's popups when Tom is not connected):

| Step | What you should see |
| --- | --- |
| Tychon takes a Long Rest from his sheet | his old Portent chip goes; the rest card says "Portent — Tychon Thorne rolls the dice"; a popup "Portent — the Long Rest" with one button, Roll, and the timer's bar |
| Roll | the 2d20 land on the table as Tychon's own roll, "Portent — the Long Rest's dice"; under it "Portent — 17 and 3 kept"; the effect view's "Portent — 17 · 3"; the popup closes |
| Close the popup without pressing | the rest card keeps a Roll button; the timer (Decision Timer Seconds) rolls when it runs out, "(timer)" on the roll |
| In chat, `[[/check dex dc=15]]`, then Kartor's player (or you with Kartor's token targeted) clicks it and fails | Tychon's popup "Portent — Kartor's check", "N vs DC 15", only the faces that turn it; Answer: the check's card "Portent (Tychon) the stored 17 replaces the d20 (4): 6 → 19 vs DC 15 — SUCCESS", the chip one face lighter |
| The same with `[[/save wis dc=15]]` | the same popup and line on the save's own card; nothing waits on it |
| Kartor rolls a bare Perception check from his sheet and fails | nothing — no DC on the roll, no offer |
| Kartor's ordinary hit, a Grimlock's ordinary hit | nothing of Portent's — unchanged (the 2026-09-29 ruling) |
| A Grimlock's critical hit on Kartor | the popup as before — unchanged |

## The asks widened — Cutting Words' damage half back, Portent on every roll a face turns (2026-10-14)

**Built on `main`, unreleased, on the same day as *Portent widened* above.** The user's rulings, given after a plain-words
account of the three shapes the dice changers take (the rescue, the bystander, the roller's own tick) and of what the
2026-09-29 noise gate had made of Cutting Words' damage half: reachable only on a hit that held for someone else, so a Lore
bard's commonest use of the feature was mostly gone. The user: *"gate it by 'does it make a difference / can it' as we
have. Add back in the damage reduction on a hit"*, with two ways out of the asks — *"until my next turn"* and *"until the
next combat"* — and one ask that is never silenced: *"if a damage reduction can save a person from going down, ALWAYS offer
it and point out 'you can prevent this person from hitting zero HP'"*. For Portent: the diviner's own rolls *"are fine, not
obtrusive"*; on other creatures' rolls *"gate the portent further such that the portent can make a difference: for allies
attacking/saving, if the portent can change a fail to success, ask; for enemies, a success to a fail"*, the same two ways out;
and when a face lands on someone else's roll, *"a popup saying 'so-and-so's Portent bends reality! old roll, new roll,
result'"*. Built to sit inside the machines that exist (the user: *"make this architecturally sound in context of the other
dice changers"*): the damage half is a guard of the DAMAGE HOLD beside Interception, the mutes one chip with a scope, Portent
one table word fewer.

| Call | Ruling | Why | Date |
| --- | --- | --- | --- |
| **Cutting Words' roll half** | as it was: asked when the die can turn the verdict (the margin gate), the popup on the attack hold, the card's "Cutting Words (Corin) −5 — 17 → 12, MISS" | the gate works for a die with a margin | 2026-10-14 |
| **Cutting Words' damage half** ("makes a damage roll … reducing the damage") | ADDED BACK as a guard of the damage hold (`damage-holds.js` `cuttersFor`, Interception's machine): a foe's hit on a creature on the bard's side, the bard within 60 ft of the ATTACKER, its Reaction free and a Bardic Inspiration left — the damage rolled and KNOWN, the hold card "⟨target⟩ is about to take N damage · ⟨bard⟩ may cut", the bard's popup "⟨attacker⟩ hits ⟨target⟩ for N — cut the damage?" with Cut / Pass and the mutes; Cut rolls the Bardic die in the open ("Cutting Words — off ⟨target⟩'s damage"), spends the Reaction and the use, the share lands short by it and the receipt says so. An attack's damage only (a save's share has no attacker's roll to stand beside). **Both halves ask** (the table, 2026-10-14 evening; it replaced a one-ask-per-hit rule from the same morning): a bard asked at the roll who passed is asked again at the damage once it is known; the mutes are the brake | the die always takes something off the damage, and the hit's damage must be known before "can it keep them up" can be judged; the damage hold is where both are known. The one-ask rule went at the table: with a +4 attack on AC 18 every hit sat inside the d8, so the roll half always asked first and the damage half was never seen but through the down guard; a pass at the roll means "not at the roll", since the damage is not yet known | 2026-10-14 |
| **The mutes** — every bystander ask's ways out (Cutting Words on either half, Restore Balance, Guided Strike, Bend Luck, Cosmic Omen, Portent, the Arcana rows) | in a combat two buttons, **Not until my turn** (swept when the bearer's turn begins, `chip-spend.js`) and **Not this combat** (swept with the combat); out of one, **Not until the next combat** (inert once a combat starts, swept at the bearer's first turn). On the popup and on the attack card's row. One chip per feature on the bearer, `bystanderMute { key, combat, until }`, the effect view lists it ("Cutting Words — muted until your next turn"), a newer mute replaces an older, deleting it unmutes (`shared.js` `muteScopesFor`, `muteBystander`, `bystanderMuted`) | the user's two scopes; "my next turn" is the natural unit of "not now", the combat the unit of "not this fight"; out of combat the turn does not exist | 2026-10-14 |
| **The down guard** — a damage reduction that can keep the target ABOVE 0 Hit Points | ALWAYS asked, every mute ignored: the share would drop the target to 0 (temporary Hit Points first, then Hit Points) and the die's best face lands it short of that (`decide/rescue-hit.js` `reductionKeepsUp`). The popup carries **"You can keep ⟨target⟩ from hitting 0 Hit Points."** and offers no mute; the hold card says a Reaction can. Every other reduction is "trivial" in the user's word — the mutes' business | the user: always offer it and say so | 2026-10-14 |
| **Portent on another creature's roll** — a foe's attack or save, a friend's attack or save, a check with a DC | asked on EVERY such roll a face in hand turns: a foe's hit to a miss or its success to a failure, a friend's miss to a hit or its failure to a success (`decide/stored-dice.js` `facesThatTurn`, the want by side — the gate that was), with the two mutes as the brake. The row's `ask: "crit"` dropped (`hold/lookup.js` lists the diviner asked on any attack a face turns; the miss hold already held a friend's miss for it); the attack's damage waits the decision window for the diviner as for any bystander. A bare check still asks nobody (*Portent widened*). The down guard does not reach Portent: at the attack roll the damage is not yet known | the user, with the 2026-09-29 meter in view (8–9 popups a fight against 1–3): the mutes are the brake now, and a Portent face is the rule's "any roll you can see" | 2026-10-14 |
| **The bend banner** — a stored face replaces ANOTHER creature's d20 | every screen flashes **"⟨diviner⟩'s Portent bends reality!"** with the roll before and after and the verdict ("Kartor's attack at the Drill Post: the d20 14 becomes the 3 — 19 → 8 · MISS"; a save or check with a DC: SUCCESS or FAILURE), the resource flash's seat and fade, once per client, a view of the resolved hold or roll flag (`ui.js` `flashBend`, from `hold/continue.js` and `bystanders.js` on the update). The diviner's own rolls get none: the dialog's tick is the quiet road the user kept | the user's ask: the table should see reality bend | 2026-10-14 |
| **The quiet road, retired** | no `quiet` guard rides a hold any more (`hold/lookup.js`, `hold/trigger.js`, `hold/answer.js`); the attack card's bystander row stays for a bystander still asked, carrying the mutes, so a popup closed unanswered can be silenced from the card (`hold/views.js` `appendBystanderRows`) | both quiet riders (Cutting Words' damage half, Portent's ordinary hit) now ask in their own right | 2026-10-14 |

**The walk table** (the sandbox; Corin's Cutting Words, Tychon's Portent):

| Step | What you should see |
| --- | --- |
| A foe hits a friend within 60 ft of the bard, by more than a d8 can turn | nobody asked at the attack; the damage rolls; a hold card "⟨friend⟩ is about to take N damage · ⟨bard⟩ may cut"; the bard's popup "cut the damage?" with Cut, Pass, Not until my turn, Not this combat |
| Cut | the d8 lands in chat "Cutting Words — off ⟨friend⟩'s damage"; the receipt "reduced by N"; a Bardic Inspiration and the Reaction spent; the damage lands short |
| Not until my turn | the bard shows "Cutting Words — muted until your next turn"; the next hit asks nobody; the bard's turn starts and the chip goes |
| A hit whose damage would drop the friend to 0, the bard muted | the popup opens anyway: "You can keep ⟨friend⟩ from hitting 0 Hit Points.", no mute buttons |
| A foe's ordinary hit on a friend that a stored face turns | Tychon's popup "Portent — replace the 14 with the 3", Answer / Pass / the two mutes; Answer: MISS, no damage, and every screen flashes "Tychon Thorne's Portent bends reality! ⟨foe⟩'s attack at ⟨friend⟩: the d20 14 becomes the 3 — 19 → 8 · MISS" |
| A friend's miss a stored 17 turns | the same popup on the miss; Answer: HIT, the damage rolls, the banner |
| A requested check with a DC, out of combat | the popup with one way out, "Not until the next combat"; pressed, Tychon shows "Portent — muted until the next combat" and no check asks him until a combat starts |

**The same evening, from the table walk** (the user on the sandbox, two player seats and a GM seat):

- **The popups as radios** (the user: *"short and to the point for a player to decide in 24 s"*; *"use radio buttons"*; *"default
  to pass"*): the bystander popups carry one row per choice — "Use the 19 — 23 vs AC 14, a HIT" (a stored face), "Cutting
  Words −d8", "Pass just this time" (checked), "Don't ask again till next turn", "Don't ask again this combat" (out of combat
  "… till the next combat") — and one button, **Apply**. The card's title is the verdict ("Kartor missed the Drill Post ·
  12 vs AC 14"); the sentence about stored faces and modifiers is gone (`decide/present.js` `tickRowsHTML` `kind: "radio"`,
  `hold/views.js`, `bystanders.js`, `damage-holds.js`).
- **Dice rolled on a turned miss say so** (the user: the damage can still be rolled from the card and *"it doesn't apply, but
  can the card be made to say it doesn't apply"*): a damage card whose attack ended with every judged target missed carries
  **"Not applied — Portent (Tychon Thorne) turned the hit on Kartor into a miss"** (or the plain miss), the `notApplied` flag
  written where the applier used to drop the dice in silence (`auto-apply.js` `stampNotApplied`, `receipts.js`). A save's
  damage needs none: it lands at the verdict's multiplier with its own receipt line ("saved — half damage", "no damage").
- **Once per turn is the BEARER's turn.** The stamp a spent Portent face carries read `game.combat`, the scene's active
  combat, so an unlinked combat (one with no scene, shown everywhere) stamped a diviner who was not in it and silenced his
  next face; now `storedTurnNow(actor)` reads the bearer's own started combat (`shared.js`). Found by `smoke-classes` §41e
  going red beside the table's Drill Post fight.

The suites: `smoke-classes` §2 and §3 (the damage half at the damage hold; the out-of-combat mute), §6 (the two mutes in a
combat, the turn's sweep), §41g–i (Portent's ordinary hit asks; the banner; the dice rolled after the miss), §127 (the down guard ignores the mute);
`tests/decide-rescue-hit.test.js` (`reductionKeepsUp`, the row's `verb`), `tests/decide-classes-a7.test.js` (the Portent row).

## Rulings the code carried

The code built these as ruled, but RULINGS never recorded them; they lived only in code
comments until the comment pass of 2026-09-27 moved them here. Each belongs under its
feature's own heading when that section is next recut.

### Chips, clocks and the disposition cue

- The disposition cue on every dialog row is the token's ABSOLUTE disposition (as the canvas border draws it), never relative to whoever is rolling; a GM rolling for a monster sees its enemies' friendly tokens as allies, accepted.
- A once-per-turn chit (Cleave, Sneak Attack, clock riders) counts turns only in the attacker's OWN running combat; an actor outside any combat never meets "used this turn".

### Lucky's bought Advantage

- A bought Advantage (Lucky's box) is spent only when the roll goes out with the box ticked AND the pressed mode matches the net; a press against the net buys nothing, a roll with no dialog (shift-click) meets no box and spends nothing, and beside a Disadvantage the tick nets Normal and the use still goes

### Resource notices

- A resource spend flashes a notice only when its pool recovers on a rest or a day (the rhythm gate, no name list), only for player-owned actors, shown to every client; refunds and spell slots never flash.
- The ledger's spend stamp is unconditional — no setting gates it — and is written only at the spend's creation, never recovered later.

### Save demands and their areas

- Save presses deliberately leave out Command (Prone only on Grovel, a choice), Sleep (the Unconscious is a second save), Flesh to Stone (three failures) and Elemental Attunement / Mind Spike (a condition mentioned in passing)
- An area whose data misstates its life (the activity's duration is an effect's clock, or an imported copy lost its concentration flag) — Noxious Miasma, Hypnotic Pattern, and the concentration spells whose area only chooses targets at the cast (Slow, Fear, Confusion, Sleep, Calm Emotions, Faerie Fire) — is spent the moment its last verdict lands; an area that genuinely persists (Grease, Web, Cloudkill) is never listed
- An instantaneous area placed with nobody inside stamps its demand DONE (spent), so the floor sweeps it like a resolved one; only an area not yet placed waits clockless, and a duration area keeps its wait.
- Damage a save does not modulate (`onSave: "full"`, e.g. Web's burn) is never auto-rolled or applied by the demand; the card's own enricher stays for the GM to use when the situation arises.
- A demanded save runs as a popup the player presses (Players Roll Their Own Saves, set to roll automatically, rolls it with no popup); a multi-ability save auto-rolls the FIRST listed ability, and the fold accepts any listed one.
- Dead targets are skipped at the save demand's stamp — dead status, or an NPC at 0 HP — while a dying PC (0 HP, death saves ahead) is still demanded and takes the damage.
- A placed area is the save demand's authority in both directions: a creature inside joins the demand, a pending target outside drops, done verdicts stand; a corpse never joins.
- A spent area leaves the canvas: an instantaneous spell's area at its last consequence, a concentration spell's area when the concentration ends, a Spent Areas-listed spell's area at its last verdict whatever its data says; any other duration area stays for the GM to clear.

### The hit menu

- Sweeping Attack's second creature must be within 5 feet of the original target AND within the attacker's weapon reach (read off the sheet; 5 feet, 10 with Reach), and the popup names the ones out of reach
- Hovering a creature's button in the Sweeping Attack popup pings that token on the map and lights its hover state

### The maneuvers and the rescue window

- A d20 fold's re-offer after a spend keeps the ORIGINAL deadline — one clock resolves the whole moment, and no spend ever extends it.
- A scoped tactical fold (Ambush, Tactical Assessment) armed from the sheet raises a notice whose buttons ARE the checks the scope names (plus Initiative when a combat runs); pressing one rolls that check, and the choice is the acknowledgement.
- A tactical fold's cards (Ambush, Tactical Assessment) wear the maneuver family's eyebrow ("Maneuver — <name>"), not the D20 Fold one.
- In the rescue window (d20 folds + Precision), a spent or withdrawn row stays on screen greyed with its outcome on its face, a live row's button carries only the feature's name, and the die and cost are said in the single rule pane beside the hovered row's quote
- A rescue on a raw ability check (no DC anywhere in dnd5e) states the arithmetic and says "ask your DM whether that lands" instead of a verdict, and the offer stands until a human passes; an initiative rescue states just the number
- The rescue window's one button that spends nothing reads **Accept the roll**, never "Pass" (the user, 2026-10-14: a pass could mean passing on the roll itself); its action is still `pass`, and it answers every source
- Precision Attack is offered only when the attack hit none of its targets; a mixed hit-and-miss swing gets no offer, since one damage roll serves every target
- When Precision Attack turns a miss into a hit after Graze already paid on the miss, the card announces the conflict and nothing is unwound

### The reaction hold

- An `ac`-kind reaction whose effect already stands on the defender is not offered again on the attack trigger (an AC bonus does not stack); a `damage` reaction and the spell/negate trigger keep asking.

### The table's small defaults

- A drunk healing potion with no target defaults to the drinker; a real target always wins (a DEFAULT, never a force), decided structurally (consumable + `heal` + `creature` + no template), with no setting.
- The roll/usage dialog's target block is display-only (no untarget checkbox, since every machine reads the message snapshot), carries no setting, and shows each row's disposition as neutral information — never an alarm flag, because many spells legitimately aim at allies.

### What a table leaves out, or narrows

- Brutal Strike, Hand of Harm, Eldritch Smite, Lifedrinker's heal and Foe Slayer are deliberately NOT clock riders — each is a choice the sheet does not record or a judgment the module cannot make (Hunter's Prey joined in A1: the option is asked once — *The PHB classes — A1*)
- A rebuke spell answers at the lowest slot the sheet holds — there is no slot picker inside a Reaction's window; a player who wants to upcast casts from the sheet
- Twinned Spell is not offered on Animate Dead, Create Undead, Cordon of Arrows or Tasha's Mind Whip — their growing count is a corpse or an arrow, not a target (RULINGS names only Magic Missile, Scorching Ray and Jump)
- The unarmed-dice swap leaves a strike that already rolls a die (a Monk's Martial Arts) alone — "can … instead" makes that choice the table's
- The Poisoner's coating save uses the ability the feat's own Ability Score Improvement assigned, else the higher modifier of the abilities the pack offers (the first on a tie).

### The hit's sequence

- On a hit, nothing but the damage happens until the damage lands; then the mastery rider resolves; only then does any other hit offer (Shield Master's bash, for one) leave its queue for a popup, and its clock starts at that moment.

### Metamagic's windows

- A fold's offer window (Seeking, Empowered) closes at the click, not at the verdict; the dice may land for seconds after.
- A metamagic row's sub-controls (Heightened's target, Transmuted's damage type) are inert until that row is ticked.
- A reroll that patches a roll in place (Empowered, Seeking) rides a created roll message, so Dice So Nice animates the fresh dice.
