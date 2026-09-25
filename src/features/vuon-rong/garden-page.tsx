import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Coins, RefreshCw, Sprout } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { WalletBalance } from "../wallet/wallet-components";
import { useWallet } from "../wallet/wallet-provider";
import {
  buySeeds,
  exchangeSeed,
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
import { GardenGrid } from "./garden-grid";
import { GardenSidebar } from "./garden-sidebar";
import { seedOrder } from "./seed-catalog";

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "Đã xảy ra lỗi, vui lòng thử lại.";
  if (raw.includes("insufficient_balance")) return "Ví Xu không đủ để thực hiện thao tác này.";
  if (raw.includes("seed_not_in_inventory")) return "Kho giống chưa có hạt này. Hãy mua hạt trước.";
  if (raw.includes("bottom row only")) return "Loại cây này chỉ trồng được ở hàng dưới.";
  if (raw.includes("not_ready")) return "Cây vẫn đang lớn, chưa thể thu hoạch.";
  return raw;
}

export function GardenPage() {
  const { refresh: refreshWallet } = useWallet();
  const [data, setData] = useState<GardenSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [selectedSeedKey, setSelectedSeedKey] = useState<string>(seedOrder[0]);
  const inventory = useMemo(
    () =>
      Object.fromEntries((data?.inventory ?? []).map((stack) => [stack.seed_key, stack.quantity])),
    [data?.inventory],
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
    (slot) => slot.status === "empty" && (!selectedSeed?.bottom_row_only || slot.slot_index >= 9),
  );

  const handleSlot = (slot: GardenSlot) => {
    if (slot.status === "empty") {
      if (!selectedSeedKey) return setError("Vườn chưa có hạt giống nào trong danh mục.");
      if ((inventory[selectedSeedKey] ?? 0) < 1)
        return setError("Kho chưa có hạt đã chọn. Mua hạt ở thanh hành động bên dưới.");
      void act(
        () => plant(slot.slot_index, selectedSeedKey),
        `Đã gieo ${selectedSeed?.display_name ?? "hạt giống"} ở ô ${slot.slot_index}.`,
      );
      return;
    }
    if (slot.ready_at && new Date(slot.ready_at).getTime() <= Date.now()) {
      void act(
        async () => {
          return harvest(slot.slot_index);
        },
        (result) =>
          `Thu hoạch thành công · nhận ${(result as { reward_total?: number } | null)?.reward_total ?? 0} Xu.`,
      );
      return;
    }
    setNotice(
      `Cây đang lớn${slot.snail_attacked ? " và bị ốc sên làm chậm 10%" : ""}. Hãy quay lại khi bộ đếm kết thúc.`,
    );
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
              src="/game/kol-ai-logo.webp"
              alt="KOL AI"
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
            <a href="/#nap-xu">
              <Button variant="dragonOutline" size="sm">
                <Coins className="size-4" />
                Nạp Xu
              </Button>
            </a>
          </div>
        </header>

        <section className="mb-5 overflow-hidden rounded-xl border border-amber-300/20 bg-slate-950/60">
          <img
            src="/game/hero-banner.webp"
            alt="Huyền thoại KOL AI"
            className="max-h-36 w-full object-cover object-center sm:max-h-48"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
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
                inventory={inventory}
                selectedSeedKey={selectedSeedKey}
                busy={busy}
                onSlotClick={handleSlot}
              />
              <GardenActions
                seeds={data.seeds}
                inventory={inventory}
                selectedSeedKey={selectedSeedKey}
                onSelectSeed={setSelectedSeedKey}
                onBuy={(key, quantity) =>
                  void act(() => buySeeds(key, quantity), "Đã mua hạt và trừ Xu trong ví Dragon.")
                }
                onExchange={(from, to) =>
                  void act(() => exchangeSeed(from, to), "Đã đổi hạt giống trong kho.")
                }
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
    </main>
  );
}
