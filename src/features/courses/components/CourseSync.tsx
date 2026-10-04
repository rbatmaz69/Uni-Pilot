import { useEffect } from 'react';
import { canEmbedIlias } from '@/features/integrations/lib/iliasView';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { useUiStore } from '@/store/uiStore';
import { useCourseStore } from '@/features/courses/store/courseStore';
import {
  listenToCourseFiles,
  useCourseFilesStore,
} from '@/features/courses/store/courseFilesStore';

/**
 * Under ILIAS's idle timeout — 30 minutes by default — so a sign-in lasts as
 * long as Uni Pilot runs. One request each time, the course list.
 */
export const KEEP_ALIVE_MS = 15 * 60 * 1000;

/** How often Uni Pilot looks at the clock to notice it slept. */
const TICK_MS = 30 * 1000;
/** A tick this late means the computer was asleep in between. */
const SLEPT_MS = 90 * 1000;
/** Coming back to the window asks ILIAS again only after this long. */
const RETURN_GAP_MS = 5 * 60 * 1000;

/**
 * Keeps the ILIAS sign-in alive while Uni Pilot runs, and the course list
 * fresh with it.
 *
 * Signing in to ILIAS at HHN takes a password and an authenticator code, and
 * ILIAS ends the sign-in after an idle while — 30 minutes by default. Reading
 * the course list every quarter of an hour counts as activity. A closed lid
 * stops every timer, so the moment the computer wakes, or the student comes
 * back to the window after a while, Uni Pilot asks at once rather than at the
 * next quarter hour: a break shorter than ILIAS's limit costs nothing. If the
 * session did end, the store asks the sign-on for a new one before anyone is
 * bothered (`withRenewal`). Once even that fails, the pings stop — they could
 * not bring the sign-in back — until the student signs in.
 *
 * Each time the course list arrives — a ping, or the Courses page — the
 * courses the student set to sync automatically are synced when due
 * (`courseFilesStore`): the sign-in is known to work at that moment, and the
 * sync adds no reason of its own to wake ILIAS.
 *
 * At start it asks once, right away: ILIAS ends its sign-in when Uni Pilot
 * quits, and the student should hear about it now — with face unlock's bar,
 * if they allowed it — not at the first quarter hour or when they happen to
 * open a course.
 *
 * Coming back from ILIAS mode while the sign-in was missing asks once more:
 * the student may have signed in there. Until that answer, the read is under
 * way, and face unlock's bar — which turns the camera on — waits for it.
 *
 * Mounted with the app, not a route: leaving the Courses page must not end it.
 */
export function CourseSync() {
  useEffect(() => {
    if (!canEmbedIlias()) return;
    let lastPing = Date.now();
    let lastTick = Date.now();

    const ping = () => {
      const connection = useIliasStore.getState().connection;
      const { failure, loadCourses } = useCourseStore.getState();
      if (!connection || failure?.kind === 'session-expired') return;
      lastPing = Date.now();
      void loadCourses(connection);
    };

    const keepAlive = setInterval(ping, KEEP_ALIVE_MS);
    const clock = setInterval(() => {
      const now = Date.now();
      const slept = now - lastTick > SLEPT_MS;
      lastTick = now;
      if (slept) ping();
    }, TICK_MS);
    const back = () => {
      if (Date.now() - lastPing > RETURN_GAP_MS) ping();
    };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);

    // At start, once: whether the sign-in survived the last quit.
    ping();

    void listenToCourseFiles().catch(() => undefined);
    const stopWatching = useCourseStore.subscribe((state, before) => {
      const read = state.courses?.loadedAt;
      const connection = useIliasStore.getState().connection;
      if (!read || read === before.courses?.loadedAt || !connection || !state.courses) return;
      void useCourseFilesStore.getState().syncDue(connection, state.courses.items);
    });

    const stopLeaving = useUiStore.subscribe((state, before) => {
      if (state.immersive || !before.immersive) return;
      const connection = useIliasStore.getState().connection;
      const { failure, loadCourses } = useCourseStore.getState();
      if (connection && failure?.kind === 'session-expired') void loadCourses(connection);
    });

    return () => {
      stopLeaving();
      clearInterval(keepAlive);
      clearInterval(clock);
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
      stopWatching();
    };
  }, []);
  return null;
}
