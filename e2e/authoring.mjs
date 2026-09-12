/**
 * End-to-end walk of controlled-document authoring against a running server.
 *
 *   npm run build && npm run start   (in one terminal)
 *   npm run db:demo && npm run e2e:authoring   (in another)
 *
 * Covers: rendering a published SOP and risk assessment, creating a draft,
 * authoring steps with a photograph, previewing, separation of duties on
 * approval, publishing, and the supersession cascade onto trained staff.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const launchOptions = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : {};
const b = await chromium.launch(launchOptions);
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

async function signIn(email) {
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  if (!p.url().includes('/login')) {
    await p.click('button:has-text("Sign out")');
    await p.waitForURL('**/login', { timeout: 15000 });
  }
  await p.fill('#email', email);
  await p.fill('#password', 'demo-password-1');
  await Promise.all([p.waitForURL('**/dashboard', { timeout: 15000 }), p.click('button[type=submit]')]);
}

const step = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`); throw e; }
};

await signIn('k.bhatti@northgate.example');

await step('published SOP renders with step photos', async () => {
  await p.goto(`${BASE}/documents`, { waitUntil: 'domcontentloaded' });
  await p.click('a:has-text("SOP-PB-01")');
  await p.waitForURL(/\/documents\/[0-9a-f-]{36}$/);
  await p.waitForSelector('.doc-step');
  const steps = await p.locator('.doc-step').count();
  if (steps !== 6) throw new Error(`expected 6 steps, got ${steps}`);
  const imgs = await p.locator('.doc-step-figure img').count();
  if (imgs !== 6) throw new Error(`expected 6 photos, got ${imgs}`);
  // Every photo must actually decode, including the ones below the fold -
  // they have to be there when the document is printed.
  await p.waitForFunction(
    () => [...document.querySelectorAll('.doc-step-figure img')].every(i => i.complete),
    null, { timeout: 15000 });
  const broken = await p.evaluate(() =>
    [...document.querySelectorAll('.doc-step-figure img')].filter(i => i.naturalWidth === 0).length);
  if (broken) throw new Error(`${broken} images failed to load`);
});

await step('risk assessment renders with scored hazards', async () => {
  await p.goto(`${BASE}/documents`, { waitUntil: 'domcontentloaded' });
  await p.click('a:has-text("RA-LC-01")');
  await p.waitForURL(/\/documents\/[0-9a-f-]{36}$/);
  await p.waitForSelector('.ra-table');
  const scored = await p.locator('.ra-score').count();
  if (scored < 5) throw new Error(`expected scored hazards, got ${scored}`);
});

await step('create a new SOP draft', async () => {
  await p.goto(`${BASE}/documents/new`, { waitUntil: 'domcontentloaded' });
  await p.fill('#title', 'Deburring Bench — Standard Operating Procedure');
  await p.selectOption('#machineId', { label: 'WB-01 — Welding Bay' });
  await p.click('button:has-text("Create draft")');
  await p.waitForURL(/\/edit\/[0-9a-f-]{36}/, { timeout: 15000 });
});

await step('author steps, upload a photo, save', async () => {
  await p.fill('#purpose', 'Safe use of the deburring bench for finishing cut and formed parts.');
  await p.fill('#step-0', 'Check the bench, extraction and abrasive condition before starting.');

  // The template prefills several steps, so scope to the first step's card.
  const firstStep = p.locator('.card', { has: p.locator('#step-0') });
  await firstStep.locator('button:has-text("Add key point")').click();
  await firstStep.locator('input[aria-label^="Key points"]').last()
    .fill('Extraction running and ducting clear.');
  await firstStep.locator('button:has-text("Add reason")').click();
  await firstStep.locator('input[aria-label^="Reasons"]').last()
    .fill('Metal dust is a fire and inhalation risk.');

  // upload a real PNG through the picker
  await firstStep.locator('input[type=file]').setInputFiles(
    new URL('./fixtures/step-photo.png', import.meta.url).pathname);
  await p.waitForSelector('img[src^="/api/attachments/"]', { timeout: 15000 });

  await p.click('button:has-text("Add step")');
  await p.locator('textarea[id^="step-"]').last()
    .fill('Deburr all cut edges, working away from the body.');
  await p.fill('#safety', 'Extraction on, eye protection worn, guard in place.');
  await p.fill('#care', 'Never deburr a part held in the hand against the wheel.');
  await p.fill('#summary', 'First issue of the deburring bench procedure.');
  await p.click('button:has-text("Save draft")');
  await p.waitForSelector('text=/Draft saved at/', { timeout: 15000 });
});

await step('preview matches the published layout', async () => {
  await p.click('button:has-text("Preview")');
  await p.waitForSelector('.doc-step');
  const flag = await p.locator('.doc-flag').first().innerText();
  if (!/draft/i.test(flag)) throw new Error(`expected draft flag, got ${flag}`);
  await p.click('button:has-text("Edit")');
});

await step('publish is refused without a change summary', async () => {
  const summary = p.locator('#summary');
  await summary.fill('');
  await p.waitForTimeout(300);
  const disabled = await p.locator('button:has-text("Publish revision")').isDisabled();
  if (!disabled) throw new Error('publish should be disabled with no summary');
  await summary.fill('First issue of the deburring bench procedure.');
});

await step('publish the first issue', async () => {
  // The author cannot approve their own revision.
  await p.click('button:has-text("Publish revision")');
  await p.waitForSelector('text=someone else with manager access', { timeout: 15000 });

  // A second manager approves and publishes it.
  const draftUrl = p.url();
  await signIn('d.whitfield@northgate.example');
  await p.goto(draftUrl, { waitUntil: 'domcontentloaded' });
  await p.fill('#summary', 'First issue of the deburring bench procedure.');
  await p.click('button:has-text("Publish revision")');
  await p.waitForURL(/\/documents\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await p.waitForSelector('.doc-step');
  const flags = await p.locator('.doc-flag').count();
  if (flags !== 0) throw new Error('published document still shows a draft flag');
});

// ---------------------------------------------------------------- cascade
/** One person drafts, a different one approves - as the system requires. */
async function reviseAndPublish(reference, stepText, changeClassLabel, summary) {
  await signIn('k.bhatti@northgate.example');
  await p.goto(`${BASE}/documents`, { waitUntil: 'domcontentloaded' });
  await p.click(`a:has-text("${reference}")`);
  await p.waitForURL(/\/documents\/[0-9a-f-]{36}$/);
  await p.click('button:has-text("Revise")');
  await p.waitForURL(/\/edit\/[0-9a-f-]{36}/, { timeout: 20000 });
  const draftUrl = p.url();

  await p.fill('#step-0', stepText);
  await p.fill('#summary', summary);
  await p.click('button:has-text("Save draft")');
  await p.waitForSelector('text=/Draft saved at/', { timeout: 20000 });

  await signIn('d.whitfield@northgate.example');
  await p.goto(draftUrl, { waitUntil: 'domcontentloaded' });
  await p.click(`label:has-text("${changeClassLabel}")`);
  await p.fill('#summary', summary);
  await p.click('button:has-text("Publish revision")');
  await p.waitForURL(/\/documents\/[0-9a-f-]{36}$/, { timeout: 20000 });
}

await step('MAJOR revision sends trained staff to revalidation', async () => {
  await reviseAndPublish(
    'SOP-PB-02',
    'Pre-start checks — REVISED: confirm the new back-gauge interlock is proven.',
    'Major',
    'Back-gauge interlock added; setting sequence changed.');
});

await step('SAFETY_CRITICAL revision suspends trained staff', async () => {
  await reviseAndPublish(
    'SOP-PN-01',
    'Pre-start checks — new trapping hazard identified at the clamps.',
    'Safety critical',
    'New trapping hazard at the clamps; additional guarding required.');
});

await step('matrix reflects the cascade', async () => {
  await p.goto(`${BASE}/matrix`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.matrix');
  const suspended = await p.locator('.chip.st-SUSPENDED').count();
  const revalidate = await p.locator('.chip.st-REQUIRES_REVALIDATION').count();
  console.log(`    suspended: ${suspended}, needing revalidation: ${revalidate}`);
  if (suspended < 4) throw new Error(`expected PN-01 operators suspended, got ${suspended}`);
  if (revalidate < 4) throw new Error(`expected PB-02 operators to need revalidation, got ${revalidate}`);
});

if (errors.length) {
  console.log('\nconsole errors:', errors);
  await b.close();
  process.exit(1);
}
console.log('\nAll authoring checks passed.');
await b.close();
