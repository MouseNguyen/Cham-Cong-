# Thiết kế đã duyệt — Ứng dụng chấm công, tính lương và phiếu lương The Kay’s Gelato

**Ngày chốt thiết kế:** 04/09/2026  
**Trạng thái kết quả:** thiết kế sản phẩm đã được chủ sở hữu duyệt; chưa triển khai, chưa chạy kiểm thử, chưa sẵn sàng dùng trả lương thật  
**Nguồn đầu vào:** `KE_HOACH_TRIEN_KHAI_CUOI_CUNG_DA_KIEM_CHUNG.md` và gói kiểm chứng `.research/2026-09-03-pay-slip-plan-cross-check/`  
**Đơn vị áp dụng:** một doanh nghiệp duy nhất — The Kay’s Gelato  
**Nơi làm việc ban đầu:** Shophouse 14, Chung cư A6–A7, đường Nguyễn Ái Quốc, P. Trấn Biên, Đồng Nai  

## 1. Kết quả cần đạt

Xây dựng một ứng dụng nội bộ bằng tiếng Việt, chạy trên máy Windows tại nhà của chủ doanh nghiệp, có bốn chức năng nối tiếp nhau:

1. quản lý nhân viên, hợp đồng, mức lương và lịch làm việc;
2. chấm công từ máy Android iPOS tại cửa hàng;
3. tính lương tháng có giải thích đầy đủ từng khoản cộng/trừ;
4. tạo phiếu lương PDF và phát hành riêng cho từng nhân viên qua Gmail, đồng thời hỗ trợ bàn giao Zalo thủ công trong giai đoạn hiện tại.

Sản phẩm phải đồng thời đạt hai phẩm chất:

- **Đơn giản:** người dùng nhìn thấy đúng việc cần làm tiếp theo, không phải hiểu cấu trúc pháp lý hoặc kỹ thuật để vận hành.
- **Cao cấp:** giao diện nhất quán, bình tĩnh, sắc nét, đáng tin cậy và có trạng thái tương tác hoàn chỉnh; không dựa vào hiệu ứng trang trí phô trương.

Đơn giản không có nghĩa là lược bỏ bằng chứng. Chi tiết công thức, nguồn quy tắc, lịch sử duyệt và biên nhận luôn tồn tại, nhưng được mở theo nhu cầu bằng progressive disclosure.

## 2. Thứ tự ưu tiên tài liệu

Khi các tài liệu mâu thuẫn, thứ tự áp dụng là:

1. tài liệu thiết kế này;
2. quyết định đã ghi trong `.research/2026-09-03-pay-slip-plan-cross-check/unknowns.md`;
3. kết luận có nguồn trong `claims.md` và `sources.json`;
4. kế hoạch gốc `KE_HOACH_TRIEN_KHAI_CUOI_CUNG_DA_KIEM_CHUNG.md`.

Các thay đổi đã duyệt so với kế hoạch gốc:

| Nội dung cũ | Thiết kế có hiệu lực |
|---|---|
| Có thể hỗ trợ “casual”, hợp đồng ngắn hạn | MVP chỉ nhận nhân viên toàn thời gian hoặc bán thời gian, dùng hai mẫu hợp đồng 12 tháng đã cung cấp |
| Docker là cách triển khai | MVP Windows-native, không phụ thuộc Docker |
| Object storage là kho PDF | Kho file cục bộ được bảo vệ, kèm metadata và SHA-256 trong PostgreSQL |
| OIDC và nhiều vai trò chung | Hai tài khoản riêng: chủ doanh nghiệp và kế toán; Argon2id + TOTP; quyền được kiểm tra ở backend |
| Ưu tiên signed download link | Gửi PDF đính kèm trực tiếp, có mật khẩu riêng cho từng nhân viên |
| Có thể tự động gửi Zalo | Zalo cá nhân chỉ bàn giao thủ công; tự động hóa chỉ được thêm sau bằng Zalo OA/OpenAPI chính thức |
| Chấm công là bảng nhập liệu | Chấm công trực tiếp qua tab trình duyệt trên thiết bị iPOS, sau đó duyệt ngoại lệ |

## 3. Phạm vi MVP

### 3.1. Bao gồm

- Một doanh nghiệp và một nơi làm việc ban đầu.
- Nhân viên Việt Nam, cư trú thuế, toàn thời gian hoặc bán thời gian.
- Hai mẫu hợp đồng xác định thời hạn 12 tháng; sáu ngày thử việc nằm trong cùng hợp đồng và không làm thay đổi mức lương.
- Lương gross bằng VND:
  - toàn thời gian: lương tháng nhập khi tạo nhân viên, hiện khoảng 7–8 triệu đồng;
  - bán thời gian: đơn giá giờ nhập khi tạo nhân viên, hiện 26.000 đồng/giờ.
- Chu kỳ lương theo tháng dương lịch.
- Lịch làm việc tuần tái sử dụng, ngoại lệ theo ngày và ngày lễ.
- Chấm công, phân loại ngoại lệ, duyệt bảng công và đóng băng snapshot tháng.
- Lương thường, làm việc ngày lễ ban ngày, bảo hiểm bắt buộc theo từng quỹ và PIT tiền lương cá nhân cư trú.
- Phiếu lương A4 tiếng Việt, xem trước, tải xuống, in và gửi email riêng.
- Maker-checker giữa kế toán và chủ doanh nghiệp.
- Sao lưu mã hóa vào `G:\PaySlip-Backups`.

