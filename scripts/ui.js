/**
 * By the Books — THE SPINE (ARCHITECTURE.md §5): popups and their cascade, countdown bars, the ACK,
 * moment clocks, and the relay / rescue / demand / resumable / withhold registries.
 * ⚠ Imports NO machine (ARCHITECTURE §7).
 */
import { MODULE_ID, readFlag, TITLE, S, setting, isActiveGM, deadlineIsLive, canAnswerFor, keepsMessage, queueFlagWrite, DICE_WAIT_SECONDS,
  LEAD_FLAG, WINDOW_ID, leadsWindow, CLAIM_CEILING_MS, drivesMomentFor, isContinuingClient, gmIds, selfIds, log } from "./core.js";
import { TONE, popupKey, bfCard, momentBarHTML, holdBarHTML, nextCascadeSlot, cascadePosition,
  pileBackToFront, rescuePaneHTML, rescueRowsHTML, esc, tickRowsHTML, choiceRows } from "./decide/present.js";
import { pendingDemands, resolveDemand } from "./decide/demand.js";
import { abilityOf, originIdOf, rollKindOf, subKindOf } from "./decide/card.js";
import { SURFACES } from "./surfaces.js";
import { listen, listenOnce } from "./dispatch.js";

/** Popup keys this client has auto-shown, so a re-render never stacks a second one (the pending row's latch). */
const shownMoments = new Set();

/**
 * Popups on screen, by popup key. Read in this file alone (tools/check-popups.mjs): a machine closes one
 * through `closePopup` and fronts one through `frontPopup`; the export is the live suites' seam.
 */
export const livePopups = new Map();

const popupSlots = new Map();       // popup key → staircase slot
let cascadeAnchor = null;           // {left, top} the staircase grows from; dies with the pile

/**
 * Render and lifecycle-manage a decision popup; a failed render leaves the card to answer from.
 * `message` null: a popup before any card (the gear light's toggle), with no row to redraw. A machine opens a
 * popup through `openMomentPopup`, which calls this (tools/check-popups.mjs); the export is the live suites' seam.
 */
export async function openManagedPopup(key, message, dialog) {
  const close = dialog.close.bind(dialog);
  dialog.close = async (...args) => {
    livePopups.delete(key);
    popupSlots.delete(key);
    if ( !popupSlots.size ) cascadeAnchor = null;
    if ( message?.documentName === "ChatMessage" ) void Promise.resolve(ui.chat?.updateMessage?.(message)).catch(() => { /* row refreshes next render */ });
    return close(...args);
  };
  // ARCHITECTURE.md §5 law 7: z-order is rank, then causal order.
  const slot = nextCascadeSlot(popupSlots.values());
  popupSlots.set(key, slot);
  livePopups.set(key, dialog);
  const priorFocus = document.activeElement;
  try {
    await dialog.render({ force: true });
    returnTheKeyboard(dialog, priorFocus);
    const { left, top } = dialog.position ?? {};
    if ( Number.isFinite(left) && Number.isFinite(top) ) {
      if ( !cascadeAnchor ) cascadeAnchor = { left, top };
      const want = cascadePosition(cascadeAnchor, slot);
      if ( (want.left !== left) || (want.top !== top) ) dialog.setPosition(want);
    }
    if ( popupSlots.size > 1 ) {
      for ( const k of pileBackToFront(popupSlots) ) {
        const d = livePopups.get(k);
        if ( d?.rendered ) { try { d.bringToFront?.(); } catch { /* fronting is best-effort */ } }
      }
    }
    scheduleBarSync(dialog.element);
    // The row redraws to defer to the popup (a popup before any card has no row).
    if ( message?.documentName === "ChatMessage" ) void Promise.resolve(ui.chat?.updateMessage?.(message)).catch(() => { /* row refreshes next render */ });
  } catch(err) {
    livePopups.delete(key);
    popupSlots.delete(key);
    if ( !popupSlots.size ) cascadeAnchor = null;
    log.error(`Could not open the popup — answer from the card.`, err);
  }
}

/** ⚠ Hand focus back: DialogV2 autofocuses its default (NOTES *A dialog's DEFAULT button takes the keyboard*). */
function returnTheKeyboard(dialog, priorFocus) {
  const active = document.activeElement;
  if ( !active || !dialog.element?.contains?.(active) ) return;
  const back = priorFocus && (priorFocus !== document.body) && priorFocus.isConnected
    && !dialog.element.contains(priorFocus) && (typeof priorFocus.focus === "function");
  if ( back ) priorFocus.focus({ preventScroll: true });
  else active.blur?.();
}

/**
 * ⚠ A plain object on a roll's `dialog.options` is copied twice (`deepClone`, `mergeObject`); both
 * pass a class instance by reference, so a gate that must stay one object wears this class.
 */
export class DialogCarried {
  constructor(data = {}) { Object.assign(this, data); }
}

/**
 * The demand fieldset in the SYSTEM's save dialog, from a DialogCarried `dialog.options.bfSaveDemand`:
 * { cardId, key, owed(card) (false closes it), present(card) → bfCard args, bar(card), failed }.
 */
function drawDemandFieldset(app, element, demand) {
  const card = game.messages.get(demand.cardId);
  if ( !card ) return;
  if ( demand.owed && !demand.owed(card) ) { void app.close(); return; }
  adoptManagedPopup(demand.key, card, app);
  if ( element.querySelector("[data-bf-save-demand]") ) return;
  const host = document.createElement("div");
  host.innerHTML = `<fieldset data-bf-save-demand><legend>${demand.legend ?? "The demand"}</legend>`
    + `${bfCard(demand.present(card))}${holdBarHTML(demand.bar?.(card) ?? null, "to roll")}</fieldset>`;
  const fieldset = host.firstElementChild;
  const configuration = element.querySelector(SURFACES.dialogConfiguration);
  const formulas = element.querySelector('[data-application-part="formulas"]');
  if ( configuration ) configuration.insertAdjacentElement("beforebegin", fieldset);
  else if ( formulas ) formulas.insertAdjacentElement("afterend", fieldset);
  else element.querySelector("form")?.prepend(fieldset);
  scheduleBarSync(element);
}

/**
 * Mark a roll dialog's default button with a persistent style (⚠ `autofocus` is lost to any click).
 * @param {HTMLElement} element
 * @param {string} action         advantage | normal | disadvantage | bf-fails
 */
export function markDefaultButton(element, action) {
  const hue = { advantage: TONE.good, disadvantage: TONE.bad, "bf-fails": TONE.bad }[action] ?? TONE.neutral;
  // ⚠ Outline drawn by hand: a dialog opened by someone else's roll has no focus ring.
  const MARK = {
    background: `color-mix(in srgb, ${hue} 38%, transparent)`,
    borderColor: hue,
    boxShadow: `0 0 0 2px ${hue}, inset 0 0 0 1px ${hue}`,
    outline: `2px solid ${hue}`,
    outlineOffset: "2px",
    fontWeight: "bold",
    textShadow: "0 1px 2px rgba(0,0,0,0.6)"
  };
  for ( const button of element.querySelectorAll(`${SURFACES.dialogButtons} button[data-action]`) ) {
    const isDefault = button.dataset.action === action;
    button.toggleAttribute("autofocus", isDefault);
    button.toggleAttribute("data-bf-default", isDefault);
    for ( const [prop, value] of Object.entries(MARK) ) button.style[prop] = isDefault ? value : "";
    if ( isDefault ) { try { button.focus(); } catch { /* not focusable yet */ } }
  }
}

