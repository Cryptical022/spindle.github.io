// ═══════════════════════════════════════════════════
// STORAGE SCHEMA
//
//  localStorage:
//      'spindle_index'     → [{ id, name, savedAt }]
//      'spindle_proj_{id}' → { id, name, savedAt, tree, activeWheelId, spinResults }
//      'spindle_settings'  → { Appearance: { Theme, Accent }, Behaviour: { ... } }
//
//  currentProject: in-memory working copy
//  isDirty:        true when working copy differs from last save
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// THEME ENGINE
// ═══════════════════════════════════════════════════

const ACCENT_PRESETS = {
    purple:  {
        h: 258,
        dark:  { accent: '#7c5cfc', accent2: '#a78bfa' },
        light: { accent: '#6d48f5', accent2: '#7c5cfc' },
    },
    amber:   {
        h: 38,
        dark:  { accent: '#f0b429', accent2: '#fbbf24' },
        light: { accent: '#b45309', accent2: '#d97706' },
    },
    emerald: {
        h: 160,
        dark:  { accent: '#10d488', accent2: '#34d399' },
        light: { accent: '#047857', accent2: '#059669' },
    },
    rose:    {
        h: 350,
        dark:  { accent: '#fb7185', accent2: '#fda4af' },
        light: { accent: '#be123c', accent2: '#e11d48' },
    },
    sky:     {
        h: 200,
        dark:  { accent: '#38bdf8', accent2: '#7dd3fc' },
        light: { accent: '#0369a1', accent2: '#0284c7' },
    },
};

function buildThemeVars(h, isDark) {
    return isDark ? {
        '--bg':      `hsl(${h} 28% 7%)`,
        '--bg2':     `hsl(${h} 28% 10%)`,
        '--bg3':     `hsl(${h} 26% 13%)`,
        '--bg4':     `hsl(${h} 24% 17%)`,
        '--border':  `hsl(${h} 22% 21%)`,
        '--border2': `hsl(${h} 20% 30%)`,
        '--text':    `hsl(${h} 55% 94%)`,
        '--text2':   `hsl(${h} 22% 65%)`,
        '--text3':   `hsl(${h} 16% 40%)`,
        '--gold':    '#f0b429',
        '--danger':  '#f87171',
        '--success': '#34d399',
        '--warn':    '#fb923c',
    } : {
        '--bg':      `hsl(${h} 40% 97%)`,
        '--bg2':     `hsl(${h} 22% 100%)`,
        '--bg3':     `hsl(${h} 36% 93%)`,
        '--bg4':     `hsl(${h} 32% 87%)`,
        '--border':  `hsl(${h} 26% 83%)`,
        '--border2': `hsl(${h} 22% 71%)`,
        '--text':    `hsl(${h} 48% 11%)`,
        '--text2':   `hsl(${h} 28% 30%)`,
        '--text3':   `hsl(${h} 18% 52%)`,
        '--gold':    '#92400e',
        '--danger':  '#dc2626',
        '--success': '#059669',
        '--warn':    '#b45309',
    };
}

function applyTheme(theme, accentId) {
    const preset = ACCENT_PRESETS[accentId] || ACCENT_PRESETS.purple;
    const isDark = theme !== 'light';
    const vars = buildThemeVars(preset.h, isDark);
    const accents = isDark ? preset.dark : preset.light;
    const root = document.documentElement;

    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.style.setProperty('--accent', accents.accent);
    root.style.setProperty('--accent2', accents.accent2);
    root.dataset.theme = theme;
    root.dataset.accent = accentId;
}

// ═══════════════════════════════════════════════════
// SETTINGS SYSTEM
// ═══════════════════════════════════════════════════

let userSettings  = null;
let settingsSnapshot = null;
let autosaveTimer = null;

const SETTINGS_KEY = 'spindle_settings';

const DEFAULT_SETTINGS = {
    Appearance: {
        Theme:  'dark',
        Accent: 'purple',
    },
    Behaviour: {
        Autosave:         true,
        AutosaveInterval: 30,
        Shortcuts:        true,
        WheelDuration:    5,
    },
};

function getSettings() {
    try {
        const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        return parsed ? structuredClone(parsed) : structuredClone(DEFAULT_SETTINGS);
    } catch {
        return structuredClone(DEFAULT_SETTINGS);
    }
}

function loadSettings() {
    userSettings = getSettings();
    reconcileSettings();
}

function reconcileSettings() {
    if (!userSettings || typeof userSettings !== 'object') userSettings = {};


    Object.keys(DEFAULT_SETTINGS).forEach(cat => {
        if (!userSettings[cat] || typeof userSettings[cat] !== 'object') userSettings[cat] = {};
        Object.keys(DEFAULT_SETTINGS[cat]).forEach(key => {
            if (userSettings[cat][key] === undefined) userSettings[cat][key] = DEFAULT_SETTINGS[cat][key];
        });
    });

    if (userSettings.Behaviour.Autosave  === 'On')  userSettings.Behaviour.Autosave  = true;
    if (userSettings.Behaviour.Autosave  === 'Off') userSettings.Behaviour.Autosave  = false;
    if (userSettings.Behaviour.Shortcuts === 'On')  userSettings.Behaviour.Shortcuts = true;
    if (userSettings.Behaviour.Shortcuts === 'Off') userSettings.Behaviour.Shortcuts = false;

    if (typeof userSettings.Appearance.Accent === 'number') {
        const keys = Object.keys(ACCENT_PRESETS);
        userSettings.Appearance.Accent = keys[userSettings.Appearance.Accent] || 'purple';
    }

    saveSettings();
}

