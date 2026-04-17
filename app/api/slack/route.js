import { verifyAuthToken } from '../../../lib/auth-token';

export async function POST(request) {
  try {
    // middleware 와 통합: ct_auth 쿠키만 검증
    const token = request.cookies.get('ct_auth')?.value;
    if (!token || !(await verifyAuthToken(token))) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { webhookUrl, message } = await request.json();

    if (!webhookUrl || !message) {
      return Response.json({ error: "webhookUrl과 message가 필요합니다." }, { status: 400 });
    }

    try {
      const parsed = new URL(webhookUrl);
      if (parsed.hostname !== "hooks.slack.com") {
        return Response.json({ error: "유효한 Slack Webhook URL이 아닙니다." }, { status: 400 });
      }
    } catch {
      return Response.json({ error: "유효한 Slack Webhook URL이 아닙니다." }, { status: 400 });
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    if (!response.ok) {
      const body = await response.text();
      return Response.json({ error: `Slack 발송 실패: ${response.status} - ${body}` }, { status: response.status });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
