import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  devIndicators: false,
  ...(process.env.STATIC_EXPORT === "1"
    ? {
        output: "export",
      }
    : {}),
  turbopack: {
    root: path.join(appDir, "../.."),
  },
};

export default nextConfig;
