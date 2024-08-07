import type { APIGatewayProxyEvent } from 'aws-lambda'

export const getParam = (
  event: Partial<Pick<APIGatewayProxyEvent, 'pathParameters'>>,
  name: string,
  defaultValue: string = ''
) => {
  try {
    return decodeURIComponent(event.pathParameters?.[name] ?? defaultValue)
  } catch (e) {
    console.error(e)
  }
  return defaultValue
}
