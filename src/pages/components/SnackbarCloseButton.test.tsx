import type { SnackbarKey } from 'notistack'
import { fireEvent, render, screen, waitForElementToBeRemoved } from '@testing-library/react'
import { SnackbarProvider, useSnackbar } from 'notistack'
import { useEffect } from 'react'
import SnackbarCloseButton from './SnackbarCloseButton'

const closeAction = (snackbarKey: SnackbarKey) => <SnackbarCloseButton snackbarKey={snackbarKey} />

const Notice = () => {
  const { enqueueSnackbar } = useSnackbar()
  useEffect(() => {
    enqueueSnackbar('Saved')
  }, [enqueueSnackbar])
  return null
}

describe('SnackbarCloseButton', () => {
  it('is named for screen readers and closes its snackbar', async () => {
    render(
      <SnackbarProvider action={closeAction} autoHideDuration={null}>
        <Notice />
      </SnackbarProvider>
    )
    expect(await screen.findByText('Saved')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'close' }))

    await waitForElementToBeRemoved(() => screen.queryByText('Saved'))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})
