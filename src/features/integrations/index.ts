/**
 * ILIAS inside Uni Pilot.
 *
 * Two layers with different maturity. The ILIAS window — the page, its store
 * and `openIlias` — is what students use today: it opens ILIAS in a window of
 * the app's own. The read models, mappers and SOAP connector underneath are
 * still a PROTOTYPE, waiting on the university to open an interface; see
 * ./README.md before building on those.
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
  dashboardUrl,
  layoutForRelease,
  majorRelease,
  normaliseBaseUrl,
  objectUrl,
  privateNewsFeedUrl,
  resolveIliasTarget,
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

export {
  closeSession,
  discoverInstallation,
  fetchAnnouncements,
  fetchAssignments,
  fetchCalendarFeed,
  fetchContents,
  fetchCourse,
  fetchCourses,
  openSession,
  originOf,
  toConnection,
  verifySession,
  type IliasConnection,
  type IliasCredentials,
  type IliasInstallation,
  type IliasSession,
  type IliasSignIn,
  type SoapAvailability,
} from './lib/ilias/connection';

export {
  KNOWN_INSTALLATIONS,
  knownInstallationFor,
  type KnownInstallation,
} from './lib/ilias/knownInstallations';

export { belongsToIlias, canOpenIliasWindow, openIlias } from './lib/iliasWindow';
export { useIliasStore } from './store/iliasStore';
export { IliasWorkspace } from './components/IliasWorkspace';
export { OpenInIliasButton } from './components/OpenInIliasButton';

export {
  basicAuthHeader,
  httpTransport,
  type HttpRequest,
  type HttpResponse,
  type Transport,
} from './lib/ilias/transport';
export { parseCourse, parseCourseList } from './lib/ilias/parseCourses';
export { isReadable, parseTreeChildren } from './lib/ilias/parseTree';
export { parseExercise } from './lib/ilias/parseExercise';
export { parseNewsFeed } from './lib/ilias/parseFeed';
