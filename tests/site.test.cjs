const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.txt': 'text/plain' };
let server, browser, baseURL;

before(async () => {
  server = http.createServer((request, response) => {
    let filename;
    try {
      let requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      // Match GitHub Pages project hosting as well as a server at the domain root.
      const projectPrefix = '/my-homework-site';
      if (requestPath === projectPrefix || requestPath.startsWith(projectPrefix + '/')) {
        requestPath = requestPath.slice(projectPrefix.length) || '/';
      }
      filename = path.resolve(root, '.' + (requestPath === '/' ? '/index.html' : requestPath));
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (!filename.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(filename, (error, contents) => {
      if (error) return response.writeHead(404).end();
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
      response.end(contents);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseURL = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function openPage(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  return page;
}

async function loadAllImages(page) {
  for (const image of await page.locator('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(async (element) => { await element.decode(); });
  }
}

const photoNames = ['birthday-scientist', 'professor', 'guests', 'megafog', 'icecream-making', 'icecream-result'];
const withoutPermittedPeriods = (value) => value.replaceAll('sumnauka.ru', '[site]').replaceAll('v0.2', '[version]');

for (const width of [320, 390, 768, 1440]) {
  test(`page renders at ${width}px without overflow, script errors or broken assets`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    const failures = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await loadAllImages(page);
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      heading: document.querySelector('h1').getBoundingClientRect().width,
      images: Array.from(document.images, (image) => image.complete && image.naturalWidth > 0),
    }));
    assert.ok(layout.content <= layout.width, `content ${layout.content} exceeds viewport ${layout.width}`);
    assert.ok(layout.heading > 0);
    assert.ok(layout.images.length > 0 && layout.images.every(Boolean));
    assert.equal(await page.locator('h1').count(), 1);
    await page.close();
  });
}

test('navigation targets exist, review mode is clear, and no tracking or data submission occurs', async () => {
  const page = await browser.newPage();
  const requests = [];
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  const brokenTargets = await page.locator('a[href^="#"]').evaluateAll((links) => links
    .map((link) => link.getAttribute('href')).filter((href) => href !== '#' && !document.getElementById(href.slice(1))));
  assert.deepEqual(brokenTargets, []);
  assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
  assert.equal(await page.locator('.review-bar').count(), 0);
  assert.match(await page.locator('.test-mode').innerText(), /Дата не бронируется автоматически/);
  assert.equal(await page.locator('form,input:not([type="checkbox"]),textarea:not([readonly])').count(), 0);
  assert.equal(await page.locator('input[type="checkbox"]').count(), 2);
  assert.equal(await page.locator('iframe,script[src^="http"],img[src^="http"]').count(), 0);
  assert.ok(requests.every((request) => request.method === 'GET' && request.url.startsWith(baseURL + '/')));
  await page.close();
});

test('six selected event photos load as local WebP with useful display area on mobile and desktop', async () => {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const requested = [];
    page.on('request', (request) => requested.push(new URL(request.url()).pathname));
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await loadAllImages(page);
    const photos = await page.locator('img[src*="assets/photos/"]').evaluateAll((images) => images.map((image) => {
      const bounds = image.getBoundingClientRect();
      return {
        src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0,
        width: bounds.width, height: bounds.height,
        naturalRatio: image.naturalWidth / image.naturalHeight,
        displayRatio: bounds.width / bounds.height,
        fit: getComputedStyle(image).objectFit,
        alt: image.alt,
      };
    }));
    assert.equal(photos.length, 6, 'exactly the six selected documentary photos should appear');
    assert.deepEqual(photos.map((photo) => path.posix.basename(photo.src, '.webp')).sort(), [...photoNames].sort());
    for (const photo of photos) {
      assert.ok(photo.loaded, `${photo.src} must load`);
      assert.ok(photo.alt.length > 10, `${photo.src} needs a useful description`);
      assert.ok(photo.width >= 150 && photo.height >= 150, `${photo.src} displayed too small: ${photo.width} × ${photo.height}`);
      assert.ok(photo.width <= width, `${photo.src} extends beyond the viewport`);
      // A cover crop should preserve at least 40% of the original image area.
      if (photo.fit === 'cover') {
        const retainedArea = Math.min(photo.naturalRatio / photo.displayRatio, photo.displayRatio / photo.naturalRatio);
        assert.ok(retainedArea >= 0.4, `${photo.src} is excessively cropped (${Math.round(retainedArea * 100)}% retained)`);
      }
    }
    assert.ok(requested.filter((url) => url.includes('/assets/photos/')).length >= 6);
    assert.ok(!requested.some((url) => /\.(jpe?g|png)$/i.test(url)), 'original full-size source photographs must not be downloaded by the page');
    assert.equal(await page.locator('img[src^="data:"]').count(), 0, 'photographs must be separate cacheable files, not embedded base64');
    await page.close();
  }
});

test('visual effects and secret laboratory teaser exist', async () => {
  const page = await openPage();
  assert.equal(await page.locator('.hero-fog').count(), 1);
  assert.equal(await page.locator('.science-burst').count(), 1);
  assert.equal(await page.locator('.science-glassware').count(), 1);
  const lab = page.locator('.secret-lab');
  assert.match(await lab.innerText(), /Только для секретных агентов/);
  assert.match(await lab.innerText(), /59 900/);
  assert.match(await lab.innerText(), /Скоро рассекретим/);
  assert.equal(await lab.locator('[data-select-package]').count(), 0);
  await page.close();
});

test('project Pages subpath resolves scripts, styles, six photographs and package navigation', async () => {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const failures = [];
  const resources = [];
  page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  page.on('request', (request) => resources.push(new URL(request.url()).pathname));
  await page.goto(baseURL + '/my-homework-site/', { waitUntil: 'networkidle' });
  await loadAllImages(page);
  assert.deepEqual(failures, []);
  for (const resource of ['app.js', 'styles.css', ...photoNames.map((name) => `assets/photos/${name}.webp`)]) {
    assert.ok(resources.includes('/my-homework-site/' + resource), `project URL must preserve prefix for ${resource}`);
  }
  await page.locator('.package-button[data-select-package="party"]').click();
  assert.equal(new URL(page.url()).pathname, '/my-homework-site/');
  assert.equal(new URL(page.url()).hash, '#planner');
  assert.equal(await page.locator('#plan-package').inputValue(), 'party');
  await page.selectOption('#plan-guests', '20');
  assert.equal(await page.locator('#plan-price').innerText(), 'По расчёту');
  await page.close();
});

test('base show and both optional workshops calculate safely', async () => {
  const page = await openPage();
  await page.selectOption('#plan-package', 'show');
  await page.selectOption('#plan-show', 'dry');
  assert.equal(await page.locator('#plan-price').innerText(), '9 500 ₽');
  await page.selectOption('#plan-show', 'cryo');
  assert.equal(await page.locator('#plan-price').innerText(), '10 000 ₽');
  await page.selectOption('#plan-package', 'party');
  await page.selectOption('#plan-show', 'cryo');
  assert.equal(await page.locator('#plan-price').innerText(), '29 900 ₽');
  await page.locator('#plan-workshop-slime').check();
  assert.equal(await page.locator('#plan-price').innerText(), 'По расчёту');
  assert.match(await page.locator('#plan-summary').inputValue(), /крио-мороженое и лизуны/);
  assert.match(await page.locator('#plan-summary').inputValue(), /продолжительность: уточняется/i);
  await page.locator('#plan-workshop-icecream').uncheck();
  assert.match(await page.locator('#plan-summary').inputValue(), /Мастер-класс: лизуны/);
  await page.locator('#plan-workshop-slime').uncheck();
  assert.equal(await page.locator('#copy-plan').isDisabled(), true);
  await page.locator('#plan-workshop-icecream').check();
  assert.equal(await page.locator('#copy-plan').isEnabled(), true);
  assert.equal(await page.locator('#plan-price').innerText(), '29 900 ₽');
  await page.selectOption('#plan-guests', '20');
  assert.equal(await page.locator('#guest-count').inputValue(), '20');
  assert.equal(await page.locator('#plan-price').innerText(), 'По расчёту');
  await page.close();
});

test('package buttons choose their plans and scroll to planner', async () => {
  const page = await openPage();
  for (const code of ['show', 'party']) {
    await page.locator('.package-button[data-select-package="' + code + '"]').first().click();
    assert.equal(await page.locator('#plan-package').inputValue(), code);
    assert.equal(new URL(page.url()).hash, '#planner');
  }
  await page.close();
});

test('mobile navigation opens, follows links, closes with Escape and resets on desktop', async () => {
  const page = await openPage({ width: 390, height: 844 });
  const button = page.locator('.menu-toggle');
  await button.click();
  assert.equal(await button.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#mobile-nav').isVisible(), true);
  await page.locator('#mobile-nav a[href="#packages"]').click();
  assert.equal(new URL(page.url()).hash, '#packages');
  assert.equal(await button.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#mobile-nav').isVisible(), false);
  await button.click();
  await page.keyboard.press('Escape');
  assert.equal(await button.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.menu-toggle')), true);
  await button.click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false');
  assert.equal(await page.locator('#mobile-nav').isVisible(), false);
  await page.close();
});

test('FAQ can be opened and closed using the keyboard', async () => {
  const page = await openPage();
  const first = page.locator('details').first();
  const summary = first.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  assert.equal(await first.evaluate((element) => element.open), true);
  assert.equal(await first.locator('p').isVisible(), true);
  await page.keyboard.press('Space');
  assert.equal(await first.evaluate((element) => element.open), false);
  await page.close();
});

test('copy reports actual success and offers manual selection when the clipboard rejects', async () => {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' });
  const page = await context.newPage();
  const outbound = [];
  page.on('request', (request) => { if (request.method() !== 'GET') outbound.push(request.method()); });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.locator('#copy-plan').click();
  await page.waitForFunction(() => document.querySelector('#copy-status').textContent.includes('План скопирован'));
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied, await page.locator('#plan-summary').inputValue());
  assert.match(await page.locator('#copy-status').innerText(), /Заявка не отправлена/);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied for test'); } } }));
  await page.locator('#copy-plan').click();
  await page.waitForFunction(() => document.querySelector('#copy-status').textContent.includes('вручную'));
  const selection = await page.locator('#plan-summary').evaluate((element) => ({ start: element.selectionStart, end: element.selectionEnd, length: element.value.length, focused: element === document.activeElement }));
  assert.deepEqual(selection, { start: 0, end: selection.length, length: selection.length, focused: true });
  assert.doesNotMatch(await page.locator('#copy-status').innerText(), /План скопирован/);
  assert.deepEqual(outbound, []);
  await context.close();
});
