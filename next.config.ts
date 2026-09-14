import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Receiving lets users attach a scanned invoice up to 10MB (see
      // MAX_INVOICE_BYTES in orders/actions.ts); leave headroom for
      // multipart/form-data overhead above the app's own cap.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