### 3.2. Ngoài phạm vi và phải chặn

- Người nước ngoài, cá nhân không cư trú, nhà cung cấp dịch vụ độc lập hoặc quan hệ lao động chưa xác định.
- Hợp đồng khác hai mẫu đã duyệt, hợp đồng dưới ba tháng hoặc thử việc bằng hợp đồng riêng.
- Lương net/gross-up, nhiều nơi làm việc, nhiều doanh nghiệp hoặc nhiều hợp đồng cần xác định nơi đóng chính.
- Làm việc trong khung 22:00–06:00 và công thức làm đêm nâng cao.
- Quy trình xin nghỉ, đổi ca, nộp hồ sơ thuế/bảo hiểm, xuất kế toán, file ngân hàng hoặc chuyển tiền.
- Tự động hóa Zalo cá nhân.
- Quyết toán PIT năm.

Mọi trường hợp ngoài phạm vi hiển thị lý do, dữ liệu còn thiếu và hành động tiếp theo; hệ thống không được cho chốt bảng lương.

## 4. Sự thật pháp lý và giới hạn bằng chứng

Thiết kế sử dụng các kết luận đã được kiểm chứng đến ngày 04/09/2026 trong gói nghiên cứu:

- Trấn Biên thuộc Vùng I từ 01/01/2026: mức tối thiểu 5.310.000 đồng/tháng và 25.500 đồng/giờ (`S12`, `S31`).
- Bán thời gian không mặc nhiên được miễn bảo hiểm; điều kiện phải được đánh giá theo từng quỹ và từng tháng (`S05`–`S11`).
- PIT tiền lương cư trú năm 2026 dùng biểu lũy tiến 5 bậc và mức giảm trừ hiệu lực của kỳ thuế (`S13`, `S14`).
- Ưu đãi giảm 30% tại Nghị quyết 43/2026/QH16 chỉ dành cho thu nhập kinh doanh đủ điều kiện, không áp dụng chung cho tiền lương nhân viên (`S17`).
- Tiền lương ngày lễ được hưởng và phần làm thêm ngày lễ ban ngày tối thiểu 300% là hai cấu phần riêng; không mã hóa một phép nhân 400% dùng cho mọi hình thức lương (`S03`, `S04`).
- Mỗi lần trả lương phải cung cấp bảng kê thể hiện lương, làm thêm/làm đêm và các khoản khấu trừ (`S01`, `S02`).

Đây là căn cứ thiết kế, không phải ý kiến pháp lý cuối cùng. Trước khi trả lương thật, một chuyên gia độc lập có năng lực về lao động và thuế lương Việt Nam phải ký ma trận quy tắc, phiên bản nguồn và bộ ca vàng; kế toán phải xác nhận kết quả ca tính.

## 5. Kiến trúc hệ thống

### 5.1. Kiểu kiến trúc

Một modular monolith Windows-native:

- giao diện web và API nội bộ: Next.js + TypeScript;
- cơ sở dữ liệu: PostgreSQL;
- truy cập dữ liệu và migration: Prisma hoặc lớp tương đương, được chốt khi scaffold;
- `payroll-domain`: gói TypeScript thuần, tất định, không gọi mạng, cơ sở dữ liệu, PDF hoặc kênh gửi;
- worker: lấy việc từ PostgreSQL outbox để tạo PDF, gửi email và chạy backup;
- kho tài liệu: file cục bộ được bảo vệ; PostgreSQL lưu metadata, liên kết và SHA-256;
- cổng chấm công: dịch vụ/route riêng có quyền tối thiểu, là bề mặt duy nhất được đưa qua Cloudflare Tunnel;
- không dùng Redis, Docker, Kubernetes hoặc cloud object storage trong MVP.

Phiên bản Node.js, Next.js, PostgreSQL, Prisma, thư viện PDF và wrapper dịch vụ Windows phải được kiểm tra theo tài liệu chính thức và khóa phiên bản ở thời điểm scaffold; tài liệu này không đóng đinh một phiên bản tương lai chưa được xác minh.

### 5.2. Biên mạng và cổng dự kiến

| Thành phần | Bind/cổng dự kiến | Quyền truy cập |
|---|---|---|
| PostgreSQL | loopback, khoảng `55432` | chỉ tiến trình ứng dụng/backup |
| Admin web/API | `127.0.0.1:46217` | chủ doanh nghiệp và kế toán qua kênh riêng đã xác thực |
| Attendance ingress | `127.0.0.1:46218` | Cloudflare Tunnel chuyển tiếp riêng route chấm công |
| Worker | không mở cổng | đọc outbox và tài nguyên nội bộ |

Không mở port trên router. Quick Tunnel chỉ dành cho dev/pilot; sử dụng thật cần named tunnel, domain do chủ sở hữu kiểm soát, policy truy cập, rate limit, nhật ký và kiểm thử bảo mật. Giao diện quản trị và PostgreSQL không đi qua URL chấm công.

Mỗi launcher phải sở hữu chính xác PID/process tree của mình, kiểm tra cổng trước khi chạy, chỉ báo sẵn sàng sau health check, và chứng minh đã dừng listener khi tắt. Không được kill tiến trình không thuộc ứng dụng chỉ vì trùng cổng.

### 5.3. Ranh giới mô-đun

