/**
 * By the Books — the twelve settings (ARCHITECTURE §8): nine world configs for the DM, three per-client
 * preferences, none of them a house rule (the table's house rules live in Open Roll 5e: House Rules); and one
 * table kept out of the list, the summon art, edited in its own window (summon-art.js). Everything else is the
 * module itself and always on. Two of the nine own dnd5e's Visibility menu, so a fresh world plays with the
 * results on the table (issue #4).
 */
import { MODULE_ID, S, isActiveGM, setting, log } from "./core.js";
import { ROLL_RESULTS, bloodiedFor, visibilityWrites } from "./decide/visibility.js";
import { KIND_SETS, interruptEntries, blockEntries, maneuverFoldEntries, d20FoldEntries,
  riderEntries, riderUpgradeEntries } from "./decide/registry.js";
import { listen, listenOnce, isPassive } from "./dispatch.js";

/**
 * Put dnd5e's Visibility keys where the two settings say. The active GM only (players cannot write
 * world settings), and only a key that differs, so neither a load nor an onChange loops.
 */
async function syncVisibility() {
  if ( isPassive() ) return;   // the old package still runs and owns dnd5e's keys (scripts/dispatch.js)
  if ( !isActiveGM() ) return;
  const want = { ...ROLL_RESULTS[setting(S.rollResults)] ?? {}, ...bloodiedFor(setting(S.bloodiedAll)) };
  const have = {};
  for ( const key of Object.keys(want) ) {
    if ( game.settings.settings.has(`dnd5e.${key}`) ) have[key] = game.settings.get("dnd5e", key);
    else log.warn(`dnd5e has no ${key} setting; its visibility is left alone.`);
  }
  // All at once, not one after another: on a GM load a world-setting write takes seconds to settle
  // while the client is still busy, and three in a row left keys queued long after ready (issue #5).
  await Promise.all(visibilityWrites(want, have).map(([key, value]) =>
    game.settings.set("dnd5e", key, value)
      .catch(err => log.warn(`Could not set dnd5e's ${key}.`, err))));
}

listenOnce("ready", "settings", syncVisibility);
// ⚠ At `ready` the joining user is not always flagged active yet, so `activeGM` can miss this client:
// the sync runs again when this client's own activity lands (seen on prod).
listen("userConnected", "settings", (user, active) => { if ( active && user.isSelf ) void syncVisibility(); });

// THE RETIRED SETTING: Going Down Costs a Level of Exhaustion (`goingDownCosts`, the one house rule this module ever
// carried) lives in Open Roll 5e: House Rules, its `goingDown`, on by default there. The first active GM load after the
// upgrade removes the old setting's world document, so nothing stale remains, and warns once when the rule was on and
// House Rules is not running, so the table knows where its rule went. Runs on the same two triggers as the sync above.
const RETIRED_GOING_DOWN = `${MODULE_ID}.goingDownCosts`;
const HOUSE_RULES_ID = "fvtt-mod-houserules";
let retiring = false;
async function retireGoingDown() {
  if ( retiring || !isActiveGM() ) return;
  retiring = true;
  try {
    const doc = game.settings.storage.get("world")?.getSetting?.(RETIRED_GOING_DOWN) ?? null;
    if ( !doc ) return;
    let wasOn = false;
    try { wasOn = JSON.parse(doc.value) === true; } catch { wasOn = false; }
    if ( wasOn && (game.modules.get(HOUSE_RULES_ID)?.active !== true) ) {
      ui.notifications.warn("By the Books: Going Down Costs a Level of Exhaustion now lives in Open Roll 5e: House Rules, which this world does not run — install it to keep the rule.", { permanent: true });
    }
    await doc.delete();
    log.info(`Retired setting goingDownCosts removed (it was ${wasOn ? "on" : "off"}); the rule lives in House Rules.`);
  } catch(err) {
    log.warn("Could not remove the retired goingDownCosts setting.", err);
  } finally {
    retiring = false;
  }
}
listenOnce("ready", "settings", () => void retireGoingDown());
listen("userConnected", "settings", (user, active) => { if ( active && user.isSelf ) void retireGoingDown(); });

