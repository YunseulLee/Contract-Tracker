import { urgencyColors } from "@/lib/constants";

const labels = { expired: "만료됨", critical: "긴급", warning: "주의", upcoming: "예정", safe: "정상" };

export default function StatusBadge({ urgency, autoRenew }) {
  const c = urgencyColors[urgency];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
        background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%", background: c.dot,
          boxShadow: `0 0 8px ${c.dot}60`,
          animation: urgency === "critical" ? "pulse 2s infinite" : "none",
        }} />
        {labels[urgency]}
      </span>
      {autoRenew && (
        <span style={{
          padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
          background: "#5B8DEF15", color: "#5B8DEF", border: "1px solid #5B8DEF30",
        }}>
          ↻ 자동갱신
        </span>
      )}
    </div>
  );
}
