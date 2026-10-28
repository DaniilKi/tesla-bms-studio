"""Build the public, browser-only synthetic demo from the shared interface."""
import argparse
import json
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("destination", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
destination = args.destination.resolve()
destination.mkdir(parents=True, exist_ok=True)
shutil.copytree(root / "studio/static", destination / "static", dirs_exist_ok=True)
shutil.copy2(root / "studio/static/index.html", destination / "index.html")
shutil.copy2(root / "studio/profiles.json", destination / "static/profiles.json")
(destination / "static/runtime.js").write_text("window.STUDIO_CONFIG = {hosted: true};\n", encoding="utf-8")
(destination / "BUILD.json").write_text(json.dumps({"app":"Tesla BMS Studio", "version":"0.3", "hardware_access":False, "data":"synthetic or browser-local CSV"}), encoding="utf-8")
print("Built browser-only demo at " + str(destination))
