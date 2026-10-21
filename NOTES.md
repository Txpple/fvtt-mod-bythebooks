# NOTES.md — working knowledge

> **Not binding. Just expensive.** Everything here cost a debugging session, a live table
> failure, or a night of phantom test results. None of it is obvious.
>
> [DESIGN.md](DESIGN.md) is what the module is for, [RULINGS.md](RULINGS.md) the feature rulings,
> [ARCHITECTURE.md](ARCHITECTURE.md) how the code must be shaped. This page is what we measured
> building it: each note is the fact, the date, and the probe or suite that measured it. How it
> was found lives in git. Most are also commented at the line where they bit. **Do not
> rediscover them.**

---

## 1. Foundry v14

⚠ **`toggleStatusEffect` is unreliable in both directions, and the failures are opposite.**
Adding (`{ active: true }`) silently no-ops when ANY effect carrying the status exists —
including a *disabled* leftover (the live "topple failed but nothing fell prone"). Removing
(`{ active: false }`) deletes only the **canonical-id** carrier (`dnd5eprone000000`-style),
leaving custom-id carriers immortal — and it deletes without re-checking the effect is still
there, so a concurrent removal makes it THROW `ActiveEffect "dnd5edead0000000" does not exist!`
(2026-08-24). That race is ordinary: raising a pool above zero is what makes dnd5e clear `dead`,
so code that heals and then tidies the mark races the system every time. Put statuses on through
`forceStatus` (enable a disabled carrier, build the effect directly with an `origin`, verify it
landed, log loudly if not) and off through `clearStatus` (delete every carrier by its own id,
re-read before each delete, a lost race is success, never throw).

**Never key persisted data by uuid** — [ARCHITECTURE §4](ARCHITECTURE.md) *The four state laws*,
law 1. Per-target state is an array of entries with a `uuid` field.

⚠ **An async hook handler's throw is invisible, and so is a click listener's.**
`Hooks.on("x", doc => { void f(doc) })` and `button.addEventListener("click", () => doThing())`
both discard the promise; a rejection becomes an unhandled rejection nobody logs. When
`revertTarget` began rejecting on the status race above, the symptom was two writes that quietly
did not happen. Anything fallible in a fire-and-forget handler needs its own try/catch with a
`log.error` (core.js, the one console door). **A suite that drives a button listens on
`window.addEventListener("unhandledrejection", …)`** — the one channel a no-catch listener fails
on (`smoke-bythebooks` §4c).

**A message renders into several DOM trees** — chat log, the notifications pane, popouts. A
"once per message" latch inside a render hook fires on a tree that gets replaced while the
on-screen ones skip. **Render hooks must be stateless.** (Also why `querySelectorAll` over a
message's controls returns each button more than once.)

**ESM evaluation order is import-graph order, not entry-list order**, and inside an import cycle
a module's body can run before a module it imports: a `const` there is still in its dead zone
when the other side calls in (the offer-part store hit it, 2026-09-28). The module's hook order
is therefore not evaluation order but the dispatcher's table — [ARCHITECTURE §7](ARCHITECTURE.md)
*Registration order is the dispatcher's ORDER*. Relative order between same-hook handlers can
be behavioral because `Hooks.call` stops at the first `false`.

**A CSS animation is not instantiated until its element is actually rendered**, and a chat
message is first inserted into a tree that is not rendering yet: a card's countdown bar reported
zero animations a second after render, then drained from zero seconds behind an identical bar in
a popup. `animation-delay` cannot fix it. Build timed visuals with `element.animate()` and set
`currentTime` from an absolute deadline.

**Detached render trees hold un-upgraded custom elements.** `tray.open = false` writes a plain
property that shadows the accessor and never touches the attribute. Use `toggleAttribute` — what
the system's own collapse code does.

**A synthetic (unlinked-token) actor rebuilds its embedded collections from the delta on every
write**, so deleting documents one at a time throws `Item "…" does not exist!` on the second
call. Collect the ids and make **one** `deleteEmbeddedDocuments` call per collection.

**`PIXI.Circle.contains` is boundary-inclusive** — a point exactly on the rim is inside. Keep test
fixtures off the razor's edge.

**On a headless client, embedded MeasuredTemplate plumbing is half-dead**: `createMeasuredTemplate`
never dispatches for an embedded create, `tpl.update()` resolves without applying, and template
canvas objects never grow a `shape` (an await against one never returns). The render hook is the
reliability floor, CRUD hooks fast-paths only, containment reads document geometry, nothing
awaits canvas readiness. (Since dnd5e 6.0 no activity creates a MeasuredTemplate at all — §2
*The dnd5e 6.0 pass* §2 I.)

**`getSpeaker({actor})` resolves through the actor's oldest active token on the *viewed*
scene.** A stray unlinked fixture token made every programmatic save resolve to a synthetic token
uuid that never string-matches a linked snapshot entry. The module's exact-uuid match is right
for every real-table shape; the fix is harness protocol (sweep stray tokens).

⚠ **A MEASURED TEMPLATE IS A REGION, AND THE `*MeasuredTemplate` CRUD HOOKS ARE NEVER DISPATCHED
(v14.365, 2026-08-24, `tools/probe-surfaces.mjs`).** Creating one moves `scene.templates` 0→1
**and** `scene.regions` 0→1, and the hooks that fire are `preCreateRegion` / `createRegion` /
`drawRegion`; an update dispatched nothing at all; a delete fired the Region trio.
`documentName` still reads `"MeasuredTemplate"`, so a `createMeasuredTemplate` listener registers
cleanly and does nothing forever — and the dispatch gate cannot catch it (§2 *dnd5e declares its
own hooks*: the extraction recovers 0 of 15 core names). `smoke-saves` §8 had counted that zero
for eight days before anyone asked why: **to settle a hook question, wrap
`Hooks.call`/`callAll` and print every name that fires around the action** — the delta names the
real hook instead of confirming a guess.

**PowerShell's `-Encoding utf8` writes a BOM**, which breaks `JSON.parse` for Foundry and the
deploy tooling. Edit `module.json` with editor tools, never shell rewrites (a `-replace` pass also
mangled its em-dashes). Editor writes can flip a file to CRLF against an LF `HEAD`; check
`git diff --numstat` before committing.

### v14 owns effect expiry — per effect, against the ORIGINATING combatant (2026-09-01, `tools/probe-expiry.mjs`, pinned by `tools/smoke-expiry.mjs`)

**The clock.** v14's schema is `start: {combat, combatant, initiative, round, turn, time}` plus
`duration: {value, units, expiry, expired}`, where `expiry` is a combat EVENT — `turnStart`,
`turnEnd`, `roundStart`, `roundEnd`, `combatStart`, `combatEnd` — **defaulting to `"turnStart"`
the moment a numeric `value` is given.** The old keys still write (core shims `rounds` →
`value/units`, migrates `startRound` → `start.round`). `duration.type` is a deprecated getter
(warns once, gone at v16) — read `units`/`value`/`expired`.

**Who it is judged against.** `ActiveEffect.registry.refresh(event)` runs on combat/round/turn
start and end, `combatRewind` and `updateWorldTime`; `turnStart` matches when the current
combatant IS the effect's `start.combatant`, `turnEnd` when that combatant's turn just ended. The
platform's own stamp is whoever's turn it is at creation (`_preCreate` → `getEffectStart()`), and
user-written `start` keys win — so an effect applied on somebody else's turn (an opportunity
attack, a reaction) is judged against the WRONG creature unless the writer names the right
combatant. `decide/chips.js` does. `_preCreate` fills only `undefined` keys (an explicit `null`
survives), but `combat: null` does not make a chip time-based while the BEARER is tracked: the
prep and `isExpiryEvent` fall back to the bearer's own combatant (review finding 20, measured and
refused).

⚠ **`turnEnd` and `roundEnd` refreshes do NOT recompute remaining time.** A window meant to close
at the end of the turn it was written in must already read zero: `{value: 0, units: "turns",
expiry: "turnEnd"}` is *"until the end of this turn"*; `value: 1` lives a whole round longer.

**Expiry is MARK, not delete, and it is GM-side.** `CONFIG.ActiveEffect.expiryAction` is
`"update"` (dnd5e did not override it at 5.3.3): the registry stamps `duration.expired: true` —
dnd5e's *Unavailable Effects* — only when `game.users.activeGM?.isSelf`. `"delete"` is a WORLD
policy; a module tidies its own on the `updateActiveEffect` that carries `duration.expired`.
**Suppression keys off the flag, not the arithmetic:** `isSuppressed` is
`!!(system.isSuppressed ?? duration.expired)`, `active` is `!disabled && !isSuppressed`, and an
effect with `remaining <= 0` keeps applying until the flag is written. `isTemporary` is
`!!expiry || Number.isFinite(value)`, so `value: 0` is still Temporary.

⚠ **Zero on the clock is ALIVE (2026-09-01, the review's first finding).** A `rounds` window is
measured from `start.round` against the current round, so a one-round chip reads `remaining: 0`
from the START of the round its boundary falls in; `expired` is written only at the event.
Reading zero as dead dropped Vex on the one turn it exists for. Dead is the platform's mark, or a
NEGATIVE clock (the no-GM fallback, arriving the round after) — `decide/chips.js` `chipIsDead`;
`smoke-expiry` §10. **The mark arrives as ONE batched update per parent, one
`updateActiveEffect` per effect, synchronously** — a tidy that deletes per hook call makes the
one-at-a-time delete the synthetic-actor note forbids; collect per parent, flush on a microtask.

⚠ **`ActiveEffect#start.combat` is a ForeignDocumentField** — the Combat, or null once deleted;
read `.id` for a stamp. `getCombatantsByActor` matches a synthetic actor by TOKEN id and a linked
one by actor id, and a synthetic actor's `id` IS its base actor's — so `cb.actor?.id === actor.id`
says "in combat" for a goblin whose SIBLING is tracked, and the chip gets a null `combatant`:
immortal. Match the platform's way (core.js `activeCombatFor`, review finding 4).

⚠ **`DialogV2` ALWAYS has a default button.** With none flagged the FIRST is default, autofocused,
and every button is `type=submit` — Enter, even in a text input, presses it. "No default" on a
three-mode popup meant "Advantage on Enter"; the gate marks its NET (user ruling 2026-09-01,
`decide/present.js` `modeButtons`).

⚠ **`canvas.grid.measurePath().distance` is in the SCENE's units** (`scene.grid.distance` per
space, labelled by `scene.grid.units`, a free string dnd5e never maps): two squares on a 1.5 m
grid read "3"; the Prone rule is 5 FEET. Convert through `dnd5e.utils.convertLength` after
folding the units string (`decide/geometry.js` `lengthUnitKey`); an unreadable unit is "distance
unknown", never feet.

⚠ **Out of combat there is NO clock.** The only tick is `updateWorldTime` (the calendar HUD, or a
rest with *Advance time* ticked). A `rounds`/`turns` effect with no combatant is reframed as
seconds and measured against world time: the PREPARED `effect.duration` reads `{value: 6, units:
"seconds"}` while `_source.duration` keeps what was written (assert on `_source` for the window),
a 6-second chip sits at "6 seconds remaining" forever, and a `turns` effect reads `remaining:
Infinity`, label *"None"* — never null (every `_prepareDuration` path assigns a number or
Infinity). **Turn-shaped windows have no end outside combat; the event that spends them is the
only close, and that is the rule, not a gap.**

⚠ **`game.combat` IS THE COMBAT THIS CLIENT IS LOOKING AT.** It is `ui.combat.viewed` whenever the
tracker is rendered (`Game#combat`, read 2026-09-03; only with no tracker does it fall back to
`combats.find(c => c.isActive)`). Three things read it: the platform's implicit `start` stamp,
`Actor#inCombat`, and `activeCombatFor`. A client viewing another map sees no combat: its effects
land time-based, and because world time advances six seconds at every round boundary, the
`updateWorldTime` refresh expires chips on the TICK (`tools/probe-expiry.mjs`, first run, by
accident). A stale GLOBAL encounter stayed viewed over a suite's freshly created, started,
activated combat, and nothing a suite did would take the view from it (`Combat#activate` does not
change what is viewed) — it was deleted (user's call). Suites view the range before creating a
combat; a table with two encounters standing should expect the module to follow the tracker. The
chips' explicit `start.combat` keeps their remaining-time arithmetic honest on any client, not the
world-time path.

⚠ **THE MARK IS SUPPRESSION, and a PACK effect the module applies is on this clock too
(2026-09-10, the table's stale-Shield report, `tools/probe-shield-leftover.mjs`, pinned by
`smoke-hold` §9).** An expired effect nobody deletes stays on the sheet under *Unavailable
Effects*, granting nothing, with `disabled` still false. (1) **Any reader that means "is this
standing" reads `active`**, never `!disabled` (`hasReactionEffect` read `!disabled` and told the
offer gate Shield was up over an AC that had gone back down). (2) **An effect the module applies
from a pack is the module's to clock and to tidy**: the reaction's effect takes the Reaction
chip's clock (zero turns at the REACTOR's turnStart, via `applyEffectsTo`'s `clock`), `tidyOwns`
covers it, and a refresh over a leftover writes `expired: false` explicitly — the platform never
clears the mark on its own.

### A TEMPLATE with a `start` is tracked like a live effect — and marked expired on the item (2026-09-21, the walk)

