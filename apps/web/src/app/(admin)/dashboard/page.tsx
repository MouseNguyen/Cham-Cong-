'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Status from '../../../components/Status';

type Overview = {
  employees: { items: unknown[] };
  payRuns: Array<{ id: string; status: string }>;
  productionReady: boolean;
};

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/admin?view=overview', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error((await response.json() as { code?: string }).code ?? 'ADMIN_UNAVAILABLE');
      setOverview(await response.json() as Overview);
    }).catch(() => setError('Chưa tải được hàng việc. Vui lòng tải lại trước khi tiếp tục.'));
  }, []);

  const pending = overview?.payRuns.find((run) => run.status === 'review_pending');
  const approved = overview?.payRuns.find((run) => run.status === 'approved');
  return <main className="page"><header className="page-header"><div><h1>Việc cần làm hôm nay</h1><p>Xem đúng bước tiếp theo cho bảng công và kỳ lương đang xử lý.</p></div><Status tone={overview?.productionReady ? 'success' : 'warning'}>{overview?.productionReady ? 'Sẵn sàng phát hành' : 'Chỉ dữ liệu tổng hợp'}</Status></header>
    {error ? <p className="notice" role="alert">{error}</p> : null}
    {!overview ? <p className="notice" role="status">Đang tải…</p> : <section className="task-list" aria-label="Hàng việc cần xử lý">
      {pending ? <article className="task-card"><h2>Duyệt kỳ lương</h2><p>Kế toán đã gửi kỳ lương. Chủ doanh nghiệp cần kiểm tra trước khi phê duyệt.</p><div className="button-row"><Link className="button" href="/pay-runs">Mở bảng lương chờ duyệt</Link></div></article> : null}
      {approved ? <article className="task-card"><h2>Chốt kỳ lương đã duyệt</h2><p>Chốt sẽ tạo kết quả bất biến. Xác thực hai bước mới là bắt buộc.</p><div className="button-row"><Link className="button" href="/pay-runs">Mở bảng lương đã duyệt</Link></div></article> : null}
      {!pending && !approved ? <article className="task-card"><h2>Chuẩn bị kỳ lương</h2><p>{overview.employees.items.length ? 'Kiểm tra bảng công đã chốt, sau đó tạo kỳ lương.' : 'Tạo hồ sơ nhân viên đầu tiên bằng dữ liệu tổng hợp.'}</p><div className="button-row"><Link className="button" href={overview.employees.items.length ? '/attendance' : '/employees'}>{overview.employees.items.length ? 'Duyệt bảng công' : 'Thêm nhân viên'}</Link></div></article> : null}
    </section>}
  </main>;
}
