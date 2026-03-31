'use client';
import { useState, useEffect } from "react";
import { inputStyle } from "@/lib/constants";

export default function DeleteConfirmModal({ isOpen, contract, onConfirm, onClose }) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (isOpen) setTyped(""); }, [isOpen]);
  if (!isOpen || !contract) return null;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      backdropFilter: "blur(8px)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 1100, padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#12141A", border: "1px solid #8B3A3A", borderRadius: 16,
        width: "100%", maxWidth: 440, boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        padding: 28,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#F87171", marginBottom: 16 }}>
          계약 삭제
        </div>
        <div style={{ fontSize: 13, color: "#9BA1AE", marginBottom: 8, lineHeight: 1.6 }}>
          <span style={{ fontWeight: 600, color: "#EDEEF0" }}>
            {contract.vendor} — {contract.name}
          </span>{" "}계약을 삭제하시겠습니까?
        </div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 20 }}>
          삭제된 계약은 휴지통으로 이동되며 30일 후 완전 삭제됩니다.
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#F87171", marginBottom: 8 }}>
          확인을 위해 아래에 &quot;삭제&quot;를 입력하세요:
        </div>
        <input
          style={{ ...inputStyle, border: `1px solid ${typed === "삭제" ? "#3A8B7A" : "#2A2D38"}`, marginBottom: 20 }}
          value={typed} onChange={(e) => setTyped(e.target.value)}
          placeholder="삭제" autoFocus
        />
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "10px 24px", borderRadius: 10, border: "1px solid #2A2D38",
            background: "transparent", color: "#9BA1AE", fontSize: 14, cursor: "pointer",
          }}>취소</button>
          <button
            onClick={() => { if (typed === "삭제") onConfirm(contract.id); }}
            disabled={typed !== "삭제"}
            style={{
              padding: "10px 24px", borderRadius: 10, border: "none",
              background: typed === "삭제" ? "#8B3A3A" : "#2A2D38",
              color: typed === "삭제" ? "#EDEEF0" : "#555",
              fontSize: 14, fontWeight: 600,
              cursor: typed === "삭제" ? "pointer" : "default",
              transition: "all 0.2s",
            }}>
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
