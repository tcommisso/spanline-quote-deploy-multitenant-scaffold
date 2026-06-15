import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface PdfThumbnailProps {
  planId: number;
  fileUrl: string;
  thumbnailUrl?: string | null;
  className?: string;
}

/**
 * Renders a PDF thumbnail by loading the first page via an embedded canvas.
 * Uses pdfjsLib loaded from CDN. Once generated, saves to backend for caching.
 */
export function PdfThumbnail({ planId, fileUrl, thumbnailUrl, className = "" }: PdfThumbnailProps) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(thumbnailUrl || null);
  const [loading, setLoading] = useState(!thumbnailUrl);
  const [error, setError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const generatedRef = useRef(false);

  const saveThumbnailMutation = trpc.plans.saveThumbnail.useMutation();

  useEffect(() => {
    if (thumbnailUrl || generatedRef.current) return;
    generatedRef.current = true;

    const generateThumbnail = async () => {
      try {
        // Dynamically load pdf.js from CDN
        const pdfjsLib = await loadPdfJs();
        const pdf = await pdfjsLib.getDocument({ url: fileUrl, disableAutoFetch: true, disableStream: true }).promise;
        const page = await pdf.getPage(1);
        
        const targetWidth = 112; // 56px * 2 for retina
        const viewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
        
        const dataUrl = canvas.toDataURL("image/png");
        setThumbSrc(dataUrl);
        setLoading(false);

        // Save to backend for caching
        const base64 = dataUrl.split(",")[1];
        saveThumbnailMutation.mutate({ planId, thumbnailBase64: base64 });
      } catch (e) {
        console.warn("PDF thumbnail generation failed:", e);
        setError(true);
        setLoading(false);
      }
    };

    generateThumbnail();
  }, [fileUrl, thumbnailUrl, planId]);

  if (error || (!loading && !thumbSrc)) {
    return (
      <div className={`rounded-md border flex flex-col items-center justify-center bg-red-50 dark:bg-red-950/30 ${className}`}>
        <FileText className="h-6 w-6 text-red-500" />
        <span className="text-[9px] font-medium mt-0.5 text-muted-foreground uppercase">pdf</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`rounded-md border flex items-center justify-center bg-gray-50 dark:bg-gray-800 animate-pulse ${className}`}>
        <FileText className="h-6 w-6 text-gray-400" />
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  return (
    <img src={thumbSrc!} alt="PDF thumbnail" className={`rounded-md border object-cover ${className}`} />
  );
}

// ─── PDF.js loader (singleton) ─────────────────────────────────────────────
let pdfjsPromise: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
  if (pdfjsPromise) return pdfjsPromise;
  
  pdfjsPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(lib);
      } else {
        reject(new Error("pdfjsLib not found after script load"));
      }
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return pdfjsPromise;
}
