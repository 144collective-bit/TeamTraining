/**
 * End-to-end walk of the training write path against a running server.
 *
 *   npm run build && npm run start   (in one terminal)
 *   npm run db:seed && npm run e2e   (in another)
 *
 * Covers: start training → daily sign-off → assessment → three signatures →
 * competence granted, plus PIN rejection, voiding an entry, and induction.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
// Honour a preinstalled browser if one is provided, otherwise let Playwright
// resolve its own.
const launchOptions = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : {};

const b = await chromium.launch(launchOptions);
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const step = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`); throw e; }
};

// sign in as the production manager (can do everything)
await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await p.fill('#email', 'k.bhatti@protektor.example');
await p.fill('#password', 'protektor');
await Promise.all([p.waitForURL('**/dashboard'), p.click('button[type=submit]')]);

// ---------------------------------------------------------------- 1
await step('start training from an empty matrix cell', async () => {
  await p.goto(`${BASE}/matrix`, { waitUntil: 'domcontentloaded' });
  // David Whitfield has no training at all - use his PB-03 cell
  const row = p.locator('tbody tr', { has: p.locator('th', { hasText: 'David Whitfield' }) });
  await row.locator('button.chip').nth(2).click();
  await p.waitForSelector('[role=dialog]');
  await p.selectOption('#trainerId', { label: 'Ian Prosser' });
  await p.click('button:has-text("Start training")');
  await p.waitForSelector('[role=dialog]', { state: 'detached', timeout: 10000 });
});

// ---------------------------------------------------------------- 2
await step('new session appears on the sign-off screen', async () => {
  await p.goto(`${BASE}/signoff`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('text=David Whitfield', { timeout: 5000 });
});

// ---------------------------------------------------------------- 3
let captureUrl;
await step('record a daily sign-off', async () => {
  await p.click('a:has(span:text("David Whitfield"))');
  await p.waitForURL(/\/signoff\/[0-9a-f-]{36}/, { timeout: 15000 });
  captureUrl = p.url();
  await p.click('label:has-text("Working with support")');
  await p.locator('button:has-text("Pre-start checks")').click();
  await p.fill('#note', 'Walked through guarding and the tool area isolation.');
  await p.click('button:has-text("Record sign-off")');
  await p.waitForSelector('text=Sign-off recorded', { timeout: 10000 });
});

// ---------------------------------------------------------------- 4
await step('sign-off is on the training record', async () => {
  await p.goto(captureUrl, { waitUntil: 'domcontentloaded' });
  const link = p.locator('a', { hasText: 'Full training record' });
  await link.waitFor({ state: 'visible', timeout: 15000 });
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await p.waitForURL(/\/competence\//, { timeout: 15000 });
  await p.waitForSelector('text=Walked through guarding');
  await p.waitForSelector('text=Hash chain verified');
});

// ---------------------------------------------------------------- 5
await step('put forward for assessment', async () => {
  await p.click('button:has-text("Put forward for assessment")');
  await p.waitForSelector('text=Assess ', { timeout: 10000 });
});

// ---------------------------------------------------------------- 6
await step('record a passed assessment', async () => {
  await p.fill('textarea[name=note]', 'Set and ran a full batch unaided. Angles within tolerance.');
  await p.click('button:has-text("Passed — competent")');
  await p.waitForSelector('text=Assessment passed', { timeout: 10000 });
});

// ---------------------------------------------------------------- 7
await step('reject a wrong PIN', async () => {
  await p.locator('li:has(span:text-is("TRAINEE")) button:has-text("Sign")').click();
  await p.fill('#pin-TRAINEE', '9999');
  await p.click('button:has-text("Confirm signature")');
  await p.waitForSelector('text=does not match', { timeout: 10000 });
});

// ---------------------------------------------------------------- 8
await step('collect all three signatures', async () => {
  for (const role of ['TRAINEE', 'TRAINER', 'MANAGER']) {
    const open = p.locator(`li:has(span:text-is("${role}")) button:has-text("Sign")`);
    if (await open.count()) await open.click();
    await p.fill(`#pin-${role}`, '1234');
    await p.click('button:has-text("Confirm signature")');
    await p.waitForTimeout(1200);
  }
  // The panel re-renders into its competent state once the third signature
  // lands, so assert on the resulting record rather than the transient banner.
  await p.waitForSelector('.chip.st-COMPETENT', { timeout: 10000 });
  await p.waitForSelector('text=Quarterly review', { timeout: 10000 });
  const sigs = await p.locator('text=Re-authenticated at signing').count();
  if (sigs !== 3) throw new Error(`expected 3 signatures, found ${sigs}`);
});

// ---------------------------------------------------------------- 9
await step('matrix now shows competent', async () => {
  await p.goto(`${BASE}/matrix`, { waitUntil: 'domcontentloaded' });
  const row = p.locator('tbody tr', { has: p.locator('th', { hasText: 'David Whitfield' }) });
  const cls = await row.locator('td.cell').nth(2).locator('a,button,span').first().getAttribute('class');
  if (!cls.includes('st-COMPETENT')) throw new Error(`cell is ${cls}`);
});

// ---------------------------------------------------------------- 10
await step('void a sign-off leaves it visible', async () => {
  await p.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await p.click('a:has-text("Ryan McAllister")');
  await p.waitForURL(/\/competence\//, { timeout: 15000 });
  await p.locator('button:has-text("Void")').first().click();
  await p.fill('input[name=reason]', 'Recorded against the wrong trainee.');
  await p.click('button:has-text("Confirm")');
  await p.waitForSelector('text=Voided —', { timeout: 10000 });
});

// ---------------------------------------------------------------- 11
await step('induction items toggle', async () => {
  await p.goto(`${BASE}/people`, { waitUntil: 'domcontentloaded' });
  await p.click('a:has-text("Aisha Khan")');
  await p.waitForURL(/\/people\/[0-9a-f-]{36}/, { timeout: 15000 });
  await p.locator('button:has-text("Fire marshals and first aiders identified")').click();
  await p.waitForTimeout(1500);
  const txt = await p.locator('li:has-text("Fire marshals")').innerText();
  if (txt.includes('Outstanding')) throw new Error('item did not complete');
});

if (errors.length) {
  console.log('\nconsole errors:', errors);
  await b.close();
  process.exit(1);
}
console.log('\nAll write-path checks passed.');
await b.close();
