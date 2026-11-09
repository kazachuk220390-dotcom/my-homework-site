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
  await stubExternalPresentation(page);
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
// Tests run offline: remote presentation assets are replaced with deterministic fixtures
async function stubExternalPresentation(page) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({status: 200, contentType: 'text/css', body: ''}));
  await page.route('https://static.tildacdn.com/**', route => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8////fwYGBgYmBigAAD34BADaOyqcAAAAAElFTkSuQmCC', 'base64')
  }));
}


for (const width of [320, 390, 768, 1440]) {
  test(`page renders at ${width}px without overflow, script errors or broken assets`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    const failures = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await stubExternalPresentation(page);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
    await loadAllImages(page);
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      heading: document.querySelector('h1').getBoundingClientRect().width,
      images: Array.from(document.images, (image) => image.complete && image.naturalWidth > 0),
      overflowing: [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > innerWidth + .5).slice(0, 8).map((element) => `${element.tagName}.${element.className?.baseVal || element.className}`),
    }));
    assert.ok(layout.content <= layout.width, `content ${layout.content} exceeds viewport ${layout.width}: ${layout.overflowing.join(', ')}`);
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
  await stubExternalPresentation(page);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  const brokenTargets = await page.locator('a[href^="#"]').evaluateAll((links) => links
    .map((link) => link.getAttribute('href')).filter((href) => href !== '#' && !document.getElementById(href.slice(1))));
  assert.deepEqual(brokenTargets, []);
  assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
  assert.equal(await page.locator('.review-bar').count(), 0);
  assert.match(await page.locator('.test-mode').innerText(), /Дата не бронируется автоматически/);
  assert.equal(await page.locator('form,input:not([type="checkbox"]),textarea:not([readonly])').count(), 0);
  assert.equal(await page.locator('input[type="checkbox"]').count(), 2);
  assert.equal(await page.locator('iframe,script[src^="http"]').count(), 0);
  assert.equal(await page.locator('img[src^="http"]').count(), 2);
  const permittedHosts = [new URL(baseURL).host, 'fonts.googleapis.com', 'static.tildacdn.com'];
  assert.ok(requests.every(request => request.method === 'GET' && permittedHosts.includes(new URL(request.url).host)));
  assert.equal(await page.locator('.hero-facts').count(), 0);
  assert.equal(await page.locator('.dna-graphic').count(), 1);
  await page.close();
});

test('six selected event photos load as local WebP with useful display area on mobile and desktop', async () => {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const requested = [];
    page.on('request', (request) => requested.push(new URL(request.url()).pathname));
    await stubExternalPresentation(page);
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
    assert.ok(!requested.some((url) => /\/assets\/photos\/.*\.(jpe?g|png)$/i.test(url)), 'original full-size source photographs must not be downloaded by the page');
    assert.equal(await page.locator('img[src^="data:"]').count(), 0, 'photographs must be separate cacheable files, not embedded base64');
    await page.close();
  }
});

test('updated laboratory decorations preserve links and remove the rejected labels and rings', async () => {
  const page = await openPage();
  assert.equal(await page.locator('.hero-fog').count(), 1);
  assert.equal(await page.locator('.science-burst').count(), 1);
  assert.equal(await page.locator('svg.gallery-float').count(), 2);
  assert.deepEqual(await page.locator('svg.gallery-float use').evaluateAll((uses) => uses.map((element) => element.getAttribute('href')).sort()), ['#lab-flask', '#lab-test-tube']);
  assert.equal(await page.locator('.science-burst circle').count(), 0);
  assert.equal(await page.locator('.hero .science-code').count(), 0);
  assert.equal(await page.locator('.hero .hero-explosion').count(), 0);
  assert.equal(await page.locator('#show .lab-interlude .hero-explosion').count(), 1);
  assert.equal(await page.locator('.feature-sun').count(), 1);
  const sun = page.locator('.feature-sun');
  assert.equal(await sun.locator('svg').count(), 1);
  assert.match(await sun.locator('xpath=ancestor::article').innerText(), /У каждой программы свой характер/);
  const visibleText = await page.locator('body').innerText();
  assert.equal((visibleText.match(/вау/giu) || []).length, 1);
  assert.doesNotMatch(visibleText, /серпантин|EXPERIMENT|WOW REACTION|SCIENCE SHOW/iu);
  const brandSource = await page.locator('.site-header .brand img').getAttribute('src');
  const favicon = page.locator('link[rel="icon"]');
  assert.equal(await favicon.getAttribute('href'), brandSource);
  assert.match(await favicon.getAttribute('type'), /image\/png/);
  const hero = page.locator('.hero-photo');
  assert.equal(await hero.getAttribute('href'), await hero.locator('img').getAttribute('src'));
  const popupPromise = page.waitForEvent('popup');
  await hero.click({ position: { x: 40, y: 80 } });
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.match(popup.url(), /\/assets\/photos\/birthday-scientist\.webp$/);
  await popup.close();
  await page.close();
});