1. `identity-access`: đăng nhập, TOTP, phiên, quyền, khóa tạm thời.
2. `people-contracts`: nhân viên, hợp đồng, nơi làm việc, mức lương có hiệu lực.
3. `scheduling`: giờ mở cửa, lịch tuần, ngoại lệ ngày/ngày lễ.
4. `attendance`: kiosk, raw events, bất thường, điều chỉnh, snapshot.
5. `legal-rules`: rule packs có phiên bản, nguồn, hash và phê duyệt.
6. `payroll-domain`: hàm tính thuần và trace.
7. `pay-runs`: draft, review, approve, finalize, adjustment.
8. `payslips`: render, mã hóa, lưu file, hash.
9. `delivery`: outbox, Gmail, Zalo manual/OA adapter, receipts.
10. `audit-retention`: audit append-only, retention, legal hold.
11. `operations`: health, backup, restore, alert và service lifecycle.

Các mô-đun gọi nhau qua service contracts. Giao diện, page tool và agent không được gọi thẳng SQL hoặc tạo đường tắt bỏ qua kiểm tra quyền/audit.

## 6. Dòng dữ liệu đầu cuối

```text
Lịch có hiệu lực + sự kiện chấm công thô
  -> phát hiện ngoại lệ
  -> kế toán đề xuất phân loại/điều chỉnh
  -> chủ doanh nghiệp duyệt
  -> snapshot bảng công tháng bất biến + hash
  -> payroll-domain + compensation term + legal rule pack
  -> bảng lương nháp có trace
  -> kế toán kiểm tra
  -> chủ doanh nghiệp duyệt và finalize
  -> PDF nhân viên được tạo, mã hóa và hash
  -> owner xem trước người nhận/tệp/kỳ/hash
  -> Gmail hoặc Zalo manual
  -> biên nhận append-only
```

Không mô-đun sau nào được sửa dữ liệu nguồn đã chốt của mô-đun trước. Corrections tạo bản ghi/snapshot/pay run điều chỉnh mới và liên kết với bản gốc.

## 7. Mô hình dữ liệu và bất biến

### 7.1. Nhóm dữ liệu

- Doanh nghiệp/nơi làm việc: `organizations`, `workplaces`, `opening_hour_versions`, `public_holidays`.
- Nhân sự/hợp đồng: `employees`, `employment_contracts`, `compensation_terms`, `delivery_destinations`.
- Lịch/chấm công: `schedule_templates`, `schedule_assignments`, `clock_events`, `attendance_exceptions`, `attendance_adjustments`, `attendance_snapshots`.
- Quy tắc: `legal_rule_packs`, `rule_sources`, `minimum_wages`, `insurance_policies`, `pit_policies`, `earning_component_policies`.
- Lương: `pay_runs`, `pay_run_employees`, `calculation_lines`, `approval_events`, `adjustment_links`.
- Phiếu/gửi: `payslips`, `document_artifacts`, `delivery_drafts`, `outbox_jobs`, `delivery_attempts`.
- Hệ thống: `users`, `mfa_factors`, `sessions`, `audit_events`, `retention_actions`, `backup_runs`.

### 7.2. Bất biến bắt buộc

- Các khoảng hiệu lực của cùng loại dữ liệu không chồng nhau.
- Tất cả thời điểm được lưu UTC và hiển thị/diễn giải theo `Asia/Ho_Chi_Minh`.
- Tiền được tính bằng decimal chính xác; VND lưu integer sau điểm làm tròn có tên. Không dùng binary floating point.
- Clock event thô không chỉnh sửa/xóa; điều chỉnh là bản ghi riêng có lý do và phê duyệt.
- Snapshot bảng công đã duyệt, rule pack đã phát hành, pay run finalized và PDF đã phát hành đều bất biến và có hash.
- Pay run lưu ID/hash của snapshot, compensation term và rule pack đã dùng.
- Nhân viên nghỉ việc được chuyển trạng thái, không xóa lịch sử lương.
- Email thay đổi theo hiệu lực; mọi draft gửi đang chờ bị vô hiệu nếu địa chỉ thay đổi.
- Không được coi provider accepted là delivered nếu nhà cung cấp không cung cấp bằng chứng giao cuối.

## 8. Lịch làm việc và chấm công

### 8.1. Lịch cơ sở

- Thứ Hai: đóng cửa.
- Thứ Ba–Thứ Sáu hiện tại: 15:00–21:00; có thể đổi có hiệu lực thành 11:00–21:00.
- Thứ Bảy–Chủ Nhật: 11:00–21:00.

Giờ mở cửa và lịch nhân viên là ngữ cảnh để phát hiện bất thường, không phải bằng chứng đã làm việc. Các khoảng nghỉ đều được trả lương, không chấm bắt đầu/kết thúc nghỉ và không tự động trừ phút nghỉ.

### 8.2. Kiosk iPOS

Luồng chính sau khi trang đã tải:

1. nhập mã nhân viên;
2. nhập PIN sáu chữ số;
3. chọn **Vào ca** hoặc **Tan ca**.

PIN chỉ lưu dạng Argon2id hash. Server chỉ trả thành công sau khi đã ghi bền vững event kèm idempotency key. Chỉ lỗi được server xác nhận chưa commit mới hiển thị **Chưa ghi nhận chấm công**. Timeout/mất phản hồi hiển thị **Chưa xác nhận được — đang kiểm tra**, giữ nguyên key và tra cứu/retry có xác thực cùng key để tìm event đã commit; không tạo key mới hoặc khẳng định chưa ghi nhận khi trạng thái còn unknown. Kiosk không được đọc lương, danh sách nhân viên đầy đủ, PDF hoặc dữ liệu quản trị.

