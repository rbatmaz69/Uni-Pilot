#!/usr/bin/env node
/**
 * PROTOTYPE — ILIAS reachability probe.
 *
 * Asks a public ILIAS installation what it exposes, without logging in and
 * without sending any credential. Every request is a plain GET, except one
 * anonymous `getInstallationInfoXML` SOAP call, which ILIAS answers for
 * everybody because it is what a client picker needs.
 *
 * Why this exists: an ILIAS integration stands or falls on three facts —
 * which release the site runs, whether the SOAP endpoint is reachable from a
 * student's machine at all, and which sign-in method the site uses. Those
 * three differ per university and cannot be read out of any documentation.
 * Running this beats repeating the research.
 *
 *   node scripts/ilias-probe.js https://ilias.hs-heilbronn.de
 *   node scripts/ilias-probe.js https://demo.ilias.de --json
 *
 * See docs/integrations/ilias-integration-research.md for how to read the
 * output.
 */

const TIMEOUT_MS = 20_000;
const USER_AGENT = 'UniPilot-ILIAS-Probe/0.1 (+https://github.com/rbatmaz69/Uni-Pilot)';

/**
 * Paths worth asking about. `soap-*` are the two places the SOAP endpoint has
 * lived: ILIAS moved its web root into `public/` with release 10, which turned
 * `/webservice/soap/server.php` into `/soap/server.php`.
 */
const PATHS = [
  { key: 'soap-10+', path: '/soap/server.php?wsdl', note: 'SOAP endpoint, ILIAS >= 10' },
  {
    key: 'soap-<=9',
    path: '/webservice/soap/server.php?wsdl',
    note: 'SOAP endpoint, ILIAS <= 9',
  },
  { key: 'calendar', path: '/calendar.php', note: 'iCal subscription (per-user token)' },
  { key: 'privfeed', path: '/privfeed.php', note: 'private news feed (per-user feed password)' },
  { key: 'feed', path: '/feed.php', note: 'public object news feed' },
  { key: 'webdav', path: '/webdav.php', note: 'WebDAV repository mount' },
  { key: 'restplugin', path: '/restplugin.php', note: 'community REST plugin' },
  { key: 'rest-api', path: '/api.php', note: 'community REST plugin (alternate mount)' },
  // These three ship with every ILIAS. Reaching one proves nothing about
  // whether that method is configured — the login page above is the evidence.
  { key: 'oidc', path: '/openidconnect.php', note: 'OpenID Connect entry (always present)' },
  { key: 'saml', path: '/saml.php', note: 'SAML entry (always present)' },
  { key: 'shibboleth', path: '/shib_login.php', note: 'Shibboleth entry (always present)' },
];

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node scripts/ilias-probe.js <ilias-base-url> [--json]');
  console.error('Example: node scripts/ilias-probe.js https://ilias.hs-heilbronn.de');
  process.exit(message ? 1 : 0);
}

/** Accepts a bare host or a deep link and keeps only the installation root. */
function normaliseBase(input) {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withScheme);
  // A pasted link is usually `…/ilias.php?baseClass=…`; the directory holding
  // it is the installation root.
  const directory = url.pathname.replace(/\/[^/]*$/, '');
  return `${url.origin}${directory}`.replace(/\/$/, '');
}

async function get(url, { method = 'GET', body, headers = {}, redirect = 'manual' } = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method,
      body,
      redirect,
      headers: { 'User-Agent': USER_AGENT, ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    return {
      ok: true,
      status: response.status,
      headers: response.headers,
      text,
      ms: Date.now() - started,
    };
  } catch (cause) {
    return {
      ok: false,
      status: 0,
      error: String(cause?.message ?? cause),
      ms: Date.now() - started,
    };
  }
}

/**
 * `getInstallationInfoXML` needs no session — it is the call a client picker
 * makes before anybody has signed in. When it answers, it hands over the exact
 * release string and the client id, which is otherwise guesswork.
 */
async function askInstallationInfo(base) {
  const envelope =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soapenv:Body><getInstallationInfoXML/></soapenv:Body></soapenv:Envelope>';

  for (const path of ['/soap/server.php', '/webservice/soap/server.php']) {
    const response = await get(`${base}${path}`, {
      method: 'POST',
      body: envelope,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
    });
    if (!response.ok || response.status !== 200 || !response.text.includes('Installation'))
      continue;

    // The payload arrives XML-escaped inside the SOAP string member.
    const decoded = response.text
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&');
    return {
      path,
      version: decoded.match(/<Installation[^>]*\sversion="([^"]+)"/)?.[1] ?? null,
      clients: [...decoded.matchAll(/<Client[^>]*\sid="([^"]+)"/g)].map((match) => match[1]),
    };
  }
  return null;
}

/**
 * Fallback identification for installations that keep SOAP behind a firewall:
 * the login page itself carries the release in its asset cache-busters and the
 * client id in the data directory it serves styles from.
 */
