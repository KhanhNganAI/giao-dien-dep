import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/integrations/supabase/auth-provider";
import { GardenPage } from "@/features/vuon-rong/garden-page";
import { WalletProvider } from "@/features/wallet/wallet-provider";

export const Route = createFileRoute("/vuon-rong")({
  head: () => ({
    meta: [
      { title: "Vườn Rồng Tri Thức | Dragon System 3" },
      { name: "description", content: "Trồng cây, học bài và nhận Xu trong Dragon System 3." },
    ],
  }),
  component: VườnRồngRoute,
});

function VườnRồngRoute() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && !user) window.location.replace("/?auth=login&returnTo=%2Fvuon-rong");
  }, [loading, user]);

  if (user)
    return (
      <WalletProvider>
        <GardenPage />
      </WalletProvider>
    );
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-center text-white">
      <div className="max-w-md">
        <LockKeyhole className="mx-auto size-9 text-amber-300" />
        <h1 className="mt-4 font-display text-2xl font-bold">Đăng nhập để vào khu vườn</h1>
        <p className="mt-2 text-sm text-slate-400">
          Vườn, ví Xu và tiến độ được gắn với tài khoản Dragon của bạn.
        </p>
        <Button asChild className="mt-5" variant="dragon">
          <Link to="/" search={{ auth: "login", returnTo: "/vuon-rong" }}>
            Đăng nhập Dragon
          </Link>
        </Button>
      </div>
    </main>
  );
}
