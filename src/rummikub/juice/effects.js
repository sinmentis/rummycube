import confetti from 'canvas-confetti';
import {particleCount} from './comboMath';

export const INTENSITY = 'balanced'; // 'subtle' | 'balanced' | 'max'

export function reduced() {
    return typeof window !== 'undefined' && window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ivory/gold spark burst at a viewport point (x, y in px)
export function burstAt(x, y, combo = 1) {
    if (reduced()) return;
    const n = Math.min(particleCount(INTENSITY) + combo * 2, 80);
    try {
        confetti({
            particleCount: n,
            startVelocity: 26 + Math.min(combo, 8) * 2,
            spread: 360,
            ticks: 60,
            gravity: 1.1,
            scalar: 0.85,
            colors: ['#fffdf4', '#e9dcc0', '#c5a050', '#b3162a', '#13478f', '#cc7a14'],
            origin: {x: x / window.innerWidth, y: y / window.innerHeight},
            disableForReducedMotion: true,
        });
    } catch (e) { /* never break gameplay */ }
}

// brief board shake; amplitude grows mildly with combo (capped)
export function kick(combo = 1) {
    if (reduced()) return;
    const el = document.querySelector('.board');
    if (!el) return;
    const scale = INTENSITY === 'max' ? 1.4 : INTENSITY === 'subtle' ? 0.6 : 1;
    const amp = Math.min(3 + combo, 9) * scale;
    el.style.setProperty('--kick', amp.toFixed(1) + 'px');
    el.classList.remove('board-kick');
    void el.offsetWidth; // restart the animation
    el.classList.add('board-kick');
}

// full-screen flash: kind 'combo' (gold) or 'bad' (red)
export function flash(kind) {
    if (reduced()) return;
    const d = document.createElement('div');
    d.className = 'fx-flash fx-flash-' + (kind === 'bad' ? 'bad' : 'combo');
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 450);
}

// floating text popup at a viewport point (e.g. "+24")
export function floatText(text, x, y) {
    const d = document.createElement('div');
    d.className = 'fx-floattext';
    d.textContent = text;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1200);
}

// Spotlight the groups the player just built. `groups` is an array of sequences,
// each a list of tile ids; the tile wrappers carry id={tile}. Lights them up
// gold, staggered group-by-group for a "battle report" feel. The glow itself is
// static (CSS), the bounce is motion-gated in CSS, so it degrades gracefully.
export function celebrateGroups(groups) {
    if (!groups || !groups.length) return;
    const touched = [];
    groups.forEach((group, gi) => {
        group.forEach(id => {
            const el = document.getElementById(String(id));
            if (!el) return;
            el.style.setProperty('--celebrate-delay', (gi * 0.16) + 's');
            el.classList.add('tile-celebrate');
            touched.push(el);
        });
    });
    if (!touched.length) return;
    setTimeout(() => touched.forEach(el => {
        el.classList.remove('tile-celebrate');
        el.style.removeProperty('--celebrate-delay');
    }), 1300);
}
