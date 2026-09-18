import type { createClient } from "@/lib/supabase/server";
import { getProducts, getStoreLocations } from "@/lib/data/lookups";
import { productDisplayName, productLabel } from "@/lib/format";
import { isAvailableInTunai, type ProductClassification } from "@/lib/labels";

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
  classificationsByBranch: Record<string, ProductClassification[]>;
  unitCost: number;
  rrp: number | null;
  threshold: number | null;
  sizeLabel: string | null;
  sizeMl: number | null;
  isSet: boolean;
  pictureUrl: string | null;
  tagIds: string[];
  tagNames: string[];
  branchIds: string[];
  supplierIds: string[];
  supplierName: string;
  gstRegistered: boolean;
  components: BundleComponent[];
};

export type OrderProductOption = {
  id: string;
  label: string;
  orderName: string | null;
  defaultClassification: ProductClassification | null;
  unitCost: number;
  sku: string | null;
  sizeLabel: string | null;
  barcode: string | null;
  branchAvgCost: number | null;
  tagNames: string[];
  supplierIds: string[];
};

export type StockOutProductOption = {
  id: string;
  label: string;
  orderName: string | null;
  sku: string | null;
  barcode: string | null;
  sizeLabel: string | null;
  tagNames: string[];
};

export type TunaiListProduct = {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  orderName: string;
  brand: string;
  sizeLabel: string | null;
  sizeMl: number | null;
  unitCost: number;
  rrp: number | null;
  onHand: number;
  classifications: ProductClassification[];
};

const PAGE_SIZE = 1000;
const IN_CHUNK = 200;
const PICKER_SELECT =
  "id, sku, barcode, name, order_name, unit_cost_price, rrp, size_label, size_ml, brands(name), product_tags(tags(name)), product_branch_classifications(branch_id, classification), supplier_products(supplier_id)";

type PickerRow = {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string | null;
  order_name: string;
  unit_cost_price: number | string | null;
  rrp: number | string | null;
  size_label: string | null;
  size_ml: number | string | null;
  brands: { name: string | null } | { name: string | null }[] | null;
  product_tags: { tags: { name: string | null } | { name: string | null }[] | null }[] | null;
  product_branch_classifications: { branch_id: string; classification: ProductClassification }[] | null;
  supplier_products: { supplier_id: string }[] | null;
};

function chunkIds<T>(items: T[], size = IN_CHUNK) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function nestedName(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || !("name" in row)) return "";
  return String((row as { name?: string | null }).name ?? "").trim();
}

function tagNamesFrom(product: PickerRow) {
  return (product.product_tags ?? []).flatMap((row) => {
    const name = nestedName(row.tags);
    return name ? [name] : [];
  });
}

function classificationsForBranch(product: PickerRow, branchId: string) {
  return (product.product_branch_classifications ?? [])
    .filter((row) => row.branch_id === branchId)
    .map((row) => row.classification);
}

async function getAssignedProductIds(supabase: Client, branchId: string) {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("product_branches")
      .select("product_id")
      .eq("branch_id", branchId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message || "Could not load this salon’s product list.");
    for (const row of data ?? []) ids.push(row.product_id);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return ids;
}

