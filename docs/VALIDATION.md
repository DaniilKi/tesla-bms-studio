# Foundation validation — 2026-10-28

## Version 0.2: cross-platform and hosted demo

- 21 Python tests and 17 Node analysis/CSV tests passed locally.
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

No driver installation, hardware configuration, CAN wake transmission, contactor operation or fault clearing was performed. No website/cloud deployment was made. The GitHub repository is public source code; the app runs locally.
