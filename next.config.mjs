/** @type {import('next').NextConfig} */
const nextConfig = {
  // ffmpeg-static resolves its binary path via path.join(__dirname, ...) at
  // runtime. Next.js's route-handler bundler was inlining ffmpeg-static's
  // code into the compiled route chunk, which changes what __dirname
  // resolves to at runtime — the binary was requested from the route's own
  // output directory instead of node_modules/ffmpeg-static, causing
  // `spawn .../assess/ffmpeg ENOENT` in production. serverComponentsExternalPackages
  // keeps it a real require (preserving __dirname); outputFileTracingIncludes
  // makes sure the binary file itself still ships with the function.
  // Next.js 14.2 requires both under `experimental` (stabilized in later versions).
  experimental: {
    serverComponentsExternalPackages: ['ffmpeg-static'],
    outputFileTracingIncludes: {
      '/api/lesson/assess': ['./node_modules/ffmpeg-static/**/*'],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      },
    ],
    // Dicebear serves avatars as SVG — Next.js blocks SVG optimization by
    // default since an SVG can carry a script payload.
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
