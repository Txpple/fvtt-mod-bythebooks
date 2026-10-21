// @ts-check
/**
 * By the Books — DECISION layer (ARCHITECTURE.md §2): WHAT A RESOLVE IS, as data — THE GATE. A
 * moment resolves when a RECORD lands on a message. `MOMENT_RECORDS` lists each resolve under a
 * stable MARKER (events.js publishes each once); `STATE_KEYS` gives every other key its reason;
 * tools/check-moments.mjs fails the build on an unclassified key. ⚠ This file CLASSIFIES, never
 * curates (a picture is FX Studio's call). ⚠ PURE: no `game`, no imports.
 */

/**
 * The vocabulary — closed; a new word is a contract change (events.js MOMENT_CONTRACT bumps). A
 * word names a MECHANISM FAMILY; the payload's `kind` names the exact record.
 *   maneuver       a Combat Superiority die resolved (the hit menu, Parry, Precision, Riposte,
 *                  Commander's Strike, the Bonus Action maneuvers and their rides)
 *   sneak          Sneak Attack's dice rode a hit, with the Cunning Strike picks
 *   fold           a die or reroll folded into a d20 test (Bardic, Heroic, Tactical, Seeking;
 *                  Precision also, being a die on an attack), and Tactical Mind's refund; a
 *                  weapon's damage dice rolled again as a set (Savage Attacker) or one die (Piercer)
 *   rider          a clock rider's damage rode a hit (Dreadful Strike, Divine Strike, …)
 *   hold-answered  a held roll's reaction was answered — cast OR passed (`details.answer`)
 *   mastery        a weapon mastery's ask resolved (Vex, Sap, Slow, Topple, Push, Graze, Cleave)
 *   shield         a damage shield struck back, or was raised (Fire Shield, Death Armor, Agathys)
 *   spend          a chip, a pool or a resource was consumed (a Vex chip, a Sorcery Point, a use)
 *   damage         a damage receipt landed on a target — or was reverted
 *   effect         an effect receipt landed on a target — or was reverted
 *   save           a demanded save's verdict landed (the saves machine, Topple, concentration)
 *   break          concentration was broken
 *   use            a feature's use taken through a By the Books window (Shield Master's bash)
 *   cast           a cast the module drove (a bare damage spell's dice)
 *   volley         a volley's darts or rays were assigned and fired
 *   choice         a choice answered in a By the Books window that is none of the above
 *                  (an emanation's damage type, a cast's alternative effect, a save's option)
 *   metamagic      a Metamagic option resolved on the spell's card (the pick), or Empowered's reroll on the damage roll
 */
export const MOMENT_WORDS = Object.freeze([
  "maneuver", "sneak", "fold", "rider", "hold-answered", "mastery", "shield", "spend", "damage",
  "effect", "save", "break", "use", "cast", "volley", "choice", "metamagic"
]);

/* --- small readers, shared by the rows ------------------------------------------------------- */

/**
 * The shapes, once (on the first declaration so the doc block attaches).
 * @typedef {{ uuid: string|null, name?: string|null, hit?: boolean }} TargetRow
 * @typedef {object} MomentFacts
 * @property {string|null} [actor]        who resolved it — an actor uuid
 * @property {string|null} [item]         the feature or spell — an item uuid (or null and `itemName`)
 * @property {string|null} [itemName]     when only the name is known (resolved on the actor's sheet)
 * @property {string|null} [activity]     its activity uuid, when known
 * @property {string|null} [ability]      the feature's name as the card says it
 * @property {string|null} [attackId]     the attack message it rode, when there is one
 * @property {TargetRow[]|null} [targets] the creatures the moment is about
 * @property {"attack"|null} [targetsFrom] `"attack"`: the spine reads the attack's hit targets
 * @property {object|object[]|null} [spend] the pool spend in the uniform row shape
 * @property {object} [details]           event-specific plain facts
 * @typedef {object} ResolvedMoment
 * @property {string} marker              stable within the record — publish once per marker
 * @property {string[]} events            the word(s) this resolve publishes under
 * @property {MomentFacts} facts
 * @property {string|null} [publisher]    a user id that should publish instead of the writer
 * @typedef {object} MomentCtx
 * @property {string|null} messageId
 * @property {string|null} itemUuid       the item a usage card names (system.item.uuid)
 * @property {string|null} activityUuid   the activity it names
 * @property {string|null} actorUuid      the message's speaker actor
 * @typedef {object} MomentRecordRow
 * @property {string[]} events            the default word(s); a resolve may override
 * @property {string} means               one sentence — what resolving means for this key
 * @property {(record: any, ctx: MomentCtx) => ResolvedMoment[]} resolved
 * An embedded item's uuid from its owner and id, or null.
 */
const itemUuid = (actorUuid, itemId) => (actorUuid && itemId) ? `${actorUuid}.Item.${itemId}` : null;
/** An activity's uuid from its item's uuid and id, or null. */
const activityUuid = (item, activityId) => (item && activityId) ? `${item}.Activity.${activityId}` : null;
/** A target row from a record entry carrying `uuid` and `name`. */
const row = (t, hit) => ({ uuid: t?.uuid ?? null, name: t?.name ?? null, ...((typeof hit === "boolean") ? { hit } : {}) });
/** The stat stamp's source — who the record says resolved it. */
const source = record => record?.sourceUuid ?? null;
/** A volley's assignment as target rows — the shape is the machine's (a list of `{ uuid, name }` per dart, or a map). */
const volleyTargets = a => Array.isArray(a) ? [...new Map(a.filter(t => t?.uuid).map(t => [t.uuid, row(t)])).values()]
  : Object.keys(a ?? {}).map(uuid => ({ uuid, name: null }));
/** One resolved moment, whole-record shape. */
const whole = (events, facts, publisher = null) => [{ marker: "message", events, facts, ...(publisher ? { publisher } : {}) }];

/* --- the rows ---------------------------------------------------------------------------------- */

