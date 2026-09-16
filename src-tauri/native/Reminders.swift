import AppKit
import CoreGraphics

// A small macOS companion owned by the Tauri process. No calendar permissions,
// login agent, network access, or shell execution: Uni-Pilot supplies its events.
struct Slot: Codable { let key: String; let due: Double; let daily: Bool }
struct Event: Codable {
    let id: String
    let eventId: String
    let title: String
    let date: String
    let startTime: String
    let at: Double
    let style: String
    let slots: [Slot]
}
struct Settings: Codable {
    var enabled = true
    var quietStart = "22:00"
    var quietEnd = "08:00"
}
struct History: Codable {
    let id: String
    let eventId: String
    let title: String
    let at: Double
    var shownAt: Double
    var consumed: [String]
    var dismissed: Bool
    var snoozeUntil: Double?
}
struct Request: Decodable {
    let command: String
    let events: [Event]?
    let settings: Settings?
    let event: Event?
    let id: String?
}

func quiet(_ now: Date, _ settings: Settings) -> Bool {
    func minutes(_ clock: String) -> Int {
        let parts = clock.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : 0
    }
    let calendar = Calendar.current
    let minute = calendar.component(.hour, from: now) * 60 + calendar.component(.minute, from: now)
    let start = minutes(settings.quietStart), end = minutes(settings.quietEnd)
    if start == end { return false }
    return start < end ? minute >= start && minute < end : minute >= start || minute < end
}

func nextReminder(events: [Event], history: [History], now: Date, settings: Settings, active: Bool) -> (Event, History)? {
    let time = now.timeIntervalSince1970 * 1000
    guard active, settings.enabled, !quiet(now, settings) else { return nil }
    guard !history.contains(where: { time - $0.shownAt < 60_000 }) else { return nil }
    for event in events.sorted(by: { $0.at < $1.at }) {
        let expires = event.at + (event.slots.contains { $0.key == "offset:0" } ? 60_000 : 0)
        guard time < expires else { continue }
        let previous = history.first { $0.id == event.id }
        if let until = previous?.snoozeUntil, until > time { continue }
        let due = event.slots.filter { $0.due <= time }
        let unseen = due.filter { !(previous?.consumed.contains($0.key) ?? false) }
        let shownToday = previous.map { Calendar.current.isDate(Date(timeIntervalSince1970: $0.shownAt / 1000), inSameDayAs: now) } ?? false
        let snoozed = previous?.snoozeUntil.map { $0 <= time } ?? false
        guard snoozed || unseen.contains(where: { !$0.daily || !shownToday }) else { continue }
        let record = History(id: event.id, eventId: event.eventId, title: event.title, at: event.at,
            shownAt: time, consumed: Array(Set((previous?.consumed ?? []) + due.map { $0.key })),
            dismissed: false, snoozeUntil: nil)
        return (event, record)
    }
    return nil
}

final class PassivePanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class ReminderApp: NSObject, NSApplicationDelegate {
    var events: [Event] = []
    var settings = Settings()
    var history: [History] = []
    var ready = false
    var sleeping = false
    var sessionActive = true
    var persistenceError: String?
    var panel: NSPanel?
    var animation: Timer?
    var scheduler: Timer?
    let storage: URL
    let planePath: String

