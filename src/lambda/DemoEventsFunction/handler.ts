import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonEvent } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { addMonths, startOfDay } from 'date-fns'

import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()
const { registrationTable } = CONFIG

const demoEvents = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      if (process.env.STAGE_NAME !== 'dev') {
        return response(401, 'Unauthorized', event)
      }

      try {
        const timestamp = new Date().toISOString()
        const startDate = startOfDay(addMonths(Date.now(), 1)).toISOString()

        const item: JsonEvent = {
          accountNumber: '',
          classes: [],
          cost: 0,
          costMember: 0,
          createdAt: timestamp,
          createdBy: 'cron',
          description: '',
          endDate: startDate,
          eventType: 'NOME-A',
          id: 'demo-draft-nome-a',
          judges: [],
          location: '',
          modifiedAt: timestamp,
          modifiedBy: 'cron',
          name: 'DEMO: Alustava NOME-A +1kk',
          official: {
            district: 'demo',
            email: 'vastaava@example.com',
            eventTypes: ['NOMA-A'],
            id: 0,
            name: 'Demo Koevastaava',
          },
          organizer: {
            id: '400830',
            name: 'SUOMEN NOUTAJAKOIRAJÄRJESTÖ R.Y.',
          },
          paymentDetails: '',
          places: 0,
          referenceNumber: '',
          secretary: {
            email: 'sihteeri@example.com',
            id: 'demo-sihteeri',
            name: 'Demo Sihteeri',
          },
          startDate: startDate,
          state: 'draft',
        }

        await dynamoDB.write(item)

        metricsSuccess(metrics, event.requestContext, 'demoEvents')
        return response(200, item, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'demoEvents')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default demoEvents
