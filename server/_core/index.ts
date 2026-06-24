import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerVocphoneWebhooks } from "../vocphone-webhooks";
import { registerSignwellWebhooks } from "../signwell-webhooks";
import { registerSignatureReminderRoutes } from "../signature-reminders";
import { registerStripeWebhooks } from "../stripe-webhooks";
import { registerXeroWebhooks } from "../xero-webhooks";
import { registerScheduledSmsReminders } from "../scheduled-sms-reminders";
import { registerResendWebhooks } from "../resend-webhooks";
import { registerInboxWebhooks } from "../inbox-webhooks";
import { registerZapierApi } from "../zapier-api";
import { registerScheduledXeroPaymentSync } from "../scheduled-xero-payment-sync";
import { registerScheduledXeroFinancialSync } from "../scheduled-xero-financial-sync";
import { registerScheduledOverdueDigest } from "../scheduled-overdue-digest";
import { registerScheduledWeatherPoll } from "../scheduled-weather-poll";
import { registerScheduledQuoteExpiryReminder } from "../scheduled-quote-expiry-reminder";
import { registerScheduledBaOverdueNotify } from "../scheduled-ba-overdue-notify";
import { registerScheduledCostImportProcess } from "../scheduled-cost-import-process";
import { registerScheduledLowStockAlert } from "../scheduled-low-stock-alert";
import { registerScheduledInvitationExpiry } from "../scheduled-invitation-expiry";
import { registerScheduledRfiDueNotify } from "../scheduled-rfi-due-notify";
import { registerScheduledConditionDueReminder } from "../scheduled-condition-due-reminder";
import { registerScheduledDaTrackerPoll } from "../scheduled-da-tracker-poll";
import { registerScheduledNswDaPoll } from "../scheduled-nsw-da-poll";
import { registerScheduledHbcfSync } from "../scheduled-hbcf-sync";
import { registerGriffithDaIngest } from "../griffith-da-ingest";
import { registerScheduledMsGraphSync } from "../scheduled-msgraph-sync";
import { registerScheduledVocphoneSync } from "../scheduled-vocphone-sync";
import { registerScheduledMissedCallsDigest } from "../scheduled-missed-calls-digest";
import { registerStorageProxy } from "./storageProxy";
import { registerNylasCallbackRoutes } from "../nylas-callback-routes";
import { registerVocphoneRecordingRoutes } from "../vocphone-recordings";
import { validateRequiredEnv } from "./env";
import { registerHealthRoutes } from "./health";
import { bootstrapO365MailboxesFromEnv } from "../o365-bootstrap";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  validateRequiredEnv();
  await bootstrapO365MailboxesFromEnv();
  const app = express();
  const server = createServer(app);
  registerHealthRoutes(app);
  // Stripe/Xero webhooks need raw body BEFORE json parser
  registerStripeWebhooks(app);
  registerXeroWebhooks(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Storage proxy for /manus-storage/* paths
  registerStorageProxy(app);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Nylas hosted-auth callback, forwarded into the SPA profile page
  registerNylasCallbackRoutes(app);
  // Vocphone webhooks for inbound SMS and call events
  registerVocphoneWebhooks(app);
  // Authenticated same-origin proxy for VOCPhone call recordings
  registerVocphoneRecordingRoutes(app);
  // SignWell webhooks for digital signature status updates
  registerSignwellWebhooks(app);
  // Signature expiry reminder endpoint for scheduled tasks
  registerSignatureReminderRoutes(app);
  // Scheduled SMS reminders for installers (Heartbeat cron)
  registerScheduledSmsReminders(app);
  // Resend webhooks for email tracking (delivery, opens, clicks, bounces)
  registerResendWebhooks(app);
  // Inbox inbound email webhook + SLA check + feedback endpoint
  registerInboxWebhooks(app);
  // Zapier OAuth2 token endpoint and API routes
  registerZapierApi(app);
  // Scheduled Xero payment sync (daily overnight cron)
  registerScheduledXeroPaymentSync(app);
  // Scheduled Xero financial sync (chunked, every 5 minutes when active)
  registerScheduledXeroFinancialSync(app);
  // Scheduled overdue jobs digest email (daily morning cron)
  registerScheduledOverdueDigest(app);
  // Scheduled weather poll for 6 main locations (daily 6am AEST)
  registerScheduledWeatherPoll(app);
  // Scheduled quote expiry reminder (daily 9am AEST / 23:00 UTC)
  registerScheduledQuoteExpiryReminder(app);
  // Scheduled Approvals overdue notification (daily 8am AEST / 22:00 UTC)
  registerScheduledBaOverdueNotify(app);
  registerScheduledCostImportProcess(app);
  // Scheduled low-stock alert (daily 7am AEST / 21:00 UTC)
  registerScheduledLowStockAlert(app);
  // Scheduled invitation expiry cleanup (daily 2am AEST / 16:00 UTC)
  registerScheduledInvitationExpiry(app);
  // Scheduled RFI due date notification (daily 8:30am AEST / 22:30 UTC)
  registerScheduledRfiDueNotify(app);
  // Scheduled condition due-date reminder (daily 7am AEST / 21:00 UTC)
  registerScheduledConditionDueReminder(app);
  // Scheduled DA tracker poll (every 6 hours)
  registerScheduledDaTrackerPoll(app);
  // Scheduled NSW DA poll (daily) + competitor digest
  registerScheduledNswDaPoll(app);
  // Scheduled HBCF certificate register sync (daily)
  registerScheduledHbcfSync(app);
  // Griffith DA ingest webhook (push from local VPN machine)
  registerGriffithDaIngest(app);
  // Scheduled Microsoft Graph email sync (every 5 minutes)
  registerScheduledMsGraphSync(app);
  // Scheduled VOCPhone call sync (hourly)
  registerScheduledVocphoneSync(app);
  // Scheduled missed calls digest (daily 8am AEST / 22:00 UTC)
  registerScheduledMissedCallsDigest(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = process.env.NODE_ENV === "production"
    ? preferredPort
    : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`Received ${signal}, shutting down HTTP server...`);
    server.close(error => {
      if (error) {
        console.error("HTTP server shutdown failed:", error);
        process.exit(1);
      }
      process.exit(0);
    });
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

startServer().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
