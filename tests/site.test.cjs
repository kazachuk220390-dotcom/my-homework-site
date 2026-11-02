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
  assert.match(await page.locator('.review-bar').innerText(), /Версия для куратора/);
  assert.match(await page.locator('.test-mode').innerText(), /Заявки и персональные данные не отправляются/);
  assert.equal(await page.locator('form,input,textarea:not([readonly])').count(), 0);
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

test('visible copy and interactive messages omit sentence periods while preserving other punctuation', async () => {
  const page = await openPage();
  for (const summary of await page.locator('details summary').all()) await summary.click();
  const bodyText = await page.locator('body').innerText();
  assert.doesNotMatch(withoutPermittedPeriods(bodyText), /[.\u2026]/);
  assert.match(bodyText, /учёный!/);
  assert.match(bodyText, /вопрос\?/);
  assert.match(bodyText, /«Крио/);
  assert.match(bodyText, /sumnauka\.ru/);
  assert.match(bodyText, /v0\.2/);
  assert.doesNotMatch(withoutPermittedPeriods(await page.locator('#plan-summary').inputValue()), /[.\u2026]/);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } }));
  await page.locator('#copy-plan').click();
  await page.waitForFunction(() => document.querySelector('#copy-status').textContent.includes('План скопирован'));
  assert.doesNotMatch(await page.locator('#copy-status').innerText(), /[.\u2026]/);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied for test'); } } }));
  await page.locator('#copy-plan').click();
  await page.waitForFunction(() => document.querySelector('#copy-status').textContent.includes('вручную'));
  assert.doesNotMatch(await page.locator('#copy-status').innerText(), /[.\u2026]/);
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
  assert.equal(await page.locator('#plan-price').innerText(), 'от 12 500 ₽');
  await page.close();
});

test('approved group prices update every package and remain synchronized with the planner', async () => {
  const page = await openPage();
  const expected = [
    [10, 9000, 11500, 14500], [15, 9000, 12000, 15000],
    [20, 9000, 12500, 15500], [25, 9000, 13000, 16000],
    [30, 9000, 13500, 16500], [35, 9000, 14000, 17000],
    [40, 9000, 14500, 17500],
  ];
  const digits = (value) => Number(value.replace(/\D/g, ''));
  for (const [guests, start, party, max] of expected) {
    await page.selectOption('#guest-count', String(guests));
    assert.equal(await page.locator('#plan-guests').inputValue(), String(guests));
    for (const [program, price] of [['start', start], ['party', party], ['max', max]]) {
      assert.equal(digits(await page.locator(`[data-price="${program}"]`).innerText()), price);
      await page.selectOption('#plan-package', program);
      assert.equal(digits(await page.locator('#plan-price').innerText()), price);
      assert.match(await page.locator('#plan-summary').inputValue(), /Это план для обсуждения, не бронирование/);
    }
  }
  await page.selectOption('#plan-guests', '15');
  assert.equal(await page.locator('#guest-count').inputValue(), '15');
  assert.equal(digits(await page.locator('[data-price="party"]').innerText()), 12000);
  await page.close();
});

test('package buttons choose the requested program and navigate to its plan', async () => {
  const page = await openPage();
  for (const [program, name, minutes] of [['start', 'Крио Старт', 60], ['party', 'Крио Праздник', 90], ['max', 'Научный максимум', 120]]) {
    const buttons = await page.locator(`[data-select-package="${program}"]`).all();
    assert.ok(buttons.length > 0);
    for (const button of buttons) {
      await button.click();
      assert.equal(await page.locator('#plan-package').inputValue(), program);
      assert.equal(new URL(page.url()).hash, '#planner');
      const summary = await page.locator('#plan-summary').inputValue();
      assert.ok(summary.includes(`${name} · ${minutes} минут`));
    }
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
