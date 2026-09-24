#!/usr/bin/env node
/**
 * PROTOTYPE — ILIAS SOAP vertical slice.
 *
 * Walks the read path a student integration would need, one call at a time,
 * and reports what each one answered:
 *
 *   login -> getUserIdBySid -> getCoursesForUser -> getCourseXML
 *         -> getTreeChilds -> getFileXML -> getExerciseXML -> logout
 *
 * It also exercises the failure cases on purpose, because how ILIAS refuses is
 * as important to the connector as how it succeeds: bad credentials, a stale
 * session id, an object that does not exist, and an endpoint that is not there.
 *
 * Nothing here writes to ILIAS. Every call used is a read.
 *
 *   ILIAS_BASE_URL=https://demo.ilias.de \
 *   ILIAS_CLIENT_ID=demo \
 *   ILIAS_USERNAME=... ILIAS_PASSWORD=... \
 *   node scripts/ilias-soap-poc.js
 *
 * Credentials come from the environment only — never from a file in this
 * repository, and they are never printed. Without them the script still runs
 * the anonymous and failure-path checks and says which steps it had to skip.
 *
 * `--record <dir>` writes each response body to disk so the mappers in
 * src/features/integrations can be tested against real payloads. Recorded
 * files contain live course and account data: scrub them before committing.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TIMEOUT_MS = 30_000;

const config = {
  baseUrl: process.env.ILIAS_BASE_URL ?? 'https://demo.ilias.de',
  clientId: process.env.ILIAS_CLIENT_ID ?? 'demo',
  username: process.env.ILIAS_USERNAME ?? '',
  password: process.env.ILIAS_PASSWORD ?? '',
};

const recordDir = (() => {
  const index = process.argv.indexOf('--record');
  return index === -1 ? null : (process.argv[index + 1] ?? 'ilias-fixtures');
})();

const results = [];

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * ILIAS speaks rpc/encoded SOAP, so arguments are positional child elements of
 * the method element and carry their own xsi:type. A generic `<foo>bar</foo>`
 * without the type is rejected by the PHP SoapServer for the int parameters.
 */
function envelope(method, args) {
  const body = args
    .map(([name, value, type]) =>
      type === 'raw'
        ? `<${name}>${value}</${name}>`
        : `<${name} xsi:type="xsd:${type}">${escapeXml(value)}</${name}>`,
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"' +
    ' xmlns:xsd="http://www.w3.org/2001/XMLSchema"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<soapenv:Body><${method}>${body}</${method}></soapenv:Body></soapenv:Envelope>`
  );
}

/** ILIAS 10 moved its web root into `public/`; before that SOAP lived deeper. */
function endpointsFor(baseUrl) {
  return [`${baseUrl}/soap/server.php`, `${baseUrl}/webservice/soap/server.php`];
}

let resolvedEndpoint = null;

async function call(method, args, { endpoint } = {}) {
  const targets = endpoint
    ? [endpoint]
    : resolvedEndpoint
      ? [resolvedEndpoint]
      : endpointsFor(config.baseUrl);

  let last = null;
  for (const target of targets) {
    let response;
    try {
      response = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
        body: envelope(method, args),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      last = { ok: false, transport: String(cause?.message ?? cause), endpoint: target };
      continue;
    }

    const text = await response.text();
    if (response.status === 404) {
      last = { ok: false, status: 404, endpoint: target, text };
      continue;
    }

    if (!endpoint) resolvedEndpoint = target;

    const fault = text.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1] ?? null;
    return {
      ok: response.status === 200 && !fault,
      status: response.status,
      endpoint: target,
      fault: fault ? decodeEntities(fault) : null,
      text,
      payload: extractPayload(text),
    };
  }
  return last ?? { ok: false, transport: 'no endpoint answered' };
}

function decodeEntities(value) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/** Most calls return one XML document as an escaped string member. */
function extractPayload(text) {
  const inner = text.match(/<(?:\w+:)?(?:xml|result)[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:xml|result)>/);
  if (inner?.[1]) return decodeEntities(inner[1]);
  const body = text.match(/<SOAP-ENV:Body>([\s\S]*?)<\/SOAP-ENV:Body>/)?.[1];
  return body ? decodeEntities(body) : null;
}

function record(name, content) {
  if (!recordDir || !content) return;
  mkdirSync(recordDir, { recursive: true });
  writeFileSync(join(recordDir, name), content, 'utf8');
}

function report(step, outcome, detail) {
  results.push({ step, outcome, detail });
  const mark = outcome === 'ok' ? 'OK  ' : outcome === 'skip' ? 'SKIP' : 'FAIL';
  console.log(`${mark}  ${step}${detail ? ` — ${detail}` : ''}`);
}

/** Never let a session id reach the console or a fixture. */
function maskSid(value) {
  return value ? `${value.slice(0, 4)}…::${value.split('::')[1] ?? ''}` : '';
}

