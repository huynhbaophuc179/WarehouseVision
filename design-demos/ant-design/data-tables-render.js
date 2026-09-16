(() => {
  const demo = window.tableDemo;
  const { escape: esc, icon } = demo;
  const button = (label, action, glyph, style = '') => `<button class="${style}" data-preview="${esc(action)}">${glyph ? icon(glyph) : ''}${esc(label)}</button>`;
  const iconButton = (label, action, glyph, style = '') => `<button class="icon-button ${style}" data-preview="${esc(action)}" aria-label="${esc(label)}" title="${esc(label)}">${icon(glyph)}</button>`;
  const select = (key, label, options, value) => `<label class="filter-field"><span>${label}</span><select data-filter="${key}">${options.map(([id, text]) => `<option value="${esc(id)}" ${value === id ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  demo.searchField = state => `<label class="filter-field search-field"><span>Tìm kiếm</span><div class="search-input">${icon('search')}<input id="search" type="search" value="${esc(state.search)}" placeholder="${state.view === 'products' ? 'Tìm mã hàng, tên hoặc phân loại' : 'Tìm tên phân loại'}" autocomplete="off"></div></label>`;
  demo.filters = state => {
    const fields = state.view === 'products' ? [
      select('category', 'Phân loại', [['all', 'Tất cả'], ...demo.categoryNames.map(name => [name, name])], state.category),
      select('stock', 'Tồn kho', demo.stockOptions, state.stock),
      select('images', 'Ảnh nhận diện', demo.imageOptions, state.images),
    ].join('') : '';
    return `<div class="filter-fields">${fields}</div>`;
  };
  demo.header = state => {
    const dark = document.documentElement.dataset.theme === 'dark';
    return `<header class="header-navigation"><nav class="header-navigation__items" aria-label="Điều hướng chính">${[
      ['scanner', 'Kiểm kho'], ['products', 'Mã hàng'], ['categories', 'Phân loại'], ['review', 'Quản lý phiên'], ['missing-box', 'Bổ sung vùng'],
    ].map(([key, label]) => `<button class="ant-btn header-navigation__item" data-view="${key}" ${state.view === key ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav><div class="header-navigation__actions"><button id="theme" class="ant-btn header-navigation__action" aria-label="Chuyển sang giao diện ${dark ? 'sáng' : 'tối'}" title="Chuyển sang giao diện ${dark ? 'sáng' : 'tối'}">${icon(dark ? 'sun' : 'moon')}</button><button class="ant-btn header-navigation__action" data-preview="Cài đặt" aria-label="Mở cài đặt" title="Cài đặt">${icon('settings')}</button></div></header>`;
  };
  demo.pageHeading = state => `<div class="page-heading"><h1>${state.view === 'products' ? 'Mã hàng' : 'Phân loại'}</h1><div class="page-actions">${state.view === 'products'
    ? button('Nhập danh sách', 'Nhập danh sách mã hàng', 'upload') + button('Thêm mã hàng', 'Thêm mã hàng', 'plus', 'success-button')
    : button('Thêm phân loại', 'Thêm phân loại', 'plus', 'success-button')}</div></div>`;
  demo.toolbar = (state, total) => `<div class="table-toolbar"><span class="result-count" aria-live="polite"><strong>${total}</strong> ${state.view === 'products' ? 'mã hàng' : 'phân loại'}</span>${state.view === 'categories' ? `<span class="muted category-summary">${demo.products.filter(item => item.category === 'Chưa phân loại').length} mã hàng chưa phân loại</span>` : ''}</div>`;
  const stockLabel = stock => stock <= 0 ? 'Hết hàng' : stock <= 5 ? 'Sắp hết' : 'Còn hàng';
  const productRow = row => `<tr><td><span class="image-placeholder" title="Chưa có ảnh minh họa" aria-label="Chưa có ảnh minh họa">—</span></td><th scope="row"><button class="row-name" data-preview="Chi tiết ${esc(row.id)}">${esc(row.name)}</button><span class="product-code">${row.id}</span></th><td>${row.category}</td><td class="inventory-cell"><span class="stock-number">${row.stock}</span><span class="stock-label ${row.stock > 5 ? 'available' : ''}">${stockLabel(row.stock)}</span></td><td>${row.images ? `${row.images} ảnh` : '<span class="muted">Chưa có</span>'}</td><td class="row-actions">${iconButton(`Chụp ảnh cho ${row.id}`, `Chụp ảnh cho ${row.id}`, 'camera', row.images ? '' : 'capture-needed')}${iconButton(`Xem chi tiết ${row.id}`, `Chi tiết ${row.id}`, 'eye')}</td></tr>`;
  const categoryRow = row => `<tr><th scope="row"><span class="category-name">${esc(row.name)}</span>${row.name === 'Chưa phân loại' ? '<span class="product-code">Các mã hàng chưa được xếp nhóm</span>' : ''}</th><td class="numeric">${row.count}</td><td class="row-actions">${row.name === 'Chưa phân loại' ? '<span class="muted">Mặc định</span>' : iconButton(`Đổi tên ${row.name}`, `Đổi tên ${row.name}`, 'pencil') + iconButton(`Xóa ${row.name}`, `Xóa ${row.name}`, 'trash')}</td></tr>`;
  demo.table = (state, rows) => `<div class="table-scroll" role="region" aria-label="Bảng ${state.view === 'products' ? 'mã hàng' : 'phân loại'}" tabindex="0"><table class="${state.view === 'products' ? 'products-table' : 'categories-table'}"><caption class="sr-only">${state.view === 'products' ? 'Danh sách mã hàng' : 'Danh sách phân loại'}</caption><thead><tr>${(state.view === 'products' ? ['Ảnh', 'Mã hàng', 'Phân loại', 'Tồn kho', 'Ảnh nhận diện', 'Thao tác'] : ['Phân loại', 'Số mã hàng', 'Thao tác']).map((label, index) => `<th scope="col" class="${label === 'Thao tác' ? 'actions-heading' : label === 'Số mã hàng' ? 'numeric' : ''}">${label}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(state.view === 'products' ? productRow : categoryRow).join('') : `<tr><td colspan="${state.view === 'products' ? 6 : 3}" class="empty-state"><strong>Không có kết quả phù hợp</strong><span>Thử từ khóa khác hoặc xóa bộ lọc.</span><button data-reset>Xóa bộ lọc</button></td></tr>`}</tbody></table></div>`;
  demo.footer = (state, total) => {
    const pages = Math.max(1, Math.ceil(total / state.size));
    const start = total ? (state.page - 1) * state.size + 1 : 0;
    return `<footer class="table-footer"><span class="muted">${start}–${Math.min(state.page * state.size, total)} / ${total} ${state.view === 'products' ? 'mã hàng' : 'phân loại'}</span><div class="pagination"><label class="page-size"><span class="sr-only">Số dòng mỗi trang</span><select id="page-size">${[5, 8, 12].map(size => `<option ${size === state.size ? 'selected' : ''} value="${size}">${size} dòng / trang</option>`).join('')}</select></label><button data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''} aria-label="Trang trước">Trước</button>${Array.from({ length: pages }, (_, index) => `<button class="page-number" data-page="${index + 1}" ${state.page === index + 1 ? 'aria-current="page"' : ''} aria-label="Trang ${index + 1}">${index + 1}</button>`).join('')}<button data-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''} aria-label="Trang sau">Sau</button></div></footer>`;
  };
})();
