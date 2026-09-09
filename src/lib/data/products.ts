import type { createClient } from "@/lib/supabase/server";
import { getProducts, getStoreLocations } from "@/lib/data/lookups";
import { productLabel } from "@/lib/format";
import type { ProductClassification } from "@/lib/labels";

type Client = Awaited<ReturnType<typeof createClient>>;

export type BundleComponent = {
  productId: string;
  quantity: number;
  label: string;
  allocatedCost: number | null;
};

export type CatalogProduct = {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  orderName: string;
  brand: string;
  brandSub: string;
  defaultClassification: ProductClassification | null;
  unitCost: number;
  rrp: number | null;
  threshold: number | null;
  sizeLabel: string | null;
  sizeMl: number | null;
  isSet: boolean;
  tagIds: string[];
  tagNames: string[];
  branchIds: string[];
  supplierIds: string[];
  supplierName: string;
  gstRegistered: boolean;
  components: BundleComponent[];
};

function pickSupplier(
  links: { supplier_id: string; is_preferred: boolean }[],
  supplierById: Map<string, { supplier_name: string; gst_registered: boolean }>,
) {
  const preferred = links.find((link) => link.is_preferred) ?? links[0];
  if (!preferred) {
    return { supplierIds: [] as string[], supplierName: "", gstRegistered: false };
  }
  const chosen = supplierById.get(preferred.supplier_id);
  const otherIds = links.map((link) => link.supplier_id).filter((id) => id !== preferred.supplier_id);
  return {
    supplierIds: [preferred.supplier_id, ...otherIds],
    supplierName: chosen?.supplier_name ?? "",
    gstRegistered: links.some((link) => Boolean(supplierById.get(link.supplier_id)?.gst_registered)),
  };
}

async function getSupplierLinksByProduct(supabase: Client, productIds: string[]) {
  const byProduct = new Map<string, { supplier_id: string; is_preferred: boolean }[]>();
  for (let index = 0; index < productIds.length; index += 200) {
    const chunk = productIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("supplier_products")
      .select("product_id, supplier_id, is_preferred")
      .in("product_id", chunk);
    if (error) throw new Error(error.message || "Could not load supplier links.");
    for (const row of data ?? []) {
      const list = byProduct.get(row.product_id) ?? [];
      list.push({ supplier_id: row.supplier_id, is_preferred: row.is_preferred });
      byProduct.set(row.product_id, list);
    }
  }
  return byProduct;
}

export async function getCatalogProducts(supabase: Client, companyId: string): Promise<CatalogProduct[]> {
  const products = await getProducts(supabase, companyId);
  const [{ data: suppliers, error: supplierError }, linksByProduct] = await Promise.all([
    supabase.from("suppliers").select("id, supplier_name, gst_registered").eq("company_id", companyId),
    getSupplierLinksByProduct(
      supabase,
      products.map((product) => product.id),
    ),
  ]);
  if (supplierError) throw new Error(supplierError.message || "Could not load suppliers.");

  const supplierById = new Map(
    (suppliers ?? []).map((supplier) => [
      supplier.id,
      { supplier_name: supplier.supplier_name, gst_registered: supplier.gst_registered },
    ]),
  );
  const byId = new Map(products.map((product) => [product.id, product]));

  return products.map((product) => {
    const brand = Array.isArray(product.brands) ? product.brands[0] : product.brands;
    const assigned = (product.product_tags ?? []).flatMap((row) => {
      const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags;
      return [{ id: row.tag_id, name: tag?.name ?? "" }];
    });
    const supplier = pickSupplier(linksByProduct.get(product.id) ?? [], supplierById);
    return {
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name?.trim() ?? "",
      orderName: product.order_name,
      brand: brand?.name ?? "",
      brandSub: product.brand_sub?.trim() ?? "",
      defaultClassification: product.default_classification,
      unitCost: Number(product.unit_cost_price),
      rrp: product.rrp == null ? null : Number(product.rrp),
      threshold: product.low_stock_threshold == null ? null : Number(product.low_stock_threshold),
      sizeLabel: product.size_label,
      sizeMl: product.size_ml == null ? null : Number(product.size_ml),
      isSet: Boolean(product.is_set),
      tagIds: assigned.map((tag) => tag.id),
      tagNames: assigned.map((tag) => tag.name).filter(Boolean),
      branchIds: (product.product_branches ?? []).map((row) => row.branch_id),
      supplierIds: supplier.supplierIds,
      supplierName: supplier.supplierName,
      gstRegistered: supplier.gstRegistered,
      components: (product.product_components ?? []).map((row) => {
        const component = byId.get(row.component_product_id);
        return {
          productId: row.component_product_id,
          quantity: Number(row.quantity),
          allocatedCost: row.allocated_cost == null ? null : Number(row.allocated_cost),
          label: productLabel(
            component
              ? { sku: component.sku, name: component.name, orderName: component.order_name }
              : null,
            row.component_product_id,
          ),
        };
      }),
    };
  });
}

