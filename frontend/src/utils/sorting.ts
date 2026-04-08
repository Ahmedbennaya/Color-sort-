import type { SampleItem, SortDirection } from "../types";

function tieBreak(left: SampleItem, right: SampleItem): number {
  return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
}

export function sortItems(items: SampleItem[], direction: SortDirection): SampleItem[] {
  return [...items].sort((left, right) => {
    const delta = left.brightness.score - right.brightness.score;
    if (delta === 0) {
      return tieBreak(left, right);
    }

    return direction === "light-to-dark" ? -delta : delta;
  });
}

export function matchesSearch(item: SampleItem, search: string): boolean {
  if (!search.trim()) {
    return true;
  }

  const query = search.trim().toLowerCase();
  return (
    item.displayName.toLowerCase().includes(query) ||
    item.originalName.toLowerCase().includes(query)
  );
}
