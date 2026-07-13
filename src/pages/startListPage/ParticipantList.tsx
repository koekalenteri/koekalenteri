import type { TFunction } from 'i18next'
import type { EventClass, PublicConfirmedEvent } from '../../types/Event'
import type { PublicRegistration } from '../../types/Registration'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isStartListAvailableForClass, isStartListPublishedForClass } from '../../lib/event'
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

type StartListItem =
  | { date: Date; order: number; registration: PublicRegistration; type: 'registration' }
  | { date: Date; eventClass: EventClass; order: number; type: 'emptyClass' }

export const ParticipantList = ({ participants, event }: ParticipantListProps) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copyText = useMemo(() => formatStartList(participants, event, t), [event, participants, t])
  const startListItems = useMemo(() => getStartListItems(participants, event), [event, participants])
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
          {startListItems.map((item) => {
            const result: JSX.Element[] = []
            const date = item.date

            // Add date header if date changed
            if (date.valueOf() !== lastDate?.valueOf()) {
              result.push(<DateHeader key={date.toISOString()} date={date} />)
              lastDate = date
              lastClass = undefined
              lastTime = undefined
              index = 0
            }

            if (item.type === 'emptyClass') {
              result.push(
                <ClassHeader
                  key={`empty-${item.eventClass.class}-${item.date.valueOf()}`}
                  classValue={item.eventClass.class}
                  event={event}
                  lastDate={item.date}
                  published={isStartListPublishedForClass(event, item.eventClass.class)}
                />
              )
              lastClass = item.eventClass.class
              lastTime = undefined
              index = 0
              return result
            }

            const reg = item.registration

            // Add class header if class changed
            if (lastClass !== reg.class) {
              if (reg.class) {
                result.push(
                  <ClassHeader
                    key={`${reg.class}-${date.valueOf()}`}
                    classValue={reg.class}
                    event={event}
                    lastDate={lastDate}
                  />
                )
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

  getStartListItems(participants, event).forEach((item) => {
    const date = item.date
    if (date.valueOf() !== lastDate?.valueOf()) {
      if (lines.length) lines.push('')
      lines.push(`${t('dateFormat.weekday', { date })} ${t('dateFormat.date', { date })}`)
      lastDate = date
      lastClass = undefined
      lastTime = undefined
    }

    if (item.type === 'emptyClass') {
      const judges = formatClassJudges(event, item.eventClass.class, item.date, t)
      const note = isStartListPublishedForClass(event, item.eventClass.class) ? '' : `(${t('startListNotPublished')})`
      lines.push([item.eventClass.class, judges, note].filter(Boolean).join(' '))
      lastClass = item.eventClass.class
      lastTime = undefined
      return
    }

    const reg = item.registration

    if (lastClass !== reg.class) {
      if (reg.class) {
        const judges = formatClassJudges(event, reg.class, date, t)
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

function getStartListItems(participants: PublicRegistration[], event: PublicConfirmedEvent): StartListItem[] {
  const participantClassDates = new Set(
    participants.map((reg) => classDateKey(reg.class, reg.group.date ?? event.startDate))
  )
  const includedClasses = new Set<string>()
  const registrations = participants.map<StartListItem>((registration, order) => ({
    date: registration.group.date ?? event.startDate,
    order,
    registration,
    type: 'registration',
  }))
  const emptyClasses = event.classes.flatMap<StartListItem>((eventClass, order) => {
    const date = eventClass.date ?? event.startDate
    const key = classDateKey(eventClass.class, date)
    if (
      includedClasses.has(key) ||
      participantClassDates.has(key) ||
      !isStartListAvailableForClass(event, eventClass)
    ) {
      return []
    }
    includedClasses.add(key)
    return [{ date, eventClass, order: participants.length + order, type: 'emptyClass' }]
  })

  return registrations.concat(emptyClasses).sort((a, b) => {
    const dateDiff = a.date.valueOf() - b.date.valueOf()
    if (dateDiff) return dateDiff

    const classDiff = startListItemClass(a).localeCompare(startListItemClass(b))
    if (classDiff) return classDiff

    const timeDiff = startListItemTime(a).localeCompare(startListItemTime(b))
    if (timeDiff) return timeDiff

    const numberDiff = startListItemNumber(a) - startListItemNumber(b)
    return numberDiff || a.order - b.order
  })
}

function startListItemClass(item: StartListItem): string {
  return item.type === 'emptyClass' ? item.eventClass.class : (item.registration.class ?? '')
}

function startListItemTime(item: StartListItem): string {
  return item.type === 'registration' ? (item.registration.group.time ?? '') : ''
}

function startListItemNumber(item: StartListItem): number {
  return item.type === 'registration' ? item.registration.group.number : Number.MAX_SAFE_INTEGER
}

function classDateKey(classValue: string | null | undefined, date: Date | undefined): string {
  return `${classValue ?? ''}:${date?.valueOf() ?? ''}`
}

function formatClassJudges(event: PublicConfirmedEvent, eventClass: string, date: Date | undefined, t: TFunction) {
  return event.classes
    .filter((c) => c.class === eventClass && c.date?.valueOf() === date?.valueOf())
    .map((c) => (Array.isArray(c.judge) ? c.judge.map((j) => judgeName(j, t)).join(', ') : judgeName(c.judge, t)))
    .filter(Boolean)
    .join(', ')
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
