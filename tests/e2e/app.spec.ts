import { expect, test, type Page, type BrowserContext } from '@playwright/test';

async function preparedContext(context: BrowserContext, taskCount = 0) {
  await context.addInitScript(({ taskCount }) => {
    if (localStorage.getItem('e2e_seeded')) return;
    localStorage.setItem('e2e_seeded', 'yes');
    localStorage.setItem('mk_salt', 'browser-test-device');
    localStorage.setItem('mk_lang', 'en');
    const items: [string, unknown][] = [['settings', { id:'settings', kind:'settings', pinHash:'test-existing-lock' }]];
    for (let i=0; i<taskCount; i++) items.push([`task_${i}`, { id:`task_${i}`, kind:'task', title:`Task number ${i}`, q:2, done:false, items:[], created:i }]);
    localStorage.setItem('mk_items', JSON.stringify(items));
    sessionStorage.setItem('mk_unlock', String(Date.now()));
  }, { taskCount });
}
const tasks = (page: Page) => page.locator('nav [data-tab="tasks"]').click();
async function account(page: Page) { await page.getByRole('button', { name:'Account & team', exact:true }).click(); }
async function sync(page: Page) {
  await account(page);
  await page.getByRole('button', { name:'Sync now', exact:true }).click();
  await expect(page.getByRole('button', { name:'Sync now', exact:true })).toBeEnabled();
}
async function register(page: Page, name: string, email: string) {
  await account(page); await page.getByRole('button', { name:'Create account', exact:true }).click();
  await page.getByLabel('Name', { exact:true }).fill(name); await page.getByLabel('Email', { exact:true }).fill(email);
  await page.getByLabel('Password (at least 10 characters)', { exact:true }).fill('browser-test-password');
  await page.getByRole('button', { name:'Create account', exact:true }).last().click();
  await expect(page.getByRole('button', { name:'Sign out', exact:true })).toBeVisible();
  await expect(page.getByRole('button', { name:'Sync now', exact:true })).toBeEnabled();
}
test('fresh React app supports task search, undo, checklist editing, commands and Arabic', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#lock h1')).toHaveText('Secure your assistant');
  for (const digit of '1234') await page.locator('#lock').getByRole('button', { name:digit, exact:true }).click();
  await expect(page.locator('#lock h1')).toHaveText('Enter the PIN again');
  for (const digit of '1234') await page.locator('#lock').getByRole('button', { name:digit, exact:true }).click();
  await expect(page.locator('#lock')).toBeHidden();
  await tasks(page); await page.locator('#react-new-task').fill('Review budget'); await page.getByRole('button', { name:'Add', exact:true }).click();
  await page.getByLabel('Search tasks and details').fill('budget');
  await expect(page.getByTestId('task-list').locator('article')).toHaveCount(1);
  await page.getByRole('checkbox', { name:'Complete Review budget', exact:true }).click();
  await expect(page.getByTestId('task-list').locator('article')).toHaveCount(0);
  await page.getByRole('button', { name:'Undo', exact:true }).click();
  await expect(page.getByTestId('task-list').locator('article')).toHaveCount(1);
  await page.getByRole('button', { name:'Delete Review budget', exact:true }).click();
  await page.getByRole('button', { name:'Undo', exact:true }).click();
  await page.locator('.task-open').click(); await page.locator('#tStep').fill('Get finance figures'); await page.locator('#tStep').press('Enter');
  await expect(page.locator('.sheet')).toContainText('Get finance figures'); await page.locator('.sheet').getByRole('button', { name:'Done', exact:true }).click();
  await page.getByRole('button', { name:'Commands', exact:true }).click();
  await page.getByLabel('Command', { exact:true }).fill('Add call Ahmed tomorrow at 10:30');
  await page.getByRole('button', { name:'Preview command', exact:true }).click();
  await expect(page.getByRole('button', { name:'Apply command', exact:true })).toBeVisible();
  await page.getByRole('button', { name:'Apply command', exact:true }).click();
  await tasks(page); await expect(page.getByTestId('task-list')).toContainText('call Ahmed');
  await page.getByRole('button', { name:'Reminders', exact:true }).click(); await expect(page.getByRole('heading', { name:'Upcoming reminders', exact:true })).toBeVisible();
  await page.locator('nav [data-tab="notes"]').click(); await page.locator('#nText').fill('Visible saved note'); await page.locator('#view').getByRole('button', { name:'Save', exact:true }).click();
  await expect(page.locator('#view .note')).toContainText('Visible saved note');
  await page.locator('#menuBtn').click(); await page.locator('.sheet').getByRole('button', { name:'العربية', exact:true }).first().click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.locator('.sheet').getByRole('button', { name:'تم', exact:true }).click(); await tasks(page);
  await expect(page.getByRole('heading', { name:'المهام', exact:true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('two devices share a team, assign work, recover offline edits and resolve conflicts', async ({ browser }) => {
  test.setTimeout(180_000); // Two clients and many real API transitions on slower Windows hosts.
  const aContext = await browser.newContext(); const bContext = await browser.newContext();
  await preparedContext(aContext, 1); await preparedContext(bContext);
  const a = await aContext.newPage(); const b = await bContext.newPage();
  const errors: string[] = []; for (const page of [a,b]) page.on('pageerror', error => errors.push(error.message));
  const stamp = Date.now(); const emailA = `alice-${stamp}@example.test`; const emailB = `bob-${stamp}@example.test`;
  try {
    await a.goto('/'); await b.goto('/'); await register(a, 'Alice', emailA); await register(b, 'Bob', emailB);
    await a.getByLabel('New team', { exact:true }).fill('Operations'); await a.getByRole('button', { name:'Create team', exact:true }).click();
    await expect(a.getByRole('combobox', { name:'Workspace', exact:true }).locator('option:checked')).toHaveText('Operations');
    await a.getByRole('button', { name:'Create invitation code', exact:true }).click();
    const code = await a.getByLabel('Copy this code and share it').inputValue();
    await b.getByLabel('Invitation code', { exact:true }).fill(code); await b.getByRole('button', { name:'Join team', exact:true }).click();
    await expect(b.getByRole('combobox', { name:'Workspace', exact:true }).locator('option:checked')).toHaveText('Operations');
    await sync(a); // Refresh member list after invitation acceptance.
    await a.reload(); await expect(a.locator('#lock')).toBeHidden(); await tasks(a);
    await a.locator('#react-new-task').fill('Shared supplier call'); await a.getByLabel('Assign to a teammate').selectOption({ label:`Bob (${emailB})` });
    await a.getByRole('button', { name:'Add', exact:true }).click(); await sync(a); await sync(b); await tasks(b);
    await b.getByLabel('Task filter').selectOption('mine'); await expect(b.getByTestId('task-list')).toContainText('Shared supplier call');
    await bContext.setOffline(true); await b.locator('.task-open').click(); await b.locator('#tTitle').fill('Bob offline edit'); await b.locator('#tTitle').press('Tab'); await b.locator('.sheet').getByRole('button', { name:'Done', exact:true }).click();
    await tasks(a); await a.locator('.task-open').click(); await a.locator('#tTitle').fill('Alice online edit'); await a.locator('#tTitle').press('Tab'); await a.locator('.sheet').getByRole('button', { name:'Done', exact:true }).click(); await sync(a);
    await bContext.setOffline(false); await sync(b);
    await expect(b.getByText('Two edits to the same item', { exact:true })).toBeVisible();
    await b.getByRole('button', { name:'Keep my edit', exact:true }).click();
    await expect(b.getByText('Two edits to the same item', { exact:true })).toHaveCount(0);
    await sync(b); await sync(a); await tasks(a); await expect(a.getByTestId('task-list')).toContainText('Bob offline edit');
    await account(a); await a.getByRole('button', { name:'Sign out', exact:true }).click(); await tasks(a);
    await expect(a.getByTestId('task-list')).toContainText('Task number 0'); await expect(a.getByTestId('task-list')).not.toContainText('Bob offline edit');
    expect(errors).toEqual([]);
  } finally { await aContext.close(); await bContext.close(); }
});

test('large task lists render a bounded page and search remains responsive', async ({ context, page }) => {
  await preparedContext(context, 2000); await page.goto('/'); await tasks(page);
  await expect(page.getByTestId('task-list').locator('article')).toHaveCount(50);
  const started = Date.now(); await page.getByLabel('Search tasks and details').fill('Task number 1999');
  await expect(page.getByTestId('task-list').locator('article')).toHaveCount(1);
  await expect(page.getByTestId('task-list')).toContainText('Task number 1999');
  const elapsed = Date.now() - started; console.log(`Search across 2,000 tasks: ${elapsed} ms; initial task rows: 50`);
  expect(elapsed).toBeLessThan(2500);
});
test('voice without an AI key turns the transcript into a dated task', async ({ page, context }) => {
  await preparedContext(context);
  await context.addInitScript(() => {
    class FakeRecognition {
      lang = ''; continuous = false; interimResults = false; maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null; onend: (() => void) | null = null; onerror: ((e: unknown) => void) | null = null;
      start() { setTimeout(() => this.onresult?.({ results: [[{ transcript: 'Call the bank tomorrow' }]] }), 50); }
      stop() { setTimeout(() => this.onend?.(), 10); }
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name:'Voice note', exact:true }).click();
  await page.getByRole('button', { name:'English', exact:true }).click();
  await page.getByRole('button', { name:'Record', exact:true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name:'Stop', exact:true }).click();
  await expect(page.getByLabel('What you said', { exact:true })).toHaveValue('Call the bank tomorrow');
  await page.getByRole('button', { name:'Save as task', exact:true }).click();
  const tomorrow = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate()+1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  const task = await page.evaluate(() => (JSON.parse(localStorage.getItem('mk_items') ?? '[]') as [string, { kind:string; title:string; due:string|null }][]).map(([, v]) => v).find(v => v.kind === 'task' && v.title === 'Call the bank'));
  expect(task?.due).toBe(tomorrow);
  expect(errors).toEqual([]);
});
