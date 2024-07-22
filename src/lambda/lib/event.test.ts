import { formatGroupAuditInfo } from './event'

describe('formatGroupAuditInfo', () => {
  it('should format properly', () => {
    expect(formatGroupAuditInfo({ key: 'cancelled', number: 5 })).toEqual('Peruneet #5')
    expect(formatGroupAuditInfo({ key: 'reserve', number: 1 })).toEqual('Ilmoittautuneet #1')
    expect(
      formatGroupAuditInfo({ key: '2024-08-02-ip', date: '2024-08-02T21:00:00.000Z', number: 20, time: 'ip' })
    ).toEqual('la 3.8. ip #20')
  })
})
