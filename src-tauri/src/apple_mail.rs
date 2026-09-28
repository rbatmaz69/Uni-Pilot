//! The university mailbox, through Apple Mail on the Mac.
//!
//! HHN's student mail is Microsoft 365, and Exchange Online takes no password
//! from an app: only OAuth, with an app registration of its own that the
//! university may have to approve. Apple Mail already has that — Apple's app is
//! registered, HHN allows it, and the student signed in there with password
//! and authenticator code. So Uni Pilot asks Mail, on this Mac, and never talks
//! to Microsoft at all: no password, no token, nothing leaves the computer.
//!
//! macOS asks the student once whether Uni Pilot may control Mail ("Automation"
//! in Privacy & Security). The script Mail is asked with is `apple_mail.js`;
//! its rules hold for every command here:
//!
//! - **What the Inbox shows, nothing more.** The overview with a one-line
//!   preview for the newest messages, and the text of the one message the
//!   student opened — read on this Mac, held in memory, never stored or sent
//!   anywhere. Listing marks nothing read; `mail_mark_read` does, when the
//!   student opened a message or asked.
//! - **Drafts only.** Compose and reply open a window in Mail; the student
//!   sends. Nothing here sends a message, and the script has no way to.
//!
//! On Windows and Linux every command answers `unsupported`.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[cfg(target_os = "macos")]
const SCRIPT: &str = include_str!("apple_mail.js");

/// Most messages the inbox asks for; enough for a glance, quick to read.
const INBOX_LIMIT: u32 = 50;
/// Most messages one `mail_previews` asks for.
const PREVIEWS_MAX: usize = 50;
/// How long Mail gets for one answer before the page hears it did not come.
#[cfg(target_os = "macos")]
const ASK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(45);
const RECIPIENTS_MAX: usize = 20;
const SUBJECT_MAX: usize = 300;
const BODY_MAX: usize = 50_000;
/// A reply typed in Uni Pilot, handed to Mail's reply window.
const REPLY_MAX: usize = 20_000;
/// RFC 5322's line limit, which a Message-ID has to fit in.
const MESSAGE_ID_MAX: usize = 998;

/// What went wrong, for the page to explain: `notAllowed` points at the
/// Automation setting, `notRunning` offers to open Mail.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum MailError {
    /// Not a Mac.
    #[cfg_attr(target_os = "macos", allow(dead_code))]
    Unsupported,
    /// Mail is not open, and Uni Pilot does not start it unasked.
    NotRunning,
    /// The student has not allowed Uni Pilot to control Mail.
    NotAllowed,
    /// No account of that name in Mail.
    NoAccount,
    /// That message is no longer in the inbox.
    NoMessage,
    /// Something the page should not have sent.
    Invalid(String),
    Failed(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailAccount {
    pub name: String,
    pub addresses: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailMessage {
    /// The Message-ID, without angle brackets.
    pub id: String,
    /// Mail's own number for the message, which finds it again in one step.
    #[serde(default)]
    pub mail_id: Option<u64>,
    pub subject: String,
    /// As Mail gives it: `Name <address>` or just the address.
    pub sender: String,
    /// ISO 8601, UTC.
    pub received_at: Option<String>,
    pub read: bool,
    /// The start of the text, one line, for the list.
    #[serde(default)]
    pub snippet: String,
    /// How many files are attached.
    #[serde(default)]
    pub attachments: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailAttachment {
    pub name: String,
    /// Bytes, when Mail knows them.
    pub size: Option<u64>,
}

/// The message the student opened: its text and what came with it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailBody {
    pub id: String,
    pub subject: String,
    pub sender: String,
    #[serde(default)]
    pub to: Vec<String>,
    #[serde(default)]
    pub cc: Vec<String>,
    pub received_at: Option<String>,
    pub read: bool,
    /// Plain text, as Mail gives it.
    pub content: String,
    #[serde(default)]
    pub attachments: Vec<MailAttachment>,
}

/// The start of a message's text and how many files it carries, for the list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailPreview {
    pub snippet: String,
    pub attachments: u32,
}

/// Which message the page means: its Message-ID, and Mail's own number for it
/// when the list had one. The number finds the message at once; the
/// Message-ID confirms it, and is searched for when the number is gone.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRef {
    pub id: String,
    #[serde(default)]
    pub mail_id: Option<u64>,
}

