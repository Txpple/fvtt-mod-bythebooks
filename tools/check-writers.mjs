// Static one-writer check (no Foundry, milliseconds): every handler on a hook that fires on EVERY
// client, and writes the world, is gated to one client (ARCHITECTURE §3 *Who does what*, §4
// *The flow elect*). A write every client performs lands twice: damage applied twice, a chip
// twice, an answer folded on two clients.
//
//   node tools/check-writers.mjs            # the check (gate: npm run writers)
//   node tools/check-writers.mjs --paths    # every handler on an every-client hook, and its path to a write
//
// How it reads the code (the repo's TypeScript parser, whole-program):
//   - a ROOT is a `listen(hook, key, fn)` handler on an EVERY-CLIENT hook: a document's
//     create / update / delete hook, the chat card's render, the combat hooks, `ready`,
//     `canvasReady`, `init`, `targetToken`. A pre-hook runs on the acting client alone; a roll
//     hook on the roller's; a dnd5e use / apply / rest hook on the client that did it.
//   - a WRITE is a document write (`setFlag`, `update`, `create`, `delete()`, an embedded
//     create / delete, `applyDamage`, a status toggle, a roll performed) — see WRITE_METHODS.
//   - a GATE is an expression that answers "is this client the one": `isActiveGM()`,
//     `drivesMomentFor(…)`, `isContinuingClient(…)`, `keepsMessage(…)`, `canAnswerFor(…)`,
//     `….isSelf`, `….isAuthor`, a comparison with `game.user.id` — and a call to a function of
//     this tree whose body is one of those and writes nothing (a keeper predicate). `isOwner` is
//     NOT one: a GM owns everything, so two clients pass it.
//   - a site (a write, or a call the walk follows) is GUARDED when a gate DOMINATES it: it sits
//     in the then-branch of an `if` whose condition carries a gate, to the right of a gate in an
//     `&&` or a `?:`, or after an early exit (`if ( !gate ) return`) in its block or an enclosing
//     one. A gate elsewhere in the function guards nothing.
//   - the walk follows calls to functions declared in scripts/ (same file, or imported by name)
//     and inline callbacks passed to a call (`.then(fn)`, `queueFlagWrite(m, k, fn)`, a timer);
//     it does not follow a click handler (`momentButton`, `addEventListener`) or a registry's
//     callbacks (`register*`, a dialog's buttons): those run on a click, or under the spine's own
//     gate. The spine's relay and resumables are that gate: `relay.owns(…)` and `r.drives(…)`
//     guard their fold and drive, and every registered `owns` / `drives` is checked to be a gate.
//     A decision clock's `owns` is the same gate (ui.js `armAskTimer`; tools/check-clocks.mjs
//     proves every one handed to it is one).
// A handler that must write on every client by design is pinned in ALLOW with its reason.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { jsFiles, SCRIPTS, toPosix } from "./check-layers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(join(ROOT, "package.json"))("typescript");

/* --- the vocabulary ----------------------------------------------------------------------- */

/** A hook every connected client receives. */
const EVERY_CLIENT = hook => /^(create|update|delete)[A-Z]/.test(hook)
  || ["dnd5e.renderChatMessage", "ready", "canvasReady", "init", "combatStart", "targetToken"].includes(hook);

/** Method names that write the world when called on a document (`.delete()` bare: a Map's takes a key). */
const WRITE_METHODS = new Set(["setFlag", "unsetFlag", "update", "create", "createEmbeddedDocuments",
  "deleteEmbeddedDocuments", "updateEmbeddedDocuments", "applyDamage", "toggleStatusEffect", "use",
  "rollDamage", "rollAttack", "rollSavingThrow", "rollAbilityCheck", "rollSkill", "rollToolCheck",
  "toMessage", "updateSource"]);
/** Free functions that write (core's serializer, and core's clearFlag). */
const WRITE_CALLS = new Set(["queueFlagWrite", "clearFlag"]);
const WRITE_STATIC = /^(ChatMessage|ActiveEffect(\.implementation)?|Actor|Item|Scene|Combat)\.(create|createDocuments|deleteDocuments|updateDocuments)$/;

/**
 * Calls whose result says whether THIS client acts. `isHeld` too: the hold registry is client-local
 * memory, so "this client holds the cast" is held on exactly one client.
 */
