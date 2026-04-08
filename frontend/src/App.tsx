import { useEffect, useRef, useState } from "react";
import { analyzeImages, restoreItems, type AnalyzeInput } from "./api";
import { DetailModal } from "./components/DetailModal";
import { PaletteBar } from "./components/PaletteBar";
import { RankedList } from "./components/RankedList";
import { SampleCard } from "./components/SampleCard";
import { UploadZone } from "./components/UploadZone";
import type { AnalysisMode, PersistedAppState, SampleItem, SortDirection } from "./types";
import { clearStoredFiles, deleteStoredFile, getStoredFiles, putStoredFile } from "./utils/blobStore";
import { exportResultsCsv } from "./utils/csv";
import { matchesSearch, sortItems } from "./utils/sorting";

const STORAGE_KEY = "fabric-swatch-sorter-state-v1";
type LoadedAppState = Omit<PersistedAppState, "items"> & { items: SampleItem[] };

function loadInitialState(): LoadedAppState {
  if (typeof window === "undefined") {
    return {
      version: 1,
      items: [],
      sortDirection: "light-to-dark",
      analysisMode: "advanced",
      orderLocked: false,
      search: "",
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      throw new Error("No persisted state");
    }

    const parsed = JSON.parse(raw) as PersistedAppState;
    return {
      version: 1,
      items: restoreItems(parsed.items ?? []),
      sortDirection: parsed.sortDirection ?? "light-to-dark",
      analysisMode: parsed.analysisMode ?? "advanced",
      orderLocked: parsed.orderLocked ?? false,
      search: parsed.search ?? "",
    };
  } catch {
    return {
      version: 1,
      items: [],
      sortDirection: "light-to-dark",
      analysisMode: "advanced",
      orderLocked: false,
      search: "",
    };
  }
}

