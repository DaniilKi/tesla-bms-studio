// Apparent group resistance only. No stimulus or hardware control is performed.
export const reasonText = {
  missing: "нет данных",
  stale: "данные старше 5 с",
  sync: "нет синхронного тока",
  unstable: "ток менялся при отсчёте",
  current: "ΔI меньше 5 А",
  interval: "интервал вне 0.1–30 с",
  sign: "знак ΔV/ΔI не согласован",
  temperature: "температура изменилась > 2 °C",
  soc: "SOC изменился > 1 %",
  session: "разные сессии / профили",
  conditions: "условия не подтверждены",
  ok: "расчётная оценка; не измерение BMS",
};

export function estimateResistance(
  before,
  after,
  dischargePositive,
  conditionsConfirmed,
) {
  const count = after.profile.brick_count;
  const compatible =
    before.session_id === after.session_id &&
    before.mode === after.mode &&
    before.profile.id === after.profile.id &&
    before.capacity_kwh === after.capacity_kwh &&
    after.profile.expected_count !== null;
  return Array.from({ length: count }, (_, index) => {
    const a = before.samples[index],
      b = after.samples[index];
    const out = {
      brick: index + 1,
      resistance_mohm: null,
      reason: "missing",
      before: a,
      after: b,
    };
    function fail(reason) {
      return { ...out, reason };
    }
    if (!compatible) return fail("session");
    if (!conditionsConfirmed || typeof dischargePositive !== "boolean")
      return fail("conditions");
    if (
      !a ||
      !b ||
      [
        a.voltage_v,
        b.voltage_v,
        a.current_a,
        b.current_a,
        a.voltage_time_s,
        b.voltage_time_s,
        a.current_time_s,
        b.current_time_s,
        a.age_s,
        b.age_s,
        a.current_span_a,
        b.current_span_a,
      ].some((v) => !Number.isFinite(v))
    )
      return out;
    if (
      a.voltage_v <= 0 ||
      b.voltage_v <= 0 ||
      a.voltage_v > 5.5 ||
      b.voltage_v > 5.5
    )
      return out;
    if (a.age_s < 0 || b.age_s < 0 || a.age_s > 5 || b.age_s > 5)
      return fail("stale");
    if (
      Math.abs(a.voltage_time_s - a.current_time_s) > 0.25 ||
      Math.abs(b.voltage_time_s - b.current_time_s) > 0.25 ||
      a.current_samples < 2 ||
      b.current_samples < 2
    )
      return fail("sync");
    if (a.current_span_a > 2 || b.current_span_a > 2) return fail("unstable");
    const deltaI = (b.current_a - a.current_a) * (dischargePositive ? 1 : -1);
    const interval = b.voltage_time_s - a.voltage_time_s;
    const deltaV = b.voltage_v - a.voltage_v;
    out.delta_i_a = deltaI;
    out.delta_v_v = deltaV;
    out.interval_s = interval;
    if (Math.abs(deltaI) < 5) return fail("current");
    if (interval < 0.1 || interval > 30) return fail("interval");
    if (
      Number.isFinite(a.temperature_c) &&
      Number.isFinite(b.temperature_c) &&
      Math.abs(b.temperature_c - a.temperature_c) > 2
    )
      return fail("temperature");
    if (
      Number.isFinite(a.soc_pct) &&
      Number.isFinite(b.soc_pct) &&
      Math.abs(b.soc_pct - a.soc_pct) > 1
    )
      return fail("soc");
    const resistance = (-deltaV / deltaI) * 1000;
    if (!Number.isFinite(resistance) || resistance <= 0) return fail("sign");
    return { ...out, resistance_mohm: resistance, reason: "ok" };
  });
}

