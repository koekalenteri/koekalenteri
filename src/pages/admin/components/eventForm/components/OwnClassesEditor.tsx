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
import { enteredClassCodes, ownClassErrors } from '@/lib/eventClass'
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
  /** The event has entries by its own count, which the class days may not show yet. */
  readonly hasEntries?: boolean
  /**
   * The classes the event's registrations are in, cancelled ones too, which the class days' counts
   * leave out: the save reads every registration (KOE-674).
   */
  readonly enteredClasses?: readonly string[]
  readonly onChange: (change: OwnClassesChange) => void
}

const changeOf = (classes: EventClass[], ownClasses: OwnClass[]): OwnClassesChange => ({
  classes,
  ownClasses: ownClasses.length ? ownClasses : null,
})

const daysOf = (classes: readonly EventClass[], code: string) => classes.some((eventClass) => eventClass.class === code)

/**
 * A row of the editor: an id of its own, as its code changes while it is typed, and the code its class
 * days are stored under. The two codes part while the row's code is one another row holds: typing OPEN2
 * passes through OPEN, and that row's days stay its own.
 */
interface Row {
  id: string
  dayCode: string
}

const rowOf = (code: string): Row => ({ dayCode: code, id: nanoid() })

/**
 * The rows with their day codes paired to the codes they show where two rows traded codes: a row whose
 * code another row keeps its days under, while that row shows another code, takes those days, and the
 * other row its. Days belong to the code a class day names, so after a trade each row has the days of
 * the code it shows, and a later rename moves those.
 */
const rePaired = (rows: readonly Row[], codes: readonly string[]): Row[] => {
  const paired = [...rows]
  paired.forEach((row, at) => {
    const code = codes[at]
    if (!code || row.dayCode === code) return
    const other = paired.findIndex((item, index) => index !== at && item.dayCode === code && codes[index] !== code)
    if (other === -1) return
    paired[at] = { ...row, dayCode: paired[other].dayCode }
    paired[other] = { ...paired[other], dayCode: row.dayCode }
  })
  return paired
}

/**
 * Where a row's days go when its code becomes `to` (KOE-674). `held` is every code another row shows or
 * keeps its days under. Days move only out of a code no other row holds, and only into a code free of
 * other rows and of days, so no two rows' days are ever merged or taken: a blocked row keeps its days
 * where they are, and they follow it once its code is free. A code cleared takes its days along, and
 * on a trial of one day a code that comes to have no day gets the day at once.
 */
const movedDays = (
  event: OwnClassesEvent,
  held: ReadonlySet<string>,
  row: Row,
  to: string
): { classes: EventClass[]; dayCode: string } => {
  const own = row.dayCode
  const ownsDays = !!own && !held.has(own)
  if (!to) {
    return {
      classes: ownsDays ? event.classes.filter((eventClass) => eventClass.class !== own) : [...event.classes],
      dayCode: '',
    }
  }
  if (to === own) return { classes: [...event.classes], dayCode: own }
  if (held.has(to) || daysOf(event.classes, to)) return { classes: [...event.classes], dayCode: own }
  const classes = ownsDays
    ? event.classes.map((eventClass) => (eventClass.class === own ? { ...eventClass, class: to } : eventClass))
    : [...event.classes]
  return {
    classes:
      event.startDate === event.endDate && !daysOf(classes, to)
        ? [...classes, { class: to, date: event.startDate }]
        : classes,
    dayCode: to,
  }
}

/**
 * An unofficial trial's own classes (KOE-674): each with its code, its name in Finnish and in English,
 * and its place in the list, which is the order every view shows them in. The first one added takes
 * the trial off the official classes, so their days go, and is not offered while entries hold them; a
 * code changed moves its days, and a class removed takes them along, never another row's
 * (`movedDays`). Its days are chosen among the classes, except on a trial of one day, where a class
 * gets the day as soon as it has a code. A class entries were made in keeps its code. What the save
 * would refuse shows on the row, read by the save's own rule (`ownClassErrors`).
 */
export default function OwnClassesEditor({ event, disabled, enteredClasses, hasEntries, onChange }: Props) {
  const { t } = useTranslation()
  const ownClasses = useMemo(
    () => (event.ownClasses ?? []).map(({ code, name }): OwnClass => ({ code: code ?? '', name: { ...name } })),
    [event.ownClasses]
  )
  // The code changes as it is typed, so a row is known by an id of its own, which moves with it.
  const [rows, setRows] = useState(() => ownClasses.map(({ code }) => rowOf(code)))
  if (rows.length !== ownClasses.length) setRows(ownClasses.map(({ code }, at) => rows[at] ?? rowOf(code)))
  const registered = useMemo(
    () => new Set([...enteredClassCodes(event.classes), ...(enteredClasses ?? [])]),
    [enteredClasses, event.classes]
  )
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

  // The first own class takes away the official classes, which entries already hold: the save would
  // refuse it, so it is not offered.
  const addBlocked = !ownClasses.length && (hasEntries || registered.size > 0)

  const add = () => {
    // The first own class takes the trial off the official classes: their days go.
    const classes = ownClasses.length ? [...event.classes] : []
    setRows([...rows, rowOf('')])
    onChange(changeOf(classes, [...ownClasses, { code: '', name: {} }]))
  }

  /** The codes the other rows show or keep their days under. */
  const heldBesides = (at: number) =>
    new Set(
      ownClasses
        .flatMap(({ code }, index) => (index === at ? [] : [code, rows[index]?.dayCode ?? code]))
        .filter(Boolean)
    )

  const setCode = (at: number, value: string) => {
    const code = value.toUpperCase()
    const row = rows[at] ?? rowOf(ownClasses[at].code)
    const { classes, dayCode } = movedDays(event, heldBesides(at), row, code)
    const next = ownClasses.map((item, index) => (index === at ? { ...item, code } : item))
    setRows(
      rePaired(
        rows.map((item, index) => (index === at ? { ...row, dayCode } : item)),
        next.map((item) => item.code)
      )
    )
    onChange(changeOf(classes, next))
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
    const swapped = [...rows]
    swapped[at] = rows[other]
    swapped[other] = rows[at]
    setRows(swapped)
    onChange(changeOf([...event.classes], next))
  }

  const remove = (at: number) => {
    // The days go with the class, unless another row holds their code and so the days.
    const dayCode = rows[at]?.dayCode ?? ownClasses[at].code
    const shared = !dayCode || heldBesides(at).has(dayCode)
    // The days kept for another row that shows their code are that row's from now on.
    const left = rows
      .filter((_, index) => index !== at)
      .map((row, index) => {
        const code = ownClasses.filter((_, other) => other !== at)[index]?.code
        return shared && dayCode && code === dayCode ? { ...row, dayCode } : row
      })
    setRows(left)
    onChange(
      changeOf(
        shared ? [...event.classes] : event.classes.filter((eventClass) => eventClass.class !== dayCode),
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
          <Stack key={rows[at]?.id ?? item.code} spacing={0.5}>
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
        <Button disabled={disabled || addBlocked} onClick={add} size="small" startIcon={<Add />}>
          {t('event.ownClasses.add')}
        </Button>
      </div>
      {addBlocked && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {t('event.ownClasses.entered')}
        </Typography>
      )}
    </Stack>
  )
}
