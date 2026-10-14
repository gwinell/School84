import type { NextConfig } from "next";
import { env } from "./lib/env";

// Presigned URLs come from AWS_ENDPOINT_URL_S3 using virtual-hosted-style
// addressing, so the allowed image host must be derived from that endpoint
// rather than hardcoded.
const storageUrl = new URL(env.AWS_ENDPOINT_URL_S3);
if (!["http:", "https:"].includes(storageUrl.protocol)) {
  throw new Error("AWS_ENDPOINT_URL_S3 must use HTTP or HTTPS");
}

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: storageUrl.protocol === "http:" ? "http" : "https",
        hostname: `${env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}.${storageUrl.hostname}`,
        port: storageUrl.port,
      },
    ],
  },
};

export default nextConfig;
