import type { Theme } from '@mui/material'
import type { SyntheticEvent } from 'react'
import type { Organizer, PublicJudge, RegistrationClass } from '../../types'
import type { DateValue } from '../components/DateRange'

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined'
import { useMediaQuery } from '@mui/material'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Grid2 from '@mui/material/Grid2'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'

import { HEADER_HEIGHT } from '../../assets/Theme'
import AutocompleteMulti from '../components/AutocompleteMulti'
import DateRange from '../components/DateRange'
import SelectMulti from '../components/SelectMulti'
import { type FilterProps, filterStrings } from '../recoil'

interface Props {
  readonly eventTypes: string[]
  readonly eventClasses: RegistrationClass[]
  readonly filter: FilterProps
  readonly judges: PublicJudge[]
  readonly onChange?: (filter: FilterProps) => void
  readonly organizers: Organizer[]
}

const MIN_DATE = new Date(2020, 0, 1)

export const EventFilter = ({ judges, organizers, eventTypes, eventClasses, filter, onChange }: Props) => {
  const { t } = useTranslation()
  const md = useMediaQuery((theme: Theme) => theme.breakpoints.up('sm'))
  const [expanded, setExpanded] = useState(md)
  const filters = useMemo(() => filterStrings(filter, t), [filter, t])

  const setFilter = useCallback(
    (props: Partial<FilterProps>) => onChange && onChange({ ...filter, ...props }),
    [filter, onChange]
  )
  const handleDateRangeChange = useCallback(
    (start: DateValue, end: DateValue) => setFilter({ start, end }),
    [setFilter]
  )
  const handleEventTypeChange = useCallback(
    (value: readonly string[]) => setFilter({ eventType: [...value] }),
    [setFilter]
  )
  const handleEventClassChange = useCallback(
    (event: SyntheticEvent<Element, Event>, value: readonly RegistrationClass[]) =>
      setFilter({ eventClass: [...value] }),
    [setFilter]
  )
  const handleOrganizerChange = useCallback(
    (event: SyntheticEvent<Element, Event>, value: readonly Organizer[]) =>
      setFilter({ organizer: value.map((v) => v.id) }),
    [setFilter]
  )
  const handleJudgeChange = useCallback(
    (event: SyntheticEvent<Element, Event>, value: readonly PublicJudge[]) =>
      setFilter({ judge: value.map((v) => v.name) }),
    [setFilter]
  )
  const handleWithEntryOpenChange = useCallback(
    (event: SyntheticEvent<Element, Event>, checked: boolean) =>
      setFilter({
        withOpenEntry: checked,
        withClosingEntry: checked && filter.withClosingEntry,
        withFreePlaces: checked && filter.withFreePlaces,
      }),
    [filter.withClosingEntry, filter.withFreePlaces, setFilter]
  )
  const handleWithUpcomingEntryChange = useCallback(
    (event: SyntheticEvent<Element, Event>, checked: boolean) =>
      setFilter({
        withUpcomingEntry: checked,
      }),
    [setFilter]
  )
  const getName = useCallback((o?: { name?: string }) => o?.name ?? '', [])
  const getJudgeName = useCallback(
    (o?: PublicJudge) => (o?.name ?? '') + (o?.foreing && o.country ? ` (${t(o.country, { ns: 'country' })})` : ''),
    [t]
  )
  const getString = useCallback((o?: string) => o ?? '', [])
  const compareId = useCallback((o?: { id?: number | string }, v?: { id?: number | string }) => o?.id === v?.id, [])
  const compareJudge = useCallback((o?: PublicJudge, v?: PublicJudge) => o?.name === v?.name, [])

  return (
    <Box
      component="nav"
      p={0}
      sx={{
        position: 'sticky',
        top: `calc(${HEADER_HEIGHT} - 1px)`,
        zIndex: 2,
        border: '1px solid #708f85',
        borderRadius: '4px',
        m: '1px',
        // borderTop: '1px solid #708f85',
      }}
    >
      <Accordion
        defaultExpanded={md}
        expanded={expanded}
        onChange={(_e, expanded) => setExpanded(expanded)}
        sx={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
      >
        <AccordionSummary
          sx={{
            bgcolor: 'background.filterHeader',
            minHeight: '28px',
            '&.Mui-expanded': { minHeight: '28px' },
            '& .MuiAccordionSummary-content': { margin: 0, overflow: 'hidden' },
            '& .MuiAccordionSummary-content.Mui-expanded': { margin: 0 },
            p: '1px',
          }}
        >
          <Button
            component="div"
            variant="contained"
            startIcon={<TuneOutlinedIcon />}
            sx={{ bgcolor: 'background.filterHeader', color: 'black' }}
            fullWidth
          >
            <Typography variant="caption" noWrap textOverflow="ellipsis">
              <b>Rajaa ({filters.length})</b> • {filters.join(' | ')}
            </Typography>
          </Button>
        </AccordionSummary>
        <AccordionDetails sx={{ bgcolor: 'background.filter' }}>
          <Grid2 container justifyContent="start" spacing={1}>
            <Grid2 size={{ xs: 12, md: 6 }}>
              <DateRange
                start={filter.start}
                end={filter.end}
                range={{ start: MIN_DATE }}
                startLabel={t('daterangeStart')}
                endLabel={t('daterangeEnd')}
                onChange={handleDateRangeChange}
              />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6, md: 4 }}>
              <SelectMulti
                label={t('filter.eventType')}
                onChange={handleEventTypeChange}
                options={eventTypes}
                value={filter.eventType}
              />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6, md: 2 }}>
              <AutocompleteMulti
                getOptionLabel={getString}
                label={t('filter.eventClass')}
                onChange={handleEventClassChange}
                options={eventClasses}
                value={filter.eventClass}
              />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6 }}>
              <AutocompleteMulti
                getOptionLabel={getName}
                isOptionEqualToValue={compareId}
                label={t('filter.organizer')}
                onChange={handleOrganizerChange}
                options={organizers}
                value={organizers.filter((o) => filter.organizer.includes(o.id))}
              />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6 }}>
              <AutocompleteMulti
                getOptionLabel={getJudgeName}
                isOptionEqualToValue={compareJudge}
                label={t('judge')}
                onChange={handleJudgeChange}
                options={judges}
                value={judges.filter((j) => filter.judge.includes(j.name))}
              />
            </Grid2>
            <Grid2 size={{ xs: 12, md: 12 }}>
              <Grid2 container>
                <Grid2 size="auto">
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0} alignItems="start" justifyContent="start">
                    <FormControlLabel
                      value="withOpenEntry"
                      checked={filter.withOpenEntry}
                      control={<Switch />}
                      label={t('entryOpen')}
                      name="withOpenEntry"
                      onChange={handleWithEntryOpenChange}
                    />
                    <FormControlLabel
                      value="withUpcomingEntry"
                      checked={filter.withUpcomingEntry}
                      control={<Switch />}
                      label={t('entryUpcoming')}
                      labelPlacement="end"
                      name="withUpcomingEntry"
                      onChange={handleWithUpcomingEntryChange}
                    />
                  </Stack>
                </Grid2>
                <Grid2 display={{ xs: undefined, md: 'none' }} alignSelf="end">
                  <Button variant="contained" onClick={() => setExpanded(false)}>
                    OK
                  </Button>
                </Grid2>
              </Grid2>
            </Grid2>
          </Grid2>
        </AccordionDetails>
      </Accordion>
    </Box>
  )
}
