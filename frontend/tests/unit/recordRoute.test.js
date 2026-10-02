import { describe, expect, it } from 'vitest'
import { getRecordRoute } from '@/utils/recordRoute'

describe('finite native record routes', () => {
  it.each([
    ['CRM Lead', 'Lead', 'leadId'],
    ['CRM Deal', 'Deal', 'dealId'],
    ['CRM Organization', 'Organization', 'organizationId'],
    ['Contact', 'Contact', 'contactId'],
  ])('preserves the typed %s identity', (doctype, name, parameter) => {
    expect(getRecordRoute(doctype, 'IDENTITY/& same name')).toEqual({
      name, params: { [parameter]: 'IDENTITY/& same name' },
    })
  })

  it('does not guess a Lead route for unknown DocTypes or incomplete identities', () => {
    for (const doctype of ['Customer', '', '__proto__', 'constructor']) {
      expect(getRecordRoute(doctype, 'IDENTITY')).toBeNull()
    }
    for (const name of ['', null, undefined]) {
      expect(getRecordRoute('Contact', name)).toBeNull()
    }
  })
})
