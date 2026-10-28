"""Legacy 85/90 decoder adapted from jetpax/PiCanScanMyTesla (MIT).

Formats are upstream observations, not a Tesla compatibility guarantee.
Each signal ages independently; invalid markers do not refresh cached data.
"""

import time
import json
from collections import deque
from pathlib import Path

PROFILES = {p["id"]: p for p in json.loads(Path(__file__).with_name("profiles.json").read_text(encoding="utf-8"))}


class Decoder:
    STALE_SECONDS = 45

    def __init__(self, clock=time.monotonic, profile_id="legacy96"):
        self.clock = clock
        self.profile = PROFILES[profile_id]
        self.bricks = [None] * 96
        self.temps = [None] * 32
        self.brick_seen = [None] * 96
        self.temp_seen = [None] * 32
        self.pack_v = None
        self.pack_a = None
        self.pack_seen = None
        self.frame_count = 0
        self.last_rx = None
        self.currents = deque(maxlen=2000)
        self.isolation_kohm = None
        self.isolation_seen = None

    def feed(self, message):
        if (message.is_extended_id or message.is_error_frame
                or message.is_remote_frame or message.is_fd):
            return
        now = self.clock()
        self.frame_count += 1
        self.last_rx = now
        data = message.data
        if message.arbitration_id == 0x6F2 and len(data) == 8:
            mux = data[0]
            if mux >= 32 or data[1:] == b"\xff" * 7:
                return
            bits = int.from_bytes(data[1:], "little")
            for k in range(4):
                raw = (bits >> (14 * k)) & 0x3FFF
                if raw == 0x3FFF or (mux < 24 and raw == 0):
                    continue
                if mux < 24:
                    index = mux * 4 + k
                    self.bricks[index] = round(raw * 5 / 16384, 6)
                    self.brick_seen[index] = now
                else:
                    signed = raw - 0x4000 if raw & 0x2000 else raw
                    value = round(signed * 0.0122, 2)
                    if -50 <= value <= 120:
                        index = (mux - 24) * 4 + k
                        self.temps[index] = value
                        self.temp_seen[index] = now
        elif message.arbitration_id == 0x102 and len(data) >= 4:
            voltage = int.from_bytes(data[:2], "little")
            self.pack_v = None if voltage == 0xFFFF else round(voltage * 0.01, 2)
            self.pack_a = (None if data[2:4] == b"\xff\xff" else
                           round(int.from_bytes(data[2:4], "little", signed=True) * 0.1, 1))
            self.pack_seen = now
            if self.pack_a is not None:
                self.currents.append((now, self.pack_a))
        elif message.arbitration_id == 0x212 and len(data) >= 4:
            self.isolation_kohm = None if data[3] == 0xFF else data[3] * 20
            self.isolation_seen = now

    def snapshot(self):
        now = self.clock()

        def fresh(value, seen):
            return value if seen is not None and now - seen <= self.STALE_SECONDS else None

        count = self.profile["brick_count"]
        bricks = [fresh(v, seen) for v, seen in zip(self.bricks[:count], self.brick_seen[:count])]
        temp_count = self.profile["temp_count"]
        temps = [fresh(v, seen) for v, seen in zip(self.temps[:temp_count], self.temp_seen[:temp_count])]
        known = [v for v in bricks if v is not None]
        pack_v = fresh(self.pack_v, self.pack_seen)
        pack_a = fresh(self.pack_a, self.pack_seen)
        samples = []
        for index, value in enumerate(bricks):
            seen = self.brick_seen[index]
            nearby = [(stamp, current) for stamp, current in self.currents
                      if seen is not None and abs(stamp - seen) <= 0.25]
            nearest = min(nearby, key=lambda item: abs(item[0] - seen)) if nearby else None
            samples.append({
                "voltage_v": value, "voltage_time_s": seen,
                "current_a": nearest[1] if nearest else None,
                "current_time_s": nearest[0] if nearest else None,
                "current_samples": len(nearby),
                "current_span_a": max(p[1] for p in nearby) - min(p[1] for p in nearby) if nearby else None,
                "age_s": now - seen if seen is not None else None,
                "temperature_c": temps[(index // 6) * 2] if (index // 6) * 2 < len(temps) else None,
                "soc_pct": None,
            })
        complete = self.profile["expected_count"] is not None and len(known) == count
        extra = [i + 1 for i in range(count, 96) if fresh(self.bricks[i], self.brick_seen[i]) is not None]
        return {
            "profile": self.profile,
            "samples": samples,
            "outside_profile_bricks": extra,
            "isolation_kohm": fresh(self.isolation_kohm, self.isolation_seen),
            "bricks": bricks,
            "temps": temps,
            "brick_state": ["fresh" if v is not None else
                            "stale" if seen is not None else "missing"
                            for v, seen in zip(bricks, self.brick_seen[:count])],
            "frame_count": self.frame_count,
            "last_rx_age": None if self.last_rx is None else round(now - self.last_rx, 1),
            "pack_v": pack_v,
            "pack_a": pack_a,
            "coverage": len(known),
            "temperature_coverage": sum(t is not None for t in temps),
            "min_v": min(known) if known else None,
            "max_v": max(known) if known else None,
            "spread_mv": round((max(known) - min(known)) * 1000, 1) if known else None,
            "sum_v": round(sum(known), 2) if complete and not extra else None,
            "unmeasured_v": round(pack_v - sum(known), 2)
            if pack_v is not None and complete and not extra else None,
        }
