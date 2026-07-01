let selectedClassId = null;
let currentBilling = null;
let currentUsage = null;
let tierDefaults = null;
let limitOverrides = {};

const LIMIT_FIELDS = [
  {
    key: 'submissionsPerMonth',
    label: 'Submissions per month',
    hint: 'Total team member or student project submissions for this team or class each calendar month.',
  },
  {
    key: 'hostedProjects',
    label: 'Hosted projects',
    hint: 'How many submitted projects can be hosted online at once.',
  },
  {
    key: 'storageMb',
    label: 'Storage limit (MB)',
    hint: 'Team or class pooled storage on Class/Pro tiers; per-team-member-or-student cap on Free tier.',
    storage: true,
  },
  {
    key: 'maxAssetFilesPerStudent',
    label: 'Asset files per team member or student',
    hint: 'Maximum uploaded files in each team member or student personal asset library.',
  },
];

async function initBilling() {
  const enabledRes = await fetch('/api/billing/enabled');
  const enabledData = await enabledRes.json();

  if (enabledData.enabled) {
    document.getElementById('stripe-upgrade').style.display = 'block';
  } else {
    document.getElementById('stripe-off-msg').style.display = 'block';
  }

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

  document.getElementById('save-limits-btn').addEventListener('click', saveClassLimits);
  document.getElementById('reset-overrides-btn').addEventListener('click', resetOverrides);

  const params = new URLSearchParams(location.search);
  if (params.get('classId')) {
    selectedClassId = params.get('classId');
    select.value = selectedClassId;
  }

  if (selectedClassId) await loadBillingSummary();
}

function storageKeyForTier(planTier) {
  const pooledTiers = ['class', 'pro', 'enterprise'];
  return pooledTiers.includes(planTier) ? 'personalStorageMbPooled' : 'personalStorageMbPerStudent';
}

function getStorageMbFromLimits(limits, overrides, defaults) {
  const pooledKey = 'personalStorageMbPooled';
  const perStudentKey = 'personalStorageMbPerStudent';
  if (Object.prototype.hasOwnProperty.call(overrides || {}, pooledKey)) {
    return overrides[pooledKey];
  }
  if (Object.prototype.hasOwnProperty.call(overrides || {}, perStudentKey)) {
    return overrides[perStudentKey];
  }
  if (limits && limits[pooledKey] != null) return limits[pooledKey];
  if (limits && limits[perStudentKey] != null) return limits[perStudentKey];
  if (defaults && defaults[pooledKey] != null) return defaults[pooledKey];
  return defaults && defaults[perStudentKey] != null ? defaults[perStudentKey] : 100;
}

function isUnlimitedValue(value) {
  return value === -1 || value === '-1';
}

function formatLimit(value) {
  return isUnlimitedValue(value) ? 'Unlimited' : String(value);
}

function renderLimitsForm() {
  const form = document.getElementById('limits-form');
  const planTier = (currentBilling && currentBilling.plan_tier) || 'free';
  const limits = (currentUsage && currentUsage.limits) || {};
  const defaults = tierDefaults || (currentUsage && currentUsage.tierDefaults) || {};

  let html = `
    <div class="limit-field" style="grid-column: 1 / -1;">
      <label for="plan-tier-select">Plan tier (defaults)</label>
      <select id="plan-tier-select">
        ${['free', 'class', 'pro', 'enterprise']
          .map(
            (t) =>
              `<option value="${t}" ${t === planTier ? 'selected' : ''}>${t}</option>`
          )
          .join('')}
      </select>
      <div class="hint">Changing tier updates baseline limits. Custom overrides below take precedence.</div>
    </div>
  `;

  for (const field of LIMIT_FIELDS) {
    let effective;
    let overridden = false;
    if (field.storage) {
      const pooledKey = 'personalStorageMbPooled';
      const perKey = 'personalStorageMbPerStudent';
      overridden =
        Object.prototype.hasOwnProperty.call(limitOverrides, pooledKey) ||
        Object.prototype.hasOwnProperty.call(limitOverrides, perKey);
      effective = getStorageMbFromLimits(limits, limitOverrides, defaults);
    } else {
      overridden = Object.prototype.hasOwnProperty.call(limitOverrides, field.key);
      effective = limits[field.key];
    }
    const defaultVal = field.storage
      ? getStorageMbFromLimits(defaults, {}, defaults)
      : defaults[field.key];
    const unlimited = isUnlimitedValue(effective);
    const inputValue = unlimited ? '' : effective != null ? effective : '';

    html += `
      <div class="limit-field" data-limit-key="${field.key}">
        <label>${escapeHtml(field.label)}</label>
        <input type="number" min="0" class="limit-input" data-key="${field.key}" value="${inputValue}" ${unlimited ? 'disabled' : ''} />
        <div class="unlimited-row">
          <label>
            <input type="checkbox" class="limit-unlimited" data-key="${field.key}" ${unlimited ? 'checked' : ''} />
            Unlimited
          </label>
        </div>
        <div class="hint">${escapeHtml(field.hint)}</div>
        <div class="hint">Tier default: ${formatLimit(defaultVal)}</div>
        ${overridden ? '<div class="override-tag">Custom override active</div>' : ''}
      </div>
    `;
  }

  form.innerHTML = html;

  form.querySelectorAll('.limit-unlimited').forEach((cb) => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.key;
      const input = form.querySelector(`.limit-input[data-key="${key}"]`);
      if (!input) return;
      input.disabled = cb.checked;
      if (cb.checked) input.value = '';
    });
  });
}