async function loadPickerRows(supabase: Client, companyId: string, productIds?: string[]) {
  const rows: PickerRow[] = [];
  if (productIds) {
    if (productIds.length === 0) return rows;
    for (const ids of chunkIds(productIds)) {
      const { data, error } = await supabase
        .from("products")
        .select(PICKER_SELECT)
        .eq("company_id", companyId)
        .eq("is_active", true)
        .in("id", ids);
      if (error) throw new Error(error.message || "Could not load products.");
      rows.push(...((data ?? []) as PickerRow[]));
    }
    return rows;
  }

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("products")
      .select(PICKER_SELECT)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("order_name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message || "Could not load products.");
    rows.push(...((data ?? []) as PickerRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function toOrderOption(product: PickerRow, branchId: string, avgCost: number | null): OrderProductOption {
  return {
    id: product.id,
    label: productDisplayName(product) || product.sku || product.id,
    orderName: product.order_name,
    defaultClassification: pickPrimaryClassification(classificationsForBranch(product, branchId)),
    unitCost: Number(product.unit_cost_price),
    sku: product.sku,
    sizeLabel: product.size_label,
    barcode: product.barcode,
    branchAvgCost: avgCost,
    tagNames: tagNamesFrom(product),
    supplierIds: (product.supplier_products ?? []).map((row) => row.supplier_id),
  };
}

function toStockOutOption(product: PickerRow): StockOutProductOption {
  return {
    id: product.id,
    label: productDisplayName(product) || product.sku?.trim() || "—",
    orderName: product.order_name,
    sku: product.sku,
    barcode: product.barcode,
    sizeLabel: product.size_label,
    tagNames: tagNamesFrom(product),
  };
}

function groupClassificationsByBranch(
  rows: { branch_id: string; classification: ProductClassification }[] | null | undefined,
) {
  const byBranch: Record<string, ProductClassification[]> = {};
  for (const row of rows ?? []) {
    const list = byBranch[row.branch_id] ?? [];
    list.push(row.classification);
    byBranch[row.branch_id] = list;
  }
  return byBranch;
}

const CLASSIFICATION_PRIORITY: ProductClassification[] = ["retail", "gwp", "inhouse"];

export function pickPrimaryClassification(
  tags: ProductClassification[] | null | undefined,
): ProductClassification | null {
  for (const candidate of CLASSIFICATION_PRIORITY) {
    if ((tags ?? []).includes(candidate)) return candidate;
  }
  return (tags ?? [])[0] ?? null;
}

export async function getBranchClassifications(supabase: Client, branchId: string) {
  const byProduct = new Map<string, ProductClassification[]>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("product_branch_classifications")
      .select("product_id, classification")
      .eq("branch_id", branchId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message || "Could not load product types for this salon.");
    for (const row of data ?? []) {
      const list = byProduct.get(row.product_id) ?? [];
      list.push(row.classification);
      byProduct.set(row.product_id, list);
    }
    if (!data || data.length < pageSize) break;
  }
  return byProduct;
}

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
      classificationsByBranch: groupClassificationsByBranch(product.product_branch_classifications),
      unitCost: Number(product.unit_cost_price),
      rrp: product.rrp == null ? null : Number(product.rrp),
      threshold: product.low_stock_threshold == null ? null : Number(product.low_stock_threshold),
      sizeLabel: product.size_label,
      sizeMl: product.size_ml == null ? null : Number(product.size_ml),
      isSet: Boolean(product.is_set),
      pictureUrl: product.picture_url,
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

export async function getProductBranchCosts(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("product_branch_costs")
    .select("product_id, branch_id, avg_unit_cost")
    .eq("company_id", companyId);
  if (error) throw error;

  const byProduct: Record<string, Record<string, number>> = {};
  for (const row of data ?? []) {
    const branchCosts = byProduct[row.product_id] ?? {};
    branchCosts[row.branch_id] = Number(row.avg_unit_cost);
    byProduct[row.product_id] = branchCosts;
  }
  return byProduct;
}

export async function getBranchAvgCosts(supabase: Client, companyId: string, branchId: string) {
  const { data, error } = await supabase
    .from("product_branch_costs")
    .select("product_id, avg_unit_cost")
    .eq("company_id", companyId)
    .eq("branch_id", branchId);
  if (error) throw error;
  const byProduct: Record<string, number> = {};
  for (const row of data ?? []) byProduct[row.product_id] = Number(row.avg_unit_cost);
  return byProduct;
}

export async function getOrderProductOptions(supabase: Client, companyId: string, branchId: string) {
  const [rows, avgCosts] = await Promise.all([
    loadPickerRows(supabase, companyId),
    getBranchAvgCosts(supabase, companyId, branchId),
  ]);
  return rows.map((product) => toOrderOption(product, branchId, avgCosts[product.id] ?? null));
}

export async function getBranchStockOutProducts(supabase: Client, companyId: string, branchId: string) {
  const assignedIds = await getAssignedProductIds(supabase, branchId);
  const rows = await loadPickerRows(supabase, companyId, assignedIds);
  const retail: StockOutProductOption[] = [];
  const inhouse: StockOutProductOption[] = [];
  for (const product of rows) {
    const classifications = classificationsForBranch(product, branchId);
    const option = toStockOutOption(product);
    if (isAvailableInTunai(classifications)) retail.push(option);
    if (classifications.includes("inhouse")) inhouse.push(option);
  }
  return { retail, inhouse };
}

export async function countTunaiProducts(supabase: Client, branchId: string) {
  const assignedIds = await getAssignedProductIds(supabase, branchId);
  if (assignedIds.length === 0) return 0;
  const classified = await getBranchClassifications(supabase, branchId);
  let total = 0;
  for (const id of assignedIds) {
    if (isAvailableInTunai(classified.get(id))) total += 1;
  }
  return total;
}

export async function getTunaiProducts(supabase: Client, companyId: string, branchId: string) {
  const assignedIds = await getAssignedProductIds(supabase, branchId);
  const [rows, onHand] = await Promise.all([
    loadPickerRows(supabase, companyId, assignedIds),
    getBranchOnHand(supabase, companyId, branchId, assignedIds),
  ]);
  const products: TunaiListProduct[] = [];
  for (const product of rows) {
    const classifications = classificationsForBranch(product, branchId);
    if (!isAvailableInTunai(classifications)) continue;
    products.push({
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name?.trim() ?? "",
      orderName: product.order_name,
      brand: nestedName(product.brands),
      sizeLabel: product.size_label,
      sizeMl: product.size_ml == null ? null : Number(product.size_ml),
      unitCost: Number(product.unit_cost_price),
      rrp: product.rrp == null ? null : Number(product.rrp),
      onHand: onHand.get(product.id) ?? 0,
      classifications,
    });
  }
  return products;
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
  _companyId: string,
  branchId: string,
  productIds: string[],
) {
  const qty = new Map<string, number>();
  if (productIds.length === 0) return qty;

  const { data: locations, error: locationError } = await supabase
    .from("store_locations")
    .select("id")
    .eq("branch_id", branchId);
  if (locationError) throw new Error(locationError.message || "Could not load storage locations.");
  const locationIds = (locations ?? []).map((location) => location.id);
  if (locationIds.length === 0) return qty;

  for (const ids of chunkIds(productIds)) {
    const { data, error } = await supabase
      .from("current_stock")
      .select("product_id, quantity_on_hand")
      .in("product_id", ids)
      .in("store_location_id", locationIds);
    if (error) throw new Error(error.message || "Could not load on-hand quantities.");
    for (const row of data ?? []) {
      if (!row.product_id) continue;
      qty.set(row.product_id, (qty.get(row.product_id) ?? 0) + Number(row.quantity_on_hand ?? 0));
    }
  }
  return qty;
}

export async function updateProductNames(
  supabase: Client,
  companyId: string,
  updates: { id: string; name: string | null }[],
) {
  const wanted = [...new Map(updates.filter((row) => row.id).map((row) => [row.id, row.name]))];
  if (wanted.length === 0) return 0;

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
