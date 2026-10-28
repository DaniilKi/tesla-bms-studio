import { test } from "node:test";
import assert from "node:assert/strict";
import { csvText } from "../studio/static/analysis.mjs";
import {
  importVsh,
  vshRows,
  demoVsh,
  capacityRows,
  DemoChargeCounter,
} from "../studio/static/diagnostics.mjs";

test("VSH imports seven harness channels independently from cell groups", () => {
  const csv =
    "signal,value,unit\n" +
    Array.from(
      { length: 7 },
      (_, i) => `BMS_TVSH_BMB01_R${i},${i === 4 ? 3150 : 180},mOhm`,
    ).join("\n");
  const data = importVsh(csv);
  assert.equal(data.channels.length, 7);
  assert.equal(data.channels[4].resistance_mohm, 3150);
  assert.equal(data.channels[0].measured_at_utc, null);
  assert.equal(data.source, "import_csv");
});
test("VSH unit conversion is explicit and missing values stay missing", () => {
  const data = importVsh(
    "signal,value,unit\nBMS_TVSH_BMB01_R0,0.2,Ohm\nBMS_TVSH_BMB01_R1,—,mOhm\nBMS_TVSH_BMB01_R2,0,mΩ",
  );
  assert.equal(data.channels[0].resistance_mohm, 200);
  assert.equal(data.channels[1].resistance_mohm, null);
  assert.equal(data.channels[2].resistance_mohm, 0);
});
test("VSH rejects malformed signals, duplicates, negative values and ambiguous units", () => {
  for (const row of [
    "BMS_TVSH_BMB00_R0,160,mOhm",
    "BMS_TVSH_BMB01_R7,160,mOhm",
    "BMS_TVSH_BMB01_R0,-1,mOhm",
    "BMS_TVSH_BMB01_R0,160,MOhm",
    "BMS_TVSH_BMB01_R0,160,Ah",
  ])
    assert.throws(() => importVsh("signal,value,unit\n" + row));
  assert.throws(() =>
    importVsh(
      "signal,value,unit\nBMS_TVSH_BMB01_R0,160,mOhm\nBMS_TVSH_BMB01_R0,170,mOhm",
    ),
  );
});
test("full 16-module VSH export imports all 112 channels and preserves demo provenance", () => {
  const data = demoVsh({ brick_count: 96 }, "2026-10-28T20:00:00Z");
  const loaded = importVsh(csvText(vshRows(data)));
  assert.equal(loaded.channels.length, 112);
  assert.equal(loaded.source, "imported_demo");
  assert.ok(loaded.channels.every((c) => c.source === "demo"));
});
test("capacity CSV does not conflate BMS Ah with session throughput", () => {
  const rows = capacityRows({
    mode: "pcan",
    profile: { id: "legacy96" },
    capacity_kwh: 85,
    cac_min_ah: 221,
    cac_quality: "as_reported",
    session_charge: {
      positive_ah: 0.1,
      negative_ah: 0,
      gap_count: 1,
      quality: "partial",
    },
  });
  assert.ok(rows[0].includes("cac_min_ah"));
  assert.ok(rows[0].includes("positive_current_ah"));
  assert.equal(rows[1][5], 221);
  assert.equal(rows[1][8], 0.1);
  assert.equal(rows[1][14], "unknown");
});
test("demo counter integrates known current, handles sign crossing and rejects gaps", () => {
  const counter = new DemoChargeCounter();
  for (let t = 0; t <= 3600; t++) counter.feed(t, 10);
  assert.ok(Math.abs(counter.snapshot().positive_ah - 10) < 1e-9);
  const crossing = new DemoChargeCounter();
  crossing.feed(0, 10);
  crossing.feed(1, -10);
  assert.ok(Math.abs(crossing.snapshot().positive_ah - 2.5 / 3600) < 1e-12);
  assert.equal(
    crossing.snapshot().positive_ah,
    crossing.snapshot().negative_ah,
  );
  const gap = new DemoChargeCounter();
  gap.feed(0, 10);
  gap.feed(10, 10);
  assert.equal(gap.snapshot().quality, "partial");
  assert.equal(gap.snapshot().positive_ah, null);
});