test('photo gallery retains its photo columns and compact separation with decorative overlays', async () => {
  for (const width of [390, 768, 1440]) {
    const page = await openPage({ width, height: 1000 });
    await loadAllImages(page);
    const geometry = await page.evaluate(() => {
      const gallery = document.querySelector('.photo-gallery');
      const decoration = gallery.querySelector('.gallery-science');
      const photos = [...gallery.querySelectorAll('.photo-card')].map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      });
      return {
        display: getComputedStyle(gallery).display,
        columns: getComputedStyle(gallery).gridTemplateColumns.split(' ').map(Number.parseFloat),
        gap: parseFloat(getComputedStyle(gallery).gap),
        decorationPosition: getComputedStyle(decoration).position,
        decorationPointerEvents: getComputedStyle(decoration).pointerEvents,
        photos,
        momentsBottom: parseFloat(getComputedStyle(document.querySelector('#moments')).paddingBottom),
        packagesTop: parseFloat(getComputedStyle(document.querySelector('#packages')).paddingTop),
      };
    });
    assert.equal(geometry.decorationPosition, 'absolute');
    assert.equal(geometry.decorationPointerEvents, 'none');
    assert.equal(geometry.gap, width > 1100 ? 20 : 16);
    if (width > 680) {
      assert.equal(geometry.display, 'grid');
      assert.equal(geometry.columns.length, 2);
      assert.ok(Math.abs(geometry.columns[0] / geometry.columns[1] - 0.8) < 0.02);
      assert.ok(geometry.photos[0].x < geometry.photos[1].x);
      assert.equal(geometry.photos[1].x, geometry.photos[2].x);
    } else {
      const photos = [...geometry.photos].sort((a, b) => a.y - b.y);
      for (let index = 1; index < photos.length; index++) {
        const gap = photos[index].y - (photos[index - 1].y + photos[index - 1].height);
        assert.ok(Math.abs(gap - 16) < 2, `mobile photographs should be 16px apart, got ${gap}`);
      }
    }
    if (width === 1440) {
      assert.ok(geometry.momentsBottom + geometry.packagesTop <= 90, 'space between photo block and packages should be compact');
      assert.equal(await page.locator('#moments .nucleon-transition').count(), 1);
    }
    await page.close();
  }
});

test('laboratory decoration does not intercept clicks and respects reduced motion', async () => {
  const page = await openPage();
  const decoration = await page.locator('.science-sky, .lab-interlude, .gallery-science, .nucleon-transition').evaluateAll((elements) => elements.map((element) => ({
    pointerEvents: getComputedStyle(element).pointerEvents,
    svgCount: element.querySelectorAll('svg').length,
    text: element.textContent,
  })));
  assert.ok(decoration.length >= 4);
  assert.ok(decoration.every((element) => element.pointerEvents === 'none'));
  assert.ok(decoration.reduce((sum, element) => sum + element.svgCount, 0) >= 5, 'molecules, floating glassware and nucleons should use SVG');
  assert.ok(decoration.some((element) => /H[₂2]O|CO[₂2]|N[₂2]|NaCl/.test(element.text)), 'visible chemical formula decorations should exist');
  const activeAnimations = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length);
  assert.equal(activeAnimations, 0, 'reduced-motion preference must stop decorative animation');
  await page.close();
});

test('secret laboratory remains an unavailable teaser without a booking action', async () => {
  const page = await openPage();
  const lab = page.locator('.secret-lab');
  assert.match(await lab.innerText(), /Только для секретных агентов/iu);
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
  await stubExternalPresentation(page);
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
  assert.equal(await page.locator('#plan-price').innerText(), '30 900 ₽');
  await page.close();
});

