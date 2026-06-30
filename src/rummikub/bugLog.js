const MAX_LOGS = 200;
const logs = [];
let installed = false;

function add(level, args) {
    try {
        logs.push({
            ts: new Date().toISOString(),
            level,
            message: args.map(a => {
                try {
                    if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
                    if (typeof a === 'string') return a;
                    return JSON.stringify(a);
                } catch (e) {
                    return '[unserializable]';
                }
            }).join(' '),
        });
        if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    } catch (e) {
        // Reporting must never break the app's own console/error path.
    }
}

export function installBugLog() {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args) => { add('error', args); origError(...args); };
    console.warn = (...args) => { add('warn', args); origWarn(...args); };
    window.addEventListener('error', e => add('window-error', [e.message, e.filename, e.lineno]));
    window.addEventListener('unhandledrejection', e => add('unhandledrejection', [e.reason]));
}

export function snapshotBugLog() {
    return logs.slice();
}
