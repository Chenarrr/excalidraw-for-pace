// time constants (ms)
export const SAVE_TO_LOCAL_STORAGE_TIMEOUT = 300;
export const FILE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024; // 4 MiB
export const FILE_CACHE_MAX_AGE_SEC = 31536000;
export const SYNC_BROWSER_TABS_TIMEOUT = 50;

export const STORAGE_KEYS = {
  LOCAL_STORAGE_ELEMENTS: "pace-canvas",
  LOCAL_STORAGE_APP_STATE: "pace-canvas-state",
  LOCAL_STORAGE_THEME: "pace-canvas-theme",
  LOCAL_STORAGE_DEBUG: "pace-canvas-debug",
  VERSION_DATA_STATE: "version-dataState",
  VERSION_FILES: "version-files",

  IDB_LIBRARY: "pace-canvas-library",

  // do not use apart from migrations
  __LEGACY_LOCAL_STORAGE_LIBRARY: "excalidraw-library",
} as const;

export const COOKIES = {} as const;
