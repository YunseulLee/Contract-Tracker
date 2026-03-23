import { generateNotifications } from '@/lib/notifications';

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
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const contract = makeContract({ end_date: d.toISOString().slice(0, 10) });
    const notifs = generateNotifications([contract]);
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].type).toBe('expiry');
  });

  test('안전한 계약은 알림 없음', () => {
    const d = new Date();
    d.setDate(d.getDate() + 200);
    const contract = makeContract({ end_date: d.toISOString().slice(0, 10) });
    const notifs = generateNotifications([contract]);
    expect(notifs).toHaveLength(0);
  });

  test('자동갱신 통지기한 알림 생성', () => {
    const d = new Date();
    d.setDate(d.getDate() + 45);
    const contract = makeContract({
      end_date: d.toISOString().slice(0, 10),
      auto_renew: true,
      auto_renew_notice_days: 30,
    });
    const notifs = generateNotifications([contract]);
    const autoNotif = notifs.find((n) => n.type === 'auto_renew_notice');
    expect(autoNotif).toBeDefined();
  });

  test('만료된 계약 (30일 이내) 알림 생성', () => {
    const d = new Date();
    d.setDate(d.getDate() - 10);
    const contract = makeContract({ end_date: d.toISOString().slice(0, 10) });
    const notifs = generateNotifications([contract]);
    const expired = notifs.find((n) => n.type === 'expired');
    expect(expired).toBeDefined();
    expect(expired.urgency).toBe('expired');
  });

  test('알림은 daysLeft 기준 오름차순 정렬', () => {
    const d1 = new Date(); d1.setDate(d1.getDate() + 10);
    const d2 = new Date(); d2.setDate(d2.getDate() + 50);
    const contracts = [
      makeContract({ id: 'c1', end_date: d2.toISOString().slice(0, 10) }),
      makeContract({ id: 'c2', end_date: d1.toISOString().slice(0, 10) }),
    ];
    const notifs = generateNotifications(contracts);
    for (let i = 1; i < notifs.length; i++) {
      expect(notifs[i].daysLeft).toBeGreaterThanOrEqual(notifs[i - 1].daysLeft);
    }
  });
});
