const APP_VERSION = '1.0.0';
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const state = {
  page: 'list',
  gestionTab: 'products',
  activeListId: null,
  storeFilter: null,
  showBought: false,
  searchQuery: ''
};

// ─── Theme ───
function getTheme() {
  try { return localStorage.getItem('ma-liste-theme') || 'light'; } catch (e) { return 'light'; }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('ma-liste-theme', theme); } catch (e) {}
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = theme === 'dark' ? '#111827' : '#00A86B';
}

setTheme(getTheme());

// ─── Helpers ───
function getStoreIds(item) {
  if (Array.isArray(item.storeIds)) return item.storeIds;
  if (item.storeId) return [item.storeId];
  return [];
}

function itemMatchesStore(item, storeId) {
  return getStoreIds(item).includes(storeId);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function showToast(msg, undoFn, type = 'success') {
  const c = $('#toastContainer');
  c.innerHTML = '';
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  if (undoFn) {
    const btn = document.createElement('button');
    btn.className = 'undo-btn';
    btn.textContent = 'Annuler';
    btn.onclick = () => { undoFn(); c.innerHTML = ''; };
    t.appendChild(btn);
  }
  c.appendChild(t);
  setTimeout(() => { if (c.contains(t)) c.removeChild(t); }, 4000);
}

function showModal(html, onClose) {
  const c = $('#modalContainer');
  c.innerHTML = `<div class="modal-overlay"><div class="modal">${html}</div></div>`;
  c.querySelector('.modal-overlay').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) closeModal();
  });
  if (onClose) c._onClose = onClose;
}

function closeModal() {
  const c = $('#modalContainer');
  if (c._onClose) { c._onClose(); c._onClose = null; }
  c.innerHTML = '';
}

async function ensureActiveList() {
  if (state.activeListId) {
    const list = await DB.get('lists', state.activeListId);
    if (list) return list;
  }
  const lists = await DB.getAll('lists');
  const active = lists.find(l => l.state === 'active');
  if (active) { state.activeListId = active.id; return active; }
  const now = new Date().toISOString();
  const id = await DB.add('lists', {
    title: 'Courses', state: 'active', createdAt: now, updatedAt: now, order: 0, dataVersion: 1
  });
  state.activeListId = id;
  return DB.get('lists', id);
}

// ─── Navigation ───
function navigate(page) {
  state.page = page;
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('#gestionHeader').classList.toggle('hidden', page !== 'gestion');
  render();
}

function setGestionTab(tab) {
  state.gestionTab = tab;
  $$('.header-tab').forEach(b => b.classList.toggle('active', b.dataset.gtab === tab));
  render();
}

// ─── Render Router ───
function render() {
  const main = $('#mainContent');
  if (state.page === 'list') renderList(main);
  else if (state.page === 'gestion') renderGestion(main);
}

// ─── LIST VIEW ───
async function renderList(container) {
  const list = await ensureActiveList();
  const items = await DB.getByIndex('listItems', 'listId', list.id);
  const stores = await DB.getAll('stores');
  stores.sort((a, b) => (a.order || 0) - (b.order || 0));
  const products = await DB.getAll('products');

  const toBuy = items.filter(i => !i.bought).sort((a, b) => (a.order || 0) - (b.order || 0));
  const bought = items.filter(i => i.bought).sort((a, b) => (a.order || 0) - (b.order || 0));

  const filtered = toBuy;
  const filteredBought = bought;

  const storeItemCounts = {};
  items.forEach(i => {
    if (!i.bought) {
      for (const sid of getStoreIds(i)) {
        storeItemCounts[sid] = (storeItemCounts[sid] || 0) + 1;
      }
    }
  });

  const categorized = {};
  filtered.forEach(item => {
    const cat = item.category || 'Sans catégorie';
    if (!categorized[cat]) categorized[cat] = [];
    categorized[cat].push(item);
  });

  let html = `
    <div class="search-wrap">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="searchInput" placeholder="Rechercher un produit..." value="${escapeHtml(state.searchQuery)}" autocomplete="off">
        <div class="suggestions" id="suggestions"></div>
      </div>
      <button class="voice-btn" id="voiceBtn" aria-label="Saisie vocale">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
      </button>
    </div>

    <div class="store-filters">
      <button class="store-filter ${!state.storeFilter ? 'active' : ''}" data-store="">Tous (${toBuy.length})</button>
      ${stores.map(s => `
        <button class="store-filter ${state.storeFilter === s.id ? 'active' : ''}" data-store="${s.id}">
          ${s.image ? `<img src="${s.image}" alt="">` : `${escapeHtml(s.name)}`} (${storeItemCounts[s.id] || 0})
        </button>
      `).join('')}
    </div>
  `;

  if (filtered.length === 0 && filteredBought.length === 0) {
    html += `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
        <p>Votre liste est vide</p>
        <p>Utilisez la recherche pour ajouter des produits</p>
      </div>
    `;
  } else {
    const cats = Object.keys(categorized).sort((a, b) => {
      if (a === 'Sans catégorie') return -1;
      if (b === 'Sans catégorie') return 1;
      return a.localeCompare(b, 'fr');
    });

    for (const cat of cats) {
      html += `<h3 class="category-heading">${escapeHtml(cat)}</h3>`;
      for (const item of categorized[cat]) {
        html += renderListItem(item, false);
      }
    }
  }

  updateCartBadge(bought.length);

  html += `<div class="version">Version ${APP_VERSION}</div>`;
  container.innerHTML = html;

  bindListEvents(products, stores);
}

