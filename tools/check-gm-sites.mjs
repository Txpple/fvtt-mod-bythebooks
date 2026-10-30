// Static GM-site check (no Foundry, milliseconds): every read of `isGM` in scripts/ is tagged with what
// it means when several GM clients are on at once (ARCHITECTURE §4 *The flow elect*, *Several GM clients*).
// `game.user.isGM` is true on EVERY GM client — the Gamemaster's window, an Assistant GM's, the MCP
// bridge — so a site behind it runs once per GM screen. That is right for what a screen shows and wrong
// for what the world gets: a consequence lands once, on the elect (`isActiveGM()`), never behind `isGM`.
//
//   node tools/check-gm-sites.mjs            # the check (gate: npm run gmsites)
//   node tools/check-gm-sites.mjs --list     # every site, its tag and its reason
//
// What it reads (the repo's TypeScript parser, per file): every `….isGM` property read outside comments.
// A read of `game.user.isGM` (this client's own role) is a GATE; any other (`u.isGM` over the users, a
// viewer's field) is a ROLE read. Each site is pinned in ALLOW by `"<file> <function> <gate|role>"`
// with how many reads sit there, its tag and its reason:
//   presentation  a gate on what this screen draws or offers: a button, a popup, a control, a view, a
//                 notification. Every GM screen shows it; a click on it is that GM's own act, and the
//                 write it makes is guarded where it lands (the record's own state, the serializer)
//   own           a gate on a write this client makes for itself on every GM client by design: its own
//                 User's flag, a card it posts itself
//   role          a read of some user's role, not this client's gate: who receives a card, who rolls
// A gate cannot be tagged `consequence`: a write that must land once moves behind `isActiveGM()` (or a
// claim through the serializer), and tools/check-writers.mjs proves every write reachable from a hook
// every client receives sits behind an elect. An unpinned site fails, a pin whose count moved fails, and
// a stale pin (no such site) fails.
// THE LANDING CLAIM, beside it: a record's claim (`applying`, `fallbackApplying`) is the stamp core.js
// `claimLanding` writes, naming its claimant, and a claim whose claimant left is dead (`claimHolds`). Outside
// core.js a claim field is only released (`= false`, `applying: false`) or read through `claimHolds`: a raw
// `applying = true` is a claim nobody can re-drive, and a bare `!flag.applying` reads a dead claim as live. The
// re-driven steps claim the same way: `dismissing`, `companion.acting`, `changing`, `resolving` (issue #21).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { jsFiles, SCRIPTS, toPosix } from "./check-layers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(join(ROOT, "package.json"))("typescript");

const TAGS = new Set(["presentation", "own", "role"]);

