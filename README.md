# Contract Tracker v2

IT Procurement팀의 계약 일정 관리 웹 앱

## 기능
- 계약 등록/수정/삭제/종료 처리
- 벤더명, 공급사명, 담당자, Wiki 링크
- 스튜디오/계약유형 관리 (⚙)
- 분할 결제 관리 및 알림
- 알림 센터 + Slack/Outlook 발송
- 매일 오전 10시 Slack 자동 알림 (Cron)
- CSV Import/Export

## 환경변수 (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SLACK_WEBHOOK_URL`
- `CRON_SECRET`
