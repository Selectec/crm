// Native document rooms have set membership on the server. Share ownership so
// one mounted consumer cannot unsubscribe another consumer of the same record.
const sockets = new WeakMap()

export function subscribeDocument(socket, doctype, name) {
  if (typeof doctype !== 'string' || !doctype || typeof name !== 'string' || !name) {
    throw new TypeError('Document subscription requires a typed record')
  }
  let state = sockets.get(socket)
  if (!state) {
    const rooms = new Map()
    const reconnect = () => {
      for (const room of rooms.values()) socket.emit('doc_subscribe', room.doctype, room.name)
    }
    state = { rooms, reconnect }
    sockets.set(socket, state)
  }
  if (!state.rooms.size) socket.on('connect', state.reconnect)
  const key = JSON.stringify([doctype, name])
  let room = state.rooms.get(key)
  if (!room) {
    room = { doctype, name, owners: 0 }
    state.rooms.set(key, room)
    socket.emit('doc_subscribe', doctype, name)
  }
  room.owners++
  let released = false
  return () => {
    if (released) return
    released = true
    if (--room.owners) return
    state.rooms.delete(key)
    socket.emit('doc_unsubscribe', doctype, name)
    if (!state.rooms.size) socket.off('connect', state.reconnect)
  }
}

export function createRecordRealtime(socket, onDispose) {
  const listeners = new Set()
  const rooms = new Set()
  function remove(listener) {
    if (!listeners.delete(listener)) return
    socket.off(listener.event, listener.callback)
  }
  function off(event, handler) {
    for (const listener of listeners) {
      if (listener.event === event && listener.handler === handler) {
        remove(listener)
      }
    }
  }
  onDispose(() => {
    for (const listener of listeners) remove(listener)
    for (const release of rooms) release()
    rooms.clear()
  })
  return Object.freeze({
    on(event, handler) {
      if (typeof event !== 'string' || !event || typeof handler !== 'function') {
        throw new TypeError('Realtime listener requires an event and callback')
      }
      const listener = { event, handler, callback: (...args) => handler(...args) }
      listeners.add(listener)
      socket.on(event, listener.callback)
      return () => remove(listener)
    },
    off,
    subscribeDocument(doctype, name) {
      const release = subscribeDocument(socket, doctype, name)
      rooms.add(release)
      return () => { release(); rooms.delete(release) }
    },
  })
}
