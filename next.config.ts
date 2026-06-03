import type { NextConfig } from "next";
import { execSync } from "child_process";

// Resolve the build version at config-load time so the deployed app can
// show which commit + when it was built. Railway injects RAILWAY_GIT_COMMIT_SHA
// automatically; we fall back to the local git command for non-Railway
// builds and to 'dev' if neither is available.
function resolveBuildSha(): string {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) return process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7);
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

const buildSha = resolveBuildSha();
const buildTime = new Date().toISOString();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
  // Force the marketing-graphic route's font TTFs into the production
  // file trace. Next.js's static analysis can't see readFileSync() with
  // a dynamic process.cwd() path, so without this the TTFs are stripped
  // from the standalone build and we fall right back to missing-glyph
  // rectangles in the rendered marketing graphic. Pinning the glob here
  // is the documented escape hatch.
  outputFileTracingIncludes: {
    "/api/marketing-graphic": ["./src/assets/fonts/*.ttf"],
  },
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
