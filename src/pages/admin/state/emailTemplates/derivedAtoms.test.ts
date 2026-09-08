import type { EmailTemplate } from '@/types'
import { createStore } from 'jotai'
import { adminEmailTemplatesAtom } from './atoms'
import { adminEmailTemplateAtom } from './derivedAtoms'

const template = (id: EmailTemplate['id']): EmailTemplate => ({
  createdAt: new Date(),
  createdBy: '',
  en: '',
  fi: '',
  id,
  modifiedAt: new Date(),
  modifiedBy: '',
})

describe('adminEmailTemplateAtom', () => {
  it('serves a template not read before synchronously once the list has loaded', async () => {
    const picked = template('picked')
    const other = template('reserve')

    const store = createStore()
    await store.set(adminEmailTemplatesAtom, [other, picked])

    // A Promise here would suspend the templates page on the first selection of every template.
    expect(store.get(adminEmailTemplateAtom('picked'))).toBe(picked)
  })

  it('serves nothing without a selected id', async () => {
    const store = createStore()
    await store.set(adminEmailTemplatesAtom, [template('picked')])

    expect(store.get(adminEmailTemplateAtom(undefined))).toBeUndefined()
  })
})
