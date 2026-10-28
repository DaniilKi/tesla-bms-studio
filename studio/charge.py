"""Recorded current throughput, not a full battery-capacity test."""


class ChargeCounter:
    MAX_GAP_SECONDS = 1.5

    def __init__(self):
        self.previous_time = None
        self.previous_current = None
        self.positive_ah = 0.0
        self.negative_ah = 0.0
        self.valid_seconds = 0.0
        self.gap_seconds = 0.0
        self.gap_count = 0

    def feed(self, timestamp, current):
        if self.previous_time is not None:
            dt = timestamp - self.previous_time
            if (0 < dt <= self.MAX_GAP_SECONDS and current is not None
                    and self.previous_current is not None):
                a, b = self.previous_current, current
                if a >= 0 and b >= 0:
                    self.positive_ah += (a + b) * dt / 7200
                elif a <= 0 and b <= 0:
                    self.negative_ah -= (a + b) * dt / 7200
                else:
                    crossing = dt * abs(a) / (abs(a) + abs(b))
                    first = abs(a) * crossing / 7200
                    second = abs(b) * (dt - crossing) / 7200
                    self.positive_ah += first if a > 0 else second
                    self.negative_ah += first if a < 0 else second
                self.valid_seconds += dt
            elif dt > 0:
                self.gap_seconds += dt
                self.gap_count += 1
        self.previous_time = timestamp
        self.previous_current = current

    def snapshot(self, now):
        tail = max(0, now - self.previous_time) if self.previous_time is not None else 0
        missing_tail = tail if tail > self.MAX_GAP_SECONDS else 0
        has_data = self.valid_seconds > 0
        return {
            "positive_ah": self.positive_ah if has_data else None,
            "negative_ah": self.negative_ah if has_data else None,
            "valid_seconds": self.valid_seconds,
            "gap_seconds": self.gap_seconds + missing_tail,
            "gap_count": self.gap_count + bool(missing_tail),
            "quality": "partial" if self.gap_count or missing_tail else "recorded" if has_data else "waiting",
            "method": "trapezoidal_current_integral",
        }
