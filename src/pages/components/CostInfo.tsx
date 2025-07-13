import type { DogEvent } from '../../types'
import type { DogEventCostSegment } from '../../types/Cost'

import { useTranslation } from 'react-i18next'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import { useRecoilValue } from 'recoil'

import { getCostSegmentName, getCostValue } from '../../lib/cost'
import { languageAtom } from '../recoil'

interface Props {
  readonly event: Pick<DogEvent, 'cost' | 'costMember'>
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

  const costSegments = segments
    .map((segment) => {
      const value = getCostValue(cost, segment)
      if (!value) return null
      const memberValue = costMember && getCostValue(costMember, segment)
      const text = memberValue ? `${value} / ${memberValue}\u00A0€` : `${value}\u00A0€`
      const name =
        segment === 'custom' && cost.custom?.description
          ? (cost.custom.description[language] ?? cost.custom.description.fi)
          : t(getCostSegmentName(segment))
      return { name, text }
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
