import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "https://cimg-portfolio.vercel.app";
  return [
    {
      url: `${base}/`,
      changeFrequency: "always",
      priority: 1,
    },
  ];
}
