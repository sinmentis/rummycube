import fs from 'fs';
import path from 'path';
import React from 'react';
import {render, screen} from '@testing-library/react';
import {TilePreview} from '../rummikub/components/Tile';

// WCAG 2.x relative-luminance contrast ratio between two #rrggbb colors.
function relativeLuminance(hex) {
    const channel = (v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a, b) {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
}

function readCssVar(css, name) {
    const match = css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
    if (!match) throw new Error(`could not find ${name} in classic.css`);
    return match[1].toLowerCase();
}

describe('S2-U5 orange numeral contrast', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '../rummikub/theme/classic.css'),
        'utf8',
    );

    test('--c-orange meets WCAG >= 3:1 against the ivory tile face', () => {
        const orange = readCssVar(css, '--c-orange');
        const ivory = readCssVar(css, '--tile-face-solid');
        const ratio = contrastRatio(orange, ivory);
        expect(ratio).toBeGreaterThanOrEqual(3.0);
    });
});

describe('S2-U5 per-tile valid/invalid second channel (glyph)', () => {
    // tile = 5 -> value 5, color 0 (red), not a joker.
    const tile = 5;

    test('isValid === true renders the check glyph', () => {
        render(<TilePreview tile={tile} isValid={true}/>);
        expect(screen.getByText('✓')).toBeInTheDocument();
        expect(screen.queryByText('✕')).not.toBeInTheDocument();
    });

    test('isValid === false renders the cross glyph', () => {
        render(<TilePreview tile={tile} isValid={false}/>);
        expect(screen.getByText('✕')).toBeInTheDocument();
        expect(screen.queryByText('✓')).not.toBeInTheDocument();
    });

    test('isValid undefined renders neither glyph', () => {
        render(<TilePreview tile={tile}/>);
        expect(screen.queryByText('✓')).not.toBeInTheDocument();
        expect(screen.queryByText('✕')).not.toBeInTheDocument();
    });
});
