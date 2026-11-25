import { emptyCart, type CartState } from './reservations'

const databaseName = 'smart-order-builder'
const storeName = 'cart'
const cartKey = 'current'

function openCartDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function runCartTransaction<Value>(
  operation: (cart: CartState) => { state?: CartState; value: Value },
  mode: 'readonly' | 'readwrite',
): Promise<Value> {
  const database = await openCartDatabase()

  try {
    return await new Promise<Value>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode)
      const store = transaction.objectStore(storeName)
      const request = store.get(cartKey)
      let value: Value
      let operationError: unknown

      transaction.oncomplete = () => resolve(value)
      transaction.onabort = () => {
        reject(operationError ?? transaction.error ?? new Error('Cart transaction aborted.'))
      }

      request.onsuccess = () => {
        try {
          const cart: CartState = request.result ?? emptyCart
          const result = operation(cart)
          value = result.value
          if (result.state && result.state !== cart) store.put(result.state, cartKey)
        } catch (error) {
          operationError = error
          transaction.abort()
        }
      }
    })
  } finally {
    database.close()
  }
}
