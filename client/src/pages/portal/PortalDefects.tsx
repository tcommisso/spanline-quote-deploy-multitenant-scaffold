import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle, Plus, Camera, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function PortalDefects() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoOpen, setPhotoOpen] = useState<string | null>(null);

  const defectsQuery = trpc.portal.getDefects.useQuery();
  const utils = trpc.useUtils();

  const reportDefect = trpc.portal.reportDefect.useMutation({
    onSuccess: () => {
      toast.success("Defect reported successfully");
      utils.portal.getDefects.invalidate();
      setOpen(false);
      setTitle("");
      setDescription("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "resolved": return "bg-green-100 text-green-700";
      case "scheduled": return "bg-primary/10 text-primary";
      case "acknowledged": return "bg-primary/10 text-primary";
      case "reported": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Defects</h1>
          <p className="text-muted-foreground">Report and track issues</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1" /> Report Defect</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Report a Defect</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                reportDefect.mutate({ title, description });
              }}
              className="space-y-4"
            >
              <Input
                placeholder="Brief title (e.g. 'Gutter leak near corner')"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <Textarea
                placeholder="Describe the issue in detail..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                required
              />
              <Button type="submit" className="w-full" disabled={reportDefect.isPending}>
                {reportDefect.isPending ? "Submitting..." : "Submit Defect Report"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {defectsQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !defectsQuery.data?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No defects reported</p>
            <p className="text-sm text-muted-foreground mt-1">Use the button above to report any issues with your installation.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {defectsQuery.data.map((defect) => (
            <Card key={defect.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-2">
                  <p className="font-medium">{defect.title}</p>
                  <Badge className={`text-xs ${statusColor(defect.status)}`}>
                    {defect.status}
                  </Badge>
                </div>
                {defect.description && <p className="text-sm text-muted-foreground">{defect.description}</p>}

                {/* Show reported photos */}
                {defect.photoUrls && (defect.photoUrls as string[]).length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Camera className="w-3 h-3" /> Reported Photos
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {(defect.photoUrls as string[]).map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`Defect photo ${i + 1}`}
                          className="w-16 h-16 object-cover rounded border cursor-pointer hover:opacity-80"
                          onClick={() => setPhotoOpen(url)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Show resolution info */}
                {defect.status === "resolved" && (
                  <div className="mt-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-md border border-green-200 dark:border-green-800">
                    <p className="text-xs font-medium text-green-700 dark:text-green-400 flex items-center gap-1 mb-1">
                      <CheckCircle2 className="w-3 h-3" /> Resolution
                    </p>
                    {defect.resolutionNotes && (
                      <p className="text-sm text-green-800 dark:text-green-300">{defect.resolutionNotes}</p>
                    )}
                    {defect.resolutionPhotoUrls && (defect.resolutionPhotoUrls as string[]).length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-green-600 dark:text-green-400 mb-1">Evidence photos:</p>
                        <div className="flex gap-2 flex-wrap">
                          {(defect.resolutionPhotoUrls as string[]).map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt={`Resolution photo ${i + 1}`}
                              className="w-16 h-16 object-cover rounded border cursor-pointer hover:opacity-80"
                              onClick={() => setPhotoOpen(url)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {defect.resolvedAt && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Resolved: {new Date(defect.resolvedAt).toLocaleDateString("en-AU")}
                      </p>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-2">
                  Reported: {new Date(defect.createdAt).toLocaleDateString("en-AU")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Photo lightbox */}
      <Dialog open={!!photoOpen} onOpenChange={() => setPhotoOpen(null)}>
        <DialogContent className="max-w-2xl">
          {photoOpen && (
            <img src={photoOpen} alt="Full size" className="w-full h-auto rounded" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
