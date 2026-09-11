/**
 * End-to-end walk of a first run against an EMPTY database.
 *
 *   createdb tt_firstrun
 *   DATABASE_URL=... DATABASE_ADMIN_URL=... npm run db:setup
 *   DATABASE_URL=... DATABASE_ADMIN_URL=... npm run start   (in one terminal)
 *   npm run e2e:first-run                                   (in another)
 *
 * Covers: the setup redirect, creating the organisation and first
 * administrator, setup closing afterwards, adding an area, a machine and a
 * person, and creating a training sign-off from a template.
 *
 * Must be run against a database with no organisation in it.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const launchOptions = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : {};
const b = await chromium.launch(launchOptions);
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

const step = async (n, fn) => {
  try { await fn(); console.log(`  PASS  ${n}`); }
  catch (e) { console.log(`  FAIL  ${n}\n        ${e.message.split('\n')[0]}`); throw e; }
};

await step('a blank install sends you to setup', async () => {
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForURL(/\/setup/, { timeout: 15000 });
  await p.waitForSelector('text=Set up your organisation');
});

await step('create the organisation and first admin', async () => {
  await p.fill('#orgName', 'Northgate Fabrications');
  await p.fill('#siteName', 'Kidderminster');
  await p.fill('#name', 'Dale Harper');
  await p.fill('#email', 'dale@northgate.example');
  await p.fill('#password', 'a-long-enough-password');
  await p.fill('#confirm', 'a-long-enough-password');
  await p.fill('#pin', '4821');
  await p.click('button:has-text("Create organisation")');
  await p.waitForURL(/\/admin/, { timeout: 20000 });
  await p.waitForSelector('text=left to set up');
});

await step('setup closes once an organisation exists', async () => {
  await p.goto(`${BASE}/setup`, { waitUntil: 'domcontentloaded' });
  await p.waitForURL(/\/dashboard/, { timeout: 15000 });
});

await step('add an area and a machine', async () => {
  await p.goto(`${BASE}/admin/machines`, { waitUntil: 'domcontentloaded' });
  await p.fill('#a-name', 'Press Brake Bay');
  await p.fill('#a-code', 'PBB');
  await p.click('button:has-text("Add area")');
  await p.waitForSelector('text=Press Brake Bay', { timeout: 15000 });

  await p.click('button:has-text("Add a machine")');
  await p.fill('#m-code', 'PB-01');
  await p.fill('#m-name', 'Press Brake 1');
  await p.selectOption('#m-area', { label: 'Press Brake Bay' });
  await p.fill('#m-manu', 'Amada');
  await p.click('button:has-text("Add machine")');
  await p.waitForSelector('text=Amada', { timeout: 15000 });
});

await step('add a person', async () => {
  await p.goto(`${BASE}/admin/people`, { waitUntil: 'domcontentloaded' });
  const add = p.locator('button:has-text("Add a person")');
  if (await add.count()) await add.click();
  await p.fill('#p-name', 'Sam Whitaker');
  await p.fill('#p-email', 'sam@northgate.example');
  await p.fill('#p-ref', 'E-2001');
  await p.fill('#p-job', 'Press Brake Operator');
  await p.selectOption('#p-role', 'TRAINER');
  await p.fill('#p-pin', '1357');
  await p.click('button:has-text("Add person")');
  await p.waitForSelector('text=Sam Whitaker added', { timeout: 15000 });
});

await step('create a training sign-off from the template', async () => {
  await p.goto(`${BASE}/documents/new?kind=TRAINING_DOC`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('text=Process training sign-off');
  await p.fill('#title', 'Press Brake Operation — Training Sign-Off');
  await p.selectOption('#machineId', { label: 'PB-01 — Press Brake 1' });
  await p.click('button:has-text("Create draft")');
  await p.waitForURL(/\/edit\//, { timeout: 20000 });
  const areas = await p.locator('input[aria-label^="Training area"]').count();
  if (areas < 10) throw new Error(`template did not prefill areas (got ${areas})`);
});

await step('preview renders the sign-off sheet', async () => {
  await p.fill('#tr-process', 'Press brake setting and operation');
  await p.fill('#tr-type', 'Hydraulic press brake');
  await p.click('button:has-text("Preview")');
  await p.waitForSelector('.tr-key-list');
  const keys = await p.locator('.tr-key-list li').count();
  if (keys !== 6) throw new Error(`expected the 0-5 training key, got ${keys} entries`);
});

await step('organisation branding saves', async () => {
  await p.goto(`${BASE}/admin/organisation`, { waitUntil: 'domcontentloaded' });
  await p.click('button[aria-label="Use #0f766e"]');
  await p.click('button:has-text("Save settings")');
  await p.waitForSelector('text=Organisation settings saved', { timeout: 15000 });
});

if (errs.length) {
  console.log('\nconsole errors:', errs);
  await b.close();
  process.exit(1);
}
console.log('\nFirst-run checks passed.');
await b.close();
