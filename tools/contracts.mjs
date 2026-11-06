// THE CONTRACTS — what By the Books publishes to the rest of the family, as two files another repo
// tests against (ARCHITECTURE §7 *The moment events*, §11 *Adding a RECORD*; tools/README.md
// *The contracts*):
//
//   contracts/moment.json       the `bythebooks.*` hooks: every word, every `<event>|<kind>` pair's
//                               payload fields with a recorded sample, the companion hooks' arguments
//   contracts/card-flags.json   every key under the module's flag scope (decide/moments.js's records
//                               and state keys): its class, family, writers, documents, the stat
//                               stamp, who in the family reads it, and its recorded shape
//
//   node tools/contracts.mjs --check              the committed files against the code, offline (in
//                                                 `npm run verify`): the version, every word, record,
//                                                 state key and companion hook listed, every sample
//                                                 inside its schema
//   node tools/contracts.mjs --check --run [dir]  ...and against a run's recordings (default
//                                                 dist/contract-recordings): a field, pair, key or hook
//                                                 the run saw and the file does not name FAILS; a
//                                                 documented field the run never saw is REPORTED
//   node tools/contracts.mjs --write [dir]        the recordings unioned into the committed files
//                                                 (a schema only grows; a sample, once there, stays)
//   node tools/contracts.mjs --write --fresh      the files rebuilt from the run alone
//   --prefer <suffix>                             with --write: read a consumer's <repo>.<suffix>
//                                                 worktree before its clone, for `readBy`
//
// The schemas are derived by shape (tools/contract-shapes.mjs); the version and the prose are
// hand-written and kept across writes. ⚠ The version moves when a shape another repo reads changes:
// a renamed or removed field, a word or a key gone. A new field or key is additive and does not move
// it. The recording is a live run's (the battery records every suite, tools/contract-recorder.mjs).
// A name that changes run to run (a document id, a slot's index) is never a field: every recorded
// and committed schema is folded (`foldSchema`) before it is merged or compared, so a recording or a
// file written before the fold reads as one written after it.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strictArgs, usageOf } from "./args.mjs";
import { diffSchemas, fieldsOf, foldSchema, mergeSchemas, schemaOf } from "./contract-shapes.mjs";
import { RECORDING_DIR } from "./contract-recorder.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTRACTS = join(REPO, "contracts");
const MOMENT_FILE = join(CONTRACTS, "moment.json");
const FLAGS_FILE = join(CONTRACTS, "card-flags.json");
const MODULE_ID = "fvtt-mod-bythebooks";

/** The repos that may read a contract, looked for beside this one (their `contracts/consumes.json`). */
const CONSUMERS = ["fvtt-mod-fxstudio", "fvtt-mcp-sessionscribe"];

/* --- what the code says ------------------------------------------------------------------------ */

const { MOMENT_RECORDS, MOMENT_WORDS, STATE_KEYS } = await import("../scripts/decide/moments.js");

/** The moment contract's version, as events.js publishes it on `api.moments`. */
function codeVersion() {
  const src = readFileSync(join(REPO, "scripts", "events.js"), "utf8");
  const m = src.match(/MOMENT_CONTRACT\s*=\s*Object\.freeze\(\{\s*version:\s*(\d+)/);
  if (!m) throw new Error("scripts/events.js: no MOMENT_CONTRACT version found");
  return Number(m[1]);
}

/** Every scripts/ file. */
function scriptFiles(dir = join(REPO, "scripts")) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...scriptFiles(p));
    else if (name.name.endsWith(".js")) out.push(p);
  }
  return out;
}

