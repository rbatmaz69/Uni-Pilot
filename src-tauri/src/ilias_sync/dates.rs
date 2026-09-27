//! Dates as ILIAS 9 prints them.
//!
//! ILIAS writes dates for people: `15. Sep 2025, 08:41`, and for the days
//! around now `Heute, 10:12`, `Gestern, 17:05`, `Morgen, 09:00`. A relative
//! word only means something next to the day the page was read, so it is
//! resolved here, as the page is read. Kept as text, the same file would look
//! changed every midnight, when "Heute" turns into "Gestern".
//!
//! Month names and relative words are ILIAS 9's own, German and English
//! (`month_NN_short`, `today`, `yesterday`, `tomorrow` in `lang/ilias_*.lang`).
//! Times stay in the installation's local time: the result is `YYYY-MM-DD` or
//! `YYYY-MM-DDTHH:MM`, with no offset, exactly as precise as ILIAS was.

use chrono::{Datelike, Days, NaiveDate};

use super::squash;

const MONTHS: [(&str, u32); 16] = [
    ("jan", 1),
    ("feb", 2),
    ("mär", 3),
    ("mar", 3),
    ("apr", 4),
    ("mai", 5),
    ("may", 5),
    ("jun", 6),
    ("jul", 7),
    ("aug", 8),
    ("sep", 9),
    ("okt", 10),
    ("oct", 10),
    ("nov", 11),
    ("dez", 12),
    ("dec", 12),
];

/// A date or date and time from an ILIAS page, or `None` when the text is no
/// date ILIAS writes.
pub fn parse(text: &str, today: NaiveDate) -> Option<String> {
    let text = squash(text);
    let (day_text, time_text) = match text.split_once(',') {
        Some((day, time)) => (day.trim(), Some(time.trim())),
        None => (text.as_str(), None),
    };
    let day = calendar_day(day_text, today)?;
    let date = format!("{:04}-{:02}-{:02}", day.year(), day.month(), day.day());
    match time_text {
        None => Some(date),
        Some(time_text) => {
            let (hour, minute) = clock_time(time_text)?;
            Some(format!("{date}T{hour:02}:{minute:02}"))
        }
    }
}

/// A period as ILIAS prints one, `1. Mär 2026 - 31. Jul 2026`. Either end may
/// be missing; `None` when neither side is a date.
pub fn period(text: &str, today: NaiveDate) -> Option<(Option<String>, Option<String>)> {
    let text = squash(text);
    let (start, end) = text.split_once(" - ")?;
    let start = parse(start, today);
    let end = parse(end, today);
    (start.is_some() || end.is_some()).then_some((start, end))
}

fn calendar_day(text: &str, today: NaiveDate) -> Option<NaiveDate> {
    match text.to_lowercase().as_str() {
        "heute" | "today" => return Some(today),
        "gestern" | "yesterday" => return today.checked_sub_days(Days::new(1)),
        "morgen" | "tomorrow" => return today.checked_add_days(Days::new(1)),
        _ => {}
    }

    // `15. Sep 2025` — how ILIAS 9 writes every other day.
    let parts: Vec<&str> = text.split_whitespace().collect();
    if let [day, month, year] = parts.as_slice() {
        let day = day.strip_suffix('.')?.parse().ok()?;
        let month = month_number(month)?;
        let year = year.parse().ok()?;
        return NaiveDate::from_ymd_opt(year, month, day);
    }

    // `15.09.2025` and `2025-09-15`, for an installation set up that way.
    let numbers: Vec<&str> = text.split(['.', '-']).collect();
    match numbers.as_slice() {
        [day, month, year] if year.len() == 4 => {
            NaiveDate::from_ymd_opt(year.parse().ok()?, month.parse().ok()?, day.parse().ok()?)
        }
        [year, month, day] if year.len() == 4 => {
            NaiveDate::from_ymd_opt(year.parse().ok()?, month.parse().ok()?, day.parse().ok()?)
        }
        _ => None,
    }
}

