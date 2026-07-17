import type { ParseKeys } from 'i18next'
import type { AuditRecord } from '../../../types'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import { alpha } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../../i18n/dates'
import CollapsibleSection from '../../components/CollapsibleSection'

interface Props {
  auditTrail?: AuditRecord[]
}

type AuditChange = NonNullable<AuditRecord['changes']>[number]
type AuditChangeValueData = AuditChange['previous']
type AuditDetail = NonNullable<AuditRecord['details']>[number]

const auditMessageKeys: Partial<Record<string, ParseKeys<'translation'>>> = {
  'audit.changed': 'audit.changed',
  'audit.messages.classStartListHidden': 'audit.messages.classStartListHidden',
  'audit.messages.classStartListPublished': 'audit.messages.classStartListPublished',
  'audit.messages.emailSent': 'audit.messages.emailSent',
  'audit.messages.eventCreated': 'audit.messages.eventCreated',
  'audit.messages.eventDeleted': 'audit.messages.eventDeleted',
  'audit.messages.eventSaved': 'audit.messages.eventSaved',
  'audit.messages.startListHidden': 'audit.messages.startListHidden',
  'audit.messages.startListPublished': 'audit.messages.startListPublished',
}

const auditMessageParamKeys: Partial<Record<string, ParseKeys<'translation'>>> = {
  'emailTemplate.cancel-early': 'emailTemplate.cancel-early',
  'emailTemplate.invitation': 'emailTemplate.invitation',
  'emailTemplate.picked': 'emailTemplate.picked',
  'emailTemplate.registration': 'emailTemplate.registration',
  'emailTemplate.reserve': 'emailTemplate.reserve',
}

const auditDetailKeys: Partial<Record<string, ParseKeys<'translation'>>> = {
  'audit.details.failedRecipients': 'audit.details.failedRecipients',
}

const useAuditFormatter = () => {
  const { t } = useTranslation()

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

  const messageParams = (row: AuditRecord) => {
    const templateKey = typeof row.messageParams?.templateKey === 'string' ? row.messageParams.templateKey : undefined
    const templateTranslationKey = templateKey ? auditMessageParamKeys[templateKey] : undefined

    return {
      ...row.messageParams,
      ...(templateTranslationKey ? { template: t(templateTranslationKey) } : {}),
    }
  }

  const message = (row: AuditRecord) => {
    if (row.changes?.length) return `${t('audit.changed')}: ${row.changes.map(changeLabel).join(', ')}`

    const messageKey = row.messageKey ? auditMessageKeys[row.messageKey] : undefined
    if (messageKey) return t(messageKey, messageParams(row))

    return row.message
  }

  const detail = (item: AuditDetail) => {
    const detailKey = auditDetailKeys[item.detailKey]
    if (detailKey) return t(detailKey, item.detailParams)

    return ''
  }

  return { changeLabel, changeLine, detail, message, t }
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
    <Typography color="text.secondary" component="div" variant="caption">
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
      color="text.secondary"
      component="div"
      variant="caption"
      sx={{ mt: 0.75, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
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
      <Typography color="text.secondary" variant="caption" noWrap>
        {`${formatDate(row.timestamp, 'dd.MM.yyyy HH:mm:ss')} ${row.user}`}
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

export const AuditTrail = ({ auditTrail }: Props) => {
  const formatter = useAuditFormatter()
  const [openRow, setOpenRow] = useState<string>()

  if (!auditTrail) return null

  return (
    <CollapsibleSection title={formatter.t('audit.title', { count: auditTrail.length })} compact initOpen={false}>
      <Box sx={{ maxHeight: 8 * 36 + 160, overflowY: 'auto' }}>
        {auditTrail.map((row) => {
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
        })}
      </Box>
    </CollapsibleSection>
  )
}
