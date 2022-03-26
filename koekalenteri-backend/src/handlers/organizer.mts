import CustomDynamoClient from "../utils/CustomDynamoClient.mjs";
import { genericReadAllHandler } from "../utils/genericHandlers.mjs";

const dynamoDB = new CustomDynamoClient();

export const getOrganizersHandler = genericReadAllHandler(dynamoDB, 'getOrganizers');
