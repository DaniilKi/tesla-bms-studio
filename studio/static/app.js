import {
  estimateResistance,
  reasonText,
  csvText,
  sampleRows,
  importSample,
  resistanceRows,
} from "./analysis.mjs";
import { DemoTransport } from "./demo.mjs";

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
  temperatures = [],
  tick = 0;
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
  $("analysis-status").textContent =
    "Нет пары измерений. При постоянном токе сопротивление не рассчитывается.";
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
      `B${selected + 1} · ${number(state.bricks[selected], 4)} В · ${state.brick_state[selected] ?? "missing"} · R из BMS не декодировано`;
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
    view === "resistance" ? "Карта расчётного R · мОм" : "Карта напряжений · В";
  $("view-voltage").className = "tab" + (view === "voltage" ? " selected" : "");
  $("view-resistance").className =
    "tab" + (view === "resistance" ? " selected" : "");
  $("map-caption").textContent =
    view === "resistance"
      ? `Оценка пары ${after ? after.captured_at_utc : "не сохранена"} · ${after?.mode === "demo" ? "СИНТЕТИЧЕСКИЕ данные" : "источник пары"} · ${profile.brick_count} групп. Это не прямое чтение R из BMS.`
      : `Текущий источник: ${state.capacity_kwh} кВт·ч · ${state.profile.id}. Логический порядок; температурная карта предварительная.`;
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
    $("conditions").checked = false;
  }
  resetAnalysis();
  await action("/api/connect", {
    mode,
    channel: $("channel").value,
    profile_confirmed: $("confirmed").checked,
    profile_id: $("profile").value,
    capacity_kwh: Number($("capacity").value),
  });
  if (mode === "demo") {
    $("current-sign").value = "positive";
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
function calculate() {
  if (!before || !after) {
    $("analysis-status").textContent = before
      ? "Измерение A сохранено. Нужны B, изменение тока и сопоставимые условия."
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
    `${after.mode === "demo" ? "СИНТЕТИЧЕСКАЯ ПАРА. " : ""}Оценка доступна: ${valid}/${results.length}. ${reasons.length ? "Пропуски: " + reasons.join("; ") : "Метод: −ΔV/ΔI; исходные значения включены в CSV."}`;
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
render();
await poll();
setInterval(poll, 1000);
if (hosted) {
  $("connection").requestSubmit();
}
