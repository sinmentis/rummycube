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
