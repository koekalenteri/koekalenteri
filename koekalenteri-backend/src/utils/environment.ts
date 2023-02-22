import { SSM } from 'aws-sdk';

const ssm = new SSM();

type ValuesOf<T extends string[]> = T[number];
type ParamsFromKeys<T extends string[]> = { [key in ValuesOf<T>]: string };

export async function getSSMParams(names: string[]): Promise<ParamsFromKeys<typeof names>> {
  const result = await ssm.getParameters({ Names: names }).promise();
  const values: ParamsFromKeys<typeof names> = {};
  const params = result.Parameters || [];
  for (const name of names) {
    values[name] = params.find(p => p.Name === name)?.Value || '';
  }
  return values;
}
  