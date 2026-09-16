import type { ScannerReviewItem } from "@/components/scanner-review-layout";

// Deterministic visual-test data; never a replacement for recognition responses.
export const referenceItems: ScannerReviewItem[] = [
  { id: "water", name: "Nước khoáng 500 ml", code: "HH001", category: "Đồ uống", quantity: 3 },
  { id: "cookies", name: "Bánh quy", code: "HH002", category: "Bánh kẹo", quantity: 2 },
  { id: "milk", name: "Sữa tươi", code: "HH003", category: "Sữa", quantity: 1 },
];
export const referenceBoxes: Array<{ id: string; groupId: string; box: [number, number, number, number] }> = [
  { id: "water-1", groupId: "water", box: [100, 70, 230, 375] },
  { id: "water-2", groupId: "water", box: [350, 70, 480, 375] },
  { id: "water-3", groupId: "water", box: [600, 70, 730, 375] },
  { id: "cookies-1", groupId: "cookies", box: [170, 425, 355, 640] },
  { id: "cookies-2", groupId: "cookies", box: [460, 435, 645, 650] },
  { id: "milk-1", groupId: "milk", box: [760, 400, 915, 640] },
];
const bottle = (x: number) => `<g transform="translate(${x} 70)"><rect x="45" width="40" height="25" rx="5" fill="#3885a0"/><path d="M40 25h50v25l35 32v212H5V82l35-32z" fill="#dce9ec" stroke="#91b5c1" stroke-width="3"/><rect x="8" y="130" width="114" height="100" fill="white"/><path d="M8 203l42-28 45 22 27-8v41H8z" fill="#85bed0"/><text x="65" y="166" text-anchor="middle" font-size="18" fill="#236389">NƯỚC</text></g>`;
const biscuit = (x: number, y: number) => `<g transform="translate(${x} ${y})"><path d="M0 0h185l-15 24v175l15 16H0l15-16V24z" fill="#b98d54" stroke="#94703f" stroke-width="4"/><rect x="20" y="61" width="145" height="130" rx="12" fill="#e2c58e"/><text x="92" y="95" text-anchor="middle" font-size="22" fill="#664b30">BÁNH</text><circle cx="64" cy="139" r="18" fill="#997448"/><circle cx="116" cy="153" r="24" fill="#997448"/></g>`;
const scene = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="#e8e7de"/><rect x="24" y="24" width="952" height="652" rx="16" fill="none" stroke="#c9c9bf" stroke-width="3"/>${bottle(100)}${bottle(350)}${bottle(600)}${biscuit(170,425)}${biscuit(460,435)}<g transform="translate(760 400)"><path d="M25 0h105l25 42v198H0V42z" fill="#d5dfc6" stroke="#a0ad93" stroke-width="3"/><path d="M0 135q75-45 155 0v105H0z" fill="#83a779"/><path d="M25 0l28 42H0z" fill="#a7bb99"/><circle cx="110" cy="25" r="12" fill="#f4f4e7"/><text x="77" y="90" text-anchor="middle" font-size="26" fill="#46664a">SỮA</text></g></svg>`;
export const referenceImageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(scene)}`;
