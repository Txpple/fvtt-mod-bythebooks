/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): THE CAST RIDERS (CAST_RIDERS — Wild Magic Surge, Inspiring Smite):
 * what a feature does right after its bearer casts. Read at `dnd5e.postUseActivity` on the casting client.
 * Wild Magic Surge rolls its d20 itself (R1 — "you can roll" has one sensible answer; a bend by choice) once per
 * turn after a Sorcerer spell cast with a slot, and rolls the pack's table on a 20 — or at once when Tides of
 * Chaos was spent, which comes back; the cast card says what happened, the table's card what surged. Inspiring
 * Smite, after Divine Smite, rolls its Temporary Hit Points and asks the paladin whom to share them among, split
 * evenly over the creatures ticked within reach — the rest song's popup (rest-grants.js `askHandOut`), its clock
 * giving all to the paladin (a bend by choice); the Channel Divinity is spent only when something is given.
 */
import { MODULE_ID, readFlag, decisionWindow, queueFlagWrite, resolveUuid, resolveUuidAsync, log } from "./core.js";
import { activityNamed, activityOfType, featureNamed, lower } from "./lookup.js";
import { CAST_RIDERS, castRiderEntries, listedNames, answers } from "./decide/registry.js";
import { castWithSlot, spellClassOf, surgeLine, surgeOutcome } from "./decide/cast-riders.js";
import { riderPartFormula } from "./decide/clock.js";
import { esc } from "./decide/present.js";
import { poolOf, withTargets } from "./shared.js";
import { askHandOut } from "./rest-grants.js";
import { applyItemEffectOnHit } from "./effect-riders.js";
import { tokensInRegions, tokenOf } from "./geometry.js";
import { momentButton, postCard } from "./ui.js";
import { SURFACES } from "./surfaces.js";
import { listen } from "./dispatch.js";

const SURGE_FLAG = "castRider";   // on the cast's usage card — its line

/** The listed rows this caster holds: `[{ name, row, item }]`. */
function ridersOf(actor) {
  const listed = listedNames(castRiderEntries());
  const out = [];
  for ( const [name, row] of Object.entries(CAST_RIDERS) ) {
    if ( !listed.has(lower(name)) ) continue;
    const item = featureNamed(actor, name);
    if ( item ) out.push({ name, row, item });
  }
  return out;
}

/** This combat turn's key, or null out of combat (no once-per-turn limit there). */
function turnKey() {
  const c = game.combat;
  return c?.started ? `${c.id}:${c.round}:${c.turn}` : null;
}

/** Did this caster already roll this row this turn? The cards are the record. */
const rolledThisTurn = (actor, name, key) => !!key && game.messages.contents.some(m => {
  const f = readFlag(m, SURGE_FLAG);
  return (f?.feature === name) && (f.actorUuid === actor.uuid) && (f.turn === key) && (f.d20 || f.tides);
});

listen("dnd5e.postUseActivity", "cast-riders", (activity, usageConfig, results) => {
  try {
    const actor = activity?.actor;
    const item = activity?.item;
    if ( !(actor instanceof Actor) || (item?.type !== "spell") || !actor.isOwner ) return;
    for ( const { name, row, item: feature } of ridersOf(actor) ) {
      if ( row.after && !answers(row.after, item) ) continue;
      if ( row.spellClass ) {
        const slot = castWithSlot({ level: Number(item.system?.level) || 0, method: item.system?.method ?? null,
          spendsSlot: (activity.consumption?.spellSlot !== false) && (usageConfig?.consume?.spellSlot !== false) });
        const cls = spellClassOf({ classIdentifier: item.system?.classIdentifier ?? null, sourceItem: item.system?.sourceItem ?? null,
          casterClasses: Object.keys(actor.classes ?? {}) });
        if ( !slot || (cls !== row.spellClass) ) continue;
        void surge({ name, row, actor, message: results?.message ?? null });
        continue;
      }
      if ( row.handOut ) void inspire({ name, row, feature, actor });
      // C1 — `aura` (Smite of Protection): the ring's members wear the feature's effect until the caster's next turn start.
      if ( row.aura ) void auraEffect({ name, row, feature, actor, message: results?.message ?? null });
      // `use` (Hunter's Rime): the feature's named activity used on the caster right after the cast, no ask (R1).
      if ( row.use ) void useOnSelf({ name, row, feature, actor });
    }
  } catch(err) {
    log.error(`A cast rider could not be read — play it from the sheet.`, err);
  }
});

