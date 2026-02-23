import json
import glob
import os

required = ['article', 'inner_material', 'legislative_initiative']
files = sorted(glob.glob(r'C:\Repositories\na-project\messages\*.json'))
out = []

for path in files:
    name = os.path.basename(path)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        out.append(f'{name}: INVALID_JSON')
        continue

    ctd = ((data.get('Shared') or {}).get('ContentsTypesDescription'))
    if not isinstance(ctd, dict):
        out.append(f'{name}: Missing Shared.ContentsTypesDescription')
        continue

    missing = [k for k in required if k not in ctd]
    if missing:
        out.append(f"{name}: Missing keys: {', '.join(missing)}")

print('NONE' if not out else '\n'.join(out))
