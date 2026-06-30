import React from 'react';
import fs from 'fs';
import path from 'path';
import {render} from '@testing-library/react';
import {TilePreview} from '../rummikub/components/Tile';
import {buildTileObj} from '../rummikub/util';
import {COLOR} from '../rummikub/constants';

const boardCss = fs.readFileSync(
  path.join(__dirname, '../rummikub/components/board.css'),
  'utf8',
);

test('tile face carries suit class on the outer tile for the color strip', () => {
  const red = buildTileObj(7, COLOR.red, 0);
  const {container, rerender} = render(<TilePreview tile={red}/>);
  expect(container.querySelector('.tile')).toHaveClass('tile-red');
  expect(container.querySelector('.tile-text')).toHaveClass('tile-red');

  rerender(<TilePreview tile={buildTileObj(8, COLOR.blue, 0)}/>);
  expect(container.querySelector('.tile')).toHaveClass('tile-blue');

  rerender(<TilePreview tile={buildTileObj(9, COLOR.orange, 0)}/>);
  expect(container.querySelector('.tile')).toHaveClass('tile-orange');

  rerender(<TilePreview tile={buildTileObj(10, COLOR.black, 0)}/>);
  expect(container.querySelector('.tile')).toHaveClass('tile-black');
});

test('stateful tiles quiet the color strip', () => {
  const red = buildTileObj(7, COLOR.red, 0);
  const {container, rerender} = render(<TilePreview tile={red} newlyAdded/>);
  expect(container.querySelector('.tile')).toHaveClass('tile-stateful');

  rerender(<TilePreview tile={red} isValid={true}/>);
  expect(container.querySelector('.tile')).toHaveClass('tile-stateful');

  rerender(<TilePreview tile={red}/>);
  expect(container.querySelector('.tile')).not.toHaveClass('tile-stateful');
});

test('CSS implements only a top color strip, no shape logo', () => {
  expect(boardCss).toMatch(/\.tile::before\s*\{[\s\S]*right:\s*4px/);
  expect(boardCss).not.toMatch(/\.tile::after\s*\{/);
  expect(boardCss).toMatch(/\.tile-stateful::before\s*\{[\s\S]*opacity:\s*\.24/);
  expect(boardCss).toMatch(/\.tile\.tile-joker::before\s*\{[\s\S]*display:\s*none/);
});
