"""
Photo quality assessor.

The first gate in the pipeline, and the one that protects every later stage: no
deterministic enhancement recovers a photo with no recoverable detail in it, and
`TEAM_BUILD_GUIDE.md` forbids inventing detail that was never captured. So a bad
capture must be caught and re-shot, not "fixed".

Everything here is measurement, not inference. There is no model, no weights and no
network call. Given the same bytes it returns the same verdict on any machine, which
is what makes the retake guidance testable and the failure modes explainable to the
artisan in one sentence.

## About the thresholds

The numbers in `QualityThresholds` are **engineering knobs, not measured constants**,
and nothing in the pitch should present them as findings. They were set to separate
the synthetic fixture set in `fixtures/images/`, which is a starting point and not
evidence about real photographs. Calibrate them against the consented evaluation set
described in `TEAM_BUILD_GUIDE.md` before the pilot, and record what changed.

A threshold that has not been calibrated on real craft photographs taken on real
low-end phones in real workshop lighting is a guess. It is a *defensible* guess --
every metric below is a standard, published image measure -- but the code should not
imply more than that, so `QualityReport.metrics` always carries the raw numbers
alongside the grade.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from ..contracts import QualityLevel, QualityReport

# Blur and framing are resolution-dependent measures. Every image is scaled to this
# long edge before measurement so a 12 MP phone photo and a 2 MP one are graded on the
# same scale. Without this, "sharpness" would mostly measure the camera.
ANALYSIS_LONG_EDGE = 1024


@dataclass(frozen=True)
class QualityThresholds:
    """Provisional. See the module docstring before quoting any of these anywhere."""

    # Capture resolution below which detail is genuinely absent rather than soft.
    min_long_edge_px: int = 640

    # Variance of the Laplacian on a 0..1 grayscale image at ANALYSIS_LONG_EDGE.
    # Higher is sharper.
    blur_acceptable_above: float = 2.0e-3
    blur_unacceptable_below: float = 4.0e-4

    # Fraction of pixels crushed to black or blown to white. Clipped pixels have lost
    # their information permanently; no exposure correction brings them back.
    clip_needs_correction_above: float = 0.02
    clip_unacceptable_above: float = 0.12

    # Mean luminance, 0..1. Outside this band the whole frame is mis-exposed.
    luma_low: float = 0.18
    luma_high: float = 0.88

    # Subject area as a fraction of the frame.
    subject_small_below: float = 0.10
    subject_tiny_below: float = 0.02
    subject_cropped_above: float = 0.92

    # Distance of the subject centre from the frame centre, as a fraction of the
    # frame's half-diagonal.
    off_centre_above: float = 0.30


DEFAULT_THRESHOLDS = QualityThresholds()


def _worst(*levels: QualityLevel) -> QualityLevel:
    order: list[QualityLevel] = ["acceptable", "needs_correction", "unacceptable"]
    return max(levels, key=order.index)


def load_image(source: Path | str | np.ndarray) -> np.ndarray:
    """Read an image as BGR uint8. Raises ValueError rather than returning None."""
    if isinstance(source, np.ndarray):
        return source
    path = Path(source)
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not read an image from {path}")
    return image


def _contrast_normalised(gray: np.ndarray) -> np.ndarray:
    """Stretch 2nd..98th percentile to 0..1, so sharpness is independent of exposure.

    Percentiles rather than min/max: a single hot pixel or one crushed shadow must not
    set the scale for the whole frame.
    """
    low, high = np.percentile(gray, (2.0, 98.0))
    if high - low < 1e-4:
        return gray  # a flat frame has no detail to rescale
    return np.clip((gray - low) / (high - low), 0.0, 1.0).astype(np.float32)


def _analysis_copy(image: np.ndarray) -> np.ndarray:
    """Scale to a fixed long edge so measures are comparable across cameras."""
    height, width = image.shape[:2]
    long_edge = max(height, width)
    if long_edge == ANALYSIS_LONG_EDGE:
        return image
    scale = ANALYSIS_LONG_EDGE / long_edge
    interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR
    return cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=interpolation)


def subject_mask(image: np.ndarray) -> np.ndarray:
    """Separate the product from its background, deterministically.

    Craft product photos share a useful property: the object is somewhere in the middle
    and the background is whatever surrounds it at the frame edge. So estimate the
    background from a border band, measure every pixel's distance from it, and take
    Otsu's threshold of that distance map.

    This is not segmentation and does not pretend to be. It is good enough to answer
    "is the product big enough and roughly centred", which is the only question the
    framing grade asks. A real segmentation model would be a dependency, a download and
    a source of non-determinism, in exchange for precision this grade does not need.
    """
    blurred = cv2.GaussianBlur(image, (5, 5), 0)
    lab = cv2.cvtColor(blurred, cv2.COLOR_BGR2LAB).astype(np.float32)

    height, width = lab.shape[:2]
    band = max(1, min(height, width) // 20)
    border = np.concatenate([
        lab[:band].reshape(-1, 3),
        lab[-band:].reshape(-1, 3),
        lab[:, :band].reshape(-1, 3),
        lab[:, -band:].reshape(-1, 3),
    ])
    background = np.median(border, axis=0)

    distance = np.linalg.norm(lab - background, axis=2)
    peak = float(distance.max())
    if peak <= 1e-6:
        return np.zeros((height, width), dtype=np.uint8)

    scaled = np.clip(distance / peak * 255.0, 0, 255).astype(np.uint8)
    _, mask = cv2.threshold(scaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    # Keep only the largest connected region: reflections and stray objects should not
    # inflate the subject area.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count <= 1:
        return mask
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return np.where(labels == largest, 255, 0).astype(np.uint8)


def subject_bbox(image: np.ndarray) -> tuple[int, int, int, int] | None:
    """(x, y, w, h) of the detected subject, or None when nothing separates."""
    mask = subject_mask(image)
    if not mask.any():
        return None
    xs = np.flatnonzero(mask.any(axis=0))
    ys = np.flatnonzero(mask.any(axis=1))
    return int(xs[0]), int(ys[0]), int(xs[-1] - xs[0] + 1), int(ys[-1] - ys[0] + 1)


def measure(image: np.ndarray) -> dict[str, float]:
    """Every raw number the grades are derived from. No thresholds applied here."""
    original_long_edge = float(max(image.shape[:2]))
    analysis = _analysis_copy(image)
    gray = cv2.cvtColor(analysis, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0

    # Sharpness is measured on an exposure-normalised copy, and this is not a detail.
    # The variance of the Laplacian scales with image contrast, so darkening a photo
    # lowers it without touching focus. Measured raw, a sharp photo taken in a dim
    # workshop grades as blurred -- and the app would tell the artisan to hold the
    # phone steadier when the actual problem is the light. Stretching between the 2nd
    # and 98th percentiles first separates "no detail" from "little light", which are
    # different problems with different retake instructions.
    laplacian_var = float(cv2.Laplacian(_contrast_normalised(gray), cv2.CV_32F, ksize=3).var())

    total = float(gray.size)
    shadow_clip = float((gray <= 2 / 255).sum()) / total
    highlight_clip = float((gray >= 253 / 255).sum()) / total
    mean_luma = float(gray.mean())

    metrics = {
        "long_edge_px": original_long_edge,
        "blur_laplacian_var": laplacian_var,
        "shadow_clip_frac": shadow_clip,
        "highlight_clip_frac": highlight_clip,
        "mean_luma": mean_luma,
        "subject_area_frac": 0.0,
        "subject_centre_offset": 0.0,
    }

    box = subject_bbox(analysis)
    if box is not None:
        x, y, w, h = box
        frame_h, frame_w = analysis.shape[:2]
        metrics["subject_area_frac"] = (w * h) / float(frame_w * frame_h)
        centre = np.array([x + w / 2.0, y + h / 2.0])
        frame_centre = np.array([frame_w / 2.0, frame_h / 2.0])
        half_diagonal = float(np.hypot(frame_w, frame_h) / 2.0)
        metrics["subject_centre_offset"] = float(np.linalg.norm(centre - frame_centre) / half_diagonal)

    return metrics


def assess(
    source: Path | str | np.ndarray,
    thresholds: QualityThresholds = DEFAULT_THRESHOLDS,
) -> QualityReport:
    """Grade a photograph and say, in plain words, what to do about it.

    Guidance is written for the artisan, not the developer: it names an action ("move
    to a window"), never a metric ("luminance 0.11"). The numbers stay in `metrics`
    for whoever is calibrating.
    """
    image = load_image(source)
    metrics = measure(image)
    guidance: list[str] = []

    # ---- sharpness
    blur_var = metrics["blur_laplacian_var"]
    if metrics["long_edge_px"] < thresholds.min_long_edge_px:
        blur: QualityLevel = "unacceptable"
        guidance.append("The photo is too small. Use the main camera at its normal size.")
    elif blur_var < thresholds.blur_unacceptable_below:
        blur = "unacceptable"
        guidance.append("The photo is blurred. Hold the phone still, or rest it on something, and take it again.")
    elif blur_var < thresholds.blur_acceptable_above:
        blur = "needs_correction"
        guidance.append("The photo is slightly soft. Tap the screen on the product before taking it again.")
    else:
        blur = "acceptable"

    # ---- exposure
    clipped = metrics["shadow_clip_frac"] + metrics["highlight_clip_frac"]
    if clipped > thresholds.clip_unacceptable_above:
        lighting: QualityLevel = "unacceptable"
    elif clipped > thresholds.clip_needs_correction_above or not (
        thresholds.luma_low <= metrics["mean_luma"] <= thresholds.luma_high
    ):
        lighting = "needs_correction"
    else:
        lighting = "acceptable"

    if lighting != "acceptable":
        # Direction matters more than the grade: "too dark" and "too bright" have
        # opposite remedies, and an artisan told to move out of the sun because their
        # photo was too dark will reasonably stop trusting the advice. Clipping decides
        # when there is any; mean brightness decides when there is none, which is the
        # common case for a merely dim photo.
        clipped_bright = metrics["highlight_clip_frac"] > metrics["shadow_clip_frac"]
        clipped_dark = metrics["shadow_clip_frac"] > metrics["highlight_clip_frac"]
        too_bright = clipped_bright or (not clipped_dark and metrics["mean_luma"] > thresholds.luma_high)
        if too_bright:
            guidance.append("The light is too strong. Move out of direct sun and take it again.")
        else:
            guidance.append("The photo is too dark. Move near a window or add a light and take it again.")

    # ---- framing
    area = metrics["subject_area_frac"]
    if area < thresholds.subject_tiny_below:
        framing: QualityLevel = "unacceptable"
        guidance.append("The product is too far away. Come closer so it fills most of the picture.")
    elif area < thresholds.subject_small_below:
        framing = "needs_correction"
        guidance.append("The product is small in the picture. Come a little closer.")
    elif area > thresholds.subject_cropped_above:
        framing = "needs_correction"
        guidance.append("The product touches the edges. Step back so the whole piece is inside the picture.")
    elif metrics["subject_centre_offset"] > thresholds.off_centre_above:
        framing = "needs_correction"
        guidance.append("The product is off to one side. Point the camera at the middle of it.")
    else:
        framing = "acceptable"

    return QualityReport(
        overall=_worst(blur, lighting, framing),
        blur=blur,
        lighting=lighting,
        framing=framing,
        guidance=guidance,
        metrics={k: round(v, 6) for k, v in metrics.items()},
    )
