# Native rendering and editor facade

Generic installed-app registration is documented in [Record-page panels](record-page-panels.md).

Native Task Kanban source shortcuts use the existing typed Lead, Deal,
Organisation and Contact routes. The button label follows that native record
page; clicking it does not open the Task editor. Unknown Dynamic Link targets
and missing source names have no record shortcut, rather than falling back to
a Lead route. Form Script controllers continue to own modal source actions.
The former relationshipActivity Form Script registration has been removed. Normal
Form Script actions/statuses and the native components below remain independent.

## Native rendering and editor inputs

`native.CommentArea` renders the existing rich remark card. Optional `canEdit`
and `canDelete` capabilities default to the native owner check when omitted.
An optional `deleteAction(activity)` replaces only the deletion transport;
the native two-step confirmation and successful `reload` event remain.
Applications must derive these capabilities from authoritative source policy.
Ordinary native callers retain their existing actions and permission checks.

The owning application may render `native.Activities` with its existing
`doctype`, `docname`, `tabs` and `tabIndex` inputs and an optional
`adapter: { doc, resource, actions, reloadDoc, getCallEditorDefaults }`. Give each mounted renderer a
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

`native.CallArea` accepts an optional flat `editorDefaults` object, defaulting to
`{}`. Its native Call detail actions copy these values into a new Note editor and
merge them over the native Task creation defaults (`Backlog`, `Low`) before
insertion. A caller can supply its already-authorised creation context without a
second save to reassociate the new record. Existing Note/Task launches do not
receive caller creation defaults, preserving their recorded associations.
When rendering calls through `native.Activities`, an optional synchronous
`adapter.getCallEditorDefaults(call)` supplies the same per-source defaults to
both the Calls list and Activity stream. It receives the rendered native call,
allowing the owning app to resolve its source identity independently of the
viewed parent. Without the callback (or with an empty result), defaults are `{}`.
Ordinary callers retain native Note defaults and Task defaults; native insert,
link callbacks and server permissions remain authoritative.

`adapter.getCommentProps(comment)` optionally supplies public native CommentArea
props to both the Comments list and mixed Activity stream. The application owns
source capabilities and actions; CRM forwards them to the existing native card.
The `activity` prop always remains the rendered native record. Without the
callback, ordinary native owner controls and native save/delete behavior remain.

`native.TaskArea` accepts optional `canDelete` and `canUpdateStatus` Booleans,
both defaulting to true for existing callers. They independently hide the native
delete or status controls; opening the complete Task still uses
`modalRef.showTask(task)`. Available status controls keep the existing
`modalRef.updateTaskStatus(status, task)` workflow. A panel can supply the source's
capabilities when rendering its card; CRM does not decide content authorship or
assignment permissions. Native backend permissions remain authoritative.

`native.AttachmentArea` accepts optional `canDelete` and `canTogglePrivacy`
Booleans, both defaulting to true for existing callers. A contributing app passes
its source capabilities to hide unavailable controls; native delete and privacy
endpoints retain their server checks. `attachments` use the existing File shape,
including an identity-qualified `file_url` when the app requires one.

Panels may call `formDialog(options)` to collect transient editable fields using
the existing native FieldLayout dialog and `useFileUpload()` for Frappe UI’s
native multipart uploader. Upload options include `private`, `doctype`,
`docname`, `method`, and `params`; parameters are sent in the same upload request.
The application supplies and authorises its callback and association fields.
CRM adds no storage, upload endpoint, association policy or permission grant.

`showModal({ doctype, name, title, defaults, callbacks, readOnly, fullDocumentSave })` launches the
native doctype modal. Its callbacks are `afterInsert(doc)` and `afterUpdate(doc)`.
Use creation defaults for new records; omit them when opening an existing source
to preserve its recorded references. Optional `readOnly: true` displays the full
native field layout and rich text without Create/Update or field-layout editing;
field-script overrides cannot weaken the requested view mode. Native custom
actions remain available for source navigation. Every launch resets the default
to editable unless readOnly is explicitly supplied. This is presentation, not a
permission grant or a replacement for native server-side write checks.

