import assert from 'assert';
import { matchCrmTasksByName } from '../utils/crmMatch';
import { detectCloseCommand, detectCloseByIndex } from '../services/crmParser';
import { CrmTask } from '../types/crmTask';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(id: string, contact_name: string): CrmTask {
  return {
    id,
    chat_id:         '100',
    contact_name,
    contact_phone:   null,
    contact_type:    'client',
    agreement:       '',
    action_required: `action for ${contact_name}`,
    deadline_text:   null,
    deadline_at:     null,
    next_step:       null,
    comment:         null,
    status:          'active',
    raw_text:        '',
    created_at:      new Date().toISOString(),
    updated_at:      new Date().toISOString(),
    completed_at:    null,
  };
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
    failed++;
  }
}

// ─── matchCrmTasksByName ──────────────────────────────────────────────────────

console.log('\nmatchCrmTasksByName:');

test('"City" fuzzy-matches SunCity + OldCity, no exact', () => {
  const tasks = [makeTask('1', 'SunCity'), makeTask('2', 'OldCity')];
  const { exact, fuzzy } = matchCrmTasksByName(tasks, 'City');
  assert.strictEqual(exact.length, 0);
  assert.strictEqual(fuzzy.length, 2);
});

test('"SunCity" exact match only', () => {
  const tasks = [makeTask('1', 'SunCity'), makeTask('2', 'OldCity')];
  const { exact, fuzzy } = matchCrmTasksByName(tasks, 'SunCity');
  assert.strictEqual(exact.length, 1);
  assert.strictEqual(exact[0].id, '1');
  assert.strictEqual(fuzzy.length, 0);
});

test('"suncity" case-insensitive exact match', () => {
  const tasks = [makeTask('1', 'SunCity'), makeTask('2', 'OldCity')];
  const { exact } = matchCrmTasksByName(tasks, 'suncity');
  assert.strictEqual(exact.length, 1);
  assert.strictEqual(exact[0].id, '1');
});

test('"FavorAuto" no match', () => {
  const tasks = [makeTask('1', 'SunCity'), makeTask('2', 'OldCity')];
  const { exact, fuzzy } = matchCrmTasksByName(tasks, 'FavorAuto');
  assert.strictEqual(exact.length, 0);
  assert.strictEqual(fuzzy.length, 0);
});

test('empty task list returns empty', () => {
  const { exact, fuzzy } = matchCrmTasksByName([], 'City');
  assert.strictEqual(exact.length, 0);
  assert.strictEqual(fuzzy.length, 0);
});

// ─── detectCloseByIndex ───────────────────────────────────────────────────────

console.log('\ndetectCloseByIndex:');

test('"crm 1 выполнено" → { index:1, action:done }', () => {
  const r = detectCloseByIndex('crm 1 выполнено');
  assert.deepStrictEqual(r, { index: 1, action: 'done' });
});

test('"crm 3 отменить" → { index:3, action:cancelled }', () => {
  const r = detectCloseByIndex('crm 3 отменить');
  assert.deepStrictEqual(r, { index: 3, action: 'cancelled' });
});

test('"закрыть crm 2" → { index:2, action:done }', () => {
  const r = detectCloseByIndex('закрыть crm 2');
  assert.deepStrictEqual(r, { index: 2, action: 'done' });
});

test('"City выполнено" is NOT close-by-index', () => {
  assert.strictEqual(detectCloseByIndex('City выполнено'), null);
});

test('"SunCity выполнено" is NOT close-by-index', () => {
  assert.strictEqual(detectCloseByIndex('SunCity выполнено'), null);
});

// ─── Safety integration: "City выполнено" must NOT auto-close ────────────────

console.log('\nSafety: "City выполнено" with SunCity + OldCity active:');

test('"City выполнено" → detectCloseByIndex=null, detectCloseCommand={name:"City"}', () => {
  assert.strictEqual(detectCloseByIndex('City выполнено'), null);
  const cmd = detectCloseCommand('City выполнено');
  assert.ok(cmd, 'should be detected as close command');
  assert.strictEqual(cmd!.name, 'City');
  assert.strictEqual(cmd!.action, 'done');
});

test('"City" name → 0 exact + 2 fuzzy → router must ask clarify, not auto-close', () => {
  const tasks = [makeTask('1', 'SunCity'), makeTask('2', 'OldCity')];
  const { exact, fuzzy } = matchCrmTasksByName(tasks, 'City');
  // exact=0 means handleCrmClose will NOT call closeCrmTask immediately
  assert.strictEqual(exact.length, 0, 'no exact match — auto-close blocked');
  // fuzzy>0 means bot will show disambiguation list
  assert.strictEqual(fuzzy.length, 2, 'two candidates shown to user');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
