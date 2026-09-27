/**
 * ILIAS exercise XML -> Uni Pilot's ExternalAssignment.
 *
 * An ILIAS "exercise" is a container; the things with deadlines are the
 * `<Assignment>` elements inside it.
 *
 * Known limitation, and it is a real one: `ilExerciseXMLWriter` emits no id and
 * no title for an assignment — only an instruction, a due date and files. So an
 * identity has to be synthesised from the exercise id and the position, which
 * is stable only as long as nobody reorders or deletes an assignment. Anything
 * the app pins to an assignment (a reminder, a note) has to survive that id
 * changing underneath it. Recorded here because it decides data modelling
 * later on.
 */

import type { ExternalAssignment, ExternalAttachment, ExternalOrigin } from '../types';
import { objectUrl } from './endpoints';
import { childText, parseXmlDocument, textOf, toIsoDate } from './xml';

export interface ExerciseMappingContext {
  origin: ExternalOrigin;
  baseUrl: string;
}

export function parseExercise(
  xml: string,
  refId: string,
  context: ExerciseMappingContext,
): ExternalAssignment[] {
  const document = parseXmlDocument(xml);
  const exercise = document.getElementsByTagName('Exercise')[0] ?? null;
  if (!exercise) return [];

  // The exercise title is the only human-readable label available, so a single
  // assignment borrows it and several get it with their position appended.
  const exerciseTitle = childText(exercise, 'Title') ?? 'Exercise';
  const assignments = Array.from(exercise.getElementsByTagName('Assignment'));

  return assignments.map((assignment, index): ExternalAssignment => ({
    origin: context.origin,
    externalId: `${refId}:${index}`,
    parentExternalId: refId,
    title: assignments.length > 1 ? `${exerciseTitle} (${index + 1})` : exerciseTitle,
    instruction: childText(assignment, 'Instruction'),
    dueAt: toIsoDate(childText(assignment, 'DueDate')),
    attachments: readAttachments(assignment),
    url: objectUrl(context.baseUrl, refId, 'exc'),
  }));
}

function readAttachments(assignment: Element): ExternalAttachment[] {
  const files = assignment.getElementsByTagName('Files')[0];
  if (!files) return [];

  return Array.from(files.getElementsByTagName('File')).flatMap((file) => {
    const filename = textOf(file, 'Filename');
    if (!filename) return [];
    const rawSize = file.getAttribute('size');
    const size = rawSize !== null && /^\d+$/.test(rawSize) ? Number(rawSize) : null;
    return [{ filename, size }];
  });
}
