/**
 * Mail: the university inbox, through Apple Mail on the Mac
 * (`src-tauri/src/apple_mail.rs`). Uni Pilot shows the overview and opens
 * drafts in Mail; it never reads bodies and never sends.
 */

export { InboxExperience } from './components/InboxExperience';
export { ComposeDialog } from './components/ComposeDialog';
export { useMailStore } from './store/mailStore';
export {
  composeInMail,
  launchMail,
  listMailAccounts,
  openInMail,
  readInbox,
  replyInMail,
  toMailFailure,
  type MailAccount,
  type MailDraft,
  type MailFailure,
  type MailFailureKind,
  type MailMessage,
  type MessageRef,
} from './lib/appleMail';
export {
  formatReceived,
  parseSender,
  universityAccount,
  universityAddress,
  universityDomain,
} from './lib/mail';
