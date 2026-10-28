// Live suite: THE THREE SURFACES NOTHING ELSE OPENS — the settings form, the activity usage
// dialog, and the measured-template CRUD seam. Every other suite passes `configure: false`, so
// these need a suite that reaches them on purpose.
//
// ⚠ Foundry 14 does NOT dispatch `createMeasuredTemplate`/`updateMeasuredTemplate`: a template
// create adds a Region and fires the Region hooks (tools/probe-surfaces.mjs). §3 pins that, so a
// platform that gives the names back FAILS here (ARCHITECTURE §10 D12).
//
//   node tools/smoke-surfaces.mjs [--list | --section N]
//
// ⚠ Disconnect the bridge. One suite at a time.
import { announcePlan, connectSuite, loadEnv, sectionPlan, sectionArg, finish }
  from "./harness.mjs";

const TAG = "smoke-surfaces";

// The machines this suite drives (tools/coverage-map.mjs parses this). ⚠ NEVER import a suite:
// it connects on evaluation.
export const COVERS = [
  "polish.js"               // §2 — the usage dialog's target block (renderActivityUsageDialog)
];

const SECTIONS = {
  1: "settings — the named settings registered in the ruled order and scope, the DM's world settings before the per-client preferences, and the pane showing every registered setting in that order",
  2: "usage dialog — a real ActivityUsageDialog renders and carries the target block",
  3: "templates — the pinned platform fact: v14 dispatches Region hooks, never MeasuredTemplate"
};
const DEPENDS = {};

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);

const f = await connectSuite({ tag: TAG, watchdogMs: 300_000, requireElect: true, env: loadEnv() });
announcePlan(TAG, plan, pulled);

