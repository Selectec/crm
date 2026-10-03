import { h, ref, computed, watch, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { Button, ErrorMessage, TextEditor, createResource, call, toast, useFileUpload } from 'frappe-ui'
import { renderFieldLayoutDialog } from '@/utils/renderFieldLayoutDialog'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { createRecordRealtime } from '@/utils/recordRealtime'

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
  CommentArea: defineAsyncComponent(() => import('./CommentArea.vue')),
  AttachmentArea: defineAsyncComponent(() => import('./AttachmentArea.vue')),
}

export function useRecordPanelRuntime(router, socket) {
  const { showModal } = useDoctypeModal()
  const realtime = createRecordRealtime(socket, onUnmounted)
  return { version: 1, h, ref, computed, watch, onMounted, onUnmounted, createResource, call, toast, useFileUpload, formDialog: renderFieldLayoutDialog, router, showModal, native, realtime, vue: Object.freeze({ h, ref, computed, watch, onMounted, onUnmounted }), translate: window.__, __: window.__ }
}
