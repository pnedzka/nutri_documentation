import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, type DocumentRecord } from '../../shared/schema.ts';
import { api } from './api';
import { supabase } from './supabase';

/** Claude accepts images up to 5 MB; larger photos are re-encoded in the browser before upload. */
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
const MAX_IMAGE_SIDE = 4000;

async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= MAX_IMAGE_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.92, 0.85, 0.75]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_IMAGE_BYTES) return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  }
  throw new Error('Zdjęcie jest zbyt duże. Zrób zdjęcie w niższej rozdzielczości.');
}

const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/** Some systems report no type for .docx files; fall back to the extension. */
export function fileType(file: File): string {
  return ACCEPTED_TYPES[file.type] ? file.type : (BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? file.type);
}

export function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES[fileType(file)]) return 'Obsługiwane są pliki PDF, DOCX, JPG i PNG.';
  if (file.size > MAX_UPLOAD_BYTES && !fileType(file).startsWith('image/')) return `Plik może mieć najwyżej ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  return null;
}

/** Creates the document, uploads the file straight to storage and starts processing. */
export async function uploadDocument(
  original: File,
  products: { npProductName: string; npProductCode: string },
  onStep: (step: string) => void,
): Promise<DocumentRecord> {
  if (!supabase) throw new Error('Aplikacja nie jest skonfigurowana.');
  onStep('Przygotowanie pliku…');
  const file = await shrinkImage(new File([original], original.name, { type: fileType(original) }));
  const { document, upload } = await api<{ document: DocumentRecord; upload: { path: string; token: string } }>('/api/documents', {
    method: 'POST',
    body: { filename: original.name, mimeType: file.type, size: file.size, ...products },
  });
  onStep('Wysyłanie pliku…');
  const { error } = await supabase.storage.from('originals').uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
  if (error) {
    await api(`/api/documents/${document.id}`, { method: 'DELETE' }).catch(() => {});
    throw new Error(`Nie udało się wysłać pliku: ${error.message}`);
  }
  onStep('Uruchamianie przetwarzania…');
  const { document: started } = await api<{ document: DocumentRecord }>(`/api/documents/${document.id}/process`, { method: 'POST' });
  return started;
}
