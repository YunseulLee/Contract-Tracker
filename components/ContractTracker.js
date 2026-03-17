'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ─── Helpers ───
const formatCurrency = (amount, currency = "USD") => currency === "KRW" ? `₩${(amount||0).toLocaleString()}` : `$${(amount||0).toLocaleString()}`;
const getDaysUntil = (dateStr) => { if (!dateStr) return Infinity; const now = new Date(); now.setUTCHours(0,0,0,0); const target = new Date(dateStr + "T00:00:00Z"); return Math.ceil((target - now) / 86400000); };
const getUrgencyLevel = (c) => { const m = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date)); if (m < 0) return "expired"; if (m <= 30) return "critical"; if (m <= 60) return "warning"; if (m <= 90) return "upcoming"; return "safe"; };
const urgencyColors = { expired: { bg: "#2D1B1B", border: "#8B3A3A", text: "#FF6B6B", dot: "#FF4444" }, critical: { bg: "#2D2118", border: "#8B5E3A", text: "#FFB347", dot: "#FF8C00" }, warning: { bg: "#2D2A18", border: "#8B833A", text: "#FFE066", dot: "#FFD700" }, upcoming: { bg: "#1B2D2A", border: "#3A8B7A", text: "#66FFCC", dot: "#00D4AA" }, safe: { bg: "#1A1D23", border: "#2E3440", text: "#8892A0", dot: "#4A6FA5" } };

const fromDB = (row) => ({ id: row.id, vendor: row.vendor, name: row.name, type: row.type, start_date: row.start_date, end_date: row.end_date, renewal_date: row.renewal_date, auto_renew: row.auto_renew, auto_renew_notice_days: row.auto_renew_notice_days, annual_cost: row.annual_cost, currency: row.currency, status: row.status, notes: row.notes, studio: row.studio, owner_name: row.owner_name, owner_email: row.owner_email, wiki_url: row.wiki_url, supplier: row.supplier, installment_enabled: row.installment_enabled || false, installment_schedule: row.installment_schedule ? (typeof row.installment_schedule === "string" ? JSON.parse(row.installment_schedule) : row.installment_schedule) : [], is_deleted: row.is_deleted || false, deleted_at: row.deleted_at || null });
const toDB = (c) => ({ vendor: c.vendor, name: c.name, type: c.type, start_date: c.start_date || null, end_date: c.end_date, renewal_date: c.renewal_date || null, auto_renew: c.auto_renew || false, auto_renew_notice_days: c.auto_renew_notice_days || 30, annual_cost: c.annual_cost || 0, currency: c.currency || "USD", status: c.status || "active", notes: c.notes || "", studio: c.studio || "KRAFTON", owner_name: c.owner_name || "", owner_email: c.owner_email || "", wiki_url: c.wiki_url || "", supplier: c.supplier || "", installment_enabled: c.installment_enabled || false, installment_schedule: c.installment_schedule ? JSON.stringify(c.installment_schedule) : "[]" });

// ─── Audit Log ───
const fieldLabels = { vendor: "벤더", name: "계약명", type: "유형", start_date: "시작일", end_date: "종료일", renewal_date: "갱신 통보일", auto_renew: "자동갱신", auto_renew_notice_days: "사전 통보 기간", annual_cost: "연간 비용", currency: "통화", status: "상태", notes: "메모", studio: "스튜디오", owner_name: "담당자", owner_email: "담당자 이메일", wiki_url: "Wiki 링크", supplier: "공급사", installment_enabled: "분할 결제", installment_schedule: "분할 결제 일정" };
const auditFields = ["vendor", "name", "type", "start_date", "end_date", "renewal_date", "auto_renew", "auto_renew_notice_days", "annual_cost", "currency", "status", "notes", "studio", "owner_name", "owner_email", "wiki_url", "supplier", "installment_enabled", "installment_schedule"];

const writeAuditLog = async (contractId, action, changes = [], changedBy = "") => {
  if (action === "create" || action === "delete" || action === "restore") {
    await supabase.from("audit_log").insert({ contract_id: contractId, action, field_name: null, old_value: null, new_value: null, changed_by: changedBy });
    return;
  }
  if (changes.length > 0) {
    const rows = changes.map(ch => ({ contract_id: contractId, action, field_name: ch.field_name, old_value: ch.old_value, new_value: ch.new_value, changed_by: changedBy }));
    await supabase.from("audit_log").insert(rows);
  }
};

const diffContract = (oldC, newC) => {
  const changes = [];
  auditFields.forEach(f => {
    let ov = oldC[f], nv = newC[f];
    if (f === "installment_schedule") { ov = JSON.stringify(ov || []); nv = JSON.stringify(nv || []); }
    const ovs = String(ov ?? ""); const nvs = String(nv ?? "");
    if (ovs !== nvs) changes.push({ field_name: f, old_value: ovs, new_value: nvs });
  });
  return changes;
};

// ─── Sub-components ───
const StatusBadge = ({ urgency, autoRenew }) => { const labels = { expired: "만료됨", critical: "긴급", warning: "주의", upcoming: "예정", safe: "정상" }; const c = urgencyColors[urgency]; return (<div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.text, border: `1px solid ${c.border}` }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, boxShadow: `0 0 6px ${c.dot}60`, animation: urgency === "critical" ? "pulse 1.5s infinite" : "none" }} />{labels[urgency]}</span>{autoRenew && <span style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: "#1B2333", color: "#6BA3FF", border: "1px solid #2E4A7A" }}>↻ 자동갱신</span>}</div>); };

const Modal = ({ isOpen, onClose, title, children, width = 600 }) => { if (!isOpen) return null; return (<div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}><div onClick={e => e.stopPropagation()} style={{ background: "#141820", border: "1px solid #2E3440", borderRadius: 16, width: "100%", maxWidth: width, maxHeight: "85vh", overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #2E3440" }}><h2 style={{ margin: 0, fontSize: 18, color: "#E8ECF2" }}>{title}</h2><button onClick={onClose} style={{ background: "none", border: "none", color: "#6B7280", fontSize: 22, cursor: "pointer", padding: "4px 8px", borderRadius: 8, lineHeight: 1 }}>✕</button></div><div style={{ padding: 24 }}>{children}</div></div></div>); };

const InputField = ({ label, required, children }) => (<div style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8892A0", marginBottom: 6, letterSpacing: "0.5px", textTransform: "uppercase" }}>{label} {required && <span style={{ color: "#FF6B6B" }}>*</span>}</label>{children}</div>);

const inputStyle = { width: "100%", padding: "10px 14px", background: "#0D1017", border: "1px solid #2E3440", borderRadius: 10, color: "#E8ECF2", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

const Toast = ({ message, type, onClose }) => { useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]); const colors = { success: { bg: "#1B2D2A", border: "#3A8B7A", text: "#66FFCC" }, error: { bg: "#2D1B1B", border: "#8B3A3A", text: "#FF6B6B" }, info: { bg: "#1B2333", border: "#2E4A7A", text: "#6BA3FF" } }; const c = colors[type] || colors.info; return <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "14px 22px", borderRadius: 12, background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: 13, fontWeight: 500, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "fadeIn 0.3s ease", maxWidth: 400 }}>{message}</div>; };

// ─── Delete Confirm Modal ───
const DeleteConfirmModal = ({ isOpen, contract, onConfirm, onClose }) => {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (isOpen) setTyped(""); }, [isOpen]);
  if (!isOpen || !contract) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#141820", border: "1px solid #8B3A3A", borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 24px 80px rgba(0,0,0,0.6)", padding: 28 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#FF6B6B", marginBottom: 16 }}>계약 삭제</div>
        <div style={{ fontSize: 13, color: "#8892A0", marginBottom: 8, lineHeight: 1.6 }}>
          <span style={{ fontWeight: 600, color: "#E8ECF2" }}>{contract.vendor} — {contract.name}</span> 계약을 삭제하시겠습니까?
        </div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 20 }}>삭제된 계약은 휴지통으로 이동되며 30일 후 완전 삭제됩니다.</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#FF6B6B", marginBottom: 8 }}>확인을 위해 아래에 "삭제"를 입력하세요:</div>
        <input style={{ ...inputStyle, border: `1px solid ${typed === "삭제" ? "#3A8B7A" : "#2E3440"}`, marginBottom: 20 }} value={typed} onChange={e => setTyped(e.target.value)} placeholder="삭제" autoFocus />
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 14, cursor: "pointer" }}>취소</button>
          <button onClick={() => { if (typed === "삭제") onConfirm(contract.id); }} disabled={typed !== "삭제"} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: typed === "삭제" ? "#8B3A3A" : "#2E3440", color: typed === "삭제" ? "#E8ECF2" : "#555", fontSize: 14, fontWeight: 600, cursor: typed === "삭제" ? "pointer" : "default", transition: "all 0.2s" }}>삭제</button>
        </div>
      </div>
    </div>
  );
};

