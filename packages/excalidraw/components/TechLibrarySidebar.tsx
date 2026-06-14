import React, { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { CaptureUpdateAction } from "@excalidraw/element";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { exportToSvg } from "@excalidraw/utils/export";
import type { BinaryFileData, BinaryFiles } from "../types";
import type { ExcalidrawImperativeAPI } from "../types";

import { DefaultSidebar } from "./DefaultSidebar";
import { Sidebar } from "./Sidebar/Sidebar";

import "./TechLibrarySidebar.scss";

// ── Category definitions ──────────────────────────────────────────────────────

const CATEGORY_FILES = {
  arch: [
    "pub-arch-software-architecture.excalidrawlib",
    "pub-arch-systemdesignicons.excalidrawlib",
    "pub-arch-system-design.excalidrawlib",
    "pub-arch-system-icons.excalidrawlib",
    "pub-arch-architecture-diagram-components.excalidrawlib",
    "pub-arch-basic-system-design.excalidrawlib",
    "pub-arch-c4-architecture.excalidrawlib",
    "pub-arch-hexagonal-architecture.excalidrawlib",
    "pub-arch-enterprise-integration-patterns.excalidrawlib",
    "pub-arch-mq.excalidrawlib",
    "pub-arch-UML-ER-library.excalidrawlib",
  ],
  network: [
    "pub-network-network-topology-icons.excalidrawlib",
    "pub-network-network-elements.excalidrawlib",
    "pub-network-racks-and-servers-components.excalidrawlib",
  ],
  cloud: [
    "real-cloud-brands.excalidrawlib",
  ],
  devops: [
    "real-devops.excalidrawlib",
    "real-monitoring.excalidrawlib",
    "pub-devops-k8s-kubernetes-icons-set.excalidrawlib",
    "pub-devops-k8s-github-icons.excalidrawlib",
    "pub-devops-k8s-github-actions.excalidrawlib",
  ],
  languages: [
    "real-languages.excalidrawlib",
  ],
  frameworks: [
    "real-frameworks.excalidrawlib",
    "real-frontend.excalidrawlib",
    "real-devtools.excalidrawlib",
  ],
  data: [
    "real-databases.excalidrawlib",
    "real-data.excalidrawlib",
  ],
  mobile: [
    "real-mobile.excalidrawlib",
  ],
  security: [
    "real-security.excalidrawlib",
  ],
} as const;

type RealCategoryId = keyof typeof CATEGORY_FILES;

const LIBRARY_CATEGORIES: readonly { id: string; label: string }[] = [
  { id: "favorites", label: "★ Favorites" },
  { id: "arch",      label: "Architecture" },
  { id: "network",   label: "Network"      },
  { id: "cloud",     label: "Cloud"        },
  { id: "devops",    label: "DevOps"       },
  { id: "languages", label: "Languages"    },
  { id: "frameworks",label: "Frameworks"   },
  { id: "data",      label: "Data & ML"    },
  { id: "mobile",    label: "Mobile"       },
  { id: "security",  label: "Security"     },
];

// ── Favorites persistence ─────────────────────────────────────────────────────

const FAVORITES_KEY = "paceboard-lib-favorites";

function loadFavoriteIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveFavoriteIds(ids: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
  } catch { /* storage full — best effort */ }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawFile {
  mimeType: string;
  id: string;
  dataURL: string;
  created: number;
  lastRetrieved?: number;
}

interface ParsedItem {
  id: string;
  name: string;
  elements: ExcalidrawElement[];
  imageSrc: string | null;
  hasImage: boolean;
}

interface CategoryData {
  items: ParsedItem[];
  files: Record<string, RawFile>;
}

// ── Data loading ──────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

const categoryCache = new Map<string, CategoryData>();

async function loadCategory(
  id: string,
  baseUrl: string,
): Promise<CategoryData> {
  const cacheKey = `${baseUrl}:${id}`;
  if (categoryCache.has(cacheKey)) return categoryCache.get(cacheKey)!;

  const filenames = CATEGORY_FILES[id as RealCategoryId];
  if (!filenames) return { items: [], files: {} };

  const results = await Promise.allSettled(
    [...filenames].map((f) =>
      fetch(`${baseUrl}/${f}`).then((r) => (r.ok ? r.json() : null)),
    ),
  );

  const items: ParsedItem[] = [];
  const rawFiles: Record<string, RawFile> = {};
  const seenIds = new Set<string>();

  results.forEach((result) => {
    if (result.status !== "fulfilled" || !result.value) return;
    const data = result.value as Record<string, unknown>;
    if (!isRecord(data) || data.type !== "excalidrawlib") return;

    if (isRecord(data.files)) {
      Object.assign(rawFiles, data.files);
    }

    let rawItems: Array<{
      id?: string;
      name?: string;
      elements: ExcalidrawElement[];
    }> = [];
    if (data.version === 2 && Array.isArray(data.libraryItems)) {
      rawItems = data.libraryItems as typeof rawItems;
    } else if (data.version === 1 && Array.isArray(data.library)) {
      rawItems = (data.library as ExcalidrawElement[][]).map((els, i) => ({
        id: `orbit-v1-${i}`,
        elements: els,
      }));
    }

    rawItems.forEach((item, idx) => {
      const itemId = item.id ?? `orbit-${idx}`;
      if (seenIds.has(itemId)) return;
      seenIds.add(itemId);

      let imageSrc: string | null = null;
      let hasImage = false;

      for (const el of item.elements) {
        const asImg = el as { type: string; fileId?: string };
        if (asImg.type === "image" && asImg.fileId) {
          const f = (data.files as Record<string, RawFile> | undefined)?.[asImg.fileId];
          if (f?.dataURL) {
            imageSrc = f.dataURL;
            hasImage = true;
            break;
          }
        }
      }

      items.push({
        id: itemId,
        name: item.name ?? `Item ${idx + 1}`,
        elements: item.elements,
        imageSrc,
        hasImage,
      });
    });
  });

  const result: CategoryData = { items, files: rawFiles };
  categoryCache.set(cacheKey, result);
  return result;
}

// Virtual favorites category — scan cached categories for matching IDs
function buildFavoritesData(favIds: Set<string>): CategoryData {
  const items: ParsedItem[] = [];
  const files: Record<string, RawFile> = {};
  categoryCache.forEach((data) => {
    Object.assign(files, data.files);
    data.items.forEach((item) => {
      if (favIds.has(item.id)) items.push(item);
    });
  });
  return { items, files };
}

// ── Thumbnail via exportToSvg ─────────────────────────────────────────────────

const svgThumbCache = new Map<string, string>();

async function makeSvgThumb(
  item: ParsedItem,
  files: Record<string, RawFile>,
): Promise<string | null> {
  if (svgThumbCache.has(item.id)) return svgThumbCache.get(item.id)!;
  if (!item.elements.length) return null;
  try {
    const svg = await exportToSvg({
      elements: item.elements as Parameters<typeof exportToSvg>[0]["elements"],
      appState: {
        exportBackground: false,
        exportWithDarkMode: false,
      } as Parameters<typeof exportToSvg>[0]["appState"],
      files: files as unknown as BinaryFiles,
      exportPadding: 6,
    });
    const str = new XMLSerializer().serializeToString(svg);
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
    svgThumbCache.set(item.id, url);
    return url;
  } catch {
    return null;
  }
}

// ── Insertion ─────────────────────────────────────────────────────────────────

function insertLibraryItem(
  elements: ExcalidrawElement[],
  files: Record<string, RawFile>,
  api: ExcalidrawImperativeAPI,
) {
  if (!elements.length) return;

  const idMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();

  elements.forEach((el) => {
    idMap.set(el.id, crypto.randomUUID());
    el.groupIds.forEach((gid) => {
      if (!groupIdMap.has(gid)) groupIdMap.set(gid, crypto.randomUUID());
    });
  });

  const state = api.getAppState();
  const cx = (state.width / 2 - state.scrollX) / state.zoom.value;
  const cy = (state.height / 2 - state.scrollY) / state.zoom.value;

  const xs = elements.map((e) => e.x);
  const ys = elements.map((e) => e.y);
  const xe = elements.map((e) => e.x + (e.width ?? 0));
  const ye = elements.map((e) => e.y + (e.height ?? 0));
  const dx = cx - (Math.min(...xs) + Math.max(...xe)) / 2;
  const dy = cy - (Math.min(...ys) + Math.max(...ye)) / 2;

  const usedFileIds = new Set(
    elements
      .map((e) => (e as { type: string; fileId?: string }).fileId)
      .filter(Boolean) as string[],
  );
  const toAdd: BinaryFileData[] = Object.values(files)
    .filter((f) => usedFileIds.has(f.id))
    .map(
      (f) =>
        ({ ...f, lastRetrieved: f.lastRetrieved ?? Date.now() }) as BinaryFileData,
    );
  if (toAdd.length) api.addFiles(toAdd);

  const newEls = elements.map((el) => {
    const next: Record<string, unknown> = {
      ...el,
      id: idMap.get(el.id)!,
      groupIds: el.groupIds.map((gid) => groupIdMap.get(gid)!),
      x: el.x + dx,
      y: el.y + dy,
    };
    const asAny = el as unknown as Record<string, unknown>;
    if (Array.isArray(asAny.boundElements)) {
      next.boundElements = (
        asAny.boundElements as Array<{ id: string; type: string }>
      ).map((b) => ({ ...b, id: idMap.get(b.id) ?? b.id }));
    }
    if (typeof asAny.containerId === "string") {
      next.containerId = idMap.get(asAny.containerId) ?? null;
    }
    return next as ExcalidrawElement;
  });

  api.updateScene({
    elements: [...api.getSceneElements(), ...newEls],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

// ── Item thumbnail component ──────────────────────────────────────────────────

function LibraryItemThumbnail({
  item,
  files,
}: {
  item: ParsedItem;
  files: Record<string, RawFile>;
}) {
  const [src, setSrc] = useState<string | null>(item.imageSrc);
  const generated = useRef(false);

  useEffect(() => {
    if (src || generated.current) return;
    generated.current = true;
    void makeSvgThumb(item, files).then((url) => {
      if (url) setSrc(url);
    });
  }, [item, files, src]);

  if (src) {
    return <img src={src} alt={item.name} className="lib-cat-thumb" />;
  }
  return <span className="lib-cat-shape-loading" aria-hidden="true" />;
}

// ── Category counts cache ─────────────────────────────────────────────────────

const categoryCounts = new Map<string, number>();

// ── Category strip + grid ─────────────────────────────────────────────────────

const ITEMS_PER_BATCH = 20;

function TechLibraryContent({
  apiRef,
  libraryBaseUrl,
}: {
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
  libraryBaseUrl: string;
}) {
  const [activeId, setActiveId] = useState<string>("arch");
  const [data, setData] = useState<CategoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_BATCH);
  const [counts, setCounts] = useState<Map<string, number>>(new Map(categoryCounts));
  const [favIds, setFavIds] = useState<Set<string>>(() => loadFavoriteIds());
  const [, startTransition] = useTransition();
  const loadedRef = useRef<string | null>(null);

  // Pre-load first real category on mount for instant feel
  useEffect(() => {
    void loadCategory("arch", libraryBaseUrl);
  }, [libraryBaseUrl]);

  useEffect(() => {
    const key = `${libraryBaseUrl}:${activeId}`;
    if (loadedRef.current === key) return;
    loadedRef.current = key;
    setVisibleCount(ITEMS_PER_BATCH);

    if (activeId === "favorites") {
      const favData = buildFavoritesData(favIds);
      setData(favData);
      setLoading(false);
      return;
    }

    setData(null);
    setLoading(true);
    void loadCategory(activeId, libraryBaseUrl).then((result) => {
      startTransition(() => {
        setData(result);
        setLoading(false);
        const cacheKey = `${libraryBaseUrl}:${activeId}`;
        if (!categoryCounts.has(cacheKey)) {
          categoryCounts.set(cacheKey, result.items.length);
          setCounts(new Map(categoryCounts));
        }
      });
    });
  }, [activeId, libraryBaseUrl, favIds]);

  const toggleFavorite = useCallback((itemId: string) => {
    setFavIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      saveFavoriteIds(next);
      // If viewing favorites, refresh the data immediately
      if (activeId === "favorites") {
        loadedRef.current = null;
      }
      return next;
    });
  }, [activeId]);

  const handleInsert = useCallback(
    (item: ParsedItem, itemData: CategoryData) => {
      const api = apiRef.current;
      if (api) insertLibraryItem(item.elements, itemData.files, api);
    },
    [apiRef],
  );

  const handleCategoryClick = useCallback((id: string) => {
    loadedRef.current = null;
    setActiveId(id);
  }, []);

  const visibleItems = data?.items.slice(0, visibleCount) ?? [];
  const hasMore = data ? visibleCount < data.items.length : false;

  return (
    <div className="lib-panel">
      {/* Vertical category list — top */}
      <div className="lib-strip" role="tablist" aria-label="Library categories">
        {LIBRARY_CATEGORIES.map((cat) => {
          const cacheKey = `${libraryBaseUrl}:${cat.id}`;
          const count =
            cat.id === "favorites"
              ? favIds.size > 0 ? favIds.size : undefined
              : counts.get(cacheKey);
          return (
            <button
              key={cat.id}
              role="tab"
              aria-selected={cat.id === activeId}
              className={`lib-chip${cat.id === activeId ? " lib-chip--active" : ""}${cat.id === "favorites" ? " lib-chip--favorites" : ""}`}
              onClick={() => handleCategoryClick(cat.id)}
            >
              {cat.label}
              {count !== undefined && (
                <span className="lib-chip-count">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Items grid — bottom */}
      <div className="lib-content">
        {loading ? (
          <div className="lib-loading">Loading…</div>
        ) : !data || data.items.length === 0 ? (
          <div className="lib-loading">
            {activeId === "favorites" ? "Star items to add favorites" : "No items"}
          </div>
        ) : (
          <>
            <div className="lib-grid">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  className="lib-item"
                  title={item.name}
                  onClick={() => handleInsert(item, data)}
                >
                  <LibraryItemThumbnail item={item} files={data.files} />
                  <span className="lib-item-name">{item.name}</span>
                  <button
                    className={`lib-star${favIds.has(item.id) ? " lib-star--on" : ""}`}
                    title={favIds.has(item.id) ? "Remove from favorites" : "Add to favorites"}
                    aria-label={favIds.has(item.id) ? "Remove from favorites" : "Add to favorites"}
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
                  >
                    ★
                  </button>
                </button>
              ))}
            </div>
            {hasMore && (
              <button
                className="lib-load-more"
                onClick={() => setVisibleCount((n) => n + ITEMS_PER_BATCH)}
              >
                Show more ({data.items.length - visibleCount} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Grid icon for the tab trigger ─────────────────────────────────────────────

function IcoTechLibrary() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export interface TechLibrarySidebarProps {
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
  /** Base URL for .excalidrawlib files. Defaults to "/excalidraw/libraries". */
  libraryBaseUrl?: string;
}

export function TechLibrarySidebar({
  apiRef,
  libraryBaseUrl = "/excalidraw/libraries",
}: TechLibrarySidebarProps) {
  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger tab="tech-library" title="Tech Library">
          <IcoTechLibrary />
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab="tech-library">
        <TechLibraryContent apiRef={apiRef} libraryBaseUrl={libraryBaseUrl} />
      </Sidebar.Tab>
    </DefaultSidebar>
  );
}