**The registry tracks any embedded effect that is temporary, active and has a non-null `start`
— it never asks whether the effect is an application or an item's TEMPLATE.** The MM pack ships
`start: {time: 0, …}` on 61 of its feature effects (the PHB's ship `start: null`), so a monster
feature's template (a boss NPC's Noxious Miasma, *1 turn, turnStart*) is registered at world load
and the first `updateWorldTime` out of combat (a `turns` clock reframed, remaining `Infinity`,
which COUNTS as reached) or the monster's next turn start marks the template expired. Every
application then copies the mark (`toObject()` carries `duration.expired`) and is born
suppressed. The tray's `_prepareEffectData` has the same hole. The applier (effect-riders.js)
writes `duration.expired: false` and a fresh `getEffectStart()` on create as well as refresh; a
template already marked stays marked until someone clears it, and `start: null` on it ends the
tracking (done on the sandbox's copy of that NPC 2026-09-21).

### v14 models an emanation end to end — MEASURED (2026-09-03, tools/probe-emanations.mjs)

- **`RegionDocument.createTokenEmanation(token, range, regionData, {excludeToken, gridBased})`**
  makes a Region whose one shape is `{type: "emanation", base: {type: "token", …}, radius}`,
  **attached to the token** (`attachment.token`): moving the token moves the shape and recomputes
  `region.tokens`. **The token is not a member of its own emanation.** Any region can be attached
  (`region.update({attachment: {token: id}})`).
- **The native `applyActiveEffect` behaviour** (`tokenEnter`/`tokenExit`) applies on entry, lifts
  on exit or disable, and fires when the AREA moves onto a standing token. ⚠ Its handlers run on
  **`event.user.isSelf` — the client that moved the token** — so a player walking the Paladin
  onto a monster would try to write the monster. The module's type runs its handlers on the
  active GM (the flow elect), with the membership floor as truth.
- **`tokenTurnStart` / `tokenTurnEnd` are dispatched by the Combat to the one designated GM**,
  to the regions of ITS scene — ⚠ a GLOBAL (scene-less) combat raised none. A suite's combat is
  scene-bound.
- ⚠ **A module-defined behaviour subtype must be declared in `module.json`**
  (`"documentTypes": {"RegionBehavior": {"emanation": {}}}`) or the server refuses any document
  carrying it **silently**: `Region.create` returned `undefined`, no error anywhere. The type id is
  `<module-id>.<name>`; the class goes into `CONFIG.RegionBehavior.dataModels` at `init`, defined
  INSIDE `init` (the static gate loads the module with `foundry = {}`); a manifest change needs the
  process restarted. A type's `static events` map subscribes it; handlers get `this` as the type
  instance (`this.region`, `this.behavior`).
- **A headless page has no token animation context**: a plain `token.update({x, y})` threw inside
  `#createAnimationMovementPath`; pass `{teleport: true, animate: false}` — a FRESH options object
  per update (Foundry defines a per-token property on it; a reused object throws "Cannot redefine
  property"). A destination off the scene is refused without a word.
- **A template's region shares the template's id** and carries a copy of its `flags.dnd5e` —
  how a cast emanation was recognised at 5.3.x.
- **A freshly created region's `tokens` is EMPTY for the first beat** (smoke-emanations, sixth
  live run) — read geometry instead (`geometry.js` `tokensInRegions` since 6.0). And **write any
  "who stood inside at creation" record BEFORE creating a behaviour on the region**: the behaviour
  subscribes at once and attaching the region raises `tokenEnter` for everyone inside.
- **`borderColor` on a MeasuredTemplate create came back `#000000`**; `fillColor` takes. Foundry
  draws only TEMPORARY effects on a token (a duration, or a status) — a module status id on the
  effect is enough (`statuses: ["bfEmanation"]`, no CONFIG registration).
- **A usage's placement prompt is `usageConfig.create.measuredTemplate`**, switchable in
  `dnd5e.preUseActivity` (emanations.js still switches it off). At 5.3.x dnd5e's own `radius`
  template carried `flags.dnd5e.dimensions.adjustedSize: true` and adjusted the drawn radius by the
  token at draw time; a module-placed circle carried the adjusted distance itself. (Concentration
  and placed areas: §2 *The dnd5e 6.0 pass* §2 I.)
- **The floor must be serialized.** One token move fires the region's enter event, `updateToken`
  and `updateRegion` within a tick; three reads of "no effect yet" wrote the effect three times
  (Half Speed stacked to ×0.0625). One reconcile in flight per region, one sweep per scene — the
  `queueFlagWrite` lesson on documents.
- **An ActiveEffect on a linked actor shows on every scene the actor has a token on**, and a
  campaign party has a token on every scene it has visited (Thomas: 22, read 2026-09-04). A
  Region's `tokens` and events are per scene, so an aura applied on scene A stands on scene B where
  nothing lifts it, and B's own ring writes a second copy. So the member copy is counted per AURA
  (the bearer's item and the row), never per region, and a lift reads the world's actors, not the
  scene's tokens. Where a ring stands is ruled in [RULINGS.md](RULINGS.md) *Emanations* (every
  LIVE scene, since 2026-09-23).

### A bare token move is WALKED, and a teleport needs the `displace` action (2026-09-04, the test range, Foundry 14.365 / dnd5e 5.3.3)

`document.move([{x, y}])` with no action takes the token's default action (walk): a wall stops it
(`constrainMovementPath`) and dnd5e's *full* movement automation stops it in front of a hostile
creature — and a plain `x`/`y` update is the same move, refused with no error (2026-09-01).
**`blink` is a teleport that is STILL wall-checked.** **`displace`** (teleport, walls: null — the
action Foundry uses for its own undo) crosses walls and creatures, as a waypoint action or as the
token's `movementAction` field. `constrainOptions: { ignoreWalls, ignoreTokens }` on the move's
options also crosses both, but only if the CALLER passes them. `preMoveToken(doc, move, options)`
fires AFTER the path is constrained and can only veto; `moveToken` after the commit;
`move.destination` is the final waypoint. A sight ray is
`CONFIG.Canvas.polygonBackends.sight.testCollision(from, to, { type: "sight", mode: "any" })`. The animation module's "check
collision" preset option is a MOVE-collision ray tested before any move — that preset's setting
to turn off.

### A dialog's DEFAULT button takes the keyboard when it opens (2026-09-23)

`ApplicationV2#_postRender` focuses the `[autofocus]` element on first render
(application.mjs:1801), and `DialogV2` puts `autofocus` on the `default` button — so a moment popup
opened by SOMEONE ELSE's roll pulled focus out of the chat box, a sheet field or the canvas, and
the next Enter or Space (the pause key) answered it. In play: a Battle Master PC's Tactical Mind offer was
answered PASS twenty seconds in, not by the timer. `openManagedPopup` hands the focus back
(`returnTheKeyboard`) — a moment is answered with the pointer; the system's own roll dialogs keep
Enter, because the roller opened those (`markDefaultButton`). Pinned by smoke-d20-folds ("an Enter
in chat is not a Pass").

### An attached emanation is RE-BASED only when its base matches the token exactly (2026-09-23)

`TokenDocument#computeAttachedRegionUpdates` (14.368) moves an attached `emanation` by
`updateSource({base: destination})` only when the shape's base equals the token's ORIGIN (x, y,
width, height, shape); anything else is `shape.move` by the delta — an offset carried forever.
The mover's client computes the updates and the SERVER applies them (no region permission needed:
measured on the Lair, three drags and a re-raise, base = token every time). A ring raised from a
token's PREPARED x/y mid-animation would start off it; emanations.js raises from `_source` and the
sweep re-bases a drifted ring (smoke-emanations §4d).

### A user's VIEWED scene has no document hook — the scene navigation's render is the signal (2026-09-23, smoke-twoclient `pull`)

`User#viewedScene` is a plain client property (user.mjs:51): each client sets its own at every
canvas draw (board.mjs:1519) and broadcasts it as user activity; the others write it in
`Users#handleUserActivity` (users.mjs:141) with no hook — but that handler calls `ui.nav?.render()`
on a scene change or a (dis)connection, and the canvas draw re-renders the navigation for this
client's own view. So `renderSceneNavigation` is the one public signal for "someone is looking at
a different scene"; `userConnected` covers only the connection half. emanations.js reads the live
set on that render (and on an activation) and sweeps only when it changed. Measured with two
clients: the GM heard a player's navigation within 2 s, one render.

⚠ **An Assistant GM cannot pull a player to a scene.** The server forwards `pullToScene` only when
the sender `isGM` on the SERVER, which a role-3 user is not (dist/database/documents/scene.mjs,
14.368): `Scene#pullUsers` from the suite identity was dropped silently. A suite that
needs a player on a scene makes the PLAYER navigate. `pullUsers` also skips a user the GM does not
yet see as `active`.

### v14 floats "−(name)" off the token for ANY effect with a status or a change (2026-09-28, `client/documents/active-effect.mjs`)

`ActiveEffect#_displayScrollingStatus` runs on create, on an enable/disable update and on delete
(`modifiesActor`: embedded, active, on an Actor; `options.animate !== false`), and draws only when
`this.statuses.size || this.system.changes.length`. So a status-only effect (Hold Person's Paralyzed)
and a changes-only one (Slowed) float on their own; a BARE effect (Confusion's Confused: no status, no
change) never does. The module's own floats (the use chips, the fighting styles' faces, the repeating
save's end) are for the bare ones only — a second float on the others would double the platform's.
⚠ v14 keeps an effect's changes under `system.changes`.

### A Die's explode modifier takes a CAP: `x{max}={target}` (2026-09-28, Sorcerous Burst)

`Die#explode` reads `/xo?([0-9]+)?([<>=]+)?([0-9]+)?/`: with both numbers present the first is the
most explosions, the second the face. dnd5e's Sorcerous Burst ships its damage as `1d8x@mod=8` —
the modifier's worth of extra d8s on an 8 — and the platform rolls it with no help. Measured the
spell native on that; the walk proves the roll.

## 2. dnd5e — the 6.x knowledge, with the pre-6.0 survivors marked

> By the Books runs on dnd5e 6.x only since v2.0.0. **The 6.0 pass** (first below) is the seam
> every card reader goes through: a roll card IS its data — `message.type` says what it is,
> `message.system.*` the rest — and any `flags.dnd5e.*` on a message is 5.3.x history. The notes
> after it are measured on 6.0. **Carried over from 5.3.x** holds the pre-6.0 measurements that
> survived the triage of 2026-09-24: a heading keeps its measured date, a "holds on 6.0.5" line
> names what in code or the pinned artifacts proves it still stands, and **⚠ unverified on 6.0**
> means nobody has re-measured it — read it as a lead, not a fact.

### The dnd5e 6.0 pass (2026-09-15 → 2026-09-16; ASSESSMENT.md retired into this note)

dnd5e 6.0 stopped By the Books on 2026-09-15: the module could not be enabled (its pin was 5.3.99 —
Foundry drops the setting write silently when a system maximum is exceeded), and with the pin
raised every guard that read a card's flags failed closed. The pass was five phases on the
sandbox (Foundry 14.367 / dnd5e 6.0.1), each battery-green for what it touched, released as
v2.0.0; prod moved to dnd5e 6.0.3 / Foundry 14.368 and took v2.0.1 on 2026-09-21. Measured: the
5.3.3 → 6.0.1 source diff (573 files) read against every call site, and the battery. Commits
338cff3 / 6016fe8 (phase 1), e59499b (2), 515379f (3), e9090fa (4).

**§1 Why it broke.** In 5.3.3 a roll card was a plain message carrying
`flags.dnd5e.{messageType, roll.type, activity, item, targets, originatingMessage}`, and Battle
Flow read that log. In 6.0.1 the card IS the data: `message.type` (`attack`, `damage`, `healing`,
`save`, `check`, `generic`, `usage`, `prompt`…), `message.system.{origin, targets, activity, item,
ability, mode, mastery, ammunition, onSave, resisted, level}`; target descriptors are
token-precise (`{actor, token, ac, img, name}` — no `uuid`), and the message registry files rolls
by `system.origin` only. Beside that: an activity's area is a Region (no MeasuredTemplate is
created), effect profiles resolve their effect asynchronously, and `CONFIG.statusEffects` is an
object keyed by id.

**§2 The breaks, by class, and the fix each took.**
- **A** the pin → 6.0.0–6.9.99 (the whole 6.x line, user 2026-09-15); `tools/dnd5e-hooks.json`
  regenerated (8 added, 0 removed).
- **B–F** every `flags.dnd5e` read (≈90 sites, 40 files) → ONE seam, `decide/card.js`: `cardKind`
  / `isCard` off `type` (death and concentration saves are `save` told apart by `system.type`;
  initiative a `check`), `targetsOf` (the token-keyed `system.targets` in the house shape),
  `originIdOf` / `originData` (`system.origin`, written by every roll the module drives — the
  5.3.x `originatingMessage` flag in all its shapes is gone), `masteryOf`, `onSaveOf`,
  `resistedOf` (the legendary-resistance flip), `targetsInData` (null when the pre-create data
  names no snapshot — "aimed at nobody" and "not written yet" are different facts),
  `isConcentrationPrompt`. ⚠ Two writes the first grep missed were NESTED (`flags: { dnd5e: {
  originatingMessage } }`) and one optional-chained — grep those spellings too.
- **G** effect profiles: `lookup.js` `profileEffects` / `applicableProfiles` resolve async and keep
  the profile BESIDE its effect (`onSave`, `_id` readable); `profileEffectSync` serves the one
  preCreate customer off the item's own embedded effect (5.3.x read the usage card's
  `system.effects` suffixes there).
- **H** `CONFIG.statusEffects[id]` (an object now); condition immunity SUPPRESSES the effect, so
  `forceStatus` may report "refused" for an immune creature though the outcome is right.
- **I** the areas are Regions (phase 3): `TemplatePlacement.fromActivity` creates RegionDocuments
  stamped `flags.dnd5e.activity` (the tie), `item`, `origin` (the usage TOKEN), `spellLevel`,
  `dimensions`; `results.templates` at `postUseActivity` is that flat RegionDocument[] (5.3.3
  nested an array per placement; the `.flat()` stays, smoke-saves §8d). `Scene#templates` is
  deprecated at Foundry 14 (a drawn template is a Region wearing `flags.core.MeasuredTemplate`).
  Containment is `TokenDocument#testInsideRegion` (`geometry.js tokensInRegions`). Every aura is a
  Region created the platform's way (`decide/geometry.js emanationShapeData`: the emanation shape
  on the token's base, radius from the EDGE, attached, LOCKED and invisible — ruling 6). A placed
  region is NO concentration dependent (only ActiveEffects, Items and Activities carry the
  mixin; `addDependent` is gone — the dependent is a `flags.dnd5e.dependents` row), so a
  `deleteActiveEffect` sweep ends a duration area: the saves machine's (areas.js) for a cast with a
  demand, and emanations.js `endConcentrationAreas` for every other concentration cast (2026-09-19,
  Fog Cloud outliving a ranger PC's concentration) — exactly the areas the caster's client tied to the
  concentration effect at the cast (`areas`, `dnd5e.postUseActivity`); the activity match only
  for an untied area no other concentration of the spell can claim (a Region carries no creation
  time on the client, measured).
- **J** concentration: both native prompts (`type: "prompt"` with a `concentration` /
  `endConcentration` button) are vetoed by TYPE — ruling 2. ⚠ dnd5e hands `rollMode` straight to
  `ChatMessage.create` as `messageMode`, which knows only Foundry 14's ids —
  `CONST.DICE_ROLL_MODES.PRIVATE` still returns the deprecated `gmroll`, so the private
  concentration roll had gone PUBLIC; `PRIVATE_ROLL_MODE = "gm"`.
- **K** the applied clock: `appliedClock` RETIRED — the platform's clock stands (ruling 1).
- **L** the applier is built the tray's way: `getAppliedEffectChanges`, `system.origin`, dedupe on
  `_stats.duplicateSource`, `forApplication`; an applied effect's `origin` is the ACTIVITY.
- **M** the card DOM (phase 4): the usage card's buttons are DATA (`system.buttons[]`, filtered in
  `dnd5e.preCreateUsageMessage`, Refund Resource kept); a save or check chained to a usage card is
  HIDDEN and drawn as a summary INSIDE the usage card (client setting `chatCardSummary`, default
  on) — the rows By the Books stamps on such rolls draw through `ui.js cardRow` into
  `.card-summary[data-message-id]`.
