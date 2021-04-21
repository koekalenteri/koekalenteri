'use strict'

import * as uuid from 'uuid';
import { DynamoDB } from 'aws-sdk';

//const AWSXRay = require('aws-xray-sdk-core')
//const AWS = AWSXRay.captureAWS(require('aws-sdk'))
const {metricScope, Unit} = require("aws-embedded-metrics");
const dynamoDB = new DynamoDB.DocumentClient();

// response helper
const response = (statusCode: number, body: { message: any }, additionalHeaders: any[]) => ({
    statusCode,
    body: JSON.stringify(body),
    headers: {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...additionalHeaders},
})

// Get cognito username from claims
function getCognitoUsername(event: any) {
    let authHeader = event.requestContext.authorizer;
    if (authHeader !== null)
    {
        return authHeader.claims["cognito:username"];
    }
    return null;
}


module.exports.createEvent = metricScope((metrics: { setNamespace: (arg0: string) => void; putDimensions: (arg0: { Service: string }) => void; setProperty: (arg0: string, arg1: any) => void; putMetric: (arg0: string, arg1: number, arg2: any) => void }) => 
    async(event: { body: string }, context: any, callback: (arg0: Error, arg1: { statusCode: any; body: string; headers: any }) => void) => {
        metrics.setNamespace('KoekalenteriApp');
        metrics.putDimensions({ Service: 'getEvent'});
        metrics.setProperty('RequestId', context.requestId);

        const timestamp = new Date().toISOString();
        const username = getCognitoUsername(event);
        // TODO validate input

        const params = {
            TableName: process.env.DYNAMODB_TABLE,
            Item: {
                id: uuid.v1(),
                ...JSON.parse(event.body),
                createdAt: timestamp,
                createdBy: username,
                modifiedAt: timestamp,
                modifiedBy: username,
            }
        };

        dynamoDB.put(params, (error, result) => {
            if (error) {
                metrics.putMetric("Error", 1, Unit.Count);
                console.error(error);
                callback(null, response(error.statusCode || 501, {message: error.message}, null));
                return;
            };

            metrics.putMetric("Success", 1, Unit.Count);
            callback(null, response(200, params.Item, null));
        });
    }
)

module.exports.getEvent = metricScope((metrics: { setNamespace: (arg0: string) => void; putDimensions: (arg0: { Service: string }) => void; setProperty: (arg0: string, arg1: any) => void; putMetric: (arg0: string, arg1: number, arg2: any) => void }) => 
    async(event: any, context: { requestId: any }, callback: (arg0: any, arg1: { statusCode: any; body: string; headers?: any }) => void) => {
        metrics.setNamespace('KoekalenteriApp');
        metrics.putDimensions({ Service: 'getEvent'});
        metrics.setProperty('RequestId', context.requestId);

        const params = {
            TableName: process.env.DYNAMODB_TABLE,
        };

        // TODO scan is bad, we MUST you query instead but requires more thought on table and index structure
        dynamoDB.scan(params, (error, result) => {
            if (error) {
                console.error(error);
                callback(null, response(error.statusCode || 501, {message: error.message}, null));
                return;
            };

            callback(null, response(200, result.Items, null));
        });
    }
)

module.exports.getEvent = metricScope((metrics: { setNamespace: (arg0: string) => void; putDimensions: (arg0: { Service: string }) => void; setProperty: (arg0: string, arg1: any) => void; putMetric: (arg0: string, arg1: number, arg2: any) => void }) => 
    async(event: any, context: { requestId: any }, callback: (arg0: any, arg1: { statusCode: any; body: string; headers?: any }) => void) => {
        metrics.setNamespace('KoekalenteriApp');
        metrics.putDimensions({ Service: 'getEvent'});
        metrics.setProperty('RequestId', context.requestId);

        const params = {
            TableName: process.env.DYNAMODB_TABLE,
            Key: {
                id: event.pathParameters.id,
            },
        };

        dynamoDB.get(params, (error, result) => {
            if (error) {
                console.error(error);
                metrics.putMetric("Errror", 1, Unit.Count);
                callback(null, response(error.statusCode || 501, { message: error.message}, null));
                return;
            }

            metrics.putMetric("Success", 1, Unit.Count);
            callback(null, response(200, result.Item, null));
        })
    }
)

