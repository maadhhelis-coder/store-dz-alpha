import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VerifiedApiKey } from "@/server/services/apiKeysService";
import { apiKeyHasScope } from "@/server/services/apiKeysService";
import type { ApiKeyScope } from "@/lib/apiKeyScopes";
import { listProducts, getProduct, createProduct, updateProduct } from "@/server/services/productsService";
import { listOrders, getOrder, updateOrderStatus } from "@/server/services/ordersService";
import { listCustomers, getCustomer360 } from "@/server/modules/customers/customerQueryService";
import { productCreateSchema, productUpdateSchema } from "@/lib/validation/productSchema";
import { writableOrderStatusSchema } from "@/lib/validation/orderSchema";
import { getKpis } from "@/server/repositories/analyticsRepository";
import { getProfitabilityReport } from "@/server/modules/finance/profitabilityService";
import { PROFIT_DIMENSIONS } from "@/server/modules/finance/profitability";
import { getSystemStatus } from "@/server/modules/observability/systemStatusService";
import { getAllCrmSettings } from "@/server/modules/settings/crmSettingsService";
import { getCatalogExtras } from "@/server/modules/mcp/catalogExtras";
import { CRM_SETTING_KEYS } from "@/lib/validation/crmSettingsSchema";

// خادم MCP للمتجر — أدوات رقيقة فوق الخدمات القائمة (لا منطق أعمال هنا)، كل أداة
// تفرض نطاق مفتاح API نفسه الذي تفرضه مسارات REST (deny by default). بلا جلسة:
// الإجراءات التي تحتاج ممثلًا إداريًا للتدقيق (إعدادات CRM، المالية، الفريق) تبقى
// خارج MCP عمدًا — القراءة فقط لها.

// التواريخ نصوص ISO (JSON Schema لا يمثّل Date) وتُحوَّل عند التنفيذ
const iso = z.string().datetime({ offset: true }).describe("ISO 8601");
const date = (v?: string) => (v ? new Date(v) : undefined);

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true as const });

