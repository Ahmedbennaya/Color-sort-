import sharp from "sharp";
import type { AnalysisMode, Cluster, ImageAnalysisResult, SampledPixel } from "../types";
import { assignPixelsToCentroids, runWeightedKMeans } from "./clustering";
import {
  clamp,
  colorDistance,
  relativeLuminance,
  rgbToHex,
  rgbToLabLightness,
  roundNumber,
  saturationFromRgb,
  weightedAverageColor,
} from "./color";

const ANALYSIS_SIZE = 180;
const EDGE_FRACTION = 0.08;

function isNearWhite(r: number, g: number, b: number): boolean {
  return r >= 247 && g >= 247 && b >= 247;
}

function isNearBlack(r: number, g: number, b: number): boolean {
  return r <= 10 && g <= 10 && b <= 10;
}

function computeEdgeProfile(
  buffer: Buffer,
  width: number,
  height: number,
): { whiteRatio: number; blackRatio: number } {
  const border = Math.max(1, Math.round(Math.min(width, height) * EDGE_FRACTION));
  let total = 0;
  let whites = 0;
  let blacks = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isBorderPixel =
        x < border || y < border || x >= width - border || y >= height - border;

      if (!isBorderPixel) {
        continue;
      }

      const offset = (y * width + x) * 4;
      const alpha = buffer[offset + 3];

      if (alpha < 48) {
        continue;
      }

      const r = buffer[offset];
      const g = buffer[offset + 1];
      const b = buffer[offset + 2];

      total += 1;
      if (isNearWhite(r, g, b)) {
        whites += 1;
      }
      if (isNearBlack(r, g, b)) {
        blacks += 1;
      }
    }
  }

  if (total === 0) {
    return { whiteRatio: 0, blackRatio: 0 };
  }

  return {
    whiteRatio: whites / total,
    blackRatio: blacks / total,
  };
}

function samplePixels(buffer: Buffer, width: number, height: number): SampledPixel[] {
  const edgeProfile = computeEdgeProfile(buffer, width, height);
  const pixels: SampledPixel[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = buffer[offset + 3];

      if (alpha < 48) {
        continue;
      }

      const r = buffer[offset];
      const g = buffer[offset + 1];
      const b = buffer[offset + 2];
      const nx = width === 1 ? 0.5 : x / (width - 1);
      const ny = height === 1 ? 0.5 : y / (height - 1);
      const distanceToEdge = Math.min(nx, ny, 1 - nx, 1 - ny);
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      const radialDistance = Math.sqrt(dx * dx + dy * dy) / 0.70710678118;
      const centerWeight = clamp(1 - radialDistance * 1.28, 0.18, 1);
      const isEdge = distanceToEdge < EDGE_FRACTION;
      const nearWhite = isNearWhite(r, g, b);
      const nearBlack = isNearBlack(r, g, b);

      if (distanceToEdge < 0.04 && (nearWhite || nearBlack)) {
        continue;
      }

      if (isEdge && edgeProfile.whiteRatio > 0.22 && nearWhite) {
        continue;
      }

      if (isEdge && edgeProfile.blackRatio > 0.22 && nearBlack) {
        continue;
      }

      if (isEdge && centerWeight < 0.55 && (nearWhite || nearBlack)) {
        continue;
      }

      const luminance = relativeLuminance(r, g, b);
      const saturation = saturationFromRgb(r, g, b);
      let weight = centerWeight * (isEdge ? 0.76 : 1) * (0.88 + saturation * 0.3);

      if ((nearWhite || nearBlack) && isEdge) {
        weight *= 0.3;
      }

      if (saturation < 0.04 && isEdge) {
        weight *= 0.72;
      }

      if (weight <= 0.01) {
        continue;
      }

      pixels.push({
        r,
        g,
        b,
        x: nx,
        y: ny,
        weight,
        centerWeight,
        isEdge,
        luminance,
        labLightness: rgbToLabLightness(r, g, b),
        saturation,
      });
    }
  }

  if (pixels.length > 0) {
    return pixels;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = buffer[offset + 3];

      if (alpha < 48) {
        continue;
      }

      const r = buffer[offset];
      const g = buffer[offset + 1];
      const b = buffer[offset + 2];
      const nx = width === 1 ? 0.5 : x / (width - 1);
      const ny = height === 1 ? 0.5 : y / (height - 1);
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      const radialDistance = Math.sqrt(dx * dx + dy * dy) / 0.70710678118;

      pixels.push({
        r,
        g,
        b,
        x: nx,
        y: ny,
        weight: clamp(1 - radialDistance * 1.15, 0.2, 1),
        centerWeight: clamp(1 - radialDistance * 1.15, 0.2, 1),
        isEdge: false,
        luminance: relativeLuminance(r, g, b),
        labLightness: rgbToLabLightness(r, g, b),
        saturation: saturationFromRgb(r, g, b),
      });
    }
  }

  return pixels;
}

