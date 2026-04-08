# Fabric Swatch Brightness Sorter

A full-stack web app for uploading fabric or blackout curtain sample images, detecting the dominant swatch color, and ranking samples from lightest to darkest or darkest to lightest.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Image processing: `sharp` with center-weighted pixel sampling and k-means clustering

## Project Structure

```text
.
|-- backend
|   |-- package.json
|   |-- tsconfig.json
|   |-- uploads
|   |   `-- .gitkeep
|   `-- src
|       |-- routes
|       |   `-- images.ts
|       |-- utils
|       |   |-- clustering.ts
|       |   |-- color.ts
|       |   `-- imageAnalysis.ts
|       |-- server.ts
|       `-- types.ts
|-- frontend
|   |-- index.html
|   |-- package.json
|   |-- tsconfig.json
|   |-- tsconfig.node.json
|   |-- vite.config.ts
|   `-- src
|       |-- api.ts
|       |-- App.tsx
|       |-- main.tsx
|       |-- styles.css
|       |-- types.ts
|       |-- vite-env.d.ts
|       |-- components
|       |   |-- DetailModal.tsx
|       |   |-- PaletteBar.tsx
|       |   |-- RankedList.tsx
|       |   |-- SampleCard.tsx
|       |   `-- UploadZone.tsx
|       `-- utils
|           |-- csv.ts
|           `-- sorting.ts
|-- .gitignore
|-- package.json
`-- README.md
```

## How Brightness Sorting Works

1. Each uploaded image is resized to a manageable analysis size.
2. Pixels are sampled with a center bias, because swatches are usually centered.
3. Very bright and very dark edge pixels are down-weighted or removed when they behave like borders, labels, or background.
4. A seed color is chosen from the central fabric region.
5. The algorithm expands to nearby matching pixels across the image to keep texture while rejecting unrelated edge noise.
6. In simple mode, the final color is computed from trimmed center-weighted pixels.
7. In advanced mode, k-means clustering finds candidate color groups and selects the most meaningful non-background cluster.
8. The app calculates:
   - Relative luminance
   - LAB lightness (L*)
   - Final brightness score = weighted blend of LAB L* and relative luminance
9. Samples are sorted using the final brightness score.

## Setup

### 1. Install dependencies

From the project root:

```bash
npm install
```

### 2. Start development mode

```bash
npm run dev
```

This runs:

- Backend on `http://localhost:4000`
- Frontend on `http://localhost:5173`

### 3. Build for production

```bash
npm run build
```

### 4. Run the production server

```bash
npm start
```

The backend serves the API and, if the frontend has been built, serves the React app from `frontend/dist`.

## Deployment

### GitHub

1. Create a new GitHub repository.
2. Add it as the remote for this workspace.
3. Push the whole monorepo.

Example:

```bash
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPO.git
git branch -M main
git push -u origin main
```

### Backend on Vercel

Deploy the `backend` folder as its own Vercel project.

- Root directory: `backend`
- Install command: `npm install`
- Build command: `npm run build`
- Output: none required for the API project

Notes:

- The backend is now serverless-safe and analyzes images in memory only.
- A catch-all Vercel API entrypoint is included at `backend/api/[...all].ts`.
- The frontend should call the deployed backend URL through `VITE_API_BASE`.

### Frontend on Netlify

Deploy the `frontend` folder as its own Netlify site.

- Base / package directory: `frontend`
- Build command: `npm run build`
- Publish directory: `dist`

Environment variable:

- `VITE_API_BASE=https://YOUR-VERCEL-BACKEND-DOMAIN`

The Netlify SPA redirect config is already included in `frontend/netlify.toml`.

## Notes

- Uploaded images are kept locally in the browser using IndexedDB, while metadata is saved in `localStorage`.
- This makes the app compatible with serverless hosting on Vercel and static hosting on Netlify.
- CSV export uses the current ranked order shown in the app.

## Ideas To Improve Accuracy Later

- Add a semantic fabric-region segmentation model for even cleaner swatch isolation.
- Detect printed labels with OCR and explicitly mask those regions.
- Support batch calibration against a neutral color card.
- Add delta-E reporting between neighboring swatches.
- Store reusable analysis profiles per supplier or photo setup.
