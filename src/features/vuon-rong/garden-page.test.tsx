/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GardenPage } from "./garden-page";
import { applyFertilizer, buyFertilizer, buySeeds, loadGarden, plant } from "./garden-api";

vi.mock("./garden-api", () => ({
  loadGarden: vi.fn(),
  buySeeds: vi.fn(),
  buyFertilizer: vi.fn(),
  applyFertilizer: vi.fn(),
  applyFertilizer: vi.fn(),
  plant: vi.fn(),
  plantMany: vi.fn(),
  harvest: vi.fn(),
  harvestAll: vi.fn(),
  redeemGift: vi.fn(),
}));
vi.mock("../wallet/wallet-provider", () => ({
  useWallet: () => ({ balance: 10000, refresh: vi.fn() }),
}));
vi.mock("../wallet/wallet-components", () => ({ WalletBalance: () => <span>10.000 Xu</span> }));

const seeds = [
  {
    seed_key: "red-rose",
    display_name: "Hồng Đỏ",
    price_xu: 5,
    growth_seconds: 7200,
    reward_min: 9,
    reward_max: 11,
    bottom_row_only: false,
    active: true,
  },
  {
    seed_key: "apple",
    display_name: "Táo",
    price_xu: 15,
    growth_seconds: 86400,
    reward_min: 26,
    reward_max: 33,
    bottom_row_only: true,
    active: true,
  },
  {
    seed_key: "purple-flower",
    display_name: "Hoa Tím",
    price_xu: 8,
    growth_seconds: 21600,
    reward_min: 12,
    reward_max: 16,
    bottom_row_only: false,
    active: true,
  },
  {
    seed_key: "yellow-rose",
    display_name: "Hồng Vàng",
    price_xu: 12,
    growth_seconds: 43200,
    reward_min: 17,
    reward_max: 22,
    bottom_row_only: false,
    active: true,
  },
  {
    seed_key: "pear",
    display_name: "Lê",
    price_xu: 20,
    growth_seconds: 172800,
    reward_min: 44,
    reward_max: 54,
    bottom_row_only: true,
    active: true,
  },
  {
    seed_key: "purple-rose",
    display_name: "Hồng Tím",
    price_xu: 25,
    growth_seconds: 172800,
    reward_min: 52,
    reward_max: 62,
    bottom_row_only: true,
    active: true,
  },
  {
    seed_key: "orchid",
    display_name: "Phong Lan",
    price_xu: 30,
    growth_seconds: 172800,
    reward_min: 60,
    reward_max: 72,
    bottom_row_only: true,
    active: true,
  },
];
const snapshot = {
  slots: Array.from({ length: 12 }, (_, index) => ({
    id: `slot-${index + 1}`,
    user_id: "user",
    slot_index: index + 1,
    seed_key: null,
    status: "empty",
    planted_at: null,
    ready_at: null,
    snail_attacked: false,
    created_at: "2026-09-25",
    updated_at: "2026-09-25",
  })),
  inventory: [],
  fertilizerInventory: [],
  seeds,
  gifts: [],
  completedLessons: 4,
};

