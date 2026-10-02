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
malformed descriptors produce an explicit error; independent existing header
actions and status options remain available. One activity area has one owner.
`Details`, `Deals` and `Contacts` are reserved native tab names; contributions
cannot shadow the existing information or related-record panes.

On a record reload, CRM refreshes the descriptor and header actions while keeping
the contributed component mounted for the same typed record and ordered Form
Script names/sources. Unsent composer state and component-owned resources survive
that reload. The component must read the current record through `props.doc`;
`setupForm`'s `doc` argument is a snapshot for that invocation. Changing the record
identity or registered script sources replaces the component; removing or
invalidating the contribution unmounts it.

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

## Native rendering and editor inputs

The owning application may render `native.Activities` with its existing
`doctype`, `docname`, `tabs` and `tabIndex` inputs and an optional
`adapter: { doc, resource, actions, reloadDoc }`. Give each mounted renderer a
stable resource for its complete record type/name identity. The application owns
authorised reads, cache identity, pagination, origin/association metadata and
write policy; CRM does not resolve relationship associations.

The resource supplies native presentation data:

- `data: { versions, calls, notes, tasks, attachments }`, using the existing
  native activity record shapes. Activity reads versions and calls; Notes and
  Tasks remain separate method lists. The renderer sorts and enriches these
  presentation records, so adapt a copy when retaining an independent service
  response.
- `loading`, `error` and `reload()` distinguish initial loading, failed reads and
  successful empty results. Failure displays the error and a Retry action.
- Optional `hasMore`, `loadMore()` and `loadingMore` expose bounded older-entry
  loading. The application appends/deduplicates accessible native records and
  clears `hasMore` at exhaustion; CRM supplies the Load more control.

In adapter mode the native header/composer defaults and sales modal collection
are suppressed. Use the `header` and `composer` slots, each receiving
`{ doc, method, resource }`, for implemented application controls/composers.
The slot document follows `adapter.doc` replacements after a reload.
No placeholder methods are installed. For lists rendered inside Activities,
`actions` provides the corresponding native action facade, for example
`showNote(note)` or task operations; standalone native cards can be composed by
the application instead. Without an adapter, Lead/Deal loading, cache keys,
native header/composers and modal defaults retain their existing paths.

`native.NoteArea` accepts an optional `canDelete` Boolean, defaulting to true for
existing callers. An application passes the accessible source's deletion
capability to hide unavailable controls. Deletion still uses native
`frappe.client.delete` and reloads its model resource; server permissions and
lifecycle hooks remain authoritative.

`showModal({ doctype, name, title, defaults, callbacks, readOnly })` launches the
native doctype modal. Its callbacks are `afterInsert(doc)` and `afterUpdate(doc)`.
Use creation defaults for new records; omit them when opening an existing source
to preserve its recorded references. Optional `readOnly: true` displays the full
native field layout and rich text without Create/Update or field-layout editing;
field-script overrides cannot weaken the requested view mode. Native custom
actions remain available for source navigation. Every launch resets the default
to editable unless readOnly is explicitly supplied. This is presentation, not a
permission grant or a replacement for native server-side write checks.

## Maintenance boundary

This is a maintained CRM extension at a declared immutable commit. The owner
must review the four page hosts, shared Form Script loader and exported native
component interfaces against each upstream upgrade, run the native default and
relationship checks, build the actual application and verify application-owned
record/permission journeys. Keeping the patch is an ongoing responsibility;
upstream acceptance and a release date are not assumed.

If upstream provides an equivalent Organisation/Contact desktop/mobile contract,
review its interface and component compatibility against these acceptance
boundaries before replacing the patch. Preserve native history and explicit
application ownership when retiring registrations or adapters.

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
all four hosts. Subsequent component checks cover the native typed resource,
failure/retry, distinct Activity versus Notes/Tasks, older-entry loading, full
read-only rich note/default reset, deletion capability and independent
Lead/Deal Form Script actions/statuses. Peer-review regressions also cover live
slot documents, rejected mobile information-tab collisions, and composer drafts
surviving same-record reloads while native header actions refresh. All 17
relationship component checks and 130 unit checks passed in the coordinator
container after those fixes. These use fake backend transport and are
bounded component evidence, not native persistence/permission or full feature
acceptance. The maintained application must complete its real-site journeys.
