import type { AnalysisMode, AnalyzeResponse, AnalyzedSample, SampleItem } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const ANALYZE_PATH = "/api/images/analyze";
const MAX_BATCH_FILES = 4;
const MAX_BATCH_BYTES = 3_600_000;
const MAX_SINGLE_FILE_BYTES = 3_800_000;

export interface AnalyzeInput {
  id: string;
  file: File;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new Error(
      "The analysis request could not reach the server. On the Vercel deployment, try fewer images at once or smaller files.",
    );
  }

  if (!response.ok) {
    if (response.status === 413) {
      throw new Error(
        "The selected upload is too large for the deployed backend. Try fewer images at once or compress the files.",
      );
    }

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

function chunkInputs(inputs: AnalyzeInput[]): AnalyzeInput[][] {
  const batches: AnalyzeInput[][] = [];
  let currentBatch: AnalyzeInput[] = [];
  let currentBatchBytes = 0;

  for (const input of inputs) {
    if (input.file.size > MAX_SINGLE_FILE_BYTES) {
      const sizeInMb = (input.file.size / (1024 * 1024)).toFixed(2);
      throw new Error(
        `${input.file.name} is ${sizeInMb} MB. On the current Vercel deployment, keep each file under about 3.8 MB or run the app locally.`,
      );
    }

    const wouldExceedBatch =
      currentBatch.length >= MAX_BATCH_FILES || currentBatchBytes + input.file.size > MAX_BATCH_BYTES;

    if (currentBatch.length && wouldExceedBatch) {
      batches.push(currentBatch);
      currentBatch = [input];
      currentBatchBytes = input.file.size;
      continue;
    }

    currentBatch.push(input);
    currentBatchBytes += input.file.size;
  }

  if (currentBatch.length) {
    batches.push(currentBatch);
  }

  return batches;
}

export async function analyzeImages(
  inputs: AnalyzeInput[],
  mode: AnalysisMode,
): Promise<AnalyzeResponse> {
  const responses: AnalyzeResponse[] = [];
  const batches = chunkInputs(inputs);

  for (const batch of batches) {
    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("clientIds", JSON.stringify(batch.map((input) => input.id)));

    for (const input of batch) {
      formData.append("files", input.file);
    }

    responses.push(
      await request<AnalyzeResponse>(ANALYZE_PATH, {
        method: "POST",
        body: formData,
      }),
    );
  }

  const items = responses.flatMap((response) => response.items.map((item) => normalizeItem(item)));
  const failures = responses.flatMap((response) => response.failures);

  return {
    items,
    failures,
  };
}

export function restoreItems(items: Array<Omit<SampleItem, "previewUrl">>): SampleItem[] {
  return items.map((item) => ({
    ...item,
    previewUrl: "",
  }));
}
