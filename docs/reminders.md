# Calendar reminders

Create a calendar event or open an existing event and use **Reminders**. Settings save immediately on existing events and with **Add to calendar** for new events. Imported calendars keep their original data; reminder choices are local overrides.

| Event type    | Defaults                               |
| ------------- | -------------------------------------- |
| Exam          | Enabled: 7 days, 2 days, 1 hour before |
| Deadline      | Enabled: 3 days, 1 day, 2 hours before |
| Study session | Enabled: at the start                  |
| Other events  | Off; 15 minutes before when enabled    |

Select any combination of timings, add a custom interval up to 365 days, or optionally repeat once a day during the final 1–30 days. Daily repetition is off by default. A preview never consumes a scheduled reminder.

Day intervals use the local calendar at 09:00; minute/hour intervals count backwards from the event time. Quiet hours default to 22:00–08:00 and can be changed in Settings. Equal start/end times disable quiet hours. The global toggle pauses all calendar reminders without deleting event preferences.

Reminders wait for activity, require no internet for cached events, combine missed milestones for one event, and leave at least one minute between different events. A daily reminder won't repeat on a day when that event already produced a reminder. An event that has started no longer produces catch-up reminders; an explicit “at the start” reminder has a one-minute grace window for timer drift. Cancelled, deleted, and muted events do not trigger. A rescheduled occurrence has its own delivery identity.

The notification bell contains real reminder history, with **Dismiss**, **Snooze 30 min**, and **Mute this event**. Dismiss only acknowledges the current reminder. Snooze is offered only when its target time is still before the event. History retains delivery state for upcoming events and up to 90 days after past events; the UI shows the latest 50 event occurrences.

## Desktop and browser behavior

On macOS, a Swift/AppKit companion displays the airplane above other applications without taking focus or mouse clicks. A quiet card stays in the corner. Both last eight seconds; Reduce Motion uses the stationary card. The companion checks computer activity, screen sleep, and session lock state. Closing the main window hides it while reminders continue. Click the Dock icon to reopen it. **Quit** stops reminders; launch Uni-Pilot again to resume. This does not install a login agent or enable launch at login.

The browser and other desktop platforms show the animation inside the app while the page is visible and has had recent activity. Their window/tab must remain open. Cached subscriptions refresh through the existing calendar source service; offline changes to external calendars cannot be known until a successful refresh.

## Implementation and validation

- `eventStore.ts`: persistent personal calendar events.
- `reminderStore.ts`: event rules, global settings, browser history, and native history mirrored for display.
- `engine.ts`: testable schedule construction and browser delivery decisions.
- `ReminderService.tsx`: application-wide service and native schedule synchronization.
- `src-tauri/native/Reminders.swift`: independent native scheduler, atomic history persistence, and non-activating overlay.
- `src-tauri/src/reminders.rs`: serialized JSON-lines IPC. The companion exits on parent stdin EOF; no shell commands or network access are used by it.

The macOS build compiles the Swift companion with Xcode Command Line Tools and embeds it in the Tauri executable. At runtime it is extracted to the app data directory with owner-only execute permissions. The browser and native schedulers use the same due-slot/consumption semantics; changes must update both and their tests. Store identifiers remain independent from display titles.

Run `npm run check`, `npm run build`, and `cargo build --manifest-path src-tauri/Cargo.toml` for application validation. The native scheduler can also be tested independently:

```sh
swiftc -module-cache-path /tmp/uni-pilot-swift-cache src-tauri/native/Reminders.swift -o /tmp/uni-pilot-reminders
/tmp/uni-pilot-reminders --self-test
```

Plane artwork is reused from meeting-airplane / Connie Xu's meeting-reminder under its MIT license, preserved in `public/reminders/LICENSE-art.txt`.

The native overlay adapts the non-activating window behavior from meeting-airplane. Its source license is retained in `src-tauri/native/LICENSE-meeting-airplane.txt`.
