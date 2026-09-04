export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      families: {
        Row: {
          assumed_cagr: number
          created_at: string
          goal_horizon_years: number
          head_mobile: string | null
          head_name: string | null
          id: string
          name: string
          notes: string | null
          owner_advisor_id: string
          updated_at: string
        }
        Insert: {
          assumed_cagr?: number
          created_at?: string
          goal_horizon_years?: number
          head_mobile?: string | null
          head_name?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_advisor_id: string
          updated_at?: string
        }
        Update: {
          assumed_cagr?: number
          created_at?: string
          goal_horizon_years?: number
          head_mobile?: string | null
          head_name?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_advisor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "families_owner_advisor_id_fkey"
            columns: ["owner_advisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          created_at: string
          family_id: string
          id: string
          mobile: string | null
          name: string
          relation: Database["public"]["Enums"]["member_relation"]
          updated_at: string
          whatsapp_consent: boolean
          whatsapp_consent_at: string | null
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          mobile?: string | null
          name: string
          relation?: Database["public"]["Enums"]["member_relation"]
          updated_at?: string
          whatsapp_consent?: boolean
          whatsapp_consent_at?: string | null
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          mobile?: string | null
          name?: string
          relation?: Database["public"]["Enums"]["member_relation"]
          updated_at?: string
          whatsapp_consent?: boolean
          whatsapp_consent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      holdings: {
        Row: {
          anchor_due_date: string | null
          category: Database["public"]["Enums"]["holding_category"]
          created_at: string
          details: Json
          due_frequency: Database["public"]["Enums"]["due_frequency"]
          family_id: string
          id: string
          institution: string | null
          label: string
          managed_by: Database["public"]["Enums"]["managed_by"]
          member_id: string | null
          next_due_date: string | null
          periodic_amount: number | null
          principal_amount: number | null
          reminders_enabled: boolean
          updated_at: string
        }
        Insert: {
          anchor_due_date?: string | null
          category: Database["public"]["Enums"]["holding_category"]
          created_at?: string
          details?: Json
          due_frequency?: Database["public"]["Enums"]["due_frequency"]
          family_id: string
          id?: string
          institution?: string | null
          label: string
          managed_by?: Database["public"]["Enums"]["managed_by"]
          member_id?: string | null
          next_due_date?: string | null
          periodic_amount?: number | null
          principal_amount?: number | null
          reminders_enabled?: boolean
          updated_at?: string
        }
        Update: {
          anchor_due_date?: string | null
          category?: Database["public"]["Enums"]["holding_category"]
          created_at?: string
          details?: Json
          due_frequency?: Database["public"]["Enums"]["due_frequency"]
          family_id?: string
          id?: string
          institution?: string | null
          label?: string
          managed_by?: Database["public"]["Enums"]["managed_by"]
          member_id?: string | null
          next_due_date?: string | null
          periodic_amount?: number | null
          principal_amount?: number | null
          reminders_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          mobile: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          mobile?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          mobile?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      due_frequency:
        | "annual"
        | "half_yearly"
        | "quarterly"
        | "monthly"
        | "one_time"
      holding_category:
        | "life_insurance"
        | "general_insurance"
        | "mutual_fund"
        | "fixed_income"
      managed_by: "self" | "external"
      member_relation:
        | "self"
        | "spouse"
        | "son"
        | "daughter"
        | "father"
        | "mother"
        | "other"
      user_role: "admin" | "staff" | "client"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      due_frequency: [
        "annual",
        "half_yearly",
        "quarterly",
        "monthly",
        "one_time",
      ],
      holding_category: [
        "life_insurance",
        "general_insurance",
        "mutual_fund",
        "fixed_income",
      ],
      managed_by: ["self", "external"],
      member_relation: [
        "self",
        "spouse",
        "son",
        "daughter",
        "father",
        "mother",
        "other",
      ],
      user_role: ["admin", "staff", "client"],
    },
  },
} as const

