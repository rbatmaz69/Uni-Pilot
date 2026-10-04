/**
 * Signing in to ILIAS automatically, opt-in: the student stores their HHN
 * password and an authenticator of Uni Pilot's own in Settings, and when ILIAS
 * asks for a sign-in, Rust signs in for them. No face yet — that is
 * `docs/face-unlock-plan.md`, Phases 4–5.
 */

export { AutoSignInSettings } from './components/AutoSignInSettings';
export { CredentialsDialog } from './components/CredentialsDialog';
export { useAutoSignInStore, type KnownSignIn, type SignInResult } from './store/autoSignInStore';
export { installationHost } from './lib/autoSignIn';
