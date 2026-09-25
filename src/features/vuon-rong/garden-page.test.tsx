/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GardenPage } from "./garden-page";
import { loadGarden } from "./garden-api";

vi.mock("./garden-api", () => ({
  loadGarden: vi.fn(),
  buySeeds: vi.fn(),
  plant: vi.fn(),
  plantMany: vi.fn(),
  harvest: vi.fn(),
  harvestAll: vi.fn(),
  exchangeSeed: vi.fn(),
  redeemGift: vi.fn(),
}));
vi.mock("../wallet/wallet-provider", () => ({ useWallet: () => ({ refresh: vi.fn() }) }));
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
    expect(screen.getAllByText(/Chậu Sứ Trắng/)).toHaveLength(2);
  });

  it("prevents bottom-row-only crops from being planted in the upper eight slots", async () => {
    vi.mocked(loadGarden).mockResolvedValue(snapshot as never);
    render(<GardenPage />);
    const firstSlot = await screen.findByRole("button", { name: /^Ô 1:/ });
    fireEvent.change(screen.getByLabelText("Kho giống"), { target: { value: "apple" } });
    await waitFor(() => expect(firstSlot).toBeDisabled());
    expect(screen.getByRole("button", { name: /^Ô 9:/ })).toBeEnabled();
  });
});
