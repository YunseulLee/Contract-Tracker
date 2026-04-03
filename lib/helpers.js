export const formatCurrency = (amount, currency = "USD") => {
  const v = (amount || 0).toLocaleString();
  if (currency === "KRW") return `₩${v}`;
  if (currency === "EUR") return `€${v}`;
  return `$${v}`;
};

export const getDaysUntil = (dateStr) => {
  if (!dateStr) return Infinity;
  const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  kstNow.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00+09:00");
  return Math.ceil((target - kstNow) / 86400000);
};

export const getUrgencyLevel = (c) => {
  const m = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date));
  if (m < 0) return "expired";
  if (m <= 30) return "critical";
  if (m <= 60) return "warning";
  if (m <= 90) return "upcoming";
  return "safe";
};
