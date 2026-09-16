import { useState, type FormEvent } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import {
  CATEGORIES,
  type Category,
  type Cover,
  type StudentEvent,
} from '@/features/events/lib/events';
import { EventArtwork } from '@/features/events/components/EventArtwork';
import { localDateKey } from '@/lib/date';

export function CreateStudentEvent({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (event: StudentEvent) => void;
}) {
  const [cover, setCover] = useState<Cover>('build');
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => {
      const entry = form.get(key);
      return typeof entry === 'string' ? entry.trim() : '';
    };
    if (!value('title') || !value('location') || !value('host') || !value('description')) {
      setError('Please fill in the event details.');
      return;
    }
    if (value('endTime') <= value('startTime')) {
      setError('Choose an end time after the start time.');
      return;
    }
    onCreate({
      id: `student-event-${crypto.randomUUID()}`,
      title: value('title'),
      category: value('category') as Category,
      date: value('date'),
      startTime: value('startTime'),
      endTime: value('endTime'),
      location: value('location'),
      online: value('format') === 'online',
      host: value('host'),
      description: value('description'),
      cover,
    });
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Bring people together."
      description="Create an event for your personal campus collection. Events stay on this device."
      className="events-dialog max-w-[620px]"
    >
      <form onSubmit={submit} className="event-create-form">
        <div className="event-cover-choices" role="group" aria-label="Choose event cover">
          {(['build', 'design', 'career', 'meetup', 'campus'] as Cover[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`${option} cover`}
              aria-pressed={cover === option}
              onClick={() => setCover(option)}
            >
              <EventArtwork cover={option} compact />
              {cover === option && (
                <span>
                  <Check size={14} />
                </span>
              )}
            </button>
          ))}
        </div>
        <label>
          Event name
          <input name="title" placeholder="Give your idea a name" required maxLength={90} />
        </label>
        <div className="event-form-row">
          <label>
            Category
            <select name="category">
              {CATEGORIES.slice(1).map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Hosted by
            <input name="host" placeholder="Your name or student club" required maxLength={80} />
          </label>
        </div>
        <div className="event-form-row event-form-time">
          <label>
            Date
            <input
              type="date"
              name="date"
              required
              min={localDateKey(new Date())}
              defaultValue={localDateKey(new Date())}
            />
          </label>
          <label>
            Starts
            <input type="time" name="startTime" required defaultValue="16:00" />
          </label>
          <label>
            Ends
            <input type="time" name="endTime" required defaultValue="18:00" />
          </label>
        </div>
        <div className="event-form-row">
          <label>
            Format
            <select name="format">
              <option value="in-person">In person</option>
              <option value="online">Online</option>
            </select>
          </label>
          <label>
            Location or meeting link
            <input name="location" placeholder="Where are we meeting?" required maxLength={250} />
          </label>
        </div>
        <label>
          About the event
          <textarea
            name="description"
            placeholder="What’s the plan? Who should come along?"
            required
            rows={3}
            maxLength={2000}
          />
        </label>
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
        <button className="ev-button ev-button--primary" type="submit">
          Create event <ArrowRight size={16} />
        </button>
      </form>
    </Modal>
  );
}
