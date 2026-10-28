"""Local browser interface. This application never sends CAN frames."""

import argparse
import asyncio
import csv
import io
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import can
from aiohttp import web

from .decoder import Decoder

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
        self.decoder = Decoder()

    async def connect(self, mode, channel):
        await self.disconnect()
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
            for mux in range(32):
                if mux < 24:
                    values = [3.85 + 0.006 * math.sin((mux * 4 + k) * 0.4 + tick * 0.1)
                              for k in range(4)]
                    total += sum(values)
                    raw = [round(v / 0.000305) for v in values]
                else:
                    raw = [round((22 + (mux - 24) * 0.2) / 0.0122)] * 4
                bits = sum(v << (14 * k) for k, v in enumerate(raw))
                self.decoder.feed(can.Message(arbitration_id=0x6F2,
                    data=bytes([mux]) + bits.to_bytes(7, "little"), is_extended_id=False))
            self.decoder.feed(can.Message(arbitration_id=0x102,
                data=round(total * 100).to_bytes(2, "little") + bytes(6), is_extended_id=False))
            tick += 1
            await asyncio.sleep(1)

    def snapshot(self):
        return {**self.decoder.snapshot(), "mode": self.mode, "channel": self.channel,
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
        if mode not in ("demo", "pcan", "socketcan") or not isinstance(channel, str):
            raise web.HTTPBadRequest(text="Choose Demo, PCAN or SocketCAN")
        pattern = r"PCAN_USBBUS(?:[1-9]|1[0-6])" if mode == "pcan" else r"[A-Za-z0-9_.-]{1,32}"
        if mode != "demo" and not re.fullmatch(pattern, channel):
            raise web.HTTPBadRequest(text="Invalid CAN channel")
        if mode != "demo" and body.get("profile_confirmed") is not True:
            raise web.HTTPBadRequest(text="Confirm pack/profile and bus settings before live use")
        async with connection.lock:
            await connection.connect(mode, channel)
        return web.json_response(connection.snapshot())

    async def disconnect(request):
        async with connection.lock:
            await connection.disconnect()
        return web.json_response(connection.snapshot())

    async def export(request):
        state = connection.snapshot()
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(["timestamp_utc", "mode", "status", "pack_v", "pack_a", "coverage"]
                        + [f"brick_{i+1}_v" for i in range(96)]
                        + [f"temp_{i+1}_c" for i in range(32)])
        writer.writerow([datetime.now(timezone.utc).isoformat(), state["mode"], state["status"],
                         state["pack_v"], state["pack_a"], state["coverage"]]
                        + state["bricks"] + state["temps"])
        return web.Response(text=output.getvalue(), content_type="text/csv", headers={
            "Content-Disposition": 'attachment; filename="tesla-bms-snapshot.csv"'})

    async def index(request):
        return web.FileResponse(STATIC / "index.html")

    async def cleanup(app):
        await connection.disconnect()

    app.router.add_get("/", index)
    app.router.add_get("/api/state", state)
    app.router.add_post("/api/connect", connect)
    app.router.add_post("/api/disconnect", disconnect)
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
