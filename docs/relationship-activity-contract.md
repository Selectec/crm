# Native rendering and editor facade

Generic installed-app registration is documented in [Record-page panels](record-page-panels.md).
The former relationshipActivity Form Script registration has been removed. Normal
Form Script actions/statuses and the native components below remain independent.

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
