/**
 * Server-side watermarking for AI-generated patio renders.
 * Overlays company logo + "© Altaspan [year]" in the bottom-right corner.
 */
import sharp from "sharp";

interface WatermarkOptions {
  /** The image buffer to watermark */
  imageBuffer: Buffer;
  /** Optional logo image buffer (PNG with transparency) */
  logoBuffer?: Buffer;
  /** Company name for copyright text (defaults to "Altaspan") */
  companyName?: string;
  /** Year for copyright (defaults to current year) */
  year?: number;
  /** Opacity of the watermark overlay (0-1, default 0.7) */
  opacity?: number;
  /** Position: "bottom-right" | "bottom-left" | "bottom-center" */
  position?: "bottom-right" | "bottom-left" | "bottom-center";
}

/**
 * Apply a watermark (logo + copyright text) to an image buffer.
 * Returns a new PNG buffer with the watermark composited.
 */
export async function applyWatermark(options: WatermarkOptions): Promise<Buffer> {
  const {
    imageBuffer,
    logoBuffer,
    companyName = "Altaspan",
    year = new Date().getFullYear(),
    opacity = 0.7,
    position = "bottom-right",
  } = options;

  // Get image dimensions
  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width || 1024;
  const imgHeight = metadata.height || 1024;

  // Calculate watermark dimensions
  const padding = Math.round(imgWidth * 0.02); // 2% padding
  const logoHeight = Math.round(imgHeight * 0.06); // 6% of image height for logo
  const fontSize = Math.max(12, Math.round(imgHeight * 0.018)); // ~1.8% of height

  const copyrightText = `\u00A9 ${companyName} ${year}`;

  // Build the watermark SVG overlay with text
  const textWidth = copyrightText.length * fontSize * 0.6;
  const totalWidth = Math.round(textWidth + (logoBuffer ? logoHeight + padding : 0) + padding * 2);
  const totalHeight = Math.round(logoHeight + padding * 2);

  // Calculate position
  let left: number;
  let top: number;
  if (position === "bottom-right") {
    left = imgWidth - totalWidth - padding * 2;
    top = imgHeight - totalHeight - padding;
  } else if (position === "bottom-left") {
    left = padding * 2;
    top = imgHeight - totalHeight - padding;
  } else {
    left = Math.round((imgWidth - totalWidth) / 2);
    top = imgHeight - totalHeight - padding;
  }

  // Create SVG text overlay
  const svgText = `
    <svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.5"/>
        </filter>
      </defs>
      <rect x="${left}" y="${top}" width="${totalWidth}" height="${totalHeight}" rx="4" ry="4" fill="rgba(0,0,0,0.45)"/>
      <text x="${left + (logoBuffer ? logoHeight + padding * 2 : padding)}" y="${top + totalHeight / 2 + fontSize * 0.35}" 
            font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="600"
            fill="rgba(255,255,255,${opacity})" filter="url(#shadow)">
        ${copyrightText}
      </text>
    </svg>
  `;

  // Build composite layers
  const composites: sharp.OverlayOptions[] = [
    {
      input: Buffer.from(svgText),
      top: 0,
      left: 0,
    },
  ];

  // Add logo if provided
  if (logoBuffer) {
    try {
      const resizedLogo = await sharp(logoBuffer)
        .resize({
          height: logoHeight,
          fit: "inside",
        })
        .ensureAlpha()
        .png()
        .toBuffer();

      composites.push({
        input: resizedLogo,
        top: top + Math.round((totalHeight - logoHeight) / 2),
        left: left + padding,
      });
    } catch (e) {
      // If logo processing fails, continue without it
      console.warn("[Watermark] Failed to process logo:", e);
    }
  }

  // Apply watermark
  const result = await sharp(imageBuffer)
    .composite(composites)
    .png()
    .toBuffer();

  return result;
}

/**
 * Fetch an image from a URL and return as a Buffer.
 */
export async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
