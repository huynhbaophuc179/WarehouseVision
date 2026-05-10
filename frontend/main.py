import requests
import streamlit as st

API_URL = "http://api:8000/api/v1"

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


def upload_reference_image(product_id, uploaded_file, view_label):
    data = {}
    if view_label:
        data["view_label"] = view_label

    return requests.post(
        f"{API_URL}/products/{product_id}/embeddings",
        files=build_file_payload(uploaded_file),
        data=data,
        timeout=120,
    )


def build_batch_label(prefix, index):
    clean_prefix = prefix.strip() or "view"
    return f"{clean_prefix}_{index}"


if choice == "🔎 Nhận diện sản phẩm":
    st.header("🔎 Nhận diện & Check tồn kho")
    camera_file = st.camera_input("Live Camera")
    uploaded_file = st.file_uploader(
        "Hoặc chọn ảnh sản phẩm...",
        type=["jpg", "jpeg", "png"],
    )
    selected_file = camera_file or uploaded_file

    if selected_file:
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

                        if not results:
                            st.warning("Không phát hiện sản phẩm trong ảnh")
                        else:
                            recognized_count = sum(
                                1 for item in results if item["status"] == "recognized"
                            )
                            st.success(
                                f"Đã xử lý {len(results)} vùng sản phẩm, "
                                f"nhận diện được {recognized_count} sản phẩm."
                            )

                            rows = []
                            for index, item in enumerate(results, start=1):
                                rows.append(
                                    {
                                        "STT": index,
                                        "Box": ", ".join(
                                            f"{value:.1f}" for value in item["box"]
                                        ),
                                        "Trạng thái": item["status"],
                                        "Mã SP": item["product_id"] or "-",
                                        "Tên": item["name"] or "-",
                                        "Tồn kho": item["inventory_count"]
                                        if item["inventory_count"] is not None
                                        else "-",
                                        "Độ sai lệch": f"{item['distance']:.4f}"
                                        if item["distance"] is not None
                                        else "-",
                                    }
                                )

                            st.dataframe(rows, use_container_width=True, hide_index=True)
                    elif response.status_code == 404:
                        st.warning("Không tìm thấy sản phẩm phù hợp")
                    else:
                        st.error(f"Lỗi khi nhận diện sản phẩm: {response.text}")

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
