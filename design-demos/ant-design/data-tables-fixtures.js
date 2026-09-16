/* Fixtures are shared across directions; references are counts, not actual photographs. */
window.tableDemo = {
  products: [
    { id: 'BL-M08-030', name: 'Bu lông lục giác M8 × 30', category: 'Bu lông', stock: 240, images: 4 },
    { id: 'BL-M10-050', name: 'Bu lông lục giác M10 × 50', category: 'Bu lông', stock: 180, images: 3 },
    { id: 'DO-M08', name: 'Đai ốc lục giác M8', category: 'Đai ốc', stock: 320, images: 2 },
    { id: 'DO-M10', name: 'Đai ốc lục giác M10', category: 'Đai ốc', stock: 4, images: 0 },
    { id: 'VD-M08', name: 'Vòng đệm phẳng M8', category: 'Vòng đệm', stock: 0, images: 3 },
    { id: 'VD-M10', name: 'Vòng đệm phẳng M10', category: 'Vòng đệm', stock: 96, images: 0 },
    { id: 'VT-04-025', name: 'Vít tự khoan 4 × 25', category: 'Vít', stock: 125, images: 5 },
    { id: 'VT-05-040', name: 'Vít đầu bằng 5 × 40', category: 'Vít', stock: 3, images: 0 },
    { id: 'TK-06', name: 'Tắc kê nhựa 6 mm', category: 'Tắc kê', stock: 500, images: 2 },
    { id: 'TK-08', name: 'Tắc kê sắt 8 mm', category: 'Tắc kê', stock: 0, images: 0 },
    { id: 'CH-03', name: 'Chốt hãm 3 mm', category: 'Chưa phân loại', stock: 18, images: 0 },
    { id: 'BL-M12-060', name: 'Bu lông lục giác M12 × 60', category: 'Bu lông', stock: 5, images: 1 },
  ],
  categoryNames: ['Bu lông', 'Đai ốc', 'Vòng đệm', 'Vít', 'Tắc kê', 'Chưa phân loại'],
  stockOptions: [['all', 'Tất cả'], ['available', 'Còn hàng'], ['low', 'Sắp hết'], ['empty', 'Hết hàng']],
  imageOptions: [['all', 'Tất cả'], ['missing', 'Chưa có ảnh'], ['with_image', 'Đã có ảnh']],
};
window.tableDemo.escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
window.tableDemo.icon = name => {
  const paths = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
    filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
    camera: '<path d="M14.5 4h-5L7 7H3v13h18V7h-4z"/><circle cx="12" cy="13" r="3"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    pencil: '<path d="m16 3 5 5-13 13H3v-5zM14 5l5 5"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    moon: '<path d="M21 12.5A9 9 0 1 1 11.5 3 7 7 0 0 0 21 12.5Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    settings: '<path d="m9 3 1-1h4l1 3 3 2 3 1v4l-3 2-1 3-2 4h-4l-2-3-3-1-3-2v-4l3-2 1-3z"/><circle cx="12" cy="12" r="3"/>',
  };
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
};
