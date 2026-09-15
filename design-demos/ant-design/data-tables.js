(() => {
  const demo = window.tableDemo;
  const query = new URLSearchParams(location.search);
  const state = {
    direction: ['1', '2', '3'].includes(query.get('direction')) ? query.get('direction') : '1',
    view: query.get('view') === 'categories' ? 'categories' : 'products',
    search: '', category: 'all', stock: 'all', images: 'all', page: 1, size: 8, expanded: false,
  };
  if (query.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  const filterCount = () => ['category', 'stock', 'images'].filter(key => state[key] !== 'all').length;
  function matchingRows() {
    const search = normalize(state.search.trim());
    if (state.view === 'categories') return demo.categoryNames.map(name => ({
      name, count: demo.products.filter(item => item.category === name).length,
    })).filter(row => normalize(row.name).includes(search));
    return demo.products.filter(row => {
      const stock = row.stock <= 0 ? 'empty' : row.stock <= 5 ? 'low' : 'available';
      return normalize(`${row.id} ${row.name} ${row.category}`).includes(search)
        && (state.category === 'all' || state.category === row.category)
        && (state.stock === 'all' || state.stock === stock)
        && (state.images === 'all' || (state.images === 'with_image' ? row.images > 0 : row.images === 0));
    });
  }
  function filterPanel() {
    const reset = `<button data-reset class="reset-button" ${!state.search && !filterCount() ? 'disabled' : ''}>Xóa bộ lọc</button>`;
    const search = demo.searchField(state);
    if (state.direction === '2') return `<aside class="filter-panel sidebar"><div class="filter-heading"><h2>${state.view === 'products' ? 'Bộ lọc' : 'Tìm phân loại'}</h2></div>${search}${demo.filters(state)}${reset}</aside>`;
    if (state.direction === '3' && state.view === 'products') return `<div class="filter-panel collapsed-panel"><div class="quick-search">${search}<button id="toggle-filters" aria-expanded="${state.expanded}" aria-controls="extra-filters">${demo.icon('filter')}Bộ lọc${filterCount() ? ` (${filterCount()})` : ''}</button>${reset}</div><div id="extra-filters" ${state.expanded ? '' : 'hidden'}>${demo.filters(state)}</div></div>`;
    return `<div class="filter-panel horizontal">${search}${demo.filters(state)}${reset}</div>`;
  }
  function render() {
    const rows = matchingRows();
    state.page = Math.max(1, Math.min(state.page, Math.max(1, Math.ceil(rows.length / state.size))));
    const paged = rows.slice((state.page - 1) * state.size, state.page * state.size);
    document.querySelectorAll('[data-direction]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.direction === state.direction)));
    document.getElementById('app').innerHTML = `${demo.header(state)}<main class="workspace" data-layout="${state.direction}">${demo.pageHeading(state)}<section class="management-panel" aria-label="Quản lý ${state.view === 'products' ? 'mã hàng' : 'phân loại'}">${filterPanel()}<div class="table-area">${demo.toolbar(state, rows.length)}${demo.table(state, paged)}${demo.footer(state, rows.length)}</div></section></main>`;
    const url = new URL(location.href);
    url.searchParams.set('direction', state.direction);
    url.searchParams.set('view', state.view);
    if (document.documentElement.dataset.theme === 'dark') url.searchParams.set('theme', 'dark');
    else url.searchParams.delete('theme');
    history.replaceState(null, '', url);
  }
  function reset() {
    Object.assign(state, { search: '', category: 'all', stock: 'all', images: 'all', page: 1 });
    render();
  }
  let dialogTrigger;
  function preview(title, trigger) {
    dialogTrigger = trigger;
    const row = demo.products.find(item => title === `Chi tiết ${item.id}`);
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-copy').textContent = row
      ? 'Thông tin mã hàng trong bản nháp thiết kế.'
      : 'Thao tác này chỉ được thể hiện vị trí trong bản nháp thiết kế. Chưa thực hiện thay đổi dữ liệu.';
    document.getElementById('dialog-details').innerHTML = row ? `<dl><dt>Tên mã hàng</dt><dd>${demo.escape(row.name)}</dd><dt>Phân loại</dt><dd>${row.category}</dd><dt>Tồn kho</dt><dd>${row.stock}</dd><dt>Ảnh nhận diện</dt><dd>${row.images} ảnh</dd></dl>` : '';
    document.getElementById('preview-dialog').showModal();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.direction) { state.direction = button.dataset.direction; render(); document.querySelector(`[data-direction="${state.direction}"]`).focus(); }
    else if (button.dataset.view) {
      if (['products', 'categories'].includes(button.dataset.view)) {
        state.view = button.dataset.view; state.expanded = false; reset();
        document.querySelector(`[data-view="${state.view}"]`).focus();
      } else preview(button.textContent, button);
    } else if (button.id === 'theme') {
      document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      render(); document.getElementById('theme').focus();
    } else if (button.id === 'toggle-filters') { state.expanded = !state.expanded; render(); document.getElementById('toggle-filters').focus(); }
    else if (button.hasAttribute('data-reset')) { reset(); document.getElementById('search').focus(); }
    else if (button.dataset.page) {
      state.page = Number(button.dataset.page); render();
      document.querySelector('.page-number[aria-current="page"]')?.focus();
    } else if (button.dataset.preview) preview(button.dataset.preview, button);
    else if (button.hasAttribute('data-close')) document.getElementById('preview-dialog').close();
  });
  document.addEventListener('input', event => {
    if (event.target.id !== 'search') return;
    state.search = event.target.value; state.page = 1;
    const cursor = event.target.selectionStart;
    render();
    const input = document.getElementById('search');
    input.focus(); if (cursor !== null) input.setSelectionRange(cursor, cursor);
  });
  document.addEventListener('change', event => {
    if (event.target.dataset.filter) {
      const key = event.target.dataset.filter;
      state[key] = event.target.value; state.page = 1; render();
      document.querySelector(`[data-filter="${key}"]`).focus();
    } else if (event.target.id === 'page-size') {
      state.size = Number(event.target.value); state.page = 1; render(); document.getElementById('page-size').focus();
    }
  });
  document.getElementById('preview-dialog').addEventListener('close', () => dialogTrigger?.focus());
  render();
})();
