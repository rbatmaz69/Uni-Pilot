import { describe, expect, it } from 'vitest';
import exerciseXml from './fixtures/exercise.xml?raw';
import { parseExercise } from './parseExercise';
import type { ExerciseMappingContext } from './parseExercise';

const context: ExerciseMappingContext = {
  origin: { provider: 'ilias', installation: 'ilias.hs-heilbronn.de' },
  baseUrl: 'https://ilias.hs-heilbronn.de',
};

describe('parseExercise', () => {
  const assignments = parseExercise(exerciseXml, '4711', context);

  it('returns one entry per assignment, not one per exercise', () => {
    expect(assignments).toHaveLength(2);
  });

  it('converts the unix deadline into an ISO instant', () => {
    expect(assignments[0]?.dueAt).toBe('2024-10-28T00:00:00.000Z');
  });

  it('reads the instruction, which is the only description an assignment has', () => {
    expect(assignments[0]?.instruction).toBe('Blatt 1: Rekursion. Abgabe als PDF.');
  });

  it('keeps the exercise as the parent so the course tree still links up', () => {
    expect(assignments.every((item) => item.parentExternalId === '4711')).toBe(true);
  });

  // ilExerciseXMLWriter emits no id and no title per assignment, so identity
  // has to be synthesised — and it is only stable while the order is.
  it('numbers assignments because ILIAS gives them no identity of their own', () => {
    expect(assignments.map((item) => item.externalId)).toEqual(['4711:0', '4711:1']);
    expect(assignments.map((item) => item.title)).toEqual([
      'Programmieren 2 — Abgaben (1)',
      'Programmieren 2 — Abgaben (2)',
    ]);
  });

  it('borrows the exercise title unnumbered when there is only one assignment', () => {
    const single =
      '<Exercise obj_id="il_1_exc_9"><Title>Hausarbeit</Title>' +
      '<Assignment><Instruction>Thema frei</Instruction><DueDate>1730073600</DueDate></Assignment></Exercise>';
    expect(parseExercise(single, '9', context)[0]?.title).toBe('Hausarbeit');
  });

  it('reads attachments and leaves the size null when ILIAS states none', () => {
    expect(assignments[1]?.attachments).toEqual([
      { filename: 'blatt-02.pdf', size: 203776 },
      { filename: 'vorlage.zip', size: null },
    ]);
  });

  it('points at the exercise, since an assignment has no page of its own', () => {
    expect(assignments[0]?.url).toBe('https://ilias.hs-heilbronn.de/goto.php?target=exc_4711');
  });
});

describe('parseExercise, on incomplete input', () => {
  it('returns nothing for an exercise that holds no assignments yet', () => {
    const empty = '<Exercise obj_id="il_1_exc_9"><Title>Leer</Title></Exercise>';
    expect(parseExercise(empty, '9', context)).toEqual([]);
  });

  it('returns nothing when the document is not an exercise', () => {
    expect(parseExercise('<Course id="il_1_crs_5"/>', '5', context)).toEqual([]);
  });

  it('keeps an assignment that has no deadline', () => {
    const open =
      '<Exercise obj_id="il_1_exc_9"><Title>Offen</Title>' +
      '<Assignment><Instruction>Jederzeit</Instruction><DueDate></DueDate></Assignment></Exercise>';
    const [assignment] = parseExercise(open, '9', context);
    expect(assignment?.dueAt).toBeNull();
    expect(assignment?.instruction).toBe('Jederzeit');
  });
});
