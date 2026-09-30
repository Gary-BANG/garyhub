"use strict";

let editingTaskId = null;
let selectedCategoryId = null;
let activeCategoryFilters = new Set();

function targetQuery() {
  return state.me?.role === "admin" ? `?userId=${encodeURIComponent(getCurrentTargetUserId())}` : "";
}

function localToday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: state.account?.timezone || "Etc/UTC",
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = name => parts.find(item => item.type === name).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function taskStatus(task) {
  if (task.status === "done") return "done";
  return task.start_date > localToday() ? "todo" : "doing";
}

function taskVisible(task) {
  return matchesTaskFilters(task, { categories: activeCategoryFilters,
    status: $("statusFilter").value, search: $("taskSearch").value.trim().toLocaleLowerCase(),
    date: $("taskDateFilter").value, effectiveStatus: taskStatus(task) });
}

function setTaskDateFilter(date) {
  $("taskDateFilter").value = date;
  $("taskFilterPanel").open = true;
  $("taskListPanel").open = true;
  renderUnified();
}

function nextDate(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function taskToCalendarEvent(task) {
  const status = taskStatus(task);
  const completed = status === "done";
  return {
    id: task.id, title: task.title, start: task.start_date, end: nextDate(task.end_date),
    allDay: true, backgroundColor: completed ? "#d1d5db" : (task.category_color || "#64748b"),
    borderColor: completed ? "#cbd5e1" : (task.category_color || "#64748b"),
    textColor: completed ? "#4b5563" : contrastColor(task.category_color || "#64748b"),
    classNames: completed ? ["task-complete"] : [],
    extendedProps: { note: task.note }
  };
}

function contrastColor(hex) {
  const value = hex.replace("#", "");
  const rgb = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? "#111827" : "#ffffff";
}

async function loadUnified() {
  const query = targetQuery();
  const [tasks, categories, notices, account] = await Promise.all([
    api(`/api/tasks${query}`), api(`/api/categories${query}`), api("/api/notifications"),
    api("/api/account/email")
  ]);
  state.tasks = tasks;
  state.categories = categories;
  state.notifications = notices;
  state.account = account;
  $("accountEmailStatus").textContent = account.email_verified_at ?
    `已验证邮箱：${account.email}` : "尚未验证邮箱；邮件提醒不会发送。";
  $("reminderHint").textContent = account.email_verified_at && account.mail_enabled ?
    "将按账号时区、在开始与结束日期之间发送。" : "请先验证邮箱并配置邮件服务，提醒才会发送。";
  $("accountEmail").value = account.email || "";
  $("accountTimeZone").value = account.timezone || "Etc/UTC";
  $("timezoneHint").textContent = `当前保存：${account.timezone || "Etc/UTC"}。浏览器检测：${Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC"}。修改后请点击“保存时区”。`;
  const valid = new Set(categories.map(c => c.id).concat("uncategorized"));
  activeCategoryFilters = new Set([...activeCategoryFilters].filter(id => valid.has(id)));
  renderUnified();
}

function renderUnified() {
  renderCategoryChips();
  renderTaskList();
  renderNotifications();
  refreshCalendar();
}

function createChip(label, color, selected, click) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `chip${selected ? " selected" : ""}`;
  button.style.backgroundColor = color;
  button.style.color = contrastColor(color);
  button.setAttribute("aria-pressed", String(selected));
  const mark = document.createElement("span");
  mark.className = "check";
  mark.textContent = selected ? "✓" : "";
  button.append(mark, document.createTextNode(label));
  button.addEventListener("click", click);
  return button;
}

function renderCategoryChips() {
  const form = $("formCategories");
  const filter = $("filterCategories");
  form.replaceChildren();
  filter.replaceChildren();
  const categories = [{ id: null, name: "未分类", color: "#64748b" }, ...(state.categories || [])];
  categories.forEach(category => {
    const id = category.id || "uncategorized";
    form.append(createChip(category.name, category.color, selectedCategoryId === category.id, () => {
      selectedCategoryId = category.id;
      renderCategoryChips();
    }));
    filter.append(createChip(category.name, category.color, activeCategoryFilters.has(id), () => {
      if (activeCategoryFilters.has(id)) activeCategoryFilters.delete(id);
      else activeCategoryFilters.add(id);
      renderUnified();
    }));
  });
  if (state.categories?.length) {
    const manage = document.createElement("button");
    manage.type = "button";
    manage.className = "secondary compact-button";
    manage.textContent = "管理分类";
    manage.addEventListener("click", manageCategory);
    form.append(manage);
  }
}