// Every system roll dialog: mark its default (a gate re-marks after), then paint a demand.
listen("renderRollConfigurationDialog", "ui", (app, element) => {
  try {
    const markOwn = () => {
      if ( element.querySelector("[data-bf-default]") ) return;   // a gate got there first
      const own = element.querySelector(`${SURFACES.dialogButtons} ${SURFACES.dialogDefault}`)?.dataset?.action;
      if ( own ) markDefaultButton(element, own);
    };
    markOwn();
    // ⚠ The buttons part can land a frame after the hook.
    requestAnimationFrame(markOwn);
    const demand = app.options?.bfSaveDemand ?? null;
    if ( demand?.present ) drawDemandFieldset(app, element, demand);
  } catch(err) {
    log.error(`Demand fieldset failed to draw.`, err);
  }
});

/**
 * Adopt a dialog the platform is already rendering (`openManagedPopup` minus the render); idempotent.
 * @param {string} key
 * @param {ChatMessage} message
 * @param {foundry.applications.api.ApplicationV2} dialog
 */
export function adoptManagedPopup(key, message, dialog) {
  if ( livePopups.get(key) === dialog ) return;
  const close = dialog.close.bind(dialog);
  dialog.close = async (...args) => {
    if ( livePopups.get(key) === dialog ) livePopups.delete(key);
    popupSlots.delete(key);
    if ( !popupSlots.size ) cascadeAnchor = null;
    void Promise.resolve(ui.chat?.updateMessage?.(message)).catch(() => { /* row refreshes next render */ });
    return close(...args);
  };
  const slot = nextCascadeSlot(popupSlots.values());
  popupSlots.set(key, slot);
  livePopups.set(key, dialog);
  try {
    const { left, top } = dialog.position ?? {};
    if ( Number.isFinite(left) && Number.isFinite(top) ) {
      if ( !cascadeAnchor ) cascadeAnchor = { left, top };
      const want = cascadePosition(cascadeAnchor, slot);
      if ( (want.left !== left) || (want.top !== top) ) dialog.setPosition(want);
    }
  } catch { /* the platform's own position stands */ }
  void Promise.resolve(ui.chat?.updateMessage?.(message)).catch(() => { /* row refreshes next render */ });
}

/** popup key → the buzzer armed for it (`openMomentPopup`'s `buzzer`). */
const popupBuzzers = new Map();

/**
 * Open a machine popup behind the canAnswerFor gate; null when gated off or already open (fronted). The one door
 * to a DialogV2 (tools/check-popups.mjs): `message` is the card, or the id a popup with no card is keyed by.
 *   onDismiss  `(dialog) => …`, once, when the dialog closes unanswered (the X, Escape, the autoclose, the buzzer, a
 *              close from elsewhere) or never opens (a failed render); a button press is an answer
 *   buzzer     `{ at, fire }`: at the absolute deadline `at` the dialog closes and `fire` runs, armed before the
 *              render; any close disarms it. ⚠ This client's clock alone, not re-armed on a reload
 * @param {any} message
 * @param {string} sub
 * @param {any} subject
 * @param {{title?: string, icon?: string, width?: number, content?: string, buttons?: object[],
 *   autoCloseAt?: number|null, gate?: boolean, onDismiss?: ((dialog: any) => any)|null,
 *   buzzer?: {at: number|null, fire: () => any}|null}} [opts]
 */
export async function openMomentPopup(message, sub, subject, {
  title, icon, width = 440, content, buttons, autoCloseAt = null, gate = true, onDismiss = null, buzzer = null
} = {}) {
  if ( gate && !canAnswerFor(subject) ) return null;
  if ( frontPopup(message, sub) ) return null;
  const key = popupKey(idOf(message), sub);
  const dialog = new foundry.applications.api.DialogV2({
    window: { title, icon },
    position: { width },
    content, buttons,
    rejectClose: false
  });
  let closed = false, dismissed = false;
  // ⚠ At once, before the dialog's own close: a dismissal may read what the dialog holds (the volley's aim).
  const dismiss = () => {
    if ( dismissed || !onDismiss ) return;
    dismissed = true;
    try { void Promise.resolve(onDismiss(dialog)).catch(err => log.error("A popup's dismissal could not be answered.", err)); }
    catch(err) { log.error("A popup's dismissal could not be answered.", err); }
  };
  if ( onDismiss || buzzer ) {
    const close = dialog.close.bind(dialog);
    // DialogV2 closes a button's submission with `submitted`: anything else is the dialog dismissed.
    dialog.close = (...args) => {
      closed = true;
      disarmDeadline(popupBuzzers, key);
      if ( args[0]?.submitted !== true ) dismiss();
      return close(...args);
    };
  }
  if ( buzzer?.at ) {
    armDeadline(popupBuzzers, key, buzzer.at, async () => {
      await closeDialog(dialog);
      await buzzer.fire?.();
    });
  }
  if ( autoCloseAt ) setTimeout(() => {
    if ( livePopups.get(key) === dialog ) void closeDialog(dialog);
  }, Math.max(0, autoCloseAt - Date.now()));
  await openManagedPopup(key, (typeof message === "string") ? null : message, dialog);
  if ( !closed && (livePopups.get(key) !== dialog) ) {
    disarmDeadline(popupBuzzers, key);
    dismiss();
  }
  return dialog;
}

/**
 * A yes-or-no question the player's own action raises (a cast the module takes past dnd5e's dialog, a companion's
 * effect removed): Yes and No (or the question's own words), No the default, through openMomentPopup on this client.
 * True or false, or null when it closes unanswered or is already open.
 * @param {any} message   the card, or the id the popup is keyed by
 * @param {string} sub
 * @param {{title?: string, icon?: string, content?: string, width?: number, yes?: string, no?: string}} question
 * @returns {Promise<boolean|null>}
 */
export async function confirmPopup(message, sub, { title, icon, content, width = 400, yes = "COMMON.Yes", no = "COMMON.No" }) {
  /** @type {(answer: boolean|null) => void} */
  let settle = () => {};
  const answered = new Promise(resolve => { settle = resolve; });
  const dialog = await openMomentPopup(message, sub, null, {
    gate: false, title, icon, width, content,
    buttons: [
      { action: "yes", label: yes, icon: "fa-solid fa-check", callback: () => settle(true) },
      { action: "no", label: no, icon: "fa-solid fa-xmark", default: true, callback: () => settle(false) }
    ],
    onDismiss: () => settle(null)
  });
  return dialog ? answered : null;
}

// THE PICK (ARCHITECTURE §5 *The pick*): a pick's inputs are drawn by decide/present.js `pickInputHTML` (or a
// row builder on it) and read here, by their name; tools/check-pickers.mjs holds every machine to both.

/**
 * The inputs of a pick in `root` (a form, a dialog's element, a fieldset), by `name`, in document order; one
 * `value` alone when given. [] when `root` has none.
 * @param {any} root
 * @param {string} name
 * @param {string|null} [value]
 * @returns {any[]}
 */
export function pickInputs(root, name, value = null) {
  return [...(root?.querySelectorAll?.(`input[name="${name}"]${(value === null) ? "" : `[value="${value}"]`}`) ?? [])];
}

