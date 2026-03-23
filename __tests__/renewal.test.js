// Mock supabase
const mockInsert = jest.fn().mockResolvedValue({ error: null });
const mockUpdate = jest.fn().mockReturnValue({
  eq: jest.fn().mockResolvedValue({ error: null }),
});
const mockSelect = jest.fn().mockReturnValue({
  eq: jest.fn().mockReturnValue({
    order: jest.fn().mockResolvedValue({ data: [], error: null }),
  }),
});

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
    }),
  },
}));

// Mock audit
jest.mock('@/lib/audit', () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

import { approveRenewal, cancelRenewal } from '@/lib/renewal';
import { writeAuditLog } from '@/lib/audit';

describe('approveRenewal', () => {
  const baseContract = {
    id: 'test-1', vendor: 'Datadog', name: 'APM',
    end_date: '2026-01-01', annual_cost: 48000, currency: 'USD',
    renewal_status: 'pending_review', renewal_count: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('갱신 승인 시 renewal_history에 기록', async () => {
    await approveRenewal(baseContract, {
      newEndDate: '2027-01-01', newCost: 50000,
      notes: '가격 인상', decidedBy: 'test@krafton.com',
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      contract_id: 'test-1',
      renewal_number: 1,
      decision: 'approved',
      previous_end_date: '2026-01-01',
      new_end_date: '2027-01-01',
      new_annual_cost: 50000,
    }));
  });

  test('갱신 승인 시 audit log 기록', async () => {
    await approveRenewal(baseContract, {
      newEndDate: '2027-01-01', decidedBy: 'test@krafton.com',
    });

    expect(writeAuditLog).toHaveBeenCalledWith(
      'test-1', 'update',
      expect.arrayContaining([
        expect.objectContaining({ field_name: 'renewal_status', new_value: 'approved' }),
        expect.objectContaining({ field_name: 'end_date', new_value: '2027-01-01' }),
      ]),
      'test@krafton.com'
    );
  });

  test('갱신 차수가 증가', async () => {
    const contract2nd = { ...baseContract, renewal_count: 2 };
    const result = await approveRenewal(contract2nd, {
      newEndDate: '2027-01-01', decidedBy: '',
    });

    expect(result.renewalNumber).toBe(3);
  });
});

describe('cancelRenewal', () => {
  const baseContract = {
    id: 'test-1', vendor: 'Datadog', name: 'APM',
    end_date: '2026-01-01', annual_cost: 48000, currency: 'USD',
    renewal_status: 'pending_review', renewal_count: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('해지 결정 시 renewal_history에 cancelled 기록', async () => {
    await cancelRenewal(baseContract, {
      notes: '대체 솔루션 선정', decidedBy: 'test@krafton.com',
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      contract_id: 'test-1',
      decision: 'cancelled',
      previous_end_date: '2026-01-01',
      new_end_date: null,
    }));
  });

  test('해지 시 audit log에 cancelled 기록', async () => {
    await cancelRenewal(baseContract, { notes: '', decidedBy: 'admin@krafton.com' });

    expect(writeAuditLog).toHaveBeenCalledWith(
      'test-1', 'update',
      expect.arrayContaining([
        expect.objectContaining({ field_name: 'renewal_status', new_value: 'cancelled' }),
      ]),
      'admin@krafton.com'
    );
  });
});
