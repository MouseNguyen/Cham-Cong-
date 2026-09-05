# PAY-W1-02 - Điều chưa xác minh

## Đã giải quyết

- `U-001` — Đã tìm thấy sổ đăng ký canonical tại `.research/2026-09-03-pay-slip-plan-cross-check/sources.json`; W1-02 dùng nguyên ánh xạ `S01–S21, S31` ở đó.

## Còn mở
2. `U-002` — Ba mốc PIT trung gian chưa được trích trực tiếp từ tệp Luật 109/2025/QH15 ký số trong lượt nghiên cứu giới hạn 12 trang. Chúng chỉ được phép tồn tại trong pack `draft` với cờ cần xác minh.
3. `U-003` — Luật BHYT nêu mức tối đa 6%, không tự nó chứng minh mức đóng thực tế hiện hành là 4,5%. Cần văn bản thi hành chính thức trước khi chốt số.
4. `U-004` — Tỷ lệ quỹ tai nạn lao động, bệnh nghề nghiệp và mọi ngoại lệ giảm đóng chưa được nghiên cứu trong lượt này.
5. `U-005` — Nội dung Điều 95, Điều 98, Điều 112 Bộ luật Lao động và Điều 55–57 Nghị định 145 chưa được băm/đối chiếu từ tệp ký số; hiện mới khóa được metadata chính thức.
6. `U-006` — Chưa có chữ ký xác nhận của kế toán và chuyên gia bên ngoài; đây là cổng bắt buộc trước production finalization.
7. `U-007` — Chưa xác định ngày kết thúc hiệu lực cho các văn bản không tự đặt ngày hết hiệu lực; pack phải dùng khoảng mở và giải quyết theo ngày hiệu lực/thay thế, không được tự bịa `effectiveTo`.
