/**
 * Image generation helper using OpenAI Images and app storage.
 *
 * Example usage:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "A serene landscape with mountains"
 *   });
 *
 * For editing:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "Add a rainbow to this landscape",
 *     originalImages: [{
 *       url: "https://example.com/original.jpg",
 *       mimeType: "image/jpeg"
 *     }]
 *   });
 */
import { storagePut } from "server/storage";
import { ENV } from "./env";

const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const IMAGE_MODEL_FALLBACKS = [
  DEFAULT_IMAGE_MODEL,
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",
];

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (!ENV.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const hasOriginals = !!options.originalImages?.length;
  const modelCandidates = imageModelCandidates();
  let response: Response | null = null;
  let lastDetail = "";
  let modelFailure = false;
  const attemptedModels: string[] = [];

  for (const model of modelCandidates) {
    attemptedModels.push(model);
    const useEdit = hasOriginals && supportsImageEdits(model);
    response = useEdit
      ? await requestImageEdit(model, options)
      : await requestImageGeneration(model, options.prompt);

    if (response.ok) break;

    lastDetail = await response.text().catch(() => "");
    const isModelFailure = isModelAccessError(response.status, lastDetail);
    modelFailure ||= isModelFailure;
    if (!isModelFailure) break;
  }

  if (!response?.ok) {
    if (modelFailure) {
      throw new Error(
        `OpenAI image model unavailable. Tried ${attemptedModels.join(", ")}. Set OPENAI_IMAGE_MODEL to an image model enabled for this OpenAI project.${lastDetail ? ` Provider response: ${lastDetail}` : ""}`
      );
    }
    throw new Error(
      `Image generation request failed (${response?.status ?? "unknown"} ${response?.statusText ?? ""})${lastDetail ? `: ${lastDetail}` : ""}`
    );
  }

  const result = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const image = result.data?.[0];
  let buffer: Buffer | null = null;

  if (image?.b64_json) {
    buffer = Buffer.from(image.b64_json, "base64");
  } else if (image?.url) {
    buffer = await bufferFromImageUrl(image.url);
  }

  if (!buffer) {
    throw new Error("Image generation returned no image data");
  }

  const { url } = await storagePut(
    `generated/${Date.now()}.png`,
    buffer,
    "image/png"
  );
  return {
    url,
  };
}

async function requestImageEdit(model: string, options: GenerateImageOptions): Promise<Response> {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", options.prompt);
    form.append("size", "1024x1024");

    for (let index = 0; index < options.originalImages!.length; index += 1) {
      const image = options.originalImages![index];
      const mimeType = image.mimeType || "image/png";
      const buffer = image.b64Json
        ? Buffer.from(image.b64Json, "base64")
        : image.url
          ? await bufferFromImageUrl(image.url)
          : null;
      if (!buffer) continue;
      form.append("image", new Blob([new Uint8Array(buffer)], { type: mimeType }), `source-${index}.${extensionForMime(mimeType)}`);
    }

  return fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ENV.openAiApiKey}`,
    },
    body: form,
  });
}

async function requestImageGeneration(model: string, prompt: string): Promise<Response> {
  return fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openAiApiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1024",
    }),
  });
}

function imageModelCandidates(): string[] {
  const configured = normalizeImageModel((ENV.openAiImageModel || DEFAULT_IMAGE_MODEL).trim());
  return Array.from(new Set([configured, ...IMAGE_MODEL_FALLBACKS]));
}

function normalizeImageModel(model: string): string {
  const normalized = model.trim().toLowerCase();
  if (!normalized || normalized === "dall-e-3") return DEFAULT_IMAGE_MODEL;
  return model;
}

function supportsImageEdits(model: string): boolean {
  return model.startsWith("gpt-image") || model === "dall-e-2";
}

function isModelAccessError(status: number, detail: string): boolean {
  const lowerDetail = detail.toLowerCase();
  return (status === 400 || status === 403 || status === 404) && (
    lowerDetail.includes("model_not_found") ||
    lowerDetail.includes("does not have access to model") ||
    lowerDetail.includes("does not exist") ||
    (lowerDetail.includes("invalid_value") && lowerDetail.includes("model"))
  );
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

async function bufferFromImageUrl(url: string): Promise<Buffer> {
  if (url.startsWith("/manus-storage/")) {
    const { storageDownload } = await import("../storage");
    return storageDownload(url.replace(/^\/manus-storage\//, ""));
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch source image (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}
