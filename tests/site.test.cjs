const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain' };
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
  await page.evaluate(async () => { await document.fonts.ready; });
  return page;
}

async function loadAllImages(page) {
  for (const image of await page.locator('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(async (element) => { await element.decode(); });
  }
}

const photoNames = ['birthday-scientist', 'professor', 'guests', 'megafog', 'icecream-making', 'icecream-result'];
// Owner input, including the later graduate wording correction, independent of app.js.
const approvedDescriptions = {
  dry: 'Туман, "научная каша" и необычные свойства сухого льда — интерактивное путешествие для самых маленьких исследователей',
  cryo: 'Ледяная магия жидкого азота, эффектные замораживания и большой научный финал, где удивляются даже искушенные зрители',
  science: 'Для любопытных исследователей — сложные увлекательные химические и физические явления с обсуждением удивительных реакций',
  potter: 'Школа чудесных открытий — наука встречается с атмосферой волшебства, а гости превращаются в юных волшебников',
  graduate: 'Выпускной, где целый класс участвует в опытах, делает открытия и принимает поздравления, а в завершении праздника Профессор дарит подарок каждому выпускнику',
  kitchen: 'Научная кухня, где привычные вещи открываются с неожиданной стороны — детали программы подбираем под формат праздника',
};
// Remote logo and embedded Yandex Form use offline fixtures; local fonts remain real.
async function stubExternalPresentation(page) {
  await page.route('https://static.tildacdn.com/**', route => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8////fwYGBgYmBigAAD34BADaOyqcAAAAAElFTkSuQmCC', 'base64')
  }));
  await page.route('https://forms.yandex.ru/**', route => route.fulfill({
    status: 200, contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html lang="ru"><head><title>Тестовая Яндекс Форма</title></head><body>Встроенная форма для проверки вёрстки</body></html>'
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
  await page.evaluate(async () => { await document.fonts.ready; });
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

test('navigation, consent links and embedded form exist without local data submission', async () => {
  const page = await browser.newPage();
  const requests = [];
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
  await stubExternalPresentation(page);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; });
  const brokenTargets = await page.locator('a[href^="#"]').evaluateAll((links) => links
    .map((link) => link.getAttribute('href')).filter((href) => href !== '#' && !document.getElementById(href.slice(1))));
  assert.deepEqual(brokenTargets, []);
  assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
  assert.equal(await page.locator('.review-bar').count(), 0);
  assert.match(await page.locator('#request-title').innerText(), /Ваш праздник — наши научные открытия!/);
  assert.equal(await page.locator('form,input:not([type="checkbox"]),textarea:not([readonly])').count(), 0);
  assert.equal(await page.locator('input[type="checkbox"]').count(), 2);
  assert.equal(await page.locator('iframe#request-form-iframe').count(), 1);
  assert.equal(await page.locator('script[src^="http"]').count(), 0);
  assert.equal(await page.locator('#request-form-iframe').getAttribute('src'), 'about:blank');
  assert.equal(await page.locator('#request-form-launch').count(), 1);
  assert.ok((await page.locator('#request').boundingBox()).height < 500, 'request section should remain compact');
  assert.equal(await page.locator('#request-dialog').getAttribute('open'), null);
  assert.equal(await page.locator('#request-form-open[target="_blank"]').count(), 1);
  assert.equal(await page.locator('a[href="./privacy.html"],a[href="./consent.html"]').count(), 4);
  assert.equal(await page.locator('img[src^="http"]').count(), 2);
  const permittedHosts = [new URL(baseURL).host, 'static.tildacdn.com', 'forms.yandex.ru'];
  assert.ok(requests.every(request => request.method === 'GET' && permittedHosts.includes(new URL(request.url).host)));
  assert.equal(await page.locator('.hero-facts').count(), 0);
  assert.equal(await page.locator('.dna-graphic').count(), 1);
  assert.equal(await page.locator('#planner a.official-link,#planner a[href*="sumnauka.ru"]').count(), 0);
  await page.close();
});

test('Nunito is loaded locally for Cyrillic text without a Google Fonts request', async () => {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const requested = [];
  page.on('request', (request) => requested.push(request.url()));
  await stubExternalPresentation(page);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; });
  const fonts = await page.evaluate(async () => {
    const loaded = await document.fonts.load('600 20px "Nunito"', 'Сумасшедшая наука');
    await document.fonts.ready;
    return { family: getComputedStyle(document.body).fontFamily, loaded: loaded.map((face) => ({ family: face.family, status: face.status })) };
  });
  assert.match(fonts.family, /Nunito/);
  assert.ok(fonts.loaded.length > 0, 'a matching local FontFace must actually load');
  assert.ok(fonts.loaded.every((font) => /Nunito/.test(font.family) && font.status === 'loaded'));
  assert.ok(requested.some((url) => url.startsWith(baseURL + '/assets/fonts/') && /\.woff2?(?:\?|$)/.test(url)));
  assert.ok(!requested.some((url) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url)));
  await page.close();
});

