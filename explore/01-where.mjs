import { attach, snap } from './lib.mjs';
const { browser, page, pages } = await attach();
console.log('TABS:', pages.map((p) => p.url()).join(' | '));
await snap(page);
await browser.close();
