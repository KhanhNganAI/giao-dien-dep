import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const databases: PGlite[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("Vườn Rồng shared Supabase schema", () => {
  it("creates twelve private garden slots and prevents direct wallet writes", async () => {
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

    const migrationPath = resolve("supabase/migrations/202609250001_vuon_rong_core.sql");
    await database.exec(readFileSync(migrationPath, "utf8"));

    const userA = "10000000-0000-4000-8000-000000000001";
    const userB = "20000000-0000-4000-8000-000000000002";
    await database.query(
      "INSERT INTO auth.users (id, email) VALUES ($1, 'a@example.test'), ($2, 'b@example.test')",
      [userA, userB],
    );

    const setupCounts = await database.query<{ user_id: string; slots: number; wallets: number }>(`
      SELECT profiles.id AS user_id,
             count(DISTINCT garden_slots.id)::int AS slots,
             count(DISTINCT dragon_wallets.id)::int AS wallets
      FROM profiles
      JOIN garden_slots ON garden_slots.user_id = profiles.id
      JOIN dragon_wallets ON dragon_wallets.user_id = profiles.id
      GROUP BY profiles.id
      ORDER BY profiles.id
    `);
    expect(setupCounts.rows).toEqual([
      { user_id: userA, slots: 12, wallets: 1 },
      { user_id: userB, slots: 12, wallets: 1 },
    ]);

    const seedRows = await database.query<{
      seed_key: string;
      price_xu: number;
      bottom_row_only: boolean;
    }>(`
      SELECT seed_key, price_xu, bottom_row_only
      FROM seed_catalog
      ORDER BY price_xu
    `);
    expect(seedRows.rows).toEqual([
      { seed_key: "red-rose", price_xu: 5, bottom_row_only: false },
      { seed_key: "purple-flower", price_xu: 8, bottom_row_only: false },
      { seed_key: "yellow-rose", price_xu: 12, bottom_row_only: false },
      { seed_key: "apple", price_xu: 15, bottom_row_only: true },
      { seed_key: "pear", price_xu: 20, bottom_row_only: true },
      { seed_key: "purple-rose", price_xu: 25, bottom_row_only: true },
      { seed_key: "orchid", price_xu: 30, bottom_row_only: true },
    ]);

    await database.exec("SET ROLE authenticated");
    await database.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userA]);
    const visibleSlots = await database.query<{ user_id: string }>(
      "SELECT DISTINCT user_id FROM garden_slots ORDER BY user_id",
    );
    expect(visibleSlots.rows).toEqual([{ user_id: userA }]);
    await expect(
      database.query("UPDATE dragon_wallets SET balance = 999999 WHERE user_id = $1", [userA]),
    ).rejects.toThrow();
    await expect(
      database.query(
        `INSERT INTO dragon_wallet_transactions (user_id, amount, transaction_type, balance_after)
         VALUES ($1, 1, 'harvest', 1)`,
        [userA],
      ),
    ).rejects.toThrow();
  });
});
