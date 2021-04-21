import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders logo with proper ALT', () => {
  render(<App />);
  const imgElement = screen.getByAltText('Suomen noutajakoirajärjestö');
  expect(imgElement).toBeInTheDocument();
});
