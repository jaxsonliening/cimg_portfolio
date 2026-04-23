import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "https://cimg-portfolio.vercel.app";
  return {
    rules: [
      // Crawl the public dashboard freely; keep the admin surface out
      // of indexes (auth-gated anyway, but no reason for it to rank).
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
