/**
 * By the Books — shared constants and who/when facts: setting keys, the elects, combat identity, the
 * deadline ceiling, the flag-write serializer and the landing claim. A leaf — imports nothing.
 */

export const MODULE_ID = "fvtt-mod-bythebooks";
/** The package id before 3.0.0 (formerly Battle Flow): the flag scope old documents still carry. */
export const LEGACY_ID = "fvtt-mod-battleflow";
// The `data-bf-*` DOM anchors predate the rename and stay: cards posted before 3.0.0 carry them in their stored HTML.
export const TITLE = "By the Books";

// THE LOGGER (ARCHITECTURE §7 *The shared readers*): every console line the module writes goes out here, opening
// with its title; biome.json fails a console call anywhere else in scripts/. The console is read at each call, so a
// page that swaps it (a live suite gathering the module's errors) hears every line.

/** The module's debug switch: `CONFIG.debug.bythebooks = true` (in the console) turns `log.debug` on. */
const debugging = () => globalThis.CONFIG?.debug?.bythebooks === true;

/** A line's arguments with the title in front of the first: `log.warn("Could not …", err)` → "By the Books | Could not …". */
const titled = args => ((typeof args[0] === "string") ? [`${TITLE} | ${args[0]}`, ...args.slice(1)] : [`${TITLE} |`, ...args]);

/**
 * `log.warn`, `log.error`, `log.info`: the console's own, the title in front; `log.debug` the same behind the debug
 * switch.
 */
export const log = Object.freeze({
  /** @param {...any} args */
  warn: (...args) => console.warn(...titled(args)),
  /** @param {...any} args */
  error: (...args) => console.error(...titled(args)),
  /** @param {...any} args */
  info: (...args) => console.info(...titled(args)),
  /** @param {...any} args */
  debug: (...args) => { if ( debugging() ) console.debug(...titled(args)); }
});

/**
 * Publish one of the module's public hooks (`bythebooks.<name>`). 3.0.x also fired each under its
 * Battle Flow name (`battleflow.<name>`) so readers could move on their own schedule; 3.1.0 stopped
 * (issue #14), once FX Studio 0.9.0 listened to the new names.
 * @param {string} name  the hook's name after the prefix
 * @param {...any} args
 */
export function publish(name, ...args) {
  Hooks.callAll(`bythebooks.${name}`, ...args);
}

/**
 * Read one of the module's own flags: the new scope, else the legacy one. FOR GOOD: old chat cards
 * keep their old-scope flags forever (the migration skips messages). ⚠ The legacy scope is read as a
 * plain property on purpose: `getFlag(LEGACY_ID, …)` throws once the old package is uninstalled.
 * @param {any} doc
 * @param {string} key
 */
export const readFlag = (doc, key) => doc?.getFlag?.(MODULE_ID, key) ?? doc?.flags?.[LEGACY_ID]?.[key];

/**
 * Remove one of the module's own flags from a document the migration never touches (a chat card): the
 * new scope's key, and the legacy scope's too when it holds one, so `readFlag` cannot read it back.
 * @param {any} doc
 * @param {string} key
 * @param {object} [options]
 */
export function clearFlag(doc, key, options = {}) {
  const update = { [`flags.${MODULE_ID}.-=${key}`]: null };
  const legacy = doc?.flags?.[LEGACY_ID];
  if ( legacy && (typeof legacy === "object") && (key in legacy) ) update[`flags.${LEGACY_ID}.-=${key}`] = null;
  return doc.update(update, options);
}

export const S = {
  decisionTimer: "decisionTimer",       // every question's clock
  dramaticBeat: "dramaticBeat",
  saveRolls: "saveRolls",               // demanded saves and concentration: prompt or roll automatically
  concVisibility: "concVisibility",
  holdReveal: "holdReveal",
  masteryAsk: "masteryAsk",
  resourceNotices: "resourceNotices",
  rollResults: "rollResults",           // owns dnd5e's attack and challenge visibility
  bloodiedAll: "bloodiedAll",           // owns dnd5e's bloodied visibility
  playerRollDamage: "playerRollDamage", // client
  effectBar: "effectBar",               // client: the effect view's bar above the hotbar
  effectHover: "effectHover",           // client: the effect view's hover card and held key
  summonArt: "summonArt",               // world, hidden: the summon art window's table (summon-art.js)
  formArt: "formArt"                    // world, hidden: the Wild Shape art window's table (summon-art.js)
};

