// SP3b: the all-visible Public Wheel toast. The SP3a backend sets the public
// G.lastWheel = {object, action, detail} transient after a spin; WheelToast turns
// it into a short English line ("Player 2 drew 3", "Table: set removed") plus a
// brief center wheel-spin, then auto-dismisses (or is replaced by the next spin).
// reduced-motion drops the spin animation (text only) — proven at the CSS source.
import React from 'react';
import {render, screen, act} from '@testing-library/react';
import WheelToast from '../rummikub/components/WheelToast';

const matchData = [{name: 'Alice'}, {name: 'Bob'}];
const el = (props) => (
  <WheelToast lastWheel={null} matchData={matchData} durationMs={4000} {...props}/>
);

afterEach(() => { jest.useRealTimers(); });

test('no lastWheel: renders nothing', () => {
  const {container} = render(el());
  expect(container.firstChild).toBeNull();
});

test('player draw: shows object + action text (drew count)', () => {
  render(el({lastWheel: {object: 'player', action: 'draw', detail: {seat: '1', count: 3}}}));
  expect(screen.getByText(/Bob drew 3/i)).toBeInTheDocument();
});

test('table remove-set: shows "Table: set removed"', () => {
  render(el({lastWheel: {object: 'table', action: 'remove-set', detail: {count: 5}}}));
  expect(screen.getByText(/Table:\s*set removed/i)).toBeInTheDocument();
});

test('auto-dismiss after durationMs, replaced by next spin', () => {
  jest.useFakeTimers();
  const {rerender} = render(el({lastWheel: {object: 'player', action: 'draw', detail: {seat: '0', count: 1}}}));
  expect(screen.getByText(/Alice drew 1/i)).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(4000); });
  expect(screen.queryByText(/Alice drew 1/i)).not.toBeInTheDocument();
  act(() => { rerender(el({lastWheel: {object: 'table', action: 'add-set', detail: {count: 3}}})); });
  expect(screen.getByText(/Table:\s*set added/i)).toBeInTheDocument();
});

const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/abilities.css'), 'utf8');
test('wheel spin respects reduced-motion in CSS source', () => {
  expect(css).toMatch(/\.wheel-toast|\.wheel-spin/);
  expect(css).toMatch(/prefers-reduced-motion/);
});

// Board wiring: chaos-gated, hidden in classic / on gameover.
jest.mock('../rummikub/components/GridContainer', () => function Grid(){ return <div data-testid="grid"/>; });
jest.mock('../rummikub/components/GameOverModal', () => ({__esModule: true, default: function Over(){ return <div/>; }}));
jest.mock('../rummikub/sound/sfx', () => ({play(){}, place(){}, milestone(){}, buzz(){}}));
jest.mock('../rummikub/juice/effects', () => ({celebrateGroups(){}, burstAt(){}, kick(){}, flash(){}, floatText(){}}));
jest.mock('../rummikub/components/ChatPanel', () => function Chat(){ return <div/>; });
const Board = require('../rummikub/components/Board').default;

const boardProps = (over = {}) => ({
  G: {tilePositions: {}, tilesPool: [0, 0], gameStateStack: [], redoMoveStack: [], recentlyDrawnTiles: [],
      lastPlay: null, timerExpireAt: null, timePerTurn: 30, handCounts: {'0': 14, '1': 14},
      firstMoveDone: [true, true], lastTimeout: null, mode: 'chaos', ...(over.G || {})},
  ctx: {phase: 'play', currentPlayer: '0', numPlayers: 2, gameover: null, ...(over.ctx || {})},
  moves: {}, playerID: '0', matchID: 'm1', events: {endPhase(){}},
  matchData: [{id: 0, name: 'Alice'}, {id: 1, name: 'Bob'}], chatMessages: [], sendChatMessage(){}});

test('Board surfaces the toast on a new chaos spin, never in classic', () => {
  const {rerender} = render(<Board {...boardProps()}/>);
  expect(screen.queryByText(/Wheel:/i)).not.toBeInTheDocument();
  rerender(<Board {...boardProps({G: {lastWheel: {object: 'table', action: 'remove-set', detail: {}}}})}/>);
  expect(screen.getByText(/Table:\s*set removed/i)).toBeInTheDocument();
  render(<Board {...boardProps({G: {mode: 'classic', lastWheel: {object: 'player', action: 'draw', detail: {seat: '0', count: 2}}}})}/>);
  expect(screen.queryByText(/drew 2/i)).not.toBeInTheDocument();
});