/** @type {Readonly<Record<string, MomentRecordRow>>} */
export const MOMENT_RECORDS = Object.freeze({

  /* maneuver ----------------------------------------------------------------------------------- */

  hitManeuver: {
    events: ["maneuver", "rider"],
    means: "a pick from the hit menu rode the damage roll (hit-menu.js); the record arrives resolved on the damage message, a resolve PER PICK (a list since 2026-09-27, a pick per group; a record from before it is its one pick). A Combat Superiority die publishes maneuver; a Giant Ancestry boon (maneuver false, 2026-09-24) publishes rider",
    resolved: (r, ctx) => (Array.isArray(r?.picks) ? r.picks : (r?.key ? [r] : [])).map(p => ({
      marker: Array.isArray(r?.picks) ? (p.key ?? "pick") : "message",
      events: [(p.maneuver === false) ? "rider" : "maneuver"],
      facts: {
        actor: source(r) ?? ctx.actorUuid, item: p.itemUuid ?? null, ability: p.feature ?? null, attackId: r.attackId ?? null,
        targetsFrom: "attack", spend: p.poolSpend ?? null,
        details: { key: p.key ?? null, group: p.group ?? null, formula: p.formula ?? null, type: p.type ?? null,
          mode: p.mode ?? "ride", critical: !!(r.attackRoll ?? p.attackRoll)?.isCritical }
      }
    }))
  },


  commandRide: {
    events: ["maneuver"],
    means: "Commander's Strike's die rode the ally's attack damage (command.js); the record arrives resolved on the damage message",
    resolved: (r, ctx) => whole(["maneuver"], {
      actor: source(r) ?? ctx.actorUuid, item: ctx.itemUuid, ability: "Commander's Strike", attackId: null, targetsFrom: "attack",
      details: { formula: r.formula ?? null, type: r.type ?? null, directedBy: r.directedBy ?? null, weapon: r.weapon ?? null, cardId: r.cardId ?? null }
    })
  },

  superiorityRide: {
    events: ["maneuver"],
    means: "a Bonus Action maneuver's die (Lunging Attack, Feinting Attack) rode a later hit (superiority-uses.js); one resolve per die",
    resolved: (r, ctx) => (r?.rode ?? []).map((d, i) => ({
      marker: `${d.key ?? i}`, events: ["maneuver"],
      facts: { actor: source(r) ?? ctx.actorUuid, itemName: d.key ?? null, ability: d.key ?? null, attackId: r.attackId ?? null,
        targetsFrom: "attack", details: { key: d.key ?? null, formula: d.formula ?? null, type: d.type ?? null, why: d.why ?? null } }
    }))
  },

  superiorityUse: {
    events: ["maneuver"],
    means: "a Bonus Action maneuver's use landed its consequence — a rolled bonus, a chip, a marker (superiority-uses.js); on the use's own card",
    resolved: (r, ctx) => whole(["maneuver"], {
      actor: source(r) ?? ctx.actorUuid, item: ctx.itemUuid, activity: ctx.activityUuid, ability: r.key ?? null,
      targets: r.target ? [{ uuid: null, name: r.target }] : [],
      details: { key: r.key ?? null, die: r.die ?? null, total: r.total ?? null, line: r.line ?? null }
    })
  },

  baitSwitch: {
    events: ["maneuver", "choice"],
    means: "Bait and Switch's AC bonus found its wearer — the fighter or the other creature (superiority-uses.js); resolved when `chosen` is set",
    resolved: (r, ctx) => r?.chosen ? whole(["maneuver", "choice"], {
      actor: source(r) ?? ctx.actorUuid, item: r.itemUuid ?? ctx.itemUuid, ability: "Bait and Switch",
      targets: [{ uuid: r.chosen, name: (r.options ?? []).find(o => o.uuid === r.chosen)?.name ?? null }],
      details: { key: r.key ?? null, total: r.total ?? null, effectName: r.effectName ?? null, chosen: r.chosen, timedOut: !!r.timedOut }
    }) : []
  },

  sweepCard: {
    events: ["maneuver"],
    means: "Sweeping Attack's second creature was picked and the die rolled at it (hit-menu.js); resolved when `resolved` is set",
    resolved: (r, ctx) => r?.resolved ? whole(["maneuver"], {
      actor: source(r) ?? ctx.actorUuid, ability: r.feature ?? "Sweeping Attack", attackId: r.attackId ?? null,
      targets: (r.chosen && (r.chosen !== "none")) ? [{ uuid: r.chosen, name: r.resolved?.name ?? null, hit: r.resolved?.verdict === "hit" }] : [],
      details: { chosen: r.chosen ?? null, rolled: r.resolved?.rolled ?? null, verdict: r.resolved?.verdict ?? null, none: !!r.resolved?.none,
        formula: r.formula ?? null, type: r.type ?? null, timedOut: !!r.timedOut }
    }) : []
  },

  precision: {
    events: ["maneuver", "fold"],
    means: "Precision Attack's offer on a missed attack was answered — the die spent or passed (precision.js); resolved when `status` is resolved",
    resolved: (r, ctx) => (r?.status === "resolved") ? whole(["maneuver", "fold"], {
      actor: r.attackerUuid ?? source(r) ?? ctx.actorUuid, item: itemUuid(r.attackerUuid, r.itemId),
      activity: activityUuid(itemUuid(r.attackerUuid, r.itemId), r.activityId), ability: r.itemName ?? "Precision Attack",
      attackId: ctx.messageId,
      targets: (r.targets ?? []).map(t => row(t, (t.verdict === "hit") ? true : (t.verdict === "miss") ? false : undefined)),
      details: { outcome: r.outcome ?? null, die: r.die ?? null, dieFormula: r.dieFormula ?? null, attackTotal: r.attackTotal ?? null, timedOut: !!r.timedOut }
    }) : []
  },

  damageHold: {
    events: ["hold-answered"],
    means: "a reduction \"when you take damage\" was answered before the damage landed — cast or taken (damage-holds.js: Stone's Endurance on any damage, Interception's guards, Cutting Words' die off an attack's damage); the landing is the receipt's",
    resolved: (r) => r?.answer ? [{
      marker: "message", events: ["hold-answered"],
      facts: { actor: r.actorUuid ?? null, ability: r.reaction ?? null,
        targets: r.target?.uuid ? [{ uuid: r.target.uuid, name: r.target.name ?? null }] : [],
        details: { answer: r.answer, reduceBy: Number(r.reduceBy) || 0, amount: r.amount ?? null, timedOut: !!r.timedOut } }
    }] : []
  },

  dropToOne: {
    events: ["hold-answered"],
    means: "a drop to 0 Hit Points turned into a drop to 1 — Relentless Endurance answered (use or pass), Death Ward automatic (answer \"auto\"), or a `save` row's dice (Undead Fortitude: answer \"saved\" / \"failed\", `save` the roll; \"exempt\" when the damage's type or crit set the row aside) (drop-to-one.js)",
    resolved: (r) => r?.answer ? [{
      marker: "message", events: ["hold-answered"],
      facts: { actor: r.actorUuid ?? null, ability: r.row ?? null,
        targets: r.actorUuid ? [{ uuid: r.actorUuid, name: r.actorName ?? null }] : [],
        details: { answer: r.answer, amount: r.amount ?? null, timedOut: !!r.timedOut,
          ...(r.save ? { save: { ability: r.save.ability ?? null, dc: r.save.dc ?? null, total: r.save.total ?? null } } : {}) } }
    }] : []
  },

  deathSaveOffer: {
    events: ["use"],
    means: "the death save's side (Searing Vengeance, the PHB classes C1): a keeper offered its feature as a creature rolled a Death Saving Throw — answered use (half the maximum back, the burst landed) or pass (drop-to-one.js)",
    resolved: (r) => (r?.answer && ((r.answer !== "use") || r.applied)) ? [{
      marker: "message", events: ["use"],
      facts: { actor: r.keeperUuid ?? null, ability: r.row ?? null,
        targets: r.actorUuid ? [{ uuid: r.actorUuid, name: r.actorName ?? null }] : [],
        details: { answer: r.answer, healed: r.healed ?? null, burst: r.burst ?? null, victims: r.victims ?? [], timedOut: !!r.timedOut } }
    }] : []
  },

  initiativeSwap: {
    events: ["choice"],
    means: "an Initiative swap was answered — Alert's pick of an ally, swapped in the tracker by the elect, or no swap (initiative-swap.js, the origin feats 2026-09-25); resolved at No, or when the swap is applied",
    resolved: (r) => ((r?.answer === "no") || ((r?.answer === "swap") && r?.applied)) ? [{
      marker: "message", events: ["choice"],
      facts: { actor: r.actorUuid ?? null, ability: r.row ?? null,
        targets: (r.allies ?? []).filter(a => a.combatantId === r.pick).map(a => ({ uuid: a.uuid ?? null, name: a.name ?? null })),
        details: { answer: r.answer, from: r.from ?? null, to: r.to ?? null, timedOut: !!r.timedOut } }
    }] : []
  },

  initiativeGrant: {
    events: ["choice"],
    means: "an Initiative grant — Persistent Rage's uses back (automatic), or Uncanny Metabolism's offer answered (the PHB classes, A6, initiative-grants.js); resolved at No, or when the sheet is written",
    resolved: (r) => ((r?.answer === "no") || r?.applied) ? [{
      marker: "message", events: ["choice"],
      facts: { actor: r.actorUuid ?? null, ability: r.row ?? null,
        targets: r.actorUuid ? [{ uuid: r.actorUuid, name: r.actorName ?? null }] : [],
        details: { answer: r.answer ?? null, regained: r.regained ?? null, healed: r.healed ?? null, timedOut: !!r.timedOut } }
    }] : []
  },

  conditionEnd: {
    events: ["choice"],
    means: "a feature's offer to END a condition its bearer wears — Guarded Mind (a Psionic die), Self-Restoration (free, the turn end), Physician's Touch (the healed creature) — answered with the condition or Keep (turn-grants.js, the PHB classes B4); resolved at Keep, or when the effects are gone",
    resolved: (r) => ((r?.answer === "keep") || r?.applied) ? [{
      marker: "message", events: ["choice"],
      facts: { actor: r.actorUuid ?? null, ability: r.row ?? null,
        targets: r.bearerUuid ? [{ uuid: r.bearerUuid, name: r.bearerName ?? null }] : [],
        details: { answer: r.answer ?? null, ended: r.ended ?? null, gone: r.gone ?? [], timedOut: !!r.timedOut } }
    }] : []
  },

  grappleDamage: {
    events: ["choice"],
    means: "Unarmed Fighting's turn-start damage was answered — 1d4 to a creature the owner grapples, dealt through the feat's own damage activity, or skipped (damage-rules.js, the fighting styles 2026-09-26, ruled U1); the clock deals it to the one creature known to be held",
    resolved: (r) => (r?.status === "resolved") ? [{
      marker: "message", events: ["choice"],
      facts: { actor: r.actorUuid ?? null, ability: r.row ?? null,
        targets: (r.candidates ?? []).filter(c => c.uuid === r.pick).map(c => ({ uuid: c.uuid ?? null, name: c.name ?? null })),
        details: { answer: r.answer ?? null, timedOut: !!r.timedOut } }
    }] : []
  },

  typePick: {
    events: ["choice"],
    means: "a typed feat's damage type was chosen as it landed — Elemental Adept's copy renamed \"Elemental Adept (Fire)\" (damage-rules.js, the PHB feats walk 2026-09-26); resolved when a type is chosen, at the popup or by a rename",
    resolved: r => r?.chosen ? [{
      marker: "message", events: ["choice"],
      facts: { actor: r.sourceUuid ?? null, ability: r.row ?? null, targets: [],
        details: { chosen: r.chosen, left: r.left ?? [] } }
    }] : []
  },

  kitTend: {
    events: ["choice"],
    means: "a kit's tending was answered — Healer's Battle Medic: the tended creature's Hit Point Die spent and the feature's own heal of that size rolled at it by the elect, or not used (kit-tend.js, the origin-feat walk 2026-09-25); resolved at a Pass, or when the tending is applied",
    resolved: (r) => ((r?.answer === "pass") || ((r?.answer === "tend") && r?.applied)) ? [{
      marker: "message", events: ["choice"],
      facts: { actor: r.actorUuid ?? null, ability: r.row ?? null,
        targets: r.targetUuid ? [{ uuid: r.targetUuid, name: r.targetName ?? null }] : [],
        details: { answer: r.answer, faces: r.faces ?? null, spent: !!r.spent, timedOut: !!r.timedOut } }
    }] : []
  },

  restSong: {
    events: ["choice"],
    means: "a rest grant GIVEN to allies was answered and landed — Musician's Encouraging Song, Heroic Inspiration to the picked allies (rest-grants.js); resolved when `applied`",
    resolved: (r) => r?.applied ? [{
      marker: "message", events: ["choice"],
      // the item is the giver's own feature (every hand-out stores its id): a reader keys on it, never on the row's name
      facts: { actor: r.actorUuid ?? null, item: itemUuid(r.actorUuid, r.itemId), ability: r.row ?? null,
        targets: (r.picks ?? []).map(p => p?.uuid ?? p).map(uuid => ({ uuid, name: (r.candidates ?? []).find(c => c.uuid === uuid)?.name ?? null })),
        details: { grant: r.grant ?? null, given: r.given ?? [] } }
    }] : []
  },

  masterySwap: {
    events: ["choice"],
    means: "the long-rest mastery swap was answered and landed — one chosen weapon kind replaced by another on the sheet's own list, or kept (mastery-record.js, issue #3); resolved when `applied`",
    resolved: (r) => r?.applied ? [{
      marker: "message", events: ["choice"],
      facts: { actor: r.actorUuid ?? null, ability: "Weapon Mastery", targets: [],
        details: { outcome: r.outcome ?? null, out: r.out ?? null, into: r.into ?? null, declined: !!r.declined } }
    }] : []
  },

  summon: {
    events: ["cast"],
    means: "a summon the module drove was landed by the elect — the creature(s) created from the caster's placement, the spell's own choice applied, ownership granted (summons.js, issue #1); resolved when `applied`; a companion's later beats (into the pocket, called back, dismissed) each resolve on their own marker, `details.companion` leave or appear",
    resolved: (r, ctx) => r?.applied ? [{
      marker: "message", events: ["cast"],
      facts: { actor: r.sourceUuid ?? null, item: r.itemUuid ?? ctx.itemUuid ?? null, activity: r.activityUuid ?? ctx.activityUuid ?? null,
        ability: r.itemName ?? null,
        // the token each creature landed as, so a reader plays at the space it appeared in
        targets: (r.landed ?? []).map(l => ({ uuid: l.actorUuid ?? null, tokenUuid: l.tokenUuid ?? null, name: l.name ?? null })),
        details: { outcome: r.outcome ?? null, profile: r.profileName ?? null, summon: r.summonName ?? null, row: r.choice ?? null, picked: r.picked ?? null,
          count: r.count ?? null, level: r.level ?? null, dismissed: !!r.dismissed } }
    },
    // a companion's beats, each its own: "leave" (into the pocket, dismissed) and "appear" (called back),
    // published while the token still stands (a leave) or as it lands (an appear)
    ...(r.companion?.events ?? []).map(e => ({
      marker: `companion-${e.id}`, events: ["cast"],
      facts: { actor: r.sourceUuid ?? null, item: r.itemUuid ?? ctx.itemUuid ?? null, activity: r.activityUuid ?? ctx.activityUuid ?? null,
        ability: r.itemName ?? null, targets: [{ tokenUuid: e.tokenUuid ?? null, name: e.name ?? null }],
        details: { companion: e.kind, summon: e.name ?? null } }
    }))] : []
  },

  transform: {
    events: ["use", "cast"],
    means: "a transform the module drove was landed by the elect — the creature(s) turned into the picked form with dnd5e's own transformInto, a learned Known Form written, the form effect clocked (transforms.js, issue #2); a feature publishes use, a spell cast; resolved when `applied`",
    resolved: (r, ctx) => r?.applied ? [{
      marker: "message", events: [(r.itemType === "spell") ? "cast" : "use"],
      facts: { actor: r.sourceUuid ?? null, item: r.itemUuid ?? ctx.itemUuid ?? null, activity: r.activityUuid ?? ctx.activityUuid ?? null,
        ability: r.itemName ?? null,
        targets: (r.landed ?? []).map(l => ({ uuid: l.originalUuid ?? l.actorUuid ?? null, name: l.name ?? null })),
        details: { outcome: r.outcome ?? null, key: r.key ?? null, form: r.pick?.name ?? null, formUuid: r.pick?.uuid ?? null,
          learned: r.learned?.name ?? null, self: !!r.self, ended: r.ended?.word ?? null,
          // a companion empowered by a summon spell (summons.js stamps the record, transforms.js lands it)
          empowered: !!r.empower, level: r.empower?.level ?? null } }
    }] : []
  },

  formSwap: {
    events: ["choice"],
    means: "the Long Rest's known-form change was answered and landed — a Known Form replaced by another, open slots filled, or kept (transforms.js, issue #2); resolved when `applied`",
    resolved: (r) => r?.applied ? [{
      marker: "message", events: ["choice"],
      facts: { actor: r.actorUuid ?? null, item: r.itemUuid ?? null, ability: r.itemName ?? null, targets: [],
        details: { outcome: r.outcome ?? null, out: r.out ?? null, into: r.into?.name ?? null, adds: (r.adds ?? []).map(a => a?.name ?? null), declined: !!r.declined } }
    }] : []
  },

  rebuke: {
    events: ["hold-answered"],
    means: "a rebuke's offer — a Reaction to taking damage, aimed at its dealer — was answered, used or passed (rebukes.js); one resolve per offer",
    resolved: (r) => r?.answer ? [{
      marker: "message", events: ["hold-answered"],
      facts: { actor: r.actorUuid ?? null, ability: r.choice ?? r.options?.[0]?.name ?? null,
        targets: r.sourceUuid ? [{ uuid: r.sourceUuid, name: r.sourceName ?? null }] : [],
        details: { answer: r.answer, distance: r.distance ?? null, amount: r.amount ?? null, timedOut: !!r.timedOut } }
    }] : []
  },

  riposte: {
    events: ["maneuver"],
    means: "Riposte's offer on an enemy's miss was answered by each reactor — strike back or decline (riposte.js); one resolve per reactor with an answer",
    resolved: (r, ctx) => (r?.reactors ?? []).filter(x => x.answer).map(x => ({
      marker: `${x.uuid}`, events: ["maneuver"],
      facts: { actor: x.uuid ?? null, item: itemUuid(x.uuid, x.itemId), activity: activityUuid(itemUuid(x.uuid, x.itemId), x.activityId),
        ability: x.itemName ?? "Riposte", attackId: ctx.messageId,
        targets: r.attackerUuid ? [{ uuid: r.attackerUuid, name: r.attackerName ?? null }] : [],
        details: { answer: x.answer, weapon: x.weaponName ?? null, dieFormula: x.dieFormula ?? null, timedOut: !!x.timedOut } }
    }))
  },

  /* sneak -------------------------------------------------------------------------------------- */

  sneakDamage: {
    events: ["sneak"],
    means: "Sneak Attack's dice rode the damage roll with the Cunning Strike picks (sneak.js); the record arrives resolved on the damage message",
    resolved: (r, ctx) => whole(["sneak"], {
      actor: source(r) ?? ctx.actorUuid, itemName: "Sneak Attack", ability: "Sneak Attack", attackId: r.attackId ?? null, targetsFrom: "attack",
      details: { dice: r.dice ?? null, formula: r.formula ?? null, cost: r.cost ?? 0, dc: r.dc ?? null, picks: (r.cunning ?? []).map(c => c.key) }
    })
  },

  /* fold --------------------------------------------------------------------------------------- */

  d20fold: {
    events: ["fold"],
    means: "a d20 fold — Bardic, Heroic, Tactical, Seeking — was spent into a test, or the offer was passed (d20-folds.js); one resolve per settled spend, one for a pass",
    resolved: (r, ctx) => {
      const out = [];
      const actor = r?.actorUuid ?? source(r) ?? ctx.actorUuid;
      (r?.spends ?? []).forEach((s, i) => {
        if ( s.pendingVerdict ) return;   // the dice are still in the air — the verdict write settles it
        out.push({ marker: `spend:${i}`, events: ["fold"],
          facts: { actor, itemName: s.name ?? null, ability: s.name ?? s.label ?? null,
            details: { kind: s.kind ?? null, testKind: r.testKind ?? null, skill: r.skill ?? null, die: s.die ?? null, reroll: s.reroll ?? null,
              baseTotal: r.baseTotal ?? null, foldedTotal: r.foldedTotal ?? null, dc: r.dc ?? null } } });
      });
      if ( (r?.status === "resolved") && (r?.outcome === "passed") ) {
        out.push({ marker: "passed", events: ["fold"],
          facts: { actor, details: { outcome: "passed", testKind: r.testKind ?? null, baseTotal: r.baseTotal ?? null, timedOut: !!r.timedOut } } });
      }
      return out;
    }
  },

  bystanderRoll: {
    events: ["fold"],
    means: "a bystander bent another creature's save or check — Restore Balance, Cutting Words (bystanders.js, Q2 option A); resolved when the offer leaves pending: the bend, or everyone passed",
    resolved: (r, ctx) => (r?.status === "resolved") ? whole(["fold"], {
      actor: r.by ?? r.rollerUuid ?? ctx.actorUuid, itemName: r.rescue ?? null, ability: r.rescue ?? null,
      details: { testKind: r.testKind ?? null, answer: r.answer ?? null, roller: r.rollerUuid ?? null,
        baseTotal: r.baseTotal ?? null, total: r.bent?.total ?? null, dc: r.dc ?? null, timedOut: !!r.timedOut }
    }) : []
  },

  tacticalRefund: {
    events: ["fold"],
    means: "Tactical Mind's refund was asked and answered — kept or refunded (d20-folds.js); resolved when `status` leaves pending",
    resolved: (r, ctx) => ((r?.status === "kept") || (r?.status === "refunded")) ? whole(["fold"], {
      actor: r.actorUuid ?? ctx.actorUuid, itemName: r.name ?? null, ability: r.name ?? null,
      details: { outcome: r.status, poolName: r.poolName ?? null, poolUuid: r.poolUuid ?? null }
    }) : []
  },

  diceChange: {
    events: ["fold", "metamagic"],
    means: "the dice changers' one popup on a damage roll resolved (dice-changers.js, 2026-09-27) — per row used: Savage Attacker's set and Piercer's one die publish fold, Empowered Spell's picked dice publish metamagic; resolved when `status` is used",
    resolved: (r, ctx) => (r?.status === "used") ? (r.rows ?? []).filter(x => x?.status === "used").map(x => ({
      marker: x.key ?? x.feature ?? "row",
      events: [(x.kind === "pick") ? "metamagic" : "fold"],
      facts: (x.kind === "pick")
        ? { actor: r.actorUuid ?? source(r) ?? ctx.actorUuid, item: ctx.itemUuid, activity: ctx.activityUuid, itemName: x.feature ?? null,
          ability: x.feature ?? null, details: { picks: x.picks ?? [], newTotal: x.after ?? null, delta: x.delta ?? null } }
        : { actor: r.actorUuid ?? source(r) ?? ctx.actorUuid, itemName: x.feature ?? null, ability: x.feature ?? null,
          attackId: r.attackId ?? null, targetsFrom: "attack",
          details: { kind: x.kind ?? null, formula: x.formula ?? null, first: x.first ?? null, second: x.second ?? null,
            stands: x.stands ?? null, delta: x.delta ?? null, total: x.after ?? null } }
    })) : []
  },

  healReroll: {
    events: ["fold"],
    means: "a healing die showing a 1 was rerolled and the new face stood — Healer, on a healing spell or its own Battle Medic (heal-rerolls.js, the origin feats 2026-09-25); resolved when `status` is used",
    resolved: (r, ctx) => (r?.status === "used") ? whole(["fold"], {
      actor: r.actorUuid ?? source(r) ?? ctx.actorUuid, itemName: r.feature ?? null, ability: r.feature ?? null,
      details: { source: r.source ?? null, picks: r.picks ?? [], total: r.total ?? null, newTotal: r.newTotal ?? null, delta: r.delta ?? null }
    }) : []
  },

  /* rider -------------------------------------------------------------------------------------- */

  clockRiders: {
    events: ["rider"],
    means: "a clock rider's damage rode a hit — Dreadful Strike, Divine Strike, Primal Strike, Divine Fury, Assassinate (clock-riders.js); one resolve per rider",
    resolved: (r, ctx) => (r?.riders ?? []).map((d, i) => ({
      marker: `${d.key ?? i}`, events: ["rider"],
      facts: { actor: source(r) ?? ctx.actorUuid, itemName: d.label ?? null, ability: d.label ?? null, attackId: r.attackId ?? null, targetsFrom: "attack",
        details: { key: d.key ?? null, formula: d.formula ?? null, type: d.type ?? null, why: d.why ?? null, usesLeft: d.usesLeft ?? null } }
    }))
  },

  spellRiderCard: {
    events: ["rider"],
    means: "a transformation's extra damage rode a SPELL's damage onto the one target its caster picked — Celestial Revelation (clock-riders.js, the Aasimar walk 2026-09-25); the receipt on the same card is the damage's own resolve",
    resolved: (r, ctx) => r?.targetUuid ? whole(["rider"], {
      actor: source(r) ?? ctx.actorUuid, itemName: r.label ?? null, ability: r.label ?? null,
      targets: [{ uuid: r.targetUuid, name: null }],
      details: { key: r.key ?? null, value: r.value ?? null, type: r.type ?? null, spellMessageId: r.spellMessageId ?? null }
    }) : []
  },

  /* hold-answered ------------------------------------------------------------------------------ */

  hold: {
    events: ["hold-answered"],
    means: "a held roll's reaction was answered by its target — cast or pass (hold/answer.js, hold/clock.js); one resolve per target with an answer. Parry's die publishes under maneuver too; Stone's Endurance's use does not (reduce.maneuver false, 2026-09-24)",
    resolved: (r, ctx) => (r?.targets ?? []).filter(t => t.answer).map(t => {
      // A `roll` answer names the row that bent the roll — its item, not the hold's reaction — and
      // its spend is a Luck Point or a use, never a Superiority Die.
      const bent = (t.answer === "roll") ? ((t.rescues ?? []).find(x => x.name === t.rescue) ?? { name: t.rescue ?? null }) : null;
      const item = itemUuid(t.uuid, bent ? (bent.itemId ?? null) : t.itemId);
      const die = !!t.poolSpend && !bent;
      return {
        marker: `${t.uuid}`,
        // Only a Superiority Die publishes under maneuver (Parry); a non-maneuver use (Stone's
        // Endurance) and a `roll` rescue's spend do not.
        events: (die && (t.reduce?.maneuver !== false)) ? ["hold-answered", "maneuver"] : ["hold-answered"],
        // The answerer's client, when the write was the elect's (a relayed answer).
        publisher: t.answeredBy ?? null,
        facts: { actor: t.uuid ?? null, item, activity: activityUuid(item, bent ? (bent.activityId ?? null) : t.activityId),
          ability: (bent ? bent.name : t.reaction) ?? null, attackId: ctx.messageId,
          targets: source(r) ? [{ uuid: source(r), name: null }] : [], spend: t.poolSpend ?? null,
          details: { answer: t.answer, kind: t.kind ?? null, reduceBy: (Number(t.reduceBy) > 0) ? Number(t.reduceBy) : null,
            spell: r.spell ?? null, trigger: r.trigger ?? "attack", timedOut: !!t.timedOut,
            ...(die ? { formula: t.reduce?.formula ?? null, mode: "reduce" } : {}),
            ...(bent ? { rescue: bent.name, how: t.bent?.how ?? null, stood: t.bent?.total ?? null, verdict: t.verdict ?? null } : {}) } }
      };
    })
  },

  /* mastery ------------------------------------------------------------------------------------ */

  mastery: {
    events: ["mastery"],
    means: "a weapon mastery's ask was answered and executed — used or passed (mastery.js); resolved when `status` is done. On an ActiveEffect the same key is the chip's fingerprint, which no message carries",
    resolved: (r, ctx) => (r?.status === "done") ? whole(["mastery"], {
      actor: r.attackerUuid ?? source(r) ?? ctx.actorUuid, itemName: r.weapon?.name ?? null, ability: r.key ?? null, attackId: ctx.messageId,
      targets: (r.targets ?? []).map(t => row(t)),
      details: { key: r.key ?? null, outcome: r.outcome ?? null, answer: r.answer ?? null, weapon: r.weapon?.name ?? null, timedOut: !!r.timedOut }
    }) : []
  },

  masteryPick: {
    events: ["mastery"],
    means: "Tactical Master's pick at the hit — which mastery the wielder chose (or passed) before the machine resolved it (mastery.js); resolved when `status` is done",
    resolved: (r, ctx) => (r?.status === "done") ? whole(["mastery"], {
      actor: r.attackerUuid ?? source(r) ?? ctx.actorUuid, itemName: r.weapon?.name ?? null, ability: r.answer ?? null, attackId: ctx.messageId,
      targets: (r.hits ?? []).map(t => row(t)),
      details: { picked: r.answer ?? null, stamped: r.stamped ?? null, options: (r.options ?? []).map(o => o.key), timedOut: !!r.timedOut }
    }) : []
  },

  /* shield ------------------------------------------------------------------------------------- */

  damageShield: {
    events: ["shield"],
    means: "a damage shield struck back at a melee attacker — its dice rolled on the defender's own message (damage-shields.js); arrives resolved",
    resolved: (r, ctx) => whole(["shield"], {
      actor: source(r) ?? ctx.actorUuid, itemName: r.key ?? null, ability: r.key ?? null, attackId: r.attackId ?? null,
      targets: r.attackerUuid ? [{ uuid: r.attackerUuid, name: r.attackerName ?? null, hit: true }] : [],
      details: { key: r.key ?? null, rolled: !!r.rolled, formula: r.formula ?? null, total: r.total ?? null, type: r.type ?? null,
        why: r.why ?? null, distanceFeet: r.distanceFeet ?? null, effectName: r.effectName ?? null, damageId: r.damageId ?? null }
    })
  },

  shieldMark: {
    events: ["shield"],
    means: "a damage shield was raised at the cast — the ward's effect on its bearer (damage-shields.js); on the cast's card",
    resolved: (r, ctx) => whole(["shield"], {
      actor: source(r) ?? ctx.actorUuid, item: ctx.itemUuid, activity: ctx.activityUuid, ability: r.key ?? null,
      details: { key: r.key ?? null, raised: true, effectId: r.effectId ?? null, spellLevel: r.spellLevel ?? null }
    })
  },

  /* spend -------------------------------------------------------------------------------------- */

  poolSpend: {
    events: ["spend"],
    means: "a pool was spent by hand — Sorcery Points, a rider's uses, a Seeking Spell (the uniform record shared.js poolSpendsOn reads); one resolve per record",
    resolved: (r, ctx) => (Array.isArray(r) ? r : (r ? [r] : [])).map((s, i) => ({
      marker: `${s.pool ?? "pool"}|${s.at ?? i}`, events: ["spend"],
      facts: { actor: s.actorUuid ?? ctx.actorUuid, item: ctx.itemUuid, ability: s.ability ?? null, spend: s,
        details: { pool: s.pool ?? null, spent: Number(s.spent ?? 0), left: Number(s.left ?? 0), max: Number(s.max ?? 0) } }
    }))
  },

  chipSpend: {
    events: ["spend"],
    means: "an attack roll used a chip up — Vex, Sap, a listed effect's marker (chip-spend.js); one resolve per chip",
    resolved: (r, ctx) => (r?.spent ?? []).map(s => ({
      marker: `${s.id}`, events: ["spend"],
      facts: { actor: source(r) ?? ctx.actorUuid, ability: s.name ?? null, attackId: ctx.messageId,
        targets: s.bearerUuid ? [{ uuid: s.bearerUuid, name: s.bearerName ?? null }] : [],
        details: { key: s.key ?? null, effectId: s.id ?? null, mode: s.mode ?? null, net: s.net ?? null } }
    }))
  },

  useChip: {
    events: ["spend"],
    means: "a use-chip was written at a feature's use — Steady Aim and its class (use-chips.js); on the use's own card",
    resolved: (r, ctx) => whole(["spend"], {
      actor: source(r) ?? ctx.actorUuid, item: ctx.itemUuid, activity: ctx.activityUuid, ability: r.name ?? null,
      details: { effectId: r.effectId ?? null, bend: r.bend ?? null, note: r.note ?? null }
    })
  },

  coatUse: {
    events: ["spend"],
    means: "a coating was written at its use — the Poisoner's Apply Poison vetoed into the Poison Coating chip on the actor, a dose spent (use-chips.js COATINGS, 2026-09-26); on the card the use posts",
    resolved: (r, ctx) => whole(["spend"], {
      actor: source(r) ?? ctx.actorUuid, ability: r.chip ?? null,
      details: { key: r.key ?? null, effectId: r.effectId ?? null, left: r.left ?? null }
    })
  },

  coatHit: {
    events: ["spend"],
    means: "a coating was spent by a weapon hit — the chip gone, the feature's own save used at the creatures struck (use-chips.js COATINGS, 2026-09-26); resolved once spent, a miss is moot",
    resolved: (r, ctx) => (r?.status === "spent") ? whole(["spend"], {
      actor: source(r) ?? ctx.actorUuid, attackId: r.attackId ?? null, ability: r.key ?? null,
      targets: (r.targets ?? []).map(t => ({ uuid: t.uuid ?? null, name: t.name ?? null })),
      details: { saveAbility: r.ability ?? null, saveId: r.saveId ?? null, note: r.note ?? null }
    }) : []
  },

  cardChip: {
    events: ["spend"],
    means: "a card chip offered on a cast's card and, once built, the chip it wrote — Tinker's Tiny Clockwork Device (use-chips.js); the build is the resolve",
    resolved: (r, ctx) => r?.made ? whole(["spend"], {
      actor: source(r) ?? ctx.actorUuid, item: ctx.itemUuid, activity: ctx.activityUuid, ability: r.chip ?? null,
      details: { key: r.key ?? null, effectId: r.effectId ?? null, retired: r.retired ?? [] }
    }) : []
  },

  spend: {
    events: ["spend"],
    means: "a use's own resource movement was stamped for the flash — item uses, activity uses, spell slots (resources.js); on the usage card",
    resolved: (r, ctx) => whole(["spend"], {
      actor: source(r) ?? ctx.actorUuid, item: ctx.itemUuid, activity: ctx.activityUuid,
      details: { rows: r.rows ?? [], slots: r.slots ?? [] }
    })
  },

  /* damage ------------------------------------------------------------------------------------- */

  receipt: {
    events: ["damage"],
    means: "damage landed on a target with a receipt (auto-apply.js), or a receipt was reverted (receipts.js); one resolve per target, one more per revert",
    resolved: (r, ctx) => {
      const out = [];
      for ( const t of r?.targets ?? [] ) {
        const facts = { actor: t.sourceUuid ?? source(r) ?? ctx.actorUuid, targets: [{ uuid: t.uuid, name: t.name ?? null, hit: true }],
          details: { taken: t.taken ?? null, delta: t.delta ?? null, parts: t.parts ?? [], traits: t.traits ?? [], note: t.note ?? null,
            multiplier: t.multiplier ?? 1 } };
        out.push({ marker: `${t.uuid}`, events: ["damage"], facts });
        if ( t.reverted ) out.push({ marker: `${t.uuid}|reverted`, events: ["damage"], facts: { ...facts, details: { ...facts.details, reverted: true } } });
      }
      return out;
    }
  },

  /* effect ------------------------------------------------------------------------------------- */

  effectReceipt: {
    events: ["effect"],
    means: "an effect landed on a target with a receipt (effect-riders.js, mastery chips, the hold's reaction effect, the cast slice), or was reverted; one resolve per effect, one more per revert",
    resolved: (r, ctx) => {
      const out = [];
      for ( const t of r?.targets ?? [] ) {
        for ( const e of t.effects ?? [] ) {
          const facts = { actor: e.sourceUuid ?? source(r) ?? ctx.actorUuid, item: ctx.itemUuid, activity: ctx.activityUuid, ability: e.name ?? null,
            targets: [{ uuid: t.uuid, name: t.name ?? null }], details: { effectId: e.id ?? null, name: e.name ?? null } };
          out.push({ marker: `${t.uuid}|${e.id}`, events: ["effect"], facts });
          if ( e.reverted ) out.push({ marker: `${t.uuid}|${e.id}|reverted`, events: ["effect"], facts: { ...facts, details: { ...facts.details, reverted: true } } });
        }
      }
      return out;
    }
  },

  /* save --------------------------------------------------------------------------------------- */

  saves: {
    events: ["save"],
    means: "a demanded save's verdict landed for a target (saves/verdict.js) — rolled, timed out or auto-failed; one resolve per target done, and one per save-side choice answered (publishes choice)",
    resolved: (r, ctx) => {
      const out = [];
      for ( const t of r?.targets ?? [] ) {
        if ( t.done ) out.push({ marker: `${t.uuid}`, events: ["save"],
          facts: { actor: t.uuid ?? null, item: ctx.itemUuid ?? null, activity: r.activityUuid ?? ctx.activityUuid, ability: r.item?.name ?? null,
            targets: [], details: { outcome: t.outcome ?? null, total: t.total ?? null, dc: r.dc ?? null, abilities: r.abilities ?? [],
              autoFailed: !!t.autoFailed, autoFailedBy: t.autoFailedBy ?? null,
              autoSucceeded: !!t.autoSucceeded, autoSucceededBy: t.autoSucceededBy ?? null, timedOut: !!t.timedOut, casterUuid: source(r), casterName: r.casterName ?? null,
              damageOnSave: r.damageOnSave ?? null, rollMessageId: t.rollMessageId ?? null } } });
        // The save-side choice is the ATTACKER's (Shield Master's push on a failed save): the chooser
        // is the spec's subject, the saver its target.
        if ( t.choice?.answer ) out.push({ marker: `${t.uuid}|choice`, events: ["choice"],
          facts: { actor: t.choice.subjectUuid ?? null, itemName: t.choice.itemName ?? null, ability: t.choice.itemName ?? null,
            targets: [{ uuid: t.uuid, name: t.name ?? null }],
            details: { answer: t.choice.answer, kind: t.choice.kind ?? null, timedOut: !!t.choice.timedOut } } });
      }
      return out;
    }
  },

  topple: {
    events: ["save"],
    means: "a Topple save's verdict landed for a target — saved, prone, or failed before the dice (topple.js); one resolve per target done",
    resolved: (r, ctx) => (r?.targets ?? []).filter(t => t.done).map(t => ({
      marker: `${t.uuid}`, events: ["save"],
      facts: { actor: t.uuid ?? null, ability: "Topple", attackId: ctx.messageId, targets: [],
        details: { outcome: t.outcome ?? null, total: t.total ?? null, dc: r.dc ?? null, ability: r.ability ?? null, applied: !!t.applied,
          timedOut: !!t.timedOut, attackerUuid: r.attackerUuid ?? source(r) } }
    }))
  },

  concentration: {
    events: ["save", "break"],
    means: "a concentration save's verdict landed (concentration.js) — and the concentration broke when it failed (publishes break beside save); resolved when `outcome` is set",
    resolved: (r, ctx) => (r?.status === "done") && r?.outcome ? [{
      marker: "verdict",
      events: r.outcome.voided ? ["save"] : (r.outcome.success ? ["save"] : ["save", "break"]),
      facts: { actor: r.actorUuid ?? source(r) ?? ctx.actorUuid, ability: "Concentration", targets: [],
        details: { success: !!r.outcome.success, total: r.outcome.total ?? null, dc: r.dc ?? null, names: r.names ?? [], damage: r.damage ?? null,
          timedOut: !!r.outcome.timedOut, voided: !!r.outcome.voided, rollMessageId: r.outcome.rollMessageId ?? null } }
    }] : []
  },

  /* use ---------------------------------------------------------------------------------------- */

  bashOffer: {
    events: ["use"],
    means: "Shield Master's bash offer on a melee hit, or Tavern Brawler's push on an Unarmed Strike hit (kind shove), was answered — used or passed (bash-offer.js); resolved when `status` is resolved",
    resolved: (r, ctx) => (r?.status === "resolved") ? whole(["use"], {
      actor: r.attackerUuid ?? source(r) ?? ctx.actorUuid, item: itemUuid(r.attackerUuid, r.itemId),
      activity: activityUuid(itemUuid(r.attackerUuid, r.itemId), r.activityId), ability: r.itemName ?? "Shield Master", attackId: ctx.messageId,
      targets: r.targetUuid ? [{ uuid: r.targetUuid, name: (r.targets ?? []).find(t => t.uuid === r.targetUuid)?.name ?? null }] : (r.targets ?? []).map(t => row(t)),
      details: { answer: r.answer ?? null, timedOut: !!r.timedOut, kind: r.kind ?? "bash" }
    }) : []
  },

  /* cast --------------------------------------------------------------------------------------- */

  damageCast: {
    events: ["cast"],
    means: "a bare damage spell's dice were rolled by the module at its targets — Heat Metal's class (damage-casts.js); on the cast's card",
    resolved: (r, ctx) => whole(["cast"], {
      actor: source(r) ?? ctx.actorUuid, item: ctx.itemUuid, activity: ctx.activityUuid, ability: r.key ?? null,
      details: { activity: r.activity ?? null, scaling: r.scaling ?? 0, save: r.save ?? null, key: r.key ?? null }
    })
  },

  /* volley ------------------------------------------------------------------------------------- */

  volley: {
    events: ["volley"],
    means: "a volley's darts or rays were assigned and fired (volleys.js); resolved when `status` is resolved",
    resolved: (r, ctx) => (r?.status === "resolved") ? whole(["volley"], {
      actor: source(r) ?? ctx.actorUuid, item: ctx.itemUuid, activity: ctx.activityUuid,
      targets: volleyTargets(r.assignment),
      details: { kind: r.kind ?? null, n: r.n ?? null, assignment: r.assignment ?? null }
    }) : []
  },

  /* choice ------------------------------------------------------------------------------------- */

  emanationCard: {
    events: ["choice"],
    means: "an emanation's damage type was chosen by its caster (emanations.js); resolved when `chosen` is set",
    resolved: (r, ctx) => r?.chosen ? whole(["choice"], {
      actor: source(r) ?? ctx.actorUuid, item: ctx.itemUuid, activity: ctx.activityUuid, ability: r.item?.name ?? r.name ?? null,
      details: { type: r.damageType ?? null, why: r.damageWhy ?? null }
    }) : []
  },

  areaChoice: {
    events: ["choice"],
    means: "a spell that chooses its targets (Slow, Sleep — the Chosen Areas list) was told who its area affects by its caster (saves/demand.js raises the ask, metamagic.js answers it); resolved when `asked` — the default written because there was nothing to choose is no one's decision and publishes nothing",
    resolved: (r, ctx) => r?.asked ? whole(["choice"], {
      actor: source(r) ?? ctx.actorUuid, item: ctx.itemUuid, activity: ctx.activityUuid, itemName: r.spell ?? null, ability: r.spell ?? null,
      targets: (r.chosen ?? []).map(t => row(t)),
      details: { chosen: (r.chosen ?? []).map(c => c.name), left: (r.left ?? []).map(c => c.name), cap: r.cap ?? null, timedOut: !!r.timedOut }
    }) : []
  },

  castApply: {
    events: ["choice"],
    means: "a cast's alternative effect was chosen — Fire Shield's warm or chill (cast.js); resolved when `choice.chosen` is set. The application itself is the effect receipt's resolve",
    resolved: (r, ctx) => r?.choice?.chosen ? whole(["choice"], {
      actor: ctx.actorUuid, item: ctx.itemUuid, activity: r.activityUuid ?? ctx.activityUuid,
      targets: (r.targets ?? []).map(t => row(t)),
      details: { chosen: r.choice.chosen, options: r.choice.options ?? [] }
    }) : []
  },

  /* metamagic ---------------------------------------------------------------------------------- */

  metamagic: {
    events: ["metamagic"],
    means: "a Metamagic option was applied to the cast and its points spent (metamagic.js); resolved when `spent` is set on the spell's card",
    resolved: (r, ctx) => r?.spent ? whole(["metamagic"], {
      actor: ctx.actorUuid, item: ctx.itemUuid, activity: ctx.activityUuid, itemName: r.feature ?? null, ability: r.feature ?? null,
      details: { key: r.key ?? null, feature: r.feature ?? null, cost: r.cost ?? null, ...(r.type ? { type: r.type } : {}) }
    }) : []
  }
});

