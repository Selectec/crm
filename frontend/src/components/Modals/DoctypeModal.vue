<template>
  <Dialog v-model:open="show" :size="'xl'">
    <template #body>
      <div class="bg-surface-elevation-1 px-4 pb-6 pt-5 sm:px-6">
        <div class="mb-5 flex items-center justify-between">
          <div class="flex gap-2 items-center">
            <h3 class="text-3xl-semibold leading-6 text-ink-gray-9">
              {{
                readOnly
                  ? __('View ' + (doctypeTitle || doctype))
                  : editMode
                  ? __('Edit ' + (doctypeTitle || doctype))
                  : __('Create ' + (doctypeTitle || doctype))
              }}
            </h3>
          </div>
          <div class="flex items-center gap-1">
            <CustomActions
              v-if="(editorDoc ? editorActions : document.actions)?.length"
              :actions="editorDoc ? editorActions : document.actions"
              :close="() => (show = false)"
            />
            <Button
              v-if="!readOnly && isManager() && !isMobileView"
              variant="ghost"
              class="w-7"
              :tooltip="__('Edit Fields Layout')"
              :icon="EditIcon"
              @click="openQuickEntryModal"
            />
            <Button
              variant="ghost"
              class="w-7"
              icon="lucide-x"
              @click="show = false"
            />
          </div>
        </div>
        <div>
          <FieldLayout
            v-if="
              layout.data &&
              !initializing &&
              !loadFailed &&
              (!fullDocumentSave || !docname || editorDoc)
            "
            :tabs="layout.data"
            :data="doc"
            :doctype="doctype"
            :docname="docname"
            :readOnly="readOnly"
            :context="editorDoc ? editorContext : null"
          />
          <ErrorMessage v-if="error" class="mt-4" :message="__(error)" />
        </div>
      </div>
      <div v-if="!readOnly" class="px-4 pb-7 pt-4 sm:px-6">
        <div class="flex flex-row-reverse gap-2">
          <Button
            variant="solid"
            :label="editMode ? __('Update') : __('Create')"
            :loading="
              editMode
                ? fullDocumentSave
                  ? documentSave.loading
                  : document.save.loading
                : create.loading
            "
            :disabled="
              initializing ||
              loadFailed ||
              (fullDocumentSave && editMode && !editorDoc)
            "
            @click="editMode ? update() : create()"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import EditIcon from '@/components/Icons/EditIcon.vue'
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import CustomActions from '@/components/CustomActions.vue'
import { useDocument } from '@/data/document'
import { useAttachments } from '@/composables/useAttachments'
import { globalStore } from '@/stores/global'
import { usersStore } from '@/stores/users'
import { showQuickEntryModal, quickEntryProps } from '@/composables/modals'
import { isMobileView } from '@/composables/settings'
import { setupCustomizations } from '@/utils'
import { call, createResource, toast } from 'frappe-ui'
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  doctypeTitle: { type: String, default: '' },
  doctype: { type: String, default: '' },
  docname: { type: String, default: '' },
  defaults: { type: Object, default: () => ({}) },
  readOnly: { type: Boolean, default: false },
  fullDocumentSave: { type: Boolean, default: false },
})

const show = defineModel({ type: Boolean })

const emit = defineEmits(['afterInsert', 'afterUpdate'])

const router = useRouter()

const { isManager } = usersStore()
const { $dialog, $socket } = globalStore()
const { processPendingDeletions } = useAttachments(
  props.doctype,
  props.docname || null,
)

const {
  document,
  scripts,
  triggerOnRender,
  triggerOnBeforeCreate,
  setupFormScript,
  getControllers,
} = useDocument(props.doctype, props.docname || null)

const editor = useDocument(
  props.doctype,
  props.docname || null,
  {},
  reactive({ doc: null, actions: [], fieldPropertyOverrides: {}, fieldHtmlMap: {} }),
)
const editorDoc = computed({
  get: () => editor.document.doc,
  set: (value) => (editor.document.doc = value),
})
const doc = computed(() => editorDoc.value || document.doc || {})
const fullDocumentSave = ref(props.fullDocumentSave)
const readOnly = ref(props.readOnly)
const initializing = ref(Boolean(props.docname))
const loadFailed = ref(false)

const editorActions = computed(() => editor.document.actions)

