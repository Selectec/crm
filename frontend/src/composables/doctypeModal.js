import { ref } from 'vue'

const show = ref(false)
const doctype = ref('')
const name = ref('')
const title = ref('')
const defaults = ref({})
const callbacks = ref({})
const readOnly = ref(false)

function showModal({
  name: _name = null,
  doctype: _doctype,
  title: _title = '',
  defaults: _defaults = {},
  callbacks: _callbacks = {},
  readOnly: _readOnly = false,
}) {
  name.value = _name
  doctype.value = _doctype
  title.value = _title
  defaults.value = _defaults
  callbacks.value = _callbacks
  readOnly.value = _readOnly
  show.value = true
}

function triggerCallback(event, ...args) {
  callbacks.value[event]?.(...args)
}

export function useDoctypeModal() {
  return {
    show,
    doctype,
    name,
    title,
    defaults,
    readOnly,
    showModal,
    triggerCallback,
  }
}
