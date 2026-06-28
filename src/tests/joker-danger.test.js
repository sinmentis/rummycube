import {jokerDanger} from '../rummikub/abilities/jokerDanger';

test('heat -> prob/level/face', () => {
  expect(jokerDanger(0)).toMatchObject({prob: 0.20, level: 'low', face: '😄'});
  expect(jokerDanger(1)).toMatchObject({prob: 0.35, level: 'med', face: '😠'});
  expect(jokerDanger(3)).toMatchObject({prob: 0.65, level: 'high', face: '😡'});
  expect(jokerDanger(9).prob).toBeCloseTo(0.80); // cap
});

test('note matches mockup copy per level', () => {
  expect(jokerDanger(0).note).toBe('Freshly seeded · safe to build on.');
  expect(jokerDanger(1).note).toBe('Poked a few times · getting risky.');
  expect(jokerDanger(3).note).toBe('Hot — likely to scatter if disturbed.');
});