/** The value of the pick's checked input (a radio's choice), or null. */
export function picked(root, name) {
  return pickInputs(root, name).find(i => i.checked)?.value ?? null;
}

/** The values of every checked input of the pick (its ticks), in document order. */
export function pickedAll(root, name) {
  return pickInputs(root, name).filter(i => i.checked).map(i => i.value);
}

/** The pick's input an event landed on (`ev.target` or inside it), or null. */
export function pickInputAt(target, name) {
  return target?.closest?.(`input[name="${name}"]`) ?? null;
}

/**
 * A bystander's choice (RULINGS *The asks widened*): the rows as radios, "Pass just this time" checked, the
 * mutes after it (decide/present.js `choiceRows`), one button, Apply. `answer` hears the checked row's key:
 * "pass", "mute-<until>", or one of `rows`. The rest is `openMomentPopup`'s.
 * @param {any} message
 * @param {string} sub
 * @param {any} subject
 * @param {{name: string, rows: object[], mutes?: {until: string, label: string}[], answer: (key: string) => any,
 *   title?: string, icon?: string, width?: number, content?: string}} choice
 */
export function choicePopup(message, sub, subject, { name, rows, mutes = [], answer, content = "", ...popup }) {
  return openMomentPopup(message, sub, subject, {
    ...popup,
    content: content + tickRowsHTML({ name, rows: choiceRows(rows, mutes), kind: "radio" }),
    buttons: [
      { action: "answer", label: "Apply", default: true, callback: (_event, button) => answer(String(picked(button?.form, name) ?? "pass")) }
    ]
  });
}

// THE CLOSE (ARCHITECTURE §5 law 4, *The pending row*): a popup whose question is withdrawn closes on every
// client, through here. A machine never holds the registry: it names the popup by its message and sub.

/** A message or the id its popup keys are built on (the gear light's toggle is keyed by its item's uuid). */
const idOf = message => ((typeof message === "string") ? message : message.id);

/** Close a dialog and wait for it; a dialog already gone is the state wanted. */
async function closeDialog(dialog, options) {
  try { await ((options === undefined) ? dialog.close() : dialog.close(options)); }
  catch { /* a closed dialog is the state we wanted */ }
}

/**
 * Close a moment's popup on this client when it is open: the close awaited, a dialog already gone
 * swallowed. `which` is the popup key's sub, or a test over the subs of this message's open popups (every
 * one it passes closes). True when one was open.
 * @param {{id: string}|string} message   the message, or the id its popup keys are built on
 * @param {string|((sub: string) => boolean)} which
 * @param {object} [options]   handed to the dialog's close
 * @returns {Promise<boolean>}
 */
export async function closePopup(message, which, options) {
  const id = idOf(message);
  if ( typeof which === "string" ) {
    const dialog = livePopups.get(popupKey(id, which));
    if ( !dialog ) return false;
    await closeDialog(dialog, options);
    return true;
  }
  const prefix = `${id}|`;
  const open = [...livePopups].filter(([key]) => key.startsWith(prefix) && which(key.slice(prefix.length)));
  await Promise.all(open.map(([, dialog]) => closeDialog(dialog, options)));
  return open.length > 0;
}

/**
 * Bring a moment's popup to the front when it is open, so an opener never builds a second one. True when
 * one was open.
 * @param {{id: string}|string} message   the message, or the id its popup keys are built on
 * @param {string} sub
 * @returns {boolean}
 */
export function frontPopup(message, sub) {
  const dialog = livePopups.get(popupKey(idOf(message), sub));
  if ( !dialog ) return false;
  dialog.bringToFront?.();
  return true;
}

// THE ACK (ARCHITECTURE.md §5 law 3): the card's owner writes it; anyone else latches and relays.

const localAcks = new Set();

export function momentAcknowledged(message, flagKey) {
  return (readFlag(message, flagKey)?.acknowledged === true)
    || localAcks.has(`${message.id}|${flagKey}`);
}

export async function acknowledgeMoment(message, flagKey) {
  if ( momentAcknowledged(message, flagKey) ) return;
  if ( message.isOwner ) {
    // The update re-renders every client.
    await queueFlagWrite(message, flagKey, current => {
      if ( current.acknowledged ) return false;
      current.acknowledged = true;
    }, { initial: {} });
    return;
  }
  // ⚠ The ack must TRAVEL, or the elect's card drains to timeout.
  localAcks.add(`${message.id}|${flagKey}`);
  void Promise.resolve(ui.chat?.updateMessage?.(message)).catch(() => { /* row refreshes next render */ });
  try {
    await postAnswer("momentAck", {
      to: selfIds(),           // the fold deletes it; this only limits a brief flash
      card: "",
      flags: { [MODULE_ID]: { momentAck: { cardId: message.id, flagKey } } }
    });
  } catch(err) {
    log.warn(`Could not relay the acknowledgement.`, err);
  }
}

// The ack relay registers below `relays` (its dead zone here). Test seam, published on `init`:
// ⚠ a `ready` hook runs before a suite's ledger arms.
listenOnce("init", "ui", () => {
  const mod = game.modules.get(MODULE_ID);
  if ( mod ) mod.api = Object.assign(mod.api ?? {}, { acknowledgeMoment });
});

/**
 * THE BEND BANNER (RULINGS *The asks widened*): when a stored face replaces ANOTHER creature's d20
 * (Portent on a bystander's attack, save or check), every screen flashes it — "⟨diviner⟩'s Portent bends reality!",
 * the roll before and after, the verdict. A view of the resolved flag, drawn once per client (`flashedBends`); the
 * resource flash's seat and fade (resources.js), stacked under any banner already up. True when it drew (the
 * caller raises the dice beside it), false when this client had flashed it already.
 * @param {{key: string, by: string, roller: string, test: string, first: number, stood: number, firstTotal: number,
 *   total: number, verdict: string|null}} bend
 * @returns {boolean}
 */
const flashedBends = new Set();
export function flashBend(id, { key, by, roller, test, first, stood, firstTotal, total, verdict }) {
  if ( flashedBends.has(id) ) return false;
  flashedBends.add(id);
  const stack = document.querySelectorAll(".bf-resource-banner, .bf-bend-banner").length;
  const banner = document.createElement("div");
  banner.className = "bf-bend-banner";
  banner.innerHTML = `<div style="font-size:40px;">${esc(by)}'s ${esc(key)} bends reality!</div>`
    + `<div style="font-size:26px;opacity:0.9;">${esc(roller)}'s ${esc(test)}: the d20 ${esc(String(first))} becomes the ${esc(String(stood))} — `
    + `${esc(String(firstTotal))} → ${esc(String(total))}${verdict ? ` · <strong>${esc(verdict)}</strong>` : ""}</div>`;
  Object.assign(banner.style, {
    position: "fixed", top: `calc(26% + ${stack * 92}px)`, left: "0", width: "100%",
    textAlign: "center", fontFamily: "var(--font-h1, inherit)", color: "#fff",
    textShadow: "0 0 8px #000, 2px 2px 4px #000",
    zIndex: 9998, pointerEvents: "none", transition: "opacity 1s ease-in"
  });
  document.body.appendChild(banner);
  setTimeout(() => (banner.style.opacity = "0"), 5000);
  setTimeout(() => banner.remove(), 6200);
  return true;
}

