/**
 * Image compression utility for site photo uploads.
 * Resizes and compresses images client-side before uploading to S3.
 * Targets: max 2048px on longest edge, JPEG quality 0.8, output < 1MB.
 */

export interface CompressOptions {
  /** Max width/height in pixels (longest edge). Default 2048. */
  maxDimension?: number;
  /** JPEG quality 0-1. Default 0.8. */
  quality?: number;
  /** Max output file size in bytes. Default 1MB. If exceeded, quality is reduced iteratively. */
  maxFileSize?: number;
  /** Output MIME type. Default image/jpeg. */
  outputType?: string;
}

export interface CompressResult {
  blob: Blob;
  base64: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

const DEFAULT_OPTIONS: Required<CompressOptions> = {
  maxDimension: 2048,
  quality: 0.8,
  maxFileSize: 1 * 1024 * 1024, // 1MB
  outputType: "image/jpeg",
};

/**
 * Load an image file into an HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

/**
 * Draw image to canvas at target dimensions.
 */
function drawToCanvas(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  
  // Use high-quality resampling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  return canvas;
}

/**
 * Convert canvas to blob at given quality.
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      type,
      quality
    );
  });
}

/**
 * Convert blob to base64 string (without data URI prefix).
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:mime;base64, prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Compress an image file for upload.
 * - Resizes to fit within maxDimension (preserving aspect ratio)
 * - Converts to JPEG at specified quality
 * - Iteratively reduces quality if output exceeds maxFileSize
 * 
 * @returns CompressResult with the compressed blob, base64, and metadata
 */
export async function compressImage(
  file: File,
  options?: CompressOptions
): Promise<CompressResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalSize = file.size;

  // Load the image
  const img = await loadImage(file);
  const { naturalWidth, naturalHeight } = img;

  // Calculate target dimensions (fit within maxDimension, preserving aspect ratio)
  let targetWidth = naturalWidth;
  let targetHeight = naturalHeight;

  if (naturalWidth > opts.maxDimension || naturalHeight > opts.maxDimension) {
    if (naturalWidth >= naturalHeight) {
      targetWidth = opts.maxDimension;
      targetHeight = Math.round((naturalHeight / naturalWidth) * opts.maxDimension);
    } else {
      targetHeight = opts.maxDimension;
      targetWidth = Math.round((naturalWidth / naturalHeight) * opts.maxDimension);
    }
  }

  // Draw to canvas at target size
  const canvas = drawToCanvas(img, targetWidth, targetHeight);

  // Compress with iterative quality reduction if needed
  let quality = opts.quality;
  let blob = await canvasToBlob(canvas, opts.outputType, quality);

  // If still too large, reduce quality iteratively (min 0.4)
  let attempts = 0;
  while (blob.size > opts.maxFileSize && quality > 0.4 && attempts < 5) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, opts.outputType, quality);
    attempts++;
  }

  // If still too large after quality reduction, reduce dimensions further
  if (blob.size > opts.maxFileSize) {
    const scale = Math.sqrt(opts.maxFileSize / blob.size);
    const reducedWidth = Math.round(targetWidth * scale);
    const reducedHeight = Math.round(targetHeight * scale);
    const reducedCanvas = drawToCanvas(img, reducedWidth, reducedHeight);
    blob = await canvasToBlob(reducedCanvas, opts.outputType, opts.quality);
    targetWidth = reducedWidth;
    targetHeight = reducedHeight;
  }

  const base64 = await blobToBase64(blob);

  return {
    blob,
    base64,
    width: targetWidth,
    height: targetHeight,
    originalSize,
    compressedSize: blob.size,
    compressionRatio: originalSize > 0 ? blob.size / originalSize : 1,
  };
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
