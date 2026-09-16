export async function request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new TypeError("Không kết nối được máy chủ. Vui lòng kiểm tra kết nối và thử lại.");
    }
    throw error;
  }
}
