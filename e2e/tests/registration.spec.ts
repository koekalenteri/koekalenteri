import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { readAuditTrail, readRegistration, seedDog, seedEvent, seedOrganizer, seedStaffUser } from '../fixtures/db'
import { sentTo } from '../fixtures/fakes'
import { issue } from '../fixtures/issue'
import { PaymentPage } from '../pages/PaymentPage'
import { RegistrationPage } from '../pages/RegistrationPage'

/**
 * A NOU trial (no classes to pick) of an organizer that takes payments, a dog, and an owner whose
 * address is a staff user's, so the dev stage lets the confirmation through. Fills the form, sends
 * it, and returns the registration the payment page is for.
 */
const register = async (page: Page) => {
  const organizer = await seedOrganizer()
  const event = await seedEvent({
    classes: [],
    eventType: 'NOU',
    organizer: { id: organizer.id, name: organizer.name },
  })
  const dog = await seedDog()
  const owner = await seedStaffUser()

  const form = new RegistrationPage(page)
  await form.goto(event)
  await form.fetchDog(dog)
  await form.fillBreeder('Kennel E2E')
  await form.fillOwner(owner, '401234567')
  await form.acceptTerms()
  await form.submit.click()

  const payment = new PaymentPage(page)
  const key = await payment.registrationKey()
  expect(await readRegistration(key.eventId, key.id)).toMatchObject({ dog: { regNo: dog.regNo } })
  return { key, owner, payment }
}

test.describe('registering and paying', { annotation: issue('KOE-1477'), tag: ['@public', '@payment'] }, () => {
  test('a paid registration is stored as paid, confirmed by email and shown as paid', async ({ page }) => {
    const { key, owner, payment } = await register(page)

    await payment.payAtBank('Maksa')

    await expect(page.getByRole('main').getByText('Olen maksanut')).toBeVisible()
    await expect(page.getByRole('main')).toContainText(/Maksettu\s*50,00\s*€/)
    expect(await readRegistration(key.eventId, key.id)).toMatchObject({ paidAmount: 50, paymentStatus: 'SUCCESS' })
    const templates = (await sentTo(owner.email)).map((message) => message.template)
    expect(templates).toContain('registration-e2e-fi')
    expect(templates).toContain('receipt-e2e-fi')
  })

  test('a cancelled payment leaves the registration unpaid and offers the methods again', async ({ page }) => {
    const { key, owner, payment } = await register(page)

    await payment.payAtBank('Peruuta')

    await expect(page.getByRole('heading', { name: 'Valitse maksutapa' })).toBeVisible()
    const registration = await readRegistration(key.eventId, key.id)
    expect(registration?.paymentStatus).not.toBe('SUCCESS')
    expect(registration?.paidAt).toBeUndefined()
    expect((await sentTo(owner.email)).map((message) => message.template)).not.toContain('receipt-e2e-fi')

    // The cancel is written by both the provider's own callback and the client's return, racing on
    // the same transaction: only one settles it (rule 5, KOE-1529).
    const audit = await readAuditTrail(key.eventId, key.id)
    expect(audit.filter((row) => row.messageKey === 'audit.messages.paymentFailed')).toHaveLength(1)
  })

  // Paytrail's own delivery is at-least-once, not exactly-once: the fake bank fires the cancel
  // callback twice for this one outcome. Whichever of the two reaches the step first settles the
  // transaction; the other finds it already gone (KOE-1529).
  test('a cancel callback Paytrail delivers twice still settles once', async ({ page }) => {
    const { key, owner, payment } = await register(page)

    await payment.payAtBank('Peruuta (kahdesti)')

    await expect(page.getByRole('heading', { name: 'Valitse maksutapa' })).toBeVisible()
    const registration = await readRegistration(key.eventId, key.id)
    expect(registration?.paymentStatus).not.toBe('SUCCESS')
    expect((await sentTo(owner.email)).map((message) => message.template)).not.toContain('receipt-e2e-fi')

    const audit = await readAuditTrail(key.eventId, key.id)
    expect(audit.filter((row) => row.messageKey === 'audit.messages.paymentFailed')).toHaveLength(1)
  })

  test('a cancelled payment followed by a successful one leaves one failure and one payment on the trail', async ({
    page,
  }) => {
    const { key, owner, payment } = await register(page)

    await payment.payAtBank('Peruuta')
    await expect(page.getByRole('heading', { name: 'Valitse maksutapa' })).toBeVisible()

    await payment.payAtBank('Maksa')

    await expect(page.getByRole('main').getByText('Olen maksanut')).toBeVisible()
    const registration = await readRegistration(key.eventId, key.id)
    expect(registration).toMatchObject({ paidAmount: 50, paymentStatus: 'SUCCESS' })
    // The failed attempt's id is no longer open once a later one is: the old attempt never comes
    // back to hold the row pending once something new has paid it (rule 3, KOE-1529).
    expect(registration?.openPayments ?? []).toHaveLength(0)

    const audit = await readAuditTrail(key.eventId, key.id)
    expect(audit.filter((row) => row.messageKey === 'audit.messages.paymentFailed')).toHaveLength(1)
    expect(audit.filter((row) => row.messageKey === 'audit.messages.payment')).toHaveLength(1)
    expect((await sentTo(owner.email)).map((message) => message.template)).toContain('receipt-e2e-fi')
  })

  test('a return signed with the wrong secret is not taken as a payment', {
    annotation: issue('KOE-1484', 'the page still says the payment is being verified'),
  }, async ({ page }) => {
    const { key, owner, payment } = await register(page)

    await payment.payAtBank('Väärennetty paluu')

    // The page stays in "verifying"; neither the callback nor the verify call accepts the signature.
    await expect(page.getByRole('main').getByText(/^Maksu vastaanotettu, vahvistetaan vielä/)).toBeVisible()
    await expect(page.getByRole('main').getByText('Olen maksanut')).toBeHidden()
    const registration = await readRegistration(key.eventId, key.id)
    expect(registration?.paymentStatus).not.toBe('SUCCESS')
    expect(registration?.paidAt).toBeUndefined()
    expect((await sentTo(owner.email)).map((message) => message.template)).not.toContain('receipt-e2e-fi')
  })
})
