import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Code2,
  Compass,
  Globe2,
  GraduationCap,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { Page } from '@/components/layout';
import { Modal } from '@/components/ui/Modal';
import { NAV_ITEMS } from '@/lib/navigation';
import { localDateKey, parseDateKey } from '@/lib/date';
import {
  CATEGORIES,
  STUDENT_EVENTS,
  eventDate,
  toCalendarEvent,
  type StudentEvent,
} from '@/features/events/lib/events';
import { useDiscoveryStore } from '@/features/events/store/discoveryStore';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { EventArtwork } from '@/features/events/components/EventArtwork';
import { CreateStudentEvent } from '@/features/events/components/CreateStudentEvent';
import '@/features/events/events.css';

const categoryIcons = [Compass, Code2, Sparkles, GraduationCap, Users, Globe2];

export function EventsExperience() {
  const navigate = useNavigate();
  const { savedIds, createdEvents, toggleSaved, createEvent } = useDiscoveryStore();
  const calendarEvents = useEventStore((state) => state.events);
  const addToCalendar = useEventStore((state) => state.add);
  const [tab, setTab] = useState<'discover' | 'saved' | 'mine'>('discover');
  const [category, setCategory] = useState('All events');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [date, setDate] = useState('');
  const [month, setMonth] = useState(() => {
    const value = parseDateKey(STUDENT_EVENTS[0]!.date);
    return new Date(value.getFullYear(), value.getMonth(), 1);
  });
  const [format, setFormat] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<'soonest' | 'latest'>('soonest');
  const [selected, setSelected] = useState<StudentEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const [shareText, setShareText] = useState('');
  const events = [...STUDENT_EVENTS, ...createdEvents].sort((a, b) =>
    `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
  );
  const inCalendar = (id: string) => calendarEvents.some((event) => event.id === id);
  const myEvents = events.filter(
    (event) => inCalendar(event.id) || createdEvents.some((created) => created.id === event.id),
  );
  const filtered = events.filter(
    (event) =>
      (tab === 'discover' ||
        (tab === 'saved'
          ? savedIds.includes(event.id)
          : myEvents.some((mine) => mine.id === event.id))) &&
      (category === 'All events' || category === event.category) &&
      (!date || date === event.date) &&
      (format === 'all' || (format === 'online' ? event.online : !event.online)) &&
      `${event.title} ${event.category} ${event.host} ${event.location}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  if (sort === 'latest') filtered.reverse();
  const firstOffset = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const clearFilters = () => {
    setCategory('All events');
    setQuery('');
    setDate('');
    setFormat('all');
  };
  const openEvent = (event: StudentEvent) => {
    setSelected(event);
    setShareText('');
  };
  const schedule = (event: StudentEvent) => {
    if (!inCalendar(event.id)) {
      addToCalendar(toCalendarEvent(event));
    }
    void navigate(`${NAV_ITEMS.calendar.path}?event=${encodeURIComponent(event.id)}`);
  };
  async function share(event: StudentEvent) {
    const text = `${event.title}${event.sample ? ' (example event)' : ''}\n${eventDate(event.date, { dateStyle: 'full' })} · ${event.timeUnannounced ? 'Time to be announced' : `${event.startTime}–${event.endTime}`}\n${event.location}\n\n${event.description}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Event details copied. Ready to share.');
    } catch {
      setShareText(text);
    }
  }
  function created(event: StudentEvent) {
    createEvent(event);
    setCreating(false);
    clearFilters();
    setTab('mine');
    setNotice('Event created and saved on this device.');
    openEvent(event);
  }
  return (
    <Page item={NAV_ITEMS.events} hideHeader>
      <div className="events-page">
        <div className="events-heading">
          <div>
            <h1>{NAV_ITEMS.events.label}</h1>
            <p>{NAV_ITEMS.events.subtitle}</p>
          </div>
          <button className="ev-button ev-button--primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Create event
          </button>
        </div>
        <div
          className="events-top-tabs"
          aria-label="Event collections"
          role="tablist"
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const tabs = ['discover', 'saved', 'mine'] as const;
            const index = tabs.indexOf(tab);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? 2
                  : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
            setTab(tabs[next]!);
            clearFilters();
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
          }}
        >
          <button
            role="tab"
            aria-selected={tab === 'discover'}
            tabIndex={tab === 'discover' ? 0 : -1}
            id="events-tab-discover"
            aria-controls="events-collection-panel"
            onClick={() => {
              setTab('discover');
              clearFilters();
            }}
          >
            <Compass size={15} /> Discover
          </button>
          <button
            role="tab"
            aria-selected={tab === 'saved'}
            tabIndex={tab === 'saved' ? 0 : -1}
            id="events-tab-saved"
            aria-controls="events-collection-panel"
            onClick={() => {
              setTab('saved');
              clearFilters();
            }}
          >
            <Bookmark size={15} /> Saved <span>{savedIds.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === 'mine'}
            tabIndex={tab === 'mine' ? 0 : -1}
            id="events-tab-mine"
            aria-controls="events-collection-panel"
            onClick={() => {
              setTab('mine');
              clearFilters();
            }}
          >
            <CalendarDays size={15} /> My events <span>{myEvents.length}</span>
          </button>
        </div>
        <div id="events-collection-panel" role="tabpanel" aria-labelledby={`events-tab-${tab}`}>
          <div className="events-content-layout">
            <section className="events-discovery" aria-label="Browse student events">
              <h2 className="sr-only">
                {tab === 'saved' ? 'Saved events' : tab === 'mine' ? 'My events' : 'All events'}
              </h2>
              <div className="events-search-row">
                <label className="events-search">
                  <Search size={17} />
                  <input
                    aria-label="Search events"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search events…"
                  />
                  {query && (
                    <button aria-label="Clear search" onClick={() => setQuery('')}>
                      <X size={14} />
                    </button>
                  )}
                </label>
                <button
                  className={`ev-button events-filter-button ${filtersOpen || format !== 'all' ? 'is-active' : ''}`}
                  onClick={() => setFiltersOpen(!filtersOpen)}
                  aria-expanded={filtersOpen}
                >
                  <SlidersHorizontal size={15} />
                  <span>Filters</span>
                </button>
                <div className="events-view-toggle" role="group" aria-label="Event view">
                  <button
                    aria-label="Grid view"
                    aria-pressed={view === 'grid'}
                    onClick={() => setView('grid')}
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button
                    aria-label="Timeline view"
                    aria-pressed={view === 'list'}
                    onClick={() => setView('list')}
                  >
                    <List size={17} />
                  </button>
                </div>
              </div>
              {filtersOpen && (
                <div className="events-extra-filters">
                  <label>
                    Where
                    <select
                      aria-label="Event format"
                      value={format}
                      onChange={(event) => setFormat(event.target.value)}
                    >
                      <option value="all">All locations</option>
                      <option value="in-person">In person</option>
                      <option value="online">Online</option>
                    </select>
                  </label>
                  <button onClick={clearFilters}>Reset filters</button>
                </div>
              )}
              <div className="events-categories" role="group" aria-label="Event category">
                {CATEGORIES.map((item, index) => {
                  const Icon = categoryIcons[index]!;
                  return (
                    <button
                      key={item}
                      aria-pressed={category === item}
                      onClick={() => setCategory(item)}
                    >
                      <Icon size={14} />
                      {item}
                    </button>
                  );
                })}
              </div>
              <div className="events-results-meta">
                <span>
                  {filtered.length} {filtered.length === 1 ? 'event' : 'events'}
                  {date && (
                    <button onClick={() => setDate('')} aria-label="Clear date filter">
                      {eventDate(date)} <X size={12} />
                    </button>
                  )}
                </span>
                <label>
                  <ArrowDownUp size={12} />
                  <select
                    aria-label="Sort events"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as typeof sort)}
                  >
                    <option value="soonest">Soonest first</option>
                    <option value="latest">Latest first</option>
                  </select>
                </label>
              </div>
              {filtered.length ? (
                <div className={view === 'grid' ? 'events-grid' : 'events-timeline'}>
                  {filtered.map((event) => (
                    <article className="student-event-card" key={event.id}>
                      {view === 'list' && (
                        <div className="event-timeline-date">
                          <strong>
                            {eventDate(event.date, { day: 'numeric', month: 'short' })}
                          </strong>
                          <span>{eventDate(event.date, { weekday: 'long' })}</span>
                        </div>
                      )}
                      <div className="student-event-visual">
                        <button
                          className="event-cover-button"
                          onClick={() => openEvent(event)}
                          aria-label={`View ${event.title}`}
                        >
                          <EventArtwork cover={event.cover} />
                        </button>
                        <time
                          className="special-event-ribbon event-date-ribbon"
                          dateTime={event.date}
                          aria-label={eventDate(event.date, { dateStyle: 'full' })}
                        >
                          <span className="special-event-date">
                            <span className="event-ribbon-month">
                              {eventDate(event.date, { month: 'short' })}
                            </span>
                            <strong className="event-ribbon-day">
                              {parseDateKey(event.date).getDate()}
                            </strong>
                          </span>
                        </time>
                        <button
                          className="event-save"
                          aria-label={`${savedIds.includes(event.id) ? 'Unsave' : 'Save'} ${event.title}`}
                          aria-pressed={savedIds.includes(event.id)}
                          onClick={() => toggleSaved(event.id)}
                        >
                          <Bookmark
                            size={16}
                            fill={savedIds.includes(event.id) ? 'currentColor' : 'none'}
                          />
                        </button>
                      </div>
                      <div className="student-event-body">
                        <div className="student-event-tags">
                          <span>{event.category}</span>
                          {event.sample && <small>EXAMPLE</small>}
                          {inCalendar(event.id) && (
                            <CalendarCheck size={13} aria-label="In your calendar" />
                          )}
                        </div>
                        <h3>
                          <button onClick={() => openEvent(event)}>{event.title}</button>
                        </h3>
                        <p className="event-host">by {event.host}</p>
                        <div className="event-info">
                          <span>
                            <Clock3 size={13} />
                            {event.timeUnannounced
                              ? 'Time to be announced'
                              : `${event.startTime} – ${event.endTime}`}
                          </span>
                          <span>
                            {event.online ? <Globe2 size={13} /> : <MapPin size={13} />}
                            {event.location}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="events-empty">
                  <Compass size={30} />
                  <h3>
                    {tab === 'saved' && !savedIds.length
                      ? 'Keep a little inspiration for later.'
                      : 'No events here just yet.'}
                  </h3>
                  <p>
                    {tab === 'saved' && !savedIds.length
                      ? 'Tap the bookmark on an event to save it here.'
                      : 'Try another category, date, or search to find your next thing.'}
                  </p>
                  <button
                    className="ev-button"
                    onClick={() => {
                      clearFilters();
                      if (tab !== 'discover') setTab('discover');
                    }}
                  >
                    Explore all events <ArrowRight size={14} />
                  </button>
                </div>
              )}
              <p className="events-preview-note">“Example” listings are sample events.</p>
            </section>
            <aside className="events-aside" aria-label="Event calendar and your plans">
              <section className="events-mini-calendar">
                <div className="events-mini-heading">
                  <h3>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h3>
                  <div>
                    <button
                      aria-label="Previous month"
                      onClick={() =>
                        setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
                      }
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      aria-label="Next month"
                      onClick={() =>
                        setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
                      }
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
                <div className="events-calendar-days">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                    <span key={`day-${index}`}>{day}</span>
                  ))}
                  {Array.from({ length: firstOffset }, (_, index) => (
                    <span key={`empty-${index}`} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, index) => {
                    const day = index + 1;
                    const key = localDateKey(new Date(month.getFullYear(), month.getMonth(), day));
                    const hasEvent = events.some((event) => event.date === key);
                    return (
                      <button
                        key={key}
                        className={hasEvent ? 'has-event' : ''}
                        aria-label={`${eventDate(key, { dateStyle: 'full' })}${hasEvent ? ', events available' : ''}`}
                        aria-pressed={date === key}
                        aria-current={key === localDateKey(new Date()) ? 'date' : undefined}
                        onClick={() => setDate(date === key ? '' : key)}
                      >
                        {day}
                        {hasEvent && <i />}
                      </button>
                    );
                  })}
                </div>
                <div className="events-calendar-key">
                  <span>
                    <i /> Event dates
                  </span>
                  {date && <button onClick={() => setDate('')}>Clear</button>}
                </div>
              </section>
              <section className="events-your-plans">
                <div className="events-mini-heading">
                  <h3>Your calendar</h3>
                  <CalendarCheck size={16} />
                </div>
                {myEvents.slice(0, 2).map((event) => (
                  <button className="events-plan" key={event.id} onClick={() => openEvent(event)}>
                    <span className="events-plan-date">
                      <b>{parseDateKey(event.date).getDate()}</b>
                      {eventDate(event.date, { month: 'short' })}
                    </span>
                    <span>
                      <strong>{event.title}</strong>
                      <small>{inCalendar(event.id) ? 'In your calendar' : 'Created by you'}</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))}
                {!myEvents.length && <p>No events in your calendar yet.</p>}
                <Link to="/calendar">
                  Open my calendar <ArrowUpRight size={14} />
                </Link>
              </section>
            </aside>
          </div>
        </div>
        {notice && (
          <div className="events-notice" role="status">
            <Check size={16} />
            <span>{notice}</span>
            <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
              <X size={15} />
            </button>
          </div>
        )}
        {selected && (
          <Modal
            open
            onClose={() => setSelected(null)}
            title={selected.title}
            description={`${selected.category} · by ${selected.host}`}
            className="events-dialog max-w-[590px]"
          >
            <div className="event-detail-art">
              <EventArtwork cover={selected.cover} />
            </div>
            {selected.sample && (
              <p className="event-detail-sample">
                Example event · For exploring the page. Registration is not available.
              </p>
            )}
            <div className="event-detail-facts">
              <div>
                <CalendarDays size={19} />
                <span>
                  <strong>
                    {eventDate(selected.date, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </strong>
                  <small>
                    {selected.timeUnannounced
                      ? 'Time to be announced'
                      : `${selected.startTime} – ${selected.endTime} · your local time`}
                  </small>
                </span>
              </div>
              <div>
                <MapPin size={19} />
                <span>
                  <strong>{selected.location}</strong>
                  <small>{selected.online ? 'Online event' : 'In person'}</small>
                </span>
              </div>
            </div>
            <h3 className="event-about-title">A little about the event</h3>
            <p className="event-detail-description">{selected.description}</p>
            <div className="event-detail-actions">
              <button className="ev-button ev-button--primary" onClick={() => schedule(selected)}>
                {inCalendar(selected.id) ? <CalendarDays size={16} /> : <Plus size={16} />}
                {inCalendar(selected.id) ? 'View in calendar' : 'Add to my calendar'}
              </button>
              <button
                className="ev-button"
                aria-pressed={savedIds.includes(selected.id)}
                onClick={() => toggleSaved(selected.id)}
              >
                <Bookmark
                  size={16}
                  fill={savedIds.includes(selected.id) ? 'currentColor' : 'none'}
                />
                {savedIds.includes(selected.id) ? 'Saved' : 'Save'}
              </button>
              <button
                className="ev-button"
                onClick={() => {
                  void share(selected);
                }}
                aria-label="Copy event details"
              >
                <Share2 size={16} />
              </button>
            </div>
            <p className="event-detail-note">
              Adding an event saves it to your Uni-Pilot calendar. It does not register you with an
              organizer.
            </p>
            {shareText && (
              <label className="event-share-fallback">
                Copy these event details
                <textarea
                  readOnly
                  value={shareText}
                  onFocus={(event) => event.target.select()}
                  rows={5}
                />
              </label>
            )}
          </Modal>
        )}
        {creating && <CreateStudentEvent onClose={() => setCreating(false)} onCreate={created} />}
      </div>
    </Page>
  );
}
