// Hand-written to mirror supabase/schema.sql. Replace with the output of
// `supabase gen types typescript` once the Supabase CLI is wired up.

export type Database = {
  public: {
    Tables: {
      committees: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          color: string;
          display_order: number;
        };
        Insert: {
          id: string;
          name: string;
          description?: string | null;
          color: string;
          display_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["committees"]["Insert"]>;
      };
      positions: {
        Row: {
          id: string;
          ticker: string;
          name: string;
          committee_id: string;
          shares: number;
          cost_basis: number;
          purchased_at: string; // ISO date
          thesis: string | null;
          closed_at: string | null;
          close_price: number | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticker: string;
          name: string;
          committee_id: string;
          shares: number;
          cost_basis: number;
          purchased_at: string;
          thesis?: string | null;
          closed_at?: string | null;
          close_price?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["positions"]["Insert"]>;
      };
      price_ticks: {
        Row: {
          ticker: string;
          observed_at: string; // ISO timestamp
          price: number;
          source: string;
        };
        Insert: Database["public"]["Tables"]["price_ticks"]["Row"];
        Update: Partial<Database["public"]["Tables"]["price_ticks"]["Row"]>;
      };
      price_snapshots: {
        Row: {
          ticker: string;
          snapshot_date: string;
          close_price: number;
          market_cap: number | null;
          enterprise_value: number | null;
          pe_ratio: number | null;
          eps: number | null;
          dividend_yield: number | null;
          sector: string | null;
          industry: string | null;
          source: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["price_snapshots"]["Row"],
          "created_at"
        > & { created_at?: string };
        Update: Partial<
          Database["public"]["Tables"]["price_snapshots"]["Insert"]
        >;
      };
      fund_snapshots: {
        Row: {
          snapshot_date: string;
          total_value: number;
          cash: number;
          created_at: string;
        };
        Insert: {
          snapshot_date: string;
          total_value: number;
          cash?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["fund_snapshots"]["Insert"]>;
      };
      benchmark_snapshots: {
        Row: {
          symbol: string;
          observed_at: string;
          price: number;
          is_daily_close: boolean;
          created_at: string;
        };
        Insert: {
          symbol: string;
          observed_at: string;
          price: number;
          is_daily_close?: boolean;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["benchmark_snapshots"]["Insert"]
        >;
      };
      profiles: {
        Row: {
          user_id: string;
          role: "admin" | "viewer";
          display_name: string | null;
        };
        Insert: {
          user_id: string;
          role?: "admin" | "viewer";
          display_name?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
    };
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
  };
};