export function momentButton(label, onClick, style = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  Object.assign(button.style, {
    width: "auto", margin: "0.25rem 0.25rem 0 0", padding: "0 0.6rem", ...style
  });
  button.addEventListener("click", () => onClick());
  return button;
}

// The countdown bar: ⚠ no JS ticking — one animation per bar, positioned from the flag's deadline.

/** Snap every bar to its deadline via `currentTime` (⚠ `animation-delay` drifts before render). */
function syncHoldBars(root) {
  const scope = root?.querySelectorAll ? root : document;
  for ( const bar of scope.querySelectorAll("[data-bf-deadline]") ) {
    const deadline = Number(bar.dataset.bfDeadline);
    const seconds = Number(bar.dataset.bfWindow);
    if ( !deadline || !seconds ) continue;
    const duration = seconds * 1000;
    const elapsed = Math.max(0, Math.min(duration, duration - (deadline - Date.now())));
    // ⚠ In JS: a CSS animation does not exist until its element renders; animate() runs at once.
    let animations = bar.getAnimations?.() ?? [];
    if ( !animations.length ) animations = [
      bar.animate([{ width: "100%" }, { width: "0%" }],
        { duration, fill: "forwards", easing: "linear" }),
      bar.animate([
        { backgroundColor: TONE.good },
        { backgroundColor: TONE.pending, offset: 0.55 },
        { backgroundColor: TONE.bad }
      ], { duration, fill: "forwards", easing: "linear" })
    ];
    for ( const animation of animations ) {
      try { animation.currentTime = elapsed; } catch { /* the next pass gets it */ }
    }
  }
}

/** Sync now and twice more: the first pass can precede the render. */
export function scheduleBarSync(root) {
  syncHoldBars(root);
  requestAnimationFrame(() => syncHoldBars(root));
  setTimeout(() => syncHoldBars(root), 400);
}

// THE PENDING ROW (ARCHITECTURE §5 *The pending row*): what a pending moment adds to its card row, drawn
// here for every machine — the bar, the popup shown once per client, the button that calls it back, the
// clock. A machine says which parts its row has; tools/check-popups.mjs fails a latch or an Answer
// button drawn anywhere else.

/** Show a moment's popup once per client: a re-render never reopens one the player closed. */
function showOnce(message, sub, show) {
  const key = popupKey(message.id, sub);
  if ( shownMoments.has(key) ) return;
  shownMoments.add(key);
  void show();
}

/**
 * Release a moment's show-once latch, so the next render shows its popup again. `which` is the popup
 * key's sub, or a test over the subs this message has latched.
 * @param {{id: string}} message
 * @param {string|((sub: string) => boolean)} which
 */
export function forgetShown(message, which) {
  if ( typeof which === "string" ) { shownMoments.delete(popupKey(message.id, which)); return; }
  const prefix = `${message.id}|`;
  for ( const key of [...shownMoments] ) {
    if ( key.startsWith(prefix) && which(key.slice(prefix.length)) ) shownMoments.delete(key);
  }
}

/**
 * Draw a pending moment's parts onto its card row, always in one order: the bar (synced to its
 * deadline), the popups shown once, the call-back button, then the clock. A part left out, or falsy
 * (a caller writes `may && …`), is not drawn.
 *   bar     the bar's markup (holdBarHTML / momentBarHTML)
 *   latch   `{ sub, show }`, or a list: `show` runs once per client, latched under `popupKey(message.id, sub)`
 *   answer  the call-back button: a label (it re-runs the first latch's `show`), or `{ label, show, style }`
 *           ("Answer" and the latch's `show` when left out; `style` laid over momentButton's)
 *   arm     the machine's clock, `(message) => …`, whose own armAskTimer call names its owner
 * @param {{id: string}} message
 * @param {HTMLElement} row   the bar and the button join its end
 * @param {{ bar?: string|null|false,
 *   latch?: { sub: string, show: () => any }|({ sub: string, show: () => any }|null|false)[]|null|false,
 *   answer?: string|{ label?: string, show?: () => any, style?: Record<string, string> }|null|false,
 *   arm?: ((message: any) => void)|null|false }} parts
 */
export function pendingRow(message, row, { bar = null, latch = null, answer = null, arm = null } = {}) {
  if ( bar ) row.insertAdjacentHTML("beforeend", ` ${bar}`);
  const latches = (Array.isArray(latch) ? latch : [latch]).filter(l => !!l);
  for ( const l of latches ) showOnce(message, l.sub, l.show);
  const button = (typeof answer === "string") ? { label: answer } : (answer || null);
  const show = button ? (button.show ?? latches[0]?.show ?? null) : null;
  if ( button && show ) row.appendChild(momentButton(button.label ?? "Answer", () => { void show(); }, button.style));
  if ( bar ) scheduleBarSync(row);
  if ( arm ) arm(message);
}

/** THE MOMENT CLOCKS: one timer per id on an absolute deadline; re-arming is a no-op. */
export function armDeadline(timers, id, deadline, fire) {
  if ( !deadline || timers.has(id) ) return;
  // ⚠ A deadline past the staleness roof (core.js) would fire at once, and some buzzers roll dice.
  if ( !deadlineIsLive(deadline) ) return;
  timers.set(id, setTimeout(() => {
    timers.delete(id);
    void fire(id);
  }, Math.max(0, deadline - Date.now())));
}

export function disarmDeadline(timers, id) {
  const handle = timers.get(id);
  if ( handle === undefined ) return;
  clearTimeout(handle);
  timers.delete(id);
}

// THE CLOCK'S OWNER: one client arms a decision clock, and every `armAskTimer` call names which
// (tools/check-clocks.mjs). The four owners are core.js's gates (ARCHITECTURE §3).

/** The active GM's leading window: a clock whose expiry writes where only a GM may. */
export const electOwns = () => isActiveGM();
/** The card's author while connected, else the elect: a clock on the author's own card. */
export const keeperOwns = (_flag, message) => keepsMessage(message);
/**
 * Whoever drives the subject's moments: the elect, or with no GM the subject's own player.
 * @param {(flag: any) => string|null|undefined} subjectOf   the subject's uuid, read off the flag
 */
export const subjectOwns = subjectOf => flag => drivesMomentFor(subjectOf(flag) ?? null);
/** The hold's continuing client: the roller, or the elect when they are offline. */
export const continuingOwns = hold => isContinuingClient(hold);

const askPending = flag => (flag.status === "pending") && !flag.answer;
const askDeadline = flag => flag.deadline;

/**
 * THE DECISION CLOCK: one owner's timer per moment, off the flag's absolute deadline, re-checked
 * against the live flag at expiry. A moment no longer pending, or no longer this client's, drops
 * its clock.
 * @param {Map<string, any>} timers
 * @param {any} message
 * @param {string} flagKey
 * @param {(live: any) => any} expire   runs on the owner with the live message once the clock runs out
 * @param {{ owns: (flag: any, message: any) => boolean, pending?: (flag: any) => boolean,
 *   deadline?: (flag: any) => number|null|undefined }} opts
 *   `owns` elects the one client that arms it (the owners above); `pending` says the moment still
 *   waits (default: `status` pending and no `answer`); `deadline` reads when (default: `flag.deadline`)
 */
