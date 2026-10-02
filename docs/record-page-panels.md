# Installed-app record-page panels, version 1

CRM Organization and Contact desktop/mobile pages accept declarative installed-app
panels. CRM discovers declarations, validates asset ownership, loads normal native
IIFE bundles and retains each renderer group. Apps own business requests, source
permissions and content. Lead and Deal hosts are unchanged. There is no generic
business API dispatcher, executable Form Script registration or extra boot hook.

## Declaration and discovery

In a contributing application's hooks.py:

```python
crm_record_page_panels = [{
    "id": "record_summary", "version": 1,
    "targets": ["CRM Organization", "Contact"],
    "renderer": "record_summary",
    "js": "demo_record_summary.bundle.js", "css": [], "order": 100,
    "panels": [{"id": "summary", "label": "Summary", "icon": "lucide-info"}],
    "default_panel": "summary",  # optional
}]
```

`crm.api.record_page.get_panels(doctype, name)` accepts only a supported typed
parent identity and requires its native read permission before discovery. It
infers owner_app from each installed app's hooks, never a supplied owner field.
Identifiers are plain alphanumeric/underscore/hyphen names starting with a letter.
Contribution keys are `owner_app:id`; panel names are `owner_app:id:panel_id`.
Native panes use reserved `native:*` names; labels never decide dispatch. A panel
can share a label with a native pane or another contributor without shadowing it.
Optional lucide string icons render through CRM's native SVG Icon sprite; native
component icons retain their existing path.

Descriptors sort by `(order, owner_app, id)` before native panes. Competing default
requests select the first ordered contribution with a visible diagnostic. Without
a default, the existing first native pane remains selected.
The default applies on the first successful discovery for a typed record, including
overlapping discovery from a cached document and its fresh HTTP response. Later
discoveries preserve the user's current selection, including changes made while
discovery is pending. Invalid declarations produce diagnostics and do not remove
other app or native panes. Duplicate
contribution/local-panel identities and unsupported versions/targets are invalid.
Normal Form Script header actions/statuses remain independently evaluated.

JS/CSS logical keys must be app-prefixed native `*.bundle.js/css` names present in
Frappe's asset manifest. Discovery returns canonical same-origin app-owned
`/assets/<owner_app>/...` paths and an asset revision derived from the resolved
hashed path. Missing entries, other-app/external paths, traversal, query/fragment
and wrong asset kinds fail explicitly. Native bundles are the only delivery mode;
apps must scope optional CSS to their contribution root `[data-crm-panel="app:id"]`.

## IIFE entry and shared runtime

An ordinary app-public native bundle entry registers synchronously while its
approved script executes:

```javascript
window.crmRecordPagePanels.register({
  app: 'demo', renderer: 'record_summary', version: 1,
  create(runtime) {
    const { h } = runtime.vue
    return { props: ['context'], setup(props) {
      return () => h('p', `Summary for ${props.context.doctype}:${props.context.name}`)
    }}
  },
})
```

The registry exists before asset loading. It verifies the executing approved
asset and exact declared app/renderer/version. Undeclared registrations, different
duplicate factories and absent registrations fail the contributor load. Identical
factory retries are accepted. An already approved in-flight asset can finish
registration against its load-time declarations after navigation; current
discovery still controls new loads and stale host generations cannot mount it. Pending/successful asset promises are cached by
URL/revision; failures remove their scripts/cache entries so Retry can reload.
Native and other app panels remain available when one contributor fails. Installed
apps are trusted code; the registry prevents accidental ownership/dispatch errors
and is not a sandbox.

