import type { DayKey, DeepPartial, EventClass, Language, OwnClass } from '@/types'
import Add from '@mui/icons-material/Add'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import DeleteOutline from '@mui/icons-material/DeleteOutlined'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { nanoid } from 'nanoid'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ownClassErrors } from '@/lib/eventClass'
import { LANGUAGES } from '@/types'

/** What the editor reads of the event: its type, its days, its class days and its own classes. */
interface OwnClassesEvent {
  readonly eventType?: string
  readonly startDate: DayKey
  readonly endDate: DayKey
  readonly classes: readonly EventClass[]
  /** As the form holds them, a class still without its code or name included. */
  readonly ownClasses?: readonly DeepPartial<OwnClass>[] | null
}

/** A change of the own classes, and of the class days that go with them; none left is no list. */
interface OwnClassesChange {
  classes: EventClass[]
  ownClasses: OwnClass[] | null
}

type OwnClassErrorKind = ReturnType<typeof ownClassErrors>[number]['kind']

interface Props {
  readonly event: OwnClassesEvent
  readonly disabled?: boolean
  readonly onChange: (change: OwnClassesChange) => void
}

/**
 * The classes entries were made in (KOE-674): the class days that hold entries. What the save reads
 * from the stored entries, as the form knows it, so a code an entry holds is neither changed nor
 * removed (`ownClassErrors`).
 */
export const registeredClasses = (classes: readonly Pick<EventClass, 'class' | 'entries'>[]) =>
  classes.filter((eventClass) => !!eventClass.entries).map((eventClass) => eventClass.class)

const changeOf = (classes: EventClass[], ownClasses: OwnClass[]): OwnClassesChange => ({
  classes,
  ownClasses: ownClasses.length ? ownClasses : null,
})

/**
 * The class days with an own class's code changed: its days take the new code, and on a trial of one
 * day a class that had no code yet gets the day at once. A code cleared takes its days with it.
 */
const renamedDays = (event: OwnClassesEvent, from: string, to: string): EventClass[] => {
  if (!to) return event.classes.filter((eventClass) => eventClass.class !== from)
  if (from)
    return event.classes.map((eventClass) => (eventClass.class === from ? { ...eventClass, class: to } : eventClass))
  return event.startDate === event.endDate
    ? [...event.classes, { class: to, date: event.startDate }]
    : [...event.classes]
}

/**
 * An unofficial trial's own classes (KOE-674): each with its code, its name in Finnish and in English,
 * and its place in the list, which is the order every view shows them in. The first one added takes
 * the trial off the official classes, so their days go; a code changed moves its days, and a class
 * removed takes them along. Its days are chosen among the classes, except on a trial of one day, where
 * a class gets the day as soon as it has a code. A class entries were made in keeps its code. What the
 * save would refuse shows on the row, read by the save's own rule (`ownClassErrors`).
 */
