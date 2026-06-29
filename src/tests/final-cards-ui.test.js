// src/tests/final-cards-ui.test.js
// SP6 T2: UI wiring for the last four ability cards (skip / lock / force /
// bigwind) plus the chaos status badges. skip+force aim at an opponent (avatar
// pick), lock at a board row (row pick), bigwind fires immediately with no
// target. StatusBadges surfaces skipNext/forced/lock state.
import React from 'react';
import {render, screen, renderHook, act} from '@testing-library/react';
import useAbilityPlay from '../rummikub/components/hooks/useAbilityPlay';
import StatusBadges from '../rummikub/components/StatusBadges';

test.each(['skip', 'force'])('%s parks for an opponent then dispatches playAbilityCard(cardId, pid)', (type) => {
  const moves = {playAbilityCard: jest.fn()};
  const {result} = renderHook(() => useAbilityPlay(moves));
  act(() => result.current.playCard({id: `${type}-0`, type}));
  expect(moves.playAbilityCard).not.toHaveBeenCalled();
  expect(result.current.pendingPeek).toMatchObject({id: `${type}-0`});
  act(() => result.current.pickTarget('1'));
  expect(moves.playAbilityCard).toHaveBeenCalledWith(`${type}-0`, '1');
  expect(result.current.pendingPeek).toBeFalsy();
});

test('lock parks for a board row then dispatches playAbilityCard(cardId, row)', () => {
  const moves = {playAbilityCard: jest.fn()};
  const {result} = renderHook(() => useAbilityPlay(moves));
  act(() => result.current.playCard({id: 'lock-0', type: 'lock'}));
  expect(moves.playAbilityCard).not.toHaveBeenCalled();
  expect(result.current.pendingLock).toMatchObject({id: 'lock-0'});
  act(() => result.current.pickRow(3));
  expect(moves.playAbilityCard).toHaveBeenCalledWith('lock-0', 3);
  expect(result.current.pendingLock).toBeFalsy();
});

test('bigwind dispatches immediately with no target', () => {
  const moves = {playAbilityCard: jest.fn()};
  const {result} = renderHook(() => useAbilityPlay(moves));
  act(() => result.current.playCard({id: 'bigwind-0', type: 'bigwind'}));
  expect(moves.playAbilityCard).toHaveBeenCalledWith('bigwind-0');
  expect(result.current.pendingPeek).toBeFalsy();
  expect(result.current.pendingLock).toBeFalsy();
});

test('forced badge shows the play-or-draw warning', () => {
  render(<StatusBadges forced lockedRows={[]} />);
  expect(screen.getByText(/must play or draw 3/i)).toBeInTheDocument();
});

test('skipped badge shows when skipNext is set', () => {
  render(<StatusBadges skipNext lockedRows={[]} />);
  expect(screen.getByText(/skipped next/i)).toBeInTheDocument();
});

test('locked rows render a lock marker', () => {
  render(<StatusBadges lockedRows={[2, 5]} />);
  expect(screen.getByText(/2 sets locked/i)).toBeInTheDocument();
});

test('no chaos state renders nothing', () => {
  const {container} = render(<StatusBadges lockedRows={[]} />);
  expect(container.firstChild).toBeNull();
});