function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(userSettings));
}

function applySettings() {
    const s = userSettings;
    applyTheme(s.Appearance.Theme, s.Appearance.Accent);

    syncShortcutVisibility();

    resetAutosave();

    saveSettings();

    if (settingsSnapshot !== null) {
        settingsSnapshot = null;
        document.getElementById('settingsBackdrop').classList.remove('open');
        showToast('Settings applied', 'success');
    }
}

function syncShortcutVisibility() {
    const show = userSettings.Behaviour.Shortcuts;
    document.querySelectorAll('.spin-shortcut').forEach(el => {
        el.style.display = show ? '' : 'none';
    });
}

function resetAutosave() {
    clearInterval(autosaveTimer);
    if (userSettings.Behaviour.Autosave) {
        const ms = Math.max(5, userSettings.Behaviour.AutosaveInterval || 30) * 1000;
        autosaveTimer = setInterval(() => {
            if (isDirty && currentProject) saveProject(true /* silent */);
        }, ms);
    }
}

function openSettings() {
    settingsSnapshot = structuredClone(userSettings);
    syncSettingsPanel();
    document.getElementById('settingsBackdrop').classList.add('open');
}

function closeSettings() {
    if (settingsSnapshot) {
        userSettings = structuredClone(settingsSnapshot);
        applyTheme(userSettings.Appearance.Theme, userSettings.Appearance.Accent);
        settingsSnapshot = null;
    }
    document.getElementById('settingsBackdrop').classList.remove('open');
}

function syncSettingsPanel() {
    const s = userSettings;

    // Theme cards
    document.querySelectorAll('[data-setting="theme"]').forEach(card => {
        card.classList.toggle('active', card.dataset.value === s.Appearance.Theme);
    });

    // Accent swatches
    document.querySelectorAll('[data-setting="accent"]').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.value === s.Appearance.Accent);
    });

    // Toggles
    const autoSave = document.getElementById('autoSaveToggle');
    if (autoSave) autoSave.classList.toggle('on', !!s.Behaviour.Autosave);

    const shortcuts = document.getElementById('shortcutsToggle');
    if (shortcuts) shortcuts.classList.toggle('on', !!s.Behaviour.Shortcuts);

    // Autosave interval
    const intervalInput = document.getElementById('autoSaveInterval');
    if (intervalInput) intervalInput.value = s.Behaviour.AutosaveInterval;

    // Duration slider
    const slider = document.getElementById('durationSlider');
    const sliderVal = document.getElementById('spinDurationValue');
    if (slider) slider.value = s.Behaviour.WheelDuration;
    if (sliderVal) sliderVal.textContent = s.Behaviour.WheelDuration + ' sec';
}

document.addEventListener('DOMContentLoaded', () => {
    const settingsBody = document.querySelector('.settings-body');

    settingsBody.addEventListener('click', e => {
        const card = e.target.closest('[data-setting]');
        if (card) {
            const { setting, value } = card.dataset;

            if (setting === 'theme') {
                userSettings.Appearance.Theme = value;
                applyTheme(value, userSettings.Appearance.Accent);
                syncSettingsPanel();
                return;
            }
            if (setting === 'accent') {
                userSettings.Appearance.Accent = value;
                applyTheme(userSettings.Appearance.Theme, value);
                syncSettingsPanel();
                return;
            }
        }


        if (e.target.id === 'autoSaveToggle') {
            userSettings.Behaviour.Autosave = !userSettings.Behaviour.Autosave;
            e.target.classList.toggle('on', userSettings.Behaviour.Autosave);
            return;
        }
        if (e.target.id === 'shortcutsToggle') {
            userSettings.Behaviour.Shortcuts = !userSettings.Behaviour.Shortcuts;
            e.target.classList.toggle('on', userSettings.Behaviour.Shortcuts);
            return;
        }
    });

    settingsBody.addEventListener('input', e => {
        const t = e.target;

        if (t.id === 'autoSaveInterval') {
            const val = Math.max(5, Math.min(300, parseInt(t.value) || 30));
            userSettings.Behaviour.AutosaveInterval = val;
        }
        if (t.id === 'durationSlider') {
            const val = parseInt(t.value);
            userSettings.Behaviour.WheelDuration = val;
            document.getElementById('spinDurationValue').textContent = val + ' sec';
        }
    });
});

// ═══════════════════════════════════════════════════
// PROJECT STORAGE
// ═══════════════════════════════════════════════════

let currentProject = null;
let isDirty = false;

const IDX_KEY = 'spindle_index';

function projKey(id) { return 'spindle_proj_' + id; }
function getIndex()  { try { return JSON.parse(localStorage.getItem(IDX_KEY)) || []; } catch { return []; } }
function setIndex(i) { localStorage.setItem(IDX_KEY, JSON.stringify(i)); }

function loadProject(id) {
    try {
        const data = JSON.parse(localStorage.getItem(projKey(id)));
        if (!data) { showToast('Project not found', 'warn'); return; }
        currentProject = data;
        if (!currentProject.spinResults) currentProject.spinResults = [];
        markDirty(false);
        updateHeaderState();
        renderTree();
        if (currentProject.activeWheelId) {
            const w = findNode(currentProject.activeWheelId);
            if (w) { selectWheel(currentProject.activeWheelId); markDirty(false); return; }
        }
        showState('no-wheel');
        renderOptionsPanel();
    } catch (e) { showToast(`Could not open project: ${e.message}`, 'error'); }
}

