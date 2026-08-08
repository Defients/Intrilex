#!/usr/bin/env python3
import fnmatch, os, stat, sys, zipfile
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
        mode=stat.S_IMODE(p.stat().st_mode)
        info.external_attr=(mode & 0xFFFF)<<16
        info.create_system=3
        z.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
print(f'DETERMINISTIC ZIP PASS: files={len(files)}; output={out}')