function renderTaskList() {
  const box = $("taskList");
  box.replaceChildren();
  const tasks = (state.tasks || []).filter(taskVisible);
  if (!tasks.length) { box.textContent = "目前没有符合条件的事项。"; return; }
  tasks.forEach(task => {
    const row = document.createElement("div");
    row.className = taskStatus(task) === "done" ? "task-row completed" : "task-row";
    const info = document.createElement("div");
    const status = taskStatus(task);
    const statusLabel = { todo: "未开始", doing: "进行中", done: "已完成" }[status];
    const overdue = status !== "done" && task.end_date < localToday() ? " · 已逾期" : "";
    info.innerHTML = `<div class="task-title"><span class="task-dot" style="background:${task.category_color || "#64748b"}"></span>${escapeHtml(task.title)}</div>
      <div class="small">${escapeHtml(task.start_date)} 至 ${escapeHtml(task.end_date)} · ${escapeHtml(task.category_name || "未分类")} · ${statusLabel}${overdue}</div>
      ${task.note ? `<div class="small">${escapeHtml(task.note)}</div>` : ""}`;
    const actions = document.createElement("div");
    actions.className = "task-actions";
    const edit = document.createElement("button");
    edit.type = "button"; edit.className = "secondary"; edit.textContent = "编辑";
    edit.addEventListener("click", () => editUnifiedTask(task.id));
    const toggle = document.createElement("button");
    toggle.type = "button"; toggle.className = status === "done" ? "secondary" : "success";
    toggle.textContent = status === "done" ? "恢复" : "标为已完成";
    toggle.addEventListener("click", () => saveTaskStatus(task, status === "done" ? "todo" : "done"));
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "danger"; remove.textContent = "删除";
    remove.addEventListener("click", () => deleteUnifiedTask(task.id));
    actions.append(edit, toggle, remove);
    row.append(info, actions);
    box.append(row);
  });
}

function renderNotifications() {
  const notices = state.notifications || [];
  $("unreadCount").textContent = String(notices.filter(n => !n.read_at).length);
  const panel = $("notificationsPanel");
  panel.replaceChildren();
  if (!notices.length) { panel.textContent = "暂无通知"; return; }
  notices.forEach(n => {
    const row = document.createElement("div");
    row.className = "request-item";
    row.innerHTML = `<strong>${escapeHtml(n.title)}</strong><p>${escapeHtml(n.body)}</p>`;
    if (!n.read_at) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "secondary compact-button"; button.textContent = "标为已读";
      button.addEventListener("click", async () => {
        await api(`/api/notifications/${n.id}/read`, { method: "POST" });
        state.notifications = await api("/api/notifications");
        renderNotifications();
      });
      row.append(button);
    }
    panel.append(row);
  });
}

function clearUnifiedForm() {
  editingTaskId = null;
  selectedCategoryId = null;
  $("taskForm").reset();
  $("unifiedFormTitle").textContent = "新增事项";
  $("taskMessage").textContent = "";
  toggleReminderFields();
  renderCategoryChips();
}

function newTaskOnDate(date, focusTitle = true) {
  clearUnifiedForm();
  $("taskStart").value = date;
  $("taskEnd").value = date;
  $("taskFormPanel").open = true;
  if (focusTitle) $("taskTitle").focus();
}

