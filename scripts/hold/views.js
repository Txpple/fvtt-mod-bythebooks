// @ts-check
/**
 * By the Books — the reaction hold: THE VIEWS. The durable card row (with the reload resumes) and the
 * popups. The row renders below ui.js's damage-offer bar (dispatch.js ORDER).
 */
import { readFlag, S, setting, canAnswerFor, isContinuingClient, resolveUuid, resolveUuidAsync, log } from "../core.js";
import { INTERRUPT_REDUCTIONS, INTERRUPT_ROLLS } from "../decide/registry.js";
import { bfCard, holdBarHTML, ruleLine, spendLine, spendPhrase, tickRowsHTML, esc } from "../decide/present.js";
import { bentLines, d20ModeOf, dieMaxOf, futileGuardLine, guardRow, guardSign, liveRows, neededOnDieLine, neutraliseOutcome, rescueTitle } from "../decide/rescue-hit.js";
import { duplicateWords } from "../decide/duplicates.js";
import { muteScopesFor, poolOf, resolveAttackMessage } from "../shared.js";
import { openMomentPopup, momentButton, pendingRow, forgetShown, choicePopup, pickInputs, picked } from "../ui.js";
import { reactionItem, reactionImg, reactionACBonus, rescueRowsNow } from "./lookup.js";
import { armHoldTimer } from "./clock.js";
import { answerHold, castReaction, rescueReaction, protectReaction, bystanderReaction, muteAndPass, useAtZero } from "./answer.js";
import { activityNamed, d20FactsOf } from "../lookup.js";
import { continueHold } from "./continue.js";
import { payPillsFor } from "../cast-ways.js";
import { WAYS_HEAD } from "../decide/cast-ways.js";
import { SURFACES } from "../surfaces.js";
import { listen } from "../dispatch.js";
import { receiptEntries } from "../auto-apply.js";

/** The math a hold may show, or null with the reveal off. ⚠ ONE gate for card and popup — never re-derive. */
function revealDetail(target, roll, actor) {
  if ( !setting(S.holdReveal) ) return null;
  const liveAC = actor?.system?.attributes?.ac?.value ?? target.ac;
  const total = roll?.total ?? null;
  const bonus = (target.kind === "ac") ? reactionACBonus(target.reaction, actor, target) : null;
  return {
    total, liveAC, bonus,
    wouldAC: bonus == null ? null : liveAC + bonus,
    wouldMiss: bonus == null ? null : (total < (liveAC + bonus))
  };
}

/** The reveal as one compact line, for the card row. */
function revealLine(reveal, target) {
  let text = `<strong>${reveal.total}</strong> vs AC <strong>${reveal.liveAC}</strong>`;
  if ( reveal.bonus != null ) text += ` · ${target.reaction} → AC ${reveal.wouldAC}, `
    + `<em>${reveal.wouldMiss ? "enough to miss" : "still hits"}</em>`;
  return text;
}

// `atZero` (Deflect Attacks' Redirect): on the DAMAGE card, the defender's own client — the reduction took it to 0.
listen("dnd5e.renderChatMessage", "hold/views", (message, html) => {
  try {
    const entries = receiptEntries(message);
    if ( !entries.length ) return;
    const attack = resolveAttackMessage(message);
    const hold = readFlag(attack, "hold");
    if ( !hold?.targets?.length ) return;
    const done = readFlag(message, "atZero") ?? {};
    for ( const target of hold.targets ) {
      if ( (target.answer !== "cast") || !(Number(target.reduceBy) > 0) ) continue;
      const key = Object.keys(INTERRUPT_REDUCTIONS).find(k => k.toLowerCase() === String(target.reaction ?? "").toLowerCase());
      const row = key ? INTERRUPT_REDUCTIONS[key] : null;
      if ( !row?.atZero ) continue;
      const landed = entries.find(t => (t.uuid === target.uuid) && !t.reverted);
      if ( !landed || (Number(landed.taken) !== 0) ) continue;
      const actor = resolveUuid(target.uuid);
      if ( !(actor instanceof Actor) || done[actor.id] || !canAnswerFor(actor) ) continue;
      const attackerUuid = attack.getAssociatedActor?.()?.uuid ?? null;
      if ( !attackerUuid ) continue;
      const line = document.createElement("div");
      line.innerHTML = bfCard({ eyebrow: `${key} — the damage is 0`, tone: "pending",
        title: `${row.atZero} — at the attacker?`, subtitle: "the feature's own cost and save", lines: [ruleLine(row.rule)] });
      line.append(momentButton(row.atZero, () => { line.remove(); void useAtZero(message, actor, { row: String(key), activity: String(row.atZero), attackerUuid }); }));
      html.querySelector(SURFACES.messageContent)?.appendChild(line);
    }
  } catch(err) {
    log.warn(`The offer at 0 could not render — use it from the sheet.`, err);
  }
});

