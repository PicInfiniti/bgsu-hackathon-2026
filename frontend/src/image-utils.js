// Photos are resized in the browser (max 1600 px) before upload. Aivana takes PNG and JPEG only.
export const PHOTO_TYPES = ['image/png', 'image/jpeg'];
export const MAX_PHOTOS = 5;

export function isHeic(file) {
  return /hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
}

export function fitSize(width, height, max = 1600) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function resizePhoto(file, max = 1600) {
  if (isHeic(file)) throw Error('iPhone HEIC photos are not supported here. In Photos, share it as JPEG (or set Camera > Formats > Most Compatible) and try again.');
  if (file.size > 8 * 1024 * 1024) throw Error('Use an image under 8 MB.');
  if (!PHOTO_TYPES.includes(file.type)) throw Error('Use a PNG or JPEG photo.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(Error('This photo could not be opened.')); i.src = url; });
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 80000000) throw Error('This image is too large to open. Resize it first.');
    const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, max);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally { URL.revokeObjectURL(url); }
}