/** The companion hooks: every `publish("<name>", …)` outside the moment publisher, as `bythebooks.<name>`. */
function companionHooks() {
  const out = new Set();
  for (const file of scriptFiles()) {
    // The moment publisher's own `publish("moment", …)` is the moment hook, listed by itself.
    if (file === join(REPO, "scripts", "events.js")) continue;
    for (const m of readFileSync(file, "utf8").matchAll(/\bpublish\(\s*["']([A-Za-z][\w-]*)["']/g)) out.add(`bythebooks.${m[1]}`);
  }
  return [...out].sort();
}

/** flag key → the scripts/ files that write it (tools/moment-writers.mjs's scan). */
async function writersByKey() {
  const { writes } = await import("./moment-writers.mjs");
  const out = {};
  for (const [key, sites] of writes) out[key] = [...new Set([...sites].map(s => s.replace(/:\d+$/, "")))].sort();
  return out;
}

/* --- the recordings ---------------------------------------------------------------------------- */

/**
 * The per-suite recordings in `dir` unioned: hooks, moment pairs and flag keys, each with its merged
 * schema, its count and the first sample in suite order.
 * @param {string} dir
 */
export function readRecordings(dir) {
  const files = existsSync(dir) ? readdirSync(dir).filter(n => n.endsWith(".json")).sort() : [];
  const run = { suites: [], hooks: {}, moments: {}, flags: {}, errors: 0 };
  for (const name of files) {
    const r = JSON.parse(readFileSync(join(dir, name), "utf8"));
    // Only a recorder's file (tools/contract-recorder.mjs): a hook ledger beside it has another shape.
    if ((typeof r?.hooks !== "object") || (typeof r?.flags !== "object")) continue;
    run.suites.push(r.tag ?? name.replace(/\.json$/, ""));
    run.errors += r.errors ?? 0;
    for (const [hook, h] of Object.entries(r.hooks ?? {})) {
      const into = run.hooks[hook] ?? (run.hooks[hook] = { count: 0, args: [], sample: null });
      into.count += h.count ?? 0;
      (h.args ?? []).forEach((a, i) => { into.args[i] = mergeSchemas(into.args[i] ?? null, foldSchema(a)); });
      into.sample ??= h.sample ?? null;
    }
    for (const [pair, m] of Object.entries(r.moments ?? {})) {
      const into = run.moments[pair] ?? (run.moments[pair] = { count: 0, schema: null, sample: null });
      into.count += m.count ?? 0;
      into.schema = mergeSchemas(into.schema, foldSchema(m.schema));
      into.sample ??= m.sample ?? null;
    }
    for (const [key, f] of Object.entries(r.flags ?? {})) {
      const into = run.flags[key] ?? (run.flags[key] = { count: 0, on: {}, schema: null });
      into.count += f.count ?? 0;
      for (const [doc, n] of Object.entries(f.on ?? {})) into.on[doc] = (into.on[doc] ?? 0) + n;
      into.schema = mergeSchemas(into.schema, foldSchema(f.schema));
    }
  }
  return run;
}

/* --- building the files ------------------------------------------------------------------------ */

const sortKeys = obj => Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]]));

/** Where a record's stat stamp sits: on the flag, per entry, or nowhere (ARCHITECTURE §4 *The data plane*). */
export function stampOf(schema) {
  const has = s => !!(s?.properties?.combat && s?.properties?.sourceUuid);
  if (has(schema)) return "flag";
  const t = schema?.properties?.targets?.items;
  if (has(t) || has(t?.properties?.effects?.items)) return "entry";
  return null;
}

/** A committed pair's whole payload schema: its envelope with its details put back, folded. */
const documentedOf = doc => foldSchema({ ...(doc.envelope ?? { type: "object" }), properties: { ...(doc.envelope?.properties ?? {}), details: doc.details ?? { type: "object" } } });

/** The payload's envelope: everything but `details`, whose shape is each pair's. */
function envelopeOf(schema) {
  if (!schema?.properties?.details) return schema ?? null;
  return { ...schema, properties: { ...schema.properties, details: { type: "object" } } };
}

const MOMENT_PROSE = {
  title: "By the Books: the moment events",
  description: "What By the Books publishes when a moment resolves (its ARCHITECTURE §7 *The moment events*). `bythebooks.moment` fires with a plain frozen payload, then `bythebooks.<event>` with the same payload; a resolve under two words fires once per word with the same momentId, so a consumer that plays one picture per word keys on momentId plus event. `payload` is the envelope every moment carries; `moments` is each `<event>|<kind>` pair a recorded run published, its fields and its details' schema, with one sample (ids and clocks masked); `events` lists each word's kinds and fields; `kinds` is every record decide/moments.js publishes, recorded or not yet; `hooks` names every bythebooks.* hook and the companions' arguments. The schemas are derived by shape from a live run (tools/contracts.mjs); `version` moves when a field or word another repo reads is renamed or removed."
};

