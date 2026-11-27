import { AlertRule, compareDecimals } from './alert-rule.js';

describe('compareDecimals', () => {
  test('compares by value, not as text', () => {
    expect(compareDecimals('9.00', '10.00')).toBeLessThan(0);
    expect(compareDecimals('0.45', '0.45000001')).toBeLessThan(0);
    expect(compareDecimals('150.0', '150.00')).toBe(0);
    expect(compareDecimals('70000.00', '70000.00000001')).toBeLessThan(0);
  });
});

describe('AlertRule', () => {
  const rule = new AlertRule();

  test('an ABOVE alert is crossed by a greater price, by one unit of the eighth decimal place', () => {
    expect(
      rule.crossed(
        { direction: 'ABOVE', threshold: '70000.00' },
        '70000.00000001',
      ),
    ).toBe(true);
    expect(
      rule.crossed({ direction: 'ABOVE', threshold: '70000.00' }, '80000.00'),
    ).toBe(true);
  });

  test('an ABOVE alert is not crossed by an equal or a lower price', () => {
    expect(
      rule.crossed({ direction: 'ABOVE', threshold: '70000.00' }, '70000.00'),
    ).toBe(false);
    expect(
      rule.crossed({ direction: 'ABOVE', threshold: '70000.00' }, '69999.99'),
    ).toBe(false);
  });

  test('a BELOW alert is crossed only by a lower price', () => {
    expect(
      rule.crossed({ direction: 'BELOW', threshold: '0.45' }, '0.44999999'),
    ).toBe(true);
    expect(
      rule.crossed({ direction: 'BELOW', threshold: '0.45' }, '0.45'),
    ).toBe(false);
    expect(
      rule.crossed({ direction: 'BELOW', threshold: '0.45' }, '0.46'),
    ).toBe(false);
  });

  test('numbers of different length compare by value and not as text', () => {
    expect(
      rule.crossed({ direction: 'ABOVE', threshold: '150.00' }, '150.0'),
    ).toBe(false);
    expect(
      rule.crossed({ direction: 'ABOVE', threshold: '0.12' }, '0.120000001'),
    ).toBe(true);
  });
});
