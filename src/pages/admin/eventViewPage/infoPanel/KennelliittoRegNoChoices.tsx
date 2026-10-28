import type { TFunction } from 'i18next'
import type { KcComparedDog, KcDogField, KcDogReport, KcKnownDog } from '@/lib/kennelliittoResults'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { kcDogDifferences } from '@/lib/kennelliittoResults'
import { dogLabel } from './kennelliittoMessages'

/**
 * What the secretary decides for a dog Kennelliitto knows by another number: take Kennelliitto's number,
 * or leave its result unsent for now (KOE-1653).
 */
export type KcRegNoDecision = 'switch' | 'leave'

export type KcRegNoDecisions = Partial<Record<string, KcRegNoDecision>>

/** A dog to decide about: the entry's dog beside the one Kennelliitto found (KOE-1653). */
export interface KcRegNoRow {
  readonly dog: KcComparedDog
  readonly kcDog: KcKnownDog
  readonly report: KcDogReport
}

/** Every row has a decision: what the confirmation waits for. */
export const isEveryRegNoDecided = (rows: readonly KcRegNoRow[], decisions: KcRegNoDecisions): boolean =>
  rows.every((row) => decisions[row.report.id] !== undefined)

const FIELDS: readonly KcDogField[] = ['regNo', 'name', 'rfid', 'dob', 'breed', 'gender']

const fieldValue = (t: TFunction, field: KcDogField, dog: KcComparedDog): string | undefined => {
  switch (field) {
    case 'regNo':
      return dog.regNo
    case 'name':
      return dog.name
    case 'rfid':
      return dog.rfid?.trim() || undefined
    case 'dob':
      return dog.dob ? t('dateFormat.isodate', { date: dog.dob }) : undefined
    case 'breed':
      return dog.breedCode ? t(dog.breedCode, { defaultValue: dog.breedCode, ns: 'breed' }) : undefined
    case 'gender':
      return dog.gender ? t(`dog.genderChoises.${dog.gender}`) : undefined
  }
}

const differsSx = { color: 'error.main', fontWeight: 700 } as const

const Comparison = ({ row }: { readonly row: KcRegNoRow }) => {
  const { t } = useTranslation()
  const differences = kcDogDifferences(row.dog, row.kcDog)
  const missing = t('results.kennelliitto.regNo.missing')
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>{t('results.kennelliitto.regNo.field')}</TableCell>
          <TableCell>{t('results.kennelliitto.regNo.ours')}</TableCell>
          <TableCell>{t('results.kennelliitto.regNo.theirs')}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {FIELDS.map((field) => {
          const differs = differences.includes(field)
          return (
            <TableRow key={field}>
              <TableCell component="th" scope="row">
                {t(`dog.${field}`)}
              </TableCell>
              <TableCell sx={differs ? differsSx : undefined}>{fieldValue(t, field, row.dog) ?? missing}</TableCell>
              <TableCell sx={differs ? differsSx : undefined}>{fieldValue(t, field, row.kcDog) ?? missing}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

interface RowProps {
  readonly decision: KcRegNoDecision | undefined
  readonly onChange: (id: string, decision: KcRegNoDecision) => void
  readonly row: KcRegNoRow
}

const isDecision = (value: string): value is KcRegNoDecision => value === 'switch' || value === 'leave'

const RegNoRow = ({ decision, onChange, row }: RowProps) => {
  const { t } = useTranslation()
  const label = dogLabel(row.report)
  return (
    <Paper sx={{ p: 1.5 }} variant="outlined">
      <Stack spacing={1}>
        <div>
          <Typography sx={{ fontWeight: 600 }} variant="body2">
            {label}
          </Typography>
          <Typography variant="caption">{t(`results.kennelliitto.regNo.foundBy.${row.kcDog.foundBy}`)}</Typography>
        </div>
        <Comparison row={row} />
        <RadioGroup
          aria-label={label}
          onChange={(_event, value) => {
            if (isDecision(value)) onChange(row.report.id, value)
          }}
          value={decision ?? ''}
        >
          <FormControlLabel
            control={<Radio size="small" />}
            label={t('results.kennelliitto.regNo.choice.switch', { regNo: row.kcDog.regNo })}
            value="switch"
          />
          <FormControlLabel
            control={<Radio size="small" />}
            label={t('results.kennelliitto.regNo.choice.leave')}
            value="leave"
          />
        </RadioGroup>
      </Stack>
    </Paper>
  )
}

interface Props {
  readonly decisions: KcRegNoDecisions
  readonly onChange: (id: string, decision: KcRegNoDecision) => void
  readonly rows: readonly KcRegNoRow[]
}

/**
 * The dogs Kennelliitto knows by another number, all at once before the sending (KOE-1653): the entry's
 * details beside Kennelliitto's, the differences marked, and what to do with each dog.
 */
export const KennelliittoRegNoChoices = ({ decisions, onChange, rows }: Props) => {
  const { t } = useTranslation()
  return (
    <Stack spacing={2}>
      <Typography>{t('results.kennelliitto.regNo.intro')}</Typography>
      <Typography variant="body2">{t('results.kennelliitto.regNo.differences')}</Typography>
      {rows.map((row) => (
        <RegNoRow decision={decisions[row.report.id]} key={row.report.id} onChange={onChange} row={row} />
      ))}
    </Stack>
  )
}
