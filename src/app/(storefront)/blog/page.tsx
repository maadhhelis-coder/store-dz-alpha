import type { Metadata } from "next";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import SectionHeading from "@/components/shared/SectionHeading";
import BlogCard from "@/components/blog/BlogCard";
import { getAllBlogPosts } from "@/lib/blog";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "المدونة",
  description:
    "مقالات ونصائح من Store DZ حول اختيار المنتجات الأصلية، التسوق الآمن أونلاين في الجزائر، والعناية بمنتجاتك الإلكترونية والأزياء.",
  path: "/blog",
});

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();

  return (
    <div className="container-page py-10 md:py-14">
      <Breadcrumbs items={[{ name: "المدونة", path: "/blog" }]} />
      <SectionHeading
        as="h1"
        eyebrow="مدونة Store DZ"
        title="مقالات ونصائح تهمك"
        description="كل ما تحتاج معرفته قبل الشراء، من دلائل الاختيار إلى نصائح الاستخدام والعناية بمنتجاتك."
        className="mt-6"
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {posts.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </div>
  );
}
