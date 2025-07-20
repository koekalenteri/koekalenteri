import type { BreedCode, DogEvent, PublicConfirmedEvent } from '../../types'
import type { DogEventCost, DogEventCostSegment } from '../../types/Cost'

import { useTranslation } from 'react-i18next'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import { useRecoilValue } from 'recoil'

import { getCostSegmentName, getCostValue, getEarlyBirdEndDate } from '../../lib/cost'
import { keysOf } from '../../lib/typeGuards'
import { languageAtom } from '../recoil'

interface Props {
  readonly event: Pick<DogEvent, 'cost' | 'costMember' | 'entryStartDate'>
}

export default function CostInfo({ event }: Props) {
  const { t } = useTranslation()
  const language = useRecoilValue(languageAtom)
  const segments: DogEventCostSegment[] = ['normal', 'earlyBird', 'breed', 'custom']
  const { cost, costMember } = event

  if (typeof cost === 'number') {
    if (typeof costMember === 'object') return <>invalid cost configuration</>
    return <>{costMember ? `${cost}\u00A0€, ${t('event.costMember')} ${costMember}\u00A0€` : `${cost}\u00A0€`}</>
  }

  if (typeof costMember === 'number') {
    return <>invalid cost configuration</>
  }

  const getSegmentInfo = (
    cost: DogEventCost,
    costMember: DogEventCost | undefined,
    segment: DogEventCostSegment,
    breedCode?: BreedCode
  ) => {
    const value = getCostValue(cost, segment, breedCode)
    if (!value) return null
    const memberValue = costMember && getCostValue(costMember, segment, breedCode)
    const text = memberValue ? `${value} / ${memberValue}\u00A0€` : `${value}\u00A0€`
    const name =
      segment === 'custom' && cost.custom?.description
        ? (cost.custom.description[language] ?? cost.custom.description.fi)
        : segment === 'breed' && breedCode
          ? t(getCostSegmentName(segment), { code: breedCode })
          : segment === 'earlyBird'
            ? t(getCostSegmentName(segment), {
                start: event.entryStartDate,
                end: getEarlyBirdEndDate(event as PublicConfirmedEvent, cost),
              })
            : t(getCostSegmentName(segment))

    return { name, text }
  }

  const costSegments = segments
    .flatMap((segment) => {
      if (segment === 'breed') {
        const breeds = []
        for (const breedCode of keysOf(cost.breed ?? {})) {
          breeds.push(getSegmentInfo(cost, costMember, segment, breedCode))
        }
        return breeds
      }
      return getSegmentInfo(cost, costMember, segment)
    })
    .filter((c): c is { name: string; text: string } => !!c)

  const optionalCosts =
    cost.optionalAdditionalCosts?.map((c, index) => {
      const name = c.description[language] ?? c.description.fi
      const memberCost = costMember?.optionalAdditionalCosts?.[index]?.cost
      const text = memberCost ? `${c.cost} / ${memberCost}\u00A0€` : `${c.cost}\u00A0€`
      return { name, text }
    }) ?? []

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableBody>
          {costSegments.map((segment) => (
            <TableRow key={segment.name}>
              <TableCell>{segment.name}</TableCell>
              <TableCell align="right">{segment.text}</TableCell>
            </TableRow>
          ))}
          {optionalCosts.map((c) => (
            <TableRow key={c.name}>
              <TableCell variant="footer" color="black">
                {c.name}
              </TableCell>
              <TableCell variant="footer" align="right">
                {c.text}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