- **N** a null AC is a MISS (the platform's `evaluatedTargets`, ruling 4); riders `deepClone` the
  shared roll data (the per-roll damage rules write into it); `ranged` is an attack mode; the PHB
  pack still ships `system.bonuses.*` change keys (shimmed to `system.rolls.*` until 7.0) —
  accepted in both spellings.
- **O** every suite reads the 6.0 card: `m.type`, `_source.system?.origin`, `system.targets`
  mapped actor→uuid; AC forced through `ac.override` (the 5.x `calc/flat` restore clears NOTHING
  at 6.0), save outcomes through `abilities.<x>.save.roll.bonus` (5.x used the per-ability
  `bonuses.save`; the global `system.bonuses.abilities.save` was never folded into
  `rollSavingThrow`) — every old restore leaked into the next suite, and
  `tools/scrub-fixture-residue.mjs` clears what they left.

**§3b The posture — what is written against the card's HTML.** At 6.0 the card's DATA is the
stable part and its HTML the unstable part (dnd5e treats `message.system` as API and says not to
rely on the card's markup). The hook-dispatch gate's class, applied to selectors: (1) every HTML
anchor lives in ONE map, `scripts/surfaces.js`; (2) `tools/check-surfaces.mjs` fails the build
on a literal outside the map and on a dnd5e anchor gone from the verified version's shipped
templates (`tools/dnd5e-surfaces.json`, `--regen`); (3) data over anchors wherever the platform
offers it; (4) the platform's `getFlag` READ FALLBACKS are courtesy, not contract. Cadence,
measured: 5.3 shipped three patch releases with zero breaking changes; 6.0.1 was five bug fixes.
Breaks land on the major, deprecations expire on the second minor (6.2), patches are safe.

**§5 The rulings (the user, 2026-09-15).** (1) **The clock:** adopt the platform's — an empty
clock takes the activity's duration (`Activity#getAppliedEffectChanges`), and the pseudo-expiries
`sourceStart | sourceEnd | targetStart | targetEnd` are the turn-edge vocabulary (the rows are in
[RULINGS.md](RULINGS.md) *Chips and clocks*); the once-per-turn chits stay By the Books'.
(2) **Concentration:** VETO both native prompts, keep the machine — *the platform's prompt is a
reminder, By the Books' machine is a resolution* (it asks on the right client with a draining
bar, rolls for a player who walks away, breaks and cascades on a failure, and ends concentration
at 0 HP or incapacitated — nothing in the system does). Revisit only if a 6.x prompt gains a
timer and a consequence. (3) **Emanations:** KEEP By the Books'; suppress the platform's
auto-behaviour on regions it adopts (`options.dnd5e.createActivityBehaviors: false` at the
placement, a `preCreateRegionBehavior` veto on any `dnd5e.*` behaviour on an adopted region).
Measured with By the Books OFF (`tools/probe-platform-emanations.mjs`): the PHB pack declares ZERO
activity behaviours on any aura spell; hand-authored, the platform does "effect while inside,
gone on exit" for FRIENDLY only (no neutrals, no caster-reach exclusion, no turn events, no
feature auras), and concentration did not clean it up. (4) **Null AC:** a target whose AC cannot
be read is a MISS, the platform's own verdict. (5) **The sandbox:** `tools/world-snapshot.mjs
restore` is the way back. (6) **The ring is INVISIBLE** (the walk, 2026-09-18: *"I prefer the ring
to be invisible."*): every region this module raises or adopts is LOCKED with LAYER_UNLOCKED
visibility — Foundry's one never-drawn shape (plain LAYER showed the ring whenever dnd5e's
placement left the Regions layer active, 2026-09-19); a GM unlocks it in the Regions tab to see
it, and the member's chit on the token is what the table sees.

**§6 The walk (the user, 2026-09-18) — findings, each fixed with its suite section.** (1) Careful
Spell's names left the casting window for the card — [RULINGS.md](RULINGS.md) *Metamagic*
(smoke-metamagic §17). (2) The Aura of Protection's "Protected" and Protection from Evil and
Good's "Protected" are two pack effects with one name: the effect table's row gains `item`, and a
row with `item` stands only for an effect from that item when the sheet knows
(`effectCarriesRow`, unit-tested). (3) A usage card said each save twice: the platform's summary
row is the one line, carrying the verdict's tail (`verdictTail`, saves/views.js,
`SURFACES.summaryRow`); By the Books' own line draws only where no row exists — summaries off, an
automatic failure with no die, the target gone (smoke-saves §24e/f). (4, 5) The hover card and the
marks panel — [RULINGS.md](RULINGS.md) *The effect view* (probe-effect-view §2c). (7) Every
concentration area whose pack data puts the spell's minute on the activity stood after the cast;
ruled "placed and gone": `SPENT_AREAS` gains Slow, Fear, Confusion, Sleep, Calm Emotions, Faerie
Fire (the area chooses the targets at the cast, the effect rides them; a world carrying the old
Spent Areas default needs `verify-settings --fix`). (8) The per-verdict PUBLIC CARDS are retired:
the usage card carries every verdict (smoke-saves §15 asserts none post, §17b/§19h read the card);
Topple's own "stays standing" card stays. (9) Topple's success branch printed the pre-write
clone's total ("?"); it prints the roll's own total. Confirmed on the walk: rulings 1 and 4.

**§7 The 6.0.3 check (2026-09-19).** 6.0.2/6.0.3 are bug-fix patches (negative modifiers in the
breakdown, roll requests from a detached window, `system.rolls.attack.*` effects applying,
duration-less effects expiring after one turn in combat) — none had a workaround here. Both static
pins regenerated with no hook or anchor moved; the full battery 29/29 after one suite recut
(smoke-saves §22: a cold client on 14.368 closes its first roll dialog slower than a fixed pause —
the suite waits for the dialog to leave now).

**Not in this pass, recorded for the next:** effects' rule changes (`attack|check|save|d20 :
advantage|bonus|minimum|maximum`, conditioned on roll data — Sap and Bless-class bonuses could be
one effect the dialog pre-selects; Vex cannot, roll data carries no target; a prototype first);
the platform's region behaviour beyond ruling 3; `autoApplyDowned` and the trays' player settings
(they overlap `receipts.js clearDefeated` — the `verify-settings` table grows by these, with a
ruling each); `aggregateDamageTerms` for a per-type receipt breakdown;
`dnd5e.buildDamageRollConfig` as the native place for type-dependent riders.

**Findings paid for on the way (Foundry 14.367 / dnd5e 6.0.1):**
- **A moved token's document is INTERIM while it walks:** `doc.x/y` follow the animation,
  `_source.x/y` hold the destination once the update resolves — `documentSquares` reads the
  source; a suite waits for `doc.x === doc._source.x`, never a sleep. A walk off the scene is
  CONSTRAINED to the edge. The headless client throws inside the token animation when a token
  update's result is sampled synchronously — await the update.
- **`RegionDocument#updateTokens` writes membership with `noHook: true`** — no `updateToken` fires
  for `_regions`; region events reach only behaviours that already exist; a floor over membership
  tests geometry itself.
- **The cast's render floor and the region's `createRegion` land in the same beat** — the refresh
  latch queues ONE re-offer behind a refresh in flight, or the cast's demand stays empty.
- **The PHB pack's Half Speed (`system.attributes.movement.speed` ×0.5) left an NPC's speed at
  30 on dnd5e 6.0.0 to 6.0.5** — the one-hop moved-key table (below, *6.0's moved-key table*);
  6.0.3 measured it (smoke-emanations §6c). **dnd5e 6.0.6 fixed it**: 30 → 15 with nothing in
  between (2026-10-08). The pack's / the platform's, never ours (BACKLOG).
- **`ChatMessage5e#renderHTML` sets `html.hidden` BEFORE `dnd5e.renderChatMessage` fires** — a
  render hook can read it as "the hidden copy of a summarized roll"; a popout (`options.canClose`)
  is never hidden. **Core carries `hidden` over on a re-render** (`ChatLog#rerenderMessage`), so
  turning `chatCardSummary` off does not unhide a card until the log renders afresh. **The
  platform re-renders a summarized roll's origin on create, delete and `system` change only**
  (`#refreshOrigin`) — a flag write re-renders nothing, so ui.js nudges the origin itself.
- **The fixture Victim's TOKEN is named "Hobgoblin"** — a demand's popup carries the token's name.
  **A section that snapshots the log lets the previous section's swing SETTLE** — its damage and
  no-GM whispers land up to a second after the dialog closes (smoke-nogm §spent → §cast); a count
  held against an OLD snapshot folds in every later section's cards.
- **Fixture residue cost a battery:** a platform probe left the Paladin's token NEUTRAL (a helpful
  aura from a neutral source admits no ally); a scratch probe parked the Ranger inside the ring. A
  probe that moves tokens puts them back; `fixture-suite` re-places what smoke-saves deletes.
- The suite files are CRLF in some working copies; a multi-line edit script must normalise.

### dnd5e 6.0 falls an actor for ANY of its linked tokens, on ANY scene (2026-09-21, the walk)

`TokenDocument5e#updateFalling` asks `actor.getDependentTokens({linked: true, concreteOnly:
true}).some(t => t._isFalling())` — every linked token on every scene — and re-toggles `falling`
on the ACTOR on every related update. Two PCs each had a token parked at elevation 5 on
*Hidden Temple*; deleting the effect re-created it within the second. The platform's: ground the
stray tokens and the status drops. ⚠ Updating a token's elevation on an UNVIEWED scene throws in
core 14.368 (`RegionDocument#testSamples` reads the private `#polygonTree` the lazy getter
builds — touch `region.polygonTree` on each region first, or view the scene).

### A use SPENDS before it posts: a used-up item is gone before its card exists (2026-09-22)

`Activity#use` (6.0.3) runs `#applyUsageUpdates` — which DELETES an item whose last use this was
(`uses.autoDestroy`, quantity 1: potions, scrolls, vials) — and only then creates the usage card.
Every uuid stamped for the used thing names a document already gone, so a bare
`fromUuid(activityUuid)` answers nothing, silently: a PC's Potion of Poison Resistance applied
nothing, a vial's failed-save effect never landed, a scroll's volley never drove (a healing potion
survived only because its heal rides the roll; a stack of two keeps its item until the last
drink, which made it look intermittent). The card keeps a SNAPSHOT of the deleted item
(`system.deltas.deleted`) and the platform rebuilds it, parented to the speaker
(`ChatMessage5e#getAssociatedItem` / `getAssociatedActivity`); an effect profile without a uuid
resolves off that item's own `effects`. **Read every card's item or activity through lookup.js
`cardItem` / `cardActivity`**; `tools/check-card-reads.mjs` fails the build on the bare shape.
Pinned by smoke-cast §7 and smoke-saves §25. ⚠ A REGION names its activity by uuid with no card
behind it — an area from a used-up scroll loses its activity on the platform's side too.

### An applied copy carries its TEMPLATE'S lineage: `system.origin.item` names the PACK (2026-09-23)

