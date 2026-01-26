/** @type {import('next').NextConfig} */
const apiBaseUrl = (process.env.API_BASE_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiBaseUrl}/:path*` }
    ];
  }
};

export default nextConfig;
