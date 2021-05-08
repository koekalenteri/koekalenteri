import { constructAPIGwEvent } from "../../utils/helpers";

// Import all functions from event.ts 
import { getEventsHandler, getEventHandler, createEventHandler } from '../../../src/handlers/event'; 
// Import dynamodb from aws-sdk 
import { DocumentClient } from 'aws-sdk/clients/dynamodb'; 
 
// This includes all tests for getEventsHandler() 
describe('Test getAEventsHandler', () => { 
    let scanSpy: any; 
 
    // Test one-time setup and teardown, see more in https://jestjs.io/docs/en/setup-teardown 
    beforeAll(() => { 
        // Mock dynamodb get and put methods 
        // https://jestjs.io/docs/en/jest-object.html#jestspyonobject-methodname 
        scanSpy = jest.spyOn(DocumentClient.prototype, 'scan'); 
    }); 
 
    // Clean up mocks 
    afterAll(() => { 
        scanSpy.mockRestore(); 
    }); 
 
    it('should return ids', async () => { 
        const items = [{ id: 'id1' }, { id: 'id2' }]; 
 
        // Return the specified value whenever the spied scan function is called 
        scanSpy.mockReturnValue({ 
            promise: () => Promise.resolve({ Items: items }) 
        }); 
 
        const event = constructAPIGwEvent({}, { method: 'GET' });
 
        // Invoke helloFromLambdaHandler() 
        const result = await getEventsHandler(event); 
 
        const expectedResult = { 
            statusCode: 200, 
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(items) 
        }; 
 
        // Compare the result with the expected result 
        expect(result).toEqual(expectedResult); 
    }); 
}); 