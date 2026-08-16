export type Testimonial = {
  id: string;
  name: string;
  wilaya: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  productSlug?: string;
  date: string; // ISO
};

export const testimonials: Testimonial[] = [
  {
    id: "t1",
    name: "أمين ب.",
    wilaya: "الجزائر العاصمة",
    rating: 5,
    text: "طلبت السماعة اللاسلكية ووصلتني في يومين بصح، جودة الصوت زينة برك وما كانش داعي نخمم بزاف، تعامل محترم من الفريق.",
    productSlug: "wireless-earbuds",
    date: "2026-04-12",
  },
  {
    id: "t2",
    name: "سارة ك.",
    wilaya: "وهران",
    rating: 5,
    text: "الساعة الذكية رائعة، خفيفة وشاشتها واضحة، وخدمة الزبائن جاوبوني على واتساب في دقائق. نصيحة، تعامل موثوق 100%.",
    productSlug: "smart-fitness-watch",
    date: "2026-03-28",
  },
  {
    id: "t3",
    name: "يوسف م.",
    wilaya: "قسنطينة",
    rating: 4,
    text: "الحقيبة جودتها زينة والسعر مناسب، التوصيل تأخر شوية بصح المنتج يستاهل الانتظار.",
    productSlug: "womens-handbag",
    date: "2026-05-02",
  },
  {
    id: "t4",
    name: "ليلى ح.",
    wilaya: "سطيف",
    rating: 5,
    text: "بصراحة كنت خايفة نشري أونلاين بصح Store DZ كسبو ثقتي، الدفع عند الاستلام ريحني بزاف والمنتج مطابق للصور.",
    productSlug: "modern-sunglasses",
    date: "2026-02-14",
  },
  {
    id: "t5",
    name: "عبد الرحمان س.",
    wilaya: "عنابة",
    rating: 5,
    text: "الشاحن المغناطيسي حاجة تبارك الله، يشحن بسرعة وما يسخنش، وصل معبأ زين وفي وقته.",
    productSlug: "magnetic-fast-charger",
    date: "2026-01-30",
  },
  {
    id: "t6",
    name: "نور الهدى ع.",
    wilaya: "بجاية",
    rating: 5,
    text: "الساعة الرجالية شريتها هدية لخويا وعجبته بزاف، الباكيجينغ أنيق والسعر معقول مقارنة بالجودة.",
    productSlug: "classic-mens-watch",
    date: "2026-04-20",
  },
  {
    id: "t7",
    name: "محمد أ.",
    wilaya: "تلمسان",
    rating: 4,
    text: "المصباح الملون بدل جو الغرفة بصح كامل، تركيبه سهل والألوان أحسن من اللي تخيلتها.",
    productSlug: "rgb-led-lamp",
    date: "2026-05-18",
  },
  {
    id: "t8",
    name: "فاطمة الزهراء ب.",
    wilaya: "باتنة",
    rating: 5,
    text: "خدمة ما بعد البيع رهيبة، كان عندي سؤال بعد الشراء وجاوبوني بسرعة وبكل احترافية. رح نعاود نشري منهم.",
    date: "2026-03-05",
  },
  {
    id: "t9",
    name: "كريم ت.",
    wilaya: "ورقلة",
    rating: 5,
    text: "التوصيل وصلني لورقلة في وقته، ما كنتش متوقع يوصلو لهنا بهاذ السرعة. Store DZ يستاهل الثقة.",
    productSlug: "usb-portable-fan",
    date: "2026-04-01",
  },
  {
    id: "t10",
    name: "إيمان ز.",
    wilaya: "المسيلة",
    rating: 4,
    text: "المرطب صغير وعملي بزاف، خاصة فهاذ الجو الحار، وصلني معبأ مليح بدون أي ضرر.",
    productSlug: "mini-humidifier",
    date: "2026-05-25",
  },
];