const GATE_CALLS = new Set(["isActiveGM", "drivesMomentFor", "isContinuingClient", "keepsMessage", "canAnswerFor", "isHeld"]);
/** The spine's registry gates: the relay's `owns`, the resumable's `drives` (checked below to be gates themselves) and the clock's `owns` (check-clocks). */
const REGISTRY_GATES = new Set(["owns", "drives"]);
/** Property reads that do the same. */
const GATE_PROPS = new Set(["isSelf", "isAuthor"]);
/** Callbacks a human fires: not this client's flow. */
const CLICK_BINDERS = new Set(["addEventListener", "momentButton"]);
/** Registries whose callbacks the spine runs under its own gate, or on a click. */
const REGISTRIES = /^register[A-Z]/;

/**
 * Flags several writers fold per-target entries into (ARCHITECTURE §4 law 2). A read-modify-write
 * of one of these goes through `queueFlagWrite` (core.js); a `setFlag` of a FRESH object literal
 * is the stamp, which has nothing to merge with, and passes.
 */
const SERIALIZED_FLAGS = new Set(["hold", "receipt", "effectReceipt"]);

/**
 * Handlers that write on every client by design, `file:line` of the `listen` call → the reason.
 * ⚠ A stale row (no such handler, or one that no longer reaches an ungated write) fails.
 */
const ALLOW = new Map([
  ["ui.js:1167", "the leading window: each GM window writes its OWN user's lead flag on load and focus (core.js leadsWindow) — the one write whose point is that every window makes it, the newest standing"]
]);

/* --- the program --------------------------------------------------------------------------- */

const files = new Map();   // rel → { sf, text, fns: Map<name, node>, imports: Map<name, {rel, name}> }

for (const path of jsFiles(SCRIPTS)) {
  const rel = toPosix(relative(SCRIPTS, path));
  const text = readFileSync(path, "utf8");
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const fns = new Map();
  const imports = new Map();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) fns.set(stmt.name.text, stmt);
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          fns.set(d.name.text, d.initializer);
        }
      }
    }
    if (ts.isImportDeclaration(stmt) && stmt.importClause?.namedBindings && ts.isNamedImports(stmt.importClause.namedBindings)) {
      const spec = stmt.moduleSpecifier.text;
      if (!spec.startsWith(".")) continue;
      const target = toPosix(relative(SCRIPTS, normalize(join(dirname(path), spec))));
      for (const el of stmt.importClause.namedBindings.elements) {
        imports.set(el.name.text, { rel: target, name: (el.propertyName ?? el.name).text });
      }
    }
  }
  files.set(rel, { sf, text, fns, imports });
}

/** The function `name` resolves to from `rel`: `{ rel, name, node }` or null. */
function resolve(rel, name) {
  const f = files.get(rel);
  if (!f) return null;
  if (f.fns.has(name)) return { rel, name, node: f.fns.get(name) };
  const imp = f.imports.get(name);
  if (!imp) return null;
  const target = files.get(imp.rel);
  if (!target?.fns.has(imp.name)) return null;
  return { rel: imp.rel, name: imp.name, node: target.fns.get(imp.name) };
}

const lineOf = (rel, node) => files.get(rel).sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;

/* --- gates and dominance -------------------------------------------------------------------- */

/** Does this expression carry a gate — a gate call, a gate property, a keeper predicate of the tree? */
function hasGate(rel, node) {
  let found = false;
  const visit = n => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee) && (GATE_CALLS.has(callee.text) || REGISTRY_GATES.has(callee.text) || isKeeperPredicate(rel, callee.text))) { found = true; return; }
      if (ts.isPropertyAccessExpression(callee) && (GATE_CALLS.has(callee.name.text) || REGISTRY_GATES.has(callee.name.text))) { found = true; return; }
    }
    if (ts.isPropertyAccessExpression(n) && GATE_PROPS.has(n.name.text)) { found = true; return; }
    if (ts.isPropertyAccessExpression(n) && /^game\.(user\.id|userId)$/.test(n.getText())) { found = true; return; }
    if (ts.isIdentifier(n) && (n.text === "userId")) { found = true; return; }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** A function of the tree that gates and writes nothing: calling it is asking the gate. */
const keeperMemo = new Map();
function isKeeperPredicate(rel, name) {
  const target = resolve(rel, name);
  if (!target) return false;
  const key = `${target.rel}#${target.name}`;
  if (keeperMemo.has(key)) return keeperMemo.get(key);
  keeperMemo.set(key, false);   // a cycle reads as "not a predicate"
  const f = facts(target.rel, target.name, target.node);
  const value = f.gatedAnywhere && !f.writes.length && !f.calls.length;
  keeperMemo.set(key, value);
  return value;
}

