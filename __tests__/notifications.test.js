import { generateNotifications } from '@/lib/notifications';

// KST 기준 날짜 오프셋 (getDaysUntil이 KST 기준이므로 테스트도 KST 기준)
function kstDateOffset(days) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  now.setDate(now.getDate() + days);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

describe('generateNotifications', () => {
  const makeContract = (overrides = {}) => ({
    id: 'test-1', vendor: 'Datadog', name: 'APM', type: 'SaaS',
    start_date: '2025-01-01', end_date: '2026-01-01',
    renewal_date: null, auto_renew: false, auto_renew_notice_days: 30,
    annual_cost: 48000, currency: 'USD', status: 'active',
    notes: '', studio: 'KRAFTON', owner_name: 'Hong', owner_email: 'h@k.com',
    wiki_url: '', supplier: '', installment_enabled: false,
    installment_schedule: [],
    ...overrides,
  });

  test('빈 배열 입력 시 빈 결과', () => {
    expect(generateNotifications([])).toEqual([]);
  });

  test('만료 60일 이내 계약에 알림 생성', () => {
    const contract = makeContract({ end_date: kstDateOffset(30) });
    const notifs = generateNotifications([contract]);
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].type).toBe('expiry');
  });

  test('안전한 계약은 알림 없음', () => {
    const contract = makeContract({ end_date: kstDateOffset(200) });
    const notifs = generateNotifications([contract]);
    expect(notifs).toHaveLength(0);
  });

  test('자동갱신 통지기한 알림 생성', () => {
    const contract = makeContract({
      end_date: kstDateOffset(45),
      auto_renew: true,
      auto_renew_notice_days: 30,
    });
    const notifs = generateNotifications([contract]);
    const autoNotif = notifs.find((n) => n.type === 'auto_renew_notice');
    expect(autoNotif).toBeDefined();
  });

  test('만료된 계약 (30일 이내) 알림 생성', () => {
    const contract = makeContract({ end_date: kstDateOffset(-10) });
    const notifs = generateNotifications([contract]);
    const expired = notifs.find((n) => n.type === 'expired');
    expect(expired).toBeDefined();
    expect(expired.urgency).toBe('expired');
  });

  test('알림은 daysLeft 기준 오름차순 정렬', () => {
    const contracts = [
      makeContract({ id: 'c1', end_date: kstDateOffset(50) }),
      makeContract({ id: 'c2', end_date: kstDateOffset(10) }),
    ];
    const notifs = generateNotifications(contracts);
    for (let i = 1; i < notifs.length; i++) {
      expect(notifs[i].daysLeft).toBeGreaterThanOrEqual(notifs[i - 1].daysLeft);
    }
  });
});
