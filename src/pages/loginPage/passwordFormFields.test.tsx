import { I18n } from '@aws-amplify/core'
import { screen } from '@testing-library/react'
import { openRoute, setUpAuthenticator, user } from './authenticatorRoutes'
import { passwordFormFields } from './passwordFormFields'

/** What a reader and the browser get from each field of the open form, in the order drawn. */
const drawnFields = () =>
  [...document.querySelectorAll('input')].map((input) => ({
    autocomplete: input.getAttribute('autocomplete'),
    label: input.labels?.[0]?.textContent,
    name: input.name,
    placeholder: input.placeholder,
    required: input.required,
    type: input.type,
  }))

const showPasswordLabels = () =>
  screen.queryAllByRole('switch').map((button) => [button.getAttribute('aria-label'), button.textContent])

describe('passwordFormFields', () => {
  setUpAuthenticator()

  it.each(['signIn', 'signUp', 'forceNewPassword', 'confirmResetPassword'] as const)(
    'keeps the fields Amplify draws on %s and names their password switch in Finnish',
    async (route) => {
      const amplify = await openRoute(route)
      const amplifyFields = drawnFields()
      expect(showPasswordLabels()).toContainEqual(['Show password', 'Password is hidden'])
      amplify.unmount()

      await openRoute(route, passwordFormFields())

      expect(drawnFields()).toEqual(amplifyFields)
      const labels = showPasswordLabels()
      expect(labels.length).toBeGreaterThan(0)
      expect(labels).toEqual(labels.map(() => ['Näytä salasana', 'Salasana on piilotettu']))
    }
  )

  it('announces a shown password in Finnish', async () => {
    await openRoute('signIn', passwordFormFields())

    await user.click(screen.getByRole('switch', { name: 'Näytä salasana' }))

    expect(screen.getByRole('switch', { name: 'Näytä salasana' })).toHaveTextContent('Salasana näkyy')
  })

  it('keeps the English labels in English', () => {
    I18n.setLanguage('en')

    expect(passwordFormFields().signIn?.password).toMatchObject({
      passwordIsHiddenLabel: 'Password is hidden',
      passwordIsShownLabel: 'Password is shown',
      showPasswordButtonLabel: 'Show password',
    })
  })
})
