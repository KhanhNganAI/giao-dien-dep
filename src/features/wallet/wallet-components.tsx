import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Coins, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/integrations/supabase/auth-provider";
import { createTopup, readTopup, topupBundles, type TopupOrder } from "./wallet-api";
import { useWallet } from "./wallet-provider";

const bankCode = import.meta.env["VITE_SEPAY_BANK_CODE"] as string | undefined;
const accountNumber = import.meta.env["VITE_SEPAY_ACCOUNT_NUMBER"] as string | undefined;
const accountName = import.meta.env["VITE_SEPAY_ACCOUNT_NAME"] as string | undefined;

function makeQrUrl(order: TopupOrder) {
  if (
    !bankCode ||
    !accountNumber ||
    bankCode.startsWith("replace_") ||
    accountNumber.startsWith("replace_")
  )
    return null;
  const query = new URLSearchParams({
    amount: String(order.amount_vnd),
    addInfo: order.payment_code,
  });
  if (accountName) query.set("accountName", accountName);
  return `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(accountNumber)}-compact2.png?${query}`;
}

export function WalletBalance() {
  const { user } = useAuth();
  const { balance, loading, error } = useWallet();
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-primary/35 bg-muted/70 px-3 py-2 text-xs text-primary">
      <Coins className="size-4" /> Ví Xu:{" "}
      {user
        ? loading
          ? "Đang tải"
          : error
            ? "Không tải được"
            : `${(balance ?? 0).toLocaleString("vi-VN")} Xu`
        : "Đăng nhập để xem"}
    </span>
  );
}

const transactionLabels: Record<string, string> = {
  topup: "Nạp Xu SePay",
  seed_purchase: "Mua hạt giống",
  harvest: "Thu hoạch cây",
  gift_redemption: "Đổi quà trong vườn",
  seed_exchange: "Đổi loại hạt",
};

export function WalletHistory() {
  const { user } = useAuth();
  const { transactions, loading, error } = useWallet();
  if (!user)
    return (
      <p className="text-sm text-muted-foreground">Đăng nhập để xem lịch sử giao dịch ví Xu.</p>
    );
  if (loading && !transactions.length)
    return <p className="text-sm text-muted-foreground">Đang tải giao dịch…</p>;
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        Không tải được lịch sử ví.
      </p>
    );
  if (!transactions.length)
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có giao dịch. Nạp Xu để bắt đầu khu vườn.
      </p>
    );
  return (
    <ol aria-label="Giao dịch Xu gần đây" className="divide-y divide-border">
      {transactions.map((transaction) => (
        <li key={transaction.id} className="flex items-center justify-between gap-3 py-3 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {transactionLabels[transaction.transaction_type] ?? "Giao dịch Dragon"}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(transaction.created_at).toLocaleString("vi-VN")}
            </span>
          </span>
          <span
            className={
              transaction.amount > 0
                ? "shrink-0 font-semibold text-emerald-600"
                : "shrink-0 font-semibold text-muted-foreground"
            }
          >
            {transaction.amount > 0 ? "+" : ""}
            {transaction.amount.toLocaleString("vi-VN")} Xu
          </span>
        </li>
      ))}
    </ol>
  );
}

export function TopupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { refresh } = useWallet();
  const [order, setOrder] = useState<TopupOrder | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const orderId = order?.id;
  const orderStatus = order?.status;
  const qrUrl = useMemo(() => (order ? makeQrUrl(order) : null), [order]);

  useEffect(() => {
    if (!open || !orderId || orderStatus !== "pending") return;
    const timer = window.setInterval(() => {
      void readTopup(orderId)
        .then(async (nextOrder) => {
          setOrder(nextOrder);
          if (nextOrder.status === "paid") await refresh();
        })
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : "Không đọc được trạng thái nạp Xu."),
        );
    }, 5000);
    return () => window.clearInterval(timer);
  }, [open, orderId, orderStatus, refresh]);

  const startTopup = async (bundleId: string) => {
    setPending(true);
    setError(null);
    try {
      setOrder(await createTopup(bundleId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tạo được lệnh nạp Xu.");
    } finally {
      setPending(false);
    }
  };

  const copyCode = async () => {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.payment_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Không sao chép được. Bạn hãy chọn và sao chép mã chuyển khoản thủ công.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setOrder(null);
          setError(null);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto border-primary/35 bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary">Nạp Xu Dragon</DialogTitle>
          <DialogDescription>
            100.000 VNĐ đổi 10.000 Xu. Xu chỉ được cộng sau khi máy chủ xác nhận thanh toán.
          </DialogDescription>
        </DialogHeader>
        {!order ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {topupBundles.map((bundle) => (
              <article
                key={bundle.bundleId}
                className="rounded-md border border-border bg-muted/40 p-4"
              >
                <p className="text-xs text-muted-foreground">Gói {bundle.label}</p>
                <p className="mt-3 font-display text-2xl font-bold text-primary">
                  {bundle.xuAmount.toLocaleString("vi-VN")} Xu
                </p>
                <p className="mt-1 text-sm">{bundle.amountVnd.toLocaleString("vi-VN")} VNĐ</p>
                <Button
                  className="mt-5 w-full"
                  variant="dragon"
                  disabled={pending}
                  onClick={() => void startTopup(bundle.bundleId)}
                >
                  {pending ? <LoaderCircle className="animate-spin" /> : "Tạo mã thanh toán"}
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
            <div className="grid place-items-center rounded-md border border-border bg-white p-3">
              {qrUrl ? (
                <img src={qrUrl} alt="Mã QR nạp Xu Dragon" className="aspect-square w-full" />
              ) : (
                <div className="p-4 text-center text-sm text-slate-700">
                  QR sẽ hiện khi cấu hình tài khoản nhận tiền Dragon.
                </div>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Chuyển đúng số tiền và giữ nguyên nội dung bên dưới.
              </p>
              {[
                ["Số tiền", `${order.amount_vnd.toLocaleString("vi-VN")} VNĐ`],
                ["Nhận được", `${order.xu_amount.toLocaleString("vi-VN")} Xu`],
                ["Nội dung", order.payment_code],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 break-all font-semibold text-primary">{value}</p>
                </div>
              ))}
              <Button variant="dragonOutline" className="w-full" onClick={() => void copyCode()}>
                {copied ? <Check /> : <Clipboard />}
                {copied ? "Đã sao chép" : "Sao chép nội dung"}
              </Button>
              <p
                role="status"
                className="rounded border border-primary/30 bg-primary/10 p-3 text-xs text-primary"
              >
                {order.status === "paid"
                  ? "Đã nhận tiền. Xu đã được cộng vào ví."
                  : order.status === "expired"
                    ? "Mã thanh toán đã hết hạn. Hãy tạo mã mới."
                    : order.status === "review"
                      ? "Giao dịch đang được đối soát. Số dư Xu chưa thay đổi."
                      : "Đang chờ SePay xác nhận. Màn hình tự cập nhật sau mỗi 5 giây."}
              </p>
              <p className="text-xs text-muted-foreground">
                Hết hạn: {new Date(order.expires_at).toLocaleString("vi-VN")}
              </p>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
