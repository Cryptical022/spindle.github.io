// ═══════════════════════════════════════════════════
// STORAGE SCHEMA
//
//  localStorage:
//      'spindle_index'     → [{ id, name, savedAt }]
//      'spindle_proj_{id}' → { id, name, savedAt, tree, activeWheelId, spinResults }
//      'spindle_settings'  → [{  }]
//
//  currentProject: the in-memory working copy (may be unsaved / dirty)
//  isDirty: true if working copy differs from last save
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// PROJECT STORAGE
// ═══════════════════════════════════════════════════

let currentProject = null;
let isDirty = false;

const IDX_KEY = "spindle_index";
const SETTINGS_KEY = "spindle_settings";

function projKey(id) { return 'spindle_proj_' + id; }

function getIndex() { try { return JSON.parse(localStorage.getItem(IDX_KEY)) || []; } catch { return []; } }
function setIndex(idx) { localStorage.setItem(IDX_KEY, JSON.stringify(idx)); }

function getSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || []; } catch { return []; } }

function loadProject(id) {
    try {
        const data = JSON.parse(localStorage.getItem(projKey(id)));
        if (!data) { showToast("Project not found", "warn"); return; }
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
    } catch(e) { showToast(`Could not open project. ${e}`, "error"); }
}

function deleteProject(id) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    let idx = getIndex();
    idx = idx.filter(e => e.id !== id);
    setIndex(idx);
    localStorage.removeItem(projKey(id));
    if (currentProject && currentProject.id === id) {
        currentProject = null; markDirty(null);
        updateHeaderState();
        showState('home');
        renderTree();
        renderOptionsPanel();
    }
    renderHomeRecent();
    renderOpenModal();
}

function saveProject() {
    if (!currentProject) return;
    if (!isDirty) {
        showToast("No changes made", "warn");
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
    showToast("Project saved", "success");
}

function saveAs() {
    openGenericModal("Save As", "Save", "Cancel", [{ type: "text", placeholder: "Project Name...", id: "projectName" }])
    connectPrimary(() => {
        const name = document.getElementById("projectName").value.trim();
        if (!name) {
            showToast("Project must be named", "error")
            return;
        }

        currentProject = JSON.parse(JSON.stringify(currentProject));
        currentProject.id = uid();
        currentProject.name = name;
        saveProject();
        updateHeaderState();
        hideGenericModal();
    });
    connectSecondary(hideGenericModal);
}

window.addEventListener("keydown", ev => {
    const tag = ev.target.tagName.toLowerCase();
    if (['input', 'textarea'].includes(tag)) return;

    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        ev.shiftKey ? saveAs() : saveProject();
    }
});

// ═══════════════════════════════════════════════════
// PROJECT LIFECYCLE
// ═══════════════════════════════════════════════════

function newProject() {
    openGenericModal("New Project", "Create", "Cancel", [{type: "text", placeholder: "Project name...", id: "projectName"}])
    connectPrimary(() => {
        const name = document.getElementById("projectName").value.trim();
        if (!name) {
            showToast("Project must have a name", "error")
            return;
        };
        
        currentProject = { id: uid(), name, tree: [], activeWheelId: null, spinResults: [] };
        markDirty(true);
        updateHeaderState();
        renderTree();
        renderOptionsPanel();
        showState("no-wheel");
        drawWheel();
        hideGenericModal();

    });
    connectSecondary(hideGenericModal);
}

function renameCurrent() {
    if (!currentProject) return;
    openGenericModal("Project Name", "Rename", "Cancel", [{type: "text", placeholder: "Name...", defaultValue: currentProject.name, id: "projectRename"}])
    connectPrimary(() => {
        const name = document.getElementById("projectRename").value.trim();
        if (!name) {
            showToast("Project must have a name", "error")
            return;
        }

        currentProject.name = name;
        markDirty(true);
        updateHeaderState();
        hideGenericModal();
    })
    connectSecondary(hideGenericModal);
}

// ═══════════════════════════════════════════════════
// MODAL SYSTEM
// ═══════════════════════════════════════════════════

