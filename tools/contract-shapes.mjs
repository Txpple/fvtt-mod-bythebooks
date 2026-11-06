// @ts-check
// THE CONTRACTS' SHAPES — a JSON Schema derived from recorded values by shape, the one algorithm the
// page recorder (tools/contract-recorder.mjs) and the contract tool (tools/contracts.mjs) share
// (ARCHITECTURE §11 *Adding a RECORD*; tools/README.md *The contracts*).
//
//   schemaOf(value, key)      one value's schema: its type, an object's properties and the keys it
//                             carries (`required`), an array's items, a document named not walked
//   mergeSchemas(a, b)        the union of two schemas: types joined, properties joined, a key
//                             required only where every object carried it
//   sampleOf(value, key)      a value reduced for a contract file: ids and clocks to placeholders,
//                             documents to their name
//   fieldsOf(schema)          every field path a schema names (`targets[].hit`, `parts.<id>`)
//   diffSchemas(doc, seen)    what a run saw that a contract does not name, and what it never saw
//   foldSchema(schema)        a schema with its names that change run to run folded, every level
//
// A NAME THAT CHANGES RUN TO RUN is never a field. A property name carrying a document id (a map
// keyed by ids, a ledger step `ally-<id>`, a uuid as a key `Actor|<id>`) or a numbered slot's index
// (`burst-0`) folds into one `patternProperties` entry, read back by its label (`idLabelOf`): `<id>`,
// `ally-<id>`, `Actor|<id>`, `burst-<n>`. An id is 16 letters and digits; one with no digit is told
// from a 16-letter name (`compendiumSource`) by its shape, and a name-shaped one folds anyway beside
// ids that are not (`foldIdKeys`). `foldSchema` folds a schema recorded before the rule.
//
// ⚠ Every function here is SELF-CONTAINED: it names no module-scope binding but the other functions
// in `PAGE_FUNCTIONS`, because the recorder ships them to the page as source text (`PAGE_SOURCE`)
// and `evaluate` carries no closure. A constant a function needs is declared inside it.
// Offline, no Foundry; tests/contract-shapes.test.js.

/**
 * @typedef {object} Schema
 * @property {string|string[]} [type]
 * @property {string|string[]} [x-document]   a Foundry document stands here, named, never walked
 * @property {string|string[]} [x-class]      an instance of a class that is not a plain object
 * @property {Record<string, Schema>} [properties]
 * @property {Record<string, Schema>} [patternProperties]
 * @property {string[]} [required]
 * @property {Schema} [items]
 * @property {string[]} [examples]            the observed values of a field that names a choice
 * @property {boolean} [x-truncated]          deeper than the reader walks
 */

/**
 * A property name's label when the name changes run to run, or null for a plain name: each document
 * id in it as `<id>`, and with `indices` a numbered slot's trailing index as `<n>`. An id is a run of
 * 16 letters and digits standing alone in the name: one with a digit is an id, and one with none is an
 * id unless it is shaped like a camelCase or PascalCase name (`compendiumSource`, `awaitingTemplate`).
 * `ANSpcJYzznsSwGZM` → `<id>`, `ally-0SSengnfp7NfltfN` → `ally-<id>`, `Actor|YeegJ3yS1vLryJ4C` →
 * `Actor|<id>`, `burst-1` → `burst-<n>`; `bar1`, `dnd5e` and `d20` are names.
 * @param {string} key
 * @param {boolean} [indices]   fold a slot's index too (a sample keeps it: an index is the same every run)
 * @returns {string|null}
 */
export function idLabelOf(key, indices = true) {
  const ID = /(?<![A-Za-z0-9])[A-Za-z0-9]{16}(?![A-Za-z0-9])/g;
  const NAME = /^[A-Za-z][a-z]+(?:[A-Z][a-z]+)*$/;
  const INDEX = /(?<=[A-Za-z]-)[0-9]+$/;
  if ( typeof key !== "string" ) return null;
  let label = key.replace(ID, run => (/[0-9]/.test(run) || !NAME.test(run)) ? "<id>" : run);
  if ( indices ) label = label.replace(INDEX, "<n>");
  return (label === key) ? null : label;
}

/**
 * The `patternProperties` key a label stands for: `<id>` → `^[A-Za-z0-9]{16}$`, `ally-<id>` →
 * `^ally-[A-Za-z0-9]{16}$`, `burst-<n>` → `^burst-[0-9]+$`; the rest of the name is matched as written.
 * @param {string} label
 * @returns {string}
 */
