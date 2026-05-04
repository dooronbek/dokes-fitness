import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Body-size note for /api/health-sync
// ---------------------------------------------------------------------------
// Next.js App Router does NOT expose a per-route body-size config in
// next.config.ts (the legacy `api.bodyParser.sizeLimit` only applies to the
// Pages Router, and `experimental.largePageDataBytes` only affects
// getStaticProps/getServerSideProps page data, not API route bodies). The
// `serverActions.bodySizeLimit` option only applies to Server Actions.
//
// The /api/health-sync route bypasses Next's automatic body parser entirely
// by reading `req.body` as a ReadableStream and decoding it manually — see
// src/app/api/health-sync/route.ts. That removes the framework-side cap.
//
// The remaining ceiling is set by the deployment platform. On Vercel:
//   • Hobby:  4.5 MB (hard limit, not configurable)
//   • Pro+:   defaults to 4.5 MB but can be raised via the dashboard
// ---------------------------------------------------------------------------
const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