function deleteProject(id) {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    let idx = getIndex();
    idx = idx.filter(e => e.id !== id);
    setIndex(idx);
    localStorage.removeItem(projKey(id));
    if (currentProject && currentProject.id === id) {
        currentProject = null;
        markDirty(null);
        updateHeaderState();
        showState('home');
        renderTree();
        renderOptionsPanel();
    }
    renderHomeRecent();
    renderOpenModal();
}

/** @param {boolean} [silent] - suppress toast when autosaving */
function saveProject(silent = false) {
    if (!currentProject) return;
    if (!isDirty) {
        if (!silent) showToast('No changes made', 'warn');
        return;
    }
    const now = new Date().toISOString();
    currentProject.savedAt = now;

    let idx = getIndex();
    const existing = idx.find(e => e.id === currentProject.id);
    if (existing) { existing.name = currentProject.name; existing.savedAt = now; }
    else idx.unshift({ id: currentProject.id, name: currentProject.name, savedAt: now });
    setIndex(idx);

    localStorage.setItem(projKey(currentProject.id), JSON.stringify(currentProject));
    markDirty(false);
    updateHeaderState();
    if (!silent) showToast('Project saved', 'success');
}

function saveAs() {
    openGenericModal('Save As', 'Save', 'Cancel', [{ type: 'text', placeholder: 'Project Name...', id: 'projectName' }]);
    connectPrimary(() => {
        const name = document.getElementById('projectName').value.trim();
        if (!name) { showToast('Project must be named', 'error'); return; }
        currentProject = JSON.parse(JSON.stringify(currentProject));
        currentProject.id = uid();
        currentProject.name = name;
        markDirty(true);
        saveProject();
        updateHeaderState();
        hideGenericModal();
    });
    connectSecondary(hideGenericModal);
}

window.addEventListener('keydown', ev => {
    const tag = ev.target.tagName.toLowerCase();
    if (['input', 'textarea'].includes(tag)) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        ev.shiftKey ? saveAs() : saveProject();
    }
});

// ═══════════════════════════════════════════════════
// PROJECT LIFECYCLE
// ═══════════════════════════════════════════════════

function newProject() {
    openGenericModal('New Project', 'Create', 'Cancel', [{ type: 'text', placeholder: 'Project name...', id: 'projectName' }]);
    connectPrimary(() => {
        const name = document.getElementById('projectName').value.trim();
        if (!name) { showToast('Project must have a name', 'error'); return; }
        currentProject = { id: uid(), name, tree: [], activeWheelId: null, spinResults: [] };
        markDirty(true);
        updateHeaderState();
        renderTree();
        renderOptionsPanel();
        showState('no-wheel');
        drawWheel();
        hideGenericModal();
    });
    connectSecondary(hideGenericModal);
}

function renameCurrent() {
    if (!currentProject) return;
    openGenericModal('Project Name', 'Rename', 'Cancel', [{ type: 'text', placeholder: 'Name...', defaultValue: currentProject.name, id: 'projectRename' }]);
    connectPrimary(() => {
        const name = document.getElementById('projectRename').value.trim();
        if (!name) { showToast('Project must have a name', 'error'); return; }
        currentProject.name = name;
        markDirty(true);
        updateHeaderState();
        hideGenericModal();
    });
    connectSecondary(hideGenericModal);
}

// ═══════════════════════════════════════════════════
// MODAL SYSTEM
// ═══════════════════════════════════════════════════

function renderOpenModal() {
    const list = document.getElementById('omList');
    const idx  = getIndex();
    if (idx.length === 0) {
        list.innerHTML = `<div class="om-empty"><i class="bi bi-folder2"></i>No saved projects yet.</div>`;
        return;
    }
    list.innerHTML = '';
    [...idx].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)).forEach(entry => {
        const isCurrent = currentProject && currentProject.id === entry.id;
        const item = document.createElement('div');
        item.className = 'pm-item' + (isCurrent ? ' current' : '');
        item.innerHTML = `
            <i class="bi bi-collection pm-icon"></i>
            <div class="pm-info">
                <div class="pm-name">${esc(entry.name)}</div>
                <div class="pm-date">Saved ${formatDate(entry.savedAt)}</div>
            </div>
            <button class="pm-del" title="Delete project" onclick="deleteProject('${entry.id}');event.stopPropagation();">
                <i class="bi bi-trash3"></i>
            </button>
        `;
        item.addEventListener('click', () => { loadProject(entry.id); hideOpenProjectModal(); });
        list.appendChild(item);
    });
}

function showOpenProjectModal() { renderOpenModal(); renderHomeRecent(); document.getElementById('openBackdrop').classList.add('open'); }
function hideOpenProjectModal() { document.getElementById('openBackdrop').classList.remove('open'); }

const modalTitle     = document.getElementById('modalTitle');
const modalPrimary   = document.getElementById('modalPrimary');
const modalSecondary = document.getElementById('modalSecondary');
const modalInputList = document.getElementById('modalInputList');

