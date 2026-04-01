'use client';
import { useState } from "react";
import { signIn } from "@/lib/supabase";
import { inputStyle } from "@/lib/constants";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await signIn(email, password);
    if (authError) {
      setError(authError.message === "Invalid login credentials"
        ? "이메일 또는 비밀번호가 올바르지 않습니다."
        : authError.message);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#0B0E14",
    }}>
      <div style={{
        width: "100%", maxWidth: 400, padding: 40,
        background: "#1C1F2A", border: "1px solid #1F2233",
        borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: "linear-gradient(135deg, #4A9FD8, #3D8EC6)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 700, color: "#F0F1F4", marginBottom: 16,
          }}>C</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#F0F1F4" }}>Contract Tracker</div>
          <div style={{ fontSize: 11, color: "#444A58", letterSpacing: "2px", textTransform: "uppercase", marginTop: 4 }}>
            IT Procurement
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#949BAD", marginBottom: 6, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              이메일
            </label>
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@krafton.com"
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#949BAD", marginBottom: 6, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              비밀번호
            </label>
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 16,
              background: "#2D1B1B", border: "1px solid #8B3A3A",
              color: "#F06B6B", fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "12px", borderRadius: 10, border: "none",
              background: loading ? "#2B3044" : "linear-gradient(135deg, #4A9FD8, #3D8EC6)",
              color: "#F0F1F4", fontSize: 14, fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 11, color: "#444A58" }}>
          계정이 없으신가요? 관리자에게 문의하세요.
        </div>
      </div>
    </div>
  );
}
