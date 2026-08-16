import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth/requireAdmin";
import { getOrder, updateOrderFields, OrderNotFoundError } from "@/server/services/ordersService";
import { createDhdShipment, DhdNotConfiguredError, DhdValidationError } from "@/server/services/dhdService";
import {
  findCourierCommuneMapping,
  upsertCourierCommuneMapping,
} from "@/server/repositories/courierCommuneMappingRepository";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const order = await getOrder(id);

    if (order.courierTrackingId) {
      return NextResponse.json({ error: "هذا الطلب لديه رقم تتبع بالفعل" }, { status: 400 });
    }
    // العنوان مطلوب فقط لتوصيل المنزل. لتوصيل المكتب (stop desk) نستعمل عنوانًا عامًا بديلًا
    // لأن DHD تشترط قيمة "adresse" غير فارغة في كل الحالات، حتى لو كانت الشحنة لمكتب استلام.
    if (order.deliveryOption === "home" && !order.address) {
      return NextResponse.json(
        { error: "أدخل عنوان الزبون أولاً قبل إرسال الشحنة (مطلوب لتوصيل المنزل)" },
        { status: 400 },
      );
    }
    const addressForDhd = order.address || `استلام من مكتب DHD - ${order.commune}`;

    const body = await request.json().catch(() => null);
    const communeOverride = typeof body?.communeOverride === "string" ? body.communeOverride : undefined;

    // إذا سبق وصحّح المسؤول اسم هذه البلدية (بالعربية كما يكتبها الزبون) عند DHD من
    // قبل، نستخدم الاسم المحفوظ تلقائيًا بدل الاصطدام بنفس خطأ "Commune" في كل مرة.
    const savedMapping = communeOverride
      ? null
      : await findCourierCommuneMapping("DHD", order.wilayaCode, order.commune);
    const communeToSend = communeOverride ?? savedMapping?.courierCommuneName ?? order.commune;

    const productLabel = order.items.map((item) => item.productNameSnapshot).join(", ");

    const result = await createDhdShipment({
      fullName: `${order.customerFirstName} ${order.customerLastName}`,
      phone: order.phone,
      address: addressForDhd,
      wilayaCode: order.wilayaCode,
      commune: communeToSend,
      amountDzd: order.totalDzd,
      productLabel,
      deliveryOption: order.deliveryOption,
      reference: order.orderNumber,
      note: order.notes ?? undefined,
    });

    // نجح الإرسال بهذا الاسم — إن كان مختلفًا عن اسم بلدية الطلب الأصلي (بالعربية)، نحفظه
    // كي لا يُطلب من المسؤول تصحيحه يدويًا مرة أخرى لنفس البلدية مستقبلًا.
    if (communeToSend !== order.commune) {
      await upsertCourierCommuneMapping("DHD", order.wilayaCode, order.commune, communeToSend);
    }

    const updated = await updateOrderFields(id, {
      courierProvider: "DHD",
      courierTrackingId: result.tracking,
    });

    return NextResponse.json({ order: updated });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof DhdNotConfiguredError || error instanceof DhdValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      console.error("send to DHD error", error);
      return NextResponse.json({ error: "تعذر الاتصال بخدمة التوصيل، حاول لاحقًا" }, { status: 502 });
    }
    console.error("send to DHD error", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
