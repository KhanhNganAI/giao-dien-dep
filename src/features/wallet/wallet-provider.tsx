import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/integrations/supabase/auth-provider";
import { loadWallet, type WalletTransaction } from "./wallet-api";

type WalletContextValue = {
  balance: number | null;
  transactions: WalletTransaction[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};
const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setBalance(null);
      setTransactions([]);
      return;
    }
    setLoading(true);
    try {
      const wallet = await loadWallet();
      setBalance(wallet.balance);
      setTransactions(wallet.transactions);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được số dư ví Xu.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  const value = useMemo(
    () => ({ balance, transactions, loading, error, refresh }),
    [balance, transactions, loading, error, refresh],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}
