import {
  Excalidraw,
  CaptureUpdateAction,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
  useEditorInterface,
} from "@excalidraw/excalidraw";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import {
  APP_NAME,
  EVENT,
  debounce,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  isDevEnv,
} from "@excalidraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@excalidraw/excalidraw/i18n";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { newElementWith } from "@excalidraw/element";
import clsx from "clsx";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@excalidraw/excalidraw/data/library";

import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";
import type {
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
} from "@excalidraw/excalidraw/types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import CustomStats from "./CustomStats";
import {
  Provider,
  useAtom,
  useAtomValue,
  appJotaiStore,
} from "./app-jotai";
import {
  STORAGE_KEYS,
  SYNC_BROWSER_TABS_TIMEOUT,
} from "./app_constants";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { AppSidebar } from "./components/AppSidebar";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import { updateStaleImageStatuses } from "./data/FileManager";
import { FileStatusStore } from "./data/fileStatusStore";
import { importFromLocalStorage } from "./data/localStorage";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
  localStorageQuotaExceededAtom,
} from "./data/LocalData";
import { isBrowserStorageStateNewer } from "./data/tabSync";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { useAppLangCode } from "./app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState,
} from "./components/DebugCanvas";

import "./index.scss";

polyfill();

window.EXCALIDRAW_THROTTLE_RENDER = true;

declare global {
  interface BeforeInstallPromptEventChoiceResult {
    outcome: "accepted" | "dismissed";
  }
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<BeforeInstallPromptEventChoiceResult>;
  }
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let pwaEvent: BeforeInstallPromptEvent | null = null;

window.addEventListener("beforeinstallprompt", (event: BeforeInstallPromptEvent) => {
  event.preventDefault();
  pwaEvent = event;
});

