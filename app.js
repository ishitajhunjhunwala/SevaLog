const STORAGE_KEY = "sevalog:mvp";

const quickTemplates = [
  {
    type: "medicine",
    title: "Gave morning BP tablet",
    note: "Taken after breakfast."
  },
  {
    type: "meal",
    title: "Breakfast done",
    note: "Ate normally."
  },
  {
    type: "vitals",
    title: "Checked blood pressure",
    note: "Add reading here."
  },
  {
    type: "appointment",
    title: "Doctor appointment update",
    note: "Add doctor, date, and next step."
  }
];

const initialState = {
  profile: {
    elderName: "",
    caregiverName: ""
  },
  entries: []
};

let state = loadState();

const elements = {
  profileForm: document.querySelector("#profile-form"),
  elderName: document.querySelector("#elder-name"),
  caregiverName: document.querySelector("#caregiver-name"),
  entryForm: document.querySelector("#entry-form"),
  entryType: document.querySelector("#entry-type"),
  entryTime: document.querySelector("#entry-time"),
  entryTitle: document.querySelector("#entry-title"),
  entryNote: document.querySelector("#entry-note"),
  clearForm: document.querySelector("#clear-form"),
  quickActions: document.querySelector("#quick-actions"),
  filterType: document.querySelector("#filter-type"),
  timeline: document.querySelector("#timeline"),
  emptyTemplate: document.querySelector("#timeline-empty"),
  digestPreview: document.querySelector("#digest-preview"),
  shareWhatsapp: document.querySelector("#share-whatsapp"),
  copyDigest: document.querySelector("#copy-digest"),
  exportData: document.querySelector("#export-data"),
  importData: document.querySelector("#import-data"),
  resetData: document.querySelector("#reset-data"),
  installSample: document.querySelector("#install-sample"),
  todayCount: document.querySelector("#today-count"),
  medCount: document.querySelector("#med-count"),
  lastLog: document.querySelector("#last-log"),
  syncStatus: document.querySelector("#sync-status")
};

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return structuredClone(initialState);

  try {
    const parsed = JSON.parse(stored);
    return {
      profile: { ...initialState.profile, ...(parsed.profile || {}) },
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  elements.syncStatus.textContent = "Saved on this phone";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
}

function formatDisplayTime(dateISO, time) {
  const date = new Date(`${dateISO}T${time || "00:00"}`);
  return date.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderQuickActions() {
  elements.quickActions.innerHTML = "";
  quickTemplates.forEach((template) => {
    const button = document.createElement("button");
    button.className = "quick-action";
    button.type = "button";
    button.innerHTML = `<strong>${template.title}</strong><span>${labelForType(template.type)}</span>`;
    button.addEventListener("click", () => {
      addEntry({
        type: template.type,
        title: template.title,
        note: template.note,
        date: todayISO(),
        time: currentTime()
      });
    });
    elements.quickActions.append(button);
  });
}

function labelForType(type) {
  const labels = {
    medicine: "Medicine",
    meal: "Meal",
    vitals: "Vitals",
    appointment: "Appointment",
    note: "Note"
  };
  return labels[type] || "Note";
}

function addEntry(entry) {
  const cleanEntry = {
    id: crypto.randomUUID(),
    type: entry.type || "note",
    title: entry.title.trim(),
    note: entry.note.trim(),
    date: entry.date || todayISO(),
    time: entry.time || currentTime(),
    caregiver: state.profile.caregiverName.trim() || "Caregiver",
    createdAt: new Date().toISOString()
  };

  if (!cleanEntry.title) return;

  state.entries.unshift(cleanEntry);
  saveState();
  render();
  showToast("Added to today's care timeline");
}

function removeEntry(id) {
  state.entries = state.entries.filter((entry) => entry.id !== id);
  saveState();
  render();
  showToast("Update removed");
}

function renderProfile() {
  elements.elderName.value = state.profile.elderName;
  elements.caregiverName.value = state.profile.caregiverName;
  elements.entryTime.value = elements.entryTime.value || currentTime();
}

function renderStats() {
  const todaysEntries = getTodaysEntries();
  elements.todayCount.textContent = String(todaysEntries.length);
  elements.medCount.textContent = String(todaysEntries.filter((entry) => entry.type === "medicine").length);
  elements.lastLog.textContent = state.entries[0]
    ? formatDisplayTime(state.entries[0].date, state.entries[0].time)
    : "No logs yet";
}

function getTodaysEntries() {
  const today = todayISO();
  return state.entries.filter((entry) => entry.date === today);
}

function renderTimeline() {
  const selectedType = elements.filterType.value;
  const entries = state.entries.filter((entry) => selectedType === "all" || entry.type === selectedType);

  elements.timeline.innerHTML = "";

  if (!entries.length) {
    elements.timeline.append(elements.emptyTemplate.content.cloneNode(true));
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "timeline-item";
    item.innerHTML = `
      <time class="timeline-time" datetime="${entry.date}T${entry.time}">
        ${formatDisplayTime(entry.date, entry.time)}
      </time>
      <div class="timeline-copy">
        <span class="category ${entry.type}">${labelForType(entry.type)}</span>
        <h3>${escapeHtml(entry.title)}</h3>
        ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
        <p>Logged by ${escapeHtml(entry.caregiver || "Caregiver")}</p>
      </div>
      <button class="icon-button" type="button" aria-label="Remove ${escapeHtml(entry.title)}" title="Remove">x</button>
    `;
    item.querySelector("button").addEventListener("click", () => removeEntry(entry.id));
    elements.timeline.append(item);
  });
}

function buildDigest() {
  const name = state.profile.elderName.trim() || "Elder";
  const caregiver = state.profile.caregiverName.trim() || "caregiver";
  const todaysEntries = getTodaysEntries().slice().reverse();
  const heading = `${name} care update from ${caregiver}`;

  if (!todaysEntries.length) {
    return `${heading}\n\nNo updates have been logged today yet.`;
  }

  const lines = todaysEntries.map((entry) => {
    const detail = entry.note ? ` - ${entry.note}` : "";
    return `${entry.time} | ${labelForType(entry.type)} | ${entry.title}${detail}`;
  });

  return `${heading}\n\n${lines.join("\n")}`;
}

function renderDigest() {
  elements.digestPreview.textContent = buildDigest();
}

function render() {
  renderProfile();
  renderStats();
  renderDigest();
  renderTimeline();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 2400);
}

