import { selector } from 'recoil'

export interface MessageTemplate {
  name: {
    fi: string
    en: string
  }
}

export const messageTemplatesSelector = selector<MessageTemplate[]>({
  key: 'messageTemaplates',
  get: () => {
    return [
      { name: { fi: 'Varasijailmoitus', en: 'Reserve notification' } },
    ]
  },
})
