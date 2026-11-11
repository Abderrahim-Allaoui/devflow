import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Sign in" };

const FALL = (
  <div className="auth-wrap">
    <div className="auth-card">
      <h1>Welcome back</h1>
      <p className="sub">Loading…</p>
    </div>
  </div>
);

export default function LoginPage() {
  return (
    <Suspense fallback={FALL}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