In play: a ranger PC's Hunter's Mark paid no 1d6 on six hits. The 6.0 migration moved every world
item's effect-template `origin` — the pack's own uuid — into `system.origin.item` (**207 of the
world's 243 applied templates**). Both appliers copy the template and MERGE their provenance over
it (the tray's `_prepareEffectData` writes `activity` or `item`, `effect`, `message`, `profile`),
so a copy on the target carried a fresh `activity` beside a stale compendium `item`.
`effectSourceOf` read `actor || item || activity` and walked to the pack — no rider die, no damage
shield's source; the platform's `getSourceActor` (`actor ?? item ?? activity ?? origin`) finds
nobody the same way, so every `sourceStart`/`sourceEnd` clock on those copies expires at any turn
edge rather than the caster's. `effect.origin` (the PREPARED field: `effect ?? behavior ??
activity ?? item ?? actor`) reads right, which is why `grantingActor` never broke. Fixed both
ways: the reader TRIES each candidate, `activity` first, a compendium walk is nobody; the applier
writes `system.origin` WHOLE (every key, null where it has nothing to say, `item` the item
actually used). A mark's placer is found by walking up to the nearest Actor whichever document
the origin names (at 5.3.x a concentrating caster's mark named the concentration effect), and
concentration is never a gate — the dependent cascade deletes the mark when it breaks. ⚠ A copy
the TRAY applies still carries the stale item: the reader copes, the platform's clock does not (a
platform gap — Errata 5e territory, or a one-time sweep of the 207 templates; neither done).
Pinned by smoke-riders §9 (the tray's shape) and §10 (a real cast through the applier).

### 6.0's moved-key table follows ONE hop — Roving's +10 read "3510" (2026-09-23)

`ActiveEffect5e._applyChangeShim` rewrites a change's key through `SHIM_FIELDS` once; some keys
moved twice (`movement.speed` → `movement.walk` → `movement.speeds.walk`). The PHB's Roving adds
10 to `movement.speed`; one hop lands it on `movement.walk`, no longer a number field — an
in-memory 35-foot ranger read walk, climb and swim **3510**; the chain followed, 45. A platform
gap, never ours: the sister module Errata 5e carried the fix as **E-001** (each entry pointed at
the end of its chain at `setup`), listing this module as a dependent for Half Speed.
**dnd5e 6.0.6 (2026-10-06) fixed it upstream**: `movement.speed` now points straight at
`movement.speeds.walk`, so the table has no chain. Measured 2026-10-08 with E-001's code removed:
an old-key +10 on a 30 ft walker reads 40, the PHB's Roving 40 with climb and swim to match, and
Half Speed 30 → 15. Errata 5e retired E-001 in 1.2.0 and requires dnd5e 6.0.6 since 1.2.1; on
6.0.0 to 6.0.5 the 3510 is back.

### 6.0.4 and 6.0.5, read against the module — nothing on our paths (2026-09-23)

The 6.0.3 → 6.0.5 diff is 48 files, most of them scroll packs, read file by file:
- **The activity save/check buttons' bonus** (#7496, #7527) — the module never rolls through the
  card's buttons; the save machine calls the actor's own roll.
- **Rest expiry** (#7516 — an effect expires on a rest only when its `duration.expiry` IS that
  rest): the module's chips are tidied by the spend, the combat's end and the expired-chip sweep,
  never by a rest; this only stops the platform removing them early.
- **The status migration guard** (`&& data._id`) — the module registers no status in
  `CONFIG.statusEffects` (`bfEmanation` is a plain status string), so it was never exposed.
- **The roll dialog's dice** (#7485) — display only; `check-surfaces --regen`: all ok.
- **Scrolls carry `flags.dnd5e.spellLevel`** — new data; the volley and cast paths read the cast
  level off the card and the item, unchanged.
- **Hooks:** `check-hook-dispatch --regen`: 0 added, 0 removed.

### 6.0.6, read against the module — nothing on our paths (2026-10-08)

The 6.0.5 → 6.0.6 diff is 16 files, no pack changed, read file by file:
- **The moved-key table** (`movement.speed` now straight to `movement.speeds.walk`) — the
  platform gap above is closed; Half Speed reads 15 on a 30 ft NPC. The module writes no movement.
- **The chat card's Consume button** (`#consumeResource` → `_prepareConsumeResourceUsageConfig`)
  — a refactor; the module never consumes through the card.
- **Enchantment riders** (no create operation when there are no riders) — `effect-riders.js` reads
  a rider's `dependentOn`, which is unchanged.
- **Skill and tool `bonuses.check` shim, the attack label's `Roll.create`, ItemChoice's spell-list
  restriction, the unlinked token's delta update, the exhaustion migration, the `/heal` flavor,
  the falling token** — none on the module's paths (`heal-on-hit.js`'s `falling` is its own map).
- **Anchors:** `check-surfaces --regen` all ok; **hooks:** `check-hook-dispatch --regen` 0 added,
  0 removed. `verified` moved to 6.0.6.
- **The battery:** 49/49 suites, 2019/2019 checks, settings clean, hook coverage 65/65 names
  (411/411 registrations), 89m 38s, on the local sandbox (Foundry 14.368, dnd5e 6.0.6).

### A token's prepared texture can lag its store on Foundry 14.369 (2026-10-14, Battle Familiar)

Measured on the sandbox with a plain unlinked Owl token: a flat `update({ "texture.src": … })` lands in `_source` AND in the
prepared `texture.src`; after an update carrying a NESTED `texture: { src, scaleX, scaleY }` object (the summon landing's
`artChanges` shape), later writes still reach `_source` but the prepared `texture.src` and `texture.scaleX` stop following
it on that client (the scale drifted on every update). Foundry 14's TokenDocument prepares token data through
`applyActiveEffects` and keeps `_priorOverrides` for unlinked tokens, and an unlinked token's delta is prepared lazily; the
mechanism was not chased further. The rule: read a familiar's look off `token._source.texture`, write it back with flat
keys (`empowerOne`), and in a suite assert the store, not the prepared value (`smoke-familiar` §9a).

### dnd5e's transform of an unlinked token: in place going in, a new token coming back (2026-10-14, Battle Familiar)

Measured on 6.0.6 for the empowered familiar (RULINGS *Summons*, the Battle Familiar pass): `transformInto` on a token
actor updates the token IN PLACE (same id, the combatant survives); `revertOriginalForm` CREATES a new token and deletes
the old with `{ replacements }`, which re-points no combatant — the module re-seats it and re-points its own records
(`repointEmpowered`). The transform also plants a "Proficiency" override effect (`dnd5eTransformProf`) carrying the
SOURCE's PB, which is null for a stat block with no CR: delete it when the summon activity's Match Proficiency is wanted.
`keep: hp` carries the Hit Points lost in the form back on the revert and drops the Temporary Hit Points unless `tempHP`
is kept — exactly a polymorph spell's ending.

### A summoned token is blind: the packs ship sight off, and dnd5e's sense sync never switches it on (2026-10-21, item 10)

Read off the 6.0.6 bundle and the pack snapshots, and measured on the sandbox (RULINGS *Summons*, call 60: the MM Owl's
token, `range: 0, basic` in its prototype, prepares Darkvision 120 ft once its sight is on; Mage Hand's stays off): every npc in the
PHB, Monster Manual, DMG, Arcana Unleashed, Heroes of Faerûn and dnd5e's own `actors24` ships `prototypeToken.sight.enabled:
false`, except the Arcane Eye (the PHB's and `actors24`'s) and the PHB's three Primal Companion beasts. `TokenDocument5e#_applySenseVision`
(world setting `senseVisionSync`, default on) runs in `_prepareDetectionModes` and writes the senses' range, vision mode and
detection modes onto the PREPARED token, but `applySenseOverrides` deletes `enabled` from what it applies: sight stays
whatever the source says. `SummonActivity#getTokenData` builds the token from `actor.getTokenDocument(placement +
tokenUpdates)`, so a summon lands blind unless `tokenUpdates.sight.enabled` says otherwise. The same holds through a
transform of an unlinked token (`transformInto` sets `sight.enabled` from the token actor's `prototypeToken`, which is the
WORLD actor's) and its revert (`revertOriginalForm` writes the world actor's prototype `sight` onto the new token): a
token's own sight is lost both ways unless put back. The MM and `actors24` prototypes carry `range: 0, visionMode: "basic"`
whatever the senses (the PHB's carry the darkvision range): with the sync off, a token sees by those.

### A transferred enchantment change keyed to an activity is inert on the actor (2026-10-14, Familiar Friend)

Arcana Unleashed's Familiar Friend carries "Fortified Familiar" as an `enchantment` effect, `transfer: true`, one change
`activities[summon].bonuses.hp = 2 * @details.level`. dnd5e routes an `activities[...]` or `system.activities.` change to
`ActiveEffect5e#applyActivity` only when the model being prepared is an **Item** (`active-effect.mjs` `applyChange`), and an
item applies only its OWN effects (`item.mjs` `allApplicableEffects`: `effect.applicableType === "Item"`). A transferred
copy lands on the actor, where the key names nothing, so the spell's summon activity keeps `bonuses.hp: ""` and a landed
familiar gets no Hit Points. The pack's intent is read by By the Books instead: `SUMMON_BOONS` names the change and the elect
lands it at the landing (RULINGS *Summons*, call 46); the vendor bug is an Errata issue. The same shape will mislead
wherever a feat tries to reach a spell's activity through a transferred effect.

### "Creatures of your choice" in an area: the pack flags half of them (2026-09-24, a play session's Slow)

dnd5e models a caster's choice inside an area as `target.affects.choice`. Read off the 2024 PHB
spell pack (a copy of its LevelDB through `classic-level`): the area-and-save spells whose TEXT
grants the choice are Slow, Sleep, Conjure Barrage, Conjure Volley, Word of Radiance, Destructive
Wave, Weird and Spirit Guardians — the flag is set on **four** (Word of Radiance, Destructive Wave,
Weird, Spirit Guardians). Slow's `affects.count` is blank too; "up to six" lives in its prose. So
the flag is not membership ([ARCHITECTURE §6](ARCHITECTURE.md) *Registry rules* 1): the Chosen
Areas list names them (`CHOSEN_AREAS`), the number is read off the text (`choiceCapFrom`), and the
ruling is [RULINGS.md](RULINGS.md) *Spells that choose their targets*. "Of your choice" WITHOUT
an area (Bane, Enthrall, Healing Word…) is a targeting choice and needs nothing.

### Arcana Unleashed: nothing reads it yet (2026-09-24, `tools/probe-premium-module.mjs`, Foundry 14.368 / dnd5e 6.0.5, pack indexes only)

The fifth supported premium module: `dnd-arcana-unleashed` v1.0.1, a 2024-rules core expansion on
magic. Its Item packs are `.subclasses` (71 rows: 8 subclasses, 61
features), `.feats` (37), `.spells` (33, levels 2–9), `.items` (69), `.backgrounds` (11),
`.bastions` (9); beside them `.effects` (40), `.actors` (38), `.book` (36), `.tables`, `.scenes`,
`.adventures`.
- **No name-keyed row fires on it.** Zero collisions between its Item names and the registry's
  keys, feature fields or settings defaults; none of its spells shares a name with a PHB spell. The
  book is unswept — SWEEP §2 has the counts and the names to read first, BACKLOG *Features* the row.
- **It ships a standalone ActiveEffect compendium** — the first among the supported books: 38 enchantments (the
  evolving magic items, applied to ITEMS) and 2 base effects, *Dodging* (`statuses: ["dodging"]`)
  and *Darkening Ammunition*. Effect readers match effects ON AN ACTOR by name, which holds for an
  effect applied from a pack; a pack feature that links a compendium effect by uuid rather than
  embedding it has never been measured. Measure before a row.
- **The scanner needed no change, the classifier did:** `classify-corpus.mjs` dropped unranked
  packs, so its four Item packs joined `PACK_RANK`. The probe is general: point it at the next book.

### The species and origin-feat packs, read for Slice A (2026-09-24, the sandbox, dnd5e 6.0.5)

The whole inventory is SWEEP §6; these are the facts that bit the code.
- **Every limited use is on the ITEM.** No PHB species trait or origin feat carries activity uses;
  the activity consumes `itemUses` with an EMPTY target, which `shared.js` `poolOf` resolves to the
  item itself. A reader that looked only at `activity.uses` (the clock riders did) finds none —
  `decide/clock.js` `riderUsesFrom` reads the activity's, else the item's, and the spend is written
  where they live.
- **Stone's Endurance's heal activity has an EMPTY stored name.** dnd5e displays the type's
  localized title ("Heal"), so `activity.name` matched Parry's row key in English only. The lookup
  (`hold/lookup.js` `reductionFor`) takes the named activity, else the first `heal` activity whose
  `_source.name` is empty — locale-proof.
- **A maneuver's die part lists SEVERAL damage types** (the die takes the weapon's), so its first
  type read "bludgeoning" on a greataxe (measured live). A Giant Ancestry boon's part carries its
  own one type (fire, cold). `hit-menu.js` reads the part's type only for an option-pool group; a
  maneuver's die keeps the weapon's.
- **Halfling Luck, Gnomish Cunning and Tavern Brawler's rerolls are native** — a flag dnd5e turns
  into `r1` inside the roll, a transfer effect's `save.roll.mode`, an `r1` in the feat's own
  formula. Nothing to build (DESIGN §8).

### How dnd5e 6.0 marks the dice it changes (2026-09-26, `tools/probe-changed-dice.mjs`, dnd5e 6.0.5)

`D20Roll#configureModifiers` turns the roll options into Foundry die modifiers — `halflingLucky` →
`r1=1`, `reliableTalent` / `minimum` → `min10` — and a roll built by hand without it carries none.
The two mark their results DIFFERENTLY:

- **`r1=1` (a reroll)** retires the 1 — `{result: 1, active: false, rerolled: true}` — and appends
  the new result, live.
- **`min10` (a floor)** keeps the ONE live die and marks it `{result: 4, active: true, rerolled:
  true, count: 10}` — `rerolled` although nothing was rerolled; `count` is what counts.
- **Both**: the retired 1 carries `count: 10` too; the appended reroll is the live die.

So `rerolled` alone does not mean *a second result follows*: `changedDice` pairs only a retired
(`active: false`) result, and reads any live one by its `count`. The first cut paired every
`rerolled` result and drew nothing for Reliable Talent.

### The PHB feats groups 4–6, read against dnd5e 6.0.5 (2026-09-27, `tools/probe-pack-shapes.mjs` + the bundle)

- **The pack**: Mage Slayer ships ONE activity, "Guard Mind" (a utility spending the item's own
  use, 1 per Short Rest) — nothing for Concentration Breaker. Inspiring Leader ships TWO heal
  activities, "Inspire with Wisdom" / "Inspire with Charisma" (`temphp`, `@details.level +
  @abilities.<a>.mod`, 6 creatures, 30 ft; its note: delete the one you did not raise). Chef ships
  "Replenishing Meal" (heal 1d8, target count **4** — the text says 4 plus your Proficiency Bonus),
  "Bolstering Treats" (`temphp` `@prof`, consumption *restores* `@prof` uses) and "Eat Treat".
  Sentinel ships NO activity — only "Halted" (`system.attributes.movement.walk` OVERRIDE 0, 1 turn,
  `turnStart`). Polearm Master ships "Pole Strike" (a Bonus Action melee attack on the FEAT item,
  1d4 + `@mod` Bludgeoning) and "Reactive Strike" (a Reaction utility with nothing in it). Each feat
  carries an Ability Score Improvement advancement; a copy dropped on by hand has no assignment.
- **`rollConcentration` combines `system.attributes.concentration.roll`** (War Caster's field — the
  save gate's mode reader did not know it until group 4) into `config.rolls[0].options`, then
  `rollSavingThrow` combines the ability's own save field and merges the two (`mergeConfigs` →
  `mergeObject`). An explicit `{ disadvantage: true }` merges beside an `advantage: true` and dnd5e
  rolls it plain (`D20Roll`: both true → NORMAL) — so Mage Slayer passes Disadvantage ALONE, never
  `advantage: false`. Measured live: the Shielder fixture, whose sheet rolls its concentration saves
  at Advantage (a homebrew item's effect, listed by the gate), rolls 0 with the breaker, 1 without
  (`smoke-concentration` §16d).
- **A save's roll message names its ability** — `message.system.ability` (`type: "save"`); the
  `dnd5e.rollSavingThrow` hook's data is `{ ability, subject }`.
- **The rest card records the Hit Dice spent in WORDS only** (`_displayRestResultMessage`: the
  `dhd` is formatted into the content; `system` carries the deltas of the rest's own update, the
  request and the type). `result.dhd` at `dnd5e.restCompleted` is the change in Hit Dice across the
  dialog (negative when spent). A requested rest carries `config.request` (the request message),
  and its card `system.request` / `flags.dnd5e.requestResult`. So the module stamps its own record
  on each Short Rest card (`restSpent`, rest-grants.js) — the Chef's meal reads it.
- **`autoHD`** (`initiateRest` config) spends Hit Dice with no dialog while missing HP stands at or
  above `autoHDThreshold` — the suites' way to spend Hit Dice in a rest (`smoke-rest` §10).
- **Nothing records a Disengage**: no status, no activity on a monster's statblock or the PHB's
  actions (dnd5e 6.0.5's `CONFIG.statusEffects` lists none), so Sentinel's Disengage half is the
  table's.

### `dnd5e.damageActor` carries the DELTA, healing included (2026-09-28, the repeating save)

The hook fires after every `Actor#applyDamage` — damage and healing alike — with `changes`
`{ hp, temp, total }`, the signed movement of the Hit Points. Damage is `total < 0`; a heal is
positive; a change that took nothing (immunity, a 0) is 0. A `damaged` trigger reads the sign, never
the hook's firing (`repeat-saves.js`); the concentration seam reads the same hook. ⚠ In
`applyDamage`'s input a `healing`-typed part heals on a POSITIVE value (the type flips the sign);
`-5 healing` is 5 damage.

### Carried over from 5.3.x

#### Activation: spells inherit it, features declare it (2026-09-02, the corpus scan over the 2024 packs)

A spell keeps its casting time on the item; an activity carries its own `activation` only with
`override: true`, so an activities-only scan finds zero reaction spells, Shield included. A
feature has no item-level activation — every activity declares its own, never with the override
flag. A test demanding the override refuses every 2024 reaction feature (Deflect Attacks, Warding
Flare) in silence; `decide/eligible.js isReactionItem` tests it for spells only. Some features are
a paragraph and nothing else (Uncanny Dodge, Steady Aim, Evasion — no activities, no effects): a
curated list names them (`isTextOnlyFeature`), and whatever a use would have done the module does
itself.

#### The roll dialog: the gate's seams (2026-09-01 / 09-02)

**The pre-roll hooks fire BEFORE the fast-forward keys are read.** `buildConfigure` dispatches
`dnd5e.preRoll<Name>` / `preRoll<Name>V2`, *then* `applyKeybindings` turns a modifier click into
`dialog.configure = false` — so at hook time `dialog.configure` is whatever the CALLER passed:
undefined for every human roll, fast-forwarded or not; `false` only when code suppressed the
dialog. That is the reminder gate's "no dialog, no gate" rule, and why a shift-click is still
gated. Returning `false` cancels cleanly (`rollAttack` resolves null, the card keeps its button,
nothing is consumed). The attack hook is TEMPLATED, so `preRollAttack` and `preRollD20Test` both
fire. ⚠ **Every `…V2` roll hook has a plain twin dispatched just before it with the same
arguments** (read in the 6.0.5 bundle, 2026-09-28: `preRoll<Name>` then `preRoll<Name>V2`,
`rollAttack` then `rollAttackV2`, and so for damage, concentration and the death save), and the
system listens to none of its own; the module listens on the plain, documented names, and
`tools/check-hook-dispatch.mjs` expands the templates from each roll's `hookNames`. A pre-roll
reader that wants the targets reads `game.user.targets` — the roller's own, which
`getTargetDescriptors()` reads.

**The seams:** (1) `dialog.configure = true` written in a pre-roll hook survives the keys
(`applyKeybindings` uses `??=`). (2) `dialog.options` reach the dialog's constructor — dnd5e's own
`defaultButton` ("normal" is valid) or a payload of ours is `app.options.<key>` at render (as a
COPY — below). (3) The buttons are `type=submit` with `data-action`; a `.click()` is a real press.
(4) A change to the dialog's own selects re-renders ONLY its `formulas` part — a sibling inserted
after `[data-application-part="configuration"]` stands through it — and every render fires
`renderRollConfigurationDialog`; `new FormDataExtended(app.form)` reads the current values.
(5) `dnd5e.postRollConfiguration` fires after the dialog closes with the FINALIZED rolls
(`rolls[0].options.advantageMode` is what was pressed), before evaluate/post, so a write to
`message.data` lands on the created message; a closed dialog hands back no rolls. (6) Ranged or
melee is `activity.attack.type.value`, a thrown weapon the attack mode `thrown`/`thrown-offhand`;
a weapon's range is `item.system.range.{value, long, units}` unless `activity.range.override`.
(7) A volley's rays roll `configure: false`, so the judge (`reminders.js` `judgeRoll`) runs in the
volley's aim popup per ray and the record rides the ray's roll as message data. A `<details>`
element folds a section natively, and `textContent` still reads the folded boxes.

Holds on 6.0.5: reminders.js forces `dialog.configure` and `dialog.options.defaultButton` and rides
`dnd5e.postRollConfiguration`, which is in the 6.0.5 `tools/dnd5e-hooks.json`.

**Forcing advantage/disadvantage with `configure: false`:** the keybinding pass recomputes
`advantageMode` from the roll's `advantage`/`disadvantage` booleans — set *those* (shared.js),
never `advantageMode`. Situational bonuses go in `config.rolls[0].parts`.

**DialogV2 sizes to its content and never scrolls it.** Anything that can grow goes in its own
`max-height: calc(100vh - Nrem); overflow-y: auto` box inside the content.

#### A roll's `dialog.options` reach the app as a COPY — carry state in a class instance (2026-09-02)

`Actor5e##rollD20Test` deep-clones the dialog config before the pre-roll hooks and
`ApplicationV2._initializeApplicationOptions` merges the options into a fresh object, so a plain
object stamped in a pre-roll hook is not the one on the rendered app (the Sneak Attack tick
recorded as unarmed). Both copiers pass a **class instance** by reference (`deepClone` returns
anything whose constructor is not `Object`), so the gates carry `ui.js`'s `DialogCarried`.
`Object.freeze(options)` is shallow.

#### Damage: crits, application, healing (5.3.3)

**Injecting a damage part at `dnd5e.preRollDamage` gets crit doubling for free** — the hook fires
before the keybinding pass stamps `isCritical` onto every entry in `config.rolls`, a pushed one
included. Do not hand-roll it, and do not consult `damage.critical.allow` (it governs the
standalone button). **`dnd5e.rollDamage` hands over the rolls and the activity, not the
message** (2026-09-02): a machine that needs the damage MESSAGE listens to `createChatMessage` and
gates on `message.isAuthor` (sneak.js).

⚠ **dnd5e dispatches the damage hook TWICE per roll** (measured 2026-09-09, Empowered Spell:
"fired 2 for this roll"), so one registration runs twice. A never-re-stamp read cannot see a
`setFlag` still in flight, so an offer raised there opens twice. **One in-flight set per
moment** keeps the offer, the popup and the spend single: dice-changers.js's `offering` (since
2026-09-27 the one home of Empowered's and Savage Attacker's, which each carried a copy). A new machine on this hook
takes the same guard.

**`dnd5e.preApplyDamage(actor, amount, updates, options)` cancels on an explicit `false`**, and the
tray passes the damage message as `options.originatingMessage`. It fires on whichever client is
applying, so a veto must not be GM-gated, and **healing takes the same path** — a veto checks the
roll type or it refuses someone a cure. **`calculateDamage` negates healing-typed entries itself**
and derives `treatAs` from the originating message's roll type, so the shared applier applies
healing unchanged. Holds on 6.0.5: concentration.js and hold/spell-hold.js register the hook
(concentration.js: "the one seam that still knows the originating message"); it is in the 6.0.5
hook artifact.

#### Usage: what a use does on its own (5.3.3)

**A damage or heal activity's follow-up is a roll DIALOG** (2026-09-05, Heat Metal):
`DamageActivity#_triggerSubsequentActions` calls `rollDamage({event}, …)` with the configuration
dialog, `HealActivity`'s the same; the ATTACK activity's does nothing after the card. So a bare
damage spell or a maneuver typed damage opens a dialog on use, and a machine that also rolls rolls
TWICE. `usageConfig.subsequentActions = false` in `dnd5e.preUseActivity` claims it — then the
module's own roll (damage-casts.js) or none (superiority-uses.js, the fold files). A heal's dialog
is left alone (Rally rolls through it).

**A utility activity with a roll formula does NOT roll it at the use** (2026-09-05, Tactical
Assessment): `use()` spends the die and posts a card with a Roll button — which By the Books hides
(`hideCardButtons`). The use is the ARMING now (d20-folds.js): the module rolls the formula, chips
the number, folds it into the next check the scope names. Same class as the heal/damage dialog:
dnd5e leaves a second click, and the module has hidden the thing to click.

**`activity.use(usage, dialog, message)`** — the dialog config is the SECOND argument;
`dialog.configure === false` skips the roll dialog. **`consumption.spellSlot: false`** casts with no
slot — the shape innate casting has.

**`dnd5e.renderChatMessage` fires for every message subtype, and AGAIN for an old card whenever
the log re-renders it** — a flag write, an actor or effect change dnd5e refreshes cards for, and a
reload for EVERY card (2026-09-05, smoke-shields, one full run: a ranged hit "paid" off a melee
card re-rendered after the attacker stepped back; a once-per-turn chit rewritten on the next
turn). A machine that resumes on render and judges from the world as it stands re-judges an old
hit against a table that has moved on. The house gate is the appliers' (auto-apply.js,
hold/spell-damage.js): create judges an unheld roll once; update and render resume only a roll
that WAS held (`attackHoldPending === false`), once, stamped so a reload cannot resume it twice.

#### `getConcentrationDC(damage)` is `clamp(floor(damage/2), 10, 30)` (5.3.3)

The 30 cap exists only under modern rules; concentration.js calls the system's own.

#### Select content by SHAPE, not by `system.identifier`

`system.identifier` is not unique across rule versions: the 2014 pack ships a Hunter's Mark with
the same identifier and no bonus-damage activity. A suite that selected by identifier scored 4/8
with every negative assertion passing vacuously.

#### The 2024 auras: the effect ships, who-is-inside does not (2026-09-03, tools/probe-emanations.mjs)

| Item | What ships | Its own Foundry Note |
| --- | --- | --- |
| Aura of Protection | a TRANSFER effect *Protected* (`system.bonuses.abilities.save add @abilities.cha.mod`) on the Paladin; **no activity, no size in data** — the "10-foot" is prose | *"should not be used for other impacted characters because it will add their Charisma modifier and not the Paladin's"* |
| Aura of Courage | a utility activity whose template size is **`@scale.paladin.aura`**, and a non-transfer effect *Courageous* with **no changes** | *"not automatically added/removed nor does it remove the Frightened condition"* |
| Aura of Warding | a transfer effect with the three resistances; a utility activity with range 10 ft and no template | *"not automatically granted when a character enters/exits your aura"* |
| Aura Expansion (18) | text only | the size is the class's scale value |
| Spirit Guardians | a save activity, 15-ft `radius`, Wis, 3d8 necrotic/radiant, *Half Speed* with `onSave: true` | — |
| Aura of Vitality | a 30-ft emanation heal activity plus a *Start of Turn Heal* activity aimed at one creature | — |

**The Paladin's `ScaleValue` advancement `aura` (distance): 10 at 6, 30 at 18** —
`getRollData().scale.paladin.aura` is `{value: 10}` at Paladin 10, `null` at 5; its `toString` is
"10 ft", so read `.value`. **A formula on an effect resolves against the actor WEARING it** —
`decide/emanations.js` `resolveChanges` resolves it on the source first. A built Cleric 5 (Wis 16)
computes Spirit Guardians' DC as 11 — a class item built without the advancement manager carries
no spellcasting ability; the content's number. Holds on 6.0.5: ruling 3 of the 6.0 pass re-read
the PHB pack's auras on 6.0 (zero activity behaviours); `resolveChanges` still resolves on the
source.

**The save clauses ship as prose only** (2026-09-05, Aura of Purity): its effect carries the Poison
Resistance and nothing else; Circle of Power's "Circle's Power" no change at all; Holy Aura's "Holy
Protection" +1 to every save's roll mode. The effect table's `saves` facet holds the clauses
(decide/registry.js), and the save gate judges them against the DEMAND (the demanding item's type,
the statuses its failed-save effects carry). A spell whose condition is not a status on its effect
is invisible to it.

**The emanation names what it applies "Effect — Source"** (2026-09-05, the walk): Aura of Purity
stood on a PC as "Aura of Purity — <the paladin>", and every effect reader matched names EXACTLY, so
the table saw nothing (Holy Protection had been unread by the attack gate since the second slice
shipped). One helper, `effectNamedAs` (the bare name, or the name with " — " and anything after),
serves every reader. **A reader that matches by name must know every shape the module itself
writes that name in**; fixture suites plant the bare name and cannot catch this.

#### Weapon masteries: eligibility is trait + weapon

The wielder's mastery trait must contain the weapon's base item AND the weapon must have a mastery
set; a fixture needs both. With `configure: false` the roll takes the weapon's own mastery.
Holds on 6.0.5: `decide/card.js` `masteryOf` reads `system.mastery`, which the platform writes only
when the wielder has that mastery with that weapon. Match module announcements by flag, never by
text: the native usage card prints the mastery name in its subtitle.

#### An unresolved `@scale` token rolls ZERO — silently (2026-08-23, sandbox, a real Bard 5 and Fighter 2)

```
new Roll("@scale.bard.inspiration", bard.getRollData())       →  "1d8",  total 7   ✅
new Roll("@scale.bard.inspiration", recipient.getRollData())  →  "0",    total 0   ⚠
```

⚠ **No throw, no warning.** A cross-actor scale formula on the wrong actor's roll data is a real,
public, spent-resource roll that adds nothing and reads as bad luck. **Resolve a formula on the
actor that OWNS it, down to a literal, before any Roll is built** — it bit again on 2026-09-05:
Commander's Strike's `@scale.battle-master.superiority.die` rode the ALLY's roll and read 0; the
command stamp resolves it on the fighter (`Roll.replaceFormulaData`, "d8" read as "1d8").
`ScaleValueTypeDice` carries `formula`/`die` as **getters** (`JSON.stringify` shows only `{number,
faces, modifiers}`); read them and refuse anything that is not a plain non-empty string
(`decide/sneak.js` `parseDice`).

#### A built character resolves its scale values without the advancement manager (2026-09-02, tools/probe-rogue-fixture.mjs)

`Actor.create` with a class item at `system.levels` plus the subclass item yields
`getRollData().scale.rogue["sneak-attack"]` (a `ScaleValueTypeDice`) and
`@scale.gloom.dreadful-strike`, and a Cunning Strike activity's `save.dc.value` computes off the
sheet. `level-up-pc` does not persist advancement, but a class item at a level is enough for the
scale — the built fixtures rest on it.

#### There is no DC for an ability check (2026-08-23)

`Actor5e##rollD20Test` never sets `options.target`; a DC reaches a roll only when a caller supplies
one (an activity's save DC, a requested check — the sheet's own button does not). So *"when you
fail an ability check"* (Tactical Mind and a family of 2024 features) is not computable from
system data. The boundary — where the module may offer by itself and where a human must press —
is written in `scripts/d20-folds.js`'s header; it is why Tactical Mind's refund ASKS
([DESIGN §8](DESIGN.md), *Tactical Mind's refund*).

#### dnd5e DECLARES ITS OWN HOOKS, machine-readably, in the shipped bundle (2026-08-23)

The system's `dnd5e.mjs` carries the list of hooks it dispatches twice over: literal `Hooks.call` /
`callAll` names, and JSDoc blocks tagged `@memberof hookEvents`. ⚠ **Neither is sufficient alone:**
the TEMPLATED roll hooks (``Hooks.callAll(`dnd5e.roll${name}`, …)`` — `rollAbilityCheck`,
`rollSavingThrow`, `rollSkill`, `rollToolCheck`) exist only in the JSDoc, and `rollAttackV2` only as
a literal — the family that caused the v1.23.0 bug. Take the union, and EXPAND the templates from
each roll's `hookNames` and the `const name = …` at the site (`tools/check-hook-dispatch.mjs`, since
2026-09-28; before it the expanded names were pinned holes). At 5.3.3: 88 literal, 92 JSDoc, 105
in the union. On 6.0.5 with the expansion: `tools/dnd5e-hooks.json` records 159 dispatched names
(76 with `Hooks.call`), 100 JSDoc names, 167 in the union, 0 holes. ⚠ **It does not work on Foundry** (measured on
v14.365's `foundry.mjs`, 7.9 MB): 0 of the 15 core hook names this module registers — computed,
minified, no JSDoc. A core-hook check built on it would prove nothing.

#### Forcing a die face: invert `mapRandomFace` (2026-08-23)

Every die goes through `CONFIG.Dice.randomUniform`, and `Die#mapRandomFace(u) = ceil((1 - u) *
faces)`, so face `n` is the midpoint of its band:

```js
CONFIG.Dice.randomUniform = () => 1 - ((n - 0.5) / faces);   // n on a d`faces`
```

⚠ Never force 1 or 20 on a d20 (a fumble and a crit take different paths; `smoke-d20-folds` §3 uses
5 then 19). ⚠ Restore it in a `finally` — a PRNG left stubbed makes every later section
deterministic without saying so. ⚠ It affects every die on the page, damage included. It is what
lets a suite assert an OUTCOME (a reroll **replaces**, `base + 14`) where `missUntilStamped` can
prove only a stamp. Used by smoke-d20-folds, smoke-clock and smoke-heatmetal.

#### `itemUses` consumption targets are UUIDs on disk and ids in memory (2026-08-23)

A compendium feature consuming another item's uses stores a **compendium UUID**
(`Compendium.dnd-players-handbook.classes.Item.phbftrSecondWind`);
`Activity#_remapConsumptionTarget` rewrites it to the actor's item id during `prepareData`, but
**only via `actor.sourcedItems`** (recorded compendium source). `item.toObject()` shows the UUID
while the live activity shows the id — read the prepared activity. ⚠ **When the remap fails,
nothing says so**: a DDB-imported or hand-made pool keeps the UUID and "has a use left" answers no
forever. **Distinguish "pool not found" from "pool empty" and warn on the first** (d20-folds.js,
`shared.js` `poolOf`).

#### The Battle Master's maneuvers ship three ways at once (2026-09-04, `dnd-players-handbook.classes`)

- **Two activities, the consumption target a bare IDENTIFIER** (Trip, Goading, Menacing, Pushing,
  Disarming, Maneuvering): a damage activity *Superiority Die* (activation `special`,
  `@scale.battle-master.superiority.die`) targeting `combat-superiority`, plus a save activity.
  Advancement remaps the identifier on a built character; a clone or hand-added item keeps it.
- **One damage activity, the target a COMPENDIUM UUID** (Distracting Strike, Sweeping Attack):
  matched against the actor's item by `_stats.compendiumSource` (and the UUID's last segment).
- **Where the condition lives differs by row.** Menacing's Frightened and Goading's *Goaded* are
  LINKED to the save activity (`onSave: false`); **Trip's Prone sits on the ITEM with
  `activity.effects` EMPTY** — nothing applies it unless a follow-up presses it (`onFail: "prone"`
  in `HIT_OPTIONS`); Distracting's *Distracted* is linked to its damage activity (no save). Pushing
  and Disarming carry no effect.

`hit-menu.js` `poolOf` / `dieFormulaOf` read them; `Roll.replaceFormulaData` resolves the die to a
bare `d8`, and the reader prefixes the `1`. Combat Superiority's own text has the pick limit (one
maneuver per attack) and the DC rule; the save activities carry their own DC, and the demand card
reads it off them.

#### The pack ships Goaded as a TRANSFER effect (2026-09-04, the walk)

Goading Attack's save failed and nothing landed: the item on a Battle Master PC no longer carried the effect
its save activity linked (`applicableEffects: []`). **Goaded is `transfer: true` in the pack**, so
with `legacyTransferral` off it is a PASSIVE on the wielder (a Battle Master's sheet listed Goaded), and a
turn expiry or a hand tidy of the wielder's Effects tab deletes the ITEM's only copy. The other
seven maneuvers' effects are `transfer: false`. hit-menu.js `repairTransferEffects` corrects a
row's target-facing effects to `transfer: false` on the WIELDER's copy (world data, never the
compendium), by the owning client, at `ready` and when the item lands; a copy that already lost
the effect presses it from the compendium's own copy (`compendiumCopyOf`, by recorded source or by
NAME in the premium packs). `smoke-hitmenu` §9c and §11; `tools/fixture-maneuvers.mjs`
compares and `--fix`es an actor's maneuvers, `tools/probe-hitmenu-table.mjs` reads a demand card.
**When a save "applies nothing", first read whether the activity's effect entries RESOLVE.**

#### The cast slice applies EVERY effect a utility activity links (2026-09-05, smoke-superiority first live run; the walk)

The pack models Bait and Switch's rolled AC bonus as TWELVE effects ("Baited AC +1" … "+12") on
one activity, and the cast slice applied all twelve: AC 13 → 91. Evasive Footwork's "Evasive AC"
is the same class. superiority-uses.js strips the `castApply` stamp for every Battle Master
maneuver card in `preCreateChatMessage`, one hook after polish.js writes it. Fire Shield ships
Warm AND Chill Shield on one activity, marked nothing to say they are alternatives, and a PC wore
both resistances; the `EFFECT_CHOICES` row is where "one of these" lives and the cast slice asks
([RULINGS.md](RULINGS.md) *Effect choices*). **A pack that models a rolled number as a fan of
effects is not content for the cast slice; the machine that rolls the number applies the one.**

#### The offer row: NOTHING above the rule fold (2026-09-05, the third time)

User: "you keep making this mistake … putting extra text above the rule tick". `riderMenuHTML` and
`hitMenuHTML` IGNORE a row's `caveat`; a condition the module cannot judge is in the pack's own
rule text, folded. The card is where a caveat may be said.

#### Two "Parry"s, one name (2026-09-05)

The Monster Manual's Parry is a `utility` Reaction rolling `@prof` — a +AC reaction (`Parry:ac`).
The Battle Master's is a `heal` Reaction whose formula is the superiority die + max(Str, Dex) —
the REDUCTION, modelled as a retroactive heal. The hold tells them apart by the ACTIVITY
(`INTERRUPT_REDUCTIONS["Parry"].activity === "Heal"`), never the name: the fighter's becomes a
`damage` interrupt, rolled at the ANSWER (die and Reaction spent), riding the hold target as
`reduceBy`; `reduceDamages` takes it off the parts before `applyDamage` ("Parry — reduced by N").

#### The save machine REFUSES a dead target, and a fixture must survive the feature (2026-09-02)

A 7d6 Sneak Attack kills the 11-HP fixture goblin, and `stampSaveDemand` then skips the corpse —
every Cunning Strike effect vanished with no error. The suites give the victim a 400-HP pool. When
a chain "does nothing" after a big hit, read the target's HP before the code.

#### The combat tracker's roll never fires `dnd5e.rollInitiative` — and what the skill hooks hand over (2026-09-05, the walk)

"Ambush works for Stealth but not for Initiative": the table presses the tracker's d20 —
`Combat#rollInitiative` → `Combatant#getInitiativeRoll` → an update and a message — and
`Actor5e#rollInitiative`, where dnd5e's hook lives, is never entered. The platform's
`flags.core.initiativeRoll` on the created message covers BOTH roads, and by then the combatant's
number is written; d20-folds.js stamps from that message, latched so the roads meet once, and a
fold that moves the number updates the combatant. `dnd5e.rollInitiative(actor, combatants)`
fires after `Combat#rollInitiative` has written the number. The skill/tool hooks' second argument
is `{ ability, skill|tool, subject }`; the tool hook is `rollToolCheck`. **A suite that exercises
only the API method is not exercising the button.** Holds on 6.0.5: d20-folds.js registers all
three hooks, all in the 6.0.5 hook artifact.

#### ⚠ unverified on 6.0 — What the platform applies for a 2024 condition (2026-09-03, tools/probe-conditions.mjs, dnd5e 5.3.3)

Every one of the fourteen statuses (and Exhaustion 1 and 3) pressed on a fixture; dnd5e did all
of it itself through `CONFIG.DND5E.conditionTypes` — the status effects carry NO `changes`; the
system reads the status set in data preparation:

| Clause | Reading |
| --- | --- |
| Petrified: Resistance to all damage, Immunity to Poison, immune to Poisoned/Diseased | `dr.value ["ALL"]`, `di ["poison"]`, `ci ["poisoned","diseased"]`; a 10/10/10 slashing/poison/fire hit calculates 5/0/5 |
| Speed 0 — Grappled, Restrained, Paralyzed, Petrified, Unconscious | every movement key 0 |
| Paralyzed / Stunned / Petrified imply Incapacitated; Unconscious implies Incapacitated AND Prone | `conditionTypes[x].statuses` / `riders`; the implied status lands on the actor |
| Exhaustion: −2 × level on every D20 Test, −5 ft × level Speed | `1d20 + 1 - 2` at level 1, `- 6` at 3; walk 25 / 15 |
| Poisoned: Disadvantage on ability checks | `2d20dis + 1` on a `configure: false` check — the ROLL is bent |

⚠ **A row that re-applied any of these would double it** — the gate may REMIND, never apply.
**Unconscious ending does NOT lift Prone** (rules-correct), so a fixture that toggles Unconscious
toggles Prone off itself.

#### ⚠ unverified on 6.0 — The roll mode is a FIELD; there are no advantage flags (2026-09-04, 5.3.3: zero hits in the bundle)

The mode lives on the sheet: `system.abilities.<abl>.save.roll.mode`, `.check.roll.mode`,
`system.skills.<skl>.roll.mode`, `system.tools.<tool>.roll.mode`,
`system.attributes.{init,death,concentration}.roll.mode`. An effect bends a roll by ±1 (ADD;
OVERRIDE forces) and `AdvantageModeField` nets the sources by the rules; `roll.modeCounts` holds
COUNTS, not sources — only the effect changes can say WHO. The system also sets modes from its own
rules (heavy armour → Stealth −1), which have no change to read. The gates' `modeSources` reads the
changes; the rest stays unexplained by ruling ([RULINGS.md](RULINGS.md) *The gate before the
roll*). 6.0 added effect rule changes (`attack|check|save|d20 : advantage|…`, *Not in this pass*
above) that nothing here has measured.

#### ⚠ unverified on 6.0 — The 2024 PHB pack's Envenom Weapons says 2d6 and ships 2d8 (2026-09-02)

The feature text reads 2d6 Poison; the pack's Poison activity carries `2d8`. The module reads the
activity (N1), so the table gets 2d8 until the pack is corrected; the registry row says so. The
same pack misspells the transfer effect *Assasinate*.

#### ⚠ unverified on 6.0 — dnd5e marks a 0-HP creature `dead` on its own (2026-09-05, Aura of Life)

The built Ranger fixture at 0 HP wore `dead` without anyone pressing it, and a heal guard that
read "not if dead" refused the one creature the text names. `healTriggerDue` reads HP alone. 6.0's
`autoApplyDowned` setting (*Not in this pass* above) may govern this now.

#### ⚠ unverified on 6.0 — Crits on the card (5.3.3)

**`D20Roll#isCritical` reads the D20 *die term's* `options.criticalSuccess`**; the roll's own
`options.criticalSuccess` is a decoy. (d20-folds.js `rerollOf`'s comment says the D20Roll decides
from `options.criticalSuccess` and rebuilds from the original roll's options — consistent either
way, unmeasured.) **A `min3` damage die survives crit doubling — the CARD is what lies:** Great
Weapon Fighting ships `2d6min3`; a crit rolls `4d6min3`, and Foundry's `min` leaves `result: 1`
with `count: 3`, so the card prints a **1** and the 3 appears only in the total. Read the total,
not the faces.

#### ⚠ unverified on 6.0 — Loose 5.3.x facts nobody has re-read

- Hit/miss is computed at render time and never persisted; recompute downstream.
- `activity.use()` returning `undefined` means the use was REFUSED (no slot, no uses, cancelled),
  a different fact from a suppressed card (`results` exists, `results.message` empty).
- Casting a concentration spell at the limit auto-replaces silently — the old effect and its
  dependents cascade away.
- A save's `isSuccess` is a bare `total >= target` — no nat-1/nat-20 override.
- A save rolled from a card's `[[/save]]` enricher arrives chained to that card (the post builder
  read the click's enclosing card).

## 3. The statblock caster

Where most of the monster-side bugs lived.

**A 2024 statblock does not cast from the spell item at all.** Its Spellcasting feature carries
one **`cast` activity per spell**, and the activation, the resource and the consumption all live
on *that activity*. The linked spell item reports `spellSlot: true` with no uses and no slots;
interrogating it concluded every statblock caster was unable to cast, so none ever held.

**`CastActivity#use` never uses itself.** It resolves (or lazily creates) a **cached copy of the
spell on the actor** and calls *that item's* `use()`. So:
- `dnd5e.postUseActivity` fires with the **cached spell's** activity — the used activity's item
  name is "Shield", not "Spellcasting";
- a linked cast **never spends a slot**;
- payment routes to the **cast activity's own uses** instead.

That is why a statblock caster with 0/0 slots can cast at all.

**The system materializes that cached spell by itself**, about half a second after a cast activity
is created. Building one by hand races it and leaves **two** items of the same name. Fixtures wait
for it, never build it.

**On a cast activity, no uses pool means AT-WILL** — the opposite of the spell-item rule.

**`prepared` is a PC concept.** Every levelled spell on a 2024 statblock reads `prepared: 0`;
gating on it disqualifies the whole monster side.

**An NPC's spell-slot maxima are derived** and recompute to 0; a leftover `value` with `max: 0` is
phantom data.

**A name match is not a reaction.** A hobgoblin *wears* an equipment item named "Shield"; matching
an interrupt list on name alone made every shield-carrying monster hold the chain for a spell it
cannot cast. Eligibility requires a real reaction activation, at item level or on an overriding
activity.

**One name can match several items.** An armoured caster owns a worn shield AND the cached Shield
spell; `items.find()` returns whichever sorts first. Every question about a reaction — did the
effect land, what is its AC bonus, what artwork does the popup show — routes through the one
resolver that prefers the cast activity's cached spell. The mechanics came out right while the
*table was told the wrong thing*.

⚠ **`system.attributes.ac.calc === "flat"` returns before `ac.bonus` is ever added** — and
`ac.bonus` is the field Shield's effect writes. On a flat statblock the reaction is inert: the
effect lands, the bonus reads 5, AC never moves. **This is the first thing to check when a reaction
"does nothing" on a monster.** It is bad data, not a shape to support — the Monster Manual is 383
natural / 116 default / **1 flat** of 500. The fix is one field: `calc` → `natural`, leaving `flat`
as the number (verified: the printed AC does not move, and Shield counts).

---

## 4. Lessons that generalize

**A hold raised at the card's birth is enough — the card need not be held back** (2026-09-24, the
chosen areas). FX Studio's gate asks `holdFor(<the cast's activity>)` before it plays ANYTHING keyed
on the cast — the usage card and the placed area alike (its `readers/bythebooks.js`) — so a hold
raised in `preCreateChatMessage` makes both wait, and releasing it plays them. The metamagic ask's
held card (2026-09-09) predates this and stays; the chosen area takes the lighter road (the card is
born, its demand waits empty, the hold keeps the picture). ⚠ The hold is client-local, so the
release rides the ANSWER's card update on every client; only the caster's client has anything to
lift.

**A change that only moves WHEN something happens can make a latent race reachable.** The
player-rolled damage offer added no writer and no state — only fifteen seconds of delay — and that
turned a theoretical lost merge into a measured double application. The lost-merge law is
[ARCHITECTURE §4](ARCHITECTURE.md) *The four state laws* 2: a flag that doubles as a guard is
written under the serializer.

**A unit test that builds its own input can pass over a field the live caller never sends
(2026-09-23).** `memberEffectData` read `row.name`; its test handed it `{ name: … }` — green for
three weeks while every live call passed `tableIndex`'s `rowNamed` shape, whose name is `key`.
Every aura copy on the table was written without its `key` flag. Found only when a live assertion
read the flag. **Build a decision function's test input with the PRODUCER the edge uses**
(`rowNamed`), not a literal of the shape the author remembers.

**A guard read before an `await` is stale by the write (2026-09-23).** The area refresh checked
"pending", awaited, and meanwhile the buzzer closed the demand; its write appended a creature to a
DONE demand — a save nobody would ask, a Fireball circle that never swept. Moving the derivation
into `queueFlagWrite` was not enough: the PRECONDITION moves in with it (saves/areas.js,
metamagic.js; smoke-saves §13d). The checklist is [ARCHITECTURE §11](ARCHITECTURE.md)
*Converting a write to the serializer*.

**A suite that PLANTS a state tests the planted shape, not the table's (2026-09-23).** smoke-riders
planted its marks in the 5.x shape for months; the table's marks came through the 6.0 applier with
a stale pack `item`, and every rider section stayed green while six hits paid nothing. Drive the
real writer at least once per feature (smoke-riders §10 casts the mark).

**Silent partial application is the worst failure class this module has.** It is the reasoning
behind the rider intersection rule and behind refusing a no-GM degraded mode (DESIGN §4). Prefer
"did nothing, and said so" over "did some of it".

**When a report arrives, read the actual log and flags before theorising.** The flat-AC bug (§3)
looked exactly like the module bug just fixed; one read of `ac.calc` settled it.

**Fix the content, not the module.** Every time a misbehaving ability was traced to its compendium
data, fixing the data was cheaper and more durable than teaching the module a name. The module's
job is kinds, not names. (Structural detection is not membership — [ARCHITECTURE §6](ARCHITECTURE.md)
*Registry rules* 1.)

**Every copy of an idiom drifts.** Three walks of table findings traced back to new machines copying
the stamp/route/pop/answer/resolve pattern instead of composing it. Compose, or expect the drift.

**A blocker phrased as a POLICY question is often an unmeasured assumption.** D10 stayed open on
*"who keeps a curated list of dnd5e's hooks true across a release"*; nobody had checked whether the
system could answer it, and it could, twice over (§2 *dnd5e declares its own hooks*). ⚠ **The tell
is a blocker that names no measurement.** D2's stale evidence row, the by-hand import graph and the
sleep budget were the same shape.

**A record lands a round trip before its delete, and anything created in between meets the thing
twice** (2026-09-02, smoke-volleys §10j). The chip spend writes its receipt (R5), then deletes the
chip; a volley's ray 2 created in that gap wrote the same Vex again. The log-walk guard
(`chipSpentOnRecord`) covers it across time; an in-flight set on the client covers the gap. Any
"record, then mutate" consequence has this gap.

**A dotted key on a flag is a PATH** — [ARCHITECTURE §4](ARCHITECTURE.md) law 1. A claim that never
reads back is a loop: the Death Strike follow-up re-applied the attack's damage on every card update
until the victim was at zero (2026-09-02). Every per-target record a new machine writes is an array
with `uuid` fields, including the ones written in a hurry.

**A registry row handed to a document must be COPIED** (2026-09-02, use-chips.js). `Object.freeze`
on the table is right; Foundry's migration writes into an effect's `changes` on create, and a frozen
array refuses the whole create (*"Cannot add property type, object is not extensible"*). One
`.map(c => ({ ...c }))` at the seam.

**"Until the start of your next turn" is NOT a one-round window when it is spent on somebody else's
turn.** A Reaction taken before the reactor's turn comes back at that turn, less than a round
later; `rounds: 1, turnStart` (right for Sap, spent on the sapper's own turn) returned it a round
late. The reaction chip is `0 turns, turnStart` for the platform's mark, and its liveness is stamp
arithmetic (`reactionStands`). When a window's start and its owner's turn can differ, write the
arithmetic.

**A combat left standing in the sandbox reds the battery for the wrong reason** (2026-09-03).
`smoke-bythebooks` §3b and `smoke-effects` §17b assert "out of combat" facts and go red under any
running Combat — the user's own encounter from a morning walk, that day. The battery does not end
combats and must not; look at `game.combats` before diagnosing either red, and ask before deleting
one.

**"The" roll dialog is a list, never a first match** (2026-09-03, smoke-nogm 15/19 twice). Three
machines open the system's RollConfigurationDialog (the save demand, the Topple save, the
concentration ask), and any can be standing when an attack dialog opens; the suite read the
concentration dialog and reported "no gate". Tell dialogs apart by what THEY carry — the attack's
class, `[data-bf-reminder]`, `[data-bf-save-demand]` — never by position.

**A suite that reads a dialog after pressing it reads nothing** (2026-09-02, smoke-sneak). The
element is gone once the dialog closes; read what it SHOWED before the press.

**An instrument that can break what it measures is worth less than a coarser one that cannot.** The
hook ledger wraps `Hooks.call`/`callAll` rather than replacing the module's callbacks in
`Hooks.events`, which would have put live function identities at risk during the run being
measured.

**Coverage is reported; rules are enforced. Do not confuse the two.** A rule that fails on a
legitimately rare case gets tuned until it passes, and a tuned-out check still *reads* as coverage.
When the honest answer is "a human must look at this", print it and say so.

**A driven roll stamps its module flags NESTED, never as dotted keys** (2026-09-24, the Slice A live
run, 7eca747). A chat message given flags both as `flags: { bythebooks: {...} }` and as
`"flags.bythebooks.x"` keeps only the nested object — the dotted keys are silently lost on create.
Savage Attacker's `weaponRolls` stamp, written dotted, erased `attackFor` and `attackHoldPending`
from every driven damage roll, and the older rider stamps (Sneak, clock riders, hit maneuvers,
auto-crit) could do the same. Every stamp on a driven roll now goes in one nested object
(`auto-damage.js`, `volleys.js`, `riposte.js`, `topple.js`); the readers accept both shapes.

**dnd5e 6.0 marks a roll's mode on the die, not with kh/kl** (2026-09-24, 32894d7): an Advantage
attack is `2d20adv` with the modifier `["adv"]` (`adv2` for Elven Accuracy), Disadvantage `dis`;
core Foundry's `kh`/`kl` never appear. Anything reading a d20's mode off the roll reads both.

**A red on a tree that was green an hour earlier is fixture state or timing until proven
otherwise** (2026-09-24/25, the Slice A release floor). The full battery went red six ways on ONE
tree with no module regression: a new fixture's home inside a test's area, a ~2% killing-crit
flake, a killed run's residue judged by four later suites, a second session's bridge joining
mid-run, a popup racing Dice So Nice's cap, and a section that could not tell a natural 20 from a
real failure (each in §5 *Testing against the live sandbox*). Every fix but one was in `tools/`;
the one real bug the reds exposed: the effect bar kept the last creature's chips,
clickable with Remove, once nobody was controlled (d252397). **Read the DETAIL LINE first** — each
of the six named its cause there (a token's square, a stray's name, a popup that never fronted) —
before reading the module.

---

## 5. Process

The operational how-to — the commands, the battery's flags, the release and deploy chain — is
[tools/README.md](tools/README.md). This section is why each step is there.

### Deploy

**`module.json` changes keep vending old values until the Foundry process restarts**; scripts go
live on the next world reload (F5). Expected, not a failure.

**After a deploy, refresh every other connected client.** The apply elect is usually the human GM
window, and it runs the code it *loaded* — a stale window fails brand-new assertions while
everything else passes. Ask the table first if a session is running.

⚠ **The front cache serves module scripts stale for minutes after a WebDAV deploy, keyed on the
*vended version string*.** Scripts load as `file.js?v=<version>` and the vended version only moves
on a process restart, so every deploy between two releases shares one cache key and a suite
launched seconds after a deploy runs minutes-old code (half a night of phantom failures). Wait a few
minutes before any suite, or install a staging build (a new version string is a virgin cache key).

⚠ **A HALF-AWAKE hosted box answers every WebDAV GET with a 404 page**, so
`fvtt-mcp-dnd5e/scripts/deploy-house-module.mjs --check` reports every file DIFFER with ONE identical hash (2026-09-10).
It is not stopped: a read through the MCP bridge (`get-world-info`) wakes it. **Never deploy on an
all-identical check.** ⚠ **WebDAV never prunes**: a file removed from the tree stays on the box
until deleted by hand, or the zip is shipped instead.

### Release

**A release is published by CI, from a pushed tag**
([.github/workflows/release.yml](.github/workflows/release.yml)), and the zip is written by
[tools/build-release.mjs](tools/build-release.mjs), which runs the gate first. Nothing is
published from a desk: the same builder run by hand is the dry run.

⚠ **Never build the zip with `Compress-Archive`.** On Windows PowerShell 5.1 it writes
`scriptsile.js` with a **backslash**, which Node-based extractors treat as one literal filename
at the archive root — the module installs as an empty shell. Every release from v1.1.0 to v1.1.15
shipped that way. A second blind spot (v1.21.0): a **non-recursive** enumeration of `scripts/`
dropped `scripts/decide/` from the zip. **Both survived because nothing ever installs what we
ship**: `check-imports.mjs` proves the working tree, hot-deploy copies the working tree, and the zip
is the one artifact nobody exercises. So the builder recurses **and** reads the finished archive
back: no backslash entry, nothing missing, every relative import resolving inside it, every entry
inflating to the tree's own bytes.

The builder writes the zip itself (Node's `zlib`), with a fixed timestamp: the same tree gives the
same bytes on Windows and on CI, and no shell tool or execution policy sits in the chain.

⚠ **A release tag is annotated**: the workflow publishes its subject as the title and its body as
the notes, and refuses a lightweight one. The notes are hand-written — never NOTES.md, which would
put every platform finding on a public page.

⚠ **A release names the battery that proved it.** The tag's body carries exactly one battery line:
the run's, as `node tools/battery-status.mjs --line` prints it and pasted in,
`Battery: <run id> — <n>/<n> suites, <n>/<n> checks, GREEN`, or `Battery: none (pre-release)`.
`build-release.mjs --tag` refuses a body with neither, with two, or with a RED or PARTIAL run
([tools/battery-line.mjs](tools/battery-line.mjs) is the rule, and the one reading of a run
directory). **The floor**: a patch names at least a `battery.mjs --changed v<the previous release>`
run, everything the release changes; a minor names the full battery. A hand walk is not a battery:
the battery before 3.4.7 found three bugs of 3.4.5, which had shipped on one.

**The line meets its run only on the machine that ran it.** The by-hand `build-release.mjs --tag`,
before the tag is pushed, reads the named run under `dist/battery/` and refuses a line the run does
not bear out: GREEN claimed over a red or unfinished run, a count that is not the run's. CI has no
`dist/battery/`, checks the form alone and says so in its log, so the by-hand run is the check that
the line is true.

**A release without a run is a pre-release, and the installer never sees it.** The workflow
publishes a `Battery: none (pre-release)` body with `--prerelease --latest=false`. The family's way
onto a world, `register-module.mjs` in the MCP repo, installs from
`https://github.com/Txpple/fvtt-mod-bythebooks/releases/latest/download/module.json`, and a world's
update check reads the same URL (the manifest's `manifest` field). GitHub's `latest` release is never
a pre-release, so that URL keeps serving the last release with a run. A pre-release is followed by a
new release with its run, never promoted by clearing its pre-release mark on GitHub, which would put
a release with no run under `latest`. ⚠ **The URL is the whole guard**: `register-module.mjs`
installs whatever manifest it is handed (a pre-release's own `releases/download/vX.Y.Z/module.json`
included), and `deploy-house-module.mjs` copies the working tree and never reads a release.

### Testing against the live sandbox

The sandbox is a local Foundry, often a copy of a live world, and suites MUTATE it. Every harness
resolves its target in one place (`tools/target.mjs`): the MCP client's `local` preset (the world its .env
names) unless `BTB_HOST` names another preset deliberately, and it prints it.

