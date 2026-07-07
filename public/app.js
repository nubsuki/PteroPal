// State
let currentBrowsePath = "/";
let selectedPath = "/";

// Bootstrap Icons
const icons = {
  folder: `<i class="bi bi-folder-fill"></i>`,
  folderOpen: `<i class="bi bi-folder2-open"></i>`,
  delete: `<i class="bi bi-trash"></i>`,
  checkCircle: `<i class="bi bi-check-circle-fill"></i>`,
  xCircle: `<i class="bi bi-x-circle-fill"></i>`,
  warning: `<i class="bi bi-exclamation-triangle-fill"></i>`,
  dirItem: `<i class="bi bi-folder"></i>`,
};

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadFolders();
});

// Load configured folders from API
async function loadFolders() {
  try {
    const res = await fetch("/api/folders");
    const data = await res.json();
    renderFolders(data.folders);
  } catch (err) {
    console.error("Failed to load folders:", err);
    showToast("Failed to load folder configuration", "error");
  }
}

// Render folders list
function renderFolders(folders) {
  const listEl = document.getElementById("folderList");
  const emptyEl = document.getElementById("emptyState");

  if (!folders || folders.length === 0) {
    listEl.innerHTML = "";
    emptyEl.style.display = "flex";
    return;
  }

  emptyEl.style.display = "none";
  listEl.innerHTML = folders
    .map(
      (folder, index) => `
    <div class="folder-item">
      <div class="folder-item-icon">${icons.folder}</div>
      <div class="folder-item-info">
        <div class="folder-item-name">${escapeHtml(folder.name)}</div>
        <div class="folder-item-path" title="${escapeHtml(folder.path)}">${escapeHtml(folder.path)}</div>
      </div>
      <div class="folder-item-delete">
        <button class="btn btn-danger" onclick="deleteFolder(${index})" title="Remove folder">
          ${icons.delete}
        </button>
      </div>
    </div>
  `,
    )
    .join("");
}

// Delete folder entry
async function deleteFolder(index) {
  try {
    const res = await fetch(`/api/folders/${index}`, { method: "DELETE" });
    const data = await res.json();

    if (res.ok) {
      renderFolders(data.folders);
      showToast(`Removed "${data.removed.name}"`, "success");
      hideTestResults("folderTestResults");
    } else {
      showToast(data.error || "Failed to remove folder", "error");
    }
  } catch (err) {
    console.error("Failed to delete folder:", err);
    showToast("Failed to remove folder", "error");
  }
}

// Add folder entry
async function addFolder() {
  const nameInput = document.getElementById("folderName");
  const name = nameInput.value.trim();
  const path = selectedPath;

  if (!name) {
    showToast("Please enter a folder name", "error");
    nameInput.focus();
    return;
  }

  if (!path || path === "/") {
    showToast("Please select a folder path", "error");
    return;
  }

  const btn = document.getElementById("addFolderBtn");
  btn.disabled = true;

  try {
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, path }),
    });
    const data = await res.json();

    if (res.ok) {
      renderFolders(data.folders);
      closeBrowserModal();
      showToast(`Added "${name}"`, "success");
      hideTestResults("folderTestResults");
    } else {
      showToast(data.error || "Failed to add folder", "error");
    }
  } catch (err) {
    console.error("Failed to add folder:", err);
    showToast("Failed to add folder", "error");
  } finally {
    btn.disabled = false;
  }
}

// Open directory browser modal
function openBrowserModal() {
  const modal = document.getElementById("browserModal");
  modal.style.display = "flex";
  document.getElementById("folderName").value = "";
  selectedPath = "/";
  document.getElementById("selectedPath").textContent = "/";
  browseTo("/");

  modal.onclick = (e) => {
    if (e.target === modal) closeBrowserModal();
  };

  document.addEventListener("keydown", handleModalEscape);
}

// Close directory browser modal
function closeBrowserModal() {
  const modal = document.getElementById("browserModal");
  modal.style.display = "none";
  document.removeEventListener("keydown", handleModalEscape);
}

function handleModalEscape(e) {
  if (e.key === "Escape") closeBrowserModal();
}

// Fetch subdirectories at target path
async function browseTo(path) {
  currentBrowsePath = path;
  selectedPath = path;
  document.getElementById("selectedPath").textContent = path;

  const listEl = document.getElementById("directoryList");
  listEl.innerHTML = `
    <div class="directory-loading">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>
  `;

  try {
    const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
    const data = await res.json();

    if (!res.ok) {
      listEl.innerHTML = `
        <div class="directory-error">
          <span>${icons.xCircle}</span>
          <span>${escapeHtml(data.error || "Failed to read directory")}</span>
        </div>
      `;
      return;
    }

    renderBreadcrumb(data.current);
    renderDirectories(data.directories, data.parent);
  } catch (err) {
    console.error("Failed to browse:", err);
    listEl.innerHTML = `
      <div class="directory-error">
        <span>${icons.xCircle}</span>
        <span>Failed to connect to server</span>
      </div>
    `;
  }
}

