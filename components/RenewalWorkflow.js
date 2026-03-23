'use client';
import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";
import { inputStyle, renewalStatusLabels, renewalStatusColors } from "@/lib/constants";
import { formatCurrency } from "@/lib/helpers";
import { approveRenewal, cancelRenewal, loadRenewalHistory } from "@/lib/renewal";

const RenewalBadge = ({ status }) => {
  const c = renewalStatusColors[status] || renewalStatusColors.none;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
      borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>
      {status === "pending_review" && "⏳ "}
      {status === "approved" && "✓ "}
      {status === "cancelled" && "✕ "}
      {renewalStatusLabels[status] || status}
    </span>
  );
};

export { RenewalBadge };

export default function RenewalWorkflow({ contract, onComplete }) {
  const { user, isAdmin } = useAuth();
  const [mode, setMode] = useState(null); // 'approve' | 'cancel'
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 승인 폼
  const [newEndDate, setNewEndDate] = useState("");
  const [newCost, setNewCost] = useState(contract.annual_cost || 0);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    (async () => {
      setHistoryLoading(true);
      const { data } = await loadRenewalHistory(contract.id);
      setHistory(data);
      setHistoryLoading(false);
    })();
  }, [contract.id]);

  // 기본 새 종료일: 현재 종료일 + 1년
  useEffect(() => {
    if (contract.end_date) {
      const d = new Date(contract.end_date);
      d.setFullYear(d.getFullYear() + 1);
      setNewEndDate(d.toISOString().slice(0, 10));
    }
  }, [contract.end_date]);

  const handleApprove = async () => {
    if (!newEndDate) return;
    setSubmitting(true);
    const { error } = await approveRenewal(contract, {
      newEndDate, newCost, notes,
      decidedBy: user?.email || "",
    });
    setSubmitting(false);
    if (!error) onComplete("갱신이 승인되었습니다.");
  };

  const handleCancel = async () => {
    setSubmitting(true);
    const { error } = await cancelRenewal(contract, {
      notes, decidedBy: user?.email || "",
    });
    setSubmitting(false);
    if (!error) onComplete("해지가 결정되었습니다.");
  };

  const decisionColors = { approved: "#66FFCC", cancelled: "#FF6B6B" };

  return (
    <div>
      {/* 현재 갱신 상태 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", background: "#0D1017", borderRadius: 12, border: "1px solid #1A1F2B", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", marginBottom: 4 }}>갱신 상태</div>
          <RenewalBadge status={contract.renewal_status} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", marginBottom: 4 }}>갱신 차수</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#E8ECF2" }}>
            {contract.renewal_count > 0 ? `${contract.renewal_count}차` : "최초 계약"}
          </div>
        </div>
      </div>

      {/* 결정 내린 경우 정보 표시 */}
      {contract.renewal_decided_at && (contract.renewal_status === "approved" || contract.renewal_status === "cancelled") && (
        <div style={{ padding: "12px 16px", background: "#111620", borderRadius: 10, border: "1px solid #1A1F2B", marginBottom: 20, fontSize: 12, color: "#8892A0", lineHeight: 1.8 }}>
          <strong style={{ color: "#E8ECF2" }}>최근 결정:</strong> {renewalStatusLabels[contract.renewal_status]}
          {contract.renewal_decided_by && <> · 결정자: {contract.renewal_decided_by}</>}
          {contract.renewal_decided_at && <> · {new Date(contract.renewal_decided_at).toLocaleDateString("ko-KR")}</>}
          {contract.renewal_notes && <div style={{ marginTop: 6, color: "#6B7280" }}>메모: {contract.renewal_notes}</div>}
        </div>
      )}

      {/* Admin 액션 버튼 */}
      {isAdmin && contract.renewal_status === "pending_review" && !mode && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <button onClick={() => setMode("approve")} style={{ flex: 1, padding: "14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #3A8B7A, #2D6B5F)", color: "#E8ECF2", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            ✓ 갱신 승인
          </button>
          <button onClick={() => setMode("cancel")} style={{ flex: 1, padding: "14px", borderRadius: 10, border: "1px solid #8B3A3A", background: "transparent", color: "#FF6B6B", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            ✕ 해지 결정
          </button>
        </div>
      )}

      {/* 갱신 승인 폼 */}
      {mode === "approve" && (
        <div style={{ padding: 20, background: "#0D1017", borderRadius: 12, border: "1px solid #3A8B7A40", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#66FFCC", marginBottom: 16 }}>✓ 갱신 승인</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#8892A0", marginBottom: 6, textTransform: "uppercase" }}>새 종료일 <span style={{ color: "#FF6B6B" }}>*</span></label>
              <input style={inputStyle} type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} />
              <div style={{ fontSize: 10, color: "#4A5568", marginTop: 4 }}>현재: {contract.end_date}</div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#8892A0", marginBottom: 6, textTransform: "uppercase" }}>갱신 비용</label>
              <input style={inputStyle} type="number" value={newCost} onChange={(e) => setNewCost(Number(e.target.value))} />
              <div style={{ fontSize: 10, color: "#4A5568", marginTop: 4 }}>현재: {formatCurrency(contract.annual_cost, contract.currency)}</div>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, color: "#8892A0", marginBottom: 6, textTransform: "uppercase" }}>메모</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="갱신 조건, 변경사항 등..." />
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button onClick={() => setMode(null)} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 13, cursor: "pointer" }}>취소</button>
            <button onClick={handleApprove} disabled={!newEndDate || submitting} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: !newEndDate || submitting ? "#2E3440" : "linear-gradient(135deg, #3A8B7A, #2D6B5F)", color: !newEndDate || submitting ? "#555" : "#E8ECF2", fontSize: 13, fontWeight: 600, cursor: !newEndDate || submitting ? "default" : "pointer" }}>
              {submitting ? "처리 중..." : "갱신 승인 확정"}
            </button>
          </div>
        </div>
      )}

      {/* 해지 결정 폼 */}
      {mode === "cancel" && (
        <div style={{ padding: 20, background: "#0D1017", borderRadius: 12, border: "1px solid #8B3A3A40", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#FF6B6B", marginBottom: 16 }}>✕ 해지 결정</div>
          <div style={{ fontSize: 12, color: "#8892A0", marginBottom: 16, lineHeight: 1.6 }}>
            <strong>{contract.vendor} — {contract.name}</strong> 계약의 갱신을 거절하고 만료 시 해지합니다.<br />
            종료일: {contract.end_date}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, color: "#8892A0", marginBottom: 6, textTransform: "uppercase" }}>해지 사유</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="해지 사유, 대체 솔루션 등..." />
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button onClick={() => setMode(null)} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 13, cursor: "pointer" }}>취소</button>
            <button onClick={handleCancel} disabled={submitting} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: submitting ? "#2E3440" : "#8B3A3A", color: submitting ? "#555" : "#E8ECF2", fontSize: 13, fontWeight: 600, cursor: submitting ? "default" : "pointer" }}>
              {submitting ? "처리 중..." : "해지 확정"}
            </button>
          </div>
        </div>
      )}

      {/* 갱신 이력 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: "#8892A0", marginBottom: 12 }}>📋 갱신 이력</div>
      {historyLoading ? (
        <div style={{ textAlign: "center", padding: 30, color: "#6B7280", fontSize: 13 }}>로딩 중...</div>
      ) : history.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: "#4A5568", fontSize: 13 }}>갱신 이력이 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {history.map((h, i) => (
            <div key={h.id} style={{ padding: "14px 16px", background: "#0D1017", borderRadius: 10, border: "1px solid #1A1F2B", animation: `fadeIn 0.3s ease ${i * 0.03}s both` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#E8ECF2" }}>{h.renewal_number}차</span>
                  <span style={{
                    padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: `${decisionColors[h.decision]}15`,
                    color: decisionColors[h.decision],
                    border: `1px solid ${decisionColors[h.decision]}30`,
                  }}>
                    {h.decision === "approved" ? "갱신 승인" : "해지 결정"}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "#4A5568" }}>
                  {new Date(h.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#8892A0", lineHeight: 1.6 }}>
                {h.decision === "approved" ? (
                  <>
                    <span>종료일: {h.previous_end_date} → <strong style={{ color: "#66FFCC" }}>{h.new_end_date}</strong></span>
                    {h.new_annual_cost && <span> · 비용: {formatCurrency(h.new_annual_cost, contract.currency)}</span>}
                  </>
                ) : (
                  <span>기존 종료일({h.previous_end_date}) 만료 후 해지</span>
                )}
                {h.decided_by && <span style={{ color: "#6B7280" }}> · 결정: {h.decided_by}</span>}
              </div>
              {h.notes && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6, padding: "6px 10px", background: "#111620", borderRadius: 6 }}>{h.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