describe("Vườn Rồng game screen", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads and displays all twelve slots, shared lessons, and inventory actions", async () => {
    vi.mocked(loadGarden).mockResolvedValue(snapshot as never);
    render(<GardenPage />);
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "12 ô vườn rồng" })).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("button", { name: /^Ô \d+:/ })).toHaveLength(12);
    expect(screen.getByText("4 bài đã hoàn thành")).toBeInTheDocument();
    expect(screen.getAllByText(/Mộc Long Phong Chậu/)).toHaveLength(2);
  });

  it("shows the full Dragon team banner above the garden title without cropping the image", async () => {
    vi.mocked(loadGarden).mockResolvedValue(snapshot as never);
    render(<GardenPage />);
    const banner = await screen.findByRole("img", { name: "Đội ngũ KOL AI Dragon 3" });
    const title = screen.getByRole("heading", { name: "Vườn Rồng Tri Thức" });

    expect(banner).toHaveAttribute("src", "/game/dragon-team-banner.jpg");
    expect(banner).toHaveClass("object-contain");
    expect(banner.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("uses the locally served Dragon logo in the garden header", async () => {
    vi.mocked(loadGarden).mockResolvedValue(snapshot as never);
    render(<GardenPage />);

    expect(await screen.findByRole("img", { name: "Logo Dragon System 3" })).toHaveAttribute(
      "src",
      "/game/dragon-system-3-logo.jpg",
    );
  });

  it("keeps the garden at six columns so all twelve pots stay in two rows", async () => {
    vi.mocked(loadGarden).mockResolvedValue(snapshot as never);
    render(<GardenPage />);
    const garden = await screen.findByRole("region", { name: "12 ô vườn rồng" });
    const grid = garden.querySelector(".relative.grid");

    expect(grid).toHaveClass("grid-cols-6");
    expect(grid).not.toHaveClass("grid-cols-3", "sm:grid-cols-4", "lg:grid-cols-6");
  });

  it("shows each seed's mature crop art only after it is ready to harvest", async () => {
    const cropKeys = [
      "red-rose",
      "purple-flower",
      "yellow-rose",
      "apple",
      "pear",
      "purple-rose",
      "orchid",
    ];
    const readySlots = snapshot.slots.map((slot, index) =>
      index < cropKeys.length
        ? {
            ...slot,
            seed_key: cropKeys[index],
            status: "growing",
            planted_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            ready_at: new Date(Date.now() - 1000).toISOString(),
          }
        : slot,
    );
    vi.mocked(loadGarden).mockResolvedValue({
      ...snapshot,
      slots: readySlots,
    } as never);
    render(<GardenPage />);

    for (const [index, seedKey] of cropKeys.entries()) {
      const slot = await screen.findByRole("button", {
        name: new RegExp(`Ô ${index + 1}: Sẵn sàng thu hoạch`),
      });
      expect(slot.querySelector(`img[src="/game/mature/${seedKey}.png"]`)).toBeInTheDocument();
    }
  });

  it("opens a seed picker from an empty pot and plants only after a stocked crop is selected", async () => {
    vi.mocked(loadGarden).mockResolvedValue({
      ...snapshot,
      inventory: [
        { seed_key: "red-rose", quantity: 3 },
        { seed_key: "apple", quantity: 2 },
      ],
    } as never);
    vi.mocked(plant).mockResolvedValue({ slot_index: 7 } as never);
    render(<GardenPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^Ô 1:/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Trồng cây");
    expect(dialog).toHaveTextContent("Ô 1 · hàng trên");
    expect(dialog).toHaveTextContent(/bạn có 10\.000 Xu/i);
    expect(dialog).toHaveTextContent("Kho: 3 hạt");
    expect(dialog).toHaveTextContent("lời +4–6");
    expect(plant).not.toHaveBeenCalled();

    const appleChoice = screen.getByRole("button", { name: /Chọn Táo/ });
    expect(appleChoice).toBeDisabled();
    expect(dialog).toHaveTextContent("Chỉ hàng dưới");

    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    fireEvent.click(screen.getByRole("button", { name: /^Ô 7:/ }));
    expect(screen.getByRole("button", { name: /Chọn Táo/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Chọn Táo/ }));
    await waitFor(() => expect(plant).toHaveBeenCalledWith(7, "apple"));
  });

  it("opens the combined inventory store with seed and fertilizer purchase options", async () => {
    vi.mocked(loadGarden).mockResolvedValue({
      ...snapshot,
      inventory: [{ seed_key: "red-rose", quantity: 2 }],
      fertilizerInventory: [
        { fertilizer_type: "growth", quantity: 1 },
        { fertilizer_type: "bloom", quantity: 0 },
      ],
    } as never);
    render(<GardenPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Kho giống" }));

    const dialog = await screen.findByRole("dialog", { name: "Kho giống" });
    expect(dialog).toHaveTextContent("Phân bón");
    expect(dialog).toHaveTextContent("Phân Tăng Trưởng");
    expect(dialog).toHaveTextContent("Rút ngay 10% thời gian chờ của cây");
    expect(dialog).toHaveTextContent("Phân Dưỡng Hoa");
    expect(dialog).toHaveTextContent("Thu hoạch cây này được thêm 2% Xu");
    expect(dialog).toHaveTextContent("Hồng Đỏ");
    expect(dialog).toHaveTextContent("kho còn 2");
    expect(dialog).toHaveTextContent("Phong Lan");
    expect(screen.getAllByRole("button", { name: /Mua \+1/ }).length).toBeGreaterThan(1);
    expect(screen.getAllByRole("button", { name: /Mua \+5/ }).length).toBeGreaterThan(1);
    expect(dialog).toHaveTextContent("Gieo hàng loạt");
  });

  it("removes seed exchange and shows a plant detail panel when a planted pot is clicked", async () => {
    const growing = {
      ...snapshot.slots[0]!,
      seed_key: "red-rose",
      status: "growing",
      planted_at: new Date().toISOString(),
      ready_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };
    vi.mocked(loadGarden).mockResolvedValue({
      ...snapshot,
      slots: [growing, ...snapshot.slots.slice(1)],
    } as never);
    render(<GardenPage />);

    expect(screen.queryByRole("button", { name: "Đổi hạt" })).not.toBeInTheDocument();
    const growingSlot = await screen.findByRole("button", { name: /Ô 1:.*Hồng Đỏ/ });
    expect(growingSlot.querySelector('img[src="/game/bud.webp"]')).toBeInTheDocument();
    fireEvent.click(growingSlot);

    expect(await screen.findByRole("dialog")).toHaveTextContent("Hồng Đỏ");
    expect(screen.getByRole("dialog")).toHaveTextContent("Thu hoạch từ 9–11 Xu");
    expect(screen.getByRole("dialog")).toHaveTextContent("Còn khoảng");
  });

  it("offers the stocked growth fertilizer for a growing crop and updates its remaining time", async () => {
    const growing = {
      ...snapshot.slots[0]!,
      seed_key: "red-rose",
      status: "growing",
      planted_at: new Date().toISOString(),
      ready_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      fertilizer_uses: 0,
      bloom_bonus_count: 0,
    };
    vi.mocked(loadGarden).mockResolvedValue({
      ...snapshot,
      slots: [growing, ...snapshot.slots.slice(1)],
      fertilizerInventory: [
        { fertilizer_type: "growth", quantity: 1 },
        { fertilizer_type: "bloom", quantity: 0 },
      ],
    } as never);
    vi.mocked(applyFertilizer).mockResolvedValue({
      ready_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      fertilizer_uses: 1,
      bloom_bonus_count: 0,
    } as never);
    render(<GardenPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Ô 1:.*Hồng Đỏ/ }));
    fireEvent.click(screen.getByRole("button", { name: /Tăng trưởng · còn 1/ }));

    await waitFor(() => expect(applyFertilizer).toHaveBeenCalledWith(1, "growth"));
    expect(await screen.findByText("Đã dùng 1/3")).toBeInTheDocument();
  });

  it("shows a friendly message when a crop reached the fertilizer limit", async () => {
    const growing = {
      ...snapshot.slots[0]!,
      seed_key: "red-rose",
      status: "growing",
      planted_at: new Date().toISOString(),
      ready_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      fertilizer_uses: 2,
      bloom_bonus_count: 2,
    };
    vi.mocked(loadGarden).mockResolvedValue({
      ...snapshot,
      slots: [growing, ...snapshot.slots.slice(1)],
      fertilizerInventory: [{ fertilizer_type: "growth", quantity: 1 }],
    } as never);
    vi.mocked(applyFertilizer).mockRejectedValue({ message: "fertilizer_limit" });
    render(<GardenPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Ô 1:.*Hồng Đỏ/ }));
    fireEvent.click(screen.getByRole("button", { name: /Tăng trưởng · còn 1/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mỗi cây chỉ dùng tối đa 3 bao phân.",
    );
  });

  it("explains when a seed purchase fails because the wallet has insufficient Xu", async () => {
    vi.mocked(loadGarden).mockResolvedValue(snapshot as never);
    vi.mocked(buySeeds).mockRejectedValue({
      code: "P0001",
      details: null,
      hint: null,
      message: "insufficient_balance",
    });
    render(<GardenPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Kho giống" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mua +1 hạt Hồng Đỏ" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ví Xu không đủ để thực hiện thao tác này.",
    );
  });
});