/**
 * EVERY OTHER KEY THE MODULE WRITES, and why it is state rather than a resolve. The checker fails
 * on a key in neither list, in both, or listed here but no longer written. ⚠ A reason is a sentence
 * somebody will read — the checker refuses reasons under 20 characters.
 */
export const STATE_KEYS = Object.freeze({
  // the hold's lifecycle and provenance
  attackFor: "provenance — the attack a damage roll answers (auto-damage.js)",
  notApplied: "a damage card's line — dice rolled on an attack every judged target was missed on (a Portent face, a Shield, a plain miss): nothing applied, the card says why (auto-apply.js, receipts.js); presentation of the attack's resolve",
  attackHoldPending: "the offer is waiting on a hold; the hold's answer is the resolve",
  autoCrit: "provenance — the crit was auto-applied to the damage config",
  damageOffer: "the offer window's own state (open, answered); the die it offers resolves as hitManeuver, clockRiders, sneakDamage",
  spellHoldPending: "the spell's damage is waiting on a hold; the hold's answer is the resolve",
  spellDamage: "a no-attack damage card claimed at birth for the elect's applier (polish.js, hold/spell-damage.js); the receipt is the resolve",
  holdSkipped: "a hopeless hold skipped in silence — a stat, never presented",
  reactionEffect: "an ActiveEffect's fingerprint — the reaction's own effect on the reactor; its landing is the effect receipt's resolve",
  applied: "an ActiveEffect's fingerprint — written by the module's applier; its landing is the effect receipt's resolve",
  // envelopes — a player's answer travelling as their own message for the elect to fold (the relay)
  respondsTo: "an envelope — the card this message answers; the fold onto that card is the resolve",
  uuid: "an envelope field beside respondsTo — which target answered",
  answer: "an envelope field beside respondsTo — what was answered",
  ac: "an envelope field beside respondsTo — the AC the reaction produced",
  effectLanded: "an envelope field beside respondsTo — whether the reaction's effect had arrived",
  reduceBy: "an envelope field beside respondsTo — Parry's roll, carried to the fold",
  bent: "an envelope field beside respondsTo — a `roll` answer's bent d20 (Slice A), carried to the fold",
  rescue: "an envelope field beside respondsTo — which `roll` row bent the roll (Slice A), carried to the fold",
  weaponRolls: "provenance — how many of an attack's damage rolls are the activity's own, counted before any rider (auto-damage.js); Savage Attacker rerolls those",
  sweepAnswer: "an envelope — the sweep's pick; the fold onto sweepCard is the resolve",
  saveChoiceAnswer: "an envelope — a save-side choice; the fold onto the saves flag is the resolve",
  riposteAnswer: "an envelope — a reactor's answer; the fold onto the riposte flag is the resolve",
  rebukeAnswer: "an envelope — a rebuke's answer; the fold onto the rebuke flag is the resolve",
  damageHoldAnswer: "an envelope — a damage hold's answer; the fold onto the damageHold flag is the resolve",
  dropToOneAnswer: "an envelope — a drop-to-1 answer; the fold onto the dropToOne flag is the resolve",
  dropToOneSave: "provenance — the save roll a `save` row demanded of the creature it held at 1 (Undead Fortitude, drop-to-one.js); the dropToOne record on the card is the resolve",
  deathThroes: "the demand card a `died` row raised at the corpse (Death Throes, drop-to-one.js) — beside the saves record, which is the resolve",
  kitTendAnswer: "an envelope — a player's kit-tending answer; the fold onto the kitTend flag, landed by the elect, is the resolve",
  kitTendFor: "a back-link — the heal a kit's tending drove, pointing at the kit's card; the kitTend flag there is the resolve",
  initiativeGrantAnswer: "an envelope — a player's answer to an Initiative grant's offer; the fold onto the initiativeGrant flag, landed by the GM, is the resolve",
  initiativeGrantRead: "a combat flag — the once-per-combat latch of which combatants' Initiative grants were read; initiativeGrant on the card is the resolve",
  initiativeBonusDue: "a combat flag — the Initiative bonus a `to: \"allies\"` grant (Tandem Footwork, B4) owes to combatants who had not rolled when it landed; cleared as each rolls, the initiativeGrant card is the resolve",
  conditionEndAnswer: "an envelope — a player's answer to a condition-end offer, relayed to the GM who lands it; the fold onto the conditionEnd flag is the resolve",
  initiativeSwapAnswer: "an envelope — a player's Initiative swap answer; the fold onto the initiativeSwap flag, landed by the elect, is the resolve",
  initiativeSwapAsked: "a combat flag — the once-per-combat latch of who was asked about an Initiative swap; initiativeSwap on the card is the resolve",
  storedDice: "an effect field — a STORED_DICE chip's faces and the turn one was spent (Portent); the bent roll's record (hold, bystanderRoll) or the roll itself is the resolve",
  storedAsk: "a rest card's ask — the stored dice the bearer owes a roll for (Portent: the player rolls them, 2026-10-14); the roll message (storedFor) is the record",
  storedFor: "a back-link — the roll message the rest's stored dice landed on, pointing at the rest card; the storedAsk flag there is the ask",
  storedRolled: "a roll message's line — the stored dice the rest's roll kept (Portent); the chip on the bearer is the state",
  storedUsed: "a roll message's line — the stored face that replaced its d20 (Portent); the roll is the record",
  castRider: "a usage card's line — the Wild Magic Surge d20 and whether the table rolled (cast-riders.js); the table's own card is the platform's, the Tides of Chaos use the sheet's",
  restSongAnswer: "an envelope — a player's picks for a rest song; the fold onto the restSong flag, landed by the elect, is the resolve",
  emanationTypeAnswer: "an envelope — the caster's type pick; the fold onto emanationCard is the resolve",
  momentAck: "an envelope — a notice acknowledged; presentation, not a moment",
  diceRise: "presentation — a roll message's chips for dice-rise.js to draw on every client; the roll it rides is the record, never a moment",
  // arms, picks and provenance before the resolve
  hitPick: "the hit menu's pick before the die rolls; hitManeuver on the damage message is the resolve",
  hitManeuverCard: "the follow-up save card the hit menu drove; its effects land as effect receipts and its verdicts as saves",
  cunning: "the Cunning Strike picks armed on the attack; sneakDamage on the damage message is the resolve",
  sneak: "the Sneak Attack arm on the attack (and rolled:true after); sneakDamage is the resolve",
  clockPick: "the offer's rider picks before the die rolls; clockRiders on the damage message is the resolve",
  lungePick: "Lunging Attack's tick on the offer; superiorityRide is the resolve",
  foldSpend: "provenance — a fold's use() is the rescue's spend, so the arming hook stands aside",
  tacticalArmed: "Tactical Assessment or Ambush armed from the sheet (its own card); the fold into the check is the d20fold resolve",
  bashFor: "provenance — the driven bash's usage card names the offer it answers",
  bashUsed: "an actor flag — the once-per-turn stamp; bashOffer is the resolve",
  shoveUsed: "an actor flag — Tavern Brawler's once-per-turn stamp; bashOffer (kind shove) is the resolve",
  crushUsed: "an actor flag — Crusher's once-per-turn push stamp (SHOVES); bashOffer (kind shove) is the resolve",
  riposteUse: "provenance — the maneuver's use names the riposte it answers",
  riposteFor: "provenance — the driven attack names the riposte it answers",
  riposteBy: "provenance — the driven attack names the reactor",
  rebukeFor: "provenance — a rebuke's driven use or attack names the offer it answers",
  atZero: "on a damage card: the defender whose reduction took it to 0 used the feature's own activity at the attacker (Deflect Attacks' Redirect, A1) — a latch; the save activity's own card and the saves machine's verdict are the resolve",
  failDamage: "on a usage card: the rider a hit reaction's cast carried (Beguiling Defenses, B2) — copied onto the saves flag at the stamp; the verdict and its damage receipt are the resolve",
  twistFor: "provenance — the driven save (Beguiling Twist, B2) names the bystander roll it answers",
  alsoHeal: "the pick on a healing spell's card of one more creature for a feature's own heal (Starry Form's Chalice, A1) — a latch; the heal's own card and its receipt are the resolve",
  option: "an ITEM flag — the option a feature's character took, which the sheet never records (Hunter's Prey, A1): asked once on the damage offer, cleared by the card's Change; the clockRiders record and the hewNotice card are the moments",
  opportunity: "provenance — the driven attack is an Opportunity Attack (Sentinel's Guardian, the PHB feats group 6); the Halt rider reads it, the clockRiders record is the resolve",
  command: "Commander's Strike directed at an ally — the notice and the chip; the die riding the ally's attack (commandRide) is the resolve, and the use posted its own card",
  reminder: "a gate's reminder record — presentation before the roll",
  restGrant: "a rest card's grant line — presentation; the sheet write rode the rest's own update",
  restBlock: "a rest card's block line (rest-grants.js, Cursed Touch) — presentation; the rest's emptied update rode the rest's own",
  restSpent: "a Short Rest card's Hit Dice spent (the PHB feats, group 5) — a fact the Chef's meal reads; the restSong flag is the resolve",
  mealFed: "an ACTOR flag — a Chef's meal an eater still resting carries to its own rest's end (the PHB feats, group 5); the meal's card is the record, the restSong flag the resolve",
  grappleDamageAnswer: "an envelope — a player's Unarmed Fighting answer (deal or skip); the fold onto the grappleDamage flag is the resolve",
  by: "an envelope field beside respondsTo — the GUARD who answered a held target (Protection, 2026-09-26); the fold onto the hold flag is the resolve",
  bystanderRollAnswer: "a message flag — a bystander's answer to another creature's save or check, relayed to the roll's keeper (bystanders.js); the envelope, the roll's `bystanderRoll` is the resolve",
  rerollUsed: "an ActiveEffect flag on the RAGE effect — the `reroll` folds spent this Rage (Fanatical Focus, B1); gone with the Rage, the spend itself is the d20fold resolve",
  bystanderMute: "an ActiveEffect flag — the mute (Q2 option A, 2026-09-29; the scopes RULINGS *The asks widened*): the bystander feature its bearer muted, `until` its next turn or the combat's end (`combat` null: until the next combat); a player's preference, swept at the turn or with the combat, no resolve",
  protectedBy: "an ActiveEffect flag — the guard whose Protection landed \"Protected — <guard>\" on the creature it protected (2026-09-26); provenance, the hold is the resolve",
  fightingStyle: "a damage message's record — a fighting style's number that rode the roll (Great Weapon Fighting's raised dice, Thrown's and Dueling's +2, Two-Weapon's modifier): the card's line, the float, the stats' gain; and the same key on a style's FACE effect (its key, live, its line). Presentation and bookkeeping — the number rode the roll's own config (damage-rules.js, 2026-09-26)",
  armorBlock: "presentation — an actor flag riding the damage's own update: what Heavy Armor Master cut from an attack, for every client to pop \"−N\" over the armored creature; the damage receipt is the record (damage-rules.js, 2026-09-26)",
  fightingStyleTakenOver: "an ActiveEffect flag — the pack's own ungated effect on a Fighting Style feat, switched off while the style's face carries the rule; bookkeeping, restored when the style is unlisted (damage-rules.js, 2026-09-26)",
  coverMeasured: "an attack card's line — the cover on every attack while it is measured (the 2024 DMG's corner lines; No Cover included, a hand-set status named when it wins) and put on the recorded AC; presentation, the AC rode the card's own recorded targets (reminders.js, 2026-09-27)",
  coverIgnored: "an attack card's line — the cover a feat ignored (Sharpshooter, Spell Sniper); presentation, the AC it took off rode the card's own recorded targets",
  unarmedDice: "a damage card's line — Tavern Brawler's die rolled in place of the flat Unarmed Strike; presentation, the formula rode the roll's own config",
  volleyFor: "provenance — a volley's roll names its card",
  volleyTarget: "provenance — a volley's roll names its target",
  volleyDarts: "provenance — a volley's roll names its dart count",
  volleyRay: "provenance — a volley's roll names its ray",
  savesDeferredRoll: "the caster's deferred damage roll while the saves are pending; the verdicts are the resolve",
  saveAutoFail: "the Fails press on the roll message; the verdict on the saves flag is the resolve",

  damageSaveCard: "the save card a damage cast drove; its verdicts land on the saves flag",
  damageShields: "the shield judgement's claim on the damage message (paid, judged) — a latch; damageShield on the ward's roll is the resolve",
  shield: "an ActiveEffect's fingerprint — the standing ward; shieldMark is its raising and damageShield its strike",
  shieldEnded: "a notice — Armor of Agathys ended with its pool; presentation",
  emanationType: "the type set on an emanation's damage roll; the choice on emanationCard is the resolve",
  emanationHeal: "a button on the emanation's card — the heal's use posts its own card",
  emanationPulse: "the card a pulse ring posts at its bearer's turn end (Inner Radiance, 2026-09-25) — the receipt on the same card is the resolve",
  gearLight: "a gear light's press on its receipt card (gear-lights.js) — the effectReceipt a lighting writes is the resolve; on an ActiveEffect, the light's fingerprint (its item and state)",
  tokenLight: "a token light's payload on the use's card and what landed, or on an `out` use's card how many lights it put out and a light set on the token itself (token-lights.js) — the effectReceipt it writes is the resolve; on an ActiveEffect, the light's fingerprint",
  formChip: "an ActiveEffect's fingerprint — the transformation form a clock rider reads (Celestial Revelation's Necrotic Shroud, clock-riders.js)",
  spellRider: "the caster's pick of the ONE target a spell's extra damage goes to, on the spell's damage card; spellRiderCard is the resolve",
  emanationRemind: "a reminder on the emanation's card — presentation",
  emanationPick: "the card a `pick` ring posts at its bearer's turn start (Wrath of the Sea, B5) — who stands inside, the one chosen (`picked`) and whether the demand went out (`demanded`); the saves record on the demand it raises is the resolve",
  emanationPickChoice: "an envelope — the bearer's creature pick on the emanationPick card; the fold onto emanationPick is the resolve",
  metamagicAsk: "the ask at the area pending on the card (area-ask.js; the key is historical); the answer's records — the metamagic record, areaChoice, the demand — are the resolves",
  metamagicDeferred: "the held card's data while Careful asks; the real card's records are the resolves",
  metamagicType: "the type Transmuted Spell set on the damage roll; the metamagic record on the card is the resolve",
  companion: "an ActiveEffect flag on a companion's OWNER — the message id of the summon card it names (summons.js); the effect is a marker, the card's record holds the companion",
  companionEnd: "a delete option, not a flag — the elect's own removal of a companion's effect, which the owner's removal prompt lets pass (summons.js)",
  commandOf: "an Item flag on a summoned creature's command spell — the spell whose command it is (summons.js); a marker, nothing is published",
  restEnded: "a rest card's line — what the rest ended on the rester (rest-grants.js); the deletions are the system's own, nothing is published",
  summonCard: "a token flag on a landed summon and an ActiveEffect flag on its caster's shared resistance — the message id of the summon card; a landing re-driven after its claimant left removes what carries it first, the card's record is the resolve (summons.js)",
  summonEffect: "an ActiveEffect flag on the caster of a summon without Concentration — the message id of the summon card; removing the effect asks the dismissal, the card's record is the resolve (summons.js)",
  summonEnd: "a delete option, not a flag — the elect's own removal of a summon's standing effect, which asks no second dismissal (summons.js)",
  lightOn: "a use option, not a flag — where the summon menu put a light spell (token or object), read by summons.js and token-lights.js at the use",
  concentrationAsked: "a use option, not a flag — the caster answered the end-Concentration question before a cast that skips the usage dialog (shared.js)",
  leadWindow: "a User flag on a GM — the id of the window that leads when the game is open in two (core.js leadsWindow); claimed on load and focus, cleared on close",
  wardPool: "an ActiveEffect flag on the WARDED creature — an effect ward's hit points (Bastion of Law, B4: `{ feature, left, max }`), lowered as damage lands, the effect gone at 0; the wardAbsorb record on the bearer's update is the resolve",
  healSelf: "a card — a `self` heal-reroll row's own healing (Blessed Healer, B4) after the owner's slot-cast heal landed on another creature; the receipt on the same card is the resolve",
  wardAbsorb: "an actor field — the ward's take on its bearer's damage update, for the pop on every client; the receipt is the resolve",
  wardRefill: "a usage card's line — the ward created or refilled by an Abjuration cast; the item's uses are the state",
  metamagicFree: "a free class-feature tick in the casting window (Psychic Spells) - no spend, no answer; the damage roll's type is the result",
  healPending: "a heal claimed at creation for the elect to apply; the receipt is the resolve",
  masteryNotice: "a mastery reminder — presentation",
  masteryFill: "the GM's whisper — which kinds the fill wrote into the sheet's mastery list and for whom (issue #3); the sheet's list is the state, the attack the system stamps is the resolve",
  masterySwapAnswer: "an envelope — a player's swap answer; the fold onto the masterySwap flag, landed by the elect, is the resolve",
  formSwapAnswer: "an envelope — a player's known-form answer; the fold onto the formSwap flag, landed by the elect, is the resolve",
  form: "an ActiveEffect field — the form effect's tie to its transform record (the card, the original creature, the row); its removal ends the form",
  knownForms: "an Item field — the Known Forms a Wild Shape item holds (uuid, name, art); the transform record (a form learned at the use) and the formSwap record (the Long Rest's change) are the resolves",
  lastForm: "an Item field — the form last taken through the item (transforms.js; a summon spell's profile, summons.js), marked on its row at the next use; presentation",
  petNames: "an Actor field on a caster — the name it last gave its companion of each COMPANIONS `names` spell (summons.js), the next summon menu's name field pre-filled with it; the summon record's landing is the resolve",
  empowerEffect: "an ActiveEffect flag on the caster of a SUMMON_EMPOWERS spell — the message id of the transform card its empowered companion stands on; removing the effect asks the revert, the transform record's `ended` is the resolve (summons.js, transforms.js)",
  empowerEnd: "a delete option, not a flag — the elect's own removal of the empower effect as the form ends, which asks no second revert (transforms.js, summons.js)",
  formEnd: "the card a form's end posts (transforms.js) — the clock, Concentration, Incapacitated, 0 Hit Points, the Temporary Hit Points gone, or a revert; the `ended` stamp on the transform record is the resolve",
  cleaveArm: "Cleave armed for the extra attack; that attack is a real roll with its own card",
  cleaveStripped: "provenance — the armed Cleave's second attack shed its riders",
  timedOut: "the buzzer's mark on a roll it made; the verdict it lands is the resolve",
  hewNotice: "Hew's reminder card — presentation",
  hewNoticed: "the reminder's once-per-swing latch — presentation",
  swingNoticed: "the attack-trigger bonus swing's dedupe (Pole Strike, 2026-09-27) — the hewNotice card is the moment",
  poleStrike: "provenance — the driven Pole Strike swing names the offer it answers (2026-09-27); the attack's own card is the record",
  poleStrikeDie: "a damage card's line — Pole Strike's d4 Bludgeoning in place of the weapon's die; presentation, the receipt is the resolve",
  rollCtx: "the data plane's roll context stamp — stats, never a moment",
  combatRoster: "the data plane's turn→actor map — stats, never a moment",
  // effect fingerprint fields (the chips), never on a message
  useKey: "an ActiveEffect field — which use-chip this is",
  against: "an ActiveEffect field — the ONE creature a use chip is against (Studied Attacks, B3); the roll at it that spends the chip (chipSpend) is the resolve",
  coat: "an ActiveEffect field — which coating this chip is (use-chips.js COATINGS: the Poisoner's Poison Coating)",
  riderSave: "provenance on a usage card — a DMG weapon rider's save (clock-riders.js `save`): the save alone, no damage rolled; the saves verdict is the resolve",
  cardKey: "an ActiveEffect field — which card-chip row wrote this chip (Tinker's Tiny Clockwork Device)",
  stacks: "an ActiveEffect field — a deliberate stack, one chip per device; the twin-chip dedupe leaves it alone (effect-riders.js)",
  die: "an ActiveEffect field — the die a chip carries",
  sourceUuid: "an ActiveEffect field (and every record's stat stamp) — who wrote it",
  sourceName: "an ActiveEffect field — who wrote it, by name",
  cardId: "an ActiveEffect field — the card that wrote it",
  riderKey: "an ActiveEffect field — which rider's turn chit this is",
  armed: "an ActiveEffect field — a scoped fold armed from the sheet (the die, its skills); the fold into the check is the d20fold resolve",
  // region and template fingerprints (emanations.js), never on a message
  emanation: "a Region's or template's fingerprint — the aura's kind, key, source token and who stood inside at the cast",
  migratedFrom: "provenance on a RegionBehavior the migration recreated under the new scope (decide/migrate.js): the id of the behaviour it replaced, so a retried load never creates a second",
  emanationTrigger: "the demand card an emanation's region raised on a creature — beside the saves record, which is the resolve",
  repeatSave: "the demand card a landed effect's repeated save raised (repeat-saves.js) — beside the saves record, which is the resolve; `settled` and `says` what the verdict did to the effect (the cast card's effectReceipt carries the removal)",
  repeatOffer: "a notice at the bearer's turn start — its own action can repeat the save (Otto's Irresistible Dance); the button raises the demand card",
  repeatCount: "an ActiveEffect field — a counted repeat's tally and lock (Contagion, Flesh to Stone)",
  turnGrant: "the card a turn-start grant posts (turn-grants.js, Heroism's temp HP; Regeneration's heal on the bearer's own trait) — the receipt on the same card is the resolve; a `blocked` card (the troll's fire) carries no receipt and resolves nothing; a `grant: \"inspiration\"` card (Heroic Warrior, B4) records the sheet's own write, no receipt",
  ward: "the demand card a ward raised of whoever targeted its bearer (wards.js, Sanctuary) — beside the saves record, which is the resolve; `settled`, `outcome` and `says` whether the use went on or was turned aside",
  wardEnded: "the card a ward's end posts (wards.js) — its bearer's own attack roll, cast or damage roll ended it; the effect's deletion is the act",
  duplicatesSeen: "a line on the defender's side — the attacker sees through its duplicates (a status, a sense), so nothing was rolled (hold/trigger.js, Mirror Image)",
  damageShare: "the card a bond's share posts (damage-shares.js, Warding Bond) — the receipt on the same card is the resolve; `ended` when the caster's drop ended the bond",
  mishap: "provenance — on a dark gift's save card (mishaps.js): the D20 Test whose 1 raised it; the save's verdict is the saves machine's",
  healOnHit: "on the dealing card: the creatures whose landed damage already paid the caster (heal-on-hit.js, Vampiric Touch) — a latch; on the heal's own card, its facts, and the receipt there is the resolve",
  drain: "on the dealing card: the creatures already drained by it (drains.js, Life Drain) — a latch; on the drain's own card, its facts (the fall, the total, a score row's die), and the effect receipt there is the resolve",
  prismatic: "the ray table's claim on the cast's card (prismatic.js): pending until the cone stands, rolled once — the rays' demand cards are the moments",
  prismaticRays: "the summary card of a ray table's roll — a d8 per creature, presentation; the rays' demand cards are the moments",
  prismaticRay: "one ray's demand card (prismatic.js) — beside the saves record, which is the resolve; `settled` and `says` what a condition ray's verdict landed (the effectReceipt there carries it)",
  areaNotice: "the card an area's ban posts as a creature moves in or out (emanations.js, Magic Circle and Forcecage) — a notice, the move never paused; presentation",
  areaMove: "the card an area's move damage posts (emanations.js, Spike Growth) — the receipt on the same card is the resolve",
  emanationPickAnswer: "an envelope — the caster's band side or type pick on an area's card; the fold onto emanationCard is the resolve, and the region follows it",
  // the PHB classes, C1
  concentrationExempt: "presentation — the card for a Concentration save the ask machine did not demand (Relentless Hunter: damage never breaks Hunter's Mark; concentration.js); nothing was rolled, nothing to resolve",
  deathSaveOfferAnswer: "an envelope — a keeper's answer to the death save's offer (Searing Vengeance); the fold onto deathSaveOffer is the resolve",
  duplicatesSave: "provenance — the attacker's save a `save` duplicate demanded inside the hold (Unbreakable Majesty, hold/continue.js); the hold's verdict is the resolve",
  recoiled: "an ActiveEffect field — which attacker the Majestic Presence has already turned aside this turn, by combat turn (Unbreakable Majesty's once per turn per attacker)",
  auraRider: "presentation — the aura rider's line on the usage card (Smite of Protection's members); the effect receipts on the same card are the resolve",
  areas: "an ActiveEffect field on a concentration effect — the uuids of the regions its cast placed, the sweep's tie (emanations.js, 2026-09-19)",
  saveFor: "an envelope field beside respondsTo — the saves channel's target uuid"
});

