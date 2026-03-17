import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function getDaysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00Z");
  return Math.ceil((target - now) / 86400000);
}

function formatCurrency(amount, currency) {
  if (currency === "KRW") return `₩${(amount || 0).toLocaleString()}`;
  return `$${(amount || 0).toLocaleString()}`;
}

export async function GET(request) {
  // Vercel Cron 인증 확인
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 1. 활성 계약 가져오기
    const { data: contracts, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("status", "active")
      .eq("is_deleted", false);

    if (error) throw error;

    // 2. 알림 대상 계약 필터링
    const alerts = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    contracts.forEach((c) => {
      const daysToEnd = getDaysUntil(c.end_date);
      const daysToRenewal = getDaysUntil(c.renewal_date);

      // 만료 60일 이내
      if (daysToEnd > 0 && daysToEnd <= 60) {
        alerts.push({
          type: daysToEnd <= 30 ? "🚨 긴급" : "⚠️ 주의",
          vendor: c.vendor,
          name: c.name,
          detail: `만료 ${daysToEnd}일 전 (${c.end_date})`,
          cost: formatCurrency(c.annual_cost, c.currency),
          owner: c.owner_name || "",
          studio: c.studio,
          daysLeft: daysToEnd,
        });
      }

      // 자동갱신 통지기한 도래
      if (c.auto_renew && c.auto_renew_notice_days > 0) {
        const noticeDate = new Date(c.end_date);
        noticeDate.setDate(noticeDate.getDate() - c.auto_renew_notice_days);
        const daysToNotice = Math.ceil((noticeDate - today) / 86400000);
        if (daysToNotice >= 0 && daysToNotice <= 30) {
          alerts.push({
            type: "🔄 자동갱신",
            vendor: c.vendor,
            name: c.name,
            detail: `해지 통보 마감 ${daysToNotice}일 전 (통보기간: ${c.auto_renew_notice_days}일)`,
            cost: formatCurrency(c.annual_cost, c.currency),
            owner: c.owner_name || "",
            studio: c.studio,
            daysLeft: daysToNotice,
          });
        }
      }

      // 갱신 통보일 30일 이내
      if (daysToRenewal > 0 && daysToRenewal <= 30 && c.renewal_date) {
        alerts.push({
          type: "📋 갱신",
          vendor: c.vendor,
          name: c.name,
          detail: `갱신 통보일 ${daysToRenewal}일 전 (${c.renewal_date})`,
          cost: formatCurrency(c.annual_cost, c.currency),
          owner: c.owner_name || "",
          studio: c.studio,
          daysLeft: daysToRenewal,
        });
      }

      // 이미 만료됨 (30일까지 알림 유지)
      if (daysToEnd < 0 && daysToEnd >= -30) {
        alerts.push({
          type: "❌ 만료",
          vendor: c.vendor,
          name: c.name,
          detail: `${Math.abs(daysToEnd)}일 전 만료됨 (${c.end_date})`,
          cost: formatCurrency(c.annual_cost, c.currency),
          owner: c.owner_name || "",
          studio: c.studio,
          daysLeft: daysToEnd,
        });
      }

      // 분할 결제 알림
      if (c.installment_enabled && c.installment_schedule) {
        let schedule = c.installment_schedule;
        if (typeof schedule === "string") {
          try { schedule = JSON.parse(schedule); } catch { schedule = []; }
        }
        schedule.forEach((inst) => {
          if (inst.paid) return;
          const dtp = getDaysUntil(inst.date);
          if (dtp >= -7 && dtp <= 14) {
            alerts.push({
              type: "💳 결제",
              vendor: c.vendor,
              name: c.name,
              detail: dtp <= 0 ? `${inst.label} 결제 기한 ${Math.abs(dtp)}일 경과 (${inst.date})` : `${inst.label} 결제 ${dtp}일 전 (${inst.date})`,
              cost: formatCurrency(inst.amount, c.currency),
              owner: c.owner_name || "",
              studio: c.studio,
              daysLeft: dtp,
            });
          }
        });
      }
    });

    // 3. 알림 대상이 없으면 종료
    if (alerts.length === 0) {
      return Response.json({ message: "알림 대상 없음", count: 0 });
    }

    // 4. 알림 대상을 긴급도순으로 정렬
    alerts.sort((a, b) => a.daysLeft - b.daysLeft);

    // 5. Slack 메시지 생성
    const dateStr = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Seoul" });

    let message = `📊 *[Contract Tracker] 일일 계약 알림*\n${dateStr}\n\n`;
    message += `총 *${alerts.length}건*의 알림이 있습니다.\n\n`;

    alerts.forEach((a) => {
      message += `${a.type} *${a.vendor}* — ${a.name}\n`;
      message += `> ${a.detail} | ${a.cost}${a.owner ? ` | 담당: ${a.owner}` : ""}\n\n`;
    });

    message += `_IT Procurement — Contract Tracker_`;

    // 6. Slack Webhook 가져오기
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
      return Response.json({ message: "SLACK_WEBHOOK_URL 미설정", count: alerts.length });
    }

    // 7. Slack 발송
    const slackResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    if (!slackResponse.ok) {
      const errorBody = await slackResponse.text();
      throw new Error(`Slack 발송 실패: ${slackResponse.status} - ${errorBody}`);
    }

    return Response.json({
      message: "Slack 알림 발송 완료",
      count: alerts.length,
      date: dateStr,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
