// Static change-kind check (no Foundry, milliseconds): an effect change's kind is read through decide/changes.js
// `changeType` and written typed, never through Foundry 14's deprecated numeric `mode` (issue #23). On 14 a change's
// `mode` is a shim that logs a compatibility warning on every read and is gone in 16; `CONST.ACTIVE_EFFECT_MODES`
// warns too.
//
//   node tools/check-change-modes.mjs      # the check (gate: npm run changemodes)
//
// What it reads (the repo's TypeScript parser, per file; decide/changes.js alone is exempt):
//   1. No `ACTIVE_EFFECT_MODES` anywhere.
//   2. No object literal with `key`, `value` and `mode`: a change written in the numeric shape.
//   3. No `.mode` read off a change: a variable named `change`, a callback's parameter or a `for … of` variable
//      over a `changes` list, or an element of one (`changes[0].mode`).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { jsFiles, SCRIPTS, toPosix } from "./check-layers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(join(ROOT, "package.json"))("typescript");

/** The one file that knows the numbers. */
const EXEMPT = new Set(["decide/changes.js"]);

/** An expression that names a list of effect changes (`effect.changes`, `(e.changes ?? [])`, `system.changes`). */
const CHANGES_LIST = /(^|\.|\b)changes\b[\s)?\]]*(\?\?\s*\[\s*\])?\)?$/;

const strip = node => {
  let n = node;
  while ( ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) ) n = n.expression;
  return n;
};

/** Is `name`, read at `at`, bound to one change of a list? */
function boundToChange(name, at) {
  if ( name === "change" ) return true;
  for ( let p = at.parent; p; p = p.parent ) {
    if ( ts.isFunctionLike(p) && p.parameters?.some(q => ts.isIdentifier(q.name) && (q.name.text === name)) ) {
      const call = p.parent;
      if ( call && ts.isCallExpression(call) && call.arguments.includes(p) && ts.isPropertyAccessExpression(call.expression) ) {
        return CHANGES_LIST.test(strip(call.expression.expression).getText());
      }
      return false;
    }
    if ( ts.isForOfStatement(p) && ts.isVariableDeclarationList(p.initializer)
      && p.initializer.declarations.some(d => ts.isIdentifier(d.name) && (d.name.text === name)) ) {
      return CHANGES_LIST.test(strip(p.expression).getText());
    }
  }
  return false;
}

/**
 * Every place a script's text reads or writes a change's numeric mode.
 * @param {string} text @param {string} rel   the scripts-relative path, for the report
 * @returns {string[]}
 */
export function readModes(text, rel = "script.js") {
  const out = [];
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const at = node => `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = node => {
    if ( ts.isIdentifier(node) && (node.text === "ACTIVE_EFFECT_MODES") ) {
      out.push(`${at(node)} reads CONST.ACTIVE_EFFECT_MODES — write the change typed (\`type: "add"\`, …)`);
    }
    if ( ts.isObjectLiteralExpression(node) ) {
      const names = new Set(node.properties.map(p => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null));
      if ( names.has("key") && names.has("value") && names.has("mode") ) {
        out.push(`${at(node)} writes a change with a numeric \`mode\` — write its \`type\` instead`);
      }
    }
    if ( ts.isPropertyAccessExpression(node) && (node.name.text === "mode") ) {
      const obj = strip(node.expression);
      const reads = (ts.isIdentifier(obj) && boundToChange(obj.text, node))
        || (ts.isElementAccessExpression(obj) && CHANGES_LIST.test(strip(obj.expression).getText()));
      if ( reads ) out.push(`${at(node)} reads a change's \`mode\` — read it through decide/changes.js \`changeType\``);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

if ( process.argv[1] && (fileURLToPath(import.meta.url) === process.argv[1]) ) {
  const failures = [];
  for ( const path of jsFiles(SCRIPTS) ) {
    const rel = toPosix(relative(SCRIPTS, path));
    if ( EXEMPT.has(rel) ) continue;
    failures.push(...readModes(readFileSync(path, "utf8"), rel));
  }
  if ( failures.length ) {
    console.error(`check-change-modes: ${failures.length} numeric mode use(s):\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log("check-change-modes: no script reads or writes a change's numeric mode.");
}
