import asyncio
import csv
import io
import unittest
from unittest.mock import patch

import can
from aiohttp.test_utils import TestClient, TestServer

from studio.app import Connection, create_app
from studio.decoder import Decoder


def mux_frame(mux, values):
    packed = sum(value << (14 * k) for k, value in enumerate(values))
    return can.Message(arbitration_id=0x6F2,
                       data=bytes([mux]) + packed.to_bytes(7, "little"), is_extended_id=False)


class DecoderTests(unittest.TestCase):
    def setUp(self):
        self.now = 100.0
        self.decoder = Decoder(clock=lambda: self.now)

    def test_brick_positions_and_scaling(self):
        self.decoder.feed(mux_frame(23, [12000, 12001, 12002, 12003]))
        result = self.decoder.snapshot()
        self.assertEqual(result["bricks"][92], 3.66)
        self.assertEqual(result["bricks"][95], 3.6609)
        self.assertEqual(result["coverage"], 4)
        self.assertIsNone(result["sum_v"])

    def test_signed_and_zero_temperatures(self):
        self.decoder.feed(mux_frame(24, [0, 0x4000 - 100, 1000, 0x3FFF]))
        self.assertEqual(self.decoder.snapshot()["temps"][:4], [0, -1.22, 12.2, None])

    def test_invalid_marker_does_not_refresh_stale_data(self):
        self.decoder.feed(mux_frame(0, [12000] * 4))
        self.now += 46
        self.decoder.feed(mux_frame(0, [0x3FFF] * 4))
        result = self.decoder.snapshot()
        self.assertEqual(result["coverage"], 0)
        self.assertEqual(result["brick_state"][:4], ["stale"] * 4)

    def test_each_brick_expires_independently(self):
        self.decoder.feed(mux_frame(0, [12000] * 4))
        self.now += 40
        self.decoder.feed(mux_frame(0, [12000, 0, 0x3FFF, 0]))
        self.now += 6
        self.assertEqual(self.decoder.snapshot()["bricks"][:4], [3.66, None, None, None])

    def test_pack_invalid_and_stale(self):
        self.decoder.feed(can.Message(arbitration_id=0x102, data=[0x10, 0x9C, 10, 0], is_extended_id=False))
        self.assertEqual(self.decoder.snapshot()["pack_v"], 399.52)
        self.now += 46
        self.assertIsNone(self.decoder.snapshot()["pack_v"])
        self.decoder.feed(can.Message(arbitration_id=0x102, data=[255] * 8, is_extended_id=False))
        self.assertIsNone(self.decoder.snapshot()["pack_v"])
        self.assertIsNone(self.decoder.snapshot()["pack_a"])

    def test_error_extended_remote_fd_and_short_frames(self):
        for field in ("is_extended_id", "is_error_frame", "is_remote_frame", "is_fd"):
            options = {"is_extended_id": False, field: True}
            self.decoder.feed(can.Message(arbitration_id=0x6F2, data=[0] * 8, **options))
        self.decoder.feed(can.Message(arbitration_id=0x6F2, data=[0], is_extended_id=False))
        self.decoder.feed(mux_frame(255, [12000] * 4))
        self.assertEqual(self.decoder.snapshot()["coverage"], 0)

    def test_difference_requires_complete_fresh_coverage(self):
        for mux in range(24):
            self.decoder.feed(mux_frame(mux, [12000] * 4))
        self.decoder.feed(can.Message(arbitration_id=0x102, data=[0x10, 0x9C, 0, 0], is_extended_id=False))
        self.assertEqual(self.decoder.snapshot()["sum_v"], 351.36)
        self.assertEqual(self.decoder.snapshot()["unmeasured_v"], 48.16)
        self.now += 46
        self.assertIsNone(self.decoder.snapshot()["unmeasured_v"])


class AppTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.connection = Connection()
        self.client = TestClient(TestServer(create_app(self.connection), host="127.0.0.1"))
        await self.client.start_server()
        self.origin = str(self.client.make_url("/")).rstrip("/")

    async def asyncTearDown(self):
        await self.client.close()

    async def post(self, path, body):
        return await self.client.post(path, json=body, headers={"Origin": self.origin})

    async def test_starts_disconnected_without_opening_hardware(self):
        with patch("studio.app.can.Bus") as factory:
            response = await self.client.get("/api/state")
            state = await response.json()
            self.assertEqual(state["status"], "disconnected")
            self.assertFalse(state["application_tx"])
            factory.assert_not_called()

    async def test_demo_export_and_disconnect(self):
        with patch("studio.app.can.Bus") as factory:
            response = await self.post("/api/connect", {"mode": "demo"})
            self.assertEqual(response.status, 200)
            await asyncio.sleep(0.02)
            state = await (await self.client.get("/api/state")).json()
            self.assertEqual(state["coverage"], 96)
            self.assertEqual(state["temperature_coverage"], 32)
            csv_response = await self.client.get("/api/snapshot.csv")
            rows = list(csv.reader(io.StringIO(await csv_response.text())))
            self.assertEqual(len(rows), 2)
            self.assertEqual(len(rows[0]), 134)
            self.assertEqual(rows[1][1], "demo")
            response = await self.post("/api/disconnect", {})
            self.assertEqual((await response.json())["coverage"], 0)
            factory.assert_not_called()

    async def test_cross_origin_and_rebinding_are_rejected(self):
        response = await self.client.post("/api/connect", json={"mode": "demo"}, headers={"Origin": "https://other.example"})
        self.assertEqual(response.status, 403)
        response = await self.client.get("/api/state", headers={"Host": "other.example"})
        self.assertEqual(response.status, 403)

    async def test_invalid_input_and_unconfirmed_live_connection(self):
        for body in ([], {"mode": "arbitrary"}, {"mode": "pcan", "channel": "PCAN_USBBUS1"},
                     {"mode": "socketcan", "channel": "../bad", "profile_confirmed": True}):
            response = await self.post("/api/connect", body)
            self.assertEqual(response.status, 400)

    async def test_missing_driver_reports_error_without_demo_fallback(self):
        with patch("studio.app.can.Bus", side_effect=can.CanError("driver unavailable")):
            response = await self.post("/api/connect", {"mode": "pcan", "channel": "PCAN_USBBUS1", "profile_confirmed": True})
            result = await response.json()
            self.assertEqual(result["status"], "error")
            self.assertEqual(result["error"], "driver unavailable")
            self.assertEqual(result["coverage"], 0)

    async def test_legacy_command_routes_do_not_exist(self):
        for route in ("/vehicle", "/clearfault", "/readdtc"):
            response = await self.post(route, {})
            self.assertEqual(response.status, 404)

    async def test_pcan_requests_passive_mode_and_never_sends(self):
        class ReceiveOnlyBus:
            def __init__(self):
                self.closed = False
                self.calls = 0

            def recv(self, timeout):
                import time
                time.sleep(0.005)
                self.calls += 1
                return mux_frame(0, [12000] * 4)

            def shutdown(self):
                self.closed = True

            def send(self, *args, **kwargs):
                raise AssertionError("Application attempted a CAN transmission")

        bus = ReceiveOnlyBus()
        with patch("studio.app.can.Bus", return_value=bus) as factory:
            await self.post("/api/connect", {"mode": "pcan", "channel": "PCAN_USBBUS1", "profile_confirmed": True})
            await asyncio.sleep(0.04)
            factory.assert_called_once_with(interface="pcan", channel="PCAN_USBBUS1",
                ignore_config=True, bitrate=500000, state=can.BusState.PASSIVE)
            self.assertEqual(self.connection.snapshot()["coverage"], 4)
            await self.post("/api/disconnect", {})
            self.assertTrue(bus.closed)
            self.assertIsNone(self.connection.task)

    async def test_virtual_bus_receive_integration(self):
        channel = "studio-test-virtual"
        receiver = can.Bus(interface="virtual", channel=channel, ignore_config=True)
        sender = can.Bus(interface="virtual", channel=channel, ignore_config=True)
        try:
            with patch("studio.app.can.Bus", return_value=receiver):
                await self.post("/api/connect", {"mode": "socketcan", "channel": "can0", "profile_confirmed": True})
            sender.send(mux_frame(0, [12000] * 4))
            await asyncio.sleep(0.05)
            self.assertEqual(self.connection.snapshot()["coverage"], 4)
            await self.post("/api/disconnect", {})
        finally:
            sender.shutdown()


if __name__ == "__main__":
    unittest.main()
