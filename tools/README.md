# tools/

Everything here is **development tooling**. None of it ships in the module zip.

Suites drive a **live Foundry world** through the sibling MCP repo's headless
browser (`fvtt-mcp-dnd5e/client` — a `file:../fvtt-mcp-dnd5e` dependency: `npm install` once, and it needs that repo's `.env` and a built `dist/`). Read
[NOTES.md §5](../NOTES.md) before running anything — the protocol there is not optional.

**What the live tier needs** (all in the MCP repo's `.env`, none in this repo):

| Variable | What |
| --- | --- |
| `LOCAL_FOUNDRY_DATA`, `LOCAL_WORLD_ID`, `LOCAL_SERVER_URL`, `LOCAL_ADMIN_KEY` | the local Foundry and the world it runs — any world; the suites assume nothing in it |
| `BF_SUITE_USER` / `BF_SUITE_PASSWORD` (or `BTB_SUITE_USER` / `BTB_SUITE_PASSWORD`; `FOUNDRY_SUITE_*` wins over both) | the GM user every suite joins as. The MCP client reads the `BF_` names; `tools/target.mjs` maps `BTB_SUITE_*` onto them, so either works |
| `BTB_HOST` (alias `BF_HOST`) · `BTB_DND5E_DIR` (alias `BF_DND5E_DIR`) | the preset a suite targets (the local sandbox by default) · the installed dnd5e system `check-hook-dispatch` and `check-surfaces` read (else the default Foundry data path) |
| `FOUNDRY_USER` (+ password) | the MCP bridge's GM user (the preflight names it when it blocks) |
| `FOUNDRY_PLAYER_USER` (+ password) | a player-role user: the two-client suites and the player-owned fixtures |
| `FOUNDRY_GM2_USER` / `FOUNDRY_GM2_PASSWORD` (or `BTB_GM2_USER` / `BTB_GM2_PASSWORD`; `FOUNDRY_*` wins) | the `gm2` identity: a second GM user with the **Gamemaster** role (4), for a run that declares it in `GM_CLIENTS` |
| `FOUNDRY_ASSISTANT_USER` / `FOUNDRY_ASSISTANT_PASSWORD` (or `BTB_ASSISTANT_*`; `FOUNDRY_*` wins) | the `assistant` identity: a GM user with the **Assistant GM** role (3), for a run that declares it in `GM_CLIENTS` |

Every `BF_*` name above still works, so an `.env` written before 3.0.0 needs no edit. The three users must exist in the world. Everything else a suite needs, `fixture-suite.mjs` builds from the compendia.
The suite, bridge and player users come down with every prod mirror (`pull-prod-to-local.mjs` copies prod's users over
the sandbox's). The two multi-GM identities exist on the sandbox alone, so **a mirror drops them**: `node
tools/seed-gm-identities.mjs` creates them again, once per mirror, from the `.env`'s names and passwords (`--check`
reports only). Foundry lets a user create users of its own role or below, so a suite identity with the Assistant GM
role creates the Assistant and names the Gamemaster it cannot create; that one is made from a Gamemaster's window.

```bash
node tools/battery.mjs                     # build the fixtures, every suite in order (each captured to a file), tear down
node tools/battery.mjs --keep              # ...and leave the fixtures in the world
node tools/battery.mjs --changed --list    # what this change needs re-run, and why — then drop --list
node tools/fixture-suite.mjs               # once, before any suite run by hand
node tools/smoke-saves.mjs                 # one suite, against the local sandbox (BTB_HOST picks another preset)
node tools/smoke-saves.mjs --list          # its sections, without connecting
node tools/smoke-saves.mjs --section 8     # just §8 (plus anything §8 depends on)
node tools/job.mjs -e "return game.actors.size"   # a one-off look at the world through the harness, no script file
```

**Flags are strict** (`tools/args.mjs`, 2026-10-10, issue #11): every live tool refuses an argument it
does not know, prints its header and exits 2 *before connecting*, and answers `--help`. `node
tools/battery.mjs --help` once started the full battery, because an unknown flag was ignored and the
default is everything.

**Every suite is section-filterable.** `--list` prints the table; `--section 3,5` runs a subset
and stamps its summary **`⚠ PARTIAL RUN`**, so a filtered green can never be mistaken for a
battery green. Setup, fixtures and teardown always run — only assertion blocks are skippable —
and a section that needs another declares it (`DEPENDS` at the head of the file), so asking for
it quietly runs the prerequisite and says so.

## Static — no Foundry, no world, seconds

| Tool | What it asserts |
| --- | --- |
| `check-html.mjs` | a name a player can set never reaches the page as markup: every `${…}` in an HTML template literal in scripts/ that reads a `name`, `img`, `label` (and their `…Name` forms), `flavor` or `alias` goes through `esc` / `attr` / `escapeHTML`. HTML is a literal with a tag, a card's `lines`, a `content:` / `html:` / `card:` value (`card:` is ui.js `postCard`'s content), an `innerHTML =`; a value safe by construction carries a `// html:` comment. |
| `check-rule-folds.mjs` | the book's text reaches a card or a popup only under the rule tick (DESIGN *Cards*): the rule's markup (`data-bf-rule`, the fold, its tick) is written in `decide/present.js` alone; its open quote (`ruleQuote`) is not exported and is drawn only by the fold builders and the rescue pane; a book text is enriched by `rule-text.js` alone. An exception says `// rule-fold: <why>`. `npm run rulefolds`. |
| `check-writers.mjs` | ONE client writes (ARCHITECTURE §3): every world write reachable from a handler on an every-client hook (a document's create / update / delete, the card's render, `ready`, the combat hooks) sits behind a gate that elects a client — `isActiveGM`, `drivesMomentFor`, `keepsMessage`, `isContinuingClient`, `canAnswerFor`, a keeper predicate — dominating the write (an `if`, an `&&`, an early return); a relay's `owns` and a resumable's `drives` are gates themselves. Whole-program over scripts/, following calls and the callbacks a gated helper fires. |
| `check-gm-sites.mjs` | several GM clients (ARCHITECTURE §4 *The flow elect*): every `isGM` read in scripts/ is pinned in `ALLOW` by file, function and kind (`game.user.isGM`, a GATE, or any other, a ROLE read) with its count, its tag and its reason — **presentation** (what a GM screen shows), **own** (a write each GM client makes for itself) or **role**; an untagged site, a moved count, a stale pin, a gate tagged `consequence` fail (a consequence gates on `isActiveGM()`). Beside it, the landing claim: outside core.js a claim field (`applying`, `fallbackApplying`) is only released (`false`) or read through `claimHolds`, never claimed by hand. `--list` prints every site. `npm run gmsites`. |
| `check-clocks.mjs` | a decision clock is armed only through the spine's helpers (ARCHITECTURE §3 *The clocks*, §5 *Timer mechanics*): no `setTimeout` on a deadline outside ui.js; `armDeadline` only from ui.js (`armAskTimer`, and `openMomentPopup`'s buzzer) and the files pinned in `RAW_CLOCKS` with a reason (a stale pin fails); every `armAskTimer` names its `owns` — `electOwns`, `keeperOwns`, `continuingOwns`, `subjectOwns(…)` or a function calling one of core.js's gates. `--list` prints every clock and its owner. `npm run clocks`. |
| `check-change-modes.mjs` | an effect change's kind is read through decide/changes.js `changeType` and written typed, never through Foundry 14's deprecated numeric `mode` (a warning on every read, gone in 16): no `ACTIVE_EFFECT_MODES`, no change literal with `mode`, no `.mode` off a change of a `changes` list. `npm run changemodes`. |
| `check-serializer.mjs` | a read-modify-write of a module flag goes through `queueFlagWrite` (ARCHITECTURE §4 law 2): every raw `setFlag(MODULE_ID, k, …)` outside core.js is a birth stamp (a fresh literal, whatever the function read), or it fails — outright when `k` is also written through the serializer or cannot be read, else unless pinned in `ALLOW` (`file function flag`) as a one-writer flag with its reason (§11 rule 3). A spread of a `readFlag`, of a reader wrapping one, or of a variable or parameter holding one is "built on what was read"; a stale pin fails. `--list` prints every site. `npm run serializer`. |
| `check-harness.mjs` | the live suites wait through the prelude (`tools/prelude.mjs`, `window.__btb`) and nowhere else (ARCHITECTURE §11 *Adding a TEST*): every bare wait (`sleep(…)`, a timeout promise) per battery suite and suite kit against its row in `CEILING`, which only goes down (above it fails; below it fails until the row is lowered to the count; a new suite starts at 0); a suite on the prelude defines no `sleep`, poll, `ok`, `want`, settings snapshot, dice rigging or inline wait loop of its own (the token-render, `canvas.ready` and scene-view loops among them), and every bare wait it keeps carries a `clock:` comment naming the module clock it waits out. The suites not yet on the prelude are listed in `STANDING`, a list that only shrinks. Prints the per-suite table: waits, their literal seconds, the ceiling, the helpers, the `watch` windows. `npm run harness`. |
| `check-popups.mjs` | a pending card row, its popup's show-once latch, its call-back button, the popup and the popup's close are the spine's (ARCHITECTURE §5 *The pending row*, *The popup*): outside ui.js nothing touches `shownMoments` (the latch is `pendingRow`'s `latch`, `forgetShown` releases one), no `momentButton` is labelled "Answer…" (the button is `pendingRow`'s `answer`), every `pendingRow` `arm` reaches `armAskTimer`, nothing reads `livePopups` (a popup closes through `closePopup` and an opener fronts one through `frontPopup`) nothing calls `.close()` on a dialog it was not handed (`this`, a parameter: a render hook's app), and nothing reaches the platform's `DialogV2` (built, or its `confirm` / `prompt` / `wait`) or calls `openManagedPopup`: a popup opens through ui.js `openMomentPopup` (`choicePopup`, `confirmPopup`), whose `onDismiss` and `buzzer` carry what a raw dialog's own close and clock did. A read or a close that stands is pinned in `READS` / `CLOSES` by file and function, with its reason (none stands); a stale pin fails. It prints its counts; `--list` prints every row and pin. `npm run popups`. |
| `check-flag-edges.mjs` | a flag key is read by name only by the unit that owns it; every other file asks a reader the owner exports (ARCHITECTURE §4 *Who reads a record*). Every read of a module flag in every form (`readFlag`, `getFlag`, `flags[MODULE_ID].k`, a `flags.${MODULE_ID}.k` path), constants resolved per file and through imports; a key's owner is every unit that writes it (`hold/` and `saves/` one unit each, tools/moment-writers.mjs's scan), narrowed in `OWNERS` where other machines raise the record through the owner's constructors (`saves`); `OWNERS` also names the file exporting each key's readers and why it sits there. Any other read by name fails unless pinned in `ALLOW` (`file key`) with what it reads and why it stands; a stale pin fails, and a key pinned in three units fails (it gets readers instead). Variable-key and whole-scope reads are counted, not judged. `--list` prints every outside read and the keys no file reads by name. `npm run flagedges`. |
| `check-lookups.mjs` | a uuid, a token and a console line each go through one reader (ARCHITECTURE §7 *The shared readers*): `fromUuid`, `fromUuidSync` and `parseUuid` are called in core.js alone (`resolveUuid`, `resolveUuidAsync`); outside geometry.js (`tokenDocOf`, `tokenOf`, `tokenOnScene`, `tokensOf`) no `getActiveTokens`, no `canvas.tokens.get`, no `find` / `filter` over `canvas.tokens.placeables`, no scene's `tokens.find` and no `x.document ?? x`; a `biome-ignore lint/suspicious/noConsole` suppression only in a file pinned in `CONSOLE` (a leaf that imports nothing). Biome's `noConsole` is an error in scripts/ outside core.js's `log` (biome.json), so the suppression is the only way past it. A site that stands is pinned in `UUIDS` / `TOKENS` by file and function with its reason; a stale pin fails. It prints its counts; `--list` prints every site and pin. `npm run lookups`. |
| `check-cards.mjs` | every card goes out through the spine (ARCHITECTURE §5 *The card*): `ChatMessage.create` only inside ui.js `postCard`, else pinned in `RAW` by file and function with its reason; a `whisper` property only in ui.js; no `game.users.filter(…).map(u => u.id)` and no `[game.user.id]` outside core.js (its sets: `gmIds`, `selfIds`, `selfAndGmIds`, `ownersAndGmIds`); every `postAnswer("<key>", …)` names an envelope a relay registers and posts it, and a `postCard` carrying a registered envelope fails (`respondsTo` aside). A stale pin fails; `--list` prints every site. `npm run cards`. |
| `check-pickers.mjs` | a pick is drawn by one builder and read by one reader, in every file (ARCHITECTURE §5 *The pick*): no `<input type="radio|checkbox">` outside decide/present.js (`pickInputHTML`, and the row builders on it); no `input[name=…]` selector and no `:checked` outside ui.js (`picked`, `pickedAll`, `pickInputs`, `pickInputAt`); a bystander's radios-plus-Apply popup is ui.js `choicePopup`, the pass row's words only in decide/present.js `choiceRows`. In the creature-picker machines (`PICKER_MACHINES`), no popup of their own and no reach into gallery.js's rows or pool (RULINGS *Summons*). `npm run pickers`. |
| `check-hook-order.mjs` | every hook registration goes through the dispatcher (`scripts/dispatch.js`: `Hooks.on` nowhere else), names its own file as its key, has a row in `ORDER` (and no row is stale), returns `false` only on a VETOABLE hook — and the load-bearing pairs (ARCHITECTURE §7) hold in the table. Run it whenever a file or a hook registration is added or removed. |
| `check-hook-dispatch.mjs` | ⚠ every `dnd5e.*` hook this module registers is one dnd5e **actually dispatches** (ARCHITECTURE §10 D10). The set is **generated** from the installed system's own bundle — literal `Hooks.call*` names ∪ its `@memberof hookEvents` JSDoc — committed as `dnd5e-hooks.json` and **pinned to the version `module.json` verifies**. `--regen` re-extracts and prints the diff. ⚠ **Run it after any dnd5e upgrade, and read the diff:** a name that disappeared is a listener that has gone silent. Core (non-dnd5e) hooks are **not** covered and cannot be — measured, see the file header. |
| `check-surfaces.mjs` | ⚠ every HTML anchor this module reads off the PLATFORM's markup lives in ONE map (`scripts/surfaces.js`) — no selector string for a platform element anywhere else — and every dnd5e-authored anchor still appears in the shipped templates and bundle of the version `module.json` verifies, recorded in `dnd5e-surfaces.json` (**generated** by `--regen`, pinned to the version like the hook artifact). The 6.0 pass's posture (NOTES §2 *the 6.0 pass* §3b, 2026-09-15): the card's DATA is the contract and its HTML is not; what HTML is still read is counted and checked at the pin bump. Core's own anchors are listed, not checked. |
| `check-layers.mjs` | ARCHITECTURE §7's dependency rule, mechanical: every edge is downward or pinned in `ALLOW` with a reason, and a pin whose edge has gone FAILS. Since 2026-09-05 it also holds `GROUPS` — a machine that is a directory (`saves/`): edges inside the group are legal, an outside import of any part but `index.js` fails with "import the index". |
| `check-coverage-map.mjs` | the live suites' `COVERS` claims (the coverage map, below), **both ways**: every machine-tier file is claimed by some battery suite; every claim names a machine that exists (a rename fails here — the layer pins' self-expiry); every ORDER suite declares COVERS and every file declaring COVERS is in ORDER (an unrun suite rots); no claim names a spine file ("spine files are covered by the full battery, drop the claim"); every `needs` resolves above its suite. Prints the suite → covers table. **No allowlist**: a machine nothing drives is claimed by the nearest suite with a comment saying so. `npm run coverage`. |
| `check-registry.mjs` | every `S` key is registered and every registration is named in `S`; every registry entry declares a known kind and no amount; every kind list names only kinds from its closed set; the **R4 kind total** and the **source-file count** match their pins. |
| `check-identifiers.mjs` | every content row of the code tables (a key, or the `item` / `feature` / `named` / `effect` / `spell` it names) resolves against `content/identifiers.json`: its name slugs to an identifier the packs carry, or it names an effect they carry. A row naming nothing installed is on its `NOT_CONTENT` list with the reason. `npm run identifiers`. |
| `check-imports.mjs` | every relative import resolves, and every named binding is really exported — including through a dynamic `await import()`. |
| `check-comments.mjs` | every `/**` block sits on a declaration, so an extraction cannot strand a doc. |
| `check-card-reads.mjs` | a card's ITEM or ACTIVITY is read through `lookup.js` `cardItem` / `cardActivity` — never a bare `fromUuid` / `fromUuidSync` / `resolveUuid` / `resolveUuidAsync` of an `activityUuid`, `itemUuid` or `itemUuidOf(…)` (2026-09-22, a PC's potion: dnd5e deletes a used-up item BEFORE its card exists, and only the card's snapshot still has it). A deliberately live read says `// live only: <reason>` on the line above. |
| `check-moments.mjs` | **the moment gate's coverage** (ARCHITECTURE §7 *The moment events*, version 2): every flag key the module writes — every write shape, constants resolved per file and through imports, a flag object held in a variable followed to its literal, a scope assigned whole — is classified in `decide/moments.js` as a RESOLVE (published by the gate) or STATE (with a reason), a write whose key the scan cannot read fails, no row is stale, every world-writing file is pinned to the record its writes resolve into, and the registry's own shape holds. Prints the classification as a table. A new key fails the build until somebody says what it is. |
| `contracts.mjs --check` | **the family's contracts against the code** (below, *The contracts*): `contracts/moment.json` names the version `scripts/events.js` publishes, every word, every record and every companion hook (`publish("…")` in scripts/); `contracts/card-flags.json` names every key `decide/moments.js` classifies, each in its class; every recorded sample sits inside its schema. A key, word or hook the code has and the file lacks fails until `node tools/contracts.mjs --write` lists it. `npm run contracts`. |
| `check-doc-links.mjs` | every cross-reference in the docs and in code comments resolves: a markdown link or a bare `scripts/` · `tools/` · `tests/` · `prototypes/` path to a file that exists; `DOC §n` to a numbered section; `DOC *heading*` to a heading or a bold lead-in in that doc (DESIGN, RULINGS, ARCHITECTURE, NOTES, BACKLOG, SWEEP). Written for the documentation pass of 2026-09-24, when nothing had ever said a reference rotted. A bare `§n` with no doc named is not checked — name the doc. |
| `bump-version.mjs --check` | `module.json`'s `version` and its `download` URL name the same tag. |
| `tsc --noEmit` | ⚠ **real, over the files that opt in with `// @ts-check`**: `scripts/decide/` and the damage chain (`auto-damage.js`, `auto-apply.js`, `hold/`) and the dispatcher. `checkJs` stays false globally; files opt IN, one at a time. Foundry's and dnd5e's globals are declared `any` in `types/foundry.d.ts`: an opted-in file gets its own logic and its calls into the tree checked, the platform left open. |

