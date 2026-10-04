/**
 * Signing in to ILIAS automatically, opt-in: the student stores their HHN
 * password and an authenticator of Uni Pilot's own in Settings, and when ILIAS
 * asks for a sign-in, Rust signs in for them — at a click, or behind a look
 * into the camera once a face is set up (`docs/face-unlock-plan.md`).
 */

export { AutoSignInSettings } from './components/AutoSignInSettings';
export { CredentialsDialog } from './components/CredentialsDialog';
export { FaceUnlockBar } from './components/FaceUnlockBar';
export { useFaceBar } from './components/useFaceBar';
export { useAutoSignInStore, type KnownSignIn, type SignInResult } from './store/autoSignInStore';
export { installationHost } from './lib/autoSignIn';
