import type { AnalysisMode, AnalyzeResponse, AnalyzedSample, SampleItem } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export interface AnalyzeInput {
  id: string;
  file: File;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? "Request failed");
  }

  return (await response.json()) as T;
}

function normalizeItem(item: AnalyzedSample): AnalyzedSample {
  return {
    ...item,
  };
}

export async function analyzeImages(
  inputs: AnalyzeInput[],
  mode: AnalysisMode,
): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append("mode", mode);
  formData.append("clientIds", JSON.stringify(inputs.map((input) => input.id)));

  for (const input of inputs) {
    formData.append("files", input.file);
  }

  const response = await request<AnalyzeResponse>("/api/images/analyze", {
    method: "POST",
    body: formData,
  });

  return {
    ...response,
    items: response.items.map((item) => normalizeItem(item)),
  };
}

export function restoreItems(items: Array<Omit<SampleItem, "previewUrl">>): SampleItem[] {
  return items.map((item) => ({
    ...item,
    previewUrl: "",
  }));
}
