const {makeLogger} = require('../rummikub/logger');

test('logger gates by level: debug silent at warn, error always logs', () => {
  const calls = [];
  const sink = (level, args) => calls.push([level, args.join(' ')]);
  const warnLogger = makeLogger('warn', sink);
  warnLogger.debug('deck', 'a,b,c');
  warnLogger.info('turn began');
  warnLogger.warn('low');
  warnLogger.error('boom');
  expect(calls.map(c => c[0])).toEqual(['warn', 'error']); // debug+info suppressed at warn
  const debugLogger = makeLogger('debug', sink);
  debugLogger.debug('x');
  expect(calls.some(c => c[0] === 'debug')).toBe(true);
});
