import { expect, test } from '@playwright/test';

const show = async (page: import('@playwright/test').Page) => {
  await page.goto('/?view=demo');
  await page.getByRole('radio', { name: 'With VETO', exact: true }).click();
  await page.getByRole('slider', { name: 'Replay position' }).fill('-1');
  await page.getByRole('button', { name: 'Show graph', exact: true }).click();
};

test('the original chat is primary; graph toggling preserves playback and messages', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?view=demo');
  await expect(page.locator('.network-card')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Without VETO', exact: true }).locator('.msg')).toHaveCount(8);
  const chatWidth = (await page.locator('.chat').boundingBox())!.width;
  expect(chatWidth).toBeGreaterThan(700);
  await page.getByRole('button', { name: 'Show graph', exact: true }).click();
  await expect(page.locator('.react-flow')).toBeVisible();
  await expect(page.locator('.network-card')).toHaveAttribute('data-step', '8');
  expect((await page.locator('.chat').boundingBox())!.width).toBeGreaterThan((await page.locator('.network-card').boundingBox())!.width);
  await page.getByRole('button', { name: 'Hide graph', exact: true }).click();
  await expect(page.locator('.chat .msg')).toHaveCount(8);
  await page.getByRole('button', { name: 'Replay with VETO' }).click();
  await expect(page.locator('.chat-end')).toContainText('Attack stopped');
});

test('a later step animates its packet and appends the matching original message', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await show(page);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.locator('.chat .msg')).toHaveCount(1);
  const packet = page.locator('.flow-packet');
  const position = () => packet.evaluate((element: SVGGraphicsElement) => { const m = element.getCTM()!; return { x: m.e, y: m.f }; });
  const before = await position();
  await page.waitForTimeout(300);
  const after = await position();
  expect(Math.hypot(before.x - after.x, before.y - after.y)).toBeGreaterThan(5);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Hide graph', exact: true }).click();
  await expect(page.locator('.chat .msg')).toHaveCount(2, { timeout: 3000 });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Show graph', exact: true }).click();
  await expect(page.locator('.network-card')).toHaveAttribute('data-step', '2');
});

test('the dynamic graph supports zoom, constrained dragging and reset without changing events', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await show(page);
  await page.getByRole('slider', { name: 'Replay position' }).fill('2');
  const agent = page.locator('.react-flow__node[data-id="actor:agent-1"]');
  await expect(agent).toBeVisible();
  const transform = () => agent.evaluate((el) => el.style.transform);
  const initial = await transform();
  const viewport = page.locator('.react-flow__viewport');
  const zoom = await viewport.getAttribute('style');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(viewport).not.toHaveAttribute('style', zoom!);
  const avatar = await agent.locator('.avatar').boundingBox();
  await page.mouse.move(avatar!.x + avatar!.width / 2, avatar!.y + avatar!.height / 2);
  await page.mouse.down(); await page.mouse.move(avatar!.x + avatar!.width / 2 - 20, avatar!.y + avatar!.height / 2 + 10, { steps: 8 }); await page.mouse.up();
  expect(await transform()).not.toBe(initial);
  await expect(page.locator('.network-card')).toHaveAttribute('data-step', '3');
  await expect(page.locator('.chat .msg')).toHaveCount(3);
  await page.getByRole('button', { name: 'Reset layout', exact: true }).click();
  await expect.poll(transform).toBe(initial);
});

test('rewinding removes future decisions and only reveals records after they are read', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await show(page);
  await page.getByRole('button', { name: 'Inspect Supplier contacts', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Step inspector', exact: true })).toContainText('has not been read or checked');
  await page.getByRole('button', { name: 'Follow current step' }).click();
  await page.getByRole('slider', { name: 'Replay position' }).fill('6');
  await page.getByRole('button', { name: 'Inspect Supplier contacts', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Step inspector', exact: true })).toContainText('Policy: we never ask for customer data.');
  await page.getByRole('button', { name: 'Follow current step' }).click();
  await page.getByRole('slider', { name: 'Replay position' }).fill('11');
  await expect(page.locator('.chat-end')).toContainText('Attack stopped');
  await expect(page.getByRole('button', { name: 'Inspect Honeypot' }).locator('..')).toContainText('1 action captured');
  await page.getByRole('slider', { name: 'Replay position' }).fill('3');
  await expect(page.locator('.chat-end')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Inspect Honeypot' }).locator('..')).toContainText('No actions yet');
  await expect(page.locator('.flow-packet')).toHaveCount(0);
});

test('dashboard and demo share the graph renderer and skeleton', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await show(page);
  const position = await page.locator('.react-flow__node[data-id="actor:agent-1"]').evaluate((el) => el.style.transform);
  await page.goto('/?view=graph&bundle=synthetic-merch-launch&run=monitored');
  await expect(page.locator('.react-flow')).toBeVisible();
  await expect(page.locator('.chat .msg')).toHaveCount(12);
  const node = page.locator('.react-flow__node[data-id="actor:agent-1"]');
  await expect.poll(() => node.evaluate((el) => el.style.transform)).toBe(position);
  await page.getByRole('button', { name: 'Data explorer', exact: true }).click();
  await expect(page.locator('.explorer-canvas')).toHaveCount(1);
});

for (const width of [390, 768, 1280]) test(`chat and optional graph fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await show(page);
  await expect(page.locator('.react-flow')).toBeVisible();
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.locator('.chat .msg')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('show/hide animates smoothly, survives interruption, and persists across VETO versions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?view=demo');
  await page.getByRole('slider', { name: 'Replay position' }).fill('-1');
  await page.getByRole('button', { name: 'Show graph', exact: true }).click();
  await expect.poll(() => page.locator('.chat').evaluate((el) => el.getAnimations().some((a) => a.playState === 'running'))).toBe(true);
  await page.getByRole('button', { name: 'Hide graph', exact: true }).click();
  // Reverse the exit before it finishes; the old completion must not remove the reopened graph.
  await page.getByRole('button', { name: 'Show graph', exact: true }).click();
  await page.waitForTimeout(450);
  await expect(page.locator('.network-card')).toHaveCount(1);
  await expect(page.locator('.network-card')).toHaveAttribute('data-step', '0');
  await page.getByRole('radio', { name: 'With VETO', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hide graph', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Inspect Judge', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide graph', exact: true }).click();
  await expect(page.locator('.network-card')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Without VETO', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show graph', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.network-card')).toHaveCount(0);
});

for (const width of [1440, 390]) test(`opening and resizing comfortably fit every node at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await show(page);
  const fits = () => page.evaluate(() => {
    const stage = document.querySelector('.flow-stage[data-ready="true"]');
    if (!stage) return false;
    const bounds = stage.getBoundingClientRect();
    return [...stage.querySelectorAll('.react-flow__node')].every((node) => {
      const box = node.getBoundingClientRect();
      return box.left >= bounds.left + 8 && box.right <= bounds.right - 8 && box.top >= bounds.top + 8 && box.bottom <= bounds.bottom - 8;
    });
  });
  await expect.poll(fits).toBe(true);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoom = await page.locator('.react-flow__viewport').getAttribute('style');
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', zoom!);
  await page.setViewportSize({ width: width === 1440 ? 1280 : 430, height: 844 });
  await expect.poll(fits).toBe(true);
  await page.getByRole('radio', { name: 'Without VETO', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hide graph', exact: true })).toBeVisible();
  await expect.poll(fits).toBe(true);
});
