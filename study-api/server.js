const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || "/data/tasks.json";

const VALID_STATUSES = new Set(["todo", "doing", "done"]);
const VALID_CATEGORIES = new Set(["Course", "Paper", "Benchmark", "Coding", "Research", "Other"]);

function send(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 200_000) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

async function loadTasks() {
  try {
    const text = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      await saveTasks([]);
      return [];
    }
    throw error;
  }
}

async function saveTasks(tasks) {
  const dir = path.dirname(DATA_FILE);
  await fs.mkdir(dir, { recursive: true });

  const tempFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(tasks, null, 2), "utf-8");
  await fs.rename(tempFile, DATA_FILE);
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeTask(input, existingId = null) {
  const title = String(input.title || "").trim();
  const startDate = String(input.startDate || "").trim();
  const endDate = String(input.endDate || "").trim();
  const category = VALID_CATEGORIES.has(input.category) ? input.category : "Other";
  const status = VALID_STATUSES.has(input.status) ? input.status : "todo";
  const note = String(input.note || "").trim();

  if (!title) {
    throw new Error("学习内容不能为空");
  }

  if (!isDate(startDate) || !isDate(endDate)) {
    throw new Error("日期格式不正确");
  }

  if (endDate < startDate) {
    throw new Error("结束日期不能早于开始日期");
  }

  return {
    id: existingId || input.id || crypto.randomUUID(),
    title: title.slice(0, 120),
    startDate,
    endDate,
    category,
    status,
    note: note.slice(0, 2000),
    createdAt: Number(input.createdAt) || Date.now(),
    updatedAt: Date.now(),
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, service: "study-api" });
    }

    if (req.method === "GET" && url.pathname === "/tasks") {
      const tasks = await loadTasks();
      return send(res, 200, { tasks });
    }

    if (req.method === "POST" && url.pathname === "/tasks") {
      const body = await readBody(req);
      const tasks = await loadTasks();
      const task = normalizeTask(body);

      tasks.push(task);
      await saveTasks(tasks);

      return send(res, 201, { task });
    }

    if (req.method === "POST" && url.pathname === "/tasks/import") {
      const body = await readBody(req);
      const incoming = Array.isArray(body.tasks) ? body.tasks : [];
      const tasks = await loadTasks();
      const existingIds = new Set(tasks.map(task => task.id));

      let imported = 0;

      for (const item of incoming) {
        try {
          const task = normalizeTask(item);
          if (!existingIds.has(task.id)) {
            tasks.push(task);
            existingIds.add(task.id);
            imported += 1;
          }
        } catch {
          // 跳过不合法的旧数据
        }
      }

      await saveTasks(tasks);
      return send(res, 200, { imported, tasks });
    }

    const patchMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);

    if (req.method === "PATCH" && patchMatch) {
      const id = decodeURIComponent(patchMatch[1]);
      const body = await readBody(req);
      const tasks = await loadTasks();
      const index = tasks.findIndex(task => task.id === id);

      if (index === -1) {
        return send(res, 404, { error: "任务不存在" });
      }

      const merged = {
        ...tasks[index],
        ...body,
        id: tasks[index].id,
        createdAt: tasks[index].createdAt,
      };

      tasks[index] = normalizeTask(merged, tasks[index].id);
      await saveTasks(tasks);

      return send(res, 200, { task: tasks[index] });
    }

    if (req.method === "DELETE" && patchMatch) {
      const id = decodeURIComponent(patchMatch[1]);
      const tasks = await loadTasks();
      const nextTasks = tasks.filter(task => task.id !== id);

      if (nextTasks.length === tasks.length) {
        return send(res, 404, { error: "任务不存在" });
      }

      await saveTasks(nextTasks);
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: "Not found" });
  } catch (error) {
    return send(res, 400, { error: error.message || "Request failed" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`study-api listening on ${PORT}`);
});
