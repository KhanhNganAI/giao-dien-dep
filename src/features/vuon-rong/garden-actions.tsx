import { useState } from "react";
import { Coins, LoaderCircle, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { seedGrowthLabel, seedNames, type Seed } from "./seed-catalog";

export function GardenActions({
  seeds,
  inventory,
  selectedSeedKey,
  onSelectSeed,
  onBuy,
  onExchange,
  onPlantAll,
  onHarvestAll,
  busy,
}: {
  seeds: Seed[];
  inventory: Record<string, number>;
  selectedSeedKey: string;
  onSelectSeed: (key: string) => void;
  onBuy: (seedKey: string, quantity: number) => void;
  onExchange: (from: string, to: string) => void;
  onPlantAll: () => void;
  onHarvestAll: () => void;
  busy: boolean;
}) {
  const [quantity, setQuantity] = useState(1);
  const [exchangeTo, setExchangeTo] = useState("");
  const selectedSeed = seeds.find((seed) => seed.seed_key === selectedSeedKey);
  return (
    <section className="rounded-xl border border-amber-300/20 bg-slate-950/85 p-4 shadow-xl backdrop-blur-md sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <label
            htmlFor="garden-seed"
            className="text-xs font-semibold uppercase tracking-wide text-slate-400"
          >
            Kho giống
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <select
              id="garden-seed"
              value={selectedSeedKey}
              onChange={(event) => onSelectSeed(event.target.value)}
              className="min-h-11 flex-1 rounded-md border border-white/15 bg-slate-900 px-3 text-sm text-white outline-none focus:border-amber-300"
            >
              {seeds.map((seed) => (
                <option key={seed.seed_key} value={seed.seed_key}>
                  {seedNames[seed.seed_key as keyof typeof seedNames] ?? seed.display_name} ·{" "}
                  {seed.price_xu} Xu · {seedGrowthLabel(seed)} · thu {seed.reward_min}–
                  {seed.reward_max}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                aria-label="Số lượng hạt cần mua"
                type="number"
                min={1}
                max={99}
                value={quantity}
                onChange={(event) =>
                  setQuantity(Math.max(1, Math.min(99, Number(event.target.value) || 1)))
                }
                className="h-11 w-20 rounded-md border border-white/15 bg-slate-900 px-3 text-sm text-white"
              />
              <Button
                variant="dragon"
                disabled={busy || !selectedSeed}
                onClick={() => selectedSeed && onBuy(selectedSeed.seed_key, quantity)}
              >
                <Coins className="size-4" />
                Mua hạt
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Đang có: <b className="text-sky-200">{inventory[selectedSeedKey] ?? 0}</b> hạt · Chọn
            hạt rồi bấm ô trống để gieo. Ốc sên có thể làm cây lớn chậm thêm 10%.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 self-end">
          <Button
            variant="dragonOutline"
            disabled={busy || !((inventory[selectedSeedKey] ?? 0) > 0)}
            onClick={onPlantAll}
          >
            <Sprout className="size-4" />
            Gieo hàng loạt
          </Button>
          <Button variant="dragon" disabled={busy} onClick={onHarvestAll}>
            <Coins className="size-4" />
            Thu tất cả
          </Button>
        </div>
      </div>
      {seeds.length > 1 && (
        <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center">
          <span className="text-xs font-semibold text-slate-300">
            Đổi 1 hạt đang có sang loại khác:
          </span>
          <select
            aria-label="Đổi sang loại hạt"
            value={exchangeTo}
            onChange={(event) => setExchangeTo(event.target.value)}
            className="min-h-10 flex-1 rounded-md border border-white/15 bg-slate-900 px-3 text-xs text-white"
          >
            <option value="">Chọn hạt nhận</option>
            {seeds
              .filter((seed) => seed.seed_key !== selectedSeedKey)
              .map((seed) => (
                <option key={seed.seed_key} value={seed.seed_key}>
                  {seed.display_name}
                </option>
              ))}
          </select>
          <Button
            variant="dragonOutline"
            disabled={busy || !exchangeTo || (inventory[selectedSeedKey] ?? 0) < 1}
            onClick={() => onExchange(selectedSeedKey, exchangeTo)}
          >
            Đổi hạt
          </Button>
        </div>
      )}
      {busy && (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs text-sky-200">
          <LoaderCircle className="size-3 animate-spin" />
          Đang lưu thay đổi an toàn vào ví và khu vườn...
        </p>
      )}
    </section>
  );
}
