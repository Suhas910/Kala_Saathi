"""
Generate the synthetic photo fixtures the quality assessor is tested against.

    python -m app.ai.fixtures.generate_image_fixtures

## Why synthetic, and what that costs

These are **not** photographs of craft products and must never be shown as such.
`TEAM_BUILD_GUIDE.md` requires that synthetic data be visibly marked, so every file
lands in `fixtures/images/synthetic/` and every fixture carries its intended defect in
its filename.

What they buy: each defect is introduced by one known operation on one known base
image, so a test can assert "the assessor grades the blurred variant as blurred"
without a human ever having labelled anything. The suite runs identically on any
machine with no download, which is what lets it run in CI on every commit.

What they do not buy: any evidence about real photographs. A detector tuned only on
these would be tuned on Gaussian blur and linear exposure scaling, which is not what a
cheap phone sensor in a dim workshop actually does. They are a regression harness and
a threshold starting point. The consented evaluation set in `TEAM_BUILD_GUIDE.md` is
the thing that decides whether the assessor works.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

OUT_DIR = Path(__file__).resolve().parent / "images" / "synthetic"

# Fixed so every machine generates byte-identical fixtures.
SEED = 20260909
SIZE = (1400, 1050)  # width, height


def _background(width: int, height: int, rng: np.random.Generator) -> np.ndarray:
    """A plain, slightly uneven surface -- a table or a cloth backdrop."""
    vertical = np.linspace(0.78, 0.66, height, dtype=np.float32)[:, None]
    horizontal = np.linspace(0.98, 1.02, width, dtype=np.float32)[None, :]
    base = vertical * horizontal
    grain = rng.normal(0.0, 0.012, size=(height, width)).astype(np.float32)
    field = np.clip(base + grain, 0.0, 1.0)
    # Faintly warm, the way indoor light usually is.
    return np.dstack([field * 0.96, field * 0.98, field]).astype(np.float32)


def _woven_panel(width: int, height: int, rng: np.random.Generator) -> np.ndarray:
    """A textile-like panel: warp and weft interference plus a border stripe.

    The texture matters. A flat coloured rectangle has almost no high-frequency
    content, so a blur detector would have nothing to lose and the blurred fixture
    would be graded sharp.
    """
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
    warp = 0.5 + 0.5 * np.sin(xs * 1.15)
    weft = 0.5 + 0.5 * np.sin(ys * 1.15)
    weave = (warp * weft) * 0.45 + 0.55
    weave += rng.normal(0.0, 0.03, size=(height, width)).astype(np.float32)

    panel = np.dstack([weave * 0.30, weave * 0.22, weave * 0.62]).astype(np.float32)  # BGR: deep red

    border = max(6, width // 22)
    gold = np.array([0.20, 0.62, 0.80], dtype=np.float32)
    stripe = (0.75 + 0.25 * np.sin(np.arange(height, dtype=np.float32) * 0.9))[:, None, None]
    panel[:, :border] = gold * stripe
    panel[:, -border:] = gold * stripe
    return np.clip(panel, 0.0, 1.0)


def compose(
    *,
    subject_scale: float = 0.60,
    centre_offset: tuple[float, float] = (0.0, 0.0),
    seed: int = SEED,
) -> np.ndarray:
    """Place a woven panel on a background. Returns float BGR in 0..1."""
    rng = np.random.default_rng(seed)
    width, height = SIZE
    canvas = _background(width, height, rng)

    panel_w = max(8, int(width * subject_scale))
    panel_h = max(8, int(height * subject_scale * 0.72))
    panel = _woven_panel(panel_w, panel_h, rng)

    cx = int(width / 2 + centre_offset[0] * width)
    cy = int(height / 2 + centre_offset[1] * height)
    x0 = int(np.clip(cx - panel_w // 2, 0, width - panel_w))
    y0 = int(np.clip(cy - panel_h // 2, 0, height - panel_h))
    canvas[y0:y0 + panel_h, x0:x0 + panel_w] = panel

    # A soft contact shadow, so the subject/background split is not a perfect step edge.
    shadow = np.zeros((height, width), dtype=np.float32)
    shadow[y0:y0 + panel_h, x0:x0 + panel_w] = 1.0
    shadow = cv2.GaussianBlur(shadow, (0, 0), 9)
    edge = np.clip(shadow - (shadow > 0.99), 0, 1)[:, :, None]
    return np.clip(canvas * (1.0 - 0.18 * edge), 0.0, 1.0)


def _to_u8(image: np.ndarray) -> np.ndarray:
    return np.clip(image * 255.0, 0, 255).astype(np.uint8)


def build() -> dict[str, np.ndarray]:
    """Every fixture, keyed by filename stem. Each defect is one known operation."""
    good = compose()

    small_subject = compose(subject_scale=0.11)
    # Large enough to clear the "too small" rule, so this fixture isolates centring.
    off_centre = compose(subject_scale=0.45, centre_offset=(0.30, 0.24))

    fixtures = {
        "good": _to_u8(good),
        # Gaussian blur: removes the high-frequency weave the Laplacian measures.
        "blurred": _to_u8(cv2.GaussianBlur(good, (0, 0), 6.0)),
        # Linear scale down, then clip: crushes shadow detail to black.
        "underexposed": _to_u8(np.clip(good * 0.16, 0.0, 1.0)),
        # Linear scale up, then clip: blows highlights to white irrecoverably.
        "overexposed": _to_u8(np.clip(good * 2.9, 0.0, 1.0)),
        "subject_too_small": _to_u8(small_subject),
        "off_centre": _to_u8(off_centre),
        # Below the resolution floor: detail is genuinely absent, not merely soft.
        "low_resolution": cv2.resize(_to_u8(good), (480, 360), interpolation=cv2.INTER_AREA),
    }
    return fixtures


def write(out_dir: Path = OUT_DIR) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for stem, image in build().items():
        path = out_dir / f"{stem}.png"
        if not cv2.imwrite(str(path), image):
            raise RuntimeError(f"Failed to write {path}")
        written.append(path)

    (out_dir / "README.md").write_text(
        "# Synthetic photo fixtures\n\n"
        "Generated by `app/ai/fixtures/generate_image_fixtures.py`. Regenerate with:\n\n"
        "    python -m app.ai.fixtures.generate_image_fixtures\n\n"
        "These are **synthetic test images, not photographs of craft products**, and must\n"
        "never be presented as artisan data or as evidence that the assessor works on real\n"
        "photographs. Each filename names the single defect introduced into the base image.\n"
        "They exist so the quality assessor has a deterministic regression harness that\n"
        "runs in CI without a download.\n",
        encoding="utf-8",
    )
    return written


if __name__ == "__main__":
    for path in write():
        print(path)
