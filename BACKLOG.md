# BACKLOG.md — known, deliberately not scheduled

> **What this file is:** things worth knowing about that **nobody owes anybody**. Each was
> found, understood and parked on purpose, with the reason and the thing that would un-park it.
>
> **What it is NOT:** a to-do list. Nothing here blocks a release, a deploy or a battery. If an
> item becomes owed it leaves this file for a commission the user hands the next session. There
> is no standing handoff file, by user call: a commission is written when there is one and
> retired when it is delivered. **One is open: [HANDOFF.md](HANDOFF.md), the pick-up point after
> the Monster Manual (2026-09-28, late night)** — the state, the unreleased stack, and the user's next
> call (the release, the walks, or Session 0). A closed item leaves too; its record, like every retired
> commission's, is git history.
>
> Three files, three jobs: this file is *not now, and here is why*; [DESIGN.md](DESIGN.md) §8
> is *no, and here is what would change the answer*; [ARCHITECTURE.md](ARCHITECTURE.md) §10 is
> *what was owed and where it went*. Two items here are enforced by tooling and cannot rot in
> place: the layer pins and the coverage pins are checked both ways, so repaying the thing, or
> the platform changing under it, fails the build or the report.

---

## The long-term order (the user's, 2026-09-24)

**Not a commission — the order the next ones come in.** Nothing here starts until the user says
go; a UI-shaped step is ruled off a prototype first. **The frame since 2026-09-29 (the user): build
toward a fully functional release for everything official, book by book — PHB, DMG and Monster Manual
first, then the splat books (Arcana Unleashed, Heroes of Faerûn, Ravenloft). The table no longer
paces the work; the one caveat is that when the table needs something for itself, that jumps the
queue** (DESIGN §3). Play stays the proof (a walk before a release), never the prerequisite.
The frame before it (2026-09-24, kept as history): grow from one table's needs one band ahead.

