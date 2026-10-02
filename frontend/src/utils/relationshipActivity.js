/** Resolve one optional versioned contribution for a relationship activity area. */
export function collectRelationshipActivity(customizations) {
  const contributions = customizations
    .map((customization) => customization?.relationshipActivity)
    .filter(Boolean)
  if (!contributions.length) return null
  if (contributions.length > 1) {
    throw new Error('Only one relationship activity contribution may own a record page.')
  }
  const contribution = contributions[0]
  const methods = contribution.tabs
  if (
    contribution.version !== 1 ||
    !contribution.component ||
    !Array.isArray(methods) ||
    !methods.length ||
    methods.some((method) => !method || typeof method.name !== 'string' || !method.name || typeof method.label !== 'string') ||
    new Set(methods.map((method) => method.name)).size !== methods.length ||
    methods.some((method) => ['Details', 'Deals', 'Contacts'].includes(method.name)) ||
    !methods.some((method) => method.name === contribution.initialTab)
  ) {
    throw new Error('Invalid relationship activity contribution.')
  }
  return contribution
}
