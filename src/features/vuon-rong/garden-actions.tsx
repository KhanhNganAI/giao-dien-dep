import { LoaderCircle, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { seedGrowthLabel, seedNames, type Seed } from "./seed-catalog";

export function GardenActions({
  seeds,
  inventory,
  selectedSeedKey,
  onSelectSeed,
  onPlantAll,
  onHarvestAll,
  busy,
}: {
  seeds: Seed[];
  inventory: Record<string, number>;
  selectedSeedKey: string;
  onSelectSeed: (key: string) => void;
  onPlantAll: () => void;
  onHarvestAll: () => void;
  busy: boolean;
}) {
  return (
    <section className="sticky bottom-2 z-20 rounded-xl border border-amber-300/25 bg-slate-950/90 p-3 shadow-2xl backdrop-blur-xl sm:p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <label htmlFor="garden-seed" className="text-xs font-semibold text-slate-300">
            Hạt dùng khi gieo hàng loạt
          </label>
          <select
            id="garden-seed"
            value={selectedSeedKey}
            onChange={(event) => onSelectSeed(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-md border border-white/15 bg-slate-900 px-3 text-sm text-white outline-none focus:border-amber-300"
          >
            {seeds.map((seed) => (
              <option key={seed.seed_key} value={seed.seed_key}>
                {seedNames[seed.seed_key as keyof typeof seedNames] ?? seed.display_name} · kho{" "}
                {inventory[seed.seed_key] ?? 0} · {seedGrowthLabel(seed)} · thu {seed.reward_min}–
                {seed.reward_max} Xu
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 self-end">
          <Button
            variant="dragonOutline"
            disabled={busy || !((inventory[selectedSeedKey] ?? 0) > 0)}
            onClick={onPlantAll}
          >
            <Sprout className="size-4" /> Gieo hàng loạt
          </Button>
          <Button variant="dragon" disabled={busy} onClick={onHarvestAll}>
            🌾 Thu tất cả
          </Button>
        </div>
      </div>
      {busy && (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs text-sky-200">
          <LoaderCircle className="size-3 animate-spin" />
          Đang lưu thay đổi an toàn vào ví và khu vườn...
        </p>
      )}
    </section>
  );
}
