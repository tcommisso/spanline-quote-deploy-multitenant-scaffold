import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ImageIcon, Upload, Search, X, Trash2 } from "lucide-react";

interface EmailImageLibraryProps {
  onInsert: (url: string, alt: string) => void;
}

export default function EmailImageLibrary({ onInsert }: EmailImageLibraryProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [uploadMode, setUploadMode] = useState(false);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploading, setUploading] = useState(false);

  const utils = trpc.useUtils();
  const { data: images, isLoading } = trpc.emailImages.list.useQuery(undefined, { enabled: open });
  const uploadMut = trpc.emailImages.upload.useMutation({
    onSuccess: () => {
      toast.success("Image uploaded and resized for email");
      utils.emailImages.list.invalidate();
      setUploadMode(false);
      setUploadCaption("");
      setUploadTags("");
    },
    onError: (err) => toast.error(err.message || "Upload failed"),
  });
  const deleteMut = trpc.emailImages.delete.useMutation({
    onSuccess: () => {
      toast.success("Image deleted");
      utils.emailImages.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Delete failed"),
  });

  // Filter images by search (matches tags or caption)
  const filtered = useMemo(() => {
    if (!images) return [];
    if (!search.trim()) return images;
    const q = search.toLowerCase();
    return images.filter((img: any) => {
      const tags = (img.tags || []) as string[];
      const caption = (img.caption || "") as string;
      const filename = (img.filename || "") as string;
      return (
        caption.toLowerCase().includes(q) ||
        filename.toLowerCase().includes(q) ||
        tags.some((t: string) => t.toLowerCase().includes(q))
      );
    });
  }, [images, search]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMut.mutate({
        filename: file.name,
        base64Data: base64,
        contentType: file.type,
        caption: uploadCaption,
        tags: uploadTags.split(",").map(t => t.trim()).filter(Boolean),
      });
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleInsert = (img: any) => {
    onInsert(img.url, img.caption || img.filename);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" title="Image Library">
          <ImageIcon className="h-4 w-4" />
          <span className="text-xs hidden sm:inline">Library</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Email Image Library</DialogTitle>
        </DialogHeader>

        {/* Search & Upload toggle */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by tag, caption, or filename..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button variant={uploadMode ? "secondary" : "outline"} size="sm" onClick={() => setUploadMode(!uploadMode)}>
            <Upload className="h-4 w-4 mr-1" /> Upload
          </Button>
        </div>

        {/* Upload form */}
        {uploadMode && (
          <div className="border rounded-lg p-4 mb-3 space-y-3 bg-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Caption</Label>
                <Input
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  placeholder="e.g. Patio completed project"
                />
              </div>
              <div>
                <Label className="text-xs">Tags (comma-separated)</Label>
                <Input
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  placeholder="e.g. patio, outdoor, completed"
                />
              </div>
            </div>
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="text-sm"
                disabled={uploading || uploadMut.isPending}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Images are automatically resized to max 600px width for email compatibility.
              </p>
            </div>
          </div>
        )}

        {/* Image grid */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">Loading images...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {search ? "No images match your search." : "No images in library yet. Upload one to get started."}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map((img: any) => (
                <div key={img.id} className="group relative border rounded-lg overflow-hidden bg-white">
                  <img
                    src={img.url}
                    alt={img.caption || img.filename}
                    className="w-full h-32 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleInsert(img)}
                  />
                  <div className="p-2 space-y-1">
                    {img.caption && (
                      <p className="text-xs font-medium truncate">{img.caption}</p>
                    )}
                    {img.tags && (img.tags as string[]).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(img.tags as string[]).slice(0, 3).map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] px-1 py-0">{tag}</Badge>
                        ))}
                        {(img.tags as string[]).length > 3 && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">+{(img.tags as string[]).length - 3}</Badge>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground truncate">{img.filename}</p>
                  </div>
                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMut.mutate({ id: img.id }); }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/90 text-white rounded p-1"
                    title="Delete image"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Click an image to insert it into the email body. All images are pre-sized for email (max 600px width).
        </p>
      </DialogContent>
    </Dialog>
  );
}
