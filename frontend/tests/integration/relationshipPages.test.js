import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, reactive, nextTick, toRaw } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { Button, Dialog, ErrorMessage, Badge, FormControl, TextInput, FeatherIcon } from 'frappe-ui'
import Organization from '@/pages/Organization.vue'
import Contact from '@/pages/Contact.vue'
import MobileOrganization from '@/pages/MobileOrganization.vue'
import MobileContact from '@/pages/MobileContact.vue'
import translationPlugin from '@/translation'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import DeleteLinkedDocModal from '@/components/DeleteLinkedDocModal.vue'
import Activities from '@/components/Activities/Activities.vue'
import NoteArea from '@/components/Activities/NoteArea.vue'
import TaskArea from '@/components/Activities/TaskArea.vue'
import CallArea from '@/components/Activities/CallArea.vue'
import DoctypeModals from '@/components/Modals/DoctypeModals.vue'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { useAttachments } from '@/composables/useAttachments'
import { setupCustomizations } from '@/utils'
import { useRecordPagePanels } from '@/composables/useRecordPagePanels'
import RecordPagePanels from '@/components/RecordPagePanels.vue'
import AttachmentArea from '@/components/Activities/AttachmentArea.vue'
import FieldLayoutDialogContainer from '@/components/Modals/FieldLayoutDialogContainer.vue'
import { fieldLayoutDialogs } from '@/utils/renderFieldLayoutDialog'

// External boot data used by genuine native date/timestamp controls.
window.sysdefaults = { ...window.sysdefaults, date_format: 'yyyy-mm-dd', time_format: 'HH:mm:ss' }

const fixture = vi.hoisted(() => ({ enabled: true, script: null, contributions: null, rendererFactory: null, discovery: null, loadFailure: null, rendererLoad: null, documents: new Map(), requests: [], requestOptions: [] }))
vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  const actual = await vi.importActual('@/data/document')
  return { useDocument(doctype, name, overrides, editorDocument) {
    if (fixture.nativeControllers) return actual.useDocument(...arguments)
    const key = `${doctype}:${name || ''}`
    if (!fixture.documents.has(key)) fixture.documents.set(key, reactive({
      doc: name ? { doctype, name, organization_name: name, full_name: name } : {},
      setValue: { submit() {} }, save: { submit() {} }, actions: [], fieldPropertyOverrides: {},
    }))
    const resource = editorDocument || fixture.documents.get(key)
    return {
      document: resource,
      permissions: { data: { permissions: { delete: false } } },
      scripts: { data: fixture.script ? [{script:fixture.script}] : [] },
      triggerOnRender: async () => { fixture.renderDocument?.(resource.doc) }, triggerOnBeforeCreate: async () => {},
      triggerOnValidate: async () => { fixture.clientEvents?.push('validate') },
      triggerOnSave: async () => { fixture.clientEvents?.push('save') },
      triggerOnError: async () => { fixture.clientEvents?.push('error') },
      triggerOnChange: async (fieldname, value, row) => {
        fixture.clientEvents?.push(`change:${fieldname}`)
        ;(row || resource.doc)[fieldname] = value
      },
    }
  } }
})
vi.mock('frappe-ui', async (original) => {
  const actual = await original()
  const { reactive } = await import('vue')
  return { ...actual, call: async (method, context) => {
    if (method.startsWith('crm.integrations.api.add_')) {
      fixture.callMutations?.push({method,context})
      return context.note || context.task
    }
    if (method === 'test.editor.pause') return fixture.controllerPause
    if (method === 'test.editor.rights') return fixture.controllerRights
    if (method === 'crm.api.record_page.get_panels') {
      if (fixture.discovery) return fixture.discovery(context)
      return {context, contributions: fixture.contributions || (fixture.enabled ? [{key:'demo:activity',id:'activity',owner_app:'demo',renderer:'activity',version:1,js:{url:'/assets/demo/demo.bundle.js',revision:'one'},css:[],default_panel:'Activity',panels:[{id:'Activity',name:'demo:activity:Activity',label:'Activity'},{id:'Notes',name:'demo:activity:Notes',label:'Notes'}]}] : []),diagnostics:[]}
    }
    return actual.call(method,context)
  }, usePageMeta() {}, createListResource(options) {
    const data = options?.doctype === 'CRM Form Script' && fixture.controllerScript
      ? [{name:'Native editor controller',script:fixture.controllerScript}] : []
    options?.onSuccess?.(data)
    return reactive({data,list:{promise:Promise.resolve()},fetch:async()=>data})
  }, createDocumentResource(options) {
    const key = `${options.doctype}:${options.name}`
    const resource = fixture.documents.get(key)
    resource.reload = async () => { await options.onSuccess?.(resource.doc); return resource.doc }
    Promise.resolve().then(()=>resource.reload())
    return resource
  },
    createResource(options) {
      fixture.requests.push(options.url)
      fixture.requestOptions.push(options)
      let data = []
      if (options.url === 'crm.api.activities.get_activities') data = options.transform([[],[],[],[],[]])
      if (options.url === 'crm.fcrm.doctype.crm_call_log.crm_call_log.get_call_log') data = fixture.callLog
      if (options.url.includes('get_sidepanel_sections')) data = []
      if (options.url.includes('get_fields_layout')) data = [{name:'main',label:'',sections:[{name:'note',label:'',columns:[{name:'one',fields:[{fieldname:'title',fieldtype:'Data',label:'Title',visible:true},{fieldname:'content',fieldtype:'Text Editor',label:'Content',visible:true}]}]}]}]
      return reactive({data, reload() { if(options.url === 'crm.fcrm.doctype.crm_call_log.crm_call_log.get_call_log') fixture.callReload?.() }, submit: async (params) => {
        if (options.url === 'frappe.client.save') {
          fixture.nativeSaves.push(JSON.parse(JSON.stringify(params)))
          if (fixture.saveResult) options.onSuccess?.(fixture.saveResult)
          else options.onError?.({exc_type:'TimestampMismatchError',messages:['Document changed. Please refresh.']})
        }
      }, loading:false})
    },
  }
})

vi.mock('@/utils/recordPanelRegistry', () => ({getPanelRegistry:()=>({approve(){},async load(descriptor){
  if (fixture.rendererLoad) return fixture.rendererLoad(descriptor)
  if (fixture.loadFailure === descriptor.owner_app) throw new Error('Asset unavailable')
  if (fixture.rendererFactory) return runtime=>fixture.rendererFactory(runtime,descriptor)
  return runtime=>({props:['context'],setup(props){return ()=>runtime.h('div',[
    runtime.h('span',props.context.doctype+':'+props.context.name+':'+props.context.panel),
    props.context.panel==='Notes' ? runtime.h('button',{onClick:()=>runtime.showModal({doctype:'FCRM Note',title:'Note',defaults:{reference_doctype:props.context.doctype,reference_docname:props.context.name}})},'New Note'):null
  ])}})
}})}))
vi.mock('@/stores/settings', async () => {
  const { reactive, ref } = await import('vue')
  const settings = { brand: reactive({}), settings: ref({}), _settings: reactive({doc:{}}) }
  return { getSettings: () => settings }
})
vi.mock('@/stores/global', () => ({ globalStore: () => ({$socket:fixture.socket || {on(){},off(){},emit(){}},$dialog(){},makeCall(){}}) }))
vi.mock('@/stores/users', () => ({ usersStore: () => ({isManager:()=>false,getUser:()=>({full_name:'Staff'})}) }))
vi.mock('@/stores/statuses', () => ({ statusesStore: () => ({getDealStatus:()=>({})}) }))
vi.mock('@/stores/organizations', () => ({ organizationsStore: () => ({getOrganization:()=>({})}) }))
vi.mock('@/stores/meta', () => ({ getMeta: () => ({doctypesMeta:{'FCRM Note':{fields:[]}},doctypeMeta: {value:{}},getFields:()=>[],getField:()=>({}),getMeta:()=>({})}) }))
vi.mock('@/router', () => ({default:{push(){}}}))
vi.mock('@/utils/view', () => ({ getView: () => null }))
vi.mock('@/composables/whatsapp', async () => ({whatsappEnabled:(await import('vue')).ref(false)}))
vi.mock('@/composables/telephony', () => ({callEnabled:{value:false}}))
vi.mock('@/composables/useContactFields', () => ({useContactFields:()=>section=>section}))
vi.mock('frappe-ui/frappe', () => ({useTelemetry:()=>({capture(){}}),useOnboarding:()=>({
  totalSteps:{get value(){return fixture.onboardingCount ?? 8}},
  updateOnboardingStep(step){
    if(fixture.onboardingCount === 0) throw new TypeError('Onboarding UI has no initialized steps')
    fixture.onboardingUpdates?.push(step)
  },
})}))
vi.mock('@/components/SidePanelLayout.vue', () => ({default:{render:()=>h('aside','Record information')}}))
vi.mock('@/components/Resizer.vue', () => ({default:{render(){return h('div',this.$slots.default?.())}}}))
vi.mock('@/components/LayoutHeader.vue', () => ({default:{render(){return h('header',[this.$slots['left-header']?.(),this.$slots['right-header']?.()])}}}))
vi.mock('@/components/ListViews/DealsListView.vue', () => ({default:{render:()=>null}}))
vi.mock('@/components/ListViews/ContactsListView.vue', () => ({default:{render:()=>null}}))
vi.mock('@/components/DeleteLinkedDocModal.vue', () => ({default:{render:()=>null}}))


