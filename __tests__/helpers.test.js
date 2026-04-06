import { formatCurrency, getDaysUntil, getUrgencyLevel } from '@/lib/helpers';

// KST 기준 오늘 날짜 문자열 생성 (getDaysUntil이 KST 기준이므로 테스트도 KST 기준)
function kstToday() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function kstDateOffset(days) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  now.setDate(now.getDate() + days);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
    expect(getDaysUntil(kstToday())).toBe(0);
  });

  test('미래 날짜는 양수 반환', () => {
    expect(getDaysUntil(kstDateOffset(10))).toBe(10);
  });

  test('과거 날짜는 음수 반환', () => {
    expect(getDaysUntil(kstDateOffset(-5))).toBe(-5);
  });
});

describe('getUrgencyLevel', () => {
  const makeContract = (daysFromNow) => {
    return { end_date: kstDateOffset(daysFromNow), renewal_date: null };
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