export function buildStoreMcpServer(key: VerifiedApiKey): McpServer {
  const server = new McpServer({ name: "storedz", version: "1.0.0" });
  const need = (scope: ApiKeyScope) => {
    if (!apiKeyHasScope(key, scope)) throw new Error(`المفتاح لا يملك النطاق ${scope}`);
  };
  // كل أداة تُغلَّف: خطأ الخدمة (تحقق zod، انتقال حالة مرفوض، عدم وجود) يعود للنموذج
  // كنص isError بدل أن يُسقط الطلب كله.
  const run = async (fn: () => Promise<unknown>) => {
    try {
      return json(await fn());
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  };

  server.registerTool(
    "list_products",
    {
      title: "قائمة المنتجات",
      description: "المنتجات (كل الحالات: منشورة/غير منشورة) مع السعر والمخزون. بحث بالاسم.",
      inputSchema: {
        search: z.string().max(100).optional(),
        isPublished: z.boolean().optional(),
        inStock: z.boolean().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
      },
    },
    async (args) => run(async () => (need("products:read"), listProducts(args))),
  );

  server.registerTool(
    "get_product",
    { title: "منتج واحد", description: "تفاصيل منتج كاملة (وصف، صور، متغيرات، مخزون) بمعرّفه.", inputSchema: { id: z.string().uuid() } },
    async ({ id }) => run(async () => (need("products:read"), getProduct(id))),
  );

  server.registerTool(
    "create_product",
    {
      title: "إنشاء منتج",
      description: "ينشئ منتجًا جديدًا بنفس قواعد لوحة التحكم (slug لاتيني، categoryId موجود، سعر صحيح دج). يُنشر مباشرة إلا إذا isPublished=false.",
      inputSchema: productCreateSchema.shape,
    },
    async (args) => run(async () => (need("products:write"), createProduct(productCreateSchema.parse(args)))),
  );

  server.registerTool(
    "update_product",
    {
      title: "تعديل منتج",
      description: "تعديل جزئي: الحقول الغائبة لا تُمسّ (السعر، المخزون، النشر، الوصف...). الصور تُدار من لوحة التحكم.",
      inputSchema: { id: z.string().uuid(), ...productUpdateSchema.shape },
    },
    async ({ id, ...patch }) => run(async () => (need("products:write"), updateProduct(id, productUpdateSchema.parse(patch)))),
  );

  server.registerTool(
    "get_catalog_extras",
    { title: "العروض والكوبونات", description: "العروض الإضافية النشطة والكوبونات الصالحة الآن (نفس ما يراه الوكيل الذكي).", inputSchema: {} },
    async () => run(async () => (need("products:read"), getCatalogExtras())),
  );

  server.registerTool(
    "list_orders",
    {
      title: "قائمة الطلبات",
      description: "الطلبات مع عناصرها. فلاتر: الحالة، الولاية، المدة (ISO)، بحث (رقم الطلب/الهاتف/الاسم).",
      inputSchema: {
        status: z.string().max(40).optional(),
        wilayaCode: z.number().int().optional(),
        dateFrom: iso.optional(),
        dateTo: iso.optional(),
        search: z.string().max(100).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      },
    },
    async (args) =>
      run(async () =>
        (need("orders:read"),
        listOrders({ ...args, dateFrom: date(args.dateFrom), dateTo: date(args.dateTo), status: args.status as Parameters<typeof listOrders>[0]["status"] })),
      ),
  );

  server.registerTool(
    "get_order",
    { title: "طلب واحد", description: "تفاصيل طلب بمعرّفه (UUID).", inputSchema: { id: z.string().uuid() } },
    async ({ id }) => run(async () => (need("orders:read"), getOrder(id))),
  );

  server.registerTool(
    "update_order_status",
    {
      title: "تغيير حالة طلب",
      description: "ينقل الطلب عبر آلة الحالات الرسمية (confirmed, cancelled, shipped...). الانتقال غير المسموح يُرفض بخطأ صريح.",
      inputSchema: { id: z.string().uuid(), status: writableOrderStatusSchema, notes: z.string().max(2000).optional() },
    },
    async ({ id, status, notes }) => run(async () => (need("orders:write"), updateOrderStatus(id, status, notes, { type: "api", id: key.id }))),
  );

  server.registerTool(
    "list_customers",
    {
      title: "قائمة العملاء",
      description: "العملاء مع الحالة ومستوى المخاطر والقطاع. بحث بالاسم/الهاتف.",
      inputSchema: {
        search: z.string().max(100).optional(),
        riskLevel: z.string().max(20).optional(),
        status: z.string().max(20).optional(),
        segment: z.string().max(40).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      },
    },
    async ({ page, pageSize, ...filters }) => run(async () => (need("customers:read"), listCustomers({ filters, page, pageSize }))),
  );

  server.registerTool(
    "get_customer_360",
    { title: "ملف عميل 360", description: "ملف العميل: الهواتف، المؤشرات، الطلبات، المخاطر، الجدول الزمني.", inputSchema: { customerId: z.string().uuid() } },
    async ({ customerId }) => run(async () => (need("customers:read"), getCustomer360({ customerId }))),
  );

  server.registerTool(
    "get_kpis",
    {
      title: "مؤشرات الأداء",
      description: "طلبات/تأكيد/تسليم/إيراد... لمدة معيّنة (ISO). بلا مدة = كل الوقت. طلبات الاختبار مستبعدة.",
      inputSchema: { start: iso.optional(), end: iso.optional() },
    },
    async ({ start, end }) => run(async () => (need("analytics:read"), getKpis({ start: date(start), end: date(end) }))),
  );

  server.registerTool(
    "get_profitability",
    {
      title: "تقرير الربحية",
      description: "محرك الربحية P6 (صافي الربح، COGS، الإعلانات، ROAS...) حسب بُعد: " + PROFIT_DIMENSIONS.join(", "),
      inputSchema: { from: iso, to: iso, dimension: z.enum(PROFIT_DIMENSIONS).default("product") },
    },
    async ({ from, to, dimension }) => run(async () => (need("analytics:read"), getProfitabilityReport({ from: new Date(from), to: new Date(to) }, dimension))),
  );

  server.registerTool(
    "get_system_status",
    { title: "حالة النظام", description: "قاعدة البيانات، الهجرات، صندوق الأحداث، التواصل، Sheets، المهام الدورية، التنبيهات المفتوحة.", inputSchema: {} },
    async () => run(async () => (need("analytics:read"), getSystemStatus())),
  );

  server.registerTool(
    "list_crm_settings",
    { title: "إعدادات CRM (قراءة)", description: "قيم إعدادات CRM الحالية: " + CRM_SETTING_KEYS.join(", ") + ". التعديل من لوحة التحكم فقط (يحتاج ممثلًا إداريًا للتدقيق).", inputSchema: {} },
    async () => run(async () => (need("analytics:read"), getAllCrmSettings())),
  );

  return server;
}