test('ordinary show prices add each selected workshop for every group of five after ten', async () => {
  const page = await openPage();
  await page.selectOption('#plan-package', 'show');
  assert.equal(await page.locator('#plan-workshop-wrap').isVisible(), true);
  const groups = [10, 20, 30, 40, 50, 100, 150];
  const workshopTotals = {
    ice: [2500, 3500, 4500, 5500, 6500, 11500, 16500],
    slime: [1500, 2500, 3500, 4500, 5500, 10500, 15500],
    both: [4000, 6000, 8000, 10000, 12000, 22000, 32000],
  };
  const shows = { dry: 9500, cryo: 10000, science: 11000, potter: 11000, halloween: 11000, graduate: 12000, snow: 12000 };
  const numeric = (text) => Number(text.replace(/\D/g, ''));
  for (const [show, base] of Object.entries(shows)) {
    await page.selectOption('#plan-show', show);
    for (const [index, guests] of groups.entries()) {
      await page.selectOption('#plan-guests', String(guests));
      assert.equal(await page.locator('#guest-count').inputValue(), String(guests));
      for (const [ice, slime, extra] of [[false, false, 0], [true, false, workshopTotals.ice[index]], [false, true, workshopTotals.slime[index]], [true, true, workshopTotals.both[index]]]) {
        await page.locator('#plan-workshop-icecream').setChecked(ice);
        await page.locator('#plan-workshop-slime').setChecked(slime);
        assert.equal(numeric(await page.locator('#plan-price').innerText()), base + extra, `${show}: group ${guests}, icecream=${ice}, slime=${slime}`);
        const summary = await page.locator('#plan-summary').inputValue();
        assert.match(summary, new RegExp('Стоимость: ' + (base + extra).toLocaleString('ru-RU').replaceAll('\u00a0', ' ') + ' ₽'));
        assert.match(summary, extra === 0 ? /Общая продолжительность: 60 минут/ : /Общая продолжительность: уточняется при согласовании/);
        assert.equal(await page.locator('#copy-plan').isEnabled(), true);
      }
    }
  }
  await page.close();
});

test('kitchen keeps its unknown base price explicit instead of showing a made-up complete total', async () => {
  const page = await openPage();
  await page.selectOption('#plan-package', 'show');
  await page.selectOption('#plan-show', 'kitchen');
  for (const guests of ['10', '40']) {
    await page.selectOption('#plan-guests', guests);
    const icePrice = guests === '10' ? '2 500 ₽' : '5 500 ₽';
    const slimePrice = guests === '10' ? '1 500 ₽' : '4 500 ₽';
    for (const [ice, slime] of [[false, false], [true, false], [false, true], [true, true]]) {
      await page.locator('#plan-workshop-icecream').setChecked(ice);
      await page.locator('#plan-workshop-slime').setChecked(slime);
      const price = await page.locator('#plan-price').innerText();
      assert.match(price, /расч[её]т|уточн|запрос/iu);
      assert.doesNotMatch(price, /^\s*[\d\s]+\s*₽\s*$/);
      assert.match(await page.locator('#plan-summary').inputValue(), /индивидуал|уточн|расч[её]т|запрос/iu);
      const breakdown = page.locator('#plan-price-breakdown');
      assert.equal(await breakdown.isVisible(), true);
      const text = await breakdown.innerText();
      assert.match(text, /Стоимость шоу уточняется/);
      if (ice) assert.ok(text.includes('крио-мороженое — ' + icePrice));
      if (slime) assert.ok(text.includes('лизуны — ' + slimePrice));
      assert.equal(await page.locator('#workshop-price-icecream').innerText(), icePrice);
      assert.equal(await page.locator('#workshop-price-slime').innerText(), slimePrice);
    }
  }
  await page.close();
});

