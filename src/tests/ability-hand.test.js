// src/tests/ability-hand.test.js
import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import AbilityHand from '../rummikub/components/AbilityHand';
import {CARD_META} from '../rummikub/abilities/cardMeta';

const strip = (c) => c.querySelector('.ability-strip');

test('cards are always visible by the rack — no tab, no toggle to open', () => {
    const cards = [{id: 'peek-0', type: 'peek', rarity: 'white'}, {id: 'shield-0', type: 'shield', rarity: 'white'}];
    const {container} = render(<AbilityHand cards={cards} onPlay={() => {}} />);
    expect(strip(container)).toBeInTheDocument();
    expect(container.querySelectorAll('.ability-strip .acard')).toHaveLength(2);
    expect(screen.getByText(CARD_META.peek.name)).toBeInTheDocument();
    expect(screen.getByText(CARD_META.shield.name)).toBeInTheDocument();
    expect(container.querySelector('.ability-tab')).toBeNull();
    expect(container.querySelector('.ability-root')).toBeNull();
});

test('empty hand renders nothing (no strip, no cards)', () => {
    const {container} = render(<AbilityHand cards={[]} onPlay={() => {}} />);
    expect(strip(container)).toBeNull();
    expect(container.querySelectorAll('.acard')).toHaveLength(0);
});

test('every dealt card type is playable (SP6)', () => {
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

test('bluff toggle + declare picker live above the strip', () => {
    const onToggleFaceDown = jest.fn();
    const {container} = render(
        <AbilityHand cards={[{id: 'peek-0', type: 'peek', rarity: 'white'}]} onPlay={() => {}}
                     faceDown={true} declared="peek" onToggleFaceDown={onToggleFaceDown} onDeclare={() => {}} />);
    expect(container.querySelector('.bluff-bar')).toBeInTheDocument();
    expect(container.querySelector('.bluff-claim select')).toBeInTheDocument();
});

// CSS-source guard: the strip replaces the drawer. Cards sit side-by-side with the
// rack, overlap-stacked, and the fixed right drawer (root/tab/panel) is gone except
// for a mobile fallback under the 820px breakpoint.
const fs = require('fs'); const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../rummikub/components/abilities.css'), 'utf8');

function firstRuleBody(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
    if (!m) throw new Error(`could not find rule ${selector}`);
    return m[1];
}

test('ability strip is a flex row of overlap-stacked cards using the shared tokens', () => {
    const body = firstRuleBody('.ability-strip');
    expect(body).toMatch(/display:\s*flex/);
    expect(css).toMatch(/var\(--ability-card-w\)/);
    expect(css).toMatch(/var\(--ability-overlap\)/);
});

test('drawer tab/panel/root styles are gone', () => {
    expect(css).not.toMatch(/\.ability-tab\s*\{/);
    expect(css).not.toMatch(/\.ability-panel\s*\{/);
    expect(css).not.toMatch(/\.ability-root\s*\{/);
});

test('mobile keeps a usable fallback (max-width media query targets the strip)', () => {
    expect(css).toMatch(/@media[^{]*max-width:\s*820px[\s\S]*\.ability-strip/);
});
