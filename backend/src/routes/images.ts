import express from "express";
import multer from "multer";
import type { AnalysisMode, AnalyzeResponse, AnalysisFailure, ImageAnalysisResult } from "../types";
import { analyzeImageFile } from "../utils/imageAnalysis";

const router = express.Router();
const acceptedExtensions = new Set([".jpg", ".jpeg", ".png"]);

function ensureMode(value: unknown): AnalysisMode {
  return value === "advanced" ? "advanced" : "simple";
}

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

router.post("/analyze", upload.array("files", 200), async (request, response, next) => {
  try {
    const files = ((request.files as Express.Multer.File[] | undefined) ?? []);
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

    response.json(payload);
  } catch (error) {
    next(error);
  }
});

export default router;
