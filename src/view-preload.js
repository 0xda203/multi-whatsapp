const { ipcRenderer, webFrame } = require('electron');

webFrame.executeJavaScript(`
  window.__ELECTRON_MUTED__ = false;

  // 1. Override standard Notification API
  const OriginalNotification = window.Notification;
  window.Notification = class extends OriginalNotification {
    constructor(title, options) {
      if (window.__ELECTRON_MUTED__) {
        // Return a dummy object or just stop
        return { close: () => {} };
      }
      super(title, options);
    }
  };

  // 2. Override ServiceWorker showNotification
  // This handles notifications triggered by the page via the service worker
  const _navigator = navigator;
  if (_navigator.serviceWorker) {
    _navigator.serviceWorker.ready.then(reg => {
      const originalShow = reg.showNotification;
      reg.showNotification = function(title, options) {
        if (window.__ELECTRON_MUTED__) {
          console.log('Blocked notification due to mute');
          return Promise.resolve();
        }
        return originalShow.apply(this, arguments);
      };
    });
  }
`);

ipcRenderer.on('set-muted', (_, muted) => {
  webFrame.executeJavaScript(`window.__ELECTRON_MUTED__ = ${muted};`);
});

if (navigator.permissions) {
  const originalQuery = navigator.permissions.query;
  navigator.permissions.query = (parameters) => {
    if (parameters.name === 'notifications') {
      return Promise.resolve({ state: 'granted' });
    }
    return originalQuery(parameters);
  };
}

// Watch the document title for unread counts e.g. "(3) WhatsApp"
window.addEventListener('DOMContentLoaded', () => {
  const titleObserver = new MutationObserver(() => {
    const title = document.title;
    const matches = title.match(/^\((\d+)\)/);
    const count = matches ? parseInt(matches[1], 10) : 0;
    ipcRenderer.send('unread-count-changed', count);
  });

  const titleElement = document.querySelector('title');
  if (titleElement) {
    titleObserver.observe(titleElement, {
      subtree: true,
      characterData: true,
      childList: true
    });
  }
});