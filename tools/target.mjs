/**
 * Which instance a suite talks to, decided in one place; every run prints its target.
 * The local sandbox by default: the MCP client's `local` host preset (LOCAL_WORLD_ID, LOCAL_FOUNDRY_DATA in
 * its .env), whatever world that names. Suites MUTATE settings, actors and chat, and are tied to no world:
 * their fixtures are built from the compendia by `fixture-suite.mjs`, never cloned from a campaign's
 * characters, so any world the sandbox runs serves (2026-10-07).
 *   BTB_HOST=<an MCP host preset> node tools/verify-settings.mjs   → another instance, deliberately (the
 *   settings check after a deploy). No instance is named here: the presets live in the MCP repo's .env.
 * The repo's own variables are BTB_*; each BF_* name from before 3.0.0 (formerly Battle Flow) is still read
 * as its fallback, so an existing .env keeps working unedited.
 */
import { describeHolder, foundryConfig as clientConfig, listHolders } from 'fvtt-mcp-dnd5e/client';

const host = () => process.env.BTB_HOST || process.env.BF_HOST || 'local';

/**
 * The suite identity's BTB_* names, handed to the MCP client under the BF_* names it reads (its own
 * FOUNDRY_SUITE_* still win there). A BTB_* value beats a BF_* one; an env with neither is unchanged.
 */
function withAliases(env) {
  if ( !env ) return env;
  const out = { ...env };
  for ( const k of ['SUITE_USER', 'SUITE_PASSWORD'] ) if ( env[`BTB_${k}`] ) out[`BF_${k}`] = env[`BTB_${k}`];
  return out;
}

/**
 * THE GM-CAPABLE IDENTITIES a run may hold, each a world user named in the family .env. `suite` is the one
 * every suite joins as; `gm2` a second user with the Gamemaster role (4); `assistant` one with the
 * Assistant GM role (3). Each name is read FOUNDRY_* first, then BTB_*, then (the suite only) BF_*. `role`
 * is the role the identity is for; the suite's is whatever the world gives it. A run that holds more than
 * one of them at once declares which (`GM_CLIENTS`, read by `declaredGmClients`).
 */
export const GM_IDENTITIES = Object.freeze({
  suite: { role: null, user: ['FOUNDRY_SUITE_USER', 'BTB_SUITE_USER', 'BF_SUITE_USER'],
    password: ['FOUNDRY_SUITE_PASSWORD', 'BTB_SUITE_PASSWORD', 'BF_SUITE_PASSWORD'] },
  gm2: { role: 4, user: ['FOUNDRY_GM2_USER', 'BTB_GM2_USER'], password: ['FOUNDRY_GM2_PASSWORD', 'BTB_GM2_PASSWORD'] },
  assistant: { role: 3, user: ['FOUNDRY_ASSISTANT_USER', 'BTB_ASSISTANT_USER'],
    password: ['FOUNDRY_ASSISTANT_PASSWORD', 'BTB_ASSISTANT_PASSWORD'] }
});

const firstSet = (env, keys) => keys.map(k => env?.[k]?.trim()).find(Boolean);

/**
 * One GM identity out of the env: `{ key, user, password, role }`, or null when the env names no user
 * for it. The password is absent for a passwordless user.
 * @param {Record<string, string>|null} env
 * @param {string} key  a GM_IDENTITIES key
 */
export function gmIdentity(env, key) {
  const spec = GM_IDENTITIES[key];
  if ( !spec ) throw new Error(`no GM identity "${key}" — the identities are ${Object.keys(GM_IDENTITIES).join(', ')}`);
  const user = firstSet(env, spec.user);
  if ( !user ) return null;
  const password = firstSet(env, spec.password);
  return { key, user, ...(password ? { password } : {}), role: spec.role };
}

/** The `{ user, password? }` the MCP client joins as, for a GM identity the env names; a refusal naming the variable otherwise. */
function joinAs(env, key) {
  const id = gmIdentity(env, key);
  if ( !id ) throw new Error(`identity "${key}" needs ${GM_IDENTITIES[key].user[0]} in the .env (tools/README.md, the live tier's table)`);
  return id.password ? { user: id.user, password: id.password } : { user: id.user };
}

/**
 * The GM identities a script declares it holds at once: its `export const GM_CLIENTS = [...]`, beside its
 * SECTIONS or COVERS, read from the source text (a suite runs on import, so the text is parsed, never
 * imported). Null when it declares none; a name that is not a GM_IDENTITIES key throws.
 * @param {string} src  the script's source
 * @returns {string[]|null}
 */
