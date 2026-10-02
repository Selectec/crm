# Relationship activity page contributions

This versioned frontend contract allows an installed application to contribute
activity methods on existing desktop and mobile Organization and Contact pages. It does not change
native activity storage or grant access to any record. The application must use
authorised, typed backend operations and native source records.

Register an application-owned enabled `CRM Form Script` for each target DocType,
using its normal install/migrate lifecycle. `setupForm` receives the record and
`relationshipUI`, and may return one optional contribution:

```js
function setupForm({ doc, relationshipUI }) {
  const { h, showModal, native } = relationshipUI
  return {
    actions: [],
    relationshipActivity: {
      version: 1,
      initialTab: 'Activity',
      tabs: [
        { name: 'Activity', label: 'Activity' },
        { name: 'Notes', label: 'Notes' },
      ],
      component: {
        props: ['doctype', 'docname', 'doc', 'method', 'tabs', 'changeTab'],
        setup(props) {
          // Render the application's typed activity service results using native
          // components. Launch the native editor with showModal({doctype, name,
          // defaults, callbacks}); keep source permissions in the backend.
          return () => h('div', props.method)
        },
      },
    },
  }
}
```

The example demonstrates the registration shape, not an implemented activity
service. Only implemented methods should be registered. Contributed methods use
the existing native Tabs row, before existing related-record navigation. Their
component receives the full record type/name, current record, selected method,
methods and a public `changeTab(name)` function. No outer activity tab is added.
No contribution retains the native record layout. Conflicting contributions or
malformed descriptors produce an explicit error; one activity area has one owner.

`relationshipUI` version 1 uses CRM's Vue instance and provides `h`, `ref`,
`computed`, `watch`, `onMounted`, `onUnmounted`, `createResource`, `call`, `toast`,
`router`, `showModal` and `native`. The native registry exports Button,
ErrorMessage, TextEditor, Activities, NoteArea, TaskArea, CallArea, EmailEditor,
CommentBox and AttachmentArea. Component APIs remain those of the pinned CRM.
The registry loads native components on demand. An application can register
maintained JavaScript render-component source through its managed Form Script;
no second Vue bundle, private application instance or hashed-chunk import is
needed. Template strings are not compiled by this runtime.

Removing an application's script removes its UI contribution. It must not delete
native source records. Independent existing scripts and header actions remain
registered through the existing CRM mechanism.

## Verification boundary

`tests/integration/relationshipPages.test.js` mounts the actual desktop and mobile Organization and
Contact page templates, native frappe-ui Tabs, production setupCustomizations
engine and native DoctypeModals/DoctypeModal/FieldLayout. It checks one row,
initial Activity, retained related tabs, pointer/keyboard Notes selection and
native note editor mounting with complete typed reference defaults. Documents,
resources, system stores and unrelated sidebar/list shells are faked. It does
not prove site registration, native persistence, permissions, email delivery or
browser responsiveness.

Run from the CRM frontend with its normal dependencies installed:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.relationship.config.js
```

`CRM_BENCH_APPS` can locate the installed Bench apps for framework source. In an
isolated worktree, a node_modules link to the installed CRM frontend also locates
those apps. `RELATIONSHIP_BASELINE=1` tests the same journeys against the installed
CRM page files: only use it while those files are the unchanged upstream pin.

On 2 October 2026 the WSL implementation coordinator ran the container checks
against CRM 1.81.2 (`49d98d61`). Untouched desktop pages failed the two requested
method-tab journeys and passed the existing-layout journey; the changed pages
passed all three. The unchanged mobile routes separately failed the two missing-
method journeys; after adding the same host seam, all five desktop/mobile journeys
passed, including the retained native mobile information pane. The versioned-
contribution unit check also passed. A shared composable owns registration for
all four hosts. The typed Activities resource/action adapter remains a subsequent
step; these checks are a bounded embedding proof, not #190 acceptance.
