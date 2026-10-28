# Development plan

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

- [ ] Obtain friend's GitHub username and verify the account.
- [ ] Invite to this fork with requested full repository access where supported.
- [ ] Read back pending role, then accepted permission. Invitation and acceptance are separate states.

These dependencies do not block interface development. They do block claims of working physical diagnostics or completed contributor access.
