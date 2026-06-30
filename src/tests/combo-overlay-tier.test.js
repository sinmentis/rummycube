import React from 'react';
import {render} from '@testing-library/react';
import ComboOverlay from '../rummikub/components/ComboOverlay';

test('combo overlay colour tier matches net-added label thresholds', () => {
  const {container, rerender} = render(<ComboOverlay combo={5} />);
  expect(container.querySelector('.combo-overlay')).toHaveClass('combo-warm');
  expect(container.querySelector('.combo-label').textContent).toBe('NICE');

  rerender(<ComboOverlay combo={7} />);
  expect(container.querySelector('.combo-overlay')).toHaveClass('combo-hot');
  expect(container.querySelector('.combo-label').textContent).toBe('COMBO');

  rerender(<ComboOverlay combo={9} />);
  expect(container.querySelector('.combo-overlay')).toHaveClass('combo-fire');
  expect(container.querySelector('.combo-label').textContent).toBe('ON FIRE');
});

test('combo overlay labels the number as net table additions', () => {
  const {container, rerender} = render(<ComboOverlay combo={1} />);
  expect(container.querySelector('.combo-x').textContent).toBe('TABLE +');
  expect(container.querySelector('.combo-n').textContent).toBe('1');
  expect(container.querySelector('.combo-unit').textContent).toBe('tile');

  rerender(<ComboOverlay combo={3} />);
  expect(container.querySelector('.combo-n').textContent).toBe('3');
  expect(container.querySelector('.combo-unit').textContent).toBe('tiles');
});
