'use strict';

const programs = {
  start: { name: 'Крио Старт', minutes: 60, base: 9000, group: 9000 },
  party: { name: 'Крио Праздник', minutes: 90, base: 11500, group: 12000 },
  max: { name: 'Научный максимум', minutes: 120, base: 14500, group: 15000 },
};
const formatMoney = (amount) => new Intl.NumberFormat('ru-RU').format(amount).replace(/\u00a0/g, ' ');
const priceFor = (program, guests) => {
  if (program === 'start' || guests <= 10) return programs[program].base;
  return programs[program].group + Math.max(0, Math.ceil((guests - 15) / 5)) * 500;
};

const guestSelect = document.querySelector('#guest-count');
const planGuests = document.querySelector('#plan-guests');
const planPackage = document.querySelector('#plan-package');
const planSummary = document.querySelector('#plan-summary');
const copyStatus = document.querySelector('#copy-status');

function updatePlan() {
  const program = planPackage.value;
  const price = formatMoney(priceFor(program, Number(planGuests.value)));
  document.querySelector('#plan-price').textContent = `от ${price} ₽`;
  planSummary.value = `${programs[program].name} · ${programs[program].minutes} минут\nГруппа: ${planGuests.selectedOptions[0].text.toLowerCase()}\nПредварительная стоимость: от ${price} ₽, выезд согласуется отдельно.\nДату, время и адрес нужно согласовать с организатором.\nЭто план для обсуждения, не бронирование.`;
  copyStatus.textContent = '';
}

function updateGuests(source) {
  const guests = Number(source.value);
  guestSelect.value = String(guests);
  planGuests.value = String(guests);
  document.querySelectorAll('[data-price]').forEach((element) => {
    element.textContent = formatMoney(priceFor(element.dataset.price, guests));
  });
  document.querySelectorAll('[data-price-caption]').forEach((element) => {
    element.textContent = guests <= 10 ? 'Для группы до 10 детей' : `Для группы ${guests - 4}–${guests} детей`;
  });
  updatePlan();
}

guestSelect.addEventListener('change', () => updateGuests(guestSelect));
planGuests.addEventListener('change', () => updateGuests(planGuests));
planPackage.addEventListener('change', updatePlan);
document.querySelectorAll('[data-select-package]').forEach((link) => {
  link.addEventListener('click', () => {
    planPackage.value = link.dataset.selectPackage;
    updatePlan();
  });
});

document.querySelector('#copy-plan').addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(planSummary.value);
    copyStatus.textContent = 'План скопирован. Заявка не отправлена.';
  } catch {
    planSummary.focus();
    planSummary.select();
    copyStatus.textContent = 'Не удалось скопировать автоматически. Текст выделен — скопируйте его вручную.';
  }
});

const menuButton = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('#mobile-nav');
function closeMenu() {
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Открыть меню');
  mobileNav.hidden = true;
}
menuButton.addEventListener('click', () => {
  const expanded = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(expanded));
  menuButton.setAttribute('aria-label', expanded ? 'Закрыть меню' : 'Открыть меню');
  mobileNav.hidden = !expanded;
});
mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !mobileNav.hidden) {
    closeMenu();
    menuButton.focus();
  }
});
window.matchMedia('(min-width: 901px)').addEventListener('change', (event) => {
  if (event.matches) closeMenu();
});
updateGuests(guestSelect);
