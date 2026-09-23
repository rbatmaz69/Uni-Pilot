import { useState } from 'react';
import { AppWindow } from 'lucide-react';
import { Button } from '@/components/ui';
import { belongsToIlias, openIlias } from '@/features/integrations/lib/iliasWindow';
import { useIliasStore } from '@/features/integrations/store/iliasStore';

interface OpenInIliasButtonProps {
  /** A link from a calendar entry — for ILIAS feeds, the course or exercise. */
  url: string;
}

/**
 * "Open in ILIAS" for anything that carries a link into it.
 *
 * Renders nothing unless ILIAS is connected and the link belongs to it, so a
 * button never appears that could only fail. A timetable entry from splan has
 * no link and shows nothing; an ILIAS deadline links to its exercise and opens
 * there, not on the ILIAS start page.
 *
 * Lives here rather than in the calendar so that everything ILIAS-shaped stays
 * in this feature; the calendar only knows that an entry may have a link.
 */
export function OpenInIliasButton({ url }: OpenInIliasButtonProps) {
  const connection = useIliasStore((state) => state.connection);
  const [error, setError] = useState<string | null>(null);

  if (!connection || !belongsToIlias(connection, url)) return null;

  const open = async () => {
    setError(null);
    try {
      await openIlias(connection, url);
    } catch (cause) {
      // Tauri rejects with the Rust error string itself.
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <>
      {error ? (
        <span role="alert" className="text-[11.5px] text-coral">
          {error}
        </span>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void open()}
        leadingIcon={<AppWindow size={14} strokeWidth={1.8} aria-hidden />}
      >
        Open in ILIAS
      </Button>
    </>
  );
}
