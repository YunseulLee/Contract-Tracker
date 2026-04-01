'use client';
import { useState, useMemo } from "react";
import StatusBadge from "./ui/StatusBadge";
import { urgencyColors } from "@/lib/constants";
import { getDaysUntil, getUrgencyLevel, formatCurrency } from "@/lib/helpers";

export default function TimelineCalendar({ contracts, onSelectContract }) {
  const [selectedMonth, setSelectedMonth] = useState(null);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const months = Array.from({ length: 12 }, (_, i) => {
    const y = currentYear + Math.floor((currentMonth + i) / 12);
    const m = (currentMonth + i) % 12;
    return { year: y, month: m, key: `${y}-${String(m + 1).padStart(2, "0")}` };
  });

  const activeContracts = contracts.filter((c) => c.status === "active");

  const monthData = useMemo(() => {
    const map = {};
    months.forEach(({ key, year, month }) => {
      const items = [];
      activeContracts.forEach((c) => {
        const events = [];
        if (c.end_date) { const d = new Date(c.end_date + "T00:00:00Z"); if (d.getUTCFullYear() === year && d.getUTCMonth() === month) events.push({ type: "만료", date: c.end_date }); }
        if (c.renewal_date) { const d = new Date(c.renewal_date + "T00:00:00Z"); if (d.getUTCFullYear() === year && d.getUTCMonth() === month) events.push({ type: "갱신", date: c.renewal_date }); }
        if (events.length > 0) items.push({ contract: c, events });
      });
      map[key] = items;
    });
    return map;
  }, [contracts]);

  const getMonthColor = (key) => {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const items = monthData[key] || [];
    if (items.length === 0) return { bar: "#1F2233", text: "#444A58" };
    let minDays = Infinity;
    items.forEach(({ events }) => events.forEach((ev) => {
      const d = Math.ceil((new Date(ev.date + "T00:00:00Z") - today) / 86400000);
      if (d < minDays) minDays = d;
    }));
    if (minDays <= 30) return { bar: "#EF4444", text: "#F06B6B" };
    if (minDays <= 60) return { bar: "#EAB308", text: "#F5B731" };
    return { bar: "#4A9FD8", text: "#4A9FD8" };
  };

  const isCurrentMonth = (year, month) => year === currentYear && month === currentMonth;
  const selectedItems = selectedMonth ? (monthData[selectedMonth] || []) : [];
  const maxCount = Math.max(1, ...months.map((m) => (monthData[m.key] || []).length));
  const monthNames = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#949BAD", marginBottom: 14 }}>📅 만료 타임라인</div>
      <div style={{ background: "#151720", border: "1px solid #1F2233", borderRadius: 16, padding: "20px 22px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 6 }}>
          {months.map(({ year, month, key }) => {
            const count = (monthData[key] || []).length;
            const colors = getMonthColor(key);
            const isCurrent = isCurrentMonth(year, month);
            const isSelected = selectedMonth === key;
            const barHeight = count > 0 ? Math.max(8, (count / maxCount) * 60) : 4;
            return (
              <div key={key} onClick={() => setSelectedMonth(isSelected ? null : key)} style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 0", borderRadius: 10, background: isSelected ? "#1F2233" : "transparent", border: isCurrent ? "1px solid #4A9FD840" : "1px solid transparent", transition: "all 0.2s" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: isCurrent ? "#F0F1F4" : "#636B7E", letterSpacing: "0.5px", fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>{monthNames[month]}</div>
                <div style={{ fontSize: 9, color: "#444A58" }}>{year}</div>
                <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "flex-end", height: 64 }}>
                  <div style={{ width: "60%", height: barHeight, borderRadius: 4, background: count > 0 ? colors.bar : "#1F2233", opacity: count > 0 ? 0.85 : 0.4, transition: "height 0.3s ease" }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: count > 0 ? colors.text : "#2B3044", minHeight: 18, fontFamily: "'JetBrains Mono', monospace" }}>{count > 0 ? count : ""}</div>
                {isCurrent && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#4A9FD8" }} />}
              </div>
            );
          })}
        </div>

        {selectedMonth && selectedItems.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #1F2233" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#949BAD", marginBottom: 10 }}>
              {selectedMonth.replace("-", "년 ")}월 — {selectedItems.length}건
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {selectedItems.map(({ contract: sc, events }) => {
                const urg = getUrgencyLevel(sc);
                const uc = urgencyColors[urg];
                return (
                  <div key={sc.id} onClick={() => onSelectContract(sc)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: uc.bg, border: `1px solid ${uc.border}30`, borderRadius: 10, cursor: "pointer", transition: "background 0.2s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <StatusBadge urgency={urg} autoRenew={sc.auto_renew} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#F0F1F4" }}>{sc.vendor} — {sc.name}</div>
                        <div style={{ fontSize: 11, color: "#636B7E" }}>{sc.owner_name || sc.studio} · {formatCurrency(sc.annual_cost, sc.currency)}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {events.map((ev, ei) => (
                        <span key={ei} style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: ev.type === "만료" ? "#2D1B1B" : "#1B2333", color: ev.type === "만료" ? "#F06B6B" : "#4A9FD8", border: `1px solid ${ev.type === "만료" ? "#8B3A3A30" : "#2E4A7A30"}` }}>
                          {ev.type} {ev.date.slice(5)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {selectedMonth && selectedItems.length === 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #1F2233", textAlign: "center", padding: "20px 0", color: "#444A58", fontSize: 12 }}>해당 월에 만료/갱신 예정 계약이 없습니다.</div>
        )}
      </div>
    </div>
  );
}
