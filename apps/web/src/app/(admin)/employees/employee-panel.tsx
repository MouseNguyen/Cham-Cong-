'use client';

import { useEffect, useState } from 'react';
import Button from '../../../components/Button';
import DataTable from '../../../components/DataTable';
import Field from '../../../components/Field';
import Status from '../../../components/Status';

type Employee = { displayName: string; employeeId: string; status: 'active' | 'inactive'; workplaceId: string };
type Workplace = { id: string; name: string };
type Overview = { employees: { items: Employee[] }; workplaces: Workplace[] };
type Form = { displayName: string; workplaceId: string; monthlySalaryVnd: string; startDate: string };
const initial: Form = { displayName: '', workplaceId: '', monthlySalaryVnd: '', startDate: '' };

function code(response: Response, payload: unknown) {
  return response.ok ? '' : (payload as { code?: string }).code ?? 'ADMIN_UNAVAILABLE';
}

export default function EmployeePanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [form, setForm] = useState<Form>(initial);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);

  const load = async () => {
    const response = await fetch('/api/admin?view=overview', { cache: 'no-store' });
    const payload = await response.json();
    const failure = code(response, payload);
    if (failure) throw new Error(failure);
    const next = payload as Overview;
    setData(next);
    setForm((current) => current.workplaceId ? current : { ...current, workplaceId: next.workplaces[0]?.id ?? '' });
  };
  useEffect(() => {
    let active = true;
    void fetch('/api/admin?view=overview', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw Error('UNAVAILABLE');
      const next = await response.json() as Overview;
      if (active) { setData(next); setForm(current => ({ ...current, workplaceId: next.workplaces[0]?.id ?? '' })); }
    }).catch(() => { if (active) setMessage('Chưa tải được dữ liệu nhân viên. Vui lòng tải lại.'); });
    return () => { active = false; };
  }, []);

  const update = (key: keyof Form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setBusy(true); setMessage('');
    try {
      const session = await fetch('/api/auth/session');
      const { csrfToken } = await session.json() as { csrfToken: string };
      const response = await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ action: 'createEmployee', input: {
        workplaceId: form.workplaceId, displayName: form.displayName, nationality: 'VN', taxResidency: 'resident',
        contract: { kind: 'full_time', templateVersion: 'full_time_12_month_v1', startDate: form.startDate, durationMonths: 12, probationDays: 6 },
        compensation: { basis: 'monthly_salary', monthlySalaryVnd: form.monthlySalaryVnd },
      } }) });
      const payload = await response.json(); const failure = code(response, payload); if (failure) throw new Error(failure);
      setMessage('Đã tạo nhân viên và hợp đồng có hiệu lực.'); setForm((current) => ({ ...initial, workplaceId: current.workplaceId }));
      try { await load(); } catch { setMessage('Đã tạo nhân viên và hợp đồng có hiệu lực. Tải lại danh sách để xem dữ liệu mới nhất.'); }
    } catch (error) {
      const value = error instanceof Error ? error.message : '';
      if (value === 'UNSUPPORTED_EMPLOYMENT_PROFILE') setMessage('Hồ sơ phải là nhân viên Việt Nam cư trú với hợp đồng 12 tháng đã duyệt.');
      else if (value === 'BAD_REQUEST' || value === 'INVALID_COMPENSATION') setMessage('Kiểm tra họ tên, ngày hiệu lực và số tiền VND nguyên trước khi lưu.');
      else { setUnknownOutcome(true); setMessage('Chưa xác nhận được kết quả. Không gửi lại; tải lại danh sách để kiểm tra trước khi tiếp tục.'); }
    }
    finally { setBusy(false); }
  };

  return <main className="page"><header className="page-header"><div><h1>Nhân viên</h1><p>Tạo hồ sơ toàn thời gian bằng dữ liệu tổng hợp và điều khoản có hiệu lực rõ ràng.</p></div><Status tone="muted">{`${data?.employees.items.length ?? 0} hồ sơ`}</Status></header>
    <p className="notice" role={message.includes('Chưa') ? 'alert' : 'status'}>{message || (!data ? 'Đang tải…' : '')}</p>
    <div className="two-column"><section className="card"><h2>Thêm nhân viên toàn thời gian</h2><div className="form-grid"><Field label="Họ và tên"><input value={form.displayName} onChange={(event) => update('displayName', event.target.value)} maxLength={150} required /></Field><Field label="Cơ sở làm việc"><select value={form.workplaceId} onChange={(event) => update('workplaceId', event.target.value)}>{data?.workplaces.map((workplace) => <option key={workplace.id} value={workplace.id}>{workplace.name}</option>)}</select></Field><Field label="Lương tháng (VND)" hint="Số VND nguyên, không dùng số thập phân."><input inputMode="numeric" pattern="[1-9][0-9]*" value={form.monthlySalaryVnd} onChange={(event) => update('monthlySalaryVnd', event.target.value)} required /></Field><Field label="Ngày hiệu lực"><input type="date" value={form.startDate} onChange={(event) => update('startDate', event.target.value)} required /></Field></div><div className="button-row"><Button disabled={busy || unknownOutcome || !form.displayName.trim() || !form.workplaceId || !/^[1-9][0-9]*$/.test(form.monthlySalaryVnd) || !form.startDate} onClick={() => void submit()}>{busy ? 'Đang lưu…' : 'Tạo nhân viên'}</Button></div></section>
      <aside className="card"><h2>Điều khoản sẽ tạo</h2><p>Hợp đồng 12 tháng</p><p>Thử việc 6 ngày</p><p className="field-hint">Mức lương được lưu theo ngày hiệu lực. Các thay đổi sau này phải tạo điều khoản mới.</p></aside></div>
    <section className="card"><h2>Danh sách nhân viên</h2>{data?.employees.items.length ? <DataTable caption="Danh sách nhân viên"><thead><tr><th>Nhân viên</th><th>Cơ sở</th><th>Trạng thái</th></tr></thead><tbody>{data.employees.items.map((employee) => <tr key={employee.employeeId}><td>{employee.displayName}</td><td>{data.workplaces.find((workplace) => workplace.id === employee.workplaceId)?.name ?? 'Cơ sở đã lưu'}</td><td><Status tone={employee.status === 'active' ? 'success' : 'muted'}>{employee.status === 'active' ? 'Đang làm việc' : 'Ngừng hoạt động'}</Status></td></tr>)}</tbody></DataTable> : <p>Chưa có nhân viên. Tạo hồ sơ đầu tiên để bắt đầu duyệt bảng công.</p>}</section>
  </main>;
}
