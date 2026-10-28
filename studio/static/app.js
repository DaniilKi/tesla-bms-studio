const $ = (id) => document.getElementById(id);
const tiles = [];
const temperatures = [];
for (let moduleIndex = 0; moduleIndex < 16; moduleIndex++) {
  const card = document.createElement("article");
  card.className = "module";
  const heading = document.createElement("div");
  heading.className = "module-heading";
  const title = document.createElement("b");
  title.textContent = `MODULE ${String(moduleIndex + 1).padStart(2, "0")}`;
  const temperature = document.createElement("span");
  temperature.textContent = "— °C";
  temperatures.push(temperature);
  heading.append(title, temperature);
  const grid = document.createElement("div");
  grid.className = "bricks";
  for (let k = 0; k < 6; k++) {
    const index = moduleIndex * 6 + k;
    const tile = document.createElement("div");
    tile.className = "brick";
    const label = document.createElement("span");
    label.textContent = `B${String(index + 1).padStart(2, "0")}`;
    const value = document.createElement("div");
    value.textContent = "—";
    tile.append(label, value);
    grid.append(tile);
    tiles.push({ tile, value });
  }
  card.append(heading, grid);
  $("modules").append(card);
}

let busy = false;
let serverLost = false;
const number = (value, precision = 1) =>
  value == null ? "—" : value.toFixed(precision);
function showError(message) {
  $("error").textContent = message || "";
  $("error").hidden = !message;
}
function modeChanged() {
  const mode = $("mode").value;
  $("hardware").hidden = mode === "demo";
  $("confirmed").checked = false;
  $("channel").value = mode === "pcan" ? "PCAN_USBBUS1" : "can0";
  $("connect").textContent =
    mode === "demo" ? "Start demo ↗" : "Connect · receive only ↗";
  $("driver-note").textContent =
    mode === "pcan"
      ? "Requires the PEAK driver and PCAN-Basic runtime. Adapter passive mode is requested."
      : "Uses an existing Linux CAN interface. Verify 500 kbit/s and controller listen-only outside this app; the app does not configure them.";
}
$("mode").addEventListener("change", modeChanged);
modeChanged();

function render(state) {
  const active = ["demo", "listening"].includes(state.status);
  const labels = {
    disconnected: "Disconnected",
    demo: "Demo running",
    listening: "Listening",
    error: "Connection error",
  };
  $("status").textContent =
    state.status === "listening"
      ? `Listening · ${state.mode} / ${state.channel}`
      : labels[state.status] || state.status;
  $("status").className = `badge${active ? " active" : ""}`;
  $("demo-banner").hidden = state.mode !== "demo" || state.status !== "demo";
  $("disconnect").disabled = busy || !active;
  $("pack").textContent = number(state.pack_v, 2);
  $("spread").textContent = number(state.spread_mv);
  $("coverage").replaceChildren(document.createTextNode(`${state.coverage} `));
  const denominator = document.createElement("i");
  denominator.textContent = "/ 96";
  $("coverage").append(denominator);
  $("temp-coverage").textContent =
    `${state.temperature_coverage} / 32 temperature channels`;
  $("range").textContent =
    `${number(state.min_v, 3)} / ${number(state.max_v, 3)} V`;
  $("difference").textContent = `${number(state.unmeasured_v, 2)} V`;
  $("frames").textContent = state.frame_count.toLocaleString();
  $("age").textContent =
    state.last_rx_age == null
      ? "No frames received"
      : `Last frame ${state.last_rx_age.toFixed(1)} s ago`;
  tiles.forEach(({ tile, value }, i) => {
    const quality = state.brick_state[i];
    tile.className = `brick ${quality}`;
    tile.title = `Brick ${i + 1}: ${quality}`;
    value.textContent = number(state.bricks[i], 3);
  });
  temperatures.forEach((element, i) => {
    const pair = state.temps.slice(i * 2, i * 2 + 2);
    element.textContent = `${number(pair[0])} / ${number(pair[1])} °C`;
  });
  if (state.error) showError(state.error);
}

async function request(path, data) {
  const response = await fetch(
    path,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function action(path, body) {
  busy = true;
  $("connect").disabled = true;
  $("disconnect").disabled = true;
  showError(null);
  try {
    render(await request(path, body));
  } catch (error) {
    showError(error.message);
  } finally {
    busy = false;
    $("connect").disabled = false;
    await poll();
  }
}
$("connection").addEventListener("submit", (event) => {
  event.preventDefault();
  const mode = $("mode").value;
  if (mode !== "demo" && !$("confirmed").checked) {
    showError(
      "Verify the pack/profile and bus configuration before connecting.",
    );
    return;
  }
  action("/api/connect", {
    mode,
    channel: $("channel").value,
    profile_confirmed: $("confirmed").checked,
  });
});
$("disconnect").addEventListener("click", () => action("/api/disconnect", {}));

async function poll() {
  if (busy) return;
  try {
    const state = await request("/api/state");
    if (serverLost) {
      showError(null);
      serverLost = false;
    }
    $("connect").disabled = false;
    render(state);
  } catch (error) {
    serverLost = true;
    $("status").textContent = "Server unavailable";
    $("status").className = "badge";
    $("connect").disabled = true;
    $("disconnect").disabled = true;
    $("demo-banner").hidden = true;
    for (const id of [
      "pack",
      "spread",
      "coverage",
      "range",
      "difference",
      "frames",
    ])
      $(id).textContent = "—";
    $("temp-coverage").textContent = "Readings unavailable";
    $("age").textContent = "Server connection lost";
    tiles.forEach(({ tile, value }) => {
      tile.className = "brick stale";
      value.textContent = "—";
    });
    temperatures.forEach((element) => {
      element.textContent = "— °C";
    });
    showError(
      "Cannot reach the local server. Restart it, then reload this page.",
    );
  }
}
poll();
setInterval(poll, 1000);
