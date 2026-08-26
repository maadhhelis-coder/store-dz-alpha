"use client";

import { useEffect, useRef, useState } from "react";

// بعد 7 محاولات تخمين مختلفة على CSS الشريط لم تُحلّ المشكلة على جهاز حقيقي (Vivo X21،
// مؤكَّد فمتصفحين مختلفين ونافذة خاصة) — الحل هنا مختلف جذريًا: بدل تخمين إعداد CSS واحد
// يناسب "كل" الأجهزة، نقيس الأداء الفعلي للجهاز الحالي مباشرة (عدد الإطارات الحقيقي
// المُركَّبة خلال أول نصف ثانية)، وإذا كان الجهاز فعليًا يعجز عن مواكبة 60 إطارًا/ثانية
// (عتبة متساهلة: أقل من 40)، نُبسِّط الشريط تلقائيًا (نص فقط بلا شعار متحرك، حركة أبطأ
// فتصغر القفزة المرئية بين كل إطارين حقيقيين فتبدو الحركة سلسة حتى مع إطارات منخفضة).
// الأجهزة القوية (كالحاسوب) لا تتأثر إطلاقًا وتحصل على الشريط الكامل كما هو.
const SAMPLE_WINDOW_MS = 600;
const FPS_THRESHOLD = 40;

export default function MarqueePerfGate({ children }: { children: React.ReactNode }) {
  const [lite, setLite] = useState(false);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    let frameCount = 0;
    const start = performance.now();

    const sample = () => {
      frameCount++;
      const elapsed = performance.now() - start;
      if (elapsed < SAMPLE_WINDOW_MS) {
        rafId.current = requestAnimationFrame(sample);
        return;
      }
      const fps = (frameCount / elapsed) * 1000;
      if (fps < FPS_THRESHOLD) setLite(true);
    };

    rafId.current = requestAnimationFrame(sample);
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return <div className={lite ? "marquee-lite" : undefined}>{children}</div>;
}
