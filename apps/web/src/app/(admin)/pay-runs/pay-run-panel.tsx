'use client';

import { useEffect, useState } from 'react';
import Button from '../../../components/Button';
import DataTable from '../../../components/DataTable';
import Dialog from '../../../components/Dialog';
import Money from '../../../components/Money';
import Status from '../../../components/Status';
import StepFlow from '../../../components/StepFlow';
import TracePanel from '../../../components/TracePanel';
import Field from '../../../components/Field';

type RunStatus = 'draft' | 'calculated' | 'review_pending' | 'approved' | 'finalized';
type Run = { id: string; periodEnd: string; periodStart: string; status: RunStatus; version: number; workplaceId: string };
type Employee = { employee_id: string; canonical_result: string; result_hash: string };
type Evidence = { employee_id: string; display_name: string; snapshot_id: string; snapshot_hash: string; compensation_id: string; compensation_hash: string; rule_pack_id: string; rule_pack_hash: string; calculator_version: string; calculator_artifact_hash: string; canonicalization_version: string; input_hash: string; result_hash: string; canonical_input: string };
type Detail = { id: string; period_end: string; period_start: string; status: RunStatus; version: number; workplace_id: string; employees: Employee[]; evidence: Evidence[] };
type Source = { employeeId: string; snapshotId: string; snapshotHash: string; compensationId: string; compensationHash: string; rulePackId: string; rulePackHash: string; displayName: string };
type Overview = { actor: { role: 'owner' | 'accountant' }; calculator: { available: boolean; periodEnd: string | null; periodStart: string | null }; payRuns: Run[]; workplaces: Array<{ id: string; name: string }> };
const Vietnamese: Record<RunStatus, 'Nháp' | 'Đã tính' | 'Chờ duyệt' | 'Đã duyệt' | 'Đã chốt'> = { draft: 'Nháp', calculated: 'Đã tính', review_pending: 'Chờ duyệt', approved: 'Đã duyệt', finalized: 'Đã chốt' };

function errorCode(response: Response, payload: unknown) {
  return response.ok ? '' : (payload as { code?: string }).code ?? 'ADMIN_UNAVAILABLE';
}

function periodLabel(start: string | null) {
  if (!start) return 'tháng đã chọn';
  const parts = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', month: '2-digit', year: 'numeric' }).formatToParts(new Date(start));
  return `tháng ${parts.find((part) => part.type === 'month')?.value}/${parts.find((part) => part.type === 'year')?.value}`;
}

function StoredEvidence({ rows }: { rows: Evidence[] }) {
  return <section aria-label="Bằng chứng tính lương đã lưu"><h3>Bằng chứng đã lưu</h3>{rows.map(row => <article key={row.employee_id}><h4>{row.display_name}</h4><dl>
    <dt>Bảng công / SHA-256</dt><dd>{row.snapshot_id} / {row.snapshot_hash}</dd>
    <dt>Điều khoản lương / SHA-256</dt><dd>{row.compensation_id} / {row.compensation_hash}</dd>
    <dt>Gói quy tắc tổng hợp / SHA-256</dt><dd>{row.rule_pack_id} / {row.rule_pack_hash}</dd>
    <dt>Phiên bản bộ tính / mã chuẩn hóa</dt><dd>{row.calculator_version} / {row.canonicalization_version}</dd>
    <dt>SHA-256 bộ tính</dt><dd>{row.calculator_artifact_hash}</dd>
    <dt>SHA-256 đầu vào</dt><dd>{row.input_hash}</dd>
    <dt>SHA-256 kết quả</dt><dd>{row.result_hash}</dd>
  </dl><details><summary>Đầu vào và phiên bản quy tắc đã lưu</summary><pre>{row.canonical_input}</pre></details></article>)}</section>;
}