const FLAGS_PROSE = {
  title: "By the Books: the flag keys",
  description: "Every key By the Books writes under flags[\"fvtt-mod-bythebooks\"] (and read under flags[\"fvtt-mod-battleflow\"] on a document written before the rename), as decide/moments.js classifies it: a `record` is a resolve the moment gate publishes (`family` its word or words), a `state` key carries the reason it is state. `writers` are the scripts/ files that write it, `on` the documents a recorded run saw it on, `stamp` where the stat stamp (`combat`, `sourceUuid`; ARCHITECTURE §4 *The data plane*) sits, `readBy` the family repos whose contracts/consumes.json name it, `fields` and `schema` its recorded shape. A chat card keeps its flags forever, so a reader must tolerate every shape a key ever had; `version` moves when a field another repo reads is renamed or removed."
};

/**
 * The moment contract: the committed file (when `fresh` is false) unioned with a run.
 * @param {any} committed
 * @param {ReturnType<typeof readRecordings>} run
 * @param {boolean} fresh
 */
export function buildMoment(committed, run, fresh = false) {
  const base = fresh ? {} : (committed ?? {});
  const moments = {};
  for (const pair of Object.keys({ ...(base.moments ?? {}), ...run.moments })) {
    const before = fresh ? null : (base.moments?.[pair] ?? null);
    const seen = run.moments[pair] ?? null;
    const merged = mergeSchemas(before ? documentedOf(before) : null, seen?.schema ?? null);
    moments[pair] = {
      fields: fieldsOf(merged),
      details: merged.properties?.details ?? { type: "object" },
      envelope: envelopeOf(merged),
      sample: before?.sample ?? seen?.sample ?? null
    };
  }
  const events = {};
  for (const word of MOMENT_WORDS) {
    const pairs = Object.keys(moments).filter(p => p.split("|")[0] === word).sort();
    events[word] = {
      kinds: pairs.map(p => p.split("|")[1]),
      recorded: pairs.length > 0,
      fields: [...new Set(pairs.flatMap(p => moments[p].fields))].sort()
    };
  }
  const kinds = {};
  for (const [kind, row] of Object.entries(MOMENT_RECORDS)) {
    const pairs = Object.keys(moments).filter(p => p.split("|")[1] === kind).sort();
    kinds[kind] = { events: [...row.events], means: row.means, recorded: pairs.length > 0, pairs };
  }
  let payload = null;
  for (const m of Object.values(moments)) payload = mergeSchemas(payload, m.envelope);
  const hooks = {
    "bythebooks.moment": { carries: "the payload", recorded: !!(run.hooks["bythebooks.moment"] || base.hooks?.["bythebooks.moment"]?.recorded) },
    "bythebooks.<event>": {
      carries: "the same payload, once per word, after bythebooks.moment",
      seen: [...new Set([...(base.hooks?.["bythebooks.<event>"]?.seen ?? []),
        ...Object.keys(run.hooks).filter(h => MOMENT_WORDS.includes(h.replace(/^bythebooks\./, "")))])].sort()
    }
  };
  for (const hook of companionHooks()) {
    const before = fresh ? null : (base.hooks?.[hook] ?? null);
    const seen = run.hooks[hook] ?? null;
    const n = Math.max(before?.args?.length ?? 0, seen?.args?.length ?? 0);
    const args = [];
    for (let i = 0; i < n; i++) args.push(mergeSchemas(foldSchema(before?.args?.[i]), seen?.args?.[i] ?? null));
    hooks[hook] = {
      recorded: !!(before?.recorded || seen),
      fields: args.map(a => fieldsOf(a)),
      args,
      sample: before?.sample ?? seen?.sample ?? null
    };
  }
  return {
    contract: "moment",
    module: MODULE_ID,
    version: base.version ?? committed?.version ?? codeVersion(),
    title: base.title ?? committed?.title ?? MOMENT_PROSE.title,
    description: base.description ?? committed?.description ?? MOMENT_PROSE.description,
    recorded: { suites: [...new Set([...(base.recorded?.suites ?? []), ...run.suites])].sort() },
    payload: payload ?? { type: "object" },
    events,
    kinds: sortKeys(kinds),
    hooks: sortKeys(hooks),
    moments: sortKeys(moments)
  };
}

