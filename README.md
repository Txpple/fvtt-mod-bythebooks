# Open Roll 5e: By the Books

[![verify](https://github.com/Txpple/fvtt-mod-bythebooks/actions/workflows/verify.yml/badge.svg)](https://github.com/Txpple/fvtt-mod-bythebooks/actions/workflows/verify.yml)
[![release](https://github.com/Txpple/fvtt-mod-bythebooks/actions/workflows/release.yml/badge.svg)](https://github.com/Txpple/fvtt-mod-bythebooks/actions/workflows/release.yml)

*The 2024 rules, played from the sheet; every automatic step with a receipt and a revert; offered,
never enforced.*

A Foundry VTT module for the dnd5e system that plays the D&D 2024 rules from the character sheet.
A player who does not know a rule still gets it, as written, with a receipt. A rule belongs here
when three things hold: it comes from one of the six books, it rides a use or an effect from the
sheet, and it lands with a receipt and a revert, with chat cards and popups as the only interface.
The fight is where that shows most (an attack that hits rolls and applies its damage, a save spell
rolls for everyone, a reaction that could change the outcome gets a popup with a timer), but it is
not the boundary: rest grants, token senses, token sizes and the Light cantrip are rules from the
sheet too. It exists to help new players keep track of the rule details of 5e and to take routine
steps off experienced players. It is one module with no dependencies beyond the system, and it
pairs with Open Roll 5e: Errata: Errata is where the book is wrong, By the Books is where the book
is right.

**Formerly Battle Flow.** Until 2.17.0 this module was *Open Roll 5e: Battle Flow*
(`fvtt-mod-battleflow`); 3.0.0 is the same module under the name that says what it is, and nothing
it does changed. Foundry cannot rename a package in place, so a world on 2.x installs By the Books
from the manifest URL below, then in *Manage Modules* enables By the Books **and** disables Battle
Flow in the same pass, saves and reloads. The active GM's first load moves the settings, standing
effects and other data to the new name and reports what moved. If both are left enabled, By the
Books does nothing and shows the GM a permanent warning, since two copies would apply damage twice. Old chat cards keep working. The public hooks are `bythebooks.*`; 3.0.x also
fired them under their old `battleflow.*` names, and 3.1.0 stopped, so a macro or module listening
for `battleflow.*` should listen for `bythebooks.*` instead.

## Status

**Usable now, and in use at our own table.** Every book is built; 3.0.0 is the rename, and the
walks, playing each rule at the table, are what remains.

| Built | Next |
| --- | --- |
| The combat chain: hit, damage, apply, reactions, saves, concentration, auras, cover | The walks: each built rule played at the table, book by book |
| The Player's Handbook: every species, feat, fighting style, class and subclass feature, and spell with a rule to play | The rows that wait for a first customer (the rare shapes no table has needed yet) |
| The Dungeon Master's Guide: the crit riders and the enchanted weapons | Summons and Wild Shape ([#1](https://github.com/Txpple/fvtt-mod-bythebooks/issues/1), [#2](https://github.com/Txpple/fvtt-mod-bythebooks/issues/2)) |
| The Monster Manual: Magic Resistance, Undead Fortitude, Regeneration, the auras, the reactions | The epic boons |
| Heroes of Faerûn, Arcana Unleashed, Ravenloft: The Horrors Within | |
| Thirteen settings (ten for the world, one of them a house rule off by default, three per player) and the Summon Art window; every feature always on | |

Nothing is finished until it has been played. What is in works; what is not in yet is simply left
to the table, the way vanilla dnd5e does.

## How it works

- **Zero dependencies, no patching.** Public hooks and document writes only. The chat log is the
  state: every client reads the same one, so there is nothing in memory to fall out of sync and
  a reload loses nothing.
- **Canon only.** Every number, die and DC is read from the content the compendia ship. The
  module never stores an amount and never homebrews. When content is wrong, fix the content.
- **Automate outcomes, never decisions.** If the rules settle it, the module does it. If a
  person gets a say, a person is asked, with a default and a clock.
- **The system stays underneath.** The card buttons the module takes over are hidden so there
  is one path; the system's damage tray, refund and revert stay.
- **Combat Plus and FX Studio are separate modules on purpose.** By the Books plays the rules;
  Combat Plus does the chores around the fight and FX Studio plays the pictures. Each detects the others
  and none requires another, so a dnd5e update can never take all three down.
- **Dead is one rule across the family.** dnd5e, By the Books and Combat Plus each write the Dead
  status at 0 Hit Points under their own settings; who writes what, and the settings that agree with
  the book, are written once in the suite:
  [contracts/dead.md](https://github.com/Txpple/fvtt-suite-openroll5e/blob/main/contracts/dead.md).

## Installation

Paste the manifest URL into Foundry's *Install Module* dialog:

```
https://github.com/Txpple/fvtt-mod-bythebooks/releases/latest/download/module.json
```

- Foundry VTT 14.
- dnd5e 6.x (2024 rules). v1.42.0 is the last release for dnd5e 5.3.x.
- No other modules. No libWrapper, no socketlib, no DAE.
- The free 2024 rules that ship with dnd5e are enough. The premium Player's Handbook, Dungeon
  Master's Guide and Monster Manual unlock everything the free rules leave out; Heroes of Faerûn,
  Arcana Unleashed and Ravenloft: The Horrors Within are read when installed.
- A GM must be logged in. The GM's client is the one that applies damage and effects.

## What it does

- **Attacks resolve.** A hit rolls damage and applies it through the system's own resistance
  math. A miss rolls nothing. Every application is stamped on the card with a revert button.
- **Reactions get a window.** Shield, Uncanny Dodge, Parry, Warding Flare and other listed
  reactions pause the chain and ask the player. The popup shows the rule from the book and a
  timer. No answer means the default happens and the fight moves on.
- **Saves happen at once.** A save spell rolls for every target on the owning player's client,
  half damage on a success, and the buzzer rolls for anyone who walks away. A spell that lets the
  target repeat the save (Hold Person, Tasha's Hideous Laughter, Slow, Fear, Flesh to Stone and
  their kin) asks again at the end of its turn, or when it takes damage, and ends the effect on a
  success with a line on the card.
- **Death saves roll themselves.** A player character at 0 Hit Points is asked for its Death Saving Throw at the
  start of each of its turns: a card for the table and the system's own roll dialog for the player, the timer
  rolling for anyone away. The roll is the sheet's, so the tally, the 1 Hit Point on a natural 20 and Dead at the
  third failure are dnd5e's own; the third success marks the character Stable (dnd5e's status, which it never
  applies itself), damage at 0 Hit Points is a failure (two from a Critical Hit, death when it meets the maximum),
  and every screen hears a 1, a 20, Stable and death. Combat Plus's *Auto-Defeated: PCs* must be off: it
  stamps Dead at 0 Hit Points, and a Dead character is asked nothing.
- **Your abilities are already accounted for.** Before a roll, the dialog lists everything the
  module can read that changes it: a condition, a feat, a fighting style, cover, an ally beside
  the target. Riders like Sneak Attack, Hunter's Mark and weapon masteries ride the damage as
  ticked boxes.
- **Weapon Mastery's paperwork lives here.** The sheet's own mastery list stays the truth; the
  module keeps it the right length. A character with fewer chosen kinds than the class allows
  gets the gap filled from equipped weapons when the GM loads (one whisper says what was picked),
  an attack with a kind nobody chose says so on the card and offers to master it while a slot is
  open, a Long Rest offers the one swap the rule allows, and the party sheet's header has the
  GM's view of everyone against their allowance.
- **Summoning works for players.** A summon spell asks everything in one window off its card: the
  form from the book's own profiles (art, speeds, attacks, AC and HP on each row), the spell's own
  question (Summon Dragon's damage type), or the creature from every book's beasts for Find
  Familiar. The player places the creature on the map; the GM's client creates it, gives the
  player ownership, seats it right after the caster in the tracker, and ties it to the spell's
  concentration. No Create Token, no Create Actor, no Allow Summoning setting. Dismiss is a button.
  A feat that reaches the familiar is kept: Familiar Friend's free cast spends its use and no slot,
  its Fortified Familiar Hit Points land on the creature, and its Helpful Friend Advantage is a tick
  in the skill dialog while the familiar stands within 5 feet (greyed, with the reason, when it does not).
  Arcana Unleashed's **Battle Familiar** conjures its Brute, Flyer or Stalker like any summon (its own
  Initiative, one at a time, gone at 0 HP leaving its gear), or, with your Find Familiar on the table,
  asks whether to empower it instead: the familiar keeps its name, art, type and Hit Points, takes the
  stat block at the slot's level with the form's Hit Points as Temporary Hit Points, and reverts when
  those run out, when the hour passes, or when you end the spell from your effects bar.
  **Summon Art** (a button in the module's settings) gives each creature your own token and
  portrait, Find Familiar first; a folder of files named after the creatures fills it in one click.
- **Wild Shape and Polymorph without the compendium browser.** Using Wild Shape opens one popup
  with your four known forms as rows (art, AC, HP, speeds, attacks), the rest of the pool a line
  away; a Druid short of four learns a form at the use, and a Long Rest offers the one swap. The
  GM's client does the transforming with dnd5e's own presets, so no player needs Create Actor.
  The form has a clock on the bar with Revert on it, and ends on its own when the rule says:
  the hours, Incapacitated or 0 Hit Points for Wild Shape, the Temporary Hit Points gone or
  Concentration ended for Polymorph and its kin.
- **Cover is measured for you.** Select your token and hover another: a Cover section at the
  top of its card says No Cover, Half (+2 AC), Three-Quarters (+5 AC) or Total, and what is in
  the way. It uses the 2024 DMG grid method, lines from a corner of your space to the corners of
  the target's, walls and creatures counted. When you attack, the same measure applies to the
  target's AC on its own, and the card says so. Sharpshooter and Spell Sniper take it off.
- **Auras work.** A Paladin's Aura of Protection follows the token; allies get the bonus
  walking in and lose it walking out. Spirit Guardians and friends do the same with their saves,
  and so do the areas you place and drag: Moonbeam, Cloudkill, Cloud of Daggers.
- **Sanctuary and Mirror Image play themselves.** Whoever targets a warded creature saves first,
  and a failed save turns the attack aside before it rolls. A hit on a mirrored creature rolls a
  d6 per duplicate off the token; a 3 or higher and a duplicate takes it.
- **The odd spells too.** Warding Bond hands the caster the same damage. Vampiric Touch heals
  half of what landed. Prismatic Spray rolls its d8 per creature and raises a save per ray. Wall
  of Fire burns on the side you pick, Spike Growth charges for every 5 feet walked through it,
  and Magic Circle and Forcecage say so when a creature crosses their line. Every PHB spell is
  accounted for in [the register](audits/spells-register.md).
- **Lights follow the token.** A use whose text sheds light puts it on the token for as long as
  it lasts: the Light cantrip on any token you target (casting it again puts the old one out),
  Produce Flame on your own token (hurling the flame puts it out), an Aasimar's Inner Radiance,
  Corona of Light, Holy Nimbus, Sacred Weapon. Torches and lanterns are a
  switch: using a Candle, Torch, Lamp or Lantern, from the sheet or the hotbar, opens a small popup
  with **Light** and **Put out** (the Hooded Lantern also raises and lowers its hood), and the
  light shines from your token at the book's radius, coloured for its flame: an orange, flickering
  torch, a soft white candle, a warm lamp or lantern that barely moves, each fading out at its edge. One at a time: lighting a second puts the
  first out. To put one out, use the item again, or delete its effect, or press ✕ Revert on its
  card. Nothing burns down and nothing is used up (rule of cool); a Long Rest puts them out.
- **Concentration is kept honest.** A failed check ends the spell. Incapacitated drops it.
- **Everything announces itself.** Spent slots, used reactions, effects landing and expiring, a
  crit against a paralyzed creature. Each is a line on a card so nothing is a mystery.
- **Players can see their buffs.** An effect bar above the hotbar, hover cards on any token, and
  Alt to see everyone's.

## The trade

By the Books is built to be **easy to run**, not to be configured. That is a deliberate trade
against midi-qol.

| | By the Books | midi-qol stack |
| --- | --- | --- |
| Install | one module | midi + DAE + premades + their dependencies |
| Settings | thirteen | hundreds |
| Homebrew hooks, macros, custom flags | none | extensive |
| Coverage | the official 2024 books, growing | nearly everything, if you set it up |
| Surviving a dnd5e update | public hooks only, nothing patched | waits for each module to catch up |

If you want to shape every part of your automation, midi-qol is built for that. If you want to
install one thing and play, this is for you.

**What it will not do, on purpose:** auto-cast reactions, detect opportunity attacks, pick
targets for area spells, run macros, or offer an extension point for homebrew. Those are
judgement calls or platforms. The answer to both is the same: ask a person, or add a row to a
list. The full list and the reasons are in [DESIGN.md §4](DESIGN.md).

## Settings

*Game Settings → Configure Settings → Open Roll 5e: By the Books.*

| Setting | Scope | What it does |
| --- | --- | --- |
| Decision Timer Seconds | world | How long every question waits. 0 waits forever. A required roll rolls itself when time is up; an optional offer passes. |
| Dramatic Beat Before Damage | world | Seconds between the hit and the damage dice. |
| Players Roll Their Own Saves | world | Prompt the owning player, or roll automatically. |
| Concentration Checks Are Public | world | Open, or whispered to the owner and GM. |
| Hold Shows the Math | world | A held reaction shows the attack total against AC, or (rules as written) only that you were hit. |
| Optional Masteries | world | Ask before Slow, Topple, Push and Graze, or take them automatically. |
| Resource Use Notices | world | Flash a notice when a player spends a limited-use ability. |
| Roll Results Players See | world | What the public cards show players: results, AC and DC (the default), results only, nothing, or leave it to dnd5e. Overrides dnd5e's Visibility menu. |
| Bloodied Shows on Every Token | world | The Bloodied marker on enemies too (the default), or friendly tokens only. Overrides dnd5e's Visibility menu. |
| Going Down Costs a Level of Exhaustion | world | A house rule, off by default: a creature dropping to 0 Hit Points from damage gains a level of Exhaustion at the drop, on the damage receipt so Revert takes it back. |
| Roll Your Own Damage | client | Ask before rolling your damage instead of rolling it for you. |
| Effect Bar | client | The buff and debuff strip above the hotbar. |
| Effect Cards on Hover and Alt | client | Effect cards beside any token you point at. |

Every feature is always on. There is no per-feature switch. A table that wants one wants midi.

## Documentation

- [DESIGN.md](DESIGN.md): what the module is for and what it refuses. Start here.
- [RULINGS.md](RULINGS.md): what each feature does, as decided at the table.
- [ARCHITECTURE.md](ARCHITECTURE.md): how the code is shaped and why.
- [NOTES.md](NOTES.md): Foundry and dnd5e facts that cost a debugging session.
- [BACKLOG.md](BACKLOG.md): known and deliberately not scheduled.
- [SWEEP.md](SWEEP.md): the 2024 content sorted by mechanism.

## Development

There is no build step: the module is plain ES modules loaded straight from `scripts/`. Dev
tooling is in [tools/](tools/README.md) and ships in nothing. `npm run verify` runs the static
checks and unit tests in seconds; the live battery runs against a real Foundry world. The
`verify` workflow runs the offline gate on every push, and the `release` workflow builds and
publishes the GitHub release, zip and manifest together, from a `vX.Y.Z` tag.

<!-- openroll5e:family -->
## Part of Open Roll 5e

By the Books is one of the Open Roll 5e modules for Foundry VTT, a suite built for one D&D 5e table and
shared. Each module installs and works on its own and none needs another; together they cover the
table from the fog of war to the loot. The other modules:

- [Open Roll 5e: Autoexplore](https://github.com/Txpple/fvtt-mod-autoexplore): lets a scene start fully explored, so the whole map shows through the fog of war while tokens still need line of sight.
- [Open Roll 5e: Combat Plus](https://github.com/Txpple/fvtt-mod-combatplus): automates the chores of running a fight: combat music, an initiative gate, an out-of-turn movement block, defeated marking at 0 HP and turn alerts.
- [Open Roll 5e: Errata](https://github.com/Txpple/fvtt-mod-errata5e): corrects, in memory, bugs in the premium D&D 2024 books, the dnd5e system and Foundry itself, each fix held until the vendor ships its own.
- [Open Roll 5e: FX Studio](https://github.com/Txpple/fvtt-mod-fxstudio): visual and sound effects for dnd5e, played from what actually happened at the table, with about a thousand stock FX and a window for authoring your own.
- [Open Roll 5e: Loot Shelf](https://github.com/Txpple/fvtt-mod-lootshelf): loot chests and merchant shelves that players can take from, buy from and sell to without owning them, with a receipt for every trade.
- [Open Roll 5e: Open Server](https://github.com/Txpple/fvtt-mod-openserver): for hosted worlds: clears the startup pause so players can play before the GM arrives, and gives any user a landing scene of their own.
- [Open Roll 5e: Party Stash](https://github.com/Txpple/fvtt-mod-partystash): makes a dnd5e Group actor's inventory a working party stash: drags move instead of copying, coin moves through a dialog, and every transfer posts a receipt.
- [Open Roll 5e: Area Sounds](https://github.com/Txpple/fvtt-mod-areasounds): background sound for scenes: random one-shots with silence between them, seamless crossfaded loops, day and night gating, and quiet during combat.
- [Open Roll 5e: Token Art](https://github.com/Txpple/fvtt-mod-tokenart): gives every token the look of its state, ready, in combat or dead, each a file named beside the base art, with nothing to configure.

Three MCP servers for [Claude Code](https://claude.com/claude-code) complete the suite:

- [fvtt-mcp-dnd5e](https://github.com/Txpple/fvtt-mcp-dnd5e): builds D&D 5e content in a live Foundry world from Claude Code: a stat block becomes a complete NPC, a map image a walled and lit scene, an adventure its journals, tables and handouts.
- [fvtt-mcp-imagegen](https://github.com/Txpple/fvtt-mcp-imagegen): makes the art with Google's Gemini image models: icons, tokens, props, portraits and illustrations, token redresses and restyles, battlemap and overland-map repaints, and the illustrated session records, all grounded in what the world already shows.
- [fvtt-mcp-sessionscribe](https://github.com/Txpple/fvtt-mcp-sessionscribe): turns a session's Discord recording and Foundry chat log into its record. Its end-to-end `session-scribe` skill drives the server from the Craig link to a speaker-labelled transcript, a fully illustrated player recap, combat statistics, GM notes and a party snapshot.

Issues are welcome on every repo in the family; pull requests are not accepted, since each is one
author's design for one table, shared because it might suit yours. How they fit together is mapped in [fvtt-suite-openroll5e](https://github.com/Txpple/fvtt-suite-openroll5e).
<!-- /openroll5e:family -->

## License

MIT. See [LICENSE](LICENSE).
