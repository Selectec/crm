const recordTargets = {
  'CRM Lead': ['Lead', 'leadId'],
  'CRM Deal': ['Deal', 'dealId'],
  'CRM Organization': ['Organization', 'organizationId'],
  Contact: ['Contact', 'contactId'],
}

// A Dynamic Link can target any DocType; only these native record pages exist.
export function getRecordRoute(doctype, docname) {
  if (!docname || !Object.hasOwn(recordTargets, doctype)) return null
  const [name, parameter] = recordTargets[doctype]
  return { name, params: { [parameter]: docname } }
}
