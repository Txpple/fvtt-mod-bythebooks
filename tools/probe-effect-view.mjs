// THE EFFECT VIEW, live: the bar above the hotbar for the controlled token, the hover card beside
// a token, the held key (Foundry's highlightObjects) over every creature. A battery entry (it is
// the only suite driving effect-view.js's hooks); `fixture-suite` seeds it.
// Fixtures: the By the Books Test Range and BTB Test Vanguard (fixture-suite) wearing an attuned Cloak
// of Protection. Bless, Prone and an applied clockless effect are written for the run; its token is
// placed if missing. Switches, effects, sheet numbers, token and active scene are all restored.
//
//   node tools/probe-effect-view.mjs              the whole probe
//   node tools/probe-effect-view.mjs --section 2  just §2; `--list` for the table
// Setup and teardown ALWAYS run.
import { announcePlan, connectSuite, finish, sectionArg, sectionPlan } from "./harness.mjs";

// The coverage map (tools/coverage-map.mjs) parses this; ⚠ never import a suite (it connects on evaluation).
export const COVERS = ["effect-view.js"];

const SECTIONS = {
  1: "the bar: drawn above the hotbar for the controlled token — debuffs first, the sheet rows after the effects, the clockless tagged, never \"None\"",
  2: "the hover card: none for a controlled token; for a released one the same list, gone when the hover ends",
  3: "the held key (highlightObjects): a card for every creature with effects, cleared on release",
  4: "the bar follows the sheet: an effect deleted, its chip leaves",
  5: "the client switch off removes the bar (effectViewChanged)",
  6: "the bar's actions: the fold with Remove, Remove deletes, Clear zeroes temp HP, the name's full panel, Escape closes",
  7: "a switching fighting style stands on the bar: Dueling green and last with one Longsword, red with why once a Javelin joins it, never on the hover card"
};
const DEPENDS = {};

