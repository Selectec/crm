import { h, ref, computed, watch, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { Button, ErrorMessage, TextEditor, createResource, call, toast } from 'frappe-ui'
import { useDoctypeModal } from '@/composables/doctypeModal'

// Components use the hosting CRM runtime; consumers must not bundle another Vue.
const native = {
  Button,
  ErrorMessage,
  TextEditor,
  Activities: defineAsyncComponent(() => import('./Activities.vue')),
  NoteArea: defineAsyncComponent(() => import('./NoteArea.vue')),
  TaskArea: defineAsyncComponent(() => import('./TaskArea.vue')),
  CallArea: defineAsyncComponent(() => import('./CallArea.vue')),
  EmailEditor: defineAsyncComponent(() => import('@/components/EmailEditor.vue')),
  CommentBox: defineAsyncComponent(() => import('@/components/CommentBox.vue')),
  AttachmentArea: defineAsyncComponent(() => import('./AttachmentArea.vue')),
}

export function useRelationshipUI(router) {
  const { showModal } = useDoctypeModal()
  return { version: 1, h, ref, computed, watch, onMounted, onUnmounted, createResource, call, toast, router, showModal, native }
}
