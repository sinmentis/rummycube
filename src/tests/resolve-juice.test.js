import {resolveJuice} from "../rummikub/juice/gating";

test('own play, not dragging => every effect on at full intensity', () => {
    const r = resolveJuice({lastPlay: {seat: '0'}, localSeat: '0', isDragging: false});
    expect(r).toEqual({
        kick: true, flash: true, burst: true, win: true, celebrate: true, intensity: 'full',
    });
});

test('opponent play => no kick, no win sting, muted, but still burst+celebrate', () => {
    const r = resolveJuice({lastPlay: {seat: '1'}, localSeat: '0', isDragging: false});
    expect(r.kick).toBe(false);
    expect(r.win).toBe(false);
    expect(r.intensity).toBe('muted');
    // you still SEE it happened
    expect(r.burst).toBe(true);
    expect(r.celebrate).toBe(true);
    // muted plays never flash the screen
    expect(r.flash).toBe(false);
});

test('local drag/selection active => never kick, even on your own play', () => {
    const r = resolveJuice({lastPlay: {seat: '0'}, localSeat: '0', isDragging: true});
    expect(r.kick).toBe(false);
});

test('seat comparison is type-tolerant (number vs string)', () => {
    const own = resolveJuice({lastPlay: {seat: 0}, localSeat: '0', isDragging: false});
    expect(own.intensity).toBe('full');
    const opp = resolveJuice({lastPlay: {seat: 1}, localSeat: 0, isDragging: false});
    expect(opp.intensity).toBe('muted');
});

test('missing lastPlay => everything off (no-op, no crash)', () => {
    const r = resolveJuice({lastPlay: null, localSeat: '0', isDragging: false});
    expect(r).toEqual({
        kick: false, flash: false, burst: false, win: false, celebrate: false, intensity: 'muted',
    });
});
