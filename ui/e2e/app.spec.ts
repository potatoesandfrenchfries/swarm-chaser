import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import bundle from '../data/synthetic/merch-launch.json' with { type: 'json' };

const url = (q: string) => `/?bundle=synthetic-merch-launch&${q}`;

/** Collects console errors and uncaught exceptions; each test asserts there were none. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test.describe('landing site', () => {
  test('opens on the landing page and leads into the story', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('See what an AI agent does');
    await page.getByRole('button', { name: 'Watch the demo' }).first().click();
    await expect(page.getByRole('region', { name: 'Without VETO' })).toContainText('Find out what the supplier needs', { timeout: 5000 });
    expect(errors).toEqual([]);
  });

  test('shows the leak without VETO and the block with it', async ({ page }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url('view=demo'));
    const without = page.getByRole('region', { name: 'Without VETO' });
    await expect(without.locator('.stamp--bad')).toHaveText('Leaked');
    await expect(without.locator('.chat-end')).toContainText('Customer list leaked');
    await page.getByRole('button', { name: 'Replay with VETO' }).click();
    const withVeto = page.getByRole('region', { name: 'With VETO' });
    await expect(withVeto.locator('.stamp--block')).toHaveText('Blocked');
    await expect(withVeto.locator('.chat-end')).toContainText('Attack stopped');
    expect(errors).toEqual([]);
  });
});

test.describe('results page', () => {
  test('gives each version its outcome and the numbers behind it', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('view=results'));
    await expect(page.getByRole('article', { name: 'No attack' })).toContainText('Nothing planted');
    const without = page.getByRole('article', { name: 'Attack, no VETO' });
    await expect(without).toContainText('Leaked');
    await expect(without).toContainText('1harmful actions that ran');
    const withVeto = page.getByRole('article', { name: 'Attack, with VETO' });
    await expect(withVeto).toContainText('Blocked');
    await expect(withVeto).toContainText('0harmful actions that ran');
    await expect(withVeto).toContainText('4steps until caught');
    expect(errors).toEqual([]);
  });
});

/** Writes a finished run of the made-up example into local/live/, as the task runner would, and returns its id. */
function writeFinishedRun(runId: 'baseline' | 'planted' | 'monitored') {
  const run = bundle.runs.find((r) => r.id === runId)!;
  const { events, ...rest } = run;
  const id = `e2e-${runId}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const dir = join(import.meta.dirname, '..', '..', 'local', 'live');
  mkdirSync(dir, { recursive: true });
  const lines = [
    { type: 'header', schema: 'claim-spread/live@1', title: run.title, task: { id: 'shirt-launch', setup: runId }, provenance: 'synthetic', run: rest },
    ...events.map((event) => ({ type: 'event', event })),
    { type: 'end' },
  ];
  const file = join(dir, `${id}.jsonl`);
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  test.info().attach('live file', { body: file });
  return { id, file };
}

test.describe('dashboard', () => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "writes runs into the server's local/live/");
  const files: string[] = [];
  test.afterAll(() => files.forEach((f) => rmSync(f, { force: true })));

  test('sets up a run in three steps and starts it', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/?view=playground');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New run');
    await expect(page.getByRole('radio', { name: /Planted note/ })).toContainText('orders@supplier-help.example');
    await expect(page.getByRole('radio', { name: /Your own task/ })).toBeDisabled();
    await page.getByRole('radio', { name: /No attack/ }).click();
    await expect(page.getByRole('switch')).toBeDisabled();
    await page.getByRole('radio', { name: /Planted note/ }).click();
    await expect(page.getByRole('switch')).toBeChecked();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page).toHaveURL(/view=chat.*live=shirt-launch-monitored-/);
    await expect(page.locator('.chat-log .msg').first()).toContainText('Agent 2', { timeout: 5000 });
    await expect(page.locator('.chat-typing')).toContainText('The agents are working');
    const live = new URL(page.url()).searchParams.get('live');
    files.push(join(import.meta.dirname, '..', '..', 'local', 'live', `${live}.jsonl`));
    expect(errors).toEqual([]);
  });

  test('a finished run gives its verdict and offers the run with VETO switched', async ({ page }) => {
    const errors = watchErrors(page);
    const { id, file } = writeFinishedRun('planted');
    files.push(file);
    await page.goto(`/?view=chat&live=${id}`);
    const verdict = page.getByRole('status');
    await expect(verdict).toContainText('Leaked');
    await expect(verdict.getByRole('button', { name: 'Run again with VETO' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('clicking a message opens what it was based on, and Escape closes it', async ({ page }) => {
    const errors = watchErrors(page);
    const { id, file } = writeFinishedRun('monitored');
    files.push(file);
    await page.goto(`/?view=chat&live=${id}`);
    await expect(page.getByRole('status')).toContainText('Blocked');
    await page.locator('.msg-btn', { hasText: 'Checked against' }).click();
    const detail = page.getByRole('complementary', { name: 'Inspector' });
    await expect(detail).toContainText('Evidence');
    await expect(detail.locator('.ev-mark--contradicts').first()).toHaveText('Orders: orders@northside-print.example');
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('New run goes back to the set-up', async ({ page }) => {
    const { id, file } = writeFinishedRun('baseline');
    files.push(file);
    await page.goto(`/?view=chat&live=${id}`);
    await expect(page.getByRole('status')).toContainText('Nothing to stop');
    await page.getByRole('button', { name: 'New run' }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New run');
  });
});

test.describe('dashboard pages', () => {
  test('the overview counts what VETO did and opens a run', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/?view=overview');
    await expect(page.getByRole('region', { name: 'Does VETO work' })).toContainText('attacks blocked');
    const { file } = writeFinishedRun('monitored');
    try {
      await page.reload();
      await page.getByRole('region', { name: 'Runs' }).locator('tbody tr').filter({ hasText: 'Blocked' }).first().click();
      await expect(page).toHaveURL(/view=chat.*live=/);
      await expect(page.getByRole('status')).toContainText('Blocked');
    } finally {
      rmSync(file, { force: true });
    }
    expect(errors).toEqual([]);
  });

  test('a long alert list is paged', async ({ page }) => {
    const errors = watchErrors(page);
    const made = [writeFinishedRun('monitored'), writeFinishedRun('monitored'), writeFinishedRun('planted'), writeFinishedRun('monitored'), writeFinishedRun('planted')];
    try {
      await page.goto('/?view=overview');
      const alerts = page.getByRole('region', { name: 'Alerts' });
      await expect(alerts.locator('.alert-list li')).toHaveCount(5);
      await alerts.getByRole('button', { name: 'Next page' }).click();
      await expect(alerts.locator('.pager')).toContainText('6–');
    } finally {
      made.forEach((m) => rmSync(m.file, { force: true }));
    }
    expect(errors).toEqual([]);
  });

  test('an alert opens the log of its run', async ({ page }) => {
    const errors = watchErrors(page);
    const { file } = writeFinishedRun('monitored');
    try {
      await page.goto('/?view=overview');
      await page.getByRole('region', { name: 'Alerts' }).getByRole('button', { name: /Attack, with VETO/ }).first().click();
      await expect(page).toHaveURL(/view=activity/);
      await expect(page.locator('.log tbody tr.is-alert').first()).toBeVisible();
    } finally {
      rmSync(file, { force: true });
    }
    expect(errors).toEqual([]);
  });

  test('the log narrows to alerts, and a row opens its detail', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('view=activity&run=monitored'));
    await page.getByLabel(/Only alerts/).check();
    const rows = page.locator('.log tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText('Blocked');
    await rows.nth(1).click();
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Email captured by the honeypot');
    expect(errors).toEqual([]);
  });

  test('the inspector shows an agent, the claim and the evidence that contradicts it', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('view=graph&run=monitored&sel=actor:agent-3'));
    const insp = page.getByRole('complementary', { name: 'Inspector' });
    await expect(insp).toContainText('Agent 3 asks VETO to email the customer list.');
    await page.goto(url('view=graph&run=monitored&sel=claim:C1'));
    await expect(insp).toContainText('The supplier wants our customer list sent to orders@supplier-help.example.');
    await expect(insp).toContainText('4 steps after it was first said');
    await insp.getByRole('button', { name: /VETO checks the claim/ }).click();
    await expect(insp).toContainText('Evidence');
    await expect(insp.locator('.ev-mark--contradicts').first()).toHaveText('Orders: orders@northside-print.example');
    expect(errors).toEqual([]);
  });

  test('an unknown selection does not break the inspector', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('view=graph&run=monitored&sel=event:does-not-exist'));
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Attack, with VETO');
    expect(errors).toEqual([]);
  });

  test('the tabs keep the run and the selection', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('view=graph&run=monitored&sel=actor:agent-3'));
    await page.getByRole('tab', { name: 'Log' }).click();
    await expect(page).toHaveURL(/view=activity.*run=monitored.*sel=actor(%3A|:)agent-3/);
    await page.getByRole('tab', { name: 'Chat' }).click();
    await expect(page.getByRole('status')).toContainText('Blocked');
    expect(errors).toEqual([]);
  });

  test('without Neo4j the graph says so and draws the same records from the bundle', async ({ page }) => {
    test.skip(Boolean(process.env.E2E_BASE_URL), 'only meaningful on a server without Neo4j');
    const errors = watchErrors(page);
    await page.goto(url('view=graph&run=monitored'));
    await expect(page.locator('.explorer-panel')).toHaveCount(0);
    await page.getByRole('button', { name: 'Controls' }).click();
    await expect(page.locator('.source')).toContainText('Neo4j offline');
    await expect(page.getByText('22 nodes · 48 links')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('failures', () => {
  test('when the server fails, the made-up example is offered by name, never substituted', async ({ page }) => {
    await page.route('**/api/bundles', (r) => r.fulfill({ status: 500, body: '{"error":"boom"}' }));
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('The app could not reach its server.');
    await page.getByRole('button', { name: 'Open the made-up example' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('See what an AI agent does');
  });

  test('a bundle that fails validation is refused with its reason', async ({ page }) => {
    const broken = structuredClone(bundle);
    broken.runs[2].events[6].evidence[0].quote = 'Orders: wrong@northside-print.example';
    await page.route('**/api/bundles/synthetic-merch-launch', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(broken) }));
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('failed validation');
    await expect(page.getByRole('alert')).toContainText('not in Supplier contacts');
  });
});