export default function PayRunPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [trace, setTrace] = useState<unknown[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [confirm, setConfirm] = useState<RunStatus | null>(null);
  const [finalAck, setFinalAck] = useState(false);
  const [workplaceId, setWorkplaceId] = useState('');
  const [sourceBlockers, setSourceBlockers] = useState<string[]>([]);

  const loadOverview = async () => {
    const response = await fetch('/api/admin?view=overview', { cache: 'no-store' });
    const payload = await response.json(); const failure = errorCode(response, payload); if (failure) throw new Error(failure);
    const next = payload as Overview;
    setOverview(next);
    setWorkplaceId((current) => current || next.workplaces[0]?.id || '');
  };
  const openRun = async (id: string) => {
    const response = await fetch(`/api/admin?view=payRun&payRunId=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const payload = await response.json(); const failure = errorCode(response, payload); if (failure) throw new Error(failure);
    const detail = payload as Detail;
    let blockers: string[] = [];
    if (detail.status === 'draft') {
      const sourceResponse = await fetch(`/api/admin?view=sources&payRunId=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const sourcePayload = await sourceResponse.json() as { blockers?: string[] };
      blockers = sourceResponse.ok ? sourcePayload.blockers ?? [] : ['SOURCE_REVIEW_REQUIRED'];
    }
    setSourceBlockers(blockers); setSelected(detail); setTrace(null);
  };
  useEffect(() => {
    let active = true;
    void fetch('/api/admin?view=overview', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw Error('UNAVAILABLE');
      const value = await response.json() as Overview;
      if (active) { setOverview(value); setWorkplaceId(value.workplaces[0]?.id ?? ''); }
    }).catch(() => { if (active) setMessage('Chưa tải được kỳ lương. Vui lòng tải lại trước khi tiếp tục.'); });
    return () => { active = false; };
  }, []);

  const mutate = async (action: 'createPayRun' | 'calculatePayRun' | 'submitPayRun' | 'approvePayRun' | 'finalizePayRun', confirmed = false) => {
    if (!overview || busy || unknownOutcome) return;
    setBusy(true); setMessage('');
    try {
      const session = await fetch('/api/auth/session');
      const { csrfToken } = await session.json() as { csrfToken: string };
      let input: Record<string, unknown>;
      if (action === 'createPayRun') {
        if (!workplaceId || !overview.calculator.periodStart || !overview.calculator.periodEnd) throw new Error('CALCULATOR_PERIOD_UNAVAILABLE');
        input = { workplaceId, periodStart: overview.calculator.periodStart, periodEnd: overview.calculator.periodEnd };
      } else {
        if (!selected) throw new Error('PAY_RUN_REQUIRED');
        input = { payRunId: selected.id, expectedVersion: selected.version };
        if (action === 'calculatePayRun') {
          const sourceResponse = await fetch(`/api/admin?view=sources&payRunId=${encodeURIComponent(selected.id)}`, { cache: 'no-store' });
          const sourcePayload = await sourceResponse.json() as { blockers?: string[]; sources?: Source[] };
          const sourceFailure = errorCode(sourceResponse, sourcePayload);
          if (sourceFailure) throw new Error(sourceFailure);
          if (!sourcePayload.sources?.length || sourcePayload.blockers?.length) throw new Error('SOURCE_REVIEW_REQUIRED');
          input = { ...input, sources: sourcePayload.sources };
        }
      }
      const response = await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ action, confirmed, input }) });
      const payload = await response.json(); const failure = errorCode(response, payload); if (failure) throw new Error(failure);
      await loadOverview();
      if (action === 'createPayRun') await openRun((payload as { id: string }).id);
      else if (selected) await openRun(selected.id);
      setMessage(action === 'createPayRun' ? 'Đã tạo bản nháp kỳ lương.' : action === 'calculatePayRun' ? 'Đã tính và lưu kết quả.' : action === 'submitPayRun' ? 'Đã gửi chủ doanh nghiệp duyệt.' : action === 'approvePayRun' ? 'Đã duyệt kỳ lương. Chốt yêu cầu xác thực lại.' : 'Đã chốt kỳ lương. Kết quả không thể sửa.');
    } catch (error) {
      setUnknownOutcome(true);
      const value = error instanceof Error ? error.message : '';
      setMessage(value === 'SOURCE_REVIEW_REQUIRED' ? 'Không thể tính lương: cần kiểm tra đầy đủ bảng công, hợp đồng và quy tắc đã phát hành.' : value === 'FRESH_TOTP_REQUIRED' ? 'Cần xác thực hai bước mới trước khi chốt.' : 'Chưa xác nhận được thay đổi. Tải lại kỳ lương trước khi thử lại.');
    } finally { setBusy(false); setConfirm(null); setFinalAck(false); }
  };
  const revealTrace = async () => {
    if (!selected?.employees.length) return;
    try { setTrace(selected.employees.map((employee) => ({ employeeId: employee.employee_id, lines: (JSON.parse(employee.canonical_result) as { lines?: unknown[] }).lines ?? [] }))); }
    catch { setMessage('Chưa tải được giải thích tính lương.'); }
  };
  const selectedStatus = selected ? Vietnamese[selected.status] : 'Nháp';
  const isMaker = overview?.actor.role === 'accountant';
  const next = selected?.status === 'draft' && isMaker ? ['Tính lương', 'calculatePayRun'] as const : selected?.status === 'calculated' && isMaker ? ['Gửi chủ doanh nghiệp duyệt', 'submitPayRun'] as const : selected?.status === 'review_pending' && overview?.actor.role === 'owner' ? ['Phê duyệt bảng lương', 'approvePayRun'] as const : selected?.status === 'approved' && overview?.actor.role === 'owner' ? ['Chốt bảng lương', 'finalizePayRun'] as const : null;

  return <main className="page"><header className="page-header"><div><h1>Kỳ lương</h1><p>Chọn đúng nguồn đã chốt, lưu kết quả tính, sau đó duyệt theo vai trò.</p></div><Status tone={overview?.calculator.available ? 'success' : 'warning'}>{overview?.calculator.available ? 'Sẵn sàng tính lương' : 'Phiếu lương chưa sẵn sàng'}</Status></header>
    <p className="notice" role={message.includes('Chưa') || message.includes('Không thể') ? 'alert' : 'status'}>{message || (!overview ? 'Đang tải…' : '')}</p>
    <section className="card"><h2>Kỳ lương hiện có</h2>{overview?.payRuns.length ? <DataTable caption="Danh sách kỳ lương"><thead><tr><th>Kỳ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{overview.payRuns.map((run) => <tr key={run.id}><td>{periodLabel(run.periodStart)}</td><td><Status tone={run.status === 'finalized' ? 'success' : run.status === 'review_pending' ? 'warning' : 'muted'}>{Vietnamese[run.status]}</Status></td><td><Button variant="secondary" onClick={() => void openRun(run.id).catch(() => setMessage('Chưa tải được kỳ lương. Vui lòng tải lại.'))}>{run.status === 'review_pending' ? 'Mở bảng lương chờ duyệt' : run.status === 'approved' ? 'Mở bảng lương đã duyệt' : 'Mở kỳ lương'}</Button></td></tr>)}</tbody></DataTable> : <p>Chưa có kỳ lương. Tạo bản nháp sau khi bảng công đã chốt.</p>}
      {!selected && isMaker && overview?.calculator.available ? <div className="button-row"><Field label="Cơ sở làm việc"><select value={workplaceId} onChange={(event) => setWorkplaceId(event.target.value)}>{overview.workplaces.map((workplace) => <option key={workplace.id} value={workplace.id}>{workplace.name}</option>)}</select></Field><Button disabled={busy || unknownOutcome || !workplaceId} onClick={() => void mutate('createPayRun')}>Tạo bảng lương {periodLabel(overview.calculator.periodStart)}</Button></div> : null}</section>
    {selected ? <section className="card"><div className="page-header"><div><h2>Kỳ lương {periodLabel(selected.period_start)}</h2><p>Phiên bản {selected.version} · kết quả và bằng chứng được lưu cùng kỳ lương.</p></div><Status tone={selected.status === 'finalized' ? 'success' : selected.status === 'review_pending' ? 'warning' : 'muted'}>{selectedStatus}</Status></div><StepFlow current={selectedStatus} />
      {selected.employees.length ? <DataTable caption="Kết quả nhân viên"><thead><tr><th>Nhân viên</th><th>Gross</th><th>Khấu trừ</th><th>Net</th></tr></thead><tbody>{selected.employees.map((employee) => { const result = JSON.parse(employee.canonical_result) as { gross?: string; net?: string; employeeInsuranceTotal?: string; pit?: string }; return <tr key={employee.employee_id}><td>{selected.evidence.find(row => row.employee_id === employee.employee_id)?.display_name ?? employee.employee_id}</td><td><Money amount={result.gross ?? '0'} /></td><td><Money amount={String(BigInt(result.employeeInsuranceTotal ?? '0') + BigInt(result.pit ?? '0'))} /></td><td><Money amount={result.net ?? '0'} /></td></tr>; })}</tbody></DataTable> : null}
      {selected.status === 'draft' && sourceBlockers.length ? <p className="notice" role="alert">Không thể tính lương: {sourceBlockers.join(' · ')}</p> : null}
      {selected.status === 'calculated' || selected.status === 'review_pending' || selected.status === 'approved' || selected.status === 'finalized' ? <div className="button-row"><Button variant="secondary" onClick={() => void revealTrace()}>Xem giải thích tính lương</Button></div> : null}
      {next ? <div className="button-row"><Button disabled={busy || unknownOutcome || (next[1] === 'calculatePayRun' && sourceBlockers.length > 0)} onClick={() => next[1] === 'approvePayRun' || next[1] === 'finalizePayRun' ? setConfirm(selected.status) : void mutate(next[1])}>{next[0]}</Button>{selected.status === 'approved' ? <a className="field-hint" href="/login/totp">Xác thực lại trước khi chốt</a> : null}</div> : null}
      {selected.status === 'finalized' ? <p><strong>Kết quả đã lưu</strong> · Kỳ lương đã chốt bất biến. Phiếu lương chưa sẵn sàng.</p> : null}
    </section> : null}
    <Dialog name={confirm === 'approved' ? 'Xác nhận chốt bảng lương' : 'Xác nhận duyệt bảng lương'} open={confirm !== null} onClose={() => setConfirm(null)}><h2>{confirm === 'approved' ? 'Xác nhận chốt bảng lương' : 'Xác nhận duyệt bảng lương'}</h2><p>{confirm === 'approved' ? 'Kết quả tính và nguồn đã lưu sẽ trở thành bất biến.' : 'Xác nhận bạn đã kiểm tra nguồn, tổng tiền và giải thích tính lương.'}</p>{confirm === 'approved' ? <label className="field"><span>Tôi hiểu bảng lương sẽ được chốt bất biến</span><input type="checkbox" checked={finalAck} onChange={(event) => setFinalAck(event.target.checked)} /></label> : null}<div className="button-row"><Button variant="secondary" onClick={() => setConfirm(null)}>Hủy</Button><Button disabled={busy || unknownOutcome || (confirm === 'approved' && !finalAck)} onClick={() => void mutate(confirm === 'approved' ? 'finalizePayRun' : 'approvePayRun', true)}>{confirm === 'approved' ? 'Xác nhận chốt' : 'Xác nhận duyệt'}</Button></div></Dialog>
    <Dialog name="Giải thích tính lương" open={trace !== null} onClose={() => setTrace(null)}><h2>Giải thích tính lương</h2><TracePanel><StoredEvidence rows={selected?.evidence ?? []} />{trace?.length ? <ol>{trace.map((entry, index) => { const item = entry as { employeeId: string; lines: Array<{ labelVi?: string; formula?: string; roundedAmountVnd?: string; operands?: Record<string, string | number | boolean> }> }; return <li key={item.employeeId || index}><strong>Nhân viên {item.employeeId}</strong><ul>{item.lines.map((line, lineIndex) => <li key={lineIndex}>{line.labelVi ?? 'Khoản tính'} · {line.formula ?? 'Công thức đã lưu'} · {line.roundedAmountVnd ?? '0'} VND · {Object.entries(line.operands ?? {}).map(([key, value]) => `${key}: ${String(value)}`).join(', ')}</li>)}</ul></li>; })}</ol> : <p>Chưa có dòng giải thích khả dụng.</p>}</TracePanel><div className="button-row"><Button variant="secondary" onClick={() => setTrace(null)}>Đóng</Button></div></Dialog>
  </main>;
}
