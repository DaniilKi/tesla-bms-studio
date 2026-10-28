import {
  estimateResistance,
  reasonText,
  csvText,
  sampleRows,
  importSample,
  resistanceRows,
} from "./analysis.mjs";
import { DemoTransport } from "./demo.mjs";
import { demoVsh, importVsh, vshRows, capacityRows } from "./diagnostics.mjs";

const $ = (id) => document.getElementById(id);
const hosted = window.STUDIO_CONFIG?.hosted === true;
const profiles = await (
  await fetch(hosted ? "/static/profiles.json" : "/api/profiles")
).json();
const demo = new DemoTransport(profiles);
let state = demo.snapshot(),
  before = null,
  after = null,
  results = null,
  view = "voltage",
  selected = 0,
  busy = false,
  serverLost = false,
  gridKey = "";
let tiles = [],
  temperatures = [];
let importedVsh = null,
  vshGridKey = "",
  vshTiles = [],
  vshSelected = null;
const number = (v, p = 1) => (Number.isFinite(v) ? v.toFixed(p) : "—");
for (const profile of profiles) {
  const o = document.createElement("option");
  o.value = profile.id;
  o.textContent = profile.label;
  $("profile").append(o);
}
$("profile").value = "legacy96";
$("hosting-note").hidden = !hosted;
if (hosted)
  for (const o of $("mode").options) if (o.value !== "demo") o.disabled = true;

function showError(message) {
  $("error").hidden = !message;
  $("error").textContent = message || "";
}
function modeChanged() {
  const mode = $("mode").value;
  $("hardware").hidden = mode === "demo";
  $("confirmed").checked = false;
  $("current-sign").value = "unknown";
  $("capacity-polarity").value = "unknown";
  $("conditions").checked = false;
  $("channel").value = mode === "pcan" ? "PCAN_USBBUS1" : "can0";
  $("connect").textContent =
    mode === "demo" ? "Запустить демо ↗" : "Подключить · только приём ↗";
  $("driver-note").textContent =
    mode === "pcan"
      ? "Нужны драйвер PEAK и PCAN-Basic. Запрашивается пассивный режим адаптера."
      : "Используется готовый интерфейс Linux. Скорость 500 kbit/s и listen-only проверяются вне приложения.";
}
$("mode").addEventListener("change", modeChanged);
modeChanged();
function resetAnalysis() {
  before = null;
  after = null;
  results = null;
  $("export-resistance").disabled = true;
  $("analysis-status").textContent = "Нужны измерения A и B при разном токе.";
  render();
}

