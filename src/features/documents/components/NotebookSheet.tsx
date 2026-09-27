import type { CSSProperties, RefObject } from 'react';
import { cn } from '@/lib/utils';
import { PageClone } from './NotebookPage';

/**
 * A page turn in progress. `turn` and `quick` play by themselves; `drag`
 * follows the pointer; `settle` glides a released sheet over or back.
 */
export type Flip = {
  id: number;
  from: number;
  to: number;
  motion: 'turn' | 'quick' | 'drag' | 'settle';
  /** How far the sheet has turned, 0 to 1, while dragged or settling. */
  progress: number;
};

type NotebookSheetProps = {
  flip: Flip;
  source: RefObject<HTMLDivElement | null>;
  pageWidth: number;
  onDone: () => void;
};

/**
 * The sheet being turned, plus the page it uncovers and the shadow it casts.
 * The live editor already shows the destination spread underneath, so the
 * sheet carries copies of the pages that are leaving and arriving.
 */
export function NotebookSheet({ flip, source, pageWidth, onDone }: NotebookSheetProps) {
  const forward = flip.to > flip.from;
  const held = flip.motion === 'drag' || flip.motion === 'settle';
  // The sheet lifts off the page, shading most when it stands upright.
  const lift = Math.sin(flip.progress * Math.PI);
  const sheetStyle: CSSProperties | undefined = held
    ? { transform: `rotateY(${(forward ? -180 : 180) * flip.progress}deg)` }
    : undefined;
  const shadeStyle: CSSProperties | undefined = held ? { opacity: lift } : undefined;
  const leaving = forward ? flip.from * 2 + 1 : flip.from * 2;
  const arriving = forward ? flip.to * 2 : flip.to * 2 + 1;
  const still = forward ? flip.from * 2 : flip.from * 2 + 1;

  return (
    <div className="notebook-flip" aria-hidden>
      <div className={`notebook-under is-${forward ? 'left' : 'right'}`}>
        <PageClone
          source={source}
          page={still}
          pageWidth={pageWidth}
          side={forward ? 'left' : 'right'}
        />
      </div>
      <div
        className={cn('notebook-turning', forward ? 'is-next' : 'is-prev', `is-${flip.motion}`)}
        style={sheetStyle}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) onDone();
        }}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'transform') onDone();
        }}
      >
        <div className="notebook-face" style={shadeStyle && { ['--lift' as string]: lift }}>
          <PageClone
            source={source}
            page={leaving}
            pageWidth={pageWidth}
            side={forward ? 'right' : 'left'}
          />
        </div>
        <div className="notebook-face is-back" style={shadeStyle && { ['--lift' as string]: lift }}>
          <PageClone
            source={source}
            page={arriving}
            pageWidth={pageWidth}
            side={forward ? 'left' : 'right'}
            back
          />
        </div>
      </div>
      <div
        className={cn('notebook-cast', forward ? 'is-right' : 'is-left', `is-${flip.motion}`)}
        style={shadeStyle}
      />
    </div>
  );
}
