"""Export reviewed detections into a one-class YOLO product dataset.

This is intentionally conservative: only positive review decisions are exported
as class 0 = product. Negative decisions are skipped, but they can still be used
later as hard-negative images during detector training.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.database import SessionLocal
from app.models import DetectionReview, RecognitionSession

POSITIVE_DECISIONS = {
    "accepted",
    "corrected_product",
    "box_adjusted",
    "manually_added",
}

DATA_YAML = """path: {dataset_root}
train: images/train
val: images/val
names:
  0: product
"""


def _box_for_review(review: DetectionReview) -> tuple[float, float, float, float]:
    corrected = (
        review.corrected_box_x1,
        review.corrected_box_y1,
        review.corrected_box_x2,
        review.corrected_box_y2,
    )
    if all(value is not None for value in corrected):
        return tuple(float(value) for value in corrected)

    return (
        float(review.original_box_x1),
        float(review.original_box_y1),
        float(review.original_box_x2),
        float(review.original_box_y2),
    )


def _normalise_yolo_box(
    box: tuple[float, float, float, float],
    width: int,
    height: int,
) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = box
    x1 = max(0.0, min(x1, float(width)))
    y1 = max(0.0, min(y1, float(height)))
    x2 = max(0.0, min(x2, float(width)))
    y2 = max(0.0, min(y2, float(height)))

    box_width = max(0.0, x2 - x1)
    box_height = max(0.0, y2 - y1)
    x_center = x1 + box_width / 2
    y_center = y1 + box_height / 2

    return (
        x_center / width,
        y_center / height,
        box_width / width,
        box_height / height,
    )


def export_dataset(output_dir: Path, val_every: int = 5) -> int:
    output_dir.mkdir(parents=True, exist_ok=True)
    for split in ("train", "val"):
        (output_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (output_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    exported_boxes = 0
    db = SessionLocal()
    try:
        sessions = (
            db.query(RecognitionSession)
            .join(DetectionReview, DetectionReview.session_id == RecognitionSession.id)
            .filter(DetectionReview.user_decision.in_(tuple(POSITIVE_DECISIONS)))
            .order_by(RecognitionSession.id)
            .distinct()
            .all()
        )

        for index, session in enumerate(sessions, start=1):
            image_path = Path(session.original_image_path)
            if not image_path.exists():
                continue

            split = "val" if val_every > 0 and index % val_every == 0 else "train"
            image_name = f"session_{session.id}.jpg"
            label_name = f"session_{session.id}.txt"
            target_image = output_dir / "images" / split / image_name
            target_label = output_dir / "labels" / split / label_name

            with Image.open(image_path) as image:
                width, height = image.size
                if width <= 0 or height <= 0:
                    continue

                reviews = (
                    db.query(DetectionReview)
                    .filter(DetectionReview.session_id == session.id)
                    .filter(DetectionReview.user_decision.in_(tuple(POSITIVE_DECISIONS)))
                    .order_by(DetectionReview.detection_index)
                    .all()
                )
                label_lines = []
                for review in reviews:
                    yolo_box = _normalise_yolo_box(
                        _box_for_review(review),
                        width,
                        height,
                    )
                    if yolo_box[2] <= 0 or yolo_box[3] <= 0:
                        continue
                    label_lines.append(
                        "0 " + " ".join(f"{value:.6f}" for value in yolo_box)
                    )

            if not label_lines:
                continue

            shutil.copyfile(image_path, target_image)
            target_label.write_text(
                "\n".join(label_lines) + "\n",
                encoding="utf-8",
            )
            exported_boxes += len(label_lines)
    finally:
        db.close()

    (output_dir / "data.yaml").write_text(
        DATA_YAML.format(dataset_root=output_dir.as_posix()),
        encoding="utf-8",
    )
    return exported_boxes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        default="datasets/yolo_product",
        help="YOLO dataset output directory",
    )
    parser.add_argument(
        "--val-every",
        type=int,
        default=5,
        help="Place every Nth exported detection in val. Use 0 for train-only.",
    )
    args = parser.parse_args()

    exported = export_dataset(Path(args.output_dir), val_every=args.val_every)
    print(f"Exported {exported} reviewed detections to {args.output_dir}")


if __name__ == "__main__":
    main()