// ─── Editable Select (선택 + 직접입력) ───
const EditableSelect = ({ value, onChange, options, placeholder }) => {
  const [custom, setCustom] = useState(false);
  const isCustom = custom || (value && !options.includes(value));
  return isCustom ? (
    <div style={{ display: "flex", gap: 6 }}>
      <input style={{ ...inputStyle, flex: 1 }} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || "직접 입력"} />
      <button onClick={() => { setCustom(false); onChange(options[0]); }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#6B7280", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>목록</button>
    </div>
  ) : (
    <div style={{ display: "flex", gap: 6 }}>
      <select style={{ ...inputStyle, flex: 1 }} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <button onClick={() => { setCustom(true); onChange(""); }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#6BA3FF", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>+ 추가</button>
    </div>
  );
};

// ─── Notification Generator ───
const generateNotifications = (contracts) => {
  const notifs = []; const today = new Date(); today.setUTCHours(0,0,0,0);
  contracts.forEach(c => {
    const dte = getDaysUntil(c.end_date); const dtr = getDaysUntil(c.renewal_date);
    if (dte > 0 && dte <= 60) notifs.push({ id: `${c.id}-exp`, type: "expiry", urgency: dte <= 30 ? "critical" : "warning", title: `계약 만료 ${dte}일 전`, message: `${c.vendor} — ${c.name} 계약이 ${c.end_date}에 만료됩니다.`, vendor: c.vendor, contractName: c.name, daysLeft: dte, date: c.end_date, autoRenew: c.auto_renew, annualCost: c.annual_cost, currency: c.currency, studio: c.studio, ownerName: c.owner_name, ownerEmail: c.owner_email });
    if (c.auto_renew && c.auto_renew_notice_days > 0) { const nd = new Date(c.end_date); nd.setDate(nd.getDate() - c.auto_renew_notice_days); const dtn = Math.ceil((nd - today) / 86400000); if (dtn <= 30 && dtn > -7) notifs.push({ id: `${c.id}-auto`, type: "auto_renew_notice", urgency: dtn <= 0 ? "critical" : dtn <= 14 ? "warning" : "upcoming", title: dtn <= 0 ? "자동갱신 통지기한 경과" : `자동갱신 통지 ${dtn}일 전`, message: dtn <= 0 ? `${c.vendor}의 자동갱신 해지 통지기한이 경과했습니다.` : `${c.vendor}의 해지 통보 마감까지 ${dtn}일`, vendor: c.vendor, contractName: c.name, daysLeft: dtn, date: nd.toISOString().slice(0,10), autoRenew: true, annualCost: c.annual_cost, currency: c.currency, studio: c.studio, ownerName: c.owner_name, ownerEmail: c.owner_email, noticeDays: c.auto_renew_notice_days }); }
    if (dtr > 0 && dtr <= 60 && c.renewal_date) notifs.push({ id: `${c.id}-ren`, type: "renewal", urgency: dtr <= 30 ? "critical" : "warning", title: `갱신 통보일 ${dtr}일 전`, message: `${c.vendor} — ${c.name} 갱신 통보일: ${c.renewal_date}`, vendor: c.vendor, contractName: c.name, daysLeft: dtr, date: c.renewal_date, autoRenew: c.auto_renew, annualCost: c.annual_cost, currency: c.currency, studio: c.studio, ownerName: c.owner_name, ownerEmail: c.owner_email });
    if (dte < 0 && dte >= -30) notifs.push({ id: `${c.id}-expired`, type: "expired", urgency: "expired", title: `계약 만료 (${Math.abs(dte)}일 경과)`, message: `${c.vendor} — ${c.name} 만료됨`, vendor: c.vendor, contractName: c.name, daysLeft: dte, date: c.end_date, autoRenew: c.auto_renew, annualCost: c.annual_cost, currency: c.currency, studio: c.studio, ownerName: c.owner_name, ownerEmail: c.owner_email });
    // 분할 결제 알림
    if (c.installment_enabled && c.installment_schedule && c.installment_schedule.length > 0) {
      c.installment_schedule.forEach((inst, idx) => {
        if (inst.paid) return;
        const dtp = getDaysUntil(inst.date);
        if (dtp >= -7 && dtp <= 30) {
          notifs.push({ id: `${c.id}-inst-${idx}`, type: "installment", urgency: dtp <= 0 ? "critical" : dtp <= 7 ? "warning" : "upcoming", title: dtp <= 0 ? `분할결제 ${inst.label} 기한 경과` : `분할결제 ${inst.label} ${dtp}일 전`, message: `${c.vendor} — ${c.name} ${inst.label} 결제: ${formatCurrency(inst.amount, c.currency)} (${inst.date})`, vendor: c.vendor, contractName: c.name, daysLeft: dtp, date: inst.date, autoRenew: false, annualCost: inst.amount, currency: c.currency, studio: c.studio, ownerName: c.owner_name, ownerEmail: c.owner_email });
        }
      });
    }
  });
  return notifs.sort((a, b) => a.daysLeft - b.daysLeft);
};

const buildSlackMsg = (n) => `${n.urgency === "critical" || n.urgency === "expired" ? "🚨" : "⚠️"} *[Contract Alert] ${n.title}*\n> *벤더:* ${n.vendor}\n> *계약명:* ${n.contractName}\n> *스튜디오:* ${n.studio}${n.ownerName ? `\n> *담당자:* ${n.ownerName}` : ""}\n> *연간비용:* ${formatCurrency(n.annualCost, n.currency)}\n\n${n.message}`;
const buildEmailSubject = (n) => `${n.urgency === "critical" || n.urgency === "expired" ? "[긴급] " : "[알림] "}${n.vendor} — ${n.title}`;
const buildEmailBody = (n) => `안녕하세요,\n\n${n.title}\n\n■ 벤더: ${n.vendor}\n■ 계약명: ${n.contractName}\n■ 스튜디오: ${n.studio}${n.ownerName ? `\n■ 담당자: ${n.ownerName}` : ""}\n■ 연간비용: ${formatCurrency(n.annualCost, n.currency)}\n\n${n.message}\n\nIT Procurement Team`;

// ─── Contract Form ───
const ContractForm = ({ contract, onSave, onCancel, existingStudios, existingTypes }) => {
  const empty = { vendor: "", name: "", type: "SaaS", start_date: "", end_date: "", renewal_date: "", auto_renew: false, auto_renew_notice_days: 30, annual_cost: 0, currency: "USD", status: "active", notes: "", studio: "KRAFTON", owner_name: "", owner_email: "", wiki_url: "", supplier: "", installment_enabled: false, installment_schedule: [] };
  const [form, setForm] = useState(contract || empty);
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const studioOptions = existingStudios.length > 0 ? existingStudios : ["KRAFTON"];
  const typeOptions = existingTypes.length > 0 ? existingTypes : ["SaaS"];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <InputField label="벤더명" required><input style={inputStyle} value={form.vendor} onChange={e => up("vendor", e.target.value)} placeholder="e.g. Datadog" /></InputField>
        <InputField label="계약명" required><input style={inputStyle} value={form.name} onChange={e => up("name", e.target.value)} placeholder="e.g. APM Monitoring" /></InputField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <InputField label="공급사명"><input style={inputStyle} value={form.supplier} onChange={e => up("supplier", e.target.value)} placeholder="e.g. GS네오텍, 메가존클라우드" /></InputField>
        <InputField label="스튜디오"><EditableSelect value={form.studio} onChange={v => up("studio", v)} options={studioOptions} placeholder="스튜디오명 입력" /></InputField>
      </div>
      <InputField label="계약 유형"><EditableSelect value={form.type} onChange={v => up("type", v)} options={typeOptions} placeholder="계약 유형 입력" /></InputField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <InputField label="시작일" required><input style={inputStyle} type="date" value={form.start_date} onChange={e => up("start_date", e.target.value)} /></InputField>
        <InputField label="종료일" required><input style={inputStyle} type="date" value={form.end_date} onChange={e => up("end_date", e.target.value)} /></InputField>
        <InputField label="갱신 통보일"><input style={inputStyle} type="date" value={form.renewal_date} onChange={e => up("renewal_date", e.target.value)} /></InputField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <InputField label="연간 비용"><input style={inputStyle} type="number" value={form.annual_cost} onChange={e => up("annual_cost", Number(e.target.value))} /></InputField>
        <InputField label="통화"><select style={inputStyle} value={form.currency} onChange={e => up("currency", e.target.value)}><option value="USD">USD ($)</option><option value="KRW">KRW (₩)</option><option value="EUR">EUR (€)</option></select></InputField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "center" }}>
        <InputField label="자동갱신">
          <div onClick={() => up("auto_renew", !form.auto_renew)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 0" }}>
            <div style={{ width: 44, height: 24, borderRadius: 12, background: form.auto_renew ? "#4A6FA5" : "#2E3440", position: "relative", transition: "background 0.3s" }}><div style={{ width: 18, height: 18, borderRadius: "50%", background: "#E8ECF2", position: "absolute", top: 3, left: form.auto_renew ? 23 : 3, transition: "left 0.3s" }} /></div>
            <span style={{ fontSize: 13, color: "#8892A0" }}>{form.auto_renew ? "ON" : "OFF"}</span>
          </div>
        </InputField>
        {form.auto_renew && (
          <InputField label="사전 통보 기간">
            <div style={{ display: "flex", gap: 8 }}>
              {[30, 60, 90].map(d => (
                <button key={d} onClick={() => up("auto_renew_notice_days", d)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `2px solid ${form.auto_renew_notice_days === d ? "#4A6FA5" : "#2E3440"}`, background: form.auto_renew_notice_days === d ? "#1B2333" : "#0D1017", color: form.auto_renew_notice_days === d ? "#6BA3FF" : "#6B7280", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
                  {d}일
                </button>
              ))}
            </div>
          </InputField>
        )}
      </div>
      {/* 분할 결제 */}
      <div style={{ padding: "14px 0 6px", borderTop: "1px solid #1A1F2B", marginTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#6BA3FF", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>💳 결제 방식</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "center" }}>
        <InputField label="분할 결제">
          <div onClick={() => { up("installment_enabled", !form.installment_enabled); if (!form.installment_enabled && form.installment_schedule.length === 0) up("installment_schedule", [{ date: "", amount: 0, label: "1차", paid: false }]); }} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 0" }}>
            <div style={{ width: 44, height: 24, borderRadius: 12, background: form.installment_enabled ? "#4A6FA5" : "#2E3440", position: "relative", transition: "background 0.3s" }}><div style={{ width: 18, height: 18, borderRadius: "50%", background: "#E8ECF2", position: "absolute", top: 3, left: form.installment_enabled ? 23 : 3, transition: "left 0.3s" }} /></div>
            <span style={{ fontSize: 13, color: "#8892A0" }}>{form.installment_enabled ? "ON" : "OFF (일시불)"}</span>
          </div>
        </InputField>
        {form.installment_enabled && (
          <InputField label="자동 분할">
            <div style={{ display: "flex", gap: 6 }}>
              {[{l:"2회",n:2},{l:"3회",n:3},{l:"4회(분기)",n:4},{l:"12회(월)",n:12}].map(({l,n}) => (
                <button key={n} onClick={() => {
                  if (!form.start_date || !form.annual_cost) return;
                  const base = new Date(form.start_date + "T00:00:00Z");
                  const totalCost = form.annual_cost || 0;
                  const amt = Math.floor(totalCost / n);
                  const months = Math.round(12 / n);
                  const sched = Array.from({length: n}, (_, i) => {
                    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months * i, Math.min(base.getUTCDate(), new Date(base.getUTCFullYear(), base.getUTCMonth() + months * i + 1, 0).getDate())));
                    return { date: d.toISOString().slice(0, 10), amount: i === n - 1 ? totalCost - amt * (n - 1) : amt, label: `${i + 1}차`, paid: false };
                  });
                  up("installment_schedule", sched);
                }} style={{ flex: 1, padding: "8px 4px", borderRadius: 6, border: "1px solid #2E3440", background: "#0D1017", color: "#6BA3FF", fontSize: 11, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
          </InputField>
        )}
      </div>
      {form.installment_enabled && form.installment_schedule.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 40px", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: "#6B7280", padding: "0 4px" }}>회차</span>
            <span style={{ fontSize: 10, color: "#6B7280" }}>결제일</span>
            <span style={{ fontSize: 10, color: "#6B7280" }}>금액</span>
            <span></span>
          </div>
          {form.installment_schedule.map((item, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 40px", gap: 8, marginBottom: 6, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#8892A0", padding: "0 4px" }}>{item.label}</span>
              <input style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }} type="date" value={item.date} onChange={e => { const s = [...form.installment_schedule]; s[idx] = {...s[idx], date: e.target.value}; up("installment_schedule", s); }} />
              <input style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }} type="number" value={item.amount} onChange={e => { const s = [...form.installment_schedule]; s[idx] = {...s[idx], amount: Number(e.target.value)}; up("installment_schedule", s); }} />
              <button onClick={() => { const s = form.installment_schedule.filter((_, i) => i !== idx); up("installment_schedule", s); }} style={{ background: "none", border: "none", color: "#FF6B6B", fontSize: 16, cursor: "pointer", padding: 0 }}>×</button>
            </div>
          ))}
          <button onClick={() => up("installment_schedule", [...form.installment_schedule, { date: "", amount: 0, label: `${form.installment_schedule.length + 1}차`, paid: false }])} style={{ padding: "6px 14px", borderRadius: 6, border: "1px dashed #2E3440", background: "transparent", color: "#6BA3FF", fontSize: 12, cursor: "pointer", width: "100%", marginTop: 4 }}>+ 회차 추가</button>
        </div>
      )}
      <div style={{ padding: "14px 0 6px", borderTop: "1px solid #1A1F2B", marginTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#6BA3FF", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>👤 담당자 정보</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <InputField label="담당자 이름"><input style={inputStyle} value={form.owner_name} onChange={e => up("owner_name", e.target.value)} placeholder="예: 홍길동" /></InputField>
        <InputField label="담당자 이메일"><input style={inputStyle} type="email" value={form.owner_email} onChange={e => up("owner_email", e.target.value)} placeholder="예: user@krafton.com" /></InputField>
      </div>
      <InputField label="📎 Wiki / 문서 링크"><input style={inputStyle} value={form.wiki_url} onChange={e => up("wiki_url", e.target.value)} placeholder="https://wiki.krafton.com/... 또는 Confluence, Notion 링크" /></InputField>
      <InputField label="메모"><textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={form.notes} onChange={e => up("notes", e.target.value)} placeholder="계약 관련 참고사항..." /></InputField>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
        <button onClick={onCancel} style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 14, cursor: "pointer" }}>취소</button>
        <button onClick={() => onSave(form)} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #4A6FA5, #3A5A8A)", color: "#E8ECF2", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{contract ? "수정" : "등록"}</button>
      </div>
    </div>
  );
};

