import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { genericWriteHandler } from '../utils/genericHandlers'

const dynamoDB = new CustomDynamoClient(CONFIG.judgeTable)

const putJudgeHandler = genericWriteHandler(dynamoDB, 'putJudge')

export default putJudgeHandler
