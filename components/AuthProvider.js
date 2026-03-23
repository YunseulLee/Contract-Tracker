'use client';
import { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase, getSession, onAuthStateChange } from "@/lib/supabase";

const AuthContext = createContext({ user: null, role: 'viewer', loading: true, isAdmin: false });

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('admin');
  const [loading, setLoading] = useState(true);
  const resolved = useRef(false);

  const finishLoading = () => {
    if (!resolved.current) {
      resolved.current = true;
      setLoading(false);
    }
  };

  const loadRole = async (currentUser) => {
    if (!currentUser) { setRole('viewer'); return; }

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .single();

      if (!error && data) {
        setRole(data.role);
        return;
      }

      // 레코드 없으면 자동 생성
      const { data: admins } = await supabase
        .from('user_roles')
        .select('id')
        .eq('role', 'admin')
        .limit(1);

      const assignRole = (admins && admins.length > 0) ? 'viewer' : 'admin';

      await supabase
        .from('user_roles')
        .upsert({
          user_id: currentUser.id,
          email: currentUser.email,
          role: assignRole,
        }, { onConflict: 'user_id' });

      setRole(assignRole);
    } catch {
      setRole('admin');
    }
  };

  useEffect(() => {
    // 3초 타임아웃: Supabase 응답이 없으면 강제로 로딩 해제
    const timeout = setTimeout(() => {
      console.warn('Auth timeout - forcing loading complete');
      finishLoading();
    }, 3000);

    getSession().then(async ({ session }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) await loadRole(u);
      clearTimeout(timeout);
      finishLoading();
    }).catch(() => {
      clearTimeout(timeout);
      finishLoading();
    });

    const { data: { subscription } } = onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) await loadRole(u);
      finishLoading();
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const isAdmin = role === 'admin';

  return (
    <AuthContext.Provider value={{ user, role, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
