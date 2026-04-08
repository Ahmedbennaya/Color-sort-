import type { SampleItem } from "../types";

interface PaletteBarProps {
  items: SampleItem[];
}

export function PaletteBar({ items }: PaletteBarProps) {
  return (
    <section className="panel palette-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Sorted Palette</span>
          <h3>Brightness ramp</h3>
        </div>
        <span className="helper-text">
          {items.length ? `${items.length} ranked colors` : "Upload samples to build a palette bar"}
        </span>
      </div>

      <div className="palette-bar" aria-label="Detected color palette">
        {items.length ? (
          items.map((item, index) => (
            <div
              key={item.id}
              className="palette-segment"
              style={{ background: item.color.hex }}
              title={`${index + 1}. ${item.displayName} (${item.color.hex})`}
            />
          ))
        ) : (
          <div className="palette-empty">Detected swatches will appear here.</div>
        )}
      </div>
    </section>
  );
}