function renderListItem(item, isBought) {
  const detail = [item.quantity, item.unit].filter(Boolean).join(' ');
  const ids = getStoreIds(item);
  const hasStores = ids.length > 0;
  let highlight = false;
  if (!isBought && state.storeFilter) {
    highlight = !itemMatchesStore(item, state.storeFilter);
  }
  const itemClass = isBought ? 'bought' : (highlight ? 'to-buy' : '');
  return `
    <div class="list-item ${itemClass}" data-id="${item.id}">
      <button class="checkbox ${isBought ? 'checked' : ''}" data-action="toggle" data-id="${item.id}" aria-label="${isBought ? 'Décocher' : 'Cocher'}">
        ${isBought ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </button>
      ${item.image
        ? `<img class="item-image" src="${item.image}" alt="">`
        : `<div class="item-image-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`
      }
      <div class="item-info">
        <div class="item-name">${escapeHtml(item.name)}</div>
        ${detail ? `<div class="item-detail">${escapeHtml(detail)}</div>` : ''}
      </div>
      <div class="item-actions">
        <button class="icon-btn" data-action="note" data-id="${item.id}" aria-label="Note">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${item.note ? 'var(--accent)' : 'currentColor'}" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </button>
      </div>
    </div>
  `;
}

function bindListEvents(products, stores) {
  const searchInput = $('#searchInput');
  const suggestionsEl = $('#suggestions');

  searchInput?.addEventListener('input', () => {
    state.searchQuery = searchInput.value;
    const q = searchInput.value.trim().toLowerCase();
    if (q.length < 1) { suggestionsEl.classList.remove('open'); return; }

    const matches = products
      .filter(p => p.name.toLowerCase().includes(q))
      .slice(0, 8);

    let shtml = matches.map(p => `
      <div class="suggestion-item" data-product-id="${p.id}">
        <span>${escapeHtml(p.name)}</span>
        <button class="add-btn" data-product-id="${p.id}">+</button>
      </div>
    `).join('');
    shtml += `<div class="suggestion-create" data-create="${escapeHtml(searchInput.value.trim())}">+ Créer un nouveau produit "${escapeHtml(searchInput.value.trim())}"</div>`;
    suggestionsEl.innerHTML = shtml;
    suggestionsEl.classList.add('open');

    suggestionsEl.querySelectorAll('.suggestion-item .add-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pid = Number(btn.dataset.productId);
        await addProductToList(pid);
        searchInput.value = '';
        state.searchQuery = '';
        suggestionsEl.classList.remove('open');
        render();
      });
    });

    suggestionsEl.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', async () => {
        const pid = Number(item.dataset.productId);
        await addProductToList(pid);
        searchInput.value = '';
        state.searchQuery = '';
        suggestionsEl.classList.remove('open');
        render();
      });
    });

    suggestionsEl.querySelector('.suggestion-create')?.addEventListener('click', () => {
      const name = searchInput.value.trim();
      if (!name) return;
      searchInput.value = '';
      state.searchQuery = '';
      suggestionsEl.classList.remove('open');
      showProductModal(null, { addToList: true, prefillName: name });
    });
  });

  searchInput?.addEventListener('focus', () => {
    if (state.searchQuery.trim().length >= 1) {
      searchInput.dispatchEvent(new Event('input'));
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      suggestionsEl?.classList.remove('open');
    }
  });

  $$('.store-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.store;
      state.storeFilter = sid ? Number(sid) : null;
      render();
    });
  });

  $$('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const item = await DB.get('listItems', id);
      if (!item) return;
      item.bought = !item.bought;
      item.updatedAt = new Date().toISOString();
      await DB.put('listItems', item);
      render();
    });
  });

  $$('[data-action="note"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const item = await DB.get('listItems', id);
      if (!item) return;
      showItemEditModal(item);
    });
  });

  $('#voiceBtn')?.addEventListener('click', startVoiceInput);
}

async function addProductToList(productId) {
  const product = await DB.get('products', productId);
  if (!product) return;
  const list = await ensureActiveList();
  const items = await DB.getByIndex('listItems', 'listId', list.id);
  const now = new Date().toISOString();
  await DB.add('listItems', {
    listId: list.id, productId: product.id, name: product.name,
    quantity: product.defaultQuantity || '', unit: product.defaultUnit || '',
    note: '', category: product.category || '', storeIds: getStoreIds(product),
    bought: false, image: product.image || '', order: items.length,
    createdAt: now, updatedAt: now
  });
  showToast(`${product.name} ajouté`);
}

async function quickAddToList(name) {
  const now = new Date().toISOString();
  const productId = await DB.add('products', {
    name: name.trim(), category: '', defaultQuantity: '', defaultUnit: '',
    image: '', storeIds: [], createdAt: now, updatedAt: now
  });
  const list = await ensureActiveList();
  const items = await DB.getByIndex('listItems', 'listId', list.id);
  await DB.add('listItems', {
    listId: list.id, productId, name: name.trim(),
    quantity: '', unit: '', note: '', category: '', storeIds: [],
    bought: false, image: '', order: items.length,
    createdAt: now, updatedAt: now
  });
  showToast(`${name.trim()} créé et ajouté`);
}

function showItemEditModal(item) {
  showModal(`
    <h2>Modifier l'article</h2>
    <div class="form-group">
      <label>Libellé</label>
      <input type="text" id="editName" value="${escapeHtml(item.name)}">
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label>Quantité</label>
        <input type="text" id="editQty" value="${escapeHtml(item.quantity || '')}">
      </div>
      <div class="form-group" style="flex:1">
        <label>Unité</label>
        <input type="text" id="editUnit" value="${escapeHtml(item.unit || '')}" placeholder="kg, pièces, litres...">
      </div>
    </div>
    <div class="form-group">
      <label>Catégorie</label>
      <select id="editCategory"></select>
      <input type="text" id="editCategoryCustom" class="hidden" placeholder="Nouvelle catégorie..." style="margin-top:6px">
    </div>
    <div class="form-group">
      <label>Magasins</label>
      <div class="store-chips" id="editStoreChips"></div>
    </div>
    <div class="form-group">
      <label>Image</label>
      <div class="image-picker">
        <label class="image-picker-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Photo
          <input type="file" accept="image/*" capture="environment" id="editCamera" style="display:none">
        </label>
        <label class="image-picker-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          Galerie
          <input type="file" accept="image/*" id="editImage" style="display:none">
        </label>
      </div>
      ${item.image ? `<img class="image-preview" src="${item.image}" id="editImagePreview">` : '<div id="editImagePreview"></div>'}
    </div>
    <div class="form-group">
      <label>Note</label>
      <textarea id="editNote">${escapeHtml(item.note || '')}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-danger" id="editDelete">Supprimer</button>
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" id="editSave">Enregistrer</button>
    </div>
  `);

  loadStoreChips('#editStoreChips', getStoreIds(item));
  loadCategorySelect('#editCategory', '#editCategoryCustom', item.category || '');

  let editImageData = item.image || '';
  function handleEditImageFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      editImageData = ev.target.result;
      const preview = $('#editImagePreview');
      if (preview.tagName === 'IMG') { preview.src = editImageData; }
      else { preview.outerHTML = `<img class="image-preview" src="${editImageData}" id="editImagePreview">`; }
    };
    reader.readAsDataURL(file);
  }
  $('#editImage')?.addEventListener('change', handleEditImageFile);
  $('#editCamera')?.addEventListener('change', handleEditImageFile);

  $('#editSave').addEventListener('click', async () => {
    const name = $('#editName').value.trim();
    if (!name) { showToast('Le libellé est obligatoire', null, 'error'); return; }
    item.name = name;
    item.quantity = $('#editQty').value.trim();
    item.unit = $('#editUnit').value.trim();
    item.category = readCategory('#editCategory', '#editCategoryCustom');
    item.image = editImageData;
    item.note = $('#editNote').value.trim();
    item.storeIds = readStoreChips('#editStoreChips');
    delete item.storeId;
    item.updatedAt = new Date().toISOString();
    await DB.put('listItems', item);
    closeModal();
    render();
  });

  $('#editDelete').addEventListener('click', async () => {
    const deletedItem = { ...item };
    await DB.delete('listItems', item.id);
    closeModal();
    render();
    showToast(`${item.name} supprimé`, async () => {
      delete deletedItem.id;
      await DB.add('listItems', deletedItem);
      render();
    });
  });
}

async function loadStoreChips(selector, selectedIds = []) {
  const stores = await DB.getAll('stores');
  stores.sort((a, b) => (a.order || 0) - (b.order || 0));
  const container = document.querySelector(selector);
  if (!container) return;
  container.innerHTML = stores.map(s => {
    const sel = selectedIds.includes(s.id) ? ' selected' : '';
    return `<span class="store-chip${sel}" data-store-id="${s.id}">${escapeHtml(s.name)}</span>`;
  }).join('');
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.store-chip');
    if (chip) chip.classList.toggle('selected');
  });
}

function readStoreChips(selector) {
  const chips = document.querySelectorAll(`${selector} .store-chip.selected`);
  return Array.from(chips).map(c => Number(c.dataset.storeId));
}

async function loadCategorySelect(selectSelector, customInputSelector, currentValue = '') {
  const cats = await DB.getAll('categories');
  cats.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const sel = $(selectSelector);
  const customInput = $(customInputSelector);
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Aucune --</option>'
    + cats.map(c => `<option value="${escapeHtml(c.name)}"${c.name === currentValue ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('')
    + '<option value="__other__">+ Autre...</option>';
  if (currentValue && !cats.find(c => c.name === currentValue)) {
    const opt = document.createElement('option');
    opt.value = currentValue;
    opt.textContent = currentValue;
    opt.selected = true;
    sel.insertBefore(opt, sel.lastElementChild);
  }
  if (customInput) customInput.classList.add('hidden');
  sel.addEventListener('change', () => {
    if (sel.value === '__other__') {
      customInput?.classList.remove('hidden');
      customInput?.focus();
    } else {
      customInput?.classList.add('hidden');
    }
  });
}

