import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Receiving lets users attach a scanned invoice up to 10MB (see
      // MAX_INVOICE_BYTES in stock-in/actions.ts); leave headroom for
      // multipart/form-data overhead above the app's own cap.
      bodySizeLimit: "11mb",
    },
  },
  async redirects() {
    // /orders used to be the purchase-order app; it's now the Inventory
    // Balance workspace, and receiving/detail live under /stock-in. Old
    // bookmarks and deep links to a specific PO still need to land somewhere.
    return [
      {
        source: "/orders/:id([0-9a-fA-F-]{36})",
        destination: "/stock-in/:id",
        permanent: false,
      },
      {
        source: "/orders/:id([0-9a-fA-F-]{36})/receive",
        destination: "/stock-in/:id/receive",
        permanent: false,
      },
      {
        source: "/orders/new",
        destination: "/orders",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
