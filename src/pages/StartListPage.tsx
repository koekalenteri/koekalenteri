import type { Params } from 'react-router'
import type { PublicRegistration } from '../types'

import { useTranslation } from 'react-i18next'
import { useLoaderData, useParams } from 'react-router'
import Box from '@mui/material/Box'
import Grid2 from '@mui/material/Grid2'
import { styled } from '@mui/material/styles'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import { useRecoilValue } from 'recoil'

import { getStartList } from '../api/registration'
import { judgeName } from '../lib/judge'

import { confirmedEventSelector } from './recoil'

export const startListLoader = async ({ params }: { params: Params<string> }) =>
  params.id ? getStartList(params.id) : []

const StyledTableRow = styled(TableRow)(({ theme }) => ({
  '& td, & th': {
    border: 0,
  },
  '&.top-border': {
    '& td:not(:first-of-type), & th:not(:first-of-type)': {
      borderTop: '1px dotted #aaa',
    },
  },
}))

export const StartListPage = () => {
  const { t } = useTranslation()
  const { id } = useParams()
  const event = useRecoilValue(confirmedEventSelector(id))
  const participants = useLoaderData() as PublicRegistration[]
  const now = new Date()

  if (!event) {
    return <>Tapahtumaa {id} ei löydy.</>
  }

  if (!participants?.length) {
    return <>Starttilistaa ei ole saatavilla tälle tapahtumalle</>
  }

  let lastDate: Date | undefined
  let lastClass: PublicRegistration['class']
  let lastTime: string | undefined
  let index = 0

  return (
    <Box p={1}>
      <Grid2 container>
        <Grid2 display="flex" flexGrow={1}>
          <h1>
            {event.eventType} {event.location} {event.name ? `(${event.name})` : ''}
          </h1>
        </Grid2>
        <Grid2 display="flex" justifyContent="end">
          {t('dateFormat.dtshort', { date: now })}
        </Grid2>
      </Grid2>
      <Table size="small">
        <TableBody>
          {participants.map((reg) => {
            const result: JSX.Element[] = []
            if (reg.group.date?.valueOf() !== lastDate?.valueOf()) {
              const date = reg.group.date ?? event?.startDate ?? new Date()
              result.push(
                <StyledTableRow key={date.toISOString()}>
                  <TableCell colSpan={6}>
                    <h2>
                      {t('dateFormat.weekday', { date })} {t('dateFormat.date', { date })}
                    </h2>
                  </TableCell>
                </StyledTableRow>
              )
              lastDate = reg.group.date
              lastTime = undefined
              index = 0
            }
            if (lastClass !== reg.class) {
              if (reg.class) {
                result.push(
                  <StyledTableRow key={reg.class}>
                    <TableCell colSpan={6} sx={{ fontWeight: 'bold' }}>
                      {reg.class}{' '}
                      {event.classes
                        .filter((c) => c.class === reg.class && c.date?.valueOf() === lastDate?.valueOf())
                        .map((c) =>
                          Array.isArray(c.judge)
                            ? c.judge.map((j) => judgeName(j, t)).join(', ')
                            : judgeName(c.judge, t)
                        )
                        .filter(Boolean)
                        .join(', ')}
                    </TableCell>
                  </StyledTableRow>
                )
              }
              lastClass = reg.class
              index = 0
            }
            if (lastTime !== reg.group.time) {
              if (reg.group.time) {
                result.push(
                  <StyledTableRow key={`${lastDate?.toISOString()} ${reg.group.time}`}>
                    <TableCell colSpan={6} sx={{ fontWeight: 'bold' }}>
                      {t(`registration.timeLong.${reg.group.time}`)}
                    </TableCell>
                  </StyledTableRow>
                )
              }
              lastTime = reg.group.time
              index = 0
            }
            if (reg.cancelled) {
              result.push(
                <StyledTableRow key={reg.group.number}>
                  <TableCell align="right">{reg.group.number}.</TableCell>
                  <TableCell colSpan={5}>PERUTTU</TableCell>
                </StyledTableRow>
              )
            } else {
              result.push(
                <StyledTableRow key={`${reg.group.number}-a`} className={index > 0 ? 'top-border' : ''}>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {reg.group.number}.
                  </TableCell>
                  <TableCell>
                    {reg.dog.breedCode && reg.dog.gender
                      ? t(`${reg.dog.breedCode}.${reg.dog.gender}`, {
                          ns: 'breedAbbr',
                          defaultValue: reg.dog.breedCode,
                        })
                      : ''}
                  </TableCell>
                  <TableCell>{reg.dog.titles}</TableCell>
                  <TableCell>{reg.dog.name}</TableCell>
                  <TableCell>{reg.dog.regNo}</TableCell>
                  <TableCell>s. {reg.dog.dob ? t('dateFormat.date', { date: reg.dog.dob }) : '?'}</TableCell>
                </StyledTableRow>
              )
              result.push(
                <StyledTableRow key={`${reg.group.number}-b`}>
                  <TableCell></TableCell>
                  <TableCell colSpan={5}>
                    (i. {reg.dog.sire?.titles} {reg.dog.sire?.name}, e. {reg.dog.dam?.titles} {reg.dog.dam?.name})
                  </TableCell>
                </StyledTableRow>
              )
              result.push(
                <StyledTableRow key={`${reg.group.number}-c`}>
                  <TableCell></TableCell>
                  <TableCell colSpan={2}>
                    {reg.ownerHandles ? 'om. & ohj. ' + reg.owner : 'om. ' + reg.owner + ', ohj. ' + reg.handler}
                  </TableCell>
                  <TableCell colSpan={2}>kasv. {reg.breeder}</TableCell>
                </StyledTableRow>
              )
              index++
            }

            return result
          })}
        </TableBody>
      </Table>
    </Box>
  )
}
