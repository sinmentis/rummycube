export const MAX_CHAT_LEN = 200;

export const QUICK_PHRASES = [
    'Hi!',
    'Nice!',
    'Good game',
    'Your turn',
    'Hurry up',
    'Oops',
    'Well played',
    'GG',
];

export const CHAT_EMOJI = [
    '😺', '😹', '😻', '😼', '🙀', '😾',
    '👍', '👏', '🔥', '🎉', '😂', '😎',
    '😅', '😭', '🤔', '😤', '🫡', '🙏',
    '❤️', '💀', '🎲', '🧠', '⏳', '🏆',
];

// Trim and hard-cap a chat string; returns '' for anything blank or non-string
// so callers can simply skip sending.
export function sanitizeChatText(text) {
    if (typeof text !== 'string') return '';
    return text.trim().slice(0, MAX_CHAT_LEN);
}