function buildGrid(profile) {
  if (gridKey === profile.id) return;
  gridKey = profile.id;
  $("modules").replaceChildren();
  tiles = [];
  temperatures = [];
  for (let m = 0; m < Math.ceil(profile.brick_count / 6); m++) {
    const card = document.createElement("article");
    card.className = "module";
    const heading = document.createElement("div");
    heading.className = "module-heading";
    const title = document.createElement("b");
    title.textContent = `МОДУЛЬ ${String(m + 1).padStart(2, "0")}`;
    const temperature = document.createElement("span");
    temperatures.push(temperature);
    heading.append(title, temperature);
    const grid = document.createElement("div");
    grid.className = "bricks";
    for (let k = 0; k < 6 && m * 6 + k < profile.brick_count; k++) {
      const index = m * 6 + k,
        tile = document.createElement("button");
      tile.type = "button";
      tile.className = "brick";
      const label = document.createElement("span");
      label.textContent = `B${String(index + 1).padStart(2, "0")}`;
      const value = document.createElement("div");
      tile.append(label, value);
      grid.append(tile);
      tiles.push({ tile, value });
      tile.addEventListener("click", () => {
        selected = index;
        renderDetail();
      });
    }
    card.append(heading, grid);
    $("modules").append(card);
  }
}
function renderDetail() {
  if (view === "resistance" && after) {
    const r = results?.[selected];
    $("selected-brick").textContent = r
      ? `B${selected + 1} · ${number(r.resistance_mohm, 3)} мОм · ${reasonText[r.reason]} · ${after.mode === "demo" ? "СИНТЕТИКА" : "архив пары"} · интервал ${number(r.interval_s, 2)} с`
      : "Выберите группу.";
  } else
    $("selected-brick").textContent =
      `B${selected + 1} · ${number(state.bricks[selected], 4)} В`;
}
function render() {
  const active = ["demo", "listening"].includes(state.status);
  $("status").textContent = serverLost
    ? "Сервер недоступен"
    : state.status === "demo"
      ? "Демо работает"
      : state.status === "listening"
        ? `Приём · ${state.mode} / ${state.channel}`
        : state.status === "error"
          ? "Ошибка подключения"
          : "Отключено";
  $("status").className = "badge" + (active && !serverLost ? " active" : "");
  $("disconnect").disabled = busy || !active;
  $("demo-banner").hidden = state.status !== "demo";
  $("demo-controls").hidden = state.status !== "demo";
  $("pack").textContent = number(state.pack_v, 2);
  $("current").textContent = number(state.pack_a, 1);
  $("spread").textContent = number(state.spread_mv);
  $("coverage").textContent =
    `${state.coverage} / ${state.profile.expected_count ?? "?"}`;
  $("temp-coverage").textContent =
    `Температуры: ${state.temperature_coverage} / ${state.profile.temp_count}`;
  $("range").textContent =
    `${number(state.min_v, 3)} / ${number(state.max_v, 3)} В`;
  $("difference").textContent = `${number(state.unmeasured_v, 2)} В`;
  $("frames").textContent = state.frame_count.toLocaleString("ru-RU");
  $("age").textContent =
    state.last_rx_age == null
      ? "Кадры не получены"
      : `Последний кадр ${number(state.last_rx_age, 1)} с назад`;
  $("isolation").textContent = `${number(state.isolation_kohm, 0)} кОм`;
  $("session-label").textContent =
    `Model S · ${state.capacity_kwh} кВт·ч · ${state.profile.expected_count ?? "?"} групп`;
  $("cac-min").textContent = number(state.cac_min_ah, 1);
  const cacLabels = {
    missing: "Нет сигнала BMS",
    stale: "Сигнал устарел",
    unverified_max_code: "Код требует проверки",
    as_reported: "Оценка BMS",
    demo: "Демо · оценка BMS",
  };
  $("cac-status").textContent =
    cacLabels[state.cac_quality] ?? "Нет сигнала BMS";
  $("voltage-panel").hidden = !["voltage", "resistance"].includes(view);
  $("analysis-panel").hidden = view !== "resistance";
  $("vsh-panel").hidden = view !== "vsh";
  $("capacity-panel").hidden = view !== "capacity";
  $("export-sample").hidden = !["voltage", "resistance"].includes(view);
  $("export-resistance").hidden = view !== "resistance";
  for (const name of ["voltage", "vsh", "capacity", "resistance"]) {
    $("view-" + name).className = "tab" + (view === name ? " selected" : "");
    $("view-" + name).setAttribute("aria-pressed", String(view === name));
  }
  renderCapacity();
  if (view === "vsh") renderVsh();
  const outside = state.outside_profile_bricks?.length > 0;
  $("profile-warning").hidden =
    !outside && state.profile.expected_count !== null;
  $("profile-warning").textContent = outside
    ? "Данные выходят за выбранный профиль. Проверьте число групп; полное сравнение блока отключено."
    : "Число групп неизвестно. 96 позиций — окно просмотра; полного сравнения блока и оценки R нет.";
  const profile =
    view === "resistance" && after ? after.profile : state.profile;
  buildGrid(profile);
  if (selected >= profile.brick_count) selected = 0;
  $("map-title").textContent =
    view === "resistance" ? "Расчётное сопротивление · мОм" : "Группы · В";
  $("view-voltage").className = "tab" + (view === "voltage" ? " selected" : "");
  $("view-resistance").className =
    "tab" + (view === "resistance" ? " selected" : "");
  $("map-caption").textContent =
    view === "resistance"
      ? `${after?.mode === "demo" ? "Демо · " : ""}${results?.filter((r) => r.reason === "ok").length ?? 0} / ${profile.brick_count}`
      : `${Math.ceil(profile.brick_count / 6)} модулей`;
  tiles.forEach(({ tile, value }, i) => {
    const r = results?.[i];
    const val = view === "resistance" ? r?.resistance_mohm : state.bricks[i];
    const quality =
      view === "resistance"
        ? Number.isFinite(val)
          ? "fresh"
          : "missing"
        : state.brick_state[i];
    tile.className = "brick " + quality;
    value.textContent = number(val, 3);
    tile.title =
      view === "resistance"
        ? `B${i + 1}: ${reasonText[r?.reason] ?? "нет пары"}`
        : `B${i + 1}: ${quality}`;
    tile.setAttribute(
      "aria-label",
      `Группа ${i + 1}: ${value.textContent} ${view === "resistance" ? "мОм" : "В"}`,
    );
  });
  temperatures.forEach((el, i) => {
    el.textContent =
      view === "resistance"
        ? "ΔV / ΔI"
        : `${number(state.temps[i * 2])} / ${number(state.temps[i * 2 + 1])} °C`;
  });
  const values =
    view === "resistance"
      ? tiles.map((_, i) => results?.[i]?.resistance_mohm)
      : state.bricks;
  const known = values.filter(Number.isFinite),
    min = known.length ? Math.min(...known) : 0,
    max = known.length ? Math.max(...known) : 1;
  const svg = $("voltage-chart");
  svg.replaceChildren();
  const poly = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polyline",
  );
  poly.setAttribute(
    "points",
    values
      .map((v, i) =>
        Number.isFinite(v)
          ? `${10 + (i * 880) / Math.max(values.length - 1, 1)},${75 - ((v - min) / Math.max(max - min, 0.001)) * 60}`
          : null,
      )
      .filter(Boolean)
      .join(" "),
  );
  poly.setAttribute("fill", "none");
  poly.setAttribute("stroke", "#a1d8cd");
  poly.setAttribute("stroke-width", "2");
  svg.append(poly);
  $("r-coverage").textContent =
    `${results?.filter((r) => r.reason === "ok").length ?? 0} групп`;
  renderDetail();
  if (state.error) showError(state.error);
}
async function request(path, body) {
  if (hosted) return demo.request(path, body);
  const response = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) throw Error(await response.text());
  return response.json();
}
async function poll() {
  if (busy) return;
  try {
    const fresh = await request("/api/state");
    if (serverLost) showError(null);
    serverLost = false;
    state = fresh;
    $("connect").disabled = false;
    render();
  } catch (error) {
    serverLost = true;
    state = {
      ...state,
      pack_v: null,
      pack_a: null,
      spread_mv: null,
      coverage: 0,
      temperature_coverage: 0,
      min_v: null,
      max_v: null,
      unmeasured_v: null,
      isolation_kohm: null,
      cac_min_ah: null,
      cac_quality: "stale",
      bricks: state.bricks.map(() => null),
      temps: state.temps.map(() => null),
      brick_state: state.bricks.map(() => "stale"),
    };
    $("connect").disabled = true;
    render();
    showError("Локальный сервер недоступен. Перезапустите клиент.");
  }
}
async function action(path, body) {
  busy = true;
  $("connect").disabled = true;
  showError(null);
  try {
    state = await request(path, body);
    serverLost = false;
    render();
  } catch (error) {
    showError(error.message);
  } finally {
    busy = false;
    $("connect").disabled = false;
    await poll();
  }
}
$("connection").addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = $("mode").value;
  if (mode !== "demo" && !$("confirmed").checked) {
    showError(
      "Подтвердите профиль и подключение перед работой с реальным блоком.",
    );
    return;
  }
  if (mode !== "demo") {
    $("current-sign").value = "unknown";
    $("capacity-polarity").value = "unknown";
    $("conditions").checked = false;
  }
  resetAnalysis();
  importedVsh = null;
  vshGridKey = "";
  await action("/api/connect", {
    mode,
    channel: $("channel").value,
    profile_confirmed: $("confirmed").checked,
    profile_id: $("profile").value,
    capacity_kwh: Number($("capacity").value),
  });
  if (mode === "demo") {
    $("current-sign").value = "positive";
    $("capacity-polarity").value = "positive";
    $("conditions").checked = true;
  }
});
$("disconnect").addEventListener("click", async () => {
  resetAnalysis();
  await action("/api/disconnect", {});
});
$("scenario").addEventListener("change", async () => {
  resetAnalysis();
  await action("/api/demo", { scenario: $("scenario").value });
});
$("demo-step").addEventListener("click", () =>
  action("/api/demo", { current_a: state.pack_a === 0 ? 50 : 0 }),
);
$("view-voltage").addEventListener("click", () => {
  view = "voltage";
  render();
});
$("view-resistance").addEventListener("click", () => {
  view = "resistance";
  render();
});
for (const name of ["vsh", "capacity"])
  $("view-" + name).addEventListener("click", () => {
    view = name;
    render();
  });