function editUnifiedTask(id) {
  const task = (state.tasks || []).find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  $("taskFormPanel").open = true;
  selectedCategoryId = task.category_id;
  $("unifiedFormTitle").textContent = "编辑事项";
  $("taskTitle").value = task.title;
  $("taskStart").value = task.start_date;
  $("taskEnd").value = task.end_date;
  $("taskNote").value = task.note || "";
  $("reminderEnabled").checked = Boolean(task.reminder_enabled);
  $("reminderFrequency").value = String(task.reminder_frequency || 1);
  $("reminderTime1").value = task.reminder_time_1 || "09:00";
  $("reminderTime2").value = task.reminder_time_2 || "18:00";
  toggleReminderFields();
  renderCategoryChips();
  $("taskForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function taskPayload(status = "todo") {
  const enabled = $("reminderEnabled").checked;
  const frequency = Number($("reminderFrequency").value);
  const payload = {
    title: $("taskTitle").value.trim(), start_date: $("taskStart").value,
    end_date: $("taskEnd").value, category_id: selectedCategoryId,
    note: $("taskNote").value.trim(), status, reminder_enabled: enabled,
    reminder: enabled ? { frequency, time_1: $("reminderTime1").value,
      time_2: frequency === 2 ? $("reminderTime2").value : null } : null
  };
  if (state.me.role === "admin") payload.userId = getCurrentTargetUserId();
  return payload;
}

function payloadFromTask(task, status) {
  const payload = { title: task.title, start_date: task.start_date,
    end_date: task.end_date, category_id: task.category_id, note: task.note,
    status, reminder_enabled: Boolean(task.reminder_enabled),
    reminder: task.reminder_enabled ? { frequency: task.reminder_frequency,
      time_1: task.reminder_time_1, time_2: task.reminder_time_2 } : null };
  if (state.me.role === "admin") payload.userId = getCurrentTargetUserId();
  return payload;
}

async function saveTaskStatus(task, status) {
  try {
    await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "PUT", body: JSON.stringify(payloadFromTask(task, status)) });
    await loadUnified();
  } catch (error) { alert(error.message); }
}

async function deleteUnifiedTask(id) {
  if (!confirm("确定删除这个事项吗？")) return;
  try {
    await api(`/api/tasks/${encodeURIComponent(id)}${targetQuery()}`, { method: "DELETE" });
    clearUnifiedForm();
    await loadUnified();
  } catch (error) { alert(error.message); }
}

function toggleReminderFields() {
  $("reminderFields").classList.toggle("hidden", !$("reminderEnabled").checked);
  $("secondTimeField").classList.toggle("hidden", $("reminderFrequency").value !== "2");
}

function categoryDialog(initial) {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "card";
    dialog.innerHTML = `<form method="dialog"><h2>${initial ? "编辑分类" : "新增分类"}</h2>
      <div class="field"><label for="categoryNameDialog">名称</label><input id="categoryNameDialog" maxlength="40" required /></div>
      <div class="field"><label for="categoryColorDialog">颜色</label><input id="categoryColorDialog" type="color" /></div>
      <div class="btn-row"><button value="save" class="primary">保存</button><button value="cancel" class="secondary" formnovalidate>取消</button></div></form>`;
    document.body.append(dialog);
    dialog.querySelector("#categoryNameDialog").value = initial?.name || "";
    dialog.querySelector("#categoryColorDialog").value = initial?.color || "#4f46e5";
    dialog.addEventListener("close", () => {
      const result = dialog.returnValue === "save" ? {
        name: dialog.querySelector("#categoryNameDialog").value.trim(),
        color: dialog.querySelector("#categoryColorDialog").value } : null;
      dialog.remove();
      resolve(result);
    }, { once: true });
    dialog.showModal();
  });
}

async function manageCategory() {
  const category = state.categories.find(c => c.id === selectedCategoryId);
  if (!category) { alert("请先选中要管理的分类"); return; }
  const action = prompt(`分类「${category.name}」：输入 E 编辑，D 删除`, "E");
  if (!action) return;
  try {
    if (action.toUpperCase() === "D") {
      if (!confirm("删除分类后，关联事项仍会保留并显示为未分类。确定删除？")) return;
      await api(`/api/categories/${encodeURIComponent(category.id)}${targetQuery()}`, { method: "DELETE" });
      selectedCategoryId = null;
    } else if (action.toUpperCase() === "E") {
      const payload = await categoryDialog(category);
      if (!payload) return;
      await api(`/api/categories/${encodeURIComponent(category.id)}`, { method: "PUT", body: JSON.stringify({ ...payload, ...(state.me.role === "admin" ? { userId: getCurrentTargetUserId() } : {}) }) });
    }
    await loadUnified();
  } catch (error) { alert(error.message); }
}

$("taskForm").addEventListener("submit", async event => {
  event.preventDefault();
  const current = state.tasks?.find(t => t.id === editingTaskId);
  const payload = taskPayload(current?.status === "done" ? "done" : "todo");
  try {
    await api(editingTaskId ? `/api/tasks/${encodeURIComponent(editingTaskId)}` : "/api/tasks", {
      method: editingTaskId ? "PUT" : "POST", body: JSON.stringify(payload)
    });
    clearUnifiedForm();
    await loadUnified();
    $("taskMessage").textContent = "保存成功";
    $("taskMessage").classList.add("ok-message");
  } catch (error) {
    $("taskMessage").textContent = error.message;
    $("taskMessage").classList.remove("ok-message");
  }
});

