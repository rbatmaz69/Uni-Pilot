import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui';

interface FocusSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FocusSessionModal({ isOpen, onClose }: FocusSessionModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState('Programming II');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRunning && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, secondsLeft]);

  if (!isOpen) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const resetTimer = () => {
    setIsRunning(false);
    setSecondsLeft(25 * 60);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Focus session timer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-sm animate-page-enter"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-line-soft bg-surface p-6 shadow-raised">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close focus timer"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-secondary hover:text-primary transition-colors"
        >
          <X size={18} />
        </button>

        <div className="text-center">
          <span className="rounded-full bg-orange-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-orange">
            Deep Work Focus
          </span>
          <h2 className="mt-2 text-[22px] font-bold tracking-tight text-primary">Focus Session</h2>
          <p className="mt-0.5 text-[13px] text-muted">Eliminate distractions. Current module:</p>

          <div className="mt-3 flex justify-center gap-1.5 flex-wrap">
            {['Programming II', 'Database Systems', 'Algorithms', 'HCI'].map((subj) => (
              <button
                key={subj}
                type="button"
                onClick={() => setSelectedSubject(subj)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  selectedSubject === subj
                    ? 'bg-primary text-inverted'
                    : 'bg-surface-secondary text-secondary hover:text-primary'
                }`}
              >
                {subj}
              </button>
            ))}
          </div>

          {/* Big timer display */}
          <div className="my-8 font-mono text-[56px] font-extrabold tracking-tight text-primary">
            {formattedTime}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsRunning(!isRunning)}
              leadingIcon={isRunning ? <Pause size={16} /> : <Play size={16} />}
              className="px-6 py-2.5 bg-primary text-inverted font-semibold"
            >
              {isRunning ? 'Pause' : 'Start Focus'}
            </Button>

            <button
              type="button"
              onClick={resetTimer}
              aria-label="Reset timer"
              className="grid h-10 w-10 place-items-center rounded-full border border-line-soft bg-surface text-secondary hover:bg-surface-secondary hover:text-primary transition-colors"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
