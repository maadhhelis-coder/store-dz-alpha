import { describe, expect, it } from "vitest";
import {
  advancesShipment,
  mapCarrierStatus,
  orderStatusForShipment,
  shipmentProgressRank,
} from "@/server/modules/shipping/statusMapping";

// ترجمة حالات الناقل — وحدة نقية، بلا قاعدة ولا شبكة.
// القاعدة الحاكمة: ما ليس في الجدول لا يُخمَّن أبدًا.

describe("ترجمة حالة الناقل", () => {
  it("تترجم المفردات الموثّقة لحالات شحنة صحيحة", () => {
    expect(mapCarrierStatus("Ramassé")).toBe("handed_over");
    expect(mapCarrierStatus("En transit")).toBe("in_transit");
    expect(mapCarrierStatus("Sorti en livraison")).toBe("out_for_delivery");
    expect(mapCarrierStatus("Livré")).toBe("delivered");
    expect(mapCarrierStatus("Retour vers vendeur")).toBe("return_requested");
    expect(mapCarrierStatus("Retourné au vendeur")).toBe("returned");
    expect(mapCarrierStatus("Annulé")).toBe("cancelled");
  });

  it("تترجم مفردات حساب DHD الفعلية (22 حالة من لوحتهم)", () => {
    expect(mapCarrierStatus("Prêt à préparer")).toBe("created");
    expect(mapCarrierStatus("En ramassage")).toBe("handed_over");
    expect(mapCarrierStatus("Vers hub")).toBe("in_transit");
    expect(mapCarrierStatus("En hub")).toBe("in_transit");
    expect(mapCarrierStatus("Vers wilaya")).toBe("in_transit");
    expect(mapCarrierStatus("En livraison")).toBe("out_for_delivery");
    expect(mapCarrierStatus("Livre non encaissé")).toBe("delivered");
    expect(mapCarrierStatus("Livre encaissé non payé")).toBe("delivered");
    expect(mapCarrierStatus("Retours chez livreur")).toBe("return_requested");
    expect(mapCarrierStatus("Retours reçu")).toBe("returned");
    expect(mapCarrierStatus("Suspendus")).toBeNull();
  });

  it("تتحمّل اختلاف الحركات وحالة الأحرف والفراغات", () => {
    expect(mapCarrierStatus("  LIVRE  ")).toBe("delivered");
    expect(mapCarrierStatus("livré")).toBe("delivered");
    expect(mapCarrierStatus("En   Transit")).toBe("in_transit");
  });

  it("الحالة غير الموثّقة تُعيد null ولا تُخمَّن", () => {
    expect(mapCarrierStatus("Statut inconnu 42")).toBeNull();
    expect(mapCarrierStatus("")).toBeNull();
    expect(mapCarrierStatus("__dhd_unparsed_response__")).toBeNull();
    // قريبة لفظيًا لكنها ليست في الجدول — لا مطابقة تقريبية هنا عمدًا
    expect(mapCarrierStatus("Livraison partielle")).toBeNull();
  });
});

describe("ترتيب التقدّم يمنع التراجع", () => {
  it("يتقدّم للأمام فقط", () => {
    expect(advancesShipment("created", "in_transit")).toBe(true);
    expect(advancesShipment("in_transit", "delivered")).toBe(true);
  });

  it("يرفض التراجع والحدث المكرر منطقيًا", () => {
    expect(advancesShipment("delivered", "in_transit")).toBe(false);
    expect(advancesShipment("out_for_delivery", "handed_over")).toBe(false);
    expect(advancesShipment("in_transit", "in_transit")).toBe(false);
  });

  it("الحالات النهائية أعلى رتبة من كل ما قبلها", () => {
    for (const earlier of ["created", "handed_over", "in_transit", "out_for_delivery"] as const) {
      expect(shipmentProgressRank("delivered")).toBeGreaterThan(shipmentProgressRank(earlier));
      expect(shipmentProgressRank("returned")).toBeGreaterThan(shipmentProgressRank(earlier));
    }
    // مرتجعة بعد تسليم: لا تراجع، الرتبة أعلى
    expect(advancesShipment("delivered", "returned")).toBe(true);
  });
});

describe("سلطة الناقل على حالة الطلب", () => {
  it("الحالات التي يقودها الناقل تُترجَم لحالة طلب", () => {
    expect(orderStatusForShipment("in_transit")).toBe("in_transit");
    expect(orderStatusForShipment("out_for_delivery")).toBe("out_for_delivery");
    expect(orderStatusForShipment("delivered")).toBe("delivered");
    expect(orderStatusForShipment("return_requested")).toBe("return_to_origin");
    expect(orderStatusForShipment("returned")).toBe("returned");
  });

  it("الإنشاء والتسليم للناقل والإلغاء لا يحرّكون الطلب", () => {
    // shipped تُكتب عند نجاح الإرسال لا عند حدث لاحق
    expect(orderStatusForShipment("created")).toBeNull();
    expect(orderStatusForShipment("handed_over")).toBeNull();
    // إلغاء الطلب قرار تجاري بشري — الناقل لا يملكه
    expect(orderStatusForShipment("cancelled")).toBeNull();
    expect(orderStatusForShipment("error")).toBeNull();
  });
});
