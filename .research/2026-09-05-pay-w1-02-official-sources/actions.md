# PAY-W1-02 - Hành động tiếp theo

## Lõi tiếp theo

Tạo pack `draft` và resolver/validator W1-02 theo TDD, nhưng giữ nguyên các cổng pháp lý:

1. Tạo `LegalRulePack` và `RuleContext` với khoảng hiệu lực rõ ràng; khoảng không có ngày kết thúc phải là mở.
2. Tách BHXH, BHYT, BHTN và quỹ tai nạn lao động-bệnh nghề nghiệp thành policy độc lập theo tháng.
3. Ghi nhận các trường chưa chắc chắn bằng metadata `verification_required`; không thay thế bằng số đoán.
4. `resolveRulePack` phải chọn đúng theo earning/payment/tax period và vùng làm việc; báo lỗi khi trùng khoảng hoặc không có pack.
5. `validateRulePack` phải từ chối production finalization nếu thiếu hash tệp nguồn ký số hoặc chữ ký kế toán/chuyên gia.

## Trạng thái thực thi

Duke đã duyệt lượt **sửa mã W1-02 + focused tests + typecheck + local commit**. Kết quả thực thi và commit được ghi tại `docs/agent-packets/PAY-W1-02-handoff.json`; quyền push vẫn không được cấp.

## Bằng chứng cần bổ sung trước production

- Tệp toàn văn/ký số chính thức và SHA-256 của từng văn bản được dùng.
- Bảng PIT 5 bậc nguyên văn, gồm ba mốc trung gian.
- Văn bản thi hành xác nhận mức BHYT thực tế và quỹ tai nạn lao động-bệnh nghề nghiệp.
- Đối chiếu SHA-256 của sổ đăng ký canonical `S01–S21, S31` trước commit.
- Chữ ký/metadata duyệt của kế toán và chuyên gia bên ngoài.
