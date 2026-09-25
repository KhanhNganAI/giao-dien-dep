import { type FormEvent, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AuthMode = "login" | "register";

type AuthPrototypeDialogProps = {
  open: boolean;
  mode: AuthMode;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: AuthMode) => void;
};

type FormErrors = Partial<Record<"name" | "email" | "password" | "confirmPassword" | "terms", string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthPrototypeDialog({ open, mode, onOpenChange, onModeChange }: AuthPrototypeDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState("");

  const changeMode = (nextMode: AuthMode) => {
    setErrors({});
    setNotice("");
    onModeChange(nextMode);
  };

  const validate = () => {
    const nextErrors: FormErrors = {};
    if (mode === "register" && !name.trim()) nextErrors.name = "Vui lòng nhập họ tên.";
    if (!email.trim()) nextErrors.email = "Vui lòng nhập email.";
    else if (!emailPattern.test(email.trim())) nextErrors.email = "Email chưa đúng định dạng.";
    if (!password) nextErrors.password = "Vui lòng nhập mật khẩu.";
    else if (password.length < 6) nextErrors.password = "Mật khẩu cần có ít nhất 6 ký tự.";
    if (mode === "register") {
      if (!confirmPassword) nextErrors.confirmPassword = "Vui lòng xác nhận mật khẩu.";
      else if (password !== confirmPassword) nextErrors.confirmPassword = "Mật khẩu xác nhận chưa khớp.";
      if (!termsAccepted) nextErrors.terms = "Bạn cần đồng ý với điều khoản để tiếp tục.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    if (!validate()) return;
    setNotice("Tính năng xác thực sắp được kết nối");
  };

  const showUpcomingNotice = () => {
    setErrors({});
    setNotice("Tính năng quên mật khẩu sắp được kết nối.");
  };

  const fieldErrorClass = "mt-1.5 flex items-center gap-1.5 text-xs text-destructive";
  const inputClass = "h-11 bg-muted/55 pr-11 focus-visible:ring-primary";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-md border-primary/35 bg-card p-0 shadow-[var(--shadow-fire)]">
        <div className="border-b border-border bg-surface-raised px-5 pb-5 pt-6 sm:px-7">
          <DialogHeader className="pr-8 text-left">
            <div className="mb-3 grid size-10 place-items-center rounded-md border border-primary/35 bg-primary/10 text-primary">
              <LockKeyhole className="size-5" />
            </div>
            <DialogTitle className="font-display text-3xl font-bold text-primary">
              {mode === "login" ? "Đăng nhập" : "Đăng ký"}
            </DialogTitle>
            <DialogDescription>
              {mode === "login" ? "Trở lại hành trình Dragon System 3." : "Bắt đầu hành trình cùng Dragon System 3."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 pb-6 sm:px-7">
          <div className="mb-6 grid grid-cols-2 rounded-md border border-border bg-muted/50 p-1" aria-label="Chọn hình thức xác thực">
            <Button type="button" variant={mode === "login" ? "dragon" : "ghost"} onClick={() => changeMode("login")} aria-pressed={mode === "login"}>Đăng nhập</Button>
            <Button type="button" variant={mode === "register" ? "dragon" : "ghost"} onClick={() => changeMode("register")} aria-pressed={mode === "register"}>Đăng ký</Button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {mode === "register" && (
              <div>
                <Label htmlFor="auth-name">Họ tên</Label>
                <div className="relative mt-2">
                  <UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="auth-name" value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} pl-10 pr-3`} placeholder="Nhập họ tên của bạn" autoComplete="name" aria-invalid={Boolean(errors.name)} />
                </div>
                {errors.name && <p className={fieldErrorClass}><AlertCircle className="size-3.5" />{errors.name}</p>}
              </div>
            )}

            <div>
              <Label htmlFor="auth-email">Email</Label>
              <div className="relative mt-2">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={`${inputClass} pl-10 pr-3`} placeholder="tenban@example.com" autoComplete="email" aria-invalid={Boolean(errors.email)} />
              </div>
              {errors.email && <p className={fieldErrorClass}><AlertCircle className="size-3.5" />{errors.email}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="auth-password">Mật khẩu</Label>
                {mode === "login" && <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={showUpcomingNotice}>Quên mật khẩu?</Button>}
              </div>
              <div className="relative mt-2">
                <Input id="auth-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} placeholder="Nhập mật khẩu" autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={Boolean(errors.password)} />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 size-9 text-muted-foreground" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{showPassword ? <EyeOff /> : <Eye />}</Button>
              </div>
              {errors.password && <p className={fieldErrorClass}><AlertCircle className="size-3.5" />{errors.password}</p>}
            </div>

            {mode === "register" && (
              <>
                <div>
                  <Label htmlFor="auth-confirm-password">Xác nhận mật khẩu</Label>
                  <div className="relative mt-2">
                    <Input id="auth-confirm-password" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} placeholder="Nhập lại mật khẩu" autoComplete="new-password" aria-invalid={Boolean(errors.confirmPassword)} />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 size-9 text-muted-foreground" onClick={() => setShowConfirmPassword((current) => !current)} aria-label={showConfirmPassword ? "Ẩn mật khẩu xác nhận" : "Hiện mật khẩu xác nhận"}>{showConfirmPassword ? <EyeOff /> : <Eye />}</Button>
                  </div>
                  {errors.confirmPassword && <p className={fieldErrorClass}><AlertCircle className="size-3.5" />{errors.confirmPassword}</p>}
                </div>
                <div>
                  <div className="flex items-start gap-3">
                    <Checkbox id="auth-terms" checked={termsAccepted} onCheckedChange={(checked) => setTermsAccepted(checked === true)} className="mt-0.5" />
                    <Label htmlFor="auth-terms" className="cursor-pointer text-xs font-normal leading-5 text-muted-foreground">Tôi đồng ý với điều khoản sử dụng của Dragon System 3.</Label>
                  </div>
                  {errors.terms && <p className={fieldErrorClass}><AlertCircle className="size-3.5" />{errors.terms}</p>}
                </div>
              </>
            )}

            {notice && <div role="status" className="flex items-start gap-2 rounded-md border border-primary/35 bg-primary/10 p-3 text-sm text-gold-soft"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /><span>{notice}</span></div>}

            <Button type="submit" variant="dragon" size="lg" className="w-full">
              {mode === "login" ? "Đăng nhập" : "Đăng ký"}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Đây là giao diện mẫu. Thông tin không được gửi hoặc lưu trữ.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}