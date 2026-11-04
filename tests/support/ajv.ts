import { Ajv2020 } from 'ajv/dist/2020.js';

export function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addFormat('date-time', (value: string) => !Number.isNaN(Date.parse(value)));
  return ajv;
}
