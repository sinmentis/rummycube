// Fix2 P0/P1 — chaos result visibility. Backend sets short-lived public transients
// (lastBluffResult / lastSkip / lastBigwind) mirroring lastWheel; ResultToast pops
// the captured text for ~1.2s then clears. Bluff reveal stays public only after a
// challenge. CSS-source check keeps the band/toast styling intact.
import React from 'react';
import {render, screen, act} from '@testing-library/react';
import ResultToast from '../rummikub/components/ResultToast';
import {playAbilityCard, challengeBluff, passBluff} from '../rummikub/abilities/moves';
import {onTurnBegin} from '../rummikub/turn';
import {HAND_GRID_ID, BOARD_GRID_ID} from '../rummikub/constants';

const ctx = {currentPlayer: '0', numPlayers: 3};
const evStub = () => ({setActivePlayers: jest.fn(), endTurn: jest.fn()});

function gWith(cards, opts = {}) {
  return {mode: 'chaos', abilityHands: {'0': cards.slice(), '1': [], '2': []}, abilityDiscard: [],
    peekGrants: {}, shields: {}, pendingBluff: null, tilePositions: opts.tp || {}, tilesPool: opts.pool || [101, 102, 103, 104]};
}
const card = (type) => ({id: `${type}-0`, type, rarity: 'white'});

describe('ResultToast component', () => {
  afterEach(() => jest.useRealTimers());
  test('pops captured text on a new id then clears after ~1.2s', () => {
    jest.useFakeTimers();
    const {rerender} = render(<ResultToast result={null} text="hi"/>);
    expect(screen.queryByText('hi')).not.toBeInTheDocument();
    act(() => rerender(<ResultToast result={{id: 1}} text="Bob skipped"/>));
    expect(screen.getByText('Bob skipped')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1200));
    expect(screen.queryByText('Bob skipped')).not.toBeInTheDocument();
  });
  test('same id via fresh ref does not re-pop', () => {
    jest.useFakeTimers();
    const {rerender} = render(<ResultToast result={{id: 5}} text="x"/>);
    act(() => jest.advanceTimersByTime(1200));
    act(() => rerender(<ResultToast result={{id: 5}} text="x"/>));
    expect(screen.queryByText('x')).not.toBeInTheDocument();
  });
});

describe('bluff result transient', () => {
  test('caught bluff sets lastBluffResult{success, reveal}', () => {
    const G = gWith([card('peek')], {tp: {50: {id: 50, gridId: HAND_GRID_ID, playerID: '1', col: 0, row: 0}}});
    playAbilityCard({G, ctx, playerID: '0', events: evStub()}, 'peek-0', '1', {faceDown: true, declaredType: 'junk2'});
    challengeBluff({G, ctx, playerID: '1', events: evStub(), random: {Number: () => 0}});
    expect(G.lastBluffResult).toMatchObject({actor: '0', challenger: '1', declared: 'junk2', success: true, reveal: 'peek'});
    expect(typeof G.lastBluffResult.id).toBe('number');
  });
  test('honest bluff sets success:false', () => {
    const G = gWith([card('peek')]);
    playAbilityCard({G, ctx, playerID: '0', events: evStub()}, 'peek-0', '1', {faceDown: true, declaredType: 'peek'});
    challengeBluff({G, ctx, playerID: '1', events: evStub(), random: {Number: () => 0}});
    expect(G.lastBluffResult.success).toBe(false);
  });
  test('an unchallenged pass sets no result', () => {
    const G = gWith([card('shield')]);
    playAbilityCard({G, ctx, playerID: '0', events: evStub()}, 'shield-0', null, {faceDown: true, declaredType: 'shield'});
    passBluff({G, ctx, playerID: '1', events: evStub()});
    expect(G.lastBluffResult).toBeFalsy();
  });
});

test('skip sets lastSkip on the consumed turn', () => {
  const produce = require('immer').produce;
  const base = {mode: 'chaos', skipNext: {'1': true}, peekGrants: {}, tilePositions: {},
    lastCircle: [], connected: [], disconnectTurns: [], forfeited: [], turnExtended: []};
  const next = produce(base, d => onTurnBegin({G: d, ctx: {currentPlayer: '1', turn: 5}, events: evStub(), random: {Number: () => 1}}));
  expect(next.lastSkip).toMatchObject({seat: '1'});
});

test('bigwind sets lastBigwind', () => {
  const tp = {11: {id: 11, gridId: HAND_GRID_ID, playerID: '0', row: 0, col: 0}, 22: {id: 22, gridId: HAND_GRID_ID, playerID: '1', row: 0, col: 0}};
  const G = {mode: 'chaos', abilityHands: {'0': [card('bigwind')], '1': []}, abilityDiscard: [], tilePositions: tp, tilesPool: []};
  playAbilityCard({G, ctx: {currentPlayer: '0', numPlayers: 2, turn: 1}, playerID: '0', random: {Number: () => 0}}, 'bigwind-0');
  expect(G.lastBigwind).toMatchObject({count: 2});
});
