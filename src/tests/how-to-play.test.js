import {HOW_TO_PLAY_RULES, HOW_TO_PLAY_TITLE} from '../rummikub/components/howToPlayContent';

const allText = HOW_TO_PLAY_RULES.map(r => `${r.term} ${r.text}`).join(' ');

test('title is the English "How to play"', () => {
    expect(HOW_TO_PLAY_TITLE).toBe('How to play');
});

test('rules cover objective, draw-vs-meld, run, set, first meld, jokers and timer', () => {
    expect(HOW_TO_PLAY_RULES.length).toBeGreaterThanOrEqual(7);
    expect(allText).toMatch(/empty your rack/);
    expect(allText).toMatch(/draw/);
    expect(allText).toMatch(/meld/);
    expect(allText).toMatch(/joker/i);
    expect(allText).toMatch(/timer/);
});

test('content contains the acceptance strings "30", "run" and "set"', () => {
    expect(allText).toContain('30');
    expect(allText).toContain('run');
    expect(allText).toContain('set');
});

test('every rule has a non-empty term and text', () => {
    for (const rule of HOW_TO_PLAY_RULES) {
        expect(typeof rule.term).toBe('string');
        expect(rule.term.length).toBeGreaterThan(0);
        expect(typeof rule.text).toBe('string');
        expect(rule.text.length).toBeGreaterThan(0);
    }
});
