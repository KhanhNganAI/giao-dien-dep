import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTopup, loadWallet, topupBundles } from "./wallet-api";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));

describe("Dragon Xu top-up API", () => {
  beforeEach(() => {
    mocks.rpc.mockResolvedValue({
      data: {
        topup_id: "order-1",
        payment_code: "DRAGON123456789ABC",
        amount_vnd: 100000,
        xu_amount: 10000,
        expires_at: "2026-09-25T12:00:00Z",
        status: "pending",
      },
      error: null,
    });
  });

  it("keeps the approved fixed 1:10 top-up bundles", () => {
    expect(topupBundles.map(({ amountVnd, xuAmount }) => [amountVnd, xuAmount])).toEqual([
      [100000, 10000],
      [300000, 30000],
      [500000, 50000],
    ]);
  });

  it("creates a server-priced order and normalizes its id for status polling", async () => {
    const order = await createTopup("xu-10000");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_wallet_topup",
      expect.objectContaining({
        p_bundle_id: "xu-10000",
        p_idempotency_key: expect.any(String),
      }),
    );
    expect(order).toMatchObject({
      id: "order-1",
      amount_vnd: 100000,
      xu_amount: 10000,
      status: "pending",
    });
  });

  it("does not manufacture a paid order when the backend rejects creation", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("insufficient service") });
    await expect(createTopup("xu-10000")).rejects.toThrow("insufficient service");
  });

  it("loads the current user's wallet and recent ledger through RLS-scoped reads", async () => {
    const walletQuery = {
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { balance: 87 }, error: null }),
    };
    const ledger = [
      {
        id: "entry-1",
        amount: 12,
        transaction_type: "harvest",
        reference: "harvest",
        balance_after: 87,
        created_at: "2026-09-25T10:00:00Z",
      },
    ];
    const transactionQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: ledger, error: null }),
    };
    mocks.from.mockImplementation((table: string) =>
      table === "dragon_wallets" ? walletQuery : transactionQuery,
    );
    await expect(loadWallet()).resolves.toEqual({ balance: 87, transactions: ledger });
    expect(mocks.from).toHaveBeenCalledWith("dragon_wallets");
    expect(mocks.from).toHaveBeenCalledWith("dragon_wallet_transactions");
    expect(transactionQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});
