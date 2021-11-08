import { fireEvent, render, within } from '@testing-library/react';
import { LanguageMenu } from './LanguageMenu';

test('It should render the button', () => {
  const {getByTestId} = render(<LanguageMenu />);
  expect(getByTestId('LanguageIcon')).toBeInTheDocument();
});

test('It should render the menu', () => {
  const {getByTestId, getByRole} = render(<LanguageMenu />);

  fireEvent.click(getByTestId('LanguageIcon'));
  const menu = getByRole('menu');

  expect(menu).toBeVisible();
  expect(within(menu).getByText(/English/i)).toBeInTheDocument();
  expect(within(menu).getByText(/Suomi/i)).toBeInTheDocument();
});

test('It should change the language', () => {
  const { getByTestId, getByRole } = render(<LanguageMenu />);

  expect(localStorage.getItem('i18nextLng')).toEqual('fi');

  fireEvent.click(getByTestId('LanguageIcon'));
  const menu = getByRole('menu');

  expect(menu.querySelector('.Mui-selected')).toHaveTextContent('Suomi');

  fireEvent.click(within(menu).getByText(/English/i));

  expect(menu).not.toBeVisible();
  expect(menu.querySelector('.Mui-selected')).toHaveTextContent('English');

  expect(localStorage.getItem('i18nextLng')).toEqual('en');

  localStorage.setItem('i18nextLng', 'fi');
});
