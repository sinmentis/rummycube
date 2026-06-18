import {sanitizeChatText, QUICK_PHRASES, CHAT_EMOJI, MAX_CHAT_LEN} from '../rummikub/chat/quickChat';

test('sanitizeChatText trims and caps length', () => {
    expect(sanitizeChatText('  hi  ')).toBe('hi');
    const long = 'x'.repeat(MAX_CHAT_LEN + 50);
    expect(sanitizeChatText(long).length).toBe(MAX_CHAT_LEN);
});

test('sanitizeChatText returns empty string for blank/invalid input', () => {
    expect(sanitizeChatText('   ')).toBe('');
    expect(sanitizeChatText('')).toBe('');
    expect(sanitizeChatText(null)).toBe('');
    expect(sanitizeChatText(undefined)).toBe('');
    expect(sanitizeChatText(42)).toBe('');
});

test('quick phrases and emoji sets are non-empty and unique', () => {
    expect(QUICK_PHRASES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(QUICK_PHRASES).size).toBe(QUICK_PHRASES.length);
    expect(CHAT_EMOJI.length).toBeGreaterThanOrEqual(16);
    expect(new Set(CHAT_EMOJI).size).toBe(CHAT_EMOJI.length);
});
