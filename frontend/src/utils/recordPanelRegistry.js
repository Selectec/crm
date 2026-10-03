/** Load declared native IIFE bundles into the hosting CRM runtime. Installed apps are trusted. */
export function createPanelRegistry(browser = window) {
  const approved = new Map()
  const owners = new Map()
  const factories = new Map()
  const loads = new Map()
  const registrationErrors = new Map()
  const assetDeclarations = new Map()
  const assetKey = (asset) => JSON.stringify([asset.url, asset.revision])
  const rendererKey = (item) => JSON.stringify([item.owner_app, item.renderer, item.version, assetKey(item.js)])
  const fail = (message) => { throw new Error(`Record-page renderer: ${message}`) }
  browser.crmRecordPagePanels = Object.freeze({
    register(entry) {
      const script = browser.document.currentScript
      const asset = script?.dataset.crmPanelAsset
      const rejectRegistration = message => {
        if (asset) registrationErrors.set(asset, message)
        fail(message)
      }
      const declaration = (assetDeclarations.get(asset) || []).find(item => item.owner_app === entry?.app && item.renderer === entry?.renderer && item.version === entry?.version && assetKey(item.js) === asset)
      if (!declaration || typeof entry.create !== 'function') rejectRegistration('undeclared or incompatible registration')
      const key = rendererKey(declaration)
      if (factories.has(key) && factories.get(key) !== entry.create) rejectRegistration('duplicate factory')
      factories.set(key, entry.create)
    },
  })
  function loadAsset(asset, kind) {
    const key = assetKey(asset)
    if (loads.has(key)) return loads.get(key)
    registrationErrors.delete(key)
    if (kind === 'js') assetDeclarations.set(key, [...approved.values()].filter(item => assetKey(item.js) === key))
    const node = browser.document.createElement(kind === 'js' ? 'script' : 'link')
    node.dataset.crmPanelAsset = key
    if (kind === 'js') node.src = asset.url
    else { node.rel = 'stylesheet'; node.href = asset.url }
    const promise = new Promise((resolve, reject) => {
      node.onload = () => resolve()
      node.onerror = () => reject(new Error(`Could not load record-page asset ${asset.url}`))
      browser.document.head.appendChild(node)
    }).catch(error => {
      node.remove()
      loads.delete(key)
      for (const item of assetDeclarations.get(key) || []) factories.delete(rendererKey(item))
      throw error
    })
    loads.set(key, promise)
    return promise
  }
  return {
    approve(descriptors, scope = 'record-page') {
      owners.set(scope, descriptors)
      approved.clear()
      for (const declarations of owners.values()) {
        for (const descriptor of declarations) approved.set(rendererKey(descriptor), descriptor)
      }
    },
    release(scope) {
      owners.delete(scope)
      approved.clear()
      for (const declarations of owners.values()) {
        for (const descriptor of declarations) approved.set(rendererKey(descriptor), descriptor)
      }
    },
    async load(descriptor) {
      const key = rendererKey(descriptor)
      if (!approved.has(key)) fail('contribution is no longer declared')
      await Promise.all([loadAsset(descriptor.js, 'js'), ...descriptor.css.map(asset => loadAsset(asset, 'css'))])
      if (registrationErrors.has(assetKey(descriptor.js)) || !factories.has(key)) {
        loads.delete(assetKey(descriptor.js))
        browser.document.querySelectorAll('script[data-crm-panel-asset]').forEach(node => {
          if (node.dataset.crmPanelAsset === assetKey(descriptor.js)) node.remove()
        })
        for (const item of assetDeclarations.get(assetKey(descriptor.js)) || []) factories.delete(rendererKey(item))
        fail(registrationErrors.get(assetKey(descriptor.js)) || 'bundle did not register its declared renderer')
      }
      return factories.get(key)
    },
  }
}

let registry
export function getPanelRegistry() {
  return registry ||= createPanelRegistry()
}
