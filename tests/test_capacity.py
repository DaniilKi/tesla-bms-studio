import unittest
import can
from studio.charge import ChargeCounter
from studio.decoder import Decoder


class CapacityTests(unittest.TestCase):
    def test_legacy_cac_field_mapping_and_scaling(self):
        decoder = Decoder()
        decoder.feed(can.Message(arbitration_id=0x7E2, data=[0,0,0xC0,0x90,0,0,0,0], is_extended_id=False))
        result=decoder.snapshot()
        self.assertEqual(result["cac_raw"],2316)
        self.assertEqual(result["cac_min_ah"],231.6)
        self.assertEqual(result["cac_quality"],"as_reported")

    def test_wrong_mux_short_frame_and_stale_capacity(self):
        now=[10.0]
        decoder=Decoder(clock=lambda:now[0])
        for data in ([1,0,0xC0,0x90],[0,0,0xC0]):
            decoder.feed(can.Message(arbitration_id=0x7E2,data=data,is_extended_id=False))
        self.assertIsNone(decoder.snapshot()["cac_min_ah"])
        decoder.feed(can.Message(arbitration_id=0x7E2,data=[0,0,0xC0,0x90],is_extended_id=False))
        now[0]+=46
        self.assertIsNone(decoder.snapshot()["cac_min_ah"])
        self.assertEqual(decoder.snapshot()["cac_quality"],"stale")

    def test_unverified_max_raw_code_is_preserved_without_invented_ah(self):
        decoder=Decoder()
        decoder.feed(can.Message(arbitration_id=0x7E2,data=[0,0,0xF0,0xFF],is_extended_id=False))
        result=decoder.snapshot()
        self.assertEqual(result["cac_raw"],4095)
        self.assertIsNone(result["cac_min_ah"])
        self.assertEqual(result["cac_quality"],"unverified_max_code")

    def test_no_default_capacity_or_live_vsh_values(self):
        result=Decoder().snapshot()
        self.assertIsNone(result["cac_min_ah"])
        self.assertIsNone(result["session_charge"]["positive_ah"])
        self.assertIsNone(result["vsh"])

    def test_current_integral_for_known_duration(self):
        counter=ChargeCounter()
        for t in range(3601):
            counter.feed(t,10)
        result=counter.snapshot(3600)
        self.assertAlmostEqual(result["positive_ah"],10)
        self.assertEqual(result["negative_ah"],0)
        self.assertEqual(result["valid_seconds"],3600)

    def test_sign_crossing_keeps_both_polarities(self):
        counter=ChargeCounter()
        counter.feed(0,10)
        counter.feed(1,-10)
        result=counter.snapshot(1)
        self.assertAlmostEqual(result["positive_ah"],2.5/3600)
        self.assertAlmostEqual(result["negative_ah"],2.5/3600)

    def test_missing_current_and_time_gaps_are_not_integrated(self):
        counter=ChargeCounter()
        for t,current in ((0,10),(1,10),(2,None),(3,10),(10,10),(11,10)):
            counter.feed(t,current)
        result=counter.snapshot(11)
        self.assertAlmostEqual(result["positive_ah"],20/3600)
        self.assertEqual(result["valid_seconds"],2)
        self.assertEqual(result["gap_seconds"],9)
        self.assertEqual(result["quality"],"partial")

    def test_silent_current_stream_marks_unrecorded_tail(self):
        counter=ChargeCounter()
        counter.feed(0,20);counter.feed(1,20)
        result=counter.snapshot(6)
        self.assertEqual(result["gap_seconds"],5)
        self.assertEqual(result["quality"],"partial")
