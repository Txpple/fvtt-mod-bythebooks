// @ts-check
/**
 * By the Books — DECISION layer (ARCHITECTURE.md §2): the presentation formatters, strings in,
 * strings out. Imports nothing above it (no machine, spine, or core.js).
 * ⚠ Inline styles on purpose: a `styles` entry in module.json costs a Foundry process restart.
 * ⚠ `momentBarHTML` reads the wall clock (the tests fake it).
 */

/** The popup identity every machine shares: one decision, one key, one live view. */
export const popupKey = (messageId, uuid) => `${messageId}|${uuid}`;

/**
 * THE PALETTE — one meaning per hue (RULINGS *The gate before the roll*). Blue stays out: dnd5e
 * means healing by it.
 */
export const TONE = {
  pending: "rgba(222,120,40,0.95)",   // waiting on a human
  good:    "rgba(70,150,95,0.95)",    // good for you
  bad:     "rgba(180,70,60,0.95)",    // bad for you
  neutral: "rgba(120,120,120,0.75)",  // nothing bends
  crit:    "rgba(232,190,50,0.95)"    // a critical hit, dark text
};

/**
 * A combat line's side tag: the token's disposition (a friendly familiar is no foe), the actor type only when no
 * disposition was kept. FRIENDLY 1 · NEUTRAL 0 · HOSTILE -1 · SECRET -2 (CONST.TOKEN_DISPOSITIONS).
 * @param {{ isPC?: boolean, disposition?: number|null }} combatant
 * @returns {string}  "" for the party's side, else " (foe)" or " (neutral)"
 */
export function rosterSide({ isPC = false, disposition = null } = {}) {
  if ( (disposition === null) || !Number.isFinite(Number(disposition)) ) return isPC ? "" : " (foe)";
  const d = Number(disposition);
  if ( d === 1 ) return "";
  return (d === 0) ? " (neutral)" : " (foe)";
}

/** The tone a roll mode wears: Advantage good, Disadvantage bad, Normal and Listed neutral. */
export const modeTone = mode => ((mode === "advantage") || (mode === "succeeds")) ? TONE.good
  : ((mode === "disadvantage") || (mode === "fails")) ? TONE.bad : TONE.neutral;

/**
 * THE MODE TAG. Listed is Normal's outline (colour is spent on bends alone); `fails` /
 * `succeeds` are a save the rules decide before the dice.
 * @param {"advantage"|"disadvantage"|"normal"|"listed"|"fails"|"succeeds"} mode
 */
export function modeTagHTML(mode) {
  const listed = (mode === "listed");
  const tone = listed ? TONE.neutral : modeTone(mode);
  const text = listed ? "Listed" : (mode === "advantage") ? "Advantage" : (mode === "disadvantage") ? "Disadvantage"
    : (mode === "fails") ? "Fails" : (mode === "succeeds") ? "Succeeds" : "Normal";
  const fill = listed
    ? `background:transparent;border:1px solid ${tone};color:inherit;opacity:0.85;`
    : `background:${tone};border:1px solid transparent;color:${((mode === "disadvantage") || (mode === "fails")) ? "#fff" : "#111"};`;
  return `<span data-bf-mode="${mode}" style="display:inline-block;font-size:var(--font-size-10,10px);letter-spacing:0.08em;
    text-transform:uppercase;font-weight:bold;padding:0.15rem 0.5rem;border-radius:3px;white-space:nowrap;
    line-height:1.3;vertical-align:middle;${fill}">${text}</span>`;
}

/**
 * The house card. `lines` are already-safe HTML (a falsy line is dropped); eyebrow, title and
 * subtitle are TEXT and escaped here (they carry names a player can set).
 * @param {{img?: string|null, eyebrow?: string|null, title?: string|null, subtitle?: string|null,
 *   lines?: (string|null|undefined|false)[], tone?: string}} card
 */
