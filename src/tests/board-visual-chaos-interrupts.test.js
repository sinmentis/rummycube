// Chaos UX fix T3 (P0-3/P0-4) — transient interrupts move off the top into an
// avatar-height centered band, and peek/lock targeting locks the table: ability
// cards go inert, only opponent avatars / board rows stay clickable, and the
// prompt auto-dismisses on the turn deadline (12s safety) instead of being a
// permanent bar. jsdom can't measure pixels, so the layout half is CSS-source
// (like the other board-visual-*.test.js); the behaviour half is RTL on Board.
import React from 'react';
import {render, screen, fireEvent, act} from '@testing-library/react';
const fs = require('fs');
const path = require('path');

const board = fs.readFileSync(path.join(__dirname, '../rummikub/components/board.css'), 'utf8');
const abilities = fs.readFileSync(path.join(__dirname, '../rummikub/components/abilities.css'), 'utf8');

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`could not find rule ${selector}`);
  return m[1];
}

describe('CSS source: interrupt band sits at avatar height, not the top', () => {
  test('.interrupt-band is centered around ~42% vertical (well below the top 20%)', () => {
    const tok = board.match(/--interrupt-band-y:\s*(\d+)%/);
    expect(tok).toBeTruthy();
    expect(Number(tok[1])).toBeGreaterThanOrEqual(35);
    const body = ruleBody(board, '.interrupt-band');
    expect(body).toMatch(/top:\s*var\(--interrupt-band-y/);
    expect(body).toMatch(/left:\s*50%/);
    expect(body).toMatch(/transform:\s*translate\(-50%,\s*-50%\)/);
    expect(body).toMatch(/pointer-events:\s*none/);
  });
  test('interrupt-band children opt back into pointer events', () => {
    expect(board).toMatch(/\.interrupt-band\s*>\s*\*\s*\{[^}]*pointer-events:\s*auto/);
  });
  test('peek-targeting flows inside the band (static, not pinned to top:14px)', () => {
    expect(ruleBody(abilities, '.peek-targeting')).toMatch(/position:\s*static/);
  });
});

describe('CSS source: peek/lock targeting locks the table', () => {
  test('targeting dims the hand rack', () => {
    expect(board).toMatch(/\.board\.chaos\.is-targeting\s+\.hand-grid\s*\{[^}]*opacity/);
  });
  test('targeting makes the ability strip inert', () => {
    expect(board).toMatch(/\.board\.chaos\.is-targeting\s+\.ability-strip\s*\{[^}]*pointer-events:\s*none/);
  });
  test('classic board is untouched (no is-targeting band gating)', () => {
    expect(board).toMatch(/\.top-cue-stack\s*\{[^}]*top:\s*10px/);
  });
});

jest.mock('../rummikub/components/GridContainer', () => function Grid(p){ return <div data-testid="grid" className={p.className||''}/>; });
jest.mock('../rummikub/components/GameOverModal', () => ({__esModule: true, default: function Over(){ return <div/>; }}));
jest.mock('../rummikub/sound/sfx', () => ({play(){}, place(){}, milestone(){}, buzz(){}}));
jest.mock('../rummikub/juice/effects', () => ({celebrateGroups(){}, burstAt(){}, kick(){}, flash(){}, floatText(){}}));
jest.mock('../rummikub/components/ChatPanel', () => function Chat(){ return <div/>; });
const Board = require('../rummikub/components/Board').default;
const boardProps = (over = {}) => ({
  G: {tilePositions: {}, tilesPool: [0, 0], gameStateStack: [], redoMoveStack: [], recentlyDrawnTiles: [],
      lastPlay: null, timerExpireAt: null, timePerTurn: 30, handCounts: {'0': 14, '1': 14},
      firstMoveDone: [true, true], lastTimeout: null, mode: 'chaos',
      abilityHands: {'0': [{id: 'peek-0', type: 'peek', rarity: 'white'}]}, ...(over.G || {})},
  ctx: {phase: 'play', currentPlayer: '0', numPlayers: 2, gameover: null, turn: 1, ...(over.ctx || {})},
  moves: {playAbilityCard(){}}, playerID: '0', matchID: 'm1', events: {endPhase(){}},
  matchData: [{id: 0, name: 'Me'}, {id: 1, name: 'Bob'}], chatMessages: [], sendChatMessage(){}});

test('transient toasts live in the band, never in the system top-cue stack', () => {
  const {container} = render(<Board {...boardProps({G: {lastWheel: {object: 'Bob', action: 'skipped', detail: ''}}})}/>);
  expect(container.querySelector('.interrupt-band .wheel-toast')).toBeTruthy();
  expect(container.querySelector('.top-cue-stack .wheel-toast')).toBeNull();
});

test('clicking a peek card locks the table: hand dims + strip inert, then auto-cancels', () => {
  jest.useFakeTimers();
  const {container} = render(<Board {...boardProps()}/>);
  fireEvent.click(container.querySelector('.ability-strip .acard'));
  expect(container.querySelector('.board.chaos.is-targeting')).toBeTruthy();
  expect(container.querySelector('.peek-targeting')).toBeTruthy();
  act(() => { jest.advanceTimersByTime(12001); });
  expect(container.querySelector('.board.chaos.is-targeting')).toBeNull();
  expect(container.querySelector('.peek-targeting')).toBeNull();
  jest.useRealTimers();
});
