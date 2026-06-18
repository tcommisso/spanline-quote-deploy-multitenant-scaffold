#!/usr/bin/env node

import "dotenv/config";

const TIME_ZONE = "Australia/Sydney";
const DEFAULT_TIMEOUT_MS = 120_000;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normaliseBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function localTimeParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: TIME_ZONE,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    weekday: parts.weekday,
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
  };
}

function everyMinutes(interval, offset = 0) {
  return ({ minute }) => minute % interval === offset;
}

function atLocalTime(hour, minute = 0) {
  return (parts) => parts.hour === hour && parts.minute === minute;
}

function everySixHoursAt(minute) {
  return (parts) => parts.minute === minute && parts.hour % 6 === 0;
}

function mondayAt(hour, minute = 0) {
  return (parts) => parts.weekday === "Mon" && parts.hour === hour && parts.minute === minute;
}

const jobs = [
  {
    key: "cost-import-process",
    endpoint: "/api/scheduled/cost-import-process",
    cadence: "Every 2 minutes",
    due: everyMinutes(2),
  },
  {
    key: "xero-financial-sync",
    endpoint: "/api/scheduled/xero-financial-sync",
    cadence: "Every 5 minutes",
    due: everyMinutes(5),
  },
  {
    key: "msgraph-email-sync",
    endpoint: "/api/scheduled/msgraph-email-sync",
    cadence: "Every 5 minutes",
    due: everyMinutes(5, 1),
  },
  {
    key: "inbox-sla-check",
    endpoint: "/api/scheduled/inbox-sla-check",
    cadence: "Every 15 minutes",
    due: everyMinutes(15, 3),
  },
  {
    key: "vocphone-sync",
    endpoint: "/api/scheduled/vocphone-sync",
    cadence: "Hourly",
    due: ({ minute }) => minute === 12,
  },
  {
    key: "da-tracker-poll",
    endpoint: "/api/scheduled/da-tracker-poll",
    cadence: "Every 6 hours",
    due: everySixHoursAt(10),
  },
  {
    key: "nsw-da-poll",
    endpoint: "/api/scheduled/nsw-da-poll",
    cadence: "Daily 7:15am AEST/AEDT",
    due: atLocalTime(7, 15),
  },
  {
    key: "nsw-competitor-digest",
    endpoint: "/api/scheduled/nsw-competitor-digest",
    cadence: "Monday 7:20am AEST/AEDT",
    due: mondayAt(7, 20),
  },
  {
    key: "weather-poll",
    endpoint: "/api/scheduled/weather-poll",
    cadence: "Daily 6am AEST/AEDT",
    due: atLocalTime(6, 0),
  },
  {
    key: "xero-payment-sync",
    endpoint: "/api/scheduled/xero-payment-sync",
    cadence: "Daily 1am AEST/AEDT",
    due: atLocalTime(1, 0),
  },
  {
    key: "xero-completion-date-sync",
    endpoint: "/api/scheduled/xero-completion-date-sync",
    cadence: "Daily 1:30am AEST/AEDT",
    due: atLocalTime(1, 30),
  },
  {
    key: "invitation-expiry",
    endpoint: "/api/scheduled/invitation-expiry",
    cadence: "Daily 2am AEST/AEDT",
    due: atLocalTime(2, 0),
  },
  {
    key: "sms-reminders",
    endpoint: "/api/scheduled/sms-reminders",
    cadence: "Daily 6:20am AEST/AEDT",
    due: atLocalTime(6, 20),
  },
  {
    key: "low-stock-alert",
    endpoint: "/api/scheduled/low-stock-alert",
    cadence: "Daily 7am AEST/AEDT",
    due: atLocalTime(7, 0),
  },
  {
    key: "condition-due-reminder",
    endpoint: "/api/scheduled/condition-due-reminder",
    cadence: "Daily 7:05am AEST/AEDT",
    due: atLocalTime(7, 5),
  },
  {
    key: "overdue-digest",
    endpoint: "/api/scheduled/overdue-digest",
    cadence: "Daily 7:30am AEST/AEDT",
    due: atLocalTime(7, 30),
  },
  {
    key: "ba-overdue-notify",
    endpoint: "/api/scheduled/ba-overdue-notify",
    cadence: "Daily 8am AEST/AEDT",
    due: atLocalTime(8, 0),
  },
  {
    key: "missed-calls-digest",
    endpoint: "/api/scheduled/missed-calls-digest",
    cadence: "Daily 8:05am AEST/AEDT",
    due: atLocalTime(8, 5),
  },
  {
    key: "rfi-due-notify",
    endpoint: "/api/scheduled/rfi-due-notify",
    cadence: "Daily 8:30am AEST/AEDT",
    due: atLocalTime(8, 30),
  },
  {
    key: "quote-expiry-reminder",
    endpoint: "/api/scheduled/quote-expiry-reminder",
    cadence: "Daily 9am AEST/AEDT",
    due: atLocalTime(9, 0),
  },
  {
    key: "signature-reminders",
    endpoint: "/api/scheduled/signature-reminders",
    cadence: "Daily 9:15am AEST/AEDT",
    due: atLocalTime(9, 15),
  },
];

function selectedJobs(parts) {
  const forcedJob = process.env.SCHEDULED_DISPATCH_JOB?.trim();
  if (forcedJob) {
    return jobs.filter((job) => job.key === forcedJob || job.endpoint.endsWith(`/${forcedJob}`));
  }
  if (process.env.SCHEDULED_DISPATCH_ALL === "true") {
    return jobs;
  }
  return jobs.filter((job) => job.due(parts));
}

async function postJob(baseUrl, secret, job) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.SCHEDULED_DISPATCH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${job.endpoint}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source: "railway-scheduled-dispatcher",
        jobKey: job.key,
        scheduledAt: new Date().toISOString(),
      }),
    });
    const text = await response.text();
    const duration = Date.now() - startedAt;
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    }
    console.log(`[scheduled-dispatcher] ${job.key} ok (${response.status}, ${duration}ms)`);
    if (process.env.SCHEDULED_DISPATCH_VERBOSE === "true" && text) {
      console.log(`[scheduled-dispatcher] ${job.key} response ${text.slice(0, 1000)}`);
    }
    return { key: job.key, ok: true };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const baseUrl = normaliseBaseUrl(process.env.SCHEDULED_APP_URL || process.env.PUBLIC_APP_URL || "https://app.commissogroup.au");
  const secret = requiredEnv("SCHEDULED_JOB_SECRET");
  const parts = localTimeParts();
  const due = selectedJobs(parts);

  if (due.length === 0) {
    console.log(`[scheduled-dispatcher] no jobs due at ${parts.weekday} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} ${TIME_ZONE}`);
    return;
  }

  console.log(`[scheduled-dispatcher] dispatching ${due.length} job(s) via ${baseUrl}`);
  const results = await Promise.allSettled(due.map((job) => postJob(baseUrl, secret, job)));
  const failures = results.filter((result) => result.status === "rejected");

  for (const failure of failures) {
    console.error(`[scheduled-dispatcher] failed: ${failure.reason?.message || failure.reason}`);
  }

  if (failures.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[scheduled-dispatcher] fatal: ${error.message || error}`);
  process.exit(1);
});
