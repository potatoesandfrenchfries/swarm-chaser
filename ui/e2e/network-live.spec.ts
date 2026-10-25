import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import fixture from '../data/synthetic/merch-launch.json' with { type: 'json' };

test('the dashboard follows streamed graph/chat events, pauses at the latest step, and resumes', async ({ page }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), 'writes a temporary synthetic run into the local stream directory');
  const run = fixture.runs.find((r) => r.id === 'monitored')!;
  const { events, ...headerRun } = run;
  const id = `e2e-network-stream-${Date.now()}`;
  const dir = join(import.meta.dirname, '..', '..', 'local', 'live');
  const file = join(dir, `${id}.jsonl`);
  mkdirSync(dir, { recursive: true });
  const line = (value: unknown) => `${JSON.stringify(value)}\n`;
  writeFileSync(file, line({ type: 'header', schema: 'claim-spread/live@1', title: run.title, provenance: 'synthetic', run: headerRun }) + events.slice(0, 2).map((event) => line({ type: 'event', event })).join(''));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`/?view=graph&live=${id}`);
    await expect(page.locator('.network-card')).toHaveAttribute('data-step', '2');
    await expect(page.locator('.replay-workspace .chat .msg')).toHaveCount(2);
    appendFileSync(file, line({ type: 'event', event: events[2] }));
    await expect(page.locator('.network-card')).toHaveAttribute('data-step', '3');
    await expect(page.locator('.replay-workspace .chat .msg')).toHaveCount(3);
    await page.getByRole('button', { name: 'Pause live', exact: true }).click();
    appendFileSync(file, line({ type: 'event', event: events[3] }));
    await expect(page.locator('.run-head')).toContainText('4 steps');
    await expect(page.locator('.network-card')).toHaveAttribute('data-step', '3');
    await expect(page.locator('.replay-workspace .chat .msg')).toHaveCount(3);
    await page.getByRole('button', { name: 'Follow latest', exact: true }).click();
    await expect(page.locator('.network-card')).toHaveAttribute('data-step', '4');
    await expect(page.locator('.replay-workspace .chat .msg')).toHaveCount(4);
    appendFileSync(file, events.slice(4).map((event) => line({ type: 'event', event })).join('') + line({ type: 'end' }));
    await expect(page.locator('.network-card')).toHaveAttribute('data-step', '12');
    await expect(page.locator('.replay-workspace .chat .msg')).toHaveCount(12);
    await expect(page.locator('.replay-workspace .chat-end')).toContainText('Attack stopped');
    expect(errors).toEqual([]);
  } finally { rmSync(file, { force: true }); }
});