test('six selected event photos load as local WebP with useful display area on mobile and desktop', async () => {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const requested = [];
    page.on('request', (request) => requested.push(new URL(request.url()).pathname));
    await stubExternalPresentation(page);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; });
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
  assert.equal(await page.locator('.hero-explosion').count(), 0);
  assert.equal(await page.locator('.hero-actions .hero-reaction svg.reactor-flask').count(), 1);
  const interlude = page.locator('#show .lab-interlude');
  const interludeUses = await interlude.locator('svg use').evaluateAll((uses) => uses.map((element) => element.getAttribute('href')));
  assert.ok(interludeUses.includes('#lab-flask') && interludeUses.includes('#lab-test-tube'));
  assert.match(await interlude.textContent(), /H[₂2]O|CO[₂2]|N[₂2]/);
  const interludeBounds = await interlude.boundingBox();
  const showBounds = await page.locator('#show').boundingBox();
  assert.ok(Math.abs(interludeBounds.x + interludeBounds.width / 2 - (showBounds.x + showBounds.width / 2)) < 25, 'laboratory interlude should be centred');
  assert.equal(await page.locator('.discovery-strip svg').count(), 5);
  assert.doesNotMatch(await page.locator('.discovery-strip').textContent(), /✳|❄/u);
  assert.equal(await page.locator('svg.feature-hand,.feature-hand svg').count(), 1);
  const secondFeature = page.locator('.feature-grid article').nth(1);
  assert.equal(await secondFeature.locator('h3').innerText(), 'Понятно о сложном');
  assert.doesNotMatch(await secondFeature.locator('p').innerText(), /участ/iu);
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
  assert.equal(await hero.locator('.art-bottom').evaluate((element) => getComputedStyle(element).color), 'rgb(18, 62, 86)');
  assert.equal(await hero.getAttribute('href'), await hero.locator('img').getAttribute('src'));
  const popupPromise = page.waitForEvent('popup');
  await hero.click({ position: { x: 40, y: 80 } });
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.match(popup.url(), /\/assets\/photos\/birthday-scientist\.webp$/);
  await popup.close();
  const fogImageLink = page.locator('a.photo-frame[href$="megafog.webp"]');
  assert.equal(await fogImageLink.locator('svg.photo-corner-visual').count(), 0, 'glassware must not cover photographs');
  assert.equal(await page.locator('.gallery-science-divider').count(), 1, 'glassware should occupy its own inter-photo gap');
  const galleryPopupPromise = page.waitForEvent('popup');
  await fogImageLink.click();
  const galleryPopup = await galleryPopupPromise;
  await galleryPopup.waitForLoadState('domcontentloaded');
  assert.match(galleryPopup.url(), /\/assets\/photos\/megafog\.webp$/);
  await galleryPopup.close();
  await page.close();
});

test('compact gallery decor stays inside the reviewed empty photo area and narrow inter-photo gap', async () => {
  for (const width of [320,390,768,1440]) {
    const page=await openPage({width,height:900});
    await loadAllImages(page);
    const geometry=await page.evaluate(()=>{
      const rect=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,w:b.width,h:b.height}};
      const gallery=document.querySelector('.photo-gallery');
      return {frames:[...gallery.querySelectorAll('.photo-frame')].map(rect),roi:rect(gallery.querySelector('.gallery-science')),gap:rect(gallery.querySelector('.gallery-science-divider')),effects:[...gallery.querySelectorAll('.gallery-science svg')].map(rect),grid:getComputedStyle(gallery).columnGap};
    });
    assert.equal(geometry.frames.length,3);
    assert.ok(geometry.frames.every(f=>f.w>140&&f.h>140));
    const photo=geometry.frames[0],roi=geometry.roi;
    assert.ok(roi.x>=photo.x && roi.right<=photo.x+photo.w*.27 && roi.y>=photo.y && roi.bottom<=photo.y+photo.h*.21, 'overlay only touches the approved upper-left empty wall');
    for(const e of geometry.effects) assert.ok(e.x>=roi.x-1&&e.right<=roi.right+1&&e.y>=roi.y-1&&e.bottom<=roi.bottom+1,'effect stays in approved ROI');
    assert.ok(geometry.gap.h<=36, 'no tall decorative spacer');
    assert.ok(geometry.gap.y>=geometry.frames[1].bottom && geometry.gap.bottom<=geometry.frames[2].y, 'small separator never covers either landscape photograph');
    if(width>680) assert.ok(parseFloat(geometry.grid)<=16, 'dense desktop layout');
    await page.close();
  }
});

