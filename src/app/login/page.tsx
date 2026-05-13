"use client";

import { useActionState, useEffect, useRef } from "react";
import { loginAction, LoginState } from "@/app/actions/auth";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f0f1a 0%, #1a0a0f 50%, #0a0f1a 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "12px",
          }}>
            <div style={{
              width: "48px", height: "48px",
              background: "linear-gradient(135deg, #E11D48, #9F1239)",
              borderRadius: "12px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "24px",
            }}>🫀</div>
            <span style={{ fontSize: "32px", fontWeight: 800, color: "#fff", letterSpacing: "-1px" }}>
              not<span style={{ color: "#E11D48" }}>ER</span>
            </span>
          </div>
          <p style={{ color: "#6b7280", fontSize: "14px", margin: 0 }}>
            AI Clinical Copilot for Cardiologists
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "20px",
          padding: "36px",
          backdropFilter: "blur(12px)",
        }}>
          <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, marginBottom: "6px" }}>
            Doctor Sign In
          </h1>
          <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "28px" }}>
            Enter your credentials to access the clinical dashboard
          </p>

          {/* Error */}
          {state?.error && (
            <div style={{
              background: "rgba(225, 29, 72, 0.12)",
              border: "1px solid rgba(225, 29, 72, 0.3)",
              borderRadius: "10px",
              padding: "12px 16px",
              marginBottom: "20px",
              color: "#fca5a5",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              ⚠️ {state.error}
            </div>
          )}

          <form action={action}>
            {/* Email */}
            <div style={{ marginBottom: "18px" }}>
              <label htmlFor="email" style={{
                display: "block", color: "#d1d5db", fontSize: "13px",
                fontWeight: 500, marginBottom: "8px",
              }}>
                Email Address
              </label>
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="12341234@gmail.com"
                defaultValue={process.env.NEXT_PUBLIC_DEFAULT_EMAIL ?? ""}
                style={{
                  width: "100%", padding: "12px 16px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "10px", color: "#fff",
                  fontSize: "14px", outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "#E11D48"}
                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: "26px" }}>
              <label htmlFor="password" style={{
                display: "block", color: "#d1d5db", fontSize: "13px",
                fontWeight: 500, marginBottom: "8px",
              }}>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                style={{
                  width: "100%", padding: "12px 16px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "10px", color: "#fff",
                  fontSize: "14px", outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "#E11D48"}
                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={pending}
              id="btn-login"
              style={{
                width: "100%", padding: "14px",
                background: pending
                  ? "rgba(225, 29, 72, 0.4)"
                  : "linear-gradient(135deg, #E11D48, #9F1239)",
                border: "none", borderRadius: "10px",
                color: "#fff", fontSize: "15px",
                fontWeight: 600, cursor: pending ? "not-allowed" : "pointer",
                transition: "opacity 0.2s, transform 0.1s",
                letterSpacing: "0.02em",
              }}
              onMouseEnter={(e) => { if (!pending) (e.target as HTMLButtonElement).style.opacity = "0.9"; }}
              onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.opacity = "1"; }}
            >
              {pending ? "Signing in..." : "Sign In →"}
            </button>
          </form>
        </div>

        {/* Hint */}
        <p style={{ textAlign: "center", color: "#374151", fontSize: "12px", marginTop: "20px" }}>
          Default: <span style={{ color: "#6b7280" }}>12341234@gmail.com / 12341234</span>
        </p>
      </div>
    </div>
  );
}
