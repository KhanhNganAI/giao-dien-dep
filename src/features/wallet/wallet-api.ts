import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type WalletTopup = Tables<"wallet_topups">;
export type WalletTransaction = Pick<
  Tables<"dragon_wallet_transactions">,
  "id" | "amount" | "transaction_type" | "reference" | "balance_after" | "created_at"
>;
export type TopupBundle = { bundleId: string; label: string; amountVnd: number; xuAmount: number };

export const topupBundles: TopupBundle[] = [
  { bundleId: "xu-10000", label: "Khởi Động", amountVnd: 100_000, xuAmount: 10_000 },
  { bundleId: "xu-30000", label: "Bứt Phá", amountVnd: 300_000, xuAmount: 30_000 },
  { bundleId: "xu-50000", label: "Dẫn Đầu", amountVnd: 500_000, xuAmount: 50_000 },
];

export type TopupOrder = Pick<
  WalletTopup,
  "id" | "payment_code" | "amount_vnd" | "xu_amount" | "expires_at" | "status"
>;

export async function loadWallet() {
  const [wallet, transactions] = await Promise.all([
    supabase.from("dragon_wallets").select("balance").single(),
    supabase
      .from("dragon_wallet_transactions")
      .select("id, amount, transaction_type, reference, balance_after, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  if (wallet.error) throw wallet.error;
  if (transactions.error) throw transactions.error;
  return { balance: wallet.data.balance, transactions: transactions.data ?? [] };
}

export async function createTopup(bundleId: string): Promise<TopupOrder> {
  const { data, error } = await supabase.rpc("create_wallet_topup", {
    p_bundle_id: bundleId,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) throw error;
  const order = data as {
    topup_id: string;
    payment_code: string;
    amount_vnd: number;
    xu_amount: number;
    expires_at: string;
    status: string;
  };
  return {
    id: order.topup_id,
    payment_code: order.payment_code,
    amount_vnd: order.amount_vnd,
    xu_amount: order.xu_amount,
    expires_at: order.expires_at,
    status: order.status,
  };
}

export async function readTopup(topupId: string): Promise<TopupOrder> {
  const { data, error } = await supabase
    .from("wallet_topups")
    .select("id, payment_code, amount_vnd, xu_amount, expires_at, status")
    .eq("id", topupId)
    .single();
  if (error) throw error;
  return data;
}
