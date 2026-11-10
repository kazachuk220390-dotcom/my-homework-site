'use strict';
const shows = {
 dry: { name:'Открытия с сухим льдом', price:9500, age:'от 4 лет', minutes:'60 минут', description:"Туман, \"научная каша\" и необычные свойства сухого льда — интерактивное путешествие для самых маленьких исследователей", highlights:['Ледяные облака','Повелители мыльных пузырей','Зрелищные превращения'] },
 cryo: { name:'Большое Криошоу', price:10000, age:'от 5 лет', minutes:'60 минут', description:"Ледяная магия жидкого азота, эффектные замораживания и большой научный финал, где удивляются даже искушенные зрители", highlights:['Жидкий азот','Заморозка и превращения','Научные открытия'] },
 science: { name:'Сумасшедшая наука', price:11000, age:'от 9 лет', minutes:'60 минут', description:"Для любопытных исследователей — сложные увлекательные химические и физические явления с обсуждением удивительных реакций", highlights:['Интерактив с профессором','Необычные реакции','Наука в действии'] },
 potter: { name:'Шоу в стиле Гарри Поттера', price:11000, age:'от 5 лет', minutes:'60 минут', description:"Школа чудесных открытий — наука встречается с атмосферой волшебства, а гости превращаются в юных волшебников", highlights:['Тематическая атмосфера','Секреты превращений','Вовлечение гостей'] },
 graduate: { name:'Сумасшедший выпускной', price:12000, age:'от 6 лет', minutes:'60 минут', description:"Выпускной, где целый класс участвует в опытах, делает открытия и принимает поздравления, а в завершении праздника Профессор дарит подарок каждому выпускнику", highlights:['Для целого класса','Групповой интерактив','Праздничный финал'] },
 kitchen: { name:'Сумасшедшая кухня', price:null, age:'по согласованию', minutes:'по согласованию', description:"Научная кухня, где привычные вещи открываются с неожиданной стороны — детали программы подбираем под формат праздника", highlights:['Необычный формат','Вовлечение гостей','Индивидуальные условия'] }
};
const fmt = value => new Intl.NumberFormat('ru-RU').format(value).replace(/\u00a0/g, ' ');
const el = id => document.getElementById(id);
const guestSelect = el('guest-count');
const planGuests = el('plan-guests');
const planPackage = el('plan-package');
const planShow = el('plan-show');
const showChoice = el('show-choice');
const workshops = { icecream: el('plan-workshop-icecream'), slime: el('plan-workshop-slime') };
const workshopNames = {icecream:'крио-мороженое', slime:'лизуны'};
const workshopBasePrices = {icecream:2500, slime:1500};
const selectedWorkshops = () => Object.keys(workshops).filter(code=>workshops[code].checked);
const copyButton = el('copy-plan');
const discussButton = el('discuss-plan');
const planSummary = el('plan-summary');
const copyStatus = el('copy-status');
function knownGuestCount(value) {
  const count=Number(value);
  return Number.isInteger(count)&&count>0&&count<=150?count:null;
}
function workshopPrice(code, guests) {
  const count=knownGuestCount(guests);
  if(count===null||!Object.hasOwn(workshopBasePrices,code))return null;
  return workshopBasePrices[code]+Math.ceil(Math.max(count-10,0)/5)*500;
}
function quotePlan({format,showCode,guests,chosen}) {
  const party=format==='party';
  const count=knownGuestCount(guests);
  const selection=[...new Set(party?chosen.filter(code=>code!=='icecream'):chosen)];
  const extras=selection.map(code=>({code,name:workshopNames[code],price:workshopPrice(code,guests)}));
  const extrasTotal=count===null||extras.some(workshop=>workshop.price===null)?null:extras.reduce((sum,workshop)=>sum+workshop.price,0);
  const groupSupplement=count===null?null:Math.ceil(Math.max(count-10,0)/5)*500;
  const partyBasePrice=groupSupplement===null?null:29900+groupSupplement;
  const showPrice=shows[showCode]?.price??null;
  const price=count===null||extrasTotal===null?null:party?partyBasePrice+extrasTotal:showPrice===null?null:showPrice+extrasTotal;
  const baseParty=party&&!selection.includes('slime');
  const baseShow=!party&&selection.length===0&&showPrice!==null;
  return {price,extras,extrasTotal,missing:false,baseParty,baseShow,groupSupplement,partyBasePrice,count};
}
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
  if(!planShow.options.length){
    for(const code of Object.keys(shows)){const opt=document.createElement('option');opt.value=code;opt.textContent=shows[code].name;planShow.append(opt)}
    planShow.value=showChoice.value;
  }
  const party=planPackage.value==='party';
  planShow.hidden=party;
  planShow.disabled=party;
  const label=el('plan-show-label');
  if(label)label.hidden=party;
}
function updatePlan() {
  const party=planPackage.value==='party';
  workshops.icecream.disabled=party;
  workshops.icecream.setAttribute('aria-disabled',String(party));
  if(party)workshops.icecream.checked=true;
  const icecreamOption=workshops.icecream.closest('label');
  if(icecreamOption){
    icecreamOption.classList.toggle('included-workshop',party);
    icecreamOption.hidden=party;
  }
  const workshopMode=el('plan-workshop-mode');
  if(workshopMode)workshopMode.textContent=party?'мороженое включено':'можно выбрать один или оба';
  const includedWorkshop=el('plan-included-workshop');
  if(includedWorkshop)includedWorkshop.hidden=!party;
  el('plan-workshop-wrap')?.classList.toggle('party-workshops',party);
  const chosen=selectedWorkshops();
  const show=party?{name:'Научное шоу',minutes:'60 минут',description:'60 минут интерактивных экспериментов'}:shows[planShow.value];
  if(!show)return;
  const guests=planGuests.value;
  const {price,extras,extrasTotal,missing,baseParty,baseShow,groupSupplement,count}=quotePlan({format:planPackage.value,showCode:planShow.value,guests,chosen});
  const groupLabel=planGuests.selectedOptions[0].textContent.toLowerCase();
  const unknownPrice=count===null?'По расчёту':'Цена шоу уточняется';
  el('plan-price').textContent=missing?'Выберите мастер-класс':price===null?unknownPrice:fmt(price)+' ₽';
  el('plan-price').classList.toggle('price-pending',price===null||missing);
  el('plan-price-note').textContent=count===null?'Для группы более 150 детей подготовим индивидуальное предложение':
    price!==null?'Расчёт на '+count+' детей, выезд отдельно':'Стоимость «'+show.name+'» уточняется · группа до '+count+' детей';
  for(const code of Object.keys(workshops)){
    const workshopPriceLabel=el('workshop-price-'+code);
    const amount=workshopPrice(code,guests);
    if(workshopPriceLabel)workshopPriceLabel.textContent=amount===null?'По расчёту':party&&code==='icecream'?'Включено в пакет':fmt(amount)+' ₽';
  }
  const breakdown=el('plan-price-breakdown');
  const showBreakdown=!party?(count===null?'Стоимость шоу и дополнений для группы более 150 детей — по расчёту':
    [show.price===null?'Стоимость шоу уточняется':show.name+' — '+fmt(show.price)+' ₽',...extras.map(workshop=>workshop.name+' — '+fmt(workshop.price)+' ₽')].join(' + ')):'';
  const partyBreakdown=party?(count===null?'Научное шоу и крио-мороженое включены в программу; итог для группы более 150 детей — по расчёту':
    'Научное шоу с крио-мороженым и праздничным сценарием — 29 900 ₽'+
    (groupSupplement?' + крио-мороженое для большей группы — '+fmt(groupSupplement)+' ₽':'')+
    (chosen.includes('slime')?' + лизуны — '+fmt(workshopPrice('slime',guests))+' ₽':'')):'';
  if(breakdown){
    breakdown.textContent=showBreakdown||partyBreakdown;
    breakdown.hidden=false;
  }
  el('plan-show-description').textContent=party?'Научное шоу — 60 минут интерактивных экспериментов':show.description+' · '+show.age+' · '+show.minutes;
  const hint=el('plan-workshop-hint');
  hint.textContent=party?'Крио-мороженое уже включено в пакет'+(chosen.includes('slime')?' · добавлены лизуны':' · при желании добавьте лизуны'):
    missing?'Для «Научного переполоха» отметьте минимум один мастер-класс':
    chosen.length===0?'Дополнения не выбраны, можно оставить только шоу':
    'Выбрано: '+chosen.map(code=>workshopNames[code]).join(' и ')+(extrasTotal===null?' · мастер-классы по расчёту':' · мастер-классы '+fmt(extrasTotal)+' ₽');
  hint.classList.toggle('needs-selection',missing);
  copyButton.disabled=missing;
  copyButton.setAttribute('aria-disabled',String(missing));
  if(discussButton){
    discussButton.disabled=missing;
    discussButton.setAttribute('aria-disabled',String(missing));
  }
  const lines=[
    'Сумасшедшая наука · Калининград и область',
    'Формат: '+(party?'Научный переполох':'Научное шоу'),
    'Основная программа: '+(party?'Научное шоу — 60 минут интерактивных экспериментов':show.name+' · '+show.age+' · '+show.minutes),
    'Группа: '+groupLabel,
    'Мастер-классы: '+(chosen.length?chosen.map(code=>workshopNames[code]).join(' и '):'без дополнений')
  ];
  if(!party)lines.push('Особенности: '+show.description);
  if(count!==null)lines.push('Расчёт по верхней границе группы: '+count+' детей');
  if(party){
    lines.push('Награждение, «БУМ-ТОРТ» (реквизит готовится), серебряная дискотека и перерывы');
  } else lines.push('Интерактивные эксперименты и праздничное награждение');
  if(showBreakdown||partyBreakdown)lines.push('Расчёт: '+(showBreakdown||partyBreakdown));
  lines.push('Общая продолжительность: '+(baseParty?'150 минут':baseShow?show.minutes:party?'с добавлением лизунов согласовывается отдельно':'уточняется при согласовании'));
  lines.push('Стоимость: '+(missing?'выберите мастер-класс':price===null?unknownPrice:fmt(price)+' ₽'));
  lines.push('Это план для обсуждения, не подтверждение бронирования');
  planSummary.value=lines.join('\n');
  copyStatus.textContent='';
  el('contact-plan-status')?.remove();
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
    copyStatus.textContent='Подбор скопирован — его можно сохранить или отправить при обсуждении праздника';
  }catch{
    planSummary.focus();planSummary.select();
    copyStatus.textContent='Текст выделен — скопируйте вручную';
  }
});
// Компактная заявка: выбор калькулятора передаётся в GET-параметрах формы.
// Для автоматического выбора варианта программы нужен ID вопроса из Яндекс Форм.
const yandexFormBase='https://forms.yandex.ru/u/6af2edf32c4f89fce97e11a8/';
const yandexProgramQuestionId='answer_choices_9008993561263860'; // Подтверждено владельцем в Яндекс Формах.
const yandexProgramAnswerIds={
  party:'9008993561263870',cryo:'1794306569052',dry:'1794306578311',science:'1794306586760',help:'1794306598248'
};
const requestDialog=el('request-dialog');
const requestIframe=el('request-form-iframe');
const requestLaunch=el('request-form-launch');
const requestClose=el('request-dialog-close');
let lastRequestTrigger=null;
function chosenProgramCode(){
  if(planPackage.value==='party')return 'party';
  return Object.hasOwn(yandexProgramAnswerIds,planShow.value)?planShow.value:'help';
}
function formLinkWithPlan(){
  const url=new URL(yandexFormBase);
  const sourceParams=new URLSearchParams(window.location.search);
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']){
    const val=sourceParams.get(key);
    if(val&&val.length<=200)url.searchParams.set(key,val);
  }
  const code=chosenProgramCode();
  const showName=planPackage.value==='party'?'Научный переполох':shows[planShow.value]?.name||'Подбор программы';
  const extras=selectedWorkshops().map(key=>workshopNames[key]).join(', ');
  url.searchParams.set('plan_program',showName);
  url.searchParams.set('plan_format',planPackage.value==='party'?'Праздник':'Отдельное шоу');
  url.searchParams.set('plan_workshops',extras||'Без дополнительных мастер-классов');
  url.searchParams.set('plan_group',planGuests.selectedOptions[0].textContent);
  url.searchParams.set('plan_price',el('plan-price').textContent);
  // Яндекс выбирает вариант ответа по ID вопроса и ID ответа.
  // Пока ID вопроса не предоставлен, параметры выбора доступны
  // интеграциям как GET-параметры, но видимый ответ не предзаполняется.
  if(yandexProgramQuestionId&&yandexProgramAnswerIds[code]){
    url.searchParams.set(yandexProgramQuestionId,yandexProgramAnswerIds[code]);
  }
  return url;
}
function syncRequestUrls(){
  const link=formLinkWithPlan();
  for(const node of [el('request-form-open'),el('request-form-fallback')]){
    if(node)node.href=link.href;
  }
  const embedded=new URL(link.href);
  embedded.searchParams.set('iframe','1');
  embedded.searchParams.set('theme','light');
  if(requestIframe&&requestIframe.src!==embedded.href)requestIframe.src=embedded.href;
}
function openRequestForm(trigger,fromCalculator){
  if(!requestDialog)return;
  lastRequestTrigger=trigger;
  const status=el('request-plan-status');
  if(status){
    status.hidden=!fromCalculator;
    if(fromCalculator){
      const title=planPackage.value==='party'?'Научный переполох':shows[planShow.value]?.name||'Научное шоу';
      status.textContent='Ваш подбор: '+title+' · '+el('plan-price').textContent+
        '. Программа выбрана в форме автоматически. Пожалуйста, проверьте выбор перед отправкой.';
    }
  }
  syncRequestUrls();
  if(typeof requestDialog.showModal==='function')requestDialog.showModal();
  else requestDialog.setAttribute('open','');
  requestClose?.focus({preventScroll:true});
}
function closeRequestForm(){
  if(!requestDialog)return;
  if(typeof requestDialog.close==='function'&&requestDialog.open)requestDialog.close();
  else requestDialog.removeAttribute('open');
  lastRequestTrigger?.focus({preventScroll:true});
}
discussButton?.addEventListener('click',()=>{
  if(!discussButton.disabled)openRequestForm(discussButton,true);
});
requestLaunch?.addEventListener('click',()=>openRequestForm(requestLaunch,false));
requestClose?.addEventListener('click',closeRequestForm);
requestDialog?.addEventListener('click',event=>{
  if(event.target===requestDialog)closeRequestForm();
});
requestDialog?.addEventListener('close',()=>lastRequestTrigger?.focus({preventScroll:true}));
// Прямые ссылки сохраняют рекламные метки даже до открытия окна.
for(const node of [el('request-form-open'),el('request-form-fallback')]){
  if(node)node.href=formLinkWithPlan().href;
}
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


