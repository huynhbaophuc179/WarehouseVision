import base64
import os
from io import BytesIO

import requests
import streamlit as st
from PIL import Image, ImageDraw

API_URL = "http://api:8000/api/v1"
DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD = float(
    os.getenv("DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD", "0.45")
)

st.set_page_config(page_title="AI Inventory System", layout="wide")
st.title("🛡️ Hệ thống Nhận diện & Quản lý Tồn kho AI")

menu = ["🔎 Nhận diện sản phẩm", "📦 Đăng ký sản phẩm mới"]
choice = st.sidebar.selectbox("Chức năng", menu)


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
    )
    for key in list(st.session_state.keys()):
        if key.startswith(prefixes):
            st.session_state.pop(key, None)


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


if choice == "🔎 Nhận diện sản phẩm":
    st.header("🔎 Nhận diện & Check tồn kho")
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
            clear_confirmation_state()

        st.image(selected_file, caption="Ảnh đầu vào", width=300)

        if st.button("Bắt đầu nhận diện"):
            with st.spinner("Đang xử lý AI..."):
                try:
                    response = requests.post(
                        f"{API_URL}/recognize",
                        files=build_file_payload(selected_file),
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
        st.subheader("Kết quả gợi ý từ AI")
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
        st.dataframe(detection_table_rows(results), use_container_width=True, hide_index=True)

        st.subheader("Xác nhận của người dùng")
        for index, item in enumerate(results, start=1):
            detection_id = item["detection_id"]
            title = (
                f"{index}. {detection_id} - {status_label(item['status'])} - "
                f"{item.get('name') or 'Chưa xác định'}"
            )
            with st.expander(title, expanded=True):
                preview = crop_preview_image(item.get("crop_preview_base64"))
                crop_col, meta_col = st.columns([1, 2])
                with crop_col:
                    if preview is not None:
                        st.image(preview, caption="Crop dùng để nhận diện", width=180)
                    else:
                        st.caption("Không có crop preview")
                with meta_col:
                    st.write(
                        {
                            "product_id": item.get("product_id"),
                            "status": status_label(item["status"]),
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

                    if item["status"] == "uncertain":
                        st.warning("Cần kiểm tra: top candidate chưa đủ tách biệt.")
                    detector_confidence = item.get("detector_confidence")
                    if (
                        detector_confidence is not None
                        and detector_confidence < DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD
                    ):
                        st.warning(
                            "Detector confidence thấp, crop này có thể không phải "
                            "sản phẩm hợp lệ."
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
                ]
                decision_labels = {
                    "confirm": "Xác nhận đúng",
                    "manual": "Chọn product_id khác",
                    "unknown": "Đánh dấu unknown",
                    "reject": "Loại bỏ detection",
                }
                if not item.get("product_id"):
                    decision_options = ["unknown", "manual", "reject"]
                elif item["status"] == "uncertain":
                    decision_options = ["manual", "confirm", "unknown", "reject"]

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

elif choice == "📦 Đăng ký sản phẩm mới":
    st.header("📦 Đăng ký vào Database")

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
            "Ảnh bổ sung đã crop đúng sản phẩm, không cần YOLO crop lại",
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
            "Ảnh đã crop đúng sản phẩm, không cần YOLO crop lại",
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
