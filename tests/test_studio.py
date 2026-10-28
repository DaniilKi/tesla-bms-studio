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
        self.assertEqual(result["bricks"][92], 3.662109)
        self.assertEqual(result["bricks"][95], 3.663025)
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
        self.assertEqual(self.decoder.snapshot()["bricks"][:4], [3.662109, None, None, None])

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
        self.assertEqual(self.decoder.snapshot()["sum_v"], 351.56)
        self.assertEqual(self.decoder.snapshot()["unmeasured_v"], 47.96)

    def test_profiles_are_independent_from_capacity_and_extra_channels(self):
        for profile, count in (("legacy83", 83), ("legacy84", 84), ("legacy96", 96)):
            decoder = Decoder(profile_id=profile)
            for mux in range(24):
                decoder.feed(mux_frame(mux, [12000 if mux*4+k<count else 0 for k in range(4)]))
            snapshot = decoder.snapshot()
            self.assertEqual(snapshot["coverage"], count)
            self.assertEqual(len(snapshot["bricks"]), count)
            self.assertIsNotNone(snapshot["sum_v"])
        decoder = Decoder(profile_id="legacy84")
        decoder.feed(mux_frame(23, [12000]*4))
        self.assertEqual(decoder.snapshot()["outside_profile_bricks"], [93,94,95,96])
        self.assertIsNone(decoder.snapshot()["sum_v"])

    def test_unknown_profile_never_claims_complete_coverage(self):
        decoder = Decoder(profile_id="legacy_unknown")
        for mux in range(24):
            decoder.feed(mux_frame(mux,[12000]*4))
        self.assertEqual(decoder.snapshot()["coverage"],96)
        self.assertIsNone(decoder.snapshot()["sum_v"])

    def test_current_pairing_and_isolation_are_distinct(self):
        for stamp in (99.9, 100.1):
            self.now=stamp
            self.decoder.feed(can.Message(arbitration_id=0x102,data=[0,0,0xF4,1],is_extended_id=False))
        self.now=100.0
        self.decoder.feed(mux_frame(0,[12000]*4))
        self.decoder.feed(can.Message(arbitration_id=0x212,data=[0,0,0,10],is_extended_id=False))
        snapshot=self.decoder.snapshot()
        self.assertEqual(snapshot["samples"][0]["current_a"],50)
        self.assertEqual(snapshot["samples"][0]["current_samples"],2)
        self.assertEqual(snapshot["isolation_kohm"],200)

    def test_late_current_does_not_become_a_synchronized_sample(self):
        self.decoder.feed(mux_frame(0,[12000]*4))
        self.now+=1
        self.decoder.feed(can.Message(arbitration_id=0x102,data=[0]*8,is_extended_id=False))
        self.assertIsNone(self.decoder.snapshot()["samples"][0]["current_a"])
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

    async def wait_for_coverage(self, expected):
        async def received():
            while self.connection.snapshot()["coverage"] != expected:
                if self.connection.status == "error":
                    self.fail(self.connection.error)
                await asyncio.sleep(0.01)
        await asyncio.wait_for(received(), timeout=3)

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
            await self.wait_for_coverage(96)
            state = await (await self.client.get("/api/state")).json()
            self.assertEqual(state["coverage"], 96)
            self.assertEqual(state["temperature_coverage"], 32)
            self.assertEqual(state["cac_min_ah"], 222.8)
            self.assertIsNone(state["vsh"])
            csv_response = await self.client.get("/api/snapshot.csv")
            rows = list(csv.reader(io.StringIO(await csv_response.text())))
            self.assertEqual(len(rows), 2)
            self.assertEqual(len(rows[0]), 134)
            self.assertEqual(rows[1][1], "demo")
            response = await self.post("/api/disconnect", {})
            disconnected = await response.json()
            self.assertEqual(disconnected["coverage"], 0)
            self.assertIsNone(disconnected["cac_min_ah"])
            self.assertIsNone(disconnected["session_charge"]["positive_ah"])
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

    async def test_capacity_range_profile_and_demo_only_controls(self):
        for capacity in (60,70,75,85,90,100):
            response=await self.post("/api/connect", {"mode":"demo","profile_id":"legacy84","capacity_kwh":capacity})
            await self.wait_for_coverage(84)
            result=await (await self.client.get("/api/state")).json()
            self.assertEqual(result["capacity_kwh"],capacity)
            self.assertEqual(result["coverage"],84)
        for body in ({"mode":"demo","capacity_kwh":101}, {"mode":"demo","profile_id":[]}, {"mode":"demo","capacity_kwh":True}):
            self.assertEqual((await self.post("/api/connect",body)).status,400)
        await self.post("/api/disconnect",{})
        self.assertEqual((await self.post("/api/demo",{"current_a":50})).status,403)

    async def test_reconnect_changes_session_and_clears_current_history(self):
        await self.post("/api/connect",{"mode":"demo"})
        await self.wait_for_coverage(96)
        old=self.connection.session_id
        await self.post("/api/connect",{"mode":"demo","profile_id":"legacy83","capacity_kwh":100})
        self.assertNotEqual(old,self.connection.session_id)
        self.assertEqual(self.connection.decoder.profile["brick_count"],83)

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
            await self.wait_for_coverage(4)
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
            await self.wait_for_coverage(4)
            self.assertEqual(self.connection.snapshot()["coverage"], 4)
            await self.post("/api/disconnect", {})
        finally:
            sender.shutdown()


if __name__ == "__main__":
    unittest.main()
