export default function Modal({ isOpen, onClose, title, children, width = 600 }) {
  if (!isOpen) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(5,6,10,0.7)",
      backdropFilter: "blur(12px)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 1000, padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#151720", border: "1px solid #2B3044", borderRadius: 18,
        width: "100%", maxWidth: width, maxHeight: "85vh", overflow: "auto",
        boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.05)",
        animation: "modalIn 200ms ease-out",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "24px 28px", borderBottom: "1px solid #1F2233",
        }}>
          <h2 style={{ margin: 0, fontSize: 20, color: "#F0F1F4" }}>{title}</h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#636B7E",
            fontSize: 22, cursor: "pointer", padding: "4px 8px",
            borderRadius: 8, lineHeight: 1,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#242836"}
          onMouseLeave={(e) => e.currentTarget.style.background = "none"}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 28 }}>{children}</div>
      </div>
    </div>
  );
}