Owner enroll thiết bị với shop binding và quyền chỉ chấm công, có xoay/revoke session riêng; PIN nhân viên không thay cho danh tính thiết bị. Public ingress là entrypoint riêng `apps/attendance-ingress/src/server.ts` ở loopback 46218, deny-by-default route allowlist (clock command, reconciliation và health tối thiểu). Kiosk static assets được serve từ allowlist đó. Tunnel chỉ trỏ entrypoint này, không trỏ Next admin. Luật ghi event dùng cùng attendance service; integration tests phải chứng minh public host không trả admin, PDF, payroll hoặc arbitrary proxy path.

Raw timestamp được giữ nguyên, không tự làm tròn. Thiếu punch, trùng, thứ tự bất khả thi, overlap, ngoài lịch, ngày lễ và 22:00–06:00 đều tạo ngoại lệ. Kế toán đề xuất cách xử lý; chủ doanh nghiệp duyệt. Ngoại lệ chưa xử lý chặn snapshot tháng.

Đối với nhân viên toàn thời gian, chênh lệch attendance không tự động giảm lương tháng. Đối với bán thời gian, payroll chỉ dùng khoảng thời gian đã được duyệt là payable.

### 8.3. Luồng điện thoại tùy chọn sau MVP lõi

QR xoay vòng chỉ là challenge ngắn hạn, không phải kết nối mạng hoặc bằng chứng hiện diện đầy đủ. QR không chứa PII, lương, địa chỉ server hoặc bearer secret dùng lại. Người dùng vẫn cần code/PIN hoặc phiên thiết bị đã được chủ doanh nghiệp phê duyệt; mỗi phiên có thể thu hồi riêng. Không dùng GPS, ảnh, khuôn mặt hoặc device fingerprinting xâm lấn.

## 9. Payroll-domain và luật tính

### 9.1. Hợp đồng hàm tính

Với cùng `PayInput`, `AttendanceSnapshot`, `CompensationTerm`, `LegalRulePack` và calculator version, engine phải trả cùng `PayResult` và cùng calculation trace. Không được đọc ngày hệ thống, môi trường, mạng hoặc cơ sở dữ liệu bên trong phép tính.

`docs/planning/payroll-decision-matrix.md` là ma trận bắt buộc cho rounding, độ chính xác thời gian, effective dates theo component, tax/fund/overtime bases, divisor ngày lễ và adjustments. Raw timestamp giữ milliseconds; payable duration dùng số nguyên milliseconds và phép chia chính xác, không cắt giây qua helper integer Minutes. Synthetic assumptions có nhãn riêng; thiếu quyết định có chữ ký thì chặn trường hợp production tương ứng.

Rule release phải tái tính SHA-256 trên canonical content gồm identity/version, applicability, sources, rules, rounding và blockers; nguồn phải verified/có hash, references phải hợp lệ, hai chữ ký phải khớp nội dung và blockers phải rỗng. Metadata verified/chữ ký trong JSON không tự chứng minh nguồn thật hay danh tính người ký: trusted import/approval service phải xác thực các bằng chứng đó. Released object phải deep-immutable và detached khỏi draft.

Mỗi calculation line chứa:

- mã cấu phần và nhãn tiếng Việt;
- công thức và toán hạng;
- số tiền trước/sau làm tròn;
- quy tắc làm tròn;
- rule/source ID và phiên bản;
- lý do áp dụng hoặc không áp dụng.

### 9.2. Toàn thời gian

Lương thường bắt đầu từ gross monthly salary có hiệu lực. Không tự động khấu trừ do thiếu giờ/chênh lệch attendance. Mọi nghỉ không lương, giữa tháng hoặc điều chỉnh làm giảm lương chỉ được triển khai sau khi ma trận nghiệp vụ tương ứng được ký; nếu chưa có thì fail closed.

### 9.3. Bán thời gian

Lương thường bằng payable duration đã duyệt nhân với gross hourly rate có hiệu lực. Mức 26.000 đồng là dữ liệu hiện tại, không phải default cố định. Engine chặn rate dưới mức tối thiểu có hiệu lực và phải có ca biên 25.499/25.500/26.000 đồng cho năm 2026.

### 9.4. Bảo hiểm

Không dùng một phép nhân tổng 10,5%/21,5%. Mỗi quỹ có eligibility, base, minimum, cap, rate, effective date và trace riêng. Bán thời gian được đánh giá lại theo từng tháng; không có luật `part_time = exempt`. Các ngưỡng/trần sau 01/07/2026 phải là phiên bản quy tắc, không hard-code vào UI.

### 9.5. PIT

MVP chỉ hỗ trợ cá nhân cư trú dùng hợp đồng 12 tháng đã duyệt và khấu trừ lũy tiến theo kỳ thuế. Engine dùng biểu 5 bậc và giảm trừ có hiệu lực. Nghị quyết 43/2026/QH16 không tham gia phép tính tiền lương vì giảm 30% chỉ liên quan thu nhập kinh doanh đủ điều kiện. Quyết toán năm và lane khấu trừ 10% cho hợp đồng ngắn hạn nằm ngoài phạm vi.

### 9.6. Ngày lễ

Hệ thống lưu riêng:

