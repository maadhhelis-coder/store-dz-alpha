import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "start" | "center";
  className?: string;
  // "h1" فقط لصفحة لا يوجد بها عنوان رئيسي آخر (مثل ProductDetail's h1 الخاص بها) —
  // كل صفحة يجب أن تملك h1 واحدًا بالضبط.
  as?: "h1" | "h2";
};

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "start",
  className,
  as: Heading = "h2",
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "mb-8",
        align === "center" && "text-center mx-auto max-w-2xl",
        className,
      )}
    >
      {eyebrow && (
        <span className="text-xs font-semibold tracking-wider text-gold uppercase">
          {eyebrow}
        </span>
      )}
      <Heading className="font-display text-2xl md:text-3xl font-bold text-cream mt-2">
        {title}
      </Heading>
      {description && (
        <p className="text-cream-dim text-sm md:text-base mt-3 leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
