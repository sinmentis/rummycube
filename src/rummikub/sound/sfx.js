// Tiny synthesized sound effects via the Web Audio API — no asset files, no
// licensing, works offline. A single shared AudioContext is created lazily on
// the first play() (which happens after a user gesture, satisfying autoplay
// policy). Mute state is persisted in localStorage.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('rummycube:muted') === '1'; } catch (e) {}

function getCtx() {
    if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
}

function tone(freq, dur, type = 'sine', gain = 0.2, delay = 0) {
    const c = getCtx();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
}

export function isMuted() { return muted; }

export function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('rummycube:muted', muted ? '1' : '0'); } catch (e) {}
}

export function toggleMuted() { setMuted(!muted); return muted; }

export function play(name) {
    if (muted) return;
    try {
        switch (name) {
            case 'place': // woody tile "clack"
                tone(190, 0.12, 'triangle', 0.28);
                tone(90, 0.13, 'sine', 0.20);
                break;
            case 'draw': // soft upward swish
                tone(330, 0.10, 'sine', 0.16);
                tone(460, 0.10, 'sine', 0.12, 0.05);
                break;
            case 'win': // little C-E-G-C arpeggio
                [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.34, 'triangle', 0.22, i * 0.13));
                break;
            default:
                break;
        }
    } catch (e) { /* never let sound break gameplay */ }
}

export function place(combo = 1) {
    if (muted) return;
    try {
        const base = 150 + Math.min(combo, 10) * 26; // pitch rises with combo
        tone(base, 0.12, 'triangle', 0.26);
        tone(base / 2, 0.13, 'sine', 0.18);
    } catch (e) { /* never break gameplay */ }
}

export function milestone() {
    if (muted) return;
    try { [660, 880, 1175].forEach((f, i) => tone(f, 0.18, 'triangle', 0.2, i * 0.06)); } catch (e) {}
}

export function buzz() {
    if (muted) return;
    try { tone(120, 0.22, 'sawtooth', 0.22); tone(90, 0.22, 'square', 0.16, 0.02); } catch (e) {}
}