export function bfCard({ img, eyebrow, title, subtitle, lines = [], tone = "neutral" }) {
  const accent = TONE[tone] ?? TONE.neutral;
  const tip = esc(String(eyebrow || title || "").replace(/<[^>]*>/g, ""));
  const portrait = img
    ? `<img src="${esc(img)}" alt="${tip}" data-tooltip="${tip}"
         style="width:40px;height:40px;flex:0 0 auto;border-radius:4px;
         border:1px solid var(--color-border-dark,#0006);object-fit:cover;">`
    : "";
  const body = lines.filter(Boolean).map(line =>
    `<div style="margin-top:0.2rem;">${line}</div>`).join("");
  return `
  <div style="border-left:3px solid ${accent};border-radius:3px;padding:0.4rem 0.55rem;
              background:rgba(0,0,0,0.04);">
    <div style="display:flex;gap:0.5rem;align-items:center;">
      ${portrait}
      <div style="flex:1;min-width:0;">
        ${eyebrow ? `<div style="font-size:var(--font-size-10,10px);letter-spacing:0.08em;
             text-transform:uppercase;opacity:0.6;line-height:1.4;">${esc(eyebrow)}</div>` : ""}
        <div style="font-family:var(--font-h1,inherit);font-size:var(--font-size-15,15px);
             font-weight:bold;line-height:1.2;">${esc(title)}</div>
        ${subtitle ? `<div style="font-size:var(--font-size-11,11px);opacity:0.7;
             line-height:1.3;">${esc(subtitle)}</div>` : ""}
      </div>
    </div>
    ${body ? `<div style="margin-top:0.35rem;font-size:var(--font-size-12,12px);
         line-height:1.5;">${body}</div>` : ""}
  </div>`;
}

/**
 * The book's text at a pointer, drawn OPEN: only inside the rule tick. A pointer (`{ item, uuid?, benefit? }` or `{ page, key, benefit? }`) is markup
 * rule-text.js fills from the book; a string (a text read before pointers) is quoted, its first paragraph only and
 * scrubbed of the sheet's unfilled references (`@scale.bard.inspiration.die`).
 * @param {object|string|null|undefined} rule
 */
function ruleQuote(rule) {
  if ( rule && (typeof rule === "object") ) {
    return `<div data-bf-rule="${refAttr(rule)}" style="font-style:italic;"></div>`;
  }
  return rule ? `<em>“${scrubRule(rule)}”</em>` : "";
}

/**
 * A rule text cut to what a reader needs: its first paragraph of rule (a prerequisite line, a "Repeatable." note
 * and a Foundry note are not the rule), with the sheet's unfilled references gone ("(currently, @scale…)").
 * @param {string} text
 * @returns {string}
 */
export function scrubRule(text) {
  const paragraphs = String(text ?? "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const first = paragraphs.find(p => !/^(prerequisites?|repeatable|foundry note)\b/i.test(p)) ?? paragraphs[0] ?? "";
  return first.replace(/\s*\((?:currently,?\s*)?@[\w.]+\)/gi, "").replace(/@[\w.]+/g, "").replace(/\s{2,}/g, " ").trim();
}

/** The rule tick's own line: closed, one small word and an arrow. */
const TICK = '<summary style="cursor:pointer;list-style:none;opacity:0.75;font-size:var(--font-size-11,11px);">the rule ▸</summary>';

/**
 * THE RULE TICK (DESIGN *Cards*): a rule on a card or a popup is the book's text under a CLOSED fold, never
 * text drawn open — one line of what happened above it, nothing of the book's outside it. A fold whose
 * pointer reads as no text goes. `tools/check-rule-folds.mjs` keeps every rule here.
 * @param {object|string|null|undefined} rule
 */
export function ruleLine(rule) {
  if ( !rule ) return "";
  return `<details data-bf-rule-fold style="margin-top:0.25rem;font-size:var(--font-size-12,12px);line-height:1.45;opacity:0.85;">${TICK}${ruleQuote(rule)}</details>`;
}

/** A pointer as an attribute value. @param {object} rule */
const refAttr = rule => JSON.stringify(rule).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * The one wording for a spent die, so the popup, the card and the floating text agree.
 * @param {{pool: string, left: number, max: number}} row
 */
export const spendLine = row => `${row.pool}: ${row.left} of ${row.max} remaining`;
/** "one Superiority Die spent · Combat Superiority: 3 of 4 remaining" — or the bare spend when no row is known. */
export const spendPhrase = (rows, die = "Superiority Die") => rows?.length
  ? `one ${die} spent · ${rows.map(spendLine).join(" · ")}` : `one ${die} spent`;

/** The situational-bonus row of a popup standing in for a roll dialog; `name` names the input. */
export function situationalBonusHTML(name) {
  return `
    <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;">
      <label style="flex:1;font-size:var(--font-size-12,12px);">Situational Bonus</label>
      <input type="text" name="${attr(name)}" placeholder="e.g. 1d4" autocomplete="off"
             style="flex:1;min-width:0;text-align:center;">
    </div>`;
}

/**
 * THE GATE'S SECTION: the header line, then a box per source with its bend and quoted rule
 * (RULINGS *The gate before the roll*).
 * @param {{head: {title: string, net: "advantage"|"disadvantage"|"normal", why?: string},
 *          boxes: {label: string, bend: "advantage"|"disadvantage"|null, rule?: object|string|null}[]}} view
 */
export function reminderSectionHTML({ head, boxes }) {
  const rows = boxes.map(b => `
      <div style="display:grid;grid-template-columns:1fr auto;gap:0.2rem 0.6rem;align-items:center;
                  margin:0.4rem 0;padding:0.45rem 0.6rem;border-radius:4px;
                  background:rgba(0,0,0,0.25);border:1px solid var(--color-border-dark,rgba(0,0,0,0.4));
                  border-left:3px solid ${modeTone(b.bend ?? "listed")};">
        <div style="font-weight:bold;">${esc(b.label)}</div>
        ${modeTagHTML(b.bend ?? "listed")}
        ${b.rule ? `<div style="grid-column:1 / -1;font-size:var(--font-size-12,12px);line-height:1.45;opacity:0.85;">${ruleLine(b.rule)}</div>` : ""}
      </div>`).join("");
  return `
    <div data-bf-reminder-head style="display:flex;align-items:center;gap:0.45rem;margin:0.2rem 0 0.1rem;">
      <span>${attr(head.title)}</span> ${modeTagHTML(head.net)}
    </div>${rows}`;
}

/**
 * The section folded to its header line (a native `<details>`).
 * @param {{head: {title: string, net: "advantage"|"disadvantage"|"normal", why?: string},
 *          boxes: {label: string, bend: "advantage"|"disadvantage"|null, rule?: object|string|null}[]}} view
 * @param {{open?: boolean}} [opts]
 */
export function reminderDetailsHTML({ head, boxes }, { open = false } = {}) {
  const section = reminderSectionHTML({ head, boxes });
  // The head is the summary: lift it out of the section and wrap what remains.
  const headEnd = section.indexOf("</div>") + "</div>".length;
  const headHTML = section.slice(0, headEnd).replace("data-bf-reminder-head", "data-bf-reminder-head data-bf-summary");
  return `<details data-bf-reminder-details ${open ? "open" : ""}>
    <summary style="cursor:pointer;list-style:none;">${headHTML}</summary>${section.slice(headEnd)}
  </details>`;
}

/**
 * The section inside dnd5e's roll dialog, shaped like its CONFIGURATION fieldset so the dialog's
 * styling dresses it.
 * @param {{head: {title: string, net: "advantage"|"disadvantage"|"normal", why?: string},
 *          boxes: {label: string, bend: "advantage"|"disadvantage"|null, rule?: object|string|null}[], legend?: string}} view
 */
export function reminderFieldsetHTML({ head, boxes, legend = "Before you roll" }, { open = false } = {}) {
  return `
  <fieldset data-bf-reminder>
    <legend>${attr(legend)}</legend>${reminderDetailsHTML({ head, boxes }, { open })}
  </fieldset>`;
}

/**
 * THE SNEAK ATTACK BOX: a checkbox, never a fourth button (the roll still needs its mode press).
 * Used this turn: greyed, the reason on its own line, no tick.
 * @param {{dice: string, rule: object|string|null, checked?: boolean, used?: string|null}} view
 */
export function sneakBoxHTML({ dice, rule, checked = false, used = null }) {
  const control = used ? "" : `<label style="display:flex;align-items:center;gap:0.4rem;white-space:nowrap;cursor:pointer;">
        ${pickInputHTML({ name: "bf-sneak", checked, style: "margin:0;" })} <span>Sneak Attack</span></label>`;
  return `
      <div data-bf-sneak style="display:grid;grid-template-columns:1fr auto;gap:0.2rem 0.6rem;align-items:center;
                  margin:0.4rem 0;padding:0.45rem 0.6rem;border-radius:4px;${used ? "opacity:0.6;" : ""}
                  background:rgba(0,0,0,0.25);border:1px solid var(--color-border-dark,rgba(0,0,0,0.4));
                  border-left:3px solid ${used ? TONE.neutral : TONE.pending};">
        <div style="font-weight:bold;">Sneak Attack — ${attr(dice)}</div>
        ${control}
        ${used ? `<div style="grid-column:1 / -1;font-size:var(--font-size-11,11px);line-height:1.45;opacity:0.85;">${attr(used)}</div>` : ""}
        ${foldedRuleHTML(rule)}
      </div>`;
}

/**
 * THE BUY BOX: the Sneak Attack box's shape for Advantage bought with an item's use
 * (`ADVANTAGE_BUYS`). No uses left, or `off` (why it cannot be ticked): greyed, no tick.
 * @param {{name: string, point: string|null, left: number|null, rule: object|string|null, checked?: boolean, free?: boolean, says?: string, off?: string|null}} view
 */
export function buyBoxHTML({ name, point, left, rule, checked = false, free = false, says = "", off = null }) {
  // C1 — a FREE box (Versatile Trickster): no counter, nothing spent; `says` names the judgement that is the table's.
  // `off` is why the box cannot be ticked (decide/reminders.js `buyOff`): an empty pool, or a companion out of reach.
  const out = !!off || (!free && !(Number(left) > 0));
  const why = off ?? `no ${point}s left`;
  const control = out ? "" : `<label style="display:flex;align-items:center;gap:0.4rem;white-space:nowrap;cursor:pointer;">
        ${pickInputHTML({ name: "bf-buy", data: { "bf-buy-name": name, ...(free ? { "bf-free": "" } : {}) }, checked, style: "margin:0;" })} <span>Advantage</span></label>`;
  return `
      <div data-bf-buy style="display:grid;grid-template-columns:1fr auto;gap:0.2rem 0.6rem;align-items:center;
                  margin:0.4rem 0;padding:0.45rem 0.6rem;border-radius:4px;${out ? "opacity:0.6;" : ""}
                  background:rgba(0,0,0,0.25);border:1px solid var(--color-border-dark,rgba(0,0,0,0.4));
                  border-left:3px solid ${out ? TONE.neutral : TONE.pending};">
        <div style="font-weight:bold;">${attr(name)} — ${free ? `free${says ? ` · ${attr(says)}` : ""}` : `1 ${attr(point)} · ${Math.max(0, Number(left) || 0)} left`}</div>
        ${control}
        ${out ? `<div style="grid-column:1 / -1;font-size:var(--font-size-11,11px);line-height:1.45;opacity:0.85;">${attr(why)}</div>` : ""}
        ${foldedRuleHTML(rule)}
      </div>`;
}

/**
 * THE FORGO BOX (B3, Brutal Strike): the buy box's shape for Advantage GIVEN UP before the roll — ticked, the net reads Normal
 * and the hit offers the feature's group. `off` names why it cannot be ticked (no Advantage, Disadvantage, another ability).
 */
export function forgoBoxHTML({ name, rule, checked = false, off = null, says = "", struck = [] }) {
  const control = off ? "" : `<label style="display:flex;align-items:center;gap:0.4rem;white-space:nowrap;cursor:pointer;">
        ${pickInputHTML({ name: "bf-buy", data: { "bf-buy-name": name, "bf-forgo": "" }, checked, style: "margin:0;" })} <span>Forgo the Advantage</span></label>`;
  return `
      <div data-bf-buy data-bf-forgo-box style="display:grid;grid-template-columns:1fr auto;gap:0.2rem 0.6rem;align-items:center;
                  margin:0.4rem 0;padding:0.45rem 0.6rem;border-radius:4px;${off ? "opacity:0.6;" : ""}
                  background:rgba(0,0,0,0.25);border:1px solid var(--color-border-dark,rgba(0,0,0,0.4));
                  border-left:3px solid ${off ? TONE.neutral : TONE.pending};">
        <div style="font-weight:bold;">${attr(name)} — forgo the Advantage${says ? ` (${attr(says)})` : ""}</div>
        ${control}
        ${off ? `<div style="grid-column:1 / -1;font-size:var(--font-size-11,11px);line-height:1.45;opacity:0.85;">${attr(off)}</div>` : ""}
        ${(checked && struck.length) ? `<div style="grid-column:1 / -1;font-size:var(--font-size-11,11px);line-height:1.45;">${struck.map(attr).join(" · ")}</div>` : ""}
        ${foldedRuleHTML(rule)}
      </div>`;
}

/** A rule under a closed fold; a fold whose pointer reads as no text goes. @param {object|string|null|undefined} rule */
export function foldedRuleHTML(rule) {
  if ( !rule ) return "";
  return `<details data-bf-rule-fold style="grid-column:1 / -1;font-size:var(--font-size-12,12px);line-height:1.45;opacity:0.85;">${TICK}${ruleQuote(rule)}</details>`;
}

/**
 * THE CUNNING STRIKE MENU on the damage offer; unaffordable rows show disabled.
 * @param {{rows: {key: string, label: string, cost: number, rule: object|string|null, caveat?: string, line: boolean, affordable: boolean}[],
 *          max: number, dc: number|null, dice: string, chosen?: Iterable<string>}} view
 */
export function cunningMenuHTML({ rows, max, dc, dice, chosen = [] }) {
  if ( !rows.length ) return "";
  const picked = new Set(chosen);
  const items = rows.map(r => `
      <label data-bf-cunning-row="${attr(r.key)}" style="display:grid;grid-template-columns:auto 1fr auto;gap:0.2rem 0.5rem;align-items:center;
             margin:0.3rem 0;padding:0.35rem 0.5rem;border-radius:4px;background:rgba(0,0,0,0.06);
             border:1px solid var(--color-border-light,rgba(0,0,0,0.2));${r.affordable ? "cursor:pointer;" : "opacity:0.5;"}">
        ${pickInputHTML({ name: "bf-cunning", value: r.key, checked: picked.has(r.key), disabled: !r.affordable, style: "margin:0;" })}
        <span style="font-weight:bold;">${attr(r.label)}</span>
        <span style="font-size:var(--font-size-10,10px);letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;opacity:0.85;">${r.cost ? `${r.cost}d forgone` : "no cost"}</span>
        ${foldedRuleHTML(r.rule).replace("grid-column:1 / -1", "grid-column:2 / -1")}
      </label>`).join("");
  return `
    <div data-bf-cunning style="margin-top:0.5rem;">
      <div style="display:flex;align-items:baseline;gap:0.6rem;">
        <span style="font-weight:bold;font-size:var(--font-size-12,12px);">Cunning Strike</span>
        <span style="font-size:var(--font-size-10,10px);letter-spacing:0.06em;text-transform:uppercase;opacity:0.85;">${[attr(dice), dc ? `DC ${dc}` : null, (max > 1) ? `up to ${max}` : null].filter(Boolean).join(" · ")}</span>
      </div>
      ${items}
    </div>`;
}

/**
 * THE CLOCK RIDERS on the damage offer, TICKED by default (RULINGS *The gate before the roll*) — but an
 * `unticked` row (a scarce die spent only by choice: Combat Inspiration's Inspired die).
 * ⚠ `caveat` is accepted and IGNORED: no caveat line on the row. An effect-only rider shows `says`.
 * @param {{key: string, label: string, formula: string|null, says?: string|null, type: string|null, why: string, rule: object|string|null,
 *          usesLeft?: number|null, caveat?: string, unticked?: boolean}[]} riders
 */
export function riderMenuHTML(riders) {
  const rows = (riders ?? []).filter(r => r.formula || r.says);
  if ( !rows.length ) return "";
  const items = rows.map(r => `
      <label data-bf-rider-row="${attr(r.key)}" style="display:grid;grid-template-columns:auto 1fr auto;gap:0.2rem 0.5rem;align-items:center;
             margin:0.3rem 0;padding:0.35rem 0.5rem;border-radius:4px;background:rgba(0,0,0,0.06);
             border:1px solid var(--color-border-light,rgba(0,0,0,0.2));cursor:pointer;">
        ${pickInputHTML({ name: "bf-rider", value: r.key, checked: !r.unticked, style: "margin:0;" })}
        <span style="font-weight:bold;">${attr(r.label)} — ${r.formula ? `${attr(r.formula)}${r.type ? ` ${attr(r.type)}` : ""}` : attr(r.says)}</span>
        <span style="font-size:var(--font-size-10,10px);letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;opacity:0.85;">${(r.usesLeft === null) || (r.usesLeft === undefined) ? "" : `${Math.max(0, r.usesLeft - 1)} use${(r.usesLeft - 1) === 1 ? "" : "s"} left after`}</span>
        ${foldedRuleHTML(r.rule).replace("grid-column:1 / -1", "grid-column:2 / -1")}
      </label>`).join("");
  return `
    <div data-bf-riders style="margin-top:0.5rem;">
      <div style="font-weight:bold;font-size:var(--font-size-12,12px);">Riding this hit</div>
      ${items}
    </div>`;
}


/**
 * THE OPTION ASK on the damage offer: a feature whose option the sheet never records (Hunter's Prey) asks
 * once which the character took; the pick is kept on the feature. Nothing is picked until a radio is.
 * @param {{featureId: string, feature: string, options: {value: string, note: string}[]}[]} asks
 */
export function optionAskHTML(asks) {
  if ( !asks?.length ) return "";
  return asks.map(a => `
    <div data-bf-option-ask="${attr(a.featureId)}" style="margin-top:0.5rem;">
      <div style="font-weight:bold;font-size:var(--font-size-12,12px);">${attr(a.feature)} — which option did you take?</div>
      <div style="font-size:var(--font-size-11,11px);opacity:0.8;">Asked once and kept on the feature; the card's <em>Change</em> asks again (after a rest).</div>
      ${a.options.map(o => `
      <label style="display:flex;gap:0.5rem;align-items:center;margin:0.3rem 0;padding:0.35rem 0.5rem;border-radius:4px;background:rgba(0,0,0,0.06);
             border:1px solid var(--color-border-light,rgba(0,0,0,0.2));cursor:pointer;">
        ${pickInputHTML({ kind: "radio", name: `bf-option-${a.featureId}`, value: o.value, style: "margin:0;" })}
        <span style="font-weight:bold;">${attr(o.value)}</span>
        <span style="font-size:var(--font-size-11,11px);opacity:0.8;">${attr(o.note)}</span>
      </label>`).join("")}
    </div>`).join("");
}


/**
 * THE HIT MENU on the damage offer (RULINGS *The hit menu*): a group per paying feature, one
 * pick per group (the EDGE unticks the sibling); a spent group greys, its tag saying why.
 * @param {{groups: {key: string, label: string, tag: string, off: boolean,
 *          rows: {key: string, label: string, cost: string, caveat?: string|null, rule: object|string|null, affordable: boolean}[]}[]}} view
 */
export function hitMenuHTML({ groups }) {
  if ( !groups?.length ) return "";
  const blocks = groups.map(g => {
    const items = g.rows.map(r => `
      <label data-bf-hit-row="${attr(r.key)}" style="display:grid;grid-template-columns:auto 1fr auto;gap:0.2rem 0.5rem;align-items:center;
             margin:0.3rem 0;padding:0.35rem 0.5rem;border-radius:4px;background:rgba(0,0,0,0.06);
             border:1px solid var(--color-border-light,rgba(0,0,0,0.2));${r.affordable ? "cursor:pointer;" : "opacity:0.5;"}">
        ${pickInputHTML({ name: "bf-hit", value: r.key, data: { "bf-hit-group": g.key }, disabled: !r.affordable, style: "margin:0;" })}
        <span style="font-weight:bold;">${attr(r.label)}</span>
        <span style="font-size:var(--font-size-10,10px);letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;opacity:0.85;">${attr(r.cost)}</span>
        ${foldedRuleHTML(r.rule).replace("grid-column:1 / -1", "grid-column:2 / -1")}
      </label>`).join("");
    return `
    <div data-bf-hit-group="${attr(g.key)}" style="margin-top:0.5rem;">
      <div style="display:flex;align-items:baseline;gap:0.6rem;">
        <span style="font-weight:bold;font-size:var(--font-size-12,12px);">${attr(g.label)}</span>
        <span style="font-size:var(--font-size-10,10px);letter-spacing:0.06em;text-transform:uppercase;opacity:0.85;${g.off ? "color:var(--color-level-error,#b44);" : ""}">${attr(g.tag)}</span>
      </div>
      ${items}
    </div>`;
  }).join("");
  return `
    <div data-bf-hit>
      ${blocks}
    </div>`;
}

/**
 * The three roll-mode buttons as DialogV2 descriptors; `defaultMode` is the Enter target.
 * ⚠ With none flagged, DialogV2 makes the FIRST button (Advantage) the Enter target.
 * @param {(mode: "advantage"|"normal"|"disadvantage") => void} press
 * @param {"advantage"|"normal"|"disadvantage"|null} [defaultMode]
 */
export function modeButtons(press, defaultMode = null) {
  return [
    { action: "advantage", label: "Advantage", default: defaultMode === "advantage",
      callback: () => press("advantage") },
    { action: "normal", label: "Normal", default: defaultMode === "normal",
      callback: () => press("normal") },
    { action: "disadvantage", label: "Disadvantage", default: defaultMode === "disadvantage",
      callback: () => press("disadvantage") }
  ];
}

/**
 * THE COUNTDOWN BAR, a pure function of `{deadline, window}` (ARCHITECTURE.md §5). ⚠ No JS
 * ticking: `syncHoldBars` (ui.js) resumes one CSS animation by a negative animation-delay.
 */
export function momentBarHTML(spec, label = "to answer") {
  if ( !spec?.deadline || !spec?.window ) return "";
  if ( (spec.deadline - Date.now()) <= 0 ) return "";
  return `
  <div style="margin-top:0.45rem;display:flex;align-items:center;gap:0.4rem;">
    <div style="flex:1;height:6px;border-radius:3px;background:rgba(0,0,0,0.18);overflow:hidden;">
      <div data-bf-deadline="${spec.deadline}" data-bf-window="${spec.window}"
           style="height:100%;width:100%;border-radius:3px;
                  background:${TONE.good};"></div>
    </div>
    <span style="font-size:var(--font-size-10,10px);opacity:0.6;white-space:nowrap;">
      ${spec.window}s ${esc(label)}</span>
  </div>`;
}

/**
 * The bar for a WHOLE flag, none once resolved. ⚠ A sub-object has no `status`: pass it to
 * momentBarHTML, or the bar silently vanishes.
 */
export function holdBarHTML(hold, label = "to answer") {
  if ( hold?.status !== "pending" ) return "";
  return momentBarHTML(hold, label);
}

// THE STAIRCASE (ARCHITECTURE.md §5 law 7): the arithmetic only; ui.js owns the anchor.
export const CASCADE_STEP = 36;   // ≈ one window header — the full title stays visible

/** The smallest free slot. ⚠ Not a live-popup count: that lands a newcomer on a survivor. */
export function nextCascadeSlot(usedSlots) {
  const used = new Set(usedSlots);
  let slot = 0;
  while ( used.has(slot) ) slot += 1;
  return slot;
}

/** Where slot `n` sits, relative to the pile's anchor; modulo keeps a huge pile on screen. */
export function cascadePosition(anchor, slot) {
  const step = (slot % 8) * CASCADE_STEP;
  return { left: anchor.left + step, top: anchor.top + step };
}

/**
 * THE RANK (ARCHITECTURE §5 law 7): windows of one hit front by class (the key's sub), then
 * event order: 0 the damage prompt, 1 the weapon's mastery, 2 a listed carrier's offer, 3 the rest.
 * ⚠ A new sub ranks last unless it is added here — the table is the ruling.
 */
export const POPUP_RANK = Object.freeze({
  damage: 0,
  mastery: 1, notice: 1, topple: 1,
  bashoffer: 2, hew: 2, command: 2, riposte: 2
});
const UNRANKED = 3;

/** A popup key's rank — the sub before its first `:`; unlisted keys rank last. */
export function popupRank(key) {
  const sub = String(key ?? "").split("|")[1] ?? "";
  const family = sub.split(":")[0] ?? "";
  return POPUP_RANK[family] ?? UNRANKED;
}

/** The whole pile BACK TO FRONT (the newcomer included: it may outrank an elder). */
export function pileBackToFront(slots) {
  return [...slots.entries()]
    .sort(([ka, a], [kb, b]) => (popupRank(kb) - popupRank(ka)) || (b - a))
    .map(([k]) => k);
}

/* THE RESCUE VIEW: two flags on one roll (`precision`, `d20fold`) ask one question, so the view
 * merges and the flags stay separate. A new own-roll rescue is a RESCUE_SOURCES entry. */

/**
 * THE RESCUE KINDS. ⚠ The one copy of each quote; d20-folds.js and maneuvers.js read them here.
 * ⚠ `label` is not the lookup key (D20_FOLDS finds `bardic` by the effect "Inspired").
 */
export const RESCUE_KINDS = {
  heroic: {
    label: "Heroic Inspiration",
    icon: "fa-solid fa-wand-sparkles",
    cost: "spent either way, and the new roll stands",
    rule: Object.freeze({ page: "rule", key: "inspiration" })
  },
  tactical: {
    label: "Tactical Mind",
    icon: "fa-solid fa-brain",
    cost: "not expended if the check still fails",
    rule: Object.freeze({ item: "Tactical Mind", uuid: "Compendium.dnd-players-handbook.classes.Item.phbftrTacticalMi" })
  },
  bardic: {
    label: "Bardic Inspiration",
    icon: "fa-solid fa-music",
    cost: "expended when rolled, whether or not it helps",
    rule: Object.freeze({ item: "Bardic Inspiration", uuid: "Compendium.dnd-players-handbook.classes.Item.phbbrdBardicInsp" })
  },
  seeking: {
    label: "Seeking Spell",
    icon: "fa-solid fa-compass",
    cost: "1 Sorcery Point, spent either way, and the new roll stands",
    rule: Object.freeze({ item: "Seeking Spell", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmmoSeekingSpe" })
  },
  // Advantage bought on an initiative rolled with no dialog; the offer carries its row's name and rule.
  advantage: {
    icon: "fa-solid fa-clover",
    cost: "the use is spent either way, and the higher d20 stands"
  },
  // A save turned to a success (SAVE_SUCCEEDS); the offer carries its row's name and rule. No die.
  succeed: {
    icon: "fa-solid fa-shield-halved",
    cost: "one use, back after a Short or Long Rest"
  },
  // A failed save rerolled with a bonus (REROLLS); the offer carries its row's name, rule, bonus and cost.
  reroll: {
    icon: "fa-solid fa-rotate-right",
    cost: "spent either way, and the new roll stands"
  },
  precision: {
    label: "Precision Attack",
    icon: "fa-solid fa-crosshairs",
    cost: "the superiority die is spent either way it lands",
    rule: Object.freeze({ item: "Precision Attack", uuid: "Compendium.dnd-players-handbook.classes.Item.phbmnvPrecisionA" })
  }
};

/** An offer's or spend's name on screen. ⚠ Wire format: an older flag may carry no `label`. */
export const rescueLabel = named =>
  named?.label ?? RESCUE_KINDS[named?.kind]?.label ?? named?.name ?? "a fold";

/**
 * One entry per message flag: premise, pending, rows. `action` is the machine's own answer
 * token, so one window drives two machines that never know each other.
 */
export const RESCUE_SOURCES = [
  {
    flag: "d20fold",
    premise: flag => ({
      testKind: flag?.testKind,
      baseTotal: flag?.baseTotal,
      targets: flag?.targets ?? [],
      dc: flag?.dc
    }),
    isPending: flag => (flag?.status === "pending"),
    rows: flag => [
      // ⚠ Offers only while pending: a resolved flag keeps its `offers`.
      // ⚠ Two `tactical` rows can stand at once, so the action carries the name.
      ...((flag?.status === "pending") ? (flag?.offers ?? []) : []).map(o => ({
        kind: o.kind,
        action: (o.kind === "tactical") ? `tactical:${o.name}` : o.kind,
        label: rescueLabel(o),
        die: o.dieFormula ?? null,
        spent: false,
        ...(o.cost ? { cost: o.cost } : {}),
        ...(o.rule ? { rule: o.rule } : {}),
        ...(Number.isFinite(o.bonus) ? { bonus: o.bonus, advantage: o.advantage === true } : {})
      })),
      // A reroll REPLACES the roll and carries its number under `reroll`.
      ...(flag?.spends ?? []).map(s => ({
        kind: s.kind,
        action: (s.kind === "tactical") ? `tactical:${s.name}` : s.kind,
        label: rescueLabel(s),
        die: null,
        spent: true,
        result: Number.isFinite(s.reroll?.total) ? s.reroll.total
          : (Number.isFinite(s.die) ? s.die : null),
        replaced: Number.isFinite(s.reroll?.total)
      }))
    ]
  },
  {
    flag: "precision",
    premise: flag => ({
      testKind: "attack",
      baseTotal: flag?.attackTotal,
      targets: flag?.targets ?? [],
      dc: undefined
    }),
    isPending: flag => (flag?.status === "pending"),
    // The flag is its own spend record; passed or expired, no row.
    rows: flag => {
      if ( !flag ) return [];
      const spent = (flag.outcome === "used") && Number.isFinite(flag.die);
      if ( !spent && (flag.status !== "pending") ) return [];
      return [{
        kind: "precision",
        action: "use",
        label: flag.itemName ?? RESCUE_KINDS.precision.label,
        img: flag.itemImg ?? null,
        die: spent ? null : (flag.dieFormula ?? null),
        spent,
        result: spent ? flag.die : null,
        replaced: false
      }];
    }
  }
];

/** ONE flag's declared source. ⚠ An unknown key warns: an empty view silently never opens. */
export function rescueSourceFor(flagKey) {
  const sources = RESCUE_SOURCES.filter(s => s.flag === flagKey);
  if ( !sources.length ) {
    // biome-ignore lint/suspicious/noConsole: decide/ imports nothing, so core.js's log is out of reach; the line opens with the title by hand
    console.warn(`By the Books | No rescue source is declared for "${flagKey}" — its rows will `
      + "never render. Add it to RESCUE_SOURCES or fix the key.");
  }
  return sources;
}

/**
 * THE HEADER, one function for both machines so the view dedupes by string. ⚠ `reveal` gates
 * the margin, never the total. ⚠ dnd5e records no DC for a raw ability check: no verdict.
 */
export function rescueHeaderLines(premise, composed, { reveal = false } = {}) {
  const base = Number(premise?.baseTotal) || 0;
  const total = Number.isFinite(composed?.total) ? composed.total : base;
  const added = Number(composed?.added) || 0;
  const sum = composed?.replaced ? (added ? `${base} → ${total - added} + ${added} = ${total}` : `${base} → ${total}`)
    : added ? `${base} + ${added} = ${total}` : `${total}`;
  // A raw check goes to the DM outside the reveal gate: there is no number to hide.
  if ( premise?.testKind === "initiative" ) return [`Initiative: ${sum}`];
  const testable = (premise?.targets ?? []).some(t => Number.isFinite(t?.ac))
    || Number.isFinite(premise?.dc);
  if ( !testable ) return [`${sum} — ask your DM whether that lands.`];
  if ( !reveal ) return [sum];
  const lines = [];
  for ( const t of premise?.targets ?? [] ) {
    if ( !Number.isFinite(t?.ac) ) continue;          // a null AC is left to humans (DESIGN R1)
    const short = t.ac - total;
    lines.push(`${sum} vs AC ${t.ac} — `
      + ((short > 0) ? `misses ${t.name} by ${short}` : `hits ${t.name}`));
  }
  if ( Number.isFinite(premise?.dc) ) {
    const short = premise.dc - total;
    lines.push(`${sum} vs DC ${premise.dc} — `
      + ((short > 0) ? `short by ${short}` : "makes it"));
  }
  return lines.length ? lines : [sum];
}

/**
 * THE WHOLE VIEW of one message; `read(flagKey)` is the EDGE's reader.
 * @param {(key: string) => any} read
 * @param {object} [ctx]
 * @param {?{total?: number, added?: number, replaced?: boolean}} [ctx.composed] the composed roll
 * @param {boolean} [ctx.reveal]  `holdReveal` — gates the margin, never the arithmetic
 * @param {object[]} [ctx.sources]
 * @returns {{headerLines: string[], rows: object[], quotes: object[], earliestDeadline: ?number,
 *   clockWindow: ?number, stillFailing: boolean, verdictKnown: boolean}}
 */
export function rescueView(read, { composed = null, reveal = false,
  sources = RESCUE_SOURCES } = {}) {
  const headerLines = [];
  const premises = [];
  const rows = [];
  let earliestDeadline = null;
  let clockWindow = null;
  for ( const source of sources ) {
    const flag = read(source.flag);
    if ( !flag ) continue;
    premises.push(source.premise(flag));
    for ( const line of rescueHeaderLines(premises.at(-1), composed, { reveal }) ) {
      if ( !headerLines.includes(line) ) headerLines.push(line);
    }
    for ( const row of source.rows(flag) ) {
      rows.push({
        ...row,
        flag: source.flag,
        key: `${source.flag}:${(row.kind === "tactical") ? row.action : row.kind}`,   // one key per ROW where a kind can stand twice
        icon: RESCUE_KINDS[row.kind]?.icon ?? "fa-solid fa-dice-d20",
        img: row.img ?? null,
        cost: row.cost ?? RESCUE_KINDS[row.kind]?.cost ?? null,
        rule: row.rule ?? RESCUE_KINDS[row.kind]?.rule ?? null,
        result: row.result ?? null,
        replaced: row.replaced === true,
        // A sibling spend made this row moot: it greys, not vanishes. No source produces it yet.
        withdrawn: row.withdrawn === true
      });
    }
    // The earliest PENDING clock wins; a resolved source may still carry a deadline.
    if ( source.isPending(flag) && Number.isFinite(flag.deadline) ) {
      if ( (earliestDeadline === null) || (flag.deadline < earliestDeadline) ) {
        earliestDeadline = flag.deadline;
        // ⚠ The window travels with its own deadline; mixing sources draws a lying drain.
        clockWindow = Number(flag.window) || null;
      }
    }
  }
  // The die and the cost live in the pane; a live button carries only the name.
  const quotes = rows
    .map(r => ({
      key: r.key,
      label: r.label,
      text: r.rule ?? RESCUE_KINDS[r.kind]?.rule ?? null,
      detail: (r.spent || r.withdrawn) ? ""
        : `${((r.kind === "heroic") || (r.kind === "seeking")) ? "Rerolls the d20"
          : (r.kind === "reroll") ? `Rerolls the d20${r.advantage ? " with Advantage" : ""}${Number(r.bonus) ? `, +${r.bonus}` : ""}`
          : (r.kind === "advantage") ? "Roll another d20 for Advantage, the higher stands"
          : (r.kind === "succeed") ? ((r.says === "turn the d20 into a 20") ? "The d20 becomes a 20 — no roll"
            : (r.says === "hit instead") ? "The miss hits instead — no roll" : "The save succeeds instead — no roll")
          : `Adds ${r.die ?? "a die"}`}`
          + (r.cost ? ` — ${r.cost}.` : ".")
    }))
    .filter(q => q.text);
  // A raw check (no DC) is always still failing; a human ends it with Pass.
  const total = Number.isFinite(composed?.total) ? Number(composed?.total) : null;
  const stillFailing = premises.some(p => {
    if ( total === null ) return true;
    const targets = (p?.targets ?? []).filter(t => Number.isFinite(t?.ac));
    if ( targets.length ) return targets.every(t => total < t.ac);
    if ( Number.isFinite(p?.dc) ) return total < p.dc;
    return true;
  });
  const verdictKnown = premises.some(p =>
    (p?.targets ?? []).some(t => Number.isFinite(t?.ac)) || Number.isFinite(p?.dc));
  return { headerLines, rows, quotes, earliestDeadline, clockWindow, stillFailing, verdictKnown };
}

// The window's markup; rows live in the CONTENT (a DialogV2 footer is equal buttons), Pass alone below.

/** Attribute-safe: these strings land inside `data-…="…"`. */
const attr = s => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Text-safe: a name or a line that lands in markup. */
export const esc = s => String(s ?? "").replace(/[&<>"]/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** A video file by its extension (an animated token: JB2A's `.webm`). */
export const isVideo = src => /\.(webm|mp4|m4v|ogv|ogg)(\?.*)?$/i.test(String(src ?? ""));

/**
 * A row's or a thumbnail's art: an `<img>`, or a muted looping `<video>` for a video file, which an
 * `<img>` cannot draw. `style` and `extra` (attributes) land on either tag as given.
 */
export const artTag = (src, style, extra = "") => isVideo(src)
  ? `<video src="${esc(src)}" autoplay muted loop playsinline ${extra} style="${style}"></video>`
  : `<img src="${esc(src)}" alt="" ${extra} style="${style}">`;

/** THE PANE: the hovered row's rule quote, the first by default. */
export function rescuePaneHTML(quotes = []) {
  if ( !quotes.length ) return "";
  // ⚠ All quotes stack in one grid cell so hovering never resizes the window; hide by
  // `visibility`, never `display` (display:none gives no height).
  const panes = quotes.map((q, i) => `
    <div data-bf-rescue-quote="${attr(q.key)}"
         style="grid-area:1 / 1;${i ? "visibility:hidden;" : ""}">
      <div><strong>${esc(q.label)}</strong>${q.detail ? `<span style="opacity:0.75;"> — ${q.detail}</span>` : ""}</div>
      ${ruleLine(q.text)}
    </div>`).join("");
  return `
  <div data-bf-rescue-pane style="display:grid;margin:0.45rem 0 0.15rem;padding:0.35rem 0.5rem;
       border-left:2px solid ${TONE.neutral};background:rgba(0,0,0,0.05);border-radius:3px;
       font-size:var(--font-size-12,12px);line-height:1.45;">${panes}
  </div>`;
}

/** THE ROWS, led by the document's art else the kind's glyph; a spent row stays, greyed and unbound. */
export function rescueRowsHTML(rows = []) {
  return rows.map(row => {
    const art = row.img
      ? `<img src="${attr(row.img)}" alt="" aria-hidden="true"
           style="width:20px;height:20px;flex:0 0 auto;border-radius:3px;object-fit:cover;">`
      : `<i class="${attr(row.icon)}" aria-hidden="true"
           style="width:20px;flex:0 0 auto;text-align:center;opacity:0.85;"></i>`;
    // ⚠ A disabled button cannot be hovered, so a finished row carries its outcome on its face.
    const outcome = row.withdrawn ? "no longer needed"
      : row.replaced ? `rerolled — ${row.result}`
        : Number.isFinite(row.result) ? `rolled ${row.result}` : "spent";
    const inert = row.spent || row.withdrawn;
    return `
    <button type="button" data-bf-rescue-row="${attr(row.key)}"
      ${inert ? "disabled" : `data-bf-rescue-action="${attr(row.action)}"
      data-bf-rescue-flag="${attr(row.flag)}"`}
      style="display:flex;gap:0.5rem;align-items:center;justify-content:center;
             width:100%;margin-top:0.35rem;">
      ${art}
      <span>${esc(row.label)}${inert ? ` — ${outcome}` : ""}</span>
    </button>`;
  }).join("");
}

/**
 * THE DIE METER (Savage Attacker's hint), in the popup's header, never on the offer row.
 * @param {{value: number, min: number, max: number, avg: number, beat: number, gain: number, low: boolean}} m
 */
export function dieMeterHTML({ value, min, max, avg, beat, gain, low }) {
  const span = Math.max(1, max - min);
  const pos = v => Math.min(100, Math.max(0, ((v - min) / span) * 100));
  const tone = low ? "rgb(222,120,40)" : "rgb(70,150,95)";
  return `<div data-bf-die-meter="${low ? "low" : "high"}" style="margin:0.9rem 0 0.2rem;">
      <div style="position:relative;height:18px;border-radius:3px;background:linear-gradient(90deg,rgba(222,120,40,0.25),rgba(0,0,0,0.12) 55%,rgba(70,150,95,0.25));">
        <div style="position:absolute;top:-3px;bottom:-3px;left:calc(${pos(avg)}% - 1px);width:2px;background:rgba(127,127,127,0.9);"></div>
        <div style="position:absolute;top:-13px;left:${pos(avg)}%;transform:translateX(-50%);font-size:var(--font-size-10,10px);letter-spacing:0.06em;text-transform:uppercase;opacity:0.7;">avg</div>
        <div style="position:absolute;top:50%;left:${Math.min(96, Math.max(4, pos(value)))}%;transform:translate(-50%,-50%);min-width:22px;height:22px;padding:0 4px;border-radius:4px;display:grid;place-items:center;font-weight:bold;border:2px solid ${tone};background:var(--color-bg,#fff);color:${tone};">${esc(value)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:var(--font-size-10,10px);opacity:0.7;margin-top:2px;"><span>${esc(min)}</span><span>${Math.round(beat * 100)}% a second roll beats it · +${Number(gain).toFixed(1)} on average</span><span>${esc(max)}</span></div>
    </div>`;
}

/**
 * THE PICK INPUT: the one radio or checkbox the module draws (tools/check-pickers.mjs), every pick row and box
 * built on it. No `value` leaves the platform's own (`on`); `data` sets `data-*` attributes (`""` a bare mark);
 * `style` is the input's own, none when empty.
 * @param {{kind?: string, name: string, value?: string|number|null, checked?: boolean, disabled?: boolean,
 *          data?: Record<string, string|number>|null, style?: string}} input
 */
export function pickInputHTML({ kind = "checkbox", name, value, checked = false, disabled = false, data = null, style = "" }) {
  const marks = Object.entries(data ?? {}).map(([k, v]) => ` data-${k}="${attr(v)}"`).join("");
  return `<input type="${kind === "radio" ? "radio" : "checkbox"}" name="${attr(name)}"${(value === undefined) ? "" : ` value="${attr(value)}"`}`
    + `${marks}${checked ? " checked" : ""}${disabled ? " disabled" : ""}${style ? ` style="${style}"` : ""}>`;
}

/**
 * THE CHOICE'S ROWS (RULINGS *The asks widened*): a bystander's own rows, then "Pass just this time", ticked, then
 * one row per mute scope (`mute-<until>`, shared.js `muteScopesFor`'s label); ui.js `choicePopup` draws them as radios.
 * @param {{key: string, name: string, dice?: string|null, tag?: string|null, off?: string|null, rule?: object|string|null}[]} rows
 * @param {{until: string, label: string}[]} [mutes]
 */
export function choiceRows(rows, mutes = []) {
  return [...rows, { key: "pass", name: "Pass just this time", dice: "", tag: "", off: null, rule: "", checked: true },
    ...mutes.map(scope => ({ key: `mute-${scope.until}`, name: scope.label, dice: "", tag: "", off: null, rule: "" }))];
}

/**
 * THE OFFER ROW, TICKED (RULINGS *Rescuing the hit*): name and dice, a fact as the tag, the rule
 * folded. ⚠ Never a caveat line. One tick at a time (the EDGE unticks the sibling); `kind: "radio"` makes
 * the browser keep it so, and a row `checked` starts ticked (the bystander popups, RULINGS *The asks widened*).
 * @param {{name: string, rows: {key: string, name: string, dice?: string|null, tag?: string|null,
 *          off?: string|null, rule?: object|string|null, checked?: boolean}[], kind?: "checkbox"|"radio"}} view
 */
export function tickRowsHTML({ name, rows, kind = "checkbox" }) {
  const items = (rows ?? []).map(r => `
      <label data-bf-tick-row="${attr(r.key)}" style="display:grid;grid-template-columns:auto 1fr auto;gap:0.2rem 0.5rem;align-items:center;
             margin:0.3rem 0;padding:0.35rem 0.5rem;border-radius:4px;background:rgba(0,0,0,0.06);
             border:1px solid var(--color-border-light,rgba(0,0,0,0.2));${r.off ? "opacity:0.5;" : "cursor:pointer;"}">
        ${pickInputHTML({ kind, name, value: r.key, disabled: !!r.off, checked: !!r.checked, style: "margin:0;" })}
        <span style="font-weight:bold;">${esc(r.name)}${r.dice ? ` <span style="font-weight:normal;opacity:0.8;">${esc(r.dice)}</span>` : ""}</span>
        <span style="font-size:var(--font-size-10,10px);letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;opacity:0.85;${r.off ? "color:var(--color-level-error,#b44);" : ""}">${esc(r.off ?? r.tag ?? "")}</span>
        ${foldedRuleHTML(r.rule ?? "").replace("grid-column:1 / -1", "grid-column:2 / -1")}
      </label>`).join("");
  return `<div data-bf-ticks="${attr(name)}" style="margin-top:0.4rem;">${items}</div>`;
}