async function readLoginPage(base) {
  // The bare login.php bounces a signed-out visitor to the public repository,
  // which carries the release stamps but not the login form. `force_login` is
  // the form itself, and it carries the stamps too.
  const response = await get(`${base}/login.php?cmd=force_login`, {
    headers: { Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!response.ok) return { reachable: false, error: response.error };

  const html = response.text;

  return {
    reachable: true,
    // `?version=9_23` on every asset — the release, then the hotfix.
    assetVersion:
      html
        .match(/[?&]version=(\d+)_(\d+)/)
        ?.slice(1, 3)
        .join('.') ?? null,
    // ILIAS <= 9 serves from `Services/`; 10 renamed everything to `components/ILIAS/`.
    layout: /\/Services\//.test(html)
      ? 'Services/ (ILIAS <= 9)'
      : /components\/ILIAS\//.test(html)
        ? 'components/ILIAS/ (ILIAS >= 10)'
        : null,
    clientId:
      html.match(/[?&]client_id=([A-Za-z0-9_.-]+)/)?.[1] ??
      html.match(/\.\/data\/([A-Za-z0-9_.-]+)\//)?.[1] ??
      null,
    // Links only: the SSO endpoints exist on every ILIAS, configured or not.
    // The password field is found by type — ILIAS 9+ generates field names such
    // as `login_form/input_3/input_5`, so `name="username"` never matched and
    // every installation looked SSO-only.
    signIn: [
      /href="[^"]*openidconnect\.php/i.test(html) && 'OpenID Connect',
      /href="[^"]*shib_login\.php/i.test(html) && 'Shibboleth',
      /href="[^"]*saml\.php/i.test(html) && 'SAML',
      /<input[^>]*type="password"/i.test(html) && 'password form',
    ].filter(Boolean),
  };
}

/**
 * Distinguishes "the endpoint is not there" from "the endpoint is there and
 * something in front of it says no". That difference decides whether an
 * integration path is merely unconfigured or deliberately closed.
 */
function verdict(key, response) {
  if (!response.ok) return `unreachable (${response.error})`;
  const { status } = response;
  if (status === 404) return '404 — not present';
  if (status === 403) return '403 — present but blocked (firewall / allow-list)';
  if (status === 401) {
    const realm = response.headers.get('www-authenticate');
    return realm ? `401 — reachable, needs auth (${realm})` : '401 — reachable, needs auth';
  }
  if (status >= 300 && status < 400) return `${status} — redirect to sign-in`;
  if (status === 500) return '500 — present, rejects a call without parameters';
  if (status === 200 && key.startsWith('soap')) {
    return response.text.includes('wsdl:definitions') || response.text.includes('<definitions')
      ? '200 — WSDL served'
      : '200 — answers, but no WSDL';
  }
  return `${status} — reachable`;
}

function table(rows, columns) {
  const widths = columns.map((column) =>
    Math.max(column.header.length, ...rows.map((row) => String(row[column.key] ?? '').length)),
  );
  const line = (cells) =>
    `| ${cells.map((cell, index) => String(cell).padEnd(widths[index])).join(' | ')} |`;
  return [
    line(columns.map((column) => column.header)),
    `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`,
    ...rows.map((row) => line(columns.map((column) => row[column.key] ?? ''))),
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) usage();

  const asJson = args.includes('--json');
  const target = args.find((argument) => !argument.startsWith('-'));
  if (!target) usage('no ILIAS URL given');

  let base;
  try {
    base = normaliseBase(target);
  } catch {
    usage(`not a URL: ${target}`);
  }

  const [info, login] = await Promise.all([askInstallationInfo(base), readLoginPage(base)]);

  const probes = [];
  for (const { key, path, note } of PATHS) {
    const response = await get(base + path, { headers: { Accept: '*/*' } });
    probes.push({ key, path, note, status: response.status, verdict: verdict(key, response) });
  }

  const result = {
    base,
    probedAt: new Date().toISOString(),
    version: info?.version ?? login?.assetVersion ?? null,
    versionSource: info
      ? 'getInstallationInfoXML'
      : login?.assetVersion
        ? 'login page assets'
        : null,
    layout: login?.layout ?? null,
    clients: info?.clients ?? (login?.clientId ? [login.clientId] : []),
    signIn: login?.signIn ?? [],
    probes,
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`## ILIAS probe — ${base}\n`);
  console.log(`- Probed at: ${result.probedAt}`);
  console.log(
    `- Version: ${result.version ?? 'unknown'}${result.versionSource ? ` (via ${result.versionSource})` : ''}`,
  );
  console.log(`- Directory layout: ${result.layout ?? 'unknown'}`);
  console.log(`- Client id(s): ${result.clients.length ? result.clients.join(', ') : 'unknown'}`);
  console.log(`- Sign-in offered: ${result.signIn.length ? result.signIn.join(', ') : 'unknown'}`);
  console.log(
    `- Anonymous SOAP info call: ${info ? `answered at ${info.path}` : 'no answer (blocked, absent, or SOAP disabled)'}\n`,
  );
  console.log(
    table(probes, [
      { key: 'path', header: 'Path' },
      { key: 'note', header: 'What it is' },
      { key: 'verdict', header: 'Result' },
    ]),
  );
  console.log(
    '\nA 403 means the path exists and a web server rule refuses it — ILIAS recommends exactly\n' +
      'that for SOAP, so it is the expected answer at a hardened university, not a bug here.\n' +
      'The three sign-in entries ship with every ILIAS; only the "Sign-in offered" line above\n' +
      'says which method this installation actually uses.',
  );
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