/// A new message for Mail to open, never to send.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    /// The address to send from — the university one, not Mail's default.
    pub from: Option<String>,
    pub to: Vec<String>,
    pub subject: String,
    pub body: String,
}

/// Reads what osascript answered: its exit, its output, its complaints.
fn read_answer(success: bool, stdout: &str, stderr: &str) -> Result<Value, MailError> {
    if !success {
        // -1743: the student said no, or has not been asked yet in a way that
        // stuck. -600: Mail quit between the check and the question.
        return Err(
            if stderr.contains("-1743") || stderr.contains("Not authorized") {
                MailError::NotAllowed
            } else if stderr.contains("-600") {
                MailError::NotRunning
            } else {
                MailError::Failed(
                    stderr
                        .lines()
                        .find(|line| !line.trim().is_empty())
                        .unwrap_or("Apple Mail did not answer.")
                        .trim()
                        .to_string(),
                )
            },
        );
    }
    let answer: Value = serde_json::from_str(stdout.trim())
        .map_err(|_| MailError::Failed("Apple Mail answered something unreadable.".into()))?;
    match answer.get("error").and_then(Value::as_str) {
        None => Ok(answer),
        Some("notRunning") => Err(MailError::NotRunning),
        Some("noAccount") => Err(MailError::NoAccount),
        Some("noMessage") => Err(MailError::NoMessage),
        Some(other) => Err(MailError::Failed(format!("Apple Mail said: {other}"))),
    }
}

/// Asks Mail through osascript. The input travels as an argument, as JSON —
/// never spliced into the script.
#[cfg(target_os = "macos")]
async fn ask(command: &'static str, input: Value) -> Result<Value, MailError> {
    let input = input.to_string();
    let answer = tauri::async_runtime::spawn_blocking(move || run_script(command, &input))
        .await
        .map_err(|error| MailError::Failed(error.to_string()))?
        .map_err(|error| MailError::Failed(format!("Apple Mail could not be asked: {error}")))?;
    let Some((success, stdout, stderr)) = answer else {
        return Err(MailError::Failed(format!(
            "Apple Mail did not answer within {} seconds. A large mailbox can take a while the first time; try again in a moment.",
            ASK_TIMEOUT.as_secs()
        )));
    };
    read_answer(success, &stdout, &stderr)
}

/// Runs the script, giving up after `ASK_TIMEOUT`: Mail can take its time over
/// a large Exchange mailbox, and a page must not wait for ever. The output is
/// read while the script runs — a long message would otherwise fill the pipe
/// and stall it. `None` when it ran out of time.
#[cfg(target_os = "macos")]
fn run_script(command: &str, input: &str) -> std::io::Result<Option<(bool, String, String)>> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    let mut child = Command::new("osascript")
        .args(["-l", "JavaScript", "-e", SCRIPT, command, input])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let drain = |pipe: Option<Box<dyn Read + Send>>| {
        std::thread::spawn(move || {
            let mut text = String::new();
            if let Some(mut pipe) = pipe {
                let _ = pipe.read_to_string(&mut text);
            }
            text
        })
    };
    let stdout = drain(
        child
            .stdout
            .take()
            .map(|pipe| Box::new(pipe) as Box<dyn Read + Send>),
    );
    let stderr = drain(
        child
            .stderr
            .take()
            .map(|pipe| Box::new(pipe) as Box<dyn Read + Send>),
    );

    let deadline = Instant::now() + ASK_TIMEOUT;
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break Some(status);
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        std::thread::sleep(Duration::from_millis(40));
    };
    let stdout = stdout.join().unwrap_or_default();
    let stderr = stderr.join().unwrap_or_default();
    Ok(status.map(|status| (status.success(), stdout, stderr)))
}

#[cfg(not(target_os = "macos"))]
async fn ask(_command: &'static str, _input: Value) -> Result<Value, MailError> {
    Err(MailError::Unsupported)
}

fn field<T: serde::de::DeserializeOwned>(answer: Value, key: &str) -> Result<T, MailError> {
    answer
        .get(key)
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
        .ok_or_else(|| MailError::Failed("Apple Mail answered something unreadable.".into()))
}

