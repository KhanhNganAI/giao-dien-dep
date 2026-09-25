import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Coins, RefreshCw, Sparkles, Sprout, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { WalletBalance } from "../wallet/wallet-components";
import { useWallet } from "../wallet/wallet-provider";
import {
  buySeeds,
  buyFertilizer,
  applyFertilizer,
  harvest,
  harvestAll,
  loadGarden,
  plant,
  plantMany,
  redeemGift,
  type GardenSnapshot,
  type GardenSlot,
} from "./garden-api";
import { GardenActions } from "./garden-actions";
import { GardenStore } from "./garden-store";
import { GardenGrid } from "./garden-grid";
import { GardenSidebar } from "./garden-sidebar";
import { seedGrowthLabel, seedNames, seedOrder } from "./seed-catalog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function errorMessage(error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error &&
            typeof error === "object" &&
            "message" in error &&
            typeof error.message === "string"
          ? error.message
          : "";
  if (raw.includes("insufficient_balance")) return "Ví Xu không đủ để thực hiện thao tác này.";
  if (raw.includes("seed_not_in_inventory")) return "Kho giống chưa có hạt này. Hãy mua hạt trước.";
  if (raw.includes("bottom row only")) return "Loại cây này chỉ trồng được ở hàng dưới.";
  if (raw.includes("not_ready")) return "Cây vẫn đang lớn, chưa thể thu hoạch.";
  if (raw.includes("fertilizer_not_in_inventory"))
    return "Kho chưa có bao phân này. Hãy mua trong Kho giống.";
  if (raw.includes("fertilizer_limit")) return "Mỗi cây chỉ dùng tối đa 3 bao phân.";
  if (raw.includes("crop_not_growing")) return "Chỉ có thể bón phân khi cây vẫn đang lớn.";
  return raw || "Đã xảy ra lỗi, vui lòng thử lại.";
}

