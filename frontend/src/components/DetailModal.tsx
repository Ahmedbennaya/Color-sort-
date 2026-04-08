import { useEffect, useState } from "react";
import type { SampleItem } from "../types";

interface DetailModalProps {
  item: SampleItem | null;
  rank: number;
  onClose: () => void;
  onSaveName: (id: string, nextName: string) => void;
  onCopyHex: (hex: string) => void;
}

export function DetailModal({ item, rank, onClose, onSaveName, onCopyHex }: DetailModalProps) {
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    setDraftName(item?.displayName ?? "");
  }, [item]);

  useEffect(() => {
    if (!item) {
      return undefined;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [item, onClose]);

  if (!item) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">Sample Detail</span>
            <h3>{item.displayName}</h3>
            <p>
              Rank #{rank} | {item.mode === "advanced" ? "Advanced analysis" : "Simple analysis"}
            </p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-layout">
          <div className="modal-preview">
            {item.previewUrl ? (
              <img src={item.previewUrl} alt={item.displayName} />
            ) : (
              <div className="preview-placeholder large">Preview restoring...</div>
            )}
          </div>

          <div className="modal-details">
            <div className="detail-swatch-row">
              <div className="detail-swatch" style={{ background: item.color.hex }} />
              <div>
                <strong>{item.color.hex}</strong>
                <p>RGB {item.rgbLabel}</p>
              </div>
            </div>

            <label className="input-group">
              <span>Display name</span>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Rename this sample"
              />
            </label>

            <div className="detail-grid">
              <div>
                <span className="metric-label">Brightness</span>
                <strong>{item.brightness.score.toFixed(2)}</strong>
              </div>
              <div>
                <span className="metric-label">Relative luminance</span>
                <strong>{item.brightness.luminance.toFixed(4)}</strong>
              </div>
              <div>
                <span className="metric-label">LAB L*</span>
                <strong>{item.brightness.labLightness.toFixed(2)}</strong>
              </div>
              <div>
                <span className="metric-label">Coverage</span>
                <strong>{Math.round(item.coverage * 100)}%</strong>
              </div>
              <div>
                <span className="metric-label">Confidence</span>
                <strong>{Math.round(item.confidence * 100)}%</strong>
              </div>
              <div>
                <span className="metric-label">Pixels used</span>
                <strong>
                  {item.filteredPixelCount} / {item.totalPixelCount}
                </strong>
              </div>
            </div>

            <div className="notes-block">
              <span className="metric-label">Analysis notes</span>
              <ul>
                {item.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => onSaveName(item.id, draftName)}
              >
                Save Name
              </button>
              <button type="button" className="ghost-button" onClick={() => onCopyHex(item.color.hex)}>
                Copy HEX
              </button>
            </div>

            <p className="helper-text">
              Original file: <strong>{item.originalName}</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