function readCategory(selectSelector, customInputSelector) {
  const sel = $(selectSelector);
  if (!sel) return '';
  if (sel.value === '__other__') {
    const custom = $(customInputSelector);
    return custom ? custom.value.trim() : '';
  }
  return sel.value;
}

// ─── VOICE INPUT ───
function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Saisie vocale non disponible sur cet appareil', null, 'error');
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  const btn = $('#voiceBtn');
  btn.classList.add('listening');

  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    const input = $('#searchInput');
    if (input) {
      input.value = text;
      state.searchQuery = text;
      input.dispatchEvent(new Event('input'));
    }
    btn.classList.remove('listening');
  };

  recognition.onerror = () => {
    showToast('Erreur de reconnaissance vocale', null, 'error');
    btn.classList.remove('listening');
  };

  recognition.onend = () => btn.classList.remove('listening');

  try { recognition.start(); }
  catch { showToast('Impossible de démarrer la saisie vocale', null, 'error'); btn.classList.remove('listening'); }
}

// ─── GESTION VIEW ───
async function renderGestion(container) {
  if (state.gestionTab === 'products') await renderProducts(container);
  else if (state.gestionTab === 'stores') await renderStores(container);
  else if (state.gestionTab === 'categories') await renderCategories(container);
  else if (state.gestionTab === 'settings') await renderSettings(container);
}

// ─── PRODUCTS ───
async function renderProducts(container) {
  const products = await DB.getAll('products');
  products.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  let html = `
    <div class="card">
      <div class="search-wrap" style="margin-bottom:8px">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="productSearch" placeholder="Rechercher un produit...">
        </div>
      </div>
      <button class="add-btn-big" id="addProductBtn">+</button>
    </div>
    <div class="card">
      <h3 class="section-title">Produits <span class="count">(${products.length})</span></h3>
      <div id="productsList">
        ${products.map(p => `
          <div class="gestion-item" data-id="${p.id}">
            <div class="item-thumb">
              ${p.image
                ? `<img src="${p.image}" alt="">`
                : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`
              }
            </div>
            <span class="item-label">${escapeHtml(p.name)}</span>
            <button class="icon-btn" data-action="edit-product" data-id="${p.id}" aria-label="Modifier">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn danger" data-action="delete-product" data-id="${p.id}" aria-label="Supprimer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="version">Version ${APP_VERSION}</div>
  `;
  container.innerHTML = html;

  $('#productSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('#productsList .gestion-item').forEach(el => {
      const name = el.querySelector('.item-label').textContent.toLowerCase();
      el.classList.toggle('hidden', !name.includes(q));
    });
  });

  $('#addProductBtn')?.addEventListener('click', () => showProductModal());

  $$('[data-action="edit-product"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = await DB.get('products', Number(btn.dataset.id));
      if (p) showProductModal(p);
    });
  });

  $$('[data-action="delete-product"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = await DB.get('products', Number(btn.dataset.id));
      if (!p) return;
      showModal(`
        <h2>Supprimer le produit ?</h2>
        <p>« ${escapeHtml(p.name)} » sera définitivement supprimé.</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
          <button class="btn btn-danger" id="confirmDeleteProduct">Supprimer</button>
        </div>
      `);
      $('#confirmDeleteProduct').addEventListener('click', async () => {
        await DB.delete('products', p.id);
        closeModal();
        render();
        showToast(`${p.name} supprimé`);
      });
    });
  });
}

