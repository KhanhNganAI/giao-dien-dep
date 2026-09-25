import { BookOpen, CircleCheck, Gift, Sprout } from "lucide-react";
import type { GameGift, GardenSlot, SeedStack } from "./garden-api";
import type { Seed } from "./seed-catalog";

const pots = [
  [0, "Chậu Đất Nung", 5],
  [4, "Chậu Sứ Trắng", 8],
  [10, "Chậu Đá Hoa", 10],
  [18, "Chậu Đồng Cổ", 13],
  [24, "Chậu Vàng Ngọc", 15],
  [40, "Chậu Ốc Đảo Nhiệt Đới", 18],
  [50, "Chậu Vũ Trụ", 22],
] as const;

export function GardenSidebar({
  lessons,
  slots,
  inventory,
  seeds,
  gifts,
  now,
  onRedeem,
}: {
  lessons: number;
  slots: GardenSlot[];
  inventory: SeedStack[];
  seeds: Seed[];
  gifts: GameGift[];
  now: number;
  onRedeem: (id: string) => void;
}) {
  const unlocked = pots.filter(([threshold]) => lessons >= threshold);
  const currentPot = unlocked[unlocked.length - 1];
  const seedByKey = new Map(seeds.map((seed) => [seed.seed_key, seed.display_name]));
  const inventoryTotal = inventory.reduce((sum, stack) => sum + stack.quantity, 0);
  const statusLabel = (slot: GardenSlot) =>
    slot.status === "empty"
      ? "Ô trống"
      : slot.ready_at && now >= new Date(slot.ready_at).getTime()
        ? "Có thể thu hoạch"
        : "Đang lớn";

  return (
    <aside className="space-y-4">
      <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4 shadow-xl backdrop-blur-md">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-sky-100">
          <BookOpen className="size-5 text-sky-300" />
          Tiến độ học tập
        </h2>
        <p className="mt-1 text-xs text-slate-400">{lessons} bài đã hoàn thành</p>
        <div className="mt-4 space-y-2">
          {pots.map(([threshold, name, bonus]) => {
            const open = lessons >= threshold;
            return (
              <div
                key={threshold}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs ${open ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-white/5 text-slate-500"}`}
              >
                <CircleCheck
                  className={`size-4 shrink-0 ${open ? "text-emerald-400" : "text-slate-600"}`}
                />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span>+{bonus}%</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 rounded-md bg-sky-500/10 p-2 text-xs text-sky-100">
          Chậu hiện tại: <b>{currentPot?.[1]}</b> · Thưởng thu hoạch +{currentPot?.[2]}%
        </p>
      </section>

      <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4 shadow-xl backdrop-blur-md">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-sky-100">
          <Sprout className="size-5 text-emerald-300" />
          Vườn của bạn
        </h2>
        <p className="mt-1 text-xs text-slate-400">{inventoryTotal} hạt giống trong kho</p>
        <div className="mt-3 max-h-64 space-y-1 overflow-auto pr-1">
          {slots.map((slot) => (
            <div
              key={slot.slot_index}
              className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 text-xs"
            >
              <span className="text-slate-300">
                Ô {slot.slot_index}
                {slot.seed_key ? ` · ${seedByKey.get(slot.seed_key) ?? slot.seed_key}` : ""}
              </span>
              <span className={slot.status === "empty" ? "text-slate-500" : "text-sky-200"}>
                {statusLabel(slot)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4 shadow-xl backdrop-blur-md">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-sky-100">
          <Gift className="size-5 text-amber-300" />
          Quà trong vườn
          <img src="/game/pumpkin.webp" alt="" className="ml-auto size-7 object-contain" />
        </h2>
        {gifts.length ? (
          <div className="mt-3 space-y-2">
            {gifts.map((gift) => (
              <div key={gift.id} className="flex items-center justify-between gap-2 text-xs">
                <span>
                  {gift.display_name} · {gift.price_xu.toLocaleString("vi-VN")} Xu
                </span>
                <button
                  type="button"
                  className="rounded border border-amber-300/40 px-2 py-1 text-amber-200"
                  onClick={() => onRedeem(gift.id)}
                >
                  Đổi quà
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Danh mục quà sẽ được mở khi Dragon công bố phần thưởng.
          </p>
        )}
      </section>
    </aside>
  );
}