export function declaredGmClients(src) {
  const m = /^export const GM_CLIENTS\s*=\s*\[([^\]]*)\]/m.exec(src ?? '');
  if ( !m ) return null;
  const keys = [...m[1].matchAll(/["']([\w-]+)["']/g)].map(x => x[1]);
  const unknown = keys.filter(k => !(k in GM_IDENTITIES));
  if ( unknown.length ) {
    throw new Error(`GM_CLIENTS names ${unknown.join(', ')} — the identities are ${Object.keys(GM_IDENTITIES).join(', ')}`);
  }
  return keys;
}

/** Who holds the bridge seat: this machine's seat records first, then the marker on its User document. */
function holderLines(bridgeUser, marker, env) {
  const lines = [];
  try {
    const cfg = clientConfig(env, host(), 'bridge');
    const here = listHolders(cfg.serverUrl, cfg.user).filter(h => !h.self);
    if (here.length) lines.push(`Held on this machine by ${here.map(describeHolder).join('; ')}.`);
  } catch { /* no env, or no records */ }
  if (marker) {
    lines.push(`"${bridgeUser}"'s User document says: pid ${marker.pid} on ${marker.host} — ${marker.label} — since ${marker.since}.`);
  }
  if (!lines.length) {
    lines.push('No seat record on this machine and no marker on its User document: a bridge older than MCP 4.4.0, or one on another machine.');
  }
  return lines.join(' ');
}

/**
 * Resolve the Foundry connection config: the sandbox unless BTB_HOST names another preset. `identity` is a
 * GM_IDENTITIES key: the suite identity by default, another one for a run that declares it.
 */
export function foundryConfig(env, identity = 'suite') {
  env = withAliases(env);
  const h = host();
  if (identity !== 'suite') {
    const cfg = clientConfig(env, h, joinAs(env, identity));
    console.log(h === 'local'
      ? `[target] local sandbox (${cfg.serverUrl}) as "${cfg.user}" (${identity})`
      : `[target] ⚠ host preset "${h}" — NOT the sandbox, as "${cfg.user}" (${identity}); this run mutates that world`);
    return cfg;
  }
  if (h !== 'local') {
    console.log(`[target] ⚠ host preset "${h}" — NOT the sandbox; this run mutates that world`);
    return clientConfig(env, h, 'bridge');
  }
  // ⚠ Suites join as their OWN identity (FOUNDRY_SUITE_USER, alias BTB_SUITE_USER, formerly BF_SUITE_USER), not the bridge's,
  // so a bridge/suite overlap is detectable: `game.users` and `/api/status` count USERS, not sockets.
  const cfg = clientConfig(env, 'local', 'suite');
  console.log(`[target] local sandbox (${cfg.serverUrl}) as "${cfg.user}"`);
  return cfg;
}

/**
 * The bridge user's config (FOUNDRY_USER): the one GM client a prod mirror leaves standing on the sandbox, so the
 * tool that repairs the suite's own identities joins as it (seed-gm-identities.mjs). Prints nothing.
 */
export function bridgeConfig(env) {
  return clientConfig(withAliases(env), host(), 'bridge');
}

/**
 * The second client's config for two-client probes: the same instance, joined as the player test
 * identity (FOUNDRY_PLAYER_USER). No adminKey: a player never launches the world.
 */
export function playerConfig(env) {
  return clientConfig(withAliases(env), host(), 'player');
}

/**
 * Another GM client's config, for a run that holds several: the same instance, joined as a GM identity
 * (`suite`, `gm2`, `assistant`). Prints nothing; the run says who it connects.
 */
export function gmConfig(env, key) {
  env = withAliases(env);
  return key === 'suite' ? clientConfig(env, host(), 'suite') : clientConfig(env, host(), joinAs(env, key));
}

/**
 * Preflight: exactly one GM-capable client, and it is us. `game.users.activeGM` elects one of all
 * connected GM sessions, so a second one can BE the elect and the suite's assertions happen
 * somewhere this client cannot see.
 * `{ requireElect: false }` for a read-only probe; with `{ allowBridge: true }` for one that asserts nothing.
 * A run that asserts (`requireElect`, the default) also needs By the Books active and the old package
 * (formerly Battle Flow, `fvtt-mod-battleflow`) NOT active: with both on, By the Books is passive and every
 * "nothing happened" assertion would pass falsely. A read-only look (job.mjs --read-only) works either way.
 * ⚠ The bridge identity is held by EVERY open Claude session's MCP server, and `disconnect-bridge`
 * logs out only the calling one: when the other GM is the bridge, the message NAMES THE HOLDER —
 * the seat record the bridge leaves on this machine (MCP 4.4.0 and later, `listHolders`) and the marker it
 * writes on its User document (`flags.world.fvttMcpBridge`: pid, session, since) — and the cure:
 * `disconnect-bridge { all: true }` from any session, which ends every other holder's browser.
 * THE MULTI-GM MODE: `{ gmClients }` (a script's declared GM_CLIENTS) allows exactly the users those
 * identities name, any number of them at once, and this client must be one of them; every other
 * GM-capable user is refused as above. With `requireElect` the elect may then be any of them.
 */
export async function preflightSoleGM(f, { requireElect = true, allowBridge = false, env = null, gmClients = null } = {}) {
  const bridgeUser = env?.FOUNDRY_USER ?? env?.LOCAL_FOUNDRY_USER ?? null;
  const who = await f.evaluate(async () => ({
    self: game.user.name,
    elect: game.users.activeGM?.name ?? null,
    isSelf: game.users.activeGM?.isSelf ?? false,
    gms: game.users.filter(u => u.active && u.isGM).map(u => u.name),
    markers: Object.fromEntries(game.users.filter(u => u.active && u.isGM && u.flags?.world?.fvttMcpBridge)
      .map(u => [u.name, u.flags.world.fvttMcpBridge])),
    module: !!game.modules.get('fvtt-mod-bythebooks')?.active,
    legacy: !!game.modules.get('fvtt-mod-battleflow')?.active,
    // A started combat none of the fixtures stand in: the table's own, left running.
    foreignCombats: game.combats.filter(c => c.started && !c.combatants.some(cb => /^(BTB|BF) Test /.test(cb.actor?.name ?? cb.name ?? '')))
      .map(c => `${c.scene?.name ?? 'no scene'} round ${c.round} turn ${c.turn} (${c.combatants.map(cb => cb.name).join(', ') || 'no combatants'}; id ${c.id})`),
  }), null);
  const others = who.gms.filter(n => n !== who.self);
  const onlyTheBridge = others.length === 1 && others[0] === bridgeUser;
  const bridgeWhy = () => `The other GM is the MCP bridge "${bridgeUser}", which every open Claude session's MCP server `
    + `joins as. ${holderLines(bridgeUser, who.markers[bridgeUser], env)} `
    + 'disconnect-bridge { all: true } from any session ends every other holder\'s browser on this '
    + 'machine (their servers reconnect on their next call); then re-run.';
  let declared = null;
  if (gmClients) {
    declared = new Map();
    for (const key of gmClients) {
      const id = gmIdentity(withAliases(env), key);
      if (id) declared.set(id.user, key);
    }
    if (!declared.has(who.self)) {
      throw new Error(`PREFLIGHT: this client joined as "${who.self}", which none of the declared GM_CLIENTS `
        + `(${gmClients.join(', ')}) names in the .env.`);
    }
    const foreign = others.filter(n => !declared.has(n));
    if (foreign.length) {
      throw new Error(`PREFLIGHT: ${foreign.length} GM-capable client(s) connected outside the declared GM_CLIENTS `
        + `(${foreign.join(', ')}; declared: ${[...declared].map(([n, k]) => `${n} as ${k}`).join(', ')}) — `
        + (foreign.includes(bridgeUser) ? bridgeWhy()
          : 'Disconnect the MCP bridge (disconnect-bridge) and close any GM window, then re-run.'));
    }
    if (others.length) console.log(`[preflight] declared GM clients connected beside this one: ${others.map(n => `${n} (${declared.get(n)})`).join(', ')}`);
  } else if (onlyTheBridge && allowBridge && !requireElect) {
    console.warn(`[preflight] the MCP bridge "${bridgeUser}" is connected — allowed for this read-only probe`);
    return who;
  } else if (who.gms.length > 1) {
    const why = onlyTheBridge
      ? `${bridgeWhy()} A read-only probe may pass { requireElect: false, allowBridge: true }.`
      : 'Disconnect the MCP bridge (disconnect-bridge) and close any GM window, then re-run. (Same '
        + 'account twice still counts twice: the elect is per-USER, so both pass isActiveGM and they '
        + 'fight over every application.)';
    throw new Error(
      `PREFLIGHT: ${who.gms.length} GM-capable clients connected (${who.gms.join(', ')}) — `
      + `exactly one must be. ${why}`);
  }
  // ⚠ A started combat of the table's own poisons every suite: the receipts stamp `game.combat` whoever is in it,
  // and Foundry clocks every new effect to it, so a Reaction chip spent out of combat reads as expired. A fixture
  // combat is a killed run's, swept by teardown-fixtures; this one is somebody's, ended by hand.
  if (requireElect && who.foreignCombats.length) {
    throw new Error(`PREFLIGHT: a started combat none of the fixtures stand in — ${who.foreignCombats.join('; ')}. `
      + 'The receipts and the Reaction chips would read it. End or delete it (the tracker, or the MCP), then re-run.');
  }
  if (requireElect && (!who.module || who.legacy)) {
    throw new Error('PREFLIGHT: '
      + (!who.module ? 'By the Books (fvtt-mod-bythebooks) is not active in this world'
        : 'Battle Flow (fvtt-mod-battleflow) is still active beside By the Books, which is therefore passive')
      + ' — every suite would assert against a module that does nothing. In Manage Modules: By the Books on, '
      + 'Battle Flow off, then reload the world and re-run.');
  }
  if (requireElect && !who.isSelf && !declared?.has(who.elect)) {
    throw new Error(`PREFLIGHT: the elect is "${who.elect}", not this client ("${who.self}") — `
      + 'this run would assert on work happening elsewhere.');
  }
  return who;
}
