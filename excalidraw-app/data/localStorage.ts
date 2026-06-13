import {
  clearAppStateForLocalStorage,
  getDefaultAppState,
} from "@excalidraw/excalidraw/appState";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";

export const importFromLocalStorage = () => {
  let savedElements = null;
  let savedState = null;

  try {
    savedElements = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS);
    savedState = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_APP_STATE);
  } catch (error: any) {
    console.error(error);
  }

  let elements: ExcalidrawElement[] = [];
  if (savedElements) {
    try {
      elements = JSON.parse(savedElements);
    } catch (error: any) {
      console.error(error);
    }
  }

  let appState = null;
  if (savedState) {
    try {
      appState = {
        ...getDefaultAppState(),
        ...clearAppStateForLocalStorage(
          JSON.parse(savedState) as Partial<AppState>,
        ),
      };
    } catch (error: any) {
      console.error(error);
    }
  }
  return { elements, appState };
};

export const getElementsStorageSize = () => {
  try {
    const elements = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS);
    return elements?.length || 0;
  } catch (error: any) {
    console.error(error);
    return 0;
  }
};

export const getTotalStorageSize = () => {
  try {
    const appState = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_APP_STATE);
    return (appState?.length || 0) + getElementsStorageSize();
  } catch (error: any) {
    console.error(error);
    return 0;
  }
};
