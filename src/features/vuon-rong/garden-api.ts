import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Seed } from "./seed-catalog";

export type GardenSlot = Tables<"garden_slots">;
export type SeedStack = Tables<"seed_inventory">;
export type GameGift = Tables<"game_gifts">;
export type GardenSnapshot = {
  slots: GardenSlot[];
  inventory: SeedStack[];
  seeds: Seed[];
  gifts: GameGift[];
  completedLessons: number;
};

export async function loadGarden(): Promise<GardenSnapshot> {
  const [slots, inventory, seeds, gifts, progress] = await Promise.all([
    supabase.from("garden_slots").select("*").order("slot_index"),
    supabase.from("seed_inventory").select("*"),
    supabase.from("seed_catalog").select("*").eq("active", true),
    supabase.from("game_gifts").select("*").eq("active", true),
    supabase.from("learning_progress").select("completed_lessons").maybeSingle(),
  ]);
  const firstError = slots.error ?? inventory.error ?? seeds.error ?? gifts.error ?? progress.error;
  if (firstError) throw firstError;
  return {
    slots: slots.data ?? [],
    inventory: inventory.data ?? [],
    seeds: seeds.data ?? [],
    gifts: gifts.data ?? [],
    completedLessons: progress.data?.completed_lessons ?? 0,
  };
}

async function gameRpc(
  name:
    | "purchase_seed"
    | "plant_crop"
    | "plant_crops"
    | "harvest_crop"
    | "harvest_crops"
    | "exchange_seed"
    | "redeem_game_gift",
  args: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(name, args as never);
  if (error) throw error;
  return data;
}

export const buySeeds = (seedKey: string, quantity: number) =>
  gameRpc("purchase_seed", {
    p_seed_key: seedKey,
    p_quantity: quantity,
    p_idempotency_key: crypto.randomUUID(),
  });
export const plant = (slotIndex: number, seedKey: string) =>
  gameRpc("plant_crop", {
    p_slot_index: slotIndex,
    p_seed_key: seedKey,
    p_idempotency_key: crypto.randomUUID(),
  });
export const plantMany = (slotIndices: number[], seedKey: string) =>
  gameRpc("plant_crops", {
    p_slot_indices: slotIndices,
    p_seed_key: seedKey,
    p_idempotency_key: crypto.randomUUID(),
  });
export const harvest = (slotIndex: number) =>
  gameRpc("harvest_crop", {
    p_slot_index: slotIndex,
    p_idempotency_key: crypto.randomUUID(),
  });
export const harvestAll = (slotIndices: number[]) =>
  gameRpc("harvest_crops", {
    p_slot_indices: slotIndices,
    p_idempotency_key: crypto.randomUUID(),
  });
export const exchangeSeed = (from: string, to: string) =>
  gameRpc("exchange_seed", {
    p_from_seed: from,
    p_to_seed: to,
    p_idempotency_key: crypto.randomUUID(),
  });
export const redeemGift = (giftId: string) =>
  gameRpc("redeem_game_gift", {
    p_gift_id: giftId,
    p_idempotency_key: crypto.randomUUID(),
  });
