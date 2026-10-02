import { computed, markRaw, ref, watch } from 'vue'
import { setupCustomizations } from '@/utils'
import { useRelationshipUI } from '@/components/Activities/relationshipUI'

/** Compose one app-owned activity area with a native relationship page. */
export function useRelationshipActivity({ record, scripts, nativeTabs, context }) {
  const activity = ref(null)
  const error = ref('')
  const tabIndex = ref(0)
  const relationshipUI = useRelationshipUI(context.router)
  const tabs = computed(() => [...(activity.value?.tabs || []), ...nativeTabs])
  const isActivityTab = (tab) => Boolean(activity.value?.tabs.some((method) => method.name === tab.name))

  function changeTab(name) {
    const index = tabs.value.findIndex((tab) => tab.name === name)
    if (index >= 0) tabIndex.value = index
  }

  let generation = 0
  let componentOwner = ''
  watch(
    [() => record.doc, () => scripts.data],
    async ([doc, registrations]) => {
      if (!doc || !registrations) return
      const current = ++generation
      try {
        const customization = await setupCustomizations(registrations, {
          ...context,
          doc,
          relationshipUI,
        })
        if (current !== generation) return
        record._actions = customization.actions || []
        const initial = !activity.value
        const owner = JSON.stringify([
          doc.doctype,
          doc.name,
          registrations.map(({ name, script }) => [name, script]),
        ])
        const contribution = customization.relationshipActivity
        // Refresh descriptors/actions, retaining drafts while their owner is unchanged.
        activity.value = contribution
          ? markRaw({
              ...contribution,
              component: activity.value && componentOwner === owner
                ? activity.value.component
                : contribution.component,
            })
          : null
        componentOwner = contribution ? owner : ''
        error.value = customization.relationshipActivityError || ''
        if (initial && activity.value) changeTab(activity.value.initialTab)
      } catch (failure) {
        if (current === generation) {
          error.value = failure.message || __('Could not load relationship activity.')
        }
      }
    },
    { immediate: true },
  )
  return { activity, error, tabs, tabIndex, changeTab, isActivityTab }
}
