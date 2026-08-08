from pathlib import Path
import json,sys,zipfile
root=Path(sys.argv[1]).resolve(); out=Path(sys.argv[2]).resolve(); manifest=json.loads((root/'CORE_RESPONSE_AUTHORITY_MANIFEST.json').read_text())
paths=sorted(set([r['path'] for r in manifest['files']]+['CORE_RESPONSE_AUTHORITY_MANIFEST.json','CORE_RESPONSE_AUTHORITY_SHA256SUMS']))
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for rel in paths:
  source=(root/rel).resolve()
  if root not in source.parents and source!=root: raise RuntimeError(f'unsafe path: {rel}')
  info=zipfile.ZipInfo(rel,date_time=(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  z.writestr(info,source.read_bytes())
print(f'ZIP CREATED: {out}; files={len(paths)}')