/**
 * The flag-key contract: the committed file (when `fresh` is false) unioned with a run.
 * @param {any} committed
 * @param {ReturnType<typeof readRecordings>} run
 * @param {Record<string, string[]>} writers
 * @param {Record<string, string[]>|null} readBy  key → consumer repos, or null to keep the committed
 * @param {boolean} fresh
 */
export function buildFlags(committed, run, writers, readBy, fresh = false) {
  const base = fresh ? {} : (committed ?? {});
  const keys = {};
  const all = [...new Set([...Object.keys(MOMENT_RECORDS), ...Object.keys(STATE_KEYS)])].sort();
  for (const key of all) {
    const before = fresh ? null : (base.keys?.[key] ?? null);
    const seen = run.flags[key] ?? null;
    const schema = (before?.schema || seen?.schema) ? mergeSchemas(foldSchema(before?.schema), seen?.schema ?? null) : null;
    const record = MOMENT_RECORDS[key];
    keys[key] = {
      class: record ? "record" : "state",
      family: record ? record.events.join("+") : "state",
      means: record ? record.means : STATE_KEYS[key],
      writers: writers[key] ?? [],
      on: [...new Set([...(before?.on ?? []), ...Object.keys(seen?.on ?? {})])].sort(),
      stamp: schema ? stampOf(schema) : (before?.stamp ?? null),
      readBy: readBy ? (readBy[key] ?? []) : (before?.readBy ?? []),
      recorded: !!schema,
      fields: schema ? fieldsOf(schema) : [],
      ...(schema ? { schema } : {})
    };
  }
  return {
    contract: "card-flags",
    module: MODULE_ID,
    scope: MODULE_ID,
    legacyScope: "fvtt-mod-battleflow",
    version: base.version ?? committed?.version ?? 1,
    title: base.title ?? committed?.title ?? FLAGS_PROSE.title,
    description: base.description ?? committed?.description ?? FLAGS_PROSE.description,
    recorded: { suites: [...new Set([...(base.recorded?.suites ?? []), ...run.suites])].sort() },
    keys
  };
}

/**
 * The consumers beside this repo that name the card-flag keys: key → repo names, or null when no
 * consumer is cloned (the committed `readBy` then stands). A consumer's `<repo>.<prefer>` worktree is
 * read first when named, then its main clone, else any worktree of it (`<repo>.<name>`).
 * @param {string|null} [prefer]
 */
function readByFromConsumers(prefer = null) {
  const parent = dirname(REPO);
  const out = {};
  let found = 0;
  for (const repo of CONSUMERS) {
    const dirs = [...(prefer ? [`${repo}.${prefer}`] : []), repo, ...(existsSync(parent) ? readdirSync(parent).filter(n => n.startsWith(`${repo}.`)) : [])];
    const file = dirs.map(d => join(parent, d, "contracts", "consumes.json")).find(p => existsSync(p));
    if (!file) continue;
    found++;
    const consumes = JSON.parse(readFileSync(file, "utf8"));
    for (const c of consumes.consumes ?? []) {
      if ((c.emitter !== MODULE_ID) || (c.contract !== "card-flags")) continue;
      for (const key of Object.keys(c.keys ?? {})) (out[key] ??= []).push(repo);
    }
  }
  return found ? out : null;
}

/* --- the checks -------------------------------------------------------------------------------- */

/**
 * The committed files against the code, offline: problems that fail, and notes.
 * @param {any} moment
 * @param {any} flags
 */
