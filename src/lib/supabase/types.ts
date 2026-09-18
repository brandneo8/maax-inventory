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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
          invoice_attachment_url: string | null
          invoice_reference: string | null
          notes: string | null
          purchase_order_id: string | null
          received_by: string | null
          received_date: string
          rounding_adjustment: number
          voided_at: string | null
        }
        Insert: {
          branch_id: string
          company_id: string
          created_at?: string
          id?: string
          invoice_attachment_url?: string | null
          invoice_reference?: string | null
          notes?: string | null
          purchase_order_id?: string | null
          received_by?: string | null
          received_date?: string
          rounding_adjustment?: number
          voided_at?: string | null
        }
        Update: {
          branch_id?: string
          company_id?: string
          created_at?: string
          id?: string
          invoice_attachment_url?: string | null
          invoice_reference?: string | null
          notes?: string | null
          purchase_order_id?: string | null
          received_by?: string | null
          received_date?: string
          rounding_adjustment?: number
          voided_at?: string | null
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
          store_location_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_count_id: string
          inventory_count_item_id: string
          quantity_delta: number
          store_location_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_count_id?: string
          inventory_count_item_id?: string
          quantity_delta?: number
          store_location_id?: string | null
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
          {
            foreignKeyName: "inventory_count_entries_store_location_id_fkey"
            columns: ["store_location_id"]
            isOneToOne: false
            referencedRelation: "store_locations"
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
          store_location_id: string | null
          variance: number | null
        }
        Insert: {
          counted_quantity?: number | null
          expected_quantity?: number | null
          id?: string
          inventory_count_id: string
          notes?: string | null
          product_id: string
          store_location_id?: string | null
          variance?: number | null
        }
        Update: {
          counted_quantity?: number | null
          expected_quantity?: number | null
          id?: string
          inventory_count_id?: string
          notes?: string | null
          product_id?: string
          store_location_id?: string | null
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
          count_type: string
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
          count_type?: string
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
          count_type?: string
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
            referencedRelation: "product_tag_branch_summary"
            referencedColumns: ["tag_id"]
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
          classification:
            | Database["public"]["Enums"]["product_classification"]
            | null
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
          unit_cost: number | null
        }
        Insert: {
          classification?:
            | Database["public"]["Enums"]["product_classification"]
            | null
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
          unit_cost?: number | null
        }
        Update: {
          classification?:
            | Database["public"]["Enums"]["product_classification"]
            | null
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
          unit_cost?: number | null
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
      pos_tag_rule_tags: {
        Row: {
          rule_id: string
          tag_id: string
        }
        Insert: {
          rule_id: string
          tag_id: string
        }
        Update: {
          rule_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_tag_rule_tags_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pos_tag_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_tag_rule_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "product_tag_branch_summary"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "pos_tag_rule_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_tag_rules: {
        Row: {
          allowed: boolean
          company_id: string
          created_at: string
          id: string
          label: string | null
          updated_at: string
        }
        Insert: {
          allowed: boolean
          company_id: string
          created_at?: string
          id?: string
          label?: string | null
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          company_id?: string
          created_at?: string
          id?: string
          label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_tag_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_branch_classifications: {
        Row: {
          branch_id: string
          classification: Database["public"]["Enums"]["product_classification"]
          product_id: string
        }
        Insert: {
          branch_id: string
          classification: Database["public"]["Enums"]["product_classification"]
          product_id: string
        }
        Update: {
          branch_id?: string
          classification?: Database["public"]["Enums"]["product_classification"]
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_branch_classifications_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_branch_classifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_branch_classifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_branch_cost_history: {
        Row: {
          avg_unit_cost: number
          branch_id: string
          company_id: string
          effective_at: string
          id: string
          product_id: string
        }
        Insert: {
          avg_unit_cost: number
          branch_id: string
          company_id: string
          effective_at?: string
          id?: string
          product_id: string
        }
        Update: {
          avg_unit_cost?: number
          branch_id?: string
          company_id?: string
          effective_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_branch_cost_history_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_branch_cost_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_branch_cost_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_branch_cost_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_branch_costs: {
        Row: {
          avg_unit_cost: number
          branch_id: string
          company_id: string
          id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          avg_unit_cost?: number
          branch_id: string
          company_id: string
          id?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          avg_unit_cost?: number
          branch_id?: string
          company_id?: string
          id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_branch_costs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_branch_costs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_branch_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_branch_costs_product_id_fkey"
            columns: ["product_id"]
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
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
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
      product_classifications: {
        Row: {
          classification: Database["public"]["Enums"]["product_classification"]
          product_id: string
        }
        Insert: {
          classification: Database["public"]["Enums"]["product_classification"]
          product_id: string
        }
        Update: {
          classification?: Database["public"]["Enums"]["product_classification"]
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_classifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_classifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
          },
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
            referencedRelation: "low_stock_alerts"
            referencedColumns: ["product_id"]
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
            referencedRelation: "product_tag_branch_summary"
            referencedColumns: ["tag_id"]
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
          available_in_tunai: boolean
          barcode: string | null
          brand_id: string | null
          brand_sub: string | null
          company_id: string
          created_at: string
          crp: number | null
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
          pos_allowed: boolean
          rrp: number | null
          size_label: string | null
          size_ml: number | null
          sku: string | null
          tax_rate_id: string | null
          unit_cost_price: number
        }
        Insert: {
          available_in_tunai?: boolean
          barcode?: string | null
          brand_id?: string | null
          brand_sub?: string | null
          company_id: string
          created_at?: string
          crp?: number | null
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
          pos_allowed?: boolean
          rrp?: number | null
          size_label?: string | null
          size_ml?: number | null
          sku?: string | null
          tax_rate_id?: string | null
          unit_cost_price?: number
        }
        Update: {
          available_in_tunai?: boolean
          barcode?: string | null
          brand_id?: string | null
          brand_sub?: string | null
          company_id?: string
          created_at?: string
          crp?: number | null
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
          pos_allowed?: boolean
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
      purchase_order_audit_events: {
        Row: {
          actor_name: string
          company_id: string
          created_at: string
          event_type: string
          id: string
          purchase_order_id: string
          remarks: string | null
        }
        Insert: {
          actor_name: string
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          purchase_order_id: string
          remarks?: string | null
        }
        Update: {
          actor_name?: string
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          purchase_order_id?: string
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_audit_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_audit_events_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
          sort_order: number
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
          sort_order?: number
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
          sort_order?: number
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
          stock_out_report_id: string | null
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
          stock_out_report_id?: string | null
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
          stock_out_report_id?: string | null
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
            foreignKeyName: "retail_use_entries_stock_out_report_id_fkey"
            columns: ["stock_out_report_id"]
            isOneToOne: false
            referencedRelation: "stock_out_reports"
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
      stock_out_reports: {
        Row: {
          attachment_url: string | null
          branch_id: string
          channel: string
          company_id: string
          created_at: string
          entry_date: string
          id: string
          keyed_in_by: string | null
          notes: string | null
        }
        Insert: {
          attachment_url?: string | null
          branch_id: string
          channel: string
          company_id: string
          created_at?: string
          entry_date: string
          id?: string
          keyed_in_by?: string | null
          notes?: string | null
        }
        Update: {
          attachment_url?: string | null
          branch_id?: string
          channel?: string
          company_id?: string
          created_at?: string
          entry_date?: string
          id?: string
          keyed_in_by?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_out_reports_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_out_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      product_tag_branch_summary: {
        Row: {
          branch_id: string | null
          classification:
            | Database["public"]["Enums"]["product_classification"]
            | null
          company_id: string | null
          sku_count: number | null
          tag_id: string | null
          tag_name: string | null
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
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      fn_apply_goods_receipt_cost: {
        Args: {
          p_branch_id: string
          p_company_id: string
          p_product_id: string
          p_qty: number
          p_unit_cost: number
        }
        Returns: undefined
      }
      fn_average_monthly_use: {
        Args: {
          p_branch_id: string
          p_months?: number
          p_product_ids: string[]
        }
        Returns: {
          avg_monthly_use: number
          product_id: string
        }[]
      }
      fn_business_txn_date: {
        Args: { p_business_date: string }
        Returns: string
      }
      fn_fill_uncounted_count_items: {
        Args: { p_count_id: string; p_mode: string }
        Returns: undefined
      }
      fn_grant_default_admin_access: {
        Args: { p_email: string; p_user_id: string }
        Returns: undefined
      }
      fn_migrate_bundle_stock_to_components: {
        Args: { p_company_id: string; p_product_id: string }
        Returns: Json
      }
      fn_my_company_ids: { Args: never; Returns: string[] }
      fn_recompute_branch_cost: {
        Args: {
          p_branch_id: string
          p_company_id: string
          p_product_id: string
        }
        Returns: undefined
      }
      fn_recompute_po_status: { Args: { p_po_id: string }; Returns: undefined }
      fn_reverse_goods_receipt: {
        Args: { p_goods_receipt_id: string }
        Returns: undefined
      }
      fn_void_inventory_count: {
        Args: { p_count_id: string }
        Returns: undefined
      }
      fn_void_purchase_order: {
        Args: {
          p_branch_id: string
          p_company_id: string
          p_purchase_order_id: string
        }
        Returns: undefined
      }
      search_products_for_count: {
        Args: {
          p_branch_id: string
          p_company_id: string
          p_limit?: number
          p_needle: string
        }
        Returns: {
          barcode: string
          brand_name: string
          id: string
          name: string
          on_salon: boolean
          order_name: string
          sku: string
        }[]
      }
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
        | "inhouse_use"
      order_channel: "email" | "phone" | "portal" | "whatsapp" | "other"
      po_status:
        | "draft"
        | "sent"
        | "confirmed"
        | "partially_received"
        | "received"
        | "cancelled"
      product_classification:
        | "retail"
        | "inhouse"
        | "gwp"
        | "retail_inhouse"
        | "bundle"
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
  graphql_public: {
    Enums: {},
  },
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
        "inhouse_use",
      ],
      order_channel: ["email", "phone", "portal", "whatsapp", "other"],
      po_status: [
        "draft",
        "sent",
        "confirmed",
        "partially_received",
        "received",
        "cancelled",
      ],
      product_classification: [
        "retail",
        "inhouse",
        "gwp",
        "retail_inhouse",
        "bundle",
      ],
    },
  },
} as const
