# ARCHITECTURE.md — how the code holds the north stars

> **The binding structure.** [DESIGN.md](DESIGN.md) says what By the Books is for; this page
> says how the code is required to be shaped so it stays that way. Every rule here traces to a
> north star or a binding rule (N1–N4, R1–R5).
>
> Code review of any change starts here. Hard-won facts about Foundry and dnd5e — the things
> that cost a debugging session — live in [NOTES.md](NOTES.md), not here.

---

## 1. The shape in one paragraph

By the Books is a set of **stateless hook handlers** that read persisted documents, consult
**registries**, and write persisted documents. There is no workflow object, no session state,
no cross-client messaging. A feature is: a trigger that stamps a flag, one or more views that
render that flag, and a resolver that acts on it and stamps a receipt. Everything else —
popups, timers, cards, buttons — is a *view of a flag*, and is reconstructable from the log
after a reload.

---

## 2. The four layers

Every line of code belongs to exactly one layer. Which layer it belongs to determines what it
is allowed to touch and how it is tested.

```
┌─────────────────────────────────────────────────────────────────────┐
│ EDGE      hook handlers · Foundry/dnd5e API calls · DOM             │  live-tested
│           "when X happens on this client, read Y and call Z"        │
├─────────────────────────────────────────────────────────────────────┤
│ MOMENT    the spine: stamp → route → present → answer → resolve     │  live + unit
│           one implementation, composed by every machine             │
├─────────────────────────────────────────────────────────────────────┤
│ DECISION  pure functions over plain data                            │  unit-tested
│           hit tests, eligibility, verdicts, formatting, parsing     │
├─────────────────────────────────────────────────────────────────────┤
│ REGISTRY  the closed lists: which content participates, in what way │  unit-tested
│           data, not code — one entry per ability                    │
└─────────────────────────────────────────────────────────────────────┘
```

**The rules between layers:**

1. **DECISION never touches Foundry.** It takes plain objects and returns plain values. If a
   function needs `game`, `canvas`, `ui`, `Hooks` or a document class, it is EDGE — split it.
2. **EDGE never decides.** It reads documents, converts them to plain data, calls DECISION,
   and writes the answer back. An EDGE function containing a rules judgment is a bug.
3. **REGISTRY holds no logic** beyond a resolver function per entry, and no amounts (N1).
4. **MOMENT is composed, never copied.** See §5.

> **This layering is the whole test strategy.** DECISION and REGISTRY are unit-testable in
> milliseconds with no Foundry at all; EDGE is what live suites are for. Code that mixes them
> can only be tested the slow way, which is why it must not.

**EDGE holds two populations, and the dependency rule turns on the difference.** Both touch
Foundry, so both are EDGE by rule 1. A **machine** owns a feature (a flag, its views, its
resolver); a **service** owns none — it is a chokepoint every machine routes a consequence
through (`auto-apply.js` applies damage with a receipt, `effect-riders.js` applies effects with
one, `auto-damage.js` offers and rolls the dice). A machine calling a service is downward; a
machine calling a machine is what §7's rule forbids. The tier list lives in §7.

---

## 3. Who does what — the volunteer model (R2)

No client ever sends another client an instruction. Each client volunteers based on what
appears in the replicated log.

| Action | Client that acts | Why that client |
| --- | --- | --- |
| Roll damage after a hit | **Attacker's** | Its attack, its dice; fires on its own roll hook |
| Apply damage / effects | **Active-GM elect** (`isActiveGM()`) | Ownership is a permission fact; a single writer prevents double-apply |
| Roll a PC's save / concentration | **Owning player's** | Their character, their dice |
| NPC saves, offline-owner fallback | **Active-GM elect** | GM owns everything; the fallback keeps the chain moving |
| Answer a moment | **Whoever owns the decision** | Buttons sit with the decider (`canAnswerFor`): the owning player while connected, the GM when no owner is — ⚠ the ONE gate for every moment popup (`openMomentPopup` applies it); no machine adds a GM quiet on top (the hold kept one until 2026-09-27 and an offline player's Shield popped for nobody). A moment born of an action on one client (a level-up's type pick, a cast's card chip, the roller's own dice popups) opens on that client |
| Override / adjudicate | **GM** | Rulings sit with the adjudicator; also the AFK fallback |

### The driver table — machine × moment × driver × no-GM

**One question, `drivesMomentFor(subjectUuid)` in core.js** — the active GM, and with no GM the
subject's own player (§4 *The flow elect*). A machine supplies only its SUBJECT. **"GM-only"**
means `isActiveGM()`: the moment waits for a GM, and the row says why. `smoke-nogm` asserts the
flow-elect rows (§runs, §chip, §told, §conc, §spent, §cast) and §rejoin.