function showProductModal(product, { addToList = false, prefillName = '' } = {}) {
  const isEdit = !!product;
  showModal(`
    <h2>${isEdit ? 'Modifier le produit' : 'Ajouter un produit'}</h2>
    <div class="form-group">
      <label>Nom du produit</label>
      <input type="text" id="prodName" value="${isEdit ? escapeHtml(product.name) : escapeHtml(prefillName)}" required>
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label>Quantité par défaut</label>
        <input type="text" id="prodQty" value="${isEdit ? escapeHtml(product.defaultQuantity || '') : ''}">
      </div>
      <div class="form-group" style="flex:1">
        <label>Unité</label>
        <input type="text" id="prodUnit" value="${isEdit ? escapeHtml(product.defaultUnit || '') : ''}" placeholder="kg, litres...">
      </div>
    </div>
    <div class="form-group">
      <label>Catégorie</label>
      <select id="prodCategory"></select>
      <input type="text" id="prodCategoryCustom" class="hidden" placeholder="Nouvelle catégorie..." style="margin-top:6px">
    </div>
    <div class="form-group">
      <label>Magasins</label>
      <div class="store-chips" id="prodStoreChips"></div>
    </div>
    <div class="form-group">
      <label>Image du produit</label>
      <div class="image-picker">
        <label class="image-picker-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Photo
          <input type="file" accept="image/*" capture="environment" id="prodCamera" style="display:none">
        </label>
        <label class="image-picker-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          Galerie
          <input type="file" accept="image/*" id="prodImage" style="display:none">
        </label>
      </div>
      ${isEdit && product.image ? `<img class="image-preview" src="${product.image}" id="prodImagePreview">` : '<div id="prodImagePreview"></div>'}
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" id="prodSave">${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
    </div>
  `);

  loadStoreChips('#prodStoreChips', getStoreIds(product || {}));
  loadCategorySelect('#prodCategory', '#prodCategoryCustom', isEdit ? (product.category || '') : '');

  let imageData = isEdit ? (product.image || '') : '';
  function handleImageFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      imageData = ev.target.result;
      const preview = $('#prodImagePreview');
      if (preview.tagName === 'IMG') { preview.src = imageData; }
      else { preview.outerHTML = `<img class="image-preview" src="${imageData}" id="prodImagePreview">`; }
    };
    reader.readAsDataURL(file);
  }
  $('#prodImage')?.addEventListener('change', handleImageFile);
  $('#prodCamera')?.addEventListener('change', handleImageFile);

  $('#prodSave').addEventListener('click', async () => {
    const name = $('#prodName').value.trim();
    if (!name) { showToast('Le nom est obligatoire', null, 'error'); return; }
    const catValue = readCategory('#prodCategory', '#prodCategoryCustom');

    if (catValue) {
      const existingCats = await DB.getAll('categories');
      if (!existingCats.find(c => c.name.toLowerCase() === catValue.toLowerCase())) {
        await DB.add('categories', { name: catValue, order: existingCats.length });
      }
    }

    const data = {
      name, defaultQuantity: $('#prodQty').value.trim(), defaultUnit: $('#prodUnit').value.trim(),
      category: catValue, image: imageData,
      storeIds: readStoreChips('#prodStoreChips'),
      updatedAt: new Date().toISOString()
    };

    if (isEdit) {
      await DB.put('products', { ...product, ...data });
      const allItems = await DB.getAll('listItems');
      for (const li of allItems) {
        if (li.productId === product.id) {
          li.name = data.name;
          li.category = data.category;
          li.storeIds = data.storeIds;
          li.image = data.image;
          li.updatedAt = data.updatedAt;
          await DB.put('listItems', li);
        }
      }
      showToast(`${name} modifié`);
    } else {
      data.createdAt = new Date().toISOString();
      const newId = await DB.add('products', data);
      if (addToList) {
        await addProductToList(newId);
      } else {
        showToast(`${name} ajouté`);
      }
    }
    closeModal();
    render();
  });
}

// ─── STORES ───
async function renderStores(container) {
  const stores = await DB.getAll('stores');
  stores.sort((a, b) => (a.order || 0) - (b.order || 0));

  let html = `
    <div class="card">
      <h3 class="section-title">Ajouter un magasin</h3>
      <div class="form-group">
        <input type="text" id="storeName" placeholder="Nom du magasin">
      </div>
      <div class="form-group">
        <label>Image du magasin</label>
        <div class="image-picker">
          <label class="image-picker-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            Galerie
            <input type="file" accept="image/*" id="storeImage" style="display:none">
          </label>
        </div>
        <div id="storeImagePreview"></div>
      </div>
      <button class="btn btn-primary" id="addStoreBtn" style="float:right">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <div style="clear:both"></div>
    </div>

    <div class="card">
      <h3 class="section-title">Magasins <span class="count">(${stores.length})</span></h3>
      <div id="storesList">
      ${stores.map(s => `
        <div class="gestion-item store-sortable" data-id="${s.id}">
          <div class="drag-handle" aria-label="Réordonner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </div>
          <div class="item-thumb">
            ${s.image
              ? `<img src="${s.image}" alt="">`
              : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 00-8 0v2"/></svg>`
            }
          </div>
          <span class="item-label">${escapeHtml(s.name)}</span>
          <button class="icon-btn" data-action="edit-store" data-id="${s.id}" aria-label="Modifier">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete-store" data-id="${s.id}" aria-label="Supprimer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      `).join('')}
      </div>
    </div>
    <div class="version">Version ${APP_VERSION}</div>
  `;
  container.innerHTML = html;

  let storeImageData = '';
  $('#storeImage')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      storeImageData = ev.target.result;
      $('#storeImagePreview').innerHTML = `<img class="image-preview" src="${storeImageData}">`;
    };
    reader.readAsDataURL(file);
  });

  $('#addStoreBtn')?.addEventListener('click', async () => {
    const name = $('#storeName').value.trim();
    if (!name) { showToast('Le nom est obligatoire', null, 'error'); return; }
    const now = new Date().toISOString();
    await DB.add('stores', {
      name, image: storeImageData,
      order: stores.length, createdAt: now, updatedAt: now
    });
    showToast(`${name} ajouté`);
    render();
  });

  $$('[data-action="edit-store"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const s = await DB.get('stores', Number(btn.dataset.id));
      if (s) showStoreEditModal(s);
    });
  });

  $$('[data-action="delete-store"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const s = await DB.get('stores', Number(btn.dataset.id));
      if (!s) return;
      showModal(`
        <h2>Supprimer le magasin ?</h2>
        <p>« ${escapeHtml(s.name)} » sera définitivement supprimé.</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
          <button class="btn btn-danger" id="confirmDeleteStore">Supprimer</button>
        </div>
      `);
      $('#confirmDeleteStore').addEventListener('click', async () => {
        await DB.delete('stores', s.id);
        closeModal();
        render();
        showToast(`${s.name} supprimé`);
      });
    });
  });

  initStoreDragSort();
}

