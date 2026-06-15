import { TRPCError } from "@trpc/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function assertRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const existing = buckets.get(options.key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  if (existing.count >= options.limit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
    });
  }

  existing.count += 1;
}
