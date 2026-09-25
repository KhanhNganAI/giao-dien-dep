/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopupDialog } from "./wallet-components";

const mocks = vi.hoisted(() => ({ createTopup: vi.fn(), readTopup: vi.fn(), refresh: vi.fn() }));
vi.mock("./wallet-api", () => ({
  createTopup: mocks.createTopup,
  readTopup: mocks.readTopup,
  topupBundles: [
    { bundleId: "xu-10000", label: "Khởi Động", amountVnd: 100000, xuAmount: 10000 },
    { bundleId: "xu-30000", label: "Bứt Phá", amountVnd: 300000, xuAmount: 30000 },
    { bundleId: "xu-50000", label: "Dẫn Đầu", amountVnd: 500000, xuAmount: 50000 },
  ],
}));
vi.mock("./wallet-provider", () => ({ useWallet: () => ({ refresh: mocks.refresh }) }));

const order = {
  id: "topup-1",
  payment_code: "DRAGON123456789ABC",
  amount_vnd: 100000,
  xu_amount: 10000,
  expires_at: "2026-09-25T12:00:00Z",
  status: "pending",
};

describe("Dragon Xu checkout UI", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("creates the chosen server-priced order and waits for SePay before changing balance", async () => {
    mocks.createTopup.mockResolvedValue(order);
    render(<TopupDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Tạo mã thanh toán" })[0]!);
    await waitFor(() => expect(mocks.createTopup).toHaveBeenCalledWith("xu-10000"));
    expect(await screen.findByText("DRAGON123456789ABC")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Đang chờ SePay xác nhận");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("shows a QR setup message rather than a fabricated bank QR when account config is absent", async () => {
    mocks.createTopup.mockResolvedValue(order);
    render(<TopupDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Tạo mã thanh toán" })[0]!);
    expect(
      await screen.findByText("QR sẽ hiện khi cấu hình tài khoản nhận tiền Dragon."),
    ).toBeInTheDocument();
  });
});
