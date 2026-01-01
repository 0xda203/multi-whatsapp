import { app, BrowserWindow, BrowserView, ipcMain, nativeTheme, Menu, nativeImage, shell, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { t } from './i18n/index.js'; 

if (started) app.quit();

app.setAppUserModelId('com.multiwhatsapp.app');

let mainWindow;
let tabs = [];
let activeTabId = null;
let sidebarWidth = 0;

let isQuitting = false; 

const TAB_BAR_HEIGHT = 42;
const dataPath = path.join(app.getPath('userData'), 'tabs.json');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSavedData() {
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      if (Array.isArray(data)) {
        return {
          tabs: data.map(t => ({ ...t, customName: false })),
          activeTabId: data[0]?.id || null
        };
      }
      return data;
    }
  } catch (e) { }
  return { tabs: [], activeTabId: null };
}

function saveData() {
  const data = {
    activeTabId: activeTabId,
    tabs: tabs.map((t) => ({
      id: t.id,
      name: t.name,
      muted: t.muted,
      customName: t.customName || false
    }))
  };
  fs.writeFileSync(dataPath, JSON.stringify(data));
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (e) { }
  return { confirmOnClose: true };
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
}

function updateAllTabBounds() {
  if (!mainWindow) return;
  const bounds = mainWindow.getContentBounds();
  const contentWidth = bounds.width - sidebarWidth;
  const contentHeight = bounds.height - TAB_BAR_HEIGHT;

  tabs.forEach(tab => {
    if (tab.id === activeTabId) {
      tab.view.setBounds({ x: sidebarWidth, y: TAB_BAR_HEIGHT, width: contentWidth, height: contentHeight });
    } else {
      tab.view.setBounds({ x: -3000, y: TAB_BAR_HEIGHT, width: contentWidth, height: contentHeight });
    }
  });
}

function recalculateTabNames() {
  let changed = false;
  tabs.forEach((tab, index) => {
    if (!tab.customName) {
      const newName = `WhatsApp ${index + 1}`;
      if (tab.name !== newName) {
        tab.name = newName;
        mainWindow.webContents.send('tab-renamed', { id: tab.id, name: newName });
        changed = true;
      }
    }
  });
  if (changed) saveData();
}

function updateTotalUnread() {
  const total = tabs.reduce((acc, t) => {
    if (t.muted) return acc;
    return acc + (t.unread || 0);
  }, 0);

  mainWindow.webContents.send('draw-badge', total);
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    show: false,
    icon: path.join(__dirname, '../src/images/ic_outline-whatsapp.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const menuTemplate = [
    {
      label: t('file'),
      submenu: [
        { label: t('quit'), role: 'quit' }, // Ctrl+Q
        { label: t('close'), role: 'close' } // Ctrl+W
      ]
    },
    { label: t('edit'), role: 'editMenu' },
    { label: t('view'), role: 'viewMenu' },
    { label: t('window'), role: 'windowMenu' }
  ];
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.on('close', (e) => {
    // If we are already in the process of quitting, or settings say don't ask
    const settings = loadSettings();
    
    if (isQuitting || !settings.confirmOnClose) {
      return; // Proceed with closing
    }

    // Prevent default close
    e.preventDefault();

    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: [t('yes'), t('no')],
      defaultId: 0,
      cancelId: 1,
      title: t('confirmTitle'),
      message: t('confirmMessage'),
      checkboxLabel: t('dontAsk'),
      checkboxChecked: false,
    }).then(({ response, checkboxChecked }) => {
      if (response === 0) { // User clicked 'Yes'
        if (checkboxChecked) {
          // Update settings to not ask again
          saveSettings({ confirmOnClose: false });
        }

        // Set flag to true so the next close event passes through
        isQuitting = true;
        app.quit();
      }
      // If response === 1 (No), we do nothing, preventing the close.
    });
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');

    const savedData = loadSavedData();

    if (savedData.activeTabId) {
      activeTabId = savedData.activeTabId;
    }

    if (savedData.tabs.length > 0) {
      savedData.tabs.forEach(t => createTab(t.id, t.name, t.muted, t.customName));
    } else {
      createTab();
    }

    if (!tabs.find(t => t.id === activeTabId) && tabs.length > 0) {
      activeTabId = tabs[0].id;
    }

    recalculateTabNames();
    updateAllTabBounds();
    mainWindow.webContents.send('tab-switched', activeTabId);

    mainWindow.show();
  });

  nativeTheme.on('updated', () => {
    mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  });

  mainWindow.on('resize', updateAllTabBounds);
  mainWindow.on('maximize', updateAllTabBounds);
  mainWindow.on('unmaximize', updateAllTabBounds);
};

