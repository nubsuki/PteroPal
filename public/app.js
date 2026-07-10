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
  loadDriveStatus();
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

// Google Drive

let driveConnectPollInterval = null;

// Load and render Drive connection status
async function loadDriveStatus() {
  try {
    const res = await fetch("/api/drive/status");
    const data = await res.json();
    renderDriveStatus(data);
  } catch (err) {
    console.error("Failed to load Drive status:", err);
  }
}

// Render Drive status UI
function renderDriveStatus(data) {
  const section = document.getElementById("driveSection");
  const dot = document.getElementById("driveStatusDot");
  const label = document.getElementById("driveStatusLabel");
  const reason = document.getElementById("driveStatusReason");
  const actions = document.getElementById("driveActions");

  if (!data.enabled) {
    section.classList.add("section-disabled");
    dot.className = "drive-status-dot dot-disabled";
    label.textContent = "Disabled";
    reason.textContent =
      "Set ENABLE_DRIVE_BACKUP=true in your .env to enable Google Drive backups.";
    actions.innerHTML = "";
    return;
  }

  section.classList.remove("section-disabled");

  if (!data.hasCredentials) {
    dot.className = "drive-status-dot dot-disconnected";
    label.textContent = "Missing Credentials";
    reason.textContent =
      data.reason || "Upload your Google Cloud credentials.json file to begin.";
    actions.innerHTML = `
      <button class="btn btn-primary" onclick="document.getElementById('credentialsUploadInput').click()">
        <i class="bi bi-file-earmark-arrow-up"></i>
        Upload credentials.json
      </button>
    `;
  } else if (!data.connected) {
    dot.className = "drive-status-dot dot-disconnected";
    label.textContent = "Not Connected";
    reason.textContent =
      data.reason || "Authorize Google Drive to enable cloud backups.";
    actions.innerHTML = `
      <button class="btn btn-danger-outline" onclick="removeCredentials()" title="Remove credentials.json" style="margin-right: 10px;">
        <i class="bi bi-trash"></i>
      </button>
      <button class="btn btn-primary" id="driveConnectBtn" onclick="connectDrive()">
        <i class="bi bi-cloud-arrow-up"></i>
        Connect Google Drive
      </button>
    `;
  } else {
    dot.className = "drive-status-dot dot-connected";
    label.textContent = "Connected";
    reason.textContent = "Google Drive is authorized and ready for backups.";
    actions.innerHTML = `
      <button class="btn btn-outline" id="driveTestBtn" onclick="testDriveBackup()" style="margin-right: 10px;">
        <i class="bi bi-play-circle"></i>
        Test Backup
      </button>
      <button class="btn btn-danger-outline" id="driveDisconnectBtn" onclick="disconnectDrive()">
        <i class="bi bi-cloud-slash"></i>
        Disconnect
      </button>
    `;
  }
}

// Handle credentials.json upload
function handleCredentialsUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const json = JSON.parse(e.target.result);
      if (!json.web || !json.web.client_id) {
        showToast("Invalid credentials.json format.", "error");
        return;
      }

      const res = await fetch("/api/drive/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json();

      if (res.ok) {
        showToast("Credentials uploaded successfully", "success");
        await loadDriveStatus();
      } else {
        showToast(data.error || "Failed to upload credentials", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error parsing JSON file.", "error");
    } finally {
      // Reset input so the same file can be uploaded again if needed
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

// Remove credentials.json
async function removeCredentials() {
  if (!confirm("Are you sure you want to remove the credentials.json file?"))
    return;
  try {
    const res = await fetch("/api/drive/credentials", { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      showToast("Credentials removed", "success");
      await loadDriveStatus();
    } else {
      showToast(data.error || "Failed to remove credentials", "error");
    }
  } catch (err) {
    console.error(err);
    showToast("Failed to remove credentials", "error");
  }
}

// Open OAuth URL and poll for connection
async function connectDrive() {
  try {
    const res = await fetch("/api/drive/auth-url");
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not generate auth URL", "error");
      return;
    }

    // Open the auth URL in a new tab
    window.open(data.url, "_blank");
    showToast("Complete the Google authorization in the new tab...", "success");

    // Poll every 3 seconds until connected (max 5 minutes)
    let pollCount = 0;
    const maxPolls = 100;
    if (driveConnectPollInterval) clearInterval(driveConnectPollInterval);
    driveConnectPollInterval = setInterval(async () => {
      pollCount++;
      const statusRes = await fetch("/api/drive/status");
      const statusData = await statusRes.json();
      if (statusData.connected) {
        clearInterval(driveConnectPollInterval);
        driveConnectPollInterval = null;
        renderDriveStatus(statusData);
        showToast("Google Drive connected successfully!", "success");
      } else if (pollCount >= maxPolls) {
        clearInterval(driveConnectPollInterval);
        driveConnectPollInterval = null;
        showToast("Connection timed out. Try again.", "error");
      }
    }, 3000);
  } catch (err) {
    console.error("Failed to connect Drive:", err);
    showToast("Failed to initiate Drive connection", "error");
  }
}

// Disconnect Drive (remove local token)
async function disconnectDrive() {
  try {
    const res = await fetch("/api/drive/token", { method: "DELETE" });
    const data = await res.json();

    if (res.ok) {
      showToast("Google Drive disconnected", "success");
      await loadDriveStatus();
    } else {
      showToast(data.error || "Failed to disconnect Drive", "error");
    }
  } catch (err) {
    console.error("Failed to disconnect Drive:", err);
    showToast("Failed to disconnect Drive", "error");
  }
}

// Test Drive Backup manually from UI
async function testDriveBackup() {
  const btn = document.getElementById("driveTestBtn");
  btn.disabled = true;
  btn.innerHTML = `<i class="bi bi-hourglass-split"></i> Starting...`;

  try {
    const res = await fetch("/api/drive/test", { method: "POST" });
    const data = await res.json();

    if (res.ok) {
      showToast(
        "Manual backup started! Check console for progress.",
        "success",
      );
    } else {
      showToast(data.error || "Failed to start backup", "error");
    }
  } catch (err) {
    console.error("Failed to start test backup:", err);
    showToast("Failed to communicate with server", "error");
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-play-circle"></i> Test Backup`;
    }, 2000);
  }
}
