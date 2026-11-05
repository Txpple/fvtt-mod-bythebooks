// @ts-check
/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): a granted spell's ways to pay in the sheet's own cast window (cast-ways.js,
 * decide/cast-ways.js). dnd5e lists a "(free casting)" twin beside each of the spell's activities in its picker, and
 * once the use is spent the twin refuses while the slots stand. Here the twins leave the picker; a spell with any way
 * but slots (a free cast on any copy, a feature's cast at will or from a pool) shows its ways as pills in place of the
 * system's slot line, slot pick and a feature copy's spend line: the module's pick ticked, a spent way greyed. A way
 * the system's own fields can pay (a slot on a sheet copy, a feature copy's own spend) is the system's cast; any other
 * is cast again at the consumption hook, so nothing is spent twice. A summon spell's pick is cast by summons.js after
 * its menu.
 */
import { log } from "./core.js";
import { castBy, castWayOf, freeForwardOf, linkedCastOf, matchingActivity, payPillsFor } from "./cast-ways.js";
import { pickInputs } from "./ui.js";
import { WAYS_HEAD } from "./decide/cast-ways.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";

/** A summon spell is summons.js's to fold. */
const isSummonSpell = item => [...(item?.system?.activities ?? [])].some(a => a.type === "summon");

/** A levelled spell with a free cast on its own copy (the picker's twins to take out). */
const twinsOf = item => (item?.type === "spell") && (Number(item.system?.level) > 0) && !isSummonSpell(item)
  ? [...(item.system.activities ?? [])].filter(a => (a.type === "forward") && (freeForwardOf(item, item.system.activities.get(a.activity?.id)) === a))
  : [];

// The picker without the twins; a spell left with one activity skips the picker for it (the window opens at once).
listen("renderActivityChoiceDialog", "free-casts", (app, element) => {
  try {
    const twins = twinsOf(app?.item);
    if ( !twins.length || !element?.querySelectorAll ) return;
    const ids = new Set(twins.map(t => t.id));
    const buttons = [...element.querySelectorAll(SURFACES.activityChoice)];
    for ( const b of buttons ) if ( ids.has(b.dataset.activityId) ) (b.closest("li") ?? b).remove();
    const left = buttons.filter(b => !ids.has(b.dataset.activityId));
    if ( left.length !== 1 ) return;
    const only = app.item.system.activities.get(left[0].dataset.activityId);
    if ( !only ) return;
    if ( element.style ) element.style.display = "none";
    setTimeout(() => { void app.close({ animate: false }); }, 0);
    void only.use();
  } catch(err) { log.warn(`Could not fold the free cast into the picker — pick the activity as usual.`, err); }
});

/** The pills' field on the system's own form: the pick rides the form's data into the use's config. */
const PAY = "bf-pay";

/** A row of the system's form hidden (it still submits); its fieldset too once nothing in it shows. */
function hideRow(row) {
  if ( !row ) return;
  row.style.display = "none";
  const set = row.closest("fieldset");
  if ( set && [...set.querySelectorAll(SURFACES.formGroup)].every(g => g.style.display === "none") ) set.style.display = "none";
}

/** A use's cause that is the copy's own (a feature's copy of a spell, cast through its cast activity), not a forward
 * picked: such a window still shows the ways.
 * @param {any} item
 * @param {any} cause */
const ownCause = (item, cause) => !!cause && !!linkedCastOf(item) && (cause.activity === item.getFlag?.("dnd5e", "cachedFor"));

