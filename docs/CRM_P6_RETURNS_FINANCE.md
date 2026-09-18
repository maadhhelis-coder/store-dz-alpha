# CRM — P6: المرتجعات، مالية COD، الربحية والمقاييس

مرجع تشغيلي لما يطبّقه الكود فعليًا (المصدر: `src/server/modules/{returns,finance,metrics}`).
كل الأموال أعداد صحيحة **دج** — لا float ولا تقريب صامت في أي مسار.

## 1. دورة حياة الإرجاع (`returns` / `return_items`)

- دورات متعددة لكل طلب: `cycleNumber` يُولَّد داخل معاملة بعد `SELECT … FOR UPDATE` على صف
  الطلب؛ `UNIQUE(order_id, cycle_number)` في القاعدة حارس ثانٍ. رقم الإرجاع = `<orderNumber>-R<cycle>`.
- دورة نشطة واحدة كحد أقصى (فهرس فريد جزئي `returns_one_active_cycle_per_order_idx`).
- تُنشأ فقط لطلب وصل الناقل (`shipped` وما بعدها). الإرجاع الجزئي مسموح؛ Σ الكميات على
  الدورات غير المرفوضة لكل بند ≤ كمية البند (تُحسب تحت قفل الطلب).
- الحالات: `open → in_return_transit → received → inspected → closed | rejected`؛
  `partially_restocked`/`restocked` تُكتب من الاسترجاع فقط ثم `closed`.
- `received` يُحوّل الطلب عبر آلة الحالات إلى `returned` (وعند الحاجة عبر `return_to_origin`).
  **لا استرجاع مخزون في هذا الانتقال أبدًا** — السلوك القديم (استرجاع كامل عند `returned`) أُزيل.
- الاستبدال صريح: `isExchange=true` عند الإنشاء. لا يُعدّ رفضًا في المقاييس. الشحنة البديلة
  تُفتح بعد الاستلام عبر «إعادة الشحن» (`shipments.reship`).

## 2. قواعد الاسترجاع للمخزون

- المصدر الوحيد: `return_items.restocked_quantity` (`0 ≤ restocked ≤ quantity` — CHECK في القاعدة).
- يُطبَّق **الفارق فقط** بين القيمة الحالية والمطلوبة، تحت قفل صف البند (`FOR UPDATE`) + CAS.
- idempotent: تكرار نفس الطلب = `applied: []` بلا أثر. متزامنان بنفس القيم = فارق واحد.
- التناقص مرفوض (`RESTOCK_DECREASE_FORBIDDEN`) — أي تصحيح استثنائي = تسوية مخزون منفصلة موثّقة.
- مسموح فقط بعد الاستلام (`received`/`inspected`/`partially_restocked`)، و`restocked` تقبل الطلب بلا أثر (retry آمن).
- إعادة الشحن بعد إرجاع مُسترجَع تخصم من جديد **ما عاد للمخزون فقط** (Σ restocked) بخصم محروس.
- كل فارق سجل تدقيق `return_restock` داخل نفس المعاملة.

## 3. تسوية COD (`cod_settlements` / `cod_settlement_items`)

- الهوية: `provider + reconciliationKey`، حيث `reconciliationKey = YYYY-MM-DD:ref:<مرجع الدفعة>`
  أو `…:auto:<بصمة هويات السطور>` عند غياب المرجع. هوية السطر: رقم التتبّع وإلا رقم الطلب.
- `contentHash` بصمة المحتوى: نفس المفتاح ونفس المحتوى = إعادة استيراد (`replayed`) بلا أثر؛
  نفس المفتاح بمحتوى مختلف = `409 SETTLEMENT_CONFLICT` + `SystemAlert(cod_settlement_conflict)`.
- سباق استيرادين: `UNIQUE(provider, reconciliation_key)` يحسم — الخاسر يقرأ الفائز.
- القابل للتحصيل = `totalDzd + صافي التعديلات المالية`. حالات السطر:
  `matched` (المحصَّل = القابل) · `discrepancy` · `resolved` · `excluded` (طلب اختبار).
- الأثر المالي على الطلب مرة واحدة فقط: `codCollectedAt` (تاريخ السطر أو التسوية)
  و`codCollectedAmountDzd` إذا كان `codCollectedAt` فارغًا والمحصَّل ≤ القابل. لا دهس لأي
  قيمة سابقة (فرق يُعرض). المحصَّل > القابل بلا تعديل موثّق = فرق ولا يُكتب.
- طلب `delivered` يُنقل إلى `cod_collected` عبر آلة الحالات (خارج معاملة التسوية).
- الحل: `finance.reconcile` بسبب إلزامي لكل سطر؛ التسوية `resolved` حين لا يبقى سطر مفتوح.
- أي فرق/سطر بلا طلب يرفع `SystemAlert(cod_settlement_discrepancy)`.

## 4. التعديلات المالية (`financial_adjustments`)

- غير قابلة للتغيير: لا `PATCH`/`DELETE`. التصحيح = تعديل تعويضي جديد بـ`correctionOfId`
  (نفس الطلب، FK `Restrict` يمنع حذف الأصل).
- `amountDzd ≥ 0` (CHECK)، `credit` يزيد الربح، `debit` ينقصه. سبب + ممثل + audit إلزامية.
- ممنوعة على طلبات `isTest`.
- `idempotencyKey` اختياري من العميل (الواجهة ترسله دائمًا): إعادة إرسال نفس الطلب تُرجع السجل
  الأصلي بلا تكرار مالي (`idempotency_keys` في PostgreSQL هو المرجع).

## 5. صيغة الربحية (`finance/profitability.ts`)

