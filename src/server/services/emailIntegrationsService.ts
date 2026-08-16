import * as emailIntegrationsRepository from "@/server/repositories/emailIntegrationsRepository";
import type { EmailProvider } from "@/server/repositories/emailIntegrationsRepository";
import { decryptSecret } from "@/lib/crypto/secretBox";

const GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/userinfo.email"];
const GMAIL_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// لا تُرسل الأسرار الفعلية (clientSecret) للمتصفح أبدًا — فقط إشارة أنها محفوظة، لنفس
// السبب فdeleteCourierIntegration: تفادي كشفها عبر الشبكة وتفادي إعادة تشفيرها لو أُعيد
// إرسالها بلا تغيير.
export async function listEmailIntegrations() {
  const rows = await emailIntegrationsRepository.listEmailIntegrations();
  return rows.map((r) => ({
    provider: r.provider,
    isConnected: r.isConnected,
    connectedEmail: r.connectedEmail,
    clientId: r.clientId,
    hasClientSecret: !!r.clientSecret,
  }));
}

export function saveCredentials(provider: EmailProvider, clientId: string | null, clientSecret: string | null | undefined) {
  return emailIntegrationsRepository.saveEmailIntegrationCredentials(provider, clientId, clientSecret);
}

export function disconnect(provider: EmailProvider) {
  return emailIntegrationsRepository.disconnectEmailIntegration(provider);
}

export class IntegrationNotConfiguredError extends Error {}
export class IntegrationNotSupportedError extends Error {}

function callbackUrl(origin: string, provider: EmailProvider) {
  return `${origin}/api/admin/email-integrations/${provider}/callback`;
}

// state إلزامي (لا قيمة افتراضية) — الاستدعاء دون تمرير قيمة عشوائية حقيقية من الموجّه
// يُبطل تمامًا الغرض من حماية CSRF التي بُني من أجلها هذا المعامل.
export async function buildAuthorizeUrl(origin: string, provider: EmailProvider, state: string) {
  if (provider !== "gmail") {
    throw new IntegrationNotSupportedError("هذا المزوّد غير مدعوم بعد");
  }

  const integration = await emailIntegrationsRepository.findEmailIntegration(provider);
  if (!integration?.clientId || !integration.clientSecret) {
    throw new IntegrationNotConfiguredError("أدخل Client ID و Client Secret أولًا");
  }

  const params = new URLSearchParams({
    client_id: integration.clientId,
    redirect_uri: callbackUrl(origin, provider),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES.join(" "),
    state,
  });

  return `${GMAIL_AUTH_URL}?${params.toString()}`;
}

export async function handleGmailCallback(origin: string, code: string) {
  const integration = await emailIntegrationsRepository.findEmailIntegration("gmail");
  if (!integration?.clientId || !integration.clientSecret) {
    throw new IntegrationNotConfiguredError("أدخل Client ID و Client Secret أولًا");
  }

  const tokenRes = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: integration.clientId,
      client_secret: decryptSecret(integration.clientSecret),
      redirect_uri: callbackUrl(origin, "gmail"),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`فشل تبادل رمز التفويض: ${await tokenRes.text()}`);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const userInfoRes = await fetch(GMAIL_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = (await userInfoRes.json().catch(() => ({}))) as { email?: string };

  await emailIntegrationsRepository.saveEmailIntegrationTokens("gmail", {
    connectedEmail: userInfo.email ?? "",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? (integration.refreshToken ? decryptSecret(integration.refreshToken) : null),
    tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  });
}
