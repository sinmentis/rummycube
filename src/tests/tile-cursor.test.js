import React from 'react';
import {render} from '@testing-library/react';
import {TilePreview} from '../rummikub/components/Tile';

test('draggable tile face shows grab, dragging shows grabbing', () => {
  const {container, rerender} = render(<TilePreview tile={5} canDnD={true} isDragging={false}/>);
  const face = container.querySelector('.tile');
  expect(face.style.cursor).toBe('grab');
  rerender(<TilePreview tile={5} canDnD={true} isDragging={true}/>);
  expect(container.querySelector('.tile').style.cursor).toBe('grabbing');
});

test('non-draggable tile face is not a grab cursor', () => {
  const {container} = render(<TilePreview tile={5} canDnD={false} isDragging={false}/>);
  expect(container.querySelector('.tile').style.cursor).toBe('default');
});

test('dragged tile clone stays solid (opacity decoupled from drag cursor)', () => {
  const {container} = render(<TilePreview tile={5} canDnD={true} isDragging={true}/>);
  const face = container.querySelector('.tile');
  expect(face.style.cursor).toBe('grabbing');
  expect(face.style.opacity).not.toBe('0.5');
  expect(face.style.opacity).toBe('1');
});
