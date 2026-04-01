'use client';
import { useState } from "react";
import { inputStyle } from "@/lib/constants";

export default function OptionsManager({ studios = [], types = [], contracts = [], onSave, onClose }) {
  const [localStudios, setLocalStudios] = useState([...studios]);
  const [localTypes, setLocalTypes] = useState([...types]);
  const [newStudio, setNewStudio] = useState("");
  const [newType, setNewType] = useState("");

  const usedStudios = new Set(contracts.map((c) => c.studio).filter(Boolean));
  const usedTypes = new Set(contracts.map((c) => c.type).filter(Boolean));

  const addStudio = () => { if (newStudio.trim() && !localStudios.includes(newStudio.trim())) { setLocalStudios([...localStudios, newStudio.trim()]); setNewStudio(""); } };
  const addType = () => { if (newType.trim() && !localTypes.includes(newType.trim())) { setLocalTypes([...localTypes, newType.trim()]); setNewType(""); } };
  const removeStudio = (s) => { if (usedStudios.has(s)) return; setLocalStudios(localStudios.filter((x) => x !== s)); };
  const removeType = (t) => { if (usedTypes.has(t)) return; setLocalTypes(localTypes.filter((x) => x !== t)); };

  const tagStyle = (inUse) => ({
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
    borderRadius: 8, fontSize: 13, background: inUse ? "#1B2333" : "#0D0E14",
    color: inUse ? "#4A9FD8" : "#949BAD",
    border: `1px solid ${inUse ? "#2B3044" : "#2B3044"}`,
    marginRight: 8, marginBottom: 8,
  });

  const delBtn = (onClick) => (
    <span onClick={onClick} style={{ cursor: "pointer", color: "#F06B6B", fontSize: 14, lineHeight: 1, marginLeft: 2 }}>×</span>
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#F0F1F4", marginBottom: 12 }}>📁 스튜디오</div>
        <div style={{ marginBottom: 10 }}>
          {localStudios.map((s) => {
            const inUse = usedStudios.has(s);
            return <span key={s} style={tagStyle(inUse)}>{s}{inUse ? <span style={{ fontSize: 10, color: "#444A58" }}>(사용중)</span> : delBtn(() => removeStudio(s))}</span>;
          })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...inputStyle, flex: 1 }} value={newStudio} onChange={(e) => setNewStudio(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStudio()} placeholder="새 스튜디오 이름" />
          <button onClick={addStudio} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#1B2333", color: "#4A9FD8", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>+ 추가</button>
        </div>
        <div style={{ fontSize: 11, color: "#444A58", marginTop: 6 }}>사용중인 항목은 삭제할 수 없습니다. 해당 계약의 스튜디오를 변경하면 삭제 가능합니다.</div>
      </div>

      <div style={{ borderTop: "1px solid #1F2233", paddingTop: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#F0F1F4", marginBottom: 12 }}>📋 계약 유형</div>
        <div style={{ marginBottom: 10 }}>
          {localTypes.map((t) => {
            const inUse = usedTypes.has(t);
            return <span key={t} style={tagStyle(inUse)}>{t}{inUse ? <span style={{ fontSize: 10, color: "#444A58" }}>(사용중)</span> : delBtn(() => removeType(t))}</span>;
          })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...inputStyle, flex: 1 }} value={newType} onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addType()} placeholder="새 계약 유형" />
          <button onClick={addType} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#1B2333", color: "#4A9FD8", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>+ 추가</button>
        </div>
        <div style={{ fontSize: 11, color: "#444A58", marginTop: 6 }}>사용중인 항목은 삭제할 수 없습니다.</div>
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #2B3044", background: "transparent", color: "#949BAD", fontSize: 14, cursor: "pointer" }}>취소</button>
        <button onClick={() => onSave(localStudios, localTypes)} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #4A9FD8, #3D8EC6)", color: "#F0F1F4", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>저장</button>
      </div>
    </div>
  );
}