function calculate() {
  if (!before || !after) {
    $("analysis-status").textContent = before
      ? "A сохранено. Сохраните B при другом токе."
      : "Сначала сохраните измерение A.";
    return;
  }
  const sign = $("current-sign").value;
  results = estimateResistance(
    before,
    after,
    sign === "unknown" ? undefined : sign === "positive",
    $("conditions").checked,
  );
  const valid = results.filter((r) => r.reason === "ok").length;
  const reasons = [
    ...new Set(
      results.filter((r) => r.reason !== "ok").map((r) => reasonText[r.reason]),
    ),
  ];
  $("analysis-status").textContent =
    `${after.mode === "demo" ? "Демо · " : ""}${valid}/${results.length} групп${reasons.length ? " · " + reasons.join("; ") : " · расчёт готов"}`;
  $("export-resistance").disabled = false;
  render();
}
function capture() {
  if (serverLost || !["demo", "listening"].includes(state.status))
    throw Error("Нет активного источника измерений");
  if (
    state.profile.expected_count === null ||
    state.outside_profile_bricks?.length
  )
    throw Error("Для оценки R нужен проверенный профиль без лишних каналов");
  return structuredClone(state);
}
$("capture-before").addEventListener("click", () => {
  try {
    before = capture();
    after = null;
    results = null;
    $("export-resistance").disabled = true;
    calculate();
    showError(null);
  } catch (e) {
    showError(e.message);
  }
});
$("capture-after").addEventListener("click", () => {
  try {
    after = capture();
    calculate();
    showError(null);
  } catch (e) {
    showError(e.message);
  }
});
$("clear-analysis").addEventListener("click", resetAnalysis);
for (const id of ["conditions", "current-sign"])
  $(id).addEventListener("change", () => {
    if (before && after) calculate();
  });
