'use client';
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase, signOut } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { fromDB, toDB, writeAuditLog, diffContract } from "@/lib/audit";
import { getDaysUntil, getUrgencyLevel, formatCurrency } from "@/lib/helpers";
import { urgencyColors, inputStyle } from "@/lib/constants";
import { generateNotifications, buildSlackMsg, buildEmailSubject, buildEmailBody } from "@/lib/notifications";

import StatusBadge from "./ui/StatusBadge";
import Modal from "./ui/Modal";
import Toast from "./ui/Toast";
import InputField from "./ui/InputField";
import ContractForm from "./ContractForm";
import CSVImportModal from "./CSVImportModal";
import OptionsManager from "./OptionsManager";
import TimelineCalendar from "./TimelineCalendar";
import ContractDetailWithAudit from "./ContractDetailWithAudit";
import DeleteConfirmModal from "./DeleteConfirmModal";
import UserManager from "./UserManager";

export default function ContractTracker() {
  const { user, isAdmin, role } = useAuth();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [editContract, setEditContract] = useState(null);
  const [showCSV, setShowCSV] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [sortBy, setSortBy] = useState("urgency");
  const [showDetail, setShowDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const [dismissedNotifs, setDismissedNotifs] = useState({});
  const [notifSettings, setNotifSettings] = useState({ slackEnabled: false, slackWebhookUrl: "", slackChannel: "", emailEnabled: false, emailRecipients: "" });
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showOptionsManager, setShowOptionsManager] = useState(false);
  const [showUserManager, setShowUserManager] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletedContracts, setDeletedContracts] = useState([]);
  const [customStudios, setCustomStudios] = useState(["KRAFTON", "PalM"]);
  const [customTypes, setCustomTypes] = useState(["SaaS", "Cloud Infrastructure", "License", "Service", "Maintenance", "Consulting"]);

  // Load custom options
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("app_settings").select("*").eq("key", "custom_options").single();
        if (data?.value) {
          const parsed = JSON.parse(data.value);
          if (parsed.studios) setCustomStudios(parsed.studios);
          if (parsed.types) setCustomTypes(parsed.types);
        }
      } catch {}
    })();
  }, []);

  const saveCustomOptions = async (studios, types) => {
    const value = JSON.stringify({ studios, types });
    try {
      const { data } = await supabase.from("app_settings").select("*").eq("key", "custom_options").single();
      if (data) { await supabase.from("app_settings").update({ value }).eq("key", "custom_options"); }
      else { await supabase.from("app_settings").insert({ key: "custom_options", value }); }
    } catch {}
  };

  const showToast = useCallback((msg, type = "info") => setToast({ message: msg, type }), []);

  const loadContracts = useCallback(async () => {
    try {
      // is_deleted 컬럼이 없을 수 있으므로 fallback
      let result = await supabase.from("contracts").select("*").eq("is_deleted", false).order("end_date", { ascending: true });
      if (result.error) {
        // is_deleted 컬럼 없으면 전체 조회
        result = await supabase.from("contracts").select("*").order("end_date", { ascending: true });
      }
      if (result.error) { showToast("데이터 로딩 실패: " + result.error.message, "error"); return; }
      setContracts((result.data || []).map(fromDB));
    } catch (e) {
      showToast("데이터 로딩 실패", "error");
    }
  }, [showToast]);

  const loadDeletedContracts = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("contracts").select("*").eq("is_deleted", true).order("deleted_at", { ascending: false });
      if (!error && data) setDeletedContracts(data.map(fromDB));
    } catch {}
  }, []);

  useEffect(() => { loadContracts().finally(() => setLoading(false)); }, [loadContracts]);

  const saveContract = async (c) => {
    if (c.id) {
      const oldContract = contracts.find((x) => x.id === c.id);
      const { error } = await supabase.from("contracts").update(toDB(c)).eq("id", c.id);
      if (error) { showToast("수정 실패: " + error.message, "error"); return; }
      if (oldContract) {
        const changes = diffContract(oldContract, c);
        if (changes.length > 0) await writeAuditLog(c.id, "update", changes, user?.email || "");
      }
    } else {
      const { data, error } = await supabase.from("contracts").insert(toDB(c)).select("id").single();
      if (error) { showToast("등록 실패: " + error.message, "error"); return; }
      if (data) await writeAuditLog(data.id, "create", [], user?.email || "");
    }
    await loadContracts(); setShowForm(false); setEditContract(null);
    showToast("저장 완료", "success");
  };

  const deleteContract = async (id) => {
    const { error } = await supabase.from("contracts").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) { showToast("삭제 실패", "error"); return; }
    await writeAuditLog(id, "delete", [], user?.email || "");
    await loadContracts(); setShowDetail(null); setDeleteTarget(null);
    showToast("휴지통으로 이동되었습니다.", "success");
  };

  const restoreContract = async (id) => {
    const { error } = await supabase.from("contracts").update({ is_deleted: false, deleted_at: null }).eq("id", id);
    if (error) { showToast("복구 실패", "error"); return; }
    await writeAuditLog(id, "restore", [], user?.email || "");
    await loadDeletedContracts(); await loadContracts();
    showToast("계약이 복구되었습니다.", "success");
  };

  const toggleContractStatus = async (c) => {
    const newStatus = c.status === "active" ? "terminated" : "active";
    const { error } = await supabase.from("contracts").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) { showToast("상태 변경 실패", "error"); return; }
    await writeAuditLog(c.id, "update", [{ field_name: "status", old_value: c.status, new_value: newStatus }], user?.email || "");
    await loadContracts(); setShowDetail(null);
    showToast(newStatus === "terminated" ? "계약이 종료 처리되었습니다." : "계약이 재활성화되었습니다.", "success");
  };

  const importContracts = async (rows) => {
    const dbRows = rows.map(toDB);
    const { error } = await supabase.from("contracts").insert(dbRows);
    if (error) { showToast("Import 실패: " + error.message, "error"); return; }
    await loadContracts();
    showToast(`${rows.length}건 Import 완료`, "success");
  };

  const exportCSV = () => {
    const h = "vendor,name,supplier,type,start_date,end_date,renewal_date,auto_renew,notice_days,annual_cost,currency,studio,owner_name,owner_email,wiki_url,notes";
    const r = contracts.map((c) => [c.vendor, c.name, c.supplier || "", c.type, c.start_date, c.end_date, c.renewal_date, c.auto_renew, c.auto_renew_notice_days, c.annual_cost, c.currency, c.studio, c.owner_name || "", c.owner_email || "", c.wiki_url || "", `"${(c.notes || "").replace(/"/g, '""')}"`].join(","));
    const blob = new Blob(["\uFEFF" + [h, ...r].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `contracts_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const sendSlack = async (msg) => {
    if (!notifSettings.slackWebhookUrl) { showToast("Slack Webhook URL 미설정", "error"); return; }
    try { await fetch(notifSettings.slackWebhookUrl, { method: "POST", body: JSON.stringify({ text: msg }) }); showToast("Slack 발송 완료", "success"); } catch { showToast("Slack 발송 실패", "error"); }
  };

  const sendEmail = (subject, body) => {
    window.open(`mailto:${encodeURIComponent(notifSettings.emailRecipients || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
    showToast("Outlook 열림", "success");
  };

  const existingStudios = useMemo(() => [...customStudios].filter(Boolean), [customStudios]);
  const existingTypes = useMemo(() => [...customTypes].filter(Boolean), [customTypes]);
  const notifications = useMemo(() => generateNotifications(contracts), [contracts]);
  const activeNotifs = notifications.filter((n) => !dismissedNotifs[n.id]);
  const criticalCount = activeNotifs.filter((n) => n.urgency === "critical" || n.urgency === "expired").length;

  const filtered = useMemo(() => {
    let list = contracts.filter((c) => {
      const ms = !searchTerm || `${c.vendor} ${c.name} ${c.notes}`.toLowerCase().includes(searchTerm.toLowerCase());
      const mt = filterType === "all" || c.type === filterType;
      const mst = filterStatus === "all" || c.status === filterStatus;
      return ms && mt && mst;
    });
    list.sort((a, b) => {
      if (sortBy === "urgency") return Math.min(getDaysUntil(a.end_date), getDaysUntil(a.renewal_date)) - Math.min(getDaysUntil(b.end_date), getDaysUntil(b.renewal_date));
      if (sortBy === "cost") return b.annual_cost - a.annual_cost;
      if (sortBy === "vendor") return a.vendor.localeCompare(b.vendor);
      return 0;
    });
    return list;
  }, [contracts, searchTerm, filterType, filterStatus, sortBy]);

  const stats = useMemo(() => {
    const a = contracts.filter((c) => c.status === "active");
    return {
      total: a.length,
      totalCostUSD: a.filter((c) => c.currency === "USD").reduce((s, c) => s + (c.annual_cost || 0), 0),
      autoRenewCount: a.filter((c) => c.auto_renew).length,
      urgentCount: a.filter((c) => ["critical", "expired"].includes(getUrgencyLevel(c))).length,
    };
  }, [contracts]);

  const navItems = [
    { id: "dashboard", label: "대시보드", icon: "◫" },
    { id: "notifications", label: "알림 센터", icon: "🔔", badge: activeNotifs.length },
    { id: "list", label: "계약 목록", icon: "☰" },
    { id: "types", label: "유형별", icon: "⬡" },
    { id: "trash", label: "휴지통", icon: "🗑" },
    ...(isAdmin ? [{ id: "admin", label: "관리자", icon: "🔑" }] : []),
  ];

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #4A6FA5, #3A5A8A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>C</div>
      <div style={{ fontSize: 14, color: "#6B7280" }}>데이터 불러오는 중...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", overflow: "hidden" }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: "1px solid #1A1F2B", background: "linear-gradient(180deg, #0F1219 0%, #0B0E14 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #4A6FA5, #3A5A8A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>C</div>
          <div><div style={{ fontSize: 16, fontWeight: 700 }}>Contract Tracker</div><div style={{ fontSize: 10, color: "#4A5568", letterSpacing: "2px", textTransform: "uppercase" }}>IT Procurement</div></div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setView("notifications")} style={{ position: "relative", padding: "8px 14px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 14, cursor: "pointer" }}>
            🔔{criticalCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", background: "#FF4444", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse 1.5s infinite" }}>{criticalCount}</span>}
          </button>
          {isAdmin && <button onClick={() => setShowCSV(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 12, cursor: "pointer" }}>↑ Import</button>}
          <button onClick={exportCSV} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 12, cursor: "pointer" }}>↓ Export</button>
          {isAdmin && <button onClick={() => setShowOptionsManager(true)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 12, cursor: "pointer" }}>⚙</button>}
          {isAdmin && <button onClick={() => { setEditContract(null); setShowForm(true); }} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #4A6FA5, #3A5A8A)", color: "#E8ECF2", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ 계약 등록</button>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8, paddingLeft: 8, borderLeft: "1px solid #2E3440" }}>
            <span style={{ fontSize: 11, color: "#6B7280" }}>{user?.email}</span>
            <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: isAdmin ? "#1B2333" : "#1A1D23", color: isAdmin ? "#6BA3FF" : "#8892A0", border: `1px solid ${isAdmin ? "#2E4A7A" : "#2E3440"}` }}>{isAdmin ? 'Admin' : 'Viewer'}</span>
            <button onClick={() => signOut()} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 11, cursor: "pointer" }}>로그아웃</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 69px)" }}>
        {/* Sidebar */}
        <div style={{ width: 180, padding: "20px 12px", borderRight: "1px solid #1A1F2B", flexShrink: 0 }}>
          {navItems.map((item) => (
            <button key={item.id} onClick={() => { setView(item.id); if (item.id === "trash") loadDeletedContracts(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", borderRadius: 8, border: "none", background: view === item.id ? "#1A1F2B" : "transparent", color: view === item.id ? "#E8ECF2" : "#6B7280", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 4, textAlign: "left" }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}
              {item.badge > 0 && <span style={{ marginLeft: "auto", background: criticalCount > 0 && item.id === "notifications" ? "#FF4444" : "#4A6FA5", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10 }}>{item.badge}</span>}
            </button>
          ))}
          <div style={{ margin: "20px 14px", padding: "14px 0", borderTop: "1px solid #1A1F2B" }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.total}</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>활성 계약</div>
            {stats.urgentCount > 0 && <div style={{ fontSize: 12, color: "#FF6B6B" }}>⚠ {stats.urgentCount}건 긴급</div>}
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: 28, overflow: "auto" }}>
          {/* Dashboard */}
          {view === "dashboard" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
                {[
                  { label: "전체 계약", value: stats.total, sub: "건", color: "#4A6FA5" },
                  { label: "연간 비용 (USD)", value: formatCurrency(stats.totalCostUSD), sub: "/yr", color: "#6BA3FF" },
                  { label: "자동갱신", value: stats.autoRenewCount, sub: "건", color: "#00D4AA" },
                  { label: "알림", value: activeNotifs.length, sub: "건", color: criticalCount > 0 ? "#FF6B6B" : "#FFE066" },
                ].map((card, i) => (
                  <div key={i} onClick={i === 3 ? () => setView("notifications") : undefined} style={{ padding: "20px 22px", background: "#111620", border: "1px solid #1A1F2B", borderRadius: 14, cursor: i === 3 ? "pointer" : "default", animation: `fadeIn 0.4s ease ${i * 0.08}s both` }}>
                    <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10 }}>{card.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: card.color }}>{card.value}<span style={{ fontSize: 12, color: "#4A5568", marginLeft: 4 }}>{card.sub}</span></div>
                  </div>
                ))}
              </div>
              {/* 갱신 검토 필요 섹션 */}
              {contracts.filter((c) => c.renewal_status === "pending_review").length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#FFE066", marginBottom: 14 }}>🔄 갱신 검토 필요</div>
                  {contracts.filter((c) => c.renewal_status === "pending_review").map((c, i) => {
                    const dl = getDaysUntil(c.end_date);
                    return (
                      <div key={c.id} onClick={() => setShowDetail(c)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "#2D2A18", border: "1px solid #8B833A40", borderRadius: 12, marginBottom: 8, cursor: "pointer", animation: `slideIn 0.3s ease ${i * 0.06}s both` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#2D2A18", color: "#FFE066", border: "1px solid #8B833A" }}>⏳ 검토 대기</span>
                          <div><div style={{ fontSize: 14, fontWeight: 600 }}>{c.vendor}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{c.name} · {c.owner_name || c.studio} · {formatCurrency(c.annual_cost, c.currency)}</div></div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: dl <= 30 ? "#FF6B6B" : "#FFE066" }}>{dl > 0 ? `D-${dl}` : `D+${Math.abs(dl)}`}</div>
                          <div style={{ fontSize: 11, color: "#6B7280" }}>{c.renewal_count > 0 ? `${c.renewal_count}차 갱신` : "최초 갱신"}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <TimelineCalendar contracts={contracts} onSelectContract={setShowDetail} />
              <div style={{ fontSize: 14, fontWeight: 600, color: "#8892A0", marginBottom: 14 }}>⚡ 주의가 필요한 계약</div>
              {contracts.filter((c) => c.status === "active" && (() => { const d = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date)); return d > 0 && d <= 90; })()).sort((a, b) => Math.min(getDaysUntil(a.end_date), getDaysUntil(a.renewal_date)) - Math.min(getDaysUntil(b.end_date), getDaysUntil(b.renewal_date))).map((c, i) => {
                const urg = getUrgencyLevel(c);
                const dl = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date));
                const uc = urgencyColors[urg];
                return (
                  <div key={c.id} onClick={() => setShowDetail(c)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: uc.bg, border: `1px solid ${uc.border}40`, borderRadius: 12, marginBottom: 8, cursor: "pointer", animation: `slideIn 0.3s ease ${i * 0.06}s both` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <StatusBadge urgency={urg} autoRenew={c.auto_renew} />
                      <div><div style={{ fontSize: 14, fontWeight: 600 }}>{c.vendor}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{c.name}{c.owner_name ? ` · ${c.owner_name}` : ""}</div></div>
                    </div>
                    <div style={{ textAlign: "right" }}><div style={{ fontSize: 18, fontWeight: 700, color: uc.text }}>D-{dl}</div><div style={{ fontSize: 11, color: "#6B7280" }}>{c.end_date}</div></div>
                  </div>
                );
              })}
              {contracts.filter((c) => c.status === "active" && (() => { const d = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date)); return d > 0 && d <= 90; })()).length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#4A5568", fontSize: 13 }}>90일 이내 만료 예정인 계약이 없습니다 ✓</div>}
            </div>
          )}

          {/* Notifications */}
          {view === "notifications" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div><div style={{ fontSize: 18, fontWeight: 700 }}>🔔 알림 센터</div><div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{activeNotifs.length}건</div></div>
                <button onClick={() => setShowNotifSettings(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 12, cursor: "pointer" }}>⚙ 설정</button>
              </div>
              {activeNotifs.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "#4A5568" }}>알림 없음 ✓</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {activeNotifs.map((n, i) => {
                    const uc = urgencyColors[n.urgency];
                    return (
                      <div key={n.id} style={{ padding: "18px 22px", background: uc.bg, border: `1px solid ${uc.border}60`, borderRadius: 14, animation: `fadeIn 0.3s ease ${i * 0.05}s both`, borderLeft: `4px solid ${uc.dot}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: uc.text }}>{n.title}</div>
                          <span style={{ fontSize: 20, fontWeight: 700, color: uc.text }}>{n.daysLeft > 0 ? `D-${n.daysLeft}` : n.daysLeft === 0 ? "D-Day" : `D+${Math.abs(n.daysLeft)}`}</span>
                        </div>
                        <div style={{ fontSize: 13, color: "#8892A0", padding: "10px 14px", background: "rgba(0,0,0,0.2)", borderRadius: 8, marginBottom: 14 }}>
                          {n.message}
                          {n.ownerName ? <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "#6B7280" }}>담당: {n.ownerName}</span> : null}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button onClick={() => sendSlack(buildSlackMsg(n))} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#4A154B", color: "#E8ECF2", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>💬 Slack</button>
                          <button onClick={() => sendEmail(buildEmailSubject(n), buildEmailBody(n))} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#0078D4", color: "#E8ECF2", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>📧 Outlook</button>
                          <button onClick={() => setDismissedNotifs((p) => ({ ...p, [n.id]: true }))} style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#6B7280", fontSize: 11, cursor: "pointer" }}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* List */}
          {view === "list" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <input style={{ ...inputStyle, width: 240 }} placeholder="🔍 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <select style={{ ...inputStyle, width: 160 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}><option value="all">모든 유형</option>{existingTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                <select style={{ ...inputStyle, width: 130 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}><option value="all">전체 상태</option><option value="active">활성</option><option value="terminated">종료</option></select>
                <select style={{ ...inputStyle, width: 140 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}><option value="urgency">긴급도순</option><option value="cost">비용순</option><option value="vendor">벤더순</option></select>
              </div>
              <div style={{ borderRadius: 12, border: "1px solid #1A1F2B", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "#111620" }}>{["상태", "벤더", "계약명", "유형", "담당자", "종료일", "D-Day", "연간비용", ""].map((h, i) => <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600, borderBottom: "1px solid #1A1F2B" }}>{h}</th>)}</tr></thead>
                  <tbody>{filtered.map((c) => {
                    const urg = getUrgencyLevel(c);
                    const dl = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date));
                    const uc = urgencyColors[urg];
                    const isTerm = c.status === "terminated";
                    return (
                      <tr key={c.id} onClick={() => setShowDetail(c)} style={{ borderBottom: "1px solid #1A1F2B", cursor: "pointer", opacity: isTerm ? 0.5 : 1 }} onMouseEnter={(e) => e.currentTarget.style.background = "#111620"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "12px 16px" }}>{isTerm ? <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#1A1D23", color: "#6B7280", border: "1px solid #2E3440" }}>종료</span> : <StatusBadge urgency={urg} autoRenew={c.auto_renew} />}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 600 }}>{c.vendor}</td>
                        <td style={{ padding: "12px 16px", color: "#8892A0" }}>{c.name}</td>
                        <td style={{ padding: "12px 16px" }}><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, background: "#1A1F2B", color: "#8892A0" }}>{c.type}</span></td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#8892A0" }}>{c.owner_name || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#8892A0" }}>{c.end_date}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 700, color: isTerm ? "#6B7280" : uc.text }}>{isTerm ? "종료" : dl > 0 ? `D-${dl}` : dl === 0 ? "D-Day" : `D+${Math.abs(dl)}`}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 600 }}>{formatCurrency(c.annual_cost, c.currency)}</td>
                        <td style={{ padding: "12px 16px", display: "flex", gap: 6 }}>
                          {isAdmin && <button onClick={(e) => { e.stopPropagation(); setEditContract(c); setShowForm(true); }} style={{ background: "none", border: "1px solid #2E3440", borderRadius: 6, color: "#6B7280", padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>수정</button>}
                          {isAdmin && <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }} style={{ background: "none", border: "1px solid #8B3A3A40", borderRadius: 6, color: "#FF6B6B", padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>삭제</button>}
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
                {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#4A5568", fontSize: 13 }}>검색 결과 없음</div>}
              </div>
            </div>
          )}

          {/* Types */}
          {view === "types" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#8892A0", marginBottom: 20 }}>계약 유형별 현황</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
                {existingTypes.map((type) => {
                  const tc = contracts.filter((c) => c.type === type && c.status === "active");
                  const cost = tc.reduce((s, c) => s + (c.currency === "USD" ? (c.annual_cost || 0) : 0), 0);
                  return (
                    <div key={type} style={{ padding: 20, background: "#111620", border: "1px solid #1A1F2B", borderRadius: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                        <div><div style={{ fontSize: 16, fontWeight: 700 }}>{type}</div><div style={{ fontSize: 11, color: "#6B7280" }}>{tc.length}건 활성</div></div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#4A6FA5" }}>{formatCurrency(cost)}</div>
                      </div>
                      {tc.map((c) => {
                        const urg = getUrgencyLevel(c);
                        const uc = urgencyColors[urg];
                        const dl = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date));
                        return (
                          <div key={c.id} onClick={() => setShowDetail(c)} style={{ padding: "10px 12px", borderRadius: 8, background: "#0B0E14", border: "1px solid #1A1F2B", marginBottom: 6, cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
                            <div><div style={{ fontSize: 12, fontWeight: 500 }}>{c.vendor} — {c.name}</div><div style={{ fontSize: 10, color: "#6B7280" }}>{c.owner_name || c.studio}</div></div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: uc.text }}>D{dl > 0 ? `-${dl}` : `+${Math.abs(dl)}`}</span>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: uc.dot }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Trash */}
          {view === "trash" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div><div style={{ fontSize: 18, fontWeight: 700 }}>🗑 휴지통</div><div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>삭제된 계약은 30일 후 완전 삭제됩니다.</div></div>
              </div>
              {deletedContracts.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "#4A5568", fontSize: 13 }}>휴지통이 비어 있습니다.</div> : (
                <div style={{ borderRadius: 12, border: "1px solid #1A1F2B", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ background: "#111620" }}>{["벤더", "계약명", "유형", "종료일", "삭제일", "상태", ""].map((h, i) => <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600, borderBottom: "1px solid #1A1F2B" }}>{h}</th>)}</tr></thead>
                    <tbody>{deletedContracts.map((c) => {
                      const deletedDate = c.deleted_at ? new Date(c.deleted_at) : new Date();
                      const daysSinceDelete = Math.floor((new Date() - deletedDate) / 86400000);
                      const daysUntilPurge = 30 - daysSinceDelete;
                      const isNearPurge = daysUntilPurge <= 7;
                      return (
                        <tr key={c.id} style={{ borderBottom: "1px solid #1A1F2B", opacity: 0.8 }}>
                          <td style={{ padding: "12px 16px", fontWeight: 600 }}>{c.vendor}</td>
                          <td style={{ padding: "12px 16px", color: "#8892A0" }}>{c.name}</td>
                          <td style={{ padding: "12px 16px" }}><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, background: "#1A1F2B", color: "#8892A0" }}>{c.type}</span></td>
                          <td style={{ padding: "12px 16px", color: "#8892A0" }}>{c.end_date}</td>
                          <td style={{ padding: "12px 16px", color: "#6B7280", fontSize: 12 }}>{deletedDate.toLocaleDateString("ko-KR")}</td>
                          <td style={{ padding: "12px 16px" }}>{daysUntilPurge <= 0 ? <span style={{ fontSize: 11, color: "#FF4444", fontWeight: 600 }}>완전 삭제 대상</span> : isNearPurge ? <span style={{ fontSize: 11, color: "#FF6B6B", fontWeight: 600 }}>{daysUntilPurge}일 후 완전 삭제</span> : <span style={{ fontSize: 11, color: "#6B7280" }}>{daysUntilPurge}일 남음</span>}</td>
                          <td style={{ padding: "12px 16px" }}><button onClick={() => restoreContract(c.id)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #3A8B7A", background: "transparent", color: "#66FFCC", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>복구</button></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Admin */}
          {view === "admin" && isAdmin && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>🔑 관리자</div>
              <UserManager onClose={() => setView("dashboard")} />
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title="계약 상세" width={650}>
        {showDetail && <ContractDetailWithAudit contract={showDetail} onToggleStatus={toggleContractStatus} onEdit={(c) => { setEditContract(c); setShowForm(true); setShowDetail(null); }} onDelete={(c) => { setDeleteTarget(c); setShowDetail(null); }} onRefresh={async (msg) => { await loadContracts(); setShowDetail(null); if (msg) showToast(msg, "success"); }} />}
      </Modal>

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditContract(null); }} title={editContract ? "계약 수정" : "계약 등록"}>
        <ContractForm contract={editContract} onSave={saveContract} onCancel={() => { setShowForm(false); setEditContract(null); }} existingStudios={existingStudios} existingTypes={existingTypes} />
      </Modal>

      <CSVImportModal isOpen={showCSV} onClose={() => setShowCSV(false)} onImport={importContracts} />

      <Modal isOpen={showNotifSettings} onClose={() => setShowNotifSettings(false)} title="⚙ 알림 설정" width={520}>
        <div>
          <InputField label="Slack Webhook URL"><input style={inputStyle} value={notifSettings.slackWebhookUrl} onChange={(e) => setNotifSettings((p) => ({ ...p, slackWebhookUrl: e.target.value }))} placeholder="https://hooks.slack.com/services/..." /></InputField>
          <InputField label="Slack 채널명"><input style={inputStyle} value={notifSettings.slackChannel} onChange={(e) => setNotifSettings((p) => ({ ...p, slackChannel: e.target.value }))} placeholder="#it-procurement" /></InputField>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "#8892A0", marginBottom: 16 }}><input type="checkbox" checked={notifSettings.slackEnabled} onChange={(e) => setNotifSettings((p) => ({ ...p, slackEnabled: e.target.checked }))} style={{ accentColor: "#4A6FA5" }} />Slack 활성화</label>
          <div style={{ borderTop: "1px solid #1A1F2B", margin: "16px 0" }} />
          <InputField label="수신 이메일 (쉼표 구분)"><input style={inputStyle} value={notifSettings.emailRecipients} onChange={(e) => setNotifSettings((p) => ({ ...p, emailRecipients: e.target.value }))} placeholder="user@krafton.com" /></InputField>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "#8892A0" }}><input type="checkbox" checked={notifSettings.emailEnabled} onChange={(e) => setNotifSettings((p) => ({ ...p, emailEnabled: e.target.checked }))} style={{ accentColor: "#4A6FA5" }} />Outlook 활성화</label>
        </div>
      </Modal>

      <Modal isOpen={showOptionsManager} onClose={() => setShowOptionsManager(false)} title="⚙ 스튜디오 / 계약유형 관리" width={560}>
        <OptionsManager
          studios={customStudios} types={customTypes} contracts={contracts}
          onSave={(studios, types) => { setCustomStudios(studios); setCustomTypes(types); saveCustomOptions(studios, types); setShowOptionsManager(false); showToast("목록이 저장되었습니다.", "success"); }}
          onClose={() => setShowOptionsManager(false)}
        />
      </Modal>

      <DeleteConfirmModal isOpen={!!deleteTarget} contract={deleteTarget} onConfirm={deleteContract} onClose={() => setDeleteTarget(null)} />

      <Modal isOpen={showUserManager} onClose={() => setShowUserManager(false)} title="👥 사용자 관리" width={620}>
        <UserManager onClose={() => setShowUserManager(false)} />
      </Modal>
    </div>
  );
}
