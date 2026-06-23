import React from 'react';
import { render, screen } from '@testing-library/react';

// Minimal smoke test proving the jsdom + React Testing Library harness works.
test('renders a trivial component into the DOM', () => {
  const Hello = () => React.createElement('div', null, 'harness ok');
  render(React.createElement(Hello));
  expect(screen.getByText('harness ok')).toBeInTheDocument();
});
