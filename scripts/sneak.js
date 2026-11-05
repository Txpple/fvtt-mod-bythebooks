/**
 * By the Books — Sneak Attack: the dice ride the damage, Cunning Strike costs come off first, the
 * effects go through the saves machine, once per turn is a chit. Split shape (ARCHITECTURE.md §7).
 */
import { MODULE_ID, readFlag, activeCombatFor, drivesMomentFor, queueFlagWrite, statContext, resolveUuidAsync, log } from "./core.js";
import { verdictsOn } from "./decide/demand.js";
import { lower, featureNamed, namesAnswering } from "./lookup.js";
import { registerResumable, registerOfferPart, pickInputs } from "./ui.js";
import { damagePartsOf, hitTargets, namedPart, statSourceOf, withTargets, writeTurnChit, savesOf, saveSourceOf } from "./shared.js";
import { bfCard, cunningMenuHTML, ruleLine, esc } from "./decide/present.js";
import { CUNNING_OPTIONS, DEATH_STRIKE } from "./decide/registry.js";
import { cunningMenu, cunningPick, sneakFormula } from "./decide/sneak.js";
import { attackMessageForDamage } from "./auto-damage.js";
import { applyDamagesWithReceipt } from "./auto-apply.js";
import { applyEffectsWithReceipt } from "./effect-riders.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";
import { tokenOf } from "./geometry.js";

/** The feature names the Cunning Strike menu answers to. */
const CUNNING_FEATURES = [...Object.values(CUNNING_OPTIONS).flatMap(r => [r.feature, r.upgrade?.feature]), "Improved Cunning Strike"].filter(Boolean);

// The gate arms Sneak Attack; the offer's Cunning Strike pick is committed BEFORE the dice. The rider
// and the effects run on the ROLLER's client (it owns the items); failed-save follow-ups on the driver.

/** By name, or a preference list where the first with a use left wins (Rend Mind's free use first). */
function activityNamed(item, names) {
  const wanted = (Array.isArray(names) ? names : [names]).map(lower);
  const all = [...(item?.system?.activities ?? [])];
  for ( const n of wanted ) {
    const a = all.find(x => lower(x.name) === n);
    if ( !a ) continue;
    const max = a.uses?.max;
    if ( (max === "" || max === null || max === undefined) || ((a.uses?.value ?? 0) > 0) ) return a;
  }
  return null;
}

/** The Cunning Strike DC: the activity's own computed value where one exists, else the rule's arithmetic. */
function cunningDC(actor, activity = null) {
  const own = Number(activity?.save?.dc?.value);
  if ( own > 0 ) return own;
  return 8 + (actor?.system?.attributes?.prof ?? 0) + (actor?.system?.abilities?.dex?.mod ?? 0);
}

/** The armed, not-yet-rolled Sneak Attack on an attack message, or null. */
function sneakArmedOn(attackMessage) {
  const s = readFlag(attackMessage, "sneak");
  return (s?.armed && !s.rolled) ? s : null;
}

/**
 * The offer part for an armed Sneak Attack. ⚠ The pick lives in memory (`chosen`): the buzzer
 * commits it without a DOM that may be gone.
 * @param {ChatMessage} attackMessage
 * @param {object} activity
 */