async function main() {
  console.log(`ILIAS SOAP proof of concept`);
  console.log(`  target : ${config.baseUrl}`);
  console.log(`  client : ${config.clientId}`);
  console.log(
    `  user   : ${config.username ? '(from environment)' : '(none — credentialed steps will be skipped)'}`,
  );
  console.log(`  record : ${recordDir ?? '(off)'}\n`);

  // --- anonymous: is there a SOAP service at all, and which release is it? ---
  const info = await call('getInstallationInfoXML', []);
  if (info.ok) {
    record('installation-info.xml', info.payload);
    const version = info.payload?.match(/<Installation[^>]*\sversion="([^"]+)"/)?.[1] ?? 'unknown';
    report('getInstallationInfoXML (no session)', 'ok', `${version} at ${info.endpoint}`);
  } else {
    report(
      'getInstallationInfoXML (no session)',
      'fail',
      info.fault ?? info.transport ?? `HTTP ${info.status}`,
    );
    console.log('\nNo SOAP endpoint answered. Nothing below can run.');
    return summarise();
  }

  // --- failure path: a wrong password must come back as an auth fault, not
  //     as a session. Proves the login plumbing without needing an account. ---
  const rejected = await call('login', [
    ['client', config.clientId, 'string'],
    ['username', 'unipilot-probe-not-a-real-account', 'string'],
    ['password', 'unipilot-probe-invalid', 'string'],
  ]);
  report(
    'login with invalid credentials (expected to fail)',
    rejected.ok ? 'fail' : 'ok',
    rejected.ok ? 'unexpectedly returned a session' : (rejected.fault ?? `HTTP ${rejected.status}`),
  );

  // --- characterisation, not a pass/fail: what does ILIAS do with a session
  //     id it never issued? The answer drives how the connector detects an
  //     expired login, so the script prints it rather than judging it. ---
  const stale = await call('getCoursesForUser', [
    ['sid', `0000000000000000000000000000000000::${config.clientId}`, 'string'],
    ['parameters', resultSet({ user_id: 1, status: 1 }), 'string'],
  ]);
  const staleRows = (stale.payload?.match(/<row>/g) ?? []).length;
  report(
    'getCoursesForUser with a session id that was never issued',
    'ok',
    stale.fault
      ? `refused: ${stale.fault}`
      : `NOT refused — HTTP ${stale.status}, ${staleRows} row(s). ILIAS answers as the anonymous` +
          ' user instead of reporting an invalid session, so an empty list is not proof of "no courses".',
  );

  // --- failure path: a path that is not the SOAP server. ---
  const wrongPath = await call('getInstallationInfoXML', [], {
    endpoint: `${config.baseUrl}/definitely-not-the-soap-endpoint.php`,
  });
  report(
    'call against a wrong endpoint (expected to fail)',
    wrongPath.ok ? 'fail' : 'ok',
    wrongPath.ok ? 'unexpectedly succeeded' : `HTTP ${wrongPath.status ?? 0}`,
  );

  if (!config.username || !config.password) {
    for (const step of [
      'login',
      'getUserIdBySid',
      'getCoursesForUser',
      'getCourseXML',
      'getTreeChilds',
      'getFileXML',
      'getExerciseXML',
      'logout',
    ]) {
      report(step, 'skip', 'no ILIAS_USERNAME / ILIAS_PASSWORD in the environment');
    }
    return summarise();
  }

  // --- the read path proper ---
  const session = await call('login', [
    ['client', config.clientId, 'string'],
    ['username', config.username, 'string'],
    ['password', config.password, 'string'],
  ]);
  const sid = session.ok ? (session.payload?.trim() ?? '') : '';
  if (!sid) {
    report('login', 'fail', session.fault ?? `HTTP ${session.status}`);
    return summarise();
  }
  report('login', 'ok', `session ${maskSid(sid)}`);

  const userId = await call('getUserIdBySid', [['sid', sid, 'string']]);
  const ownId = Number(userId.payload?.replace(/\D/g, '') ?? 0);
  report(
    'getUserIdBySid',
    ownId ? 'ok' : 'fail',
    ownId ? `user_id ${ownId}` : (userId.fault ?? 'no id returned'),
  );

  // status 1|2|4 = member|tutor|admin. A student wants all three so a course
  // they tutor does not silently disappear from the list.
  const courses = ownId
    ? await call('getCoursesForUser', [
        ['sid', sid, 'string'],
        ['parameters', resultSet({ user_id: ownId, status: 7 }), 'string'],
      ])
    : { ok: false, fault: 'no user id' };

  let firstCourseRef = null;
  if (courses.ok) {
    record('courses-for-user.xml', courses.payload);
    const refs = [...(courses.payload ?? '').matchAll(/<column>(\d+)<\/column>/g)].map((m) => m[1]);
    firstCourseRef = refs[0] ?? null;
    const count = (courses.payload?.match(/<row>/g) ?? []).length;
    report('getCoursesForUser', 'ok', `${count} course(s)`);
  } else {
    report('getCoursesForUser', 'fail', courses.fault ?? `HTTP ${courses.status}`);
  }

  if (!firstCourseRef) {
    for (const step of ['getCourseXML', 'getTreeChilds', 'getFileXML', 'getExerciseXML']) {
      report(step, 'skip', 'no course ref_id available');
    }
  } else {
    const detail = await call('getCourseXML', [
      ['sid', sid, 'string'],
      ['course_id', firstCourseRef, 'int'],
    ]);
    if (detail.ok) record('course.xml', detail.payload);
    report(
      'getCourseXML',
      detail.ok ? 'ok' : 'fail',
      detail.ok
        ? (detail.payload?.match(/<Title[^>]*>([^<]*)</)?.[1] ?? `ref_id ${firstCourseRef}`)
        : (detail.fault ?? `HTTP ${detail.status}`),
    );

    const tree = await call('getTreeChilds', [
      ['sid', sid, 'string'],
      ['ref_id', firstCourseRef, 'int'],
      ['types', '', 'raw'],
      ['user_id', String(ownId), 'int'],
    ]);
    let fileRef = null;
    let exerciseRef = null;
    if (tree.ok) {
      record('tree-childs.xml', tree.payload);
      fileRef = refIdOfType(tree.payload, 'file');
      exerciseRef = refIdOfType(tree.payload, 'exc');
      const count = (tree.payload?.match(/<Object /g) ?? []).length;
      report('getTreeChilds', 'ok', `${count} child object(s)`);
    } else {
      report('getTreeChilds', 'fail', tree.fault ?? `HTTP ${tree.status}`);
    }

    if (fileRef) {
      // 0 = metadata only. Asking for content would pull the whole file
      // base64-encoded through the envelope, which is not what a listing needs.
      const file = await call('getFileXML', [
        ['sid', sid, 'string'],
        ['ref_id', fileRef, 'int'],
        ['attachFileContentsMode', 0, 'int'],
      ]);
      if (file.ok) record('file.xml', file.payload);
      report(
        'getFileXML',
        file.ok ? 'ok' : 'fail',
        file.ok ? `ref_id ${fileRef}` : (file.fault ?? ''),
      );
    } else {
      report('getFileXML', 'skip', 'no file object in that course');
    }

    if (exerciseRef) {
      const exercise = await call('getExerciseXML', [
        ['sid', sid, 'string'],
        ['ref_id', exerciseRef, 'int'],
        ['attachFileContentsMode', 0, 'int'],
      ]);
      if (exercise.ok) record('exercise.xml', exercise.payload);
      report(
        'getExerciseXML',
        exercise.ok ? 'ok' : 'fail',
        exercise.ok ? `ref_id ${exerciseRef}` : (exercise.fault ?? ''),
      );
    } else {
      report('getExerciseXML', 'skip', 'no exercise object in that course');
    }

    // Permission check: a ref_id that cannot exist must be refused, not served.
    const forbidden = await call('getCourseXML', [
      ['sid', sid, 'string'],
      ['course_id', 999_999_999, 'int'],
    ]);
    report(
      'getCourseXML for a non-existent object (expected to fail)',
      forbidden.ok ? 'fail' : 'ok',
      forbidden.ok ? 'unexpectedly succeeded' : (forbidden.fault ?? `HTTP ${forbidden.status}`),
    );
  }

  const out = await call('logout', [['sid', sid, 'string']]);
  report('logout', out.ok ? 'ok' : 'fail', out.ok ? '' : (out.fault ?? `HTTP ${out.status}`));

  return summarise();
}