fn is_message_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= MESSAGE_ID_MAX && !value.chars().any(char::is_control)
}

/// The message as the script takes it: `account`, `id` and `mailId` side by side.
fn message_input(account: &str, message: &MessageRef) -> Result<Value, MailError> {
    if !is_message_id(&message.id) {
        return Err(MailError::Invalid("That is not a message.".into()));
    }
    Ok(serde_json::json!({ "account": account, "id": message.id, "mailId": message.mail_id }))
}

fn is_address(value: &str) -> bool {
    let value = value.trim();
    value.len() <= 254
        && value.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty() && domain.contains('.') && !domain.starts_with('.')
        })
        && !value
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || "<>,;\"".contains(c))
}

/// Checks a draft before Mail sees it. Mail would take almost anything; the
/// student should not find a broken draft.
fn check_draft(draft: &Draft) -> Result<(), MailError> {
    if draft.to.len() > RECIPIENTS_MAX {
        return Err(MailError::Invalid(
            "That is too many recipients for one message.".into(),
        ));
    }
    if let Some(bad) = draft
        .to
        .iter()
        .chain(draft.from.iter())
        .find(|a| !is_address(a))
    {
        return Err(MailError::Invalid(format!(
            "\"{bad}\" is not an email address."
        )));
    }
    if draft.subject.chars().count() > SUBJECT_MAX || draft.subject.contains(['\r', '\n']) {
        return Err(MailError::Invalid(
            "The subject has to be one short line.".into(),
        ));
    }
    if draft.body.chars().count() > BODY_MAX {
        return Err(MailError::Invalid(
            "The message is too long for a draft.".into(),
        ));
    }
    Ok(())
}

/// `message://%3c…%3e`, which opens that message in Mail.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn message_url(id: &str) -> String {
    let mut encoded = String::new();
    for byte in id.trim_matches(['<', '>']).bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~@".contains(&byte) {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    format!("message://%3C{encoded}%3E")
}

/// The accounts set up in Mail, so the page can find the university's.
#[tauri::command]
pub async fn mail_accounts() -> Result<Vec<MailAccount>, MailError> {
    field(ask("accounts", Value::Null).await?, "accounts")
}

/// The newest messages in an account's inbox — the overview, never a body.
#[tauri::command]
pub async fn mail_inbox(account: String) -> Result<Vec<MailMessage>, MailError> {
    let input = serde_json::json!({ "account": account, "limit": INBOX_LIMIT });
    field(ask("inbox", input).await?, "messages")
}

/// Opens a message in Mail, which marks it read as reading it there would.
#[tauri::command]
pub async fn mail_open(id: String) -> Result<(), MailError> {
    if !is_message_id(&id) {
        return Err(MailError::Invalid("That is not a message.".into()));
    }
    #[cfg(target_os = "macos")]
    return crate::ilias_browser::open_with_system(message_url(&id)).map_err(MailError::Failed);
    #[cfg(not(target_os = "macos"))]
    return Err(MailError::Unsupported);
}

/// Opens Mail, when the page found it closed and the student asked.
#[tauri::command]
pub async fn mail_launch() -> Result<(), MailError> {
    #[cfg(target_os = "macos")]
    return std::process::Command::new("open")
        .args(["-a", "Mail"])
        .status()
        .map_err(|error| MailError::Failed(error.to_string()))
        .map(|_| ());
    #[cfg(not(target_os = "macos"))]
    return Err(MailError::Unsupported);
}

/// Previews for messages already listed, by Message-ID. Mail fetches an
/// Exchange message's text when asked, so this runs against a time budget and
/// answers with those it got.
#[tauri::command]
pub async fn mail_previews(
    account: String,
    messages: Vec<MessageRef>,
) -> Result<std::collections::HashMap<String, MailPreview>, MailError> {
    if messages.len() > PREVIEWS_MAX || !messages.iter().all(|m| is_message_id(&m.id)) {
        return Err(MailError::Invalid("Those are not messages.".into()));
    }
    field(
        ask(
            "previews",
            serde_json::json!({ "account": account, "messages": messages }),
        )
        .await?,
        "previews",
    )
}

