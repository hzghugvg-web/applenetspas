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
      admin_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      broadcast_reads: {
        Row: {
          broadcast_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          broadcast_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          broadcast_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_reads_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          created_at: string
          created_by: string
          delivery_style: string
          email: string | null
          id: string
          link: string | null
          message: string
          title: string | null
          website: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          delivery_style?: string
          email?: string | null
          id?: string
          link?: string | null
          message: string
          title?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          delivery_style?: string
          email?: string | null
          id?: string
          link?: string | null
          message?: string
          title?: string | null
          website?: string | null
        }
        Relationships: []
      }
      complaint_messages: {
        Row: {
          body: string
          complaint_id: string
          created_at: string
          id: string
          is_admin: boolean
          sender_id: string
        }
        Insert: {
          body: string
          complaint_id: string
          created_at?: string
          id?: string
          is_admin?: boolean
          sender_id: string
        }
        Update: {
          body?: string
          complaint_id?: string
          created_at?: string
          id?: string
          is_admin?: boolean
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_messages_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          admin_reply: string | null
          category: Database["public"]["Enums"]["complaint_category"]
          created_at: string
          description: string
          id: string
          phone: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["complaint_status"]
          updated_at: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          admin_reply?: string | null
          category?: Database["public"]["Enums"]["complaint_category"]
          created_at?: string
          description: string
          id?: string
          phone?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          admin_reply?: string | null
          category?: Database["public"]["Enums"]["complaint_category"]
          created_at?: string
          description?: string
          id?: string
          phone?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: []
      }
      directions: {
        Row: {
          country_code: string | null
          created_at: string
          flag: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          flag?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          flag?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      issued_configs: {
        Row: {
          direction_id: string | null
          id: string
          issued_at: string
          sub_token: string | null
          upstream_url: string | null
          user_id: string
          vless_url: string
        }
        Insert: {
          direction_id?: string | null
          id?: string
          issued_at?: string
          sub_token?: string | null
          upstream_url?: string | null
          user_id: string
          vless_url: string
        }
        Update: {
          direction_id?: string | null
          id?: string
          issued_at?: string
          sub_token?: string | null
          upstream_url?: string | null
          user_id?: string
          vless_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "issued_configs_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
      login_history: {
        Row: {
          created_at: string
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      password_recovery_requests: {
        Row: {
          admin_reply: string | null
          approximate_registration: string | null
          contact_method: string
          contact_value: string
          created_at: string
          description: string
          email: string
          id: string
          replied_at: string | null
          status: string
        }
        Insert: {
          admin_reply?: string | null
          approximate_registration?: string | null
          contact_method: string
          contact_value: string
          created_at?: string
          description: string
          email: string
          id?: string
          replied_at?: string | null
          status?: string
        }
        Update: {
          admin_reply?: string | null
          approximate_registration?: string | null
          contact_method?: string
          contact_value?: string
          created_at?: string
          description?: string
          email?: string
          id?: string
          replied_at?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cooldown_until: string | null
          created_at: string
          device_count: number
          email: string
          id: string
          is_blocked: boolean
          subscription_from: string | null
          subscription_until: string | null
          updated_at: string
        }
        Insert: {
          cooldown_until?: string | null
          created_at?: string
          device_count?: number
          email: string
          id: string
          is_blocked?: boolean
          subscription_from?: string | null
          subscription_until?: string | null
          updated_at?: string
        }
        Update: {
          cooldown_until?: string | null
          created_at?: string
          device_count?: number
          email?: string
          id?: string
          is_blocked?: boolean
          subscription_from?: string | null
          subscription_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          subscription_json: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          subscription_json: Json
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          subscription_json?: Json
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
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
          role: Database["public"]["Enums"]["app_role"]
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
      vless_links: {
        Row: {
          available_from: string | null
          created_at: string
          direction_id: string
          expires_at: string | null
          id: string
          is_active: boolean
          title: string | null
          url: string
        }
        Insert: {
          available_from?: string | null
          created_at?: string
          direction_id: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          title?: string | null
          url: string
        }
        Update: {
          available_from?: string | null
          created_at?: string
          direction_id?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "vless_links_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_broadcast: { Args: { _id: string }; Returns: undefined }
      admin_delete_issued_config: {
        Args: { _config_id: string }
        Returns: undefined
      }
      admin_issue_config_for: {
        Args: { _direction_id: string; _target: string }
        Returns: string
      }
      admin_reset_cooldown: { Args: { _target: string }; Returns: undefined }
      admin_reset_cooldown_for: {
        Args: { _target: string }
        Returns: undefined
      }
      admin_send_broadcast:
        | { Args: { _message: string }; Returns: string }
        | { Args: { _message: string; _title?: string }; Returns: string }
        | {
            Args: { _link?: string; _message: string; _title?: string }
            Returns: string
          }
        | {
            Args: {
              _email?: string
              _link?: string
              _message: string
              _title?: string
              _website?: string
            }
            Returns: string
          }
        | {
            Args: {
              _delivery_style?: string
              _email?: string
              _link?: string
              _message: string
              _title?: string
              _website?: string
            }
            Returns: string
          }
      admin_set_subscription_dates: {
        Args: { _from: string; _target: string; _until: string }
        Returns: undefined
      }
      admin_toggle_block: {
        Args: { _block: boolean; _target: string }
        Returns: undefined
      }
      admin_update_broadcast:
        | {
            Args: {
              _email?: string
              _id: string
              _link?: string
              _message: string
              _title?: string
              _website?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _delivery_style?: string
              _email?: string
              _id: string
              _link?: string
              _message: string
              _title?: string
              _website?: string
            }
            Returns: undefined
          }
      admin_update_complaint: {
        Args: {
          _id: string
          _reply: string
          _status: Database["public"]["Enums"]["complaint_status"]
        }
        Returns: undefined
      }
      bootstrap_user: { Args: never; Returns: undefined }
      cleanup_expired_vless_links: { Args: never; Returns: number }
      close_own_complaint: { Args: { _id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      issue_vpn_config: {
        Args: { _direction_id: string }
        Returns: {
          upstream_url: string
          vless_url: string
        }[]
      }
      log_admin_action: {
        Args: { _action: string; _details: Json; _target: string }
        Returns: undefined
      }
      set_own_issued_config_vless: {
        Args: { _config_id: string; _vless_url: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      complaint_category: "question" | "problem"
      complaint_status: "new" | "in_progress" | "resolved" | "rejected"
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
      app_role: ["admin", "user"],
      complaint_category: ["question", "problem"],
      complaint_status: ["new", "in_progress", "resolved", "rejected"],
    },
  },
} as const