⚠ **THE WORLD IS A BLANK SLATE (2026-10-07).** No suite reads anything the world brings: not a
character, scene, item, macro or folder. `tools/fixture-suite.mjs` builds every fixture from the
COMPENDIA (the PHB, the DMG, the system's packs) into "Test Suite" folders, and the battery runs it
first and `tools/teardown-fixtures.mjs` last (`--keep` leaves them), so any world serves, a fresh copy
of the live table included, and is left as it was found. Running one suite by hand: `fixture-suite`
first. Before 2026-10-07 some fixtures were clones of a campaign's characters and three suites read
those characters by name; a campaign PC's play state leaked in (spent slots refused a Shield cast,
2026-09-23) and a change of campaign broke the suites outright. Both shapes are retired.

The accounts are the MCP repo's .env, never names in this repo: the suite identity
(`FOUNDRY_SUITE_USER`, GM), the bridge (`FOUNDRY_USER`, GM) and the player identity
(`FOUNDRY_PLAYER_USER`, a player role) the two-client suites and the player-owned fixtures use. They
are world users, so a world without them cannot run the suites; the fixtures grant ownership by
that env name on every run.

⚠ **A friendly fixture must never stand where a suite plays** (2026-09-24, smoke-reminders §11e).
BTB Test Goliath first homed at y=1400, beside smoke-reminders' target: an ALLY within 5 feet, so
the gate judged Pack Tactics true and the suite read Advantage it never set up. Every suite places
its tokens between x 800–1700 and y 900–1700; the Goliath and the Halfling now home in the range's
empty top-left corner (300, 200 and 500, 200 — `tools/fixture-suite.mjs`). The map is a fact the
gate reads since 2026-09-22 (R1), so a fixture's home is part of every suite's setup. It cuts both
ways: the Halfling's corner home fell inside smoke-saves §8f's cone the same day; the cone stands on
empty ground now and the section asserts it first.

