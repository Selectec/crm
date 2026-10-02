<script setup>
import { Button, ErrorMessage } from 'frappe-ui'
defineProps({ groups: { type: Array, required: true } })
defineEmits(['retry'])
</script>
<template>
  <section v-for="group in groups" :key="group.owner" v-show="group.context.active" :data-crm-panel="group.descriptor.key" class="flex min-h-0 flex-1 flex-col overflow-auto" role="tabpanel" :aria-label="group.descriptor.panels.find(panel => panel.id === group.context.panel)?.label">
    <p v-if="group.loading" role="status">{{ __('Loading panel...') }}</p>
    <div v-else-if="group.error">
      <ErrorMessage :message="group.error" />
      <Button :label="__('Retry')" @click="$emit('retry')" />
    </div>
    <component v-else-if="group.component" :is="group.component" :context="group.context" />
  </section>
</template>
