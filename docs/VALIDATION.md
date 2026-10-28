# Foundation validation — 2026-10-28

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