export function GardenPage() {
  const { balance, refresh: refreshWallet } = useWallet();
  const [data, setData] = useState<GardenSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [plantingSlot, setPlantingSlot] = useState<GardenSlot | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<GardenSlot | null>(null);
  const [selectedSeedKey, setSelectedSeedKey] = useState<string>(seedOrder[0]);
  const inventory = useMemo(
    () =>
      Object.fromEntries((data?.inventory ?? []).map((stack) => [stack.seed_key, stack.quantity])),
    [data?.inventory],
  );
  const fertilizerInventory = useMemo(
    () => ({
      growth:
        data?.fertilizerInventory.find((item) => item.fertilizer_type === "growth")?.quantity ?? 0,
      bloom:
        data?.fertilizerInventory.find((item) => item.fertilizer_type === "bloom")?.quantity ?? 0,
    }),
    [data?.fertilizerInventory],
  );

  const reload = useCallback(async () => {
    try {
      const snapshot = await loadGarden();
      setData(snapshot);
      if (!snapshot.seeds.some((seed) => seed.seed_key === selectedSeedKey))
        setSelectedSeedKey(snapshot.seeds[0]?.seed_key ?? "");
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [selectedSeedKey]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  const act = async (
    operation: () => Promise<unknown>,
    success: string | ((result: unknown) => string),
  ) => {
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const result = await operation();
      await Promise.all([reload(), refreshWallet()]);
      setNotice(typeof success === "function" ? success(result) : success);
      return result;
    } catch (cause) {
      setError(errorMessage(cause));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const selectedSeed = data?.seeds.find((seed) => seed.seed_key === selectedSeedKey);
  const readySlots = (data?.slots ?? []).filter(
    (slot) => slot.status !== "empty" && slot.ready_at && new Date(slot.ready_at).getTime() <= now,
  );
  const emptySlots = (data?.slots ?? []).filter(
    (slot) => slot.status === "empty" && (!selectedSeed?.bottom_row_only || slot.slot_index >= 7),
  );

  const handleSlot = (slot: GardenSlot) => {
    if (slot.status === "empty") {
      setPlantingSlot(slot);
      return;
    }
    setSelectedSlot(slot);
  };

  const plantSelectedSeed = (seedKey: string) => {
    if (!plantingSlot) return;
    const slotIndex = plantingSlot.slot_index;
    const seed = data?.seeds.find((item) => item.seed_key === seedKey);
    if (!seed || (inventory[seedKey] ?? 0) < 1) return;
    if (seed.bottom_row_only && slotIndex < 7) return;
    void act(
      () => plant(slotIndex, seedKey),
      `Đã gieo ${seed.display_name} ở ô ${slotIndex}.`,
    ).then((result) => {
      if (result) setPlantingSlot(null);
    });
  };

  const selectedSlotSeed = selectedSlot?.seed_key
    ? data?.seeds.find((seed) => seed.seed_key === selectedSlot.seed_key)
    : undefined;
  const selectedSlotReady = Boolean(
    selectedSlot?.ready_at && new Date(selectedSlot.ready_at).getTime() <= now,
  );
  const selectedSlotRemaining = selectedSlot?.ready_at
    ? Math.max(0, Math.ceil((new Date(selectedSlot.ready_at).getTime() - now) / 1000))
    : 0;
  const selectedSlotProgress =
    selectedSlot?.planted_at && selectedSlot?.ready_at
      ? Math.min(
          100,
          Math.max(
            0,
            Math.floor(
              ((now - new Date(selectedSlot.planted_at).getTime()) /
                (new Date(selectedSlot.ready_at).getTime() -
                  new Date(selectedSlot.planted_at).getTime())) *
                100,
            ),
          ),
        )
      : 0;
  const selectedSlotTime =
    selectedSlotRemaining >= 86400
      ? `${Math.floor(selectedSlotRemaining / 86400)} ngày ${Math.floor((selectedSlotRemaining % 86400) / 3600)} giờ`
      : selectedSlotRemaining >= 3600
        ? `${Math.floor(selectedSlotRemaining / 3600)} giờ ${Math.floor((selectedSlotRemaining % 3600) / 60)} phút`
        : `${Math.floor(selectedSlotRemaining / 60)} phút ${selectedSlotRemaining % 60} giây`;

  const harvestSelected = () => {
    if (!selectedSlot) return;
    const slotIndex = selectedSlot.slot_index;
    void act(
      () => harvest(slotIndex),
      (result) =>
        `Thu hoạch thành công · nhận ${(result as { reward_total?: number } | null)?.reward_total ?? 0} Xu.`,
    ).then((result) => {
      if (result) setSelectedSlot(null);
    });
  };

  const fertilizeSelected = (type: "growth" | "bloom") => {
    if (!selectedSlot) return;
    const slotIndex = selectedSlot.slot_index;
    void act(
      () => applyFertilizer(slotIndex, type),
      type === "growth"
        ? "Đã bón Phân Tăng Trưởng, thời gian còn lại giảm 10%."
        : "Đã bón Phân Dưỡng Hoa, cây nhận thêm 2% Xu khi thu hoạch.",
    ).then((result) => {
      if (!result || typeof result !== "object") return;
      const updated = result as {
        ready_at?: string;
        fertilizer_uses?: number;
        bloom_bonus_count?: number;
      };
      setSelectedSlot((current) =>
        current
          ? {
              ...current,
              ready_at: updated.ready_at ?? current.ready_at,
              fertilizer_uses: updated.fertilizer_uses ?? current.fertilizer_uses,
              bloom_bonus_count: updated.bloom_bonus_count ?? current.bloom_bonus_count,
            }
          : current,
      );
    });
  };

  const handleMassPlant = () => {
    const slots = emptySlots
      .slice(0, inventory[selectedSeedKey] ?? 0)
      .map((slot) => slot.slot_index);
    if (!slots.length) return setError("Không còn ô phù hợp hoặc hạt giống trong kho.");
    void act(() => plantMany(slots, selectedSeedKey), `Đã gieo ${slots.length} ô vườn.`);
  };

  const handleMassHarvest = () => {
    if (!readySlots.length) return setNotice("Chưa có cây nào đến kỳ thu hoạch.");
    void act(
      async () => {
        return harvestAll(readySlots.map((slot) => slot.slot_index));
      },
      (result) =>
        `Thu hoạch ${readySlots.length} ô · nhận ${(result as { reward_total?: number } | null)?.reward_total ?? 0} Xu.`,
    );
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080c27] text-white">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: "url('/game/sky-night.webp')" }}
      />
      <img
        src="/game/vine.webp"
        alt=""
        className="pointer-events-none absolute -left-5 top-40 hidden h-[80vh] w-16 object-cover opacity-50 xl:block"
      />
      <div className="relative mx-auto max-w-[1600px] px-3 pb-8 pt-4 sm:px-6 lg:px-8">
        <section
          aria-label="Đội ngũ KOL AI Dragon 3"
          className="mb-4 overflow-hidden rounded-xl border border-amber-300/25 bg-slate-950/80 shadow-lg"
        >
          <div className="relative h-32 overflow-hidden sm:h-36 lg:h-48">
            <div
              aria-hidden="true"
              className="absolute inset-0 scale-110 bg-cover bg-center opacity-45 blur-md"
              style={{ backgroundImage: "url('/game/dragon-team-banner.jpg')" }}
            />
            <div aria-hidden="true" className="absolute inset-0 bg-slate-950/15" />
            <img
              src="/game/dragon-team-banner.jpg"
              alt="Đội ngũ KOL AI Dragon 3"
              className="relative z-10 mx-auto h-full w-auto max-w-full object-contain"
            />
          </div>
        </section>
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200/10 bg-slate-950/70 p-3 backdrop-blur-md">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm text-sky-100 hover:bg-white/10"
          >
            <ArrowLeft className="size-4" />
            Về Dragon
          </a>
          <div className="flex items-center gap-2">
            <img
              src="/game/dragon-system-3-logo.jpg"
              alt="Logo Dragon System 3"
              className="size-10 rounded-full object-cover"
            />
            <div>
              <h1 className="font-display text-lg font-extrabold text-amber-200 sm:text-2xl">
                Vườn Rồng Tri Thức
              </h1>
              <p className="hidden text-[10px] text-slate-400 sm:block">
                Gieo tri thức · Gặt thành quả
              </p>
            </div>
            <img
              src="/game/bee.webp"
              alt="Ong chăm cây"
              className="hidden h-12 w-10 object-contain sm:block"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WalletBalance />
            {data && (
              <GardenStore
                seeds={data.seeds}
                inventory={inventory}
                fertilizerInventory={fertilizerInventory}
                busy={busy}
                error={error}
                onBuySeed={(key, quantity) => {
                  setSelectedSeedKey(key);
                  void act(() => buySeeds(key, quantity), "Đã mua hạt và trừ Xu trong ví Dragon.");
                }}
                onBuyFertilizer={(type, quantity) =>
                  void act(
                    () => buyFertilizer(type, quantity),
                    "Đã mua phân bón và trừ Xu trong ví Dragon.",
                  )
                }
              />
            )}
            <a href="/#nap-xu">
              <Button variant="dragonOutline" size="sm">
                <Coins className="size-4" />
                Nạp Xu
              </Button>
            </a>
          </div>
        </header>

        <section className="mb-5 rounded-xl border border-amber-300/20 bg-slate-950/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-display text-xl font-bold text-sky-100 sm:text-2xl">
                Khu vườn của bạn
              </p>
              <p className="text-xs text-slate-400">Chăm cây, học bài và nhận Xu thu hoạch.</p>
            </div>
            <Button
              variant="dragonOutline"
              size="sm"
              onClick={() => void reload()}
              disabled={loading}
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Làm mới
            </Button>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-rose-400/30 bg-rose-950/50 p-3 text-sm text-rose-100"
          >
            <span>{error}</span>
            <button type="button" onClick={() => void reload()} className="underline">
              Thử lại
            </button>
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="mb-4 rounded-lg border border-emerald-400/25 bg-emerald-950/40 p-3 text-sm text-emerald-100"
          >
            {notice}
          </p>
        )}

        {loading || !data ? (
          <div className="grid min-h-80 place-items-center rounded-xl border border-white/10 bg-slate-950/50 text-sky-100">
            <p className="flex items-center gap-2">
              <RefreshCw className="size-4 animate-spin" />
              Đang mở khu vườn...
            </p>
          </div>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold text-sky-100">
                  <Sprout className="size-5 text-emerald-300" />
                  12 luống mây
                </h2>
                <p className="text-xs text-slate-400">{readySlots.length} cây sẵn sàng thu</p>
              </div>
              <GardenGrid
                slots={data.slots}
                seeds={data.seeds}
                lessons={data.completedLessons}
                now={now}
                busy={busy}
                onSlotClick={handleSlot}
              />
              <GardenActions
                seeds={data.seeds}
                inventory={inventory}
                selectedSeedKey={selectedSeedKey}
                onSelectSeed={setSelectedSeedKey}
                onPlantAll={handleMassPlant}
                onHarvestAll={handleMassHarvest}
                busy={busy}
              />
            </div>
            <GardenSidebar
              lessons={data.completedLessons}
              slots={data.slots}
              inventory={data.inventory}
              seeds={data.seeds}
              gifts={data.gifts}
              now={now}
              onRedeem={(id) => void act(() => redeemGift(id), "Đổi quà thành công.")}
            />
          </div>
        )}
        <footer className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
          <Sprout className="size-4" />
          Ví Xu, tiến độ và vườn dùng chung tài khoản Dragon.
        </footer>
      </div>
      <Dialog open={Boolean(plantingSlot)} onOpenChange={(open) => !open && setPlantingSlot(null)}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto border-sky-200/20 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-sky-100">Trồng cây</DialogTitle>
            <DialogDescription className="text-slate-300">
              Ô {plantingSlot?.slot_index} ·{" "}
              {plantingSlot && plantingSlot.slot_index <= 6 ? "hàng trên" : "hàng dưới"}
              {" · chọn hạt đã mua trong kho · bạn có "}
              {balance === null ? "—" : balance.toLocaleString("vi-VN")} Xu
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {[...(data?.seeds ?? [])]
              .sort(
                (a, b) =>
                  seedOrder.indexOf(a.seed_key as (typeof seedOrder)[number]) -
                  seedOrder.indexOf(b.seed_key as (typeof seedOrder)[number]),
              )
              .map((seed) => {
                const quantity = inventory[seed.seed_key] ?? 0;
                const lowerRowOnly = seed.bottom_row_only && (plantingSlot?.slot_index ?? 0) < 7;
                const profitMin = seed.reward_min - seed.price_xu;
                const profitMax = seed.reward_max - seed.price_xu;
                const cropName =
                  seedNames[seed.seed_key as keyof typeof seedNames] ?? seed.display_name;
                return (
                  <button
                    key={seed.seed_key}
                    type="button"
                    disabled={busy || quantity < 1 || lowerRowOnly}
                    aria-label={`Chọn ${cropName}, còn ${quantity} hạt, giá ${seed.price_xu} Xu${lowerRowOnly ? ", chỉ trồng hàng dưới" : ""}`}
                    onClick={() => plantSelectedSeed(seed.seed_key)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/80 p-3 text-left transition hover:border-emerald-300/40 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35 sm:p-4"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-800 text-xl"
                      >
                        {seed.seed_key === "red-rose"
                          ? "🌹"
                          : seed.seed_key === "purple-flower"
                            ? "🪻"
                            : seed.seed_key === "yellow-rose"
                              ? "🌼"
                              : seed.seed_key === "apple"
                                ? "🍎"
                                : seed.seed_key === "pear"
                                  ? "🍐"
                                  : seed.seed_key === "purple-rose"
                                    ? "🌷"
                                    : "🌸"}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 font-semibold text-slate-100">
                          {cropName}
                          {seed.bottom_row_only && (
                            <span className="text-xs text-amber-300">Chỉ hàng dưới</span>
                          )}
                          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-200">
                            Kho: {quantity} hạt
                          </span>
                        </span>
                        <span className="mt-1 block text-xs text-slate-400 sm:text-sm">
                          {seedGrowthLabel(seed)} · thu {seed.reward_min}–{seed.reward_max} Xu ·{" "}
                          <b className="text-emerald-300">
                            lời +{profitMin}–{profitMax}
                          </b>
                          {lowerRowOnly && " · Ô này thuộc hàng trên"}
                          {quantity < 1 && " · Bạn chưa có hạt này trong kho"}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-amber-300">
                      {seed.price_xu} Xu
                    </span>
                  </button>
                );
              })}
          </div>
          <Button
            variant="dragonOutline"
            className="w-full sm:w-auto"
            onClick={() => setPlantingSlot(null)}
          >
            Hủy
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(selectedSlot)} onOpenChange={(open) => !open && setSelectedSlot(null)}>
        <DialogContent className="max-w-md border-sky-200/20 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-sky-100">
              {selectedSlotSeed?.display_name ?? "Chậu cây"} · Ô {selectedSlot?.slot_index}
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              {selectedSlotReady
                ? "Cây đã trưởng thành và sẵn sàng thu hoạch."
                : `Còn khoảng ${selectedSlotTime} để thu hoạch.`}
              {selectedSlot?.snail_attacked &&
                !selectedSlotReady &&
                " Ốc sên làm chậm quá trình lớn thêm 10%."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-400/30 bg-rose-950/60 p-3 text-sm text-rose-100"
            >
              {error}
            </p>
          )}
          <div className="rounded-lg border border-sky-200/15 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">Tiến độ sinh trưởng</span>
              <span className="font-semibold text-sky-200">
                {selectedSlotReady ? "100%" : `${selectedSlotProgress}%`}
              </span>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700"
              role="progressbar"
              aria-label="Tiến độ sinh trưởng"
              aria-valuenow={selectedSlotReady ? 100 : selectedSlotProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-300 transition-all"
                style={{ width: `${selectedSlotReady ? 100 : selectedSlotProgress}%` }}
              />
            </div>
            {selectedSlotSeed && (
              <p className="mt-3 text-sm text-slate-300">
                Thu hoạch từ{" "}
                <b className="text-amber-200">
                  {selectedSlotSeed.reward_min}–{selectedSlotSeed.reward_max} Xu
                </b>
              </p>
            )}
          </div>
          <div className="rounded-lg border border-amber-200/15 bg-slate-900/80 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="font-semibold text-amber-100">Phân bón cho cây</p>
              <p className="text-xs text-slate-400">
                Đã dùng {selectedSlot?.fertilizer_uses ?? 0}/3
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="dragonOutline"
                disabled={
                  busy ||
                  selectedSlotReady ||
                  (selectedSlot?.fertilizer_uses ?? 0) >= 3 ||
                  fertilizerInventory.growth < 1
                }
                onClick={() => fertilizeSelected("growth")}
              >
                <Zap className="size-4" /> Tăng trưởng · còn {fertilizerInventory.growth}
              </Button>
              <Button
                variant="dragonOutline"
                disabled={
                  busy ||
                  selectedSlotReady ||
                  (selectedSlot?.fertilizer_uses ?? 0) >= 3 ||
                  fertilizerInventory.bloom < 1
                }
                onClick={() => fertilizeSelected("bloom")}
              >
                <Sparkles className="size-4" /> Dưỡng hoa · còn {fertilizerInventory.bloom}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Mỗi cây dùng tối đa 3 bao phân: tăng trưởng giảm 10% thời gian còn lại, dưỡng hoa cộng
              2% Xu khi thu hoạch.
            </p>
          </div>
          {selectedSlotReady && (
            <Button variant="dragon" disabled={busy} onClick={harvestSelected}>
              <Coins className="size-4" /> Thu hoạch ô {selectedSlot?.slot_index}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
