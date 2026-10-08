import { fileKind, type CourseFileKind } from '@/features/courses/lib/courses';

const FILE_STYLES: Record<CourseFileKind, { color: string; fold: string; label: string }> = {
  pdf: { color: '#e64027', fold: '#ff8b77', label: 'PDF' },
  document: { color: '#2769d7', fold: '#8cb8ff', label: 'DOC' },
  image: { color: '#168b81', fold: '#73d3c7', label: 'IMG' },
  presentation: { color: '#c86225', fold: '#f3ad7b', label: 'PPT' },
  spreadsheet: { color: '#238155', fold: '#83cfa3', label: 'XLS' },
  other: { color: '#64748b', fold: '#a9b6c8', label: 'FILE' },
};

/** A compact, recognisable file badge for the type ILIAS reports. */
export function CourseFileIcon({
  title,
  suffix,
  size = 'md',
}: {
  title: string;
  suffix: string | null;
  size?: 'sm' | 'md';
}) {
  const kind = fileKind(suffix, title);
  const { color, fold, label } = FILE_STYLES[kind];

  return (
    <svg
      aria-hidden="true"
      data-file-kind={kind}
      className={`${size === 'sm' ? 'h-6 w-5' : 'h-11 w-9'} shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]`}
      viewBox="0 0 36 44"
      fill="none"
    >
      <path d="M3 0h20l10 10v31a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3Z" fill={color} />
      <path d="M23 0v8a2 2 0 0 0 2 2h8L23 0Z" fill={fold} />
      {kind === 'image' ? (
        <>
          <circle cx="12" cy="17" r="2.3" fill="white" />
          <path d="m7 29 6.2-7 4.2 4 4.3-5L28 29H7Z" fill="white" />
        </>
      ) : kind === 'document' ? (
        <>
          <path d="M8 16h17M8 21h17M8 26h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <text
            x="18"
            y="38"
            fill="white"
            textAnchor="middle"
            fontSize="7"
            fontWeight="700"
            fontFamily="sans-serif"
          >
            {label}
          </text>
        </>
      ) : (
        <text
          x="16.5"
          y="38"
          fill="white"
          textAnchor="middle"
          fontSize={label.length > 3 ? 6 : 8}
          fontWeight="700"
          fontFamily="sans-serif"
        >
          {label}
        </text>
      )}
    </svg>
  );
}
