// Static layer-integrity check (no Foundry, milliseconds): ARCHITECTURE.md §7's dependency rule,
// "depend downward only", with every edge that does not PINNED here with a reason. The rule is
// "no UNNOTICED cross-layer edges": a new one fails until somebody writes down why.
// ⚠ A stale pin (a row whose edge is gone) fails too. ⚠ Same-layer edges are treated as
// upward: legal only when pinned.
//
//   node tools/check-layers.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, normalize, relative, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPTS = join(ROOT, "scripts");

/* ---------------------------------------------------------------------------------------------
 * The layer map (ARCHITECTURE.md §2, §7): an edge is legal when it points at a STRICTLY smaller depth.
 * `services` are the consequence chokepoints every machine routes through (apply damage / effects
 * with a receipt, offer and roll damage): they own no moment and no feature, so machine → service
 * is downward.
 * ------------------------------------------------------------------------------------------- */

export const DEPTH = { core: 0, decision: 1, registry: 2, spine: 3, services: 4, machines: 5, entry: 6 };

export const LAYER_OF = {
  // the one esmodules entry — imports its siblings in a deliberate order (§7)
  "bythebooks.js": "entry",

  // MACHINES — one feature each: a trigger, its views, its resolver
  // hold/: one machine as a directory, a DAG, index.js the only face (GROUPS below).
  "hold/index.js": "machines",
  "hold/lookup.js": "machines",
  "hold/clock.js": "machines",
  "hold/trigger.js": "machines",
  "hold/spell-hold.js": "machines",
  "hold/dice.js": "machines",   // a bent roll's d20s rise over the creature hit
  "hold/answer.js": "machines",
  "hold/continue.js": "machines",
  "hold/spell-damage.js": "machines",
  "hold/views.js": "machines",
  // saves/: one machine as a directory, index.js its only face (GROUPS below).
  "saves/index.js": "machines",
  "saves/demand.js": "machines",
  "saves/areas.js": "machines",
  "saves/ask.js": "machines",
  "saves/verdict.js": "machines",
  "saves/consequences.js": "machines",
  "saves/choices.js": "machines",
  "saves/views.js": "machines",
  "mastery.js": "machines",
  "mastery-record.js": "machines", // the Weapon Mastery paperwork — the fill, the line, the swap, the party view (issue #3)
  "summon-art.js": "machines",     // the Summon Art window — a table's own token and portrait per summoned creature, behind a settings button (issue #1)
  "summons.js": "machines",        // summons — the one popup off the cast card, the placement, the elect's landing, Dismiss (issue #1)
  "transforms.js": "machines",     // Wild Shape and the polymorph spells — the chooser switched off, the one popup, the elect's transform, the form's end, the Long Rest swap (issue #2)
  "topple.js": "machines",        // the Topple demand off mastery's card
  "chip-spend.js": "machines",    // the chip spend and the two tidies
  // the maneuver folds, one file per moment
  "precision.js": "machines",
  "riposte.js": "machines",
  "bystanders.js": "machines",    // a bystander's bend on another creature's save or check (Q2 option A) — the attack side is hold/'s
  "damage-holds.js": "machines",  // a reduction "when you take damage" held at the applier's claim — Stone's Endurance on any damage
  "mishaps.js": "machines",       // RAVENLOFT — a dark gift's save after a 1 on any D20 Test (Warping Flesh, Incessant Watchers)
  "rebukes.js": "machines",       // a Reaction to damage, aimed at its dealer — Riposte's shape on the damage
  "damage-shares.js": "machines", // a bond's caster takes what its bearer takes — Warding Bond
  "heal-on-hit.js": "machines",   // a spell's landed damage heals its caster a share — Vampiric Touch
  "drains.js": "machines",        // a monster's landed damage lowers the target's maximum or a score — Life Drain
  "prismatic.js": "machines",     // a cone's die per creature picks its ray — Prismatic Spray
  "hew.js": "machines",
  "bash-offer.js": "machines",
  "effect-view.js": "machines",   // the effect view — a creature's buffs and debuffs on hover, on a held key, on a bar
  "command.js": "machines",
  "concentration.js": "machines",
  "volleys.js": "machines",
  "cast.js": "machines",
  "hit-riders.js": "machines",
  "d20-folds.js": "machines",
  "receipts.js": "machines",
  "reminders.js": "machines",
  "advantage-buys.js": "machines",
  "rest-grants.js": "machines",
  "initiative-swap.js": "machines", // Alert's swap once Initiative is rolled
  "stored-dice.js": "machines",     // Portent: the rest's dice, the chip, the own roll's tick before the roll
  "cast-riders.js": "machines",     // what a feature does right after its bearer casts (Wild Magic Surge, Inspiring Smite)
  "initiative-grants.js": "machines", // what a feature gives back as its owner's Initiative lands (Persistent Rage, Uncanny Metabolism)
  "heal-rerolls.js": "machines",    // Healer's 1s on a healing roll
  "kit-tend.js": "machines",        // Healer's Battle Medic on the kit's use
  "unarmed-dice.js": "machines",    // Tavern Brawler's die on the plain Unarmed Strike
  "damage-rules.js": "machines", // the fighting styles' faces, gates and damage numbers
  "ward-pools.js": "machines",      // the ward pools (Arcane Ward): the take at preApplyDamage, the cast's refill
  "drop-to-one.js": "machines",      // Relentless Endurance and Death Ward at a drop to 0
  "sneak.js": "machines",
  "clock-riders.js": "machines",
  "use-chips.js": "machines",
  "help.js": "machines",        // the Help action: the item's use, the assist asked, the one effect landed
  "metamagic.js": "machines",   // the Sorcerer's options in the cast dialog, the points on the card
  "dice-changers.js": "machines",   // the dice changers' one popup per damage roll — Empowered Spell, Savage Attacker, Piercer
  "emanations.js": "machines",
  "repeat-saves.js": "machines",   // a landed effect's save repeated — the bearer's turn end, damage, its own action
  "turn-grants.js": "machines",    // a landed effect's turn-start grant rolled again — Heroism's temp HP
  "death-saves.js": "machines",    // the Death Saving Throw asked at a dying creature's turn start; damage at 0 Hit Points a failure
  "wards.js": "machines",          // a standing ward makes whoever targets its bearer save first — Sanctuary
  "gear-lights.js": "machines",    // using a light-source item toggles its light on the bearer — Torch, Lantern
  "token-lights.js": "machines",   // a use that sheds light carries it on an effect — Inner Radiance, Light
  "hit-menu.js": "machines",
  "damage-shields.js": "machines",
  "damage-casts.js": "machines",
  "superiority-uses.js": "machines",
  "polish.js": "machines",
  "resources.js": "machines",
  "stats.js": "machines",
  "migrate.js": "machines",        // the rename's migration (3.0.0): the legacy scope moved, the old behaviours retyped, the settings copied; the coexistence gate's question

  // SERVICES — the consequence chokepoints every machine routes through
  "area-ask.js": "services",   // the ask at the area — one question two machines route through (metamagic, saves)
  "auto-apply.js": "services",
  "effect-riders.js": "services",
  "gallery.js": "services",        // the shared creature picker — the pool off the packs, the ruled-C rows, the placement preview (issues #1, #2)
  "auto-damage.js": "services",

  // SPINE — how a moment is presented, and the shared EDGE readers
  "ui.js": "spine",
  "shared.js": "spine",
  "ledger.js": "spine",     // the landing ledger — a landing's writes as steps, each made once over a re-drive (issue #22)
  "geometry.js": "spine",
  "settings.js": "spine",
  "holds.js": "spine",     // the hold registry — what other modules ask before they play
  "dice-rise.js": "spine", // the dice that rise over a token — one renderer, every rule that changes dice
  "events.js": "spine",    // the moment events — what the module publishes at a resolve
  "lookup.js": "spine",      // the sheet and document readers
  "rule-text.js": "spine",   // the rule text, read from the book (RULINGS *The rule fold reads the book*)

  // REGISTRY — which content participates, in what way
  "volley-registry.js": "registry",

  // DECISION — pure functions over plain data. ZERO imports, asserted below.
  "decide/drains.js": "decision",
  "decide/geometry.js": "decision",
  "decide/cover.js": "decision",        // measured cover: the 2024 DMG's corner lines, counted
  "decide/metamagic.js": "decision",
  "decide/dice-changers.js": "decision",
  "decide/area-ask.js": "decision",
  "decide/rescue-hit.js": "decision",    // the `roll` interrupt's arithmetic and rows
  "decide/damage-dice.js": "decision",   // the damage-dice folds' patch — Empowered per die, Savage per set
  "decide/dice-chips.js": "decision",   // a roll as the chips dice-rise.js draws; the record a roll message carries
  "decide/damage-rules.js": "decision",   // the fighting styles' holding, gates and floor count
  "decide/stored-dice.js": "decision",      // a stored face's outcome, which faces turn a verdict, the chip's name
  "decide/cast-riders.js": "decision",      // whose spell, a slot cast, the surge's outcome and line, a divided hand-out
  "decide/initiative-grants.js": "decision", // the Initiative grant due, its card line
  "decide/ward-pools.js": "decision",        // the ward's take, the HP split after it, the refill
  "decide/visibility.js": "decision",       // the two Visibility settings: a choice and the dnd5e keys it writes
  "decide/registry.js": "decision",
  "decide/verdict.js": "decision",
  "decide/eligible.js": "decision",
  "decide/receipt.js": "decision",
  "decide/present.js": "decision",
  "decide/chips.js": "decision",
  "decide/help.js": "decision",
  "decide/reminders.js": "decision",
  "decide/sneak.js": "decision",
  "decide/clock.js": "decision",
  "decide/emanations.js": "decision",
  "decide/repeat-saves.js": "decision",   // the repeating save: the row an effect answers, the verdict's tally, the words
  "decide/turn-grants.js": "decision",    // the turn-start grant: the row, once per turn, the words; the feature rows and the damage-since judge (Regeneration)
  "decide/death-saves.js": "decision",   // the death save: who makes one, when it is owed, the result read off the system's card, damage at 0, the words
  "decide/drop-to-one.js": "decision",    // the drop-to-1 save facet: the DC from the damage, the exemptions, the words (Undead Fortitude, Death Throes)
  "decide/wards.js": "decision",          // the wards: which use is gated, what ends one, the words
  "decide/duplicates.js": "decision",     // the duplicates: the dice, the face that redirects, who sees through, the chips
  "decide/rebukes.js": "decision",       // the rebuke's reach, its gate, its cost and its card line
  "decide/damage-shares.js": "decision",  // the damage share: what the caster takes, the reach, the end
  "decide/heal-on-hit.js": "decision",    // the heal on hit: the share of what landed, by type
  "decide/prismatic.js": "decision",      // the ray table: the rays a creature's faces pick, the words, the verdict
  "decide/token-lights.js": "decision",   // which use sheds a token light, and the changes that carry it
  "decide/rest-grants.js": "decision",    // the rest grants given to allies: temp HP that does not stack, where a Chef's meal stands
  "decide/mastery-record.js": "decision", // the mastery record: the allowance off the advancements, the fill, the state, the missing pick, the swap
  "decide/summon-art.js": "decision",     // summon art: the name keys, the lookup, a folder's files matched by name, the stored table
  "decide/summons.js": "decision",        // summons: the form rows off the profiles, the record and its answer, the narrowed breath, the shared resistance, the owners
  "decide/gallery.js": "decision",        // the shared gallery: the rows a pool allows, one per name, the preferred book first
  "decide/transforms.js": "decision",     // transforms: the pool rule off a profile, the Known Forms arithmetic, the record and its answer, the form effect, what ends a form
  "decide/hit-menu.js": "decision",
  "decide/shields.js": "decision",
  "decide/choices.js": "decision",
  "decide/demand.js": "decision",
  "decide/moments.js": "decision",   // the moment records — what a resolve IS, as data
  "decide/sequence.js": "decision",  // the hit's sequence — a queued offer waits for the damage and the mastery's decision
  "decide/ledger.js": "decision",      // the ledger's judgement: a step skipped, landed or run again, off its witness
  "decide/changes.js": "decision",     // an effect change's kind: Foundry 14's string type, never the deprecated numeric mode
  "decide/effect-view.js": "decision", // the effect view's rows — which effects are listed, how each is toned
  "decide/card.js": "decision",
  "decide/migrate.js": "decision",     // the rename's migration as data: a document's scope move, a behaviour's retype, the settings to copy, the summary        // THE CARD SEAM — what kind of card, whose, from which, off the typed message

  // CORE — the leaves: ids, settings accessor, the elect, the flag serializer
  "core.js": "core",
  "surfaces.js": "core",   // THE SURFACES MAP — every platform HTML anchor, a second leaf; imports nothing
  "dispatch.js": "core"    // THE HOOK DISPATCHER — one listener per hook, the handlers in ORDER; a third leaf
};

