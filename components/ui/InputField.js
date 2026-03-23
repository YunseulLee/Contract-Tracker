export default function InputField({ label, required, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: "block", fontSize: 12, fontWeight: 600, color: "#8892A0",
        marginBottom: 6, letterSpacing: "0.5px", textTransform: "uppercase",
      }}>
        {label} {required && <span style={{ color: "#FF6B6B" }}>*</span>}
      </label>
      {children}
    </div>
  );
}
