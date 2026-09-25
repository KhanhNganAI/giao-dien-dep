export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      profiles: Table<{
        id: string;
        username: string;
        created_at: string;
        updated_at: string;
      }>;
      dragon_wallets: Table<{
        id: string;
        user_id: string;
        balance: number;
        created_at: string;
        updated_at: string;
      }>;
      dragon_wallet_transactions: Table<{
        id: string;
        user_id: string;
        amount: number;
        transaction_type: string;
        reference: string | null;
        idempotency_key: string | null;
        balance_after: number;
        created_at: string;
      }>;
      learning_progress: Table<{
        user_id: string;
        completed_lessons: number;
        source_reference: string | null;
        updated_at: string;
      }>;
      seed_catalog: Table<{
        seed_key: string;
        display_name: string;
        price_xu: number;
        growth_seconds: number;
        reward_min: number;
        reward_max: number;
        bottom_row_only: boolean;
        active: boolean;
      }>;
      garden_slots: Table<{
        id: string;
        user_id: string;
        slot_index: number;
        seed_key: string | null;
        status: string;
        planted_at: string | null;
        ready_at: string | null;
        snail_attacked: boolean;
        created_at: string;
        updated_at: string;
      }>;
      seed_inventory: Table<{
        user_id: string;
        seed_key: string;
        quantity: number;
        updated_at: string;
      }>;
      game_gifts: Table<{
        id: string;
        gift_key: string;
        display_name: string;
        description: string;
        price_xu: number;
        active: boolean;
        created_at: string;
      }>;
      gift_redemptions: Table<{
        id: string;
        user_id: string;
        gift_id: string;
        price_xu: number;
        created_at: string;
      }>;
      wallet_topups: Table<{
        id: string;
        user_id: string;
        bundle_id: string;
        payment_code: string;
        amount_vnd: number;
        xu_amount: number;
        status: string;
        expires_at: string;
        provider_transaction_id: number | null;
        provider_reference: string | null;
        created_at: string;
        paid_at: string | null;
      }>;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      purchase_seed: {
        Args: { p_seed_key: string; p_quantity: number; p_idempotency_key: string };
        Returns: Json;
      };
      plant_crop: {
        Args: { p_slot_index: number; p_seed_key: string; p_idempotency_key: string };
        Returns: Json;
      };
      plant_crops: {
        Args: { p_slot_indices: number[]; p_seed_key: string; p_idempotency_key: string };
        Returns: Json;
      };
      harvest_crop: {
        Args: { p_slot_index: number; p_idempotency_key: string };
        Returns: Json;
      };
      harvest_crops: {
        Args: { p_slot_indices: number[]; p_idempotency_key: string };
        Returns: Json;
      };
      exchange_seed: {
        Args: { p_from_seed: string; p_to_seed: string; p_idempotency_key: string };
        Returns: Json;
      };
      redeem_game_gift: {
        Args: { p_gift_id: string; p_idempotency_key: string };
        Returns: Json;
      };
      sync_learning_progress: {
        Args: { p_user_id: string; p_completed_lessons: number; p_source_reference: string };
        Returns: {
          user_id: string;
          completed_lessons: number;
          source_reference: string | null;
          updated_at: string;
        };
      };
      create_wallet_topup: {
        Args: { p_bundle_id: string; p_idempotency_key: string };
        Returns: Json;
      };
      process_sepay_topup: {
        Args: {
          p_transaction_id: number;
          p_payment_code: string;
          p_transfer_type: string;
          p_transfer_amount: number;
          p_provider_reference: string;
          p_receiving_account: string;
          p_expected_receiving_account: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
