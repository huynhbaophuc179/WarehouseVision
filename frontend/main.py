import base64
import os
from io import BytesIO
from pathlib import Path

import requests
import streamlit as st
import streamlit.components.v1 as components
from PIL import Image, ImageDraw, ImageOps


BOX_CANVAS_COMPONENT_DIR = Path(__file__).parent / "box_canvas_component"
box_canvas_component = components.declare_component(
    "box_canvas_component",
    path=str(BOX_CANVAS_COMPONENT_DIR),
)

API_URL = "http://api:8000/api/v1"
DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD = float(
    os.getenv("DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD", "0.45")
)

st.set_page_config(page_title="Hệ thống kiểm kho AI", layout="wide")

PAGE_OPERATION = "Nhận diện / Kiểm kho"
PAGE_PRODUCTS = "Quản lý sản phẩm"
PAGE_TRAINING = "Rà soát & sửa lỗi AI"
PAGE_DRAW_BOX = "Vẽ vùng sản phẩm bị thiếu"
PAGE_DATASET = "Dữ liệu huấn luyện AI"
PAGE_SETTINGS = "Cài đặt"
OPERATION_HIDE_DEBUG_KEY = "operation_hide_debug_info"
OPERATION_INVENTORY_ACTION_KEY = "operation_inventory_action"
OPERATION_GLOBAL_QUANTITY_KEY = "operation_global_quantity"

if OPERATION_HIDE_DEBUG_KEY not in st.session_state:
    st.session_state[OPERATION_HIDE_DEBUG_KEY] = True
if OPERATION_INVENTORY_ACTION_KEY not in st.session_state:
    st.session_state[OPERATION_INVENTORY_ACTION_KEY] = "stock_in"
if OPERATION_GLOBAL_QUANTITY_KEY not in st.session_state:
    st.session_state[OPERATION_GLOBAL_QUANTITY_KEY] = 1

