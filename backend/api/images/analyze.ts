import type { VercelRequest, VercelResponse } from "@vercel/node";
import multer from "multer";
import { analyzeImageFile } from "../../src/utils/imageAnalysis";
import type { AnalysisFailure, AnalysisMode, AnalyzeResponse, ImageAnalysisResult } from "../../src/types";

export const config = {
  api: {
    bodyParser: false,
  },
};

type UploadedRequest = VercelRequest & {
  body: {
    mode?: unknown;
    clientIds?: unknown;
  };
  files?: Express.Multer.File[];
};

const acceptedExtensions = new Set([".jpg", ".jpeg", ".png"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 200,
  },
  fileFilter: (_request, file, callback) => {
    const extension = file.originalname.slice(file.originalname.lastIndexOf(".")).toLowerCase();
    const validMimeType = file.mimetype.startsWith("image/");
    callback(null, validMimeType && acceptedExtensions.has(extension));
  },
});

function ensureMode(value: unknown): AnalysisMode {
  return value === "advanced" ? "advanced" : "simple";
}

function applyCors(response: VercelResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function runUploadMiddleware(request: UploadedRequest, response: VercelResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.array("files", 200)(request as never, response as never, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function settleAnalyses(
  tasks: Array<Promise<ImageAnalysisResult>>,
  names: string[],
): Promise<AnalyzeResponse> {
  const settled = await Promise.allSettled(tasks);
  const items: ImageAnalysisResult[] = [];
  const failures: AnalysisFailure[] = [];

  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    if (result.status === "fulfilled") {
      items.push(result.value);
      continue;
    }

    failures.push({
      name: names[index],
      reason: result.reason instanceof Error ? result.reason.message : "Analysis failed",
    });
  }

  return { items, failures };
}

export default async function handler(request: UploadedRequest, response: VercelResponse): Promise<void> {
  applyCors(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ message: "Method not allowed." });
    return;
  }

  try {
    await runUploadMiddleware(request, response);

    const files = request.files ?? [];
    if (!files.length) {
      response.status(400).json({ message: "Upload at least one JPG or PNG image." });
      return;
    }

    const mode = ensureMode(request.body.mode);
    const rawClientIds = typeof request.body.clientIds === "string" ? request.body.clientIds : "[]";
    const parsedClientIds = JSON.parse(rawClientIds) as unknown;
    const clientIds = Array.isArray(parsedClientIds) ? parsedClientIds : [];

    const tasks = files.map((file, index) =>
      analyzeImageFile({
        buffer: file.buffer,
        id: typeof clientIds[index] === "string" && clientIds[index] ? String(clientIds[index]) : `${file.originalname}-${index}`,
        originalName: file.originalname,
        mode,
      }),
    );

    const payload = await settleAnalyses(tasks, files.map((file) => file.originalname));
    response.status(200).json(payload);
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}
