import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // Tope global de las Server Actions: 2 MB de archivo más el sobrecosto del cuerpo multipart. Next rechaza
      // lo que lo supera antes de ejecutar la acción (specs/006-carga-estudios-ecg/research.md, R5).
      bodySizeLimit: "3mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
