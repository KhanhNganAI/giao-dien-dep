import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createSePayWebhookHandler,
  type SePayEvent,
} from "../../../src/features/wallet/sepay-handler.ts";
import type { Database } from "../../../src/integrations/supabase/types.ts";

function getServiceRoleKey() {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;

  try {
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<
      string,
      string
    >;
    return secretKeys.default;
  } catch {
    return undefined;
  }
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = getServiceRoleKey();
const expectedReceivingAccount = Deno.env.get("SEPAY_RECEIVING_ACCOUNT_NUMBER");

const handleWebhook = createSePayWebhookHandler(
  Deno.env.get("SEPAY_WEBHOOK_API_KEY"),
  async (event: SePayEvent) => {
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server credentials are missing");
    if (!expectedReceivingAccount) throw new Error("SePay receiving account is not configured");

    const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.rpc("process_sepay_topup", {
      p_transaction_id: event.id,
      p_payment_code: event.code ?? "",
      p_transfer_type: event.transferType,
      p_transfer_amount: event.transferAmount,
      p_provider_reference: event.referenceCode ?? "",
      p_receiving_account: event.accountNumber,
      p_expected_receiving_account: expectedReceivingAccount,
    });
    if (error) throw error;
    return data;
  },
);

Deno.serve(handleWebhook);