/// The text of the message the student opened, and its attachments.
#[tauri::command]
pub async fn mail_message(account: String, message: MessageRef) -> Result<MailBody, MailError> {
    let input = message_input(&account, &message)?;
    field(ask("message", input).await?, "message")
}

/// Marks a message read or unread in Mail — when the student opened it here,
/// or asked.
#[tauri::command]
pub async fn mail_mark_read(
    account: String,
    message: MessageRef,
    read: bool,
) -> Result<(), MailError> {
    let mut input = message_input(&account, &message)?;
    input["read"] = Value::Bool(read);
    ask("markRead", input).await.map(|_| ())
}

/// Opens a reply to a message in Mail, with the student's text above the
/// quote where Mail takes it. Answers whether the text went in; the student
/// sends.
#[tauri::command]
pub async fn mail_reply(
    account: String,
    message: MessageRef,
    text: Option<String>,
) -> Result<bool, MailError> {
    let mut input = message_input(&account, &message)?;
    if text
        .as_deref()
        .is_some_and(|text| text.chars().count() > REPLY_MAX)
    {
        return Err(MailError::Invalid(
            "The reply is too long for a draft.".into(),
        ));
    }
    input["text"] = serde_json::json!(text);
    let answer = ask("reply", input).await?;
    Ok(answer
        .get("placed")
        .and_then(Value::as_bool)
        .unwrap_or(false))
}

