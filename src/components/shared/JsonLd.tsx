type JsonLdProps = {
  data: Record<string, unknown>;
};

export default function JsonLd({ data }: JsonLdProps) {
  // استبدال "<" يمنع سلسلة "</script>" داخل نص حر (اسم منتج مثلًا) من إنهاء وسم
  // السكربت مبكرًا والسماح بحقن HTML/سكربت بعده — نمط موثّق رسميًا لهذا الغرض بالضبط.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
