'use client';
import { useAuth } from '@/components/AuthProvider';
import ContractTracker from '@/components/ContractTracker';
import LoginPage from '@/components/LoginPage';

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #4A6FA5, #3A5A8A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>C</div>
        <div style={{ fontSize: 14, color: "#6B7280" }}>인증 확인 중...</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;
  return <ContractTracker />;
}
