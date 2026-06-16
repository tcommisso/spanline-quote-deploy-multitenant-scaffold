import type { Request } from "express";
import { isAdminRole } from "@shared/const";
import { ENV } from "./env";
import { sdk } from "./sdk";

export async function authenticateScheduledRequest(req: Request): Promise<boolean> {
  const auth = req.headers.authorization || "";
  const expected = ENV.scheduledJobSecret;
  if (expected && auth === `Bearer ${expected}`) {
    (req as any).taskUid = "railway-cron";
    return true;
  }

  try {
    const user = await sdk.authenticateRequest(req);
    if ((user as any).isCron || (user as any).taskUid) {
      return true;
    }
    return isAdminRole((user as any).role || "");
  } catch {
    return false;
  }
}