/** `"<file> <function> <gate|role>"` → `{ n, tag, why }`: every `isGM` read in scripts/, tagged. */
const ALLOW = new Map([
  ["core.js canAnswerFor gate", { n: 2, tag: "presentation", why: "presentation — who may answer a moment: an owning player while one is connected, else every GM; two GM clients each get the popup, the fold's own state takes the first answer, and each machine closes its popup once the moment is answered (§5 law 4)" }],
  ["core.js canAnswerFor role", { n: 1, tag: "role", why: "an owning player is one who is not a GM" }],
  ["core.js rollerUserFor role", { n: 1, tag: "role", why: "who rolls for an actor: its first active owner who is not a GM" }],
  ["core.js gmIds role", { n: 1, tag: "role", why: "the recipients: every GM's id" }],
  ["core.js ownersAndGmIds role", { n: 1, tag: "role", why: "the recipients: an actor's owners and every GM" }],
  ["decide/emanations.js liveScenes role", { n: 1, tag: "role", why: "a GM's view counts only with no player connected" }],
  ["emanations.js liveNow role", { n: 1, tag: "role", why: "the viewers' roles handed to liveScenes" }],
  ["emanations.js listen:dnd5e.renderChatMessage gate", { n: 1, tag: "presentation", why: "presentation — the aura card's pick buttons enabled for a GM; the click folds on the card's keeper (answerPick)" }],
  ["gallery.js judge gate", { n: 1, tag: "presentation", why: "presentation — the placement ghost judges a hidden token occupied for a GM, who sees it" }],
  ["hold/views.js listen:dnd5e.renderChatMessage role", { n: 1, tag: "role", why: "the card names the held target's owning player, never a GM" }],
  ["mastery-record.js listen:getHeaderControlsGroupActorSheet gate", { n: 1, tag: "presentation", why: "presentation — the group sheet's Weapon masteries control, a GM's view" }],
  ["metamagic.js postDeferredCard gate", { n: 1, tag: "own", why: "the casting client posts its own held usage card; a player may not author another user's card, a GM keeps the author" }],
  ["migrate.js listen:ready gate", { n: 1, tag: "presentation", why: "presentation — the warning to disable the old package, on every GM screen" }],
  ["receipts.js listen:dnd5e.renderChatMessage gate", { n: 1, tag: "presentation", why: "presentation — the pool and the Revert buttons drawn for a GM; a revert restores the receipt's recorded prior and marks the entry, so a second GM's click on its copy finds nothing to revert" }],
  ["summons.js drawSummon gate", { n: 1, tag: "presentation", why: "presentation — the Dismiss button for a GM; the ask folds through the serializer once (`dismissAsked`), and the elect dismisses" }],
  ["topple.js listen:dnd5e.renderChatMessage gate", { n: 1, tag: "presentation", why: "presentation — the GM's \"failed — Prone\" button; Prone is pressed only where none stands and the entry is marked through the serializer, so a second GM's click changes nothing" }],
  ["transforms.js showChangePopup gate", { n: 1, tag: "presentation", why: "presentation — the GM's change of a landed form, a popup on the GM's own click; the ask folds once (`changeAsked`), and every GM's open change popup closes once a change, a revert or the end lands" }],
  ["transforms.js drawTransform gate", { n: 2, tag: "presentation", why: "presentation — the Revert and Change the form buttons for a GM; each ask folds through the serializer once" }],
  ["ui.js claimLead gate", { n: 1, tag: "own", why: "the leading window: each GM window claims its own user's lead flag (core.js leadsWindow); every GM user has its own" }],
  ["ui.js listen:ready gate", { n: 2, tag: "own", why: "the leading window: whether this window leads its own user at ready, and its lead handed back as it closes" }],
  ["ui.js listen:updateUser gate", { n: 1, tag: "own", why: "the re-drive: a GM window handed its own user's lead resumes the recent cards as a window taking it does; each resumable drives under its own `drives`" }]
]);

const list = process.argv.includes("--list");
const failures = [];
const seen = new Map();
const lines = [];

/** The claim fields core.js `claimLanding` stamps. */
const CLAIM_FIELDS = new Set(["applying", "fallbackApplying", "landing", "dismissing", "acting", "changing", "resolving"]);
let claimSites = 0;

const isFn = n => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

/** The function a site sits in: the innermost one with a name, or the `listen` / `listenOnce` handler around it (`listen:<hook>`). */
function functionName(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (!isFn(n)) continue;
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
    if (ts.isMethodDeclaration(n) && n.name) return n.name.getText();
    const p = n.parent;
    if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (p && ts.isCallExpression(p) && ts.isIdentifier(p.expression) && /^listen(Once)?$/.test(p.expression.text)
      && ts.isStringLiteral(p.arguments[0])) return `listen:${p.arguments[0].text}`;
  }
  return "<top>";
}