export function armAskTimer(timers, message, flagKey, expire, { owns, pending = askPending, deadline = askDeadline }) {
  const flag = readFlag(message, flagKey);
  if ( !flag || !pending(flag) || !owns(flag, message) ) { disarmDeadline(timers, message.id); return; }
  armDeadline(timers, message.id, deadline(flag), async () => {
    const live = game.messages.get(message.id);
    const cur = live ? readFlag(live, flagKey) : null;
    if ( !cur || !pending(cur) ) return;
    await expire(live);
  });
}

export function disarmAskTimer(timers, messageId) {
  disarmDeadline(timers, messageId);
}

/** Wait out Dice So Nice, then the dramatic beat, before a table-facing verdict acts. */
export async function dramaticVerdictPause(rollMessage) {
  // ⚠ CAPPED: a DSN promise may never resolve.
  const wait = DICE_WAIT_SECONDS * 1000;
  try {
    const dice = wait ? game.dice3d?.waitFor3DAnimationByMessageID?.(rollMessage.id) : null;
    if ( dice ) await Promise.race([dice, new Promise(r => setTimeout(r, wait))]);
  }
  catch { /* dice are cosmetic */ }
  const beat = (Math.max(0, Number(setting(S.dramaticBeat)) || 0)) * 1000;
  if ( beat ) await new Promise(r => setTimeout(r, beat));
}

// The first row on a card (dispatch.js ORDER): every client shows a live `damageOffer`'s bar (a flag
// this file does not own).
listen("dnd5e.renderChatMessage", "ui", (message, html) => {
  const offer = readFlag(message, "damageOffer");
  if ( (offer?.status === "pending") && (offer.deadline > Date.now()) ) {
    const row = document.createElement("div");
    row.className = "bythebooks-damage-offer";
    row.style.margin = "0.4rem 0 0";
    row.innerHTML = bfCard({
      eyebrow: "Damage", tone: "pending",
      title: "Waiting on the dice",
      subtitle: `${message.getAssociatedActor()?.name ?? "The roller"} has the damage roll`
    }) + momentBarHTML(offer, "to roll");
    html.querySelector(SURFACES.messageContent)?.appendChild(row);
    scheduleBarSync(row);
  }
});

// THE CARD ROWS SEAM (NOTES §2): a chained roll draws as a SUMMARY in its usage card; `cardRow`
// draws on whichever host shows. ⚠ A FLAG write does not re-render the origin — nudged below.

const summaryRows = [];

/** The platform's predicate (ChatMessage5e#renderHTML). */
const rendersAsSummary = message => !!message?.system?.summaryTemplate
  && !!message.system.origin?.system?.rendersSummaries
  && game.settings.get("dnd5e", "chatCardSummary") === true;

/** Wrap a row drawer `(message, host, root)`; a summarized roll's hidden copy is skipped. */
export function cardRow(draw) {
  summaryRows.push(draw);
  return (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if ( !root || root.hidden ) return;
    draw(message, root.querySelector(SURFACES.messageContent) ?? root, root);
  };
}

listen("dnd5e.renderChatMessage", "ui", (_message, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if ( !root ) return;
  for ( const el of root.querySelectorAll(SURFACES.cardSummary) ) {
    const summarized = game.messages.get(el.dataset.messageId);
    if ( !summarized ) continue;
    for ( const draw of summaryRows ) {
      try { draw(summarized, el, el); }
      catch(err) { log.error(`A summary row failed to render.`, err); }
    }
  }
});

// The nudge.
listen("updateChatMessage", "ui", (message, changed) => {
  if ( !changed?.flags?.[MODULE_ID] || !rendersAsSummary(message) ) return;
  ui.chat?.updateMessage(message.system.origin);
});

// THE CARD (ARCHITECTURE §5): every card the module posts goes out through here (tools/check-cards.mjs).

/**
 * Post a card. The speaker: the platform's own for `actor` / `token` when either is not undefined, a null actor
 * included (getSpeaker's fallback: this client's controlled token or its character); else `alias` (`{ alias }`); else `speaker` as
 * given (a stored one); else none. `card` is the content (HTML), `flags` the flags as written, `rolls` the rolls, `to` the
 * recipients: one of core.js's sets (`gmIds()`, `selfIds()`, `selfAndGmIds()`, `ownersAndGmIds(actor)`), a
 * card with none (or an empty list) public. Answers what `ChatMessage.create` answers.
 * @param {{ actor?: any, token?: any, alias?: string, speaker?: any, card?: string, flags?: any, rolls?: any[], to?: string[]|null }} [opts]
 */
export function postCard({ actor, token, alias, speaker, card = "", flags, rolls, to = null } = {}) {
  /** @type {Record<string, any>} */
  const data = { content: card };
  if ( (actor !== undefined) || (token !== undefined) ) data.speaker = ChatMessage.getSpeaker({ actor, token });
  else if ( alias !== undefined ) data.speaker = { alias };
  else if ( speaker !== undefined ) data.speaker = speaker;
  if ( flags !== undefined ) data.flags = flags;
  if ( rolls !== undefined ) data.rolls = rolls;
  if ( to ) data.whisper = to;
  return ChatMessage.create(data);
}

/**
 * THE RELAY'S SENDING SIDE: an answer whose card this client cannot write travels as the answerer's own card,
 * carrying the envelope under its key (`flags[MODULE_ID][envelope]`; the hold's `respondsTo` with its flat
 * siblings), for the relay registered under that key to fold. `toElect`: the fold is the active GM's, so the card
 * is whispered to the GMs; `noGM`: with no GM connected it is not sent, and `noGM` (what to do by hand) is said
 * instead. The rest is `postCard`'s. Answers the card, or null when it was not sent.
 * @param {string} envelope
 * @param {{ toElect?: boolean, noGM?: string|null, actor?: any, token?: any, alias?: string, speaker?: any, card?: string, flags?: any, rolls?: any[], to?: string[]|null }} opts
 */
export async function postAnswer(envelope, { toElect = false, noGM = null, ...card }) {
  if ( !card.flags?.[MODULE_ID]?.[envelope] ) log.warn(`An answer posted without its envelope (${envelope}).`);
  if ( noGM && !game.users.activeGM ) {
    ui.notifications?.warn(noGM);
    return null;
  }
  return postCard(toElect ? { ...card, to: gmIds() } : card);
}

// THE RELAY (ARCHITECTURE.md §4.1): an answer travels as its own message carrying an ENVELOPE;
// the owning client folds it in. ⚠ An envelope's shape is wire format — answers in flight break.

/** envelope flag key → { flagKey, targetOf, owns, fold, cleanup } */
const relays = new Map();

/**
 * `targetOf(envelope)` → the card id; `owns(flag, target)` → this client folds; `fold(current,
 * envelope, message)` mutates inside the serializer, `false` skips the write.
 */
export function registerRelay(envelopeKey, { flagKey, targetOf, owns, fold, cleanup = false }) {
  relays.set(envelopeKey, { flagKey, targetOf, owns, fold, cleanup });
}

// ⚠ The folds repeat every guard INSIDE the serializer: two answers can land in one tick.
listen("createChatMessage", "ui", message => {
  for ( const [envelopeKey, relay] of relays ) {
    const envelope = readFlag(message, envelopeKey);
    if ( !envelope ) continue;
    const target = game.messages.get(relay.targetOf(envelope));
    const flagKey = (typeof relay.flagKey === "function") ? relay.flagKey(envelope) : relay.flagKey;
    const flag = readFlag(target, flagKey);
    if ( !flag || !relay.owns(flag, target) ) continue;
    const written = queueFlagWrite(target, flagKey, current => relay.fold(current, envelope, message));
    if ( relay.cleanup ) {
      void Promise.resolve(written)
        .then(() => message.delete())
        .catch(() => { /* another client's fold got there first */ });
    }
  }
});

