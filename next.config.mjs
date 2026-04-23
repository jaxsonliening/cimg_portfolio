/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Baseline security headers for every response.
        source: "/:path*",
        headers: [
          // Defense-in-depth against MIME sniffing.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Disallow framing — we don't embed this anywhere.
          { key: "X-Frame-Options", value: "DENY" },
          // Don't leak full referrer URLs to third parties.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Turn off features the app never uses.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
