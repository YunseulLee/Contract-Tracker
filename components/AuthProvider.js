'use client';
import { createContext, useContext, useState, useEffect } from "react";
import { supabase, getSession, onAuthStateChange } from "@/lib/supabase";

const AuthContext = createContext({ user: null, role: 'viewer', loading: true, isAdmin: false });

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('viewer');
  const [loading, setLoading] = useState(true);

  const loadRole = async (currentUser) => {
    if (!currentUser) { setRole('viewer'); return; }

    try {
      // 1. 현재 사용자의 역할 조회
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .single();

      if (!error && data) {
        setRole(data.role);
        return;
      }

      // 2. 레코드가 없으면 → admin이 한 명이라도 있는지 확인
      const { data: admins } = await supabase
        .from('user_roles')
        .select('id')
        .eq('role', 'admin')
        .limit(1);

      const hasAdmin = admins && admins.length > 0;
      const assignRole = hasAdmin ? 'viewer' : 'admin';

      // 3. 새 레코드 생성
      await supabase
        .from('user_roles')
        .upsert({
          user_id: currentUser.id,
          email: currentUser.email,
          role: assignRole,
        }, { onConflict: 'user_id' });

      setRole(assignRole);
    } catch {
      // 테이블 없거나 에러 시 기본 admin (첫 사용자)
      setRole('admin');
    }
  };

  useEffect(() => {
    getSession().then(async ({ session }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) await loadRole(u);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    const { data: { subscription } } = onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) await loadRole(u);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isAdmin = role === 'admin';

  return (
    <AuthContext.Provider value={{ user, role, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
