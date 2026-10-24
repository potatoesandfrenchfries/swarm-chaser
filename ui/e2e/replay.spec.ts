import { expect, test, type Page } from '@playwright/test';
import bundle from '../data/synthetic/merch-launch.json' with { type: 'json' };

const monitored = bundle.runs.find((r) => r.id === 'monitored')!;
const url = (q: string) => `/?bundle=synthetic-merch-launch&${q.startsWith('view=') ? q : `view=replay&${q}`}`;

/** Collects console errors and uncaught exceptions; each test asserts there were none. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function seek(page: Page, step: number) {
  // step is 1-based as shown in the UI; the range input is 0-based with -1 = before the first event.
  await page.getByLabel('Replay position').fill(String(step - 1));
  // Wait for the render, not a timer: the caption names the step once React has committed it.
  await expect(page.locator('.caption-step')).toContainText(step > 0 ? `Step ${step} of` : 'Before step 1');
}

async function snapshot(page: Page) {
  return {
    caption: await page.locator('.caption').innerText(),
    meter: await page.locator('.meter-stats').innerText(),
    records: await page.locator('.record').allInnerTexts(),
    rings: await page.locator('.ring, .badge--acted').count(),
    edges: await page.locator('.edges .edge').count(),
  };
}

test.describe('replay', () => {
  test('opens on the landing page, labelled as made up, and leads into the story', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Watch one false sentence spread through a team of AI agents.');
    await expect(page.locator('.home-note')).toContainText('made-up example');
    await expect(page.locator('.topbar .provenance')).toContainText('Made-up example');
    await expect(page.locator('.topbar .provenance')).toContainText('not real research data');
    await page.getByRole('button', { name: 'Watch the story' }).click();
    await expect(page.locator('.caption')).toContainText('Before step 1 of 15');
    await expect(page.locator('.meter-id')).toContainText('The planted claim (false on purpose)');
    await expect(page.getByRole('button', { name: /^Agent 1\./ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Judge\./ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('step forward and back select the expected events', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('run=monitored&step=0'));
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect(page.locator('.caption-line')).toHaveText(monitored.events[0].summary);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.caption-line')).toHaveText(monitored.events[2].summary);
    await page.getByRole('button', { name: 'Previous step' }).click();
    await expect(page.locator('.caption-line')).toHaveText(monitored.events[1].summary);
    await expect(page).toHaveURL(/step=2/);
    expect(errors).toEqual([]);
  });

  test('seeking is deterministic and rewinding restores earlier state', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('run=monitored&step=0'));
    await seek(page, 9);
    const at9 = await snapshot(page);
    expect(at9.records.join(' ')).toContain('quantity 200');
    await expect(page.locator('.meter-stats')).toContainText('Contradicted');

    await seek(page, 14);
    await expect(page.locator('.record').filter({ hasText: 'Store listing' })).toContainText('quantity 40');
    await seek(page, 3);
    await expect(page.locator('.record').filter({ hasText: 'Store listing' })).toContainText('not changed yet');
    await expect(page.locator('.meter-stats')).toContainText('Not checked yet');

    await seek(page, 9);
    expect(await snapshot(page)).toEqual(at9);
    expect(errors).toEqual([]);
  });

  test('rapid scrubbing ends in the same state as a direct seek', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('run=monitored&step=12'));
    await expect(page.locator('.caption-step')).toContainText('Step 12 of');
    const direct = await snapshot(page);
    const range = page.getByLabel('Replay position');
    for (const s of [3, 14, 0, 9, 1, 15, 6, 12, 2, 11, 13, 5, 12]) await range.fill(String(s - 1));
    await expect(page.locator('.caption-step')).toContainText('Step 12 of');
    expect(await snapshot(page)).toEqual(direct);
    expect(errors).toEqual([]);
  });

  test('play advances, pause holds', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('run=monitored&step=0'));
    await page.getByLabel('Playback speed').selectOption('4');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.dock-state')).toHaveText('Playing');
    await expect(page.locator('.dock-step b')).not.toHaveText('0', { timeout: 3000 });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const held = await page.locator('.dock-step b').innerText();
    await page.waitForTimeout(1500);
    await expect(page.locator('.dock-step b')).toHaveText(held);
    await expect(page.locator('.dock-state')).toHaveText('Paused');
    expect(errors).toEqual([]);
  });

  test('selecting an agent shows its records; selecting the claim shows its evidence trail', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('run=monitored&step=9'));
    await page.getByRole('button', { name: /^Agent 3\./ }).click();
    const insp = page.getByRole('complementary', { name: 'Inspector' });
    await expect(insp).toContainText('Agent 3');
    await expect(insp).toContainText('Agent 3 lists 200 shirts for sale.');
    await page.getByRole('button', { name: 'Inspect claim C1' }).click();
    await expect(insp).toContainText('The supplier confirmed all 200 shirts are in stock.');
    await expect(insp).toContainText('False on purpose');
    await expect(insp).toContainText('6 steps after it was first said');
    // The Judge's check shows the line of the stock sheet it rests on.
    await insp.getByRole('button', { name: /The Judge checks the claim/ }).click();
    await expect(insp).toContainText('The evidence');
    await expect(insp.locator('.ev-mark--contradicts')).toHaveText('TS-01 shirts on hand: 40');
    expect(errors).toEqual([]);
  });

  test('an event with no evidence and an unknown selection do not break the inspector', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('view=replay&run=monitored&step=2&sel=event:m-e01'));
    const insp = page.getByRole('complementary', { name: 'Inspector' });
    await expect(insp).toContainText('Agent 1 reads a note that was planted on purpose.');
    await expect(insp).not.toContainText('The evidence');
    await page.goto(url('view=replay&run=monitored&step=2&sel=event:does-not-exist'));
    await expect(insp).toContainText('False note, with a Judge');
    expect(errors).toEqual([]);
  });

  test('switching views keeps the run, step and selection', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('run=monitored&step=9'));
    await page.getByRole('button', { name: /^Agent 3\./ }).click();
    await page.keyboard.press('3');
    await expect(page).toHaveURL(/view=graph.*step=9.*sel=actor(%3A|:)agent-3/);
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Agent 3');
    await page.keyboard.press('2');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('What happens when a false note is planted');
    await page.keyboard.press('1');
    await expect(page.getByLabel('Replay position')).toHaveValue('8');
    await expect(page.getByRole('button', { name: /^Agent 3\./ })).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });

  test('switching views during playback stays consistent', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('run=monitored&step=0'));
    await page.getByLabel('Playback speed').selectOption('4');
    await page.locator('.stage').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Space');
    await page.waitForTimeout(700);
    await page.keyboard.press('2');
    await page.keyboard.press('3');
    await page.keyboard.press('1');
    await page.keyboard.press('Space');
    const step = Number(await page.locator('.dock-step b').innerText());
    await expect(page.locator('.caption-step')).toContainText(`Step ${step} of 15`);
    expect(errors).toEqual([]);
  });

  test('switching conditions loads that run', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('run=monitored&step=0'));
    await page.getByLabel('Run').selectOption('planted');
    await expect(page.locator('.caption')).toContainText('Before step 1 of 8');
    await page.keyboard.press('End');
    await expect(page.locator('.meter-stats')).toContainText('Not checked yet');
    await expect(page.locator('.record').filter({ hasText: 'Store listing' })).toContainText('quantity 200');
    await page.getByLabel('Run').selectOption('baseline');
    await expect(page.locator('.meter-quote')).toContainText('The stock sheet shows 40 shirts on hand.');
    await expect(page.locator('.stage-nodes')).not.toContainText('Judge');
    expect(errors).toEqual([]);
  });

  test('reduced motion: the state changes but nothing travels', async ({ page }) => {
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url('run=monitored&step=3'));
    await expect(page.locator('.caption-step')).toContainText('Step 3 of');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.pulse')).toHaveCount(0);
    await expect(page.locator('.caption-line')).toHaveText(monitored.events[3].summary);
    expect(errors).toEqual([]);
  });
});

test.describe('compare', () => {
  test('shows each condition with defined metrics and opens the replay at a counted event', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(url('view=compare&run=monitored&step=0'));
    await expect(page.getByText('3 versions, one run each', { exact: false })).toBeVisible();
    const planted = page.getByRole('article', { name: 'False note, no Judge' });
    await expect(planted).toContainText('Never');
    await expect(page.getByRole('article', { name: 'False note, with a Judge' })).toContainText('6 steps');
    await expect(page.getByRole('article', { name: 'No false note' })).toContainText('No false claim');
    await page.getByRole('article', { name: 'False note, with a Judge' }).getByRole('button', { name: /6 steps/ }).click();
    await expect(page).toHaveURL(/view=replay.*run=monitored.*step=9/);
    await expect(page.locator('.caption-line')).toHaveText(monitored.events[8].summary);
    expect(errors).toEqual([]);
  });
});

test.describe('graph explorer and failures', () => {
  test('without Neo4j the explorer says so and draws the same records from the bundle', async ({ page, baseURL }) => {
    test.skip(Boolean(process.env.E2E_BASE_URL), 'only meaningful on a server without Neo4j');
    const errors = watchErrors(page);
    await page.goto(url('view=graph&run=monitored&step=15'));
    await expect(page.locator('.source')).toContainText('Neo4j offline');
    await expect(page.locator('.source')).toContainText('Showing the same records drawn from the bundle file');
    await expect(page.getByText('25 nodes, 59 relationships')).toBeVisible();
    expect(errors).toEqual([]);
    expect(baseURL).toBeTruthy();
  });

  test('when the server fails, the made-up example is offered by name, never substituted', async ({ page }) => {
    await page.route('**/api/bundles', (r) => r.fulfill({ status: 500, body: '{"error":"boom"}' }));
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('The app could not reach its server.');
    await expect(page.locator('.topbar .provenance')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open the made-up example' }).click();
    await expect(page.locator('.topbar .provenance')).toContainText('Made-up example');
  });

  test('a bundle that fails validation is refused with its reason', async ({ page }) => {
    const broken = structuredClone(bundle);
    broken.runs[2].events[8].evidence[0].quote = 'TS-01 shirts on hand: 400';
    await page.route('**/api/bundles/synthetic-merch-launch', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(broken) }));
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('failed validation');
    await expect(page.getByRole('alert')).toContainText('not in Stock sheet');
  });
});
