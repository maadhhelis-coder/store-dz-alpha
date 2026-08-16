import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import JsonLd from "@/components/shared/JsonLd";
import BrandImage from "@/components/brand/BrandImage";
import WhatsAppButton from "@/components/shared/WhatsAppButton";
import BlogCard from "@/components/blog/BlogCard";
import { mdxComponents } from "@/components/blog/MDXComponents";
import {
  getAllBlogPosts,
  getAllBlogSlugs,
  getBlogFrontmatter,
  getBlogSource,
} from "@/lib/blog";
import { getPublishedProductBySlug } from "@/lib/storefrontData";
import { formatDate } from "@/lib/format";
import { buildMetadata, articleJsonLd } from "@/lib/seo";
import { buildArticleMessage } from "@/lib/whatsapp";

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getAllBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!getAllBlogSlugs().includes(slug)) return {};
  const frontmatter = getBlogFrontmatter(slug);

  return buildMetadata({
    title: frontmatter.title,
    description: frontmatter.metaDescription,
    path: `/blog/${frontmatter.slug}`,
    image: frontmatter.coverImage,
    type: "article",
  });
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  if (!getAllBlogSlugs().includes(slug)) notFound();

  const frontmatter = getBlogFrontmatter(slug);
  const source = getBlogSource(slug);

  const { content } = await compileMDX({
    source,
    components: mdxComponents,
    options: { parseFrontmatter: false },
  });

  const relatedPosts = (frontmatter.relatedPostSlugs ?? [])
    .map((s) => getAllBlogPosts().find((p) => p.slug === s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const relatedProducts = (
    await Promise.all((frontmatter.relatedProductSlugs ?? []).map((s) => getPublishedProductBySlug(s)))
  ).filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <article className="container-page py-10 md:py-14">
      <JsonLd data={articleJsonLd(frontmatter)} />
      <Breadcrumbs
        items={[
          { name: "المدونة", path: "/blog" },
          { name: frontmatter.title, path: `/blog/${frontmatter.slug}` },
        ]}
      />

      <header className="max-w-3xl mx-auto mt-6 text-center">
        <p className="text-xs text-gold">{formatDate(frontmatter.publishedDate)}</p>
        <h1 className="font-display text-2xl md:text-4xl font-extrabold text-cream mt-3 leading-tight">
          {frontmatter.title}
        </h1>
        <p className="text-cream-dim mt-4">{frontmatter.metaDescription}</p>
      </header>

      <div className="relative aspect-[1200/630] max-w-4xl mx-auto rounded-2xl overflow-hidden gold-border mt-8">
        <BrandImage
          src={frontmatter.coverImage}
          alt={frontmatter.title}
          fill
          priority
          className="object-cover"
          sizes="(max-width: 896px) 100vw, 896px"
        />
      </div>

      <div className="max-w-3xl mx-auto mt-10">{content}</div>

      {relatedProducts.length > 0 && (
        <div className="max-w-3xl mx-auto mt-10 rounded-xl gold-border bg-ink p-6">
          <p className="text-cream font-semibold mb-2">منتجات ذات صلة بالمقال</p>
          <ul className="space-y-1">
            {relatedProducts.map((product) => (
              <li key={product.slug}>
                <Link
                  href={`/products/${product.slug}`}
                  className="text-gold underline underline-offset-4 hover:text-gold-light text-sm"
                >
                  {product.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="max-w-3xl mx-auto mt-10 rounded-xl gold-border bg-ink p-6 text-center">
        <p className="text-cream mb-4">عندك سؤال حول هذا الموضوع؟</p>
        <WhatsAppButton
          variant="pill"
          message={buildArticleMessage(frontmatter.title)}
          label="اسألنا عبر واتساب"
        />
      </div>

      {relatedPosts.length > 0 && (
        <div className="max-w-5xl mx-auto mt-14">
          <h2 className="font-display text-xl font-bold text-cream mb-5">
            مقالات ذات صلة
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {relatedPosts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