/** Does an exit statement end this statement (a return / continue / break / throw, or a block ending in one)? */
function exits(stmt) {
  if (!stmt) return false;
  if (ts.isReturnStatement(stmt) || ts.isContinueStatement(stmt) || ts.isBreakStatement(stmt) || ts.isThrowStatement(stmt)) return true;
  if (ts.isBlock(stmt)) return exits(stmt.statements[stmt.statements.length - 1]);
  return false;
}

/** Is `site` dominated by a gate inside `fn`? */
function guarded(rel, site, fn) {
  let node = site;
  while (node && (node !== fn)) {
    const parent = node.parent;
    if (!parent) break;
    // the then-branch of `if ( gate )`
    if (ts.isIfStatement(parent) && (node === parent.thenStatement) && hasGate(rel, parent.expression)) return true;
    // the right of `gate && …`, `gate ?? …`; the branches of `gate ? … : …`
    if (ts.isBinaryExpression(parent) && (node === parent.right)
      && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.QuestionQuestionToken].includes(parent.operatorToken.kind)
      && hasGate(rel, parent.left)) return true;
    if (ts.isConditionalExpression(parent) && (node !== parent.condition) && hasGate(rel, parent.condition)) return true;
    // an early exit above, in this block or an enclosing one: `if ( !gate ) return;`
    if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
      for (const stmt of parent.statements) {
        if (stmt === node) break;
        if (ts.isIfStatement(stmt) && exits(stmt.thenStatement) && !stmt.elseStatement && hasGate(rel, stmt.expression)) return true;
      }
    }
    node = parent;
  }
  return false;
}

/* --- what a function does ------------------------------------------------------------------- */

/**
 * One function body, nested inline callbacks included, click and registry callbacks excluded:
 * `{ writes: [{line, guarded}], calls: [{name, guarded}], gatedAnywhere }`.
 */
function read(rel, fn) {
  const out = { writes: [], calls: [], gatedAnywhere: false };
  const body = (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn)) ? fn.body : fn;
  if (!body) return out;
  // `inClick`: inside a callback a human fires. `heldBack`: inside a callback handed to a function
  // that gates before it fires it (`armAskTimer` arms only on the elect).
  const visit = (node, inClick, heldBack) => {
    // A class inside a handler (a Region behaviour's) is its own set of roots, not this flow.
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const text = callee.getText();
      const isGuarded = () => heldBack || guarded(rel, node, body);
      let target = null;
      if (!inClick) {
        let write = false;
        if (ts.isIdentifier(callee)) {
          if (WRITE_CALLS.has(callee.text)) write = true;
          else {
            out.calls.push({ name: callee.text, guarded: isGuarded() });
            target = resolve(rel, callee.text);
          }
        } else if (ts.isPropertyAccessExpression(callee)) {
          const method = callee.name.text;
          if (WRITE_STATIC.test(text) || WRITE_METHODS.has(method)) write = true;
          else if ((method === "delete") && (node.arguments.length === 0)) write = true;
        }
        if (write) out.writes.push({ line: lineOf(rel, node), guarded: isGuarded() });
      }
      const click = inClick || (ts.isPropertyAccessExpression(callee) && CLICK_BINDERS.has(callee.name.text))
        || (ts.isIdentifier(callee) && (CLICK_BINDERS.has(callee.text) || REGISTRIES.test(callee.text)));
      // The callee gates before it runs what it was handed: its callbacks are behind that gate.
      const held = heldBack || isGuarded() || (!!target && facts(target.rel, target.name, target.node).gatedAnywhere);
      visit(callee, inClick, heldBack);
      for (const a of node.arguments) {
        // A function passed by name runs later, on this client: follow it as a call.
        if (!click && ts.isIdentifier(a) && resolve(rel, a.text)) out.calls.push({ name: a.text, guarded: held });
        visit(a, click, held);
      }
      return;
    }
    // A function expression as an object property is a registry's or a dialog's callback.
    if (ts.isPropertyAssignment(node) && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      visit(node.initializer, true, heldBack);
      return;
    }
    ts.forEachChild(node, c => visit(c, inClick, heldBack));
  };
  visit(body, false, false);
  out.gatedAnywhere = hasGate(rel, body);
  return out;
}