export const setting = key => game.settings.get(MODULE_ID, key);

/** The Decision Timer in seconds; 0 waits indefinitely. */
export const decisionWindow = () => Math.max(0, Number(setting(S.decisionTimer)) || 0);

/** Do demanded saves and concentration checks roll without a popup? */
export const savesRollThemselves = () => setting(S.saveRolls) === "auto";

/** Seconds, at most, a verdict waits for Dice So Nice's dice to come to rest. */
export const DICE_WAIT_SECONDS = 4;

/** Seconds a cast reaction's AC change is given to land before the attack is re-tested. */
export const HOLD_SETTLE_SECONDS = 8;

/**
 * THE LEADING WINDOW. One user may have the game open in two windows, and each is a client: both would
 * see `activeGM.isSelf` and both would land every consequence (two familiars, every damage twice). This
 * window's id, and the flag on its User naming the window that leads (the one loaded or focused last; ui.js
 * claims it). No flag: this window leads.
 */
export const WINDOW_ID = Math.random().toString(36).slice(2, 14);   // no Foundry at import: the tools load this file
export const LEAD_FLAG = "leadWindow";
export const leadsWindow = () => {
  const lead = game.user?.flags?.[MODULE_ID]?.[LEAD_FLAG] ?? null;
  return !lead || (lead === WINDOW_ID);
};

/** Exactly one client may perform world-visible applications: the active GM's, in its leading window. */
export const isActiveGM = () => (game.users.activeGM?.isSelf ?? false) && leadsWindow();

/** Whose client auto-rolls for this actor: the first active non-GM owner by id, else the active GM. */
export const rollerUserFor = actor => game.users
  .filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"))
  .sort((a, b) => a.id.localeCompare(b.id))[0] ?? game.users.activeGM;

// THE FLOW ELECT (ARCHITECTURE §4 *The flow elect*): the active GM, else the actor's own player.
// ⚠ ONE elect, never two: with a GM on it answers exactly as `isActiveGM()`.

const flowElectFor = actor =>
  game.users.activeGM ?? (actor ? rollerUserFor(actor) : undefined);

const isFlowElectFor = actor => (flowElectFor(actor)?.isSelf ?? false) && leadsWindow();

/** Does THIS client drive a moment whose subject is `subjectUuid`? */
export function drivesMomentFor(subjectUuid) {
  if ( isActiveGM() ) return true;
  if ( game.users.activeGM ) return false;
  const actor = resolveUuid(subjectUuid);
  return !!actor && isFlowElectFor(actor);
}

// THE UUID (ARCHITECTURE §7 *The shared readers*): the document behind a uuid, read here and nowhere else
// (tools/check-lookups.mjs). This leaf is the one file every other file can import.

/**
 * The document behind a uuid, or null. A uuid the platform cannot read now is "not here", as a deleted document
 * is: an empty one, a malformed one, an embedded document inside a pack (`fromUuidSync` throws on those). A pack
 * document that is not loaded answers its index entry; a token's synthetic actor resolves through its token
 * (`Scene.….Token.….Actor.…`).
 * @param {string|null|undefined} uuid
 * @returns {any}
 */
export function resolveUuid(uuid) {
  if ( !uuid ) return null;
  try { return fromUuidSync(uuid) ?? null; }
  catch { return null; }
}

/**
 * The document behind a uuid, loaded (a pack document read whole), or null: the same "not here" as `resolveUuid`,
 * a lookup that throws included.
 * @param {string|null|undefined} uuid
 * @returns {Promise<any>}
 */
