"""Local browser interface. This application never sends CAN frames."""

import argparse
import asyncio
import csv
import io
import math
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

import can
from aiohttp import web

from .decoder import Decoder, PROFILES

STATIC = Path(__file__).parent / "static"


class Connection:
    def __init__(self):
        self.decoder = Decoder()
        self.mode = None
        self.status = "disconnected"
        self.error = None
        self.task = None
        self.bus = None
        self.channel = None
        self.lock = asyncio.Lock()
        self.profile_id = "legacy96"
        self.capacity_kwh = 85
        self.session_id = str(uuid.uuid4())
        self.demo_current = 0
        self.scenario = "balanced"

    async def disconnect(self):
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None
        if self.bus:
            await asyncio.to_thread(self.bus.shutdown)
            self.bus = None
        self.status = "disconnected"
        # A disconnected display must not look live or mix with the next pack.
        self.decoder = Decoder(profile_id=self.profile_id)

    async def connect(self, mode, channel, profile_id="legacy96", capacity_kwh=85):
        await self.disconnect()
        self.profile_id, self.capacity_kwh = profile_id, capacity_kwh
        self.decoder = Decoder(profile_id=profile_id)
        self.session_id = str(uuid.uuid4())
        self.demo_current = 0
        self.mode, self.channel, self.error = mode, channel, None
        if mode == "demo":
            self.status = "demo"
            self.task = asyncio.create_task(self.demo())
            return
        options = {"interface": mode, "channel": channel, "ignore_config": True}
        if mode == "pcan":
            options.update(bitrate=500000, state=can.BusState.PASSIVE)
        # SocketCAN bitrate/controller listen-only belongs to Linux interface
        # configuration. Opening a socket does not change the controller mode.
        try:
            self.bus = await asyncio.to_thread(can.Bus, **options)
        except Exception as error:
            self.status, self.error = "error", str(error)
            return
        self.status = "listening"
        self.task = asyncio.create_task(self.receive())

    async def receive(self):
        try:
            while True:
                pending = asyncio.create_task(asyncio.to_thread(self.bus.recv, 0.2))
                try:
                    message = await asyncio.shield(pending)
                except asyncio.CancelledError:
                    # A worker thread cannot be cancelled. Finish its bounded
                    # read before the caller closes the hardware handle.
                    try:
                        await pending
                    except Exception:
                        pass
                    raise
                if message is not None:
                    self.decoder.feed(message)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self.status, self.error = "error", str(error)
            await asyncio.to_thread(self.bus.shutdown)
            self.bus = None

    async def demo(self):
        tick = 0
        while True:
            total = 0
            current_bytes = round(self.demo_current * 10).to_bytes(2, "little", signed=True)
            self.decoder.feed(can.Message(arbitration_id=0x102, data=bytes(2) + current_bytes + bytes(4), is_extended_id=False))
            for mux in range(32):
                if mux < 24:
                    values = [3.85 + 0.006 * math.sin((mux * 4 + k) * 0.4)
                              - self.demo_current * (0.00025 + ((mux * 4 + k) % 10) * 0.00001)
                              - (0.08 if self.scenario == "imbalance" and mux * 4 + k == 41 else 0)
                              for k in range(4)]
                    values = [v if mux * 4 + k < self.decoder.profile["brick_count"] else 0
                              for k, v in enumerate(values)]
                    total += sum(values)
                    raw = [round(v / (5 / 16384)) for v in values]
                else:
                    raw = [round((22 + (mux - 24) * 0.2) / 0.0122)] * 4
                bits = sum(v << (14 * k) for k, v in enumerate(raw))
                self.decoder.feed(can.Message(arbitration_id=0x6F2,
                    data=bytes([mux]) + bits.to_bytes(7, "little"), is_extended_id=False))
            self.decoder.feed(can.Message(arbitration_id=0x102,
                data=round(total * 100).to_bytes(2, "little") + current_bytes + bytes(4), is_extended_id=False))
            # Synthetic learned-capacity fixture; not a new-pack SOH baseline.
            demo_ah = {60: 154.2, 70: 183.1, 75: 195.4, 85: 222.8, 90: 238.1, 100: 270.2}.get(self.capacity_kwh, 200.0)
            raw_cac = round(demo_ah * 10)
            self.decoder.feed(can.Message(arbitration_id=0x7E2,
                data=[0, 0, (raw_cac & 0xF) << 4, raw_cac >> 4, 0, 0, 0, 0], is_extended_id=False))
            tick += 1
            await asyncio.sleep(1)

    def snapshot(self):
        return {**self.decoder.snapshot(), "mode": self.mode, "channel": self.channel,
                "session_id": self.session_id, "capacity_kwh": self.capacity_kwh,
                "captured_at_utc": datetime.now(timezone.utc).isoformat(),
                "scenario": self.scenario,
                "status": self.status, "error": self.error, "application_tx": False,
                "controller_mode": "passive requested" if self.mode == "pcan" else
                "externally configured" if self.mode == "socketcan" else "no hardware"}


