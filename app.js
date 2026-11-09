'use strict';

const shows = {
  dry: { name: 'Открытия с сухим льдом', price: 9500, age: '4+' },
  cryo: { name: 'Большое Криошоу', price: 10000, age: '5+' },
  science: { name: 'Сумасшедшая наука', price: 11000, age: '9+' },
  potter: { name: 'Шоу в стиле Гарри Поттера', price: 11000, age: '5+' },
  halloween: { name: 'Научный Хеллоуин', price: 11000, age: '5+' },
  graduate: { name: 'Сумасшедший выпускной', price: 12000, age: '6+' },
  snow: { name: 'Научная Снегурочка', price: 12000, age: '5+' },
  kitchen: { name: 'Сумасшедшая кухня', price: null, age: 'по согласованию' }
};
const partyShows = ['cryo','dry','science','graduate'];
const formatMoney = value => new Intl.NumberFormat('ru-RU').format(value).replace(/\u00a0/g, ' ');
const guestSelect = document.querySelector('#guest-count');
const planGuests = document.querySelector('#plan-guests');
const planPackage = document.querySelector('#plan-package');
const planShow = document.querySelector('#plan-show');
const showChoice = document.querySelector('#show-choice');
const workshops = {
  icecream: document.querySelector('#plan-workshop-icecream'),
  slime: document.querySelector('#plan-workshop-slime')
};
const selectedWorkshops = () => Object.entries(workshops).filter(([, control]) => control.checked).map(([code]) => code);
const workshopNames = { icecream: 'крио-мороженое', slime: 'лизуны' };
const copyButton = document.querySelector('#copy-plan');
const planSummary = document.querySelector('#plan-summary');
const copyStatus = document.querySelector('#copy-status');

