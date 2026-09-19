const $ = (id) => document.getElementById(id);
const types = { medicine: "Medicine", meal: "Meal", vitals: "Vitals", appointment: "Appointment", note: "Note" };
let db, user, circle;
let circles = [], entries = [];
let generation = 0, busy = false, recovery = false;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const timeNow = () => new Date().toTimeString().slice(0, 5);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
}
async function checked(request) {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}
async function act(work) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll("button, input, select, textarea")];
  const disabled = controls.map((control) => control.disabled);
  controls.forEach((control) => { control.disabled = true; });
  try { await work(); } catch (error) { message(error.message || "Something went wrong. Please retry.", true); }
  finally {
    controls.forEach((control, index) => { control.disabled = disabled[index]; });
    busy = false;
    $("elder-name").disabled = !!circle && circle.owner_id !== user?.id;
  }
}
function on(id, event, work) {
  $(id).addEventListener(event, (e) => {
    e.preventDefault();
    if (id === "sign-up" && !$("auth-form").reportValidity()) return;
    if (id === "forgot-password" && !$("email").reportValidity()) return;
    void act(() => work(e));
  });
}
function clearCare() {
  generation++;
  circle = undefined;
  entries = [];
  $("care-workspace").hidden = true;
  $("invite-tools").hidden = true;
  $("invite-result").textContent = "";
  $("timeline").replaceChildren();
  $("digest-preview").textContent = "";
  $("profile-form").reset();
  $("entry-form").reset();
}
async function sessionChanged(session) {
  const next = session?.user;
  if (next?.id === user?.id && user) { user = next; return; }
  clearCare();
  user = next;
  circles = [];
  $("circle-select").replaceChildren();
  $("account-email").textContent = user?.email || "";
  $("sign-out").hidden = !user;
  $("auth-panel").hidden = !!user;
  $("circle-panel").hidden = !user || recovery;
  if (!user) { message("Sign in or create an account."); return; }
  await loadCircles();
}
async function loadCircles(preferred) {
  const version = generation;
  const data = await checked(db.from("care_circles").select("id,elder_name,owner_id").order("created_at"));
  if (version !== generation || !user) return;
  circles = data;
  $("circle-select").replaceChildren(new Option("Choose a circle", ""));
  circles.forEach((item) => $("circle-select").add(new Option(item.elder_name, item.id)));
  const selected = circles.find((item) => item.id === preferred) || circles[0];
  if (selected) await selectCircle(selected.id);
  else message("Create a care circle or join one with an invitation code.");
}
async function selectCircle(id) {
  clearCare();
  circle = circles.find((item) => item.id === id);
  $("circle-select").value = circle?.id || "";
  if (!circle) return;
  $("elder-name").value = circle.elder_name;
  $("elder-name").disabled = circle.owner_id !== user.id;
  $("caregiver-name").value = user.user_metadata?.display_name || "";
  $("entry-time").value = timeNow();
  $("care-workspace").hidden = false;
  $("invite-tools").hidden = circle.owner_id !== user.id;
  await refresh();
}
let refreshSequence = 0;
async function refresh() {
  if (!circle) return;
  const sequence = ++refreshSequence, version = generation, id = circle.id;
  $("sync-status").textContent = "Syncing...";
  try {
    // Page through history instead of silently truncating at Supabase's row limit.
    const data = [];
    for (let offset = 0; ; offset += 500) {
      const page = await checked(db.from("care_entries").select("*").eq("circle_id", id)
        .order("entry_date", { ascending: false }).order("entry_time", { ascending: false })
        .order("id").range(offset, offset + 499));
      if (version !== generation || sequence !== refreshSequence) return;
      data.push(...page);
      if (page.length < 500) break;
    }
    entries = data;
    render();
    $("sync-status").textContent = "Up to date";
  } catch (error) {
    if (version === generation && sequence === refreshSequence) {
      $("sync-status").textContent = "Could not sync";
      message(`Could not refresh. Displayed updates may be out of date. ${error.message}`, true);
    }
  }
}
function digest() {
  const list = entries.filter((entry) => entry.entry_date === today()).slice().reverse();
  return `${circle?.elder_name || "Elder"} care update - ${today()}\n\n` +
    (list.map((entry) => `${entry.entry_time.slice(0, 5)} | ${types[entry.type]} | ${entry.title}${entry.note ? ` - ${entry.note}` : ""} (${entry.caregiver})`).join("\n") || "No updates today yet.");
}
function render() {
  const todays = entries.filter((entry) => entry.entry_date === today());
  $("today-count").textContent = todays.length;
  $("med-count").textContent = todays.filter((entry) => entry.type === "medicine").length;
  $("last-log").textContent = entries[0] ? `${entries[0].entry_date} ${entries[0].entry_time.slice(0, 5)}` : "No logs yet";
  $("digest-preview").textContent = digest();
  $("timeline").replaceChildren();
  const filtered = entries.filter((entry) => $("filter-type").value === "all" || entry.type === $("filter-type").value);
  if (!filtered.length) $("timeline").append($("timeline-empty").content.cloneNode(true));
  filtered.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "timeline-item";
    item.innerHTML = `<time class="timeline-time">${escapeHtml(entry.entry_date)}<br>${escapeHtml(entry.entry_time.slice(0, 5))}</time>
      <div class="timeline-copy"><span class="category ${escapeHtml(entry.type)}">${types[entry.type]}</span>
      <h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.note)}</p><p>Logged by ${escapeHtml(entry.caregiver)}</p></div>`;
    if (entry.author_id === user?.id || circle?.owner_id === user?.id) {
      const button = document.createElement("button");
      button.className = "icon-button"; button.textContent = "\u00d7"; button.title = "Delete update";
      button.setAttribute("aria-label", `Delete ${entry.title}`);
      button.addEventListener("click", () => void act(async () => {
        if (!confirm("Delete this update for everyone in the circle?")) return;
        await checked(db.from("care_entries").delete().eq("id", entry.id));
        message("Update deleted."); await refresh();
      }));
      item.append(button);
    }
    $("timeline").append(item);
  });
}
function validateEntry(entry) {
  if (!types[entry.type] || typeof entry.title !== "string" || !entry.title.trim() || entry.title.length > 300 ||
    typeof entry.note !== "string" || entry.note.length > 4000 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.entry_date) ||
    Number.isNaN(Date.parse(entry.entry_date)) || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(entry.entry_time)) {
    throw new Error("Invalid update. Check the date, time, title (max 300), and details (max 4000).");
  }
  return entry;
}
async function addEntry() {
  const caregiver = $("caregiver-name").value.trim();
  if (!circle || !caregiver) throw new Error("Enter your caregiver name first.");
  const entry = validateEntry({ circle_id: circle.id, author_id: user.id, caregiver,
    type: $("entry-type").value, title: $("entry-title").value.trim(), note: $("entry-note").value.trim(),
    entry_date: today(), entry_time: $("entry-time").value || timeNow() });
  await checked(db.from("care_entries").insert(entry));
  $("entry-form").reset(); $("entry-time").value = timeNow();
  message("Update saved for your family."); await refresh();
}
async function importBackup(parsed) {
  if (!circle || !Array.isArray(parsed.entries) || parsed.entries.length > 5000) throw new Error("Invalid backup (maximum 5,000 entries).");
  const rows = parsed.entries.map((entry) => validateEntry({
    circle_id: circle.id, author_id: user.id, caregiver: String(entry.caregiver || "Imported caregiver").slice(0, 100),
    type: entry.type, title: entry.title, note: entry.note || "",
    entry_date: entry.entry_date || entry.date, entry_time: entry.entry_time || entry.time,
    source_id: String(entry.source_id || entry.id || "")
  }));
  if (rows.some((row) => !row.source_id || row.source_id.length > 100)) throw new Error("Backup entries must have valid IDs.");
  if (!confirm(`Import ${rows.length} updates into ${circle.elder_name}? All circle members will see them.`)) return;
  await checked(db.from("care_entries").upsert(rows, { onConflict: "circle_id,source_id", ignoreDuplicates: true }));
  message("Backup imported. Existing imported entries were skipped."); await refresh();
}
on("auth-form", "submit", async () => {
  await checked(db.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value }));
  $("password").value = "";
});
on("sign-up", "click", async () => {
  const data = await checked(db.auth.signUp({ email: $("email").value.trim(), password: $("password").value,
    options: { emailRedirectTo: location.origin + location.pathname } }));
  $("password").value = "";
  message(data.session ? "Account created." : "Check your email to confirm your account, then sign in.");
});
on("forgot-password", "click", async () => {
  await checked(db.auth.resetPasswordForEmail($("email").value.trim(), { redirectTo: location.origin + location.pathname }));
  message("Check your email for a password reset link.");
});
on("recovery-form", "submit", async () => {
  await checked(db.auth.updateUser({ password: $("new-password").value }));
  recovery = false; $("recovery-form").reset(); $("recovery-form").hidden = true; $("circle-panel").hidden = false;
  message("Password updated.");
});
on("sign-out", "click", async () => {
  await checked(db.auth.signOut({ scope: "local" }));
  recovery = false; $("recovery-form").hidden = true;
  await sessionChanged(null);
});
on("create-circle", "submit", async () => {
  const id = await checked(db.rpc("create_care_circle", { elder: $("new-elder").value.trim() }));
  $("create-circle").reset(); await loadCircles(id); message("Care circle created.");
});
on("join-circle", "submit", async () => {
  const id = await checked(db.rpc("join_care_circle", { invitation: $("invite-code").value.trim() }));
  $("join-circle").reset(); await loadCircles(id); message("Joined care circle.");
});
on("circle-select", "change", () => selectCircle($("circle-select").value));
on("make-invite", "click", async () => {
  const token = await checked(db.rpc("create_circle_invite", { target: circle.id }));
  $("invite-result").textContent = `Invitation code: ${token} (valid for 7 days; replaces any previous code). Share only with family members you want to join.`;
});
on("profile-form", "submit", async () => {
  const name = $("caregiver-name").value.trim();
  if (!name) throw new Error("Enter your caregiver name.");
  const data = await checked(db.auth.updateUser({ data: { display_name: name } })); user = data.user;
  if (circle.owner_id === user.id) {
    const updated = await checked(db.from("care_circles").update({ elder_name: $("elder-name").value.trim() }).eq("id", circle.id).select().single());
    circle.elder_name = updated.elder_name; $("circle-select").selectedOptions[0].textContent = circle.elder_name;
  }
  render(); message("Care details saved.");
});
on("entry-form", "submit", addEntry);
on("refresh", "click", async () => { if (circle) await refresh(); else await loadCircles(); });
on("clear-form", "click", () => { $("entry-form").reset(); $("entry-time").value = timeNow(); });
$("filter-type").addEventListener("change", render);
on("copy-digest", "click", async () => { await navigator.clipboard.writeText(digest()); message("Digest copied."); });
on("share-whatsapp", "click", () => { window.open(`https://wa.me/?text=${encodeURIComponent(digest())}`, "_blank", "noopener,noreferrer"); });
on("export-data", "click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ profile: { elderName: circle.elder_name }, entries }, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `sevalog-${today()}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
on("import-data", "change", async (event) => {
  const file = event.target.files[0]; event.target.value = "";
  if (!file) return;
  if (file.size > 10000000) throw new Error("Backup is too large (maximum 10 MB).");
  await importBackup(JSON.parse(await file.text()));
});
on("migrate-data", "click", async () => {
  const raw = localStorage.getItem("sevalog:mvp");
  if (!raw) throw new Error("No old phone logs at this address. Import an exported backup instead.");
  await importBackup(JSON.parse(raw));
});
[["medicine", "Gave medicine"], ["meal", "Meal update"], ["vitals", "Checked blood pressure"], ["appointment", "Doctor appointment"]].forEach(([type, title]) => {
  const button = document.createElement("button"); button.type = "button"; button.className = "quick-action"; button.textContent = title;
  button.addEventListener("click", () => {
    $("entry-type").value = type; $("entry-title").value = title; $("entry-time").value = timeNow(); $("entry-note").focus();
  });
  $("quick-actions").append(button);
});
async function start() {
  const config = window.SEVALOG_CONFIG || {};
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    message("SevaLog is not connected yet. The site owner needs to finish setup.", true); return;
  }
  if (!window.supabase) throw new Error("Could not load sign-in. Check your connection and reload.");
  db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  // Defer database work outside the auth callback to avoid the SDK auth lock.
  db.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recovery = true; $("recovery-form").hidden = false; $("circle-panel").hidden = true;
    }
    setTimeout(() => sessionChanged(session).catch((error) => message(error.message, true)), 0);
  });
  const data = await checked(db.auth.getSession()); await sessionChanged(data.session);
  setInterval(() => { if (!document.hidden && !busy) void refresh(); }, 15000);
  window.addEventListener("online", () => { if (!busy) void refresh(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !busy) void refresh(); });
}
void start().catch((error) => message(error.message, true));
