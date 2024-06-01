import { fireEvent, render, screen, within } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import LanguageMenu from './LanguageMenu'

test('It should render the button', () => {
  render(
    <RecoilRoot>
      <LanguageMenu />
    </RecoilRoot>
  )
  expect(screen.getByTestId('LanguageIcon')).toBeInTheDocument()
})

test('It should render the menu', () => {
  render(
    <RecoilRoot>
      <LanguageMenu />
    </RecoilRoot>
  )

  fireEvent.click(screen.getByTestId('LanguageIcon'))
  const menu = screen.getByRole('menu')

  expect(menu).toBeVisible()
  expect(within(menu).getByText('locale.en')).toBeInTheDocument()
  expect(within(menu).getByText('locale.fi')).toBeInTheDocument()
})

test('It should change the language', () => {
  render(
    <RecoilRoot>
      <LanguageMenu />
    </RecoilRoot>
  )

  expect(localStorage.getItem('i18nextLng')).toBeNull() // toEqual('fi')

  fireEvent.click(screen.getByTestId('LanguageIcon'))
  const menu = screen.getByRole('menu')

  expect(within(menu).getByText('locale.en')).not.toHaveClass('Mui-selected')
  expect(within(menu).getByText('locale.fi')).toHaveClass('Mui-selected')

  fireEvent.click(within(menu).getByText('locale.en'))

  expect(menu).not.toBeVisible()
  expect(within(menu).getByText('locale.en')).toHaveClass('Mui-selected')
  expect(within(menu).getByText('locale.fi')).not.toHaveClass('Mui-selected')

  expect(localStorage.getItem('language')).toEqual('"en"')

  localStorage.setItem('language', '"fi"')
})
