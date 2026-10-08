const DB_NAME = 'lien-preservation-runtime';
const DB_VERSION = 2;
const STORE_NAME = 'saves';
const META_STORE = 'meta';

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'slot' });
      }
      if (!request.result.objectStoreNames.contains(META_STORE)) {
        request.result.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function transact(storeName, mode, action) {
  return database().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Save transaction aborted')); };
    result = action(store);
  }));
}

export function listSaves() {
  return transact(STORE_NAME, 'readonly', store => new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  })).then(result => result);
}

export function putSave(record) {
  return transact(STORE_NAME, 'readwrite', store => store.put(record));
}

export function deleteSave(slot) {
  return transact(STORE_NAME, 'readwrite', store => store.delete(slot));
}

export function getSetting(key, fallback) {
  return transact(META_STORE, 'readonly', store => new Promise((resolve, reject) => {
    const request = store.get(`setting:${key}`);
    request.onsuccess = () => resolve(request.result?.value ?? fallback);
    request.onerror = () => reject(request.error);
  }));
}

export function putSetting(key, value) {
  return transact(META_STORE, 'readwrite', store => store.put({ key: `setting:${key}`, value }));
}

export function listReadMessages() {
  return transact(META_STORE, 'readonly', store => new Promise((resolve, reject) => {
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result
      .filter(key => typeof key === 'string' && key.startsWith('read:'))
      .map(key => key.slice(5)));
    request.onerror = () => reject(request.error);
  }));
}

export function markMessageRead(messageId) {
  return transact(META_STORE, 'readwrite', store => store.put({ key: `read:${messageId}`, value: true }));
}

export function exportStoredData() {
  return database().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, META_STORE], 'readonly');
    const savesRequest = transaction.objectStore(STORE_NAME).getAll();
    const metaRequest = transaction.objectStore(META_STORE).getAll();
    transaction.oncomplete = () => {
      db.close();
      resolve({ saves: savesRequest.result || [], meta: metaRequest.result || [] });
    };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Save export aborted')); };
  }));
}

export function replaceStoredData({ saves, meta }) {
  return database().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, META_STORE], 'readwrite');
    const saveStore = transaction.objectStore(STORE_NAME);
    const metaStore = transaction.objectStore(META_STORE);
    saveStore.clear();
    metaStore.clear();
    for (const record of saves) saveStore.put(record);
    for (const record of meta) metaStore.put(record);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Save import aborted')); };
  }));
}
