// Classes smoke suite — Warlock: the PHB classes plan's rows (audits/plans/session-0-classes.md) for
// the Warlock, each section keeping its number and title. The fixtures, the lends, the
// helpers and the teardown are the classes kit's (tools/class-kit.mjs); everything written is restored.
import { announcePlan, connectSuite, finish, sectionPlan } from './harness.mjs';
import { runClassSuite } from './class-kit.mjs';

// The coverage map (tools/coverage-map.mjs) parses this; ⚠ never import a suite (it connects on evaluation).
export const COVERS = [
  'clock-riders.js',        // Repelling Blast (§20), Lifedrinker (§59)
  'heal-on-hit.js',         // Dark One's Blessing on a kill (§21)
  'metamagic.js',           // Psychic Spells' free row, its birth flag, the damage retyped (§34)
  'saves/choices.js',       // Beguiling Twist's Charmed or Frightened (§44)
  'saves/demand.js',        // Beguiling Defenses' failDamage rider (§45)
  'd20-folds.js',           // Dark One's Own Luck (§53)
  'hit-menu.js',            // Eldritch Smite (§57), Hurl Through Hell (§85)
  'drop-to-one.js'          // Gift of the Protectors (§62)
];

const SECTIONS = {
  20: 'Repelling Blast: each Eldritch Blast beam that hits — the offer\'s ticked no-dice row and a card line "Repelling Blast — push it up to 10 feet … (move the token)"; a Huge target, none; enchanted onto another cantrip, Eldritch Blast says nothing and that cantrip does',
  21: 'Dark One\'s Blessing (lent to the Cleric with a Warlock class, 3): the Cleric drops the Victim → "Dark One\'s Blessing — BTB Test Cleric gains N Temporary Hit Points" (N = max(1, warlock level + Cha)), receipted, N temp HP; the PC Attacker\'s kill 5 ft from the Cleric pays too; a kill 55 ft away pays nothing',
  34: 'Psychic Spells (lent to the Sorcerer): Fire Bolt\'s window greys it "not a Warlock spell"; a Warlock\'s Chill Touch shows "Psychic Spells · free" beside the Metamagic rows, its tick greys none of them; cast ticked, the card says "the damage is psychic" and the damage roll is psychic; cast unticked, necrotic',
  44: 'Beguiling Twist (B2, lent to the Sorcerer): the Halfling SUCCEEDS on a demanded save against Charm Person within 120 ft — the sorcerer\'s popup "it succeeded, target one other creature"; Answer with no target is refused; the attacker targeted, Answer spends the Reaction and demands a Wisdom save of the attacker on the twist\'s own card (twistFor), the Halfling\'s SAVED entry standing; the attacker fails: the word popup "Charmed or Frightened?", Charmed lands for 10 rounds',
  45: 'Beguiling Defenses (B2, lent to the Sorcerer, 1 use): the attacker hits the sorcerer — the hold and the popup; Cast halves the damage on the receipt, spends the item\'s use and the Reaction, and demands a Wisdom save of the attacker on the Beguiling Reaction\'s card with the failDamage rider; the attacker fails: psychic damage equal to the damage taken, receipted on that card',
  53: 'Dark One\'s Own Luck (B4, lent to BTB Test Fighter): an Athletics check offers the d10 (accepted: +7, a use spent, no refund line); a save offers it too; Homing Strikes (Soul Blades) is not offered on a Longsword miss',
  57: 'Eldritch Smite (B4, lent to the PC Attacker, Pact slots 2 of 2 at level 2): a weapon hit\'s group "Eldritch Smite — 3d8 force · 1 Pact slot"; ticked, 3d8 force rides, a Pact slot spent, Prone pressed',
  59: 'Lifedrinker (B4): a weapon hit\'s ticked rider "1d6 necrotic", the heal offered on the damage card; Relentless Avenger: in a combat off the paladin\'s turn the melee hit lands the pack\'s speed-0 effect (Halt\'s shape)',
  62: 'Gift of the Protectors (B4, the Sorcerer\'s page names the Halfling): a drop to 0 is held at 1, the card names the sorcerer, Protect\'s use spent; spent, the next drop lands 0',
  67: 'Searing Vengeance (C1, the Sorcerer a Warlock 14): the Halfling\'s Death Saving Throw raises the offer; Yes: half the maximum back (200), the Attacker within 30 ft takes 2d8 + Cha radiant and is Blinded, the use spent',
  85: 'Hurl Through Hell (C1, the PC Attacker a Warlock 14): the hit menu\'s group; ticked, the Charisma save demanded, the use spent',
  91: 'the gate\'s flag for the death save (C1): a Death Saving Throw with nobody holding Searing Vengeance raises no offer'
};
const DEPENDS = {};

const { plan, pulled } = sectionPlan(SECTIONS, DEPENDS);
const f = await connectSuite({ tag: 'class-warlock', watchdogMs: 900_000 });
announcePlan('class-warlock', plan, pulled);

