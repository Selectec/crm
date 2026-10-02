import { computed, markRaw, onUnmounted, reactive, ref, watch } from 'vue'
import { setupCustomizations } from '@/utils'
import { useRecordPanelRuntime } from '@/components/Activities/recordPanelRuntime'
import { getPanelRegistry } from '@/utils/recordPanelRegistry'

/** Generic installed-app panels; each contribution keeps one mounted group. */
export function useRecordPagePanels({ record, scripts, nativeTabs, context }) {
  const groups = ref([])
  const error = ref('')
  const diagnostics = ref([])
  const loading = ref(false)
  const tabIndex = ref(0)
  const ui = useRecordPanelRuntime(context.router)
  const runtime = Object.freeze(ui)
  const registry = getPanelRegistry()
  const tabs = computed(() => [...groups.value.flatMap(group => group.descriptor.panels), ...nativeTabs])
  const selected = computed(() => tabs.value[tabIndex.value]?.name)
  const isPanelTab = tab => groups.value.some(group => group.descriptor.panels.some(panel => panel.name === tab.name))
  const panelSelected = computed(() => isPanelTab(tabs.value[tabIndex.value] || {}))
  function selectPanel(name) {
    const index = tabs.value.findIndex(panel => panel.name === name)
    if (index >= 0) tabIndex.value = index
  }
  function updateContexts() {
    for (const group of groups.value) {
      const panel = group.descriptor.panels.find(panel => panel.name === selected.value)
      group.context.active = Boolean(panel)
      if (panel) group.context.panel = panel.id
      group.context.doc = record.doc
    }
  }
  watch(selected, updateContexts)
  let generation = 0
  let typedOwner = ''
  let disposed = false
  onUnmounted(() => { disposed = true; generation++ })
  async function discover(doc = record.doc) {
    if (!doc?.doctype || !doc?.name) return
    const current = ++generation
    const typed = JSON.stringify([doc.doctype, doc.name])
    const changed = typed !== typedOwner
    const previousSelection = selected.value
    if (changed) { groups.value = []; typedOwner = typed }
    loading.value = true
    error.value = ''
    try {
      const result = await ui.call('crm.api.record_page.get_panels', { doctype: doc.doctype, name: doc.name })
      if (disposed || current !== generation) return
      if (result.context?.doctype !== doc.doctype || result.context?.name !== doc.name) throw new Error('Record-page discovery returned a different record')
      diagnostics.value = result.diagnostics || []
      registry.approve(result.contributions)
      groups.value = result.contributions.map(descriptor => {
        const owner = JSON.stringify([typed, descriptor.key, descriptor.renderer, descriptor.version, descriptor.js, descriptor.css])
        const existing = groups.value.find(group => group.owner === owner)
        if (existing) { existing.descriptor = descriptor; existing.context.panels = descriptor.panels; return existing }
        const live = reactive({ doctype: doc.doctype, name: doc.name, doc, panel: descriptor.default_panel || descriptor.panels[0].id, panels: descriptor.panels, active: false,
          selectPanel: local => selectPanel(`${descriptor.key}:${local}`), refreshRecord: () => record.reload?.() })
        return reactive({ owner, descriptor, context: live, component: null, error: '', loading: true })
      })
      const defaults = groups.value.find(group => group.descriptor.default_panel)
      const fallback = nativeTabs[0]?.name
      selectPanel(!changed && tabs.value.some(panel => panel.name === previousSelection) ? previousSelection : changed && defaults ? `${defaults.descriptor.key}:${defaults.descriptor.default_panel}` : fallback)
      updateContexts()
      await Promise.all(groups.value.map(async group => {
        if (group.component) return
        try {
          const factory = await registry.load(group.descriptor)
          if (disposed || current !== generation) return
          const component = factory(runtime)
          if (!component || (typeof component !== 'object' && typeof component !== 'function')) throw new Error('Renderer factory did not return a component')
          group.component = markRaw(component)
          group.error = ''
        } catch (failure) {
          if (!disposed && current === generation) group.error = failure.message || 'Could not load record-page renderer'
        } finally {
          if (!disposed && current === generation) group.loading = false
        }
      }))
    } catch (failure) {
      if (!disposed && current === generation) error.value = failure.message || 'Could not discover record-page panels'
    } finally {
      if (!disposed && current === generation) loading.value = false
    }
  }
  watch(() => record.doc, doc => { updateContexts(); discover(doc) }, { immediate: true })
  let scriptGeneration = 0
  watch([() => record.doc, () => scripts.data], async ([doc, registrations]) => {
    if (!doc || !registrations) return
    const current = ++scriptGeneration
    const customization = await setupCustomizations(registrations, { ...context, doc })
    if (!disposed && current === scriptGeneration) record._actions = customization.actions || []
  }, { immediate: true })
  return { groups, error, diagnostics, loading, tabs, tabIndex, panelSelected, isPanelTab, selectPanel, retry: () => discover() }
}
