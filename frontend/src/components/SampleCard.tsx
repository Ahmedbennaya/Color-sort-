import type { SampleItem } from "../types";

interface SampleCardProps {
  item: SampleItem;
  rank: number;
  onInspect: (item: SampleItem) => void;
  onCopyHex: (hex: string) => void;
  onRemove: (item: SampleItem) => void;
}

export function SampleCard({ item, rank, onInspect, onCopyHex, onRemove }: SampleCardProps) {
  return (
    <article
      className="sample-card"
      onClick={() => onInspect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onInspect(item);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="sample-card-preview">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt={item.displayName} loading="lazy" />
        ) : (
          <div className="preview-placeholder">Preview restoring...</div>
        )}
        <div className="rank-pill">#{rank}</div>
      </div>

      <div className="sample-card-body">
        <div className="sample-card-header">
          <div>
            <h4 title={item.displayName}>{item.displayName}</h4>
            <p title={item.originalName}>{item.originalName}</p>
          </div>
          <div className="color-chip" style={{ background: item.color.hex }} />
        </div>

        <div className="metric-row">
          <span>{item.color.hex}</span>
          <span>RGB {item.rgbLabel}</span>
        </div>

        <div className="metric-grid">
          <div>
            <span className="metric-label">Brightness</span>
            <strong>{item.brightness.score.toFixed(2)}</strong>
          </div>
          <div>
            <span className="metric-label">Luminance</span>
            <strong>{item.brightness.luminance.toFixed(4)}</strong>
          </div>
          <div>
            <span className="metric-label">LAB L*</span>
            <strong>{item.brightness.labLightness.toFixed(2)}</strong>
          </div>
          <div>
            <span className="metric-label">Confidence</span>
            <strong>{Math.round(item.confidence * 100)}%</strong>
          </div>
        </div>

        <div className="card-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={(event) => {
              event.stopPropagation();
              onCopyHex(item.color.hex);
            }}
          >
            Copy HEX
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={(event) => {
              event.stopPropagation();
              onInspect(item);
            }}
          >
            Rename / Inspect
          </button>
          <button
            type="button"
            className="ghost-button danger"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(item);
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  );
}
