//! Readers: an ILIAS page in, plain data out.
//!
//! No network, no clock: the day the page was read comes in as an argument, so
//! a reader runs against a recorded page in a test exactly as against a live
//! one. The recordings are in `../fixtures/`.
//!
//! A page a reader does not recognise is an error, never an empty list. An
//! empty list says "nothing there"; after an ILIAS upgrade that changed the
//! markup it would be a lie nobody notices
//! (`docs/integrations/ilias-sync-research.md` §4.3).
//!
//! Readers never hand on a link they found. Ids come out, and the sync builds
//! its own addresses from them (`../links.rs`).

mod container;
mod exercise;
mod memberships;

pub use container::{read_contents, ContentItem};
pub use exercise::{read_assignments, Assignment};
pub use memberships::{read_memberships, Course};

use scraper::{ElementRef, Selector};
use serde::Serialize;

/// A property as ILIAS lists it, for what no field covers.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Property {
    pub name: String,
    pub value: String,
}

/// Start and end, each `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` in local time.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Period {
    pub start: Option<String>,
    pub end: Option<String>,
}

/// A selector written in this module. The tests run every one of them, so a
/// typo fails there rather than on a student's computer.
fn css(selector: &str) -> Selector {
    Selector::parse(selector).expect("a selector this module wrote")
}

/// An element's text as a person reads it.
fn text(element: ElementRef<'_>) -> String {
    super::squash(&element.text().collect::<String>())
}

fn filled(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}

fn first<'a>(scope: ElementRef<'a>, selector: &str) -> Option<ElementRef<'a>> {
    scope.select(&css(selector)).next()
}

/// The object a link points to, as `(type, ref_id)`, from every shape ILIAS 9
/// writes: `/go/crs/123` (HHN's short links), `goto.php/crs/123`,
/// `goto.php?target=crs_123`, and a bare `ref_id=123`, whose type is unknown.
fn link_target(href: &str) -> Option<(Option<String>, String)> {
    for marker in ["/go/", "goto.php/"] {
        if let Some((_, rest)) = href.split_once(marker) {
            let mut parts = rest.split(['/', '?', '#']);
            if let (Some(kind), Some(id)) = (parts.next(), parts.next()) {
                if is_type(kind) && is_id(id) {
                    return Some((Some(kind.to_string()), id.to_string()));
                }
            }
        }
    }
    if let Some((kind, id)) = query_value(href, "target")
        .as_deref()
        .and_then(|t| t.split_once('_'))
    {
        let id: String = id.chars().take_while(char::is_ascii_digit).collect();
        if is_type(kind) && is_id(&id) {
            return Some((Some(kind.to_string()), id));
        }
    }
    query_value(href, "ref_id")
        .filter(|id| is_id(id))
        .map(|id| (None, id))
}

fn query_value(href: &str, key: &str) -> Option<String> {
    let (_, query) = href.split_once('?')?;
    let query = query.split('#').next().unwrap_or_default();
    query.split('&').find_map(|pair| {
        let (name, value) = pair.split_once('=')?;
        (name == key).then(|| value.to_string())
    })
}

/// Whether a title link is a file's: at HHN it is the download itself,
/// `…cmdClass=ilObjFileGUI&cmd=sendfile&ref_id=…`, whatever the icon.
fn is_file_link(href: &str) -> bool {
    query_value(href, "cmd").is_some_and(|cmd| cmd.eq_ignore_ascii_case("sendfile"))
        || query_value(href, "cmdClass")
            .is_some_and(|class| class.eq_ignore_ascii_case("ilObjFileGUI"))
}

/// ILIAS's type from its standard icon: `…/icon_fold.svg` is `fold`, and a
/// suffix-specific `icon_file_pdf.svg` is `file`. Icons an installation
/// uploaded have other names and give nothing.
fn icon_type(icon: ElementRef<'_>) -> Option<String> {
    let name = icon.value().attr("src")?.rsplit('/').next()?;
    let stem = name.strip_prefix("icon_")?.split('.').next()?;
    let kind = stem.split('_').next()?;
    is_type(kind).then(|| kind.to_string())
}

fn is_type(value: &str) -> bool {
    (1..=8).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_lowercase())
}

fn is_id(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
}

/// The UI framework's properties: each `.il-item-property-name` followed by
/// its `.il-item-property-value`, empty pairs dropped.
fn properties(item: ElementRef<'_>) -> Vec<Property> {
    let (names, values) = (
        css(".il-item-property-name"),
        css(".il-item-property-value"),
    );
    item.select(&names)
        .zip(item.select(&values))
        .map(|(name, value)| Property {
            name: text(name),
            value: text(value),
        })
        .filter(|property| !property.name.is_empty() || !property.value.is_empty())
        .collect()
}

/// The value of the first property under any of `names`, ILIAS's German and
/// English labels for the same thing.
fn property<'a>(properties: &'a [Property], names: &[&str]) -> Option<&'a str> {
    properties
        .iter()
        .find(|property| names.contains(&property.name.as_str()))
        .map(|property| property.value.as_str())
}

#[cfg(test)]
mod tests {
    use super::link_target;

    fn typed(kind: &str, id: &str) -> Option<(Option<String>, String)> {
        Some((Some(kind.into()), id.into()))
    }

    #[test]
    fn reads_every_link_shape_ilias_9_writes() {
        assert_eq!(
            link_target("https://ilias.hs-heilbronn.de/go/crs/967849"),
            typed("crs", "967849")
        );
        assert_eq!(
            link_target("https://ilias.example/goto.php/fold/12/"),
            typed("fold", "12")
        );
        assert_eq!(
            link_target("goto.php?target=exc_995478&client_id=iliashhn"),
            typed("exc", "995478")
        );
        assert_eq!(
            link_target("goto.php?target=file_7_download"),
            typed("file", "7")
        );
        assert_eq!(
            link_target("ilias.php?baseClass=ilrepositorygui&cmd=infoScreen&ref_id=359335"),
            Some((None, "359335".into()))
        );
    }

    #[test]
    fn finds_no_object_where_there_is_none() {
        for href in [
            "#",
            "https://ilias.hs-heilbronn.de/go/root",
            "ilias.php?baseClass=ilMailGUI",
            "goto.php?target=root",
        ] {
            assert_eq!(link_target(href), None, "{href}");
        }
    }
}
