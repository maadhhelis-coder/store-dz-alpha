import { test, expect } from "./support/fixtures";
import { testPrisma } from "./support/testPrisma";

// MCP من طرف إلى طرف: مفتاح API حقيقي (نطاقات قراءة فقط) → initialize/tools.list/tools.call
// عبر /api/mcp (Streamable HTTP بلا جلسة) → النطاقات تُفرض داخل الأداة → بلا مفتاح 401.

const MCP_HEADERS = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const rpc = (id: number, method: string, params: Record<string, unknown> = {}) => ({ jsonrpc: "2.0", id, method, params });

test.describe("MCP للمتجر @desktop-only", () => {
  test("مفتاح بنطاق قراءة: القائمة والنداء يعملان، الكتابة مرفوضة، وبلا مفتاح 401", async ({ ownerPage, page }) => {
    const created = await ownerPage.request.post("/api/admin/api-keys", {
      data: { label: "e2e-mcp", scopes: ["products:read", "orders:read"] },
    });
    expect(created.status()).toBe(201);
    const { rawKey, apiKey } = await created.json();
    const r = page.request;
    const call = (body: unknown, key = rawKey) => r.post("/api/mcp/", { headers: { ...MCP_HEADERS, "x-api-key": key }, data: body });

    try {
      expect((await r.post("/api/mcp/", { headers: MCP_HEADERS, data: rpc(1, "initialize") })).status()).toBe(401);
      expect((await call(rpc(1, "initialize"), "bad-key")).status()).toBe(401);

      const init = await call(rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } }));
      expect(init.status()).toBe(200);
      expect((await init.json()).result.serverInfo.name).toBe("storedz");

      const list = await (await call(rpc(2, "tools/list"))).json();
      const names = list.result.tools.map((t: { name: string }) => t.name);
      expect(names).toContain("list_products");
      expect(names).toContain("update_order_status");
      expect(names).toHaveLength(14);

      const products = await (await call(rpc(3, "tools/call", { name: "list_products", arguments: { pageSize: 5 } }))).json();
      expect(products.result.isError).toBeFalsy();
      expect(JSON.parse(products.result.content[0].text)).toHaveProperty("items");

      const extras = await (await call(rpc(4, "tools/call", { name: "get_catalog_extras", arguments: {} }))).json();
      expect(JSON.parse(extras.result.content[0].text)).toMatchObject({ offers: expect.any(Array), coupons: expect.any(Array) });

      const denied = await (await call(rpc(5, "tools/call", { name: "update_order_status", arguments: { id: "00000000-0000-4000-8000-000000000000", status: "confirmed" } }))).json();
      expect(denied.result.isError).toBe(true);
      expect(denied.result.content[0].text).toContain("orders:write");

      const rest = await r.get("/api/admin/catalog-extras/", { headers: { "x-api-key": rawKey } });
      expect(rest.status()).toBe(200);
      expect(await rest.json()).toMatchObject({ offers: expect.any(Array), coupons: expect.any(Array) });
      expect((await r.get("/api/admin/catalog-extras/")).status()).toBe(401);
    } finally {
      await testPrisma.apiKey.delete({ where: { id: apiKey.id } });
    }
  });
});