export default function OwnClassesEditor({ event, disabled, onChange }: Props) {
  const { t } = useTranslation()
  const ownClasses = useMemo(
    () => (event.ownClasses ?? []).map(({ code, name }): OwnClass => ({ code: code ?? '', name: { ...name } })),
    [event.ownClasses]
  )
  // The code changes as it is typed, so a row is known by an id of its own, which moves with it.
  const [rowIds, setRowIds] = useState(() => ownClasses.map(() => nanoid()))
  if (rowIds.length !== ownClasses.length) setRowIds(ownClasses.map((_, at) => rowIds[at] ?? nanoid()))
  const registered = useMemo(() => new Set(registeredClasses(event.classes)), [event.classes])
  const errors = useMemo(
    () =>
      ownClassErrors({ classes: [...event.classes], eventType: event.eventType ?? '', ownClasses }, [...registered]),
    [event.classes, event.eventType, ownClasses, registered]
  )
  const errorsOf = (code: string): OwnClassErrorKind[] => [
    ...new Set(errors.flatMap((error) => ('code' in error && error.code === code ? [error.kind] : []))),
  ]
  // A day of a class the list no longer has, or a class entries were made in that is gone.
  const loose = errors.flatMap((error) =>
    'code' in error && !ownClasses.some(({ code }) => code === error.code) ? [error] : []
  )

  const add = () => {
    // The first own class takes the trial off the official classes: their days go.
    const classes = ownClasses.length ? [...event.classes] : []
    setRowIds([...rowIds, nanoid()])
    onChange(changeOf(classes, [...ownClasses, { code: '', name: {} }]))
  }

  const setCode = (at: number, value: string) => {
    const code = value.toUpperCase()
    const from = ownClasses[at].code
    onChange(
      changeOf(
        renamedDays(event, from, code),
        ownClasses.map((item, index) => (index === at ? { ...item, code } : item))
      )
    )
  }

  const setName = (at: number, language: Language, text: string) => {
    const next = ownClasses.map((item, index) => {
      if (index !== at) return item
      const { [language]: _old, ...name } = item.name
      return { ...item, name: text ? { ...name, [language]: text } : name }
    })
    onChange(changeOf([...event.classes], next))
  }

  const swap = (at: number, other: number) => {
    const next = [...ownClasses]
    next[at] = ownClasses[other]
    next[other] = ownClasses[at]
    const ids = [...rowIds]
    ids[at] = rowIds[other]
    ids[other] = rowIds[at]
    setRowIds(ids)
    onChange(changeOf([...event.classes], next))
  }

  const remove = (at: number) => {
    const { code } = ownClasses[at]
    setRowIds(rowIds.filter((_, index) => index !== at))
    onChange(
      changeOf(
        event.classes.filter((eventClass) => eventClass.class !== code),
        ownClasses.filter((_, index) => index !== at)
      )
    )
  }

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1" component="h3">
        {t('event.ownClasses.title')}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('event.ownClasses.info')}
      </Typography>
      {ownClasses.map((item, at) => {
        const entered = registered.has(item.code)
        const reasons = errorsOf(item.code)
        return (
          <Stack key={rowIds[at] ?? item.code} spacing={0.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flexWrap: 'wrap', pt: 1 }}>
              <TextField
                disabled={disabled || entered}
                error={reasons.some((kind) => kind === 'badCode' || kind === 'typeName' || kind === 'codeTwice')}
                label={t('event.ownClasses.code')}
                onChange={(e) => setCode(at, e.target.value)}
                size="small"
                slotProps={{ htmlInput: { maxLength: 10 } }}
                sx={{ width: 140 }}
                value={item.code}
              />
              {LANGUAGES.map((language) => (
                <TextField
                  key={language}
                  disabled={disabled}
                  error={language === 'fi' && reasons.includes('unnamed')}
                  label={t('event.ownClasses.name', { language: t(`language.${language}`) })}
                  onChange={(e) => setName(at, language, e.target.value)}
                  size="small"
                  value={item.name[language] ?? ''}
                />
              ))}
              <IconButton
                aria-label={t('event.ownClasses.moveUp', { code: item.code })}
                disabled={disabled || at === 0}
                onClick={() => swap(at, at - 1)}
              >
                <ArrowUpward fontSize="small" />
              </IconButton>
              <IconButton
                aria-label={t('event.ownClasses.moveDown', { code: item.code })}
                disabled={disabled || at === ownClasses.length - 1}
                onClick={() => swap(at, at + 1)}
              >
                <ArrowDownward fontSize="small" />
              </IconButton>
              <IconButton
                aria-label={t('event.ownClasses.remove', { code: item.code })}
                disabled={disabled || entered}
                onClick={() => remove(at)}
              >
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Stack>
            {reasons.map((kind) => (
              <Typography key={kind} variant="caption" sx={{ color: 'error.main' }}>
                {t(`event.ownClasses.errors.${kind}`)}
              </Typography>
            ))}
          </Stack>
        )
      })}
      {loose.map((error) => (
        <Typography key={`${error.kind}-${error.code}`} variant="caption" sx={{ color: 'error.main' }}>
          {t(`event.ownClasses.errors.${error.kind}`)}
          {`: ${error.code}`}
        </Typography>
      ))}
      <div>
        <Button disabled={disabled} onClick={add} size="small" startIcon={<Add />}>
          {t('event.ownClasses.add')}
        </Button>
      </div>
    </Stack>
  )
}
