export default function InputField({ label, required, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: "block", fontSize: 12, fontWeight: 600, color: "#949BAD",
        marginBottom: 6, letterSpacing: "0.5px", textTransform: "uppercase",
      }}>
        {label} {required && <span style={{ color: "#F06B6B" }}>*</span>}
      </label>
      {children}
    </div>
  );
}