test('laboratory decoration does not intercept clicks and respects reduced motion', async () => {
  const page = await openPage();
  const decoration = await page.locator('.science-sky, .lab-interlude, .gallery-science, .gallery-science-divider, .nucleon-transition, .hero-reaction').evaluateAll((elements) => elements.map((element) => ({
    pointerEvents: getComputedStyle(element).pointerEvents,
    svgCount: element.querySelectorAll('svg').length,
    text: element.textContent,
  })));
  assert.ok(decoration.length >= 6);
  assert.ok(decoration.every((element) => element.pointerEvents === 'none'));
  assert.ok(decoration.reduce((sum, element) => sum + element.svgCount, 0) >= 5, 'molecules, floating glassware and nucleons should use SVG');
  assert.ok(decoration.some((element) => /H[₂2]O|CO[₂2]|N[₂2]|NaCl/.test(element.text)), 'visible chemical formula decorations should exist');
  const activeAnimations = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length);
  assert.equal(activeAnimations, 0, 'reduced-motion preference must stop decorative animation');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const bubbling = await page.locator('.hero-reaction').evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length);
  assert.ok(bubbling > 0, 'hero flask should bubble when motion is allowed');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.hero-reaction').evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length), 0);
  await page.close();
});

test('secret laboratory remains an unavailable teaser without a booking action', async () => {
  const page = await openPage();
  const lab = page.locator('.secret-lab');
  assert.match(await lab.innerText(), /Только для секретных агентов/iu);
  assert.match(await lab.innerText(), /59 900/);
  assert.match(await lab.innerText(), /Скоро рассекретим/);
  assert.equal((await page.locator('#secret-lab-title').innerText()).replace(/\s+/g, ' ').trim(), 'Секретная Лаборатория');
  assert.doesNotMatch(await lab.innerText(), /Лаборатория\s+[ХX]|№\s*[ХX]|[ХX]-001|Досье.*[ХX]/iu);
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
  await page.evaluate(async () => { await document.fonts.ready; });
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
  const shows = { dry: 9500, cryo: 10000, science: 11000, potter: 11000, graduate: 12000 };
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
      assert.match(await page.locator('[data-package="party"] .price').innerText(), /^от\s*29 900\s*₽$/u);
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
      if (format === 'party') assert.match(await page.locator('[data-package="party"] .price').innerText(), /^от\s*29 900\s*₽$/u);
      assert.equal(await page.locator('#discuss-plan').isEnabled(), true);
      assert.equal(await page.locator('#copy-plan').isEnabled(), true);
    }
  }
  await page.close();
});

test('all six active programmes show the owner’s exact descriptions in the catalogue and planner', async () => {
  const page = await openPage();
  await page.selectOption('#plan-package', 'show');
  await page.locator('#show-options summary').click();
  const activeCodes = Object.keys(approvedDescriptions);
  for (const id of ['show-choice', 'plan-show']) {
    assert.deepEqual(await page.locator(`#${id} option`).evaluateAll((options) => options.map((option) => option.value)), activeCodes);
  }
  for (const [code, description] of Object.entries(approvedDescriptions)) {
    await page.selectOption('#show-choice', code);
    assert.equal(await page.locator('#show-choice-description').textContent(), description);
    assert.equal(await page.locator('#show-choice-highlights li').count(), 3);
    assert.equal(await page.locator('#plan-show').inputValue(), code);
    assert.ok((await page.locator('#plan-show-description').textContent()).startsWith(description + ' · '));
    const summary = await page.locator('#plan-summary').inputValue();
    assert.ok(summary.includes('Особенности: ' + description));
    assert.doesNotMatch(summary, /halloween|snow|Хеллоуин|Снегурочк/iu);
  }
  for (const [code, description] of Object.entries(approvedDescriptions).reverse()) {
    await page.selectOption('#plan-show', code);
    assert.ok((await page.locator('#plan-show-description').textContent()).startsWith(description + ' · '));
    assert.ok((await page.locator('#plan-summary').inputValue()).includes('Особенности: ' + description));
  }
  await page.close();
});

