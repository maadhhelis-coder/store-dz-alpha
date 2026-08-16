# ربط استمارة الطلب بـ Google Sheets

الربط خدام عندك بالفعل ✅ (تأكدنا بطلب تجريبي حقيقي). هذا تحديث بسيط زائد: تنظيم عرض الخانات + تلوين الجدول.

الخانات: **التاريخ، الاسم، اللقب، رقم الهاتف، الولاية، البلدية، العنوان، الكمية، المنتج، سعر المنتج، سعر التوصيل، المجموع، الملاحظات**

خانة **الملاحظات** خاصة بيك: تعبيها بروحك بعد ما تتصل بالزبون، وفيها قائمة جاهزة (تأكيد الطلب، إلغاء الطلب، لم يرد...) وكل حالة عندها لون مختلف.

## تحديث التنسيق (خطوتين بركة، ما يحتاجش إعادة نشر)

### 1. بدّل الكود بهذا (يحتوي تنسيق تلقائي وألوان لكل خانة)
افتح **Extensions ← Apps Script** فجدولك، امسح الكود القديم كامل، والصق هذا:

```js
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  if (sheet.getLastRow() === 0) {
    setupHeaders(sheet);
  }

  sheet.appendRow([
    new Date(data.createdAt),
    data.firstName,
    data.lastName,
    data.phone,
    data.wilayaName,
    data.commune,
    data.address,
    data.quantity,
    data.productName,
    data.productPrice,
    data.deliveryPrice,
    data.totalPrice,
    "", // الملاحظات: فارغة، تعبيها يدويًا بعد الاتصال بالزبون
  ]);

  return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupHeaders(sheet) {
  sheet.appendRow([
    "التاريخ", "الاسم", "اللقب", "رقم الهاتف", "الولاية", "البلدية",
    "العنوان", "الكمية", "المنتج", "سعر المنتج", "سعر التوصيل", "المجموع", "الملاحظات"
  ]);
}

// شغّل هذه الدالة مرة واحدة بركة (اختر runFullSetup من القائمة، ثم ▶ Run)
// تنظم عرض كل خانة، تلون رأس الجدول، وتحط قائمة+ألوان لخانة الملاحظات.
function runFullSetup() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getLastRow() === 0) setupHeaders(sheet);

  var headerColors = [
    "#cfe2f3", // التاريخ
    "#d9ead3", // الاسم
    "#d9ead3", // اللقب
    "#cfe2f3", // رقم الهاتف
    "#fff2cc", // الولاية
    "#fff2cc", // البلدية
    "#fff2cc", // العنوان
    "#f4cccc", // الكمية
    "#d9d2e9", // المنتج
    "#fce5cd", // سعر المنتج
    "#fce5cd", // سعر التوصيل
    "#ffe599", // المجموع
    "#ead1dc", // الملاحظات
  ];
  var columnWidths = [130, 100, 100, 120, 130, 130, 220, 70, 200, 110, 110, 110, 170];

  for (var i = 0; i < headerColors.length; i++) {
    var col = i + 1;
    sheet.getRange(1, col)
      .setBackground(headerColors[i])
      .setFontWeight("bold")
      .setFontColor("#000000")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
    sheet.setColumnWidth(col, columnWidths[i]);
  }

  sheet.setFrozenRows(1);
  sheet.getRange(2, 1, 2000, headerColors.length).setWrap(true).setVerticalAlignment("middle");

  var statusOptions = [
    "تأكيد الطلب", "إلغاء الطلب", "لم يرد", "إعادة الاتصال",
    "البريد الصوتي", "طلب وهمي", "رقم هاتف غير صحيح", "طلب مكرر"
  ];
  var notesRange = sheet.getRange("M2:M2000");
  var validationRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(statusOptions, true)
    .setAllowInvalid(false)
    .build();
  notesRange.setDataValidation(validationRule);

  var statusColors = {
    "تأكيد الطلب": "#b6d7a8",
    "إلغاء الطلب": "#ea9999",
    "لم يرد": "#ffe599",
    "إعادة الاتصال": "#9fc5e8",
    "البريد الصوتي": "#d5a6bd",
    "طلب وهمي": "#e06666",
    "رقم هاتف غير صحيح": "#cccccc",
    "طلب مكرر": "#f6b26b",
  };
  var rules = [];
  for (var status in statusColors) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(status)
        .setBackground(statusColors[status])
        .setRanges([notesRange])
        .build()
    );
  }
  sheet.setConditionalFormatRules(rules);
}
```

احفظ بـ **Ctrl + S**.

### 2. شغّل دالة التنظيم مرة واحدة بركة
1. فالقائمة العلوية جنب زر ▶ Run، بدّل الدالة المختارة لـ **runFullSetup**
2. دوس ▶ **Run** (قد يطلب Authorize من جديد، وافق)
3. روح لجدولك — راح تلقى: كل خانة بعرضها المناسب، رأس الجدول ملون (كل عمود بلون مختلف)، والنص يلتف بدل ما يتقطع، وخانة الملاحظات فيها قائمة منسدلة ملونة

**ملاحظة**: هذا التحديث ما يحتاجش إعادة نشر (Deploy) — الرابط لي عندك يبقى خدام كيما هو، لأن `doPost` ما تبدلتش، غير زدنا دالة تنظيم تخدمها بروحك من المحرر.

## تنظيف السطور التجريبية
فالجدول عندك دابا سطرين فيهم "???????" (تجارب تقنية مني)، وسطر "اختبار Store DZ" (تجربة حقيقية من الموقع نجحت ✅) — امسح الثلاثة سطور هاذو قبل ما تبدا تستقبل طلبات حقيقية.
