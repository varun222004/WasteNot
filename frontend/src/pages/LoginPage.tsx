import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authApi } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";

// Second guard: even if a misconfigured API returned a code, production builds never display it.
const SHOW_DEV_OTP = import.meta.env.MODE !== "production";

export default function LoginPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user && step === "email") return <Navigate to={next} replace />;

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address");
    setBusy(true);
    try {
      const res = await authApi.requestOtp(email.trim());
      setDevCode(SHOW_DEV_OTP ? res.dev_otp ?? null : null);
      setStep("code");
      toast.success("Code sent. Check your inbox.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code");
    setBusy(true);
    try {
      const res = await authApi.verifyOtp(email.trim(), code);
      qc.setQueryData(["me"], res.user);
      toast.success(res.is_new ? "Welcome to WasteNot" : "Welcome back");
      navigate(res.is_new ? `/settings?welcome=1&next=${encodeURIComponent(next)}` : next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md animate-rise">
        <p className="eyebrow">Sign in or join</p>
        <h1 className="mt-2 text-4xl text-olive">{step === "email" ? "Welcome to WasteNot" : "Check your email"}</h1>
        <p className="mt-3 text-muted">
          {step === "email" ? "No passwords. We'll email you a 6-digit code." : `We sent a code to ${email}. It expires in 10 minutes.`}
        </p>
        {step === "email" ? (
          <form onSubmit={send} className="mt-8 space-y-4" noValidate>
            <Field label="Email" error={error} htmlFor="email">
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" data-testid="login-email-input" />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy} data-testid="login-send-code-btn">Send code</Button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-8 space-y-4" noValidate>
            {devCode && (
              <div className="rounded-xl2 border border-dashed border-amber bg-amber-100/60 p-4 text-sm" data-testid="dev-otp-banner">
                <div className="font-medium text-walnut">Development mode only</div>
                <div className="mt-1 text-walnut/80">Email delivery is not configured. Your code is <span className="font-mono text-base font-semibold" data-testid="dev-otp-code">{devCode}</span></div>
              </div>
            )}
            <Field label="6-digit code" error={error} htmlFor="code">
              <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="text-center font-mono text-xl tracking-[0.5em]" data-testid="login-code-input" />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy} data-testid="login-verify-btn">Verify & continue</Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-muted hover:text-ink" onClick={() => { setStep("email"); setCode(""); setError(""); }} data-testid="login-change-email-btn">Use another email</button>
              <button type="button" className="font-medium text-olive" onClick={() => send()} disabled={busy} data-testid="login-resend-btn">Resend code</button>
            </div>
          </form>
        )}
        <p className="mt-10 text-xs text-muted">By continuing you agree to share responsibly and to follow our community and food-safety rules.</p>
      </div>
    </div>
  );
}
