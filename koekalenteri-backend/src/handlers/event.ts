'use strict'

import "source-map-support/register";
import { v4 as uuidv4 } from 'uuid';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
const {metricScope} = require("aws-embedded-metrics");

import CustomDynamoClient from "../utils/CustomDynamoClient";
import { response } from "../utils/response";
import { metricsSuccess, metricsError } from "../utils/metrics";
// TODO model needs to be moved to koekalenteri-shared so that same file can be used in BE and FE
import { Event } from "koekalenteri-shared/model/Event";

const dynamoDB = new CustomDynamoClient();

export const getEventsHandler = metricScope((metrics: any) => 
    async (
        event: APIGatewayProxyEvent,
    ): Promise<APIGatewayProxyResult> => {
        try {
            console.info(process.env.TABLE_NAME);
            const items = await dynamoDB.readAll();
            metricsSuccess(metrics, event.requestContext, "getEvents");
            return response(200, items);
        } catch (err) {
            console.error(err);
            console.error(process.env.TABLE_NAME);
            metricsError(metrics, event.requestContext, "getEvents");
            return response(err.statusCode || 501, err);
        }
    }
);

export const getEventHandler = metricScope((metrics: any) => 
    async (
        event: APIGatewayProxyEvent,
    ): Promise<APIGatewayProxyResult> => {
        try {
            const item = await dynamoDB.read(event.pathParameters?.id);
            metricsSuccess(metrics, event.requestContext, "getEvent");
            return response(200, item);
        } catch (err) {
            console.error(err);
            metricsError(metrics, event.requestContext, "getEvent");
            return response(err.statusCode || 501, err);
        }
    }
);

export const createEventHandler = metricScope((metrics: any) =>
    async (
        event: APIGatewayProxyEvent,
    ): Promise<APIGatewayProxyResult> => {
        const timestamp = new Date().toISOString();
        if (event.requestContext.authorizer === null || event.body === null) {
            throw new Error("Unauthorized user");
        }
        const username = event.requestContext.authorizer?.claims["cognito:username"];

        try {
            const item: Event = {
                id: uuidv4(),
                ...JSON.parse(event.body || ""),
                createdAt: timestamp,
                createdBy: username,
                modifiedAt: timestamp,
                modifiedBy: username,
            }
            dynamoDB.write(item);
            return response(200, item);
        } catch(err) {
            console.error(err);
            metricsError(metrics, event.requestContext, "createEvent");
            return response(err.statusCode || 501, err);
        }
    }
);