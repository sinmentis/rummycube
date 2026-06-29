// Chaos UX fix T4: ability plays must be readable table-wide. A targeted card
// resolving broadcasts G.lastCast={from,to,type,blocked,id} (mirrors lastWheel/
// lastTimeout) so every client flashes a caster->target beam + pulse ring; a
// shielded hit shows a broken beam + burst. No-target cards (wheel/bigwind) carry
// to:null -> "affects all" glow + skip the target step. Reduced-motion keeps the
// result, drops the travel. Server logic + playerView + CastBeam + Board + CSS.
import React from 'react';
import {render, screen, renderHook, act} from '@testing-library/react';
import {playAbilityCard} from '../rummikub/abilities/moves';
import {playerView} from '../rummikub/playerView';
import useAbilityPlay from '../rummikub/components/hooks/useAbilityPlay';
import CastBeam from '../rummikub/components/CastBeam';

const ctx = {currentPlayer: '0', numPlayers: 3, turn: 4};
const card = (type, id) => ({id: id || `${type}-0`, type, rarity: 'gold'});
const gWith = (cards, opts = {}) => ({
  mode: 'chaos', abilityHands: {'0': cards.slice(), '1': [], '2': []}, abilityDiscard: [],
  peekGrants: {}, shields: opts.shields || {}, skipNext: {}, forced: {},
  tilePositions: opts.tilePositions || {}, tilesPool: opts.pool || [101, 102, 103, 104, 105],
});

describe('server broadcasts G.lastCast on a resolved cast', () => {
  test('player-target card records {from,to,type} with a fresh id', () => {
    const G = gWith([card('peek')]);
    playAbilityCard({G, ctx, playerID: '0'}, 'peek-0', '1');
    expect(G.lastCast).toMatchObject({from: '0', to: '1', type: 'peek', blocked: false});
    expect(typeof G.lastCast.id).toBe('number');
  });

  test('shield absorbs junk -> beam blocked', () => {
    const G = gWith([card('junk2')], {shields: {'1': true}});
    playAbilityCard({G, ctx, playerID: '0'}, 'junk2-0', '1');
    expect(G.lastCast).toMatchObject({from: '0', to: '1', type: 'junk2', blocked: true});
  });

  test('no-target card (bigwind) records to:null -> affects all', () => {
    const G = gWith([card('bigwind')]);
    playAbilityCard({G, ctx, playerID: '0'}, 'bigwind-0');
    expect(G.lastCast).toMatchObject({from: '0', to: null, type: 'bigwind'});
  });

  test('each cast bumps the id so the same content re-fires', () => {
    const G = gWith([card('peek'), card('peek', 'peek-1')]);
    playAbilityCard({G, ctx, playerID: '0'}, 'peek-0', '1');
    const first = G.lastCast.id;
    playAbilityCard({G, ctx, playerID: '0'}, 'peek-1', '1');
    expect(G.lastCast.id).toBeGreaterThan(first);
  });
});

test('playerView passes lastCast through to every client', () => {
  const G = gWith([]); G.lastCast = {from: '0', to: '1', type: 'peek', blocked: false, id: 7};
  const v = playerView({G, ctx, playerID: '1'});
  expect(v.lastCast).toEqual(G.lastCast);
});

describe('useAbilityPlay: no-target cards skip the target step', () => {
  for (const t of ['bigwind', 'wheel']) {
    test(`${t} fires immediately, never parks for a target`, () => {
      const moves = {playAbilityCard: jest.fn()};
      const {result} = renderHook(() => useAbilityPlay(moves));
      act(() => result.current.playCard(card(t)));
      expect(moves.playAbilityCard).toHaveBeenCalledWith(`${t}-0`);
      expect(result.current.pendingPeek).toBeFalsy();
      expect(result.current.pendingLock).toBeFalsy();
    });
  }
});