test('seasonal programmes are unavailable in both selectors and no seasonal placeholder is published', async () => {
  const page = await openPage();
  await page.selectOption('#plan-package', 'show');
  for (const id of ['show-choice', 'plan-show']) {
    for (const code of ['halloween', 'snow']) {
      assert.equal(await page.locator(`#${id} option[value="${code}"]`).count(), 0);
    }
    const labels = await page.locator(`#${id} option`).allTextContents();
    assert.doesNotMatch(labels.join('\n'), /Хеллоуин|Снегурочк/iu);
  }
  assert.equal(await page.locator('section[id*="season"],section[class*="season"],#seasonal-shows,.seasonal-shows').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /Хеллоуин|Снегурочк|сезонные\s+(программы|шоу)/iu);
  await page.selectOption('#plan-package', 'party');
  assert.doesNotMatch(await page.locator('#plan-summary').inputValue(), /halloween|snow|Хеллоуин|Снегурочк/iu);
  await page.selectOption('#plan-package', 'show');
  assert.doesNotMatch(await page.locator('#plan-summary').inputValue(), /halloween|snow|Хеллоуин|Снегурочк/iu);
  await page.close();
});

test('each review has a visible independent button and a closeable detailed review dialog', async () => {
  const page=await openPage({width:390,height:844});
  assert.equal(await page.locator('#reviews a').count(),0,'no external review links');
  const cards=page.locator('#reviews .review-card');
  assert.equal(await cards.count(),3);
  const buttons=page.locator('#reviews .review-open-button');
  assert.equal(await buttons.count(),3);
  const dialogs=page.locator('#reviews dialog.review-dialog');
  assert.equal(await dialogs.count(),3);
  assert.ok(await buttons.first().isVisible());
  assert.match(await buttons.first().innerText(),/Посмотреть весь отзыв/);
  await buttons.first().click();
  assert.equal(await page.locator('#review-dialog-irina').evaluate(e=>e.open),true);
  assert.equal(await page.locator('#review-dialog-apelsin').evaluate(e=>e.open),false);
  assert.match(await page.locator('#review-dialog-irina').innerText(),/Юлия- настоящий профессионал своего дела!/);
  await page.locator('#review-dialog-irina .review-dialog-close').click();
  assert.equal(await page.locator('#review-dialog-irina').evaluate(e=>e.open),false);
  await buttons.nth(1).click();
  assert.equal(await page.locator('#review-dialog-apelsin').evaluate(e=>e.open),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#review-dialog-apelsin').evaluate(e=>e.open),false);
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


test('mobile science effects use SVG rather than emoji and can be enabled with reduced motion', async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce'
  });
  await stubExternalPresentation(page);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.mobile-motion-toggle').isVisible(), true);
  assert.equal(await page.locator('.mobile-motion-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('.snow-particle').count(), 4);
  const symbols = await page.locator('body').innerText();
  assert.doesNotMatch(symbols, /[✳❄]/);
  assert.equal(await page.locator('[href="#science-snowflake"]').count() > 0, true);
  assert.equal(await page.locator('[href="#science-molecule"]').count() > 0, true);
  await page.locator('#mobile-motion-toggle').click();
  assert.equal(await page.locator('.mobile-motion-toggle').getAttribute('aria-pressed'), 'true');
  const animations = await page.evaluate(() => ({
    snow: getComputedStyle(document.querySelector('.snow-particle-a')).animationName,
    dna: getComputedStyle(document.querySelector('.dna-graphic')).animationName,
    molecule: getComputedStyle(document.querySelector('.mol-a')).animationName,
    fog: getComputedStyle(document.querySelector('.hero-fog i')).animationName,
    reaction: getComputedStyle(document.querySelector('.reaction-bubble')).animationName
  }));
  for (const [label, name] of Object.entries(animations)) {
    assert.notEqual(name, 'none', label + ' must animate after explicit opt-in');
  }
  await page.locator('#mobile-motion-toggle').click();
  assert.equal(await page.locator('.mobile-motion-toggle').getAttribute('aria-pressed'), 'false');
  await page.close();
});

test('mobile effects play by default without reduced-motion preference', async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference'
  });
  await stubExternalPresentation(page);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#mobile-motion-toggle').getAttribute('aria-pressed'), 'true');
  const moving = await page.evaluate(() => {
    const names = ['.dna-graphic','.mol-a','.snow-particle-a','.hero-fog i','.reaction-bubble'];
    return names.map(name => ({name, animation: getComputedStyle(document.querySelector(name)).animationName}));
  });
  assert.ok(moving.every(a => a.animation !== 'none'), JSON.stringify(moving));
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

test('holiday calculator opens compact modal with plan context and no accidental form submission', async () => {
  const page = await openPage();
  await page.selectOption('#plan-package', 'show');
  await page.selectOption('#plan-show', 'cryo');
  await page.locator('#plan-workshop-slime').check();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { window.clipboardCalls = (window.clipboardCalls || 0) + 1; } } }));
  const requests = [];
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
  assert.match(await page.locator('#discuss-plan').innerText(), /Хочу такой праздник/);
  await page.locator('#discuss-plan').click();
  assert.equal(await page.locator('#request-dialog').getAttribute('open'), '');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('id')), 'request-dialog-close');
  assert.match(await page.locator('#request-plan-status').innerText(), /Большое Криошоу/);
  assert.match(await page.locator('#request-plan-status').innerText(), /Мастер-классы:.*лизуны.*Группа: До 10 детей/u);
  const url = new URL(await page.locator('#request-form-open').getAttribute('href'));
  assert.equal(url.searchParams.get('plan_program'), 'Большое Криошоу');
  assert.equal(url.searchParams.get('answer_choices_9008993561263860'), '1794306569052');
  assert.match(url.searchParams.get('plan_workshops'), /лизуны/);
  assert.equal(url.searchParams.get('plan_price'), await page.locator('#plan-price').innerText());
  assert.equal(url.searchParams.get('plan_group'), 'До 10 детей');
  assert.equal(await page.evaluate(() => window.clipboardCalls || 0), 0);
  assert.doesNotMatch(await page.locator('#copy-status').innerText(), /скопирован|сохран[её]н|отправлен/iu);
  assert.ok(requests.every((request) => request.method === 'GET'), 'request navigation must not submit a plan');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#request-dialog').getAttribute('open'), null);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('id')), 'discuss-plan');
  await page.close();
});