| # | Step | State |
| --- | --- | --- |
| 1 | **Play the last session on v2.0.8, fix-only until the break.** | ✅ done - v2.1.0 on 2026-09-26 |
| 2 | **Break, day one: a doc recut, not a refactor** — PLAN.md retired, SWEEP turned into Slice A's drawing, NOTES §2 triaged for 6.x. | ✅ done 2026-09-24 (PLAN.md into ARCHITECTURE's appendix, SWEEP §6) |
| 3 | **Slice A: species and origin feats** — sweep items 1, 2, 3 and 5 with real content behind them (SWEEP §6, RULINGS *Slice A*). | ✅ delivered on main 2026-09-24; **walked by hand** species by species and feat by feat 2026-09-25 (RULINGS *The species walk, continued*, *The origin feats*); **the full battery green** 2026-09-26 (four suite bugs fixed, re-run alone). RELEASED as v2.1.0 and on prod 2026-09-26 (with Vendor Fixes v1.1.0); the user's event audit is still theirs. **The table proves it:** nothing in it is done until a character built from it has played — the next campaign's session 1 is the walk |
| 4 | **The feats slice — PHB only** (the user, 2026-09-26: player-facing first, DESIGN N3; "keep the splat books out for now" — Arcana Unleashed and Heroes of Faerûn wait). The 2024 PHB general feats that touch a fight and are not yet in (SWEEP §3 (d): a third known) — Sentinel and Polearm Master (a reaction attack, Riposte's shape), Great Weapon Master's rider, the reroll kinds (items 5 and 6) — measured first, the precedent row named per feat (SWEEP §1), a prototype for anything UI-shaped. | **begun 2026-09-26 with the party's own** (RULINGS *The PHB feats — the first batch*): Great Weapon Master's damage and Heavy Armor Master's block built, WALKED by the user and released as **v2.2.0** (on prod the same day); Shield Master, Hew and Fey-Touched were native already. **The rest SCOPED 2026-09-26** (RULINGS *The PHB feats — the scope*): epic boons out, 19 feats out, 13 to build, 5 kept open. **Groups 1–3 BUILT 2026-09-26** (RULINGS *The PHB feats — groups 1–3*: the damage rules, the range cancellers, the on-hit riders), suites green, **WALKED the same day** (with Poisoner's Poison Coating, a rule of cool; Healer automatic, Elemental Adept's type pick and floor through a reroll — RULINGS *The dice changers*), the full battery green, **RELEASED as v2.3.0** (2026-09-27) and on prod. **Groups 4–6 and Polearm Master** (RULINGS *The PHB feats — groups 4–6*) WALKED and RELEASED as **v2.4.0** (2026-09-27), the fix pass after them as **v2.5.0**. ✅ **The PHB feats scope is done.** |
| 4a | **The refactor and recalibration** (the user, 2026-09-27: "we will push our future slices down in priority so we can level set here a bit"): measured against the peers' repos, then comments, the content shape, machine hygiene and release discipline, in that order. | ✅ **delivered 2026-09-28**, its commission retired (ARCHITECTURE appendix *Decided against*: the before and after). The same day the corpus was measured and drawn book by book ([audits/](audits/README.md)) and the order set off the drawings (RULINGS *The slice order, off the drawings*): spells, then Slice B, then session 0 |
| 4a′ | **The spells slice** — the PHB spells ([audits/drawings/spells.md](audits/drawings/spells.md)): eight rows, the repeating-save kind (Hold Person the customer), three prototypes (the placed area that pulses, Sanctuary, Mirror Image). | **commissioned 2026-09-28** — HANDOFF.md; **all three tiers BUILT the same day** (RULINGS *The spells slice — Tiers 1 and 2* and *Tier 3*: four rows measured native, five rows + the turn-start grant, the repeating save as a kind, the `area` emanation kind, the wards and the duplicates; suites green, pushed), **UNWALKED and unreleased — the walk of all three tiers is deferred by the user**; **the held spells BUILT the same evening** (RULINGS *The spells slice — the held spells*: Warding Bond, Vampiric Touch, Prismatic Spray, Wall of Fire, Spike Growth, Magic Circle and Forcecage partially, Counterspell native by the user's ruling — three tables that are not kinds, vocabulary on two, no kind moved) and **the PHB spell register generated** ([audits/spells-register.md](audits/spells-register.md), `tools/audit-spells-register.mjs`); ✅ **the spells slice is BUILT end to end** — its walk (Tiers 1–4) and its release wait; the DMG register generated after it and the DMG ruled out (RULINGS *The DMG register*); Slice B next (HANDOFF.md) |
| 4b | **Slice B: the GM's side** — the Monster Manual traits the sweep never surveyed (Magic Resistance, Legendary Resistance's neighbours, Regeneration, Undead Fortitude, Relentless) and Arcana Unleashed's 38-monster bestiary. Independent of who the next party is, so it comes before the class walk. **Owns the rest of the kill moment**: the machine is BUILT (2026-09-25, the Orc walk — `drop-to-one.js`, the DROP_TO_ONE table: Relentless Endurance asked, Death Ward automatic). **Redrawn 2026-09-28** ([audits/drawings/monsters.md](audits/drawings/monsters.md)): the 2025 book has no Relentless trait; five shapes — Undead Fortitude and Death Throes on the drop machine, Legendary Resistance on the succeed fold, Magic Resistance on a `vsSpells` save facet, Regeneration on the turn-start grant — then the harmful aura rows and the reaction rows. | **DELIVERED 2026-09-28 (night), all three stages** — the five shapes (RULINGS *The GM's side — the five shapes*): Undead Fortitude's save and Death Throes on the drop machine, Magic Resistance / Greater on the save gate, Avoidance on the new `EVASIONS` table, Regeneration on the turn-start grant; Legendary Resistance ruled NATIVE (no row); the aura rows on the new `turnStart` trigger and the Displacement / Blurred Form bends (RULINGS *The GM's side — the aura rows and the attack bends*); the reaction rows — Toxic Escape, Deflect Missile (ranged), Limited Foresight, Warding Charm, Jinx, Sticky Shield (on a miss), Elemental Absorption and Ink Cloud (types, self), Reactive (RULINGS *The GM's side — the reaction rows*); Fiendish Blood and the WAIT rows in the register. UNWALKED (rapid mode), unreleased; the walk tables are in RULINGS. HANDOFF retired. Arcana Unleashed's bestiary stays out. **The Monster Manual register generated the same night** ([audits/monsters-register.md](audits/monsters-register.md), `tools/audit-monsters-register.mjs`): the 424 rows the scan gave no family read by hand — eleven shapes wait on machines that exist (RULINGS *The Monster Manual register*), nothing new built. **The waiting rows BUILT the same night** (RULINGS *The Monster Manual — the waiting rows built*, six stages, `tools/smoke-monsters.mjs` 15 sections green): 39 rows on existing machines, one new table (`DRAINS`); the register regenerated — what still waits is a kind held for a player customer (the cast-triggered reaction, Redirect Attack, Burst of Ingenuity / Portent, Eye Rays). ✅ **The Monster Manual is a wrap, but for the walk.** The DMG before it was **ruled out** the same night (RULINGS *The DMG register*: the register generated, nothing built — high impact, limited value) |
| 5 | **The PHB classes — the whole book, every band** (the user, 2026-09-29: *"this pass is for all characters"* — no longer one band ahead of a party); [audits/drawings/classes.md](audits/drawings/classes.md) is the map (every class and subclass drawn 2026-09-28). The hit menu's next groups (Brutal Strike, Stunning Strike, Open Hand, Psionic Strike) are in it; Arcana Unleashed's Arcane Shot waits for the splat-book pass. | **PLANNED 2026-09-29, nothing built:** [audits/plans/session-0-classes.md](audits/plans/session-0-classes.md) is the full plan (the summary, the stages A1–D1 with their machines, keys, suites and walk tables, ten questions for the user, the risks), [audits/classes-register.md](audits/classes-register.md) the generated register of all 419 rows (`tools/audit-classes-register.mjs`, the hand verdicts in the drawing's *Register verdicts*), [prototypes/session-0-classes.html](prototypes/session-0-classes.html) the four UI-shaped items to rule off. Q1 ruled (all classes, every band); waits for Q2–Q3 and go |
| 5a | **The DMG — back in scope for the full release** (the user, 2026-09-29; it was ruled out 2026-09-28 as high impact, limited value — RULINGS *The DMG register* and *The full release — the order*). [audits/dmg-register.md](audits/dmg-register.md) holds the 29 WAITS rows and the two measured shapes (`CRIT_RIDERS` by the enchantment on the weapon, the injury-poison `COATINGS`); each is built on its precedent when the DMG's turn comes, after the PHB classes. | after 5 |
| 5b | **The splat books — BEFORE 3.0** (the user, 2026-10-01: *"these will be added prior to 3.0"*; so v3.0.0 = PHB + DMG + MM + the three, pre-walk). Arcana Unleashed, Heroes of Faerûn, Ravenloft: registered book by book the way the PHB, DMG and MM were, then built. | **PREWORK DONE 2026-10-01, nothing built:** [audits/plans/splat-books.md](audits/plans/splat-books.md) (the measured numbers, what fires already, the hazards, the work by shape with precedents, the order, six questions to rule), the evidence in [audits/splat/](audits/splat/) from an OFFLINE scan ([tools/scan-corpus-offline.mjs](tools/scan-corpus-offline.mjs), the sandbox untouched). ⚠ Ravenloft's `Survivor` feat collides with the Fighter's (a live defect, the plan's §4). **RULED 2026-10-01 night (the user): Arcana → Faerûn → Ravenloft, Ravenloft held for a later session; autonomous, rapid mode.** The Survivor collision FIXED first (`FEATURE_TYPES`: a shared name told apart by the feat subtype). **Arcana Unleashed BUILT 2026-10-02** (RULINGS *Arcana Unleashed*; [audits/arcana-register.md](audits/arcana-register.md), the drawing [audits/drawings/splat-arcana.md](audits/drawings/splat-arcana.md)): ~40 rows on tables that exist, seven facets, no kind; the summons-shaped park on #1, the cast-triggered and redirect kinds stay held, 23 rows WAIT their first customer. Arcana RELEASED v2.12.0 and on prod. **Heroes of Faerûn BUILT the same night** (RULINGS *Heroes of Faerûn*; [audits/faerun-register.md](audits/faerun-register.md), [audits/drawings/splat-faerun.md](audits/drawings/splat-faerun.md)): ~35 rows, six facets, no kind; Bloodthirst the Bloodied moment watched; RELEASED v2.13.0 and on prod (2026-10-02, battery 48/48 after two fixture reds re-ran green). **Ravenloft BUILT 2026-10-02 on the user's go** (RULINGS *Ravenloft: The Horrors Within*; [audits/ravenloft-register.md](audits/ravenloft-register.md), [audits/drawings/splat-ravenloft.md](audits/drawings/splat-ravenloft.md)): ~45 rows, one new TABLE (`MISHAPS` — the dark gifts' save on a 1, not a kind), a dozen facets; smoke-splat §11–§17; RELEASED v2.14.0 (GitHub only — between campaigns, no prod; battery 47/48, the red the §32, a dead-victim race fixed 2026-10-07). **The WAITS rows of all three books (23 + 16 + 14) stand for a pass of their own** (the user: *"keep those waits rows hanging, we'll have to go through those"* — the Spellfire rows among them). |
| 6 | **Platform passes stay their own step, never inside a slice** — one per dnd5e minor, one for Foundry 15; the 6.0 pass cost a major version. | standing rule |

An architecture pass was decided against on 2026-09-24 and taken on 2026-09-27, once the
feats were done, and delivered 2026-09-28: ARCHITECTURE's appendix *Decided against*.

## Architecture

### Phase 2's residue (2026-09-27)

- **The membership plumbing.** Every membership reader (`effectEntries()`, `emanationEntries()`…)
  now returns every row of its table, so the `listed` sets and the decide/ functions' `listed`
  parameters are always true. Removing them is a cleanup that touches decide/ signatures and
  their tests; nothing behaves differently until then.
- **The suites' retired keys.** The suites still write retired setting keys, translated in the
  page by `tools/harness.mjs` `retireSettings`. Strip those writes suite by suite, then retire the
  translation.
- **Effects are still found by name.** ActiveEffects carry no identifier: the effect table's 48
  effect-keyed rows and the `effect` fields match the effect's name. The effect's origin item has
  one, a candidate key when a renamed effect bites.
- **A suite's teardown leaves `noCover` on the scenes.** The full battery of 2026-09-28 ended with
  every scene still flagged (verify-settings --fix cleared them): some suite exits without the
  harness teardown. Find it, or clear the flags in the battery's closing sweep.
- **Rule pointers name the Player's Handbook pack.** An item pointer falls back to the system's
  2024 packs by identifier when its `uuid` does not resolve (a table without the PHB module); a
  rules-page pointer reads `CONFIG.DND5E`.


### The two sideways edges (2026-09-05)

The tree is layered and the rule is *depend downward only*. Seven sideways edges were found;
five are repaid. Two remain, deliberately, because the seam is built by the feature that proves
its shape — a shared part written from one caller is a guess, and a wrong shared part is worse
than an honest sideways edge.

| Edge | Waiting for |
| --- | --- |
| `saves → receipts` (`saves/verdict.js`) | `receipts.js` gaining a **second** importer |
| `volleys → reminders` (by design, 2026-09-02) | a **third** surface for the gate's judge `judgeRoll` (the dialog's gate and the volley's aim are two), to prove a spine home |

The pins live in [tools/check-layers.mjs](tools/check-layers.mjs) and `npm run layers` fails on a
pin whose edge has GONE as well as on an edge with no pin. The two surviving import cycles are
permanently closed, not backlog (DESIGN §8).

### Two clock residues (2026-09-03)

"First round" is judged in three edge places — `decide/clock.js` `riderDue`, `sneak.js` for Death
Strike, `reminders.js` for Assassinate — and `bash-offer.js` judges a maneuver's once-per-turn off
a flag stamp rather than a turn chit (`decide/chips.js` `TURN_CHITS`, which every other
once-per-turn reads). Neither is wrong. **Un-parked by** a FOURTH judge of "first round" (the
reader goes to `decide/clock.js` with it), or the next once-per-turn maneuver on the bash offer
(it moves to a turn chit with it).

### The modal sequence (2026-09-09, the user's call: "not a priority now")

A workflow where several windows are answered **in order** and the visual chain waits for the
whole sequence to drain. Today the popup pile is a staircase in rank, then causal order
(ARCHITECTURE §5 law 7), concurrent by design. A modal sequence is a change to law 7, wanted for
some workflows only — so it arrives as an option per moment, never the default. Not this: the
hit's own sequence (the bash offer queued behind the damage and the mastery's decision,
`decide/sequence.js`), decided from one hit's records at the damage chokepoint.

⚠ **The contract the hold must keep, or this becomes unbuildable without a migration:**

| Decision | Why it is load-bearing |
| --- | --- |
| The hold is **refcounted**, never a boolean per subject | a sequence of N windows raises N holds against one subject |
| The hold is keyed by an **opaque subject**, not an activity uuid | a sequence's subject may be a popup key or a message id |
| Release is an **explicit lifecycle call**, never "the card posted" | in a sequence the card posts at step 1 while steps 2..N stand |
| Every decision popup opens through **`openManagedPopup`** (`ui.js`) | the one place that knows when a dialog opens and closes |

⚠ **Where By the Books and FX Studio genuinely disagree, on purpose:** a Hold Timer of 0 is a
clockless ask by explicit setting (§5 law 11), so By the Books raises a clockless hold; FX Studio
bounds every gate at five minutes and plays when a bound expires. At that setting the picture
fires while the question is still on screen. **If a play report says "the animation fired while I
was still choosing", the Hold Timer is the first thing to read.** The default (24 s) never
reaches it. Neither module may import the other; By the Books publishes events and an api
(ARCHITECTURE §7) and never calls FX Studio.

## The PHB feats — parked from the scope (2026-09-26)

Parked from the scope (no precedent row; un-parked by a player taking one): Charger, Grappler's
Punch and Grab, Mounted Combatant's rest, War Caster's Reactive Spell.

## Scoped out for good (2026-10-01)

**The user, 2026-10-01: out entirely, never to be revisited when the backlog is reviewed — only on the user's own explicit
ask.** Not parked, not waiting on a player: a backlog review skips this section.

- **Reaction AC items:** Quarterstaff of the Acrobat (Attack Deflection, +5 AC as a Reaction) and Shield of the Cavalier
  (Protective Field). The pack ships no effect for either.
- **The DMG's two optional rules:** Fight or Flight, Success at a Cost.
- **The held reaction kinds:** the redirect kind (Shield of Missile Attraction, Arrow-Catching Shield's Intercept Attack, the
  MM's Redirect Attack) and the cast-triggered reaction (Rod of Absorption, Staff of the Magi's absorption, Ioun Stone of
  Absorption).

## Features — surveyed, not scheduled

| Item | Shape |
| --- | --- |
| **Giving a potion to another PC** (2026-11-04, Session 03 of Echoes of Halruaa: "how do I transfer the potion to Lysandra?") | Not this module's: the stash's give button was not obvious, and the path is to take from Party Stash, then use the potion with the other PC targeted. Belongs to Party Stash (a visible give action) or the table's own habit. Logged, not built. |
| **Where to roll initiative in the new layout** (2026-11-04, Session 03 of Echoes of Halruaa: Cecil needed two prompts) | Not this module's: the initiative die sits on the combat card under Card Catalogue's sidebar. A first-night cost; revisit if it repeats. Logged, not built. |
| **Summons handled by the module** (2026-10-01, [issue #1](https://github.com/Txpple/fvtt-mod-bythebooks/issues/1)) | dnd5e's summon activity needs Create Token (and Create Actor for a compendium import) on the PLAYER plus the world's Allow Summoning; the Draconic Spirit ships half-finished (Breath Weapon carries all five types, Shared Resistances is five buttons on the spirit's sheet). The proposal: the caster's client asks every question in one popup and places; the active GM's client lands the creature off a flag on the cast card (ARCHITECTURE §3's channel) and grants ownership. The spells register's TEXT/OUT summon rows (30-odd across PHB, DMG, the classes) wait on it. Prototype: [prototypes/summons.html](prototypes/summons.html); the options to rule are in the issue. **Un-parked by the user's ruling off the prototype; all four toggles ruled 2026-10-10 (one popup, rows C, a seat after the caster, the relay for lights); BUILT on `feat/summons` the same night (RULINGS *Summons*), the live suite written and not yet run** |
| **Warlike Familiar** (2026-10-14, Arcana Unleashed; `audits/plans/battle-familiar.md` Phase C, parked by the user: "right now I just want to support the spell") | The feat's two benefits on the familiar: the free cast of Battle Familiar once per Long Rest — the pack ships no forward activity and no uses pool, so the module would build the way to pay (Wild Companion's second Consumption line, a counter on the feat reset at the Long Rest); Intercept Attack — an `ac` guard on the reaction hold (the familiar's Reaction, 5 ft from the familiar to the hit creature, the caster's PB on its AC, offered only when the margin can be closed; the register's old "redirect kind" verdict was wrong on the text). Waits for a player to take the feat. |
| **Wild Shape and polymorph: a form gallery, forms that end** (2026-10-01, [issue #2](https://github.com/Txpple/fvtt-mod-bythebooks/issues/2)) | dnd5e's transform activity needs Create Actor on the player plus Allow Transformation; its chooser is the compendium browser; nothing models Known Forms, the hours, the revert at 0 HP or Polymorph's blank CR cap. The presets (`wildshape`, `polymorph`) are right and stay. The proposal: a gallery filtered to what the rule row allows (pools measured across the six books: 42 → 73 → 95 names), the same GM-client relay, `DROP_TO_ONE` for the revert, the bar for the clock. Prototype: [prototypes/wild-shape.html](prototypes/wild-shape.html); the options to rule are in the issue. **Un-parked by the user's ruling off the prototype** |
| **The epic boons — every book's** (2026-10-01, the user: *"add epic boons to the backlog"*) | The PHB's epic boons were ruled OUT of the feats scope (RULINGS *The PHB feats — the scope*, 2026-09-26); the splat books add 16 more (Heroes of Faerûn 13, Arcana Unleashed 3), measured offline 2026-10-01. Parked, not out: a level 19+ slice after the splat books. Most are rows on tables that exist — Boon of Bloodshed is an `EFFECT_BENDS` source already; Fortune's Favor a save reroll (the C1 fold shape); the Soul Drinker a reaction on a kill; Terror an aura save; the Furious Storm a save bend; Irresistible Offense, Combat Prowess and the PHB's others each a precedent row in SWEEP §1. Erupting Spellpower is cast-triggered (the held kind). Measure the PHB's with the offline reader before the row count is believed. |
| **Whole-chat-log scans on hot paths** (2026-09-28, the repo review) | `demandCards` (every save roll), `holdPendingFor` (every activity use), `answerHoldsFor`, the riposte and bash-offer lookups walk `game.messages.contents`. Correct — a tail misses, one round emits dozens of messages — and constant work that grows with a world's age; nothing at the table has felt it. ARCHITECTURE §4 *Accepted trade-offs*. **Un-parked by** a measured stall on the house world, or a world past a few tens of thousands of messages. |
| **Cover against an area's save** (2026-09-27, measured cover) | The 2024 DMG measures an area's cover from its point of origin, for the Dex save's +2/+5; *Measured cover* (RULINGS) is built for attacks only. The corner-line counter (`decide/cover.js`) takes any rectangle as the origin already. **Un-parked by** a table that wants it. |
| **smoke-metamagic logged "Save consequences failed … reading '_id'" once, in a full battery** (2026-09-27) | 110/111 in the v2.4.0 floor battery (every rule row green; the red was the no-errors row), 111/111 alone. The error names no section and carried no stack — the suite now records each error's top stack frames. **Un-parked by** the next red of it — read the frames. |
| **The PHB's own "Slashed" effect, applied by hand** (2026-09-26, group 3) | The pack ships ONE "Slashed" for Hamstring's speed −10 and the crit's Disadvantage; the module lands "Hamstrung" and "Slashed" apart, but a GM who drags the pack's own effect onto a creature gets the Disadvantage counted too (`EFFECT_BENDS` reads by name). A data slip, not a carve-out; said here so a table that sees it knows why. |
| **The abilities sweep** (surveyed 2026-09-02; SHELVED 2026-09-03: "a longer term project"; un-shelved slice by slice 2026-09-24) | [SWEEP.md](SWEEP.md): the 2024 corpus sorted into the module's eight mechanism families, what each kind would need, a suggested order. Its three questions are ruled (SWEEP §5). Rescanned 2026-09-24; Slice A delivered (SWEEP §6). The next slice is *The long-term order*, above. |
| **Arcana Unleashed — the fifth premium book, installed on both boxes, unread by the module** (2026-09-24) | `dnd-arcana-unleashed` v1.0.1, a 2024-rules expansion on magic: 8 subclasses and 61 features, 37 feats, 33 spells, 69 magic items with a standalone Active Effects pack, a 38-monster bestiary — measured by [tools/probe-premium-module.mjs](tools/probe-premium-module.mjs), pack indexes only (SWEEP §2, NOTES §2). **Nothing the module does today changes:** zero name collisions with a registry key, a feature field or a settings default, and none of the 33 spells shares a name with a PHB spell, so no per-spell list (Twinned's exceptions, Spent Areas, Chosen Areas, Effect Choices, Damage Saves, the volleys) has read it. **Settled by** the corpus rescan, then the per-spell lists read against its spells, then rows — a slice of the sweep. Its `.effects` pack is the first ActiveEffect compendium in the house; the effect readers match effects on ACTORS by name and have never met a compendium effect — measure before a row. |
| **The pack's "Assasinate" (sic) effect row beside the "Assassinate" feature row** (2026-09-02) | The PHB ships the feature's transfer effect misspelled, and `EFFECT_BENDS` carries it under that name; the clock row is keyed by the FEATURE's correct name. If the pack fixes the spelling the effect row's key must follow. |
| **The PHB's Half Speed leaves an NPC's speed at 30 on dnd5e 6.0.0 to 6.0.5** (2026-09-16, `smoke-emanations` §6c) | ✅ **Fixed upstream in dnd5e 6.0.6**: its moved-key table points `movement.speed` straight at `movement.speeds.walk`, and Half Speed takes a 30 ft NPC to 15 with no help (measured 2026-10-08). The effect always landed (the module's part); the one-hop table overwrote the number (NOTES §2, *6.0's moved-key table*). Errata 5e's E-001 covered 6.0.0 to 6.0.5 and is retired (Errata 5e 1.2.0; 1.2.1 requires dnd5e 6.0.6). Nothing in the module writes movement. |
| **The Monster Manual's Adult Green Dragon writes Noxious Miasma's −2 AC against an armor item's field** (2026-09-15) | `system.armor.value` ADD −2, the one base effect in every premium book that writes an item field onto a creature (measured). A remap row was built, proven and REMOVED the same day: one monster's slip is a carve-out. The world record is fixed on prod (`system.attributes.ac.bonus`); a fresh import of the Adult or Ancient Green Dragon brings the slip back. The upstream bug report is the user's call. |
