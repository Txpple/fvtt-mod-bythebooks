// THE RELEASE ZIP — the tag's checks, the gate, then the archive, then the archive read back (NOTES §5
// *Release*).
//
//   node tools/build-release.mjs                 build dist/fvtt-mod-bythebooks.zip from the tree
//   node tools/build-release.mjs --tag v2.6.0    and refuse unless the annotated tag v2.6.0 is
//                                                module.json's version and its body names its battery
//
// CI runs it on a pushed tag (.github/workflows/release.yml) and publishes what it builds; run by
// hand it is the dry run. There is no skip flag for the gate: a zip from a tree that fails
// `npm run verify` is not a release.
//
// With --tag, the tag's body carries exactly one battery line (tools/battery-line.mjs): the run's
// line `battery-status.mjs --line` prints, GREEN, or `Battery: none (pre-release)`. When the named
// run is under dist/battery/ here, the run's own reading must agree with the line; CI has no
// dist/battery/, so there the form alone is checked. Under GitHub Actions the builder writes
// `prerelease=true|false` to GITHUB_OUTPUT for the publish step. The tag's checks run before the
// gate: they take a second, and a refused tag builds nothing.
//
// The zip is written here, not by a shell tool: `Compress-Archive` writes backslash separators
// (the module installs as an empty shell) and the execution policy can refuse a PowerShell script.
// Entries are stored with forward slashes and a fixed timestamp, so the same commit gives the same
// bytes here and on CI.
//
// The read-back proves what ships loads: no backslash entry, nothing missing, every relative
// import inside a packed script resolving to another entry, and every entry inflating to the
// tree's own bytes.
import { execFileSync, execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { BATTERY_DIR, bumpOf, checkTagBody, describeScope, parseLine, readRun, readScope, RUN_ID, scopeProblem } from "./battery-line.mjs";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(REPO, "dist", "fvtt-mod-bythebooks.zip");
const ENTRY = "scripts/bythebooks.js";

const fail = msg => {
  console.error(`build-release: ${msg}`);
  process.exit(1);
};

const tagAt = process.argv.indexOf("--tag");
const tag = tagAt > 0 ? process.argv[tagAt + 1] : null;
if (tagAt > 0 && !tag) fail("--tag needs a value, e.g. --tag v2.6.0");

const manifest = JSON.parse(readFileSync(join(REPO, "module.json"), "utf8"));
const version = manifest.version;
if (tag && tag !== `v${version}`) fail(`the tag is ${tag} but module.json says ${version} - run tools/bump-version.mjs`);
if (!manifest.download.includes(`/v${version}/`)) fail(`module.json's download URL does not name v${version}`);

/** One git query's output; null when git refuses it (no such tag). */
function git(args) {
  try {
    return execFileSync("git", args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return null;
  }
}

if (tag) {
  // A lightweight tag's contents are its commit's message, so the body is read only off an annotated tag.
  const type = git(["cat-file", "-t", tag])?.trim();
  if (!type) fail(`there is no tag ${tag} in this clone. The battery line is read from the annotated tag's body: write the tag first (tools/README.md, the release chain), or build without --tag for the dry run of the zip alone`);
  if (type !== "tag") fail(`${tag} is a lightweight tag; a release tag is annotated (its body is the notes and carries the battery line)`);
  const body = git(["tag", "-l", "--format=%(contents:body)", tag]) ?? "";
  const runOf = id => {
    const dir = join(BATTERY_DIR, id);
    return (RUN_ID.test(id) && existsSync(dir)) ? readRun(dir) : null;
  };
  const verdict = checkTagBody(body, { runOf });
  if (!verdict.ok) fail(`${tag} cannot be released: ${verdict.error}`);
  console.log(`build-release: ${verdict.line}\nbuild-release: ${verdict.note}`);
  // THE SCOPE RULE (battery-line.mjs `scopeProblem`): the proving run(s) on this machine, read for how their
  // rows were chosen — a patch cites a `--for` run sized to its commits or the full battery, a minor the full
  // battery. CI has no runs, so there the form alone stands, as above. The previous release is the newest
  // v* tag below this version in the clone.
  if (!verdict.prerelease) {
    const semver = v => v.replace(/^v/, "").split(".").map(Number);
    /** Semantic order: negative when `p` is the lower version. */
    const compare = (p, q) => { const [a, b, c] = semver(p); const [x, y, z] = semver(q); return (a - x) || (b - y) || (c - z); };
    const below = (git(["tag", "-l", "v*"]) ?? "").split(/\r?\n/).map(t => t.trim())
      .filter(t => /^v\d+\.\d+\.\d+$/.test(t) && (compare(t, version) < 0)).sort(compare);
    const previous = below.at(-1) ?? null;
    const bump = bumpOf(version, previous);
    const read = parseLine(verdict.line);
    const ids = ("run" in read) ? [read.run.id] : ("pair" in read) ? [read.pair.a.id, read.pair.b.id] : [];
    const runs = ids.map(id => ({ id, here: existsSync(join(BATTERY_DIR, id)), scope: existsSync(join(BATTERY_DIR, id)) ? readScope(join(BATTERY_DIR, id)) : null }));
    console.log(`build-release: ${previous ? `${previous} -> ${tag}, a ${bump}` : `${tag}, the first release`}`);
    for (const r of runs) console.log(`build-release: run ${r.id}: ${!r.here ? "not on this machine" : r.scope ? describeScope(r.scope) : "no scope recorded (a run from before scope.json)"}`);
    const problem = scopeProblem(bump, runs.filter(r => r.here));
    if (problem) fail(`${tag} cannot be released as a ${bump}: ${problem}`);
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `prerelease=${verdict.prerelease}\n`);
}

console.log("build-release: running the gate (npm run verify)...");
try {
  execSync("npm run verify", { cwd: REPO, stdio: "inherit" });
} catch {
  fail("npm run verify failed - refusing to build a release from this tree");
}

/** Every .js file under scripts/, recursively, as a forward-slash path from the repo root. */
function scriptFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...scriptFiles(full));
    else if (name.endsWith(".js")) out.push(relative(REPO, full).split("\\").join("/"));
  }
  return out;
}

