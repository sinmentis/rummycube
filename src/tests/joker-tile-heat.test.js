import fs from 'fs';
import path from 'path';
import {render} from '@testing-library/react';
import Tile from '../rummikub/components/Tile';
import {RedJoker} from '../rummikub/util';

// SP4b-T2: a board joker shows ambient danger (heat colour + clown face + a hover
// popover with the exact next-boom %). Heat 4 maps to fuseProb(5)=0.80 -> high.
// A joker WITHOUT heat (classic / hand) must render exactly as before: no .jtile.
test('joker tile with heat shows danger class + odds; none without', () => {
    const {container, rerender} = render(<Tile tile={RedJoker} jokerHeat={4}/>);
    expect(container.querySelector('.jtile.heat-high')).toBeTruthy();
    expect(container.textContent).toMatch(/80%/);
    rerender(<Tile tile={RedJoker}/>); // classic: no heat
    expect(container.querySelector('.jtile')).toBeFalsy();
});

test('board.css carries heat tokens + jheat-pop hover rule', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '../rummikub/components/board.css'), 'utf8');
    expect(css).toMatch(/\.heat-low/);
    expect(css).toMatch(/\.heat-med/);
    expect(css).toMatch(/\.heat-high/);
    expect(css).toMatch(/\.jtile:hover\s+\.jheat-pop/);
});
