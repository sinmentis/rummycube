import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import AbilityCodex from '../rummikub/components/AbilityCodex';
import {CARD_META} from '../rummikub/abilities/cardMeta';

const fs = require('fs');
const path = require('path');

const root = (c) => c.querySelector('.codex-root');

test('renders a FAB and starts collapsed', () => {
  const {container} = render(<AbilityCodex />);
  expect(screen.getByRole('button', {name: /open ability codex/i})).toHaveClass('codex-fab');
  expect(root(container)).not.toHaveClass('open');
});

test('tapping the FAB opens the panel; closing collapses it', () => {
  const {container} = render(<AbilityCodex />);
  fireEvent.click(screen.getByRole('button', {name: /open ability codex/i}));
  expect(root(container)).toHaveClass('open');
  fireEvent.click(screen.getByRole('button', {name: /close ability codex/i}));
  expect(root(container)).not.toHaveClass('open');
});

test('open panel lists all 10 cards + a chaos how-to', () => {
  const {container} = render(<AbilityCodex />);
  fireEvent.click(screen.getByRole('button', {name: /open ability codex/i}));
  for (const t of ['peek','shield','junk2','junk3','force','wheel','bigwind','junk4','skip','lock']) {
    expect(screen.getByText(CARD_META[t].name)).toBeInTheDocument();
  }
  expect(container.querySelector('.codex-howto')).toBeInTheDocument();
});

// CSS-source assertions (mirror board-visual-layout.test.js): the codex FAB must
// mirror the chat FAB's collapse mechanism — FAB shows by default, panel hidden
// until .codex-root.open swaps them. jsdom can't evaluate the real CSS, so we
// assert the source rules directly.
const abilitiesCss = fs.readFileSync(
  path.join(__dirname, '../rummikub/components/abilities.css'),
  'utf8',
);

function firstRuleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`could not find rule ${selector}`);
  return m[1];
}

test('codex FAB shows by default (its base rule, not hidden behind .open)', () => {
  const body = firstRuleBody(abilitiesCss, '.codex-fab');
  expect(body).toMatch(/display:\s*(inline-flex|flex)/);
  expect(body).not.toMatch(/display:\s*none/);
});

test('codex panel collapses by default and reveals via .codex-root.open', () => {
  const panel = firstRuleBody(abilitiesCss, '.codex-panel');
  expect(panel).toMatch(/display:\s*none/);
  expect(abilitiesCss).toMatch(/\.codex-root\.open\s+\.codex-panel\s*\{[^}]*display:\s*flex/);
  expect(abilitiesCss).toMatch(/\.codex-root\.open\s+\.codex-fab\s*\{[^}]*display:\s*none/);
});
