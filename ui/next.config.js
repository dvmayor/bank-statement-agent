/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",   // static export for Render static site
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  },
};
module.exports = nextConfig;
