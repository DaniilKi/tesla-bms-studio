"""Legacy 85/90 decoder adapted from jetpax/PiCanScanMyTesla (MIT).

Formats are upstream observations, not a Tesla compatibility guarantee.
Each signal ages independently; invalid markers do not refresh cached data.
"""

import time


class Decoder:
    STALE_SECONDS = 45

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.bricks = [None] * 96
        self.temps = [None] * 32
        self.brick_seen = [None] * 96
        self.temp_seen = [None] * 32
        self.pack_v = None
        self.pack_a = None
        self.pack_seen = None
        self.frame_count = 0
        self.last_rx = None

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
                    self.bricks[index] = round(raw * 0.000305, 4)
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

    def snapshot(self):
        now = self.clock()

        def fresh(value, seen):
            return value if seen is not None and now - seen <= self.STALE_SECONDS else None

        bricks = [fresh(v, seen) for v, seen in zip(self.bricks, self.brick_seen)]
        temps = [fresh(v, seen) for v, seen in zip(self.temps, self.temp_seen)]
        known = [v for v in bricks if v is not None]
        pack_v = fresh(self.pack_v, self.pack_seen)
        pack_a = fresh(self.pack_a, self.pack_seen)
        return {
            "bricks": bricks,
            "temps": temps,
            "brick_state": ["fresh" if v is not None else
                            "stale" if seen is not None else "missing"
                            for v, seen in zip(bricks, self.brick_seen)],
            "frame_count": self.frame_count,
            "last_rx_age": None if self.last_rx is None else round(now - self.last_rx, 1),
            "pack_v": pack_v,
            "pack_a": pack_a,
            "coverage": len(known),
            "temperature_coverage": sum(t is not None for t in temps),
            "min_v": min(known) if known else None,
            "max_v": max(known) if known else None,
            "spread_mv": round((max(known) - min(known)) * 1000, 1) if known else None,
            "sum_v": round(sum(known), 2) if len(known) == 96 else None,
            "unmeasured_v": round(pack_v - sum(known), 2)
            if pack_v is not None and len(known) == 96 else None,
        }