function renderOpenModal() {
    const list = document.getElementById('omList');
    const idx = getIndex();
    if (idx.length === 0) {
        list.innerHTML = `<div class="om-empty"><i class="bi bi-folder2"></i>No saved projects yet.</div>`;
        return;
    }
    list.innerHTML = '';
    idx.forEach(entry => {
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
            </button
        `;
        item.addEventListener('click', () => { loadProject(entry.id); hideOpenProjectModal(); });
        list.appendChild(item);
    });
}

function showOpenProjectModal() {
    renderOpenModal();
    renderHomeRecent();
    document.getElementById('openBackdrop').classList.add('open')
}

function hideOpenProjectModal() { document.getElementById('openBackdrop').classList.remove("open"); }

const modalTitle = document.getElementById("modalTitle")
const modalPrimary = document.getElementById("modalPrimary")
const modalSecondary = document.getElementById("modalSecondary")
const modalInputList = document.getElementById("modalInputList")

function openGenericModal(title, primaryText, secondaryText, inputs=[]) {
    modalTitle.textContent = title
    modalPrimary.textContent = primaryText || "Submit"
    modalSecondary.textContent = secondaryText || "Cancel"

    modalInputList.innerHTML = ''
    inputs.forEach(({ type = 'text', placeholder = "", defaultValue = "", id }) => {
        const input = document.createElement('input');
        input.type = type;
        input.placeholder = placeholder;
        input.className = "modal-input";
        input.autocomplete = "off";
        if (id) input.id = id;
        if (defaultValue) input.value = defaultValue;
        modalInputList.appendChild(input);
    });

    document.getElementById("genericBackdrop").classList.add("open");
    setTimeout(() => modalInputList.querySelector('input')?.focus(), 50);
}

function hideGenericModal() { document.getElementById("genericBackdrop").classList.remove("open"); }

let primaryFunction = null
let secondaryFunction = null

function connectPrimary(fn) {
    if (primaryFunction) {
        modalPrimary.removeEventListener("click", primaryFunction);
    }
    primaryFunction = fn;
    modalPrimary.addEventListener("click", primaryFunction);
}

function connectSecondary(fn) {
    if (secondaryFunction) {
        modalSecondary.removeEventListener("click", secondaryFunction);
    }
    secondaryFunction = fn;
    modalSecondary.addEventListener("click", secondaryFunction);
}

window.addEventListener("keydown", ev => {
    if (ev.key == "Enter") {
        if (!document.getElementById("genericBackdrop").classList.contains("open")) return;
        if (primaryFunction) primaryFunction();
    } else if (ev.key == "Escape") {
        if (secondaryFunction) secondaryFunction();
        if (document.getElementById("openBackdrop").classList.contains("open")) hideOpenProjectModal();
    }
})

// ═══════════════════════════════════════════════════
// TREE MANAGMENT
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
        const wrap = document.createElement("div");
        wrap.className = "tree-node";
        if (node.type === 'folder') buildFolder(node, wrap);
        else buildWheel(node, wrap);
        container.appendChild(wrap);
    });
}

function newFolder(parentId) {
    if (!currentProject) return;
    openGenericModal("New Folder", "Create", "Cancel", [{type: 'text', placeholder: "Name...", id: "newFolderName"}])
    connectPrimary(() => {
        const name = document.getElementById("newFolderName").value.trim();
        if (!name) {
            showToast("Folder must have a name", "error")
            return;
        }
        const folder = { id: uid(), type: 'folder', name, open: true, children: [] };
        insertNode(folder, parentId);
        hideGenericModal();
        markDirty(true);
        renderTree();
    })
    connectSecondary(hideGenericModal);
}

function buildFolder(node, wrap) {
    const el = document.createElement('div');
    el.className = "tree-item";
    el.innerHTML = `
        <i class="bi bi-chevron-right t-chevron ${node.open?'open':''}"></i>
        <i class="bi bi-folder${node.open?"2-open":""} t-icon"></i>
        <span class="t-name">${esc(node.name)}</span>
        <span class="t-actions">
            <button class="ta-btn" title="Add wheel", onclick="newWheel('${node.id}');event.stopPropagation();"><i class="bi bi-plus"></i></button>
            <button class="ta-btn" title="Rename", onclick="renameNode('${node.id}');event.stopPropagation();"><i class="bi bi-pencil"></i></button>
            <button class="ta-btn del" title="Delete", onclick="deleteNode('${node.id}');event.stopPropagation();"><i class="bi bi-trash3"></i></button>
        </span>
    `;
    el.addEventListener('click', () => toggleFolder(node.id));
    wrap.appendChild(el);
    if (node.open && node.children) {
        const ch = document.createElement("div");
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
    openGenericModal("New Wheel", "Create", "Cancel", [{type: 'text', placeholder: "Name...", id: "newWheelName"}])
    connectPrimary(() => {
        const name = document.getElementById("newWheelName").value.trim();
        if (!name) {
            showToast("Wheel must have a name", "error")
            return;
        }
        const wheel = { id: uid(), type: 'wheel', name, options: []};
        insertNode(wheel, parentId);
        selectWheel(wheel.id);
        hideGenericModal();
        markDirty(true);
        renderTree();
    })
    connectSecondary(hideGenericModal);
}

function buildWheel(node, wrap) {
    const active = node.id === (currentProject && currentProject.activeWheelId);
    const el = document.createElement('div');
    el.className = "tree-item" + (active ? ' active' : '');
    el.innerHTML = `
        <i class="bi bi-record-circle t-icon" style="font-size:11px"></i>
        <span class="t-name">${esc(node.name)}</span>
        <span class="t-actions">
            <button class="ta-btn" title="Rename", onclick="renameNode('${node.id}');event.stopPropagation();"><i class="bi bi-pencil"></i></button>
            <button class="ta-btn del" title="Delete", onclick="deleteNode('${node.id}');event.stopPropagation();"><i class="bi bi-trash3"></i></button>
        </span>
    `;
    el.addEventListener('click', () => selectWheel(node.id));
    wrap.appendChild(el);
}

function insertNode(node, parentId) {
    if (parentId) {
        const parent = findNode(parentId);
        if (parent && parent.type === "folder") { parent.children.push(node); return; }
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
    let node = findNode(nodeId)
    console.log(node)
    openGenericModal(`Rename ${node.type.charAt(0).toUpperCase() + node.type.slice(1)}`, "Rename", "Cancel", [{type: "text", placeholder: "Name...", defaultValue: node.name, id: "nodeRename"}])
    connectPrimary(() => {
        const name = document.getElementById("nodeRename").value.trim();
        if (!name) {
            showToast(`${node.type} must have a name`, 'error')
            return;
        }
        node.name = name;
        markDirty(true);
        renderTree();
        hideGenericModal();
    });
    connectSecondary(hideGenericModal);
}

function deleteNode(id) {
    if (!confirm("Delete this item and all of it's contents?")) return;
    if (currentProject.activeWheelId === id) {
        currentProject.activeWheelId = null;
        showState('no-wheel');
        renderOptionsPanel();
        drawWheel();
    }
    removeFromTree(currentProject.tree, id);
    markDirty(true); renderTree();
}

function selectWheel(id) {
    currentProject.activeWheelId = id
    markDirty(true);
    renderTree();
    renderOptionsPanel();
    drawWheel();
    showState('wheel');
}

// ═══════════════════════════════════════════════════
// WHEEL MANAGER
// ═══════════════════════════════════════════════════

function activeWheel() {
    return currentProject ? findNode(currentProject.activeWheelId) : null;
}

let currentRotation = 0;
let isSpinning = false;
function drawWheel(rotation) {
    const canvas = document.getElementById('wheel');
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const radius = cx - 6;
    const rot = rotation !== undefined ? rotation : currentRotation;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const wheel = activeWheel();
    const options = wheel ? wheel.options.filter(o => o.enabled) : [];

    if (!wheel || options.length === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#17152c';
        ctx.fill();
        ctx.setLineDash([10,7]);
        ctx.strokeStyle = "#38355e";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '500 13px Outfit, sans-serif';
        ctx.fillStyle = "#5c5880";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(wheel ? "Add options to get started" : "No wheel selected", cx, cy + radius * 0.52);
        return;
    }

    const totalW = options.reduce((s, o) => s + o.weight, 0);
    let startAngle = rot - Math.PI / 2;

    options.forEach(opt => {
        const slice = (opt.weight / totalW) * Math.PI * 2;
        const end = startAngle + slice;
        const mid = startAngle + slice / 2;
        
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startAngle, end);
        ctx.closePath();
        ctx.fillStyle = opt.colour;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.2)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const tr = radius * .63;
        const tx = cx + Math.cos(mid) * tr;
        const ty = cy + Math.sin(mid) * tr;
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(mid + Math.PI / 2);
        const maxLen = slice > .55 ? 14 : slice > .28 ? 8 : 4;
        const label = opt.label.length > maxLen ? opt.label.slice(0, maxLen - 1) + '...' : opt.label;
        const fs = Math.min(14, Math.max(8, slice * 24));
        ctx.shadowColor = "rgba(0,0,0,.5)";
        ctx.shadowBlur = 3;
        ctx.fillStyle = "#fff";
        ctx.font = `500 ${fs}px Outfit, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 0);
        ctx.restore();

        startAngle = end;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,.09)";
    ctx.lineWidth = 4;
    ctx.stroke();
}

