export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      branch_users: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          branch_manager_contact: string | null
          branch_manager_name: string | null
          company_id: string
          created_at: string
          id: string
          inventory_manager_contact: string | null
          inventory_manager_name: string | null
          name: string
        }
        Insert: {
          address?: string | null
          branch_manager_contact?: string | null
          branch_manager_name?: string | null
          company_id: string
          created_at?: string
          id?: string
          inventory_manager_contact?: string | null
          inventory_manager_name?: string | null
          name: string
        }
        Update: {
          address?: string | null
          branch_manager_contact?: string | null
          branch_manager_name?: string | null
          company_id?: string
          created_at?: string
          id?: string
          inventory_manager_contact?: string | null
          inventory_manager_name?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          company_id: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          catalog_saved_at: string | null
          catalog_saved_by_email: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          catalog_saved_at?: string | null
          catalog_saved_by_email?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          catalog_saved_at?: string | null
          catalog_saved_by_email?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      company_users: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_items: {
        Row: {
          classification:
            | Database["public"]["Enums"]["product_classification"]
            | null
          goods_receipt_id: string
          id: string
          product_id: string
          purchase_discount_amount: number
          purchase_order_item_id: string | null
          quantity_received: number
          store_location_id: string
          unit_cost: number
        }
        Insert: {
          classification?:
            | Database["public"]["Enums"]["product_classification"]
            | null
          goods_receipt_id: string
          id?: string
          product_id: string
          purchase_discount_amount?: number
          purchase_order_item_id?: string | null
          quantity_received: number
          store_location_id: string
          unit_cost: number
        }
        Update: {
          classification?:
            | Database["public"]["Enums"]["product_classification"]
            | null
          goods_receipt_id?: string
          id?: string
          product_id?: string
          purchase_discount_amount?: number
          purchase_order_item_id?: string | null
          quantity_received?: number
          store_location_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_store_location_id_fkey"
            columns: ["store_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          branch_id: string
          company_id: string
          created_at: string
          id: string
          invoice_id: string | null
          notes: string | null
          purchase_order_id: string | null
          received_by: string | null
          received_date: string
        }
        Insert: {
          branch_id: string
          company_id: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          purchase_order_id?: string | null
          received_by?: string | null
          received_date?: string
        }
        Update: {
          branch_id?: string
          company_id?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          purchase_order_id?: string | null
          received_by?: string | null
          received_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_reconciliation"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "goods_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_entries: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inventory_count_id: string
          inventory_count_item_id: string
          quantity_delta: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_count_id: string
          inventory_count_item_id: string
          quantity_delta: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_count_id?: string
          inventory_count_item_id?: string
          quantity_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_entries_inventory_count_id_fkey"
            columns: ["inventory_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_entries_inventory_count_item_id_fkey"
            columns: ["inventory_count_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_count_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
          counted_quantity: number | null
          expected_quantity: number | null
          id: string
          inventory_count_id: string
          notes: string | null
          product_id: string
          store_location_id: string
          variance: number | null
        }
        Insert: {
          counted_quantity?: number | null
          expected_quantity?: number | null
          id?: string
          inventory_count_id: string
          notes?: string | null
          product_id: string
          store_location_id: string
          variance?: number | null
        }
        Update: {
          counted_quantity?: number | null
          expected_quantity?: number | null
          id?: string
          inventory_count_id?: string
          notes?: string | null
          product_id?: string
          store_location_id?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_items_inventory_count_id_fkey"
            columns: ["inventory_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_store_location_id_fkey"
            columns: ["store_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          additional_filters: Json | null
          branch_id: string
          company_id: string
          count_date: string
          counted_by: string | null
          created_at: string
          filter_brand_id: string | null
          filter_classification:
            | Database["public"]["Enums"]["product_classification"]
            | null
          filter_tag_id: string | null
          id: string
          status: string
          store_location_id: string | null
        }
        Insert: {
          additional_filters?: Json | null
          branch_id: string
          company_id: string
          count_date?: string
          counted_by?: string | null
          created_at?: string
          filter_brand_id?: string | null
          filter_classification?:
            | Database["public"]["Enums"]["product_classification"]
            | null
          filter_tag_id?: string | null
          id?: string
          status?: string
          store_location_id?: string | null
        }
        Update: {
          additional_filters?: Json | null
          branch_id?: string
          company_id?: string
          count_date?: string
          counted_by?: string | null
          created_at?: string
          filter_brand_id?: string | null
          filter_classification?:
            | Database["public"]["Enums"]["product_classification"]
            | null
          filter_tag_id?: string | null
          id?: string
          status?: string
          store_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_filter_brand_id_fkey"
            columns: ["filter_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_filter_tag_id_fkey"
            columns: ["filter_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_store_location_id_fkey"
            columns: ["store_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          company_id: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          quantity_change: number
          reference_id: string | null
          reference_table: string | null
          store_location_id: string
          txn_date: string
          txn_type: Database["public"]["Enums"]["inventory_txn_type"]
        }
        Insert: {
          company_id: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity_change: number
          reference_id?: string | null
          reference_table?: string | null
          store_location_id: string
          txn_date?: string
          txn_type: Database["public"]["Enums"]["inventory_txn_type"]
        }
        Update: {
          company_id?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity_change?: number
          reference_id?: string | null
          reference_table?: string | null
          store_location_id?: string
          txn_date?: string
          txn_type?: Database["public"]["Enums"]["inventory_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_store_location_id_fkey"
            columns: ["store_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          goods_receipt_item_id: string | null
          id: string
          invoice_id: string
          line_total: number | null
          product_id: string
          purchase_discount_amount: number
          quantity: number
          tax_amount: number
          unit_price: number
        }
        Insert: {
          goods_receipt_item_id?: string | null
          id?: string
          invoice_id: string
          line_total?: number | null
          product_id: string
          purchase_discount_amount?: number
          quantity: number
          tax_amount?: number
          unit_price: number
        }
        Update: {
          goods_receipt_item_id?: string | null
          id?: string
          invoice_id?: string
          line_total?: number | null
          product_id?: string
          purchase_discount_amount?: number
          quantity?: number
          tax_amount?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_goods_receipt_item_id_fkey"
            columns: ["goods_receipt_item_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_reconciliation"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          branch_id: string
          company_id: string
          created_at: string
          id: string
          invoice_date: string
          invoice_number: string
          purchase_discount_amount: number
          purchase_order_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          supplier_id: string
          total_amount: number | null
          total_gross_amount: number | null
          total_tax_amount: number | null
        }
        Insert: {
          branch_id: string
          company_id: string
          created_at?: string
          id?: string
          invoice_date: string
          invoice_number: string
          purchase_discount_amount?: number
          purchase_order_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          supplier_id: string
          total_amount?: number | null
          total_gross_amount?: number | null
          total_tax_amount?: number | null
        }
        Update: {
          branch_id?: string
          company_id?: string
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          purchase_discount_amount?: number
          purchase_order_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          supplier_id?: string
          total_amount?: number | null
          total_gross_amount?: number | null
          total_tax_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_components: {
        Row: {
          allocated_cost: number | null
          component_product_id: string
          quantity: number
          set_product_id: string
        }
        Insert: {
          allocated_cost?: number | null
          component_product_id: string
          quantity?: number
          set_product_id: string
        }
        Update: {
          allocated_cost?: number | null
          component_product_id?: string
          quantity?: number
          set_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_set_product_id_fkey"
            columns: ["set_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_branches: {
        Row: {
          branch_id: string
          product_id: string
        }
        Insert: {
          branch_id: string
          product_id: string
        }
        Update: {
          branch_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_branches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          product_id: string
          tag_id: string
        }
        Insert: {
          product_id: string
          tag_id: string
        }
        Update: {
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand_id: string | null
          brand_sub: string | null
          company_id: string
          created_at: string
          crp: number
          default_classification:
            | Database["public"]["Enums"]["product_classification"]
            | null
          description: string | null
          id: string
          is_active: boolean
          is_set: boolean
          low_stock_threshold: number | null
          name: string | null
          order_name: string
          picture_url: string | null
          rrp: number | null
          size_label: string | null
          size_ml: number | null
          sku: string | null
          tax_rate_id: string | null
          unit_cost_price: number
        }
        Insert: {
          barcode?: string | null
          brand_id?: string | null
          brand_sub?: string | null
          company_id: string
          created_at?: string
          default_classification?:
            | Database["public"]["Enums"]["product_classification"]
            | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_set?: boolean
          low_stock_threshold?: number | null
          name?: string | null
          order_name: string
          picture_url?: string | null
          rrp?: number | null
          size_label?: string | null
          size_ml?: number | null
          sku?: string | null
          tax_rate_id?: string | null
          unit_cost_price?: number
        }
        Update: {
          barcode?: string | null
          brand_id?: string | null
          brand_sub?: string | null
          company_id?: string
          created_at?: string
          default_classification?:
            | Database["public"]["Enums"]["product_classification"]
            | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_set?: boolean
          low_stock_threshold?: number | null
          name?: string | null
          order_name?: string
          picture_url?: string | null
          rrp?: number | null
          size_label?: string | null
          size_ml?: number | null
          sku?: string | null
          tax_rate_id?: string | null
          unit_cost_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          classification: Database["public"]["Enums"]["product_classification"]
          id: string
          line_total: number | null
          product_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number
          tax_rate_id: string | null
          unit_price: number
        }
        Insert: {
          classification: Database["public"]["Enums"]["product_classification"]
          id?: string
          line_total?: number | null
          product_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number
          tax_rate_id?: string | null
          unit_price: number
        }
        Update: {
          classification?: Database["public"]["Enums"]["product_classification"]
          id?: string
          line_total?: number | null
          product_id?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number
          tax_rate_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          branch_id: string
          company_id: string
          created_at: string
          created_by: string | null
          expected_delivery_date: string | null
          id: string
          notes: string | null
          order_date: string | null
          po_number: string
          status: Database["public"]["Enums"]["po_status"]
          supplier_id: string
        }
        Insert: {
          branch_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          po_number: string
          status?: Database["public"]["Enums"]["po_status"]
          supplier_id: string
        }
        Update: {
          branch_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          po_number?: string
          status?: Database["public"]["Enums"]["po_status"]
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      report_exports: {
        Row: {
          branch_id: string | null
          company_id: string
          file_reference: string | null
          generated_at: string
          generated_by: string | null
          id: string
          period_end: string | null
          period_start: string | null
          report_type: string
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          file_reference?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          report_type: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          file_reference?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          report_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_exports_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_exports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      retail_use_entries: {
        Row: {
          branch_id: string
          company_id: string
          created_at: string
          entry_date: string
          external_reference: string | null
          id: string
          keyed_in_by: string | null
          notes: string | null
          product_id: string
          quantity_used: number
          store_location_id: string | null
        }
        Insert: {
          branch_id: string
          company_id: string
          created_at?: string
          entry_date: string
          external_reference?: string | null
          id?: string
          keyed_in_by?: string | null
          notes?: string | null
          product_id: string
          quantity_used: number
          store_location_id?: string | null
        }
        Update: {
          branch_id?: string
          company_id?: string
          created_at?: string
          entry_date?: string
          external_reference?: string | null
          id?: string
          keyed_in_by?: string | null
          notes?: string | null
          product_id?: string
          quantity_used?: number
          store_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retail_use_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_use_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_use_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "retail_use_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_use_entries_store_location_id_fkey"
            columns: ["store_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_locations: {
        Row: {
          branch_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          parent_location_id: string | null
          sort_order: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_location_id?: string | null
          sort_order?: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_location_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_locations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_locations_parent_location_id_fkey"
            columns: ["parent_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          id: string
          is_preferred: boolean
          product_id: string
          supplier_cost_price: number | null
          supplier_id: string
          supplier_sku: string | null
        }
        Insert: {
          id?: string
          is_preferred?: boolean
          product_id: string
          supplier_cost_price?: number | null
          supplier_id: string
          supplier_sku?: string | null
        }
        Update: {
          id?: string
          is_preferred?: boolean
          product_id?: string
          supplier_cost_price?: number | null
          supplier_id?: string
          supplier_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          company_id: string
          created_at: string
          gst_registered: boolean
          id: string
          order_channel: Database["public"]["Enums"]["order_channel"] | null
          poc_name: string | null
          poc_number: string | null
          supplier_name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          gst_registered?: boolean
          id?: string
          order_channel?: Database["public"]["Enums"]["order_channel"] | null
          poc_name?: string | null
          poc_number?: string | null
          supplier_name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          gst_registered?: boolean
          id?: string
          order_channel?: Database["public"]["Enums"]["order_channel"] | null
          poc_name?: string | null
          poc_number?: string | null
          supplier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          company_id: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          company_id: string
          id: string
          is_default: boolean
          name: string
          rate_percentage: number
        }
        Insert: {
          company_id: string
          id?: string
          is_default?: boolean
          name: string
          rate_percentage: number
        }
        Update: {
          company_id?: string
          id?: string
          is_default?: boolean
          name?: string
          rate_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      current_stock: {
        Row: {
          product_id: string | null
          quantity_on_hand: number | null
          store_location_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_store_location_id_fkey"
            columns: ["store_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reconciliation: {
        Row: {
          invoice_id: string | null
          invoice_number: string | null
          invoice_stated_total: number | null
          line_items_total: number | null
          variance: number | null
        }
        Relationships: []
      }
      low_stock_alerts: {
        Row: {
          low_stock_threshold: number | null
          name: string | null
          product_id: string | null
          sku: string | null
          total_on_hand: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      fn_fill_uncounted_count_items: {
        Args: { p_count_id: string; p_mode: string }
        Returns: undefined
      }
      fn_generate_invoice_items_from_receipt: {
        Args: { p_goods_receipt_id: string; p_invoice_id: string }
        Returns: number
      }
      fn_grant_default_admin_access: {
        Args: { p_email: string; p_user_id: string }
        Returns: undefined
      }
      fn_my_company_ids: { Args: never; Returns: string[] }
      fn_recompute_po_status: { Args: { p_po_id: string }; Returns: undefined }
    }
    Enums: {
      inventory_txn_type:
        | "goods_receipt"
        | "retail_use"
        | "count_adjustment"
        | "transfer"
        | "waste"
        | "gwp_use"
        | "initial_stock"
      invoice_status: "unpaid" | "partial" | "paid" | "disputed"
      order_channel: "email" | "phone" | "portal" | "whatsapp" | "other"
      po_status:
        | "draft"
        | "sent"
        | "confirmed"
        | "partially_received"
        | "received"
        | "cancelled"
      product_classification: "retail" | "inhouse" | "gwp" | "retail_inhouse" | "bundle"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      inventory_txn_type: [
        "goods_receipt",
        "retail_use",
        "count_adjustment",
        "transfer",
        "waste",
        "gwp_use",
        "initial_stock",
      ],
      invoice_status: ["unpaid", "partial", "paid", "disputed"],
      order_channel: ["email", "phone", "portal", "whatsapp", "other"],
      po_status: [
        "draft",
        "sent",
        "confirmed",
        "partially_received",
        "received",
        "cancelled",
      ],
      product_classification: ["retail", "inhouse", "gwp", "retail_inhouse", "bundle"],
    },
  },
} as const