for (const side of ["before", "after"])
  $("import-" + side).addEventListener("change", async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 2000000) throw Error("CSV превышает 2 МБ");
      const sample = importSample(await file.text(), profiles);
      if (side === "before") {
        before = sample;
        after = null;
        results = null;
      } else after = sample;
      calculate();
      showError(null);
    } catch (e) {
      showError(e.message);
    } finally {
      event.target.value = "";
    }
  });
function download(filename, text) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export-sample").addEventListener("click", () => {
  try {
    const sample = capture();
    download(
      `tesla-${sample.mode}-${sample.profile.id}-${Date.now()}.csv`,
      csvText(sampleRows(sample)),
    );
  } catch (e) {
    showError(e.message);
  }
});
$("export-resistance").addEventListener("click", () => {
  if (before && after && results)
    download(
      `tesla-${after.mode}-apparent-resistance-${Date.now()}.csv`,
      csvText(
        resistanceRows(
          before,
          after,
          results,
          $("current-sign").value === "positive",
        ),
      ),
    );
});
function renderCapacity() {
  const q = state.session_charge || {};
  $("capacity-ah").textContent = number(state.cac_min_ah, 1);
  $("capacity-source").textContent = $("cac-status").textContent;
  $("positive-ah").textContent = number(q.positive_ah, 4);
  $("negative-ah").textContent = number(q.negative_ah, 4);
  const polarity = $("current-sign").value;
  $("positive-label").textContent =
    polarity === "unknown"
      ? "ПОЛОЖИТЕЛЬНЫЙ ТОК"
      : polarity === "positive"
        ? "ОТДАНО ЗА СЕССИЮ"
        : "ПОЛУЧЕНО ЗА СЕССИЮ";
  $("negative-label").textContent =
    polarity === "unknown"
      ? "ОТРИЦАТЕЛЬНЫЙ ТОК"
      : polarity === "negative"
        ? "ОТДАНО ЗА СЕССИЮ"
        : "ПОЛУЧЕНО ЗА СЕССИЮ";
  $("charge-quality").textContent = serverLost
    ? "Связь потеряна"
    : q.quality === "partial"
      ? "Есть пропуски"
      : q.quality === "recorded"
        ? "Непрерывная запись"
        : "Ожидание тока";
  $("charge-duration").textContent =
    `Записано ${number(q.valid_seconds ?? 0, 1)} с${q.gap_count ? " · пропуски " + number(q.gap_seconds, 1) + " с" : ""}`;
  $("export-capacity").disabled =
    serverLost ||
    (!Number.isFinite(state.cac_min_ah) && !(q.valid_seconds > 0));
}
function currentVsh() {
  return (
    importedVsh ||
    (!serverLost && state.mode === "demo" && state.status === "demo"
      ? demoVsh(state.profile, state.captured_at_utc)
      : state.vsh)
  );
}
function renderVsh() {
  const data = currentVsh(),
    channels = data?.channels ?? [];
  $("vsh-empty").hidden = channels.length > 0;
  $("clear-vsh").hidden = !importedVsh;
  $("export-vsh").disabled = channels.length === 0;
  $("vsh-source").textContent =
    data?.source === "demo"
      ? "ДЕМО"
      : data?.source === "imported_demo"
        ? "CSV · ДЕМО"
        : data?.source === "import_csv"
          ? "CSV · импорт"
          : "Live-декодер не подтверждён";
  const moduleIds = [...new Set(channels.map((c) => c.module))].sort(
    (a, b) => a - b,
  );
  const key = String(data?.source) + "/" + moduleIds.join(",");
  if (key !== vshGridKey) {
    vshGridKey = key;
    vshTiles = [];
    $("vsh-modules").replaceChildren();
    for (const module of moduleIds) {
      const card = document.createElement("article");
      card.className = "module";
      const heading = document.createElement("div");
      heading.className = "module-heading";
      heading.textContent = `BMB ${String(module).padStart(2, "0")}`;
      const grid = document.createElement("div");
      grid.className = "vsh-channels";
      for (let channel = 0; channel < 7; channel++) {
        const signal = `BMS_TVSH_BMB${String(module).padStart(2, "0")}_R${channel}`;
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "brick";
        const label = document.createElement("span");
        label.textContent = "R" + channel;
        const value = document.createElement("div");
        tile.append(label, value);
        grid.append(tile);
        vshTiles.push({ signal, tile, value });
        tile.addEventListener("click", () => {
          vshSelected = signal;
          renderVsh();
        });
      }
      card.append(heading, grid);
      $("vsh-modules").append(card);
    }
  }
  const known = channels.filter((c) => Number.isFinite(c.resistance_mohm));
  const max = known.reduce(
    (a, b) => (!a || b.resistance_mohm > a.resistance_mohm ? b : a),
    null,
  );
  for (const { signal, tile, value } of vshTiles) {
    const c = channels.find((x) => x.signal === signal);
    value.textContent = number(c?.resistance_mohm, 0);
    tile.className =
      "brick" +
      (Number.isFinite(c?.resistance_mohm) ? " fresh" : "") +
      (max?.signal === signal ? " maximum" : "");
    tile.setAttribute("aria-label", `${signal}: ${value.textContent} мОм`);
  }
  const selected = channels.find((c) => c.signal === vshSelected) || max;
  $("vsh-selected").textContent = selected
    ? `${selected.signal} · ${number(selected.resistance_mohm, 0)} мОм · ${selected.measured_at_utc ?? "время измерения неизвестно"}`
    : "";
}
$("import-vsh").addEventListener("change", async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2000000) throw Error("CSV превышает 2 МБ");
    importedVsh = importVsh(await file.text());
    vshGridKey = "";
    vshSelected = null;
    view = "vsh";
    showError(null);
    render();
  } catch (e) {
    showError(e.message);
  } finally {
    event.target.value = "";
  }
});
$("clear-vsh").addEventListener("click", () => {
  importedVsh = null;
  vshGridKey = "";
  vshSelected = null;
  render();
});
$("export-vsh").addEventListener("click", () => {
  const data = currentVsh();
  if (data)
    download(
      `tesla-${data.source}-vsh-${Date.now()}.csv`,
      csvText(vshRows(data)),
    );
});
$("export-capacity").addEventListener("click", () =>
  download(
    `tesla-${state.mode ?? "disconnected"}-capacity-${Date.now()}.csv`,
    csvText(capacityRows(state, $("current-sign").value)),
  ),
);
$("capacity-polarity").addEventListener("change", () => {
  $("current-sign").value = $("capacity-polarity").value;
  $("current-sign").dispatchEvent(new Event("change"));
  renderCapacity();
});
$("current-sign").addEventListener("change", () => {
  $("capacity-polarity").value = $("current-sign").value;
  renderCapacity();
});

