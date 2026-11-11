import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Create account" };

const FALL = (
  <div className="auth-wrap">
    <div className="auth-card">
      <h1>Create your account</h1>
      <p className="sub">Loading…</p>
    </div>
  </div>
);

export default function RegisterPage() {
  return (
    <Suspense fallback={FALL}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
