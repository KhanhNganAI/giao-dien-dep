import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const databases: PGlite[] = [];
const userId = "10000000-0000-4000-8000-000000000001";
const idempotencyKey = "90000000-0000-4000-8000-000000000001";

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function createDatabase() {
  const database = new PGlite();
  databases.push(database);
  await database.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email text UNIQUE NOT NULL,
      raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `);

  for (const migrationName of [
    "202609250001_vuon_rong_core.sql",
    "202609250002_vuon_rong_transactions.sql",
    "202609250003_wallet_topups.sql",
    "202609250004_garden_ui_wallet_adjustment.sql",
    "202609250005_garden_store_fertilizers.sql",
  ]) {
    await database.exec(readFileSync(resolve("supabase/migrations", migrationName), "utf8"));
  }

  await database.query("INSERT INTO auth.users (id, email) VALUES ($1, 'a@example.test')", [
    userId,
  ]);
  await database.exec("SET ROLE service_role");
  await database.query("UPDATE dragon_wallets SET balance = 100 WHERE user_id = $1", [userId]);
  await database.exec("RESET ROLE; SET ROLE authenticated");
  await database.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
  return database;
}

describe("Vườn Rồng wallet and game RPCs", () => {
  it("debits a seed purchase once and returns the same result on retry", async () => {
    const database = await createDatabase();
    const first = await database.query<{ result: { balance: number; quantity: number } }>(
      "SELECT public.purchase_seed('red-rose', 3, $1) AS result",
      [idempotencyKey],
    );
    const retry = await database.query<{ result: { balance: number; quantity: number } }>(
      "SELECT public.purchase_seed('red-rose', 3, $1) AS result",
      [idempotencyKey],
    );
    const state = await database.query<{ balance: number; quantity: number; entries: number }>(
      `
      SELECT dragon_wallets.balance,
             seed_inventory.quantity,
             (SELECT count(*)::int FROM dragon_wallet_transactions) AS entries
      FROM dragon_wallets
      JOIN seed_inventory USING (user_id)
      WHERE dragon_wallets.user_id = $1 AND seed_inventory.seed_key = 'red-rose'
    `,
      [userId],
    );

    expect(first.rows[0]?.result).toMatchObject({
      balance: 85,
      quantity: 3,
      purchased: 3,
      total_price: 15,
    });
    expect(retry.rows[0]?.result).toEqual(first.rows[0]?.result);
    expect(state.rows[0]).toEqual({ balance: 85, quantity: 3, entries: 1 });
  });

  it("sells fertilizer in server-priced packs and records an idempotent wallet purchase", async () => {
    const database = await createDatabase();
    const first = await database.query<{
      result: { balance: number; quantity: number; total_price: number };
    }>("SELECT public.purchase_fertilizer('growth', 5, $1) AS result", [idempotencyKey]);
    const retry = await database.query<{
      result: { balance: number; quantity: number; total_price: number };
    }>("SELECT public.purchase_fertilizer('growth', 5, $1) AS result", [idempotencyKey]);
    const ledger = await database.query<{ transaction_type: string; amount: number }>(
      "SELECT transaction_type, amount FROM dragon_wallet_transactions WHERE user_id = $1",
      [userId],
    );
    expect(first.rows[0]?.result).toMatchObject({ balance: 70, quantity: 5, total_price: 30 });
    expect(retry.rows[0]?.result).toEqual(first.rows[0]?.result);
    expect(ledger.rows).toEqual([{ transaction_type: "fertilizer_purchase", amount: -30 }]);
  });

  it("applies growth fertilizer to remaining time and caps each crop at three applications", async () => {
    const database = await createDatabase();
    await database.exec("SET ROLE service_role");
    await database.query(
      "INSERT INTO fertilizer_inventory (user_id, fertilizer_type, quantity) VALUES ($1, 'growth', 4)",
      [userId],
    );
    await database.query(
      `UPDATE garden_slots SET seed_key = 'red-rose', status = 'growing', planted_at = now(), ready_at = now() + interval '10 hours'
       WHERE user_id = $1 AND slot_index = 1`,
      [userId],
    );
    await database.exec("RESET ROLE; SET ROLE authenticated");
    const before = await database.query<{ ready_at: Date }>(
      "SELECT ready_at FROM garden_slots WHERE user_id = $1 AND slot_index = 1",
      [userId],
    );
    for (let index = 0; index < 3; index += 1) {
      await database.query("SELECT public.apply_fertilizer(1, 'growth', $1)", [
        `90000000-0000-4000-8000-00000000000${index + 1}`,
      ]);
    }
    await expect(
      database.query("SELECT public.apply_fertilizer(1, 'growth', $1)", [
        "90000000-0000-4000-8000-000000000004",
      ]),
    ).rejects.toThrow(/fertilizer_limit/);
    const state = await database.query<{
      fertilizer_uses: number;
      ready_at: Date;
      quantity: number;
    }>(
      `SELECT garden.fertilizer_uses, garden.ready_at, inventory.quantity
       FROM garden_slots garden JOIN fertilizer_inventory inventory USING (user_id)
       WHERE garden.user_id = $1 AND garden.slot_index = 1 AND inventory.fertilizer_type = 'growth'`,
      [userId],
    );
    const beforeRemaining = before.rows[0]!.ready_at.getTime() - Date.now();
    const afterRemaining = state.rows[0]!.ready_at.getTime() - Date.now();
    expect(state.rows[0]?.fertilizer_uses).toBe(3);
    expect(state.rows[0]?.quantity).toBe(1);
    expect(afterRemaining / beforeRemaining).toBeCloseTo(0.729, 1);
  });

  it("adds two percent harvest bonus per flower fertilizer and resets it for the next crop", async () => {
    const database = await createDatabase();
    await database.exec("SET ROLE service_role");
    await database.query(
      "INSERT INTO fertilizer_inventory (user_id, fertilizer_type, quantity) VALUES ($1, 'bloom', 3)",
      [userId],
    );
    await database.query(
      `UPDATE garden_slots SET seed_key = 'red-rose', status = 'growing', planted_at = now() - interval '3 hours',
         ready_at = now() + interval '1 hour' WHERE user_id = $1 AND slot_index = 1`,
      [userId],
    );
    await database.exec("RESET ROLE; SET ROLE authenticated");
    for (let index = 0; index < 3; index += 1) {
      await database.query("SELECT public.apply_fertilizer(1, 'bloom', $1)", [
        `80000000-0000-4000-8000-00000000000${index + 1}`,
      ]);
    }
    await database.exec("RESET ROLE; SET ROLE service_role");
    await database.query(
      "UPDATE garden_slots SET ready_at = now() - interval '1 hour' WHERE user_id = $1 AND slot_index = 1",
      [userId],
    );
    await database.exec("RESET ROLE; SET ROLE authenticated");
    const response = await database.query<{
      result: {
        results: Array<{
          base_reward: number;
          bonus_percent: number;
          fertilizer_bonus_percent: number;
          reward: number;
        }>;
      };
    }>("SELECT public.harvest_crop(1, $1) AS result", [idempotencyKey]);
    const state = await database.query<{
      fertilizer_uses: number;
      bloom_bonus_count: number;
      status: string;
    }>(
      "SELECT fertilizer_uses, bloom_bonus_count, status FROM garden_slots WHERE user_id = $1 AND slot_index = 1",
      [userId],
    );
    const harvest = response.rows[0]!.result.results[0]!;
    expect(harvest).toMatchObject({ bonus_percent: 5, fertilizer_bonus_percent: 6 });
    expect(harvest.reward).toBe(Math.floor(harvest.base_reward * 1.11));
    expect(state.rows[0]).toEqual({ fertilizer_uses: 0, bloom_bonus_count: 0, status: "empty" });
  });

  it("allows bottom-row-only crops in slots 7–12 and consumes inventory only when planting succeeds", async () => {
    const database = await createDatabase();
    await database.exec("SET ROLE service_role");
    await database.query(
      "INSERT INTO seed_inventory (user_id, seed_key, quantity) VALUES ($1, 'orchid', 1)",
      [userId],
    );
    await database.exec("RESET ROLE; SET ROLE authenticated");

    await expect(
      database.query("SELECT public.plant_crop(6, 'orchid', $1)", [idempotencyKey]),
    ).rejects.toThrow(/bottom row/i);
    const inventory = await database.query<{ quantity: number }>(
      "SELECT quantity FROM seed_inventory WHERE user_id = $1 AND seed_key = 'orchid'",
      [userId],
    );
    expect(inventory.rows[0]?.quantity).toBe(1);

    const planted = await database.query<{
      result: { slot_index: number; snail_attacked: boolean };
    }>("SELECT public.plant_crop(7, 'orchid', $1) AS result", [idempotencyKey]);
    const retry = await database.query<{ result: { slot_index: number; snail_attacked: boolean } }>(
      "SELECT public.plant_crop(7, 'orchid', $1) AS result",
      [idempotencyKey],
    );
    const slot = await database.query<{ ready_at: Date; planted_at: Date; status: string }>(
      "SELECT ready_at, planted_at, status FROM garden_slots WHERE user_id = $1 AND slot_index = 7",
      [userId],
    );
    const growthHours =
      (slot.rows[0]!.ready_at.getTime() - slot.rows[0]!.planted_at.getTime()) / 3_600_000;
    expect(planted.rows[0]?.result.slot_index).toBe(7);
    expect(retry.rows[0]?.result).toEqual(planted.rows[0]?.result);
    expect(growthHours).toBeGreaterThanOrEqual(48);
    expect(growthHours).toBeLessThanOrEqual(52.8);
    expect(slot.rows[0]?.status).toBe("growing");
  });

  it("harvests a ripe crop within its reward range and returns the same reward on retry", async () => {
    const database = await createDatabase();
    await database.exec("SET ROLE service_role");
    await database.query(
      `UPDATE garden_slots SET seed_key = 'red-rose', status = 'growing',
         planted_at = now() - interval '3 hours', ready_at = now() - interval '1 hour'
       WHERE user_id = $1 AND slot_index = 1`,
      [userId],
    );
    await database.exec("RESET ROLE; SET ROLE authenticated");

    const first = await database.query<{
      result: { results: Array<{ reward: number }>; reward_total: number; balance: number };
    }>("SELECT public.harvest_crop(1, $1) AS result", [idempotencyKey]);
    const retry = await database.query<{
      result: { results: Array<{ reward: number }>; reward_total: number; balance: number };
    }>("SELECT public.harvest_crop(1, $1) AS result", [idempotencyKey]);
    const state = await database.query<{ balance: number; entries: number; status: string }>(
      `
      SELECT dragon_wallets.balance, garden_slots.status,
             (SELECT count(*)::int FROM dragon_wallet_transactions) AS entries
      FROM dragon_wallets
      JOIN garden_slots USING (user_id)
      WHERE dragon_wallets.user_id = $1 AND garden_slots.slot_index = 1
    `,
      [userId],
    );
    const reward = first.rows[0]!.result.results[0]!.reward;

    expect(reward).toBeGreaterThanOrEqual(9);
    expect(reward).toBeLessThanOrEqual(11);
    expect(retry.rows[0]?.result).toEqual(first.rows[0]?.result);
    expect(state.rows[0]).toEqual({ balance: 100 + reward, entries: 1, status: "empty" });
  });

  it("rejects purchases that exceed the wallet without changing wallet, inventory, or ledger", async () => {
    const database = await createDatabase();
    await expect(
      database.query("SELECT public.purchase_seed('orchid', 4, $1)", [idempotencyKey]),
    ).rejects.toThrow(/insufficient_balance/);
    const state = await database.query<{ balance: number; inventory: number; entries: number }>(
      `
      SELECT dragon_wallets.balance,
             coalesce(seed_inventory.quantity, 0)::int AS inventory,
             (SELECT count(*)::int FROM dragon_wallet_transactions) AS entries
      FROM dragon_wallets
      LEFT JOIN seed_inventory USING (user_id)
      WHERE dragon_wallets.user_id = $1
    `,
      [userId],
    );
    expect(state.rows[0]).toEqual({ balance: 100, inventory: 0, entries: 0 });
  });

  it("bulk plants only empty eligible slots up to the seed inventory", async () => {
    const database = await createDatabase();
    await database.exec("SET ROLE service_role");
    await database.query(
      "INSERT INTO seed_inventory (user_id, seed_key, quantity) VALUES ($1, 'red-rose', 1)",
      [userId],
    );
    await database.exec("RESET ROLE; SET ROLE authenticated");
    const response = await database.query<{
      result: { consumed: number; planted: Array<{ slot_index: number }> };
    }>("SELECT public.plant_crops(ARRAY[2, 1, 1, 13], 'red-rose', $1) AS result", [idempotencyKey]);
    const plantedSlots = await database.query<{ slot_index: number; status: string }>(
      "SELECT slot_index, status FROM garden_slots WHERE user_id = $1 AND status <> 'empty'",
      [userId],
    );
    expect(response.rows[0]?.result.consumed).toBe(1);
    expect(response.rows[0]?.result.planted.map((item) => item.slot_index)).toEqual([1]);
    expect(plantedSlots.rows).toEqual([{ slot_index: 1, status: "growing" }]);
  });

  it("removes seed exchange while preserving gift redemption", async () => {
    const database = await createDatabase();
    await database.exec("SET ROLE service_role");
    await database.query(
      "INSERT INTO seed_inventory (user_id, seed_key, quantity) VALUES ($1, 'red-rose', 1)",
      [userId],
    );
    const gift = await database.query<{ id: string }>(
      "INSERT INTO game_gifts (gift_key, display_name, price_xu) VALUES ('gift-1', 'Quà thử', 10) RETURNING id",
    );
    await database.exec("RESET ROLE; SET ROLE authenticated");

    await expect(
      database.query("SELECT public.exchange_seed('red-rose', 'orchid', $1)", [idempotencyKey]),
    ).rejects.toThrow();
    const redeemed = await database.query<{ result: { balance: number; redemption_id: string } }>(
      "SELECT public.redeem_game_gift($1, $2) AS result",
      [gift.rows[0]!.id, "90000000-0000-4000-8000-000000000002"],
    );
    const retry = await database.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM gift_redemptions WHERE user_id = $1",
      [userId],
    );
    expect(redeemed.rows[0]?.result.balance).toBe(90);
    expect(retry.rows[0]?.count).toBe(1);
  });

  it("supports an audited administrator adjustment", async () => {
    const database = await createDatabase();
    await database.exec("RESET ROLE; SET ROLE service_role");
    await database.query("UPDATE dragon_wallets SET balance = 10000 WHERE user_id = $1", [userId]);
    await database.query(
      `INSERT INTO dragon_wallet_transactions
         (user_id, amount, transaction_type, reference, balance_after)
       VALUES ($1, 10000, 'admin_adjustment', 'test-wallet-credit:user-requested', 10000)`,
      [userId],
    );
    const balance = await database.query<{
      balance: number;
      amount: number;
      transaction_type: string;
    }>(
      `SELECT w.balance, t.amount, t.transaction_type
       FROM dragon_wallets w JOIN dragon_wallet_transactions t USING (user_id)
       WHERE w.user_id = $1`,
      [userId],
    );
    expect(balance.rows[0]).toEqual({
      balance: 10000,
      amount: 10000,
      transaction_type: "admin_adjustment",
    });
  });

  it("applies the unlocked pot bonus and refuses a second harvest of the same crop", async () => {
    const database = await createDatabase();
    await database.exec("SET ROLE service_role");
    await database.query("UPDATE learning_progress SET completed_lessons = 50 WHERE user_id = $1", [
      userId,
    ]);
    await database.query(
      `UPDATE garden_slots SET seed_key = 'red-rose', status = 'growing',
         planted_at = now() - interval '3 hours', ready_at = now() - interval '1 hour'
       WHERE user_id = $1 AND slot_index = 1`,
      [userId],
    );
    await database.exec("RESET ROLE; SET ROLE authenticated");
    const first = await database.query<{
      result: { results: Array<{ base_reward: number; reward: number }> };
    }>("SELECT public.harvest_crop(1, $1) AS result", [idempotencyKey]);
    const second = await database.query<{
      result: { results: Array<{ success: boolean; error: string }> };
    }>("SELECT public.harvest_crop(1, $1) AS result", ["90000000-0000-4000-8000-000000000003"]);
    const harvest = first.rows[0]!.result.results[0]!;
    expect(harvest.reward).toBe(Math.floor(harvest.base_reward * 1.22));
    expect(second.rows[0]?.result.results[0]).toMatchObject({ success: false, error: "empty" });
  });

  it("returns per-slot results from bulk harvest and writes one wallet ledger entry", async () => {
    const database = await createDatabase();
    await database.exec("SET ROLE service_role");
    await database.query(
      `UPDATE garden_slots SET seed_key = 'red-rose', status = 'growing',
         planted_at = now() - interval '3 hours', ready_at = now() - interval '1 hour'
       WHERE user_id = $1 AND slot_index = 1`,
      [userId],
    );
    await database.query(
      `UPDATE garden_slots SET seed_key = 'pear', status = 'growing',
         planted_at = now(), ready_at = now() + interval '2 days'
       WHERE user_id = $1 AND slot_index = 9`,
      [userId],
    );
    await database.exec("RESET ROLE; SET ROLE authenticated");
    const response = await database.query<{
      result: {
        results: Array<{ slot_index: number; success: boolean; error?: string }>;
        reward_total: number;
      };
    }>("SELECT public.harvest_crops(ARRAY[9, 1], $1) AS result", [idempotencyKey]);
    const ledger = await database.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM dragon_wallet_transactions WHERE user_id = $1",
      [userId],
    );
    expect(response.rows[0]?.result.results).toEqual([
      expect.objectContaining({ slot_index: 1, success: true }),
      { slot_index: 9, success: false, error: "not_ready" },
    ]);
    expect(response.rows[0]?.result.reward_total).toBeGreaterThanOrEqual(9);
    expect(ledger.rows[0]?.count).toBe(1);
  });

  it("denies game RPCs to anonymous users and internal helpers to authenticated users", async () => {
    const database = await createDatabase();
    await database.exec("RESET ROLE; SET ROLE anon");
    await expect(
      database.query("SELECT public.purchase_seed('red-rose', 1, $1)", [idempotencyKey]),
    ).rejects.toThrow();
    await expect(
      database.query("SELECT public.purchase_fertilizer('growth', 1, $1)", [idempotencyKey]),
    ).rejects.toThrow();
    await database.exec("RESET ROLE; SET ROLE authenticated");
    await expect(
      database.query("SELECT public._claim_game_action('purchase_seed', $1)", [idempotencyKey]),
    ).rejects.toThrow();
  });

  it("allows trusted lesson sync and prevents users from changing their own pot tier", async () => {
    const database = await createDatabase();
    await expect(
      database.query("SELECT public.sync_learning_progress($1, 50, 'lesson-provider')", [userId]),
    ).rejects.toThrow();
    await database.exec("RESET ROLE; SET ROLE service_role");
    await database.query("SELECT public.sync_learning_progress($1, 50, 'lesson-provider')", [
      userId,
    ]);
    await database.exec("RESET ROLE; SET ROLE authenticated");
    const result = await database.query<{ completed_lessons: number }>(
      "SELECT completed_lessons FROM learning_progress WHERE user_id = $1",
      [userId],
    );
    expect(result.rows[0]?.completed_lessons).toBe(50);
  });

  it("creates a server-priced topup and credits a matching SePay event only once", async () => {
    const database = await createDatabase();
    const topup = await database.query<{
      result: { topup_id: string; payment_code: string; amount_vnd: number; xu_amount: number };
    }>("SELECT public.create_wallet_topup('xu-10000', $1) AS result", [idempotencyKey]);
    const order = topup.rows[0]!.result;
    const topupRetry = await database.query<{ result: typeof order }>(
      "SELECT public.create_wallet_topup('xu-10000', $1) AS result",
      [idempotencyKey],
    );
    expect(order).toMatchObject({ amount_vnd: 100000, xu_amount: 10000 });
    expect(order.payment_code).toMatch(/^DRAGON[0-9A-F]{12}$/);
    expect(topupRetry.rows[0]?.result).toEqual(order);

    await database.exec("RESET ROLE; SET ROLE service_role");
    const payload = {
      id: 712345,
      transferType: "in",
      transferAmount: 100000,
      code: order.payment_code,
      referenceCode: "FT-SEPAY-712345",
    };
    const first = await database.query<{ result: { status: string; duplicate: boolean } }>(
      `SELECT public.process_sepay_topup($1, $2, $3, $4, $5, $6, $7) AS result`,
      [
        payload.id,
        payload.code,
        payload.transferType,
        payload.transferAmount,
        payload.referenceCode,
        "TEST-ACCOUNT",
        "TEST-ACCOUNT",
      ],
    );
    const retry = await database.query<{ result: { status: string; duplicate: boolean } }>(
      `SELECT public.process_sepay_topup($1, $2, $3, $4, $5, $6, $7) AS result`,
      [
        payload.id,
        payload.code,
        payload.transferType,
        payload.transferAmount,
        payload.referenceCode,
        "TEST-ACCOUNT",
        "TEST-ACCOUNT",
      ],
    );
    const state = await database.query<{
      balance: number;
      status: string;
      transactions: number;
      events: number;
    }>(
      `
      SELECT dragon_wallets.balance, wallet_topups.status,
             (SELECT count(*)::int FROM dragon_wallet_transactions WHERE transaction_type = 'topup') AS transactions,
             (SELECT count(*)::int FROM sepay_webhook_events) AS events
      FROM dragon_wallets
      JOIN wallet_topups ON wallet_topups.user_id = dragon_wallets.user_id
      WHERE dragon_wallets.user_id = $1 AND wallet_topups.id = $2
    `,
      [userId, order.topup_id],
    );
    expect(first.rows[0]?.result).toMatchObject({ status: "credited", duplicate: false });
    expect(retry.rows[0]?.result).toMatchObject({ status: "duplicate", duplicate: true });
    expect(state.rows[0]).toEqual({ balance: 10100, status: "paid", transactions: 1, events: 1 });
  });

  it("does not credit outgoing, unknown-code, or amount-mismatched transfers", async () => {
    const database = await createDatabase();
    const topup = await database.query<{ result: { topup_id: string; payment_code: string } }>(
      "SELECT public.create_wallet_topup('xu-10000', $1) AS result",
      [idempotencyKey],
    );
    const order = topup.rows[0]!.result;
    await expect(
      database.query(
        "SELECT public.process_sepay_topup(800001, $1, 'in', 100000, NULL, 'TEST-ACCOUNT', 'TEST-ACCOUNT')",
        [order.payment_code],
      ),
    ).rejects.toThrow();
    await expect(
      database.query("UPDATE wallet_topups SET status = 'paid' WHERE id = $1", [order.topup_id]),
    ).rejects.toThrow();
    await database.exec("RESET ROLE; SET ROLE service_role");
    const process = async (id: number, code: string | null, type: string, amount: number) =>
      database.query<{ result: { status: string } }>(
        "SELECT public.process_sepay_topup($1, $2, $3, $4, NULL, $5, 'TEST-ACCOUNT') AS result",
        [id, code, type, amount, "TEST-ACCOUNT"],
      );
    await process(712346, order.payment_code, "out", 100000);
    await process(712347, "DRAGONUNKNOWN000", "in", 100000);
    await process(712348, order.payment_code, "in", 99000);
    const state = await database.query<{
      balance: number;
      status: string;
      credited: number;
      events: number;
    }>(
      `
      SELECT dragon_wallets.balance, wallet_topups.status,
             (SELECT count(*)::int FROM dragon_wallet_transactions WHERE transaction_type = 'topup') AS credited,
             (SELECT count(*)::int FROM sepay_webhook_events) AS events
      FROM dragon_wallets
      JOIN wallet_topups ON wallet_topups.user_id = dragon_wallets.user_id
      WHERE dragon_wallets.user_id = $1 AND wallet_topups.id = $2
    `,
      [userId, order.topup_id],
    );
    expect(state.rows[0]).toEqual({ balance: 100, status: "review", credited: 0, events: 3 });
  });

  it("expires an overdue order without crediting Xu", async () => {
    const database = await createDatabase();
    const topup = await database.query<{ result: { topup_id: string; payment_code: string } }>(
      "SELECT public.create_wallet_topup('xu-10000', $1) AS result",
      [idempotencyKey],
    );
    const order = topup.rows[0]!.result;
    await database.exec("RESET ROLE; SET ROLE service_role");
    await database.query(
      "UPDATE wallet_topups SET expires_at = now() - interval '1 second' WHERE id = $1",
      [order.topup_id],
    );
    const response = await database.query<{ result: { status: string; credited: boolean } }>(
      "SELECT public.process_sepay_topup(712349, $1, 'in', 100000, NULL, 'TEST-ACCOUNT', 'TEST-ACCOUNT') AS result",
      [order.payment_code],
    );
    const state = await database.query<{ balance: number; status: string; credited: number }>(
      `
      SELECT dragon_wallets.balance, wallet_topups.status,
             (SELECT count(*)::int FROM dragon_wallet_transactions WHERE transaction_type = 'topup') AS credited
      FROM dragon_wallets JOIN wallet_topups USING (user_id)
      WHERE dragon_wallets.user_id = $1 AND wallet_topups.id = $2
    `,
      [userId, order.topup_id],
    );
    expect(response.rows[0]?.result).toEqual({
      status: "expired",
      duplicate: false,
      credited: false,
    });
    expect(state.rows[0]).toEqual({ balance: 100, status: "expired", credited: 0 });
  });

  it("does not credit a transfer received in a different bank account", async () => {
    const database = await createDatabase();
    const topup = await database.query<{ result: { topup_id: string; payment_code: string } }>(
      "SELECT public.create_wallet_topup('xu-10000', $1) AS result",
      [idempotencyKey],
    );
    const order = topup.rows[0]!.result;
    await database.exec("RESET ROLE; SET ROLE service_role");
    const result = await database.query<{ result: { status: string; credited: boolean } }>(
      "SELECT public.process_sepay_topup(712350, $1, 'in', 100000, NULL, 'OTHER-ACCOUNT', 'TEST-ACCOUNT') AS result",
      [order.payment_code],
    );
    const state = await database.query<{ balance: number; status: string; outcome: string }>(
      `
      SELECT dragon_wallets.balance, wallet_topups.status, sepay_webhook_events.outcome
      FROM dragon_wallets
      JOIN wallet_topups ON wallet_topups.user_id = dragon_wallets.user_id
      JOIN sepay_webhook_events ON sepay_webhook_events.topup_id = wallet_topups.id
      WHERE dragon_wallets.user_id = $1 AND wallet_topups.id = $2
    `,
      [userId, order.topup_id],
    );
    expect(result.rows[0]?.result).toMatchObject({
      status: "review_receiving_account_mismatch",
      credited: false,
    });
    expect(state.rows[0]).toEqual({
      balance: 100,
      status: "pending",
      outcome: "review_receiving_account_mismatch",
    });
  });
});
