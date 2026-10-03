import { describe, expect, it, vi } from 'vitest'
import { createRecordRealtime } from '../../src/utils/recordRealtime'

function transport() {
  const listeners = new Map()
  return {
    emit: vi.fn(),
    on(event, callback) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(callback)
    },
    off(event, callback) {
      const handlers = listeners.get(event) || []
      const index = handlers.indexOf(callback)
      if (index >= 0) handlers.splice(index, 1)
    },
    receive(event, payload) {
      for (const handler of [...(listeners.get(event) || [])]) handler(payload)
    },
  }
}

describe('public record realtime lifetime', () => {
  it('an old listener cleanup cannot remove a new registration of the same callback', () => {
    const socket = transport()
    let dispose
    const realtime = createRecordRealtime(socket, callback => { dispose = callback })
    const callback = vi.fn()
    const stop = realtime.on('example_changed', callback)
    stop()
    realtime.on('example_changed', callback)
    stop()
    socket.receive('example_changed', {doctype:'Contact', name:'Current record'})
    expect(callback).toHaveBeenCalledExactlyOnceWith({doctype:'Contact', name:'Current record'})
    dispose()
    socket.receive('example_changed', {})
    expect(callback).toHaveBeenCalledTimes(1)
  })
  it('rejoins distinct typed rooms on reconnect and releases only the disposed ownership', () => {
    const socket = transport()
    const dispose = []
    const first = createRecordRealtime(socket, callback => dispose.push(callback))
    const second = createRecordRealtime(socket, callback => dispose.push(callback))
    const stopContact = first.subscribeDocument('Contact', 'Same name')
    first.subscribeDocument('CRM Organization', 'Same name')
    second.subscribeDocument('Contact', 'Same name')
    expect(socket.emit.mock.calls).toEqual([
      ['doc_subscribe','Contact','Same name'],
      ['doc_subscribe','CRM Organization','Same name'],
    ])
    socket.emit.mockClear()
    socket.receive('connect')
    expect(socket.emit.mock.calls).toEqual([
      ['doc_subscribe','Contact','Same name'],
      ['doc_subscribe','CRM Organization','Same name'],
    ])
    stopContact()
    dispose[0]()
    expect(socket.emit.mock.calls.at(-1)).toEqual(['doc_unsubscribe','CRM Organization','Same name'])
    expect(socket.emit.mock.calls.filter(([event,type])=>event==='doc_unsubscribe' && type==='Contact')).toHaveLength(0)
    dispose[1]()
    expect(socket.emit.mock.calls.at(-1)).toEqual(['doc_unsubscribe','Contact','Same name'])
    socket.emit.mockClear()
    socket.receive('connect')
    expect(socket.emit).not.toHaveBeenCalled()
  })
})