test('party uses the generic approved show, includes ice cream and adds slime for every approved group', async () => {
  const page = await openPage();
  await page.selectOption('#plan-package', 'show');
  await page.selectOption('#plan-show', 'science');
  await page.selectOption('#plan-package', 'party');
  assert.equal(await page.locator('#plan-workshop-wrap').isVisible(), true);
  assert.equal(await page.locator('#plan-show').isVisible(), false);
  assert.equal(await page.locator('#plan-show-label').isVisible(), false);
  assert.match(await page.locator('#plan-show-description').innerText(), /Научное шоу/);
  assert.doesNotMatch(await page.locator('#plan-show-description').innerText(), /Криошоу|от\s*\d+\s*лет/iu);
  assert.equal(await page.locator('#plan-workshop-icecream').isChecked(), true);
  assert.equal(await page.locator('#plan-workshop-icecream').isDisabled(), true);
  assert.equal(await page.locator('label[for="plan-workshop-icecream"]').isVisible(), false);
  assert.equal(await page.locator('#plan-included-workshop').isVisible(), true);
  assert.match(await page.locator('#plan-included-workshop').innerText(), /крио-мороженое.*включен/iu);
  const priceCases = [[10, 29900, 31400], [20, 30900, 33400], [30, 31900, 35400], [40, 32900, 37400], [50, 33900, 39400], [100, 38900, 49400], [150, 43900, 59400]];
  const numeric = (text) => Number(text.replace(/\D/g, ''));
  for (const [guests, base, withSlime] of priceCases) {
    await page.selectOption('#plan-guests', String(guests));
    assert.equal(await page.locator('#guest-count').inputValue(), String(guests));
    for (const [slime, total] of [[false, base], [true, withSlime]]) {
      await page.locator('#plan-workshop-slime').setChecked(slime);
      assert.equal(numeric(await page.locator('#plan-price').innerText()), total, `party up to ${guests}, slime=${slime}`);
      const summary = await page.locator('#plan-summary').inputValue();
      assert.match(summary, /Основная программа: Научное шоу/);
      assert.doesNotMatch(summary, /Основная программа: Большое Криошоу/);
      assert.doesNotMatch(summary, /от 9 лет|жидкого азота/iu);
      assert.match(summary, new RegExp('Стоимость: ' + total.toLocaleString('ru-RU').replaceAll('\u00a0', ' ') + ' ₽'));
      if (slime) assert.match(summary, /крио-мороженое и лизуны/);
      assert.match(summary, slime ? /Общая продолжительность: с добавлением лизунов согласовывается отдельно/ : /Общая продолжительность: 150 минут/);
      assert.equal(await page.locator('#copy-plan').isEnabled(), true);
      assert.equal(await page.locator('#discuss-plan').isEnabled(), true);
    }
  }
  await page.selectOption('#plan-package', 'show');
  assert.equal(await page.locator('#plan-show').isVisible(), true);
  assert.equal(await page.locator('#plan-show-label').isVisible(), true);
  assert.equal(await page.locator('#plan-show').inputValue(), 'science', 'returning to ordinary shows should preserve the last selected programme');
  assert.equal(await page.locator('label[for="plan-workshop-icecream"]').isVisible(), true);
  assert.equal(await page.locator('#plan-included-workshop').isVisible(), false);
  assert.equal(await page.locator('#plan-workshop-icecream').isEnabled(), true);
  assert.equal(await page.locator('#plan-workshop-icecream').isChecked(), false);
  assert.equal(await page.locator('#plan-workshop-slime').isChecked(), false);
  assert.equal(await page.locator('#copy-plan').isEnabled(), true);
  assert.equal(await page.locator('#discuss-plan').isEnabled(), true);
  assert.equal(await page.locator('#plan-workshop-wrap').isVisible(), true);
  await page.close();
});

test('both group selectors expose approved upper bounds and over-150 plans remain manual in every format', async () => {
  const page = await openPage();
  for (const id of ['guest-count', 'plan-guests']) {
    const options = await page.locator(`#${id} option`).evaluateAll((elements) => elements.map((element) => ({ value: element.value, text: element.textContent })));
    assert.deepEqual(options.map((option) => option.value), ['10', '20', '30', '40', '50', '100', '150', 'over150']);
    for (const option of options.slice(0, 7)) assert.match(option.text, new RegExp('До ' + option.value + '\\s*детей', 'iu'));
    assert.match(options[7].text, /Более\s*150.*по\s*расч[её]ту/iu);
  }
  assert.match(await page.locator('body').innerText(), /верхн.*границ|верхн.*числ|максимальн.*числ|до\s*выбранного\s*количества/iu);
  for (const format of ['show', 'party']) {
    await page.selectOption('#plan-package', format);
    if (format === 'show') await page.selectOption('#plan-show', 'cryo');
    await page.selectOption('#guest-count', 'over150');
    assert.equal(await page.locator('#plan-guests').inputValue(), 'over150');
    const additions = format === 'show' ? [[false, false], [true, false], [false, true], [true, true]] : [[true, false], [true, true]];
    for (const [ice, slime] of additions) {
      if (format === 'show') await page.locator('#plan-workshop-icecream').setChecked(ice);
      await page.locator('#plan-workshop-slime').setChecked(slime);
      assert.match(await page.locator('#plan-price').innerText(), /расч[её]т|уточн|запрос/iu);
      assert.doesNotMatch(await page.locator('#plan-price').innerText(), /^\s*[\d\s]+\s*₽\s*$/);
      assert.match(await page.locator('#plan-summary').inputValue(), /Группа: более\s*150/iu);
      assert.equal(await page.locator('#discuss-plan').isEnabled(), true);
      assert.equal(await page.locator('#copy-plan').isEnabled(), true);
    }
  }
  await page.close();
});

