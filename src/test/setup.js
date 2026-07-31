import '@testing-library/jest-dom'

// jsdom does not always expose localStorage (opaque origin / version drift).
// Provide a minimal in-memory implementation so components that read
// localStorage (e.g. BillingPage gold-rate autofill) work under test.
if (!globalThis.localStorage || !globalThis.localStorage.getItem) {
  const store = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      key: (i) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size },
    },
  })
}