// ─── CSV Import Modal ───
const CSVImportModal = ({ isOpen, onClose, onImport }) => {
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState([]);
  const fileRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => { setCsvText(ev.target.result); parsePreview(ev.target.result); };
    r.readAsText(f);
  };

  const parsePreview = (text) => {
    const lines = text.trim().split("\n"); if (lines.length < 2) { setPreview([]); return; }
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim()); const obj = {};
      headers.forEach((h, idx) => obj[h] = vals[idx] || "");
      return {
        vendor: obj.vendor || obj["벤더"] || "", name: obj.name || obj["계약명"] || "",
        type: obj.type || obj["유형"] || "SaaS",
        start_date: obj.start_date || obj.startdate || obj["시작일"] || "",
        end_date: obj.end_date || obj.enddate || obj["종료일"] || "",
        renewal_date: obj.renewal_date || obj.renewaldate || obj["갱신일"] || "",
        auto_renew: ["true","y","yes","예"].includes((obj.auto_renew || obj.autorenew || obj["자동갱신"] || "").toLowerCase()),
        auto_renew_notice_days: parseInt(obj.auto_renew_notice_days || obj.noticedays || obj.notice_days || obj["통보일수"] || "30") || 30,
        annual_cost: parseFloat(obj.annual_cost || obj.annualcost || obj.cost || obj["비용"] || "0") || 0,
        currency: obj.currency || obj["통화"] || "USD",
        studio: obj.studio || obj["스튜디오"] || "KRAFTON",
        owner_name: obj.owner_name || obj.ownername || obj["담당자"] || "",
        owner_email: obj.owner_email || obj.owneremail || obj["담당자이메일"] || "",
        wiki_url: obj.wiki_url || obj.wikiurl || obj["위키"] || obj["링크"] || "",
        supplier: obj.supplier || obj["공급사"] || obj["공급사명"] || "",
        notes: obj.notes || obj["메모"] || "", status: "active",
      };
    }).filter(r => {
      if (!r.vendor || !r.end_date) return false;
      // 날짜 형식 검증 (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(r.end_date) || isNaN(new Date(r.end_date).getTime())) return false;
      if (r.start_date && (!dateRegex.test(r.start_date) || isNaN(new Date(r.start_date).getTime()))) return false;
      if (r.renewal_date && (!dateRegex.test(r.renewal_date) || isNaN(new Date(r.renewal_date).getTime()))) return false;
      // 비용 음수 검증
      if (r.annual_cost < 0) r.annual_cost = 0;
      return true;
    });
    setPreview(rows);
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    await onImport(preview);
    setCsvText(""); setPreview([]); onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { setCsvText(""); setPreview([]); onClose(); }} title="📂 CSV Import" width={700}>
      <p style={{ fontSize: 13, color: "#8892A0", marginTop: 0, lineHeight: 1.6, marginBottom: 16 }}>
        CSV 파일을 업로드하거나 텍스트를 붙여넣으세요.<br />
        <span style={{ color: "#6BA3FF", fontSize: 12 }}>헤더: vendor, name, type, start_date, end_date, renewal_date, auto_renew, notice_days, annual_cost, currency, studio, owner_name, owner_email, wiki_url, notes</span><br />
        <span style={{ color: "#6BA3FF", fontSize: 12 }}>한글 헤더도 인식: 벤더, 계약명, 유형, 시작일, 종료일, 갱신일, 자동갱신, 비용, 통화, 스튜디오, 담당자, 메모</span>
      </p>
      <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: "none" }} />
      <button onClick={() => fileRef.current?.click()} style={{ padding: "12px 20px", borderRadius: 10, border: "1px dashed #4A6FA5", background: "#0D1017", color: "#6BA3FF", fontSize: 13, cursor: "pointer", width: "100%", marginBottom: 12 }}>📂 CSV 파일 선택</button>
      <textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical", fontSize: 12, marginBottom: 12 }} value={csvText} onChange={e => { setCsvText(e.target.value); parsePreview(e.target.value); }} placeholder="CSV 텍스트를 여기에 붙여넣기..." />

      {preview.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#66FFCC", marginBottom: 8 }}>✓ {preview.length}건 인식됨 — 미리보기:</div>
          <div style={{ maxHeight: 200, overflow: "auto", borderRadius: 8, border: "1px solid #2E3440" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ background: "#111620" }}>{["벤더", "계약명", "종료일", "비용", "스튜디오"].map((h, i) => <th key={i} style={{ padding: "8px 12px", textAlign: "left", color: "#6B7280", borderBottom: "1px solid #1A1F2B" }}>{h}</th>)}</tr></thead>
              <tbody>{preview.slice(0, 10).map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #1A1F2B" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{r.vendor}</td>
                  <td style={{ padding: "8px 12px", color: "#8892A0" }}>{r.name}</td>
                  <td style={{ padding: "8px 12px", color: "#8892A0" }}>{r.end_date}</td>
                  <td style={{ padding: "8px 12px" }}>{formatCurrency(r.annual_cost, r.currency)}</td>
                  <td style={{ padding: "8px 12px", color: "#8892A0" }}>{r.studio}</td>
                </tr>
              ))}</tbody>
            </table>
            {preview.length > 10 && <div style={{ padding: 8, textAlign: "center", color: "#6B7280", fontSize: 11 }}>...외 {preview.length - 10}건</div>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
        <button onClick={() => { setCsvText(""); setPreview([]); onClose(); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", cursor: "pointer", fontSize: 13 }}>취소</button>
        <button onClick={handleImport} disabled={preview.length === 0} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: preview.length > 0 ? "linear-gradient(135deg, #4A6FA5, #3A5A8A)" : "#2E3440", color: preview.length > 0 ? "#E8ECF2" : "#555", fontWeight: 600, cursor: preview.length > 0 ? "pointer" : "default", fontSize: 13 }}>
          {preview.length > 0 ? `${preview.length}건 Import` : "Import"}
        </button>
      </div>
    </Modal>
  );
};

