import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bot,
  ChevronRight,
  CircleDollarSign,
  Coins,
  GraduationCap,
  Leaf,
  LockKeyhole,
  Menu,
  Rocket,
  Sparkles,
  Sprout,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthPrototypeDialog, type AuthMode } from "@/components/auth-prototype-dialog";
import logoAsset from "@/assets/dragon-system-3-logo.jpg.asset.json";
import teamAsset from "@/assets/dragon-system-3-team.jpg.asset.json";
import { useAuth } from "@/integrations/supabase/auth-provider";
import { TopupDialog, WalletBalance, WalletHistory } from "@/features/wallet/wallet-components";
import { WalletProvider } from "@/features/wallet/wallet-provider";

export const THE_SKILL_URL = "https://dragon-system-3-the-skill.vercel.app/";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    auth: search["auth"] === "login" ? "login" as const : undefined,
    returnTo: typeof search["returnTo"] === "string" ? search["returnTo"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Dragon System 3 | Hệ sinh thái AI dành cho KOL" },
      { name: "description", content: "Học kỹ năng, khám phá công cụ AI và phát triển hành trình của bạn trong Dragon System 3." },
      { property: "og:title", content: "Dragon System 3" },
      { property: "og:description", content: "Khai phá trí tuệ • Dẫn lối tương lai" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const navItems = [
  ["Trang chủ", "#trang-chu"], ["The Skill", "#the-skill"], ["Apps dùng online", "#apps"],
  ["Nạp Xu", "#nap-xu"], ["Trồng cây", "/vuon-rong"], ["Khóa học", "#khoa-hoc"],
] as const;

const features = [
  { icon: GraduationCap, title: "The Skill", text: "Bộ kỹ năng thực chiến giúp bạn làm chủ AI từng bước.", href: "#the-skill", action: "Khám phá" },
  { icon: Bot, title: "Apps dùng online", text: "Công cụ AI tập trung, sẵn sàng cho công việc sáng tạo.", href: "#apps", action: "Xem ứng dụng" },
  { icon: CircleDollarSign, title: "Nạp Xu", text: "Xem gói Xu minh bạch để chuẩn bị sử dụng các tiện ích.", href: "#nap-xu", action: "Xem bảng giá" },
  { icon: Sprout, title: "Trồng cây", text: "Gieo hạt, chăm khu vườn và gặt Xu theo tiến độ học của bạn.", href: "/vuon-rong", action: "Vào khu vườn" },
];

const apps = [
  { icon: Sparkles, name: "AI Content Studio", text: "Lên ý tưởng và phác thảo nội dung đa nền tảng.", price: "10.000 Xu" },
  { icon: Bot, name: "KOL Brand Voice", text: "Chuẩn hóa phong cách viết theo dấu ấn cá nhân.", price: "15.000 Xu" },
  { icon: Zap, name: "Campaign Booster", text: "Gợi ý góc tiếp cận và kế hoạch chiến dịch nhanh.", price: "20.000 Xu" },
];

function Index() {
  return <WalletProvider><IndexContent /></WalletProvider>;
}

function IndexContent() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [topupOpen, setTopupOpen] = useState(false);
  const { user, loading: authLoading, signOut } = useAuth();
  const search = Route.useSearch();

  useEffect(() => {
    if (search.auth === "login" && !user && !authLoading) setAuthOpen(true);
    if (search.auth === "login" && user && !authLoading) {
      const returnTo = search.returnTo;
      const safePath = returnTo === "/vuon-rong" ? returnTo : "/";
      window.location.replace(safePath);
    }
  }, [search.auth, search.returnTo, user, authLoading]);

  const openTopup = () => {
    if (!user) return openAuth("login");
    setTopupOpen(true);
  };

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthOpen(true);
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 lg:h-20 lg:px-8">
          <a href="#trang-chu" className="flex min-w-0 items-center gap-3" aria-label="Dragon System 3 - Trang chủ">
            <img src={logoAsset.url} alt="Logo KOL AI Dragon 3" className="h-11 w-11 shrink-0 rounded-full object-contain ring-1 ring-primary/50 lg:h-14 lg:w-14" />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-bold uppercase text-primary lg:text-xl">Dragon System 3</p>
              <p className="hidden text-[10px] uppercase text-muted-foreground sm:block">Khai phá trí tuệ • Dẫn lối tương lai</p>
            </div>
          </a>
          <nav className="hidden items-center gap-1 xl:flex" aria-label="Điều hướng chính">
            {navItems.map(([label, href]) => <a key={href} href={href} className="rounded-md px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">{label}{label === "Khóa học" && <span className="ml-1 text-[9px] text-primary">MỚI</span>}</a>)}
          </nav>
          <div className="hidden items-center gap-2 md:flex xl:ml-2">
            <button type="button" className="hidden lg:block" onClick={openTopup} aria-label="Nạp Xu"><WalletBalance /></button>
            {user ? <><span className="max-w-36 truncate text-xs text-muted-foreground">{user.email}</span><Button variant="dragonOutline" size="sm" onClick={() => void signOut()}>Đăng xuất</Button></> : <><Button variant="dragonOutline" size="sm" onClick={() => openAuth("login")}>Đăng nhập</Button><Button variant="dragon" size="sm" onClick={() => openAuth("register")}>Đăng ký</Button></>}
          </div>
          <Button variant="dragonOutline" size="icon" className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Đóng menu" : "Mở menu"}>{menuOpen ? <X /> : <Menu />}</Button>
        </div>
        {menuOpen && <div className="border-t border-border bg-background p-4 md:hidden">
          <button type="button" className="mb-3" onClick={openTopup}><WalletBalance /></button>
          <nav className="grid gap-1">{navItems.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)} className="flex items-center justify-between rounded-md px-3 py-3 text-sm hover:bg-muted">{label}<ChevronRight className="size-4 text-primary" /></a>)}</nav>
           {user ? <Button className="mt-3 w-full" variant="dragonOutline" onClick={() => void signOut()}>Đăng xuất</Button> : <div className="mt-3 grid grid-cols-2 gap-2"><Button variant="dragonOutline" onClick={() => openAuth("login")}>Đăng nhập</Button><Button variant="dragon" onClick={() => openAuth("register")}>Đăng ký</Button></div>}
        </div>}

      </header>

      <AuthPrototypeDialog open={authOpen} mode={authMode} onOpenChange={setAuthOpen} onModeChange={setAuthMode} />
      <TopupDialog open={topupOpen} onOpenChange={setTopupOpen} />

      <main>
        <section id="trang-chu" className="scroll-mt-20 pt-16 lg:pt-20">
          <div className="relative border-b border-border bg-muted">
            <img src={teamAsset.url} alt="Đội ngũ năm thủ lĩnh KOL AI Dragon 3" className="mx-auto block w-full max-w-[1920px] object-contain" />
          </div>
          <div className="mx-auto max-w-5xl px-4 py-10 text-center sm:py-14">
            <p className="mb-3 text-xs font-bold uppercase text-primary">Hệ sinh thái học tập & công cụ AI</p>
            <h1 className="font-display text-4xl font-bold uppercase leading-none text-foreground sm:text-6xl lg:text-7xl">Dragon System 3</h1>
            <p className="mt-3 font-display text-xl font-semibold text-primary sm:text-2xl">Khai phá trí tuệ • Dẫn lối tương lai</p>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">Nơi cộng đồng học những skill thực chiến, dùng công cụ AI hiệu quả và xây dựng năng lực bền vững trên một hành trình thống nhất.</p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><Button asChild variant="dragon" size="lg"><a href="#the-skill">Khám phá The Skill <ArrowRight /></a></Button><Button asChild variant="dragonOutline" size="lg"><a href="#apps">Xem Apps</a></Button><Button asChild variant="dragonOutline" size="lg"><a href="/vuon-rong"><Sprout />Vào Vườn Rồng</a></Button></div>
          </div>
        </section>

        <section aria-label="Chức năng nổi bật" className="border-y border-border bg-surface-raised/50 py-12">
          <div className="mx-auto grid max-w-7xl gap-px overflow-hidden rounded-md border border-border bg-border px-0 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text, href, action }) => <article key={title} className="bg-card p-6">
              <Icon className="size-7 text-primary" /><h2 className="mt-5 font-display text-2xl font-bold">{title}</h2><p className="mt-2 min-h-14 text-sm leading-6 text-muted-foreground">{text}</p><a href={href} className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">{action}<ChevronRight className="size-4" /></a>
            </article>)}
          </div>
        </section>

        <section id="the-skill" className="scroll-mt-20 py-16 sm:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 lg:grid-cols-[1.1fr_.9fr] lg:px-8">
            <div><p className="text-xs font-bold uppercase text-primary">Nền tảng kỹ năng</p><h2 className="mt-3 font-display text-4xl font-bold sm:text-5xl">The Skill</h2><p className="mt-5 max-w-2xl leading-7 text-muted-foreground">Cánh cửa dẫn tới thư viện skill chuyên sâu của Dragon System 3 — được xây dựng cho những người muốn biến AI thành năng lực làm việc thật.</p><div className="mt-7 flex items-center gap-3"><Button variant="dragon" asChild><a href={THE_SKILL_URL} target="_blank" rel="noopener noreferrer">Khám phá The Skill <ArrowRight /></a></Button></div></div>
            <div className="grid grid-cols-[120px_1fr] items-center gap-5 rounded-md border border-primary/30 bg-card p-5 sm:grid-cols-[180px_1fr] sm:p-7"><img src={logoAsset.url} alt="Biểu trưng KOL AI Dragon 3" className="w-full object-contain" /><div><p className="font-display text-2xl font-bold text-primary">Học để dẫn đầu</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Kiến thức có lộ trình. Kỹ năng có ứng dụng. Tiến bộ có thể nhìn thấy.</p></div></div>
          </div>
        </section>

        <section id="apps" className="scroll-mt-20 border-y border-border bg-surface-raised/55 py-16 sm:py-24"><div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="max-w-2xl"><p className="text-xs font-bold uppercase text-primary">Phòng công cụ</p><h2 className="mt-3 font-display text-4xl font-bold sm:text-5xl">Apps dùng online</h2><p className="mt-4 text-muted-foreground">Ba ứng dụng mẫu để định hình kho công cụ Dragon. Nội dung và mức Xu có thể cập nhật dễ dàng sau này.</p></div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">{apps.map(({ icon: Icon, name, text, price }) => <article key={name} className="rounded-md border border-border bg-card p-6"><div className="flex items-start justify-between"><Icon className="size-8 text-primary"/><span className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary">Dự kiến</span></div><h3 className="mt-8 font-display text-2xl font-bold">{name}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{text}</p><div className="mt-6 flex items-center justify-between border-t border-border pt-5"><span className="font-semibold text-primary">{price}</span><Button variant="dragonOutline" size="sm" disabled>Chưa mở</Button></div></article>)}</div>
        </div></section>

        <section id="nap-xu" className="scroll-mt-20 py-16 sm:py-24"><div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><p className="text-xs font-bold uppercase text-primary">Ví Dragon</p><h2 className="mt-3 font-display text-4xl font-bold sm:text-5xl">Nạp Xu</h2><div className="mt-6 rounded-md border border-primary/35 bg-card p-6"><p className="text-sm text-muted-foreground">Tỷ lệ quy đổi</p><p className="mt-2 font-display text-3xl font-bold text-primary">100.000 VNĐ = 10.000 Xu</p><p className="mt-4 text-xs leading-5 text-muted-foreground">Nạp bằng QR SePay. Số Xu chỉ cập nhật khi webhook thanh toán được xác nhận. Tài khoản nhận tiền cần được cấu hình trước khi mở nạp thật.</p><Button className="mt-5" variant="dragon" onClick={openTopup}>Tạo lệnh nạp Xu <ArrowRight /></Button></div></div>
          <div><div className="grid gap-3 sm:grid-cols-3">{[["Gói Khởi Động","10.000 Xu","100.000 VNĐ"],["Gói Bứt Phá","30.000 Xu","300.000 VNĐ"],["Gói Dẫn Đầu","50.000 Xu","500.000 VNĐ"]].map(([name,xu,price])=><div key={name} className="rounded-md border border-border bg-card p-5"><p className="text-xs text-muted-foreground">{name}</p><p className="mt-3 font-display text-2xl font-bold text-primary">{xu}</p><p className="mt-1 text-sm">{price}</p><Button className="mt-5 w-full" variant="dragonOutline" size="sm" onClick={openTopup}>Nạp bằng QR</Button></div>)}</div><div className="mt-4 rounded-md border border-border bg-card p-5"><p className="mb-2 font-display text-lg font-bold">Giao dịch Xu gần đây</p><WalletHistory /></div></div></div>
        </div></section>

        <section id="trong-cay" className="scroll-mt-20 border-y border-border bg-surface-raised/55 py-16 sm:py-24"><div className="mx-auto max-w-7xl px-4 lg:px-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase text-primary">Hành trình trưởng thành</p><h2 className="mt-3 font-display text-4xl font-bold sm:text-5xl">Vườn Rồng Tri Thức</h2><p className="mt-3 max-w-2xl text-muted-foreground">Mỗi bài học vun bồi một mầm cây. Duy trì tiến độ để mở khóa các cấp độ mới.</p></div><Button asChild variant="dragon"><a href="/vuon-rong">Chơi Vườn Rồng <ArrowRight /></a></Button></div>
          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_320px]"><div className="relative min-h-[340px] overflow-hidden rounded-md border border-border bg-card p-6 sm:p-10"><div className="absolute inset-x-0 bottom-0 h-24 bg-secondary/70"/><div className="relative flex min-h-[270px] items-end justify-around gap-3">{[["Mầm Sáng",22],["Lá Rồng",48],["Tán Trí Tuệ",72],["Cổ Thụ AI",100]].map(([name,progress],i)=><div key={String(name)} className="flex min-w-0 flex-1 flex-col items-center"><div className="mb-3 text-primary">{i < 2 ? <Sprout className={i === 0 ? "size-10" : "size-16"}/> : <Leaf className={i === 2 ? "size-20" : "size-24"}/>}</div><div className="h-2 w-full max-w-28 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{width:`${progress}%`}} /></div><p className="mt-3 text-center text-xs font-semibold">{name}</p><p className="mt-1 text-[10px] text-muted-foreground">{progress}%</p></div>)}</div></div>
          <aside className="rounded-md border border-border bg-card p-6"><p className="font-display text-xl font-bold">Tiến độ học tập</p><div className="mt-6 space-y-5">{[["Khởi động","3 bài","Hoàn thành"],["Nuôi mầm","8 bài","Đang học"],["Bứt phá","15 bài","Khóa"]].map(([level,count,state],i)=><div key={level} className="grid grid-cols-[auto_1fr_auto] items-center gap-3"><div className={`grid size-8 place-items-center rounded-full ${i===0?'bg-success text-primary-foreground':'bg-muted text-muted-foreground'}`}>{i===2?<LockKeyhole className="size-4"/>:i+1}</div><div><p className="text-sm font-semibold">{level}</p><p className="text-[11px] text-muted-foreground">{count}</p></div><span className="text-[10px] text-muted-foreground">{state}</span></div>)}</div><div className="mt-7 border-t border-border pt-5"><p className="text-xs text-muted-foreground">Cấp hiện tại</p><p className="mt-1 font-semibold text-primary">Mầm Sáng • Cấp 2</p></div></aside></div>
        </div></section>

        <section id="khoa-hoc" className="scroll-mt-20 py-16 sm:py-24"><div className="mx-auto max-w-5xl px-4 text-center"><Rocket className="mx-auto size-9 text-primary"/><p className="mt-5 text-xs font-bold uppercase text-primary">Đang hoàn thiện nội dung</p><h2 className="mt-3 font-display text-4xl font-bold sm:text-5xl">Khóa học sắp ra mắt</h2><p className="mx-auto mt-4 max-w-xl leading-7 text-muted-foreground">Những lộ trình mới đang được đội ngũ Dragon xây dựng để giúp bạn tiến xa hơn cùng AI.</p><Button variant="dragonOutline" className="mt-7" disabled>Chờ thông báo</Button></div></section>
      </main>

      <footer className="border-t border-border bg-surface-raised/70"><div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:px-8"><div className="flex items-center gap-3"><img src={logoAsset.url} alt="" className="size-12 rounded-full object-contain"/><div><p className="font-display text-lg font-bold text-primary">Dragon System 3</p><p className="text-xs text-muted-foreground">Khai phá trí tuệ • Dẫn lối tương lai</p></div></div><div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted-foreground sm:justify-end"><span>Thông tin liên hệ và điều khoản sẽ cập nhật</span><span>© 2026 Dragon System 3</span></div></div></footer>
    </div>
  );
}
