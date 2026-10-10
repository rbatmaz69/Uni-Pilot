import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sectionOf } from '@/lib/tabs';
import { useTabStore } from '@/store/tabStore';

/**
 * Keeps the open tab and the window together, both ways. Every address the
 * router shows goes into the open tab — a click on the rail, a link, a
 * redirect; addresses that are no page of their own (`/`, an old link on its
 * way elsewhere) are skipped, so a redirect leaves no step behind for Back.
 * The first page the window shows replaces the tab's place rather than adding
 * a step: opening the app somewhere (a link, `renderApp` in a test) is not a
 * place to go back from. And where a tab action asks the window to go
 * (`request`: another tab, Back, a new tab), the router goes.
 */
export function TabSync() {
  const { pathname, search, key } = useLocation();
  const navigate = useNavigate();
  const request = useTabStore((state) => state.request);
  // `navigate` changes with every address, so each request is followed once only.
  const followed = useRef<number | null>(null);
  const arrived = useRef(false);

  useEffect(() => {
    const location = `${pathname}${search}`;
    if (!sectionOf(location)) return;
    useTabStore.getState().visit({ location }, !arrived.current);
    arrived.current = true;
  }, [pathname, search, key]);

  useEffect(() => {
    if (!request || followed.current === request.id) return;
    followed.current = request.id;
    void navigate(request.location);
  }, [request, navigate]);

  return null;
}