- quyền hưởng lương ngày lễ;
- thời lượng thực tế đã làm và được duyệt;
- phần làm thêm ngày lễ ban ngày tối thiểu 300%;
- cách thể hiện phần 100% đã nằm trong lương tháng hoặc phải trả riêng theo hình thức lương.

Không có công thức chung `giờ × 400%` áp dụng cho mọi người. Bất kỳ đoạn 22:00–06:00 nào đều bị chặn và chuyển chuyên viên cho đến khi module làm đêm được phê duyệt.

## 10. Pay run, phê duyệt và điều chỉnh

```text
DRAFT -> CALCULATED -> REVIEW_PENDING -> APPROVED -> FINALIZED
Document status: PENDING -> GENERATING -> GENERATED | FAILED
Dispatch summary: NOT_STARTED | IN_PROGRESS | ACTION_REQUIRED | DISPATCH_RECORDED
```

- Kế toán tạo/chỉnh draft, xử lý ngoại lệ, tính và gửi review.
- Chủ doanh nghiệp duyệt attendance snapshot, duyệt pay run, finalize và phát hành.
- Backend kiểm quyền ở từng command; ẩn nút trên UI không phải bằng chứng phân quyền.
- `FINALIZED` không thể mở lại. Sửa bằng adjustment run chỉ rõ nguồn, lý do và người duyệt.
- Mọi transition có expected version để chống double click/race và tạo audit event.
- Finalize lưu frozen inputs, calculatorVersion/artifactHash, canonicalizationVersion và result schema version. Lưu archive calculator tương ứng để replay lịch sử; rule/salary version một mình không đủ.
- Finalized state, input/result hashes, audit và outbox intent được insert trong cùng transaction. PDF/provider chỉ chạy sau commit; unique event key và retry idempotent xử lý crash/restart.
- Dispatch summary được tính từ từng receipt, không sửa payroll lifecycle. Gmail `ProviderAccepted` chỉ là provider nhận yêu cầu; Zalo `operator_confirmed_manual` là xác nhận của người gửi. `DISPATCH_RECORDED` chỉ có nghĩa mọi phiếu đã có receipt theo kênh được chọn; không có nghĩa nhân viên đã nhận/đọc. Unknown/retry/dead-letter phải tiếp tục hiện riêng.

## 11. Phiếu lương và gửi

### 11.1. PDF

PDF A4 tiếng Việt hiển thị tối thiểu:

- doanh nghiệp, nhân viên, kỳ lương và mã phiếu;
- hình thức lương/mức áp dụng, thời lượng được duyệt;
- từng khoản thu nhập;
- BHXH, BHYT, BHTN, PIT và khấu trừ hợp lệ;
- net pay;
- đóng góp doanh nghiệp ở khu vực riêng, không trừ vào nhân viên;
- rule pack/version và dấu thời gian phát hành.

Không đưa CCCD, tài khoản ngân hàng, mã BHXH đầy đủ hoặc dữ liệu không cần thiết. Font tiếng Việt phải được self-host/embed. Mỗi PDF có mật khẩu ngẫu nhiên riêng cho nhân viên; không dùng ngày sinh/CCCD. Mật khẩu được bảo vệ bằng Windows-backed encryption và gửi qua kênh tách biệt.

### 11.2. Gmail

- Dùng Gmail API OAuth 2.0 với scope nhỏ nhất cần để gửi; không lưu mật khẩu Gmail.
- Trước release phải bật 2-Step Verification, chứng minh cấp quyền, gửi, thu hồi và xử lý lỗi bằng tài khoản thật trong một lượt thử có giới hạn.
- Một email chỉ có một người nhận; cấm CC/BCC.
- Subject/body không chứa lương hoặc định danh nhạy cảm.
- Delivery draft khóa theo payslip ID, employee ID, email đã xác minh, kỳ lương và PDF hash.
- Chủ doanh nghiệp phải xem trước đúng người/đúng tệp/đúng kỳ/hash và re-authenticate trước release.
- Mỗi attempt có idempotency key, attachment metadata/hash và provider/local receipt bất biến.

### 11.3. Zalo

Hiện tại, ứng dụng chỉ hỗ trợ **manual handoff**: chỉ rõ nhân viên/kỳ/tệp, cung cấp tin nhắn trung tính để copy và cho người có quyền mở đúng thư mục tệp. Người vận hành tự gửi bằng Zalo cá nhân và xác nhận thủ công. Trạng thái là `operator_confirmed_manual`, không phải `delivered`.

Sau này có thể đổi cấu hình sang `zalo_oa` thông qua adapter chính thức, nhưng chỉ sau khi chứng minh quyền gửi, consent/recipient binding, hỗ trợ file/size, quota/chi phí, tiếng Việt, idempotency và receipt. Việc đổi adapter không sửa phiếu lương hoặc lịch sử cũ.

## 12. Bảo mật, quyền riêng tư và lưu giữ

- Hai tài khoản riêng: `accountant` và `owner`; không dùng tài khoản chung.
- Mật khẩu user và PIN kiosk dùng Argon2id với tham số có benchmark; TOTP cho hai tài khoản quản trị.
- Cookie `HttpOnly`, `Secure`, `SameSite` phù hợp; session rotation, CSRF protection, rate limit và lockout có audit.
- Kiosk chỉ có command chấm công và phản hồi tối thiểu.
- Secret không nằm trong source, database nghiệp vụ, log hoặc backup không mã hóa.
- Log kỹ thuật redaction mặc định; audit event lưu ai/làm gì/khi nào/đối tượng/kết quả nhưng không lưu secret.
- Retention theo loại hồ sơ, có legal hold, yêu cầu truy cập/chỉnh sửa/xóa và vendor/subprocessor register.
- Mọi bề mặt Internet và cơ chế auth cần security review trước dùng thật.

