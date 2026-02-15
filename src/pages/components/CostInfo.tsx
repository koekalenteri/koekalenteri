import type { BreedCode, DogEvent } from '../../types'
import type { DogEventCost, DogEventCostSegment } from '../../types/Cost'

import { Fragment } from 'react/jsx-runtime'
import { useTranslation } from 'react-i18next'
import Typography from '@mui/material/Typography'
import { useRecoilValue } from 'recoil'

import { getCostSegmentName, getCostValue, getEarlyBirdDates, mergeMemberCost } from '../../lib/cost'
import { keysOf } from '../../lib/typeGuards'
import { languageAtom } from '../recoil'

import CostInfoTableCaption from './costInfo/CostStrategiesHeader'
import InfoTableContainerGrid from './InfoTableContainerGrid'
import InfoTableNumberGrid from './InfoTableNumberGrid'
import InfoTableTextGrid from './InfoTableTextGrid'

interface Props {
  readonly event: Pick<DogEvent, 'cost' | 'costMember' | 'entryStartDate' | 'paymentTime'>
}

const segments: DogEventCostSegment[] = ['normal', 'earlyBird', 'breed', 'custom']

export default function CostInfo({ event }: Props) {
  const { t } = useTranslation()
  const language = useRecoilValue(languageAtom)
  const { cost, costMember, paymentTime = 'registration' } = event

  const costText = (c: number, cm?: number) =>
    cm && cm !== c ? `${c}\u00A0€, ${t('event.costMember')} ${cm}\u00A0€` : `${c}\u00A0€`

  if (typeof cost === 'number') {
    if (typeof costMember === 'object') return <>invalid cost configuration</>
    return (
      <>
        {costText(cost, costMember)}
        {'. '}
        <Typography variant="caption">{t(`paymentTimeOptions.${paymentTime}`)}</Typography>
      </>
    )
  }

  if (typeof costMember === 'number') {
    return <>invalid cost configuration</>
  }

  const mergedCostMember = mergeMemberCost(cost, costMember)

  const getSegmentInfo = (
    cost: DogEventCost,
    mergedMemberCost: DogEventCost | number | undefined,
    segment: DogEventCostSegment,
    breedCode?: BreedCode
  ) => {
    const value = getCostValue(cost, segment, breedCode)
    if (!value) return null
    const memberValue =
      mergedMemberCost && typeof mergedMemberCost !== 'number'
        ? getCostValue(mergedMemberCost, segment, breedCode)
        : undefined
    const text = costText(value, memberValue)

    if (segment === 'custom' && cost.custom?.description) {
      return {
        name: t(getCostSegmentName(segment), { name: cost.custom.description[language] || cost.custom.description.fi }),
        text,
      }
    }
    if (segment === 'breed' && breedCode) {
      return { name: t(getCostSegmentName(segment), { code: breedCode }), text }
    }
    if (segment === 'earlyBird') {
      return { name: t(getCostSegmentName(segment), getEarlyBirdDates(event, cost)), text }
    }

    return { name: t(getCostSegmentName(segment)), text }
  }

  const costSegments = segments
    .flatMap((segment) => {
      if (segment === 'breed') {
        const breeds = []
        // Use merged member cost to get all breed codes available to members
        const memberBreeds =
          mergedCostMember && typeof mergedCostMember !== 'number' ? mergedCostMember.breed : undefined
        const allBreedCodes = new Set([...keysOf(cost.breed ?? {}), ...keysOf(memberBreeds ?? {})])
        for (const breedCode of allBreedCodes) {
          breeds.push(getSegmentInfo(cost, mergedCostMember, segment, breedCode))
        }
        return breeds
      }
      return getSegmentInfo(cost, mergedCostMember, segment)
    })
    .filter((c): c is { name: string; text: string } => !!c)

  const optionalCosts =
    cost.optionalAdditionalCosts?.map((c, index) => {
      const name = c.description[language] || c.description.fi
      const memberCost =
        mergedCostMember && typeof mergedCostMember !== 'number'
          ? mergedCostMember.optionalAdditionalCosts?.[index]?.cost
          : undefined
      const text = costText(c.cost, memberCost)
      return { name, text }
    }) ?? []

  // Note: using <Fragment key= below to suppress errors. The fragment is not rendered however, so the components inside need unique keys.
  return (
    <>
      <InfoTableContainerGrid>
        {costSegments.map((segment, index) => (
          <Fragment key={segment.name}>
            <InfoTableTextGrid key={segment.name + index + '-name'} size={{ xs: 7 }}>
              {segment.name}
            </InfoTableTextGrid>
            <InfoTableNumberGrid key={segment.name + index + '-text'} size={{ xs: 5 }}>
              {segment.text}
            </InfoTableNumberGrid>
          </Fragment>
        ))}
      </InfoTableContainerGrid>
      {optionalCosts.length ? (
        <>
          <CostInfoTableCaption text={t('costNames.optionalAdditionalCosts')} />
          <InfoTableContainerGrid key="optional-costs">
            {optionalCosts.map((c, index) => (
              <Fragment key={c.name}>
                <InfoTableTextGrid key={c.name + index + '-name'} size={{ xs: 7 }}>
                  {c.name}
                </InfoTableTextGrid>
                <InfoTableNumberGrid key={c.name + index + '-text'} size={{ xs: 5 }}>
                  {c.text}
                </InfoTableNumberGrid>
              </Fragment>
            ))}
          </InfoTableContainerGrid>
        </>
      ) : null}
      <Typography variant="caption" component="div" sx={{ width: '100%', px: 1.5, mt: 1 }} textAlign="right">
        {t(`paymentTimeOptions.${paymentTime}`)}
      </Typography>
    </>
  )
}