function sneakOfferParts(attackMessage, activity) {
  const sneak = sneakArmedOn(attackMessage);
  if ( !sneak ) return null;
  const attacker = attackMessage.getAssociatedActor();
  if ( !attacker ) return null;
  const features = namesAnswering(attacker.items.filter(i => i.type === "feat"), CUNNING_FEATURES);
  const { rows, max } = cunningMenu({ options: CUNNING_OPTIONS, features, weaponName: sneak.weaponName ?? activity?.item?.name ?? "", dice: sneak.number });
  const csItem = featureNamed(attacker, "Cunning Strike");
  const dc = cunningDC(attacker, csItem ? activityNamed(csItem, "Poison") : null);
  const chosen = new Set();
  const formulaLabel = () => {
    const pick = cunningPick({ rows, chosen, dice: sneak.number, max });
    const left = sneakFormula({ number: sneak.number, faces: sneak.faces, cost: pick.cost });
    // The button names the weapon too: the roll is the weapon's dice plus the sneak dice.
    const weapon = activity?.item?.name ?? "Weapon";
    return left ? `${weapon} + Sneak Attack ${left}` : `${weapon} alone — every Sneak Attack die forgone`;
  };
  return {
    sneak, rows, max, dc,
    line: `<strong>Sneak Attack</strong> — ${sneak.dice} rides this roll, once per turn${rows.length ? "; pick a Cunning Strike below, or roll them all" : ""}.`,
    html: cunningMenuHTML({ rows, max, dc, dice: sneak.dice }),
    /** Keep the pick legal and the button honest, live. */
    wire(element) {
      const boxes = pickInputs(element, "bf-cunning");
      const button = element?.querySelector(SURFACES.dialogRoll);
      const baseLabel = button?.textContent?.trim() ?? "Roll Damage";
      const relabel = () => { if ( button ) button.innerHTML = `<i class="fa-solid fa-dice-d6" inert></i> ${esc(baseLabel)} — ${formulaLabel()}`; };
      const order = [];
      for ( const box of boxes ) {
        box.addEventListener("change", () => {
          if ( box.checked ) {
            chosen.add(box.value); order.push(box.value);
            // Past the limit or past the dice: the OLDEST pick gives way.
            while ( (chosen.size > max) || cunningPick({ rows, chosen, dice: sneak.number, max }).tooDear ) {
              const oldest = order.shift();
              if ( !oldest ) break;
              chosen.delete(oldest);
              const el = boxes.find(b => b.value === oldest);
              if ( el ) el.checked = false;
            }
          } else {
            chosen.delete(box.value);
            const at = order.indexOf(box.value);
            if ( at >= 0 ) order.splice(at, 1);
          }
          relabel();
        });
      }
      relabel();
    },
    /** Write the pick on the attack message BEFORE the roll — the rider reads it there. */
    async commit() {
      const pick = cunningPick({ rows, chosen, dice: sneak.number, max });
      const keys = (pick.tooMany || pick.tooDear) ? [] : pick.chosen.map(r => r.key);
      try {
        await attackMessage.setFlag(MODULE_ID, "sneak", { ...sneak, cunning: keys, cost: keys.length ? pick.cost : 0, dc });
      } catch(err) {
        log.error(`Could not record the Cunning Strike pick — rolling the full Sneak Attack.`, err);
      }
    }
  };
}

// An armed Sneak Attack opens the damage offer whatever the setting, with the Cunning Strike menu.
registerOfferPart({
  key: "sneak",
  due: attackMessage => !!sneakArmedOn(attackMessage),
  parts: (attackMessage, activity, { isCritical }) => {
    const sneak = sneakOfferParts(attackMessage, activity);
    if ( !sneak ) return null;
    return {
      html: sneak.html,
      lines: [`${sneak.line}${isCritical ? " A critical hit doubles what is left of the sneak dice too." : ""}`],
      wire: sneak.wire, commit: sneak.commit
    };
  }
});

/* --- the rider: the sneak dice ride the weapon's damage roll --------------------------------- */

