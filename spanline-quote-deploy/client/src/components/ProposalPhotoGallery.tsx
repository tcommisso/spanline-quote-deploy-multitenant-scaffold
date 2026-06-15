import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, X, GripVertical, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Photo {
  url: string;
  caption?: string;
}

interface ProposalPhotoGalleryProps {
  quoteId: number;
  photos: Photo[];
}

export default function ProposalPhotoGallery({ quoteId, photos: initialPhotos }: ProposalPhotoGalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos || []);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const updateSpecMutation = trpc.quotes.updateSpec.useMutation({
    onSuccess: () => {
      utils.quotes.get.invalidate({ id: quoteId });
    },
  });

  const savePhotos = async (updatedPhotos: Photo[]) => {
    setPhotos(updatedPhotos);
    await updateSpecMutation.mutateAsync({
      id: quoteId,
      data: { proposalPhotos: updatedPhotos.length > 0 ? updatedPhotos : null },
    });
  };

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    try {
      const newPhotos: Photo[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 10MB limit`);
          continue;
        }
        // Convert to base64 and upload via tRPC
        const base64 = await fileToBase64(file);
        const result = await uploadPhotoMutation.mutateAsync({
          quoteId,
          fileName: file.name,
          base64Data: base64,
          mimeType: file.type,
        });
        newPhotos.push({ url: result.url, caption: "" });
      }
      if (newPhotos.length > 0) {
        const updated = [...photos, ...newPhotos];
        await savePhotos(updated);
        toast.success(`${newPhotos.length} photo(s) added`);
      }
    } catch (err: any) {
      toast.error("Upload failed: " + (err.message || "Unknown error"));
    } finally {
      setUploading(false);
    }
  };

  const uploadPhotoMutation = trpc.quotes.uploadProposalPhoto.useMutation();

  const handleRemove = async (index: number) => {
    const updated = photos.filter((_, i) => i !== index);
    await savePhotos(updated);
    toast.success("Photo removed");
  };

  const handleCaptionChange = (index: number, caption: string) => {
    const updated = photos.map((p, i) => (i === index ? { ...p, caption } : p));
    setPhotos(updated);
  };

  const handleCaptionBlur = async () => {
    await savePhotos(photos);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData("text/plain"));
    if (dragIndex === dropIndex) return;
    const updated = [...photos];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(dropIndex, 0, moved);
    await savePhotos(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Add photos to include in the proposal PDF (site photos, renders, etc.)
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="gap-1.5"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Uploading..." : "Add Photos"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
        />
      </div>

      {photos.length === 0 ? (
        <div
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Click to upload photos or drag & drop</p>
          <p className="text-xs text-muted-foreground mt-1">These will appear as a Photo Gallery page in the proposal PDF</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((photo, index) => (
            <div
              key={index}
              className="relative group border rounded-lg overflow-hidden"
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, index)}
            >
              <div className="aspect-[4/3] bg-muted">
                <img
                  src={photo.url}
                  alt={photo.caption || `Photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                <GripVertical className="h-4 w-4 text-white drop-shadow-md" />
              </div>
              <button
                onClick={() => handleRemove(index)}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 text-white rounded-full p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="p-1.5">
                <Input
                  value={photo.caption || ""}
                  onChange={(e) => handleCaptionChange(index, e.target.value)}
                  onBlur={handleCaptionBlur}
                  placeholder="Caption (optional)"
                  className="h-7 text-xs"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:image/xxx;base64, prefix
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