Optional `fullDocumentSave: true` is intended for an existing document editor
that must retain Frappe's native revision conflict check. The modal freshly reads
the document, keeps a local working copy including its loaded `modified`, and
sends that complete copy to `frappe.client.save`. Native field, row, button,
render, validation, save and error controllers and the existing modal callbacks
remain in use. The working copy has its own native form controllers: asynchronous
field handlers never temporarily rebind the shared cached document. Accepted save
responses are also copied before editor save hooks run, so a hook completing after
close cannot mutate the shared response or affect the next modal. A realtime update to the shared resource does not replace this
editor's unsent fields or loaded revision. A rejected save leaves its error and
draft visible; closing it does not put that draft into the shared cache. A failed
initial read displays the error without exposing editable fields or enabling save.

This uses Frappe's server-side `Document.save` / `check_if_latest` guard rather
than adding an application conflict endpoint. The default existing-document path
continues to use the native document resource's field update, and creation uses
native insertion. Every launch resets the explicit `fullDocumentSave` option to
false unless supplied. A native Form Script controller may independently declare
`get modalOptions() { return { fullDocumentSave: true } }`, including a
document-dependent getter, to cover stock/global launchers for selected documents.
The getter may return a Promise resolving `{ fullDocumentSave, readOnly }`, allowing
an app to obtain authoritative native source permissions before exposing fields.
The modal waits for the document, controller initialization and these options;
a failed policy read displays its error with fields hidden and saving disabled.
A controller's `readOnly: true` uses the existing full native viewer. Neither
controller false values nor field overrides weaken an explicitly requested view.
This is a generic controller capability; CRM does not decide which
business documents require it. Controllers without that opt-in and ordinary
Lead/Deal callers retain their native field-update path.

Accepted full saves run the existing native pending attachment deletion hook;
rejected saves do not. Save controllers are awaited before the normal callback
and close. If a save controller itself fails after the server accepted the
document, the callback receives the accepted document and the modal retains the
controller error without an unhandled rejection. Native error controllers are
also awaited and caught: their failure is shown alongside the original server
rejection, preserving the unsent document.

Component tests use fake transport to prove the complete loaded revision reaches
the native save endpoint, rejected-save draft retention, realtime replacement,
controller callbacks, paused native controllers, attachment cleanup, failed reads,
controller opt-in and the next stock editor launch. Actual
two-editor persistence/conflict acceptance must run against the built CRM and
contributing app on the isolated test site.

Call Details creation callbacks reload the native Call after linking the new source.
They update onboarding only when its native UI has initialized steps; standalone
mobile or contributed hosts do not need an onboarding instance to complete the
source lifecycle. The normal initialized onboarding update remains unchanged.

`CommentArea.saveAction(activity)` optionally replaces only the save transport.
The supplied activity captures native source fields and `modified` when Edit
begins, then substitutes the current rich content when Save is clicked. A live
card reload does not replace that loaded revision. Rejection keeps the native
editor and unsent content open, does not emit `reload`, and restores the Save
control. With no action, the original native `frappe.client.set_value` path is
preserved. The current `canEdit` capability is checked again before saving.


`native.CommentBox` retains the native rich editor, formatting/mention controls,
content/attachment models, submit/discard controls and exposed `editor`. Its
optional `uploadFunction(file, options)` is passed directly to the native media
engine, including that engine's progress callback and AbortSignal, and is also
used by the attachment chooser. The callback returns a native UploadedFile; the
component retains prior attachments and the rich draft if a selection fails,
shows the error, and restores the chooser. An app owns the callback's atomic
source/context authorization and upload arguments. No callback preserves the
stock native inline uploader and FileUploader unchanged. The already-working
inline attribute fallthrough is now an explicit prop so the same public callback
can also govern attachment selection; this introduces no alternative transport
or File permission policy in CRM.
