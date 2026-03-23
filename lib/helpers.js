export const formatCurrency = (amount, currency = "USD") =>
  currency === "KRW" ? `₩${(amount || 0).toLocaleString()}` : `$${(amount || 0).toLocaleString()}`;

export const getDaysUntil = (dateStr) => {
  if (!dateStr) return Infinity;
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00Z");
  return Math.ceil((target - now) / 86400000);
};

export const getUrgencyLevel = (c) => {
  const m = Math.min(getDaysUntil(c.end_date), getDaysUntil(c.renewal_date));
  if (m < 0) return "expired";
  if (m <= 30) return "critical";
  if (m <= 60) return "warning";
  if (m <= 90) return "upcoming";
  return "safe";
};