function openGenericModal(title, primaryText, secondaryText, inputs = []) {
    modalTitle.textContent     = title;
    modalPrimary.textContent   = primaryText   || 'Submit';
    modalSecondary.textContent = secondaryText || 'Cancel';

    modalInputList.innerHTML = '';
    inputs.forEach(({ type = 'text', placeholder = '', defaultValue = '', id }) => {
        const input = document.createElement('input');
        input.type         = type;
        input.placeholder  = placeholder;
        input.className    = 'modal-input';
        input.autocomplete = 'off';
        if (id)           input.id    = id;
        if (defaultValue) input.value = defaultValue;
        modalInputList.appendChild(input);
    });

    document.getElementById('genericBackdrop').classList.add('open');
    setTimeout(() => modalInputList.querySelector('input')?.focus(), 50);
}

function hideGenericModal() { document.getElementById('genericBackdrop').classList.remove('open'); }

let primaryFunction   = null;
let secondaryFunction = null;

function connectPrimary(fn) {
    if (primaryFunction) modalPrimary.removeEventListener('click', primaryFunction);
    primaryFunction = fn;
    modalPrimary.addEventListener('click', primaryFunction);
}

function connectSecondary(fn) {
    if (secondaryFunction) modalSecondary.removeEventListener('click', secondaryFunction);
    secondaryFunction = fn;
    modalSecondary.addEventListener('click', secondaryFunction);
}

window.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') {
        if (!document.getElementById('genericBackdrop').classList.contains('open')) return;
        if (primaryFunction) primaryFunction();
    } else if (ev.key === 'Escape') {
        if (document.getElementById('settingsBackdrop').classList.contains('open')) { closeSettings(); return; }
        if (secondaryFunction) secondaryFunction();
        if (document.getElementById('openBackdrop').classList.contains('open')) hideOpenProjectModal();
    }
});

// ═══════════════════════════════════════════════════
// TREE MANAGEMENT
// ═══════════════════════════════════════════════════

function renderTree() {
    const tree = document.getElementById('tree');
    tree.innerHTML = '';
    if (!currentProject) return;
    buildNodes(currentProject.tree, tree);
}

function removeFromTree(list, id) {
    const i = list.findIndex(n => n.id === id);
    if (i !== -1) { list.splice(i, 1); return true; }
    for (const n of list) { if (n.children && removeFromTree(n.children, id)) return true; }
    return false;
}

function buildNodes(nodes, container) {
    (nodes || []).forEach(node => {
        const wrap = document.createElement('div');
        wrap.className = 'tree-node';
        if (node.type === 'folder') buildFolder(node, wrap);
        else buildWheel(node, wrap);
        container.appendChild(wrap);
    });
}

function newFolder(parentId) {
    if (!currentProject) return;
    openGenericModal('New Folder', 'Create', 'Cancel', [{ type: 'text', placeholder: 'Name...', id: 'newFolderName' }]);
    connectPrimary(() => {
        const name = document.getElementById('newFolderName').value.trim();
        if (!name) { showToast('Folder must have a name', 'error'); return; }
        const folder = { id: uid(), type: 'folder', name, open: true, children: [] };
        insertNode(folder, parentId);
        hideGenericModal();
        markDirty(true);
        renderTree();
    });
    connectSecondary(hideGenericModal);
}

function buildFolder(node, wrap) {
    const el = document.createElement('div');
    el.className = 'tree-item';
    el.innerHTML = `
        <i class="bi bi-chevron-right t-chevron ${node.open ? 'open' : ''}"></i>
        <i class="bi bi-folder${node.open ? '2-open' : ''} t-icon"></i>
        <span class="t-name">${esc(node.name)}</span>
        <span class="t-actions">
            <button class="ta-btn" title="Add wheel" onclick="newWheel('${node.id}');event.stopPropagation();"><i class="bi bi-plus"></i></button>
            <button class="ta-btn" title="Rename" onclick="renameNode('${node.id}');event.stopPropagation();"><i class="bi bi-pencil"></i></button>
            <button class="ta-btn del" title="Delete" onclick="deleteNode('${node.id}');event.stopPropagation();"><i class="bi bi-trash3"></i></button>
        </span>
    `;
    el.addEventListener('click', () => toggleFolder(node.id));
    wrap.appendChild(el);
    if (node.open && node.children) {
        const ch = document.createElement('div');
        ch.className = 'folder-children';
        buildNodes(node.children, ch);
        wrap.appendChild(ch);
    }
}

function toggleFolder(id) {
    const node = findNode(id);
    if (node) { node.open = !node.open; renderTree(); }
}

function newWheel(parentId) {
    if (!currentProject) return;
    openGenericModal('New Wheel', 'Create', 'Cancel', [{ type: 'text', placeholder: 'Name...', id: 'newWheelName' }]);
    connectPrimary(() => {
        const name = document.getElementById('newWheelName').value.trim();
        if (!name) { showToast('Wheel must have a name', 'error'); return; }
        const wheel = { id: uid(), type: 'wheel', name, options: [] };
        insertNode(wheel, parentId);
        selectWheel(wheel.id);
        hideGenericModal();
        markDirty(true);
        renderTree();
    });
    connectSecondary(hideGenericModal);
}

function buildWheel(node, wrap) {
    const active = node.id === (currentProject && currentProject.activeWheelId);
    const el = document.createElement('div');
    el.className = 'tree-item' + (active ? ' active' : '');
    el.innerHTML = `
        <i class="bi bi-record-circle t-icon" style="font-size:11px"></i>
        <span class="t-name">${esc(node.name)}</span>
        <span class="t-actions">
            <button class="ta-btn" title="Rename" onclick="renameNode('${node.id}');event.stopPropagation();"><i class="bi bi-pencil"></i></button>
            <button class="ta-btn del" title="Delete" onclick="deleteNode('${node.id}');event.stopPropagation();"><i class="bi bi-trash3"></i></button>
        </span>
    `;
    el.addEventListener('click', () => selectWheel(node.id));
    wrap.appendChild(el);
}

