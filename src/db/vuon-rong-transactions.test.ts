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

  it("prevents premium crops in the upper rows and consumes inventory only when planting succeeds", async () => {
    const database = await createDatabase();
    await database.exec("SET ROLE service_role");
    await database.query(
      "INSERT INTO seed_inventory (user_id, seed_key, quantity) VALUES ($1, 'orchid', 1)",
      [userId],
    );
    await database.exec("RESET ROLE; SET ROLE authenticated");

    await expect(
      database.query("SELECT public.plant_crop(1, 'orchid', $1)", [idempotencyKey]),
    ).rejects.toThrow(/bottom row/i);
    const inventory = await database.query<{ quantity: number }>(
      "SELECT quantity FROM seed_inventory WHERE user_id = $1 AND seed_key = 'orchid'",
      [userId],
    );
    expect(inventory.rows[0]?.quantity).toBe(1);

    const planted = await database.query<{
      result: { slot_index: number; snail_attacked: boolean };
    }>("SELECT public.plant_crop(9, 'orchid', $1) AS result", [idempotencyKey]);
    const retry = await database.query<{ result: { slot_index: number; snail_attacked: boolean } }>(
      "SELECT public.plant_crop(9, 'orchid', $1) AS result",
      [idempotencyKey],
    );
    const slot = await database.query<{ ready_at: Date; planted_at: Date; status: string }>(
      "SELECT ready_at, planted_at, status FROM garden_slots WHERE user_id = $1 AND slot_index = 9",
      [userId],
    );
    const growthHours =
      (slot.rows[0]!.ready_at.getTime() - slot.rows[0]!.planted_at.getTime()) / 3_600_000;
    expect(planted.rows[0]?.result.slot_index).toBe(9);
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

  it("exchanges seeds at catalog prices and redeems a gift in one wallet transaction", async () => {
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

    const exchanged = await database.query<{ result: { balance: number; wallet_delta: number } }>(
      "SELECT public.exchange_seed('red-rose', 'orchid', $1) AS result",
      [idempotencyKey],
    );
    const redeemed = await database.query<{ result: { balance: number; redemption_id: string } }>(
      "SELECT public.redeem_game_gift($1, $2) AS result",
      [gift.rows[0]!.id, "90000000-0000-4000-8000-000000000002"],
    );
    const retry = await database.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM gift_redemptions WHERE user_id = $1",
      [userId],
    );
    expect(exchanged.rows[0]?.result).toEqual({
      balance: 75,
      from_seed: "red-rose",
      to_seed: "orchid",
      wallet_delta: -25,
      from_quantity: 0,
    });
    expect(redeemed.rows[0]?.result.balance).toBe(65);
    expect(retry.rows[0]?.count).toBe(1);
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
      database.query("SELECT public.process_sepay_topup(800001, $1, 'in', 100000, NULL, 'TEST-ACCOUNT', 'TEST-ACCOUNT')", [
        order.payment_code,
      ]),
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
    const state = await database.query<{ balance: number; status: string; outcome: string }>(`
      SELECT dragon_wallets.balance, wallet_topups.status, sepay_webhook_events.outcome
      FROM dragon_wallets
      JOIN wallet_topups ON wallet_topups.user_id = dragon_wallets.user_id
      JOIN sepay_webhook_events ON sepay_webhook_events.topup_id = wallet_topups.id
      WHERE dragon_wallets.user_id = $1 AND wallet_topups.id = $2
    `, [userId, order.topup_id]);
    expect(result.rows[0]?.result).toMatchObject({ status: "review_receiving_account_mismatch", credited: false });
    expect(state.rows[0]).toEqual({ balance: 100, status: "pending", outcome: "review_receiving_account_mismatch" });
  });
});