export function checkOffline(moment, flags) {
  const fail = [];
  const note = [];
  if (!moment) fail.push("contracts/moment.json is missing — run node tools/contracts.mjs --write");
  if (!flags) fail.push("contracts/card-flags.json is missing — run node tools/contracts.mjs --write");
  if (!moment || !flags) return { fail, note };
  const version = codeVersion();
  if (moment.version !== version) fail.push(`moment.json is version ${moment.version}; scripts/events.js publishes version ${version}`);
  if (!Number.isInteger(flags.version)) fail.push("card-flags.json has no integer version");
  const same = (label, have, want) => {
    for (const x of want.filter(w => !have.includes(w))) fail.push(`${label}: "${x}" is in the code and not in the contract — run node tools/contracts.mjs --write, then a recording run for its shape`);
    for (const x of have.filter(h => !want.includes(h))) fail.push(`${label}: "${x}" is in the contract and no longer in the code — a contract change: remove it with --write --fresh and move the version`);
  };
  same("moment.json events", Object.keys(moment.events ?? {}), [...MOMENT_WORDS]);
  same("moment.json kinds", Object.keys(moment.kinds ?? {}), Object.keys(MOMENT_RECORDS));
  same("moment.json hooks", Object.keys(moment.hooks ?? {}).filter(h => !["bythebooks.moment", "bythebooks.<event>"].includes(h)), companionHooks());
  same("card-flags.json keys", Object.keys(flags.keys ?? {}), [...new Set([...Object.keys(MOMENT_RECORDS), ...Object.keys(STATE_KEYS)])]);
  for (const [key, k] of Object.entries(flags.keys ?? {})) {
    const want = MOMENT_RECORDS[key] ? "record" : (STATE_KEYS[key] ? "state" : null);
    if (want && (k.class !== want)) fail.push(`card-flags.json ${key}: class ${k.class}, decide/moments.js says ${want}`);
    if (k.schema && (JSON.stringify(k.fields) !== JSON.stringify(fieldsOf(k.schema)))) fail.push(`card-flags.json ${key}: fields do not match its schema — the file was edited by hand; rewrite it with --write`);
  }
  for (const [pair, m] of Object.entries(moment.moments ?? {})) {
    const [word, kind] = pair.split("|");
    if (!MOMENT_WORDS.includes(word)) fail.push(`moment.json ${pair}: "${word}" is not a word`);
    if (!MOMENT_RECORDS[kind]) fail.push(`moment.json ${pair}: "${kind}" is not a record`);
    if (m.sample) {
      const outside = diffSchemas(documentedOf(m), schemaOf(m.sample)).added
        .filter(p => !p.includes("<id>"));
      if (outside.length) fail.push(`moment.json ${pair}: the sample carries ${outside.join(", ")}, which its schema does not name`);
    }
  }
  const unrecorded = Object.entries(moment.kinds ?? {}).filter(([, k]) => !k.recorded).map(([k]) => k);
  if (unrecorded.length) note.push(`${unrecorded.length} record(s) no recorded run has published yet: ${unrecorded.join(", ")}`);
  const quietKeys = Object.entries(flags.keys ?? {}).filter(([, k]) => !k.recorded).length;
  if (quietKeys) note.push(`${quietKeys} of ${Object.keys(flags.keys ?? {}).length} flag key(s) have no recorded shape (written on a path no recorded suite reached, or on a document the recorder does not hear)`);
  return { fail, note };
}

/**
 * The committed files against a run: what the run saw that the files do not name fails; what the
 * files name that the run never saw is reported.
 * @param {any} moment
 * @param {any} flags
 * @param {ReturnType<typeof readRecordings>} run
 */
export function checkRun(moment, flags, run) {
  const fail = [];
  const note = [];
  for (const [pair, m] of Object.entries(run.moments)) {
    const doc = moment?.moments?.[pair];
    if (!doc) { fail.push(`NEW moment pair ${pair} (${m.count} published) — not in moment.json`); continue; }
    const d = diffSchemas(documentedOf(doc), m.schema);
    for (const p of d.added) fail.push(`NEW field ${pair} ${p}`);
    for (const w of d.widened) note.push(`${pair} ${w} (a type the contract does not list)`);
  }
  for (const [hook, h] of Object.entries(run.hooks)) {
    if (hook === "bythebooks.moment" || MOMENT_WORDS.includes(hook.replace(/^bythebooks\./, ""))) continue;
    const doc = moment?.hooks?.[hook];
    if (!doc) { fail.push(`NEW hook ${hook} (${h.count} fired) — not in moment.json`); continue; }
    h.args.forEach((a, i) => { for (const p of diffSchemas(foldSchema(doc.args?.[i]), a).added) fail.push(`NEW field ${hook} argument ${i} ${p}`); });
  }
  for (const [key, f] of Object.entries(run.flags)) {
    const doc = flags?.keys?.[key];
    // A key the module does not write (decide/moments.js classifies every one it does): a tool's
    // stamp or a table's lever under the scope, such as the harness's noCover and fixtureHome.
    if (!doc && !MOMENT_RECORDS[key] && !STATE_KEYS[key]) { note.push(`${key} seen on ${Object.keys(f.on).join(", ")}: not a key the module writes (a tool's or a table's flag), not in the contract`); continue; }
    if (!doc) { fail.push(`NEW flag key ${key} (seen ${f.count} time(s) on ${Object.keys(f.on).join(", ")}) — not in card-flags.json`); continue; }
    if (!doc.recorded) { fail.push(`NEW shape for ${key}: the contract has none — run node tools/contracts.mjs --write`); continue; }
    const d = diffSchemas(foldSchema(doc.schema), f.schema);
    for (const p of d.added) fail.push(`NEW field ${key} ${p}`);
    for (const w of d.widened) note.push(`${key} ${w} (a type the contract does not list)`);
  }
  let missing = 0;
  for (const [pair, doc] of Object.entries(moment?.moments ?? {})) {
    const seen = run.moments[pair];
    if (!seen) { missing++; continue; }
    const d = diffSchemas(documentedOf(doc), seen.schema);
    if (d.missing.length) note.push(`${pair}: documented, not seen this run: ${d.missing.join(", ")}`);
  }
  if (missing) note.push(`${missing} documented moment pair(s) not published this run`);
  return { fail, note };
}