describe('CastBeam', () => {
  test('blocked cast draws a broken beam + burst', () => {
    const {container} = render(<CastBeam from={{x: 0, y: 0}} to={{x: 9, y: 9}} type="junk2" blocked/>);
    expect(container.querySelector('.cast-beam')).toHaveClass('cast-beam--blocked');
    expect(container.querySelector('.beam-burst')).toBeInTheDocument();
  });
  test('clean cast draws a target pulse ring', () => {
    const {container} = render(<CastBeam from={{x: 0, y: 0}} to={{x: 9, y: 9}} type="peek"/>);
    expect(container.querySelector('.beam-ring')).toBeInTheDocument();
    expect(container.querySelector('.cast-beam')).not.toHaveClass('cast-beam--blocked');
  });
});

const fs = require('fs'); const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/abilities.css'), 'utf8');
test('beam ring + burst + affects-all glow exist, reduced-motion guarded', () => {
  expect(css).toMatch(/\.beam-ring/);
  expect(css).toMatch(/\.beam-burst/);
  expect(css).toMatch(/affects-all|cast-beam--all/);
  expect(css).toMatch(/prefers-reduced-motion/);
});

jest.mock('../rummikub/components/GridContainer', () => function Grid(){ return <div data-testid="grid"/>; });
jest.mock('../rummikub/components/GameOverModal', () => ({__esModule: true, default: function Over(){ return <div/>; }}));
jest.mock('../rummikub/sound/sfx', () => ({play(){}, place(){}, milestone(){}, buzz(){}}));
jest.mock('../rummikub/juice/effects', () => ({celebrateGroups(){}, burstAt(){}, kick(){}, flash(){}, floatText(){}}));
jest.mock('../rummikub/components/ChatPanel', () => function Chat(){ return <div/>; });
const Board = require('../rummikub/components/Board').default;
const boardProps = (over = {}) => ({
  G: {tilePositions: {}, tilesPool: [0, 0], gameStateStack: [], redoMoveStack: [], recentlyDrawnTiles: [],
      lastPlay: null, timerExpireAt: null, timePerTurn: 30, handCounts: {'0': 14, '1': 14},
      firstMoveDone: [true, true], lastTimeout: null, mode: 'chaos', abilityHands: {'0': []},
      lastCast: {from: '1', to: '0', type: 'peek', blocked: false, id: 9}, ...(over.G || {})},
  ctx: {phase: 'play', currentPlayer: '1', numPlayers: 2, gameover: null, ...(over.ctx || {})},
  moves: {}, playerID: '0', matchID: 'm1', events: {endPhase(){}},
  matchData: [{id: 0, name: 'Me'}, {id: 1, name: 'Bob'}], chatMessages: [], sendChatMessage(){}});

test('Board flashes the beam on a fresh lastCast in chaos, never in classic', () => {
  const {container, rerender} = render(<Board {...boardProps({G: {lastCast: null}})}/>);
  rerender(<Board {...boardProps()}/>);                       // cast lands after mount
  expect(container.querySelector('.cast-beam')).toBeInTheDocument();
  const cl = render(<Board {...boardProps({G: {mode: 'classic'}, lastCast: null})}/>);
  cl.rerender(<Board {...boardProps({G: {mode: 'classic'}})}/>);
  expect(cl.container.querySelector('.cast-beam')).toBeNull();
});

const TableSeats = require('../rummikub/components/TableSeats').default;
test('bluff bubble anchors to the actor avatar with Challenge/Pass', () => {
  const onCh = jest.fn(); const onPass = jest.fn();
  const {container} = render(
    <TableSeats currentPlayer="1" playerID="0" matchID="m1" matchData={[{id: 0, name: 'Me'}, {id: 1, name: 'Bob'}]}
      hands={[[], []]} handCounts={{0: 5, 1: 5}} connected={[true, true]}
      bluff={{actor: '1', declared: 'shield', target: '0'}} bluffCanChallenge
      onChallenge={onCh} onPass={onPass}/>);
  const bubble = container.querySelector('.seat-slot .bluff-bubble');
  expect(bubble).toBeInTheDocument();
  expect(bubble.textContent).toMatch(/claims/i);
});
