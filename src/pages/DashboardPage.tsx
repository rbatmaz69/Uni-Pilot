import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActivityFeedWidget,
  AddAssignmentModal,
  AddEventModal,
  AgendaCalendarWidget,
  AssignmentsCard,
  CoursesGrid,
  DashboardHero,
  DeadlinesCard,
  MensaWidget,
  PublicTransitWidget,
  QuickAiModal,
} from '@/features/dashboard';
import { localDateKey } from '@/lib/date';
import { INITIAL_ASSIGNMENTS, TODAY_AGENDA } from '@/features/dashboard/lib/mockData';
import type { AgendaEvent, Assignment } from '@/features/dashboard/lib/types';
import { Page } from '@/components/layout';
import { NAV_ITEMS } from '@/lib/navigation';

export function DashboardPage() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>(INITIAL_ASSIGNMENTS);
  const [events, setEvents] = useState<AgendaEvent[]>(TODAY_AGENDA);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [addAssignmentOpen, setAddAssignmentOpen] = useState(false);
  const [eventDate, setEventDate] = useState(() => localDateKey(new Date()));
  const [addEventOpen, setAddEventOpen] = useState(false);

  const handleToggleAssignment = (id: string) => {
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              completed: !a.completed,
              progress: !a.completed ? 100 : 0,
            }
          : a,
      ),
    );
  };

  const handleAddAssignment = (newAssignment: Assignment) => {
    setAssignments((prev) => [newAssignment, ...prev]);
  };

  const handleAddEvent = (newEvent: AgendaEvent) => {
    setEvents((prev) => [...prev, newEvent]);
  };

  return (
    <Page item={NAV_ITEMS.dashboard} hideHeader>
      <div className="flex flex-col gap-7">
        {/* Hero Section */}
        <DashboardHero
          onStartFocus={() => {
            void navigate(NAV_ITEMS.focus.path);
          }}
          onAskAi={() => setAiModalOpen(true)}
        />

        {/* My Courses Section */}
        <CoursesGrid />

        <div className="grid grid-cols-1 gap-6 min-[1200px]:grid-cols-[minmax(0,1fr)_290px] 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-6">
            <AssignmentsCard
              assignments={assignments}
              onToggleAssignment={handleToggleAssignment}
              onAddAssignment={() => setAddAssignmentOpen(true)}
            />
            <ActivityFeedWidget />
            <div className="grid grid-cols-1 gap-4 min-[1450px]:grid-cols-2">
              <MensaWidget />
              <PublicTransitWidget />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <AgendaCalendarWidget
              events={events}
              onAddEvent={(date) => {
                setEventDate(date);
                setAddEventOpen(true);
              }}
            />
            <DeadlinesCard />
          </div>
        </div>

        {/* Interactive Modals */}
        <QuickAiModal isOpen={aiModalOpen} onClose={() => setAiModalOpen(false)} />
        <AddAssignmentModal
          isOpen={addAssignmentOpen}
          onClose={() => setAddAssignmentOpen(false)}
          onAdd={handleAddAssignment}
        />
        <AddEventModal
          key={eventDate}
          initialDate={eventDate}
          isOpen={addEventOpen}
          onClose={() => setAddEventOpen(false)}
          onAdd={handleAddEvent}
        />
      </div>
    </Page>
  );
}
