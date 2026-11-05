/**
 * THE GM IDENTITIES, after a prod mirror: the world users the suites join as (target.mjs `GM_IDENTITIES`) — `suite`, every
 * suite's own user (FOUNDRY_SUITE_USER, BF_SUITE_USER), an Assistant GM; `assistant`, a second Assistant GM
 * (FOUNDRY_ASSISTANT_USER); `gm2`, a Gamemaster (FOUNDRY_GM2_USER) — made to stand as the family .env names them.
 * A mirror (`pull-prod-to-local.mjs` in the MCP repo) replaces the sandbox's users with prod's: a user prod lacks is gone
 * (prod has no suite identity, so every suite then refuses to join), and one prod has comes with prod's password. So
 * this tool joins as the BRIDGE user (FOUNDRY_USER), the one GM client a mirror leaves standing, and for each identity:
 *   - missing: creates it with its role and the .env's password; the suite identity with an id that sorts last;
 *   - standing: sets the .env's password (prod's copy carries prod's), and names a role that is not the one it is for;
 *   - the suite identity sorting before another Assistant GM: makes it again with the id that sorts last. Foundry's
 *     active GM breaks a tie of roles on the LOWER id (`Users#getDesignatedUser`), and a run with a second GM client
 *     (smoke-emanations §30) needs that client to take the lead.
 * Foundry lets a user create users of its own role or below, so the bridge (an Assistant GM) names the Gamemaster it
 * cannot create: that one is made from a Gamemaster's window (Configure Players, Create User: the .env's name and
 * password, the Gamemaster role). A connected user is never replaced. Passwords are never printed.
 *
 *   node tools/seed-gm-identities.mjs            make every identity stand; report each
 *   node tools/seed-gm-identities.mjs --check    report only, change nothing (a password cannot be read, so not checked)
 *
 * Run it once after every mirror, before any suite (then `fixture-suite.mjs`). The MCP client's connect refuses while a
 * battery or a suite holds the seat. Exit 0 when every identity the .env names stands with its role and order; 1 when
 * one does not (the Gamemaster this client cannot make among them).
 */
import { fileURLToPath } from "node:url";
import { Foundry } from "fvtt-mcp-dnd5e/client";
import { strictArgs, usageOf } from "./args.mjs";
import { disposeSafely, loadEnv } from "./harness.mjs";
import { GM_IDENTITIES, bridgeConfig, gmIdentity } from "./target.mjs";

const TAG = "seed-gm-identities";
/** The suite identity's id when this tool makes it: it sorts after any id Foundry generates. */
const SUITE_ID = "zzSuiteTester001";

const { values } = strictArgs({
  options: { check: { type: "boolean" } },
  usage: usageOf(fileURLToPath(import.meta.url)),
  script: "seed-gm-identities.mjs"
});
const env = loadEnv();
const wanted = Object.keys(GM_IDENTITIES).map(k => gmIdentity(env, k)).filter(Boolean);
for (const k of Object.keys(GM_IDENTITIES).filter(k => !gmIdentity(env, k))) {
  console.log(`[${TAG}] ${k}: the .env names no user (${GM_IDENTITIES[k].user[0]}) — skipped`);
}
if (!wanted.length) { console.log(`[${TAG}] nothing to seed`); process.exit(0); }