const out = await runClassSuite(f, { plan, sections: SECTIONS, body: async ({ sections, titles }) => {
  const { sleep, until, watch, tokenOn, faces, unrig } = window.__btb;
  const { results, skips, ok, want, section } = window.__btb.begin({ sections, titles });
  const KIT = window.__btbClasses;
  const { AC, MOD, a1Damage, a1Hit, a1Roll, a1Victim, a4Card, act, attackOf, attacker, attackerToken, b4Cards, c1Cards, cardEl, cardText, clearDown, clearTargets, cleric, clericToken, clericWeapon, closeA1, closeDialogs, closeOffers, created, damageFor, dropEffects, dropNamed, dropReactionChips, dropVictimFx, findPHB, groupText, halfling, halflingToken, hasStatus, healFull, hgClose, hgKeep, hgLend, hgStrike, hitBox, hitRow, holdOf, hp, lend, lentBy, log, outcomeOn, pcAttacker, pcToken, pcWeapon, pickApply, popups, priorActor, reactionChipOn, riderBox, riderChits, riderRow, ridersOf, rollFlag, rollPopup, scene, set, settledSave, sorcerer, sorcererDoc, spendLuck, statusOn, swingAt, textOf, tick, titled, typesOf, unlend, vhp, victim, victimFx, victimToken } = KIT;
  try {
    await KIT.leaveA3();

    // ---- 20. Repelling Blast: a card line per Eldritch Blast beam; a Huge target none; the enchantment's cantrip
    if (want(20)) await section(20, async () => {
      await closeDialogs(); await a1Victim();
      const ebSrc = await findPHB('Eldritch Blast', 'spell');
      const sorcToken = canvas.tokens.get(sorcererDoc.id);
      if (!ebSrc || !sorcToken) log.push(`§20 skipped: Eldritch Blast=${!!ebSrc} sorcererToken=${!!sorcToken}`);
      else {
        const rb = await lend(sorcerer, 'Repelling Blast');
        const own = [];
        const vDoc = victimToken.document;
        const vSize = { width: vDoc.width, height: vDoc.height };
        const priorSize = victim.system._source.traits?.size ?? 'med';
        const SAYS = /Repelling Blast — push it up to 10 feet straight away from you \(move the token\)/;
        // ⚠ No receipt to wait for: Eldritch Blast's volley applies after the last beam — the damage message is the record.
        const ebDamage = msg => until(() => damageFor(msg?.id) ?? null, { timeout: 12000, label: 'the Eldritch Blast beam\'s damage message' });
        const ebRoll = async (msg, offer) => { offer?.element?.querySelector('button[data-action="roll"]')?.click(); return ebDamage(msg); };
        const castable = async src => {
          const data = src.toObject(); data.system.prepared = 1; data.system.method = 'atwill';
          const [it] = await sorcerer.createEmbeddedDocuments('Item', [data]); own.push(it); return it;
        };
        try {
          const eb = await castable(ebSrc);
          const ebAct = eb.system.activities.find(a => a.type === 'attack');
          // a/b — two beams (the volley's rays are separate attack rolls; rolled here without the aim)
          const beams = [];
          for (let i = 0; i < 2; i++) {
            const { msg, offer } = await a1Hit(sorcerer, sorcToken, ebAct);
            const box = riderBox(offer, 'repelling-blast');
            const row = riderRow(offer, 'repelling-blast');
            const dmg = offer ? await ebRoll(msg, offer) : await ebDamage(msg);
            const any = damageFor(msg?.id);
            beams.push({ offer: !!offer, checked: !!box?.checked, row, rider: ridersOf(dmg).find(x => x.key === 'repelling-blast') ?? null, id: dmg?.id ?? null,
              attack: msg?.id ?? null, damage: any?.id ?? null, receipt: !!any?.getFlag(MOD, 'receipt'), flags: Object.keys(any?.flags?.[MOD] ?? {}), pick: msg?.getFlag(MOD, 'clockPick') ?? null });
          }
          ok('20a. each Eldritch Blast beam that hits (no enchantment on the sheet: the row\'s spell): the offer\'s TICKED no-dice row "Repelling Blast — push it up to 10 feet …"',
            beams.every(b => b.offer && b.checked && /Repelling Blast — push it up to 10 feet/.test(b.row)),
            JSON.stringify(beams.map(b => ({ offer: b.offer, checked: b.checked, row: b.row.slice(0, 90) }))));
          // The rider's card line draws with the card (the flag is on the message from its birth).
          await until(() => beams.every(b => cardEl(b.id)), { label: 'each beam\'s damage card drawn in the chat log' });
          ok('20b. a card line per beam: "Repelling Blast — push it up to 10 feet straight away from you (move the token)"; no dice added',
            beams.every(b => b.rider && !b.rider.formula && SAYS.test(b.rider.says ? `Repelling Blast — ${b.rider.says}` : '') && SAYS.test(cardText(b.id))),
            JSON.stringify(beams.map(b => ({ rider: b.rider, attack: b.attack, damage: b.damage, receipt: b.receipt, flags: b.flags, pick: b.pick, card: cardText(b.id ?? b.damage).slice(0, 160) }))));
          // c — a Huge target: none (maxSize lg)
          await victim.update({ 'system.traits.size': 'huge' });
          await until(() => victim.system.traits?.size === 'huge', { label: 'the Victim Huge' });
          const { msg: mH, offer: oH } = await a1Hit(sorcerer, sorcToken, ebAct);
          const dH = oH ? await ebRoll(mH, oH) : await ebDamage(mH);
          ok('20c. a Huge target: no Repelling Blast row, no line', !!dH && !riderBox(oH, 'repelling-blast') && !ridersOf(dH).some(x => x.key === 'repelling-blast'),
            `size=${victim.system.traits.size} offer=${!!oH} riders=${JSON.stringify(ridersOf(dH).map(x => x.key))}`);
          await victim.update({ 'system.traits.size': priorSize });
          if ((vDoc.width !== vSize.width) || (vDoc.height !== vSize.height)) await vDoc.update(vSize);   // UNSURE: dnd5e may resize the token with the size
          // d — enchanted onto ANOTHER cantrip (Fire Bolt): Eldritch Blast says nothing, the enchanted cantrip does
          const fbSrc = await findPHB('Fire Bolt', 'spell');
          const ench = rb.effects.find(e => e.type === 'enchantment');
          if (!fbSrc) log.push('§20d skipped: no Fire Bolt in the PHB');
          else {
            const fb = await castable(fbSrc);
            // UNSURE: an enchantment created straight on the item (the "Make Repelling" use's result, without its dialog);
            // the machine reads only type "enchantment" + the feature's name (clock-riders.js enchantedBy).
            const data = ench ? foundry.utils.mergeObject(ench.toObject(), { origin: rb.uuid, disabled: false }, { inplace: false })
              : { name: rb.name, type: 'enchantment', img: rb.img, origin: rb.uuid, transfer: false, disabled: false, changes: [] };
            delete data._id;
            data.name = rb.name;
            await fb.createEmbeddedDocuments('ActiveEffect', [data]);
            const { msg: mE, offer: oE } = await a1Hit(sorcerer, sorcToken, ebAct);
            const dE = oE ? await ebRoll(mE, oE) : await ebDamage(mE);
            const fbAct = sorcerer.items.get(fb.id)?.system?.activities?.find(a => a.type === 'attack');
            const { msg: mF, offer: oF } = await a1Hit(sorcerer, sorcToken, fbAct);
            const dF = oF ? await ebRoll(mF, oF) : await ebDamage(mF);
            await until(() => cardEl(dF.id), { label: 'the Fire Bolt damage card drawn in the chat log' });
            ok('20d. the invocation enchanted onto Fire Bolt: an Eldritch Blast hit says nothing, a Fire Bolt hit carries the line',
              !!dE && !ridersOf(dE).some(x => x.key === 'repelling-blast') && !!dF && ridersOf(dF).some(x => x.key === 'repelling-blast') && SAYS.test(cardText(dF?.id)),
              `eb=${JSON.stringify(ridersOf(dE).map(x => x.key))} fb=${JSON.stringify(ridersOf(dF).map(x => x.key))} fbCard="${cardText(dF?.id).slice(0, 160)}" ench=${!!ench}`);
          }
        } finally {
          await closeOffers();
          if (victim.system._source.traits?.size !== priorSize) await victim.update({ 'system.traits.size': priorSize });
          if ((vDoc.width !== vSize.width) || (vDoc.height !== vSize.height)) await vDoc.update(vSize).catch(() => {});
          for (const it of own) await unlend(sorcerer, it).catch(() => sorcerer.items.get(it.id)?.delete());
          await unlend(sorcerer, rb);
        }
      }
    });

    // ---- 21. Dark One's Blessing: the warlock's kill, an ally's kill within 10 ft, a kill beyond it
    if (want(21)) await section(21, async () => {
      await closeDialogs(); await spendLuck();
      const src = cleric.system._source;
      hgKeep(cleric, { 'system.attributes.hp.temp': src.attributes.hp.temp ?? 0, 'system.details.originalClass': src.details?.originalClass ?? '' });
      hgKeep(victim, { 'system.attributes.hp.value': victim.system._source.attributes.hp.value, 'system.attributes.hp.max': victim.system._source.attributes.hp.max });
      const blessing = await hgLend(cleric, "Dark One's Blessing", 'feat');
      // The pack's heal reads @classes.warlock.levels: without a warlock class it resolves to nothing and pays nothing.
      // UNSURE: a class item created straight on the sheet (no advancement manager) — dnd5e may set originalClass (kept above).
      const warlock = await hgLend(cleric, 'Warlock', 'class', { 'system.levels': 3 });
      const rd = cleric.getRollData();
      const N = Math.max(1, Number(rd?.classes?.warlock?.levels) + Number(rd?.abilities?.cha?.mod ?? 0));
      if (!blessing || !warlock || !Number.isFinite(N) || !pcWeapon || !clericWeapon) {
        log.push(`§21 skipped: blessing=${!!blessing} warlock=${!!warlock} N=${N} pcWeapon=${!!pcWeapon} clericWeapon=${!!clericWeapon}`);
      } else {
        const vfx0 = new Set(victim.effects.map(e => e.id));
        const temp = () => Number(cleric.system.attributes.hp.temp ?? 0);
        const blessCard = since => game.messages.contents.find(m => (m.timestamp >= since) && m.getFlag(MOD, 'healOnHit')?.kill
          && (m.getFlag(MOD, 'healOnHit')?.casterUuid === cleric.uuid)) ?? null;
        const said = m => cardText(m?.id) || String(m?.content ?? '').replace(/<[^>]+>/g, ' ').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, ' ');
        // the card is dnd5e's own healing card of the feature's heal (FX Studio plays off it), its line saying who fell
        const title = new RegExp(`Dark One's Blessing — ${victim.name} falls`);
        const reset = async () => {
          await cleric.update({ 'system.attributes.hp.temp': 0 });
          await victim.update({ 'system.attributes.hp.value': 1 });
          await until(() => (vhp() === 1) && (temp() === 0), { label: 'the Victim at 1 HP, the Cleric at 0 temp HP' });
        };

        // (a) the warlock's own kill
        await reset();
        const sA = Date.now();
        await hgStrike(cleric, clericToken, clericWeapon, victimToken);
        const fellA = await until(() => vhp() <= 0, { timeout: 8000, label: 'the Victim at 0 HP (the Cleric\'s kill)' });
        const cA = await until(() => blessCard(sA), { timeout: 8000, label: 'the Dark One\'s Blessing card (the Cleric\'s kill)' });
        const recA = await until(() => (cA?.getFlag(MOD, 'receipt')?.targets?.length ? cA.getFlag(MOD, 'receipt') : null), { timeout: 6000, label: 'the Blessing card\'s receipt' });
        await until(() => temp() === N, { timeout: 4000, label: `the Cleric at ${N} temp HP` });
        const fA = cA?.getFlag(MOD, 'healOnHit');
        ok(`21a. the Cleric drops the Victim: the feature's healing card, its line "Dark One's Blessing — ${victim.name} falls" ("you dropped an enemy"), receipted, ${N} temp HP`,
          fellA && !!cA && (cA.type === 'healing') && title.test(said(cA)) && /you dropped an enemy/.test(fA?.why ?? '') && (fA?.targetUuid === victim.uuid)
            && (recA?.targets ?? []).some(t => t.uuid === cleric.uuid) && (temp() === N),
          `N=${N} (warlock ${rd?.classes?.warlock?.levels} + cha ${rd?.abilities?.cha?.mod}) fell=${fellA} vhp=${vhp()} card=${!!cA} text=${said(cA).slice(0, 160)} flag=${JSON.stringify(fA)} receipt=${JSON.stringify(recA?.targets?.map(t => t.name) ?? null)} temp=${temp()}`);

        // (b) an ally's kill 5 ft from the warlock
        await reset();
        const sB = Date.now();
        await hgStrike(pcAttacker, pcToken, pcWeapon, victimToken);
        const fellB = await until(() => vhp() <= 0, { timeout: 8000, label: 'the Victim at 0 HP (the PC Attacker\'s kill)' });
        const cB = await until(() => blessCard(sB), { timeout: 8000, label: 'the Dark One\'s Blessing card (the ally\'s kill)' });
        await until(() => temp() === N, { timeout: 4000, label: `the Cleric at ${N} temp HP (the ally's kill)` });
        const fB = cB?.getFlag(MOD, 'healOnHit');
        ok(`21b. the PC Attacker drops the Victim 5 ft from the Cleric: the Cleric gains ${N} temp HP ("… ft from you")`,
          fellB && !!cB && title.test(said(cB)) && /ft from you/.test(fB?.why ?? '') && (temp() === N),
          `fell=${fellB} card=${!!cB} why=${fB?.why} text=${said(cB).slice(0, 160)} temp=${temp()}`);

        // (c) an ally's kill 55 ft away: an unlinked Victim token in this block
        await cleric.update({ 'system.attributes.hp.temp': 0 });
        const [farDoc] = await scene.createEmbeddedDocuments('Token', [foundry.utils.mergeObject(victim.prototypeToken.toObject(),
          { x: 800, y: 800, actorId: victim.id, actorLink: false, disposition: -1 }, { inplace: false })]);
        created.tokens.push(farDoc.id);
        const farTok = await tokenOn(farDoc.id, { timeout: 10000 }).catch(() => null);   // soft: no token, no strike (the branch below)
        const farActor = () => scene.tokens.get(farDoc.id)?.actor ?? null;
        await farActor()?.update({ 'system.attributes.hp.value': 1 });
        await until(() => Number(farActor()?.system?.attributes?.hp?.value) === 1, { label: 'the far Victim at 1 HP' });
        const sC = Date.now();
        if (farTok) await hgStrike(pcAttacker, pcToken, pcWeapon, farTok);
        const fellC = await until(() => Number(farActor()?.system?.attributes?.hp?.value ?? 1) <= 0, { timeout: 8000, label: 'the far Victim at 0 HP' });
        const cC = await watch(() => blessCard(sC), { ms: 2500 });   // a window: no Blessing card for a kill 55 ft away
        ok('21c. the PC Attacker drops a Victim 55 ft from the Cleric: no card, no temp HP',
          !!farTok && fellC && !cC && (temp() === 0),
          `tok=${!!farTok} fell=${fellC} hp=${farActor()?.system?.attributes?.hp?.value} card=${cC ? said(cC).slice(0, 120) : null} temp=${temp()}`);

        // restore: the far token, the Victim's HP and any status the drop left, the temp HP
        if (scene.tokens.get(farDoc.id)) await scene.deleteEmbeddedDocuments('Token', [farDoc.id]);
        const drops = victim.effects.filter(e => !vfx0.has(e.id) && [...(e.statuses ?? [])].some(s => ['dead', 'unconscious', 'prone'].includes(s))).map(e => e.id);
        if (drops.length) await victim.deleteEmbeddedDocuments('ActiveEffect', drops).catch(() => {});
        await victim.update({ 'system.attributes.hp.value': Number(victim.system.attributes.hp.max) });
        await cleric.update({ 'system.attributes.hp.temp': 0 });
      }
      if (warlock) await unlend(cleric, warlock);
      if (blessing) await unlend(cleric, blessing);
      unrig();
    });
    KIT.markA2();

    // ---- 34. Psychic Spells: a free row of the casting window
    if (want(34)) await section(34, async () => {
      await closeDialogs();
      const psychic = await hgLend(sorcerer, 'Psychic Spells', 'feat');
      const chill = await hgLend(sorcerer, 'Chill Touch', 'spell', { 'system.prepared': 1, 'system.method': 'spell', 'system.sourceItem': 'class:warlock' });
      const spellAct = name => sorcerer.items.find(i => (i.type === 'spell') && (i.name === name))?.system?.activities?.find(a => ['attack', 'save', 'damage'].includes(a.type)) ?? null;
      const usageApps = () => [...foundry.applications.instances.values()].filter(a => /ActivityUsageDialog|UsageDialog/.test(a.constructor?.name ?? ''));
      // An attack needs a target to be used at all (polish.js): the Halfling.
      const openWindow = async name => {
        halflingToken.setTarget(true, { releaseOthers: true });
        const pendingUse = spellAct(name)?.use({ consume: { spellSlot: false } }, { configure: true }, { create: true });
        pendingUse?.catch?.(() => { /* closed below */ });
        // Soft: 34a's detail names a window that never opened.
        const app = await until(() => usageApps().find(a => a.element?.querySelector?.('[data-bf-metamagic-field]')) ?? null, { timeout: 6000 }).catch(() => null);
        return { app, fs: app?.element?.querySelector('[data-bf-metamagic-field]') ?? null };
      };
      const rowOf = (fs, key) => fs?.querySelector(`[data-bf-metamagic-row="${key}"]`) ?? null;
      const closeWindows = async () => { for (const a of usageApps()) { try { await a.close(); } catch { /* gone */ } } };
      /** Cast Chill Touch through its window, Psychic Spells ticked or not; its damage rolled chained to the card. */
      const castChill = async tick => {
        const t0 = Date.now();
        const { app, fs } = await openWindow('Chill Touch');
        const box = rowOf(fs, 'psychic')?.querySelector('input[name="bf-metamagic-free"]');
        if (box && (box.checked !== tick)) box.click();   // the change handler records the tick at once
        app?.element?.querySelector('button[data-action="use"], button[type="submit"]')?.click();
        // Soft: no card, no damage rolled (the branch below); the free row's flag is stamped at the card's birth.
        const card = await until(() => a4Card(t0, m => (m.type === 'usage') && (m.system?.activity?.uuid === spellAct('Chill Touch')?.uuid)), { timeout: 8000 }).catch(() => null);
        const rolls = card ? await spellAct('Chill Touch').rollDamage({}, { configure: false }, { data: { 'system.origin': card.id } }) : null;
        clearTargets();
        return { card, dmg: rolls?.[0]?.parent ?? null, rolls };
      };
      try {
        if (!psychic || !chill || !spellAct('Fire Bolt')) log.push(`§34 skipped: psychic=${!!psychic} chill=${!!chill} fireBolt=${!!spellAct('Fire Bolt')}`);
        else {
          const fb = await openWindow('Fire Bolt');
          const fbRow = rowOf(fb.fs, 'psychic');
          ok('34a. Fire Bolt (the Sorcerer\'s own): the row greyed "not a Warlock spell"', (fbRow?.dataset?.bfOff === '1') && /not a Warlock spell/.test(textOf(fbRow)), textOf(fbRow) || `window=${!!fb.app} group=${!!fb.fs}`);
          await closeWindows();
          const ct = await openWindow('Chill Touch');
          const row = rowOf(ct.fs, 'psychic');
          const box = row?.querySelector('input[name="bf-metamagic-free"]');
          ok('34b. Chill Touch (a Warlock spell): "Psychic Spells · free", live, beside the Metamagic rows', !!box && !box.disabled && /Psychic Spells/.test(textOf(row)) && /free/i.test(textOf(row))
            && !!ct.fs?.querySelector('input[name="bf-metamagic"]'), textOf(row));
          box?.click();   // the change handler runs inside the click
          const paidOn = [...(ct.fs?.querySelectorAll('input[name="bf-metamagic"]') ?? [])].filter(b => !b.disabled).length;
          ok('34c. its tick greys no Metamagic row', paidOn > 0, `live paid rows=${paidOn}`);
          await closeWindows();
          await sleep(3200);   // clock: the usage window's close sweep (metamagic.js, a 3 s setTimeout) clears the closed window's tick
          const on = await castChill(true);
          const line = (await until(() => cardEl(on.card?.id)?.querySelector('.bf-metamagic-free-line'), { timeout: 5000, label: 'the card\'s "Psychic Spells — the damage is psychic" line' }))?.textContent?.trim() ?? '';
          ok('34d. cast ticked: the card carries the tick and says "Psychic Spells — the damage is psychic"',
            (on.card?.getFlag(MOD, 'metamagicFree')?.[0]?.key === 'psychic') && /Psychic Spells — the damage is psychic/.test(line), `flag=${JSON.stringify(on.card?.getFlag(MOD, 'metamagicFree'))} line="${line}"`);
          ok('34e. the damage roll is psychic', (on.rolls ?? []).length > 0 && on.rolls.every(r => r.options?.type === 'psychic') && (on.dmg?.getFlag(MOD, 'metamagicType')?.feature === 'Psychic Spells'),
            `types=${JSON.stringify((on.rolls ?? []).map(r => r.options?.type))}`);
          const off = await castChill(false);
          ok('34f. cast unticked: no tick on the card, the damage its own necrotic', !off.card?.getFlag(MOD, 'metamagicFree') && (off.rolls ?? []).length > 0 && off.rolls.every(r => r.options?.type === 'necrotic'),
            `flag=${JSON.stringify(off.card?.getFlag(MOD, 'metamagicFree') ?? null)} types=${JSON.stringify((off.rolls ?? []).map(r => r.options?.type))}`);
        }
      } finally {
        await closeWindows();
        if (chill) await unlend(sorcerer, chill);
        if (psychic) await unlend(sorcerer, psychic);
        unrig();
      }
    });

    // ---- 44. Beguiling Twist: a SUCCESS within 120 ft turns onto the ranger's target
    if (want(44)) await section(44, async () => {
      await closeA1(); await spendLuck();
      const twist = await hgLend(sorcerer, 'Beguiling Twist', 'feat');
      const sorcToken = canvas.tokens.get(sorcererDoc.id);
      const lentSpells = [];
      const castAt = async (name, targetToken) => {
        let id = attacker.items.find(i => (i.name === name) && (i.type === 'spell'))?.id;
        if (!id) {
          const src = await findPHB(name, 'spell');
          const data = src?.toObject();
          if (!data) return null;
          data.system.prepared = 1; data.system.method = 'atwill';
          const [it] = await attacker.createEmbeddedDocuments('Item', [data]); id = it.id; lentSpells.push(id);
        }
        const a = attacker.items.get(id)?.system?.activities?.find(x => x.type === 'save');
        if (!a) return null;
        attackerToken.control({ releaseOthers: true });
        targetToken.setTarget(true, { releaseOthers: true });
        const use = await a.use({ consume: { spellSlot: false } }, { configure: false }, {});
        const card = use?.message ?? null;
        await until(() => card?.getFlag(MOD, 'saves'), { timeout: 6000, label: `the ${name} card's save demand` });
        return card;
      };
      let combat44 = null;
      try {
        if (!twist || !sorcToken) log.push(`§44 skipped: twist=${!!twist} sorcererToken=${!!sorcToken}`);
        else {
          await set('saveRolls', 'prompt');
          await healFull();
          await dropReactionChips(sorcerer);
          [combat44] = await Combat.createDocuments([{ scene: scene.id, active: true }]);
          created.combats.push(combat44.id);
          await combat44.createEmbeddedDocuments('Combatant', [
            { tokenId: attackerToken.document.id, sceneId: scene.id, actorId: attacker.id, initiative: 20 },
            { tokenId: halflingToken.document.id, sceneId: scene.id, actorId: halfling.id, initiative: 15 },
            { tokenId: sorcererDoc.id, sceneId: scene.id, actorId: sorcerer.id, initiative: 10 }]);
          await combat44.startCombat();
          await until(() => combat44.started, { label: 'the §44 combat started' });
          const t0 = Date.now();
          const card = await castAt('Charm Person', halflingToken);
          if (!card) log.push('§44a skipped: no Charm Person save activity');
          else {
            faces([[20, 20]]);
            const rolls = await halfling.rollSavingThrow({ ability: 'wis' }, { configure: false }, {});
            const rollMsg = rolls?.[0]?.parent ?? null;
            unrig();
            const pop = await until(() => rollPopup(/Beguiling Twist/), { timeout: 8000, label: 'the sorcerer\'s Beguiling Twist popup' });
            const popText = textOf(pop?.element);
            ok('44a. the Halfling SUCCEEDS on a demanded save against Charmed within 120 ft of the sorcerer: the popup "Beguiling Twist — BTB Test Halfling\'s saving throw", "it succeeded", target one other creature',
              !!pop && /Beguiling Twist/.test(popText) && /it succeeded/.test(popText) && /Target ONE other creature/.test(popText), `pop=${!!pop} text="${popText.slice(0, 240)}"`);
            // b. Answer with nothing targeted: refused, nothing spent, the popup stays.
            clearTargets();
            pickApply(pop);
            // a window: the refused Answer must neither release the roll nor spend the Reaction
            const spent44b = await watch(() => (rollFlag(rollMsg)?.status !== 'pending') || !!reactionChipOn(sorcerer), { ms: 700 });
            ok('44b. Answer with no target: refused — the roll still held, no Reaction spent',
              !spent44b && (rollFlag(rollMsg)?.status === 'pending') && !reactionChipOn(sorcerer), `stray=${!!spent44b} status=${rollFlag(rollMsg)?.status} reaction=${!!reactionChipOn(sorcerer)}`);
            // c. The attacker targeted: Answer — the Reaction spent, the Save demanded of the attacker, the Halfling's save stands.
            // (The refused click closed the popup; the module asks again — find the new one.) Soft: the first popup is the fallback.
            const pop2 = await until(() => rollPopup(/Beguiling Twist/), { timeout: 6000 }).catch(() => null);
            attackerToken.setTarget(true, { releaseOthers: true });
            pickApply(pop2 ?? pop);
            // Soft: e–f run only with the twist's card (the branch below); 44c says it is missing.
            const twistCard = await until(() => game.messages.contents.find(m => (m.timestamp >= t0) && (m.getFlag(MOD, 'twistFor') === rollMsg?.id) && m.getFlag(MOD, 'saves')) ?? null, { timeout: 12000 }).catch(() => null);
            const entry = await until(() => card.getFlag(MOD, 'saves')?.targets?.find(x => (x.uuid === halfling.uuid) && x.done) ?? null, { timeout: 12000, label: 'the Halfling\'s entry settled on the Charm Person card' });
            const tflag = rollFlag(rollMsg);
            const demanded = twistCard?.getFlag(MOD, 'saves')?.targets?.[0] ?? null;
            ok('44c. Answer at the attacker: the Reaction spent, a Wisdom save demanded of BTB Test Attacker on the twist\'s own card (twistFor the roll), the Halfling\'s SAVED entry standing, the roll\'s flag naming the turn',
              !!twistCard && (demanded?.uuid === attacker.uuid) && (twistCard.getFlag(MOD, 'saves')?.abilities?.[0] === 'wis') && !!reactionChipOn(sorcerer)
                && (entry?.outcome === 'saved') && (tflag?.answer === 'roll') && (tflag?.twist?.targetUuid === attacker.uuid) && (tflag?.bent === null),
              `card=${!!twistCard} demanded=${demanded?.name} abilities=${JSON.stringify(twistCard?.getFlag(MOD, 'saves')?.abilities)} reaction=${!!reactionChipOn(sorcerer)} entry=${entry?.outcome} flag=${JSON.stringify(tflag && { answer: tflag.answer, twist: tflag.twist, bent: tflag.bent })}`);
            // Soft: on absence 44d's detail prints the card's text as it stands.
            const line = await until(() => { const t = cardText(rollMsg?.id); return /turned it on/.test(t) ? t : null; }, { timeout: 6000 }).catch(() => null);
            const atkName = attackerToken.document?.name ?? attacker.name;   // the card names the TOKEN
            ok('44d. the roll\'s card: "Beguiling Twist (BTB Test Sorcerer) turned it on <the attacker\'s token> — a Wisdom saving throw demanded"',
              /Beguiling Twist \(BTB Test Sorcerer\)/.test(line ?? '') && new RegExp(`turned it on ${atkName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(line ?? '') && /Wisdom saving throw demanded/.test(line ?? ''),
              `card="${(line ?? cardText(rollMsg?.id)).slice(0, 240)}"`);
            // e–f. The attacker fails: the caster's word — Charmed, for a minute.
            if (twistCard) {
              faces([[1, 20]]);
              await attacker.rollSavingThrow({ ability: 'wis' }, { configure: false }, {});
              unrig();
              const wordPop = await until(() => popups().find(app => /Charmed or Frightened\?/.test(textOf(app.element))) ?? null, { timeout: 10000, label: 'the sorcerer\'s "Charmed or Frightened?" popup' });
              ok('44e. the attacker fails the twist\'s save: the sorcerer\'s word popup "Charmed or Frightened?"', !!wordPop, `pop=${!!wordPop}`);
              wordPop?.element?.querySelector('button[data-action="word-charmed"]')?.click();
              const charmed = await until(() => attacker.effects.find(e => e.statuses?.has?.('charmed')) ?? null, { timeout: 10000, label: 'Charmed on the attacker' });
              // The word is written on the entry before its condition lands; read back once it stands.
              await until(() => twistCard.getFlag(MOD, 'saves')?.targets?.[0]?.choice?.answer, { label: 'the twist\'s word recorded on its entry' });
              const tEntry = twistCard.getFlag(MOD, 'saves')?.targets?.[0] ?? null;
              ok('44f. "Charmed": the attacker is Charmed for a minute (10 rounds), the twist\'s entry FAILED and its word Charmed',
                !!charmed && ((Number(charmed.duration?.rounds) === 10) || (Number(charmed.duration?.seconds) === 60)) && (tEntry?.outcome === 'failed') && (tEntry?.choice?.answer === 'Charmed'),
                `charmed=${!!charmed} duration=${JSON.stringify(charmed?.duration?.toObject?.() ?? null)} entry=${JSON.stringify(tEntry && { outcome: tEntry.outcome, word: tEntry.choice?.answer })}`);
            }
          }
        }
      } finally {
        await closeA1();
        await hgClose(/Beguiling Twist|Charmed or Frightened/);
        if (twist) await unlend(sorcerer, twist);
        if (lentSpells.length) await attacker.deleteEmbeddedDocuments('Item', lentSpells).catch(() => {});
        await dropReactionChips(sorcerer);
        for (const e of attacker.effects.filter(e => e.statuses?.has?.('charmed'))) await e.delete().catch(() => {});
        for (const e of halfling.effects.filter(e => e.name === 'Charmed')) await e.delete().catch(() => {});
        if (combat44) { await combat44.delete().catch(() => {}); created.combats = created.combats.filter(id => id !== combat44.id); }
        unrig();
        clearTargets();
      }
    });

    // ---- 45. Beguiling Defenses: the hit halved, the attacker's Wisdom save, psychic damage equal to the damage taken
    if (want(45)) await section(45, async () => {
      await closeA1(); await spendLuck();
      const sorcToken = canvas.tokens.get(sorcererDoc.id);
      const bd = await hgLend(sorcerer, 'Beguiling Defenses', 'feat', { 'system.uses.spent': 0 });
      hgKeep(sorcerer, {
        'system.attributes.ac.override': sorcerer.system._source.attributes.ac.override ?? null,
        'system.attributes.hp.value': sorcerer.system._source.attributes.hp.value,
        'system.attributes.hp.max': sorcerer.system._source.attributes.hp.max
      });
      hgKeep(attacker, { 'system.attributes.hp.value': attacker.system._source.attributes.hp.value });
      try {
        if (!bd || !sorcToken) log.push(`§45 skipped: defenses=${!!bd} sorcererToken=${!!sorcToken}`);
        else {
          await set('saveRolls', 'prompt');
          await dropReactionChips(sorcerer);
          await sorcerer.update({ 'system.attributes.ac.override': AC, 'system.attributes.hp.max': 400, 'system.attributes.hp.value': 400 });
          const atkHp = Number(attacker.system.attributes.hp.value);
          const t0 = Date.now();
          attackerToken.control({ releaseOthers: true });
          sorcToken.setTarget(true, { releaseOthers: true });
          faces([[12, 20], [4, 6], [4, 6]]);
          const usage = await act().use({ subsequentActions: false }, { configure: false }, {});
          const rolls = await act().rollAttack({}, { configure: false }, usage?.message?.id ? { data: { 'system.origin': usage.message.id } } : {});
          const msg = rolls?.[0]?.parent ?? null;
          unrig();
          const hold = await until(() => holdOf(msg), { timeout: 6000, label: 'the hold on the attacker\'s hit' });
          const pop = await until(() => popups().find(app => /Beguiling Defenses/.test(textOf(app.element))
            && (app.element?.querySelector?.('input[name="bf-rescue"][value="Beguiling Defenses"]') || app.element?.querySelector?.('button[data-action="cast"]'))) ?? null, { timeout: 8000, label: 'the sorcerer\'s Beguiling Defenses popup' });
          ok('45a. the attacker hits the sorcerer: the hold, the sorcerer\'s popup with Beguiling Defenses (a damage kind, 1 use)',
            !!hold && !!pop && (hold.targets?.[0]?.uuid === sorcerer.uuid), `hold=${!!hold} pop=${!!pop} target=${hold?.targets?.[0]?.name}`);
          const box = pop?.element?.querySelector('input[name="bf-rescue"][value="Beguiling Defenses"]');
          // The tick's change handler (Answer enabled) runs inside the click.
          if (box) { if (!box.checked) box.click(); pop.element.querySelector('button[data-action="answer"]')?.click(); }
          else pop?.element?.querySelector('button[data-action="cast"]')?.click();
          const target = await until(() => { const h = holdOf(msg); return (h?.status === 'resolved') ? (h.targets.find(x => x.uuid === sorcerer.uuid) ?? null) : null; }, { timeout: 12000, label: 'the hold resolved for the sorcerer' });
          const dmg = await until(() => { const d = damageFor(msg?.id); const r = d?.getFlag(MOD, 'receipt')?.targets?.find(x => x.uuid === sorcerer.uuid); return r ? { d, r } : null; }, { timeout: 12000, label: 'the sorcerer\'s line on the damage receipt' });
          // Soft: 45c runs only with the reaction's card (the branch below); 45b says it is missing.
          const defCard = await until(() => game.messages.contents.find(m => (m.timestamp >= t0) && m.getFlag(MOD, 'failDamage') && m.getFlag(MOD, 'saves')) ?? null, { timeout: 12000 }).catch(() => null);
          const dflag = defCard?.getFlag(MOD, 'saves') ?? null;
          ok('45b. Cast: the hold answered cast, the damage HALVED on the receipt, the item\'s use spent, the Beguiling Reaction\'s Wisdom save demanded (no combat here: no Reaction chip is written, the B1 lesson) of the attacker with the failDamage rider',
            (target?.answer === 'cast') && (dmg?.r?.multiplier === 0.5) && (Number(sorcerer.items.get(bd.id)?.system?.uses?.spent) === 1)
              && (dflag?.targets?.[0]?.uuid === attacker.uuid) && (dflag?.abilities?.[0] === 'wis') && (dflag?.failDamage?.equalTo === 'taken') && (dflag?.failDamage?.takenBy === sorcerer.uuid),
            `answer=${target?.answer} mult=${dmg?.r?.multiplier} taken=${dmg?.r?.taken} spent=${sorcerer.items.get(bd.id)?.system?.uses?.spent} reaction=${!!reactionChipOn(sorcerer)} card=${!!defCard} flag=${JSON.stringify(dflag && { targets: dflag.targets?.map(t => t.name), abilities: dflag.abilities, failDamage: dflag.failDamage })}`);
          const taken = Number(dmg?.r?.taken);
          if (defCard) {
            faces([[1, 20]]);
            await attacker.rollSavingThrow({ ability: 'wis' }, { configure: false }, {});
            unrig();
            const psychic = await until(() => defCard.getFlag(MOD, 'receipt')?.targets?.find(x => x.uuid === attacker.uuid) ?? null, { timeout: 12000, label: 'the attacker\'s psychic damage on the reaction\'s receipt' });
            ok('45c. the attacker FAILS: psychic damage equal to the damage the sorcerer took, receipted on the reaction\'s card, the attacker\'s HP down by it',
              !!psychic && (taken > 0) && (Number(psychic.taken) === taken) && (Number(attacker.system.attributes.hp.value) === atkHp - taken),
              `taken=${taken} psychic=${JSON.stringify(psychic && { taken: psychic.taken, note: psychic.note })} hp=${attacker.system.attributes.hp.value}/${atkHp}`);
          }
        }
      } finally {
        await closeA1();
        await hgClose(/Beguiling/);
        if (bd) await unlend(sorcerer, bd);
        await dropReactionChips(sorcerer);
        if (priorActor[sorcerer.id]) await sorcerer.update(priorActor[sorcerer.id]).catch(() => {});
        if (priorActor[attacker.id]) await attacker.update(priorActor[attacker.id]).catch(() => {});
        unrig();
        clearTargets();
      }
    });

    // ---- 53. Dark One's Own Luck (a tactical fold on checks and saves, no refund) and Homing Strikes (a miss with the Psychic Blades)
    if (want(53)) await section(53, async () => {
      await closeA1();
      const fighter = game.actors.getName('BTB Test Fighter');
      const luck = fighter ? await hgLend(fighter, "Dark One's Own Luck", 'feat', { 'system.uses.max': '2', 'system.uses.spent': 0 }) : null;
      const labels = fl => (fl?.offers ?? []).map(o => o.label);
      const rescueWindow = text => [...document.querySelectorAll('.application')].find(el => el.querySelector('[data-bf-rescue-row]') && (el.textContent ?? '').includes(text)) ?? null;
      try {
        if (!fighter || !luck) log.push(`§53 skipped: fighter=${!!fighter} luck=${!!luck}`);
        else {
          faces([[8, 20]]);
          const rolls = await fighter.rollSkill({ skill: 'ath' }, { configure: false }, {});
          const m = rolls?.[0]?.parent ?? null;
          const flag = await until(() => m?.getFlag(MOD, 'd20fold') ?? null, { timeout: 4000, label: 'the Athletics check\'s d20 fold record' });
          const offer = (flag?.offers ?? []).find(o => o.label === "Dark One's Own Luck") ?? null;
          ok('53a. an Athletics check offers "Dark One\'s Own Luck" — a d10 (the tactical fold, the feature\'s own tests)', !!offer && /1d10/.test(String(offer?.dieFormula ?? '')),
            `offers=${JSON.stringify(labels(flag))} die=${offer?.dieFormula}`);
          const win = await until(() => rescueWindow("Dark One's Own Luck"), { timeout: 6000, label: 'the Dark One\'s Own Luck rescue window' });
          faces([[7, 10]]);
          win?.querySelector('[data-bf-rescue-action="tactical:Dark One\'s Own Luck"]')?.click();
          const done = await until(() => { const fl = m?.getFlag(MOD, 'd20fold'); return (fl?.spends?.some(s => (s.name === "Dark One's Own Luck") && !s.pendingVerdict) && Number.isFinite(fl.foldedTotal)) ? fl : null; }, { timeout: 10000, label: 'the d10 folded into the check' });
          unrig();
          const left = Number(fighter.items.get(luck.id)?.system?.uses?.value ?? NaN);
          ok('53b. accepted: the d10 (7) added, a use spent (1 of 2), no Second Wind refund line (the feature\'s own fold)',
            (done?.spends?.[0]?.name === "Dark One's Own Luck") && (done?.foldedTotal === done?.baseTotal + 7) && (left === 1) && !/Second Wind/.test(cardText(m?.id)),
            `flag=${JSON.stringify(done && { spends: done.spends, base: done.baseTotal, folded: done.foldedTotal })} left=${left} card="${cardText(m?.id).slice(0, 160)}"`);
          await closeA1();
          // c. a save from the sheet offers it too
          faces([[6, 20]]);
          const sr = await fighter.rollSavingThrow({ ability: 'wis' }, { configure: false }, {});
          const sm = sr?.[0]?.parent ?? null;
          const sflag = await until(() => sm?.getFlag(MOD, 'd20fold') ?? null, { timeout: 4000, label: 'the saving throw\'s d20 fold record' });
          ok('53c. a saving throw offers it as well (tests: check, save)', labels(sflag).includes("Dark One's Own Luck"), `offers=${JSON.stringify(labels(sflag))}`);
          await closeA1();
          // d. Homing Strikes: the Psychic Blades alone
          const blades = await hgLend(pcAttacker, 'Soul Blades', 'feat');
          const psi = await (async () => { const src = await fromUuid('Compendium.dnd-players-handbook.classes.Item.phbrgePsionicPow'); if (!src) return null; const data = src.toObject(); foundry.utils.setProperty(data, '_stats.compendiumSource', src.uuid); const [it] = await pcAttacker.createEmbeddedDocuments('Item', [data]); lentBy.set(pcAttacker, [...(lentBy.get(pcAttacker) ?? []), it.id]); await it.update({ 'system.uses.max': '4', 'system.uses.spent': 0 }); return it; })();
          if (!blades || !psi || !pcWeapon) log.push(`§53d skipped: blades=${!!blades} psi=${!!psi} weapon=${!!pcWeapon}`);
          else {
            await a1Victim();
            await victim.update({ 'system.attributes.ac.override': 30 });
            const missMsg = await swingAt(pcAttacker, pcToken, pcWeapon, { d20: [5] });
            // a window: no Homing Strikes offer on the miss
            const homing = await watch(() => labels(missMsg?.getFlag(MOD, 'd20fold')).includes('Soul Blades'), { ms: 1200 });
            const mflag = missMsg?.getFlag(MOD, 'd20fold') ?? null;
            ok('53d. a Longsword miss (not the Psychic Blades): Homing Strikes is not offered', !homing && !labels(mflag).includes('Soul Blades'), `stray=${!!homing} offers=${JSON.stringify(labels(mflag))}`);
            await closeA1();
          }
        }
      } finally {
        await closeA1();
        unrig();
        if (luck) await unlend(fighter, luck);
        for (const it of pcAttacker.items.filter(i => ['Soul Blades', 'Psionic Power'].includes(i.name) && (lentBy.get(pcAttacker) ?? []).includes(i.id))) await unlend(pcAttacker, it);
        clearTargets();
      }
    });

    // ---- 57. Eldritch Smite: a Pact slot the cost, (1 + pact level)d8 force on the hit, Prone pressed
    if (want(57)) await section(57, async () => {
      await closeDialogs(); await a1Victim(); await dropVictimFx();
      hgKeep(pcAttacker, { 'system.spells': foundry.utils.deepClone(pcAttacker.system._source.spells) });
      const smite = await hgLend(pcAttacker, 'Eldritch Smite', 'feat');
      // The Pact slots are DERIVED from the class: a Warlock at level 5 (pact level 3, two slots), taken back at the end.
      const warlock = await hgLend(pcAttacker, 'Warlock', 'class', { 'system.levels': 5 });
      try {
        if (!smite || !pcWeapon || !warlock) log.push(`§57 skipped: smite=${!!smite} weapon=${!!pcWeapon} warlock=${!!warlock}`);
        else {
          await pcAttacker.update({ 'system.spells.pact.value': 2 });
          const pact = () => pcAttacker.system.spells?.pact ?? {};
          await until(() => Number(pact().value) === 2, { label: 'the PC Attacker at two Pact slots' });
          const r1 = await a1Hit(pcAttacker, pcToken, attackOf(pcAttacker, pcWeapon));
          ok('57a. a weapon hit (no Pact of the Blade bond on the sheet: any weapon, the caveat): the group "Eldritch Smite" with "4d8 force · 1 Pact slot", 2 Pact slots left',
            !!hitBox(r1.offer, 'eldritch-smite') && /(\(1 \+ 3\)|4)d8 force/.test(hitRow(r1.offer, 'eldritch-smite')) && /Pact slot/.test(hitRow(r1.offer, 'eldritch-smite')) && /2 .*Pact slots? left/.test(groupText(r1.offer, 'eldritch-smite')),
            `pact=${JSON.stringify({ value: pact().value, max: pact().max, level: pact().level })} row="${hitRow(r1.offer, 'eldritch-smite').slice(0, 140)}" group="${groupText(r1.offer, 'eldritch-smite').slice(0, 140)}"`);
          await tick(r1.offer, 'eldritch-smite');
          const d1 = await a1Roll(r1.msg, r1.offer);
          await until(() => hasStatus(victim, 'prone'), { timeout: 8000, label: 'Prone pressed on the Victim' });
          // The Pact slot is spent at the ride, a write of its own.
          await until(() => Number(pact().value) === 1, { label: 'a Pact slot spent (1 of 2 left)' });
          const pick = d1?.getFlag(MOD, 'hitManeuver')?.picks?.[0] ?? null;
          ok('57b. ticked: 4d8 force rides, a Pact slot spent (1 of 2), Prone pressed on the Victim',
            typesOf(d1).includes('force') && /^(\(1 \+ 3\)|4)d8$/.test(String(pick?.formula)) && (pick?.poolSpend?.spent === 1) && (Number(pact().value) === 1) && hasStatus(victim, 'prone'),
            `types=${JSON.stringify(typesOf(d1))} pick=${JSON.stringify(pick && { formula: pick.formula, poolSpend: pick.poolSpend })} pact=${pact().value} prone=${hasStatus(victim, 'prone')}`);
        }
      } finally {
        await closeOffers(); await closeDialogs();
        if (hasStatus(victim, 'prone')) await statusOn(victim, 'prone', false);
        await dropVictimFx(); await dropEffects(pcAttacker, riderChits(pcAttacker));
        if (smite) await unlend(pcAttacker, smite);
        if (warlock) await unlend(pcAttacker, warlock);
        unrig(); clearTargets();
      }
    });

    // ---- 59. Lifedrinker (the rider, the heal offered) and Relentless Avenger (Halt's shape on an off-turn melee hit)
    if (want(59)) await section(59, async () => {
      await closeDialogs(); await a1Victim(); await dropVictimFx();
      const drinker = await hgLend(pcAttacker, 'Lifedrinker', 'feat');
      const avenger = await hgLend(pcAttacker, 'Relentless Avenger', 'feat');
      let combat59 = null;
      try {
        if (!drinker || !avenger || !pcWeapon) log.push(`§59 skipped: drinker=${!!drinker} avenger=${!!avenger} weapon=${!!pcWeapon}`);
        else {
          const r1 = await a1Hit(pcAttacker, pcToken, attackOf(pcAttacker, pcWeapon));
          ok('59a. a weapon hit (no Pact of the Blade bond: any weapon, the caveat): the offer\'s ticked rider "Lifedrinker — 1d6 necrotic"',
            !!riderBox(r1.offer, 'lifedrinker') && /1d6/.test(riderRow(r1.offer, 'lifedrinker')) && /necrotic/.test(riderRow(r1.offer, 'lifedrinker')),
            `offer=${!!r1.offer} row="${riderRow(r1.offer, 'lifedrinker').slice(0, 160)}"`);
          const d1 = await a1Roll(r1.msg, r1.offer);
          const rider = ridersOf(d1).find(r => r.key === 'lifedrinker') ?? null;
          const button = await until(() => cardEl(d1?.id)?.querySelector('.bf-rider-offer button') ?? null, { timeout: 6000, label: 'the damage card\'s Lifedrinker heal button' });
          ok('59b. it rode (necrotic), the rider record carries the heal offer, and the damage card shows "Lifedrinker — Heal — spend a Hit Point Die: Use it"',
            typesOf(d1).includes('necrotic') && (rider?.offers?.activity === 'Heal (Largest Hit Die)') && !!button && /spend a Hit Point Die/.test(textOf(cardEl(d1?.id)?.querySelector('.bf-rider-offer'))),
            `types=${JSON.stringify(typesOf(d1))} rider=${JSON.stringify(rider && { offers: rider.offers, caveat: rider.caveat })} button=${!!button}`);
          await dropEffects(pcAttacker, riderChits(pcAttacker));
          // c. Relentless Avenger: a combat on the VICTIM's turn — the PC Attacker's melee hit is read as an Opportunity Attack
          [combat59] = await Combat.createDocuments([{ scene: scene.id, active: true }]);
          created.combats.push(combat59.id);
          await combat59.createEmbeddedDocuments('Combatant', [
            { tokenId: victimToken.document.id, sceneId: scene.id, actorId: victim.id, initiative: 20 },
            { tokenId: pcToken.document.id, sceneId: scene.id, actorId: pcAttacker.id, initiative: 10 }]);
          await combat59.startCombat();
          await until(() => combat59.started, { label: 'the §59 combat started' });
          const r2 = await a1Hit(pcAttacker, pcToken, attackOf(pcAttacker, pcWeapon));
          ok('59c. off the paladin\'s turn: the offer\'s row "Relentless Avenger" (a melee attack off your turn)', !!riderBox(r2.offer, 'relentless-avenger') && /Relentless Avenger/.test(riderRow(r2.offer, 'relentless-avenger')),
            `row="${riderRow(r2.offer, 'relentless-avenger').slice(0, 160)}"`);
          await a1Roll(r2.msg, r2.offer);
          const landed = await until(() => victimFx().find(e => e.name === 'Relentless Avenger') ?? null, { timeout: 8000, label: 'Relentless Avenger on the Victim' });
          ok('59d. the pack\'s "Relentless Avenger" (speed 0) lands on the Victim for the rest of the turn', !!landed && landed.changes.some(c => /movement/.test(c.key)),
            `fx=${JSON.stringify(victimFx().map(e => e.name))} changes=${JSON.stringify(landed?.changes?.map(c => [c.key, c.value]) ?? null)}`);
        }
      } finally {
        await closeOffers(); await closeDialogs();
        if (combat59 && game.combats.get(combat59.id)) await combat59.delete();
        await dropVictimFx(); await dropEffects(pcAttacker, riderChits(pcAttacker));
        for (const it of [drinker, avenger]) if (it) await unlend(pcAttacker, it);
        unrig(); clearTargets();
      }
    });

    // ---- 62. Gift of the Protectors: the creature named on the warlock's page drops to 1 instead of 0, once per Long Rest
    if (want(62)) await section(62, async () => {
      await closeDialogs(); await spendLuck();
      const gift = await hgLend(sorcerer, 'Gift of the Protectors', 'feat');
      try {
        if (!gift) log.push('§62 skipped: no Gift of the Protectors in the PHB');
        else {
          const protect = () => sorcerer.items.get(gift.id).system.activities.find(a => a.name === 'Protect');
          await gift.update({ 'system.description.value': `${gift.system.description.value}<p>Names on the page: BTB Test Halfling</p>`, [`system.activities.${protect().id}.uses.spent`]: 0 });
          const swingLow = async () => {   // `swing` heals to full first: this one leaves the 5 HP alone
            await halfling.update({ 'system.attributes.hp.value': 5, 'system.attributes.hp.temp': 0 });
            attackerToken.control({ releaseOthers: true });
            halflingToken.setTarget(true, { releaseOthers: true });
            faces([[19, 20], [6, 6], [6, 6]]);
            const usage = await act().use({ subsequentActions: false }, { configure: false }, {});
            const rolls = await act().rollAttack({}, { configure: false }, usage?.message?.id ? { data: { 'system.origin': usage.message.id } } : {});
            const m = rolls?.[0]?.parent ?? null;
            await a1Damage(m);
            unrig();
            return m;
          };
          const t0 = Date.now();
          const msg = await swingLow();
          // The use is spent before the card posts; the card's text is read off the chat log.
          const card = await until(() => b4Cards(t0, 'dropToOne').find(m => m.getFlag(MOD, 'dropToOne')?.row === 'Gift of the Protectors') ?? null, { timeout: 8000, label: 'the Gift of the Protectors card' });
          await until(() => cardEl(card.id), { label: 'the Gift of the Protectors card drawn in the chat log' });
          ok('62a. the Halfling (named on the sorcerer\'s page) takes 12 at 5 HP: held at 1, the card "drops to 1 Hit Point instead … the sorcerer\'s Gift of the Protectors", Protect\'s use spent',
            (hp() === 1) && !!card && /BTB Test Sorcerer's Gift of the Protectors/.test(cardText(card?.id)) && (Number(protect()?.uses?.spent) === 1),
            `hp=${hp()} card="${cardText(card?.id).slice(0, 200)}" spent=${protect()?.uses?.spent}`);
          // b. the use spent: the next drop lands the 0
          const msg2 = await swingLow();
          await until(() => hp() === 0, { label: 'the Halfling at 0 HP' });
          ok('62b. with Protect spent, the next drop lands 0', (hp() === 0) && !!msg2 && !!msg, `hp=${hp()}`);
        }
      } finally {
        await closeA1();
        if (gift) await unlend(sorcerer, gift);
        await healFull();
        for (const e of halfling.effects.filter(e => ['Dead', 'Unconscious'].includes(e.name))) await e.delete().catch(() => {});
        unrig(); clearTargets();
      }
    });

    // ---- 67. Searing Vengeance: the offer as a Death Saving Throw rolls
    if (want(67)) await section(67, async () => {
      await closeA1();
      hgKeep(attacker, { 'system.attributes.hp.value': attacker.system._source.attributes.hp.value });
      const wl = await hgLend(sorcerer, 'Warlock', 'class', { 'system.levels': 14 });
      const sv = await hgLend(sorcerer, 'Searing Vengeance', 'feat', { 'system.uses.max': '1', 'system.uses.spent': 0 });
      try {
        if (!wl || !sv) log.push(`§67 skipped: warlock=${!!wl} vengeance=${!!sv}`);
        else {
          await attacker.update({ 'system.attributes.hp.value': Number(attacker.system.attributes.hp.max) || 20 });
          const ahp0 = Number(attacker.system.attributes.hp.value);
          await halfling.update({ 'system.attributes.hp.value': 0, 'system.attributes.hp.temp': 0 });
          const t0 = Date.now();
          faces([[10, 20]]);
          await halfling.rollDeathSave({}, { configure: false }, {});
          unrig();
          const offer = await until(() => c1Cards(t0, 'deathSaveOffer')[0] ?? null, { timeout: 8000, label: 'the Searing Vengeance offer card' });
          const pop = await until(() => titled(/^Searing Vengeance — /), { timeout: 8000, label: 'the warlock\'s Searing Vengeance popup' });
          ok('67a. the Death Saving Throw raises the offer to the warlock (15 ft away): "rolls a Death Saving Throw — Searing Vengeance?"',
            !!offer && !!pop && /rolls a Death Saving Throw — Searing Vengeance\?/.test(textOf(pop?.element)) && (offer.getFlag(MOD, 'deathSaveOffer')?.keeperUuid === sorcerer.uuid),
            `offer=${!!offer} pop="${textOf(pop?.element).slice(0, 200)}"`);
          faces([[4, 8], [4, 8]]);
          pop?.element?.querySelector('button[data-action="use"]')?.click();
          // `applied` is written last: the use, the heal, the burst and the Blinded have landed by then.
          const done = await until(() => offer?.getFlag(MOD, 'deathSaveOffer')?.applied ? offer.getFlag(MOD, 'deathSaveOffer') : null, { timeout: 12000, label: 'the Searing Vengeance offer applied' });
          unrig();
          const cha = Number(sorcerer.getRollData()?.abilities?.cha?.mod ?? 0);
          const blinded = attacker.effects.find(e => (e.name === 'Searing Vengeance') && e.statuses?.has?.('blinded')) ?? null;
          ok('67b. Yes: the Halfling at half its maximum (200), the Attacker within 30 ft takes 2d8 + Cha radiant and is Blinded, the use spent',
            (hp() === 200) && (done?.healed === 200) && (Number(attacker.system.attributes.hp.value) === Math.max(0, ahp0 - (8 + cha))) && !!blinded
              && (Number(sorcerer.items.get(sv.id)?.system?.uses?.spent) === 1) && (done?.victims ?? []).includes(attackerToken.document.name),
            `hp=${hp()} record=${JSON.stringify(done && { healed: done.healed, burst: done.burst, victims: done.victims })} attacker=${attacker.system.attributes.hp.value} (from ${ahp0}, cha ${cha}) blinded=${!!blinded} spent=${sorcerer.items.get(sv.id)?.system?.uses?.spent}`);
        }
      } finally {
        await closeA1(); await hgClose(/^Searing Vengeance — /);
        await clearDown(halfling);
        await dropNamed(attacker, ['Searing Vengeance']); await dropVictimFx();
        for (const it of [sv, wl]) if (it) await unlend(sorcerer, it);
        await healFull();
        unrig(); clearTargets();
      }
    });

    // ---- 85. Hurl Through Hell: the hit menu's group, the save the cost
    if (want(85)) await section(85, async () => {
      await closeDialogs(); await a1Victim(); await dropVictimFx(); await set('saveRolls', 'auto');
      const warlock = await hgLend(pcAttacker, 'Warlock', 'class', { 'system.levels': 14 });
      const hurl = await hgLend(pcAttacker, 'Hurl Through Hell', 'feat', { 'system.uses.max': '1', 'system.uses.spent': 0 });
      try {
        if (!warlock || !hurl || !pcWeapon) log.push(`§85 skipped: warlock=${!!warlock} hurl=${!!hurl} weapon=${!!pcWeapon}`);
        else {
          const t0 = Date.now();
          const r1 = await a1Hit(pcAttacker, pcToken, attackOf(pcAttacker, pcWeapon));
          ok('85a. a hit: the group "Hurl Through Hell" with its one option (a Charisma save, the feature\'s use)', !!hitBox(r1.offer, 'hurl-through-hell') && /Hurl Through Hell/.test(groupText(r1.offer, 'hurl-through-hell')) && /1 .*use/.test(groupText(r1.offer, 'hurl-through-hell')),
            `row="${hitRow(r1.offer, 'hurl-through-hell').slice(0, 120)}" group="${groupText(r1.offer, 'hurl-through-hell').slice(0, 140)}"`);
          await tick(r1.offer, 'hurl-through-hell');
          faces([[1, 20]]);
          await a1Roll(r1.msg, r1.offer);
          const c1 = await settledSave('hurl-through-hell', t0);
          // The table's line draws when the card re-renders with its maneuver flag (written after the card's birth).
          await until(() => /Played at the table/.test(cardText(c1?.id)), { label: 'the save card\'s "Played at the table" line' });
          unrig();
          ok('85b. ticked: the Charisma save demanded of the Victim (failed), the use spent, the table\'s line on the card',
            (outcomeOn(c1) === 'failed') && (Number(pcAttacker.items.get(hurl.id)?.system?.uses?.spent) === 1) && /Played at the table/.test(cardText(c1?.id)),
            `outcome=${outcomeOn(c1)} spent=${pcAttacker.items.get(hurl.id)?.system?.uses?.spent} card="${cardText(c1?.id).slice(0, 200)}"`);
        }
      } finally {
        await closeOffers(); await closeDialogs();
        await dropVictimFx(); await dropEffects(pcAttacker, riderChits(pcAttacker));
        for (const it of [hurl, warlock]) if (it) await unlend(pcAttacker, it);
        unrig(); clearTargets();
      }
    });

    // ---- 91. a Death Saving Throw with no keeper: no offer
    if (want(91)) await section(91, async () => {
      await closeA1();
      try {
        await halfling.update({ 'system.attributes.hp.value': 0, 'system.attributes.hp.temp': 0 });
        const t0 = Date.now();
        faces([[10, 20]]);
        await halfling.rollDeathSave({}, { configure: false }, {});
        unrig();
        const stray91 = await watch(() => c1Cards(t0, 'deathSaveOffer')[0] ?? null, { ms: 1500 });   // a window: no offer card
        ok('91a. nobody within 60 ft holds Searing Vengeance: the Death Saving Throw raises no offer', !stray91 && (c1Cards(t0, 'deathSaveOffer').length === 0), `offers=${c1Cards(t0, 'deathSaveOffer').length}`);
      } finally {
        await clearDown(halfling);
        await healFull();
        unrig(); clearTargets();
      }
    });
    return { log, results, skips };
  } catch (err) {
    return { fatal: `${err?.message || err}\n${err?.stack ?? ''}`, results, log, skips };
  }
} });

await finish({ tag: 'class-warlock', out, plan, f });
