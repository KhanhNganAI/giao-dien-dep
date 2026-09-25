import { useState } from "react";
import { Archive, Flower2, Leaf, Sparkles, Sprout, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { seedGrowthLabel, seedNames, seedOrder, type Seed } from "./seed-catalog";

type FertilizerType = "growth" | "bloom";

export function GardenStore({
  seeds,
  inventory,
  fertilizerInventory,
  busy,
  error,
  onBuySeed,
  onBuyFertilizer,
}: {
  seeds: Seed[];
  inventory: Record<string, number>;
  fertilizerInventory: Record<FertilizerType, number>;
  busy: boolean;
  error: string | null;
  onBuySeed: (key: string, quantity: number) => void;
  onBuyFertilizer: (type: FertilizerType, quantity: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const orderedSeeds = [...seeds].sort(
    (a, b) =>
      seedOrder.indexOf(a.seed_key as (typeof seedOrder)[number]) -
      seedOrder.indexOf(b.seed_key as (typeof seedOrder)[number]),
  );
  const purchaseButtons = (buy: (quantity: number) => void, label: string) => (
    <div className="flex shrink-0 gap-2">
      {[1, 5].map((quantity) => (
        <Button
          key={quantity}
          type="button"
          size="sm"
          variant="dragonOutline"
          aria-label={`Mua +${quantity} ${label}`}
          disabled={busy}
          onClick={() => buy(quantity)}
        >
          +{quantity}
        </Button>
      ))}
    </div>
  );
  const renderSeed = (seed: Seed) => {
    const quantity = inventory[seed.seed_key] ?? 0;
    const capacity = seed.bottom_row_only ? 6 : 12;
    const icon =
      seed.seed_key === "red-rose"
        ? "🌹"
        : seed.seed_key === "purple-flower"
          ? "💜"
          : seed.seed_key === "yellow-rose"
            ? "🌼"
            : seed.seed_key === "apple"
              ? "🍎"
              : seed.seed_key === "pear"
                ? "🍐"
                : seed.seed_key === "purple-rose"
                  ? "🪻"
                  : "🌸";
    const name = seedNames[seed.seed_key as keyof typeof seedNames] ?? seed.display_name;
    return (
      <article
        key={seed.seed_key}
        className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-900/80 p-3 sm:p-4"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-800 text-xl">
            {icon}
          </span>
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 font-semibold text-slate-100">
              {name}
              {seed.bottom_row_only && (
                <span className="text-xs text-amber-300">· chỉ hàng dưới</span>
              )}
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {seed.price_xu} Xu/hạt · {seedGrowthLabel(seed)} · lời{" "}
              <b className="text-emerald-300">
                +{seed.reward_min - seed.price_xu}–{seed.reward_max - seed.price_xu}
              </b>
              /cây · {capacity} chậu thu tối đa {capacity * seed.reward_max} Xu · kho còn{" "}
              <b className="text-slate-100">{quantity}</b>
            </p>
          </div>
        </div>
        {purchaseButtons((amount) => onBuySeed(seed.seed_key, amount), `hạt ${name}`)}
      </article>
    );
  };

  return (
    <>
      <Button
        variant="dragonOutline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Kho giống"
      >
        <Archive className="size-4" /> Kho giống
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden border-sky-200/20 bg-slate-950 p-0 text-white">
          <DialogHeader className="shrink-0 border-b border-white/10 px-5 py-4 text-left sm:px-6">
            <DialogTitle className="flex items-center gap-2 font-display text-xl text-sky-100">
              <Archive className="size-5" /> Kho giống
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Mua theo lô — trừ Xu một lần, để dành trồng dần hoặc gieo hàng loạt.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-rose-400/30 bg-rose-950/60 p-3 text-sm text-rose-100"
              >
                {error}
              </p>
            )}
            <section aria-labelledby="fertilizer-heading" className="space-y-2">
              <div>
                <h2
                  id="fertilizer-heading"
                  className="flex items-center gap-2 font-semibold text-sky-200"
                >
                  <Leaf className="size-4" /> Phân bón
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Mua sẵn để dùng cho cây đang lớn trong vườn.
                </p>
              </div>
              <article className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-900/80 p-3 sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-800 text-amber-300">
                    <Zap className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold">Phân Tăng Trưởng</h3>
                    <p className="text-xs leading-5 text-slate-400">
                      6 Xu/bao · Rút ngay 10% thời gian chờ của cây · kho còn{" "}
                      <b className="text-slate-100">{fertilizerInventory.growth}</b>
                    </p>
                  </div>
                </div>
                {purchaseButtons((amount) => onBuyFertilizer("growth", amount), "Phân Tăng Trưởng")}
              </article>
              <article className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-900/80 p-3 sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-800 text-amber-300">
                    <Sparkles className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold">Phân Dưỡng Hoa</h3>
                    <p className="text-xs leading-5 text-slate-400">
                      3 Xu/bao · Thu hoạch cây này được thêm 2% Xu · kho còn{" "}
                      <b className="text-slate-100">{fertilizerInventory.bloom}</b>
                    </p>
                  </div>
                </div>
                {purchaseButtons((amount) => onBuyFertilizer("bloom", amount), "Phân Dưỡng Hoa")}
              </article>
            </section>
            <section aria-labelledby="seeds-heading" className="space-y-2">
              <h2
                id="seeds-heading"
                className="flex items-center gap-2 font-semibold text-emerald-200"
              >
                <Sprout className="size-4" /> Hạt giống
              </h2>
              {orderedSeeds.map(renderSeed)}
            </section>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-slate-950 px-5 py-3 text-center sm:px-6">
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Flower2 className="size-4 text-emerald-300" />
              Mua xong bấm Gieo hàng loạt để trồng ngay toàn bộ ô trống.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