export async function getBundleContents(supabase: Client, productIds: string[]) {
  const contents = new Map<string, BundleComponent[]>();
  if (productIds.length === 0) return contents;

  const { data, error } = await supabase
    .from("product_components")
    .select(
      "set_product_id, component_product_id, quantity, allocated_cost, products!product_components_component_product_id_fkey(sku, name, order_name)",
    )
    .in("set_product_id", productIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const list = contents.get(row.set_product_id) ?? [];
    list.push({
      productId: row.component_product_id,
      quantity: Number(row.quantity),
      allocatedCost: row.allocated_cost == null ? null : Number(row.allocated_cost),
      label: productLabel(product, row.component_product_id),
    });
    contents.set(row.set_product_id, list);
  }
  return contents;
}

export async function getBranchProductIds(supabase: Client, companyId: string, branchId: string) {
  const locations = await getStoreLocations(supabase, companyId);
  const locationIds = locations.filter((location) => location.branch_id === branchId).map((location) => location.id);
  const ids = new Set<string>();

  const [stock, retail, orders] = await Promise.all([
    locationIds.length === 0
      ? Promise.resolve({ data: [] as { product_id: string | null }[], error: null })
      : supabase.from("current_stock").select("product_id").in("store_location_id", locationIds),
    supabase.from("retail_use_entries").select("product_id").eq("company_id", companyId).eq("branch_id", branchId),
    supabase.from("purchase_orders").select("id").eq("company_id", companyId).eq("branch_id", branchId),
  ]);

  if (stock.error) throw stock.error;
  if (retail.error) throw retail.error;
  if (orders.error) throw orders.error;

  for (const row of stock.data ?? []) {
    if (row.product_id) ids.add(row.product_id);
  }
  for (const row of retail.data ?? []) {
    if (row.product_id) ids.add(row.product_id);
  }

  const orderIds = (orders.data ?? []).map((order) => order.id);
  if (orderIds.length > 0) {
    const { data: items, error } = await supabase
      .from("purchase_order_items")
      .select("product_id")
      .in("purchase_order_id", orderIds);
    if (error) throw error;
    for (const item of items ?? []) ids.add(item.product_id);
  }

  return ids;
}

export async function getBranchOnHand(
  supabase: Client,
  companyId: string,
  branchId: string,
  productIds: string[],
) {
  const qty = new Map<string, number>();
  if (productIds.length === 0) return qty;

  const locations = await getStoreLocations(supabase, companyId);
  const locationIds = locations.filter((location) => location.branch_id === branchId).map((location) => location.id);
  if (locationIds.length === 0) return qty;

  const wanted = new Set(productIds);
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("current_stock")
      .select("product_id, quantity_on_hand")
      .in("store_location_id", locationIds)
      .order("product_id")
      .order("store_location_id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message || "Could not load on-hand quantities.");
    for (const row of data ?? []) {
      if (!row.product_id || !wanted.has(row.product_id)) continue;
      qty.set(row.product_id, (qty.get(row.product_id) ?? 0) + Number(row.quantity_on_hand ?? 0));
    }
    if (!data || data.length < pageSize) break;
  }
  return qty;
}

export async function updateSalonProductNames(
  supabase: Client,
  companyId: string,
  branchId: string,
  updates: { id: string; name: string | null }[],
) {
  const wanted = [...new Map(updates.filter((row) => row.id).map((row) => [row.id, row.name]))];
  if (wanted.length === 0) return 0;

  const allowed = new Set<string>();
  for (let index = 0; index < wanted.length; index += 200) {
    const chunk = wanted.slice(index, index + 200).map(([id]) => id);
    const { data, error } = await supabase
      .from("product_branches")
      .select("product_id")
      .eq("branch_id", branchId)
      .in("product_id", chunk);
    if (error) throw new Error(error.message || "Could not check this salon’s product list.");
    for (const row of data ?? []) allowed.add(row.product_id);
  }

  if (wanted.some(([id]) => !allowed.has(id))) {
    throw new Error("Some products are not on this salon’s list.");
  }

  for (const [id, name] of wanted) {
    const { error } = await supabase
      .from("products")
      .update({ name })
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message || "Could not save product names.");
  }

  return wanted.length;
}
