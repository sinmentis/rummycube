// src/tests/junk-alert.test.js
// SP2b-T2: the incoming-junk interrupt panel. When G.pendingJunk targets the
// viewer, JunkAlert offers Accept (draw now) + Transfer (stack your own junk
// onto the chain and pass it on). When it targets someone else, it's a small
// "X owes +N" bystander note. No pending -> nothing renders.
import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import JunkAlert from '../rummikub/components/JunkAlert';

const matchData = [{name: 'Me'}, {name: 'Bob'}, {name: 'Cy'}];

test('target is me: shows incoming amount + sender, Accept fires acceptJunk', () => {
  const onAccept = jest.fn();
  render(
    <JunkAlert pendingJunk={{amount: 2, target: '0', from: '1'}} playerID="0"
               matchData={matchData} myJunkCards={[]} onAccept={onAccept} onTransfer={jest.fn()}/>
  );
  expect(screen.getByText(/Incoming \+2/i)).toBeInTheDocument();
  expect(screen.getByText(/Bob/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: /accept/i}));
  expect(onAccept).toHaveBeenCalledTimes(1);
});

test('not the target: shows a small "X owes +N" bystander note, no Accept', () => {
  render(
    <JunkAlert pendingJunk={{amount: 3, target: '1', from: '0'}} playerID="0"
               matchData={matchData} myJunkCards={[]} onAccept={jest.fn()} onTransfer={jest.fn()}/>
  );
  expect(screen.getByText(/Bob owes \+3/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', {name: /accept/i})).toBeNull();
});

test('no pendingJunk: renders nothing', () => {
  const {container} = render(
    <JunkAlert pendingJunk={null} playerID="0" matchData={matchData} myJunkCards={[]}
               onAccept={jest.fn()} onTransfer={jest.fn()}/>
  );
  expect(container.firstChild).toBeNull();
});

test('transfer: pick own junk card + seat, fires transferJunk(cardId, pid)', () => {
  const onTransfer = jest.fn();
  render(
    <JunkAlert pendingJunk={{amount: 2, target: '0', from: '1'}} playerID="0"
               matchData={matchData} myJunkCards={[{id: 'junk3-0', type: 'junk3'}]}
               onAccept={jest.fn()} onTransfer={onTransfer}/>
  );
  fireEvent.click(screen.getByRole('button', {name: /junk3-0|\+3/i}));
  fireEvent.click(screen.getByRole('button', {name: /Cy/}));
  fireEvent.click(screen.getByRole('button', {name: /transfer/i}));
  expect(onTransfer).toHaveBeenCalledWith('junk3-0', '2');
});