/* ---------------------------------------------------------------------------------------------
 * The groups: a machine that is a DIRECTORY. Inside a group every edge is legal; from outside,
 * only the face (index.js), which is then judged by depth. A part's group is its folder.
 * ------------------------------------------------------------------------------------------- */

export const GROUPS = {
  saves: { face: "saves/index.js" },
  hold: { face: "hold/index.js" }
};
/** The group a scripts-relative path belongs to, or null (decide/ is a layer, not a group). */
export const groupOf = rel => (rel.includes("/") && GROUPS[rel.split("/")[0]]) ? rel.split("/")[0] : null;

/* ---------------------------------------------------------------------------------------------
 * The allowlist: every edge that is not strictly downward, and why. ⚠ A row is a decision:
 *   PERMANENT — ruled permanent (ARCHITECTURE *Decided against, and why*). Do not "fix" these.
 *   OPEN      — real debt: an ARCHITECTURE §10 row names it.
 *   PARKED    — a sideways edge kept on purpose until a named condition (BACKLOG *The two sideways edges*; §10 D9).
 *   BY DESIGN — correct at this layering, nothing to repay.
 * ------------------------------------------------------------------------------------------- */

const ALLOW = [
  {
    from: "heal-on-hit.js", to: "rest-grants.js", disposition: "BY DESIGN",
    why: "machine → machine: Improved Blessed Strikes' Temporary Hit Points to one creature within 60 ft are the rest "
      + "song's hand-out too (`askHandOut`, one pick) — the same one picker (2026-09-30, the PHB classes C1)"
  },
  {
    from: "cast-riders.js", to: "rest-grants.js", disposition: "BY DESIGN",
    why: "machine → machine: Inspiring Smite's divided Temporary Hit Points are the rest song's hand-out "
      + "(`askHandOut` with `distribute`: the popup, the record, the GM's landing, the clock) — one picker "
      + "for every Temporary Hit Point hand-out (2026-09-29, the PHB classes A7)"
  },
  {
    from: "turn-grants.js", to: "rest-grants.js", disposition: "BY DESIGN",
    why: "machine → machine: Life-Giving Force's gift at the turn start is the rest song's hand-out "
      + "(`askHandOut`: the pick of a creature within reach, the record, the GM's landing) — one picker for "
      + "every Temporary Hit Point hand-out; a second popup would drift (2026-09-29, the PHB classes A6)"
  },
  {
    from: "dice-changers.js", to: "metamagic.js", disposition: "BY DESIGN",
    why: "machine → machine: Empowered Spell's row asks metamagic.js whether the caster can take it on "
      + "this roll (`empoweredOffer`: the option known and listed, a point in the pool) — the Metamagic "
      + "list and the pool are metamagic's knowledge, and a second reader would drift (2026-09-27, the "
      + "dice changers' one popup)"
  },
  {
    from: "auto-damage.js", to: "hold/index.js", disposition: "PERMANENT",
    why: "hold's own feature API (stampHoldIfInterrupted): the attack's damage roll is born holding "
      + "when a reaction is pending, and the service that rolls it is the one place that knows the "
      + "roll exists. The cycle back through hold/continue.js is a hoisted function called at hook time"
  },
  {
    from: "auto-apply.js", to: "mastery.js", disposition: "PERMANENT",
    why: "resolveHitMastery, routed from the damage chokepoint. Breaking it means moving "
      + "applyDamagesWithReceipt — the single chokepoint every machine routes through — into a "
      + "third module (ARCHITECTURE appendix: low value, real risk)"
  },
  {
    from: "auto-apply.js", to: "bash-offer.js", disposition: "BY DESIGN",
    why: "sequenceBashOffer, routed from the same damage chokepoint as the mastery rider — the hit's "
      + "offer opens AFTER the damage and the mastery's decision (user ruling 2026-09-13, "
      + "decide/sequence.js), and the chokepoint is the one place that knows both have run"
  },
  {
    from: "events.js", to: "shared.js", disposition: "BY DESIGN",
    why: "spine → spine: the moment gate reads an attack's HIT TARGETS through `hitTargets`, the one "
      + "registry walk every reader uses (D8 — folds compose there), when a resolve's row asks for the "
      + "attack's targets. A second walk in events.js would be a second verdict. (2026-09-11, the gate)"
  },
  {
    from: "events.js", to: "geometry.js", disposition: "BY DESIGN",
    why: "spine → spine: a moment's payload names the actor's token on the viewed scene through `tokenOnScene`, "
      + "the one token rule (ARCHITECTURE §7 *The shared readers*); geometry.js imports no spine file, so the edge "
      + "closes no cycle"
  },
  {
    from: "dice-rise.js", to: "geometry.js", disposition: "BY DESIGN",
    why: "spine → spine: the dice rise over the token a uuid or a speaker stands as, through `tokenOf`, the one "
      + "token rule; geometry.js imports no spine file, so the edge closes no cycle"
  },
  {
    from: "shared.js", to: "geometry.js", disposition: "BY DESIGN",
    why: "spine → spine: a target descriptor reads a token or its document through `tokenDocOf`, the one token "
      + "rule; geometry.js imports no spine file, so the edge closes no cycle"
  },
  {
    from: "auto-apply.js", to: "effect-riders.js", disposition: "BY DESIGN",
    why: "service → service: applying damage and applying effects are one consequence pass, and "
      + "the receipt merge disciplines are shared. The services tier is where this belongs"
  },
  // Offer contributions from machines register into ui.js's registry (`registerOfferPart`), which
  // auto-damage reads: machine → spine and service → spine, downward, no pin.
  {
    from: "volleys.js", to: "reminders.js", disposition: "BY DESIGN",
    why: "judgeRoll (2026-09-02): the volley's aim popup is the gate's SECOND SURFACE — the rays "
      + "roll with the dialog suppressed, so the gate meets them at the aim, ray by ray, with "
      + "the gate's own judge. The judge reads the world (chips, tokens, the lists), so it "
      + "cannot live in decide/; a third surface reading it is the argument for a spine home"
  },
  {
    from: "saves/verdict.js", to: "receipts.js", disposition: "PARKED (D9)",
    why: "revertTarget, for the legendary-resistance unwind. receipts.js is classed a machine "
      + "because revertTarget has exactly one importer; a second one makes it a service "
      + "(BACKLOG *The two sideways edges*: un-parked by that second importer)"
  },
];

