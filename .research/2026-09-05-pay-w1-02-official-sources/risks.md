# PAY-W1-02 - Rủi ro

| ID | Rủi ro | Mức | Kiểm soát |
|---|---|---:|---|
| R-001 | Dùng `6%` BHYT tối đa như mức đóng thực tế | Cao | Giữ trường này chưa xác minh hoặc tách `statutoryMaximum` khỏi `appliedRate`; không final hóa khi thiếu nguồn thi hành. |
| R-002 | Dùng suy luận ba mốc PIT trung gian như sự thật production | Cao | Cho phép trong `draft` với metadata `verification_required`; đối chiếu tệp luật ký số trước chữ ký. |
| R-003 | Áp dụng giảm 30% của Nghị quyết 43 vào lương nhân viên | Cao | Mô hình hóa riêng `businessIncomeRelief`; không đưa vào bộ tính payroll lương. |
| R-004 | Gộp BHXH, BHYT và BHTN thành một cờ eligibility | Cao | Ba policy độc lập theo tháng và theo quỹ, mỗi policy có nguồn, ngày hiệu lực và lý do quyết định riêng. |
| R-005 | Hash trích yếu bị hiểu nhầm là hash văn bản pháp luật | Trung bình | Tên trường là `evidence_sha256`; manifest ghi rõ phạm vi hash. Hash PDF ký số là cổng riêng chưa chạy. |
| R-006 | Sao chép sai ánh xạ `S01–S21, S31` từ sổ canonical | Trung bình | Khóa SHA-256 của `.research/2026-09-03-pay-slip-plan-cross-check/sources.json` trong packet và kiểm tra lại trước commit. |
| R-007 | Mặc định mọi địa điểm của doanh nghiệp là Trấn Biên/Vùng I | Cao | Resolver phải nhận `workplaceRegion` hoặc địa điểm cấu hình đã xác minh; không suy từ tên công ty. |
