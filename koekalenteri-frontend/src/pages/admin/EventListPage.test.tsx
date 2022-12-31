import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import theme from '../../assets/Theme'

import { EventListPage } from './EventListPage'

jest.mock('../../api/event')
jest.mock('../../api/judge')

describe('EventListPage', () => {
  it('renders', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <MemoryRouter>
            <SnackbarProvider>
              <EventListPage />
            </SnackbarProvider>
          </MemoryRouter>
        </RecoilRoot>
      </ThemeProvider>,
    )
    expect(container).toMatchSnapshot()
  })
})
