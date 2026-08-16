import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { isE2ETestRun } from "@/lib/e2eGuard";

// طبقة حماية ثانية مستقلة عن isE2ETestRun() المُستخدَم داخل كل خدمة (metaCapiService،
// tiktokEventsApiService) على حدة: هذا الحارس يعمل على مستوى الشبكة نفسه (global.fetch)
// ويُحجب أي نداء فعلي نحو نطاقات Meta/TikTok الحقيقية بغض النظر عن أي كود تطبيقي —
// فحتى لو نسي مطوّر لاحقًا حارس isE2ETestRun() فدالة جديدة، هذا الحارس يبقى يمنع الضرر
// الفعلي، ويترك دليلًا ملموسًا (ملف) يمكن لاختبار E2E فحصه لإثبات عدم حدوث أي محاولة.
const BLOCKED_HOSTS = ["graph.facebook.com", "business-api.tiktok.com"];

export const E2E_NETWORK_VIOLATIONS_FILE = "test-results/.e2e-network-violations.jsonl";

let installed = false;

export function installE2ENetworkGuard(): void {
  if (!isE2ETestRun() || installed) return;
  installed = true;

  mkdirSync(dirname(E2E_NETWORK_VIOLATIONS_FILE), { recursive: true });
  writeFileSync(E2E_NETWORK_VIOLATIONS_FILE, "");

  const originalFetch = global.fetch;

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return originalFetch(input, init);
    }

    if (BLOCKED_HOSTS.includes(hostname)) {
      const violation = { timestamp: new Date().toISOString(), hostname, url };
      appendFileSync(E2E_NETWORK_VIOLATIONS_FILE, JSON.stringify(violation) + "\n");
      console.error(`[e2e-network-guard] BLOCKED real network call during E2E run: ${url}`);
      throw new Error(`[e2e-network-guard] real network call blocked during E2E test run: ${hostname}`);
    }

    return originalFetch(input, init);
  }) as typeof fetch;

  console.log(`[e2e-network-guard] installed — blocking real calls to: ${BLOCKED_HOSTS.join(", ")}`);
}