registerRelay("momentAck", {
  flagKey: envelope => envelope.flagKey,
  targetOf: envelope => envelope.cardId,
  // ⚠ One client folds: the card's author, or the active GM once the author is gone.
  owns: (_flag, target) => keepsMessage(target),
  cleanup: true,
  fold: current => {
    if ( current.acknowledged ) return false;
    current.acknowledged = true;
  }
});

// THE WAIT: for a write that is about to land — a card another client posts, a roll this client
// posts a beat later, an effect's AC arriving on an actor. The test runs now, then again after each
// write of the kinds it names, until it answers or its time runs out. Nothing polls.

/** The writes a wait can listen for; a message's create and update by default. */
// `updateUser`: the leading window's claim lands as a User flag write (THE LEADING WINDOW, below), so a ready-time
// elect job waits for the lead rather than reading a stale one in the same tick.
const WAIT_ON = Object.freeze(["createChatMessage", "updateChatMessage", "createActiveEffect", "updateActiveEffect", "updateActor", "updateUser"]);

/** @type {Set<{test: () => any, on: string[], resolve: (value: any) => void, timer: any}>} */
const waiters = new Set();

/** A test that throws answers nothing: the wait goes on. */
const askWaiter = test => { try { return test(); } catch { return null; } };

/**
 * Wait until `test` answers (anything truthy) after a write of the kinds in `on`, or `ms` runs out.
 * @template T
 * @param {() => T|null|undefined|false} test
 * @param {{ms: number, on?: string[]}} opts
 * @returns {Promise<T|null>}  the test's answer, or null at the time limit
 */
export function waitForWrite(test, { ms, on = ["createChatMessage", "updateChatMessage"] }) {
  const now = askWaiter(test);
  if ( now ) return Promise.resolve(now);
  for ( const hook of on ) {
    if ( !WAIT_ON.includes(hook) ) throw new Error(`${TITLE} | waitForWrite cannot listen for ${hook} — add it to WAIT_ON.`);
  }
  return new Promise(resolve => {
    const waiter = { test, on, resolve, timer: null };
    waiters.add(waiter);
    waiter.timer = setTimeout(() => expireWaiter(waiter), Math.max(0, ms));
  });
}

/** @param {{resolve: (value: any) => void}} waiter */
function expireWaiter(waiter) {
  waiters.delete(/** @type {any} */ (waiter));
  waiter.resolve(null);
}

function wakeWaiters(hook) {
  for ( const waiter of [...waiters] ) {
    if ( !waiter.on.includes(hook) ) continue;
    const answer = askWaiter(waiter.test);
    if ( !answer ) continue;
    waiters.delete(waiter);
    clearTimeout(waiter.timer);
    waiter.resolve(answer);
  }
}

for ( const hook of WAIT_ON ) listen(hook, "ui", () => wakeWaiters(hook));

// THE OFFER-PART REGISTRY: what a machine paints on the damage offer (auto-damage.js reads it). It
// lives in the spine because a machine registers at its own evaluation, and the spine is always
// evaluated first; a store inside a service on an import cycle would still be in its dead zone.

/**
 * The offer's contributions, in registration order:
 *   due(attackMessage, activity)        → a decision is pending: the offer opens even under auto damage
 *   parts(attackMessage, activity, ctx) → null or `{ html, lines, wire(element), commit() }`; commit runs BEFORE the dice
 * @type {{key: string, due?: Function, parts?: Function}[]}
 */
export const offerParts = [];

/** @param {{key: string, due?: Function, parts?: Function}} part */
export function registerOfferPart(part) {
  offerParts.push(part);
}

// THE RESCUE REGISTRY: several sources offer to rescue one roll; ONE window concatenates
// their slices and routes each press back to its source.

/** flag key → { isPending, subject, view, answer } */
const rescues = new Map();

/** `subject` feeds canAnswerFor; `answer(message, action)` takes back the token its row carried. */
export function registerRescue(flagKey, { isPending, subject, view, answer }) {
  rescues.set(flagKey, { isPending, subject, view, answer });
}

/** Every source's slice as one window's model; headers dedupe by string. */
function mergedRescueView(message) {
  const headerLines = [];
  const rows = [];
  const quotes = [];
  let earliestDeadline = null;
  let clockWindow = null;
  let pending = false;
  let subject = null;
  let stillFailing = false;
  let verdictKnown = false;
  for ( const rescue of rescues.values() ) {
    const slice = rescue.view(message);
    if ( !slice ) continue;
    if ( slice.stillFailing ) stillFailing = true;
    if ( slice.verdictKnown ) verdictKnown = true;
    if ( rescue.isPending(message) ) {
      pending = true;
      subject = subject ?? rescue.subject(message);
    }
    for ( const line of slice.headerLines ?? [] ) {
      if ( !headerLines.includes(line) ) headerLines.push(line);
    }
    rows.push(...(slice.rows ?? []));
    quotes.push(...(slice.quotes ?? []));
    // ⚠ The earliest clock wins and its own window travels with it: a bar is a function of both.
    if ( Number.isFinite(slice.earliestDeadline)
      && ((earliestDeadline === null) || (slice.earliestDeadline < earliestDeadline)) ) {
      earliestDeadline = slice.earliestDeadline;
      clockWindow = slice.clockWindow ?? null;
    }
  }
  // Say when a spend did not get there — ⚠ only where there is a DC; a raw check has no verdict.
  const spent = rows.filter(r => r.spent).map(r => r.label);
  if ( spent.length && stillFailing && verdictKnown ) {
    headerLines.push(`<strong>${spent.join(" + ")}</strong> — not enough yet.`);
  }
  return { headerLines, rows, quotes, earliestDeadline, clockWindow, pending, subject,
    verdictKnown };
}

async function answerRescue(message, flagKey, action) {
  const rescue = rescues.get(flagKey);
  if ( !rescue ) return;
  try { await rescue.answer(message, action); }
  catch(err) { log.error(`The rescue "${flagKey}" could not be answered.`, err); }
}

/** ⚠ One Pass answers EVERY pending source, or the other's clock and offer live on. */
async function passEveryRescue(message) {
  for ( const [flagKey, rescue] of rescues ) {
    if ( !rescue.isPending(message) ) continue;
    await answerRescue(message, flagKey, "pass");
  }
}

function wireRescueWindow(root, message) {
  if ( !root?.querySelectorAll ) return;
  // Quotes stack in one grid cell and flip visibility, so the pane never resizes.
  const quotes = [...root.querySelectorAll("[data-bf-rescue-quote]")];
  for ( const row of root.querySelectorAll("[data-bf-rescue-row]") ) {
    const key = row.dataset.bfRescueRow;
    const swap = () => {
      if ( !quotes.some(q => q.dataset.bfRescueQuote === key) ) return;   // no rule for this row
      for ( const q of quotes ) {
        q.style.visibility = (q.dataset.bfRescueQuote === key) ? "visible" : "hidden";
      }
    };
    row.addEventListener("mouseenter", swap);
    row.addEventListener("focus", swap);
    // A greyed (spent) row carries no action.
    const action = row.dataset.bfRescueAction;
    const flagKey = row.dataset.bfRescueFlag;
    if ( !action || !flagKey ) continue;
    row.addEventListener("click", () => void answerRescue(message, flagKey, action));
    row.addEventListener("keydown", ev => {
      if ( (ev.key !== "Enter") && (ev.key !== " ") ) return;
      ev.preventDefault();
      void answerRescue(message, flagKey, action);
    });
  }
}

