import type { Locator, Page } from '@playwright/test'
import type { JsonConfirmedEvent, JsonDog } from '../../src/types'

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
   * The grid of a group, `ti 13.10. aamupäivä`, or of the registered but not yet placed,
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
