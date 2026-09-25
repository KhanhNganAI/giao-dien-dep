/* @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-provider";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  listener: undefined as ((event: string, session: unknown) => void) | undefined,
}));

vi.mock("./client", () => ({ supabase: { auth } }));

function Consumer() {
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const [message, setMessage] = useState("");
  return (
    <div>
      <span>{loading ? "loading" : (user?.email ?? "signed-out")}</span>
      <button
        onClick={() =>
          void signIn("user@example.com", "secret1")
            .then(() => setMessage("ok"))
            .catch((error: Error) => setMessage(error.message))
        }
      >
        login
      </button>
      <button
        onClick={() =>
          void signUp("Dragon User", "new@example.com", "secret2")
            .then(() => setMessage("registered"))
            .catch((error: Error) => setMessage(error.message))
        }
      >
        register
      </button>
      <button onClick={() => void signOut().then(() => setMessage("logged out"))}>logout</button>
      <span role="status">{message}</span>
    </div>
  );
}

describe("Dragon Supabase auth provider", () => {
  beforeEach(() => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.onAuthStateChange.mockImplementation((listener) => {
      auth.listener = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("restores a session and listens for auth changes", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "u1", email: "user@example.com" } } },
      error: null,
    });
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    await waitFor(() => expect(auth.onAuthStateChange).toHaveBeenCalledOnce());
    act(() => auth.listener?.("SIGNED_OUT", null));
    expect(screen.getByText("signed-out")).toBeInTheDocument();
  });

  it("uses the Dragon Auth API for sign-in, sign-up, and sign-out", async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await screen.findByText("signed-out");
    screen.getByText("login").click();
    await waitFor(() =>
      expect(auth.signInWithPassword).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "secret1",
      }),
    );
    screen.getByText("register").click();
    await waitFor(() =>
      expect(auth.signUp).toHaveBeenCalledWith({
        email: "new@example.com",
        password: "secret2",
        options: { data: { full_name: "Dragon User" } },
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("registered");
    screen.getByText("logout").click();
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledOnce());
  });

  it("surfaces Supabase errors to the form", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error("Invalid login credentials") });
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await screen.findByText("signed-out");
    screen.getByText("login").click();
    expect(await screen.findByRole("status")).toHaveTextContent("Invalid login credentials");
  });
});