// v0.8: mobile visitor control, including opt-in when the phone requests reduced motion
const motionToggle = document.getElementById('mobile-motion-toggle');
if(motionToggle){
  const reducedMotionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
  let manuallyChosen=false;
  let motionOn=!reducedMotionQuery.matches;
  function renderMotionSetting(){
    const root=document.documentElement;
    root.classList.toggle('motion-off',!motionOn);
    root.classList.toggle('motion-override',motionOn && reducedMotionQuery.matches && manuallyChosen);
    motionToggle.setAttribute('aria-pressed',String(motionOn));
    motionToggle.setAttribute('aria-label',motionOn?'Выключить анимацию научных эффектов':'Включить анимацию научных эффектов');
    const label=motionToggle.querySelector('.motion-label');
    if(label)label.textContent=motionOn?'Эффекты: включены':'Эффекты: выключены';
  }
  renderMotionSetting();
  motionToggle.addEventListener('click',()=>{
    manuallyChosen=true;
    motionOn=!motionOn;
    renderMotionSetting();
  });
  reducedMotionQuery.addEventListener?.('change',()=>{
    if(!manuallyChosen)motionOn=!reducedMotionQuery.matches;
    renderMotionSetting();
  });
}


// v0.9 — each review opens independently; Escape, close button and backdrop close dialog
document.querySelectorAll('[data-review-open]').forEach(button=>{
  const dialog=document.getElementById('review-dialog-'+button.dataset.reviewOpen);
  if(!dialog)return;
  const closeButton=dialog.querySelector('.review-dialog-close');
  const close=()=>{
    if(typeof dialog.close==='function' && dialog.open)dialog.close();
    else dialog.removeAttribute('open');
    button.focus({preventScroll:true});
  };
  button.addEventListener('click',()=>{
    if(typeof dialog.showModal==='function')dialog.showModal();
    else dialog.setAttribute('open','');
    closeButton?.focus({preventScroll:true});
  });
  closeButton?.addEventListener('click',close);
  dialog.addEventListener('click',event=>{if(event.target===dialog)close()});
  dialog.addEventListener('close',()=>button.focus({preventScroll:true}));
});
