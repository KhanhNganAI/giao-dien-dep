import type { Tables } from "@/integrations/supabase/types";

export type Seed = Tables<"seed_catalog">;
export const seedOrder = [
  "red-rose",
  "purple-flower",
  "yellow-rose",
  "apple",
  "pear",
  "purple-rose",
  "orchid",
] as const;

export const seedNames: Record<(typeof seedOrder)[number], string> = {
  "red-rose": "Hồng Đỏ",
  "purple-flower": "Hoa Tím",
  "yellow-rose": "Hồng Vàng",
  apple: "Táo",
  pear: "Lê",
  "purple-rose": "Hồng Tím",
  orchid: "Phong Lan",
};

export function seedRewardLabel(seed: Seed) {
  return `${seed.reward_min}–${seed.reward_max} Xu`;
}

export function seedGrowthLabel(seed: Seed) {
  const hours = seed.growth_seconds / 3600;
  if (hours >= 24) return `${hours / 24} ngày`;
  return `${hours} giờ`;
}