export async function resolveUuidAsync(uuid) {
  if ( !uuid ) return null;
  try { return (await fromUuid(uuid)) ?? null; }
  catch { return null; }
}

/** May this client WRITE to that actor? Turns a silent permission failure into a spoken one. */
export const canApplyTo = actor => !!actor?.isOwner;

/**
 * The targets this client may write: each row's actor owned here — the actor document a row carries (a mastery
 * payout's), else its `uuid` resolved. ⚠ A card's target row (decide/card.js `targetsOf`) carries the actor's uuid
 * as `actor`, a string: it is resolved, never read as the document.
 * @template {{uuid?: string, actor?: any}} T
 * @param {T[]|null|undefined} targets
 * @returns {T[]}
 */
export const writableTargets = targets => (targets ?? []).filter(t =>
  canApplyTo(((t.actor !== null) && (typeof t.actor === "object")) ? t.actor : resolveUuid(t.uuid)));

// THE RECIPIENTS (ARCHITECTURE §5): who a whispered card reaches, one named set each; ui.js `postCard`
// takes one as `to`, and a card with none is public.

/** Every GM's user id. */
export function gmIds() {
  return game.users.filter(u => u.isGM).map(u => u.id);
}

/** This client's user alone: a note to self, or an envelope only its fold reads. */
export function selfIds() {
  return [game.user.id];
}

/** This client's user and every GM. */
export function selfAndGmIds() {
  return [...new Set([game.userId, ...gmIds()])];
}

/** The actor's owners and every GM (a GM owns every actor). */
export function ownersAndGmIds(actor) {
  return [...new Set(game.users.filter(u => u.isGM || actor?.testUserPermission?.(u, "OWNER")).map(u => u.id))];
}

/**
 * Whisper to self what did NOT happen for lack of a GM, and what still stands.
 * @param {string} what
 * @param {string|null} [stands]
 */
export async function whisperNoGM(what, stands = null) {
  try {
    await ChatMessage.create({
      whisper: selfIds(),
      speaker: { alias: TITLE },
      content: `<p><strong>No GM is connected</strong>, so ${what} was not applied.`
        + `${stands ? ` ${stands}` : ""}</p>`
    });
  } catch(err) {
    log.warn("Could not post the no-GM notice.", err);
  }
}

/** Everyone who may answer for a held target: its owners, or the GM for unowned NPCs. */
export function canAnswerFor(actor) {
  if ( !actor ) return false;
  if ( actor.isOwner && !game.user.isGM ) return true;
  // A GM answers only where no active player owns the actor.
  if ( game.user.isGM ) return !game.users.some(u => !u.isGM && u.active && actor.testUserPermission(u, "OWNER"));
  return false;
}

/**
 * Does THIS client answer a moment its user started (a summon or a transform cast from a sheet)? The
 * user who cast it, in their leading window, while they are connected — a GM casting for a player's
 * character answers on the GM's screen; with that user gone, whoever `canAnswerFor` the actor.
 * @param {string|null|undefined} userId   who started it (a User id)
 * @param {Actor|null} actor
 */
export function answersHere(userId, actor) {
  const by = userId ? game.users.get(userId) : null;
  if ( by?.active ) return by.isSelf && leadsWindow();
  return canAnswerFor(actor);
}

/** Does THIS client drive the continuation? The roller, or the active GM when they are offline. */
export function isContinuingClient(hold) {
  const owner = game.users.get(hold?.continuedBy);
  return owner?.active ? (owner.isSelf && leadsWindow()) : isActiveGM();
}

/** Does THIS client keep a card — its author while connected, else the active GM? ONE client answers yes. */
export const keepsMessage = message =>
  !!message && (message.isAuthor || (!message.author?.active && isActiveGM()));

/** Is this actor a combatant in any started combat? ⚠ Matched the platform's way (see `activeCombatFor`). */
export function inRunningCombat(actor) {
  if ( !actor ) return false;
  return game.combats.some(c => c.started && c.getCombatantsByActor(actor).length);
}

