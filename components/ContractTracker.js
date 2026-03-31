'use client';
import { useState, useEffect, useMemo, useCallback } from "react";
import { LayoutDashboard, Bell, List, Clock, Trash2, AlertTriangle, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
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

export default function ContractTracker() {
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
  const [expiredSortBy, setExpiredSortBy] = useState("end_date_desc");
  const [expiredSearch, setExpiredSearch] = useState("");
  const [expiredPage, setExpiredPage] = useState(1);
  const [showDetail, setShowDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const [dismissedNotifs, setDismissedNotifs] = useState({});
  const [notifSettings, setNotifSettings] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("ct_notif_settings");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return { slackEnabled: false, slackWebhookUrl: "", slackChannel: "", emailEnabled: false, emailRecipients: "" };
  });
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showOptionsManager, setShowOptionsManager] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletedContracts, setDeletedContracts] = useState([]);
  const [customStudios, setCustomStudios] = useState(["KRAFTON", "PalM"]);
  const [customTypes, setCustomTypes] = useState(["SaaS", "Cloud Infrastructure", "License", "Service", "Maintenance", "Consulting"]);

  const showToast = useCallback((msg, type = "info") => setToast({ message: msg, type }), []);

  const loadContracts = useCallback(async () => {
    try {
      let result = await supabase.from("contracts").select("*").eq("is_deleted", false).order("end_date", { ascending: true });
      if (result.error) {
        result = await supabase.from("contracts").select("*").order("end_date", { ascending: true });
      }
      if (result.error) { showToast("데이터 로딩 실패: " + result.error.message, "error"); return; }
      setContracts((result.data || []).map(fromDB));
    } catch {
      showToast("데이터 로딩 실패", "error");
    }
  }, [showToast]);

  const loadCustomOptions = useCallback(async () => {
    try {
      const { data } = await supabase.from("app_settings").select("*").eq("key", "custom_options").single();
      if (data?.value) {
        const parsed = JSON.parse(data.value);
        if (parsed.studios) setCustomStudios(parsed.studios);
        if (parsed.types) setCustomTypes(parsed.types);
      }
    } catch {}
  }, []);

  const loadDeletedContracts = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("contracts").select("*").eq("is_deleted", true).order("deleted_at", { ascending: false });
      if (!error && data) setDeletedContracts(data.map(fromDB));
    } catch {}
  }, []);

  const saveCustomOptions = async (studios, types) => {
    const value = JSON.stringify({ studios, types });
    try {
      const { data } = await supabase.from("app_settings").select("*").eq("key", "custom_options").single();
      if (data) { await supabase.from("app_settings").update({ value }).eq("key", "custom_options"); }
      else { await supabase.from("app_settings").insert({ key: "custom_options", value }); }
    } catch {}
  };

  useEffect(() => {
    try { localStorage.setItem("ct_notif_settings", JSON.stringify(notifSettings)); } catch {}
  }, [notifSettings]);

  // 병렬 로딩: contracts + custom options 동시 요청
  useEffect(() => {
    Promise.all([loadContracts(), loadCustomOptions()])
      .finally(() => setLoading(false));
  }, [loadContracts, loadCustomOptions]);

  const saveContract = async (c) => {
    if (c.id) {
      const oldContract = contracts.find((x) => x.id === c.id);
      const { error } = await supabase.from("contracts").update(toDB(c)).eq("id", c.id);
      if (error) { showToast("수정 실패: " + error.message, "error"); return; }
      if (oldContract) {
        const changes = diffContract(oldContract, c);
        if (changes.length > 0) await writeAuditLog(c.id, "update", changes, "");
      }
    } else {
      const { data, error } = await supabase.from("contracts").insert(toDB(c)).select("id").single();
      if (error) { showToast("등록 실패: " + error.message, "error"); return; }
      if (data) await writeAuditLog(data.id, "create", [], "");
    }
    await loadContracts(); setShowForm(false); setEditContract(null);
    showToast("저장 완료", "success");
  };

  const deleteContract = async (id) => {
    const { error } = await supabase.from("contracts").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) { showToast("삭제 실패", "error"); return; }
    await writeAuditLog(id, "delete", [], "");
    await loadContracts(); setShowDetail(null); setDeleteTarget(null);
    showToast("휴지통으로 이동되었습니다.", "success");
  };

  const restoreContract = async (id) => {
    const { error } = await supabase.from("contracts").update({ is_deleted: false, deleted_at: null }).eq("id", id);
    if (error) { showToast("복구 실패", "error"); return; }
    await writeAuditLog(id, "restore", [], "");
    await loadDeletedContracts(); await loadContracts();
    showToast("계약이 복구되었습니다.", "success");
  };

  const toggleContractStatus = async (c) => {
    const newStatus = c.status === "active" ? "terminated" : "active";
    const { error } = await supabase.from("contracts").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) { showToast("상태 변경 실패", "error"); return; }
    await writeAuditLog(c.id, "update", [{ field_name: "status", old_value: c.status, new_value: newStatus }], "");
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

  const csvEscape = (val) => {
    const s = String(val ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportCSV = () => {
    const h = "vendor,name,supplier,type,start_date,end_date,renewal_date,auto_renew,notice_days,annual_cost,currency,studio,owner_name,owner_email,wiki_url,notes";
    const r = contracts.map((c) => [c.vendor, c.name, c.supplier || "", c.type, c.start_date, c.end_date, c.renewal_date, c.auto_renew, c.auto_renew_notice_days, c.annual_cost, c.currency, c.studio, c.owner_name || "", c.owner_email || "", c.wiki_url || "", c.notes || ""].map(csvEscape).join(","));
    const blob = new Blob(["\uFEFF" + [h, ...r].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `contracts_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const sendSlack = async (msg) => {
    if (!notifSettings.slackWebhookUrl) { showToast("Slack Webhook URL 미설정", "error"); return; }
    try {
      const res = await fetch("/api/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: notifSettings.slackWebhookUrl, message: msg }),
      });
      if (res.ok) showToast("Slack 발송 완료", "success");
      else { const data = await res.json(); showToast(data.error || "Slack 발송 실패", "error"); }
    } catch { showToast("Slack 발송 실패", "error"); }
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
      const ms = !searchTerm || `${c.vendor} ${c.name} ${c.owner_name || ""} ${c.supplier || ""} ${c.type} ${c.notes}`.toLowerCase().includes(searchTerm.toLowerCase());
      const mt = filterType === "all" || c.type === filterType;
      const notTerminated = c.status !== "terminated";
      const notExpired = getDaysUntil(c.end_date) >= 0;
      return ms && mt && notTerminated && notExpired;
    });
    list.sort((a, b) => {
      if (sortBy === "urgency") return Math.min(getDaysUntil(a.end_date), getDaysUntil(a.renewal_date)) - Math.min(getDaysUntil(b.end_date), getDaysUntil(b.renewal_date));
      if (sortBy === "end_date_asc") return (a.end_date || "").localeCompare(b.end_date || "");
      if (sortBy === "end_date_desc") return (b.end_date || "").localeCompare(a.end_date || "");
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
      autoRenewCount: a.filter((c) => c.auto_renew).length,
      urgentCount: a.filter((c) => ["critical", "expired"].includes(getUrgencyLevel(c))).length,
    };
  }, [contracts]);

  const expiredContracts = useMemo(() => contracts.filter((c) => c.status === "terminated" || (c.status === "active" && getDaysUntil(c.end_date) < 0)), [contracts]);

  const recentlyExpired = useMemo(() => contracts.filter((c) => {
    if (c.status === "terminated") return true;
    if (c.status === "active") { const d = getDaysUntil(c.end_date); return d < 0 && d >= -15; }
    return false;
  }), [contracts]);

  const navItems = [
    { id: "dashboard", label: "대시보드", icon: LayoutDashboard },
    { id: "notifications", label: "알림 센터", icon: Bell, badge: activeNotifs.length },
    { id: "list", label: "계약 목록", icon: List },
    { id: "expired", label: "계약 종료", icon: Clock },
    { id: "trash", label: "휴지통", icon: Trash2 },
  ];

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg, #5B8DEF, #4A6FB8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>C</div>
      <div style={{ fontSize: 14, color: "#6B7280" }}>데이터 불러오는 중...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", overflow: "hidden" }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", borderBottom: "1px solid #1E2029", background: "#12141A", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg, #5B8DEF, #4A6FB8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>C</div>
          <div><div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px" }}>Contract Tracker</div><div style={{ fontSize: 10, color: "#464B55", letterSpacing: "1.5px", textTransform: "uppercase" }}>IT Procurement</div></div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setView("notifications")} style={{ position: "relative", padding: "8px 14px", borderRadius: 8, border: "1px solid #2A2D38", background: "transparent", color: "#9BA1AE", fontSize: 14, cursor: "pointer" }}>
            <Bell size={16} strokeWidth={2} />{criticalCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: "50%", background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse 1.5s infinite" }}>{criticalCount}</span>}
          </button>
          <button onClick={() => setShowCSV(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2A2D38", background: "transparent", color: "#9BA1AE", fontSize: 12, cursor: "pointer" }}>↑ Import</button>
          <button onClick={exportCSV} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2A2D38", background: "transparent", color: "#9BA1AE", fontSize: 12, cursor: "pointer" }}>↓ Export</button>
          <button onClick={() => setShowOptionsManager(true)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #2A2D38", background: "transparent", color: "#9BA1AE", fontSize: 12, cursor: "pointer" }}>⚙</button>
          <button onClick={() => { setEditContract(null); setShowForm(true); }} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#5B8DEF", color: "#EDEEF0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ 계약 등록</button>
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 56px)" }}>
        {/* Sidebar */}
        <div style={{ width: 220, padding: "16px 12px", borderRight: "1px solid #1E2029", background: "#12141A", flexShrink: 0 }}>
          {navItems.map((item) => (
            <button key={item.id} onClick={() => { setView(item.id); if (item.id === "trash") loadDeletedContracts(); }} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", height: 38, padding: "0 14px", borderRadius: 8, border: "none", background: view === item.id ? "#5B8DEF18" : "transparent", color: view === item.id ? "#EDEEF0" : "#6B7280", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", marginBottom: 4, textAlign: "left", borderLeft: view === item.id ? "2px solid #5B8DEF" : "2px solid transparent" }}>
              <item.icon size={18} strokeWidth={2} />{item.label}
              {item.badge > 0 && <span style={{ marginLeft: "auto", background: criticalCount > 0 && item.id === "notifications" ? "#EF4444" : "#5B8DEF", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10 }}>{item.badge}</span>}
            </button>
          ))}
          <div style={{ margin: "20px 14px", padding: 16, background: "#1A1D25", borderRadius: 10, border: "1px solid #1E2029" }}>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{stats.total}</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>활성 계약</div>
            {stats.urgentCount > 0 && <div style={{ fontSize: 12, color: "#F87171" }}>⚠ {stats.urgentCount}건 긴급</div>}
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: 32, overflow: "auto" }}>
          {/* Dashboard */}
          {view === "dashboard" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
                {[
                  { label: "전체 계약", value: stats.total, sub: "건", color: "#5B8DEF" },
                  { label: "자동갱신", value: stats.autoRenewCount, sub: "건", color: "#34D399" },
                  { label: "알림", value: activeNotifs.length, sub: "건", color: criticalCount > 0 ? "#F87171" : "#FBBF24" },
                ].map((card, i) => (
                  <div key={i} onClick={i === 2 ? () => setView("notifications") : undefined} style={{ padding: 24, background: "#12141A", border: "1px solid #1E2029", borderRadius: 12, cursor: i === 2 ? "pointer" : "default", animation: `fadeIn 0.4s ease ${i * 0.08}s both` }}>
                    <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 10, fontWeight: 500 }}>{card.label}</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: card.color, fontFamily: "'JetBrains Mono', monospace" }}>{card.value}<span style={{ fontSize: 12, color: "#464B55", marginLeft: 4 }}>{card.sub}</span></div>
                  </div>
                ))}
              </div>
              <TimelineCalendar contracts={contracts} onSelectContract={setShowDetail} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "#9BA1AE", marginBottom: 14 }}><AlertTriangle size={16} strokeWidth={2} /> 주의가 필요한 계약</div>
              {contracts.filter((c) => c.status === "active" && (() => { const d = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date)); return d > 0 && d <= 90; })()).sort((a, b) => Math.min(getDaysUntil(a.end_date), getDaysUntil(a.renewal_date)) - Math.min(getDaysUntil(b.end_date), getDaysUntil(b.renewal_date))).map((c, i) => {
                const urg = getUrgencyLevel(c);
                const dl = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date));
                const uc = urgencyColors[urg];
                return (
                  <div key={c.id} onClick={() => setShowDetail(c)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: uc.bg, border: `1px solid ${uc.border}40`, borderRadius: 10, marginBottom: 6, cursor: "pointer", animation: `slideIn 0.3s ease ${i * 0.06}s both` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <StatusBadge urgency={urg} autoRenew={c.auto_renew} />
                      <div><div style={{ fontSize: 14, fontWeight: 600 }}>{c.vendor}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{c.name}{c.owner_name ? ` · ${c.owner_name}` : ""}</div></div>
                    </div>
                    <div style={{ textAlign: "right" }}><div style={{ fontSize: 20, fontWeight: 700, color: uc.text, fontFamily: "'JetBrains Mono', monospace" }}>D-{dl}</div><div style={{ fontSize: 11, color: "#6B7280" }}>{c.end_date}</div></div>
                  </div>
                );
              })}
              {contracts.filter((c) => c.status === "active" && (() => { const d = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date)); return d > 0 && d <= 90; })()).length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#464B55", fontSize: 13 }}>90일 이내 만료 예정인 계약이 없습니다 ✓</div>}

              {recentlyExpired.length > 0 && (
                <div style={{ marginTop: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "#F87171", marginBottom: 14 }}><Clock size={16} strokeWidth={2} /> 계약 종료 (최근 15일)</div>
                  {recentlyExpired.sort((a, b) => getDaysUntil(a.end_date) - getDaysUntil(b.end_date)).map((c, i) => {
                    const dl = getDaysUntil(c.end_date);
                    return (
                      <div key={c.id} onClick={() => setShowDetail(c)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "#2D1B1B", border: "1px solid #8B3A3A40", borderRadius: 10, marginBottom: 6, cursor: "pointer", animation: `slideIn 0.3s ease ${i * 0.06}s both` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#2D1B1B", color: "#F87171", border: "1px solid #8B3A3A" }}>종료</span>
                          <div><div style={{ fontSize: 14, fontWeight: 600 }}>{c.vendor}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{c.name}{c.owner_name ? ` · ${c.owner_name}` : ""}</div></div>
                        </div>
                        <div style={{ textAlign: "right" }}><div style={{ fontSize: 20, fontWeight: 700, color: "#F87171", fontFamily: "'JetBrains Mono', monospace" }}>D+{Math.abs(dl)}</div><div style={{ fontSize: 11, color: "#6B7280" }}>종료일 {c.end_date}</div></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Notifications */}
          {view === "notifications" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div><div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700 }}><Bell size={20} strokeWidth={2} /> 알림 센터</div><div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{activeNotifs.length}건</div></div>
                <button onClick={() => setShowNotifSettings(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2A2D38", background: "transparent", color: "#9BA1AE", fontSize: 12, cursor: "pointer" }}>⚙ 설정</button>
              </div>
              {activeNotifs.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "#464B55" }}>알림 없음 ✓</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {activeNotifs.map((n, i) => {
                    const uc = urgencyColors[n.urgency];
                    return (
                      <div key={n.id} style={{ padding: "18px 22px", background: uc.bg, border: `1px solid ${uc.border}60`, borderRadius: 12, animation: `fadeIn 0.3s ease ${i * 0.05}s both`, borderLeft: `4px solid ${uc.dot}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: uc.text }}>{n.title}</div>
                          <span style={{ fontSize: 20, fontWeight: 700, color: uc.text, fontFamily: "'JetBrains Mono', monospace" }}>{n.daysLeft > 0 ? `D-${n.daysLeft}` : n.daysLeft === 0 ? "D-Day" : `D+${Math.abs(n.daysLeft)}`}</span>
                        </div>
                        <div style={{ fontSize: 13, color: "#9BA1AE", padding: "10px 14px", background: "rgba(0,0,0,0.2)", borderRadius: 8, marginBottom: 14 }}>
                          {n.message}
                          {n.ownerName ? <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "#6B7280" }}>담당: {n.ownerName}</span> : null}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button onClick={() => sendSlack(buildSlackMsg(n))} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#4A154B", color: "#EDEEF0", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>💬 Slack</button>
                          <button onClick={() => sendEmail(buildEmailSubject(n), buildEmailBody(n))} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#0078D4", color: "#EDEEF0", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>📧 Outlook</button>
                          <button onClick={() => setDismissedNotifs((p) => ({ ...p, [n.id]: true }))} style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "1px solid #2A2D38", background: "transparent", color: "#6B7280", fontSize: 11, cursor: "pointer" }}>✕</button>
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
                <input style={{ ...inputStyle, width: 280 }} placeholder="검색 (벤더, 계약명, 담당자, 유형)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <select style={{ ...inputStyle, width: 160 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}><option value="all">모든 유형</option>{existingTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                <select style={{ ...inputStyle, width: 140 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}><option value="urgency">긴급도순</option><option value="end_date_asc">종료일 ↑</option><option value="end_date_desc">종료일 ↓</option><option value="cost">비용순</option><option value="vendor">벤더순</option></select>
              </div>
              <div style={{ borderRadius: 12, border: "1px solid #1E2029", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "#1A1D25" }}>{["상태", "벤더", "계약명", "유형", "담당자", "종료일", "D-Day", ""].map((h, i) => <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600, borderBottom: "1px solid #1E2029" }}>{h}</th>)}</tr></thead>
                  <tbody>{filtered.map((c) => {
                    const urg = getUrgencyLevel(c);
                    const dl = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date));
                    const uc = urgencyColors[urg];
                    const isTerm = c.status === "terminated";
                    return (
                      <tr key={c.id} onClick={() => setShowDetail(c)} style={{ borderBottom: "1px solid #1E2029", cursor: "pointer", opacity: isTerm ? 0.5 : 1 }}>
                        <td style={{ padding: "12px 16px" }}>{isTerm ? <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#1A1D25", color: "#6B7280", border: "1px solid #2A2D38" }}>종료</span> : <StatusBadge urgency={urg} autoRenew={c.auto_renew} />}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#EDEEF0" }}>{c.vendor}</td>
                        <td style={{ padding: "12px 16px", color: "#9BA1AE" }}>{c.name}</td>
                        <td style={{ padding: "12px 16px" }}><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, background: "#1A1D25", color: "#9BA1AE" }}>{c.type}</span></td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#9BA1AE" }}>{c.owner_name || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#9BA1AE", fontFamily: "'JetBrains Mono', monospace" }}>{c.end_date}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 700, color: isTerm ? "#6B7280" : uc.text, fontFamily: "'JetBrains Mono', monospace" }}>{isTerm ? "종료" : dl > 0 ? `D-${dl}` : dl === 0 ? "D-Day" : `D+${Math.abs(dl)}`}</td>
                        <td style={{ padding: "12px 16px", display: "flex", gap: 6 }}>
                          <button onClick={(e) => { e.stopPropagation(); setEditContract(c); setShowForm(true); }} style={{ background: "none", border: "1px solid #2A2D38", borderRadius: 6, color: "#6B7280", padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>수정</button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }} style={{ background: "none", border: "1px solid #8B3A3A40", borderRadius: 6, color: "#F87171", padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>삭제</button>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
                {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#464B55", fontSize: 13 }}>검색 결과 없음</div>}
              </div>
            </div>
          )}

          {/* Expired */}
          {view === "expired" && (() => {
            const PAGE_SIZE = 30;
            const filteredExpired = expiredContracts.filter((c) => !expiredSearch || `${c.vendor} ${c.name} ${c.owner_name || ""}`.toLowerCase().includes(expiredSearch.toLowerCase()));
            const sortedExpired = [...filteredExpired].sort((a, b) => {
              if (expiredSortBy === "end_date_desc") return (b.end_date || "").localeCompare(a.end_date || "");
              if (expiredSortBy === "end_date_asc") return (a.end_date || "").localeCompare(b.end_date || "");
              if (expiredSortBy === "vendor") return a.vendor.localeCompare(b.vendor);
              return 0;
            });
            const totalPages = Math.max(1, Math.ceil(sortedExpired.length / PAGE_SIZE));
            const safePage = Math.min(expiredPage, totalPages);
            const pagedExpired = sortedExpired.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
            return (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div><div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700 }}><Clock size={20} strokeWidth={2} /> 계약 종료</div><div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>계약 기간이 만료된 계약 {filteredExpired.length}건{expiredSearch ? ` (검색결과)` : ""}</div></div>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <input style={{ ...inputStyle, width: 280 }} placeholder="검색 (벤더, 계약명, 담당자)..." value={expiredSearch} onChange={(e) => { setExpiredSearch(e.target.value); setExpiredPage(1); }} />
                <select style={{ ...inputStyle, width: 160 }} value={expiredSortBy} onChange={(e) => { setExpiredSortBy(e.target.value); setExpiredPage(1); }}>
                  <option value="end_date_desc">최근 종료순</option>
                  <option value="end_date_asc">오래된 종료순</option>
                  <option value="vendor">벤더순</option>
                </select>
              </div>
              {sortedExpired.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "#464B55", fontSize: 13 }}>{expiredSearch ? "검색 결과가 없습니다." : "종료된 계약이 없습니다."}</div> : (
                <>
                <div style={{ borderRadius: 12, border: "1px solid #1E2029", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ background: "#1A1D25" }}>{["상태", "벤더", "계약명", "유형", "담당자", "종료일", "경과"].map((h, i) => <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600, borderBottom: "1px solid #1E2029" }}>{h}</th>)}</tr></thead>
                    <tbody>{pagedExpired.map((c) => {
                      const dl = getDaysUntil(c.end_date);
                      const isTerm = c.status === "terminated";
                      const isRecent = isTerm || (dl < 0 && dl >= -15);
                      const badgeLabel = isTerm ? "종료 처리" : dl < 0 && dl >= -15 ? "최근 만료" : "만료";
                      const badgeColor = isTerm ? { bg: "#5B8DEF15", color: "#5B8DEF", border: "#2E4A7A" } : isRecent ? { bg: "#2D1B1B", color: "#F87171", border: "#8B3A3A" } : { bg: "#1A1D25", color: "#6B7280", border: "#2A2D38" };
                      return (
                        <tr key={c.id} onClick={() => setShowDetail(c)} style={{ borderBottom: "1px solid #1E2029", cursor: "pointer" }}>
                          <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: badgeColor.bg, color: badgeColor.color, border: `1px solid ${badgeColor.border}` }}>{badgeLabel}</span></td>
                          <td style={{ padding: "12px 16px", fontWeight: 600, color: "#EDEEF0" }}>{c.vendor}</td>
                          <td style={{ padding: "12px 16px", color: "#9BA1AE" }}>{c.name}</td>
                          <td style={{ padding: "12px 16px" }}><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, background: "#1A1D25", color: "#9BA1AE" }}>{c.type}</span></td>
                          <td style={{ padding: "12px 16px", fontSize: 12, color: "#9BA1AE" }}>{c.owner_name || "—"}</td>
                          <td style={{ padding: "12px 16px", color: "#9BA1AE", fontFamily: "'JetBrains Mono', monospace" }}>{c.end_date}</td>
                          <td style={{ padding: "12px 16px", fontWeight: 700, color: isTerm ? "#5B8DEF" : isRecent ? "#F87171" : "#6B7280", fontFamily: "'JetBrains Mono', monospace" }}>{dl >= 0 ? `D-${dl}` : `D+${Math.abs(dl)}`}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 20 }}>
                    <button onClick={() => setExpiredPage(Math.max(1, safePage - 1))} disabled={safePage <= 1} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #2A2D38", background: safePage <= 1 ? "transparent" : "#1A1D25", color: safePage <= 1 ? "#464B55" : "#9BA1AE", fontSize: 12, cursor: safePage <= 1 ? "default" : "pointer", fontFamily: "inherit" }}>이전</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button key={p} onClick={() => setExpiredPage(p)} style={{ padding: "6px 12px", borderRadius: 8, border: p === safePage ? "1px solid #5B8DEF" : "1px solid #2A2D38", background: p === safePage ? "#5B8DEF18" : "transparent", color: p === safePage ? "#5B8DEF" : "#6B7280", fontSize: 12, fontWeight: p === safePage ? 700 : 400, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", minWidth: 36 }}>{p}</button>
                    ))}
                    <button onClick={() => setExpiredPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #2A2D38", background: safePage >= totalPages ? "transparent" : "#1A1D25", color: safePage >= totalPages ? "#464B55" : "#9BA1AE", fontSize: 12, cursor: safePage >= totalPages ? "default" : "pointer", fontFamily: "inherit" }}>다음</button>
                  </div>
                )}
                </>
              )}
            </div>
            );
          })()}

          {/* Trash */}
          {view === "trash" && (
            <div style={{ animation: "fadeIn 0.4s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div><div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700 }}><Trash2 size={20} strokeWidth={2} /> 휴지통</div><div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>삭제된 계약은 30일 후 완전 삭제됩니다.</div></div>
              </div>
              {deletedContracts.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "#464B55", fontSize: 13 }}>휴지통이 비어 있습니다.</div> : (
                <div style={{ borderRadius: 12, border: "1px solid #1E2029", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ background: "#1A1D25" }}>{["벤더", "계약명", "유형", "종료일", "삭제일", "상태", ""].map((h, i) => <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600, borderBottom: "1px solid #1E2029" }}>{h}</th>)}</tr></thead>
                    <tbody>{deletedContracts.map((c) => {
                      const deletedDate = c.deleted_at ? new Date(c.deleted_at) : new Date();
                      const daysSinceDelete = Math.floor((new Date() - deletedDate) / 86400000);
                      const daysUntilPurge = 30 - daysSinceDelete;
                      const isNearPurge = daysUntilPurge <= 7;
                      return (
                        <tr key={c.id} style={{ borderBottom: "1px solid #1E2029", opacity: 0.8 }}>
                          <td style={{ padding: "12px 16px", fontWeight: 600, color: "#EDEEF0" }}>{c.vendor}</td>
                          <td style={{ padding: "12px 16px", color: "#9BA1AE" }}>{c.name}</td>
                          <td style={{ padding: "12px 16px" }}><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, background: "#1A1D25", color: "#9BA1AE" }}>{c.type}</span></td>
                          <td style={{ padding: "12px 16px", color: "#9BA1AE", fontFamily: "'JetBrains Mono', monospace" }}>{c.end_date}</td>
                          <td style={{ padding: "12px 16px", color: "#6B7280", fontSize: 12 }}>{deletedDate.toLocaleDateString("ko-KR")}</td>
                          <td style={{ padding: "12px 16px" }}>{daysUntilPurge <= 0 ? <span style={{ fontSize: 11, color: "#EF4444", fontWeight: 600 }}>완전 삭제 대상</span> : isNearPurge ? <span style={{ fontSize: 11, color: "#F87171", fontWeight: 600 }}>{daysUntilPurge}일 후 완전 삭제</span> : <span style={{ fontSize: 11, color: "#6B7280" }}>{daysUntilPurge}일 남음</span>}</td>
                          <td style={{ padding: "12px 16px" }}><button onClick={() => restoreContract(c.id)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #3A8B7A", background: "transparent", color: "#34D399", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>복구</button></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title="계약 상세" width={650}>
        {showDetail && <ContractDetailWithAudit contract={contracts.find((x) => x.id === showDetail.id) || showDetail} onToggleStatus={toggleContractStatus} onEdit={(c) => { setEditContract(c); setShowForm(true); setShowDetail(null); }} onDelete={(c) => { setDeleteTarget(c); setShowDetail(null); }} onRefresh={async (msg) => { await loadContracts(); setShowDetail(null); if (msg) showToast(msg, "success"); }} />}
      </Modal>

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditContract(null); }} title={editContract ? "계약 수정" : "계약 등록"}>
        <ContractForm contract={editContract} onSave={saveContract} onCancel={() => { setShowForm(false); setEditContract(null); }} existingStudios={existingStudios} existingTypes={existingTypes} />
      </Modal>

      <CSVImportModal isOpen={showCSV} onClose={() => setShowCSV(false)} onImport={importContracts} />

      <Modal isOpen={showNotifSettings} onClose={() => setShowNotifSettings(false)} title="⚙ 알림 설정" width={520}>
        <div>
          <InputField label="Slack Webhook URL"><input style={inputStyle} value={notifSettings.slackWebhookUrl} onChange={(e) => setNotifSettings((p) => ({ ...p, slackWebhookUrl: e.target.value }))} placeholder="https://hooks.slack.com/services/..." /></InputField>
          <InputField label="Slack 채널명"><input style={inputStyle} value={notifSettings.slackChannel} onChange={(e) => setNotifSettings((p) => ({ ...p, slackChannel: e.target.value }))} placeholder="#it-procurement" /></InputField>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "#9BA1AE", marginBottom: 16 }}><input type="checkbox" checked={notifSettings.slackEnabled} onChange={(e) => setNotifSettings((p) => ({ ...p, slackEnabled: e.target.checked }))} style={{ accentColor: "#5B8DEF" }} />Slack 활성화</label>
          <div style={{ borderTop: "1px solid #1E2029", margin: "16px 0" }} />
          <InputField label="수신 이메일 (쉼표 구분)"><input style={inputStyle} value={notifSettings.emailRecipients} onChange={(e) => setNotifSettings((p) => ({ ...p, emailRecipients: e.target.value }))} placeholder="user@krafton.com" /></InputField>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "#9BA1AE" }}><input type="checkbox" checked={notifSettings.emailEnabled} onChange={(e) => setNotifSettings((p) => ({ ...p, emailEnabled: e.target.checked }))} style={{ accentColor: "#5B8DEF" }} />Outlook 활성화</label>
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

    </div>
  );
}
