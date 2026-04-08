import type { SampleItem } from "../types";

function escapeValue(value: string | number): string {
  const raw = String(value);
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
    return `"${raw.split('"').join('""')}"`;
  }

  return raw;
}

export function exportResultsCsv(items: SampleItem[]): void {
  const header = ["rank", "filename", "hex", "rgb", "brightness"];
  const rows = items.map((item, index) => [
    index + 1,
    item.displayName,
    item.color.hex,
    item.rgbLabel,
    item.brightness.score,
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((value) => escapeValue(value)).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "fabric-swatch-ranking.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