## 13. Sao lưu và vận hành Windows

### 13.1. Backup

Chỉ ghi dưới `G:\PaySlip-Backups`; refuse mọi path escape và không đọc/tổ chức lại các thư mục khác trên `G:`. Mỗi backup set gồm:

- PostgreSQL logical dump;
- PDF/document metadata và tệp tương ứng;
- legal rule packs, audit và cấu hình không chứa secret;
- manifest có SHA-256 và phiên bản schema.

Backup dùng authenticated encryption độc lập. Recovery secret không nằm trên PC, ổ `G:`, source, log, database hoặc backup; có bản giấy niêm phong cất riêng. Lịch dự kiến: ngay sau finalize và hằng đêm 02:00; giữ 14 bản ngày, 8 bản tuần, 12 bản tháng. Cảnh báo khi mất ổ, thiếu dung lượng, hash sai hoặc quá hạn.

DPAPI CurrentUser chỉ bảo vệ secret của service identity trên máy hiện tại; age-encrypt một bản sao DPAPI ciphertext không làm nó portable. Backup recovery phải có gói age-encrypted riêng chứa các PDF password cần khôi phục, chỉ xuất qua memory/pipe đã kiểm redaction; không tạo plaintext trên disk. Sau recovery, rewrap dưới identity mới. OAuth yêu cầu cấp quyền lại và TOTP yêu cầu owner recovery/re-enrollment qua recovery procedure đã ký; không tự bypass MFA. Recovery manifest nêu rõ từng secret class là portable hay re-enrollment_required.

Restore luôn vào thư mục/database tạm trước, kiểm schema/count/hash và mở một bộ dữ liệu tổng hợp; không restore đè production trong drill. Bắt buộc thêm drill dưới Windows profile/máy thay thế không truy cập DPAPI master key cũ: giải mã một PDF cũ bằng recovery package, tái lập owner access đúng procedure, chứng minh OAuth bị vô hiệu cho đến khi cấp lại và không có plaintext secret tồn dư. Same-profile restore không thay cho bằng chứng này. Mục tiêu RPO dưới 24 giờ, với backup bổ sung ngay sau finalize. Ổ `G:` không bảo vệ khỏi trộm/cháy/ransomware toàn máy; offsite encrypted backup là gap tương lai phải tiếp tục hiển thị.

### 13.2. Health và sự cố

- Health riêng cho database, admin, attendance, worker/outbox và backup freshness.
- Auto-start có thứ tự; retry hữu hạn; không vòng lặp restart vô hạn.
- Incident runbook cho mất mạng, tunnel hỏng, DB lỗi, worker lỗi, Gmail lỗi, mất ổ backup và nghi ngờ lộ dữ liệu.
- Chấm công online-only: outage không tạo thành công giả; correction sau đó đi qua maker-checker.

## 14. Hợp đồng UX “đơn giản nhưng cao cấp”

### 14.1. Nguyên tắc

- Vietnamese-first; câu ngắn, động từ rõ, tránh thuật ngữ kỹ thuật ở lớp đầu.
- Một primary action trên mỗi màn hình/trạng thái; action nguy hiểm tách biệt và có xác nhận.
- Progressive disclosure: tóm tắt trước, “Xem cách tính” và “Xem nguồn quy tắc” khi cần.
- Status luôn trả lời ba câu: đang ở đâu, có vấn đề gì, phải làm gì tiếp.
- Không dashboard rối hoặc biểu đồ trang trí; ưu tiên danh sách việc cần xử lý và số liệu phục vụ quyết định.
- Desktop tối ưu cho owner/accountant; kiosk tối ưu touch; các màn hình chính vẫn responsive trên tablet.

### 14.2. Hướng thị giác

- Cảm giác: ấm, điềm tĩnh, thủ công cao cấp và đáng tin cậy; liên hệ nhẹ với gelato nhưng không biến ứng dụng nghiệp vụ thành menu cửa hàng.
- Nền vanilla/cream rất nhạt; chữ ink/cocoa đậm; một accent pistachio cho hành động an toàn; berry chỉ dùng cho lỗi/cảnh báo quan trọng.
- Không neon, glassmorphism, gradient cầu vồng hoặc bóng đổ nặng.
- Font tiếng Việt self-host: ưu tiên `Be Vietnam Pro` nếu license/bundle được kiểm chứng, kèm system sans fallback.
- Grid 8 px; khoảng trắng rộng; card radius 12–16 px; border tinh; shadow rất nhẹ.
- Số tiền dùng tabular numerals, căn phải, phân cấp gross/deductions/net rõ ràng.
- Motion 120–200 ms cho phản hồi nhỏ; tôn trọng `prefers-reduced-motion`; không animation cản tác vụ.

Các token và component cụ thể phải được khóa trong `.superdesign/design-system.md` ở UI design wave. Superdesign canvas chưa được tạo trong giai đoạn tài liệu này vì CLI/network/generation credit là cổng thực thi riêng.

### 14.3. Màn hình chính

