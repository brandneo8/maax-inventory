import type { CatalogProduct } from "@/lib/data/products";
import { productDisplayName } from "@/lib/format";
import type { Option } from "@/components/product-picker";

export function toStockOutProductOption(
  product: Pick<CatalogProduct, "id" | "name" | "orderName" | "sku" | "barcode" | "sizeLabel" | "tagNames">,
): Option {
  return {
    id: product.id,
    label: productDisplayName(product) || product.sku?.trim() || "—",
    orderName: product.orderName,
    sku: product.sku,
    barcode: product.barcode,
    sizeLabel: product.sizeLabel,
    tagNames: product.tagNames,
  };
}
