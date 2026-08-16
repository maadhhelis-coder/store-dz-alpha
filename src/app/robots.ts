import type { MetadataRoute } from "next";
import { SITE_URL } from "@/data/site";

// ملف ديناميكي بدل public/robots.txt الثابت — يضمن أن رابط Sitemap يتبع SITE_URL
// نفسه المُستعمل فـ sitemap.ts وباقي الموقع، فلا يبقى يشير لدومين قديم عند تغييره.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
