import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';

export type DrawingPresetId =
  | 'sticky-yellow'
  | 'sticky-peach'
  | 'sticky-mint'
  | 'sticky-blue'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'study-card'
  | 'flow'
  | 'compare'
  | 'cornell'
  | 'study-board'
  | 'mind-map';

type Point = { x: number; y: number };
type Preset = { width: number; height: number; elements: ExcalidrawElementSkeleton[] };

const STICKY_COLORS: Record<string, { paper: string; ink: string }> = {
  'sticky-yellow': { paper: '#fff1b8', ink: '#5c4716' },
  'sticky-peach': { paper: '#ffd9c8', ink: '#653d35' },
  'sticky-mint': { paper: '#d9f1dc', ink: '#315345' },
  'sticky-blue': { paper: '#d8eaff', ink: '#344c68' },
};

const makeId = () => crypto.randomUUID();

function paperCard(
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  backgroundColor: string,
  strokeColor: string,
  id?: string,
): ExcalidrawElementSkeleton {
  return {
    type: 'rectangle',
    ...(id ? { id } : {}),
    x,
    y,
    width,
    height,
    backgroundColor,
    strokeColor,
    fillStyle: 'solid',
    roughness: 0,
    strokeWidth: 1,
    roundness: null,
    label: {
      text,
      fontSize: 21,
      textAlign: 'left',
      verticalAlign: 'top',
      strokeColor,
    },
  };
}

function flowArrow(
  x: number,
  y: number,
  width: number,
  start: string,
  end: string,
): ExcalidrawElementSkeleton {
  return {
    type: 'arrow',
    x,
    y,
    width,
    height: 0,
    strokeColor: '#718495',
    strokeWidth: 2,
    endArrowhead: 'triangle',
    start: { id: start },
    end: { id: end },
  };
}

/** Editable Excalidraw elements, placed around the visible canvas center. */
export function createDrawingPreset(id: DrawingPresetId, center: Point): Preset {
  const sticky = STICKY_COLORS[id];
  if (sticky) {
    const width = 230;
    const height = 205;
    return {
      width,
      height,
      elements: [
        paperCard(
          center.x - width / 2,
          center.y - height / 2,
          width,
          height,
          'Write an idea…',
          sticky.paper,
          sticky.ink,
        ),
      ],
    };
  }

  if (id === 'rectangle' || id === 'ellipse' || id === 'diamond') {
    const width = 196;
    const height = 124;
    return {
      width,
      height,
      elements: [
        {
          type: id,
          x: center.x - width / 2,
          y: center.y - height / 2,
          width,
          height,
          strokeColor: '#52758d',
          backgroundColor: '#e8f2f7',
          fillStyle: 'solid',
          strokeWidth: 2,
        },
      ],
    };
  }

  if (id === 'arrow') {
    const width = 220;
    return {
      width,
      height: 20,
      elements: [
        {
          type: 'arrow',
          x: center.x - width / 2,
          y: center.y,
          width,
          height: 0,
          strokeColor: '#52758d',
          strokeWidth: 2,
          endArrowhead: 'triangle',
        },
      ],
    };
  }

  if (id === 'study-card') {
    const width = 300;
    const height = 190;
    return {
      width,
      height,
      elements: [
        paperCard(
          center.x - width / 2,
          center.y - height / 2,
          width,
          height,
          'Question\n\nWrite the answer…',
          '#f8f4e9',
          '#3f5360',
        ),
      ],
    };
  }

  if (id === 'flow') {
    const width = 690;
    const height = 120;
    const x = center.x - width / 2;
    const y = center.y - height / 2;
    const ids: [string, string, string] = [makeId(), makeId(), makeId()];
    return {
      width,
      height,
      elements: [
        paperCard(x, y, 190, height, 'Start', '#e8f2f7', '#365873', ids[0]),
        paperCard(x + 250, y, 190, height, 'Key idea', '#fff1b8', '#5c4716', ids[1]),
        paperCard(x + 500, y, 190, height, 'Result', '#d9f1dc', '#315345', ids[2]),
        flowArrow(x + 192, center.y, 56, ids[0], ids[1]),
        flowArrow(x + 442, center.y, 56, ids[1], ids[2]),
      ],
    };
  }

  if (id === 'compare') {
    const width = 640;
    const height = 250;
    const x = center.x - width / 2;
    const y = center.y - height / 2;
    return {
      width,
      height,
      elements: [
        paperCard(x, y, 300, height, 'Option A\n\nAdd your notes…', '#e8f2f7', '#365873'),
        paperCard(x + 340, y, 300, height, 'Option B\n\nAdd your notes…', '#fff1b8', '#5c4716'),
      ],
    };
  }

  if (id === 'cornell') {
    const width = 670;
    const height = 470;
    const x = center.x - width / 2;
    const y = center.y - height / 2;
    return {
      width,
      height,
      elements: [
        paperCard(x, y, 200, 320, 'Cues & questions\n\nKey terms…', '#e8f2f7', '#365873'),
        paperCard(x + 220, y, 450, 320, 'Main notes\n\nCapture the lesson…', '#f8f4e9', '#3f5360'),
        paperCard(
          x,
          y + 340,
          width,
          130,
          'Summary\n\nExplain it in your own words…',
          '#fff1b8',
          '#5c4716',
        ),
      ],
    };
  }

  if (id === 'study-board') {
    const width = 680;
    const height = 290;
    const x = center.x - width / 2;
    const y = center.y - height / 2;
    return {
      width,
      height,
      elements: [
        paperCard(x, y, 210, height, 'To study\n\nAdd topics…', '#d8eaff', '#344c68'),
        paperCard(x + 235, y, 210, height, 'Studying\n\nWork in progress…', '#fff1b8', '#5c4716'),
        paperCard(x + 470, y, 210, height, 'Mastered\n\nWhat you know…', '#d9f1dc', '#315345'),
      ],
    };
  }

  const width = 680;
  const height = 410;
  const x = center.x - width / 2;
  const y = center.y - height / 2;
  const ids: [string, string, string, string, string] = [
    makeId(),
    makeId(),
    makeId(),
    makeId(),
    makeId(),
  ];
  return {
    width,
    height,
    elements: [
      {
        type: 'ellipse',
        id: ids[0],
        x: x + 250,
        y: y + 145,
        width: 180,
        height: 120,
        backgroundColor: '#fff1b8',
        strokeColor: '#8e7134',
        fillStyle: 'solid',
        label: { text: 'Main topic', fontSize: 22 },
      },
      paperCard(x, y, 190, 100, 'Idea 1', '#d8eaff', '#344c68', ids[1]),
      paperCard(x + 490, y, 190, 100, 'Idea 2', '#d9f1dc', '#315345', ids[2]),
      paperCard(x, y + 310, 190, 100, 'Idea 3', '#ffd9c8', '#653d35', ids[3]),
      paperCard(x + 490, y + 310, 190, 100, 'Idea 4', '#f4e2ee', '#694a64', ids[4]),
      flowArrow(x + 188, y + 100, 70, ids[1], ids[0]),
      flowArrow(x + 430, y + 145, 62, ids[0], ids[2]),
      flowArrow(x + 188, y + 310, 70, ids[3], ids[0]),
      flowArrow(x + 430, y + 265, 62, ids[0], ids[4]),
    ],
  };
}
