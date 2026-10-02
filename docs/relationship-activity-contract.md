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

`showModal({ doctype, name, title, defaults, callbacks, readOnly })` launches the
native doctype modal. Its callbacks are `afterInsert(doc)` and `afterUpdate(doc)`.
Use creation defaults for new records; omit them when opening an existing source
to preserve its recorded references. Optional `readOnly: true` displays the full
native field layout and rich text without Create/Update or field-layout editing;
field-script overrides cannot weaken the requested view mode. Native custom
actions remain available for source navigation. Every launch resets the default
to editable unless readOnly is explicitly supplied. This is presentation, not a
permission grant or a replacement for native server-side write checks.
