import { Star } from "lucide-react";
import type { Testimonial } from "@/data/testimonials";

type TestimonialCardProps = {
  testimonial: Testimonial;
};

export default function TestimonialCard({ testimonial }: TestimonialCardProps) {
  return (
    <div className="rounded-xl gold-border bg-ink p-5 flex flex-col gap-3 h-full">
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className="w-4 h-4"
            strokeWidth={0}
            fill={i < testimonial.rating ? "#D4AF37" : "#3a3a3a"}
          />
        ))}
      </div>
      <p className="text-sm text-cream-dim leading-relaxed flex-1">
        {testimonial.text}
      </p>
      <div className="flex items-center justify-between pt-2 border-t border-gold/10">
        <span className="text-sm font-semibold text-cream">{testimonial.name}</span>
        <span className="text-xs text-cream-dim/80">{testimonial.wilaya}</span>
      </div>
    </div>
  );
}
