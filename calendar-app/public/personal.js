"use strict";

const personalState = { active: "diary", rows: {}, editing: {}, originalWeightG: null, weightTouched: false, displayUnit: "kg" };
const personalKinds = ["diary", "weight", "exercise"];

function personalToday() {
  try {
    const zone = state.account?.timezone || "Etc/UTC";
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch { return new Date().toISOString().slice(0, 10); }
}

function shownWeight(grams) {
  return personalUnit() === "kg" ? (grams / 1000).toFixed(3) : (grams / 453.59237).toFixed(3);
}
function personalUnit() { return $("weightUnit").value; }

function clearPersonal(kind) {
  const form = document.querySelector(`[data-personal-form="${kind}"]`);
  form.reset();
  form.elements.entry_date.value = personalToday();
  personalState.editing[kind] = null;
  if (kind === "weight") { personalState.originalWeightG = null; personalState.weightTouched = false; personalState.displayUnit = "kg"; }
  document.querySelector(`[data-personal-message="${kind}"]`).textContent = "";
}

function selectPersonal(kind) {
  personalState.active = kind;
  personalKinds.forEach(name => {
    $(`personal-${name}`).classList.toggle("hidden", name !== kind);
    const button = document.querySelector(`[data-personal-tab="${name}"]`);
    button.className = name === kind ? "primary" : "secondary";
    button.setAttribute("aria-selected", String(name === kind));
  });
}

async function loadPersonal() {
  personalKinds.forEach(clearPersonal);
  $("exerciseAnchor").value = personalToday();
  selectPersonal(personalState.active);
  await Promise.all(personalKinds.map(loadPersonalKind));
  await loadExerciseSummary();
}

async function loadPersonalKind(kind) {
  const q = kind === "diary" ? `?q=${encodeURIComponent($("diarySearch").value.trim())}` : "";
  personalState.rows[kind] = await api(`/api/personal/${kind}${q}`);
  renderPersonal(kind);
}

function renderPersonal(kind) {
  const list = document.querySelector(`[data-personal-list="${kind}"]`);
  list.replaceChildren();
  const rows = personalState.rows[kind] || [];
  if (!rows.length) list.textContent = "暂无记录。";
  rows.forEach(row => {
    const box = document.createElement("article"); box.className = "personal-item";
    const title = document.createElement("strong");
    title.textContent = kind === "diary" ? `${row.entry_date} · ${row.title || "无标题"}` :
      kind === "weight" ? `${row.entry_date} · ${shownWeight(row.weight_g)} ${personalUnit()}` :
        `${row.entry_date} · ${row.activity_type} · ${row.duration_minutes} 分钟`;
    box.append(title);
    const body = kind === "diary" ? row.body : row.note;
    if (body) { const p = document.createElement("p"); p.textContent = body; box.append(p); }
    for (const [label, action, style] of [["编辑", "edit", "secondary"], ["删除", "delete", "danger"]]) {
      const button = document.createElement("button"); button.type = "button";
      button.className = style; button.textContent = label;
      button.addEventListener("click", () => action === "edit" ? editPersonal(kind, row) : deletePersonal(kind, row));
      box.append(button);
    }
    list.append(box);
  });
  if (kind === "weight") renderWeightChart(rows);
}

function renderWeightChart(rows) {
  const svg = $("weightChart"); svg.replaceChildren();
  const latest = new Map();
  [...rows].reverse().forEach(row => latest.set(row.entry_date, row));
  const points = [...latest.values()].sort((a, b) => a.entry_date.localeCompare(b.entry_date)).slice(-30);
  if (!points.length) return;
  const values = points.map(p => p.weight_g);
  const min = Math.min(...values) - 1000, max = Math.max(...values) + 1000;
  const coords = points.map((p, i) => `${35 + i * 530 / Math.max(1, points.length - 1)},${195 - (p.weight_g - min) * 160 / (max - min)}`).join(" ");
  const ns = "http://www.w3.org/2000/svg";
  const line = document.createElementNS(ns, "polyline");
  line.setAttribute("points", coords); line.setAttribute("fill", "none");
  line.setAttribute("stroke", "#2563eb"); line.setAttribute("stroke-width", "3"); svg.append(line);
  points.forEach((p, i) => {
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", String(35 + i * 530 / Math.max(1, points.length - 1)));
    circle.setAttribute("cy", String(195 - (p.weight_g - min) * 160 / (max - min)));
    circle.setAttribute("r", "4"); circle.setAttribute("fill", "#2563eb");
    const tip = document.createElementNS(ns, "title"); tip.textContent = `${p.entry_date}: ${shownWeight(p.weight_g)} ${personalUnit()}`;
    circle.append(tip); svg.append(circle);
  });
  svg.setAttribute("aria-label", `最近 ${points.length} 天的体重趋势：${points.map(p => `${p.entry_date} ${shownWeight(p.weight_g)} ${personalUnit()}`).join("；")}`);
}

function editPersonal(kind, row) {
  selectPersonal(kind);
  const form = document.querySelector(`[data-personal-form="${kind}"]`);
  personalState.editing[kind] = row.id;
  form.elements.entry_date.value = row.entry_date;
  if (kind === "diary") { form.elements.title.value = row.title; form.elements.body.value = row.body; }
  if (kind === "weight") {
    personalState.originalWeightG = row.weight_g; personalState.weightTouched = false;
    personalState.displayUnit = personalUnit();
    form.elements.weight.value = shownWeight(row.weight_g); form.elements.note.value = row.note;
  }
  if (kind === "exercise") {
    form.elements.activity_type.value = row.activity_type;
    form.elements.duration_minutes.value = row.duration_minutes; form.elements.note.value = row.note;
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deletePersonal(kind, row) {
  if (!confirm(`确定删除 ${row.entry_date} 的这条记录吗？`)) return;
  try {
    await api(`/api/personal/${kind}/${row.id}`, { method: "DELETE" });
    if (personalState.editing[kind] === row.id) clearPersonal(kind);
    await loadPersonalKind(kind);
    if (kind === "exercise") await loadExerciseSummary();
  } catch (error) { alert(error.message); }
}

function summaryStart(date, period) {
  const d = new Date(`${date}T00:00:00Z`);
  if (period === "week") d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  else d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

async function loadExerciseSummary() {
  const period = $("exercisePeriod").value;
  const anchor = $("exerciseAnchor").value || personalToday();
  const data = await api(`/api/personal/exercise/summary?period=${period}&start=${summaryStart(anchor, period)}`);
  $("exerciseSummary").textContent = `${data.start} 至 ${data.end_exclusive}（结束日不含）：${data.count} 次，共 ${data.total_minutes} 分钟。` +
    (data.by_type.length ? ` 类型：${data.by_type.map(row => `${row.activity_type} ${row.count} 次 / ${row.total_minutes} 分钟`).join("；")}` : "");
}

personalKinds.forEach(kind => {
  document.querySelector(`[data-personal-tab="${kind}"]`).addEventListener("click", () => selectPersonal(kind));
  document.querySelector(`[data-personal-clear="${kind}"]`).addEventListener("click", () => clearPersonal(kind));
  const form = document.querySelector(`[data-personal-form="${kind}"]`);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const elements = form.elements;
    const payload = { entry_date: elements.entry_date.value };
    if (kind === "diary") { payload.title = elements.title.value; payload.body = elements.body.value; }
    if (kind === "weight") {
      payload.unit = elements.unit.value; payload.weight = elements.weight.value;
      payload.note = elements.note.value;
      if (personalState.originalWeightG !== null && !personalState.weightTouched) payload.weight_g = personalState.originalWeightG;
    }
    if (kind === "exercise") {
      payload.activity_type = elements.activity_type.value;
      payload.duration_minutes = Number(elements.duration_minutes.value);
      payload.note = elements.note.value;
    }
    const id = personalState.editing[kind];
    const message = document.querySelector(`[data-personal-message="${kind}"]`);
    try {
      await api(`/api/personal/${kind}${id ? `/${id}` : ""}`, {
        method: id ? "PUT" : "POST", body: JSON.stringify(payload)
      });
      clearPersonal(kind); await loadPersonalKind(kind);
      if (kind === "exercise") await loadExerciseSummary();
      message.textContent = "保存成功";
    } catch (error) { message.textContent = error.message; }
  });
});

$("weightValue").addEventListener("input", () => { personalState.weightTouched = true; });
$("weightUnit").addEventListener("change", () => {
  const id = personalState.editing.weight;
  if (id && !personalState.weightTouched) $("weightValue").value = shownWeight(personalState.originalWeightG);
  else if ($("weightValue").value) {
    const oldGrams = Number($("weightValue").value) * (personalState.displayUnit === "kg" ? 1000 : 453.59237);
    $("weightValue").value = shownWeight(oldGrams);
  }
  personalState.displayUnit = personalUnit();
  renderPersonal("weight");
});
let searchTimer;
$("diarySearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadPersonalKind("diary").catch(error => alert(error.message)), 250);
});
$("exercisePeriod").addEventListener("change", () => loadExerciseSummary().catch(error => alert(error.message)));
$("exerciseAnchor").addEventListener("change", () => loadExerciseSummary().catch(error => alert(error.message)));
