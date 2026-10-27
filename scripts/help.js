/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): THE HELP ACTION (RULINGS *The Help action*). The Help item's
 * use: one creature targeted (any other count refuses the use before dnd5e's dialog), a popup on the helper's
 * client asking which assist — the attack roll or the ability check, each under its own paragraph of the
 * glossary — and the one effect the answer names, landed by the elect on the creature and clocked to the start
 * of the helper's next turn: "Helped" on the enemy (chip-spend.js spends it on the next ally's attack roll),
 * "Assisted — <skill>" on the ally (the check gate spends it on that check). The use's card says it. The
 * world's own Help item is kept by the elect at `ready`; a familiar is seeded with one as it lands (summons.js).
 */
import { MODULE_ID, readFlag, drivesMomentFor, queueFlagWrite, claimLanding, statContext, resolveUuid, resolveUuidAsync, isActiveGM, log } from "./core.js";
import { ruleHTML } from "./rule-text.js";
import { lower } from "./lookup.js";
import { HELP_NAME, HELP_RULE, HELP_FACETS, helpItemData, lendable, helpRows, helpAnswer, helpEffectData, helpWords, helpRuleFor } from "./decide/help.js";
import { chipData, placeOf } from "./shared.js";
import { chipClock } from "./decide/chips.js";
import { bfCard, ruleLine } from "./decide/present.js";
import { choicePopup, pendingRow, registerResumable, waitForWrite } from "./ui.js";
import { applyEffectsWithReceipt } from "./effect-riders.js";
import { nearestFeet, tokenOf } from "./geometry.js";
import { targetsOf } from "./decide/card.js";
import { SURFACES } from "./surfaces.js";
import { listen, listenOnce } from "./dispatch.js";

const HELP_FLAG = "help";
/** The popup's pick. */
const PICK = "bf-help";

/** Is this the Help item's use? The item by name, its activity a Utility. */
const isHelpUse = activity => (lower(activity?.item?.name) === lower(HELP_NAME)) && (activity?.type === "utility");

/** The sheet's proficiencies in the lend's shape: every skill with its rank, every tool listed; CONFIG's labels. */
function sheetLends(actor) {
  const skills = Object.entries(actor?.system?.skills ?? {}).map(([key, s]) => ({ key, label: CONFIG.DND5E?.skills?.[key]?.label ?? key, value: Number(s?.value) || 0 }));
  const tools = Object.keys(actor?.system?.tools ?? {}).map(key => {
    let label = key;
    try { label = dnd5e.documents.Trait.keyLabel(key, { trait: "tool" }) || key; } catch { /* the id */ }
    return { key, label };
  });
  return { skills, tools };
}

// THE USE: one creature targeted, and not the helper — else the use is refused before dnd5e's dialog.
listen("dnd5e.preUseActivity", "help", activity => {
  try {
    if ( !isHelpUse(activity) ) return;
    const targets = [...game.user.targets];
    if ( (targets.length !== 1) || !targets[0]?.actor || (targets[0].actor.uuid === activity.actor?.uuid) ) {
      ui.notifications.error(`${HELP_NAME}: target one creature, and one creature only — then use it again.`);
      return false;
    }
  } catch(err) {
    log.error(`The Help action could not read its target — help by hand.`, err);
  }
});

// THE STAMP: the use's card carries the question — who is helped, how far, what the helper can lend.
listen("dnd5e.postUseActivity", "help", (activity, _usageConfig, results) => {
  try {
    if ( !isHelpUse(activity) ) return;
    const helper = activity.actor;
    const message = (results?.message instanceof ChatMessage) ? results.message : null;
    if ( !helper?.isOwner || !message || readFlag(message, HELP_FLAG) ) return;
    void stampHelp(message, helper).catch(err => log.error(`The Help action could not be recorded — help by hand.`, err));
  } catch(err) {
    log.error(`The Help action's use failed — help by hand.`, err);
  }
});

