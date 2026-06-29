import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Camera, Plus, Loader2, X, Calendar } from "lucide-react";

const categoryOptions = [
  { value: "progress", label: "Progress" },
  { value: "issue", label: "Issue/Defect" },
  { value: "completion", label: "Completion" },
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
  { value: "safety", label: "Safety" },
  { value: "other", label: "Other" },
];

export default function TradePortalPhotos() {
  const { data: photos, isLoading, refetch } = trpc.tradePortal.getPhotos.useQuery();
  const { data: jobs } = trpc.tradePortal.getActiveJobs.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState<"progress" | "issue" | "completion" | "before" | "after" | "other">("progress");
  const [jobId, setJobId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadPhoto = trpc.tradePortal.uploadPhoto.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  function resetForm() {
    setDialogOpen(false);
    setCaption("");
    setCategory("progress");
    setJobId("");
    setFiles([]);
  }

  async function handleUpload() {
    if (files.length === 0) {
      toast.error("Please select at least one photo");
      return;
    }

    setUploading(true);
    let successCount = 0;

    try {
      for (const file of files) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        try {
          const b64 = base64.includes(",") ? base64.split(",")[1] : base64;
          await uploadPhoto.mutateAsync({
            fileBase64: b64,
            fileName: file.name,
            fileMimeType: file.type || "image/jpeg",
            caption: caption || undefined,
            category,
            jobId: jobId && jobId !== "none" ? parseInt(jobId) : undefined,
          });
          successCount++;
        } catch (err) {
          console.error("Failed to upload:", file.name, err);
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} photo${successCount > 1 ? "s" : ""} uploaded`);
        resetForm();
      } else {
        toast.error("Failed to upload photos");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Skeleton className="aspect-square" /><Skeleton className="aspect-square" /><Skeleton className="aspect-square" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Site Photos</h1>
          <p className="text-sm text-muted-foreground">Upload and view site photos for your jobs</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground self-start sm:self-auto">
          <Camera className="w-4 h-4 mr-1" /> Upload Photos
        </Button>
      </div>

      {photos && photos.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <Card
              key={photo.id}
              className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow active:scale-[0.98]"
              onClick={() => photo.fileUrl && setViewPhoto(photo.fileUrl)}
            >
              <div className="aspect-square bg-slate-100">
                <img
                  src={photo.fileUrl || undefined}
                  alt={photo.caption || "Site photo"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <CardContent className="p-2 sm:p-3">
                <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1.5 py-0 mb-1">
                  {photo.category}
                </Badge>
                {photo.caption && (
                  <p className="text-[11px] sm:text-xs text-slate-600 truncate">{photo.caption}</p>
                )}
                <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 flex items-center gap-0.5">
                  <Calendar className="w-2.5 h-2.5" />
                  {new Date(photo.uploadedAt).toLocaleDateString("en-AU")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Camera className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No photos uploaded yet</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>
              Upload your first photo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Full-size photo viewer — touch-friendly */}
      {viewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-2 sm:p-4"
          onClick={() => setViewPhoto(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 text-white hover:bg-white/20 z-10"
            onClick={() => setViewPhoto(null)}
          >
            <X className="w-6 h-6" />
          </Button>
          <img
            src={viewPhoto}
            alt="Full size"
            className="max-w-full max-h-full object-contain rounded"
          />
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              Upload Photos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Photos *</Label>
              <Input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                className="text-sm"
              />
              {files.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{files.length} file(s) selected</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">Tap to take a photo or choose from gallery</p>
            </div>
            <div>
              <Label>Job (optional)</Label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger><SelectValue placeholder="Select a job" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific job</SelectItem>
                  {jobs?.map((job: any) => (
                    <SelectItem key={job.jobId} value={job.jobId.toString()}>
                      {job.quoteNumber} — {job.clientName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Caption</Label>
              <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Brief description" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {uploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                `Upload ${files.length || ""} Photo${files.length !== 1 ? "s" : ""}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
