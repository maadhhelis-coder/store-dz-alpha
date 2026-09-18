import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyApiKey } from "@/server/services/apiKeysService";
import { buildStoreMcpServer } from "@/server/modules/mcp/server";

// MCP للمتجر (Streamable HTTP، بلا جلسة: خادم+نقل جديدان لكل طلب — يناسب Vercel
// serverless). المصادقة بمفتاح API القائم عبر x-api-key أو Authorization: Bearer؛
// النطاقات تُفرض داخل كل أداة. لا SSE (enableJsonResponse) ولا GET/DELETE.
//
//   claude mcp add --transport http storedz https://storedz.one/api/mcp \
//     --header "x-api-key: <KEY>"

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function rawKey(request: Request): string | null {
  const direct = request.headers.get("x-api-key");
  if (direct) return direct;
  const auth = request.headers.get("authorization");
  return auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
}

export async function POST(request: Request) {
  const raw = rawKey(request);
  const key = raw ? await verifyApiKey(raw) : null;
  if (!key) return NextResponse.json({ error: "مفتاح API غير صالح" }, { status: 401 });

  const server = buildStoreMcpServer(key);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // إغلاق بعد الرد — بلا حالة بين الطلبات
    void transport.close();
  }
}

export function GET() {
  return NextResponse.json({ error: "استعمل POST (Streamable HTTP بلا جلسة)" }, { status: 405 });
}

export const DELETE = GET;