async function stampHelp(message, helper) {
  // the targeted token, still targeted a beat after the use; the card's own snapshot as the fallback
  const token = [...game.user.targets].find(t => t.actor && (t.actor.uuid !== helper.uuid)) ?? null;
  const snapshot = targetsOf(message).find(t => t.uuid !== helper.uuid) ?? null;
  const target = token ? { uuid: token.actor.uuid, name: token.name } : (snapshot ? { uuid: snapshot.uuid, name: snapshot.name } : null);
  if ( !target ) {
    ui.notifications.error(`${HELP_NAME}: target one creature, and one creature only — then use it again.`);
    return;
  }
  const mine = tokenOf(helper);
  const feet = (mine && token) ? nearestFeet(mine, token) : null;
  const lends = lendable(sheetLends(helper));
  const rows = helpRows({ targetName: target.name, feet, lends });
  await message.setFlag(MODULE_ID, HELP_FLAG, { ...statContext(helper.uuid), status: "pending", helperName: helper.name,
    target, feet, lends, rows: rows.map(r => ({ key: r.key, off: r.off ?? null })), chosen: null, resolved: null });
}

// THE POPUP: the choice's radios and Apply (§5 *The pick*), on the helper's client (`gate: false` — its own action);
// the card's row recalls it (the latch). "Pass just this time" is the one way out: the Action went, nothing lent.
async function askHelp(message) {
  const f = readFlag(message, HELP_FLAG);
  if ( !f || (f.status !== "pending") || f.chosen ) return;
  const helper = resolveUuid(f.sourceUuid ?? "");
  if ( !(helper instanceof Actor) || !helper.isOwner ) return;
  const rows = helpRows({ targetName: f.target.name, feet: f.feet, lends: f.lends ?? [] });
  const content = bfCard({ eyebrow: `${HELP_NAME} — an Action`, tone: "pending",
    title: `${helper.name} helps ${f.target.name} — how?`,
    subtitle: "one assist, spent by the roll it helps; it expires at the start of your next turn" });
  await choicePopup(message, "help", helper, { name: PICK, rows, content, gate: false, width: 480,
    title: `${HELP_NAME} — ${helper.name}`, icon: "fa-solid fa-handshake-angle",
    answer: key => answerHelp(message, key) });
}

// THE ANSWER: the row's key read against what was offered; a greyed row's key is refused (the card recalls the popup).
async function answerHelp(message, key) {
  try {
    const f = readFlag(message, HELP_FLAG);
    if ( !f || f.chosen ) return;
    const answer = helpAnswer(key, { rows: f.rows ?? [], lends: f.lends ?? [] });
    if ( !answer ) {
      ui.notifications.warn(`${HELP_NAME}: pick an assist the rules allow here — a greyed row says why it is not.`);
      return;
    }
    await queueFlagWrite(message, HELP_FLAG, current => {
      if ( current.chosen ) return false;
      current.chosen = answer;
      current.answeredAt = Date.now();
    });
  } catch(err) {
    log.error(`The Help action's answer could not be recorded — help by hand.`, err);
  }
}

