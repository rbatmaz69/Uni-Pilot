import { useEffect } from 'react';
import { useFocusStore } from '@/features/focus/store/focusStore';
import { playFocusSound } from '@/features/focus/lib/sound';

/** Lives outside the route. Deadlines survive navigation, throttling and reloads. */
export function FocusService() {
  useEffect(() => {
    const check = () => {
      const session = useFocusStore.getState().checkDeadline();
      if (session && useFocusStore.getState().soundEnabled) playFocusSound();
    };
    check();
    const timer = window.setInterval(check, 500);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  return null;
}