/** ILIAS passes structured arguments as its own ilXMLResultSet document. */
function resultSet(fields) {
  const columns = Object.keys(fields)
    .map((name) => `<colspec idx="0" name="${name}"/>`)
    .join('');
  const values = Object.values(fields)
    .map((value) => `<column>${escapeXml(value)}</column>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<result><colspecs>' +
    columns +
    '</colspecs><rows><row>' +
    values +
    '</row></rows></result>'
  );
}

function refIdOfType(xml, type) {
  const match = new RegExp(
    `<Object[^>]*\\stype="${type}"[\\s\\S]*?<References[^>]*\\sref_id="(\\d+)"`,
  ).exec(xml ?? '');
  if (match) return match[1];
  const flat = new RegExp(`<Object[^>]*\\stype="${type}"[^>]*\\sref_id="(\\d+)"`).exec(xml ?? '');
  return flat?.[1] ?? null;
}

function summarise() {
  const counts = results.reduce((totals, { outcome }) => {
    totals[outcome] = (totals[outcome] ?? 0) + 1;
    return totals;
  }, {});
  console.log(
    `\n${counts.ok ?? 0} ok, ${counts.fail ?? 0} failed, ${counts.skip ?? 0} skipped.` +
      '\nCopy this output into docs/integrations/ilias-integration-research.md as-is:' +
      ' a failed step is a finding, not something to hide.',
  );
  if (counts.fail) process.exitCode = 1;
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