function insertNode(node, parentId) {
    if (parentId) {
        const parent = findNode(parentId);
        if (parent && parent.type === 'folder') { parent.children.push(node); return; }
    }
    currentProject.tree.push(node);
}

function findNode(id, nodes) {
    nodes = nodes || (currentProject ? currentProject.tree : []);
    for (const n of nodes) {
        if (n.id === id) return n;
        if (n.children) { const r = findNode(id, n.children); if (r) return r; }
    }
    return null;
}

function renameNode(nodeId) {
    if (!currentProject) return;
    const node = findNode(nodeId);
    openGenericModal(`Rename ${node.type.charAt(0).toUpperCase() + node.type.slice(1)}`, 'Rename', 'Cancel',
        [{ type: 'text', placeholder: 'Name...', defaultValue: node.name, id: 'nodeRename' }]);
    connectPrimary(() => {
        const name = document.getElementById('nodeRename').value.trim();
        if (!name) { showToast(`${node.type} must have a name`, 'error'); return; }
        node.name = name;
        markDirty(true);
        renderTree();
        hideGenericModal();
    });
    connectSecondary(hideGenericModal);
}

function deleteNode(id) {
    if (!confirm("Delete this item and all of its contents?")) return;
    if (currentProject.activeWheelId === id) {
        currentProject.activeWheelId = null;
        showState('no-wheel');
        renderOptionsPanel();
        drawWheel();
    }
    removeFromTree(currentProject.tree, id);
    markDirty(true);
    renderTree();
}

function selectWheel(id) {
    currentProject.activeWheelId = id;
    markDirty(true);
    renderTree();
    renderOptionsPanel();
    currentRotation = 0;
    drawWheel();
    showState('wheel');
    if (window.innerWidth <= 768) mobileShowPanel('wheel');
}

// ═══════════════════════════════════════════════════
// WHEEL RENDERING
// ═══════════════════════════════════════════════════

function activeWheel() {
    return currentProject ? findNode(currentProject.activeWheelId) : null;
}

