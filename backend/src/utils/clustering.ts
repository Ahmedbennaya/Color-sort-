import type { Cluster, SampledPixel } from "../types";
import { colorDistance, weightedAverage, weightedAverageColor } from "./color";

const MAX_ITERATIONS = 10;

export function reducePixelsForClustering(pixels: SampledPixel[], maxPixels: number): SampledPixel[] {
  if (pixels.length <= maxPixels) {
    return pixels;
  }

  const stride = Math.ceil(pixels.length / maxPixels);
  return pixels.filter((_, index) => index % stride === 0);
}

function centroidFromMembers(members: SampledPixel[]): [number, number, number] {
  const color = weightedAverageColor(members);
  return [color.r, color.g, color.b];
}

function makeCluster(members: SampledPixel[], totalWeight: number): Cluster {
  const weight = members.reduce((sum, pixel) => sum + pixel.weight, 0);
  const centroid = centroidFromMembers(members);
  const spread =
    weight === 0
      ? 0
      : Math.sqrt(
          members.reduce(
            (sum, pixel) => sum + pixel.weight * colorDistance(pixel, centroid) ** 2,
            0,
          ) / weight,
        );

  return {
    centroid,
    members,
    weight,
    coverage: totalWeight === 0 ? 0 : weight / totalWeight,
    centerBias: weightedAverage(
      members.map((pixel) => ({ value: pixel.centerWeight, weight: pixel.weight })),
    ),
    edgeRatio: weightedAverage(
      members.map((pixel) => ({ value: pixel.isEdge ? 1 : 0, weight: pixel.weight })),
    ),
    saturation: weightedAverage(
      members.map((pixel) => ({ value: pixel.saturation, weight: pixel.weight })),
    ),
    luminance: weightedAverage(
      members.map((pixel) => ({ value: pixel.luminance, weight: pixel.weight })),
    ),
    spread,
  };
}

function chooseInitialCentroids(pixels: SampledPixel[], k: number): [number, number, number][] {
  const ordered = [...pixels].sort(
    (left, right) =>
      right.weight * (0.65 + right.centerWeight) - left.weight * (0.65 + left.centerWeight),
  );

  const centroids: [number, number, number][] = [[ordered[0].r, ordered[0].g, ordered[0].b]];

  while (centroids.length < k && centroids.length < ordered.length) {
    let bestPoint = ordered[0];
    let bestScore = -1;

    for (const point of ordered) {
      const nearestDistance = centroids.reduce(
        (smallest, centroid) => Math.min(smallest, colorDistance(point, centroid)),
        Number.POSITIVE_INFINITY,
      );
      const score = nearestDistance * point.weight * (0.5 + point.centerWeight);

      if (score > bestScore) {
        bestScore = score;
        bestPoint = point;
      }
    }

    centroids.push([bestPoint.r, bestPoint.g, bestPoint.b]);
  }

  return centroids;
}

export function assignPixelsToCentroids(
  pixels: SampledPixel[],
  centroids: Array<[number, number, number]>,
): Cluster[] {
  const groups = centroids.map(() => [] as SampledPixel[]);

  for (const pixel of pixels) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < centroids.length; index += 1) {
      const distance = colorDistance(pixel, centroids[index]);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    groups[bestIndex].push(pixel);
  }

  const totalWeight = pixels.reduce((sum, pixel) => sum + pixel.weight, 0);
  return groups.filter((group) => group.length > 0).map((group) => makeCluster(group, totalWeight));
}

export function runWeightedKMeans(pixels: SampledPixel[], requestedK: number): Cluster[] {
  if (pixels.length === 0) {
    return [];
  }

  const sampledPixels = reducePixelsForClustering(pixels, 6000);
  const k = Math.max(1, Math.min(requestedK, sampledPixels.length));
  let centroids = chooseInitialCentroids(sampledPixels, k);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const groups = centroids.map(() => [] as SampledPixel[]);

    for (const pixel of sampledPixels) {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < centroids.length; index += 1) {
        const distance = colorDistance(pixel, centroids[index]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }

      groups[bestIndex].push(pixel);
    }

    let changed = false;

    centroids = centroids.map((centroid, index) => {
      const members = groups[index];

      if (members.length === 0) {
        return centroid;
      }

      const nextCentroid = centroidFromMembers(members);

      if (colorDistance(centroid, nextCentroid) > 0.8) {
        changed = true;
      }

      return nextCentroid;
    });

    if (!changed) {
      break;
    }
  }

  return assignPixelsToCentroids(sampledPixels, centroids);
}