/* --- the pure operations the spine and the tests share ---------------------------------------- */

/**
 * Every resolved moment in one record, or [] when the key is not registered or the record is
 * empty. A row that throws is a row with a bug, and the caller decides how loud to be.
 * @param {string} key
 * @param {any} record
 * @param {MomentCtx} ctx
 * @returns {ResolvedMoment[]}
 */
export function resolvedMoments(key, record, ctx) {
  const rowDef = MOMENT_RECORDS[key];
  if ( !rowDef || (record === null) || (record === undefined) ) return [];
  return rowDef.resolved(record, ctx) ?? [];
}

/**
 * The latch id of one resolve — what the spine remembers so a marker publishes once per client.
 * @param {string|null} messageId
 * @param {string} key
 * @param {string} marker
 */
export const momentId = (messageId, key, marker) => `${messageId ?? "?"}|${key}|${marker}`;

/**
 * The resolves not yet in the latch, in record order. Pure: the caller adds them to the latch
 * after publishing (or after deciding not to — a client that is not the publisher still remembers).
 * @param {string|null} messageId
 * @param {string} key
 * @param {ResolvedMoment[]} moments
 * @param {Set<string>} latch
 */
export function newMoments(messageId, key, moments, latch) {
  return moments.filter(m => !latch.has(momentId(messageId, key, m.marker)));
}

/** Is this word in the vocabulary? */
export const isMomentWord = word => MOMENT_WORDS.includes(word);

/** The record keys, for the contract's `kinds`. */
export const MOMENT_KINDS = Object.freeze(Object.keys(MOMENT_RECORDS));