/**
 * `game.combat` if started and this actor is in it, else null. ⚠ A `rounds` duration off any other
 * combat is born expired. ⚠ `getCombatantsByActor` matches synthetic actors by TOKEN, not actor id.
 */
export function activeCombatFor(actor) {
  const combat = game.combat;
  if ( !combat?.started || !actor ) return null;
  return combat.getCombatantsByActor(actor).length ? combat : null;
}

/**
 * `${combat.id}:${round}:${turn}`, or null out of combat. Once-per-turn: a mismatch at read time IS
 * expiry — no timer, no sweep.
 */
export const combatStamp = () => {
  const c = game.combat;
  return c?.started ? `${c.id}:${c.round}:${c.turn}` : null;
};

/**
 * THE DATA-PLANE STAMP (ARCHITECTURE *The data plane*): WHEN and WHO on every consequence.
 * ⚠ Spread `...statContext(src)` at the write site; never hand-roll it or stamp post-hoc.
 */
export const statContext = (sourceUuid = null) => ({ combat: combatStamp(), sourceUuid });

/** The actor uuid a document's own `sourceUuid` stamp names (an applied effect, a chip), or null. */
export function stampedSourceOf(doc) {
  return readFlag(doc, "sourceUuid") ?? null;
}

/**
 * The sheet's `appliedEffects` as plain facts, each with its item's name (the box names the item).
 * @param {Actor} actor
 * @returns {{id: string, name: string, item: string|null, changes: {key: string, value: string}[]}[]}
 */
export function sheetModeEffects(actor) {
  return (actor?.appliedEffects ?? []).map(e => ({
    id: e.id, name: e.name,
    item: (e.parent instanceof Item) ? e.parent.name : null,
    changes: (e.changes ?? []).map(({ key, value }) => ({ key, value }))
  }));
}

/**
 * The roll in the table's words ("Wisdom saving throws", "Stealth checks").
 * @param {{kind: "save"|"check", ability?: string|null, skill?: string|null, tool?: string|null, concentration?: boolean}} roll
 */
export function rollLabelFor({ kind, ability = null, skill = null, tool = null, concentration = false }) {
  const abl = ability ? (CONFIG.DND5E?.abilities?.[ability]?.label ?? ability) : null;
  if ( (kind === "save") && concentration ) return "saving throws to maintain Concentration";
  if ( kind === "save" ) return `${abl ?? "these"} saving throws`;
  if ( skill ) return `${CONFIG.DND5E?.skills?.[skill]?.label ?? skill} checks`;
  if ( tool ) {
    let label = tool;
    try { label = dnd5e.documents.Trait.keyLabel(tool, { trait: "tool" }) || tool; } catch { /* the id */ }
    return `${label} checks`;
  }
  return `${abl ?? "these"} checks`;
}

// THE DEADLINE CEILING: a past deadline fires at once, and some buzzers roll dice, so an old card
// must not re-arm. ⚠ Absolute, not a session epoch (per-client); ten minutes clears a cold boot.
export const DEADLINE_CEILING_MS = 600_000;

/** No deadline ⇒ never arm. */
export const deadlineIsLive = deadline =>
  !!deadline && ((Date.now() - deadline) <= DEADLINE_CEILING_MS);

/**
 * `setFlag` MERGES: a key a mutate callback deleted stays stored unless the write carries the
 * platform's `"-=key": null`. Objects recurse; an array is a value and is replaced whole.
 * @template {object} T
 * @param {any} before  the stored flag
 * @param {T} after     the mutated clone, marked in place
 * @returns {T}
 */
export function markDeletions(before, after) {
  const plain = v => (v !== null) && (typeof v === "object") && !Array.isArray(v);
  if ( !plain(before) || !plain(after) ) return after;
  for ( const k of Object.keys(before) ) {
    if ( !(k in after) ) after[`-=${k}`] = null;
    else markDeletions(before[k], after[k]);
  }
  return after;
}

