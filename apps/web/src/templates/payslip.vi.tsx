import type { PayslipViewModel } from '../../../../packages/document-domain/src/payslip-view-model';
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function table(title:string,rows:{label:string;amount:string}[]) {
  return `<table><thead><tr><th>${escape(title)}</th><th class="money">VND</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escape(row.label)}</td><td class="money">${escape(row.amount)}</td></tr>`).join('')}</tbody></table>`;
}
/** Escaped HTML with no links, scripts or untrusted markup. */
export function payslipHtml(v:PayslipViewModel,css:string):string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu lương</title><style>${css}</style></head><body>
  <header><div class="brand">${escape(v.company)}</div><div class="eyebrow">DỮ LIỆU TỔNG HỢP · KHÔNG DÙNG THANH TOÁN</div><h1>PHIẾU LƯƠNG</h1><p class="period">${escape(v.period)}</p></header>
  <section class="identity"><span>Nhân viên</span><h2>${escape(v.employee)}</h2><p>Toàn thời gian · Lương tháng <strong>${escape(v.salary)} VND</strong></p><p>Thời gian được duyệt: ${escape(v.duration)}</p></section>
  ${table('Thu nhập',v.earnings)}<div class="subtotal">Tổng thu nhập <strong>${escape(v.gross)} VND</strong></div>
  ${table('Khấu trừ của nhân viên',v.deductions)}<p class="note">Tổng bảo hiểm nhân viên: ${escape(v.employeeTotal)} VND</p>
  <section class="net"><span>THỰC NHẬN</span><strong>${escape(v.net)} <small>VND</small></strong></section>
  ${table('Doanh nghiệp đóng · không trừ vào thực nhận',v.employer)}<p class="note">Tổng doanh nghiệp đóng: ${escape(v.employerTotal)} VND</p>
  <footer><p>Phiên bản quy tắc: ${escape(v.ruleVersion)} · Phát hành: ${escape(v.issuedAt)}</p><p>Mã phiếu: ${escape(v.payslipId)}</p><p>Thử nghiệm tổng hợp. Quy tắc chưa được xác nhận cho bảng lương thực tế.</p></footer></body></html>`;
}