let currentRotation = 0;
let isSpinning      = false;

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawWheel(rotation) {
    const canvas = document.getElementById('wheel');
    const ctx    = canvas.getContext('2d');
    const cx     = canvas.width  / 2;
    const cy     = canvas.height / 2;
    const radius = cx - 6;
    const rot    = rotation !== undefined ? rotation : currentRotation;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const wheel   = activeWheel();
    const options = wheel ? wheel.options.filter(o => o.enabled) : [];

    if (!wheel || options.length === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = cssVar('--bg3');
        ctx.fill();
        ctx.setLineDash([10, 7]);
        ctx.strokeStyle = cssVar('--border2');
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '500 13px Outfit, sans-serif';
        ctx.fillStyle = cssVar('--text3');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(wheel ? 'Add options to get started' : 'No wheel selected', cx, cy + radius * 0.52);
        return;
    }

    const totalW = options.reduce((s, o) => s + o.weight, 0);
    let startAngle = rot - Math.PI / 2;

    options.forEach(opt => {
        const slice = (opt.weight / totalW) * Math.PI * 2;
        const end   = startAngle + slice;
        const mid   = startAngle + slice / 2;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startAngle, end);
        ctx.closePath();
        ctx.fillStyle   = opt.colour;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.18)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        const tr  = radius * .63;
        const tx  = cx + Math.cos(mid) * tr;
        const ty  = cy + Math.sin(mid) * tr;
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(mid + Math.PI / 2);
        const maxLen = slice > .55 ? 14 : slice > .28 ? 8 : 4;
        const label  = opt.label.length > maxLen ? opt.label.slice(0, maxLen - 1) + '…' : opt.label;
        const fs     = Math.min(14, Math.max(8, slice * 24));
        ctx.shadowColor = 'rgba(0,0,0,.55)';
        ctx.shadowBlur  = 3;
        ctx.fillStyle   = '#fff';
        ctx.font = `500 ${fs}px Outfit, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 0);
        ctx.restore();

        startAngle = end;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth   = 4;
    ctx.stroke();
}

function resizeWheel() {
    const area  = document.getElementById('wheelArea');
    const navH  = window.innerWidth <= 768 ? 60 : 0;
    const avail = Math.min(area.clientWidth - 40, area.clientHeight - 190 - navH);
    const size  = Math.max(180, Math.min(460, avail));
    const canvas = document.getElementById('wheel');
    canvas.width  = size;
    canvas.height = size;
    drawWheel();
}

function spinWheel() {
    const wheel = activeWheel();
    if (!wheel || isSpinning) return;

    const opts = wheel.options.filter(o => o.enabled);
    if (opts.length === 0) return;

    const duration = (userSettings.Behaviour.WheelDuration || 5) * 1000;
    isSpinning = true;

    const btn = document.getElementById('spinBtn');
    btn.classList.add('spinning');
    btn.disabled = true;
    document.getElementById('resultDisplay').innerHTML = '';

    const totalW = opts.reduce((s, o) => s + o.weight, 0);

    let rand = Math.random() * totalW;
    let winner = null;
    let accumulatedW = 0;
    let winnerStartAngle = 0;
    let randomPartInSlice = 0;

    for (const opt of opts) {
        if (rand < accumulatedW + opt.weight) {
            winner = opt;
            winnerStartAngle   = (accumulatedW / totalW) * TAU;
            randomPartInSlice  = Math.random() * (opt.weight / totalW) * TAU;
            break;
        }
        accumulatedW += opt.weight;
    }

    const landingAngle  = winnerStartAngle + randomPartInSlice;
    let targetRotation  = -landingAngle;

    while (targetRotation >= currentRotation) targetRotation -= TAU;

    const extraSpins = 5 + Math.floor(Math.random() * 4);
    targetRotation  -= extraSpins * TAU;

    const startRotation = currentRotation;
    const startTime     = performance.now();

    function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

    function animate(now) {
        const elapsed  = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased    = easeOutQuart(progress);

        currentRotation = startRotation + (targetRotation - startRotation) * eased;
        drawWheel(currentRotation);

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            currentRotation = targetRotation;
            isSpinning = false;
            btn.classList.remove('spinning');
            btn.disabled = false;
            showResult(winner);
        }
    }

    requestAnimationFrame(animate);
}

function switchTab(tab) {
    document.getElementById('tabOpts').classList.toggle('active', tab === 'opts');
    document.getElementById('tabResults').classList.toggle('active', tab === 'results');
    document.getElementById('optsPanel').style.display    = tab === 'opts'     ? 'flex' : 'none';
    document.getElementById('resultsPanel').style.display = tab === 'results'  ? 'flex' : 'none';
    if (tab === 'results') renderResults();
}

// ═══════════════════════════════════════════════════
// OPTIONS PANEL
// ═══════════════════════════════════════════════════

function renderOptionsPanel() {
    const wheel   = activeWheel();
    const list    = document.getElementById('optsList');
    const addBtn  = document.getElementById('addOptBtn');
    const spinBtn = document.getElementById('spinBtn');

    if (!currentProject || !wheel) {
        list.innerHTML = `<div class="sb-empty"><i class="bi bi-sliders"></i><p>Open a wheel to edit its options</p></div>`;
        addBtn.disabled  = true;
        if (spinBtn) spinBtn.disabled = true;
        return;
    }

    document.getElementById('wheelTitleEl').textContent = wheel.name;
    addBtn.disabled = false;

    const active = wheel.options.filter(o => o.enabled);
    const totalW = active.reduce((s, o) => s + o.weight, 0);
    if (spinBtn) spinBtn.disabled = active.length < 1;

    if (wheel.options.length === 0) {
        list.innerHTML = `<div class="sb-empty"><i class="bi bi-layout-split"></i><p>No options yet — add one below</p></div>`;
        return;
    }

    list.innerHTML = '';
    wheel.options.forEach(opt => {
        const pct  = (opt.enabled && totalW) ? Math.round(opt.weight / totalW * 100) : 0;
        const card = document.createElement('div');
        card.className = 'opt-card' + (opt.enabled ? '' : ' opt-disabled');
        card.innerHTML = `
            <div class="opt-row1">
                <label class="colour-swatch" style="background:${opt.colour}" title="Pick colour">
                    <input type="color" value="${opt.colour}" data-action="colour" data-id="${opt.id}">
                </label>
                <input class="opt-name" type="text" value="${esc(opt.label)}" placeholder="Option name" data-action="label" data-id="${opt.id}">
                <button class="toggle ${opt.enabled ? 'on' : ''}" data-action="toggle" data-id="${opt.id}" title="${opt.enabled ? 'Disable' : 'Enable'}"></button>
                <button class="del-btn" data-action="delete" data-id="${opt.id}" title="Remove">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
            <div class="opt-row2">
                <span class="w-label">Weight</span>
                <div class="w-slider-wrap">
                    <input type="range" min="1" max="20" value="${opt.weight}" data-action="weight-range" data-id="${opt.id}">
                </div>
                <input type="number" class="w-num" min="1" max="99" value="${opt.weight}" data-action="weight-num" data-id="${opt.id}">
                <span class="w-pct">${pct}%</span>
            </div>
        `;
        list.appendChild(card);
    });
}

function addOption() {
    const wheel = activeWheel(); if (!wheel) return;
    const colour = PALETTE[wheel.options.length % PALETTE.length];
    wheel.options.push({ id: uid(), label: 'Option ' + (wheel.options.length + 1), weight: 1, colour, enabled: true });
    markDirty(true);
    renderOptionsPanel();
    drawWheel();
    document.getElementById('optsList').scrollTo({ top: 99999, behavior: 'smooth' });
}

function sortOptions() {
    const wheel = activeWheel(); if (!wheel) return;
    wheel.options.sort((a, b) => b.weight - a.weight);
    markDirty(true); renderOptionsPanel(); drawWheel();
}

function randomizeColours() {
    const wheel = activeWheel(); if (!wheel) return;
    const s = [...PALETTE].sort(() => Math.random() - .5);
    wheel.options.forEach((o, i) => o.colour = s[i % s.length]);
    markDirty(true); renderOptionsPanel(); drawWheel();
}

// ═══════════════════════════════════════════════════
// RESULTS PANEL
// ═══════════════════════════════════════════════════

function renderResults() {
    const list    = document.getElementById('resultsList');
    const results = currentProject?.spinResults || [];
    if (!results.length) {
        list.innerHTML = `<div class="sb-empty"><i class="bi bi-clock-history"></i><p>No spins yet</p></div>`;
        return;
    }
    list.innerHTML = '';
    [...results].reverse().forEach(r => {
        const el = document.createElement('div');
        el.className = 'result-entry';
        el.innerHTML = `
            <div class="re-dot" style="background:${r.colour}"></div>
            <div class="re-info">
                <div class="re-label">${esc(r.label)}</div>
                <div class="re-wheel">${esc(r.wheelName)}</div>
            </div>
            <div class="re-time">${formatDate(r.at)}</div>
        `;
        list.appendChild(el);
    });
}

function clearResults() {
    if (!currentProject) return;
    currentProject.spinResults = [];
    markDirty(true);
    renderResults();
}

function showResult(winner) {
    if (currentProject) {
        if (!currentProject.spinResults) currentProject.spinResults = [];
        currentProject.spinResults.push({
            label:     winner.label,
            colour:    winner.colour,
            wheelName: activeWheel()?.name || '',
            at:        new Date().toISOString(),
        });
        markDirty(true);
        if (document.getElementById('tabResults').classList.contains('active')) renderResults();
    }

    document.getElementById('resultDisplay').innerHTML = `
        <div class="result-bubble">
            <div class="result-dot" style="background:${winner.colour}"></div>
            ${esc(winner.label)}!
        </div>`;
    launchConfetti(winner.colour);
}

// ═══════════════════════════════════════════════════
// MOBILE PANEL MANAGEMENT
// ═══════════════════════════════════════════════════

let mobilePanelActive = 'wheel';

function mobileShowPanel(panel) {
    if (window.innerWidth > 768) return;
    mobilePanelActive = panel;

    const left    = document.getElementById('sidebarLeft');
    const right   = document.getElementById('sidebarRight');
    const overlay = document.getElementById('mobileOverlay');

    left.classList.toggle('mobile-open',  panel === 'contents');
    right.classList.toggle('mobile-open', panel === 'options');
    overlay.classList.toggle('visible', panel !== 'wheel');

    document.querySelectorAll('.mnav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.panel === panel);
    });
}

function mobileClosePanels() { mobileShowPanel('wheel'); }

// ═══════════════════════════════════════════════════
// GENERAL UI
// ═══════════════════════════════════════════════════

const PALETTE = [
    '#f87171','#fb923c','#fbbf24','#a3e635','#34d399',
    '#22d3ee','#60a5fa','#a78bfa','#f472b6','#f43f5e',
    '#e879f9','#2dd4bf','#facc15','#4ade80','#38bdf8',
];

function launchConfetti(base) {
    const c = document.getElementById('confettiWrap');
    c.innerHTML = '';
    const colours = [base, '#f0b429', '#a78bfa', '#34d399', '#f472b6', '#60a5fa'];
    for (let i = 0; i < 60; i++) {
        const p  = document.createElement('div');
        p.className = 'confetti-piece';
        const sz = 6 + Math.random() * 10;
        p.style.cssText = `
            left:${Math.random() * 100}%;top:-20px;
            width:${sz}px;height:${sz}px;
            background:${colours[Math.floor(Math.random() * colours.length)]};
            border-radius:${Math.random() > .5 ? '50%' : '2px'};
            animation-delay:${Math.random() * .5}s;
            animation-duration:${2 + Math.random() * 1.5}s;
        `;
        c.appendChild(p);
    }
    setTimeout(() => c.classList.add('fade-out'), 4000);
    setTimeout(() => { c.innerHTML = ''; c.classList.remove('fade-out'); }, 4500);
}

let toastTimer;
function showToast(msg, type, duration = 2200) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className   = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

function renderHomeRecent() {
    const wrap = document.getElementById('homeRecent');
    const idx  = getIndex();
    if (idx.length === 0) { wrap.innerHTML = ''; return; }

    const sorted = [...idx].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)).slice(0, 5);
    wrap.innerHTML = `<div class="hr-title">Recent Projects</div>`;
    sorted.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'recent-item';
        item.innerHTML = `
            <i class="bi bi-collection ri-icon"></i>
            <div class="ri-info">
                <div class="ri-name">${esc(entry.name)}</div>
                <div class="ri-date">${formatDate(entry.savedAt)}</div>
            </div>
            <button class="ri-del" title="Delete" onclick="deleteProject('${entry.id}');event.stopPropagation();">
                <i class="bi bi-trash3"></i>
            </button>
        `;
        item.addEventListener('click', e => { if (!e.target.closest('.ri-del')) loadProject(entry.id); });
        wrap.appendChild(item);
    });
}

function updateHeaderState() {
    const hasPrj = !!currentProject;
    document.getElementById('hdrDivider').style.display   = hasPrj ? '' : 'none';
    document.getElementById('projNameWrap').style.display = hasPrj ? '' : 'none';
    document.getElementById('saveActions').style.display  = hasPrj ? 'flex' : 'none';
    document.getElementById('mobileNav').style.display    = hasPrj ? 'flex' : 'none';
    document.getElementById('sidebarLeft').classList.toggle('dimmed',  !hasPrj);
    document.getElementById('sidebarRight').classList.toggle('dimmed', !hasPrj);
    document.getElementById('header').classList.toggle('dimmed', !hasPrj);

    if (hasPrj) {
        document.getElementById('projNameEl').textContent = currentProject.name;
        document.title = currentProject.name + ' — Spindle';
    } else {
        document.title = 'Spindle — Wheel of Decisions';
        mobileClosePanels();
        markDirty(null);
    }
}

function showState(state) {
    document.getElementById('homeScreen').style.display  = state === 'home'     ? 'flex' : 'none';
    document.getElementById('noWheelMsg').style.display  = state === 'no-wheel' ? 'flex' : 'none';
    document.getElementById('wheelUI').style.display     = state === 'wheel'    ? 'flex' : 'none';
    if (state !== 'wheel') {
        document.getElementById('spinBtn').disabled = true;
        document.getElementById('resultDisplay').innerHTML = '';
    }
}

function markDirty(state) {
    const dot = document.getElementById('statusDot');
    if (state === true)  { isDirty = true;  dot.classList.add('dirty');  dot.classList.remove('clean'); }
    else if (state === false) { isDirty = false; dot.classList.add('clean');  dot.classList.remove('dirty'); }
    else                 { isDirty = false; dot.classList.remove('clean', 'dirty'); }
}

// ═══════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════

const TAU = 2 * Math.PI;

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function esc(s) {
    return String(s)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;');
}

function formatDate(iso) {
    if (!iso) return '—';
    const d    = new Date(iso);
    const diff = (Date.now() - d) / 1000;
    if (diff < 60)     return 'just now';
    if (diff < 3600)   return Math.floor(diff / 60)   + 'm ago';
    if (diff < 86400)  return Math.floor(diff / 3600)  + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString();
}

// ═══════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════

// Close modals by clicking backdrop
document.getElementById('genericBackdrop').addEventListener('click', e => {
    if (e.target === document.getElementById('genericBackdrop')) hideGenericModal();
});
document.getElementById('openBackdrop').addEventListener('click', e => {
    if (e.target === document.getElementById('openBackdrop')) hideOpenProjectModal();
});
document.getElementById('settingsBackdrop').addEventListener('click', e => {
    if (e.target === document.getElementById('settingsBackdrop')) closeSettings();
});

// Options panel — input changes (colour, label, weight)
document.getElementById('optsList').addEventListener('input', e => {
    const t = e.target;
    const { action, id } = t.dataset;
    if (!action || !id || !currentProject) return;
    const wheel = activeWheel(); if (!wheel) return;
    const opt = wheel.options.find(o => o.id === id); if (!opt) return;

    if (action === 'colour') {
        opt.colour = t.value;
        t.closest('.colour-swatch').style.background = t.value;
        markDirty(true); drawWheel();
    }
    if (action === 'label') { opt.label = t.value; markDirty(true); drawWheel(); }
    if (action === 'weight-range' || action === 'weight-num') {
        const val = Math.max(1, Math.min(99, parseInt(t.value) || 1));
        opt.weight = val;
        const card = t.closest('.opt-card');
        if (card) {
            const r = card.querySelector('[data-action="weight-range"]');
            const n = card.querySelector('[data-action="weight-num"]');
            if (r && action === 'weight-range') n.value = val;
            if (n && action === 'weight-num')   r.value = val;
        }
        const allActive = wheel.options.filter(o => o.enabled);
        const tw = allActive.reduce((s, o) => s + o.weight, 0);
        document.querySelectorAll('#optsList .opt-card').forEach(c => {
            const cId  = c.querySelector('[data-id]')?.dataset.id;
            const cOpt = wheel.options.find(o => o.id === cId);
            const pe   = c.querySelector('.w-pct');
            if (cOpt && pe) pe.textContent = (cOpt.enabled && tw) ? Math.round(cOpt.weight / tw * 100) + '%' : '0%';
        });
        markDirty(true); drawWheel();
    }
});

// Options panel — click actions (toggle, delete)
document.getElementById('optsList').addEventListener('click', e => {
    const t = e.target.closest('[data-action]'); if (!t) return;
    const { action, id } = t.dataset;
    if (!action || !id || !currentProject) return;
    const wheel = activeWheel(); if (!wheel) return;
    const opt = wheel.options.find(o => o.id === id);

    if (action === 'toggle' && opt) {
        opt.enabled = !opt.enabled;
        markDirty(true); renderOptionsPanel(); drawWheel();
    }
    if (action === 'delete') {
        wheel.options = wheel.options.filter(o => o.id !== id);
        markDirty(true); renderOptionsPanel(); drawWheel();
    }
});

// Spin via canvas click or keyboard
document.getElementById('wheel').addEventListener('click', () => { if (!isSpinning) spinWheel(); });
window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); spinWheel(); }
});

// Resize
window.addEventListener('resize', () => {
    resizeWheel();
    // On resize to desktop, reset mobile panel state
    if (window.innerWidth > 768) mobileClosePanels();
});

// Guard unsaved changes
window.addEventListener('beforeunload', e => { if (isDirty) e.preventDefault(); });

// Global shortcuts
window.addEventListener('keydown', ev => {
    if (ev.ctrlKey || ev.metaKey) {
        if (ev.key.toLowerCase() === 'p') { ev.preventDefault(); newProject(); }
        if (ev.key.toLowerCase() === 'o') { ev.preventDefault(); renderOpenModal(); showOpenProjectModal(); }
    }
});

// ═══════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════

loadSettings();
applySettings();
syncShortcutVisibility();
showState('home');
renderHomeRecent();
updateHeaderState();
resizeWheel();