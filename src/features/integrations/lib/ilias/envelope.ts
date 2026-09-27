/**
 * The SOAP plumbing, kept apart from the mappers so those stay pure.
 *
 * ILIAS speaks rpc/encoded SOAP through PHP's `SoapServer`. That has two
 * consequences worth knowing before touching this file: arguments are
 * positional child elements rather than named parameters, and integer
 * arguments are rejected unless they carry an explicit `xsi:type`.
 */

import { IliasError, fromSoapFault } from './errors';

export type SoapArgumentType = 'string' | 'int';

export interface SoapArgument {
  name: string;
  value: string | number;
  type: SoapArgumentType;
}

export function escapeXml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function decodeXmlEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

export function buildEnvelope(method: string, args: readonly SoapArgument[]): string {
  const body = args
    .map(({ name, value, type }) => `<${name} xsi:type="xsd:${type}">${escapeXml(value)}</${name}>`)
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"' +
    ' xmlns:xsd="http://www.w3.org/2001/XMLSchema"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<soapenv:Body><${method}>${body}</${method}></soapenv:Body>` +
    '</soapenv:Envelope>'
  );
}

/**
 * ILIAS passes structured arguments as its own `ilXMLResultSet` document
 * rather than as SOAP structs — `getCoursesForUser` takes its `user_id` and
 * `status` that way.
 */
export function buildResultSet(fields: Readonly<Record<string, string | number>>): string {
  const names = Object.keys(fields);
  const colspecs = names.map((name, index) => `<colspec idx="${index}" name="${name}"/>`).join('');
  const columns = names.map((name) => `<column>${escapeXml(fields[name] ?? '')}</column>`).join('');

  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<result><colspecs>${colspecs}</colspecs><rows><row>${columns}</row></rows></result>`
  );
}

/**
 * Pulls the payload out of a response envelope.
 *
 * Almost every ILIAS read call answers with one XML document stuffed into a
 * single escaped string member, whose element name varies by call (`xml`,
 * `object_xml`, `result`). A fault is raised as a typed error rather than
 * returned, because no caller has anything useful to do with a half-result.
 */
export function readEnvelope(responseText: string): string {
  const fault = /<faultstring>([\s\S]*?)<\/faultstring>/.exec(responseText)?.[1];
  if (fault !== undefined) throw fromSoapFault(decodeXmlEntities(fault).trim());

  const member = /<(?:\w+:)?(xml|object_xml|result|return)[^>]*>([\s\S]*?)<\/(?:\w+:)?\1>/.exec(
    responseText,
  );
  if (member?.[2] !== undefined) return decodeXmlEntities(member[2]).trim();

  throw new IliasError(
    'unreadable-response',
    'ILIAS answered in a shape this version of Uni Pilot does not understand.',
  );
}
