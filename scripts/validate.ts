import { existsSync, globSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { isRecord } from '../src/core/json.ts';

const SCHEMAS = ['effect', 'policy', 'approval'] as const;
const FIXTURE_ROOT = 'tests/fixtures';

// 1: a fixture was judged wrongly. 2: nothing was judged.
function fail(message: string, code: 1 | 2): never {
  process.stderr.write(`validate: ${message}\n`);
  process.exit(code);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    return fail(`${path}: ${String(error)}`, 2);
  }
}

function readSchema(path: string): Record<string, unknown> & { $id: string } {
  const schema = readJson(path);
  if (!isRecord(schema)) fail(`${path} is not an object`, 2);
  const id = schema['$id'];
  if (typeof id !== 'string') fail(`${path} has no $id`, 2);
  return { ...schema, $id: id };
}

function posix(path: string): string {
  return path.replaceAll('\\', '/');
}

function testFilesFromScript(): string[] {
  const pkg = readJson('package.json');
  if (!isRecord(pkg)) fail('package.json is not an object', 2);
  const scripts = pkg['scripts'];
  if (!isRecord(scripts)) fail('package.json has no scripts', 2);
  const command = scripts['test'];
  if (typeof command !== 'string') fail('package.json has no test script', 2);
  const glob = /"([^"]+\.test\.ts)"/.exec(command)?.[1];
  if (glob === undefined) fail(`the test script names no *.test.ts glob: ${command}`, 2);
  return globSync(glob).map(posix).sort();
}

function testFilesOnDisk(): string[] {
  return readdirSync('tests', { recursive: true })
    .map((entry) => posix(join('tests', String(entry))))
    .filter((path) => path.endsWith('.test.ts'))
    .sort();
}

function fixturePaths(schema: string, bucket: 'valid' | 'invalid'): string[] {
  const dir = join(FIXTURE_ROOT, schema, bucket);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(dir, name));
}

const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addFormat('date-time', (value: string) => !Number.isNaN(Date.parse(value)));

// Every schema is registered before any is compiled, so cross-file $refs resolve.
const registered = SCHEMAS.map((name) => {
  const schema = readSchema(`schemas/${name}.schema.json`);
  ajv.addSchema(schema);
  return { name, id: schema.$id };
});

const buckets = registered.map(({ name, id }) => {
  const validate = ajv.getSchema(id);
  if (!validate) fail(`${name}: schema did not compile`, 2);
  return {
    name,
    validate,
    valid: fixturePaths(name, 'valid'),
    invalid: fixturePaths(name, 'invalid'),
  };
});

for (const { name, validate, valid, invalid } of buckets) {
  if (valid.length === 0) fail(`${name}: no valid fixtures`, 2);
  if (invalid.length === 0) fail(`${name}: no invalid fixtures`, 2);

  for (const path of valid) {
    if (!validate(readJson(path))) {
      fail(`${path} should be accepted: ${ajv.errorsText(validate.errors)}`, 1);
    }
  }
  for (const path of invalid) {
    if (validate(readJson(path))) fail(`${path} should be rejected but was accepted`, 1);
  }
}

const fromScript = testFilesFromScript();
const onDisk = testFilesOnDisk();
if (onDisk.length === 0) fail('no *.test.ts under tests/', 2);
if (fromScript.join('\n') !== onDisk.join('\n')) {
  fail(`the test glob misses files: glob=[${fromScript.join(' ')}] disk=[${onDisk.join(' ')}]`, 2);
}

const accepted = buckets.reduce((total, b) => total + b.valid.length, 0);
const rejected = buckets.reduce((total, b) => total + b.invalid.length, 0);

process.stdout.write(
  `validate: ${buckets.length} schemas, ${accepted} accepted, ${rejected} rejected, ` +
    `${onDisk.length} test files\n`,
);
