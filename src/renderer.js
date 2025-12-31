import './index.css';

let draggedTab = null;
let sidebarVisible = false;
let isRenaming = false;

function adjustTabWidths() {
  const tabsContainer = document.getElementById('tabs');
  const tabs = document.querySelectorAll('.tab-frame');
  
  if (!tabsContainer || tabs.length === 0) return;
  
  const tabCount = tabs.length;
  const idealWidth = 264;
  const minWidth = 120;
  
  let tabWidth = idealWidth;
  
  if (tabCount > 1) {
    const sidebarToggleWidth = 45;
    const newTabBtnWidth = 44;
    const windowButtonsWidth = 135;
    const availableWidth = window.innerWidth - sidebarToggleWidth - newTabBtnWidth - windowButtonsWidth - 32;
    
    const effectiveTabWidth = availableWidth / tabCount + 15;
    tabWidth = Math.max(minWidth, Math.min(idealWidth, effectiveTabWidth));
  }
  
  tabs.forEach(tab => {
    tab.style.flex = `0 0 ${tabWidth}px`;
  });
}

document.getElementById('sidebar-toggle').addEventListener('click', () => {
  sidebarVisible = !sidebarVisible;
  document.getElementById('sidebar').classList.toggle('visible', sidebarVisible);
  window.electronAPI.sidebarToggled(sidebarVisible);
});

document.getElementById('new-tab').addEventListener('click', () => {
  window.electronAPI.createTab();
});

document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.electronAPI.close());

document.addEventListener('keydown', (e) => {
  // Ctrl + Tab navigation
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    if (e.shiftKey) {
      window.electronAPI.prevTab();
    } else {
      window.electronAPI.nextTab();
    }
  }

  // Ctrl + " to toggle sidebar
  if (e.ctrlKey && e.key === "'") {
    e.preventDefault();
    sidebarVisible = !sidebarVisible;
    document.getElementById('sidebar').classList.toggle('visible', sidebarVisible);
    window.electronAPI.sidebarToggled(sidebarVisible);
  }
});

function startRename(tabId) {
  const tabContainer = document.querySelector(`.tab-container[data-id="${tabId}"]`);
  if (!tabContainer) return;
  
  const titleEl = tabContainer.querySelector('.title');
  if (!titleEl) return;
  
  isRenaming = true;
  const currentName = titleEl.textContent;
  const input = document.createElement('input');
  input.className = 'tab-rename';
  input.value = currentName;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const save = () => {
    if (!isRenaming) return;
    isRenaming = false;
    const newName = input.value.trim() || currentName;
    const newTitle = document.createElement('div');
    newTitle.className = 'title';
    newTitle.textContent = newName;
    input.replaceWith(newTitle);
    tabContainer.title = newName;
    window.electronAPI.renameTab(tabId, newName);
    
    const sidebarTab = document.querySelector(`.sidebar-tab[data-id="${tabId}"] .sidebar-name`);
    if (sidebarTab) sidebarTab.textContent = newName;
  };

  const cancel = () => {
    if (!isRenaming) return;
    isRenaming = false;
    const newTitle = document.createElement('div');
    newTitle.className = 'title';
    newTitle.textContent = currentName;
    input.replaceWith(newTitle);
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      save();
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      cancel();
    }
  });
}

// Listen for rename request from native menu
window.electronAPI.onStartRename((tabId) => {
  startRename(tabId);
});

function createSidebarTab(id, name, muted) {
  const sidebarTab = document.createElement('div');
  sidebarTab.className = 'sidebar-tab';
  sidebarTab.dataset.id = id;
  sidebarTab.dataset.muted = muted;
  sidebarTab.innerHTML = `
    <span class="sidebar-name">${name}</span>
    <span class="sidebar-badge"></span>
  `;
  
  sidebarTab.addEventListener('click', () => {
    window.electronAPI.switchTab(id);
  });
  
  sidebarTab.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.electronAPI.showContextMenu(id);
  });
  
  document.getElementById('sidebar-tabs').appendChild(sidebarTab);
}

