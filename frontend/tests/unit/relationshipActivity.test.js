import { describe, expect, it } from 'vitest'
import { collectRelationshipActivity } from '@/utils/relationshipActivity'

describe('record relationship activity contributions', () => {
  it('accepts one versioned component and its method tabs while preserving native actions', () => {
    const component = { render() {} }
    const contribution = {
      version: 1,
      initialTab: 'Activity',
      tabs: [{ name: 'Activity', label: 'Activity' }, { name: 'Notes', label: 'Notes' }],
      component,
    }
    const result = collectRelationshipActivity([
      { actions: [{ label: 'Existing action' }] },
      { relationshipActivity: contribution },
    ])
    expect(result).toBe(contribution)
  })
})
