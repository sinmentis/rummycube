import React from 'react';
import { render, screen } from '@testing-library/react';

// Smoke test proving the jsdom + RTL harness transforms real JSX (via
// @babel/preset-react in the jest babel env). This is the prerequisite for the
// WS-4 memo/render-count tests (U12/U13) that render JSX components.
test('renders a trivial JSX component into the DOM', () => {
  const Hello = () => <div>harness ok</div>;
  render(<Hello />);
  expect(screen.getByText('harness ok')).toBeInTheDocument();
});
