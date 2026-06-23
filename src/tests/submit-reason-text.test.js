import {submitReasonText} from '../rummikub/submitReasonText';

test('BELOW_30 interpolates the current score and mentions the 30 threshold', () => {
    const text = submitReasonText({code: 'BELOW_30', score: 12, required: 30});
    expect(text).toContain('30');
    expect(text).toContain('12');
});

test('NO_NEW_TILE maps to its English string', () => {
    expect(submitReasonText({code: 'NO_NEW_TILE'}))
        .toBe('Place at least one tile from your rack first.');
});

test('INVALID_GROUP maps to its English string', () => {
    expect(submitReasonText({code: 'INVALID_GROUP'}))
        .toBe("That isn't a valid run or set.");
});

test('MIXED_FIRST_MOVE maps to its English string', () => {
    expect(submitReasonText({code: 'MIXED_FIRST_MOVE'}))
        .toBe('Your first meld must use only your own tiles.');
});

test('RUN_TOO_SHORT maps to its English string', () => {
    expect(submitReasonText({code: 'RUN_TOO_SHORT'}))
        .toBe('A run needs at least 3 tiles in a row.');
});

test('OK and unknown codes produce no message', () => {
    expect(submitReasonText({code: 'OK'})).toBe('');
    expect(submitReasonText({code: 'SOMETHING_ELSE'})).toBe('');
    expect(submitReasonText(null)).toBe('');
    expect(submitReasonText(undefined)).toBe('');
});