/** popup key → last drawn content. ⚠ A redraw is close-and-reopen, so unchanged must be a no-op. */
const rescueContent = new Map();

/** Draw, redraw or close the one rescue window this message owns. */
async function drawRescueWindow(message, { recall = false } = {}) {
  const key = popupKey(message.id, "rescue");
  const view = mergedRescueView(message);
  const open = livePopups.get(key);

  if ( !view.pending || !view.rows.length ) {
    rescueContent.delete(key);
    if ( open ) {
      livePopups.delete(key);
      shownMoments.delete(key);
      await closeDialog(open);
    }
    return;
  }

  const content = bfCard({
    img: view.subject?.img ?? null,
    eyebrow: "Rescue the roll", tone: "pending",
    title: view.verdictKnown ? "This roll falls short. Spend a feature to rescue it?" : "Spend a feature to rescue the roll?",
    subtitle: view.subject?.name ?? "",
    lines: view.headerLines
  })
    + rescuePaneHTML(view.quotes)
    + rescueRowsHTML(view.rows)
    + momentBarHTML({ deadline: view.earliestDeadline, window: view.clockWindow }, "to answer");

  if ( open && (rescueContent.get(key) === content) ) return;
  // ⚠ A plain re-render must not reopen a window the player closed; a CHANGE must.
  if ( !open && !recall && shownMoments.has(key) && (rescueContent.get(key) === content) ) return;

  if ( open ) {
    livePopups.delete(key);
    shownMoments.delete(key);
    await closeDialog(open);
  }
  rescueContent.set(key, content);
  shownMoments.add(key);
  const dialog = await openMomentPopup(message, "rescue", view.subject, {
    title: `Rescue the roll — ${view.subject?.name ?? ""}`,
    icon: "fa-solid fa-life-ring",
    content,
    buttons: [
      // the button accepts the roll as it stands: "Pass" read as passing on the roll itself (RULINGS *The maneuvers and the rescue window*)
      { action: "pass", label: "Accept the roll", default: true, callback: () => passEveryRescue(message) }
    ]
  });
  if ( dialog?.element ) wireRescueWindow(dialog.element, message);
}

/**
 * ⚠ Draws are SERIALISED per message: a second draw mid close-and-reopen would orphan a window.
 * `.then(run, run)` so one failure cannot strand the queue.
 */
const rescueDrawChain = new Map();
function queueRescueDraw(message, opts) {
  const run = () => drawRescueWindow(message, opts);
  const prior = rescueDrawChain.get(message.id) ?? Promise.resolve();
  const next = prior.then(run, run);
  const tail = next.catch(err =>
    log.error(`The rescue window could not be drawn.`, err));
  rescueDrawChain.set(message.id, tail);
  void tail.then(() => {
    if ( rescueDrawChain.get(message.id) === tail ) rescueDrawChain.delete(message.id);
  });
}

/** ⚠ Sources stamp one roll milliseconds apart: wait a tick and draw once. A recall wins the tick. */
const rescueDraws = new Map();
export function syncRescuePopup(message, { recall = false } = {}) {
  if ( !(message instanceof ChatMessage) ) return;
  if ( rescueDraws.has(message.id) ) {
    if ( recall ) rescueDraws.set(message.id, true);
    return;
  }
  rescueDraws.set(message.id, recall);
  setTimeout(() => {
    const asked = rescueDraws.get(message.id) === true;
    rescueDraws.delete(message.id);
    queueRescueDraw(message, { recall: asked });
  }, 0);
}

// THE ONE DELETE-SWEEP, off the uniform `${messageId}|` key prefix.
listen("deleteChatMessage", "ui", message => {
  for ( const [key, dialog] of [...livePopups] ) {
    if ( !key.startsWith(`${message.id}|`) ) continue;
    livePopups.delete(key);
    void closeDialog(dialog);
  }
  const prefix = `${message.id}|`;
  for ( const key of [...shownMoments] ) if ( key.startsWith(prefix) ) shownMoments.delete(key);
  for ( const key of [...localAcks] ) if ( key.startsWith(prefix) ) localAcks.delete(key);
  for ( const key of [...rescueContent.keys()] ) {
    if ( key.startsWith(prefix) ) rescueContent.delete(key);
  }
  // Timers are swept by their owning machines; the spine names no feature.
});

// THE DEMAND REGISTRY: which pending demand a roll answers; the arithmetic is decide/demand.js.
// ⚠ `respondsTo` keeps every meaning (ARCHITECTURE §4).

/** flag key → { flagKey, priority, chained, answering, pendingEntry, pendingFor } */
const demands = new Map();

/**
 * `priority` orders a BARE roll's claim (lower first); `chained`: a roll chained to the card answers
 * it; `answering(flag, facts)` the entry a `respondsTo` roll answers (null: never stamped);
 * `pendingEntry(flag, facts)` / `pendingFor(flag, actorUuid)` the undone entry.
 */
export function registerDemand(flagKey, { priority, chained = true, answering = null, pendingEntry, pendingFor }) {
  demands.set(flagKey, { flagKey, priority, chained, answering, pendingEntry, pendingFor });
}

