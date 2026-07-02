import type { ParseKeys } from 'i18next'
import type { AuditRecord } from '../../../types'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../../i18n/dates'
import CollapsibleSection from '../../components/CollapsibleSection'

interface Props {
  auditTrail?: AuditRecord[]
}

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

export const AuditTrail = ({ auditTrail }: Props) => {
  const { t } = useTranslation()
  const [openRow, setOpenRow] = useState<string>()

  if (!auditTrail) return null

  const toggleRow = (id: string) => {
    setOpenRow((current) => (current === id ? undefined : id))
  }

  const getChangeLabel = (change: NonNullable<AuditRecord['changes']>[number]) => {
    if (!change.labelKey) return change.field

    return t(change.labelKey as ParseKeys<'translation'>, { defaultValue: change.field })
  }

  const getChangeValue = (value: NonNullable<AuditRecord['changes']>[number]['previous']) => {
    if (value.state === 'empty') return t('audit.empty')
    if (value.state === 'removed') return t('audit.removed')
    return value.text ?? ''
  }

  const getMessageParams = (row: AuditRecord) => {
    const templateKey = typeof row.messageParams?.templateKey === 'string' ? row.messageParams.templateKey : undefined
    const templateTranslationKey = templateKey ? auditMessageParamKeys[templateKey] : undefined

    return {
      ...row.messageParams,
      ...(templateTranslationKey ? { template: t(templateTranslationKey) } : {}),
    }
  }

  const getMessage = (row: AuditRecord) => {
    if (row.changes?.length) return `${t('audit.changed')}: ${row.changes.map(getChangeLabel).join(', ')}`

    const messageKey = row.messageKey ? auditMessageKeys[row.messageKey] : undefined
    if (messageKey) return t(messageKey, getMessageParams(row))

    return row.message
  }

  const getDetail = (detail: NonNullable<AuditRecord['details']>[number]) => {
    const detailKey = auditDetailKeys[detail.detailKey]
    if (detailKey) return t(detailKey, detail.detailParams)

    return ''
  }

  return (
    <CollapsibleSection title={`Audit trail (${auditTrail.length})`} initOpen={false}>
      <TableContainer component={Box} sx={{ maxHeight: 8 * 36 + 160 }}>
        <Table size="small">
          <TableBody>
            {auditTrail.map((row) => {
              const id = row.timestamp.toISOString()
              const open = openRow === id
              const hasDetails = Boolean(row.details?.length || row.changes?.length)
              return (
                <TableRow key={id}>
                  <TableCell sx={{ width: 36 }}>
                    {hasDetails ? (
                      <IconButton
                        aria-label={open ? 'Piilota audit-lisätiedot' : 'Näytä audit-lisätiedot'}
                        onClick={() => toggleRow(id)}
                        size="small"
                      >
                        {open ? <KeyboardArrowDown fontSize="small" /> : <KeyboardArrowRight fontSize="small" />}
                      </IconButton>
                    ) : null}
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top', width: 160 }}>
                    <Typography variant="body2" noWrap>
                      {formatDate(row.timestamp, 'dd.MM.yyyy HH:mm:ss')}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top', width: 160 }}>
                    <Typography variant="body2" noWrap>
                      {row.user}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <Typography variant="body2">{getMessage(row)}</Typography>
                    {hasDetails ? (
                      <Collapse in={open} timeout="auto" unmountOnExit>
                        <Typography
                          color="text.secondary"
                          component="pre"
                          variant="caption"
                          sx={{
                            fontFamily: 'inherit',
                            m: 0,
                            mt: 0.5,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {[
                            ...(row.changes ?? []).map(
                              (change) =>
                                `${getChangeLabel(change)}:\n- ${t('audit.before')}: ${getChangeValue(change.previous)}\n- ${t('audit.after')}: ${getChangeValue(change.next)}`
                            ),
                            ...(row.details ?? []).map(getDetail),
                          ]
                            .filter(Boolean)
                            .join('\n\n')}
                        </Typography>
                      </Collapse>
                    ) : null}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </CollapsibleSection>
  )
}
