# Contributing

Read [the project definition](docs/PROJECT.md) and run the README demo first.

Use a topic branch for a coherent change. Keep transport, decoding and UI separate. Run `python -m unittest discover -s tests -v` in the project environment. Add meaningful regression checks for protocol, freshness and hardware boundaries. Report validation and physical-hardware limits in pull requests.

The new entry point is `python -m studio.app`. Original `teslamon.py`/`install.sh` include transmission/control behavior and are not part of this app's receive-only contract.

Do not add CAN send paths, fault clearing, contactor commands or wake traffic incidentally while editing the interface. A deliberate feature needs protocol evidence, explicit UI wording and separate acceptance. Preserve MIT attribution.

Do not commit private captures, serial numbers, VINs, authentication or source conversations. Prefer synthetic fixtures. Recording is a future feature; current CSV export is one snapshot.

## Friend's access

On 2026-10-28, `GragTesla-blip` was invited with read/write collaborator access. GitHub rejected the requested `admin` role for this personal repository; the pending invitation was read back with permission `write`. Acceptance is not yet confirmed. Read back the accepted permission before reporting active access. The personal repository remains owned by DaniilKi.