// THE LANDING: the elect writes the one effect on the creature, clocked to the helper's next turn start (Sap's window),
// receipted on the card (the receipt's revert is the table's undo); `resolved` closes the moment.
async function settleHelp(message) {
  const f = readFlag(message, HELP_FLAG);
  if ( !f?.chosen || f.resolved || !drivesMomentFor(f.sourceUuid ?? null) ) return;
  const claim = await claimLanding(message, HELP_FLAG, current => !!current.chosen && !current.resolved, { field: "landing", done: "resolved" });
  if ( !claim ) return;
  try {
    const helper = await resolveUuidAsync(f.sourceUuid ?? "");
    if ( !(helper instanceof Actor) ) throw new Error("the helper is gone");
    const facet = f.chosen.facet;
    const lend = f.chosen.lend ?? null;
    if ( facet === "pass" ) {
      await queueFlagWrite(message, HELP_FLAG, current => {
        current.resolved = { facet, lend: null, effectName: null, at: Date.now() };
        delete current.landing;
      });
      return;
    }
    // live only: the Help item is a feature never used up, so the sheet's copy is the truth (its art, its uuid as the origin)
    const item = helper.items.find(i => lower(i.name) === lower(HELP_NAME)) ?? null;
    const data = helpEffectData({ facet, helperName: f.helperName ?? helper.name, targetName: f.target.name, lend,
      img: item?.img ?? null, description: await ruleHTML(helpRuleFor(facet)) });
    // A template on the feature, under a fixed id: a second Help from the same helper refreshes the one copy.
    const template = new ActiveEffect.implementation(data, { parent: item ?? helper });
    const clock = chipClock("sap", placeOf(helper));
    await applyEffectsWithReceipt(message, [template], [{ uuid: f.target.uuid, name: f.target.name }],
      { source: helper.uuid, clock: clock ? chipData(clock) : null, marker: "helpDone" });
    await queueFlagWrite(message, HELP_FLAG, current => {
      current.resolved = { facet, lend, effectName: data.name, at: Date.now() };
      delete current.landing;
    });
  } catch(err) {
    log.error(`The Help action could not land its effect — apply the Advantage by hand.`, err);
    await queueFlagWrite(message, HELP_FLAG, current => { delete current.landing; }).catch(() => { /* the claim's ceiling clears it */ });
  }
}

// The answer's write settles it; the spine's resumable registry resumes it on render.
registerResumable(HELP_FLAG, {
  pending: flag => !!flag?.chosen && !flag.resolved,
  drives: flag => drivesMomentFor(flag?.sourceUuid ?? null),
  drive: settleHelp
});

// The card says it (R5): the question while it waits, its button recalling the popup; the assist once it landed.
listen("dnd5e.renderChatMessage", "help", (message, html) => {
  const f = readFlag(message, HELP_FLAG);
  if ( !f?.target ) return;
  const content = html.querySelector(SURFACES.messageContent);
  if ( !content ) return;
  const line = document.createElement("div");
  const eyebrow = `${HELP_NAME} — an Action`;
  if ( f.resolved ) {
    const words = helpWords({ facet: f.resolved.facet, helperName: f.helperName, targetName: f.target.name, lend: f.resolved.lend ?? null });
    const passed = f.resolved.facet === "pass";
    line.innerHTML = bfCard({ eyebrow, tone: passed ? "neutral" : "good", title: words.title, subtitle: words.line,
      lines: [ruleLine(passed ? HELP_RULE : helpRuleFor(f.resolved.facet))] });
    content.appendChild(line);
    return;
  }
  line.innerHTML = bfCard({ eyebrow, tone: "pending", title: `${f.helperName} helps ${f.target.name}`,
    subtitle: f.chosen ? `${HELP_FACETS[f.chosen.facet]?.name ?? "passed"} — landing` : "which assist? — choose on the popup",
    lines: [ruleLine(HELP_RULE)] });
  content.appendChild(line);
  if ( f.chosen ) return;
  // live only: the helper's own sheet decides whose button this is
  const helper = resolveUuid(f.sourceUuid ?? "");
  pendingRow(message, line, { latch: { sub: "help", show: () => askHelp(message) }, answer: helper?.isOwner ? { label: "Choose…" } : null });
});

// THE WORLD'S ITEM: the elect keeps one Help in the Items directory, to drag onto any sheet; fingerprinted, so once.
// ⚠ The lead is CLAIMED at `ready` by a User flag write (ui.js THE LEADING WINDOW): in the same tick a window that is
// about to lead still reads the last leader's stale mark, so the job waits for the claim to land, or gives up.
listenOnce("ready", "help", () => {
  void waitForWrite(() => (isActiveGM() ? true : null), { ms: 20_000, on: ["updateUser"] })
    .then(lead => (lead ? keepWorldItem() : null))
    .catch(err => log.warn(`The world's Help item could not be made — make one from the module's data by hand.`, err));
});

async function keepWorldItem() {
  if ( !isActiveGM() ) return;   // the write lands once, on the elect's leading window
  if ( game.items.some(i => !!readFlag(i, "helpItem")) ) return;
  await Item.implementation.create(helpItemData({ description: await ruleHTML(HELP_RULE) }));
}
