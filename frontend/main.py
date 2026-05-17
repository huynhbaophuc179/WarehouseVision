import base64
import os
from io import BytesIO
from pathlib import Path

import requests
import streamlit as st
import streamlit.components.v1 as components
from PIL import Image, ImageDraw


BOX_CANVAS_COMPONENT_DIR = Path(__file__).parent / "box_canvas_component"
box_canvas_component = components.declare_component(
    "box_canvas_component",
    path=str(BOX_CANVAS_COMPONENT_DIR),
)

API_URL = "http://api:8000/api/v1"
DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD = float(
    os.getenv("DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD", "0.45")
)

st.set_page_config(page_title="AI Inventory System", layout="wide")
st.title("Hệ thống Nhận diện & Quản lý Tồn kho AI")

PAGE_OPERATION = "Nhận diện / Kiểm kho"
PAGE_PRODUCTS = "Quản lý sản phẩm"
PAGE_TRAINING = "Review & sửa lỗi AI"
PAGE_DRAW_BOX = "Vẽ box sản phẩm bị thiếu"
PAGE_DATASET = "Dataset AI nhận diện"
PAGE_SETTINGS = "Cài đặt"

st.sidebar.title("WarehouseVision")
choice = st.sidebar.radio(
    "Chức năng",
    [
        PAGE_OPERATION,
        PAGE_PRODUCTS,
        PAGE_TRAINING,
        PAGE_DRAW_BOX,
        PAGE_DATASET,
        PAGE_SETTINGS,
    ],
)


def build_file_payload(uploaded_file):
    return {
        "file": (
            uploaded_file.name,
            uploaded_file.getvalue(),
            uploaded_file.type or "application/octet-stream",
        )
    }


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


def fetch_products(search=None, limit=100):
    params = {"limit": limit}
    if search:
        params["search"] = search
    response = requests.get(f"{API_URL}/products", params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def build_batch_label(prefix, index):
    clean_prefix = prefix.strip() or "view"
    return f"{clean_prefix}_{index}"


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


def status_label(status):
    labels = {
        "recognized": "recognized",
        "uncertain": "Cần kiểm tra",
        "unknown": "unknown",
    }
    return labels.get(status, status)


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
        return "Please draw a box around the missing product first."

    clamped_box = clamp_box_to_image(box, image_size)
    width = clamped_box[2] - clamped_box[0]
    height = clamped_box[3] - clamped_box[1]
    if clamped_box[0] >= clamped_box[2] or clamped_box[1] >= clamped_box[3]:
        return "Selected box is invalid."
    if width < min_size or height < min_size:
        return "Selected box is too small."
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


def operation_result_rows(results):
    rows = []
    grouped = {}
    for item in results:
        key = item.get("product_id") or f"unknown_{item['detection_id']}"
        grouped.setdefault(
            key,
            {
                "product_id": item.get("product_id") or "-",
                "name": item.get("name") or "Chưa xác định",
                "inventory_count": item.get("inventory_count")
                if item.get("inventory_count") is not None
                else "-",
                "status": status_label(item["status"]),
                "detections": 0,
            },
        )
        grouped[key]["detections"] += 1

    for index, item in enumerate(grouped.values(), start=1):
        rows.append(
            {
                "STT": index,
                "Mã SP": item["product_id"],
                "Tên": item["name"],
                "Tồn kho": item["inventory_count"],
                "Trạng thái": item["status"],
                "Số box": item["detections"],
            }
        )
    return rows


def detection_table_rows(results):
    rows = []
    for index, item in enumerate(results, start=1):
        rows.append(
            {
                "STT": index,
                "Detection ID": item["detection_id"],
                "Box": ", ".join(f"{value:.1f}" for value in item["box"]),
                "Trạng thái": status_label(item["status"]),
                "Mã SP": item["product_id"] or "-",
                "Tên": item["name"] or "-",
                "Tồn kho": item["inventory_count"]
                if item["inventory_count"] is not None
                else "-",
                "Detector": format_confidence(item.get("detector_confidence")),
                "Top1": format_distance(item.get("top1_distance")),
                "Top2": format_distance(item.get("top2_distance")),
                "Margin": format_distance(item.get("distance_margin")),
                "Embedding": item.get("matched_embedding_id") or "-",
                "View": item.get("matched_view_label") or "-",
            }
        )

    return rows


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
                    "detail": "No review_id returned by API",
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
                    "detail": "Feedback saved"
                    if response.status_code == 200
                    else response.text,
                }
            )
    return rows


