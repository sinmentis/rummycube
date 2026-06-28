// src/tests/ability-hand.test.js
import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import AbilityHand from '../rummikub/components/AbilityHand';
import {CARD_META} from '../rummikub/abilities/cardMeta';

test('renders each of the viewer\'s ability cards', () => {
  const cards = [{id: 'peek-0', type: 'peek', rarity: 'white'}, {id: 'shield-0', type: 'shield', rarity: 'white'}];
  render(<AbilityHand cards={cards} onPlay={() => {}} />);
  expect(screen.getByText(CARD_META.peek.name)).toBeInTheDocument();
  expect(screen.getByText(CARD_META.shield.name)).toBeInTheDocument();
});

test('empty hand renders an empty container, no crash', () => {
  const {container} = render(<AbilityHand cards={[]} onPlay={() => {}} />);
  expect(container.querySelectorAll('.acard')).toHaveLength(0);
});

test('non-playable card types are disabled (no onPlay in SP1b)', () => {
  const onPlay = jest.fn();
  render(<AbilityHand cards={[{id: 'skip-0', type: 'skip', rarity: 'gold'}]} onPlay={onPlay} />);
  fireEvent.click(screen.getByText(CARD_META.skip.name).closest('.acard'));
  expect(onPlay).not.toHaveBeenCalled();
});

test('playable card calls onPlay(card)', () => {
  const onPlay = jest.fn();
  const card = {id: 'peek-0', type: 'peek', rarity: 'white'};
  render(<AbilityHand cards={[card]} onPlay={onPlay} />);
  fireEvent.click(screen.getByText(CARD_META.peek.name).closest('.acard'));
  expect(onPlay).toHaveBeenCalledWith(card);
});

// CSS-source guard (append): the fan overlaps cards and only the top edge of
// lower cards shows; the mobile drawer is a separate media-query layout.
const fs = require('fs'); const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/abilities.css'), 'utf8');
test('hand has an overlapping fan (desktop) and a drawer layout (mobile media query)', () => {
  expect(css).toMatch(/\.ability-fan/);
  expect(css).toMatch(/@media[^{]*max-width[\s\S]*\.ability-drawer/);
});
