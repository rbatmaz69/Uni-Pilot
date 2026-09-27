//! An exercise's assignments (`…ilObjExerciseGUI&cmd=showOverview&mode=all`).
//!
//! ILIAS 9 lists them as UI-framework items, grouped by where they stand
//! ("Laufende", "Kommende", "Vergangene"), each with a one-word state on the
//! left and labelled properties below. Recorded at HHN on 25.09.2026 for a
//! past assignment; the labels for running ones are ILIAS 9's own from
//! `lang/ilias_de.lang` and `ilias_en.lang`, since no running assignment was
//! there to record.
//!
//! The overview is enough to say "sheet 4 is out, due Sunday, not handed in".
//! Instruction files and the student's own uploads are on the assignment's
//! page, which a later reader can take on.

use chrono::NaiveDate;
use scraper::{ElementRef, Html};
use serde::Serialize;

use super::{css, filled, first, properties, property, query_value, text, Property};
use crate::ilias_sync::dates;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Assignment {
    pub ass_id: String,
    pub exercise_ref_id: String,
    pub title: String,
    /// The group ILIAS files it under: "Laufende", "Kommende", "Vergangene".
    pub section: Option<String>,
    /// ILIAS's own word for where it stands, e.g. "Beendet".
    pub state: Option<String>,
    pub starts_at: Option<String>,
    pub due_at: Option<String>,
    /// From "Anforderung": true for mandatory, false for optional.
    pub mandatory: Option<bool>,
    /// The student's last submission; `None` for "Bisher keine Abgabe".
    pub submitted_at: Option<String>,
    /// As ILIAS says it: "Nicht bewertet", "Bestanden", "Nicht bestanden".
    pub grade: Option<String>,
    pub properties: Vec<Property>,
}

// exc_start_time, exc_starting_on
const STARTS: &[&str] = &["Startzeit", "Startet am", "Start Time", "Starting On"];
// exc_edit_until, exc_deadline, exc_ended_on
const DUE: &[&str] = &[
    "Abgabetermin",
    "Beendet am",
    "Edit Until",
    "Deadline",
    "Ended On",
];
// exc_requirement
const REQUIREMENT: &[&str] = &["Anforderung", "Requirement"];
const MANDATORY: &[&str] = &["Verpflichtend", "Mandatory"];
const OPTIONAL: &[&str] = &["Optional"];
// exc_last_submission
const LAST_SUBMISSION: &[&str] = &["Datum der letzten Abgabe", "Last Submission"];
const GRADE: &[&str] = &["Status"];

pub fn read_assignments(
    html: &str,
    exercise_ref_id: &str,
    today: NaiveDate,
) -> Result<Vec<Assignment>, String> {
    let page = Html::parse_document(html);
    if page
        .select(&css("#il_center_col, .il-panel-listing-std-container"))
        .next()
        .is_none()
    {
        return Err("ILIAS showed a page that is not an exercise.".into());
    }
    Ok(page
        .select(&css(".il-std-item"))
        .filter_map(|item| assignment(item, exercise_ref_id, today))
        .collect())
}

fn assignment(item: ElementRef<'_>, exercise_ref_id: &str, today: NaiveDate) -> Option<Assignment> {
    let heading = first(item, ".il-item-title")?;
    let href = first(heading, "a")?.value().attr("href")?;
    let ass_id = query_value(href, "ass_id")
        .filter(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()))?;

    let properties = properties(item);
    let date =
        |names: &[&str]| property(&properties, names).and_then(|value| dates::parse(value, today));
    let requirement = property(&properties, REQUIREMENT);
    let mandatory = match requirement {
        Some(value) if MANDATORY.contains(&value) => Some(true),
        Some(value) if OPTIONAL.contains(&value) => Some(false),
        _ => None,
    };

    Some(Assignment {
        ass_id,
        exercise_ref_id: query_value(href, "ref_id").unwrap_or_else(|| exercise_ref_id.to_string()),
        title: text(heading),
        section: section(item),
        state: first(item, ".row > .col-sm-3").map(text).and_then(filled),
        starts_at: date(STARTS),
        due_at: date(DUE),
        mandatory,
        submitted_at: date(LAST_SUBMISSION),
        grade: property(&properties, GRADE).map(str::to_string),
        properties,
    })
}

fn section(item: ElementRef<'_>) -> Option<String> {
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
    use super::read_assignments;
    use chrono::NaiveDate;

    const PAGE: &str = include_str!("../fixtures/exercise.html");

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 9, 25).unwrap()
    }

    #[test]
    fn reads_a_past_assignment_nobody_handed_in() {
        let assignments = read_assignments(PAGE, "100130", today()).unwrap();
        let past = &assignments[1];
        assert_eq!(past.ass_id, "30001");
        assert_eq!(past.exercise_ref_id, "100130");
        assert_eq!(past.title, "Abgabe der Projektaufgabe");
        assert_eq!(past.section.as_deref(), Some("Vergangene"));
        assert_eq!(past.state.as_deref(), Some("Beendet"));
        assert_eq!(past.due_at.as_deref(), Some("2025-12-22T23:55"));
        assert_eq!(past.starts_at, None);
        assert_eq!(past.mandatory, Some(true));
        assert_eq!(past.submitted_at, None);
        assert_eq!(past.grade.as_deref(), Some("Nicht bewertet"));
    }

    #[test]
    fn reads_a_running_assignment_with_a_submission() {
        let assignments = read_assignments(PAGE, "100130", today()).unwrap();
        let running = &assignments[0];
        assert_eq!(running.ass_id, "30002");
        assert_eq!(running.section.as_deref(), Some("Laufende"));
        assert_eq!(running.state.as_deref(), Some("Noch 2 Tage"));
        assert_eq!(running.starts_at.as_deref(), Some("2026-09-25T09:45"));
        assert_eq!(running.due_at.as_deref(), Some("2026-09-27T23:55"));
        assert_eq!(running.mandatory, Some(false));
        assert_eq!(running.submitted_at.as_deref(), Some("2026-09-25T11:20"));
        assert_eq!(running.grade.as_deref(), Some("Bestanden"));
    }

    /// Recorded at HHN with the default "Laufende" filter on a finished exercise.
    #[test]
    fn reads_an_exercise_without_assignments_as_empty() {
        let html = r#"<main><div id="il_center_col"><div class="panel panel-primary panel-flex"><div class="panel-body"><div class="alert alert-info">Keine Übungseinheiten vorhanden.</div></div></div></div></main>"#;
        assert_eq!(read_assignments(html, "1", today()), Ok(vec![]));
    }

    #[test]
    fn refuses_a_page_that_is_no_exercise() {
        assert!(read_assignments("<main><p>Zugriff verweigert</p></main>", "1", today()).is_err());
    }
}
