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
    PostgrestVersion: "14.18"
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
      bill_categories: {
        Row: {
          created_at: string
          flat_id: string
          id: string
          is_builtin: boolean
          name: string
        }
        Insert: {
          created_at?: string
          flat_id: string
          id?: string
          is_builtin?: boolean
          name: string
        }
        Update: {
          created_at?: string
          flat_id?: string
          id?: string
          is_builtin?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_categories_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_history: {
        Row: {
          action: string
          actor_id: string
          at: string
          bill_id: string
          details: Json | null
          flat_id: string
          id: number
          reason: string | null
        }
        Insert: {
          action: string
          actor_id: string
          at?: string
          bill_id: string
          details?: Json | null
          flat_id: string
          id?: never
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          at?: string
          bill_id?: string
          details?: Json | null
          flat_id?: string
          id?: never
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_history_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_history_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_templates: {
        Row: {
          active: boolean
          amount: number | null
          category_id: string
          created_at: string
          created_by: string
          due_day: number
          flat_id: string
          id: string
          remind_days_before: number
        }
        Insert: {
          active?: boolean
          amount?: number | null
          category_id: string
          created_at?: string
          created_by?: string
          due_day: number
          flat_id: string
          id?: string
          remind_days_before?: number
        }
        Update: {
          active?: boolean
          amount?: number | null
          category_id?: string
          created_at?: string
          created_by?: string
          due_day?: number
          flat_id?: string
          id?: string
          remind_days_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "bill_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_templates_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount: number | null
          category_id: string
          created_at: string
          created_by: string
          due_date: string | null
          flat_id: string
          id: string
          marked_at: string | null
          marked_by: string | null
          month: string
          note: string | null
          status: Database["public"]["Enums"]["bill_status"]
          template_id: string | null
          title: string
        }
        Insert: {
          amount?: number | null
          category_id: string
          created_at?: string
          created_by?: string
          due_date?: string | null
          flat_id: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          month: string
          note?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          template_id?: string | null
          title: string
        }
        Update: {
          amount?: number | null
          category_id?: string
          created_at?: string
          created_by?: string
          due_date?: string | null
          flat_id?: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          month?: string
          note?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          template_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "bill_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "bill_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      buy_items: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          deadline: string | null
          est_cost: number | null
          final_amount: number | null
          flat_id: string
          id: string
          name: string
          note: string | null
          proposed_by: string
          status: Database["public"]["Enums"]["buy_status"]
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          deadline?: string | null
          est_cost?: number | null
          final_amount?: number | null
          flat_id: string
          id?: string
          name: string
          note?: string | null
          proposed_by: string
          status?: Database["public"]["Enums"]["buy_status"]
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          deadline?: string | null
          est_cost?: number | null
          final_amount?: number | null
          flat_id?: string
          id?: string
          name?: string
          note?: string | null
          proposed_by?: string
          status?: Database["public"]["Enums"]["buy_status"]
        }
        Relationships: [
          {
            foreignKeyName: "buy_items_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      buy_votes: {
        Row: {
          flat_id: string
          item_id: string
          updated_at: string
          user_id: string
          vote_in: boolean
        }
        Insert: {
          flat_id: string
          item_id: string
          updated_at?: string
          user_id: string
          vote_in: boolean
        }
        Update: {
          flat_id?: string
          item_id?: string
          updated_at?: string
          user_id?: string
          vote_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "buy_votes_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_votes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "buy_items"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          created_by: string
          flat_id: string
          id: string
          name: string
          phone: string
          role: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          flat_id: string
          id?: string
          name: string
          phone: string
          role: string
        }
        Update: {
          created_at?: string
          created_by?: string
          flat_id?: string
          id?: string
          name?: string
          phone?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      dinner_joins: {
        Row: {
          created_at: string
          day: string
          flat_id: string
          host_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          flat_id: string
          host_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          flat_id?: string
          host_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dinner_joins_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      dinner_status: {
        Row: {
          choice: Database["public"]["Enums"]["dinner_choice"]
          day: string
          flat_id: string
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          choice: Database["public"]["Enums"]["dinner_choice"]
          day: string
          flat_id: string
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          choice?: Database["public"]["Enums"]["dinner_choice"]
          day?: string
          flat_id?: string
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dinner_status_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          flat_id: string
          id: string
          mime: string | null
          size_bytes: number | null
          storage_path: string
          title: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          flat_id: string
          id?: string
          mime?: string | null
          size_bytes?: number | null
          storage_path: string
          title: string
          uploaded_by?: string
        }
        Update: {
          created_at?: string
          flat_id?: string
          id?: string
          mime?: string | null
          size_bytes?: number | null
          storage_path?: string
          title?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      flat_info: {
        Row: {
          flat_id: string
          owner_name: string | null
          owner_phone: string | null
          pay_note: string | null
          rent_amount: number | null
          rent_due_day: number | null
          updated_at: string
          updated_by: string | null
          wifi_name: string | null
          wifi_password: string | null
        }
        Insert: {
          flat_id: string
          owner_name?: string | null
          owner_phone?: string | null
          pay_note?: string | null
          rent_amount?: number | null
          rent_due_day?: number | null
          updated_at?: string
          updated_by?: string | null
          wifi_name?: string | null
          wifi_password?: string | null
        }
        Update: {
          flat_id?: string
          owner_name?: string | null
          owner_phone?: string | null
          pay_note?: string | null
          rent_amount?: number | null
          rent_due_day?: number | null
          updated_at?: string
          updated_by?: string | null
          wifi_name?: string | null
          wifi_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flat_info_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: true
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      flat_members: {
        Row: {
          flat_id: string
          joined_at: string
          left_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          flat_id: string
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          flat_id?: string
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flat_members_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      flats: {
        Row: {
          created_at: string
          created_by: string
          home_lat: number | null
          home_lng: number | null
          id: string
          invite_code: string
          name: string
          radius_m: number
          timezone: string
        }
        Insert: {
          created_at?: string
          created_by: string
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          invite_code: string
          name: string
          radius_m?: number
          timezone?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          invite_code?: string
          name?: string
          radius_m?: number
          timezone?: string
        }
        Relationships: []
      }
      notices: {
        Row: {
          author_id: string
          body: string
          created_at: string
          flat_id: string
          id: string
          pinned: boolean
        }
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          flat_id: string
          id?: string
          pinned?: boolean
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          flat_id?: string
          id?: string
          pinned?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notices_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          bills: boolean
          buy: boolean
          dinner: boolean
          notices: boolean
          presence: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          bills?: boolean
          buy?: boolean
          dinner?: boolean
          notices?: boolean
          presence?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          bills?: boolean
          buy?: boolean
          dinner?: boolean
          notices?: boolean
          presence?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          flat_id: string
          id: number
          kind: string
          read_at: string | null
          target: string | null
          title: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          flat_id: string
          id?: never
          kind: string
          read_at?: string | null
          target?: string | null
          title: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          flat_id?: string
          id?: never
          kind?: string
          read_at?: string | null
          target?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          flat_id: string
          id: string
          label: string
          poll_id: string
          position: number
        }
        Insert: {
          flat_id: string
          id?: string
          label: string
          poll_id: string
          position: number
        }
        Update: {
          flat_id?: string
          id?: string
          label?: string
          poll_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          flat_id: string
          option_id: string
          poll_id: string
          user_id: string
          voted_at: string
        }
        Insert: {
          flat_id: string
          option_id: string
          poll_id: string
          user_id: string
          voted_at?: string
        }
        Update: {
          flat_id?: string
          option_id?: string
          poll_id?: string
          user_id?: string
          voted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          closed: boolean
          closes_at: string | null
          created_at: string
          created_by: string
          flat_id: string
          id: string
          question: string
        }
        Insert: {
          closed?: boolean
          closes_at?: string | null
          created_at?: string
          created_by?: string
          flat_id: string
          id?: string
          question: string
        }
        Update: {
          closed?: boolean
          closes_at?: string | null
          created_at?: string
          created_by?: string
          flat_id?: string
          id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      presence: {
        Row: {
          flat_id: string
          manual: string | null
          manual_note: string | null
          manual_until: string | null
          sharing: boolean
          since: string | null
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          flat_id: string
          manual?: string | null
          manual_note?: string | null
          manual_until?: string | null
          sharing?: boolean
          since?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          flat_id?: string
          manual?: string | null
          manual_note?: string | null
          manual_until?: string | null
          sharing?: boolean
          since?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      repairs: {
        Row: {
          created_at: string
          details: string | null
          fixed_at: string | null
          fixed_by: string | null
          flat_id: string
          id: string
          reported_by: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          fixed_at?: string | null
          fixed_by?: string | null
          flat_id: string
          id?: string
          reported_by?: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          details?: string | null
          fixed_at?: string | null
          fixed_by?: string | null
          flat_id?: string
          id?: string
          reported_by?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "repairs_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "flats"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      close_buy: {
        Args: {
          p_final?: number
          p_item: string
          p_status: Database["public"]["Enums"]["buy_status"]
        }
        Returns: undefined
      }
      close_poll: { Args: { p_poll: string }; Returns: undefined }
      create_flat: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          created_by: string
          home_lat: number | null
          home_lng: number | null
          id: string
          invite_code: string
          name: string
          radius_m: number
          timezone: string
        }
        SetofOptions: {
          from: "*"
          to: "flats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_poll: {
        Args: {
          p_closes_at?: string
          p_flat: string
          p_options: string[]
          p_question: string
        }
        Returns: {
          closed: boolean
          closes_at: string | null
          created_at: string
          created_by: string
          flat_id: string
          id: string
          question: string
        }
        SetofOptions: {
          from: "*"
          to: "polls"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_flat: {
        Args: { p_confirm_name: string; p_flat: string }
        Returns: undefined
      }
      dinner_day: { Args: { p_flat: string }; Returns: string }
      display_name: { Args: { p_user: string }; Returns: string }
      fix_repair: { Args: { p_repair: string }; Returns: undefined }
      flat_today: { Args: { p_flat: string }; Returns: string }
      generate_recurring_bills: {
        Args: { p_template?: string }
        Returns: number
      }
      has_flat_named: {
        Args: { p_except?: string; p_name: string; p_user: string }
        Returns: boolean
      }
      is_flat_admin: { Args: { p_flat: string }; Returns: boolean }
      is_flat_member: { Args: { p_flat: string }; Returns: boolean }
      is_member_of_folder: { Args: { p_name: string }; Returns: boolean }
      join_flat: {
        Args: { p_code: string }
        Returns: {
          created_at: string
          created_by: string
          home_lat: number | null
          home_lng: number | null
          id: string
          invite_code: string
          name: string
          radius_m: number
          timezone: string
        }
        SetofOptions: {
          from: "*"
          to: "flats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      leave_flat: { Args: { p_flat: string }; Returns: undefined }
      mark_bill: {
        Args: { p_bill: string; p_paid: boolean; p_reason?: string }
        Returns: {
          amount: number | null
          category_id: string
          created_at: string
          created_by: string
          due_date: string | null
          flat_id: string
          id: string
          marked_at: string | null
          marked_by: string | null
          month: string
          note: string | null
          status: Database["public"]["Enums"]["bill_status"]
          template_id: string | null
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "bills"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_notifications_read: { Args: { p_flat: string }; Returns: undefined }
      new_invite_code: { Args: never; Returns: string }
      notify_flat: {
        Args: {
          p_actor: string
          p_body: string
          p_flat: string
          p_kind: string
          p_target: string
          p_title: string
        }
        Returns: undefined
      }
      pin_notice: {
        Args: { p_notice: string; p_pinned: boolean }
        Returns: undefined
      }
      post_notice: {
        Args: { p_body: string; p_flat: string }
        Returns: {
          author_id: string
          body: string
          created_at: string
          flat_id: string
          id: string
          pinned: boolean
        }
        SetofOptions: {
          from: "*"
          to: "notices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      propose_buy: {
        Args: {
          p_cost?: number
          p_deadline?: string
          p_flat: string
          p_name: string
          p_note?: string
        }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          deadline: string | null
          est_cost: number | null
          final_amount: number | null
          flat_id: string
          id: string
          name: string
          note: string | null
          proposed_by: string
          status: Database["public"]["Enums"]["buy_status"]
        }
        SetofOptions: {
          from: "*"
          to: "buy_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_push_token: { Args: { p_token: string }; Returns: undefined }
      remove_member: {
        Args: { p_flat: string; p_user: string }
        Returns: undefined
      }
      rename_flat: {
        Args: { p_flat: string; p_name: string }
        Returns: undefined
      }
      report_presence: {
        Args: { p_flat: string; p_state: string }
        Returns: undefined
      }
      report_repair: {
        Args: { p_details: string; p_flat: string; p_title: string }
        Returns: {
          created_at: string
          details: string | null
          fixed_at: string | null
          fixed_by: string | null
          flat_id: string
          id: string
          reported_by: string
          status: string
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "repairs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_invite_code: { Args: { p_flat: string }; Returns: string }
      save_notification_prefs: {
        Args: {
          p_bills: boolean
          p_buy: boolean
          p_dinner: boolean
          p_notices: boolean
          p_presence: boolean
        }
        Returns: undefined
      }
      send_bill_reminders: { Args: never; Returns: number }
      send_test_notification: { Args: { p_flat: string }; Returns: undefined }
      set_dinner: {
        Args: {
          p_choice: Database["public"]["Enums"]["dinner_choice"]
          p_flat: string
          p_note?: string
        }
        Returns: undefined
      }
      set_member_role: {
        Args: {
          p_flat: string
          p_role: Database["public"]["Enums"]["member_role"]
          p_user: string
        }
        Returns: undefined
      }
      set_presence_sharing: {
        Args: { p_flat: string; p_sharing: boolean }
        Returns: undefined
      }
      set_presence_status: {
        Args: {
          p_flat: string
          p_manual: string
          p_note?: string
          p_until?: string
        }
        Returns: undefined
      }
      shares_a_flat_with: { Args: { p_user: string }; Returns: boolean }
      toggle_dinner_join: {
        Args: { p_flat: string; p_host: string }
        Returns: boolean
      }
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
      update_flat_home: {
        Args: { p_flat: string; p_lat: number; p_lng: number; p_radius: number }
        Returns: {
          created_at: string
          created_by: string
          home_lat: number | null
          home_lng: number | null
          id: string
          invite_code: string
          name: string
          radius_m: number
          timezone: string
        }
        SetofOptions: {
          from: "*"
          to: "flats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vote_buy: { Args: { p_in: boolean; p_item: string }; Returns: undefined }
      vote_poll: {
        Args: { p_option: string; p_poll: string }
        Returns: undefined
      }
    }
    Enums: {
      bill_status: "unpaid" | "paid"
      buy_status: "open" | "bought" | "cancelled"
      dinner_choice: "home" | "out" | "online" | "skip"
      member_role: "admin" | "member"
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
      bill_status: ["unpaid", "paid"],
      buy_status: ["open", "bought", "cancelled"],
      dinner_choice: ["home", "out", "online", "skip"],
      member_role: ["admin", "member"],
    },
  },
} as const
