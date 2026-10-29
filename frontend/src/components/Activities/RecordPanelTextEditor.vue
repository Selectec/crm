<template>
  <RichTextField
    :content="content"
    :editable="editable"
    :editor-class="editorClass"
    :fixed-menu="false"
    :bubble-menu="false"
    @change="(value) => emit('change', value)"
  />
</template>

<script setup lang="ts">
import RichTextField from '@/components/RichTextField.vue'

// Preserve the contributor's content/viewer contract with CRM's native editor.
// The removed Frappe UI TextEditor must not bring a second editor engine back.
withDefaults(
  defineProps<{
    content?: string
    editable?: boolean
    editorClass?: string
  }>(),
  {
    content: '',
    editable: true,
    editorClass: '',
  },
)
const emit = defineEmits<{ change: [value: string] }>()
</script>