for (const path of jsFiles(SCRIPTS)) {
  const rel = toPosix(relative(SCRIPTS, path));
  const sf = ts.createSourceFile(rel, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = node => {
    if (ts.isPropertyAccessExpression(node) && (node.name.text === "isGM")) {
      const whose = node.expression.getText().replace(/\?/g, "");
      const kind = (whose === "game.user") ? "gate" : "role";
      const pin = `${rel} ${functionName(node)} ${kind}`;
      const at = `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
      const site = seen.get(pin) ?? { n: 0, at: [] };
      site.n++;
      site.at.push(at);
      seen.set(pin, site);
    }
    if (rel !== "core.js") claimSite(node, rel, sf);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** A claim field written or read outside core.js: a release, or a read through `claimHolds`; anything else fails. */
function claimSite(node, rel, sf) {
  const at = () => `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const isFalse = n => n?.kind === ts.SyntaxKind.FalseKeyword;
  if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && CLAIM_FIELDS.has(node.name.text)) {
    claimSites++;
    if (!isFalse(node.initializer)) failures.push(`${at()} writes the claim \`${node.name.text}\` as ${node.initializer.getText()} — a landing is claimed by core.js claimLanding, with the claimant's stamp; outside it a claim is only released (false)`);
    return;
  }
  if (!ts.isPropertyAccessExpression(node) || !CLAIM_FIELDS.has(node.name.text)) return;
  claimSites++;
  const p = node.parent;
  if (ts.isBinaryExpression(p) && (p.left === node) && (p.operatorToken.kind === ts.SyntaxKind.EqualsToken)) {
    if (!isFalse(p.right)) failures.push(`${at()} writes the claim \`${node.name.text}\` as ${p.right.getText()} — a landing is claimed by core.js claimLanding, with the claimant's stamp; outside it a claim is only released (false)`);
    return;
  }
  if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && (p.expression.text === "claimHolds") && (p.arguments[0] === node)) return;
  if (ts.isDeleteExpression(p)) return;   // a release, as `= false` is
  failures.push(`${at()} reads the claim \`${node.name.text}\` bare (${p.getText().slice(0, 60)}) — read it through core.js claimHolds, so a claim whose claimant left reads as none`);
}

for (const [pin, site] of seen) {
  const allowed = ALLOW.get(pin);
  if (!allowed) {
    failures.push(`${site.at.join(", ")} (${pin}) reads isGM untagged — tag it in ALLOW: presentation (what a GM screen shows), `
      + "own (a write each GM client makes for itself) or role (a user's role, not this client's gate); a consequence gates on isActiveGM(), not isGM");
    continue;
  }
  if (!TAGS.has(allowed.tag)) failures.push(`${pin}: tag "${allowed.tag}" — a site is presentation, own or role; a consequence gates on isActiveGM(), not isGM`);
  else if ((allowed.tag === "role") !== pin.endsWith(" role")) failures.push(`${pin}: a ${pin.endsWith(" role") ? "role read" : "gate on game.user.isGM"} cannot be tagged ${allowed.tag}`);
  if (site.n !== allowed.n) failures.push(`${site.at.join(", ")} (${pin}): ${site.n} isGM read(s) where ALLOW pins ${allowed.n} — a new one is its own site: tag it, or move the count`);
  lines.push(`${allowed.tag.padEnd(12)} ${pin} ×${site.n} (${site.at.join(", ")}) — ${allowed.why}`);
}
for (const pin of ALLOW.keys()) {
  if (!seen.has(pin)) failures.push(`stale pin: ${pin} is in ALLOW and no isGM read sits there — remove or move the row`);
}

if (list) for (const line of lines.sort()) console.log(line);
if (failures.length) {
  console.error("");
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`\n${failures.length} GM-site failure(s). Every isGM read is tagged (presentation, own or role) in tools/check-gm-sites.mjs ALLOW; `
    + "a write that must land once gates on isActiveGM() (ARCHITECTURE §4 *The flow elect*).");
  process.exit(1);
}
const count = tag => [...seen].filter(([pin]) => ALLOW.get(pin)?.tag === tag).reduce((n, [, s]) => n + s.n, 0);
console.log(`PASS every isGM read in scripts/ is tagged (${[...seen.values()].reduce((n, s) => n + s.n, 0)} reads at ${seen.size} sites: `
  + `${count("presentation")} presentation, ${count("own")} own, ${count("role")} role; no consequence behind isGM; ${claimSites} claim-field sites, `
  + `each a release or a claimHolds read — ARCHITECTURE §4).`);
