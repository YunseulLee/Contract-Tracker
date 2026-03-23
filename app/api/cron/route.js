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

function generateAlerts(contracts) {
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
        level: daysToEnd <= 7 ? "escalation" : daysToEnd <= 30 ? "critical" : "warning",
        vendor: c.vendor, name: c.name,
        detail: `만료 ${daysToEnd}일 전 (${c.end_date})`,
        cost: formatCurrency(c.annual_cost, c.currency),
        owner: c.owner_name || "", ownerEmail: c.owner_email || "",
        studio: c.studio, daysLeft: daysToEnd,
      });
    }

    // 자동갱신 통지기한 도래
    if (c.auto_renew && c.auto_renew_notice_days > 0) {
      const noticeDate = new Date(c.end_date);
      noticeDate.setDate(noticeDate.getDate() - c.auto_renew_notice_days);
      const daysToNotice = Math.ceil((noticeDate - today) / 86400000);
      if (daysToNotice >= -7 && daysToNotice <= 30) {
        alerts.push({
          type: daysToNotice <= 0 ? "🚨 긴급" : "🔄 자동갱신",
          level: daysToNotice <= 0 ? "escalation" : daysToNotice <= 7 ? "critical" : "warning",
          vendor: c.vendor, name: c.name,
          detail: daysToNotice <= 0
            ? `해지 통보 마감 ${Math.abs(daysToNotice)}일 경과!`
            : `해지 통보 마감 ${daysToNotice}일 전 (통보기간: ${c.auto_renew_notice_days}일)`,
          cost: formatCurrency(c.annual_cost, c.currency),
          owner: c.owner_name || "", ownerEmail: c.owner_email || "",
          studio: c.studio, daysLeft: daysToNotice,
        });
      }
    }

    // 갱신 통보일 30일 이내
    if (daysToRenewal > 0 && daysToRenewal <= 30 && c.renewal_date) {
      alerts.push({
        type: "📋 갱신", level: daysToRenewal <= 7 ? "critical" : "warning",
        vendor: c.vendor, name: c.name,
        detail: `갱신 통보일 ${daysToRenewal}일 전 (${c.renewal_date})`,
        cost: formatCurrency(c.annual_cost, c.currency),
        owner: c.owner_name || "", ownerEmail: c.owner_email || "",
        studio: c.studio, daysLeft: daysToRenewal,
      });
    }

    // 이미 만료됨 (30일까지 알림 유지)
    if (daysToEnd < 0 && daysToEnd >= -30) {
      alerts.push({
        type: "❌ 만료", level: "escalation",
        vendor: c.vendor, name: c.name,
        detail: `${Math.abs(daysToEnd)}일 전 만료됨 (${c.end_date})`,
        cost: formatCurrency(c.annual_cost, c.currency),
        owner: c.owner_name || "", ownerEmail: c.owner_email || "",
        studio: c.studio, daysLeft: daysToEnd,
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
            type: "💳 결제", level: dtp <= 0 ? "escalation" : "warning",
            vendor: c.vendor, name: c.name,
            detail: dtp <= 0
              ? `${inst.label} 결제 기한 ${Math.abs(dtp)}일 경과 (${inst.date})`
              : `${inst.label} 결제 ${dtp}일 전 (${inst.date})`,
            cost: formatCurrency(inst.amount, c.currency),
            owner: c.owner_name || "", ownerEmail: c.owner_email || "",
            studio: c.studio, daysLeft: dtp,
          });
        }
      });
    }
  });

  return alerts.sort((a, b) => a.daysLeft - b.daysLeft);
}

