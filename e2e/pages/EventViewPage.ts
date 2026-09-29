import type { Locator, Page } from '@playwright/test'
import type { JsonConfirmedEvent, JsonDog } from '../../src/types'

/**
 * A group's title as the view writes it, `ke 14.10. aamupäivä`, for a day in Helsinki time. Derived
 * from the event's date, because the seeded events move with today.
 */
export const groupTitle = (date: string, time: 'ap' | 'ip') => {
  const day = new Intl.DateTimeFormat('fi-FI', {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'Europe/Helsinki',
    weekday: 'short',
  }).format(new Date(date))
  return `${day} ${time === 'ap' ? 'aamupäivä' : 'iltapäivä'}`
}

/** The secretary's view of one event, `/admin/event/view/<id>`: its groups and the waiting list. */
export class EventViewPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto(event: Pick<JsonConfirmedEvent, 'id'>) {
    await this.page.goto(`/admin/event/view/${event.id}`)
    await this.page.getByRole('heading', { name: 'Ilmoittautuneet' }).waitFor()
  }

  /**
   * The grid of a group (see groupTitle), or of the registered but not yet placed,
   * `Ilmoittautuneet`. A group's title is a sibling of its grid, not its label.
   */
  group(title: string): Locator {
    return this.page.getByText(title, { exact: true }).locator('xpath=following::*[@role="grid"][1]')
  }

  /** The dog's row in whichever grid it is in; its name cell is the one thing unique to it. */
  row(dog: Pick<JsonDog, 'name'>, within: Page | Locator = this.page): Locator {
    return within.getByRole('row').filter({ has: this.page.getByRole('gridcell', { exact: true, name: dog.name }) })
  }

  async moveWithDialog(dog: Pick<JsonDog, 'name'>, groupTitle: string) {
    await this.row(dog).getByRole('button', { name: 'lisää' }).click()
    await this.page.getByRole('menuitem', { name: 'Siirrä osallistujiin' }).click()
    const dialog = this.page.getByRole('dialog', { name: `Siirrä koira ${dog.name} ryhmään` })
    await dialog.getByRole('radio', { name: groupTitle }).check()
    await this.saved(() => dialog.getByRole('button', { name: 'Siirrä ryhmään' }).click())
  }

  async drag(dog: Pick<JsonDog, 'name'>, groupTitle: string) {
    await this.saved(() => this.row(dog).dragTo(this.group(groupTitle)))
  }

  /** Runs the action and waits for the groups it changed to be stored. */
  private async saved(action: () => Promise<void>) {
    const stored = this.page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('/admin/reg-groups/')
    )
    await action()
    if (!(await stored).ok()) throw new Error(`storing the groups failed: ${(await stored).status()}`)
  }
}
