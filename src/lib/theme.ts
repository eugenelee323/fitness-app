export type ThemePreference='system'|'dark'|'light'
const key='fitness-app:theme'
export function themePreference():ThemePreference{try{const p=localStorage.getItem(key);return p==='light'||p==='system'?p:'dark'}catch{return 'dark'}}
export function applyTheme(preference:ThemePreference){
  const theme=preference==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):preference
  document.documentElement.dataset.theme=theme
  const color=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color)
  try{localStorage.setItem(key,preference)}catch{/* 裝置不允許時仍套用本次主題 */}
}
export function initTheme(){applyTheme(themePreference());window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(themePreference()==='system')applyTheme('system')})}
export function initPrimaryActions(){
  let pending=false
  const refresh=()=>{pending=false;const main=document.querySelector('#main')??document.querySelector('main');if(!main)return;const buttons=Array.from(main.querySelectorAll<HTMLElement>('.primary')).filter(el=>el.getClientRects().length>0);buttons.sort((a,b)=>Number(b.dataset.primaryPriority??0)-Number(a.dataset.primaryPriority??0));for(const button of buttons){if(button===buttons[0]){if(!button.hasAttribute('data-main-action'))button.setAttribute('data-main-action','')}else if(button.hasAttribute('data-main-action'))button.removeAttribute('data-main-action')}}
  const observer=new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(refresh)}});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','open','hidden']});refresh()
}