window.electronAPI.onTabCreated(({ id, name, muted }) => {
  createSidebarTab(id, name, muted);
  
  const tabFrame = document.createElement('div');
  tabFrame.className = 'tab-frame';
  
  const tabContainer = document.createElement('div');
  tabContainer.className = 'tab-container active';
  tabContainer.dataset.id = id;
  tabContainer.dataset.muted = muted;
  tabContainer.draggable = true;
  tabContainer.title = name;
  
  tabContainer.innerHTML = `
    <div class="tab">
      <div class="title">${name}</div>
      <div class="mute-icon" ${muted ? 'style="display:flex"' : 'style="display:none"'}>
        <svg viewBox="0 0 16 16" fill="currentColor">
           <path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06zM6 5.04 4.312 6.39A.5.5 0 0 1 4 6.5H2v3h2a.5.5 0 0 1 .312.11L6 10.96V5.04zm7.854.606a.5.5 0 0 1 0 .708L12.207 8l1.647 1.646a.5.5 0 0 1-.708.708L11.5 8.707l-1.646 1.647a.5.5 0 0 1-.708-.708L10.793 8 9.146 6.354a.5.5 0 1 1 .708-.708L11.5 7.293l1.646-1.647a.5.5 0 0 1 .708 0z"/>
        </svg>
      </div>
      <span class="unread-badge" style="display:none"></span>
      <button class="tab-btn close-btn" title="Close tab">
        <svg viewBox="0 0 16 16">
          <path d="M16 1.6L14.4 0 8 6.4 1.6 0 0 1.6 6.4 8 0 14.4 1.6 16 8 9.6l6.4 6.4 1.6-1.6L9.6 8 16 1.6z"/>
        </svg>
      </button>
    </div>
    <div class="round round-left"></div>
    <div class="round round-right"></div>
  `;

  tabContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.electronAPI.showContextMenu(id);
  });

  tabContainer.addEventListener('dragstart', (e) => {
    draggedTab = tabFrame;
    tabContainer.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  tabContainer.addEventListener('dragend', () => {
    tabContainer.classList.remove('dragging');
    draggedTab = null;
  });

  tabContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (draggedTab && draggedTab !== tabFrame) {
      const container = document.getElementById('tabs');
      const frames = [...container.querySelectorAll('.tab-frame:not(.dragging)')];
      const afterElement = frames.find(f => {
        const box = f.getBoundingClientRect();
        return e.clientX < box.left + box.width / 2;
      });
      if (afterElement) {
        container.insertBefore(draggedTab, afterElement);
      } else {
        container.appendChild(draggedTab);
      }
    }
  });

  tabContainer.addEventListener('drop', () => {
    const container = document.getElementById('tabs');
    const framesArr = [...container.querySelectorAll('.tab-frame')];
    const fromIndex = framesArr.indexOf(draggedTab);
    const toIndex = framesArr.indexOf(tabFrame);
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      window.electronAPI.reorderTabs(fromIndex, toIndex);
    }
  });

  tabContainer.addEventListener('click', (e) => {
    if (!e.target.closest('.tab-btn') && !isRenaming) {
      window.electronAPI.switchTab(id);
    }
  });

  tabContainer.addEventListener('dblclick', (e) => {
    if (isRenaming) return;
    if (e.target.closest('.tab') && !e.target.closest('.tab-btn')) {
      startRename(id);
    }
  });

  tabContainer.querySelector('.close-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    window.electronAPI.closeTab(id);
  });

  tabFrame.appendChild(tabContainer);
  document.getElementById('tabs').appendChild(tabFrame);
  
  document.querySelectorAll('.tab-container').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
  tabContainer.classList.add('active');
  document.querySelector(`.sidebar-tab[data-id="${id}"]`)?.classList.add('active');
  
  setTimeout(adjustTabWidths, 0);
});

window.electronAPI.onTabSwitched((tabId) => {
  document.querySelectorAll('.tab-container').forEach(t => {
    t.classList.toggle('active', t.dataset.id == tabId);
  });
  document.querySelectorAll('.sidebar-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.id == tabId);
  });
});

window.electronAPI.onTabClosed((tabId) => {
  document.querySelector(`.tab-container[data-id="${tabId}"]`)?.closest('.tab-frame')?.remove();
  document.querySelector(`.sidebar-tab[data-id="${tabId}"]`)?.remove();
  
  setTimeout(adjustTabWidths, 0);
});

window.electronAPI.onTabMuted(({ id, muted }) => {
  const tabContainer = document.querySelector(`.tab-container[data-id="${id}"]`);
  const sidebarTab = document.querySelector(`.sidebar-tab[data-id="${id}"]`);
  if (tabContainer) {
    tabContainer.dataset.muted = muted;
    const muteIcon = tabContainer.querySelector('.mute-icon');
    if (muteIcon) muteIcon.style.display = muted ? 'flex' : 'none';
  }
  if (sidebarTab) sidebarTab.dataset.muted = muted;
});

window.electronAPI.onTabUnread(({ id, unread }) => {
  const tabContainer = document.querySelector(`.tab-container[data-id="${id}"]`);
  const sidebarTab = document.querySelector(`.sidebar-tab[data-id="${id}"]`);
  
  if (tabContainer) {
    const badge = tabContainer.querySelector('.unread-badge');
    if (unread > 0) {
      badge.textContent = unread;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
  
  if (sidebarTab) {
    const badge = sidebarTab.querySelector('.sidebar-badge');
    if (unread > 0) {
      badge.textContent = unread;
      badge.classList.add('visible');
    } else {
      badge.classList.remove('visible');
    }
  }
});

window.electronAPI.onTabRenamed(({ id, name }) => {
  const tabContainer = document.querySelector(`.tab-container[data-id="${id}"]`);
  const sidebarTab = document.querySelector(`.sidebar-tab[data-id="${id}"]`);
  
  if (tabContainer) {
    const title = tabContainer.querySelector('.title');
    if (title) title.textContent = name;
    tabContainer.title = name;
  }
  
  if (sidebarTab) {
    const sidebarName = sidebarTab.querySelector('.sidebar-name');
    if (sidebarName) sidebarName.textContent = name;
  }
});

window.electronAPI.onTabsReordered((tabIds) => {
  const container = document.getElementById('tabs');
  tabIds.forEach(id => {
    const tabFrame = container.querySelector(`.tab-container[data-id="${id}"]`)?.closest('.tab-frame');
    if (tabFrame) container.appendChild(tabFrame);
  });
});

window.electronAPI.onThemeChanged((theme) => {
  document.body.dataset.theme = theme;
});

window.addEventListener('resize', adjustTabWidths);

window.addEventListener('load', adjustTabWidths);

// Badge drawing
window.electronAPI.onDrawBadge((count) => {
  if (count === 0) {
    window.electronAPI.updateBadge(null);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d', { alpha: true });

  // Disable anti-aliasing
  ctx.imageSmoothingEnabled = false;

  // Draw red circle (pixel perfect)
  ctx.fillStyle = '#f24643';
  ctx.beginPath();
  ctx.arc(8, 8, 7, 0, 2 * Math.PI);
  ctx.fill();

  // Draw text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  
  let text = String(count);
  if (count > 9) {
    text = '9+';
    ctx.font = '600 7px "Segoe UI"';
  } else {
    ctx.font = '600 9px "Segoe UI"';
  }

  ctx.fillText(text, 8, 8.95);

  window.electronAPI.updateBadge(canvas.toDataURL('image/png'));
});