let app, element
async function settle() { for(let i=0;i<8;i++) { await nextTick(); await new Promise(resolve=>setTimeout(resolve,0)) } }
afterEach(()=>{app?.unmount();element?.remove();document.body.innerHTML='';fixture.documents.clear();fixture.script=null;fixture.callLog=null;fixture.contributions=null;fixture.rendererFactory=null;fixture.discovery=null;fixture.loadFailure=null;fixture.rendererLoad=null;fixture.nativeControllers=false;fixture.controllerScript=null;fixture.controllerPause=null;fixture.enabled=true;fixture.socket=null;useDoctypeModal().show.value=false;fieldLayoutDialogs.value=[];vi.unstubAllGlobals()})
async function open(Page, props) {
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',name:'Test',component:{render:()=>null}},{path:'/organizations',name:'Organizations',component:{render:()=>null}},{path:'/contacts',name:'Contacts',component:{render:()=>null}},{path:'/organizations/:organizationId',name:'Organization',component:{render:()=>null}},{path:'/contacts/:contactId',name:'Contact',component:{render:()=>null}}]})
  await router.push('/');await router.isReady()
  element=document.createElement('div');document.body.append(element)
  app=createApp({render:()=>h('div',[h(Page,props),h(DoctypeModals),h(FieldLayoutDialogContainer)])})
  app.use(router)
  app.use(translationPlugin)
  for(const [name, component] of Object.entries({Button,Dialog,ErrorMessage,Badge,FormControl,TextInput,FeatherIcon,EmptyState,DeleteLinkedDocModal})) app.component(name,component)
  app.mount(element);await settle()
}

