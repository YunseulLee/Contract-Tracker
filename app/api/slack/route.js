import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { webhookUrl, message } = await request.json();

    if (!webhookUrl || !message) {
      return Response.json({ error: "webhookUrl과 message가 필요합니다." }, { status: 400 });
    }

    if (!webhookUrl.startsWith("https://hooks.slack.com/")) {
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