1. Đăng nhập/TOTP.
2. Dashboard “Việc cần làm hôm nay”.
3. Nhân viên và wizard thêm nhân viên.
4. Lịch tuần/ngoại lệ ngày lễ.
5. Kiosk Vào ca/Tan ca.
6. Bảng ngoại lệ chấm công và màn hình duyệt.
7. Wizard kỳ lương tháng.
8. Chi tiết cách tính theo nhân viên.
9. Duyệt/finalize kỳ lương.
10. Xem trước phiếu và phát hành email/Zalo manual.
11. Audit, backup/restore status và cấu hình.

### 14.4. Tiêu chí nghiệm thu UX

- Kiosk hoàn tất một punch trong tối đa ba tương tác sau khi trang sẵn sàng: code, PIN, action; target chạm tối thiểu 44×44 CSS px.
- Wizard thêm nhân viên chỉ hỏi dữ liệu cần cho lựa chọn đang hiển thị; chọn full-time chỉ hiện lương tháng, part-time chỉ hiện đơn giá giờ.
- Một kỳ lương sạch đi qua tối đa năm bước chính: chọn kỳ, kiểm bảng công, tính, duyệt, phát hành.
- Mọi blocker có nguyên nhân, dữ liệu liên quan và một next action; không có dead end.
- Mọi số net có đường đi đến gross-to-net trace trong một hành động.
- Owner không thể phát hành nếu chưa thấy recipient, pay period, employee, filename và hash binding.
- WCAG 2.2 AA cho contrast, focus, keyboard và lỗi biểu mẫu; kiosk kiểm tra ở viewport/trình duyệt iPOS thật.
- Không horizontal scroll ở các viewport đã chốt; số tiền không bị cắt; PDF preview và dữ liệu màn hình khớp.
- Visual-regression baseline cho các trạng thái mặc định, loading, empty, warning, error, blocked và success.
- Hai người dùng thật (owner và accountant) hoàn thành ca nhiệm vụ chính mà không cần giải thích kỹ thuật; mọi điểm vấp được ghi và sửa trước pilot.

## 15. Giao diện sẵn sàng cho Codex/Hermes

Ứng dụng nên có registry page tools nội bộ, không phụ thuộc WebMCP:

### 15.1. Read-only trước

- `getCurrentPayrollStatus`
- `listAttendanceExceptions`
- `explainCalculation`
- `showRuleSources`
- `comparePayRun`
- `showDeliveryReceipt`
- `showBackupHealth`

### 15.2. Draft/preview

- `draftAttendanceClassification`
- `previewPayRunSubmission`
- `previewPayslipRelease`

### 15.3. Command có xác nhận

- `approveAttendanceSnapshot`
- `finalizePayRun`
- `releasePayslips`

Mỗi tool khai báo JSON schema, output schema, risk, `readOnlyHint`, `requiresConfirmation` và `enabledWhen`. Tool gọi cùng application service như UI và tạo audit event; không có hidden side effect. Tool chỉ được register khi trạng thái và quyền hiện tại cho phép, và phải unregister khi route/session/state đổi. Evals gồm happy path, sai argument, thiếu scope, cố gọi mutating action không có xác nhận và prompt chỉ đọc nhưng tool định mutate.

## 16. Hợp đồng thực thi Codex/Hermes

### 16.1. Nguyên tắc

- Một kế hoạch chuẩn và các task ID ổn định; Codex và Hermes không tự tạo một kiến trúc song song. `docs/planning/task-status.json` giữ trạng thái hiện tại; `docs/planning/codex-delegation.md` quy định Codex parent, implementation worker và reviewer; Hermes được hoãn theo quyết định của Duke.
- Codex parent giao packet đã duyệt trực tiếp cho native subagent; một người ghi file và reviewer độc lập khi cần. Subagent không tự delegate. Codex giữ phê duyệt, shared-file integration, verification và commit.
- Mỗi task chỉ có một owner ghi file tại một thời điểm; task song song phải có file ownership tách rời.
- Codex là integrator/reviewer cuối: đọc artifact, kiểm diff/phạm vi và chạy lại focused verification quan trọng.
- Agent không được dùng kết quả lint/static để tuyên bố runtime hoặc production pass.
- Mọi install, build, test, server, browser, tunnel, credential, Gmail thật, backup thật hoặc production data vẫn cần đúng cổng phê duyệt của execution wave.

### 16.2. Task packet bắt buộc

```yaml
contract_kind: task_runtime
task_id: PAY-<wave>-<number>
agent_id: codex|hermes-<id>
goal: one observable outcome
status: planned|running|done|failed|blocked|aborted
prerequisites: []
inputs: []
owned_files: []
read_only_files: []
excluded_scope: []
allowed_actions: []
approval_gates: []
expected_artifacts: []
must_pass_verification: []
stop_conditions: []
coverage_proof: []
execution_envelope:
  protocol: F:\Codex\.agent\protocols\universal-fast-core.md
  defaults: F:\Codex\.agent\runtime\execution-profile.defaults.json
  profile_policy: fast_core unless task risk requires stricter
  core_before_polish: true
handoff:
  required_fields:
    - agent_id
    - task_id
    - status
    - summary
    - evidence
    - files_read
    - files_modified
    - verification
    - blocker
    - next_action
```

### 16.3. Quy tắc nhận bàn giao

Codex chỉ nhận task khi:

1. các file đã thay đổi nằm trong ownership;
2. artifact và test receipt tồn tại, không chỉ có mô tả;
3. focused tests pass ở layer được tuyên bố;
4. các blocker/skip được liệt kê chính xác;
5. task không làm yếu auth, audit, legal trace hoặc data immutability;
6. phần core chạy được trước khi nhận optional polish.