const memo = new Map();
function facts(rel, name, node) {
  const key = `${rel}#${name}`;
  if (!memo.has(key)) {
    memo.set(key, { writes: [], calls: [], gatedAnywhere: false });   // a cycle reads as inert
    memo.set(key, read(rel, node));
  }
  return memo.get(key);
}

/**
 * The first ungated path from `fn` to a write: `[{rel, name, line}]`, or null when every write
 * reachable is behind a gate. `gated`: a gate dominates the call that brought us here.
 */
function ungatedPath(rel, name, node, gated, seen) {
  const key = `${rel}#${name}|${gated}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const f = facts(rel, name, node);
  if (!gated) {
    const open = f.writes.find(w => !w.guarded);
    if (open) return [{ rel, name, line: open.line }];
  }
  for (const call of f.calls) {
    const target = resolve(rel, call.name);
    if (!target) continue;
    const path = ungatedPath(target.rel, target.name, target.node, gated || call.guarded, seen);
    if (path) return [{ rel, name, line: null }, ...path];
  }
  return null;
}

/**
 * The hook names a `listen` call's first argument stands for: a string literal, or the loop
 * variable of a `for ( const hook of [...] )` over literals (the array written inline, or a `const`
 * of the file, `Object.freeze`d or not).
 */
function hookNamesOf(rel, arg) {
  if (!arg) return [];
  if (ts.isStringLiteral(arg)) return [arg.text];
  // The module's own hooks (`${MODULE_ID}.…`): fired on the client that calls them, never every client.
  if (ts.isTemplateExpression(arg)) return [arg.getText()];
  if (!ts.isIdentifier(arg)) return [];
  // The loop that binds it: `for ( const hook of … )`, or `for ( const [hook, …] of … )` over rows.
  let n = arg.parent;
  let index = null;
  while (n) {
    if (ts.isForOfStatement(n) && ts.isVariableDeclarationList(n.initializer)) {
      const d = n.initializer.declarations[0];
      if (d && ts.isIdentifier(d.name) && (d.name.text === arg.text)) break;
      if (d && ts.isArrayBindingPattern(d.name)) {
        const at = d.name.elements.findIndex(e => ts.isBindingElement(e) && ts.isIdentifier(e.name) && (e.name.text === arg.text));
        if (at >= 0) { index = at; break; }
      }
    }
    n = n.parent;
  }
  if (!n) return [];
  let list = n.expression;
  if (ts.isIdentifier(list)) {
    const decl = files.get(rel).sf.statements.flatMap(s => ts.isVariableStatement(s) ? [...s.declarationList.declarations] : [])
      .find(d => ts.isIdentifier(d.name) && (d.name.text === list.getText()));
    list = decl?.initializer ?? list;
  }
  if (ts.isCallExpression(list) && /Object\.freeze$/.test(list.expression.getText())) list = list.arguments[0];
  if (!list || !ts.isArrayLiteralExpression(list)) return [];
  const items = (index === null) ? list.elements
    : list.elements.map(e => (ts.isArrayLiteralExpression(e) ? e.elements[index] : null)).filter(Boolean);
  return items.filter(e => ts.isStringLiteral(e)).map(e => e.text);
}

/* --- the roots: every-client handlers ------------------------------------------------------- */

const failures = [];
const report = [];
let roots = 0;
let writing = 0;
const showPaths = process.argv.includes("--paths");
const seenAllow = new Set();

for (const [rel, f] of files) {
  const visit = node => {
    // A serialized flag written around the serializer: `setFlag(MODULE_ID, "hold", variable)`.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && (node.expression.name.text === "setFlag") && (rel !== "core.js")) {
      const [, keyArg, valueArg] = node.arguments;
      if (keyArg && ts.isStringLiteral(keyArg) && SERIALIZED_FLAGS.has(keyArg.text)
        && !(valueArg && ts.isObjectLiteralExpression(valueArg))) {
        failures.push(`${rel}:${lineOf(rel, node)} writes the \`${keyArg.text}\` flag around the serializer — `
          + "a read-modify-write of a per-target flag goes through queueFlagWrite (ARCHITECTURE §4 law 2); "
          + "only a stamp (a fresh object literal) may setFlag it");
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && ["listen", "listenOnce"].includes(node.expression.text) && (rel !== "dispatch.js")) {
      const [hookArg, , fnArg] = node.arguments;
      const names = hookNamesOf(rel, hookArg);
      if (!names.length) failures.push(`${rel}:${lineOf(rel, node)} — listen's hook name is neither a string nor a loop over strings; this check cannot read it`);
      const hook = names.filter(EVERY_CLIENT).join("|");
      if (fnArg && hook) {
        roots++;
        const at = `${rel}:${lineOf(rel, node)}`;
        // `listen(hook, key, name)`: a named handler.
        const target = ts.isIdentifier(fnArg) ? (resolve(rel, fnArg.text)?.node ?? null) : fnArg;
        if (!target) return;
        const path = ungatedPath(rel, `<${hook} handler at ${lineOf(rel, node)}>`, target, false, new Set());
        const allowed = ALLOW.get(at);
        if (path) {
          writing++;
          if (allowed) { seenAllow.add(at); report.push(`ALLOWED ${at} (${hook}) — ${allowed}`); }
          else {
            const chain = path.map(p => `${p.rel}${p.name.startsWith("<") ? "" : ` ${p.name}`}${p.line ? `:${p.line}` : ""}`).join(" → ");
            failures.push(`${at} (${hook}) reaches a world write with no gate on the way: ${chain}`);
          }
        } else if (allowed) {
          failures.push(`stale pin: ${at} is in ALLOW and no ungated write is reachable from it — remove the row`);
        }
        if (showPaths) report.push(`${path ? "UNGATED" : "gated  "} ${at} (${hook})${path ? ` — ${path.map(p => p.name).join(" → ")}` : ""}`);
      }
    }
    // The spine's registry gates must be gates: a relay's `owns`, a resumable's `drives`.
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && ["registerRelay", "registerResumable"].includes(node.expression.text)) {
      const which = node.expression.text === "registerRelay" ? "owns" : "drives";
      const spec = node.arguments[1];
      const prop = spec && ts.isObjectLiteralExpression(spec)
        ? spec.properties.find(p => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && (p.name.text === which)) : null;
      const at = `${rel}:${lineOf(rel, node)}`;
      if (!prop) failures.push(`${at} ${node.expression.text} without \`${which}\` — the spine cannot elect a client for it`);
      else if (!hasGate(rel, prop.initializer) && !/^\(\)\s*=>\s*true$/.test(prop.initializer.getText())) {
        failures.push(`${at} ${node.expression.text}'s \`${which}\` is not a gate (${prop.initializer.getText().slice(0, 60)}) — `
          + "it must elect one client: isActiveGM, drivesMomentFor, keepsMessage, isContinuingClient…");
      } else if (/^\(\)\s*=>\s*true$/.test(prop.initializer.getText())) {
        // `drives: () => true` defers the election to the drive: the drive itself must gate before it writes.
        const drive = spec.properties.find(p => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && (p.name.text === "drive"));
        const driveFn = drive && (ts.isIdentifier(drive.initializer) ? resolve(rel, drive.initializer.text)?.node : drive.initializer);
        const path = driveFn ? ungatedPath(rel, `<drive at ${lineOf(rel, node)}>`, driveFn, false, new Set()) : null;
        if (path) failures.push(`${at} registerResumable drives on every client (\`drives: () => true\`) and its drive reaches an ungated write: `
          + path.map(p => `${p.rel}${p.name.startsWith("<") ? "" : ` ${p.name}`}${p.line ? `:${p.line}` : ""}`).join(" → "));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(f.sf);
}
for (const at of ALLOW.keys()) {
  if (!seenAllow.has(at) && !failures.some(f => f.startsWith(`stale pin: ${at}`))) {
    failures.push(`stale pin: ${at} is in ALLOW and no listen call sits there — remove or move the row`);
  }
}

/* --- the report ---------------------------------------------------------------------------- */

for (const line of report) console.log(line);
if (failures.length) {
  console.error("");
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`\n${failures.length} one-writer failure(s). A handler on an every-client hook that writes the world `
    + "gates on the elect first (isActiveGM, drivesMomentFor, keepsMessage…) so that ONE client writes, or is pinned in ALLOW with its reason.");
  process.exit(1);
}
console.log(`PASS every world write reachable from an every-client hook is behind a gate (${roots} handlers on `
  + `every-client hooks, ${writing} pinned as writing on every client — ARCHITECTURE §3), and every `
  + `read-modify-write of ${[...SERIALIZED_FLAGS].join("/")} goes through the serializer (§4 law 2).`);
