import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

function MdxLink({
  href,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const isInternal = href?.startsWith("/");
  if (isInternal && href) {
    return (
      <Link href={href} className="text-gold underline underline-offset-4 hover:text-gold-light">
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gold underline underline-offset-4 hover:text-gold-light"
      {...props}
    >
      {children}
    </a>
  );
}

export const mdxComponents = {
  h2: (props: { children?: ReactNode }) => (
    <h2 className="font-display text-xl md:text-2xl font-bold text-cream mt-10 mb-4" {...props} />
  ),
  h3: (props: { children?: ReactNode }) => (
    <h3 className="font-display text-lg md:text-xl font-semibold text-gold mt-8 mb-3" {...props} />
  ),
  p: (props: { children?: ReactNode }) => (
    <p className="text-cream-dim leading-relaxed mb-4" {...props} />
  ),
  ul: (props: { children?: ReactNode }) => (
    <ul className="list-disc pr-5 space-y-2 text-cream-dim mb-4" {...props} />
  ),
  ol: (props: { children?: ReactNode }) => (
    <ol className="list-decimal pr-5 space-y-2 text-cream-dim mb-4" {...props} />
  ),
  li: (props: { children?: ReactNode }) => <li className="leading-relaxed" {...props} />,
  strong: (props: { children?: ReactNode }) => (
    <strong className="text-cream font-semibold" {...props} />
  ),
  blockquote: (props: { children?: ReactNode }) => (
    <blockquote
      className="border-s-4 border-gold ps-4 my-6 text-cream italic"
      {...props}
    />
  ),
  a: MdxLink,
};