$("clearTaskBtn").addEventListener("click", clearUnifiedForm);
$("reminderEnabled").addEventListener("change", toggleReminderFields);
$("reminderFrequency").addEventListener("change", toggleReminderFields);
$("addCategoryBtn").addEventListener("click", async () => {
  const payload = await categoryDialog(null);
  if (!payload) return;
  if (state.me.role === "admin") payload.userId = getCurrentTargetUserId();
  try {
    const category = await api("/api/categories", { method: "POST", body: JSON.stringify(payload) });
    selectedCategoryId = category.id;
    await loadUnified();
  } catch (error) { alert(error.message); }
});
$("notificationsBtn").addEventListener("click", () => $("notificationsPanel").classList.toggle("hidden"));
for (const id of ["statusFilter", "taskSearch", "taskDateFilter"]) {
  $(id).addEventListener(id === "taskSearch" ? "input" : "change", () => {
    if (id === "taskDateFilter" && $(id).value) $("taskListPanel").open = true;
    renderUnified();
  });
}
$("clearTaskDateFilter").addEventListener("click", () => setTaskDateFilter(""));

window.registrationVerification = null;
let registrationRequestId = null;
let accountRequestId = null;
api("/api/mail-config").then(config => {
  $("registrationEmailFields").classList.toggle("hidden", !config.available);
  if (config.registration_required) $("reqEmail").required = true;
}).catch(() => {});

$("reqSendCode").addEventListener("click", async () => {
  try {
    const result = await api("/api/email-verifications/request", { method: "POST",
      body: JSON.stringify({ email: $("reqEmail").value, purpose: "registration" }) });
    registrationRequestId = result.verification_id;
    window.registrationVerification = null;
    $("reqEmailMessage").textContent = "验证码已发送，请在 10 分钟内填写。";
  } catch (error) { $("reqEmailMessage").textContent = error.message; }
});
$("reqConfirmCode").addEventListener("click", async () => {
  try {
    const result = await api("/api/email-verifications/confirm", { method: "POST",
      body: JSON.stringify({ email: $("reqEmail").value, purpose: "registration",
        verification_id: registrationRequestId, code: $("reqCode").value }) });
    window.registrationVerification = { id: result.verification_id, token: result.verification_token };
    $("reqEmailMessage").textContent = "邮箱验证成功，可以提交注册申请。";
  } catch (error) { $("reqEmailMessage").textContent = error.message; }
});
$("reqEmail").addEventListener("input", () => { window.registrationVerification = null; });

$("accountSendCode").addEventListener("click", async () => {
  try {
    const purpose = state.account?.email_verified_at ? "change_email" : "add_email";
    const result = await api("/api/email-verifications/request", { method: "POST",
      body: JSON.stringify({ email: $("accountEmail").value, purpose }) });
    accountRequestId = result.verification_id;
    $("accountMessage").textContent = "验证码已发送，请在 10 分钟内填写。";
  } catch (error) { $("accountMessage").textContent = error.message; }
});
$("accountConfirmCode").addEventListener("click", async () => {
  try {
    const email = $("accountEmail").value;
    const purpose = state.account?.email_verified_at ? "change_email" : "add_email";
    const confirmed = await api("/api/email-verifications/confirm", { method: "POST",
      body: JSON.stringify({ email, purpose, verification_id: accountRequestId,
        code: $("accountCode").value }) });
    await api("/api/account/email", { method: "PUT", body: JSON.stringify({ email, purpose,
      verification_id: confirmed.verification_id,
      verification_token: confirmed.verification_token }) });
    await loadUnified();
    $("accountMessage").textContent = "邮箱已验证。";
  } catch (error) { $("accountMessage").textContent = error.message; }
});
$("saveTimezone").addEventListener("click", async () => {
  try {
    await api("/api/account/timezone", { method: "PUT",
      body: JSON.stringify({ timezone: $("accountTimeZone").value.trim() }) });
    $("accountMessage").textContent = "时区已保存。";
  } catch (error) { $("accountMessage").textContent = error.message; }
});
