import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent aggressive browser caching of the HTML shell so users always
  // get the latest deployed JS bundle. Static chunks keep their own
  // content-hashed filenames so they cache safely.
  async headers() {
    return [
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
