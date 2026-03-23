'use client';
import { useState } from "react";
import InputField from "./ui/InputField";
import EditableSelect from "./ui/EditableSelect";
import { inputStyle } from "@/lib/constants";

export default function ContractForm({ contract, onSave, onCancel, existingStudios = [], existingTypes = [] }) {
  const empty = {
    vendor: "", name: "", type: "SaaS", start_date: "", end_date: "",
    renewal_date: "", auto_renew: false, auto_renew_notice_days: 30,
    annual_cost: 0, currency: "USD", status: "active", notes: "",
    studio: "KRAFTON", owner_name: "", owner_email: "", wiki_url: "",
    supplier: "", installment_enabled: false, installment_schedule: [],
  };
  const [form, setForm] = useState(contract || empty);
  const up = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const studioOptions = existingStudios.length > 0 ? existingStudios : ["KRAFTON"];
  const typeOptions = existingTypes.length > 0 ? existingTypes : ["SaaS"];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <InputField label="벤더명" required><input style={inputStyle} value={form.vendor} onChange={(e) => up("vendor", e.target.value)} placeholder="e.g. Datadog" /></InputField>
        <InputField label="계약명" required><input style={inputStyle} value={form.name} onChange={(e) => up("name", e.target.value)} placeholder="e.g. APM Monitoring" /></InputField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <InputField label="공급사명"><input style={inputStyle} value={form.supplier} onChange={(e) => up("supplier", e.target.value)} placeholder="e.g. GS네오텍, 메가존클라우드" /></InputField>
        <InputField label="스튜디오"><EditableSelect value={form.studio} onChange={(v) => up("studio", v)} options={studioOptions} placeholder="스튜디오명 입력" /></InputField>
      </div>
      <InputField label="계약 유형"><EditableSelect value={form.type} onChange={(v) => up("type", v)} options={typeOptions} placeholder="계약 유형 입력" /></InputField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <InputField label="시작일" required><input style={inputStyle} type="date" value={form.start_date} onChange={(e) => up("start_date", e.target.value)} /></InputField>
        <InputField label="종료일" required><input style={inputStyle} type="date" value={form.end_date} onChange={(e) => up("end_date", e.target.value)} /></InputField>
        <InputField label="갱신 통보일"><input style={inputStyle} type="date" value={form.renewal_date} onChange={(e) => up("renewal_date", e.target.value)} /></InputField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <InputField label="연간 비용"><input style={inputStyle} type="number" value={form.annual_cost} onChange={(e) => up("annual_cost", Number(e.target.value))} /></InputField>
        <InputField label="통화">
          <select style={inputStyle} value={form.currency} onChange={(e) => up("currency", e.target.value)}>
            <option value="USD">USD ($)</option><option value="KRW">KRW (₩)</option><option value="EUR">EUR (€)</option>
          </select>
        </InputField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "center" }}>
        <InputField label="자동갱신">
          <div onClick={() => up("auto_renew", !form.auto_renew)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 0" }}>
            <div style={{ width: 44, height: 24, borderRadius: 12, background: form.auto_renew ? "#4A6FA5" : "#2E3440", position: "relative", transition: "background 0.3s" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#E8ECF2", position: "absolute", top: 3, left: form.auto_renew ? 23 : 3, transition: "left 0.3s" }} />
            </div>
            <span style={{ fontSize: 13, color: "#8892A0" }}>{form.auto_renew ? "ON" : "OFF"}</span>
          </div>
        </InputField>
        {form.auto_renew && (
          <InputField label="사전 통보 기간">
            <div style={{ display: "flex", gap: 8 }}>
              {[30, 60, 90].map((d) => (
                <button key={d} onClick={() => up("auto_renew_notice_days", d)} style={{
                  flex: 1, padding: "10px", borderRadius: 8,
                  border: `2px solid ${form.auto_renew_notice_days === d ? "#4A6FA5" : "#2E3440"}`,
                  background: form.auto_renew_notice_days === d ? "#1B2333" : "#0D1017",
                  color: form.auto_renew_notice_days === d ? "#6BA3FF" : "#6B7280",
                  fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
                }}>{d}일</button>
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
          <div onClick={() => {
            up("installment_enabled", !form.installment_enabled);
            if (!form.installment_enabled && form.installment_schedule.length === 0)
              up("installment_schedule", [{ date: "", amount: 0, label: "1차", paid: false }]);
          }} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 0" }}>
            <div style={{ width: 44, height: 24, borderRadius: 12, background: form.installment_enabled ? "#4A6FA5" : "#2E3440", position: "relative", transition: "background 0.3s" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#E8ECF2", position: "absolute", top: 3, left: form.installment_enabled ? 23 : 3, transition: "left 0.3s" }} />
            </div>
            <span style={{ fontSize: 13, color: "#8892A0" }}>{form.installment_enabled ? "ON" : "OFF (일시불)"}</span>
          </div>
        </InputField>
        {form.installment_enabled && (
          <InputField label="자동 분할">
            <div style={{ display: "flex", gap: 6 }}>
              {[{ l: "2회", n: 2 }, { l: "3회", n: 3 }, { l: "4회(분기)", n: 4 }, { l: "12회(월)", n: 12 }].map(({ l, n }) => (
                <button key={n} onClick={() => {
                  if (!form.start_date || !form.annual_cost) return;
                  const base = new Date(form.start_date + "T00:00:00Z");
                  const totalCost = form.annual_cost || 0;
                  const amt = Math.floor(totalCost / n);
                  const months = Math.round(12 / n);
                  const sched = Array.from({ length: n }, (_, i) => {
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
              <input style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }} type="date" value={item.date} onChange={(e) => { const s = [...form.installment_schedule]; s[idx] = { ...s[idx], date: e.target.value }; up("installment_schedule", s); }} />
              <input style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }} type="number" value={item.amount} onChange={(e) => { const s = [...form.installment_schedule]; s[idx] = { ...s[idx], amount: Number(e.target.value) }; up("installment_schedule", s); }} />
              <button onClick={() => { const s = form.installment_schedule.filter((_, i) => i !== idx); up("installment_schedule", s); }} style={{ background: "none", border: "none", color: "#FF6B6B", fontSize: 16, cursor: "pointer", padding: 0 }}>×</button>
            </div>
          ))}
          <button onClick={() => up("installment_schedule", [...form.installment_schedule, { date: "", amount: 0, label: `${form.installment_schedule.length + 1}차`, paid: false }])} style={{ padding: "6px 14px", borderRadius: 6, border: "1px dashed #2E3440", background: "transparent", color: "#6BA3FF", fontSize: 12, cursor: "pointer", width: "100%", marginTop: 4 }}>+ 회차 추가</button>
        </div>
      )}

      {/* 담당자 정보 */}
      <div style={{ padding: "14px 0 6px", borderTop: "1px solid #1A1F2B", marginTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#6BA3FF", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 12 }}>👤 담당자 정보</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <InputField label="담당자 이름"><input style={inputStyle} value={form.owner_name} onChange={(e) => up("owner_name", e.target.value)} placeholder="예: 홍길동" /></InputField>
        <InputField label="담당자 이메일"><input style={inputStyle} type="email" value={form.owner_email} onChange={(e) => up("owner_email", e.target.value)} placeholder="예: user@krafton.com" /></InputField>
      </div>
      <InputField label="📎 Wiki / 문서 링크"><input style={inputStyle} value={form.wiki_url} onChange={(e) => up("wiki_url", e.target.value)} placeholder="https://wiki.krafton.com/... 또는 Confluence, Notion 링크" /></InputField>
      <InputField label="메모"><textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={form.notes} onChange={(e) => up("notes", e.target.value)} placeholder="계약 관련 참고사항..." /></InputField>

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
        <button onClick={onCancel} style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #2E3440", background: "transparent", color: "#8892A0", fontSize: 14, cursor: "pointer" }}>취소</button>
        <button onClick={() => onSave(form)} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #4A6FA5, #3A5A8A)", color: "#E8ECF2", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{contract ? "수정" : "등록"}</button>
      </div>
    </div>
  );
}
