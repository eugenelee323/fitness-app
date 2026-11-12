import { URL } from 'node:url'
import {readFileSync,writeFileSync} from 'node:fs'
import {Resvg} from '@resvg/resvg-js'
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8')
const bg=css.match(/--bg:(#[\da-f]+)/i)[1],text=css.match(/--text:(#[\da-f]+)/i)[1]
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><style>:root{--bg:${bg};--text:${text}}</style><rect width="512" height="512" fill="var(--bg)"/><text x="256" y="278" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="246" font-weight="500" letter-spacing="-18" fill="var(--text)">12</text></svg>`
for(const [name,size]of [['icon-192.png',192],['icon-512.png',512],['maskable-512.png',512],['apple-touch-icon.png',180]])writeFileSync(new URL('../public/icons/'+name,import.meta.url),new Resvg(svg.replaceAll('var(--bg)',bg).replaceAll('var(--text)',text),{fitTo:{mode:'width',value:size}}).render().asPng())