// SERIALIZED FLAG WRITES. ⚠ Overlapping merges lose an entry (last setFlag wins), and a lost
// receipt entry lands the damage twice. Client-local suffices: every write comes from the elect.

const flagWrites = new Map();

/**
 * Edit `message`'s `key` flag in place (deep clone) under a lock; any document with flags will do.
 * `initial` is the flag's shape when the document has none yet (default `{ targets: [] }`; `[]` for
 * a list, `{}` for a map). ⚠ Return `false` to SKIP the write, or a render-hook writer loops.
 * @param {any} message
 * @param {string} key
 * @param {(current: any) => (void|boolean)} mutate
 * @param {{ initial?: any }} [opts]
 */
export function queueFlagWrite(message, key, mutate, { initial = { targets: [] } } = {}) {
  const lock = `${message.id}|${key}`;
  const run = async () => {
    const before = readFlag(message, key) ?? initial;
    const current = foundry.utils.deepClone(before);
    if ( mutate(current) === false ) return;
    await message.setFlag(MODULE_ID, key, markDeletions(before, current));
  };
  // `.then(run, run)`: one failure must not strand the writes behind it.
  const prior = flagWrites.get(lock) ?? Promise.resolve();
  const next = prior.then(run, run);
  const tail = next.catch(() => {});  // the stored link never rejects
  flagWrites.set(lock, tail);
  void tail.then(() => { if ( flagWrites.get(lock) === tail ) flagWrites.delete(lock); });
  return next;                        // the caller still sees a failure
}

// THE LANDING CLAIM (ARCHITECTURE §4 *The flow elect*): a record's landing is claimed inside the serializer with a
// stamp naming its claimant, so a claim whose claimant is gone is told from one still landing and the record is
// landed by whoever drives it now. ⚠ The stamp's clock is the server's (`game.time.serverTime`): a claim judged on
// another machine must not die of that machine's clock running ahead.

/** A claim older than this, its record still unlanded, is dead: a landing takes seconds (4.5 s at worst, measured). */
export const CLAIM_CEILING_MS = 60_000;

const claimClock = () => game.time?.serverTime ?? Date.now();

/** The stamp a claim writes: the claimant's user, its window, when. */
export function claimStamp() {
  return { by: game.user?.id ?? null, window: WINDOW_ID, at: claimClock() };
}

/**
 * Does `claim` still hold its landing? A stamp holds while its user is connected and it is younger than the
 * ceiling (a window closed mid-landing while its user stays on, in another window); `true`, a claim written
 * before the stamp, always holds; nothing holds nothing.
 * @param {any} claim
 * @param {number} [now]
 */
export function claimHolds(claim, now = claimClock()) {
  if ( !claim ) return false;
  if ( typeof claim !== "object" ) return true;
  if ( !(claim.by && game.users?.get(claim.by)?.active) ) return false;
  return (now - (Number(claim.at) || 0)) <= CLAIM_CEILING_MS;
}

/**
 * Claim a record's landing, through the serializer: `due(current)` says the record waits for its landing, and a
 * record already landed (`done`) or claimed by a claim that holds (`field`) is refused; a dead claim is written
 * over. Resolves `{ over }` (the dead claim replaced, or null) when this client claimed, null when it did not.
 * `field` and `done` are paths into the record (`companion.acting`); `done: null` for a step whose own `due` ends it.
 * @param {any} message
 * @param {string} key
 * @param {(current: any) => boolean} due
 * @param {{ field?: string, done?: string|null }} [opts]
 * @returns {Promise<{ over: any }|null>}
 */
export async function claimLanding(message, key, due, { field = "applying", done = "applied" } = {}) {
  /** @type {{ over: any }|null} */
  let taken = null;
  const { getProperty, setProperty } = foundry.utils;
  await queueFlagWrite(message, key, current => {
    if ( !due(current) || (done && getProperty(current, done)) || claimHolds(getProperty(current, field)) ) return false;
    taken = { over: getProperty(current, field) || null };
    setProperty(current, field, claimStamp());
  });
  return taken;
}

