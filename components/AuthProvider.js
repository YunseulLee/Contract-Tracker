'use client';
import { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase, getSession, onAuthStateChange } from "@/lib/supabase";

const AuthContext = createContext({ user: null, role: 'viewer', loading: true, isAdmin: false });

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('viewer');
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
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .single();

      if (data) { setRole(data.role); return; }

      // 레코드 없으면 viewer로 고정 생성 (admin 승격은 seed 스크립트/콘솔에서만)
      await supabase.from('user_roles').upsert({
        user_id: currentUser.id, email: currentUser.email, role: 'viewer',
      }, { onConflict: 'user_id' });
      setRole('viewer');
    } catch {
      setRole('viewer');
    }
  };

  useEffect(() => {
    const timeout = setTimeout(finishLoading, 2000);

    getSession().then(async ({ session }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) await loadRole(u);
      clearTimeout(timeout);
      finishLoading();
    }).catch(() => { clearTimeout(timeout); finishLoading(); });

    const { data: { subscription } } = onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) await loadRole(u);
      finishLoading();
    });

    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, isAdmin: role === 'admin', loading }}>
      {children}
    </AuthContext.Provider>
  );
}
