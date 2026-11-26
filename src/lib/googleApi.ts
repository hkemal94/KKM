import { getCachedAccessToken } from './firebase';

/**
 * Generic helper to make authenticated requests to Google APIs.
 */
async function googleFetch(url: string, options: RequestInit = {}) {
  const token = getCachedAccessToken();
  if (!token) {
    throw new Error('Google Workspace bağlantısı bulunamadı. Lütfen önce giriş yapın veya bağlantıyı yenileyin.');
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let errorMsg = `Google API hatası: ${response.statusText}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.error?.message || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  return response.json();
}

/**
 * Google Docs APIs
 */
export async function createGoogleDoc(title: string, bodyContent: string) {
  // 1. Create empty document
  const docObj = await googleFetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

  const documentId = docObj.documentId;

  // 2. Insert content into the document if it has content
  if (bodyContent && documentId) {
    await googleFetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: bodyContent,
            },
          },
        ],
      }),
    });
  }

  return docObj;
}
