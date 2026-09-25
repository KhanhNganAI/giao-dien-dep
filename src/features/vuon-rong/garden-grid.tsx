import { Clock3, Snail, Sparkles } from "lucide-react";
import type { GardenSlot } from "./garden-api";
import { seedNames, type Seed } from "./seed-catalog";

type GardenGridProps = {
  slots: GardenSlot[];
  seeds: Seed[];
  lessons: number;
  now: number;
  inventory: Record<string, number>;
  selectedSeedKey: string;
  busy: boolean;
  onSlotClick: (slot: GardenSlot) => void;
};

function timeLeft(readyAt: string | null, now: number) {
  if (!readyAt) return "";
  const seconds = Math.max(0, Math.ceil((new Date(readyAt).getTime() - now) / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  if (days) return `${days} ngày ${hours} giờ`;
  if (hours) return `${hours} giờ ${minutes} phút`;
  return `${minutes} phút ${remainingSeconds.toString().padStart(2, "0")} giây`;
}

export function GardenGrid({
  slots,
  seeds,
  lessons,
  now,
  inventory,
  selectedSeedKey,
  busy,
  onSlotClick,
}: GardenGridProps) {
  const seedMap = new Map(seeds.map((seed) => [seed.seed_key, seed]));
  const potFilters: Array<[number, string]> = [
    [0, "none"],
    [4, "hue-rotate(95deg)"],
    [10, "hue-rotate(38deg)"],
    [18, "hue-rotate(165deg)"],
    [24, "hue-rotate(55deg)"],
    [40, "hue-rotate(300deg)"],
    [50, "none"],
  ];
  const potFilter = potFilters.filter(([threshold]) => lessons >= threshold).at(-1)?.[1] ?? "none";

  return (
    <section
      aria-label="12 ô vườn rồng"
      className="relative overflow-hidden rounded-xl border border-sky-300/20 bg-[#080c27]/60 p-2 shadow-2xl sm:p-5"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-75"
        style={{ backgroundImage: "url('/game/sky-night.webp')" }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-sky-300/20 to-transparent" />
      <div className="relative grid grid-cols-3 gap-x-1 gap-y-5 sm:grid-cols-4 sm:gap-x-3 sm:gap-y-8">
        {slots.map((slot) => {
          const seed = slot.seed_key ? seedMap.get(slot.seed_key) : undefined;
          const selectedSeed = seedMap.get(selectedSeedKey);
          const rowRestricted =
            slot.status === "empty" &&
            Boolean(selectedSeed?.bottom_row_only) &&
            slot.slot_index < 9;
          const ready = slot.ready_at ? new Date(slot.ready_at).getTime() <= now : false;
          const planted = slot.status !== "empty" && seed;
          const stateText = ready
            ? "Sẵn sàng thu hoạch"
            : planted
              ? `Còn ${timeLeft(slot.ready_at, now)}`
              : "Ô trống";
          return (
            <button
              key={slot.slot_index}
              type="button"
              disabled={busy || (!planted && !selectedSeedKey) || rowRestricted}
              onClick={() => onSlotClick(slot)}
              aria-label={`Ô ${slot.slot_index}: ${stateText}${seed ? `, ${seed.display_name}` : ""}`}
              className={`group relative flex min-h-36 flex-col items-center justify-end rounded-lg px-1 pb-1 pt-3 text-center transition duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-wait sm:min-h-44 ${ready ? "drop-shadow-[0_0_16px_rgba(250,204,21,.55)]" : ""}`}
            >
              <span
                className="absolute inset-x-0 bottom-0 h-20 bg-no-repeat opacity-95"
                style={{
                  backgroundImage: "url('/game/cloud-row.webp')",
                  backgroundSize: "300% 100%",
                  backgroundPosition: `${((slot.slot_index - 1) % 3) * 50}% bottom`,
                }}
              />
              <span className="relative z-10 mb-1 flex min-h-14 items-end justify-center">
                {planted ? (
                  <img
                    src="/game/bud.webp"
                    alt=""
                    className={`h-16 w-auto object-contain drop-shadow-lg sm:h-20 ${ready ? "animate-bounce" : ""}`}
                  />
                ) : (
                  <span className="mb-2 rounded-full bg-slate-950/55 px-3 py-1 text-[11px] text-slate-300">
                    Gieo hạt
                  </span>
                )}
              </span>
              <img
                src="/game/pot.webp"
                alt=""
                title="Chậu nâng cấp theo tiến độ học"
                className="relative z-10 -mt-1 h-12 w-16 object-contain transition-[filter] duration-500 sm:h-14 sm:w-20"
                style={{ filter: potFilter }}
              />
              <span className="relative z-10 mt-1 flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-1 text-[10px] font-semibold text-slate-100 sm:text-xs">
                Ô {slot.slot_index} ·{" "}
                {seed
                  ? (seedNames[seed.seed_key as keyof typeof seedNames] ?? seed.display_name)
                  : selectedSeedKey
                    ? "Gieo cây"
                    : "Trống"}
              </span>
              <span
                className={`relative z-10 mt-1 flex min-h-4 items-center gap-1 text-[9px] sm:text-[10px] ${ready ? "font-bold text-amber-200" : "text-sky-100/80"}`}
              >
                {ready ? (
                  <Sparkles className="size-3" />
                ) : slot.snail_attacked ? (
                  <Snail className="size-3 text-orange-300" />
                ) : planted ? (
                  <Clock3 className="size-3" />
                ) : null}
                {slot.snail_attacked && !ready ? "Ốc sên · " : ""}
                {stateText}
              </span>
              {ready && (
                <span className="relative z-10 mt-1 rounded-full bg-amber-300 px-2 py-0.5 text-[9px] font-bold text-slate-950">
                  BẤM ĐỂ THU
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
