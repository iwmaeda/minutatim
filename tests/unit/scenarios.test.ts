import { ok, strictEqual } from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import { InMemoryApprovalLedger, issueApproval } from '../../src/core/approval-ledger.ts';
import type { Effect } from '../../src/core/effects.ts';
import { gate } from '../../src/core/gate.ts';
import type { Decision, Policy } from '../../src/core/policy.ts';
import { step, type Session, type SessionEvent } from '../../src/core/session.ts';
import { createAjv } from '../support/ajv.ts';
import { loadSchema } from '../support/schema.ts';

type ScenarioStep =
  | { effect: Effect; decision: Decision; expect: string }
  | { at?: string; event: SessionEvent; expect: string }
  | { at?: string; issue: { approvalId: string; expiresAt: string } };

interface Scenario {
  $schema?: string;
  description: string;
  policy: string;
  start: string;
  steps: ScenarioStep[];
}

const SCENARIO_DIR = 'tests/fixtures/scenarios';

const ajv = createAjv();
for (const name of ['effect', 'policy', 'approval']) ajv.addSchema(loadSchema(name));
const scenarioSchema: unknown = JSON.parse(
  readFileSync('tests/support/scenario.schema.json', 'utf8'),
);
ok(typeof scenarioSchema === 'object' && scenarioSchema !== null);
const validateScenario = ajv.compile<Scenario>(scenarioSchema);
const validatePolicy = schemaById<Policy>('policy');

function schemaById<T>(name: string): ValidateFunction<T> {
  const validate = ajv.getSchema<T>(
    `https://raw.githubusercontent.com/iwmaeda/minutatim/main/schemas/${name}.schema.json`,
  );
  if (validate === undefined) throw new Error(`${name} schema is not registered`);
  return validate;
}

// Fixtures are checked against their schemas before any field is read.
function load<T>(validate: ValidateFunction<T>, path: string): T {
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!validate(data)) throw new Error(`${path}: ${ajv.errorsText(validate.errors)}`);
  return data;
}

// A step happens at its `at`, or an effect at its observedAt; otherwise when the step before did.
function play(scenario: Scenario, policy: Policy): void {
  const ledger = new InMemoryApprovalLedger();
  let session: Session = { state: 'PLAN' };
  let now = new Date(scenario.start);
  for (const [index, entry] of scenario.steps.entries()) {
    const label = `step ${index + 1}`;
    if ('effect' in entry) {
      now = new Date(entry.effect.observedAt);
      const result = gate(policy, session, entry.effect, { ledger, now });
      strictEqual(result.evaluation.decision, entry.decision, `${label} decision`);
      strictEqual(result.run ? 'run' : result.block.kind, entry.expect, label);
      session = result.session;
      continue;
    }
    if (entry.at !== undefined) now = new Date(entry.at);
    if ('issue' in entry) {
      if (!('proposal' in session)) throw new Error(`${label}: no proposal awaits approval`);
      const { approvalId, expiresAt } = entry.issue;
      const options = { approvalId, issuedAt: now, expiresAt: new Date(expiresAt) };
      ledger.record(issueApproval(session.proposal, options));
      continue;
    }
    const result = step(session, entry.event, { ledger, now });
    strictEqual(result.ok ? result.session.state : result.refusal.kind, entry.expect, label);
    if (result.ok) session = result.session;
  }
}

const files = readdirSync(SCENARIO_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();

test('there are scenarios to play', () => {
  ok(files.length > 0, `no scenarios under ${SCENARIO_DIR}`);
});

for (const file of files) {
  test(`scenario ${file}`, () => {
    const scenario = load(validateScenario, join(SCENARIO_DIR, file));
    const policyPath = `tests/fixtures/policy/valid/${scenario.policy}.json`;
    play(scenario, load(validatePolicy, policyPath));
  });
}
