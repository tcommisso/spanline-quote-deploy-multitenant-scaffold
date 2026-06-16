import { TRPCError } from "@trpc/server";

export type HeartbeatJob = {
  name: string;
  cron: string;
  path: string;
  method?: "POST" | "PUT";
  payload?: unknown;
  description?: string;
};

export type HeartbeatJobUpdate = Partial<Omit<HeartbeatJob, "name">> & {
  enable?: boolean;
};

export type HeartbeatJobInfo = {
  taskUid: string;
  name: string;
  userId: string;
  description: string;
  cronExpression: string;
  callbackPath: string;
  callbackMethod: string;
  callbackPayload: string;
  isEnable: boolean;
  createdAt?: string | null;
  lastExecutedAt?: string | null;
  nextExecutionAt?: string | null;
};

const railwayCronMessage =
  "Forge heartbeat is disabled. Configure this schedule as a Railway cron job calling the /api/scheduled/* endpoint with Authorization: Bearer SCHEDULED_JOB_SECRET.";

export async function createHeartbeatJob(): Promise<never> {
  throw new TRPCError({ code: "BAD_REQUEST", message: railwayCronMessage });
}

export async function updateHeartbeatJob(): Promise<never> {
  throw new TRPCError({ code: "BAD_REQUEST", message: railwayCronMessage });
}

export async function deleteHeartbeatJob(): Promise<never> {
  throw new TRPCError({ code: "BAD_REQUEST", message: railwayCronMessage });
}

export async function listHeartbeatJobs(): Promise<{ total: number; actorUserId: string; jobs: HeartbeatJobInfo[] }> {
  return { total: 0, actorUserId: "railway", jobs: [] };
}
