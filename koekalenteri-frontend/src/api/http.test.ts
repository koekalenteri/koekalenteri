import fetchMock from "jest-fetch-mock";
import http from './http';
import { API_BASE_URL } from "../config";

fetchMock.enableMocks();

describe('http', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  describe('get', () => {
    it('should specify "GET" as method', async () => {
      fetchMock.mockResponse(req => req.method === 'GET'
        ? Promise.resolve(JSON.stringify('ok'))
        : Promise.reject(new Error(`${req.method} !== 'GET'`)));

      const json = await http.get('/test/');

      expect(json).toEqual('ok');
      expect(fetchMock.mock.calls.length).toEqual(1);
      expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/test/');
    });

    it('should throw status + statusText', async () => {
      fetchMock.mockResponse('fail', {
        status: 500,
        statusText: 'Shit hit the fan!'
      });

      await expect(http.get('/test/')).rejects.toThrow('500 Shit hit the fan!');
    });
  });

  describe('post', () => {
    it('should specify "POST" as method', async () => {
      fetchMock.mockResponse(req => req.method === 'POST'
        ? Promise.resolve(JSON.stringify('ok'))
        : Promise.reject(new Error(`${req.method} !== 'POST'`)));

      const json = await http.post('/test/', {});

      expect(json).toEqual('ok');
      expect(fetchMock.mock.calls.length).toEqual(1);
      expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/test/');
    });

    it('should throw status + statusText', async () => {
      fetchMock.mockResponse('fail', {
        status: 500,
        statusText: 'Shit hit the fan!'
      });

      await expect(http.post('/test/', {})).rejects.toThrow('500 Shit hit the fan!');
    });
  });

  describe('put', () => {
    it('should specify "POST" as method', async () => {
      fetchMock.mockResponse(req => req.method === 'PUT'
        ? Promise.resolve(JSON.stringify('ok'))
        : Promise.reject(new Error(`${req.method} !== 'PUT'`)));

      const json = await http.put('/test/', {});

      expect(json).toEqual('ok');
      expect(fetchMock.mock.calls.length).toEqual(1);
      expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/test/');
    });

    it('should throw status + statusText', async () => {
      fetchMock.mockResponse('fail', {
        status: 500,
        statusText: 'Shit hit the fan!'
      });

      await expect(http.put('/test/', {})).rejects.toThrow('500 Shit hit the fan!');
    });
  });

  describe('delete', () => {
    it('should specify "DELETE" as method', async () => {
      fetchMock.mockResponse(req => req.method === 'DELETE'
        ? Promise.resolve(JSON.stringify('ok'))
        : Promise.reject(new Error(`${req.method} !== 'DELETE'`)));

      const json = await http.delete('/test/', {});

      expect(json).toEqual('ok');
      expect(fetchMock.mock.calls.length).toEqual(1);
      expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/test/');
    });

    it('should throw status + statusText', async () => {
      fetchMock.mockResponse('fail', {
        status: 500,
        statusText: 'Shit hit the fan!'
      });

      await expect(http.delete('/test/', {})).rejects.toThrow('500 Shit hit the fan!');
    });
  });
})
