// src/tests/ability-card.test.js
import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import AbilityCard from '../rummikub/components/AbilityCard';
import {CARD_META, RARITY_LABEL} from '../rummikub/abilities/cardMeta';

test('renders name, icon, one-line effect and rarity word for a peek card', () => {
  render(<AbilityCard card={{id: 'peek-0', type: 'peek', rarity: 'white'}} />);
  expect(screen.getByText(CARD_META.peek.name)).toBeInTheDocument();
  expect(screen.getByText(CARD_META.peek.effect)).toBeInTheDocument();
  expect(screen.getByText(RARITY_LABEL.white)).toBeInTheDocument();
});

test('rarity drives a single color class (no redundant W/B/G letter+dots)', () => {
  const {container} = render(<AbilityCard card={{id: 'skip-0', type: 'skip', rarity: 'gold'}} />);
  const el = container.querySelector('.acard');
  expect(el).toHaveClass('acard--gold');
  expect(container.querySelector('.acard-foil')).toBeInTheDocument(); // gold gets foil
});

test('click fires onClick with the card; disabled suppresses it', () => {
  const onClick = jest.fn();
  const card = {id: 'peek-0', type: 'peek', rarity: 'white'};
  const {rerender} = render(<AbilityCard card={card} onClick={onClick} />);
  fireEvent.click(screen.getByText(CARD_META.peek.name).closest('.acard'));
  expect(onClick).toHaveBeenCalledWith(card);
  onClick.mockClear();
  rerender(<AbilityCard card={card} onClick={onClick} disabled />);
  fireEvent.click(screen.getByText(CARD_META.peek.name).closest('.acard'));
  expect(onClick).not.toHaveBeenCalled();
});

test('CARD_META covers all 10 chaos card types', () => {
  for (const t of ['peek','shield','junk2','junk3','force','wheel','bigwind','junk4','skip','lock']) {
    expect(CARD_META[t]).toEqual(expect.objectContaining({name: expect.any(String), icon: expect.any(String), effect: expect.any(String)}));
  }
});
