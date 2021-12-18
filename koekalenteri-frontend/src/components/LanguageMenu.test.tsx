import { fireEvent, render, within, screen } from '@testing-library/react';
import { LanguageMenu } from './LanguageMenu';

test('It should render the button', () => {
  render(<LanguageMenu />);
  expect(screen.getByTestId('LanguageIcon')).toBeInTheDocument();
});

test('It should render the menu', () => {
  render(<LanguageMenu />);

  fireEvent.click(screen.getByTestId('LanguageIcon'));
  const menu = screen.getByRole('menu');

  expect(menu).toBeVisible();
  expect(within(menu).getByText(/In English/i)).toBeInTheDocument();
  expect(within(menu).getByText(/Suomeksi/i)).toBeInTheDocument();
});

test('It should change the language', () => {
  render(<LanguageMenu />);

  expect(localStorage.getItem('i18nextLng')).toEqual('fi');

  fireEvent.click(screen.getByTestId('LanguageIcon'));
  const menu = screen.getByRole('menu');

  expect(within(menu).getByText(/In English/i)).not.toHaveClass('Mui-selected');
  expect(within(menu).getByText(/Suomeksi/i)).toHaveClass('Mui-selected');

  fireEvent.click(within(menu).getByText(/In English/i));

  expect(menu).not.toBeVisible();
  expect(within(menu).getByText(/English/i)).toHaveClass('Mui-selected');
  expect(within(menu).getByText(/Suomeksi/i)).not.toHaveClass('Mui-selected');

  expect(localStorage.getItem('i18nextLng')).toEqual('en');

  localStorage.setItem('i18nextLng', 'fi');
});
