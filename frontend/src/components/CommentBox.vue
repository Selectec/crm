<template>
  <Editor
    ref="commentEditor"
    v-model="content"
    :extensions="extensions"
    :placeholder="placeholder"
    :editable="editable"
    :upload-function="uploadFunction || ((file) => uploadFile(file, doctype, modelValue.name))"
  >
    <div class="relative w-full">
      <EditorContent
        :class="[
          'prose-sm max-w-none',
          editable &&
            'mx-4 max-h-[50vh] min-h-[7rem] overflow-y-auto border-t py-3',
        ]"
      />
      <EditorTableMenu />
      <div v-if="editable" class="flex flex-col gap-2">
        <div class="flex flex-wrap gap-2 px-4">
          <AttachmentItem
            v-for="a in attachments"
            :key="a.file_url"
            :label="a.file_name"
          >
            <template #suffix>
              <span
                class="lucide-x h-3.5"
                aria-hidden="true"
                @click.stop="removeAttachment(a)"
              />
            </template>
          </AttachmentItem>
        </div>
        <ErrorMessage v-if="attachmentUploadError" class="px-4" :message="attachmentUploadError" />
        <div
          class="flex justify-between gap-2 overflow-hidden border-t px-4 py-2.5"
        >
          <div class="flex gap-1 items-center overflow-x-auto">
            <template v-if="uploadFunction">
              <input
                ref="attachmentInput"
                type="file"
                class="hidden"
                multiple
                @change="uploadAttachments"
              />
              <Button
                :tooltip="__('Attach a File')"
                variant="ghost"
                :icon="AttachmentIcon"
                :loading="uploadingAttachment"
                @click="attachmentInput.click()"
              />
            </template>
            <FileUploader
              v-else
              :upload-args="{
                doctype: doctype,
                docname: modelValue.name,
                private: true,
              }"
              @success="(f) => attachments.push(f)"
            >
              <template #default="{ openFileSelector }">
                <Button
                  :tooltip="__('Attach a File')"
                  variant="ghost"
                  :icon="AttachmentIcon"
                  @click="openFileSelector()"
                />
              </template>
            </FileUploader>
            <EditorFixedMenu :items="fullToolbar" />
            <IconPicker
              v-slot="{ togglePopover }"
              v-model="emoji"
              @update:modelValue="() => appendEmoji()"
            >
              <Button
                :tooltip="__('Insert Emoji')"
                :icon="SmileIcon"
                variant="ghost"
                @click="togglePopover()"
              />
            </IconPicker>
          </div>
          <div class="mt-2 flex items-center justify-end space-x-2 sm:mt-0">
            <Button v-bind="discardButtonProps || {}" :label="__('Discard')" />
            <Button
              variant="solid"
              v-bind="submitButtonProps || {}"
              :label="`${__('Comment')} (${submitShortcutLabel})`"
            />
          </div>
        </div>
      </div>
    </div>
  </Editor>
</template>
<script setup>
import IconPicker from '@/components/IconPicker.vue'
import SmileIcon from '@/components/Icons/SmileIcon.vue'
import AttachmentIcon from '@/components/Icons/AttachmentIcon.vue'
import AttachmentItem from '@/components/AttachmentItem.vue'
import {
  buildEditorExtensions,
  fullToolbar,
  uploadFile,
} from '@/components/editor/config'
import { submitShortcutLabel } from '@/utils'
import { usersStore } from '@/stores/users'
import { useTelemetry } from 'frappe-ui/frappe'
import { ErrorMessage, FileUploader } from 'frappe-ui'
import {
  Editor,
  EditorContent,
  EditorFixedMenu,
  EditorTableMenu,
} from 'frappe-ui/editor'
import { ref, computed } from 'vue'

const props = defineProps({
  uploadFunction: { type: Function, default: null },
  placeholder: { type: String, default: null },
  editable: { type: Boolean, default: true },
  doctype: { type: String, default: 'CRM Lead' },
  editorProps: { type: Object, default: () => ({}) },
  submitButtonProps: { type: Object, default: () => ({}) },
  discardButtonProps: { type: Object, default: () => ({}) },
})

const modelValue = defineModel({ type: Object })
const attachments = defineModel('attachments', {
  type: Array,
  default: () => [],
})
const content = defineModel('content', { type: String, default: '' })

const { users: usersList } = usersStore()
const { capture } = useTelemetry()

const attachmentInput = ref(null)
const uploadingAttachment = ref(false)
const attachmentUploadError = ref('')

async function uploadAttachments(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length || uploadingAttachment.value) return
  uploadingAttachment.value = true
  attachmentUploadError.value = ''
  try {
    for (const file of files) {
      attachments.value.push(await props.uploadFunction(file))
    }
  } catch (error) {
    attachmentUploadError.value = error?.message || __('Could not upload attachment')
  } finally {
    uploadingAttachment.value = false
  }
}

const commentEditor = ref(null)
const emoji = ref('')

const editor = computed(() => commentEditor.value?.editor)

const users = computed(
  () =>
    usersList.data?.crmUsers
      ?.filter((user) => user.enabled)
      .map((user) => ({
        id: user.name,
        label: user.full_name?.trim() || user.name,
      })) || [],
)

const extensions = buildEditorExtensions({ mentions: () => users.value })

function appendEmoji() {
  editor.value.commands.insertContent(emoji.value)
  editor.value.commands.focus()
  emoji.value = ''
  capture('emoji_inserted_in_comment', { emoji: emoji.value })
}

function removeAttachment(attachment) {
  attachments.value = attachments.value.filter((a) => a !== attachment)
}

defineExpose({ editor })
</script>
