import Link from "next/link";
import BrandImage from "@/components/brand/BrandImage";
import type { BlogFrontmatter } from "@/lib/blog";
import { formatDate } from "@/lib/format";

type BlogCardProps = {
  post: BlogFrontmatter;
};

export default function BlogCard({ post }: BlogCardProps) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col rounded-xl overflow-hidden bg-ink gold-border hover:gold-glow transition-shadow"
    >
      <div className="relative aspect-[1200/630] overflow-hidden">
        <BrandImage
          src={post.coverImage}
          alt={post.title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
      </div>
      <div className="p-4 flex flex-col gap-2">
        <span className="text-xs text-gold">{formatDate(post.publishedDate)}</span>
        <h3 className="font-display font-semibold text-cream text-base line-clamp-2 group-hover:text-gold transition-colors">
          {post.title}
        </h3>
        <p className="text-sm text-cream-dim line-clamp-2">{post.metaDescription}</p>
      </div>
    </Link>
  );
}
