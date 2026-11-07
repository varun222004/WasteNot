import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { filesApi } from "@/services/api";
import { fileUrl } from "@/lib/api";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 5 * 1024 * 1024;

export function PhotoUploader({ value, onChange, max = 5 }: { value: string[]; onChange: (ids: string[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const pick = async (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, max - value.length);
    const ids: string[] = [];
    setUploading(list.length);
    for (const f of list) {
      if (!TYPES.includes(f.type)) { toast.error(`${f.name}: use JPEG, PNG or WebP`); continue; }
      if (f.size > MAX) { toast.error(`${f.name}: must be under 5 MB`); continue; }
      try {
        ids.push((await filesApi.upload(f, "listing_photo")).id);
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setUploading(0);
    onChange([...value, ...ids]);
    if (input.current) input.current.value = "";
  };
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5" data-testid="photo-uploader">
      {value.map((id, i) => (
        <div key={id} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-soft">
          <img src={fileUrl(id)} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
          {i === 0 && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-cream/90 px-2 text-[10px] font-medium">Cover</span>}
          <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} aria-label="Remove photo" data-testid={`remove-photo-${i}`}
            className="absolute right-1.5 top-1.5 rounded-full bg-cream/90 p-1 hover:bg-white"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      {value.length < max && (
        <button type="button" onClick={() => input.current?.click()} disabled={uploading > 0} data-testid="add-photo-btn"
          className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-olive/40 bg-white/60 text-xs text-muted hover:bg-white">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5 text-olive" />}
          {uploading ? "Uploading" : "Add photo"}
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => pick(e.target.files)} data-testid="photo-file-input" />
    </div>
  );
}
