import { Clock3, Snail, Sparkles } from "lucide-react";
import type { GardenSlot } from "./garden-api";
import { seedNames, type Seed } from "./seed-catalog";
import { getPotTier } from "./pot-tiers";

const matureCropImages: Record<string, string> = {
  "red-rose": "/game/mature/red-rose.png",
  "purple-flower": "/game/mature/purple-flower.png",
  "yellow-rose": "/game/mature/yellow-rose.png",
  apple: "/game/mature/apple.png",
  pear: "/game/mature/pear.png",
  "purple-rose": "/game/mature/purple-rose.png",
  orchid: "/game/mature/orchid.png",
};

type GardenGridProps = {
  slots: GardenSlot[];
  seeds: Seed[];
  lessons: number;
  now: number;
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

export function GardenGrid({ slots, seeds, lessons, now, busy, onSlotClick }: GardenGridProps) {
  const seedMap = new Map(seeds.map((seed) => [seed.seed_key, seed]));
  const pot = getPotTier(lessons);

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
      <div className="relative grid grid-cols-6 gap-x-0.5 gap-y-5 sm:gap-x-2 sm:gap-y-7 lg:gap-x-3 lg:gap-y-8">
        {slots.map((slot) => {
          const seed = slot.seed_key ? seedMap.get(slot.seed_key) : undefined;
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
              disabled={busy}
              onClick={() => onSlotClick(slot)}
              aria-label={`Ô ${slot.slot_index}: ${stateText}${seed ? `, ${seed.display_name}` : ""}`}
              className={`group relative flex min-h-28 min-w-0 flex-col items-center justify-end rounded-lg px-0 pb-1 pt-3 text-center transition duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-wait sm:min-h-36 sm:px-1 lg:min-h-44 ${ready ? "drop-shadow-[0_0_16px_rgba(250,204,21,.55)]" : ""}`}
            >
              <span
                className="absolute inset-x-0 bottom-0 h-20 bg-no-repeat opacity-95"
                style={{
                  backgroundImage: "url('/game/cloud-row.webp')",
                  backgroundSize: "300% 100%",
                  backgroundPosition: `${((slot.slot_index - 1) % 3) * 50}% bottom`,
                }}
              />
              <span className="relative z-10 mb-1 flex min-h-8 max-w-full items-end justify-center sm:min-h-14">
                {planted ? (
                  <img
                    src={
                      ready && seed
                        ? (matureCropImages[seed.seed_key] ?? "/game/bud.webp")
                        : "/game/bud.webp"
                    }
                    alt=""
                    className={`h-[clamp(1.25rem,9vw,5rem)] max-w-full w-auto object-contain drop-shadow-lg ${ready ? "animate-bounce" : ""}`}
                  />
                ) : (
                  <span className="mb-2 rounded-full bg-slate-950/55 px-1 py-1 text-[7px] leading-tight text-slate-300 sm:px-3 sm:text-[11px]">
                    Gieo hạt
                  </span>
                )}
              </span>
              <img
                src={pot.image}
                alt={pot.name}
                title={`${pot.name} · cây lớn nhanh hơn ${pot.growthBonus}%`}
                className="relative z-10 -mt-1 h-[clamp(1.5rem,8vw,3.5rem)] w-[clamp(1.75rem,9vw,5rem)] max-w-full object-contain transition-transform duration-500"
              />
              <span className="relative z-10 mt-1 flex max-w-full flex-wrap items-center justify-center gap-x-0.5 rounded-full bg-slate-950/70 px-0.5 py-1 text-[7px] font-semibold leading-tight text-slate-100 sm:gap-1 sm:px-2 sm:text-xs">
                Ô {slot.slot_index} ·{" "}
                {seed
                  ? (seedNames[seed.seed_key as keyof typeof seedNames] ?? seed.display_name)
                  : "Trống"}
              </span>
              <span
                className={`relative z-10 mt-1 flex min-h-4 max-w-full flex-wrap items-center justify-center gap-x-0.5 text-center text-[7px] leading-tight sm:gap-1 sm:text-[10px] ${ready ? "font-bold text-amber-200" : "text-sky-100/80"}`}
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
