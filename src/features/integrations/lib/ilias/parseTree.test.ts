import { describe, expect, it } from 'vitest';
import liveTreeXml from './fixtures/tree-childs.xml?raw';
import { isReadable, parseTreeChildren } from './parseTree';
import type { TreeMappingContext } from './parseTree';

const context: TreeMappingContext = {
  origin: { provider: 'ilias', installation: 'demo.ilias.de' },
  baseUrl: 'https://demo.ilias.de',
};

/**
 * `tree-childs.xml` was captured from demo.ilias.de (ILIAS 10.11) on
 * 2026-09-20 — a real getTreeChilds answer, not a hand-written sample.
 */
describe('parseTreeChildren, against the captured response', () => {
  const items = parseTreeChildren(liveTreeXml, context);

  it('reads every object that carries a reference id', () => {
    expect(items).toHaveLength(23);
  });

  it('keeps the reference id as the identity, not the object id', () => {
    const course = items.find((item) => item.providerType === 'crs');
    // obj_id for this course is 5584; ref_id 717 is what every later call needs.
    expect(course?.externalId).toBe('717');
    expect(course?.title).toBe('Ordner');
  });

  it('records the parent so a tree can be rebuilt without re-fetching', () => {
    expect(items.every((item) => item.parentExternalId === '279')).toBe(true);
  });

  it('maps ILIAS types onto the shapes the UI knows', () => {
    const kinds = new Set(items.map((item) => item.kind));
    expect(kinds).toContain('folder');
    expect(kinds).toContain('course');
  });

  it('keeps the provider type so nothing is lost in the mapping', () => {
    expect(items.map((item) => item.providerType)).toContain('itgr');
  });

  it('carries the permissions ILIAS reports per object', () => {
    const first = items[0];
    expect(first?.permissions).toEqual(['visible', 'read']);
    expect(isReadable(first!)).toBe(true);
  });

  it('turns the server-local timestamp into an ISO instant', () => {
    expect(items[0]?.updatedAt).toBe('2025-01-30T15:26:17.000Z');
  });

  it('builds a deep link for the fallback of opening the object in ILIAS', () => {
    expect(items.find((item) => item.providerType === 'crs')?.url).toBe(
      'https://demo.ilias.de/goto.php?target=crs_717',
    );
  });
});

describe('parseTreeChildren, on incomplete input', () => {
  it('returns nothing for an empty repository rather than throwing', () => {
    expect(parseTreeChildren('<Objects></Objects>', context)).toEqual([]);
  });

  it('drops an object with no reference id, since nothing could be asked of it', () => {
    const xml = '<Objects><Object type="file" obj_id="1"><Title>Orphan</Title></Object></Objects>';
    expect(parseTreeChildren(xml, context)).toEqual([]);
  });

  it('falls back to a placeholder title rather than showing an empty row', () => {
    const xml =
      '<Objects><Object type="file" obj_id="1"><References ref_id="9" parent_id="1"/></Object></Objects>';
    expect(parseTreeChildren(xml, context)[0]?.title).toBe('Untitled');
  });

  it('classifies an unknown ILIAS type as other instead of guessing', () => {
    const xml =
      '<Objects><Object type="poll" obj_id="1"><Title>Poll</Title><References ref_id="9" parent_id="1"/></Object></Objects>';
    const [item] = parseTreeChildren(xml, context);
    expect(item?.kind).toBe('other');
    expect(item?.providerType).toBe('poll');
  });

  it('reports an object with no read operation as not readable', () => {
    const xml =
      '<Objects><Object type="file" obj_id="1"><Title>Hidden</Title>' +
      '<References ref_id="9" parent_id="1" accessInfo="granted"><Operation>visible</Operation></References>' +
      '</Object></Objects>';
    expect(isReadable(parseTreeChildren(xml, context)[0]!)).toBe(false);
  });

  it('rejects a document that is not XML', () => {
    expect(() => parseTreeChildren('<html><body>login', context)).toThrowError(/not valid XML/);
  });
});