// The hold's durable row on the attack card, above mastery's rows (dispatch.js ORDER).
listen("dnd5e.renderChatMessage", "hold/views", (message, html) => {
  const hold = readFlag(message, "hold");
  if ( !hold?.targets?.length ) return;

  const row = document.createElement("div");
  row.className = "bythebooks-hold";
  row.style.margin = "0.4rem 0 0";

  for ( const target of hold.targets ) {
    const block = document.createElement("div");
    block.style.marginTop = "0.25rem";
    row.append(block);

    // The card is the PUBLIC record: everyone sees the same thing.
    void resolveUuidAsync(target.uuid).then(actor => {
      const roll = message.rolls[0];
      // A spell hold has no d20, so no math to reveal.
      const spell = hold.trigger === "spell";
      const reveal = spell ? null : revealDetail(target, roll, actor);
      const lines = [];
      let tone = "neutral";
      let eyebrow = "Reaction";
      let subtitle = target.name;

      if ( hold.status === "pending" ) {
        tone = "pending";
        eyebrow = "Reaction — held";
        const owner = game.users.find(u => !u.isGM && actor?.testUserPermission(u, "OWNER"));
        const guards = (target.guards ?? []).filter(g => !g.passed).map(g => g.name);
        const self = (target.selfAsk !== false) && !target.selfPassed ? [owner?.name ?? "the GM"] : [];
        subtitle = `${target.name} · waiting on ${[...self, ...guards].join(", ") || "the GM"}`;
        if ( reveal ) lines.push(revealLine(reveal, target));
        else if ( spell ) lines.push(`<strong>${hold.spell}</strong> · `
          + `${target.reaction} stops it completely`);
      } else {
        const cast = target.answer === "cast";
        const negated = target.verdict === "negated";
        tone = (target.verdict === "miss") || negated ? "good" : cast ? "bad" : "neutral";
        // "skip" is still labelled: holds answered that way sit in old logs.
        eyebrow = negated ? "Reaction — it worked"
          : cast ? "Reaction — cast"
          : target.answer === "skip" ? "Reaction — skipped"
          : target.timedOut ? "Reaction — timed out" : "Reaction — passed";
        if ( cast && (target.acAtVerdict != null) ) {
          const moved = target.acAtVerdict !== target.ac;
          lines.push(`AC <strong>${target.ac}</strong>${moved ? ` → <strong>${target.acAtVerdict}</strong>` : ""}`
            + ` vs the attack's <strong>${roll?.total}</strong>`);
        }
        if ( negated ) lines.push(`<strong>${hold.spell}</strong> does nothing to them.`);
        else if ( target.verdict ) lines.push(target.verdict === "miss"
          ? `<strong>The attack misses.</strong>`
          : spell ? `The <strong>${hold.spell}</strong> lands in full.`
          : `The attack still hits.`);
        else if ( target.answer === "pass" ) lines.push(target.timedOut
          ? "The reaction window closed — no answer, so the attack lands."
          : "Let it land — no reaction.");
      }
      // C1 — a `save` duplicate (Unbreakable Majesty): the attacker's save, the hit turned aside or standing.
      if ( target.duplicates?.save && (hold.status !== "pending") ) {
        const d = target.duplicates;
        const label = CONFIG.DND5E.abilities[d.save.ability]?.label ?? d.save.ability;
        block.innerHTML = bfCard({ img: d.img ?? null, eyebrow: d.key, subtitle: target.name, tone: d.absorbed ? "good" : "bad",
          title: d.absorbed ? `${d.key} — the attack misses instead` : `${d.key} — the hit stands`,
          lines: [`the attacker's ${esc(label)} save: ${(d.save.total === null) ? "unrolled" : `${d.save.total} vs DC ${d.save.dc}`}`] });
        return;
      }
      // THE DUPLICATES rolled (Mirror Image): the dice, what they did, what stands.
      if ( target.duplicates?.faces?.length && (hold.status !== "pending") ) {
        const d = target.duplicates;
        const words = duplicateWords({ key: d.key, die: d.die, at: d.at }, { absorbed: !!d.absorbed, winner: d.winner ?? null, faces: d.faces }, { took: d.took?.name ?? null, left: d.left ?? 0, of: d.of ?? 0 });
        const after = (target.answer === "roll") && target.bent ? [`after ${esc(target.rescue ?? target.reaction)}: <strong>${target.bent.total}</strong> vs AC <strong>${target.acAtVerdict ?? target.ac}</strong> — still a hit`] : [];
        block.innerHTML = bfCard({ img: d.img ?? null, eyebrow: d.key, title: words.title, subtitle: target.name,
          tone: d.absorbed ? "good" : "bad", lines: [...after, words.dice, words.count] });
        return;
      }
      // A resolved BENT roll: who bent it and what it did.
      if ( (target.answer === "roll") && target.bent && target.verdict && (hold.status !== "pending") ) {
        const rescue = target.rescue ?? target.reaction;
        const by = target.guardedBy ?? null;
        const label = by ? `${rescue} (${by.name})` : rescue;
        const { headline, detail } = bentLines({ rescue: label, bent: target.bent, verdict: target.verdict, ac: target.acAtVerdict ?? null });
        const guardImg = by ? (resolveUuid(by.uuid)?.items?.get(by.itemId)?.img ?? null) : null;
        const how = ["die", "neutralised", "set"].includes(target.bent.how) ? label : `Disadvantage · ${label}`;
        block.innerHTML = bfCard({
          img: guardImg ?? reactionImg(actor, rescue, {}), eyebrow: `Attack — ${how}`,
          title: rescue, subtitle: target.name, tone: (target.verdict === "miss") ? "good" : "bad",
          lines: [`<strong>${headline}</strong>`, detail]
        });
        return;
      }

      // A reduction reaction (INTERRUPT_REDUCTIONS) wears the maneuver family's shape.
      const maneuver = !!target.reduce;
      let title = target.reaction;
      if ( maneuver ) {
        const attackerName = message.getAssociatedActor?.()?.name ?? "The attacker";
        const r = target.reduce;
        eyebrow = `${r.eyebrow ?? "Maneuver"} — ${target.reaction}`;
        if ( hold.status === "pending" ) {
          title = `${target.reaction} — ${target.name} may reduce the damage`;
          subtitle = `${attackerName}'s ${r.hit ?? "melee attack"} hit`;
        } else if ( target.answer === "cast" ) {
          title = (Number(target.reduceBy) > 0)
            ? `${target.reaction} — ${target.name} reduces the damage by ${target.reduceBy}`
            : `${target.reaction} — ${target.name} reacts; reduce the damage by hand`;
          subtitle = spendPhrase(target.poolSpend ? [target.poolSpend] : [], r.spend ?? "Superiority Die");
        } else {
          title = `${target.reaction} — ${target.name} declined${target.timedOut ? " (timer)" : ""}`;
          subtitle = `${attackerName}'s ${r.hit ?? "melee attack"} hit`;
        }
      }
      block.innerHTML = bfCard({
        img: reactionImg(actor, target.reaction, target),
        eyebrow, title, subtitle, lines, tone
      });
      // A reload lands here with the hold open: re-arm the buzzer from the flag's deadline.
      pendingRow(message, block, { bar: holdBarHTML(hold), arm: (hold.status === "pending") && armHoldTimer });

      if ( hold.status !== "pending" ) return;
      if ( !target.answer ) appendBystanderRows(block, message, target);
      const selfOpen = (target.selfAsk !== false) && !target.selfPassed && canAnswerFor(actor);
      const guardOpen = (target.guards ?? []).some(g => !g.passed && canAnswerFor(resolveUuid(g.uuid)));
      if ( target.answer || (!selfOpen && !guardOpen) ) return;

      // ⚠ ONE input surface: the popup decides; the card only calls it BACK, never a second set of controls.
      const controls = document.createElement("div");
      Object.assign(controls.style, {
        display: "flex", gap: "0.3rem", marginTop: "0.4rem", justifyContent: "flex-end"
      });
      pendingRow(message, controls, { answer: {
        style: { flex: "0 0 auto", margin: "0", padding: "0 0.4rem", fontSize: "inherit", lineHeight: "1.4" },
        show: () => { forgetShown(message, "hold"); return showHoldPopup(message, readFlag(message, "hold")); }
      } });
      block.append(controls);
    });
  }
  html.querySelector(SURFACES.messageContent)?.appendChild(row);

  // Resume a READY hold nobody drives (the continuing client reloaded before the verdict): the buzzer
  // passes only UNANSWERED targets. The in-flight claim makes this idempotent across re-renders.
  if ( (hold.status === "pending") && hold.targets.every(t => t.answer)
    && isContinuingClient(hold) ) void continueHold(message);

  // Closing the popup is not an answer; the row is the durable state.
  pendingRow(message, row, { latch: (hold.status === "pending") && { sub: "hold", show: () => showHoldPopup(message, hold) } });
});