function getCorePixels(pixels: SampledPixel[]): SampledPixel[] {
  const core = pixels.filter(
    (pixel) =>
      pixel.x >= 0.22 && pixel.x <= 0.78 && pixel.y >= 0.22 && pixel.y <= 0.78,
  );

  return core.length > 0 ? core : pixels;
}

function scoreSeedCluster(cluster: Cluster): number {
  const extremePenalty =
    cluster.luminance > 0.985 || cluster.luminance < 0.01 ? Math.max(0.55, cluster.centerBias) : 1;
  const smallPenalty = cluster.coverage < 0.08 ? 0.65 : 1;

  return (
    cluster.weight *
    (0.7 + cluster.centerBias * 0.8) *
    (1 - cluster.edgeRatio * 0.7) *
    extremePenalty *
    smallPenalty
  );
}

function trimLuminanceExtremes(pixels: SampledPixel[], lower = 0.08, upper = 0.92): SampledPixel[] {
  if (pixels.length < 24) {
    return pixels;
  }

  const sorted = [...pixels].sort((left, right) => left.luminance - right.luminance);
  const start = Math.floor(sorted.length * lower);
  const end = Math.ceil(sorted.length * upper);
  return sorted.slice(start, end);
}

function getSeedCluster(corePixels: SampledPixel[]): Cluster {
  const k = Math.min(3, Math.max(1, Math.round(corePixels.length / 1200) + 1));
  const clusters = runWeightedKMeans(corePixels, k);
  const [seed] = [...clusters].sort((left, right) => scoreSeedCluster(right) - scoreSeedCluster(left));

  return (
    seed ?? {
      centroid: [corePixels[0].r, corePixels[0].g, corePixels[0].b],
      members: corePixels,
      weight: corePixels.reduce((sum, pixel) => sum + pixel.weight, 0),
      coverage: 1,
      centerBias: 1,
      edgeRatio: 0,
      saturation: corePixels.reduce((sum, pixel) => sum + pixel.saturation, 0) / corePixels.length,
      luminance: corePixels.reduce((sum, pixel) => sum + pixel.luminance, 0) / corePixels.length,
      spread: 0,
    }
  );
}

function expandPixelsFromSeed(pixels: SampledPixel[], seed: Cluster): SampledPixel[] {
  const threshold = clamp(28 + seed.spread * 1.45, 28, 72);
  const expanded = pixels.filter((pixel) => {
    const distance = colorDistance(pixel, seed.centroid);

    if (distance <= threshold) {
      return true;
    }

    if (pixel.centerWeight > 0.92 && distance <= threshold * 1.45) {
      return true;
    }

    return false;
  });

  return expanded.length >= 200 ? expanded : pixels;
}

function clusterMeaningScore(cluster: Cluster, seedCentroid: [number, number, number]): number {
  const distancePenalty = clamp(colorDistance(cluster.centroid, seedCentroid) / 95, 0, 0.82);
  const seedSimilarity = 1 - distancePenalty;
  const extremePenalty =
    (cluster.luminance > 0.985 || cluster.luminance < 0.01) && cluster.centerBias < 0.8 ? 0.45 : 1;
  const tinyPenalty = cluster.coverage < 0.06 ? 0.55 : 1;

  return (
    cluster.weight *
    (0.58 + cluster.centerBias * 0.82) *
    (1 - cluster.edgeRatio * 0.62) *
    (0.52 + seedSimilarity * 0.88) *
    extremePenalty *
    tinyPenalty
  );
}

