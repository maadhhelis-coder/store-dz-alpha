import { describe, expect, it, vi } from "vitest";

const order = { id: "o1", status: "pending", wilayaCode: 16, address: "old", itemsSubtotalDzd: 2700, discountDzd: 0 };
const update = vi.fn(async (args: unknown) => args);
vi.mock("@/server/db/prisma", () => ({ prisma: { order: { update: (a: unknown) => update(a) } } }));
vi.mock("@/server/repositories/ordersRepository", () => ({ findOrderById: async () => order }));
vi.mock("@/server/repositories/wilayasRepository", () => ({
  findWilayaByCode: async () => ({ code: 16, isActive: true, homePriceDzd: 500, officePriceDzd: 350 }),
}));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));

import { updateOrderDelivery, OrderNotPendingError } from "@/server/services/ordersService";

// تغيير التوصيل يعيد حساب السعر والمجموع من تسعيرة الولاية ويمسح العنوان عند المكتب.
describe("updateOrderDelivery", () => {
  it("المنزل: سعر المنزل + المجموع + العنوان الجديد", async () => {
    await updateOrderDelivery("o1", { deliveryOption: "home", address: "شارع 5" });
    const data = (update.mock.calls.at(-1)![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ deliveryOption: "home", deliveryPriceDzd: 500, totalDzd: 3200, address: "شارع 5" });
  });

  it("المكتب: سعر المكتب، بلدية جديدة، والعنوان يُمسح", async () => {
    await updateOrderDelivery("o1", { deliveryOption: "office", commune: "باب الوادي" });
    const data = (update.mock.calls.at(-1)![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ deliveryOption: "office", deliveryPriceDzd: 350, totalDzd: 3050, commune: "باب الوادي", address: null });
  });

  it("يرفض طلبًا غير قيد الانتظار", async () => {
    order.status = "confirmed";
    await expect(updateOrderDelivery("o1", { deliveryOption: "home" })).rejects.toBeInstanceOf(OrderNotPendingError);
  });
});