function setShowOptions() {
  const selected = planShow.value;
  const codes = planPackage.value === 'party' ? partyShows : Object.keys(shows);
  planShow.replaceChildren();
  codes.forEach(code => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = shows[code].name;
    planShow.append(option);
  });
  if (codes.includes(selected)) planShow.value = selected;
  else planShow.value = planPackage.value === 'party' ? 'cryo' : showChoice.value;
  document.querySelector('#plan-workshop-wrap').hidden = planPackage.value !== 'party';
}
function updatePlan() {
  const party = planPackage.value === 'party';
  const show = shows[planShow.value];
  const guests = Number(planGuests.value);
  const extras = selectedWorkshops();
  const twoExtras = extras.length === 2;
  const missingExtras = party && extras.length === 0;
  const exact = party ? (planShow.value === 'cryo' && extras.length === 1 && extras[0] === 'icecream' && guests === 10) : show.price !== null;
  const price = exact ? (party ? 29900 : show.price) : null;
  document.querySelector('#plan-price').textContent = price === null ? 'По расчёту' : formatMoney(price) + ' ₽';
  document.querySelector('#plan-price-note').textContent = missingExtras ? 'Выберите мастер-класс' : twoExtras ? 'Две программы · цена и время по расчёту' : exact ? 'Для Калининграда; выезд за город отдельно' : 'Окончательная цена уточняется';
  const hint = document.querySelector('#plan-workshop-hint');
  hint.textContent = missingExtras ? 'Для «Научного переполоха» выберите хотя бы один мастер-класс' : twoExtras ? 'Выбраны обе программы! Уточним стоимость и продолжительность при согласовании праздника' : 'Можно добавить второй мастер-класс — стоимость и время пересчитаем по запросу';
  hint.classList.toggle('needs-selection', missingExtras);
  copyButton.disabled = missingExtras;
  copyButton.setAttribute('aria-disabled', String(missingExtras));
  document.querySelector('[data-price="party"]').textContent = guests === 10 ? '29 900' : 'по расчёту';
  document.querySelector('[data-price-caption]').textContent = guests === 10 ? 'До 10 детей · Криошоу + крио-мороженое' : 'Для групп свыше 10 детей — индивидуально';
  const groupLabel = planGuests.selectedOptions[0].textContent.toLowerCase();
  const result = [
    'Сумасшедшая наука · Калининград и область',
    'Пакет: ' + (party ? 'Научный переполох' : 'Научное шоу'),
    'Программа: ' + show.name + ' · 60 минут · возраст ' + show.age,
    'Группа: ' + groupLabel
  ];
  if (party) {
    result.push(extras.length ? (twoExtras ? 'Мастер-классы: ' : 'Мастер-класс: ') + extras.map(code => workshopNames[code]).join(' и ') + (twoExtras ? ' · время по согласованию' : ' · 20 минут') : 'Мастер-класс ещё не выбран');
    result.push('Награждение; номер «БУМ-ТОРТ» (готовится); серебряная дискотека 30 минут; три перерыва по 10 минут');
    result.push('Общая продолжительность: ' + (twoExtras || missingExtras ? 'уточняется при согласовании' : '150 минут'));
  } else result.push('Награждение именинника или класса; длительность: 60 минут');
  result.push('Цена: ' + (price === null ? 'рассчитывается индивидуально' : formatMoney(price) + ' ₽') + '. Выезд за город по согласованию.');
  if (party) result.push('Возможность исполнения нового фирменного номера необходимо подтвердить у организатора.');
  result.push('Это план для обсуждения, не бронирование.');
  planSummary.value = result.join('\n');
  copyStatus.textContent = '';
}
function refresh() {
  setShowOptions();
  updatePlan();
}
function updateGuests(source) {
  guestSelect.value = source.value;
  planGuests.value = source.value;
  updatePlan();
}
guestSelect.addEventListener('change',()=>updateGuests(guestSelect));
planGuests.addEventListener('change',()=>updateGuests(planGuests));
planPackage.addEventListener('change',refresh);
planShow.addEventListener('change',updatePlan);
Object.values(workshops).forEach(control => control.addEventListener('change', updatePlan));
showChoice.addEventListener('change',()=>{
  const show=shows[showChoice.value];
  const priceEl=document.querySelector('[data-price="show"]');
  priceEl.textContent=show.price === null ? 'по запросу' : formatMoney(show.price);
  priceEl.closest('.price').classList.toggle('price-custom',show.price === null);
  document.querySelector('#show-choice-description').textContent=show.name + ' · возраст ' + show.age + ' · 60 минут.';
  if(planPackage.value==='show'){planShow.value=showChoice.value;updatePlan();}
});
document.querySelectorAll('[data-select-package]').forEach(link => {
  link.addEventListener('click',()=>{
    planPackage.value=link.dataset.selectPackage;
    refresh();
  });
});
document.querySelector('#copy-plan').addEventListener('click',async()=>{
  try {
    if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(planSummary.value);
    copyStatus.textContent='План скопирован. Заявка не отправлена.';
  } catch {
    planSummary.focus();planSummary.select();
    copyStatus.textContent='Текст выделен — скопируйте его вручную.';
  }
});
const menuButton=document.querySelector('.menu-toggle');
const mobileNav=document.querySelector('#mobile-nav');
function closeMenu(){
  menuButton.setAttribute('aria-expanded','false');
  menuButton.setAttribute('aria-label','Открыть меню');
  mobileNav.hidden=true;
}
menuButton.addEventListener('click',()=>{
  const expanded=menuButton.getAttribute('aria-expanded')!=='true';
  menuButton.setAttribute('aria-expanded',String(expanded));
  menuButton.setAttribute('aria-label',expanded?'Закрыть меню':'Открыть меню');
  mobileNav.hidden=!expanded;
});
mobileNav.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!mobileNav.hidden){closeMenu();menuButton.focus();}
});
window.matchMedia('(min-width: 901px)').addEventListener('change',event=>{
  if(event.matches)closeMenu();
});
refresh();
