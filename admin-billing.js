let selectedClassId = null;

async function initBilling() {
  const enabledRes = await fetch('/api/billing/enabled');
  const enabledData = await enabledRes.json();
  if (!enabledData.enabled) {
    document.getElementById('stripe-off-msg').style.display = 'block';
    return;
  }
  document.getElementById('billing-ui').style.display = 'block';

  const res = await adminFetch('/admin/billing');
  const data = await res.json();
  const select = document.getElementById('billing-class-select');
  select.innerHTML = (data.classes || [])
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');
  selectedClassId = (data.classes && data.classes[0] && data.classes[0].id) || null;
  select.addEventListener('change', () => {
    selectedClassId = select.value;
    loadBillingSummary();
  });
  if (selectedClassId) await loadBillingSummary();

  const params = new URLSearchParams(location.search);
  if (params.get('classId')) {
    selectedClassId = params.get('classId');
    select.value = selectedClassId;
    await loadBillingSummary();
  }
}

async function loadBillingSummary() {
  if (!selectedClassId) return;
  const res = await adminFetch(`/admin/billing?classId=${selectedClassId}`);
  const data = await res.json();
  const tier = (data.billing && data.billing.plan_tier) || 'free';
  const usage = data.usage || {};
  const limits = usage.limits || {};
  const u = usage.usage || {};

  const storageLimit = limits.personalStorageMbPooled || (limits.personalStorageMbPerStudent * 100) || 100;
  const storageMb = Math.round((u.classStorageBytes || 0) / 1024 / 1024);
  const storagePct = storageLimit > 0 ? Math.min(100, (storageMb / storageLimit) * 100) : 0;

  document.getElementById('billing-summary').innerHTML = `
    <p>Plan: <span class="badge">${tier}</span>
       ${data.billing && data.billing.current_period_end ? `— renews ${new Date(data.billing.current_period_end).toLocaleDateString()}` : ''}</p>
    <p><strong>Storage used:</strong> ${storageMb} MB / ${storageLimit} MB</p>
    <div class="meter"><div class="meter-fill" style="width:${storagePct}%"></div></div>
    <p><strong>Submissions this month:</strong> ${u.submissionCount || 0}
       ${limits.submissionsPerMonth > 0 ? `/ ${limits.submissionsPerMonth}` : ''}</p>
    <p><strong>Hosted projects:</strong> ${u.hostedProjectCount || 0}
       ${limits.hostedProjects >= 0 ? `/ ${limits.hostedProjects}` : ''}</p>
  `;
}

async function upgradeClass(tier) {
  if (!selectedClassId) return alert('Select a class');
  const res = await adminFetch('/admin/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId: selectedClassId, tier }),
  });
  const data = await res.json();
  if (!data.success) return alert(data.message);
  window.location.href = data.url;
}

async function openPortal() {
  if (!selectedClassId) return alert('Select a class');
  const res = await adminFetch('/admin/billing/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId: selectedClassId }),
  });
  const data = await res.json();
  if (!data.success) return alert(data.message);
  window.location.href = data.url;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.upgradeClass = upgradeClass;
window.openPortal = openPortal;

requireAdminSession('admin-gate', () => {
  document.getElementById('admin-gate').style.display = 'none';
  document.getElementById('admin-content').style.display = 'block';
  initBilling();
});