export function patternOfLabel(label) {
  const parts = label.split(/(<id>|<n>)/).map(part => (part === "<id>") ? "[A-Za-z0-9]{16}"
    : (part === "<n>") ? "[0-9]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return `^${parts.join("")}$`;
}

/**
 * One object schema with its names that change run to run folded: a property whose name has a label
 * (`idLabelOf`) moves into that label's `patternProperties` entry, then any other property a pattern
 * there matches follows it (a name-shaped id beside ids that are not). A folded name is never
 * `required`. The children are taken as they are; the schema itself comes back when nothing folds.
 * @param {Schema} s
 * @returns {Schema}
 */
export function foldIdKeys(s) {
  if ( !s?.properties ) return s;
  /** @type {Record<string, Schema>} */
  const patterns = { ...(s.patternProperties ?? {}) };
  /** @type {Record<string, Schema>} */
  const named = {};
  for ( const [k, v] of Object.entries(s.properties) ) {
    const label = idLabelOf(k);
    if ( !label ) {
      named[k] = v;
      continue;
    }
    const p = patternOfLabel(label);
    patterns[p] = mergeSchemas(patterns[p] ?? null, v);
  }
  /** @type {Record<string, Schema>} */
  const kept = {};
  for ( const [k, v] of Object.entries(named) ) {
    const p = Object.keys(patterns).find(re => new RegExp(re).test(k));
    if ( p ) patterns[p] = mergeSchemas(patterns[p] ?? null, v);
    else kept[k] = v;
  }
  if ( Object.keys(kept).length === Object.keys(s.properties).length ) return s;
  /** @type {Schema} */
  const out = { ...s };
  if ( Object.keys(kept).length ) out.properties = kept;
  else delete out.properties;
  out.patternProperties = Object.fromEntries(Object.entries(patterns).sort(([x], [y]) => (x < y) ? -1 : 1));
  const required = (s.required ?? []).filter(k => k in kept);
  if ( required.length ) out.required = required;
  else delete out.required;
  return out;
}

/**
 * The schema of one value. `key` is the property it sits under (a choice-naming key such as
 * `answer` or `outcome` keeps its short values as `examples`). A document is named
 * (`x-document`), never walked; a name that changes run to run folds into one `patternProperties`
 * entry (`foldIdKeys`), so a map keyed by ids is one shape however many ids a run saw.
 * @param {any} value
 * @param {string|null} [key]
 * @param {number} [depth]
 * @param {WeakSet<object>|null} [seen]
 * @returns {Schema}
 */
export function schemaOf(value, key = null, depth = 0, seen = null) {
  const CHOICE_KEYS = ["answer", "outcome", "status", "mode", "verdict", "trigger", "event", "how", "testKind", "companion", "kind"];
  const MAX_DEPTH = 12;
  if ( value === null ) return { type: "null" };
  const t = typeof value;
  if ( t === "string" ) {
    const s = /** @type {Schema} */ ({ type: "string" });
    if ( key && CHOICE_KEYS.includes(key) && (value.length <= 32) ) s.examples = [value];
    return s;
  }
  if ( (t === "number") || (t === "bigint") ) return { type: "number" };
  if ( t === "boolean" ) return { type: "boolean" };
  if ( (t === "undefined") || (t === "function") || (t === "symbol") ) return {};
  if ( depth >= MAX_DEPTH ) return { "x-truncated": true };
  const walked = seen ?? new WeakSet();
  if ( walked.has(value) ) return { "x-truncated": true };
  if ( typeof value.documentName === "string" ) return { type: "object", "x-document": value.documentName };
  walked.add(value);
  try {
    if ( Array.isArray(value) ) {
      /** @type {Schema} */
      const s = { type: "array" };
      for ( const v of value ) s.items = mergeSchemas(s.items ?? null, schemaOf(v, key, depth + 1, walked));
      return s;
    }
    const proto = Object.getPrototypeOf(value);
    if ( proto && (proto !== Object.prototype) && (Object.getPrototypeOf(proto) !== null) ) {
      const name = value?.constructor?.name;
      if ( name && (name !== "Object") ) return { type: "object", "x-class": name };
    }
    /** @type {Schema} */
    const s = { type: "object" };
    const required = [];
    for ( const [k, v] of Object.entries(value) ) {
      if ( v === undefined ) continue;
      s.properties = s.properties ?? {};
      s.properties[k] = schemaOf(v, k, depth + 1, walked);
      required.push(k);
    }
    if ( required.length ) s.required = required.sort();
    return foldIdKeys(s);
  } finally {
    walked.delete(value);
  }
}

/**
 * The union of two schemas (either may be null). Types join; properties join, each merged where
 * both name it; a key stays `required` only when every object either side saw carried it (a side
 * that saw no object leaves the other's list alone); `examples` join, capped. The union is folded
 * (`foldIdKeys`): a name-shaped id one side saw joins the ids the other side folded.
 * @param {Schema|null} a
 * @param {Schema|null} b
 * @returns {Schema}
 */
export function mergeSchemas(a, b) {
  const MAX_EXAMPLES = 12;
  if ( !a ) return b ? { ...b } : {};
  if ( !b ) return { ...a };
  /** @param {any} v @returns {string[]} */
  const list = v => (v === undefined) ? [] : (Array.isArray(v) ? v : [v]);
  /** @param {string[]} v @returns {string|string[]|undefined} */
  const one = v => (v.length === 0) ? undefined : (v.length === 1) ? v[0] : v;
  const types = [...new Set([...list(a.type), ...list(b.type)])].sort();
  const aObj = list(a.type).includes("object");
  const bObj = list(b.type).includes("object");
  /** @type {Schema} */
  const out = {};
  const type = one(types);
  if ( type !== undefined ) out.type = type;
  for ( const tag of /** @type {const} */ (["x-document", "x-class"]) ) {
    const v = one([...new Set([...list(a[tag]), ...list(b[tag])])].sort());
    if ( v !== undefined ) out[tag] = v;
  }
  for ( const group of /** @type {const} */ (["properties", "patternProperties"]) ) {
    const pa = a[group] ?? {};
    const pb = b[group] ?? {};
    const keys = [...new Set([...Object.keys(pa), ...Object.keys(pb)])].sort();
    if ( !keys.length ) continue;
    /** @type {Record<string, Schema>} */
    const merged = {};
    for ( const k of keys ) merged[k] = mergeSchemas(pa[k] ?? null, pb[k] ?? null);
    out[group] = merged;
  }
  const ra = a.required ?? [];
  const rb = b.required ?? [];
  const required = (aObj && bObj) ? ra.filter(k => rb.includes(k)) : (aObj ? ra : rb);
  if ( required.length ) out.required = [...required].sort();
  if ( a.items || b.items ) out.items = mergeSchemas(a.items ?? null, b.items ?? null);
  const examples = [...new Set([...(a.examples ?? []), ...(b.examples ?? [])])].sort();
  if ( examples.length ) out.examples = examples.slice(0, MAX_EXAMPLES);
  if ( a["x-truncated"] || b["x-truncated"] ) out["x-truncated"] = true;
  return foldIdKeys(out);
}

/**
 * A value reduced for a contract file's sample: a document id inside an id-naming field becomes
 * `<id>`, and so does one in a property name (`idLabelOf`, a slot's index kept), a clock reading
 * (`at`, `…At`, `deadline`) becomes 0, a document becomes its name and a class instance its class,
 * and deep or long values are cut. The shape is the value's; only what changes run to run is masked.
 * @param {any} value
 * @param {string|null} [key]
 * @param {number} [depth]
 * @returns {any}
 */
export function sampleOf(value, key = null, depth = 0) {
  const ID = /(?<![A-Za-z0-9])[A-Za-z0-9]{16}(?![A-Za-z0-9])/g;
  const ID_FIELD = /(uuid|Uuid|Id|Ids)$|^(id|_id|marker|subject|messageId|momentId|attackId|regionId|tokenId|cardId)$/;
  const CLOCK_FIELD = /^(at|deadline|timestamp)$|At$/;
  const MAX_DEPTH = 8;
  const MAX_ITEMS = 6;
  if ( value === null || value === undefined ) return value ?? null;
  if ( typeof value === "string" ) return (key && ID_FIELD.test(key)) ? value.replace(ID, "<id>") : value;
  if ( typeof value === "number" ) return (key && CLOCK_FIELD.test(key)) ? 0 : value;
  if ( typeof value !== "object" ) return (typeof value === "boolean") ? value : null;
  if ( typeof value.documentName === "string" ) return { $document: value.documentName };
  if ( depth >= MAX_DEPTH ) return "…";
  const proto = Object.getPrototypeOf(value);
  if ( !Array.isArray(value) && proto && (proto !== Object.prototype) && (Object.getPrototypeOf(proto) !== null) ) {
    const name = value?.constructor?.name;
    if ( name && (name !== "Object") ) return { $class: name };
  }
  if ( Array.isArray(value) ) {
    const out = value.slice(0, MAX_ITEMS).map(v => sampleOf(v, key, depth + 1));
    if ( value.length > MAX_ITEMS ) out.push(`… ${value.length - MAX_ITEMS} more`);
    return out;
  }
  /** @type {Record<string, any>} */
  const out = {};
  for ( const [k, v] of Object.entries(value) ) {
    if ( v === undefined ) continue;
    out[idLabelOf(k, false) ?? k] = sampleOf(v, k, depth + 1);
  }
  return out;
}

/**
 * The label a `patternProperties` key reads back as (`patternOfLabel`'s inverse): `^ally-[A-Za-z0-9]{16}$`
 * → `ally-<id>`. Offline only.
 * @param {string} pattern
 * @returns {string}
 */
export function labelOfPattern(pattern) {
  return pattern.replace(/^\^/, "").replace(/\$$/, "")
    .replaceAll("[A-Za-z0-9]{16}", "<id>").replaceAll("[0-9]+", "<n>")
    .replace(/\\(.)/g, "$1");
}

/**
 * A schema folded at every level, children first (`foldIdKeys`): for a schema recorded before names
 * that change run to run were folded, and a committed file's. Offline only.
 * @param {Schema|null|undefined} schema
 * @returns {Schema|null}
 */
export function foldSchema(schema) {
  if ( !schema || (typeof schema !== "object") ) return schema ?? null;
  /** @type {Schema} */
  const out = { ...schema };
  for ( const group of /** @type {const} */ (["properties", "patternProperties"]) ) {
    const children = schema[group];
    if ( children ) out[group] = Object.fromEntries(Object.entries(children).map(([k, v]) => [k, /** @type {Schema} */ (foldSchema(v))]));
  }
  if ( schema.items ) out.items = /** @type {Schema} */ (foldSchema(schema.items));
  return foldIdKeys(out);
}

/**
 * Every field path a schema names, sorted: `a.b` for a property, `a[]` for an array's items, and a
 * name that changes run to run by its label: `a.<id>` for a map keyed by document ids, `a.ally-<id>`,
 * `a.burst-<n>`. The root itself is not a path.
 * @param {Schema|null|undefined} schema
 * @param {string} [prefix]
 * @returns {string[]}
 */
export function fieldsOf(schema, prefix = "") {
  /** @type {Set<string>} */
  const out = new Set();
  /** @param {Schema|null|undefined} s @param {string} at */
  const walk = (s, at) => {
    if ( !s ) return;
    for ( const [k, v] of Object.entries(s.properties ?? {}) ) {
      const p = at ? `${at}.${k}` : k;
      out.add(p);
      walk(v, p);
    }
    for ( const [pattern, v] of Object.entries(s.patternProperties ?? {}) ) {
      const label = labelOfPattern(pattern);
      const p = at ? `${at}.${label}` : label;
      out.add(p);
      walk(v, p);
    }
    if ( s.items ) {
      const p = `${at}[]`;
      if ( at ) out.add(p);
      walk(s.items, p);
    }
  };
  walk(schema, prefix);
  return [...out].sort();
}

/**
 * What `seen` (a run's schema) holds that `documented` (a contract's) does not, and the reverse.
 * `added` are field paths the contract does not name (a new field: a contract change); `missing`
 * are documented paths the run never saw (reported, never a failure: a run need not reach every
 * branch); `widened` are paths the run saw with a type the contract does not list.
 * @param {Schema|null|undefined} documented
 * @param {Schema|null|undefined} seen
 * @returns {{ added: string[], missing: string[], widened: string[] }}
 */
export function diffSchemas(documented, seen) {
  const doc = new Set(fieldsOf(documented));
  const run = new Set(fieldsOf(seen));
  /** @param {any} v @returns {string[]} */
  const list = v => (v === undefined) ? [] : (Array.isArray(v) ? v : [v]);
  /** @param {Schema|null|undefined} s @param {string} path @returns {Schema|null} */
  const at = (s, path) => {
    let node = s ?? null;
    for ( const part of path.match(/[^.[\]]+|\[\]/g) ?? [] ) {
      if ( !node ) return null;
      if ( part === "[]" ) node = node.items ?? null;
      else node = node.properties?.[part]
        ?? Object.entries(node.patternProperties ?? {}).find(([pattern]) => labelOfPattern(pattern) === part)?.[1]
        ?? null;
    }
    return node;
  };
  const widened = [];
  for ( const p of ["", ...run] ) {
    if ( p && !doc.has(p) ) continue;
    const want = list(at(documented, p)?.type);
    const got = list(at(seen, p)?.type);
    const extra = got.filter(t => !want.includes(t));
    if ( want.length && extra.length ) widened.push(`${p || "(root)"}: ${extra.join(", ")}`);
  }
  return {
    added: [...run].filter(p => !doc.has(p)).sort(),
    missing: [...doc].filter(p => !run.has(p)).sort(),
    widened
  };
}

/** The functions the page recorder needs, shipped as source. */
export const PAGE_FUNCTIONS = [idLabelOf, patternOfLabel, foldIdKeys, schemaOf, mergeSchemas, sampleOf];

/** The page bundle: evaluate it inside a function and it returns `{ schemaOf, mergeSchemas, sampleOf }`. */
export const PAGE_SOURCE = `${PAGE_FUNCTIONS.map(fn => fn.toString()).join("\n")}\nreturn { schemaOf, mergeSchemas, sampleOf };`;