⚠ **A KILLED battery poisons the next one** (2026-09-24, a battery killed inside smoke-hitmenu for
a reboot). A kill skips the teardown, so the killed suite's LINKED tokens, the items it added and
what it raised on a base actor (a 1000-HP victim, −30 save bonuses, an AC override) all stay — and
every later suite that measured distance from the shared attacker (smoke-bythebooks 5e's
auto-crit; smoke-volleys §9–11, "within 5 feet of BTB Test Fighter" on every ray), reused an "add if
missing" item (smoke-hitmenu 9c's stripped Goading Attack) or placed a fresh unlinked token from the
base actor (smoke-saves 15) was judged from the residue. Two batteries red, no module change. Now:
`fixture-suite` stamps its own tokens `fixtureHome` and puts the base goblins back to the statblock
every run; `reset-fixture-state` sweeps every other LINKED `BTB Test` token and runs FIRST in the
battery (`coverage-map.mjs` ORDER); the suites that delete the shared UNLINKED tokens by actor
sweep linked strays only (smoke-rescue had deleted the shared attacker and left a linked one); the
maneuver suites add fresh copies every run; smoke-volleys asserts clear ground around its row.
**After a killed run, `reset-fixture-state` comes before any suite** — automatic inside the battery,
by hand outside it.

