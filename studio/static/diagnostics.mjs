import { parseCsv } from "./analysis.mjs";

export const demoCapacityAh = {
  60: 154.2,
  70: 183.1,
  75: 195.4,
  85: 222.8,
  90: 238.1,
  100: 270.2,
};

// Synthetic UI fixtures only. None of these values are a live VSH decoder.
export function demoVsh(profile, measuredAt) {
  const channels = [];
  for (let module = 1; module <= Math.ceil(profile.brick_count / 6); module++) {
    for (let channel = 0; channel <= 6; channel++)
      channels.push({
        module,
        channel,
        signal: `BMS_TVSH_BMB${String(module).padStart(2, "0")}_R${channel}`,
        resistance_mohm:
          module === 6 && channel === 4
            ? 3180
            : 120 + ((module * 3 + channel * 2) % 12) * 20,
        measured_at_utc: measuredAt,
        source: "demo",
      });
  }
  return { source: "demo", channels };
}

export function importVsh(text) {
  const [headers, ...rows] = parseCsv(text, 113);
  if (
    new Set(headers).size !== headers.length ||
    ["signal", "value", "unit"].some((k) => !headers.includes(k))
  )
    throw Error("CSV VSH: нужны колонки signal,value,unit");
  const at = (row, key) =>
    headers.includes(key) ? row[headers.indexOf(key)] : "";
  const units = new Map([
    ["mOhm", 1],
    ["mohm", 1],
    ["mΩ", 1],
    ["mΩ", 1],
    ["Ohm", 1000],
    ["ohm", 1000],
    ["Ω", 1000],
    ["Ω", 1000],
  ]);
  const seen = new Set(),
    channels = [];
  for (const row of rows) {
    const signal = at(row, "signal").trim();
    const match = /^BMS_TVSH_BMB(0[1-9]|1[0-6])_R([0-6])$/.exec(signal);
    if (row.length !== headers.length || !match || seen.has(signal))
      throw Error("Неизвестный или повторный VSH-канал");
    seen.add(signal);
    const value = at(row, "value").trim();
    const missing = ["", "—", "-", "NA", "N/A"].includes(value);
    const unit = at(row, "unit").trim();
    const resistance = missing ? null : Number(value) * units.get(unit);
    if (
      !missing &&
      (!units.has(unit) || !Number.isFinite(resistance) || resistance < 0)
    )
      throw Error("Нужны неотрицательные значения и единицы mOhm или Ohm");
    const measured = at(row, "measured_at_utc").trim();
    if (measured && !Number.isFinite(Date.parse(measured)))
      throw Error("Неверное время VSH-измерения");
    channels.push({
      module: Number(match[1]),
      channel: Number(match[2]),
      signal,
      resistance_mohm: resistance,
      measured_at_utc: measured || null,
      source: at(row, "source") === "demo" ? "demo" : "import_csv",
    });
  }
  return {
    source: channels.some((c) => c.source === "demo")
      ? "imported_demo"
      : "import_csv",
    channels,
  };
}

export function vshRows(dataset) {
  return [
    ["signal", "value", "unit", "measured_at_utc", "source"],
    ...dataset.channels.map((c) => [
      c.signal,
      c.resistance_mohm,
      "mOhm",
      c.measured_at_utc,
      c.source,
    ]),
  ];
}

export function capacityRows(state, currentPolarity = "unknown") {
  const q = state.session_charge || {};
  return [
    [
      "captured_at_utc",
      "source",
      "session_id",
      "profile_id",
      "nominal_kwh",
      "cac_min_ah",
      "cac_quality",
      "cac_raw",
      "positive_current_ah",
      "negative_current_ah",
      "valid_seconds",
      "gap_seconds",
      "gap_count",
      "throughput_quality",
      "current_polarity",
      "integration_method",
    ],
    [
      state.captured_at_utc,
      state.mode,
      state.session_id,
      state.profile.id,
      state.capacity_kwh,
      state.cac_min_ah,
      state.cac_quality,
      state.cac_raw,
      q.positive_ah,
      q.negative_ah,
      q.valid_seconds,
      q.gap_seconds,
      q.gap_count,
      q.quality,
      currentPolarity,
      q.method,
    ],
  ];
}

export class DemoChargeCounter {
  constructor() {
    this.last = null;
    this.current = null;
    this.positive = 0;
    this.negative = 0;
    this.seconds = 0;
    this.gapSeconds = 0;
    this.gaps = 0;
  }
  feed(t, current) {
    if (this.last !== null) {
      const dt = t - this.last;
      if (
        dt > 0 &&
        dt <= 1.5 &&
        Number.isFinite(this.current) &&
        Number.isFinite(current)
      ) {
        const a = this.current,
          b = current;
        if (a >= 0 && b >= 0) this.positive += ((a + b) * dt) / 7200;
        else if (a <= 0 && b <= 0) this.negative -= ((a + b) * dt) / 7200;
        else {
          const cross = (dt * Math.abs(a)) / (Math.abs(a) + Math.abs(b));
          const first = (Math.abs(a) * cross) / 7200,
            second = (Math.abs(b) * (dt - cross)) / 7200;
          this.positive += a > 0 ? first : second;
          this.negative += a < 0 ? first : second;
        }
        this.seconds += dt;
      } else if (dt > 0) {
        this.gapSeconds += dt;
        this.gaps++;
      }
    }
    this.last = t;
    this.current = current;
  }
  snapshot() {
    return {
      positive_ah: this.seconds > 0 ? this.positive : null,
      negative_ah: this.seconds > 0 ? this.negative : null,
      valid_seconds: this.seconds,
      gap_seconds: this.gapSeconds,
      gap_count: this.gaps,
      quality: this.gaps
        ? "partial"
        : this.seconds > 0
          ? "recorded"
          : "waiting",
      method: "trapezoidal_current_integral",
    };
  }
}