`runtime.version = 1` exposes CRM's own `vue: {h, ref, computed, watch, onMounted,
onUnmounted}`, plus those helpers as top-level aliases; `createResource`, `call`,
`toast`, `router`, `showModal`, `translate` and `__`. `native` contains `Button`,
`ErrorMessage`, `TextEditor`, `Activities`, `NoteArea`, `TaskArea`, `CallArea`,
`EmailEditor`, `CommentBox`, `AttachmentArea`. Apps must use these supplied runtimes
and render functions rather than bundle a second Vue, Frappe UI or router. Native
component/modal inputs are documented in [the native facade](relationship-activity-contract.md).

## Live context and lifecycle

Factories receive only runtime, never a captured record. Components receive one
reactive `context` prop:

- `doctype`, `name`, `doc`: complete typed identity and current native document.
- `panel`: local panel id; `panels`: declared descriptors with local ids and global names.
- `active`: whether this contribution currently owns the selected tab.
- `selectPanel(localId)`: selects this contribution's qualified panel.
- `refreshRecord()`: reloads the hosting native resource.

Read current props.context values in render/watch callbacks. An app should defer
business reads while inactive and refresh when active again without discarding
its unsent draft. Current parent permission never substitutes for source permission.

Each contribution gets one persistent group outside native TabsContent parents.
Desktop native Tabs, persistent groups and discovery states share one vertical
content column beside the existing record information resizer.
Contributed native tab buttons control that group through aria-controls; the
active method labels it through aria-labelledby. Native pane associations remain
unchanged.
Its component remains mounted across local method and native/other-contributor tab
switches, with active/panel changes delivered reactively. A same-record reload
updates doc and discovery descriptors while preserving component, selection,
drafts and resources. Ownership includes typed identity, contribution/renderer,
version and JS/CSS asset revisions. Different record identity or asset revision
remounts; removal unmounts and falls back to an available native pane. Apps must
release listeners/resources with onUnmounted. Generation guards suppress delayed
discovery/loading after typed navigation, a cleared native resource or unmount. Already loaded JavaScript
cannot be unloaded: app removal or release changes require normal session reload.

## Maintained proof and actual runtime gate

Site-free discovery tests use installed Frappe with mocked installed-app hooks,
manifest and native parent permission. Registry tests use fake DOM asset transport.
Native component tests mount all four real Vue hosts, native Tabs/modal/editor and
normal Form Script engine with fake backend/asset transport. They cover rich native
editor launching, same-name typed context, multiple simulated contributors,
label collisions, removal, discovery/asset failure and Retry, stale discovery,
revision/typed-owner remounting and draft retention across methods/native tabs and
record reload, plus native Lead/Deal adapter/editor defaults and independent actions.
These are maintained contract tests, not site registration or real persistence proof.

The pinned Vite 5.4.21 / frappe-ui 1.0.0-beta.29 development setup excludes
`frappe-ui` from dependency prebundling. This installed package ships unbuilt
TextEditor source with virtual `~icons/lucide/*` imports. Its native Vite plugin
resolves them when serving source, while the esbuild dependency optimizer cannot
bundle them. The exclusion also covers package subpaths and keeps the existing
native plugin, dependency includes and single-runtime deduplication in place.
CommonJS dependencies still require optimization; `feather-icons` is already
included. Add another explicit include only for a demonstrated raw CommonJS
failure. This configuration affects development, not production bundling.

See the [installed Frappe UI plugin](https://github.com/frappe/frappe-ui/blob/v1.0.0-beta.29/vite/index.js)
and [Vite 5 optimizer contract](https://github.com/vitejs/vite/blob/v5.4.21/docs/config/dep-optimization-options.md).
Recheck the exclusion when upgrading those versions: newer Frappe UI source has
changed its icon and optimizer defaults. Native startup and real-page
development proof must verify this workaround; production success alone is
insufficient evidence.

Run in the isolated CRM worktree with the existing container/dependencies:

```sh
python tests/test_record_page.py # use the Bench environment Python
cd frontend
node node_modules/vitest/vitest.mjs run tests/unit
node node_modules/vitest/vitest.mjs run --config vitest.relationship.config.js
```

Before adopting/publishing the complete app integration, the runtime owner must:

1. Verify immutable installed source identities. Build the real contributing native
   bundle and CRM UI; confirm manifest ownership and no duplicate Vue/UI payload.
2. Prove actual permitted/denied discovery, production and Vite-dev same-origin
   script/CSS loading (including CSP/proxy), and failed-load Retry.
3. Install a tiny unrelated fake app on the isolated test site, prove coexistence
   on all four real pages and removal/uninstall cleanup. Simulated second-app unit
   fixtures do not establish this proof. Do not patch another installed app's hooks.
4. Complete app-specific native Notes author/read-only colleague/manager, paging,
   source permissions, reassociation/audit and direct-route browser journeys.
5. Verify drafts survive method/native-pane visits and record reload, typed delayed
   navigation is ignored, contributor removal cleans resources and native panes
   remain. Retire only obsolete page registration, preserve native navigation and
   unrelated controls, then run repeated setup/native regressions.

The narrow upgrade surface is discovery/asset validation, registry/runtime/group
lifecycle, four host templates and native facade/editor/adapter inputs. No upstream
PR implementation is imported. Keep immutable dependency pins and rerun the same
contracts on upgrades. Root-owned packaging/browser artifacts must be cleaned or
retained with explicit ownership and a removal trigger after runtime proof.