function initStoreDragSort() {
  const list = $('#storesList');
  if (!list) return;
  let dragItem = null;
  let longPressTimer = null;
  let startY = 0;
  let placeholder = null;

  function getY(e) {
    return e.touches ? e.touches[0].clientY : e.clientY;
  }

  function startDrag(item, y) {
    dragItem = item;
    startY = y;
    dragItem.classList.add('dragging');
    placeholder = document.createElement('div');
    placeholder.className = 'drag-placeholder';
    placeholder.style.height = dragItem.offsetHeight + 'px';
    dragItem.parentNode.insertBefore(placeholder, dragItem);
    dragItem.style.position = 'fixed';
    dragItem.style.left = '0';
    dragItem.style.right = '0';
    dragItem.style.zIndex = '1000';
    dragItem.style.width = list.offsetWidth + 'px';
    updateDragPosition(y);
  }

  function updateDragPosition(y) {
    if (!dragItem) return;
    const rect = list.getBoundingClientRect();
    dragItem.style.top = (y - dragItem.offsetHeight / 2) + 'px';
    const items = [...list.querySelectorAll('.store-sortable:not(.dragging)')];
    for (const item of items) {
      const box = item.getBoundingClientRect();
      const mid = box.top + box.height / 2;
      if (y < mid) {
        list.insertBefore(placeholder, item);
        return;
      }
    }
    list.appendChild(placeholder);
  }

  async function endDrag() {
    if (!dragItem) return;
    dragItem.classList.remove('dragging');
    dragItem.style.position = '';
    dragItem.style.left = '';
    dragItem.style.right = '';
    dragItem.style.top = '';
    dragItem.style.zIndex = '';
    dragItem.style.width = '';
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(dragItem, placeholder);
      placeholder.remove();
    }
    placeholder = null;
    const items = [...list.querySelectorAll('.store-sortable')];
    for (let i = 0; i < items.length; i++) {
      const id = Number(items[i].dataset.id);
      const store = await DB.get('stores', id);
      if (store && store.order !== i) {
        store.order = i;
        store.updatedAt = new Date().toISOString();
        await DB.put('stores', store);
      }
    }
    dragItem = null;
  }

  list.querySelectorAll('.drag-handle').forEach(handle => {
    handle.addEventListener('touchstart', (e) => {
      const item = handle.closest('.store-sortable');
      longPressTimer = setTimeout(() => {
        e.preventDefault();
        startDrag(item, getY(e));
      }, 300);
    }, { passive: false });

    handle.addEventListener('mousedown', (e) => {
      const item = handle.closest('.store-sortable');
      longPressTimer = setTimeout(() => {
        startDrag(item, getY(e));
      }, 300);
    });
  });

  document.addEventListener('touchmove', (e) => {
    if (dragItem) { e.preventDefault(); updateDragPosition(getY(e)); }
    else if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }, { passive: false });

  document.addEventListener('mousemove', (e) => {
    if (dragItem) { updateDragPosition(getY(e)); }
    else if (longPressTimer && Math.abs(getY(e) - startY) > 10) { clearTimeout(longPressTimer); longPressTimer = null; }
  });

  document.addEventListener('touchend', () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (dragItem) endDrag();
  });

  document.addEventListener('mouseup', () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (dragItem) endDrag();
  });
}

function showStoreEditModal(store) {
  showModal(`
    <h2>Modifier le magasin</h2>
    <div class="form-group">
      <label>Nom</label>
      <input type="text" id="editStoreName" value="${escapeHtml(store.name)}">
    </div>
    <div class="form-group">
      <label>Image</label>
      <div class="image-picker">
        <label class="image-picker-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          Galerie
          <input type="file" accept="image/*" id="editStoreImage" style="display:none">
        </label>
      </div>
      ${store.image ? `<img class="image-preview" src="${store.image}" id="editStoreImagePreview">` : '<div id="editStoreImagePreview"></div>'}
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" id="editStoreSave">Enregistrer</button>
    </div>
  `);

  let imageData = store.image || '';
  $('#editStoreImage')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      imageData = ev.target.result;
      const preview = $('#editStoreImagePreview');
      if (preview?.tagName === 'IMG') { preview.src = imageData; }
      else if (preview) { preview.outerHTML = `<img class="image-preview" src="${imageData}" id="editStoreImagePreview">`; }
    };
    reader.readAsDataURL(file);
  });

  $('#editStoreSave').addEventListener('click', async () => {
    const name = $('#editStoreName').value.trim();
    if (!name) { showToast('Le nom est obligatoire', null, 'error'); return; }
    store.name = name;
    store.image = imageData;
    store.updatedAt = new Date().toISOString();
    await DB.put('stores', store);
    closeModal();
    render();
    showToast(`${name} modifié`);
  });
}

// ─── CATEGORIES ───
async function renderCategories(container) {
  const categories = await DB.getAll('categories');
  categories.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  let html = `
    <div class="card">
      <h3 class="section-title">Ajouter une catégorie</h3>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <input type="text" id="catName" placeholder="Nom de la catégorie">
        </div>
        <button class="btn btn-primary" id="addCatBtn" style="height:42px;align-self:end">+</button>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">Catégories <span class="count">(${categories.length})</span></h3>
      ${categories.map(c => `
        <div class="gestion-item" data-id="${c.id}">
          <div class="item-thumb">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          </div>
          <span class="item-label">${escapeHtml(c.name)}</span>
          <button class="icon-btn" data-action="edit-cat" data-id="${c.id}" aria-label="Modifier">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete-cat" data-id="${c.id}" aria-label="Supprimer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      `).join('')}
    </div>
    <div class="version">Version ${APP_VERSION}</div>
  `;
  container.innerHTML = html;

  $('#addCatBtn')?.addEventListener('click', async () => {
    const name = $('#catName').value.trim();
    if (!name) { showToast('Le nom est obligatoire', null, 'error'); return; }
    const existing = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) { showToast('Cette catégorie existe déjà', null, 'error'); return; }
    await DB.add('categories', { name, order: categories.length });
    showToast(`${name} ajoutée`);
    render();
  });

  $$('[data-action="edit-cat"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const c = await DB.get('categories', Number(btn.dataset.id));
      if (!c) return;
      showModal(`
        <h2>Modifier la catégorie</h2>
        <div class="form-group">
          <label>Nom</label>
          <input type="text" id="editCatName" value="${escapeHtml(c.name)}">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
          <button class="btn btn-primary" id="editCatSave">Enregistrer</button>
        </div>
      `);
      $('#editCatSave').addEventListener('click', async () => {
        const newName = $('#editCatName').value.trim();
        if (!newName) { showToast('Le nom est obligatoire', null, 'error'); return; }
        c.name = newName;
        await DB.put('categories', c);
        closeModal();
        render();
      });
    });
  });

  $$('[data-action="delete-cat"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const c = await DB.get('categories', Number(btn.dataset.id));
      if (!c) return;
      showModal(`
        <h2>Supprimer la catégorie ?</h2>
        <p>« ${escapeHtml(c.name)} » sera définitivement supprimée.</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
          <button class="btn btn-danger" id="confirmDeleteCat">Supprimer</button>
        </div>
      `);
      $('#confirmDeleteCat').addEventListener('click', async () => {
        await DB.delete('categories', c.id);
        closeModal();
        render();
        showToast(`${c.name} supprimée`);
      });
    });
  });

}

