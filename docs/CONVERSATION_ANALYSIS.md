# Conversation analysis and evidence

## What the conversation establishes

The goal is to read each cell-group voltage on a pre-2016 Tesla Model S bench battery using an existing PCAN-USB. The discussion explored Windows and then Linux. Its final action was to inspect `teslamon.py` before running it. It does not establish successful adapter detection, received CAN traffic or decoded live values.

The pasted file refers to two screenshots but does not include their pixels. Historical Ubuntu version, USB inventory and typing-error claims are previous assistant interpretations, not independently verified observations here.

## Current source inspection

[jetpax/PiCanScanMyTesla](https://github.com/jetpax/PiCanScanMyTesla), commit `4e7f0e79fcdfdc8b32b132ef556158cf83efee83`, inspected 2026-10-28:

- MIT permits a derivative with license/copyright preservation.
- Upstream describes Raspberry Pi operation and observed legacy Model S 85/90 behavior.
- Installer targets CANable/slcan, `/dev/ttyACM0`, Linux services and `/opt/teslamon`.
- Receiver hard-codes SocketCAN `can0`; this is different from Windows PCAN-Basic support.
- Decoder describes 96 brick voltages/32 temperatures in `0x6F2` and pack readings in `0x102`.
- Original app automatically sends a `0x555` keepalive.
- Original code also exposes diagnostic security/fault operations and vehicle emulation capable of commanding contactor closure. The pasted discussion's simple monitor description missed this.
- Original web server binds all network interfaces. The new app uses loopback only.

## Corrections to preserve

1. Cell-group monitoring does not measure each physical cell independently.
2. Having PCAN does not establish driver installation, access to the bus or pack compatibility.
3. Missing `pcan` in `lsmod` does not prove missing adapter support: Linux can use in-kernel `peak_usb`/SocketCAN.
4. A sleeping bench BMS may remain silent during passive listening. Do not call silence a failed pack or quietly turn on transmission.
5. A receive-only Python app and a controller in hardware listen-only mode are different guarantees.
6. Upstream wiring/repair notes do not establish the owner's connector revision/orientation, electrical state or safe procedure.
7. Normal displayed voltage or small spread does not establish safety, repair success or usable capacity.

## Primary references

- [Upstream source](https://github.com/jetpax/PiCanScanMyTesla)
- [License at inspected revision](https://github.com/jetpax/PiCanScanMyTesla/blob/4e7f0e79fcdfdc8b32b132ef556158cf83efee83/LICENSE)
- [python-can PCAN channel/passive mode/bitrate](https://python-can.readthedocs.io/en/stable/interfaces/pcan.html)
- [python-can SocketCAN and Linux PCAN](https://python-can.readthedocs.io/en/stable/interfaces/socketcan.html)
- [GitHub fork permissions/visibility](https://docs.github.com/en/pull-requests/reference/forks)
- [GitHub personal repository permissions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository)
- [Reported personal-repository role discrepancy](https://github.com/github/docs/issues/45537): actual invitation/permission read-back must decide the granted role.

The private pasted conversation remains in its authorized local context. It is not included in this public repository.
