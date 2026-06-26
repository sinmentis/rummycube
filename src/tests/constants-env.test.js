test('constants exports finite TILES_TO_DRAW and FIRST_MOVE_SCORE_LIMIT', () => {
  const c = require('../rummikub/constants');
  expect(Number.isFinite(c.TILES_TO_DRAW)).toBe(true);
  expect(Number.isFinite(c.FIRST_MOVE_SCORE_LIMIT)).toBe(true);
});

test('requireFiniteInt throws on NaN-producing env', () => {
  const {requireFiniteInt} = require('../rummikub/constants');
  expect(() => requireFiniteInt('REACT_APP_X', undefined)).toThrow(/REACT_APP_X/);
  expect(requireFiniteInt('REACT_APP_X', '14')).toBe(14);
});