listenOnce("init", "settings", () => {
  game.settings.register(MODULE_ID, S.decisionTimer, {
    name: "Decision Timer Seconds",
    hint: "How long every question the module asks waits for its answer: a reaction to a hit, an offered damage roll, a save or concentration check, a mastery or maneuver offer, a reminder. 0 waits indefinitely. A mandatory roll ROLLS when it runs out; an optional offer PASSES. A draining bar shows the time left on the popup and the card.",
    scope: "world", config: true, type: Number, default: 24,
    range: { min: 0, max: 60, step: 1 }
  });

  game.settings.register(MODULE_ID, S.dramaticBeat, {
    name: "Dramatic Beat Before Damage",
    hint: "Seconds between the hit reveal and the damage dice hitting the table. 0 rolls immediately.",
    scope: "world", config: true, type: Number, default: 0,
    range: { min: 0, max: 10, step: 0.5 }
  });

  game.settings.register(MODULE_ID, S.saveRolls, {
    name: "Players Roll Their Own Saves",
    hint: "\"Prompt\": a saving throw the module demands, and a concentration check, pops up for whoever owns the creature, with the native dialog's controls and one button: Roll. \"Roll automatically\": no popup; the dice roll at once. Either way the dice land on the owning player's client when one is connected, the GM's otherwise.",
    scope: "world", config: true, type: String, default: "prompt",
    choices: { prompt: "Prompt to roll", auto: "Roll automatically" }
  });

  game.settings.register(MODULE_ID, S.concVisibility, {
    name: "Concentration Checks Are Public",
    hint: "On: the check and the roll play out in the open. Off: whispered to the concentrator's owners and the GM. A BROKEN concentration is announced publicly either way: the effects it ends vanish from the whole table.",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MODULE_ID, S.holdReveal, {
    name: "Hold Shows the Math",
    hint: "On: a held reaction shows the attack total against the AC, and whether the reaction would turn it into a miss; a reaction that cannot change the outcome is never offered. Off (RAW): the player is told only that they were hit, and reacts on faith.",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MODULE_ID, S.masteryAsk, {
    name: "Optional Masteries",
    hint: "\"Ask\" puts the optional masteries (Slow, Topple, Push, Graze) to the attacking player as a Use/Pass popup. \"Take them automatically\" takes them without asking. Vex and Sap never ask; the rules make them automatic.",
    scope: "world", config: true, type: String, default: "ask",
    choices: { ask: "Ask the attacker", auto: "Take them automatically" }
  });

  game.settings.register(MODULE_ID, S.resourceNotices, {
    name: "Resource Use Notices",
    hint: "When a player character spends a limited-use ability (Second Wind, a superiority die, Channel Divinity, a magic item's daily cast), a notice flashes on every screen: who used what, and how many uses remain. The usage card keeps the same line. Expendables with no recovery and spell slots stay quiet; NPC abilities never announce.",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MODULE_ID, S.rollResults, {
    name: "Roll Results Players See",
    hint: "What the public attack and save cards show players: hit or miss and the target's AC, success or failure and the DC. This overrides dnd5e's Visibility settings; choose \"Leave it to dnd5e\" to manage them there yourself. Hold Shows the Math is separate: a player offered a reaction still sees the number to beat on the popup.",
    scope: "world", config: true, type: String, default: "open",
    choices: {
      open: "Open roll: results, AC and DC",
      results: "Results only (hide AC and DC)",
      hidden: "Hide all",
      dnd5e: "Leave it to dnd5e"
    },
    onChange: syncVisibility
  });

  game.settings.register(MODULE_ID, S.bloodiedAll, {
    name: "Bloodied Shows on Every Token",
    hint: "On: the Bloodied marker shows on every token, enemies included, since abilities trigger on it. Off: friendly tokens only, dnd5e's own default. This overrides dnd5e's Visibility settings. The automation reads Hit Points either way.",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: syncVisibility
  });

  // ⚠ Per-CLIENT and ON by default, or every new login starts wrong. Covers all three damage paths.
  game.settings.register(MODULE_ID, S.playerRollDamage, {
    name: "Roll Your Own Damage",
    hint: "Ask before rolling YOUR damage, instead of the automation rolling it for you: a popup with one button and a timer, on your client alone. It covers an attack that hits, a save spell, and an area. The dice roll exactly as the automation would have rolled them, and the timer rolls for you if you miss the window. Your client only.",
    scope: "client", config: true, type: Boolean, default: true
  });

  game.settings.register(MODULE_ID, S.effectBar, {
    name: "Effect Bar",
    hint: "A strip above the hotbar listing the buffs and debuffs on the token you control (or your own character): every temporary effect on the sheet, including the ones that paint no icon on the token. Your client only.",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => Hooks.callAll(`${MODULE_ID}.effectViewChanged`)
  });

  game.settings.register(MODULE_ID, S.effectHover, {
    name: "Effect Cards on Hover and Alt",
    hint: "Point at any token to see its buffs and debuffs beside it; hold Alt (Foundry's highlight key) to see every creature's list at once. Your client only.",
    scope: "client", config: true, type: Boolean, default: true
  });

  // Not in the list: the Summon Art window (summon-art.js) is its one editor, behind a button.
  game.settings.register(MODULE_ID, S.summonArt, {
    name: "Summon Art",
    hint: "A token and a portrait per summoned creature, by spell then creature name.",
    scope: "world", config: false, type: Object, default: {}
  });
  game.settings.register(MODULE_ID, S.formArt, {
    name: "Wild Shape Art",
    hint: "A token and a portrait per Wild Shape form, by beast name.",
    scope: "world", config: false, type: Object, default: {}
  });

  // Registries READ-ONLY for the suites (ARCHITECTURE §6), as live readers. ⚠ `volleyRegistry` is
  // absent on purpose: the suites mutate it, and volley-registry.js exposes it.
  const mod = game.modules.get(MODULE_ID);
  if ( mod ) mod.api = Object.assign(mod.api ?? {}, { registries: Object.freeze({
    kindSets: KIND_SETS,
    interrupt: interruptEntries,
    block: blockEntries,
    maneuverFolds: maneuverFoldEntries,
    d20Folds: d20FoldEntries,
    rider: riderEntries,
    riderUpgrade: riderUpgradeEntries
  }) });
});
