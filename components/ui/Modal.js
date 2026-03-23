export default function Modal({ isOpen, onClose, title, children, width = 600 }) {
  if (!isOpen) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      backdropFilter: "blur(8px)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 1000, padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#141820", border: "1px solid #2E3440", borderRadius: 16,
        width: "100%", maxWidth: width, maxHeight: "85vh", overflow: "auto",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "20px 24px", borderBottom: "1px solid #2E3440",
        }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#E8ECF2" }}>{title}</h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#6B7280",
            fontSize: 22, cursor: "pointer", padding: "4px 8px",
            borderRadius: 8, lineHeight: 1,
          }}>
            ✕
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}
