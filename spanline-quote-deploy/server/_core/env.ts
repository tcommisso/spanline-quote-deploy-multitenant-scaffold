export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "",
  allowedMagicLinkOrigins: (process.env.ALLOWED_MAGIC_LINK_ORIGINS ?? "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean),
  tenancyMode: process.env.TENANCY_MODE ?? "single",
  defaultTenantSlug: process.env.DEFAULT_TENANT_SLUG ?? "default",
  requireAuthForStorageProxy: process.env.REQUIRE_AUTH_FOR_STORAGE_PROXY !== "false",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  signwellApiKey: process.env.SIGNWELL_API_KEY ?? "",
  xeroClientId: process.env.XERO_CLIENT_ID ?? "",
  xeroClientSecret: process.env.XERO_CLIENT_SECRET ?? "",
  xeroWebhookKey: process.env.XERO_WEBHOOK_KEY ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  teableApiUrl: process.env.TEABLE_API_URL ?? "https://app.teable.ai",
  teableAppToken: process.env.TEABLE_APP_TOKEN ?? "",
  zapierApiKey: process.env.ZAPIER_API_KEY ?? "",
  nylasClientId: process.env.NYLAS_CLIENT_ID ?? "",
  nylasApiKey: process.env.NYLAS_API_KEY ?? "",
  nylasApiUri: process.env.NYLAS_API_URI ?? "https://api.eu.nylas.com",
  // Microsoft Graph (Office 365 Email)
  msGraphTenantId: process.env.MS_GRAPH_TENANT_ID ?? "",
  msGraphClientId: process.env.MS_GRAPH_CLIENT_ID ?? "",
  msGraphClientSecret: process.env.MS_GRAPH_CLIENT_SECRET ?? "",
  // Email sender configuration
  emailSenderAddress: process.env.EMAIL_SENDER_ADDRESS ?? "support@commissogroup.au",
  emailSenderName: process.env.EMAIL_SENDER_NAME ?? "Altaspan",
  emailReplyTo: process.env.EMAIL_REPLY_TO ?? "",
};

export function validateRequiredEnv() {
  const missing: string[] = [];
  const requireInProduction = (key: string, value: string) => {
    if (ENV.isProduction && !value) missing.push(key);
  };

  requireInProduction("DATABASE_URL", ENV.databaseUrl);
  requireInProduction("JWT_SECRET", ENV.cookieSecret);
  requireInProduction("VITE_APP_ID", ENV.appId);
  requireInProduction("OAUTH_SERVER_URL", ENV.oAuthServerUrl);
  requireInProduction("OWNER_OPEN_ID", ENV.ownerOpenId);
  requireInProduction("PUBLIC_APP_URL", ENV.publicAppUrl);

  if (ENV.isProduction && ENV.cookieSecret && ENV.cookieSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production");
  }

  if (!["single", "multi"].includes(ENV.tenancyMode)) {
    throw new Error("TENANCY_MODE must be either 'single' or 'multi'");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}
