# Tesla BMS Studio

A local interface for reading legacy Tesla Model S battery brick voltages through a PCAN-USB adapter. Independent project owned by [DaniilKi](https://github.com/DaniilKi), forked from [jetpax/PiCanScanMyTesla](https://github.com/jetpax/PiCanScanMyTesla). Original MIT license and attribution are preserved.

**Status: working software foundation; physical PCAN/battery compatibility has not been verified.**

## Start the new app

Requires Python 3.10 or newer. No administrator account or battery is needed for the demo.

Windows PowerShell:

```powershell
git clone https://github.com/DaniilKi/tesla-bms-studio.git
cd tesla-bms-studio
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m studio.app
```

Linux:

```bash
git clone https://github.com/DaniilKi/tesla-bms-studio.git
cd tesla-bms-studio
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m studio.app
```

Open **http://127.0.0.1:8080** and click **Start demo**. Stop the server with Ctrl+C. Use `--port 8081` if the default port is occupied.

## What works

- Demo with synthetic CAN-format data; no CAN device is opened.
- Connection form for Linux SocketCAN (`can0`) and Windows PCAN-Basic (`PCAN_USBBUS1`).
- 96 brick readings, 32 temperatures, pack voltage, minimum/maximum, spread and coverage.
- Missing/stale readings, with individual signals expiring after 45 seconds.
- CSV snapshot export, tagged with its source mode and connection state.
- Localhost-only service. No cloud, accounts or telemetry.

The app starts disconnected. It never sends application CAN frames. PCAN opens with `BusState.PASSIVE`. SocketCAN uses the existing Linux controller configuration; opening a socket does **not** enforce hardware listen-only or set bitrate. The operator must verify those settings outside the app. A sleeping bench BMS may remain silent; silence alone is not a failed battery or adapter.

For Windows, install the official PEAK driver and matching PCAN-Basic runtime separately. For Linux, use an existing SocketCAN interface and verify controller configuration. This app does not install drivers or change system networking. The initial profile assumes classic 11-bit CAN and 500 kbit/s, based on upstream observations for legacy Model S 85/90 packs. Exact pack compatibility remains to be established.

## Project documents

- [Project definition, terminology and acceptance](docs/PROJECT.md)
- [Conversation analysis and source verification](docs/CONVERSATION_ANALYSIS.md)
- [Implementation plan and current status](docs/ROADMAP.md)
- [Contribution and access plan](CONTRIBUTING.md)
- [Original upstream README](docs/UPSTREAM_README.md)

## Legacy files

Root `teslamon.py`, `index.html`, `install.sh`, `systemd/` and `NOTES.md` are retained upstream code/reference material. They are **not the new app's entry point**. The original program includes automatic wake transmissions, diagnostic security access, fault clearing and vehicle emulation capable of commanding contactor closure. Do not use its installer to launch this receive-only app. Upstream repair and wiring observations are not validated instructions for your specific pack.

## Verify

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

On Linux, use `.venv/bin/python` instead. Tests cover decoding, invalid/stale signals, input boundaries, demo isolation, PCAN passive initialization, disconnect and simulated CAN reception. Hardware testing is separate.

## License

[MIT](LICENSE), including the original copyright. Independent fork, not an official Tesla product. Owning this fork does not transfer exclusive ownership of the original author's code.
