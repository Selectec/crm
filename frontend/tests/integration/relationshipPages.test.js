import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, reactive, nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { Button, Dialog, ErrorMessage, Badge, FormControl } from 'frappe-ui'
import Organization from '@/pages/Organization.vue'
import Contact from '@/pages/Contact.vue'
import translationPlugin from '@/translation'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import DeleteLinkedDocModal from '@/components/DeleteLinkedDocModal.vue'
import DoctypeModals from '@/components/Modals/DoctypeModals.vue'
import { useDoctypeModal } from '@/composables/doctypeModal'

const fixture = vi.hoisted(() => ({ enabled: true, documents: new Map(), requests: [] }))
vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return { useDocument(doctype, name) {
    const key = `${doctype}:${name || ''}`
    if (!fixture.documents.has(key)) fixture.documents.set(key, reactive({
      doc: name ? { doctype, name, organization_name: name, full_name: name } : {},
      setValue: { submit() {} }, save: { submit() {} }, actions: [], fieldPropertyOverrides: {},
    }))
    return {
      document: fixture.documents.get(key),
      permissions: { data: { permissions: { delete: false } } },
      scripts: { data: fixture.enabled && ['CRM Organization', 'Contact'].includes(doctype) ? [{ script: `
        function setupForm({relationshipUI}) {
          const {h, showModal} = relationshipUI;
          return {relationshipActivity: {version:1, initialTab:'Activity',
            tabs: [{name:'Activity',label:'Activity'},{name:'Notes',label:'Notes'}],
            component: {props:['doctype','docname','method'], setup(p) {
              return () => h('div', [h('span', p.doctype + ':' + p.docname + ':' + p.method),
                p.method === 'Notes' ? h('button',{onClick:()=>showModal({doctype:'FCRM Note',title:'Note',defaults:{reference_doctype:p.doctype,reference_docname:p.docname}})},'New Note') : null]);
            }} }};
        }
      ` }] : [] },
      triggerOnRender: async () => {}, triggerOnBeforeCreate: async () => {},
    }
  } }
})
vi.mock('frappe-ui', async (original) => {
  const actual = await original()
  const { reactive } = await import('vue')
  return { ...actual, usePageMeta() {}, createListResource() { return reactive({data: []}) },
    createResource(options) {
      fixture.requests.push(options.url)
      let data = []
      if (options.url.includes('get_sidepanel_sections')) data = []
      if (options.url.includes('get_fields_layout')) data = [{name:'main',label:'',sections:[{name:'note',label:'',columns:[{name:'one',fields:[{fieldname:'title',fieldtype:'Data',label:'Title',visible:true}]}]}]}]
      return reactive({data, reload() {}, submit: async () => {}, loading:false})
    },
  }
})
vi.mock('@/stores/settings', () => ({ getSettings: () => ({brand: {}}) }))
vi.mock('@/stores/global', () => ({ globalStore: () => ({$socket:{on(){},off(){},emit(){}},$dialog(){},makeCall(){}}) }))
vi.mock('@/stores/users', () => ({ usersStore: () => ({isManager:()=>false,getUser:()=>({full_name:'Staff'})}) }))
vi.mock('@/stores/statuses', () => ({ statusesStore: () => ({getDealStatus:()=>({})}) }))
vi.mock('@/stores/organizations', () => ({ organizationsStore: () => ({getOrganization:()=>({})}) }))
vi.mock('@/stores/meta', () => ({ getMeta: () => ({doctypeMeta: {value:{}},getFields:()=>[],getField:()=>({}),getMeta:()=>({})}) }))
vi.mock('@/utils/view', () => ({ getView: () => null }))
vi.mock('@/composables/whatsapp', () => ({whatsappEnabled:{value:false}}))
vi.mock('@/composables/telephony', () => ({callEnabled:{value:false}}))
vi.mock('@/composables/useContactFields', () => ({useContactFields:()=>section=>section}))
vi.mock('@/composables/useTimelinePreferences', () => ({timestampCell:value=>value,useTimelinePreferences:()=>({isNewestFirst:{value:false}})}))
vi.mock('frappe-ui/frappe', () => ({useTelemetry:()=>({capture(){}}),useOnboarding:()=>({updateOnboardingStep(){}})}))
vi.mock('@/components/SidePanelLayout.vue', () => ({default:{render:()=>h('aside','Record information')}}))
vi.mock('@/components/Resizer.vue', () => ({default:{render(){return h('div',this.$slots.default?.())}}}))
vi.mock('@/components/LayoutHeader.vue', () => ({default:{render(){return h('header',[this.$slots['left-header']?.(),this.$slots['right-header']?.()])}}}))
vi.mock('@/components/ListViews/DealsListView.vue', () => ({default:{render:()=>null}}))
vi.mock('@/components/ListViews/ContactsListView.vue', () => ({default:{render:()=>null}}))
vi.mock('@/components/DeleteLinkedDocModal.vue', () => ({default:{render:()=>null}}))
vi.mock('@/components/CustomActions.vue', () => ({default:{render:()=>null}}))


