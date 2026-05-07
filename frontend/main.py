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
        p_file = st.file_uploader("Ảnh gốc sản phẩm", type=["jpg", "jpeg", "png"])
        submit = st.form_submit_button("Lưu sản phẩm")

        if submit:
            if not p_id or not p_name or not p_file:
                st.warning("Vui lòng nhập đầy đủ thông tin và chọn ảnh sản phẩm.")
            else:
                with st.spinner("Đang đăng ký sản phẩm..."):
                    try:
                        response = requests.post(
                            f"{API_URL}/products",
                            files=build_file_payload(p_file),
                            data={
                                "product_id": p_id,
                                "name": p_name,
                                "inventory_count": int(p_stock),
                            },
                            timeout=120,
                        )
                    except requests.RequestException as exc:
                        st.error(f"Không kết nối được API: {exc}")
                    else:
                        if response.status_code in (200, 201):
                            st.success("Đã đăng ký sản phẩm thành công!")
                        else:
                            st.error(f"Lỗi khi đăng ký sản phẩm: {response.text}")
