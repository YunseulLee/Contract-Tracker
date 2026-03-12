import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function getDaysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr) - now) / 86400000);
}

function formatCurrency(amount, currency) {
  if (currency === "KRW") return `₩${(amount || 0).toLocaleString()}`;
  return `$${(amount || 0).toLocaleString()}`;
}

// 특정 시점에만 알림 발송 (60일, 30일, 14일, 7일, 3일, 1일, 당일)
const ALERT_DAYS = [60, 30, 14, 7, 3, 1, 0];
const shouldAlert = (daysLeft) => ALERT_DAYS.includes(daysLeft);
// 만료 후에는 매일 알림 (1~7일)
const shouldAlertExpired = (daysLeft) => daysLeft >= -7 && daysLeft < 0;

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { data: contracts, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("status", "active");

    if (error) throw error;

    const alerts = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    contracts.forEach((c) => {
      const daysToEnd = getDaysUntil(c.end_date);
      const daysToRenewal = getDaysUntil(c.renewal_date);

      // 계약 만료 알림 (60일 이내, 특정 시점만)
      if (daysToEnd >= 0 && daysToEnd <= 60 && shouldAlert(daysToEnd)) {
        alerts.push({
          type: daysToEnd <= 7 ? "🚨 긴급" : daysToEnd <= 30 ? "⚠️ 주의" : "📋 예정",
          vendor: c.vendor, name: c.name,
          detail: daysToEnd === 0 ? `오늘 만료! (${c.end_date})` : `만료 ${daysToEnd}일 전 (${c.end_date})`,
          cost: formatCurrency(c.annual_cost, c.currency),
          owner: c.owner_name || "", wiki_url: c.wiki_url || "",
          daysLeft: daysToEnd,
        });
      }

      // 만료 후 미처리 (매일)
      if (shouldAlertExpired(daysToEnd)) {
        alerts.push({
          type: "❌ 만료",
          vendor: c.vendor, name: c.name,
          detail: `${Math.abs(daysToEnd)}일 전 만료됨 (${c.end_date})`,
          cost: formatCurrency(c.annual_cost, c.currency),
          owner: c.owner_name || "", wiki_url: c.wiki_url || "",
          daysLeft: daysToEnd,
        });
      }

      // 자동갱신 해지 통지 (60일 이내, 특정 시점만)
      if (c.auto_renew && c.auto_renew_notice_days > 0) {
        const noticeDate = new Date(c.end_date);
        noticeDate.setDate(noticeDate.getDate() - c.auto_renew_notice_days);
        const daysToNotice = Math.ceil((noticeDate - today) / 86400000);
        if (daysToNotice >= 0 && daysToNotice <= 60 && shouldAlert(daysToNotice)) {
          alerts.push({
            type: daysToNotice <= 7 ? "🚨 자동갱신" : "🔄 자동갱신",
            vendor: c.vendor, name: c.name,
            detail: daysToNotice === 0 ? `해지 통보 마감 오늘! (통보기간: ${c.auto_renew_notice_days}일)` : `해지 통보 마감 ${daysToNotice}일 전 (통보기간: ${c.auto_renew_notice_days}일)`,
            cost: formatCurrency(c.annual_cost, c.currency),
            owner: c.owner_name || "", wiki_url: c.wiki_url || "",
            daysLeft: daysToNotice,
          });
        }
      }

      // 갱신 통보일 (60일 이내, 특정 시점만)
      if (daysToRenewal >= 0 && daysToRenewal <= 60 && c.renewal_date && shouldAlert(daysToRenewal)) {
        alerts.push({
          type: daysToRenewal <= 7 ? "🚨 갱신" : "📋 갱신",
          vendor: c.vendor, name: c.name,
          detail: daysToRenewal === 0 ? `갱신 통보일 오늘! (${c.renewal_date})` : `갱신 통보일 ${daysToRenewal}일 전 (${c.renewal_date})`,
          cost: formatCurrency(c.annual_cost, c.currency),
          owner: c.owner_name || "", wiki_url: c.wiki_url || "",
          daysLeft: daysToRenewal,
        });
      }

      // 분할 결제 (30일 이내, 특정 시점만 + 만료 후 매일)
      if (c.installment_enabled && c.installment_schedule) {
        let schedule = c.installment_schedule;
        if (typeof schedule === "string") {
          try { schedule = JSON.parse(schedule); } catch { schedule = []; }
        }
        schedule.forEach((inst) => {
          if (inst.paid) return;
          const dtp = getDaysUntil(inst.date);
          if ((dtp >= 0 && dtp <= 30 && shouldAlert(dtp)) || shouldAlertExpired(dtp)) {
            alerts.push({
              type: dtp <= 0 ? "🚨 결제" : "💳 결제",
              vendor: c.vendor, name: c.name,
              detail: dtp <= 0 ? `${inst.label} 결제 기한 ${Math.abs(dtp)}일 경과 (${inst.date})` : `${inst.label} 결제 ${dtp}일 전 (${inst.date})`,
              cost: formatCurrency(inst.amount, c.currency),
              owner: c.owner_name || "", wiki_url: c.wiki_url || "",
              daysLeft: dtp,
            });
          }
        });
      }
    });

    // 알림 대상 없으면 종료
    if (alerts.length === 0) {
      return Response.json({ message: "알림 대상 없음", count: 0 });
    }

    alerts.sort((a, b) => a.daysLeft - b.daysLeft);

    // Slack 메시지 생성
    const dateStr = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

    let message = `📊 *[Contract Tracker] 계약 알림*\n${dateStr}\n\n`;
    message += `총 *${alerts.length}건*의 알림이 있습니다.\n\n`;

    alerts.forEach((a) => {
      message += `${a.type} *${a.vendor}* — ${a.name}\n`;
      message += `> ${a.detail} | ${a.cost}${a.owner ? ` | 담당: ${a.owner}` : ""}${a.wiki_url ? `\n> 📎 ${a.wiki_url}` : ""}\n\n`;
    });

    message += `_IT Procurement — Contract Tracker_`;

    // Slack 발송
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      return Response.json({ message: "SLACK_WEBHOOK_URL 미설정", count: alerts.length });
    }

    const slackResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    if (!slackResponse.ok) {
      throw new Error(`Slack 발송 실패: ${slackResponse.status}`);
    }

    return Response.json({ message: "발송 완료", count: alerts.length, date: dateStr });
  } catch (error) {
    console.error("Cron error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
