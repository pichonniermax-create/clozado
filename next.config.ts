import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* config options here */
};

// La configuration de langue de chaque requête vit dans src/i18n/request.ts.
export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