/* --- the graph ---------------------------------------------------------------------------- */

/** A path with forward slashes on every platform: a Windows path arrives with backslashes even on Linux. */
export const toPosix = p => String(p).replace(/\\/g, "/");

/** Every .js file under scripts/, recursively, as a scripts-relative posix path. */
export function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...jsFiles(full));
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

/** Every scripts-internal edge, all four forms (lazy `await import()` is the cycle-breaking idiom). */
export function edgesOf(file) {
  const src = readFileSync(file, "utf8");
  const from = toPosix(relative(SCRIPTS, file));
  const out = [];
  const add = (kind, spec) => {
    if (!spec.startsWith(".")) return;                 // no bare specifiers ship (DESIGN R3)
    out.push({ from, to: toPosix(relative(SCRIPTS, normalize(join(dirname(file), spec)))), kind });
  };
  for (const m of src.matchAll(/import\s*\{[\s\S]*?\}\s*from\s*["']([^"']+)["']/g)) add("static", m[1]);
  for (const m of src.matchAll(/^import\s+["']([^"']+)["']/gm)) add("bare", m[1]);
  for (const m of src.matchAll(/import\s+\*\s+as\s+\w+\s+from\s*["']([^"']+)["']/g)) add("star", m[1]);
  for (const m of src.matchAll(/=\s*await\s+import\(\s*["']([^"']+)["']\s*\)/g)) add("lazy", m[1]);
  return out;
}

