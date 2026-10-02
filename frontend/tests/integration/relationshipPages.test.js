import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, reactive, nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { Button, Dialog, ErrorMessage, Badge, FormControl } from 'frappe-ui'
import Organization from '@/pages/Organization.vue'
import Contact from '@/pages/Contact.vue'
import MobileOrganization from '@/pages/MobileOrganization.vue'
import MobileContact from '@/pages/MobileContact.vue'
import translationPlugin from '@/translation'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import DeleteLinkedDocModal from '@/components/DeleteLinkedDocModal.vue'
import Activities from '@/components/Activities/Activities.vue'
import NoteArea from '@/components/Activities/NoteArea.vue'
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
      if (options.url.includes('get_fields_layout')) data = [{name:'main',label:'',sections:[{name:'note',label:'',columns:[{name:'one',fields:[{fieldname:'title',fieldtype:'Data',label:'Title',visible:true},{fieldname:'content',fieldtype:'Text Editor',label:'Content',visible:true}]}]}]}]
      return reactive({data, reload() {}, submit: async () => {}, loading:false})
    },
  }
})
vi.mock('@/stores/settings', async () => {
  const { reactive, ref } = await import('vue')
  const settings = { brand: reactive({}), settings: ref({}), _settings: reactive({doc:{}}) }
  return { getSettings: () => settings }
})
vi.mock('@/stores/global', () => ({ globalStore: () => ({$socket:{on(){},off(){},emit(){}},$dialog(){},makeCall(){}}) }))
vi.mock('@/stores/users', () => ({ usersStore: () => ({isManager:()=>false,getUser:()=>({full_name:'Staff'})}) }))
vi.mock('@/stores/statuses', () => ({ statusesStore: () => ({getDealStatus:()=>({})}) }))
vi.mock('@/stores/organizations', () => ({ organizationsStore: () => ({getOrganization:()=>({})}) }))
vi.mock('@/stores/meta', () => ({ getMeta: () => ({doctypeMeta: {value:{}},getFields:()=>[],getField:()=>({}),getMeta:()=>({})}) }))
vi.mock('@/utils/view', () => ({ getView: () => null }))
vi.mock('@/composables/whatsapp', async () => ({whatsappEnabled:(await import('vue')).ref(false)}))
vi.mock('@/composables/telephony', () => ({callEnabled:{value:false}}))
vi.mock('@/composables/useContactFields', () => ({useContactFields:()=>section=>section}))
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
    ['Mobile Organization',MobileOrganization,{organizationId:'Same Name'},'CRM Organization',['Record information','Deals','Contacts']],
    ['Mobile Contact',MobileContact,{contactId:'Same Name'},'Contact',['Record information','Deals']],
  ]) it(`${label} embeds contributed methods in its native tab row and opens the native note editor`,async()=>{
    fixture.enabled=true
    await open(Page,props)
    const tabs=[...element.querySelectorAll('[role="tab"]')]
    expect(tabs.map(tab=>tab.getAttribute('aria-label') || tab.textContent.trim().replace(/\s*\d+$/, ''))).toEqual(['Activity','Notes',...related])
    expect(element.querySelectorAll('[role="tablist"]')).toHaveLength(1)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    if (!label.startsWith('Mobile')) expect(element.textContent).toContain('Record information')
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
    if (label.startsWith('Mobile')) {
      useDoctypeModal().show.value = false
      tabs[2].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))
      await settle()
      expect(element.textContent).toContain('Record information')
    }
  })
  it('keeps the existing tab layout when no activity contribution is installed',async()=>{
    fixture.enabled=false;await open(Organization,{organizationId:'Unmanaged'})
    expect([...element.querySelectorAll('[role="tab"]')].map(tab=>tab.textContent.trim().replace(/\s*\d+$/, ''))).toEqual(['Deals','Contacts'])
  })
})


// Native rendering remains unchanged; the application owns authorised typed reads.
describe('native relationship activity resource', () => {
  it('distinguishes a failed source load from an empty native history and supports retry', async () => {
    const router = createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>null}}]})
    await router.push('/'); await router.isReady()
    const resource = reactive({data:null,loading:false,error:new Error('Relationship history unavailable'),reload:vi.fn()})
    fixture.requests = []
    element = document.createElement('div'); document.body.append(element)
    app = createApp({render:()=>h(Activities,{doctype:'Contact',docname:'Same Name',tabs:[{name:'Notes'}],adapter:{resource,doc:{name:'Same Name'},actions:{}}},{header:()=>null})})
    app.use(router); app.use(translationPlugin)
    for (const [name,component] of Object.entries({Button,ErrorMessage,Badge})) app.component(name,component)
    app.mount(element); await settle()
    expect(element.textContent).toContain('Relationship history unavailable')
    expect(element.textContent).not.toContain('No Notes Found')
    expect(fixture.requests).not.toContain('crm.api.activities.get_activities')
    const retry = [...element.querySelectorAll('button')].find(button=>button.textContent==='Retry')
    retry.click(); expect(resource.reload).toHaveBeenCalledOnce()
  })
})

describe('native source permission capabilities', () => {
  it('hides native note deletion when unavailable while preserving the default action', async () => {
    const props = reactive({
      note:{name:'Shared Note',title:'Shared title',content:'<p>Complete shared note content</p>',owner:'Staff',modified:'2026-10-02 10:00:00'},
      canDelete:false,
    })
    await open({render:()=>h(NoteArea,props)}, {})
    expect(element.textContent).toContain('Shared title')
    expect(element.textContent).toContain('Complete shared note content')
    expect(element.querySelector('button')).toBeNull()
    delete props.canDelete
    await settle()
    expect(element.querySelector('button')).not.toBeNull()
  })
  it('opens a complete note read-only and resets to the existing editable default on the next launch', async () => {
    fixture.documents.set('FCRM Note:Shared Note', reactive({
      doc:{doctype:'FCRM Note',name:'Shared Note',title:'Shared title',content:'<p>Complete shared note content</p>'},
      save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{title:{read_only:false},content:{read_only:false}},
    }))
    await open({render:()=>null}, {})
    useDoctypeModal().showModal({doctype:'FCRM Note',name:'Shared Note',title:'Note',readOnly:true})
    await settle()
    expect(document.body.textContent).toContain('View Note')
    expect(document.body.textContent).toContain('Complete shared note content')
    expect([...document.body.querySelectorAll('button')].some(button=>button.textContent==='Update')).toBe(false)
    expect(document.body.querySelector('input[placeholder="Title"]').disabled).toBe(true)
    expect(document.body.querySelector('[contenteditable="true"]')).toBeNull()
    useDoctypeModal().show.value=false; await settle()
    useDoctypeModal().showModal({doctype:'FCRM Note',name:'Shared Note',title:'Note'})
    await settle()
    expect(document.body.textContent).toContain('Edit Note')
    expect([...document.body.querySelectorAll('button')].some(button=>button.textContent==='Update')).toBe(true)
    expect(document.body.querySelector('input[placeholder="Title"]').disabled).toBe(false)
    expect(document.body.querySelector('[contenteditable="true"]')).not.toBeNull()
  })
})
