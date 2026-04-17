'use client';
import { useState, useRef } from "react";
import Modal from "./ui/Modal";
import { inputStyle } from "@/lib/constants";
import { formatCurrency } from "@/lib/helpers";

export default function CSVImportModal({ isOpen, onClose, onImport }) {
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState([]);
  const fileRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      const text = String(ev.target.result || "").replace(/^\uFEFF/, "");
      setCsvText(text);
      parsePreview(text);
    };
    r.readAsText(f);
  };

  // 따옴표로 감싼 필드 내부의 개행(\n, \r\n)과 ""-escape를 보존하는 CSV 파서
  const parseCSV = (text) => {
    const rows = [];
    let row = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ",") { row.push(current); current = ""; }
        else if (ch === "\r" && text[i + 1] === "\n") { row.push(current); rows.push(row); row = []; current = ""; i++; }
        else if (ch === "\n" || ch === "\r") { row.push(current); rows.push(row); row = []; current = ""; }
        else { current += ch; }
      }
    }
    // 마지막 필드/행 플러시 (빈 trailing newline은 무시)
    if (current.length > 0 || row.length > 0) { row.push(current); rows.push(row); }
    return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ""));
  };

  const parsePreview = (text) => {
    const cleaned = String(text || "").replace(/^\uFEFF/, "");
    const rowsRaw = parseCSV(cleaned);
    if (rowsRaw.length < 2) { setPreview([]); return; }
    const headers = rowsRaw[0].map((h) => h.trim().toLowerCase());
    const rows = rowsRaw.slice(1).map((vals) => {
      const obj = {};
      headers.forEach((h, idx) => (obj[h] = vals[idx] || ""));
      const installmentCount = parseInt(obj.installment_count || obj.installmentcount || obj["분할횟수"] || "0") || 0;
      const installmentAmount = parseFloat(obj.installment_amount || obj.installmentamount || obj["분할금액"] || "0") || 0;
      const installmentCurrency = obj.installment_currency || obj.installmentcurrency || obj["분할통화"] || "KRW";
      const installmentEnabled = installmentCount > 0;
      const installmentSchedule = installmentEnabled
        ? Array.from({ length: installmentCount }, (_, i) => ({
            label: `${i + 1}차`,
            amount: installmentAmount || 0,
            currency: installmentCurrency || "KRW",
            date: "",
            paid: false,
          }))
        : [];
      return {
        vendor: obj.vendor || obj["벤더"] || "",
        name: obj.name || obj["계약명"] || "",
        type: obj.type || obj["유형"] || "SaaS",
        start_date: obj.start_date || obj.startdate || obj["시작일"] || "",
        end_date: obj.end_date || obj.enddate || obj["종료일"] || "",
        renewal_date: obj.renewal_date || obj.renewaldate || obj["갱신일"] || "",
        auto_renew: ["true", "y", "yes", "예"].includes((obj.auto_renew || obj.autorenew || obj["자동갱신"] || "").toLowerCase()),
        auto_renew_notice_days: parseInt(obj.auto_renew_notice_days || obj.noticedays || obj.notice_days || obj["통보일수"] || "30") || 30,
        annual_cost: parseFloat(obj.annual_cost || obj.annualcost || obj.cost || obj["비용"] || "0") || 0,
        currency: obj.currency || obj["통화"] || "USD",
        studio: obj.studio || obj["스튜디오"] || "KRAFTON",
        owner_name: obj.owner_name || obj.ownername || obj["담당자"] || "",
        owner_email: obj.owner_email || obj.owneremail || obj["담당자이메일"] || "",
        wiki_url: obj.wiki_url || obj.wikiurl || obj["위키"] || obj["링크"] || "",
        supplier: obj.supplier || obj["공급사"] || obj["공급사명"] || "",
        notes: obj.notes || obj["메모"] || "",
        installment_enabled: installmentEnabled,
        installment_schedule: installmentSchedule,
        status: "active",
      };
    }).filter((r) => {
      if (!r.vendor || !r.end_date) return false;
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(r.end_date) || isNaN(new Date(r.end_date).getTime())) return false;
      if (r.start_date && (!dateRegex.test(r.start_date) || isNaN(new Date(r.start_date).getTime()))) return false;
      if (r.renewal_date && (!dateRegex.test(r.renewal_date) || isNaN(new Date(r.renewal_date).getTime()))) return false;
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
      <p style={{ fontSize: 13, color: "#949BAD", marginTop: 0, lineHeight: 1.6, marginBottom: 16 }}>
        CSV 파일을 업로드하거나 텍스트를 붙여넣으세요.<br />
        <span style={{ color: "#4A9FD8", fontSize: 12 }}>헤더: vendor, name, type, start_date, end_date, renewal_date, auto_renew, notice_days, annual_cost, currency, studio, owner_name, owner_email, wiki_url, notes</span><br />
        <span style={{ color: "#4A9FD8", fontSize: 12 }}>한글 헤더도 인식: 벤더, 계약명, 유형, 시작일, 종료일, 갱신일, 자동갱신, 비용, 통화, 스튜디오, 담당자, 메모</span>
      </p>
      <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: "none" }} />
      <button onClick={() => fileRef.current?.click()} style={{ padding: "12px 20px", borderRadius: 10, border: "1px dashed #4A9FD8", background: "#0D0E14", color: "#4A9FD8", fontSize: 13, cursor: "pointer", width: "100%", marginBottom: 12 }}>📂 CSV 파일 선택</button>
      <textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical", fontSize: 12, marginBottom: 12 }} value={csvText} onChange={(e) => { const t = e.target.value.replace(/^\uFEFF/, ""); setCsvText(t); parsePreview(t); }} placeholder="CSV 텍스트를 여기에 붙여넣기..." />

      {preview.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#2DD4A0", marginBottom: 8 }}>✓ {preview.length}건 인식됨 — 미리보기:</div>
          <div style={{ maxHeight: 200, overflow: "auto", borderRadius: 8, border: "1px solid #2B3044" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ background: "#1C1F2A" }}>{["벤더", "계약명", "종료일", "비용", "스튜디오"].map((h, i) => <th key={i} style={{ padding: "8px 12px", textAlign: "left", color: "#6B7280", borderBottom: "1px solid #1F2233" }}>{h}</th>)}</tr></thead>
              <tbody>{preview.slice(0, 10).map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #1F2233" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{r.vendor}</td>
                  <td style={{ padding: "8px 12px", color: "#949BAD" }}>{r.name}</td>
                  <td style={{ padding: "8px 12px", color: "#949BAD" }}>{r.end_date}</td>
                  <td style={{ padding: "8px 12px" }}>{formatCurrency(r.annual_cost, r.currency)}</td>
                  <td style={{ padding: "8px 12px", color: "#949BAD" }}>{r.studio}</td>
                </tr>
              ))}</tbody>
            </table>
            {preview.length > 10 && <div style={{ padding: 8, textAlign: "center", color: "#6B7280", fontSize: 11 }}>...외 {preview.length - 10}건</div>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
        <button onClick={() => { setCsvText(""); setPreview([]); onClose(); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #2B3044", background: "transparent", color: "#949BAD", cursor: "pointer", fontSize: 13 }}>취소</button>
        <button onClick={handleImport} disabled={preview.length === 0} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: preview.length > 0 ? "linear-gradient(135deg, #4A9FD8, #3D8EC6)" : "#2B3044", color: preview.length > 0 ? "#F0F1F4" : "#444A58", fontWeight: 600, cursor: preview.length > 0 ? "pointer" : "default", fontSize: 13 }}>
          {preview.length > 0 ? `${preview.length}건 Import` : "Import"}
        </button>
      </div>
    </Modal>
  );
}