/** The log as plain cards carrying only the registered flags, oldest first. */
function demandCards() {
  const keys = [...demands.keys()];
  const out = [];
  for ( const m of game.messages.contents ) {
    let flags = null;
    for ( const k of keys ) {
      const f = readFlag(m, k);
      if ( !f ) continue;
      flags ??= {};
      flags[k] = f;
    }
    if ( flags ) out.push({ id: m.id, timestamp: m.timestamp ?? 0, flags });
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

const withCards = matches => matches.map(x => ({ ...x, card: game.messages.get(x.cardId) })).filter(x => x.card);

/** Which demand this roll answers — `{ flagKey, matches: [{ card, entry }] }` or null. */
export function demandAnsweredBy(rollMessage) {
  const facts = {
    respondsTo: readFlag(rollMessage, "respondsTo") ?? null,
    saveFor: readFlag(rollMessage, "saveFor") ?? null,
    originatingMessage: originIdOf(rollMessage),
    actorUuid: rollMessage.getAssociatedActor?.()?.uuid ?? null,
    ability: abilityOf(rollMessage),
    rollType: rollKindOf(rollMessage),
    saveKind: subKindOf(rollMessage)
  };
  const found = resolveDemand(facts, demandCards(), [...demands.values()]);
  return found ? { flagKey: found.flagKey, matches: withCards(found.matches) } : null;
}

/** Every pending demand naming this actor, oldest first — `[{ flagKey, card, entry }]`; `flagKey` narrows to one machine. */
export function pendingDemandsFor(actorUuid, { flagKey = null } = {}) {
  return withCards(pendingDemands(actorUuid, demandCards(), [...demands.values()], { flagKey }));
}

// THE RESUMABLE REGISTRY: `pending(flag, message, cause)` (create | update | render), `drives`
// (this client?), `drive(message)`. ⚠ A drive does no DOM work: these hooks run ahead of every row.

/** flag key → { pending, drives, drive, flagless } */
const resumables = new Map();
/** `${flagKey}|${messageId}` in flight on this client */
const resuming = new Set();
/** Messages a render reached before `ready`: their resume waits for it (`resumeAfterReady`). */
const beforeReady = new Set();

/** `flagless: true` for an arrival with no module flag (an attack's damage roll). */
export function registerResumable(flagKey, { pending, drives, drive, flagless = false }) {
  resumables.set(flagKey, { pending, drives, drive, flagless });
}

function resume(message, cause) {
  // ⚠ THE SNAPSHOT GUARD: a render before `ready` reads the world snapshot the client booted from, and the
  // events Foundry buffered after it (a claim the snapshot missed) are applied only at `ready`; driving from
  // the snapshot can land a record a second time (audits/plans/multi-gm-measurement.md §2.6).
  if ( (cause === "render") && !game.ready ) {
    if ( message?.id ) beforeReady.add(message.id);
    return;
  }
  for ( const [flagKey, r] of resumables ) {
    let flag;
    try { flag = readFlag(message, flagKey) ?? null; } catch { continue; }
    if ( !flag && !r.flagless ) continue;
    const key = `${flagKey}|${message.id}`;
    if ( resuming.has(key) ) continue;
    try {
      if ( !r.pending(flag, message, cause) || !r.drives(flag, message) ) continue;
    } catch(err) {
      log.error(`The ${flagKey} resume check failed.`, err);
      continue;
    }
    resuming.add(key);
    Promise.resolve()
      .then(() => r.drive(message))
      .catch(err => log.error(`The ${flagKey} drive failed.`, err))
      .finally(() => resuming.delete(key));
  }
}

// THE LEADING WINDOW (core.js `leadsWindow`). A GM with the game open in two windows is two clients;
// the window loaded or focused last leads and the others stand down, so a consequence lands once. Taking
// the lead resumes what the last leader left pending; closing the leader hands the lead back (the flag
// cleared, so whichever window is left leads), and a window that lost it takes it again on focus.
/** Did this window lead at the last look (the re-drive reads a lead it was handed)? */
let ledBefore = false;
const claimLead = () => {
  try {
    if ( !game.user?.isGM || (game.user.flags?.[MODULE_ID]?.[LEAD_FLAG] === WINDOW_ID) ) return;
    void game.user.setFlag(MODULE_ID, LEAD_FLAG, WINDOW_ID)
      .then(() => resumeAsLeader())
      .catch(err => log.warn(`This window could not take the lead.`, err));
  } catch(err) { log.warn(`This window could not take the lead.`, err); }
};
/** The recent cards a resume reads beyond the one that changed: what the lead and the re-drive pick up. */
function resumeRecent(cause) {
  for ( const message of game.messages.contents.slice(-60) ) resume(message, cause);
}

let ceilingRecheck = null;
/**
 * Resume what the last leader left pending, now and once more past the claim ceiling: a claim made in a window
 * that closed while its user stays on, in this window, holds until then (core.js `claimHolds`).
 */
function resumeAsLeader() {
  resumeRecent("lead");
  clearTimeout(ceilingRecheck);
  ceilingRecheck = setTimeout(() => resumeRecent("lead"), CLAIM_CEILING_MS + 1000);
}

/** The renders set aside before `ready`, resumed on the documents as `ready` finds them. */
function resumeAfterReady() {
  const ids = [...beforeReady];
  beforeReady.clear();
  for ( const id of ids ) {
    const message = game.messages?.get(id);
    if ( message ) resume(message, "render");
  }
}

listen("ready", "ui", () => {
  resumeAfterReady();
  ledBefore = !!game.user?.isGM && leadsWindow();
  claimLead();
  window.addEventListener("focus", claimLead);
  document.addEventListener("visibilitychange", () => { if ( document.visibilityState === "visible" ) claimLead(); });
  window.addEventListener("beforeunload", () => {
    if ( game.user?.isGM && (game.user.flags?.[MODULE_ID]?.[LEAD_FLAG] === WINDOW_ID) ) void game.user.unsetFlag(MODULE_ID, LEAD_FLAG).catch(() => {});
  });
});

// THE RE-DRIVE (ARCHITECTURE §4 *The flow elect*): a claim whose user left is dead (core.js `claimHolds`) and every
// resumable's `pending` reads it as no claim, so a user leaving resumes the recent cards wherever their drive now
// falls; a window handed the lead by its user's closing leader resumes as a window taking it does.
listen("userConnected", "ui", (_user, active) => { if ( !active ) resumeRecent("lead"); });
listen("updateUser", "ui", user => {
  if ( !user?.isSelf || !game.user?.isGM ) return;
  const leads = leadsWindow();
  const handed = leads && !ledBefore && (game.user.flags?.[MODULE_ID]?.[LEAD_FLAG] !== WINDOW_ID);
  ledBefore = leads;
  if ( handed ) resumeAsLeader();
});

listen("createChatMessage", "ui", message => resume(message, "create"));
listen("updateChatMessage", "ui", message => resume(message, "update"));
listen("dnd5e.renderChatMessage", "ui", message => resume(message, "render"));

// THE WITHHOLD REGISTRY: a withholder may pause another machine's verdict with an offer and hands
// it back via `resumeWithheld`. An offer FAILS OPEN.

/** flag key → { offer } */
const withholders = new Map();
/** name → { resume } */
const withheldMachines = new Map();

export function registerWithhold(flagKey, { offer }) {
  withholders.set(flagKey, { offer });
}

export function registerWithheld(name, { resume }) {
  withheldMachines.set(name, { resume });
}

/** True: do not fold yet. */
export async function withholds(rollMessage, ctx) {
  for ( const [flagKey, w] of withholders ) {
    try {
      if ( await w.offer(rollMessage, ctx) ) return true;
    } catch(err) {
      log.error(`The ${flagKey} withhold offer failed — folding the verdict as it is.`, err);
    }
  }
  return false;
}

/** Without `by`, falls to the one machine registered. */
export async function resumeWithheld(by, ctx, rollMessage) {
  const machine = withheldMachines.get(by) ?? ((withheldMachines.size === 1) ? [...withheldMachines.values()][0] : null);
  if ( !machine ) { log.warn(`No machine registered to resume a withheld verdict${by ? ` for ${by}` : ""}.`); return; }
  await machine.resume(ctx, rollMessage);
}

/**
 * Paint a dice chip picked or not (`!important` beats themes); `data-picked` is what the answer reads.
 * @param {HTMLElement} chip
 * @param {boolean} on
 */
export function paintDieChip(chip, on) {
  if ( !chip ) return;
  chip.dataset.picked = on ? "1" : "0";
  const set = (prop, value) => value ? chip.style.setProperty(prop, value, "important") : chip.style.removeProperty(prop);
  set("background", on ? "rgba(222,120,40,0.85)" : "");
  set("color", on ? "#fff" : "");
  set("border-color", on ? "rgb(222,120,40)" : "");
  set("box-shadow", on ? "0 0 0 2px rgb(222,120,40)" : "");
  set("outline", "");
  chip.setAttribute("aria-pressed", on ? "true" : "false");
}
