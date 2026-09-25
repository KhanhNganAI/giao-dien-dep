/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthPrototypeDialog } from "./auth-prototype-dialog";

const auth = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }));
vi.mock("@/integrations/supabase/auth-provider", () => ({ useAuth: () => auth }));

describe("Dragon login and registration dialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("submits valid credentials through Supabase and closes after successful login", async () => {
    const onOpenChange = vi.fn();
    auth.signIn.mockResolvedValue(undefined);
    render(
      <AuthPrototypeDialog open mode="login" onOpenChange={onOpenChange} onModeChange={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "dragon@example.com" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), { target: { value: "dragon-pass" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Đăng nhập" }).at(-1)!);
    await waitFor(() =>
      expect(auth.signIn).toHaveBeenCalledWith("dragon@example.com", "dragon-pass"),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a clear localized login failure", async () => {
    auth.signIn.mockRejectedValue(new Error("Invalid login credentials"));
    render(<AuthPrototypeDialog open mode="login" onOpenChange={vi.fn()} onModeChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "dragon@example.com" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), { target: { value: "wrong-pass" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Đăng nhập" }).at(-1)!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email hoặc mật khẩu chưa chính xác.",
    );
  });
});
