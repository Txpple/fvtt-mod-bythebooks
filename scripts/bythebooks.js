/**
 * By the Books — the only esmodules entry: it imports every machine, and nothing else. The chat log
 * is the state and the bus, no sockets, no patching (ARCHITECTURE.md §4; platform facts NOTES §2).
 *
 * Import order is EVALUATION order, nothing more: hooks run in dispatch.js's ORDER whatever this
 * list says. What evaluation order still fixes is the eval-time registries — the damage offer's
 * parts (`registerOfferPart`), the rescue window's slices (`registerRescue`), the damage claims
 * and the withholds — each in the order its files are evaluated (ARCHITECTURE.md §7).
 */

import "./core.js";
// migrate.js early: it sets the dispatcher's coexistence gate (passive while the old package runs).
import "./migrate.js";
import "./settings.js";
import "./rule-text.js";
import "./shared.js";
import "./holds.js";
import "./events.js";
import "./polish.js";
import "./auto-damage.js";
import "./hold/index.js";
import "./ui.js";
import "./hit-riders.js";
import "./auto-apply.js";
import "./effect-riders.js";
import "./mastery.js";
import "./mastery-record.js";
import "./summons.js";
import "./summon-art.js";
import "./transforms.js";
import "./topple.js";
import "./chip-spend.js";
import "./wards.js";
import "./reminders.js";
import "./advantage-buys.js";
import "./rest-grants.js";
import "./drop-to-one.js";
// sneak.js after reminders.js: its offer part reads the gate's arm, and its lines sit under the gate's.
import "./sneak.js";
import "./clock-riders.js";
import "./damage-shields.js";
import "./damage-casts.js";
import "./hit-menu.js";
import "./superiority-uses.js";
import "./use-chips.js";
import "./help.js";
import "./metamagic.js";
import "./dice-changers.js";
import "./heal-rerolls.js";
import "./unarmed-dice.js";
import "./damage-rules.js";
import "./ward-pools.js";
import "./kit-tend.js";
import "./initiative-swap.js";
import "./initiative-grants.js";
import "./cast-riders.js";
import "./stored-dice.js";
// precision.js before d20-folds.js: its rescue slice sits above the d20 fold's in the one window.
import "./precision.js";
import "./riposte.js";
import "./hew.js";
import "./bash-offer.js";
import "./command.js";
import "./rebukes.js";
import "./mishaps.js";
import "./damage-shares.js";
import "./heal-on-hit.js";
import "./drains.js";
import "./damage-holds.js";
import "./d20-folds.js";
import "./bystanders.js";
import "./concentration.js";
import "./cast.js";
import "./volleys.js";
import "./saves/index.js";
import "./prismatic.js";
import "./emanations.js";
import "./repeat-saves.js";
import "./turn-grants.js";
import "./death-saves.js";
import "./token-lights.js";
import "./gear-lights.js";
import "./receipts.js";
import "./resources.js";
import "./stats.js";
import "./effect-view.js";
