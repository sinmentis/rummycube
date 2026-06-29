// src/tests/ability-play-flow.test.js
import React from 'react';
import {render, screen, fireEvent, renderHook, act} from '@testing-library/react';
import useAbilityPlay from '../rummikub/components/hooks/useAbilityPlay';
import PeekPanel from '../rummikub/components/PeekPanel';

test('shield plays immediately with no target', () => {
  const moves = {playAbilityCard: jest.fn()};
  const {result} = renderHook(() => useAbilityPlay(moves));
  act(() => result.current.playCard({id: 'shield-0', type: 'shield'}));
  expect(moves.playAbilityCard).toHaveBeenCalledWith('shield-0');
  expect(result.current.pendingPeek).toBeFalsy();
});

test('peek waits for a target, then dispatches playAbilityCard(cardId, pid)', () => {
  const moves = {playAbilityCard: jest.fn()};
  const {result} = renderHook(() => useAbilityPlay(moves));
  act(() => result.current.playCard({id: 'peek-0', type: 'peek'}));
  expect(moves.playAbilityCard).not.toHaveBeenCalled();         // no target yet
  expect(result.current.pendingPeek).toMatchObject({id: 'peek-0'});
  act(() => result.current.pickTarget('1'));
  expect(moves.playAbilityCard).toHaveBeenCalledWith('peek-0', '1');
  expect(result.current.pendingPeek).toBeFalsy();               // cleared after target
});

test.each(['junk2', 'junk3', 'junk4'])('%s waits for a target, then dispatches playAbilityCard(cardId, pid)', (type) => {
  const moves = {playAbilityCard: jest.fn()};
  const {result} = renderHook(() => useAbilityPlay(moves));
  act(() => result.current.playCard({id: `${type}-0`, type}));
  expect(moves.playAbilityCard).not.toHaveBeenCalled();          // parks, no target yet
  expect(result.current.pendingPeek).toMatchObject({id: `${type}-0`});
  act(() => result.current.pickTarget('1'));
  expect(moves.playAbilityCard).toHaveBeenCalledWith(`${type}-0`, '1');
  expect(result.current.pendingPeek).toBeFalsy();
});

test('a non-target white type stays inert without face-down', () => {
  const moves = {playAbilityCard: jest.fn()};
  const {result} = renderHook(() => useAbilityPlay(moves));
  act(() => result.current.playCard({id: 'mystery-0', type: 'mystery'}));
  expect(moves.playAbilityCard).not.toHaveBeenCalled();
  expect(result.current.pendingPeek).toBeFalsy();
});

test('PeekPanel renders the revealed target rack tiles + privacy note, foldable', () => {
  // peekGrants[0]='1' -> player 1's hand tiles are present in tilePositions (playerView reveal)
  const tilePositions = {
    50: {id: 50, gridId: 'h', playerID: '1', col: 0, row: 0},
    51: {id: 51, gridId: 'h', playerID: '1', col: 1, row: 0},
    9:  {id: 9,  gridId: 'h', playerID: '0', col: 0, row: 0},   // viewer's own tile must NOT leak in
  };
  const {container} = render(<PeekPanel viewerID="0" targetID="1" tilePositions={tilePositions} />);
  expect(container.querySelectorAll('.tile')).toHaveLength(2);   // only the 2 target tiles
  expect(screen.getByText(/only you can see this/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: /fold|collapse/i}));
  expect(container.querySelector('.peek-panel')).toHaveClass('folded');
});