setTimeout(() => { console.error(`[${TAG}] WATCHDOG: 120 s elapsed, aborting`); process.exit(3); }, 120_000).unref();
const f = new Foundry(bridgeConfig(env));
console.log(`[${TAG}] connecting as the bridge user…`);
await f.connect();
let out;
try {
  out = await f.evaluate(async ({ want, dry, suiteId }) => {
    const UserClass = getDocumentClass("User");
    const ASSISTANT = CONST.USER_ROLES.ASSISTANT;
    const me = { name: game.user.name, role: game.user.role, id: game.user.id };
    const rows = [];
    // The suite last: its order is read against the others as they then stand.
    const order = [...want].sort((a, b) => (a.key === "suite" ? 1 : 0) - (b.key === "suite" ? 1 : 0));
    for (const w of order) {
      const role = w.role ?? ASSISTANT;   // the suite's role is the world's; made, it is an Assistant GM
      const row = { key: w.key, user: w.user, wantRole: role };
      let user = game.users.getName(w.user);
      // The suite identity must sort after every other Assistant GM the .env names, or a second GM client never leads.
      const rivals = want.filter(x => (x.key !== "suite") && ((x.role ?? ASSISTANT) === ASSISTANT)).map(x => game.users.getName(x.user)).filter(Boolean);
      const sortsBefore = (w.key === "suite") && user && rivals.some(r => user.id.compare(r.id) < 0);
      try {
        if ( user && sortsBefore ) {
          if ( dry ) row.note = `id ${user.id} sorts before ${rivals.filter(r => user.id.compare(r.id) < 0).map(r => r.name).join(", ")}: a second GM client cannot lead`;
          else if ( user.active ) row.note = "connected — not replaced; close it and run again";
          else { await user.delete(); user = null; row.replaced = true; }
        }
        if ( !user ) {
          if ( dry ) {
            row.note = row.note ?? "missing";
          } else if ( game.user.role < role ) {
            row.note = `this client is role ${game.user.role} and Foundry lets a user create users of its own role or below: `
              + `create "${w.user}" with role ${role} from a Gamemaster's window, with the .env's password`;
          } else {
            const data = { name: w.user, role, password: w.password ?? "", ...(w.key === "suite" ? { _id: suiteId } : {}) };
            [user] = await UserClass.createDocuments([data], w.key === "suite" ? { keepId: true } : {});
            row.created = true;
          }
        } else if ( !dry && !sortsBefore ) {
          await user.update({ password: w.password ?? "" });
          row.password = true;
        }
      } catch (err) {
        row.note = `refused: ${err?.message ?? err}`;
      }
      if ( user ) {
        Object.assign(row, { exists: true, role: user.role, id: user.id });
        const ordered = (w.key !== "suite") || !rivals.some(r => (r.id !== user.id) && (user.id.compare(r.id) < 0));
        // The suite's role is the world's (any GM role); the others are the role they are for.
        const roleOk = (w.role === null) ? (user.role >= ASSISTANT) : (user.role === role);
        row.ok = roleOk && ordered && !row.note;
        if ( !roleOk ) row.note = `holds role ${user.role}, not ${role}: change it from a Gamemaster's window, or name another user`;
      } else {
        row.ok = false;
      }
      rows.push(row);
    }
    return { me, settingsRoles: game.permissions?.SETTINGS_MODIFY ?? null, filesUploadRoles: game.permissions?.FILES_UPLOAD ?? null, rows };
  }, { want: wanted.map(w => ({ key: w.key, user: w.user, role: w.role, password: w.password ?? null })), dry: !!values.check, suiteId: SUITE_ID });
} finally {
  await disposeSafely(f, TAG);
}

console.log(`[${TAG}] joined as the bridge user "${out.me.name}", role ${out.me.role}`);
console.log(`[${TAG}] the world's SETTINGS_MODIFY roles: ${JSON.stringify(out.settingsRoles)}; FILES_UPLOAD roles: ${JSON.stringify(out.filesUploadRoles)}`);
for (const r of out.rows) {
  const state = r.created ? (r.replaced ? "MADE AGAIN" : "CREATED") : r.exists ? "stands" : "MISSING";
  const pw = r.created ? ", the .env's password" : (r.password ? ", password set from the .env" : "");
  console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.key.padEnd(10)} "${r.user}" ${state}${r.exists ? `, role ${r.role}, id ${r.id}${pw}` : ""}${r.note ? ` — ${r.note}` : ""}`);
}
process.exit(out.rows.every(r => r.ok) ? 0 : 1);
