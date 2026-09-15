import { describe, expect, it, vi, beforeEach } from "vitest";

const createDhdShipment = vi.fn();
const getDhdCommunes = vi.fn();
const findCourierCommuneMapping = vi.fn();
const upsertCourierCommuneMapping = vi.fn();

vi.mock("@/server/services/dhdService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/dhdService")>()),
  createDhdShipment: (...a: unknown[]) => createDhdShipment(...a),
  getDhdCommunes: (...a: unknown[]) => getDhdCommunes(...a),
}));
vi.mock("@/server/repositories/courierCommuneMappingRepository", () => ({
  findCourierCommuneMapping: (...a: unknown[]) => findCourierCommuneMapping(...a),
  upsertCourierCommuneMapping: (...a: unknown[]) => upsertCourierCommuneMapping(...a),
}));

import { getCarrierAdapter, isPermanentCarrierError } from "@/server/modules/shipping/carrierAdapter";

// SD-000737 الحقيقي: «بني كسيلة» (بجاية) رُفضت بـ«Commune mal écrite, ou désactivée»
const input = {
  reference: "SD-000737",
  fullName: "زبون",
  phone: "0550000000",
  address: "بني كسيلة، بجاية",
  wilayaCode: 6,
  commune: "بني كسيلة",
  amountDzd: 3400,
  productLabel: "باك",
  deliveryOption: "home" as const,
};

describe("DHD adapter — الاسم اللاتيني للبلدية يُحلّ تلقائيًا قبل الإرسال", () => {
  beforeEach(() => {
    createDhdShipment.mockReset().mockResolvedValue({ tracking: "T1", raw: {} });
    getDhdCommunes.mockReset();
    findCourierCommuneMapping.mockReset().mockResolvedValue(null);
    upsertCourierCommuneMapping.mockReset().mockResolvedValue(undefined);
  });

  it("بلا تصحيح محفوظ: يطابق «بني كسيلة» مع «Beni K'sila» من قائمة DHD ويحفظ التصحيح", async () => {
    getDhdCommunes.mockResolvedValue([{ name: "Bejaia", hasStopDesk: true }, { name: "Beni K'sila", hasStopDesk: false }]);
    await getCarrierAdapter("DHD").dispatch(input);
    expect(createDhdShipment).toHaveBeenCalledWith(expect.objectContaining({ commune: "Beni K'sila" }));
    expect(upsertCourierCommuneMapping).toHaveBeenCalledWith("DHD", 6, "بني كسيلة", "Beni K'sila");
  });

  it("تصحيح محفوظ سابقًا يُستعمل بلا نداء قائمة DHD", async () => {
    findCourierCommuneMapping.mockResolvedValue({ courierCommuneName: "Beni Ksila" });
    await getCarrierAdapter("DHD").dispatch(input);
    expect(getDhdCommunes).not.toHaveBeenCalled();
    expect(createDhdShipment).toHaveBeenCalledWith(expect.objectContaining({ commune: "Beni Ksila" }));
  });

  it("بلا أي مطابقة: رفض نهائي واضح (لا يُرسَل الاسم العربي لـDHD)", async () => {
    getDhdCommunes.mockResolvedValue([{ name: "Bejaia", hasStopDesk: true }]);
    const err = await getCarrierAdapter("DHD").dispatch(input).catch((e) => e);
    expect(isPermanentCarrierError(err)).toBe(true);
    expect(String(err.message)).toContain("بني كسيلة");
    expect(createDhdShipment).not.toHaveBeenCalled();
  });
});