fn month_number(name: &str) -> Option<u32> {
    let short: String = name.trim_end_matches('.').chars().take(3).collect();
    let short = short.to_lowercase();
    MONTHS
        .iter()
        .find(|(known, _)| *known == short)
        .map(|(_, number)| *number)
}

fn clock_time(text: &str) -> Option<(u32, u32)> {
    let (hour, minute) = text.split_once(':')?;
    let hour: u32 = hour.trim().parse().ok()?;
    let minute: u32 = minute.trim().get(..2)?.parse().ok()?;
    (hour < 24 && minute < 60).then_some((hour, minute))
}

#[cfg(test)]
mod tests {
    use super::{parse, period};
    use chrono::NaiveDate;

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 9, 25).unwrap()
    }

    #[test]
    fn reads_the_date_and_time_of_a_file() {
        assert_eq!(
            parse("15. Sep 2025, 08:41", today()).as_deref(),
            Some("2025-09-15T08:41")
        );
    }

    #[test]
    fn reads_german_and_english_month_names() {
        assert_eq!(parse("1. Mär 2026", today()).as_deref(), Some("2026-03-01"));
        assert_eq!(parse("1. Mar 2026", today()).as_deref(), Some("2026-03-01"));
        assert_eq!(
            parse("22. Dez 2025, 23:55", today()).as_deref(),
            Some("2025-12-22T23:55")
        );
        assert_eq!(parse("3. Okt 2026", today()).as_deref(), Some("2026-10-03"));
        assert_eq!(
            parse("12. May 2026", today()).as_deref(),
            Some("2026-05-12")
        );
    }

    #[test]
    fn resolves_relative_days_against_the_day_the_page_was_read() {
        assert_eq!(
            parse("Heute, 10:12", today()).as_deref(),
            Some("2026-09-25T10:12")
        );
        assert_eq!(
            parse("Gestern, 17:05", today()).as_deref(),
            Some("2026-09-24T17:05")
        );
        assert_eq!(
            parse("Morgen, 09:00", today()).as_deref(),
            Some("2026-09-26T09:00")
        );
        assert_eq!(
            parse("Yesterday, 17:05", today()).as_deref(),
            Some("2026-09-24T17:05")
        );
    }

    #[test]
    fn crosses_a_month_for_yesterday() {
        let first = NaiveDate::from_ymd_opt(2026, 10, 1).unwrap();
        assert_eq!(
            parse("Gestern, 23:59", first).as_deref(),
            Some("2026-09-30T23:59")
        );
    }

    #[test]
    fn keeps_the_padding_ilias_puts_around_properties_out() {
        assert_eq!(
            parse("\n\t\t15. Sep 2025, 08:41\u{a0}\u{a0}", today()).as_deref(),
            Some("2025-09-15T08:41")
        );
    }

    #[test]
    fn reads_numeric_dates_too() {
        assert_eq!(parse("15.09.2025", today()).as_deref(), Some("2025-09-15"));
        assert_eq!(
            parse("2025-09-15, 08:41", today()).as_deref(),
            Some("2025-09-15T08:41")
        );
    }

    #[test]
    fn is_not_fooled_by_what_is_no_date() {
        for text in [
            "pdf",
            "49.89 KB",
            "Version: 3",
            "Bisher keine Abgabe",
            "31. Feb 2026",
            "15. Sep 2025, 25:00",
            "",
        ] {
            assert_eq!(parse(text, today()), None, "{text:?}");
        }
    }

    #[test]
    fn reads_a_course_period_with_or_without_times() {
        assert_eq!(
            period("1. Mär 2026 - 31. Jul 2026", today()),
            Some((Some("2026-03-01".into()), Some("2026-07-31".into())))
        );
        assert_eq!(
            period("9. Mär 2026, 00:00 - 26. Jun 2026, 00:00", today()),
            Some((
                Some("2026-03-09T00:00".into()),
                Some("2026-06-26T00:00".into())
            ))
        );
        assert_eq!(period("Keine Anmeldung möglich", today()), None);
    }
}