/* --- the command ------------------------------------------------------------------------------- */

const readJson = p => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const write = (p, obj) => writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);

async function main() {
  const { values, positionals } = strictArgs({
    usage: usageOf(fileURLToPath(import.meta.url)),
    options: { check: { type: "boolean" }, write: { type: "boolean" }, run: { type: "boolean" }, fresh: { type: "boolean" }, prefer: { type: "string" } },
    allowPositionals: true
  });
  const dir = positionals[0] ? resolve(process.cwd(), positionals[0]) : RECORDING_DIR;
  const shown = relative(REPO, dir) || dir;
  if (values.write === values.check) {
    console.error("say --check or --write");
    process.exit(2);
  }
  if (values.write) {
    const run = readRecordings(dir);
    // With no recordings the files still list what the code says (every word, record, key and hook),
    // with no shape: a new key is listed offline, and a recording run gives it its shape.
    if (!run.suites.length) console.log(`no recordings in ${shown}: the files list the code, shapes kept from the committed files`);
    const moment = buildMoment(readJson(MOMENT_FILE), run, !!values.fresh);
    const flags = buildFlags(readJson(FLAGS_FILE), run, await writersByKey(), readByFromConsumers(values.prefer ?? null), !!values.fresh);
    write(MOMENT_FILE, moment);
    write(FLAGS_FILE, flags);
    const recordedKinds = Object.values(moment.kinds).filter(k => k.recorded).length;
    const recordedKeys = Object.values(flags.keys).filter(k => k.recorded).length;
    console.log(`WROTE contracts/moment.json: ${Object.keys(moment.moments).length} pair(s), ${recordedKinds}/${Object.keys(moment.kinds).length} records published, ${Object.values(moment.hooks).filter(h => h.recorded).length} hook(s) recorded`);
    console.log(`WROTE contracts/card-flags.json: ${recordedKeys}/${Object.keys(flags.keys).length} keys with a recorded shape, from ${run.suites.length} suite recording(s)${run.errors ? `; ⚠ ${run.errors} value(s) the recorder could not read` : ""}`);
    return 0;
  }
  const moment = readJson(MOMENT_FILE);
  const flags = readJson(FLAGS_FILE);
  const offline = checkOffline(moment, flags);
  let fail = [...offline.fail];
  const note = [...offline.note];
  if (values.run) {
    const run = readRecordings(dir);
    if (!run.suites.length) note.push(`no recordings in ${shown}: nothing to check against a run`);
    else {
      const r = checkRun(moment, flags, run);
      fail = [...fail, ...r.fail];
      note.push(...r.note);
      note.push(`read ${run.suites.length} suite recording(s) from ${shown}`);
    }
  }
  console.log(`CONTRACT moment v${moment?.version ?? "?"} · card-flags v${flags?.version ?? "?"}`);
  for (const f of fail) console.log(`FAIL ${f}`);
  for (const n of note) console.log(`  ${n}`);
  console.log(`REPORT ${fail.length ? `${fail.length} problem(s)` : "clean"}`);
  return fail.length ? 1 : 0;
}

if (process.argv[1] && (fileURLToPath(import.meta.url) === process.argv[1])) process.exit(await main());
