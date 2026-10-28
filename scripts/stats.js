/**
 * By the Books — MACHINE layer: the data plane's stamps for the stats reader (ARCHITECTURE *The data
 * plane*): `rollCtx` on every d20 test, and a GM-whispered `combatRoster` card per combat.
 * ⚠ The roster is STATIC — a snapshot and a closing round, never clock ownership.
 * ⚠ Ungated by design (a toggle would punch holes in the ledger).
 */
import { MODULE_ID, readFlag, TITLE, isActiveGM, statContext, gmIds, log } from "./core.js";
import { bfCard, esc, rosterSide } from "./decide/present.js";
// Safe: shared.js registers no hooks and evaluates first.
import { statSourceOf } from "./shared.js";
import { listen } from "./dispatch.js";
import { postCard } from "./ui.js";

/** The dispatched names (pinned in tools/dnd5e-hooks.json); one roll can fire several. */
const D20_TEST_HOOKS = [
  "dnd5e.rollAttack",
  "dnd5e.rollSavingThrow",
  "dnd5e.rollAbilityCheck",
  "dnd5e.rollSkill",
  "dnd5e.rollToolCheck",
  "dnd5e.rollDeathSave",
  "dnd5e.rollConcentration"
];

for ( const hook of D20_TEST_HOOKS ) {
  listen(hook, "stats", (rolls, ctx) => {
    try {
      const subject = ctx?.subject;
      const actor = (subject instanceof Actor) ? subject : (subject?.actor ?? null);
      const message = rolls?.[0]?.parent;
      if ( !(message instanceof ChatMessage) ) return;
      if ( readFlag(message, "rollCtx") ) return;   // first stamp wins
      // ⚠ The MESSAGE's actor leads: the hook's subject is the WORLD actor, not the unlinked token.
      void message.setFlag(MODULE_ID, "rollCtx", statContext(statSourceOf(message) ?? actor?.uuid ?? null))
        .catch(err => log.error(`rollCtx stamp failed (${hook}).`, err));
    } catch(err) {
      log.error(`rollCtx stamp failed (${hook}).`, err);
    }
  });
}

// combatRoster: stamped at start, closed at deletion, the elder twin wins.
const rosterMessageFor = combatId => game.messages.contents.findLast(
  m => readFlag(m, "combatRoster")?.combatId === combatId);

listen("combatStart", "stats", combat => {
  if ( !isActiveGM() ) return;
  void stampRoster(combat);
});

async function stampRoster(combat) {
  try {
    if ( rosterMessageFor(combat.id) ) return;
    // ⚠ A tracker-made encounter has no scene: the first combatant's, else the active one.
    const scene = combat.scene
      ?? game.scenes.get(combat.combatants.contents.find(c => c.sceneId)?.sceneId ?? "")
      ?? game.scenes.active ?? null;
    const combatants = combat.combatants.contents
      .slice()
      .sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity))
      .map(c => ({
        // The token-synthetic uuid: the identity every other stamp uses.
        actorUuid: c.token?.actor?.uuid ?? c.actor?.uuid ?? null,
        tokenId: c.tokenId ?? null,
        name: c.name,
        initiative: c.initiative ?? null,
        isPC: c.actor?.type === "character",
        // the side the line tags: the token's, not the actor type (a familiar is an NPC on the party's side)
        disposition: c.token?.disposition ?? null
      }));
    const order = combatants.map(c =>
      `${(c.initiative ?? "—")} · ${c.name}${rosterSide(c)}`);
    await postCard({
      to: gmIds(),
      alias: TITLE,
      card: bfCard({
        eyebrow: "Combat",
        title: scene?.name ?? "The field",
        subtitle: `${combatants.length} combatants`,
        lines: [`⚔ Begins on ${esc(scene?.name ?? "the field")}`, ...order],
        tone: "neutral"
      }),
      flags: { [MODULE_ID]: { combatRoster: {
        combatId: combat.id,
        sceneId: scene?.id ?? null,
        sceneName: scene?.name ?? null,
        startedAt: Date.now(),
        combatants,
        ...statContext(null)
      } } }
    });
  } catch(err) {
    log.error(`Combat roster stamp failed.`, err);
  }
}

// Two same-account GM sessions both stamp; provenance plus elder-wins makes it one.
listen("createChatMessage", "stats", message => {
  if ( !isActiveGM() ) return;
  const flag = readFlag(message, "combatRoster");
  if ( !flag?.combatId ) return;
  const elder = game.messages.contents.some(m => {
    if ( m.id === message.id ) return false;
    if ( readFlag(m, "combatRoster")?.combatId !== flag.combatId ) return false;
    return (m.timestamp < message.timestamp)
      || ((m.timestamp === message.timestamp) && (m.id < message.id));
  });
  if ( elder ) message.delete().catch(() => { /* the other twin got there first */ });
});

// Deletion is when the final round is known. Best-effort.
listen("deleteCombat", "stats", combat => {
  if ( !isActiveGM() ) return;
  void closeRoster(combat);
});

async function closeRoster(combat) {
  try {
    const message = rosterMessageFor(combat.id);
    const flag = foundry.utils.deepClone(readFlag(message, "combatRoster") ?? null);
    if ( !flag || (flag.endedRound != null) ) return;
    flag.endedRound = combat.round;
    flag.endedAt = Date.now();
    // Content and flag in ONE update: one re-render.
    const scene = flag.sceneName ?? "the field";
    const order = (flag.combatants ?? []).map(c =>
      `${(c.initiative ?? "—")} · ${c.name}${rosterSide(c)}`);
    await message.update({
      content: bfCard({
        eyebrow: "Combat",
        title: flag.sceneName ?? "The field",
        subtitle: `${(flag.combatants ?? []).length} combatants`,
        lines: [`⚔ Begins on ${scene}`, ...order, `🕊 Ends on ${scene} — round ${flag.endedRound}`],
        tone: "neutral"
      }),
      [`flags.${MODULE_ID}.combatRoster`]: flag
    });
  } catch(err) {
    log.error(`Combat roster close failed.`, err);
  }
}