// ─── Options Manager (스튜디오/계약유형 관리) ───
const OptionsManager = ({ studios, types, contracts, onSave, onClose }) => {
  const [localStudios, setLocalStudios] = useState([...studios]);
  const [localTypes, setLocalTypes] = useState([...types]);
  const [newStudio, setNewStudio] = useState("");
  const [newType, setNewType] = useState("");

  const usedStudios = new Set(contracts.map(c => c.studio).filter(Boolean));
  const usedTypes = new Set(contracts.map(c => c.type).filter(Boolean));

  const addStudio = () => { if (newStudio.trim() && !localStudios.includes(newStudio.trim())) { setLocalStudios([...localStudios, newStudio.trim()]); setNewStudio(""); } };
  const addType = () => { if (newType.trim() && !localTypes.includes(newType.trim())) { setLocalTypes([...localTypes, newType.trim()]); setNewType(""); } };

  const removeStudio = (s) => { if (usedStudios.has(s)) return; setLocalStudios(localStudios.filter(x => x !== s)); };
  const removeType = (t) => { if (usedTypes.has(t)) return; setLocalTypes(localTypes.filter(x => x !== t)); };

  const tagStyle = (inUse) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, fontSize: 13, background: inUse ? "#1B2333" : "#0D1017", color: inUse ? "#6BA3FF" : "#8892A0", border: `1px solid ${inUse ? "#2E4A7A" : "#2E3440"}`, marginRight: 8, marginBottom: 8 });

  const delBtn = (onClick) => <span onClick={onClick} style={{ cursor: "pointer", color: "#FF6B6B", fontSize: 14, lineHeight: 1, marginLeft: 2 }}>×</span>;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#E8ECF2", marginBottom: 12 }}>📁 스튜디오</div>
        <div style={{ marginBottom: 10 }}>
          {localStudios.map(s => {
            const inUse = usedStudios.has(s);
            return <span key={s} style={tagStyle(inUse)}>{s}{inUse ? <span style={{ fontSize: 10, color: "#4A5568" }}>(사용중)</span> : delBtn(() => removeStudio(s))}</span>;
          })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...inputStyle, flex: 1 }} value={newStudio} onChange={e => setNewStudio(e.target.value)} onKeyDown={e => e.key === "Enter" && addStudio()} placeholder="새 스튜디오 이름" />
          <button onClick={addStudio} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#1B2333", color: "#6BA3FF", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>+ 추가</button>
        </div>
        <div style={{ fontSize: 11, color: "#4A5568", marginTop: 6 }}>사용중인 항목은 삭제할 수 없습니다. 해당 계약의 스튜디오를 변경하면 삭제 가능합니다.</div>
      </div>

      <div style={{ borderTop: "1px solid #1A1F2B", paddingTop: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#E8ECF2", marginBottom: 12 }}>📋 계약 유형</div>
        <div style={{ marginBottom: 10 }}>
          {localTypes.map(t => {
            const inUse = usedTypes.has(t);
            return <span key={t} style={tagStyle(inUse)}>{t}{inUse ? <span style={{ fontSize: 10, color: "#4A5568" }}>(사용중)</span> : delBtn(() => removeType(t))}</span>;
          })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...inputStyle, flex: 1 }} value={newType} onChange={e => setNewType(e.target.value)} onKeyDown={e => e.key === "Enter" && addType()} placeholder="새 계약 유형" />
          <button onClick={addType} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#1B2333", color: "#6BA3FF", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>+ 추가</button>
        </div>
        <div style={{ fontSize: 11, color: "#4A5568", marginTop: 6 }}>사용중인 항목은 삭제할 수 없습니다.</div>
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 14, cursor: "pointer" }}>취소</button>
        <button onClick={() => onSave(localStudios, localTypes)} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #4A6FA5, #3A5A8A)", color: "#E8ECF2", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>저장</button>
      </div>
    </div>
  );
};

