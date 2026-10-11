import type { ParseKeys } from 'i18next'
import type { AuditRecord } from '@/types'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import { alpha } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/i18n/dates'
import { isDateOnlyString, parseDateOnlyString } from '@/lib/utils'
import CollapsibleSection from '../../components/CollapsibleSection'

interface Props {
  auditTrail?: AuditRecord[]
  readonly fullHeight?: boolean
}

type AuditChange = NonNullable<AuditRecord['changes']>[number]
type AuditChangeValueData = AuditChange['previous']
type AuditDetail = NonNullable<AuditRecord['details']>[number]

type AuditParams = Record<string, unknown>
type GroupSide = 'from' | 'to'

/**
 * The namespaces an audit row may name a translation from: its own messages and the email template,
 * cancellation reason, group and time names it reuses. A key that is missing from the bundle (a row
 * written by a newer backend) is not refused here; every lookup passes the stored text as
 * `defaultValue`, so it reads as it was written.
 */
const AUDIT_TRANSLATION_KEY = /^(audit|emailTemplate|eventManagement|registration)\.[\w.-]+$/

const isAuditTranslationKey = (value: unknown): value is ParseKeys<'translation'> =>
  typeof value === 'string' && AUDIT_TRANSLATION_KEY.test(value)

/**
 * A day parameter. Written as yyyy-MM-dd, it arrives as that string over the WebSocket and as a Date
 * through the API, whose JSON reviver turns a bare day into local noon.
 */
const auditDay = (value: unknown): Date | undefined => {
  if (value instanceof Date) return value
  return isDateOnlyString(value) ? parseDateOnlyString(value) : undefined
}

const useAuditFormatter = () => {
  const { t } = useTranslation()

  /**
   * The parameters as the translation reads them. A `<name>Key` parameter names a translation (the
   * email template, the reason), and its text in the reader's language becomes `<name>`; the value
   * stored under `<name>` is the fallback.
   */
  const translatedParams = (params: AuditParams = {}): AuditParams => {
    const translated: AuditParams = { ...params }
    for (const [name, value] of Object.entries(params)) {
      if (!name.endsWith('Key') || !isAuditTranslationKey(value)) continue
      const target = name.slice(0, -'Key'.length)
      translated[target] = t(value, { defaultValue: String(params[target] ?? '') })
    }
    return translated
  }

  /** A group of a group move, from its parts: a named list ("Registered #1") or a day and time ("Sat 7.11. (pm) #2"). */
  const groupLabel = (params: AuditParams, side: GroupSide) => {
    const number = params[`${side}Number`]
    if (typeof number !== 'number') return ''

    const name = params[`${side}Group`]
    if (typeof name === 'string' && name) return `${name} #${number}`

    const date = auditDay(params[`${side}Date`])
    const time = params[`${side}Time`]
    const parts = [date ? t('dateFormat.wdshort', { date }) : '', typeof time === 'string' ? time : '']
    return [...parts.filter(Boolean), `#${number}`].join(' ')
  }

  const changeLabel = (change: AuditChange) => {
    if (!change.labelKey) return change.field

    const eventDate = change.labelParams?.eventDate
    const labelParams = {
      ...change.labelParams,
      ...(eventDate ? { eventDate: formatDate(new Date(String(eventDate)), 'd.M.yyyy') } : {}),
    }
    return t(change.labelKey as ParseKeys<'translation'>, { ...labelParams, defaultValue: change.field })
  }

  const changeValue = (value: AuditChangeValueData) => {
    if (value.state === 'empty') return t('audit.empty')
    if (value.state === 'removed') return t('audit.removed')
    return value.text ?? ''
  }

  const changeLine = (sign: string, label: string, value: AuditChangeValueData) => {
    const text = changeValue(value)
    return `${sign} ${label}:${text.includes('\n') ? '\n' : ' '}${text}`
  }

  const messageParams = (row: AuditRecord): AuditParams => {
    const params = translatedParams(row.messageParams)
    if (typeof params.toNumber !== 'number') return params

    return {
      ...params,
      from: groupLabel(params, 'from'),
      // A move without a reason would otherwise print the literal placeholder.
      reason: params.reason ?? '',
      to: groupLabel(params, 'to'),
    }
  }

  const message = (row: AuditRecord) => {
    if (row.changes?.length) return `${t('audit.changed')}: ${row.changes.map(changeLabel).join(', ')}`
    if (!isAuditTranslationKey(row.messageKey)) return row.message

    return t(row.messageKey, { ...messageParams(row), defaultValue: row.message }).trim()
  }

  const detail = (item: AuditDetail) => {
    if (!isAuditTranslationKey(item.detailKey)) return ''

    return t(item.detailKey, { ...translatedParams(item.detailParams), defaultValue: '' })
  }

  /** The actor, marked when the name came from the registration's people rather than a login. */
  const user = (row: AuditRecord) =>
    row.userSource === 'registration' ? `${row.user} ${t('audit.userSource.registration')}` : row.user

  return { changeLabel, changeLine, detail, message, t, user }
}

