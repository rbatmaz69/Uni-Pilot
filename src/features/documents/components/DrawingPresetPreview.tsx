import type { ReactNode } from 'react';
import type { DrawingPresetId } from '@/features/documents/lib/drawingPresets';

const PAPER = {
  yellow: '#fff1b8',
  peach: '#ffd9c8',
  mint: '#d9f1dc',
  blue: '#d8eaff',
  paper: '#f8f4e9',
};
type Tone = keyof typeof PAPER;

function card(
  x: number,
  y: number,
  width: number,
  height: number,
  tone: Tone,
  label?: string,
  folded = false,
) {
  return (
    <g key={`${x}-${y}`}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={folded ? 0 : 2}
        fill={PAPER[tone]}
        stroke="#536474"
        strokeOpacity=".18"
      />
      {folded && (
        <path d={`M${x + width - 9} ${y + height}v-9h9Z`} fill="#b49b53" fillOpacity=".2" />
      )}
      {label && (
        <text x={x + 6} y={y + 11} fill="#40505c" fontSize="5.5" fontWeight="600">
          {label}
        </text>
      )}
      {height > 30 && (
        <path
          d={`M${x + 6} ${y + 20}h${width * 0.65}m${-width * 0.65} 7h${width * 0.48}`}
          stroke="#536474"
          strokeOpacity=".24"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

/** Small illustrations of the cards and arrangements that will be inserted. */
export function DrawingPresetPreview({
  id,
  target,
}: {
  id: DrawingPresetId;
  target: 'canvas' | 'note';
}) {
  let content: ReactNode;
  if (id.startsWith('sticky-')) {
    const tone = id.slice(7) as Tone;
    content = card(43, 10, 74, 64, tone, 'An idea…', true);
  } else if (id === 'study-card') {
    content = (
      <>
        {card(25, 12, 110, 60, 'paper', 'Question')}
        <path d="M31 43h98" stroke="#536474" strokeOpacity=".16" />
        <text x="31" y="56" fill="#677582" fontSize="5.5">
          Write the answer…
        </text>
      </>
    );
  } else if (id === 'flow') {
    content = (
      <>
        {card(4, 24, 42, 38, 'blue', 'Start')}
        {card(59, 24, 42, 38, 'yellow', 'Key idea')}
        {card(114, 24, 42, 38, 'mint', 'Result')}
        <path d="M48 43h9m-4-3 4 3-4 3M103 43h9m-4-3 4 3-4 3" stroke="#81909e" />
      </>
    );
  } else if (id === 'compare') {
    content = (
      <>
        {card(12, 10, 63, 64, 'blue', 'Option A', true)}
        {card(85, 10, 63, 64, 'yellow', 'Option B', true)}
      </>
    );
  } else if (id === 'cornell') {
    content = (
      <>
        {card(18, 5, 38, 46, 'blue', 'Cues')}
        {card(61, 5, 81, 46, 'paper', 'Main notes')}
        {card(18, 56, 124, 25, 'yellow', 'Summary')}
      </>
    );
  } else if (id === 'study-board') {
    content = (
      <>
        {card(5, 10, 46, 64, 'blue', 'To study', true)}
        {card(57, 10, 46, 64, 'yellow', 'Studying', true)}
        {card(109, 10, 46, 64, 'mint', 'Mastered', true)}
      </>
    );
  } else if (id === 'mind-map') {
    content =
      target === 'canvas' ? (
        <>
          <path d="M40 24 65 37m30 0 25-13M40 61l25-13m30 0 25 13" stroke="#81909e" />
          {card(4, 4, 40, 28, 'blue', 'Idea 1')}
          {card(116, 4, 40, 28, 'mint', 'Idea 2')}
          {card(4, 55, 40, 28, 'peach', 'Idea 3')}
          {card(116, 55, 40, 28, 'blue', 'Idea 4')}
          <ellipse cx="80" cy="43" rx="24" ry="15" fill={PAPER.yellow} />
          <text x="80" y="45" textAnchor="middle" fill="#40505c" fontSize="6">
            Main topic
          </text>
        </>
      ) : (
        <>
          <path d="M80 24v9M40 35h80M40 35v8m80-8v8M40 63v5m80-5v5" stroke="#81909e" />
          <ellipse cx="80" cy="14" rx="36" ry="12" fill={PAPER.yellow} />
          <text x="80" y="16" textAnchor="middle" fill="#40505c" fontSize="6">
            Main topic
          </text>
          {card(12, 39, 58, 20, 'blue', 'Idea 1')}
          {card(90, 39, 58, 20, 'mint', 'Idea 2')}
          {card(12, 65, 58, 20, 'peach', 'Idea 3')}
          {card(90, 65, 58, 20, 'blue', 'Idea 4')}
        </>
      );
  } else {
    content = (
      <g fill={PAPER.blue} stroke="#52758d" strokeWidth="1.5">
        {id === 'rectangle' && <rect x="33" y="17" width="94" height="52" rx="3" />}
        {id === 'ellipse' && <ellipse cx="80" cy="43" rx="45" ry="29" />}
        {id === 'diamond' && <path d="m80 8 49 35-49 35-49-35Z" />}
        {id === 'arrow' &&
          (target === 'note' ? (
            <path d="M25 28h72V15l39 28-39 28V58H25Z" />
          ) : (
            <path d="M24 43h110m-15-12 15 12-15 12" fill="none" />
          ))}
      </g>
    );
  }
  return (
    <svg viewBox="0 0 160 88" fill="none" aria-hidden="true">
      {content}
    </svg>
  );
}
