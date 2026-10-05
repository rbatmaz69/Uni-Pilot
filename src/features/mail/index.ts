/**
 * Mail: the university inbox, through Apple Mail on the Mac
 * (`src-tauri/src/apple_mail.rs`). Uni Pilot shows the overview and the text
 * of a message, opens replies as drafts in Mail, and has Mail send a new
 * message once the student confirms it. The newest mail is kept on this Mac,
 * encrypted (`src-tauri/src/mail_cache.rs`), unless turned off in Settings.
 */

export { InboxExperience } from './components/InboxExperience';
export { ComposeDialog } from './components/ComposeDialog';
export { MailSettings } from './components/MailSettings';
export { useMailStore } from './store/mailStore';
export {
  composeInMail,
  launchMail,
  listMailAccounts,
  openInMail,
  readInbox,
  replyInMail,
  sendWithMail,
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
