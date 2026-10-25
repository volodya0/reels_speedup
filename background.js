// Service worker: завантаження файлу через chrome.downloads (обходить CORS CDN Instagram)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'igsr-download') return;

  chrome.downloads.download(
    { url: msg.url, filename: msg.filename, conflictAction: 'uniquify' },
    downloadId => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, downloadId });
      }
    }
  );
  return true; // відповідь асинхронна
});
