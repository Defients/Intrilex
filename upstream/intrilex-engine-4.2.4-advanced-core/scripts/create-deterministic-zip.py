from pathlib import Path
import json, sys, zipfile
root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
manifest = json.loads((root / 'TRIGGER_CLOSURE_AUTHORITY_MANIFEST.json').read_text())
paths = [row['path'] for row in manifest['files']] + ['TRIGGER_CLOSURE_AUTHORITY_MANIFEST.json', 'TRIGGER_CLOSURE_AUTHORITY_SHA256SUMS']
paths = sorted(set(paths))
out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for rel in paths:
        source = (root / rel).resolve()
        if root not in source.parents and source != root:
            raise RuntimeError(f'unsafe path: {rel}')
        data = source.read_bytes()
        info = zipfile.ZipInfo(rel, date_time=(2020, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, data)
print(f'ZIP CREATED: {out}; files={len(paths)}')
