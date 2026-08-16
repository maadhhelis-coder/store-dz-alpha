import Link from "next/link";
import SectionHeading from "@/components/shared/SectionHeading";
import BlogCard from "@/components/blog/BlogCard";
import { getAllBlogPosts } from "@/lib/blog";

export default function BlogTeaser() {
  const posts = getAllBlogPosts().slice(0, 3);

  if (posts.length === 0) return null;

  return (
    <section className="container-page py-14 md:py-20">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <SectionHeading
          eyebrow="مدونة Store DZ"
          title="مقالات ونصائح تهمك"
          description="كل ما تحتاج معرفته قبل الشراء، من دلائل الاختيار إلى نصائح الاستخدام."
        />
        <Link
          href="/blog"
          className="text-sm font-semibold text-gold hover:underline mb-8"
        >
          كل المقالات ←
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {posts.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}
