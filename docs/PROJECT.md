# Project definition — Tesla BMS Studio

Defined: 2026-10-28. Working name; branding can change without changing the scope.

## Purpose

Build an approachable local diagnostic app for a legacy Tesla Model S battery removed from the vehicle and connected through the owner's PEAK PCAN-USB. Replace terminal-heavy setup with a clear connection workflow and useful voltage/temperature views. Help an operator inspect BMS readings and identify patterns requiring investigation, without presenting observations as a conclusive battery diagnosis.

## User intent and requirements

- Start an independently developed app on top of PiCanScanMyTesla.
- Keep an owned GitHub fork with upstream history and MIT attribution.
- Read voltages for each series-connected cell group through BMS/CAN.
- Target a pre-2016 Model S bench battery and an existing PCAN-USB.
- Provide a practical interface for someone uncomfortable with terminal commands.
- Collaborate with `GragTesla-blip`. The owner requested full repository access; current invitation status is recorded below.
- Preserve scope and unresolved decisions so development can continue without reconstructing the conversation.

Specific battery capacity, part number, BMS firmware, actual host OS and successful adapter detection are not confirmed. The pasted discussion switched from Windows to Linux and referred to Ubuntu 16.04 screenshots; those screenshots were not included. Do not turn that earlier assistant interpretation into verified inventory.

## Definitions

| Term | Definition in this project |
| --- | --- |
| Physical cell | One electrochemical cell. Not individually measured by this app. |
| Brick / cell group | Parallel cells measured together as one series-group voltage. The primary display unit. |
| Module | Assembly containing multiple bricks and monitoring electronics. The initial profile groups six bricks per module. |
| BMB | Module monitoring board; measures local voltages/temperatures. |
| BMS | Battery management system; supplies the available CAN readings. |
| PCAN-USB | PEAK USB-to-CAN hardware adapter, not the decoder or display app. |
| SocketCAN | Linux CAN networking interface, such as `can0`. PCAN adapters can be exposed through it. |
| PCAN-Basic | PEAK API/runtime used by the Windows `python-can` PCAN backend. |
| Application receive-only | App does not call CAN transmit methods. This alone does not prove controller listen-only. |
| Controller listen-only | Adapter/controller mode avoiding active CAN participation; requested through PCAN passive mode or configured externally for SocketCAN. |
| Wake heartbeat | Application CAN transmission used upstream to wake the BMS. Absent from this starter. |
| Stale reading | Previously valid signal that has not refreshed within 45 seconds. Blank with a stale marker. |
| Missing reading | No valid value has arrived in the current session. |
| Spread | Maximum minus minimum among fresh brick readings, in mV. Coverage must accompany it. |
| Pack minus brick sum | Numerical comparison requiring 96 fresh bricks and fresh pack voltage. Not an automatic fault diagnosis. |
| Demo | Generated readings with no physical CAN connection. Always visibly labeled. |

## Initial compatibility profile

Legacy Model S 85/90 profile derived from upstream observations: 96 bricks, 32 temperatures, classic 11-bit CAN, 500 kbit/s. Pre-2016 manufacture alone does not establish compatibility. Other capacities, revisions and Model 3/Y protocols are not covered by this assumption.

The first version decodes broadcasts `0x6F2` and `0x102`. Other upstream health fields are candidates for validation, not implemented features.

## Connection experience

1. Start the local app; hardware remains disconnected.
2. Choose Demo, Linux SocketCAN or Windows PCAN-Basic.
3. For hardware, select the channel and confirm pack/profile, low-voltage connection and bus settings.
4. Connect. Show adapter errors plainly; never substitute demo after a hardware failure.
5. Distinguish connection state, received frames and decoded coverage. An opened adapter does not prove a responding BMS.
6. Display units, source mode and freshness. Missing data must not become zero.
7. Export a timestamped CSV snapshot. Disconnect clears data so readings cannot carry into another pack.

For a silent bench BMS, explain the absence of wake transmission. An opt-in wake mode may be considered after the pack and frame behavior are verified. Do not add it implicitly while polishing the interface.

## Architecture

```text
PCAN-USB → SocketCAN (Linux) or PCAN-Basic (Windows)
         → python-can receive loop → per-signal decoder/state
         → localhost aiohttp API → browser interface / CSV snapshot

Synthetic frame generator → same decoder → visibly labeled demo
```

Python 3.10+, `python-can`, `aiohttp` and plain HTML/CSS/JavaScript. Reuse upstream protocol knowledge and dependencies without carrying its transmit/control routes into the new server. Separate UI from transport/decoding so another adapter or desktop wrapper can follow.

## Exclusions

- Contactor control, HVIL bypass, vehicle emulation and arbitrary CAN transmission.
- BMS security unlocking, fault clearing, flashing, coding or programming.
- Automated repair recommendations or claims that normal readings establish safety.
- Individual physical-cell measurement, unsupported packs and guaranteed state-of-health estimates.
- Cloud hosting, remote hardware control, paid infrastructure, telemetry and shared captures.

## Acceptance

- Fork belongs to DaniilKi; original history/license remain traceable.
- New contributor can run a hardware-free demo using the README.
- Startup and demo do not initialize CAN hardware. Live connection is explicit.
- New app has no transmit/control routes; driver failures remain visible.
- Tests cover mapping/scales, signed temperatures, invalid markers and independent expiration.
- Incomplete coverage prevents a misleading full brick sum or pack comparison.
- Browser checks cover demo/disconnect, connection choices, desktop/mobile and CSV access.
- Separate hardware acceptance establishes adapter detection, channel, bus settings, exact pack/profile, fresh coverage and comparison with an independent trusted reading source.
- Friend's invitation and accepted permission are verified before reporting full access granted.

## Ownership and access

Repository: https://github.com/DaniilKi/tesla-bms-studio — public, as a fork of public upstream. Do not commit private captures, serial numbers, VINs, credentials or the private source conversation.

Requested friend role: full repository access. On 2026-10-28, GitHub rejected assigning `admin` to `GragTesla-blip` on this personal repository. A read/write collaborator invitation was then sent and read back with permission `write`; acceptance is pending. This permits code contributions after acceptance but does not grant owner/admin control. Do not create an organization or transfer ownership without a separate request.
