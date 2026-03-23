import { diffContract } from '@/lib/audit';

// Mock supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ insert: jest.fn().mockResolvedValue({ error: null }) }),
  },
}));

describe('diffContract', () => {
  const baseContract = {
    vendor: 'Datadog', name: 'APM', type: 'SaaS',
    start_date: '2025-01-01', end_date: '2026-01-01',
    renewal_date: null, auto_renew: false, auto_renew_notice_days: 30,
    annual_cost: 48000, currency: 'USD', status: 'active',
    notes: '', studio: 'KRAFTON', owner_name: '', owner_email: '',
    wiki_url: '', supplier: '', installment_enabled: false,
    installment_schedule: [],
  };

  test('변경 없으면 빈 배열 반환', () => {
    expect(diffContract(baseContract, { ...baseContract })).toEqual([]);
  });

  test('단일 필드 변경 감지', () => {
    const updated = { ...baseContract, vendor: 'NewRelic' };
    const changes = diffContract(baseContract, updated);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      field_name: 'vendor',
      old_value: 'Datadog',
      new_value: 'NewRelic',
    });
  });

  test('복수 필드 변경 감지', () => {
    const updated = { ...baseContract, vendor: 'NewRelic', annual_cost: 60000 };
    const changes = diffContract(baseContract, updated);
    expect(changes).toHaveLength(2);
  });

  test('boolean 변경 감지', () => {
    const updated = { ...baseContract, auto_renew: true };
    const changes = diffContract(baseContract, updated);
    expect(changes).toHaveLength(1);
    expect(changes[0].field_name).toBe('auto_renew');
  });

  test('installment_schedule JSON 비교', () => {
    const updated = { ...baseContract, installment_schedule: [{ date: '2025-06-01', amount: 24000 }] };
    const changes = diffContract(baseContract, updated);
    expect(changes).toHaveLength(1);
    expect(changes[0].field_name).toBe('installment_schedule');
  });
});
