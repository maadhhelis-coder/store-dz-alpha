import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type BlogFrontmatter = {
  title: string;
  slug: string;
  metaDescription: string;
  coverImage: string;
  publishedDate: string;
  updatedDate?: string;
  author: string;
  tags: string[];
  relatedProductSlugs?: string[];
  relatedPostSlugs?: string[];
};

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export function getAllBlogSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""));
}

export function getAllBlogPosts(): BlogFrontmatter[] {
  return getAllBlogSlugs()
    .map((slug) => getBlogFrontmatter(slug))
    .sort(
      (a, b) =>
        new Date(b.publishedDate).getTime() -
        new Date(a.publishedDate).getTime(),
    );
}

export function getBlogFrontmatter(slug: string): BlogFrontmatter {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data } = matter(raw);
  return data as BlogFrontmatter;
}

export function getBlogSource(slug: string): string {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { content } = matter(raw);
  return content;
}