test('selecting the first package programme updates its full description, not just price', async () => {
  const page = await openPage();
  await page.locator('#show-options summary').click();
  await page.selectOption('#show-choice', 'cryo');
  assert.match(await page.locator('#show-choice-description').innerText(), /жидкого азота/);
  assert.match(await page.locator('#show-choice-meta').innerText(), /5 лет/);
  assert.equal(await page.locator('#show-choice-highlights li').count(), 3);
  await page.selectOption('#show-choice', 'halloween');
  assert.match(await page.locator('#show-choice-description').innerText(), /Таинственная лаборатория/);
  assert.match(await page.locator('#show-choice-meta').innerText(), /5 лет/);
  await page.close();
});

test('review details open separately with no link to the former website', async () => {
  const page = await openPage();
  assert.equal(await page.locator('#reviews a').count(), 0);
  const cards = page.locator('#reviews .review-card');
  assert.equal(await cards.count(), 3);
  await cards.first().locator('summary').click();
  assert.equal(await cards.first().locator('.review-details').getAttribute('open'), '');
  assert.equal(await cards.nth(1).locator('.review-details').getAttribute('open'), null);
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
  const first = page.locator('.faq-list details').first();
  const summary = first.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  assert.equal(await first.evaluate((element) => element.open), true);
  assert.equal(await first.locator('p').isVisible(), true);
  await page.keyboard.press('Space');
  assert.equal(await first.evaluate((element) => element.open), false);
  await page.close();
});

test('primary holiday action reaches contacts and focuses the phone without copying or sending a request', async () => {
  const page = await openPage();
  await page.selectOption('#plan-package', 'show');
  await page.selectOption('#plan-show', 'cryo');
  await page.locator('#plan-workshop-slime').check();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { window.clipboardCalls = (window.clipboardCalls || 0) + 1; } } }));
  const requests = [];
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
  assert.match(await page.locator('#discuss-plan').innerText(), /Хочу такой праздник/);
  await page.locator('#discuss-plan').click();
  assert.equal(new URL(page.url()).hash, '#contacts');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), 'tel:+79118757385');
  assert.match(await page.locator('#contact-plan-status').innerText(), /Большое Криошоу/);
  assert.match(await page.locator('#contact-plan-status').innerText(), /лизуны/);
  assert.equal(await page.evaluate(() => window.clipboardCalls || 0), 0);
  assert.doesNotMatch(await page.locator('#copy-status').innerText(), /скопирован|сохран[её]н|отправлен/iu);
  assert.ok(requests.every((request) => request.method === 'GET'), 'contact navigation must not submit the plan');
  const contactBounds = await page.locator('#contacts').boundingBox();
  assert.ok(contactBounds.y < 1000 && contactBounds.y + contactBounds.height > 0, 'contacts should be in view');
  await page.close();
});

test('secondary save action really copies and offers manual selection when the clipboard rejects', async () => {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' });
  const page = await context.newPage();
  const outbound = [];
  page.on('request', (request) => { if (request.method() !== 'GET') outbound.push(request.method()); });
  await stubExternalPresentation(page);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  assert.match(await page.locator('#copy-plan').innerText(), /Сохранить подбор/);
  await page.locator('#copy-plan').click();
  await page.waitForFunction(() => document.querySelector('#copy-status').textContent.includes('Подбор скопирован'));
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied, await page.locator('#plan-summary').inputValue());
  assert.match(await page.locator('#copy-status').innerText(), /можно сохранить или отправить при обсуждении праздника/);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied for test'); } } }));
  await page.locator('#copy-plan').click();
  await page.waitForFunction(() => document.querySelector('#copy-status').textContent.includes('вручную'));
  const selection = await page.locator('#plan-summary').evaluate((element) => ({ start: element.selectionStart, end: element.selectionEnd, length: element.value.length, focused: element === document.activeElement }));
  assert.deepEqual(selection, { start: 0, end: selection.length, length: selection.length, focused: true });
  assert.doesNotMatch(await page.locator('#copy-status').innerText(), /Подбор скопирован/);
  assert.deepEqual(outbound, []);
  await context.close();
});