function resizeWheel() {
    const area = document.getElementById('wheelArea');
    const avail = Math.min(area.clientWidth - 40, area.clientHeight - 190);
    const size = Math.max(180, Math.min(460, avail));
    const canvas = document.getElementById('wheel');
    canvas.width = size; canvas.height = size;
    drawWheel();
}

function spinWheel() {
    const wheel = activeWheel();
    if (!wheel || isSpinning) return;

    const opts = wheel.options.filter(o => o.enabled);
    if (opts.length === 0) return;

    const duration = 5000;
    isSpinning = true;

    const btn = document.getElementById("spinBtn");
    btn.classList.add("spinning"); btn.disabled = true;

    const resultDisplay = document.getElementById("resultDisplay");
    resultDisplay.innerHTML = "";

    const totalW = opts.reduce((s, o) => s + o.weight, 0);

    let rand = Math.random() * totalW;
    let winner = null;
    let accumulatedW = 0;
    let winnerStartAngle = 0;
    let randomPartInSlice = 0;

    for (const opt of opts) {
        if (rand < accumulatedW + opt.weight) {
            winner = opt;
            console.log(opt);
            winnerStartAngle = (accumulatedW / totalW) * TAU;
            randomPartInSlice = Math.random() * (opt.weight / totalW) * TAU;
            break;
        }
        accumulatedW += opt.weight;
    }

    const landingAngle = winnerStartAngle + randomPartInSlice;
    let targetRotation = -landingAngle;

    while (targetRotation >= currentRotation) {
        targetRotation -= TAU;
    }

    const extraSpins = 5 + Math.floor(Math.random() * 4);
    targetRotation -= extraSpins * TAU;

    const startRotation = currentRotation;
    const startTime = performance.now();

    function easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    function animate(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutQuart(progress);

        currentRotation = startRotation + (targetRotation - startRotation) * eased;
        drawWheel(currentRotation);

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            currentRotation = targetRotation;
            isSpinning = false;
            btn.classList.remove('spinning'); btn.disabled = false;
            showResult(winner);
        }
    }

    requestAnimationFrame(animate);
}

