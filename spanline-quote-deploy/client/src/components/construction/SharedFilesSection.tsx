import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Upload, FileText, Trash2, Download, FolderOpen,
  Eye, EyeOff, AlertCircle, Share2, Check, Camera,
  MessageCircle, Send, Heart, ThumbsUp, HelpCircle,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";  

interface SharedFilesSectionProps {
  jobId: number;
}

const FILE_CATEGORIES = [
  { value: "plans", label: "Plans & Drawings" },
  { value: "engineering", label: "Engineering" },
  { value: "specs", label: "Specifications" },
  { value: "permits", label: "Permits & Approvals" },
  { value: "photos", label: "Photos" },
  { value: "other", label: "Other" },
];

const categoryIcons: Record<string, string> = {
  plans: "📐",
  engineering: "⚙️",
  specs: "📋",
  permits: "📄",
  photos: "📷",
  other: "📎",
};

export default function SharedFilesSection({ jobId }: SharedFilesSectionProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("other");
  const [description, setDescription] = useState("");
  const [selectedForShare, setSelectedForShare] = useState<number[]>([]);
  const [shareMode, setShareMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: files, isLoading } = trpc.construction.sharedFiles.list.useQuery({ jobId });
  const uploadMutation = trpc.construction.sharedFiles.upload.useMutation({
    onSuccess: () => {
      utils.construction.sharedFiles.list.invalidate({ jobId });
      toast.success("File shared with trades");
      setShowUpload(false);
      setCategory("other");
      setDescription("");
    },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.construction.sharedFiles.delete.useMutation({
    onSuccess: () => {
      utils.construction.sharedFiles.list.invalidate({ jobId });
      toast.success("File removed");
    },
    onError: (err: any) => toast.error(err.message),
  });
  const toggleVisibilityMutation = trpc.construction.sharedFiles.toggleVisibility.useMutation({
    onSuccess: () => {
      utils.construction.sharedFiles.list.invalidate({ jobId });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const bulkShareMutation = trpc.construction.sharedFiles.bulkShareToClientPortal.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.shared} photo(s) shared to Client Portal`);
      setSelectedForShare([]);
      setShareMode(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const shareToPortalMutation = trpc.construction.sharedFiles.shareToClientPortal.useMutation({
    onSuccess: () => {
      toast.success("Shared to Client Portal");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("File must be under 25MB");
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        await uploadMutation.mutateAsync({
          jobId,
          fileName: file.name,
          fileBase64: base64,
          fileType: file.type || "application/octet-stream",
          fileSize: file.size,
          category,
          description: description.trim() || undefined,
        });
        setUploading(false);
      };
      reader.onerror = () => {
        toast.error("Failed to read file");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const visibleFiles = files?.filter((f: any) => f.visible !== false) || [];
  const hiddenFiles = files?.filter((f: any) => f.visible === false) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Shared Files for Trades</h3>
        <div className="flex items-center gap-2">
          {shareMode ? (
            <>
              <Button
                onClick={() => {
                  if (selectedForShare.length === 0) {
                    toast.error("Select at least one file to share");
                    return;
                  }
                  bulkShareMutation.mutate({
                    jobId,
                    fileIds: selectedForShare,
                    category: "photos",
                  });
                }}
                size="sm"
                className="gap-1.5"
                disabled={selectedForShare.length === 0 || bulkShareMutation.isPending}
              >
                <Share2 className="w-4 h-4" /> Share {selectedForShare.length} to Client Portal
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShareMode(false); setSelectedForShare([]); }}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShareMode(true)}>
                <Share2 className="w-4 h-4" /> Share to Client Portal
              </Button>
              <Button onClick={() => setShowUpload(!showUpload)} size="sm" className="gap-1.5">
                <Upload className="w-4 h-4" /> Share File
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Files shared here are visible to all trades assigned to this job via their Trade Portal.
        {shareMode && <span className="text-amber-600 font-medium"> Select files below to share them to the Client Portal Documents section.</span>}
      </p>

      {/* Upload Form */}
      {showUpload && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILE_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>
                        {categoryIcons[c.value]} {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description (optional)</label>
                <Input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description of the file..."
                />
              </div>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-amber-100 file:text-amber-700 hover:file:bg-amber-200 cursor-pointer"
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground mt-1">Max 25MB. Supported: PDF, images, documents, spreadsheets.</p>
            </div>
            {uploading && (
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-300 border-t-amber-700" />
                Uploading and sharing...
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* File List */}
      {(!files || files.length === 0) && (
        <Card>
          <CardContent className="py-10 text-center">
            <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No files shared yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Upload files to share them with assigned trades.</p>
          </CardContent>
        </Card>
      )}

      {visibleFiles.length > 0 && (
        <div className="space-y-2">
          {visibleFiles.map(file => (
            <div key={file.id} className={`flex items-center gap-3 p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow ${shareMode && selectedForShare.includes(file.id) ? "ring-2 ring-primary bg-primary/5" : ""}`}>
              {shareMode && (
                <input
                  type="checkbox"
                  checked={selectedForShare.includes(file.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedForShare([...selectedForShare, file.id]);
                    } else {
                      setSelectedForShare(selectedForShare.filter(id => id !== file.id));
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                />
              )}
              <span className="text-xl shrink-0">{categoryIcons[file.category || "other"] || "📎"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{file.fileName}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {file.category && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                      {file.category}
                    </Badge>
                  )}
                  {file.fileSize && <span>{(file.fileSize / 1024).toFixed(0)} KB</span>}
                  <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                </div>
                {file.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{file.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={file.fileUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Download">
                    <Download className="w-4 h-4" />
                  </Button>
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Hide from trades"
                  onClick={() => toggleVisibilityMutation.mutate({ id: file.id, visible: false })}
                >
                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  title="Delete permanently"
                  onClick={() => {
                    if (confirm("Delete this file permanently?")) {
                      deleteMutation.mutate({ id: file.id });
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Client Portal Photo Comments */}
      <ClientPhotoComments jobId={jobId} />

      {/* Hidden Files */}
      {hiddenFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <EyeOff className="w-3.5 h-3.5" /> Hidden from Trades ({hiddenFiles.length})
          </h4>
          {hiddenFiles.map(file => (
            <div key={file.id} className="flex items-center gap-3 p-3 rounded-lg border border-dashed bg-muted/30 opacity-70">
              <span className="text-xl shrink-0">{categoryIcons[file.category || "other"] || "📎"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{file.fileName}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {file.category && <span className="capitalize">{file.category}</span>}
                  <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Make visible to trades"
                  onClick={() => toggleVisibilityMutation.mutate({ id: file.id, visible: true })}
                >
                  <Eye className="w-4 h-4 text-amber-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  title="Delete permanently"
                  onClick={() => {
                    if (confirm("Delete this file permanently?")) {
                      deleteMutation.mutate({ id: file.id });
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Client Portal Photo Comments (Admin Reply) ─────────────────────────────

function ClientPhotoComments({ jobId }: { jobId: number }) {
  const [selectedPhoto, setSelectedPhoto] = useState<{ id: number; title: string; fileUrl: string } | null>(null);
  const [replyText, setReplyText] = useState("");

  const docsQuery = trpc.adminPortal.listDocuments.useQuery({ jobId });
  const photos = docsQuery.data?.filter((d: any) => d.category === "photos") || [];

  if (photos.length === 0) return null;

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-primary" />
        <h4 className="font-semibold text-sm">Client Portal Photos & Comments</h4>
        <Badge variant="secondary" className="text-[10px]">{photos.length} photos</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Photos shared to the Client Portal. Click to view and reply to client comments.
      </p>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {photos.map((photo: any) => (
          <div
            key={photo.id}
            className={`relative cursor-pointer rounded-lg overflow-hidden border aspect-square group hover:shadow-md transition-shadow ${
              selectedPhoto?.id === photo.id ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setSelectedPhoto({ id: photo.id, title: photo.title, fileUrl: photo.fileUrl })}
          >
            <img src={photo.fileUrl} alt={photo.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          </div>
        ))}
      </div>

      {/* Comment Thread Panel */}
      {selectedPhoto && (
        <PhotoCommentThread
          photo={selectedPhoto}
          replyText={replyText}
          setReplyText={setReplyText}
          onClose={() => { setSelectedPhoto(null); setReplyText(""); }}
        />
      )}
    </div>
  );
}

function PhotoCommentThread({
  photo,
  replyText,
  setReplyText,
  onClose,
}: {
  photo: { id: number; title: string; fileUrl: string };
  replyText: string;
  setReplyText: (v: string) => void;
  onClose: () => void;
}) {
  const commentsQuery = trpc.adminPortal.getPhotoComments.useQuery({ documentId: photo.id });
  const replyMutation = trpc.adminPortal.replyToPhotoComment.useMutation({
    onSuccess: () => {
      toast.success("Reply sent");
      setReplyText("");
      commentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.adminPortal.deletePhotoComment.useMutation({
    onSuccess: () => {
      toast.success("Comment deleted");
      commentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const reactionIcons: Record<string, React.ReactNode> = {
    love: <Heart className="w-3 h-3 text-red-500" />,
    thumbsup: <ThumbsUp className="w-3 h-3 text-blue-500" />,
    question: <HelpCircle className="w-3 h-3 text-amber-500" />,
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;
    replyMutation.mutate({ documentId: photo.id, comment: replyText.trim() });
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Camera className="w-4 h-4" />
            {photo.title}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Photo preview */}
        <div className="w-full max-h-48 overflow-hidden rounded-lg">
          <img src={photo.fileUrl} alt={photo.title} className="w-full h-full object-contain" />
        </div>

        {/* Comments list */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {commentsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading comments...</p>
          ) : commentsQuery.data?.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No comments yet from client.</p>
          ) : (
            commentsQuery.data?.map((c: any) => (
              <div key={c.id} className={`flex items-start gap-2 p-2 rounded-lg ${
                c.authorType === "admin" ? "bg-primary/5 ml-4" : "bg-muted mr-4"
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                  c.authorType === "admin" ? "bg-primary/20 text-primary" : "bg-amber-100 text-amber-700"
                }`}>
                  {c.authorName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">{c.authorName}</span>
                    {c.authorType === "admin" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0">Admin</Badge>
                    )}
                    {c.reaction && reactionIcons[c.reaction]}
                  </div>
                  <p className="text-xs text-foreground/80 mt-0.5">{c.comment}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString("en-AU", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    <button
                      onClick={() => {
                        if (confirm("Delete this comment?")) deleteMutation.mutate({ commentId: c.id });
                      }}
                      className="text-[10px] text-muted-foreground hover:text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Reply form */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Reply to client..."
            className="text-xs min-h-[50px] resize-none flex-1"
            rows={2}
          />
          <Button
            type="submit"
            size="icon"
            className="shrink-0 h-[50px] w-9"
            disabled={!replyText.trim() || replyMutation.isPending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