test('UTM parameters are passed to Yandex Form iframe and separate link', async () => {
  const page = await browser.newPage();
  await stubExternalPresentation(page);
  await page.goto(baseURL + '/?utm_source=vk&utm_medium=cpc&utm_campaign=autumn-test&custom_parameter=private', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#request-form-iframe').getAttribute('src'), 'about:blank');
  await page.locator('#request-form-launch').click();
  const embed = new URL(await page.locator('#request-form-iframe').getAttribute('src'));
  const link = new URL(await page.locator('#request-form-open').getAttribute('href'));
  const fallback = new URL(await page.locator('#request-form-fallback').getAttribute('href'));
  assert.equal(embed.searchParams.get('iframe'), '1');
  assert.equal(embed.searchParams.get('theme'), 'light');
  for (const u of [embed, link, fallback]) {
    assert.equal(u.searchParams.get('utm_source'), 'vk');
    assert.equal(u.searchParams.get('utm_medium'), 'cpc');
    assert.equal(u.searchParams.get('utm_campaign'), 'autumn-test');
    assert.equal(u.searchParams.has('custom_parameter'), false);
  }
  assert.equal(link.searchParams.has('iframe'), false);
  assert.equal(link.searchParams.get('request_origin'), 'site');
  assert.equal(link.searchParams.has('plan_program'), false, 'general request must not invent a calculator selection');
  assert.equal(link.searchParams.has('plan_price'), false);
  await page.locator('#request-dialog-close').click();
  assert.equal(await page.locator('#request-dialog').getAttribute('open'), null);
  await page.close();
});

test('all matching programs preselect correct Yandex answer IDs without changing consent', async () => {
  const page = await openPage();
  const questionId = 'answer_choices_9008993561263860';
  const answers = { dry: '1794306578311', cryo: '1794306569052', science: '1794306586760' };
  for (const [code, answer] of Object.entries(answers)) {
    await page.selectOption('#plan-package', 'show');
    await page.selectOption('#plan-show', code);
    await page.locator('#discuss-plan').click();
    const url = new URL(await page.locator('#request-form-open').getAttribute('href'));
    assert.equal(url.searchParams.get(questionId), answer, code);
    assert.equal(url.searchParams.has('answer_one_answer_9008993561838392'), false, 'consent cannot be pre-selected');
    await page.locator('#request-dialog-close').click();
  }
  await page.close();
});

test('secondary save action really copies and offers manual selection when the clipboard rejects', async () => {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' });
  const page = await context.newPage();
  const outbound = [];
  page.on('request', (request) => { if (request.method() !== 'GET') outbound.push(request.method()); });
  await stubExternalPresentation(page);
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; });
  assert.equal(await page.locator('#plan-summary').isVisible(), false);
  await page.locator('#view-plan').click();
  assert.match(await page.locator('#copy-plan').innerText(), /Скопировать план/);
  await page.locator('#copy-plan').click();
  await page.waitForFunction(() => document.querySelector('#copy-status').textContent.includes('План скопирован'));
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied, await page.locator('#plan-summary').inputValue());
  assert.match(await page.locator('#copy-status').innerText(), /можно сохранить или отправить при обсуждении праздника/);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied for test'); } } }));
  await page.locator('#copy-plan').click();
  await page.waitForFunction(() => document.querySelector('#copy-status').textContent.includes('вручную'));
  const selection = await page.locator('#plan-summary').evaluate((element) => ({ start: element.selectionStart, end: element.selectionEnd, length: element.value.length, focused: element === document.activeElement }));
  assert.deepEqual(selection, { start: 0, end: selection.length, length: selection.length, focused: true });
  assert.doesNotMatch(await page.locator('#copy-status').innerText(), /План скопирован/);
  assert.deepEqual(outbound, []);
  await context.close();
});

