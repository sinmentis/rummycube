import {useState, useCallback} from "react";

// Shared localStorage-backed boolean flag. It lazy-reads the key once on mount
// and writes through on every change so the choice survives reloads and later
// matches. The value is stored as '1'/'0'; an absent key reads as defaultValue.
//
// The read is SSR-guarded (`typeof localStorage !== 'undefined'`) and the write
// is wrapped in try/catch, so the flag degrades to an in-memory value rather than
// crashing the board under SSR or Safari private mode (which throws on setItem).
// setValue accepts a concrete boolean or a functional updater (like useState) and
// persists the resolved value in the same tick.
export function usePersistentFlag(key, {defaultValue = false} = {}) {
    const [value, setValue] = useState(() => {
        try {
            if (typeof localStorage === 'undefined') return defaultValue;
            const raw = localStorage.getItem(key);
            return raw === null ? defaultValue : raw === '1';
        } catch (e) {
            return defaultValue;
        }
    });
    const setPersisted = useCallback((next) => {
        setValue((prev) => {
            const resolved = typeof next === 'function' ? next(prev) : next;
            try {
                localStorage.setItem(key, resolved ? '1' : '0');
            } catch (e) { /* private mode / no storage: stays in-memory only */ }
            return resolved;
        });
    }, [key]);
    return [value, setPersisted];
}