// ─── Timeline Calendar ───
const TimelineCalendar = ({ contracts, onSelectContract }) => {
  const [selectedMonth, setSelectedMonth] = useState(null);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const months = Array.from({ length: 12 }, (_, i) => {
    const y = currentYear + Math.floor((currentMonth + i) / 12);
    const m = (currentMonth + i) % 12;
    return { year: y, month: m, key: `${y}-${String(m + 1).padStart(2, "0")}` };
  });

  const activeContracts = contracts.filter(c => c.status === "active");

  const monthData = useMemo(() => {
    const map = {};
    months.forEach(({ key, year, month }) => {
      const items = [];
      activeContracts.forEach(c => {
        const events = [];
        if (c.end_date) { const d = new Date(c.end_date + "T00:00:00Z"); if (d.getUTCFullYear() === year && d.getUTCMonth() === month) events.push({ type: "만료", date: c.end_date }); }
        if (c.renewal_date) { const d = new Date(c.renewal_date + "T00:00:00Z"); if (d.getUTCFullYear() === year && d.getUTCMonth() === month) events.push({ type: "갱신", date: c.renewal_date }); }
        if (events.length > 0) items.push({ contract: c, events });
      });
      map[key] = items;
    });
    return map;
  }, [contracts]);

  const getMonthColor = (key, monthIdx) => {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const items = monthData[key] || [];
    if (items.length === 0) return { bar: "#1A1F2B", text: "#4A5568" };
    let minDays = Infinity;
    items.forEach(({ events }) => events.forEach(ev => {
      const d = Math.ceil((new Date(ev.date + "T00:00:00Z") - today) / 86400000);
      if (d < minDays) minDays = d;
    }));
    if (minDays <= 30) return { bar: "#FF4444", text: "#FF6B6B" };
    if (minDays <= 60) return { bar: "#FFD700", text: "#FFE066" };
    return { bar: "#4A6FA5", text: "#6BA3FF" };
  };

  const isCurrentMonth = (year, month) => year === currentYear && month === currentMonth;
  const selectedItems = selectedMonth ? (monthData[selectedMonth] || []) : [];
  const maxCount = Math.max(1, ...months.map(m => (monthData[m.key] || []).length));
  const monthNames = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#8892A0", marginBottom: 14 }}>📅 만료 타임라인</div>
      <div style={{ background: "#111620", border: "1px solid #1A1F2B", borderRadius: 14, padding: "20px 22px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 6 }}>
          {months.map(({ year, month, key }) => {
            const count = (monthData[key] || []).length;
            const colors = getMonthColor(key);
            const isCurrent = isCurrentMonth(year, month);
            const isSelected = selectedMonth === key;
            const barHeight = count > 0 ? Math.max(8, (count / maxCount) * 60) : 4;
            return (
              <div key={key} onClick={() => setSelectedMonth(isSelected ? null : key)} style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 0", borderRadius: 10, background: isSelected ? "#1A1F2B" : "transparent", border: isCurrent ? "1px solid #4A6FA540" : "1px solid transparent", transition: "all 0.2s" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: isCurrent ? "#E8ECF2" : "#6B7280", letterSpacing: "0.5px" }}>{monthNames[month]}</div>
                <div style={{ fontSize: 9, color: "#4A5568" }}>{year}</div>
                <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "flex-end", height: 64 }}>
                  <div style={{ width: "60%", height: barHeight, borderRadius: 4, background: count > 0 ? colors.bar : "#1A1F2B", opacity: count > 0 ? 0.85 : 0.4, transition: "height 0.3s ease" }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: count > 0 ? colors.text : "#2E3440", minHeight: 18 }}>{count > 0 ? count : ""}</div>
                {isCurrent && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#4A6FA5" }} />}
              </div>
            );
          })}
        </div>

        {selectedMonth && selectedItems.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #1A1F2B" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#8892A0", marginBottom: 10 }}>
              {selectedMonth.replace("-", "년 ")}월 — {selectedItems.length}건
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {selectedItems.map(({ contract: sc, events }) => {
                const urg = getUrgencyLevel(sc);
                const uc = urgencyColors[urg];
                return (
                  <div key={sc.id} onClick={() => onSelectContract(sc)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: uc.bg, border: `1px solid ${uc.border}30`, borderRadius: 10, cursor: "pointer", transition: "background 0.2s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <StatusBadge urgency={urg} autoRenew={sc.auto_renew} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#E8ECF2" }}>{sc.vendor} — {sc.name}</div>
                        <div style={{ fontSize: 11, color: "#6B7280" }}>{sc.owner_name || sc.studio} · {formatCurrency(sc.annual_cost, sc.currency)}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {events.map((ev, ei) => (
                        <span key={ei} style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: ev.type === "만료" ? "#2D1B1B" : "#1B2333", color: ev.type === "만료" ? "#FF6B6B" : "#6BA3FF", border: `1px solid ${ev.type === "만료" ? "#8B3A3A30" : "#2E4A7A30"}` }}>
                          {ev.type} {ev.date.slice(5)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {selectedMonth && selectedItems.length === 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #1A1F2B", textAlign: "center", padding: "20px 0", color: "#4A5568", fontSize: 12 }}>해당 월에 만료/갱신 예정 계약이 없습니다.</div>
        )}
      </div>
    </div>
  );
};

// ─── Contract Detail with Audit Log ───
const ContractDetailWithAudit = ({ contract, onToggleStatus, onEdit, onDelete }) => {
  const [tab, setTab] = useState("info");
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const c = contract;

  const loadAudit = async () => {
    setAuditLoading(true);
    const { data, error } = await supabase.from("audit_log").select("*").eq("contract_id", c.id).order("created_at", { ascending: false });
    if (!error && data) setAuditLogs(data);
    setAuditLoading(false);
  };

  useEffect(() => { if (tab === "history") loadAudit(); }, [tab, c.id]);

  const actionLabels = { create: "등록", update: "수정", delete: "삭제", restore: "복구" };
  const actionColors = { create: "#66FFCC", update: "#6BA3FF", delete: "#FF6B6B", restore: "#FFE066" };

  const tabStyle = (active) => ({ flex: 1, padding: "10px 0", border: "none", borderBottom: active ? "2px solid #4A6FA5" : "2px solid transparent", background: "transparent", color: active ? "#E8ECF2" : "#6B7280", fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><div><div style={{ fontSize: 20, fontWeight: 700 }}>{c.vendor}</div><div style={{ fontSize: 14, color: "#8892A0" }}>{c.name}</div></div><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}><StatusBadge urgency={getUrgencyLevel(c)} autoRenew={c.auto_renew} />{c.status === "terminated" && <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#2D1B1B", color: "#FF6B6B", border: "1px solid #8B3A3A" }}>계약 종료</span>}</div></div>

      <div style={{ display: "flex", borderBottom: "1px solid #1A1F2B", marginBottom: 20 }}>
        <button onClick={() => setTab("info")} style={tabStyle(tab === "info")}>계약 정보</button>
        <button onClick={() => setTab("history")} style={tabStyle(tab === "history")}>수정 이력</button>
      </div>

      {tab === "info" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[{ l: "스튜디오", v: c.studio }, { l: "유형", v: c.type }, { l: "공급사", v: c.supplier || "—" }, { l: "시작일", v: c.start_date }, { l: "종료일", v: c.end_date }, { l: "갱신 통보일", v: c.renewal_date || "—" }, { l: "연간 비용", v: formatCurrency(c.annual_cost, c.currency) }, { l: "자동갱신", v: c.auto_renew ? `ON (${c.auto_renew_notice_days}일 전)` : "OFF" }, { l: "남은 일수", v: (() => { const d = getDaysUntil(c.end_date); return d > 0 ? `${d}일` : `${Math.abs(d)}일 경과`; })() }, { l: "담당자", v: c.owner_name || "—" }, { l: "담당자 이메일", v: c.owner_email || "—" }].map((item, i) => (<div key={i} style={{ padding: "10px 14px", background: "#0D1017", borderRadius: 10, border: "1px solid #1A1F2B" }}><div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", marginBottom: 4 }}>{item.l}</div><div style={{ fontSize: 14, fontWeight: 500 }}>{item.v}</div></div>))}
          </div>
          {c.wiki_url && (
            <div style={{ padding: "12px 14px", background: "#0D1017", borderRadius: 10, border: "1px solid #2E4A7A", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", marginBottom: 4 }}>Wiki / 문서 링크</div>
              {(() => { try { const u = new URL(c.wiki_url); return (u.protocol === "http:" || u.protocol === "https:") ? <a href={c.wiki_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#6BA3FF", textDecoration: "none", wordBreak: "break-all" }}>{c.wiki_url}</a> : <span style={{ fontSize: 13, color: "#8892A0", wordBreak: "break-all" }}>{c.wiki_url}</span>; } catch { return <span style={{ fontSize: 13, color: "#8892A0", wordBreak: "break-all" }}>{c.wiki_url}</span>; } })()}
            </div>
          )}
          {c.installment_enabled && c.installment_schedule && c.installment_schedule.length > 0 && (
            <div style={{ padding: "14px", background: "#0D1017", borderRadius: 10, border: "1px solid #1A1F2B", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", marginBottom: 10 }}>분할 결제 일정</div>
              {c.installment_schedule.map((inst, idx) => {
                const dtp = getDaysUntil(inst.date); const isPast = dtp < 0; const isNear = dtp >= 0 && dtp <= 14;
                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, marginBottom: 4, background: isNear ? "#2D2A18" : "transparent", border: isNear ? "1px solid #8B833A40" : "1px solid transparent" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: inst.paid ? "#66FFCC" : isPast ? "#FF6B6B" : "#8892A0", minWidth: 30 }}>{inst.label}</span>
                      <span style={{ fontSize: 12, color: "#8892A0" }}>{inst.date}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#E8ECF2" }}>{formatCurrency(inst.amount, c.currency)}</span>
                      {inst.paid ? <span style={{ fontSize: 10, color: "#66FFCC", background: "#1B2D2A", padding: "2px 8px", borderRadius: 10 }}>완료</span> : isNear ? <span style={{ fontSize: 10, color: "#FFE066", background: "#2D2A18", padding: "2px 8px", borderRadius: 10 }}>D-{dtp}</span> : isPast ? <span style={{ fontSize: 10, color: "#FF6B6B", background: "#2D1B1B", padding: "2px 8px", borderRadius: 10 }}>미결제</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {c.notes && <div style={{ padding: "12px 14px", background: "#0D1017", borderRadius: 10, border: "1px solid #1A1F2B", marginBottom: 20 }}><div style={{ fontSize: 10, color: "#6B7280", marginBottom: 6 }}>메모</div><div style={{ fontSize: 13, color: "#8892A0", lineHeight: 1.6 }}>{c.notes}</div></div>}
        </div>
      )}

      {tab === "history" && (
        <div>
          {auditLoading ? <div style={{ textAlign: "center", padding: 40, color: "#6B7280", fontSize: 13 }}>로딩 중...</div> : auditLogs.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#4A5568", fontSize: 13 }}>수정 이력이 없습니다.</div> : (
            <div style={{ maxHeight: 400, overflow: "auto" }}>
              {auditLogs.map((log, i) => (
                <div key={log.id || i} style={{ padding: "14px 16px", background: "#0D1017", borderRadius: 10, border: "1px solid #1A1F2B", marginBottom: 8, animation: `fadeIn 0.3s ease ${i * 0.03}s both` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: log.field_name ? 8 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${actionColors[log.action]}15`, color: actionColors[log.action], border: `1px solid ${actionColors[log.action]}30` }}>{actionLabels[log.action] || log.action}</span>
                      {log.field_name && <span style={{ fontSize: 12, color: "#8892A0" }}>{fieldLabels[log.field_name] || log.field_name}</span>}
                    </div>
                    <span style={{ fontSize: 11, color: "#4A5568" }}>{new Date(log.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {log.field_name && log.action === "update" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "8px 10px", background: "#111620", borderRadius: 6 }}>
                      <span style={{ color: "#FF6B6B", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.old_value}>{log.old_value || "(비어있음)"}</span>
                      <span style={{ color: "#4A5568", flexShrink: 0 }}>→</span>
                      <span style={{ color: "#66FFCC", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.new_value}>{log.new_value || "(비어있음)"}</span>
                    </div>
                  )}
                  {log.changed_by && <div style={{ fontSize: 11, color: "#4A5568", marginTop: 6 }}>변경자: {log.changed_by}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "1px solid #1A1F2B" }}>
        <button onClick={() => onToggleStatus(c)} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${c.status === "active" ? "#8B833A" : "#3A8B7A"}`, background: "transparent", color: c.status === "active" ? "#FFE066" : "#66FFCC", fontSize: 12, cursor: "pointer" }}>{c.status === "active" ? "⏹ 종료 처리" : "▶ 재활성화"}</button>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => onDelete(c)} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #8B3A3A", background: "transparent", color: "#FF6B6B", fontSize: 12, cursor: "pointer" }}>삭제</button>
          <button onClick={() => onEdit(c)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #4A6FA5, #3A5A8A)", color: "#E8ECF2", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>수정</button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════
// ─── MAIN COMPONENT ───
// ═══════════════════════════════
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
  const [showDetail, setShowDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const [dismissedNotifs, setDismissedNotifs] = useState({});
  const [notifSettings, setNotifSettings] = useState({ slackEnabled: false, slackWebhookUrl: "", slackChannel: "", emailEnabled: false, emailRecipients: "" });
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showOptionsManager, setShowOptionsManager] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletedContracts, setDeletedContracts] = useState([]);
  const [customStudios, setCustomStudios] = useState(["KRAFTON", "PalM"]);
  const [customTypes, setCustomTypes] = useState(["SaaS", "Cloud Infrastructure", "License", "Service", "Maintenance", "Consulting"]);

  // Load custom options from Supabase
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
    const { data, error } = await supabase.from("contracts").select("*").eq("is_deleted", false).order("end_date", { ascending: true });
    if (error) { showToast("데이터 로딩 실패: " + error.message, "error"); return; }
    setContracts(data.map(fromDB));
  }, [showToast]);

  const loadDeletedContracts = useCallback(async () => {
    const { data, error } = await supabase.from("contracts").select("*").eq("is_deleted", true).order("deleted_at", { ascending: false });
    if (error) { showToast("휴지통 로딩 실패: " + error.message, "error"); return; }
    setDeletedContracts(data.map(fromDB));
  }, [showToast]);

  useEffect(() => { loadContracts().then(() => setLoading(false)); }, [loadContracts]);

  const saveContract = async (c) => {
    if (c.id) {
      const oldContract = contracts.find(x => x.id === c.id);
      const { error } = await supabase.from("contracts").update(toDB(c)).eq("id", c.id);
      if (error) { showToast("수정 실패: " + error.message, "error"); return; }
      if (oldContract) {
        const changes = diffContract(oldContract, c);
        if (changes.length > 0) await writeAuditLog(c.id, "update", changes);
      }
    } else {
      const { data, error } = await supabase.from("contracts").insert(toDB(c)).select("id").single();
      if (error) { showToast("등록 실패: " + error.message, "error"); return; }
      if (data) await writeAuditLog(data.id, "create");
    }
    await loadContracts(); setShowForm(false); setEditContract(null);
    showToast("저장 완료", "success");
  };

  const deleteContract = async (id) => {
    const { error } = await supabase.from("contracts").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) { showToast("삭제 실패", "error"); return; }
    await writeAuditLog(id, "delete");
    await loadContracts(); setShowDetail(null); setDeleteTarget(null); showToast("휴지통으로 이동되었습니다.", "success");
  };

  const restoreContract = async (id) => {
    const { error } = await supabase.from("contracts").update({ is_deleted: false, deleted_at: null }).eq("id", id);
    if (error) { showToast("복구 실패", "error"); return; }
    await writeAuditLog(id, "restore");
    await loadDeletedContracts(); await loadContracts(); showToast("계약이 복구되었습니다.", "success");
  };

  const toggleContractStatus = async (c) => {
    const newStatus = c.status === "active" ? "terminated" : "active";
    const { error } = await supabase.from("contracts").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) { showToast("상태 변경 실패", "error"); return; }
    await writeAuditLog(c.id, "update", [{ field_name: "status", old_value: c.status, new_value: newStatus }]);
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
    const r = contracts.map(c => [c.vendor, c.name, c.supplier||"", c.type, c.start_date, c.end_date, c.renewal_date, c.auto_renew, c.auto_renew_notice_days, c.annual_cost, c.currency, c.studio, c.owner_name||"", c.owner_email||"", c.wiki_url||"", `"${(c.notes||"").replace(/"/g,'""')}"`].join(","));
    const blob = new Blob(["\uFEFF" + [h, ...r].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `contracts_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  const sendSlack = async (msg) => { if (!notifSettings.slackWebhookUrl) { showToast("Slack Webhook URL 미설정", "error"); return; } try { await fetch(notifSettings.slackWebhookUrl, { method: "POST", body: JSON.stringify({ text: msg }) }); showToast("Slack 발송 완료", "success"); } catch { showToast("Slack 발송 실패", "error"); } };
  const sendEmail = (subject, body) => { window.open(`mailto:${encodeURIComponent(notifSettings.emailRecipients||"")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank"); showToast("Outlook 열림", "success"); };

  const vendors = useMemo(() => [...new Set(contracts.map(c => c.vendor))].sort(), [contracts]);
  const existingStudios = useMemo(() => [...customStudios].filter(Boolean), [customStudios]);
  const existingTypes = useMemo(() => [...customTypes].filter(Boolean), [customTypes]);
  const notifications = useMemo(() => generateNotifications(contracts), [contracts]);
  const activeNotifs = notifications.filter(n => !dismissedNotifs[n.id]);
  const criticalCount = activeNotifs.filter(n => n.urgency === "critical" || n.urgency === "expired").length;

  const filtered = useMemo(() => {
    let list = contracts.filter(c => { const ms = !searchTerm || `${c.vendor} ${c.name} ${c.notes}`.toLowerCase().includes(searchTerm.toLowerCase()); const mt = filterType === "all" || c.type === filterType; const mst = filterStatus === "all" || c.status === filterStatus; return ms && mt && mst; });
    list.sort((a, b) => { if (sortBy === "urgency") return Math.min(getDaysUntil(a.end_date), getDaysUntil(a.renewal_date)) - Math.min(getDaysUntil(b.end_date), getDaysUntil(b.renewal_date)); if (sortBy === "cost") return b.annual_cost - a.annual_cost; if (sortBy === "vendor") return a.vendor.localeCompare(b.vendor); return 0; });
    return list;
  }, [contracts, searchTerm, filterType, filterStatus, sortBy]);

  const stats = useMemo(() => { const a = contracts.filter(c => c.status === "active"); return { total: a.length, totalCostUSD: a.filter(c => c.currency === "USD").reduce((s, c) => s + (c.annual_cost||0), 0), autoRenewCount: a.filter(c => c.auto_renew).length, urgentCount: a.filter(c => ["critical","expired"].includes(getUrgencyLevel(c))).length, warningCount: a.filter(c => getUrgencyLevel(c) === "warning").length }; }, [contracts]);

  const navItems = [
    { id: "dashboard", label: "대시보드", icon: "◫" },
    { id: "notifications", label: "알림 센터", icon: "🔔", badge: activeNotifs.length },
    { id: "list", label: "계약 목록", icon: "☰" },
    { id: "types", label: "유형별", icon: "⬡" },
    { id: "trash", label: "휴지통", icon: "🗑" },
  ];

  if (loading) return (<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}><div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #4A6FA5, #3A5A8A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>C</div><div style={{ fontSize: 14, color: "#6B7280" }}>데이터 불러오는 중...</div></div>);

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
          <button onClick={() => setShowCSV(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 12, cursor: "pointer" }}>↑ Import</button>
          <button onClick={exportCSV} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 12, cursor: "pointer" }}>↓ Export</button>
          <button onClick={() => setShowOptionsManager(true)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 12, cursor: "pointer" }}>⚙</button>
          <button onClick={() => { setEditContract(null); setShowForm(true); }} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #4A6FA5, #3A5A8A)", color: "#E8ECF2", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ 계약 등록</button>
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 69px)" }}>
        {/* Sidebar */}
        <div style={{ width: 180, padding: "20px 12px", borderRight: "1px solid #1A1F2B", flexShrink: 0 }}>
          {navItems.map(item => (<button key={item.id} onClick={() => { setView(item.id); if (item.id === "trash") loadDeletedContracts(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", borderRadius: 8, border: "none", background: view === item.id ? "#1A1F2B" : "transparent", color: view === item.id ? "#E8ECF2" : "#6B7280", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 4, textAlign: "left" }}><span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}{item.badge > 0 && <span style={{ marginLeft: "auto", background: criticalCount > 0 && item.id === "notifications" ? "#FF4444" : "#4A6FA5", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10 }}>{item.badge}</span>}</button>))}
          <div style={{ margin: "20px 14px", padding: "14px 0", borderTop: "1px solid #1A1F2B" }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.total}</div>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>활성 계약</div>
            {stats.urgentCount > 0 && <div style={{ fontSize: 12, color: "#FF6B6B" }}>⚠ {stats.urgentCount}건 긴급</div>}
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: 28, overflow: "auto" }}>
          {/* Dashboard */}
          {view === "dashboard" && (<div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
              {[{ label: "전체 계약", value: stats.total, sub: "건", color: "#4A6FA5" }, { label: "연간 비용 (USD)", value: formatCurrency(stats.totalCostUSD), sub: "/yr", color: "#6BA3FF" }, { label: "자동갱신", value: stats.autoRenewCount, sub: "건", color: "#00D4AA" }, { label: "알림", value: activeNotifs.length, sub: "건", color: criticalCount > 0 ? "#FF6B6B" : "#FFE066" }].map((card, i) => (<div key={i} onClick={i === 3 ? () => setView("notifications") : undefined} style={{ padding: "20px 22px", background: "#111620", border: "1px solid #1A1F2B", borderRadius: 14, cursor: i === 3 ? "pointer" : "default", animation: `fadeIn 0.4s ease ${i * 0.08}s both` }}><div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10 }}>{card.label}</div><div style={{ fontSize: 26, fontWeight: 700, color: card.color }}>{card.value}<span style={{ fontSize: 12, color: "#4A5568", marginLeft: 4 }}>{card.sub}</span></div></div>))}
            </div>
            <TimelineCalendar contracts={contracts} onSelectContract={setShowDetail} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "#8892A0", marginBottom: 14 }}>⚡ 주의가 필요한 계약</div>
            {contracts.filter(c => c.status === "active" && (() => { const d = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date)); return d > 0 && d <= 90; })()).sort((a, b) => Math.min(getDaysUntil(a.end_date), getDaysUntil(a.renewal_date)) - Math.min(getDaysUntil(b.end_date), getDaysUntil(b.renewal_date))).map((c, i) => { const urg = getUrgencyLevel(c); const dl = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date)); const uc = urgencyColors[urg]; return (<div key={c.id} onClick={() => setShowDetail(c)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: uc.bg, border: `1px solid ${uc.border}40`, borderRadius: 12, marginBottom: 8, cursor: "pointer", animation: `slideIn 0.3s ease ${i * 0.06}s both` }}><div style={{ display: "flex", alignItems: "center", gap: 16 }}><StatusBadge urgency={urg} autoRenew={c.auto_renew} /><div><div style={{ fontSize: 14, fontWeight: 600 }}>{c.vendor}</div><div style={{ fontSize: 12, color: "#6B7280" }}>{c.name}{c.owner_name ? ` · ${c.owner_name}` : ""}</div></div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 18, fontWeight: 700, color: uc.text }}>D-{dl}</div><div style={{ fontSize: 11, color: "#6B7280" }}>{c.end_date}</div></div></div>); })}
            {contracts.filter(c => c.status === "active" && (() => { const d = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date)); return d > 0 && d <= 90; })()).length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#4A5568", fontSize: 13 }}>90일 이내 만료 예정인 계약이 없습니다 ✓</div>}
          </div>)}

          {/* Notifications */}
          {view === "notifications" && (<div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div><div style={{ fontSize: 18, fontWeight: 700 }}>🔔 알림 센터</div><div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{activeNotifs.length}건</div></div>
              <button onClick={() => setShowNotifSettings(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 12, cursor: "pointer" }}>⚙ 설정</button>
            </div>
            {activeNotifs.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "#4A5568" }}>알림 없음 ✓</div> : (<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{activeNotifs.map((n, i) => { const uc = urgencyColors[n.urgency]; return (<div key={n.id} style={{ padding: "18px 22px", background: uc.bg, border: `1px solid ${uc.border}60`, borderRadius: 14, animation: `fadeIn 0.3s ease ${i * 0.05}s both`, borderLeft: `4px solid ${uc.dot}` }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><div style={{ fontSize: 14, fontWeight: 700, color: uc.text }}>{n.title}</div><span style={{ fontSize: 20, fontWeight: 700, color: uc.text }}>{n.daysLeft > 0 ? `D-${n.daysLeft}` : n.daysLeft === 0 ? "D-Day" : `D+${Math.abs(n.daysLeft)}`}</span></div><div style={{ fontSize: 13, color: "#8892A0", padding: "10px 14px", background: "rgba(0,0,0,0.2)", borderRadius: 8, marginBottom: 14 }}>{n.message}{n.ownerName ? <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "#6B7280" }}>담당: {n.ownerName}</span> : null}</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button onClick={() => sendSlack(buildSlackMsg(n))} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#4A154B", color: "#E8ECF2", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>💬 Slack</button><button onClick={() => sendEmail(buildEmailSubject(n), buildEmailBody(n))} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#0078D4", color: "#E8ECF2", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>📧 Outlook</button><button onClick={() => setDismissedNotifs(p => ({...p, [n.id]: true}))} style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "1px solid #2E3440", background: "transparent", color: "#6B7280", fontSize: 11, cursor: "pointer" }}>✕</button></div></div>); })}</div>)}
          </div>)}

          {/* List */}
          {view === "list" && (<div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <input style={{ ...inputStyle, width: 240 }} placeholder="🔍 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              <select style={{ ...inputStyle, width: 160 }} value={filterType} onChange={e => setFilterType(e.target.value)}><option value="all">모든 유형</option>{existingTypes.map(t => <option key={t} value={t}>{t}</option>)}</select>
              <select style={{ ...inputStyle, width: 130 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="all">전체 상태</option><option value="active">활성</option><option value="terminated">종료</option></select>
              <select style={{ ...inputStyle, width: 140 }} value={sortBy} onChange={e => setSortBy(e.target.value)}><option value="urgency">긴급도순</option><option value="cost">비용순</option><option value="vendor">벤더순</option></select>
            </div>
            <div style={{ borderRadius: 12, border: "1px solid #1A1F2B", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: "#111620" }}>{["상태", "벤더", "계약명", "유형", "담당자", "종료일", "D-Day", "연간비용", ""].map((h, i) => <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600, borderBottom: "1px solid #1A1F2B" }}>{h}</th>)}</tr></thead>
                <tbody>{filtered.map(c => { const urg = getUrgencyLevel(c); const dl = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date)); const uc = urgencyColors[urg]; const isTerm = c.status === "terminated"; return (<tr key={c.id} onClick={() => setShowDetail(c)} style={{ borderBottom: "1px solid #1A1F2B", cursor: "pointer", opacity: isTerm ? 0.5 : 1 }} onMouseEnter={e => e.currentTarget.style.background="#111620"} onMouseLeave={e => e.currentTarget.style.background="transparent"}><td style={{ padding: "12px 16px" }}>{isTerm ? <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#1A1D23", color: "#6B7280", border: "1px solid #2E3440" }}>종료</span> : <StatusBadge urgency={urg} autoRenew={c.auto_renew} />}</td><td style={{ padding: "12px 16px", fontWeight: 600 }}>{c.vendor}</td><td style={{ padding: "12px 16px", color: "#8892A0" }}>{c.name}</td><td style={{ padding: "12px 16px" }}><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, background: "#1A1F2B", color: "#8892A0" }}>{c.type}</span></td><td style={{ padding: "12px 16px", fontSize: 12, color: "#8892A0" }}>{c.owner_name || "—"}</td><td style={{ padding: "12px 16px", color: "#8892A0" }}>{c.end_date}</td><td style={{ padding: "12px 16px", fontWeight: 700, color: isTerm ? "#6B7280" : uc.text }}>{isTerm ? "종료" : dl > 0 ? `D-${dl}` : dl === 0 ? "D-Day" : `D+${Math.abs(dl)}`}</td><td style={{ padding: "12px 16px", fontWeight: 600 }}>{formatCurrency(c.annual_cost, c.currency)}</td><td style={{ padding: "12px 16px", display: "flex", gap: 6 }}><button onClick={e => { e.stopPropagation(); setEditContract(c); setShowForm(true); }} style={{ background: "none", border: "1px solid #2E3440", borderRadius: 6, color: "#6B7280", padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>수정</button><button onClick={e => { e.stopPropagation(); setDeleteTarget(c); }} style={{ background: "none", border: "1px solid #8B3A3A40", borderRadius: 6, color: "#FF6B6B", padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>삭제</button></td></tr>); })}</tbody>
              </table>
              {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#4A5568", fontSize: 13 }}>검색 결과 없음</div>}
            </div>
          </div>)}

          {/* Vendors */}
          {view === "types" && (<div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#8892A0", marginBottom: 20 }}>계약 유형별 현황</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
              {existingTypes.map(type => { const tc = contracts.filter(c => c.type === type && c.status === "active"); const cost = tc.reduce((s, c) => s + (c.currency === "USD" ? (c.annual_cost||0) : 0), 0); return (<div key={type} style={{ padding: 20, background: "#111620", border: "1px solid #1A1F2B", borderRadius: 14 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}><div><div style={{ fontSize: 16, fontWeight: 700 }}>{type}</div><div style={{ fontSize: 11, color: "#6B7280" }}>{tc.length}건 활성</div></div><div style={{ fontSize: 18, fontWeight: 700, color: "#4A6FA5" }}>{formatCurrency(cost)}</div></div>{tc.map(c => { const urg = getUrgencyLevel(c); const uc = urgencyColors[urg]; const dl = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date)); return (<div key={c.id} onClick={() => setShowDetail(c)} style={{ padding: "10px 12px", borderRadius: 8, background: "#0B0E14", border: "1px solid #1A1F2B", marginBottom: 6, cursor: "pointer", display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: 12, fontWeight: 500 }}>{c.vendor} — {c.name}</div><div style={{ fontSize: 10, color: "#6B7280" }}>{c.owner_name || c.studio}</div></div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 12, fontWeight: 600, color: uc.text }}>D{dl > 0 ? `-${dl}` : `+${Math.abs(dl)}`}</span><span style={{ width: 6, height: 6, borderRadius: "50%", background: uc.dot }} /></div></div>); })}</div>); })}
            </div>
          </div>)}

          {/* Trash */}
          {view === "trash" && (<div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div><div style={{ fontSize: 18, fontWeight: 700 }}>🗑 휴지통</div><div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>삭제된 계약은 30일 후 완전 삭제됩니다.</div></div>
            </div>
            {deletedContracts.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "#4A5568", fontSize: 13 }}>휴지통이 비어 있습니다.</div> : (
              <div style={{ borderRadius: 12, border: "1px solid #1A1F2B", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "#111620" }}>{["벤더", "계약명", "유형", "종료일", "삭제일", "상태", ""].map((h, i) => <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600, borderBottom: "1px solid #1A1F2B" }}>{h}</th>)}</tr></thead>
                  <tbody>{deletedContracts.map(c => {
                    const deletedDate = c.deleted_at ? new Date(c.deleted_at) : new Date();
                    const daysSinceDelete = Math.floor((new Date() - deletedDate) / 86400000);
                    const daysUntilPurge = 30 - daysSinceDelete;
                    const isNearPurge = daysUntilPurge <= 7;
                    return (<tr key={c.id} style={{ borderBottom: "1px solid #1A1F2B", opacity: 0.8 }}>
                      <td style={{ padding: "12px 16px", fontWeight: 600 }}>{c.vendor}</td>
                      <td style={{ padding: "12px 16px", color: "#8892A0" }}>{c.name}</td>
                      <td style={{ padding: "12px 16px" }}><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, background: "#1A1F2B", color: "#8892A0" }}>{c.type}</span></td>
                      <td style={{ padding: "12px 16px", color: "#8892A0" }}>{c.end_date}</td>
                      <td style={{ padding: "12px 16px", color: "#6B7280", fontSize: 12 }}>{deletedDate.toLocaleDateString("ko-KR")}</td>
                      <td style={{ padding: "12px 16px" }}>{daysUntilPurge <= 0 ? <span style={{ fontSize: 11, color: "#FF4444", fontWeight: 600 }}>완전 삭제 대상</span> : isNearPurge ? <span style={{ fontSize: 11, color: "#FF6B6B", fontWeight: 600 }}>{daysUntilPurge}일 후 완전 삭제</span> : <span style={{ fontSize: 11, color: "#6B7280" }}>{daysUntilPurge}일 남음</span>}</td>
                      <td style={{ padding: "12px 16px" }}><button onClick={() => restoreContract(c.id)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #3A8B7A", background: "transparent", color: "#66FFCC", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>복구</button></td>
                    </tr>);
                  })}</tbody>
                </table>
              </div>
            )}
          </div>)}
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title="계약 상세" width={650}>
        {showDetail && (<ContractDetailWithAudit contract={showDetail} onToggleStatus={toggleContractStatus} onEdit={(c) => { setEditContract(c); setShowForm(true); setShowDetail(null); }} onDelete={(c) => { setDeleteTarget(c); setShowDetail(null); }} />)}
      </Modal>

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditContract(null); }} title={editContract ? "계약 수정" : "계약 등록"}>
        <ContractForm contract={editContract} onSave={saveContract} onCancel={() => { setShowForm(false); setEditContract(null); }} existingStudios={existingStudios} existingTypes={existingTypes} />
      </Modal>

      <CSVImportModal isOpen={showCSV} onClose={() => setShowCSV(false)} onImport={importContracts} />

      <Modal isOpen={showNotifSettings} onClose={() => setShowNotifSettings(false)} title="⚙ 알림 설정" width={520}>
        <div>
          <InputField label="Slack Webhook URL"><input style={inputStyle} value={notifSettings.slackWebhookUrl} onChange={e => setNotifSettings(p => ({...p, slackWebhookUrl: e.target.value}))} placeholder="https://hooks.slack.com/services/..." /></InputField>
          <InputField label="Slack 채널명"><input style={inputStyle} value={notifSettings.slackChannel} onChange={e => setNotifSettings(p => ({...p, slackChannel: e.target.value}))} placeholder="#it-procurement" /></InputField>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "#8892A0", marginBottom: 16 }}><input type="checkbox" checked={notifSettings.slackEnabled} onChange={e => setNotifSettings(p => ({...p, slackEnabled: e.target.checked}))} style={{ accentColor: "#4A6FA5" }} />Slack 활성화</label>
          <div style={{ borderTop: "1px solid #1A1F2B", margin: "16px 0" }} />
          <InputField label="수신 이메일 (쉼표 구분)"><input style={inputStyle} value={notifSettings.emailRecipients} onChange={e => setNotifSettings(p => ({...p, emailRecipients: e.target.value}))} placeholder="user@krafton.com" /></InputField>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "#8892A0" }}><input type="checkbox" checked={notifSettings.emailEnabled} onChange={e => setNotifSettings(p => ({...p, emailEnabled: e.target.checked}))} style={{ accentColor: "#4A6FA5" }} />Outlook 활성화</label>
        </div>
      </Modal>

      {/* Options Manager Modal */}
      <Modal isOpen={showOptionsManager} onClose={() => setShowOptionsManager(false)} title="⚙ 스튜디오 / 계약유형 관리" width={560}>
        <OptionsManager
          studios={customStudios}
          types={customTypes}
          contracts={contracts}
          onSave={(studios, types) => {
            setCustomStudios(studios);
            setCustomTypes(types);
            saveCustomOptions(studios, types);
            setShowOptionsManager(false);
            showToast("목록이 저장되었습니다.", "success");
          }}
          onClose={() => setShowOptionsManager(false)}
        />
      </Modal>

      <DeleteConfirmModal isOpen={!!deleteTarget} contract={deleteTarget} onConfirm={deleteContract} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}
