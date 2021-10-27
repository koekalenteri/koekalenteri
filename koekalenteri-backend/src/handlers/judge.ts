import CustomDynamoClient from "../utils/CustomDynamoClient";
import { genericReadAllHandler } from "../utils/genericHandlers";

const dynamoDB = new CustomDynamoClient();

export const getJudgesHandler = genericReadAllHandler(dynamoDB, 'getJudges');
