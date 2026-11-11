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
  form.searchParams.set('plan_package','Новогоднее научное шоу');
  form.searchParams.set('plan_program','Научная Снегурочка');
  form.searchParams.set('plan_show','Научная Снегурочка');
  form.searchParams.set('plan_format','Новогоднее научное шоу');
  form.searchParams.set('plan_price','Стоимость уточняется');
  fallback.href=form.href;
  document.querySelectorAll('[data-new-year-request]').forEach(button=>button.addEventListener('click',()=>{
    lastTrigger=button;
    status.hidden=false;
    status.textContent='Научная Снегурочка — новогоднее научное шоу. Подберём программу под вашу компанию.';
    const embedded=new URL(form.href);
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