const TAG = "probe-effect-view";
const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: TAG, watchdogMs: 180_000 });
announcePlan(TAG, plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const MOD = "fvtt-mod-bythebooks";
  const { until, watch, tokenOn, viewScene } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });

  // ---- preflight
  const mod = game.modules.get(MOD);
  if ( !mod?.active ) return { fatal: `module active=${mod?.active}` };
  if ( !game.settings.settings.has(`${MOD}.effectBar`) ) return { fatal: "effectBar not registered — OLD code (deploy --local, reload)" };
  const scene = game.scenes.getName("By the Books Test Range");
  const vanguard = game.actors.getName("BTB Test Vanguard");
  if ( !scene || !vanguard ) return { fatal: `missing fixture: ${!scene ? "the By the Books Test Range (run tools/fixture-suite.mjs)" : "BTB Test Vanguard (run tools/fixture-suite.mjs)"}` };
  // §1 and §6e read the Cloak of Protection fixture-suite gives the Vanguard: refuse up front if it is missing.
  const standing = [...vanguard.allApplicableEffects()].map(e => e.name);
  if ( !standing.some(n => n.startsWith("Bonus AC")) ) return { fatal: "BTB Test Vanguard lacks the Cloak's \"Bonus AC\" passive — run tools/fixture-suite.mjs" };
  log.push(`module ${mod.version}`);

  const priorActiveScene = game.scenes.active?.id ?? null;
  const placed = [];
  const priorBar = game.settings.get(MOD, "effectBar"), priorHover = game.settings.get(MOD, "effectHover");
  let made = [];
  let seeded = [];
  let lent = [];          // §7's Dueling, Longsword and Javelin, deleted after
  let unequipped = [];    // §7's weapons and shields taken out of the hands, put back after
  const CLOCKLESS = "Death Armor (probe)";
  let priorSheet = null;
  try {
    // ---- setup (always runs)
    await game.settings.set(MOD, "effectBar", true); await game.settings.set(MOD, "effectHover", true);
    // An activation redraws the canvas on its own: let that draw begin before viewing.
    if ( game.scenes.active?.id !== scene.id ) { await scene.activate(); await until(() => canvas.scene?.id === scene.id, { timeout: 8000 }).catch(() => null); }
    await viewScene(scene, { timeout: 8000 });
    let doc = scene.tokens.find(t => t.actorId === vanguard.id);
    if ( !doc ) {
      [doc] = await scene.createEmbeddedDocuments("Token", [foundry.utils.mergeObject(vanguard.prototypeToken.toObject(), { x: 500, y: 1400, actorId: vanguard.id, actorLink: true }, { inplace: false })]);
      placed.push(doc.id);
    }
    const token = await tokenOn(doc.id).catch(() => null);
    if ( !token ) return { fatal: `the Vanguard's token ${doc.id} is not on the canvas`, results, log, skips };

    // two effects the sheet lists: a status (Prone, paints an icon) and a timed buff (Bless, no icon)
    made = await vanguard.createEmbeddedDocuments("ActiveEffect", [
      { name: "Bless", img: "icons/svg/upgrade.svg", duration: { seconds: 60 }, changes: [] },
      // showIcon ALWAYS, as the token's own condition toggle writes it: a status alone draws nothing (Foundry's rule)
      { name: "Prone", img: "icons/svg/falling.svg", statuses: ["prone"], showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS, changes: [] }
    ]);
    // ⚠ By NAME, never by index: the created documents do not come back in the order asked for. In 5
    // of 14 runs (2026-10-10..12) Prone came first, §4 deleted Prone instead of Bless and §4/§6/§6c
    // went red together; the actor's own effect order showed the same flip every time.
    const madeBless = made.find(e => e.name === "Bless");
    const madeProne = made.find(e => e.name === "Prone");
    // An applied, clockless effect, always the run's own: a real cast at the table is clocked (an
    // empty clock takes the spell's), so reusing his would test play state, not the class.
    seeded = await vanguard.createEmbeddedDocuments("ActiveEffect", [
      { name: CLOCKLESS, img: "icons/svg/skull.svg", changes: [] }
    ]);
    log.push(`seeded an applied, clockless "${CLOCKLESS}" for the run`);
    const facts = [...vanguard.allApplicableEffects()].filter(e => e.isTemporary || e.statuses.size).map(e => ({ name: e.name, active: e.active, temporary: e.isTemporary, statuses: [...e.statuses], label: e.duration?.label ?? null }));
    log.push(`facts: ${JSON.stringify(facts)}`);

    // THE SHEET ROWS: temp HP and Heroic Inspiration are numbers on the sheet, not effects
    priorSheet = { temp: vanguard.system.attributes.hp.temp, insp: vanguard.system.attributes.inspiration };
    await vanguard.update({ "system.attributes.hp.temp": 7, "system.attributes.inspiration": true });

    // Control the token so the bar draws; read in setup because §2's card is held to the same list.
    token.control({ releaseOthers: true });
    // The Vanguard's own bar, drawn after the control (the sheet writes above it coalesce into that draw); §1 reports a missing one.
    const bar = await until(() => { const b = document.getElementById("bf-effect-view-bar"); return (b && !b.classList.contains("empty") && b.querySelector(".bf-ev-chip") && (b.dataset.actor === vanguard.uuid)) ? b : null; }, { timeout: 8000 }).catch(() => null);
    const barNames = bar ? [...bar.querySelectorAll(".bf-ev-chip .nm")].map(n => n.textContent) : [];
    // A standing fighting-style face is the bar's alone (§7): the hover card is held to the rest.
    const standingCount = bar ? bar.querySelectorAll(".bf-ev-chip.standing").length : 0;

    // ---- 1. the bar
    if ( want(1) ) await section(1, async () => {
      ok("1. the bar draws above the hotbar for the controlled token: Prone (debuff) first, Bless and the applied Death Armor listed, the worn Cloak not",
        !!bar && (barNames[0] === "Prone") && barNames.includes("Bless") && barNames.includes(CLOCKLESS) && !barNames.some(n => n.startsWith("Bonus AC")), `chips=${JSON.stringify(barNames)}`);
      const tempChip = bar ? [...bar.querySelectorAll(".bf-ev-chip")].find(c => c.querySelector(".nm")?.textContent === "Temporary HP") : null;
      ok("1e. the sheet rows — Temporary HP 7 and Heroic Inspiration listed as buffs, after the effects, with no clock glyph",
        !!tempChip && (tempChip.querySelector(".dtl")?.textContent === "7") && !tempChip.querySelector(".clk") && barNames.includes("Heroic Inspiration")
          && (barNames.indexOf("Temporary HP") > barNames.indexOf("Bless")), `chips=${JSON.stringify(barNames)} detail=${tempChip?.querySelector(".dtl")?.textContent}`);
      const hot = document.getElementById("hotbar")?.getBoundingClientRect(), br = bar?.getBoundingClientRect();
      ok("1b. it sits above the hotbar", !!hot && !!br && (br.bottom <= hot.top), `bar.bottom=${br?.bottom} hotbar.top=${hot?.top}`);
      const tagged = bar ? [...bar.querySelectorAll(".bf-ev-chip")].filter(c => c.querySelector("em")).map(c => c.querySelector(".nm").textContent) : [];
      ok("1c. the clockless Death Armor is tagged as painting no icon; Bless (clocked) and Prone (a condition) are not",
        tagged.includes(CLOCKLESS) && !tagged.includes("Bless") && !tagged.includes("Prone"), `tagged=${JSON.stringify(tagged)}`);
      ok("1d. a clockless row shows no clock at all — never the platform's \"None\"",
        !!bar && ![...bar.querySelectorAll(".bf-ev-chip .clk")].some(c => /none/i.test(c.textContent)), "");
    });

    // ---- 2. the hover card
    // The platform's hook, as a mouse-over fires it. Never for a CONTROLLED token (the bar is its
    // list), so the card is proved on the token released.
    if ( want(2) ) await section(2, async () => {
      Hooks.callAll("hoverToken", token, true);
      const stray = await watch(() => document.querySelector(`.bf-ev-card[data-token="${token.id}"]`), { ms: 150 });
      ok("2c. a controlled token gets no hover card — the bar is its list (2026-09-18)", !stray && !document.querySelector(`.bf-ev-card[data-token="${token.id}"]`), "");
      token.release();
      await until(() => !token.controlled, { label: "the Vanguard released" });
      Hooks.callAll("hoverToken", token, true);
      const card = await until(() => document.querySelector(`.bf-ev-card[data-token="${token.id}"]`), { timeout: 3000 });
      ok("2. the hover card appears for the token with the same list",
        !!card && (card.querySelectorAll(".bf-ev-chip").length === (barNames.length - standingCount)), `chips=${card?.querySelectorAll(".bf-ev-chip").length} bar=${barNames.length} standing=${standingCount}`);
      Hooks.callAll("hoverToken", token, false);
      await until(() => !document.querySelector(`.bf-ev-card[data-token="${token.id}"]`), { timeout: 3000, label: "the hover card gone" });
      ok("2b. and leaves when the hover ends", !document.querySelector(`.bf-ev-card[data-token="${token.id}"]`), "");
      token.control({ releaseOthers: true });
      await until(() => token.controlled, { label: "the Vanguard controlled again" });
    });

    // ---- 3. the held key
    // Foundry fires highlightObjects on Alt.
    if ( want(3) ) await section(3, async () => {
      Hooks.callAll("highlightObjects", true);
      const overlay = await until(() => document.querySelectorAll(".bf-ev-card").length ? document.querySelectorAll(".bf-ev-card") : null, { timeout: 3000 });
      ok("3. the held key shows a card for every creature with effects (the Vanguard at least)",
        !!overlay && [...overlay].some(c => c.querySelector("h4")?.textContent.includes("BTB Test Vanguard")), `cards=${overlay?.length}`);
      Hooks.callAll("highlightObjects", false);
      await until(() => document.querySelectorAll(".bf-ev-card").length === 0, { timeout: 3000, label: "the held-key cards cleared" });
      ok("3b. and clears on release", document.querySelectorAll(".bf-ev-card").length === 0, "");
    });

    // ⚠ Re-take the token before each bar section: a scene redraw can drop control and stale the
    // cached token object.
    const hold = async section => {
      const live = canvas.tokens.get(doc.id);
      if ( live && !live.controlled ) live.control({ releaseOthers: true });
      const held = await until(() => (canvas.tokens.controlled[0]?.actor === vanguard)
        && (document.getElementById("bf-effect-view-bar")?.dataset.actor === vanguard.uuid), { timeout: 3000 }).catch(() => null);
      if ( !held ) log.push(`§${section}: could not hold the Vanguard — controlled=${canvas.tokens.controlled.map(t => t.name).join(",") || "none"} `
        + `bar.actor=${document.getElementById("bf-effect-view-bar")?.dataset.actor ?? null} token=${!!live}`);
      return !!held;
    };

    // ---- 4. the bar follows the sheet
    // Delete Bless, the chip leaves.
    if ( want(4) ) await section(4, async () => {
      await hold(4);
      await vanguard.deleteEmbeddedDocuments("ActiveEffect", [madeBless.id]);
      const gone = await until(() => { const b = document.getElementById("bf-effect-view-bar"); const names = b ? [...b.querySelectorAll(".bf-ev-chip .nm")].map(n => n.textContent) : []; return names.includes("Bless") ? null : names; }, { timeout: 3000 });
      ok("4. the bar redraws when an effect is deleted", Array.isArray(gone) && !gone.includes("Bless") && gone.includes("Prone"), `chips=${JSON.stringify(gone)}`);
    });

    // ---- 6. the bar's actions
    // A chip opens a fold with Remove, for an owner. Runs before §5, whose switch takes the bar away.
    if ( want(6) ) await section(6, async () => {
      await hold(6);
      const barEl = () => document.getElementById("bf-effect-view-bar");
      const chipNamed = name => [...(barEl()?.querySelectorAll("button.bf-ev-chip") ?? [])].find(c => c.querySelector(".nm")?.textContent === name) ?? null;
      const proneChip = chipNamed("Prone");
      proneChip?.click();
      const fold = await until(() => barEl()?.querySelector(".bf-ev-fold"), { timeout: 2000 });
      const foldActions = fold ? [...fold.querySelectorAll("button")].map(b => b.dataset.action) : [];
      ok("6. a chip click opens a fold upward with Remove and nothing else (the GM owns every creature)",
        !!fold && foldActions.length === 1 && foldActions[0] === "remove",
        `actions=${JSON.stringify(foldActions)} proneChip=${!!proneChip} chips=${JSON.stringify([...(barEl()?.querySelectorAll(".bf-ev-chip .nm") ?? [])].map(n => n.textContent))}`);
      fold?.querySelector('button[data-action="remove"]')?.click();
      const proneGone = await until(() => vanguard.effects.get(madeProne.id) ? null : true, { timeout: 4000 });
      ok("6c. Remove deletes the effect, and the bar redraws without it",
        proneGone === true && !!(await until(() => chipNamed("Prone") ? null : true, { timeout: 3000 }).catch(() => null)), "");
      chipNamed("Temporary HP")?.click();
      const fold3 = await until(() => barEl()?.querySelector(".bf-ev-fold"), { timeout: 2000 });
      const clearLabel = fold3?.querySelector('button[data-action="clear"]')?.textContent ?? null;
      fold3?.querySelector('button[data-action="clear"]')?.click();
      const cleared = await until(() => (vanguard.system.attributes.hp.temp ?? 0) === 0 ? true : null, { timeout: 4000 });
      ok("6d. a sheet row's fold says Clear, and Clear zeroes the temp HP", clearLabel === "Clear" && cleared === true, `label=${clearLabel} temp=${vanguard.system.attributes.hp.temp}`);
      barEl()?.querySelector("button.who")?.click();
      const panel = await until(() => barEl()?.querySelector(".bf-ev-panel"), { timeout: 2000 });
      const panelNames = panel ? [...panel.querySelectorAll(".bf-ev-chip .nm")].map(n => n.textContent) : [];
      const panelLabels = panel ? [...panel.querySelectorAll(".bf-ev-lbl")].map(l => l.textContent) : [];
      ok("6e. the name opens the full list upward — ALL of it, grouped as the sheet groups it: the passives (the worn Cloak) join the temporaries, each row clickable",
        !!panel && panelNames.includes(CLOCKLESS) && panelNames.includes("Heroic Inspiration") && panelNames.some(n => n.startsWith("Bonus AC"))
          && panelLabels.includes("Temporary") && panelLabels.includes("Passive") && !!panel.querySelector("button.bf-ev-chip"),
        `groups=${JSON.stringify(panelLabels)} rows=${JSON.stringify(panelNames)}`);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await until(() => !barEl()?.querySelector(".bf-ev-panel"), { timeout: 3000, label: "the full panel closed" });
      ok("6f. Escape closes it", !barEl()?.querySelector(".bf-ev-panel"), "");
    });

    // ---- 7. a switching fighting style stands on the bar, live or off (2026-11-05, Kartor's Dueling)
    // Dueling, a Longsword and a Javelin lent from the PHB; every other weapon and shield out of the hands. The face
    // follows on the elect's debounce (damage-rules.js), the chip on the bar's redraw. Runs before §5, whose switch
    // takes the bar away.
    if ( want(7) ) await section(7, async () => {
      const findPHB = async (name, type) => {
        for ( const pack of game.packs.filter(p => (p.metadata.packageName === "dnd-players-handbook") && (p.documentName === "Item")) ) {
          const hit = (await pack.getIndex({ fields: ["type"] })).find(e => (e.name === name) && (e.type === type));
          if ( hit ) return pack.getDocument(hit._id);
        }
        return null;
      };
      const sources = await Promise.all([["Dueling", "feat"], ["Longsword", "weapon"], ["Javelin", "weapon"]].map(([n, t]) => findPHB(n, t)));
      if ( sources.some(s => !s) ) { skips.push("§7: the PHB's Dueling, Longsword or Javelin is not on this box"); return; }
      unequipped = vanguard.items.filter(i => (i.system?.equipped === true) && ((i.type === "weapon") || (i.system?.type?.value === "shield"))).map(i => i.id);
      if ( unequipped.length ) await vanguard.updateEmbeddedDocuments("Item", unequipped.map(id => ({ _id: id, "system.equipped": false })));
      lent = await vanguard.createEmbeddedDocuments("Item", sources.map(s => { const d = s.toObject(); if ( "equipped" in (d.system ?? {}) ) d.system.equipped = false; return d; }));
      const sword = lent.find(i => i.name === "Longsword"), javelin = lent.find(i => i.name === "Javelin");
      await hold(7);
      const barEl = () => document.getElementById("bf-effect-view-bar");
      const duelChip = () => [...(barEl()?.querySelectorAll(".bf-ev-chip") ?? [])].find(c => c.querySelector(".nm")?.textContent === "Fighting Style: Dueling") ?? null;

      await sword.update({ "system.equipped": true });
      const live = await until(() => { const c = duelChip(); return c?.classList.contains("buff") ? c : null; }, { timeout: 5000 }).catch(() => null);
      const chips = [...(barEl()?.querySelectorAll(".bf-ev-chip") ?? [])];
      ok("7. one Longsword in hand: Dueling stands on the bar, green, the last chip, why in its title",
        !!live && (chips.at(-1) === live) && /Longsword in one hand/.test(live.title), `title="${live?.title}" chips=${JSON.stringify(chips.map(c => `${c.querySelector(".nm")?.textContent}:${c.className}`))}`);

      await javelin.update({ "system.equipped": true });
      const off = await until(() => { const c = duelChip(); return c?.classList.contains("off") ? c : null; }, { timeout: 5000 }).catch(() => null);
      ok("7b. a Javelin beside it: Dueling stays on the bar, red, \"off: a second weapon held (Javelin)\"",
        !!off && /off: a second weapon held \(Javelin\)/.test(off.title), `title="${off?.title}" class="${duelChip()?.className}"`);

      const token = canvas.tokens.get(doc.id);
      token?.release();
      await until(() => !token?.controlled, { label: "the Vanguard released" }).catch(() => null);
      Hooks.callAll("hoverToken", token, true);
      const card = await until(() => document.querySelector(`.bf-ev-card[data-token="${token?.id}"]`), { timeout: 3000 }).catch(() => null);
      const cardNames = card ? [...card.querySelectorAll(".bf-ev-chip .nm")].map(n => n.textContent) : null;
      ok("7c. the hover card lists what is in force, never the standing face", !!card && !cardNames.includes("Fighting Style: Dueling"), `card=${JSON.stringify(cardNames)}`);
      Hooks.callAll("hoverToken", token, false);
      await hold(7);
    });

    // ---- 5. the switch
    // Off, the bar leaves — the setting's onChange publishes effectViewChanged, the bar's redraw hears it.
    if ( want(5) ) await section(5, async () => {
      await game.settings.set(MOD, "effectBar", false);
      const off = await until(() => document.getElementById("bf-effect-view-bar") ? null : true, { timeout: 3000 });
      ok("5. the client switch off removes the bar", off === true, "");
    });

    return { results, log, skips };
  } catch(err) {
    return { fatal: `${err?.message ?? err}\n${err?.stack ?? ""}`, results, log, skips };
  } finally {
    try { for ( const c of document.querySelectorAll(".bf-ev-card") ) c.remove(); } catch { /* fine */ }
    try { const ids = [...made, ...seeded].map(e => e.id).filter(id => vanguard.effects.get(id)); if ( ids.length ) await vanguard.deleteEmbeddedDocuments("ActiveEffect", ids); } catch(err) { log.push(`cleanup effects: ${err?.message}`); }
    try { const ids = lent.map(i => i.id).filter(id => vanguard.items.get(id)); if ( ids.length ) await vanguard.deleteEmbeddedDocuments("Item", ids); } catch(err) { log.push(`cleanup lent items: ${err?.message}`); }
    try { const back = unequipped.filter(id => vanguard.items.get(id)); if ( back.length ) await vanguard.updateEmbeddedDocuments("Item", back.map(id => ({ _id: id, "system.equipped": true }))); } catch(err) { log.push(`cleanup equipped: ${err?.message}`); }
    try { if ( priorSheet ) await vanguard.update({ "system.attributes.hp.temp": priorSheet.temp ?? 0, "system.attributes.inspiration": priorSheet.insp ?? false }); } catch(err) { log.push(`cleanup sheet: ${err?.message}`); }
    try { canvas.tokens?.releaseAll?.(); } catch { /* fine */ }
    try { if ( placed.length ) await scene.deleteEmbeddedDocuments("Token", placed); } catch(err) { log.push(`cleanup tokens: ${err?.message}`); }
    try { await game.settings.set(MOD, "effectBar", priorBar); await game.settings.set(MOD, "effectHover", priorHover); } catch { /* fine */ }
    try { const back = priorActiveScene ? game.scenes.get(priorActiveScene) : null; if ( back && (game.scenes.active?.id !== back.id) ) { await back.activate(); await until(() => canvas.ready && (canvas.scene?.id === back.id), { timeout: 4000 }).catch(() => null); } } catch { /* fine */ }
  }
}, sectionArg(plan, SECTIONS));

await finish({ tag: TAG, out, plan, f });
