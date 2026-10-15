const DB_NAME = 'MaListeDeCourses';
const DB_VERSION = 1;

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('lists')) {
        const lists = db.createObjectStore('lists', { keyPath: 'id', autoIncrement: true });
        lists.createIndex('state', 'state');
      }
      if (!db.objectStoreNames.contains('products')) {
        const products = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
        products.createIndex('name', 'name');
        products.createIndex('category', 'category');
      }
      if (!db.objectStoreNames.contains('stores')) {
        db.createObjectStore('stores', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('listItems')) {
        const items = db.createObjectStore('listItems', { keyPath: 'id', autoIncrement: true });
        items.createIndex('listId', 'listId');
        items.createIndex('bought', 'bought');
      }
    };
    req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => {
    const t = db.transaction(storeName, mode);
    return t.objectStore(storeName);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  async getAll(storeName) {
    const store = await tx(storeName);
    return reqToPromise(store.getAll());
  },
  async get(storeName, id) {
    const store = await tx(storeName);
    return reqToPromise(store.get(id));
  },
  async add(storeName, item) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.add(item));
  },
  async put(storeName, item) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.put(item));
  },
  async delete(storeName, id) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.delete(id));
  },
  async clear(storeName) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.clear());
  },
  async getByIndex(storeName, indexName, value) {
    const store = await tx(storeName);
    const index = store.index(indexName);
    return reqToPromise(index.getAll(value));
  },
  async exportAll() {
    const [lists, products, stores, categories, listItems] = await Promise.all([
      this.getAll('lists'), this.getAll('products'), this.getAll('stores'),
      this.getAll('categories'), this.getAll('listItems')
    ]);
    return { version: 1, exportDate: new Date().toISOString(), lists, products, stores, categories, listItems };
  },
  async importAll(data) {
    if (!data || !data.version) throw new Error('Format de fichier invalide');
    const storeNames = ['lists', 'products', 'stores', 'categories', 'listItems'];
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeNames, 'readwrite');
      storeNames.forEach(name => t.objectStore(name).clear());
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      if (data.lists) data.lists.forEach(item => t.objectStore('lists').add(item));
      if (data.products) data.products.forEach(item => t.objectStore('products').add(item));
      if (data.stores) data.stores.forEach(item => t.objectStore('stores').add(item));
      if (data.categories) data.categories.forEach(item => t.objectStore('categories').add(item));
      if (data.listItems) data.listItems.forEach(item => t.objectStore('listItems').add(item));
    });
  }
};

window.DB = DB;
