import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  FileText, ExternalLink, Image, X, Camera,
  Heart, ThumbsUp, HelpCircle, MessageCircle, Send, Trash2, Pencil,
} from "lucide-react";
import { PlanAnnotation } from "@/components/PlanAnnotation";

export default function PortalDocuments() {
  const docsQuery = trpc.portal.getDocuments.useQuery();
  const [previewPhoto, setPreviewPhoto] = useState<{ id: number; url: string; title: string } | null>(null);

  const photos = docsQuery.data?.filter((d) => d.category === "photos") || [];
  const otherDocs = docsQuery.data?.filter((d) => d.category !== "photos") || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Documents & Photos</h1>
        <p className="text-sm text-muted-foreground">Contracts, plans, project files, and progress photos</p>
      </div>

      {docsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !docsQuery.data?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No documents available yet</p>
            <p className="text-sm text-muted-foreground mt-1">Documents will appear here once your project team uploads them.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Photos Gallery Section */}
          {photos.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-lg">Progress Photos</h2>
                <Badge variant="secondary" className="text-xs">{photos.length}</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="relative group cursor-pointer rounded-lg overflow-hidden border border-border hover:shadow-md transition-shadow aspect-square"
                    onClick={() => setPreviewPhoto({ id: photo.id, url: photo.fileUrl, title: photo.title })}
                  >
                    <img
                      src={photo.fileUrl}
                      alt={photo.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end">
                      <div className="w-full p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-white text-xs font-medium truncate">{photo.title}</p>
                        {photo.createdAt && (
                          <p className="text-white/70 text-[10px]">
                            {new Date(photo.createdAt).toLocaleDateString("en-AU")}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* Comment indicator */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-white/90 rounded-full p-1.5 shadow-sm">
                        <MessageCircle className="w-3.5 h-3.5 text-primary" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents List Section */}
          {otherDocs.length > 0 && (
            <div className="space-y-3">
              {photos.length > 0 && (
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <h2 className="font-semibold text-lg">Documents</h2>
                  <Badge variant="secondary" className="text-xs">{otherDocs.length}</Badge>
                </div>
              )}
              {otherDocs.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm sm:text-base truncate">{doc.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] sm:text-xs">{doc.category}</Badge>
                          {doc.createdAt && (
                            <span className="text-[10px] sm:text-xs text-muted-foreground">
                              {new Date(doc.createdAt).toLocaleDateString("en-AU")}
                            </span>
                          )}
                        </div>
                      </div>
                      {doc.fileUrl && (
                        <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" asChild>
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Photo Preview with Comments Panel */}
      {previewPhoto && (
        <PhotoPreviewWithComments
          photo={previewPhoto}
          onClose={() => setPreviewPhoto(null)}
        />
      )}
    </div>
  );
}

// ─── Photo Preview with Comments ─────────────────────────────────────────────

function PhotoPreviewWithComments({
  photo,
  onClose,
}: {
  photo: { id: number; url: string; title: string };
  onClose: () => void;
}) {
  const [comment, setComment] = useState("");
  const [selectedReaction, setSelectedReaction] = useState<"love" | "thumbsup" | "question" | undefined>();
  const [showAnnotation, setShowAnnotation] = useState(false);

  const commentsQuery = trpc.portal.getPhotoComments.useQuery({ documentId: photo.id });
  const addCommentMutation = trpc.portal.addPhotoComment.useMutation({
    onSuccess: () => {
      toast.success("Comment added");
      setComment("");
      setSelectedReaction(undefined);
      commentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteCommentMutation = trpc.portal.deletePhotoComment.useMutation({
    onSuccess: () => {
      toast.success("Comment removed");
      commentsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    addCommentMutation.mutate({
      documentId: photo.id,
      comment: comment.trim(),
      reaction: selectedReaction,
    });
  }

  const reactionIcons = {
    love: <Heart className="w-3.5 h-3.5" />,
    thumbsup: <ThumbsUp className="w-3.5 h-3.5" />,
    question: <HelpCircle className="w-3.5 h-3.5" />,
  };

  return (<>
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col md:flex-row"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        className="absolute top-4 right-4 z-10 text-white bg-black/50 rounded-full p-2 hover:bg-black/70 transition-colors"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>

      {/* Photo area */}
      <div className="flex-1 flex items-center justify-center p-4 relative" onClick={(e) => e.stopPropagation()}>
        <img
          src={photo.url}
          alt={photo.title}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
        <button
          onClick={() => setShowAnnotation(true)}
          className="absolute bottom-6 left-6 bg-white/90 text-foreground rounded-full px-3 py-1.5 shadow-md flex items-center gap-1.5 text-xs font-medium hover:bg-white transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" /> Annotate
        </button>
      </div>

      {/* Comments sidebar */}
      <div
        className="w-full md:w-80 lg:w-96 bg-background flex flex-col max-h-[40vh] md:max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b">
          <h3 className="font-semibold text-sm truncate">{photo.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            <MessageCircle className="w-3 h-3 inline mr-1" />
            {commentsQuery.data?.length || 0} comments
          </p>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {commentsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : commentsQuery.data?.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No comments yet</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Be the first to leave a comment!</p>
            </div>
          ) : (
            commentsQuery.data?.map((c) => (
              <div key={c.id} className="group">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary">
                    {c.authorName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{c.authorName}</span>
                      {c.reaction && (
                        <span className="text-muted-foreground">
                          {reactionIcons[c.reaction as keyof typeof reactionIcons]}
                        </span>
                      )}
                      <button
                        onClick={() => deleteCommentMutation.mutate({ commentId: c.id })}
                        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                        title="Delete comment"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-xs text-foreground/80 mt-0.5">{c.comment}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(c.createdAt).toLocaleDateString("en-AU", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add comment form */}
        <form onSubmit={handleSubmit} className="p-3 border-t space-y-2">
          {/* Reaction buttons */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground mr-1">React:</span>
            {(["love", "thumbsup", "question"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedReaction(selectedReaction === r ? undefined : r)}
                className={`p-1.5 rounded-md transition-colors ${
                  selectedReaction === r
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                title={r === "love" ? "Love it" : r === "thumbsup" ? "Looks good" : "Question"}
              >
                {reactionIcons[r]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Leave a comment..."
              className="text-xs min-h-[60px] resize-none"
              rows={2}
            />
            <Button
              type="submit"
              size="icon"
              className="shrink-0 h-[60px] w-9"
              disabled={!comment.trim() || addCommentMutation.isPending}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>

    {/* Annotation Dialog */}
    {showAnnotation && (
      <PlanAnnotation
        open={showAnnotation}
        onClose={() => setShowAnnotation(false)}
        imageUrl={photo.url}
        planTitle={photo.title}
      />
    )}
  </>);
}
