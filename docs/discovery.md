# Existing source and backup discovery

Date: 2026-10-19. Host: the current kimyounggaur PC. This investigation did not access the offline DESKTOP-FVHJSEO computer.

## Scope and result

Read-only recursive metadata discovery covered:

- `C:\Users\kimyo\OneDrive`
- `C:\Users\kimyo\Documents`
- `C:\Users\kimyo\Desktop`
- `C:\Users\kimyo\Downloads`
- `D:\128G 1`
- `D:\256G 1`
- `D:\tmp`

The first pass visited **419,305 files and 38,117 directories**, with **0 read errors**. Dependency/generated folders (`node_modules`, `.git` internals, `.next`, `dist`, `build`, `.cache`, `.pnpm-store`) and system trash were excluded. `rg` was unavailable on PATH, so Node filesystem traversal was used. Names were checked for `One.?Measure`, `Measure.?Workshop`, `한.?마디`, and `조립실`.

No pre-existing source directory for this game was found within that scope. A second pass inspected **96 Git configurations and 208 package.json files** for the target repository/game name, with **0 matching Git origins or package metadata**. These counts describe the investigation before the new `game` workspace was created; they are not a claim that no source exists anywhere on the computer or on unexamined drives.

The main agent independently reported that the specified GitHub repository had size 0 and `git ls-remote` returned no refs. Read-only inspection of the new workspace confirmed origin `https://github.com/kimyounggaur/One_Measure_Workshop_Game.git`, `No commits yet on main`, no `show-ref` output, and no resolvable `HEAD` at the time of inspection. Its untracked scaffold was new work, not recovered historical code. The previous PC's reported S00–S04 completion and S05 work therefore cannot be treated as the state of recovered code here.

## Original backup locations

The following two roots contain matching source documents and image assets:

```text
C:\Users\kimyo\OneDrive\레디 작업\2026-10-19_최신완료분_백업
D:\256G 1\레디 작업\2026-10-19_최신완료분_백업
```

Relative files under each root:

```text
새 게임 설계·프롬프트\one_measure_workshop_development_design.md
새 게임 설계·프롬프트\한_마디_조립실_바이브코딩_프롬프트팩_v1.0.md
한 마디 조립실 에셋\한_마디_조립실_asset_manifest.json
한 마디 조립실 에셋\한_마디_조립실_에셋_사용안내.md
한 마디 조립실 에셋\한_마디_조립실_에셋_미리보기.png
한 마디 조립실 에셋\한_마디_조립실_이미지에셋_v1_런타임.zip
한 마디 조립실 에셋\한_마디_조립실_이미지에셋_v1_전체.zip
```

SHA-256 was computed independently for both copies of every file below. All seven pairs match byte-for-byte. These hashes refer to the original backups, not later working copies or normalized documentation exports.

| Original file | Bytes | SHA-256 |
| --- | ---: | --- |
| `one_measure_workshop_development_design.md` | 121574 | `2334e36362ec11970b3756d8659331926d5cd318991cc1a96339169c72fe4d2d` |
| `한_마디_조립실_바이브코딩_프롬프트팩_v1.0.md` | 98178 | `d074028be40d65a0d61189d1bfdb3ee013c89025cba9e3f9a8ae9e70320bbbc8` |
| `한_마디_조립실_asset_manifest.json` | 163953 | `a10efff4fc79acbaa1e6305e6701bc7f2c1a6b10d6fa7df3172ce1ec0be26c89` |
| `한_마디_조립실_에셋_사용안내.md` | 8670 | `c1e05bbcb1bdd426c36f090977815b31d9f794b2ddcef392c6ca36264e2467b0` |
| `한_마디_조립실_에셋_미리보기.png` | 517015 | `11ad830cd279870794698cd26063f9415b90787fe9821c6c256ebf1fd4c10865` |
| `한_마디_조립실_이미지에셋_v1_런타임.zip` | 313512 | `f6bb913321d0031ade837998dde7c0f12c204fed856bcfb197d3df7437c1afe3` |
| `한_마디_조립실_이미지에셋_v1_전체.zip` | 3828571 | `725a12a822a8d8a78c25d1fec7b3e3124045ea5bd9de8f0e9792c7a1fad0254a` |

All original modification timestamps were between 2026-10-19 08:42:01 and 08:42:06 UTC. The investigator did not modify, move, delete, or extract into either original backup root. Subsequent development belongs in the separate workspace `C:\Users\kimyo\Documents\Codex\2026-10-19\task-3\game`.

## Decision

Proceed from the actual design document, prompt pack, and supplied assets, preserving the originals. Re-establish every M00/S00–S16 gate against the new working tree. Ports remain 5386 for development and 4386 for preview. Original puzzle answer counts remain **1 / 1 / 1 / 3 / 2 / 1** and must be independently verified by the implementation.