```
Net Profit = Net Sales + Delivery Revenue − COGS − Carrier Cost − RTO/Return Cost
             − Packaging − Advertising − Other + Adjustments
Net Sales  = itemsSubtotalDzd − discountDzd (لقطات الطلب)
COGS       = Σ unitCostDzd(لقطة) × quantity — null = 0 + عدّاد "تكلفة غير معلومة"
```

- الإيراد وCOGS يُعترف بهما عند `deliveredAt` فقط ويسقطان كليًا عند الإرجاع بعد التسليم.
- كلفة الناقل: `actual` من الشحنة إن وُجدت؛ وإلا `estimated = deliveryPriceDzd` (التقدير الموثّق:
  رسم التوصيل ≈ أجرة الناقل) لما وصل الناقل؛ `unavailable` (0) لما لم يُشحن. لا اختراع كلفة.
- كلفة الإرجاع/RTO = شحن دورات الإرجاع غير المرفوضة + `(quantity − restocked) × unitCost`.
- التغليف/أخرى: لقطتا الطلب وقت الإنشاء (`packaging_cost_dzd` من `crm_settings` يُلتقط عند
  إنشاء الطلب) — تُحتسبان لما وصل الناقل.
- الأبعاد: order · orderItem · product · customer · campaign · adSet · ad · creative · landingPage ·
  wilaya · commune · carrier · date (يوم `createdAt` بتوقيت UTC). على مستوى البند تُوزَّع
  مكوّنات الطلب بنسبة `lineTotal` (largest remainder) فمجموع البنود = الطلب حرفيًا.

## 6. تخصيص إنفاق الإعلانات

- `allocated_i = spend × delivered_revenue_i ÷ Σ delivered_revenue` لكل إبداع
  (`platform::creativeName`)، بـ**largest remainder** على أعداد صحيحة (BigInt) — Σ الحصص = الإنفاق.
- الطريقة مسجَّلة: `allocationMethod = largest_remainder_v1`.
- إبداع بلا إيراد مُسلَّم في الفترة = إنفاق غير مخصَّص (يُعرض، لا يُخمَّن). طلب معزوّ بلا إنفاق
  مسجَّل = `advertisingProvenance = unavailable`. لا عزو = `none`. كل إبداع يُخصَّص مرة واحدة.
- **حد معروف**: `ad_spend_entries` نافذة متدحرجة (لا تاريخ لكل صف) — التخصيص يوزّع الإنفاق
  الحالي على طلبات الفترة المختارة؛ فترات أطول من 30 يومًا تُخفّض الحصة لكل طلب. معروض في الواجهة.

## 7. تعريفات المقاييس (`metrics/definitions.ts` — المصدر الوحيد)

| المقياس | التعريف | المقام صفر |
|---|---|---|
| Delivery Rate | `deliveredAt != null` ÷ وصل الناقل (`shipped…returned`) | `null` |
| Refusal Rate | دورات إرجاع بسبب `refused` (غير مرفوضة، ليست استبدالًا) ÷ وصل الناقل | `null` |
| Cancellation Rate | `cancelled` ÷ كل الطلبات | `null` |
| RTO Rate | `return_to_origin` أو `returned` بلا تسليم ÷ وصل الناقل | `null` |
| AOV | الإيراد المعترف به (صافي المبيعات + التوصيل) ÷ الطلبات المعترف بها غير المرتجعة | `null` |
| Revenue CLV | Net Recognized Revenue | — |
| Gross Profit CLV | Revenue CLV − COGS | — |
| Net Profit CLV | Revenue CLV − (COGS + توصيل + تغليف + أخرى + شحن الإرجاع) + صافي التعديلات | — |
| ROAS | الإيراد المعترف به للطلبات المعزوّة ÷ الإنفاق المخصَّص | `null` |
| Profit ROAS | صافي ربح الطلبات المعزوّة ÷ الإنفاق المخصَّص | `null` |
| CAC | الإنفاق المخصَّص على طلبات العملاء الجدد (`new_customer`) ÷ عددهم | `null` |

المستبعد من كل الأنابيب (إلا "الإلغاء ÷ الكل"): `cancelled/fake/duplicate/wrong_number/fraud_suspected`.

## 8. استثناء طلبات الاختبار

`orders.is_test = true` مستبعد على مستوى **الاستعلام** في: محرك الربحية، المقاييس، Customer 360،
لوحات التحليلات القائمة (`analyticsRepository`, `masterDashboardRepository`, `creativeAnalyticsService`,
`pageAnalyticsService`, `dashboardRepository`)، قوائم المرتجعات/التعديلات، وسطور التسوية (`excluded`).

## 9. الصلاحيات (role_permissions — لا شيء في crm_settings)

| العملية | الصلاحية |
|---|---|
| قراءة المرتجعات | `returns.read` |
| إنشاء دورة / انتقال حالة | `returns.manage` |
| استرجاع للمخزون | `returns.manage` **و** `inventory.adjust` |
| قراءة المالية/الربحية | `finance.read` |
| استيراد/حل التسويات | `finance.reconcile` |
| تعديل مالي | `finance.adjust` |

## 10. حدود تشغيلية معروفة

- لا يوجد مصدر آلي لكلفة الناقل الفعلية (`shipping_cost_dzd` لا يُملأ من DHD) — كل كلفة ناقل
  الآن `estimated` وتُعدّ مرئية كذلك في الواجهة.
- إنفاق الإعلانات غير مؤرَّخ يوميًا (راجع §6).
- التسوية تُستورد يدويًا (نص/كشف) — لا اتصال آلي بمنصة DHD المالية. مطابقة رقم التتبّع
  بـprovider بلا حساسية لحالة الأحرف (الشحنات "DHD"، التسوية "dhd").
- استرجاع المخزون يتطلب أن يظل المنتج/المتغيّر موجودًا (`RESTOCK_TARGET_MISSING` وإلا).