All of them run inside `npm run verify`, along with biome, knip and the unit tests, all offline,
all in seconds. ⚠ **Do not hand-carry the counts out of here.** The tools print their own; every
number this repo has typed into prose twice has gone stale at least once.

## Live contract checks — read-only, safe beside a session

| Tool | What it asserts |
| --- | --- |
| `check-popup-routing.mjs` | popups route to whoever owns the decision, across **two** clients — asserted on BOTH sides ("the GM got it" only means something beside "and the player did not"), with the diagnostic ledger still printed in full. |

## Smoke suites — drive real chains, MUTATE the world

One per feature area. Every suite restores the settings it touches and deletes its own chat
messages. Disconnect the MCP bridge first, and verify settings after — **`battery.mjs` does the
ordering, the capture and the settings check for you**, which is why it is the front door.

⚠ **A started combat of the table's own is refused by the preflight** (2026-10-14): a hand walk's
combat left running (unlinked, round 26) stamped every receipt (`combatStamp` reads `game.combat`,
whoever is in it) and expired every Reaction chip spent out of combat (Foundry clocks a new effect
to the active combat), and the first battery after it went red in three suites before anything else.
A combat none of the fixtures stand in names itself in the refusal; end or delete it, then re-run.
A fixture combat (a killed run's) is teardown's, not the preflight's.

**The downed leftovers are swept on every suite's connect** (`harness.mjs`, 2026-10-14): the module
applies dnd5e's downed conditions out of combat too, and the Prone rider outlives the heal, as
written — so a fixture one suite dropped and healed stood Prone in the next (a modifier it never
pressed), with Exhaustion from House Rules' going-down rule and death saves from a death-save section.
Every `BTB Test` actor goes back to standing (Prone, Unconscious and Dead off, Exhaustion 0, death
saves 0) before a suite's first section. Pools stay each suite's own; `reset-fixture-state` fills
the shared four, and sweeps every FOREIGN token off the range (no fixture stamp, not a BTB Test
actor: a hand walk's summons, the gear chests a familiar leaves).

`reset-fixture-state` runs before any suite (it sweeps a killed run's linked strays before anything
measures a distance — NOTES §5 *A KILLED battery poisons the next one*), `smoke-bythebooks` is the
first suite (it places the shared victim token), `smoke-hold` immediately after
it, and `smoke-nogm` last (it must find no active GM, and the seed above it re-places the token it
needs). `ORDER` in `coverage-map.mjs` holds the whole order and `battery.mjs --list` prints it;
quote that, never a copy of it here.

**The PHB classes are thirteen suites, one per class** (`smoke-class-barbarian` … `smoke-class-wizard`, and `smoke-class-items` for the DMG's worn items on the same fixtures), each with its own sections (numbered as the classes plan numbers its rows), `COVERS` and connect tag, on one kit (`class-kit.mjs`, Operations below): `battery.mjs --changed` selects the class a change touches, and `--section` runs one row of it.

⚠ **`smoke-saves` §23 (2026-09-05)** puts the auras' effects on the victim BY NAME (Aura of Purity, Circle's Power) and gives the fixture's failed-save effect a status for the run, so the save gate's `saves` facet has a demand to judge; it lists `effect` in Reminder Sources and the two names in Effect Sources for the section and restores both.

⚠ **The three suites of 2026-09-05** — `smoke-shields` (the damage shields: the Cleric warded with Fire Shield / Armor of Agathys, the Ranger with the Cleric's Death Armor, the goblin striking them; §8 is the cast-time CHOICE — Fire Shield cast through the cast slice, the warm-or-chill popup clicked on this page, one shield landing), `smoke-heatmetal` (the damage casts: Heat Metal on the Cleric at the goblin), `smoke-superiority` (the rest of the Battle Master's maneuvers on the built fighter, the Ranger as the willing ally; §9 is Commander's Strike as a NOTICE plus a chip on the Ranger whose own attack carries the die — no driven attack since 2026-09-05; §11 is Tactical Assessment and Ambush ARMED from the sheet, the die folding into the next scoped check with no ask) — each gives its spells or maneuvers to the fixture for the run and removes them after; none needs a fixture step of its own beyond `fixture-suite`.

⚠ **`smoke-hitmenu` drives the built fighter fixture** — `BTB Test Fighter` (a PHB-built Fighter 5; `fixture-d20-folds` makes it a Battle Master with Combat Superiority and its Longsword), with the eight on-hit maneuvers added from the 2024 PHB pack for the run and removed after; the second goblin (`BTB Test Attacker`) stands one square from the victim as the sweep's second creature.

⚠ **`smoke-sneak` and `smoke-clock` drive the BUILT fixtures** — `BTB Test Rogue` (Rogue 14 /
Thief, the whole Cunning Strike option set, Assassinate) and `BTB Test Ranger` (Ranger 5 / Gloom
Stalker) — created from the 2024 PHB pack by `fixture-suite.mjs`, with class items at a level so
the scale values resolve (measured: `tools/probe-rogue-fixture.mjs`). They give the victim a
400-HP pool for the run (why: NOTES §2 *The save machine REFUSES a dead target*). `smoke-saves` §19 is the save gate; its driver finds the system's dialog through the app
registry and By the Books' own fieldset, never by a class or by text — the dialog's target block
names the user's targets, which is not the creature that is asking.

⚠ **`smoke-twoclient` is the one that needs a SECOND client**, and it is where the properties no
solo suite can reach are asserted: the relay's **relayed** half (a player's answer travels as
their own message and the *continuing client* folds it) and D2's **cross-client popup close**
(the GM's buzzer resolves a hold and the player's popup vanishes without anyone touching its
DOM). It connects the player itself; just do not be logged in as the player test account.

⚠ **`smoke-familiar` connects the player test identity too** (§8, like `smoke-twoclient`): the player's own free cast
of Find Familiar with dnd5e's Allow Summoning switched OFF for the section and put back. It lends BTB Test Sorcerer (and the
Mage, for §8) the Arcana Unleashed feat and the PHB spell reshaped as the feat grants it, and removes any copy by name on the
way in and out — a killed run's copy would otherwise be the one the name lookup finds (2026-10-14).

⚠ **`smoke-nogm` is the one that connects NO GM AT ALL** (v1.27.0), and it is the only suite that
can see the flow elect. Before v1.27.0 `isActiveGM()` was the sole gate on the payout chain, so a
GM disconnect stopped By the Books dead with no chip, no card, no popup and **no error** — a failure
the whole suite tree was structurally blind to, because the tree always had a GM. It drives a real
Sap hit from the PLAYER's client and asserts the split: the reminder still posts, the monster is
never written to, the driver is whispered what did not land, and a GM rejoining mid-flight re-pays
nothing. Run it with the bridge disconnected and no GM window; it refuses if it finds an active GM,
since a stray one silently turns it into a weaker copy of `smoke-effects`. It listens to the
player page for the WHOLE run and prints every error it raised WITH ITS STACK (`player page:` lines
in the log, stamped with when they happened) — the 2026-09-04 null-id sighting was never placed
because only the message was kept.

⚠ **A console lead a suite cannot place is a suite defect, not a mystery** (the shields flake,
2026-09-05). `smoke-shields` shows the shape: it keeps every console error's STACK, the page's
uncaught errors and unhandled rejections, records each ActiveEffect delete the page issues with its
caller, and walks an `ActiveEffect "…" does not exist!` id back to the delete that lost the race —
and its shield assertions print which DAMAGE MESSAGE each card claims, which is what exposed an old
card being re-judged. Give a flaking suite those before bisecting sections.

⚠ **A faster platform turns a poll into a lie** (Foundry 14.369 / dnd5e 6.0.6, 2026-10-10, suite
issue #8: three suites red with the module unchanged). Three shapes, one lesson each:
a popup found through `foundry.applications.instances` must be filtered by `app.rendered`
(`ApplicationV2#close` keeps a closing window registered and on the page until its close transition settles, up to 1 s
in a headless page — `smoke-clock` clicked the previous offer's spent Roll
button); a status SEQUENCE is read off the writes through an `updateChatMessage` ledger, never by
polling a flag (`smoke-maneuvers` B4a2 saw `pending` first once the promotion came 65 ms after the
hit); and a suite that drives a roll the module is offering must ANSWER the offer, because the
offer's buzzer rolls anyway when nobody presses Roll (`smoke-nogm` rolled past its damage offer, and
the buzzer's second roll landed after the GM rejoined, looking exactly like a rejoin re-pay).

⚠ **One at a time is enforced, not remembered.** Suites take a pid lockfile in `harness.mjs`: a
second one refuses and names the first; a stale lock (the holder died) is taken over and reported.
Why the sole-GM preflight cannot do this: NOTES §5.

⚠ **A GM-capable seat that joins mid-run is named** (the seat watch, armed after the preflight): a bridge another session opens for one call outranks the suite identity by id, the elect moves to it, and the writes of that window land nowhere; the suite ends with a failing `seat:` line naming who joined and when, so its reds are read as the seat's, not the module's. A battery wants the sandbox to itself for its whole length, every session's bridges included.

⚠ **The preflight checks the package too** (3.0.0): every asserting suite refuses unless By the
Books is active and Battle Flow is not, and names which. `job.mjs --read-only`, the fixture
builders and the probes are exempt and work in either state.

**Several GM clients at once is declared, never assumed.** A script that holds more than one GM-capable client
names the identities beside its `SECTIONS` / `COVERS`: `export const GM_CLIENTS = ["suite", "gm2", "assistant"]`
(the keys of `GM_IDENTITIES` in `target.mjs`; the users are the `.env`'s, table above). The preflight then allows
exactly those users, any number of them connected, and still refuses every other GM-capable user (the bridge, a GM
window) by name; with no declaration it refuses everything but the one client, as it always has. `connectSuite({
identity })` joins the harness's own client as a declared identity, `gmConfig(env, key)` builds another one's
config. The harness reads the declaration from the script's text (a suite runs on import, so it is parsed, never
imported); an undeclared identity or an unknown key refuses the run before anything connects.

**The connect race is measured, not argued: `probe-multi-gm.mjs`** (suite issue #8; the note is
[audits/plans/multi-gm-measurement.md](../audits/plans/multi-gm-measurement.md)). One GM client on, a Find Familiar
record armed on its card, a second GM client connecting, and the record answered at an offset from the moment the first
client hears the second arrive (before it, through the newcomer's load, after it is ready); then what landed per record
(claims by user, tokens, companion effects, moments, cards) and how long both clients held the elect at once and how
long neither did, each page sampling `isActiveGM` every 5 ms. Four orderings by role and id (`--list`): the elect stays
on the client already on, or moves to the newcomer. Fixtures from `fixture-suite.mjs`; teardown per cycle and at the
end; about 11 s a cycle on the sandbox. `--aim=<ms>` fires every cycle at one offset, to sample a narrow window
densely. The summary also counts the cycles where the newcomer claimed before its own `ready` (the stale-snapshot
path ui.js's snapshot guard closes: after it, none). **Two hang-up orderings prove the re-drive**: `hangup-claim`
and `hangup-landing` play the `same-moves` pair (the newcomer becomes the elect), join it with an init script
that stalls its landing forever (at its token's create, or after the token at the companion effect's), answer the
record once it is ready, and close its browser under its page (no `beforeunload`, no teardown) the moment the
first client sees its claim; the first client, the elect again, must find the claim dead and land the record once —
the newcomer's claim then its own, the newcomer's token removed, one token and one companion effect standing. Their
own table; about 13 s a cycle. A probe, not a battery suite: no `COVERS`, not in ORDER.

**The two-GM suite sections: `smoke-companions` §9 and `smoke-summons` §10.** Each declares `GM_CLIENTS =
["suite", "assistant"]` and, after its single-client body, joins the `assistant` identity
([gm-clients.mjs](gm-clients.mjs) `joinGm`: `gmConfig`, the prelude on its page, an init script that counts the
card's moments from the first script) while a summon record (Find Familiar as an Owl; Summon Beast as the Land
spirit) is answered the moment the suite's page hears it connect, then asserts one landing per record: one claim,
one token made and standing, the companion effects expected, no other effect on the caster, one moment over both
pages, no extra card, the second client hung up (`armArrival` / `awaitArrival` / `judgeArrival`, the
**arrival landing**). The Gamemaster beside an Assistant GM waits for the `gm2` user (HANDOFF §7 item 1); each
section names it in its title and a SKIP line.

⚠ **A slow run and a hung run must not look the same** (2026-10-10, issue #12: a harness script
outlived its 400 s watchdog by an hour, and another printed nothing for five minutes). The harness
now prints a heartbeat every 30 s while an `evaluate` is in flight — how long it has run, the world's
message count, and whether the page still answered a concurrent peek within 5 s (a page that does
not answer is the hang). The watchdog names the phase it fired in (`connecting`, `preflight`, `the
run: evaluate #7`, `teardown`), **kills the headless browser and its renderers** (`killChildProcesses`:
Playwright's own exit hook did not), and exits 3; any other exit with the browser still open runs the
same kill, and a `dispose()` that does not settle in 10 s ends the same way. Proven by a script whose
evaluate holds a promise forever: exit 3 at the watchdog, no `chrome-headless-shell` left, the lock
released, `/api/status` back to zero users. **The heartbeat also reports a stage the suite sets**
(`window.__suiteStage`, 2026-10-14): a suite whose whole run is one `evaluate` names its step before
each await group (`stage('§10')`), and a hang then reads "stage §10" instead of "evaluate #8" — how
`smoke-spells`'s 600 s hang was traced to the 2024 Sleep's template placement in a headless page.
`smoke-spells` carries the markers; add them to a suite the moment it hangs.

**One-off jobs** go through `job.mjs` instead of a throwaway script: `-e "<the body of an async
function>"` or a file holding one, run in the GM client's page with `arg` (`--arg '<json>'`) and
`log(...)`, the result printed as JSON, every guard above included. `--read-only` passes the preflight
beside the MCP bridge for a probe that asserts nothing.

**Where a job's seconds go** is measured, not guessed: `probe-timing.mjs` (issue #10) connects,
takes a census (hook counts, document counts, whether the module is on) and times the shapes a job
is made of — compendium reads, one actor, 84 items in one call and one at a time, updates, chat, a
token — then deletes what it made; `--json` appends the row, `--beside --as bridge` joins beside a
running suite with no lock and no preflight. The sandbox's usual cost (2026-10-10, 16 cores, Foundry
14.369, dnd5e 6.0.6): the whole probe in 8–10 s; connect 4–6 s of that; 84 items in one
`createEmbeddedDocuments` under 220 ms; ten single-item creates 0.7–1.0 s (four times the per-item
cost of the batch: batch the writes). Measured the same in every state tried — the module off, a dirty
world (40 combats, 3000 messages), a second GM idle or running a suite, four idle bridge browsers —
so a job that takes minutes is the job's own shape or the machine's state, and the first move is to
run the probe and compare its row with these.

### The battery

| Flag | Effect |
| --- | --- |
| *(none)* | every ORDER entry, in the canonical order, each captured to `dist/battery/<stamp>/` |
| `--changed` | **change-scoped**: the suites the working tree's change selects (`git diff HEAD`, the index, and the untracked files), needs pulled, in canonical order |
| `--changed main` | the same for a branch: everything since it left `main` (`main...HEAD`) plus the working tree |
| `--files scripts/emanations.js …` | the same selector on a list by hand — for checking what a change would run without making it |
| `--from smoke-saves` | resume after a failure, still in order — and pulls what the resumed rows need from above the cut |
| `smoke-hold smoke-bythebooks` | a subset — still run in the canonical order; a suite's `needs` are pulled and named (`smoke-hold` alone runs `smoke-bythebooks` first) |
| `--section 4 smoke-hold` | one suite's sections; only that suite receives `--section`, a pulled need runs whole |
| `--snapshot` | take a world snapshot first, roll it back after (the cure for the crash-launder hazard) |
| `--list` | the order, the needs and the notes, without running anything. With `--changed` / `--files` / names: **the plan**, each row with why it runs (the file that claimed it, the suite that needed it, or the reason for the full battery), and each changed file that runs nothing with why |

**The house rules are off for the run** (2026-10-14; the rule moved to House Rules 2026-10-28): after
the settings snapshot the battery pins House Rules' `goingDown` false through `job.mjs` (the file
`pin-house-rules.txt`; nothing to pin on a table without the module), and puts the table's own value
back before the settings check. The suites assert the rules as written; a table with the house rule on
walked its fixtures to Exhaustion 6 — dead — across a dozen suites. The section that tests the seam
(`smoke-bythebooks` §4d: the level House Rules writes into the damage's update, on the receipt row and
reverted) pins it on itself and reports a skip without the module. A suite run by hand on such a table
is the hand-runner's to pin.

**The progress bar** (`battery-status.mjs`, 2026-09-30, the user's rule): **a status update on a running
battery is this bar, never prose** — run it and paste the lines.

```
node tools/battery-status.mjs
battery 2026-09-30T19-32-58  [######################--------] 35/47  74%  elapsed 62m  eta ~21m
suites ok 34  failed 1 (smoke-saves 146/147)  checks 1378/1379  running smoke-monsters (1m)
next smoke-wards, smoke-heal, smoke-rest, smoke-lucky … +7
```

It reads the newest `dist/battery/<stamp>/` (or a run directory named as its argument): one `<suite>.txt`
lands per FINISHED entry, so the first entry of `--list`'s order with no file is the one running now; the
start is the stamp (UTC), the eta the mean per finished entry times what is left. Exit 1 while any entry is
red. Offline, no Foundry, safe to run mid-battery.

**The line** (`--line`) is the same reading in one line, the one a release tag's body carries (the chain,
below): the run id, the finished-green entries over the plan's, the checks, and GREEN, RED (a finished entry
failed) or PARTIAL (an entry has no output: still running, or the run stopped). Exit 0 only for GREEN. A run
is named by its directory or by its bare id.

```
node tools/battery-status.mjs --line 2026-10-15T13-55-32
Battery: 2026-10-15T13-55-32 — 45/45 suites, 1691/1691 checks, GREEN
```

**The two-run line** (`--line <A> --and <B> --one-offs <C>`; RULINGS *The two-run rule*): a full run red by one to
three suites is run again whole; when the second run is red on *different* suites (none red in both) and every red
suite is green when run alone (`node tools/battery.mjs <suite> <suite>`, the one-offs run C), the reds were flakes
and the pair releases. A suite red in both runs is a defect, and no line is printed. Exit 0 only when the rule holds.

```
node tools/battery-status.mjs --line 2026-10-22T16-04-11 --and 2026-10-22T16-54-46 --one-offs 2026-10-22T18-02-10
Battery: 2026-10-22T16-04-11 + 2026-10-22T16-54-46 — 66/67 + 66/67 suites, 2328/2329 + 2335/2336 checks, GREEN by the two-run rule; one-offs 2026-10-22T18-02-10: smoke-effects, smoke-monsters
```

**`needs`** is a field on an ORDER row: the rows that suite cannot run without, each resolved to
the **nearest row of that name above it** — which is how the three `fixture-suite` seeds each serve
the suites below them. `smoke-hold` needs `smoke-bythebooks` (adjacent in ORDER, so nothing can
run between them), `smoke-d20-folds` its `fixture-d20-folds`, `smoke-effects` the
`reset-fixture-state` sweep, `smoke-metamagic` / `smoke-emanations` / `probe-effect-view` /
`smoke-nogm` a `fixture-suite`. It replaced the old "ask for both" refusal: the battery runs the
dependency and says so.

**The coverage map** (`coverage-map.mjs`, 2026-09-23). Every battery suite declares
`export const COVERS = [...]` beside its `SECTIONS` — the **machine-tier** files (scripts-relative:
`"emanations.js"`, `"saves/ask.js"`) whose behaviour its sections drive. A claim means *"a
change there should re-run me"*; it is judgment from the suite's own sections, and generous.
`--changed` reads the claims: a changed machine selects its claimants; a changed `decide/` or
registry file is walked UP the import graph (the layer check's own edge reader) to the machines
that import it; a changed suite selects itself, a changed seed the suites that need it, and a changed
suite kit (`tools/class-kit.mjs`) the suites importing it; docs,
`tests/` and `package.json` run nothing. ⚠ **A spine change is the full battery, honestly** —
core, spine, services and entry files (`check-layers.mjs`'s tiers, never a hand list), a
`decide/` file the walk finds the spine importing, `harness.mjs` / `prelude.mjs` / `args.mjs` / `target.mjs` /
`battery.mjs` / `coverage-map.mjs`, and `module.json` (the manifest the platform loads). Those are imported by
nearly every machine; there is no smaller set that tests them, and the plan says which file made
it full. `check-coverage-map.mjs` checks the map **both ways** in `npm run verify`, so a
claim cannot outlive its file and a machine cannot go unclaimed.

Failures print in full to the console **as well as** landing in the file — the `| tail` that
twice lost `smoke-bythebooks`'s "2 FAILURE(S)" evidence cannot happen through this door.

⚠ **The battery also ends with HOOK COVERAGE** (`hook-coverage.mjs`, above), and it clears
`dist/hook-ledger/` first so a previous run's ledger can never be counted as this one's. **Read
the never-fired list.** It is the only line in the whole apparatus that says anything about
whether the module's code RAN, as opposed to whether it is well formed.

## The contracts — what the family reads, recorded

Two other repos read what this module publishes: FX Studio plays the `bythebooks.moment` payload, and
Session Scribe folds the chat cards' flags into the session record. The contract is two files this repo
owns, under `contracts/`, and each reader tests against them from its sibling clone (skipping when the
clone is absent), so a renamed field here fails a reader's test before it ships.

| File | What it holds |
| --- | --- |
| `contracts/moment.json` | every `bythebooks.*` hook: the payload's envelope; each `<event>\|<kind>` pair a recorded run published, its fields, its details' schema and one sample (ids and clocks masked); each word's kinds and fields; every record `decide/moments.js` publishes, recorded or not yet; the companion hooks' arguments (`armorBlock`, `styleDice`, `holdOpened`, `castReleased`, `areaAskAnswered`, `deferredUsageCard`) |
| `contracts/card-flags.json` | every key under the flag scope: `record` or `state`, its family (the word it publishes under), the files that write it, the documents a run saw it on, where the stat stamp sits, which family repos read it (their `contracts/consumes.json`), and its recorded shape |

**How a shape gets there.** The harness arms a recorder beside the hook ledger at connect
(`contract-recorder.mjs`) and writes `dist/contract-recordings/<tag>.json` at teardown: every
`bythebooks.*` hook's arguments and every `create…` / `update…` document hook's module flags, merged
by shape as they pass (`contract-shapes.mjs`), one sample per moment pair. It hears the tester's page
only, so a recording under-reports, never over. The battery clears the directory first and ends by
printing `contracts.mjs --check --run`: a field, pair, key or hook the run saw that the files do not
name, and the documented fields it never saw.

```bash
node tools/contracts.mjs --check               # the files against the code — offline, in npm run verify
node tools/contracts.mjs --check --run         # ...and against the last run's recordings
node tools/contracts.mjs --write               # the recordings unioned into contracts/ (a schema only grows)
node tools/contracts.mjs --write --fresh       # the files rebuilt from the run alone
```

**A new moment or key adds itself.** `npm run verify` fails a word, record, state key or companion hook
the files do not list; `--write` lists it (offline, no shape), and the next recording run plus `--write`
gives it its shape. Commit `contracts/` with the change that moved it. **The version moves when a shape
a reader reads changes**: a field renamed or removed, a word or a key gone (`--write --fresh` drops what
the run no longer saw). A new field or key is additive and leaves it. The version and the prose are
hand-written and kept across writes; `moment.json`'s version is `MOMENT_CONTRACT.version` in
`scripts/events.js` (the check holds them equal), `card-flags.json`'s its own.

## Censuses — how registries get built

`scan-reactions.mjs` · `scan-riders.mjs` · `scan-volley-spells.mjs` · `scan-corpus.mjs` (the whole
ability corpus — race traits, class and subclass features, feats, spells — to a JSON file, ~10 min,
read-only) · `classify-corpus.mjs` (offline: that JSON sorted into mechanism families, `--list
<family>` / `--kind <kind>`; the survey behind SWEEP.md) · `audit-presses.mjs` (offline over the
same JSON: every 2024 save activity whose text presses a condition, against the statuses its
effects actually carry — the `SAVE_PRESSES` candidates) · `audit-spells-register.mjs <corpus.json>`
(offline over a spells-only scan and its classified twin: every PHB spell's verdict — NATIVE /
MODULE / TEXT / OUT — joined with the registry, RULINGS' walk tables and bend registers, and the
drawing's *Register verdicts*; writes `audits/spells-register.md`). Its siblings `audit-dmg-register.mjs` (writes `audits/dmg-register.md`) and
`audit-monsters-register.mjs` (writes `audits/monsters-register.md`; the WAITS word, the GM's-side walk
tables, a "casts X" row native) share their readers through `register-shared.mjs`; `audit-classes-register.mjs` (2026-09-29, the Session 0 plan) needs NO corpus file — it reads the measured class files under `audits/classes/` and `audits/options.md`, the registry, RULINGS and the classes drawing's *Register verdicts* (with the precedent and the stage per row), writes `audits/classes-register.md` and, with `--plan`, the same rows into the plan between its markers. `probe-steady-aim-live.mjs` reads a
live table's Steady Aim chip and attack records without touching anything;
`probe-conditions.mjs` presses each 2024 status on a fixture and reads what the platform applies
(NOTES §2 *What the platform applies for a 2024 condition*), restoring the fixture in `finally`.
`probe-premium-module.mjs <module-id> <out.json>` (2026-09-24, Arcana Unleashed) reads what a
premium module ships pack by pack — counts, types, names — and lists the names the registry
already keys a row on and the names the 2024 packs already carry, so the next supported book
is measured before it is described; pack indexes only, no sole-GM preflight because it
asserts on nothing.

`scan-corpus-offline.mjs <out.json> <module-id> [...]` (2026-10-01, the splat books) is scan-corpus's row shape
WITHOUT Foundry: it copies each LevelDB pack out of the data folder (minus LOCK) and reads the copy with classic-level
from the sibling `fvtt-mcp-dnd5e` checkout — no bridge, no sole-GM, safe during a battery or while the user is in the
world; it also flattens Actor packs into one row per embedded feature (`actor`, `cr`), which the live scan never did.
`classify-corpus.mjs` ranks the three splat books and reads those rows as `monster`; `audit-splat-books.mjs
<classified.json> <corpus.json>` writes the evidence tables under `audits/splat/`, one file per book.

`probe-identifiers.mjs` snapshots every Item in every pack — identifier,
type, rules version, book, compendium source, effect names — to `content/identifier-snapshot.json`
(git-ignored, ~2 MB); `compact-identifiers.mjs` reduces it to `content/identifiers.json` (committed,
what `check-identifiers.mjs` reads). Re-measure after a dnd5e bump or a new premium book.

Read-only sweeps of the official compendia. Curated lists are built from what 5e 2024 actually
ships, never from what the party owns (DESIGN N1). Re-run after adding content.

## Operations

| Tool | Job |
| --- | --- |
| `target.mjs` | **which instance a suite talks to** — one decision, one place. Every harness resolves through it and prints the target it chose. |
| `verify-settings.mjs` | diffs the world's By the Books settings against a reference it does not hold: `--against <snapshot>` (the battery records the world's own values before it runs, `--snapshot <file>`), else the registered defaults plus a git-ignored `tools/settings.local.json`. `--fix` restores drift. Run after every battery. |
| `fixture-suite.mjs` | **builds every fixture from the COMPENDIA** (2026-10-07: no campaign character, scene or item is read — NOTES §5 *The world is a blank slate*). The battery runs it FIRST and a failed build stops the run; run it by hand before a single suite. The test range scene, the two goblins and the bare monster and dummy NPCs (imported by shape or created bare), the player-owned PC attacker, and the `BUILT` PCs from the PHB (a class item at a level resolves its scale values): the Shielder and the player-owned Mage (Sorcerer 6, a real Shield), the d20-fold Fighter (Fighter 5 at Strength 14 — the +5 band `smoke-d20-folds` states) and Bard (Bard 8 — the 1d8 inspiration die), the Vanguard (Paladin 6, an attuned Cloak of Protection, Shield Master, the longsword mastery), and the Paladin, Cleric, Rogue, Ranger, Sorcerer, Goliath and Halfling. All under `Test Suite` folders, idempotent, ownership and abilities re-seeded every run. Every token it places carries the `fixtureHome` stamp `reset-fixture-state` spares, and the base goblins go back to their statblock every run (2026-09-24). Pair with `fixture-d20-folds.mjs`, which runs second. |
| `teardown-fixtures.mjs` | **removes every fixture** — the `Test Suite` folders and what is in them, any `BTB …` / `By the Books …` actor or scene (the range is "By the Books Test Range", the walks' scene "By the Books Walk"), the `BF …` / `Battle Flow …` residue a 2.x run left, and any combat they stand in. The battery runs it LAST unless `--keep`, so the sandbox is left as it was found; `--list` says what would go. |
| `gm-clients.mjs` | **the other GM client's side**, for a script that declares `GM_CLIENTS`: `joinGm(env, key)` joins a declared identity beside the harness's client (the prelude installed, an init script attached before the game page loads), `hangUp` the way a closed window goes (its lead flag cleared), `dropDead` the way a crashed one does (the browser closed under the page); `watchMoments` / `momentsSeen` count a card's moments on that page; and the arrival landing the two-GM sections share (`arrivalLanding`, `armArrival`, `awaitArrival`, `judgeArrival`). Imported by `smoke-companions`, `smoke-summons` and `probe-multi-gm.mjs`; not a suite. |
| `seed-gm-identities.mjs` | **creates the multi-GM identities** (`gm2`, a Gamemaster; `assistant`, an Assistant GM) as world users from the `.env`'s names and passwords, joining as the suite identity; reports each one's role and id, the suite identity's role and the world's settings roles. Once per prod mirror (the mirror drops them); `--check` creates nothing. |
| `reset-fixture-state.mjs` | shared fixtures back to a known state (conditions off, pools full), and **every LINKED `BTB Test` token on the range without the `fixtureHome` stamp swept** — a killed suite's leftovers (2026-09-24). The battery's first row; run it by hand after any killed run outside the battery. |
| `scrub-fixture-residue.mjs` | clears what a suite's 5.x restore no longer clears at dnd5e 6.0 — the AC `override` and the per-ability `save.roll.bonus` — on every BTB Test actor (`--check` reports only). Run it whenever a suite reports an AC or a save that cannot be (the dnd5e 6.0 pass, 2026-09-16). |
| `reload-clients.mjs` | refresh every other connected client after a hot-deploy. |
| `build-release.mjs` | the release zip: the gate, then the archive, then the archive read back. CI runs it on a pushed tag and publishes; run by hand it is the dry run. With `--tag` it first reads the annotated tag's body and refuses one without its battery line (the chain, below). **Never use `Compress-Archive`** (why: NOTES §5 *Release*). |
| `battery-line.mjs` | **the battery line**: one run in one line (`Battery: <run id> — <n>/<n> suites, <n>/<n> checks, GREEN`), the two-run line (`judgeTwoRuns`, `twoRunLine`: two runs red on different suites, each green alone), the one reading of a run directory `battery-status.mjs` draws from, and the release rule over a tag's body that `build-release.mjs --tag` runs. Not run directly; `tests/battery-line.test.js`. |
| `world-snapshot.mjs` | `take` / `restore` / `status` / `drop` — roll the sandbox's databases back after a battery. The copy is 24 MB and takes 0.05s; the ~75s cost is the world bounce either side. **Local only.** |
| `class-kit.mjs` | **the PHB classes' shared page setup**: the fixtures lent and placed, the settings pinned, every helper and the teardown, as one page function (`classKit`) that leaves them on `window.__btbClasses`; `runClassSuite` runs a `smoke-class-<class>.mjs` body between that setup and the teardown. The bands the classes plan runs between its rows are kit calls the bodies make in place (`KIT.leaveA3()`, `KIT.markA2()`, `KIT.dmgBand()`). A change here selects the thirteen class suites (`battery.mjs --changed`). |
| `prelude.mjs` | **the one in-page helper set**: `connectSuite` installs it on the page as `window.__btb` before any suite body runs (a suite's second page calls `installPrelude`). `sleep` (a module clock only), `until(test, { timeout, every, label })` (returns the first truthy value, THROWS with the label or the predicate's text), `watch(test, { ms })` (a window for what must not happen), `canvasReady` · `tokenOn` · `viewScene`, `begin({ sections, titles })` (`results`, `log`, `skips`, `ok`, `want`, and `section(id, fn)`: a throw fails that section by name and the next one runs), `snapshotSettings(keys)`, the dice (`faces([[n, of], …])`, `unrig()`) and `stage`. `tests/prelude.test.js`. A change here is the full battery. |
| `harness.mjs` | the twenty lines every suite used to copy — env, watchdog, connect, preflight, the section plan, one reporter, the **suite lock**, and the **hook ledger** it arms at connect and writes at teardown. Not a suite; nothing runs it directly. |
| `contract-recorder.mjs` | **the contract recorder**: armed by `connectSuite` beside the hook ledger, dumped at teardown to `dist/contract-recordings/<tag>.json` — every `bythebooks.*` hook's arguments and every document hook's module flags, by shape (*The contracts*, above). Not run directly. |
| `contract-shapes.mjs` | the shape algorithm the recorder and `contracts.mjs` share: `schemaOf`, `mergeSchemas`, `sampleOf`, `fieldsOf`, `diffSchemas`; self-contained functions, shipped to the page as source. `tests/contract-shapes.test.js`. |
| `contracts.mjs` | `--check` the committed `contracts/` against the code (offline, in verify) and, with `--run`, against a run; `--write` unions a run's recordings into them (*The contracts*, above). |
| `hook-coverage.mjs` | ⚠ **the only measurement in the tree that is about BEHAVIOUR** (ARCHITECTURE §10 D11): which of the module's hook registrations actually FIRED during the run (it prints the count; 83 when it was built, 172 by 2026-09-05), unioned from the per-suite ledgers in `dist/hook-ledger/`. **It reports; it never fails.** A never-fired line is a coverage gap, a dead handler or a rare hook — only a person can tell which, and v1.23.0 would have printed four dead ones beside a green battery. |
| `claim-proof.mjs` | **the runtime half of the coverage map** (2026-09-23), printed as `hook-coverage`'s second section. The harness also counts every `bythebooks.moment` by record `kind` into the same ledger file (`moments`); this reads it against each suite's `COVERS`: a claimed file is PROVEN (a kind only it writes was published there), PROVEN (shared kind), **UNPROVEN** (it writes kinds, none published — a stale claim), UNPROVABLE-BY-MOMENTS (it writes no kind — derived from the gate's tables, not listed) or NOT MEASURED (no moment half in the ledger). It also names a file that acted in a suite that does NOT claim it. The tag → suite join is read off each script's `connectSuite({ tag })`. Same contract: **reports, never fails.** ⚠ It hears the tester's page only — a second client's resolves are not counted. |
| `moment-writers.mjs` | the gate's flag-write scan and its `WORLD_WRITERS` pins, moved out of `check-moments.mjs` so the claim proof reads the SAME answer to "which file writes which record" (2026-09-23). |
| `battery.mjs` | the whole battery in one command, in the order that works, captured to files — or, with `--changed`, only what the change selects. |
| `coverage-map.mjs` | **the order and the claims** (2026-09-23): `ORDER` (the battery's rows, their notes and `needs`), `loadCoverageMap()` (every suite's `COVERS`, parsed from its text — suites run on import), `isSpine` / `tierOf` (the tier map's answer), `suitesFor` / `planFor` (the change selector). Not a suite. |
| `bump-version.mjs` | move **both** `module.json` version fields together; `--check` asserts they are in step and is part of the gate. |

### The disposable-world cycle

```bash
node tools/world-snapshot.mjs take     # before the battery
# ... run suites ...
node tools/world-snapshot.mjs restore  # after
```

`node tools/battery.mjs --snapshot` does both ends for you, which is where it belongs: the
crash-launder hazard bites a BATTERY, and the round trip costs ~75s of world bounce — more than
every `sleep()` in the tree put together, so it is not a per-suite move.

⚠ **The suites keep their own teardowns and probably should.** Rolling back would make that
ceremony unnecessary, but it is also what lets one suite — or one `--section` — run alone
without a bounce either side, which is the workflow the section filter exists to make normal.
Decide before simplifying (ARCHITECTURE *Decided against, and why*).

## Release and deploy — the chain

The steps, once. Why each is there: NOTES §5 *Deploy* and *Release*. A deploy to a live world happens
only on the maintainer's word.

1. **The floor.** `npm run verify` green, and a green battery run the release names: for a **patch** at
   least the change since the last release, `node tools/battery.mjs --changed v<the previous release>`
   (before the bump: a changed `module.json` selects the full battery), for a **minor** the full battery
   unattended (`node tools/battery.mjs --snapshot`). The battery checks the settings against its own
   before-the-run snapshot. Then `node tools/battery-status.mjs --line` prints the run's line for the tag's
   body (step 5). A run red by one to three suites is run again whole, and when the second run's reds are
   different suites, each green alone, the two-run line stands in (`--line <A> --and <B> --one-offs <C>`, above). A release with no run says `Battery: none (pre-release)` instead: it is published as a
   GitHub pre-release and never reaches prod through the installer (NOTES §5 *Release*).
2. **The bump.** `node tools/bump-version.mjs <patch|minor>` moves both `module.json` fields;
   `--check` is part of `verify`. **The frame (2026-09-30):** 2.x carries the PHB, DMG and MM work, a minor
   per letter series or book stage; **v3.0.0 is the release where the PHB, the DMG and the MM are all done, before any
   walkthrough**; 3.x is the walkthroughs and the supplement books.
3. **The commits.** The change commit(s) — code, its suites and its docs together — then a
   `release vX.Y.Z: …` commit carrying only the bump. Commit bodies are **ASCII** — the log
   mangles non-ASCII punctuation.
4. **The dry run.** `node tools/build-release.mjs`: the gate, the zip in `dist/`, and the read-back
   (no backslash entry, nothing missing, every relative import resolving inside it, every entry equal
   to the tree). The same bytes CI builds. Without `--tag` it needs no tag and no battery line.
5. **The release.** An **annotated** tag on the release commit: its subject is the release title,
   its body the release notes (hand-written, never NOTES.md) carrying **exactly one battery line**,
   the one step 1 printed (`Battery: <run id> — <n>/<n> suites, <n>/<n> checks, GREEN`; an ASCII `-`
   for the dash reads the same), the two-run line, or `Battery: none (pre-release)`. Before the push,
   `node tools/build-release.mjs --tag vX.Y.Z`: the tag against `module.json`, the line's form, and
   the line against its run under `dist/battery/`. That run is the only check that the line is true,
   since CI has no `dist/battery/`; until the tag is pushed, a refused one is rewritten in place
   (`git tag -a -f`). Push main, then the tag.
   [.github/workflows/release.yml](../.github/workflows/release.yml) refuses a lightweight tag, a
   tag off main, a tag that is not `module.json`'s version, a tag already released, and a body
   without a GREEN run's line or the pre-release line; it runs the builder (so the gate) and
   publishes the zip **and** a bare `module.json`, the pre-release line as a GitHub pre-release that
   is never the latest. A red run publishes nothing: fix, make a new release commit and tag it (a
   pushed tag is never moved or deleted from here).
   The workflow run by hand (`gh workflow run release.yml`) is the dry run on CI: the zip kept as
   an artifact, nothing published.
6. **The deploy** (run in the sibling MCP repo, `fvtt-mcp-dnd5e/scripts/deploy-house-module.mjs`):
   `FOUNDRY_HOST=<the live host's preset> node <that script> fvtt-mod-bythebooks --check` first. ⚠ An
   all-identical hash is a half-awake box: wake it through the bridge (`get-world-info`), re-check,
   and never deploy on that reading. Then the same command without `--check`. WebDAV never prunes —
   a file removed from the tree is deleted on the box by hand, or the zip shipped instead. `--local`
   deploys to the sandbox. ⚠ 3.0.0 is a new package id: a world's first install of `fvtt-mod-bythebooks` goes through Foundry's installer (`register-module.mjs --id fvtt-mod-bythebooks --manifest <the manifest URL>`, same repo), never a deploy over the old folder.
7. **After.** Scripts are live on the next world reload; `module.json` (the version) on the next
   Foundry **process restart**, which is the user's. Refresh the other connected clients
   (`reload-clients.mjs`, or ask the table), wait a few minutes before any suite (the front cache),
   and re-run `verify-settings` against the world (`BTB_HOST=<the live host preset> node tools/verify-settings.mjs`). Say plainly what is live, what needs an F5 and
   what needs the restart.

## content/

World **content** repair, not module tooling — grafts and audits that fix compendium data so
the module does not have to learn an ability's name (NOTES §4). These are not part of the
module's test surface and are not run as part of any battery.