    init(storage: URL, planePath: String) {
        self.storage = storage
        self.planePath = planePath
        super.init()
        if FileManager.default.fileExists(atPath: storage.path) {
            do { history = try JSONDecoder().decode([History].self, from: Data(contentsOf: storage)) }
            catch { persistenceError = "Could not read reminder history. Your existing history has been preserved." }
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let center = NSWorkspace.shared.notificationCenter
        center.addObserver(self, selector: #selector(sleepScreen), name: NSWorkspace.screensDidSleepNotification, object: nil)
        center.addObserver(self, selector: #selector(wakeScreen), name: NSWorkspace.screensDidWakeNotification, object: nil)
        center.addObserver(self, selector: #selector(deactivateSession), name: NSWorkspace.sessionDidResignActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(activateSession), name: NSWorkspace.sessionDidBecomeActiveNotification, object: nil)
        scheduler = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.check() }
        DispatchQueue.global(qos: .utility).async { [weak self] in
            while let line = readLine() {
                guard let data = line.data(using: .utf8) else { continue }
                DispatchQueue.main.async { self?.receive(data) }
            }
            // Parent quit or crashed: the companion must not outlive Uni-Pilot.
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }
    @objc func sleepScreen() { sleeping = true; hide() }
    @objc func wakeScreen() { sleeping = false }
    @objc func deactivateSession() { sessionActive = false; hide() }
    @objc func activateSession() { sessionActive = true }

    func active() -> Bool {
        guard !sleeping, sessionActive else { return false }
        guard let session = CGSessionCopyCurrentDictionary() as? [String: Any],
              (session["CGSSessionScreenIsLocked"] as? Bool) != true,
              (session[kCGSessionOnConsoleKey as String] as? Bool) == true else { return false }
        return CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: UInt32.max)!) < 300
    }
    func save(_ records: [History]) throws {
        let data = try JSONEncoder().encode(records)
        try data.write(to: storage, options: .atomic)
        history = records
    }
    func reply(error: String? = nil) {
        do {
            let data: Data
            if let error = error { data = try JSONSerialization.data(withJSONObject: ["error": error]) }
            else { data = try JSONEncoder().encode(history) }
            FileHandle.standardOutput.write(data + Data([10]))
        } catch { FileHandle.standardOutput.write(Data("{\"error\":\"Could not encode reminder history\"}\n".utf8)) }
    }
    func receive(_ data: Data) {
        do {
            let request = try JSONDecoder().decode(Request.self, from: data)
            if let error = persistenceError { reply(error: error); return }
            switch request.command {
            case "sync":
                events = request.events ?? []
                settings = request.settings ?? Settings()
                ready = true
                if !settings.enabled { hide() }
            case "history": break
            case "preview":
                if let event = request.event { show(event) }
            case "dismiss", "snooze":
                var updated = history
                if let index = updated.firstIndex(where: { $0.id == request.id }) {
                    updated[index].dismissed = true
                    updated[index].snoozeUntil = request.command == "snooze" ? Date().timeIntervalSince1970 * 1000 + 30 * 60_000 : nil
                    try save(updated)
                }
            default: reply(error: "Unknown reminder command"); return
            }
            reply()
        } catch { reply(error: "Could not update reminders: \(error.localizedDescription)") }
    }
    func check() {
        guard ready, persistenceError == nil, panel == nil, !NSScreen.screens.isEmpty else { return }
        let now = Date()
        guard let (event, record) = nextReminder(events: events, history: history, now: now, settings: settings, active: active()) else { return }
        do {
            // Keep future occurrences' delivery state even with a large calendar.
            let cutoff = now.timeIntervalSince1970 * 1000 - 90 * 86_400_000
            try save([record] + history.filter { $0.id != record.id && $0.at > cutoff })
            show(event)
        } catch { persistenceError = "Could not save reminder history. Reminders are paused to avoid duplicates." }
    }
    func hide() {
        animation?.invalidate(); animation = nil
        panel?.orderOut(nil); panel = nil
    }
    func show(_ event: Event) {
        guard let screen = NSScreen.screens.first(where: { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) }) ?? NSScreen.main else { return }
        hide()
        let fly = event.style == "airplane" && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        let width = min(fly ? 590.0 : 440.0, screen.visibleFrame.width - 40)
        let height = 160.0
        let cardWidth = fly ? width - 130 : width
        let content = NSView(frame: NSRect(x: 0, y: 0, width: width, height: height))
        let card = NSView(frame: NSRect(x: 0, y: 24, width: cardWidth, height: 112))
        card.wantsLayer = true
        card.layer?.backgroundColor = NSColor(calibratedRed: 0.925, green: 0.965, blue: 0.93, alpha: 1).cgColor
        card.layer?.cornerRadius = 18
        card.layer?.borderWidth = 1
        card.layer?.borderColor = NSColor(calibratedRed: 0.66, green: 0.79, blue: 0.74, alpha: 1).cgColor
        func label(_ text: String, y: Double, size: Double, bold: Bool) {
            let field = NSTextField(labelWithString: text)
            field.frame = NSRect(x: 22, y: y, width: cardWidth - 44, height: size + 9)
            field.font = NSFont.systemFont(ofSize: size, weight: bold ? .semibold : .regular)
            field.textColor = NSColor(calibratedRed: 0.15, green: 0.30, blue: 0.29, alpha: 1)
            field.lineBreakMode = .byTruncatingTail
            card.addSubview(field)
        }
        let date = Date(timeIntervalSince1970: event.at / 1000)
        let calendar = Calendar.current
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: Date()), to: calendar.startOfDay(for: date)).day ?? 0
        let minutes = max(0, Int(ceil(date.timeIntervalSinceNow / 60)))
        let timing = date.timeIntervalSinceNow < -60 ? "EVENT HAS PASSED" : days > 1 ? "IN \(days) DAYS" : days == 1 ? "TOMORROW" : minutes == 0 ? "STARTING NOW" : "IN \(minutes) MIN"
        label("UNI PILOT  ·  \(timing)", y: 78, size: 10, bold: true)
        label(event.title, y: 47, size: 19, bold: true)
        let formatter = DateFormatter(); formatter.dateFormat = "EEE, d MMM · HH:mm"
        label(formatter.string(from: date), y: 21, size: 12, bold: false)
        content.addSubview(card)
        if fly {
            let image = NSImageView(frame: NSRect(x: cardWidth, y: 0, width: 145, height: 160))
            image.image = NSImage(contentsOfFile: planePath)
            image.imageScaling = .scaleProportionallyUpOrDown
            content.addSubview(image)
        }
        let frame = screen.frame
        let x = fly ? frame.minX - width : screen.visibleFrame.maxX - width - 24
        let y = screen.visibleFrame.maxY - height - 20
        let window = PassivePanel(contentRect: NSRect(x: x, y: y, width: width, height: height), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        window.isOpaque = false; window.backgroundColor = .clear; window.hasShadow = false
        window.level = .screenSaver
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        window.ignoresMouseEvents = true; window.isReleasedWhenClosed = false
        window.contentView = content; window.orderFrontRegardless(); panel = window
        let start = Date()
        animation = Timer.scheduledTimer(withTimeInterval: 1 / 60.0, repeats: true) { [weak self, weak window] timer in
            guard let self = self, let window = window else { timer.invalidate(); return }
            let progress = min(1, Date().timeIntervalSince(start) / 8)
            if fly { window.setFrameOrigin(NSPoint(x: x + (frame.width + width) * progress, y: y)) }
            if progress > 0.9 { window.alphaValue = (1 - progress) * 10 }
            if progress >= 1 { self.hide() }
        }
    }
}

