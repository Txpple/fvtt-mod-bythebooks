// @ts-check
/**
 * By the Books — DECISION (ARCHITECTURE.md §2): THE INITIATIVE GRANTS (registry.js INITIATIVE_GRANTS — Persistent
 * Rage, Uncanny Metabolism): whether a feature's grant is due as its owner's Initiative lands, and the card's words.
 * Pure.
 */

/**
 * Is the grant due? The feature's own use must stand, and something must come back — an expended use of the
 * regained item, or (a healing row) a missing Hit Point: a once-per-Long-Rest use is never burnt on nothing.
 * @param {{own: {value: number, max: number}|null, regain: {spent: number, max: number}|null, heals?: boolean,
 *          hp?: {value: number, max: number}|null, upTo?: number|null, count?: number|null}} facts
 * @returns {{due: boolean, why: string}}
 */
export function initiativeGrantDue({ own, regain, heals = false, hp = null, upTo = null, count = null }) {
  if ( own && (Number(own.max) > 0) && !(Number(own.value) > 0) ) return { due: false, why: "used since the last Long Rest" };
  // C1 — `upTo` (Perfect Focus): only what is missing below the ceiling comes back. `count` (Ever-Ready Shot): that many
  // expended uses come back, never more than are spent.
  const value = Math.max(0, (Number(regain?.max) || 0) - (Number(regain?.spent) || 0));
  const back = upTo ? Math.max(0, Math.min(Number(upTo) - value, Number(regain?.spent) || 0))
    : count ? Math.max(0, Math.min(Number(count), Number(regain?.spent) || 0))
      : Math.max(0, Math.min(Number(regain?.spent) || 0, Number(regain?.max) || 0));
  const hurt = heals && hp ? (Number(hp.value) || 0) < (Number(hp.max) || 0) : false;
  if ( !back && !hurt ) return { due: false, why: "nothing to regain" };
  return { due: true, why: back ? `${back} expended` : "Hit Points missing" };
}

/**
 * The card's line for a grant, by its state.
 * @param {{row: string, status?: string, answer?: string|null, applied?: boolean, timedOut?: boolean, unit?: string,
 *          regained?: number, max?: number, healed?: number|null, formula?: string|null, back?: number, actorName?: string,
 *          give?: boolean, given?: {name: string, from: number, to: number}[], rolled?: number, due?: string[], reach?: number,
 *          upTo?: number|null, fallback?: {row: string, upTo: number|null, unit?: string|null}|null, fallbackApplied?: boolean, fallbackRegained?: number,
 *          reroll?: {face: number, under: number, from: number}|null, rerolled?: {from: number, to: number}|null}} flag
 */
export function initiativeGrantLine(flag) {
  const unit = flag.unit ?? "uses";
  // C1 — the fallback row landed on the host's No (Perfect Focus under Uncanny Metabolism).
  if ( (flag.answer === "no") && flag.fallback ) {
    const kept = `${flag.row} — kept for later${flag.timedOut ? " (timer)" : ""}`;
    if ( flag.fallbackApplied ) return `${kept}; ${flag.fallback.row} — ${flag.fallback.unit ?? unit} back up to ${flag.fallback.upTo}${Number.isFinite(flag.fallbackRegained) ? ` (${flag.fallbackRegained} regained)` : ""}`;
    return `${kept}; ${flag.fallback.row} — regaining…`;
  }
  if ( flag.answer === "no" ) return `${flag.row} — kept for later${flag.timedOut ? " (timer)" : ""}`;
  // RAVENLOFT — a `reroll` row (Hypervigilance): the Initiative rolled again.
  if ( flag.reroll ) {
    if ( flag.applied ) return `${flag.row} — Initiative rerolled: ${flag.rerolled?.from ?? flag.reroll.from} → ${flag.rerolled?.to ?? "…"}`;
    if ( flag.status === "resolved" ) return `${flag.row} — rerolling…`;
    return `${flag.row} — the d20 shows ${flag.reroll.face} (${flag.reroll.under} or lower): reroll the Initiative? The new roll stands`;
  }
  if ( flag.upTo && flag.applied ) return `${flag.row} — ${unit} back up to ${flag.upTo} (${Number(flag.regained) || 0} regained)`;
  if ( flag.upTo ) return `${flag.row} — ${unit} back up to ${flag.upTo}`;
  // B4 — a `to: "allies"` row (Tandem Footwork): one roll, added to every ally's Initiative within reach.
  if ( flag.give ) {
    if ( flag.applied ) {
      const names = (flag.given ?? []).map(g => `${g.name} ${g.from} → ${g.to}`);
      return names.length ? `${flag.row} — +${flag.rolled} Initiative: ${names.join(", ")}${flag.due?.length ? ` (${flag.due.length} still to roll)` : ""}`
        : `${flag.row} — +${flag.rolled ?? 0} Initiative, nobody within reach yet${flag.due?.length ? ` (${flag.due.length} still to roll)` : ""}`;
    }
    if ( flag.status === "resolved" ) return `${flag.row} — rolling…`;
    return `${flag.row} — give ${flag.formula ?? "the die"} to allies within ${flag.reach ?? 30} ft? · a use of ${unit}`;
  }
  if ( flag.applied ) {
    const parts = [`${unit} regained (${Number(flag.max) || 0} of ${Number(flag.max) || 0})`];
    if ( Number.isFinite(flag.healed) ) parts.push(`${flag.healed} Hit Point${flag.healed === 1 ? "" : "s"} regained`);
    return `${flag.row} — ${parts.join(", ")}`;
  }
  if ( flag.status === "resolved" ) return `${flag.row} — regaining…`;
  const heal = flag.formula ? ` and ${flag.formula} Hit Points` : "";
  return `${flag.row} — regain ${Number(flag.back) || 0} ${unit}${heal}? (once per Long Rest)`;
}

/**
 * A ceiling row's write (`upTo`, Perfect Focus): the regained item's expended count that leaves its uses at the
 * ceiling, and how many come back; null when they already stand there.
 * @param {{value: number, max: number}} regain @param {number|null|undefined} upTo
 * @returns {{spent: number, regained: number}|null}
 */
export function ceilingRegain(regain, upTo) {
  const u = Number(upTo) || 0;
  if ( !(regain.value < u) ) return null;
  return { spent: Math.max(0, regain.max - u), regained: Math.min(u, regain.max) - regain.value };
}

/**
 * A Yes's (or a plain row's) sheet writes, judged once off the sheet before any lands: the regained item's expended
 * count (null: no write), the feature's own (null: no use to spend), and what the card says came back.
 * @param {{regain: {value: number, max: number, spent: number}, own: {max: number, spent: number}, upTo?: number|null, count?: number|null}} facts
 * @returns {{regainSpent: number|null, ownSpent: number|null, regained: number, max: number}}
 */
export function grantRegain({ regain, own, upTo = null, count = null }) {
  if ( upTo ) {
    const c = ceilingRegain(regain, upTo);
    return { regainSpent: c?.spent ?? null, ownSpent: null, regained: Math.max(0, c?.regained ?? 0), max: regain.max };
  }
  const ownSpent = (own.max > 0) ? own.spent + 1 : null;
  if ( count ) {
    const back = Math.max(0, Math.min(Number(count), regain.spent));
    return { regainSpent: back ? regain.spent - back : null, ownSpent, regained: back, max: regain.max };
  }
  return { regainSpent: 0, ownSpent, regained: Math.min(regain.spent, regain.max), max: regain.max };
}
