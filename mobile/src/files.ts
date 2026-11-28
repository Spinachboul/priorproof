import * as FileSystem from 'expo-file-system/legacy';
import { ApiError, responseError, type Session } from './session';
import { casePath } from './types';

export type PendingFile = { id: string; uri: string; name: string; mime: string; category: string; owned: boolean };

export function discard(uri: string) {
  return FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

export function uploadFile(session: Session, caseId: string, file: PendingFile, progress: (percent: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Upload cancelled.')); return; }
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    signal.addEventListener('abort', abort, { once: true });
    request.open('POST', session.server + casePath(caseId) + '/documents');
    request.setRequestHeader('Authorization', 'Bearer ' + session.token);
    request.timeout = 120000;
    request.upload.onprogress = event => {
      if (event.lengthComputable) progress(Math.floor(100 * event.loaded / event.total));
    };
    request.onloadend = () => signal.removeEventListener('abort', abort);
    request.onerror = () => reject(new Error('Upload connection failed. Retry the remaining files.'));
    request.ontimeout = () => reject(new Error('Upload timed out. Retry the remaining files.'));
    request.onabort = () => reject(new Error('Upload cancelled.'));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) { resolve(); return; }
      let payload: unknown;
      try { payload = JSON.parse(request.responseText); } catch { payload = null; }
      reject(responseError(request.status, payload));
    };

    const form = new FormData();
    form.append('categories', file.category);
    form.append('upload_id', file.id);
    // React Native FormData accepts native URI descriptors for multipart files.
    form.append('files', { uri: file.uri, name: file.name, type: file.mime } as unknown as Blob);
    request.send(form);
  });
}

export function expired(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}
