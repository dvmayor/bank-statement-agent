"use client";
import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";

export default function UploadDropzone({
  onFile,
  loading,
}: {
  onFile: (f: File) => void;
  loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`
        border border-dashed rounded-[10px] p-8 text-center cursor-pointer transition-all
        ${drag ? "border-accent bg-accent/5" : "border-navy-lighter bg-navy-light/60 hover:border-accent/50 hover:bg-navy-light/90"}
        ${loading ? "pointer-events-none" : ""}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {loading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="animate-spin text-accent" size={22} />
          <div className="mono-accent">analysing...</div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload size={22} className="text-accent" />
          <div className="text-slate-lightest text-sm">
            Drop a PDF statement, or <span className="text-accent">click to browse</span>
          </div>
          <div className="text-slate text-xs font-mono">max 10 MB · processed in memory · never stored</div>
        </div>
      )}
    </div>
  );
}