async function loadBillingSummary() {
  if (!selectedClassId) return;
  const res = await adminFetch(`/admin/billing?classId=${selectedClassId}`);
  const data = await res.json();
  currentBilling = data.billing || {};
  currentUsage = data.usage || {};
  tierDefaults = currentUsage.tierDefaults || {};
  limitOverrides = currentBilling.limit_overrides || currentUsage.limitOverrides || {};

  const tier = currentBilling.plan_tier || 'free';
  const limits = currentUsage.limits || {};
  const u = currentUsage.usage || {};

  const storageLimit = getStorageMbFromLimits(limits, limitOverrides, tierDefaults);
  const storageMb = Math.round((u.classStorageBytes || 0) / 1024 / 1024);
  const storagePct =
    !isUnlimitedValue(storageLimit) && storageLimit > 0
      ? Math.min(100, (storageMb / storageLimit) * 100)
      : 0;

  const submissionsLimit = limits.submissionsPerMonth;
  const hostedLimit = limits.hostedProjects;

  document.getElementById('billing-summary').innerHTML = `
    <p>Plan: <span class="badge">${escapeHtml(tier)}</span>
       ${currentBilling.current_period_end ? `— renews ${new Date(currentBilling.current_period_end).toLocaleDateString()}` : ''}</p>
    <p><strong>Storage used:</strong> ${storageMb} MB / ${formatLimit(storageLimit)}${isUnlimitedValue(storageLimit) ? '' : ' MB'}</p>
    <div class="meter"><div class="meter-fill" style="width:${storagePct}%"></div></div>
    <p><strong>Submissions this month:</strong> ${u.submissionCount || 0}
       / ${formatLimit(submissionsLimit)}</p>
    <p><strong>Hosted projects:</strong> ${u.hostedProjectCount || 0}
       / ${formatLimit(hostedLimit)}</p>
    <p><strong>Asset files (current team member or student context):</strong> ${u.assetFileCount || 0}
       / ${formatLimit(limits.maxAssetFilesPerStudent)}</p>
  `;

  renderLimitsForm();
}

function collectLimitOverrides(planTier) {
  const form = document.getElementById('limits-form');
  const patch = {};

  for (const field of LIMIT_FIELDS) {
    if (field.storage) {
      const cb = form.querySelector(`.limit-unlimited[data-key="${field.key}"]`);
      const input = form.querySelector(`.limit-input[data-key="${field.key}"]`);
      const pooledKey = 'personalStorageMbPooled';
      const perKey = 'personalStorageMbPerStudent';
      const activeKey = storageKeyForTier(planTier);
      const inactiveKey = activeKey === pooledKey ? perKey : pooledKey;
      if (cb && cb.checked) {
        patch[activeKey] = -1;
        patch[inactiveKey] = null;
      } else if (input && input.value !== '') {
        patch[activeKey] = Number(input.value);
        patch[inactiveKey] = null;
      } else {
        patch[activeKey] = null;
        patch[inactiveKey] = null;
      }
      continue;
    }

    const cb = form.querySelector(`.limit-unlimited[data-key="${field.key}"]`);
    const input = form.querySelector(`.limit-input[data-key="${field.key}"]`);
    if (cb && cb.checked) {
      patch[field.key] = -1;
    } else if (input && input.value !== '') {
      patch[field.key] = Number(input.value);
    } else {
      patch[field.key] = null;
    }
  }

  return patch;
}

async function saveClassLimits() {
  const msg = document.getElementById('limits-msg');
  msg.textContent = '';
  msg.className = '';
  if (!selectedClassId) return alert('Select a team or class');

  const planTier = document.getElementById('plan-tier-select').value;
  const limitOverridesPatch = collectLimitOverrides(planTier);

  try {
    const res = await adminFetch('/admin/billing/class-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classId: selectedClassId,
        planTier,
        limitOverrides: limitOverridesPatch,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Save failed');
    msg.textContent = 'Limits saved.';
    msg.className = 'success';
    await loadBillingSummary();
  } catch (err) {
    msg.textContent = err.message || 'Save failed';
    msg.className = 'error';
  }
}

async function resetOverrides() {
  if (!selectedClassId) return;
  if (!confirm('Remove all custom limit overrides for this team or class? Tier defaults will apply.')) return;
  const msg = document.getElementById('limits-msg');
  try {
    const res = await adminFetch('/admin/billing/class-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: selectedClassId, clearOverrides: true }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Reset failed');
    msg.textContent = 'Overrides cleared. Tier defaults restored.';
    msg.className = 'success';
    await loadBillingSummary();
  } catch (err) {
    msg.textContent = err.message || 'Reset failed';
    msg.className = 'error';
  }
}

async function upgradeClass(tier) {
  if (!selectedClassId) return alert('Select a team or class');
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
  if (!selectedClassId) return alert('Select a team or class');
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
  renderAdminNav('billing');
  initBilling();
});
