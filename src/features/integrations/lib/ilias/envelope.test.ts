import { describe, expect, it } from 'vitest';
import { buildEnvelope, buildResultSet, readEnvelope } from './envelope';
import { IliasError } from './errors';

describe('buildEnvelope', () => {
  it('types every argument, which PHP SoapServer requires for ints', () => {
    const envelope = buildEnvelope('getCourseXML', [
      { name: 'sid', value: 'abc::demo', type: 'string' },
      { name: 'course_id', value: 717, type: 'int' },
    ]);

    expect(envelope).toContain('<sid xsi:type="xsd:string">abc::demo</sid>');
    expect(envelope).toContain('<course_id xsi:type="xsd:int">717</course_id>');
  });

  it('escapes an argument rather than letting it close the element', () => {
    const envelope = buildEnvelope('lookupUser', [
      { name: 'user_name', value: '</user_name><injected/>', type: 'string' },
    ]);

    expect(envelope).not.toContain('<injected/>');
    expect(envelope).toContain('&lt;/user_name&gt;');
  });
});

describe('buildResultSet', () => {
  it('numbers the column specs, which getCoursesForUser relies on', () => {
    const xml = buildResultSet({ user_id: 4711, status: 7 });

    expect(xml).toContain('<colspec idx="0" name="user_id"/>');
    expect(xml).toContain('<colspec idx="1" name="status"/>');
    expect(xml).toContain('<row><column>4711</column><column>7</column></row>');
  });
});

describe('readEnvelope', () => {
  const wrap = (member: string, payload: string) =>
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="urn:ilUserAdministration">' +
    `<SOAP-ENV:Body><ns1:someResponse><${member} xsi:type="xsd:string">${payload}</${member}></ns1:someResponse></SOAP-ENV:Body>` +
    '</SOAP-ENV:Envelope>';

  it('unescapes the document ILIAS packs into a string member', () => {
    expect(readEnvelope(wrap('xml', '&lt;Course id="il_1_crs_5"/&gt;'))).toBe(
      '<Course id="il_1_crs_5"/>',
    );
  });

  // The member is named differently per call: getTreeChilds uses object_xml.
  it('accepts the other member names ILIAS uses', () => {
    expect(readEnvelope(wrap('object_xml', '&lt;Objects/&gt;'))).toBe('<Objects/>');
    expect(readEnvelope(wrap('result', '&lt;result/&gt;'))).toBe('<result/>');
  });

  it('raises a fault as a typed error instead of returning a half result', () => {
    const faulted =
      '<SOAP-ENV:Envelope><SOAP-ENV:Body><SOAP-ENV:Fault>' +
      '<faultcode>Server</faultcode><faultstring>err_wrong_login</faultstring>' +
      '</SOAP-ENV:Fault></SOAP-ENV:Body></SOAP-ENV:Envelope>';

    expect(() => readEnvelope(faulted)).toThrowError(IliasError);
    try {
      readEnvelope(faulted);
    } catch (error) {
      expect((error as IliasError).kind).toBe('credentials-rejected');
    }
  });

  it('refuses a response it cannot find a payload in', () => {
    expect(() => readEnvelope('<html>login page</html>')).toThrowError(/does not understand/);
  });
});
