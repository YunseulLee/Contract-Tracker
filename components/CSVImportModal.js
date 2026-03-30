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
    r.onload = (ev) => { setCsvText(ev.target.result); parsePreview(ev.target.result); };
    r.readAsText(f);
  };

  const parseCSVLine = (line) => {
    const fields = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ",") { fields.push(current.trim()); current = ""; }
        else { current += ch; }
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const parsePreview = (text) => {
    const lines = text.trim().split("\n").map((l) => l.replace(/\r$/, ""));
    if (lines.length < 2) { setPreview([]); return; }
    const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const vals = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, idx) => (obj[h] = vals[idx] || ""));
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
      <p style={{ fontSize: 13, color: "#8892A0", marginTop: 0, lineHeight: 1.6, marginBottom: 16 }}>
        CSV 파일을 업로드하거나 텍스트를 붙여넣으세요.<br />
        <span style={{ color: "#6BA3FF", fontSize: 12 }}>헤더: vendor, name, type, start_date, end_date, renewal_date, auto_renew, notice_days, annual_cost, currency, studio, owner_name, owner_email, wiki_url, notes</span><br />
        <span style={{ color: "#6BA3FF", fontSize: 12 }}>한글 헤더도 인식: 벤더, 계약명, 유형, 시작일, 종료일, 갱신일, 자동갱신, 비용, 통화, 스튜디오, 담당자, 메모</span>
      </p>
      <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: "none" }} />
      <button onClick={() => fileRef.current?.click()} style={{ padding: "12px 20px", borderRadius: 10, border: "1px dashed #4A6FA5", background: "#0D1017", color: "#6BA3FF", fontSize: 13, cursor: "pointer", width: "100%", marginBottom: 12 }}>📂 CSV 파일 선택</button>
      <textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical", fontSize: 12, marginBottom: 12 }} value={csvText} onChange={(e) => { setCsvText(e.target.value); parsePreview(e.target.value); }} placeholder="CSV 텍스트를 여기에 붙여넣기..." />

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
}