/// Opens a new message in Mail, filled in. The student sends it.
#[tauri::command]
pub async fn mail_compose(draft: Draft) -> Result<(), MailError> {
    check_draft(&draft)?;
    let input = serde_json::json!({
        "from": draft.from,
        "to": draft.to.iter().map(|address| address.trim()).collect::<Vec<_>>(),
        "subject": draft.subject,
        "body": draft.body,
    });
    ask("compose", input).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::{
        check_draft, message_input, message_url, read_answer, Draft, MailBody, MailError,
        MailMessage, MailPreview, MessageRef,
    };

    fn draft(to: &[&str]) -> Draft {
        Draft {
            from: Some("student@stud.hs-heilbronn.de".into()),
            to: to.iter().map(|a| a.to_string()).collect(),
            subject: "Datenbanken 1 – Blatt 4".into(),
            body: "Guten Tag,\n\nich habe eine Frage.".into(),
        }
    }

    #[test]
    fn reads_the_inbox_mail_answered() {
        let answer = read_answer(
            true,
            r#"{"messages":[{"id":"abc@hs-heilbronn.de","subject":"Blatt 4","sender":"Prof. Beispiel <prof@hs-heilbronn.de>","receivedAt":"2026-09-25T09:12:00.000Z","read":false}]}"#,
            "",
        )
        .unwrap();
        let messages: Vec<MailMessage> =
            serde_json::from_value(answer["messages"].clone()).unwrap();
        assert_eq!(messages[0].subject, "Blatt 4");
        assert!(!messages[0].read);
        assert_eq!(messages[0].mail_id, None);
    }

    /// Mail's own number comes with each listed message, and goes back with it.
    #[test]
    fn carries_mails_own_number_for_a_message() {
        let answer = read_answer(
            true,
            r#"{"messages":[{"id":"a@b.de","mailId":48213,"subject":"x","sender":"y","receivedAt":null,"read":true}]}"#,
            "",
        )
        .unwrap();
        let messages: Vec<MailMessage> =
            serde_json::from_value(answer["messages"].clone()).unwrap();
        assert_eq!(messages[0].mail_id, Some(48213));
        assert_eq!(serde_json::to_value(&messages[0]).unwrap()["mailId"], 48213);

        let asked: MessageRef = serde_json::from_str(r#"{"id":"a@b.de","mailId":48213}"#).unwrap();
        assert_eq!(
            message_input("HHN", &asked).unwrap(),
            serde_json::json!({ "account": "HHN", "id": "a@b.de", "mailId": 48213 })
        );
        let without: MessageRef = serde_json::from_str(r#"{"id":"a@b.de","mailId":null}"#).unwrap();
        assert_eq!(
            message_input("HHN", &without).unwrap()["mailId"],
            serde_json::Value::Null
        );
    }

    #[test]
    fn refuses_a_message_that_is_not_one() {
        for id in ["", "a\nb@c.de"] {
            let message = MessageRef {
                id: id.into(),
                mail_id: Some(1),
            };
            assert!(matches!(
                message_input("HHN", &message),
                Err(MailError::Invalid(_))
            ));
        }
    }

    /// An older answer without a preview still reads.
    #[test]
    fn reads_a_list_without_previews() {
        let answer = read_answer(
            true,
            r#"{"messages":[{"id":"a@b.de","subject":"x","sender":"y","receivedAt":null,"read":true}]}"#,
            "",
        )
        .unwrap();
        let messages: Vec<MailMessage> =
            serde_json::from_value(answer["messages"].clone()).unwrap();
        assert_eq!(messages[0].snippet, "");
        assert_eq!(messages[0].attachments, 0);
    }

    #[test]
    fn reads_previews_by_message() {
        let answer = read_answer(
            true,
            r#"{"previews":{"a@b.de":{"snippet":"Guten Tag,","attachments":1}}}"#,
            "",
        )
        .unwrap();
        let previews: std::collections::HashMap<String, MailPreview> =
            serde_json::from_value(answer["previews"].clone()).unwrap();
        assert_eq!(previews["a@b.de"].snippet, "Guten Tag,");
        assert_eq!(previews["a@b.de"].attachments, 1);
    }

    #[test]
    fn reads_an_opened_message_with_its_attachments() {
        let answer = read_answer(
            true,
            r#"{"message":{"id":"a@b.de","subject":"Blatt 4","sender":"Prof <p@hs-heilbronn.de>","to":["s@stud.hs-heilbronn.de"],"cc":[],"receivedAt":"2026-09-25T09:12:00.000Z","read":false,"content":"Guten Tag,\n\nanbei Blatt 4.","attachments":[{"name":"Blatt4.pdf","size":81234},{"name":"daten.csv","size":null}]}}"#,
            "",
        )
        .unwrap();
        let body: MailBody = serde_json::from_value(answer["message"].clone()).unwrap();
        assert_eq!(body.content, "Guten Tag,\n\nanbei Blatt 4.");
        assert_eq!(body.attachments.len(), 2);
        assert_eq!(body.attachments[1].size, None);
    }

    #[test]
    fn tells_a_refusal_from_a_closed_mail_and_a_failure() {
        let refused = "execution error: Not authorized to send Apple events to Mail. (-1743)";
        assert_eq!(read_answer(false, "", refused), Err(MailError::NotAllowed));
        assert_eq!(
            read_answer(
                false,
                "",
                "execution error: Application isn't running. (-600)"
            ),
            Err(MailError::NotRunning)
        );
        assert_eq!(
            read_answer(true, r#"{"error":"notRunning"}"#, ""),
            Err(MailError::NotRunning)
        );
        assert_eq!(
            read_answer(true, r#"{"error":"noAccount"}"#, ""),
            Err(MailError::NoAccount)
        );
        assert!(matches!(
            read_answer(true, "not json", ""),
            Err(MailError::Failed(_))
        ));
    }

    #[test]
    fn opens_a_message_by_its_id() {
        assert_eq!(
            message_url("<ABC.123+x@mail.example>"),
            "message://%3CABC.123%2Bx@mail.example%3E"
        );
        assert_eq!(message_url("a b"), "message://%3Ca%20b%3E");
    }

    #[test]
    fn takes_a_sensible_draft() {
        assert_eq!(check_draft(&draft(&["prof@hs-heilbronn.de"])), Ok(()));
        assert_eq!(check_draft(&draft(&[])), Ok(()));
    }

    #[test]
    fn refuses_what_mail_should_not_get() {
        for bad in [
            "not an address",
            "a@b",
            "x@y.de, z@y.de",
            "<x@y.de>",
            "@y.de",
        ] {
            assert!(check_draft(&draft(&[bad])).is_err(), "{bad}");
        }
        let mut two_lines = draft(&["prof@hs-heilbronn.de"]);
        two_lines.subject = "Frage\nBcc: alle@hs-heilbronn.de".into();
        assert!(check_draft(&two_lines).is_err());
        let many: Vec<String> = (0..21).map(|n| format!("p{n}@hs-heilbronn.de")).collect();
        let crowded = Draft {
            to: many,
            ..draft(&[])
        };
        assert!(check_draft(&crowded).is_err());
    }
}
