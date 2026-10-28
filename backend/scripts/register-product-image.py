"""Convert a generated source to a local PNG and bind its content hash to one product."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('slug')
parser.add_argument('source', type=Path)
parser.add_argument('--verified', action='store_true', help='Only after visually inspecting the generated image')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
manifest_path = root / 'backend/src/data/productImageManifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
row = next(item for item in manifest['products'] if item['slug'] == args.slug)
target = root / 'frontend/public' / row['image'].lstrip('/')
target.parent.mkdir(parents=True, exist_ok=True)
if target.exists():
    raise SystemExit('Target already exists. Inspect it before replacing any generated asset.')
with Image.open(args.source) as image:
    image.convert('RGB').save(target, 'PNG')
row['sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
row['visuallyVerified'] = args.verified
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f"Saved {row['slug']}: {target}")