if CommandLine.arguments.contains("--self-test") {
    // The same cases as the browser engine, executed without a graphical session.
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let time = now.timeIntervalSince1970 * 1000
    let settings = Settings(enabled: true, quietStart: "00:00", quietEnd: "00:00")
    let event = Event(id: "exam|date", eventId: "exam", title: "Exam", date: "2027-01-16", startTime: "10:00", at: time + 86_400_000, style: "airplane", slots: [Slot(key: "offset:10080", due: time - 600_000, daily: false), Slot(key: "offset:2880", due: time - 60_000, daily: false)])
    let first = nextReminder(events: [event], history: [], now: now, settings: settings, active: true)!
    assert(first.1.consumed.count == 2, "Missed reminders must coalesce")
    assert(nextReminder(events: [event], history: [first.1], now: now.addingTimeInterval(120), settings: settings, active: true) == nil, "No repeat after restart")
    assert(nextReminder(events: [event], history: [], now: now, settings: settings, active: false) == nil, "Idle defers delivery")
    assert(nextReminder(events: [event], history: [], now: now.addingTimeInterval(90_000), settings: settings, active: true) == nil, "Past events must not fire")
    var snoozed = first.1; snoozed.snoozeUntil = time + 1_800_000
    assert(nextReminder(events: [event], history: [snoozed], now: now.addingTimeInterval(120), settings: settings, active: true) == nil)
    assert(nextReminder(events: [event], history: [snoozed], now: now.addingTimeInterval(1801), settings: settings, active: true) != nil)
    print("Native reminder engine: all checks passed")
} else if CommandLine.arguments.count == 3 {
    let app = NSApplication.shared
    let delegate = ReminderApp(storage: URL(fileURLWithPath: CommandLine.arguments[1]), planePath: CommandLine.arguments[2])
    app.delegate = delegate; app.setActivationPolicy(.accessory); app.run()
}