function buildSimpleColor(pixels: SampledPixel[], seedCentroid: [number, number, number]): Cluster {
  const trimmed = trimLuminanceExtremes(pixels).map((pixel) => {
    const distance = colorDistance(pixel, seedCentroid);
    const closeness = clamp(1 - distance / 80, 0.2, 1);

    return {
      ...pixel,
      weight: pixel.weight * (0.7 + closeness * 0.6),
    };
  });

  const color = weightedAverageColor(trimmed);
  const totalWeight = trimmed.reduce((sum, pixel) => sum + pixel.weight, 0);
  const edgeWeight = trimmed.reduce(
    (sum, pixel) => sum + pixel.weight * (pixel.isEdge ? 1 : 0),
    0,
  );
  const centerWeight = trimmed.reduce((sum, pixel) => sum + pixel.weight * pixel.centerWeight, 0);
  const saturation = trimmed.reduce((sum, pixel) => sum + pixel.weight * pixel.saturation, 0);
  const luminance = trimmed.reduce((sum, pixel) => sum + pixel.weight * pixel.luminance, 0);
  const spread =
    totalWeight === 0
      ? 0
      : Math.sqrt(
          trimmed.reduce(
            (sum, pixel) => sum + pixel.weight * colorDistance(pixel, [color.r, color.g, color.b]) ** 2,
            0,
          ) / totalWeight,
        );

  return {
    centroid: [color.r, color.g, color.b],
    members: trimmed,
    weight: totalWeight,
    coverage: 1,
    centerBias: totalWeight === 0 ? 0 : centerWeight / totalWeight,
    edgeRatio: totalWeight === 0 ? 0 : edgeWeight / totalWeight,
    saturation: totalWeight === 0 ? 0 : saturation / totalWeight,
    luminance: totalWeight === 0 ? 0 : luminance / totalWeight,
    spread,
  };
}

function buildAdvancedCluster(pixels: SampledPixel[], seed: Cluster): Cluster {
  const clusterCount = pixels.length > 3200 ? 5 : 4;
  const clusters = runWeightedKMeans(pixels, clusterCount);
  const reassigned = assignPixelsToCentroids(
    pixels,
    clusters.map((cluster) => cluster.centroid),
  );
  const [selected] = [...reassigned].sort(
    (left, right) => clusterMeaningScore(right, seed.centroid) - clusterMeaningScore(left, seed.centroid),
  );

  return selected ?? buildSimpleColor(pixels, seed.centroid);
}

function createBrightnessMetrics(r: number, g: number, b: number): {
  luminance: number;
  labLightness: number;
  score: number;
} {
  const luminance = relativeLuminance(r, g, b);
  const labLightness = rgbToLabLightness(r, g, b);
  const score = 0.72 * labLightness + 0.28 * luminance * 100;

  return {
    luminance: roundNumber(luminance, 4),
    labLightness: roundNumber(labLightness, 2),
    score: roundNumber(score, 2),
  };
}

export async function analyzeImageFile({
  buffer,
  id,
  originalName,
  mode,
}: {
  buffer: Buffer;
  id: string;
  originalName: string;
  mode: AnalysisMode;
}): Promise<ImageAnalysisResult> {
  const sharpImage = sharp(buffer).rotate();
  const metadata = await sharpImage.metadata();
  const { data, info } = await sharpImage
    .clone()
    .resize({
      width: ANALYSIS_SIZE,
      height: ANALYSIS_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = samplePixels(data, info.width, info.height);
  const corePixels = getCorePixels(pixels);
  const seed = getSeedCluster(corePixels);
  const workingPixels = expandPixelsFromSeed(pixels, seed);
  const selectedCluster =
    mode === "advanced"
      ? buildAdvancedCluster(workingPixels, seed)
      : buildSimpleColor(workingPixels, seed.centroid);

  const finalColor = weightedAverageColor(selectedCluster.members);
  const r = Math.round(finalColor.r);
  const g = Math.round(finalColor.g);
  const b = Math.round(finalColor.b);
  const brightness = createBrightnessMetrics(r, g, b);
  const effectiveCoverage =
    selectedCluster.coverage >= 0.999 ? workingPixels.length / pixels.length : selectedCluster.coverage;
  const confidence = clamp(
    0.36 +
      effectiveCoverage * 0.38 +
      selectedCluster.centerBias * 0.22 -
      selectedCluster.edgeRatio * 0.18 -
      selectedCluster.spread / 180,
    0.15,
    0.99,
  );
  const notes = [
    "Center-weighted pixel sampling prefers swatches placed in the middle of the frame.",
    "Extreme white and black edge pixels are suppressed when they behave like borders or background.",
    mode === "advanced"
      ? "Advanced mode uses k-means clustering to select the dominant non-background fabric cluster."
      : "Simple mode uses trimmed center-weighted sampling around the detected seed color.",
    "Final ranking blends LAB L* with relative luminance for more perceptual sorting.",
  ];

  return {
    id,
    originalName,
    width: metadata.width ?? info.width,
    height: metadata.height ?? info.height,
    mode,
    color: {
      r,
      g,
      b,
      hex: rgbToHex(r, g, b),
    },
    rgbLabel: `${r}, ${g}, ${b}`,
    brightness,
    confidence: roundNumber(confidence, 2),
    filteredPixelCount: workingPixels.length,
    totalPixelCount: pixels.length,
    coverage: roundNumber(effectiveCoverage, 3),
    notes,
  };
}
