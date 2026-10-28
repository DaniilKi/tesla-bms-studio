# Foundation validation — 2026-10-28

## Version 0.3: daily interface, capacity and VSH

- 29 Python + 23 Node tests passed locally: legacy CAC mapping/freshness/raw-code handling, current integration/sign crossings/gaps, VSH units/missing/duplicate channels, 112-channel demo provenance, and existing receive-only/API/resistance checks.
- Browser QA passed on the static hosted build at 1440×1100 and 390×844, with no horizontal overflow or page errors. All four tabs, hover hints, Escape, mobile hint bounds, CSV VSH roundtrip, capacity CSV download and 96/96 apparent-resistance regression were exercised.
- Local Python UI: 100 kWh metadata with independent 84-group profile returned CAC demo 270.2 Ah; current-step recording advanced the session counter; demo VSH rendered 14×7 channels. Disconnect cleared CAC/session/VSH. Hardware selection without confirmation stayed disconnected with no VSH values. Keyboard hints and repeat-click dismissal passed.
- Numeric examples above are synthetic fixtures, not measured pack results. Live VSH decoding and physical CAC agreement remain unverified.
- Platform CI and publication receipts are recorded after their live read-back in this file and DEPLOYMENT.md.

## Version 0.2: cross-platform and hosted demo

- 21 Python tests and 17 Node analysis/CSV tests passed locally.
- A later repeat on Windows exposed a test-only fixed-40-ms scheduling assumption in the fake-PCAN receive check. The test now waits for actual decoded coverage with a bounded 3-second deadline; the same condition-based wait is used for asynchronous demo/virtual reception. Protocol behavior and receive-only safeguards are unchanged.
- **Final platform verification:** [run 40759080275](https://github.com/DaniilKi/tesla-bms-studio/actions/runs/40759080275) completed successfully on both Windows and Ubuntu against `ec83370807d99607c4906e76ff10c1754e03789d`. Each platform passed all 21 Python and 17 Node tests, compilation and demo build. Subsequent changes only record receipts in documentation.
- [GitHub Actions run](https://github.com/DaniilKi/tesla-bms-studio/actions/runs/40757343783): both `software (windows-latest)` and `software (ubuntu-latest)` completed successfully against application commit `02a35387b5147e52ead29b41dacb1bb815ea2797`. Each ran the 21 + 17 tests, compilation and static demo build.
- Profile coverage checks include 83, 84, 96 and unknown counts; 60/70/75/85/90/100 metadata is tested independently. An out-of-profile channel suppresses the full-pack sum comparison.
- Hosted-build browser demo: 96/96 group resistance estimates after the synthetic 0→50 A step; first group approximately 0.250 mΩ, correctly tagged synthetic. CSV was downloaded and its headers/source/raw pair verified.
- Local Python demo at 100 kWh metadata + independent 84-group profile showed 84/84; its A/B pair produced 84 resistance estimates.
- The two local sample exports were imported into the browser-only demo and again produced 84/84 estimates, with no upload API. Thus the local and hosted analysis paths share the same calculator.
- Desktop 1440×1100 and phone 390×844 had no horizontal overflow; screenshots were inspected. Normal demo operation had no console errors.
- New public Site deployment succeeded; unauthenticated dashboard/runtime returned HTTPS 200 with no sign-in redirect. See [deployment receipt](DEPLOYMENT.md).

Physical hardware, calibration, BMS/pack revision compatibility and actual CAN timing remain unverified. Software tests on Windows/Linux are not hardware acceptance for every 60–100 kWh battery. Direct group resistance from BMS is not implemented; the exported result is a screened apparent ΔV/ΔI estimate.

## Software evidence

Environment used for this run: Windows, Python 3.10, python-can 4.6.1, aiohttp 3.14.5.

- 15 automated tests passed: decoder mapping/scaling, signed and zero temperatures, invalid markers, per-signal expiration, pack invalid/stale values, unsupported frame types, full-coverage comparisons, disconnected startup, demo/export/disconnect, local-origin restrictions, input validation, visible driver errors, absent legacy control routes, requested PCAN passive mode and virtual CAN reception.
- `pip check`: no broken requirements.
- JavaScript syntax and Python compilation checks passed.
- Browser demo: 96 fresh bricks and 32 temperature channels; no console errors during normal demo operation.
- Desktop viewport: 1440 × 1100; phone viewport: 390 × 844. Both had page width equal to viewport width, with no horizontal overflow. Screenshots visually inspected.
- Browser disconnect cleared coverage to zero.
- PCAN selection populated `PCAN_USBBUS1`; unconfirmed live connection stayed disconnected and displayed the prerequisite message.
- Simulated browser offline state replaced displayed readings with blanks; reconnection restored the controls. Network errors during this deliberate offline check are expected.
- Export API produced a two-row CSV snapshot (header + data), including source mode and 96/32 channels.

## Limits

No physical PCAN adapter, PEAK runtime, Linux SocketCAN controller or Tesla pack was tested in this acceptance run. PCAN initialization was checked with a fake receive-only adapter; transport reception also used python-can's virtual bus. These tests do not establish wiring, adapter firmware behavior, hardware listen-only, BMS wake behavior, protocol compatibility or measurement accuracy on a real battery.

No driver installation, hardware configuration, CAN wake transmission, contactor operation or fault clearing was performed. This original foundation checkpoint preceded website publication; subsequent hosted releases are recorded above and in DEPLOYMENT.md.
