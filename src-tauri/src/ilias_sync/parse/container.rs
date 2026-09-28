//! A course's, group's or folder's content tab.
//!
//! ILIAS 9 still draws containers with its older list markup, unlike the
//! membership list: `.ilContainerBlock` (an item group such as "Part 1", or
//! ILIAS's own "Inhalt") holding `.ilObjListRow`s. What HHN showed on
//! 25.09.2026:
//!
//! - Every row names itself and its container in `data-list-item-id`,
//!   `lg_div_<ref_id>_pref_<parent ref_id>`. That is where ids come from.
//! - A folder or exercise title links to `/go/<type>/<ref_id>`, but a file's
//!   title links to its download, `cmd=sendfile`. Opening that counts as
//!   reading the file in ILIAS, so the title link is read for nothing but its
//!   type, and never followed.
//! - The icon is the installation's to change: HHN gives PDFs one of its own,
//!   named nothing like `icon_file.svg`. So the link decides what an item is,
//!   and the icon only speaks where the link does not.
//! - A file lists unlabelled properties in `.il_ItemProperty`: suffix, size,
//!   `Version: N` from the second version on, and the upload date of the
//!   current version. Together they tell a new or replaced file from an old
//!   one without downloading anything.
//! - An empty folder — common once a semester is over — has no block at all.

use chrono::NaiveDate;
use scraper::{ElementRef, Html};
use serde::Serialize;

use super::{css, filled, first, icon_type, is_file_link, link_target, text};
use crate::ilias_sync::dates;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentItem {
    pub ref_id: String,
    pub parent_ref_id: Option<String>,
    /// ILIAS's own word: `fold`, `file`, `exc`, `webr`, `lm`, … `other` when
    /// neither icon nor link says.
    pub provider_type: String,
    pub title: String,
    pub description: Option<String>,
    /// The heading of the block the item sits in: an item group ("Part 1"),
    /// or ILIAS's generic "Inhalt" when the container has none.
    pub block: Option<String>,
    /// Only for files.
    pub file: Option<FileFacts>,
    /// Every property as ILIAS printed it.
    pub properties: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFacts {
    pub suffix: Option<String>,
    /// Bytes, from ILIAS's rounded "49.89 KB" — close, not exact.
    pub size: Option<u64>,
    /// ILIAS prints `Version: N` from 2 on; 1 when it prints none.
    pub version: u32,
    /// When the current version was uploaded, local time.
    pub updated_at: Option<String>,
}

pub fn read_contents(html: &str, today: NaiveDate) -> Result<Vec<ContentItem>, String> {
    let page = Html::parse_document(html);
    if page
        .select(&css(
            ".ilTabsContentOuter, #ilContentContainer, .ilContainerBlock",
        ))
        .next()
        .is_none()
    {
        return Err("ILIAS showed a page that is not the contents of a course or folder.".into());
    }
    Ok(page
        .select(&css(".ilObjListRow"))
        .filter_map(|row| item(row, today))
        .collect())
}

fn item(row: ElementRef<'_>, today: NaiveDate) -> Option<ContentItem> {
    let named = first(row, ".ilContainerListItemOuter")
        .and_then(|outer| {
            outer
                .value()
                .attr("data-list-item-id")
                .or(outer.value().attr("id"))
        })
        .and_then(list_item_ids);
    let title_link = first(row, "a.il_ContainerItemTitle");
    let href = title_link.and_then(|link| link.value().attr("href"));
    let linked = href.and_then(link_target);

    let (ref_id, parent_ref_id) = match (named, &linked) {
        (Some(ids), _) => ids,
        (None, Some((_, id))) => (id.clone(), None),
        (None, None) => return None,
    };
    let provider_type = linked
        .and_then(|(kind, _)| kind)
        .or_else(|| {
            href.filter(|href| is_file_link(href))
                .map(|_| "file".to_string())
        })
        .or_else(|| first(row, "img.ilListItemIcon").and_then(icon_type))
        .unwrap_or_else(|| "other".to_string());

    let title = title_link
        .or_else(|| first(row, "h3.il_ContainerItemTitle"))
        .map(text)
        .unwrap_or_default();
    let properties: Vec<String> = row
        .select(&css(".il_ItemProperty"))
        .map(text)
        .filter(|property| !property.is_empty())
        .collect();
    let file = (provider_type == "file").then(|| file_facts(&properties, today));

    Some(ContentItem {
        ref_id,
        parent_ref_id,
        provider_type,
        title,
        description: first(row, ".il_Description").map(text).and_then(filled),
        block: block(row),
        file,
        properties,
    })
}

/// `lg_div_967852_pref_967851` → (`967852`, `967851`).
fn list_item_ids(value: &str) -> Option<(String, Option<String>)> {
    let rest = value.strip_prefix("lg_div_")?;
    let (id, parent) = rest.split_once("_pref_")?;
    let digits = |value: &str| !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit());
    digits(id).then(|| (id.to_string(), digits(parent).then(|| parent.to_string())))
}

fn block(row: ElementRef<'_>) -> Option<String> {
    let container = row
        .ancestors()
        .filter_map(ElementRef::wrap)
        .find(|element| {
            element
                .value()
                .classes()
                .any(|class| class == "ilContainerBlock")
        })?;
    first(
        container,
        ".ilContainerBlockHeader h2, .ilContainerBlockHeader h3",
    )
    .map(text)
    .and_then(filled)
}

