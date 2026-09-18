import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildStoreMcpServer } from "@/server/modules/mcp/server";

// MCP — تسجيل الأدوات وفرض النطاقات داخل الأداة (قبل أي وصول للقاعدة) — بلا قاعدة بيانات.

async function connect(scopes: string[]) {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = buildStoreMcpServer({ id: "k", scopes });
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientT);
  return client;
}

describe("Store DZ MCP", () => {
  it("يعرض كل الأدوات المتوقعة", async () => {
    const client = await connect([]);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "create_product", "get_catalog_extras", "get_customer_360", "get_kpis", "get_order", "get_product", "get_profitability",
        "get_system_status", "list_crm_settings", "list_customers", "list_orders", "list_products", "update_order_status", "update_product",
      ].sort(),
    );
  });

  it("مفتاح بلا النطاق المطلوب → isError بلا نداء خدمة", async () => {
    const client = await connect(["orders:read"]);
    const r = await client.callTool({ name: "update_order_status", arguments: { id: "00000000-0000-4000-8000-000000000000", status: "confirmed" } });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain("orders:write");
    const p = await client.callTool({ name: "create_product", arguments: { slug: "x", name: "x", categoryId: "00000000-0000-4000-8000-000000000000", priceDzd: 1, shortDescription: "s", longDescriptionHtml: "<p>l</p>" } });
    expect(p.isError).toBe(true);
    expect(JSON.stringify(p.content)).toContain("products:write");
  });

  it("مدخلات مخالفة للمخطط تُرفض قبل الوصول للخدمة", async () => {
    const client = await connect([]);
    const r = await client.callTool({ name: "get_order", arguments: { id: "not-a-uuid" } });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain("Invalid UUID");
  });
});
