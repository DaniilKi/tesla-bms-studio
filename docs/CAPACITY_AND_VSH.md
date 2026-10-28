# Capacity, VSH and the daily dashboard — v0.3

The supplied screenshot shows `BMS_TVSH_BMBxx_R0` through `R6` with mOhm units. No Ah field, current history or capacity calculation is visible. The defensible interpretation is voltage-sense harness resistance, supported by the diagnostic developer's separate descriptions of VSH and brick CAC. It cannot establish battery capacity or the internal resistance of a physical cell.

The unusually high channel should invite investigation of the sensing path and confirmation against the original tool. A screenshot alone cannot prove the cause or provide a universal fault threshold. The app highlights the maximum in the loaded dataset, with no automatic failed-cell diagnosis. The user's image and actual measurements are not included in the public repository or demo.

## Three different measurements

| Measurement | Meaning | Placement and implementation |
| --- | --- | --- |
| BMS CAC min, Ah | BMS minimum learned group capacity estimate | Summary card plus Capacity tab; legacy CAN decoding and dedicated CSV |
| Session throughput, Ah | Recorded charge movement, `Q = integral(I dt) / 3600` | Capacity tab with separate raw-positive/raw-negative counters, checked polarity and gap quality |
| VSH, mOhm | Voltage-sense harness resistance, seven channels R0–R6 per BMB | Separate VSH tab, module map, CSV import/export and synthetic demo |

The existing apparent group resistance `-delta V / delta I` stays in its own tab. It describes the group's response during a screened pair of observations; it is neither VSH nor capacity. HV isolation remains a separate CAN detail in kOhm.

An Ah counter after a short session is not the full capacity. A capacity test needs documented endpoints and conditions, valid current calibration and complete recording. Nominal kWh does not supply a universal Ah/SOH baseline: energy depends on voltage over the discharge. We do not divide advertised kWh by instantaneous voltage or infer Ah from VSH. Minimum CAC alone does not provide an individual-group capacity map.

## Verified legacy field and explicit limits

Primary public implementation, pinned to Battery-Emulator commit `83e124003adff5abe553478acb00672addd13347`:

- CAN `0x7E2`, mux byte 0 equals 0.
- Unsigned little-endian bits 20–31, scale 0.1 Ah per bit.
- `raw = ((data[2] >> 4) & 0x0F) | (data[3] << 4)`.
- Example bytes `00 00 C0 90` give raw 2316 and 231.6 Ah. This example is a decoder check, not a new-pack baseline.
- A reading expires after 45 seconds independently of other signals. No reading means no number.
- A protocol-defined unavailable marker was not established. Raw `0xFFF` is preserved but withheld as an unverified maximum code; the app does not claim Tesla defines it as SNA.
- No verified live raw-CAN/UDS mapping for the screenshot's exact VSH fields was found. Hardware mode returns no VSH dataset. The app does not send diagnostic requests or wake traffic to obtain it.

An available mapping in another open-source project is evidence for software decoding, not physical validation for every 60–100 kWh pack. Exact revision and live readings still require hardware acceptance.

## Recording and files

Python and browser demo integrate successive valid current samples with the trapezoidal rule. Sign crossings split positive and negative areas. Intervals over 1.5 seconds, invalid current and a missing tail are excluded and reported as gaps. Connecting or disconnecting resets the session. No full-capacity or SOH percentage is generated.

Capacity CSV separates `cac_min_ah`, its raw code and quality from `positive_current_ah` / `negative_current_ah`, valid duration, gaps, source, session, profile, polarity and integration method. Selecting polarity relabels throughput; it does not change raw signed totals.

VSH CSV requires `signal,value,unit`, optionally `measured_at_utc,source`. Supported channels: BMB01–16, R0–6. Units are explicit `mOhm`/`Ohm` (also their supported symbols); Ohm converts to mOhm. Duplicate channels, invalid values and ambiguous units are rejected. Missing values remain missing; missing measurement time remains unknown. Exported demo data remains tagged demo when imported. Imports stay in the browser and are never treated as newly measured live data or merged into the active pack.

## Daily-use design

Default: connection controls, four readings, voltage map. VSH, Capacity and apparent resistance are separate tabs. Setup details, chart and CAN details collapse. Explanations use `?` hints available on hover, keyboard focus and tap, dismissible by Escape/outside click. Source badges, missing data, profile warnings and connection errors remain visible. This keeps essential quality context available without repeating paragraphs across the screen.

## Primary sources

- [VoltDecode diagnostic developer: separate brick CAC and VSH features](https://www.voltdecode.cloud/).
- [Pinned legacy CAC decoder](https://github.com/dalathegreat/Battery-Emulator/blob/83e124003adff5abe553478acb00672addd13347/Software/src/battery/TESLA-LEGACY-BATTERY.cpp#L164).
- [Pinned upstream legacy decoder tests](https://github.com/dalathegreat/Battery-Emulator/blob/83e124003adff5abe553478acb00672addd13347/test/battery/TeslaLegacyBatteryTest.cpp#L8).
- [Texas Instruments: current integration and capacity/gauging context](https://www.ti.com/jp/lit/pdf/sluaar3).
- [Tesla service manual: CAC terminology and capacity balancing](https://service.tesla.com/docs/Model3/ServiceManual/2024/en-us/GUID-E5D5D11C-28E3-4E83-8710-EA8854AF9AE1.html). Terminology support only; Model 3 protocol is not implemented here.
