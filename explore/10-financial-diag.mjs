// Diagnoses the financial filter: sets EBIT / absolute years / min value and logs the site's count requests.
import { attach, settle } from './lib.mjs';
const MIN = process.argv[2] ?? '0';
const { browser, page } = await attach();
const base = page.url().match(/^https:\/\/[^/]+\/[^/]+\/tpcatalyst\/\d+\/Companies/)[0];
const say = (...a) => console.log(...a);
let t0 = Date.now();
page.on('request', (r) => { if (r.url().includes('/Companies/') && r.method() === 'POST') say(`  ${((Date.now() - t0) / 1000).toFixed(1)}s POST ${r.url().replace(base, '').slice(0, 90)} ${(r.postData() || '').slice(0, 600)}`); });
page.on('response', async (r) => { if (r.url().includes('/Companies/') && r.request().method() === 'POST') say(`  ${((Date.now() - t0) / 1000).toFixed(1)}s RESP ${r.status()} ${r.url().replace(base, '').slice(0, 60)} ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)}`); });
const h4 = async (label) => say(`${label}: ${(await page.locator('#main-content h4').first().innerText()).replace(/\s+/g, ' ')} | OK ${await page.locator("a.button.ok:text-is('OK')").getAttribute('class')}`);
const tick = async (name, value, on = true) => { const i = page.locator(`#main-content input[name='${name}'][value='${value}']`); if ((await i.isChecked()) !== on) await page.locator(`label[for='${await i.getAttribute('id')}']`).click(); await page.waitForTimeout(500); };

await page.goto(`${base}/SearchExpert/By/TPGlobalStandardFormat`, { waitUntil: 'domcontentloaded' }); await settle(page);
say('--- variable'); await page.click('#tab-FinancialItem'); await page.waitForTimeout(1500);
await page.locator("li[data-id='PROFIT_LOSS_ACCOUNT_IND_IND']").first().click(); await page.waitForTimeout(1500);
await page.locator('#main-content label').filter({ hasText: /^\s*Operating profit \(loss\) \[EBIT\]\s*$/ }).first().click(); await page.waitForTimeout(2500);
await h4('after variable');
say('--- values'); await page.click('#tab-Financials'); await page.waitForTimeout(1500);
await page.selectOption('#unit', { label: 'million' }); await page.selectOption('#currency', { label: 'USD' });
await page.locator('input[name=minValue]').click();
await page.keyboard.type(MIN, { delay: 150 });
await page.keyboard.press('Tab'); await page.waitForTimeout(6000);
await h4('after min (last available year)');
say('--- time'); await page.click('#tab-TimePeriod'); await page.waitForTimeout(1500);
await tick('time', 'year-0', false);
await page.locator("#main-content a:text-is('Absolute')").click(); await page.waitForTimeout(1200);
for (const y of [2025, 2024, 2023]) await tick('time', `year-${y}`);
await tick('choiceOfValidation', 'AllYears');
for (let i = 0; i < 8; i += 1) { await page.waitForTimeout(5000); await h4(`+${(i + 1) * 5}s`); }
say((await page.locator('#main-content li').allInnerTexts()).filter((t) => /^(Variable|Values|Time period):/.test(t.trim())).map((t) => t.trim().replace(/\s+/g, ' ').slice(0, 170)));
await browser.close();
