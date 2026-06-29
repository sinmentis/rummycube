// SP5-T2 bluff UI. Face-down play: AbilityHand gains a "Play face-down" toggle +
// a Declare picker, and useAbilityPlay routes a declared play to
// moves.playAbilityCard(id, target, {faceDown, declaredType}). BluffPrompt is the
// challenge interrupt: when G.pendingBluff is live and the viewer may challenge,
// it shows "X claims <declared>" + Challenge/Pass + a soft-timer note; fires
// challengeBluff/passBluff. Not a challenger / no bluff -> nothing.
import React from 'react';
import {render, screen, fireEvent, renderHook, act} from '@testing-library/react';
import useAbilityPlay from '../rummikub/components/hooks/useAbilityPlay';
import AbilityHand from '../rummikub/components/AbilityHand';
import BluffPrompt from '../rummikub/components/BluffPrompt';
import {CARD_META} from '../rummikub/abilities/cardMeta';

const matchData = [{name: 'Me'}, {name: 'Bob'}, {name: 'Cy'}];

describe('useAbilityPlay face-down routing', () => {
  test('non-target declare (wheel) dispatches faceDown immediately', () => {
    const moves = {playAbilityCard: jest.fn()};
    const {result} = renderHook(() => useAbilityPlay(moves));
    act(() => result.current.setFaceDown(true));
    act(() => result.current.setDeclared('wheel'));
    act(() => result.current.playCard({id: 'skip-0', type: 'skip'}));
    expect(moves.playAbilityCard).toHaveBeenCalledWith('skip-0', undefined, {faceDown: true, declaredType: 'wheel'});
    expect(result.current.pendingPeek).toBeFalsy();
  });

  test('single-target declare (shield) waits for target then dispatches with opts', () => {
    const moves = {playAbilityCard: jest.fn()};
    const {result} = renderHook(() => useAbilityPlay(moves));
    act(() => result.current.setFaceDown(true));
    act(() => result.current.setDeclared('shield'));
    act(() => result.current.playCard({id: 'gold-0', type: 'lock'}));
    expect(moves.playAbilityCard).not.toHaveBeenCalled();
    expect(result.current.pendingPeek).toMatchObject({id: 'gold-0'});
    act(() => result.current.pickTarget('1'));
    expect(moves.playAbilityCard).toHaveBeenCalledWith('gold-0', '1', {faceDown: true, declaredType: 'shield'});
  });

  test('face-down off keeps classic routing (peek waits, then no opts)', () => {
    const moves = {playAbilityCard: jest.fn()};
    const {result} = renderHook(() => useAbilityPlay(moves));
    act(() => result.current.playCard({id: 'peek-0', type: 'peek'}));
    act(() => result.current.pickTarget('1'));
    expect(moves.playAbilityCard).toHaveBeenCalledWith('peek-0', '1');
  });
});

describe('AbilityHand declare UI', () => {
  test('face-down toggle + declare picker makes any card bluff-playable', () => {
    const onPlay = jest.fn();
    render(<AbilityHand cards={[{id: 'lock-0', type: 'lock', rarity: 'gold'}]} onPlay={onPlay}
                        faceDown={true} declared="peek" onToggleFaceDown={() => {}} onDeclare={() => {}}/>);
    fireEvent.click(screen.getByText(CARD_META.lock.name).closest('.acard'));
    expect(onPlay).toHaveBeenCalledTimes(1);   // gold card playable when bluffing
  });

  test('toggle off: non-playable card stays disabled', () => {
    const onPlay = jest.fn();
    render(<AbilityHand cards={[{id: 'lock-0', type: 'lock', rarity: 'gold'}]} onPlay={onPlay}/>);
    fireEvent.click(screen.getByText(CARD_META.lock.name).closest('.acard'));
    expect(onPlay).not.toHaveBeenCalled();
  });
});

describe('BluffPrompt challenge interrupt', () => {
  const bluff = {actor: '1', declared: 'shield', target: '0'};
  test('single-target: claim + Challenge fires onChallenge, Pass fires onPass', () => {
    const onChallenge = jest.fn(); const onPass = jest.fn();
    render(<BluffPrompt pendingBluff={bluff} playerID="0" matchData={matchData}
                        onChallenge={onChallenge} onPass={onPass}/>);
    expect(screen.getByText(/claims/i)).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(CARD_META.shield.name, 'i'))).toBeInTheDocument();
    expect(screen.getByText(/turn end/i)).toBeInTheDocument();   // soft-timer note
    fireEvent.click(screen.getByRole('button', {name: /challenge/i}));
    fireEvent.click(screen.getByRole('button', {name: /pass/i}));
    expect(onChallenge).toHaveBeenCalledTimes(1);
    expect(onPass).toHaveBeenCalledTimes(1);
  });

  test('non-target of a single-target bluff: renders nothing', () => {
    const {container} = render(<BluffPrompt pendingBluff={bluff} playerID="2" matchData={matchData}
                                            onChallenge={jest.fn()} onPass={jest.fn()}/>);
    expect(container.firstChild).toBeNull();
  });

  test('table-wide (wheel): all opponents may challenge, actor sees nothing', () => {
    const tw = {actor: '1', declared: 'wheel', target: null};
    render(<BluffPrompt pendingBluff={tw} playerID="0" matchData={matchData} onChallenge={jest.fn()} onPass={jest.fn()}/>);
    expect(screen.getByRole('button', {name: /challenge/i})).toBeInTheDocument();
    const {container} = render(<BluffPrompt pendingBluff={tw} playerID="1" matchData={matchData} onChallenge={jest.fn()} onPass={jest.fn()}/>);
    expect(container.firstChild).toBeNull();
  });

  test('no pendingBluff: nothing', () => {
    const {container} = render(<BluffPrompt pendingBluff={null} playerID="0" matchData={matchData} onChallenge={jest.fn()} onPass={jest.fn()}/>);
    expect(container.firstChild).toBeNull();
  });
});

const fs = require('fs'); const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/abilities.css'), 'utf8');
test('bluff prompt honors reduced-motion in CSS source', () => {
  expect(css).toMatch(/\.bluff-prompt/);
  expect(css).toMatch(/prefers-reduced-motion/);
});

// Board wiring: chaos-gated. Pending bluff aimed at viewer -> prompt; classic -> none.
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
      pendingBluff: {actor: '1', declared: 'shield', target: '0'}, ...(over.G || {})},
  ctx: {phase: 'play', currentPlayer: '1', numPlayers: 2, gameover: null, ...(over.ctx || {})},
  moves: {}, playerID: '0', matchID: 'm1', events: {endPhase(){}},
  matchData: [{id: 0, name: 'Me'}, {id: 1, name: 'Bob'}], chatMessages: [], sendChatMessage(){}});

test('Board surfaces BluffPrompt to the target in chaos, never in classic', () => {
  render(<Board {...boardProps()}/>);
  expect(screen.getByRole('button', {name: /challenge/i})).toBeInTheDocument();
  const {container} = render(<Board {...boardProps({G: {mode: 'classic'}})}/>);
  expect(container.querySelector('.bluff-prompt')).toBeNull();
});
