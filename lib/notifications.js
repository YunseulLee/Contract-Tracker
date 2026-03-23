import { getDaysUntil, formatCurrency } from "./helpers";

export const generateNotifications = (contracts) => {
  const notifs = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  contracts.forEach((c) => {
    const dte = getDaysUntil(c.end_date);
    const dtr = getDaysUntil(c.renewal_date);

    if (dte > 0 && dte <= 60) {
      notifs.push({
        id: `${c.id}-exp`, type: "expiry",
        urgency: dte <= 30 ? "critical" : "warning",
        title: `계약 만료 ${dte}일 전`,
        message: `${c.vendor} — ${c.name} 계약이 ${c.end_date}에 만료됩니다.`,
        vendor: c.vendor, contractName: c.name, daysLeft: dte, date: c.end_date,
        autoRenew: c.auto_renew, annualCost: c.annual_cost, currency: c.currency,
        studio: c.studio, ownerName: c.owner_name, ownerEmail: c.owner_email,
      });
    }

    if (c.auto_renew && c.auto_renew_notice_days > 0) {
      const nd = new Date(c.end_date);
      nd.setDate(nd.getDate() - c.auto_renew_notice_days);
      const dtn = Math.ceil((nd - today) / 86400000);
      if (dtn <= 30 && dtn > -7) {
        notifs.push({
          id: `${c.id}-auto`, type: "auto_renew_notice",
          urgency: dtn <= 0 ? "critical" : dtn <= 14 ? "warning" : "upcoming",
          title: dtn <= 0 ? "자동갱신 통지기한 경과" : `자동갱신 통지 ${dtn}일 전`,
          message: dtn <= 0
            ? `${c.vendor}의 자동갱신 해지 통지기한이 경과했습니다.`
            : `${c.vendor}의 해지 통보 마감까지 ${dtn}일`,
          vendor: c.vendor, contractName: c.name, daysLeft: dtn,
          date: nd.toISOString().slice(0, 10), autoRenew: true,
          annualCost: c.annual_cost, currency: c.currency, studio: c.studio,
          ownerName: c.owner_name, ownerEmail: c.owner_email,
          noticeDays: c.auto_renew_notice_days,
        });
      }
    }

    if (dtr > 0 && dtr <= 60 && c.renewal_date) {
      notifs.push({
        id: `${c.id}-ren`, type: "renewal",
        urgency: dtr <= 30 ? "critical" : "warning",
        title: `갱신 통보일 ${dtr}일 전`,
        message: `${c.vendor} — ${c.name} 갱신 통보일: ${c.renewal_date}`,
        vendor: c.vendor, contractName: c.name, daysLeft: dtr, date: c.renewal_date,
        autoRenew: c.auto_renew, annualCost: c.annual_cost, currency: c.currency,
        studio: c.studio, ownerName: c.owner_name, ownerEmail: c.owner_email,
      });
    }

    if (dte < 0 && dte >= -30) {
      notifs.push({
        id: `${c.id}-expired`, type: "expired", urgency: "expired",
        title: `계약 만료 (${Math.abs(dte)}일 경과)`,
        message: `${c.vendor} — ${c.name} 만료됨`,
        vendor: c.vendor, contractName: c.name, daysLeft: dte, date: c.end_date,
        autoRenew: c.auto_renew, annualCost: c.annual_cost, currency: c.currency,
        studio: c.studio, ownerName: c.owner_name, ownerEmail: c.owner_email,
      });
    }

    if (c.installment_enabled && c.installment_schedule && c.installment_schedule.length > 0) {
      c.installment_schedule.forEach((inst, idx) => {
        if (inst.paid) return;
        const dtp = getDaysUntil(inst.date);
        if (dtp >= -7 && dtp <= 30) {
          notifs.push({
            id: `${c.id}-inst-${idx}`, type: "installment",
            urgency: dtp <= 0 ? "critical" : dtp <= 7 ? "warning" : "upcoming",
            title: dtp <= 0
              ? `분할결제 ${inst.label} 기한 경과`
              : `분할결제 ${inst.label} ${dtp}일 전`,
            message: `${c.vendor} — ${c.name} ${inst.label} 결제: ${formatCurrency(inst.amount, c.currency)} (${inst.date})`,
            vendor: c.vendor, contractName: c.name, daysLeft: dtp, date: inst.date,
            autoRenew: false, annualCost: inst.amount, currency: c.currency,
            studio: c.studio, ownerName: c.owner_name, ownerEmail: c.owner_email,
          });
        }
      });
    }
  });

  return notifs.sort((a, b) => a.daysLeft - b.daysLeft);
};

export const buildSlackMsg = (n) =>
  `${n.urgency === "critical" || n.urgency === "expired" ? "🚨" : "⚠️"} *[Contract Alert] ${n.title}*\n> *벤더:* ${n.vendor}\n> *계약명:* ${n.contractName}\n> *스튜디오:* ${n.studio}${n.ownerName ? `\n> *담당자:* ${n.ownerName}` : ""}\n> *연간비용:* ${formatCurrency(n.annualCost, n.currency)}\n\n${n.message}`;

export const buildEmailSubject = (n) =>
  `${n.urgency === "critical" || n.urgency === "expired" ? "[긴급] " : "[알림] "}${n.vendor} — ${n.title}`;

export const buildEmailBody = (n) =>
  `안녕하세요,\n\n${n.title}\n\n■ 벤더: ${n.vendor}\n■ 계약명: ${n.contractName}\n■ 스튜디오: ${n.studio}${n.ownerName ? `\n■ 담당자: ${n.ownerName}` : ""}\n■ 연간비용: ${formatCurrency(n.annualCost, n.currency)}\n\n${n.message}\n\nIT Procurement Team`;
