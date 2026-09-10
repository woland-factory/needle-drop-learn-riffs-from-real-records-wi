import { useRef, useState, type DragEvent } from "react";
import { ACCEPT_ATTR } from "../audio/decode";

interface DropZoneProps {
  onFile: (file: File) => void;
  onSample: () => void;
}

export function DropZone({ onFile, onSample }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      className={dragging ? "dropzone drag" : "dropzone"}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="visually-hidden"
        aria-label="Choose a song from your files"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <div className="empty-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => inputRef.current?.click()}
        >
          Choose a song
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSample}>
          Play a sample loop
        </button>
      </div>
    </div>
  );
}
