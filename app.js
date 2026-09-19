const $ = (id) => document.getElementById(id);
const types = { medicine: "Medicine", meal: "Meal", vitals: "Vitals", appointment: "Appointment", note: "Note" };
let db, user, circle;
let circles = [], entries = [];
let invitationToken = "";
let activeView = "circles";
const views = { circles: "circle-panel", today: "care-workspace", timeline: "timeline-page" };
function preferences() {
  try { return JSON.parse(localStorage.getItem(`sevalog:view:${user.id}`)) || {}; } catch { return {}; }
}
function rememberView() {
  if (!user) return;
  try { localStorage.setItem(`sevalog:view:${user.id}`, JSON.stringify({ view: activeView, circle: circle?.id })); } catch { /* Navigation still works without browser storage. */ }
}
function showView(view, navigate = false) {
  activeView = views[view] ? view : "circles";
  if (!circle && activeView !== "circles") activeView = "circles";
  const signedIn = !!user && !recovery;
  $("app-nav").hidden = !signedIn;
  document.querySelector(".shell").classList.toggle("signed-in", signedIn);
  Object.entries(views).forEach(([name, id]) => { $(id).hidden = !signedIn || name !== activeView; });
  $("circle-context").hidden = !signedIn || activeView === "circles" || !circle;
  $("edit-details").hidden = !circle;
  document.querySelectorAll("[data-view]").forEach((link) => {
    if (link.dataset.view === activeView) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (signedIn) {
    rememberView();
    if (navigate && location.hash !== `#${activeView}`) history.pushState(null, "", `#${activeView}`);
    document.title = `${activeView === "today" ? "Add log" : activeView[0].toUpperCase() + activeView.slice(1)} | SevaLog`;
  }
  if (navigate) {
    if (!$("message").classList.contains("error")) message("");
    $(views[activeView]).querySelector("h2")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    $("account-menu").open = false;
  }
}
document.querySelectorAll("[data-view]").forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  if (!busy) showView(link.dataset.view, true);
}));
window.addEventListener("popstate", () => showView(location.hash.slice(1)));
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $(button.dataset.close).close()));
function setupCircle(mode) {
  $("create-circle").hidden = mode !== "create";
  $("join-circle").hidden = mode !== "join";
  $("circle-dialog-title").textContent = mode === "create" ? "Create circle" : "Join circle";
  $("circle-setup").showModal();
}
$("show-create").addEventListener("click", () => setupCircle("create"));
$("show-join").addEventListener("click", () => setupCircle("join"));
$("edit-details").addEventListener("click", () => { $("account-menu").open = false; $("profile-details").showModal(); });
$("view-timeline").addEventListener("click", () => showView("timeline", true));
function renderCircles() {
  $("circle-list").replaceChildren();
  $("circles-empty").hidden = circles.length > 0;
  circles.forEach((item) => {
    const card = document.createElement("article"); card.className = "circle-card";
    const title = document.createElement("h3"); title.textContent = item.elder_name;
    const role = document.createElement("p"); role.textContent = item.owner_id === user.id ? "Owner" : "Member";
    const actions = document.createElement("div"); actions.className = "toolbar";
    const open = document.createElement("button"); open.className = "primary-button"; open.textContent = "Open";
    open.setAttribute("aria-label", `Open ${item.elder_name}`);
    open.addEventListener("click", () => void act(async () => { if (circle?.id !== item.id) await selectCircle(item.id); showView("today", true); }));
    actions.append(open);
    if (item.owner_id === user.id) {
      const invite = document.createElement("button"); invite.className = "secondary-button"; invite.textContent = "Invite family";
      invite.setAttribute("aria-label", `Invite family to ${item.elder_name}`);
      invite.addEventListener("click", () => void act(async () => {
        if (circle?.id !== item.id) await selectCircle(item.id);
        $("invite-title").textContent = `Invite family to ${item.elder_name}`;
        $("invite-tools").showModal();
      }));
      actions.append(invite);
    }
    card.append(title, role, actions); $("circle-list").append(card);
  });
}
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
  document.querySelectorAll("dialog").forEach((dialog) => {
    let output = dialog.querySelector(".dialog-message");
    if (!output) { output = document.createElement("p"); output.className = "dialog-message"; output.setAttribute("role", "status"); dialog.append(output); }
    output.textContent = dialog.open ? text : "";
    output.classList.toggle("error", error);
  });
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
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  $("view-timeline").hidden = true;
  invitationToken = "";
  $("invite-result").hidden = true;
  $("invitation-code").textContent = "";
  $("invite-message").textContent = "";
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
  $("circle-list").replaceChildren();
  $("account-email").textContent = user?.email || "";
  $("sign-out").hidden = !user;
  $("auth-panel").hidden = !!user;
  $("account-menu").hidden = !user;
  $("account-menu").open = false;
  $("create-circle").reset();
  updateRecipient();
  if (!user) { showView("circles"); message("Sign in or create an account."); return; }
  $("app-nav").hidden = recovery;
  $("circle-panel").hidden = recovery;
  await loadCircles();
}
async function loadCircles(preferred) {
  const version = generation;
  const data = await checked(db.from("care_circles").select("id,elder_name,owner_id").order("created_at"));
  if (version !== generation || !user) return;
  circles = data;
  message("");
  renderCircles();
  $("circle-select").replaceChildren(new Option("Choose a circle", ""));
  circles.forEach((item) => $("circle-select").add(new Option(item.elder_name, item.id)));
  const saved = preferences();
  const selected = circles.find((item) => item.id === (preferred || saved.circle)) || circles[0];
  if (selected) await selectCircle(selected.id);
  else message("Create a care circle or join one with an invitation code.");
  showView(preferred ? "today" : views[location.hash.slice(1)] ? location.hash.slice(1) : saved.view || "circles", !!preferred);
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
  showView(activeView);
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
  if (!circle || !caregiver) {
    $("profile-details").showModal();
    throw new Error("Enter your name in Care details first.");
  }
  const entry = validateEntry({ circle_id: circle.id, author_id: user.id, caregiver,
    type: $("entry-type").value, title: $("entry-title").value.trim(), note: $("entry-note").value.trim(),
    entry_date: today(), entry_time: $("entry-time").value || timeNow() });
  await checked(db.from("care_entries").insert(entry));
  $("entry-form").reset(); $("entry-time").value = timeNow();
  message("Update saved for your family."); await refresh();
  $("view-timeline").hidden = false;
}
function updateRecipient() {
  const self = document.querySelector('[name="care-for"]:checked').value === "self";
  $("new-elder-label").textContent = self ? "Your name *" : "Their name *";
  $("new-elder").value = self ? user?.user_metadata?.display_name || "" : "";
}
document.querySelectorAll('[name="care-for"]').forEach((input) => input.addEventListener("change", updateRecipient));
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
  recovery = false; $("recovery-form").reset(); $("recovery-form").hidden = true; showView(activeView);
  message("Password updated.");
});
on("sign-out", "click", async () => {
  await checked(db.auth.signOut({ scope: "local" }));
  recovery = false; $("recovery-form").hidden = true;
  await sessionChanged(null);
});
on("create-circle", "submit", async () => {
  const name = $("new-elder").value.trim();
  if (!name) throw new Error("Enter a name for the care circle.");
  if (document.querySelector('[name="care-for"]:checked').value === "self") {
    const data = await checked(db.auth.updateUser({ data: { display_name: name } }));
    user = data.user;
  }
  const id = await checked(db.rpc("create_care_circle", { elder: name }));
  $("create-circle").reset(); updateRecipient(); await loadCircles(id); message("Care circle created.");
  if (!$("caregiver-name").value) { $("profile-message").textContent = "Your name will appear on the updates you add."; $("profile-details").showModal(); }
});
on("join-circle", "submit", async () => {
  const result = await checked(db.rpc("join_care_circle", { invitation: $("invite-code").value.trim().toUpperCase() }));
  if (result?.error) throw new Error(result.error);
  const id = result?.circle_id || result;
  $("join-circle").reset(); await loadCircles(id); message("Joined care circle.");
});
on("circle-select", "change", () => selectCircle($("circle-select").value));
on("make-invite", "click", async () => {
  invitationToken = await checked(db.rpc("create_circle_invite", { target: circle.id }));
  $("invitation-code").textContent = invitationToken;
  $("invite-message").textContent = `Join the care circle for ${circle.elder_name} on SevaLog.`;
  $("invite-result").hidden = false;
});
on("copy-invite", "click", async () => {
  if (!invitationToken) return;
  try { await navigator.clipboard.writeText(invitationToken); message("Invitation code copied."); }
  catch { message("Could not copy. Select the invitation code and copy it manually.", true); }
});
on("share-invite", "click", () => {
  if (!invitationToken) return;
  const url = window.SEVALOG_CONFIG.appUrl || location.origin + location.pathname;
  const text = `Join the care circle for ${circle.elder_name} on SevaLog.\n\n${url}\n\nSign in or create an account, then choose Join circle and enter this invitation code:\n${invitationToken}\n\nThis code expires in 7 days.`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
});
on("profile-form", "submit", async () => {
  const name = $("caregiver-name").value.trim();
  if (!name) throw new Error("Enter your name.");
  const data = await checked(db.auth.updateUser({ data: { display_name: name } })); user = data.user;
  if (circle.owner_id === user.id) {
    const updated = await checked(db.from("care_circles").update({ elder_name: $("elder-name").value.trim() }).eq("id", circle.id).select().single());
    circle.elder_name = updated.elder_name; $("circle-select").selectedOptions[0].textContent = circle.elder_name;
  }
  if (invitationToken) $("invite-message").textContent = `Join the care circle for ${circle.elder_name} on SevaLog.`;
  $("profile-details").close();
  renderCircles();
  render(); message("Care details saved.");
});
on("entry-form", "submit", addEntry);
on("refresh", "click", async () => { if (circle) await refresh(); else await loadCircles(); });
on("clear-form", "click", () => { $("entry-form").reset(); $("entry-time").value = timeNow(); });
$("filter-type").addEventListener("change", render);
on("copy-digest", "click", async () => { await navigator.clipboard.writeText(digest()); message("Digest copied."); });
on("share-whatsapp", "click", () => { window.open(`https://wa.me/?text=${encodeURIComponent(digest())}`, "_blank", "noopener,noreferrer"); });
[["medicine", "Taken BP tablet"], ["meal", "Breakfast done"], ["vitals", "Checked blood pressure"]].forEach(([type, title]) => {
  const button = document.createElement("button"); button.type = "button"; button.className = "suggestion-button"; button.textContent = title;
  button.title = `Use this update: ${title}`;
  button.addEventListener("click", () => {
    $("entry-type").value = type; $("entry-title").value = title; $("entry-title").focus();
  });
  $("update-suggestions").append(button);
});
async function start() {
  window.lucide?.createIcons();
  const config = window.SEVALOG_CONFIG || {};
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    message("SevaLog is not connected yet. The site owner needs to finish setup.", true); return;
  }
  if (!window.supabase) throw new Error("Could not load sign-in. Check your connection and reload.");
  db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  // Defer database work outside the auth callback to avoid the SDK auth lock.
  db.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recovery = true; $("recovery-form").hidden = false; showView(activeView);
    }
    setTimeout(() => sessionChanged(session).catch((error) => message(error.message, true)), 0);
  });
  const data = await checked(db.auth.getSession()); await sessionChanged(data.session);
  setInterval(() => { if (!document.hidden && !busy) void refresh(); }, 15000);
  window.addEventListener("online", () => { if (!busy) void refresh(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !busy) void refresh(); });
}
void start().catch((error) => message(error.message, true));