function createTab(existingId = null, existingName = null, existingMuted = false, existingCustomName = false) {
  const tabId = existingId || Date.now();
  const tabName = existingName || `WhatsApp`;

  const view = new BrowserView({
    webPreferences: {
      partition: `persist:whatsapp-${tabId}`,
      backgroundThrottling: false,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'view-preload.js'),
    },
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  view.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    // If navigating away from WhatsApp Web, block it and open externally
    if (parsedUrl.hostname !== 'web.whatsapp.com') {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  view.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  view.webContents.setBackgroundThrottling(false);

  if (existingMuted) {
    view.webContents.setAudioMuted(true);
  }

  view.webContents.on('did-finish-load', () => {
    const currentTab = tabs.find(t => t.id === tabId);
    if (currentTab) {
      view.webContents.send('set-muted', currentTab.muted);
    }
  });

  const tabData = {
    id: tabId,
    view,
    name: tabName,
    unread: 0,
    muted: existingMuted,
    customName: existingCustomName
  };

  tabs.push(tabData);
  mainWindow.addBrowserView(view);

  const checkPermission = (permission) => {
    const currentTab = tabs.find(t => t.id === tabId);
    if (permission === 'notifications' && currentTab && currentTab.muted) {
      return false;
    }
    const allowedPermissions = ['notifications', 'media', 'mediaKeySystem', 'geolocation', 'clipboard-read', 'clipboard-sanitized-write'];
    return allowedPermissions.includes(permission);
  };

  view.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(checkPermission(permission));
  });

  view.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    return checkPermission(permission);
  });

  const bounds = mainWindow.getContentBounds();
  const contentWidth = bounds.width - sidebarWidth;
  const contentHeight = bounds.height - TAB_BAR_HEIGHT;

  if (tabId === activeTabId) {
    view.setBounds({ x: sidebarWidth, y: TAB_BAR_HEIGHT, width: contentWidth, height: contentHeight });
  } else {
    view.setBounds({ x: -3000, y: TAB_BAR_HEIGHT, width: contentWidth, height: contentHeight });
  }

  view.setAutoResize({ width: false, height: false });
  view.webContents.loadURL('https://web.whatsapp.com');

  mainWindow.webContents.send('tab-created', { id: tabId, name: tabName, muted: existingMuted });

  if (!activeTabId) {
    activeTabId = tabId;
  }

  recalculateTabNames();
  saveData();
}

function switchTab(tabId) {
  activeTabId = tabId;
  updateAllTabBounds();
  mainWindow.webContents.send('tab-switched', tabId);
  saveData();
}

function switchToNextTab() {
  if (tabs.length < 2) return;
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);
  const nextIndex = (currentIndex + 1) % tabs.length;
  switchTab(tabs[nextIndex].id);
}

function switchToPrevTab() {
  if (tabs.length < 2) return;
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);
  const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  switchTab(tabs[prevIndex].id);
}

function closeTab(tabId) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index !== -1) {
    mainWindow.removeBrowserView(tabs[index].view);
    tabs[index].view.webContents.destroy();
    tabs.splice(index, 1);

    if (tabs.length > 0 && activeTabId === tabId) {
      switchTab(tabs[Math.max(0, index - 1)].id);
    }

    recalculateTabNames();
    saveData();
    updateTotalUnread();
  }
  mainWindow.webContents.send('tab-closed', tabId);
}

function clearTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.view.webContents.session.clearStorageData();
    tab.view.webContents.loadURL('https://web.whatsapp.com');
  }
}

function refreshTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.view.webContents.reload();
  }
}

function renameTab(tabId, newName) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.name = newName;
    tab.customName = true;
    saveData();
    mainWindow.webContents.send('tab-renamed', { id: tabId, name: newName });
  }
}

function reorderTabs(fromIndex, toIndex) {
  const [moved] = tabs.splice(fromIndex, 1);
  tabs.splice(toIndex, 0, moved);
  recalculateTabNames();
  saveData();
  mainWindow.webContents.send('tabs-reordered', tabs.map(t => t.id));
}

ipcMain.on('update-badge', (_, dataUrl) => {
  if (!mainWindow) return;

  if (!dataUrl) {
    mainWindow.setOverlayIcon(null, '');
    return;
  }

  const image = nativeImage.createFromDataURL(dataUrl);
  mainWindow.setOverlayIcon(image, 'Unread messages');
});

ipcMain.on('create-tab', () => createTab());
ipcMain.on('switch-tab', (_, tabId) => switchTab(tabId));
ipcMain.on('close-tab', (_, tabId) => closeTab(tabId));
ipcMain.on('clear-tab', (_, tabId) => clearTab(tabId));
ipcMain.on('refresh-tab', (_, tabId) => refreshTab(tabId));
ipcMain.on('rename-tab', (_, { tabId, name }) => renameTab(tabId, name));
ipcMain.on('reorder-tabs', (_, { fromIndex, toIndex }) => reorderTabs(fromIndex, toIndex));
ipcMain.on('sidebar-toggled', (_, visible) => {
  sidebarWidth = visible ? 200 : 0;
  updateAllTabBounds();
});
ipcMain.on('next-tab', () => switchToNextTab());
ipcMain.on('prev-tab', () => switchToPrevTab());
ipcMain.on('minimize', () => mainWindow.minimize());
ipcMain.on('maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('close', () => mainWindow.close());

ipcMain.on('show-context-menu', (event, tabId) => {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  const template = [
    { label: t('rename'), click: () => mainWindow.webContents.send('start-rename', tabId) },
    { label: t('refresh'), click: () => refreshTab(tabId) },
    {
      label: tab.muted ? t('unmute') : t('mute'),
      click: () => {
        tab.muted = !tab.muted;
        tab.view.webContents.setAudioMuted(tab.muted);
        tab.view.webContents.send('set-muted', tab.muted);
        saveData();
        mainWindow.webContents.send('tab-muted', { id: tabId, muted: tab.muted });
        updateTotalUnread();
      }
    },
    { label: t('clearSession'), click: () => clearTab(tabId) },
    { type: 'separator' },
    { label: t('closeTab'), click: () => closeTab(tabId) }
  ];

  Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

ipcMain.on('toggle-mute-tab', (_, tabId) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.muted = !tab.muted;
    tab.view.webContents.setAudioMuted(tab.muted);
    tab.view.webContents.send('set-muted', tab.muted);
    saveData();
    mainWindow.webContents.send('tab-muted', { id: tabId, muted: tab.muted });
    updateTotalUnread();
  }
});

ipcMain.on('unread-count-changed', (event, count) => {
  const tab = tabs.find(t => t.view.webContents.id === event.sender.id);
  if (tab) {
    tab.unread = count;
    mainWindow.webContents.send('tab-unread', { id: tab.id, unread: count });
    updateTotalUnread();
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());