fn file_facts(properties: &[String], today: NaiveDate) -> FileFacts {
    let mut facts = FileFacts {
        suffix: None,
        size: None,
        version: 1,
        updated_at: None,
    };
    for property in properties {
        if let Some(version) = property
            .strip_prefix("Version:")
            .and_then(|number| number.trim().parse().ok())
        {
            facts.version = version;
        } else if let Some(bytes) = size(property) {
            facts.size.get_or_insert(bytes);
        } else if let Some(at) = dates::parse(property, today) {
            facts.updated_at.get_or_insert(at);
        } else if facts.suffix.is_none() && is_suffix(property) {
            facts.suffix = Some(property.to_lowercase());
        }
    }
    facts
}

/// `49.89 KB` → 51087. ILIAS counts in 1024s and rounds to two places.
fn size(text: &str) -> Option<u64> {
    let (number, unit) = text.rsplit_once(' ')?;
    let factor = match unit.to_ascii_lowercase().as_str() {
        "b" | "byte" | "bytes" => 1.0,
        "kb" | "kib" => 1024.0,
        "mb" | "mib" => 1024.0 * 1024.0,
        "gb" | "gib" => 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };
    let value: f64 = number.replace(',', ".").parse().ok()?;
    (value.is_finite() && value >= 0.0).then(|| (value * factor).round() as u64)
}

fn is_suffix(text: &str) -> bool {
    (1..=10).contains(&text.len()) && text.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::{read_contents, size, FileFacts};
    use chrono::NaiveDate;

    const COURSE: &str = include_str!("../fixtures/course.html");
    const FOLDER: &str = include_str!("../fixtures/folder.html");

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 9, 25).unwrap()
    }

    #[test]
    fn lists_a_course_by_item_group() {
        let items = read_contents(COURSE, today()).unwrap();
        let listed: Vec<(&str, &str, &str, Option<&str>)> = items
            .iter()
            .map(|item| {
                (
                    item.ref_id.as_str(),
                    item.provider_type.as_str(),
                    item.title.as_str(),
                    item.block.as_deref(),
                )
            })
            .collect();
        assert_eq!(
            listed,
            [
                ("100110", "fold", "Aufgaben", Some("Part 1")),
                ("100120", "fold", "Folien", Some("Part 1")),
                (
                    "100130",
                    "exc",
                    "Abgabe der Projektaufgabe WS 2025",
                    Some("Part 2")
                ),
            ]
        );
        assert!(items
            .iter()
            .all(|item| item.parent_ref_id.as_deref() == Some("100100")));
        assert!(items.iter().all(|item| item.file.is_none()));
    }

    #[test]
    fn keeps_a_description_only_where_there_is_one() {
        let items = read_contents(COURSE, today()).unwrap();
        assert_eq!(
            items[0].description.as_deref(),
            Some("Übungsblätter zur Vorlesung")
        );
        assert_eq!(items[1].description, None);
    }

    /// Nothing the reader returns points at the leave link in the tabs.
    #[test]
    fn hands_on_no_account_action() {
        let items = read_contents(COURSE, today()).unwrap();
        let json = serde_json::to_string(&items).unwrap();
        for action in [
            "unsubscribe",
            "leave",
            "download",
            "addToDesk",
            "sendfile",
            "rtoken",
        ] {
            assert!(!json.contains(action), "{action}");
        }
    }

    #[test]
    fn reads_what_changes_when_a_file_is_replaced() {
        let items = read_contents(FOLDER, today()).unwrap();
        assert_eq!(items[0].ref_id, "100121");
        assert_eq!(items[0].parent_ref_id.as_deref(), Some("100120"));
        assert_eq!(items[0].provider_type, "file");
        assert_eq!(items[0].title, "Beispiel_DB");
        assert_eq!(
            items[0].file,
            Some(FileFacts {
                suffix: Some("backup".into()),
                size: Some(51087),
                version: 3,
                updated_at: Some("2025-09-15T08:41".into()),
            })
        );
        assert_eq!(
            items[0].properties,
            ["backup", "49.89 KB", "Version: 3", "15. Sep 2025, 08:41"]
        );
    }

    #[test]
    fn reads_a_first_version_uploaded_yesterday() {
        let items = read_contents(FOLDER, today()).unwrap();
        assert_eq!(
            items[1].file,
            Some(FileFacts {
                suffix: Some("pdf".into()),
                size: Some(2516582),
                version: 1,
                updated_at: Some("2026-09-24T17:05".into()),
            })
        );
    }

    /// HHN gives PDFs an icon of its own; that must not make them unknown.
    #[test]
    fn knows_a_file_whose_icon_the_installation_replaced() {
        let items = read_contents(FOLDER, today()).unwrap();
        let pdf = &items[2];
        assert_eq!(pdf.provider_type, "file");
        assert_eq!(
            pdf.file,
            Some(FileFacts {
                suffix: Some("pdf".into()),
                size: Some(767785),
                version: 1,
                updated_at: Some("2026-04-09T21:04".into()),
            })
        );
    }

    /// "Folien" in a finished course at HHN: the tabs, and nothing under them.
    #[test]
    fn reads_an_empty_folder_as_empty() {
        let html =
            r#"<main><div class="ilTabsContentOuter"><div class="clearfix"></div></div></main>"#;
        assert_eq!(read_contents(html, today()), Ok(vec![]));
    }

    #[test]
    fn refuses_a_page_that_is_no_container() {
        assert!(read_contents("<main><h1>Fehler</h1></main>", today()).is_err());
    }

    #[test]
    fn reads_sizes_as_ilias_writes_them() {
        assert_eq!(size("812 Bytes"), Some(812));
        assert_eq!(size("49.89 KB"), Some(51087));
        assert_eq!(size("49,89 KB"), Some(51087));
        assert_eq!(size("1.5 GB"), Some(1610612736));
        assert_eq!(size("Version: 3"), None);
        assert_eq!(size("15. Sep 2025, 08:41"), None);
    }
}