type AuditFormatter = ReturnType<typeof useAuditFormatter>

interface AuditChangeValueProps {
  readonly mt?: number
  readonly text: string
  readonly tone: 'error' | 'success'
}

const AuditChangeValue = ({ mt = 0, text, tone }: AuditChangeValueProps) => (
  <Typography
    color={`${tone}.main`}
    component="div"
    variant="caption"
    sx={{
      backgroundColor: (theme) => alpha(theme.palette[tone].main, 0.1),
      borderRadius: 0.5,
      mt,
      overflowWrap: 'anywhere',
      px: 0.5,
      py: 0.25,
      whiteSpace: 'pre-wrap',
    }}
  >
    {text}
  </Typography>
)

interface AuditChangeItemProps {
  readonly change: AuditChange
  readonly formatter: AuditFormatter
  readonly first: boolean
}

const AuditChangeItem = ({ change, first, formatter }: AuditChangeItemProps) => (
  <Box sx={{ mt: first ? 0 : 0.75 }}>
    <Typography
      component="div"
      variant="caption"
      sx={{
        color: 'text.secondary',
      }}
    >
      {formatter.changeLabel(change)}:
    </Typography>
    <AuditChangeValue text={formatter.changeLine('−', formatter.t('audit.before'), change.previous)} tone="error" />
    <AuditChangeValue
      mt={0.25}
      text={formatter.changeLine('+', formatter.t('audit.after'), change.next)}
      tone="success"
    />
  </Box>
)

interface AuditDetailItemProps {
  readonly detail: AuditDetail
  readonly formatter: AuditFormatter
}

const AuditDetailItem = ({ detail, formatter }: AuditDetailItemProps) => {
  const text = formatter.detail(detail)
  if (!text) return null

  return (
    <Typography
      component="div"
      variant="caption"
      sx={{
        color: 'text.secondary',
        mt: 0.75,
        overflowWrap: 'anywhere',
        whiteSpace: 'pre-wrap',
      }}
    >
      {text}
    </Typography>
  )
}

interface AuditTrailRowProps {
  readonly formatter: AuditFormatter
  readonly onToggle: () => void
  readonly open: boolean
  readonly row: AuditRecord
}

const AuditTrailRow = ({ formatter, onToggle, open, row }: AuditTrailRowProps) => {
  const hasDetails = Boolean(row.details?.length || row.changes?.length)

  return (
    <Box sx={{ borderBottom: '1px solid', borderBottomColor: 'divider', py: 0.75 }}>
      <Typography
        variant="caption"
        noWrap
        sx={{
          color: 'text.secondary',
        }}
      >
        {`${formatDate(row.timestamp, 'dd.MM.yyyy HH:mm:ss')} ${formatter.user(row)}`}
      </Typography>
      <Box sx={{ alignItems: 'flex-start', display: 'flex', mt: 0.25 }}>
        {hasDetails ? (
          <IconButton
            aria-label={formatter.t(open ? 'audit.hideDetails' : 'audit.showDetails')}
            onClick={onToggle}
            size="small"
            sx={{ flex: '0 0 24px', p: 0 }}
          >
            {open ? <KeyboardArrowDown fontSize="small" /> : <KeyboardArrowRight fontSize="small" />}
          </IconButton>
        ) : null}
        <Box sx={{ flex: 1, minWidth: 0, pl: hasDetails ? 0.5 : 0 }}>
          <Typography variant="body2">{formatter.message(row)}</Typography>
          {hasDetails ? (
            <Collapse in={open} timeout="auto" unmountOnExit>
              <Box sx={{ mt: 0.5 }}>
                {(row.changes ?? []).map((change, index) => (
                  <AuditChangeItem key={change.field} change={change} first={index === 0} formatter={formatter} />
                ))}
                {(row.details ?? []).map((detail) => (
                  <AuditDetailItem
                    key={`${detail.detailKey}-${JSON.stringify(detail.detailParams)}`}
                    detail={detail}
                    formatter={formatter}
                  />
                ))}
              </Box>
            </Collapse>
          ) : null}
        </Box>
      </Box>
    </Box>
  )
}

export const AuditTrail = ({ auditTrail, fullHeight = false }: Props) => {
  const formatter = useAuditFormatter()
  const [openRow, setOpenRow] = useState<string>()

  if (!auditTrail) return null

  const rows = auditTrail.map((row) => {
    const rowId = `${row.timestamp.toISOString()}-${row.user}-${row.message}`
    return (
      <AuditTrailRow
        key={rowId}
        formatter={formatter}
        onToggle={() => setOpenRow((current) => (current === rowId ? undefined : rowId))}
        open={openRow === rowId}
        row={row}
      />
    )
  })

  if (fullHeight) {
    return <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{rows}</Box>
  }

  return (
    <CollapsibleSection title={formatter.t('audit.title', { count: auditTrail.length })} compact initOpen={false}>
      <Box sx={{ maxHeight: 8 * 36 + 160, overflowY: 'auto' }}>{rows}</Box>
    </CollapsibleSection>
  )
}
