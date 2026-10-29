import { beforeEach, describe, expect, it, vi } from 'vitest'

const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call }))

import { useNoteView } from '@/composables/noteView'

describe('native shared Note viewer', () => {
  beforeEach(() => {
    call.mockReset()
    const viewer = useNoteView()
    viewer.show.value = false
    viewer.note.value = null
    viewer.onEdit.value = null
  })

  it('opens a loaded list Note without fetching it again', async () => {
    const viewer = useNoteView()
    const note = {
      name: 'known-note',
      owner: 'author@example.test',
      title: 'Known',
    }
    const edit = vi.fn()
    await viewer.openNote(note, { edit })
    expect(call).not.toHaveBeenCalled()
    expect(viewer.show.value).toBe(true)
    expect(viewer.note.value).toEqual(note)
    viewer.onEdit.value?.()
    expect(edit).toHaveBeenCalledOnce()
  })

  it('checks native access before opening a name-only link outside the loaded page', async () => {
    const viewer = useNoteView()
    let resolve!: (note: object) => void
    call.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const note = {
      name: 'shared-note',
      owner: 'author@example.test',
      title: 'Shared',
    }
    const edit = vi.fn()
    const opening = viewer.openNote({ name: note.name }, { edit })
    expect(call).toHaveBeenCalledWith('frappe.client.get', {
      doctype: 'FCRM Note',
      name: note.name,
    })
    expect(viewer.show.value).toBe(false)
    expect(viewer.note.value).toBeNull()
    resolve(note)
    await opening
    expect(viewer.show.value).toBe(true)
    expect(viewer.note.value).toEqual(note)
    viewer.onEdit.value?.()
    expect(edit).toHaveBeenCalledOnce()
  })

  it('settles denied and missing links without a dialog or edit action', async () => {
    const viewer = useNoteView()
    for (const message of ['PermissionError', 'DoesNotExistError']) {
      call.mockRejectedValueOnce(new Error(message))
      await expect(
        viewer.openNote({ name: 'unavailable' }, { edit: vi.fn() }),
      ).resolves.toBeUndefined()
      expect(viewer.show.value).toBe(false)
      expect(viewer.note.value).toBeNull()
      expect(viewer.onEdit.value).toBeNull()
    }
  })

  it.each([false, true])(
    'keeps the latest selection when an older read resolves last (loaded: %s)',
    async (loaded) => {
      const viewer = useNoteView()
      let resolveOlder!: (note: object) => void
      call.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOlder = resolve
        }),
      )
      const older = viewer.openNote({ name: 'older' }, { edit: vi.fn() })
      const latest = {
        name: 'latest',
        owner: 'author@example.test',
        title: 'Latest',
      }
      const edit = vi.fn()
      if (!loaded) call.mockResolvedValueOnce(latest)
      await viewer.openNote(loaded ? latest : { name: latest.name }, { edit })
      resolveOlder({
        name: 'older',
        owner: 'author@example.test',
        title: 'Older',
      })
      await older
      expect(viewer.note.value).toEqual(latest)
      viewer.onEdit.value?.()
      expect(edit).toHaveBeenCalledOnce()
    },
  )
})
