# Contributing

Read [the project definition](docs/PROJECT.md) and run the README demo first.

Use a topic branch for a coherent change. Keep transport, decoding and UI separate. Run `python -m unittest discover -s tests -v` in the project environment. Add meaningful regression checks for protocol, freshness and hardware boundaries. Report validation and physical-hardware limits in pull requests.

The new entry point is `python -m studio.app`. Original `teslamon.py`/`install.sh` include transmission/control behavior and are not part of this app's receive-only contract.

Do not add CAN send paths, fault clearing, contactor commands or wake traffic incidentally while editing the interface. A deliberate feature needs protocol evidence, explicit UI wording and separate acceptance. Preserve MIT attribution.

Do not commit private captures, serial numbers, VINs, authentication or source conversations. Prefer synthetic fixtures. Recording is a future feature; current CSV export is one snapshot.

## Friend's access

Owner requests full repository access; username pending. Verify the exact account, invitation role and eventual accepted permission before reporting completion. Repository admin does not mean shared ownership of the personal GitHub account.
