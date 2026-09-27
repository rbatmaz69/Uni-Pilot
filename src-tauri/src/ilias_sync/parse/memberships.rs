//! "Meine Kurse und Gruppen" (`ilias.php?baseClass=ilmembershipoverviewgui`).
//!
//! ILIAS 9 lists memberships as UI-framework items (`.il-std-item`), grouped
//! under the category each lives in (`.il-item-group > h3`). What HHN showed
//! on 25.09.2026:
//!
//! - an online course: the title is a link, `/go/crs/<ref_id>`;
//! - an offline course: the title is plain text, `Status: Offline` is among
//!   its properties, and its ref_id is only in the action menu;
//! - next to "Info" in that menu, "Kursmitgliedschaft beenden" as a plain
//!   `cmd=leave` link. Its ref_id is the same as Info's; Info is read first.

use chrono::NaiveDate;
use scraper::{ElementRef, Html};
use serde::Serialize;

use super::{
    css, filled, first, icon_type, link_target, properties, property, text, Period, Property,
};
use crate::ilias_sync::dates;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub ref_id: String,
    /// ILIAS's own word: `crs` or `grp`.
    pub provider_type: String,
    pub title: String,
    pub description: Option<String>,
    /// The category ILIAS files it under, e.g. "H3 Labor für Softwareentwicklung 1".
    pub area: Option<String>,
    /// False when ILIAS lists the course but will not open it.
    pub online: bool,
    pub period: Option<Period>,
    pub properties: Vec<Property>,
}

const STATUS: &[&str] = &["Status"];
const OFFLINE: &[&str] = &["Offline"];
const PERIOD: &[&str] = &["Veranstaltungszeitraum", "Period of Event"];

pub fn read_memberships(html: &str, today: NaiveDate) -> Result<Vec<Course>, String> {
    let page = Html::parse_document(html);
    if page.select(&css("main .panel")).next().is_none() {
        return Err("ILIAS showed a page without the list of your courses.".into());
    }
    Ok(page
        .select(&css("main .il-std-item"))
        .filter_map(|item| course(item, today))
        .collect())
}

fn course(item: ElementRef<'_>, today: NaiveDate) -> Option<Course> {
    let heading = first(item, ".il-item-title")?;
    let link = first(heading, "a").and_then(|a| a.value().attr("href"));
    let linked = link.and_then(link_target);

    let ref_id = linked
        .as_ref()
        .map(|(_, id)| id.clone())
        .or_else(|| menu_ref_id(item))?;
    let provider_type = linked
        .and_then(|(kind, _)| kind)
        .or_else(|| first(item, "img.icon").and_then(icon_type))
        .unwrap_or_else(|| "crs".to_string());

    let properties = properties(item);
    let offline = property(&properties, STATUS).is_some_and(|status| OFFLINE.contains(&status));
    let period = property(&properties, PERIOD)
        .and_then(|value| dates::period(value, today))
        .map(|(start, end)| Period { start, end });

    Some(Course {
        ref_id,
        provider_type,
        title: text(heading),
        description: first(item, ".il-item-description")
            .map(text)
            .and_then(filled),
        area: area(item),
        online: link.is_some() && !offline,
        period,
        properties,
    })
}

/// The ref_id from the action menu, Info's link first.
fn menu_ref_id(item: ElementRef<'_>) -> Option<String> {
    let actions: Vec<&str> = item
        .select(&css(
            ".il-item-actions [data-action], .il-item-actions a[href]",
        ))
        .filter_map(|action| {
            action
                .value()
                .attr("data-action")
                .or(action.value().attr("href"))
        })
        .collect();
    actions
        .iter()
        .find(|action| action.contains("cmd=infoScreen"))
        .or(actions.first())
        .and_then(|action| link_target(action))
        .map(|(_, id)| id)
}

/// The heading of the `.il-item-group` the item sits in.
fn area(item: ElementRef<'_>) -> Option<String> {
    let group = item
        .ancestors()
        .filter_map(ElementRef::wrap)
        .find(|element| {
            element
                .value()
                .classes()
                .any(|class| class == "il-item-group")
        })?;
    group
        .children()
        .filter_map(ElementRef::wrap)
        .find(|child| child.value().name() == "h3")
        .map(text)
        .and_then(filled)
}

#[cfg(test)]
mod tests {
    use super::read_memberships;
    use crate::ilias_sync::parse::Period;
    use chrono::NaiveDate;

    const PAGE: &str = include_str!("../fixtures/memberships.html");

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 9, 25).unwrap()
    }

    #[test]
    fn lists_every_course_with_its_area() {
        let courses = read_memberships(PAGE, today()).unwrap();
        let listed: Vec<(&str, &str, Option<&str>)> = courses
            .iter()
            .map(|course| {
                (
                    course.ref_id.as_str(),
                    course.title.as_str(),
                    course.area.as_deref(),
                )
            })
            .collect();
        assert_eq!(
            listed,
            [
                (
                    "100100",
                    "100001 Beispielsysteme 1 - WS25",
                    Some("H3 Labor für Beispielsysteme")
                ),
                (
                    "100200",
                    "100002 Beispieltheorie 2026 SS",
                    Some("H2 Beispiele, Theorie und Verteilung")
                ),
                (
                    "100300",
                    "Beispielpraxis",
                    Some("H2 Beispiele, Theorie und Verteilung")
                ),
            ]
        );
    }

    #[test]
    fn reads_an_online_course() {
        let course = &read_memberships(PAGE, today()).unwrap()[0];
        assert!(course.online);
        assert_eq!(course.provider_type, "crs");
        assert_eq!(
            course.description.as_deref(),
            Some("Vorlesung und Labor, Wintersemester")
        );
        assert_eq!(course.period, None);
        assert!(course.properties.is_empty());
    }

    /// Offline courses have no title link; their ref_id comes from Info.
    #[test]
    fn reads_an_offline_course_from_its_menu() {
        let courses = read_memberships(PAGE, today()).unwrap();
        let course = &courses[1];
        assert!(!course.online);
        assert_eq!(course.ref_id, "100200");
        assert_eq!(
            course.period,
            Some(Period {
                start: Some("2026-03-01".into()),
                end: Some("2026-07-31".into())
            })
        );
        assert_eq!(course.description, None);
    }

    #[test]
    fn keeps_the_time_of_a_period_when_ilias_gives_one() {
        let course = &read_memberships(PAGE, today()).unwrap()[2];
        assert_eq!(
            course.period,
            Some(Period {
                start: Some("2026-03-09T00:00".into()),
                end: Some("2026-06-26T00:00".into())
            })
        );
    }

    #[test]
    fn refuses_a_page_that_is_not_the_list() {
        assert!(read_memberships(
            "<html><body><main><p>Wartungsarbeiten</p></main></body></html>",
            today()
        )
        .is_err());
    }

    #[test]
    fn reads_an_empty_list_as_empty() {
        let html = r#"<main><div class="panel"><div class="panel-heading"><h2>Meine Kurse und Gruppen</h2></div></div></main>"#;
        assert_eq!(read_memberships(html, today()), Ok(vec![]));
    }
}