describe('existing native relationship pages',()=>{
  it('exposes public typed realtime subscriptions without losing the panel room when native Activities unmounts', async () => {
    const listeners = new Map()
    fixture.socket = {
      on: vi.fn((event, handler) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(handler) }),
      off: vi.fn((event, handler) => listeners.get(event)?.delete(handler)),
      emit: vi.fn(),
    }
    let runtime, hideNative
    fixture.rendererFactory = ui => {
      runtime = ui
      return { props:['context'], setup(props) {
        const draft = ui.ref('')
        const updates = ui.ref(0)
        const nativeVisible = ui.ref(true)
        hideNative = () => { nativeVisible.value = false }
        if (ui.realtime) {
          const stopRoom = ui.realtime.subscribeDocument(props.context.doctype, props.context.name)
          const stopEvent = ui.realtime.on('example_record_changed', context => {
            if (context.doctype === props.context.doctype && context.name === props.context.name) updates.value++
          })
          ui.onUnmounted(() => { stopEvent(); stopRoom() })
        }
        return () => ui.h('div', [
          ui.h('textarea', {'aria-label':'Realtime draft', value:draft.value, onInput:event=>draft.value=event.target.value}),
          ui.h('p', {'data-updates':true}, String(updates.value)),
          nativeVisible.value ? ui.h(Activities, {
            doctype:props.context.doctype, docname:props.context.name, tabs:[{name:'Activity'}],
            adapter:{doc:props.context.doc,resource:{data:{versions:[],calls:[],notes:[],tasks:[],attachments:[]},reload(){}}},
          }, {header:()=>null}) : null,
        ])
      } }
    }
    await open(Organization, {organizationId:'Public realtime record'})
    expect(runtime.realtime).toMatchObject({on:expect.any(Function),off:expect.any(Function),subscribeDocument:expect.any(Function)})
    expect(fixture.socket.emit.mock.calls.filter(([event])=>event==='doc_subscribe')).toEqual([['doc_subscribe','CRM Organization','Public realtime record']])
    const draft = element.querySelector('textarea[aria-label="Realtime draft"]')
    draft.value = 'Unsent native draft'
    draft.dispatchEvent(new Event('input',{bubbles:true}))
    for (const handler of listeners.get('example_record_changed')) handler({doctype:'Contact',name:'Public realtime record'})
    await settle()
    expect(element.querySelector('[data-updates]').textContent).toBe('0')
    hideNative()
    await settle()
    expect(fixture.socket.emit.mock.calls.filter(([event])=>event==='doc_unsubscribe')).toEqual([])
    for (const handler of listeners.get('example_record_changed')) handler({doctype:'CRM Organization',name:'Public realtime record'})
    await settle()
    expect(element.querySelector('[data-updates]').textContent).toBe('1')
    expect(draft.value).toBe('Unsent native draft')
    app.unmount(); app = null
    expect(fixture.socket.emit.mock.calls.filter(([event])=>event==='doc_unsubscribe')).toEqual([['doc_unsubscribe','CRM Organization','Public realtime record']])
    expect(listeners.get('example_record_changed').size).toBe(0)
  })
  it('awaits native controller modal rights before exposing fields and honors read-only without changing the next stock editor', async () => {
    let resolveRights
    fixture.controllerRights = new Promise(resolve=>{resolveRights=resolve})
    fixture.nativeControllers = true
    fixture.controllerScript = `class FCRMNote { get modalOptions() { return this.call('test.editor.rights') } }`
    const loaded = {doctype:'FCRM Note',name:'Async readonly policy Note',title:'Shared global source',content:'<p>Full shared global content</p>',modified:'2026-10-02 12:00:00.000001'}
    fixture.documents.set('FCRM Note:Async readonly policy Note',reactive({doc:loaded,save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}}))
    await open({render:()=>null},{})
    useDoctypeModal().showModal({doctype:'FCRM Note',name:loaded.name,title:'Note'})
    await settle()
    expect(document.body.querySelector('input[placeholder="Title"]')).toBeNull()
    resolveRights({fullDocumentSave:true,readOnly:true})
    await settle()
    expect(document.body.textContent).toContain('View Note')
    const title = document.body.querySelector('input[placeholder="Title"]')
    expect(title.value).toBe('Shared global source')
    expect(title.disabled || title.readOnly).toBe(true)
    expect(document.body.textContent).toContain('Full shared global content')
    expect([...document.body.querySelectorAll('button')].some(button=>button.textContent==='Update')).toBe(false)
    expect(document.body.querySelector('[contenteditable="true"]')).toBeNull()
    useDoctypeModal().show.value = false
    await settle()
    fixture.controllerRights = Promise.resolve({fullDocumentSave:false,readOnly:false})
    const stockSave = vi.fn()
    const stock = {...loaded,name:'Stock after readonly policy Note',title:'Ordinary stock source'}
    fixture.documents.set('FCRM Note:Stock after readonly policy Note',reactive({doc:stock,save:{submit:stockSave},actions:[],fieldPropertyOverrides:{}}))
    useDoctypeModal().showModal({doctype:'FCRM Note',name:stock.name,title:'Note'})
    await settle()
    expect(document.body.querySelector('input[placeholder="Title"]').value).toBe(stock.title)
    ;[...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update').click()
    await settle()
    expect(stockSave).toHaveBeenCalledTimes(1)
  })
  it('retains the native save rejection and displays an asynchronous error-hook failure without an unhandled rejection', async () => {
    fixture.nativeControllers = true
    fixture.nativeSaves = []
    fixture.saveResult = null
    fixture.controllerScript = `class FCRMNote { async onError() { throw new Error('Native error hook failed') } }`
    const loaded = {doctype:'FCRM Note',name:'Error hook Note',title:'Unsent source',modified:'2026-10-02 12:00:00.000001'}
    fixture.documents.set('FCRM Note:Error hook Note',reactive({doc:loaded,save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}}))
    await open({render:()=>null},{})
    useDoctypeModal().showModal({doctype:'FCRM Note',name:loaded.name,title:'Note',fullDocumentSave:true})
    await settle()
    ;[...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update').click()
    await settle()
    expect(document.body.textContent).toContain('Document changed. Please refresh.')
    expect(document.body.textContent).toContain('Native error hook failed')
    expect(useDoctypeModal().show.value).toBe(true)
    expect(document.body.querySelector('input[placeholder="Title"]').value).toBe('Unsent source')
  })
  it('shows an asynchronous native save-hook error without losing the accepted document or leaving an unhandled rejection', async () => {
    fixture.nativeControllers = true
    fixture.nativeSaves = []
    fixture.controllerScript = `class FCRMNote { async onSave() { throw new Error('Native save hook failed') } }`
    const loaded = {doctype:'FCRM Note',name:'Save hook error Note',title:'Accepted source',modified:'2026-10-02 12:00:00.000001'}
    fixture.documents.set('FCRM Note:Save hook error Note',reactive({doc:loaded,save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}}))
    fixture.saveResult = {...loaded,modified:'2026-10-02 12:01:00.000001'}
    const callback = vi.fn()
    await open({render:()=>null},{})
    useDoctypeModal().showModal({doctype:'FCRM Note',name:loaded.name,title:'Note',fullDocumentSave:true,callbacks:{afterUpdate:callback}})
    await settle()
    ;[...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update').click()
    await settle()
    expect(document.body.textContent).toContain('Native save hook failed')
    expect(useDoctypeModal().show.value).toBe(true)
    expect(callback).toHaveBeenCalledWith(fixture.saveResult)
    expect(fixture.documents.get('FCRM Note:Save hook error Note').doc.modified).toBe(fixture.saveResult.modified)
    fixture.saveResult = null
  })
  it('does not close a later editor when an earlier native save hook completes after its modal was closed', async () => {
    let resume
    fixture.controllerPause = new Promise(resolve=>{resume=resolve})
    fixture.nativeControllers = true
    fixture.nativeSaves = []
    fixture.controllerScript = `class FCRMNote {
      async onSave() { await this.call('test.editor.pause'); this.doc.content = '<p>Old editor hook draft</p>' }
    }`
    const first = {doctype:'FCRM Note',name:'Closed async save Note',title:'First editor',content:'<p>Original</p>',modified:'2026-10-02 12:00:00.000001'}
    const resource = reactive({doc:first,save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}})
    fixture.documents.set('FCRM Note:Closed async save Note',resource)
    fixture.saveResult = {...first,modified:'2026-10-02 12:01:00.000001'}
    await open({render:()=>null},{})
    useDoctypeModal().showModal({doctype:'FCRM Note',name:first.name,title:'Note',fullDocumentSave:true})
    await settle()
    ;[...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update').click()
    await settle()
    useDoctypeModal().show.value = false
    await settle()
    const second = {...first,name:'Next independent Note',title:'Next editor'}
    fixture.documents.set('FCRM Note:Next independent Note',reactive({doc:second,save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}}))
    const nextCallback = vi.fn()
    useDoctypeModal().showModal({doctype:'FCRM Note',name:second.name,title:'Note',callbacks:{afterUpdate:nextCallback}})
    await settle()
    resume()
    await settle()
    expect(useDoctypeModal().show.value).toBe(true)
    expect(document.body.querySelector('input[placeholder="Title"]').value).toBe('Next editor')
    expect(nextCallback).not.toHaveBeenCalled()
    expect(resource.doc.content).toBe('<p>Original</p>')
    fixture.saveResult = null
  })
  it('processes native pending attachment deletions only after an accepted full-document save', async () => {
    fixture.nativeSaves = []
    const loaded = {doctype:'FCRM Note',name:'Attachment cleanup Note',title:'Attachment owner',modified:'2026-10-02 12:00:00.000001'}
    fixture.documents.set('FCRM Note:Attachment cleanup Note',reactive({doc:loaded,save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}}))
    const attachments = useAttachments('FCRM Note',loaded.name)
    attachments.trackOldFile('/files/old-editor-attachment.txt','/files/replacement-editor-attachment.txt')
    fixture.saveResult = null
    await open({render:()=>null},{})
    useDoctypeModal().showModal({doctype:'FCRM Note',name:loaded.name,title:'Note',fullDocumentSave:true})
    await settle()
    const start = fixture.requestOptions.length
    ;[...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update').click()
    await settle()
    expect(fixture.requestOptions.slice(start).filter(options=>options.url==='crm.api.delete_attachment')).toHaveLength(0)
    fixture.saveResult = {...loaded,modified:'2026-10-02 12:01:00.000001'}
    ;[...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update').click()
    await settle()
    expect(fixture.requestOptions.slice(start).filter(options=>options.url==='crm.api.delete_attachment').map(options=>options.params)).toEqual([
      {doctype:'FCRM Note',docname:loaded.name,file_url:'/files/old-editor-attachment.txt'},
    ])
    fixture.saveResult = null
  })
  it('honors native controller modal opt-in from a global launcher while keeping other documents on stock save', async () => {
    fixture.nativeControllers = true
    fixture.nativeSaves = []
    fixture.controllerScript = `class FCRMNote {
      get modalOptions() { return {fullDocumentSave:this.doc.custom_use_revision === 1} }
    }`
    const managed = {doctype:'FCRM Note',name:'Controller Managed Note',title:'Managed source',modified:'2026-10-02 12:00:00.000001',custom_use_revision:1}
    fixture.documents.set('FCRM Note:Controller Managed Note',reactive({doc:managed,save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}}))
    await open({render:()=>null},{})
    useDoctypeModal().showModal({doctype:'FCRM Note',name:managed.name,title:'Note'})
    await settle()
    ;[...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update').click()
    await settle()
    expect(fixture.nativeSaves[0]?.doc).toEqual(managed)
    useDoctypeModal().show.value = false
    await settle()
    const stockSave = vi.fn()
    const plain = {...managed,name:'Controller Plain Note',title:'Stock source',custom_use_revision:0}
    fixture.documents.set('FCRM Note:Controller Plain Note',reactive({doc:plain,save:{submit:stockSave},actions:[],fieldPropertyOverrides:{}}))
    useDoctypeModal().showModal({doctype:'FCRM Note',name:plain.name,title:'Note'})
    await settle()
    ;[...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update').click()
    await settle()
    expect(stockSave).toHaveBeenCalledTimes(1)
    expect(fixture.nativeSaves).toHaveLength(1)
  })
  it('keeps a paused native field controller bound to its editor when realtime replaces the shared document', async () => {
    let resume
    fixture.controllerPause = new Promise(resolve=>{resume=resolve})
    fixture.nativeControllers = true
    fixture.controllerScript = `class FCRMNote {
      async title() {
        await this.call('test.editor.pause');
        this.doc.content = '<p>Controller draft: ' + this.doc.title + '</p>';
      }
    }`
    const loaded = {doctype:'FCRM Note',name:'Async Controller Note',title:'Loaded title',content:'<p>Loaded content</p>',modified:'2026-10-02 12:00:00.000001'}
    const resource = reactive({doc:loaded,save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}})
    fixture.documents.set('FCRM Note:Async Controller Note',resource)
    await open({render:()=>null},{})
    useDoctypeModal().showModal({doctype:'FCRM Note',name:loaded.name,title:'Note',fullDocumentSave:true})
    await settle()
    const title = document.body.querySelector('input[placeholder="Title"]')
    title.value = 'Unsent title'
    title.dispatchEvent(new Event('input',{bubbles:true}))
    title.dispatchEvent(new Event('change',{bubbles:true}))
    await nextTick()
    const newer = {...loaded,title:'Newer server title',content:'<p>Newer server content</p>',modified:'2026-10-02 12:01:00.000001'}
    resource.doc = newer
    resume()
    await settle()
    expect(resource.doc.content).toBe('<p>Newer server content</p>')
    expect(document.body.querySelector('input[placeholder="Title"]').value).toBe('Unsent title')
    expect(document.body.querySelector('[contenteditable="true"]').textContent).toContain('Controller draft: Unsent title')
  })
  it('shows an initial opt-in editor read failure without exposing fields or allowing insertion', async () => {
    fixture.documents.set('FCRM Note:Unavailable Note',reactive({doc:{},reload:async()=>{throw new Error('Read permission unavailable')},save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}}))
    await open({render:()=>null},{})
    useDoctypeModal().showModal({doctype:'FCRM Note',name:'Unavailable Note',title:'Note',fullDocumentSave:true})
    await settle()
    expect(document.body.textContent).toContain('Read permission unavailable')
    expect(document.body.querySelector('input[placeholder="Title"]')).toBeNull()
    const update = [...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update')
    expect(update?.disabled).toBe(true)
  })
  it('keeps render/save lifecycle hooks and callbacks for opt-in saving then restores the stock next launch', async () => {
    const stockSave = vi.fn()
    const callback = vi.fn()
    fixture.nativeSaves = []
    fixture.clientEvents = []
    fixture.renderDocument = doc=>{doc.title='Rendered by the native controller'}
    const loaded = {doctype:'FCRM Note',name:'Lifecycle Note',title:'Original',content:'<p>Full content</p>',modified:'2026-10-02 12:00:00.000001'}
    fixture.saveResult = {...loaded,title:'Rendered by the native controller',modified:'2026-10-02 12:01:00.000001'}
    fixture.documents.set('FCRM Note:Lifecycle Note',reactive({doc:loaded,save:{submit:stockSave},actions:[],fieldPropertyOverrides:{}}))
    await open({render:()=>null},{})
    useDoctypeModal().showModal({doctype:'FCRM Note',name:'Lifecycle Note',title:'Note',fullDocumentSave:true,callbacks:{afterUpdate:callback}})
    await settle()
    expect(document.body.querySelector('input[placeholder="Title"]').value).toBe('Rendered by the native controller')
    ;[...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update').click()
    await settle()
    expect(fixture.nativeSaves[0].doc.title).toBe('Rendered by the native controller')
    expect(fixture.clientEvents).toEqual(['validate','save'])
    expect(callback).toHaveBeenCalledWith(fixture.saveResult)
    expect(useDoctypeModal().show.value).toBe(false)
    fixture.renderDocument = null
    fixture.saveResult = null
    fixture.clientEvents = null
    useDoctypeModal().showModal({doctype:'FCRM Note',name:'Lifecycle Note',title:'Note'})
    await settle()
    expect(useDoctypeModal().fullDocumentSave.value).toBe(false)
    ;[...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update').click()
    await settle()
    expect(stockSave).toHaveBeenCalledTimes(1)
    expect(fixture.nativeSaves).toHaveLength(1)
  })
  it('preserves an open draft and loaded revision across a realtime document replacement while running field hooks', async () => {
    fixture.nativeSaves = []
    fixture.clientEvents = []
    const loaded = {doctype:'FCRM Note',name:'Draft Note',title:'Before editing',content:'<p>Complete loaded content</p>',modified:'2026-10-02 12:00:00.000001'}
    const resource = reactive({doc:{...loaded},save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}})
    fixture.documents.set('FCRM Note:Draft Note', resource)
    await open({render:()=>null},{})
    useDoctypeModal().showModal({doctype:'FCRM Note',name:'Draft Note',title:'Note',fullDocumentSave:true})
    await settle()
    const input = document.body.querySelector('input[placeholder="Title"]')
    input.value = 'Unsent draft'
    input.dispatchEvent(new Event('change',{bubbles:true}))
    input.dispatchEvent(new Event('change',{bubbles:true}))
    await settle()
    expect(input.value).toBe('Unsent draft')
    resource.doc = {...loaded,title:'Other editor won',content:'<p>Remote content</p>',modified:'2026-10-02 12:01:00.000001'}
    await settle()
    expect(input.value).toBe('Unsent draft')
    expect(document.body.textContent).toContain('Complete loaded content')
    const update = [...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update')
    update.click()
    await settle()
    expect(fixture.nativeSaves).toEqual([{doc:{...loaded,title:'Unsent draft'}}])
    expect(fixture.clientEvents).toContain('change:title')
    expect(fixture.clientEvents).toContain('validate')
    expect(fixture.clientEvents).toContain('error')
    expect(input.value).toBe('Unsent draft')
    expect(useDoctypeModal().show.value).toBe(true)
    fixture.clientEvents = null
    useDoctypeModal().show.value = false
    await settle()
    useDoctypeModal().showModal({doctype:'FCRM Note',name:'Draft Note',title:'Note'})
    await settle()
    expect(document.body.querySelector('input[placeholder="Title"]').value).toBe('Other editor won')
  })
  it('opts into native full-document saving with the loaded revision and keeps a rejected editor open', async () => {
    const stockSave = vi.fn()
    fixture.nativeSaves = []
    fixture.documents.set('FCRM Note:Revision Note', reactive({
      doc:{doctype:'FCRM Note',name:'Revision Note',title:'Loaded title',content:'<p>Loaded content</p>',modified:'2026-10-02 12:00:00.000001'},
      save:{submit:stockSave},actions:[],fieldPropertyOverrides:{},
    }))
    await open({render:()=>null},{})
    useDoctypeModal().showModal({doctype:'FCRM Note',name:'Revision Note',title:'Note',fullDocumentSave:true})
    await settle()
    const update = [...document.body.querySelectorAll('button')].find(button=>button.textContent==='Update')
    expect(update).toBeDefined()
    update.click()
    await settle()
    expect(fixture.nativeSaves).toEqual([{doc:{doctype:'FCRM Note',name:'Revision Note',title:'Loaded title',content:'<p>Loaded content</p>',modified:'2026-10-02 12:00:00.000001'}}])
    expect(stockSave).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Document changed. Please refresh.')
    expect(useDoctypeModal().show.value).toBe(true)
    expect(document.body.querySelector('[contenteditable="true"]')).not.toBeNull()
  })
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
    const richPanel=document.getElementById(tabs[0].getAttribute('aria-controls'))
    expect(richPanel?.dataset.crmPanel).toBe('demo:activity')
    expect(richPanel.getAttribute('aria-labelledby')).toBe(tabs[0].id)
    expect(richPanel.style.display).not.toBe('none')
    if (!label.startsWith('Mobile')) expect(element.textContent).toContain('Record information')
    // Native Reka Tabs activates on mousedown or Enter/Space, not synthetic click.
    tabs[1].dispatchEvent(label === 'Organization'
      ? new MouseEvent('mousedown', {button:0,ctrlKey:false,bubbles:true})
      : new KeyboardEvent('keydown', {key:'Enter',bubbles:true}))
    await settle()
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(document.getElementById(tabs[1].getAttribute('aria-controls'))).toBe(richPanel)
    expect(richPanel.getAttribute('aria-labelledby')).toBe(tabs[1].id)
    expect(richPanel.style.display).not.toBe('none')
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
  it('permits the same label as a native pane without dispatch collisions', async () => {
    fixture.contributions=[{key:'demo:summary',owner_app:'demo',renderer:'summary',version:1,js:{url:'/assets/demo/summary.bundle.js',revision:'one'},css:[],default_panel:'summary',panels:[{id:'summary',name:'demo:summary:summary',label:'Details'}]}]
    await open(MobileOrganization,{organizationId:'Same Name'})
    expect([...element.querySelectorAll('[role="tab"]')].map(tab=>tab.getAttribute('aria-label') || tab.textContent.trim().replace(/\s*\d+$/, ''))).toEqual(['Details','Record information','Deals','Contacts'])
    expect(element.textContent).toContain('CRM Organization:Same Name:summary')
    expect(element.querySelector('section[data-crm-panel]').textContent).not.toContain('Record information')
  })
  it('keeps an unsent composer draft while refreshing document props and native header actions', async () => {
    fixture.script = `function setupForm({doc}) {return {actions:[{label:'Action: '+doc.full_name,onClick(){}}]}}`
    fixture.rendererFactory=runtime=>({props:['context'],setup(props){
      const draft=runtime.ref(''); return ()=>runtime.h('div',[runtime.h('span','Current record: '+props.context.doc.full_name),runtime.h('textarea',{'aria-label':'Unsent note draft',value:draft.value,onInput:event=>draft.value=event.target.value})])
    }})
    await open(Contact,{contactId:'Same Name'})
    const composer=element.querySelector('textarea[aria-label="Unsent note draft"]')
    composer.value='My unsent note'
    composer.dispatchEvent(new Event('input',{bubbles:true}))
    await settle()
    const tabs=[...element.querySelectorAll('[role="tab"]')]
    for (const tab of [tabs[1],tabs[2],tabs[0]]) { tab.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await settle() }
    expect(element.querySelector('textarea[aria-label="Unsent note draft"]')).toBe(composer)
    fixture.documents.get('Contact:Same Name').doc={doctype:'Contact',name:'Same Name',full_name:'After reload'}
    await settle()
    expect(element.textContent).toContain('Current record: After reload')
    expect([...element.querySelectorAll('button')].some(button=>button.textContent==='Action: After reload')).toBe(true)
    expect(element.querySelector('textarea[aria-label="Unsent note draft"]').value).toBe('My unsent note')
    expect(element.querySelector('textarea[aria-label="Unsent note draft"]')).toBe(composer)
  })
  it('keeps the existing tab layout when no activity contribution is installed',async()=>{
    fixture.enabled=false;await open(Organization,{organizationId:'Unmanaged'})
    expect([...element.querySelectorAll('[role="tab"]')].map(tab=>tab.textContent.trim().replace(/\s*\d+$/, ''))).toEqual(['Deals','Contacts'])
  })
})



const appPanel=(app,id='summary')=>({key:`${app}:${id}`,id,owner_app:app,renderer:id,version:1,js:{url:`/assets/${app}/${id}.bundle.js`,revision:'one'},css:[],default_panel:id,panels:[{id,name:`${app}:${id}:${id}`,label:'Summary'}]})
describe('generic contributor lifecycle',()=>{
  for(const [Page,props] of [[Organization,{organizationId:'Same Name'}],[Contact,{contactId:'Same Name'}]]) it(`keeps native tabs and persistent rich content in one desktop column on ${Page.__name}`,async()=>{
    fixture.contributions=[appPanel('demo')]
    fixture.rendererFactory=runtime=>({props:['context'],setup(){const draft=runtime.ref('');return ()=>runtime.h('textarea',{'aria-label':'Column draft',value:draft.value,onInput:e=>draft.value=e.target.value})}})
    await open(Page,props)
    const panel=element.querySelector('section[data-crm-panel]')
    const tabs=element.querySelector('[role="tablist"]').parentElement
    const column=panel.parentElement
    expect(tabs.parentElement).toBe(column)
    expect(column.classList.contains('flex-col')).toBe(true)
    expect(column.classList.contains('min-w-0')).toBe(true)
    expect(column.parentElement.children).toHaveLength(2)
    expect(element.querySelectorAll('[role="tablist"]')).toHaveLength(1)
    expect(tabs.classList.contains('record-panels-selected')).toBe(true)
    const composer=panel.querySelector('textarea');composer.value='Unsent';composer.dispatchEvent(new Event('input',{bubbles:true}));await settle()
    const tabButtons=[...element.querySelectorAll('[role="tab"]')]
    const deals=tabButtons.find(tab=>tab.textContent.trim().startsWith('Deals'))
    deals.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await settle()
    expect(tabs.classList.contains('record-panels-selected')).toBe(false)
    tabButtons[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await settle()
    expect(panel.querySelector('textarea')).toBe(composer)
    expect(composer.value).toBe('Unsent')
  })
  for(const [Page,props] of [[Organization,{organizationId:'Same Name'}],[Contact,{contactId:'Same Name'}],[MobileOrganization,{organizationId:'Same Name'}],[MobileContact,{contactId:'Same Name'}]]) it(`selects the declared default after overlapping cached-document discovery on ${Page.__name}`,async()=>{
    const label=tab=>tab.getAttribute('aria-label') || tab.textContent.trim()
    const pending=[]
    fixture.discovery=context=>new Promise(resolve=>pending.push({context,resolve}))
    await open(Page,props)
    const record=[...fixture.documents.values()][0]
    record.doc={...record.doc,modified:'Fresh HTTP response'};await settle()
    expect(pending).toHaveLength(2)
    const result=request=>({context:request.context,contributions:[appPanel('demo')],diagnostics:[]})
    pending[1].resolve(result(pending[1]));await settle()
    expect(label(element.querySelector('[role="tab"][aria-selected="true"]'))).toBe('Summary')
    pending[0].resolve(result(pending[0]));await settle()
    expect(label(element.querySelector('[role="tab"][aria-selected="true"]'))).toBe('Summary')
    record.doc={...record.doc};await settle()
    const deals=[...element.querySelectorAll('[role="tab"]')].find(tab=>label(tab).startsWith('Deals'))
    deals.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await settle()
    pending[2].resolve(result(pending[2]));await settle()
    expect(label(element.querySelector('[role="tab"][aria-selected="true"]')).startsWith('Deals')).toBe(true)
  })
  for(const [Page,props] of [[Organization,{organizationId:'Same Name'}],[Contact,{contactId:'Same Name'}],[MobileOrganization,{organizationId:'Same Name'}],[MobileContact,{contactId:'Same Name'}]]) it(`coexists and removes contributors on ${Page.__name}`,async()=>{
    fixture.contributions=[appPanel('first'),appPanel('second')]
    const unmounted=[]
    fixture.rendererFactory=(runtime,descriptor)=>({props:['context'],setup(props){runtime.onUnmounted(()=>unmounted.push(descriptor.owner_app));return ()=>runtime.h('p',descriptor.owner_app+':'+props.context.doctype+':'+props.context.name)}})
    await open(Page,props)
    expect(element.querySelectorAll('section[data-crm-panel]')).toHaveLength(2)
    expect(element.querySelectorAll('[role="tablist"]')).toHaveLength(1)
    fixture.contributions=[]
    const record=[...fixture.documents.values()][0]
    record.doc={...record.doc}
    await settle()
    expect(element.querySelectorAll('section[data-crm-panel]')).toHaveLength(0)
    expect(unmounted.sort()).toEqual(['first','second'])
    expect([...element.querySelectorAll('[role="tab"]')].every(tab=>!tab.textContent.includes('Summary'))).toBe(true)
    expect(element.querySelector('[role="tab"][aria-selected="true"]')).not.toBeNull()
  })
  for(const [Page,props] of [[Organization,{organizationId:'Same Name'}],[Contact,{contactId:'Same Name'}],[MobileOrganization,{organizationId:'Same Name'}],[MobileContact,{contactId:'Same Name'}]]) it(`renders declared sprite icons through native Icon on ${Page.__name}`,async()=>{
    const descriptor=appPanel('demo')
    descriptor.panels[0].icon='lucide-info'
    fixture.contributions=[descriptor]
    await open(Page,props)
    const summary=[...element.querySelectorAll('[role="tab"]')].find(tab=>tab.textContent.trim()==='Summary')
    expect(summary.querySelector('svg use')?.getAttribute('href')).toBe('#info')
    const nativeDeal=[...element.querySelectorAll('[role="tab"]')].find(tab=>tab.textContent.trim().startsWith('Deals'))
    expect(nativeDeal.querySelector('svg')).not.toBeNull()
  })
  it('isolates a failed asset contributor and supports retry without losing native tabs',async()=>{
    fixture.contributions=[appPanel('first'),appPanel('second')]
    fixture.loadFailure='first'
    await open(Contact,{contactId:'Same Name'})
    expect(element.textContent).toContain('Asset unavailable')
    expect(element.querySelectorAll('section[data-crm-panel]')).toHaveLength(2)
    expect(element.textContent).toContain('Deals')
    fixture.loadFailure=null
    const retry=[...element.querySelectorAll('button')].find(button=>button.textContent==='Retry')
    retry.click();await settle()
    expect(element.textContent).not.toContain('Asset unavailable')
    expect(element.querySelectorAll('section[data-crm-panel]')).toHaveLength(2)
  })
  it('replaces a group on asset revision or typed identity changes and retains it on document reload',async()=>{
    fixture.contributions=[appPanel('demo')]
    let created=0,disposed=0
    fixture.rendererFactory=runtime=>({props:['context'],setup(props){created++;runtime.onUnmounted(()=>disposed++);const draft=runtime.ref('');return ()=>runtime.h('textarea',{'aria-label':'Owned draft',value:draft.value,onInput:e=>draft.value=e.target.value})}})
    await open(Contact,{contactId:'Same Name'})
    const record=fixture.documents.get('Contact:Same Name')
    const first=element.querySelector('textarea');first.value='Keep';first.dispatchEvent(new Event('input',{bubbles:true}));await settle()
    record.doc={...record.doc};await settle()
    expect(created).toBe(1);expect(element.querySelector('textarea')).toBe(first)
    fixture.contributions=[{...appPanel('demo'),js:{url:'/assets/demo/summary.NEW.js',revision:'two'}}]
    record.doc={...record.doc};await settle()
    expect(created).toBe(2);expect(disposed).toBe(1);expect(element.querySelector('textarea').value).toBe('')
    record.doc={doctype:'CRM Organization',name:'Same Name'};await settle()
    expect(created).toBe(3);expect(disposed).toBe(2)
  })
  it('shows discovery errors separately from empty content and retries',async()=>{
    fixture.discovery=async()=>{throw new Error('Discovery failed')}
    await open(Contact,{contactId:'Same Name'})
    expect(element.textContent).toContain('Discovery failed')
    expect(element.textContent).toContain('Deals')
    fixture.discovery=null
    const retry=[...element.querySelectorAll('button')].find(button=>button.textContent==='Retry')
    retry.click();await settle()
    expect(element.textContent).not.toContain('Discovery failed')
    expect(element.querySelector('section[data-crm-panel]')).not.toBeNull()
  })
  it('shows renderer loading and ignores late old-record factories',async()=>{
    const pending=[]
    let created=0
    fixture.rendererLoad=()=>new Promise(resolve=>pending.push(resolve))
    const record=reactive({doc:{doctype:'Contact',name:'Same Name'}})
    const Harness={setup(){const panels=useRecordPagePanels({record,scripts:{data:[]},nativeTabs:[{name:'native:Details',label:'Details'}],context:{router:{}}});return ()=>h(RecordPagePanels,{groups:panels.groups.value})}}
    await open(Harness,{})
    expect(element.textContent).toContain('Loading panel')
    record.doc={doctype:'CRM Organization',name:'Same Name'};await settle()
    const factory=runtime=>({props:['context'],setup(props){created++;return ()=>runtime.h('p',props.context.doctype)}})
    pending[1](factory);await settle()
    pending[0](factory);await settle()
    expect(created).toBe(1)
    expect(element.textContent).toContain('CRM Organization')
    expect(element.textContent).not.toContain('Contact')
  })
  it('invalidates pending discovery when the native resource clears its document',async()=>{
    const record=reactive({doc:{doctype:'Contact',name:'Same Name'}})
    let resolve
    fixture.discovery=context=>new Promise(done=>{resolve=()=>done({context,contributions:[appPanel('stale')],diagnostics:[]})})
    const Harness={setup(){const panels=useRecordPagePanels({record,scripts:{data:[]},nativeTabs:[{name:'native:Details',label:'Details'}],context:{router:{}}});return ()=>h(RecordPagePanels,{groups:panels.groups.value})}}
    await open(Harness,{})
    record.doc=null;await settle()
    resolve();await settle()
    expect(element.querySelector('section[data-crm-panel]')).toBeNull()
  })
  it('suppresses delayed old typed-record discovery and disposes on unmount',async()=>{
    const record=reactive({doc:{doctype:'Contact',name:'Same Name'},reload(){}})
    const pending=[]
    fixture.discovery=context=>new Promise(resolve=>pending.push({context,resolve}))
    const Harness={setup(){const panels=useRecordPagePanels({record,scripts:{data:[]},nativeTabs:[{name:'native:Details',label:'Details'}],context:{router:{}}});return ()=>h(RecordPagePanels,{groups:panels.groups.value})}}
    await open(Harness,{})
    record.doc={doctype:'CRM Organization',name:'Same Name'};await settle()
    pending[1].resolve({context:pending[1].context,contributions:[appPanel('current')],diagnostics:[]});await settle()
    pending[0].resolve({context:pending[0].context,contributions:[appPanel('stale')],diagnostics:[]});await settle()
    expect(element.querySelector('section[data-crm-panel]').dataset.crmPanel).toBe('current:summary')
    record.doc={doctype:'Contact',name:'Other'};await settle()
    app.unmount();app=null
    pending[2].resolve({context:pending[2].context,contributions:[appPanel('late')],diagnostics:[]});await settle()
    expect(element.querySelector('section')).toBeNull()
  })
})

// Native rendering remains unchanged; the application owns authorised typed reads.
describe('native relationship activity resource', () => {
  it('updates both slot contexts when a mounted adapter replaces its document after reload', async () => {
    const adapter=reactive({
      doc:{name:'Same Name',full_name:'Before reload'},
      resource:{data:{versions:[],calls:[],notes:[],tasks:[],attachments:[]},loading:false,reload:vi.fn()},
      actions:{},
    })
    await open({render:()=>h(Activities,{doctype:'Contact',docname:'Same Name',tabs:[{name:'Activity'}],adapter},{
      header:({doc})=>h('div',`Header: ${doc.full_name}`),
      composer:({doc})=>h('div',`Composer: ${doc.full_name}`),
    })},{})
    expect(element.textContent).toContain('Header: Before reload')
    adapter.doc={name:'Same Name',full_name:'After reload'}
    await settle()
    expect(element.textContent).toContain('Header: After reload')
    expect(element.textContent).toContain('Composer: After reload')
    expect(element.textContent).not.toContain('Before reload')
  })
  it('renders native versions separately from Notes and Tasks and loads older entries', async () => {
    const loadMore = vi.fn()
    const resource = reactive({
      data:{
        versions:[{name:'Creation',activity_type:'creation',creation:'2026-10-02 10:00:00',owner:'Staff',data:'created this contact'}],
        calls:[],notes:[{title:'A separate Note'}],tasks:[{title:'A separate Task'}],attachments:[],
      },
      loading:false,error:null,reload:vi.fn(),hasMore:true,loadMore,
    })
    loadMore.mockImplementation(() => {
      resource.data.versions.push({name:'Older change',activity_type:'changed',creation:'2026-10-01 10:00:00',owner:'Staff',data:{field:'company_name',field_label:'Organisation',old_value:'Earlier employer',value:'Current employer'}})
      resource.hasMore=false
    })
    fixture.requests=[]
    await open({render:()=>h(Activities,{
      doctype:'Contact',docname:'Same Name',tabs:[{name:'Activity'}],
      adapter:{resource,doc:{name:'Same Name',full_name:'Person'},actions:{}},
    },{
      header:({doc,method})=>h('div',`${doc.full_name}: ${method}`),
      composer:()=>h('div','Relationship composer'),
    })},{})
    expect(element.textContent).toContain('Person: Activity')
    expect(element.textContent).toContain('created this contact')
    expect(element.textContent).toContain('Relationship composer')
    expect(element.textContent).not.toContain('A separate Note')
    expect(element.textContent).not.toContain('A separate Task')
    expect(fixture.requests).not.toContain('crm.api.activities.get_activities')
    const more=[...element.querySelectorAll('button')].find(button=>button.textContent==='Load more')
    expect(more).toBeDefined()
    more.click(); await settle()
    expect(loadMore).toHaveBeenCalledOnce()
    expect(element.textContent).toContain('Earlier employer')
    expect(element.textContent).toContain('Current employer')
    expect([...element.querySelectorAll('button')].some(button=>button.textContent==='Load more')).toBe(false)
  })
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
  async function openCall(editorDefaults, method, getCallEditorDefaults) {
    fixture.callLog=reactive({
      name:'Native Call',id:'Native Call',type:'Outgoing',status:'Completed',duration:90,_duration:'1m 30s',
      creation:'2026-10-02 10:00:00',caller:'Staff',receiver:'Person',
      _caller:{label:'Staff'},_receiver:{label:'Person'},_notes:[],_tasks:[],activity_type:'outgoing_call',
    })
    const adapter={
      doc:{name:'Viewed source'},
      resource:{data:{versions:[],calls:[fixture.callLog],notes:[],tasks:[],attachments:[]},reload:vi.fn()},
      actions:{},getCallEditorDefaults,
    }
    await open({render:()=>method
      ? h(Activities,{doctype:'Other Record',docname:'Viewed source',tabs:[{name:method}],adapter})
      : h(CallArea,{activity:fixture.callLog,...(editorDefaults ? {editorDefaults} : {})})},{})
    element.querySelector('.border.cursor-pointer').click()
    await settle()
    expect(document.body.textContent).toContain('Call Details')
  }
  async function callAction(label) {
    const dialog=[...document.body.querySelectorAll('[role="dialog"]')]
      .find(dialog=>dialog.textContent.includes('Call Details'))
    dialog.querySelector('button[aria-haspopup="menu"]').click()
    await settle()
    const action=[...document.body.querySelectorAll('[role="menuitem"]')]
      .find(item=>item.textContent.trim()===label)
    expect(action).toBeDefined()
    action.click()
    await settle()
  }
  it.each([['Note',0],['Task',0],['Note',8],['Task',8]])('completes native Call %s creation callbacks with %s initialized onboarding steps',async(type,count)=>{
    fixture.onboardingCount=count
    fixture.onboardingUpdates=[]
    fixture.callMutations=[]
    fixture.callReload=vi.fn()
    try {
      await openCall({reference_doctype:'Other Record',reference_docname:'Recorded source'})
      await callAction(`Add ${type}`)
      fixture.callReload.mockClear()
      useDoctypeModal().triggerCallback('afterInsert',{name:'New source'})
      await settle()
      expect(fixture.callMutations).toEqual([{
        method:`crm.integrations.api.add_${type.toLowerCase()}_to_call_log`,
        context:{call_sid:'Native Call',[type.toLowerCase()]:{name:'New source'}},
      }])
      expect(fixture.callReload).toHaveBeenCalled()
      expect(fixture.onboardingUpdates).toEqual(count ? [`create_first_${type.toLowerCase()}`] : [])
    } finally {
      fixture.onboardingCount=undefined
      fixture.callMutations=null
      fixture.callReload=null
      fixture.onboardingUpdates=null
    }
  })
  it('passes caller creation defaults through the native Call card to Note and Task editors without changing existing sources', async () => {
    const defaults={reference_doctype:'Other Record',reference_docname:'Source/with spaces',custom_context:'opaque',status:'Todo',priority:'High'}
    await openCall(defaults)
    await callAction('Add Note')
    const modal=useDoctypeModal()
    expect(modal.doctype.value).toBe('FCRM Note')
    expect(modal.name.value).toBeNull()
    expect(modal.defaults.value).toEqual(defaults)
    expect(toRaw(modal.defaults.value)).not.toBe(defaults)
    modal.show.value=false
    await settle()
    await callAction('Add Task')
    expect(modal.doctype.value).toBe('CRM Task')
    expect(modal.defaults.value).toEqual(defaults)
    modal.show.value=false
    await settle()
    fixture.callLog._notes=[{name:'Existing Note',title:'Existing note content'}]
    fixture.documents.set('FCRM Note:Existing Note',reactive({doc:{doctype:'FCRM Note',name:'Existing Note',title:'Existing note content'},save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}}))
    await settle()
    await callAction('Edit Note')
    expect(modal.name.value).toBe('Existing Note')
    expect(modal.defaults.value).toEqual({})
    modal.show.value=false
    await settle()
    fixture.callLog._tasks=[{name:171,title:'Existing Task content'}]
    fixture.documents.set('CRM Task:171',reactive({doc:{doctype:'CRM Task',name:171,title:'Existing Task content'},save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}}))
    await settle()
    await callAction('Edit Task')
    expect(modal.name.value).toBe(171)
    expect(modal.defaults.value).toEqual({status:'Backlog',priority:'Low'})
    expect(defaults.reference_docname).toBe('Source/with spaces')
  })
  it('preserves ordinary Call editor defaults when no creation context is supplied', async () => {
    await openCall()
    await callAction('Add Note')
    const modal=useDoctypeModal()
    expect(modal.defaults.value).toEqual({})
    modal.show.value=false
    await settle()
    await callAction('Add Task')
    expect(modal.defaults.value).toEqual({status:'Backlog',priority:'Low'})
  })
  it.each(['Calls','Activity'])('passes per-source adapter editor defaults through mounted %s calls without changing existing linked sources', async (method) => {
    const defaults={reference_doctype:'Other Record',reference_docname:'Native Call',custom_context:'opaque'}
    const getCallEditorDefaults=vi.fn(call=>({...defaults,reference_docname:call.name}))
    await openCall(undefined,method,getCallEditorDefaults)
    await callAction('Add Note')
    const modal=useDoctypeModal()
    expect(getCallEditorDefaults).toHaveBeenCalledWith(expect.objectContaining({name:'Native Call'}))
    expect(modal.defaults.value).toEqual(defaults)
    modal.show.value=false
    await settle()
    await callAction('Add Task')
    expect(modal.defaults.value).toEqual({status:'Backlog',priority:'Low',...defaults})
    modal.show.value=false
    await settle()
    fixture.callLog._notes=[{name:'Existing adapter Note',title:'Existing linked content'}]
    fixture.documents.set('FCRM Note:Existing adapter Note',reactive({doc:{doctype:'FCRM Note',name:'Existing adapter Note',title:'Existing linked content'},save:{submit:vi.fn()},actions:[],fieldPropertyOverrides:{}}))
    await settle()
    await callAction('Edit Note')
    expect(modal.name.value).toBe('Existing adapter Note')
    expect(modal.defaults.value).toEqual({})
  })
  it('honors independent native Task card controls while preserving default workflow actions', async () => {
    const task={name:171,title:'Shared Task title',assigned_to:'staff@example.test',priority:'Medium',status:'Todo'}
    const actions={showTask:vi.fn(),updateTaskStatus:vi.fn(),deleteTask:vi.fn()}
    const capabilities=reactive({canDelete:false,canUpdateStatus:false})
    await open({render:()=>h(TaskArea,{tasks:[task],modalRef:actions,...capabilities})},{})
    expect(element.textContent).toContain('Shared Task title')
    expect(element.querySelectorAll('button')).toHaveLength(0)
    capabilities.canUpdateStatus=true
    await settle()
    expect(element.querySelectorAll('button')).toHaveLength(1)
    element.querySelector('button').click()
    await settle()
    const progress=[...document.body.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent.trim()==='In Progress')
    expect(progress).toBeDefined()
    progress.click()
    await settle()
    expect(actions.updateTaskStatus).toHaveBeenCalledWith('In Progress',task)
    expect(actions.showTask).not.toHaveBeenCalled()
    expect(actions.deleteTask).not.toHaveBeenCalled()
    capabilities.canUpdateStatus=false
    capabilities.canDelete=true
    await settle()
    expect(element.querySelectorAll('button')).toHaveLength(1)
    capabilities.canDelete=undefined
    capabilities.canUpdateStatus=undefined
    await settle()
    expect(element.querySelectorAll('button')).toHaveLength(2)
    element.querySelector('.activity').click()
    expect(actions.showTask).toHaveBeenCalledWith(task)
  })
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

describe('shared Form Script compatibility', () => {
  for (const [doctype,routeName,param] of [['CRM Lead','Lead','leadId'],['CRM Deal','Deal','dealId']]) {
    it(`preserves independent actions, status options and source navigation for ${doctype}`, async () => {
      const router={push:vi.fn()}
      const result=await setupCustomizations([
        {script:`function setupForm({doc,router}) { return {actions:[{label:'Open source',onClick:()=>router.push({name:'${routeName}',params:{${param}:doc.name}})}],statuses:[{label:'First status'}]} }`},
        {script:"function setupForm() { return {actions:[{label:'Other action'}],statuses:[{label:'Other status'}]} }"},
      ],{doc:{doctype,name:'Sales record'},router})
      expect(result.actions.map(action=>action.label)).toEqual(['Open source','Other action'])
      expect(result.statuses.map(status=>status.label)).toEqual(['First status','Other status'])
      result.actions[0].onClick()
      expect(router.push).toHaveBeenCalledWith({name:routeName,params:{[param]:'Sales record'}})
    })
  }
  it('keeps independent header actions available when an optional activity contribution is invalid', async () => {
    const result=await setupCustomizations([
      {script:"function setupForm() { return {actions:[{label:'Existing action'}],statuses:[{label:'Existing status'}]} }"},
      {script:"function setupForm() { return {relationshipActivity:{version:99}} }"},
    ],{doc:{doctype:'CRM Organization',name:'Organisation'}})
    expect(result.actions.map(action=>action.label)).toEqual(['Existing action'])
    expect(result.statuses.map(status=>status.label)).toEqual(['Existing status'])
  })
})

describe('native sales activity defaults', () => {
  for (const doctype of ['CRM Lead','CRM Deal']) {
    it(`keeps the default resource and native note creation context for ${doctype}`, async () => {
      fixture.requestOptions=[]
      await open({render:()=>h(Activities,{doctype,docname:'Sales record',tabs:[{name:'Notes'}]})},{})
      const requests=fixture.requestOptions.filter(options=>options.url==='crm.api.activities.get_activities')
      expect(requests).toHaveLength(1)
      expect(requests[0].params).toEqual({name:'Sales record'})
      expect(requests[0].cache).toEqual(['activity','Sales record'])
      expect(element.textContent).toContain('No Notes Found')
      const create=[...element.querySelectorAll('button')].find(button=>button.textContent==='New Note')
      create.click(); await settle()
      expect(document.body.textContent).toContain('Create Note')
      expect(useDoctypeModal().defaults.value).toEqual({reference_doctype:doctype,reference_docname:'Sales record'})
      expect(useDoctypeModal().readOnly.value).toBe(false)
      expect(document.body.querySelector('[contenteditable="true"]')).not.toBeNull()
    })
  }
})


describe('native record panel file controls', () => {
  it('submits the native private upload and custom parameters from the shared runtime', async () => {
    const sent = []
    class UploadRequest {
      static DONE = 4
      upload = { addEventListener() {} }
      addEventListener() {}
      open(...args) { this.openArgs = args }
      setRequestHeader() {}
      send(body) {
        sent.push({ open: this.openArgs, body })
        this.readyState = 4
        this.status = 200
        this.responseText = JSON.stringify({message:{name:'native-file',file_name:'private.txt',is_private:1}})
        this.onreadystatechange()
      }
    }
    vi.stubGlobal('XMLHttpRequest', UploadRequest)
    let runtime
    fixture.rendererFactory = value => {
      runtime = value
      return { render: () => h('div', 'Native upload control') }
    }
    await open(Organization,{organizationId:'Upload record'})
    const uploader = runtime.useFileUpload()
    const result = await uploader.upload(new File(['private bytes'],'private.txt'), {
      private:true,doctype:'CRM Organization',docname:'Upload record',
      method:'example.upload',params:{context:'chosen context'},
    })
    expect(result).toEqual({name:'native-file',file_name:'private.txt',is_private:1})
    expect(sent).toHaveLength(1)
    expect(sent[0].open).toEqual(['POST','/api/method/upload_file',true])
    expect(sent[0].body.get('file').name).toBe('private.txt')
    for (const [name,value] of Object.entries({is_private:'1',doctype:'CRM Organization',docname:'Upload record',method:'example.upload',context:'chosen context'})) {
      expect(sent[0].body.get(name)).toBe(value)
    }
    expect(uploader.isUploading.value).toBe(false)
  })
  it('opens the existing native form dialog from a panel and returns editable transient context', async () => {
    let runtime
    fixture.rendererFactory = value => {
      runtime=value
      return { render: () => h('div', 'Native context dialog') }
    }
    await open(Organization,{organizationId:'Dialog record'})
    const submitted = vi.fn()
    const result = runtime.formDialog({
      title:'Upload context',fields:[{fieldname:'context',fieldtype:'Data',label:'Context',visible:true}],
      defaults:{context:'original context'},submitLabel:'Choose File',onSubmit:submitted,
    })
    await settle()
    const input = document.body.querySelector('input[placeholder="Context"]')
    expect(input.value).toBe('original context')
    input.value='chosen context'
    input.dispatchEvent(new Event('change',{bubbles:true}))
    await settle()
    ;[...document.body.querySelectorAll('button')].find(button=>button.textContent==='Choose File').click()
    await expect(result).resolves.toEqual({context:'chosen context'})
    expect(submitted).toHaveBeenCalledWith({context:'chosen context'})
    expect(fixture.documents.has(':')).toBe(false)
  })
  it('honors optional attachment capabilities while preserving default native controls', async () => {
    const attachment={name:'private-file',file_name:'private.txt',file_url:'/private/files/private.txt',file_type:'txt',file_size:12,is_private:1,creation:'2026-10-02 12:00:00'}
    const capabilities=reactive({canDelete:false,canTogglePrivacy:false})
    await open({render:()=>h(AttachmentArea,{attachments:[attachment],...capabilities})},{})
    expect(element.textContent).toContain('private.txt')
    expect(element.querySelector('.lucide-trash-2')).toBeNull()
    expect(element.querySelector('[data-feather="lock"]')).toBeNull()
    expect(element.querySelectorAll('button')).toHaveLength(0)
    capabilities.canDelete=undefined
    capabilities.canTogglePrivacy=undefined
    await settle()
    expect(element.querySelector('.lucide-trash-2')).not.toBeNull()
    expect(element.querySelectorAll('button')).toHaveLength(2)
  })
})
