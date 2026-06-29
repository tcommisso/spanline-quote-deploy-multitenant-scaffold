const databaseUrl = process.env.DATABASE_URL ?? process.env.MYSQL_PUBLIC_URL ?? process.env.MYSQL_URL ?? "";

function csv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

if (!process.env.DATABASE_URL) {
  const fallbackDatabaseUrl = process.env.MYSQL_PUBLIC_URL ?? process.env.MYSQL_URL;
  if (fallbackDatabaseUrl) {
    process.env.DATABASE_URL = fallbackDatabaseUrl;
  }
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl,
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  oAuthPortalUrl: process.env.VITE_OAUTH_PORTAL_URL ?? "https://manus.im",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "",
  tempAdminLoginToken: process.env.TEMP_ADMIN_LOGIN_TOKEN ?? "",
  tempAdminEmail: process.env.TEMP_ADMIN_EMAIL ?? "admin@altaspan.test",
  allowedMagicLinkOrigins: (process.env.ALLOWED_MAGIC_LINK_ORIGINS ?? "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean),
  tenancyMode: process.env.TENANCY_MODE ?? "single",
  defaultTenantSlug: process.env.DEFAULT_TENANT_SLUG ?? "default",
  requireAuthForStorageProxy: process.env.REQUIRE_AUTH_FOR_STORAGE_PROXY !== "false",
  isProduction: process.env.NODE_ENV === "production",
  storageProvider: (process.env.STORAGE_PROVIDER ?? "").trim().toLowerCase(),
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  openAiModelFallbacks: process.env.OPENAI_MODEL_FALLBACKS ?? "",
  openAiImageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
  openAiImageModelFallbacks: process.env.OPENAI_IMAGE_MODEL_FALLBACKS ?? "",
  openAiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe",
  mapProvider: (process.env.MAP_PROVIDER ?? "osm").trim().toLowerCase(),
  geocoderProvider: (process.env.GEOCODER_PROVIDER ?? "locationiq").trim().toLowerCase(),
  locationIqApiKey: process.env.LOCATIONIQ_API_KEY ?? "",
  openRouteServiceApiKey: process.env.OPENROUTESERVICE_API_KEY ?? "",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  scheduledJobSecret: process.env.SCHEDULED_JOB_SECRET ?? "",
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2Bucket: process.env.R2_BUCKET ?? process.env.S3_BUCKET ?? "",
  r2Endpoint: process.env.R2_ENDPOINT ?? process.env.S3_ENDPOINT ?? "",
  r2Region: process.env.R2_REGION ?? process.env.S3_REGION ?? "auto",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY ?? "",
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? process.env.S3_PUBLIC_BASE_URL ?? "",
  signwellApiKey: process.env.SIGNWELL_API_KEY ?? "",
  xeroClientId: process.env.XERO_CLIENT_ID ?? "",
  xeroClientSecret: process.env.XERO_CLIENT_SECRET ?? "",
  xeroRedirectUri: process.env.XERO_REDIRECT_URI ?? "",
  xeroScopes: process.env.XERO_SCOPES ?? "",
  xeroWebhookKey: process.env.XERO_WEBHOOK_KEY ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  teableApiUrl: process.env.TEABLE_API_URL ?? "https://app.teable.ai",
  teableAppToken: process.env.TEABLE_APP_TOKEN ?? "",
  zapierApiKey: process.env.ZAPIER_API_KEY ?? "",
  nylasClientId: process.env.NYLAS_CLIENT_ID ?? "",
  nylasApiKey: process.env.NYLAS_API_KEY ?? "",
  nylasApiUri: process.env.NYLAS_API_URI ?? "https://api.eu.nylas.com",
  // Microsoft Entra staff login
  msAuthTenantId: process.env.MS_AUTH_TENANT_ID ?? "",
  msAuthClientId: process.env.MS_AUTH_CLIENT_ID ?? "",
  msAuthClientSecret: process.env.MS_AUTH_CLIENT_SECRET ?? "",
  msAuthRedirectUri: process.env.MS_AUTH_REDIRECT_URI ?? "",
  msAuthAllowedDomains: csv(process.env.MS_AUTH_ALLOWED_DOMAINS),
  msAuthAllowAnyTenantUser: process.env.MS_AUTH_ALLOW_ANY_TENANT_USER === "true",
  msAuthAdminEmails: csv(process.env.MS_AUTH_ADMIN_EMAILS),
  msAuthSuperAdminEmails: csv(process.env.MS_AUTH_SUPER_ADMIN_EMAILS),
  // Microsoft Graph (Office 365 Email)
  msGraphTenantId: process.env.MS_GRAPH_TENANT_ID ?? "",
  msGraphClientId: process.env.MS_GRAPH_CLIENT_ID ?? "",
  msGraphClientSecret: process.env.MS_GRAPH_CLIENT_SECRET ?? "",
  msGraphMailboxes: csv(process.env.MS_GRAPH_MAILBOXES),
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

  requireInProduction("DATABASE_URL, MYSQL_PUBLIC_URL, or MYSQL_URL", ENV.databaseUrl);
  requireInProduction("JWT_SECRET", ENV.cookieSecret);
  requireInProduction("PUBLIC_APP_URL", ENV.publicAppUrl);

  if (ENV.isProduction && ENV.cookieSecret && ENV.cookieSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production");
  }

  if (!["single", "multi"].includes(ENV.tenancyMode)) {
    throw new Error("TENANCY_MODE must be either 'single' or 'multi'");
  }

  if (ENV.storageProvider && !["r2", "s3"].includes(ENV.storageProvider)) {
    throw new Error("STORAGE_PROVIDER must be one of: r2, s3");
  }

  if (ENV.storageProvider === "r2" || ENV.storageProvider === "s3") {
    requireInProduction("R2_BUCKET or S3_BUCKET", ENV.r2Bucket);
    requireInProduction("R2_ENDPOINT or S3_ENDPOINT", ENV.r2Endpoint);
    requireInProduction("R2_ACCESS_KEY_ID or S3_ACCESS_KEY_ID", ENV.r2AccessKeyId);
    requireInProduction("R2_SECRET_ACCESS_KEY or S3_SECRET_ACCESS_KEY", ENV.r2SecretAccessKey);
  }

  requireInProduction("OPENAI_API_KEY", ENV.openAiApiKey);
  if (ENV.geocoderProvider === "locationiq") {
    requireInProduction("LOCATIONIQ_API_KEY", ENV.locationIqApiKey);
  } else if (ENV.geocoderProvider === "google") {
    requireInProduction("GOOGLE_MAPS_API_KEY", ENV.googleMapsApiKey);
  }
  requireInProduction("SCHEDULED_JOB_SECRET", ENV.scheduledJobSecret);

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}