// Help remains available on hover, keyboard focus, click and touch.
const helps = [...document.querySelectorAll(".help")];
const closeHelp = (help) => {
  help.classList.remove("is-open");
  help.pinned = false;
  help.querySelector("button").setAttribute("aria-expanded", "false");
};
helps.forEach((help, index) => {
  const button = help.querySelector("button"),
    hint = help.querySelector(".hint");
  hint.id = "help-" + index;
  button.setAttribute("aria-describedby", hint.id);
  let closeTimer;
  const show = () => {
    clearTimeout(closeTimer);
    helps.filter((h) => h !== help).forEach(closeHelp);
    help.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    const r = button.getBoundingClientRect();
    const w = hint.offsetWidth,
      h = hint.offsetHeight;
    hint.style.left =
      Math.max(12, Math.min(r.right - w, innerWidth - w - 12)) + "px";
    hint.style.top =
      Math.max(
        12,
        r.bottom + h + 8 < innerHeight ? r.bottom + 8 : r.top - h - 8,
      ) + "px";
  };
  help.addEventListener("mouseenter", show);
  help.addEventListener("mouseleave", () => {
    closeTimer = setTimeout(() => {
      if (!help.pinned) closeHelp(help);
    }, 180);
  });
  button.addEventListener("focus", show);
  button.addEventListener("blur", () => {
    if (!help.pinned) closeHelp(help);
  });
  button.addEventListener("click", () => {
    if (help.pinned) closeHelp(help);
    else {
      show();
      help.pinned = true;
    }
  });
});
document.addEventListener("pointerdown", (event) =>
  helps.filter((h) => !h.contains(event.target)).forEach(closeHelp),
);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") helps.forEach(closeHelp);
});
window.addEventListener("resize", () => helps.forEach(closeHelp));
render();
await poll();
setInterval(poll, 1000);
if (hosted) {
  $("connection").requestSubmit();
}
