import fs from 'fs';
import path from 'path';

function safePart(value, fallback) {
    const s = (value == null ? fallback : String(value))
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return s || fallback;
}

function timestampForFile(d) {
    return d.toISOString().replace(/[:.]/g, '-');
}

export function saveBugReport(payload, {dir, now = () => new Date()} = {}) {
    const baseDir = process.env.FLATFILE_DIR || process.cwd();
    const outDir = dir || process.env.BUG_REPORT_DIR || path.resolve(baseDir, 'bug-reports');
    fs.mkdirSync(outDir, {recursive: true});
    const savedAt = now();
    const filename = `${timestampForFile(savedAt)}-${safePart(payload.matchID, 'match')}-p-${safePart(payload.playerID, 'seat')}.json`;
    const body = {
        savedAt: savedAt.toISOString(),
        ...payload,
    };
    fs.writeFileSync(path.join(outDir, filename), JSON.stringify(body, null, 2));
    return {filename, path: path.join(outDir, filename)};
}

export async function enrichBugReport(payload, {db} = {}) {
    if (!db || !payload.matchID) {
        return payload;
    }
    try {
        const server = await db.fetch(payload.matchID, {
            state: true,
            metadata: true,
            log: true,
            initialState: true,
        });
        return {...payload, server};
    } catch (e) {
        return {...payload, server: {error: e.message || String(e)}};
    }
}