/**
 * THE BYSTANDERS' CARD ROWS (Q2 option A), on the attack card itself and only on the bystander's own client —
 * never a message of their own: a row per bystander still asked, with the mutes (shared.js `muteScopesFor`) so a
 * popup closed unanswered can still be silenced from the card.
 */
function appendBystanderRows(block, message, target) {
  for ( const guard of (target.guards ?? []) ) {
    if ( !guard.bystander || guard.passed ) continue;
    const who = resolveUuid(guard.uuid);
    if ( !canAnswerFor(who) ) continue;
    const line = document.createElement("div");
    line.dataset.bfBystander = `${guard.row}|${guard.uuid}`;
    Object.assign(line.style, { display: "flex", gap: "0.3rem", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap",
      marginTop: "0.3rem", fontSize: "var(--font-size-12,12px)" });
    const label = document.createElement("span");
    label.style.opacity = "0.85";
    label.textContent = `${guard.row} (${guard.name})`;
    line.append(label);
    const small = { flex: "0 0 auto", margin: "0", padding: "0 0.4rem", fontSize: "inherit", lineHeight: "1.4" };
    for ( const scope of muteScopesFor(who) ) {
      const button = momentButton(scope.label, () => { line.remove(); void muteAndPass(message, target, guard, scope.until); }, small);
      button.dataset.tooltip = scope.hint;
      line.append(button);
    }
    block.append(line);
  }
}

