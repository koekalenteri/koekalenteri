import type { TFunction } from 'i18next'
import type { PublicConfirmedEvent } from '../../types/Event'
import type { PublicRegistration } from '../../types/Registration'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { judgeName } from '../../lib/judge'
import { CancelledRegistration } from './CancelledRegistration'
import { ClassHeader } from './ClassHeader'
import { DateHeader } from './DateHeader'
import { RegistrationDetails } from './RegistrationDetails'
import { TimeHeader } from './TimeHeader'

interface ParticipantListProps {
  participants: PublicRegistration[]
  event: PublicConfirmedEvent
}

export const ParticipantList = ({ participants, event }: ParticipantListProps) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copyText = useMemo(() => formatStartList(participants, event, t), [event, participants, t])
  let lastDate: Date | undefined
  let lastClass: PublicRegistration['class']
  let lastTime: string | undefined
  let index = 0

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button
          onClick={() => {
            void navigator.clipboard?.writeText(copyText).then(() => setCopied(true))
          }}
          size="small"
          startIcon={<ContentCopyOutlined />}
          variant="outlined"
        >
          {copied ? t('startListCopied') : t('copyStartList')}
        </Button>
      </Box>
      <Table size="small">
        <TableBody>
          {participants.map((reg) => {
            const result: JSX.Element[] = []

            // Add date header if date changed
            if (reg.group.date?.valueOf() !== lastDate?.valueOf()) {
              const date = reg.group.date ?? event?.startDate ?? new Date()
              result.push(<DateHeader key={date.toISOString()} date={date} />)
              lastDate = reg.group.date
              lastTime = undefined
              index = 0
            }

            // Add class header if class changed
            if (lastClass !== reg.class) {
              if (reg.class) {
                result.push(<ClassHeader key={reg.class} classValue={reg.class} event={event} lastDate={lastDate} />)
              }
              lastClass = reg.class
              index = 0
            }

            // Add time header if time changed
            if (lastTime !== reg.group.time) {
              if (reg.group.time) {
                result.push(
                  <TimeHeader
                    key={`${lastDate?.toISOString()} ${reg.group.time}`}
                    time={reg.group.time}
                    lastDate={lastDate}
                  />
                )
              }
              lastTime = reg.group.time
              index = 0
            }

            // Add registration details
            if (reg.cancelled) {
              result.push(
                <CancelledRegistration key={`cancelled-${reg.group.number}`} groupNumber={reg.group.number} />
              )
            } else {
              result.push(<RegistrationDetails key={`reg-${reg.group.number}`} registration={reg} index={index} />)
              index++
            }

            return result
          })}
        </TableBody>
      </Table>
    </>
  )
}

function formatStartList(participants: PublicRegistration[], event: PublicConfirmedEvent, t: TFunction) {
  let lastDate: Date | undefined
  let lastClass: PublicRegistration['class']
  let lastTime: string | undefined
  const lines: string[] = []

  participants.forEach((reg) => {
    if (reg.group.date?.valueOf() !== lastDate?.valueOf()) {
      const date = reg.group.date ?? event.startDate
      if (lines.length) lines.push('')
      lines.push(`${t('dateFormat.weekday', { date })} ${t('dateFormat.date', { date })}`)
      lastDate = reg.group.date
      lastTime = undefined
    }

    if (lastClass !== reg.class) {
      if (reg.class) {
        const judges = event.classes
          .filter((c) => c.class === reg.class && c.date?.valueOf() === lastDate?.valueOf())
          .map((c) => (Array.isArray(c.judge) ? c.judge.map((j) => judgeName(j, t)).join(', ') : judgeName(c.judge, t)))
          .filter(Boolean)
          .join(', ')
        lines.push([reg.class, judges].filter(Boolean).join(' '))
      }
      lastClass = reg.class
    }

    if (lastTime !== reg.group.time) {
      if (reg.group.time) lines.push(t(`registration.timeLong.${reg.group.time}`))
      lastTime = reg.group.time
    }

    lines.push(formatRegistration(reg, t))
  })

  return lines.join('\n')
}

function formatRegistration(reg: PublicRegistration, t: TFunction) {
  if (reg.cancelled) return `${reg.group.number}. PERUTTU`

  const breed =
    reg.dog.breedCode && reg.dog.gender
      ? t(`${reg.dog.breedCode}.${reg.dog.gender}`, {
          defaultValue: reg.dog.breedCode,
          ns: 'breedAbbr',
        })
      : ''
  const ownerHandler = reg.ownerHandles ? `om. & ohj. ${reg.owner}` : `om. ${reg.owner}, ohj. ${reg.handler}`
  const dog = [breed, reg.dog.titles, reg.dog.name, reg.dog.regNo].filter(Boolean).join(' ')

  return [
    `${reg.group.number}. ${dog} s. ${reg.dog.dob ? t('dateFormat.date', { date: reg.dog.dob }) : '?'}`,
    `(i. ${reg.dog.sire?.titles ?? ''} ${reg.dog.sire?.name ?? ''}, e. ${reg.dog.dam?.titles ?? ''} ${
      reg.dog.dam?.name ?? ''
    })`,
    `${ownerHandler}, kasv. ${reg.breeder}`,
  ].join('\n')
}
