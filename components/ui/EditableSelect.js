'use client';
import { useState } from "react";
import { inputStyle } from "@/lib/constants";

export default function EditableSelect({ value, onChange, options, placeholder }) {
  const [custom, setCustom] = useState(false);
  const isCustom = custom || (value && !options.includes(value));

  return isCustom ? (
    <div style={{ display: "flex", gap: 6 }}>
      <input style={{ ...inputStyle, flex: 1 }} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "직접 입력"} />
      <button onClick={() => { setCustom(false); onChange(options[0]); }}
        style={{
          padding: "8px 12px", borderRadius: 8, border: "1px solid #2B3044",
          background: "transparent", color: "#6B7280", fontSize: 11,
          cursor: "pointer", whiteSpace: "nowrap",
        }}>
        목록
      </button>
    </div>
  ) : (
    <div style={{ display: "flex", gap: 6 }}>
      <select style={{ ...inputStyle, flex: 1 }} value={value}
        onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <button onClick={() => { setCustom(true); onChange(""); }}
        style={{
          padding: "8px 12px", borderRadius: 8, border: "1px solid #2B3044",
          background: "transparent", color: "#4A9FD8", fontSize: 11,
          cursor: "pointer", whiteSpace: "nowrap",
        }}>
        + 추가
      </button>
    </div>
  );
}
