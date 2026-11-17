'use strict';
(() => {
  const dialog=document.getElementById('request-dialog');
  const frame=document.getElementById('request-form-iframe');
  const closeButton=document.getElementById('request-dialog-close');
  const fallback=document.getElementById('request-form-open');
  const status=document.getElementById('request-plan-status');
  let lastTrigger=null;
  const form=new URL('https://forms.yandex.ru/u/6af2edf32c4f89fce97e11a8/');
  const params=new URLSearchParams(location.search);
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']){
    const value=params.get(key);
    if(value&&value.length<=200)form.searchParams.set(key,value);
  }
  form.searchParams.set('request_origin','new_year');
  const packages={snegurochka:{name:'Научная Снегурочка',price:'12 000 ₽',duration:'60 минут'},lab:{name:'Морозная лаборатория',price:'29 900 ₽',duration:'120 минут'}};
  fallback.href=form.href;
  document.querySelectorAll('[data-new-year-request]').forEach(button=>button.addEventListener('click',()=>{
    lastTrigger=button;
    const chosen=packages[button.dataset.newYearRequest];
    const target=new URL(form.href);
    if(chosen){
      target.searchParams.set('plan_package',chosen.name);
      target.searchParams.set('plan_program',chosen.name);
      target.searchParams.set('plan_show',chosen.name);
      target.searchParams.set('plan_format','Новогодняя программа');
      target.searchParams.set('plan_price',chosen.price);
    }
    fallback.href=target.href;
    status.hidden=!chosen;
    status.textContent=chosen?chosen.name+' · '+chosen.duration+' · '+chosen.price:'';
    const embedded=new URL(target.href);
    embedded.searchParams.set('iframe','1');
    embedded.searchParams.set('theme','light');
    if(frame.src!==embedded.href)frame.src=embedded.href;
    dialog.showModal();
    closeButton.focus({preventScroll:true});
  }));
  const close=()=>{if(dialog.open)dialog.close();};
  closeButton.addEventListener('click',close);
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  dialog.addEventListener('close',()=>lastTrigger?.focus({preventScroll:true}));
})();

// A short local confetti entrance; no canvas, animation loop or third-party library.
(() => {
  const lab=document.querySelector('.winter-lab-card');
  if(lab){
    if('IntersectionObserver' in window){
      const observer=new IntersectionObserver(entries=>{
        if(entries.some(entry=>entry.isIntersecting)){
          lab.classList.add('is-celebrating');
          observer.disconnect();
        }
      },{threshold:.12});
      observer.observe(lab);
    }else lab.classList.add('is-celebrating');
  }
  const syncVisibility=()=>document.body.classList.toggle('winter-motion-paused',document.hidden);
  document.addEventListener('visibilitychange',syncVisibility);
  syncVisibility();
})();