/* --- the check ---------------------------------------------------------------------------- */

// ⚠ The maps are imported (tools/coverage-map.mjs reads the tier map), so the check runs only when
// this file is the entry.
const isEntry = process.argv[1] && (pathToFileURL(resolve(process.argv[1])).href === import.meta.url);
if (isEntry) main();

function main() {
  const files = jsFiles(SCRIPTS).map(f => ({ path: f, rel: toPosix(relative(SCRIPTS, f)) }))
    .sort((a, b) => a.rel.localeCompare(b.rel));
  const edges = files.flatMap(f => edgesOf(f.path));

  /* --- the assertions ----------------------------------------------------------------------- */

  const failures = [];
  const fail = (rule, msg) => failures.push(`${rule}: ${msg}`);

  // (1) every file declares a layer. An undeclared file is a NEW file whose layer nobody chose.
  for (const f of files) {
    if (!LAYER_OF[f.rel]) {
      fail("layer map", `scripts/${f.rel} has no layer — declare it in LAYER_OF in this file `
        + "(ARCHITECTURE §11, \"Adding a file\": declare its layer in its header comment too)");
    }
  }
  // ...and every declared layer names a file that exists.
  for (const rel of Object.keys(LAYER_OF)) {
    if (!files.some(f => f.rel === rel)) {
      fail("layer map", `LAYER_OF names scripts/${rel}, which does not exist — remove the row`);
    }
  }

  // (2) the pure layer imports NOTHING.
  for (const e of edges) {
    if (LAYER_OF[e.from] === "decision") {
      fail("decide/ is pure", `scripts/${e.from} imports "${e.to}" — the DECISION layer has zero `
        + "imports by design (§7). If it needs game/canvas/a document it is EDGE: move it up a layer");
    }
  }

  // (3) core.js is a leaf.
  for (const e of edges.filter(e => e.from === "core.js")) {
    fail("core is a leaf", `core.js imports "${e.to}" — core.js imports nothing (§7)`);
  }

  // (4) every edge is strictly downward, or pinned with a reason.
  const key = e => `${e.from} -> ${e.to}`;
  const allowed = new Map(ALLOW.map(a => [`${a.from} -> ${a.to}`, a]));
  const used = new Set();
  const violations = [];
  for (const e of edges) {
    const fromDepth = DEPTH[LAYER_OF[e.from]];
    const toDepth = DEPTH[LAYER_OF[e.to]];
    if ((fromDepth === undefined) || (toDepth === undefined)) continue;   // reported by (1)
    // (4a) a directory machine: inside the group every edge is legal; from outside, only the face.
    const gTo = groupOf(e.to), gFrom = groupOf(e.from);
    if (gTo && (gFrom === gTo)) continue;
    if (gTo && (e.to !== GROUPS[gTo].face)) {
      fail("import the index", `scripts/${e.from} imports "${e.to}" — a PART of the ${gTo}/ machine. `
        + `Import ${GROUPS[gTo].face} instead: a directory machine's index is its only public face (§7)`);
      continue;
    }
    if (toDepth < fromDepth) continue;                                    // downward: always legal
    if (allowed.has(key(e))) { used.add(key(e)); violations.push(e); continue; }
    const direction = (toDepth === fromDepth) ? "SAME-LAYER" : "UPWARD";
    fail("depend downward", `scripts/${e.from} (${LAYER_OF[e.from]}) imports "${e.to}" `
      + `(${LAYER_OF[e.to]}) — ${direction}, and not in the allowlist. Either invert the `
      + "dependency (the service usually belongs in the lower layer — that is D1's whole lesson), "
      + "or add a row to ALLOW in this file saying why it must exist");
  }

  // (5) no stale pins.
  for (const a of ALLOW) {
    if (!used.has(`${a.from} -> ${a.to}`)) {
      fail("stale pin", `ALLOW lists ${a.from} -> ${a.to}, and that edge no longer exists — `
        + "delete the row. (D2's evidence row went stale in place for weeks; a pin that cannot go "
        + "stale silently is the point of this check)");
    }
  }

  /* --- the report --------------------------------------------------------------------------- */

  if (failures.length) {
    console.error("");
    for (const f of failures) console.error(`FAIL ${f}`);
    console.error(`\n${failures.length} layering failure(s).`);
    process.exit(1);
  }

  const byLayer = Object.keys(DEPTH).sort((a, b) => DEPTH[b] - DEPTH[a]);
  const counts = Object.fromEntries(byLayer.map(l =>
    [l, files.filter(f => LAYER_OF[f.rel] === l).length]));

  console.log("LAYERS AND THE EDGES THAT CROSS THEM (ARCHITECTURE.md §7 — the dependency rule)");
  for (const l of byLayer) {
    console.log(`  ${String(DEPTH[l]).padStart(2)}  ${l.padEnd(9)} ${String(counts[l]).padStart(2)} `
      + `file${counts[l] === 1 ? "" : "s"}`);
  }
  const kinds = ["static", "bare", "star", "lazy"];
  const tally = kinds.map(k => `${k} ${edges.filter(e => e.kind === k).length}`).join(" · ");
  console.log(`\n  ${edges.length} internal edges: ${tally}`);

  // Pairs vs sites: one pinned pair can hold several call sites.
  console.log(`\n  ${ALLOW.length} pinned pair(s), ${violations.length} call site(s) — `
    + "not downward, each with a reason:");
  const w = Math.max(...ALLOW.map(a => `${a.from} -> ${a.to}`.length));
  for (const a of ALLOW) {
    const sites = violations.filter(e => (e.from === a.from) && (e.to === a.to));
    const forms = [...new Set(sites.map(e => e.kind))].join("/");
    console.log(`    ${`${a.from} -> ${a.to}`.padEnd(w)}  ${a.disposition.padEnd(11)} `
      + `${sites.length}× ${forms}`);
  }
  const open = ALLOW.filter(a => a.disposition.startsWith("OPEN")).length;
  const parked = ALLOW.filter(a => a.disposition.startsWith("PARKED")).length;
  console.log(`\nPASS every edge is downward or pinned (${files.length} files, ${edges.length} edges, `
    + `${ALLOW.length} pinned pairs, ${open} of them OPEN debt, ${parked} parked in BACKLOG — ARCHITECTURE §10 D9).`);
}
