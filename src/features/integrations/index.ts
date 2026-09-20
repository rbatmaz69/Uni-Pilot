/**
 * PROTOTYPE — see ./README.md before building on this.
 *
 * Read models and ILIAS mappers only. There is deliberately no connector,
 * no store and no UI here yet: what a connector may call is still waiting on
 * answers from the university, and this layer is the part that does not
 * change once those answers arrive.
 */

export type {
  ExternalAnnouncement,
  ExternalAssignment,
  ExternalAttachment,
  ExternalCourse,
  ExternalItem,
  ExternalItemKind,
  ExternalOrigin,
  ExternalPeriod,
  ExternalRecord,
  ProviderId,
} from './lib/types';

export {
  calendarSubscriptionUrl,
  layoutForRelease,
  majorRelease,
  normaliseBaseUrl,
  objectUrl,
  privateNewsFeedUrl,
  soapEndpoint,
  soapEndpointCandidates,
  type IliasLayout,
} from './lib/ilias/endpoints';

export {
  IliasError,
  fromHttpStatus,
  fromNetworkFailure,
  fromSoapFault,
  needsUniversityAction,
  type IliasFailureKind,
} from './lib/ilias/errors';

export { buildEnvelope, buildResultSet, readEnvelope } from './lib/ilias/envelope';
export { parseCourse, parseCourseList } from './lib/ilias/parseCourses';
export { isReadable, parseTreeChildren } from './lib/ilias/parseTree';
export { parseExercise } from './lib/ilias/parseExercise';
export { parseNewsFeed } from './lib/ilias/parseFeed';
