'use strict';
// Shared header behaviour for the main page and programme pages.
(() => {
  const menuButton=document.querySelector('.menu-toggle');
  const mobileNav=document.getElementById('mobile-nav');
  if(menuButton&&mobileNav){
    const closeMenu=()=>{
      menuButton.setAttribute('aria-expanded','false');
      menuButton.setAttribute('aria-label','Открыть меню');
      mobileNav.hidden=true;
    };
    menuButton.addEventListener('click',()=>{
      const opened=menuButton.getAttribute('aria-expanded')!=='true';
      menuButton.setAttribute('aria-expanded',String(opened));
      menuButton.setAttribute('aria-label',opened?'Закрыть меню':'Открыть меню');
      mobileNav.hidden=!opened;
    });
    mobileNav.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMenu));
    document.querySelector('.site-header .brand-logo')?.addEventListener('click',closeMenu);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!mobileNav.hidden){closeMenu();menuButton.focus();}
    });
    window.matchMedia('(min-width:901px)').addEventListener('change',event=>{if(event.matches)closeMenu();});
  }
  const params=new URLSearchParams(location.search);
  document.querySelectorAll('a[data-preserve-campaign]').forEach(link=>{
    const destination=new URL(link.getAttribute('href'),location.href);
    for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']){
      const value=params.get(key);
      if(value&&value.length<=200)destination.searchParams.set(key,value);
    }
    link.href=destination.pathname+destination.search+destination.hash;
  });
})();