Nếu thiếu một điều kiện, status là `blocked` hoặc `failed`, không phải `done`. Sau hai thất bại cùng evidence layer hoặc một lần không tạo evidence delta, dừng attempt family và nghiên cứu nguyên nhân trước khi thử lại; chỉ cho phép một fallback kiến trúc có khả năng loại bỏ đúng failure class.

## 17. Chiến lược kiểm thử

1. **Pure unit/golden/property:** payroll-domain, decimal/rounding, PIT boundaries, từng quỹ, holiday formulas, determinism.
2. **Rule boundary:** trước/sau effective dates; dưới/bằng/trên minimum/cap; part-time threshold theo từng tháng.
3. **Database/invariant:** non-overlap, append-only, hash binding, optimistic concurrency, adjustment links.
4. **Attendance:** idempotency, duplicate/concurrent punches, outage, impossible sequence, paid breaks, public holidays, snapshot blockers.
5. **Authorization:** matrix owner/accountant/kiosk, direct API negative tests, session/TOTP/CSRF/rate limit.
6. **PDF:** nội dung, Unicode/font, một/nhiều trang, encryption, employee/pay-run/hash binding và visual snapshots.
7. **Delivery:** fake outbox đầy đủ, retries/idempotency/recipient isolation; một lượt Gmail thật tổng hợp có giới hạn ở release gate.
8. **Backup/restore:** path confinement, encryption, manifest/hash, retention, restore tạm, negative secret tests.
9. **Real device:** trình duyệt iPOS, touch, tab lifecycle, network failure và responsive states.
10. **UX/accessibility:** keyboard, screen semantics, contrast, focus, error recovery, step counts, visual regression.
11. **Parallel payroll:** hai kỳ song song với bảng do kế toán tính độc lập; mọi variance phải về 0 hoặc có signed explanation.

## 18. GO/NO-GO

### GO để bắt đầu implementation

- tài liệu thiết kế này và kế hoạch TDD được duyệt;
- execution wave ghi rõ hành động gated nào được phép;
- task packet chỉ định owner và file ownership;
- không dùng production data trong giai đoạn đầu.

### NO-GO để trả lương thật nếu còn bất kỳ mục nào

- rule matrix, nguồn và golden cases chưa có chữ ký của kế toán và chuyên gia ngoài;
- còn attendance exception hoặc case ngoài phạm vi nhưng pay run vẫn có thể finalize;
- một lớp test bắt buộc fail/skip không có lý do được duyệt;
- Gmail 2SV/OAuth/scope/send/revoke/secret storage chưa được chứng minh;
- named Cloudflare Tunnel, domain, chính sách và kiểm thử bảo mật chưa pass;
- kiosk iPOS thật chưa pass;
- PDF encryption, recipient isolation hoặc owner preview/re-auth chưa pass;
- backup/restore vào temp và replacement-profile recovery chưa pass hoặc recovery secret chưa được cất tách biệt;
- hai kỳ chạy song song còn variance chưa giải thích/ký;
- incident runbook chưa hoàn chỉnh;
- còn lỗi WCAG/UX làm người dùng có thể chấm công, duyệt hoặc gửi nhầm.

## 19. Evidence ledger ban đầu — historical 2026-09-04

Bảng dưới giữ nguyên trạng thái tại lúc viết thiết kế, không phải trạng thái checkout hiện nay. Xem `docs/planning/task-status.json`: W0 và W1-01 có accepted receipts; W1-02 chỉ có draft rules. PAY-REVIEW-01 bổ sung regression evidence cho release boundary. Chưa có calculator/end-to-end app hay production proof.

| Lớp bằng chứng | Trạng thái |
|---|---|
| Nguồn chính thức và kiểm chứng kế hoạch | `passed` ở mức nghiên cứu |
| Quyết định sản phẩm/kiến trúc/UX | `passed` ở mức thiết kế |
| Hợp đồng lao động — text extraction | `passed` |
| Hợp đồng lao động — visual rendering | `blocked_no_local_docx_renderer` |
| Chữ ký chuyên gia pháp lý/payroll | `not_run` |
| Kế hoạch implementation TDD | `passed_static_review` — đã viết và tự kiểm tra; chưa thực thi |
| Code/build/test/runtime | `not_run` |
| Gmail/iPOS/tunnel/backup real integration | `not_run` |
| Production readiness | `not_run` |

## 20. Quyết định cuối

Thiết kế được chốt theo hướng **một sản phẩm nội bộ hẹp nhưng hoàn chỉnh**, ưu tiên một vertical slice chạy thật trước: một nhân viên toàn thời gian, một snapshot chấm công sạch, một trường hợp ngày lễ, bảo hiểm, PIT, gross-to-net trace, một PDF mã hóa và một delivery draft giả lập. Sau khi lát cắt này pass, mở rộng bán thời gian và toàn bộ ma trận ca biên đã ký.

UI simple-premium và khả năng giao task cho Codex/Hermes là điều kiện nghiệm thu xuyên suốt, không phải hạng mục trang trí cuối dự án.

## 21. Performance acceptance

Dùng workload/target trong `docs/planning/payroll-decision-matrix.md`. Mọi số latency là mục tiêu chưa đo. Chốt correctness trước: immutable-key caching, batched reads và async PDF/provider work; chỉ tối ưu theo profiler ở đúng máy/dataset đã ghi nhận.
