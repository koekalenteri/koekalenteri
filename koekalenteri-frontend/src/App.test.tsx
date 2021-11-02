import { render, screen } from '@testing-library/react';
import App from './App';
import { MemoryRouter } from 'react-router-dom';

jest.mock('./api/event');
jest.mock('./api/judge');
jest.mock('./api/organizer');

test('renders logo with proper ALT', () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );
  const imgElement = screen.getByAltText('Suomen noutajakoirajärjestö');
  expect(imgElement).toBeInTheDocument();
});

test('renders event page', async () => {
  const {findByText, getByRole} = render(
    <MemoryRouter initialEntries={['/event/test2']}>
      <App />
    </MemoryRouter>
  );
  const spinner = getByRole('progressbar');
  expect(spinner).toBeInTheDocument();
  const organizer = await findByText(/Test org/);
  expect(organizer).toBeInTheDocument();
  expect(spinner).not.toBeInTheDocument();
});
