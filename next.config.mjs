/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Roster import POSTs a few thousand student rows to a server action.
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