const names = [...scriptFiles(join(REPO, "scripts")), "module.json", "LICENSE", "README.md"];
if (!names.includes(ENTRY)) fail(`${ENTRY} (the esmodules entry) is missing`);

// 1980-01-01 00:00, the earliest DOS time.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** A zip archive of `files` (name -> bytes), every entry deflated. */
function writeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

/** Read a zip back through its central directory: name -> inflated bytes, CRC checked. */
function readZip(buf) {
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) fail("the archive has no end-of-central-directory record");
  const count = buf.readUInt16LE(endAt + 10);
  let at = buf.readUInt32LE(endAt + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) fail(`central directory entry ${i} is malformed`);
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    const dataAt = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
    const raw = buf.subarray(dataAt, dataAt + size);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    if (crc32(data) !== crc) fail(`${name}: CRC mismatch`);
    out.set(name, data);
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const files = new Map(names.map(n => [n, readFileSync(join(REPO, n))]));
// The repo is LF (.gitattributes); a CRLF file is a checkout that drifted, and would ship other bytes than CI's.
const crlf = [...files].filter(([, data]) => data.includes("\r\n")).map(([n]) => n);
if (crlf.length) fail(`CRLF line endings in ${crlf.join(", ")} - re-check them out (rm the file, git checkout -- it)`);
const zip = writeZip(files);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, zip);

const back = readZip(readFileSync(OUT));
const problems = [];
for (const name of back.keys()) if (name.includes("\\")) problems.push(`backslash separator: ${name}`);
for (const name of names) {
  if (!back.has(name)) problems.push(`missing from the archive: ${name}`);
  else if (!back.get(name).equals(files.get(name))) problems.push(`differs from the tree: ${name}`);
}
if (back.size !== names.length) problems.push(`${back.size} entries, expected ${names.length}`);
let imports = 0;
for (const [name, data] of back) {
  if (!name.endsWith(".js")) continue;
  for (const m of data.toString("utf8").matchAll(/(?:from\s+|import\s*\(?\s*)["'](\.[^"']+)["']/g)) {
    imports++;
    const target = posix.normalize(posix.join(posix.dirname(name), m[1]));
    if (!back.has(target)) problems.push(`import resolves to nothing in the archive: ${name} -> ${target}`);
  }
}
if (problems.length) fail(`do not ship this archive:\n  ${problems.join("\n  ")}`);

console.log(`fvtt-mod-bythebooks v${version} -> ${relative(REPO, OUT).split("\\").join("/")}`);
console.log(`${zip.length.toLocaleString("en-US")} bytes, ${back.size} entries, ${imports} relative imports resolved, every entry equal to the tree`);
