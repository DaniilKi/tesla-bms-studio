# Development plan

## Version 0.3 — daily interface, Ah and VSH

- [x] Compact summary, separate task tabs and hover/keyboard/tap help.
- [x] Verified public legacy CAC-min field, freshness and raw-code export.
- [x] Recorded signed-current Ah with gap detection; no automatic SOH/full-capacity claim.
- [x] Seven-channel VSH map per BMB; explicit demo/local CSV provenance and units.
- [x] Keep VSH separate from voltage, group ΔV/ΔI and HV isolation.
- [ ] Verify exact-pack live CAC behavior against a trusted diagnostic source.
- [ ] Obtain and validate a live VSH decoder before adding hardware VSH readings.
- [ ] Add individual-group CAC only after its mapping is verified; minimum alone is implemented.


## Version 0.2 — expanded scope

- [x] Independent 60/70/75/85/90/100 kWh metadata and 83/84/96/unknown series profiles.
- [x] Apparent group resistance estimator, quality reasons and before/after CSV export/import.
- [x] Explicit separation of group R, VSH and HV isolation; no invented direct BMS R signal.
- [x] Windows/Linux launchers and shared static browser UI.
- [x] Browser-only online demo built from the same interface.
- [ ] Physical acceptance for each exact pack/protocol/driver combination; see MULTIPACK_AND_RESISTANCE.md.

## Foundation delivered

- [x] Owned fork, upstream history and MIT attribution.
- [x] Project definition, terminology and evidence limits.
- [x] Local browser app with demo, receive-only backends and connection form.
- [x] 96-brick map, temperature pairs, coverage and stale-data handling.
- [x] Timestamped CSV snapshot with source mode.
- [x] Automated decoding, API, PCAN initialization and simulated transport checks.

## Hardware acceptance — next substantive milestone

- [ ] Confirm pack capacity/revision and protocol profile.
- [ ] Confirm host/OS. Historical Ubuntu 16.04 is not a supported baseline; use Python 3.10+.
- [ ] Verify adapter enumeration, driver/runtime and selected channel.
- [ ] Independently verify low-voltage connection and controller bitrate/listen-only.
- [ ] Check whether frames arrive without wake traffic; silence alone is not failure.
- [ ] Verify applicable 96/32 coverage and compare representative measurements with an independent trusted source.
- [ ] Exercise reconnect, unplug, stale readings and driver errors on physical hardware.
- [ ] Retain a sanitized local acceptance record; no private capture in public Git by default.

## Usability after acceptance

- [ ] Adapter discovery and platform-specific prerequisites.
- [ ] Second-machine setup check with the friend.
- [ ] Russian/English selection if wanted.
- [ ] Recording/replay with explicit source and freshness.
- [ ] Per-brick history and session comparison without automatic repair conclusions.
- [ ] Validate additional broadcast health fields.
- [ ] Consider opt-in wake only after pack/frame verification; preserve receive-only default.
- [ ] Packaged launcher after proving the supported hardware/OS path.

## Collaboration dependency

- [x] Verify friend's account: `GragTesla-blip`.
- [x] Send contributor invitation; GitHub rejected `admin`, then accepted `push` as a pending invitation with permission `write` (2026-10-28).
- [x] Read back pending invitation with permission `write`.
- [ ] Friend accepts; verify active collaborator permission. Invitation and acceptance are separate states.

These dependencies do not block interface development. They do block claims of working physical diagnostics or completed contributor access.
