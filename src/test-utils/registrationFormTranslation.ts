/**
 * The shared react-i18next mock for the RegistrationForm tests. It prints a key and the names of its
 * options; the amount to pay is the one value those tests read, so its line carries the amount itself,
 * and the locked-change notice is read by its reason and section.
 *
 * Kept apart from ./registrationForm, which loads the form's providers: the mock factory imports this
 * file while react-i18next is being resolved.
 *
 * ```ts
 * vi.mock('react-i18next', async () =>
 *   (await import('../../test-utils/registrationFormTranslation')).mockRegistrationFormTranslation()
 * )
 * ```
 */
export const mockRegistrationFormTranslation = async () => {
  const mocked = await import('../__mocks__/react-i18next')
  return {
    ...mocked,
    useTranslation: () => {
      const translation = mocked.useTranslation()
      const t = (key: string, options: Record<string, unknown> = {}) => {
        if (key.startsWith('registration.paymentToBePaid')) return `${key} ${String(options.amount)}`
        if (key === 'registration.lockedChange') return `${key} ${String(options.reason)} ${String(options.section)}`
        return translation.t(key, options)
      }
      return { ...translation, t }
    },
  }
}
