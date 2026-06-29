// src/tests/ability-hand.test.js
import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import AbilityHand from '../rummikub/components/AbilityHand';
import {CARD_META} from '../rummikub/abilities/cardMeta';

const root = (c) => c.querySelector('.ability-root');

test('renders a labelled tab with a count badge for the hand size', () => {
  const cards = [{id: 'peek-0', type: 'peek', rarity: 'white'}, {id: 'shield-0', type: 'shield', rarity: 'white'}];
  const {container} = render(<AbilityHand cards={cards} onPlay={() => {}} />);
  expect(screen.getByRole('button', {name: /open abilities/i})).toHaveClass('ability-tab');
  expect(container.querySelector('.ability-tab-count').textContent).toBe('2');
  expect(root(container)).not.toHaveClass('open');
});

test('tapping the tab toggles the open class; close collapses it', () => {
  const cards = [{id: 'peek-0', type: 'peek', rarity: 'white'}];
  const {container} = render(<AbilityHand cards={cards} onPlay={() => {}} />);
  fireEvent.click(screen.getByRole('button', {name: /open abilities/i}));
  expect(root(container)).toHaveClass('open');
  fireEvent.click(screen.getByRole('button', {name: /close abilities/i}));
  expect(root(container)).not.toHaveClass('open');
});

test('cards render in the panel once opened', () => {
  const cards = [{id: 'peek-0', type: 'peek', rarity: 'white'}, {id: 'shield-0', type: 'shield', rarity: 'white'}];
  const {container} = render(<AbilityHand cards={cards} onPlay={() => {}} />);
  fireEvent.click(screen.getByRole('button', {name: /open abilities/i}));
  expect(container.querySelectorAll('.ability-panel .acard')).toHaveLength(2);
  expect(screen.getByText(CARD_META.peek.name)).toBeInTheDocument();
  expect(screen.getByText(CARD_META.shield.name)).toBeInTheDocument();
});

test('empty hand hides the drawer entirely (no tab, no cards)', () => {
  const {container} = render(<AbilityHand cards={[]} onPlay={() => {}} />);
  expect(root(container)).toBeNull();
  expect(container.querySelectorAll('.acard')).toHaveLength(0);
});

test('every dealt card type is now playable (SP6)', () => {
  const onPlay = jest.fn();
  render(<AbilityHand cards={[{id: 'skip-0', type: 'skip', rarity: 'gold'}]} onPlay={onPlay} />);
  fireEvent.click(screen.getByText(CARD_META.skip.name).closest('.acard'));
  expect(onPlay).toHaveBeenCalledWith({id: 'skip-0', type: 'skip', rarity: 'gold'});
});

test('playable card calls onPlay(card)', () => {
  const onPlay = jest.fn();
  const card = {id: 'peek-0', type: 'peek', rarity: 'white'};
  render(<AbilityHand cards={[card]} onPlay={onPlay} />);
  fireEvent.click(screen.getByText(CARD_META.peek.name).closest('.acard'));
  expect(onPlay).toHaveBeenCalledWith(card);
});

test('bluff toggle + declare picker live inside the drawer', () => {
  const onToggleFaceDown = jest.fn();
  const {container} = render(
    <AbilityHand cards={[{id: 'peek-0', type: 'peek', rarity: 'white'}]} onPlay={() => {}}
                 faceDown={true} declared="peek" onToggleFaceDown={onToggleFaceDown} onDeclare={() => {}} />);
  expect(container.querySelector('.ability-panel .bluff-bar')).toBeInTheDocument();
  expect(container.querySelector('.bluff-claim select')).toBeInTheDocument();
});

// CSS-source guard: mirror the codex FAB collapse mechanism — the tab shows by
// default, the panel stays hidden until .ability-root.open swaps them; a max-width
// media query keeps it usable on mobile.
const fs = require('fs'); const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/abilities.css'), 'utf8');

function firstRuleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`could not find rule ${selector}`);
  return m[1];
}

test('ability tab shows by default; panel hidden until .ability-root.open', () => {
  const tab = firstRuleBody('.ability-tab');
  expect(tab).toMatch(/display:\s*(inline-flex|flex)/);
  expect(tab).not.toMatch(/display:\s*none/);
  expect(firstRuleBody('.ability-panel')).toMatch(/display:\s*none/);
  expect(css).toMatch(/\.ability-root\.open\s+\.ability-panel\s*\{[^}]*display:\s*flex/);
  expect(css).toMatch(/\.ability-root\.open\s+\.ability-tab\s*\{[^}]*display:\s*none/);
});

test('mobile keeps the drawer usable (max-width media query targets the root)', () => {
  expect(css).toMatch(/@media[^{]*max-width[\s\S]*\.ability-root/);
});
