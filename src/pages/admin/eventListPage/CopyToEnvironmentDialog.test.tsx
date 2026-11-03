import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { APIError } from '@/api/http'
import { describeWithTranslations } from '@/test-utils/language'
import CopyToEnvironmentDialog from './CopyToEnvironmentDialog'

vi.mock('react-i18next', async (importOriginal) =>
  (await import('@/test-utils/language')).spyOnUseTranslation(importOriginal)
)

const renderDialog = (onCopy = vi.fn(), targets: string[] = ['test', 'dev']) => {
  const onClose = vi.fn()
  render(
    <CopyToEnvironmentDialog eventName="NOME-B Kangasala" onClose={onClose} onCopy={onCopy} open targets={targets} />
  )
  return { onClose, onCopy }
}

describe('CopyToEnvironmentDialog', () => {
  it('copies to the chosen environment and names the judges the target cannot use (KOE-1471)', async () => {
    const user = userEvent.setup()
    const { onCopy } = renderDialog(
      vi.fn().mockResolvedValue({
        eventId: 'copy-1',
        judges: [{ name: 'Tuomo Tuomari', reason: 'missing' }],
        target: 'dev',
      })
    )

    expect(screen.getByText('eventCopy.notes.people')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'eventCopy.target.dev' }))
    await user.click(screen.getByRole('button', { name: 'eventCopy.copy' }))

    expect(onCopy).toHaveBeenCalledWith('dev')
    expect(await screen.findByText('eventCopy.done.dev')).toBeInTheDocument()
    expect(screen.getByText('Tuomo Tuomari: eventCopy.judgeReason.missing')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'eventCopy.copy' })).not.toBeInTheDocument()
  })

  it('preselects the only target there is', async () => {
    const user = userEvent.setup()
    const { onCopy } = renderDialog(vi.fn().mockResolvedValue({ eventId: 'copy-1', judges: [], target: 'test' }), [
      'test',
    ])

    expect(screen.getByRole('radio', { name: 'eventCopy.target.test' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'eventCopy.copy' }))

    expect(onCopy).toHaveBeenCalledWith('test')
    expect(await screen.findByText('eventCopy.done.test')).toBeInTheDocument()
  })

  it("shows the server's reason when the copy is refused", async () => {
    const user = userEvent.setup()
    renderDialog(
      vi.fn().mockRejectedValue(
        new APIError(new Response(null, { status: 502 }), {
          message: 'The target refused the copy: The copier is not an admin in the target environment',
        })
      )
    )

    await user.click(screen.getByRole('button', { name: 'eventCopy.copy' }))

    // The test translations name the interpolated values; the visual test shows the message itself
    expect(await screen.findByText('eventCopy.failed message')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventCopy.copy' })).toBeEnabled()
  })

  describeWithTranslations('en', () => {
    it.each([
      ['the general reason to a failure the server keeps to itself (KOE-1622)', '', 'Something went wrong.'],
      ['the status text of a failure that has one', 'timeout loading /x', 'timeout loading /x'],
    ])('gives %s', async (_name, statusText, reason) => {
      const user = userEvent.setup()
      renderDialog(
        vi.fn().mockRejectedValue(
          new APIError(new Response(null, { status: 500, statusText }), {
            error: 'Internal server error',
            requestId: 'req-1',
          })
        )
      )

      await user.click(screen.getByRole('button', { name: 'Copy' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(`Copying failed: ${reason}`)
    })
  })

  it('names the copy the target already holds when it refuses a second one (KOE-1639)', async () => {
    const user = userEvent.setup()
    renderDialog(
      vi.fn().mockRejectedValue(
        new APIError(new Response(null, { status: 409 }), {
          error: 'alreadyCopied',
          existing: { eventId: 'copy-0', name: '[Kopio: prod] NOME-B Kangasala' },
          message: 'The target already holds a copy of this event: [Kopio: prod] NOME-B Kangasala',
        })
      )
    )

    await user.click(screen.getByRole('button', { name: 'eventCopy.copy' }))

    expect(await screen.findByText('eventCopy.alreadyCopied name')).toBeInTheDocument()
    expect(screen.queryByText('eventCopy.failed message')).not.toBeInTheDocument()
  })

  it('closes without copying', async () => {
    const user = userEvent.setup()
    const { onClose, onCopy } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'cancel' }))

    expect(onClose).toHaveBeenCalled()
    expect(onCopy).not.toHaveBeenCalled()
  })
})
