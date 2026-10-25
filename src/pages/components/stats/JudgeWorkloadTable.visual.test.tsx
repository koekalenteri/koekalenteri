import type { JudgeWorkloadEntry } from '@/types/Stats'
import { render } from 'vitest-browser-react'
import JudgeWorkloadTable from './JudgeWorkloadTable'
import { ChartFrame } from './statsVisualFixtures'

const judge = (judgeId: string, name: string, held: number, upcoming: number): JudgeWorkloadEntry => ({
  held,
  judgeId,
  name,
  upcoming,
})

// More judges than the table's height shows, so the capture records where its own scroll begins.
const judges: JudgeWorkloadEntry[] = [
  judge('1', 'Aaltonen Anna', 2, 1),
  judge('2', 'Berg Bertil', 2, 0),
  judge('3', 'Ceder Cecilia', 1, 1),
  judge('4', 'Dahl Daniel', 0, 2),
  judge('5', 'Eskola Eeva-Liisa', 2, 0),
  judge('6', 'Forsman Frans', 1, 0),
  judge('7', 'Grönroos Greta', 0, 1),
  judge('8', 'Heikkilä Henrik', 1, 0),
  judge('9', 'Ilves Iida', 1, 0),
  judge('10', 'Järvinen Jaakko-Petteri', 0, 1),
  judge('11', 'Koskinen Kaisa', 1, 0),
  judge('12', 'Lindqvist Lars', 0, 1),
  judge('13', 'Mäkelä Marja', 1, 0),
  judge('14', 'Nieminen Niko', 1, 0),
  judge('15', 'Foreign Judge', 0, 1),
]

it('lists held, upcoming and total events per judge, busiest first, scrolling within its height', async () => {
  const screen = await render(
    <ChartFrame>
      <JudgeWorkloadTable data={judges} filters={['Esimerkkiyhdistys ry', '2026']} />
    </ChartFrame>
  )

  await expect.element(screen.getByText('Aaltonen Anna')).toBeVisible()
  await expect(screen.getByTestId('chart-root')).toMatchScreenshot('judge-workload')
})

it('fits a phone screen', async () => {
  const screen = await render(
    <ChartFrame width={360}>
      <JudgeWorkloadTable data={judges} filters={['Esimerkkiyhdistys ry', '2026']} />
    </ChartFrame>
  )

  await expect.element(screen.getByText('Aaltonen Anna')).toBeVisible()
  await expect(screen.getByTestId('chart-root')).toMatchScreenshot('judge-workload-phone')
})
