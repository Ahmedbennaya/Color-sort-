import { useRef, useState } from "react";

interface UploadZoneProps {
  busy: boolean;
  onFilesSelected: (files: File[]) => void;
}

export function UploadZone({ busy, onFilesSelected }: UploadZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }

    onFilesSelected(Array.from(fileList));
  }

  return (
    <div
      className={`upload-zone ${isDragActive ? "drag-active" : ""} ${busy ? "disabled" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!busy) {
          setIsDragActive(true);
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget === event.target) {
          setIsDragActive(false);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragActive(false);
        if (!busy) {
          handleFiles(event.dataTransfer.files);
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,image/png,image/jpeg"
        multiple
        hidden
        onChange={(event) => {
          handleFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="upload-zone-copy">
        <span className="eyebrow">Batch Upload</span>
        <h2>Drop fabric swatches here</h2>
        <p>
          Analyze multiple JPG and PNG samples at once. The app extracts the main swatch color and
          ranks it by brightness.
        </p>
      </div>

      <div className="upload-zone-actions">
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Choose Images
        </button>
        <span className="helper-text">Drag and drop or use the file picker</span>
      </div>
    </div>
  );
}
