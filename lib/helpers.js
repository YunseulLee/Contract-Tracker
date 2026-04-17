export const formatCurrency = (amount, currency = "USD") => {
  const v = Number(amount || 0).toLocaleString();
  if (currency === "KRW") return `₩${v}`;
  if (currency === "EUR") return `€${v}`;
  return `$${v}`;
};

export function getDaysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const kstToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const [ty, tm, td] = kstToday.split('-').map(Number);
  const [ey, em, ed] = dateStr.split('-').map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const endUtc = Date.UTC(ey, em - 1, ed);
  return Math.floor((endUtc - todayUtc) / 86400000);
}

export const getUrgencyLevel = (c) => {
  const m = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date));
  if (m < 0) return "expired";
  if (m <= 30) return "critical";
  if (m <= 60) return "warning";
  if (m <= 90) return "upcoming";
  return "safe";
};
