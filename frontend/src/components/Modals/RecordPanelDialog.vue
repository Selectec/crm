<template>
  <Dialog :open="true" size="xl" bare @update:open="open => !open && close()">
    <template #default>
      <div class="bg-surface-elevation-1 p-5">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-2xl-semibold">{{ __(label) }}</h3>
          <Button :label="__('Close')" @click="close" />
        </div>
        <component :is="component" v-if="component" ref="renderer" :context="context" />
        <p v-else>{{ __('Loading...') }}</p>
        <ErrorMessage v-if="error" class="mt-2" :message="error" />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, markRaw, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Dialog, ErrorMessage } from 'frappe-ui'
import { globalStore } from '@/stores/global'
import { useRecordPanelRuntime } from '@/components/Activities/recordPanelRuntime'
import { getPanelRegistry } from '@/utils/recordPanelRegistry'

const props = defineProps({ entry: { type: Object, required: true } })
const entry = props.entry
const { $socket } = globalStore()
const runtime = useRecordPanelRuntime(useRouter(), $socket)
const registry = getPanelRegistry()
const component = ref(null), renderer = ref(null), error = ref(''), panel = ref(entry.panel)
let disposed = false
const label = computed(() => entry.descriptor.panels.find(item => item.id === panel.value)?.label || '')
const context = computed(() => ({
  ...entry.context, doc: entry.doc, panel: panel.value, panels: entry.descriptor.panels,
  active: true, presentation: 'dialog', refreshRecord: entry.refreshRecord,
  registerCloseGuard: entry.registerCloseGuard,
  selectPanel(id) {
    if (!entry.descriptor.panels.some(item => item.id === id)) throw new Error('Record dialog panel is not declared')
    panel.value = id
  },
}))
registry.approve([entry.descriptor], entry.key)
onMounted(async () => {
  try {
    const create = await registry.load(entry.descriptor)
    if (!disposed) component.value = markRaw(create(runtime))
  } catch (failure) { entry.fail(failure) }
})
watch(renderer, instance => { if (instance) entry.ready(instance) })
onUnmounted(() => {
  disposed = true
  registry.release(entry.key)
  entry.fail(new Error('Native record dialog host was removed'))
})
async function close() {
  if (!(await entry.close())) error.value = __('Finish or discard pending work before closing.')
}
</script>
