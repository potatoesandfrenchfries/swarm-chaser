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

test.describe('dashboard', () => {
  test('the overview lists the alerts and opens one in the activity log', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('view=overview'));
    const alerts = page.getByRole('region', { name: 'Alerts' });
    await expect(alerts.getByRole('button')).toHaveCount(4);
    await alerts.getByRole('button', { name: /VETO sends the email to the honeypot/ }).click();
    await expect(page).toHaveURL(/view=activity.*run=monitored.*sel=event(%3A|:)m-e07/);
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Email captured by the honeypot');
    expect(errors).toEqual([]);
  });

  test('the activity log filters to alerts and shows what VETO decided', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('view=activity&run=monitored'));
    await page.getByRole('radio', { name: 'Alerts' }).click();
    const rows = page.locator('.log tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText('Blocked');
    expect(errors).toEqual([]);
  });

  test('a new task streams into the activity log', async ({ page }) => {
    test.skip(Boolean(process.env.E2E_BASE_URL), 'writes a run into the server\'s local/live/');
    const errors = watchErrors(page);
    await page.goto(url('view=overview'));
    await page.getByRole('button', { name: 'New task' }).click();
    await page.getByLabel(/Attack, VETO on/).check();
    await page.getByRole('button', { name: 'Run task' }).click();
    await expect(page).toHaveURL(/view=activity.*live=shirt-launch-monitored-/);
    await expect(page.locator('.log tbody tr').first()).toContainText('Agent 2 asks Agent 1', { timeout: 5000 });
    await expect(page.locator('.page-head .outcome')).toHaveText('Running');
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

  test('an event with no evidence and an unknown selection do not break the inspector', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('view=graph&run=monitored&sel=event:m-e01'));
    const insp = page.getByRole('complementary', { name: 'Inspector' });
    await expect(insp).toContainText('Agent 1 reads a note that was planted on purpose.');
    await expect(insp).not.toContainText('Evidence');
    await page.goto(url('view=graph&run=monitored&sel=event:does-not-exist'));
    await expect(insp).toContainText('Attack, with VETO');
    expect(errors).toEqual([]);
  });

  test('switching views keeps the run and the selection', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('view=graph&run=monitored&sel=actor:agent-3'));
    await page.keyboard.press('1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview');
    await page.keyboard.press('3');
    await expect(page).toHaveURL(/view=graph.*run=monitored.*sel=actor(%3A|:)agent-3/);
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Agent 3');
    expect(errors).toEqual([]);
  });

  test('the session list loads that run', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('view=graph&run=monitored'));
    await page.getByRole('radio', { name: /Attack, no VETO/ }).click();
    await expect(page).toHaveURL(/run=planted/);
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Agent 3 reports back, repeating the claim.');
    expect(errors).toEqual([]);
  });

  test('without Neo4j the explorer says so and draws the same records from the bundle', async ({ page, baseURL }) => {
    test.skip(Boolean(process.env.E2E_BASE_URL), 'only meaningful on a server without Neo4j');
    const errors = watchErrors(page);
    await page.goto(url('view=graph&run=monitored'));
    await expect(page.locator('.source')).toContainText('Neo4j offline');
    await expect(page.getByText('22 nodes · 48 links')).toBeVisible();
    expect(errors).toEqual([]);
    expect(baseURL).toBeTruthy();
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
