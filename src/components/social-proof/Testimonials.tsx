import TestimonialCard from "@/components/social-proof/TestimonialCard";
import SectionHeading from "@/components/shared/SectionHeading";
import { testimonials } from "@/data/testimonials";

type TestimonialsProps = {
  limit?: number;
};

export default function Testimonials({ limit }: TestimonialsProps) {
  const items = limit ? testimonials.slice(0, limit) : testimonials;

  return (
    <section className="container-page py-14 md:py-20">
      <SectionHeading
        eyebrow="آراء الزبائن"
        title="ماذا يقول زبائننا عنا؟"
        description="ثقة أكثر من ألف زبون عبر مختلف ولايات الجزائر هي أكبر دليل على جودة منتجاتنا وخدماتنا."
        align="center"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {items.map((testimonial) => (
          <TestimonialCard key={testimonial.id} testimonial={testimonial} />
        ))}
      </div>
    </section>
  );
}
