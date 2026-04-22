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
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          color?: string;
          display_order?: number;
        };
        Relationships: [];
      };
      positions: {
        Row: {
          id: string;
          ticker: string;
          name: string;
          committee_id: string;
          shares: number;
          cost_basis: number;
          purchased_at: string;
          thesis: string | null;
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
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ticker?: string;
          name?: string;
          committee_id?: string;
          shares?: number;
          cost_basis?: number;
          purchased_at?: string;
          thesis?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      trades: {
        Row: {
          id: string;
          ticker: string;
          shares: number;
          price: number;
          traded_at: string;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticker: string;
          shares: number;
          price: number;
          traded_at: string;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ticker?: string;
          shares?: number;
          price?: number;
          traded_at?: string;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cash_transactions: {
        Row: {
          id: string;
          amount: number;
          kind:
            | "deposit"
            | "withdrawal"
            | "dividend"
            | "trade_buy"
            | "trade_sell"
            | "fee"
            | "adjustment";
          ticker: string | null;
          occurred_at: string;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          amount: number;
          kind:
            | "deposit"
            | "withdrawal"
            | "dividend"
            | "trade_buy"
            | "trade_sell"
            | "fee"
            | "adjustment";
          ticker?: string | null;
          occurred_at: string;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          amount?: number;
          kind?:
            | "deposit"
            | "withdrawal"
            | "dividend"
            | "trade_buy"
            | "trade_sell"
            | "fee"
            | "adjustment";
          ticker?: string | null;
          occurred_at?: string;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      price_ticks: {
        Row: {
          ticker: string;
          observed_at: string;
          price: number;
          source: string;
        };
        Insert: {
          ticker: string;
          observed_at: string;
          price: number;
          source: string;
        };
        Update: {
          ticker?: string;
          observed_at?: string;
          price?: number;
          source?: string;
        };
        Relationships: [];
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
        Insert: {
          ticker: string;
          snapshot_date: string;
          close_price: number;
          market_cap?: number | null;
          enterprise_value?: number | null;
          pe_ratio?: number | null;
          eps?: number | null;
          dividend_yield?: number | null;
          sector?: string | null;
          industry?: string | null;
          source: string;
          created_at?: string;
        };
        Update: {
          ticker?: string;
          snapshot_date?: string;
          close_price?: number;
          market_cap?: number | null;
          enterprise_value?: number | null;
          pe_ratio?: number | null;
          eps?: number | null;
          dividend_yield?: number | null;
          sector?: string | null;
          industry?: string | null;
          source?: string;
          created_at?: string;
        };
        Relationships: [];
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
        Update: {
          snapshot_date?: string;
          total_value?: number;
          cash?: number;
          created_at?: string;
        };
        Relationships: [];
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
        Update: {
          symbol?: string;
          observed_at?: string;
          price?: number;
          is_daily_close?: boolean;
          created_at?: string;
        };
        Relationships: [];
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
        Update: {
          user_id?: string;
          role?: "admin" | "viewer";
          display_name?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
