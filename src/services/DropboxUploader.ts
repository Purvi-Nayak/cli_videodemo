import RNFS from 'react-native-fs';
import {fastStorage} from '../storage/FastStorage';

// If your RN build does not provide Buffer/atob, install `buffer` and import it:
// import { Buffer } from 'buffer';

const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB

function base64ToUint8Array(base64: string) {
  // prefer global atob if present, otherwise use Buffer
  const binary =
    typeof atob === 'function'
      ? atob(base64)
      : typeof Buffer !== 'undefined'
      ? Buffer.from(base64, 'base64').toString('binary')
      : (() => {
          throw new Error(
            'No base64 decoder: add global.atob or install buffer polyfill',
          );
        })();

  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function uploadFileToDropbox(
  localPath: string,
  dropboxPath: string,
  onProgress?: (pct: number) => void,
) {
  const token = await fastStorage.getString('dropbox_access_token');
  if (!token) throw new Error('No Dropbox token stored');

  // RNFS wants native path (no file://)
  const filePath = localPath.startsWith('file://')
    ? localPath.replace('file://', '')
    : localPath;
  const stat = await RNFS.stat(filePath);
  const size = Number(stat.size);

  let offset = 0;

  // read and send first chunk with upload_session/start
  const firstReadSize = Math.min(CHUNK_SIZE, size);
  const firstChunkBase64 = await RNFS.read(
    filePath,
    firstReadSize,
    0,
    'base64',
  );
  const firstChunkBytes = base64ToUint8Array(firstChunkBase64);

  const startRes = await fetch(
    'https://content.dropboxapi.com/2/files/upload_session/start',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({close: false}),
      },
      // fetch in RN supports TypedArray/ArrayBuffer bodies in many setups
      body: firstChunkBytes,
    },
  );
  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`upload_session/start failed: ${errText}`);
  }
  const startJson = await startRes.json();
  const sessionId = startJson.session_id;
  offset += firstChunkBytes.byteLength;
  onProgress?.(Math.round((offset / size) * 100));

  // append remaining chunks
  while (offset < size) {
    const readSize = Math.min(CHUNK_SIZE, size - offset);
    const chunkBase64 = await RNFS.read(filePath, readSize, offset, 'base64');
    const chunkBytes = base64ToUint8Array(chunkBase64);

    const appendRes = await fetch(
      'https://content.dropboxapi.com/2/files/upload_session/append_v2',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({
            cursor: {session_id: sessionId, offset},
            close: false,
          }),
        },
        body: chunkBytes,
      },
    );
    if (!appendRes.ok) {
      const errText = await appendRes.text();
      throw new Error(`upload_session/append_v2 failed: ${errText}`);
    }

    offset += chunkBytes.byteLength;
    onProgress?.(Math.round((offset / size) * 100));
  }

  // finish upload
  const finishArg = {
    cursor: {session_id: sessionId, offset: size},
    commit: {path: dropboxPath, mode: 'add', autorename: true, mute: false},
  };

  const finishRes = await fetch(
    'https://content.dropboxapi.com/2/files/upload_session/finish',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify(finishArg),
      },
      // when all bytes were already sent, body can be empty
      body: new Uint8Array(0),
    },
  );
  if (!finishRes.ok) {
    const errText = await finishRes.text();
    throw new Error(`upload_session/finish failed: ${errText}`);
  }

  onProgress?.(100);
}