let app, element
async function settle() { for(let i=0;i<8;i++) { await nextTick(); await new Promise(resolve=>setTimeout(resolve,0)) } }
afterEach(()=>{app?.unmount();element?.remove();document.body.innerHTML='';fixture.documents.clear();useDoctypeModal().show.value=false})
async function open(Page, props) {
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',name:'Test',component:{render:()=>null}},{path:'/organizations',name:'Organizations',component:{render:()=>null}},{path:'/contacts',name:'Contacts',component:{render:()=>null}},{path:'/organizations/:organizationId',name:'Organization',component:{render:()=>null}},{path:'/contacts/:contactId',name:'Contact',component:{render:()=>null}}]})
  await router.push('/');await router.isReady()
  element=document.createElement('div');document.body.append(element)
  app=createApp({render:()=>h('div',[h(Page,props),h(DoctypeModals)])})
  app.use(router)
  app.use(translationPlugin)
  for(const [name, component] of Object.entries({Button,Dialog,ErrorMessage,Badge,FormControl,EmptyState,DeleteLinkedDocModal})) app.component(name,component)
  app.mount(element);await settle()
}

describe('existing native relationship pages',()=>{
  for(const [label,Page,props,context,related] of [
    ['Organization',Organization,{organizationId:'Same Name'},'CRM Organization',['Deals','Contacts']],
    ['Contact',Contact,{contactId:'Same Name'},'Contact',['Deals']],
  ]) it(`${label} embeds contributed methods in its native tab row and opens the native note editor`,async()=>{
    fixture.enabled=true
    await open(Page,props)
    const tabs=[...element.querySelectorAll('[role="tab"]')]
    expect(tabs.map(tab=>tab.textContent.trim().replace(/\s*\d+$/, ''))).toEqual(['Activity','Notes',...related])
    expect(element.querySelectorAll('[role="tablist"]')).toHaveLength(1)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(element.textContent).toContain('Record information')
    // Native Reka Tabs activates on mousedown or Enter/Space, not synthetic click.
    tabs[1].dispatchEvent(label === 'Organization'
      ? new MouseEvent('mousedown', {button:0,ctrlKey:false,bubbles:true})
      : new KeyboardEvent('keydown', {key:'Enter',bubbles:true}))
    await settle()
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(element.textContent).toContain(context+':Same Name:Notes')
    const create=[...element.querySelectorAll('button')].find(button=>button.textContent==='New Note')
    create.click();await settle()
    expect(document.body.textContent).toContain('Create Note')
    expect(document.body.textContent).toContain('Title')
    expect(useDoctypeModal().defaults.value).toEqual({reference_doctype:context,reference_docname:'Same Name'})
  })
  it('keeps the existing tab layout when no activity contribution is installed',async()=>{
    fixture.enabled=false;await open(Organization,{organizationId:'Unmanaged'})
    expect([...element.querySelectorAll('[role="tab"]')].map(tab=>tab.textContent.trim().replace(/\s*\d+$/, ''))).toEqual(['Deals','Contacts'])
  })
})

