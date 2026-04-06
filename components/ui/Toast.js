'use client';
import { useEffect } from "react";

const colors = {
  success: { bg: "#1B2D2A", border: "#3A8B7A", text: "#2DD4A0" },
  error: { bg: "#2D1B1B", border: "#8B3A3A", text: "#F06B6B" },
  info: { bg: "#1B2333", border: "#2B3044", text: "#4A9FD8" },
};

export default function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message]);

  const c = colors[type] || colors.info;
  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 9999,
      padding: "14px 22px", borderRadius: 12, background: c.bg,
      border: `1px solid ${c.border}`, color: c.text, fontSize: 13,
      fontWeight: 500, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      animation: "fadeIn 0.3s ease", maxWidth: 400,
    }}>
      {message}
    </div>
  );
}
