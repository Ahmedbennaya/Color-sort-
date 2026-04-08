import type { SampledPixel } from "../types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundNumber(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function srgbChannelToLinear(channel: number): number {
  const normalized = clamp(channel, 0, 255) / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const red = srgbChannelToLinear(r);
  const green = srgbChannelToLinear(g);
  const blue = srgbChannelToLinear(b);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function rgbToXyz(r: number, g: number, b: number): { x: number; y: number; z: number } {
  const red = srgbChannelToLinear(r);
  const green = srgbChannelToLinear(g);
  const blue = srgbChannelToLinear(b);

  return {
    x: red * 0.4124564 + green * 0.3575761 + blue * 0.1804375,
    y: red * 0.2126729 + green * 0.7151522 + blue * 0.072175,
    z: red * 0.0193339 + green * 0.119192 + blue * 0.9503041,
  };
}

function pivotLab(value: number): number {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

export function rgbToLab(r: number, g: number, b: number): { l: number; a: number; labB: number } {
  const { x, y, z } = rgbToXyz(r, g, b);
  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;

  const fx = pivotLab(x / refX);
  const fy = pivotLab(y / refY);
  const fz = pivotLab(z / refZ);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    labB: 200 * (fy - fz),
  };
}

export function rgbToLabLightness(r: number, g: number, b: number): number {
  return rgbToLab(r, g, b).l;
}

export function saturationFromRgb(r: number, g: number, b: number): number {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return 0;
  }

  return delta / (1 - Math.abs(2 * lightness - 1));
}

export function colorDistance(
  a: { r: number; g: number; b: number } | [number, number, number],
  b: { r: number; g: number; b: number } | [number, number, number],
): number {
  const ar = Array.isArray(a) ? a[0] : a.r;
  const ag = Array.isArray(a) ? a[1] : a.g;
  const ab = Array.isArray(a) ? a[2] : a.b;
  const br = Array.isArray(b) ? b[0] : b.r;
  const bg = Array.isArray(b) ? b[1] : b.g;
  const bb = Array.isArray(b) ? b[2] : b.b;

  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

export function weightedAverageColor(
  pixels: Array<Pick<SampledPixel, "r" | "g" | "b" | "weight">>,
): { r: number; g: number; b: number } {
  const totalWeight = pixels.reduce((sum, pixel) => sum + pixel.weight, 0);

  if (totalWeight === 0) {
    return { r: 0, g: 0, b: 0 };
  }

  const { r, g, b } = pixels.reduce(
    (sum, pixel) => ({
      r: sum.r + pixel.r * pixel.weight,
      g: sum.g + pixel.g * pixel.weight,
      b: sum.b + pixel.b * pixel.weight,
    }),
    { r: 0, g: 0, b: 0 },
  );

  return {
    r: r / totalWeight,
    g: g / totalWeight,
    b: b / totalWeight,
  };
}

export function weightedAverage(values: Array<{ value: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);

  if (totalWeight === 0) {
    return 0;
  }

  return values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}
