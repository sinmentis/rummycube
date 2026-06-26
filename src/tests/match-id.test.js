import {extractMatchId} from '../rummikub/matchId';

test('extractMatchId accepts a bare code or a full invite link', () => {
  expect(extractMatchId('abc123')).toBe('abc123');
  expect(extractMatchId('  abc123  ')).toBe('abc123');
  expect(extractMatchId('https://game.shunlyu.com/join-match/abc123')).toBe('abc123');
  expect(extractMatchId('https://game.shunlyu.com/match/abc123')).toBe('abc123');
  expect(extractMatchId('https://game.shunlyu.com/join-match/abc123?x=1')).toBe('abc123');
  expect(extractMatchId('')).toBe('');
});