/** The bystander popup's situation: the premise, and under the reveal the arithmetic the gate judged. */
function bystanderSituation(row, roll, ac, guard, miss = false) {
  const facts = d20FactsOf(roll);
  const reveal = setting(S.holdReveal);
  // A stored-face row (Portent) says the whole choice in its own line: nothing to add here.
  if ( row?.bend === "set" ) return "";
  if ( row?.bend === "neutralise" ) {
    const o = neutraliseOutcome({ mode: facts.mode, kept: Number(facts.kept), plain: facts.plain, total: Number(roll.total),
      critAt: facts.critAt, fumbleAt: facts.fumbleAt });
    const mode = (facts.mode === "advantage") ? "Advantage" : "Disadvantage";
    return `Rolled with <strong>${mode}</strong>: ${facts.faces.join(" and ")} → <strong>${roll.total}</strong>${reveal ? ` vs AC <strong>${ac}</strong>` : ""}. `
      + `Take it away and the <strong>first d20 (${o.stood})</strong> stands — <strong>${o.total}</strong>.`;
  }
  const head = roll?.isCritical ? "<strong>natural 20</strong> — a critical hit."
    : `<strong>${roll.total}</strong>${reveal ? ` vs AC <strong>${ac}</strong>` : ""} — a ${miss ? "miss" : "hit"}.`;
  const max = dieMaxOf(guard.die);
  if ( !reveal || !max ) return head;
  const minus = guardSign(guard, row) < 0;
  const what = /d/i.test(String(guard.die)) ? esc(guard.die) : `${minus ? "−" : "+"}${esc(guard.die)}`;
  // The face the die needs, in bold, so the player zeroes in (a real die only; a flat +10 has no face to need).
  const needed = /d/i.test(String(guard.die)) ? neededOnDieLine({ total: Number(roll.total), against: Number(ac), dieMax: max, minus, die: String(guard.die) }) : "";
  // The needed face on its own line, a gap above it, so the eye lands on it.
  return `${head} A ${what} can turn it: ${roll.total} ${minus ? "−" : "+"} ${max} = ${minus ? roll.total - max : roll.total + max}.${needed ? `<div style="margin-top:0.55rem;">${needed}</div>` : ""}`;
}

