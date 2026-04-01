'use client';
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { inputStyle } from "@/lib/constants";

export default function UserManager({ onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error && data) setUsers(data);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const [error, setError] = useState("");

  const updateRole = async (userId, newRole) => {
    setError("");
    const { error: dbError } = await supabase
      .from('user_roles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (dbError) {
      setError("역할 변경 실패: " + dbError.message);
      return;
    }
    setUsers((prev) => prev.map((u) =>
      u.user_id === userId ? { ...u, role: newRole } : u
    ));
  };

  const adminCount = users.filter((u) => u.role === 'admin').length;

  return (
    <div>
      <p style={{ fontSize: 13, color: "#949BAD", marginTop: 0, marginBottom: 20, lineHeight: 1.6 }}>
        사용자 역할을 관리합니다. <strong>Admin</strong>은 계약 생성/수정/삭제가 가능하고, <strong>Viewer</strong>는 조회만 가능합니다.
      </p>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, background: "#2D1B1B", border: "1px solid #8B3A3A", color: "#F06B6B", fontSize: 13 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#6B7280", fontSize: 13 }}>로딩 중...</div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#444A58", fontSize: 13 }}>등록된 사용자가 없습니다.</div>
      ) : (
        <div style={{ borderRadius: 12, border: "1px solid #1F2233", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#1C1F2A" }}>
                {["이메일", "역할", "가입일", ""].map((h, i) => (
                  <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600, borderBottom: "1px solid #1F2233" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #1F2233" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 500 }}>{u.email}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: u.role === 'admin' ? "#1B2333" : "#1A1D23",
                      color: u.role === 'admin' ? "#4A9FD8" : "#949BAD",
                      border: `1px solid ${u.role === 'admin' ? "#2B3044" : "#2B3044"}`,
                    }}>
                      {u.role === 'admin' ? '🔑 Admin' : '👁 Viewer'}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#6B7280", fontSize: 12 }}>
                    {new Date(u.created_at).toLocaleDateString("ko-KR")}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {u.role === 'admin' ? (
                      <button
                        onClick={() => updateRole(u.user_id, 'viewer')}
                        disabled={adminCount <= 1}
                        style={{
                          padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: adminCount <= 1 ? "default" : "pointer",
                          border: "1px solid #8B3A3A40", background: "transparent",
                          color: adminCount <= 1 ? "#444A58" : "#F06B6B",
                        }}
                      >
                        {adminCount <= 1 ? "마지막 Admin" : "Viewer로 변경"}
                      </button>
                    ) : (
                      <button
                        onClick={() => updateRole(u.user_id, 'admin')}
                        style={{
                          padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                          border: "1px solid #2B3044", background: "transparent", color: "#4A9FD8",
                        }}
                      >
                        Admin으로 변경
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <button onClick={onClose} style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #2B3044", background: "transparent", color: "#949BAD", fontSize: 14, cursor: "pointer" }}>닫기</button>
      </div>
    </div>
  );
}
