let state = {
  projects: [],
  currentProjectId: null,
  currentProject: null,
  config: { has_deepseek_key: false },
};

const $ = (id) => document.getElementById(id);

const FLOW_LABELS = [
  ["api", "0", "设置 API"],
  ["project", "1", "建项目"],
  ["upload", "2", "导入 Review"],
  ["atomic", "3", "原子标签"],
  ["draft", "4", "维度草案"],
  ["lock", "5", "锁定规则"],
  ["final", "6", "最终打标"],
  ["export", "7", "导出 Excel"],
];

function apiKey() {
  return localStorage.getItem("deepseek_api_key") || "";
}

function clientApiKey() {
  return state.config?.has_deepseek_key ? "" : apiKey();
}

function setApiKey(value) {
  localStorage.setItem("deepseek_api_key", value || "");
  renderApiKeyStatus();
  renderWorkflow(state.currentProject);
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.json ? { "Content-Type": "application/json" } : {}),
    },
    body: options.json ? JSON.stringify(options.json) : options.body,
  });
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    if (typeof data === "string" && data.trim()) {
      message = data.trim();
    } else if (data && typeof data === "object") {
      message = data.detail || data.error || data.message || JSON.stringify(data, null, 2);
    }
    throw new Error(message);
  }
  return data;
}

function showLog(value) {
  if (value instanceof Error) {
    $("logText").textContent = value.message || "发生未知错误";
  } else if (typeof value === "string") {
    $("logText").textContent = value;
  } else {
    $("logText").textContent = JSON.stringify(value, null, 2);
  }
  $("logDialog").showModal();
}