// ─── SETTINGS ───
async function renderSettings(container) {
  container.innerHTML = `
    <div class="settings-section">
      <h3 class="section-title" style="margin-bottom:12px">Apparence</h3>
      <div class="theme-toggle" id="themeToggle">
        <div class="theme-toggle-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          Mode sombre
        </div>
        <div class="toggle-switch ${getTheme() === 'dark' ? 'active' : ''}" id="toggleSwitch"></div>
      </div>
    </div>

    <div class="settings-section">
      <h3 class="section-title" style="margin-bottom:12px">Données</h3>
      <button class="settings-btn" id="exportBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exporter les données
      </button>
      <button class="settings-btn" id="importBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Importer les données
        <input type="file" accept=".json" id="importFile" style="display:none">
      </button>
    </div>
    <div class="version">Version ${APP_VERSION}</div>
  `;

  $('#themeToggle')?.addEventListener('click', () => {
    const newTheme = getTheme() === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    $('#toggleSwitch')?.classList.toggle('active', newTheme === 'dark');
  });

  $('#exportBtn')?.addEventListener('click', async () => {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ma-liste-courses-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export terminé');
  });

  $('#importBtn')?.addEventListener('click', () => $('#importFile').click());

  $('#importFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showModal(`
      <h2>Importer les données ?</h2>
      <p>Les données actuelles seront remplacées par le contenu du fichier « ${escapeHtml(file.name)} ».</p>
      <p style="color:var(--danger);font-weight:500;margin-top:8px">Cette action est irréversible. Pensez à exporter vos données actuelles avant.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button class="btn btn-danger" id="confirmImport">Remplacer</button>
      </div>
    `);
    $('#confirmImport').addEventListener('click', async () => {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await DB.importAll(data);
        state.activeListId = null;
        closeModal();
        render();
        showToast('Import réussi');
      } catch (err) {
        closeModal();
        showToast('Erreur : fichier invalide', null, 'error');
      }
    });
  });

}

// ─── CART MODAL ───
function updateCartBadge(count) {
  const badge = $('#cartBadge');
  if (!badge) return;
  badge.textContent = count > 0 ? count : '';
  badge.classList.toggle('visible', count > 0);
}

async function showCartModal() {
  const list = await ensureActiveList();
  const items = await DB.getByIndex('listItems', 'listId', list.id);
  const boughtItems = items.filter(i => i.bought).sort((a, b) => (a.order || 0) - (b.order || 0));

  if (boughtItems.length === 0) {
    showToast('Aucun produit dans le chariot', null, 'error');
    return;
  }

  const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('fr-FR');
  };

  showModal(`
    <div class="cart-modal-header">
      <h2>Produits achetés</h2>
      <button class="modal-close-btn" onclick="closeModal()" aria-label="Fermer">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="cart-items-list">
      ${boughtItems.map(item => `
        <div class="cart-item" data-id="${item.id}">
          <div class="cart-item-info">
            <span class="cart-item-name">${escapeHtml(item.name)}</span>
            <span class="cart-item-date">${formatDate(item.updatedAt)}</span>
          </div>
          <button class="cart-restore-btn" data-action="restore-item" data-id="${item.id}" aria-label="Restaurer">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 105.64-8.36L1 10"/></svg>
          </button>
        </div>
      `).join('')}
    </div>
    <div class="cart-modal-footer">
      <button class="btn btn-danger btn-block" id="clearCartBtn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        Vider la liste
      </button>
    </div>
  `);

  $$('[data-action="restore-item"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const item = await DB.get('listItems', id);
      if (!item) return;
      item.bought = false;
      item.updatedAt = new Date().toISOString();
      await DB.put('listItems', item);
      showToast(`${item.name} remis dans la liste`);
      closeModal();
      render();
    });
  });

  $('#clearCartBtn')?.addEventListener('click', async () => {
    for (const item of boughtItems) await DB.delete('listItems', item.id);
    closeModal();
    render();
    showToast(`${boughtItems.length} article(s) supprimé(s)`);
  });
}

// ─── AUTO BACKUP ───
const BACKUP_KEY = 'ma-liste-backup';
const BACKUP_TS_KEY = 'ma-liste-backup-ts';

async function autoBackup() {
  try {
    const data = await DB.exportAll();
    const hasData = data.products?.length > 0 || data.listItems?.length > 0;
    if (!hasData) return;
    localStorage.setItem(BACKUP_KEY, JSON.stringify(data));
    localStorage.setItem(BACKUP_TS_KEY, new Date().toISOString());
  } catch (e) {}
}

async function restoreFromBackupIfNeeded() {
  try {
    const existing = await DB.getAll('products');
    if (existing.length > 0) return;
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && data.version) {
      await DB.importAll(data);
      showToast('Données restaurées depuis la sauvegarde locale');
    }
  } catch (e) {}
}

let backupTimer = null;
function scheduleAutoBackup() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = setInterval(autoBackup, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autoBackup();
  });
}

// ─── Init ───
async function seedDatabase() {
  const existing = await DB.getAll('products');
  if (existing.length > 0) return;

  const now = new Date().toISOString();

  const categories = [
    'Fruits et légumes', 'Viandes et poissons', 'Produits laitiers', 'Frais',
    'Boulangerie', 'Épicerie sucrée', 'Épicerie salée', 'Boissons',
    'Surgelés', 'Entretien', 'Hygiène et beauté', 'Bébé', 'Animaux', 'Divers'
  ];
  for (let i = 0; i < categories.length; i++) {
    await DB.add('categories', { name: categories[i], order: i });
  }

  const stores = [
    'Carrefour', 'Leclerc', 'Intermarché', 'Auchan', 'Lidl', 'Picard', 'Chlorophylle'
  ];
  for (let i = 0; i < stores.length; i++) {
    await DB.add('stores', { name: stores[i], image: '', order: i, createdAt: now, updatedAt: now });
  }

  const products = [
    // Fruits et légumes
    { name: 'Pommes', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'kg' },
    { name: 'Bananes', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'kg' },
    { name: 'Oranges', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'kg' },
    { name: 'Citrons', category: 'Fruits et légumes', defaultQuantity: '3', defaultUnit: '' },
    { name: 'Fraises', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'barquette' },
    { name: 'Raisin', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'grappe' },
    { name: 'Poires', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'kg' },
    { name: 'Clémentines', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'kg' },
    { name: 'Kiwis', category: 'Fruits et légumes', defaultQuantity: '4', defaultUnit: '' },
    { name: 'Mangue', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Ananas', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Avocat', category: 'Fruits et légumes', defaultQuantity: '2', defaultUnit: '' },
    { name: 'Tomates', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'kg' },
    { name: 'Tomates cerises', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'barquette' },
    { name: 'Salade', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Concombre', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Carottes', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'kg' },
    { name: 'Pommes de terre', category: 'Fruits et légumes', defaultQuantity: '2', defaultUnit: 'kg' },
    { name: 'Oignons', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'filet' },
    { name: 'Ail', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'tête' },
    { name: 'Échalotes', category: 'Fruits et légumes', defaultQuantity: '3', defaultUnit: '' },
    { name: 'Poireaux', category: 'Fruits et légumes', defaultQuantity: '3', defaultUnit: '' },
    { name: 'Courgettes', category: 'Fruits et légumes', defaultQuantity: '2', defaultUnit: '' },
    { name: 'Aubergines', category: 'Fruits et légumes', defaultQuantity: '2', defaultUnit: '' },
    { name: 'Poivrons', category: 'Fruits et légumes', defaultQuantity: '2', defaultUnit: '' },
    { name: 'Champignons', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'barquette' },
    { name: 'Haricots verts', category: 'Fruits et légumes', defaultQuantity: '500', defaultUnit: 'g' },
    { name: 'Brocoli', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Chou-fleur', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Épinards', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'sachet' },
    { name: 'Radis', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'botte' },
    { name: 'Céleri', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Persil', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'botte' },
    { name: 'Basilic', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'pot' },
    { name: 'Menthe', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'botte' },
    { name: 'Coriandre', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: 'botte' },
    { name: 'Gingembre', category: 'Fruits et légumes', defaultQuantity: '1', defaultUnit: '' },

    // Viandes et poissons
    { name: 'Poulet entier', category: 'Viandes et poissons', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Escalopes de poulet', category: 'Viandes et poissons', defaultQuantity: '4', defaultUnit: '' },
    { name: 'Cuisses de poulet', category: 'Viandes et poissons', defaultQuantity: '4', defaultUnit: '' },
    { name: 'Steak haché', category: 'Viandes et poissons', defaultQuantity: '4', defaultUnit: '' },
    { name: 'Bœuf bourguignon', category: 'Viandes et poissons', defaultQuantity: '500', defaultUnit: 'g' },
    { name: 'Côtes de porc', category: 'Viandes et poissons', defaultQuantity: '4', defaultUnit: '' },
    { name: 'Saucisses', category: 'Viandes et poissons', defaultQuantity: '6', defaultUnit: '' },
    { name: 'Merguez', category: 'Viandes et poissons', defaultQuantity: '6', defaultUnit: '' },
    { name: 'Lardons', category: 'Viandes et poissons', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Jambon blanc', category: 'Viandes et poissons', defaultQuantity: '4', defaultUnit: 'tranches' },
    { name: 'Jambon cru', category: 'Viandes et poissons', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Saumon frais', category: 'Viandes et poissons', defaultQuantity: '2', defaultUnit: 'pavés' },
    { name: 'Saumon fumé', category: 'Viandes et poissons', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Cabillaud', category: 'Viandes et poissons', defaultQuantity: '2', defaultUnit: 'filets' },
    { name: 'Crevettes', category: 'Viandes et poissons', defaultQuantity: '200', defaultUnit: 'g' },
    { name: 'Thon en boîte', category: 'Viandes et poissons', defaultQuantity: '2', defaultUnit: 'boîtes' },
    { name: 'Sardines en boîte', category: 'Viandes et poissons', defaultQuantity: '2', defaultUnit: 'boîtes' },

    // Produits laitiers
    { name: 'Lait', category: 'Produits laitiers', defaultQuantity: '6', defaultUnit: 'bouteilles' },
    { name: 'Lait demi-écrémé', category: 'Produits laitiers', defaultQuantity: '6', defaultUnit: 'bouteilles' },
    { name: 'Beurre', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: 'plaquette' },
    { name: 'Beurre doux', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: 'plaquette' },
    { name: 'Beurre demi-sel', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: 'plaquette' },
    { name: 'Crème fraîche', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: 'pot' },
    { name: 'Yaourts nature', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Yaourts aux fruits', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Fromage blanc', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: 'pot' },
    { name: 'Petits suisses', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Emmental râpé', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: 'sachet' },
    { name: 'Gruyère', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Comté', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Camembert', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Chèvre', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Mozzarella', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Parmesan', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Roquefort', category: 'Produits laitiers', defaultQuantity: '1', defaultUnit: '' },

    // Frais
    { name: 'Œufs', category: 'Frais', defaultQuantity: '1', defaultUnit: 'boîte de 12' },
    { name: 'Pâte feuilletée', category: 'Frais', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Pâte brisée', category: 'Frais', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Pâte à pizza', category: 'Frais', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Pâté', category: 'Frais', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Rillettes', category: 'Frais', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Houmous', category: 'Frais', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Taboulé', category: 'Frais', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Pizza fraîche', category: 'Frais', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Quiche', category: 'Frais', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Tortillas', category: 'Frais', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Tofu', category: 'Frais', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Jus d\'orange frais', category: 'Frais', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Compote', category: 'Frais', defaultQuantity: '1', defaultUnit: 'lot' },

    // Boulangerie
    { name: 'Pain de mie', category: 'Boulangerie', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Baguette', category: 'Boulangerie', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Pain complet', category: 'Boulangerie', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Brioche', category: 'Boulangerie', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Croissants', category: 'Boulangerie', defaultQuantity: '6', defaultUnit: '' },
    { name: 'Pains au chocolat', category: 'Boulangerie', defaultQuantity: '6', defaultUnit: '' },
    { name: 'Pain de campagne', category: 'Boulangerie', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Biscottes', category: 'Boulangerie', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Crackers', category: 'Boulangerie', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Wraps', category: 'Boulangerie', defaultQuantity: '1', defaultUnit: 'paquet' },

    // Épicerie sucrée
    { name: 'Sucre', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'kg' },
    { name: 'Sucre en poudre', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'kg' },
    { name: 'Sucre glace', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Farine', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'kg' },
    { name: 'Levure', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Chocolat noir', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'tablette' },
    { name: 'Chocolat au lait', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'tablette' },
    { name: 'Chocolat en poudre', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Nutella', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'pot' },
    { name: 'Confiture', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'pot' },
    { name: 'Miel', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'pot' },
    { name: 'Céréales', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Muesli', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Biscuits', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Gâteaux', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Madeleines', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Crêpes', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Compote en gourde', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Fruits secs', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'sachet' },
    { name: 'Bonbons', category: 'Épicerie sucrée', defaultQuantity: '1', defaultUnit: 'paquet' },

    // Épicerie salée
    { name: 'Pâtes', category: 'Épicerie salée', defaultQuantity: '500', defaultUnit: 'g' },
    { name: 'Spaghetti', category: 'Épicerie salée', defaultQuantity: '500', defaultUnit: 'g' },
    { name: 'Coquillettes', category: 'Épicerie salée', defaultQuantity: '500', defaultUnit: 'g' },
    { name: 'Riz', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'kg' },
    { name: 'Riz basmati', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'kg' },
    { name: 'Semoule', category: 'Épicerie salée', defaultQuantity: '500', defaultUnit: 'g' },
    { name: 'Couscous', category: 'Épicerie salée', defaultQuantity: '500', defaultUnit: 'g' },
    { name: 'Lentilles', category: 'Épicerie salée', defaultQuantity: '500', defaultUnit: 'g' },
    { name: 'Pois chiches', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Haricots rouges', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Sauce tomate', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'bocal' },
    { name: 'Concentré de tomates', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'tube' },
    { name: 'Tomates pelées', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Huile d\'olive', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Huile de tournesol', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Huile de friture', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Vinaigre', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Vinaigre balsamique', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Moutarde', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'pot' },
    { name: 'Mayonnaise', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Ketchup', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Sel', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Poivre', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Herbes de Provence', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Curry', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Cumin', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Paprika', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Bouillon cube', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Sauce soja', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Lait de coco', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Olives', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'bocal' },
    { name: 'Cornichons', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'bocal' },
    { name: 'Câpres', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'bocal' },
    { name: 'Chips', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Cacahuètes', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Maïs', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Petits pois', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Champignons en boîte', category: 'Épicerie salée', defaultQuantity: '1', defaultUnit: 'boîte' },

    // Boissons
    { name: 'Eau minérale', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'pack' },
    { name: 'Eau gazeuse', category: 'Boissons', defaultQuantity: '6', defaultUnit: 'bouteilles' },
    { name: 'Jus d\'orange', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Jus de pomme', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Jus multifruit', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Coca-Cola', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'pack' },
    { name: 'Limonade', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Sirop', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Café', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Café moulu', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Café en capsules', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Thé', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Tisane', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Bière', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'pack' },
    { name: 'Vin rouge', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Vin blanc', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Vin rosé', category: 'Boissons', defaultQuantity: '1', defaultUnit: 'bouteille' },

    // Surgelés
    { name: 'Légumes surgelés', category: 'Surgelés', defaultQuantity: '1', defaultUnit: 'sachet' },
    { name: 'Frites surgelées', category: 'Surgelés', defaultQuantity: '1', defaultUnit: 'sachet' },
    { name: 'Pizza surgelée', category: 'Surgelés', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Poisson surgelé', category: 'Surgelés', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Glace', category: 'Surgelés', defaultQuantity: '1', defaultUnit: 'bac' },
    { name: 'Crêpes surgelées', category: 'Surgelés', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Nuggets', category: 'Surgelés', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Cordons bleus', category: 'Surgelés', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Épinards surgelés', category: 'Surgelés', defaultQuantity: '1', defaultUnit: 'sachet' },
    { name: 'Petits pois surgelés', category: 'Surgelés', defaultQuantity: '1', defaultUnit: 'sachet' },
    { name: 'Fruits surgelés', category: 'Surgelés', defaultQuantity: '1', defaultUnit: 'sachet' },
    { name: 'Pain surgelé', category: 'Surgelés', defaultQuantity: '1', defaultUnit: 'sachet' },

    // Entretien
    { name: 'Liquide vaisselle', category: 'Entretien', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Tablettes lave-vaisselle', category: 'Entretien', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Lessive', category: 'Entretien', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Adoucissant', category: 'Entretien', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Nettoyant multi-usage', category: 'Entretien', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Nettoyant vitres', category: 'Entretien', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Javel', category: 'Entretien', defaultQuantity: '1', defaultUnit: 'bouteille' },
    { name: 'Éponges', category: 'Entretien', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Sacs poubelle', category: 'Entretien', defaultQuantity: '1', defaultUnit: 'rouleau' },
    { name: 'Papier aluminium', category: 'Entretien', defaultQuantity: '1', defaultUnit: 'rouleau' },
    { name: 'Film alimentaire', category: 'Entretien', defaultQuantity: '1', defaultUnit: 'rouleau' },
    { name: 'Papier cuisson', category: 'Entretien', defaultQuantity: '1', defaultUnit: 'rouleau' },
    { name: 'Essuie-tout', category: 'Entretien', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Papier toilette', category: 'Entretien', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Mouchoirs', category: 'Entretien', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Allume-feu', category: 'Entretien', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Ampoules', category: 'Entretien', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Piles', category: 'Entretien', defaultQuantity: '1', defaultUnit: 'lot' },

    // Hygiène et beauté
    { name: 'Savon', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Gel douche', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Shampoing', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Après-shampoing', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Dentifrice', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Brosse à dents', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Déodorant', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Rasoirs', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Mousse à raser', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Crème hydratante', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Crème solaire', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Coton', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Coton-tiges', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Maquillage', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Démaquillant', category: 'Hygiène et beauté', defaultQuantity: '1', defaultUnit: '' },

    // Bébé
    { name: 'Couches', category: 'Bébé', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Lingettes bébé', category: 'Bébé', defaultQuantity: '1', defaultUnit: 'paquet' },
    { name: 'Lait infantile', category: 'Bébé', defaultQuantity: '1', defaultUnit: 'boîte' },
    { name: 'Petits pots bébé', category: 'Bébé', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Compote bébé', category: 'Bébé', defaultQuantity: '1', defaultUnit: 'lot' },

    // Animaux
    { name: 'Croquettes chien', category: 'Animaux', defaultQuantity: '1', defaultUnit: 'sac' },
    { name: 'Croquettes chat', category: 'Animaux', defaultQuantity: '1', defaultUnit: 'sac' },
    { name: 'Pâtée pour chat', category: 'Animaux', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Pâtée pour chien', category: 'Animaux', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Litière chat', category: 'Animaux', defaultQuantity: '1', defaultUnit: 'sac' },

    // Divers
    { name: 'Agenda', category: 'Divers', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Stylos', category: 'Divers', defaultQuantity: '1', defaultUnit: 'lot' },
    { name: 'Cahier', category: 'Divers', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Scotch', category: 'Divers', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Fleurs', category: 'Divers', defaultQuantity: '1', defaultUnit: 'bouquet' },
    { name: 'Bougies', category: 'Divers', defaultQuantity: '1', defaultUnit: '' },
    { name: 'Serviettes en papier', category: 'Divers', defaultQuantity: '1', defaultUnit: 'paquet' }
  ];

  for (const p of products) {
    await DB.add('products', {
      name: p.name, category: p.category,
      defaultQuantity: p.defaultQuantity, defaultUnit: p.defaultUnit,
      image: '', storeIds: [], createdAt: now, updatedAt: now
    });
  }
}

async function init() {
  document.addEventListener('click', (e) => {
    const navBtn = e.target.closest('.nav-btn');
    if (navBtn && navBtn.dataset.page) {
      e.preventDefault();
      if (navBtn.dataset.page === 'cart') {
        showCartModal();
      } else {
        navigate(navBtn.dataset.page);
      }
      return;
    }
    const headerTab = e.target.closest('.header-tab');
    if (headerTab && headerTab.dataset.gtab) {
      e.preventDefault();
      setGestionTab(headerTab.dataset.gtab);
      return;
    }
  });

  $('#gestionHeader').classList.add('hidden');

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist();
  }

  await restoreFromBackupIfNeeded();
  await seedDatabase();
  render();

  scheduleAutoBackup();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