st.markdown(
    """
    <style>
    .wv-draw-heading {
        font-size: 2rem;
        line-height: 1.15;
        font-weight: 800;
        margin: 1.4rem 0 0.55rem;
    }
    .wv-draw-panel-heading {
        font-size: 1.6rem;
        line-height: 1.2;
        font-weight: 800;
        margin: 0.15rem 0 1rem;
    }
    .wv-draw-caption {
        color: #a3a3a3;
        font-size: 1rem;
        margin-bottom: 1.2rem;
    }
    .wv-status-badge {
        display: inline-block;
        padding: 0.2rem 0.55rem;
        border-radius: 999px;
        font-size: 0.82rem;
        font-weight: 700;
        margin-bottom: 0.35rem;
    }
    .wv-status-recognized {
        background: rgba(34, 197, 94, 0.16);
        color: #4ade80;
    }
    .wv-status-uncertain {
        background: rgba(250, 204, 21, 0.16);
        color: #fde047;
    }
    .wv-status-unknown {
        background: rgba(148, 163, 184, 0.18);
        color: #cbd5e1;
    }
    .wv-area-title {
        font-size: 1.05rem;
        font-weight: 800;
        margin-bottom: 0.25rem;
    }
    .wv-muted {
        color: #a3a3a3;
        font-size: 0.92rem;
    }
    .wv-soft-panel {
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 14px;
        padding: 1rem 1.1rem;
        background: rgba(15, 23, 42, 0.28);
        margin: 0.6rem 0 1rem;
    }
    .wv-hero-title {
        font-size: 1.25rem;
        font-weight: 800;
        margin-bottom: 0.35rem;
    }
    .wv-hero-subtitle {
        color: #a3a3a3;
        line-height: 1.45;
        margin: 0;
    }
    .wv-product-name {
        font-size: 1.2rem;
        font-weight: 800;
        margin: 0.15rem 0 0.2rem;
    }
    .wv-box-number {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2.2rem;
        height: 2.2rem;
        border-radius: 999px;
        background: #2563eb;
        color: #fff;
        font-weight: 800;
        margin-right: 0.5rem;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

choice = st.sidebar.radio(
    "Điều hướng",
    [
        PAGE_OPERATION,
        PAGE_PRODUCTS,
        PAGE_TRAINING,
        PAGE_DRAW_BOX,
        PAGE_DATASET,
        PAGE_SETTINGS,
    ],
    label_visibility="collapsed",
)


def show_debug_info():
    return not bool(st.session_state.get(OPERATION_HIDE_DEBUG_KEY, True))


def build_file_payload(uploaded_file):
    return {
        "file": (
            uploaded_file.name,
            uploaded_file.getvalue(),
            uploaded_file.type or "application/octet-stream",
        )
    }


def build_file_payload_from_bytes(filename, content, mime_type):
    return {"file": (filename, content, mime_type)}


def uploaded_file_base64(uploaded_file):
    return base64.b64encode(uploaded_file.getvalue()).decode("ascii")


def uploaded_file_image(uploaded_file):
    image = ImageOps.exif_transpose(Image.open(BytesIO(uploaded_file.getvalue()))).convert("RGB")
    image.load()
    return image


def crop_uploaded_file_bytes(uploaded_file, box):
    image = uploaded_file_image(uploaded_file)
    clamped_box = clamp_box_to_image(box, image.size)
    left, top, right, bottom = [int(round(value)) for value in clamped_box]
    crop = image.crop((left, top, right, bottom))
    buffer = BytesIO()
    crop.save(buffer, format="JPEG", quality=94)
    filename = f"{Path(uploaded_file.name).stem}_crop.jpg"
    return filename, buffer.getvalue(), "image/jpeg", crop


def uploaded_file_signature(uploaded_file, index):
    raw_signature = f"{index}_{uploaded_file.name}_{len(uploaded_file.getvalue())}"
    return "".join(
        character if character.isalnum() else "_"
        for character in raw_signature
    )


def upload_reference_image(product_id, uploaded_file, view_label, use_full_image=False):
    data = {}
    if view_label:
        data["view_label"] = view_label
    data["use_full_image"] = "true" if use_full_image else "false"

    return requests.post(
        f"{API_URL}/products/{product_id}/embeddings",
        files=build_file_payload(uploaded_file),
        data=data,
        timeout=120,
    )


def upload_reference_image_payload(
    product_id,
    file_payload,
    view_label=None,
    use_full_image=False,
):
    data = {}
    if view_label:
        data["view_label"] = view_label
    data["use_full_image"] = "true" if use_full_image else "false"

    return requests.post(
        f"{API_URL}/products/{product_id}/embeddings",
        files=file_payload,
        data=data,
        timeout=120,
    )


def fetch_products(search=None, limit=100):
    params = {"limit": limit}
    if search:
        params["search"] = search
    response = requests.get(f"{API_URL}/products", params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def delete_product_api(product_id):
    return requests.delete(f"{API_URL}/products/{product_id}", timeout=30)


def draw_annotated_image(image_bytes, detections):
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    draw = ImageDraw.Draw(image)

    for index, item in enumerate(detections, start=1):
        box = item["box"]
        left, top, right, bottom = [float(value) for value in box]
        status = item["status"]
        if status == "recognized":
            color = "#16a34a"
        elif status == "uncertain":
            color = "#eab308"
        else:
            color = "#f97316"
        label = str(index)

        draw.rectangle((left, top, right, bottom), outline=color, width=4)
        label_box = (left, max(0, top - 24), left + 34, top)
        draw.rectangle(label_box, fill=color)
        draw.text((left + 8, max(0, top - 22)), label, fill="white")

    return image


def format_distance(distance):
    return f"{distance:.4f}" if distance is not None else "-"


def format_confidence(confidence):
    return f"{confidence:.3f}" if confidence is not None else "-"


def format_score(score):
    return f"{score:.2f}" if score is not None else "-"


def status_label(status):
    labels = {
        "recognized": "Đã nhận diện",
        "uncertain": "Cần kiểm tra",
        "unknown": "Chưa xác định",
    }
    return labels.get(status, status)


def confidence_label(level):
    labels = {
        "HIGH": "Tin cậy cao",
        "MEDIUM": "Cần xác nhận",
        "LOW": "Tin cậy thấp",
        "UNKNOWN": "Không đủ dữ liệu",
    }
    return labels.get(level or "UNKNOWN", level or "Không đủ dữ liệu")


def mode_label(mode):
    labels = {
        "operation": "vận hành",
        "training": "huấn luyện",
        "review": "rà soát",
    }
    return labels.get(mode, mode or "-")


def review_decision_label(decision):
    labels = {
        "accepted": "Chấp nhận đúng",
        "wrong_sku": "Sai mã sản phẩm",
        "corrected_product": "Đã sửa sản phẩm",
        "not_product": "Không phải sản phẩm",
        "unknown": "Không xác định",
        "rejected_detection": "Loại vùng phát hiện",
        "box_adjusted": "Đã chỉnh vùng",
        "manually_added": "Người dùng thêm vùng",
        "ignored": "Bỏ qua",
        "needs_review": "Cần rà soát",
    }
    return labels.get(decision, decision or "-")


def session_status_label(status):
    labels = {
        "open": "đang mở",
        "reviewed": "đã rà soát",
        "closed": "đã đóng",
        "deleted": "đã xóa",
    }
    return labels.get(status, status or "-")


def quality_status_label(status):
    labels = {
        "pending": "Chờ duyệt",
        "approved": "Đã duyệt",
        "auto_approved": "Tự động duyệt",
        "rejected": "Từ chối",
    }
    return labels.get(status, status or "-")


def source_label(source):
    labels = {
        "user_confirmed_crop": "Ảnh cắt do người dùng xác nhận",
        "manual_upload": "Người dùng tải lên",
        "registration": "Đăng ký sản phẩm",
        "human_missing_box": "Vùng người dùng vẽ bổ sung",
    }
    return labels.get(source, source or "-")


def feedback_status_label(status):
    labels = {
        "success": "Thành công",
        "failed": "Thất bại",
        "skipped": "Bỏ qua",
    }
    return labels.get(status, status or "-")


def inventory_action_label(action):
    labels = {
        "count": "Ghi nhận số đếm",
        "stock_in": "Nhập kho",
        "stock_out": "Xuất kho",
        "adjustment": "Điều chỉnh tồn kho",
    }
    return labels.get(action, action or "-")


def confirmed_inventory_rows(items):
    rows = []
    for item in items:
        rows.append(
            {
                "Mã vùng": item.get("detection_id"),
                "Mã SP": item.get("product_id"),
                "Số lượng": item.get("quantity"),
                "Hành động": inventory_action_label(item.get("action")),
                "Tồn kho mới": item.get("inventory_count"),
            }
        )
    return rows


def rejected_inventory_rows(items):
    rows = []
    reason_labels = {
        "no_predicted_product": "Không có sản phẩm AI đề xuất",
        "missing_manual_product_id": "Thiếu mã sản phẩm nhập tay",
        "marked_unknown": "Người dùng đánh dấu chưa xác định",
        "sent_to_training_review": "Đã gửi sang rà soát AI",
        "rejected_by_user": "Người dùng loại bỏ",
    }
    for item in items:
        reason = item.get("reason")
        rows.append(
            {
                "Mã vùng": item.get("detection_id"),
                "Lý do": reason_labels.get(reason, reason or "-"),
            }
        )
    return rows


def crop_preview_image(crop_preview_base64):
    if not crop_preview_base64:
        return None
    try:
        return Image.open(BytesIO(base64.b64decode(crop_preview_base64)))
    except Exception:
        return None


def image_from_base64(image_base64):
    if not image_base64:
        return None
    try:
        return Image.open(BytesIO(base64.b64decode(image_base64)))
    except Exception:
        return None


def load_image_for_canvas(image_base64):
    image = image_from_base64(image_base64)
    if image is None:
        return None
    image.load()
    return image.convert("RGB")


def display_dimensions(image, max_width=900):
    original_width, original_height = image.size
    if original_width <= max_width:
        return original_width, original_height
    display_width = max_width
    display_height = int(original_height * display_width / original_width)
    return display_width, display_height


def resized_rgb_image(image, size):
    resampling = getattr(Image, "Resampling", Image).LANCZOS
    resized = image.convert("RGB").resize(size, resample=resampling)
    resized.load()
    return resized


def convert_display_box_to_original(
    displayed_box,
    display_width,
    display_height,
    original_width,
    original_height,
):
    scale_x = original_width / display_width
    scale_y = original_height / display_height
    x1, y1, x2, y2 = [float(value) for value in displayed_box]
    return [
        min(x1, x2) * scale_x,
        min(y1, y2) * scale_y,
        max(x1, x2) * scale_x,
        max(y1, y2) * scale_y,
    ]


def convert_original_box_to_display(
    original_box,
    original_width,
    original_height,
    display_width,
    display_height,
):
    scale_x = display_width / original_width
    scale_y = display_height / original_height
    x1, y1, x2, y2 = [float(value) for value in original_box]
    return [
        min(x1, x2) * scale_x,
        min(y1, y2) * scale_y,
        max(x1, x2) * scale_x,
        max(y1, y2) * scale_y,
    ]


def clamp_box_to_image(box, image_size):
    width, height = image_size
    x1, y1, x2, y2 = [float(value) for value in box]
    return [
        max(0.0, min(min(x1, x2), float(width))),
        max(0.0, min(min(y1, y2), float(height))),
        max(0.0, min(max(x1, x2), float(width))),
        max(0.0, min(max(y1, y2), float(height))),
    ]


def box_validation_error(box, image_size, min_size=10.0):
    if not box or len(box) != 4:
        return "Hãy vẽ vùng quanh sản phẩm còn thiếu trước."

    clamped_box = clamp_box_to_image(box, image_size)
    width = clamped_box[2] - clamped_box[0]
    height = clamped_box[3] - clamped_box[1]
    if clamped_box[0] >= clamped_box[2] or clamped_box[1] >= clamped_box[3]:
        return "Vùng đã chọn không hợp lệ."
    if width < min_size or height < min_size:
        return "Vùng đã chọn quá nhỏ."
    return None


def review_box_to_display_box(detection, original_size, display_size):
    original_box = detection.get("corrected_box") or detection.get("original_box")
    if not original_box:
        return None
    original_width, original_height = original_size
    display_width, display_height = display_size
    return {
        "box": convert_original_box_to_display(
            original_box,
            original_width,
            original_height,
            display_width,
            display_height,
        ),
        "label": str(detection.get("detection_index") or detection.get("id") or ""),
        "status": detection.get("user_decision") or "existing",
        "product_id": detection.get("confirmed_product_id")
        or detection.get("predicted_product_id"),
    }


def render_box_canvas_component(
    image_base64,
    image_mime_type,
    display_size,
    initial_box,
    existing_boxes,
    reset_token,
    key,
):
    display_width, display_height = display_size
    return box_canvas_component(
        image_base64=image_base64,
        image_mime_type=image_mime_type or "image/jpeg",
        width=int(display_width),
        height=int(display_height),
        initial_box=initial_box,
        existing_boxes=existing_boxes,
        reset_token=str(reset_token),
        key=key,
        default=None,
    )


def latest_canvas_rect_data(canvas_value, original_size, fallback_display_size):
    if not isinstance(canvas_value, dict):
        return None

    display_box = canvas_value.get("displayed_box") or canvas_value.get("canvas_box")
    if not display_box or len(display_box) != 4:
        return None

    raw_display_size = canvas_value.get("display_size") or fallback_display_size
    display_width = int(raw_display_size[0])
    display_height = int(raw_display_size[1])
    x1, y1, x2, y2 = [float(value) for value in display_box]
    normalized_display_box = [
        max(0.0, min(min(x1, x2), float(display_width))),
        max(0.0, min(min(y1, y2), float(display_height))),
        max(0.0, min(max(x1, x2), float(display_width))),
        max(0.0, min(max(y1, y2), float(display_height))),
    ]
    original_box = convert_display_box_to_original(
        normalized_display_box,
        display_width,
        display_height,
        original_size[0],
        original_size[1],
    )
    corrected_box = clamp_box_to_image(original_box, original_size)
    scale_x = original_size[0] / display_width
    scale_y = original_size[1] / display_height
    return {
        "selection_id": canvas_value.get("selection_id"),
        "canvas_box": normalized_display_box,
        "displayed_box": normalized_display_box,
        "original_box": corrected_box,
        "corrected_box": corrected_box,
        "display_size": [display_width, display_height],
        "scale_x": scale_x,
        "scale_y": scale_y,
        "label": "product",
        "source": "human_missing_box",
    }


def box_is_too_small(box, min_size=10.0):
    return (box[2] - box[0]) < min_size or (box[3] - box[1]) < min_size


def box_outside_image(box, image_size):
    width, height = image_size
    return box[0] < 0 or box[1] < 0 or box[2] > width or box[3] > height


def crop_from_box(image, box):
    x1, y1, x2, y2 = [int(round(value)) for value in box]
    return image.crop((x1, y1, x2, y2))


def render_uploaded_image_crop_selector(uploaded_file, index, title, expanded=False):
    try:
        image = uploaded_file_image(uploaded_file)
    except Exception as exc:
        st.warning(f"Không đọc được ảnh {uploaded_file.name}: {exc}")
        return None, f"Không đọc được ảnh: {exc}"

    original_size = image.size
    display_size = display_dimensions(image, max_width=900)
    file_signature = uploaded_file_signature(uploaded_file, index)
    crop_value_key = f"upload_crop_value_{file_signature}"
    crop_reset_key = f"upload_crop_reset_{file_signature}"
    stored_crop_value = st.session_state.get(crop_value_key)
    initial_crop_box = (
        stored_crop_value.get("displayed_box")
        if isinstance(stored_crop_value, dict)
        and stored_crop_value.get("displayed_box")
        else None
    )

    rect_data = None
    crop_error = None
    st.caption(
        "Kéo chuột để cắt đúng sản phẩm cần lưu. "
        "Nếu không vẽ vùng, hệ thống sẽ dùng toàn bộ ảnh này."
    )
    crop_cols = st.columns([2, 1])
    with crop_cols[0]:
        canvas_value = render_box_canvas_component(
            image_base64=uploaded_file_base64(uploaded_file),
            image_mime_type=uploaded_file.type or "image/jpeg",
            display_size=display_size,
            initial_box=initial_crop_box,
            existing_boxes=[],
            reset_token=st.session_state.get(crop_reset_key, 0),
            key=(
                f"upload_crop_canvas_{file_signature}_"
                f"{st.session_state.get(crop_reset_key, 0)}"
            ),
        )
        if isinstance(canvas_value, dict) and canvas_value.get("displayed_box"):
            st.session_state[crop_value_key] = canvas_value
            stored_crop_value = canvas_value

    rect_data = latest_canvas_rect_data(
        stored_crop_value,
        original_size,
        display_size,
    )
    with crop_cols[1]:
        st.markdown("**Ảnh sẽ lưu**")
        if st.button(
            "Xóa vùng cắt",
            disabled=rect_data is None,
            key=f"clear_upload_crop_{file_signature}",
        ):
            st.session_state.pop(crop_value_key, None)
            st.session_state[crop_reset_key] = (
                st.session_state.get(crop_reset_key, 0) + 1
            )
            st.rerun()

        if rect_data is None:
            st.info("Chưa chọn vùng cắt.")
            st.image(image, use_container_width=True)
        else:
            crop_error = box_validation_error(
                rect_data["original_box"],
                original_size,
            )
            if crop_error:
                st.warning(crop_error)
            else:
                _, _, _, preview_crop = crop_uploaded_file_bytes(
                    uploaded_file,
                    rect_data["original_box"],
                )
                st.image(
                    preview_crop,
                    caption="Ảnh cắt sẽ được lưu vào dữ liệu nhận diện",
                    use_container_width=True,
                )

    return rect_data, crop_error


def manually_added_detections(session):
    return [
        detection
        for detection in session.get("detections", [])
        if detection.get("user_decision") == "manually_added"
    ]


def merge_added_boxes(existing_items, current_items, deleted_ids):
    merged = {}
    for item in [*existing_items, *current_items]:
        item_id = item.get("id")
        if item_id is None or item_id in deleted_ids:
            continue
        merged[item_id] = item
    return sorted(
        merged.values(),
        key=lambda item: item.get("created_at") or item.get("id") or 0,
        reverse=True,
    )


def added_box_title(item, fallback_index):
    product_id = (
        item.get("confirmed_product_id")
        or item.get("predicted_product_id")
        or item.get("external_product_id")
    )
    if product_id:
        return product_id
    return f"Vùng #{item.get('detection_index') or fallback_index}"


def delete_added_box(item, deleted_boxes_key, added_boxes_key):
    item_id = item.get("id")
    if item_id is None:
        st.warning("Vùng này chưa có mã để xóa.")
        return

    try:
        delete_response = requests.delete(
            f"{API_URL}/review/detections/{item_id}",
            timeout=30,
        )
    except requests.RequestException as exc:
        st.error(f"Không xóa được vùng: {exc}")
        return

    if delete_response.status_code != 200:
        st.error(f"Không xóa được vùng: {delete_response.text}")
        return

    deleted_box_ids = set(st.session_state.get(deleted_boxes_key, []))
    deleted_box_ids.add(item_id)
    st.session_state[deleted_boxes_key] = list(deleted_box_ids)
    st.session_state[added_boxes_key] = [
        added_item
        for added_item in st.session_state.get(added_boxes_key, [])
        if added_item.get("id") != item_id
    ]
    st.toast("Đã xóa vùng đã thêm.")
    st.rerun()


def render_added_boxes_grid(added_boxes, session_id, key_prefix, deleted_boxes_key, added_boxes_key):
    if not added_boxes:
        return

    st.markdown("### Vùng đã lưu")
    st.caption("Các vùng đã chọn được xếp bên dưới. Bấm × nếu chọn nhầm.")

    for row_start in range(0, len(added_boxes), 4):
        row_items = added_boxes[row_start : row_start + 4]
        columns = st.columns(4)
        for offset, item in enumerate(row_items):
            item_index = row_start + offset + 1
            item_id = item.get("id")
            preview = crop_preview_image(item.get("crop_preview_base64"))
            with columns[offset]:
                with st.container(border=True):
                    title_cols = st.columns([5, 1])
                    with title_cols[0]:
                        st.markdown(f"**{item_index}. {added_box_title(item, item_index)}**")
                    with title_cols[1]:
                        if st.button(
                            "×",
                            key=f"{key_prefix}_delete_added_box_{session_id}_{item_id}",
                            help="Xóa vùng này",
                            disabled=item_id is None,
                        ):
                            delete_added_box(item, deleted_boxes_key, added_boxes_key)

                    if preview is not None:
                        st.image(preview, width="stretch")
                    else:
                        st.caption("Không có ảnh cắt.")

                    box = item.get("corrected_box") or item.get("original_box")
                    if box and show_debug_info():
                        st.caption(
                            "Tọa độ: "
                            + ", ".join(f"{float(value):.0f}" for value in box)
                        )


def operation_result_rows(results):
    rows = []
    grouped = {}
    for detection_index, item in enumerate(results, start=1):
        key = item.get("product_id") or f"unknown_{item['detection_id']}"
        grouped.setdefault(
            key,
            {
                "areas": [],
                "product_id": item.get("product_id") or "-",
                "name": item.get("name") or "Chưa xác định",
                "inventory_count": str(item.get("inventory_count"))
                if item.get("inventory_count") is not None
                else "-",
                "status": status_label(item["status"]),
                "confidence_level": confidence_label(item.get("confidence_level")),
                "detections": 0,
            },
        )
        grouped[key]["detections"] += 1
        grouped[key]["areas"].append(f"#{detection_index}")

    for index, item in enumerate(grouped.values(), start=1):
        rows.append(
            {
                "STT": index,
                "Vùng": ", ".join(item["areas"]),
                "Mã SP": item["product_id"],
                "Tên": item["name"],
                "Tồn kho": item["inventory_count"],
                "Trạng thái": item["status"],
                "Độ tin cậy": item["confidence_level"],
                "Số vùng": item["detections"],
            }
        )
    return rows


def detection_table_rows(results):
    rows = []
    for index, item in enumerate(results, start=1):
        rows.append(
            {
                "STT": index,
                "Mã vùng": item["detection_id"],
                "Tọa độ vùng": ", ".join(f"{value:.1f}" for value in item["box"]),
                "Trạng thái": status_label(item["status"]),
                "Mã SP": item["product_id"] or "-",
                "Tên": item["name"] or "-",
                "Tồn kho": str(item["inventory_count"])
                if item["inventory_count"] is not None
                else "-",
                "Độ tin cậy vùng": format_confidence(item.get("detector_confidence")),
                "Khoảng cách 1": format_distance(item.get("top1_distance")),
                "Khoảng cách 2": format_distance(item.get("top2_distance")),
                "Độ chênh": format_distance(item.get("distance_margin")),
                "Mã ảnh tham chiếu": item.get("matched_embedding_id") or "-",
                "Góc ảnh": item.get("matched_view_label") or "-",
            }
        )

    return rows


def crop_preview_data_url(item):
    crop_base64 = item.get("crop_preview_base64")
    if not crop_base64:
        return None
    return f"data:image/jpeg;base64,{crop_base64}"


def operation_detection_rows(results):
    rows = []
    for index, item in enumerate(results, start=1):
        rows.append(
            {
                "Vùng": f"#{index}",
                "Ảnh cắt": crop_preview_data_url(item),
                "Mã SP": item.get("product_id") or "-",
                "Tên": item.get("name") or "Chưa xác định",
                "Tồn kho": str(item.get("inventory_count"))
                if item.get("inventory_count") is not None
                else "-",
                "Trạng thái": status_label(item["status"]),
                "Độ tin cậy": confidence_label(item.get("confidence_level")),
            }
        )
    return rows


def status_badge_class(status):
    if status == "recognized":
        return "wv-status-recognized"
    if status == "uncertain":
        return "wv-status-uncertain"
    return "wv-status-unknown"


def candidate_display_name(candidate):
    return (
        candidate.get("product_name")
        or candidate.get("name")
        or candidate.get("product_code")
        or candidate.get("product_id")
        or "Sản phẩm"
    )


def operation_default_decision(item):
    if item.get("status") == "recognized" and item.get("product_id"):
        return "confirm"
    if not item.get("product_id"):
        return "unknown"
    return "report"


def operation_decision_options(item):
    if item.get("product_id"):
        return ["confirm", "manual", "unknown", "reject", "report"]
    return ["manual", "unknown", "reject", "report"]


def operation_decision_label(decision):
    labels = {
        "confirm": "Chấp nhận",
        "manual": "Đổi mã",
        "unknown": "Chưa rõ",
        "reject": "Từ chối",
        "report": "Rà soát sau",
    }
    return labels.get(decision, decision or "-")


def operation_decision_counts(results):
    counts = {"accepted": 0, "rejected": 0, "pending": 0}
    for item in results:
        decision = st.session_state.get(
            f"decision_{item['detection_id']}",
            operation_default_decision(item),
        )
        if decision in {"confirm", "manual"}:
            counts["accepted"] += 1
        elif decision in {"reject", "unknown", "report"}:
            counts["rejected"] += 1
        else:
            counts["pending"] += 1
    return counts


def set_detection_decision(item, decision):
    detection_id = item["detection_id"]
    st.session_state[f"decision_{detection_id}"] = decision


def set_all_operation_decisions(results, decision):
    for item in results:
        if decision == "confirm" and not item.get("product_id"):
            set_detection_decision(item, "unknown")
        else:
            set_detection_decision(item, decision)


def duplicate_product_ids(results):
    counts = {}
    for item in results:
        product_id = item.get("product_id")
        if product_id:
            counts[product_id] = counts.get(product_id, 0) + 1
    return [product_id for product_id, count in counts.items() if count > 1]


def clear_confirmation_state():
    prefixes = (
        "decision_",
        "manual_product_",
        "quantity_",
        "action_",
        "reject_reason_",
        "add_reference_",
        "use_yolo_training_",
    )
    for key in list(st.session_state.keys()):
        if key.startswith(prefixes):
            st.session_state.pop(key, None)
    st.session_state[OPERATION_INVENTORY_ACTION_KEY] = "stock_in"
    st.session_state[OPERATION_GLOBAL_QUANTITY_KEY] = 1


def review_payload_for_item(item):
    detection_id = item["detection_id"]
    decision = st.session_state.get(f"decision_{detection_id}", "confirm")
    add_as_reference = bool(st.session_state.get(f"add_reference_{detection_id}", False))
    use_for_yolo_training = bool(
        st.session_state.get(f"use_yolo_training_{detection_id}", False)
    )

    if decision == "confirm":
        confirmed_product_id = item.get("product_id")
        user_decision = "accepted" if confirmed_product_id else "unknown"
    elif decision == "manual":
        confirmed_product_id = st.session_state.get(
            f"manual_product_{detection_id}",
            "",
        ).strip()
        user_decision = "corrected_product" if confirmed_product_id else "unknown"
    elif decision == "unknown":
        confirmed_product_id = None
        user_decision = "unknown"
    elif decision == "reject":
        confirmed_product_id = None
        user_decision = "not_product"
    elif decision == "report":
        confirmed_product_id = None
        user_decision = "needs_review"
    else:
        confirmed_product_id = None
        user_decision = "ignored"

    return {
        "user_decision": user_decision,
        "confirmed_product_id": confirmed_product_id or None,
        "add_as_reference": add_as_reference and bool(confirmed_product_id),
        "reference_quality_status": "pending",
        "use_for_yolo_training": use_for_yolo_training
        and user_decision in {"accepted", "corrected_product"},
    }


def save_detection_feedback(results):
    rows = []
    for item in results:
        review_id = item.get("review_id")
        if not review_id:
            rows.append(
                {
                    "detection_id": item["detection_id"],
                    "status": "skipped",
                    "detail": "API chưa trả về mã rà soát",
                }
            )
            continue

        try:
            response = requests.post(
                f"{API_URL}/review/detections/{review_id}",
                json=review_payload_for_item(item),
                timeout=120,
            )
        except requests.RequestException as exc:
            rows.append(
                {
                    "detection_id": item["detection_id"],
                    "status": "failed",
                    "detail": str(exc),
                }
            )
        else:
            rows.append(
                {
                    "detection_id": item["detection_id"],
                    "status": "success" if response.status_code == 200 else "failed",
                    "detail": "Đã lưu phản hồi"
                    if response.status_code == 200
                    else response.text,
                }
            )
    return rows


def submit_inventory_confirmation(results):
    confirmed_items = []
    rejected_items = []
    global_action = st.session_state.get(OPERATION_INVENTORY_ACTION_KEY, "stock_in")
    global_quantity = int(st.session_state.get(OPERATION_GLOBAL_QUANTITY_KEY, 1))

    for item in results:
        detection_id = item["detection_id"]
        decision = st.session_state.get(f"decision_{detection_id}", "confirm")

        if decision == "confirm":
            if not item.get("product_id"):
                rejected_items.append(
                    {"detection_id": detection_id, "reason": "no_predicted_product"}
                )
                continue

            confirmed_items.append(
                {
                    "detection_id": detection_id,
                    "product_id": item["product_id"],
                    "quantity": global_quantity,
                    "action": global_action,
                }
            )
        elif decision == "manual":
            manual_product_id = st.session_state.get(f"manual_product_{detection_id}", "")
            if manual_product_id.strip():
                confirmed_items.append(
                    {
                        "detection_id": detection_id,
                        "product_id": manual_product_id.strip(),
                        "quantity": global_quantity,
                        "action": global_action,
                    }
                )
            else:
                rejected_items.append(
                    {"detection_id": detection_id, "reason": "missing_manual_product_id"}
                )
        elif decision == "unknown":
            rejected_items.append({"detection_id": detection_id, "reason": "marked_unknown"})
        elif decision == "report":
            rejected_items.append(
                {"detection_id": detection_id, "reason": "sent_to_training_review"}
            )
        else:
            reason = st.session_state.get(f"reject_reason_{detection_id}", "").strip()
            rejected_items.append(
                {"detection_id": detection_id, "reason": reason or "rejected_by_user"}
            )

    return requests.post(
        f"{API_URL}/inventory/confirm",
        json={
            "confirmed_items": confirmed_items,
            "rejected_items": rejected_items,
        },
        timeout=120,
    )


def fetch_review_sessions(limit=None):
    params = {}
    if limit is not None:
        params["limit"] = limit
    response = requests.get(
        f"{API_URL}/review/sessions",
        params=params,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def fetch_review_session(session_id):
    response = requests.get(
        f"{API_URL}/review/sessions/{session_id}",
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def fetch_detector_settings():
    response = requests.get(f"{API_URL}/detector/settings", timeout=30)
    response.raise_for_status()
    return response.json()


def compare_detectors(uploaded_file):
    return requests.post(
        f"{API_URL}/detector/compare",
        files=build_file_payload(uploaded_file),
        timeout=120,
    )


def select_review_session(session_prefix):
    try:
        sessions = fetch_review_sessions()
    except requests.RequestException as exc:
        st.error(f"Không tải được danh sách phiên rà soát: {exc}")
        return None

    if not sessions:
        st.info("Chưa có phiên nhận diện nào để rà soát.")
        return None

    session_options = {
        (
            f"Phiên #{session['id']} - {mode_label(session.get('mode'))} - "
            f"{session_status_label(session.get('status'))} - {session['created_at']}"
        ): session["id"]
        for session in sessions
    }
    selected_label = st.selectbox(
        "Chọn phiên nhận diện",
        list(session_options.keys()),
        key=f"{session_prefix}_session_selector",
    )
    selected_session_id = session_options[selected_label]

    try:
        return fetch_review_session(selected_session_id)
    except requests.RequestException as exc:
        st.error(f"Không tải được phiên: {exc}")
        return None


def render_missing_box_canvas(session, key_prefix):
    original_image_base64 = session.get("original_image_base64")
    preview_image = load_image_for_canvas(original_image_base64)
    if preview_image is None:
        st.warning("Không tải được ảnh gốc để vẽ vùng.")
        return

    original_width = session.get("original_image_width") or preview_image.width
    original_height = session.get("original_image_height") or preview_image.height
    original_size = (int(original_width), int(original_height))
    preview_size = (
        session.get("preview_image_width") or preview_image.width,
        session.get("preview_image_height") or preview_image.height,
    )

    display_width, display_height = display_dimensions(preview_image, max_width=900)
    display_size = (display_width, display_height)
    canvas_background = resized_rgb_image(preview_image, display_size)
    image_mime_type = (
        session.get("preview_image_mime_type")
        or session.get("original_image_mime_type")
        or "image/jpeg"
    )
    existing_boxes = [
        box
        for box in (
            review_box_to_display_box(detection, original_size, display_size)
            for detection in session.get("detections", [])
            if detection.get("user_decision") != "manually_added"
        )
        if box is not None
    ]
    stored_box_key = f"{key_prefix}_drawn_box_value_{session['id']}"
    manual_result_key = f"manual_detection_response_{session['id']}"
    selection_id_key = f"{key_prefix}_selection_id_{session['id']}"
    reset_counter_key = f"{key_prefix}_canvas_reset_counter_{session['id']}"
    added_boxes_key = f"{key_prefix}_added_boxes_{session['id']}"
    deleted_boxes_key = f"{key_prefix}_deleted_boxes_{session['id']}"
    deleted_box_ids = set(st.session_state.get(deleted_boxes_key, []))
    st.session_state[added_boxes_key] = merge_added_boxes(
        manually_added_detections(session),
        st.session_state.get(added_boxes_key, []),
        deleted_box_ids,
    )
    stored_value = st.session_state.get(stored_box_key)
    initial_box = (
        stored_value.get("displayed_box")
        if isinstance(stored_value, dict) and stored_value.get("displayed_box")
        else None
    )

    canvas_col, detail_col = st.columns([2, 1])
    with canvas_col:
        st.markdown(
            '<div class="wv-draw-panel-heading">Ảnh cần rà soát</div>',
            unsafe_allow_html=True,
        )
        canvas_value = render_box_canvas_component(
            image_base64=original_image_base64,
            image_mime_type=image_mime_type,
            display_size=display_size,
            initial_box=initial_box,
            existing_boxes=existing_boxes,
            reset_token=st.session_state.get(reset_counter_key, 0),
            key=(
                f"{key_prefix}_missing_box_canvas_{session['id']}_"
                f"{st.session_state.get(reset_counter_key, 0)}"
            ),
        )
        if isinstance(canvas_value, dict) and canvas_value.get("displayed_box"):
            new_selection_id = canvas_value.get("selection_id")
            previous_selection_id = st.session_state.get(selection_id_key)
            st.session_state[stored_box_key] = canvas_value
            stored_value = canvas_value
            if new_selection_id and new_selection_id != previous_selection_id:
                st.session_state[selection_id_key] = new_selection_id
                st.session_state.pop(manual_result_key, None)

    rect_data = latest_canvas_rect_data(stored_value, original_size, display_size)
    manual_result = st.session_state.get(manual_result_key)

    with detail_col:
        st.markdown(
            '<div class="wv-draw-panel-heading">Vùng vừa chọn</div>',
            unsafe_allow_html=True,
        )
        if rect_data is None:
            st.info("Hãy kéo chuột trên ảnh để khoanh vùng sản phẩm còn thiếu.")
            st.caption("Sau khi chọn vùng, ảnh cắt và nút lưu sẽ hiện tại đây.")
        else:
            original_box = rect_data["original_box"]
            canvas_box = rect_data["canvas_box"]
            validation_error = box_validation_error(original_box, original_size)
            st.caption(
                "Đã chọn vùng: "
                + ", ".join(f"{value:.1f}" for value in original_box)
            )
            st.caption("Muốn đổi vùng thì kéo lại trực tiếp trên ảnh bên trái.")
            if show_debug_info():
                with st.expander("Chi tiết tọa độ", expanded=False):
                    st.write(
                        {
                            "displayed_box": rect_data["displayed_box"],
                            "preview_size": list(preview_size),
                            "display_size": rect_data["display_size"],
                            "original_image_size": list(original_size),
                            "corrected_box": original_box,
                            "scale_x": rect_data["scale_x"],
                            "scale_y": rect_data["scale_y"],
                            "label": rect_data["label"],
                            "source": rect_data["source"],
                        }
                    )

            if validation_error:
                st.warning(validation_error)
            else:
                preview_crop = crop_from_box(canvas_background, canvas_box)
                st.image(
                    preview_crop,
                    caption="Ảnh cắt từ vùng vừa chọn",
                    width="stretch",
                )

            confirmed_product_id = None
            external_product_id = ""
            with st.expander("Gán mã sản phẩm (tùy chọn)", expanded=False):
                product_search = st.text_input(
                    "Tìm sản phẩm trong hệ thống",
                    key=f"{key_prefix}_product_search_{session['id']}",
                    placeholder="Nhập mã hoặc tên sản phẩm...",
                )
                try:
                    products = fetch_products(search=product_search.strip() or None, limit=100)
                except requests.RequestException as exc:
                    products = []
                    st.warning(f"Không tải được danh sách sản phẩm: {exc}")

                product_options = ["Không gán sản phẩm có sẵn"]
                product_by_label = {product_options[0]: None}
                for product in products:
                    label = (
                        f"{product['product_id']} - {product['name']} "
                        f"(tồn {product['inventory_count']})"
                    )
                    product_options.append(label)
                    product_by_label[label] = product["product_id"]

                selected_product_label = st.selectbox(
                    "Sản phẩm có sẵn",
                    product_options,
                    key=f"{key_prefix}_selected_product_{session['id']}",
                )
                confirmed_product_id = product_by_label.get(selected_product_label)
                external_product_id = st.text_input(
                    "Mã sản phẩm ngoài hệ thống",
                    key=f"{key_prefix}_external_product_id_{session['id']}",
                    placeholder="Nhập nếu sản phẩm chưa có trong hệ thống",
                ).strip()
                if show_debug_info():
                    st.caption("Nhãn huấn luyện AI: sản phẩm")

            if not validation_error and st.button(
                "Lưu vùng",
                key=f"{key_prefix}_add_drawn_box_{session['id']}",
                use_container_width=True,
            ):
                original_box = rect_data["original_box"]
                payload = {
                    "corrected_box": original_box,
                    "confirmed_product_id": confirmed_product_id,
                    "external_product_id": external_product_id or None,
                    "user_decision": "manually_added",
                    "displayed_box": rect_data["displayed_box"],
                    "display_size": rect_data["display_size"],
                    "source": "human_missing_box",
                }
                try:
                    manual_response = requests.post(
                        f"{API_URL}/review/sessions/{session['id']}/manual-detection",
                        json=payload,
                        timeout=120,
                    )
                except requests.RequestException as exc:
                    st.error(f"Không thêm được vùng đã vẽ: {exc}")
                else:
                    if manual_response.status_code == 200:
                        manual_payload = manual_response.json()
                        st.session_state[manual_result_key] = manual_payload
                        st.session_state[added_boxes_key] = merge_added_boxes(
                            [manual_payload],
                            st.session_state.get(added_boxes_key, []),
                            set(st.session_state.get(deleted_boxes_key, [])),
                        )
                        st.session_state.pop(stored_box_key, None)
                        st.session_state.pop(selection_id_key, None)
                        st.session_state[reset_counter_key] = (
                            st.session_state.get(reset_counter_key, 0) + 1
                        )
                        st.toast("Đã lưu vùng.")
                        annotation = manual_payload.get("yolo_annotation")
                        if annotation and show_debug_info():
                            with st.expander("Dữ liệu AI đã lưu", expanded=False):
                                st.write(annotation)
                        st.rerun()
                    else:
                        st.error(f"Lỗi khi thêm vùng đã vẽ: {manual_response.text}")

        if manual_result and show_debug_info():
            st.divider()
            st.caption("Kết quả AI nhận diện từ ảnh cắt vừa lưu")
            if manual_result.get("candidates"):
                st.dataframe(
                    [
                        {
                            "Mã SP": candidate["product_id"],
                            "Tên": candidate["name"],
                            "Khoảng cách": format_distance(candidate["distance"]),
                            "Mã ảnh tham chiếu": candidate["matched_embedding_id"],
                        }
                        for candidate in manual_result["candidates"]
                    ],
                    use_container_width=True,
                    hide_index=True,
                )

    added_boxes = st.session_state.get(added_boxes_key, [])
    if added_boxes:
        st.divider()
        render_added_boxes_grid(
            added_boxes,
            session["id"],
            key_prefix,
            deleted_boxes_key,
            added_boxes_key,
        )

    if show_debug_info():
        with st.expander("Nhập tọa độ thủ công (nâng cao)", expanded=False):
            with st.form(f"{key_prefix}_manual_detection_{session['id']}"):
                manual_cols = st.columns(4)
                with manual_cols[0]:
                    manual_x1 = st.number_input(
                        "x1",
                        min_value=0.0,
                        value=0.0,
                        key=f"{key_prefix}_manual_x1_{session['id']}",
                    )
                with manual_cols[1]:
                    manual_y1 = st.number_input(
                        "y1",
                        min_value=0.0,
                        value=0.0,
                        key=f"{key_prefix}_manual_y1_{session['id']}",
                    )
                with manual_cols[2]:
                    manual_x2 = st.number_input(
                        "x2",
                        min_value=0.0,
                        value=100.0,
                        key=f"{key_prefix}_manual_x2_{session['id']}",
                    )
                with manual_cols[3]:
                    manual_y2 = st.number_input(
                        "y2",
                        min_value=0.0,
                        value=100.0,
                        key=f"{key_prefix}_manual_y2_{session['id']}",
                    )
                manual_product_id = st.text_input(
                    "Mã sản phẩm có sẵn (tuỳ chọn)",
                    key=f"{key_prefix}_manual_product_id_{session['id']}",
                )
                manual_external_product_id = st.text_input(
                    "Mã sản phẩm ngoài hệ thống (tuỳ chọn)",
                    key=f"{key_prefix}_manual_external_product_id_{session['id']}",
                )
                add_manual = st.form_submit_button("Lưu vùng sản phẩm bị thiếu")

                if add_manual:
                    manual_box = [manual_x1, manual_y1, manual_x2, manual_y2]
                    if box_is_too_small(manual_box):
                        st.warning("Vùng đã chọn quá nhỏ.")
                    elif box_outside_image(manual_box, original_size):
                        st.warning("Vùng đã chọn nằm ngoài ảnh.")
                    else:
                        payload = {
                            "corrected_box": manual_box,
                            "confirmed_product_id": manual_product_id.strip() or None,
                            "external_product_id": (
                                manual_external_product_id.strip() or None
                            ),
                            "user_decision": "manually_added",
                            "source": "human_missing_box",
                        }
                        try:
                            manual_response = requests.post(
                                f"{API_URL}/review/sessions/{session['id']}/manual-detection",
                                json=payload,
                                timeout=120,
                            )
                        except requests.RequestException as exc:
                            st.error(f"Không thêm được vùng thủ công: {exc}")
                        else:
                            if manual_response.status_code == 200:
                                manual_payload = manual_response.json()
                                st.session_state[
                                    f"manual_detection_response_{session['id']}"
                                ] = manual_payload
                                st.session_state[added_boxes_key] = merge_added_boxes(
                                    [manual_payload],
                                    st.session_state.get(added_boxes_key, []),
                                    set(st.session_state.get(deleted_boxes_key, [])),
                                )
                                st.success("Đã thêm vùng thủ công.")
                                st.rerun()
                            else:
                                st.error(
                                    "Lỗi khi thêm vùng thủ công: "
                                    f"{manual_response.text}"
                                )


def render_dataset_export_page():
    st.header("Dữ liệu huấn luyện AI")
    try:
        summary_response = requests.get(
            f"{API_URL}/yolo-dataset/summary",
            timeout=30,
        )
    except requests.RequestException as exc:
        st.error(f"Không tải được tổng quan dữ liệu: {exc}")
        return

    if summary_response.status_code != 200:
        st.error(f"Lỗi tổng quan dữ liệu: {summary_response.text}")
        return

    summary = summary_response.json()
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Ảnh", summary["image_count"])
    col2.metric("Tệp nhãn", summary["label_file_count"])
    col3.metric("Vùng", summary["box_count"])
    col4.metric("Chờ rà soát", summary["pending_review_count"])
    if show_debug_info():
        st.caption(f"Thư mục dữ liệu: {summary['dataset_dir']}")
        if summary.get("data_yaml_path"):
            st.caption(f"data.yaml: {summary['data_yaml_path']}")

    if st.button("Tạo / cập nhật cấu hình dữ liệu"):
        try:
            export_response = requests.post(
                f"{API_URL}/yolo-dataset/export-yaml",
                timeout=30,
            )
        except requests.RequestException as exc:
            st.error(f"Không tạo được cấu hình dữ liệu: {exc}")
        else:
            if export_response.status_code == 200:
                payload = export_response.json()
                st.success("Đã tạo / cập nhật cấu hình dữ liệu.")
                if show_debug_info():
                    st.caption(f"Đường dẫn: {payload['data_yaml_path']}")
                    st.json(payload["summary"])
            else:
                st.error(f"Lỗi khi tạo cấu hình dữ liệu: {export_response.text}")


def render_settings_page():
    st.header("Cài đặt")
    st.subheader("Giao diện vận hành")
    st.checkbox(
        "Ẩn thông tin kỹ thuật/debug",
        key=OPERATION_HIDE_DEBUG_KEY,
        help="Bật để giao diện vận hành gọn hơn, phù hợp cho người dùng kho.",
    )
    if not show_debug_info():
        st.success("Đang bật chế độ vận hành: các thông tin kỹ thuật đã được ẩn.")
        return

    st.divider()
    st.subheader("Thông tin kỹ thuật")
    st.caption("Các giá trị này đang được cấu hình bằng biến môi trường trong API.")
    st.write(
        {
            "API_URL": API_URL,
            "DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD": (
                DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD
            ),
            "AI_RECOGNITION_DATASET_DIR": "biến môi trường thư mục dữ liệu huấn luyện",
            "SIMILARITY_RECOGNIZED_THRESHOLD": "biến môi trường API",
            "SIMILARITY_UNKNOWN_THRESHOLD": "biến môi trường API",
            "SIMILARITY_MARGIN_THRESHOLD": "biến môi trường API",
        }
    )
    st.subheader("Kiểm tra bộ phát hiện AI")
    try:
        detector_settings = fetch_detector_settings()
    except requests.RequestException as exc:
        st.warning(f"Không tải được cấu hình bộ phát hiện AI: {exc}")
    else:
        summary_cols = st.columns(4)
        summary_cols[0].metric(
            "Bộ xử lý",
            detector_settings.get("active_backend")
            or detector_settings.get("detector_backend")
            or "-",
        )
        summary_cols[1].metric(
            "Mô hình AI nhận diện",
            detector_settings.get("yolo_model")
            or detector_settings.get("yolo26_model")
            or detector_settings.get("yolov8_model")
            or "-",
        )
        summary_cols[2].metric(
            "Mô hình mở theo mô tả",
            detector_settings.get("yolo_world_model", "-"),
        )
        summary_cols[3].metric(
            "Số vùng tối đa",
            detector_settings.get("max_detections_per_image", "-"),
        )
        with st.expander("Chi tiết bộ phát hiện AI", expanded=False):
            st.json(detector_settings)

    st.subheader("So sánh bộ phát hiện AI")
    compare_file = st.file_uploader(
        "Chọn ảnh để so sánh các bộ phát hiện AI",
        type=["jpg", "jpeg", "png"],
        key="detector_compare_file",
    )
    if compare_file and st.button("Chạy so sánh"):
        with st.spinner("Đang chạy hai bộ phát hiện AI..."):
            try:
                compare_response = compare_detectors(compare_file)
            except requests.RequestException as exc:
                st.error(f"Không chạy được so sánh bộ phát hiện AI: {exc}")
            else:
                if compare_response.status_code != 200:
                    st.error(f"Lỗi khi so sánh bộ phát hiện AI: {compare_response.text}")
                else:
                    payload = compare_response.json()
                    comparison = payload["comparison"]
                    detector_keys = [
                        key
                        for key in ["yolo26", "yolov8", "yolo_world"]
                        if key in comparison
                    ]
                    cols = st.columns(len(detector_keys))
                    for col, key in zip(cols, detector_keys):
                        section = comparison[key]
                        with col:
                            st.metric(
                                f"{section['backend']} vùng",
                                section["detection_count"],
                            )
                            if section.get("error"):
                                st.warning(section["error"])
                            if section.get("fallback_used"):
                                st.info("Đã chuyển về bộ phát hiện AI hiện tại.")
                            st.dataframe(
                                [
                                    {
                                        "Vùng": detection["box"],
                                        "Độ tin cậy": format_confidence(
                                            detection.get("detector_confidence")
                                        ),
                                        "Lớp": detection.get("detector_class_name")
                                        or "-",
                                        "Mô tả": detection.get("detector_prompt")
                                        or "-",
                                    }
                                    for detection in section.get("detections", [])
                                ],
                                use_container_width=True,
                                hide_index=True,
                            )


if choice == PAGE_OPERATION:
    st.header("Nhận diện / Kiểm kho")
    camera_file = st.camera_input("Chụp ảnh trực tiếp")
    uploaded_file = st.file_uploader(
        "Hoặc chọn ảnh sản phẩm...",
        type=["jpg", "jpeg", "png"],
    )
    selected_file = camera_file or uploaded_file

    if selected_file:
        selected_bytes = selected_file.getvalue()
        selected_key = f"{selected_file.name}:{len(selected_bytes)}"

        if st.session_state.get("recognition_input_key") != selected_key:
            st.session_state["recognition_input_key"] = selected_key
            st.session_state.pop("recognition_results", None)
            st.session_state.pop("recognition_image_bytes", None)
            st.session_state.pop("inventory_confirmation_response", None)
            st.session_state.pop("feedback_save_response", None)
            clear_confirmation_state()

        st.info(
            f"Ảnh đã chọn: {selected_file.name} "
            f"({len(selected_bytes) / 1024:.1f} KB)"
        )
        st.image(selected_file, caption="Ảnh đầu vào", width=300)

        if st.button("Bắt đầu nhận diện"):
            with st.spinner("Đang xử lý AI..."):
                try:
                    response = requests.post(
                        f"{API_URL}/recognize",
                        files=build_file_payload(selected_file),
                        data={"mode": "operation"},
                        timeout=120,
                    )
                except requests.RequestException as exc:
                    st.error(f"Không kết nối được API: {exc}")
                else:
                    if response.status_code == 200:
                        results = response.json()
                        clear_confirmation_state()
                        st.session_state["recognition_results"] = results
                        st.session_state["recognition_image_bytes"] = selected_bytes
                        st.session_state.pop("inventory_confirmation_response", None)
                        st.session_state.pop("feedback_save_response", None)

                        if not results:
                            st.warning("Không phát hiện sản phẩm trong ảnh")
                        else:
                            recognized_count = sum(
                                1 for item in results if item["status"] == "recognized"
                            )
                            uncertain_count = sum(
                                1 for item in results if item["status"] == "uncertain"
                            )
                            st.success(
                                f"Đã xử lý {len(results)} vùng sản phẩm, "
                                f"nhận diện được {recognized_count} sản phẩm, "
                                f"cần kiểm tra {uncertain_count} vùng."
                            )
                    elif response.status_code == 404:
                        st.warning("Không tìm thấy sản phẩm phù hợp")
                    else:
                        st.error(f"Lỗi khi nhận diện sản phẩm: {response.text}")

    results = st.session_state.get("recognition_results")
    image_bytes = st.session_state.get("recognition_image_bytes")

    if results and image_bytes:
        for item in results:
            decision_key = f"decision_{item['detection_id']}"
            decision_options = operation_decision_options(item)
            if st.session_state.get(decision_key) not in decision_options:
                st.session_state[decision_key] = operation_default_decision(item)

        duplicate_ids = duplicate_product_ids(results)
        recognized_count = sum(1 for item in results if item["status"] == "recognized")
        uncertain_count = sum(1 for item in results if item["status"] == "uncertain")
        unknown_count = sum(1 for item in results if item["status"] == "unknown")

        st.subheader("Kết quả nhận diện")
        st.markdown(
            f"""
            <div class="wv-soft-panel">
                <div class="wv-hero-title">Đã phát hiện {len(results)} vùng sản phẩm</div>
                <p class="wv-hero-subtitle">
                    Kiểm tra nhanh từng vùng, chọn chấp nhận hoặc từ chối, rồi áp dụng một nghiệp vụ nhập/xuất cho toàn bộ ảnh.
                </p>
            </div>
            """,
            unsafe_allow_html=True,
        )
        if duplicate_ids:
            st.warning(
                "Cùng một sản phẩm được nhận diện ở nhiều vùng. "
                "Hãy kiểm tra kỹ để tránh nhập hoặc xuất kho sai."
            )

        top_left, top_right = st.columns([1.7, 1])
        with top_left:
            st.image(
                draw_annotated_image(image_bytes, results),
                caption="Ảnh đã đánh số vùng sản phẩm",
                use_container_width=True,
            )
        with top_right:
            st.markdown("**Nghiệp vụ cho toàn bộ ảnh**")
            st.segmented_control(
                "Chọn nhập hoặc xuất kho",
                ["stock_in", "stock_out"],
                format_func=inventory_action_label,
                key=OPERATION_INVENTORY_ACTION_KEY,
                label_visibility="collapsed",
                width="stretch",
            )
            st.number_input(
                "Số lượng cho mỗi vùng được chấp nhận",
                min_value=1,
                step=1,
                key=OPERATION_GLOBAL_QUANTITY_KEY,
            )
            decision_counts = operation_decision_counts(results)
            metric_cols = st.columns(3)
            metric_cols[0].metric("Chấp nhận", decision_counts["accepted"])
            metric_cols[1].metric("Từ chối", decision_counts["rejected"])
            metric_cols[2].metric("Cần xem", uncertain_count + unknown_count)
            st.caption(
                f"AI nhận diện chắc chắn {recognized_count} vùng, "
                f"cần kiểm tra {uncertain_count} vùng, chưa rõ {unknown_count} vùng."
            )
            quick_cols = st.columns(2)
            with quick_cols[0]:
                if st.button("Chấp nhận tất cả vùng có mã", use_container_width=True):
                    set_all_operation_decisions(results, "confirm")
                    st.rerun()
            with quick_cols[1]:
                if st.button("Từ chối tất cả", use_container_width=True):
                    set_all_operation_decisions(results, "reject")
                    st.rerun()

        with st.expander("Bảng tổng hợp", expanded=False):
            st.dataframe(
                operation_detection_rows(results),
                use_container_width=True,
                hide_index=True,
                row_height=104,
                column_config={
                    "Ảnh cắt": st.column_config.ImageColumn(
                        "Ảnh cắt",
                        width="small",
                    )
                },
            )
            st.dataframe(operation_result_rows(results), use_container_width=True, hide_index=True)

        st.subheader("Duyệt nhanh từng vùng")
        st.caption("Số vùng trên thẻ bên dưới khớp với số đang nằm trên ảnh lớn.")
        for index, item in enumerate(results, start=1):
            detection_id = item["detection_id"]
            preview = crop_preview_image(item.get("crop_preview_base64"))
            candidates = item.get("candidates") or []
            decision_key = f"decision_{detection_id}"
            decision = st.session_state.get(decision_key, operation_default_decision(item))

            with st.container(border=True):
                card_cols = st.columns([0.85, 1.45, 1.1])
                with card_cols[0]:
                    st.markdown(
                        f'<span class="wv-box-number">{index}</span>',
                        unsafe_allow_html=True,
                    )
                    if preview is not None:
                        st.image(
                            preview,
                            caption=f"Vùng #{index}",
                            use_container_width=True,
                        )
                    else:
                        st.info("Chưa có ảnh cắt cho vùng này.")

                with card_cols[1]:
                    st.markdown(
                        (
                            f'<span class="wv-status-badge '
                            f'{status_badge_class(item.get("status"))}">'
                            f'{status_label(item.get("status"))}</span>'
                        ),
                        unsafe_allow_html=True,
                    )
                    st.markdown(
                        f'<div class="wv-product-name">{item.get("name") or "Chưa xác định"}</div>',
                        unsafe_allow_html=True,
                    )
                    st.caption(f"Mã sản phẩm: {item.get('product_id') or '-'}")
                    stock_text = (
                        str(item.get("inventory_count"))
                        if item.get("inventory_count") is not None
                        else "-"
                    )
                    info_cols = st.columns(2)
                    info_cols[0].metric("Tồn kho", stock_text)
                    info_cols[1].metric("Tin cậy", confidence_label(item.get("confidence_level")))

                    if item["status"] == "uncertain":
                        st.warning("Vùng này cần kiểm tra trước khi xác nhận.")
                    elif item["status"] == "unknown":
                        st.info("AI chưa xác định được sản phẩm cho vùng này.")

                    detector_confidence = item.get("detector_confidence")
                    if show_debug_info() and (
                        detector_confidence is not None
                        and detector_confidence < DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD
                    ):
                        st.warning("Ảnh cắt này có thể không phải sản phẩm hợp lệ.")

                    if decision == "manual":
                        st.text_input(
                            "Mã sản phẩm đúng",
                            key=f"manual_product_{detection_id}",
                            placeholder="Nhập hoặc chọn từ gợi ý bên dưới",
                        )

                    if candidates:
                        with st.expander("Gợi ý sản phẩm khác", expanded=False):
                            candidate_cols = st.columns(min(len(candidates[:3]), 3))
                            for candidate_index, candidate in enumerate(candidates[:3]):
                                with candidate_cols[candidate_index]:
                                    st.markdown(f"**{candidate_display_name(candidate)}**")
                                    st.caption(
                                        f"Mã: {candidate.get('product_code') or candidate['product_id']} · "
                                        f"Tồn kho: {candidate.get('inventory_count', '-')}"
                                    )
                                    if st.button(
                                        "Chọn mã này",
                                        key=(
                                            f"choose_candidate_{detection_id}_"
                                            f"{candidate['product_id']}"
                                        ),
                                        use_container_width=True,
                                    ):
                                        st.session_state[decision_key] = "manual"
                                        st.session_state[f"manual_product_{detection_id}"] = (
                                            candidate["product_id"]
                                        )
                                        st.rerun()

                    if show_debug_info():
                        with st.expander("Chi tiết kỹ thuật", expanded=False):
                            st.write(
                                {
                                    "Mã phiên": item.get("session_id"),
                                    "Mã rà soát": item.get("review_id"),
                                    "Mã vùng": detection_id,
                                    "Tọa độ vùng": item.get("box"),
                                    "Độ tin cậy vùng": format_confidence(
                                        item.get("detector_confidence")
                                    ),
                                    "Khoảng cách tốt nhất": format_distance(
                                        item.get("top1_distance")
                                    ),
                                    "Khoảng cách thứ hai": format_distance(
                                        item.get("top2_distance")
                                    ),
                                    "Độ chênh khoảng cách": format_distance(
                                        item.get("distance_margin")
                                    ),
                                    "Điểm cuối": format_score(item.get("final_score")),
                                    "Mức tin cậy": confidence_label(
                                        item.get("confidence_level")
                                    ),
                                }
                            )

                with card_cols[2]:
                    st.markdown("**Quyết định**")
                    st.caption(f"Đang chọn: {operation_decision_label(decision)}")
                    accept_disabled = not bool(item.get("product_id"))
                    action_cols = st.columns(2)
                    with action_cols[0]:
                        if st.button(
                            "Chấp nhận",
                            key=f"accept_{detection_id}",
                            disabled=accept_disabled,
                            use_container_width=True,
                            type="primary" if decision == "confirm" else "secondary",
                        ):
                            set_detection_decision(item, "confirm")
                            st.rerun()
                    with action_cols[1]:
                        if st.button(
                            "Từ chối",
                            key=f"reject_{detection_id}",
                            use_container_width=True,
                            type="primary" if decision == "reject" else "secondary",
                        ):
                            set_detection_decision(item, "reject")
                            st.rerun()

                    secondary_cols = st.columns(2)
                    with secondary_cols[0]:
                        if st.button(
                            "Đổi mã",
                            key=f"manual_{detection_id}",
                            use_container_width=True,
                        ):
                            set_detection_decision(item, "manual")
                            st.rerun()
                    with secondary_cols[1]:
                        if st.button(
                            "Chưa rõ",
                            key=f"unknown_{detection_id}",
                            use_container_width=True,
                        ):
                            set_detection_decision(item, "unknown")
                            st.rerun()

                    if st.button(
                        "Gửi rà soát AI",
                        key=f"report_{detection_id}",
                        use_container_width=True,
                    ):
                        set_detection_decision(item, "report")
                        st.rerun()

                    selected_product_id = (
                        item.get("product_id")
                        if decision == "confirm"
                        else st.session_state.get(f"manual_product_{detection_id}", "").strip()
                    )
                    if decision in {"confirm", "manual"}:
                        with st.expander("Tùy chọn cải thiện AI", expanded=False):
                            st.checkbox(
                                "Lưu ảnh cắt làm ảnh tham chiếu",
                                value=False,
                                key=f"add_reference_{detection_id}",
                                disabled=not bool(selected_product_id),
                            )
                            st.checkbox(
                                "Dùng vùng này làm dữ liệu huấn luyện AI",
                                value=False,
                                key=f"use_yolo_training_{detection_id}",
                                disabled=not bool(selected_product_id),
                            )
                    if decision == "reject":
                        st.text_input(
                            "Lý do từ chối",
                            key=f"reject_reason_{detection_id}",
                            placeholder="Ví dụ: không phải sản phẩm, box sai",
                        )

        final_counts = operation_decision_counts(results)
        final_action = st.session_state.get(OPERATION_INVENTORY_ACTION_KEY, "stock_in")
        final_quantity = int(st.session_state.get(OPERATION_GLOBAL_QUANTITY_KEY, 1))
        st.markdown(
            f"""
            <div class="wv-soft-panel">
                <div class="wv-hero-title">Sẵn sàng {inventory_action_label(final_action).lower()}</div>
                <p class="wv-hero-subtitle">
                    {final_counts["accepted"]} vùng sẽ được xử lý, mỗi vùng tính {final_quantity} sản phẩm.
                    {final_counts["rejected"]} vùng sẽ không cập nhật tồn kho.
                </p>
            </div>
            """,
            unsafe_allow_html=True,
        )

        complete_label = f"Hoàn tất {inventory_action_label(final_action).lower()}"
        if st.button(
            complete_label,
            disabled=final_counts["accepted"] == 0,
            type="primary",
            use_container_width=True,
        ):
            feedback_rows = save_detection_feedback(results)
            st.session_state["feedback_save_response"] = feedback_rows
            failed_feedback = [row for row in feedback_rows if row["status"] == "failed"]
            if failed_feedback:
                st.warning("Một số phản hồi chưa lưu được. Kiểm tra Rà soát & sửa lỗi AI để rà lại.")
            try:
                confirm_response = submit_inventory_confirmation(results)
            except requests.RequestException as exc:
                st.error(f"Không kết nối được API xác nhận: {exc}")
            else:
                if confirm_response.status_code == 200:
                    payload = confirm_response.json()
                    st.session_state["inventory_confirmation_response"] = payload
                    st.success("Đã ghi nhận xác nhận của người dùng.")
                else:
                    st.error(f"Lỗi khi xác nhận tồn kho: {confirm_response.text}")

        if st.session_state.get("inventory_confirmation_response"):
            st.subheader("Kết quả xác nhận")
            confirmation = st.session_state["inventory_confirmation_response"]
            if st.session_state.get("feedback_save_response") and show_debug_info():
                st.caption("Phản hồi rà soát")
                st.dataframe(
                    [
                        {
                            "Mã vùng": row.get("detection_id"),
                            "Trạng thái": feedback_status_label(row.get("status")),
                            "Chi tiết": row.get("detail"),
                        }
                        for row in st.session_state["feedback_save_response"]
                    ],
                    use_container_width=True,
                    hide_index=True,
                )
            if confirmation.get("confirmed_items"):
                st.dataframe(
                    confirmed_inventory_rows(confirmation["confirmed_items"]),
                    use_container_width=True,
                    hide_index=True,
                )
            if confirmation.get("rejected_items"):
                st.dataframe(
                    rejected_inventory_rows(confirmation["rejected_items"]),
                    use_container_width=True,
                    hide_index=True,
                )

elif choice == PAGE_TRAINING:
    st.header("Rà soát & sửa lỗi AI")

    try:
        sessions = fetch_review_sessions()
    except requests.RequestException as exc:
        st.error(f"Không tải được danh sách phiên rà soát: {exc}")
        sessions = None

    if sessions is not None:
            if not sessions:
                st.info("Chưa có phiên nhận diện nào để rà soát.")
            else:
                st.caption(f"Đang hiển thị toàn bộ {len(sessions)} phiên.")
                session_options = {
                    (
                        f"Phiên #{session['id']} - {mode_label(session.get('mode'))} - "
                        f"{session['created_at']}"
                    ): session["id"]
                    for session in sessions
                }
                selected_label = st.selectbox(
                    "Chọn phiên nhận diện",
                    list(session_options.keys()),
                )
                direct_session_id = st.number_input(
                    "Hoặc nhập mã phiên để mở trực tiếp",
                    min_value=0,
                    value=0,
                    step=1,
                    help="Dùng khi phiên cũ không hiện trong danh sách.",
                )
                selected_session_id = (
                    int(direct_session_id)
                    if direct_session_id
                    else session_options[selected_label]
                )

                try:
                    session_response = requests.get(
                        f"{API_URL}/review/sessions/{selected_session_id}",
                        timeout=30,
                    )
                except requests.RequestException as exc:
                    st.error(f"Không tải được phiên: {exc}")
                    session_response = None

                if session_response is not None:
                    if session_response.status_code != 200:
                        st.error(f"Lỗi khi tải phiên: {session_response.text}")
                    else:
                        session = session_response.json()
                        detections = session.get("detections") or []
                        preview_original = image_from_base64(
                            session.get("original_image_base64")
                        )
                        with st.expander("Quản lý phiên", expanded=False):
                            st.warning(
                                "Xóa phiên sẽ xóa rà soát, ảnh cắt, metadata và nhãn dữ liệu "
                                "huấn luyện AI liên quan đến phiên này. Ảnh cắt đã được "
                                "dùng làm ảnh tham chiếu sản phẩm sẽ được giữ lại."
                            )
                            summary_cols = st.columns(4)
                            summary_cols[0].metric("Phiên", session["id"])
                            summary_cols[1].metric("Trạng thái", session_status_label(session["status"]))
                            summary_cols[2].metric("Số vùng phát hiện", len(detections))
                            summary_cols[3].metric(
                                "Vùng tự thêm",
                                sum(
                                    1
                                    for detection in detections
                                    if detection.get("user_decision")
                                    == "manually_added"
                                ),
                            )
                            preview_cols = st.columns([1, 2])
                            with preview_cols[0]:
                                if preview_original is not None:
                                    st.image(
                                        preview_original,
                                        caption="Ảnh gốc của phiên sẽ bị xóa",
                                        width=260,
                                    )
                                else:
                                    st.caption("Không tải được ảnh xem trước của phiên.")
                            with preview_cols[1]:
                                st.dataframe(
                                    [
                                        {
                                            "Vùng": detection["detection_index"],
                                            "Quyết định": review_decision_label(detection["user_decision"]),
                                            "AI dự đoán": detection.get(
                                                "predicted_product_id"
                                            )
                                            or "-",
                                            "Người dùng xác nhận": detection.get(
                                                "confirmed_product_id"
                                            )
                                            or "-",
                                        }
                                        for detection in detections
                                    ],
                                    use_container_width=True,
                                    hide_index=True,
                                )

                            crop_previews = [
                                detection
                                for detection in detections
                                if detection.get("crop_preview_base64")
                            ]
                            if crop_previews:
                                st.caption("Ảnh cắt sẽ bị dọn cùng phiên")
                                crop_cols = st.columns(4)
                                for index, detection in enumerate(crop_previews[:8]):
                                    crop = image_from_base64(
                                        detection.get("crop_preview_base64")
                                    )
                                    if crop is not None:
                                        with crop_cols[index % len(crop_cols)]:
                                            st.image(
                                                crop,
                                                caption=(
                                                    f"#{detection['detection_index']} "
                                                    f"{review_decision_label(detection['user_decision'])}"
                                                ),
                                                width=140,
                                            )
                                if len(crop_previews) > 8:
                                    st.caption(
                                        f"Còn {len(crop_previews) - 8} ảnh cắt khác."
                                    )

                            pending_delete_key = "pending_delete_session_id"
                            is_pending_delete = (
                                st.session_state.get(pending_delete_key)
                                == selected_session_id
                            )
                            if not is_pending_delete:
                                if st.button(
                                    "Xóa phiên này",
                                    key=f"start_delete_session_{selected_session_id}",
                                ):
                                    st.session_state[pending_delete_key] = (
                                        selected_session_id
                                    )
                                    st.rerun()
                            else:
                                st.error(
                                    "Bạn sắp xóa phiên đang xem trước và dữ liệu "
                                    "huấn luyện AI liên quan."
                                )
                                confirm_cols = st.columns(2)
                                with confirm_cols[0]:
                                    if st.button(
                                        "Xác nhận xóa",
                                        key=f"confirm_delete_session_{selected_session_id}",
                                    ):
                                        try:
                                            delete_response = requests.delete(
                                                f"{API_URL}/review/sessions/{selected_session_id}",
                                                params={
                                                    "delete_training_data": "true"
                                                },
                                                timeout=120,
                                            )
                                        except requests.RequestException as exc:
                                            st.error(f"Không xóa được phiên: {exc}")
                                        else:
                                            if delete_response.status_code == 200:
                                                st.session_state.pop(
                                                    pending_delete_key,
                                                    None,
                                                )
                                                st.success(
                                                    "Đã xóa phiên và dữ liệu huấn luyện liên quan."
                                                )
                                                if show_debug_info():
                                                    with st.expander(
                                                        "Chi tiết dữ liệu đã xóa",
                                                        expanded=False,
                                                    ):
                                                        st.write(delete_response.json())
                                                st.rerun()
                                            else:
                                                st.error(
                                                    "Không xóa được phiên: "
                                                    f"{delete_response.text}"
                                                )
                                with confirm_cols[1]:
                                    if st.button(
                                        "Hủy",
                                        key=f"cancel_delete_session_{selected_session_id}",
                                    ):
                                        st.session_state.pop(
                                            pending_delete_key,
                                            None,
                                        )
                                        st.rerun()

                        if show_debug_info():
                            st.write(
                                {
                                    "Mã phiên": session["id"],
                                    "Chế độ": mode_label(session["mode"]),
                                    "Trạng thái": session_status_label(session["status"]),
                                    "Phiên bản mô hình": session.get("model_version") or "-",
                                }
                            )

                        original_image = image_from_base64(
                            session.get("original_image_base64")
                        )
                        original_bytes = (
                            base64.b64decode(session["original_image_base64"])
                            if session.get("original_image_base64")
                            else None
                        )

                        if show_debug_info() and original_image is not None and original_bytes:
                            with st.expander("Các vùng AI đã phát hiện", expanded=False):
                                annotated_items = [
                                    {
                                        "box": detection.get("corrected_box")
                                        or detection["original_box"],
                                        "status": "recognized"
                                        if detection.get("predicted_product_id")
                                        else "unknown",
                                    }
                                    for detection in detections
                                ]
                                st.image(
                                    draw_annotated_image(
                                        original_bytes,
                                        annotated_items,
                                    ),
                                    caption="Các vùng phát hiện",
                                    use_container_width=True,
                                )

                        st.info(
                            "Để thêm sản phẩm bị hệ thống bỏ sót, mở trang "
                            "'Vẽ vùng sản phẩm bị thiếu' ở thanh bên."
                        )

                        st.subheader("Rà soát vùng phát hiện")
                        for detection in detections:
                            title = (
                                f"Vùng #{detection['detection_index']} - "
                                f"{detection.get('predicted_product_id') or 'chưa xác định'} - "
                                f"{review_decision_label(detection['user_decision'])}"
                            )
                            with st.expander(title, expanded=False):
                                crop = image_from_base64(
                                    detection.get("crop_preview_base64")
                                )
                                crop_col, detail_col = st.columns([1, 2])
                                with crop_col:
                                    if crop is not None:
                                        st.image(crop, caption="Ảnh cắt nhận diện", width=220)
                                    else:
                                        st.caption("Không có ảnh cắt")
                                with detail_col:
                                    if show_debug_info():
                                        st.write(
                                            {
                                                "Mã SP AI dự đoán": detection.get(
                                                    "predicted_product_id"
                                                ),
                                                "Mã SP đã xác nhận": detection.get(
                                                    "confirmed_product_id"
                                                ),
                                                "Độ tin cậy vùng": format_confidence(
                                                    detection.get("detector_confidence")
                                                ),
                                                "Khoảng cách tốt nhất": format_distance(
                                                    detection.get("top1_distance")
                                                ),
                                                "Khoảng cách thứ hai": format_distance(
                                                    detection.get("top2_distance")
                                                ),
                                                "Độ chênh khoảng cách": format_distance(
                                                    detection.get("distance_margin")
                                                ),
                                                "Mã ảnh tham chiếu khớp": detection.get(
                                                    "matched_embedding_id"
                                                ),
                                                "Góc ảnh tham chiếu": detection.get(
                                                    "matched_view_label"
                                                ),
                                            }
                                        )

                                candidates = detection.get("candidates") or []
                                if candidates and show_debug_info():
                                    st.dataframe(
                                        [
                                            {
                                                "Mã SP": candidate["product_id"],
                                                "Tên": candidate["name"],
                                                "Tồn kho": candidate[
                                                    "inventory_count"
                                                ],
                                                "Khoảng cách": format_distance(
                                                    candidate["distance"]
                                                ),
                                                "Mã ảnh tham chiếu": candidate[
                                                    "matched_embedding_id"
                                                ],
                                                "Góc ảnh": candidate["matched_view_label"]
                                                or "-",
                                            }
                                            for candidate in candidates
                                        ],
                                        use_container_width=True,
                                        hide_index=True,
                                    )

                                review_action_options = {
                                    "accepted": "Xác nhận đúng",
                                    "corrected_product": "Sửa mã sản phẩm",
                                    "not_product": "Không phải sản phẩm",
                                    "needs_review": "Cần kiểm tra sau",
                                    "ignored": "Bỏ qua",
                                }
                                current_decision = detection.get("user_decision")
                                current_action = {
                                    "wrong_sku": "corrected_product",
                                    "unknown": "needs_review",
                                    "rejected_detection": "not_product",
                                    "box_adjusted": "accepted",
                                    "manually_added": "accepted",
                                }.get(current_decision, current_decision)
                                if current_action not in review_action_options:
                                    current_action = "ignored"

                                selected_decision = st.selectbox(
                                    "Quyết định rà soát",
                                    list(review_action_options.keys()),
                                    index=list(review_action_options.keys()).index(
                                        current_action
                                    ),
                                    format_func=lambda decision: review_action_options[
                                        decision
                                    ],
                                    key=f"review_decision_{detection['id']}",
                                )
                                can_confirm_product = selected_decision in {
                                    "accepted",
                                    "corrected_product",
                                }
                                suggested_product_id = (
                                    detection.get("confirmed_product_id")
                                    or detection.get("predicted_product_id")
                                    or ""
                                )
                                confirmed_product_key = (
                                    f"confirmed_product_id_{detection['id']}"
                                )
                                if can_confirm_product:
                                    if (
                                        not st.session_state.get(confirmed_product_key)
                                        and suggested_product_id
                                    ):
                                        st.session_state[confirmed_product_key] = (
                                            suggested_product_id
                                        )
                                else:
                                    st.session_state[confirmed_product_key] = ""
                                confirmed_product_id = st.text_input(
                                    "Mã sản phẩm xác nhận",
                                    disabled=not can_confirm_product,
                                    help=(
                                        "Chỉ cần nhập khi xác nhận vùng này đúng "
                                        "hoặc sửa sang sản phẩm đúng."
                                    ),
                                    key=confirmed_product_key,
                                )
                                add_as_reference = st.checkbox(
                                    "Thêm ảnh cắt này làm ảnh tham chiếu sản phẩm",
                                    value=False,
                                    disabled=not can_confirm_product,
                                    help=(
                                        "Chỉ bật khi vùng này đã được xác nhận "
                                        "thuộc một mã sản phẩm cụ thể."
                                    ),
                                    key=f"training_add_reference_{detection['id']}",
                                )
                                use_for_yolo_training = st.checkbox(
                                    "Dùng vùng đã rà soát làm dữ liệu huấn luyện AI",
                                    value=False,
                                    disabled=not can_confirm_product,
                                    help=(
                                        "Chỉ dùng các vùng đã xác nhận đúng để "
                                        "giữ dữ liệu huấn luyện sạch."
                                    ),
                                    key=f"training_use_ai_data_{detection['id']}",
                                )
                                if not can_confirm_product:
                                    add_as_reference = False
                                    use_for_yolo_training = False
                                current_box = (
                                    detection.get("corrected_box")
                                    or detection.get("original_box")
                                    or [0.0, 0.0, 0.0, 0.0]
                                )
                                box_cols = st.columns(4)
                                with box_cols[0]:
                                    corrected_x1 = st.number_input(
                                        "x1",
                                        value=float(current_box[0]),
                                        key=f"box_x1_{detection['id']}",
                                    )
                                with box_cols[1]:
                                    corrected_y1 = st.number_input(
                                        "y1",
                                        value=float(current_box[1]),
                                        key=f"box_y1_{detection['id']}",
                                    )
                                with box_cols[2]:
                                    corrected_x2 = st.number_input(
                                        "x2",
                                        value=float(current_box[2]),
                                        key=f"box_x2_{detection['id']}",
                                    )
                                with box_cols[3]:
                                    corrected_y2 = st.number_input(
                                        "y2",
                                        value=float(current_box[3]),
                                        key=f"box_y2_{detection['id']}",
                                    )
                                st.caption(
                                    "Dùng trang 'Vẽ vùng sản phẩm bị thiếu' để thêm "
                                    "vùng mới trực tiếp trên ảnh."
                                )
                                submitted = st.button(
                                    "Lưu rà soát",
                                    key=f"save_training_review_{detection['id']}",
                                )

                                if submitted:
                                    confirmed_value = confirmed_product_id.strip()
                                    if not can_confirm_product:
                                        confirmed_value = ""
                                    if can_confirm_product and not confirmed_value:
                                        st.warning(
                                            "Vui lòng nhập mã sản phẩm xác nhận trước "
                                            "khi lưu quyết định này."
                                        )
                                        st.stop()
                                    if add_as_reference and not confirmed_value:
                                        st.warning(
                                            "Vui lòng nhập mã sản phẩm xác nhận "
                                            "trước khi thêm ảnh tham chiếu."
                                        )
                                        st.stop()

                                    corrected_box = [
                                        corrected_x1,
                                        corrected_y1,
                                        corrected_x2,
                                        corrected_y2,
                                    ]
                                    box_changed = any(
                                        abs(float(corrected_box[index]) - float(current_box[index]))
                                        > 0.01
                                        for index in range(4)
                                    )
                                    user_decision = (
                                        "box_adjusted"
                                        if box_changed and can_confirm_product
                                        else selected_decision
                                    )
                                    payload = {
                                        "user_decision": user_decision,
                                        "confirmed_product_id": confirmed_value or None,
                                        "add_as_reference": add_as_reference,
                                        "reference_quality_status": "pending",
                                        "use_for_yolo_training": use_for_yolo_training,
                                    }
                                    if box_changed and can_confirm_product:
                                        payload["corrected_box"] = corrected_box
                                    try:
                                        update_response = requests.post(
                                            f"{API_URL}/review/detections/{detection['id']}",
                                            json=payload,
                                            timeout=120,
                                        )
                                    except requests.RequestException as exc:
                                        st.error(f"Không lưu được rà soát: {exc}")
                                    else:
                                        if update_response.status_code == 200:
                                            st.success("Đã lưu rà soát.")
                                        else:
                                            st.error(
                                                f"Lỗi khi lưu rà soát: {update_response.text}"
                                            )

    st.divider()
    st.subheader("Ảnh cắt tham chiếu chờ duyệt")
    try:
        pending_response = requests.get(
            f"{API_URL}/product-embeddings/pending-review",
            timeout=30,
        )
    except requests.RequestException as exc:
        st.error(f"Không tải được ảnh cắt tham chiếu chờ duyệt: {exc}")
    else:
        if pending_response.status_code != 200:
            st.error(f"Lỗi khi tải ảnh tham chiếu chờ duyệt: {pending_response.text}")
        else:
            pending_embeddings = pending_response.json()
            if not pending_embeddings:
                st.info("Không có ảnh cắt do người dùng xác nhận đang chờ duyệt.")
            for embedding in pending_embeddings:
                with st.expander(
                    (
                        f"Ảnh tham chiếu #{embedding['id']} - {embedding['product_id']} - "
                        f"{embedding.get('product_name') or ''}"
                    ),
                    expanded=False,
                ):
                    preview = image_from_base64(embedding.get("image_preview_base64"))
                    cols = st.columns([1, 2])
                    with cols[0]:
                        if preview is not None:
                            st.image(preview, caption="Ảnh cắt chờ duyệt", width=220)
                        else:
                            st.caption("Không có ảnh xem trước")
                    with cols[1]:
                        embedding_info = {
                            "Mã SP": embedding["product_id"],
                            "Tên sản phẩm": embedding.get("product_name"),
                            "Góc ảnh": embedding.get("view_label"),
                            "Trạng thái": quality_status_label(embedding["quality_status"]),
                        }
                        if show_debug_info():
                            embedding_info.update(
                                {
                                    "Nguồn": source_label(embedding["source"]),
                                    "Đường dẫn ảnh": embedding.get("image_path"),
                                }
                            )
                        st.write(embedding_info)
                        status_cols = st.columns(2)
                        with status_cols[0]:
                            if st.button(
                                "Duyệt",
                                key=f"approve_embedding_{embedding['id']}",
                            ):
                                response = requests.post(
                                    f"{API_URL}/product-embeddings/{embedding['id']}/quality-status",
                                    json={"quality_status": "approved"},
                                    timeout=30,
                                )
                                if response.status_code == 200:
                                    st.success("Đã duyệt.")
                                else:
                                    st.error(response.text)
                        with status_cols[1]:
                            if st.button(
                                "Từ chối",
                                key=f"reject_embedding_{embedding['id']}",
                            ):
                                response = requests.post(
                                    f"{API_URL}/product-embeddings/{embedding['id']}/quality-status",
                                    json={"quality_status": "rejected"},
                                    timeout=30,
                                )
                                if response.status_code == 200:
                                    st.success("Đã từ chối.")
                                else:
                                    st.error(response.text)

elif choice == PAGE_DRAW_BOX:
    st.markdown(
        '<div class="wv-draw-heading">Vẽ vùng sản phẩm bị thiếu</div>',
        unsafe_allow_html=True,
    )
    st.markdown(
        '<div class="wv-draw-caption">Chọn một phiên nhận diện rồi kéo chuột để khoanh vùng sản phẩm bị hệ thống bỏ sót.</div>',
        unsafe_allow_html=True,
    )
    selected_session = select_review_session("draw_box_page")
    if selected_session is not None:
        render_missing_box_canvas(selected_session, "draw_box_page")

elif choice == PAGE_DATASET:
    render_dataset_export_page()

elif choice == PAGE_SETTINGS:
    render_settings_page()

elif choice == PAGE_PRODUCTS:
    st.header("Quản lý sản phẩm")

    st.subheader("Sản phẩm hiện có")
    product_search = st.text_input(
        "Tìm theo mã hoặc tên sản phẩm",
        key="product_management_search",
        placeholder="Nhập mã hoặc tên sản phẩm...",
    )
    try:
        managed_products = fetch_products(
            search=product_search.strip() or None,
            limit=500,
        )
    except requests.RequestException as exc:
        managed_products = []
        st.error(f"Không tải được danh sách sản phẩm: {exc}")

    if managed_products:
        st.dataframe(
            [
                {
                    "Mã sản phẩm": product["product_id"],
                    "Tên sản phẩm": product["name"],
                    "Tồn kho": product["inventory_count"],
                    "Ảnh tham chiếu": product.get("embedding_count", 0),
                }
                for product in managed_products
            ],
            use_container_width=True,
            hide_index=True,
        )

        product_by_id = {
            product["product_id"]: product for product in managed_products
        }
        selected_product_id = st.selectbox(
            "Chọn sản phẩm để quản lý",
            options=list(product_by_id.keys()),
            format_func=lambda product_id: (
                f"{product_id} - {product_by_id[product_id]['name']}"
            ),
            key="selected_product_for_management",
        )
        selected_product = product_by_id[selected_product_id]

        info_cols = st.columns(3)
        info_cols[0].metric("Mã sản phẩm", selected_product["product_id"])
        info_cols[1].metric("Tồn kho", selected_product["inventory_count"])
        info_cols[2].metric(
            "Ảnh tham chiếu",
            selected_product.get("embedding_count", 0),
        )

        st.caption(
            "Xóa sản phẩm sẽ xóa SKU, ảnh tham chiếu/embedding và lịch sử giao dịch "
            "tồn kho của SKU đó. Các phiên rà soát và dữ liệu huấn luyện AI đã lưu "
            "sẽ được giữ lại để kiểm soát dữ liệu."
        )
        pending_delete_product_key = "pending_delete_product_id"
        pending_delete_product_id = st.session_state.get(pending_delete_product_key)

        if pending_delete_product_id != selected_product_id:
            if st.button(
                "Xóa sản phẩm này",
                key=f"start_delete_product_{selected_product_id}",
            ):
                st.session_state[pending_delete_product_key] = selected_product_id
                st.rerun()
        else:
            st.warning(
                f"Bạn sắp xóa sản phẩm {selected_product['product_id']} - "
                f"{selected_product['name']}."
            )
            delete_cols = st.columns([1, 1, 3])
            with delete_cols[0]:
                if st.button(
                    "Xác nhận xóa",
                    key=f"confirm_delete_product_{selected_product_id}",
                ):
                    try:
                        delete_response = delete_product_api(selected_product_id)
                    except requests.RequestException as exc:
                        st.error(f"Không xóa được sản phẩm: {exc}")
                    else:
                        if delete_response.status_code == 200:
                            payload = delete_response.json()
                            st.session_state.pop(pending_delete_product_key, None)
                            st.success(
                                "Đã xóa sản phẩm "
                                f"{payload['product_id']} và "
                                f"{payload['deleted_embeddings']} ảnh tham chiếu."
                            )
                            if show_debug_info():
                                with st.expander("Chi tiết dữ liệu đã xóa"):
                                    st.write(payload)
                            st.rerun()
                        else:
                            st.error(
                                "Không xóa được sản phẩm: "
                                f"{delete_response.text}"
                            )
            with delete_cols[1]:
                if st.button(
                    "Hủy",
                    key=f"cancel_delete_product_{selected_product_id}",
                ):
                    st.session_state.pop(pending_delete_product_key, None)
                    st.rerun()
    else:
        st.info("Chưa có sản phẩm nào phù hợp với điều kiện tìm kiếm.")

    st.divider()
    st.subheader("Đăng ký sản phẩm mới")

    p_id = st.text_input("Mã sản phẩm")
    p_name = st.text_input("Tên sản phẩm")
    p_stock = st.number_input("Số lượng tồn kho ban đầu", min_value=0, value=10)
    p_files = st.file_uploader(
        "Ảnh sản phẩm",
        type=["jpg", "jpeg", "png"],
        accept_multiple_files=True,
        key="product_registration_image",
    )
    p_additional_use_full_image = st.checkbox(
        "Ảnh bổ sung không vẽ vùng: dùng nguyên ảnh để tạo tham chiếu",
        value=True,
        key="registration_additional_use_full_image",
    )

    registration_crop_data_by_index = {}
    registration_crop_errors = []
    if p_files:
        st.caption(
            "Có thể cắt từng ảnh trước khi lưu. "
            "Ảnh nào không vẽ vùng sẽ được lưu nguyên ảnh."
        )
        image_options = {
            (
                "Ảnh chính: " + uploaded_product_file.name
                if file_index == 0
                else f"Ảnh bổ sung {file_index}: {uploaded_product_file.name}"
            ): file_index
            for file_index, uploaded_product_file in enumerate(p_files)
        }
        selected_image_label = st.selectbox(
            "Chọn ảnh để vẽ vùng",
            list(image_options.keys()),
            key="product_registration_crop_image_selector",
        )
        selected_file_index = image_options[selected_image_label]

        for file_index, uploaded_product_file in enumerate(p_files):
            try:
                image = uploaded_file_image(uploaded_product_file)
            except Exception as exc:
                registration_crop_data_by_index[file_index] = None
                registration_crop_errors.append(
                    f"{uploaded_product_file.name}: Không đọc được ảnh: {exc}"
                )
                continue

            display_size = display_dimensions(image, max_width=900)
            file_signature = uploaded_file_signature(uploaded_product_file, file_index)
            stored_crop_value = st.session_state.get(
                f"upload_crop_value_{file_signature}"
            )
            rect_data = latest_canvas_rect_data(
                stored_crop_value,
                image.size,
                display_size,
            )
            registration_crop_data_by_index[file_index] = rect_data
            if rect_data is not None:
                crop_error = box_validation_error(rect_data["original_box"], image.size)
                if crop_error:
                    registration_crop_errors.append(
                        f"{uploaded_product_file.name}: {crop_error}"
                    )

        selected_file = p_files[selected_file_index]
        selected_role = (
            "Ảnh chính"
            if selected_file_index == 0
            else f"Ảnh bổ sung {selected_file_index}"
        )
        rect_data, crop_error = render_uploaded_image_crop_selector(
            selected_file,
            selected_file_index,
            f"{selected_role}: {selected_file.name}",
        )
        registration_crop_data_by_index[selected_file_index] = rect_data
        if crop_error:
            registration_crop_errors.append(f"{selected_file.name}: {crop_error}")

        crop_status_rows = []
        for file_index, uploaded_product_file in enumerate(p_files):
            rect_data = registration_crop_data_by_index.get(file_index)
            crop_status_rows.append(
                {
                    "Ảnh": uploaded_product_file.name,
                    "Trạng thái vùng cắt": "Đã chọn vùng"
                    if rect_data is not None
                    else "Dùng nguyên ảnh",
                }
            )
        st.dataframe(crop_status_rows, use_container_width=True, hide_index=True)

    submit = st.button("Lưu sản phẩm", key="submit_product_registration")

    if submit:
        if not p_id or not p_name or not p_files:
            st.warning("Vui lòng nhập đầy đủ thông tin và chọn ít nhất một ảnh sản phẩm.")
        elif registration_crop_errors:
            st.warning("Có ảnh cắt chưa hợp lệ: " + "; ".join(registration_crop_errors))
        else:
            primary_file = p_files[0]
            primary_rect_data = registration_crop_data_by_index.get(0)
            data = {
                "product_id": p_id,
                "name": p_name,
                "inventory_count": int(p_stock),
            }

            with st.spinner("Đang đăng ký sản phẩm..."):
                progress = st.progress(0)
                rows = []
                total_files = len(p_files)

                try:
                    if primary_rect_data is not None:
                        filename, content, mime_type, _ = crop_uploaded_file_bytes(
                            primary_file,
                            primary_rect_data["original_box"],
                        )
                        primary_payload = build_file_payload_from_bytes(
                            filename,
                            content,
                            mime_type,
                        )
                    else:
                        primary_payload = build_file_payload(primary_file)
                    response = requests.post(
                        f"{API_URL}/products",
                        files=primary_payload,
                        data=data,
                        timeout=120,
                    )
                except requests.RequestException as exc:
                    rows.append(
                        {
                            "Ảnh": primary_file.name,
                            "Vai trò": "Ảnh chính",
                            "Trạng thái": "Thất bại",
                            "Chi tiết": str(exc),
                        }
                    )
                else:
                    if response.status_code in (200, 201):
                        st.session_state["last_registered_product_id"] = p_id
                        rows.append(
                            {
                                "Ảnh": primary_file.name,
                                "Vai trò": "Ảnh chính",
                                "Trạng thái": "Thành công",
                                "Chi tiết": "Đã tạo sản phẩm từ ảnh cắt"
                                if primary_rect_data is not None
                                else "Đã tạo sản phẩm",
                            }
                        )
                    else:
                        rows.append(
                            {
                                "Ảnh": primary_file.name,
                                "Vai trò": "Ảnh chính",
                                "Trạng thái": "Thất bại",
                                "Chi tiết": response.text,
                            }
                        )

                progress.progress(1 / total_files)

                if rows[0]["Trạng thái"] == "Thành công":
                    for index, reference_file in enumerate(p_files[1:], start=2):
                        reference_rect_data = registration_crop_data_by_index.get(
                            index - 1
                        )
                        try:
                            if reference_rect_data is not None:
                                filename, content, mime_type, _ = crop_uploaded_file_bytes(
                                    reference_file,
                                    reference_rect_data["original_box"],
                                )
                                response = upload_reference_image_payload(
                                    p_id,
                                    build_file_payload_from_bytes(
                                        filename,
                                        content,
                                        mime_type,
                                    ),
                                    None,
                                    use_full_image=True,
                                )
                            else:
                                response = upload_reference_image(
                                    p_id,
                                    reference_file,
                                    None,
                                    use_full_image=p_additional_use_full_image,
                                )
                        except requests.RequestException as exc:
                            rows.append(
                                {
                                    "Ảnh": reference_file.name,
                                    "Vai trò": "Ảnh bổ sung",
                                    "Trạng thái": "Thất bại",
                                    "Chi tiết": str(exc),
                                }
                            )
                        else:
                            if response.status_code == 201:
                                payload = response.json()
                                rows.append(
                                    {
                                        "Ảnh": reference_file.name,
                                        "Vai trò": "Ảnh bổ sung",
                                        "Trạng thái": "Thành công",
                                        "Chi tiết": (
                                            f"Ảnh tham chiếu #{payload['id']} từ ảnh cắt"
                                            if reference_rect_data is not None
                                            else f"Ảnh tham chiếu #{payload['id']}"
                                        ),
                                    }
                                )
                            else:
                                rows.append(
                                    {
                                        "Ảnh": reference_file.name,
                                        "Vai trò": "Ảnh bổ sung",
                                        "Trạng thái": "Thất bại",
                                        "Chi tiết": response.text,
                                    }
                                )

                        progress.progress(index / total_files)
                else:
                    for index, reference_file in enumerate(p_files[1:], start=2):
                        rows.append(
                            {
                                "Ảnh": reference_file.name,
                                "Vai trò": "Ảnh bổ sung",
                                "Trạng thái": "Bỏ qua",
                                "Chi tiết": "Ảnh chính lỗi nên sản phẩm chưa được tạo",
                            }
                        )
                        progress.progress(index / total_files)

                success_count = sum(
                    1 for row in rows if row["Trạng thái"] == "Thành công"
                )
                if success_count == total_files:
                    st.success(f"Đã đăng ký sản phẩm với {success_count} ảnh.")
                elif rows[0]["Trạng thái"] == "Thành công":
                    st.warning(f"Đã xử lý thành công {success_count}/{total_files} ảnh.")
                else:
                    st.error("Không đăng ký được sản phẩm.")

                st.dataframe(rows, use_container_width=True, hide_index=True)

    st.divider()
    st.subheader("Thêm ảnh tham chiếu cho sản phẩm đã có")

    with st.form("embedding_form"):
        existing_product_id = st.text_input("Mã sản phẩm đã có", key="embedding_product_id")
        reference_files = st.file_uploader(
            "Ảnh tham chiếu bổ sung",
            type=["jpg", "jpeg", "png"],
            accept_multiple_files=True,
            key="additional_reference_images",
        )
        use_full_image = st.checkbox(
            "Ảnh đã cắt đúng sản phẩm, không cần AI cắt lại",
            value=True,
            key="embedding_use_full_image",
        )
        add_reference = st.form_submit_button("Thêm ảnh tham chiếu")

        if add_reference:
            if not existing_product_id or not reference_files:
                st.warning("Vui lòng nhập mã sản phẩm và chọn ít nhất một ảnh tham chiếu.")
            else:
                with st.spinner("Đang thêm ảnh tham chiếu..."):
                    progress = st.progress(0)
                    rows = []

                    for index, reference_file in enumerate(reference_files, start=1):
                        try:
                            response = upload_reference_image(
                                existing_product_id,
                                reference_file,
                                None,
                                use_full_image=use_full_image,
                            )
                        except requests.RequestException as exc:
                            rows.append(
                                {
                                    "Ảnh": reference_file.name,
                                    "Trạng thái": "Thất bại",
                                    "Chi tiết": str(exc),
                                }
                            )
                        else:
                            if response.status_code == 201:
                                payload = response.json()
                                rows.append(
                                    {
                                        "Ảnh": reference_file.name,
                                        "Trạng thái": "Thành công",
                                        "Chi tiết": f"Ảnh tham chiếu #{payload['id']}",
                                    }
                                )
                            else:
                                rows.append(
                                    {
                                        "Ảnh": reference_file.name,
                                        "Trạng thái": "Thất bại",
                                        "Chi tiết": response.text,
                                    }
                                )

                        progress.progress(index / len(reference_files))

                    success_count = sum(1 for row in rows if row["Trạng thái"] == "Thành công")
                    if success_count == len(rows):
                        st.success(f"Đã thêm {success_count} ảnh tham chiếu.")
                    elif success_count:
                        st.warning(f"Đã thêm {success_count}/{len(rows)} ảnh tham chiếu.")
                    else:
                        st.error("Không thêm được ảnh tham chiếu nào.")

                    st.dataframe(rows, use_container_width=True, hide_index=True)