@web.middleware
async def local_only(request, handler):
    # Reject DNS rebinding and cross-site requests to a local hardware service.
    host = request.host
    if not re.fullmatch(r"(?:127\.0\.0\.1|localhost)(?::[0-9]+)?", host):
        raise web.HTTPForbidden(text="Local host required")
    if request.method == "POST" and request.headers.get("Origin") != f"http://{host}":
        raise web.HTTPForbidden(text="Same-origin request required")
    response = await handler(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
    return response


def create_app(connection=None):
    connection = connection or Connection()
    app = web.Application(middlewares=[local_only], client_max_size=4096)

    async def state(request):
        return web.json_response(connection.snapshot())

    async def connect(request):
        try:
            body = await request.json()
        except ValueError:
            raise web.HTTPBadRequest(text="Expected a JSON object")
        if not isinstance(body, dict):
            raise web.HTTPBadRequest(text="Expected a JSON object")
        mode, channel = body.get("mode"), body.get("channel", "")
        profile_id = body.get("profile_id", "legacy96")
        capacity = body.get("capacity_kwh", 85)
        if not isinstance(profile_id, str) or profile_id not in PROFILES or isinstance(capacity, bool) or not isinstance(capacity, (int, float)) or not 60 <= capacity <= 100:
            raise web.HTTPBadRequest(text="Choose a legacy profile and capacity between 60 and 100 kWh")
        if mode not in ("demo", "pcan", "socketcan") or not isinstance(channel, str):
            raise web.HTTPBadRequest(text="Choose Demo, PCAN or SocketCAN")
        pattern = r"PCAN_USBBUS(?:[1-9]|1[0-6])" if mode == "pcan" else r"[A-Za-z0-9_.-]{1,32}"
        if mode != "demo" and not re.fullmatch(pattern, channel):
            raise web.HTTPBadRequest(text="Invalid CAN channel")
        if mode != "demo" and body.get("profile_confirmed") is not True:
            raise web.HTTPBadRequest(text="Confirm pack/profile and bus settings before live use")
        async with connection.lock:
            await connection.connect(mode, channel, profile_id, capacity)
        return web.json_response(connection.snapshot())

    async def disconnect(request):
        async with connection.lock:
            await connection.disconnect()
        return web.json_response(connection.snapshot())

    async def demo_options(request):
        if connection.mode != "demo" or connection.status != "demo":
            raise web.HTTPForbidden(text="Synthetic demo only; no physical load control exists")
        try:
            body = await request.json()
        except ValueError:
            raise web.HTTPBadRequest(text="Expected demo settings as JSON")
        if not isinstance(body, dict) or body.get("current_a", 0) not in (0, 50) or body.get("scenario", "balanced") not in ("balanced", "imbalance"):
            raise web.HTTPBadRequest(text="Invalid demo settings")
        connection.demo_current = body.get("current_a", connection.demo_current)
        connection.scenario = body.get("scenario", connection.scenario)
        return web.json_response(connection.snapshot())

    async def export(request):
        state = connection.snapshot()
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(["timestamp_utc", "mode", "status", "pack_v", "pack_a", "coverage"]
                        + [f"brick_{i+1}_v" for i in range(len(state["bricks"]))]
                        + [f"temp_{i+1}_c" for i in range(len(state["temps"]))])
        writer.writerow([datetime.now(timezone.utc).isoformat(), state["mode"], state["status"],
                         state["pack_v"], state["pack_a"], state["coverage"]]
                        + state["bricks"] + state["temps"])
        return web.Response(text=output.getvalue(), content_type="text/csv", headers={
            "Content-Disposition": 'attachment; filename="tesla-bms-snapshot.csv"'})

    async def index(request):
        return web.FileResponse(STATIC / "index.html")

    async def profiles(request):
        return web.json_response(list(PROFILES.values()))

    async def cleanup(app):
        await connection.disconnect()

    app.router.add_get("/", index)
    app.router.add_get("/api/state", state)
    app.router.add_get("/api/profiles", profiles)
    app.router.add_post("/api/connect", connect)
    app.router.add_post("/api/disconnect", disconnect)
    app.router.add_post("/api/demo", demo_options)
    app.router.add_get("/api/snapshot.csv", export)
    app.router.add_static("/static", STATIC)
    app.on_cleanup.append(cleanup)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    web.run_app(create_app(), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