/** A BYSTANDER's popup (Cutting Words, Restore Balance): keyed like a guard's, three buttons — the third mutes. */
async function showBystanderPopup(attackMessage, target, guard, byActor, hold, roll) {
  const row = INTERRUPT_ROLLS[guard.row] ?? null;
  const attacker = attackMessage.getAssociatedActor?.()?.name ?? "The attacker";
  const weapon = attackMessage.getAssociatedActivity?.()?.item?.name ?? "the attack";
  const defender = resolveUuid(target.uuid);
  const ac = defender?.system?.attributes?.ac?.value ?? target.ac;
  const item = byActor?.items?.get(guard.itemId) ?? null;
  const activity = item ? (item.system?.activities?.get(guard.activityId) ?? activityNamed(item, row?.activity)) : null;
  const pool = (activity ? poolOf(byActor, activity) : null) ?? item;
  const left = Number(pool?.system?.uses?.value ?? 0);
  const poolWord = (pool && (pool !== item)) ? `${pool.name} ` : "";
  const tag = [(row?.reaction && (!guard.self || guard.hitSelf)) ? "a Reaction" : null, row?.uses ? `${poolWord}${left} left` : null,
    guard.inspired ? "the Inspired die" : null].filter(Boolean).join(" · ");
  const dice = (row?.bend === "neutralise") ? "the first d20 stands" : `${guardSign(guard, row) < 0 ? "−" : "+"}${guard.die ?? "a die"}`;
  const facts = d20FactsOf(roll);
  const modifier = Number(roll?.total) - Number(facts.kept);
  const miss = !!hold?.miss;
  const stored = row?.bend === "set";
  const reveal = setting(S.holdReveal);
  // A stored face's row (Portent): what the roll becomes and what that means — one line a player reads in a glance.
  const verdictOf = face => {
    const total = face + modifier;
    const word = (face >= facts.critAt) ? "a CRITICAL HIT" : (face <= facts.fumbleAt) ? "a MISS" : (total >= Number(ac)) ? "a HIT" : "a MISS";
    return `${total}${reveal ? ` vs AC ${ac}` : ""} — ${word}`;
  };
  // THE CHOICES AS RADIOS (RULINGS *The asks widened*): the bend's row(s), then "Pass just this time" checked,
  // then the mutes; one button, Apply, so Enter passes and a click on a row takes it.
  const bendRows = stored
    ? (guard.faces ?? []).map(face => ({ key: `${guard.row}|${face}`, name: `Use the ${face}`, dice: verdictOf(face), tag: "", off: null, rule: row?.rule ?? "" }))
    : [{ key: guard.row, name: guard.row, dice, tag, off: null, rule: row?.rule ?? "" }];
  const self = miss ? !!guard.self : (guard.uuid === target.uuid);
  const whose = (miss && self) ? "your" : `${attacker}'s`;
  const at = (!miss && self) ? "you" : target.name;
  const rolled = roll?.isCritical ? "natural 20 — a critical hit" : `${roll?.total}${reveal ? ` vs AC ${ac}` : ""} — a ${miss ? "miss" : "hit"}`;
  const situation = bystanderSituation(row, roll, ac, guard, miss);
  await choicePopup(attackMessage, `${target.uuid}|${guard.uuid}`, byActor, {
    title: `${guard.row} — ${whose} attack at ${at}`, icon: "fa-solid fa-comment-dots", width: 460,
    content: bfCard({ img: item?.img ?? byActor?.img ?? null, eyebrow: stored ? `${guard.row} — no Reaction` : `${(row?.reaction && (!guard.self || guard.hitSelf)) ? "Reaction" : "No Reaction"} — ${guard.row}`, tone: "pending",
      title: `${(miss && self) ? "You" : attacker} ${miss ? "missed" : "hits"} ${at}`,
      subtitle: stored ? rolled : `${weapon}${self ? "" : (row?.bystander === "sight") ? " · on the scene" : ` · within ${row?.bystander ?? "?"} ft of ${(row?.reach === "target") ? target.name : "you"}`}${guard.inspired ? ` · ${guard.inspired.bard}'s Inspired die` : ""}` })
      + holdBarHTML(hold) + (situation ? `<div style="padding:0.4rem 0.1rem;">${situation}</div>` : ""),
    name: "bf-bystander", rows: bendRows, mutes: muteScopesFor(byActor),
    answer: choice => {
      if ( choice === "pass" ) { void answerHold(attackMessage, target.uuid, "pass", { by: guard.uuid }); return; }
      // The mutes (RULINGS *The asks widened*): until the bystander's next turn, or the combat's end; out of one, until the next.
      if ( choice.startsWith("mute-") ) { void muteAndPass(attackMessage, target, guard, (choice === "mute-turn") ? "turn" : "combat"); return; }
      const face = (row?.bend === "set") ? Number(choice.split("|")[1]) : null;
      void bystanderReaction(attackMessage, target, guard, { face });
    }
  });
}

/** A maneuver reaction's popup (Parry): Riposte's shape — the card, the cost, the rule, the clock. */
function maneuverPopupContent(attackMessage, target, actor, hold) {
  const key = Object.keys(INTERRUPT_REDUCTIONS).find(k => k.toLowerCase() === String(target.reaction ?? "").toLowerCase());
  const row = key ? INTERRUPT_REDUCTIONS[key] : null;
  const attackerName = attackMessage.getAssociatedActor?.()?.name ?? "The attacker";
  const item = actor?.items.get(target.itemId) ?? reactionItem(actor, target.reaction);
  const activity = item?.system?.activities?.get(target.reduce?.activityId) ?? null;
  const pool = activity ? poolOf(actor, activity) : null;
  const standing = pool ? spendLine({ pool: pool.name, left: Number(pool.system?.uses?.value ?? 0), max: Number(pool.system?.uses?.max ?? 0) }) : null;
  const r = target.reduce ?? {};
  return bfCard({
    img: reactionImg(actor, target.reaction, target), eyebrow: `${r.eyebrow ?? "Maneuver"} — ${target.reaction}`, tone: "pending",
    title: `${attackerName} hit you`,
    subtitle: `Spend ${r.spend === "use" ? "a use" : `a ${r.spend ?? "Superiority Die"}`} and your Reaction to reduce the damage by ${r.by ?? "the die plus your modifier"}${standing ? ` · ${standing}` : ""}`,
    lines: row?.rule ? [ruleLine(row.rule)] : []
  }) + holdBarHTML(hold, "to answer");
}

/** A held spell's ways to pay as pills (cast-ways.js), the module's pick ticked; null for anything else (a feature, a
 * statblock's Spellcasting, a spell with one way). The activity is the one Cast uses (answer.js `castReaction`).
 * @param {any} actor
 * @param {any} target */
function holdPayPills(actor, target) {
  const own = target.itemId ? (actor?.items?.get(target.itemId) ?? null) : null;
  const item = own ?? reactionItem(actor, target.reaction, target);
  if ( (item?.type !== "spell") || (item.actor !== actor) ) return null;
  const activity = (target.activityId ? item.system.activities?.get(target.activityId) : null)
    ?? item.system.activities?.contents?.find(a => a.activation?.type === "reaction") ?? item.system.activities?.contents?.[0] ?? null;
  return payPillsFor(actor, item, activity, "bf-pay", { head: WAYS_HEAD });
}

/** The reaction rendered as itself (portrait, enriched text, the math if revealed), not a confirm box. `pay` the
 * spell's pills, drawn before the rule.
 * @param {any} target
 * @param {any} roll
 * @param {any} actor
 * @param {any} hold
 * @param {{html: string}|null} [pay] */
async function holdPopupContent(target, roll, actor, hold, pay = null) {
  // ⚠ The reaction's real item, not a bare-name match (a worn shield shares the spell's name).
  const item = reactionItem(actor, target.reaction, target);
  const img = item?.img ?? "icons/svg/shield.svg";
  const subtitle = [target.name, item?.system?.activation?.type === "reaction" ? "Reaction" : null]
    .filter(Boolean).join(" · ");

  // the reaction's own text, under the rule tick (DESIGN *Cards*): read from the item it is
  const rule = item ? { item: item.name, uuid: item.uuid } : null;

  const spell = hold?.trigger === "spell";
  const reveal = spell ? null : revealDetail(target, roll, actor);
  const situation = spell
    ? `<div style="font-size:var(--font-size-14,14px);"><strong>${hold.spell}</strong> is about `
      + `to strike <strong>${esc(target.name)}</strong>.</div>`
      + `<div style="opacity:0.85;margin-top:0.15rem;">${target.reaction} stops it completely — `
      + `<em>no damage at all</em>.</div>`
    : reveal
    ? `<div style="font-size:var(--font-size-14,14px);"><strong>${reveal.total}</strong> vs AC `
      + `<strong>${reveal.liveAC}</strong> — a hit.</div>`
      + (reveal.bonus == null ? "" : `<div style="opacity:0.85;margin-top:0.15rem;">`
        + `${target.reaction} would make it AC <strong>${reveal.wouldAC}</strong> — `
        + `<em>${reveal.wouldMiss ? "enough to miss" : "still not enough"}</em>.</div>`)
    : `<div style="font-size:var(--font-size-14,14px);">Something hits `
      + `<strong>${esc(target.name)}</strong>.</div>`;

  return `
  <div style="display:flex;gap:0.6rem;align-items:center;padding-bottom:0.5rem;
              border-bottom:1px solid var(--color-border-light-2,#999a);">
    <img src="${esc(img)}" alt="${String(target.reaction ?? "").replace(/"/g, "&quot;")}"
         data-tooltip="${String(target.reaction ?? "").replace(/"/g, "&quot;")}"
         style="width:48px;height:48px;flex:0 0 auto;border-radius:4px;
         border:1px solid var(--color-border-dark,#0006);object-fit:cover;">
    <div style="flex:1;min-width:0;">
      <div style="font-family:var(--font-h1,inherit);font-size:var(--font-size-18,18px);
                  font-weight:bold;line-height:1.2;">${target.reaction}</div>
      <div style="opacity:0.7;font-size:var(--font-size-12,12px);">${subtitle}</div>
    </div>
  </div>
  ${holdBarHTML(hold)}
  <div style="padding:0.6rem 0.1rem;">${situation}</div>
  ${pay?.html ?? ""}
  ${ruleLine(rule)}`;
}

/**
 * Show the hold popup. ⚠ A popup is a VIEW: the hold's own update closes it, and closing releases
 * the decision to the card.
 */
async function showHoldPopup(attackMessage, hold) {
  const roll = attackMessage.rolls[0];
  for ( const target of hold.targets ) {
    // Reopening an answered target would produce a second "passes" card.
    if ( target.answer ) continue;
    const actor = await resolveUuidAsync(target.uuid);
    // Each unanswered guard (Protection) gets a popup of its own.
    for ( const guard of (target.guards ?? []) ) {
      if ( guard.passed ) continue;
      const guardActor = resolveUuid(guard.uuid);
      if ( !canAnswerFor(guardActor) ) continue;
      if ( guard.bystander ) await showBystanderPopup(attackMessage, target, guard, guardActor, hold, roll);
      else await showGuardPopup(attackMessage, target, guard, guardActor, hold, roll);
    }
    if ( (target.selfAsk === false) || target.selfPassed ) continue;
    // canAnswerFor ALONE routes: the owning player while connected, else the GM.
    if ( !canAnswerFor(actor) ) continue;

    if ( target.rows?.length ) { await showRescuePopup(attackMessage, target, actor, hold, roll); continue; }

    // The same two buttons for everyone; a maneuver's answer button is its name.
    const maneuver = !!target.reduce;
    const pay = maneuver ? null : holdPayPills(actor, target);
    await openMomentPopup(attackMessage, target.uuid, actor, {
      title: maneuver ? `${target.reaction} — ${actor?.name ?? ""}` : target.reaction,
      icon: maneuver ? "fa-solid fa-hand-back-fist" : "fa-solid fa-shield-halved", width: 460,
      content: maneuver ? maneuverPopupContent(attackMessage, target, actor, hold) : await holdPopupContent(target, roll, actor, hold, pay),
      buttons: [
        { action: "cast", label: maneuver ? target.reaction : `Cast ${target.reaction}`, default: true,
          callback: (_event, button) => castReaction(attackMessage, target, { pay: pay ? picked(button?.form, "bf-pay") : null }) },
        { action: "pass", label: "Pass",
          callback: () => answerHold(attackMessage, target.uuid, "pass") }
      ]
    });
  }
}

/** A GUARD's popup (Protection), keyed apart from the target's so each closes on its own answer. */
async function showGuardPopup(attackMessage, target, guard, guardActor, hold, roll) {
  const row = INTERRUPT_ROLLS[guard.row] ?? null;
  const attacker = attackMessage.getAssociatedActor?.()?.name ?? "The attacker";
  const weapon = attackMessage.getAssociatedActivity?.()?.item?.name ?? "the attack";
  const defender = resolveUuid(target.uuid);
  const reveal = revealDetail(target, roll, defender);
  const situation = roll?.isCritical ? "<strong>natural 20</strong> — a <strong>critical hit</strong>."
    : reveal ? `<strong>${reveal.total}</strong> vs AC <strong>${reveal.liveAC}</strong> — a hit.`
    : `Something hits <strong>${esc(target.name)}</strong>.`;
  const d20 = roll?.dice?.[0] ?? null;
  const { row: guardOffer, futile } = guardRow({ name: guard.row, rule: row?.rule ?? "",
    mode: d20ModeOf({ number: d20?.number, modifiers: d20?.modifiers }) });
  const rows = [guardOffer];
  const dialog = await openMomentPopup(attackMessage, `${target.uuid}|${guard.uuid}`, guardActor, {
    title: `${guard.row} — ${guard.name}`, icon: "fa-solid fa-shield-halved", width: 460,
    content: bfCard({ img: guardActor?.items?.get(guard.itemId)?.img ?? guardActor?.img ?? null, eyebrow: `Reaction — ${guard.row}`, tone: "pending",
      title: `${attacker} hits ${target.name}`, subtitle: `${weapon} · ${target.name} is beside you · Reaction` })
      + holdBarHTML(hold) + `<div style="padding:0.4rem 0.1rem;">${situation}${futile ? ` ${futileGuardLine(guard.row)}` : ""}</div>`
      + tickRowsHTML({ name: "bf-guard", rows }),
    buttons: [
      { action: "answer", label: "Answer", default: !futile, callback: (_event, button) => {
        if ( futile || !pickInputs(button?.form, "bf-guard").some(b => b.checked) ) return;
        void protectReaction(attackMessage, target, guard);
      } },
      { action: "pass", label: futile ? "Keep my Reaction" : "Pass", default: futile,
        callback: () => answerHold(attackMessage, target.uuid, "pass", { by: guard.uuid }) }
    ]
  });
  // The tick stays even on one row; a futile row starts unticked with Answer off.
  const form = dialog?.element?.querySelector?.("form") ?? dialog?.element ?? null;
  const box = pickInputs(form, "bf-guard")[0] ?? null;
  const answer = form?.querySelector?.('button[data-action="answer"]') ?? null;
  if ( futile ) { if ( box ) { box.checked = false; box.disabled = true; } if ( answer ) answer.disabled = true; return; }
  if ( box ) box.checked = true;
  box?.addEventListener("change", () => { if ( answer ) answer.disabled = !box.checked; });
}

/**
 * THE POPUP THAT RESCUES A HIT (RULINGS *Rescuing the hit — the `roll` interrupt*): one tick row per
 * rescue, one ticked at a time; the situation line states the premise, never an outcome.
 */
async function showRescuePopup(attackMessage, target, actor, hold, roll) {
  const rows = rescueRowsNow(actor, target, roll);
  if ( !liveRows(rows).length ) return;   // spent since the stamp: nothing left to take (the buzzer passes it)
  const attacker = attackMessage.getAssociatedActor?.()?.name ?? "The attacker";
  const weapon = attackMessage.getAssociatedActivity?.()?.item?.name ?? "the attack";
  const reveal = revealDetail(target, roll, actor);
  const situation = roll?.isCritical ? "<strong>natural 20</strong> — a <strong>critical hit</strong>."
    : reveal ? `<strong>${reveal.total}</strong> vs AC <strong>${reveal.liveAC}</strong> — a hit.`
    : `Something hits <strong>${esc(target.name)}</strong>.`;
  const dialog = await openMomentPopup(attackMessage, target.uuid, actor, {
    title: rescueTitle(rows, target.name), icon: "fa-solid fa-shield-halved", width: 460,
    content: bfCard({ img: actor?.img ?? null, eyebrow: "Reaction — held", tone: "pending",
      title: `${attacker} hit you`, subtitle: `${weapon} · ${target.name} · Reaction` })
      + holdBarHTML(hold) + `<div style="padding:0.4rem 0.1rem;">${situation}</div>`
      + tickRowsHTML({ name: "bf-rescue", rows }),
    buttons: [
      // The window goes at the click: the answer is fired, not awaited.
      { action: "answer", label: "Answer", default: true, callback: (_event, button) => {
        const pick = picked(button?.form, "bf-rescue");
        const row = rows.find(r => (r.key === pick) && !r.off);
        if ( !row ) return;
        if ( row.kind === "roll" ) void rescueReaction(attackMessage, target, row.key);
        else void castReaction(attackMessage, target);
      } },
      { action: "pass", label: "Pass", callback: () => answerHold(attackMessage, target.uuid, "pass") }
    ]
  });
  // One tick at a time; Answer live only while one is ticked.
  const form = dialog?.element?.querySelector?.("form") ?? dialog?.element ?? null;
  const answer = form?.querySelector?.('button[data-action="answer"]') ?? null;
  const boxes = pickInputs(form, "bf-rescue");
  if ( answer ) answer.disabled = true;
  for ( const box of boxes ) box.addEventListener("change", () => {
    if ( box.checked ) for ( const other of boxes ) if ( other !== box ) other.checked = false;
    if ( answer ) answer.disabled = !boxes.some(b => b.checked);
  });
}
