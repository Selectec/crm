// Native notification links/router remain real; only external notification data is supplied.
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { Button, FeatherIcon } from 'frappe-ui'
import Notifications from '@/components/Notifications.vue'
import translationPlugin from '@/translation'

const fixture = vi.hoisted(() => ({ rows:[] }))
vi.mock('@/stores/notifications', async () => {
  const {ref,computed} = await import('vue')
  return {visible:ref(true),notifications:{get data(){return fixture.rows},reload(){}},notificationsStore:()=>({mark_as_read:{reload(){}},mark_doc_as_read(){},toggle(){}})}
})
vi.mock('@/stores/global',()=>({globalStore:()=>({$socket:{on(){},off(){}}})}))
vi.mock('@/stores/users',()=>({usersStore:()=>({getUser:()=>({name:'native-author@example.test',full_name:'Native author'})})}))
vi.mock('frappe-ui/frappe',()=>({useTelemetry:()=>({capture(){}})}))
window.sysdefaults = {...window.sysdefaults,date_format:'yyyy-mm-dd',time_format:'HH:mm:ss'}
let app,element
afterEach(()=>{app?.unmount();element?.remove();fixture.rows=[];document.body.innerHTML=''})

async function render(rows){
  fixture.rows=rows
  const router=createRouter({history:createMemoryHistory(),routes:[
    {path:'/',name:'Home',component:{render:()=>null}},
    {path:'/organizations/:organizationId',name:'Organization',component:{render:()=>null}},
    {path:'/contacts/:contactId',name:'Contact',component:{render:()=>null}},
    {path:'/leads/:leadId',name:'Lead',component:{render:()=>null}},
    {path:'/deals/:dealId',name:'Deal',component:{render:()=>null}},
  ]})
  await router.push('/');await router.isReady()
  element=document.createElement('div');document.body.append(element)
  app=createApp({render:()=>h(Notifications)})
  app.use(createPinia());app.use(router);app.use(translationPlugin)
  app.component('Button',Button);app.component('FeatherIcon',FeatherIcon)
  app.mount(element);await nextTick()
}
const row=(route_name,name,params)=>({creation:'2026-10-02 12:00:00.000001',from_user:{name:'native-author@example.test',full_name:'Native author'},type:'Mention',read:false,notification_type_doctype:'Comment',notification_type_doc:`Native remark ${route_name}`,reference_name:name,route_name,hash:'#native-remark',...(params?{route_params:params}:{})})

it('native notification links honor explicit typed route parameters while stock sales defaults remain', async()=>{
  await render([
    row('Organization','Native organisation',{organizationId:'Native organisation'}),
    row('Contact','Native contact',{contactId:'Native contact'}),
    row('Lead','Native lead'),row('Deal','Native deal'),
  ])
  const links=[...element.querySelectorAll('a')]
  expect(links.map(link=>link.getAttribute('href'))).toEqual([
    '/organizations/Native%20organisation#native-remark','/contacts/Native%20contact#native-remark',
    '/leads/Native%20lead#native-remark','/deals/Native%20deal#native-remark',
  ])
})

it('ordinary native Lead and Deal notification routes retain their existing identity', async()=>{
  await render([row('Lead','Native lead'),row('Deal','Native deal')])
  expect([...element.querySelectorAll('a')].map(link=>link.getAttribute('href'))).toEqual(['/leads/Native%20lead#native-remark','/deals/Native%20deal#native-remark'])
})