// Render path breadcrumbs
function renderBreadcrumb(currentPath) {
  const breadcrumbEl = document.getElementById("breadcrumb");
  const parts = currentPath.split("/").filter(Boolean);

  let html = `<span class="breadcrumb-item${parts.length === 0 ? " active" : ""}" onclick="browseTo('/')">Root</span>`;

  let accumulated = "";
  parts.forEach((part, i) => {
    accumulated += "/" + part;
    const isLast = i === parts.length - 1;
    html += `<span class="breadcrumb-sep">›</span>`;
    html += `<span class="breadcrumb-item${isLast ? " active" : ""}" onclick="browseTo('${escapeAttr(accumulated)}')">${escapeHtml(part)}</span>`;
  });

  breadcrumbEl.innerHTML = html;
  breadcrumbEl.scrollLeft = breadcrumbEl.scrollWidth;
}

// Render subdirectories
function renderDirectories(directories, parentPath) {
  const listEl = document.getElementById("directoryList");

  if (directories.length === 0) {
    listEl.innerHTML = `
      <div class="directory-empty">
        <span style="opacity: 0.4;">${icons.folderOpen}</span>
        <span>No subdirectories found</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = directories
    .map(
      (dir) => `
    <div class="directory-item" onclick="browseTo('${escapeAttr(dir.path)}')">
      <span class="directory-item-icon">${icons.dirItem}</span>
      <span class="directory-item-name">${escapeHtml(dir.name)}</span>
    </div>
  `,
    )
    .join("");
}

// Test folder accessibility
async function testFolderAccess() {
  const btn = document.getElementById("testFoldersBtn");
  const resultsEl = document.getElementById("folderTestResults");
  btn.disabled = true;
  btn.innerHTML = `<div class="btn-spinner"></div> Testing...`;

  try {
    const res = await fetch("/api/test/folders", { method: "POST" });
    const data = await res.json();

    if (data.results.length === 0) {
      resultsEl.innerHTML = `
        <div class="test-item warning">
          <span class="test-item-icon">${icons.warning}</span>
          <div class="test-item-content">
            <div class="test-item-name">No folders configured</div>
            <div class="test-item-message">Add folders first, then test access</div>
          </div>
        </div>
      `;
    } else {
      resultsEl.innerHTML = data.results
        .map(
          (r) => `
        <div class="test-item ${r.accessible ? "success" : "error"}">
          <span class="test-item-icon">${r.accessible ? icons.checkCircle : icons.xCircle}</span>
          <div class="test-item-content">
            <div class="test-item-name">${escapeHtml(r.name)}</div>
            <div class="test-item-message">${escapeHtml(r.path)} — ${escapeHtml(r.message)}</div>
          </div>
        </div>
      `,
        )
        .join("");
    }

    resultsEl.style.display = "flex";
  } catch (err) {
    console.error("Folder test failed:", err);
    showToast("Failed to test folder access", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <i class="bi bi-check-circle"></i>
      Test Access
    `;
  }
}

// Test panel connectivity
async function testPanelConnections() {
  const btn = document.getElementById("testPanelsBtn");
  const resultsEl = document.getElementById("panelTestResults");
  btn.disabled = true;
  btn.innerHTML = `<div class="btn-spinner"></div> Testing...`;

  try {
    const res = await fetch("/api/test/panels", { method: "POST" });
    const data = await res.json();

    resultsEl.innerHTML = data.results
      .map((r) => {
        let statusClass = "warning";
        let icon = icons.warning;
        if (r.status === "online") {
          statusClass = "success";
          icon = icons.checkCircle;
        } else if (r.status === "error") {
          statusClass = "error";
          icon = icons.xCircle;
        }

        return `
        <div class="test-item ${statusClass}">
          <span class="test-item-icon">${icon}</span>
          <div class="test-item-content">
            <div class="test-item-name">${escapeHtml(r.name)}</div>
            <div class="test-item-message">${escapeHtml(r.message)}</div>
          </div>
        </div>
      `;
      })
      .join("");
  } catch (err) {
    console.error("Panel test failed:", err);
    showToast("Failed to test panel connections", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <i class="bi bi-check-circle"></i>
      Test Connections
    `;
  }
}

// Show toast notification
let toastTimeout = null;
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const msgEl = document.getElementById("toastMessage");
  const iconEl = document.getElementById("toastIcon");

  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toast.classList.remove("show");
  }

  msgEl.textContent = message;
  iconEl.innerHTML = type === "success" ? "✅" : "❌";
  toast.className = `toast ${type}`;

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// Utility Helpers
function hideTestResults(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.style.display = "none";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}
