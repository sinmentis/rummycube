import React, { useCallback, useEffect, useRef } from 'react';
import { render, screen } from '@testing-library/react';

// U11 part B: Board.jsx stabilizes handleTileSelectionCb by
// reading G/state from refs (gRef.current / stateRef.current) instead of
// closing over them, so useCallback deps drop G/state and the callback keeps a
// stable identity across re-renders. A stable identity is what lets React.memo
// on Tile/GridSlot actually skip work in U12.
//
// This test reproduces that exact pattern in a tiny harness: a value prop is
// mirrored into a ref each render; a useCallback with empty deps reads the ref.
// We assert (1) the callback reference is identical across re-renders, and
// (2) it still observes the latest committed value via the ref.
test('ref-backed callback keeps stable identity across re-renders while reading latest value', () => {
  const callbackRefs = [];
  let readValue = null;

  function Harness({ value }) {
    const valueRef = useRef(value);
    useEffect(() => { valueRef.current = value; });

    const cb = useCallback(() => {
      readValue = valueRef.current;
    }, []);

    callbackRefs.push(cb);
    return <button onClick={cb}>v:{value}</button>;
  }

  const { rerender } = render(<Harness value="a" />);
  rerender(<Harness value="b" />);
  rerender(<Harness value="c" />);

  // Identity is stable: every render produced the same callback reference.
  expect(callbackRefs.length).toBe(3);
  expect(callbackRefs[1]).toBe(callbackRefs[0]);
  expect(callbackRefs[2]).toBe(callbackRefs[0]);

  // Behavior unchanged: invoking the (old) callback still reads the latest
  // committed value through the ref.
  screen.getByRole('button').click();
  expect(readValue).toBe('c');
});
