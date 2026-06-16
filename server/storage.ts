// Central storage helper for app uploads.
// R2/S3 is the production storage backend. `/manus-storage/*` remains only as
// a backwards-compatible app route name for existing stored URLs.

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

type S3StorageConfig = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
};
type StorageProvider = "r2";

let s3Client: S3Client | null = null;

export function getActiveStorageProvider(): StorageProvider | null {
  if (ENV.storageProvider === "r2" || ENV.storageProvider === "s3") {
    return hasS3Config() ? "r2" : null;
  }
  if (hasS3Config()) {
    return "r2";
  }
  return null;
}

export function isStorageConfigured(): boolean {
  return getActiveStorageProvider() !== null;
}

function hasS3Config(): boolean {
  return !!(
    ENV.r2Bucket &&
    ENV.r2Endpoint &&
    ENV.r2AccessKeyId &&
    ENV.r2SecretAccessKey
  );
}

function getS3Config(): S3StorageConfig {
  const endpoint =
    ENV.r2Endpoint ||
    (ENV.r2AccountId ? `https://${ENV.r2AccountId}.r2.cloudflarestorage.com` : "");
  if (!ENV.r2Bucket || !endpoint || !ENV.r2AccessKeyId || !ENV.r2SecretAccessKey) {
    throw new Error(
      "R2 storage credentials missing: set R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY",
    );
  }

  return {
    bucket: ENV.r2Bucket,
    endpoint: endpoint.replace(/\/+$/, ""),
    region: ENV.r2Region || "auto",
    accessKeyId: ENV.r2AccessKeyId,
    secretAccessKey: ENV.r2SecretAccessKey,
    publicBaseUrl: ENV.r2PublicBaseUrl.replace(/\/+$/, ""),
  };
}

function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }
  const config = getS3Config();
  s3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return s3Client;
}

async function buildS3DownloadUrl(relKey: string): Promise<string> {
  const config = getS3Config();
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: normalizeKey(relKey),
    }),
    { expiresIn: 60 * 10 },
  );
}

function buildStableStorageUrl(key: string): string {
  const config = getS3Config();
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${encodeStorageKey(key)}`;
  }
  return `/manus-storage/${encodeStorageKey(key)}`;
}

function encodeStorageKey(key: string): string {
  return normalizeKey(key)
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");
}

function normalizeKey(relKey: string): string {
  try {
    return decodeURIComponent(relKey).replace(/^\/+/, "");
  } catch {
    return relKey.replace(/^\/+/, "");
  }
}

async function storagePutS3(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const config = getS3Config();
  const key = normalizeKey(relKey);
  const body = typeof data === "string" ? Buffer.from(data) : data;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return { key, url: buildStableStorageUrl(key) };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const provider = getActiveStorageProvider();
  if (provider === "r2") {
    return storagePutS3(relKey, data, contentType);
  }
  throw new Error("Storage is not configured. Set STORAGE_PROVIDER=r2 and the R2 credentials.");
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const provider = getActiveStorageProvider();
  const key = normalizeKey(relKey);
  if (provider === "r2") {
    return { key, url: await buildS3DownloadUrl(key) };
  }
  throw new Error("Storage is not configured. Set STORAGE_PROVIDER=r2 and the R2 credentials.");
}

async function bufferFromS3Body(body: unknown): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }
  const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof transformable.transformToByteArray === "function") {
    return Buffer.from(await transformable.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function storageDownload(relKey: string): Promise<Buffer> {
  const provider = getActiveStorageProvider();
  const key = normalizeKey(relKey);
  if (provider === "r2") {
    const config = getS3Config();
    const response = await getS3Client().send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
    return bufferFromS3Body(response.Body);
  }

  const { url } = await storageGet(key);
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Storage download failed (${resp.status}): ${key}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}