| Machine | Moment | Driver — the subject | With no GM |
| --- | --- | --- | --- |
| mastery | the payouts, the ask's execution, Graze on the miss | the attacker | the notice, the ask and the popup run; a chip on a monster is skipped and whispered (§runs, §chip, §told) |
| topple | the demand's twin supersede, its buzzer, the failure's press | the attacker | the fold judges and announces; Prone on a monster is whispered |
| chip-spend | the spend on the attack roll | the attacker | the record lands on the card; a monster's chip stays until a GM connects, and counts as spent (§spent). The two tidies (expiry, a deleted combat) are GM-only: deletes on every sheet |
| auto-apply | the attack's damage, effects and mastery payouts | the attacker | PC targets land, monster targets are whispered |
| hold | spell damage | the caster | writable targets land, the rest are whispered; the offer and the answer never needed a GM |
| cast | the cast slice — a utility cast's effects, a heal's number | **the caster** | the caster's own sheet and any PC the caster's player owns land; a monster is whispered, the card marked asked-and-answered, and a GM rejoining re-pays nothing (§cast) |
| concentration | the ask, the fold, the break | the concentrator | everything — a PC owns their own sheet (§conc) |
| saves | the fold, the verdict (on the card), the consequences, the areas | the demand's caster (`sourceUuid`) | verdicts are public and true; consequences land on PC savers and are whispered for monsters |
| hit-menu · superiority-uses · sneak · damage-shields · emanations' relay | their cards' follow-ups | the card's source | as the writes allow, whispered where they do not |
| riposte | the stamp on the ENEMY's attack, its clock, the relayed answer's fold | **GM-only** | the write lands on another user's message (the enemy's attack), which a player may not update; the reactor's own answer and driven attack still run on the reactor's client |
| hew | the crit and kill reminders | **GM-only** | the kill trigger reads the receipt only the elect writes; the crit posts from the same place so one swing reminds once |
| command | the ally's chip, the strike's record | **GM-only** | writes on another player's sheet and on the fighter's card |
| precision · bash-offer · d20-folds | the moot, the crash-resume of an accepted answer | **GM-only** | the answering client resolves at once; the elect only picks up wrecks past the 20 s horizon |
| stats | the data plane's stamps and roster | **GM-only** | the roster is the GM's by design |
| emanations | regions, auras, sweeps, adoption | **GM-only** | scene and region writes are the GM's; the relay's fold rides the flow elect |
| effect-riders (the twin-chip dedupe) · resources | bookkeeping over documents only a GM owns | **GM-only** | nothing to degrade to |
| gear-lights | a press on the toggle; the Long Rest's put-out | **the client that used the item** (an owner of its actor); the rest's on the resting client, the one dnd5e fires it on | everything — the bearer's owner writes the bearer. The item-gone cleanup (`deleteItem`) rides `drivesMomentFor` |
| damage-holds · drop-to-one (the hold at 1 HP and the death offer) · rebukes · damage-rules' grapple card | the clock and the fold on their own card | **the keeper** (`keepsMessage`: the card's author while connected, else the elect) | the author's client runs the clock and writes the pass on its own card; a monster's consequence is whispered |
| dice-changers · initiative-grants · initiative-swap · kit-tend · turn-grants · rest-grants' song | the clock, the default answer | the owner (`actorUuid`) | the owner's player keeps the roll, answers No, Pass or Keep, hands the song out; what lands on another sheet is whispered |
| death-saves | the ask at the dying creature's turn start, its clock, the fold of the system's roll card | the dying creature (`actorUuid`) | the owner's player is asked and rolls on its own sheet; the ask's keeper (its author) folds the roll; Stable and the damage-at-0 failure are written on the rolling or applying client, which owns the sheet |
| bystanders · area-ask | the clock on the bystander's bend, the ask at the area | **GM-only** | the popup opens for the decider and the answer lands; the clock waits for a GM (the same shape as mastery's and the saves' clocks) |
| stored-dice | the rest card's ask (Portent's dice) | whoever answers for the bearer (`canAnswerFor`), under the resumable's `drives` | the bearer's player rolls, or the clock rolls for them |
| volleys | the aim, its clock, the rays | **the caster** (the message's author) | everything runs on the casting client |

### The clocks — who arms each decision clock

Every decision clock is armed through `armAskTimer` (ui.js), and the call names its owner: `electOwns`
(the active GM's leading window), `keeperOwns` (the card's author while connected, else the elect),
`subjectOwns(flag => flag.<uuid>)` (`drivesMomentFor` on the moment's subject) or `continuingOwns` (the
hold's continuing client). The helper reads the flag's absolute deadline, arms only while the moment is
`pending` (a machine with its own notion passes one: Riposte's unanswered reactors, Topple's undone
targets, the save choices' earliest clock), drops the clock once the moment is answered or the client is
no longer the owner, and re-checks the live flag at expiry. **The static proof is `npm run clocks`**
([tools/check-clocks.mjs](tools/check-clocks.mjs)): no `setTimeout` on a deadline outside ui.js, the raw
`armDeadline` only from ui.js (`armAskTimer`, and `openMomentPopup`'s buzzer: the damage offer's, §5 *The popup*)
and the files it pins (the stored dice's ask, the volley's author-side resume), and every `owns` one of the four.
`--list` prints the table.

| Owner | Clocks |
| --- | --- |
| the elect | mastery (the ask and the pick), precision, bash-offer, d20-folds, concentration, the saves' demand (saves/ask), bystanders, area-ask, riposte |
| the keeper | damage-holds, drop-to-one (both cards), rebukes, damage-rules' grapple card |
| the subject | dice-changers, initiative-grants, initiative-swap, kit-tend, turn-grants, death-saves, rest-grants' song (the owner); hit-menu's sweep, superiority-uses' Bait and Switch, the save choices (the source); topple (the attacker) |
| the continuing client | the hold |

The elect-owned clocks whose table row above names the subject as the driver (mastery, concentration, the
saves) are the standing choice: their expiry writes where a player may not (a monster's chip, an NPC's
roll), so with no GM those moments open and are answered, and the clock waits for one.

A card row re-arms its clock on every render (the reload's resume) through `pendingRow`'s `arm` (§5 *The
pending row*): the machine's own clock function, so the owner is the one its `armAskTimer` call names and a
row never starts a clock of its own; `npm run popups` fails an `arm` that does not reach `armAskTimer`.

When the GM's click must make another client act, the GM **flips a flag on a message**. The
flip replicates; the other client reacts to seeing it. That is the only cross-client channel
that exists, and it is not a channel — it is a document.

**Single-writer discipline:** every world-visible write runs on one client — the elect, or with
no GM the subject's own player, and only where that player owns the document (§4 *The flow
elect*). A write nobody present may make is skipped and said, never applied partially
(DESIGN §4). **The static proof is `npm run writers`** ([tools/check-writers.mjs](tools/check-writers.mjs)):
every world write reachable from a handler on a hook every client receives (a document's create,
update or delete, the card's render, `ready`, the combat hooks) sits behind a gate that elects a
client — `isActiveGM`, `drivesMomentFor`, `keepsMessage` (a card's author while connected, else
the active GM), `isContinuingClient`, `canAnswerFor`, or a keeper predicate built from them —
and the gate dominates the write: an `if`, an `&&`, an early return. A relay's `owns` and a
resumable's `drives` are gates, and are checked to be. `isOwner` is not one: a GM owns everything.

---

## 4. State model — flags on messages (R2)

**All persisted module state is a flag on a document.** There is no other store.

**The scope is the package id, and it has a past** (3.0.0, 2026-10-11, issue #6). Every write goes
to `flags.fvtt-mod-bythebooks.*`; every read goes through `readFlag(doc, key)` in
[core.js](scripts/core.js), which reads the new scope and falls back, key by key, to
`flags.fvtt-mod-battleflow.*`, the scope the module wrote as Battle Flow until 2.17.0. Its twin
`clearFlag(doc, key)` removes a key from the new scope and from the old one while that still holds
it; it is used where a chat card's key is unset (saves/demand.js), so an old value cannot read back. The fallback
stays for good: chat messages are never migrated, and an old card keeps its old flags forever.
`queueFlagWrite` reads through `readFlag`, so a write to an old card carries its legacy state into
the new scope. The moment gate (events.js `observeMessage`) reads both scopes merged per key, so a
2.x card resolved before the upgrade is not published again after it. The two places that read a module class off a stored card's HTML (d20-folds.js,
polish.js's target block) match both names.

Everything but chat moves once, by the **GM-load migration** ([migrate.js](scripts/migrate.js),
its pure plan in [decide/migrate.js](scripts/decide/migrate.js), pinned by
[tests/decide-migrate.test.js](tests/decide-migrate.test.js)). On `ready` on the active GM's
client (retried on `userConnected` when no GM was active), it moves the old scope to the new on
actors, their items and effects and the items' effects; scenes, tokens (unlinked token deltas
too), regions, combats, combatants, world items and users. Where a document already holds the new
scope, only the keys missing from it are copied (the new scope wins per key, as `readFlag` does),
and the old scope is always removed: a document never keeps both. An empty old scope is removed
but not counted in the summary. An emanation RegionBehavior of type
`fvtt-mod-battleflow.emanation` is retyped in place to `fvtt-mod-bythebooks.emanation` (Foundry
14's `ForcedReplacement` for its system data), else recreated and the old one deleted; a recreated
behaviour carries `flags.fvtt-mod-bythebooks.migratedFrom = <old id>`, so a retried load never
doubles it. Each top-level step, and each region's behaviours, runs in its own try/catch: one
failure is logged, the rest carries on, and the next load retries what failed. Once regions have moved it fires
`fvtt-mod-bythebooks.emanationsChanged` so the auras re-sweep. Every world Setting
`fvtt-mod-battleflow.<key>` whose key the module registers moves to `fvtt-mod-bythebooks.<key>`
and the old document is deleted; an unregistered legacy key stays and is logged. The client
settings are copied in localStorage at `init` on every client (never while passive), which is why
`migrate` is the FIRST row in the dispatcher's `ORDER`: the copy runs before settings register.
Every migration write carries the options mark `bythebooksMigration: true` (§7), the synthetic
`updateActor` / `updateToken` a token-delta write raises included; it posts one
summary when something moved, and a second run finds nothing to do.

⚠ **Deliberately unchanged by the rename:** the `data-bf-*` DOM anchors, the `bf-*` classes, the
`bfEmanation` status id and the `bf-suite-*.lock` file name. Cards and effects stored before 3.0.0
carry them, so they keep the old short form.

| Where | Shape | Why there |
| --- | --- | --- |
| **Attack / usage message** | the moment flag (`hold`, `mastery`, `saves`, `precision`, `volley`, …); `chipSpend` — the chips this attack roll used up; `reminder` — what the gate showed before this roll, the net, the press | The moment belongs to the thing that caused it; a spent chip is explained on the roll that spent it (R5); a roll that went out with Advantage says why |
| **Attack message** | `lungePick` (the offer's tick for Lunging Attack) · `hold.targets[].reduceBy` (Parry's or Stone's Endurance's roll, at the answer) · `hold.targets[].reduce` — a reduction row's formula and activity, and since 2026-09-24 its VOICE stamped at the hold (`eyebrow`, `spend`, `hit`, `by`, and `maneuver` — false for a row that is not a maneuver, which the moment gate reads) | Read by the rider and the applier on the roll that follows; the views, the answer and the announcement speak in the row's voice without a lookup |
| **Attack message — the `roll` interrupt** (Slice A, 2026-09-24) | `hold.targets[].rows` — the popup's rows as stamped (`key`, `name`, `kind`, `dice`, `tag`, `off`: the reaction found and every `roll` row, a spent one with its reason); `hold.targets[].rescues` — the `roll` rows' records (`name`, `itemId`, `activityId`); at the answer `answer: "roll"`, `rescue` (which row) and `bent` (`disadvantageOutcome`: `how`, the faces, `stood`, `total`, `isCritical`, `isFumble`, `wasCritical`, `changed`); `hold.critAtStake` — a crit a live `roll` row could undo, so the damage is not rolled at the hit | The hold is the moment; the continuation folds `bent` in as a `replace` (decide/verdict.js `ATTACK_FOLDS`) and `critFor` reads it, so one crit source still serves both roll paths. With no live row a target with only `roll` rows is held as `kind: "roll"`, the first live row its `reaction` |
| **Damage message** | `receipt`, `effectReceipt`; `damageShields.paid` — the wards that have paid out for this hit, claimed BEFORE the dice; `damageShields.judged` — a HELD roll's judgement, stamped at its release (an unheld roll is judged once at creation and carries no stamp) | The application belongs to the roll that caused it; one payout per ward per hit across reloads and clients; a reload never re-judges an old hit against a table that has moved on |
| **Damage message — Slice A** (2026-09-24) | `weaponRolls` — how many of the rolls are the activity's own, stamped at `preRollDamage` by auto-damage.js's first-registered handler, before any rider pushes (state, not a resolve); `diceChange` — the dice changers' one record per roll (2026-09-27; Savage's `either` and Empowered's `empowered` before it): `rows` (Empowered Spell `pick`, Savage Attacker `set`, Piercer `one`, each `due` / `spent` → `pending` → `used` / `kept` / `moot`, a used row carrying its outcome), `dice` (the chips), `total`; born at `preRollDamage` `due` or `spent`, then `pending` (the clock) → `answering` (with `pending`, the durable intent: the rebuilt rolls, each row's outcome, `total`, `delta`) → `used`, or `kept` / `moot`; `clockRiders.riders[].effects` / `clock` / `featureUuid` / `activityId` and `clockRiders.effectsApplied` (Frost's Chill's effect, claimed once); `hitManeuver.picks[]` — a pick per group (2026-09-27), each with its `press` / `pressed` (Hill's Tumble) | `diceChange` due, pending or answering is a SECOND claim on the application (auto-apply.js): the dice land once, with the set that stood |
| **The ward's own roll message** | `damageShield` (the ward, the defender, the attacker, the dice, the type, why) plus the ordinary `receipt` at the attacker | The strike is its own roll, posted as the defender's — never mistakable for a spell the caster pressed |
| **Usage card** | `damageCast` (a bare damage activity's dice, driven; `save` when a listed row demands one after) · `damageSaveCard` (the save that followed the damage, on the save's own card) · `superiorityUse` (what a Bonus Action maneuver did) · `baitSwitch` (who wears the AC — the choice, its clock, its answer) · `command` (Commander's Strike — the ally, the die, `status` directed / struck, the chip's id; the ally is TOLD and attacks from their sheet) · `shieldMark` (Armor of Agathys marked at the cast) · `castApply.choice` (a listed cast's pick between alternative effects — `key`, `options`, `chosen`; the cast slice waits on it) · `tacticalArmed` (a scoped tactical fold used from the sheet — the die rolled, which check, `spent` once it folded in) · `areaChoice` (a spell that chooses its targets: `chosen`, `left`, `asked`, `cap`; the demand's reach filters to `chosen` on every re-read of the area, and `metamagicAsk` kind `choose` is its question while it stands) · `poolSpend` / `hitManeuver.poolSpend` / `hold.targets[].poolSpend` (a die the module spent by hand, in the one row shape resources.js reads) | The use is the moment; each is a view of its own flag |
| **The ally's damage message** | `commandRide` (Commander's Strike's die rode this roll — the card it came from, the formula, who struck) | The elect folds it back onto the fighter's card as `struck` |
| **Save demand card** | `saves.demand` — `{spell, statuses}`: what the save is against, read at the stamp off the activity's item and its failed-save effects; `saves.targets[].noneOnSuccess` — the effect row (Circle's Power) whose success takes none, stamped at the fold beside `evasion` | The save gate reads the demand when the roller's dialog opens (Aura of Purity's conditions, Circle of Power's spells); the applier reads the entry |
| **Response message** | `respondsTo` + the answer | A player can only write their *own* message — this is the answer channel that needs no permission. See **the relay** below |
| **Actor** | `cleaveArm`; the chips — the mastery marks (`Vexed`, `Sapped`, `Slowed`), the once-per-turn chits (`Cleave`, Sneak Attack, a clock rider, Steady Aim, `shield:<key>` for Death Armor, `emanation:<regionId>`), the use chips (`mastery = "use"`, `useKey` the row — Evasive Footwork, Lunging Attack) and **the Reaction** (`Reaction — used`) — as ActiveEffects carrying `start` + `duration.expiry`, each fingerprinted by `flags.<module>.mastery = <key>`; the shield MARK (`flags.<module>.shield = {key, itemUuid, spellLevel, scaling}` — Armor of Agathys, the pack ships no effect) | Per-creature, per-turn state. ⚠ A chip's clock is the PLATFORM's (v14 `duration.expiry`, judged against `start.combatant` — RULINGS.md *Chips and clocks*); the module writes the window once and never counts turns. The Cleave chit's `start` is the turn IN PROGRESS and its liveness is a stamp comparison (`chitStamp` vs `combatStamp`) — the platform's expiry is its tidy |
| **Applied effect** | provenance markers | Which module path created it, so revert knows |
| **Region** (on a scene; since dnd5e 6.0 the region IS the area — drawn nowhere: locked, visibility LAYER_UNLOCKED, the user's rulings of 2026-09-18/19) | `emanation` — `{kind: "feature"\|"spell", key, tokenId, itemUuid, initial: [tokenIds asked by the cast's own demand]}`; its one By the Books behaviour (`fvtt-mod-bythebooks.emanation`, a document subtype declared in `module.json`; `fvtt-mod-battleflow.emanation` before 3.0.0, converted by the migration) carries the row's key, the source token and item, the reach, the upcast level and the pack's effect with the source's numbers resolved; `remind` and `heal` are read off the row, not stored | The AREA is the platform's document: attached to its token, membership computed by Foundry, events raised by Foundry. The module's state on it is which row it is and what it hands out. A member's copy is an ActiveEffect carrying `emanation: {regionId, key}` — the fingerprint the floor keys on, one per creature per region |

### The four state laws

1. **Never key persisted data by uuid.** Foundry expands dotted keys on write, and every uuid
   contains dots — `{ "Actor.abc": "cast" }` is stored as `{ Actor: { abc: "cast" } }` and every
   lookup misses silently and forever. **Per-target state is an array of entries carrying a
   `uuid` field** (NOTES §1).
2. **Every per-target flag write goes through the serializer** (`queueFlagWrite`).
   Read-modify-write on a shared flag is only correct when writes are sequential, and
   per-target independence makes them overlap by design. A lost merge entry is two faults at
   once: the card under-reports, *and* the receipt is the idempotence guard, so the consequence
   applies a second time. The same holds off chat — a map or a list on an effect or a region
   (`recoiled`, `rerollUsed`, `areas`, the region's `initial`) is edited under the serializer, with
   `initial` naming its empty shape. **The static proof is `npm run serializer`**
   ([tools/check-serializer.mjs](tools/check-serializer.mjs)): a raw `setFlag` of a module flag is a
   birth stamp, or it fails — outright when the flag is also written through the serializer, else
   unless pinned as a one-writer flag (§11 rule 3) with its reason.
3. **The flag is the state; the popup and the card row are views.** Any view must be
   reconstructable from the flag alone after a reload, on any client.
4. **Every write that changes the world stamps a receipt** carrying prior values, so revert is
   a restore of what was recorded and not guesswork (R5). A revert puts the target's HP back to
   the receipt's `prior`; it does not subtract a delta. A second application on the same target
   from the same message (a reroll moving applied damage) FOLDS into the entry, `prior` kept
   (`joinDamageReceipt`), so one revert undoes the whole story.

### Who reads a record — a key another unit reads has its owner's reader

A unit reads its own flags by key (`readFlag(doc, "k")`); a key another unit reads is read through a reader
named for what it answers (a presence, the entries, one field, one entry), and no other file names the key. A
machine reading another machine's flag by its literal key is a coupling `npm run layers` cannot see: a renamed
field breaks a reader nobody can find. This is not the flag accessor layer D4 dropped (Appendix *Decided against*):
a unit's own keys stay read by key, and a reader exists only for a key that crosses a unit.

**The reader sits with the writer when the writer is below every reader; else it goes down to the spine**, where
the services, the spine and every machine can import it (§7: a shared reader goes down, never sideways):

| Readers | Keys |
| --- | --- |
| [auto-apply.js](scripts/auto-apply.js) | `hasReceipt`, `receiptEntries` (the receipt); `notAppliedOf` |
| [effect-riders.js](scripts/effect-riders.js) · [area-ask.js](scripts/area-ask.js) · [auto-damage.js](scripts/auto-damage.js) | `effectReceiptOf` · `areaAskOf` (the ask at the area, `metamagicAsk`) · `weaponRollsOf` |
| [shared.js](scripts/shared.js) — a machine's record a service or the spine reads | `holdOf`, `holdTargets`; `savesOf`, `saveSourceOf`, `saveDemandOf`, `saveEntryFor` (beside decide/demand.js's constructors and `verdictsOn`); `attackIdOf`, `attackHoldClaims`, `attackHoldReleased`; `chipKindOf` (the chip's `mastery` fingerprint), `masteryMomentOf`; `metamagicOf`; `d20FoldSpends`; `styleFaceOf`, `styleTookOver`; `storedFacesOf`, `bystanderMuteOf`, `chipSpendsOn`, `poolSpendsOn`; `effectSourceUuid` |
| [core.js](scripts/core.js) | `stampedSourceOf` (the data plane's `sourceUuid`, beside `statContext`); `leadsWindow` (`leadWindow`) |
| [ui.js](scripts/ui.js) · [dice-rise.js](scripts/dice-rise.js) | the relay's envelopes and the demand registry (`respondsTo`, `saveFor`) · the one renderer (`diceRise`) |

**The static proof is `npm run flagedges`** ([tools/check-flag-edges.mjs](tools/check-flag-edges.mjs)): every read
of a module flag in every form (`readFlag`, `getFlag`, `flags[MODULE_ID].k`, a `flags.${MODULE_ID}.k` path),
constants resolved per file; a key's owner is every unit that writes it (`hold/` and `saves/` one unit each), its
`OWNERS` row names where its readers live and why, and any other read by name fails unless pinned in `ALLOW` by
file and key with what it reads and why it stands. A key three units read outside its owner gets readers, not a
third pin. A read with a variable key (a registry, a fold's getter) or of the whole scope is listed, not judged.
`--list` prints every outside read, every unjudged read and the keys no file reads by name.

### The leading window — one client per user, not per user name

A GM with the game open in two windows is two clients, and `game.users.activeGM.isSelf` is true in both:
every consequence the elect lands would land twice (found 2026-10-12: two familiars and two effects from one
summon). So `isActiveGM()` and the flow elect also ask `leadsWindow()` (core.js): each window has an id, and
the GM's User carries the leading window's id (`leadWindow`), claimed on load and on focus (ui.js), cleared on
close; the window taking the lead resumes what was left pending. No flag, the window leads (one window, as
before). A popup a user STARTED (a summon, a transform cast from a sheet) answers on that user's screen
(`answersHere(askedBy, actor)`), not on the owning player's: a GM casting for a player's character answers
it; with that user gone, `canAnswerFor` decides as before.

### The flow elect — presentation runs without a GM, consequence does not

**User ruling (2026-09-01): the popups all run without a GM; the effects that need GM
permission simply do not apply; and whoever is driving is told which consequence was skipped.**
A GM disconnect must never stop the module silently.

The code splits along one line, and it is the line to keep:

| | Without a GM | Why |
| --- | --- | --- |
| Cards, asks, popups, flag writes on the attacker's own message | **run** | a player may create messages and update their own |
| Chips, conditions, HP, anything on the monster | **skipped + whispered** | a player has no write permission there |

`flowElectFor(actor)` is the active GM, and with no GM the actor's own player — **actor-local
on purpose**, because the chain's writes land on the attack message, which only its author may
update; a room-wide "lowest active user" elect would hand the flow to someone with no permission
to record it. `canApplyTo(actor)` guards each world-write, and `whisperNoGM()` names what did not
land **and what still stands** (both in core.js).

⚠ **One elect, never two.** With a GM connected `flowElectFor` returns exactly what
`isActiveGM()` does; the fallback engages only when `game.users.activeGM` is empty — the same
question with the GM removed from the answer, not a second election beside the first.
`smoke-nogm` §rejoin holds it: a GM reconnecting mid-flight re-pays nothing.

**Scope: every machine that has a subject**, through the one helper `drivesMomentFor` — §3's
driver table is the list.

⚠ **Gate on the SUBJECT, never on the room.** Two players taking damage in the same tick each
drive only their own ask; a room-wide fallback would hand one player's moment to the other, who
cannot write it. Where a hook cannot know the subject before it looks — a save roll answering an
unknown demand — the gate moves INSIDE, after the lookup.

**Several GM clients** (suite issue #8; measured in
[audits/plans/multi-gm-measurement.md](audits/plans/multi-gm-measurement.md)). A Gamemaster's window, an Assistant GM's
and the MCP bridge are each a GM client; `game.users.activeGM` is still ONE user (the highest role, then the lowest
id), so the elect is one client at any instant. It moves when the leading user connects or leaves, and Foundry tells
the client already on before the newcomer asks for its world, so a hand-off opens a gap (about a second with nobody
the elect), never an overlap. Four pieces keep a record landing once across it:

- **The snapshot guard** (ui.js `resume`). A client booting renders the chat log from its world snapshot before
  Foundry applies the events it buffered after the snapshot, so a resume driven from that render can miss a claim
  the client already on made a few milliseconds after the cut. A `"render"` resume before `game.ready` therefore
  does not drive: its message is set aside and resumed at `ready`, on the document as `ready` finds it. One place,
  every resumable.
- **The claim names its claimant** (core.js `claimLanding`, beside `queueFlagWrite`). A landing is claimed inside
  the serializer with a stamp, `applying: { by, window, at }` — the claimant's user, its window (`WINDOW_ID`), the
  server's time (`game.time.serverTime`, so a claim judged on another machine does not die of that machine's
  clock). An object is truthy, so a claim still reads as a claim; `claimLanding(message, key, due, { field, done })`
  is the one writer (initiative-grants' fallback claims `fallbackApplying`), and a release writes `false`.
- **The liveness rule** (core.js `claimHolds`). A stamp holds while its user is connected and it is younger than
  `CLAIM_CEILING_MS` (a minute; the worst landing measured took 4.5 s), the record still unlanded. Its user gone,
  or the ceiling passed (a window closed mid-landing while its user stays on in another), the claim is dead. Every
  resumable's `pending` reads its claim through `claimHolds`, so a dead claim reads as no claim, and the
  re-driver's `claimLanding` writes over it. `true`, a claim written before the stamp, always holds, as it did.
- **The re-drive** (ui.js). A user leaving (`userConnected`, false) resumes the recent cards (the last 60), each
  under its resumable's own `drives`, so a dead claim's record is landed by whoever drives it now; taking the lead
  resumes them now and again past the ceiling, and so does a window handed its user's lead by the closing leader
  (`updateUser`: the flag no longer names another window). **What a re-drive finds**: a landing that claimed over a
  dead claim (`claimLanding` hands back `over`) first removes what the dead one made. A summon's landed tokens and
  the caster's shared resistance carry the card (`summonCard`), its standing effect (`summonEffect`) and its
  companion effect (`companion`) are keyed by it too; summons.js `sweepDeadLanding` removes those (and the tokens'
  seats) before landing again.
- **The steps claim as landings do** (issue #21). A summon's dismissal (`dismissing`), a companion's errand
  (`companion.acting`), a change of form (`changing`) and a sweep's or a switch's resolve (`resolving`) are claimed
  by `claimLanding` with a path for the field and `done: null` where the step's own `due` ends it; `pending` reads
  each through `claimHolds`, and `npm run gmsites` fails a raw `true` or a bare read of any of them.
- **The ledger** ([ledger.js](scripts/ledger.js), [decide/ledger.js](scripts/decide/ledger.js); issue #22). A
  landing's world writes, and a claimed step's, go through `landingSteps(message, key, scope).step(name, { plan,
  witness, run })`: before the write the record holds the step's PLAN (what it will do, computed once) and its
  WITNESS (what it will change, as it stands: Hit Points, an effect list, the stamped documents); after it, the step
  is done. A re-drive over a dead claim reads each step: done is skipped, a begun step whose witness moved landed (the
  dead claimant's write went through), one whose witness did not is run again on the dead claimant's plan, never one
  recomputed off the world it already changed. A document a step makes carries `flags.<module>.ledgerStamp`
  (`stamp`), so its witness is the stamped documents (`made`). The run's final flag write drops its ledger
  (`closeLedger`). What is left is the step's own write itself: a claimant gone between a write and the record of it
  is caught by the witness, so a write lands once unless something else moved its witness in that same instant.

**Every `isGM` read is tagged** (`npm run gmsites`, [tools/check-gm-sites.mjs](tools/check-gm-sites.mjs)):
`game.user.isGM` is true on every GM client, so a site behind it runs once per GM screen — right for what a screen
shows (presentation: a button, a popup, a control, a view; the click is that GM's own act, its write guarded where
it lands), right for a write each GM client makes for itself (own: its User's lead flag, its own card), wrong for a
consequence, which gates on `isActiveGM()`. No consequence sits behind `isGM`: an Assistant GM may make every
write the elect makes in a default world (the measurement note's §1.3), so the cut is presentation or consequence,
never a role split. A moment of an unowned subject pops on every GM screen (`canAnswerFor`'s GM branch) and the
show-once latch is per client, so a popup answered on one GM screen closes on the others through `closePopup` when
the answer lands (§5 law 4). The two-GM proof is `smoke-companions` §9 and `smoke-summons` §10 (a landing as a
second GM client arrives, one landing per record) and `probe-multi-gm.mjs`'s orderings (tools/README.md).

### The relay — the answer channel, one shape

A player cannot write someone else's message, so when the answerer is not the client that owns
the flag, the answer travels as **its own public message carrying an envelope**, and the owning
client folds it in. The hold's answer (`respondsTo`), a save's choice (`saveChoiceAnswer`) and a
riposte's (`riposteAnswer`) are the shape every relayed answer takes. Each declares itself to **one registry in
the spine** — `registerRelay(envelopeKey, { flagKey, targetOf, owns, fold })` in
[ui.js](scripts/ui.js) — served by a single `createChatMessage` registration. **The sending side is one
call beside it**, `postAnswer(envelopeKey, { …postCard's, toElect, noGM })` (§5 *The card*): the answerer's own
card carrying the envelope under its key; `toElect` whispers it to the GMs when the fold is the elect's, and
`noGM` is the sentence said instead of sending when no GM is connected. `npm run cards` fails an envelope posted
through a plain `postCard` and a `postAnswer` naming a key no relay registers.

**`owns` is why this is a registry and not a merge.** The hold's fold is owned by the
**continuing client**; the other two by the **elect**. `owns` receives the target's live flag
so `isContinuingClient(flag)` can answer; the elect-owned relays ignore the argument.

⚠ **Unify the mechanism; leave the bytes alone.** An envelope's shape is a wire format on
messages players write and another client reads — an answer in flight across a deploy would stop
folding. The hold's is flat sibling flags because that message also carries an `effectReceipt`;
`targetOf` lets each relay name its own shape. `respondsTo` carries FIVE meanings, and the bytes
of none of them change:

| The message that carries it | Points at | Read by |
| --- | --- | --- |
| a hold's answer (with `uuid`/`answer`/`ac` beside it; `reduceBy`, `poolSpend`, and since 2026-09-24 a `roll` answer's `bent` and `rescue` — additive siblings, the old bytes unchanged) | the attack message | the hold's relay (`registerRelay("respondsTo")`), which self-selects on the target's `hold` flag — why `flagKey` is part of a relay's declaration rather than inferred |
| a save roll the module rolled (with `saveFor`) | the demand card | **the demand registry** |
| a concentration roll the module rolled | the ask card | **the demand registry** |
| Precision Attack's die | the attack message | precision.js, on its own `precision` flag |
| a d20 fold's die | the roll message | d20-folds.js, on its own `d20fold` flag |

**One reader for the demands** — `demandAnsweredBy(rollMessage)` in [ui.js](scripts/ui.js), over
the pure `resolveDemand` in [decide/demand.js](scripts/decide/demand.js). Each demanding machine
declares itself (`registerDemand(flagKey, { priority, chained, answering, pendingEntry,
pendingFor })`); the order is **`priority`, ruled 2026-09-05: concentration, then saves, then
Topple**. A stamped roll answers the card it names on whichever declared flag accepts it (the
Topple fold accepts none); a chained roll (`system.origin`) answers the card it chains to or
nothing; a bare sheet roll answers the highest-priority machine with a pending entry for that
actor and ability, oldest card first. `pendingDemandsFor(actorUuid, { flagKey })` asks "is this
creature mid-answer" with no roll in hand. Outside `saves/`, the `saves` flag is read or written
only through its constructors (`saveDemandData`, `saveTargetEntry`) and its reader
(`verdictsOn`).

**Coverage.** A single-client suite never sends the envelope (the answerer can write the target).
[smoke-twoclient.mjs](tools/smoke-twoclient.mjs) §relay covers the hold's relay — a
player-owned target, a GM-rolled attack, the continuing client folding. `saveChoiceAnswer` and
`riposteAnswer` (elect-owned) are single-client-tested only.

### Idempotence and resume

Every consequence carries an `applied` marker and an `answeredAt` timestamp. A resolved-but-
unapplied entry past the horizon re-drives; an applied entry never re-drives. This is what makes
a mid-chain reload or a crashed client safe.

**The resume floor is one primitive** — `registerResumable(flagKey, { pending(flag, message,
cause), drives(flag, message), drive(message) })` in [ui.js](scripts/ui.js). The spine holds the
three registrations once (`createChatMessage`, `updateChatMessage`, `dnd5e.renderChatMessage`:
arrival, the write that releases a claim, the reload), latches on `${flagKey}|${messageId}`, and
awaits the drive. `cause` (`create` | `update` | `render` | `lead`) exists because an arrival and a resume
are different questions; `lead` is the recent cards resumed when a window takes the lead or a user leaves (the
re-drive), and a `render` before `ready` waits for `ready` (the snapshot guard; both §4 *The flow elect*). **The drive does no DOM work**, so card-row order is untouched. A
**`flagless`** resumable (the attack payouts, the damage shields) judges an arrival that carries
no module flag, keyed by name. The claims (`effectsApplied`, `resolving`, `judged`, the receipt)
stay the machines', through the serializer. ⚠ A new resume goes through the primitive; judging
world state on a re-render without a claim is a bug. (The saves, concentration and mastery
resume checks stay in their own render hooks, which also draw their rows.)

**Withhold and resume is the spine's too** — `registerWithhold` / `registerWithheld` /
`withholds` / `resumeWithheld` in [ui.js](scripts/ui.js). A machine about to write a verdict
asks the spine whether a registered offer withholds it (a d20 fold offered on a save); the
offer's resolver hands the verdict back through the spine, at that instant, on the client that
resolved it. Neither machine imports the other.

### Accepted trade-offs — known, measured, chosen (2026-09-28)

A review is going to find these again. Each is a deliberate choice with its reason; a row moves
to §10 only if the reason stops being true.

| Trade-off | Why it stands |
| --- | --- |
| **A revert restores the receipt's recorded prior HP**, not a delta. Healing that landed on that target AFTER the receipt is lost on revert. | Prior values are exact; a delta is not once resistances, temp HP and a 0-HP floor are in play (`takenOf`). The reroll case folds into the entry (law 4). |
| **Damage lands before its receipt.** `applyDamagesWithReceipt` applies per target, then writes the receipt once. A GM client that dies inside that gap re-applies on resume. | The gap is milliseconds on one client; closing it costs a second DB write per target on every hit. The in-memory `claimedShares` and the `attackDamage` latch cover the live cases. |
| **Two short in-memory windows exist** despite "no session state": Riposte's armed die (60 s, riposte.js) and the concentration cause for Mage Slayer's Disadvantage (3 s, concentration.js). | Each is a reminder-grade fact, never HP or a resource. A reload inside the window drops one hint. Persisting them would be a flag write per hit for nothing a table has noticed. |
| **The metamagic pick lives in memory between the dialog and the card** (metamagic.js `pending` and `freePending`, keyed by the activity): the tick in the Cast dialog waits for the usage card to be born, and the dialog's close sweeps an unborn pick after 3 s. | The card does not exist while the dialog is open, so there is nothing to write the pick on; the stamp refuses a pick older than five minutes, and a cancelled dialog's pick must not land on the next cast. A reload between Cast and the card loses the tick, and the menu asks again. |
| **Deadlines are stamped and judged with each client's own clock** (`Date.now()`, never `game.time.serverTime`). A skew of ten minutes or more between machines disables a timer through `deadlineIsLive` rather than misfiring it. | The ceiling was chosen so a wrong clock fails SAFE (no buzzer) instead of rolling dice for a fight that ended. Server time would buy accuracy under skew nobody has measured at the table. |
| **A re-driven landing repeats what its dead claimant wrote before it went**, except a summon's (its tokens, its shared resistance, its standing and companion effects are found by the card and removed first) and the writes judged at the landing (a mastery or known-form list against the list as it stands, Temporary Hit Points that keep the larger pool). A rest grant's pool use, an initiative swap or a held share's damage could land twice. | The window is a claimant gone between its first world write and its record (the landing's own milliseconds), and the alternative is the record stuck claimed forever with nothing landed. A landing that can be found by its card is made so when a second customer needs it. |
| **Some reads scan the whole chat log** (`demandCards`, `holdPendingFor`, `answerHoldsFor`, the riposte and bash-offer lookups). Work grows with the age of a world. | A tail misses: one round can emit dozens of messages (answer.js). Parked in BACKLOG with the un-parking condition. |
| **The dispatcher catches synchronous errors only.** An async handler that rejects logs its own error. | Every async handler owns its try/catch by convention; awaiting them in the dispatcher would serialize hooks the platform fires synchronously. |

### The data plane — stat stamps

Every consequence this module assigns — damage, healing, an applied effect, a spend, a table
moment — carries two machine-readable fields so an external reader can fold the chat log into a
per-combat ledger **without parsing HTML and without re-deriving context after the fact**.
⚠ **The reader is live** — `fvtt-app-sessionscribe`'s `analyze-combat`
(`src/page/combat-stats.ts`) consumes this section as a wire format; a change to any stamped
shape is a breaking change to an external consumer. Coordinate, don't drift.

- **`combat`** — `combatStamp()`'s `"combatId:round:turn"`, **null out of combat by contract**
  (reports keep the null bucket — short rests, traps and RP damage are real).
- **`sourceUuid`** — the actor whose action caused the record; for an unlinked token the
  token's **synthetic** actor uuid (THAT goblin, not the archetype). Null when no actor can
  honestly be named.

**The baseline is `statContext(sourceUuid)`** (core.js) **spread into the write, never
hand-rolled**; the source resolves through `statSourceOf(message)` (shared.js) or the closer fact
the writer holds. Receipt families thread it **per entry** through `receiptEntry` and
`effectRecord` ([decide/receipt.js](scripts/decide/receipt.js)), because applications split in
time; moment flags spread it at creation. Both fields are ALWAYS written: **explicit null means
"resolved, and the answer was nothing"; an absent field marks a record from before the plane
existed** — do not tidy the nulls away.

**The stamped families — this table is the scribe's read contract:**

| Flag | Stamp granularity | `sourceUuid` means |
| --- | --- | --- |
| `receipt` entries | per entry | attacker / caster / healer (the receipt message's own actor) |
| `effectReceipt` effect records | per effect record | who applied it (rider = attacker, cast/save = caster, reaction = the reactor's own self-cast) |
| `spend` (usage messages) | per flag, at creation | the spender |
| `rollCtx` (every d20 TEST message: attack, save, check, skill, tool, death save, concentration) | per flag, at roll time on the rolling client | the roller |
| `d20fold`, `precision`, `mastery`, `topple`, `riposte`, `bashOffer` | per flag, at creation | the acting actor (duplicates the flag's own actor field at the same write — they cannot drift) |
| `saves`, `hold`, `volley` | per flag, at creation | the caster / attacker who forced the moment |
| `concentration` | per flag, at creation | the concentrator (whose check it is — the damage's dealer is `cause`, by name) |
| `holdSkipped` (attack messages) | per flag, at the skip | the attacker whose swing outran the reaction |
| `combatRoster` (a GM-whispered marker card per combat) | once at combatStart; closed (`endedRound`/`endedAt`) at deleteCombat | null — the roster is nobody's action |
| `chipSpend` (attack messages) — `spent: [{id, name, key, uuid, bearer, mode, honoured}]`, the chips this attack roll used up | per flag, at the spend (the elect, on the attack card) | the attacker (whose swing spent them). `honoured` is against the gate's NET when the gate ran AND listed that chip's kind (`netShownFor`), else the chip's own bend. ⚠ This record is also the gate's memory: a chip whose spend is on record is never offered again, whatever the sheet says (a no-GM table cannot delete the monster's chip) |
| `reminder` (the roll messages the gate met: attacks — in the dialog, or a volley's ray judged at the aim — and saves / concentration checks through the save gate) — `sources: [{kind, bend, label}]`, `net`, `mode`, `honoured`, `answeredAt` | per flag, at the press (a ray: as it fires), on the roller's client | the roller (the attacker, or the one saving). The report splits "rolled with Advantage because the table was reminded" from "rolled flat against the net" |
| `damageShield` (the ward's own roll card) — `key`, `attackerUuid`, `total`, `type`, `why` | per flag, at the strike (the elect) | the DEFENDER whose ward struck (the receipt on the same card names the attacker as the taker) |
| `damageCast` (a bare damage activity's usage card) · `superiorityUse` · `baitSwitch` · `command` · `shieldMark` | per flag, at the use (the caster's client) | the caster / the fighter whose use it is |
| `superiorityRide` (a damage message) — `rode: [{key, formula, type, why}]` | per flag, at the roll (the roller's client) | the attacker whose die rode |
| `emanationHeal` · `emanationRemind` | per flag, at the event (the elect) | the caster of the area |
| `clockRiders` (a damage message) — `attackId`, `riders: [{key, label, formula, type, why, usesLeft}]`: Dreadful Strike, Divine Strike, Primal Strike, Divine Fury, Assassinate riding the hit, and since 2026-09-24 the Goliath's Fire's Burn and Frost's Chill (a rider with `effects` carries its `clock` and where its activity lives) | per flag, at the damage roll | the attacker whose feature rode. The rider's damage is in the receipt; the use it spent is the `poolSpend` state record; Frost's Chill's effect is an `effectReceipt` record on the same card |
| `diceChange` (a damage message) — `actorUuid`, `attackId`, `status`, `total`, and `rows: [{key, feature, kind, status, …}]`, a used row carrying `formula`/`first`/`second`/`stands` (a set or one die) or `picks` (Empowered), with `delta`, `before`, `after`: the dice changers (2026-09-27; `either` from Slice A and `empowered` from 2026-09-09 before it, no longer written) | per flag, at the birth (`preRollDamage`, the roller's client) | the attacker or caster whose feature it is. The moved damage, if any was applied before the answer, is its own `receipt` entry |
| `fightingStyle` (a damage message) — `styles: [{key, feature, gain, raised?, note?, off?}]`, `gain` (the total), `dice: [{faces, v, was?}]` (the chips the card and the canvas show, when a style changed the roll): a Fighting Style's number that rode the roll — Great Weapon Fighting's raised faces (`raised: [{from, to}]`), Thrown's and Dueling's +2, Two-Weapon's modifier; an `off` entry (Dueling off — two hands) has `gain` 0 (2026-09-26) | per flag, at the birth (`preRollDamage`), the floor's count at `preCreateChatMessage` | the attacker whose style it is. The number is inside the roll's total already — the receipt carries the damage; `gain` is what the style ADDED |
| `grappleDamage` (Unarmed Fighting's turn-start card) — `actorUuid`, `candidates: [{uuid, name, certain}]`, `pick`, `answer` (`deal`/`skip`), `timedOut` (2026-09-26) | per flag, at the turn start (the elect) | the grappler. The 1d4 itself is the Grappled Damage activity's own card and receipt |
| `emanationCard` (the aura's card, posted again each time the emanation stands) — `key`, `verb`, `range`, `regionId`, and where the aura offers a damage type `types`, `damageType`, `chosen` | per flag, at the post | the emanation's owner. A reader names the aura once; the reposts are bookkeeping, not play |

**`castApply.choice` is unstamped by ruling** (owner, 2026-09-23). The caster's pick between
alternative effects (Fire Shield's warm or chill) is a decision, not a consequence. What it picks
is stamped where it lands, in `effectReceipt`; stamping the pick as well would count it twice.

**The second-pass fields:**

- **`receipt` entries carry `parts: [{type, amount}]`** — per-part POST-trait amounts from
  `calculateDamage`, recorded VERBATIM, so a part can be FRACTIONAL (9 under resistance is 4.5 —
  measured by the stats reader, 2026-08-27); flooring and clamping live in `taken` and `delta`.
  `parts` are authoritative for by-type arithmetic; the entry's `multiplier` annotates the same
  halving for the card's sentence, never double-applied. The message's rolls stay the
  pre-mitigation side. Healing-typed parts arrive negated, same sign as `taken`. **`traits[]` is
  read net of the caller's multiplier** (v2.0.7, 2026-09-24): a halved save is not a resistance;
  rows stamped before v2.0.7 carry the old labels.
- **`answeredAt` on every moment answer** (buzzer answers included): with the flag's
  `deadline`/`window`, decision latency under the clock is arithmetic.
- **`holdSkipped`** — `targets: [{uuid, name, reaction}]` — the holds the futile-skip gate
  DECLINED to offer, the only record of "Shield could not have mattered".
- **`combatRoster`** — the turn→actor map that outlives encounter deletion: a static combatant
  snapshot (actorUuid = the token-synthetic identity, tokenId, name, initiative, isPC) at
  combatStart, closed with `endedRound` at deletion. ⚠ STATIC BY RULING — nothing here may grow
  turn tracking, timers or expiry sweeps (DESIGN §8 *Short-duration effect expiry*). Late joiners
  are seen through their `rollCtx` stamps.
- **A `saves` flag may be BORN `status: "done"` with zero targets** (user ruling, 2026-08-28): an
  instantaneous area placed on NOBODY is spent at the stamp — no save, no clock, no damage, the
  area swept at once. Duration areas keep their clockless wait, and a bare cast (`contained` null,
  not empty) still waits for adoption.

**No post-hoc stamper.** A listener stamping whatever flags appear would re-derive context after
the consequence — the drift this plane exists to prevent — and could not stamp per entry. **Any
new consequence writer spreads `statContext` at its write site, and its flag joins the table
above.**

The `spend` stamp (resources.js) is the plane's one write of its own: the ELECT stamps qualifying
usage messages at creation — recovery-rhythm pools (`rows`) and spell slots (`slots`),
player-owned actors only, **ungated by any setting** (a toggle would punch silent holes in the
ledger). No render-resume on purpose: a late stamp would carry NOW's turn on last week's spend;
the reader falls back to the message's own `system.deltas`.

---

## 5. The moment spine (N3)

A **moment** is any point where the module must show the table something and possibly take an
answer. Every moment — a reaction hold, a save demand, a mastery ask, a damage offer, a volley
aim — is the same six-step shape:

```
  STAMP ──► ROUTE ──► PRESENT ──► ANSWER ──► RESOLVE ──► EXPIRE
    │          │          │          │          │           │
  flag on   who may    popup +    the answer  consequence  the default
  a message  answer     card bar   channels   + receipt    outcome fires
```

### The mandate

> **No moment machine may hand-roll stamp, route, present, answer, resolve or expire.**
> New machines **compose** the spine. A new primitive is added only when a genuinely new KIND
> of surface behaviour appears — R4 applied to UI.

A copied idiom drifts; composing is how the laws below hold.

### The presentation laws

Each was a user ruling, and each has a table finding behind it.

1. **The popup law.** Easy-to-forget moments get a popup, not just a card.
2. **The pairing rule.** Whenever a popup runs a timer, a **public card** runs the same bar off
   the same deadline — *the popup is for the decider, the card is for the table*. No timed
   popup without its card; no card bar frozen while the popup drains.
3. **Acknowledge resolves.** Any notice button press resolves its card's pending presentation —
   bar gone, recall gone, popup gone.
4. **A popup closes when its question is withdrawn.** A popup asking something the machine has
   already answered is a lie on screen. Every client closes it through `closePopup` (*The pending row*).
5. **Declaration never claims an outcome.** Buttons and cards at decision time state the
   *spend* or the *choice*; only the verdict's settle card states results. (A post-verdict
   choice may state knowns — "Take half" is legal once the save is in.)
6. **Source, then result.** Every follow-up line leads with the ability that caused it.
7. **The stack is a queue in event order.** Concurrent popups form a staircase from a common
   anchor, and **z-order is rank, then causal order** — within a class the first moment stays
   in front, so the player clicks through in the order things happened.
   - **The rank (user ruling 2026-09-13).** Windows born of ONE hit front by CLASS first — the
     damage prompt, then the weapon's mastery (the ask, the notice, the Topple demand), then a
     listed carrier's offer on the hit (the bash, the hew, Commander's Strike, the Riposte), then
     everything else — and by event order within a class. `POPUP_RANK` in
     [decide/present.js](scripts/decide/present.js), keyed by the popup key's sub; a new moment
     is unranked (last) until it is ruled into a class. Staircase POSITIONS stay in event order.
   - **The hit's sequence (the same ruling: *"damage, nothing until damage. then mastery rider.
     then other stuff."*).** A hit's offer is stamped QUEUED at the hit (a quiet row, no clock,
     no popup) and PROMOTED to pending from the damage chokepoint (auto-apply.js
     `resolveDamagePayouts`, after the mastery rider) once the damage has landed and the
     mastery's DECISION, if it asked one (Slow, Topple, Push), is answered; the clock starts at
     the promotion. A mastery NOTICE (Vex, Sap, Cleave) does not hold it. Nobody left standing
     resolves the offer moot. Pure: [decide/sequence.js](scripts/decide/sequence.js)
     `hitOfferStep`. This orders ONE hit's own consequences; the cross-machine modal sequence
     stays parked (BACKLOG *The modal sequence*).
   - **The one exception: several moments about ONE ROLL present as ONE WINDOW** (the rescue
     view — *this roll is short by N; spend a feature to rescue it?*). `registerRescue` merges the VIEW while
     the flags stay separate (R2), so it costs no wire format. Moments about different rolls, or
     different questions about one roll, still staircase: the test is whether one answer could
     serve them — a rescue window has one "Accept the roll" (the `pass` action), and it answers every source.
8. **The rule line is the book's.** A popup describing a feature shows that feature's own 2024
   text, read from the compendium at render time (N1; RULINGS *The rule fold reads the book*): a
   row's `rule` is a pointer (`{ item, uuid, benefit? }` or `{ page, key, benefit? }`), and
   [rule-text.js](scripts/rule-text.js) fills it with the paragraph the row names, else the whole
   text. No rule is copied into the code; `tools/check-identifiers.mjs` proves every pointer. The
   module's operational hints ride as separate lines, never blended into the quote.
9. **Every icon names itself.** Any icon in a card or popup carries a tooltip naming what it
   depicts (N3).
10. **The moment celebrates.** An attack-damage prompt leads with the hit — "You hit! — roll
    damage" — and a crit says so, loudly and once. A prompt with no attack roll behind it keeps
    its own stakes line instead. New players learn the chain from what the module tells them
    (N3).
11. **Every moment has a clock that RESOLVES it at expiry** — pass for decisions, roll for
    demanded saves, dismiss for reminders. A moment waits forever only by explicit setting.
12. **A moment never takes the keyboard (2026-09-23).** A popup opened by someone else's roll
    hands the focus back to wherever it was (NOTES §1 *A dialog's DEFAULT button takes the
    keyboard*). One home, `openManagedPopup` (`returnTheKeyboard`, ui.js); a moment is answered
    with the pointer. The system's own roll dialogs keep Enter — the roller opened them.

### Timer mechanics

The **continuing client** owns the one authoritative clock; the deadline is **absolute and
lives on the flag**, so every client derives the same remaining time. Countdown visuals set an
animation's `currentTime` from that deadline, never a CSS animation delay (NOTES §1).

**Waiting for a write is `waitForWrite`** ([ui.js](scripts/ui.js)): a card another client is
about to post, a roll this client posts a beat later, a reaction's AC arriving on its actor. The
test runs at once, then after each write of the kinds it names (a message's create or update by
default; an effect's or an actor's on request), and the wait answers null at its limit. Nothing in
the module polls on a timer. A clock is armed through `armAskTimer` with its owner named (§3 *The
clocks*; `npm run clocks`); `armDeadline` beneath it is the one `setTimeout` on a deadline, and it refuses
one past `deadlineIsLive`'s roof.

### The pending row

A pending moment's card row is drawn by one helper, `pendingRow(message, row, { bar, latch, answer, arm })`
in [ui.js](scripts/ui.js), always in one order: the **bar** off the flag's deadline (law 2's card half,
synced, so it drains), the **latch** — the popup shown once per client, `{ sub, show }` latched on its popup
key, so a re-render never reopens a popup the player closed (several for a row that asks several deciders) —
the **answer**, the button that calls a closed popup back ("Answer", or the row's own words: "Roll",
"Pick the form"), and the **arm**, the machine's own clock function, whose `armAskTimer` call names its
owner (§3 *The clocks*). The machine says which parts its row has and who may answer (a falsy part is
not drawn: `may && …`); how they look and when they run is the spine's. `forgetShown(message, sub)`
releases a latch where a machine means the popup to come back: the next queued concentration ask, a save
entry dropped from the demand, a recall that re-arms it.

A machine never holds the popup registry (`livePopups`): it names a popup by its message and sub. A
withdrawn question (law 4) closes through `closePopup(message, sub)`, which awaits the close and swallows a
dialog already gone (`sub` may be a test over the message's open popups: a save entry dropped from the demand
closes every popup it asked); an opener that rides the system's own dialog (the roll dialog a save or Topple
rides) asks `frontPopup(message, sub)` first, which brings an open one forward and answers whether there was one,
as `openMomentPopup` does for the rest. **The static proof is `npm run popups`**
([tools/check-popups.mjs](tools/check-popups.mjs)): outside ui.js nothing touches the latch set, no
`momentButton` is labelled "Answer", every row's `arm` arms through `armAskTimer`, nothing reads
`livePopups`, nothing closes a dialog it was not handed (a render hook's app, `this`), and nothing builds a
dialog of its own (*The popup*, below). `--list` prints every row and every pin.

### The popup — one door to a DialogV2

Every popup the module opens is `openMomentPopup(message, sub, subject, { title, icon, width, content, buttons,
autoCloseAt, gate, onDismiss, buzzer })` in [ui.js](scripts/ui.js): the `canAnswerFor` gate (`gate: false` for a
popup on the client that acted: the attacker's damage, the caster's volley, the gear light's toggle), an open one
fronted instead of a second, the cascade and the keyboard handed back (`openManagedPopup`, law 12), the registry
`closePopup` reads. `message` is the card, or the id a popup with no card is keyed by (the gear light's item, the
party view). Two options carry what a dialog built by hand used to wire itself:

- **`onDismiss(dialog)`** runs once when the dialog closes unanswered — the X, Escape, the autoclose, the buzzer, a
  close from elsewhere; a button's press is an answer, which DialogV2 closes `submitted` — or never opens (a
  failed render). It runs before the dialog's own close, so it may read what the dialog holds: the volley fires
  as aimed, the damage offer rolls (dismissing is not a veto).
- **`buzzer: { at, fire }`** is the popup's own clock on the client that opened it: at the absolute deadline `at`
  the dialog closes (a dismissal) and `fire` runs; any close disarms it. ⚠ Not re-armed on a reload: a moment
  whose clock must outlive the client arms through `armAskTimer` (§3 *The clocks*).

A yes or no the player's own action raises (a cast the module takes past dnd5e's dialog, a companion's effect
removed) is `confirmPopup(message, sub, { title, icon, content })`: Yes and No, No the default, null when it closes
unanswered or is already open. **The static proof is `npm run popups`** rule 6: outside ui.js nothing reaches
`foundry.applications.api.DialogV2` (built, or its `confirm`, `prompt`, `wait`) and nothing calls
`openManagedPopup`.

### The card — one envelope, the recipients named

The card is the bus (§7): every card the module posts goes out through `postCard({ actor, token, alias, speaker,
card, flags, rolls, to })` in [ui.js](scripts/ui.js), beside the relay whose answers ride cards. It builds the
envelope in one order: the speaker (the platform's `getSpeaker` for an `actor` or a `token`, a null actor
included; else an `alias`, the module speaking as `TITLE`; else a stored `speaker`; else none), the content, the
flags as written, the rolls, and `to`, the recipients. A relay's answer is `postAnswer` (§4 *The relay*).

**The recipients are named sets, in [core.js](scripts/core.js)** — the leaf where who-does-what lives and the
one file every other file can import (its own no-GM notice, which cannot import the spine, uses them too):
`gmIds()`, `selfIds()` (a note to self, or an envelope only its fold reads), `selfAndGmIds()`,
`ownersAndGmIds(actor)`. A card with none is public.

**The static proof is `npm run cards`** ([tools/check-cards.mjs](tools/check-cards.mjs)): `ChatMessage.create` only
inside `postCard`, else pinned in `RAW` by file and function with its reason (core.js's no-GM notice; the deferred
usage card, which is dnd5e's own card data held whole); a `whisper` property only in ui.js; no
`game.users.filter(…).map(u => u.id)` and no `[game.user.id]` outside core.js; every `postAnswer` names an envelope a
relay registers and posts it; a `postCard` carrying a registered envelope fails (`respondsTo` aside: on a changed
roll's card it points at the roll it changed). `--list` prints every site.

### The pick — one input, one reader, one choice

A pick's radio or checkbox is drawn by `pickInputHTML({ kind, name, value, checked, disabled, data, style })` in
[decide/present.js](scripts/decide/present.js), and every pick row and box there is built on it (`tickRowsHTML`,
the Sneak Attack and buy boxes, the offer's menus). Its inputs are read in [ui.js](scripts/ui.js), by name:
`picked(root, name)` (the checked radio's value), `pickedAll(root, name)` (the ticks), `pickInputs(root, name,
value?)` (the inputs, to wire or to cap), `pickInputAt(target, name)` (the input an event landed on).

**A bystander's choice is `choicePopup(message, sub, subject, { name, rows, mutes, answer, … })`** (ui.js): the rows
as radios, "Pass just this time" checked, the mutes after it (`choiceRows`, decide/present.js), one button,
Apply; `answer` hears the checked row's key (`pass`, `mute-<until>`, or a row's own). A creature pick is gallery.js
`openPicker`'s (RULINGS *Summons*).

**The static proof is `npm run pickers`** ([tools/check-pickers.mjs](tools/check-pickers.mjs)), over every file: no
`<input type="radio|checkbox">` outside decide/present.js, no `input[name=…]` selector and no `:checked` outside
ui.js, no radio tick rows built into a popup by hand and the pass row's words nowhere but `choiceRows`; and in
the creature-picker machines, no popup and no reach into gallery.js's rows.

---

## 6. The registry model (R4)

### Why registries, and why they are finite

The argument for curated lists over a general engine rests on one measurable fact: **every axis
of 5e's combat mechanics, as the system models it, is a closed enumerated set.** Measured
against this world's premium packs (PHB / MM / DMG / Heroes of Faerûn — 2,768 items, 411
spells; SRD excluded) with the `tools/scan-*.mjs` censuses, by 2026-08-22:

| Axis | Size | The set |
| --- | --- | --- |
| Activity types | **12** | attack · save · damage · heal · utility · check · cast · summon · enchant · transform · forward · *(none)* |
| Activation types | **14** | action · bonus · reaction · special · legendary · turnStart · turnEnd · encounter · minute · hour · day · shortRest · longRest · *(none)* |
| Damage types | **13** | + healing/temphp/max as roll kinds |
| Save abilities | **6** | dex 203 · con 183 · wis 155 · str 54 · cha 25 · int 15 |
| Damage-on-save | **3** | half (411) · none (205) · full (18) |
| Conditions | **26** | the system's `conditionTypes` |
| Weapon masteries | **8** | cleave · graze · nick · push · sap · slow · topple · vex |
| Template shapes | **9** | sphere · radius · cube · cylinder · cone · line · wall · square · circle |
| Target-affects kinds | **8** | creature · space · self · willing · object · creatureOrObject · any · ally |
| Consumption kinds | **5** | itemUses · activityUses · spellSlots · attribute · hitDice |
| Recovery periods | **9** | lr · dawn · sr · day · dusk · recharge · turn · turnStart · initiative |
| **Reaction-cost items** | **93 unique** (102 activities) | 85 feats · 10 equipment · 4 weapons · 3 spells |

Those are the KINDS the code is allowed to know about. Everything else — *which* ability, *how
much* — is data (R4). **A registry cannot become a platform, because the axes it keys on cannot
grow without a system release.** The reaction number is the proof case: 93 items, of which only
a small fraction are *interrupts* (they change an attack already rolled) and need a pause at all.

### The kinds the code knows — the R4 tripwire

Declared once in [decide/registry.js](scripts/decide/registry.js) as `KIND_SETS`, printed by
`npm run registry` (inside `npm run verify`), and **pinned**: adding a kind fails the gate until
the pin moves deliberately. As printed on 2026-09-24:

| Set | Kinds | Against | The kinds |
| --- | --- | --- | --- |
| interrupt | 3 | module-owned | ac · damage · roll (Slice A, 2026-09-24: Disadvantage after the hit — Lucky, Warding Flare, Shadowy Dodge) |
| maneuverFold | 6 | module-owned | precision · riposte · interpose · bash · hew · command |
| d20Fold | 4 | module-owned | heroic · tactical · bardic · seeking |
| volley | 2 | module-owned | damage · attack |
| mastery | 7 | **of the system's 8** | vex · sap · cleave · slow · topple · push · graze |
| reminder | 7 | module-owned | vex · sap · prone · condition · range · effect · sneak |
| emanation | 2 | module-owned | feature · spell |
| **total** | **31** | pinned in `check-registry.mjs` | |

Quote the tool's table, never this one.

**Lift the mechanism first; the kinds are the residue.** A kind names only what genuinely
differs between features — for the d20 folds, **the spend** (a boolean write, an
`activity.use()`, an effect delete). The arithmetic they share lives in
`ATTACK_FOLDS`/`SAVE_FOLDS` and needs no kind.

**Only masteries are checkable against a system enum** (`CONFIG.DND5E.weaponMasteries`, whose
rules pages the mastery rows point at); the other sets are the module's own
inventions. The static gate proves each set is **closed, declared in one place, and that every
registry entry names a kind from it**.

**The fold contribution shapes (`ac` / `add` / `replace` / `verdict`) are not an R4 kind set.**
R4 counts kinds of CONTENT; a contribution shape is mechanism vocabulary, and a fifth would change
what "a fold" means.

⚠ `nick` is **deliberately** native (pure action economy) and *declared* as such
(`MASTERY_NATIVE`), so a ninth mastery arriving in a dnd5e release warns once instead of falling
through a bare `default: return`. Never leave a closed switch's default silent.

### Registry rules

1. **A registry is name-keyed and membership-defining.** Listed means it participates; unlisted
   means it never does. Structural detection from content data is **not** membership — it is
   wrong in both directions (a premium spell ships no count field at all; a teleport spell ships
   a count that would volley-pop its mishap damage).
2. **Entries hold handling, not amounts.** A `kind` naming which machine owns it, plus whatever
   per-entry resolvers that kind genuinely needs. Never a number.
3. **Entries may carry a resolver function** when the rule is per-ability (a projectile count
   that bands by character level). A resolver reads content and returns a value; it never
   writes and never decides policy.
4. **Adding an ability is one entry and zero code.** If it is not, the KIND is missing — add
   the kind deliberately, and count it against the R4 tripwire.
5. **Registries are exposed read-only on the module API** so tooling and suites can inspect
   them. That is inspection, not an extension point (DESIGN §4).
6. **A kind list names only kinds from its closed set**; `tools/check-registry.mjs` fails the
   build otherwise.
7. **Name the precedent row first** (user, 2026-09-24, Slice A's switch). Before a new ability
   picks a table or a kind, name the existing row it most resembles; a row that fits by shape
   is a row there, and the vocabulary grows beside it (RULINGS *Slice A*).

### The table words Slice A added (2026-09-24)

Vocabulary on tables that existed — no kind moved but `roll` (§6's tripwire). Each word is
documented at its table's head in [decide/registry.js](scripts/decide/registry.js); this is the index.

| Table | Word | What it says |
| --- | --- | --- |
| `EFFECT_BENDS` | `match: "feature"` + `saves` | a feature row the SAVE gate now reads too (it read effects only): Brave, Fey Ancestry, Dwarven Resilience. One carrier test for the three readers (`decide/reminders.js` `rowCarriers`) |
| `INTERRUPT_REDUCTIONS` | `eyebrow` · `spend` · `hit` · `by` | a reduction row's voice — the family word, what one use is called, the trigger, the reduction in words — stamped on the hold flag with `maneuver` (eyebrow is "Maneuver"). Stone's Endurance's `activity` falls back to the first heal activity with an EMPTY stored name (locale-proof) |
| `INTERRUPT_ROLLS` (new, the `roll` kind's rows) | `reaction` · `uses` · `point` · `activity` · `after` | the cost shapes of Lucky, Warding Flare, Shadowy Dodge; the answering activity (a sheet use answers the hold); a card line for what the rule leaves to the table |
| `HIT_GROUPS` | `pool: "option"` · `feature: null` · `eyebrow` · `heading` · `per` | a group whose options each pay from their OWN item uses; a group with no feature to require; the card's family word and the offer line's voice |
| `HIT_OPTIONS` | `press` · `maxSize` · `clock` | a status pressed with no save (receipted, never over one standing); the largest size reached, read off the hit target's sheet (an unreadable size never greys); a `CHIP_WINDOWS` key for the option's effects — the shared path's, no option uses it today |
| `CLOCK_RIDERS` | `when: "any"` · `uses` off the ITEM · `effects` · `clock` · `label` | every hit, uses permitting; the uses read off the activity, else the item its consumption names, spent where they live (`decide/clock.js` `riderUsesFrom`); the activity's own effects on the hit, clocked to the attacker; the name the offer and card use |
| `DAMAGE_EITHER` (new) | `key` · `weapon` | Savage Attacker's once-per-turn chit key and its weapon-only clause. Not a kind: one machine, rows of data |

### The table words the spells slice added (2026-09-28)

One kind moved (`repeatSave`, three triggers — §6's tripwire 35 → 38); the rest is vocabulary on
tables that existed, plus one new table that is not a kind.

| Table | Word | What it says |
| --- | --- | --- |
| `EFFECT_BENDS` | `saves.abilities` | the facet scoped by the save's own ability (Irresistible Dance's Dexterity); the demand carries `abilities` since this slice (`saves/demand.js`), and a repeat's demand carries its own `bend` (`decide/reminders.js` `demandBendSources`) |
| `HEAL_REROLLS` | `effect` · `max` | a row on the HEALED creature: healing the cast path lands is the roll's maximum while the effect stands (Beacon of Hope; `decide/damage-dice.js` `rollMaximum`) |
| `SAVE_PRESSES` | `word` | a press behind the caster's word — the options, the one that presses, the clock's default; a third save-choice kind, `word` (`saves/choices.js`) |
| `REPEAT_SAVES` (new, the `repeatSave` kind's rows) | `effect` · `on` · `advantage` · `onSave` · `count` · `caveat` | a landed effect's repeated save: which effect(s), what raises it, the trigger with Advantage, the repeat's own damage-on-save, the tally that ends or locks or presses, the clause the table plays |
| `TURN_GRANTS` (new) | `effect` · `activity` · `on` | a landed effect's turn-start grant rolled again on the caster (Heroism). Not a kind: one machine, rows of data |

The GM's side (RULINGS *The GM's side — the five shapes*, 2026-09-28 night) added facets, no kinds:

| Table | Word | What it says |
| --- | --- | --- |
| `DROP_TO_ONE` | `save` · `on: "died"` | the victim's side: held at 1 while the bearer's save rolls on the keeper, the DC from the damage, the exemptions off the damage card (Undead Fortitude); the death's side: a landed 0 uses the trait's save at the corpse against every creature in its Emanation, one demand card (Death Throes) — `drop-to-one.js`, `dnd5e.applyDamage` after the write |
| `EFFECT_BENDS` | `saves.succeeds` with `spells` | the save against magic cannot fail (Greater Magic Resistance) — Trance's `succeeds` generalised from the sleep branch |
| `EVASIONS` (was `EVASION`) | `ability` | Evasion's shape as a table: a row per feature, `ability` null reaching every save (Avoidance); the entry stamps `evasionBy` |
| `TURN_GRANTS` | `match: "feature"` · `while` · `unless.damagedBy` | the bearer's own trait's heal at its turn start, rolled on its numbers (Regeneration); the block read off the bearer's copy against the receipts since its last turn |
| — | Legendary Resistance | NOT a row: the platform's `resistSave` and the saves machine's `forced` flip already are it |
| `EMANATIONS` | `trigger.on: "turnStart"` · `trigger.types` | the third trigger word (a monster's "any creature that starts its turn in"), on the region behaviour's `tokenTurnStart`; a row with no standing effect lets the verdict land the activity's failure effect; `types` narrows the asked to creature types (Vile Appearance). Five aura rows and Aura of Authority (RULINGS *The GM's side — the aura rows and the attack bends*) |
| `EFFECT_BENDS` | `judge: "notIncapacitated"` | the bearer's Incapacitated status turns the row off (Displacement, Blurred Form) |
| `INTERRUPT_REDUCTIONS` | `ranged` | a reduction held on RANGED hits only (Deflect Missile); the hold's trigger reads the attack's mode, else its activity's type |
| `REBUKES` | `on: "miss"` · `types` · `self` | a rebuke on a melee weapon attack that MISSED the bearer, stamped by the elect off the attack card (Sticky Shield); the damage's types the row answers to, an unreadable card counting (Elemental Absorption); a row aimed at nobody, no reach measured (Ink Cloud) |
| `REACTION_RESETS` (new) | `every: "turn"` | the Reaction back on every turn of combat (Reactive) — the chip's arithmetic in `decide/chips.js` `reactionStandsEveryTurn` |

The Monster Manual's waiting rows (RULINGS *The Monster Manual — the waiting rows built*, 2026-09-28 night) added facets and one table, no kinds:

| Table | Word | What it says |
| --- | --- | --- |
| `REPEAT_SAVES` | `count.swap` | the pressed status REPLACES the effect (the medusa's Petrified instead of Restrained); a monster's own activity is the same row keyed by the trait, the demand marked not a spell |
| `TURN_GRANTS` | `deals` · `on: "turnEnd"` · `deals: "grappled"` | a damage instead of a heal, on the bearer of the effect at its turn start or end (the grappled creature's), rolled on the origin's numbers; a feature row's damage to what the bearer grapples (`geometry.js` `grappledBy`, Unarmed Fighting's finder shared) |
| `EMANATIONS` | `pulse.activity: null` · `alert.on: "turnStart"` | the pulse off the first damage activity (the fire auras); the turn-start region event raises alerts (Unnerving Gaze) |
| `CLOCK_RIDERS` | `self` · `random` | the rider is the attack's own item, due on that attack alone; one of its numbered effects by the die, when the damage lands (`effect-riders.js` `applyActivityEffectsOnHit` takes an `only` pick and returns what landed) |
| `DRAINS` (new; `drains.js`, `decide/drains.js`) | `what` · `type` · `ability` · `amount: "text"` | Vampiric Touch's seam: the target's maximum lowered by what landed (the module's `hp.tempmax` effect, one copy refreshed), or a score by the text's die (the pack's own effect). Not a kind |
| `DROP_TO_ONE` | `notice` | a died row with no activity: the card says the GM's move |
| `REST_GRANTS` | `block` · `effect` | the rest grants nothing while the pack's Cursed from this item stands: the rest result's update and item updates emptied at `preRestCompleted`, the `restBlock` line |
| `DAMAGE_SHIELDS` | `match: "feature"` · `range` | the defender's own trait strikes, its first damage activity; the reach where the activity carries none |
| `EFFECT_BENDS` | `attack` · `judge: "targetInSpace"` | the attack's own item is the carrier (`scope.item`); the target's footprint overlaps the attacker's (`geometry.js` `tokensOverlap`, `decide/geometry.js` `rectsOverlap`) |
| `DUPLICATES` | `match: "feature"` · `only: "rangedSpellAttack"` · `reflectAt` | the defender's own trait as one duplicate never destroyed, for the hits the row names (`hold/lookup.js` `attackFactsOf`); the face that also reflects |

Tier 3 (the same day, ruled off `prototypes/spells-slice.html`) moved one more kind — `area` on the
emanations (§6's tripwire 38 → 39) — and added two tables that are not kinds:

| Table | Word | What it says |
| --- | --- | --- |
| `EMANATIONS` | `kind: "area"` | the system's template adopted where it was PLACED, attached to nothing (Moonbeam, Insect Plague, Cloudkill, Cloud of Daggers); the caster drags it, the platform raises the entry; an `area` whose activity is plain damage rolls it on the caster and applies it (`emanations.js` `triggerDamage`). An adopted emanation's cast asks once: later arrivals are the region's, never the cast's (`saves/areas.js`), and an emanation placed with nobody inside owes nothing at the cast (`saves/demand.js`) |
| `WARDS` (new) | `effect` · `activity` · `gates` · `endsOn` | a standing effect whose bearer makes whoever targets it save FIRST — vetoed at `dnd5e.preRollAttack` / `dnd5e.preUseActivity`, demanded of the attacker, the use made again on a pass with the first press's dialog choice (`wards.js`, Sanctuary); what the bearer does that ends it. Found by the effect's name and origin (`repeatRowFor`) |
| `DUPLICATES` (new) | `effect` · `die` · `at` · `seesThrough` | a hit that stands after the defender's reactions rolled against the standing duplicates on the hold (`hold/trigger.js` stamps the entry — answered by the machine when nothing else asks; `hold/continue.js` rolls; `hold/views.js`, `hold/dice.js` show); an absorbed hit is a forced `verdict: "absorbed"` on the attack (`decide/verdict.js`); the destroyed duplicate is landed by the defender's driver (Mirror Image) |

The held spells (the same evening; RULINGS *The spells slice — the held spells*) moved no kind: three
tables that are not kinds and vocabulary on two that exist.

| Table | Word | What it says |
| --- | --- | --- |
| `DAMAGE_SHARES` (new) | `effect` · `share` · `within` · `endsAt` | a standing effect whose caster takes what its bearer takes (Warding Bond), read on `dnd5e.applyDamage` — the amount that landed, applied untyped within the reach, the caster's drop to 0 ending it (`damage-shares.js`). Not a kind: one machine, rows of data |
| `HEAL_ON_HIT` (new) | `share` · `type` | a spell whose landed damage heals its caster a share of the named type (Vampiric Touch), read on the same seam off the dealing card's activity (`heal-on-hit.js`). Not a kind |
| `RAY_TABLES` (new) | `die` · `cast` · `twice` · `rays` | a cone whose die per creature picks its ray (Prismatic Spray): the cast's demand closed at birth, a demand per (creature, ray) with the ray's type forced or its own save, a condition ray's effect landed by the machine (`prismatic.js`). Not a kind |
| `REPEAT_SAVES` | `item` · `activity` | a second row on one spell, naming the spell; the save by name where the spell's first is not the repeat's (Prismatic Spray's indigo ray) |
| `EMANATIONS` | `trigger.on: "move"` · `per` · `band` · `ask` · `gate` · `alert.on: "moveOut"` · `alert.kind: "notice"` · `alert.types` · `noCastSave` | the `area` kind's held-spell facets: damage per feet moved inside (Spike Growth); a burning band on one side of a wall, flipped on the card (Wall of Fire); a pick asked on the card and kept on the region (Magic Circle's types); the attack gate reading the area (the circle's Disadvantage); a notice as a creature moves out, a plain card with no Reaction (Forcecage, the circle's entry), narrowed to the chosen types; a cast whose save is not for standing inside |

The PHB classes (2026-09-29/30; RULINGS *The PHB classes — A1* … *B1*) moved one kind — `reroll` on the d20 folds
(§6's tripwire 39 → 40, B1: a failed save rerolled with a bonus added, paid by a use or a Rage's once — the new d20
REPLACES and the bonus ADDS in one `SAVE_FOLDS` entry) — and added tables that are not kinds (`WARD_POOLS`,
`INITIATIVE_GRANTS`, `TURN_GRANTS`, `CAST_RIDERS`, `STORED_DICE`, `REROLLS`) plus bystander vocabulary on
`INTERRUPT_ROLLS` (`bend: "die" | "neutralise" | "set" | "reroll"`, `bystander`, `against`, `advantage`; `damage` + `verb` — the die off an attack's damage, asked as a guard of the damage hold, RULINGS *The asks widened*).

### How a row names its content

A row is keyed by its content's English name, and it FINDS the content by dnd5e's
`system.identifier`: stamped at creation, indexed by the system, kept through a rename (a
statblock's "Heat Metal - Spellcasting" is `heat-metal`). `identifierOf(name)` in
[decide/registry.js](scripts/decide/registry.js) is the slug the packs give a name, `ALIASES` the
rows where it is not; `matchOf` answers identifier first, then the name. On an actor,
[lookup.js](scripts/lookup.js) `itemsNamed` / `itemNamed` / `featureNamed` return identifier
matches first, a 2024 copy before a 2014 one, and warn once when only the name matched. For an
item in hand, `tableIndex(T).rowFor(item)`. A decide/ function that compares names gets the sheet
in the table's words from `namesAnswering(items, keys)` — the decision layer imports nothing.
Where one name is several things (Shield is a spell, a monster feat and armor), the lookup is
scoped by item type. ActiveEffects and activities carry no identifier and stay matched by name,
as does a name read back off a chat flag. `tools/check-identifiers.mjs` proves every row against
the packs' snapshot.

### The tables are the only list

Membership lives in code, never in a world setting. A table's rows are its members; a **kind list**
(`INTERRUPTS`, `BLOCKS`, `MANEUVER_FOLDS`, `D20_FOLDS`, `RIDERS`, `RIDER_UPGRADES` in
[decide/registry.js](scripts/decide/registry.js)) names which content takes which kind where the
kind's own table does not. The readers (`interruptEntries()` and the rest) hand out fresh copies,
so no caller can edit a table.

---

## 7. Module layout and dependency rules

`scripts/bythebooks.js` is the only `esmodules` entry; it imports its siblings in a deliberate
order. Plain ES modules, no build step.

**`scripts/decide/` — the pure layer, and what each module holds.** ⚠ **It has ZERO imports**,
across every module: not core.js, not a machine, not the spine — asserted by `npm run layers`.
That is what makes it testable in milliseconds and impossible to tangle. The day something in
there needs `game` or `canvas`, it is EDGE and belongs one layer up (§2 rule 1).

| Module | Holds |
| --- | --- |
| [decide/geometry.js](scripts/decide/geometry.js) | `regionShapeTypeFor` (the placement's map: rect → rectangle, ray → line, radius → emanation), `emanationShapeData` (the platform's own emanation shape around a token, byte-for-byte), `tokenCenter`, `tokenSamplePoints`; `lengthUnitKey` — a scene's units folded to the system's keys |
| [decide/registry.js](scripts/decide/registry.js) | the kind lists and every table's reader; the closed kind sets and the R4 tripwire; `MASTERY_RULES`, `CONDITION_BENDS`, `SAVE_BENDS`, `RANGE_RULES` and `EFFECT_BENDS` — the rules text, the condition table (attacks) and the save table (saves), the range sentences and the effect table (seventy-odd abilities by name, from a compendium scan), as data; `SNEAK_ATTACK`, `CUNNING_OPTIONS`, `DEATH_STRIKE` — the Sneak Attack flow's data, each option naming the feature that grants it; `HIT_GROUPS`, `HIT_OPTIONS` — the hit menu's groups (the feature that pays) and rows (the Battle Master's on-hit maneuvers); `CLOCK_RIDERS` — the features whose extra damage rides the combat clock; `USE_CHIPS`, `SAVE_PRESSES`, `EVASIONS` — the text-only feature that becomes a chip on use, the save whose failure presses a status, the verdict outcome (Evasion on Dexterity, Avoidance on every save); `INTERRUPT_MULTIPLIERS` — the damage interrupts the module settles itself (Uncanny Dodge ×0.5); `INTERRUPT_REDUCTIONS` — the ones that reduce by a roll (Parry, Stone's Endurance); `INTERRUPT_ROLLS` — the `roll` kind's cost shapes (Lucky, Warding Flare, Shadowy Dodge); `DAMAGE_EITHER` — the damage dice rolled twice (Savage Attacker); `CHOSEN_AREAS` — the area spells whose caster chooses who they affect (by name — the pack's own choose flag covers four of the seven); `tableIndex(table, keyOf)` — a name-keyed table's closed name set and its row-by-name (the `*_NAMES` sets derive through it, **the keys unchanged**) |
| [decide/chips.js](scripts/decide/chips.js) | `CHIP_WINDOWS`, `TURN_CHITS`, `chipClock`, `chipIsDead`, `chitStamp`, `chipSpentBy`, `chipHonoured`, `netShownFor`, `spendRecord` — a chip's clock, and what spends it; the once-per-turn chits (Cleave, Sneak Attack, a clock rider) share one shape |
| [decide/reminders.js](scripts/decide/reminders.js) | `netMode`, `resolutionLine`, `proneSources`, `conditionSources` (over the registry's table), `saveSources` / `saveGate` (over the save table: a bend, or a save that cannot succeed — the net `fails`), `rangeSources`, `effectSources` (over the effect table: scope, caveat, listed or counted, judged — the combat clock and the map's ally-beside-the-target included, spent), `effectCheckSources` (an effect that bends checks by its text), `effectSaveSources` / `saveNoneOnSuccess` (the effect table's `saves` facet; a `match: "feature"` row carried by the feature's name since 2026-09-24 — `rowCarriers`, the one test the three readers share), `autoCritSources`, `reminderView` (the header line and the boxes — no net block), `reminderRecord` — what bends a roll, what it nets to, and what the section draws |
| [decide/sneak.js](scripts/decide/sneak.js) | `parseDice`, `sneakWeaponQualifies`, `sneakConditionsHold` (the box's default tick: Advantage, or the map's ally and no Disadvantage), `cunningMenu` (the options read off the sheet, up to two with Improved Cunning Strike), `cunningPick`, `sneakFormula` — the Sneak Attack dice, and what Cunning Strike does to them before the roll |
| [decide/clock.js](scripts/decide/clock.js) | `riderDue` (is a clock rider due on this hit, and why not — `any` since 2026-09-24), `riderPartFormula` (a pack's damage part as a formula, a bonus-only part included), `riderUsesFrom` (where a rider's uses live: the activity's, else the item's) |
| [decide/emanations.js](scripts/decide/emanations.js) | `reachAdmits` (who an aura reaches, by disposition — helpful: allies and neutrals; harmful: enemies), `emanationRange` (the activity's size, else the row's content formula over the source's roll data — `@scale.paladin.aura`), `resolveChanges` / `resolveFormula` / `foldArithmetic` (the pack's effect with the SOURCE's numbers read in), `triggerDue` (once per turn in combat), `healTriggerDue` (Aura of Life's 0-HP ally), `liveScenes` / `appliesOnScene` (the active scene and every scene a connected player views, a GM's while no player is connected), `emanationGroup` / `groupMembers` (one aura across every scene it stands on, one copy per creature), `memberEffectData` (the effect a member receives, fingerprinted with its aura for the floor) |
| [decide/repeat-saves.js](scripts/decide/repeat-saves.js) | the repeating save (the spells slice, 2026-09-28): `repeatRowFor` (the row an effect answers — its origin item and its name together, over the table and the registry's matcher handed in), `repeatDue`, `repeatBend` (the demand's own Advantage on one trigger), `repeatVerdict` (ends, holds, or tallies to an end, a lock or a press), `needsFloat` (the platform floats an effect with a status or a change), `repeatTitle` |
| [decide/token-lights.js](scripts/decide/token-lights.js) | the token lights, senses and sizes carried on an effect: `lightRowKey`, `lightOutKey` (the use that puts a row's light out), `lightAdopts` (a utility use's own creature effect of the row's name, which the light lands and the cast path leaves), `tokenOwnLight`, `lightItemNames`, `lightEffectImg` (the spell's icon on the module's own or an adopted effect), `lightChanges` (bright, the OUTER dim, a cone's `angle` only when the row has one), `lightTargets`, `lightLasts` (the card's words for how long it stands); the senses and sizes; the gear lights (`gear-lights.js`): `gearLightRow` (identifier or name, the 2014 aliases; `identifierOf` passed in), `gearLightOf`, `gearButtons`, `gearToggle` (a press → create / update / delete, the other gear light put out first), `gearLightWords`, `gearCardTitle` |
| [decide/turn-grants.js](scripts/decide/turn-grants.js) | the turn-start grant: `grantRowFor`, `grantDue` (once per turn by place), `grantTitle`; the feature rows (Regeneration): `featureGrantRows`, `blockingTypes` (the damage types the bearer's own copy names as the block), `damagedSince` (the receipts since the bearer's last turn started, by the combat stamp) |
| [decide/death-saves.js](scripts/decide/death-saves.js) | the Death Saving Throw: `makesDeathSaves` (a character, an important NPC), `deathSaveOwed` / `deathSaveDue` (the turn start's ask, once per place), `deathSaveResult` (the system's card and the sheet's tally, read), `damageAtZero` (a failure, two from a Critical Hit, death at the maximum), the words |
| [decide/drop-to-one.js](scripts/decide/drop-to-one.js) | the drop-to-1 table's `save` facet (Undead Fortitude): `dropSaveDc` (5 + the damage), `dropSaveExempt` (Radiant, a Critical Hit — an unreadable card counts the row), the words; `diedTitle` (Death Throes' count at the corpse) |
| [decide/wards.js](scripts/decide/wards.js) | the wards (the spells slice's Tier 3): `wardGateFor` (which seam gates a use — every attack roll; a damaging spell at its cast, never an area or an attack-type spell there), `wardEnds` (the bearer's attack, cast or damage roll; never its own cast), `wardWords`, `wardVerdict` |
| [decide/duplicates.js](scripts/decide/duplicates.js) | the duplicates (the spells slice's Tier 3): `standingDuplicates` (the row's effects on the sheet, the last the one destroyed), `seesThrough` (a status or a sense on the attacker), `duplicateOutcome` (the first face at `at` or higher redirects), `duplicateChips` (the canvas dice, the winner gold), `duplicateWords` |
| [decide/hit-menu.js](scripts/decide/hit-menu.js) | `hitMenu` (the groups and rows a hit offers, read off the sheet and the list; a per-option pool, a press with no die, the size judge's greyed row), `hitPick` (one per group, affordable — and one on the whole hit since 2026-09-24: a two-group pick picks nothing), `sweepVerdict` (would the original attack roll hit a second creature) |
| [decide/sequence.js](scripts/decide/sequence.js) | `hitOfferStep` (what a hit's queued offer does next — §5 law 7, the hit's sequence), `withinBashReach` |
| [decide/choices.js](scripts/decide/choices.js) | `effectChoiceFor` (which of a cast's effects are the alternatives a listed row names — fewer than two present asks nothing), `effectsAfterChoice` (what lands once the pick is made: the non-alternatives plus the pick; pending is null and the caller waits; a pick outside the options is pending too) |
| [decide/demand.js](scripts/decide/demand.js) | `resolveDemand` (which pending demand a roll answers — the stamped, the chained and the bare channel, the order as `priority`; §4 *The relay*), `pendingDemands` (mid-answer, with no roll in hand); `saveDemandData`, `saveTargetEntry`, `verdictsOn` — the saves flag's two constructors and its verdict reader |
| [decide/metamagic.js](scripts/decide/metamagic.js) | `metamagicFits` (does the option fit the spell — the pack keeps the option's condition as prose, so the predicate is the registry's `when`), `metamagicMenu` (the cast dialog's rows, the cost read live, the fit and the affordability as the tag), `metamagicPick` (one, eligible, affordable), `metamagicRuleText` (the feat's own text without the pack's cost line), `metamagicCardLine` (source, then result), `distantRange`, `carefulProtects` (the allies the save reaches, the caster first, up to the cap — or the player's chosen list), `heightenedMark` (the first enemy in reach, or the chosen one), `scalesTargetsFrom` (Twinned's fit off the source target count, with the user's exceptions), `extendedDuration` (doubled, 24 h at most), `empoweredPlan` (the ticked dice up to the cap), `empoweredOutcome` (the new total and the arrow sentence). Seeking Spell is a d20 fold KIND (`seeking`, d20-folds.js), not a metamagic.js moment. A METAMAGIC row's `unless` (Careful's `choosesTargets` — greyed on a spell that chooses its targets). The ask at the area and its readers of a spell's text are decide/area-ask.js (the row below) since 2026-09-24 |
| [decide/area-ask.js](scripts/decide/area-ask.js) | the ask at the area (2026-09-24, out of decide/metamagic.js): `carefulProtects`, `heightenedMark`, `chosenByDefault`, `choiceNeedsAsk`, `choiceCapFrom` / `choiceRuleFrom` / `spellProse` (a spell's own number and sentence, read off its text), `askDefaults`, `askMark`, `askWords` (each kind's words), `askOutcome` (an answer's records and who keeps their save), `areaChoiceLine` |
| [decide/rescue-hit.js](scripts/decide/rescue-hit.js) | the `roll` interrupt (Slice A, 2026-09-24): `d20ModeOf`, `d20Faces`, `needsSecondD20`, `disadvantageOutcome` (Disadvantage on a roll already made — the lower of two d20s; Advantage cancels to the FIRST die; already at Disadvantage moves nothing; a natural 20 can be undone), `critStands` (a crit doubles one damage roll only while it stands for every hit target), `rescueRows` / `liveRows` / `rescueTitle` (the popup's rows, their cost or their reason as the tag), `bentLines` (the attacker's card), `rescueSpendText`, `plainRule` |
| [decide/dice-chips.js](scripts/decide/dice-chips.js) | the dice that rise (2026-09-26, RULINGS *The dice that rise — THE RULE*): `rollChips`, `reductionRise`, `rerollRise`, `eitherRise`, `foldRise`, `acChips`, and `changedDice` (the dice the platform changed on its own, off the rolls' JSON — a RETIRED `rerolled` result pairs with the next live one; a live one whose `count` beats its face is a floor; NOTES §2 *How dnd5e 6.0 marks the dice it changes*) |
| [decide/damage-dice.js](scripts/decide/damage-dice.js) | the damage-dice folds' patch (2026-09-24): `rerollFaces` (Empowered's per die, lifted out of metamagic.js), `weaponDiceOf` / `setFormula` / `setTotal` (the activity's own dice, never a rider's), `eitherOutcome` (the higher set stands, a tie keeps the first), `eitherPatch` (both sets on the roll, the loser struck), `eitherDue` (once per turn), `eitherCardLine` |
| [decide/migrate.js](scripts/decide/migrate.js) | the rename's migration plan (3.0.0, §4): which documents carry the old scope, what each moves to, the emanation behaviour's new type, the world settings' new keys; idempotent, a second plan over a migrated world is empty |
| [decide/moments.js](scripts/decide/moments.js) | `MOMENT_RECORDS` (every flag key that means *something resolved* — its word(s), what resolving means, `resolved(record, ctx)` → the markers and plain facts), `STATE_KEYS` (every other key, with its reason), `MOMENT_WORDS` / `MOMENT_KINDS` (the contract's vocabulary), `resolvedMoments`, `newMoments`, `momentId` — the moment gate's data (*The moment events*, below). ⚠ Classifies, never curates: a key is a resolve or state, a fact about the code |
| [decide/help.js](scripts/decide/help.js) | the Help action (RULINGS *The Help action*): `helpItemData` (the feature the packs do not ship, one Utility activity), `lendable` (the skills and tools a helper may lend), `helpRows` (the choice's rows — the attack facet greyed beyond 5 ft, one check row per lend, each under its paragraph of the glossary), `helpAnswer` (a row's key against what was offered; a pass), `helpEffectData` (Distracted (Help) on the enemy, Assisted — <skill> on the ally carrying `lends`), `helpWords` |
| [decide/shields.js](scripts/decide/shields.js) | `shieldDue` (is a damage shield due on this hit — melee, within the activity's reach, once per turn, while the temp HP stand), `shieldReach`, `shieldType` (the type the standing effect decides), `shieldEffectNames`, `durationSeconds` |
| [decide/effect-view.js](scripts/decide/effect-view.js) | the effect view's rows from plain facts: `listed`, `changeSign`, `toneOf` (tone is a pattern, not a list), `effectRows`, `sheetRows`, `rowAction`, `panelGroups`, `everyRow`, `allRows`, `marksHeldBy` |
| [decide/verdict.js](scripts/decide/verdict.js) | `hitsAmong`, `modeAdmits`, `saveOutcome`, `saveMultiplier`, `reduceDamages` (Parry's subtraction), `verdictText`, and the fold layer (`ATTACK_FOLDS`, `SAVE_FOLDS`, `foldsFrom`, `foldedRoll`, `foldedVerdict`, `foldedSave`) |
| [decide/eligible.js](scripts/decide/eligible.js) | `isDeadForSaves`, `limitedUses`, `isReactionItem`, `castLevelOf`, `clampVolleyCount`, `riderKey` |
| [decide/receipt.js](scripts/decide/receipt.js) | `traitOutcome`, `hpDelta`, `receiptEntry`, `joinDamageReceipt`, `joinEffectReceipt`, `takenOf`, `receiptAmounts`, `revertPlan`, `revertableEffect` |
| [decide/present.js](scripts/decide/present.js) | `popupKey`, `POPUP_RANK`, `TONE`, `bfCard`, `ruleLine`, `momentBarHTML`, `holdBarHTML`, `nextCascadeSlot`, `cascadePosition`; `situationalBonusHTML`, `modeButtons` — the controls every popup that stands in for a roll dialog carries; `modeTone`, `modeTagHTML` — the one mode tag, one meaning per hue (`fails` is the save gate's fourth answer, red); `reminderSectionHTML` / `reminderFieldsetHTML` / `reminderDetailsHTML` — the gate's section bare, inside the system's own roll dialog, and folded to its header line for a volley's ray rows; `sneakBoxHTML` (the Sneak Attack choice under the sources) and `cunningMenuHTML` (the Cunning Strike menu on the damage offer); the rescue view's row model and markup; `tickRowsHTML` (2026-09-24 — the ticked offer row, one per source: the popup that rescues a hit and Savage Attacker's); `pickInputHTML` (the one pick input, every row and box built on it) and `choiceRows` (a bystander's choice: the rows, Pass checked, the mutes) — §5 *The pick* |
| [decide/card.js](scripts/decide/card.js) | THE CARD SEAM: `CARD`, `cardKind`, `isCard`, `rollKindOf` / `rollKindInData`, `subKindOf` (a death or concentration save is a `save` told apart by `system.type`); `targetsOf` (6.0's token-keyed `system.targets` in the house shape — `uuid` is the target ACTOR, one row per actor, the token beside it), `describeTarget`, `TARGETS_KEY`; `originIdOf` / `originIdInData` / `originData` / `ORIGIN_KEY` (`system.origin` — the key the platform's registry indexes; every roll the module drives writes it); `activityRefOf` / `activityUuidOf` / `activityTypeOf`, `itemRefOf` / `itemUuidOf` / `itemNameOf`; `abilityOf`, `castLevelOn` (`system.level`), `scalingOf`, `concentrationIdOf` — what kind of card a message is, whose, from which, read off `type` and `system.*` ONLY. Every read of a card's system data goes through here, and a reader joins WITH its customer |

⚠ **`receiptAmounts` returns the row's TEXT as well as its figures, deliberately.** The two bugs
that reached the table there were both a right number in the wrong sentence. Only the colours
stay at the EDGE. **Do not "tidy" those strings back into the view.**

**Outside the layer, the shared readers:**

| Module | Holds |
| --- | --- |
| [geometry.js](scripts/geometry.js) | EDGE: `tokensInRegions` — the platform's own containment (`TokenDocument#testInsideRegion` against the region's polygon tree, from the document's committed source position, no canvas); THE TOKEN, one rule — `tokenDocOf` (the document a subject stands as: a token's synthetic actor's own token; for a use, dnd5e's usage token; else the one this client controls; else its first linked token on the viewed scene, drawn first — ⚠ a world actor's unlinked token is another creature, never its token), `tokenOf` (its token on the canvas), `tokenOnScene` (an actor's token on a named scene, the same on every client), `tokensOf` (every one); `feetOf`, `nearestFeet` — token distance in FEET, the readers the reminder gate grew and the damage service shares (the 5-foot automatic crit) |
| [lookup.js](scripts/lookup.js) | SPINE: `lower`, `itemsNamed` / `itemNamed` / `featureNamed` (identifier first, then name — §6 *How a row names its content*), `namesAnswering`, `activityNamed`, `activityOfType` (and their own `sameName`) — the sheet readers every machine uses (a uuid through core.js `resolveUuid`); `resolveDie` — a die formula resolved on THIS actor's roll data, an `@` left standing refused. `cardItem` / `cardActivity` — a CARD's item or activity: the live document while it stands, else the card's own snapshot of an item the use DELETED (dnd5e spends before it posts); `tools/check-card-reads.mjs` holds every such read to them, a deliberate live read saying why. Imports only the card seam (decide/card.js — downward), owns nothing. Its companion in settings.js: `listedNames(entries)` (a list's kinds as a lower-cased set) |
| [rule-text.js](scripts/rule-text.js) | SPINE: the rule text, read from the book — `ruleTextFor(pointer)` / `ruleHTML(pointer)`, and the one observer that fills every `data-bf-rule` pointer that reaches the page (§5 law 8) |
| [surfaces.js](scripts/surfaces.js) | CORE, a second leaf beside core.js: `SURFACES` — every HTML anchor the module reads off the PLATFORM's markup (core's `.message-content`, `[data-message-id]`, `.form-group`; dnd5e's damage tray, the usage card's SUMMARY block (`cardSummary` — where a chained roll's rows draw, ui.js `cardRow`; the card's BUTTONS are data since 6.0, filtered at birth in polish.js), the roll dialog's parts, default and roll buttons, the usage dialog's footer) and `SURFACE_SOURCES`, where each is authored. **No selector string for a platform element lives anywhere else** — `tools/check-surfaces.mjs` fails the build on one, and on a dnd5e anchor that no longer appears in the verified version's shipped templates (`dnd5e-surfaces.json`, generated and pinned like the hook artifact). NOTES §2 *The dnd5e 6.0 pass* §3b: the card's DATA is the contract, its HTML is not |

**One door each** (`npm run lookups`, [tools/check-lookups.mjs](tools/check-lookups.mjs)):

- **A uuid** is read through core.js `resolveUuid` (sync) or `resolveUuidAsync` (a pack document loaded): null for a
  uuid that is not here — deleted, empty, malformed, an embedded pack document the platform throws on — never a
  throw; `writableTargets(targets)` beside them, the rows this client may write. core.js because the leaf is the one
  file every other file can import, the spine's own readers included.
- **A token** is found through geometry.js's four readers above; dice-rise.js, events.js and shared.js reach them on
  pinned spine edges. A lookup that answers a different question stands pinned in `TOKENS` with its reason.
- **A console line** goes out through core.js `log`: `log.warn`, `log.error`, `log.info`, and `log.debug` behind the
  module's debug switch (`CONFIG.debug.bythebooks = true`, set in the console), every line opening with the title.
  Biome's `noConsole` fails a console call anywhere else in scripts/ (biome.json); the two leaves that import
  nothing (decide/present.js, dispatch.js) carry a suppression pinned in `CONSOLE`. tools/ keeps its console.

### The dependency rule

> **Depend downward only: machines → services → spine → registry → decision → core.**
> A machine may not import another machine, and a same-layer edge is treated exactly like an
> upward one. **Every edge that is not downward is PINNED, with a reason, in
> [tools/check-layers.mjs](tools/check-layers.mjs) — and the gate fails on an unpinned edge AND
> on a pin whose edge has gone.**

| Depth | Layer | Files |
| --- | --- | --- |
| 6 | entry | `bythebooks.js` |
| 5 | **machines** | hold/ (one machine, a directory — below) · saves/ (one machine, a directory) · mastery · topple · chip-spend · precision · riposte · hew · bash-offer · command · concentration · volleys · cast · hit-riders · d20-folds · receipts · polish · resources · reminders (the gate machine — attack, save and check gates) · stats · sneak · clock-riders · use-chips · emanations · hit-menu · damage-shields · damage-casts · superiority-uses · metamagic (the Sorcerer's options in the cast dialog, the points spent on the card) · dice-changers (one popup per damage roll, a row per feature that changes the landed dice — Empowered Spell, Savage Attacker, Piercer; 2026-09-27, out of metamagic and the retired damage-either) · effect-view (a creature's buffs and debuffs on the bar, the hover card and the held key; the bar's fold is the one write, the platform's own document edit under the owner's permission; RULINGS.md *The effect view*) · death-saves (the Death Saving Throw asked at a dying creature's turn start, the roll the sheet's; RULINGS.md *Death saves run themselves*) · help (the Help action: the item's use refused without one target, the assist asked as a choice, the one effect landed by the elect; RULINGS.md *The Help action*) |
| 4 | **services** | `auto-apply.js` · `effect-riders.js` · `auto-damage.js` — the consequence chokepoints (§2) · `area-ask.js` — the ask at the area, one question two machines route through (metamagic, saves; 2026-09-24) |
| 3 | spine | `ui.js` · `shared.js` · `geometry.js` · `settings.js` · `lookup.js` (the sheet and document readers) · `holds.js` (the hold registry — what another module asks before it plays) · `events.js` (the moment events — what the module publishes when a moment resolves) · `dice-rise.js` (the dice that rise — the one renderer of chips over a token, and the `diceRise` flag listener every client plays; 2026-09-26) |
| 2 | registry | `volley-registry.js` |
| 1 | decision | `decide/*` — **zero imports, asserted** |
| 0 | core | `core.js` · `surfaces.js` — leaves, **asserted** |

The rule is **"no UNNOTICED cross-layer edges"** — the R4 tripwire's shape applied to the
import graph. **Do not hand-count this graph;** quote `npm run layers`.

**A machine may be a DIRECTORY** (ruled 2026-09-05) when one flag's lifecycle outgrows a file.
The directory is the unit the dependency rule tests: its parts may import each other (hoisted
`function` declarations called at hook time), `index.js` is its only public face, and the entry
imports the index. `GROUPS` in [tools/check-layers.mjs](tools/check-layers.mjs) holds it: an
edge from outside to any part but the face fails with *"import the index"*.
`EXPECTED_SOURCE_FILES` counts the parts file by file. ⚠ **The index's import list fixes the
parts' registration order; it is load-bearing, and its comment says so.**

- **`saves/`** — eight parts along the spine's steps. ESM evaluates a cycle's first-listed
  member LAST, which is why `saves/index.js` lists `verdict.js` before `ask.js`.
- **`hold/`** — ten parts by moment, a DAG (`dice.js`, 2026-09-26: a bent d20 rising over the attacker, whose roll it is, and Shield's "+5 AC" over the creature hit, off the hold record — a reload replays nothing); the index re-exports the machine's ONE outside
  name, `stampHoldIfInterrupted`, and two bare imports at its head (`ui.js`, `effect-riders.js`)
  keep the spine's bar registered above the hold row.

**Split by MOMENT, not by phase.** A file holding several features is cut into one machine per
moment, each owning its own flag (the maneuvers are `precision`, `riposte`, `hew`, `bash-offer`
and `command`; `topple.js` owns the `topple` flag off the card mastery posts — the card is the
bus). Shared readers go DOWN (`lookup.js`, rules text to `decide/registry.js`), never sideways.

**The hold is a feature, not a service.** Only `auto-damage.js` imports it (`hold/index.js`,
`stampHoldIfInterrupted`), on the deliberate order-pinning edge. The "who does what" services
(`canAnswerFor`, `isContinuingClient`, `inRunningCombat`, `isActiveGM`, `rollerUserFor`) live in
`core.js` (§3); the interrupt/block list wrappers with the settings surface (§8).

> **A VIEW belongs with the machine that owns the FLAG it renders.** The spine owns *how* a
> moment is presented — popups, clocks, bars, latches; a machine owns *what* its own moment
> says. A view in the spine imports the feature's vocabulary, and that is the cycle every time;
> a spine function reading a feature's flag by STRING is the same fault with no edge to show it.

### The offer's contributions — a service that knows no feature

`auto-damage.js` owns the damage offer's popup, clock and one roll thunk, and knows nothing about
any feature. What a feature PAINTS on the offer — the armed Cleave line, the Cunning Strike menu,
the due clock riders, the hit menu — is declared by the machine that owns it, at module
evaluation, through `registerOfferPart({ key, due, parts })` (a registry in ui.js, which the
service reads): `due` says the offer must open
even under auto damage, `parts` returns the markup, the notice lines, the live controls and the
commit that writes the pick on the attack message before the dice. Order on the offer is
registration order. A service never imports a machine to paint its content.

**An activity's own effects on a hit take ONE path** (2026-09-24): `applyActivityEffectsOnHit`
in [effect-riders.js](scripts/effect-riders.js), the service both machines call — the hit menu's
`effects` option (Distracting Strike) and a clock rider's `effects` row (Frost's Chill). The
activity's effect profiles resolve, land on the hit targets receipted on the damage card, and a
`clock` key is a `CHIP_WINDOWS` window pinned to the ATTACKER's place (the Slow mastery's clock,
so an opportunity attack's window is still the attacker's next turn start). Two machines, no
sideways edge: the shared part went down to the service.

### Registration order is the dispatcher's ORDER

Every hook the module listens to goes through **one dispatcher**, [dispatch.js](scripts/dispatch.js):
a file registers with `listen(hook, key, fn)` (or `listenOnce`), `key` its own scripts-relative
path, and the dispatcher holds ONE platform listener per hook name and runs the module's handlers
behind it in the order of its `ORDER` table — the same order on every hook. Two gates sit at
the dispatch entry (3.0.0). **The migration mark:** every document create, update and delete hook,
the `pre*` ones included, whose arguments carry `bythebooksMigration` (`MIGRATION_MARK`,
`isMigrationWrite`) is dropped on every client, so a flag moving scope never looks like a moment. Unmarked
writes keep running during the move, so a turn advanced mid-migration is not lost. **The passive gate:** `isPassive()`, asked at the first
dispatch and kept, is true while the old package (`fvtt-mod-battleflow`, the module's name until
2.17.0) is active. Then only the rows in `PASSIVE_KEEPS` run: `init|settings`, `init|emanations`
(the RegionBehavior type stays registered, so regions stay valid) and `ready|migrate`, which shows
the GM a permanent warning to disable Battle Flow and reload, and returns. The emanations' region
event handlers return early too. Two copies live at once would apply every damage twice. Some same-hook
orderings are behavioral (a veto runs before the capture it protects; a card's rows render in
handler order), and the table is where they are decided, not the import graph. `Hooks.on`
appears in dispatch.js and nowhere else; `npm run hooks` (`tools/check-hook-order.mjs`) fails
on a registration outside it, a key that is not the file's own, a file missing from `ORDER`, a
stale row, and on any of its named load-bearing pairs out of order. Its twin `npm run dispatch`
proves every `dnd5e.*` name is one the system dispatches and that `VETOABLE` — the hooks the
platform dispatches with `Hooks.call`, where a handler's `false` stops the chain — matches the
bundle.

- **Adding a file that registers a hook** adds its row to `ORDER`, where its rows and vetoes
  belong; the gate says so. Import order is evaluation order and nothing more.
- **What evaluation order still fixes** is the eval-time registries — the damage offer's parts,
  the rescue window's slices, the damage claims, the withholds — each in the order its files are
  evaluated from the entry.

Cross-file symbols must be **hoisted `function` declarations called at hook time**, never at
module-eval time — that is the only reason the existing import cycles are safe. A registry a
machine writes at ITS evaluation (`registerOfferPart`) lives in the spine for the same reason:
the spine is never on a cycle, so it is always evaluated first, and a store inside a service on
a cycle could still be in its dead zone.

### The public API — the only surface another module may read (2026-09-09)

`game.modules.get("fvtt-mod-bythebooks").api`. ⚠ **Everything else in this tree is private**, and
the rule runs both ways: **By the Books imports no other module and calls into none.** A table may
install this module alone, or with FX Studio, or with neither — nothing here may assume a
neighbour. What other modules need is *published*, never *reached for*.

| Surface | Owner | What it is |
| --- | --- | --- |
| `registries` | [settings.js](scripts/settings.js) | the kind lists' readers, read-only — inspection, not an extension point (§6 rule 5) |
| `volleyRegistry` | [volley-registry.js](scripts/volley-registry.js) | volley membership, read-only, same rule |
| `acknowledgeMoment` | [ui.js](scripts/ui.js) | resolve a card's pending presentation (law 3) |
| `holdFor(subject)` · `castHold(uuid)` · `holds` | [holds.js](scripts/holds.js) | **the hold** — below |
| `moments` and the hooks `bythebooks.moment` · `bythebooks.<event>` | [events.js](scripts/events.js) | **the moment events** — below; version 2, a GATE over the module's own records ([decide/moments.js](scripts/decide/moments.js)), every resolve published |

**The hold** has a consumer outside this repo, so its contract is written here. While a cast
waits on a question only the landed area can answer (Careful Spell: *who does the spell
spare?*), its card is held back, so a module keying on the usage card does not play a picture
for a spell nobody has aimed yet.

> A hold is **client-local**, in memory, keyed by an **opaque subject**. `holdFor(subject)`
> answers with a promise or `null`; `null` means nothing *here* is holding, which on a remote
> client may mean nothing here can *see* a hold. A hold **always settles**, three ways: with the
> **card** that lifted it (play it), with **`null`** meaning nothing was posted and nothing should
> play, or with a **truthy sentinel** meaning the hold lifted and nothing is known — carry on.
> **The consumer bounds its own wait** — a hold is a courtesy, never a guarantee of liveness.

⚠ **Never collapse the sentinel into `null`.** A hold that outlives its own clock has NOT
established that the cast came to nothing (the points are spent, the area is on the map);
reading it as *never happened* suppresses the picture for a late answer. **Fail open.** A null
RETURN (*play now*) and a null RESOLUTION (*play nothing*) are opposite instructions that look
identical; [tests/holds.test.js](tests/holds.test.js) pins the distinction and the refcount.

`castHold` is an alias of `holdFor` that FX Studio shipped against and **is kept forever**.
`holds` is `{ version, keys }`, so a consumer can tell contracts apart without probing. The hooks
beside it: `bythebooks.holdOpened` when one is raised, `bythebooks.castReleased` when one
settles. ⚠ **The release is on `preCreateChatMessage`, never on `createChatMessage`** — create
hooks fire DURING the create, so a consumer would find the hold still open for the very card
that lifts it.

**Four decisions in [holds.js](scripts/holds.js) are load-bearing** for the modal sequence
(BACKLOG *The modal sequence*): the hold
is **refcounted** (never a boolean — one holder today is exactly why a boolean would look right
and then cost a migration), keyed by an **opaque subject** (never an activity uuid), released by
an **explicit lifecycle call** (never coupled to "the card posted"), and `openManagedPopup` stays
the one place a decision popup opens.

### The moment events — what the module publishes when a moment resolves (2026-09-11)

The mirror of the hold: the hold tells a neighbour *not yet*, the events tell it *now, and here
is what*. An ability used through the module's own popups posts no usage card (a maneuver die
rides the damage roll, Parry rides the hold's answer), so [events.js](scripts/events.js) fires
**`bythebooks.moment`** with a plain payload, then **`bythebooks.<event>`** with the same
payload, at the point the moment resolved.

**The names follow the package id** (3.0.0): `bythebooks.moment`, `bythebooks.<event>`,
`bythebooks.armorBlock`, `bythebooks.styleDice`, `bythebooks.holdOpened`,
`bythebooks.castReleased`, `bythebooks.areaAskAnswered` and `bythebooks.deferredUsageCard`, all
fired through core.js's one `publish(name, …args)`. 3.0.x fired each a second time under its old
`battleflow.*` name (the module was Battle Flow until 2.17.0), so a reader could move on its own
schedule; **3.1.0 fires the new names only** (issue #14), FX Studio having moved in 0.9.0 (its
`readers/bythebooks.js` keeps listening to `battleflow.moment` for a table still on 2.x). The
internal `fvtt-mod-bythebooks.effectViewChanged` follows the id.

**The user's ruling: every resolve publishes, through a gate, so nothing is missed as the module
grows; what plays is FX Studio's manager's call.** By §4 law 3 a resolve IS a record landing on a
message, so the gate watches the RECORDS.

> **Three parts.** (1) [decide/moments.js](scripts/decide/moments.js) — `MOMENT_RECORDS`, one row
> per flag key that means *something resolved*: the word(s) it publishes under, one sentence on
> what resolving means, and `resolved(record, ctx)` → every resolved moment in the record, each
> with a stable **marker** (a target uuid, an index, `message`) and plain facts; and `STATE_KEYS`,
> every other key the module writes with the reason it is state. Together they classify every key.
> (2) events.js — **one publisher**, on `createChatMessage` and `updateChatMessage`, publishing
> each registered record's markers this client has not seen; on `ready` the log is remembered
> without publishing, and a deleted message forgets its markers. The edge from unresolved to
> resolved IS the idempotence — no machine keeps a latch for it. (3)
> [tools/check-moments.mjs](tools/check-moments.mjs) — every flag key the module writes is in
> exactly one of the two lists, no row is stale, and **every file that writes the world** is
> pinned to the record(s) its writes resolve into or a reason none does (a resolve landing on an
> actor or item alone would otherwise be invisible). An unclassified key fails `npm run verify`;
> forgetting to classify is the only failure left, and it is loud.

**The publishing client.** A resolve publishes on ONE client: by default the one that WROTE the
record — the client with the facts at the instant they are true. A row may name another
(`publisher`): the hold names the answering player (`answeredBy`). Every other client REMEMBERS
the marker without publishing, so a later write cannot re-fire an old resolve anywhere.

The payload is **plain** (uuids and ids, strings, numbers, booleans; frozen, serialisable) and
carries **no flag shape** from this module. **Nobody listening is a no-op**: no feature detect,
no try/catch around a neighbour, no setting.

The vocabulary is **closed**, a word per MECHANISM FAMILY — `maneuver` · `sneak` · `fold` ·
`rider` · `hold-answered` · `mastery` · `shield` · `spend` · `damage` · `effect` · `save` ·
`break` · `use` · `cast` · `volley` · `choice` · `metamagic` — and `kind` names the exact record
(`hitManeuver`, `clockRiders`, `receipt`, …). A new word is a contract change and a version bump;
`api.moments` is `{ version: 2, events, kinds, hooks }`. The payload: `event`, `module`,
`version`, **`kind`, `marker`, `momentId`** (`<messageId>|<kind>|<marker>`, unique per resolve —
the dedupe key), `actorUuid` / `actorName` / `tokenUuid` (who), `itemUuid` / `itemName` /
`activityUuid` / `ability` (what; a name-only row finds the item on the sheet by item name, then
by ACTIVITY name), `messageId` (where it resolved) and `attackId` (the attack it rode),
`targets[]` as `{ actorUuid, tokenUuid, name, hit? }` (`hit` only when a verdict is known),
`spend` in the uniform row shape or null, `details` (kind-specific plain facts), `at`. A resolve
under two words (Parry: `hold-answered` and `maneuver`; a failed concentration save: `save` and
`break`) fires once per word with the same `momentId`. `hold-answered` publishes a **pass** too
(`details.answer`); a revert is its own marker (`<uuid>|reverted`) under `damage` / `effect`.
[tests/decide-moments.test.js](tests/decide-moments.test.js) pins every row and its edges;
[tests/events.test.js](tests/events.test.js) pins the payload and the gate.

**Slice A moved which word a record publishes under, and added no word** (2026-09-24; the
version stays 2). The marker is `maneuver: false` on a record that is not a maneuver:
- **`hold`** — Stone's Endurance's use publishes `hold-answered` ALONE (`reduce.maneuver`
  false); only a Superiority Die (Parry) adds `maneuver`. A `roll` answer never publishes
  `maneuver`: its facts name the ROW that bent the roll (its item and activity, `ability` the
  row's name) and `details` carry `rescue`, `how`, `stood` and the `verdict`.
- **`hitManeuver`** — a Giant Ancestry pick (Hill's Tumble, `maneuver: false`) publishes
  `rider`; a Combat Superiority die still publishes `maneuver`. Since 2026-09-27 the record is a
  list (`picks`, a pick per group) and publishes once PER PICK, the marker the pick's key.
- **`diceChange`** (2026-09-27; `either` from Slice A before it, Savage Attacker alone) — once
  `status` is `used`, a resolve per ROW used: `fold` for a set or one die (Savage, Piercer —
  `details` the formula, both totals, which stood, the delta and the total), `metamagic` for
  Empowered's picks. The marker is the row's key.
- **The writer pins** ([tools/moment-writers.mjs](tools/moment-writers.mjs)): `hit-menu.js` also
  writes `effectReceipt` (Hill's Tumble's no-save Prone, receipted on the damage card);
  `dice-changers.js` writes `diceChange` (and Empowered's `poolSpend`). `weaponRolls`, `bent` and `rescue` are STATE (`STATE_KEYS`).
- **The Aasimar walk (2026-09-25).** `spellRiderCard` (new record) publishes `rider` — Celestial
  Revelation's extra damage landed on the ONE target a spell's caster picked; its receipt on the
  same card is the damage's own resolve. STATE: `spellRider` (the pick on the spell's card),
  `emanationPulse` (the pulse's card — its receipt is the resolve), `tokenLight` (the light's
  payload; its `effectReceipt` is the resolve — and on an ActiveEffect, the light's fingerprint),
  `formChip` (the transformation form a rider reads). Pins: `clock-riders.js` also writes
  `spellRiderCard` and `receipt`; `emanations.js` writes `receipt` (the pulse); `token-lights.js`
  writes `effectReceipt`.

**A consumer dedupes against the card.** `damage`, `effect`, `spend` and `save` also fire for
resolves the platform posts a card for, and a cast that answers a hold posts its own usage card
beside `hold-answered` — by design, the two carry different facts; `momentId` is the key to
dedupe on, with `event` beside it where one resolve publishes under two words.

**The contract files.** What a reader in the family may rely on is written down as data, recorded
from a live run: `contracts/moment.json` (every hook above, each `<event>|<kind>` pair's fields with
a sample, the companion hooks' arguments) and `contracts/card-flags.json` (every key the module
writes, its class, writers, documents, stat stamp, its readers in the family and its shape). FX
Studio and Session Scribe test against them from the sibling clone. `npm run contracts` holds them to
this tree offline; the battery records and reports against them (tools/README.md *The contracts*).

**Dead, one rule for the family.** Three hands write the `dead` status and a combatant's defeated
mark (dnd5e's Apply Downed Conditions; this module's downed conditions out of combat, its kills and
its revert; Combat Plus's Auto-Defeated), and Token Art and this module's summons read it. Who writes
what, when, and in which order is written once, in the suite (`fvtt-suite-openroll5e`,
`contracts/dead.md`). This module's half: the out-of-combat pass writes dnd5e's own mapping under
dnd5e's `autoDowned` flag, so the system's removal on the heal ends it; a kill and a revert write or
clear Dead before the Hit Points, never after (the system's `updateDowned` races a later write);
`clearDefeated` matches combatants as Combat Plus does; the summons read the Dead status as the
caster's death, never 0 Hit Points alone.

---

## 8. The settings surface

Twelve settings (RULINGS *The settings*, *Open roll by default*, *Session zero's combat*): nine world configs for
the DM, three per-client preferences; none of them a house rule (the one there was, Going Down Costs a Level of
Exhaustion, lives in Open Roll 5e: House Rules). One more world key is kept out of the list: `summonArt`, the table's own
token and portrait per summoned creature, edited only in its window behind a settings button
([summon-art.js](scripts/summon-art.js), RULINGS *Summons* call 15). Two of the nine, Roll Results Players See and Bloodied Shows on Every
Token, own dnd5e's Visibility menu (`attackRollVisibility`, `challengeVisibility`, `bloodied`): the
active GM writes the mapped values ([decide/visibility.js](scripts/decide/visibility.js)) on `ready`
and on change, and only a key that differs, because dnd5e's own default hides every attack result
while By the Books' receipt has already announced the damage. `npm run registry` checks that `S` in [core.js](scripts/core.js) and the registrations
in [settings.js](scripts/settings.js) agree. `tools/verify-settings.mjs` reads the
shipped defaults from the registrations themselves, so there is no second copy to keep in step. A Foundry default applies only where a setting has never been
written, so a default flip never touches an existing world.
While the module is passive (§7, Battle Flow still active), the visibility sync (`syncVisibility`)
does nothing.

### Rules

1. **Every machine is always on.** A setting is a table's taste (a clock, what the hold reveals,
   whether a roll asks), never a switch that turns a machine off.
2. **Every question reads one clock**, the Decision Timer (`decisionWindow()` in core.js).
3. **A client setting must change only who presses a button.** A save is *owed* (the table waits
   on it), so whether it asks is a world decision; a damage roll is *owned* (nobody is blocked; the
   buzzer makes the timing identical). Only the second shape may be a client setting.
4. **A per-client setting nobody knows to look for must not start wrong** — by the TABLE's
   normal: Roll Your Own Damage ships ON because this table's players press their own damage; the
   buzzer makes ON safe.
5. **A setting may own a dnd5e setting** only through a public `game.settings.set`, written by the
   active GM and only when it differs; "Leave it to dnd5e" hands it back.
6. **The suites' retired keys** are translated in the page by `tools/harness.mjs`
   (`retireSettings`): the timers are the Decision Timer, the concentration mode is Players Roll
   Their Own Saves, and a switch that is now always on is a no-op.

---

## 9. The dnd5e contract

The module rides **public hooks and document writes only** (R3). The seams it depends on:

| Seam | Used for |
| --- | --- |
| `dnd5e.rollAttack` | the attack trigger — fires on the rolling client, after the message exists |
| `dnd5e.postUseActivity` | the use trigger — spell holds, save demands, volleys, cast payloads; a listed `roll` row's own activity used from the sheet answers the oldest pending hold that asks this defender with the row live (hold/answer.js — Lucky's "Disadvantage" is no Reaction, so it is asked before the activation gate); a scoped tactical fold's ARMING (d20-folds.js: Tactical Assessment or Ambush used from the sheet — the die rolled in the open, a chip carrying the number on the actor, a notice naming the check; `dnd5e.rollSkill` / `dnd5e.rollInitiative` fold the number in when the check the scope names lands) |
| `dnd5e.preRollDamage` | injecting rider damage parts (crit doubling comes free — see NOTES): the marks (hit-riders.js), the Sneak Attack dice after their Cunning Strike costs (sneak.js), the clock riders (clock-riders.js) and Commander's Strike's ride (command.js — the chip the elect put on the ally carries the fighter's die; the ally's own attack's damage folds it into the base roll, spends the chip and the Reaction, and stamps `commandRide`; no driven attack, no relay); the automatic Critical Hit — `config.isCritical = true` on a hit within 5 feet of a Paralyzed or Unconscious target (auto-damage.js `critFor`, the ONE crit source the offer's badge and both roll paths read), and since 2026-09-24 `config.isCritical = false` for a natural 20 a defender's `roll` answer undid. ⚠ **The roll count** (Slice A, 2026-09-24): auto-damage.js's handler runs FIRST on the hook (dispatch.js ORDER), so it stamps `weaponRolls` — how many rolls are the activity's own — before any rider pushes one; Savage Attacker rerolls those. dice-changers.js's registration sits later on the hook and stamps the `diceChange` birth flag (`due` / `spent`, a row per feature), reading nothing a rider writes |
| `dnd5e.preRollAttack` · `dnd5e.preRollSavingThrow` · `dnd5e.preRollAbilityCheck` | the three gates (attack, save, check): judged before the dice, the system's own dialog forced open and given By the Books' fieldsets — **the dialog is the system's own, we add one fieldset and set its default** (RULINGS.md *The gate before the roll*); all TEMPLATED names, pinned in `check-hook-dispatch` and asserted FIRED by their suites. Initiative rides the check hook too and is skipped by its `initiativeDialog` hookName. The same judge (`reminders.js` `judgeRoll`) runs in the volley aim popup per ray, and the ray's record rides the roll's own message data |
| `renderRollConfigurationDialog` (core) | the section drawn into the system's roll dialogs on each render — the attack gate's, the save gate's and the save demand's fieldsets, the Fails button; polish.js's target block rides the same hook |
| `dnd5e.postRollConfiguration` | the record of what the gate showed and what was pressed, stamped on the roll's message data after the dialog closes with rolls in hand |
| `dnd5e.rollDamage` / `createChatMessage` | the application trigger on the elect; the dice changers' offer on the ROLLER's client (dice-changers.js promotes `due` → `pending` once the roll is not `attackHoldPending`; the hold's release write reaches it as `updateChatMessage`). ⚠ dnd5e dispatches the damage hook TWICE per roll (NOTES §2): an in-flight set keeps the offer single |
| `dnd5e.rollAttack` → the `roll` rows | `stampHoldIfInterrupted` reads the defender's `roll` rows beside the one reaction the list finds; a crit with a live row sets `hold.critAtStake` and auto-damage.js stands aside — the continuation rolls the dice once the answer is in (`damageAfterHold`) |
| `dnd5e.preApplyDamage` | the veto seam and the receipt's last word — **cancelable, and healing takes the same path** |
| `dnd5e.damageActor` / `healActor` | announcements; fires on all clients |
| `dnd5e.renderChatMessage` | every card row this module draws — fires for **every** message subtype. ⚠ Since 6.0 a save or check chained to a usage card renders HIDDEN and as a SUMMARY inside the usage card (client setting `chatCardSummary`): a row that can land on such a roll registers through ui.js `cardRow`, which draws it on the shown card or inside `.card-summary[data-message-id]` when the usage card renders — one drawer, two hosts, never both. The saves card's per-target line goes further: a resolved target whose roll is summarized in the card gets the verdict's tail written into the platform's own row (`SURFACES.summaryRow`, `verdictTail`) and no line — one row per creature |
| `dnd5e.preCreateUsageMessage` | the usage card's buttons are DATA (`system.buttons[]`): polish.js drops every row but `refundResource` before the card exists — a button not in the data is on no client's card; the handlers underneath survive |
| `updateChatMessage` → the summary nudge (ui.js) | the platform re-renders a summarized roll's origin on create, delete and `system` change only; when this module's flags move on a summarized roll (a fold answered), ui.js calls `ui.chat.updateMessage(origin)` so the summary re-draws |
| `Actor5e#applyDamage` | the resistance math (N1 — never reimplemented) |
| `Actor5e#rollSavingThrow` / `rollConcentration` | real saves (N1) |
| the message registry (`system.origin`, `getAssociatedRolls`; every roll the module drives writes `system.origin`, decide/card.js `originData`) | chain resolution — **we ride the system's registry, never a parallel one** |
| turn events (`dnd5e.preCombatRecovery`, combat hooks) | per-turn clears |
| `dnd5e.rollInitiative` — `(actor, combatants)`, after the number is set | Ambush's fold on the initiative roll's own message; accepting re-sets the combatant's initiative (a fold, the original standing as history). ⚠ Fires only from `Actor5e#rollInitiative` (the sheet, a macro): **the combat tracker's roll button goes through `Combat#rollInitiative` and never fires it** (NOTES §2 *The combat tracker's roll never fires*) — so `createChatMessage` on the platform's own `flags.core.initiativeRoll` message, authored by this client, is the second road to the same stamp; a same-client latch keeps the two to one |
| `dnd5e.rollSkill` / `dnd5e.rollToolCheck` — their `data` carries `skill` / `tool` | the scoped folds (Ambush on Stealth; Tactical Assessment on History, Investigation, Insight) read the skill off the hook's own data |
| `dnd5e.preUseActivity` → `usageConfig.subsequentActions = false` | a bare damage activity's dice are the module's (damage-casts.js) and a maneuver's damage activity is its DIE (superiority-uses.js, Commander's Strike) — dnd5e's own follow-up (a damage dialog) is switched off at the use so nothing rolls twice; the consumed-flag write the follow-up skips is replicated as volleys.js does |
| `dnd5e.preUseActivity` → `false` · `renderActivityChoiceDialog` (core) · `dnd5e.preDisplayCard` → `false` | the gear lights' seam (gear-lights.js): ⚠ `Item5e#use` calls NO hook before its activity picker, so a listed item is stopped at the activity's use (one activity, a shift-click, a macro naming the activity: every pack item), at the picker's render (dismissed unseen; its promise resolves to no activity), or at the item card a use with no activity posts. Every other item goes through untouched. `gear-lights` sits ahead of `polish` in `ORDER` so its veto runs before polish.js's no-target veto on the Torch's Attack. ⚠ The picker's render and the context menu's Display in Chat also reach these for a listed item: both open the toggle |
| `preCreateChatMessage` → `flags.<module>.-=castApply` | every Battle Master maneuver's usage card is kept OFF the cast slice one hook after polish.js stamps it (Bait and Switch ships twelve "Baited AC" effects, one per face) |
| `updateChatMessage` → the cast slice's choice | a listed cast's `castApply.choice` is stamped pending at birth (polish.js); the caster's answer is a flag write on their own card, and this hook is how the elect learns of it and applies the pick (cast.js) — the card-as-bus shape of every answer in the module |
| `updateChatMessage` → the resource flash for a HAND spend | a die the module spends itself (Parry at the hold, the hit menu at the damage) has no dnd5e `system.deltas`; its `poolSpend` record lands by a flag write, and resources.js flashes it from this hook exactly as it flashes a use's deltas from `createChatMessage` — one reader (`shared.js poolSpendsOn`), one wording (`spendLine`) |
| `updateCombat` (core) · `tokenTurnStart` (the region event) | the emanation NOTICE at the caster's turn start (Aura of Vitality) rides the combat's own update; the emanation HEAL at a member's turn start (Aura of Life) rides the region's own event beside the turn-end one |
| **Regions (core)** — `RegionDocument.createTokenEmanation`, `Region.attachment.token`, `region.tokens`; the events `tokenEnter` / `tokenExit` / `tokenTurnEnd` / `behaviorActivated` / `behaviorDeactivated` delivered to a behaviour type registered through `CONFIG.RegionBehavior.dataModels` (the way dnd5e registers difficult terrain; the subtype declared in `module.json` `documentTypes`); the hooks `createRegion` / `deleteRegion` / `updateRegion` / `updateToken` | emanations.js: the aura's area is the platform's — shape, attachment, membership and events — and the module only decides what it hands out. Since dnd5e 6.0 an activity's area IS a Region (`TemplatePlacement.fromActivity`, stamped `flags.dnd5e.activity` — the tie every path keys on — `item`, `origin` = the usage TOKEN, `spellLevel`, `dimensions`); `Scene#templates` is deprecated at Foundry 14 and the `*MeasuredTemplate` hooks never dispatch — saves/areas.js rides `createRegion` / `updateRegion` and sweeps Regions; a placed region is NO concentration dependent, the `deleteActiveEffect` sweep ends a duration area — the saves machine's for a cast with a demand, emanations.js `endConcentrationAreas` for every other concentration cast (the areas the caster's client tied to the concentration effect at the cast, `areas` on the effect written at `dnd5e.postUseActivity`; the activity match only for an untied area nothing else can claim — Fog Cloud). ⚠ `region.tokens` is filled by `RegionDocument#updateTokens` with `noHook: true` — a just-raised ring's membership lands silently, so every membership floor tests geometry itself (`tokensInRegions`). The platform's own `dnd5e.*` behaviours are refused on any region this module adopts (`preCreateRegionBehavior`) |

### Version pinning

`module.json` pins the whole dnd5e 6.x line (6.0.0 → 6.9.99) and Foundry v14; the verified
version is the one `module.json` names. This module rides system workflow hooks and churns with
dnd5e minors — that churn isolation is why it is a sibling module rather than a feature of
another.

### The API-drift rule

Every fact about dnd5e's internals that the code depends on is recorded **at the line where it
bit, with the version**, and mirrored in [NOTES.md](NOTES.md). A behaviour we cannot assert
from a public hook is a behaviour we must verify live, not assume.

**A hook name the system never dispatches registers cleanly and does nothing forever.**
`npm run dispatch` ([§10 D10](#10-known-architecture-debt)) asserts every `dnd5e.*` hook this
module registers is one dnd5e dispatches, against a set **generated from the installed system's
own source** and pinned to the version `module.json` verifies. ⚠ **A dnd5e upgrade is a two-step
act:** bump the pin, then `node tools/check-hook-dispatch.mjs --regen`, then **read the diff** —
a name that disappeared is a registration gone silent. CORE hook names cannot be checked this way
(measured 2026-08-23: Foundry's minified client bundle yields 0 of the 15 then registered); a core
name that goes away is seen only by the hook-coverage report (§11 *Adding a TEST* rule 6).

---

## 10. Known architecture debt

This register is for what is OWED: a row names the rule it violates and the evidence. **Today
nothing is owed.** Every past row is closed, dropped by decision, or parked in BACKLOG; the
ids stay because code comments cite them.

| # | What it was | Where it went |
| --- | --- | --- |
| **D1** | `hold.js` carried shared services six machines imported | closed 2026-08-23 — `core.js` (§3) and `settings.js`; §7 *The dependency rule* |
| **D2** | the hold off the moment spine (`closeAnsweredPopups` in ui.js, reading the hold flag by string) | closed 2026-08-23 — `closeAnsweredHoldPopups` on `livePopups`; `smoke-twoclient` §close |
| **D3** | per-target read-modify-writes outside the serializer | closed 2026-08-22 — §4 law 2; §11 *Converting a write to the serializer* |
| **D4** | a flag accessor layer | dropped by decision 2026-08-23 — *Decided against*, below |
| **D5** | DECISION logic inlined in EDGE handlers | repaid 2026-08-22 — `scripts/decide/` (§2, §7) |
| **D6** | the `ui.js` ↔ `hold.js` cycle | closed 2026-08-23 — the view rule, §7; the two remaining cycles are permanent (*Decided against*, below) |
| **D7** | no static gate | closed 2026-08-23 — `npm run verify`, the type checker over `decide/` and, since 2026-09-28, the damage chain |
| **D8** | post-roll folds as one feature's special case | closed 2026-08-23 — `ATTACK_FOLDS` / `SAVE_FOLDS`; §11 *Adding a FOLD* |
| **D9** | machine → machine import edges | (a) (b) repaid 2026-08-23, (c) (d) 2026-09-05, (f) 2026-09-04 (§7 *The offer's contributions*); what stands is parked — BACKLOG *The two sideways edges*, *Two clock residues*; `npm run layers` reports the one surviving edge (`saves/verdict.js → receipts.js`) as PARKED, not OPEN, since 2026-10-15 |
| **D10** | a hook name the system never dispatches | closed 2026-08-23 — `npm run dispatch`, §9 *The API-drift rule* |
| **D11** | nothing proved a registered handler ever ran | measured, not a gate — `hook-coverage.mjs` + `claim-proof.mjs`; reading them is the standing obligation, §11 *Adding a TEST* rule 6 |
| **D12** | Foundry 14 never dispatches the `*MeasuredTemplate` hooks | closed 2026-09-16 — the 6.0 pass made every area a Region and the registrations left with the pin (515379f); §9, the Regions row |

⚠ **A ledger that declares itself empty is how the next drift gets in, and a debt row's evidence
goes stale as silently as code.** Re-measure before believing a row; add one the moment
something structural is genuinely failing a rule, with the rule and the evidence.

---

## 11. Adding something new — the checklist

**Adding an ability** (a new reaction, rider, volley spell, maneuver):
1. Is its KIND already in the code? → **one registry or list entry. Stop.**
2. If not: is this genuinely a new kind, or a special case of an existing one?
3. If genuinely new: add the kind, count it against the R4 tripwire, and record why.

**Converting a write to the serializer** (`queueFlagWrite`, §4 law 2):
1. **Repeat the guard INSIDE the lock** — another writer may have made it false since. Return
   `false` when there is nothing to record, so a no-op never churns a render.
2. ⚠ **Check EVERY LATER USE of the old local variable.** Once the mutation moves inside the
   callback, the local clone is stale (a clock never disarmed; a losing racer that still
   announces). Re-read after the write, and gate follow-ups on a `claimed` result.
3. Not every write needs it. A single-decision object with one writer (concentration's ask,
   mastery's own flag) is not a per-target read-modify-write and the argument does not reach it.
4. `delete current.x` inside the callback WORKS: the serializer diffs the clone against the
   stored flag and writes the platform's `"-=x": null` for every key that went missing
   (`markDeletions`). Objects recurse; an array is replaced whole.
5. `hold`, `receipt` and `effectReceipt` have ONE write path: `npm run writers` fails a
   `setFlag` of any of them that is not a stamp (a fresh object literal). Every other flag:
   `npm run serializer` fails a raw `setFlag` built on what was read (§4 law 2); a one-writer
   flag that stays raw (rule 3) is pinned there, by file, function and flag, with its reason.
6. A flag that is a list or a map (an effect's `rerollUsed`, a region's `initial`) passes
   `initial` — `[]` or `{}` — so the first write starts from the right shape.

**Gating on a GM** (several GM clients, §4 *The flow elect*):
1. `game.user.isGM` is true on EVERY GM client. Behind it goes only what a GM screen shows (a button, a popup, a
   control, a view) or a write each GM client makes for itself; `npm run gmsites`
   ([tools/check-gm-sites.mjs](tools/check-gm-sites.mjs)) fails an `isGM` read until it is tagged in its `ALLOW`
   (presentation, own or role, with the count and the reason). A consequence gates on `isActiveGM()`.
2. A record's landing is claimed with `claimLanding` (core.js) and its `pending` reads the claim through
   `claimHolds`; the same check fails a raw `applying = true` and a bare `!flag.applying` outside core.js. A
   landing that makes documents stamps them with its card, so a re-drive over a dead claim can remove them first.
3. A popup that every GM screen may hold closes on the others when the answer lands (`closePopup` on the update).

**Adding a RECORD** (a new flag key the module writes — a moment's state, a resolve, a fingerprint):
1. `npm run moments` fails until the key is classified in [decide/moments.js](scripts/decide/moments.js):
   a **resolve** (a `MOMENT_RECORDS` row; the gate publishes it, nothing else to write) or
   **state** (a `STATE_KEYS` reason). A file that writes the world is pinned in `WORLD_WRITERS`
   ([tools/moment-writers.mjs](tools/moment-writers.mjs)) to the record its write resolves into.
   Classify, do not curate — whether the moment gets a picture is the consumer's.
2. A new WORD is a contract change: `MOMENT_WORDS`, the version in events.js, §7 *The moment
   events*, and FX Studio's ARCHITECTURE §2 — in the same commit.
3. Another unit reads it? Its owner exports a reader (§4 *Who reads a record*) and `OWNERS` in
   [tools/check-flag-edges.mjs](tools/check-flag-edges.mjs) names where it sits; `npm run flagedges` fails a read of the
   key by name anywhere else. A written key the scan cannot see (a constant the file does not declare or
   import, a flag object it cannot follow to its literal) fails `npm run moments`.
4. **It joins the contract** (§7 *The contract files*). `npm run contracts` fails until
   `node tools/contracts.mjs --write` lists the key (and a new word or companion hook the same way);
   the next recording run (the battery records every suite) and `--write` give it its shape, and
   `contracts/` is committed with the change. A field another repo reads that is renamed or removed
   moves the file's `version` (`MOMENT_CONTRACT.version` for the moments, in the same commit as step
   2's); a new field does not.

**Adding a FOLD** (anything that changes an already-rolled outcome after the fact — a reroll,
an added die, a reaction that moves AC):
1. It is an entry in `ATTACK_FOLDS` or `SAVE_FOLDS` ([decide/verdict.js](scripts/decide/verdict.js))
   plus whatever stamps the flag. **If you are adding a parameter to `hitsAmong`, stop** — that
   is the debt D8 closed, and it grows back one parameter at a time.
2. Pick the contribution shape, and pick it honestly: `add` for a die, `replace` for a REROLL
   (it carries its own crit and fumble — a rerolled natural 20 crits, which is why it cannot be
   an `add`), `ac` for a defender-side change, `verdict` only when there is genuinely no
   arithmetic to do (the negate hold). There is no `{dc}` shape: the ask owns its DC.
3. **Never re-introduce precedence.** Folds COMPOSE (user ruling 2026-08-23): the attacker's
   move the total, the defender's move the AC, one verdict at the end. *"The defender always
   wins"* silently eats a spent resource; *"last fold wins"* tests the new total against the
   stale snapshot AC.
4. ⚠ **If it can turn a HIT into a MISS, it owes the table a revert** (user ruling 2026-08-23):
   the module **auto-reverts its own receipt**, on `revertPlan`/`revertableEffect` in
   [decide/receipt.js](scripts/decide/receipt.js). Nothing ships that can yet; the first feature
   that can builds it, and does not ship without. ⚠ **The `roll` interrupt (2026-09-24) turns a
   hit into a miss and owes none:** it answers inside the hold, whose claim keeps the damage from
   applying until the verdict, and a crit it could undo is not even rolled (`hold.critAtStake`).
   The damage-side cousin — a total that MOVES after the dice (Empowered, Savage Attacker) —
   moves damage already applied by the difference, one receipt (`auto-apply.js`
   `moveAppliedDamage`, lifted for its second customer the same day).
5. Unit-test the arithmetic — this layer decides whether attacks land, and a mistake here
   produces wrong outcomes that look fine in review.

**Adding a moment:**
1. Compose the spine (§5). Do not write a clock, a latch, a bar or a popup. The card's pending row is
   `pendingRow` (bar, latch, answer, arm), a withdrawn question closes through `closePopup`, and an opener
   of its own dialog asks `frontPopup` first (§5 *The pending row*); `npm run popups` fails a latch, an
   Answer button, a `livePopups` read or a close the machine draws itself. Its card goes out through `postCard`
   and a relayed answer through `postAnswer`, the recipients one of core.js's sets (§5 *The card*; `npm run
   cards`); its pick is drawn by `pickInputHTML` and read by `picked` / `pickedAll` / `pickInputs`, a bystander's
   choice is `choicePopup` (§5 *The pick*; `npm run pickers`). Its popup opens through `openMomentPopup`, a
   dismissal and a popup's own clock as its `onDismiss` and `buzzer`, a yes or no as `confirmPopup` (§5 *The
   popup*); `npm run popups` fails a DialogV2 built anywhere else.
2. Walk the six steps and the twelve laws explicitly; each is a review checkbox.
3. Name its answer channels — a moment with one channel is usually missing the AFK fallback.
4. Add its receipt and its expiry default. A moment with no default outcome is not finished.
5. ⚠ **If it registers a system hook, its live suite must assert that hook FIRED** — not that it
   was registered. `npm run dispatch` proves the NAME is real; only a live assertion proves the
   handler ran (§10 D10, D11; `smoke-d20-folds` §4 is the worked example).

**Adding a file:**
1. Declare its layer (§2) in its header comment **and in `LAYER_OF` in
   [tools/check-layers.mjs](tools/check-layers.mjs)** — the gate fails on an undeclared file. A
   PART of a directory machine (§7) also declares its group (`GROUPS`).
2. Depend downward only (§7). If you need a service from a machine, the service is in the wrong
   file. If the edge genuinely must exist, it goes in that tool's `ALLOW` with a REASON and a
   disposition — and an `OPEN` one is recorded in BACKLOG *The two sideways edges* as well.
3. Register its hooks through `listen` (§7 *Registration order*), add its row to `ORDER` in
   [dispatch.js](scripts/dispatch.js), and run `npm run hooks && npm run dispatch`.
4. Register nothing at module-eval time except hook callbacks.
5. Move `EXPECTED_SOURCE_FILES` in `tools/check-registry.mjs`, and fix the docs that quote it.
   The count is pinned precisely so adding a file is a decision, not a drift.

**Adding a TEST — the tier rule (the standing rule, 2026-08-23):**

> **If an assertion does not need a live world, it does not belong in a live suite.**

1. Can it be decided from plain objects? → a **unit test** under `tests/`. 825 of them run in
   seconds with no Foundry, no browser and no fixtures (`npm run test`, 2026-09-24, after Slice A).
   That is the default, not the fallback.
2. Does it need `game`, `canvas`, a document or the DOM? → a live suite, and then it must join
   an existing **section** or declare a new one (`SECTIONS` + `DEPENDS` at the head of the file),
   so it can be run alone by `--section`.
3. **Never `sleep()` for a thing you can wait for.** Every wait is the prelude's
   ([tools/prelude.mjs](tools/prelude.mjs), `window.__btb`, installed by the harness before any
   suite body): `until()` on **what the next assertion reads** (the card, the banner and the
   rendered line arrive separately), which THROWS with its label when the thing never comes, and
   `section(id, fn)` so that throw fails one section by name. A window in which a WRONG behaviour
   must not appear is `watch(test, { ms })` on that behaviour. A bare `sleep` is left only for a
   module clock (a decision timer, a buzzer, a module's own setTimeout window) and carries a
   `clock:` comment naming it. `npm run harness` ([check-harness.mjs](tools/check-harness.mjs))
   holds it: no suite on the prelude defines its own sleep, poll, `ok`, `want`, settings
   snapshot or dice rigging, and each suite's bare waits stay under a ceiling that only goes down.
4. The full live battery of 2026-09-23 ran 30 rows in 62 minutes (`battery.mjs`). Without rule
   1, test time grows in lockstep with feature count forever.
5. **A change runs its own suites, not the battery (2026-09-23, user ruling).** Every live suite
   declares `export const COVERS = [...]` beside its `SECTIONS` (the machine files its sections
   drive); `node tools/battery.mjs --changed --list` prints what a change must re-run and why, and
   `--changed` runs it. The map is checked both ways in the gate (`npm run coverage`,
   [check-coverage-map.mjs](tools/check-coverage-map.mjs)) — an unclaimed machine fails, and
   there is no allowlist. ⚠ **A spine change is the full battery**, and so is a `decide/` file
   the spine imports: `shared.js` and `auto-apply.js` reach every machine. **The full battery is
   the floor before a release**; nothing smaller is. A full run red by one to three suites is run again, and
   a second run red on different suites, each green alone, releases as a pair (RULINGS *The two-run rule*; the
   line `battery-status.mjs --line <A> --and <B> --one-offs <C>` prints).
6. **The battery ends with two readings, and somebody reads them** (§10 D11): which
   registrations FIRED ([hook-coverage.mjs](tools/hook-coverage.mjs), armed in
   [harness.mjs](tools/harness.mjs) `connectSuite`), and which `COVERS` claims the published
   moments prove ([claim-proof.mjs](tools/claim-proof.mjs): PROVEN when a record kind only that
   file writes was published in that suite). Both are **reported, never enforced** — a gate on a
   rare hook gets tuned out. **Do not let a never-fired line or an UNPROVEN claim sit
   unexplained across two releases:** only a person can say whether it is a coverage gap, a dead
   handler, a rare hook, or behaviour no record shows. `init` is unobservable by construction; a
   platform hook never dispatched is pinned in `NOT_DISPATCHED_HERE`, checked both ways; the
   claim proof hears the tester's page only, so two-client suites read low. Last full reading
   (the battery of 2026-09-23): hooks 56/56 observable names and 211/211 registrations fired;
   claims 76/84 proven, the 8 UNPROVEN triaged (four `polish.js` non-record behaviours, four
   two-client suites reading low).

**Moving code between files** (an extraction, a split, a reorder):
1. **Cut on function boundaries, never comment boundaries** (`grep -n "^function "`). A `/**`
   block does not reliably belong to the function beneath it — measured 2026-08-22, eight in
   this tree did not.
2. **Check the comment either side of every block you move**, and move a doc with the code it
   describes, or fold it into whatever replaced it.
3. `npm run comments` (`tools/check-comments.mjs`) catches a stranded block; it cannot tell you
   the prose is now wrong.
4. **Move, do not rewrite.** Flag shapes, setting keys, list defaults, table keys, rules text
   and card copy do not change in a move, and no lint cleanup rides inside a move commit.

**Reading a uuid or a token, writing a console line** (§7 *One door each*; `npm run lookups`):
1. A uuid goes through core.js `resolveUuid` / `resolveUuidAsync`, and the site meets null; never `fromUuid` or
   `fromUuidSync` itself.
2. A token goes through geometry.js: `tokenDocOf` for the document, `tokenOf` for the token on the canvas,
   `tokenOnScene` for a named scene, `tokensOf` for every one. A site whose question is genuinely another is
   pinned in check-lookups' `TOKENS` with its reason.
3. A console line is `log.warn` / `log.error` / `log.info` / `log.debug` (core.js), its words without the title;
   Biome fails a console call, and a suppression stands only in a leaf that cannot import core.js.

**Writing a comment** (the rule `tools/check-comments.mjs` enforces in `scripts/`):
1. Say what the code does and why, in the present tense. A why is a constraint of the platform, a
   rule of the game, or a hazard the next edit could walk into.
2. No history: no dates, no quotes of the user, no walk, slice, phase, session or release story, no
   "was" or "used to". A ruling lives in RULINGS, a measured platform fact in NOTES, history in git.
3. Keep it short. A `/**` block says what a function answers and its contract; a line comment marks
   a hazard (⚠) or a step that is not obvious. Code that reads plainly gets no comment.
4. Point, do not copy: name the doc and its section instead of restating it.
5. A commit that only touches comments starts its subject `comments:`, and CI proves the code did
   not change (`tools/check-comment-only.mjs`).

**Writing HTML** (a card row, a popup, an effect's description):
1. A name a player can set — a creature's, an item's, a scene's, an image path — goes through
   `esc` (decide/present.js; `attr` inside an attribute). `npm run html`
   ([tools/check-html.mjs](tools/check-html.mjs)) fails on one that does not.
2. A card's `lines` are HTML, so a name inside a line is escaped there too; `eyebrow`, `title`
   and `subtitle` are text and `bfCard` escapes them itself.

**Any change:**
1. Which north star does it serve? If none, it is not in scope.
2. Does it add a required GM click? → redesign (N4).
3. Does it store a number that content already knows? → read it instead (N1).
4. Does it apply anything without a receipt? → not finished (R5).

---

## Appendix — Measured costs and decisions against

PLAN.md tracked the structural passes and was retired on 2026-09-24; its full text is in git
history (`git show 7377020:PLAN.md`). Two things from it have no other home.

### What each pass cost, against its estimate

Quoted from each pass's *HOW IT WENT* block and stage marks. **Distrust the risk labels;
re-measure before scoping** — on every pass below the thing labelled risky was cheap and the
surprise came from elsewhere.

| Pass | Estimated | Measured | Date |
| --- | --- | --- | --- |
| Enforcement pass (`npm run layers`) | +1 static check; "~17 machine→machine" edges; six lazy sites; D9 "record 3, repay 2" | 9 static checks; 11 pinned pairs / 12 sites, 8 pairs / 9 sites after Stage 4; nine lazy sites; 7 recorded, 3 repaid, 4 standing with reasons | 2026-08-23 |
| Foundation Stage 1, `sleep()` → wait | ~4 minutes recovered | 213s of sleeping, 73s of it under an assertion that something did NOT happen (load-bearing); smoke-volleys 33.7s → 0, smoke-resources 33.3s → 0.6s | 2026-08-23 |
| Foundation Stage 3, two-client coverage | "the least certain work in this plan" | the cheapest stage; `smoke-twoclient` 9/9 first run | 2026-08-23 |
| Machine-tier, Stages 0 → 3b | 5 sessions | the first window, one day | 2026-09-05 |
| Machine-tier, Stage 4a (maneuvers split) | 1 | about 1 | 2026-09-05 |
| Machine-tier, Stage 4b (mastery split) | 1 | about ½ | 2026-09-05 |
| Machine-tier, Stage 4c (saves directory) | 2 | about 1 | 2026-09-05 |
| Machine-tier, Stage 5 (who drives) | ½ | about ½; battery at HEAD 28/28 | 2026-09-06 |
| Hold directory | about 1 session | about one hour to the family suites green, one more for the docs and the battery (28/28, 39m 39s) | 2026-09-05 |
| Metamagic, Stages 0 → 4 | four to five sessions (½, 1, 1, 1–2, 1) | one day (~1, ~2, ~2, ~2, ~3 hours); battery 40 minutes, 25 suites, 181/181 registrations fired | 2026-09-09 |

### Decided against, and why

- **D4, the flag accessor layer — dropped (2026-08-23).** ~300 call sites (re-counted 2026-09-05:
  about 295 `getFlag` reads over about 76 keys); D3 already repaid the correctness half through
  `queueFlagWrite`; knip means it arrives all at once or not at all; it buys nothing a test can
  assert. Re-opening it is the user's call.
- **`hold/` ↔ `auto-damage.js` — permanent.** The service stamps the hold on the roll it rolls
  (`stampHoldIfInterrupted`), and the hold's continuation rolls the held crit through the service;
  both calls are hoisted functions at hook time. The hook order is the dispatcher's table, not the
  cycle's.
- **`auto-apply.js` ↔ `mastery.js` — permanent.** Breaking it moves `applyDamagesWithReceipt`,
  the damage chokepoint — low value, real risk.
- **The page-helper bundle for live suites — not built (2026-08-23).** `f.evaluate` cannot
  import, and smoke-hold's size is its scenarios (1,000 of 1,700 lines), not its helpers; "cuts
  every suite roughly in half" was never measured.
- **Per-suite world rollback — rejected** (`world-snapshot.mjs`, 2026-08-22: the copy is 0.054 s,
  the world bounce ~75 s, more than every `sleep()` in the tree). The battery rolls back once
  (`battery.mjs --snapshot`); suites keep their teardowns so any one runs alone.
- **TypeScript and a bundler — no** (user call, 2026-08-22). JSDoc + `// @ts-check`; the
  no-build WebDAV hot-deploy is worth more. What ships is what is written.
- **The light saves cut — overturned (2026-09-05)** for the directory, the long-term shape.
- **The withhold hand-back as a resumable — not taken (2026-09-05):** it would add an elect-side
  resume and a reload resume that no two-client suite pins.
- **An index for the whole-log scans — parked** (measured 2026-09-05: 35 sites, 13 in saves). The
  fix is an index by flag when a world's age makes it visible, never a tail window.
- **An architecture pass before the sweep — not taken (user, 2026-09-24, the long-term order;
  BACKLOG *The long-term order*); TAKEN 2026-09-27, once the PHB feats were done** — the refactor
  and recalibration, measured against the peers' repos, DELIVERED 2026-09-28 (its commission's
  record is git history). Comment lines in `scripts/` 39% to under 18%, none dated; settings 65 to
  10; content found by `system.identifier`, not English names; 258 copied rule strings to 0 (read
  from the book); 310 `Hooks.on` sites to one dispatcher with an `ORDER` table; the one-client
  writer and HTML-escape checks; a release published only by CI from a green tagged commit
  (NOTES §5 *Release*). What follows is the 2026-09-24 reasoning. The machine-tier pass already did it, and the registry model
  exists so a sweep row costs minutes. The structural work worth doing is the sweep's own, each
  piece built by the feature that proves its shape (Slice A built the `roll` interrupt kind and
  the damage-dice fold that way). [decide/registry.js](scripts/decide/registry.js) is split when
  a slice lands and it hurts, not before.