test('discovery strip preserves the four-word sequence and five decorative SVG molecules', async () => {
  const page = await openPage();
  const strip = page.locator('.discovery-strip');
  assert.notEqual(await strip.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(await strip.locator('.page-width > *').evaluateAll(nodes => nodes.map(n => n.tagName.toLowerCase() === 'svg' ? 'molecule' : n.textContent)), [
    'molecule', 'Исследуем', 'molecule', 'Экспериментируем', 'molecule', 'Удивляемся', 'molecule', 'Празднуем', 'molecule'
  ]);
  assert.equal(await strip.locator('use[href="#lab-flask"],.strip-flask').count(), 0);
  for (const svg of await strip.locator('svg').all()) {
    assert.equal(await svg.getAttribute('aria-hidden'), 'true');
    assert.ok(await svg.locator('circle').count() >= 4);
    assert.ok(await svg.locator('path').count() >= 1);
  }
  assert.match(await page.locator('link[rel="stylesheet"]').getAttribute('href'), /styles\.css\?v=0\.10-layout1$/);
  await page.close();
});

test('discovery strip words stay readable and molecules never overlap text on desktop and phones', async () => {
  for (const width of [320, 360, 390, 760, 768, 1000, 1440]) {
    const page = await openPage({ width, height: 1000 });
    await page.locator('.discovery-strip').scrollIntoViewIfNeeded();
    const geometry = await page.locator('.discovery-strip').evaluate(strip => {
      const rect = e => { const r = e.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; };
      return { words: [...strip.querySelectorAll('.strip-word')].map(e => ({...rect(e), font:parseFloat(getComputedStyle(e).fontSize), clipped:e.scrollWidth > e.clientWidth + 1})), molecules:[...strip.querySelectorAll('.strip-molecule')].map(rect), viewport:innerWidth, overflow:document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(geometry.overflow, false, `page overflow at ${width}`);
    for (const word of geometry.words) {
      assert.ok(word.font >= 13 && !word.clipped && word.left >= 0 && word.right <= width, `word must fit at ${width}: ${JSON.stringify(word)}`);
      for (const mol of geometry.molecules) assert.ok(mol.right <= word.left || mol.left >= word.right || mol.bottom <= word.top || mol.top >= word.bottom, `molecule overlaps text at ${width}`);
    }
    const names = await page.locator('.strip-molecule').evaluateAll(nodes => nodes.map(e => getComputedStyle(e).animationName));
    assert.ok(names.every(n => n === 'none'), 'system reduced motion stops the molecules');
    await page.emulateMedia({reducedMotion:'no-preference'});
    const motion = await page.locator('.strip-molecule').evaluateAll(nodes => nodes.map(e => {const s=getComputedStyle(e); return {name:s.animationName,timing:s.animationDuration+'/'+s.animationDelay,transform:s.transform};}));
    assert.ok(motion.every(m => m.name === 'strip-molecule-drift'));
    assert.equal(new Set(motion.map(m => m.timing)).size, 5, 'independent timing');
    await page.waitForTimeout(150);
    const moved = await page.locator('.strip-molecule').evaluateAll(nodes => nodes.map(e => getComputedStyle(e).transform));
    assert.ok(moved.some((transform, i) => transform !== motion[i].transform), 'animation actually moves');
    await page.close();
  }
});

test('all three review dialogs contain the verified originals verbatim and return focus on close', async () => {
  const originals=JSON.parse(fs.readFileSync(path.join(root,'docs/reviews-originals.json'),'utf8'));
  const normalize=s=>s.replace(/\s+/gu,' ').trim();
  for(const width of [390,1440]) {
    const page=await openPage({width,height:900});
    for(const [slug,review] of Object.entries(originals)) {
      const button=page.locator(`[data-review-open="${slug}"]`);
      await button.click();
      assert.equal(await page.locator('dialog.review-dialog[open]').count(),1);
      assert.equal(normalize(await page.locator(`#review-dialog-text-${slug}`).innerText()),normalize(review.text),`original ${slug}`);
      assert.equal(await page.locator(`#review-dialog-${slug} .review-dialog-close`).isVisible(),true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator(`#review-dialog-${slug}`).evaluate(e=>e.open),false);
      assert.equal(await button.evaluate(e=>e===document.activeElement),true);
    }
    assert.doesNotMatch(await page.locator('#reviews').innerText(), /пересказ/iu);
    await page.close();
  }
});

test('the three programme cards align their content slots and the laboratory action is disabled', async () => {
  const page=await openPage();
  const rows=await page.locator('.package-card').evaluateAll(cards=>cards.map(card=>{
    const top=card.getBoundingClientRect().top;
    return {height:card.getBoundingClientRect().height,slots:['.package-top','h3','.package-description','.price','.price-caption','.package-divider','.package-button'].map(selector=>Math.round(card.querySelector(selector).getBoundingClientRect().top-top))};
  }));
  assert.equal(rows.length,3);
  for(const row of rows.slice(1)) {assert.equal(row.height,rows[0].height);assert.deepEqual(row.slots,rows[0].slots);}
  assert.equal(await page.locator('.secret-lab button.package-button').isDisabled(),true);
  assert.match(await page.locator('.secret-lab').innerText(),/Программа готовится к запуску/);
  await page.close();
});

test('detailed plans reflect the current choice, download as UTF-8 text and close accessibly', async () => {
  for(const width of [320,1440]) {
    const page=await openPage({width,height:900});
    assert.equal(await page.locator('#plan-summary').isVisible(),false);
    await page.selectOption('#plan-package','show');
    await page.selectOption('#plan-show','cryo');
    await page.selectOption('#plan-guests','20');
    await page.locator('#plan-workshop-icecream').check();
    await page.locator('#plan-workshop-slime').check();
    await page.locator('#view-plan').click();
    assert.equal(await page.locator('#plan-dialog').evaluate(e=>e.open),true);
    const text=await page.locator('#plan-summary').inputValue();
    assert.match(text,/Большое Криошоу/);assert.match(text,/Группа: до 20 детей/);assert.match(text,/крио-мороженое и лизуны/);assert.match(text,/Стоимость: 16 000 ₽/);
    const pending=page.waitForEvent('download');
    await page.locator('#download-plan').click();
    const download=await pending;
    assert.equal(download.suggestedFilename(),'plan-prazdnika.txt');
    const downloaded=fs.readFileSync(await download.path(),'utf8').replace(/^\uFEFF/,'');
    assert.equal(downloaded,text);
    await page.locator('#plan-dialog-close').click();
    assert.equal(await page.locator('#plan-summary').isVisible(),false);
    assert.equal(await page.locator('#view-plan').evaluate(e=>e===document.activeElement),true);
    await page.selectOption('#plan-package','party');
    await page.locator('#view-plan').click();
    assert.match(await page.locator('#plan-summary').inputValue(),/Формат: Научный переполох/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#plan-dialog').evaluate(e=>e.open),false);
    await page.close();
  }
});

test('all calculator choices and allowed UTM tags travel together without false receipt confirmations', async () => {
  const page=await browser.newPage({reducedMotion:'reduce'});
  await stubExternalPresentation(page);
  await page.goto(baseURL+'/?utm_source=vk&utm_medium=cpc&utm_campaign=science&utm_content=blue&utm_term=show&private_parameter=secret',{waitUntil:'networkidle'});
  const expected=[['show','cryo','Большое Криошоу','16 000 ₽'],['show','potter','Шоу в стиле Гарри Поттера','17 000 ₽'],['show','graduate','Сумасшедший выпускной','18 000 ₽'],['show','kitchen','Сумасшедшая кухня','Цена шоу уточняется'],['party','cryo','Научный переполох','33 400 ₽']];
  for(const [format,show,program,price] of expected) {
    await page.selectOption('#plan-package',format);
    if(format==='show')await page.selectOption('#plan-show',show);
    await page.selectOption('#plan-guests','20');
    if(format==='show')await page.locator('#plan-workshop-icecream').check();
    await page.locator('#plan-workshop-slime').check();
    await page.locator('#discuss-plan').click();
    const link=new URL(await page.locator('#request-form-open').getAttribute('href'));
    const frame=new URL(await page.locator('#request-form-iframe').getAttribute('src'));
    for(const url of [link,frame]) {
      assert.equal(url.searchParams.get('plan_program'),program);
      assert.equal(url.searchParams.get('plan_package'),format==='party'?'Научный переполох':'Научное шоу');
      assert.equal(url.searchParams.get('plan_group'),'До 20 детей');
      assert.equal(url.searchParams.get('plan_price'),price);
      assert.match(url.searchParams.get('plan_workshops'),/крио-мороженое, лизуны/);
      assert.equal(url.searchParams.get('request_origin'),'calculator');
      for(const [key,value] of Object.entries({utm_source:'vk',utm_medium:'cpc',utm_campaign:'science',utm_content:'blue',utm_term:'show'}))assert.equal(url.searchParams.get(key),value);
      assert.equal(url.searchParams.has('private_parameter'),false);
      assert.equal(url.searchParams.has('answer_one_answer_9008993561838392'),false);
      if(['potter','graduate','kitchen'].includes(show)&&format==='show')assert.equal(url.searchParams.has('answer_choices_9008993561263860'),false,'unmapped show is not replaced with help or another programme');
    }
    assert.doesNotMatch(await page.locator('#request-plan-status').innerText(), /отправлен|получен|сохран[её]н|выбрана в форме автоматически/iu);
    await page.keyboard.press('Escape');
  }
  await page.close();
});

test('new scientific scenes stay away from text and respect reduced motion on desktop and phones', async () => {
  for(const width of [320,390,768,1440]) {
    const page=await openPage({width,height:900});
    await page.locator('.faq-list details').first().evaluate(e=>{e.open=true});
    const layout=await page.evaluate(()=>{
      const r=e=>{const b=e.getBoundingClientRect();return{x:b.x,right:b.right,y:b.y,bottom:b.bottom}};
      const selectors=['.lab-interlude','.nucleon-transition','.science-bridge','.faq-microscope'];
      const scenes=selectors.map(s=>document.querySelector(s));
      const controls=[...document.querySelectorAll('#show .section-note,.photo-gallery,.faq-list,#packages .section-heading,#reviews .review-grid')];
      return {scenes:scenes.map(e=>({rect:r(e),events:getComputedStyle(e).pointerEvents,moving:e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length})),controls:controls.map(r),center:r(document.querySelector('.nucleon-transition')),width:innerWidth};
    });
    for(const scene of layout.scenes) {
      assert.equal(scene.events,'none');assert.equal(scene.moving,0);
      for(const control of layout.controls) assert.ok(scene.rect.right<=control.x||scene.rect.x>=control.right||scene.rect.bottom<=control.y||scene.rect.y>=control.bottom,'scientific scene never covers copy, gallery or FAQ');
    }
    assert.ok(Math.abs((layout.center.x+layout.center.right)/2-width/2)<2,'N₂ scene centred');
    assert.equal(await page.locator('.science-bridge use[href="#science-petri"]').count(),1);
    assert.equal(await page.locator('.faq-microscope use[href="#science-microscope"]').count(),1);
    await page.emulateMedia({reducedMotion:'no-preference'});
    const timings=await page.locator('.lab-interlude>*').evaluateAll(nodes=>nodes.map(e=>{const s=getComputedStyle(e);return [s.animationName,s.animationDuration,s.animationDelay].join('/')}));
    assert.equal(new Set(timings).size,4);
    assert.ok(timings.every(t=>!t.startsWith('none/')));
    await page.close();
  }
});
