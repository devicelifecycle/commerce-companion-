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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounts_payable: {
        Row: {
          balance_due: number | null
          bill_date: string
          bill_number: string | null
          category: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string
          gst_hst_amount: number | null
          id: string
          notes: string | null
          original_amount: number
          paid_amount: number | null
          payment_terms: string | null
          pst_amount: number | null
          status: string | null
          updated_at: string | null
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          balance_due?: number | null
          bill_date?: string
          bill_number?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date: string
          gst_hst_amount?: number | null
          id?: string
          notes?: string | null
          original_amount: number
          paid_amount?: number | null
          payment_terms?: string | null
          pst_amount?: number | null
          status?: string | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          balance_due?: number | null
          bill_date?: string
          bill_number?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string
          gst_hst_amount?: number | null
          id?: string
          notes?: string | null
          original_amount?: number
          paid_amount?: number | null
          payment_terms?: string | null
          pst_amount?: number | null
          status?: string | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          balance_due: number | null
          company_id: string | null
          created_at: string | null
          customer_name: string | null
          due_date: string
          expected_payment_date: string | null
          id: string
          invoice_id: string | null
          marketplace: string | null
          notes: string | null
          original_amount: number
          paid_amount: number | null
          payout_id: string | null
          source_reference: string | null
          source_type: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          balance_due?: number | null
          company_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          due_date: string
          expected_payment_date?: string | null
          id?: string
          invoice_id?: string | null
          marketplace?: string | null
          notes?: string | null
          original_amount: number
          paid_amount?: number | null
          payout_id?: string | null
          source_reference?: string | null
          source_type: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          balance_due?: number | null
          company_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          due_date?: string
          expected_payment_date?: string | null
          id?: string
          invoice_id?: string | null
          marketplace?: string | null
          notes?: string | null
          original_amount?: number
          paid_amount?: number | null
          payout_id?: string | null
          source_reference?: string | null
          source_type?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "marketplace_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_payments: {
        Row: {
          accounts_payable_id: string
          amount: number
          check_number: string | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          reference_number: string | null
        }
        Insert: {
          accounts_payable_id: string
          amount: number
          check_number?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          reference_number?: string | null
        }
        Update: {
          accounts_payable_id?: string
          amount?: number
          check_number?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ap_payments_accounts_payable_id_fkey"
            columns: ["accounts_payable_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          auto_approve_expenses_under: number | null
          auto_generate_sku: boolean | null
          company_id: string
          created_at: string | null
          currency_format: string | null
          default_fulfillment_channel: string | null
          default_invoice_notes: string | null
          default_payment_terms: number | null
          default_tax_province: string | null
          default_tgw_allocation: number | null
          default_ves_allocation: number | null
          fiscal_year_start_month: number | null
          id: string
          large_expense_threshold: number | null
          low_inventory_threshold: number | null
          reorder_point_threshold: number | null
          session_timeout_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          auto_approve_expenses_under?: number | null
          auto_generate_sku?: boolean | null
          company_id: string
          created_at?: string | null
          currency_format?: string | null
          default_fulfillment_channel?: string | null
          default_invoice_notes?: string | null
          default_payment_terms?: number | null
          default_tax_province?: string | null
          default_tgw_allocation?: number | null
          default_ves_allocation?: number | null
          fiscal_year_start_month?: number | null
          id?: string
          large_expense_threshold?: number | null
          low_inventory_threshold?: number | null
          reorder_point_threshold?: number | null
          session_timeout_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          auto_approve_expenses_under?: number | null
          auto_generate_sku?: boolean | null
          company_id?: string
          created_at?: string | null
          currency_format?: string | null
          default_fulfillment_channel?: string | null
          default_invoice_notes?: string | null
          default_payment_terms?: number | null
          default_tax_province?: string | null
          default_tgw_allocation?: number | null
          default_ves_allocation?: number | null
          fiscal_year_start_month?: number | null
          id?: string
          large_expense_threshold?: number | null
          low_inventory_threshold?: number | null
          reorder_point_threshold?: number | null
          session_timeout_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_payments: {
        Row: {
          accounts_receivable_id: string
          amount: number
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          reference_number: string | null
        }
        Insert: {
          accounts_receivable_id: string
          amount: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          reference_number?: string | null
        }
        Update: {
          accounts_receivable_id?: string
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ar_payments_accounts_receivable_id_fkey"
            columns: ["accounts_receivable_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          module: string | null
          new_data: Json | null
          notes: string | null
          old_data: Json | null
          record_id: string | null
          status: string | null
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string | null
          new_data?: Json | null
          notes?: string | null
          old_data?: Json | null
          record_id?: string | null
          status?: string | null
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string | null
          new_data?: Json | null
          notes?: string | null
          old_data?: Json | null
          record_id?: string | null
          status?: string | null
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string | null
          account_type: string | null
          bank_name: string | null
          chart_account_id: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          current_balance: number | null
          id: string
          is_active: boolean | null
          last_reconciled_balance: number | null
          last_reconciled_date: string | null
          opening_balance: number | null
          updated_at: string | null
        }
        Insert: {
          account_name: string
          account_number?: string | null
          account_type?: string | null
          bank_name?: string | null
          chart_account_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          current_balance?: number | null
          id?: string
          is_active?: boolean | null
          last_reconciled_balance?: number | null
          last_reconciled_date?: string | null
          opening_balance?: number | null
          updated_at?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string | null
          account_type?: string | null
          bank_name?: string | null
          chart_account_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          current_balance?: number | null
          id?: string
          is_active?: boolean | null
          last_reconciled_balance?: number | null
          last_reconciled_date?: string | null
          opening_balance?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_chart_account_id_fkey"
            columns: ["chart_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          imported_at: string | null
          is_reconciled: boolean | null
          matched_journal_entry_id: string | null
          notes: string | null
          reconciled_date: string | null
          reference_number: string | null
          transaction_date: string
          transaction_type: string | null
        }
        Insert: {
          amount: number
          bank_account_id: string
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          imported_at?: string | null
          is_reconciled?: boolean | null
          matched_journal_entry_id?: string | null
          notes?: string | null
          reconciled_date?: string | null
          reference_number?: string | null
          transaction_date: string
          transaction_type?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          imported_at?: string | null
          is_reconciled?: boolean | null
          matched_journal_entry_id?: string | null
          notes?: string | null
          reconciled_date?: string | null
          reference_number?: string | null
          transaction_date?: string
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_journal_entry_id_fkey"
            columns: ["matched_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_code: string
          account_name: string
          account_subtype: string | null
          account_type: string
          company_id: string | null
          created_at: string | null
          current_balance: number | null
          description: string | null
          id: string
          is_active: boolean | null
          is_system_account: boolean | null
          normal_balance: string | null
          opening_balance: number | null
          parent_account_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_code: string
          account_name: string
          account_subtype?: string | null
          account_type: string
          company_id?: string | null
          created_at?: string | null
          current_balance?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_account?: boolean | null
          normal_balance?: string | null
          opening_balance?: number | null
          parent_account_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_code?: string
          account_name?: string
          account_subtype?: string | null
          account_type?: string
          company_id?: string | null
          created_at?: string | null
          current_balance?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_account?: boolean | null
          normal_balance?: string | null
          opening_balance?: number | null
          parent_account_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          business_number: string | null
          city: string | null
          company_id: string
          created_at: string | null
          default_currency: string | null
          email: string | null
          fiscal_year_start: number | null
          gst_hst_number: string | null
          id: string
          invoice_next_number: number | null
          invoice_prefix: string | null
          legal_name: string | null
          logo_url: string | null
          phone: string | null
          postal_code: string | null
          province: string | null
          qst_number: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          business_number?: string | null
          city?: string | null
          company_id: string
          created_at?: string | null
          default_currency?: string | null
          email?: string | null
          fiscal_year_start?: number | null
          gst_hst_number?: string | null
          id?: string
          invoice_next_number?: number | null
          invoice_prefix?: string | null
          legal_name?: string | null
          logo_url?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          qst_number?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          business_number?: string | null
          city?: string | null
          company_id?: string
          created_at?: string | null
          default_currency?: string | null
          email?: string | null
          fiscal_year_start?: number | null
          gst_hst_number?: string | null
          id?: string
          invoice_next_number?: number | null
          invoice_prefix?: string | null
          legal_name?: string | null
          logo_url?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          qst_number?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          channel: string | null
          city: string | null
          company_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          marketplace_source: string | null
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          province: string | null
          street_address: string | null
          total_purchases: number | null
          total_spent: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          channel?: string | null
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          marketplace_source?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          street_address?: string | null
          total_purchases?: number | null
          total_spent?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          channel?: string | null
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          marketplace_source?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          street_address?: string | null
          total_purchases?: number | null
          total_spent?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      data_validation_issues: {
        Row: {
          company_id: string | null
          created_at: string
          description: string
          details: Json | null
          id: string
          issue_type: string
          marketplace: string | null
          record_id: string | null
          record_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description: string
          details?: Json | null
          id?: string
          issue_type: string
          marketplace?: string | null
          record_id?: string | null
          record_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string
          details?: Json | null
          id?: string
          issue_type?: string
          marketplace?: string | null
          record_id?: string | null
          record_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_validation_issues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      device_refurbishment_parts: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          device_id: string
          id: string
          quantity_used: number
          repair_part_id: string
          total_cost: number
          unit_cost: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          device_id: string
          id?: string
          quantity_used?: number
          repair_part_id: string
          total_cost?: number
          unit_cost?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string
          id?: string
          quantity_used?: number
          repair_part_id?: string
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "device_refurbishment_parts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_refurbishment_parts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_refurbishment_parts_repair_part_id_fkey"
            columns: ["repair_part_id"]
            isOneToOne: false
            referencedRelation: "repair_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      device_refurbishment_tasks: {
        Row: {
          company_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          device_id: string
          id: string
          is_completed: boolean
          is_custom: boolean
          notes: string | null
          task_name: string
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          device_id: string
          id?: string
          is_completed?: boolean
          is_custom?: boolean
          notes?: string | null
          task_name: string
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          device_id?: string
          id?: string
          is_completed?: boolean
          is_custom?: boolean
          notes?: string | null
          task_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_refurbishment_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_refurbishment_tasks_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_repairs: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          device_id: string
          id: string
          notes: string | null
          started_at: string | null
          status: string
          total_labor_cost: number | null
          total_parts_cost: number | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          device_id: string
          id?: string
          notes?: string | null
          started_at?: string | null
          status?: string
          total_labor_cost?: number | null
          total_parts_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          device_id?: string
          id?: string
          notes?: string | null
          started_at?: string | null
          status?: string
          total_labor_cost?: number | null
          total_parts_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_repairs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_repairs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          brand: string
          category: string | null
          color: string | null
          company_id: string | null
          condition: Database["public"]["Enums"]["device_condition"]
          cosmetic_grade: string | null
          cost_price: number
          created_at: string
          created_by: string | null
          fulfillment_channel: string | null
          id: string
          imei: string | null
          import_batch_id: string | null
          management_labor_cost: number | null
          management_labor_hours: number | null
          model: string
          notes: string | null
          original_cost_price: number | null
          purchase_date: string | null
          refurbishment_completed_at: string | null
          refurbishment_labor_cost: number | null
          refurbishment_notes: string | null
          refurbishment_started_at: string | null
          refurbishment_status: string | null
          sale_price: number | null
          sku: string | null
          status: Database["public"]["Enums"]["device_status"]
          storage: string | null
          supplier_id: string | null
          supplier_invoice_number: string | null
          tax_status: string | null
          updated_at: string
          warehouse_location: string | null
        }
        Insert: {
          brand: string
          category?: string | null
          color?: string | null
          company_id?: string | null
          condition?: Database["public"]["Enums"]["device_condition"]
          cosmetic_grade?: string | null
          cost_price: number
          created_at?: string
          created_by?: string | null
          fulfillment_channel?: string | null
          id?: string
          imei?: string | null
          import_batch_id?: string | null
          management_labor_cost?: number | null
          management_labor_hours?: number | null
          model: string
          notes?: string | null
          original_cost_price?: number | null
          purchase_date?: string | null
          refurbishment_completed_at?: string | null
          refurbishment_labor_cost?: number | null
          refurbishment_notes?: string | null
          refurbishment_started_at?: string | null
          refurbishment_status?: string | null
          sale_price?: number | null
          sku?: string | null
          status?: Database["public"]["Enums"]["device_status"]
          storage?: string | null
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          tax_status?: string | null
          updated_at?: string
          warehouse_location?: string | null
        }
        Update: {
          brand?: string
          category?: string | null
          color?: string | null
          company_id?: string | null
          condition?: Database["public"]["Enums"]["device_condition"]
          cosmetic_grade?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          fulfillment_channel?: string | null
          id?: string
          imei?: string | null
          import_batch_id?: string | null
          management_labor_cost?: number | null
          management_labor_hours?: number | null
          model?: string
          notes?: string | null
          original_cost_price?: number | null
          purchase_date?: string | null
          refurbishment_completed_at?: string | null
          refurbishment_labor_cost?: number | null
          refurbishment_notes?: string | null
          refurbishment_started_at?: string | null
          refurbishment_status?: string | null
          sale_price?: number | null
          sku?: string | null
          status?: Database["public"]["Enums"]["device_status"]
          storage?: string | null
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          tax_status?: string | null
          updated_at?: string
          warehouse_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_allocation_rules: {
        Row: {
          category: string
          created_at: string
          default_tgw_percentage: number
          default_ves_percentage: number
          description: string | null
          id: string
          subcategory: string | null
        }
        Insert: {
          category: string
          created_at?: string
          default_tgw_percentage?: number
          default_ves_percentage?: number
          description?: string | null
          id?: string
          subcategory?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          default_tgw_percentage?: number
          default_ves_percentage?: number
          description?: string | null
          id?: string
          subcategory?: string | null
        }
        Relationships: []
      }
      expense_refunds: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          expense_id: string
          id: string
          notes: string | null
          reason: string | null
          reference_number: string | null
          refund_amount: number
          refund_date: string
          refund_method: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_id: string
          id?: string
          notes?: string | null
          reason?: string | null
          reference_number?: string | null
          refund_amount: number
          refund_date?: string
          refund_method?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_id?: string
          id?: string
          notes?: string | null
          reason?: string | null
          reference_number?: string | null
          refund_amount?: number
          refund_date?: string
          refund_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_refunds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_refunds_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_subcategories: {
        Row: {
          category: string
          description: string | null
          id: string
          subcategory: string
        }
        Insert: {
          category: string
          description?: string | null
          id?: string
          subcategory: string
        }
        Update: {
          category?: string
          description?: string | null
          id?: string
          subcategory?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          allocation_tgw: number | null
          allocation_ves: number | null
          amount: number
          approval_status: string | null
          approved_by: string | null
          category: Database["public"]["Enums"]["expense_category"]
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string
          expense_date: string
          gst_hst_amount: number | null
          id: string
          is_recurring: boolean | null
          is_shared: boolean | null
          is_tax_deductible: boolean | null
          notes: string | null
          parent_expense_id: string | null
          payment_method: string | null
          pst_amount: number | null
          receipt_url: string | null
          recurring_end_date: string | null
          recurring_frequency: string | null
          subcategory: string | null
          total_amount: number | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          allocation_tgw?: number | null
          allocation_ves?: number | null
          amount: number
          approval_status?: string | null
          approved_by?: string | null
          category?: Database["public"]["Enums"]["expense_category"]
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          expense_date?: string
          gst_hst_amount?: number | null
          id?: string
          is_recurring?: boolean | null
          is_shared?: boolean | null
          is_tax_deductible?: boolean | null
          notes?: string | null
          parent_expense_id?: string | null
          payment_method?: string | null
          pst_amount?: number | null
          receipt_url?: string | null
          recurring_end_date?: string | null
          recurring_frequency?: string | null
          subcategory?: string | null
          total_amount?: number | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          allocation_tgw?: number | null
          allocation_ves?: number | null
          amount?: number
          approval_status?: string | null
          approved_by?: string | null
          category?: Database["public"]["Enums"]["expense_category"]
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          expense_date?: string
          gst_hst_amount?: number | null
          id?: string
          is_recurring?: boolean | null
          is_shared?: boolean | null
          is_tax_deductible?: boolean | null
          notes?: string | null
          parent_expense_id?: string | null
          payment_method?: string | null
          pst_amount?: number | null
          receipt_url?: string | null
          recurring_end_date?: string | null
          recurring_frequency?: string | null
          subcategory?: string | null
          total_amount?: number | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_parent_expense_id_fkey"
            columns: ["parent_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_received_notes: {
        Row: {
          company_id: string | null
          created_at: string | null
          grn_number: string
          id: string
          notes: string | null
          purchase_order_id: string | null
          received_by: string | null
          received_date: string
          status: string | null
          supplier_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          grn_number: string
          id?: string
          notes?: string | null
          purchase_order_id?: string | null
          received_by?: string | null
          received_date?: string
          status?: string | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          grn_number?: string
          id?: string
          notes?: string | null
          purchase_order_id?: string | null
          received_by?: string | null
          received_date?: string
          status?: string | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_received_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_items: {
        Row: {
          condition_status: string | null
          created_at: string | null
          device_id: string | null
          grn_id: string
          id: string
          notes: string | null
          product_id: string | null
          purchase_order_item_id: string | null
          quantity_received: number
        }
        Insert: {
          condition_status?: string | null
          created_at?: string | null
          device_id?: string | null
          grn_id: string
          id?: string
          notes?: string | null
          product_id?: string | null
          purchase_order_item_id?: string | null
          quantity_received?: number
        }
        Update: {
          condition_status?: string | null
          created_at?: string | null
          device_id?: string | null
          grn_id?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          purchase_order_item_id?: string | null
          quantity_received?: number
        }
        Relationships: [
          {
            foreignKeyName: "grn_items_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_received_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          company_id: string | null
          created_at: string
          failed_rows: number
          file_name: string
          id: string
          imported_by: string | null
          is_finalized: boolean | null
          lot_number: string | null
          other_charges: number | null
          shipping_cost: number | null
          successful_rows: number
          supplier_id: string | null
          supplier_invoice_number: string | null
          total_rows: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          failed_rows?: number
          file_name: string
          id?: string
          imported_by?: string | null
          is_finalized?: boolean | null
          lot_number?: string | null
          other_charges?: number | null
          shipping_cost?: number | null
          successful_rows?: number
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          total_rows?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          failed_rows?: number
          file_name?: string
          id?: string
          imported_by?: string | null
          is_finalized?: boolean | null
          lot_number?: string | null
          other_charges?: number | null
          shipping_cost?: number | null
          successful_rows?: number
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      input_tax_credits: {
        Row: {
          ap_id: string | null
          category: string | null
          claimable_amount: number | null
          company_id: string | null
          created_at: string | null
          eligibility_percentage: number | null
          expense_date: string
          expense_id: string | null
          filing_period_id: string | null
          gst_hst_amount: number
          id: string
          is_eligible: boolean | null
          notes: string | null
          qst_amount: number | null
          reference_number: string | null
          reference_type: string
          vendor_name: string | null
        }
        Insert: {
          ap_id?: string | null
          category?: string | null
          claimable_amount?: number | null
          company_id?: string | null
          created_at?: string | null
          eligibility_percentage?: number | null
          expense_date: string
          expense_id?: string | null
          filing_period_id?: string | null
          gst_hst_amount?: number
          id?: string
          is_eligible?: boolean | null
          notes?: string | null
          qst_amount?: number | null
          reference_number?: string | null
          reference_type: string
          vendor_name?: string | null
        }
        Update: {
          ap_id?: string | null
          category?: string | null
          claimable_amount?: number | null
          company_id?: string | null
          created_at?: string | null
          eligibility_percentage?: number | null
          expense_date?: string
          expense_id?: string | null
          filing_period_id?: string | null
          gst_hst_amount?: number
          id?: string
          is_eligible?: boolean | null
          notes?: string | null
          qst_amount?: number | null
          reference_number?: string | null
          reference_type?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "input_tax_credits_ap_id_fkey"
            columns: ["ap_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "input_tax_credits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "input_tax_credits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "input_tax_credits_filing_period_id_fkey"
            columns: ["filing_period_id"]
            isOneToOne: false
            referencedRelation: "tax_filing_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          device_id: string | null
          from_company_id: string | null
          id: string
          notes: string | null
          reason: string | null
          to_company_id: string | null
          transfer_date: string
          transfer_price: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          from_company_id?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          to_company_id?: string | null
          transfer_date?: string
          transfer_price?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          from_company_id?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          to_company_id?: string | null
          transfer_date?: string
          transfer_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_from_company_id_fkey"
            columns: ["from_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_to_company_id_fkey"
            columns: ["to_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          device_id: string | null
          id: string
          invoice_id: string
          quantity: number
          tax_treatment: string
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          device_id?: string | null
          id?: string
          invoice_id: string
          quantity?: number
          tax_treatment?: string
          total: number
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          device_id?: string | null
          id?: string
          invoice_id?: string
          quantity?: number
          tax_treatment?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_email: string | null
          customer_gst_hst_number: string | null
          customer_name: string
          customer_phone: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          paid_date: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_gst_hst_number?: string | null
          customer_name: string
          customer_phone?: string | null
          due_date?: string
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          paid_date?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_gst_hst_number?: string | null
          customer_name?: string
          customer_phone?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          paid_date?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          description: string
          entry_date: string
          entry_number: string
          id: string
          is_auto_generated: boolean | null
          posted_at: string | null
          posted_by: string | null
          reference_id: string | null
          reference_type: string | null
          status: string | null
          total_credit: number | null
          total_debit: number | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          entry_date?: string
          entry_number: string
          id?: string
          is_auto_generated?: boolean | null
          posted_at?: string | null
          posted_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          total_credit?: number | null
          total_debit?: number | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          entry_date?: string
          entry_number?: string
          id?: string
          is_auto_generated?: boolean | null
          posted_at?: string | null
          posted_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          total_credit?: number | null
          total_debit?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string | null
          credit_amount: number | null
          debit_amount: number | null
          description: string | null
          id: string
          journal_entry_id: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          id?: string
          journal_entry_id: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          id?: string
          journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_payouts: {
        Row: {
          adjustments_amount: number
          company_id: string | null
          created_at: string
          currency: string
          discrepancy_amount: number | null
          fees_amount: number
          gross_amount: number
          id: string
          marketplace: string
          net_payout: number
          payout_date: string
          payout_id: string
          period_end: string | null
          period_start: string | null
          raw_data: Json | null
          reconciliation_status: string
          reserve_amount: number
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          synced_at: string
          system_fees_total: number | null
          system_order_total: number | null
          updated_at: string
        }
        Insert: {
          adjustments_amount?: number
          company_id?: string | null
          created_at?: string
          currency?: string
          discrepancy_amount?: number | null
          fees_amount?: number
          gross_amount?: number
          id?: string
          marketplace: string
          net_payout?: number
          payout_date: string
          payout_id: string
          period_end?: string | null
          period_start?: string | null
          raw_data?: Json | null
          reconciliation_status?: string
          reserve_amount?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          synced_at?: string
          system_fees_total?: number | null
          system_order_total?: number | null
          updated_at?: string
        }
        Update: {
          adjustments_amount?: number
          company_id?: string | null
          created_at?: string
          currency?: string
          discrepancy_amount?: number | null
          fees_amount?: number
          gross_amount?: number
          id?: string
          marketplace?: string
          net_payout?: number
          payout_date?: string
          payout_id?: string
          period_end?: string | null
          period_start?: string | null
          raw_data?: Json | null
          reconciliation_status?: string
          reserve_amount?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          synced_at?: string
          system_fees_total?: number | null
          system_order_total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_payouts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          email_failed_sync: boolean | null
          email_large_expenses: boolean | null
          email_low_inventory: boolean | null
          email_monthly_summary: boolean | null
          email_tax_due_dates: boolean | null
          email_unusual_login: boolean | null
          id: string
          in_app_all: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_failed_sync?: boolean | null
          email_large_expenses?: boolean | null
          email_low_inventory?: boolean | null
          email_monthly_summary?: boolean | null
          email_tax_due_dates?: boolean | null
          email_unusual_login?: boolean | null
          id?: string
          in_app_all?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_failed_sync?: boolean | null
          email_large_expenses?: boolean | null
          email_low_inventory?: boolean | null
          email_monthly_summary?: boolean | null
          email_tax_due_dates?: boolean | null
          email_unusual_login?: boolean | null
          id?: string
          in_app_all?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          priority: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          priority?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          priority?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          description: string | null
          id: string
          module: string
          name: string
        }
        Insert: {
          code: string
          description?: string | null
          id?: string
          module: string
          name: string
        }
        Update: {
          code?: string
          description?: string | null
          id?: string
          module?: string
          name?: string
        }
        Relationships: []
      }
      po_payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          purchase_order_id: string
          reference_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          purchase_order_id: string
          reference_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          purchase_order_id?: string
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_payments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_catalog: {
        Row: {
          brand: string
          category: string | null
          color: string | null
          created_at: string | null
          default_cost_price: number | null
          default_sale_price: number | null
          ean: string | null
          id: string
          internal_sku_prefix: string | null
          is_active: boolean | null
          model: string
          normalized_key: string
          notes: string | null
          storage: string | null
          upc: string | null
          updated_at: string | null
        }
        Insert: {
          brand: string
          category?: string | null
          color?: string | null
          created_at?: string | null
          default_cost_price?: number | null
          default_sale_price?: number | null
          ean?: string | null
          id?: string
          internal_sku_prefix?: string | null
          is_active?: boolean | null
          model: string
          normalized_key: string
          notes?: string | null
          storage?: string | null
          upc?: string | null
          updated_at?: string | null
        }
        Update: {
          brand?: string
          category?: string | null
          color?: string | null
          created_at?: string | null
          default_cost_price?: number | null
          default_sale_price?: number | null
          ean?: string | null
          id?: string
          internal_sku_prefix?: string | null
          is_active?: boolean | null
          model?: string
          normalized_key?: string
          notes?: string | null
          storage?: string | null
          upc?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_lots: {
        Row: {
          cost_price: number
          created_at: string
          expiry_date: string | null
          id: string
          lot_number: string
          notes: string | null
          product_id: string
          quantity: number
          received_date: string
          supplier_id: string | null
        }
        Insert: {
          cost_price?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          lot_number: string
          notes?: string | null
          product_id: string
          quantity?: number
          received_date?: string
          supplier_id?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          lot_number?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          received_date?: string
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          company_id: string | null
          cost_price: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          notes: string | null
          quantity_on_hand: number
          reorder_point: number
          sale_price: number | null
          sku: string | null
          status: string
          supplier_id: string | null
          unit_of_measure: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          company_id?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          notes?: string | null
          quantity_on_hand?: number
          reorder_point?: number
          sale_price?: number | null
          sku?: string | null
          status?: string
          supplier_id?: string | null
          unit_of_measure?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          company_id?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          notes?: string | null
          quantity_on_hand?: number
          reorder_point?: number
          sale_price?: number | null
          sku?: string | null
          status?: string
          supplier_id?: string | null
          unit_of_measure?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
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
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profit_goals: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          expense_limit: number | null
          id: string
          month: string
          notes: string | null
          profit_goal: number
          revenue_goal: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_limit?: number | null
          id?: string
          month: string
          notes?: string | null
          profit_goal?: number
          revenue_goal?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_limit?: number | null
          id?: string
          month?: string
          notes?: string | null
          profit_goal?: number
          revenue_goal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      provincial_tax_rates: {
        Row: {
          created_at: string | null
          gst_rate: number
          hst_rate: number | null
          id: string
          is_hst_province: boolean | null
          province_code: string
          province_name: string
          pst_rate: number | null
          qst_rate: number | null
          total_rate: number | null
        }
        Insert: {
          created_at?: string | null
          gst_rate?: number
          hst_rate?: number | null
          id?: string
          is_hst_province?: boolean | null
          province_code: string
          province_name: string
          pst_rate?: number | null
          qst_rate?: number | null
          total_rate?: number | null
        }
        Update: {
          created_at?: string | null
          gst_rate?: number
          hst_rate?: number | null
          id?: string
          is_hst_province?: boolean | null
          province_code?: string
          province_name?: string
          pst_rate?: number | null
          qst_rate?: number | null
          total_rate?: number | null
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          created_at: string | null
          description: string
          device_id: string | null
          gst_hst_amount: number | null
          id: string
          item_type: string
          product_id: string | null
          pst_qst_amount: number | null
          purchase_order_id: string
          quantity: number
          total_cost: number
          unit_cost: number
        }
        Insert: {
          created_at?: string | null
          description: string
          device_id?: string | null
          gst_hst_amount?: number | null
          id?: string
          item_type?: string
          product_id?: string | null
          pst_qst_amount?: number | null
          purchase_order_id: string
          quantity?: number
          total_cost: number
          unit_cost: number
        }
        Update: {
          created_at?: string | null
          description?: string
          device_id?: string | null
          gst_hst_amount?: number | null
          id?: string
          item_type?: string
          product_id?: string | null
          pst_qst_amount?: number | null
          purchase_order_id?: string
          quantity?: number
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
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
        ]
      }
      purchase_orders: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          expected_delivery_date: string | null
          gst_hst_amount: number | null
          id: string
          notes: string | null
          paid_amount: number | null
          payment_date: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string | null
          po_date: string
          po_number: string
          po_type: string
          pst_qst_amount: number | null
          status: string | null
          subtotal: number
          supplier_id: string | null
          supplier_name: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_delivery_date?: string | null
          gst_hst_amount?: number | null
          id?: string
          notes?: string | null
          paid_amount?: number | null
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          po_date?: string
          po_number: string
          po_type?: string
          pst_qst_amount?: number | null
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          supplier_name: string
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_delivery_date?: string | null
          gst_hst_amount?: number | null
          id?: string
          notes?: string | null
          paid_amount?: number | null
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          po_date?: string
          po_number?: string
          po_type?: string
          pst_qst_amount?: number | null
          status?: string | null
          subtotal?: number
          supplier_id?: string | null
          supplier_name?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
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
      repair_items: {
        Row: {
          created_at: string | null
          description: string
          id: string
          item_type: string
          labor_hours: number | null
          labor_rate: number | null
          quantity: number
          repair_id: string
          repair_part_id: string | null
          total_cost: number
          unit_cost: number
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          item_type?: string
          labor_hours?: number | null
          labor_rate?: number | null
          quantity?: number
          repair_id: string
          repair_part_id?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          item_type?: string
          labor_hours?: number | null
          labor_rate?: number | null
          quantity?: number
          repair_id?: string
          repair_part_id?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "repair_items_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "device_repairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_items_repair_part_id_fkey"
            columns: ["repair_part_id"]
            isOneToOne: false
            referencedRelation: "repair_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_parts: {
        Row: {
          category: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          quantity_on_hand: number
          reorder_point: number | null
          sku: string | null
          supplier_id: string | null
          unit_cost: number
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          quantity_on_hand?: number
          reorder_point?: number | null
          sku?: string | null
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          quantity_on_hand?: number
          reorder_point?: number | null
          sku?: string | null
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_parts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_parts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_parts_catalog: {
        Row: {
          category: string | null
          compatible_devices: string | null
          created_at: string | null
          default_cost: number | null
          id: string
          is_active: boolean | null
          name: string
          normalized_key: string
          notes: string | null
          sku_prefix: string | null
        }
        Insert: {
          category?: string | null
          compatible_devices?: string | null
          created_at?: string | null
          default_cost?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          normalized_key: string
          notes?: string | null
          sku_prefix?: string | null
        }
        Update: {
          category?: string | null
          compatible_devices?: string | null
          created_at?: string | null
          default_cost?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          normalized_key?: string
          notes?: string | null
          sku_prefix?: string | null
        }
        Relationships: []
      }
      return_authorizations: {
        Row: {
          accounting_status: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          customer_name: string | null
          device_condition_on_return: string | null
          device_id: string | null
          id: string
          marketplace_initiated: boolean | null
          notes: string | null
          original_cost: number | null
          outbound_tracking_number: string | null
          purchase_order_id: string | null
          reason: string
          refund_amount: number | null
          refund_date: string | null
          refund_method: string | null
          refund_reason_detail: string | null
          repair_notes: string | null
          replacement_device_id: string | null
          resolution_type: string | null
          return_date: string
          return_type: string
          rma_number: string
          sale_id: string | null
          status: string | null
          supplier_id: string | null
          tax_refunded: number | null
          updated_at: string | null
        }
        Insert: {
          accounting_status?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_name?: string | null
          device_condition_on_return?: string | null
          device_id?: string | null
          id?: string
          marketplace_initiated?: boolean | null
          notes?: string | null
          original_cost?: number | null
          outbound_tracking_number?: string | null
          purchase_order_id?: string | null
          reason: string
          refund_amount?: number | null
          refund_date?: string | null
          refund_method?: string | null
          refund_reason_detail?: string | null
          repair_notes?: string | null
          replacement_device_id?: string | null
          resolution_type?: string | null
          return_date?: string
          return_type: string
          rma_number: string
          sale_id?: string | null
          status?: string | null
          supplier_id?: string | null
          tax_refunded?: number | null
          updated_at?: string | null
        }
        Update: {
          accounting_status?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_name?: string | null
          device_condition_on_return?: string | null
          device_id?: string | null
          id?: string
          marketplace_initiated?: boolean | null
          notes?: string | null
          original_cost?: number | null
          outbound_tracking_number?: string | null
          purchase_order_id?: string | null
          reason?: string
          refund_amount?: number | null
          refund_date?: string | null
          refund_method?: string | null
          refund_reason_detail?: string | null
          repair_notes?: string | null
          replacement_device_id?: string | null
          resolution_type?: string | null
          return_date?: string
          return_type?: string
          rma_number?: string
          sale_id?: string | null
          status?: string | null
          supplier_id?: string | null
          tax_refunded?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_authorizations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_authorizations_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_authorizations_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_authorizations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_authorizations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          id: string
          permission_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          permission_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          permission_id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          cost_price: number | null
          created_at: string
          description: string
          device_id: string | null
          discount: number | null
          id: string
          imei: string | null
          product_id: string | null
          quantity: number
          sale_id: string
          sku: string | null
          tax_amount: number | null
          total: number
          unit_price: number
        }
        Insert: {
          cost_price?: number | null
          created_at?: string
          description: string
          device_id?: string | null
          discount?: number | null
          id?: string
          imei?: string | null
          product_id?: string | null
          quantity?: number
          sale_id: string
          sku?: string | null
          tax_amount?: number | null
          total: number
          unit_price: number
        }
        Update: {
          cost_price?: number | null
          created_at?: string
          description?: string
          device_id?: string | null
          discount?: number | null
          id?: string
          imei?: string | null
          product_id?: string | null
          quantity?: number
          sale_id?: string
          sku?: string | null
          tax_amount?: number | null
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          accounting_status: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          device_id: string | null
          fulfillment_status: string | null
          id: string
          is_marketplace_remitted: boolean | null
          is_multi_item: boolean | null
          item_count: number | null
          manual_cost: number | null
          manual_cost_description: string | null
          marketplace: Database["public"]["Enums"]["marketplace"]
          marketplace_fees: number | null
          marketplace_sku: string | null
          marketplace_status: string | null
          notes: string | null
          order_number: string
          product_title: string | null
          profit: number | null
          sale_date: string
          sale_price: number
          shipping_address: string | null
          shipping_cost: number | null
          shipping_province: string | null
          subtotal: number | null
          tax_amount: number | null
          updated_at: string
        }
        Insert: {
          accounting_status?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          device_id?: string | null
          fulfillment_status?: string | null
          id?: string
          is_marketplace_remitted?: boolean | null
          is_multi_item?: boolean | null
          item_count?: number | null
          manual_cost?: number | null
          manual_cost_description?: string | null
          marketplace: Database["public"]["Enums"]["marketplace"]
          marketplace_fees?: number | null
          marketplace_sku?: string | null
          marketplace_status?: string | null
          notes?: string | null
          order_number: string
          product_title?: string | null
          profit?: number | null
          sale_date?: string
          sale_price: number
          shipping_address?: string | null
          shipping_cost?: number | null
          shipping_province?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          updated_at?: string
        }
        Update: {
          accounting_status?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          device_id?: string | null
          fulfillment_status?: string | null
          id?: string
          is_marketplace_remitted?: boolean | null
          is_multi_item?: boolean | null
          item_count?: number | null
          manual_cost?: number | null
          manual_cost_description?: string | null
          marketplace?: Database["public"]["Enums"]["marketplace"]
          marketplace_fees?: number | null
          marketplace_sku?: string | null
          marketplace_status?: string | null
          notes?: string | null
          order_number?: string
          product_title?: string | null
          profit?: number | null
          sale_date?: string
          sale_price?: number
          shipping_address?: string | null
          shipping_cost?: number | null
          shipping_province?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_tax_details: {
        Row: {
          company_id: string | null
          created_at: string | null
          customer_province: string | null
          gst_amount: number | null
          hst_amount: number | null
          id: string
          is_marketplace_collected: boolean | null
          marketplace: string | null
          pst_amount: number | null
          qst_amount: number | null
          sale_id: string | null
          total_tax: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          customer_province?: string | null
          gst_amount?: number | null
          hst_amount?: number | null
          id?: string
          is_marketplace_collected?: boolean | null
          marketplace?: string | null
          pst_amount?: number | null
          qst_amount?: number | null
          sale_id?: string | null
          total_tax?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          customer_province?: string | null
          gst_amount?: number | null
          hst_amount?: number | null
          id?: string
          is_marketplace_collected?: boolean | null
          marketplace?: string | null
          pst_amount?: number | null
          qst_amount?: number | null
          sale_id?: string | null
          total_tax?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_tax_details_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tax_details_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          company_id: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          gst_hst_number: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          province: string | null
          street_address: string | null
          supplier_code: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          gst_hst_number?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          street_address?: string | null
          supplier_code: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          gst_hst_number?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          street_address?: string | null
          supplier_code?: string
          updated_at?: string
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
      sync_logs: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string
          error_details: Json | null
          error_message: string | null
          id: string
          marketplace: string
          metadata: Json | null
          records_errored: number
          records_imported: number
          records_skipped: number
          started_at: string
          status: string
          sync_type: string
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_details?: Json | null
          error_message?: string | null
          id?: string
          marketplace: string
          metadata?: Json | null
          records_errored?: number
          records_imported?: number
          records_skipped?: number
          started_at?: string
          status?: string
          sync_type?: string
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_details?: Json | null
          error_message?: string | null
          id?: string
          marketplace?: string
          metadata?: Json | null
          records_errored?: number
          records_imported?: number
          records_skipped?: number
          started_at?: string
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      system_alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json | null
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          is_dismissed: boolean
          message: string
          severity: string
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          details?: Json | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          is_dismissed?: boolean
          message: string
          severity?: string
          source: string
          title: string
          updated_at?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          is_dismissed?: boolean
          message?: string
          severity?: string
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_filing_periods: {
        Row: {
          company_id: string | null
          created_at: string | null
          filed_by: string | null
          filed_date: string | null
          filing_due_date: string
          gst_hst_collected: number | null
          id: string
          itc_claimed: number | null
          net_tax_payable: number | null
          notes: string | null
          payment_amount: number | null
          payment_date: string | null
          payment_reference: string | null
          period_end: string
          period_start: string
          period_type: string
          pst_collected: number | null
          qst_collected: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          filed_by?: string | null
          filed_date?: string | null
          filing_due_date: string
          gst_hst_collected?: number | null
          id?: string
          itc_claimed?: number | null
          net_tax_payable?: number | null
          notes?: string | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_reference?: string | null
          period_end: string
          period_start: string
          period_type: string
          pst_collected?: number | null
          qst_collected?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          filed_by?: string | null
          filed_date?: string | null
          filing_due_date?: string
          gst_hst_collected?: number | null
          id?: string
          itc_claimed?: number | null
          net_tax_payable?: number | null
          notes?: string | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_reference?: string | null
          period_end?: string
          period_start?: string
          period_type?: string
          pst_collected?: number | null
          qst_collected?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_filing_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_records: {
        Row: {
          amount: number
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          jurisdiction: string | null
          notes: string | null
          reference_id: string | null
          reference_type: string | null
          tax_period_end: string
          tax_period_start: string
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          jurisdiction?: string | null
          notes?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tax_period_end: string
          tax_period_start: string
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          jurisdiction?: string | null
          notes?: string | null
          reference_id?: string | null
          reference_type?: string | null
          tax_period_end?: string
          tax_period_start?: string
          tax_type?: Database["public"]["Enums"]["tax_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_remittances: {
        Row: {
          amount: number
          company_id: string | null
          confirmation_number: string | null
          created_at: string | null
          created_by: string | null
          filing_period_id: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          tax_type: string
        }
        Insert: {
          amount: number
          company_id?: string | null
          confirmation_number?: string | null
          created_at?: string | null
          created_by?: string | null
          filing_period_id?: string | null
          id?: string
          notes?: string | null
          payment_date: string
          payment_method?: string | null
          tax_type: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          confirmation_number?: string | null
          created_at?: string | null
          created_by?: string | null
          filing_period_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          tax_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_remittances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_remittances_filing_period_id_fkey"
            columns: ["filing_period_id"]
            isOneToOne: false
            referencedRelation: "tax_filing_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      user_company_assignments: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_company_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address: string | null
          category: string | null
          company_id: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          total_spent: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          company_id?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          total_spent?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          company_id?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          total_spent?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_notification: {
        Args: {
          p_company_id: string
          p_link?: string
          p_message: string
          p_priority?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      get_user_role: {
        Args: { _company_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_company_access: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: {
          _action?: string
          _company_id: string
          _permission_code: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "manager" | "viewer"
      device_condition: "new" | "refurbished" | "used" | "damaged"
      device_status:
        | "in_stock"
        | "reserved"
        | "sold"
        | "returned"
        | "hold_for_refurbishment"
      expense_category:
        | "inventory"
        | "shipping"
        | "marketing"
        | "software"
        | "equipment"
        | "office"
        | "utilities"
        | "travel"
        | "professional_services"
        | "other"
        | "payroll"
        | "insurance"
        | "rent"
        | "bank_fees"
        | "marketplace_fees"
        | "telecommunications"
        | "genovation_ai"
      invoice_status:
        | "draft"
        | "sent"
        | "paid"
        | "overdue"
        | "cancelled"
        | "partially_paid"
      marketplace: "shopify" | "amazon" | "bestbuy" | "other"
      tax_type:
        | "sales_tax_collected"
        | "sales_tax_paid"
        | "income_tax"
        | "other"
      user_role: "admin" | "associate"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "manager", "viewer"],
      device_condition: ["new", "refurbished", "used", "damaged"],
      device_status: [
        "in_stock",
        "reserved",
        "sold",
        "returned",
        "hold_for_refurbishment",
      ],
      expense_category: [
        "inventory",
        "shipping",
        "marketing",
        "software",
        "equipment",
        "office",
        "utilities",
        "travel",
        "professional_services",
        "other",
        "payroll",
        "insurance",
        "rent",
        "bank_fees",
        "marketplace_fees",
        "telecommunications",
        "genovation_ai",
      ],
      invoice_status: [
        "draft",
        "sent",
        "paid",
        "overdue",
        "cancelled",
        "partially_paid",
      ],
      marketplace: ["shopify", "amazon", "bestbuy", "other"],
      tax_type: [
        "sales_tax_collected",
        "sales_tax_paid",
        "income_tax",
        "other",
      ],
      user_role: ["admin", "associate"],
    },
  },
} as const
