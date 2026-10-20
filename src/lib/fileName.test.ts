import { invitationAttachmentFileName, startListFileName } from './fileName'

describe('fileName', () => {
  it('formats an invitation attachment name using its first class date and class', () => {
    expect(
      invitationAttachmentFileName({
        class: 'ALO',
        dates: [{ date: '2023-02-03' }],
        eventType: 'NOU',
        invitationAttachment: 'attachment-key',
        startDate: '2023-02-01',
      })
    ).toBe('koekutsu-20230203-NOU-ALO.pdf')
  })

  it('formats a start list name using the event date and type', () => {
    expect(startListFileName({ eventType: 'NOME-B', startDate: '2023-02-01' })).toBe(
      'starttilista-20230201-NOME-B.xlsx'
    )
  })
})