function revokePreviewUrl(url: string): void {
  if (url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export default function App() {
  const [initialState] = useState<LoadedAppState>(loadInitialState);
  const [items, setItems] = useState<SampleItem[]>(initialState.items);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialState.sortDirection);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(initialState.analysisMode);
  const [orderLocked, setOrderLocked] = useState(initialState.orderLocked);
  const [search, setSearch] = useState(initialState.search);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyText, setBusyText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [noticeText, setNoticeText] = useState("");
  const previewUrlsRef = useRef<Map<string, string>>(new Map());

  function setPreviewForId(id: string, file: Blob): string {
    const nextUrl = URL.createObjectURL(file);
    const previousUrl = previewUrlsRef.current.get(id);

    if (previousUrl && previousUrl !== nextUrl) {
      revokePreviewUrl(previousUrl);
    }

    previewUrlsRef.current.set(id, nextUrl);
    return nextUrl;
  }

  function releasePreviewForId(id: string): void {
    const previousUrl = previewUrlsRef.current.get(id);
    if (previousUrl) {
      revokePreviewUrl(previousUrl);
      previewUrlsRef.current.delete(id);
    }
  }

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current.values()) {
        revokePreviewUrl(url);
      }
      previewUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const payload: PersistedAppState = {
      version: 1,
      items: items.map((item) => {
        const { previewUrl, ...persistable } = item;
        return persistable;
      }),
      sortDirection,
      analysisMode,
      orderLocked,
      search,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [analysisMode, items, orderLocked, search, sortDirection]);

  useEffect(() => {
    let cancelled = false;

    async function restorePreviewState() {
      if (!initialState.items.length) {
        return;
      }

      try {
        const storedFiles = await getStoredFiles(initialState.items.map((item) => item.id));
        if (cancelled) {
          return;
        }

        const restoredItems = initialState.items
          .filter((item) => storedFiles.has(item.id))
          .map((item) => ({
            ...item,
            previewUrl: setPreviewForId(item.id, storedFiles.get(item.id)!.blob),
          }));
        const missingCount = initialState.items.length - restoredItems.length;

        setItems(restoredItems);
        setNoticeText(
          missingCount
            ? `Restored ${restoredItems.length} sample(s). ${missingCount} stale item(s) were removed because the local source file was missing.`
            : "Restored your last saved workspace from this browser.",
        );
      } catch {
        if (!cancelled) {
          setErrorText("Could not restore locally saved image files.");
          setItems([]);
        }
      }
    }

    void restorePreviewState();

    return () => {
      cancelled = true;
    };
  }, [initialState.items]);

  useEffect(() => {
    if (!noticeText && !errorText) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setNoticeText("");
      setErrorText("");
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [noticeText, errorText]);

  const filteredItems = items.filter((item) => matchesSearch(item, search));
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const averageBrightness =
    items.length > 0
      ? items.reduce((sum, item) => sum + item.brightness.score, 0) / items.length
      : 0;

  async function handleUpload(nextFiles: File[]) {
    if (!nextFiles.length) {
      return;
    }

    const inputs: AnalyzeInput[] = nextFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
    }));

    try {
      setBusyText(`Analyzing ${nextFiles.length} image${nextFiles.length > 1 ? "s" : ""}...`);
      setErrorText("");
      const response = await analyzeImages(inputs, analysisMode);
      const filesById = new Map(inputs.map((input) => [input.id, input.file]));

      await Promise.all(
        response.items.map(async (item) => {
          const sourceFile = filesById.get(item.id);
          if (sourceFile) {
            await putStoredFile(item.id, sourceFile);
          }
        }),
      );

      const uploadedItems = response.items.map((item) => ({
        ...item,
        displayName: item.originalName,
        previewUrl: filesById.get(item.id) ? setPreviewForId(item.id, filesById.get(item.id)!) : "",
      }));

      setItems((current) => {
        const merged = [...current, ...uploadedItems];
        return orderLocked ? merged : sortItems(merged, sortDirection);
      });
      setNoticeText(
        response.failures.length
          ? `Imported ${response.items.length} image(s). ${response.failures.length} failed.`
          : `Imported ${response.items.length} image${response.items.length > 1 ? "s" : ""}.`,
      );

      if (response.failures.length) {
        setErrorText(
          response.failures
            .slice(0, 2)
            .map((failure) => `${failure.name}: ${failure.reason}`)
            .join(" | "),
        );
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusyText("");
    }
  }

  async function handleModeChange(nextMode: AnalysisMode) {
    if (nextMode === analysisMode) {
      return;
    }

    if (!items.length) {
      setAnalysisMode(nextMode);
      setNoticeText(
        nextMode === "advanced"
          ? "Advanced analysis is ready for the next upload."
          : "Simple analysis is ready for the next upload.",
      );
      return;
    }

    try {
      setBusyText(`Re-analyzing ${items.length} image${items.length > 1 ? "s" : ""}...`);
      const storedFiles = await getStoredFiles(items.map((item) => item.id));
      const availableInputs: AnalyzeInput[] = items
        .filter((item) => storedFiles.has(item.id))
        .map((item) => {
          const stored = storedFiles.get(item.id)!;
          return {
            id: item.id,
            file: new File([stored.blob], item.originalName, {
              type: stored.type || "application/octet-stream",
            }),
          };
        });

      if (!availableInputs.length) {
        throw new Error("No locally saved source files were available for re-analysis.");
      }

      const response = await analyzeImages(availableInputs, nextMode);
      const currentById = new Map(items.map((item) => [item.id, item]));
      const reanalyzedById = new Map(
        response.items.map((item) => [
          item.id,
          {
            ...item,
            displayName: currentById.get(item.id)?.displayName ?? item.originalName,
            previewUrl:
              currentById.get(item.id)?.previewUrl ??
              setPreviewForId(item.id, storedFiles.get(item.id)!.blob),
          } satisfies SampleItem,
        ]),
      );

      const mergedItems = items.map((item) => reanalyzedById.get(item.id) ?? item);

      setAnalysisMode(nextMode);
      setItems(orderLocked ? mergedItems : sortItems(mergedItems, sortDirection));

      const unavailableCount = items.length - availableInputs.length;
      if (unavailableCount || response.failures.length) {
        const messages = [];
        if (unavailableCount) {
          messages.push(`${unavailableCount} item(s) kept their previous result because the local source file was unavailable.`);
        }
        if (response.failures.length) {
          messages.push(`${response.failures.length} item(s) failed to re-analyze.`);
        }
        setErrorText(messages.join(" "));
      }

      setNoticeText(nextMode === "advanced" ? "Advanced mode applied." : "Simple mode applied.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Re-analysis failed.");
    } finally {
      setBusyText("");
    }
  }

  function handleSortChange(nextDirection: SortDirection) {
    if (orderLocked) {
      setNoticeText("Unlock the order to apply automatic sorting again.");
      return;
    }

    setSortDirection(nextDirection);
    setItems((current) => sortItems(current, nextDirection));
  }

  function handleSaveName(id: string, nextName: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              displayName: nextName.trim() || item.originalName,
            }
          : item,
      ),
    );
    setNoticeText("Sample name updated.");
  }

  async function handleRemove(item: SampleItem) {
    try {
      await deleteStoredFile(item.id);
      releasePreviewForId(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (selectedId === item.id) {
        setSelectedId(null);
      }
      setNoticeText(`Removed ${item.displayName}.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Could not remove image.");
    }
  }

  async function handleRemoveAll() {
    if (!items.length) {
      return;
    }

    const confirmed = window.confirm("Remove every uploaded image from this workspace?");
    if (!confirmed) {
      return;
    }

    try {
      await clearStoredFiles();
      for (const item of items) {
        releasePreviewForId(item.id);
      }
      setItems([]);
      setSelectedId(null);
      setOrderLocked(false);
      setSearch("");
      setNoticeText("All images removed.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Could not clear the workspace.");
    }
  }

  async function handleCopyHex(hex: string) {
    try {
      await navigator.clipboard.writeText(hex);
      setNoticeText(`${hex} copied to the clipboard.`);
    } catch {
      setErrorText("Clipboard access failed.");
    }
  }

  function handleReset() {
    setOrderLocked(false);
    setSortDirection("light-to-dark");
    setSearch("");
    setItems((current) => sortItems(current, "light-to-dark"));
    setNoticeText("Order reset to automatic White -> Dark ranking.");
  }

  return (
    <div className="app-shell">
      <header className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">Fabric Sorting Dashboard</span>
          <h1>Swatch brightness ranking built for real sample photos.</h1>
          <p>
            Upload color swatches, detect the dominant fabric color, ignore common border noise,
            and sort your collection from lightest to darkest or back again.
          </p>

          <div className="hero-stats">
            <div className="stat-pill">
              <span>Samples</span>
              <strong>{items.length}</strong>
            </div>
            <div className="stat-pill">
              <span>Average brightness</span>
              <strong>{averageBrightness.toFixed(2)}</strong>
            </div>
            <div className="stat-pill">
              <span>Analysis mode</span>
              <strong>{analysisMode === "advanced" ? "Advanced" : "Simple"}</strong>
            </div>
            <div className="stat-pill">
              <span>Order status</span>
              <strong>{orderLocked ? "Locked" : "Live"}</strong>
            </div>
          </div>
        </div>

        <UploadZone busy={Boolean(busyText)} onFilesSelected={handleUpload} />
      </header>

      {(busyText || errorText || noticeText) && (
        <div className={`status-banner ${errorText ? "error" : busyText ? "busy" : "notice"}`}>
          {busyText || errorText || noticeText}
        </div>
      )}

      <section className="panel control-panel">
        <div className="control-stack">
          <div className="control-group">
            <span className="metric-label">Analysis mode</span>
            <div className="segmented-control">
              <button
                type="button"
                className={analysisMode === "simple" ? "active" : ""}
                onClick={() => handleModeChange("simple")}
              >
                Simple
              </button>
              <button
                type="button"
                className={analysisMode === "advanced" ? "active" : ""}
                onClick={() => handleModeChange("advanced")}
              >
                Advanced
              </button>
            </div>
          </div>

          <div className="control-group">
            <span className="metric-label">Sort direction</span>
            <div className="segmented-control">
              <button
                type="button"
                className={sortDirection === "light-to-dark" ? "active" : ""}
                onClick={() => handleSortChange("light-to-dark")}
                disabled={orderLocked}
              >
                {"White -> Dark"}
              </button>
              <button
                type="button"
                className={sortDirection === "dark-to-light" ? "active" : ""}
                onClick={() => handleSortChange("dark-to-light")}
                disabled={orderLocked}
              >
                {"Dark -> White"}
              </button>
            </div>
          </div>
        </div>

        <div className="search-wrap">
          <label className="input-group">
            <span>Search by filename</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search samples..."
            />
          </label>
        </div>

        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            disabled={!items.length}
            onClick={() => exportResultsCsv(items)}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={!items.length}
            onClick={() => {
              setOrderLocked((current) => {
                const nextValue = !current;
                setNoticeText(nextValue ? "Final order saved and locked locally." : "Order unlocked.");
                return nextValue;
              });
            }}
          >
            {orderLocked ? "Unlock Order" : "Save Final Order"}
          </button>
          <button type="button" className="ghost-button" disabled={!items.length} onClick={handleReset}>
            Reset
          </button>
          <button
            type="button"
            className="ghost-button danger"
            disabled={!items.length}
            onClick={handleRemoveAll}
          >
            Remove All
          </button>
        </div>
      </section>

      <PaletteBar items={items} />

      <main className="content-grid">
        <section className="panel gallery-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Sample Grid</span>
              <h3>Uploaded swatches</h3>
            </div>
            <span className="helper-text">
              {filteredItems.length} of {items.length} visible
            </span>
          </div>

          {filteredItems.length ? (
            <div className="sample-grid">
              {filteredItems.map((item) => (
                <SampleCard
                  key={item.id}
                  item={item}
                  rank={items.findIndex((entry) => entry.id === item.id) + 1}
                  onInspect={(entry) => setSelectedId(entry.id)}
                  onCopyHex={handleCopyHex}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              {items.length
                ? "No swatches match the current search."
                : "Upload some swatch images to start building the ranked collection."}
            </div>
          )}
        </section>

        <RankedList
          items={filteredItems}
          sortable={!orderLocked && !search.trim()}
          onReorder={(nextItems) => {
            if (search.trim()) {
              return;
            }

            setItems(nextItems);
            setNoticeText("Manual ranking updated. Save final order when you are happy with it.");
          }}
          onInspect={(item) => setSelectedId(item.id)}
        />
      </main>

      <DetailModal
        item={selectedItem}
        rank={selectedItem ? items.findIndex((item) => item.id === selectedItem.id) + 1 : 0}
        onClose={() => setSelectedId(null)}
        onSaveName={handleSaveName}
        onCopyHex={handleCopyHex}
      />
    </div>
  );
}