const out = await f.evaluate(async ({ sections, titles }) => {
  const { until, watch, snapshotSettings } = window.__btb;
  const { results, log, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  let fatal = null;
  const MODULE_ID = "fvtt-mod-bythebooks";

  try {
    /* --- 1: the settings form ---------------------------------------------------------- */
    // RULINGS *The settings*: the named settings (ten, then Roll Results and Bloodied for All with the Visibility
    // menu's two, #4; Going Down Costs a Level of Exhaustion came and went, moved to House Rules), the world configs
    // for the DM then the per-client preferences; no dividers, no interlock (every machine is always on). A setting a
    // feature adds joins the registry and the pane: the checks read membership and order, never a count.
    if (want(1)) await section(1, async () => {
      const NAMED = ["decisionTimer", "dramaticBeat", "saveRolls", "concVisibility", "holdReveal",
        "masteryAsk", "resourceNotices", "rollResults", "bloodiedAll", "playerRollDamage", "effectBar", "effectHover"];
      const NAMED_WORLD = NAMED.slice(0, 9);
      // Registration: the module's config settings, in the order registered.
      const registered = [...game.settings.settings.values()]
        .filter(st => (st.namespace === MODULE_ID) && st.config);
      const keys = registered.map(st => st.key);
      // ⚠ The hook FIRED is the first assertion; everything below depends on it.
      let fired = 0;
      const hid = Hooks.on("renderSettingsConfig", () => { fired++; });
      const sheet = game.settings.sheet;
      // The no-write guard, read BEFORE the form opens: §1 must never reach the world.
      const values = () => snapshotSettings(keys).prior;
      const before = values();
      try {
        const missing = NAMED.filter(k => !keys.includes(k));
        ok("every named setting is registered, in the ruled order among them",
          !missing.length && (JSON.stringify(keys.filter(k => NAMED.includes(k))) === JSON.stringify(NAMED)),
          `missing=${missing.join(", ") || "none"} registered=${keys.join(", ")}`);
        const firstClient = registered.findIndex(st => st.scope === "client");
        ok("grouped as registered: the DM's world settings before the per-client preferences, each named one in its ruled scope",
          ((firstClient < 0) || registered.slice(firstClient).every(st => st.scope === "client"))
            && NAMED.every(k => registered.find(st => st.key === k)?.scope === (NAMED_WORLD.includes(k) ? "world" : "client")),
          registered.map(st => `${st.key}:${st.scope}`).join(", "));

        await sheet.render(true);
        const el = await until(() => {
          const node = sheet.element instanceof HTMLElement ? sheet.element : sheet.element?.[0];
          return node?.querySelector(`[name="${MODULE_ID}.decisionTimer"]`) ? node : null;
        }, { timeout: 10000 }).catch(() => null);   // a form that never renders the pane is reported below
        ok("renderSettingsConfig fires when the form opens", fired > 0,
          fired ? `${fired}×` : "NEVER DISPATCHED — the name is wrong");
        ok("the module's own pane is in the form", !!el,
          el ? "found by its Decision Timer" : "no control with the module prefix");
        if (!el) {
          skips.push("section 1: the form never rendered a module control — the pane unexercised");
        } else {
          // The form's controls, by first appearance: the ten, in registration order.
          const shown = [...new Set([...el.querySelectorAll(`[name^="${MODULE_ID}."]`)]
            .map(n => n.getAttribute("name").slice(MODULE_ID.length + 1)))];
          ok("the pane shows every registered setting and nothing else, in the registered order",
            JSON.stringify(shown) === JSON.stringify(keys), shown.join(", "));
          ok("no section dividers are drawn",
            !el.querySelector("h4.bf-divider"), `${el.querySelectorAll("h4.bf-divider").length} found`);
          ok("no control of the pane is greyed (no interlock left)",
            keys.every(k => !el.querySelector(`[name="${MODULE_ID}.${k}"]`)?.disabled),
            keys.filter(k => el.querySelector(`[name="${MODULE_ID}.${k}"]`)?.disabled).join(", ") || "none");
        }
        ok("the form was read, not written — no setting moved",
          JSON.stringify(values()) === JSON.stringify(before),
          JSON.stringify({ before, now: values() }));
      } finally {
        Hooks.off("renderSettingsConfig", hid);
        try { await sheet.close(); } catch { /* already closed */ }
      }
    });

    /* --- 2: the activity usage dialog --------------------------------------------------- */
    if (want(2)) await section(2, async () => {
      // ⚠ "BTB Test Bard" carries slots but no levelled spell item: take the first candidate that can
      // actually open a dialog.
      const candidates = game.actors.filter(a => a.type === "character").map(a => ({
        actor: a,
        spell: a.items.find(i => i.type === "spell" && (i.system.level ?? 0) > 0
          && i.system.activities?.size)
      })).filter(c => c.spell);
      const pick = candidates.find(c => c.actor.name.startsWith("BTB Test")) ?? candidates[0];
      if (!pick) {
        skips.push("section 2: no character carries a levelled spell with an activity — "
          + "renderActivityUsageDialog unexercised");
      } else {
        let fired = 0;
        const hid = Hooks.on("renderActivityUsageDialog", () => { fired++; });
        const msgsBefore = game.messages.size;
        let dialog = null;
        let posted = null;
        try {
          const activity = pick.spell.system.activities.contents[0];
          log.push(`section 2: ${pick.actor.name} → ${pick.spell.name} `
            + `(level ${pick.spell.system.level}, ${activity.type})`);
          // ⚠ NOT AWAITED: `use()` with a dialog settles only when answered, which would hang the suite.
          const pending = activity.use({}, { configure: true }, { create: false });
          pending?.catch?.(() => { /* closing the dialog is the expected end of this promise */ });
          dialog = await until(() => [...(foundry.applications?.instances?.values?.() ?? [])]
            .find(a => /ActivityUsageDialog/.test(a?.constructor?.name ?? "")), { timeout: 10000 }).catch(() => null);   // the oks below report a dialog that never opened
          ok("renderActivityUsageDialog fires for a real spell usage dialog", fired > 0,
            fired ? `${fired}×` : "NEVER DISPATCHED — the name is wrong");
          ok("the dialog is the class polish.js names", !!dialog,
            dialog?.constructor?.name ?? "no ActivityUsageDialog instance");
          const del = dialog?.element instanceof HTMLElement ? dialog.element : dialog?.element?.[0];
          ok("the target block is painted into the usage dialog",
            !!del?.querySelector(".bythebooks-target-block"),
            del ? `blocks=${del.querySelectorAll(".bythebooks-target-block").length}` : "no element");
          // ⚠ This hook repaints on EVERY render and removes its stale copies first: one block, not two.
          ok("exactly one block, however many times it repaints",
            del ? del.querySelectorAll(".bythebooks-target-block").length === 1 : false,
            `count=${del ? del.querySelectorAll(".bythebooks-target-block").length : "n/a"}`);
        } finally {
          Hooks.off("renderActivityUsageDialog", hid);
          try { await dialog?.close?.(); } catch { /* already gone */ }
          posted = await watch(() => game.messages.size !== msgsBefore, { ms: 400 });
        }
        // `create: false` and a closed dialog: the activity was never used.
        ok("opening and closing the dialog creates no chat message",
          !posted && (game.messages.size === msgsBefore),
          `before=${msgsBefore} after=${game.messages.size}`);
      }
    });

    /* --- 3: the measured-template CRUD seam --------------------------------------------- */
    if (want(3)) await section(3, async () => {
      // ⚠ ASSERTS A NEGATIVE on purpose: `saves.js` registers handlers Foundry 14 never dispatches, and
      // template adoption rides the card's RENDER hook instead. The day the names dispatch again, this
      // fails and points at the decision.
      const scene = game.scenes.active ?? game.scenes.viewed ?? game.scenes.contents[0];
      if (!scene) {
        skips.push("section 3: no scene to place a template on");
      } else {
        const seen = { createMT: 0, updateMT: 0, createRegion: 0 };
        const ids = [
          ["createMeasuredTemplate", Hooks.on("createMeasuredTemplate", () => { seen.createMT++; })],
          ["updateMeasuredTemplate", Hooks.on("updateMeasuredTemplate", () => { seen.updateMT++; })],
          ["createRegion", Hooks.on("createRegion", () => { seen.createRegion++; })]
        ];
        let tpl = null;
        // `Scene#templates` is deprecated in Foundry 14: the shim's region wears `flags.core.MeasuredTemplate`.
        const drawn = () => scene.regions.filter(r => r.getFlag("core", "MeasuredTemplate")).length;
        try {
          const before = { templates: drawn(), regions: scene.regions.size };
          // Far from the fixture tokens: nothing here should touch containment.
          const made = await scene.createEmbeddedDocuments("MeasuredTemplate", [{
            t: "circle", x: 100, y: 100, distance: 5
          }]);
          tpl = made?.[0] ?? null;
          // The template drawn and its Region seen (the oks below report either missing), then the window for the name.
          await until(() => (drawn() === before.templates + 1) && (seen.createRegion > 0), { timeout: 4000 }).catch(() => null);
          const createdMT = await watch(() => seen.createMT > 0, { ms: 600 });
          ok("a MeasuredTemplate really was created", !!tpl && drawn() === before.templates + 1,
            `templates ${before.templates}→${drawn()}`);
          // The positive half: something DID fire, so the zero above is a real absence.
          ok("…and Foundry 14 dispatches it as a REGION", seen.createRegion > 0
            && scene.regions.size === before.regions + 1,
            `createRegion=${seen.createRegion}× regions ${before.regions}→${scene.regions.size}`);
          ok("PIN: createMeasuredTemplate is still never dispatched", !createdMT && (seen.createMT === 0),
            seen.createMT === 0 ? "0× — the pin holds"
              : `${seen.createMT}× — THE PIN IS STALE: the platform gives the name back. Delete `
                + "the NOT_DISPATCHED_HERE row in tools/hook-coverage.mjs and decide D12.");
          if (tpl) {
            await tpl.update({ distance: 10 });
            const updatedMT = await watch(() => seen.updateMT > 0, { ms: 600 });
            ok("PIN: updateMeasuredTemplate is still never dispatched", !updatedMT && (seen.updateMT === 0),
              seen.updateMT === 0 ? "0× — the pin holds"
                : `${seen.updateMT}× — THE PIN IS STALE, see above`);
          }
          log.push(`section 3: ${JSON.stringify(seen)} on Foundry ${game.version}`);
        } finally {
          for (const [hook, id] of ids) Hooks.off(hook, id);
          // ⚠ A leftover template poisons smoke-saves §8 (it re-derives targets from standing areas).
          try { if (tpl) await (scene.regions.get(tpl.id) ?? tpl).delete(); } catch { /* already gone */ }
          await until(() => !tpl || !scene.regions.get(tpl.id), { timeout: 4000 }).catch(() => null);   // in a finally: the ok below reports it
          ok("the template is cleaned up — no area left standing for the next suite",
            !tpl || !scene.regions.get(tpl.id), `drawn templates=${drawn()}`);
        }
      }
    });
  } catch (err) {
    fatal = `${err?.message}\n${err?.stack ?? ""}`;
  }
  return { fatal, results, log, skips };
}, sectionArg(plan, SECTIONS));

// ⚠ `finish` calls `report` itself — calling both prints the whole body twice.
await finish({ tag: TAG, out, plan, f });
