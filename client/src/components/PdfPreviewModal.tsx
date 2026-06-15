import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, ZoomIn, ZoomOut } from "lucide-react";

interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  blob: Blob | null;
  filename: string;
}

export default function PdfPreviewModal({ open, onClose, blob, filename }: PdfPreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setBlobUrl(null);
    }
  }, [blob]);

  const handleDownload = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <DialogHeader className="p-0 space-y-0">
            <DialogTitle className="text-sm font-medium">{filename}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" /> Download
            </Button>
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 min-h-0 bg-muted/10">
          {blobUrl ? (
            <iframe
              ref={iframeRef}
              src={blobUrl}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading PDF...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
