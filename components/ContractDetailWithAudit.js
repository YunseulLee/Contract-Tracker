'use client';
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import StatusBadge from "./ui/StatusBadge";
import { fieldLabels, urgencyColors, renewalStatusLabels } from "@/lib/constants";
import { getDaysUntil, getUrgencyLevel, formatCurrency } from "@/lib/helpers";
import RenewalWorkflow, { RenewalBadge } from "./RenewalWorkflow";

export default function ContractDetailWithAudit({ contract, onToggleStatus, onEdit, onDelete, onRefresh }) {
  const [tab, setTab] = useState("info");
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const c = contract;

  useEffect(() => {
    if (tab !== "history") return;
    let cancelled = false;
    (async () => {
      setAuditLoading(true);
      const { data, error } = await supabase.from("audit_log").select("*").eq("contract_id", c.id).order("created_at", { ascending: false });
      if (!cancelled && !error && data) setAuditLogs(data);
      if (!cancelled) setAuditLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tab, c.id]);

  const actionLabels = { create: "등록", update: "수정", delete: "삭제", restore: "복구" };
  const actionColors = { create: "#2DD4A0", update: "#4A9FD8", delete: "#F06B6B", restore: "#F5B731" };
  const tabStyle = (active) => ({ flex: 1, padding: "10px 0", border: "none", borderBottom: active ? "2px solid #4A9FD8" : "2px solid transparent", background: "transparent", color: active ? "#F0F1F4" : "#636B7E", fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "'Inter', 'Noto Sans KR', sans-serif" });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{c.vendor}</div>
          <div style={{ fontSize: 14, color: "#949BAD" }}>{c.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <StatusBadge urgency={getUrgencyLevel(c)} autoRenew={c.auto_renew} />
          {c.status === "terminated" && <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#2D1B1B", color: "#F06B6B", border: "1px solid #8B3A3A" }}>계약 종료</span>}
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #1F2233", marginBottom: 20 }}>
        <button onClick={() => setTab("info")} style={tabStyle(tab === "info")}>계약 정보</button>
        <button onClick={() => setTab("renewal")} style={tabStyle(tab === "renewal")}>
          갱신 관리{c.renewal_status === "pending_review" && <span style={{ marginLeft: 6, width: 8, height: 8, borderRadius: "50%", background: "#EAB308", display: "inline-block" }} />}
        </button>
        <button onClick={() => setTab("history")} style={tabStyle(tab === "history")}>수정 이력</button>
      </div>

      {tab === "info" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[
              { l: "스튜디오", v: c.studio }, { l: "유형", v: c.type },
              { l: "공급사", v: c.supplier || "—" }, { l: "시작일", v: c.start_date },
              { l: "종료일", v: c.end_date }, { l: "갱신 통보일", v: c.renewal_date || "—" },
              { l: "연간 비용", v: formatCurrency(c.annual_cost, c.currency) },
              { l: "자동갱신", v: c.auto_renew ? `ON (${c.auto_renew_notice_days}일 전)` : "OFF" },
              { l: "남은 일수", v: (() => { const d = getDaysUntil(c.end_date); return d > 0 ? `${d}일` : `${Math.abs(d)}일 경과`; })() },
              { l: "갱신 상태", v: renewalStatusLabels[c.renewal_status] || "해당없음" },
              { l: "갱신 차수", v: c.renewal_count > 0 ? `${c.renewal_count}차 갱신` : "최초 계약" },
              { l: "담당자", v: c.owner_name || "—" },
              { l: "담당자 이메일", v: c.owner_email || "—" },
            ].map((item, i) => (
              <div key={i} style={{ padding: "10px 14px", background: "#0D0E14", borderRadius: 12, border: "1px solid #1F2233" }}>
                <div style={{ fontSize: 10, color: "#636B7E", textTransform: "uppercase", marginBottom: 4 }}>{item.l}</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{item.v}</div>
              </div>
            ))}
          </div>
          {c.wiki_url && (() => {
            let u;
            try { u = new URL(c.wiki_url); } catch { return null; }
            if (u.protocol !== "http:" && u.protocol !== "https:") return null;
            const host = u.hostname;
            const isTrusted = host.endsWith("atlassian.net") || host.includes("confluence");
            return (
              <div style={{ padding: "12px 14px", background: "#0D0E14", borderRadius: 12, border: "1px solid #2B3044", marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#636B7E", textTransform: "uppercase", marginBottom: 6 }}>Wiki / 문서 링크</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <a href={c.wiki_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#4A9FD8", textDecoration: "none", wordBreak: "break-all" }}>{c.wiki_url}</a>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: isTrusted ? "#1B2333" : "#2D2A18", color: isTrusted ? "#4A9FD8" : "#F5B731", border: `1px solid ${isTrusted ? "#2E4A7A30" : "#8B833A40"}` }}>
                    {isTrusted ? "🔗" : "⚠️"} {host}
                  </span>
                  {!isTrusted && (
                    <span style={{ fontSize: 11, color: "#F5B731" }}>외부 링크</span>
                  )}
                </div>
              </div>
            );
          })()}
          {c.installment_enabled && c.installment_schedule && c.installment_schedule.length > 0 && (
            <div style={{ padding: "14px", background: "#0D0E14", borderRadius: 12, border: "1px solid #1F2233", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#636B7E", textTransform: "uppercase", marginBottom: 10 }}>분할 결제 일정</div>
              {c.installment_schedule.map((inst, idx) => {
                const dtp = getDaysUntil(inst.date); const isPast = dtp < 0; const isNear = dtp >= 0 && dtp <= 14;
                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, marginBottom: 4, background: isNear ? "#2D2A18" : "transparent", border: isNear ? "1px solid #8B833A40" : "1px solid transparent" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: inst.paid ? "#2DD4A0" : isPast ? "#F06B6B" : "#949BAD", minWidth: 30 }}>{inst.label}</span>
                      <span style={{ fontSize: 12, color: "#949BAD" }}>{inst.date}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#F0F1F4", fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(inst.amount, c.currency)}</span>
                      {inst.paid ? <span style={{ fontSize: 10, color: "#2DD4A0", background: "#1B2D2A", padding: "2px 8px", borderRadius: 10 }}>완료</span> : isNear ? <span style={{ fontSize: 10, color: "#F5B731", background: "#2D2A18", padding: "2px 8px", borderRadius: 10 }}>D-{dtp}</span> : isPast ? <span style={{ fontSize: 10, color: "#F06B6B", background: "#2D1B1B", padding: "2px 8px", borderRadius: 10 }}>미결제</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {c.notes && <div style={{ padding: "12px 14px", background: "#0D0E14", borderRadius: 12, border: "1px solid #1F2233", marginBottom: 20 }}><div style={{ fontSize: 10, color: "#636B7E", marginBottom: 6 }}>메모</div><div style={{ fontSize: 13, color: "#949BAD", lineHeight: 1.6 }}>{c.notes}</div></div>}
        </div>
      )}

      {tab === "renewal" && (
        <RenewalWorkflow contract={c} onComplete={(msg) => { if (onRefresh) onRefresh(msg); }} />
      )}

      {tab === "history" && (
        <div>
          {auditLoading ? <div style={{ textAlign: "center", padding: 40, color: "#636B7E", fontSize: 13 }}>로딩 중...</div> : auditLogs.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#444A58", fontSize: 13 }}>수정 이력이 없습니다.</div> : (
            <div style={{ maxHeight: 400, overflow: "auto" }}>
              {auditLogs.map((log, i) => (
                <div key={log.id || i} style={{ padding: "14px 16px", background: "#0D0E14", borderRadius: 10, border: "1px solid #1F2233", marginBottom: 8, animation: `fadeIn 0.3s ease ${i * 0.03}s both` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: log.field_name ? 8 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${actionColors[log.action]}15`, color: actionColors[log.action], border: `1px solid ${actionColors[log.action]}30` }}>{actionLabels[log.action] || log.action}</span>
                      {log.field_name && <span style={{ fontSize: 12, color: "#949BAD" }}>{fieldLabels[log.field_name] || log.field_name}</span>}
                    </div>
                    <span style={{ fontSize: 11, color: "#444A58" }}>{new Date(log.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {log.field_name && log.action === "update" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "8px 10px", background: "#151720", borderRadius: 6 }}>
                      <span style={{ color: "#F06B6B", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.old_value}>{log.old_value || "(비어있음)"}</span>
                      <span style={{ color: "#444A58", flexShrink: 0 }}>→</span>
                      <span style={{ color: "#2DD4A0", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.new_value}>{log.new_value || "(비어있음)"}</span>
                    </div>
                  )}
                  {log.changed_by && <div style={{ fontSize: 11, color: "#444A58", marginTop: 6 }}>변경자: {log.changed_by}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "1px solid #1F2233" }}>
        <button onClick={() => onToggleStatus(c)} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${c.status === "active" ? "#8B833A" : "#3A8B7A"}`, background: "transparent", color: c.status === "active" ? "#F5B731" : "#2DD4A0", fontSize: 12, cursor: "pointer" }}>{c.status === "active" ? "⏹ 종료 처리" : "▶ 재활성화"}</button>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => onDelete(c)} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #F06B6B40", background: "transparent", color: "#F06B6B", fontSize: 12, cursor: "pointer" }}>삭제</button>
          <button onClick={() => onEdit(c)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #4A9FD8, #3D8EC6)", color: "#F0F1F4", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>수정</button>
        </div>
      </div>
    </div>
  );
}