function formatNum(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

async function loadProjects() {
  state.config = await request("/api/config");
  const data = await request("/api/projects");
  state.projects = data.projects || [];
  renderProjectList();
  if (!state.currentProjectId && state.projects[0]) {
    state.currentProjectId = state.projects[0].id;
  }
  if (state.currentProjectId) {
    await loadProject(state.currentProjectId);
  } else {
    renderEmpty();
  }
}

async function loadProject(id) {
  const data = await request(`/api/projects/${id}`);
  state.currentProjectId = id;
  state.currentProject = data;
  renderProjectList();
  renderProject(data);
}

function renderProjectList() {
  const box = $("projectList");
  if (!state.projects.length) {
    box.innerHTML = `<div class="hint">暂无项目。</div>`;
    return;
  }
  box.innerHTML = state.projects
    .map((p) => {
      const active = p.id === state.currentProjectId ? "active" : "";
      const stats = p.stats || {};
      return `
        <div class="project-item ${active}" data-id="${p.id}">
          <strong>${escapeHtml(p.name)}</strong>
          <span>${escapeHtml(p.category || "未填写品类")} · ${formatNum(stats.reviews)} 条评论 · ${escapeHtml(p.stage)}</span>
        </div>`;
    })
    .join("");
  box.querySelectorAll(".project-item").forEach((el) => {
    el.addEventListener("click", () => loadProject(el.dataset.id));
  });
}

function renderEmpty() {
  $("projectTitle").textContent = "请选择或新建项目";
  $("projectSubtitle").textContent = "从左侧开始：确认 API → 建项目 → 上传 Review → 按顺序点击每一步。";
  renderMetrics({});
  renderWorkflow(null);
  setStepState("sProject", false, "未完成");
  setStepState("sUpload", false, "未完成");
  setStepState("sAtomic", false, "未完成");
  setStepState("sDraft", false, "未完成");
  setStepState("sLock", false, "未完成");
  setStepState("sFinal", false, "未完成");
  $("batchTable").innerHTML = "";
  $("dimensionPool").innerHTML = "";
  $("dimensionCards").innerHTML = `<div class="empty-box">完成原子标签后，再生成维度草案。</div>`;
  $("atomicPreview").innerHTML = "";
  $("dimensionJson").value = "";
  $("exportLink").classList.add("disabled");
  $("exportLinkBottom").classList.add("disabled");
}

function renderProject(data) {
  const p = data.project;
  const stats = p.stats || {};
  $("projectTitle").textContent = p.name;
  $("projectSubtitle").textContent = `${p.category || "未填写品类"} · ${p.stage} · 更新于 ${p.updated_at}`;
  renderMetrics(stats);
  $("exportLink").href = `/api/projects/${p.id}/export`;
  $("exportLink").classList.toggle("disabled", !stats.reviews);
  $("exportLinkBottom").href = `/api/projects/${p.id}/export`;
  $("exportLinkBottom").classList.toggle("disabled", !stats.reviews);
  renderWorkflow(data);
  renderBatches(data.batches || []);
  renderDimensionEditor(data);
  renderDimensionCards(data);
  renderDimensionPool(data.dimension_candidates || {});
  renderAtomicPreview(data.atomic_results || []);
}

function renderMetrics(stats) {
  $("mReviews").textContent = formatNum(stats.reviews);
  $("mBatches").textContent = formatNum(stats.batches);
  $("mAtomic").textContent = formatNum(stats.atomic_records);
  $("mLocked").textContent = formatNum((stats.locked_decision_dimensions || 0) + (stats.locked_context_fields || 0));
  $("mFinal").textContent = formatNum(stats.final_labeled);
  $("mNeedReview").textContent = formatNum(stats.need_review);
}

function hasApiReady() {
  return Boolean(state.config?.has_deepseek_key) || Boolean(apiKey()) || Boolean($("mockRun")?.checked);
}

function renderApiKeyStatus() {
  const ready = hasApiReady();
  const mock = Boolean($("mockRun")?.checked);
  const el = $("apiKeyStatus");
  if (!el) return;
  if (state.config?.has_deepseek_key && apiKey()) {
    localStorage.removeItem("deepseek_api_key");
    $("apiKey").value = "";
  }
  $("apiKey").disabled = Boolean(state.config?.has_deepseek_key);
  $("apiKey").placeholder = state.config?.has_deepseek_key ? "服务端已配置，不会使用浏览器旧 Key" : "服务端未配置时再临时粘贴";
  el.textContent = state.config?.has_deepseek_key ? "已接入服务端 API" : mock ? "模拟运行已开启" : ready ? "已填写临时 Key" : "未填写";
  el.className = `step-state ${ready ? "done" : "wait"}`;
}

function stepState(data) {
  const stats = data?.project?.stats || {};
  const hasDraft = Boolean((data?.dimension_model?.decision_dimensions || []).length || (data?.dimension_model?.context_fields || []).length);
  const hasLocked = Boolean((data?.locked_dimensions?.decision_dimensions || []).length || (data?.locked_dimensions?.context_fields || []).length);
  const reviewCount = stats.reviews || 0;
  const finalCount = stats.final_labeled || 0;
  return {
    api: hasApiReady(),
    project: Boolean(data?.project),
    upload: reviewCount > 0,
    atomic: (stats.atomic_records || 0) > 0,
    draft: hasDraft,
    lock: hasLocked,
    final: reviewCount > 0 && finalCount >= reviewCount,
    export: reviewCount > 0 && finalCount > 0,
  };
}

function renderWorkflow(data) {
  renderApiKeyStatus();
  const stateMap = stepState(data);
  const firstOpen = FLOW_LABELS.find(([key]) => !stateMap[key]);
  $("flowSteps").innerHTML = FLOW_LABELS.map(([key, no, label]) => {
    const done = stateMap[key];
    const active = firstOpen && firstOpen[0] === key;
    return `
      <div class="flow-step ${done ? "done" : ""} ${active ? "active" : ""}">
        <span>${no}</span>
        <strong>${label}</strong>
      </div>
    `;
  }).join("");
  const nextText = nextActionText(firstOpen?.[0], data);
  $("nextAction").textContent = nextText;

  setStepState("sProject", stateMap.project, stateMap.project ? "已创建" : "未完成", firstOpen?.[0] === "project");
  setStepState("sUpload", stateMap.upload, stateMap.upload ? `已导入 ${formatNum(data?.project?.stats?.reviews)} 条` : "未完成", firstOpen?.[0] === "upload");
  setStepState("sAtomic", stateMap.atomic, stateMap.atomic ? `已提取 ${formatNum(data?.project?.stats?.atomic_records)} 个` : "未完成", firstOpen?.[0] === "atomic");
  setStepState("sDraft", stateMap.draft, stateMap.draft ? "已有草案" : "未完成", firstOpen?.[0] === "draft");
  setStepState("sLock", stateMap.lock, stateMap.lock ? "已锁定" : "未完成", firstOpen?.[0] === "lock");
  setStepState("sFinal", stateMap.final, stateMap.final ? "已完成" : (data?.project?.stats?.final_labeled ? `已打 ${formatNum(data.project.stats.final_labeled)} 条` : "未完成"), firstOpen?.[0] === "final");
}

function nextActionText(key) {
  const map = {
    api: "下一步：等待服务端 API 接入，或临时填写 DeepSeek API Key",
    project: "下一步：创建项目",
    upload: "下一步：上传 Review 文件",
    atomic: "下一步：提取原子标签",
    draft: "下一步：生成维度草案",
    lock: "下一步：检查草案并锁定规则",
    final: "下一步：最终打标全部待处理批次",
    export: "下一步：下载最终 Excel",
  };
  return key ? map[key] : "全部步骤已完成，可以下载最终 Excel";
}

function setStepState(id, done, text, active = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = `step-state ${done ? "done" : active ? "active" : "wait"}`;
}

function renderBatches(batches) {
  if (!state.currentProjectId) {
    $("batchTable").innerHTML = `<div class="hint">请先创建项目。</div>`;
    return;
  }
  if (!batches.length) {
    $("batchTable").innerHTML = `<div class="hint" style="padding:12px">还没有后台处理批次。上传 Review 后系统会自动生成。</div>`;
    return;
  }
  $("batchTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>后台批次</th><th>序号范围</th><th>评论数</th><th>状态</th><th>模型</th><th>错误/提示</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${batches.map((b) => `
          <tr>
            <td>${b.id}</td>
            <td>${b.start_seq}-${b.end_seq}</td>
            <td>${b.review_count}</td>
            <td><span class="status ${b.status}">${b.status}</span></td>
            <td>${escapeHtml(b.model || "")}</td>
            <td>${escapeHtml(b.error || "")}</td>
            <td>
              <button data-batch="${b.id}" class="run-batch">单批原子提取</button>
              <button data-batch="${b.id}" class="final-batch">单批最终打标</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;
  document.querySelectorAll(".run-batch").forEach((btn) => {
    btn.addEventListener("click", () => runBatch(btn.dataset.batch));
  });
  document.querySelectorAll(".final-batch").forEach((btn) => {
    btn.addEventListener("click", () => runFinalBatch(btn.dataset.batch));
  });
}

function renderDimensionEditor(data) {
  const locked = data.locked_dimensions || {};
  const draft = data.dimension_model || {};
  const source =
    (locked.decision_dimensions || locked.context_fields) ? locked :
    (draft.decision_dimensions || draft.context_fields) ? draft :
    null;
  if (!source) {
    $("dimensionJson").value = "";
    return;
  }
  $("dimensionJson").value = JSON.stringify(
    {
      decision_dimensions: source.decision_dimensions || [],
      context_fields: source.context_fields || [],
      overflow_or_other: source.overflow_or_other || [],
      need_human_decisions: source.need_human_decisions || [],
    },
    null,
    2
  );
}

function renderDimensionCards(data) {
  const locked = data.locked_dimensions || {};
  const draft = data.dimension_model || {};
  const lockedReady = Boolean((locked.decision_dimensions || []).length || (locked.context_fields || []).length);
  const source = lockedReady ? locked : draft;
  const decision = source.decision_dimensions || [];
  const context = source.context_fields || [];
  const questions = source.need_human_decisions || [];
  if (!decision.length && !context.length) {
    $("dimensionCards").innerHTML = `<div class="empty-box">还没有维度草案。先完成原子标签，再点击“生成维度草案”。</div>`;
    return;
  }
  $("dimensionCards").innerHTML = `
    <div class="dimension-toolbar">
      <span class="step-state ${lockedReady ? "done" : "active"}">${lockedReady ? "当前为锁定规则" : "当前为草案，需人工确认"}</span>
      <span class="hint">购买决策维度 ${decision.length} 个 · Context 字段 ${context.length} 个</span>
    </div>
    <div class="dimension-section-title">购买决策维度</div>
    <div class="dimension-grid">
      ${decision.map((item) => dimensionCard(item, "decision")).join("")}
    </div>
    <div class="dimension-section-title">Context 字段</div>
    <div class="dimension-grid">
      ${context.map((item) => dimensionCard(item, "context")).join("")}
    </div>
    ${questions.length ? `<div class="review-questions"><strong>需要人工判断：</strong>${questions.map((x) => `<span>${escapeHtml(x)}</span>`).join("")}</div>` : ""}
  `;
}

function dimensionCard(item, type) {
  const title = item.name_zh || "未命名";
  const definition = item.definition_zh || "";
  const pOrEvidence = type === "decision" ? item.p_rule_zh : item.evidence_required_zh;
  const listingUse = type === "decision" ? item.listing_use_zh : item.analysis_use_zh;
  return `
    <article class="dimension-card">
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(definition)}</p>
      <dl>
        <dt>${type === "decision" ? "正向规则" : "需要证据"}</dt>
        <dd>${escapeHtml(pOrEvidence || "未填写")}</dd>
        ${type === "decision" ? `<dt>负向规则</dt><dd>${escapeHtml(item.n_rule_zh || "未填写")}</dd>` : ""}
        <dt>边界</dt>
        <dd>${escapeHtml(item.boundary_zh || "未填写")}</dd>
        <dt>运营用途</dt>
        <dd>${escapeHtml(listingUse || "未填写")}</dd>
      </dl>
    </article>
  `;
}

function renderDimensionPool(pool) {
  const product = pool.product_atomic_pool || [];
  const context = pool.context_atomic_pool || [];
  if (!product.length && !context.length) {
    $("dimensionPool").innerHTML = `<div class="hint">完成至少一个批次后会出现候选原子池。</div>`;
    return;
  }
  $("dimensionPool").innerHTML = `
    <h4>产品表现原子池</h4>
    ${product.slice(0, 20).map((x) => `<div class="tag-row"><strong>${escapeHtml(x.atomic_tag)}</strong><small>提及 ${x.count}</small></div>`).join("")}
    <h4>Context 原子池</h4>
    ${context.slice(0, 20).map((x) => `<div class="tag-row"><strong>${escapeHtml(x.atomic_tag)}</strong><small>提及 ${x.count}</small></div>`).join("")}
  `;
}

function renderAtomicPreview(rows) {
  if (!rows.length) {
    $("atomicPreview").innerHTML = `<div class="hint">暂无原子标签结果。</div>`;
    return;
  }
  const html = [];
  for (const row of rows.slice(0, 30)) {
    for (const tag of row.atomic_tags || []) {
      html.push(`
        <div class="tag-row">
          <strong>${escapeHtml(tag.atomic_tag_zh || "")}</strong>
          <small>${escapeHtml(row.review_id || "")} · ${escapeHtml(tag.sentiment || "")} · ${(tag.usage_marks || []).map(escapeHtml).join("、")}</small>
          <div class="hint">${escapeHtml(tag.evidence_original || "")}</div>
        </div>
      `);
    }
  }
  $("atomicPreview").innerHTML = html.join("") || `<div class="hint">批次完成但没有原子标签。</div>`;
}

async function createProject() {
  const payload = {
    name: $("projectName").value.trim() || "未命名VOC项目",
    category: $("projectCategory").value.trim(),
    description: $("projectDescription").value.trim(),
    batch_size: Number($("batchSize").value || 25),
    fast_model: $("fastModel").value.trim(),
    accurate_model: $("accurateModel").value.trim(),
  };
  const data = await request("/api/projects", { method: "POST", json: payload });
  state.currentProjectId = data.project.id;
  await loadProjects();
  document.getElementById("stepUpload").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function uploadReviews() {
  if (!state.currentProjectId) throw new Error("请先创建或选择项目");
  const file = $("reviewFile").files[0];
  if (!file) throw new Error("请选择 .xlsx 或 .csv 文件");
  const form = new FormData();
  form.append("file", file);
  const data = await request(`/api/projects/${state.currentProjectId}/reviews`, { method: "POST", body: form });
  const parseInfoHtml = formatParseInfo(data.parse_info);
  $("uploadPreview").innerHTML = `
    <div class="hint">已导入 ${formatNum(data.stats.reviews)} 条评论。系统正在自动准备后台任务，不需要手动分组。</div>
    ${parseInfoHtml}
    ${(data.sample || []).map((r) => `<div class="tag-row"><strong>${escapeHtml(r.review_id)}</strong><small>${escapeHtml((r.review_original || "").slice(0, 160))}</small></div>`).join("")}
  `;
  await request(`/api/projects/${state.currentProjectId}/batches`, { method: "POST", json: { batch_size: Number($("batchSize").value || 25) } });
  await loadProjects();
  document.getElementById("stepAtomic").scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatParseInfo(info) {
  if (!info) return "";
  const source = [
    info.sheet ? `工作表：${info.sheet}` : "",
    info.header_row ? `表头行：第 ${info.header_row} 行` : "",
    info.body_column_was_inferred ? "正文列：按内容自动推断" : "",
  ].filter(Boolean).join("；");
  const labels = {
    review_id: "序号/ID",
    title: "标题",
    body: "正文",
    translation_zh: "中文翻译",
    star: "星级",
    asin: "ASIN",
    model: "型号/变体",
    link: "链接",
  };
  const columns = Object.entries(info.detected_columns || {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${labels[key] || key}: ${value}`)
    .join("；");
  return `
    <div class="hint">识别信息：${escapeHtml(source || "未返回")}</div>
    ${columns ? `<div class="hint">识别列：${escapeHtml(columns)}</div>` : ""}
  `;
}

async function makeBatches(options = {}) {
  if (!state.currentProjectId) throw new Error("请先选择项目");
  const size = Number($("batchSize").value || 25);
  await request(`/api/projects/${state.currentProjectId}/batches`, { method: "POST", json: { batch_size: size } });
  await loadProject(state.currentProjectId);
  if (!options.silent) document.getElementById("stepAtomic").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runBatch(batchId, options = {}) {
  if (!state.currentProjectId) throw new Error("请先选择项目");
  const key = clientApiKey();
  const mock = $("mockRun").checked;
  if (!mock && !key && !state.config?.has_deepseek_key) throw new Error("服务端还没有接入 DeepSeek API Key，请先配置或临时填写 Key");
  const btn = document.querySelector(`.run-batch[data-batch="${batchId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "运行中";
  }
  try {
    const data = await request(`/api/projects/${state.currentProjectId}/batches/${batchId}/extract-atomic`, {
      method: "POST",
      json: { model: $("fastModel").value.trim() || "deepseek-v4-flash", mock },
      headers: key ? { "X-DeepSeek-Key": key } : {},
    });
    if (!options.silent) showLog(data);
    return data;
  } finally {
    await loadProject(state.currentProjectId);
  }
}

async function runFinalBatch(batchId, options = {}) {
  if (!state.currentProjectId) throw new Error("请先选择项目");
  const key = clientApiKey();
  const mock = $("mockRun").checked;
  if (!mock && !key && !state.config?.has_deepseek_key) throw new Error("服务端还没有接入 DeepSeek API Key，请先配置或临时填写 Key");
  const btn = document.querySelector(`.final-batch[data-batch="${batchId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "打标中";
  }
  try {
    const data = await request(`/api/projects/${state.currentProjectId}/batches/${batchId}/label-final`, {
      method: "POST",
      json: { model: $("accurateModel").value.trim() || "deepseek-v4-pro", mock },
      headers: key ? { "X-DeepSeek-Key": key } : {},
    });
    if (!options.silent) showLog(data);
    return data;
  } finally {
    await loadProject(state.currentProjectId);
  }
}

async function proposeDimensions() {
  if (!state.currentProjectId) throw new Error("请先选择项目");
  const key = clientApiKey();
  const mock = $("mockRun").checked;
  if (!mock && !key && !state.config?.has_deepseek_key) throw new Error("服务端还没有接入 DeepSeek API Key，请先配置或临时填写 Key");
  const data = await request(`/api/projects/${state.currentProjectId}/propose-dimensions`, {
    method: "POST",
    json: { model: $("accurateModel").value.trim() || "deepseek-v4-pro", mock },
    headers: key ? { "X-DeepSeek-Key": key } : {},
  });
  await loadProject(state.currentProjectId);
  showLog(data.dimension_model || data);
  document.getElementById("stepLock").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveDimensions() {
  if (!state.currentProjectId) throw new Error("请先选择项目");
  let payload;
  try {
    payload = JSON.parse($("dimensionJson").value || "{}");
  } catch (err) {
    throw new Error("维度 JSON 格式不正确，请先修正后保存");
  }
  const data = await request(`/api/projects/${state.currentProjectId}/dimensions`, {
    method: "POST",
    json: { dimensions: payload },
  });
  await loadProject(state.currentProjectId);
  showLog(data);
  document.getElementById("stepFinal").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runAllAtomic() {
  const batches = state.currentProject?.batches || [];
  const pending = batches.filter((b) => !["done", "done_with_warnings", "final_done", "final_done_with_warnings"].includes(b.status));
  if (!pending.length) throw new Error("没有待处理的原子提取批次");
  for (const b of pending) {
    await runBatch(b.id, { silent: true });
  }
  showLog(`已完成 ${pending.length} 个后台批次的原子提取。`);
}

async function runAllFinal() {
  const batches = state.currentProject?.batches || [];
  const pending = batches.filter((b) => !["final_done", "final_done_with_warnings"].includes(b.status));
  if (!pending.length) throw new Error("没有待处理的最终打标后台批次");
  for (const b of pending) {
    await runFinalBatch(b.id, { silent: true });
  }
  showLog(`已完成 ${pending.length} 个后台批次的最终打标。`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindEvents() {
  $("apiKey").value = apiKey();
  $("apiKey").addEventListener("input", (e) => setApiKey(e.target.value));
  $("mockRun").addEventListener("change", () => {
    renderApiKeyStatus();
    renderWorkflow(state.currentProject);
  });
  $("newProjectBtn").addEventListener("click", () => {
    state.currentProjectId = null;
    state.currentProject = null;
    renderEmpty();
    $("projectName").focus();
  });
  $("refreshBtn").addEventListener("click", () => loadProjects().catch(showLog));
  $("createProjectBtn").addEventListener("click", () => createProject().catch(showLog));
  $("uploadBtn").addEventListener("click", () => uploadReviews().catch(showLog));
  if ($("makeBatchesBtn")) $("makeBatchesBtn").addEventListener("click", () => makeBatches().catch(showLog));
  $("runAllAtomicBtn").addEventListener("click", () => runAllAtomic().catch(showLog));
  $("runAllFinalBtn").addEventListener("click", () => runAllFinal().catch(showLog));
  $("proposeDimensionsBtn").addEventListener("click", () => proposeDimensions().catch(showLog));
  $("saveDimensionsBtn").addEventListener("click", () => saveDimensions().catch(showLog));
}

if (location.protocol === "file:") {
  location.replace("https://voc-semantic-labeler.onrender.com/");
} else {
  bindEvents();
  loadProjects().catch(showLog);
}
