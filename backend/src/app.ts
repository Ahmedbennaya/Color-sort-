import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import imagesRouter from "./routes/images";

const app = express();
const frontendDistDirectory = path.resolve(__dirname, "../../frontend/dist");

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use("/api/images", imagesRouter);

if (existsSync(frontendDistDirectory)) {
  app.use(express.static(frontendDistDirectory));
  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api")) {
      next();
      return;
    }

    response.sendFile(path.join(frontendDistDirectory, "index.html"));
  });
}

app.use(
  (
    error: Error & {
      status?: number;
      code?: string;
    },
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    const status =
      error.status ??
      (error.code === "ENOENT" ? 404 : 500);

    response.status(status).json({
      message:
        status === 404 ? "Requested file was not found." : error.message || "Unexpected server error.",
    });
  },
);

export default app;
