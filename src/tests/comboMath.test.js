import {comboLabel, particleCount} from '../rummikub/juice/comboMath';
test('comboLabel tiers at 3/5/7', () => {
  expect(comboLabel(2)).toBe('');
  expect(comboLabel(3)).toBe('NICE');
  expect(comboLabel(4)).toBe('NICE');
  expect(comboLabel(5)).toBe('COMBO');
  expect(comboLabel(7)).toBe('ON FIRE');
  expect(comboLabel(99)).toBe('ON FIRE');
});
test('particleCount scales with intensity', () => {
  expect(particleCount('subtle')).toBeLessThan(particleCount('balanced'));
  expect(particleCount('balanced')).toBeLessThan(particleCount('max'));
});
