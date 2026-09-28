// Shared by CSS (through custom properties), hydration and closing navigation.
export const FOLDER_OPEN_MS = 360;
export const FOLDER_STAGGER_MS = 12;
export const FOLDER_STAGGER_LIMIT = 6;
export const FOLDER_CLOSE_MS = 240;
export const FOLDER_SETTLE_MS = FOLDER_OPEN_MS + FOLDER_STAGGER_MS * FOLDER_STAGGER_LIMIT;
