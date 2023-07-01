import CustomDynamoClient from '../utils/CustomDynamoClient'

const AUDIT_TABLE = process.env.AUDIT_TABLE_NAME

const dynamoDB = new CustomDynamoClient(AUDIT_TABLE)

export const audit = async (auditKey: string, message: string) => {
  try {
    dynamoDB.write({ auditKey, timestamp: new Date().toISOString(), message })
  } catch (e) {
    console.error(e)
  }
}