/* --- WILD MAGIC SURGE ------------------------------------------------------------------------------ */

async function surge({ name, row, actor, message }) {
  try {
    const tides = row.tides ? featureNamed(actor, row.tides) : null;
    const tidesSpent = !!tides && (Number(tides.system?.uses?.max) > 0) && !(Number(tides.system?.uses?.value) > 0);
    const key = turnKey();
    let o = surgeOutcome({ tidesSpent, used: rolledThisTurn(actor, name, key) });
    // D1 — Tamed Surge: its use standing, every such cast offers the pick (the d20's once per turn is the surge's alone).
    const tamed = row.tamed ? featureNamed(actor, row.tamed) : null;
    const tameOptions = (tamed && (Number(tamed.system?.uses?.value ?? 0) > 0)) ? await tableChoices(row.table) : null;
    let d20 = null;
    if ( o.roll ) {
      d20 = (await new Roll("1d20").evaluate()).total;
      o = surgeOutcome({ tidesSpent, used: false, d20, surgeOn: row.surgeOn });
    } else if ( !o.surged && !tameOptions?.length ) return;   // this turn's roll is made: nothing, no line
    let result = null;
    let results = null;
    if ( o.surged ) {
      result = await rollTable(row.table, actor);
      // C1 — `twice` (Controlled Chaos): a second roll of the table; the sorcerer picks one on the card.
      if ( row.twice && featureNamed(actor, row.twice) ) results = [result, await rollTable(row.table, actor)];
    }
    if ( o.tides ) await tides.update({ "system.uses.spent": 0 });
    const record = { feature: name, actorUuid: actor.uuid, turn: key, d20, surged: o.surged, tides: o.tides, result,
      ...(results ? { twice: row.twice, results, chosen: null } : {}),
      ...(tameOptions?.length ? { tamed: { feature: row.tamed, itemId: tamed.id, options: tameOptions, chosen: null } } : {}) };
    if ( message?.isOwner ) await message.setFlag(MODULE_ID, SURGE_FLAG, record);
    else await postCard({ actor, card: `<p>${esc(surgeLine(record))}</p>`,
      flags: { [MODULE_ID]: { [SURGE_FLAG]: record } } });
  } catch(err) {
    log.error(`${name} failed — roll the d20 and the table by hand.`, err);
  }
}

/** D1 — Tamed Surge's choices: every row of the table but the LAST (the rule's exception), each its text, trimmed. */
async function tableChoices(uuid) {
  const table = uuid ? await resolveUuidAsync(uuid) : null;
  const rows = [...(table?.results ?? [])].sort((a, b) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0));
  return rows.slice(0, -1).map(r => resultText(r)).filter(Boolean);
}

/** A table result's words, the inline rolls kept as their formula. */
function resultText(r) {
  const text = String(r?.description || r?.name || r?.text || "").replace(/<[^>]*>/g, " ")
    .replace(/\[\[\/r\s*([^\]]+)\]\]/g, "$1").replace(/\s+/g, " ").trim();
  return text ? (text.length > 140 ? `${text.slice(0, 137)}…` : text) : null;
}

/** The pack's table rolled (never marked drawn — a compendium table is not written) and posted; its text back. */
async function rollTable(uuid, actor) {
  const table = uuid ? await resolveUuidAsync(uuid) : null;
  if ( !table ) { log.warn(`The Wild Magic Surge table (${uuid}) is not on this box — roll it by hand.`); return null; }
  const { roll, results } = await table.roll();
  await table.toMessage(results, { roll, messageData: { speaker: ChatMessage.getSpeaker({ actor }) } });
  return resultText(results?.[0]);
}