**A status update on a battery is the progress bar** (2026-09-30, the user's rule: *"give a progress bar
unix style with key stats"*): `node tools/battery-status.mjs` — the bar, done/total, elapsed and eta, suites
ok/failed with the red ones named, the checks, what runs now and what is next (tools/README.md *The
progress bar*). Never a paragraph.

⚠ **The sandbox can be stopped by Windows with nothing here changed (2026-08-28).** The headless
server died on `An Application Control policy has blocked this file` — Foundry's unsigned
`classic-level` native module, refused by **Smart App Control**, which vets unsigned binaries
against Microsoft's cloud reputation service and caches the verdict on the file; the cache expired
and the re-query came back "unknown". The tells: CodeIntegrity event 3077
(`Microsoft-Windows-CodeIntegrity/Operational`) naming the file, and a cluster of unrelated unsigned
binaries refused the same days (this repo's `rollup.win32-x64-msvc.node`, so vitest too). SAC has no
exclusion list; turning it off is the machine owner's call, never a session's. ⚠ That switch is
one-way (re-enabling needs a Windows reset).

⚠ **`/api/status` "users" is not a socket count, and it blocks the prod→local refresh.** The
refresh refuses to image the world while users are connected (a mid-write LevelDB snapshot tears),
but the count sat at **1 with every client disconnected** across 90 s (2026-08-28) while in-world
`game.users` showed only the bridge. Check the in-world truth, then `--force`.

⚠ **Disconnect the MCP bridge before any suite run**, and let the sole-GM preflight fail the run if
anything else is connected. Measured: one cast created two identical chips, one attack posted two
Push cards, damage applied twice. A probe's `--observe` bypasses the preflight on purpose — use it
only with the world otherwise empty.

⚠ **Another Claude session's bridge is a second GM, and `disconnect-bridge` cannot reach it**
(2026-09-24). Every open session runs its own MCP server holding the bridge identity; a second
session's (the bridge identity) joined the sandbox mid-battery and the preflight refused every suite
after it (two GM-capable clients). The run was BLOCKED, not red — read the refusal line before the
counts. `disconnect-bridge` logs out only the calling session's; the cure was ending the other
session's MCP server processes. **Since 2026-10-10 (MCP 4.4.0 and later) the bridge leaves a seat
record** — a file per process on the machine and `flags.world.fvttMcpBridge` on its User document —
so the preflight's refusal names the holder (pid, Claude Code session, since), `disconnect-bridge
{ all: true }` from any session ends every other holder's browser, and a bridge idle for 20 minutes
logs itself out (`FOUNDRY_IDLE_LOGOUT_MIN`). The process table is no longer the way to find it.

**How the elect is picked.** Core's `Users#activeGM` picks the **highest-role** active GM; id breaks
ties only between equal roles. The human GM is role 4 and both assistant accounts role 3, so **the
user's own window keeps the elect while connected — live MCP assistance during play is allowed.**
But `isActiveGM()` is per-**user**, not per-page (every page on the elected account runs the
apply/sweep), and bridge and suite are both role 3: with no role-4 client they **tie** and id
decides, so the suite may not be the elect. The bridge is a hot standby that inherits the elect the
moment no role-4 client is around — why leaked processes matter.

⚠ **The sole-GM preflight cannot see a second suite** (2026-08-23): two suites both join as the suite
identity, and it counts **users, not sockets**. A second suite started mid-`smoke-maneuvers`,
re-pinned six settings underneath it and left an orphaned fixture. The harness's pid lockfile is the
guard now ([tools/README.md](tools/README.md)). Before it, a chained back-to-back battery produced one
polluted assertion (a message-count delta of −20), green in isolation twice — a prior suite's
teardown landing late.

**There is no hand-kept settings table (2026-10-07).** `tools/verify-settings.mjs` checks every world
setting against a REFERENCE it does not hold: in a battery, the world's own values recorded before
the run (`settings-before.json` in the run directory), so whatever a table has tuned is protected;
by hand, the registered defaults (from `scripts/settings.js` itself), plus a git-ignored
`tools/settings.local.json` of single-key overrides. A new setting is covered by registering it. It
also clears a scene's leftover `noCover` flag. ⚠ The tool exits 1 on unfixed drift (a battery once
printed "settings clean" over six drifted settings).

⚠ **A crashed run launders its pins into the next run's "prior".** A suite crashed with its settings
pinned; the next green run snapshotted those pins as the prior it faithfully restored — eleven
settings drifted with every suite reporting success. Settings-first restore cannot catch this; only
an external reference can — the battery's before-the-run snapshot is that reference. A KILLED suite
is the same case (2026-10-07: smoke-twoclient's watchdog left four settings pinned and three later
suites failed on them): `verify-settings --against <the run's settings-before.json> --fix`.

⚠ **A MID-RUN RESTORE GOES BACK TO THE SUITE'S OWN BASELINE, NEVER THE WORLD'S PRIOR (2026-09-02).**
`smoke-reminders` §6 put the Reminder Sources list back to `prior.reminderList`; the world still
carried the pre-`range` list, so every later section judged with range DISABLED — §10 failed in a
full run and passed under `--section 10`. `prior` is for the TEARDOWN. The tell, as with the
launder: a section-only run that is greener than the full run.

**Every teardown restores SETTINGS FIRST, in its own guard.** One try/catch around the whole cleanup
let an earlier error skip the restore, and a night of failed runs left residue on a live world
that was then misread as the table's tuning. **A table's config is sacred; deletes and sweeps are
best-effort.**

**Testing that fits the size of the change (2026-09-23, user ruling — Shape A).** The full battery
is about 50 minutes; a change now runs what its `COVERS` claims select (`battery.mjs --changed`,
[tools/README.md](tools/README.md) *The battery*). Measured on the day: an `emanations.js` +
`decide/emanations.js` change selects nine rows (~17 min) — seven because `saves/demand.js` imports
one decide function; a `mastery.js` change six. ⚠ What the design pass found: (1) the hook ledger
cannot scope a change — nearly every machine listens on the same chat hooks (a
registration-to-ledger join maps almost every file to 23 of 26 suites), so the map is DECLARED and
the runtime proof reads MOMENTS (what a file wrote), not hooks; (2) a `decide/` file the spine
imports is the full battery (`verdict.js`, `receipt.js`, `card.js` and eight more), because
`shared.js` / `auto-apply.js` reach everything; (3) every `decide/` file already had a test file, so
the unit tier stayed a per-feature rule ([ARCHITECTURE §11](ARCHITECTURE.md)). **The release floor
is unchanged: the full battery, unattended.** The first battery through the new harness (2026-09-23,
30 rows, 62 min) read hook coverage 56/56 and claims 76/84 proven; its eight UNPROVEN are triaged in
[ARCHITECTURE §10](ARCHITECTURE.md) D11.

⚠ **A message COUNT is not a cursor (2026-09-23).** `smoke-d20-folds` sliced the log at a
pre-click `game.messages.size`; a deletion elsewhere shifted the index — it flaked in the battery,
four times. Match by CONTENT since a TIMESTAMP taken before the click (`m.timestamp >= since`), and
wait for a receipt rather than sleeping. The same day `smoke-expiry` §8b's flake was DICE:
`swing('sap')` re-swings after a natural 1 or a killed victim, Vex is spent by the FIRST swing, and
the assertion read the LAST swing's message; it finds the record by the chip it names now.

**A section the dice can satisfy by accident proves nothing** (2026-09-24). smoke-metamagic §15
read "no offer" for both a natural 20 (a hit even against AC 60) and an orb cast at nobody (the
cached token had left the canvas), and 15e/f/g passed on nothing (`undefined === undefined`). The
d20 is pinned to a 10 (§2 *Forcing a die face*), the target re-resolved and asserted (15-pre), and
the hollow assertions demand their subject. Its kin, the same night: smoke-effects §15c's ~2%
killing crit leaves nobody to sap, and takes vex's retry.

**Effect and feature NAMES from the packs carry colons, ampersands and misspellings** ("Adv: Attacks
& Saves", "Assasinate"). A list spec that splits on ":" eats them; Effect Sources is parsed
whole-chunk (`whole: true`) and matched lower-cased both sides. The scan that found them (2026-09-02)
read the packs' LevelDB through `classic-level` from a COPY without the LOCK file (Foundry holds the
real one); embedded effects live under their own `!items.effects!<itemId>.<effectId>` keys.

**A suite fixture that presses a status must plant canonical-id carriers only.** A random-id
disabled leftover cannot be removed by the standard cleanup (§1, `toggleStatusEffect`), so the
victim became immortally prone and the poisoned fixture starved three sections across runs.

**Announcements leak across suite section windows.** A verdict card trails its fold by
dice-animation seconds, so a section that flips a setting can catch the *previous* section's card
wearing the old setting. Drain your own announcements before leaving a section; attribute cards by
content signature, never keyword.

**The `applied` receipts land AFTER the announcements.** An assertion that reads `applied` the moment
the card appears races the last flag write. Wait for the receipt itself.

**A popup finder excludes the sidebar** (2026-09-05, smoke-superiority): a text match over
`foundry.applications.instances` finds the CHAT LOG (it renders every card's text) before the popup.
The d20 folds' rescue window is the spine's own DOM window — found through
`document.querySelectorAll(".application")` with a `[data-bf-rescue-row]` inside, its rows
`[data-bf-rescue-action="<kind>"]`, not `data-action` buttons.

⚠ **SOME `sleep()` CALLS ARE LOAD-BEARING.** Of the 213 seconds of unconditional sleeping measured
across the suites on 2026-08-23, **73 sit under an assertion that something did NOT happen** — you
cannot wait for a thing not to occur, so the sleep IS the window (`smoke-hold` comments two that
way). Say so beside the number; the next reader is looking for sleeps to remove.

⚠ **WAIT FOR THE THING THE NEXT ASSERTION READS — three surfaces, three moments.** A cast produces a
usage CARD (a document), a transient BANNER (a hook, immediate) and a durable card LINE (a
`renderChatMessage` decoration, later). Waiting on one and asserting on another fails a working
module: `smoke-resources` waited for the banner and three "the card keeps its line" assertions went
red; `smoke-volleys` waited for `status === 'resolved'` when the spread ROLLS post after it (both
2026-08-23, converting sleeps).

⚠ **A popup that opens after the verdict pause is timed from the pause, not the stamp**
(2026-09-24, smoke-metamagic §16). The Empowered and Seeking popups wait out
`dramaticVerdictPause` (Dice So Nice's animation, capped at 6 s), and a 6 s wait started at the
stamp raced it: the popup fronted at 4.2 s and 6.15 s in two runs. The waits are 12 s, the suite
logs the popup's own timing, and 16i no longer passes on a popup that never fronted.

⚠ **SOME SECTIONS FAIL INSIDE THE BATTERY AND PASS ALONE — the ordering class, undiagnosed.**
`smoke-saves` §22b/c and `smoke-emanations` §11e/f (2026-09-09): a dialog or an effect from an
EARLIER suite still standing when the section opens. `smoke-saves` §18/11 and `smoke-superiority`
§1b/c/e (2026-09-22): a READ landing before its WRITE, the outcome itself right. All green alone
straight after, on the same code and world. **Rerun the section alone before diagnosing**, and read
a repeat as the pattern.

⚠ **A binding declared inside a section gate is invisible until someone filters.** A `const` from
one section read in another passes a FULL run and throws only under `--section`; three were found
by static scan, and `smoke-maneuvers` §H deleted §B's and §I's fixtures **by binding** (it deletes by
NAME now). **After gating a suite, scan for names declared in one gate and read outside it.**

---

## 6. Working with this table

- They **dogfood live and report bugs from real play.** Trust those reports — they have been
  right every time. Reproduce in the harness before fixing, and add the assertion that would
  have caught it.
- They **will ask whether a feature is worth its complexity, and they mean it.** Answer with
  the real cost and a recommendation *before* building, not after.
- They **keep git clean and want the rev cut when the work is done.** Never leave a bumped
  version dangling without the matching release. Build and test freely, then *offer* the
  release — they say yes, but the offer is the courtesy.
- They **test immediately after a release**, so say plainly what is live, what needs an F5, and
  what needs a process restart.
- They **cut prose that repeats itself.** Say it once.
- **Surface doc/code disagreements** rather than silently choosing.
