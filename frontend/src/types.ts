export type AnalysisMode = "simple" | "advanced";
export type SortDirection = "light-to-dark" | "dark-to-light";

export interface AnalyzedSample {
  id: string;
  originalName: string;
  width: number;
  height: number;
  mode: AnalysisMode;
  color: {
    r: number;
    g: number;
    b: number;
    hex: string;
  };
  rgbLabel: string;
  brightness: {
    score: number;
    luminance: number;
    labLightness: number;
  };
  confidence: number;
  filteredPixelCount: number;
  totalPixelCount: number;
  coverage: number;
  notes: string[];
}

export interface SampleItem extends AnalyzedSample {
  displayName: string;
  previewUrl: string;
}

export interface AnalysisFailure {
  name: string;
  reason: string;
}

export interface AnalyzeResponse {
  items: AnalyzedSample[];
  failures: AnalysisFailure[];
}

export interface PersistedAppState {
  version: number;
  items: Array<Omit<SampleItem, "previewUrl">>;
  sortDirection: SortDirection;
  analysisMode: AnalysisMode;
  orderLocked: boolean;
  search: string;
}
