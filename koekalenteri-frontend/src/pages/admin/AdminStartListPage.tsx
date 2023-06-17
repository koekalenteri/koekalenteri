import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import { Registration, RegistrationTime } from 'koekalenteri-shared/model'
import { useRecoilValue } from 'recoil'

import { Path } from '../../routeConfig'
import { eventByIdSelector, hasAdminAccessSelector } from '../recoil'

import { eventRegistrationsAtom } from './recoil'

type GroupedRegs = Record<string, Record<string, Record<string, Registration[]>>>

export default function AdminStartListPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const hasAccess = useRecoilValue(hasAdminAccessSelector)
  const params = useParams()
  const eventId = params.id ?? ''
  const event = useRecoilValue(eventByIdSelector(eventId))
  const allRegistrations = useRecoilValue(eventRegistrationsAtom(eventId))
  const regsToPrint = allRegistrations.filter((reg) => !reg.cancelled)
  const nameLen = regsToPrint.reduce((acc, reg) => Math.min(38, Math.max(acc, reg.dog.name?.length ?? 0)), 0)
  const grouped = regsToPrint.reduce<GroupedRegs>((acc, reg) => {
    const date = reg.group?.date ? t('dateFormat.wdshort', { date: reg.group.date }) : 'xx-varalla'
    const cls = reg.class ?? event?.eventType ?? ''
    const time = reg.group?.time ?? ''
    acc[date] = acc[date] ?? []
    acc[date][cls] = acc[date][cls] ?? []
    acc[date][cls][time] = acc[date][cls][time] ?? []
    acc[date][cls][time].push(reg)
    return acc
  }, {})
  const dates = Object.keys(grouped)
  dates.sort()

  if (!hasAccess) {
    return <Navigate to={Path.login} state={{ from: location }} replace />
  }

  return (
    <Box p={1}>
      <pre style={{ fontSize: 12, lineHeight: 1, letterSpacing: 1, margin: 0, padding: '8px' }}>
        {dates.map((d) => (
          <>
            {d.replace('xx-', '').padEnd(100, '-')}
            {'\n\n'}
            {Object.keys(grouped[d]).map((c) => (
              <>
                {Object.keys(grouped[d][c]).map((tm) => (
                  <>
                    {c + (tm ? ' - ' + t(`registration.timeLong.${tm as RegistrationTime}`) : '')}
                    {'\n'}
                    {grouped[d][c][tm].map((reg) => (
                      <>
                        {'\n'}
                        {reg.group?.number.toString().padStart(5)}
                        {'., '}
                        {reg.dog.breedCode && reg.dog.gender
                          ? t(`${reg.dog.breedCode}.${reg.dog.gender}`, {
                              ns: 'breedAbbr',
                              defaultValue: reg.dog.breedCode,
                            })
                          : ''}
                        {', '}
                        {reg.dog.name?.slice(0, nameLen).padEnd(nameLen)}, {reg.dog.regNo}
                        {', s. '}
                        {t('dateFormat.isodate', { date: reg.dog.dob })}
                        {', siru '}
                        {reg.dog.rfid}
                        {'\n\n        ohj. '}
                        {reg.handler.name}, {reg.handler.phone ?? '-ei puhelinta-'}
                        {d.startsWith('xx-')
                          ? ', ' +
                            reg.handler.location +
                            (reg.reserve ? ', ' + t(`registration.reserveChoises.${reg.reserve}`) : '')
                          : ''}
                        {'\n\n'}
                      </>
                    ))}
                  </>
                ))}
              </>
            ))}
          </>
        ))}
      </pre>
    </Box>
  )
}
