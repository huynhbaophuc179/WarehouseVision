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
            "Nhãn góc chụp (tuỳ chọn)",
            placeholder="front, back, left, right, top, label, closeup_model_code",
        )
        p_file = st.file_uploader(
            "Ảnh gốc sản phẩm",
            type=["jpg", "jpeg", "png"],
            key="product_registration_image",
        )
        submit = st.form_submit_button("Lưu sản phẩm")

        if submit:
            if not p_id or not p_name or not p_file:
                st.warning("Vui lòng nhập đầy đủ thông tin và chọn ảnh sản phẩm.")
            else:
                data = {
                    "product_id": p_id,
                    "name": p_name,
                    "inventory_count": int(p_stock),
                }
                if p_view_label.strip():
                    data["view_label"] = p_view_label.strip()

                with st.spinner("Đang đăng ký sản phẩm..."):
                    try:
                        response = requests.post(
                            f"{API_URL}/products",
                            files=build_file_payload(p_file),
                            data=data,
                            timeout=120,
                        )
                    except requests.RequestException as exc:
                        st.error(f"Không kết nối được API: {exc}")
                    else:
                        if response.status_code in (200, 201):
                            st.success("Đã đăng ký sản phẩm thành công!")
                        else:
                            st.error(f"Lỗi khi đăng ký sản phẩm: {response.text}")

    st.divider()
    st.subheader("Thêm ảnh tham chiếu cho sản phẩm đã có")

    with st.form("embedding_form"):
        existing_product_id = st.text_input("Mã sản phẩm đã có", key="embedding_product_id")
        view_label = st.text_input(
            "Nhãn góc chụp (tuỳ chọn)",
            key="embedding_view_label",
            placeholder="front, back, left, right, top, label, closeup_model_code",
        )
        reference_file = st.file_uploader(
            "Ảnh tham chiếu bổ sung",
            type=["jpg", "jpeg", "png"],
            key="additional_reference_image",
        )
        add_reference = st.form_submit_button("Thêm ảnh tham chiếu")

        if add_reference:
            if not existing_product_id or not reference_file:
                st.warning("Vui lòng nhập mã sản phẩm và chọn ảnh tham chiếu.")
            else:
                data = {}
                if view_label.strip():
                    data["view_label"] = view_label.strip()

                with st.spinner("Đang thêm ảnh tham chiếu..."):
                    try:
                        response = requests.post(
                            f"{API_URL}/products/{existing_product_id}/embeddings",
                            files=build_file_payload(reference_file),
                            data=data,
                            timeout=120,
                        )
                    except requests.RequestException as exc:
                        st.error(f"Không kết nối được API: {exc}")
                    else:
                        if response.status_code == 201:
                            payload = response.json()
                            st.success(
                                "Đã thêm ảnh tham chiếu "
                                f"#{payload['id']} cho sản phẩm {payload['product_id']}."
                            )
                        elif response.status_code == 404:
                            st.warning("Không tìm thấy mã sản phẩm này trong database.")
                        else:
                            st.error(f"Lỗi khi thêm ảnh tham chiếu: {response.text}")
