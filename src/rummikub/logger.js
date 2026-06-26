// Tiny level-gated logger for the server-side game module (src/server.js runs
// raw Node, so console.* there is NOT stripped by the Vite build). Default level
// is 'warn' so per-move/per-turn debug noise (e.g. the deck order) stays silent
// in production; set LOG_LEVEL=debug to see it.
const LEVELS = {debug: 10, info: 20, warn: 30, error: 40};

export function makeLogger(level = 'warn', sink = null) {
  const min = LEVELS[level] ?? LEVELS.warn;
  const emit = sink || ((lvl, args) => (console[lvl] || console.log)(...args));
  const at = (lvl) => (...args) => { if (LEVELS[lvl] >= min) emit(lvl, args); };
  return {debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error')};
}

export const logger = makeLogger(
  (typeof process !== 'undefined' && process.env && process.env.LOG_LEVEL) || 'warn'
);
