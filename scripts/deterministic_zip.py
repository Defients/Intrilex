#!/usr/bin/env python3
import fnmatch, json, os, stat, sys, zipfile
from pathlib import Path

if len(sys.argv) < 3:
    raise SystemExit('usage: deterministic_zip.py ROOT OUTPUT [EXCLUDE_GLOB ...]')
root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
patterns = sys.argv[3:]
FIXED=(2020,1,1,0,0,0)

def excluded(rel: str) -> bool:
    return any(fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(rel+'/', pat) for pat in patterns)

files=[]
if patterns and patterns[0] == '--inventory':
    inventory=json.loads(Path(patterns[1]).read_text(encoding='utf-8'))
    names=inventory['files']
    overlays=inventory.get('overlays',{})
    if len(names) != len(set(names)) or set(names) & set(overlays):
        raise SystemExit('DUPLICATE_ARCHIVE_MEMBER')
    for rel in sorted(names + list(overlays)):
        if not rel or '\\' in rel or ':' in rel or rel.startswith('/') or any(p in ('','..','.') for p in rel.split('/')):
            raise SystemExit(f'UNSAFE_ARCHIVE_PATH:{rel}')
        p=Path(overlays[rel]) if rel in overlays else root/rel
        if rel not in overlays:
            current=root
            for part in rel.split('/'):
                current=current/part
                if current.is_symlink(): raise SystemExit(f'UNSAFE_SYMLINK:{rel}')
        if p.is_symlink() or not p.is_file(): raise SystemExit(f'UNSAFE_SOURCE:{rel}')
        files.append((rel,p))
else:
    for dirpath, dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
        base=Path(dirpath)
        kept=[]
        for name in sorted(dirnames):
            p=base/name
            rel=p.relative_to(root).as_posix()
            if excluded(rel): continue
            if p.is_symlink():
                raise SystemExit(f'UNSAFE_SYMLINK:{rel}')
            kept.append(name)
        dirnames[:] = kept
        for name in sorted(filenames):
            p=base/name
            rel=p.relative_to(root).as_posix()
            if excluded(rel): continue
            if p.is_symlink(): raise SystemExit(f'UNSAFE_SYMLINK:{rel}')
            if p.is_file(): files.append((rel,p))
        dirnames[:] = kept
files.sort()
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9,allowZip64=True) as z:
    for rel,p in files:
        data=p.read_bytes()
        info=zipfile.ZipInfo(rel,FIXED)
        info.compress_type=zipfile.ZIP_DEFLATED
        mode=0o644
        info.external_attr=(mode & 0xFFFF)<<16
        info.create_system=3
        z.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
print(f'DETERMINISTIC ZIP PASS: files={len(files)}; output={out}')