const initializeScene = async (opts: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}): Promise<{ scene: ExcalidrawInitialDataState | null }> => {
  const localDataState = importFromLocalStorage();

  const scene: Omit<RestoredDataState, "files"> & { scrollToContent?: boolean } = {
    elements: restoreElements(localDataState?.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState(localDataState?.appState, null),
  };

  return { scene };
};

const ExcalidrawWrapper = () => {
  const excalidrawAPI = useExcalidrawAPI();

  const [errorMessage, setErrorMessage] = useState("");
  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();
  const [langCode, setLangCode] = useAppLangCode();
  const editorInterface = useEditorInterface();

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  const [, forceRefresh] = useState(false);

  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();
      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = { data: [] };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [excalidrawAPI]);

  const loadImages = useCallback(
    (data: { scene: ExcalidrawInitialDataState | null }, isInitialLoad = false) => {
      if (!data.scene || !excalidrawAPI) return;

      const fileIds =
        data.scene.elements?.reduce((acc, element) => {
          if ("fileId" in element && element.fileId) {
            return acc.concat(element.fileId);
          }
          return acc;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }, [] as any[]) || [];

      if (isInitialLoad && fileIds.length) {
        LocalData.fileStorage
          .getFiles(fileIds)
          .then(async ({ loadedFiles, erroredFiles }) => {
            if (loadedFiles.length) excalidrawAPI.addFiles(loadedFiles);
            updateStaleImageStatuses({
              excalidrawAPI,
              erroredFiles,
              elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
            });
          });
        LocalData.fileStorage.clearObsoleteFiles({ currentFileIds: fileIds });
      }
    },
    [excalidrawAPI],
  );

  useEffect(() => {
    if (!excalidrawAPI) return;

    initializeScene({ excalidrawAPI }).then(async (data) => {
      loadImages(data, true);
      initialStatePromiseRef.current.promise.resolve(data.scene);
    });

    const onHashChange = async (event: HashChangeEvent) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        excalidrawAPI.updateScene({ appState: { isLoading: true } });
        initializeScene({ excalidrawAPI }).then((data) => {
          loadImages(data);
          if (data.scene) {
            excalidrawAPI.updateScene({
              elements: restoreElements(data.scene.elements, null, { repairBindings: true }),
              appState: restoreAppState(data.scene.appState, null),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
        });
      }
    };

    const syncData = debounce(() => {
      if (isTestEnv()) return;
      if (!document.hidden) {
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = importFromLocalStorage();
          excalidrawAPI.updateScene({
            elements: restoreElements(localDataState?.elements, null, {
              repairBindings: true,
            }),
            appState: restoreAppState(localDataState?.appState, null),
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const onUnload = () => LocalData.flushSave();

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) LocalData.flushSave();
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    };
  }, [excalidrawAPI, loadImages, setLangCode]);

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();
      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(excalidrawAPI.getSceneElements())
      ) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          preventUnload(event);
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
  }, [excalidrawAPI]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (excalidrawAPI) {
          let didChange = false;
          const updatedElements = excalidrawAPI
            .getSceneElementsIncludingDeleted()
            .map((element) => {
              if (LocalData.fileStorage.shouldUpdateImageElementStatus(element)) {
                const newElement = newElementWith(element, { status: "saved" });
                if (newElement !== element) didChange = true;
                return newElement;
              }
              return element;
            });
          if (didChange) {
            excalidrawAPI.updateScene({
              elements: updatedElements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }
        }
      });
    }

    if (debugCanvasRef.current && excalidrawAPI) {
      debugRenderer(debugCanvasRef.current, appState, elements, window.devicePixelRatio);
    }
  };

  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => (
    <CustomStats
      setToast={(message) => excalidrawAPI!.setToast({ message })}
      appState={appState}
      elements={elements}
    />
  );

  return (
    <div style={{ height: "100%" }} className={clsx("excalidraw-app")}>
      <Excalidraw
        onChange={onChange}
        initialData={initialStatePromiseRef.current.promise}
        UIOptions={{ canvasActions: { toggleTheme: true } }}
        langCode={langCode}
        renderCustomStats={renderCustomStats}
        detectScroll={false}
        handleKeyboardGlobally={true}
        autoFocus={true}
        theme={editorTheme}
        onThemeChange={setAppTheme}
        onLinkOpen={(element, event) => {
          if (element.link && !element.link.startsWith("http")) {
            event.preventDefault();
            excalidrawAPI?.scrollToContent(element.link, { animate: true });
          }
        }}
      >
        <AppMainMenu
          onCollabDialogOpen={() => {}}
          isCollaborating={false}
          isCollabEnabled={false}
          theme={appTheme}
          refresh={() => forceRefresh((prev) => !prev)}
        />
        <AppWelcomeScreen
          onCollabDialogOpen={() => {}}
          isCollabEnabled={false}
        />
        <OverwriteConfirmDialog>
          <OverwriteConfirmDialog.Actions.ExportToImage />
          <OverwriteConfirmDialog.Actions.SaveToDisk />
        </OverwriteConfirmDialog>
        <AppFooter onChange={() => excalidrawAPI?.refresh()} />
        <AppSidebar />

        {localStorageQuotaExceeded && (
          <div className="alert alert--danger">
            {t("alerts.localStorageQuotaExceeded")}
          </div>
        )}

        {errorMessage && (
          <ErrorDialog onClose={() => setErrorMessage("")}>
            {errorMessage}
          </ErrorDialog>
        )}

        <CommandPalette
          customCommandPaletteItems={[
            {
              label: t("labels.installPWA"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!pwaEvent,
              perform: () => {
                if (pwaEvent) {
                  pwaEvent.prompt();
                  pwaEvent.userChoice.then(() => { pwaEvent = null; });
                }
              },
            },
          ]}
        />

        {isVisualDebuggerEnabled() && excalidrawAPI && (
          <DebugCanvas
            appState={excalidrawAPI.getAppState()}
            scale={window.devicePixelRatio}
            ref={debugCanvasRef}
          />
        )}
      </Excalidraw>
    </div>
  );
};

const ExcalidrawApp = () => (
  <TopErrorBoundary>
    <Provider store={appJotaiStore}>
      <ExcalidrawAPIProvider>
        <ExcalidrawWrapper />
      </ExcalidrawAPIProvider>
    </Provider>
  </TopErrorBoundary>
);

export default ExcalidrawApp;