async function copyDigest() {
  const digest = buildDigest();
  try {
    await navigator.clipboard.writeText(digest);
    showToast("Digest copied");
  } catch {
    showToast("Select the digest text and copy it");
  }
}

function shareOnWhatsapp() {
  const digest = encodeURIComponent(buildDigest());
  window.open(`https://wa.me/?text=${digest}`, "_blank", "noopener,noreferrer");
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sevalog-backup-${todayISO()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed.profile || !Array.isArray(parsed.entries)) throw new Error("Invalid backup");
      state = {
        profile: { ...initialState.profile, ...parsed.profile },
        entries: parsed.entries
      };
      saveState();
      render();
      showToast("Backup imported");
    } catch {
      showToast("That backup file could not be read");
    }
  };
  reader.readAsText(file);
}

function loadDemo() {
  const today = todayISO();
  state = {
    profile: {
      elderName: "Amma",
      caregiverName: "Meera"
    },
    entries: [
      {
        id: crypto.randomUUID(),
        type: "appointment",
        title: "Dr Iyer visit moved",
        note: "New slot is Friday at 4:00 PM. Carry the last BP readings.",
        date: today,
        time: "17:10",
        caregiver: "Meera",
        createdAt: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        type: "vitals",
        title: "Blood pressure checked",
        note: "132/84 before evening tea.",
        date: today,
        time: "16:20",
        caregiver: "Meera",
        createdAt: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        type: "medicine",
        title: "Gave BP tablet",
        note: "Taken after breakfast.",
        date: today,
        time: "09:05",
        caregiver: "Meera",
        createdAt: new Date().toISOString()
      }
    ]
  };
  saveState();
  render();
  showToast("Demo care day loaded");
}

elements.profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.profile.elderName = elements.elderName.value.trim();
  state.profile.caregiverName = elements.caregiverName.value.trim();
  saveState();
  render();
  showToast("Care circle saved");
});

elements.entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addEntry({
    type: elements.entryType.value,
    title: elements.entryTitle.value,
    note: elements.entryNote.value,
    date: todayISO(),
    time: elements.entryTime.value || currentTime()
  });
  elements.entryForm.reset();
  elements.entryTime.value = currentTime();
});

elements.clearForm.addEventListener("click", () => {
  elements.entryForm.reset();
  elements.entryTime.value = currentTime();
});

elements.filterType.addEventListener("change", renderTimeline);
elements.copyDigest.addEventListener("click", copyDigest);
elements.shareWhatsapp.addEventListener("click", shareOnWhatsapp);
elements.exportData.addEventListener("click", exportBackup);
elements.importData.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) importBackup(file);
  event.target.value = "";
});
elements.resetData.addEventListener("click", () => {
  const confirmed = window.confirm("Reset all SevaLog data stored on this device?");
  if (!confirmed) return;
  state = structuredClone(initialState);
  saveState();
  render();
  showToast("Device data reset");
});
elements.installSample.addEventListener("click", loadDemo);

renderQuickActions();
render();