listen("dnd5e.preRollDamage", "sneak", (config, _dialog, message) => {
  try {
    const activity = config.subject;
    if ( activity?.type !== "attack" ) return;
    const attackMessage = attackMessageForDamage(config, message);
    const sneak = attackMessage ? sneakArmedOn(attackMessage) : null;
    if ( !sneak ) return;
    const attacker = activity.actor;
    const cost = Number(sneak.cost) || 0;
    const formula = sneakFormula({ number: sneak.number, faces: sneak.faces, cost });
    if ( formula ) {
      config.rolls.push({
        // ⚠ No `properties`: the weapon's type but not its magic (no resistance bypass).
        data: foundry.utils.deepClone(config.rolls[0]?.data ?? {}),
        parts: [namedPart(formula, "Sneak Attack")],
        options: { type: sneak.type ?? null, types: sneak.type ? [sneak.type] : [] }
      });
    }
    const chosen = (sneak.cunning ?? []).map(key => ({ key, ...CUNNING_OPTIONS[key] })).filter(r => r.feature);
    foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.sneakDamage`, {
      ...statContext(attacker?.uuid ?? null),
      attackId: attackMessage.id, dice: sneak.dice, formula, cost, dc: sneak.dc ?? null,
      cunning: chosen.map(r => ({ key: r.key, label: r.activity ?? r.rule.split(" (")[0], line: !r.activity, rule: r.rule }))
    });
    // Spent by dealing damage: the arm consumed (a second Damage press must not ride), the chit written.
    void attackMessage.setFlag(MODULE_ID, "sneak", { ...sneak, rolled: true })
      .catch(err => log.warn(`Could not mark the Sneak Attack rolled.`, err));
    void writeTurnChit(attacker, "sneak", {
      name: "Sneak Attack — used this turn", img: featureNamed(attacker, "Sneak Attack")?.img ?? null,
      description: "Sneak Attack has been dealt this turn. Once per turn; this chit ends with the turn.",
      origin: activity.item?.uuid ?? null
    }).catch(err => log.warn(`Could not write the Sneak Attack chit.`, err));
  } catch(err) {
    log.error(`Sneak Attack dice failed to ride — roll them by hand.`, err);
  }
});

/* --- the effects: the pack's own save activities, at the hit target, after the damage -------- */

/** Same-client latch: the effects run once per damage message. */
const effectsRun = new Set();

// The damage message landing, on its author's client. ⚠ `dnd5e.rollDamage` does not reliably hand over the message.
listen("createChatMessage", "sneak", message => {
  if ( !message.isAuthor ) return;
  const sd = readFlag(message, "sneakDamage");
  if ( !sd || sd.effectsDone || effectsRun.has(message.id) ) return;
  effectsRun.add(message.id);
  void runCunningEffects(message, sd, null);
});

async function runCunningEffects(damageMessage, sd, activity) {
  try {
    const attackMessage = game.messages.get(sd.attackId);
    const attacker = activity?.actor ?? attackMessage?.getAssociatedActor();
    if ( !attackMessage || !attacker ) return;
    const hits = hitTargets(attackMessage);
    const tokens = hits.map(t => tokenOf(t.uuid)).filter(Boolean);
    const stamps = [];
    const useAt = async (item, activity, stamp) => {
      if ( !item || !activity ) return;
      const results = await withTargets(tokens, () => activity.use({}, { configure: false }, {}));
      const card = results?.message;
      if ( card instanceof ChatMessage ) {
        await card.setFlag(MODULE_ID, "cunning", { ...statContext(attacker.uuid), attackId: attackMessage.id,
          // ⚠ `applied` is an ARRAY of uuids: a uuid-keyed map's dotted keys expand into paths on write.
          damageId: damageMessage.id, attackerName: attacker.name, applied: [], ...stamp });
      }
    };
    for ( const pick of (sd.cunning ?? []) ) {
      const row = CUNNING_OPTIONS[pick.key];
      if ( !row?.activity ) continue;           // a line option — the card says it
      const upgrade = row.upgrade && featureNamed(attacker, row.upgrade.feature) ? row.upgrade : null;
      const item = featureNamed(attacker, upgrade ? upgrade.feature : row.feature);
      const act = activityNamed(item, upgrade ? upgrade.activity : row.activity);
      if ( !act ) { stamps.push(`${pick.label}: no activity on the sheet`); continue; }
      // Envenom Weapons' Poison carries no condition: a failure also applies the item's Poisoned effect.
      let effectUuid = null;
      if ( upgrade?.onFail === "poisoned" ) {
        const from = featureNamed(attacker, upgrade.effectFrom ?? row.feature);
        effectUuid = from?.effects?.find(e => e.statuses?.has?.("poisoned"))?.uuid ?? null;
      }
      await useAt(item, act, { key: pick.key, label: pick.label, rule: row.rule,
        ...(upgrade?.onFail ? { onFail: upgrade.onFail, effectUuid, upgradeRule: upgrade.rule } : {}) });
    }
    // Death Strike: on the first round of combat, a save or the damage is doubled. Not an option.
    const deathStrike = featureNamed(attacker, DEATH_STRIKE.feature);
    if ( deathStrike && (activeCombatFor(attacker)?.round === 1) ) {
      const act = activityNamed(deathStrike, DEATH_STRIKE.activity);
      await useAt(deathStrike, act, { key: "deathStrike", label: DEATH_STRIKE.feature, rule: DEATH_STRIKE.rule, onFail: "double" });
    }
    await damageMessage.setFlag(MODULE_ID, "sneakDamage", { ...sd, effectsDone: true, ...(stamps.length ? { notes: stamps } : {}) })
      .catch(() => { /* the latch above holds for this session */ });
  } catch(err) {
    log.error(`Cunning Strike effects failed — use the feature's activity by hand.`, err);
  }
}

/* --- the follow-ups: what a FAILED cunning save applies on top of the activity's own ---------- */

/** Same-client latch per card+target. */
const followups = new Set();

async function settleCunningFollowups(card) {
  const cunning = readFlag(card, "cunning");
  const saves = savesOf(card);
  const verdicts = verdictsOn(saves);
  if ( !cunning?.onFail || !verdicts.length ) return;
  if ( !drivesMomentFor(saves.sourceUuid ?? null) ) return;
  for ( const t of verdicts ) {
    if ( (t.outcome !== "failed") || cunning.applied?.includes?.(t.uuid) ) continue;
    const key = `${card.id}|${t.uuid}`;
    if ( followups.has(key) ) continue;
    followups.add(key);
    try {
      let claimed = false;
      await queueFlagWrite(card, "cunning", current => {
        if ( !Array.isArray(current.applied) ) current.applied = [];
        if ( current.applied.includes(t.uuid) ) return false;
        current.applied.push(t.uuid);
        claimed = true;
      });
      if ( !claimed ) continue;
      const target = [{ uuid: t.uuid, name: t.name }];
      if ( cunning.onFail === "poisoned" ) {
        const effect = cunning.effectUuid ? await resolveUuidAsync(cunning.effectUuid) : null;
        if ( effect ) await applyEffectsWithReceipt(card, [effect], target, { source: statSourceOf(card) });
      } else if ( cunning.onFail === "double" ) {
        const dmg = game.messages.get(cunning.damageId);
        const damages = dmg ? damagePartsOf(dmg.rolls) : [];
        if ( damages.length ) await applyDamagesWithReceipt(card, target, damages, { note: "Death Strike — the attack's damage again" });
      }
    } catch(err) {
      log.error(`Cunning Strike follow-up failed.`, err);
    } finally {
      followups.delete(key);
    }
  }
}

// The follow-up on a failed save: on the answer's write and on reload, never at birth (no verdict yet).
registerResumable("cunning", {
  pending: (flag, _message, cause) => (cause !== "create") && !!flag.onFail,
  drives: (_flag, message) => drivesMomentFor(saveSourceOf(message)),
  drive: settleCunningFollowups
});

/* --- the cards say it (R5) -------------------------------------------------------------------- */

listen("dnd5e.renderChatMessage", "sneak", (message, html) => {
  const sd = readFlag(message, "sneakDamage");
  if ( sd ) {
    const picks = sd.cunning ?? [];
    const line = document.createElement("div");
    line.innerHTML = bfCard({
      eyebrow: "Sneak Attack", tone: sd.formula ? "good" : "neutral",
      title: sd.formula ? `${sd.formula} rode this roll` : `every die of ${sd.dice} forgone`,
      subtitle: picks.length
        ? `${sd.cost}d forgone for ${picks.map(p => p.label).join(" and ")}${sd.dc ? ` — save DC ${sd.dc}` : ""}`
        : `${sd.dice}, no Cunning Strike`,
      lines: [
        ...picks.filter(p => p.line).map(p => ruleLine(p.rule)),
        ...(sd.notes ?? []).map(n => `<span style="opacity:0.8;">${n}</span>`)
      ]
    });
    html.querySelector(SURFACES.messageContent)?.appendChild(line);
  }
  const cunning = readFlag(message, "cunning");
  if ( cunning ) {
    const line = document.createElement("div");
    line.innerHTML = bfCard({
      eyebrow: "Cunning Strike", tone: "neutral",
      title: `${cunning.label} — from ${cunning.attackerName ?? "the rogue"}’s Sneak Attack`,
      lines: [ruleLine(cunning.rule), cunning.upgradeRule ? ruleLine(cunning.upgradeRule) : null]
    });
    html.querySelector(SURFACES.messageContent)?.appendChild(line);
  }
});