// The window's ways to pay, in place of the system's slot line, slot pick and a feature's own spend line (hidden, set to
// the pick). A spell with nothing but slots keeps the system's window; a summon spell's pick is summons.js's to cast.
listen("renderActivityUsageDialog", "free-casts", (app, element) => {
  try {
    const activity = app?.activity;
    const item = activity?.item;
    if ( !activity || (activity.type === "forward") || !element?.querySelector ) return;
    if ( app.config?.cause && !ownCause(item, app.config.cause) ) return;
    if ( element.querySelector("[data-bf-pay]") ) return;
    const pills = payPillsFor(activity.actor, item, activity, PAY, { always: true, head: WAYS_HEAD, pick: app.config?.[PAY] ?? null });
    if ( !pills?.ways.some(w => w.kind !== "slot") ) return;
    const consume = element.querySelector('[name="consume.spellSlot"]');
    const slot = element.querySelector('[name="spell.slot"]');
    const spends = [...element.querySelectorAll('[name^="cause.resources"]')].filter(el => typeof el.checked === "boolean");
    const anchor = (consume ?? slot ?? spends[0])?.closest(SURFACES.formGroup) ?? element.querySelector("fieldset") ?? null;
    if ( !anchor ) return;
    // ⚠ the window redraws on every change: the pick lives on its config (the pills are its form's), the module's at first
    if ( app.config ) app.config[PAY] = pills.pick;
    // a block of its own, the heading above the pills (never the system's label-beside-field row)
    const row = document.createElement("div");
    row.style.margin = "0.25rem 0";
    row.innerHTML = pills.html;
    anchor.before(row);
    for ( const el of [consume, slot, ...spends] ) hideRow(el?.closest(SURFACES.formGroup));
    // the system's own fields follow the pick: a slot on a sheet copy and a feature copy's own spend are the system's to
    // pay; every other way is cast again at the consumption hook below
    const sync = key => {
      const way = pills.ways.find(w => w.key === key);
      if ( !way ) return null;
      const cached = !!linkedCastOf(item);
      let moved = null;
      const set = (el, on) => { if ( el && (typeof el.checked === "boolean") && (el.checked !== on) ) { el.checked = on; moved = el; } };
      set(consume, (way.kind === "slot") && !cached);
      for ( const el of spends ) set(el, (way.kind !== "slot") && (way.copyId === item.id));
      if ( (way.kind === "slot") && slot && (slot.value !== way.slot) && [...(slot.options ?? [])].some(o => o.value === way.slot) ) { slot.value = way.slot; moved = slot; }
      return moved;
    };
    for ( const input of pickInputs(row, PAY) ) input.addEventListener("change", () => { if ( input.checked ) sync(input.value); });
    // the first draw: the system's fields set to the module's pick, the window told so (it redraws once)
    const moved = pills.pick ? sync(pills.pick) : null;
    moved?.dispatchEvent(new Event("change", { bubbles: true }));
  } catch(err) { log.warn(`Could not offer the ways to pay in the cast window — cast as usual.`, err); }
});

/**
 * Is the way picked the one this use already pays? A slot on a sheet copy the system's fields hold, or a feature
 * copy's own spend (its cast activity's uses or pool) riding its own cause.
 * @param {any} item   the sheet's own copy
 * @param {any} way
 * @param {any} usageConfig
 */
function paysItself(item, way, usageConfig) {
  if ( way.kind === "slot" ) return !linkedCastOf(item) && (usageConfig.consume?.spellSlot !== false) && (usageConfig.spell?.slot === way.slot);
  return (way.copyId === item.id) && ownCause(item, usageConfig.cause) && (usageConfig.cause?.resources !== false);
}

// A way the use does not already pay (a free cast's forward, a slot through a feature's copy, another copy's way): this
// use is vetoed before anything is spent and cast again the way picked, with the window's other answers (Concentration,
// the template) carried. A summon spell's pick is summons.js's, which vetoes every summon use for its menu.
listen("dnd5e.preActivityConsumption", "free-casts", (activity, usageConfig, messageConfig) => {
  try {
    const pick = usageConfig?.[PAY];
    if ( !pick ) return;
    delete usageConfig[PAY];
    if ( isSummonSpell(activity.item) ) { usageConfig[PAY] = pick; return; }
    // ⚠ the use runs on a CLONE of the item: the cast again is made on the sheet's own copy
    const item = activity.actor?.items?.get(activity.item?.id) ?? null;
    if ( usageConfig.cause && !ownCause(item, usageConfig.cause) ) return;
    const live = item?.system?.activities?.get(activity.id) ?? null;
    if ( !live ) return;
    const route = castWayOf(activity.actor, item, live, { pick });
    if ( !route || (route.way.kind === "none") || (route.way.key !== pick) ) {
      ui.notifications?.warn(`${activity.actor.name} has none of that way left to cast ${item.name} — cast it again.`);
      return false;
    }
    if ( paysItself(item, route.way, usageConfig) ) return;
    const act = (route.copy?.id === item.id) ? live : (route.copy ? (matchingActivity(route.copy, live) ?? route.activity) : null);
    const carried = {
      ...(usageConfig.concentration ? { concentration: foundry.utils.deepClone(usageConfig.concentration) } : {}),
      ...(usageConfig.create ? { create: foundry.utils.deepClone(usageConfig.create) } : {}),
      ...(usageConfig.subsequentActions === false ? { subsequentActions: false } : {})
    };
    const flags = messageConfig?.data?.flags ? { data: { flags: foundry.utils.deepClone(messageConfig.data.flags) } } : {};
    void castBy({ ...route, activity: act, want: route.want ?? live }, { usage: carried, message: flags })
      .catch(err => log.error(`${item.name} could not be cast the way picked — cast it again.`, err));
    return false;
  } catch(err) { log.warn(`Could not take the way picked — the spell is cast as usual.`, err); }
});