listen("dnd5e.renderChatMessage", "cast-riders", (message, html) => {
  try {
    const r = readFlag(message, SURGE_FLAG);
    if ( !r ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-surge-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-surge-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = `<i class="fa-solid fa-wand-sparkles" data-tooltip="${esc(r.feature)}"></i> ${esc(surgeLine(r))}`;
    // C1 — `twice` (Controlled Chaos): the two results, a button each; the pick is the sorcerer's, recorded on the card.
    if ( r.results?.length ) {
      const pick = document.createElement("div");
      pick.style.cssText = "display:flex;gap:0.35rem;align-items:center;margin-top:0.25rem;flex-wrap:wrap;";
      if ( r.chosen ) pick.textContent = `${r.twice} — chosen: ${r.chosen}`;
      else {
        pick.append(`${r.twice} — pick one:`);
        const actor = resolveUuid(r.actorUuid);
        if ( actor?.isOwner ) for ( const text of r.results ) pick.appendChild(momentButton(text ?? "(the table's text)", () => void chooseSurge(message, text)));
      }
      div.appendChild(pick);
    }
    // D1 — Tamed Surge: the pick from the table (every row but the last), the feature's use spent with it.
    if ( r.tamed?.options?.length ) {
      const tame = document.createElement("div");
      tame.style.cssText = "display:flex;gap:0.35rem;align-items:center;margin-top:0.25rem;flex-wrap:wrap;";
      if ( r.tamed.chosen ) tame.textContent = `${r.tamed.feature} — chosen: ${r.tamed.chosen}`;
      else {
        const actor = resolveUuid(r.actorUuid);
        if ( actor?.isOwner ) {
          tame.append(`${r.tamed.feature} — choose an effect instead (1 use):`);
          const select = document.createElement("select");
          select.dataset.bfTamedSurge = "1";
          select.style.cssText = "max-width:100%;";
          for ( const text of r.tamed.options ) {
            const option = document.createElement("option");
            option.value = text;
            option.textContent = text;
            select.appendChild(option);
          }
          tame.appendChild(select);
          tame.appendChild(momentButton("Choose", () => void chooseTamed(message, select.value)));
        }
      }
      div.appendChild(tame);
    }
    content.appendChild(div);
  } catch(err) { log.warn(`The surge line could not render.`, err); }
});

/** The Controlled Chaos pick, on the caster's own card (the caster rolled it — the caster may write it). */
async function chooseSurge(message, text) {
  if ( !message.canUserModify?.(game.user, "update") ) return;
  await queueFlagWrite(message, SURGE_FLAG, current => {
    if ( current.chosen || !current.results?.includes(text) ) return false;
    current.chosen = text;
  });
}

/** D1 — the Tamed Surge pick: the feature's use spent, the choice recorded on the caster's card and posted. */
async function chooseTamed(message, text) {
  if ( !message.canUserModify?.(game.user, "update") ) return;
  const r = readFlag(message, SURGE_FLAG);
  const actor = resolveUuid(r?.actorUuid);
  const item = actor?.items?.get(r?.tamed?.itemId ?? "");
  if ( !r?.tamed || r.tamed.chosen || !r.tamed.options?.includes(text) || !item ) return;
  if ( !(Number(item.system?.uses?.value ?? 0) > 0) ) { ui.notifications?.warn(`${item.name}: no use left.`); return; }
  let won = false;
  await queueFlagWrite(message, SURGE_FLAG, current => {
    if ( !current.tamed || current.tamed.chosen ) return false;
    current.tamed.chosen = text;
    won = true;
  });
  if ( !won ) return;
  await item.update({ "system.uses.spent": (Number(item.system?.uses?.spent) || 0) + 1 });
  await postCard({ actor,
    card: `<p><strong>${esc(r.tamed.feature)}</strong> — ${esc(text)}</p>` });
}

/* --- C1 — SMITE OF PROTECTION: the aura's members wear the effect until the caster's next turn start ---------- */

/** The tokens inside the caster's own `aura` rings (the module's feature regions keyed by the aura's name), the caster too. */
function auraMembersOf(actor, auraKey) {
  const tok = tokenOf(actor);
  const scene = tok?.scene ?? tok?.document?.parent ?? null;
  if ( !tok || !scene ) return [];
  const regions = scene.regions.filter(r => {
    const f = readFlag(r, "emanation");
    return (f?.kind === "feature") && (lower(f.key) === lower(auraKey)) && (f.tokenId === tok.id);
  });
  const ids = new Set((tokensInRegions(regions) ?? []).map(e => e.tokenId));
  ids.add(tok.id);
  const out = [];
  for ( const id of ids ) {
    const t = scene.tokens.get(id);
    if ( t?.actor ) out.push({ uuid: t.actor.uuid, name: t.name ?? t.actor.name, disposition: t.disposition });
  }
  return out.filter(m => m.disposition === tok.document.disposition);
}

async function auraEffect({ name, row, feature, actor, message }) {
  try {
    const members = auraMembersOf(actor, row.aura);
    if ( !members.length || !(message instanceof ChatMessage) ) return;
    await applyItemEffectOnHit(message, feature, { name: row.effect, from: row.effect, id: "bfSmiteOfProt000" }, members,
      { clock: row.clock ?? null, attacker: actor });
    await message.setFlag(MODULE_ID, "auraRider", { feature: name, actorUuid: actor.uuid, aura: row.aura, effect: row.effect,
      members: members.map(m => m.name) }).catch(() => {});
  } catch(err) {
    log.error(`${name} could not land on the aura — apply its effect by hand.`, err);
  }
}

listen("dnd5e.renderChatMessage", "cast-riders", (message, html) => {
  try {
    const r = readFlag(message, "auraRider");
    if ( !r?.aura ) return;
    const content = html.querySelector?.(SURFACES.messageContent) ?? html;
    if ( !content || content.querySelector(".bf-cast-rider-line") ) return;
    const div = document.createElement("div");
    div.className = "bf-cast-rider-line";
    div.style.cssText = "margin:0.25rem 0;font-size:var(--font-size-11,11px);opacity:0.85;";
    div.innerHTML = `<i class="fa-solid fa-shield-halved" data-tooltip="${esc(r.feature)}"></i> ${esc(`${r.feature} — ${r.effect} (Half Cover) on ${r.members.join(", ")} until the start of your next turn`)}`;
    content.appendChild(div);
  } catch(err) { log.warn(`The cast rider's line could not render.`, err); }
});

/* --- INSPIRING SMITE ------------------------------------------------------------------------------- */

/** `use`: the feature's activity of that name, used on the caster itself (its own token targeted) — Hunter's Rime's heal and mark. */
async function useOnSelf({ name, row, feature, actor }) {
  try {
    const activity = activityNamed(feature, row.use);
    if ( !activity ) { log.warn(`${name}: no "${row.use}" on the sheet — use it by hand.`); return; }
    const token = tokenOf(actor);
    await withTargets(token ? [token] : [], () => activity.use({}, { configure: false }, {}));
  } catch(err) {
    log.error(`${name} could not be used — use it from the sheet.`, err);
  }
}

async function inspire({ name, row, feature, actor }) {
  try {
    const activity = row.activity ? activityNamed(feature, row.activity) : activityOfType(feature, "heal");
    const pool = activity ? poolOf(actor, activity) : null;
    if ( !activity || !pool || !(Number(pool.system?.uses?.value ?? 0) > 0) ) return;   // no Channel Divinity: nothing to offer
    const h = activity.healing;
    const raw = h ? riderPartFormula({ number: h.number, denomination: h.denomination, custom: h.custom, bonus: h.bonus }) : null;
    if ( !raw ) { log.warn(`${name}: no healing part on its activity — give it by hand.`); return; }
    const roll = await new Roll(raw, activity.getRollData?.() ?? actor.getRollData()).evaluate();
    if ( !(roll.total > 0) ) return;
    const window = decisionWindow();
    await askHandOut(actor, { name, row, item: feature, amount: roll.total, roll, table: "cast", distribute: true,
      cost: { itemId: pool.id, name: pool.name }, window });
  } catch(err) {
    log.error(`${name} could not be asked — give it by hand.`, err);
  }
}
