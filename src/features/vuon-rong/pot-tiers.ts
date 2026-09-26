export const potTiers = [
  { lessons: 0, name: "Địa Long Thổ Chậu", growthBonus: 5, image: "/game/pots/pot-1.png" },
  { lessons: 4, name: "Mộc Long Phong Chậu", growthBonus: 8, image: "/game/pots/pot-2.png" },
  { lessons: 10, name: "Thanh Long Kim Chậu", growthBonus: 10, image: "/game/pots/pot-3.png" },
  { lessons: 18, name: "Bạch Long Thuỷ Chậu", growthBonus: 13, image: "/game/pots/pot-4.png" },
  { lessons: 24, name: "Hoả Long Nhiệt Chậu", growthBonus: 15, image: "/game/pots/pot-5.png" },
  { lessons: 32, name: "Càn Long Thiên Chậu", growthBonus: 18, image: "/game/pots/pot-6.png" },
  { lessons: 40, name: "Báu Long Bảo Chậu", growthBonus: 20, image: "/game/pots/pot-7.png" },
  { lessons: 50, name: "Thần Long Tuyệt Chậu", growthBonus: 22, image: "/game/pots/pot-8.png" },
] as const;

export function getPotTier(lessons: number) {
  return potTiers.filter((tier) => lessons >= tier.lessons).at(-1) ?? potTiers[0];
}
