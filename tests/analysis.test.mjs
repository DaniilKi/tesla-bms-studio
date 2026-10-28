import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  estimateResistance,
  csvText,
  sampleRows,
  importSample,
  resistanceRows,
} from "../studio/static/analysis.mjs";
const profiles = JSON.parse(
  readFileSync(new URL("../studio/profiles.json", import.meta.url), "utf8"),
);
function pair() {
  const base = {
    mode: "pcan",
    session_id: "test-session",
    profile: profiles.find((p) => p.id === "legacy84"),
    capacity_kwh: 60,
    captured_at_utc: "2026-10-28T19:00:00Z",
  };
  const samples = Array.from({ length: 84 }, () => ({
    voltage_v: 3.85,
    voltage_time_s: 100,
    current_a: 0,
    current_time_s: 100.02,
    current_samples: 5,
    current_span_a: 0.2,
    age_s: 0.1,
    temperature_c: 22,
    soc_pct: 60,
  }));
  const a = { ...base, samples };
  const b = {
    ...base,
    captured_at_utc: "2026-10-28T19:00:02Z",
    samples: samples.map((s) => ({
      ...s,
      voltage_v: 3.835,
      voltage_time_s: 102,
      current_a: 50,
      current_time_s: 102.02,
    })),
  };
  return [a, b];
}
test("0.015 V / 50 A gives apparent group R of 0.3 mOhm", () => {
  const [a, b] = pair();
  const r = estimateResistance(a, b, true, true);
  assert.equal(r.length, 84);
  assert.ok(Math.abs(r[0].resistance_mohm - 0.3) < 1e-9);
  assert.equal(r[0].reason, "ok");
});
for (const [name, mutate, reason] of [
  ["zero current change", (s) => (s.current_a = 0), "current"],
  ["stale voltage", (s) => (s.age_s = 6), "stale"],
  ["missing voltage", (s) => (s.voltage_v = null), "missing"],
  ["voltage/current skew", (s) => (s.current_time_s = 103), "sync"],
  ["only one current sample", (s) => (s.current_samples = 1), "sync"],
  ["unstable current", (s) => (s.current_span_a = 4), "unstable"],
  ["reversed voltage sign", (s) => (s.voltage_v = 3.9), "sign"],
  ["large temperature change", (s) => (s.temperature_c = 30), "temperature"],
  ["large SOC change", (s) => (s.soc_pct = 50), "soc"],
  [
    "measurement too late",
    (s) => {
      s.voltage_time_s = 140;
      s.current_time_s = 140;
    },
    "interval",
  ],
])
  test(name, () => {
    const [a, b] = pair();
    mutate(b.samples[0]);
    const r = estimateResistance(a, b, true, true)[0];
    assert.equal(r.resistance_mohm, null);
    assert.equal(r.reason, reason);
  });
test("confirmed discharge-negative convention works", () => {
  const [a, b] = pair();
  b.samples.forEach((s) => (s.current_a = -50));
  assert.equal(estimateResistance(a, b, false, true)[0].reason, "ok");
});
test("unconfirmed conditions and mixed sources are rejected", () => {
  const [a, b] = pair();
  assert.equal(estimateResistance(a, b, true, false)[0].reason, "conditions");
  assert.equal(
    estimateResistance(a, b, undefined, true)[0].reason,
    "conditions",
  );
  b.mode = "demo";
  assert.equal(estimateResistance(a, b, true, true)[0].reason, "session");
});
test("CSV sample roundtrip preserves current pairing and missing metadata", () => {
  const [a, b] = pair();
  a.samples[0].temperature_c = null;
  const imported = importSample(csvText(sampleRows(a)), profiles);
  assert.equal(imported.samples[0].temperature_c, null);
  assert.equal(imported.samples[1].current_time_s, 100.02);
  assert.equal(estimateResistance(imported, b, true, true)[0].reason, "ok");
});
test("CSV rejects mixed sessions, duplicate bricks, malformed and oversized input", () => {
  const [a] = pair();
  let rows = sampleRows(a);
  rows[2][0] = "different";
  assert.throws(() => importSample(csvText(rows), profiles));
  rows = sampleRows(a);
  rows[2][5] = 1;
  assert.throws(() => importSample(csvText(rows), profiles));
  assert.throws(() => importSample('"unfinished', profiles));
  assert.throws(() => importSample("x".repeat(2000001), profiles));
});
test("resistance CSV includes method, blanks, raw pair and quality reasons", () => {
  const [a, b] = pair();
  b.samples[0].current_a = 0;
  const r = estimateResistance(a, b, true, true);
  const rows = resistanceRows(a, b, r, true);
  assert.equal(rows.length, 85);
  assert.equal(rows[1][8], null);
  assert.equal(rows[1][9], "current");
  assert.ok(rows[0].includes("before_current_time_s"));
  assert.ok(rows[0].includes("after_temperature_c"));
});
test("CSV string formulas are neutralized but numeric negatives preserved", () => {
  const text = csvText([["=bad", -2, "-bad"]]);
  assert.ok(text.includes("'=bad"));
  assert.ok(text.includes('"-2"'));
  assert.ok(text.includes("'-bad"));
});