function switchTab(tab) {
    document.getElementById("tabOpts").classList.toggle('active', tab === 'opts');
    document.getElementById('tabResults').classList.toggle('active', tab === 'results');
    document.getElementById("optsPanel").style.display = tab === 'opts' ? 'flex' : 'none';
    document.getElementById('resultsPanel').style.display = tab === 'results' ? 'flex' : 'none';
    if (tab === "results") renderResults();
}

// ═══════════════════════════════════════════════════
// OPTIONS PANEL
// ═══════════════════════════════════════════════════

function renderOptionsPanel() {
    const wheel = activeWheel();
    const list = document.getElementById("optsList");
    const addBtn = document.getElementById("addOptBtn");
    const spinBtn = document.getElementById("spinBtn");

    if (!currentProject || !wheel) {
        list.innerHTML = `<div class="sb-empty"><i class="bi bi-sliders"></i><p>Open a wheel to edit it's options</p></div>`;
        addBtn.disabled = true;
        if (spinBtn) spinBtn.disabled = true;
        return;
    }

    document.getElementById("wheelTitleEl").textContent = wheel.name;
    addBtn.disabled = false;

    const active = wheel.options.filter(o => o.enabled);
    const totalW = active.reduce((s, o) => s + o.weight, 0);
    if (spinBtn) spinBtn.disabled = active.length < 1;

    if (wheel.options.length === 0) {
        list.innerHTML = `<div class="sb-empty"><i class="bi bi-layout-split"></i><p> No options yet — add one below</p></div>`;
        return;
    }

    list.innerHTML = '';
    wheel.options.forEach(opt => {
        const pct = (opt.enabled && totalW) ? Math.round(opt.weight / totalW * 100) : 0;
        const card = document.createElement('div');
        card.className = 'opt-card' + (opt.enabled ? '' : ' opt-disabled');
        card.innerHTML = `
            <div class="opt-row1">
                <label class="colour-swatch" style="background:${opt.colour}" title="Pick colour">
                    <input type="color" value="${opt.colour}" data-action="colour" data-id="${opt.id}">
                </label>
                <input class="opt-name" type="text" value="${esc(opt.label)}" placeholder="Option name" data-action="label" data-id="${opt.id}">
                <button class="toggle ${opt.enabled?'on':''}" data-action="toggle" data-id="${opt.id}" title="${opt.enabled?'Disable':'Enable'}"></button>
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
    wheel.options.push({ id: uid(), label: "Option " + (wheel.options.length + 1), weight: 1, colour, enabled: true });
    markDirty(true); renderOptionsPanel(); drawWheel();
    const list = document.getElementById('optsList');
    list.scrollTop = list.scrollHeight;
}

function sortOptions() {
    const wheel = activeWheel(); if (!wheel) return;
    wheel.options.sort((a,b) => b.weight - a.weight);
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
    const list = document.getElementById("resultsList");
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
            label: winner.label,
            colour: winner.colour,
            wheelName: activeWheel()?.name || '',
            at: new Date().toISOString(),
        });
        markDirty(true);
        if (document.getElementById("tabResults").classList.contains('active')) renderResults();
    }

    document.getElementById("resultDisplay").innerHTML = `
    <div class="result-bubble">
        <div class="result-dot" style="background:${winner.colour}"></div>
        ${esc(winner.label)}!
    </div>`;
    launchConfetti(winner.colour)
}

// ═══════════════════════════════════════════════════
// General UI
// ═══════════════════════════════════════════════════

const PALETTE = [
    '#f87171','#fb923c','#fbbf24','#a3e635','#34d399',
    '#22d3ee','#60a5fa','#a78bfa','#f472b6','#f43f5e',
    '#e879f9','#2dd4bf','#facc15','#4ade80','#38bdf8',
];

function launchConfetti(base) {
    const c = document.getElementById("confettiWrap"); c.innerHTML = '';
    const colours = [base, '#f0b429', "#a78bfa", "#34d399", "#f472b6", "#60a5fa"];
    for (let i = 0; i < 60; i++) {
        const p = document.createElement('div');
        p.className = 'confetti-piece';
        const sz = 6 + Math.random() * 10;
        p.style.cssText = `left:${Math.random()*100}%;top:-20px;width:${sz}px;height:${sz}px;
            background:${colours[Math.floor(Math.random()*colours.length)]};
            border-radius:${Math.random()>.5?'50%':'2px'};
            animation-delay:${Math.random()*.5}s;animation-duration:${2+Math.random()*1.5}s;`;
        c.appendChild(p);
    }
    setTimeout(() => c.classList.add('fade-out'), 4000);
    setTimeout(() => { c.innerHTML = ''; c.classList.remove('fade-out'); }, 4500);
}

let toastTimer;
function showToast(msg, type, duration = 2000) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

function renderHomeRecent() {
    const wrap = document.getElementById('homeRecent');
    const idx = getIndex();
    if (idx.length === 0) { wrap.innerHTML = ''; return; }
    const recent = idx.slice(0, 5);
    wrap.innerHTML = `<div class="hr-title">Recent Projects</div>`
    recent.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'recent-item';
        item.innerHTML = `
            <i class="bi bi-collection ri-icon"></i>
            <div class="ri-info">
                <div class="ri-name">${esc(entry.name)}</div>
                <div class="ri-date">${formatDate(entry.savedAt)}</div>
            </div>
            <button class="ri-del" title="Delete" onclick="deleteProject('${entry.id}');event.stopPropagation();"><i class="bi bi-trash3"></i></button>
        `;
        item.addEventListener('click', e => { if (!e.target.closest('.ri-del')) { loadProject(entry.id); } });
        wrap.appendChild(item);
    })
}

function updateHeaderState() {
    const hasPrj = !!currentProject;
    document.getElementById("hdrDivider").style.display = hasPrj ? '' : 'none';
    document.getElementById("projNameWrap").style.display = hasPrj ? '' : 'none';
    document.getElementById('saveActions').style.display = hasPrj ? 'flex' : 'none';
    document.getElementById('sidebarLeft').classList.toggle('dimmed', !hasPrj);
    document.getElementById('sidebarRight').classList.toggle('dimmed', !hasPrj);
    document.getElementById("header").classList.toggle('dimmed', !hasPrj);

    if (hasPrj) {
        document.getElementById("projNameEl").textContent = currentProject.name;
        document.title = (isDirty ? '' : '') + currentProject.name + ' — Spindle';
    } else {
        document.title = "Spindle — Wheel of Decisions";
        markDirty(null)
    }
}

function showState(state) {
    document.getElementById('homeScreen').style.display = state === "home" ? 'flex' : 'none';
    document.getElementById('noWheelMsg').style.display = state === "no-wheel" ? 'flex' : 'none';
    document.getElementById('wheelUI').style.display = state === "wheel" ? 'flex' : 'none';
    if (state !== 'wheel') {
        document.getElementById("spinBtn").disabled = true
        document.getElementById("resultDisplay").innerHTML = ''
    }
}

function markDirty(state) {
    const statusDot = document.getElementById("statusDot")

    if (state == true) {
        isDirty = true;
        statusDot.classList.add('dirty')
        statusDot.classList.remove('clean')
    } else if (state == false) {
        isDirty = false
        statusDot.classList.add('clean')
        statusDot.classList.remove('dirty')
    } else {
        isDirty = false
        statusDot.classList.remove("clean", "dirty")
    }
}

// ═══════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString();
}

const TAU = 2*Math.PI

// ═══════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════

// ---| Close GenericModal onclick |--- \\
document.getElementById("genericBackdrop").addEventListener('click', e => { if (e.target === document.getElementById("genericBackdrop")) hideGenericModal(); });

// ---| Close OpenProjectModal onclick |--- \\
document.getElementById('openBackdrop').addEventListener('click', e => { if (e.target === document.getElementById('openBackdrop')) hideOpenProjectModal(); });

// ---| Option Property Changing |--- \\
document.getElementById("optsList").addEventListener("input", e => {
    const t = e.target; const { action, id } = t.dataset;
    if (!action || !id || !currentProject) return;
    const wheel = activeWheel(); if (!wheel) return;
    const opt = wheel.options.find(o => o.id === id); if (!opt) return;

    if (action === "colour") {
        opt.colour = t.value;
        t.closest(".colour-swatch").style.background = t.value;
        markDirty(true); drawWheel();
    }
    if (action === "label") { opt.label = t.value; markDirty(true); drawWheel(); }
    if (action === "weight-range" || action === "weight-num") {
        const val = Math.max(1, Math.min(99, parseInt(t.value) || 1));
        opt.weight = val
        const card = t.closest('.opt-card');
        if (card) {
            const r = card.querySelector('[data-action="weight-range"]');
            const n = card.querySelector('[data-action="weight-num"]');
            if (r && action === 'weight-range') n.value = val;
            if (n && action === 'weight-num') r.value = val;
        }

        const allActive = wheel.options.filter(o => o.enabled);
        const tw = allActive.reduce((s, o) => s + o.weight, 0);
        document.querySelectorAll("#optsList .opt-card").forEach(c => {
            const cId = c.querySelector('[data-id]')?.dataset.id;
            const cOpt = wheel.options.find(o => o.id === cId);
            const pe = c.querySelector(".w-pct");
            if (cOpt && pe) {
                pe.textContent = (cOpt.enabled && tw) ? Math.round(cOpt.weight / tw * 100) + "%" : "0%";
            };
        });

        markDirty(true);
        drawWheel();
    }
});
document.getElementById("optsList").addEventListener('click', e => {
    const t = e.target.closest('[data-action'); if (!t) return;
    const { action, id } = t.dataset;
    if (!action || !id || !currentProject) return;
    const wheel = activeWheel(); if (!wheel) return;
    const opt = wheel.options.find(o => o.id === id);

    if (action === 'toggle' && opt) {
        opt.enabled = !opt.enabled;
        markDirty(true); renderOptionsPanel(); drawWheel();
    }
    if (action === "delete") {
        wheel.options = wheel.options.filter(o => o.id !== id);
        markDirty(true); renderOptionsPanel(); drawWheel();
    }
});

// ---| Spin Wheel |--- \\
document.getElementById('wheel').addEventListener('click', () => { if (!isSpinning) spinWheel(); });
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); spinWheel(); }
});

// ---| Resizing |--- \\
window.addEventListener('resize', resizeWheel);

// ---| Stops before unloading |--- \\
window.addEventListener('beforeunload', e => {
    if (isDirty) e.preventDefault();
})

// ---| Shortcuts |--- \\
window.addEventListener("keydown", ev => {
    if (ev.ctrlKey || ev.metaKey) {
        if (ev.key.toLowerCase() === "p") {
            ev.preventDefault();
            newProject();
        } else if (ev.key.toLowerCase() === "o") {
            ev.preventDefault();
            renderOpenModal();
            showOpenProjectModal();
        }
    }
})

// ═══════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════

showState('home');
renderHomeRecent();
updateHeaderState();
resizeWheel();