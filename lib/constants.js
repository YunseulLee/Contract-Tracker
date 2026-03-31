export const urgencyColors = {
  expired: { bg: "#F8717110", border: "#F8717130", text: "#F87171", dot: "#EF4444" },
  critical: { bg: "#FB923C10", border: "#FB923C30", text: "#FB923C", dot: "#F97316" },
  warning: { bg: "#FBBF2410", border: "#FBBF2430", text: "#FBBF24", dot: "#EAB308" },
  upcoming: { bg: "#34D39910", border: "#34D39930", text: "#34D399", dot: "#10B981" },
  safe: { bg: "#5B8DEF08", border: "#5B8DEF20", text: "#9BA1AE", dot: "#5B8DEF" },
};

export const fieldLabels = {
  vendor: "벤더", name: "계약명", type: "유형", start_date: "시작일",
  end_date: "종료일", renewal_date: "갱신 통보일", auto_renew: "자동갱신",
  auto_renew_notice_days: "사전 통보 기간", annual_cost: "연간 비용",
  currency: "통화", status: "상태", notes: "메모", studio: "스튜디오",
  owner_name: "담당자", owner_email: "담당자 이메일", wiki_url: "Wiki 링크",
  supplier: "공급사", installment_enabled: "분할 결제",
  installment_schedule: "분할 결제 일정",
  renewal_status: "갱신 상태", renewal_count: "갱신 차수",
  renewal_notes: "갱신 메모",
};

export const renewalStatusLabels = {
  none: "해당없음",
  pending_review: "검토 대기",
  approved: "갱신 승인",
  cancelled: "해지 결정",
};

export const renewalStatusColors = {
  none: { bg: "#1A1D23", text: "#6B7280", border: "#2E3440" },
  pending_review: { bg: "#2D2A18", text: "#FFE066", border: "#8B833A" },
  approved: { bg: "#1B2D2A", text: "#66FFCC", border: "#3A8B7A" },
  cancelled: { bg: "#2D1B1B", text: "#FF6B6B", border: "#8B3A3A" },
};

export const auditFields = [
  "vendor", "name", "type", "start_date", "end_date", "renewal_date",
  "auto_renew", "auto_renew_notice_days", "annual_cost", "currency",
  "status", "notes", "studio", "owner_name", "owner_email", "wiki_url",
  "supplier", "installment_enabled", "installment_schedule",
  "renewal_status", "renewal_count", "renewal_notes",
];

export const inputStyle = {
  width: "100%", padding: "10px 14px", background: "#0A0C10",
  border: "1px solid #2A2D38", borderRadius: 8, color: "#EDEEF0",
  fontSize: 14, fontFamily: "'Inter', 'Noto Sans KR', sans-serif", outline: "none", boxSizing: "border-box",
};
