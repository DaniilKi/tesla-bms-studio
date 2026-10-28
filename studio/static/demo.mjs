export class DemoTransport {
  constructor(profiles) {
    this.profiles = profiles;
    this.profile = profiles.find((p) => p.id === "legacy96");
    this.capacity = 85;
    this.status = "disconnected";
    this.session = crypto.randomUUID();
    this.current = 0;
    this.scenario = "balanced";
    this.frames = 0;
  }
  async request(path, body) {
    if (path === "/api/connect") {
      if (body.mode !== "demo")
        throw Error(
          "Онлайн-сайт не подключается к USB-CAN. Запустите локальный клиент.",
        );
      this.profile = this.profiles.find((p) => p.id === body.profile_id);
      this.capacity = body.capacity_kwh;
      this.status = "demo";
      this.session = crypto.randomUUID();
      this.current = 0;
      this.frames = 0;
    } else if (path === "/api/disconnect") this.status = "disconnected";
    else if (path === "/api/demo") {
      if (this.status !== "demo") throw Error("Сначала запустите демо");
      this.current = body.current_a ?? this.current;
      this.scenario = body.scenario ?? this.scenario;
    }
    return this.snapshot();
  }
  snapshot() {
    const t = performance.now() / 1000,
      active = this.status === "demo",
      count = this.profile.brick_count;
    const bricks = Array.from({ length: count }, (_, i) =>
      active
        ? 3.85 +
          0.006 * Math.sin(i * 0.4) -
          this.current * (0.00025 + (i % 10) * 0.00001) -
          (this.scenario === "imbalance" && i === 41 ? 0.08 : 0)
        : null,
    );
    const temps = Array.from({ length: this.profile.temp_count }, (_, i) =>
      active ? 22 + i * 0.05 : null,
    );
    const known = bricks.filter((v) => v !== null),
      total = known.reduce((a, b) => a + b, 0);
    if (active) this.frames += 34;
    return {
      profile: this.profile,
      mode: "demo",
      status: this.status,
      session_id: this.session,
      capacity_kwh: this.capacity,
      captured_at_utc: new Date().toISOString(),
      bricks,
      temps,
      samples: bricks.map((v, i) => ({
        voltage_v: v,
        voltage_time_s: active ? t : null,
        current_a: active ? this.current : null,
        current_time_s: active ? t - 0.02 : null,
        current_samples: active ? 5 : 0,
        current_span_a: active ? 0.2 : null,
        age_s: active ? 0.1 : null,
        temperature_c: temps[Math.floor(i / 6) * 2],
        soc_pct: active ? 62 : null,
      })),
      brick_state: bricks.map((v) => (v === null ? "missing" : "fresh")),
      coverage: known.length,
      temperature_coverage: active ? temps.length : 0,
      pack_v: active ? total : null,
      pack_a: active ? this.current : null,
      spread_mv: active
        ? (Math.max(...known) - Math.min(...known)) * 1000
        : null,
      min_v: active ? Math.min(...known) : null,
      max_v: active ? Math.max(...known) : null,
      unmeasured_v: active && this.profile.expected_count !== null ? 0 : null,
      frame_count: this.frames,
      last_rx_age: active ? 0.1 : null,
      error: null,
      outside_profile_bricks: [],
      isolation_kohm: null,
      scenario: this.scenario,
    };
  }
}
