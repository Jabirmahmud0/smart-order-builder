import { createShop, type ShopState } from './shopState'

const databaseName = 'smart-order-builder'
const storeName = 'cart'
const shopKey = 'current'

function openShopDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2)
    request.onupgradeneeded = ({ oldVersion }) => {
      const store = oldVersion === 0
        ? request.result.createObjectStore(storeName)
        : request.transaction!.objectStore(storeName)
      const previous = store.get(shopKey)
      previous.onsuccess = () => {
        const cart: Parameters<typeof createShop>[0] = previous.result
        store.put(JSON.stringify(createShop(cart)), shopKey)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function runShopTransaction<Value>(
  operation: (shop: ShopState) => { state?: ShopState; value: Value },
  mode: 'readonly' | 'readwrite',
): Promise<Value> {
  const database = await openShopDatabase()

  try {
    return await new Promise<Value>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode)
      const store = transaction.objectStore(storeName)
      const request = store.get(shopKey)
      let value: Value
      let operationError: unknown

      transaction.oncomplete = () => resolve(value)
      transaction.onabort = () => {
        reject(operationError ?? transaction.error ?? new Error('Shop transaction aborted.'))
      }

      request.onsuccess = () => {
        try {
          const shop: ShopState = JSON.parse(request.result)
          shop.cart.version ??= 0
          const result = operation(shop)
          value = result.value
          if (result.state && result.state !== shop) store.put(JSON.stringify(result.state), shopKey)
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
