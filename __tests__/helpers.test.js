import { formatCurrency, getDaysUntil, getUrgencyLevel } from '@/lib/helpers';

describe('formatCurrency', () => {
  test('USD 포맷', () => {
    expect(formatCurrency(48000, 'USD')).toBe('$48,000');
  });

  test('KRW 포맷', () => {
    expect(formatCurrency(5000000, 'KRW')).toBe('₩5,000,000');
  });

  test('null/0 처리', () => {
    expect(formatCurrency(null, 'USD')).toBe('$0');
    expect(formatCurrency(0, 'USD')).toBe('$0');
  });

  test('기본 통화는 USD', () => {
    expect(formatCurrency(1000)).toBe('$1,000');
  });
});

describe('getDaysUntil', () => {
  test('날짜가 없으면 Infinity 반환', () => {
    expect(getDaysUntil(null)).toBe(Infinity);
    expect(getDaysUntil(undefined)).toBe(Infinity);
  });

  test('오늘 날짜는 0 반환', () => {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    expect(getDaysUntil(dateStr)).toBe(0);
  });

  test('미래 날짜는 양수 반환', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const dateStr = future.toISOString().slice(0, 10);
    expect(getDaysUntil(dateStr)).toBe(10);
  });

  test('과거 날짜는 음수 반환', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const dateStr = past.toISOString().slice(0, 10);
    expect(getDaysUntil(dateStr)).toBe(-5);
  });
});

describe('getUrgencyLevel', () => {
  const makeContract = (daysFromNow) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return { end_date: d.toISOString().slice(0, 10), renewal_date: null };
  };

  test('만료된 계약은 expired', () => {
    expect(getUrgencyLevel(makeContract(-5))).toBe('expired');
  });

  test('30일 이내는 critical', () => {
    expect(getUrgencyLevel(makeContract(15))).toBe('critical');
  });

  test('60일 이내는 warning', () => {
    expect(getUrgencyLevel(makeContract(45))).toBe('warning');
  });

  test('90일 이내는 upcoming', () => {
    expect(getUrgencyLevel(makeContract(75))).toBe('upcoming');
  });

  test('90일 초과는 safe', () => {
    expect(getUrgencyLevel(makeContract(120))).toBe('safe');
  });
});