export function csvText(rows) {
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((v) => {
            if (v == null) return "";
            // Protect spreadsheet users if an imported string resembles a formula.
            let text = String(v);
            if (typeof v !== "number" && /^[=+\-@\t\r]/.test(text))
              text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}

const sampleFields = [
  "voltage_v",
  "voltage_time_s",
  "current_a",
  "current_time_s",
  "current_span_a",
  "current_samples",
  "temperature_c",
  "soc_pct",
  "age_s",
];
export function sampleRows(state) {
  return [
    [
      "session_id",
      "source",
      "profile_id",
      "capacity_kwh",
      "captured_at_utc",
      "brick",
      ...sampleFields,
    ],
    ...state.samples.map((sample, i) => [
      state.session_id,
      state.mode,
      state.profile.id,
      state.capacity_kwh,
      state.captured_at_utc,
      i + 1,
      ...sampleFields.map((k) => sample[k]),
    ]),
  ];
}

export function parseCsv(text, maxRows = 97) {
  if (text.length > 2000000) throw Error("CSV превышает 2 МБ");
  text = text.replace(/^\ufeff/, "");
  const rows = [];
  let row = [],
    cell = "",
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quote && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quote = !quote;
    } else if (c === "," && !quote) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quote) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quote) throw Error("Незакрытая кавычка CSV");
  row.push(cell);
  if (row.some((v) => v !== "")) rows.push(row);
  if (rows.length < 2 || rows.length > maxRows)
    throw Error("Число строк CSV вне поддерживаемого диапазона");
  return rows;
}

export function importSample(text, profiles) {
  const [header, ...rows] = parseCsv(text);
  const required = [
    "session_id",
    "source",
    "profile_id",
    "capacity_kwh",
    "captured_at_utc",
    "brick",
    ...sampleFields,
  ];
  if (
    header.length !== new Set(header).size ||
    required.some((k) => !header.includes(k))
  )
    throw Error("Нужен CSV измерений Tesla BMS Studio v0.2");
  const at = (r, k) => r[header.indexOf(k)];
  const first = rows[0],
    profile = profiles.find((p) => p.id === at(first, "profile_id"));
  if (!profile || rows.length !== profile.brick_count)
    throw Error("Количество групп не совпадает с профилем");
  const session = at(first, "session_id"),
    mode = at(first, "source"),
    capacity = Number(at(first, "capacity_kwh"));
  const captured = at(first, "captured_at_utc");
  if (
    !/^[A-Za-z0-9_-]{1,80}$/.test(session) ||
    !["demo", "pcan", "socketcan"].includes(mode) ||
    capacity < 60 ||
    capacity > 100 ||
    !Number.isFinite(capacity) ||
    !Number.isFinite(Date.parse(captured))
  )
    throw Error("Некорректные метаданные CSV");
  const samples = Array(profile.brick_count).fill(null);
  for (const row of rows) {
    if (
      row.length !== header.length ||
      [
        "session_id",
        "source",
        "profile_id",
        "capacity_kwh",
        "captured_at_utc",
      ].some((k) => at(row, k) !== at(first, k))
    )
      throw Error("CSV смешивает разные измерения");
    const index = Number(at(row, "brick")) - 1;
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= samples.length ||
      samples[index]
    )
      throw Error("Повтор или неверный номер группы");
    const sample = {};
    for (const key of sampleFields) {
      const cell = at(row, key);
      sample[key] = cell === "" ? null : Number(cell);
      if (cell !== "" && !Number.isFinite(sample[key]))
        throw Error("Нечисловое значение в измерениях");
    }
    samples[index] = sample;
  }
  return {
    profile,
    session_id: session,
    mode,
    capacity_kwh: capacity,
    captured_at_utc: captured,
    samples,
  };
}

export function resistanceRows(before, after, results, dischargePositive) {
  return [
    [
      "source",
      "method",
      "profile_id",
      "capacity_kwh",
      "session_id",
      "before_utc",
      "after_utc",
      "brick",
      "apparent_r_mohm",
      "quality",
      "discharge_positive",
      "delta_i_a",
      "delta_v_v",
      "interval_s",
      ...sampleFields.map((k) => "before_" + k),
      ...sampleFields.map((k) => "after_" + k),
    ],
    ...results.map((r) => [
      after.mode,
      "apparent_delta_v_delta_i",
      after.profile.id,
      after.capacity_kwh,
      after.session_id,
      before.captured_at_utc,
      after.captured_at_utc,
      r.brick,
      r.resistance_mohm,
      r.reason,
      dischargePositive,
      r.delta_i_a,
      r.delta_v_v,
      r.interval_s,
      ...sampleFields.map((k) => r.before?.[k]),
      ...sampleFields.map((k) => r.after?.[k]),
    ]),
  ];
}
