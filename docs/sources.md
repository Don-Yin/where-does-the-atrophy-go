# Source and credits

## Source, checks and attribution

- [`pipeline/run.py`](../pipeline/run.py) exposes `register`, `slices`, `compare`, `weighted`, `assets`; [`weighted_volume.py`](../pipeline/src/modules/weighted_volume.py) implements the unclipped voxel sum. [`pipeline/README.md`](../pipeline/README.md) gives the full method, pinned raw identity, path overrides and resumption rules.
- Run the focused Python regressions with `cd pipeline && micromamba run -n ants-reg python -m unittest discover -s tests -v`. They cover physical voxel volume, orientation/grid agreement, invalid inputs, pipeline output, profiling and nonzero failure exits.
- [`Assets/Scripts/`](../Assets/Scripts/) owns placement, dragging, slices, inspection and scripted clinicians. Existing Lens integration tests (LEAF) and separate compilation/runtime records are indexed in [`devpost/evidence/leaf-results.json`](../devpost/evidence/leaf-results.json) and the [build report](../devpost/build-report.md). Those retained Preview records are not new device evidence.
- The [design brief](../devpost/design-brief.md) and [build account](../devpost/devpost-description.md#how-i-built-it) record the interaction design and the use of Snap's building-agent workflow (CLAD) from the Pi coding agent through Lens Studio's Model Context Protocol (MCP) tools. Workflow attribution is not a complete tool-call transcript.

## Licences

Project-authored code is MIT licensed; see [`LICENSE`](../LICENSE). That licence does **not** replace third-party terms for Snap packages, Bitmoji, medical data or other content.

The ICBM152 template retains its MNI/McGill copyright and template licence. Downloading through TemplateFlow does not change those terms. ANTsPy and the TemplateFlow client are Apache-2.0; the OpenNeuro data is CC0. No FSL executable, template or atlas is used or shipped in the current medical assets. Keep [`NOTICE`](../NOTICE) and [`third-party-licenses/`](../third-party-licenses/) with the relevant content.