def submit_inventory_confirmation(results):
    confirmed_items = []
    rejected_items = []

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
                    "quantity": int(st.session_state.get(f"quantity_{detection_id}", 0)),
                    "action": st.session_state.get(f"action_{detection_id}", "count"),
                }
            )
        elif decision == "manual":
            manual_product_id = st.session_state.get(f"manual_product_{detection_id}", "")
            if manual_product_id.strip():
                confirmed_items.append(
                    {
                        "detection_id": detection_id,
                        "product_id": manual_product_id.strip(),
                        "quantity": int(
                            st.session_state.get(f"quantity_{detection_id}", 0)
                        ),
                        "action": st.session_state.get(f"action_{detection_id}", "count"),
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


def fetch_review_sessions(limit=50):
    response = requests.get(
        f"{API_URL}/review/sessions",
        params={"limit": limit},
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


def select_review_session(session_prefix):
    try:
        sessions = fetch_review_sessions(limit=50)
    except requests.RequestException as exc:
        st.error(f"Không tải được danh sách review sessions: {exc}")
        return None

    if not sessions:
        st.info("Chưa có recognition session nào để review.")
        return None

    session_options = {
        (
            f"Session #{session['id']} - {session['mode']} - "
            f"{session['status']} - {session['created_at']}"
        ): session["id"]
        for session in sessions
    }
    selected_label = st.selectbox(
        "Chọn recognition session",
        list(session_options.keys()),
        key=f"{session_prefix}_session_selector",
    )
    selected_session_id = session_options[selected_label]

    try:
        return fetch_review_session(selected_session_id)
    except requests.RequestException as exc:
        st.error(f"Không tải được session: {exc}")
        return None


def render_missing_box_canvas(session, key_prefix):
    original_image_base64 = session.get("original_image_base64")
    preview_image = load_image_for_canvas(original_image_base64)
    if preview_image is None:
        st.warning("Original image is not available for drawing.")
        return

    original_width = session.get("original_image_width") or preview_image.width
    original_height = session.get("original_image_height") or preview_image.height
    original_size = (int(original_width), int(original_height))
    preview_size = (
        session.get("preview_image_width") or preview_image.width,
        session.get("preview_image_height") or preview_image.height,
    )

    st.subheader("Vẽ box sản phẩm bị thiếu")
    st.caption("Kéo chuột để khoanh vùng sản phẩm bị hệ thống detect thiếu.")

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
    stored_value = st.session_state.get(stored_box_key)
    initial_box = (
        stored_value.get("displayed_box")
        if isinstance(stored_value, dict) and stored_value.get("displayed_box")
        else None
    )

    canvas_col, detail_col = st.columns([2, 1])
    with canvas_col:
        canvas_value = render_box_canvas_component(
            image_base64=original_image_base64,
            image_mime_type=image_mime_type,
            display_size=display_size,
            initial_box=initial_box,
            existing_boxes=existing_boxes,
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
        st.subheader("Box vừa chọn")
        if st.button(
            "Xóa vùng đã chọn",
            key=f"{key_prefix}_clear_box_{session['id']}",
            disabled=rect_data is None,
        ):
            st.session_state.pop(stored_box_key, None)
            st.session_state.pop(selection_id_key, None)
            st.session_state.pop(manual_result_key, None)
            st.session_state[reset_counter_key] = (
                st.session_state.get(reset_counter_key, 0) + 1
            )
            st.rerun()

        if rect_data is None:
            st.info("Hãy kéo chuột trên ảnh để khoanh vùng sản phẩm còn thiếu.")
        else:
            original_box = rect_data["original_box"]
            canvas_box = rect_data["canvas_box"]
            validation_error = box_validation_error(original_box, original_size)
            st.caption(
                "Đã chọn vùng: "
                + ", ".join(f"{value:.1f}" for value in original_box)
            )
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
                st.image(preview_crop, caption="Crop preview", use_container_width=True)

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
        st.caption("Nhãn AI nhận diện: sản phẩm")
        confirm_save = st.checkbox(
            "Xác nhận lưu box này làm dữ liệu huấn luyện AI nhận diện",
            value=False,
            key=f"{key_prefix}_confirm_ai_save_{session['id']}",
        )

        if st.button(
            "Lưu box đã vẽ",
            key=f"{key_prefix}_add_drawn_box_{session['id']}",
        ):
            if rect_data is None:
                st.warning("Hãy vẽ box quanh sản phẩm còn thiếu trước.")
                return
            original_box = rect_data["original_box"]
            validation_error = box_validation_error(original_box, original_size)
            if validation_error:
                st.warning(validation_error)
                return
            if not confirm_save:
                st.warning("Vui lòng xác nhận trước khi lưu dữ liệu huấn luyện AI.")
                return

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
                st.error(f"Không thêm được box đã vẽ: {exc}")
            else:
                if manual_response.status_code == 200:
                    manual_payload = manual_response.json()
                    st.session_state[manual_result_key] = manual_payload
                    st.success("Đã lưu box và dữ liệu huấn luyện AI.")
                    annotation = manual_payload.get("yolo_annotation")
                    if annotation:
                        with st.expander("Dữ liệu AI đã lưu", expanded=False):
                            st.write(annotation)
                else:
                    st.error(f"Lỗi khi thêm box đã vẽ: {manual_response.text}")

        if manual_result:
            st.divider()
            st.caption("Kết quả AI nhận diện từ crop vừa lưu")
            if manual_result.get("candidates"):
                st.dataframe(
                    [
                        {
                            "product_id": candidate["product_id"],
                            "name": candidate["name"],
                            "distance": format_distance(candidate["distance"]),
                            "embedding": candidate["matched_embedding_id"],
                        }
                        for candidate in manual_result["candidates"]
                    ],
                    use_container_width=True,
                    hide_index=True,
                )

    with st.expander("Manual coordinate input", expanded=False):
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
                "Product ID có sẵn (optional)",
                key=f"{key_prefix}_manual_product_id_{session['id']}",
            )
            manual_external_product_id = st.text_input(
                "Mã sản phẩm ngoài hệ thống (optional)",
                key=f"{key_prefix}_manual_external_product_id_{session['id']}",
            )
            confirm_manual = st.checkbox(
                "Xác nhận lưu box thủ công làm dữ liệu huấn luyện AI nhận diện",
                value=False,
                key=f"{key_prefix}_manual_confirm_{session['id']}",
            )
            add_manual = st.form_submit_button("Lưu box sản phẩm bị thiếu")

            if add_manual:
                manual_box = [manual_x1, manual_y1, manual_x2, manual_y2]
                if box_is_too_small(manual_box):
                    st.warning("Selected box is too small.")
                elif box_outside_image(manual_box, original_size):
                    st.warning("Selected box is outside the image bounds.")
                elif not confirm_manual:
                    st.warning("Please confirm save before adding this annotation.")
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
                        st.error(f"Không thêm được box thủ công: {exc}")
                    else:
                        if manual_response.status_code == 200:
                            st.session_state[
                                f"manual_detection_response_{session['id']}"
                            ] = manual_response.json()
                            st.success("Đã thêm box thủ công.")
                        else:
                            st.error(
                                "Lỗi khi thêm manual detection: "
                                f"{manual_response.text}"
                            )


def render_dataset_export_page():
    st.header("Dataset AI nhận diện")
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
    col2.metric("File nhãn", summary["label_file_count"])
    col3.metric("Box", summary["box_count"])
    col4.metric("Chờ review", summary["pending_review_count"])
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
                st.success(f"Đã tạo cấu hình dữ liệu: {payload['data_yaml_path']}")
                st.json(payload["summary"])
            else:
                st.error(f"Lỗi khi tạo cấu hình dữ liệu: {export_response.text}")


def render_settings_page():
    st.header("Cài đặt")
    st.caption("Các giá trị này đang được set bằng environment variables trong API.")
    st.write(
        {
            "API_URL": API_URL,
            "DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD": (
                DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD
            ),
            "AI_RECOGNITION_DATASET_DIR": "API env for training data directory",
            "SIMILARITY_RECOGNIZED_THRESHOLD": "API env",
            "SIMILARITY_UNKNOWN_THRESHOLD": "API env",
            "SIMILARITY_MARGIN_THRESHOLD": "API env",
        }
    )


if choice == PAGE_OPERATION:
    st.header("Nhận diện / Kiểm kho")
    camera_file = st.camera_input("Live Camera")
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
        st.subheader("Kết quả scan")
        duplicate_ids = duplicate_product_ids(results)
        if duplicate_ids:
            st.warning(
                "Cùng một sản phẩm được nhận diện ở nhiều box. "
                "Hãy kiểm tra kỹ để tránh nhập tồn kho sai."
            )
        st.image(
            draw_annotated_image(image_bytes, results),
            caption="Ảnh đã đánh dấu vùng phát hiện",
            use_container_width=True,
        )
        st.dataframe(operation_result_rows(results), use_container_width=True, hide_index=True)

        st.subheader("Xác nhận nhanh")
        for index, item in enumerate(results, start=1):
            detection_id = item["detection_id"]
            title = (
                f"{index}. {detection_id} - {status_label(item['status'])} - "
                f"{item.get('name') or 'Chưa xác định'}"
            )
            with st.expander(title, expanded=True):
                st.write(
                    {
                        "Mã SP": item.get("product_id") or "-",
                        "Tên": item.get("name") or "Chưa xác định",
                        "Tồn kho": item.get("inventory_count")
                        if item.get("inventory_count") is not None
                        else "-",
                        "Trạng thái": status_label(item["status"]),
                    }
                )

                if item["status"] == "uncertain":
                    st.warning("Cần kiểm tra trước khi xác nhận.")
                detector_confidence = item.get("detector_confidence")
                if (
                    detector_confidence is not None
                    and detector_confidence < DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD
                ):
                    st.warning("Crop này có thể không phải sản phẩm hợp lệ.")

                with st.expander("Technical Details", expanded=False):
                    preview = crop_preview_image(item.get("crop_preview_base64"))
                    if preview is not None:
                        st.image(preview, caption="Crop dùng để nhận diện", width=180)
                    st.write(
                        {
                            "session_id": item.get("session_id"),
                            "review_id": item.get("review_id"),
                            "box": item.get("box"),
                            "detector_confidence": format_confidence(
                                item.get("detector_confidence")
                            ),
                            "top1_distance": format_distance(item.get("top1_distance")),
                            "top2_distance": format_distance(item.get("top2_distance")),
                            "distance_margin": format_distance(
                                item.get("distance_margin")
                            ),
                            "matched_embedding_id": item.get("matched_embedding_id"),
                            "matched_view_label": item.get("matched_view_label"),
                        }
                    )
                    candidates = item.get("candidates") or []
                    if candidates:
                        st.dataframe(
                            [
                                {
                                    "product_id": candidate["product_id"],
                                    "name": candidate["name"],
                                    "inventory_count": candidate["inventory_count"],
                                    "distance": format_distance(candidate["distance"]),
                                    "embedding": candidate["matched_embedding_id"],
                                    "view": candidate["matched_view_label"] or "-",
                                }
                                for candidate in candidates
                            ],
                            use_container_width=True,
                            hide_index=True,
                        )

                decision_options = [
                    "confirm",
                    "manual",
                    "unknown",
                    "reject",
                    "report",
                ]
                decision_labels = {
                    "confirm": "Xác nhận đúng",
                    "manual": "Chọn product_id khác",
                    "unknown": "Đánh dấu unknown",
                    "reject": "Không phải sản phẩm",
                    "report": "Gửi sang Training Review",
                }
                if not item.get("product_id"):
                    decision_options = ["unknown", "manual", "reject", "report"]
                elif item["status"] == "uncertain":
                    decision_options = ["manual", "confirm", "unknown", "reject", "report"]

                st.radio(
                    "Quyết định",
                    decision_options,
                    format_func=lambda value: decision_labels[value],
                    horizontal=True,
                    key=f"decision_{detection_id}",
                )

                decision = st.session_state.get(
                    f"decision_{detection_id}",
                    decision_options[0],
                )

                if decision == "manual":
                    st.text_input(
                        "Nhập product_id thay thế",
                        key=f"manual_product_{detection_id}",
                    )

                if decision in {"confirm", "manual"}:
                    st.checkbox(
                        "Add this crop as product reference image",
                        value=False,
                        key=f"add_reference_{detection_id}",
                    )
                    st.checkbox(
                        "Dùng box đã xác nhận làm dữ liệu huấn luyện AI",
                        value=False,
                        key=f"use_yolo_training_{detection_id}",
                    )
                    col1, col2 = st.columns(2)
                    with col1:
                        st.number_input(
                            "Số lượng",
                            min_value=0,
                            value=1,
                            step=1,
                            key=f"quantity_{detection_id}",
                        )
                    with col2:
                        st.selectbox(
                            "Hành động tồn kho",
                            ["count", "stock_in", "stock_out", "adjustment"],
                            key=f"action_{detection_id}",
                        )

                if decision == "reject":
                    st.text_input(
                        "Lý do loại bỏ",
                        key=f"reject_reason_{detection_id}",
                    )

        if st.button("Confirm inventory result"):
            feedback_rows = save_detection_feedback(results)
            st.session_state["feedback_save_response"] = feedback_rows
            failed_feedback = [row for row in feedback_rows if row["status"] == "failed"]
            if failed_feedback:
                st.warning("Một số feedback chưa lưu được. Kiểm tra Review & sửa lỗi AI để rà lại.")
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
            if st.session_state.get("feedback_save_response"):
                st.caption("Feedback review")
                st.dataframe(
                    st.session_state["feedback_save_response"],
                    use_container_width=True,
                    hide_index=True,
                )
            if confirmation.get("confirmed_items"):
                st.dataframe(
                    confirmation["confirmed_items"],
                    use_container_width=True,
                    hide_index=True,
                )
            if confirmation.get("rejected_items"):
                st.dataframe(
                    confirmation["rejected_items"],
                    use_container_width=True,
                    hide_index=True,
                )

elif choice == PAGE_TRAINING:
    st.header("Review & sửa lỗi AI")

    try:
        sessions_response = requests.get(
            f"{API_URL}/review/sessions",
            params={"limit": 50},
            timeout=30,
        )
    except requests.RequestException as exc:
        st.error(f"Không tải được danh sách review sessions: {exc}")
        sessions_response = None

    if sessions_response is not None:
        if sessions_response.status_code != 200:
            st.error(f"Lỗi khi tải review sessions: {sessions_response.text}")
        else:
            sessions = sessions_response.json()
            if not sessions:
                st.info("Chưa có recognition session nào để review.")
            else:
                session_options = {
                    (
                        f"Session #{session['id']} - {session['mode']} - "
                        f"{session['created_at']}"
                    ): session["id"]
                    for session in sessions
                }
                selected_label = st.selectbox(
                    "Chọn recognition session",
                    list(session_options.keys()),
                )
                selected_session_id = session_options[selected_label]

                try:
                    session_response = requests.get(
                        f"{API_URL}/review/sessions/{selected_session_id}",
                        timeout=30,
                    )
                except requests.RequestException as exc:
                    st.error(f"Không tải được session: {exc}")
                    session_response = None

                if session_response is not None:
                    if session_response.status_code != 200:
                        st.error(f"Lỗi khi tải session: {session_response.text}")
                    else:
                        session = session_response.json()
                        st.write(
                            {
                                "session_id": session["id"],
                                "mode": session["mode"],
                                "status": session["status"],
                                "model_version": session.get("model_version") or "-",
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
                        detections = session.get("detections") or []

                        if original_image is not None and original_bytes:
                            with st.expander("Current detected boxes", expanded=False):
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
                                    caption="Bounding boxes",
                                    use_container_width=True,
                                )

                        st.info(
                            "Để thêm sản phẩm bị detect thiếu, mở trang "
                            "'Vẽ box sản phẩm bị thiếu' ở sidebar."
                        )

                        st.subheader("Detection reviews")
                        for detection in detections:
                            title = (
                                f"Detection #{detection['detection_index']} - "
                                f"{detection.get('predicted_product_id') or 'unknown'} - "
                                f"{detection['user_decision']}"
                            )
                            with st.expander(title, expanded=False):
                                crop = image_from_base64(
                                    detection.get("crop_preview_base64")
                                )
                                crop_col, detail_col = st.columns([1, 2])
                                with crop_col:
                                    if crop is not None:
                                        st.image(crop, caption="Recognition crop", width=220)
                                    else:
                                        st.caption("No crop image available")
                                with detail_col:
                                    st.write(
                                        {
                                            "predicted_product_id": detection.get(
                                                "predicted_product_id"
                                            ),
                                            "confirmed_product_id": detection.get(
                                                "confirmed_product_id"
                                            ),
                                            "detector_confidence": format_confidence(
                                                detection.get("detector_confidence")
                                            ),
                                            "top1_distance": format_distance(
                                                detection.get("top1_distance")
                                            ),
                                            "top2_distance": format_distance(
                                                detection.get("top2_distance")
                                            ),
                                            "distance_margin": format_distance(
                                                detection.get("distance_margin")
                                            ),
                                            "matched_embedding_id": detection.get(
                                                "matched_embedding_id"
                                            ),
                                            "matched_view_label": detection.get(
                                                "matched_view_label"
                                            ),
                                        }
                                    )

                                candidates = detection.get("candidates") or []
                                if candidates:
                                    st.dataframe(
                                        [
                                            {
                                                "product_id": candidate["product_id"],
                                                "name": candidate["name"],
                                                "inventory_count": candidate[
                                                    "inventory_count"
                                                ],
                                                "distance": format_distance(
                                                    candidate["distance"]
                                                ),
                                                "embedding": candidate[
                                                    "matched_embedding_id"
                                                ],
                                                "view": candidate["matched_view_label"]
                                                or "-",
                                            }
                                            for candidate in candidates
                                        ],
                                        use_container_width=True,
                                        hide_index=True,
                                    )

                                with st.form(f"training_review_{detection['id']}"):
                                    decisions = [
                                        "accepted",
                                        "corrected_product",
                                        "needs_review",
                                        "wrong_sku",
                                        "not_product",
                                        "unknown",
                                        "rejected_detection",
                                        "box_adjusted",
                                        "manually_added",
                                        "ignored",
                                    ]
                                    current_decision = detection.get("user_decision")
                                    selected_decision = st.selectbox(
                                        "Training decision",
                                        decisions,
                                        index=decisions.index(current_decision)
                                        if current_decision in decisions
                                        else 0,
                                    )
                                    confirmed_product_id = st.text_input(
                                        "Confirmed product_id",
                                        value=detection.get("confirmed_product_id")
                                        or detection.get("predicted_product_id")
                                        or "",
                                    )
                                    add_as_reference = st.checkbox(
                                        "Add this crop as product reference image",
                                        value=False,
                                    )
                                    use_for_yolo_training = st.checkbox(
                                        "Dùng box đã review làm dữ liệu huấn luyện AI",
                                        value=False,
                                    )
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
                                        "Dùng trang 'Vẽ box sản phẩm bị thiếu' để thêm "
                                        "box mới trực tiếp trên ảnh."
                                    )
                                    submitted = st.form_submit_button("Save review")

                                    if submitted:
                                        confirmed_value = confirmed_product_id.strip()
                                        if selected_decision in {
                                            "wrong_sku",
                                            "needs_review",
                                            "not_product",
                                            "unknown",
                                            "rejected_detection",
                                            "ignored",
                                        }:
                                            confirmed_value = ""
                                        payload = {
                                            "user_decision": selected_decision,
                                            "confirmed_product_id": confirmed_value or None,
                                            "add_as_reference": add_as_reference,
                                            "reference_quality_status": "pending",
                                            "use_for_yolo_training": use_for_yolo_training,
                                        }
                                        if selected_decision in {
                                            "box_adjusted",
                                            "manually_added",
                                        }:
                                            payload["corrected_box"] = [
                                                corrected_x1,
                                                corrected_y1,
                                                corrected_x2,
                                                corrected_y2,
                                            ]
                                        try:
                                            update_response = requests.post(
                                                f"{API_URL}/review/detections/{detection['id']}",
                                                json=payload,
                                                timeout=120,
                                            )
                                        except requests.RequestException as exc:
                                            st.error(f"Không lưu được review: {exc}")
                                        else:
                                            if update_response.status_code == 200:
                                                st.success("Đã lưu review.")
                                            else:
                                                st.error(
                                                    f"Lỗi khi lưu review: {update_response.text}"
                                                )

    st.divider()
    st.subheader("Pending reference crops")
    try:
        pending_response = requests.get(
            f"{API_URL}/product-embeddings/pending-review",
            timeout=30,
        )
    except requests.RequestException as exc:
        st.error(f"Không tải được pending reference crops: {exc}")
    else:
        if pending_response.status_code != 200:
            st.error(f"Lỗi khi tải pending references: {pending_response.text}")
        else:
            pending_embeddings = pending_response.json()
            if not pending_embeddings:
                st.info("Không có pending user-confirmed crop nào.")
            for embedding in pending_embeddings:
                with st.expander(
                    (
                        f"Embedding #{embedding['id']} - {embedding['product_id']} - "
                        f"{embedding.get('product_name') or ''}"
                    ),
                    expanded=False,
                ):
                    preview = image_from_base64(embedding.get("image_preview_base64"))
                    cols = st.columns([1, 2])
                    with cols[0]:
                        if preview is not None:
                            st.image(preview, caption="Pending crop", width=220)
                        else:
                            st.caption("No preview available")
                    with cols[1]:
                        st.write(
                            {
                                "product_id": embedding["product_id"],
                                "product_name": embedding.get("product_name"),
                                "view_label": embedding.get("view_label"),
                                "source": embedding["source"],
                                "quality_status": embedding["quality_status"],
                                "image_path": embedding.get("image_path"),
                            }
                        )
                        status_cols = st.columns(2)
                        with status_cols[0]:
                            if st.button(
                                "Approve",
                                key=f"approve_embedding_{embedding['id']}",
                            ):
                                response = requests.post(
                                    f"{API_URL}/product-embeddings/{embedding['id']}/quality-status",
                                    json={"quality_status": "approved"},
                                    timeout=30,
                                )
                                if response.status_code == 200:
                                    st.success("Approved.")
                                else:
                                    st.error(response.text)
                        with status_cols[1]:
                            if st.button(
                                "Reject",
                                key=f"reject_embedding_{embedding['id']}",
                            ):
                                response = requests.post(
                                    f"{API_URL}/product-embeddings/{embedding['id']}/quality-status",
                                    json={"quality_status": "rejected"},
                                    timeout=30,
                                )
                                if response.status_code == 200:
                                    st.success("Rejected.")
                                else:
                                    st.error(response.text)

elif choice == PAGE_DRAW_BOX:
    st.header("Vẽ box sản phẩm bị thiếu")
    st.caption("Chọn một recognition session rồi vẽ box còn thiếu trực tiếp trên ảnh.")
    selected_session = select_review_session("draw_box_page")
    if selected_session is not None:
        render_missing_box_canvas(selected_session, "draw_box_page")

elif choice == PAGE_DATASET:
    render_dataset_export_page()

elif choice == PAGE_SETTINGS:
    render_settings_page()

elif choice == PAGE_PRODUCTS:
    st.header("Quản lý sản phẩm")

    with st.form("reg_form"):
        p_id = st.text_input("Mã sản phẩm (Product ID)")
        p_name = st.text_input("Tên sản phẩm")
        p_stock = st.number_input("Số lượng tồn kho ban đầu", min_value=0, value=10)
        p_view_label = st.text_input(
            "Nhãn ảnh đầu tiên (tuỳ chọn)",
            placeholder="front, back, left, right, top, label, closeup_model_code",
        )
        p_label_prefix = st.text_input(
            "Tiền tố nhãn cho bộ ảnh",
            value="view",
            placeholder="view, front, back, angle",
        )
        p_files = st.file_uploader(
            "Ảnh sản phẩm",
            type=["jpg", "jpeg", "png"],
            accept_multiple_files=True,
            key="product_registration_image",
        )
        p_additional_use_full_image = st.checkbox(
            "Ảnh bổ sung đã crop đúng sản phẩm, không cần AI crop lại",
            value=True,
            key="registration_additional_use_full_image",
        )
        submit = st.form_submit_button("Lưu sản phẩm")

        if submit:
            if not p_id or not p_name or not p_files:
                st.warning("Vui lòng nhập đầy đủ thông tin và chọn ít nhất một ảnh sản phẩm.")
            else:
                primary_file = p_files[0]
                primary_view_label = p_view_label.strip() or build_batch_label(
                    p_label_prefix,
                    1,
                )
                data = {
                    "product_id": p_id,
                    "name": p_name,
                    "inventory_count": int(p_stock),
                    "view_label": primary_view_label,
                }

                with st.spinner("Đang đăng ký sản phẩm..."):
                    progress = st.progress(0)
                    rows = []
                    total_files = len(p_files)

                    try:
                        response = requests.post(
                            f"{API_URL}/products",
                            files=build_file_payload(primary_file),
                            data=data,
                            timeout=120,
                        )
                    except requests.RequestException as exc:
                        rows.append(
                            {
                                "filename": primary_file.name,
                                "role": "primary",
                                "view_label": primary_view_label,
                                "status": "failed",
                                "detail": str(exc),
                            }
                        )
                    else:
                        if response.status_code in (200, 201):
                            st.session_state["last_registered_product_id"] = p_id
                            rows.append(
                                {
                                    "filename": primary_file.name,
                                    "role": "primary",
                                    "view_label": primary_view_label,
                                    "status": "success",
                                    "detail": "Product created",
                                }
                            )
                        else:
                            rows.append(
                                {
                                    "filename": primary_file.name,
                                    "role": "primary",
                                    "view_label": primary_view_label,
                                    "status": "failed",
                                    "detail": response.text,
                                }
                            )

                    progress.progress(1 / total_files)

                    if rows[0]["status"] == "success":
                        for index, reference_file in enumerate(p_files[1:], start=2):
                            view_label = build_batch_label(p_label_prefix, index)
                            try:
                                response = upload_reference_image(
                                    p_id,
                                    reference_file,
                                    view_label,
                                    use_full_image=p_additional_use_full_image,
                                )
                            except requests.RequestException as exc:
                                rows.append(
                                    {
                                        "filename": reference_file.name,
                                        "role": "additional",
                                        "view_label": view_label,
                                        "status": "failed",
                                        "detail": str(exc),
                                    }
                                )
                            else:
                                if response.status_code == 201:
                                    payload = response.json()
                                    rows.append(
                                        {
                                            "filename": reference_file.name,
                                            "role": "additional",
                                            "view_label": payload["view_label"]
                                            or view_label,
                                            "status": "success",
                                            "detail": f"Embedding #{payload['id']}",
                                        }
                                    )
                                else:
                                    rows.append(
                                        {
                                            "filename": reference_file.name,
                                            "role": "additional",
                                            "view_label": view_label,
                                            "status": "failed",
                                            "detail": response.text,
                                        }
                                    )

                            progress.progress(index / total_files)
                    else:
                        for index, reference_file in enumerate(p_files[1:], start=2):
                            rows.append(
                                {
                                    "filename": reference_file.name,
                                    "role": "additional",
                                    "view_label": build_batch_label(p_label_prefix, index),
                                    "status": "skipped",
                                    "detail": "Primary image failed; product was not created",
                                }
                            )
                            progress.progress(index / total_files)

                    success_count = sum(1 for row in rows if row["status"] == "success")
                    if success_count == total_files:
                        st.success(f"Đã đăng ký sản phẩm với {success_count} ảnh.")
                    elif rows[0]["status"] == "success":
                        st.warning(f"Đã xử lý thành công {success_count}/{total_files} ảnh.")
                    else:
                        st.error("Không đăng ký được sản phẩm.")

                    st.dataframe(rows, use_container_width=True, hide_index=True)

    st.divider()
    st.subheader("Thêm ảnh tham chiếu cho sản phẩm đã có")

    with st.form("embedding_form"):
        existing_product_id = st.text_input("Mã sản phẩm đã có", key="embedding_product_id")
        label_prefix = st.text_input(
            "Tiền tố nhãn chung",
            key="embedding_label_prefix",
            placeholder="front, back, angle",
        )
        reference_files = st.file_uploader(
            "Ảnh tham chiếu bổ sung",
            type=["jpg", "jpeg", "png"],
            accept_multiple_files=True,
            key="additional_reference_images",
        )
        use_full_image = st.checkbox(
            "Ảnh đã crop đúng sản phẩm, không cần AI crop lại",
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
                        view_label = build_batch_label(label_prefix, index)
                        try:
                            response = upload_reference_image(
                                existing_product_id,
                                reference_file,
                                view_label,
                                use_full_image=use_full_image,
                            )
                        except requests.RequestException as exc:
                            rows.append(
                                {
                                    "Ảnh": reference_file.name,
                                    "View label": view_label,
                                    "Trạng thái": "failed",
                                    "Chi tiết": str(exc),
                                }
                            )
                        else:
                            if response.status_code == 201:
                                payload = response.json()
                                rows.append(
                                    {
                                        "Ảnh": reference_file.name,
                                        "View label": payload["view_label"] or view_label,
                                        "Trạng thái": "success",
                                        "Chi tiết": f"Embedding #{payload['id']}",
                                    }
                                )
                            else:
                                rows.append(
                                    {
                                        "Ảnh": reference_file.name,
                                        "View label": view_label,
                                        "Trạng thái": "failed",
                                        "Chi tiết": response.text,
                                    }
                                )

                        progress.progress(index / len(reference_files))

                    success_count = sum(1 for row in rows if row["Trạng thái"] == "success")
                    if success_count == len(rows):
                        st.success(f"Đã thêm {success_count} ảnh tham chiếu.")
                    elif success_count:
                        st.warning(f"Đã thêm {success_count}/{len(rows)} ảnh tham chiếu.")
                    else:
                        st.error("Không thêm được ảnh tham chiếu nào.")

                    st.dataframe(rows, use_container_width=True, hide_index=True)
