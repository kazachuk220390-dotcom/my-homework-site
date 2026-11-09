'use strict';
const shows = {
 dry: { name:'Открытия с сухим льдом', price:9500, age:'от 4 лет', minutes:'60 минут', description:'Туман, невесомые облака и необычные свойства сухого льда — интерактивное путешествие по удивительной лаборатории', highlights:['Ледяные облака','Повелители мыльных пузырей','Зрелищные превращения'] },
 cryo: { name:'Большое Криошоу', price:10000, age:'от 5 лет', minutes:'60 минут', description:'Ледяная магия жидкого азота, эффектные превращения и большой научный финал, где именинник становится главным помощником профессора', highlights:['Жидкий азот','Заморозка и превращения','Научные открытия'] },
 science: { name:'Сумасшедшая наука', price:11000, age:'от 9 лет', minutes:'60 минут', description:'Для любопытных исследователей — увлекательные физические и химические демонстрации с обсуждением удивительных явлений', highlights:['Интерактив с профессором','Необычные реакции','Наука в действии'] },
 potter: { name:'Шоу в стиле Гарри Поттера', price:11000, age:'от 5 лет', minutes:'60 минут', description:'Школа чудесных открытий — наука встречается с атмосферой волшебства, а гости превращаются в юных исследователей', highlights:['Тематическая атмосфера','Секреты превращений','Вовлечение гостей'] },
 halloween: { name:'Научный Хеллоуин', price:11000, age:'от 5 лет', minutes:'60 минут', description:'Таинственная лаборатория с необычной атмосферой, неожиданными эффектами и зрелищными научными загадками', highlights:['Тематический сценарий','Эффектные демонстрации','Научные загадки'] },
 graduate: { name:'Сумасшедший выпускной', price:12000, age:'от 6 лет', minutes:'60 минут', description:'Выпускной, где целый класс участвует в опытах, делает открытия и получает праздничное награждение', highlights:['Для целого класса','Групповой интерактив','Праздничный финал'] },
 snow: { name:'Научная Снегурочка', price:12000, age:'от 5 лет', minutes:'60 минут', description:'Зимние чудеса и научные открытия в новогодней атмосфере — с праздничными опытами и участием ребят', highlights:['Зимние эффекты','Научные сюрпризы','Новогоднее настроение'] },
 kitchen: { name:'Сумасшедшая кухня', price:null, age:'по согласованию', minutes:'по согласованию', description:'Научная кухня, где привычные вещи открываются с неожиданной стороны — детали программы подбираем под формат праздника', highlights:['Необычный формат','Вовлечение гостей','Индивидуальные условия'] }
};
const partyShows = ['cryo','dry','science','graduate'];
const fmt = value => new Intl.NumberFormat('ru-RU').format(value).replace(/\u00a0/g, ' ');
const el = id => document.getElementById(id);
const guestSelect = el('guest-count');
const planGuests = el('plan-guests');
const planPackage = el('plan-package');
const planShow = el('plan-show');
const showChoice = el('show-choice');
const workshops = { icecream: el('plan-workshop-icecream'), slime: el('plan-workshop-slime') };
const workshopNames = {icecream:'крио-мороженое', slime:'лизуны'};
const selectedWorkshops = () => Object.keys(workshops).filter(code=>workshops[code].checked);
const copyButton = el('copy-plan');
const planSummary = el('plan-summary');
const copyStatus = el('copy-status');
function displayShowInfo(code) {
  const show = shows[code];
  el('show-choice-description').textContent = show.description;
  el('show-choice-meta').textContent = show.age + ' · ' + show.minutes;
  const list=el('show-choice-highlights');
  list.replaceChildren();
  for(const text of show.highlights){const li=document.createElement('li');li.textContent=text;list.append(li)}
  const priceEl=document.querySelector('[data-price="show"]');
  priceEl.textContent=show.price===null?'по запросу':fmt(show.price);
  priceEl.closest('.price').classList.toggle('price-custom',show.price===null);
}
function setShowOptions() {
  const old=planShow.value;
  const codes=planPackage.value==='party'?partyShows:Object.keys(shows);
  planShow.replaceChildren();
  for(const code of codes){const opt=document.createElement('option');opt.value=code;opt.textContent=shows[code].name;planShow.append(opt)}
  planShow.value=codes.includes(old)?old:(planPackage.value==='party'?'cryo':showChoice.value);
}
function updatePlan() {
  const party=planPackage.value==='party';
  const chosen=selectedWorkshops();
  const show=shows[planShow.value];
  if(!show)return;
  const guests=Number(planGuests.value);
  const oneIceCream=chosen.length===1&&chosen[0]==='icecream';
  const baseParty=party&&guests===10&&planShow.value==='cryo'&&oneIceCream;
  const baseShow=!party&&chosen.length===0&&show.price!==null;
  const missing=party&&chosen.length===0;
  const price=baseParty?29900:baseShow?show.price:null;
  el('plan-price').textContent=missing?'Выберите мастер-класс':price===null?'По расчёту':fmt(price)+' ₽';
  el('plan-price-note').textContent=missing?'Нужен хотя бы один мастер-класс':price!==null?'Для Калининграда, выезд отдельно':'Согласуем стоимость и продолжительность';
  el('plan-show-description').textContent=show.description+' · '+show.age+' · '+show.minutes;
  const hint=el('plan-workshop-hint');
  hint.textContent=missing?'Для «Научного переполоха» отметьте минимум один мастер-класс':
    chosen.length===0?'Дополнения не выбраны, можно оставить только шоу':
    'Выбрано: '+chosen.map(code=>workshopNames[code]).join(' и ')+' · итоговые условия уточняем при согласовании';
  hint.classList.toggle('needs-selection',missing);
  copyButton.disabled=missing;
  copyButton.setAttribute('aria-disabled',String(missing));
  document.querySelector('[data-price="party"]').textContent=Number(guestSelect.value)===10?'29 900':'по расчёту';
  document.querySelector('[data-price-caption]').textContent=Number(guestSelect.value)===10?'До 10 детей · Большое Криошоу + крио-мороженое':'Для больших групп — индивидуальный расчёт';
  const groupLabel=planGuests.selectedOptions[0].textContent.toLowerCase();
  const lines=[
    'Сумасшедшая наука · Калининград и область',
    'Формат: '+(party?'Научный переполох':'Научное шоу'),
    'Основная программа: '+show.name+' · '+show.age+' · '+show.minutes,
    'Особенности: '+show.description,
    'Группа: '+groupLabel,
    'Мастер-классы: '+(chosen.length?chosen.map(code=>workshopNames[code]).join(' и '):'без дополнений')
  ];
  if(party){
    lines.push('Награждение, «БУМ-ТОРТ» (реквизит готовится), серебряная дискотека и перерывы');
  } else lines.push('Интерактивные эксперименты и праздничное награждение');
  lines.push('Общая продолжительность: '+(baseParty?'150 минут':baseShow?show.minutes:'уточняется при согласовании'));
  lines.push('Стоимость: '+(missing?'выберите мастер-класс':price===null?'индивидуальный расчёт':fmt(price)+' ₽'));
  lines.push('Это план для обсуждения, не подтверждение бронирования');
  planSummary.value=lines.join('\n');
  copyStatus.textContent='';
}
function refresh(){setShowOptions();displayShowInfo(showChoice.value);updatePlan()}
function syncGuests(source){guestSelect.value=source.value;planGuests.value=source.value;updatePlan()}
function changePackage(code){
  if(code==='show'){workshops.icecream.checked=false;workshops.slime.checked=false}
  if(code==='party'&&!selectedWorkshops().length){workshops.icecream.checked=true}
  planPackage.value=code;
  refresh();
}
guestSelect.addEventListener('change',()=>syncGuests(guestSelect));
planGuests.addEventListener('change',()=>syncGuests(planGuests));
planPackage.addEventListener('change',()=>changePackage(planPackage.value));
planShow.addEventListener('change',updatePlan);
Object.values(workshops).forEach(node=>node.addEventListener('change',updatePlan));
showChoice.addEventListener('change',()=>{
  displayShowInfo(showChoice.value);
  if(planPackage.value==='show'){planShow.value=showChoice.value;updatePlan()}
});
document.querySelectorAll('[data-select-package]').forEach(link=>link.addEventListener('click',()=>{
  changePackage(link.dataset.selectPackage);
  if(link.dataset.selectPackage==='show'){planShow.value=showChoice.value;updatePlan()}
}));
copyButton.addEventListener('click',async()=>{
  if(copyButton.disabled)return;
  try{
    if(!navigator.clipboard?.writeText)throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(planSummary.value);
    copyStatus.textContent='План скопирован, заявка не отправлена';
  }catch{
    planSummary.focus();planSummary.select();
    copyStatus.textContent='Текст выделен — скопируйте вручную';
  }
});
const menuButton=document.querySelector('.menu-toggle');
const mobileNav=el('mobile-nav');
function closeMenu(){
  menuButton.setAttribute('aria-expanded','false');
  menuButton.setAttribute('aria-label','Открыть меню');
  mobileNav.hidden=true;
}
menuButton.addEventListener('click',()=>{
  const opened=menuButton.getAttribute('aria-expanded')!=='true';
  menuButton.setAttribute('aria-expanded',String(opened));
  menuButton.setAttribute('aria-label',opened?'Закрыть меню':'Открыть меню');
  mobileNav.hidden=!opened;
});
mobileNav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!mobileNav.hidden){closeMenu();menuButton.focus()}});
window.matchMedia('(min-width: 901px)').addEventListener('change',event=>{if(event.matches)closeMenu()});
refresh();