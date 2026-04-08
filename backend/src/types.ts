export type AnalysisMode = "simple" | "advanced";

export interface RGBColor {
  r: number;
  g: number;
  b: number;
  hex: string;
}

export interface BrightnessMetrics {
  score: number;
  luminance: number;
  labLightness: number;
}

export interface ImageAnalysisResult {
  id: string;
  originalName: string;
  width: number;
  height: number;
  mode: AnalysisMode;
  color: RGBColor;
  rgbLabel: string;
  brightness: BrightnessMetrics;
  confidence: number;
  filteredPixelCount: number;
  totalPixelCount: number;
  coverage: number;
  notes: string[];
}

export interface AnalysisFailure {
  name: string;
  reason: string;
}

export interface AnalyzeResponse {
  items: ImageAnalysisResult[];
  failures: AnalysisFailure[];
}

export interface SampledPixel {
  r: number;
  g: number;
  b: number;
  x: number;
  y: number;
  weight: number;
  centerWeight: number;
  isEdge: boolean;
  luminance: number;
  labLightness: number;
  saturation: number;
}

export interface Cluster {
  centroid: [number, number, number];
  members: SampledPixel[];
  weight: number;
  coverage: number;
  centerBias: number;
  edgeRatio: number;
  saturation: number;
  luminance: number;
  spread: number;
}
