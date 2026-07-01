import { useState } from "react";
import { usePortal } from "@/contexts/PortalContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageIcon, Star, Download, X, Sparkles } from "lucide-react";
import { logClientDownload } from "@/lib/userActivity";

export default function PortalRenderGallery() {
  const { user } = usePortal();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data, isLoading } = trpc.portal.getRenderGallery.useQuery();

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data?.hasRenders) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-bold">Design Renders</h1>
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No design renders available yet. Your design adviser will share
              AI-generated visualisations of your patio here once they're ready.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          Design Renders
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-generated visualisations of your {data.projectName || "patio"} design
        </p>
      </div>

      {/* Gallery Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.renders.map((render) => (
          <Card
            key={render.id}
            className="group overflow-hidden cursor-pointer hover:ring-2 hover:ring-purple-300 transition-all"
            onClick={() => setPreviewUrl(render.imageUrl)}
          >
            <div className="relative aspect-[4/3] overflow-hidden">
              <img
                src={render.imageUrl}
                alt="Patio design render"
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              {render.isFavourite && (
                <div className="absolute top-2 left-2">
                  <Star className="h-5 w-5 text-yellow-400 fill-yellow-400 drop-shadow" />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <span className="text-xs text-white/90">
                  {new Date(render.createdAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground italic text-center pt-2">
        These are AI-generated visualisations for illustrative purposes only.
        Final appearance may vary from renders shown.
      </p>

      {/* Full-size Preview Dialog */}
      <Dialog
        open={!!previewUrl}
        onOpenChange={(open) => !open && setPreviewUrl(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Design Render
            </DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border">
                <img
                  src={previewUrl}
                  alt="Patio design render"
                  className="w-full h-auto"
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground italic">
                  AI-generated visualisation for illustrative purposes only.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const link = document.createElement("a");
                    const filename = "patio-design-render.png";
                    link.href = previewUrl;
                    link.download = filename;
                    link.target = "_blank";
                    link.click();
                    logClientDownload({
                      filename,
                      source: "client_portal_render_png",
                      entityType: "portal_render",
                      mimeType: "image/png",
                    });
                  }}
                  className="gap-1.5"
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