async function sendSlackMessage(webhookUrl, message) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack 발송 실패: ${response.status} - ${body}`);
  }
}

export async function GET(request) {
  // Vercel Cron 인증 확인
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 실행 모드: daily (기본) | weekly
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "daily";

  try {
    // 1. 활성 계약 가져오기
    const { data: contracts, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("status", "active")
      .eq("is_deleted", false);

    if (error) throw error;

    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    const dateStr = new Date().toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Seoul",
    });

    // ─── 주간 요약 리포트 ───
    if (mode === "weekly") {
      const totalActive = contracts.length;
      const totalCostUSD = contracts
        .filter((c) => c.currency === "USD")
        .reduce((s, c) => s + (c.annual_cost || 0), 0);
      const totalCostKRW = contracts
        .filter((c) => c.currency === "KRW")
        .reduce((s, c) => s + (c.annual_cost || 0), 0);

      const expiring30 = contracts.filter((c) => {
        const d = getDaysUntil(c.end_date);
        return d > 0 && d <= 30;
      });
      const expiring60 = contracts.filter((c) => {
        const d = getDaysUntil(c.end_date);
        return d > 30 && d <= 60;
      });
      const autoRenewPending = contracts.filter((c) => {
        if (!c.auto_renew || !c.auto_renew_notice_days) return false;
        const noticeDate = new Date(c.end_date);
        noticeDate.setDate(noticeDate.getDate() - c.auto_renew_notice_days);
        const dtn = getDaysUntil(noticeDate.toISOString().slice(0, 10));
        return dtn >= -7 && dtn <= 30;
      });

      // 스튜디오별 비용 집계
      const studioMap = {};
      contracts.forEach((c) => {
        const key = c.studio || "미지정";
        if (!studioMap[key]) studioMap[key] = { count: 0, costUSD: 0 };
        studioMap[key].count++;
        if (c.currency === "USD") studioMap[key].costUSD += c.annual_cost || 0;
      });

      let message = `📊 *[Contract Tracker] 주간 계약 리포트*\n${dateStr}\n\n`;
      message += `━━━ 📈 전체 현황 ━━━\n`;
      message += `> 활성 계약: *${totalActive}건*\n`;
      message += `> 연간 비용: *${formatCurrency(totalCostUSD, "USD")}*`;
      if (totalCostKRW > 0) message += ` + *${formatCurrency(totalCostKRW, "KRW")}*`;
      message += `\n\n`;

      if (expiring30.length > 0) {
        message += `━━━ 🚨 30일 이내 만료 (${expiring30.length}건) ━━━\n`;
        expiring30.forEach((c) => {
          const d = getDaysUntil(c.end_date);
          message += `> *${c.vendor}* — ${c.name} | D-${d} | ${formatCurrency(c.annual_cost, c.currency)}${c.owner_name ? ` | 담당: ${c.owner_name}` : ""}\n`;
        });
        message += `\n`;
      }

      if (expiring60.length > 0) {
        message += `━━━ ⚠️ 30~60일 내 만료 (${expiring60.length}건) ━━━\n`;
        expiring60.forEach((c) => {
          const d = getDaysUntil(c.end_date);
          message += `> *${c.vendor}* — ${c.name} | D-${d} | ${formatCurrency(c.annual_cost, c.currency)}\n`;
        });
        message += `\n`;
      }

      if (autoRenewPending.length > 0) {
        message += `━━━ 🔄 자동갱신 통지 필요 (${autoRenewPending.length}건) ━━━\n`;
        autoRenewPending.forEach((c) => {
          message += `> *${c.vendor}* — ${c.name} | 통보기간: ${c.auto_renew_notice_days}일${c.owner_name ? ` | 담당: ${c.owner_name}` : ""}\n`;
        });
        message += `\n`;
      }

      // 스튜디오별 요약
      message += `━━━ 📁 스튜디오별 현황 ━━━\n`;
      Object.entries(studioMap)
        .sort(([, a], [, b]) => b.costUSD - a.costUSD)
        .forEach(([studio, data]) => {
          message += `> *${studio}*: ${data.count}건 | ${formatCurrency(data.costUSD, "USD")}\n`;
        });

      message += `\n_IT Procurement — Contract Tracker (주간 리포트)_`;

      if (webhookUrl) {
        await sendSlackMessage(webhookUrl, message);
      }

      return Response.json({
        message: "주간 리포트 발송 완료",
        totalActive, expiring30: expiring30.length,
        expiring60: expiring60.length, date: dateStr,
      });
    }

    // ─── 갱신 상태 자동 전환 (만료 90일 전 → pending_review) ───
    let renewalTransitions = 0;
    for (const c of contracts) {
      const daysToEnd = getDaysUntil(c.end_date);
      // 90일 이내이고 아직 갱신 검토가 시작되지 않은 계약
      if (daysToEnd > 0 && daysToEnd <= 90 && (!c.renewal_status || c.renewal_status === "none")) {
        const { error } = await supabase
          .from("contracts")
          .update({ renewal_status: "pending_review", updated_at: new Date().toISOString() })
          .eq("id", c.id);
        if (!error) {
          renewalTransitions++;
          c.renewal_status = "pending_review";
        } else {
          console.error(`갱신 상태 전환 실패 (${c.vendor}):`, error.message);
        }
      }
      // 갱신 승인 후 새 종료일 기준으로 다시 90일 밖이면 상태 리셋
      if (c.renewal_status === "approved" && daysToEnd > 90) {
        await supabase
          .from("contracts")
          .update({ renewal_status: "none", renewal_decided_at: null, renewal_decided_by: "", renewal_notes: "", updated_at: new Date().toISOString() })
          .eq("id", c.id);
      }
    }

    // ─── 일일 알림 (기본) ───
    const alerts = generateAlerts(contracts);

    if (alerts.length === 0) {
      return Response.json({ message: "알림 대상 없음", count: 0 });
    }

    // 에스컬레이션 알림 분리 (7일 이내 또는 만료됨)
    const escalations = alerts.filter((a) => a.level === "escalation");
    const regularAlerts = alerts.filter((a) => a.level !== "escalation");

    // 일반 채널 알림
    let message = `📊 *[Contract Tracker] 일일 계약 알림*\n${dateStr}\n\n`;
    message += `총 *${alerts.length}건*의 알림이 있습니다.`;
    if (escalations.length > 0) {
      message += ` (🚨 긴급 에스컬레이션: *${escalations.length}건*)`;
    }
    message += `\n\n`;

    alerts.forEach((a) => {
      message += `${a.type} *${a.vendor}* — ${a.name}\n`;
      message += `> ${a.detail} | ${a.cost}${a.owner ? ` | 담당: ${a.owner}` : ""}\n\n`;
    });

    // 갱신 검토 필요 항목 추가
    const pendingReviews = contracts.filter((c) => c.renewal_status === "pending_review");
    if (pendingReviews.length > 0) {
      message += `━━━ 🔄 갱신 검토 대기 (${pendingReviews.length}건) ━━━\n`;
      pendingReviews.forEach((c) => {
        const d = getDaysUntil(c.end_date);
        message += `> *${c.vendor}* — ${c.name} | D-${d} | ${formatCurrency(c.annual_cost, c.currency)}${c.owner_name ? ` | 담당: ${c.owner_name}` : ""}\n`;
      });
      message += `\n`;
    }

    if (renewalTransitions > 0) {
      message += `ℹ️ _${renewalTransitions}건의 계약이 갱신 검토 상태로 자동 전환되었습니다._\n\n`;
    }

    message += `_IT Procurement — Contract Tracker_`;

    if (webhookUrl) {
      await sendSlackMessage(webhookUrl, message);
    }

    // 에스컬레이션 알림 (별도 채널 또는 강조)
    const escalationWebhookUrl = process.env.SLACK_ESCALATION_WEBHOOK_URL;
    if (escalationWebhookUrl && escalations.length > 0) {
      let escMessage = `🚨 *[Contract Tracker] 긴급 에스컬레이션 알림*\n${dateStr}\n\n`;
      escMessage += `*${escalations.length}건*의 즉시 조치가 필요한 계약이 있습니다.\n\n`;

      escalations.forEach((a) => {
        escMessage += `${a.type} *${a.vendor}* — ${a.name}\n`;
        escMessage += `> ${a.detail} | ${a.cost}\n`;
        escMessage += `> 담당: ${a.owner || "미지정"}${a.ownerEmail ? ` (${a.ownerEmail})` : ""}\n\n`;
      });

      escMessage += `_⚠️ 위 계약들은 즉시 확인이 필요합니다._\n`;
      escMessage += `_IT Procurement — Contract Tracker_`;

      await sendSlackMessage(escalationWebhookUrl, escMessage);
    }

    // 담당자별 DM 알림 (owner_email별 그룹핑)
    const dmWebhookMap = process.env.SLACK_DM_WEBHOOKS;
    if (dmWebhookMap) {
      try {
        const webhooks = JSON.parse(dmWebhookMap); // { "email": "webhook_url" }
        const ownerAlerts = {};

        alerts.forEach((a) => {
          if (a.ownerEmail && webhooks[a.ownerEmail]) {
            if (!ownerAlerts[a.ownerEmail]) ownerAlerts[a.ownerEmail] = [];
            ownerAlerts[a.ownerEmail].push(a);
          }
        });

        for (const [email, userAlerts] of Object.entries(ownerAlerts)) {
          let dmMsg = `👋 안녕하세요, 담당 계약 알림입니다.\n${dateStr}\n\n`;
          dmMsg += `담당하신 *${userAlerts.length}건*의 계약에 알림이 있습니다.\n\n`;

          userAlerts.forEach((a) => {
            dmMsg += `${a.type} *${a.vendor}* — ${a.name}\n`;
            dmMsg += `> ${a.detail} | ${a.cost}\n\n`;
          });

          dmMsg += `_IT Procurement — Contract Tracker_`;

          await sendSlackMessage(webhooks[email], dmMsg);
        }
      } catch {
        console.error("SLACK_DM_WEBHOOKS JSON 파싱 실패");
      }
    }

    return Response.json({
      message: "Slack 알림 발송 완료",
      count: alerts.length,
      escalations: escalations.length,
      date: dateStr,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