const editorContext = {
  get fieldPropertyOverrides() {
    return editor.document.fieldPropertyOverrides || {}
  },
  get fieldHtmlMap() {
    return editor.document.fieldHtmlMap || {}
  },
  triggerOnChange: editor.triggerOnChange,
  triggerButton: editor.triggerButton,
  triggerOnRowAdd: editor.triggerOnRowAdd,
  triggerOnRowRemove: editor.triggerOnRowRemove,
}

const layout = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['Quick Entry', props.doctype],
  params: { doctype: props.doctype, type: 'Quick Entry' },
  auto: true,
})

const error = ref(null)
const editMode = computed(
  () => Boolean(document.doc?.name) || Boolean(props.docname),
)

const _create = createResource({
  url: 'frappe.client.insert',
  onSuccess: (d) => {
    document.doc = {}
    emit('afterInsert', d)
    show.value = false
  },
  onError: (err) => {
    if (err.exc_type == 'MandatoryError') {
      const fieldName = err.messages
        .map((msg) => {
          let arr = msg.split(': ')
          return arr[arr.length - 1].trim()
        })
        .join(', ')
      error.value = __('Mandatory field error: {0}', [fieldName])
      return
    }
    error.value = err.messages?.[0] || 'Could not create document'
  },
})

async function create() {
  if (readOnly.value) return
  await triggerOnBeforeCreate?.()

  _create.submit({
    doc: {
      doctype: props.doctype,
      ...document.doc,
    },
  })
}

const documentSave = createResource({
  url: 'frappe.client.save',
  onSuccess: async (d) => {
    document.doc = d
    editorDoc.value = JSON.parse(JSON.stringify(d))
    let hookFailed = false
    try {
      await editor.triggerOnSave?.()
    } catch (err) {
      hookFailed = true
      error.value =
        err.messages?.[0] || err.message || 'Could not complete save handler'
    }
    processPendingDeletions()
    emit('afterUpdate', d)
    if (!hookFailed) show.value = false
  },
  onError: async (err) => {
    error.value = err.messages?.[0] || err.message || 'Could not update document'
    try {
      await editor.triggerOnError?.()
    } catch (hookError) {
      error.value +=
        '\n' +
        (hookError.messages?.[0] ||
          hookError.message ||
          'Could not complete error handler')
    }
  },
})

async function update() {
  if (readOnly.value || initializing.value || loadFailed.value) return
  if (fullDocumentSave.value) {
    error.value = null
    try {
      await editor.triggerOnValidate?.()
      await documentSave.submit({ doc: { ...doc.value } })
    } catch (err) {
      error.value ||=
        err.messages?.[0] || err.message || 'Could not update document'
    }
    return
  }
  document.save.submit(null, {
    onSuccess: (d) => {
      emit('afterUpdate', d)
      show.value = false
    },
    onError: (err) => {
      error.value = err.messages?.[0] || 'Could not update document'
    },
  })
}

function openQuickEntryModal() {
  showQuickEntryModal.value = true
  quickEntryProps.value = { doctype: props.doctype }
  nextTick(() => (show.value = false))
}

watch(
  () => document.doc,
  async (_doc) => {
    if (scripts.data?.length) {
      setupCustomizations(scripts.data, {
        doc: _doc,
        $dialog,
        $socket,
        router,
        toast,
        call,
      })
    }
  },
  { once: true },
)

onMounted(async () => {
  try {
    if (props.docname) {
      await document.reload?.()
      await setupFormScript?.()
      const modalOptions = await Promise.all(
        (getControllers?.() || []).map(
          (controller) => controller.modalOptions || {},
        ),
      )
      fullDocumentSave.value ||= modalOptions.some(
        (options) => options?.fullDocumentSave === true,
      )
      readOnly.value ||= modalOptions.some(
        (options) => options?.readOnly === true,
      )
    }
    if (fullDocumentSave.value && props.docname) {
      // A local working copy keeps the loaded revision and unsent fields while
      // the shared resource continues to receive realtime changes.
      editorDoc.value = JSON.parse(
        JSON.stringify({ ...document.doc, ...props.defaults }),
      )
      await editor.setupFormScript?.()
      await editor.triggerOnRender?.()
    } else {
      document.doc = {
        ...document.doc,
        ...props.defaults,
      }
      await triggerOnRender()
    }
  } catch (err) {
    editorDoc.value = null
    loadFailed.value = true
    error.value = err.messages?.[0] || err.message || 'Could not load document'
  } finally {
    initializing.value = false
  }
})
</script>
